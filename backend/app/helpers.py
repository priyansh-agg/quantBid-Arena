"""Shared helpers used across multiple routers."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import HTTPException, status

from app.models import PowerCardOut, QuestionOut, TeamOut
from app.supabase_client import supabase


# ──────────────────────────────────────────────────────────
# Normalizers
# ──────────────────────────────────────────────────────────

def _as_optional_str(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def _normalize_options(value: Any) -> Optional[list[str]]:
    if value is None:
        return None
    if isinstance(value, list):
        return [str(item) for item in value]
    return [str(value)]


def normalize_question(row: dict) -> QuestionOut:
    excluded_raw = row.get("excluded_team_ids") or []
    if isinstance(excluded_raw, list):
        excluded = [int(x) for x in excluded_raw]
    else:
        excluded = []

    return QuestionOut(
        id=int(row["id"]),
        question_text=str(row.get("question_text") or ""),
        answer_text=_as_optional_str(row.get("answer_text")),
        options=_normalize_options(row.get("options")),
        reward_points=int(row.get("reward_points") or 10),
        base_amount=int(row.get("base_amount") or 500),
        time_limit_seconds=int(row.get("time_limit_seconds") or 30),
        active_time_seconds=(
            int(row["active_time_seconds"]) if row.get("active_time_seconds") is not None else None
        ),
        solve_started_at=_as_optional_str(row.get("solve_started_at")),
        is_used=bool(row.get("is_used") or False),
        status=str(row.get("status") or "AVAILABLE"),
        category=_as_optional_str(row.get("category")),
        difficulty=_as_optional_str(row.get("difficulty")),
        assigned_team_id=(
            int(row["assigned_team_id"]) if row.get("assigned_team_id") is not None else None
        ),
        current_bid_amount=(
            int(row["current_bid_amount"]) if row.get("current_bid_amount") is not None else None
        ),
        current_bid_team_id=(
            int(row["current_bid_team_id"]) if row.get("current_bid_team_id") is not None else None
        ),
        original_base_price=(
            int(row["original_base_price"]) if row.get("original_base_price") is not None else None
        ),
        original_reward_points=(
            int(row["original_reward_points"]) if row.get("original_reward_points") is not None else None
        ),
        original_time_limit=(
            int(row["original_time_limit"]) if row.get("original_time_limit") is not None else None
        ),
        re_auction_count=int(row.get("re_auction_count") or 0),
        excluded_team_ids=excluded,
        double_reward_team_id=(
            int(row["double_reward_team_id"]) if row.get("double_reward_team_id") is not None else None
        ),
    )


def normalize_team(row: dict) -> TeamOut:
    return TeamOut(
        id=int(row["id"]),
        name=str(row["name"]),
        score=int(row.get("score") or 0),
        balance=int(row.get("balance") or 2500),
        color=row.get("color"),
    )


def normalize_power_card(row: dict) -> PowerCardOut:
    return PowerCardOut(
        id=int(row["id"]),
        team_id=int(row["team_id"]),
        extra_time_used=bool(row.get("extra_time_used") or False),
        double_reward_used=bool(row.get("double_reward_used") or False),
    )


# ──────────────────────────────────────────────────────────
# Fetch helpers
# ──────────────────────────────────────────────────────────

def get_question_or_404(question_id: int) -> dict:
    try:
        response = (
            supabase.table("questions")
            .select("*")
            .eq("id", question_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch question: {exc}",
        ) from exc

    rows = response.data or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Question {question_id} not found.",
        )
    return rows[0]


def get_team_or_404(team_id: int) -> dict:
    try:
        response = (
            supabase.table("teams")
            .select("*")
            .eq("id", team_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch team: {exc}",
        ) from exc

    rows = response.data or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Team {team_id} not found.",
        )
    return rows[0]


# ──────────────────────────────────────────────────────────
# Bid increment rule
# ──────────────────────────────────────────────────────────

def get_min_increment(current_bid: int) -> int:
    """Return the minimum increment required to outbid `current_bid`."""
    if current_bid <= 100:
        return 10
    if current_bid <= 200:
        return 20
    return 50


# ──────────────────────────────────────────────────────────
# Full state fetcher (for WebSocket broadcast)
# ──────────────────────────────────────────────────────────

def fetch_full_state() -> dict:
    """Fetch all questions, teams, bids, and power cards for broadcasting.

    The state endpoint should stay resilient even when optional tables are missing
    (e.g., partial migrations). In those cases, we degrade to empty collections
    instead of returning an error payload that can leave clients in a loading state.
    """
    questions: list[dict] = []
    teams: list[dict] = []
    bids: list[dict] = []
    power_cards: list[dict] = []

    try:
        questions_resp = supabase.table("questions").select("*").order("id").execute()
        questions = [normalize_question(r).model_dump() for r in (questions_resp.data or [])]
    except Exception:
        questions = []

    try:
        teams_resp = supabase.table("teams").select("*").order("score", desc=True).execute()
        teams = [normalize_team(r).model_dump() for r in (teams_resp.data or [])]
    except Exception:
        teams = []

    try:
        bids_resp = supabase.table("bids").select("*").order("placed_at", desc=True).execute()
        bids = bids_resp.data or []
    except Exception:
        bids = []

    try:
        pc_resp = supabase.table("power_cards").select("*").execute()
        power_cards = [normalize_power_card(r).model_dump() for r in (pc_resp.data or [])]
    except Exception:
        power_cards = []

    return {
        "type": "state",
        "questions": questions,
        "teams": teams,
        "bids": bids,
        "power_cards": power_cards,
    }


# ──────────────────────────────────────────────────────────
# Transaction logger
# ──────────────────────────────────────────────────────────

def log_transaction(
    team_id: int,
    type_: str,
    qm_delta: int = 0,
    rp_delta: int = 0,
    description: str = "",
) -> None:
    try:
        supabase.table("transactions").insert({
            "team_id": team_id,
            "type": type_,
            "qm_delta": qm_delta,
            "rp_delta": rp_delta,
            "description": description,
        }).execute()
    except Exception:
        pass  # Non-critical; don't fail the main operation
