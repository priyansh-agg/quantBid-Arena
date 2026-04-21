"""Pydantic models for all API request/response shapes."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator

# ──────────────────────────────────────────────────────────
# Question Status
# ──────────────────────────────────────────────────────────

QuestionStatus = Literal[
    "AVAILABLE",
    "BIDDING",
    "SOLD",
    "SOLVING",
    "SOLVED",
    "FAILED",
    "RE_AUCTION_PENDING",
    "CLOSED",
]


# ──────────────────────────────────────────────────────────
# Teams
# ──────────────────────────────────────────────────────────

class TeamOut(BaseModel):
    id: int
    name: str
    score: int = 0       # Reward Points (RP)
    balance: int = 2500   # Quant Money (QM)
    color: Optional[str] = None


class ScoreUpdateIn(BaseModel):
    delta: int = Field(..., description="Can be positive or negative.")


class ConvertRPIn(BaseModel):
    """Convert 100 RP → 200 QM."""
    amount_rp: int = Field(100, ge=100, description="RP to convert (must be multiple of 100).")

    @field_validator("amount_rp")
    @classmethod
    def must_be_multiple_of_100(cls, v: int) -> int:
        if v % 100 != 0:
            raise ValueError("amount_rp must be a multiple of 100")
        return v


# ──────────────────────────────────────────────────────────
# Questions
# ──────────────────────────────────────────────────────────

class QuestionOut(BaseModel):
    id: int
    question_text: str
    answer_text: Optional[str] = None
    options: Optional[list[str]] = None
    reward_points: int = 10
    base_amount: int = 500
    time_limit_seconds: int = 30
    active_time_seconds: Optional[int] = None
    solve_started_at: Optional[str] = None
    is_used: bool = False
    status: str = "AVAILABLE"
    category: Optional[str] = None
    difficulty: Optional[str] = None
    assigned_team_id: Optional[int] = None
    current_bid_amount: Optional[int] = None
    current_bid_team_id: Optional[int] = None
    original_base_price: Optional[int] = None
    original_reward_points: Optional[int] = None
    original_time_limit: Optional[int] = None
    re_auction_count: int = 0
    excluded_team_ids: list[int] = Field(default_factory=list)
    double_reward_team_id: Optional[int] = None


class QuestionUsageUpdateIn(BaseModel):
    is_used: bool


class TimerModifyIn(BaseModel):
    seconds: int = Field(..., ge=1, le=7200, description="New total time in seconds.")


class SolveIn(BaseModel):
    correct: bool


# ──────────────────────────────────────────────────────────
# Bids
# ──────────────────────────────────────────────────────────

class BidIn(BaseModel):
    team_id: int
    amount: int = Field(..., gt=0)


class BidOut(BaseModel):
    id: int
    question_id: int
    team_id: int
    amount: int
    placed_at: str


# ──────────────────────────────────────────────────────────
# Power Cards
# ──────────────────────────────────────────────────────────

class PowerCardOut(BaseModel):
    id: int
    team_id: int
    extra_time_used: bool
    double_reward_used: bool


class PowerCardUseIn(BaseModel):
    question_id: int


# ──────────────────────────────────────────────────────────
# Misc
# ──────────────────────────────────────────────────────────

class RandomAssignmentOut(BaseModel):
    question_id: int
    team_id: int
    team_name: str
