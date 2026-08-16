"""Task management routes."""

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..events import bus
from ..task_manager import (
    complete_task,
    create_task,
    delete_task,
    get_task,
    get_task_stats,
    list_tasks,
    update_task,
)

router = APIRouter()


async def _publish_tasks_updated():
    """Notify real-time clients that task state changed."""
    await bus.publish({"type": "tasks_updated", "stats": get_task_stats()})


class TaskCreate(BaseModel):
    title: str
    description: str = ""
    priority: str = "medium"
    due_date: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    due_date: Optional[str] = None


@router.get("")
async def list_all_tasks(status: Optional[str] = None, priority: Optional[str] = None):
    """List all tasks with optional filters."""
    return {"tasks": list_tasks(status=status, priority=priority)}


@router.get("/stats")
async def task_stats():
    """Get task statistics."""
    return get_task_stats()


@router.post("")
async def create_new_task(task: TaskCreate):
    """Create a new task."""
    created = create_task(**task.model_dump())
    await _publish_tasks_updated()
    return created


@router.get("/{task_id}")
async def get_single_task(task_id: str):
    """Get a single task."""
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.put("/{task_id}")
async def update_existing_task(task_id: str, updates: TaskUpdate):
    """Update a task."""
    data = {k: v for k, v in updates.model_dump().items() if v is not None}
    task = update_task(task_id, **data)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("/{task_id}/complete")
async def complete_existing_task(task_id: str):
    """Mark a task as completed."""
    task = complete_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await _publish_tasks_updated()
    return task


@router.delete("/{task_id}")
async def delete_existing_task(task_id: str):
    """Delete a task."""
    if not delete_task(task_id):
        raise HTTPException(status_code=404, detail="Task not found")
    await _publish_tasks_updated()
    return {"success": True}
