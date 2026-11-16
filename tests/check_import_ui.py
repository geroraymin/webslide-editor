"""HTML·폴더 입력과 발표 조작을 실제 화면으로 확인한다."""
from pathlib import Path
import subprocess
import sys
import tempfile
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
server=subprocess.Popen([sys.executable,'-m','http.server','8857','--bind','127.0.0.1','--directory',str(ROOT)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
try:
    with tempfile.TemporaryDirectory() as folder,sync_playwright() as p:
        browser=p.chromium.launch();page=browser.new_page(viewport={'width':1600,'height':1000})
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://127.0.0.1:8857/slide-editor.html');expect(page.locator('.slide-item')).to_have_count(6)
        root=Path(folder);css='.slide{display:none;width:1600px;height:900px;padding:100px;background:white}.slide.on{display:block}h2{font:50px sans-serif}'
        body='<body class="v4"><main><section class="slide"><h2>First imported</h2><p class="speaker-note">first note</p></section><section class="slide"><h2>Second imported</h2></section></main></body>'
        html=root/'single.html';html.write_text('<!doctype html><title>single</title><style>'+css+'</style>'+body,encoding='utf-8')
        page.locator('#open').click()
        with page.expect_file_chooser() as chooser:page.locator('#open-html-choice').click()
        chooser.value.set_files(str(html));expect(page.locator('#import-apply')).to_be_enabled();page.locator('#import-apply').click()
        expect(page.locator('.slide-item')).to_have_count(2);frame=page.frames[1];expect(frame.locator('.slide.on h2')).to_have_text('First imported')
        bundled=root/'bundle';bundled.mkdir();(bundled/'style.css').write_text(css,encoding='utf-8')
        (bundled/'deck.html').write_text('<!doctype html><title>folder</title><link rel="stylesheet" href="style.css">'+body,encoding='utf-8')
        page.locator('#open').click()
        with page.expect_file_chooser() as chooser:page.locator('#open-folder-choice').click()
        chooser.value.set_files(str(bundled));expect(page.locator('#import-apply')).to_be_enabled();page.locator('#import-apply').click()
        expect(page.locator('#deck-name')).to_have_value('folder')
        first=page.locator('.slide-item').first;second=page.locator('.slide-item').nth(1);height=second.bounding_box()['height']
        first.drag_to(second,target_position={'x':60,'y':height-5})
        expect(frame.locator('.slide').first.locator('h2')).to_have_text('Second imported')
        page.locator('#undo').click();expect(frame.locator('.slide').first.locator('h2')).to_have_text('First imported')
        page.locator('.slide-item').first.click()
        with page.expect_popup() as popup:page.locator('#present').click()
        show=popup.value;show.wait_for_load_state();expect(show.locator('#counter')).to_have_text('1 / 2')
        show.locator('#notes-button').click();expect(show.locator('#present-notes')).to_have_text('first note')
        show.locator('#next').click();expect(show.locator('#counter')).to_have_text('2 / 2')
        show.locator('#prev').click();expect(show.locator('#counter')).to_have_text('1 / 2')
        show.keyboard.press('End');expect(show.locator('#counter')).to_have_text('2 / 2')
        show.keyboard.press('Home');expect(show.locator('#counter')).to_have_text('1 / 2')
        show.locator('#full').click();show.wait_for_function('!!document.fullscreenElement');show.evaluate('document.exitFullscreen()')
        show.evaluate('window.print=()=>window.printCalled=true');show.locator('#pdf').click();assert show.evaluate('window.printCalled')
        show.close();assert not errors,errors;browser.close()
finally:
    server.terminate();server.wait(timeout=5)
print('PASS: single HTML/folder file chooser and import, rail drag/undo, presentation next/prev/Home/End/notes/fullscreen, print command')
