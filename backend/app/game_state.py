"""WebSocket connection manager.

A single global `manager` instance is imported by all routers that need to
broadcast real-time state updates to connected clients.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict[str, Any]) -> None:
        """Broadcast a JSON message to all connected WebSocket clients."""
        data = json.dumps(message, default=str)
        dead: list[WebSocket] = []
        for connection in self.active_connections:
            try:
                await connection.send_text(data)
            except Exception:
                dead.append(connection)
        for conn in dead:
            self.disconnect(conn)


# Singleton used throughout the application
manager = ConnectionManager()
