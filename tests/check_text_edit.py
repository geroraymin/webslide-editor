"""텍스트 편집 시작 시 DOM·좌표·줄바꿈 보존과 실제 입력·실행 취소를 검사한다."""
from pathlib import Path
import json
import subprocess
import sys
import tempfile
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
server = subprocess.Popen([sys.executable, '-m', 'http.server', '8863', '--bind', '127.0.0.1', '--directory', str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
try:
    with tempfile.TemporaryDirectory() as folder, sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 1600, 'height': 1000})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto('http://127.0.0.1:8863/slide-editor.html')
        expect(page.locator('.slide-item')).to_have_count(6)
        fixture = Path(folder) / 'text.slides.json'
        fixture.write_text(json.dumps({'format':'slide-studio','version':1,'name':'text edit check','slides':[
            '<section class="slide"><div class="content"><h2>가운데 제목 <span class="word">강조 단어</span></h2><p class="plain">두 줄 문장<br>두 번째 줄</p><p class="scaled" style="scale:.8;translate:40px 0" data-ed-scale=".8" data-ed-x="40">크기 조절한 문장</p><div class="row"><span>왼쪽 문장</span><span>오른쪽 문장</span></div></div></section>'
        ],'design':{'bodyClass':'v4','css':'.slide{position:absolute;inset:0;width:1600px;height:900px}.content{position:absolute;left:200px;top:180px;width:1100px;height:550px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:35px}h2,p{margin:0;font-size:40px;line-height:1.5;text-align:center}.row{display:flex;gap:70px;font-size:34px}.word{color:#a33}'}}), encoding='utf-8')
        page.locator('#project-file').set_input_files(str(fixture))
        page.locator('#confirm-yes').click()
        expect(page.locator('.slide-item')).to_have_count(1)
        frame = page.frames[1]
        measure = '''()=>{const s=document.querySelector('.slide.on'),copy=s.cloneNode(true);copy.classList.remove('on');copy.querySelectorAll('[contenteditable],[data-editing]').forEach(e=>{e.removeAttribute('contenteditable');e.removeAttribute('data-editing')});return {html:copy.outerHTML,rects:[...s.querySelectorAll('*')].map(e=>{const r=e.getBoundingClientRect();const range=document.createRange();range.selectNodeContents(e);return {box:[r.x,r.y,r.width,r.height],text:[...range.getClientRects()].map(r=>[r.x,r.y,r.width,r.height])}})}}'''
        for selector in ['.word', '.plain', '.scaled', '.row span:first-child', '.row span:last-child']:
            before = frame.evaluate(measure)
            frame.locator(selector).dblclick()
            assert frame.locator('[contenteditable]').count() == 1
            after = frame.evaluate(measure)
            assert before == after, (selector, 'entering text edit changed layout or DOM', before, after)
            page.keyboard.press('Escape')
            assert frame.evaluate(measure) == before
        # Enter 키도 같은 편집 시작 함수를 통과한다.
        frame.locator('.plain').click()
        before = frame.evaluate(measure)
        for handle in ['nw','ne','sw','se','e','w']:
            page.locator('[data-handle='+handle+']').click()
            assert frame.evaluate(measure) == before, ('no-op resize changed layout', handle)
        frame.locator('.plain').click()
        before = frame.evaluate(measure)
        page.keyboard.press('Enter')
        assert frame.evaluate(measure) == before
        page.keyboard.type('replacement')
        page.keyboard.press('Escape')
        assert frame.locator('.plain').inner_text() == 'replacement'
        page.locator('#undo').click()
        assert frame.evaluate(measure) == before
        page.locator('#redo').click()
        assert frame.locator('.plain').inner_text() == 'replacement'
        # 속성창 수정도 원래 부모 배치를 유지한다.
        first=frame.locator('.row span:first-child');first_id=first.get_attribute('data-ed-id');first=frame.locator('[data-ed-id="'+first_id+'"]')
        neighbor_before=frame.locator('.row span:last-child').bounding_box()
        first.click()
        page.locator('#text-content').fill('새 문장')
        page.locator('#text-content').press('Tab')
        assert first.inner_text() == '새 문장'
        neighbor_after=frame.locator('.row span:last-child').bounding_box()
        assert all(abs(neighbor_after[k]-neighbor_before[k])<1 for k in neighbor_before),('property text edit moved neighbor',neighbor_before,neighbor_after)
        page.locator('#add-table').click()
        page.locator('#insert-form button[type=submit]').click()
        table = frame.locator('.slide.on table')
        text = table.locator('th .ed-cell-text').first
        grid = 't=>[t,...t.querySelectorAll("th,td")].map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]})'
        before_grid = table.evaluate(grid)
        text.click()
        expect(page.locator('#selection-name')).to_have_text('선택한 텍스트')
        original = text.bounding_box()
        handle = page.locator('#move-handle').bounding_box()
        x, y = handle['x']+handle['width']/2, handle['y']+handle['height']/2
        page.keyboard.down('Alt')
        page.mouse.move(x,y)
        page.mouse.down()
        assert text.bounding_box() == original, 'move handle press moved text'
        page.mouse.move(x+25,y+15,steps=5)
        page.mouse.up()
        page.keyboard.up('Alt')
        moved = text.bounding_box()
        assert abs(moved['x']-original['x']-25)<1
        assert abs(moved['y']-original['y']-15)<1
        assert table.evaluate(grid) == before_grid, 'moving text changed table cells'
        page.locator('#undo').click()
        assert text.bounding_box() == original
        page.locator('#redo').click()
        assert text.bounding_box() == moved
        text.dblclick()
        assert text.bounding_box() == moved, 'double-click moved table text'
        page.keyboard.type('table edit')
        page.keyboard.press('Escape')
        assert text.inner_text() == 'table edit'
        text.click()
        before_size = table.evaluate(grid)
        page.locator('#font-size').fill('24')
        page.locator('#font-size').press('Tab')
        assert table.evaluate(grid) == before_size, 'font size moved table cells'
        saved = text.get_attribute('style')
        with page.expect_download() as download:
            page.locator('#export-html').click()
        exported = Path(folder) / 'presentation.html'
        download.value.save_as(str(exported))
        assert 'ed-cell-text' in exported.read_text(encoding='utf-8')
        # JSON 저장·복원에서 글자 상자가 중복 생성되지 않는다.
        page.wait_for_timeout(500)
        draft = page.evaluate("JSON.parse(localStorage.getItem('webslide-studio:v1:starter-deck.html'))")
        fixture.write_text(json.dumps(draft),encoding='utf-8')
        page.locator('#project-file').set_input_files(str(fixture))
        page.locator('#confirm-yes').click()
        assert table.locator('.ed-cell-text').count() == table.locator('th,td').count()
        assert text.get_attribute('style') == saved
        assert not errors, errors
        browser.close()
finally:
    server.terminate()
    server.wait(timeout=5)
print('PASS: stable double-click/Enter, nested/scaled text, table text selection/move/size, undo/redo, HTML/JSON save')
