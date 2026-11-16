"""독립 편집도구의 시작·편집·장표 복사를 실제 브라우저로 확인한다."""
from pathlib import Path
import subprocess
import sys
import time
import urllib.request

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = "http://127.0.0.1:8861/"
(ROOT / "tests/_out").mkdir(exist_ok=True)
server = subprocess.Popen(
    [sys.executable, "-m", "http.server", "8861", "--bind", "127.0.0.1", "--directory", str(ROOT)],
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
)

try:
    for _ in range(30):
        try:
            urllib.request.urlopen(BASE + "slide-editor.html", timeout=1).close()
            break
        except OSError:
            time.sleep(0.2)
    else:
        raise RuntimeError("로컬 편집기 서버를 시작하지 못했습니다.")

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1600, "height": 1000})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(BASE + "slide-editor.html")
        page.wait_for_timeout(1000)
        if not page.locator(".slide-item").count():
            resources=page.evaluate("performance.getEntriesByType('resource').map(e=>e.name)")
            raise AssertionError(f"편집기 초기화 실패: {page.locator('#save-status').inner_text()} / {errors} / {resources}")
        expect(page.locator(".slide-item")).to_have_count(6)
        expect(page.locator("#deck-name")).to_have_value("새 교육자료")

        page.locator("#selection-name").click()
        page.keyboard.press("Control+c")
        page.keyboard.press("Control+v")
        expect(page.locator(".slide-item")).to_have_count(7)
        page.locator("#undo").click()
        expect(page.locator(".slide-item")).to_have_count(6)

        page.locator("#add-table").click()
        page.locator("[name=rows]").fill("2")
        page.locator("[name=cols]").fill("2")
        page.locator("#insert-form button[type=submit]").click()
        table = page.frame_locator("#deck-frame").locator(".slide.on table.ed-object")
        expect(table).to_have_count(1)
        table.locator("td").first.click()
        page.locator("#table-cell-padding").fill("31")
        page.locator("#table-cell-padding").press("Tab")
        assert table.locator("td").last.evaluate("e => e.style.padding") == "31px"
        page.screenshot(path=str(ROOT / "tests/_out" / "studio-ready.png"), full_page=True)
        assert not errors, errors
        browser.close()
finally:
    server.terminate()
    server.wait(timeout=5)

print("PASS: standalone studio core flows")
