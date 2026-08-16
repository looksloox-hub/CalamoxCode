#!/usr/bin/env python3
"""Replicate walkthrough sequence: import-to-chat first, then re-open News, then pin click."""

import sys

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:7860"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1600, "height": 950})

    requests = []
    page.on("request", lambda r: requests.append(r.url) if "/api/news" in r.url else None)

    page.goto(BASE, wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(1500)
    page.locator("aside button:has-text('News')").first.click()

    def wait_hotspots(timeout=30000):
        try:
            page.wait_for_selector(".news-hotspot", timeout=timeout)
            return True
        except Exception:
            return False

    wait_hotspots()
    print(f"news visit 1 hotspots: {page.locator('.news-hotspot').count()}")

    # Import to chat
    import_btn = page.locator("button[title*='Import to Chat']").first
    print(f"import buttons: {import_btn.count()}")
    import_btn.click(timeout=5000)
    page.wait_for_timeout(4000)
    print(f"after import: JARVIS HUB: {page.locator('text=JARVIS HUB').count()}, Imported article: {page.locator('text=Imported article').count()}")

    # Re-open News
    page.locator("aside button:has-text('News')").first.click()
    wait_hotspots(45000)
    print(f"news visit 2 hotspots: {page.locator('.news-hotspot').count()}")

    page.wait_for_timeout(2500)  # let marker redraw settle
    hotspot = page.locator(".news-hotspot").first
    box = hotspot.bounding_box()
    print(f"hotspot box: {box}")
    if not box:
        print("NO BOX — marker gone")
        browser.close()
        sys.exit(0)
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2

    info = page.evaluate(
        """([x, y]) => {
            const el = document.elementFromPoint(x, y);
            if (!el) return "null";
            return { tag: el.tagName, cls: el.getAttribute && el.getAttribute('class') };
        }""",
        [cx, cy],
    )
    print(f"elementFromPoint at ({cx:.0f},{cy:.0f}): {info}")

    page.mouse.click(cx, cy)
    page.wait_for_timeout(3000)
    filt = page.locator("text=Filtering:").count()
    print(f"Filtering: {filt}  reqs: {[u for u in requests if '/api/news' in u]}")
    if filt:
        print("  text:", page.locator("text=Filtering:").first.inner_text())

    browser.close()
