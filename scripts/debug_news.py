#!/usr/bin/env python3
"""Debug the two failing walkthrough checks: pin region filter + import button."""

import sys

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:7860"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1600, "height": 950})
    page.on("console", lambda m: print("CONSOLE:", m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: print("PAGEERROR:", str(e)))

    page.goto(BASE, wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(2000)

    page.locator("aside button:has-text('News')").first.click()
    page.wait_for_timeout(1500)

    # Wait for hotspots
    try:
        page.wait_for_selector(".news-hotspot", timeout=45000)
        n = page.locator(".news-hotspot").count()
        print(f"hotspots: {n}")
    except Exception:
        print("NO HOTSPOTS within 45s")
        browser.close()
        sys.exit(0)

    # Are import buttons present before clicking?
    btns = page.locator("button[title*='Import to Chat']")
    print(f"import buttons before click: {btns.count()}")

    # Article count before click
    print(f"article cards before click: {page.locator('.glass').count()}")

    hotspot = page.locator(".news-hotspot").first
    print(f"hotspot box: {hotspot.bounding_box()}")

    # Try a normal click (not force) first
    try:
        hotspot.click(timeout=5000)
        print("normal click OK")
    except Exception as e:
        print(f"normal click failed: {type(e).__name__}")
        try:
            hotspot.click(force=True, timeout=5000)
            print("force click OK")
        except Exception as e2:
            print(f"force click failed: {type(e2).__name__}")

    page.wait_for_timeout(2500)
    filt = page.locator("text=Filtering:")
    print(f"'Filtering:' elements after click: {filt.count()}")
    if filt.count():
        print("  text:", filt.first.inner_text())

    page.wait_for_timeout(15000)
    btns2 = page.locator("button[title*='Import to Chat']")
    print(f"import buttons after click+15s: {btns2.count()}")
    cards = page.locator(".glass")
    print(f"article cards after click+15s: {cards.count()}")
    empty = page.locator("text=No articles")
    print(f"'No articles' text: {empty.count()}")
    if empty.count():
        print("  text:", empty.first.inner_text())

    browser.close()
