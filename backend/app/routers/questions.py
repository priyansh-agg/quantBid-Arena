"""Questions router.

Endpoints:
  - GET    /api/questions               list all questions
  - GET    /api/questions/{id}          get single question
  - PATCH  /api/questions/{id}/usage    toggle is_used (legacy)
  - POST   /api/questions/{id}/start-auction   → AVAILABLE → BIDDING
  - POST   /api/questions/{id}/solve    → SOLVING → SOLVED or FAILED
  - PATCH  /api/questions/{id}/timer    modify active_time_seconds (mid-solve)
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.game_state import manager
from app.helpers import (
    fetch_full_state,
    get_question_or_404,
    get_team_or_404,
    log_transaction,
    normalize_question,
)
from app.models import QuestionOut, QuestionUsageUpdateIn, SolveIn, TimerModifyIn
from app.supabase_client import supabase

router = APIRouter(prefix="/api/questions", tags=["questions"])


# ──────────────────────────────────────────────────────────
# List / Get
# ──────────────────────────────────────────────────────────

@router.get("", response_model=list[QuestionOut])
def get_questions() -> list[QuestionOut]:
    try:
        response = supabase.table("questions").select("*").order("id").execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch questions: {exc}") from exc

    return [normalize_question(row) for row in (response.data or [])]


@router.get("/{question_id}", response_model=QuestionOut)
def get_question(question_id: int) -> QuestionOut:
    return normalize_question(get_question_or_404(question_id))


# ──────────────────────────────────────────────────────────
# Usage toggle (legacy / admin convenience)
# ──────────────────────────────────────────────────────────

@router.patch("/{question_id}/usage", response_model=QuestionOut)
async def set_question_usage(question_id: int, payload: QuestionUsageUpdateIn) -> QuestionOut:
    get_question_or_404(question_id)
    try:
        response = (
            supabase.table("questions")
            .update({"is_used": payload.is_used})
            .eq("id", question_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update question usage: {exc}") from exc

    rows = response.data or []
    if not rows:
        raise HTTPException(status_code=500, detail="Question update returned no rows.")

    await manager.broadcast(fetch_full_state())
    return normalize_question(rows[0])


# ──────────────────────────────────────────────────────────
# Start Auction  AVAILABLE → BIDDING
# ──────────────────────────────────────────────────────────

@router.post("/{question_id}/start-auction", response_model=QuestionOut)
async def start_auction(question_id: int) -> QuestionOut:
    q = get_question_or_404(question_id)

    if q.get("status") != "AVAILABLE":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot start auction. Current status: {q.get('status')}. "
                   "Question must be AVAILABLE.",
        )

    base = int(q.get("base_amount") or 0)
    tl = int(q.get("time_limit_seconds") or 30)

    try:
        q_resp = (
            supabase.table("questions")
            .update({
                "status": "BIDDING",
                "current_bid_amount": base,
                "current_bid_team_id": None,
                "active_time_seconds": tl,
                "solve_started_at": None,
                "assigned_team_id": None,
                "double_reward_team_id": None,
            })
            .eq("id", question_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to start auction: {exc}") from exc

    rows = q_resp.data or []
    if not rows:
        raise HTTPException(status_code=500, detail="Start auction returned no rows.")

    # Clear any stale bids from previous rounds
    try:
        supabase.table("bids").delete().eq("question_id", question_id).execute()
    except Exception:
        pass

    await manager.broadcast(fetch_full_state())
    return normalize_question(rows[0])


# ──────────────────────────────────────────────────────────
# Solve  SOLVING → SOLVED or FAILED
# ──────────────────────────────────────────────────────────

@router.post("/{question_id}/solve", response_model=QuestionOut)
async def solve_question(question_id: int, payload: SolveIn) -> QuestionOut:
    q = get_question_or_404(question_id)

    if q.get("status") != "SOLVING":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Question is not in SOLVING state (current: {q.get('status')}).",
        )

    winning_team_id = q.get("assigned_team_id")
    if winning_team_id is None:
        raise HTTPException(status_code=500, detail="No assigned team for this question.")

    double_reward_active = (q.get("double_reward_team_id") == winning_team_id)

    if payload.correct:
        # Award Reward Points
        base_rp = int(q.get("reward_points") or 0)
        awarded_rp = base_rp * 2 if double_reward_active else base_rp

        team = get_team_or_404(int(winning_team_id))
        current_rp = int(team.get("score") or 0)
        new_rp = current_rp + awarded_rp

        try:
            supabase.table("teams").update({"score": new_rp}).eq("id", winning_team_id).execute()
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to award RP: {exc}") from exc

        log_transaction(
            team_id=int(winning_team_id),
            type_="rp_award",
            rp_delta=awarded_rp,
            description=f"Solved Q{question_id} ({'Double Reward' if double_reward_active else 'Normal'})",
        )

        new_status = "SOLVED"
        is_used = True
    else:
        # Wrong answer or timeout
        if double_reward_active:
            # Penalty: 2 × bid amount deducted from QM
            bid_amount = int(q.get("current_bid_amount") or 0)
            penalty_qm = bid_amount * 2

            team = get_team_or_404(int(winning_team_id))
            current_balance = int(team.get("balance") or 0)
            new_balance = current_balance - penalty_qm  # Can go negative (per power card rules)

            try:
                supabase.table("teams").update({"balance": new_balance}).eq(
                    "id", winning_team_id
                ).execute()
            except Exception as exc:
                raise HTTPException(status_code=500, detail=f"Failed to apply Double Reward penalty: {exc}") from exc

            log_transaction(
                team_id=int(winning_team_id),
                type_="power_penalty",
                qm_delta=-penalty_qm,
                description=f"Double Reward wrong answer penalty on Q{question_id}",
            )

        new_status = "FAILED"
        is_used = False

    try:
        q_resp = (
            supabase.table("questions")
            .update({"status": new_status, "is_used": is_used})
            .eq("id", question_id)
            .eq("status", "SOLVING")
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update question status: {exc}") from exc

    rows = q_resp.data or []
    if not rows:
        raise HTTPException(status_code=500, detail="Solve update returned no rows.")

    await manager.broadcast(fetch_full_state())
    return normalize_question(rows[0])


# ──────────────────────────────────────────────────────────
# Modify Timer (admin — before or during solving)
# ──────────────────────────────────────────────────────────

@router.patch("/{question_id}/timer", response_model=QuestionOut)
async def modify_timer(question_id: int, payload: TimerModifyIn) -> QuestionOut:
    q = get_question_or_404(question_id)

    allowed_states = {"BIDDING", "SOLVING", "SOLD", "AVAILABLE"}
    if q.get("status") not in allowed_states:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot modify timer in state {q.get('status')}.",
        )

    from datetime import datetime, timezone
    now_iso = datetime.now(timezone.utc).isoformat()

    update: dict = {"active_time_seconds": payload.seconds}
    if q.get("status") in {"AVAILABLE", "BIDDING"}:
        # Keep editable default solving time before purchase.
        update["time_limit_seconds"] = payload.seconds
    # If currently solving, reset the start clock so the new time takes effect from now
    if q.get("status") == "SOLVING":
        update["solve_started_at"] = now_iso

    try:
        q_resp = (
            supabase.table("questions")
            .update(update)
            .eq("id", question_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to modify timer: {exc}") from exc

    rows = q_resp.data or []
    if not rows:
        raise HTTPException(status_code=500, detail="Timer update returned no rows.")

    await manager.broadcast(fetch_full_state())
    return normalize_question(rows[0])
