#!/usr/bin/env python3
"""Calamox Jarvis Hub UI smoke test.

Starts the FastAPI backend on a local port, drives the dashboard with
headless Chromium (Playwright), and reports pass/fail for each check.

Usage:
    python3 scripts/ui_smoke.py [--port 7860] [--no-server]

Requires: playwright installed (`pip install -e .[browser]` +
`playwright install chromium`) and a built frontend
(`cd calamox/frontend && npm run build`).
"""

import argparse
import json
import socket
import subprocess
import sys
import time
import urllib.request

BASE = ""


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def wait_for_server(port: int, timeout: int = 60) -> bool:
    url = f"http://127.0.0.1:{port}/api/health"
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=3) as r:
                if r.status == 200:
                    return True
        except Exception:
            time.sleep(1)
    return False


def api_get(path: str) -> dict:
    with urllib.request.urlopen(BASE + path, timeout=15) as r:
        return json.loads(r.read())


def api_del(path: str) -> None:
    req = urllib.request.Request(BASE + path, method="DELETE")
    urllib.request.urlopen(req, timeout=15)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=7860, help="Port to run the backend on")
    parser.add_argument("--no-server", action="store_true", help="Expect a server already running")
    args = parser.parse_args()

    global BASE
    BASE = f"http://127.0.0.1:{args.port}"

    server = None
    if not args.no_server:
        port = args.port
        server = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "calamox.backend.main:app",
             "--host", "127.0.0.1", "--port", str(port), "--log-level", "warning"],
            cwd=".", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        if not wait_for_server(port):
            print("FAIL  server did not start")
            server.terminate()
            return 1

    try:
        return run_checks()
    finally:
        if server:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()


def run_checks() -> int:
    from playwright.sync_api import sync_playwright  # local import: optional dep

    results = []

    def check(name, ok, extra=""):
        results.append(bool(ok))
        print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  ({extra})" if extra else ""))

    # Deterministic task state
    for t in api_get("/api/tasks").get("tasks", []):
        api_del(f"/api/tasks/{t['id']}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1600, "height": 950})
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))

        page.goto(BASE, wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(2500)  # let three.js spin up

        check("home loads (JARVIS HUB)", page.locator("text=JARVIS HUB").count() > 0)

        # 3D globe
        canvas = page.locator("canvas").first
        check("three.js canvas present", canvas.count() > 0)
        if canvas.count():
            box = canvas.bounding_box()
            check("globe canvas sized", box is not None and box["width"] > 300 and box["height"] > 300, str(box))

        # Layout rigidity (hotfix 0.2)
        def _width(sel):
            return page.locator(sel).first.bounding_box()["width"]

        def widths():
            return _width("aside >> nth=1"), _width("aside >> nth=2")

        tw, cw = widths()
        check("task panel locked width", 315 <= tw <= 355, f"{tw:.0f}px")
        check("chat panel locked width", 355 <= cw <= 385, f"{cw:.0f}px")
        page.locator("aside button:has-text('Agents')").first.click()
        page.wait_for_timeout(1200)
        page.locator("aside button:has-text('Jarvis Hub')").first.click()
        page.wait_for_timeout(1200)
        tw2, cw2 = widths()
        check("no collapse after re-render", abs(tw - tw2) < 2 and abs(cw - cw2) < 2,
              f"task {tw:.0f}->{tw2:.0f}, chat {cw:.0f}->{cw2:.0f}")

        # Task panel: add + complete
        task_input = page.locator("input[placeholder*='Add a task']")
        check("task panel input present", task_input.count() > 0)
        if task_input.count():
            task_input.fill("Smoke test task")
            task_input.press("Enter")
            page.wait_for_timeout(1200)
            check("task appears in panel", page.locator("text=Smoke test task").count() > 0)
            persisted = api_get("/api/tasks").get("tasks", [])
            check("task persisted via API", any(t["title"] == "Smoke test task" for t in persisted))

        # Chat: slash command round trip (no API key required)
        chat_input = page.locator("textarea[placeholder*='Message Calamox']")
        check("chat input present", chat_input.count() > 0)
        if chat_input.count():
            chat_input.fill("/help")
            chat_input.press("Enter")
            page.wait_for_timeout(2500)
            check("slash /help reply renders", page.locator("text=Available commands").count() > 0)

        # Voice controller UI renders
        mic = page.locator("button[title*='Speak']")
        unsupported = page.locator("text=Voice unsupported")
        check("voice controller UI present", mic.count() > 0 or unsupported.count() > 0,
              "mic button" if mic.count() else "unsupported notice (headless)")

        # Navigation
        page.locator("aside button:has-text('News')").first.click()
        page.wait_for_timeout(1500)
        check("news page navigates", page.locator("text=Live News").count() > 0)
        page.locator("aside button:has-text('Jarvis Hub')").first.click()
        page.wait_for_timeout(1200)
        check("back to Jarvis Hub", page.locator("text=JARVIS HUB").count() > 0)

        # Console errors
        real = [e for e in errors if "favicon" not in e and "Failed to load resource" not in e]
        check("no console/page errors", len(real) == 0, "; ".join(real[:2]))

        browser.close()

    for t in api_get("/api/tasks").get("tasks", []):
        api_del(f"/api/tasks/{t['id']}")

    failed = sum(1 for ok in results if not ok)
    print(f"\n=== SUMMARY: {len(results) - failed}/{len(results)} checks passed ===")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
