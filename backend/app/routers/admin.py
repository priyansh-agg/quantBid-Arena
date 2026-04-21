"""Admin utility endpoints.

  POST /api/admin/reset-game  — Reset all questions, bids, and power cards
                                to a clean pre-game state. Teams keep their
                                names and colours; score/balance are reset to 0/10000.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.game_state import manager
from app.helpers import fetch_full_state
from app.supabase_client import supabase

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/reset-game")
async def reset_game() -> dict:
    """Full game reset — safe to call before every new session."""

    errors: list[str] = []

    # 1. Clear all bids
    try:
        supabase.table("bids").delete().neq("id", 0).execute()
    except Exception as exc:
        errors.append(f"bids: {exc}")

    # 2. Reset all questions to AVAILABLE
    try:
        supabase.table("questions").update({
            "status": "AVAILABLE",
            "is_used": False,
            "current_bid_amount": None,
            "current_bid_team_id": None,
            "assigned_team_id": None,
            "re_auction_count": 0,
            "excluded_team_ids": [],
            "active_time_seconds": None,
            "solve_started_at": None,
            "double_reward_team_id": None,
            "original_base_price": None,
            "original_reward_points": None,
            "original_time_limit": None,
        }).neq("id", 0).execute()
    except Exception as exc:
        errors.append(f"questions: {exc}")

    # 3. Reset all power cards
    try:
        supabase.table("power_cards").update({
            "extra_time_used": False,
            "double_reward_used": False,
        }).neq("id", 0).execute()
    except Exception as exc:
        errors.append(f"power_cards: {exc}")

    # 4. Reset team scores and balances
    try:
        supabase.table("teams").update({
            "score": 0,
            "balance": 10000,
        }).neq("id", 0).execute()
    except Exception as exc:
        errors.append(f"teams: {exc}")

    if errors:
        raise HTTPException(status_code=500, detail=f"Partial reset failure: {'; '.join(errors)}")

    # Broadcast fresh state to all connected clients
    await manager.broadcast(fetch_full_state())

    return {"status": "ok", "message": "Game reset successfully."}
