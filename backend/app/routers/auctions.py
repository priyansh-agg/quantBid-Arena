"""Auction engine:
  - Place bid (with increment validation + balance check)
  - End auction (declare winner, deduct QM, start solving phase)
  - Re-auction (admin trigger — halve values, block previous team)
  - Close question (admin trigger — permanently close with no re-auction)
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status

from app.game_state import manager
from app.helpers import (
    fetch_full_state,
    get_min_increment,
    get_question_or_404,
    get_team_or_404,
    log_transaction,
    normalize_question,
)
from app.models import BidIn, QuestionOut
from app.supabase_client import supabase

router = APIRouter(prefix="/api/auctions", tags=["auctions"])

MAX_RE_AUCTIONS = 1  # Limit re-auctions to 1 per question


# ──────────────────────────────────────────────────────────
# Place Bid
# ──────────────────────────────────────────────────────────

@router.post("/{question_id}/bid", response_model=QuestionOut)
async def place_bid(question_id: int, payload: BidIn) -> QuestionOut:
    q = get_question_or_404(question_id)

    if q.get("status") != "BIDDING":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Question is not currently in BIDDING state.",
        )

    # Excluded team check
    excluded = q.get("excluded_team_ids") or []
    if isinstance(excluded, list) and payload.team_id in [int(x) for x in excluded]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This team is excluded from bidding on this question.",
        )

    team = get_team_or_404(payload.team_id)
    current_balance = int(team.get("balance") or 0)

    # Balance check — team must be able to afford the bid
    if payload.amount > current_balance:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient QM. Available: {current_balance}, Bid: {payload.amount}.",
        )

    current_bid_amount = q.get("current_bid_amount")
    current_bid_team = q.get("current_bid_team_id")

    if current_bid_team is None:
        # First bid — must be >= base_amount
        base = int(q.get("base_amount") or 0)
        if payload.amount < base:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"First bid must be at least the base price of {base} QM.",
            )
    else:
        # Subsequent bid — must be at least current + increment
        current_bid_int = int(current_bid_amount or 0)
        min_inc = get_min_increment(current_bid_int)
        min_required = current_bid_int + min_inc
        if payload.amount < min_required:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Bid too low. Current bid: {current_bid_int} QM. "
                    f"Minimum increment: {min_inc} QM. "
                    f"Minimum valid bid: {min_required} QM."
                ),
            )

    # Record the bid in the bids table
    try:
        supabase.table("bids").insert({
            "question_id": question_id,
            "team_id": payload.team_id,
            "amount": payload.amount,
        }).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to record bid: {exc}") from exc

    # Update current highest bid on the question (no optimistic lock on null fields)
    try:
        q_resp = (
            supabase.table("questions")
            .update({
                "current_bid_amount": payload.amount,
                "current_bid_team_id": payload.team_id,
            })
            .eq("id", question_id)
            .eq("status", "BIDDING")
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update bid on question: {exc}") from exc

    rows = q_resp.data or []
    if not rows:
        raise HTTPException(status_code=409, detail="Bid update failed — question status may have changed.")

    await manager.broadcast(fetch_full_state())
    return normalize_question(rows[0])


# ──────────────────────────────────────────────────────────
# End Auction — Declare winner, deduct QM, start SOLVING
# ──────────────────────────────────────────────────────────

@router.post("/{question_id}/end", response_model=QuestionOut)
async def end_auction(question_id: int) -> QuestionOut:
    q = get_question_or_404(question_id)

    if q.get("status") != "BIDDING":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Question is not in BIDDING state.",
        )

    winning_team_id = q.get("current_bid_team_id")
    winning_bid = int(q.get("current_bid_amount") or 0)

    if winning_team_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No bids have been placed yet. Cannot end auction without a winner.",
        )

    # Deduct QM from winning team
    team = get_team_or_404(int(winning_team_id))
    current_balance = int(team.get("balance") or 0)

    if current_balance < winning_bid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Winning team has insufficient QM ({current_balance}) to cover bid ({winning_bid}).",
        )

    new_balance = current_balance - winning_bid

    try:
        supabase.table("teams").update({"balance": new_balance}).eq("id", winning_team_id).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to deduct QM: {exc}") from exc

    log_transaction(
        team_id=int(winning_team_id),
        type_="bid_win",
        qm_delta=-winning_bid,
        description=f"Won auction for Q{question_id} at {winning_bid} QM",
    )

    # Transition question to SOLVING
    now_iso = datetime.now(timezone.utc).isoformat()
    time_limit = int(q.get("time_limit_seconds") or 30)

    try:
        q_resp = (
            supabase.table("questions")
            .update({
                "status": "SOLVING",
                "assigned_team_id": winning_team_id,
                "active_time_seconds": time_limit,
                "solve_started_at": now_iso,
            })
            .eq("id", question_id)
            .eq("status", "BIDDING")
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update question status: {exc}") from exc

    rows = q_resp.data or []
    if not rows:
        raise HTTPException(status_code=500, detail="Question update returned no rows.")

    # Keep the arena pointing at this question through the SOLVING phase,
    # but do NOT change the arena phase — host controls that explicitly.
    manager.set_current_question(question_id)

    await manager.broadcast(fetch_full_state())
    return normalize_question(rows[0])


# ──────────────────────────────────────────────────────────
# Re-Auction — Admin trigger after FAILED
# ──────────────────────────────────────────────────────────

@router.post("/{question_id}/re-auction", response_model=QuestionOut)
async def trigger_re_auction(question_id: int) -> QuestionOut:
    q = get_question_or_404(question_id)

    if q.get("status") != "FAILED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Re-auction can only be triggered for FAILED questions.",
        )

    re_count = int(q.get("re_auction_count") or 0)
    if re_count >= MAX_RE_AUCTIONS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Maximum re-auctions ({MAX_RE_AUCTIONS}) already reached for this question.",
        )

    # Preserve originals on first re-auction
    original_base = q.get("original_base_price") or int(q.get("base_amount") or 0)
    original_rp = q.get("original_reward_points") or int(q.get("reward_points") or 0)
    original_tl = q.get("original_time_limit") or int(q.get("time_limit_seconds") or 30)

    # Halve current values
    current_base = int(q.get("base_amount") or 0)
    current_rp_val = int(q.get("reward_points") or 0)
    current_tl = int(q.get("time_limit_seconds") or 30)
    new_base = max(1, current_base // 2)
    new_rp = max(1, current_rp_val // 2)
    new_tl = max(10, current_tl // 2)

    # Add the previously failing team to excluded list
    previous_team_id = q.get("assigned_team_id")
    excluded_raw = q.get("excluded_team_ids") or []
    excluded = list({int(x) for x in excluded_raw})
    if previous_team_id is not None and int(previous_team_id) not in excluded:
        excluded.append(int(previous_team_id))

    # Wipe bids for this question
    try:
        supabase.table("bids").delete().eq("question_id", question_id).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to clear bids: {exc}") from exc

    update_payload = {
        "status": "BIDDING",
        "base_amount": new_base,
        "reward_points": new_rp,
        "time_limit_seconds": new_tl,
        "active_time_seconds": new_tl,
        "original_base_price": original_base,
        "original_reward_points": original_rp,
        "original_time_limit": original_tl,
        "re_auction_count": re_count + 1,
        "excluded_team_ids": excluded,
        "current_bid_amount": new_base,
        "current_bid_team_id": None,
        "assigned_team_id": None,
        "double_reward_team_id": None,
        "solve_started_at": None,
    }

    try:
        q_resp = (
            supabase.table("questions")
            .update(update_payload)
            .eq("id", question_id)
            .eq("status", "FAILED")
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to trigger re-auction: {exc}") from exc

    rows = q_resp.data or []
    if not rows:
        raise HTTPException(status_code=500, detail="Re-auction update returned no rows.")

    # Re-auction restarts this question as active — pin it but don't change phase.
    manager.set_current_question(question_id)

    await manager.broadcast(fetch_full_state())
    return normalize_question(rows[0])


# ──────────────────────────────────────────────────────────
# Close Question — Admin trigger (permanent close)
# ──────────────────────────────────────────────────────────

@router.post("/{question_id}/close", response_model=QuestionOut)
async def close_question(question_id: int) -> QuestionOut:
    q = get_question_or_404(question_id)

    closeable_states = {"FAILED", "RE_AUCTION_PENDING", "BIDDING", "AVAILABLE"}
    if q.get("status") in ("SOLVED", "CLOSED"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Question is already resolved.",
        )
    if q.get("status") not in closeable_states:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot close question in state: {q.get('status')}.",
        )

    try:
        q_resp = (
            supabase.table("questions")
            .update({"status": "CLOSED", "is_used": True})
            .eq("id", question_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to close question: {exc}") from exc

    rows = q_resp.data or []
    if not rows:
        raise HTTPException(status_code=500, detail="Close returned no rows.")

    await manager.broadcast(fetch_full_state())
    return normalize_question(rows[0])
