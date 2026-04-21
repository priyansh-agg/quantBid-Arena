"""Power card endpoints.

Each team may use each power card exactly once, at any time during SOLVING.

1. Extra 1 Minute — adds 60 seconds to active_time_seconds
2. Double Reward  — if correct: ×2 RP; if wrong: deduct 2×bid from QM
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.game_state import manager
from app.helpers import (
    fetch_full_state,
    get_question_or_404,
    get_team_or_404,
    normalize_power_card,
)
from app.models import PowerCardOut, PowerCardUseIn
from app.supabase_client import supabase

router = APIRouter(prefix="/api/power-cards", tags=["power-cards"])


def _is_missing_table_error(exc: Exception) -> bool:
    text = str(exc)
    return "PGRST205" in text or "Could not find the table 'public.power_cards'" in text


def _get_power_card_or_404(team_id: int) -> dict:
    try:
        resp = (
            supabase.table("power_cards")
            .select("*")
            .eq("team_id", team_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        if _is_missing_table_error(exc):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Power cards are not configured yet. Run the Supabase migration to create public.power_cards.",
            ) from exc
        raise HTTPException(status_code=500, detail=f"Failed to fetch power card: {exc}") from exc

    rows = resp.data or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No power card record for team {team_id}. Has the DB migration been run?",
        )
    return rows[0]


# ──────────────────────────────────────────────────────────
# List all power cards
# ──────────────────────────────────────────────────────────

@router.get("", response_model=list[PowerCardOut])
def get_all_power_cards() -> list[PowerCardOut]:
    try:
        resp = supabase.table("power_cards").select("*").execute()
    except Exception as exc:
        if _is_missing_table_error(exc):
            # Keep the main game usable even before power-card migration is applied.
            return []
        raise HTTPException(status_code=500, detail=f"Failed to fetch power cards: {exc}") from exc

    return [normalize_power_card(r) for r in (resp.data or [])]


# ──────────────────────────────────────────────────────────
# Extra 1 Minute
# ──────────────────────────────────────────────────────────

@router.post("/{team_id}/extra-time", response_model=PowerCardOut)
async def use_extra_time(team_id: int, payload: PowerCardUseIn) -> PowerCardOut:
    get_team_or_404(team_id)
    pc = _get_power_card_or_404(team_id)

    if pc.get("extra_time_used"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Extra Time power card has already been used by this team.",
        )

    q = get_question_or_404(payload.question_id)

    if q.get("status") != "SOLVING":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Extra Time can only be used while SOLVING.",
        )

    # Only the team that won the question can use their power card
    if q.get("assigned_team_id") != team_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This team does not own this question.",
        )

    new_time = int(q.get("active_time_seconds") or q.get("time_limit_seconds") or 30) + 60

    try:
        supabase.table("questions").update({"active_time_seconds": new_time}).eq(
            "id", payload.question_id
        ).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to add extra time: {exc}") from exc

    try:
        pc_resp = (
            supabase.table("power_cards")
            .update({"extra_time_used": True})
            .eq("team_id", team_id)
            .eq("extra_time_used", False)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to mark power card used: {exc}") from exc

    rows = pc_resp.data or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Extra Time card was already used by a concurrent request.",
        )

    await manager.broadcast(fetch_full_state())
    return normalize_power_card(rows[0])


# ──────────────────────────────────────────────────────────
# Double Reward
# ──────────────────────────────────────────────────────────

@router.post("/{team_id}/double-reward", response_model=PowerCardOut)
async def use_double_reward(team_id: int, payload: PowerCardUseIn) -> PowerCardOut:
    get_team_or_404(team_id)
    pc = _get_power_card_or_404(team_id)

    if pc.get("double_reward_used"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Double Reward power card has already been used by this team.",
        )

    q = get_question_or_404(payload.question_id)

    if q.get("status") != "SOLVING":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Double Reward can only be activated while SOLVING.",
        )

    if q.get("assigned_team_id") != team_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This team does not own this question.",
        )

    # Flag the double reward on the question
    try:
        supabase.table("questions").update({"double_reward_team_id": team_id}).eq(
            "id", payload.question_id
        ).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to flag double reward: {exc}") from exc

    try:
        pc_resp = (
            supabase.table("power_cards")
            .update({"double_reward_used": True})
            .eq("team_id", team_id)
            .eq("double_reward_used", False)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to mark power card used: {exc}") from exc

    rows = pc_resp.data or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Double Reward card was already used by a concurrent request.",
        )

    await manager.broadcast(fetch_full_state())
    return normalize_power_card(rows[0])
