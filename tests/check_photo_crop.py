"""사진 자르기·원본 보존·복사·저장·선택/삭제를 실제 브라우저로 검사한다."""
from pathlib import Path
import base64
import io
import json
import subprocess
import sys
import tempfile
from PIL import Image
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
server=subprocess.Popen([sys.executable,'-m','http.server','8860','--bind','127.0.0.1','--directory',str(ROOT)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
try:
    with tempfile.TemporaryDirectory() as folder,sync_playwright() as p:
        browser=p.chromium.launch();page=browser.new_page(viewport={'width':1600,'height':1000});page.add_init_script('delete window.showSaveFilePicker')
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://127.0.0.1:8860/slide-editor.html');expect(page.locator('.slide-item')).to_have_count(6)
        src=page.evaluate('''()=>{const c=document.createElement('canvas');c.width=400;c.height=200;const g=c.getContext('2d');g.fillStyle='#ff0000';g.fillRect(0,0,200,200);g.fillStyle='#00ff00';g.fillRect(200,0,200,200);return c.toDataURL()}''')
        fixture=Path(folder)/'photo.slides.json'
        fixture.write_text(json.dumps({'format':'slide-studio','version':1,'name':'crop check','slides':[f'<section class="slide"><div class="blank-media"><img src="{src}" alt="two colors"></div><p class="neighbor">Neighbor</p></section>','<section class="slide"><p>Other slide</p></section>'],'design':{'bodyClass':'v4','css':'.slide{display:none;position:absolute;inset:0;width:1600px;height:900px;background:white}.slide.on{display:block}.blank-media{position:absolute;left:200px;top:200px;width:400px;height:200px}img{width:100%;height:100%;object-fit:contain}.neighbor{position:absolute;left:900px;top:200px;font:40px sans-serif}'}}),encoding='utf-8')
        page.locator('#project-file').set_input_files(str(fixture));page.locator('#confirm-yes').click();frame=page.frames[1]
        photo=frame.locator('.slide.on img');photo.click();expect(page.locator('#selection-name')).to_have_text('선택한 이미지')
        original=photo.bounding_box();neighbor=frame.locator('.neighbor').bounding_box();markup=photo.evaluate('e=>e.outerHTML')
        page.locator('#crop-image').click();expect(page.locator('#crop-apply')).to_be_enabled()
        page.locator('#crop-ratio').select_option('1');r=page.locator('#crop-region').bounding_box();assert abs(r['width']-r['height'])<2
        page.locator('#crop-cancel').click();assert photo.evaluate('e=>e.outerHTML')==markup
        page.locator('#crop-image').click();expect(page.locator('#crop-apply')).to_be_enabled()
        for key,value in [('w',50),('x',50)]:page.locator('#crop-'+key).fill(str(value));page.locator('#crop-'+key).press('Tab')
        page.locator('#crop-apply').click();cropped=frame.locator('.slide.on svg.ed-crop-image')
        expect(cropped).to_have_count(1);expect(page.locator('#selection-name')).to_have_text('선택한 이미지')
        assert cropped.get_attribute('viewBox')=='200 0 200 200'
        assert cropped.locator('image').get_attribute('href')==src
        assert cropped.bounding_box()==original and frame.locator('.neighbor').bounding_box()==neighbor
        page.keyboard.press('Escape')
        pixels=Image.open(io.BytesIO(cropped.screenshot())).convert('RGB');assert pixels.getpixel((pixels.width//2,pixels.height//2))==(0,255,0)
        cropped.click();page.locator('#image-cover').click();assert cropped.get_attribute('preserveAspectRatio')=='xMidYMid slice'
        page.locator('#image-contain').click();assert cropped.get_attribute('preserveAspectRatio')=='xMidYMid meet'
        # 재편집·영역 이동·모서리 조절은 적용 전까지 원본/장표를 건드리지 않는다.
        page.locator('#crop-image').click();expect(page.locator('#crop-apply')).to_be_enabled();expect(page.locator('#crop-x')).to_have_value('50')
        page.screenshot(path=str(ROOT / 'tests/_out/photo-crop-dialog.png'))
        r=page.locator('#crop-region').bounding_box();page.mouse.move(r['x']+r['width']/2,r['y']+r['height']/2);page.mouse.down();page.mouse.move(r['x']+10,r['y']+r['height']/2,steps=5);page.mouse.up()
        assert float(page.locator('#crop-x').input_value())<50
        h=page.locator('[data-crop-handle=se]').bounding_box();page.mouse.move(h['x']+h['width']/2,h['y']+h['height']/2);page.mouse.down();page.mouse.move(h['x']-30,h['y']-20,steps=5);page.mouse.up()
        assert float(page.locator('#crop-w').input_value())<50
        page.locator('#crop-apply').click();expect(page.locator('#crop-dialog')).not_to_be_visible();assert cropped.get_attribute('viewBox')!='200 0 200 200'
        page.locator('#undo').click();assert cropped.get_attribute('viewBox')=='200 0 200 200';cropped.click()
        page.locator('#reset-image-crop').click();photo=frame.locator('.slide.on img');expect(photo).to_have_count(1);assert photo.get_attribute('src')==src and photo.bounding_box()==original
        page.locator('#undo').click();expect(cropped).to_have_count(1);page.locator('#redo').click();expect(photo).to_have_count(1);page.locator('#undo').click()
        # 잘라낸 사진 복사/붙여넣기·그룹·잠금/해제·저장 유지.
        cropped.click();page.keyboard.press('Control+c');page.locator('.slide-item').nth(1).click();page.keyboard.press('Control+v')
        pasted=frame.locator('.slide.on svg.ed-crop-image');expect(pasted).to_have_count(1);assert pasted.get_attribute('viewBox')=='200 0 200 200'
        page.locator('#lock-elements').click();expect(page.locator('#selection-name')).to_have_text('슬라이드 설정')
        page.locator('#layers').get_by_role('button',name='잠금 해제',exact=True).click();page.locator('#duplicate-element').click();expect(frame.locator('.slide.on svg.ed-crop-image')).to_have_count(2)
        page.locator('#delete-element').click();expect(pasted).to_have_count(1)
        with page.expect_download() as d:page.locator('#save-project').click()
        saved=Path(folder)/'saved.slides.json';d.value.save_as(str(saved));page.locator('#project-file').set_input_files(str(saved));page.locator('#confirm-yes').click();page.locator('.slide-item').nth(1).click();expect(pasted).to_have_count(1)
        with page.expect_download() as d:page.locator('#export-html').click()
        html=Path(folder)/'crop.html';d.value.save_as(str(html));show=browser.new_page();show.goto(html.as_uri());assert show.locator('svg.ed-crop-image').count()==2;assert show.locator('svg.ed-crop-image image').first.get_attribute('href')==src;show.close()
        page.locator('#open').click();page.locator('#html-file').set_input_files(str(html));expect(page.locator('#import-apply')).to_be_enabled();page.locator('#import-apply').click();page.locator('.slide-item').nth(1).click();expect(pasted).to_have_count(1)
        # 원본 사진 교체 시 잘라낸 옛 원본이 남지 않으며 위치·크기는 유지한다.
        pasted.click();box=pasted.bounding_box();image=Path(folder)/'new.png';image.write_bytes(base64.b64decode(src.split(',')[1]))
        with page.expect_file_chooser() as chooser:page.locator('#replace-media').click()
        chooser.value.set_files(str(image));expect(frame.locator('.slide.on img')).to_have_count(1);assert frame.locator('.slide.on img').bounding_box()==box
        page.locator('#layers .layer-row').filter(has_text='이미지 · new.png').get_by_role('button',name='요소 삭제',exact=True).click();expect(frame.locator('.slide.on img')).to_have_count(0)
        # 왼쪽 목록: Delete와 개별 삭제 버튼 모두 장표 삭제·취소 지원.
        page.locator('.slide-item').nth(1).click();page.keyboard.press('Delete');expect(page.locator('#confirm-dialog')).to_be_visible();page.locator('#confirm-no').click();expect(page.locator('.slide-item')).to_have_count(2)
        page.get_by_role('button',name='2번 슬라이드 삭제',exact=True).click();page.locator('#confirm-yes').click();expect(page.locator('.slide-item')).to_have_count(1);page.locator('#undo').click();expect(page.locator('.slide-item')).to_have_count(2)
        page.screenshot(path=str(ROOT / 'tests/_out/photo-crop.png'));assert not errors,errors;browser.close()
finally:
    server.terminate();server.wait(timeout=5)
print('PASS: crop numeric/ratio/drag/cancel/reedit/reset, pixels, original preservation, geometry, copy/lock/duplicate, JSON/HTML/import, replace/delete, slide-list delete/undo')
