/* 재사용 계약: .slide 장표와 .speaker-note 메모를 가진 로컬 덱. 다른 덱의 스크립트는 편집 중 실행하지 않고 HTML 저장 때만 다시 붙인다. 상세는 README.md. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const frame = $('deck-frame');
  const requestedDeck = new URLSearchParams(location.search).get('deck') || 'starter-deck.html';
  const SOURCE_DECK = /^[a-zA-Z0-9_-]+\.html$/.test(requestedDeck) ? requestedDeck : 'starter-deck.html';
  const STORAGE_KEY = 'webslide-studio:v1:' + SOURCE_DECK;
  const BASE = new URL('.', location.href).href;
  let doc, slides = [], current = 0, selected = null, selectedGroup = [], cell = null, scale = 1, uid = 0;
  let deckShell = '', deckHeadScripts = '';
  let css = '', defaultCss = '', bodyClass = 'v4 v5', past = [], future = [], inputSnapshot = null, saveTimer, toastTimer;
  let importFiles = [], pendingImport = null, importGeneration = 0;
  let dragging = null, marquee = null, replaceTarget = null, savedDraft = null, fileHandle = null, slideClipboard = '';
  let railDragIndex = -1, railDropIndex = -1, tableDrag = null;
  // shortcut: 요소 클립보드는 현재 탭에서 유지. 다른 탭·앱과 교환할 때 시스템 클립보드 형식을 추가한다.
  let elementClipboard=[],clipboardKind='slide',pasteCount=0;
  let frameReady = false, draftSaved = false, fileSavedCurrent = false, exportBusy = false, storageWarned = false, suppressCanvasClick = false;
  const MAX_FILE = 64 * 1024 * 1024;
  const PRESENTATION_PROPS='display box-sizing width height min-width min-height max-width max-height position left top right bottom margin padding border-top border-right border-bottom border-left border-radius border-collapse border-spacing table-layout box-shadow background-color background-image color font-family font-size font-weight font-style line-height letter-spacing text-align text-decoration text-transform text-indent white-space word-break overflow-wrap vertical-align list-style flex flex-direction flex-wrap justify-content align-items align-content align-self gap grid-template-columns grid-template-rows grid-column grid-row object-fit object-position opacity visibility overflow transform transform-origin scale translate z-index fill stroke stroke-width'.split(' ');
  const OBJECT_CSS='[data-ed-hidden="true"],[data-ed-hidden="true"] *{visibility:hidden!important;pointer-events:none!important}[data-ed-before]::before,[data-ed-after]::after,.ed-decoration::before,.ed-decoration::after{content:none!important}';
  const MARKER_CSS = `.agenda li::before,.outcomes-slide .plain-list>li::before,.sequence-slide .plain-list>li::before,.list-slide .plain-list>li::before,.check-slide .plain-list>li::before{content:none!important}.agenda li>.ed-generated-marker{font-size:27px;color:var(--muted);font-weight:500;width:54px;flex:none}.outcomes-slide .plain-list>li>.ed-generated-marker{display:block;font-size:78px;line-height:1.25;font-weight:500;letter-spacing:-.05em;margin-bottom:54px;color:#597267}.outcomes-slide .plain-list>li:last-child>.ed-generated-marker{color:var(--ink)}.sequence-slide .plain-list>li>.ed-generated-marker,.list-slide .plain-list>li>.ed-generated-marker,.check-slide .plain-list>li>.ed-generated-marker{display:flex;align-items:center;justify-content:center;width:70px;min-height:64px;flex:none;color:var(--ink);background:var(--surface);border-radius:12px;font-size:27px}.check-slide .plain-list>li>.ed-generated-marker{background:#e4f1d1;font-size:32px}`;
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 3300); }
  function title(slide) { return slide.querySelector('h2')?.textContent.trim() || '빈 슬라이드'; }
  function active() { return slides[current]; }
  function rgbHex(value) { if(value==='transparent'||/rgba\([^)]*,\s*0\s*\)/.test(value))return '#fbfcfa'; const m = value.match(/\d+/g); return m && m.length >= 3 ? '#' + m.slice(0,3).map(n => Number(n).toString(16).padStart(2,'0')).join('') : '#16312b'; }
  // 메모: 문단(<p>)으로 나뉜 노트는 줄바꿈으로 보여주고, 고치면 줄마다 문단으로 되돌린다. 같은 줄의 원래 서식(class·data)은 유지한다.
  function noteText(e) { if(!e)return ''; const ps=[...e.querySelectorAll(':scope>p')]; return ps.length?ps.map(p=>p.textContent).join('\n'):e.textContent; }
  function writeNote(e, value) {
    if(e.tagName==='P'&&!e.querySelector('p')){e.textContent=value;return;}
    const old=[...e.querySelectorAll(':scope>p')];
    e.replaceChildren(...value.split('\n').filter(t=>t.trim()).map(t=>{const same=old.find(p=>p.textContent===t);const p=same?same.cloneNode(true):doc.createElement('p');p.textContent=t;return p;}));
  }
  function cleanClone(slide) {
    const copy = slide.cloneNode(true);
    copy.querySelectorAll('[contenteditable]').forEach(e => e.removeAttribute('contenteditable'));
    copy.querySelectorAll('[data-editing]').forEach(e => e.removeAttribute('data-editing'));
    copy.classList.remove('on');
    return copy;
  }
  function snapshot() { return JSON.stringify({name:$('deck-name').value, slides:slides.map(s => cleanClone(s).outerHTML),design:{css,bodyClass,...(deckShell?{shell:deckShell,headScripts:deckHeadScripts}:{})}}); }
  function applyDesign(design) {
    css=design?.css ?? defaultCss; bodyClass=design?.bodyClass ?? 'v4 v5'; deckShell=design?.shell || ''; deckHeadScripts=design?.headScripts || '';
    if(doc){doc.getElementById('deck-design').textContent=css;doc.body.className=bodyClass;}
  }
  function beginInput() { if (!inputSnapshot) inputSnapshot = snapshot(); }
  function flushInput() {
    if (!inputSnapshot) return;
    const before = inputSnapshot; inputSnapshot = null;
    if (before !== snapshot()) { pushPast(before); future = []; changed(); updateRail(); updateLayers(); }
  }
  function mutate(fn) {
    flushInput();
    const before = snapshot(); fn();
    if (before !== snapshot()) { pushPast(before); future = []; changed(); }
    refresh();
  }
  function changed() {
    draftSaved = false; fileSavedCurrent = false; draftSeq++;
    $('save-status').textContent = '저장 중…';
    clearTimeout(saveTimer); saveTimer = setTimeout(saveDraft, 350);
    $('undo').disabled = past.length === 0; $('redo').disabled = future.length === 0;
  }
  function project() { return {format:'slide-studio', version:1, updatedAt:new Date().toISOString(), ...JSON.parse(snapshot())}; }
  function pushPast(state) {
    past.push(state);
    while (past.length > 1 && (past.length > 40 || past.reduce((n,s)=>n+s.length,0) > 16*1024*1024)) past.shift();
  }
  // 임시저장은 IndexedDB에 둔다. localStorage(약 5MB)는 영상·글꼴이 든 덱을 담지 못해 새로고침하면 작업이 사라졌다.
  const idb=(()=>{let opened;
    function open(){return opened||(opened=new Promise((ok,no)=>{const r=indexedDB.open('webslide-studio',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);}));}
    async function run(mode,fn){const db=await open();return new Promise((ok,no)=>{const tx=db.transaction('kv',mode),req=fn(tx.objectStore('kv'));tx.oncomplete=()=>ok(req.result);tx.onerror=tx.onabort=()=>no(tx.error);});}
    return {get:k=>run('readonly',s=>s.get(k)),set:(k,v)=>run('readwrite',s=>s.put(v,k)),del:k=>run('readwrite',s=>s.delete(k))};
  })();
  const DRAFT_KEY=STORAGE_KEY+':draft', HANDLE_KEY=STORAGE_KEY+':file';
  let draftSeq=0;
  function savedLabel(){return fileSavedCurrent&&fileHandle?'파일 저장 완료 · '+fileHandle.name:'이 브라우저에 저장됨';}
  // 저장한 파일을 기억해 두면 다음 저장과 새로고침 뒤에도 같은 파일에 덮어쓴다.
  // 버튼 이름으로 지금 누르면 어떻게 되는지 보여준다: 위치를 물을지, 정해진 파일에 덮어쓸지.
  function updateSaveButton(){const b=$('save-project');if(!b)return;const n=fileHandle?.name||'',short=n.replace(/\.slides\.json$|\.json$|\.slides$/i,'');b.textContent=n?'저장 · '+(short.length>12?short.slice(0,11)+'…':short):'편집 파일 저장…';b.title=n?`‘${n}’에 덮어씁니다 · Ctrl+S`:'저장할 위치를 고릅니다 · Ctrl+S';}
  function setHandle(handle){fileHandle=handle;updateSaveButton();(handle?idb.set(HANDLE_KEY,handle):idb.del(HANDLE_KEY)).catch(()=>{});}
  function draftFailed(){ draftSaved = false; $('save-status').textContent = fileSavedCurrent?savedLabel()+' · 임시저장 실패':'임시저장 실패 · 파일로 저장 필요'; if(!storageWarned&&!fileSavedCurrent){toast('브라우저 임시저장에 실패했습니다. 편집 파일 저장으로 보관하세요.');storageWarned=true;} }
  function saveDraft() {
    if (!frameReady) return;
    const text=JSON.stringify(project()), seq=++draftSeq;
    idb.set(DRAFT_KEY,text).then(()=>{
      if(seq!==draftSeq)return;
      draftSaved = true; storageWarned = false; $('save-status').textContent = savedLabel();
      try{localStorage.removeItem(STORAGE_KEY);}catch{}
    },()=>{
      if(seq!==draftSeq)return;
      try { localStorage.setItem(STORAGE_KEY, text); draftSaved = true; storageWarned = false; $('save-status').textContent = savedLabel(); }
      catch { draftFailed(); }
    });
  }
  function validateProject(data) {
    if (!data || data.format !== 'slide-studio' || data.version !== 1 || !Array.isArray(data.slides) || data.slides.length < 1 || data.slides.length > 160 || data.slides.some(s => typeof s !== 'string' || s.length > MAX_FILE) || typeof data.name !== 'string' || data.name.length > 200) throw Error('이 편집실에서 저장한 편집 파일을 선택해주세요.');
    if(data.design)data.design=SlideImport.validateDesign(data.design);
    return data;
  }
  function sanitize(markup) {
    const parsed = new DOMParser().parseFromString(markup, 'text/html');
    const root = parsed.body.firstElementChild;
    if (root?.tagName !== 'SECTION' || !root.classList.contains('slide') || parsed.body.children.length !== 1) throw Error('슬라이드 형식이 올바르지 않습니다.');
    const allowed = new Set('SECTION HEADER ARTICLE DIV SPAN H1 H2 H3 H4 P OL UL LI TABLE THEAD TBODY TFOOT TR TH TD COLGROUP COL FIGURE FIGCAPTION IMG BLOCKQUOTE A BUTTON DETAILS SUMMARY LABEL INPUT BR HR STRONG B EM I U SMALL ASIDE VIDEO SOURCE AUDIO SVG IMAGE G PATH LINE POLYLINE POLYGON RECT CIRCLE ELLIPSE TEXT TSPAN'.split(' '));
    [root,...root.querySelectorAll('*')].forEach(e => {
      if (!allowed.has(e.tagName.toUpperCase())) { e.remove(); return; }
      [...e.attributes].forEach(a => {
        const name = a.name.toLowerCase();
        if (/^on/.test(name) || ['srcdoc','srcset','contenteditable','autofocus','formaction','form','is','id','xml:base'].includes(name)) e.removeAttribute(a.name);
        if (['href','xlink:href','src','poster','data-src'].includes(name)) {
          const value = a.value.trim();
          const safeData = /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(value) || (name === 'src' && /^(VIDEO|SOURCE)$/.test(e.tagName.toUpperCase()) && /^data:video\/(webm|mp4);base64,[a-z0-9+/=\s]+$/i.test(value));
          let safe = safeData;
          if (!value.startsWith('data:')) { try { safe = ['http:','https:'].includes(new URL(value, BASE).protocol); } catch {} }
          if (!safe) e.removeAttribute(a.name);
        }
        if (name === 'style' && /url\s*\(|expression\s*\(|@import|javascript:|behavior\s*:/i.test(a.value)) e.removeAttribute('style');
      });
      if (e.tagName === 'A') { e.rel = 'noopener noreferrer'; }
    });
    return root.outerHTML;
  }
  function looksLikeBox(e) {
    if (!e.matches('div,article,section,figure,ol,ul,header,span')) return false;
    if (e.matches('#stage,.slide,.slide-heading,.speaker-note,.pageno,.media-status,.ed-layout-placeholder') || e.closest('.speaker-note')) return false;
    if(e.matches('span')&&e.textContent.trim())return false;
    if (e.classList.contains('ed-object') || e.classList.contains('blank-media') || e.classList.contains('video-stage')) return true;
    if (/(^|[-_])(box|card|panel|tile)([-_]|$)/i.test(e.className)) return true;
    const s=frame.contentWindow.getComputedStyle(e),bg=s.backgroundColor;
    const visibleBg=bg&&bg!=='transparent'&&!/rgba\([^)]*,\s*0\s*\)/.test(bg);
    const visibleBorder=['Top','Right','Bottom','Left'].some(side=>parseFloat(s['border'+side+'Width'])>0&&s['border'+side+'Style']!=='none');
    return (visibleBg||visibleBorder||s.boxShadow!=='none')&&e.offsetWidth>0&&e.offsetHeight>0;
  }
  function candidateElements(root=active()) {
    if (!root) return [];
    const textSelector='h1,h2,h3,h4,h5,h6,p,span,small,strong,b,em,i,u,a,button,li,dt,dd,figcaption,blockquote';
    // 글자를 직접 가진 요소. 강조 글자(em·b 등)가 섞인 줄도 줄 전체를 하나의 글자 객체로 잡는다.
    const inline=/^(EM|B|STRONG|I|U|S|SMALL|SPAN|A|BR|SUP|SUB|MARK|CODE)$/;
    const directText=[...root.querySelectorAll('*')].filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&[...e.children].every(c=>inline.test(c.tagName)));
    const text=[...new Set([...root.querySelectorAll(textSelector),...directText])].filter(e=>e.getClientRects().length&&!e.closest('.ed-layout-placeholder'));
    const base=[...text,...root.querySelectorAll('table,img,svg,hr,.ed-decoration,.blank-media,.ed-object,.video-stage,.ed-cell-text')];
    const boxes=[...root.querySelectorAll('div,article,section,figure,ol,ul,header,span')].filter(looksLikeBox);
    return [...new Set([...base,...boxes])];
  }
  function stamp() {
    doc.querySelectorAll('th,td').forEach(c=>{
      if(c.querySelector(':scope > .ed-cell-text')||!c.textContent.trim()||c.querySelector('table'))return;
      const text=doc.createElement('div');text.className='ed-cell-text';text.style.display='block';
      text.append(...c.childNodes);c.append(text);
    });
    const used = new Set();
    doc.querySelectorAll('[data-ed-id]').forEach(e => {
      if (used.has(e.dataset.edId)) delete e.dataset.edId;
      else used.add(e.dataset.edId);
    });
    slides.flatMap(s=>candidateElements(s)).forEach(e => {
      if (!e.dataset.edId) { do { uid++; } while(used.has('e'+uid)); e.dataset.edId = 'e'+uid; used.add(e.dataset.edId); }
    });
  }
  function materializeGeneratedText(root) {
    const groups=[
      ['.agenda li',i=>String(i+1).padStart(2,'0')],
      ['.outcomes-slide .plain-list>li',i=>String(i+1).padStart(2,'0')],
      ['.sequence-slide .plain-list>li,.list-slide .plain-list>li',i=>String(i+1).padStart(2,'0')],
      ['.check-slide .plain-list>li',()=> '✓']
    ];
    groups.forEach(([selector,label])=>root.querySelectorAll(selector).forEach((li,i)=>{
      if(li.querySelector(':scope > .ed-generated-marker'))return;
      const marker=doc.createElement('span');marker.className='ed-generated-marker';marker.textContent=label(i);li.prepend(marker);
    }));
  }
  function freeCellText(table) {
    const cells=[...table.querySelectorAll('th,td')].filter(c=>c.closest('table')===table);
    const pending=cells.map(c=>({c,text:c.querySelector(':scope > .ed-cell-text')})).filter(({text})=>text&&text.dataset.edCellFree!=='true');
    if(!pending.length||!table.offsetWidth||!table.offsetHeight)return;
    const bounds=rect(table),sx=bounds.w/table.offsetWidth,sy=bounds.h/table.offsetHeight;
    const rows=[...table.rows].map(row=>({row,h:rect(row).h/sy}));
    const widths=cells.map(c=>({c,w:rect(c).w/sx}));
    const boxes=pending.map(({text})=>{const s=frame.contentWindow.getComputedStyle(text);return {text,r:rect(text),width:s.width,height:text.style.height||'auto'};});
    if(table.dataset.edTableFree!=='true'||pending.some(({c})=>c.style.position!=='relative'||c.style.height!=='0px')){
      table.style.boxSizing='border-box';table.style.width=bounds.w/sx+'px';table.style.height='auto';table.style.tableLayout='fixed';
      widths.forEach(({c,w})=>{c.style.boxSizing='border-box';c.style.width=w+'px';c.style.height='0px';c.style.minHeight='0';c.style.position='relative';});
      rows.forEach(({row,h})=>row.style.height=h+'px');table.dataset.edTableFree='true';
    }
    boxes.forEach(({text,r,width,height})=>{
      Object.assign(text.style,{position:'absolute',left:'0px',top:'0px',right:'auto',bottom:'auto',width,height,margin:'0'});
      const zero=rect(text);text.style.left=(r.x-zero.x)/sx+'px';text.style.top=(r.y-zero.y)/sy+'px';text.dataset.edCellFree='true';
    });
  }
  function resizeTable(table,width,height) {
    const bounds=rect(table),sx=bounds.w/table.offsetWidth,sy=bounds.h/table.offsetHeight;
    const rows=[...table.rows].map(row=>({row,height:rect(row).h/sy,cells:[...row.cells].map(c=>({c,width:rect(c).w/sx}))}));
    const fx=width/table.offsetWidth,fy=height/table.offsetHeight;
    table.style.width=width+'px';table.style.height='auto';
    rows.forEach(({row,height,cells})=>{row.style.height=Math.max(20,height*fy)+'px';cells.forEach(({c,width})=>c.style.width=Math.max(30,width*fx)+'px');});
  }
  function materializeDecorations() {
    for(const e of [...active().querySelectorAll('*')]){
      if(e.closest('.ed-decoration,.speaker-note,svg')||e.matches('img,br,hr,input,video,source'))continue;
      for(const side of ['before','after']){
        if(e.hasAttribute('data-ed-'+side))continue;
        const style=frame.contentWindow.getComputedStyle(e,'::'+side),content=style.content;
        if(!content||['none','normal'].includes(content)||style.display==='none')continue;
        const picture=content.match(/^url\(["']?(.*?)["']?\)$/),span=doc.createElement(picture?'img':'span');span.className='ed-decoration';span.dataset.edDecoration=side;
        if(picture){span.src=picture[1];span.alt='사진';}
        else if(content.includes('counter(')){
          if(!e.matches('li'))continue;
          const n=[...e.parentElement.children].filter(c=>c.tagName==='LI').indexOf(e)+(Number(e.parentElement.getAttribute('start'))||1);
          span.textContent=content.includes('decimal-leading-zero')?String(n).padStart(2,'0'):String(n);
        }else span.textContent=[...content.matchAll(/"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/g)].map(m=>(m[1]??m[2]).replace(/\\([0-9a-f]{1,6})\s?|\\(.)/gi,(_,hex,char)=>hex?String.fromCodePoint(parseInt(hex,16)):char)).join('');
        if(!span.textContent&&!picture)span.classList.add('ed-line');
        for(const prop of PRESENTATION_PROPS)span.style.setProperty(prop,style.getPropertyValue(prop));
        if(side==='before')e.prepend(span);else e.append(span);
        e.setAttribute('data-ed-'+side,'true');
      }
    }
  }
  const backgroundLoading=new WeakSet();
  function materializeBackgroundPhotos() {
    for(const e of [active(),...active().querySelectorAll('*')]){
      if(backgroundLoading.has(e)||e.closest('svg,.speaker-note')||!e.getClientRects().length)continue;
      const s=frame.contentWindow.getComputedStyle(e),match=s.backgroundImage.match(/^url\(["']?(.*?)["']?\)$/);
      if(!match||!e.clientWidth||!e.clientHeight)continue;
      backgroundLoading.add(e);const loader=new frame.contentWindow.Image();
      loader.onload=()=>{
        backgroundLoading.delete(e);if(!e.isConnected)return;
        const w=e.clientWidth,h=e.clientHeight,nw=loader.naturalWidth,nh=loader.naturalHeight;if(!w||!h||!nw||!nh)return;
        const size=s.backgroundSize.split(/\s+/),pos=s.backgroundPosition.split(/\s+/);let iw=nw,ih=nh;
        const length=(value,extent)=>value.endsWith('%')?parseFloat(value)*extent/100:parseFloat(value);
        if(['cover','contain'].includes(size[0])){const factor=(size[0]==='cover'?Math.max:Math.min)(w/nw,h/nh);iw=nw*factor;ih=nh*factor;}
        else if(size[0]!=='auto'){iw=length(size[0],w);ih=size[1]&&size[1]!=='auto'?length(size[1],h):iw*nh/nw;}
        else if(size[1]&&size[1]!=='auto'){ih=length(size[1],h);iw=ih*nw/nh;}
        const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg'),image=doc.createElementNS('http://www.w3.org/2000/svg','image');
        svg.classList.add('ed-background-photo');svg.dataset.edId='e-'+crypto.randomUUID();svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.setAttribute('role','img');svg.setAttribute('aria-label','배경 사진');
        svg.style.cssText=`position:absolute;left:0;top:0;width:${w}px;height:${h}px;overflow:hidden;z-index:-1;pointer-events:auto;`;
        image.setAttribute('href',loader.src);image.setAttribute('width',iw);image.setAttribute('height',ih);image.setAttribute('x',length(pos[0]||'0%',w-iw));image.setAttribute('y',length(pos[1]||'0%',h-ih));
        svg.append(image);if(s.position==='static')e.style.position='relative';e.style.isolation='isolate';e.style.backgroundImage='none';e.prepend(svg);updateLayers();
      };
      loader.onerror=()=>backgroundLoading.delete(e);loader.src=match[1];
    }
  }
  // r22 이전에 글줄 안 강조 글자를 옮기면 자리 표시가 block으로 저장돼 뒤 글자가 다음 줄로 밀렸다. 열 때 글줄 안으로 되돌린다.
  function fixInlinePlaceholders(root) {
    root.querySelectorAll('.ed-layout-placeholder').forEach(p=>{
      if(p.style.display!=='block')return;
      const id=p.dataset.edPlaceholderFor,t=id&&root.querySelector(`[data-ed-id="${CSS.escape(id)}"]`);
      if(!t||!/^(B|I|EM|STRONG|SPAN|SMALL|A|U|S|MARK|CODE|SUP|SUB)$/.test(t.tagName)||!p.parentElement)return;
      if(/flex|grid/.test(frame.contentWindow.getComputedStyle(p.parentElement).display))return;
      p.style.display='inline-block';p.style.verticalAlign='middle';
    });
  }
  function render(markups) {
    selected = null; selectedGroup = []; cell = null;
    doc.querySelector('#stage').innerHTML = markups.join('');
    materializeGeneratedText(doc.querySelector('#stage'));
    fixInlinePlaceholders(doc.querySelector('#stage'));
    slides = [...doc.querySelectorAll('.slide')]; stamp();
    current = clamp(current,0,slides.length-1);
    slides.forEach((s,i) => { s.classList.toggle('on', i === current); s.setAttribute('aria-hidden',String(i !== current));
      s.setAttribute('aria-label',`${i+1}번 슬라이드`);const no = s.querySelector('.pageno'); if (no) no.textContent = `${String(i+1).padStart(2,'0')} / ${slides.length}`;
    });
    refresh();
  }
  function restore(raw) {
    const state = JSON.parse(raw); $('deck-name').value = state.name; applyDesign(state.design); render(state.slides); changed();
  }
  function undo() { flushInput(); if (!past.length) return; future.push(snapshot()); restore(past.pop()); }
  function redo() { flushInput(); if (!future.length) return; pushPast(snapshot()); restore(future.pop()); }
  function finishText() {
    doc?.querySelectorAll('[contenteditable]').forEach(e => { e.removeAttribute('contenteditable'); delete e.dataset.editing; });
    $('selection').classList.remove('editing');
    flushInput();
  }
  function go(index) {
    finishText(); selected = null; selectedGroup = []; cell = null; current = clamp(index,0,slides.length-1);
    slides.forEach((s,i) => { s.classList.toggle('on',i===current); s.setAttribute('aria-hidden',String(i!==current)); });
    refresh();
  }
  function unavailable(e) { return !!e?.closest('[data-ed-locked="true"],[data-ed-hidden="true"]')||!!e?.querySelector('[data-ed-locked="true"]'); }
  function targets(includeUnavailable=false) {
    return candidateElements().filter(e => {
      if(!includeUnavailable&&unavailable(e))return false;
      if (e.closest('.speaker-note,.media-status')) return false;
      if(e.closest('svg')&&e.tagName.toLowerCase()!=='svg')return false;
      if (e.closest('table') && e.tagName !== 'TABLE' && !e.classList.contains('ed-cell-text')&&!isPhoto(e)) return false;
      if (e.closest('.video-stage') && !e.classList.contains('video-stage')) return false;
      if (e.closest('.blank-media') && !e.classList.contains('blank-media')&&!isPhoto(e)) return false;
      if (e.parentElement?.closest('.ed-text') && !e.classList.contains('ed-cell-text')) return false;
      if (e.tagName === 'LI' && e.querySelector('p,h2,h3')) return false;
      return true;
    });
  }
  function targetOf(e) {
    if (!(e instanceof frame.contentWindow.Element)) return null;
    const all = targets();
    return all.find(t => t === e) || all.filter(t => t.contains(e)).sort((a,b) => a.contains(b)?1:-1)[0] || null;
  }
  function targetAt(event) {
    const pad=6/scale,line=targets().find(e=>{
      if(!e.matches('hr,.ed-line'))return false;
      const r=rect(e);return event.clientX>=r.x-pad&&event.clientX<=r.x+r.w+pad&&event.clientY>=r.y-pad&&event.clientY<=r.y+r.h+pad;
    });
    const hit=line||targetOf(event.target);
    // 채우기 없는 도형(틀)은 테두리 근처만 잡는다. 안쪽을 누르면 아래 글자를 잡거나 범위 선택을 시작한다 (r25 사용자 신고: 다 잡으려 끌면 틀만 잡힘).
    if(hit&&hollowFrame(hit)){const r=rect(hit),edge=10/scale;
      if(event.clientX>r.x+edge&&event.clientX<r.x+r.w-edge&&event.clientY>r.y+edge&&event.clientY<r.y+r.h-edge){
        const under=frame.contentDocument.elementsFromPoint(event.clientX,event.clientY).find(e=>e!==hit&&!hit.contains(e));
        const t=under&&targetOf(under);return t&&t!==hit&&!t.contains(hit)?t:null;}}
    return hit;
  }
  function hollowFrame(e){
    if(!e||!boxShape(e)||e.childElementCount)return false;
    const s=frame.contentWindow.getComputedStyle(e);
    return (s.backgroundColor==='transparent'||/rgba\(.*,\s*0\)$/.test(s.backgroundColor))&&s.backgroundImage==='none';
  }
  function selectionNodes() { return selectedGroup.filter(e=>e?.isConnected&&!unavailable(e)); }
  function groupMembers(e,includeUnavailable=false) {
    let root=e;
    for(let p=e;p&&p!==active();p=p.parentElement)if(p.dataset.edGroup)root=p;
    const id=root?.dataset.edGroup;
    const nodes=id?[...active().querySelectorAll('[data-ed-group]')].filter(n=>n.dataset.edGroup===id):e?[e]:[];
    return !includeUnavailable&&nodes.some(unavailable)?[]:nodes;
  }
  function groupId() {
    const nodes=selectionNodes(),id=nodes[0]?.dataset.edGroup;
    return id&&nodes.every(e=>e.dataset.edGroup===id)?id:null;
  }
  function selectionFrom(nodes,expandGroups=true,allowNested=false) {
    const unique=[...new Set(nodes.flatMap(e=>expandGroups?groupMembers(e):e?[e]:[]))].filter(e=>e?.isConnected&&!unavailable(e));
    return allowNested?unique:unique.filter(e=>!unique.some(parent=>parent!==e&&parent.contains(e)));
  }
  function groupSelection() {
    const nodes=selectionNodes();if(nodes.length<2||groupId())return;
    mutate(()=>{separateSelectedDescendants();const id=crypto.randomUUID();nodes.forEach(e=>e.dataset.edGroup=id);selectMany(nodes);});
  }
  function ungroupSelection() {
    const nodes=selectionNodes(),ids=new Set(nodes.map(e=>e.dataset.edGroup).filter(Boolean));if(!ids.size)return;
    mutate(()=>{const members=[...active().querySelectorAll('[data-ed-group]')].filter(e=>ids.has(e.dataset.edGroup));members.forEach(e=>delete e.dataset.edGroup);selectMany([...nodes,...members]);});
  }
  function isPhoto(e) { return !!e?.matches('img,svg.ed-crop-image,svg.ed-background-photo'); }
  // 선·채우기를 바꿀 수 있는 상자 도형 (추가한 도형 .ed-box와 덱 안의 카드·상자)
  function boxShape(e) { return !!e && !e.matches('svg,hr,.ed-line,table') && (e.classList.contains('ed-box') || kind(e)==='박스'); }
  function kind(e) { return e?.tagName === 'TABLE' ? '표' : isPhoto(e) ? '이미지' : e?.matches('svg') ? '도형' : e?.matches('hr,.ed-line') ? '선' : e?.classList.contains('video-stage') ? '영상' : e?.classList.contains('blank-media') ? '빈 영역' : e?.classList.contains('ed-box') ? '도형' : e?.matches('.ed-text,.ed-cell-text') ? '텍스트' : e && looksLikeBox(e) ? '박스' : '텍스트'; }
  function selectedTable() { const table=selected?.closest('table');return table&&!unavailable(table)?table:null; }
  function textTarget() { return selected?.tagName === 'TABLE' ? cell?.querySelector(':scope > .ed-cell-text')||cell : selected && kind(selected) === '텍스트' ? selected : null; }
  function textSelections() {
    return selectionNodes().flatMap(e=>e.tagName==='TABLE' ? cell&&e===selected?[cell]:[...e.querySelectorAll('td,th')] : kind(e)==='텍스트'?[e]:[]);
  }
  function textSize(e) { return parseFloat(frame.contentWindow.getComputedStyle(e).fontSize)*(Number(e.dataset.edScale)||1); }
  function rect(e) {
    const r=e.getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height};
  }
  function localSize(e,s=frame.contentWindow.getComputedStyle(e)) {
    const extra=s.boxSizing==='border-box'?0:1;
    const sum=props=>props.reduce((n,p)=>n+(parseFloat(s[p])||0),0);
    let w=parseFloat(s.width)+extra*sum(['paddingLeft','paddingRight','borderLeftWidth','borderRightWidth']),h=parseFloat(s.height)+extra*sum(['paddingTop','paddingBottom','borderTopWidth','borderBottomWidth']);
    if(!Number.isFinite(w)||!Number.isFinite(h)){
      let sx=1,sy=1;
      for(let p=e;p&&p!==doc.body;p=p.parentElement){
        const style=frame.contentWindow.getComputedStyle(p),parts=style.scale.split(/\s+/),factor=v=>v?.endsWith('%')?parseFloat(v)/100:parseFloat(v)||1;
        sx*=factor(parts[0]);sy*=factor(parts[1]||parts[0]);
        if(style.transform!=='none'){const m=new frame.contentWindow.DOMMatrixReadOnly(style.transform);sx*=Math.hypot(m.a,m.b);sy*=Math.hypot(m.c,m.d);}
      }
      const r=rect(e);if(!Number.isFinite(w))w=r.w/sx;if(!Number.isFinite(h))h=r.h/sy;
    }
    return {w,h};
  }
  function select(e,activeCell=null,expandGroups=true) {
    if (e !== selected || activeCell !== cell) finishText();
    selectedGroup=selectionFrom(e?[e]:[],expandGroups);selected=selectedGroup[0]||null;
    cell=selectedGroup.length===1?(activeCell||e?.closest('th,td')||null):null; updateProperties(); updateSelection(); updateLayers();
  }
  function selectMany(nodes,allowNested=false) {
    finishText();selectedGroup=selectionFrom(nodes,true,allowNested);selected=selectedGroup[0]||null;cell=null;
    updateProperties();updateSelection();updateLayers();
  }
  function toggleSelection(node) {
    if(!node)return;
    const members=selectionFrom([node]),nodes=selectionNodes();
    selectMany(members.every(e=>nodes.includes(e))?nodes.filter(e=>!members.includes(e)):[...nodes,...members],true);
  }
  function boundsOf(nodes=selectionNodes()) {
    const rs=nodes.map(rect);if(!rs.length)return null;
    const x=Math.min(...rs.map(r=>r.x)),y=Math.min(...rs.map(r=>r.y));
    return {x,y,w:Math.max(...rs.map(r=>r.x+r.w))-x,h:Math.max(...rs.map(r=>r.y+r.h))-y};
  }
  function selectionUnits() {
    const units=new Map();selectionNodes().forEach(e=>{const id=e.dataset.edGroup||e;if(!units.has(id))units.set(id,[]);units.get(id).push(e);});
    return [...units.values()].map(nodes=>({nodes,r:boundsOf(nodes)}));
  }
  function translateUnit(nodes,dx,dy) { nodes.forEach(e=>translate(e,(Number(e.dataset.edX)||0)+dx,(Number(e.dataset.edY)||0)+dy)); }
  function alignSelection(mode) {
    const units=selectionUnits(),bounds=boundsOf();if(units.length<2)return;
    mutate(()=>{separateSelectedDescendants();units.forEach(({nodes,r})=>{
      const dx=mode==='left'?bounds.x-r.x:mode==='center'?bounds.x+bounds.w/2-r.x-r.w/2:mode==='right'?bounds.x+bounds.w-r.x-r.w:0;
      const dy=mode==='top'?bounds.y-r.y:mode==='middle'?bounds.y+bounds.h/2-r.y-r.h/2:mode==='bottom'?bounds.y+bounds.h-r.y-r.h:0;
      translateUnit(nodes,dx,dy);
    });});
  }
  function distributeSelection(axis) {
    const units=selectionUnits();if(units.length<3)return;
    const size=axis==='x'?'w':'h';units.sort((a,b)=>a.r[axis]-b.r[axis]);
    const first=units[0].r[axis],last=units.at(-1).r;
    const gap=(last[axis]+last[size]-first-units.reduce((sum,u)=>sum+u.r[size],0))/(units.length-1);
    mutate(()=>{separateSelectedDescendants();let cursor=first;units.forEach(({nodes,r})=>{translateUnit(nodes,axis==='x'?cursor-r.x:0,axis==='y'?cursor-r.y:0);cursor+=r[size]+gap;});});
  }
  function resizeSelection(value,axis) {
    const nodes=selectionNodes(),r=boundsOf();if(!nodes.length||!r)return;
    const factor=clamp(value/r[axis],.01,Math.min((1600-r.x)/r.w,(900-r.y)/r.h));
    const before=nodes.map(node=>({node,r:rect(node),tx:Number(node.dataset.edX)||0,ty:Number(node.dataset.edY)||0,scale:Number(node.dataset.edScale)||1}));
    mutate(()=>{separateSelectedDescendants();before.forEach(item=>{
      item.scale=Number(item.node.dataset.edScale)||1;
      const node=item.node;node.style.transformOrigin='0 0';node.style.scale=String(item.scale*factor);node.dataset.edScale=String(item.scale*factor);
      const scaled=rect(node);translate(node,item.tx+r.x+(item.r.x-r.x)*factor-scaled.x,item.ty+r.y+(item.r.y-r.y)*factor-scaled.y);
    });});
  }
  function toggleAvailability(nodes,key) {
    const clear=nodes.some(e=>e.dataset[key]==='true');
    mutate(()=>{nodes.forEach(e=>{if(clear)delete e.dataset[key];else e.dataset[key]='true';});selectMany(clear?nodes:[]);});
  }
  function layerEntries() {
    const seen=new Set(),entries=[];
    targets(true).forEach(e=>{
      const nodes=groupMembers(e,true),id=nodes.find(n=>n.dataset.edGroup)?.dataset.edGroup;
      if(id){if(seen.has(id))return;seen.add(id);entries.push({nodes,group:true});}
      else entries.push({nodes:[e],group:false});
    });
    return entries;
  }
  function topLayerEntries() {
    const entries=layerEntries();
    return entries.filter(entry=>!entry.nodes.some(e=>entries.some(other=>other!==entry&&other.nodes.some(parent=>parent!==e&&parent.contains(e)))));
  }
  function reorderLayers(nodes,mode) {
    if(!nodes.length||nodes.some(unavailable))return;
    const z=e=>Number(frame.contentWindow.getComputedStyle(e).zIndex)||0;
    const entries=topLayerEntries().sort((a,b)=>Math.max(...a.nodes.map(z))-Math.max(...b.nodes.map(z)));
    const selectedEntries=entries.filter(entry=>entry.nodes.some(e=>nodes.includes(e)));if(!selectedEntries.length)return;
    let ordered;
    if(mode==='front'||mode==='back'){
      const other=entries.filter(entry=>!selectedEntries.includes(entry));ordered=mode==='front'?[...other,...selectedEntries]:[...selectedEntries,...other];
    }else{
      const i=entries.indexOf(selectedEntries[0]),j=clamp(i+(mode==='up'?1:-1),0,entries.length-1);if(i===j)return;
      ordered=[...entries];[ordered[i],ordered[j]]=[ordered[j],ordered[i]];
    }
    mutate(()=>{const stride=1+Math.max(...ordered.map(entry=>entry.nodes.length));ordered.forEach((entry,i)=>entry.nodes.sort((a,b)=>z(a)-z(b)).forEach((e,j)=>{if(frame.contentWindow.getComputedStyle(e).position==='static')e.style.position='relative';e.style.zIndex=String(i*stride+j+1);}));});
  }
  function editable(e) {
    return e && (e.matches('th,td') || kind(e)==='텍스트');
  }
  function preserveTextLines(text) {
    if(!text)return;
    const style=frame.contentWindow.getComputedStyle(text);
    // Flex/grid children form separate layout items, so an emphasized word can
    // jump to the first line even when a newline precedes it in the text.
    if(['flex','inline-flex','grid','inline-grid'].includes(style.display)){
      text.style.width=style.width;
      text.style.display=style.display.startsWith('inline-')?'inline-block':'block';
      [...text.children].filter(e=>e.matches('span,strong,b,em,i,u,small,a')&&!e.matches('.ed-decoration,.ed-generated-marker')).forEach(e=>{e.style.display='inline';e.style.whiteSpace='inherit';});
    }
    text.style.whiteSpace='pre-wrap';text.style.overflowWrap='break-word';text.style.wordBreak='keep-all';
  }
  function startText(e) {
    if (!editable(e)||unavailable(e)) return;
    beginInput();
    if(e.matches('th,td')){
      const c=e,s=frame.contentWindow.getComputedStyle(c),text=doc.createElement('div');text.className='ed-cell-text';
      c.style.position='relative';text.style.cssText=`display:block;position:absolute;left:${s.paddingLeft};top:${s.paddingTop};width:${Math.max(1,c.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight))}px;min-height:${parseFloat(s.lineHeight)||parseFloat(s.fontSize)*1.5}px;`;
      text.dataset.edId='e-'+crypto.randomUUID();text.append(...c.childNodes);c.append(text);freeCellText(c.closest('table'));e=text;
      selected=e;selectedGroup=[e];cell=c;updateProperties();updateSelection();updateLayers();
    }
    e.contentEditable='plaintext-only'; e.dataset.editing='true'; e.focus({preventScroll:true});
    $('selection').classList.add('editing');
    const range=doc.createRange(); range.selectNodeContents(e);
    const sel=frame.contentWindow.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    $('hint').textContent='내용을 입력하세요 · 바깥을 클릭하면 편집 완료';
  }
  function updateSelection() {
    const box=$('selection');
    const nodes=selectionNodes();
    if (!nodes.length) { box.hidden=true; return; }
    const rs=nodes.map(rect),r={x:Math.min(...rs.map(v=>v.x)),y:Math.min(...rs.map(v=>v.y))};
    r.w=Math.max(...rs.map(v=>v.x+v.w))-r.x;r.h=Math.max(...rs.map(v=>v.y+v.h))-r.y;
    Object.assign(box.style,{left:`${r.x*scale}px`,top:`${r.y*scale}px`,width:`${r.w*scale}px`,height:`${r.h*scale}px`});
    box.classList.toggle('compact',r.w*scale<28||r.h*scale<28);
    box.classList.toggle('multi',nodes.length>1);box.classList.toggle('grouped',!!groupId());$('move-handle').textContent=nodes.length>1?(groupId()?'그룹 이동 ⠿':`${nodes.length}개 이동 ⠿`):'이동 ⠿';
    box.hidden=false;
    $('canvas-warning').textContent = r.x < -1 || r.y < -1 || r.x+r.w>1601 || r.y+r.h>901 || nodes.some(e=>e.scrollHeight>e.clientHeight+3) ? '요소가 화면을 벗어나거나 글이 넘칩니다' : '';
  }
  function updateProperties() {
    $('element-properties').disabled=!selected;
    $('position-properties').disabled=!selected;$('position-properties').hidden=!selected;$('arrange-tools').hidden=!selected;
    $('empty-selection').hidden=!!selected;
    const count=selectionNodes().length;
    $('group-elements').disabled=count<2||!!groupId();$('ungroup-elements').disabled=!selectionNodes().some(e=>e.dataset.edGroup);
    $('fill-color').disabled=count>1;$('fill-none').disabled=count>1;
    const unitCount=selectionUnits().length;$('arrange-tools').disabled=unitCount<2;
    $('lock-elements').disabled=!selected;$('hide-elements').disabled=!selected;
    const reorderable=topLayerEntries().some(entry=>entry.nodes.some(e=>selectionNodes().includes(e)));['bring-front','bring-forward','send-backward','send-back'].forEach(id=>$(id).disabled=!reorderable);
    document.querySelectorAll('[data-distribute]').forEach(b=>b.disabled=unitCount<3);
    const bounds=boundsOf();$('element-x').value=bounds?Math.round(bounds.x):'';$('element-y').value=bounds?Math.round(bounds.y):'';
    $('selection-name').textContent=count>1 ? (groupId()?`그룹 · ${count}개`:`선택한 요소 ${count}개`) : selected ? '선택한 '+kind(selected) : '슬라이드 설정';
    $('selection-kind').textContent=count>1?'함께 이동·비율 크기 조절':selectedTable()&&cell ? `${cell.parentElement.rowIndex+1}행 ${cell.cellIndex+1}열` : '';
    $('table-properties').hidden=count>1||!selectedTable();
    const graphic=count===1&&!isPhoto(selected)&&(selected?.matches('svg,hr,.ed-line')||boxShape(selected));
    $('graphic-properties').hidden=!graphic;
    if(graphic){const s=frame.contentWindow.getComputedStyle(selected),edges=selected.dataset.edLineSides?.split(',')||['Top','Right','Bottom','Left'].filter(side=>parseFloat(s['border'+side+'Width'])>0);$('graphic-color').value=rgbHex(edges.length?s['border'+edges[0]+'Color']:s.stroke==='none'?s.color:s.stroke);if(document.activeElement!==$('graphic-width')){const own=parseFloat(edges.length?selected.style['border'+edges[0]+'Width']:selected.style.strokeWidth),seen=parseFloat(edges.length?s['border'+edges[0]+'Width']:s.strokeWidth)||0;$('graphic-width').value=Number.isFinite(own)?own:seen>0?Math.max(1,Math.round(seen)):0;}}
    // 선 두께 표시 (r26): 브라우저 확대·윈도우 배율에서는 1px 선이 0.909px처럼 읽힌다. 그 값을 다시 쓰면 화살표로 올려도 1로 되돌아가므로, 지정한 두께를 먼저 쓰고 없으면 반올림한다. 입력 중에는 덮어쓰지 않는다.
    $('media-properties').hidden=count!==1 || !['이미지','영상','빈 영역'].includes(kind(selected));
    $('image-tools').hidden=count!==1||!isPhoto(selected);
    $('change-video').hidden=!selected || !['영상','빈 영역'].includes(kind(selected));
    $('replace-media').hidden=!selected || !['이미지','빈 영역'].includes(kind(selected));
    const t=textTarget(); $('text-content').disabled=!t||count>1;
    $('text-content').value=count>1?'':t?.innerText || '';
    if (!selected) return;
    const computed=frame.contentWindow.getComputedStyle(t || selected);
    const sizes=textSelections().map(e=>Math.round(textSize(e)));
    $('font-size').disabled=!sizes.length;
    $('font-size').value=sizes.length&&sizes.every(n=>n===sizes[0])?sizes[0]:'';
    $('font-size').placeholder=sizes.length?'여러 크기':'';
    $('text-color').value=rgbHex(computed.color);
    const bg=frame.contentWindow.getComputedStyle(cell||selected).backgroundColor;$('fill-color').value=rgbHex(bg);$('fill-none').checked=bg==='transparent'||/rgba\(.*,\s*0\)$/.test(bg);
    $('bold').setAttribute('aria-pressed',String(Number(computed.fontWeight)>=600));
    const rs=selectionNodes().map(rect);
    $('element-width').value=Math.round(count>1?Math.max(...rs.map(r=>r.x+r.w))-Math.min(...rs.map(r=>r.x)):rs[0].w);
    $('element-height').value=Math.round(count>1?Math.max(...rs.map(r=>r.y+r.h))-Math.min(...rs.map(r=>r.y)):rs[0].h);
    if(selectedTable()){
      const c=cell||selectedTable().rows[0]?.cells[0];
      $('table-col-width').value=Math.round(c?.offsetWidth||0);
      $('table-row-height').value=Math.round(c?.parentElement.offsetHeight||0);
      $('table-cell-padding').value=Math.round(parseFloat(frame.contentWindow.getComputedStyle(c).paddingTop)||0);
    }
    doc.querySelectorAll('.slide.on [contenteditable]').forEach(e=>e.spellcheck=false);
  }
  function updateLayers() {
    const container=$('layers'),opened=new Set([...container.querySelectorAll('details[open]')].map(e=>e.dataset.groupId));container.replaceChildren();
    const top=topLayerEntries(),canReorder=nodes=>top.some(entry=>entry.nodes.some(e=>nodes.includes(e)));
    function row(nodes,group=false,child=false) {
      const e=nodes[0],wrap=document.createElement('div');wrap.className='layer-row';
      const name=group?(e.dataset.edGroupName||'그룹')+` · ${nodes.length}개`:e.dataset.edName||kind(e)+' · '+(e.alt||e.getAttribute('aria-label')||e.textContent.trim()||'빈 요소').slice(0,45);
      const b=document.createElement('button');b.type='button';b.className='layer-name';b.textContent=name;b.disabled=nodes.some(unavailable);
      b.setAttribute('aria-current',String(nodes.every(n=>selectionNodes().includes(n))));b.onclick=event=>{if(event.shiftKey)toggleSelection(e);else if(child)select(e,null,false);else select(e);};wrap.append(b);
      if(child)return wrap;
      const actions=document.createElement('div');actions.className='layer-actions';wrap.append(actions);
      function button(label,text,fn,disabled=false){const b=document.createElement('button');b.type='button';b.textContent=text;b.title=label;b.setAttribute('aria-label',label);b.disabled=disabled;b.onclick=event=>{event.stopPropagation();fn();};actions.append(b);}
      button('이름 변경','이름',()=>dialog('이름 변경',`<label>이름<input name="name" maxlength="60" value="${escape(group?e.dataset.edGroupName||'그룹':e.dataset.edName||'')}" required></label>`,data=>{const value=String(data.get('name')).trim();if(!value)throw Error('이름을 입력해주세요.');mutate(()=>nodes.forEach(n=>n.dataset[group?'edGroupName':'edName']=value));},'적용'));
      button('요소 삭제','삭제',()=>{selectMany(nodes);deleteElement();},nodes.some(unavailable));
      const locked=nodes.some(n=>n.dataset.edLocked==='true'),hidden=nodes.some(n=>n.dataset.edHidden==='true');
      button(locked?'잠금 해제':'잠금',locked?'해제':'잠금',()=>toggleAvailability(nodes,'edLocked'),nodes.some(n=>n.parentElement?.closest('[data-ed-locked="true"]')));
      button(hidden?'표시':'숨김',hidden?'표시':'숨김',()=>toggleAvailability(nodes,'edHidden'),nodes.some(n=>n.parentElement?.closest('[data-ed-hidden="true"]')));
      button('한 단계 앞으로','↑',()=>reorderLayers(nodes,'up'),!canReorder(nodes)||nodes.some(unavailable));
      button('한 단계 뒤로','↓',()=>reorderLayers(nodes,'down'),!canReorder(nodes)||nodes.some(unavailable));
      return wrap;
    }
    layerEntries().forEach(({nodes,group})=>{
      if(!group){container.append(row(nodes));return;}
      const details=document.createElement('details'),summary=document.createElement('summary');details.className='layer-group';details.dataset.groupId=nodes[0].dataset.edGroup;details.open=opened.has(details.dataset.groupId);summary.append(row(nodes,true));details.append(summary);
      const children=document.createElement('div');children.className='layer-children';nodes.forEach(e=>children.append(row([e],false,true)));details.append(children);container.append(details);
    });
  }
  function updateRail() {
    const rail=$('slide-list'), scroll=document.querySelector('.slide-rail').scrollTop;
    rail.replaceChildren();
    slides.forEach((s,i)=>{
      const b=document.createElement('button'); b.className='slide-item'; b.type='button'; b.setAttribute('aria-current',String(i===current)); b.setAttribute('aria-label',`${i+1}번 ${title(s)}`);
      const bg=frame.contentWindow.getComputedStyle(s).backgroundColor;
      b.innerHTML=`<div class="slide-thumb"><span>${String(i+1).padStart(2,'0')} · ${escape(s.querySelector('.chapter-title')?.textContent || '표지')}</span><strong>${escape(title(s))}</strong></div><span>${String(i+1).padStart(2,'0')}</span>`;
      b.querySelector('.slide-thumb').style.setProperty('--thumb-bg', bg);
      b.querySelector('.slide-thumb').style.setProperty('--thumb-fg', frame.contentWindow.getComputedStyle(s).color);
      b.draggable=true;
      b.onclick=()=>{go(i);$('slide-list').querySelectorAll('.slide-item')[i]?.focus({preventScroll:true});};
      b.ondragstart=e=>{railDragIndex=i;b.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(i));};
      b.ondragover=e=>{e.preventDefault();e.dataTransfer.dropEffect='move';document.querySelectorAll('.slide-item').forEach(x=>x.classList.remove('drop-before','drop-after'));const r=b.getBoundingClientRect(),after=e.clientY>r.top+r.height/2;railDropIndex=i+(after?1:0);b.classList.add(after?'drop-after':'drop-before');};
      b.ondrop=e=>{e.preventDefault();moveSlideFromRail();};
      b.ondragend=()=>clearRailDrag();
      const entry=document.createElement('div');entry.className='slide-entry';const remove=document.createElement('button');remove.className='slide-remove';remove.type='button';remove.textContent='삭제';remove.setAttribute('aria-label',`${i+1}번 슬라이드 삭제`);remove.disabled=slides.length===1;remove.onclick=()=>deleteSlide(i);entry.append(b,remove);rail.append(entry);
    });
    $('slide-total').textContent=slides.length+'장';
    $('slide-up').disabled=current===0; $('slide-down').disabled=current===slides.length-1; $('delete-slide').disabled=slides.length===1;
    document.querySelector('.slide-rail').scrollTop=scroll;
  }
  function clearRailDrag() {
    document.querySelectorAll('.slide-item').forEach(e=>e.classList.remove('dragging','drop-before','drop-after'));
    railDragIndex=-1;railDropIndex=-1;
  }
  function moveSlideFromRail() {
    const from=railDragIndex,drop=railDropIndex;
    if(from<0||drop<0){clearRailDrag();return;}
    let to=drop;if(from<to)to--;to=clamp(to,0,slides.length-1);
    if(to===from){clearRailDrag();return;}
    mutate(()=>{const markups=slides.map(s=>cleanClone(s).outerHTML),moved=markups.splice(from,1)[0];markups.splice(to,0,moved);current=to;render(markups);});
    clearRailDrag();toast(`${from+1}번 슬라이드를 ${to+1}번으로 이동했습니다.`);
  }
  function refresh() {
    if (!doc) return;
    active().querySelectorAll('table').forEach(freeCellText);
    materializeDecorations();
    materializeBackgroundPhotos();
    candidateElements().forEach(e=>{if(!e.dataset.edId)e.dataset.edId='e-'+crypto.randomUUID();if(!e.textContent.trim()&&looksLikeBox(e)){const r=rect(e);if(r.w<=4||r.h<=4)e.classList.add('ed-line');}});
    $('undo').disabled=!past.length; $('redo').disabled=!future.length;
    $('page-status').textContent=`${current+1} / ${slides.length}`;
    $('speaker-notes').value=noteText(active().querySelector('.speaker-note'));
    $('slide-bg').value=rgbHex(frame.contentWindow.getComputedStyle(active()).backgroundColor);
    updateRail(); updateProperties(); updateLayers(); fit();
  }
  function fit() {
    const viewport=$('canvas-scroll');
    scale=$('zoom').value==='fit' ? clamp(Math.min((viewport.clientWidth-64)/1600,(viewport.clientHeight-64)/900),.12,1) : Number($('zoom').value);
    $('canvas-wrap').style.width=1600*scale+'px'; $('canvas-wrap').style.height=900*scale+'px';
    frame.style.transform=`scale(${scale})`; updateSelection();
  }
  function detachFromLayout(e) {
    if (!e || e.matches('th,td') || e.dataset.edDetachedObject === 'true') return;
    const r=rect(e);
    const computed=frame.contentWindow.getComputedStyle(e);
    const size=localSize(e,computed),width=size.w||r.w,height=size.h||r.h,ownScale=Number(e.dataset.edScale)||1,parentScale=r.w/(width*ownScale)||1;
    const boxChildren=kind(e)==='박스'?[...e.children].filter(child=>child.getClientRects().length&&frame.contentWindow.getComputedStyle(child).position!=='absolute').map(child=>({child,r:rect(child)})):[];
    if (!['absolute','fixed'].includes(computed.position) && e.parentElement !== active()) {
      const placeholder=doc.createElement('span');
      placeholder.className='ed-layout-placeholder';
      placeholder.setAttribute('aria-hidden','true');
      placeholder.dataset.edPlaceholderFor=e.dataset.edId || '';
      const parentStyle=frame.contentWindow.getComputedStyle(e.parentElement);
      // Fix the parent's current footprint before taking a child out of flow.
      // Its old content size must not stretch/shrink other cards in the grid.
      e.parentElement.style.width=parentStyle.width;e.parentElement.style.height=parentStyle.height;
      const basis=parentStyle.flexDirection.startsWith('column')?height:width;
      // 글줄 안의 강조 글자(b·em 등)는 자리 표시도 글줄 안에 둔다. block이면 줄이 끊겨 뒤 글자가 다음 줄로 밀린다.
      const inlineFlow=computed.display==='inline'&&!/flex|grid/.test(parentStyle.display);
      placeholder.style.cssText=`display:${inlineFlow?'inline-block;vertical-align:middle':'block'};box-sizing:border-box;width:${width}px;height:${height}px;min-width:${width}px;min-height:${height}px;margin:${computed.margin};align-self:${computed.alignSelf};order:${computed.order};flex:0 0 ${basis}px;visibility:hidden;pointer-events:none;grid-column:${computed.gridColumn};grid-row:${computed.gridRow};`;
      e.before(placeholder);
    }
    e.style.boxSizing='border-box';
    e.style.width=width+'px';
    e.style.height=height+'px';
    e.style.maxWidth='none';
    e.style.minWidth='0';
    e.style.maxHeight='none';
    e.style.minHeight='0';
    e.style.flex='none';
    e.style.position='absolute';
    e.style.left='0';
    e.style.top='0';
    e.style.right='auto';
    e.style.bottom='auto';
    e.style.margin='0';
    e.style.translate='none';
    delete e.dataset.edX;
    delete e.dataset.edY;
    const zero=rect(e);
    e.style.left=(r.x-zero.x)/parentScale+'px';
    e.style.top=(r.y-zero.y)/parentScale+'px';
    if (kind(e) === '박스') {
      e.style.overflow='visible';
      boxChildren.forEach(({child,r:before})=>{
        const after=rect(child),dx=before.x-after.x,dy=before.y-after.y;
        if(Math.abs(dx)>.1||Math.abs(dy)>.1){
          const style=frame.contentWindow.getComputedStyle(child);
          child.style.position='relative';
          child.style.left=(parseFloat(style.left)||0)+dx+'px';
          child.style.top=(parseFloat(style.top)||0)+dy+'px';
        }
      });
    }
    e.dataset.edDetachedObject='true';
  }
  function inFlow(e) { return !['absolute','fixed'].includes(frame.contentWindow.getComputedStyle(e).position); }
  function separateChildren(container) {
    // HTML ancestry is not an editor group. Leave other selectable objects still
    // when only their containing box is manipulated.
    if(kind(container)==='텍스트'||selectionNodes().length!==1||groupId())return;
    const descendants=targets(true).filter(e=>e!==container&&container.contains(e));
    const roots=descendants.filter(e=>!descendants.some(parent=>parent!==e&&parent.contains(e)));
    if(roots.length&&container.parentElement!==active())liftObjects([container]);
    liftObjects(roots);
  }
  function separateSelectedDescendants() {
    const nodes=selectionNodes();liftObjects(nodes.filter(e=>nodes.some(parent=>parent!==e&&parent.contains(e))));
  }
  function liftObjects(roots) {
    const records=roots.map(node=>({node,r:rect(node),width:localSize(node).w,height:localSize(node).h,tx:Number(node.dataset.edX)||0,ty:Number(node.dataset.edY)||0,
      styles:[node,...node.querySelectorAll('*')].map(e=>({e,hidden:!!e.closest('[data-ed-hidden="true"]'),props:PRESENTATION_PROPS.map(prop=>[prop,frame.contentWindow.getComputedStyle(e).getPropertyValue(prop)])}))}));
    records.forEach(({node,r,width,height,styles,tx,ty})=>{
      detachFromLayout(node);
      styles.forEach(({e,props,hidden})=>{props.forEach(([prop,value])=>{if(!/url\s*\(/i.test(value)&&!(prop==='visibility'&&hidden))e.style.setProperty(prop,value);});if(e.children.length)e.dataset.edFrozenText='true';});
      active().append(node);
      Object.assign(node.style,{position:'absolute',boxSizing:'border-box',left:'0px',top:'0px',right:'auto',bottom:'auto',margin:'0',width:width+'px',height:height+'px',minWidth:'0',maxWidth:'none',minHeight:'0',maxHeight:'none',translate:`${tx}px ${ty}px`,scale:'1',transformOrigin:'0 0'});
      const fullScale=r.w/(rect(node).w||r.w);node.style.scale=String(fullScale);
      node.dataset.edScale=String(fullScale);node.dataset.edX=String(tx);node.dataset.edY=String(ty);
      const zero=rect(node);node.style.left=r.x-zero.x+'px';node.style.top=r.y-zero.y+'px';node.dataset.edDetachedObject='true';
    });
  }
  function scaleTextBoxes(nodes,value) {
    const before=nodes.map(rect),factor=value/textSize(nodes[0]);
    const anchorX=Math.min(...before.map(r=>r.x)),anchorY=Math.min(...before.map(r=>r.y));
    nodes.forEach((node,i)=>{
      const r=before[i],current=rect(node),nextScale=(Number(node.dataset.edScale)||1)*factor;
      node.style.transformOrigin='0 0';node.style.scale=String(nextScale);node.dataset.edScale=String(nextScale);
      translate(node,(Number(node.dataset.edX)||0)+anchorX+(r.x-anchorX)*factor-current.x,(Number(node.dataset.edY)||0)+anchorY+(r.y-anchorY)*factor-current.y);
    });
  }
  function styleText(prop,value) {
    if (!selected) return;
    mutate(()=>{
      separateSelectedDescendants();
      const es=textSelections();
      if(prop==='fontSize'&&es.length&&es.every(e=>!e.matches('th,td'))){scaleTextBoxes(es,parseFloat(value));return;}
      es.forEach(e=>{
        e.style[prop]=value;
        if(e.dataset.edFrozenText==='true')e.querySelectorAll('*').forEach(child=>child.style[prop]=value);
      });
    });
  }
  // 글자 색: 색을 고르는 동안 바로 보이고(input), 창을 닫거나 확인하면 한 번의 실행 취소 단위로 남긴다(change).
  // 글자 상자를 골랐으면 안쪽 강조 글자까지 같은 색으로 바꾼다 (파워포인트와 같은 동작).
  let colorBefore=null;
  function paintTextColor(value){textSelections().forEach(e=>{e.style.color=value;e.querySelectorAll('*').forEach(c=>{if(!c.closest('.speaker-note,svg'))c.style.color=value;});});}
  function previewTextColor(value){
    if(!selected)return;
    if(colorBefore===null){flushInput();colorBefore=snapshot();separateSelectedDescendants();}
    paintTextColor(value);
  }
  function commitTextColor(value){
    if(!selected){colorBefore=null;return;}
    if(colorBefore===null){flushInput();colorBefore=snapshot();separateSelectedDescendants();}
    paintTextColor(value);
    const before=colorBefore;colorBefore=null;
    if(before!==snapshot()){pushPast(before);future=[];changed();}
    refresh();
  }
  function translate(e,x,y) {
    if(e.matches('.ed-cell-text')&&e.closest('table')){
      const top=Math.max(0,...[...e.closest('table').querySelectorAll('.ed-cell-text')].filter(n=>n!==e).map(n=>Number(n.style.zIndex)||0));
      if((Number(e.style.zIndex)||0)<=top)e.style.zIndex=String(top+1);
    }
    e.dataset.edX=String(x);e.dataset.edY=String(y);e.style.translate=`${x}px ${y}px`;
  }
  function moveBy(dx,dy) {
    if (!selected) return;
    const nodes=selectionNodes(),rs=nodes.map(rect),bounds={x:Math.min(...rs.map(r=>r.x)),y:Math.min(...rs.map(r=>r.y))};bounds.w=Math.max(...rs.map(r=>r.x+r.w))-bounds.x;bounds.h=Math.max(...rs.map(r=>r.y+r.h))-bounds.y;
    const mx=clamp(dx,-bounds.x,1600-bounds.x-bounds.w),my=clamp(dy,-bounds.y,900-bounds.y-bounds.h);
    // 상자 하나만 옮길 때는 안쪽 글자를 제자리에 둔다(r14). 여러 개를 함께 옮길 때(범위 선택·그룹)는 안쪽 글자도 같이 옮긴다(r24).
    const alone=nodes.length===1;
    mutate(()=>{separateSelectedDescendants();nodes.forEach(e=>{if(alone)separateChildren(e);translate(e,(Number(e.dataset.edX)||0)+mx,(Number(e.dataset.edY)||0)+my);});});
  }
  function beginDrag(event,action,handle='') {
    if (!selected || event.button!==0) return;
    event.preventDefault(); finishText();
    const before=snapshot();
    const multi=selectionNodes().length>1;
    const text=kind(selected)==='텍스트',side=['e','w','n','s'].includes(handle);
    const groupResize=action==='resize'&&(multi||(!side&&text));
    if(multi&&action==='resize'&&!['nw','ne','sw','se'].includes(handle))return;
    // 묶음은 원래 흐름에 둔 채 시각적 비율만 바꾼다. 분리하면 부모 배치와 상속 글꼴이 바뀐다.
    const nodes=selectionNodes(),rs=nodes.map(rect),r={x:Math.min(...rs.map(v=>v.x)),y:Math.min(...rs.map(v=>v.y))};r.w=Math.max(...rs.map(v=>v.x+v.w))-r.x;r.h=Math.max(...rs.map(v=>v.y+v.h))-r.y;
    dragging={action,handle,node:selected,groupResize,nodes:nodes.map((node,i)=>({node,r:rs[i],tx:Number(node.dataset.edX)||0,ty:Number(node.dataset.edY)||0,scale:Number(node.dataset.edScale)||1})),x:event.clientX,y:event.clientY,r,width:selected.offsetWidth||r.w,height:selected.offsetHeight||r.h,tx:Number(selected.dataset.edX)||0,ty:Number(selected.dataset.edY)||0,before};
    dragging.snapRects=action==='move'?targets(true).filter(e=>!e.closest('[data-ed-hidden="true"]')&&!nodes.some(node=>node===e||node.contains(e)||e.contains(node))).map(rect):[];
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function snapAxis(value,size,anchors,rects,axis) {
    let best={value,line:null,gap:false},distance=6/scale;
    function consider(next,line,gap=false){const d=Math.abs(next-value);if(d<distance){distance=d;best={value:next,line,gap};}}
    anchors.forEach(line=>[0,size/2,size].forEach(edge=>consider(line-edge,line)));
    const extent=axis==='x'?'w':'h';rects.sort((a,b)=>a[axis]-b[axis]);
    for(let i=0;i<rects.length-1;i++){
      const a=rects[i],b=rects[i+1],gap=b[axis]-a[axis]-a[extent];if(gap<=0)continue;
      const positions=[a[axis]-gap-size,b[axis]+b[extent]+gap];if(gap>=size)positions.push((a[axis]+a[extent]+b[axis]-size)/2);
      positions.forEach(next=>{if(next>=0&&next+size<=(axis==='x'?1600:900))consider(next,next+size/2,true);});
    }
    return best;
  }
  function pointerMove(event) {
    if (!dragging) return;
    const d=dragging, dx=(event.clientX-d.x)/scale,dy=(event.clientY-d.y)/scale;
    if(!d.started){
      if(Math.hypot(event.clientX-d.x,event.clientY-d.y)<3)return;
      d.started=true;
      separateSelectedDescendants();
      if(d.action!=='move'||d.nodes.length===1)d.nodes.forEach(({node})=>separateChildren(node)); // 여러 개를 함께 옮길 땐 안쪽도 같이 (r24)
      d.nodes.forEach(item=>{item.scale=Number(item.node.dataset.edScale)||1;item.tx=Number(item.node.dataset.edX)||0;item.ty=Number(item.node.dataset.edY)||0;});
      if(d.action==='resize'&&!d.groupResize){
        if(d.node.tagName!=='TABLE')detachFromLayout(d.node);
        d.width=d.node.offsetWidth||d.r.w;d.height=d.node.offsetHeight||d.r.h;
        d.tx=Number(d.node.dataset.edX)||0;d.ty=Number(d.node.dataset.edY)||0;
      }
    }
    if (d.action==='move') {
      let x=clamp(d.r.x+dx,0,Math.max(0,1600-d.r.w)),y=clamp(d.r.y+dy,0,Math.max(0,900-d.r.h));
      const enabled=$('snap-enabled').checked&&!event.altKey,others=d.snapRects;
      const sx=enabled?snapAxis(x,d.r.w,[0,800,1600,...others.flatMap(r=>[r.x,r.x+r.w/2,r.x+r.w])],others.filter(r=>r.y<y+d.r.h&&r.y+r.h>y),'x'):{value:x,line:null};
      const sy=enabled?snapAxis(y,d.r.h,[0,450,900,...others.flatMap(r=>[r.y,r.y+r.h/2,r.y+r.h])],others.filter(r=>r.x<x+d.r.w&&r.x+r.w>x),'y'):{value:y,line:null};
      x=clamp(sx.value,0,Math.max(0,1600-d.r.w));y=clamp(sy.value,0,Math.max(0,900-d.r.h));
      $('guide-x').hidden=sx.line===null||x!==sx.value;$('guide-x').style.left=sx.line*scale+'px';$('guide-x').dataset.mode=sx.gap?'gap':'edge';
      $('guide-y').hidden=sy.line===null||y!==sy.value;$('guide-y').style.top=sy.line*scale+'px';$('guide-y').dataset.mode=sy.gap?'gap':'edge';
      d.nodes.forEach(item=>translate(item.node,item.tx+x-d.r.x,item.ty+y-d.r.y));
    } else if(d.groupResize){
      const west=d.handle.includes('w'),north=d.handle.includes('n');
      const horizontal=(d.r.w+(west?-dx:dx))/d.r.w,vertical=(d.r.h+(north?-dy:dy))/d.r.h;
      let factor=Math.abs(horizontal-1)>=Math.abs(vertical-1)?horizontal:vertical;
      const anchorX=west?d.r.x+d.r.w:d.r.x,anchorY=north?d.r.y+d.r.h:d.r.y;
      factor=clamp(factor,.1,Math.min(west?anchorX/d.r.w:(1600-anchorX)/d.r.w,north?anchorY/d.r.h:(900-anchorY)/d.r.h));
      const groupX=west?anchorX-d.r.w*factor:anchorX,groupY=north?anchorY-d.r.h*factor:anchorY;
      d.nodes.forEach(item=>{
        const x=groupX+(item.r.x-d.r.x)*factor,y=groupY+(item.r.y-d.r.y)*factor;
        item.node.style.transformOrigin='0 0';item.node.style.scale=String(item.scale*factor);item.node.dataset.edScale=String(item.scale*factor);
        translate(item.node,item.tx+x-item.r.x,item.ty+y-item.r.y);
      });
    } else {
      const west=d.handle.includes('w'),north=d.handle.includes('n');
      const localScale=Number(d.node.dataset.edScale)||1;
      // Limits use slide coordinates, just like the pointer delta. Reduced text
      // needs a larger CSS width to reach the same visible width.
      const vertical=['n','s'].includes(d.handle),horizontal=['e','w'].includes(d.handle);
      let w=vertical?d.width:clamp(d.width+(west?-dx:dx)/localScale,50,1600/localScale),h=horizontal?d.height:clamp(d.height+(north?-dy:dy)/localScale,28,900/localScale);
      if (isPhoto(d.node) && !event.shiftKey && !vertical && !horizontal) h=w*d.height/d.width;
      if(d.node.tagName==='TABLE')resizeTable(d.node,w,['e','w'].includes(d.handle)?d.height:h);
      else {d.node.style.width=w+'px';d.node.style.maxWidth='none';d.node.style.minWidth='0';if(!horizontal){d.node.style.height=h+'px';d.node.style.minHeight='0';d.node.style.maxHeight='none';}if(kind(d.node)==='박스')d.node.style.overflow='visible';}
      translate(d.node,d.tx+(west?(d.width-w)*localScale:0),d.ty+(north?(d.height-h)*localScale:0));
    }
    updateSelection();
  }
  function pointerEnd() {
    if(!dragging)return;
    if (dragging.before!==snapshot()) {pushPast(dragging.before); future=[]; changed();}
    dragging=null; $('guide-x').hidden=true; $('guide-y').hidden=true; updateProperties();
  }
  function beginMarquee(event) {
    if(event.button!==0||targetAt(event))return;
    finishText();event.preventDefault();const initial=event.shiftKey?selectionNodes():[];if(!event.shiftKey)selectMany([]);
    marquee={initial,x:clamp(event.clientX,0,1600),y:clamp(event.clientY,0,900),currentX:clamp(event.clientX,0,1600),currentY:clamp(event.clientY,0,900)};
    const box=$('marquee');Object.assign(box.style,{left:`${marquee.x*scale}px`,top:`${marquee.y*scale}px`,width:'0',height:'0'});box.hidden=false;
  }
  function moveMarquee(event) {
    if(!marquee)return;marquee.currentX=clamp(event.clientX,0,1600);marquee.currentY=clamp(event.clientY,0,900);
    const x=Math.min(marquee.x,marquee.currentX),y=Math.min(marquee.y,marquee.currentY),w=Math.abs(marquee.currentX-marquee.x),h=Math.abs(marquee.currentY-marquee.y);
    Object.assign($('marquee').style,{left:`${x*scale}px`,top:`${y*scale}px`,width:`${w*scale}px`,height:`${h*scale}px`});
  }
  function endMarquee() {
    if(!marquee)return;
    const x=Math.min(marquee.x,marquee.currentX),y=Math.min(marquee.y,marquee.currentY),right=Math.max(marquee.x,marquee.currentX),bottom=Math.max(marquee.y,marquee.currentY);
    $('marquee').hidden=true;
    const dragged=right-x>=4||bottom-y>=4;
    const nodes=dragged?targets().filter(e=>{const r=rect(e);return r.x<right&&r.x+r.w>x&&r.y<bottom&&r.y+r.h>y;}):[];
    suppressCanvasClick=dragged;
    // 끌어서 고른 범위 안의 상자와 그 안 글자를 함께 고른다. 상자만 잡혀 글자가 남는 문제(r24 사용자 신고) 방지.
    const initial=marquee.initial;marquee=null;selectMany([...initial,...nodes]);
  }
  function addElement(element) {
    mutate(()=>{ element.classList.add('ed-object'); element.dataset.edId='e'+(++uid); active().append(element); stamp(); select(element); });
  }
  function makeText(text='텍스트를 입력하세요') {
    const e=doc.createElement('div'); e.className='ed-text'; e.textContent=text;
    e.style.cssText='position:absolute;left:140px;top:260px;width:700px;min-height:70px;font-size:40px;line-height:1.6;color:#16312b;background:transparent;z-index:10;white-space:pre-wrap;word-break:keep-all;'; return e;
  }
  let dialogAction=null;
  function dialog(titleText, fields, callback,buttonText='넣기') {
    $('dialog-title').textContent=titleText; $('dialog-fields').innerHTML=fields; $('dialog-error').textContent='';$('insert-form').querySelector('[type=submit]').textContent=buttonText;dialogAction=callback; $('insert-dialog').showModal();
    $('dialog-fields').querySelector('input,select')?.focus();
  }
  function ask(titleText,message,callback) {
    $('confirm-title').textContent=titleText; $('confirm-message').textContent=message;
    $('confirm-dialog').showModal(); $('confirm-yes').onclick=()=>{$('confirm-dialog').close();callback();};
  }
  function tableDialog() {
    dialog('표 넣기','<label>행 수 (제목행 포함)<input name="rows" type="number" min="2" max="10" value="3" required></label><label>열 수<input name="cols" type="number" min="2" max="8" value="3" required></label>',data=>{
      const rows=Number(data.get('rows')),cols=Number(data.get('cols'));
      if (!Number.isInteger(rows)||rows<2||rows>10||!Number.isInteger(cols)||cols<2||cols>8)throw Error('행2~10개, 열2~8개로 입력해주세요.');
      const t=doc.createElement('table');t.className='demo-table';t.style.cssText='position:absolute;left:140px;top:240px;width:1320px;margin:0;z-index:10;';
      t.innerHTML='<thead><tr>'+Array.from({length:cols},(_,c)=>`<th>제목 ${c+1}</th>`).join('')+'</tr></thead><tbody>'+Array.from({length:rows-1},()=>'<tr>'+Array.from({length:cols},()=>'<td>내용</td>').join('')+'</tr>').join('')+'</tbody>';
      addElement(t);
    });
  }
  function tableCommand(command) {
    const t=selectedTable();if(!t)return;
    mutate(()=>{
      const rows=[...t.rows],count=rows[0].cells.length,ri=cell?cell.parentElement.rowIndex:rows.length-1,ci=cell?cell.cellIndex:count-1;
      if(command==='add-row'){
        if(rows.length>=12){toast('한 장에는12행까지 넣을 수 있습니다.');return;}
        const row=t.insertRow(ri+1);for(let c=0;c<count;c++)row.insertCell().textContent='내용';
      }
      if(command==='delete-row'){if(rows.length<=2){toast('제목행과 내용행은 남겨주세요.');return;}if(ri===0){toast('제목행은 삭제하지 않습니다.');return;}t.deleteRow(ri);}
      if(command==='add-col'){
        if(count>=8){toast('열은8개까지 넣을 수 있습니다.');return;}
        rows.forEach((r,i)=>{const n=doc.createElement(i===0?'th':'td');n.textContent=i===0?'새 제목':'내용';r.insertBefore(n,r.cells[ci+1]||null);});
      }
      if(command==='delete-col'){if(count<=1){toast('열 하나는 남겨주세요.');return;}rows.forEach(r=>r.deleteCell(ci));}
      selected=t;selectedGroup=[t];cell=null;stamp();
    });
  }
  function fileImage(file,replace) {
    if(!file)return;
    if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type)||file.size>8*1024*1024){toast('PNG·JPG·WebP·GIF 이미지8MB 이하를 선택해주세요.');return;}
    const reader=new FileReader(); reader.onerror=()=>toast('파일을 읽지 못했습니다.');
    reader.onload=()=>{
      const img=doc.createElement('img');img.alt=file.name;img.src=reader.result;
      img.onload=()=>{
        if(replace?.isConnected){mutate(()=>{if(isPhoto(replace)){let photo=replace;if(photo.matches('svg'))photo=uncropPhoto(photo);photo.src=img.src;photo.alt=img.alt;select(photo);}else{const r=rect(replace);img.style.cssText=`position:absolute;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;object-fit:contain;z-index:10;`;replace.replaceWith(img);img.classList.add('ed-object');stamp();select(img);}});}
        else {img.style.cssText=`position:absolute;left:200px;top:230px;width:1000px;height:${Math.min(530,1000*img.naturalHeight/img.naturalWidth)}px;object-fit:contain;z-index:10;`;addElement(img);}
      };
      img.onerror=()=>toast('이미지 파일이 올바르지 않습니다.');
    };reader.readAsDataURL(file);
  }
  let cropState=null,cropDrag=null;
  function photoSource(photo) { return photo.matches('img')?photo.currentSrc||photo.src:photo.querySelector('image').getAttribute('href'); }
  function uncropPhoto(photo) {
    const img=doc.createElement('img');
    for(const attr of photo.attributes)if(!['viewBox','preserveAspectRatio','xmlns','role','data-ed-photo-size'].includes(attr.name))img.setAttribute(attr.name,attr.value);
    img.classList.remove('ed-crop-image','ed-background-photo');img.src=photoSource(photo);img.alt=photo.getAttribute('aria-label')||'';img.removeAttribute('aria-label');
    img.style.objectFit='contain';img.style.objectPosition='50% 50%';photo.replaceWith(img);return img;
  }
  function paintCrop() {
    if(!cropState)return;const r=cropState.r;
    Object.assign($('crop-region').style,{left:r.x+'%',top:r.y+'%',width:r.w+'%',height:r.h+'%'});
    for(const key of ['x','y','w','h'])$('crop-'+key).value=String(Math.round(r[key]*1000)/1000);
  }
  function cropRatio() {
    const value=$('crop-ratio').value;
    return value==='free'?null:(value==='original'?cropState.width/cropState.height:Number(value))*cropState.height/cropState.width;
  }
  function openCrop() {
    if(selectionNodes().length!==1||!isPhoto(selected)||unavailable(selected))return;
    finishText();const target=selected;cropState={target,r:{x:0,y:0,w:100,h:100},width:0,height:0};
    $('crop-error').textContent='';$('crop-ratio').value='free';$('crop-apply').disabled=true;$('crop-region').hidden=true;
    const preview=$('crop-preview');
    preview.onload=()=>{
      if(cropState?.target!==target)return;
      const width=preview.naturalWidth,height=preview.naturalHeight;cropState.width=width;cropState.height=height;
      if(target.matches('svg.ed-crop-image')){const v=target.viewBox.baseVal;cropState.r={x:100*v.x/width,y:100*v.y/height,w:100*v.width/width,h:100*v.height/height};}
      $('crop-region').hidden=false;$('crop-apply').disabled=false;paintCrop();
    };
    preview.onerror=()=>{$('crop-error').textContent='원본 사진을 불러오지 못했습니다.';};
    preview.src=photoSource(target);$('crop-dialog').showModal();
  }
  function applyCrop() {
    const state=cropState;if(!state?.width||!state.target.isConnected||unavailable(state.target))return;
    const r=state.r;
    if(!Object.values(r).every(Number.isFinite)||r.w<1||r.h<1||r.x<0||r.y<0||r.x+r.w>100.001||r.y+r.h>100.001){$('crop-error').textContent='사진 안에서 가로·세로 1% 이상의 영역을 선택해주세요.';return;}
    mutate(()=>{
      let photo=state.target;
      if(photo.matches('img')){
        const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg'),image=doc.createElementNS('http://www.w3.org/2000/svg','image');
        for(const attr of photo.attributes)if(!['src','srcset','alt'].includes(attr.name))svg.setAttribute(attr.name,attr.value);
        const s=frame.contentWindow.getComputedStyle(photo);for(const prop of PRESENTATION_PROPS){const value=s.getPropertyValue(prop);if(!/url\s*\(/i.test(value))svg.style.setProperty(prop,value);}
        svg.classList.add('ed-crop-image');svg.setAttribute('role','img');svg.setAttribute('aria-label',photo.alt||'사진');
        image.setAttribute('href',photoSource(photo));image.setAttribute('width',state.width);image.setAttribute('height',state.height);
        svg.append(image);photo.replaceWith(svg);photo=svg;
      }
      photo.setAttribute('viewBox',[r.x*state.width/100,r.y*state.height/100,r.w*state.width/100,r.h*state.height/100].join(' '));
      photo.classList.add('ed-crop-image');const image=photo.querySelector('image');image.setAttribute('x','0');image.setAttribute('y','0');image.setAttribute('width',state.width);image.setAttribute('height',state.height);
      photo.setAttribute('preserveAspectRatio','xMidYMid meet');photo.dataset.edPhotoSize=state.width+' '+state.height;photo.style.overflow='hidden';
      select(photo,null,false);
    });
    $('crop-dialog').close();
  }
  function fitPhoto(cover) {
    if(selectionNodes().length!==1||!isPhoto(selected))return;
    mutate(()=>{if(selected.matches('img')){selected.style.objectFit=cover?'cover':'contain';selected.style.objectPosition='50% 50%';}else selected.setAttribute('preserveAspectRatio',cover?'xMidYMid slice':'xMidYMid meet');});
  }
  function youtubeId(value) {
    try {const u=new URL(value);if(!['https:','http:'].includes(u.protocol))return null; const host=u.hostname.toLowerCase();
      const id=host==='youtu.be'?u.pathname.slice(1):['youtube.com','www.youtube.com','m.youtube.com','www.youtube-nocookie.com'].includes(host)?u.searchParams.get('v')||u.pathname.match(/\/(?:embed|shorts)\/([^/]+)/)?.[1]:null;
      return /^[\w-]{11}$/.test(id||'')?id:null;
    }catch{return null;}
  }
  function videoDialog(replace=null) {
    dialog('YouTube 영상 넣기','<label>영상 주소<input name="url" type="url" placeholder="https://www.youtube.com/watch?v=…" required></label>',data=>{
      const id=youtubeId(data.get('url'));if(!id)throw Error('YouTube 영상의 전체 주소를 입력해주세요.');
      const e=doc.createElement('div');e.className='video-stage ed-object';e.dataset.kind='iframe';e.dataset.title='YouTube';e.dataset.src=`https://www.youtube.com/embed/${id}?rel=0`;
      e.innerHTML='<p class="ed-video-label">YouTube 영상</p><button class="video-load" type="button">영상 재생 ▶</button><p class="media-status" role="status"></p>';
      const r=replace?rect(replace):{x:160,y:240,w:1000,h:530};e.style.cssText=`position:absolute;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;z-index:10;`;
      if(replace){mutate(()=>{replace.replaceWith(e);stamp();select(e);});}else addElement(e);
    });
  }
  function duplicate() {
    if(!selected)return;
    mutate(()=>{
      const groups=new Map();
      const copies=selectionNodes().map(source=>{
        const copy=source.cloneNode(true);copy.removeAttribute('contenteditable');copy.querySelectorAll('[contenteditable]').forEach(e=>e.removeAttribute('contenteditable'));
        resetCloneIds(copy);
        [copy,...copy.querySelectorAll('[data-ed-group]')].forEach(e=>{const id=e.dataset.edGroup;if(!id)return;if(!groups.has(id))groups.set(id,crypto.randomUUID());e.dataset.edGroup=groups.get(id);});
        const r=rect(source);copy.classList.add('ed-object');copy.style.position='absolute';copy.style.left='0';copy.style.top='0';copy.style.width=(source.offsetWidth||r.w)+'px';copy.style.height=(source.offsetHeight||r.h)+'px';copy.style.margin='0';copy.style.translate='none';delete copy.dataset.edX;delete copy.dataset.edY;
        // 원래 부모에 복제해 상속 글꼴과 정렬을 유지한다.
        source.after(copy);const zero=rect(copy);copy.style.left=(r.x+24-zero.x)+'px';copy.style.top=(r.y+24-zero.y)+'px';return copy;
      });
      stamp();selectMany(copies);
    });
  }
  function deleteElement() {if(!selected)return;mutate(()=>{selectionNodes().forEach(e=>{active().querySelectorAll('.ed-layout-placeholder').forEach(p=>{if(p.dataset.edPlaceholderFor===e.dataset.edId)p.remove();});e.remove();});selected=null;selectedGroup=[];cell=null;});}
  function deleteSlide(index=current) {
    if(slides.length<=1)return;
    ask('슬라이드 삭제',`${index+1}번 슬라이드를 삭제할까요? 실행 취소로 되돌릴 수 있습니다.`,()=>mutate(()=>{const a=slides.map(s=>cleanClone(s).outerHTML);a.splice(index,1);if(current>index)current--;render(a);}));
  }
  function newSlide(layout) {
    const header='<header class="slide-heading"><p class="chapter-title">01 목차 제목</p><h2>슬라이드 제목</h2></header>';
    let body='';let cls='';
    if(layout==='cover'){cls='cover';body='<h2>교육 제목을<br>입력하세요</h2><p class="lead">교육 대상 · 기관명</p>';}
    else if(layout==='blank')body=header;
    else if(layout==='list'){cls='sequence-slide';body=header+'<ol class="plain-list"><li>첫 번째 내용</li><li>두 번째 내용</li><li>세 번째 내용</li></ol>';}
    else if(layout==='compare'){cls='requests-slide';body=header+'<table class="demo-table"><thead><tr><th>비교 항목 A</th><th>비교 항목 B</th></tr></thead><tbody><tr><td>내용</td><td>내용</td></tr><tr><td>내용</td><td>내용</td></tr></tbody></table>';}
    else if(layout==='media')body=header+'<div class="blank-media"><p>이미지나 영상을 넣어주세요</p></div>';
    else if(layout==='outcomes'){cls='outcomes-slide';body=header+'<ol class="plain-list"><li>첫 번째 결과</li><li>두 번째 결과</li><li>세 번째 결과</li></ol>';}
    return `<section class="slide ${cls}">${body}<p class="speaker-note"></p><span class="pageno"></span></section>`;
  }
  function resetCloneIds(root) {
    const nodes=[root,...root.querySelectorAll('*')],ids=new Map();
    nodes.forEach(e=>{if(e.dataset.edId){const id='e-'+crypto.randomUUID();ids.set(e.dataset.edId,id);e.dataset.edId=id;}});
    nodes.forEach(e=>{const old=e.dataset.edPlaceholderFor;if(!old)return;if(ids.has(old))e.dataset.edPlaceholderFor=ids.get(old);else delete e.dataset.edPlaceholderFor;});
  }
  function copyElements() {
    finishText();const nodes=selectionNodes();if(!nodes.length)return false;
    const props=PRESENTATION_PROPS;
    elementClipboard=nodes.map(source=>{
      const clone=source.cloneNode(true),originals=[source,...source.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];
      originals.forEach((node,i)=>{const style=frame.contentWindow.getComputedStyle(node),copy=copies[i];copy.removeAttribute('contenteditable');delete copy.dataset.editing;if(copy.children.length)copy.dataset.edFrozenText='true';props.forEach(prop=>{const value=style.getPropertyValue(prop);if(!/url\s*\(/i.test(value)&&!(prop==='visibility'&&node.closest('[data-ed-hidden="true"]')))copy.style.setProperty(prop,value);});});
      if(kind(source)==='텍스트')clone.classList.add('ed-text');
      return {node:clone,r:rect(source),width:source.offsetWidth||rect(source).w,height:source.offsetHeight||rect(source).h};
    });
    clipboardKind='elements';pasteCount=0;toast(`${nodes.length}개 요소를 복사했습니다.`);return true;
  }
  function pasteElements() {
    if(!elementClipboard.length)return;
    const offset=24*(++pasteCount),groups=new Map();
    const rs=elementClipboard.map(item=>item.r),dx=clamp(offset,-Math.min(...rs.map(r=>r.x)),1600-Math.max(...rs.map(r=>r.x+r.w))),dy=clamp(offset,-Math.min(...rs.map(r=>r.y)),900-Math.max(...rs.map(r=>r.y+r.h)));
    mutate(()=>{
      const copies=elementClipboard.map(item=>{
        const copy=item.node.cloneNode(true);copy.classList.add('ed-object');resetCloneIds(copy);
        [copy,...copy.querySelectorAll('[data-ed-group]')].forEach(e=>{const id=e.dataset.edGroup;if(!id)return;if(!groups.has(id))groups.set(id,crypto.randomUUID());e.dataset.edGroup=groups.get(id);});
        Object.assign(copy.style,{position:'absolute',left:'0px',top:'0px',right:'auto',bottom:'auto',margin:'0',translate:'none'});
        if(!copy.style.width||copy.style.width==='auto')copy.style.width=item.width+'px';
        if(!copy.style.height||copy.style.height==='auto')copy.style.height=item.height+'px';
        delete copy.dataset.edX;delete copy.dataset.edY;
        active().append(copy);const zero=rect(copy);copy.style.left=(item.r.x+dx-zero.x)+'px';copy.style.top=(item.r.y+dy-zero.y)+'px';return copy;
      });
      stamp();selectMany(copies);
    });
  }
  function copySlide() { clipboardKind='slide';slideClipboard=cleanClone(active()).outerHTML;toast(`${current+1}번 슬라이드를 복사했습니다.`); }
  function pasteSlide() {
    if(!slideClipboard){toast('먼저 Ctrl+C로 슬라이드를 복사해주세요.');return;}
    mutate(()=>{const a=slides.map(s=>cleanClone(s).outerHTML),copy=doc.createElement('div');copy.innerHTML=slideClipboard;resetCloneIds(copy);a.splice(current+1,0,copy.innerHTML);current++;render(a);});
  }
  function addSlideDialog() {
    dialog('새 슬라이드','<label>슬라이드 틀<select name="layout"><option value="list">번호 목록</option><option value="compare">좌우 비교표</option><option value="outcomes">세 가지 결과</option><option value="media">이미지·영상</option><option value="cover">표지</option><option value="blank">빈 슬라이드</option></select></label>',data=>{
      mutate(()=>{const markups=slides.map(s=>cleanClone(s).outerHTML);markups.splice(current+1,0,newSlide(data.get('layout')));current++;render(markups);});
    });
  }
  function download(blob,name) {const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),10000);}
  function newDeckDialog() {
    dialog('새 교육자료 시작하기','<label>자료 이름<input name="name" maxlength="120" value="새 교육자료" required></label><p class="muted">표지·번호 목록·비교표·세 가지 결과·미디어 틀로 시작합니다. 현재 자료는 먼저 편집 파일로 보관해주세요. 실행 취소로도 되돌릴 수 있습니다.</p>',data=>{
      const name=String(data.get('name')).trim();if(!name)throw Error('자료 이름을 입력해주세요.');
      mutate(()=>{setHandle(null);current=0;applyDesign(null);$('deck-name').value=name;render(['cover','list','compare','outcomes','media'].map(newSlide));active().querySelector('h2').textContent=name;});
    });
  }
  function safeName() {return ($('deck-name').value.trim()||'교육자료').replace(/[<>:"/\\|?*]/g,'-').slice(0,80);}
  async function saveProject() {
    if(exportBusy)return;
    finishText();saveDraft();
    // 파일 선택 창은 클릭 직후 열어 브라우저의 사용자 동작 권한을 유지한다.
    let picker, permission, failReason='';
    const canPick=typeof window.showSaveFilePicker==='function';
    if(canPick && !fileHandle){
      try{picker=window.showSaveFilePicker({id:'webslide-project',suggestedName:safeName()+'.slides.json',types:[{description:'슬라이드 편집 파일',accept:{'application/json':['.json']}}]}).then(handle=>({handle}),error=>({error}));}
      catch(error){picker=Promise.resolve({error});}
    }else if(canPick && fileHandle?.requestPermission){
      // 새로고침 뒤에는 쓰기 권한을 다시 받아야 한다. 클릭 직후에 물어야 브라우저가 허용한다.
      permission=fileHandle.requestPermission({mode:'readwrite'}).catch(()=>'denied');
    }
    busy(true);
    try {
    const data=project();data.design={...data.design,css:await embedCss(data.design.css)};data.slides=await embedSlides(data.slides);
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    if(blob.size>MAX_FILE)throw Error('64MB를 넘습니다. 사진 크기를 줄이거나 단원별로 나누어 저장하세요.');
    if(canPick){
      let chosen=false;
      try {
        if(picker){const result=await picker;if(result.error)throw result.error;setHandle(result.handle);}
        if(permission&&await permission!=='granted'){$('save-status').textContent='저장 안 됨 · 파일 쓰기 권한 필요';toast(`‘${fileHandle.name}’에 덮어쓰려면 권한을 허용해주세요. 다시 저장을 누르면 묻습니다.`);return;}
        chosen=true;
        const stream=await fileHandle.createWritable();await stream.write(blob);await stream.close();fileSavedCurrent=true;$('save-status').textContent=savedLabel();toast(`‘${fileHandle.name}’에 저장했습니다. 다음 저장도 이 파일에 덮어씁니다.`);return;
      }catch(e){
        // 사용자가 창을 닫은 경우만 '취소'. 브라우저가 막은 경우는 이유를 그대로 보여준다.
        if(e.name==='AbortError'&&!chosen&&/aborted a request/i.test(e.message)){$('save-status').textContent='저장 취소 · 화면의 작업은 유지됨';return;}
        if(!chosen){failReason='저장 위치 선택 실패 '+e.name;toast(`저장 위치를 받지 못했습니다 (${e.name}: ${e.message}) 내려받기로 저장합니다.`);console.warn('showSaveFilePicker',e);}
        if(chosen){failReason='파일 쓰기 실패 '+e.name;setHandle(null);toast('선택한 파일에 쓰지 못해 내려받기로 저장합니다. ('+e.message+')');}
      }
    }
    download(blob,safeName()+'.slides.json');$('save-status').textContent='편집 파일 내려받기 시작'+(failReason?' · '+failReason:'');toast('편집 파일을 내려받았습니다. ‘열기’로 다시 이어갈 수 있어요.');
    }catch(e){$('save-status').textContent='파일 저장 실패 · 화면의 작업은 유지됨';toast('편집 파일을 저장하지 못했습니다: '+e.message);}finally{busy(false);}
  }
  async function openProject(file,handle=null) {
    if(!file)return;
    if(file.size>MAX_FILE){toast('편집 파일은 64MB 이하로 열 수 있습니다.');return;}
    try {
      const data=validateProject(JSON.parse(await file.text()));
      const clean=data.slides.map(sanitize);
      ask('편집 파일 열기','현재 내용은 실행 취소로 되돌릴 수 있습니다. 선택한 파일을 열까요?',()=>mutate(()=>{$('deck-name').value=data.name;current=0;setHandle(handle);applyDesign(data.design);render(clean);}));
    }catch(e){toast(e instanceof SyntaxError?'JSON 형식의 편집 파일을 선택해주세요.':e.message);}
  }
  async function openFile(file,handle=null) {
    if(!file)return;
    if(file.size>MAX_FILE){toast('파일은 64MB 이하로 열 수 있습니다.');return;}
    try {
      const prefix=(await file.slice(0,1024).text()).replace(/^\uFEFF/,'').trimStart();
      if(prefix.startsWith('{')){if($('open-dialog').open)$('open-dialog').close();await openProject(file,handle);}
      else if(prefix.startsWith('<')){if(!$('open-dialog').open)$('open-dialog').showModal();await prepareImport([file]);}
      else toast('편집 파일(.slides·.json) 또는 웹슬라이드 HTML을 선택해주세요.');
    }catch{toast('파일을 읽지 못했습니다. 저장한 파일을 다시 선택해주세요.');}
  }
  async function embedCss(style) {
    for(const m of [...style.matchAll(/url\(\s*['"]?([^'"\)]+)['"]?\s*\)/g)]) {
      if(!m[1].startsWith('data:'))style=style.replace(m[0],`url("${await dataUrl(new URL(m[1],BASE).href)}")`);
    }
    return style;
  }
  async function embedSlides(markups) {
    const result=[];
    for(const markup of markups){
      const root=new DOMParser().parseFromString(markup,'text/html').body.firstElementChild;
      for(const e of root.querySelectorAll('img[src],svg image[href]')){const attr=e.matches('img')?'src':'href',value=e.getAttribute(attr);if(!value.startsWith('data:'))e.setAttribute(attr,await dataUrl(new URL(value,BASE).href));}
      result.push(root.outerHTML);
    }
    return result;
  }
  function showOpen() { $('open-dialog').showModal(); }
  // 파일 선택: 가능하면 파일 핸들을 받아, 연 편집 파일에 그대로 다시 저장한다.
  async function pickOpenFile() {
    if(typeof window.showOpenFilePicker!=='function'){$('html-file').click();return;}
    let handle;
    try{[handle]=await window.showOpenFilePicker({id:'webslide-project',types:[{description:'편집 파일 · 웹슬라이드',accept:{'application/json':['.json','.slides'],'text/html':['.html','.htm']}}]});}
    catch(e){if(e.name!=='AbortError')$('html-file').click();return;}
    const file=await handle.getFile();
    await openFile(file,/\.(json|slides)$/i.test(file.name)?handle:null);
  }
  // 끌어놓기: 파일 하나면 파일 열기, 폴더나 여러 파일이면 폴더 열기와 같게 처리한다.
  async function openDropped(dt) {
    // 파일 핸들은 놓는 순간에만 받을 수 있다. 편집 파일을 끌어놓아 열어도 같은 파일에 다시 저장되게 한다.
    let handlePromise=null;try{handlePromise=dt.items?.length===1?dt.items[0].getAsFileSystemHandle?.()||null:null;}catch{}
    const entries=[...(dt.items||[])].map(i=>i.webkitGetAsEntry?.()).filter(Boolean), plain=[...dt.files];
    const files=[];let folder=false;
    async function walk(entry,path) {
      if(files.length>3000)throw Error('파일이 너무 많은 폴더입니다. 덱이 들어 있는 폴더만 끌어다 놓으세요.');
      if(entry.isFile){const f=await new Promise((ok,no)=>entry.file(ok,no));Object.defineProperty(f,'webkitRelativePath',{value:path+entry.name});files.push(f);}
      else if(entry.isDirectory){folder=true;const reader=entry.createReader();let batch;do{batch=await new Promise((ok,no)=>reader.readEntries(ok,no));for(const x of batch)await walk(x,path+entry.name+'/');}while(batch.length);}
    }
    try {
      if(entries.length)for(const e of entries)await walk(e,'');else files.push(...plain);
      if(!files.length)return;
      if(!folder&&files.length===1){const h=await Promise.resolve(handlePromise).catch(()=>null);await openFile(files[0],h?.kind==='file'?h:null);return;}
      if(!$('open-dialog').open)$('open-dialog').showModal();
      await prepareImport(files);
    }catch(e){toast(e.message||'끌어놓은 파일을 읽지 못했습니다.');}
  }
  async function prepareImport(files) {
    importFiles=[...files];pendingImport=null;importGeneration++;
    const options=importFiles.filter(f=>/\.html?$/i.test(f.name));
    $('import-deck').replaceChildren(...options.map(f=>new Option(f.webkitRelativePath||f.name,f.webkitRelativePath||f.name)));
    $('import-panel').hidden=false;$('import-apply').disabled=true;
    if(!options.length){$('import-report').textContent='선택한 폴더에 HTML 파일이 없습니다.';return;}
    const preferred=options.find(f=>f.name===SOURCE_DECK)||options[0];$('import-deck').value=preferred.webkitRelativePath||preferred.name;
    await inspectImport();
  }
  async function inspectImport() {
    const generation=++importGeneration;pendingImport=null;$('import-apply').disabled=true;$('import-report').textContent='슬라이드와 이미지·글꼴을 확인하고 있습니다…';
    const file=importFiles.find(f=>(f.webkitRelativePath||f.name)===$('import-deck').value);
    try {
      const imported=await SlideImport.load(file,importFiles);imported.data.slides=imported.data.slides.map(sanitize);
      if(generation!==importGeneration)return;
      pendingImport=imported.data;
      $('import-report').textContent=`${imported.data.name} · ${imported.data.slides.length}장 · 이미지·글꼴 ${imported.assets}개 확인. 가져온 뒤 실행 취소로 기존 자료를 복구할 수 있습니다.`+(imported.localLinks?` 연결된 별도 페이지 ${imported.localLinks}개는 포함되지 않아 해당 링크는 비활성화됩니다.`:'');
      $('import-apply').disabled=false;
    }catch(e){if(generation===importGeneration)$('import-report').textContent=e.message;}
  }
  async function fetchCss(url,embed=false,seen=new Set()) {
    const absolute=new URL(url,BASE).href;if(seen.has(absolute))return '';seen.add(absolute);
    const response=await fetch(absolute);if(!response.ok)throw Error('디자인 파일을 읽지 못했습니다.');let text=await response.text();
    for(const match of [...text.matchAll(/@import\s+url\(['"]?([^'"\)]+)['"]?\)\s*;/g)]) text=text.replace(match[0],await fetchCss(new URL(match[1],absolute).href,embed,seen));
    const replacements=[...text.matchAll(/url\(\s*['"]?([^'"\)]+)['"]?\s*\)/g)];
    for(const m of replacements){if(m[1].startsWith('data:'))continue;const u=new URL(m[1],absolute).href;
      text=text.replace(m[0],`url("${embed?await dataUrl(u):u}")`);
    }return text;
  }
  async function dataUrl(url) {
    const response=await fetch(url);if(!response.ok)throw Error('파일을 불러오지 못했습니다: '+new URL(url).pathname);
    const blob=await response.blob();return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('파일 변환 실패'));reader.readAsDataURL(blob);});
  }
  function presentationRuntime() {
    const slides=[...document.querySelectorAll('.slide')];let n=0;
    function go(i){slides[n]?.querySelectorAll('video,audio').forEach(v=>v.pause());slides[n]?.querySelectorAll('iframe').forEach(e=>e.remove());
      n=Math.max(0,Math.min(slides.length-1,i));slides.forEach((s,j)=>{s.classList.toggle('on',j===n);s.setAttribute('aria-hidden',String(j!==n));});document.getElementById('counter').textContent=`${n+1} / ${slides.length}`;history.replaceState(null,'','#'+(n+1));}
    function fit(){const scale=Math.min((innerWidth-24)/1600,(innerHeight-84)/900);document.getElementById('stage').style.cssText=`position:absolute;left:50%;top:calc((100% - 60px)/2);width:1600px;height:900px;transform:translate(-50%,-50%) scale(${scale});`;}
    document.getElementById('prev').onclick=()=>go(n-1);document.getElementById('next').onclick=()=>go(n+1);
    document.getElementById('full').onclick=()=>document.documentElement.requestFullscreen?.();document.getElementById('pdf').onclick=()=>print();
    document.getElementById('notes-button').onclick=()=>{const panel=document.getElementById('present-notes');panel.hidden=!panel.hidden;const note=slides[n].querySelector('.speaker-note');panel.textContent=note?([...note.querySelectorAll(':scope>p')].map(p=>p.textContent).join('\n')||note.textContent):'메모 없음';};
    document.addEventListener('keydown',e=>{if(e.target.closest('video,audio,iframe'))return;if(e.key==='ArrowRight')go(n+1);if(e.key==='ArrowLeft')go(n-1);if(e.key==='Home')go(0);if(e.key==='End')go(slides.length-1);});
    document.addEventListener('click',e=>{
      const jump=e.target.closest('a[href^="#"]');if(jump){e.preventDefault();go(Number(jump.getAttribute('href').slice(1))-1);}
      const button=e.target.closest('.video-load');if(!button)return;const stage=button.closest('.video-stage');
      const frame=document.createElement('iframe');frame.src=stage.dataset.src;frame.title='시연 영상';frame.allowFullscreen=true;stage.append(frame);
    });addEventListener('resize',fit);fit();go(Number(location.hash.slice(1))-1||0);
  }
  async function exportDocument(embed) {
    finishText();const copies=slides.map(cleanClone);
    for(const s of copies){
      for(const e of s.querySelectorAll('img[src],svg image[href]')){const attr=e.matches('img')?'src':'href',value=e.getAttribute(attr);if(!value.startsWith('data:'))e.setAttribute(attr,embed?await dataUrl(new URL(value,BASE).href):new URL(value,BASE).href);}
      s.querySelectorAll('a[href]').forEach(a=>{const h=a.getAttribute('href');if(!h.startsWith('#'))a.href=new URL(h,BASE).href;});
    }
      const style=(embed?await embedCss(css):css)+'\n'+MARKER_CSS+'\n'+OBJECT_CSS;
    if(deckShell){
      // 원래 덱의 틀과 스크립트로 저장: 넘기기·노트 창·애니메이션 등 덱 고유 동작이 그대로 남는다.
      const deckStyle=style+'\n.ed-object{margin:0}.ed-text{white-space:pre-wrap}';
      return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape($('deck-name').value)}</title><style>${deckStyle.replace(/<\/style/gi,'<\\/style')}</style>${deckHeadScripts}</head><body class="${bodyClass}">${deckShell.replace(SlideImport.SHELL_MARK,()=>copies.map(s=>s.outerHTML).join('\n'))}</body></html>`;
    }
    const runtime='('+presentationRuntime.toString()+')();';
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape($('deck-name').value)}</title><style>${style.replace(/<\/style/gi,'<\\/style')}</style><style>.ed-object{margin:0}.ed-text{white-space:pre-wrap}.ed-video-label{color:white;padding:40px;font-size:32px}.slide-heading{flex:none}.slide{animation:none!important}#present-controls{position:fixed;bottom:0;left:0;right:0;display:flex;justify-content:center;align-items:center;gap:16px;background:#16312b;padding:12px;color:white}#present-controls button{font:16px sans-serif;padding:7px 16px;border:1px solid #789486;border-radius:7px;background:transparent;color:white;cursor:pointer}#present-notes{position:fixed;right:20px;bottom:70px;max-width:600px;max-height:60vh;overflow:auto;padding:24px;background:#fff;z-index:100;border:1px solid #a8bcb0;font:18px/1.8 sans-serif;color:#16312b;white-space:pre-wrap}@media print{#present-controls,#present-notes{display:none!important}}</style></head><body class="${bodyClass}"><main id="stage">${copies.map(s=>s.outerHTML).join('\n')}</main><nav id="present-controls"><button id="prev">←</button><span id="counter"></span><button id="next">→</button><button id="full">전체화면</button><button id="notes-button">강사메모</button><button id="pdf">인쇄·PDF</button></nav><aside id="present-notes" hidden></aside><script>${runtime.replace(/<\/script/gi,'<\\/script')}<\/script></body></html>`;
  }
  function busy(value) {exportBusy=value;document.querySelector('.editor-top').classList.toggle('busy',value);}
  function tableBoundary(event) {
    const table=event.target.closest?.('table');
    if(!table||!active().contains(table)||unavailable(table))return null;
    const tolerance=6/scale,rows=[...table.rows],bounds=rect(table);
    // shortcut: 병합 셀은 제외. 병합 표 편집을 지원할 때 격자 좌표를 계산한다.
    if([...table.querySelectorAll('th,td')].some(c=>c.colSpan>1||c.rowSpan>1))return null;
    for(const row of rows){
      const r=rect(row);
      if(event.clientY<r.y||event.clientY>r.y+r.h)continue;
      for(let i=0;i<row.cells.length-1;i++){
        const left=rect(row.cells[i]),right=rect(row.cells[i+1]);
        if(Math.abs(event.clientX-(left.x+left.w+right.x)/2)<=tolerance)return {table,cell:row.cells[i],axis:'col',index:i};
      }
    }
    if(event.clientX>=bounds.x&&event.clientX<=bounds.x+bounds.w)for(let i=0;i<rows.length-1;i++){
      const top=rect(rows[i]),bottom=rect(rows[i+1]);
      if(Math.abs(event.clientY-(top.y+top.h+bottom.y)/2)<=tolerance)return {table,cell:rows[i].cells[0],axis:'row',index:i};
    }
    return null;
  }
  function beginTableResize(event) {
    if(event.button!==0)return;
    const hit=tableBoundary(event);if(!hit)return;
    event.preventDefault();select(hit.table,hit.cell);finishText();
    tableDrag={...hit,before:snapshot(),x:event.clientX,y:event.clientY,started:false,
      widths:[...hit.table.rows[0].cells].map(c=>rect(c).w),heights:[...hit.table.rows].map(r=>rect(r).h),
      sx:rect(hit.table).w/hit.table.offsetWidth,sy:rect(hit.table).h/hit.table.offsetHeight};
    hit.table.setPointerCapture(event.pointerId);
  }
  function moveTableResize(event) {
    const d=tableDrag;
    if(!d){const hit=tableBoundary(event);doc.documentElement.dataset.edTableCursor=hit?.axis||'';doc.documentElement.style.cursor=hit?(hit.axis==='col'?'col-resize':'row-resize'):'';return;}
    const delta=d.axis==='col'?(event.clientX-d.x)/d.sx:(event.clientY-d.y)/d.sy;
    if(!d.started&&Math.abs(delta)<1)return;
    event.preventDefault();
    const rows=[...d.table.rows],i=d.index;
    if(!d.started){
      d.started=true;
      if(d.axis==='col'){
        d.table.style.tableLayout='fixed';d.table.style.width=d.table.offsetWidth+'px';
        d.table.querySelectorAll('col').forEach(c=>c.style.width='auto');
        rows.forEach(r=>[...r.cells].forEach((c,j)=>{c.style.boxSizing='border-box';c.style.width=d.widths[j]/d.sx+'px';}));
      }else{
        d.table.style.height='auto';
        rows.forEach((r,j)=>r.style.height=d.heights[j]/d.sy+'px');
      }
    }
    if(d.axis==='col'){
      const a=d.widths[i]/d.sx,b=d.widths[i+1]/d.sx,change=clamp(delta,30-a,b-30);
      rows.forEach(r=>{r.cells[i].style.width=a+change+'px';r.cells[i+1].style.width=b-change+'px';});
    }else rows[i].style.height=Math.max(20,d.heights[i]/d.sy+delta)+'px';
    updateSelection();updateProperties();
  }
  function endTableResize() {
    if(!tableDrag)return;
    if(tableDrag.before!==snapshot()){pushPast(tableDrag.before);future=[];changed();updateRail();}
    suppressCanvasClick=true;tableDrag=null;doc.documentElement.style.cursor='';delete doc.documentElement.dataset.edTableCursor;updateSelection();updateProperties();
  }
  function bindCanvas() {
    doc.addEventListener('pointerdown',e=>{beginTableResize(e);if(!tableDrag)beginMarquee(e);});
    doc.addEventListener('pointermove',moveTableResize);
    doc.addEventListener('pointerup',endTableResize);
    doc.addEventListener('pointercancel',endTableResize);
    doc.addEventListener('pointermove',moveMarquee);
    doc.addEventListener('pointerup',endMarquee);
    doc.addEventListener('pointercancel',endMarquee);
    doc.addEventListener('click',e=>{if(suppressCanvasClick){suppressCanvasClick=false;e.preventDefault();return;}if(e.target.isContentEditable)return;e.preventDefault();const node=targetAt(e);if(e.shiftKey){toggleSelection(node);return;}select(node,e.target.closest('th,td'));});
    doc.addEventListener('dblclick',e=>{e.preventDefault();const c=e.target.closest('th,td');select(targetAt(e),c,false);startText(textTarget() || c);});
    doc.addEventListener('input',e=>{preserveTextLines(e.target.closest('[contenteditable]'));if(textTarget())$('text-content').value=textTarget().innerText;changed();updateSelection();});
    doc.addEventListener('beforeinput',e=>{beginInput();const text=e.target.closest('[contenteditable]');if(text)detachFromLayout(text);});
    doc.addEventListener('paste',e=>{
      if(!e.target.isContentEditable)return;e.preventDefault();const text=e.clipboardData.getData('text/plain');const sel=frame.contentWindow.getSelection();
      if(sel.rangeCount){beginInput();const target=e.target.closest('[contenteditable]');detachFromLayout(target);preserveTextLines(target);const range=sel.getRangeAt(0);range.deleteContents();const node=doc.createTextNode(text);range.insertNode(node);range.setStartAfter(node);range.collapse(true);sel.removeAllRanges();sel.addRange(range);if(textTarget())$('text-content').value=textTarget().innerText;changed();updateSelection();}
    });
    doc.addEventListener('keydown',keys);
    doc.addEventListener('focusout',()=>{setTimeout(()=>{if(!doc.activeElement?.isContentEditable)flushInput();},0);});
  }
  function keys(e) {
    if(e.isComposing)return;
    const typing=e.target.isContentEditable || e.target.closest('input,textarea,select');
    const mod=e.ctrlKey||e.metaKey;
    if(mod&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}
    if(mod&&e.key.toLowerCase()==='s'){e.preventDefault();saveProject();return;}
    if(e.key==='Escape'){finishText();select(null);return;}
    if(typing)return;
    if(['Delete','Backspace'].includes(e.key)&&e.target.closest('.slide-item')){e.preventDefault();deleteSlide();return;}
    if(mod&&e.key.toLowerCase()==='a'){e.preventDefault();selectMany(targets());return;}
    if(mod&&e.key.toLowerCase()==='g'){e.preventDefault();e.shiftKey?ungroupSelection():groupSelection();return;}
    if(mod&&e.key.toLowerCase()==='c'){e.preventDefault();e.shiftKey||!selected?copySlide():copyElements();return;}
    if(mod&&e.key.toLowerCase()==='x'&&selected){e.preventDefault();if(copyElements())deleteElement();return;}
    if(mod&&e.key.toLowerCase()==='v'){e.preventDefault();e.shiftKey||clipboardKind==='slide'?pasteSlide():pasteElements();return;}
    if(mod&&e.key.toLowerCase()==='d'){e.preventDefault();duplicate();return;}
    // 순서: Ctrl+] 앞으로, Ctrl+[ 뒤로, Shift를 함께 누르면 맨 앞·맨 뒤 (파워포인트와 같은 키)
    if(mod&&selected&&(e.code==='BracketRight'||e.code==='BracketLeft')){e.preventDefault();reorderLayers(selectionNodes(),e.code==='BracketRight'?(e.shiftKey?'front':'up'):(e.shiftKey?'back':'down'));return;}
    if(['Delete','Backspace'].includes(e.key)&&selected){e.preventDefault();deleteElement();return;}
    if(selected&&e.key.startsWith('Arrow')){e.preventDefault();const step=e.shiftKey?10:1;moveBy(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0);}
    if(e.key==='Enter'&&selectionNodes().length===1&&!e.target.closest('button,summary,a')&&textTarget()){e.preventDefault();startText(textTarget());}
  }
  function wire() {
    if(!$('marquee')){const e=document.createElement('div');e.id='marquee';e.hidden=true;$('canvas-wrap').insertBefore(e,$('selection'));}
    $('undo').onclick=undo;$('redo').onclick=redo;$('add-text').onclick=()=>{addElement(makeText());startText(selected);};$('add-table').onclick=tableDialog;
    $('group-elements').onclick=groupSelection;$('ungroup-elements').onclick=ungroupSelection;
    $('lock-elements').onclick=()=>toggleAvailability(selectionNodes(),'edLocked');$('hide-elements').onclick=()=>toggleAvailability(selectionNodes(),'edHidden');
    $('add-box').onclick=()=>{const e=makeText('');e.className='ed-box';e.style.height='180px';e.style.width='360px';e.style.background='#edf2ef';e.style.borderRadius='16px';addElement(e);};
    $('add-image').onclick=()=>{replaceTarget=null;$('image-file').click();};$('replace-media').onclick=()=>{replaceTarget=selected;$('image-file').click();};
    $('image-file').onchange=e=>{fileImage(e.target.files[0],replaceTarget);e.target.value='';};$('add-video').onclick=()=>videoDialog();$('change-video').onclick=()=>videoDialog(selected);
    $('crop-image').onclick=openCrop;$('crop-cancel').onclick=()=>$('crop-dialog').close();
    $('crop-form').onsubmit=e=>{e.preventDefault();applyCrop();};
    $('crop-dialog').addEventListener('close',()=>{cropState=null;cropDrag=null;$('crop-preview').removeAttribute('src');});
    $('crop-reset').onclick=()=>{cropState.r={x:0,y:0,w:100,h:100};$('crop-ratio').value='free';paintCrop();};
    $('reset-image-crop').onclick=()=>{if(selected?.matches('svg.ed-crop-image'))mutate(()=>select(uncropPhoto(selected),null,false));};
    $('image-contain').onclick=()=>fitPhoto(false);$('image-cover').onclick=()=>fitPhoto(true);
    $('crop-ratio').onchange=()=>{if(!cropState?.width)return;const ratio=cropRatio(),r=cropState.r;if(ratio){const cx=r.x+r.w/2,cy=r.y+r.h/2;r.w=Math.min(r.w,r.h*ratio);r.h=r.w/ratio;r.x=clamp(cx-r.w/2,0,100-r.w);r.y=clamp(cy-r.h/2,0,100-r.h);}paintCrop();};
    for(const key of ['x','y','w','h']){$('crop-'+key).step='any';$('crop-'+key).onchange=()=>{
      if(!cropState?.width)return;const value=$('crop-'+key).valueAsNumber;if(!Number.isFinite(value)){paintCrop();return;}
      const r=cropState.r;r[key]=clamp(value,['w','h'].includes(key)?1:0,['w','h'].includes(key)?100:99);
      const ratio=cropRatio();if(ratio&&['w','h'].includes(key)){if(key==='w')r.h=r.w/ratio;else r.w=r.h*ratio;const factor=Math.min(1,100/r.w,100/r.h);r.w*=factor;r.h*=factor;}
      r.x=clamp(r.x,0,100-r.w);r.y=clamp(r.y,0,100-r.h);paintCrop();
    };}
    const cropPoint=e=>{const b=$('crop-stage').getBoundingClientRect();return {x:clamp((e.clientX-b.x)/b.width*100,0,100),y:clamp((e.clientY-b.y)/b.height*100,0,100)};};
    $('crop-stage').onpointerdown=e=>{
      if(e.button!==0||!cropState?.width)return;e.preventDefault();const p=cropPoint(e),handle=e.target.dataset.cropHandle;
      cropDrag={p,r:{...cropState.r},mode:handle||($('crop-region').contains(e.target)?'move':'draw')};$('crop-stage').setPointerCapture(e.pointerId);
    };
    $('crop-stage').onpointermove=e=>{
      if(!cropDrag||!cropState)return;const d=cropDrag,p=cropPoint(e),dx=p.x-d.p.x,dy=p.y-d.p.y;
      if(d.mode==='move')cropState.r={...d.r,x:clamp(d.r.x+dx,0,100-d.r.w),y:clamp(d.r.y+dy,0,100-d.r.h)};
      else {
        const ax=d.mode==='draw'?d.p.x:d.mode.includes('w')?d.r.x+d.r.w:d.r.x,ay=d.mode==='draw'?d.p.y:d.mode.includes('n')?d.r.y+d.r.h:d.r.y;
        const west=p.x<ax,north=p.y<ay;let w=Math.max(1,Math.abs(p.x-ax)),h=Math.max(1,Math.abs(p.y-ay)),ratio=cropRatio();
        if(ratio){if(w/h>ratio)h=w/ratio;else w=h*ratio;const f=Math.min(1,(west?ax:100-ax)/w,(north?ay:100-ay)/h);w*=f;h*=f;}
        cropState.r={x:west?ax-w:ax,y:north?ay-h:ay,w:Math.min(w,100),h:Math.min(h,100)};
      }paintCrop();
    };
    $('crop-stage').onpointerup=$('crop-stage').onpointercancel=()=>cropDrag=null;
    $('add-slide').onclick=addSlideDialog;$('new-deck').onclick=newDeckDialog;
    $('copy-slide').onclick=()=>{copySlide();pasteSlide();};
    $('delete-slide').onclick=()=>deleteSlide();
    function swap(delta){mutate(()=>{const a=slides.map(s=>cleanClone(s).outerHTML),next=current+delta;[a[current],a[next]]=[a[next],a[current]];current=next;render(a);});}
    $('slide-up').onclick=()=>swap(-1);$('slide-down').onclick=()=>swap(1);
    $('text-content').onfocus=beginInput;$('text-content').oninput=()=>{const t=textTarget();if(!t)return;detachFromLayout(t);t.textContent=$('text-content').value;preserveTextLines(t);changed();updateSelection();};$('text-content').onblur=flushInput;
    $('font-size').onpointerdown=e=>{const input=$('font-size'),first=textSelections()[0];if(first&&input.value===''&&e.offsetX>=input.clientWidth-22)input.value=Math.round(textSize(first));};
    $('font-size').onkeydown=e=>{const first=textSelections()[0];if(first&&$('font-size').value===''&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const size=textSize(first)+(e.key==='ArrowUp'?1:-1);styleText('fontSize',clamp(size,12,160)+'px');}};
    $('font-size').onchange=()=>{const input=$('font-size'),value=input.valueAsNumber;if(input.value.trim()&&Number.isFinite(value))styleText('fontSize',clamp(value,12,160)+'px');};$('text-color').oninput=()=>previewTextColor($('text-color').value);$('text-color').onchange=()=>commitTextColor($('text-color').value);$('text-color').onblur=()=>{if(colorBefore!==null)commitTextColor($('text-color').value);};
    $('bold').onclick=()=>styleText('fontWeight',$('bold').getAttribute('aria-pressed')==='true'?'400':'750');
    document.querySelectorAll('[data-align]').forEach(b=>b.onclick=()=>styleText('textAlign',b.dataset.align));
    $('fill-color').onchange=()=>{if(selected)mutate(()=>{(cell||selected).style.backgroundColor=$('fill-color').value;});};
    // 채우기 없음: 배경만 지우고 선은 남긴다. 선이 없는 도형이면 선 2px을 넣어 표·틀처럼 쓸 수 있게 한다.
    $('fill-none').onchange=()=>{if(!selected)return;const t=cell||selected,none=$('fill-none').checked;mutate(()=>{
      if(none){t.style.backgroundColor='transparent';t.style.backgroundImage='none';
        if(!cell&&boxShape(t)){const s=frame.contentWindow.getComputedStyle(t);if(['Top','Right','Bottom','Left'].every(side=>!parseFloat(s['border'+side+'Width'])))t.style.border=`2px solid ${$('graphic-color').value||'#16312b'}`;}}
      else{t.style.backgroundImage='';t.style.backgroundColor=$('fill-color').value;}
    });};
    // 선 색·두께: 바꾸는 동안 바로 보이고(input), 확정하면 실행 취소 한 단위로 남긴다(change). 대상은 처음 바꾼 요소로 고정 (r25 사용자 신고: 두께가 안 바뀜).
    let graphicBefore=null,graphicTarget=null;
    const paintGraphic=t=>{const color=$('graphic-color').value,width=clamp(Number($('graphic-width').value)||0,0,40);
        if(t.matches('svg'))[t,...t.querySelectorAll('path,line,polyline,polygon,rect,circle,ellipse')].forEach(e=>{e.style.stroke=color;e.style.strokeWidth=String(width);});
        else if(boxShape(t))t.style.border=`${width}px solid ${color}`;
        else {const s=frame.contentWindow.getComputedStyle(t),sides=t.dataset.edLineSides?.split(',')||['Top','Right','Bottom','Left'].filter(side=>parseFloat(s['border'+side+'Width'])>0);t.dataset.edLineSides=(sides.length?sides:['Top']).join(',');t.dataset.edLineSides.split(',').forEach(side=>{t.style['border'+side]=`${width}px solid ${color}`;});}};
    const graphicOk=t=>t?.isConnected&&(t.matches('svg,hr,.ed-line')||boxShape(t));
    const previewGraphic=()=>{if(graphicBefore===null){if(!graphicOk(selected))return;flushInput();graphicBefore=snapshot();graphicTarget=selected;}if(graphicOk(graphicTarget))paintGraphic(graphicTarget);updateSelection();};
    const commitGraphic=()=>{if(graphicBefore===null)previewGraphic();if(graphicBefore===null)return;const before=graphicBefore;graphicBefore=null;graphicTarget=null;if(before!==snapshot()){pushPast(before);future=[];changed();}refresh();};
    for(const id of ['graphic-color','graphic-width']){$(id).oninput=previewGraphic;$(id).onchange=commitGraphic;$(id).onblur=()=>{if(graphicBefore!==null)commitGraphic();};}
    for(const [id,axis] of [['element-x','x'],['element-y','y']])$(id).onchange=()=>{const value=$(id).valueAsNumber,r=boundsOf();if(!r||!Number.isFinite(value)){updateProperties();return;}moveBy(axis==='x'?value-r.x:0,axis==='y'?value-r.y:0);};
    // 가로·세로 숫자: 자른 사진(SVG)은 offsetWidth가 없어 계산된 크기를 쓴다 (r25, 예전엔 0이 됨).
    for(const [id,prop,min,max] of [['element-width','width',30,1600],['element-height','height',20,900]])$(id).onchange=()=>{const value=$(id).valueAsNumber;if(!selected||!Number.isFinite(value)){updateProperties();return;}if(selectionNodes().length>1){resizeSelection(clamp(value,min,max),prop==='width'?'w':'h');return;}mutate(()=>{separateChildren(selected);const local=selected[prop==='width'?'offsetWidth':'offsetHeight']??parseFloat(frame.contentWindow.getComputedStyle(selected)[prop]),factor=rect(selected)[prop==='width'?'w':'h']/(local||1);if(selected.tagName==='TABLE'){resizeTable(selected,prop==='width'?clamp(value,min,max)/factor:selected.offsetWidth,prop==='height'?clamp(value,min,max)/factor:selected.offsetHeight);return;}detachFromLayout(selected);selected.style[prop]=clamp(value,min,max)/factor+'px';selected.style.maxWidth='none';selected.style.maxHeight='none';selected.style.minHeight='0';if(boxShape(selected))selected.style.overflow='visible';});};
    document.querySelectorAll('[data-arrange]').forEach(b=>b.onclick=()=>alignSelection(b.dataset.arrange));
    document.querySelectorAll('[data-distribute]').forEach(b=>b.onclick=()=>distributeSelection(b.dataset.distribute));
    $('center-x').onclick=()=>{if(selected){const rs=selectionNodes().map(rect);moveBy(800-(Math.min(...rs.map(r=>r.x))+Math.max(...rs.map(r=>r.x+r.w)))/2,0);}};$('center-y').onclick=()=>{if(selected){const rs=selectionNodes().map(rect);moveBy(0,450-(Math.min(...rs.map(r=>r.y))+Math.max(...rs.map(r=>r.y+r.h)))/2);}};
    $('bring-front').onclick=()=>reorderLayers(selectionNodes(),'front');$('send-back').onclick=()=>reorderLayers(selectionNodes(),'back');
    $('bring-forward').onclick=()=>reorderLayers(selectionNodes(),'up');$('send-backward').onclick=()=>reorderLayers(selectionNodes(),'down');
    $('duplicate-element').onclick=duplicate;$('delete-element').onclick=deleteElement;
    document.querySelectorAll('[data-table]').forEach(b=>b.onclick=()=>tableCommand(b.dataset.table));
    $('table-col-width').onchange=()=>{const t=selectedTable();if(t)mutate(()=>{const c=cell||t.rows[0].cells[0],i=c.cellIndex,w=clamp(Number($('table-col-width').value)||30,30,1400),sx=rect(t).w/t.offsetWidth,change=w-rect(c).w/sx;t.style.tableLayout='fixed';t.style.width=Math.max(30,t.offsetWidth+change)+'px';[...t.rows].forEach(r=>{if(r.cells[i])r.cells[i].style.width=w+'px';});});};
    $('table-row-height').onchange=()=>{const t=selectedTable();if(t)mutate(()=>{const c=cell||t.rows[0].cells[0];c.parentElement.style.height=clamp(Number($('table-row-height').value)||20,20,500)+'px';});};
    $('table-cell-padding').onchange=()=>{const t=selectedTable();if(t)mutate(()=>t.querySelectorAll('th,td').forEach(c=>c.style.padding=clamp(Number($('table-cell-padding').value)||0,0,80)+'px'));};
    for(const id of ['border-width','border-color'])$(id).onchange=()=>{const t=selectedTable();if(t)mutate(()=>t.querySelectorAll('td,th').forEach(e=>e.style.border=`${clamp(Number($('border-width').value),0,8)}px solid ${$('border-color').value}`));};
    $('speaker-notes').onfocus=beginInput;$('speaker-notes').oninput=()=>{let e=active().querySelector('.speaker-note');if(!e){e=doc.createElement('p');e.className='speaker-note';active().append(e);}writeNote(e,$('speaker-notes').value);changed();};$('speaker-notes').onblur=flushInput;
    $('deck-name').onfocus=beginInput;$('deck-name').oninput=()=>changed();$('deck-name').onblur=flushInput;
    document.querySelectorAll('[data-background]').forEach(b=>b.onclick=()=>mutate(()=>{active().style.backgroundColor=b.dataset.background;}));$('slide-bg').onchange=()=>mutate(()=>{active().style.backgroundColor=$('slide-bg').value;});
    $('zoom').onchange=fit;$('zoom-in').onclick=()=>{const levels=[.5,.75,1];$('zoom').value=String(levels.find(x=>x>scale+.01)||1);fit();};$('zoom-out').onclick=()=>{const levels=[1,.75,.5];$('zoom').value=String(levels.find(x=>x<scale-.01)||.5);fit();};
    $('move-handle').onpointerdown=e=>beginDrag(e,'move');document.querySelectorAll('[data-handle]').forEach(b=>b.onpointerdown=e=>beginDrag(e,'resize',b.dataset.handle));
    document.addEventListener('pointermove',pointerMove);document.addEventListener('pointerup',pointerEnd);document.addEventListener('pointercancel',pointerEnd);
    $('save-project').onclick=saveProject;$('open').onclick=showOpen;
    $('open-html-choice').onclick=pickOpenFile;$('open-folder-choice').onclick=()=>$('folder-files').click();
    $('html-file').onchange=e=>{openFile(e.target.files[0]);e.target.value='';};
    $('folder-files').onchange=e=>{if(e.target.files.length)prepareImport(e.target.files);e.target.value='';};
    $('project-file').onchange=e=>{openFile(e.target.files[0]);e.target.value='';}; // 화면 버튼은 없고 자동 검사가 쓰는 입력
    $('import-deck').onchange=inspectImport;
    const isFileDrag=e=>[...(e.dataTransfer?.types||[])].includes('Files');
    const onDragOver=e=>{if(!isFileDrag(e))return;e.preventDefault();e.dataTransfer.dropEffect='copy';document.body.classList.add('file-dragging');};
    const onDragLeave=e=>{if(!e.relatedTarget)document.body.classList.remove('file-dragging');};
    const onDrop=e=>{if(!isFileDrag(e))return;e.preventDefault();document.body.classList.remove('file-dragging');openDropped(e.dataTransfer);};
    for(const target of [document,doc]){target.addEventListener('dragover',onDragOver);target.addEventListener('dragleave',onDragLeave);target.addEventListener('drop',onDrop);}
    $('open-close').onclick=()=>{$('open-dialog').close();};
    $('open-dialog').addEventListener('close',()=>{if($('open-dialog').open)return; /* 닫힘 알림이 늦게 와도 그사이 다시 연 가져오기는 지우지 않는다 */importGeneration++;pendingImport=null;importFiles=[];$('import-panel').hidden=true;$('import-deck').replaceChildren();});
    $('import-apply').onclick=()=>{if(!pendingImport)return;const data=pendingImport;finishText();mutate(()=>{$('deck-name').value=data.name;setHandle(null);current=0;applyDesign(data.design);render(data.slides);});$('open-dialog').close();toast('웹슬라이드를 가져왔습니다. 수정한 뒤 편집 파일로 저장하세요.');};
    $('export-html').onclick=async()=>{if(exportBusy)return;busy(true);try{const html=await exportDocument(true);download(new Blob([html],{type:'text/html;charset=utf-8'}),safeName()+'.html');toast('이미지·글꼴이 포함된 발표용 HTML을 내려받았습니다.');}catch(e){toast(e.message+' 저장하지 못했습니다.');}finally{busy(false);}};
    $('present').onclick=async()=>{finishText();saveDraft();const win=window.open('','_blank');if(!win){toast('발표 창을 열 수 없습니다. 팝업을 허용해주세요.');return;}try{win.opener=null;win.document.write(await exportDocument(false));win.document.close();}catch(e){win.close();toast(e.message);}};
    $('help-toggle').onclick=()=>$('help-dialog').showModal();$('help-close').onclick=()=>$('help-dialog').close();$('dialog-cancel').onclick=()=>$('insert-dialog').close();$('confirm-no').onclick=()=>$('confirm-dialog').close();
    $('insert-form').onsubmit=e=>{e.preventDefault();try{dialogAction(new FormData(e.target));$('insert-dialog').close();}catch(error){$('dialog-error').textContent=error.message;}};
    document.addEventListener('keydown',e=>{if(!document.querySelector('dialog[open]'))keys(e);});
    new ResizeObserver(fit).observe($('canvas-scroll'));
    addEventListener('beforeunload',e=>{finishText();saveDraft();if(!draftSaved&&!fileSavedCurrent){e.preventDefault();e.returnValue='';}});
  }
  async function init() {
    try {
      const response=await fetch(SOURCE_DECK);if(!response.ok)throw Error('교육자료를 불러오지 못했습니다.');const source=await response.text();
      const parsed=new DOMParser().parseFromString(source,'text/html');
      defaultCss=css=await fetchCss('slides-v4.css')+'\n'+await fetchCss('slides-v5.css');
      const original=[...parsed.querySelectorAll('.slide')].map(e=>e.outerHTML);
      let markups=original;
      let stored=null,storedHandle=null;
      try{[stored,storedHandle]=await Promise.all([idb.get(DRAFT_KEY),idb.get(HANDLE_KEY)]);}catch{}
      try{const raw=stored||localStorage.getItem(STORAGE_KEY);if(raw){savedDraft=validateProject(JSON.parse(raw));markups=savedDraft.slides.map(sanitize);}}catch{savedDraft=null;$('save-status').textContent='임시저장 복원 불가';toast('이전 임시저장을 읽지 못했습니다. 원본 교육자료를 열었습니다.');}
      frame.onload=()=>{
        doc=frame.contentDocument;frameReady=true;
        if(savedDraft){$('deck-name').value=savedDraft.name;applyDesign(savedDraft.design);if(storedHandle?.kind==='file')fileHandle=storedHandle;}
        updateSaveButton();
        render(markups);bindCanvas();wire();saveDraft();
        $('hint').textContent=savedDraft?'이전에 수정한 내용을 복원했습니다'+(fileHandle?` · 저장하면 ‘${fileHandle.name}’에 덮어씀`:' · 더블클릭으로 글 수정'):'클릭해서 선택 · 더블클릭해서 글 수정 · 테두리로 크기 조절';
      };
      const editorStyle='html,body{width:1600px;height:900px;margin:0;overflow:hidden}#stage{position:absolute;left:0;top:0;width:1600px;height:900px;transform:none}.slide{animation:none!important}.ed-object{margin:0}.ed-text{white-space:pre-wrap}.ed-video-label{color:white;font-size:32px;padding:40px}[data-editing]{outline:2px solid #4268e5;cursor:text!important;user-select:text!important}.slide.on [data-ed-id]:hover{outline:1px dashed #8aa6e5}.slide.on{cursor:default}a,button{cursor:default}.speaker-note{display:none}'+MARKER_CSS;
      const tableCursorStyle='html[data-ed-table-cursor="col"] *{cursor:col-resize!important}html[data-ed-table-cursor="row"] *{cursor:row-resize!important}';
      frame.srcdoc=`<!doctype html><html lang="ko"><head><base href="${BASE}"><style id="deck-design">${css}</style><style>${editorStyle}${tableCursorStyle}${OBJECT_CSS}</style></head><body class="v4 v5"><main id="stage"></main></body></html>`;
    } catch(e) { $('save-status').textContent='불러오기 실패';toast(e.message+' 로컬 서버 주소로 다시 열어주세요.'); }
  }
  init();
})();
