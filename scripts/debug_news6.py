#!/usr/bin/env python3
"""Measure map container / pane / marker geometry on visit 1 vs remount (visit 2)."""

import sys

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:7860"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1600, "height": 950})

    page.goto(BASE, wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(1500)
    page.locator("aside button:has-text('News')").first.click()

    def wait_hotspots(timeout=30000):
        try:
            page.wait_for_selector(".news-hotspot", timeout=timeout)
            return True
        except Exception:
            return False

    def dump(label):
        page.wait_for_timeout(2000)
        mc = page.locator(".leaflet-container").first.bounding_box()
        mp = page.locator(".leaflet-map-pane").first.bounding_box()
        tr = page.locator(".leaflet-map-pane").first.evaluate("el => getComputedStyle(el).transform")
        hs = page.locator(".news-hotspot")
        boxes = [hs.nth(i).bounding_box() for i in range(min(3, hs.count()))]
        aside = page.locator("aside").first.bounding_box()
        print(f"\n[{label}]")
        print(f"  sidebar: x={aside['x']:.0f} w={aside['width']:.0f}")
        print(f"  map container: x={mc['x']:.0f} y={mc['y']:.0f} w={mc['width']:.0f} h={mc['height']:.0f}")
        print(f"  map pane: x={mp['x']:.0f} y={mp['y']:.0f} w={mp['width']:.0f} h={mp['height']:.0f}")
        print(f"  map pane transform: {tr}")
        for i, b in enumerate(boxes):
            print(f"  hotspot[{i}]: x={b['x']:.0f} y={b['y']:.0f} w={b['width']:.0f}")

    wait_hotspots()
    dump("visit 1 (fresh mount)")

    # import to chat (navigates home)
    page.locator("button[title*='Import to Chat']").first.click(timeout=5000)
    page.wait_for_timeout(3000)

    # back to news (remount)
    page.locator("aside button:has-text('News')").first.click()
    wait_hotspots(45000)
    dump("visit 2 (remount)")

    # Also try: does the map pane get a correct size after a manual resize event?
    page.evaluate("window.dispatchEvent(new Event('resize'))")
    page.wait_for_timeout(1500)
    dump("visit 2 after window resize event")

    browser.close()
