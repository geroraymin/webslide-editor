"""표 내부 경계선의 실제 포인터 조절·실행 취소·저장을 확인한다."""
from pathlib import Path
import subprocess
import sys
import time
import urllib.request
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = 'http://127.0.0.1:8862/'
server = subprocess.Popen(
    [sys.executable, '-m', 'http.server', '8862', '--bind', '127.0.0.1', '--directory', str(ROOT)],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
try:
    for _ in range(30):
        try:
            urllib.request.urlopen(BASE + 'slide-editor.html', timeout=1).close()
            break
        except OSError:
            time.sleep(.2)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 1600, 'height': 1000})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(BASE + 'slide-editor.html')
        page.locator('.slide-item').nth(3).click()
        table = page.frame_locator('#deck-frame').locator('.slide.on table')

        def sizes():
            return table.evaluate("t=>({w:t.getBoundingClientRect().width,cols:[...t.rows[0].cells].map(c=>c.getBoundingClientRect().width),rows:[...t.rows].map(r=>r.getBoundingClientRect().height)})")

        def boundary(axis):
            box = table.locator('th').first.bounding_box()
            assert box
            neighbor = (table.locator('th').nth(1) if axis == 'col' else table.locator('tr').nth(1)).bounding_box()
            return ((box['x'] + box['width'] + neighbor['x']) / 2 if axis == 'col' else box['x'] + box['width'] / 2,
                    box['y'] + box['height'] / 2 if axis == 'col' else (box['y'] + box['height'] + neighbor['y']) / 2)

        def drag(axis, distance):
            x, y = boundary(axis)
            page.mouse.move(x, y)
            assert table.evaluate('t=>t.ownerDocument.documentElement.style.cursor') == axis + '-resize'
            assert table.locator('th').first.evaluate('e=>getComputedStyle(e).cursor') == axis + '-resize'
            page.mouse.down()
            page.mouse.move(x + (distance if axis == 'col' else 0), y + (distance if axis == 'row' else 0), steps=8)
            page.mouse.up()

        for zoom in ['fit', '1']:
            page.locator('#zoom').select_option(zoom)
            before = sizes()
            markup = table.evaluate('t=>t.outerHTML')
            page.mouse.click(*boundary('col'))
            assert table.evaluate('t=>t.outerHTML') == markup, 'click changed table'
            drag('col', -45)
            after = sizes()
            assert after['cols'][0] < before['cols'][0] - 30, (before, after)
            assert after['cols'][1] > before['cols'][1] + 30, (before, after)
            assert abs(after['w'] - before['w']) < 2
            page.locator('#undo').click()
            assert table.evaluate('t=>t.outerHTML') == markup
            page.locator('#redo').click()
            drag('col', 30)
            assert sizes()['cols'][0] > after['cols'][0] + 20
            before = sizes()
            drag('row', 40)
            taller = sizes()
            assert taller['rows'][0] > before['rows'][0] + 30
            drag('row', -25)
            assert sizes()['rows'][0] < taller['rows'][0] - 20
        page.locator('#zoom').select_option('fit')
        # 열/행 추가와 삭제 뒤에도 경계선을 계속 조절할 수 있다.
        page.locator('[data-table="add-col"]').click()
        drag('col', -20)
        page.locator('[data-table="delete-col"]').click()
        page.locator('[data-table="add-row"]').click()
        drag('row', 20)
        page.locator('[data-table="delete-row"]').click()
        table.locator('td').first.dblclick()
        page.keyboard.type('edited')
        page.keyboard.press('Escape')
        assert 'edited' in table.inner_text()
        page.wait_for_timeout(600)
        page.reload()
        page.wait_for_timeout(600)
        # 자동저장 복원은 사용자가 선택하는 기존 흐름을 따른다.
        saved = page.evaluate("JSON.parse(localStorage.getItem('webslide-studio:v1:starter-deck.html'))")
        assert 'edited' in saved['slides'][3]
        assert 'table-layout: fixed' in saved['slides'][3]
        page.locator('#add-table').click()
        page.locator('#insert-form button[type=submit]').click()
        table = page.frame_locator('#deck-frame').locator('.slide.on table.ed-object')
        before = sizes()
        drag('col', -30)
        assert sizes()['cols'][0] < before['cols'][0] - 20
        drag('row', 30)
        assert sizes()['rows'][0] > before['rows'][0] + 20
        # 셀 사이 빈틈은 셀이 아닌 TABLE이 포인터 대상이 된다.
        table.evaluate("t=>{t.style.borderCollapse='separate';t.style.borderSpacing='10px'}")
        before = sizes()
        drag('col', -30)
        assert sizes()['cols'][0] < before['cols'][0] - 20
        drag('row', 30)
        assert sizes()['rows'][0] > before['rows'][0] + 20
        table.locator('th .ed-cell-text').first.click()
        page.locator('#lock-elements').click()
        before_lock = sizes()
        table.locator('th').first.dblclick()
        assert page.frame_locator('#deck-frame').locator('[contenteditable]').count() == 0, 'locked cell entered editing'
        x,y=boundary('col')
        page.mouse.move(x,y);page.mouse.down();page.mouse.move(x-30,y,steps=4);page.mouse.up()
        assert sizes() == before_lock, 'locked cell moved by table boundary drag'
        page.locator('#layers').get_by_role('button',name='잠금 해제',exact=True).click()
        table.locator('th').first.click(position={'x':5,'y':5})
        page.locator('#lock-elements').click()
        table.locator('th').first.dblclick()
        assert page.frame_locator('#deck-frame').locator('[contenteditable]').count() == 0, 'locked table entered editing'
        page.locator('#layers').get_by_role('button',name='잠금 해제',exact=True).click()
        (ROOT / 'tests/_out').mkdir(exist_ok=True)
        page.screenshot(path=str(ROOT / 'tests/_out' / 'table-resize.png'))
        assert not errors, errors
        browser.close()
finally:
    server.terminate()
    server.wait(timeout=5)
print('PASS: table boundary drag, zoom, undo/redo, row/column commands, text, saved draft')
