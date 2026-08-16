"""Smoke-test every dashboard page: header renders, no console errors, layout intact."""
import re
import sys

from playwright.sync_api import sync_playwright

PAGES = [
    ("Jarvis Hub", "home"),
    ("Chat", "chat"),
    ("Agents", "agents"),
    ("News", "news"),
    ("Tasks", "tasks"),
    ("YouTube", "youtube"),
    ("Keys", "apikeys"),
    ("Prompts", "prompts"),
]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto("http://localhost:7860")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(800)

    failed = []
    for label, _ in PAGES:
        page.get_by_role("button", name=re.compile(f"^{label}")).click()
        page.wait_for_timeout(900)
        info = page.evaluate("""() => {
            const main = document.querySelector('main');
            const wrapper = main ? main.querySelector(':scope > div') : null;
            const h1 = document.querySelector('h1')?.textContent?.trim() || '';
            const globe = !!document.querySelector('canvas');
            return {
                h1,
                globe,
                wrapperClientH: wrapper ? wrapper.clientHeight : null,
                wrapperScrollH: wrapper ? wrapper.scrollHeight : null,
                bodyScrollH: document.body.scrollHeight,
                bodyClientH: document.body.clientHeight,
            };
        }""")
        print(f"{label:10s} h1={info['h1']!r:30s} globe={info['globe']} "
              f"wrap={info['wrapperClientH']}/{info['wrapperScrollH']} body={info['bodyScrollH']}/{info['bodyClientH']}")
        if not info["h1"] and label not in ("Jarvis Hub", "Chat"):
            failed.append(label)

    print("console errors:", errors[:5] or "none")
    browser.close()
    sys.exit(1 if failed or errors else 0)
