"""Calamox FastAPI application — the main server entry point."""

import json

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import get_agent_config, get_all_agents_flat, settings
from .events import bus

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Calamox AI",
    description=(
        "OS-level Jarvis assistant with multi-agent intelligence, browser automation, "
        "voice commands, and real-time dashboard."
    ),
    version="0.1.0",
    redirect_slashes=False,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# In-memory task store (simple dict; production would use a database)
# ---------------------------------------------------------------------------

_tasks: list[dict] = []
_sessions: list[dict] = []

# ---------------------------------------------------------------------------
# Routes — Info
# ---------------------------------------------------------------------------


@app.get("/api/info")
async def info():
    return {
        "name": "Calamox AI",
        "version": "0.1.0",
        "agents": len(get_all_agents_flat()),
        "groups": len(get_agent_config()),
    }


@app.get("/api/health")
async def health():
    from .bridge_client import bridge
    bridge_status = await bridge.is_available()
    return {
        "status": "ok",
        "agents_loaded": len(get_all_agents_flat()),
        "bridge": "connected" if bridge_status else "disconnected",
    }


# ---------------------------------------------------------------------------
# Routes — Agents
# ---------------------------------------------------------------------------

from .routes.agents import router as agents_router  # noqa: E402
from .routes.api_keys import router as api_keys_router  # noqa: E402
from .routes.bridge import router as bridge_router  # noqa: E402
from .routes.chat import router as chat_router  # noqa: E402
from .routes.adb import router as adb_router  # noqa: E402
from .routes.news import router as news_router  # noqa: E402
from .routes.sessions import router as sessions_router  # noqa: E402
from .routes.tasks import router as tasks_router  # noqa: E402
from .routes.tts import router as tts_router  # noqa: E402
from .routes.youtube import router as youtube_router  # noqa: E402

app.include_router(agents_router, prefix="/api/agents", tags=["agents"])
app.include_router(api_keys_router, prefix="/api/keys", tags=["api-keys"])
app.include_router(adb_router, prefix="/api/adb", tags=["adb"])
app.include_router(news_router, prefix="/api/news", tags=["news"])
app.include_router(tasks_router, prefix="/api/tasks", tags=["tasks"])
app.include_router(sessions_router, prefix="/api/sessions", tags=["sessions"])
app.include_router(chat_router, prefix="/api/chat", tags=["chat"])
app.include_router(bridge_router, prefix="/api/bridge", tags=["bridge"])
app.include_router(tts_router, prefix="/api/tts", tags=["tts"])
app.include_router(youtube_router, prefix="/api/youtube", tags=["youtube"])

# ---------------------------------------------------------------------------
# WebSocket — real-time task / audio streaming
# ---------------------------------------------------------------------------


class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, message: str):
        for conn in self.active:
            try:
                await conn.send_text(message)
            except Exception:
                pass


ws_manager = ConnectionManager()

# Fan out backend events (task updates, agent activity) to every connected client
async def _fanout_to_clients(event: dict):
    await ws_manager.broadcast(json.dumps(event))


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws_manager.connect(ws)
    bus.subscribe(_fanout_to_clients)
    try:
        while True:
            data = await ws.receive_text()
            await ws.send_text(json.dumps({"type": "response", "data": f"Received: {data}"}))
    except WebSocketDisconnect:
        bus.unsubscribe(_fanout_to_clients)
        ws_manager.disconnect(ws)


# ---------------------------------------------------------------------------
# Static frontend (production build)
# ---------------------------------------------------------------------------

frontend_dist = settings.frontend_dist
if frontend_dist.exists() and frontend_dist.is_dir():
    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="static-assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Serve static files if they exist, otherwise return index.html (SPA)
        file_path = frontend_dist / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        index = frontend_dist / "index.html"
        if index.exists():
            return FileResponse(str(index))
        return JSONResponse({"error": "Frontend not built. Run: cd calamox/frontend && npm run build"}, status_code=404)


# ---------------------------------------------------------------------------
# Vision analysis endpoint
# ---------------------------------------------------------------------------

SUPPORTED_MODELS = [
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "nvidia/nemotron-3.5-lightning:free",
    "google/gemma-4-31b-it:free",
    "openai/gpt-oss-20b:free",
    "gemini-2.5-flash",
]


@app.post("/api/vision/analyze")
async def vision_analyze(request: dict):
    """Analyze a screen capture image using multimodal AI."""
    image = request.get("image", "")
    model = request.get("model", "nvidia/nemotron-3.5-lightning:free")

    if not image:
        return JSONResponse({"error": "No image data provided"}, status_code=400)

    if model not in SUPPORTED_MODELS:
        return JSONResponse({"error": f"Unsupported model: {model}"}, status_code=400)

    # TODO: Integrate with actual multimodal model (Gemini/Qwen/VL/Ollama)
    # For now, return a placeholder analysis
    analysis = {
        "objects": [],
        "text": "",
        "activities": [],
    }

    return JSONResponse({
        "analysis": analysis,
        "model": model,
    })
