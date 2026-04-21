from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.websockets import WebSocket, WebSocketDisconnect

from app.config import get_settings
from app.game_state import manager
from app.helpers import fetch_full_state
from app.routers.admin import router as admin_router
from app.routers.auctions import router as auctions_router
from app.routers.power_cards import router as power_cards_router
from app.routers.questions import router as questions_router
from app.routers.teams import router as teams_router

settings = get_settings()
app = FastAPI(title=settings.app_name)

origins = [
    origin.strip() for origin in settings.frontend_origin.split(",") if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# ── WebSocket ──────────────────────────────────────────────
@app.websocket("/ws/game")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    try:
        # Send full state immediately on connect
        await websocket.send_json(fetch_full_state())
        # Keep connection alive, listening for any client messages (ping/pong)
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)


# ── Routers ───────────────────────────────────────────────
app.include_router(questions_router)
app.include_router(auctions_router)
app.include_router(teams_router)
app.include_router(power_cards_router)
app.include_router(admin_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, port=8000)