"""여러 상자를 함께 옮기면 안쪽 글자도 같이 움직이고, 상자 하나만 옮기면 안쪽 글자는 제자리에 남는지 (r24).
(사례: 칸 여러 개를 끌어 선택해 옮길 때)
사용: python tools/check_multi_move.py
"""
from pathlib import Path
import json, subprocess, sys, tempfile
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
COL = '<div class="col" style="border-top:2px solid #333;padding-top:30px"><span class="n" style="font-size:22px">{n}</span><b style="display:block;font-size:60px">{b}</b><p style="font-size:28px">{p}</p></div>'
SLIDE = ('<section class="slide"><div class="grid" style="position:absolute;left:96px;right:96px;top:290px;display:grid;grid-template-columns:1fr 1fr;gap:96px">'
         + COL.format(n='01 센터', b='선도 기관', p='AI 활용 사례') + COL.format(n='02 종사자', b='업무 개선', p='직접 만든 툴') + '</div></section>')
IDS = "()=>[...document.querySelectorAll('.slide.on .col, .slide.on .col *')].map(e=>e.dataset.edId).filter(Boolean)"
POS = "ids=>ids.map(id=>{const r=document.querySelector(`[data-ed-id='${id}']`).getBoundingClientRect();return [Math.round(r.x),Math.round(r.y)]})"
server = subprocess.Popen([sys.executable, '-m', 'http.server', '8867', '--bind', '127.0.0.1', '--directory', str(ROOT)],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
ok = True
def check(label, cond):
    global ok; ok &= bool(cond); print(('PASS ' if cond else 'FAIL ') + label)
try:
    with tempfile.TemporaryDirectory() as tmp, sync_playwright() as p:
        f = Path(tmp) / 't.slides.json'; f.write_text(json.dumps({'format': 'slide-studio', 'version': 1, 'name': 't', 'slides': [SLIDE]}, ensure_ascii=False), encoding='utf-8')
        b = p.chromium.launch(); page = b.new_page(viewport={'width': 1600, 'height': 1000})
        page.goto('http://127.0.0.1:8867/slide-editor.html'); expect(page.locator('.slide-item')).to_have_count(6)
        def load():
            page.locator('#project-file').set_input_files(str(f)); page.locator('#confirm-yes').click(); page.wait_for_timeout(500)
        def marquee():
            box = page.locator('#canvas-wrap').bounding_box(); sc = box['width'] / 1600
            page.mouse.move(box['x'] + 60 * sc, box['y'] + 250 * sc); page.mouse.down()
            page.mouse.move(box['x'] + 1560 * sc, box['y'] + 700 * sc, steps=10); page.mouse.up(); page.wait_for_timeout(300)
        def drag_handle(dx, dy):
            h = page.locator('#move-handle').bounding_box(); x, y = h['x'] + h['width'] / 2, h['y'] + h['height'] / 2
            page.mouse.move(x, y); page.mouse.down(); page.mouse.move(x + dx, y + dy, steps=8); page.mouse.up(); page.wait_for_timeout(300)
        # 1) 범위 선택 + 방향키
        load(); fr = page.frames[1]; ids = fr.evaluate(IDS); before = fr.evaluate(POS, ids)
        marquee(); check('범위 선택: ' + page.locator('#selection-name').text_content(), '2개' in page.locator('#selection-name').text_content())
        page.keyboard.press('Shift+ArrowRight'); page.keyboard.press('Shift+ArrowDown'); page.wait_for_timeout(300)
        after = page.frames[1].evaluate(POS, ids); moves = {(a[0] - c[0], a[1] - c[1]) for a, c in zip(after, before)}
        check(f'방향키: 칸과 안쪽 글자 모두 같은 거리 {moves}', all(abs(mx - 10) <= 2 and abs(my - 10) <= 2 for mx, my in moves))
        # 2) 범위 선택 + 마우스로 끌기
        load(); fr = page.frames[1]; ids = fr.evaluate(IDS); before = fr.evaluate(POS, ids)
        marquee(); drag_handle(60, 30)
        after = page.frames[1].evaluate(POS, ids); dxs = [a[0] - c[0] for a, c in zip(after, before)]; dys = [a[1] - c[1] for a, c in zip(after, before)]
        check(f'끌기: 칸과 안쪽 글자 모두 같은 거리 x{sorted(set(dxs))} y{sorted(set(dys))}', max(dxs) - min(dxs) <= 2 and max(dys) - min(dys) <= 2 and min(dxs) > 20)
        # 3) 상자 하나만 옮기면 안쪽 글자는 제자리 (r14 기준 유지)
        load(); fr = page.frames[1]; ids = fr.evaluate(IDS); before = fr.evaluate(POS, ids)
        fr.locator('.col').first.click(position={'x': 5, 'y': 5}); page.wait_for_timeout(200)
        page.keyboard.press('Shift+ArrowRight'); page.wait_for_timeout(300)
        after = page.frames[1].evaluate(POS, ids)
        check('상자 하나: 상자만 움직이고 안쪽 글자는 제자리', after[0][0] - before[0][0] >= 8 and all(abs(a[0] - c[0]) <= 1 for a, c in list(zip(after, before))[1:4]))
        b.close()
finally:
    server.terminate(); server.wait(timeout=5)
print('ALL PASS' if ok else 'SOME FAIL'); sys.exit(0 if ok else 1)
