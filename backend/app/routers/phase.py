"""Phase control REST endpoints.

HTTP fallbacks for the host panel (complements the WS commands).
Using REST means the host can trigger phase changes even if the WS connection
momentarily drops.

  GET  /api/phase                   → current phase state
  POST /api/phase/transition        → phase = TRANSITION (shows meme screen)
  POST /api/phase/question          → phase = QUESTION (reveals the question)
  POST /api/phase/set-question/{id} → set current_question_id (single source of truth)
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from app.game_state import manager

router = APIRouter(prefix="/api/phase", tags=["phase"])


class PhaseTransitionBody(BaseModel):
    meme_text: Optional[str] = None  # optional custom text; random if omitted


class SetQuestionBody(BaseModel):
    question_id: Optional[int] = None  # None = clear / let arena auto-select


@router.get("")
async def get_phase() -> dict:
    """Return the current phase, meme text, and active question id."""
    return {
        "phase": manager.phase,
        "meme_text": manager.meme_text,
        "current_question_id": manager.current_question_id,
    }


@router.post("/transition")
async def set_transition(body: PhaseTransitionBody = PhaseTransitionBody()) -> dict:
    """Switch arena to TRANSITION (meme) screen and broadcast to all clients."""
    manager.set_phase("TRANSITION", body.meme_text)
    await manager.broadcast(manager.build_phase_message())
    return {
        "phase": manager.phase,
        "meme_text": manager.meme_text,
        "current_question_id": manager.current_question_id,
    }


@router.post("/question")
async def set_question_phase() -> dict:
    """Switch arena to QUESTION screen and broadcast to all clients."""
    manager.set_phase("QUESTION")
    await manager.broadcast(manager.build_phase_message())
    return {
        "phase": manager.phase,
        "meme_text": manager.meme_text,
        "current_question_id": manager.current_question_id,
    }


@router.post("/set-question")
async def set_current_question(body: SetQuestionBody) -> dict:
    """
    Host explicitly pins a question as the current one shown on the arena.
    This is the single source of truth — overrides auto-detection by status.
    Automatically switches phase to QUESTION.
    """
    manager.set_current_question(body.question_id)
    manager.set_phase("QUESTION")
    await manager.broadcast(manager.build_phase_message())
    return {
        "phase": manager.phase,
        "meme_text": manager.meme_text,
        "current_question_id": manager.current_question_id,
    }
