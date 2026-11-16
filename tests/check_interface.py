"""설정·삽입·미디어·슬라이드·발표 도구의 실제 화면 조작 검사."""
from pathlib import Path
import base64
import subprocess
import sys
import tempfile
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
server=subprocess.Popen([sys.executable,'-m','http.server','8858','--bind','127.0.0.1','--directory',str(ROOT)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
try:
    with tempfile.TemporaryDirectory() as folder,sync_playwright() as p:
        browser=p.chromium.launch()
        page=browser.new_page(viewport={'width':1600,'height':1000})
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://127.0.0.1:8858/slide-editor.html')
        expect(page.locator('.slide-item')).to_have_count(6)
        frame=page.frames[1]
        submit=lambda:page.locator('#insert-form button[type=submit]').click()
        def number(id,value):
            page.locator('#'+id).fill(str(value));page.locator('#'+id).press('Tab')
        def color(id,value):
            page.locator('#'+id).fill(value);page.locator('#'+id).dispatch_event('change')
        page.locator('#help-toggle').click();expect(page.locator('#help-dialog')).to_be_visible();page.locator('#help-close').click()
        page.locator('#open').click();expect(page.locator('#open-dialog')).to_be_visible();page.locator('#open-close').click()
        for layout in ['blank','cover','list','compare','outcomes','media']:
            count=page.locator('.slide-item').count()
            page.locator('#add-slide').click();page.locator('[name=layout]').select_option(layout);submit()
            expect(page.locator('.slide-item')).to_have_count(count+1)
            page.locator('#slide-up').click();page.locator('#slide-down').click()
            page.locator('#delete-slide').click();page.locator('#confirm-yes').click()
            expect(page.locator('.slide-item')).to_have_count(count)
        page.locator('.slide-item').first.click()
        page.locator('#add-text').click()
        text=frame.locator('.slide.on .ed-text').last
        page.locator('#text-content').fill('interface check');page.locator('#text-content').press('Tab')
        expect(text).to_have_text('interface check')
        page.locator('#bold').click()
        assert text.evaluate('e=>e.style.fontWeight') in ['400','750']
        for align in ['left','center','right']:
            page.locator('[data-align='+align+']').click();assert text.evaluate('e=>e.style.textAlign')==align
        color('text-color','#123456');assert text.evaluate('e=>e.style.color')=='rgb(18, 52, 86)'
        number('element-width',550);number('element-height',100)
        assert abs(text.evaluate('e=>e.offsetWidth')-550)<1
        page.locator('#center-x').click();page.locator('#center-y').click()
        r=text.evaluate('e=>{const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]}');assert abs(r[0]-800)<1 and abs(r[1]-450)<1
        page.locator('#bring-front').click();page.locator('#send-back').click()
        page.locator('#duplicate-element').click();expect(frame.locator('.slide.on .ed-text')).to_have_count(2)
        page.locator('#delete-element').click();expect(frame.locator('.slide.on .ed-text')).to_have_count(1)
        page.locator('#add-box').click();box=frame.locator('.slide.on .ed-box')
        color('fill-color','#abcdef');assert box.evaluate('e=>e.style.backgroundColor')=='rgb(171, 205, 239)'
        for h in ['nw','ne','sw','se','e','w']:
            before=box.get_attribute('style');page.locator('[data-handle='+h+']').click();assert box.get_attribute('style')==before
        page.locator('#delete-element').click()
        image=Path(folder)/'pixel.png';image.write_bytes(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII='))
        with page.expect_file_chooser() as chooser:page.locator('#add-image').click()
        chooser.value.set_files(str(image));expect(frame.locator('.slide.on img.ed-object')).to_have_count(1)
        with page.expect_file_chooser() as chooser:page.locator('#replace-media').click()
        chooser.value.set_files(str(image));expect(frame.locator('.slide.on img.ed-object')).to_have_count(1)
        page.locator('#delete-element').click()
        page.locator('#add-video').click();page.locator('[name=url]').fill('https://example.com/video');submit();expect(page.locator('#dialog-error')).not_to_be_empty()
        page.locator('[name=url]').fill('https://youtu.be/dQw4w9WgXcQ');submit()
        expect(frame.locator('.slide.on .video-stage')).to_have_count(1)
        page.locator('#change-video').click();page.locator('[name=url]').fill('https://www.youtube.com/watch?v=abcdefghijk');submit()
        assert 'abcdefghijk' in frame.locator('.slide.on .video-stage').get_attribute('data-src')
        page.locator('#delete-element').click()
        for bg in ['#fbfcfa','#edf2ef','#16312b','#c6f542']:page.locator('[data-background="'+bg+'"]').click()
        color('slide-bg','#abcdef');assert frame.locator('.slide.on').evaluate('e=>e.style.backgroundColor')=='rgb(171, 205, 239)'
        for zoom in ['.5','.75','1','fit']:page.locator('#zoom').select_option(zoom)
        page.locator('#zoom-in').click();page.locator('#zoom-out').click();page.locator('#zoom').select_option('fit')
        page.locator('.notes-panel summary').click();page.locator('#speaker-notes').fill('speaker note');page.locator('#speaker-notes').press('Tab')
        expect(frame.locator('.slide.on .speaker-note')).to_have_text('speaker note')
        with page.expect_popup() as popup:page.locator('#present').click()
        popup.value.wait_for_load_state();assert popup.value.locator('.slide').count()==6;popup.value.close()
        page.locator('#new-deck').click();page.locator('[name=name]').fill('new check');submit();expect(page.locator('.slide-item')).to_have_count(5)
        page.locator('#undo').click();expect(page.locator('.slide-item')).to_have_count(6)
        assert not errors,errors
        browser.close()
finally:
    server.terminate();server.wait(timeout=5)
print('PASS: all slide layouts, order/delete, text/shape formatting and size, image replace, video URL validation/change, backgrounds, zoom, notes, help/open, presentation, new deck/undo')
