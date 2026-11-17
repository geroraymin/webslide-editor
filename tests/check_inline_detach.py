"""글줄 안 강조 글자(b 등)를 따로 옮긴 편집 파일에서 뒤 글자가 다음 줄로 밀리지 않는지 확인한다 (r22).
r21까지는 옮긴 강조 글자 자리에 block 자리 표시를 넣어 줄이 끊겼고, 뒤 글자가 아래 줄 객체 밑에 깔려 클릭되지 않았다.
(사례: 글줄 안 강조 글자를 따로 옮길 때)
사용: python tools/check_inline_detach.py
"""
from pathlib import Path
import json, subprocess, sys, tempfile
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
PH = ('<span class="ed-layout-placeholder" aria-hidden="true" data-ed-placeholder-for="e-b1" style="display: block; box-sizing: border-box; '
      'width: 124px; height: 38px; min-width: 124px; min-height: 38px; margin: 0px; flex: 0 0 124px; visibility: hidden; pointer-events: none;"></span>')
SLIDE = ('<section class="slide"><div class="ki" style="position:absolute;left:96px;top:300px;right:96px;display:flex;gap:28px;padding:20px 0;border-bottom:1px solid #ddd">'
         '<span style="font-size:26px">예산</span><p style="font-size:32px;width: 578px; height: 44.8px;">약 ' + PH +
         '<b data-ed-id="e-b1" data-ed-detached-object="true" style="box-sizing: border-box; width: 141px; height: 38px; position: absolute; inset: 15.7px auto auto 213.7px; margin: 0px; color:#2350F5">400만 원</b>'
         ' · AI 계정 · 강사 · 서버 · 후속 지원</p></div>'
         '<div class="ki" style="position:absolute;left:96px;top:372px;right:96px;display:flex;gap:28px;padding:20px 0;background:#fff">'
         '<span style="font-size:26px">내용</span><p style="font-size:32px">AI 활용 교육 · 팀별 업무 툴 제작</p></div></section>')
TAIL = '''()=>{const p=[...document.querySelectorAll('.slide.on p')].find(x=>x.textContent.includes('후속 지원'));
  const n=[...p.childNodes].filter(x=>x.nodeType===3&&x.textContent.includes('후속')).pop();
  const r=document.createRange();r.selectNodeContents(n);const b=r.getBoundingClientRect(),pr=p.getBoundingClientRect();
  const hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);
  return {sameLine:b.bottom<=pr.bottom+1,hitSelf:hit===p||p.contains(hit),ph:[...p.querySelectorAll('.ed-layout-placeholder')].map(x=>x.style.display)};}'''
server = subprocess.Popen([sys.executable, '-m', 'http.server', '8855', '--bind', '127.0.0.1', '--directory', str(ROOT)],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
ok = True
def check(label, cond):
    global ok; ok &= bool(cond); print(('PASS ' if cond else 'FAIL ') + label)
try:
    with tempfile.TemporaryDirectory() as tmp, sync_playwright() as p:
        f = Path(tmp) / 'old.slides.json'
        f.write_text(json.dumps({'format': 'slide-studio', 'version': 1, 'name': 't', 'slides': [SLIDE]}, ensure_ascii=False), encoding='utf-8')
        b = p.chromium.launch(); page = b.new_page(viewport={'width': 1600, 'height': 1000})
        page.goto('http://127.0.0.1:8855/slide-editor.html'); expect(page.locator('.slide-item')).to_have_count(6)
        page.locator('#project-file').set_input_files(str(f)); page.locator('#confirm-yes').click(); page.wait_for_timeout(800)
        fr = page.frames[1]; r = fr.evaluate(TAIL)
        check(f'옛 저장본: 뒤 글자 같은 줄 {r}', r['sameLine'])
        check('옛 저장본: 뒤 글자 클릭으로 잡힘', r['hitSelf'])
        check('자리 표시가 글줄 안(inline-block)으로 바뀜', r['ph'] and all(d == 'inline-block' for d in r['ph']))
        page.evaluate("window.showSaveFilePicker=undefined")
        with page.expect_download() as dl:
            page.locator('#save-project').click()
        saved = json.loads(Path(dl.value.path()).read_text(encoding='utf-8'))
        check('다시 저장해도 block 자리 표시가 남지 않음', 'display: block' not in saved['slides'][0].split('ed-layout-placeholder', 1)[1][:200])
        b.close()
finally:
    server.terminate(); server.wait(timeout=5)
print('ALL PASS' if ok else 'SOME FAIL'); sys.exit(0 if ok else 1)
