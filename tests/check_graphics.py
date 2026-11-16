"""CSS로 그린 선·화살표와 SVG가 편집·복사·저장 후에도 유지되는지 검사한다."""
from pathlib import Path
import json
import subprocess
import sys
import tempfile
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
server=subprocess.Popen([sys.executable,'-m','http.server','8855','--bind','127.0.0.1','--directory',str(ROOT)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
try:
    with tempfile.TemporaryDirectory() as folder,sync_playwright() as p:
        browser=p.chromium.launch();page=browser.new_page(viewport={'width':1600,'height':1000});page.add_init_script('delete window.showSaveFilePicker')
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://127.0.0.1:8855/slide-editor.html');expect(page.locator('.slide-item')).to_have_count(6)
        fixture=Path(folder)/'graphics.slides.json'
        fixture.write_text(json.dumps({'format':'slide-studio','version':1,'name':'graphics check','slides':['<section class="slide"><ol class="flow"><li>First</li><li>Second</li></ol><div class="connection-lines"><span>Left</span><span>Right</span></div><hr><svg viewBox="0 0 100 100" style="position:absolute;left:900px;top:500px;width:180px;height:180px"><path d="M10 50 L90 50 L70 30 M90 50 L70 70" fill="none" stroke="#16312b" stroke-width="3"/></svg></section>','<section class="slide"></section>'],'design':{'bodyClass':'v4','css':'.slide{display:none;position:absolute;inset:0;width:1600px;height:900px;background:white}.slide.on{display:block}.flow{position:absolute;left:200px;top:200px;display:flex;gap:120px;font:36px/1.5 sans-serif}.flow li{position:relative;list-style:none}.flow li+li::before{content:"›";position:absolute;left:-70px;top:0;color:#567;font-size:40px}.connection-lines{position:absolute;left:350px;top:400px;display:flex;gap:200px;font:36px/1.5 sans-serif}.connection-lines span{position:relative}.connection-lines span::before{content:"";position:absolute;left:50%;top:-40px;height:30px;border-left:2px solid #789}hr{position:absolute;left:200px;top:650px;width:400px;border:0;border-top:2px solid #567}'}}),encoding='utf-8')
        unsafe=json.loads(fixture.read_text(encoding='utf-8'))
        unsafe['slides'][0]=unsafe['slides'][0].replace('<svg viewBox','<svg onload="window.svgUnsafe=true" viewBox').replace('</svg>','<script>window.svgUnsafe=true</script><foreignObject><iframe src="https://example.com"></iframe></foreignObject><a xlink:href="javascript:window.svgUnsafe=true"></a></svg>')
        fixture.write_text(json.dumps(unsafe),encoding='utf-8')
        page.locator('#project-file').set_input_files(str(fixture));page.locator('#confirm-yes').click();frame=page.frames[1]
        assert frame.locator('svg script,svg foreignObject,svg iframe,svg [onload],svg[onload]').count()==0
        assert frame.evaluate('!window.svgUnsafe')
        assert frame.locator('svg a').evaluate('e=>!e.hasAttribute("xlink:href")')
        expect(frame.locator('.slide.on .ed-decoration')).to_have_count(3)
        assert frame.locator('.flow li').nth(1).evaluate('e=>getComputedStyle(e,"::before").content')=='none'
        arrow=frame.locator('.flow .ed-decoration');arrow.dblclick();assert arrow.evaluate('e=>e.isContentEditable');page.keyboard.insert_text('→');page.keyboard.press('Escape');expect(arrow).to_have_text('→')
        line=frame.locator('.connection-lines .ed-decoration').first
        page.keyboard.press('Escape');b=line.bounding_box();page.mouse.click(b['x']+b['width']/2+3,b['y']+b['height']/2)
        expect(page.locator('#selection-name')).to_have_text('선택한 선')
        before=line.bounding_box();page.keyboard.press('Shift+ArrowRight');assert abs(line.bounding_box()['x']-before['x'])>1
        page.locator('#graphic-color').fill('#123456');page.locator('#graphic-color').dispatch_event('change')
        page.locator('#graphic-width').fill('4');page.locator('#graphic-width').press('Tab')
        assert line.evaluate('e=>e.style.borderLeft')=='4px solid rgb(18, 52, 86)'
        for width in ['0','4']:
            page.locator('#graphic-width').fill(width);page.locator('#graphic-width').press('Tab')
        assert line.evaluate('e=>e.style.borderLeft')=='4px solid rgb(18, 52, 86)'
        page.keyboard.press('Control+d');expect(frame.locator('.slide.on .ed-decoration')).to_have_count(4)
        page.locator('#delete-element').click();expect(frame.locator('.slide.on .ed-decoration')).to_have_count(3)
        frame.locator('hr').click();expect(page.locator('#selection-name')).to_have_text('선택한 선');page.keyboard.press('Control+c')
        page.locator('.slide-item').nth(1).click();page.keyboard.press('Control+v');expect(frame.locator('.slide.on hr')).to_have_count(1)
        page.locator('.slide-item').first.click();frame.locator('.slide.on svg path').click();expect(page.locator('#selection-name')).to_have_text('선택한 도형')
        assert page.locator('#element-width').input_value()=='180'
        page.locator('#graphic-color').fill('#abcdef');page.locator('#graphic-color').dispatch_event('change')
        assert frame.locator('.slide.on svg path').evaluate('e=>e.style.stroke')=='rgb(171, 205, 239)'
        frame.locator('.slide.on svg path').click()
        page.keyboard.press('Control+d');expect(frame.locator('.slide.on svg')).to_have_count(2)
        page.keyboard.press('Control+c');page.locator('.slide-item').nth(1).click();page.keyboard.press('Control+v');expect(frame.locator('.slide.on svg')).to_have_count(1)
        with page.expect_download() as download:page.locator('#save-project').click()
        saved=Path(folder)/'saved.slides.json';download.value.save_as(str(saved))
        page.locator('#project-file').set_input_files(str(saved));page.locator('#confirm-yes').click();page.locator('.slide-item').first.click()
        expect(frame.locator('.slide.on .ed-decoration')).to_have_count(3);expect(frame.locator('.slide.on svg')).to_have_count(2)
        with page.expect_download() as download:page.locator('#export-html').click()
        html=Path(folder)/'graphics.html';download.value.save_as(str(html))
        show=browser.new_page();show.goto(html.as_uri());expect(show.locator('.slide').first.locator('.ed-decoration')).to_have_count(3)
        assert show.locator('.flow li').nth(1).evaluate('e=>getComputedStyle(e,"::before").content')=='none'
        page.screenshot(path=str(ROOT / 'tests/_out/graphics-editing.png'))
        assert not errors,errors;browser.close()
finally:
    server.terminate();server.wait(timeout=5)
print('PASS: CSS arrow editing, thin-line picking/move/color/width/copy/delete, SVG selection/style/duplicate/cross-slide paste, JSON and HTML persistence')
