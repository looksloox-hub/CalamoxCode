"""ADB multi-device routes — device management, pairing, and parallel command execution.

Also exposes OS automation functions (notepad, whatsapp, downloads organizer)
wired directly to the back-end os_automation module.
"""

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..adb_device_manager import get_manager

router = APIRouter()


class PairingRequest(BaseModel):
    method: str  # "ip" or "qr"
    address: str  # "ip:port" or QR data
    timeout: Optional[str] = None


class PairingResponse(BaseModel):
    request_id: str
    accepted: bool


class DeviceStats(BaseModel):
    total_devices: int
    online_devices: int
    offline_devices: int
    pending_pairings: int
    total_commands_executed: int
    total_commands_failed: int


@router.get("")
async def list_devices():
    """List all tracked ADB devices."""
    manager = get_manager()
    devices = manager.get_all_devices()
    return {"devices": [dev.to_dict() for dev in devices]}


@router.get("/online")
async def online_devices():
    """List only online devices."""
    manager = get_manager()
    devices = manager.get_online_devices()
    return {"devices": [dev.to_dict() for dev in devices]}


@router.get("/stats")
async def device_stats():
    """Get device statistics."""
    manager = get_manager()
    return manager.get_statistics()


@router.post("/pair/ip")
async def pair_ip(request: PairingRequest):
    """Start IP-based ADB pairing."""
    manager = get_manager()
    request_id = manager.start_ip_pairing(request.address)
    return {"request_id": request_id, "method": "ip", "address": request.address}


@router.post("/pair/qr")
async def pair_qr(request: PairingRequest):
    """Start QR code-based ADB pairing."""
    manager = get_manager()
    request_id = manager.start_qr_pairing(request.address)
    return {"request_id": request_id, "method": "qr", "address": request.address}


@router.post("/pair/cancel/{request_id}")
async def cancel_pairing(request_id: str):
    """Cancel a pending pairing request."""
    manager = get_manager()
    success = manager.cancel_pairing(request_id)
    return {"success": success}


@router.get("/pairings")
async def pending_pairings():
    """Get all pending pairing requests."""
    manager = get_manager()
    return manager.get_pending_pairings()


@router.post("/commands/parallel")
async def execute_parallel(command: str, device_ids: Optional[list[str]] = None, timeout: int = 30):
    """Execute a command in parallel across selected devices."""
    manager = get_manager()
    results = await manager.execute_parallel(command, device_ids=device_ids, timeout=timeout)
    return {"results": results, "command": command}


# Specific ADB operations

@router.post("/commands/unlock")
async def unlock_screens(device_ids: Optional[list[str]] = None):
    """Unlock the screen on selected devices."""
    manager = get_manager()
    return await manager.unlock_screen(device_ids=device_ids)


@router.post("/commands/lock")
async def lock_screens(device_ids: Optional[list[str]] = None):
    """Lock the screen on selected devices."""
    manager = get_manager()
    return await manager.lock_screen(device_ids=device_ids)


@router.post("/commands/open-app")
async def open_app(package_name: str, activity: Optional[str] = None, device_ids: Optional[list[str]] = None):
    """Open an app by package name on selected devices."""
    manager = get_manager()
    return await manager.open_app(package_name=package_name, activity=activity, device_ids=device_ids)


@router.post("/commands/screenshot")
async def take_screenshot(device_ids: Optional[list[str]] = None):
    """Take a screenshot on selected devices."""
    manager = get_manager()
    return await manager.take_screenshot(device_ids=device_ids)


@router.post("/status")
async def get_device_status(device_ids: Optional[list[str]] = None):
    """Get status of selected devices."""
    manager = get_manager()
    return await manager.get_device_status(device_ids=device_ids)


@router.post("/audio/sync")
async def sync_audio(device_ids: Optional[list[str]] = None):
    """Sync audio playback across selected devices."""
    manager = get_manager()
    return await manager.sync_audio_playback(device_ids=device_ids)


# ──────────────────────────────────────────────────────────────────────
# OS Automation endpoints — wired directly to os_automation module
# ──────────────────────────────────────────────────────────────────────

import os as _os  # noqa: E402 (needed for type, imported at module level)


from ..os_automation import (
    open_notepad,
    write_notepad,
    open_whatsapp_web,
    type_whatsapp_message,
    organize_downloads,
)


class OpenNotepadRequest(BaseModel):
    wait: float = 1.0


class WriteNotepadRequest(BaseModel):
    text: str
    wait: float = 1.0


class OpenWhatsAppRequest(BaseModel):
    phone_number: str
    message: str
    wait_after: float = 2.0


class OrganizeDownloadsRequest(BaseModel):
    extensions: Optional[List[str]] = None


@router.post("/os/open-notebook")
async def os_open_notebook(req: OpenNotepadRequest):
    """Launch Notepad via os_automation.open_notepad()."""
    result = await open_notepad()
    return {"success": result["success"], "error": result.get("error")}


@router.post("/os/write-notebook")
async def os_write_notebook(req: WriteNotepadRequest):
    """Type text into Notepad via os_automation.write_notepad()."""
    result = await write_notepad(req.text, req.wait)
    return {"success": result["success"], "error": result.get("error")}


@router.post("/os/open-whatsapp")
async def os_open_whatsapp(req: OpenWhatsAppRequest):
    """Open WhatsApp Web and type message via os_automation."""
    # First open WhatsApp Web
    result1 = await open_whatsapp_web()
    if not result1["success"]:
        return {"success": False, "error": result1.get("error")}
    # Then type the message
    result2 = await type_whatsapp_message(req.phone_number, req.message, req.wait_after)
    return {
        "success": result2["success"],
        "error": result2.get("error"),
        "whatsapp_opened": result1["success"],
    }


@router.post("/os/organize-downloads")
async def os_organize_downloads(req: OrganizeDownloadsRequest):
    """Auto-organize Downloads folder by file extension."""
    result = await organize_downloads(req.extensions)
    return {
        "success": result["success"],
        "organized": result.get("organized", 0),
        "skipped": result.get("skipped", 0),
        "error": result.get("error"),
    }