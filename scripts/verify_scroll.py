"""Verify scrollability of the API Key Manager page on the running dashboard."""
import json
import sys

from playwright.sync_api import sync_playwright

BASE = "http://localhost:7860"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    console_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)

    page.goto(BASE)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(800)

    # Navigate to the API Keys page via the sidebar
    page.get_by_role("button", name="Keys").click()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(800)

    # Find the scrollable wrapper and measure scrollability
    result = page.evaluate("""() => {
        const scrollers = [...document.querySelectorAll('main > div')]
            .filter(el => el.scrollHeight > el.clientHeight);
        const wrapper = document.querySelector('main > div');
        const before = wrapper ? { sh: wrapper.scrollHeight, ch: wrapper.clientHeight } : null;
        if (wrapper) wrapper.scrollTop = 99999;
        const after = wrapper ? { st: wrapper.scrollTop } : null;
        return {
            title: document.title,
            bodyScrollable: document.documentElement.scrollHeight > document.documentElement.clientHeight,
            wrapper,
            before,
            after,
            headerText: document.querySelector('h1')?.textContent || ''
        };
    }""")

    print(json.dumps(result, indent=2))

    # Screenshot before and after scrolling
    page.screenshot(path="/tmp/keys_top.png")
    page.evaluate("document.querySelector('main > div').scrollTo({top: 99999, behavior: 'instant'})")
    page.wait_for_timeout(300)
    page.screenshot(path="/tmp/keys_bottom.png")
    print("console errors:", console_errors[:5] or "none")
    browser.close()

    scrollable = result.get("wrapper") and result["after"].get("st", 0) > 0
    sys.exit(0 if scrollable else 1)
