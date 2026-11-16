"""장표 안의 보이는 글자가 모두 선택 가능한 객체에 속하는지 확인한다.
사용: python tests/check_text_coverage.py <덱 폴더> <HTML 이름>
글자 조각마다 data-ed-id가 붙은 조상(장표 자신 제외)이 있어야 한다. 없으면 장 번호와 글자를 출력하고 실패한다."""
from pathlib import Path
import subprocess, sys
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
folder, name = Path(sys.argv[1]), sys.argv[2]
FIND = '''()=>{const s=document.querySelector('.slide.on'),out=[];
  const w=document.createTreeWalker(s,NodeFilter.SHOW_TEXT);let n;
  while((n=w.nextNode())){const t=n.textContent.trim();if(!t)continue;const p=n.parentElement;
    if(p.closest('.speaker-note,svg,script,style,.ed-decoration'))continue;
    if(!p.getClientRects().length||getComputedStyle(p).visibility==='hidden')continue;
    const owner=p.closest('[data-ed-id]');if(!owner||owner===s)out.push(t.slice(0,30));}
  return out;}'''
server = subprocess.Popen([sys.executable, '-m', 'http.server', '8866', '--bind', '127.0.0.1', '--directory', str(ROOT)],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(); page = browser.new_page(viewport={'width': 1600, 'height': 1000})
        page.goto('http://127.0.0.1:8866/slide-editor.html'); expect(page.locator('.slide-item')).to_have_count(6)
        page.locator('#open').click()
        with page.expect_file_chooser() as ch:
            page.locator('#open-folder-choice').click()
        ch.value.set_files(str(folder))
        vals = page.locator('#import-deck option').evaluate_all('o=>o.map(x=>x.value)')
        page.locator('#import-deck').select_option(next(v for v in vals if v.endswith(name)))
        expect(page.locator('#import-apply')).to_be_enabled(timeout=30000); page.locator('#import-apply').click()
        frame = page.frames[1]; total = 0
        for i in range(page.locator('.slide-item').count()):
            page.locator('.slide-item').nth(i).click(); page.wait_for_timeout(300)
            miss = frame.evaluate(FIND)
            for t in miss:
                print(f'{i + 1}장 안 잡힘: {t}')
            total += len(miss)
        browser.close()
finally:
    server.terminate(); server.wait(timeout=5)
print('안 잡히는 글자 조각:', total)
sys.exit(1 if total else 0)
