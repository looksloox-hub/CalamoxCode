#!/usr/bin/env python3
"""Deeper debug: log network requests on the news page and dump DOM state after pin click."""

import sys

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:7860"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1600, "height": 950})

    requests = []
    page.on("request", lambda r: requests.append(r.url) if "/api/news" in r.url else None)
    page.on("console", lambda m: print("CONSOLE-ERR:", m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: print("PAGEERROR:", str(e)))

    page.goto(BASE, wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(1500)
    page.locator("aside button:has-text('News')").first.click()

    try:
        page.wait_for_selector(".news-hotspot", timeout=45000)
        n = page.locator(".news-hotspot").count()
        print(f"hotspots: {n}")
    except Exception:
        print("NO HOTSPOTS within 45s")
        browser.close()
        sys.exit(0)

    print(f"news requests so far: {[u.split('?')[0] + ('?' + u.split('?')[1] if '?' in u else '') for u in requests]}")

    # Click first hotspot with force
    page.locator(".news-hotspot").first.click(force=True, timeout=5000)
    print("force click done")

    # Watch for 25s, printing state every 5s
    for i in range(5):
        page.wait_for_timeout(5000)
        filt = page.locator("text=Filtering:").count()
        nocard = page.locator("text=No articles").count()
        empty_msg = ""
        if nocard:
            empty_msg = page.locator("text=No articles").first.inner_text()
        msgsq = page.locator("svg").count()  # any lucide icons
        print(f"t={5*(i+1)}s  Filtering:{filt}  NoArticles:{nocard} {empty_msg!r}  news_reqs:{len([u for u in requests if '/api/news' in u])}")

    print(f"\nall news requests: {[u for u in requests if '/api/news' in u]}")
    print(f"loading spinner visible: {page.locator('.animate-spin').count()}")

    # dump the feed section html briefly
    feed = page.locator("section.w-1\\/2").last
    if feed.count():
        html = feed.inner_html()
        print(f"\nfeed html len: {len(html)}")
        print("has MessageSquarePlus:", "MessageSquarePlus" in html or "import" in html.lower())
        print("has ExternalLink:", "ExternalLink" in html or "external" in html.lower())

    browser.close()
