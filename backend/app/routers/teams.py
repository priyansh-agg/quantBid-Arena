"""Teams router.

Endpoints:
  - GET   /api/teams               list all teams
  - PATCH /api/teams/{id}/score    update RP (reward points) delta
  - POST  /api/teams/{id}/convert-rp  100 RP → 200 QM
  - POST  /api/teams/{id}/penalize    deduct 100 RP (unauthorized attempt)
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.game_state import manager
from app.helpers import fetch_full_state, get_team_or_404, log_transaction, normalize_team
from app.models import ConvertRPIn, ScoreUpdateIn, TeamOut
from app.supabase_client import supabase

router = APIRouter(prefix="/api/teams", tags=["teams"])


# ──────────────────────────────────────────────────────────
# List teams
# ──────────────────────────────────────────────────────────

@router.get("", response_model=list[TeamOut])
def get_teams() -> list[TeamOut]:
    try:
        response = (
            supabase.table("teams")
            .select("id,name,score,balance,color")
            .order("score", desc=True)
            .order("name")
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch teams: {exc}") from exc

    return [normalize_team(row) for row in (response.data or [])]


# ──────────────────────────────────────────────────────────
# Manual RP update (admin override)
# ──────────────────────────────────────────────────────────

@router.patch("/{team_id}/score", response_model=TeamOut)
async def update_score(team_id: int, payload: ScoreUpdateIn) -> TeamOut:
    if payload.delta == 0:
        raise HTTPException(status_code=400, detail="delta cannot be 0.")

    team = get_team_or_404(team_id)
    current_score = int(team.get("score") or 0)
    new_score = current_score + payload.delta

    try:
        update_response = (
            supabase.table("teams")
            .update({"score": new_score})
            .eq("id", team_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update score: {exc}") from exc

    rows = update_response.data or []
    if not rows:
        raise HTTPException(status_code=500, detail="Score update returned no rows.")

    log_transaction(
        team_id=team_id,
        type_="rp_deduct" if payload.delta < 0 else "rp_award",
        rp_delta=payload.delta,
        description="Manual admin RP adjustment",
    )

    await manager.broadcast(fetch_full_state())
    return normalize_team(rows[0])


# ──────────────────────────────────────────────────────────
# Convert RP → QM (100 RP = 200 QM)
# ──────────────────────────────────────────────────────────

@router.post("/{team_id}/convert-rp", response_model=TeamOut)
async def convert_rp(team_id: int, payload: ConvertRPIn) -> TeamOut:
    team = get_team_or_404(team_id)
    current_rp = int(team.get("score") or 0)
    current_qm = int(team.get("balance") or 0)

    rp_to_spend = payload.amount_rp
    if current_rp < rp_to_spend:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient RP. Available: {current_rp}, Required: {rp_to_spend}.",
        )

    qm_gained = rp_to_spend * 2
    new_rp = current_rp - rp_to_spend
    new_qm = current_qm + qm_gained

    try:
        resp = (
            supabase.table("teams")
            .update({"score": new_rp, "balance": new_qm})
            .eq("id", team_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to convert RP: {exc}") from exc

    rows = resp.data or []
    if not rows:
        raise HTTPException(status_code=500, detail="Convert RP returned no rows.")

    log_transaction(
        team_id=team_id,
        type_="rp_convert",
        qm_delta=qm_gained,
        rp_delta=-rp_to_spend,
        description=f"Converted {rp_to_spend} RP → {qm_gained} QM",
    )

    await manager.broadcast(fetch_full_state())
    return normalize_team(rows[0])


# ──────────────────────────────────────────────────────────
# Penalize (100 RP deduction — unauthorized attempt)
# ──────────────────────────────────────────────────────────

@router.post("/{team_id}/penalize", response_model=TeamOut)
async def penalize_team(team_id: int) -> TeamOut:
    team = get_team_or_404(team_id)
    current_rp = int(team.get("score") or 0)
    new_rp = current_rp - 100  # RP can go negative per rulebook

    try:
        resp = (
            supabase.table("teams")
            .update({"score": new_rp})
            .eq("id", team_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to penalize team: {exc}") from exc

    rows = resp.data or []
    if not rows:
        raise HTTPException(status_code=500, detail="Penalize returned no rows.")

    log_transaction(
        team_id=team_id,
        type_="penalty",
        rp_delta=-100,
        description="100 RP penalty — unauthorized attempt",
    )

    await manager.broadcast(fetch_full_state())
    return normalize_team(rows[0])
