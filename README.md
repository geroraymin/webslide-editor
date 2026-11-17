# 웹슬라이드 편집도구

HTML로 만든 발표 자료(웹슬라이드)를 브라우저에서 파워포인트처럼 고치는 도구입니다.
설치 없이 HTML·CSS·JS 파일만으로 동작하고, 서버나 계정이 필요 없습니다. 고친 내용은 내 컴퓨터 안에만 저장됩니다.

## 실행

정적 파일 서버로 이 폴더를 열면 됩니다. 브라우저 보안 때문에 `index.html`을 더블클릭해서 여는 방식(`file://`)은 동작하지 않습니다.

```bash
python -m http.server 8000
# 브라우저에서 http://127.0.0.1:8000/ 열기
```

설치 없이 바로 쓰기: **https://geroraymin.github.io/webslide-editor/**

처음 열면 기본 6장 자료가 나옵니다.

## 열 수 있는 자료

| 종류 | 여는 방법 |
|---|---|
| 이 도구에서 저장한 편집 파일 (`.slides.json`) | 「파일 선택」 또는 끌어놓기 |
| 스타일·이미지가 한 파일에 들어 있는 HTML | 「파일 선택」 또는 끌어놓기 |
| HTML과 이미지·글꼴·영상이 따로 있는 덱 | 「폴더 선택」 또는 폴더째 끌어놓기 |

편집 화면 어디에 파일이나 폴더를 끌어다 놓아도 열립니다. 예시 덱은 `examples/sample-deck.html`입니다. `examples` 폴더를 끌어다 놓아 보세요.

### 덱 형식

- 장표마다 `<section class="slide">`로 나뉘어 있으면 됩니다. 장표 안에 장표를 넣으면 안 됩니다.
- 이미지·글꼴·영상(webm·mp4)은 덱 폴더 안의 파일이어야 합니다. 외부 주소의 이미지·글꼴은 받지 않습니다.
- 발표자 노트는 장표 안의 `aside.notes` 또는 `.speaker-note`로 둡니다. 원래 모양을 유지하고, 오른쪽 아래 메모 칸에서 고칠 수 있습니다.
- 덱의 스크립트는 **편집하는 동안 실행하지 않습니다.** 스크립트가 그리는 글자(쪽 번호 등)는 편집 화면에 나오지 않으니 HTML에 직접 써 두세요.
- 덱에 스크립트가 있으면, 「HTML 저장」과 「발표」 때 원래 덱의 틀과 스크립트를 다시 붙입니다. 그래서 고친 뒤에도 덱 고유의 넘기기·노트 창·애니메이션이 그대로 동작합니다. 스크립트가 없는 덱은 이 도구의 기본 발표 화면을 씁니다.

## 할 수 있는 것

- **선택·이동**: 클릭, Shift+클릭, Ctrl+A, 빈 공간 드래그, 방향키
- **글**: 더블클릭해서 수정, 줄바꿈 유지, 글자 크기·색·굵게·정렬, 여러 글 함께 크기 조절
- **배치**: 크기·위치 숫자 입력, 정렬·같은 간격, 자동 맞춤 안내선, 그룹(Ctrl+G), 잠금·숨김, 맨 앞·앞으로·뒤로·맨 뒤로(Ctrl+] / Ctrl+[)
- **표**: 삽입, 행·열 추가와 삭제, 경계선 드래그로 너비·높이 조절, 셀 글자 따로 이동
- **이미지·영상**: 삽입·교체, 원본을 남긴 자르기, YouTube 링크, 선·도형 색과 두께, 도형 채우기 없음(선만 남겨 틀처럼 쓰기). 채우기 없는 틀은 테두리 근처를 눌러야 잡히고, 안쪽에서 끌면 틀과 안의 글자를 함께 범위 선택
- **슬라이드**: 추가·복제·삭제·순서 변경, 장표·요소 복사와 붙여넣기(Ctrl+C/V, Ctrl+Shift+C/V), 발표자 메모
- **저장**: 브라우저 자동저장, 편집 파일(`.slides.json`, 처음 한 번 위치를 고르면 다음부터 같은 파일에 이어 저장), 발표용 HTML, 실행 취소·다시 실행
- **발표**: 발표 창, 전체화면, 메모 보기, 브라우저 인쇄·PDF

## 한계

- 파일은 64MB, 장표는 160장까지입니다.
- 자동저장은 같은 브라우저·같은 주소에만 남습니다. 오래 보관할 작업은 「편집 파일 저장」으로 파일을 받아 두세요.
- 가져온 원본 HTML은 덮어쓰지 않습니다. 편집 파일은 처음 저장한 파일에 이어서 저장하고, 저장 버튼에 그 파일 이름이 보입니다. 같은 파일에 바로 쓰는 기능은 Chrome·Edge에서 동작하고, 지원하지 않는 브라우저는 내려받기로 저장합니다.
- 병합된 셀이 있는 표는 경계선 드래그를 지원하지 않습니다.
- SVG는 그림 전체를 한 덩어리로 편집합니다. 안쪽 도형을 하나씩 고칠 수는 없습니다.
- 회전·뒤집기, 서식 복사, 찾기·바꾸기는 아직 없습니다.

## 검사

`tests/` 폴더의 검사는 Python과 Playwright(Chromium)로 실제 브라우저를 띄워 확인합니다.

```bash
pip install playwright
python -m playwright install chromium
python tests/check_studio.py
python tests/check_foreign_deck.py examples sample-deck.html
```

검사 화면은 `tests/_out/`에 저장됩니다.

## 글꼴

기본 글꼴은 [Pretendard](https://github.com/orioncactus/pretendard)입니다. SIL Open Font License 1.1을 따르며 라이선스 전문은 `assets/fonts/Pretendard-LICENSE.txt`에 있습니다.

## 라이선스

MIT 라이선스입니다. 누구나 쓰고, 고치고, 다시 배포할 수 있습니다. 전문은 `LICENSE`에 있습니다. 글꼴은 위의 OFL을 따릅니다.

---

## English summary

A browser-based editor for HTML slide decks. Click to select, double-click to edit text, drag to move or resize, then save as an editable `.slides.json` or a presentation-ready HTML file. It runs from static files with no build step and no server-side storage.

- Open a deck by file, by folder, or by drag and drop. Any deck whose slides are `<section class="slide">` elements works.
- The deck's own scripts are not executed while editing. When you save to HTML, the original page shell and scripts are put back, so the deck's navigation, speaker notes and animations keep working.
- Try it online: https://geroraymin.github.io/webslide-editor/
- MIT License. The bundled Pretendard font is under the SIL OFL 1.1.
- Serve the folder with any static server (for example `python -m http.server`). Opening via `file://` does not work.
