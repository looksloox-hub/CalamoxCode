"""Task Manager — CRUD operations for user tasks, reminders, and background jobs."""

import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from .config import settings

TASKS_FILE = settings.data_dir / "tasks.json"


def _load_tasks() -> list[dict]:
    if TASKS_FILE.exists():
        with open(TASKS_FILE) as f:
            return json.load(f)
    return []


def _save_tasks(tasks: list[dict]) -> None:
    TASKS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(TASKS_FILE, "w") as f:
        json.dump(tasks, f, indent=2, default=str)


def create_task(title: str, description: str = "", priority: str = "medium", due_date: Optional[str] = None) -> dict:
    """Create a new task."""
    task = {
        "id": str(uuid.uuid4()),
        "title": title,
        "description": description,
        "priority": priority,
        "status": "pending",
        "due_date": due_date,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "reminder": None,
        "tags": [],
    }
    tasks = _load_tasks()
    tasks.append(task)
    _save_tasks(tasks)
    return task


def list_tasks(status: Optional[str] = None, priority: Optional[str] = None) -> list[dict]:
    """List all tasks with optional filtering."""
    tasks = _load_tasks()
    if status:
        tasks = [t for t in tasks if t["status"] == status]
    if priority:
        tasks = [t for t in tasks if t["priority"] == priority]
    return tasks


def get_task(task_id: str) -> Optional[dict]:
    """Get a single task by ID."""
    tasks = _load_tasks()
    for t in tasks:
        if t["id"] == task_id:
            return t
    return None


def update_task(task_id: str, **updates) -> Optional[dict]:
    """Update a task by ID."""
    tasks = _load_tasks()
    for i, t in enumerate(tasks):
        if t["id"] == task_id:
            tasks[i].update(updates)
            tasks[i]["updated_at"] = datetime.now(timezone.utc).isoformat()
            _save_tasks(tasks)
            return tasks[i]
    return None


def delete_task(task_id: str) -> bool:
    """Delete a task by ID."""
    tasks = _load_tasks()
    new_tasks = [t for t in tasks if t["id"] != task_id]
    if len(new_tasks) < len(tasks):
        _save_tasks(new_tasks)
        return True
    return False


def complete_task(task_id: str) -> Optional[dict]:
    """Mark a task as completed."""
    return update_task(task_id, status="completed")


def get_task_stats() -> dict:
    """Get task statistics."""
    tasks = _load_tasks()
    return {
        "total": len(tasks),
        "pending": len([t for t in tasks if t["status"] == "pending"]),
        "in_progress": len([t for t in tasks if t["status"] == "in_progress"]),
        "completed": len([t for t in tasks if t["status"] == "completed"]),
        "high_priority": len([t for t in tasks if t["priority"] == "high" and t["status"] != "completed"]),
    }
