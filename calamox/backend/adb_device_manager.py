"""ADB Multi-Device Manager — Android device pairing, state tracking, and parallel command execution.

Supports:
- Device discovery via IP address or QR code pairing
- Multi-device state tracking with online/offline status indicators
- Parallel ADB shell command execution across all connected devices
- Screen unlock, intent launching, and app control
- Audio playback synchronization
- Connection health monitoring with auto-reconnect
"""

import asyncio
import json
import os
import subprocess
import uuid
from datetime import datetime, timedelta
from typing import Any

import httpx


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_ADB_BRIDGE_HOST = "127.0.0.1"
DEFAULT_ADB_BRIDGE_PORT = 5555
DEFAULT_DISCOVERY_TIMEOUT = 5  # seconds
DEFAULT_HEALTH_CHECK_INTERVAL = 10  # seconds
MAX_PARALLEL_COMMANDS = 20

THEME_AMBER = "#FF6B00"
THEME_BLUE = "#00D2FF"


# ---------------------------------------------------------------------------
# Types / Data structures
# ---------------------------------------------------------------------------

class ADBDevice:
    """Represents a connected Android device via ADB."""

    def __init__(
        self,
        device_id: str,
        name: str = "",
        ip_address: str = "",
        port: int = DEFAULT_ADB_BRIDGE_PORT,
        connected_at: datetime | None = None,
        last_seen: datetime | None = None,
        capabilities: dict[str, Any] | None = None,
    ):
        self.device_id = device_id
        self.name = name or f"Phone {device_id[-8:]}"
        self.ip_address = ip_address
        self.port = port
        self.connected_at = connected_at or datetime.utcnow()
        self.last_seen = last_seen or datetime.utcnow()
        self.capabilities = capabilities or {}
        self.is_online = False
        self.is_emulated = False
        self.battery_level = None
        self.model = ""
        self.version = ""

    @property
    def address(self) -> str:
        """Return the ADB connection address (ip:port)."""
        return f"{self.ip_address}:{self.port}" if self.ip_address else ""

    @property
    def status_color(self) -> str:
        """Return the status indicator color for UI."""
        if not self.ip_address:
            return "#6B7280"  # gray - not paired
        if self.is_online:
            return "#10B981"  # green - online
        return "#EF4444"  # red - offline

    @property
    def status_label(self) -> str:
        """Return the status label for UI."""
        if not self.ip_address:
            return "Not Paired"
        if self.is_online:
            return "Online"
        return "Offline"

    def to_dict(self) -> dict:
        """Serialize to dictionary for JSON storage/transport."""
        return {
            "device_id": self.device_id,
            "name": self.name,
            "ip_address": self.ip_address,
            "port": self.port,
            "connected_at": self.connected_at.isoformat(),
            "last_seen": self.last_seen.isoformat(),
            "is_online": self.is_online,
            "is_emulated": self.is_emulated,
            "battery_level": self.battery_level,
            "model": self.model,
            "version": self.version,
            "capabilities": self.capabilities,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "ADBDevice":
        """Deserialize from dictionary."""
        dev = cls(
            device_id=data["device_id"],
            name=data.get("name", ""),
            ip_address=data.get("ip_address", ""),
            port=data.get("port", DEFAULT_ADB_BRIDGE_PORT),
            connected_at=datetime.fromisoformat(data["connected_at"]) if data.get("connected_at") else None,
            last_seen=datetime.fromisoformat(data["last_seen"]) if data.get("last_seen") else None,
            capabilities=data.get("capabilities", {}),
        )
        dev.is_online = data.get("is_online", False)
        dev.is_emulated = data.get("is_emulated", False)
        dev.battery_level = data.get("battery_level")
        dev.model = data.get("model", "")
        dev.version = data.get("version", "")
        return dev


class ADBPairingRequest:
    """Represents a pending QR code / IP pairing request."""

    def __init__(self, request_id: str, method: str, address: str, timeout: datetime):
        self.request_id = request_id
        self.method = method  # "ip" or "qr"
        self.address = address  # IP:port or QR data
        self.timeout = timeout
        self.response = None  # Set when user responds


# ---------------------------------------------------------------------------
# Singleton manager
# ---------------------------------------------------------------------------

_manager: "ADBDeviceManager | None" = None


class ADBDeviceManager:
    """Manages multi-Android device connections via ADB over Wi-Fi."""

    def __init__(self):
        self.devices: dict[str, ADBDevice] = {}  # device_id -> ADBDevice
        self.pending_pairings: dict[str, ADBPairingRequest] = {}
        self._health_task: asyncio.Task | None = None
        self._discovery_semaphore = asyncio.Semaphore(MAX_PARALLEL_COMMANDS)

        # Statistics
        self.total_pairings = 0
        self.total_commands_executed = 0
        self.total_commands_failed = 0

    # ── Registration ──────────────────────────────────────────────────────

    def register_device(self, device: ADBDevice) -> ADBDevice:
        """Register a new device or update existing one."""
        self.devices[device.device_id] = device
        device.last_seen = datetime.utcnow()
        return device

    def unregister_device(self, device_id: str) -> None:
        """Remove a device from tracking."""
        self.devices.pop(device_id, None)

    def get_device(self, device_id: str) -> ADBDevice | None:
        """Get a device by ID, returns None if not found."""
        return self.devices.get(device_id)

    def get_all_devices(self) -> list[ADBDevice]:
        """Return all tracked devices."""
        return list(self.devices.values())

    def get_online_devices(self) -> list[ADBDevice]:
        """Return only online devices."""
        return [d for d in self.devices.values() if d.is_online]

    def get_device_count(self) -> int:
        """Return total number of tracked devices."""
        return len(self.devices)

    def get_online_count(self) -> int:
        """Return number of online devices."""
        return len(self.get_online_devices())

    # ── Pairing ───────────────────────────────────────────────────────────

    def start_ip_pairing(self, ip_address: str, port: int = DEFAULT_ADB_BRIDGE_PORT) -> str:
        """Start IP-based ADB pairing. Returns a request ID."""
        request_id = str(uuid.uuid4())
        timeout = datetime.utcnow() + timedelta(seconds=DEFAULT_DISCOVERY_TIMEOUT)

        self.pending_pairings[request_id] = ADBPairingRequest(
            request_id=request_id,
            method="ip",
            address=f"{ip_address}:{port}",
            timeout=timeout,
        )
        self.total_pairings += 1
        return request_id

    def start_qr_pairing(self, qr_data: str) -> str:
        """Start QR code-based ADB pairing. Returns a request ID."""
        request_id = str(uuid.uuid4())
        timeout = datetime.utcnow() + timedelta(seconds=DEFAULT_DISCOVERY_TIMEOUT)

        self.pending_pairings[request_id] = ADBPairingRequest(
            request_id=request_id,
            method="qr",
            address=qr_data,
            timeout=timeout,
        )
        self.total_pairings += 1
        return request_id

    def cancel_pairing(self, request_id: str) -> bool:
        """Cancel a pending pairing request."""
        if request_id in self.pending_pairings:
            del self.pending_pairings[request_id]
            return True
        return False

    def get_pending_pairings(self) -> list[dict]:
        """Return all pending pairing requests for UI display."""
        now = datetime.utcnow()
        result = []
        for req in self.pending_pairings.values():
            remaining = max(0, (req.timeout - now).total_seconds())
            result.append({
                "request_id": req.request_id,
                "method": req.method,
                "address": req.address,
                "expires_in": int(remaining) if remaining > 0 else 0,
            })
        return result

    def respond_to_pairing(self, request_id: str, accept: bool) -> bool:
        """Handle user response to a pairing request."""
        if request_id not in self.pending_pairings:
            return False

        req = self.pending_pairings[request_id]

        if accept:
            # Start ADB over TCP/IP to the specified address
            return self._attempt_tcp_pairing(req.address)
        else:
            del self.pending_pairings[request_id]
            return False

    async def _attempt_tcp_pairing(self, address: str) -> bool:
        """Attempt to pair via TCP/IP ADB."""
        try:
            # Extract host:port or just host
            parts = address.split(":")
            host = parts[0]
            port = int(parts[1]) if len(parts) > 1 else DEFAULT_ADB_BRIDGE_PORT

            # Actually add the device via ADB
            success = await asyncio.get_event_loop().run_in_executor(
                None,
                self._adb_tcp_connect,
                host,
                port,
            )

            if success:
                # Device is now available - mark it as paired
                # We'll create a device entry when we discover it
                return True
            return False

        except Exception as e:
            print(f"TCP pairing error: {e}")
            return False

    def _adb_tcp_connect(self, host: str, port: int) -> bool:
        """Platform-specific ADB TCP connect."""
        try:
            # adb tcpip <port> - switches ADB to TCP mode
            subprocess.run(
                ["adb", "tcpip", str(port)],
                capture_output=True,
                timeout=5,
            )
            # Connect to the device
            result = subprocess.run(
                ["adb", "connect", f"{host}:{port}"],
                capture_output=True,
                timeout=5,
            )
            return result.returncode == 0
        except Exception:
            return False

    # ── Device Discovery ──────────────────────────────────────────────────

    async def discover_devices(self) -> list[ADBDevice]:
        """Discover ADB devices on the network."""
        discovered = []

        # Get list of connected ADB devices
        try:
            result = await asyncio.get_event_loop().run_in_executor(
                None,
                self._adb_devices_list,
            )
            lines = result.strip().split("\n") if result else []
        except Exception:
            return discovered

        for line in lines:
            if not line.strip():
                continue
            # adb output format: "List of devices attached\nXYZABC12345\tdevice\n"
            parts = line.split("\t")
            if len(parts) >= 2 and parts[1] == "device":
                device_id = parts[0].strip()
                # Try to get device details
                device_info = await self._get_device_info(device_id)
                device = ADBDevice(
                    device_id=device_id,
                    name=device_info.get("model", f"Device {device_id[-8:]}"),
                    ip_address=device_info.get("ip", ""),
                    capabilities=device_info.get("capabilities", {}),
                )
                self.register_device(device)
                discovered.append(device)

        return discovered

    def _adb_devices_list(self) -> str:
        """List ADB devices (synchronous, run in executor)."""
        try:
            result = subprocess.run(
                ["adb", "devices"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            return result.stdout
        except Exception:
            return ""

    async def _get_device_info(self, device_id: str) -> dict[str, Any]:
        """Get detailed info about a specific ADB device."""
        loop = asyncio.get_event_loop()

        # Get model
        model = await loop.run_in_executor(
            None,
            self._adb_shell_command,
            device_id,
            "getprop ro.product.model",
        )

        # Get Android version
        version = await loop.run_in_executor(
            None,
            self._adb_shell_command,
            device_id,
            "getprop ro.version.os",
        )

        # Get battery level (may fail on some devices)
        battery = await loop.run_in_executor(
            None,
            self._adb_shell_command,
            device_id,
            "dumpsys battery | grep -l level",
        )
        try:
            bl = int(battery.split(":")[1].strip()) if ":" in battery else None
        except (ValueError, IndexError):
            bl = None

        # Check if device is emulated
        is_emulated = await loop.run_in_executor(
            None,
            self._adb_shell_command,
            device_id,
            "getprop ro.product.is_emulated",
        )
        is_emulated_val = is_emulated.strip().lower() == "true" if is_emulated else False

        return {
            "model": model.strip() if model else "",
            "version": version.strip() if version else "",
            "battery_level": bl,
            "is_emulated": is_emulated_val,
            "capabilities": {
                "has_battery": bl is not None,
                "is_emulated": is_emulated_val,
            },
        }

    def _adb_shell_command(self, device_id: str, command: str) -> str:
        """Run a shell command on a specific ADB device."""
        try:
            result = subprocess.run(
                ["adb", "-s", device_id, "shell", command],
                capture_output=True,
                text=True,
                timeout=10,
            )
            return result.stdout.strip()
        except Exception:
            return ""

    # ── Health monitoring ─────────────────────────────────────────────────

    async def start_health_monitoring(self):
        """Start periodic health check task."""
        if self._health_task and not self._health_task.done():
            self._health_task.cancel()
        self._health_task = asyncio.create_task(self._health_check_loop())

    async def stop_health_monitoring(self):
        """Stop the health check task."""
        if self._health_task and not self._health_task.done():
            self._health_task.cancel()
            self._health_task = None

    async def _health_check_loop(self):
        """Periodically check device connectivity."""
        while True:
            try:
                await asyncio.sleep(DEFAULT_HEALTH_CHECK_INTERVAL)
                await self._check_all_devices_health()
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"Health check error: {e}")

    async def _check_all_devices_health(self):
        """Check health of all devices."""
        now = datetime.utcnow()
        for device in self.devices.values():
            # If device has no IP, mark as not online
            if not device.ip_address:
                device.is_online = False
                device.last_seen = now
                continue

            # Quick connectivity check
            try:
                # Try a simple command to check if device responds
                result = await asyncio.get_event_loop().run_in_executor(
                    None,
                    self._adb_shell_command,
                    device.device_id,
                    "echo test",
                )
                was_online = device.is_online
                device.is_online = bool(result) and "test" in result.lower()
                device.last_seen = now

                # If status changed, we could publish an event here
                # if not was_online and device.is_online:
                #     await self._publish_device_event(device, "online")
            except Exception:
                device.is_online = False
                device.last_seen = now

    # ── Command execution ─────────────────────────────────────────────────

    async def execute_parallel(
        self,
        command: str,
        device_ids: list[str] | None = None,
        timeout: int = 30,
    ) -> dict[str, dict[str, Any]]:
        """Execute a command in parallel across selected devices.

        Returns: {device_id: {stdout, stderr, exit_code, success}}
        """
        targets = (
            [self.get_device(did) for did in device_ids if self.get_device(did)]
            if device_ids
            else list(self.devices.values())
        )

        if not targets:
            return {"error": "No devices available"}

        semaphore = asyncio.Semaphore(MAX_PARALLEL_COMMANDS)

        async def _execute(device: ADBDevice) -> dict[str, Any]:
            async with semaphore:
                return await asyncio.get_event_loop().run_in_executor(
                    None,
                    self._execute_on_device,
                    device,
                    command,
                    timeout,
                )

        # Execute all commands in parallel
        tasks = [_execute(dev) for dev in targets]
        results_list = await asyncio.gather(*tasks, return_exceptions=True)

        results: dict[str, dict[str, Any]] = {}
        for i, (device, result) in enumerate(zip(targets, results_list)):
            if isinstance(result, Exception):
                results[device.device_id] = {
                    "stdout": "",
                    "stderr": str(result),
                    "exit_code": -1,
                    "success": False,
                }
            else:
                results[device.device_id] = result

        self.total_commands_executed += len(targets)
        return results

    def _execute_on_device(
        self,
        device: ADBDevice,
        command: str,
        timeout: int,
    ) -> dict[str, Any]:
        """Execute a single ADB shell command on a device (synchronous)."""
        try:
            full_command = ["adb", "-s", device.device_id, "shell", command]
            result = subprocess.run(
                full_command,
                capture_output=True,
                text=True,
                timeout=timeout,
            )

            output = result.stdout.strip()
            error = result.stderr.strip()

            # Determine success based on exit code and output
            exit_code = result.returncode
            success = exit_code == 0 or (output and not error)

            return {
                "stdout": output,
                "stderr": error,
                "exit_code": exit_code,
                "success": success,
            }
        except subprocess.TimeoutExpired:
            return {
                "stdout": "",
                "stderr": f"Command timed out after {timeout}s",
                "exit_code": -1,
                "success": False,
            }
        except Exception as e:
            return {
                "stdout": "",
                "stderr": str(e),
                "exit_code": -1,
                "success": False,
            }

    # ── Specific ADB operations ───────────────────────────────────────────

    async def unlock_screen(self, device_ids: list[str] | None = None) -> dict[str, dict[str, Any]]:
        """Unlock the screen on selected devices."""
        return await self.execute_parallel(
            "input keyevent 82",  # KEYCODE_POWER to turn screen on, then dismiss
            device_ids=device_ids,
            timeout=10,
        )

    async def lock_screen(self, device_ids: list[str] | None = None) -> dict[str, dict[str, Any]]:
        """Lock the screen on selected devices."""
        return await self.execute_parallel(
            "input keyevent 26",  # KEYCODE_POWER to lock
            device_ids=device_ids,
            timeout=5,
        )

    async def open_app(
        self,
        package_name: str,
        activity: str | None = None,
        device_ids: list[str] | None = None,
    ) -> dict[str, dict[str, Any]]:
        """Open an app by package name on selected devices."""
        intent = f"am start -n {package_name}"
        if activity:
            intent += f"/{activity}"
        intent += " -a android.intent.action.MAIN -c android.intent.category.LAUNCHER"

        return await self.execute_parallel(
            f"shell am start -n {package_name}/.MainActivity",
            device_ids=device_ids,
            timeout=15,
        )

    async def take_screenshot(self, device_ids: list[str] | None = None) -> dict[str, dict[str, Any]]:
        """Take a screenshot on selected devices."""
        return await self.execute_parallel(
            "shell screencap -p /sdcard/screenshot.png && pull /sdcard/screenshot.png .",
            device_ids=device_ids,
            timeout=15,
        )

    async def get_device_status(self, device_ids: list[str] | None = None) -> dict[str, dict[str, Any]]:
        """Get status of selected devices."""
        return await self.execute_parallel(
            "shell getprop sys.devicesetup.state",
            device_ids=device_ids,
            timeout=10,
        )

    async def sync_audio_playback(self, device_ids: list[str] | None = None) -> dict[str, dict[str, Any]]:
        """Sync audio playback across selected devices."""
        return await self.execute_parallel(
            "shell am start -a android.intent.action.MEDIA_PLAY",
            device_ids=device_ids,
            timeout=10,
        )

    # ── Statistics & Reporting ────────────────────────────────────────────

    def get_statistics(self) -> dict[str, Any]:
        """Get manager statistics for dashboard display."""
        online = self.get_online_count()
        total = self.get_device_count()

        # Priority of online devices
        online_devices = self.get_online_devices()

        return {
            "total_devices": total,
            "online_devices": online,
            "offline_devices": total - online,
            "pending_pairings": len(self.pending_pairings),
            "total_commands_executed": self.total_commands_executed,
            "total_commands_failed": self.total_commands_failed,
            "devices": [dev.to_dict() for dev in online_devices],
            "theme_amber": THEME_AMBER,
            "theme_blue": THEME_BLUE,
        }

    def to_json(self) -> str:
        """Serialize manager state to JSON."""
        return json.dumps({
            "devices": {did: dev.to_dict() for did, dev in self.devices.items()},
            "pending_pairings": {
                rid: {
                    "method": req.method,
                    "address": req.address,
                    "timeout": req.timeout.isoformat(),
                }
                for rid, req in self.pending_pairings.items()
            },
            "statistics": self.get_statistics(),
        }, indent=2, default=str)

    @classmethod
    def from_json(cls, data: dict) -> "ADBDeviceManager":
        """Deserialize manager state from JSON."""
        manager = cls()
        for dev_data in data.get("devices", {}).values():
            device = ADBDevice.from_dict(dev_data)
            manager.register_device(device)
        for pairing_data in data.get("pending_pairings", {}).values():
            req = ADBPairingRequest(
                request_id=pairing_data["request_id"],
                method=pairing_data["method"],
                address=pairing_data["address"],
                timeout=datetime.fromisoformat(pairing_data["timeout"]),
            )
            manager.pending_pairings[pairing_data["request_id"]] = req
        return manager


# ── Module-level access ───────────────────────────────────────────────────

def get_manager() -> ADBDeviceManager:
    """Get the global ADB device manager instance."""
    global _manager
    if _manager is None:
        _manager = ADBDeviceManager()
    return _manager


# ── Convenience functions ─────────────────────────────────────────────────

async def pair_device_ip(ip_address: str, port: int = DEFAULT_ADB_BRIDGE_PORT) -> str:
    """Convenience function to pair a device via IP."""
    return get_manager().start_ip_pairing(ip_address, port)


async def pair_device_qr(qr_data: str) -> str:
    """Convenience function to pair a device via QR code."""
    return get_manager().start_qr_pairing(qr_data)


async def discover_all_devices() -> list[ADBDevice]:
    """Convenience function to discover all ADB devices."""
    return await get_manager().discover_devices()


async def execute_command_parallel(
    command: str,
    device_ids: list[str] | None = None,
    timeout: int = 30,
) -> dict[str, dict[str, Any]]:
    """Convenience function to execute a command in parallel."""
    return await get_manager().execute_parallel(command, device_ids=device_ids, timeout=timeout)


async def unlock_all_screens() -> dict[str, dict[str, Any]]:
    """Convenience function to unlock all device screens."""
    return await get_manager().unlock_screen()


async def lock_all_screens() -> dict[str, dict[str, Any]]:
    """Convenience function to lock all device screens."""
    return await get_manager().lock_screen()