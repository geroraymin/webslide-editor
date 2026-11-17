"""글자 색: 고르는 동안 바로 보이고, 확인하면 실행 취소 한 번으로 되돌릴 수 있고, 안쪽 강조 글자까지 바뀌는지 (r23).
사용: python tools/check_text_color.py
"""
from pathlib import Path
import json, subprocess, sys, tempfile
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
SLIDE = ('<section class="slide"><div class="ed-text ed-object" data-ed-id="t1" style="position:absolute;left:120px;top:300px;width:900px;font-size:40px;color:#111">'
         '특화된 분야를 <em style="font-style:normal;color:#2350F5">일반 청소년시설에 알리고 공유</em>하는 것</div></section>')
server = subprocess.Popen([sys.executable, '-m', 'http.server', '8859', '--bind', '127.0.0.1', '--directory', str(ROOT)],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
ok = True
def check(label, cond):
    global ok; ok &= bool(cond); print(('PASS ' if cond else 'FAIL ') + label)
try:
    with tempfile.TemporaryDirectory() as tmp, sync_playwright() as p:
        f = Path(tmp) / 't.slides.json'; f.write_text(json.dumps({'format': 'slide-studio', 'version': 1, 'name': 't', 'slides': [SLIDE]}, ensure_ascii=False), encoding='utf-8')
        b = p.chromium.launch(); page = b.new_page(viewport={'width': 1600, 'height': 1000})
        page.goto('http://127.0.0.1:8859/slide-editor.html'); expect(page.locator('.slide-item')).to_have_count(6)
        page.locator('#project-file').set_input_files(str(f)); page.locator('#confirm-yes').click(); page.wait_for_timeout(600)
        fr = page.frames[1]; t = fr.locator('[data-ed-id="t1"]'); em = fr.locator('[data-ed-id="t1"] em')
        col = lambda l: l.evaluate("e=>getComputedStyle(e).color")
        t.click(position={'x': 10, 'y': 10}); page.wait_for_timeout(150)
        page.locator('#text-color').evaluate("e=>{e.focus();e.value='#ff0000';e.dispatchEvent(new Event('input',{bubbles:true}))}"); page.wait_for_timeout(150)
        check('고르는 중(input)에도 바로 보임', col(t) == 'rgb(255, 0, 0)')
        page.locator('#text-color').evaluate("e=>{e.value='#00aa00';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}"); page.wait_for_timeout(150)
        check('확인(change) 후 적용', col(t) == 'rgb(0, 170, 0)')
        check('안쪽 강조 글자도 같은 색', col(em) == 'rgb(0, 170, 0)')
        page.locator('#undo').click(); page.wait_for_timeout(200)
        check('실행 취소 한 번에 원래 색', col(t) == 'rgb(17, 17, 17)' and col(em) == 'rgb(35, 80, 245)')
        # 같은 색으로 닫은 뒤(바뀐 것 없음) 다른 편집이 실행 취소 기록을 꼬지 않는지
        t.click(position={'x': 10, 'y': 10}); page.wait_for_timeout(150)
        page.locator('#text-color').evaluate("e=>{e.focus();e.dispatchEvent(new Event('input',{bubbles:true}))}"); page.locator('#text-color').evaluate("e=>e.blur()")
        page.keyboard.press('ArrowRight'); page.wait_for_timeout(150)
        x1 = t.evaluate("e=>e.getBoundingClientRect().x"); page.locator('#undo').click(); page.wait_for_timeout(150)
        check('색을 안 바꾸고 닫은 뒤 이동 → 실행 취소는 이동만 되돌림', t.evaluate("e=>e.getBoundingClientRect().x") < x1 and col(t) == 'rgb(17, 17, 17)')
        b.close()
finally:
    server.terminate(); server.wait(timeout=5)
print('ALL PASS' if ok else 'SOME FAIL'); sys.exit(0 if ok else 1)
