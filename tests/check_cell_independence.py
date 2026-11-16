"""셀 글자 상자가 표 축소를 막지 않고 빈 글자도 삭제되는지 검사한다."""
from pathlib import Path
import json
import subprocess
import sys
import tempfile
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
server=subprocess.Popen([sys.executable,'-m','http.server','8851','--bind','127.0.0.1','--directory',str(ROOT)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
try:
    with tempfile.TemporaryDirectory() as folder,sync_playwright() as p:
        browser=p.chromium.launch();page=browser.new_page(viewport={'width':1600,'height':1000});page.add_init_script('delete window.showSaveFilePicker')
        page.goto('http://127.0.0.1:8851/slide-editor.html');expect(page.locator('.slide-item')).to_have_count(6)
        fixture=Path(folder)/'cells.slides.json'
        fixture.write_text(json.dumps({'format':'slide-studio','version':1,'name':'cell independence','slides':['<section class="slide"><table><tbody><tr><td><div class="ed-cell-text" style="width:600px;height:240px">Large text box</div></td><td>Other cell</td></tr><tr><td>Second row</td><td>Last cell</td></tr></tbody></table><p class="outside">Delete this text</p></section>'],'design':{'bodyClass':'v4','css':'.slide{display:none;position:absolute;inset:0;width:1600px;height:900px;background:white}.slide.on{display:block}table{position:absolute;left:200px;top:180px;width:1000px;border-collapse:collapse;font:36px/1.5 sans-serif}td{padding:8px;border:1px solid #678;vertical-align:middle}.outside{position:absolute;left:200px;top:650px;width:400px;font:32px sans-serif}'}}),encoding='utf-8')
        page.locator('#project-file').set_input_files(str(fixture));page.locator('#confirm-yes').click();frame=page.frames[1]
        table=frame.locator('.slide.on table');text=table.locator('.ed-cell-text').first
        grid=lambda:table.locator('td').evaluate_all('es=>es.map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]})')
        def number(id,value):page.locator('#'+id).fill(str(value));page.locator('#'+id).press('Tab')
        # 본문보다 큰 빈 공간이 있는 글자 상자도 행/열 크기를 강제하지 않는다.
        table.locator('td').first.click(position={'x':3,'y':3})
        before_text=text.bounding_box()
        number('table-row-height',40)
        assert table.locator('tr').first.evaluate('e=>e.getBoundingClientRect().height')<=42,'text box prevents row shrink'
        number('table-col-width',160)
        assert table.locator('td').first.evaluate('e=>e.getBoundingClientRect().width')<=162,'text box prevents column shrink'
        assert text.bounding_box()['width']==before_text['width'] and text.bounding_box()['height']==before_text['height']
        # 글자 크기·여러 줄 입력·글자 상자 크기를 바꿔도 표 좌표는 그대로다.
        text.click(position={'x':10,'y':10});before=grid();number('font-size',120);assert grid()==before
        page.locator('#text-content').fill('one\ntwo\nthree\nfour\nfive');page.locator('#text-content').press('Tab');assert grid()==before
        number('element-width',800);number('element-height',400);assert grid()==before
        # 내용이 빈 기존 p도 클릭을 벗어난 뒤 레이어에서 다시 선택·삭제한다.
        page.locator('#layers .layer-name').get_by_text('텍스트 · Delete this text',exact=True).click();page.locator('#text-content').fill('');page.locator('#text-content').press('Tab');page.keyboard.press('Escape')
        empty=page.locator('#layers .layer-name').get_by_text('텍스트 · 빈 요소',exact=True)
        expect(empty).to_have_count(1);empty.click();page.locator('#delete-element').click();expect(frame.locator('.outside')).to_have_count(0)
        page.locator('#undo').click();expect(frame.locator('.outside')).to_have_count(1)
        page.locator('#layers .layer-name').filter(has_text='one').first.click();page.locator('#text-content').fill('');page.locator('#text-content').press('Tab');page.keyboard.press('Escape')
        # 표 안과 밖의 빈 글자 상자가 모두 목록에 남는다.
        empty=page.locator('#layers .layer-name').get_by_text('텍스트 · 빈 요소',exact=True)
        expect(empty).to_have_count(2);text.click(position={'x':10,'y':10});page.locator('#delete-element').click()
        assert table.locator('.ed-cell-text').count()==3
        assert max(abs(a-b) for row,old in zip(grid(),before) for a,b in zip(row,old))<.1,(grid(),before)
        before_empty=grid()
        table.locator('td').first.dblclick(position={'x':40,'y':12})
        assert frame.locator('[contenteditable]').count()==1,(page.locator('#selection-name').inner_text(),table.locator('td').first.evaluate('e=>e.outerHTML'),frame.evaluate('document.documentElement.dataset.edTableCursor'))
        page.keyboard.insert_text('new\ncell\ntext');page.keyboard.press('Escape')
        assert table.locator('.ed-cell-text').count()==4
        assert grid()==before_empty,'typing into an emptied cell resized the grid'
        table.locator('td').first.locator('.ed-cell-text').click(position={'x':10,'y':10});page.locator('#delete-element').click()
        assert table.locator('.ed-cell-text').count()==3
        table.locator('td').first.click(position={'x':3,'y':3});number('element-height',80);number('element-width',300)
        assert table.evaluate('t=>t.getBoundingClientRect().height')<=81
        assert table.evaluate('t=>t.getBoundingClientRect().width')<=301
        size=table.evaluate('t=>[t.getBoundingClientRect().width,t.getBoundingClientRect().height]')
        glyphs=frame.locator('.ed-cell-text').evaluate_all('es=>es.map(e=>[e.getBoundingClientRect().width,e.getBoundingClientRect().height,getComputedStyle(e).fontSize])')
        handle=page.locator('[data-handle=se]').bounding_box();x=handle['x']+handle['width']/2;y=handle['y']+handle['height']/2
        page.mouse.move(x,y);page.mouse.down();page.mouse.move(x-20,y-10,steps=5);page.mouse.up()
        after_size=table.evaluate('t=>[t.getBoundingClientRect().width,t.getBoundingClientRect().height]')
        assert after_size[0]<size[0]-15 and after_size[1]<size[1]-5,(size,after_size)
        assert frame.locator('.ed-cell-text').evaluate_all('es=>es.map(e=>[e.getBoundingClientRect().width,e.getBoundingClientRect().height,getComputedStyle(e).fontSize])')==glyphs
        with page.expect_download() as d:page.locator('#save-project').click()
        saved=Path(folder)/'saved.slides.json';d.value.save_as(str(saved));page.locator('#project-file').set_input_files(str(saved));page.locator('#confirm-yes').click()
        assert frame.locator('.ed-cell-text').count()==3
        with page.expect_download() as d:page.locator('#export-html').click()
        html=Path(folder)/'show.html';d.value.save_as(str(html));show=browser.new_page();show.goto(html.as_uri())
        assert show.locator('tr').first.evaluate('e=>e.getBoundingClientRect().height')<=42
        browser.close()
finally:
    server.terminate();server.wait(timeout=5)
print('PASS: independent table/text geometry, shrinking rows/columns, text size/input/box resize, empty text selection/delete/undo, JSON/HTML')
