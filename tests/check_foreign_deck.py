"""편집도구 템플릿(v4/v5)이 아닌 웹슬라이드 덱을 열고, 고치고, 원래 동작을 유지한 채 저장하는지 확인한다.
사용: python tools/check_foreign_deck.py <덱 폴더> <HTML 파일 이름> [화면 저장 폴더]
- 내장 표본: body 클래스 없는 덱, aside.notes 노트 유지·메모 수정, 영상·poster 포함, 일반 페이지 거절,
  파일 하나·폴더 끌어놓기, HTML 저장 시 원래 스크립트 복원.
- 인자로 받은 실제 덱: 가져오기·장별 화면 → HTML 저장 → 저장본을 열어 원래 스크립트로 장이 넘어가는지.
예: python tests/check_foreign_deck.py examples sample-deck.html"""
from pathlib import Path
import re, subprocess, sys, tempfile, base64
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
WEBM = b'\x1aE\xdf\xa3' + bytes(60)  # 재생 검사가 아니라 파일 포함 여부만 본다
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
CSS = '.slide{position:absolute;inset:0;display:none}.slide.on{display:block}h2{font:50px sans-serif}aside.notes{display:none}'
SCRIPT = ('<script>var s=[].slice.call(document.querySelectorAll(".slide")),i=0;function go(n){i=Math.max(0,Math.min(s.length-1,n));'
          's.forEach(function(e,j){e.classList.toggle("on",j===i)});document.getElementById("pos").textContent=(i+1)+"/"+s.length}'
          'addEventListener("keydown",function(e){if(e.key==="ArrowRight")go(i+1)});go(0);</script>')
PLAIN = ('<!doctype html><title>plain</title><style>' + CSS + '</style><body><div id="pos"></div><main id="stage">'
         '<section class="slide"><h2>Plain one</h2><video src="img/v.webm" poster="img/p.png"></video>'
         '<aside class="notes" data-time="10초"><p class="tip">first para</p><p>second para</p></aside></section>'
         '<section class="slide"><h2>Plain two</h2></section></main>' + SCRIPT + '</body>')


def open_folder(page, folder, name):
    page.locator('#open').click()
    with page.expect_file_chooser() as chooser:
        page.locator('#open-folder-choice').click()
    chooser.value.set_files(str(folder))
    pick(page, name)


def pick(page, name):
    values = page.locator('#import-deck option').evaluate_all('o=>o.map(x=>x.value)')
    page.locator('#import-deck').select_option(next(v for v in values if v.endswith(name)))


def export(page, path):
    with page.expect_download() as d:
        page.locator('#export-html').click()
    d.value.save_as(str(path))
    return path.read_text(encoding='utf-8')


server = subprocess.Popen([sys.executable, '-m', 'http.server', '8854', '--bind', '127.0.0.1', '--directory', str(ROOT)],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
try:
    with tempfile.TemporaryDirectory() as tmp, sync_playwright() as p:
        tmp = Path(tmp)
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={'width': 1600, 'height': 1000}, accept_downloads=True)
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto('http://127.0.0.1:8854/slide-editor.html')
        expect(page.locator('.slide-item')).to_have_count(6)

        # 1) 열기 창: 버튼 2개 + 끌어놓기 칸
        page.locator('#open').click()
        expect(page.locator('.open-choices button')).to_have_count(2)
        expect(page.locator('#open-drop')).to_be_visible()
        page.locator('#open-close').click()

        # 2) 내장 표본 폴더 가져오기
        d = tmp / 'plain'; (d / 'img').mkdir(parents=True)
        (d / 'img/v.webm').write_bytes(WEBM); (d / 'img/p.png').write_bytes(PNG)
        (d / 'deck.html').write_text(PLAIN, encoding='utf-8')
        open_folder(page, d, 'deck.html')
        expect(page.locator('#import-apply')).to_be_enabled()
        page.locator('#import-apply').click()
        expect(page.locator('.slide-item')).to_have_count(2)
        frame = page.frames[1]
        expect(frame.locator('.slide.on h2')).to_have_text('Plain one')
        note = frame.locator('.slide.on aside.notes.speaker-note')
        assert note.count() == 1 and not note.is_visible()
        assert page.locator('#speaker-notes').input_value() == 'first para\nsecond para'
        assert frame.locator('.slide.on video').get_attribute('src').startswith('data:video/webm;base64,')
        assert frame.locator('.slide.on video').get_attribute('poster').startswith('data:image/png;base64,')
        assert frame.locator('#pos').count() == 0, '편집 중에는 원래 덱의 틀·스크립트를 실행하지 않아야 함'
        # 메모 수정: 바뀐 줄만 새 문단, 그대로인 줄은 원래 서식 유지
        page.locator('.notes-panel summary').click()
        page.locator('#speaker-notes').fill('first para\nsecond edited')
        page.locator('#speaker-notes').blur()
        assert note.evaluate('n=>[...n.children].map(p=>p.className+":"+p.textContent).join("|")') == 'tip:first para|:second edited'

        # 3) HTML 저장: 원래 스크립트·틀 복원, 편집도구 발표 버튼 없음
        html = export(page, tmp / 'plain-out.html')
        assert 'id="present-controls"' not in html and 'document.getElementById("pos")' in html and '<div id="pos">' in html
        assert 'slide-studio:slides' not in html
        show = ctx.new_page(); show.goto((tmp / 'plain-out.html').as_uri())
        expect(show.locator('#pos')).to_have_text('1/2'); show.keyboard.press('ArrowRight'); expect(show.locator('#pos')).to_have_text('2/2')
        expect(show.locator('.slide.on h2')).to_have_text('Plain two')
        assert show.locator('aside.notes p.tip').text_content() == 'first para'
        show.close()

        # 4) 편집 파일(.slides.json) 저장·다시 열기에도 원래 틀이 남는지
        with page.expect_download() as dl:
            page.evaluate('window.showSaveFilePicker=undefined'); page.locator('#save-project').click()
        saved = tmp / 'plain.slides.json'; dl.value.save_as(str(saved))
        assert 'slide-studio:slides' in saved.read_text(encoding='utf-8')
        page.locator('#project-file').set_input_files(str(saved))
        page.locator('#confirm-yes').click()
        assert 'document.getElementById("pos")' in export(page, tmp / 'plain-out2.html')

        # 5) 끌어놓기: 파일 하나 → 바로 가져오기 창, 폴더 → 하위 경로 유지한 폴더 가져오기
        single = PLAIN.replace('<video src="img/v.webm" poster="img/p.png"></video>', '')
        page.evaluate("""html=>{const dt=new DataTransfer();dt.items.add(new File([html],'one.html',{type:'text/html'}));
          document.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));}""", single)
        expect(page.locator('#open-dialog')).to_be_visible(); expect(page.locator('#import-apply')).to_be_enabled()
        page.locator('#open-close').click()
        page.evaluate("""([html,png])=>{
          const bytes=Uint8Array.from(atob(png),c=>c.charCodeAt(0));
          const file=(name,data,type)=>({isFile:true,isDirectory:false,name,file:ok=>ok(new File([data],name,{type}))});
          const dir=(name,kids)=>({isFile:false,isDirectory:true,name,createReader(){let done=false;return{readEntries(ok){ok(done?[]:(done=true,kids))}}}});
          const root=dir('deck',[file('deck.html',html.replace('<video src="img/v.webm" poster="img/p.png"></video>','<img src="img/p.png">'),'text/html'),dir('img',[file('p.png',bytes,'image/png')])]);
          const e=new Event('drop',{bubbles:true,cancelable:true});
          Object.defineProperty(e,'dataTransfer',{value:{types:['Files'],files:[],items:[{webkitGetAsEntry:()=>root}]}});
          document.dispatchEvent(e);}""", [PLAIN, base64.b64encode(PNG).decode()])
        expect(page.locator('#open-dialog')).to_be_visible(); expect(page.locator('#import-apply')).to_be_enabled()
        expect(page.locator('#import-deck')).to_have_value('deck/deck.html')
        page.locator('#open-close').click()

        # 6) 장표 구분이 없는 일반 페이지는 계속 거절
        bad = tmp / 'bad'; bad.mkdir()
        (bad / 'page.html').write_text('<!doctype html><style>p{}</style><p>hi</p>', encoding='utf-8')
        open_folder(page, bad, 'page.html')
        expect(page.locator('#import-report')).to_contain_text('section class="slide"')
        expect(page.locator('#import-apply')).to_be_disabled()
        page.locator('#open-close').click()
        print('PASS: 열기 버튼 2개·끌어놓기(파일·폴더), 노트 유지·수정, 영상 포함, 원래 스크립트로 HTML 저장, 편집 파일 왕복, 일반 페이지 거절')

        # 7) 인자로 받은 실제 덱
        if len(sys.argv) >= 3:
            folder, name = Path(sys.argv[1]), sys.argv[2]
            shots = Path(sys.argv[3]) if len(sys.argv) > 3 else None
            want = len(re.findall(r'<section class="slide[ "]', (folder / name).read_text(encoding='utf-8')))
            open_folder(page, folder, name)
            expect(page.locator('#import-apply')).to_be_enabled(timeout=30000)
            print('가져오기 안내:', page.locator('#import-report').text_content())
            page.locator('#import-apply').click()
            expect(page.locator('.slide-item')).to_have_count(want)
            frame = page.frames[1]
            frame.wait_for_function('document.fonts.ready.then(()=>true)')
            noted = frame.locator('.slide .speaker-note').count()
            videos = frame.locator('.slide video[src^="data:video"]').count()
            print(f'장 {want} · 노트 {noted}장 · 영상 {videos}개 · 글꼴', frame.evaluate('[...document.fonts].filter(f=>f.status=="loaded").map(f=>f.family).join(",")'))
            if shots:
                shots.mkdir(parents=True, exist_ok=True)
                for i in range(want):
                    page.locator('.slide-item').nth(i).click(); page.wait_for_timeout(2000)
                    page.locator('#deck-frame').screenshot(path=str(shots / f'ed{i + 1}.png'))
            out = tmp / 'real-out.html'; export(page, out)
            show = ctx.new_page(); show.on('pageerror', lambda e: errors.append('저장본: ' + str(e)))
            # 저장본은 원래 덱의 스크립트로 움직여야 한다: 현재 장 하나 → 오른쪽 화살표로 다음 장
            show.goto(out.as_uri()); show.wait_for_timeout(800)
            slides = show.locator('section.slide')
            assert slides.count() == want, (slides.count(), want)
            first = show.evaluate("[...document.querySelectorAll('section.slide')].findIndex(s=>s.classList.contains('on'))")
            assert first >= 0 and show.locator('.slide.on').count() == 1, '저장본에서 현재 장이 하나여야 함'
            show.keyboard.press('ArrowRight'); show.wait_for_timeout(300)
            after = show.evaluate("[...document.querySelectorAll('section.slide')].findIndex(s=>s.classList.contains('on'))")
            assert after == first + 1, ('→ 키로 다음 장이 열려야 함', first, after)
            assert 'id="present-controls"' not in out.read_text(encoding='utf-8'), '스크립트 있는 덱은 원래 틀로 저장'
            print(f'저장본: {want}장, 원래 스크립트로 {first + 1}장 → {after + 1}장 넘김 확인')
            if shots:
                show.screenshot(path=str(shots / 'saved.png'))
        assert not errors, errors
        browser.close()
finally:
    server.terminate(); server.wait(timeout=5)
print('PASS')
