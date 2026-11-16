"""그룹화·선택·이동·크기·복제·해제·저장을 실제 브라우저에서 확인한다."""
from pathlib import Path
import json
import subprocess
import sys
import tempfile
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
server = subprocess.Popen([sys.executable, '-m', 'http.server', '8856', '--bind', '127.0.0.1', '--directory', str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
try:
    with tempfile.TemporaryDirectory() as folder, sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={'width':1600,'height':1000}, accept_downloads=True)
        context.add_init_script('delete window.showSaveFilePicker')
        page = context.new_page()
        errors = []
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://127.0.0.1:8856/slide-editor.html')
        expect(page.locator('.slide-item')).to_have_count(6)
        expect(page.locator('#group-elements')).to_be_disabled()
        fixture = Path(folder)/'groups.slides.json'
        fixture.write_text(json.dumps({'format':'slide-studio','version':1,'name':'그룹 검사','slides':[
            '<section class="slide"><div class="content"><p class="first">첫 번째 문장</p><p class="second">두 번째 문장</p></div><p class="third">선택하지 않은 문장</p><table><tr><th>제목 A</th><th>제목 B</th></tr><tr><td>내용 A</td><td>내용 B</td></tr></table></section>'
        ],'design':{'bodyClass':'v4','css':'.slide{position:absolute;inset:0;width:1600px;height:900px;font:30px/1.5 sans-serif;background:white}.content{position:absolute;left:200px;top:170px;width:800px;display:flex;flex-direction:column;gap:30px;font-size:36px}.content p{margin:0;width:600px}.third{position:absolute;left:1100px;top:400px;width:300px}table{position:absolute;left:200px;top:650px;width:800px;border-collapse:collapse}th,td{border:2px solid #aaa;padding:12px;text-align:center}'}}),encoding='utf-8')
        page.locator('#project-file').set_input_files(str(fixture))
        page.locator('#confirm-yes').click()
        expect(page.locator('.slide-item')).to_have_count(1)
        frame = page.frames[1]
        originals = frame.locator('.content p:not(.ed-object)')

        def metrics(locator):
            return locator.evaluate_all('es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,font:getComputedStyle(e).fontSize,scale:getComputedStyle(e).scale}})')

        def marquee(first,last):
            a,b=first.bounding_box(),last.bounding_box()
            page.mouse.move(a['x']-8,a['y']-8)
            page.mouse.down()
            page.mouse.move(b['x']+b['width']+8,b['y']+b['height']+8,steps=6)
            page.mouse.up()

        before=metrics(originals)
        third=metrics(frame.locator('.third'))
        marquee(originals.first,originals.last)
        expect(page.locator('#selection-name')).to_have_text('선택한 요소 2개')
        page.locator('#group-elements').click()
        expect(page.locator('#selection-name')).to_have_text('그룹 · 2개')
        assert metrics(originals)==before and metrics(frame.locator('.third'))==third
        assert frame.locator('.ed-layout-placeholder').count()==0
        original_id=originals.first.get_attribute('data-ed-group')
        assert original_id==originals.last.get_attribute('data-ed-group')
        frame.locator('.third').click()
        originals.last.click()
        expect(page.locator('#selection-name')).to_have_text('그룹 · 2개')
        handle=page.locator('#move-handle').bounding_box()
        x,y=handle['x']+handle['width']/2,handle['y']+handle['height']/2
        page.mouse.move(x,y);page.mouse.down()
        assert metrics(originals)==before
        page.mouse.move(x+30,y+20,steps=5);page.mouse.up()
        moved=metrics(originals)
        dx,dy=moved[0]['x']-before[0]['x'],moved[0]['y']-before[0]['y']
        assert dx>20 and dy>15
        assert all(abs(b['x']-a['x']-dx)<.1 and abs(b['y']-a['y']-dy)<.1 for a,b in zip(before,moved))
        assert metrics(frame.locator('.third'))==third
        bounds=page.locator('#selection').bounding_box()
        handle=page.locator('[data-handle="se"]').bounding_box()
        x,y=handle['x']+handle['width']/2,handle['y']+handle['height']/2
        page.mouse.move(x,y);page.mouse.down()
        assert metrics(originals)==moved
        page.mouse.move(x-bounds['width']*.15,y-bounds['height']*.15,steps=5);page.mouse.up()
        scaled=metrics(originals)
        assert all(abs(b['w']/a['w']-.85)<.01 and abs(b['h']/a['h']-.85)<.01 for a,b in zip(moved,scaled))
        page.locator('#center-x').click()
        page.locator('#center-y').click()
        centered=metrics(originals)
        assert abs((min(r['x'] for r in centered)+max(r['x']+r['w'] for r in centered))/2-800)<.1
        assert abs((min(r['y'] for r in centered)+max(r['y']+r['h'] for r in centered))/2-450)<.1
        page.locator('#duplicate-element').click()
        copies=frame.locator('.content p.ed-object')
        assert copies.count()==2
        copy_id=copies.first.get_attribute('data-ed-group')
        assert copy_id!=original_id and copies.last.get_attribute('data-ed-group')==copy_id
        for a,b in zip(centered,metrics(copies)):
            assert abs(b['x']-a['x']-24)<1 and abs(b['y']-a['y']-24)<1,(a,b)
            assert abs(b['w']-a['w'])<1 and abs(b['h']-a['h'])<1 and a['font']==b['font'],(a,b)
        assert metrics(originals)==centered
        originals.first.click(position={'x':5,'y':5})
        expect(page.locator('#selection-name')).to_have_text('그룹 · 2개')
        copies.last.click()
        expect(page.locator('#selection-name')).to_have_text('그룹 · 2개')
        page.locator('#delete-element').click()
        assert copies.count()==0 and originals.count()==2
        page.locator('#undo').click()
        assert copies.count()==2
        copies.first.click()
        before_ungroup=metrics(copies)
        page.keyboard.press('Control+Shift+g')
        assert not copies.first.get_attribute('data-ed-group')
        assert metrics(copies)==before_ungroup
        page.keyboard.press('Control+g')
        assert copies.first.get_attribute('data-ed-group')==copies.last.get_attribute('data-ed-group')
        assert copies.first.get_attribute('data-ed-group')!=original_id
        regrouped_id=copies.first.get_attribute('data-ed-group')
        page.locator('#undo').click()
        assert not copies.first.get_attribute('data-ed-group')
        page.locator('#redo').click()
        assert copies.first.get_attribute('data-ed-group')==regrouped_id
        copies.first.click()
        page.locator('#ungroup-elements').click()
        assert not copies.first.get_attribute('data-ed-group')
        page.locator('#group-elements').click()
        assert copies.first.get_attribute('data-ed-group')==copies.last.get_attribute('data-ed-group')
        copies.first.dblclick()
        assert frame.locator('[contenteditable]').count()==1
        assert copies.first.get_attribute('data-ed-group')
        page.keyboard.press('Escape')
        copies.first.click()
        with page.expect_download() as download:page.locator('#save-project').click()
        saved=Path(folder)/'saved.slides.json';download.value.save_as(str(saved))
        page.locator('#project-file').set_input_files(str(saved));page.locator('#confirm-yes').click()
        copies.first.click()
        expect(page.locator('#selection-name')).to_have_text('그룹 · 2개')
        with page.expect_download() as download:page.locator('#export-html').click()
        exported=Path(folder)/'presentation.html';download.value.save_as(str(exported))
        assert 'data-ed-group' in exported.read_text(encoding='utf-8')
        page.locator('#selection-name').click()
        page.keyboard.press('Control+Shift+c');page.keyboard.press('Control+Shift+v')
        expect(page.locator('.slide-item')).to_have_count(2)
        frame.locator('.slide.on .content p.ed-object').first.click()
        expect(page.locator('#selection-name')).to_have_text('그룹 · 2개')
        # 표와 글자를 섞어 묶어도 셀 글자 클릭은 바깥 그룹을 선택한다.
        page.locator('#project-file').set_input_files(str(fixture));page.locator('#confirm-yes').click()
        expect(page.locator('.slide-item')).to_have_count(1)
        marquee(frame.locator('.content p').first,frame.locator('table'))
        expect(page.locator('#selection-name')).to_have_text('선택한 요소 3개')
        page.locator('#group-elements').click()
        frame.locator('td .ed-cell-text').first.click()
        expect(page.locator('#selection-name')).to_have_text('그룹 · 3개')
        expect(page.locator('#element-width')).to_be_enabled()
        expect(page.locator('#element-width')).to_have_value('800')
        (ROOT / 'tests/_out').mkdir(exist_ok=True)
        page.screenshot(path=str(ROOT / 'tests/_out/grouping.png'))
        table_before=frame.locator('table').get_attribute('data-ed-group')
        frame.locator('td .ed-cell-text').first.dblclick()
        assert frame.locator('[contenteditable]').count()==1
        assert frame.locator('table').get_attribute('data-ed-group')==table_before
        page.keyboard.press('Escape')
        frame.locator('td .ed-cell-text').first.click()
        page.locator('#ungroup-elements').click()
        assert not frame.locator('table').get_attribute('data-ed-group')
        assert not frame.locator('.content p').first.get_attribute('data-ed-group')
        assert not errors,errors
        browser.close()
finally:
    server.terminate();server.wait(timeout=5)
print('PASS: grouping without layout changes, select/move/scale/center/copy/delete/ungroup, shortcuts, edit, JSON/HTML, slide isolation')
