"""Session management routes — chat history, export/import."""

import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..config import settings

router = APIRouter()

SESSIONS_DIR = settings.sessions_dir


def _list_session_files() -> list[dict]:
    """List all saved session files."""
    sessions = []
    if SESSIONS_DIR.exists():
        for f in sorted(SESSIONS_DIR.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
            try:
                with open(f) as fh:
                    data = json.load(fh)
                sessions.append({
                    "id": f.stem,
                    "title": data.get("title", f.stem),
                    "message_count": len(data.get("messages", [])),
                    "created_at": data.get("created_at", ""),
                    "updated_at": data.get("updated_at", ""),
                })
            except Exception:
                pass
    return sessions


class SessionCreate(BaseModel):
    title: str = "New Session"


class MessageAdd(BaseModel):
    role: str  # "user" or "assistant"
    content: str
    agent_id: Optional[str] = None


@router.get("")
async def list_sessions():
    """List all saved sessions."""
    return {"sessions": _list_session_files()}


@router.post("")
async def create_session(req: SessionCreate):
    """Create a new session."""
    session_id = str(uuid.uuid4())[:8]
    now = datetime.now(timezone.utc).isoformat()
    data = {
        "title": req.title,
        "messages": [],
        "created_at": now,
        "updated_at": now,
    }
    path = SESSIONS_DIR / f"{session_id}.json"
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    return {"id": session_id, **data}


@router.get("/{session_id}")
async def get_session(session_id: str):
    """Get a session with all messages."""
    path = SESSIONS_DIR / f"{session_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Session not found")
    with open(path) as f:
        return json.load(f)


@router.post("/{session_id}/messages")
async def add_message(session_id: str, msg: MessageAdd):
    """Add a message to a session."""
    path = SESSIONS_DIR / f"{session_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Session not found")
    with open(path) as f:
        data = json.load(f)
    message = {
        "role": msg.role,
        "content": msg.content,
        "agent_id": msg.agent_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    data["messages"].append(message)
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    return message


@router.delete("/{session_id}")
async def delete_session(session_id: str):
    """Delete a session."""
    path = SESSIONS_DIR / f"{session_id}.json"
    if path.exists():
        path.unlink()
        return {"success": True}
    raise HTTPException(status_code=404, detail="Session not found")


@router.get("/{session_id}/export")
async def export_session(session_id: str):
    """Export a session as JSON."""
    path = SESSIONS_DIR / f"{session_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Session not found")
    with open(path) as f:
        return json.load(f)
