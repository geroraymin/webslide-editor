"""엔터·붙여넣기 줄바꿈은 편집 종료·너비 변경·저장 후에도 유지한다."""
from pathlib import Path
import json
import subprocess
import sys
import tempfile
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
server=subprocess.Popen([sys.executable,'-m','http.server','8865','--bind','127.0.0.1','--directory',str(ROOT)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
try:
    with tempfile.TemporaryDirectory() as folder,sync_playwright() as p:
        browser=p.chromium.launch();page=browser.new_page(viewport={'width':1600,'height':1000})
        page.goto('http://127.0.0.1:8865/slide-editor.html');expect(page.locator('.slide-item')).to_have_count(6)
        fixture=Path(folder)/'linebreaks.slides.json'
        fixture.write_text(json.dumps({'format':'slide-studio','version':1,'name':'linebreaks','slides':['''<section class="slide"><div class="stack">
        <p class="plain">Original text</p><p class="nowrap">Original text</p><h2 class="nested"><span>Original</span> <strong>text</strong></h2>
        <p class="flex">Original <strong>text</strong></p><div class="ed-text absolute">Original text</div>
        <table><tr><td>Original text</td></tr></table></div></section>'''],'design':{'bodyClass':'v4','css':'.slide{position:absolute;inset:0;width:1600px;height:900px}.stack{position:absolute;left:200px;top:100px;width:1000px}p,h2,.ed-text{margin:0 0 35px;width:900px;font:32px/1.5 sans-serif}.nowrap{white-space:nowrap}.nested span{display:inline-block}.flex{display:flex;gap:20px}.absolute{position:absolute;left:0;top:650px}.ed-text{white-space:pre-wrap}td{width:800px;height:100px;font:32px/1.5 sans-serif;padding:15px;border:1px solid black}'}}),encoding='utf-8')
        page.locator('#project-file').set_input_files(str(fixture));page.locator('#confirm-yes').click();frame=page.frames[1]
        def lines(node):
            return node.evaluate('''e=>{const w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),out=[];while(w.nextNode()){const n=w.currentNode;for(let i=0;i<n.length;i++){if(/\\s/.test(n.data[i]))continue;const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+1);const b=r.getBoundingClientRect();out.push({char:n.data[i],y:Math.round(b.y)});}}return out}''')
        expected=['First line','Second words','Third line']
        for selector in ['.plain','.nowrap','.nested','.flex','.absolute','td .ed-cell-text']:
            node=frame.locator(selector);original=node.evaluate('e=>e.outerHTML');node.dblclick()
            page.keyboard.type(expected[0]);page.keyboard.press('Enter');page.keyboard.type(expected[1]);page.keyboard.press('Enter');page.keyboard.type(expected[2])
            for phase in ['typing','finished']:
                if phase=='finished':page.keyboard.press('Escape')
                glyphs=lines(node);ys=sorted(set(g['y'] for g in glyphs))
                actual=[''.join(g['char'] for g in glyphs if g['y']==y) for y in ys]
                assert actual==[s.replace(' ','') for s in expected],(selector,phase,actual,node.evaluate('e=>e.outerHTML'))
            node.click(position={'x':5,'y':5});b=page.locator('[data-handle=e]').bounding_box();x=b['x']+b['width']/2;y=b['y']+b['height']/2
            page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+70,y,steps=6);page.mouse.up()
            glyphs=lines(node);assert len(set(g['y'] for g in glyphs))==3,(selector,'resizing lost explicit breaks')
            page.locator('#undo').click();page.locator('#undo').click()
            assert node.evaluate('e=>e.outerHTML')==original,(selector,'undo text/style changed original')
            page.locator('#redo').click()
            assert len(set(g['y'] for g in lines(node)))==3,(selector,'redo lost explicit breaks')
        page.locator('#project-file').set_input_files(str(fixture));page.locator('#confirm-yes').click()
        for selector in ['.flex','.nested','.nowrap']:
            node=frame.locator(selector);node.dblclick()
            node.evaluate('''e=>{const w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);w.nextNode();const r=document.createRange();r.setStart(w.currentNode,4);r.collapse(true);const s=window.getSelection();s.removeAllRanges();s.addRange(r)}''')
            page.keyboard.press('Enter');page.keyboard.type('New words');page.keyboard.press('Enter');page.keyboard.press('Escape')
            glyphs=lines(node);ys=sorted(set(g['y'] for g in glyphs));actual=[''.join(g['char'] for g in glyphs if g['y']==y) for y in ys]
            assert actual==['Orig','Newwords','inaltext'],(selector,'split existing styled text',actual,node.evaluate('e=>e.outerHTML'))
        # Paste literal newlines and an empty line into imported normal text.
        node=frame.locator('.plain');node.dblclick()
        pasted='붙여넣기 첫줄\n\n둘째 내용\n마지막'
        node.evaluate('''(e,text)=>{const data=new DataTransfer();data.setData('text/plain',text);e.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}))}''',pasted)
        page.keyboard.press('Escape')
        def check_pasted(node):
            glyphs=lines(node);ys=sorted(set(g['y'] for g in glyphs))
            assert [''.join(g['char'] for g in glyphs if g['y']==y) for y in ys]==['붙여넣기첫줄','둘째내용','마지막']
            assert abs((ys[1]-ys[0])-2*(ys[2]-ys[1]))<2,('empty line lost',ys)
        check_pasted(node)
        page.wait_for_timeout(600)
        draft=page.evaluate("JSON.parse(localStorage.getItem('webslide-studio:v1:starter-deck.html'))")
        saved=Path(folder)/'saved.slides.json';saved.write_text(json.dumps(draft),encoding='utf-8')
        page.locator('#project-file').set_input_files(str(saved));page.locator('#confirm-yes').click();check_pasted(node)
        with page.expect_download() as download:page.locator('#export-html').click()
        exported=Path(folder)/'exported.html';download.value.save_as(str(exported))
        preview=browser.new_page(viewport={'width':1600,'height':1000});preview.goto(exported.as_uri());check_pasted(preview.locator('.plain'));preview.close()
        browser.close()
finally:
    server.terminate();server.wait(timeout=5)
print('PASS: Enter and partial styled-text edits, resizing, undo/redo, Korean paste and empty line, JSON/HTML roundtrip preserve lines')
