"""Bridge Client — HTTP client for the Node.js Calamox Bridge at :3000.

Provides command execution and browser automation by calling the bridge API.
Falls back to local execution if the bridge is unavailable.
"""

import time
from typing import Optional

import httpx

BRIDGE_URL = "http://localhost:3000"
BRIDGE_TIMEOUT = 120


class BridgeClient:
    """Client for the Node.js Calamox Execution Bridge."""

    def __init__(self, base_url: str = BRIDGE_URL):
        self.base_url = base_url
        self._available: Optional[bool] = None
        self._last_check = 0

    async def is_available(self, force: bool = False) -> bool:
        """Check if the bridge is running."""
        now = time.time()
        if not force and self._available is not None and (now - self._last_check) < 10:
            return self._available

        try:
            async with httpx.AsyncClient(timeout=3) as client:
                resp = await client.get(f"{self.base_url}/health")
                self._available = resp.status_code == 200
        except Exception:
            self._available = False

        self._last_check = now
        return self._available

    async def exec_command(
        self,
        command: str,
        cwd: Optional[str] = None,
        timeout_ms: int = 120_000,
        env: Optional[dict[str, str]] = None,
    ) -> dict:
        """Execute a shell command via the bridge.

        Returns: {stdout, stderr, exitCode, timedOut, durationMs}
        """
        if not await self.is_available():
            return {
                "stdout": "",
                "stderr": "Calamox Bridge not running at localhost:3000. Start it with: npm start",
                "exitCode": -1,
                "timedOut": False,
                "durationMs": 0,
                "bridge_available": False,
            }

        payload = {"command": command, "timeoutMs": timeout_ms}
        if cwd:
            payload["cwd"] = cwd
        if env:
            payload["env"] = env

        try:
            async with httpx.AsyncClient(timeout=BRIDGE_TIMEOUT) as client:
                resp = await client.post(
                    f"{self.base_url}/api/system/exec",
                    json=payload,
                )
                data = resp.json()
                data["bridge_available"] = True
                return data
        except httpx.TimeoutException:
            return {
                "stdout": "",
                "stderr": f"Bridge command timed out after {timeout_ms}ms",
                "exitCode": -1,
                "timedOut": True,
                "durationMs": timeout_ms,
                "bridge_available": True,
            }
        except Exception as e:
            return {
                "stdout": "",
                "stderr": f"Bridge error: {str(e)}",
                "exitCode": -1,
                "timedOut": False,
                "durationMs": 0,
                "bridge_available": True,
            }

    async def open_page(
        self,
        url: str,
        screenshot: bool = False,
        max_chars: int = 200_000,
    ) -> dict:
        """Open a URL in headless Chromium via the bridge.

        Returns: {title, url, text, links, screenshotBase64?}
        """
        if not await self.is_available():
            return {
                "error": "Calamox Bridge not running at localhost:3000",
                "bridge_available": False,
            }

        payload = {"url": url, "maxChars": max_chars}
        if screenshot:
            payload["screenshot"] = True

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    f"{self.base_url}/api/browser/open",
                    json=payload,
                )
                data = resp.json()
                data["bridge_available"] = True
                return data
        except Exception as e:
            return {"error": f"Bridge browser error: {str(e)}", "bridge_available": True}

    async def get_status(self) -> dict:
        """Get full bridge status."""
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                health = await client.get(f"{self.base_url}/health")
                info = await client.get(f"{self.base_url}/")
                return {
                    "available": True,
                    "url": self.base_url,
                    "health": health.json(),
                    "info": info.json(),
                }
        except Exception as e:
            return {
                "available": False,
                "url": self.base_url,
                "error": str(e),
            }


# Singleton
bridge = BridgeClient()
