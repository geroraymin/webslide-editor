"""텍스트 모서리는 글자 비율 조절, 좌우는 줄바꿈용 상자 너비만 조절한다."""
from pathlib import Path
import json
import subprocess
import sys
import tempfile
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
server=subprocess.Popen([sys.executable,'-m','http.server','8864','--bind','127.0.0.1','--directory',str(ROOT)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
try:
    with tempfile.TemporaryDirectory() as folder,sync_playwright() as p:
        browser=p.chromium.launch();page=browser.new_page(viewport={'width':1600,'height':1000});page.goto('http://127.0.0.1:8864/slide-editor.html');expect(page.locator('.slide-item')).to_have_count(6)
        fixture=Path(folder)/'text-handles.slides.json';fixture.write_text(json.dumps({'format':'slide-studio','version':1,'name':'handles','slides':['<section class="slide"><div class="stack"><p class="flow">Alpha Beta Gamma Delta</p><p class="neighbor">Neighbor</p></div><div class="ed-text absolute">Alpha Beta Gamma Delta</div></section>'],'design':{'bodyClass':'v4','css':'.slide{display:none;position:absolute;inset:0;width:1600px;height:900px;background:white}.slide.on{display:block}.stack{position:absolute;left:200px;top:180px;display:flex;flex-direction:column;gap:30px}p{margin:0;width:300px;font:40px/1.4 sans-serif}.absolute{position:absolute;left:800px;top:500px;width:300px;font:40px/1.4 sans-serif}'}}),encoding='utf-8')
        page.locator('#project-file').set_input_files(str(fixture));page.locator('#confirm-yes').click();frame=page.frames[1]
        def drag(handle,dx,dy):
            b=page.locator('[data-handle='+handle+']').bounding_box();x=b['x']+b['width']/2;y=b['y']+b['height']/2;page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+dx,y+dy,steps=6);page.mouse.up()
        def measure(node):return node.evaluate('e=>{const range=document.createRange();range.selectNodeContents(e);return {box:e.getBoundingClientRect().toJSON(),font:parseFloat(getComputedStyle(e).fontSize)*(Number(e.dataset.edScale)||1),lines:[...range.getClientRects()].map(r=>r.height),html:e.outerHTML}}')
        for selector in ['.flow','.absolute']:
            for handle,dx in [('e',200),('w',-200)]:
                node=frame.locator(selector);node.click();before=measure(node);neighbor=frame.locator('.neighbor').bounding_box();drag(handle,dx,0);after=measure(node)
                assert after['font']==before['font'],(selector,handle,'side changed font')
                assert after['box']['width']>before['box']['width']+abs(dx)-2
                assert len(after['lines'])<len(before['lines']),(selector,'widening failed to unwrap text',before,after)
                assert frame.locator('.neighbor').bounding_box()==neighbor
                page.locator('#undo').click();assert measure(node)['html']==before['html']
            for handle,dx,dy in [('se',60,35),('nw',-40,-30)]:
                node=frame.locator(selector);node.click();before=measure(node);neighbor=frame.locator('.neighbor').bounding_box();drag(handle,dx,dy);after=measure(node)
                factor=after['box']['width']/before['box']['width'];assert factor>1.1
                assert abs(after['font']/before['font']-factor)<.01
                assert len(after['lines'])==len(before['lines'])
                assert frame.locator('.neighbor').bounding_box()==neighbor
                # 대각선 확대 직후 가로 늘리기도 글자 크기를 유지한다.
                drag('e',100,0);wide=measure(node);assert abs(wide['font']-after['font'])<.01
                assert abs(wide['box']['width']-after['box']['width']-100/(page.locator('#deck-frame').bounding_box()['width']/1600))<2,(selector,after,wide)
                page.locator('#undo').click();page.locator('#undo').click()
        # Reduced text can require a CSS width above 1600 while fitting the slide.
        for reduction in [.5,.25]:
            for handle,dx in [('e',200),('w',-200)]:
                node=frame.locator('.absolute')
                node.evaluate('(e,s)=>{e.style.left="500px";e.style.width="1200px";e.style.scale=String(s);e.style.transformOrigin="0 0";e.dataset.edScale=String(s)}',reduction)
                node.click();before=measure(node);neighbor=frame.locator('.neighbor').bounding_box()
                drag(handle,dx,0);after=measure(node)
                delta=abs(dx)/(page.locator('#deck-frame').bounding_box()['width']/1600)
                assert abs(after['box']['width']-before['box']['width']-delta)<2,('reduced text width stopped',reduction,handle,before,after)
                assert after['font']==before['font']
                if handle=='w':assert abs(after['box']['right']-before['box']['right'])<2
                else:assert abs(after['box']['left']-before['box']['left'])<2
                assert frame.locator('.neighbor').bounding_box()==neighbor
                page.locator('#undo').click();assert measure(node)['html']==before['html']
        browser.close()
finally:
    server.terminate();server.wait(timeout=5)
print('PASS: flow/absolute text corners scale font and box; left/right rewrap, reduced text grows beyond 1600 local pixels, font/anchor/siblings and undo preserved')
