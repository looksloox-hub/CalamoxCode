#!/usr/bin/env python3
"""Test mouse.click at hotspot coords vs element click vs JS dispatch."""

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

    def wait_hotspots():
        try:
            page.wait_for_selector(".news-hotspot", timeout=40000)
            return True
        except Exception:
            return False

    if not wait_hotspots():
        # RSS feeds are slow/flaky here — hit refresh and retry
        for attempt in range(3):
            print(f"retry {attempt + 1}: clicking Refresh")
            page.locator("button:has-text('Refresh')").first.click()
            if wait_hotspots():
                break
        else:
            print("NO HOTSPOTS after retries")
            browser.close()
            sys.exit(0)

    hotspot = page.locator(".news-hotspot").first
    box = hotspot.bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    print(f"hotspot center: ({cx:.0f}, {cy:.0f})")

    # getComputedStyle pointer-events on the path
    pe = hotspot.evaluate("el => getComputedStyle(el).pointerEvents")
    print(f"pointer-events: {pe}")

    # 1) real mouse click at the center point
    page.mouse.click(cx, cy)
    page.wait_for_timeout(3000)
    filt = page.locator("text=Filtering:").count()
    print(f"after mouse.click: Filtering:{filt} news_reqs:{[u for u in requests if '/api/news' in u]}")
    if filt:
        print("  Filtering text:", page.locator("text=Filtering:").first.inner_text())
        browser.close()
        sys.exit(0)

    # 2) try dispatching a native DOM click on the path
    page.locator(".news-hotspot").first.evaluate("el => el.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, view: window}))")
    page.wait_for_timeout(3000)
    filt = page.locator("text=Filtering:").count()
    print(f"after dispatchEvent: Filtering:{filt} news_reqs:{[u for u in requests if '/api/news' in u]}")
    if filt:
        print("  Filtering text:", page.locator("text=Filtering:").first.inner_text())

    browser.close()
