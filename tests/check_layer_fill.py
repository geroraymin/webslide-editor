"""순서(맨 앞·앞·뒤·맨 뒤, Ctrl+[ ])와 도형 「채우기 없음」 확인 (r23).
사용: python tools/check_layer_fill.py
"""
from pathlib import Path
import json, subprocess, sys
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
server = subprocess.Popen([sys.executable, '-m', 'http.server', '8858', '--bind', '127.0.0.1', '--directory', str(ROOT)],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
ok = True
def check(label, cond):
    global ok; ok &= bool(cond); print(('PASS ' if cond else 'FAIL ') + label)
TOP = "()=>{const s=document.querySelector('.slide.on');const b=[...s.querySelectorAll('.ed-box')];const r=b[0].getBoundingClientRect();const h=document.elementFromPoint(r.left+20,r.top+20);return b.indexOf(h.closest('.ed-box'));}"
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); page = b.new_page(viewport={'width': 1600, 'height': 1000})
        page.goto('http://127.0.0.1:8858/slide-editor.html'); expect(page.locator('.slide-item')).to_have_count(6)
        page.evaluate("try{localStorage.clear()}catch{}")
        fr = page.frames[1]
        # 도형 두 개를 같은 자리에 겹쳐 놓는다
        page.locator('#add-box').click(); page.wait_for_timeout(200)
        page.locator('#add-box').click(); page.wait_for_timeout(200)
        boxes = fr.locator('.slide.on .ed-box'); check('도형 2개 추가', boxes.count() == 2)
        fr.evaluate("()=>{const b=[...document.querySelectorAll('.slide.on .ed-box')];b.forEach(x=>{x.style.left='300px';x.style.top='300px';});b[0].style.background='#ff0000';b[1].style.background='#0000ff';}")
        check('처음엔 나중 도형(1)이 위', fr.evaluate(TOP) == 1)
        boxes.nth(1).click(position={'x': 10, 'y': 10}); page.wait_for_timeout(150)  # 위에 있는 1을 선택
        page.keyboard.press('Control+BracketLeft'); page.wait_for_timeout(200)
        check('Ctrl+[ 뒤로 → 0이 위', fr.evaluate(TOP) == 0)
        page.keyboard.press('Control+BracketRight'); page.wait_for_timeout(200)
        check('Ctrl+] 앞으로 → 1이 위', fr.evaluate(TOP) == 1)
        page.locator('#send-back').click(); page.wait_for_timeout(200)
        check('맨 뒤로 버튼 → 0이 위', fr.evaluate(TOP) == 0)
        page.locator('#bring-front').click(); page.wait_for_timeout(200)
        check('맨 앞으로 버튼 → 1이 위', fr.evaluate(TOP) == 1)
        page.locator('#send-backward').click(); page.wait_for_timeout(200)
        check('뒤로 버튼 → 0이 위', fr.evaluate(TOP) == 0)
        page.locator('#bring-forward').click(); page.wait_for_timeout(200)
        check('앞으로 버튼 → 1이 위', fr.evaluate(TOP) == 1)
        # 채우기 없음
        check('선·도형 설정이 도형에도 보임', page.locator('#graphic-properties').is_visible())
        page.locator('#fill-none').check(); page.wait_for_timeout(200)
        st = boxes.nth(1).evaluate("e=>{const s=getComputedStyle(e);return [s.backgroundColor,s.borderTopWidth,s.borderTopStyle]}")
        check(f'채우기 없음 → 배경 투명·선 남음 {st}', st[0] in ('rgba(0, 0, 0, 0)', 'transparent') and float(st[1][:-2]) >= 1 and st[2] == 'solid')
        check('채우기 없음이면 아래 도형이 비쳐 보임(클릭은 위 도형)', fr.evaluate(TOP) == 1)
        page.locator('#graphic-width').fill('5'); page.locator('#graphic-width').dispatch_event('change'); page.wait_for_timeout(150)
        check('선 두께 5', boxes.nth(1).evaluate("e=>getComputedStyle(e).borderTopWidth") == '5px')
        page.locator('#undo').click(); page.wait_for_timeout(150)
        check('실행 취소로 선 두께 되돌림', boxes.nth(1).evaluate("e=>getComputedStyle(e).borderTopWidth") != '5px')
        page.locator('#redo').click(); page.wait_for_timeout(150)
        # 저장 → 다시 열기
        page.evaluate("window.showSaveFilePicker=undefined")
        with page.expect_download() as dl: page.locator('#save-project').click()
        path = dl.value.path()
        page.locator('#project-file').set_input_files(str(path)); page.locator('#confirm-yes').click(); page.wait_for_timeout(600)
        st2 = page.frames[1].locator('.slide.on .ed-box').nth(1).evaluate("e=>{const s=getComputedStyle(e);return [s.backgroundColor,s.borderTopWidth]}")
        check(f'저장 후 다시 열어도 유지 {st2}', st2[0] in ('rgba(0, 0, 0, 0)', 'transparent') and st2[1] == '5px')
        page.frames[1].locator('.slide.on .ed-box').nth(1).click(position={'x': 3, 'y': 3}); page.wait_for_timeout(150)  # r25: 채우기 없는 틀은 테두리 근처를 눌러야 잡힌다
        check('다시 열면 채우기 없음 체크 표시', page.locator('#fill-none').is_checked())
        page.locator('#fill-none').uncheck(); page.wait_for_timeout(150)
        check('채우기 없음 해제 → 배경 다시 채움', page.frames[1].locator('.slide.on .ed-box').nth(1).evaluate("e=>getComputedStyle(e).backgroundColor") not in ('rgba(0, 0, 0, 0)', 'transparent'))
        b.close()
finally:
    server.terminate(); server.wait(timeout=5)
print('ALL PASS' if ok else 'SOME FAIL'); sys.exit(0 if ok else 1)
