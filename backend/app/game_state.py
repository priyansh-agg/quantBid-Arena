"""WebSocket connection manager + in-memory phase state.

A single global `manager` instance is imported by all routers that need to
broadcast real-time state updates to connected clients.

Phase state is kept purely in-memory (no DB) — it resets if the server
restarts, which is intentional (host always starts a fresh phase).
"""

from __future__ import annotations

import json
import random
from typing import Any, Literal, Optional

from fastapi import WebSocket

# ──────────────────────────────────────────────────────────────
# Meme texts shown on the transition screen
# ──────────────────────────────────────────────────────────────

MEME_TEXTS: list[str] = [
    "CALCULATING IQ LEVELS",
    "AUCTION GODS ARE THINKING",
    "REBALANCING STRATEGIES",
    "PROCESSING INTELLIGENCE",
    "CONSULTING THE ORACLE",
    "RUNNING PROBABILITY MATRIX",
    "INITIALIZING NEXT ROUND",
    "AWAITING ELITE DECISIONS",
    "SUMMONING NEXT CHALLENGE",
    "DECRYPTING MATHEMATICAL VECTORS",
]

PhaseType = Literal["QUESTION", "TRANSITION"]


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []

        # ── In-memory phase state (host-controlled) ──────────
        self.phase: PhaseType = "QUESTION"
        self.meme_text: str = random.choice(MEME_TEXTS)
        # Single source of truth: which question the arena currently displays.
        # None = host hasn't explicitly selected one yet (arena auto-picks first active).
        self.current_question_id: Optional[int] = None

    # ── Connection management ────────────────────────────────

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    # ── Broadcast ────────────────────────────────────────────

    async def broadcast(self, message: dict[str, Any]) -> None:
        """Broadcast a JSON message to all connected WebSocket clients."""
        # Always inject current phase and question id into every broadcast
        message.setdefault("phase", self.phase)
        message.setdefault("meme_text", self.meme_text)
        message.setdefault("current_question_id", self.current_question_id)

        data = json.dumps(message, default=str)
        dead: list[WebSocket] = []
        for connection in self.active_connections:
            try:
                await connection.send_text(data)
            except Exception:
                dead.append(connection)
        for conn in dead:
            self.disconnect(conn)

    # ── Phase control (called by host commands) ──────────────

    def set_phase(self, phase: PhaseType, meme_text: Optional[str] = None) -> None:
        self.phase = phase
        if meme_text:
            self.meme_text = meme_text
        elif phase == "TRANSITION":
            # Pick a fresh random meme text on each transition
            self.meme_text = random.choice(MEME_TEXTS)

    def set_current_question(self, question_id: Optional[int]) -> None:
        """Host explicitly sets which question is live on the arena."""
        self.current_question_id = question_id

    def build_phase_message(self) -> dict[str, Any]:
        """Lightweight message that only carries phase + current question info."""
        return {
            "type": "phase",
            "phase": self.phase,
            "meme_text": self.meme_text,
            "current_question_id": self.current_question_id,
        }


# Singleton used throughout the application
manager = ConnectionManager()
