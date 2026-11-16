"""그룹으로 묶지 않은 상자·표와 안쪽 글자의 이동·크기 조절을 분리한다."""
from pathlib import Path
import json
import subprocess
import sys
import tempfile
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
server=subprocess.Popen([sys.executable,'-m','http.server','8859','--bind','127.0.0.1','--directory',str(ROOT)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
try:
    with tempfile.TemporaryDirectory() as folder,sync_playwright() as p:
        browser=p.chromium.launch();page=browser.new_page(viewport={'width':1600,'height':1000})
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://127.0.0.1:8859/slide-editor.html');expect(page.locator('.slide-item')).to_have_count(6)
        fixture=Path(folder)/'independent.slides.json'
        fixture.write_text(json.dumps({'format':'slide-studio','version':1,'name':'independent','slides':['''<section class="slide"><div class="stack"><article class="card"><p class="caption">Inside <strong>card</strong></p></article><p class="neighbor">Outside text</p></div><table class="table"><tr><td>Cell one</td><td>Cell two</td></tr><tr><td>Cell three</td><td>Cell four</td></tr></table></section>'''],'design':{'bodyClass':'v4','css':'.slide{position:absolute;inset:0;width:1600px;height:900px}.stack{position:absolute;left:100px;top:180px;width:500px;display:flex;flex-direction:column;gap:50px}.card{padding:40px;background:#cde;border-radius:20px;color:#123;font:32px/1.5 serif}.caption,.neighbor{margin:0}.neighbor{font:32px/1.5 sans-serif}.table{position:absolute;left:850px;top:180px;width:500px;height:250px;table-layout:fixed;border-collapse:collapse}.table td{border:2px solid black;padding:24px;font:24px/1.5 sans-serif}'}}),encoding='utf-8')
        def load():
            page.locator('#project-file').set_input_files(str(fixture));page.locator('#confirm-yes').click()
        load();frame=page.frames[1]
        def measure(node):return node.evaluate('e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {box:[r.x,r.y,r.width,r.height],font:s.font,color:s.color,text:e.textContent}}')
        def same(node,prior,label):
            after=measure(node);assert all(abs(a-b)<1 for a,b in zip(after['box'],prior['box'])),(label,prior,after)
            assert after['font']==prior['font'] and after['color']==prior['color'],(label,'style changed',prior,after)
        def drag(selector,dx,dy):
            b=page.locator(selector).bounding_box();x=b['x']+b['width']/2;y=b['y']+b['height']/2
            page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+dx,y+dy,steps=8);page.mouse.up()
        # Resize just the text first, then move/resize its old parent.
        caption=frame.locator('.caption');caption.click();card=frame.locator('.card');neighbor=frame.locator('.neighbor')
        card_before=measure(card);neighbor_before=measure(neighbor);drag('[data-handle=e]',100,0)
        same(card,card_before,'text width moved card');same(neighbor,neighbor_before,'text width moved neighbor')
        text_before=measure(caption)
        card.click(position={'x':10,'y':10});page.keyboard.press('Shift+ArrowRight')
        same(caption,text_before,'moving card moved text');same(neighbor,neighbor_before,'moving card moved neighbor')
        drag('[data-handle=se]',45,30);same(caption,text_before,'card corner resized text');same(neighbor,neighbor_before,'card corner moved neighbor')
        page.locator('#element-width').fill('650');page.locator('#element-width').press('Tab');same(caption,text_before,'numeric width moved text')
        # The text also stays still when the container is the first edited object.
        load();caption=frame.locator('.caption');card=frame.locator('.card');text_before=measure(caption)
        card.click(position={'x':10,'y':10});drag('#move-handle',55,25);same(caption,text_before,'first card move moved text')
        page.screenshot(path=str(ROOT / 'tests/_out'/'independent-objects.png'))
        # Native text editing must not push its card or the outside text.
        load();caption=frame.locator('.caption');card=frame.locator('.card');neighbor=frame.locator('.neighbor')
        card_before=measure(card);neighbor_before=measure(neighbor);caption.dblclick();page.keyboard.type('First line');page.keyboard.press('Enter');page.keyboard.type('Second line');page.keyboard.press('Escape')
        same(card,card_before,'text Enter resized card');same(neighbor,neighbor_before,'text Enter moved neighbor')
        # Moving/resizing the table frame leaves ungrouped cell text intact.
        load();table=frame.locator('.table');cells=frame.locator('.ed-cell-text');before=[measure(cells.nth(i)) for i in range(cells.count())]
        table.click(position={'x':10,'y':10});drag('#move-handle',45,20)
        for i,prior in enumerate(before):same(cells.nth(i),prior,'table move moved text')
        drag('[data-handle=s]',0,55)
        for i,prior in enumerate(before):same(cells.nth(i),prior,'table resize moved text')
        # Explicit grouping still moves the two selected objects together.
        load();caption=frame.locator('.caption');card=frame.locator('.card')
        caption.click();page.keyboard.down('Shift');card.click(position={'x':10,'y':10});page.keyboard.up('Shift');page.locator('#group-elements').click()
        before_text=measure(caption);before_card=measure(card);page.keyboard.press('Shift+ArrowDown')
        after_text=measure(caption);after_card=measure(card)
        assert abs(after_text['box'][1]-before_text['box'][1]-10)<1 and abs(after_card['box'][1]-before_card['box'][1]-10)<1
        page.locator('#undo').click();same(caption,before_text,'group move undo text');same(card,before_card,'group move undo card')
        page.locator('#redo').click();same(caption,after_text,'group move redo text');same(card,after_card,'group move redo card')
        page.wait_for_timeout(600);draft=page.evaluate("JSON.parse(localStorage.getItem('webslide-studio:v1:starter-deck.html'))")
        saved=Path(folder)/'saved.slides.json';saved.write_text(json.dumps(draft),encoding='utf-8')
        page.locator('#project-file').set_input_files(str(saved));page.locator('#confirm-yes').click();same(caption,after_text,'JSON text');same(card,after_card,'JSON card')
        # Ungroup again after reopening; moving the box leaves the text still.
        card.click(position={'x':10,'y':10});page.locator('#ungroup-elements').click();card.click(position={'x':10,'y':10});page.keyboard.press('Shift+ArrowRight');same(caption,after_text,'ungrouped box moved text')
        with page.expect_download() as download:page.locator('#export-html').click()
        exported=Path(folder)/'exported.html';download.value.save_as(str(exported))
        show=browser.new_page(viewport={'width':1600,'height':1000});show.goto(exported.as_uri())
        assert show.locator('.caption').evaluate('e=>e.parentElement.classList.contains("slide")'),'export reattached independent text'
        show.close()
        assert not errors,errors
        browser.close()
finally:
    server.terminate();server.wait(timeout=5)
print('PASS: text resize/edit, box move/corners/numeric size, table frame, explicit grouping and JSON keep unrelated objects independent')
