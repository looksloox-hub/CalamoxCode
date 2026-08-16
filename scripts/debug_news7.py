#!/usr/bin/env python3
"""Inspect Leaflet SVG/pane sizing on fresh mount vs remount."""

import sys

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:7860"

PROBE = """() => {
  const cont = document.querySelector('.leaflet-container');
  const svg = document.querySelector('.leaflet-overlay-pane svg, .leaflet-marker-pane svg');
  const mapPane = document.querySelector('.leaflet-map-pane');
  return {
    contClient: cont ? [cont.clientWidth, cont.clientHeight] : null,
    contRect: cont ? [Math.round(cont.getBoundingClientRect().width), Math.round(cont.getBoundingClientRect().height)] : null,
    svgAttr: svg ? [svg.getAttribute('width'), svg.getAttribute('height')] : null,
    svgStyle: svg ? [svg.style.width, svg.style.height] : null,
    paneRect: mapPane ? [Math.round(mapPane.getBoundingClientRect().width), Math.round(mapPane.getBoundingClientRect().height)] : null,
    tileCount: document.querySelectorAll('.leaflet-tile').length,
    mapPaneTransform: mapPane ? getComputedStyle(mapPane).transform : null,
  };
}"""

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

    def probe(label):
        page.wait_for_timeout(1500)
        print(f"[{label}]", page.evaluate(PROBE))

    wait_hotspots()
    probe("visit 1 after hotspots")

    # import → home → news (remount)
    page.locator("button[title*='Import to Chat']").first.click(timeout=5000)
    page.wait_for_timeout(3000)
    page.locator("aside button:has-text('News')").first.click()
    wait_hotspots(45000)
    probe("visit 2 (remount)")

    # Force a real invalidateSize via a genuine window resize (Leaflet hooks it)
    page.set_viewport_size({"width": 1400, "height": 900})
    page.wait_for_timeout(2000)
    probe("visit 2 after viewport resize")

    browser.close()
