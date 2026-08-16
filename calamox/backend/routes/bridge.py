"""Bridge status routes — check Node.js bridge connectivity."""

from fastapi import APIRouter

from ..bridge_client import bridge

router = APIRouter()


@router.get("")
async def bridge_status():
    """Get the Node.js bridge connection status."""
    return await bridge.get_status()


@router.post("/exec")
async def bridge_exec(payload: dict):
    """Proxy command execution to the bridge."""
    return await bridge.exec_command(
        command=payload.get("command", ""),
        cwd=payload.get("cwd"),
        timeout_ms=payload.get("timeoutMs", 120_000),
        env=payload.get("env"),
    )


@router.post("/browser")
async def bridge_browser(payload: dict):
    """Proxy browser operations to the bridge."""
    return await bridge.open_page(
        url=payload.get("url", ""),
        screenshot=payload.get("screenshot", False),
        max_chars=payload.get("maxChars", 200_000),
    )
