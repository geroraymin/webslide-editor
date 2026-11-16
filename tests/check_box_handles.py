"""위아래 손잡이는 너비와 글자 크기를 유지하고 높이만 바꾼다."""
from pathlib import Path
import json
import subprocess
import sys
import tempfile
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
server=subprocess.Popen([sys.executable,'-m','http.server','8850','--bind','127.0.0.1','--directory',str(ROOT)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
try:
    with tempfile.TemporaryDirectory() as folder,sync_playwright() as p:
        browser=p.chromium.launch()
        page=browser.new_page(viewport={'width':1600,'height':1000})
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://127.0.0.1:8850/slide-editor.html')
        expect(page.locator('.slide-item')).to_have_count(6)
        fixture=Path(folder)/'heights.slides.json'
        fixture.write_text(json.dumps({'format':'slide-studio','version':1,'name':'heights','slides':['''<section class="slide">
        <div class="stack"><article class="card"><p>Card text</p></article><p class="flow">Flow text</p><p class="neighbor">Neighbor</p></div>
        <div class="ed-box shape"></div><div class="ed-text scaled" data-ed-scale="0.5">Reduced text</div>
        <img class="photo" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='200'%3E%3Crect width='400' height='200' fill='red'/%3E%3C/svg%3E">
        <table class="table"><tr><td>Cell one</td><td>Cell two</td></tr><tr><td>Cell three</td><td>Cell four</td></tr></table>
        </section>'''],'design':{'bodyClass':'v4','css':''' .slide{display:none;position:absolute;inset:0;width:1600px;height:900px;background:white}.slide.on{display:block}
        p{margin:0;font:32px/1.4 sans-serif}.stack{position:absolute;left:100px;top:120px;display:flex;flex-direction:column;gap:25px;width:400px}
        .card{padding:30px;background:#ddd;min-height:180px;max-height:180px}.flow{height:100px}.shape{position:absolute;left:700px;top:150px;width:300px;height:200px;background:#abc}
        .scaled{position:absolute;left:1050px;top:400px;width:500px;height:200px;scale:.5;transform-origin:0 0;font:40px sans-serif}
        .photo{position:absolute;left:700px;top:450px;width:250px;height:130px}.table{position:absolute;left:100px;top:650px;width:400px;height:150px;border-collapse:collapse;table-layout:fixed}.table td{border:1px solid black;padding:20px;font:20px sans-serif}
        '''}}),encoding='utf-8')
        page.locator('#project-file').set_input_files(str(fixture));page.locator('#confirm-yes').click();frame=page.frames[1]
        def measure(node):
            return node.evaluate('e=>({box:e.getBoundingClientRect().toJSON(),html:e.outerHTML,font:getComputedStyle(e).fontSize})')
        def drag(handle,dx,dy):
            button=page.locator('[data-handle='+handle+']');expect(button).to_be_visible()
            b=button.bounding_box();x=b['x']+b['width']/2;y=b['y']+b['height']/2
            page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+dx,y+dy,steps=8);page.mouse.up()
        for selector in ['.card','.flow','.shape','.scaled','.photo','.table']:
            for handle,grow,shrink in [('s',60,-30),('n',-60,30)]:
                node=frame.locator(selector);node.click(position={'x':10,'y':10})
                before=measure(node);neighbor=frame.locator('.neighbor').bounding_box()
                page.locator('[data-handle='+handle+']').click()
                assert measure(node)['html']==before['html'],(selector,'handle click changed DOM')
                for dy in [grow,shrink]:
                    prior=measure(node);drag(handle,35,dy);after=measure(node)
                    delta=dy/(page.locator('#deck-frame').bounding_box()['width']/1600)*(1 if handle=='s' else -1)
                    assert abs(after['box']['height']-prior['box']['height']-delta)<2,(selector,handle,prior,after,delta)
                    assert abs(after['box']['width']-before['box']['width'])<1,(selector,'width changed')
                    assert after['font']==before['font'],(selector,'font changed')
                    anchor='bottom' if handle=='n' else 'top'
                    assert abs(after['box'][anchor]-before['box'][anchor])<2,(selector,'opposite edge moved')
                    assert frame.locator('.neighbor').bounding_box()==neighbor,(selector,'neighbor moved')
                if selector=='.card' and handle=='s':page.screenshot(path=str(ROOT / 'tests/_out'/'box-height-handles.png'))
                page.locator('#undo').click();page.locator('#undo').click()
                assert measure(node)['html']==before['html'],(selector,'undo failed')
        # Groups retain proportional corner resizing; middle handles stay hidden.
        frame.locator('.shape').click();page.keyboard.down('Shift');frame.locator('.scaled').click();page.keyboard.up('Shift')
        expect(page.locator('[data-handle=n]')).to_be_hidden();expect(page.locator('[data-handle=s]')).to_be_hidden()
        assert not errors,errors
        browser.close()
finally:
    server.terminate();server.wait(timeout=5)
print('PASS: top/bottom grow and shrink card/flow/shape/reduced text/photo/table; width/font/anchor/neighbors and undo preserved, multi handles hidden')
