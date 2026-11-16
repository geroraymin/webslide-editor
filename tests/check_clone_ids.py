"""크기 변경한 글자가 있는 상자·장표 복제 시 식별자와 빈칸 연결을 검사한다."""
from pathlib import Path
import json
import subprocess
import sys
import tempfile
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
server=subprocess.Popen([sys.executable,'-m','http.server','8852','--bind','127.0.0.1','--directory',str(ROOT)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
try:
    with tempfile.TemporaryDirectory() as folder,sync_playwright() as p:
        browser=p.chromium.launch();page=browser.new_page(viewport={'width':1600,'height':1000})
        page.goto('http://127.0.0.1:8852/slide-editor.html');expect(page.locator('.slide-item')).to_have_count(6)
        fixture=Path(folder)/'clones.slides.json'
        fixture.write_text(json.dumps({'format':'slide-studio','version':1,'name':'clone check','slides':['<section class="slide"><article><p>inner text</p></article></section>','<section class="slide"></section>'],'design':{'bodyClass':'v4','css':'.slide{display:none;width:1600px;height:900px;position:absolute;inset:0}.slide.on{display:block}article{position:absolute;left:200px;top:200px;width:500px;height:300px;border:2px solid #678;padding:40px;font:32px/1.5 sans-serif}p{margin:0}'}}),encoding='utf-8')
        legacy=json.loads(fixture.read_text(encoding='utf-8'))
        legacy['slides'][0]=legacy['slides'][0].replace('<p>inner text</p>','<span class="ed-layout-placeholder" data-ed-placeholder-for="inner" style="display:block;width:300px;height:48px;visibility:hidden"></span><p data-ed-id="inner" data-ed-detached-object="true" style="position:absolute;left:40px;top:40px;width:300px;height:48px">inner text</p>')
        fixture.write_text(json.dumps(legacy),encoding='utf-8')
        page.locator('#project-file').set_input_files(str(fixture));page.locator('#confirm-yes').click();frame=page.frames[1]
        expect(frame.locator('.ed-layout-placeholder')).to_have_count(1)
        frame.locator('.slide.on p').click();page.locator('#hide-elements').click()
        frame.locator('.slide.on article').click(position={'x':10,'y':10});page.keyboard.press('Control+c')
        page.locator('.slide-item').nth(1).click();page.keyboard.press('Control+v')
        page.keyboard.press('Control+d')
        second_text_id=frame.locator('.slide.on article').nth(1).locator('p').get_attribute('data-ed-id')
        second_text=frame.locator('[data-ed-id="'+second_text_id+'"]')
        page.locator('#element-x').fill('1000');page.locator('#element-x').press('Tab')
        def links():
            assert frame.evaluate('''()=>{const ids=[...document.querySelectorAll('[data-ed-id]')].map(e=>e.dataset.edId);return ids.length===new Set(ids).size&&[...document.querySelectorAll('.ed-layout-placeholder')].every(e=>ids.includes(e.dataset.edPlaceholderFor))}''')
        links()
        first=frame.locator('.slide.on article').first
        page.locator('#layers > .layer-row').filter(has=page.get_by_role('button',name='텍스트 · inner text',exact=True)).first.get_by_role('button',name='표시',exact=True).click()
        assert first.locator('p').evaluate('e=>getComputedStyle(e).visibility')=='visible'
        assert second_text.evaluate('e=>getComputedStyle(e).visibility')=='hidden'
        first.locator('p').dblclick();expect(page.locator('#selection-name')).to_have_text('선택한 텍스트')
        page.keyboard.type('edited clone');page.keyboard.press('Escape')
        expect(first.locator('p')).to_have_text('edited clone')
        first.locator('p').click();page.locator('#delete-element').click()
        assert frame.locator('.ed-layout-placeholder').count()==2
        assert first.locator('.ed-layout-placeholder').count()==0
        links()
        page.locator('#copy-slide').click();expect(page.locator('.slide-item')).to_have_count(3);links()
        browser.close()
finally:
    server.terminate();server.wait(timeout=5)
print('PASS: copied box inner text edit, unique clone/slide IDs, placeholder links and isolated deletion')
