"""r25 사용자 신고 3건 (2026-11-17).
1) 채우기 없앤 도형의 선 두께: 숫자를 바꾸는 동안 바로 반영되고 실행 취소 한 번으로 되돌린다.
2) 채우기 없는 틀 안쪽에서 끌기 시작해도 범위 선택이 되어 틀과 안쪽 글자가 함께 잡히고 함께 움직인다.
3) 자른 사진의 가로를 숫자 칸으로 바꿔도 0이 되지 않는다.
사용: python tools/check_r25_reports.py
"""
from pathlib import Path
import subprocess, sys, tempfile
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
server = subprocess.Popen([sys.executable, '-m', 'http.server', '8875', '--bind', '127.0.0.1', '--directory', str(ROOT)],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
ok = True
def check(label, cond):
    global ok; ok &= bool(cond); print(('PASS ' if cond else 'FAIL ') + label)
PNG = bytes.fromhex('89504e470d0a1a0a0000000d4948445200000002000000020802000000fdd49a730000001649444154789c63f8cfc0f09f81e13f03c37f0600001ffe05fb7e0d1f5e0000000049454e44ae426082')
try:
    with tempfile.TemporaryDirectory() as tmp, sync_playwright() as p:
        img = Path(tmp) / 'p.png'; img.write_bytes(PNG)
        b = p.chromium.launch(); page = b.new_page(viewport={'width': 1600, 'height': 1000}); errors = []
        page.on('pageerror', lambda e: errors.append(str(e))); page.set_default_timeout(8000)
        page.goto('http://127.0.0.1:8875/slide-editor.html'); expect(page.locator('.slide-item')).to_have_count(6)
        page.evaluate("try{localStorage.clear()}catch{}")
        page.locator('.slide-item').nth(2).click(); page.wait_for_timeout(300); fr = page.frames[1]
        # 1) 선 두께 바로 반영
        page.locator('#add-box').click(); page.wait_for_timeout(200); box = fr.locator('.slide.on .ed-box').last
        page.locator('#fill-none').check(); page.wait_for_timeout(150)
        bw = lambda: box.evaluate("e=>getComputedStyle(e).borderTopWidth")
        page.locator('#graphic-width').click(); page.keyboard.press('Control+a'); page.keyboard.type('7'); page.wait_for_timeout(150)
        check(f'두께 숫자 입력 → 바로 반영 {bw()}', bw() == '7px')
        wrap = page.locator('#canvas-wrap').bounding_box(); sc = wrap['width'] / 1600
        page.mouse.click(wrap['x'] + 1590 * sc, wrap['y'] + 890 * sc); page.wait_for_timeout(200)
        check(f'바깥 클릭 뒤에도 유지 {bw()}', bw() == '7px')
        page.locator('#undo').click(); page.wait_for_timeout(150)
        check(f'실행 취소 한 번 → 원래 두께 {bw()}', bw() == '2px')
        page.locator('#redo').click(); page.wait_for_timeout(150)
        # 1-2) 브라우저 확대(110% 등)에서는 1px 선이 0.909px로 읽힌다. 그 상태에서 화살표로 올려도 커져야 한다 (r26 사용자 신고)
        fr.evaluate("""()=>{const g=window.getComputedStyle.bind(window);window.getComputedStyle=(e,...r)=>{const s=g(e,...r);if(!e.classList?.contains('ed-box'))return s;
          return new Proxy(s,{get(t,k){const v=t[k];if(typeof k==='string'&&/^border(Top|Right|Bottom|Left)Width$/.test(k)&&parseFloat(v)>0)return (parseFloat(v)/1.1).toFixed(6)+'px';return typeof v==='function'?v.bind(t):v;}});};}""")
        box.click(position={'x': 2, 'y': 2}); page.wait_for_timeout(150)
        page.locator('#graphic-width').fill('1'); page.locator('#graphic-width').press('Tab'); page.wait_for_timeout(150)
        box.click(position={'x': 2, 'y': 2}); page.wait_for_timeout(150)
        shown = page.locator('#graphic-width').input_value()
        check(f'확대 화면에서 1px 선 → 칸에 1로 표시 ({shown})', shown == '1')
        page.locator('#graphic-width').click()
        for _ in range(5): page.keyboard.press('ArrowUp'); page.wait_for_timeout(60)
        st = box.evaluate("e=>e.style.borderTopWidth")
        check(f'확대 화면에서 화살표 5번 → 6px ({st}, 칸 {page.locator("#graphic-width").input_value()})', st == '6px')
        page.locator('#graphic-width').press('Tab'); page.wait_for_timeout(100)
        # 2) 틀 안에 글자 두 개 넣고, 틀 안쪽에서 끌어 범위 선택 → 함께 이동
        fr.evaluate("""()=>{const s=document.querySelector('.slide.on');const b=[...s.querySelectorAll('.ed-box')].pop();[...s.children].forEach(c=>{if(c!==b)c.remove();});
          Object.assign(b.style,{left:'300px',top:'250px',width:'700px',height:'400px',translate:'0px 0px'});b.dataset.edX='0';b.dataset.edY='0';
          ['첫 칸 글자','둘째 칸 글자'].forEach((t,i)=>{const d=document.createElement('div');d.className='ed-text ed-object';d.textContent=t;d.dataset.edId='t'+i;Object.assign(d.style,{position:'absolute',left:(360+i*300)+'px',top:'400px',fontSize:'36px',zIndex:'5'});s.appendChild(d);});}""")
        page.keyboard.press('Escape'); page.wait_for_timeout(200)
        wrap = page.locator('#canvas-wrap').bounding_box(); sc = wrap['width'] / 1600
        page.mouse.click(wrap['x'] + 330 * sc, wrap['y'] + 280 * sc); page.wait_for_timeout(200)
        check('틀 안쪽 빈 곳 클릭 → 틀이 잡히지 않음: ' + page.locator('#selection-name').text_content(), '도형' not in page.locator('#selection-name').text_content())
        page.mouse.click(wrap['x'] + 301 * sc, wrap['y'] + 450 * sc); page.wait_for_timeout(200)
        check('틀 테두리 클릭 → 틀 선택: ' + page.locator('#selection-name').text_content(), page.locator('#graphic-properties').is_visible())
        page.keyboard.press('Escape'); page.wait_for_timeout(150)
        pos = "()=>[...document.querySelectorAll('.slide.on .ed-box,.slide.on [data-ed-id^=t]')].map(e=>Math.round(e.getBoundingClientRect().y))"
        before = fr.evaluate(pos)
        # Playwright 마우스로 장표 안 요소 위에서 끌면 브라우저가 죽는다(고치기 전 r24도 같음, 검사 도구 한계). 장표 문서에 포인터 동작을 직접 보낸다.
        fr.evaluate("""()=>{const at=(x,y)=>document.elementFromPoint(x,y)||document.body;const ev=(t,x,y)=>at(x,y).dispatchEvent(new PointerEvent(t,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0,buttons:t==='pointerup'?0:1,pointerId:1,isPrimary:true}));
          ev('pointerdown',330,280);for(let i=1;i<=10;i++)ev('pointermove',330+69*i,280+39*i);ev('pointerup',1020,670);at(1020,670).dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:1020,clientY:670}));}""")
        page.wait_for_timeout(300)
        name = page.locator('#selection-name').text_content()
        check('틀 안에서 시작한 범위 선택 → 틀+글자 3개: ' + name, '3개' in name)
        page.keyboard.press('Shift+ArrowDown'); page.wait_for_timeout(200)
        after = fr.evaluate(pos)
        check(f'함께 이동 {before}->{after}', all(a - c == 10 for a, c in zip(after, before)))
        # 3) 자른 사진 가로
        page.keyboard.press('Escape')
        with page.expect_file_chooser() as fc: page.locator('#add-image').click()
        fc.value.set_files(str(img)); page.locator('#crop-image').wait_for(state='visible')
        page.locator('#crop-image').click(); page.locator('#crop-w').fill('50'); page.locator('#crop-apply').click(); page.wait_for_timeout(300)
        page.locator('#element-width').fill('300'); page.locator('#element-width').press('Tab'); page.wait_for_timeout(200)
        w = page.locator('#element-width').input_value()
        check(f'자른 사진 가로 300 입력 → {w}', abs(float(w or 0) - 300) <= 2)
        check('오류 없음 ' + str(errors), not errors)
        b.close()
finally:
    server.terminate(); server.wait(timeout=5)
print('ALL PASS' if ok else 'SOME FAIL'); sys.exit(0 if ok else 1)
