#!/usr/bin/env python3
"""Calamox CLI — entry point for the calamox command.

When installed via `pip install -e .`, typing `calamox` in any terminal
executes this module, starts the FastAPI server, and prints the ASCII banner.
"""

import argparse
import socket
import sys
import threading
import time
import webbrowser

BANNER = r"""
   ██████╗ █████╗ ██╗      █████╗ ███╗   ███╗██████╗ ██╗  ██╗
  ██╔════╝██╔══██╗██║     ██╔══██╗████╗ ████║██╔═══██╗╚██╗██╔╝
  ██║     ███████║██║     ███████║██╔████╔██║██║   ██║ ╚███╔╝
  ██║     ██╔══██║██║     ██╔══██║██║╚██╔╝██║██║   ██║ ██╔██╗
  ╚██████╗██║  ██║███████╗██║  ██║██║ ╚═╝ ██║╚██████╔╝██╔╝ ██╗
   ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═╝

  [+] Calamox Jarvis System Initialized Successfully!
  [+] Local UI:   {local_url}
  [+] Network UI: {network_url}
  [+] Agents:     200 across 20 groups
  [+] Press Ctrl+C to stop.
===================================================================
"""


def _get_local_ip() -> str:
    """Get the LAN IP address of this machine."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"


def _find_available_port(preferred: int) -> int:
    """Return the preferred port if available, else find a free one."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("127.0.0.1", preferred))
            return preferred
        except OSError:
            s.bind(("127.0.0.1", 0))
            return s.getsockname()[1]


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="calamox",
        description="Calamox AI — OS-level Jarvis assistant with multi-agent intelligence.",
    )
    parser.add_argument("--host", default="0.0.0.0", help="Bind host (default: 0.0.0.0)")
    parser.add_argument("--port", "-p", type=int, default=7860, help="Bind port (default: 7860)")
    parser.add_argument("--no-browser", action="store_true", help="Do not auto-open the dashboard in a browser.")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload for development.")
    args = parser.parse_args()

    port = _find_available_port(args.port)
    local_ip = _get_local_ip()
    local_url = f"http://localhost:{port}"
    network_url = f"http://{local_ip}:{port}"

    print(BANNER.format(local_url=local_url, network_url=network_url))

    if not args.no_browser:
        def _open_browser() -> None:
            time.sleep(1.5)
            webbrowser.open(local_url)
        threading.Thread(target=_open_browser, daemon=True).start()

    try:
        import uvicorn
        uvicorn.run(
            "calamox.backend.main:app",
            host=args.host,
            port=port,
            reload=args.reload,
            log_level="info",
        )
    except KeyboardInterrupt:
        print("\n[+] Calamox server stopped.")
        sys.exit(0)


if __name__ == "__main__":
    main()
