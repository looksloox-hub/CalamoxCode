"""Agent routes — list, search, and dispatch to agents."""

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..agent_orchestrator import orchestrator

router = APIRouter()


class PromptRequest(BaseModel):
    prompt: str
    agent_id: Optional[str] = None
    group_id: Optional[str] = None


@router.get("/groups")
async def list_groups():
    """List all agent groups."""
    return {"groups": orchestrator.list_groups()}


@router.get("/groups/{group_id}")
async def get_group(group_id: str):
    """Get a single group with its agents."""
    group = orchestrator.get_group(group_id)
    if not group:
        raise HTTPException(status_code=404, detail=f"Group '{group_id}' not found")
    return group


@router.get("")
async def list_agents(group_id: Optional[str] = None):
    """List all agents, optionally filtered by group."""
    return {"agents": orchestrator.list_agents(group_id), "total": len(orchestrator.list_agents(group_id))}


@router.get("/{agent_id}")
async def get_agent(agent_id: str):
    """Get a single agent by ID."""
    agent = orchestrator.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
    return agent


@router.get("/search/{query}")
async def search_agents(query: str):
    """Search agents by name or description."""
    return {"results": orchestrator.search_agents(query), "query": query}


@router.post("/dispatch")
async def dispatch_prompt(req: PromptRequest):
    """Route a prompt to the best agent (or a specific one if agent_id provided)."""
    if req.agent_id:
        agent = orchestrator.get_agent(req.agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail=f"Agent '{req.agent_id}' not found")
        messages = orchestrator.build_message(req.agent_id, req.prompt)
        return {
            "agent": {"id": agent["id"], "name": agent["name"]},
            "messages": messages,
            "status": "dispatched",
        }

    routing = orchestrator.route_prompt(req.prompt)
    return {"routing": routing, "prompt": req.prompt, "status": "routed"}


@router.get("/stats/overview")
async def agent_stats():
    """Get agent system statistics."""
    return orchestrator.get_stats()
