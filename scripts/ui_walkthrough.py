#!/usr/bin/env python3
"""Walk through the new Calamox UI features in headless Chromium.

Covers: resizable chat panel, / slash autocomplete, code execution renderer,
news map hotspots, region filter, and import-to-chat.

Usage: python3 scripts/ui_walkthrough.py [--base http://localhost:7860]
"""

import argparse
import json
import sys
import urllib.request


def api_get(path):
    with urllib.request.urlopen(path, timeout=20) as r:
        return json.loads(r.read())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="http://localhost:7860")
    args = parser.parse_args()

    results = []

    def check(name, ok, extra=""):
        results.append(bool(ok))
        print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  ({extra})" if extra else ""))

    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1600, "height": 950})
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))

        page.goto(args.base, wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(2000)

        # ── 1. Resizable chat panel ───────────────────────────────────────
        chat_aside = page.locator("aside").nth(2)
        before = chat_aside.bounding_box()["width"]
        handle = page.locator("div[title*='resize']").first
        check("resize handle present", handle.count() > 0)
        if handle.count():
            box = handle.bounding_box()
            page.mouse.move(box["x"] + box["width"] / 2, box["y"] + 400)
            page.mouse.down()
            page.mouse.move(box["x"] - 140, box["y"] + 400, steps=8)
            page.mouse.up()
            page.wait_for_timeout(300)
            after = chat_aside.bounding_box()["width"]
            check("chat panel resizes by dragging", abs(after - before) > 60, f"{before:.0f}px -> {after:.0f}px")
            # Drag back to default-ish
            box = handle.bounding_box()
            page.mouse.move(box["x"] + box["width"] / 2, box["y"] + 400)
            page.mouse.down()
            page.mouse.move(box["x"] + 140, box["y"] + 400, steps=8)
            page.mouse.up()
            page.wait_for_timeout(300)

        # ── 2. / slash autocomplete ───────────────────────────────────────
        chat_input = page.locator("textarea[placeholder*='Message Calamox']")
        check("chat input present", chat_input.count() > 0)
        if chat_input.count():
            chat_input.fill("/")
            page.wait_for_timeout(400)
            popup = page.locator("text=Commands —")
            check("slash popup opens on /", popup.count() > 0)
            list_item = page.locator("text=/session")
            check("slash list shows /session", list_item.count() > 0)
            chat_input.press("ArrowDown")
            chat_input.press("Tab")
            page.wait_for_timeout(300)
            val = chat_input.input_value()
            check("Tab autocompletes a command", val.startswith("/"), f"value={val[:30]!r}")
            chat_input.fill("/help")
            chat_input.press("Enter")
            page.wait_for_timeout(3000)
            check("/help reply renders", page.locator("text=Available commands").count() > 0)

        # ── 3. Code execution renderer ────────────────────────────────────
        if chat_input.count():
            chat_input.fill("/code echo renderer-probe")
            chat_input.press("Enter")
            page.wait_for_timeout(3500)
            check("terminal block renders command", page.locator("text=renderer-probe").count() > 0)
            check("exit badge rendered", page.locator("text=exit 0").count() > 0)

        # Wait for chat processing / TTS to settle so sidebar clicks are stable
        try:
            page.wait_for_selector(".typing-dot", state="hidden", timeout=10000)
        except Exception:
            pass
        page.wait_for_timeout(800)

        # ── 4. News map ───────────────────────────────────────────────────
        page.locator("aside button:has-text('News')").first.click()
        check("news page has World News Map heading", page.locator("text=World News Map").count() > 0)
        check("news page has Live News heading", page.locator("text=Live News").count() > 0)

        # Leaflet tiles / map container rendered
        map_el = page.locator(".leaflet-container")
        check("leaflet map rendered", map_el.count() > 0)
        if map_el.count():
            box = map_el.bounding_box()
            check("map fills left half", box is not None and box["width"] > 400, str(int(box["width"])) if box else "")

        # Wait for articles + geo hotspots to arrive (RSS aggregation is slow
        # and flaky in CI/sandboxes — retry via the Refresh button if needed)
        def _wait_hotspots(timeout=30000):
            try:
                page.wait_for_selector(".news-hotspot", timeout=timeout)
                return True
            except Exception:
                return False

        hotspots = page.locator(".news-hotspot")
        if not _wait_hotspots():
            retried = False
            for _ in range(3):
                page.locator("button:has-text('Refresh')").first.click()
                if _wait_hotspots(40000):
                    retried = True
                    break
            check("glowing hotspots present", retried, f"{hotspots.count()} pins")
        else:
            check("glowing hotspots present", True, f"{hotspots.count()} pins")

        # Import to Chat button present on articles
        try:
            page.wait_for_selector("button[title*='Import to Chat']", timeout=30000)
            check("import-to-chat button present", True)
        except Exception:
            check("import-to-chat button present", False)
        import_btn = page.locator("button[title*='Import to Chat']").first

        # ── 5. Import to chat navigates home with the article ─────────────
        if import_btn.count():
            try:
                import_btn.click(timeout=5000)
            except Exception:
                # Fallback: click the button's center coordinates directly
                try:
                    box = import_btn.bounding_box()
                    page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
                except Exception:
                    pass
            page.wait_for_timeout(4000)
            check("import navigates back to Jarvis Hub", page.locator("text=JARVIS HUB").count() > 0)
            check("imported article lands in chat", page.locator("text=Imported article").count() > 0)

        # Re-open News (the import navigated away, which remounts the module)
        page.locator("aside button:has-text('News')").first.click()
        if not _wait_hotspots(45000):
            for _ in range(3):
                page.locator("button:has-text('Refresh')").first.click()
                if _wait_hotspots(40000):
                    break

        # Click a hotspot -> region filter appears. Use a real mouse click at
        # the marker's coordinates: Playwright's locator.click(force=True) does
        # not reliably hit Leaflet's SVG-path click handler.
        if hotspots.count():
            try:
                box = hotspots.first.bounding_box()
                page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
                page.wait_for_selector("text=Filtering:", timeout=15000)
                check("clicking pin filters by region", True)
            except Exception:
                check("clicking pin filters by region", False)

        # ── Console errors ────────────────────────────────────────────────
        real = [e for e in errors if "favicon" not in e and "Failed to load resource" not in e]
        check("no console/page errors", len(real) == 0, "; ".join(real[:2]))

        browser.close()

    failed = sum(1 for ok in results if not ok)
    print(f"\n=== SUMMARY: {len(results) - failed}/{len(results)} checks passed ===")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
