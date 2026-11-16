"""추가 편집 도구와 기존 선택·클립보드·텍스트 입력의 충돌을 확인한다."""
from pathlib import Path
import base64
import json
import subprocess
import sys
import tempfile
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
server=subprocess.Popen([sys.executable,'-m','http.server','8853','--bind','127.0.0.1','--directory',str(ROOT)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
try:
    with tempfile.TemporaryDirectory() as folder,sync_playwright() as p:
        browser=p.chromium.launch()
        page=browser.new_page(viewport={'width':1600,'height':1000})
        page.add_init_script('delete window.showSaveFilePicker')
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://127.0.0.1:8853/slide-editor.html')
        expect(page.locator('.slide-item')).to_have_count(6)
        page.evaluate('document.fonts.ready')
        assert page.evaluate('[...document.fonts].some(f=>f.family.includes("Pretendard")&&f.status==="loaded")')
        fixture=Path(folder)/'tools.slides.json'
        fixture.write_text(json.dumps({'format':'slide-studio','version':1,'name':'편집 검사','slides':[
            '<section class="slide one"><div class="content"><p class="a">첫 문장</p><p class="b">둘째 문장</p><p class="c">셋째 문장</p></div></section>',
            '<section class="slide two"><div class="content"><p class="other">다른 장 문장</p></div></section>'
        ],'design':{'bodyClass':'v4','css':'.slide{display:none;position:absolute;inset:0;width:1600px;height:900px;font:24px/1.4 sans-serif;background:white}.slide.on{display:block}.content{position:absolute;left:200px;top:200px;display:flex;flex-direction:column;gap:35px;font-size:36px}.content p{margin:0;width:420px;padding:10px;border:2px solid #678}.two .content{font-size:20px;left:900px;top:100px}'}}),encoding='utf-8')
        page.locator('#project-file').set_input_files(str(fixture));page.locator('#confirm-yes').click()
        expect(page.locator('.slide-item')).to_have_count(2)
        frame=page.frames[1]

        def metrics(selector):
            return frame.locator(selector).evaluate_all('es=>es.map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e),round=v=>Math.round(v*1000)/1000;return {x:round(r.x),y:round(r.y),w:round(r.width),h:round(r.height),font:s.fontSize,color:s.color}})')

        frame.locator('.slide.on .a').click()
        frame.locator('.slide.on .c').click(modifiers=['Shift'])
        expect(page.locator('#selection-name')).to_have_text('선택한 요소 2개')
        frame.locator('.slide.on .a').click(modifiers=['Shift'])
        expect(page.locator('#selection-name')).to_have_text('선택한 텍스트')
        # 레이어 목록에서도 Shift로 추가·제외 선택한다.
        page.locator('#layers button').first.click(modifiers=['Shift'])
        expect(page.locator('#selection-name')).to_have_text('선택한 요소 2개')
        page.keyboard.press('Control+g')
        original_id=frame.locator('.a').get_attribute('data-ed-group')
        assert original_id==frame.locator('.c').get_attribute('data-ed-group')
        frame.locator('.b').click(modifiers=['Shift'])
        expect(page.locator('#selection-name')).to_have_text('선택한 요소 3개')
        frame.locator('.a').click(modifiers=['Shift'])
        expect(page.locator('#selection-name')).to_have_text('선택한 텍스트')
        assert frame.locator('.b').evaluate('e=>e.dataset.edGroup||null') is None
        page.keyboard.press('Control+a')
        expect(page.locator('#selection-name')).to_have_text('선택한 요소 3개')
        # 그룹을 복사해 다른 부모·글꼴의 장표에 붙여도 원래 모습 유지.
        frame.locator('.a').click()
        before=metrics('.slide.on .a,.slide.on .c')
        page.keyboard.press('Control+c')
        page.locator('.slide-item').nth(1).click()
        page.keyboard.press('Control+v')
        expect(page.locator('.slide-item')).to_have_count(2)
        expect(page.locator('#selection-name')).to_have_text('그룹 · 2개')
        pasted=metrics('.slide.on .ed-object')
        for a,b in zip(before,pasted):
            assert abs(b['x']-a['x']-24)<1 and abs(b['y']-a['y']-24)<1,(a,b)
            assert abs(b['w']-a['w'])<1 and abs(b['h']-a['h'])<1 and b['font']==a['font'],(a,b)
        new_id=frame.locator('.slide.on .a').get_attribute('data-ed-group')
        assert new_id!=original_id
        page.locator('#undo').click()
        assert frame.locator('.slide.on .ed-object').count()==0
        page.locator('#redo').click()
        frame.locator('.slide.on .a').click()
        page.keyboard.press('Control+x')
        assert frame.locator('.slide.on .ed-object').count()==0
        page.keyboard.press('Control+v')
        assert frame.locator('.slide.on .ed-object').count()==2
        # 글자 입력 중 Ctrl+A/C/X는 요소·슬라이드 명령으로 바뀌지 않는다.
        text=frame.locator('.slide.on .a')
        text.dblclick()
        page.keyboard.press('Control+a');page.keyboard.type('텍스트 입력')
        assert text.inner_text()=='텍스트 입력'
        assert frame.locator('.slide.on .ed-object').count()==2
        page.keyboard.press('Escape')
        page.locator('#deck-name').fill('입력칸 검사')
        page.locator('#deck-name').press('Control+a')
        page.locator('#deck-name').press('Control+x')
        assert frame.locator('.slide.on .ed-object').count()==2
        page.locator('#deck-name').fill('편집 검사')
        page.locator('#selection-name').click()
        page.keyboard.press('Control+Shift+c');page.keyboard.press('Control+Shift+v')
        expect(page.locator('.slide-item')).to_have_count(3)
        image_file=Path(folder)/'pixel.png'
        image_file.write_bytes(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP9sAAAAASUVORK5CYII='))
        page.locator('#image-file').set_input_files(str(image_file))
        expect(frame.locator('.slide.on img')).to_have_count(1)
        image=metrics('.slide.on img')[0]
        image_src=frame.locator('.slide.on img').get_attribute('src')
        page.keyboard.press('Control+c')
        page.locator('.slide-item').first.click();page.keyboard.press('Control+v')
        expect(frame.locator('.slide.on img')).to_have_count(1)
        pasted_image=metrics('.slide.on img')[0]
        assert pasted_image['w']==image['w'] and pasted_image['h']==image['h']
        assert frame.locator('.slide.on img').get_attribute('src')==image_src
        page.locator('#project-file').set_input_files(str(fixture));page.locator('#confirm-yes').click()
        for name,width,x,y in [('a',200,200,180),('b',260,700,350),('c',320,1000,560)]:
            frame.locator('.slide.on .'+name).click()
            for control,value in [('element-width',width),('element-x',x),('element-y',y)]:
                page.locator('#'+control).fill(str(value));page.locator('#'+control).press('Tab')
        before=metrics('.slide.on .content p')

        def select_all():
            page.locator('#selection-name').click();page.keyboard.press('Control+a')

        for mode in ['left','center','right','top','middle','bottom']:
            select_all();page.locator('[data-arrange="'+mode+'"]').click()
            after=metrics('.slide.on .content p')
            axis='x' if mode in ['left','center','right'] else 'y'
            size='w' if axis=='x' else 'h'
            fraction=0 if mode in ['left','top'] else .5 if mode in ['center','middle'] else 1
            edges=[r[axis]+r[size]*fraction for r in after]
            assert max(edges)-min(edges)<.1,(mode,after)
            assert all(abs(a['w']-b['w'])<.1 and abs(a['h']-b['h'])<.1 for a,b in zip(before,after))
            page.locator('#undo').click()
        for axis in ['x','y']:
            select_all();page.locator('[data-distribute="'+axis+'"]').click()
            after=metrics('.slide.on .content p');size='w' if axis=='x' else 'h'
            gaps=[after[i+1][axis]-after[i][axis]-after[i][size] for i in range(2)]
            assert abs(gaps[0]-gaps[1])<.1,(axis,after)
            assert abs(after[0][axis]-before[0][axis])<.1 and abs(after[-1][axis]-before[-1][axis])<.1
            page.locator('#undo').click()
        frame.locator('.a').click();frame.locator('.b').click(modifiers=['Shift']);page.keyboard.press('Control+g')
        grouped=metrics('.a,.b')
        frame.locator('.c').click(modifiers=['Shift'])
        page.locator('[data-arrange="right"]').click()
        after=metrics('.a,.b')
        assert abs((after[0]['x']-grouped[0]['x'])-(after[1]['x']-grouped[1]['x']))<.1
        page.locator('#undo').click();frame.locator('.a').click()
        width=float(page.locator('#element-width').input_value())
        page.locator('#element-width').fill(str(width/2));page.locator('#element-width').press('Tab')
        scaled=metrics('.a,.b')
        assert all(abs(b['w']/a['w']-.5)<.01 and abs(b['h']/a['h']-.5)<.01 for a,b in zip(grouped,scaled))
        assert abs(scaled[1]['x']-scaled[0]['x']-(grouped[1]['x']-grouped[0]['x'])/2)<.1
        for control,value in [('element-x',400),('element-y',220)]:
            page.locator('#'+control).fill(str(value));page.locator('#'+control).press('Tab')
        positioned=metrics('.a,.b')
        assert abs(min(r['x'] for r in positioned)-400)<.1 and abs(min(r['y'] for r in positioned)-220)<.1
        page.locator('#element-width').fill('');page.locator('#element-width').press('Tab')
        assert metrics('.a,.b')==positioned,'blank width changed group'
        group=page.locator('#layers .layer-group').first
        group.locator('summary').get_by_role('button',name='이름 변경',exact=True).click()
        page.locator('#insert-form [name=name]').fill('제목 묶음')
        page.locator('#insert-form button[type=submit]').click()
        expect(group.locator('summary .layer-name')).to_have_text('제목 묶음 · 2개')
        group.locator('summary').press('Enter')
        group.locator('.layer-children .layer-name').first.click()
        expect(page.locator('#selection-name')).to_have_text('선택한 텍스트')
        frame.locator('.a').click()
        before_lock=metrics('.a,.b')
        page.locator('#lock-elements').click()
        assert frame.locator('[data-ed-locked=true]').count()==2
        frame.locator('.a').click()
        page.keyboard.press('ArrowRight');page.keyboard.press('Delete')
        assert metrics('.a,.b')==before_lock,(metrics('.a,.b'),before_lock)
        select_all()
        expect(page.locator('#selection-name')).to_have_text('선택한 텍스트')
        page.keyboard.press('Delete')
        assert frame.locator('.c').count()==0 and frame.locator('.a,.b').count()==2
        page.locator('#undo').click()
        group.locator('summary').get_by_role('button',name='잠금 해제',exact=True).click()
        assert frame.locator('[data-ed-locked=true]').count()==0
        expect(page.locator('#selection-name')).to_have_text('그룹 · 2개')
        page.locator('#hide-elements').click()
        assert frame.locator('.a,.b').evaluate_all('es=>es.every(e=>getComputedStyle(e).visibility==="hidden")')
        select_all();expect(page.locator('#selection-name')).to_have_text('선택한 텍스트')
        group.locator('summary').get_by_role('button',name='표시',exact=True).click()
        assert metrics('.a,.b')==before_lock,(metrics('.a,.b'),before_lock)
        layer_c=page.locator('#layers > .layer-row').filter(has_text='셋째 문장')
        layer_c.get_by_role('button',name='이름 변경',exact=True).click()
        page.locator('#insert-form [name=name]').fill('보조 문장')
        page.locator('#insert-form button[type=submit]').click()
        layer_c=page.locator('#layers > .layer-row').filter(has_text='보조 문장')
        geometry=metrics('.a,.b,.c')
        layer_c.get_by_role('button',name='한 단계 뒤로',exact=True).click()
        assert metrics('.a,.b,.c')==geometry,'layer reorder changed coordinates or font'
        z=frame.locator('.a,.b,.c').evaluate_all('es=>es.map(e=>Number(getComputedStyle(e).zIndex))')
        assert z[2]<min(z[:2]),z
        page.locator('#undo').click()
        assert metrics('.a,.b,.c')==geometry
        # 숨김과 잠금은 저장·출력에서 유지되고 목록에서 다시 해제할 수 있다.
        frame.locator('.a').click();page.locator('#hide-elements').click()
        group.locator('summary').get_by_role('button',name='잠금',exact=True).click()
        with page.expect_download() as download:page.locator('#save-project').click()
        saved=Path(folder)/'saved.slides.json';download.value.save_as(str(saved))
        page.locator('#project-file').set_input_files(str(saved));page.locator('#confirm-yes').click()
        assert frame.locator('.a,.b').evaluate_all('es=>es.every(e=>e.dataset.edLocked==="true"&&getComputedStyle(e).visibility==="hidden")')
        with page.expect_download() as download:page.locator('#export-html').click()
        exported=Path(folder)/'hidden.html';download.value.save_as(str(exported))
        presentation=browser.new_page();presentation.goto(exported.as_uri())
        assert presentation.locator('.a,.b').evaluate_all('es=>es.every(e=>getComputedStyle(e).visibility==="hidden")')
        presentation.close()
        group.locator('summary').get_by_role('button',name='표시',exact=True).click()
        group.locator('summary').get_by_role('button',name='잠금 해제',exact=True).click()
        expect(page.locator('#selection-name')).to_have_text('그룹 · 2개')
        page.locator('#project-file').set_input_files(str(fixture));page.locator('#confirm-yes').click()

        def place(name,width,x,y):
            frame.locator('.slide.on .'+name).click()
            for control,value in [('element-width',width),('element-x',x),('element-y',y)]:
                page.locator('#'+control).fill(str(value));page.locator('#'+control).press('Tab')

        place('a',160,200,200);place('b',240,900,200);place('c',240,1100,600)
        frame.locator('.b').click();page.locator('#lock-elements').click()

        def drag_a(x,y,alt=False):
            frame.locator('.a').click()
            r=metrics('.a')[0]
            scale=page.locator('#deck-frame').bounding_box()['width']/1600
            h=page.locator('#move-handle').bounding_box();hx,hy=h['x']+h['width']/2,h['y']+h['height']/2
            if alt:page.keyboard.down('Alt')
            page.mouse.move(hx,hy);page.mouse.down()
            page.mouse.move(hx+(x-r['x'])*scale,hy+(y-r['y'])*scale,steps=5)
            guide=page.locator('#guide-x').is_visible()
            mode=page.locator('#guide-x').get_attribute('data-mode')
            page.mouse.up()
            if alt:page.keyboard.up('Alt')
            return metrics('.a')[0],guide,mode

        snapped,guide,mode=drag_a(895,200)
        assert abs(snapped['x']-900)<.1 and guide,(snapped,guide,mode)
        page.locator('#undo').click()
        page.locator('#layers > .layer-row').filter(has_text='둘째 문장').get_by_role('button',name='잠금 해제',exact=True).click()
        page.locator('#snap-enabled').uncheck()
        raw,guide,mode=drag_a(895,200)
        assert abs(raw['x']-895)<.1 and not guide,(raw,guide)
        page.locator('#undo').click();page.locator('#snap-enabled').check()
        raw,guide,mode=drag_a(895,200,alt=True)
        assert abs(raw['x']-895)<.1 and not guide,(raw,guide)
        page.locator('#undo').click()
        place('a',160,40,200);place('b',240,300,200);place('c',240,1000,200)
        spaced,guide,mode=drag_a(685,200)
        assert abs(spaced['x']-690)<.1 and guide and mode=='gap',(spaced,guide,mode)
        (ROOT / 'tests/_out').mkdir(exist_ok=True)
        page.screenshot(path=str(ROOT / 'tests/_out/editing-tools.png'))
        page.set_viewport_size({'width':1280,'height':800})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert page.locator('#canvas-wrap').bounding_box()['width']>0
        page.screenshot(path=str(ROOT / 'tests/_out/editing-tools-laptop.png'))
        page.set_viewport_size({'width':1600,'height':1000})
        frame.locator('.a').click();frame.locator('.b').click(modifiers=['Shift']);frame.locator('.c').click(modifiers=['Shift']);page.keyboard.press('Control+g')
        page.locator('#layers .layer-group summary').press('Enter')
        page.locator('.properties').evaluate('e=>e.scrollTop=e.scrollHeight')
        page.screenshot(path=str(ROOT / 'tests/_out/editing-layers.png'))
        assert not errors,errors
        browser.close()
finally:
    server.terminate();server.wait(timeout=5)
print('PASS: selection/clipboard, native input, alignment/spacing, group geometry, layer names/order, lock/hide protection and JSON/HTML persistence')
