/* 웹슬라이드 HTML 입력: section.slide 장표를 가진 덱이면 디자인 버전과 관계없이 가져온다. 원본 스크립트는 실행하지 않는다. */
(() => {
  'use strict';
  const LIMIT = 64 * 1024 * 1024;
  const LOCAL = 'https://slide-files.invalid/';
  const imageData = /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i;
  const videoData = /^data:video\/(webm|mp4);base64,[a-z0-9+/=\s]+$/i;
  const BODY_CLASS = /^(?:[A-Za-z_][\w-]*(?: [A-Za-z_][\w-]*)*)?$/;
  const SHELL_MARK = '<!--slide-studio:slides-->';
  const fontData = /^data:(font\/[\w.+-]+|application\/(font-woff|octet-stream|x-font-ttf));base64,[a-z0-9+/=\s]+$/i;
  function safeCss(text) {
    if (typeof text !== 'string' || text.length > LIMIT || /[\\<]|@import|@namespace|expression\s*\(|behavior\s*:|-moz-binding|image-set\s*\(/i.test(text)) throw Error('지원하지 않는 디자인 코드가 있습니다. 현재 편집실에서 만든 HTML을 선택해주세요.');
    for (const m of text.matchAll(/url\(\s*['"]?([^'"\)]+)['"]?\s*\)/gi)) {
      const value = m[1].trim();
      if (imageData.test(value) || fontData.test(value)) continue;
      const url = new URL(value, location.href);
      if (url.origin !== location.origin || !['http:', 'https:'].includes(url.protocol)) throw Error('이미지·글꼴을 포함한 HTML 또는 원본 폴더를 선택해주세요.');
    }
    return text;
  }
  function validateDesign(design) {
    if (!design) return null; // 이전 편집 파일과 호환
    if (typeof design.bodyClass !== 'string' || design.bodyClass.length > 200 || !BODY_CLASS.test(design.bodyClass)) throw Error('지원하지 않는 슬라이드 디자인입니다.');
    const out={css:safeCss(design.css), bodyClass:design.bodyClass};
    // 원래 덱의 바깥 틀(넘기기 버튼·스크립트). 편집 중에는 실행하지 않고 HTML로 저장할 때만 다시 붙인다.
    if (design.shell !== undefined) {
      if (typeof design.shell !== 'string' || design.shell.length > LIMIT || design.shell.split(SHELL_MARK).length !== 2) throw Error('원래 덱의 틀 정보가 올바르지 않습니다.');
      if (typeof design.headScripts !== 'string' || design.headScripts.length > LIMIT) throw Error('원래 덱의 스크립트 정보가 올바르지 않습니다.');
      out.shell=design.shell; out.headScripts=design.headScripts;
    }
    return out;
  }
  function readData(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(Error('파일을 읽지 못했습니다: '+file.name)); r.readAsDataURL(file);
    });
  }
  async function load(file, files) {
    if (!file || file.size > LIMIT) throw Error('HTML 파일은 64MB 이하로 선택해주세요.');
    const parsed = new DOMParser().parseFromString(await file.text(), 'text/html');
    const nodes = [...parsed.querySelectorAll('section.slide')];
    if (!nodes.length || parsed.querySelectorAll('.slide').length !== nodes.length || nodes.some(n=>n.parentElement.closest('.slide'))) throw Error('장표가 <section class="slide">로 나뉜 웹슬라이드 HTML을 선택해주세요. 일반 웹페이지는 아직 지원하지 않습니다.');
    if (nodes.length > 160) throw Error('최대 160장까지 가져올 수 있습니다.');
    const base = new URL(file.webkitRelativePath || file.name, LOCAL);
    const lookup = new Map([...files].map(f=>[new URL(f.webkitRelativePath || f.name, LOCAL).href, f]));
    const missing = new Set(), cssStack = new Set(), assets = new Set(), cache = new Map();
    const absolute = (value, from) => new URL(value, from);
    const find = url => {
      const key = new URL(url); key.hash=''; key.search='';
      return lookup.get(key.href);
    };
    async function asset(value, from, kind='image') {
      const font=kind==='font', video=kind==='video';
      if (imageData.test(value) || (font && fontData.test(value)) || (video && videoData.test(value))) return value;
      const url=absolute(value,from);
      if(url.origin!==new URL(LOCAL).origin) throw Error('외부 이미지·글꼴은 파일로 포함한 뒤 가져와주세요.');
      const match=find(url);
      if(!match){missing.add(decodeURIComponent(url.pathname.slice(1)));return '';}
      const type=match.name.toLowerCase();
      if (!(font ? /\.(woff2?|ttf|otf)$/ : video ? /\.(webm|mp4)$/ : /\.(png|jpe?g|gif|webp)$/).test(type)) throw Error('지원하지 않는 이미지·글꼴·영상: '+match.name);
      if(!cache.has(match)) {
        const mime=video ? (/\.webm$/.test(type)?'video/webm':'video/mp4') : font ? (/\.woff2$/.test(type)?'font/woff2':/\.woff$/.test(type)?'font/woff':/\.ttf$/.test(type)?'font/ttf':'font/otf') : /\.png$/.test(type)?'image/png':/\.jpe?g$/.test(type)?'image/jpeg':/\.gif$/.test(type)?'image/gif':'image/webp';
        cache.set(match,readData(new File([match],match.name,{type:mime})));
      }
      assets.add(match); return cache.get(match);
    }
    async function cssFile(value, from) {
      const url=absolute(value,from);
      if(url.origin!==new URL(LOCAL).origin) throw Error('디자인 파일이 외부 주소에 있습니다. CSS와 글꼴을 포함한 폴더를 선택해주세요.');
      const match=find(url);
      if(!match){missing.add(decodeURIComponent(url.pathname.slice(1)));return '';}
      if(cssStack.has(url.href)) throw Error('디자인 파일이 서로 반복해서 연결되어 있습니다.');
      cssStack.add(url.href);
      try {return await cssText(await match.text(),url);} finally {cssStack.delete(url.href);}
    }
    async function cssText(text, from) {
      if (/[\\<]/.test(text)) throw Error('현재 지원하지 않는 디자인 코드가 있습니다.');
      for(const m of [...text.matchAll(/@import\s+(?:url\(\s*)?['"]?([^'"\s);]+)['"]?\s*\)?\s*;/gi)]) text=text.replace(m[0],await cssFile(m[1],from));
      for(const m of [...text.matchAll(/url\(\s*['"]?([^'"\)]+)['"]?\s*\)/gi)]) {
        const value=m[1].trim();
        if(imageData.test(value)||fontData.test(value))continue;
        const font=/\.(woff2?|ttf|otf)(?:[?#]|$)/i.test(value);
        text=text.replace(m[0],`url("${await asset(value,from,font?'font':'image')}")`);
      }
      return text;
    }
    const styles=[];
    for(const item of parsed.head.querySelectorAll('style,link[rel="stylesheet"]')) styles.push(item.tagName==='STYLE'?await cssText(item.textContent,base):await cssFile(item.getAttribute('href'),base));
    if(!styles.length)throw Error('디자인이 포함되지 않은 HTML입니다. CSS가 있는 원본 폴더를 선택해주세요.');
    let localLinks=0;
    for(const slide of nodes) {
      for(const img of slide.querySelectorAll('img[src]')) {img.setAttribute('src',await asset(img.getAttribute('src'),base));img.removeAttribute('srcset');}
      for(const img of slide.querySelectorAll('svg image[href]'))img.setAttribute('href',await asset(img.getAttribute('href'),base));
      for(const v of slide.querySelectorAll('video[poster]'))v.setAttribute('poster',await asset(v.getAttribute('poster'),base));
      for(const v of slide.querySelectorAll('video[src],video source[src]'))v.setAttribute('src',await asset(v.getAttribute('src'),base,'video'));
      // 발표자 노트: aside.notes 등은 원래 모양을 유지하고 편집도구 메모로도 읽히게 표시만 더한다.
      if(!slide.querySelector('.speaker-note'))for(const n of slide.querySelectorAll('aside.notes,aside.speaker-notes,.notes'))n.classList.add('speaker-note');
      for(const a of slide.querySelectorAll('a[href]')) {
        const href=a.getAttribute('href');
        if(href.startsWith('#'))continue;
        if(!/^[a-z][\w+.-]*:/i.test(href)) {a.removeAttribute('href');a.dataset.unbundledLink=href;localLinks++;}
      }
    }
    if(missing.size)throw Error('함께 필요한 파일이 없습니다: '+[...missing].slice(0,3).join(', ')+(missing.size>3?' 외 '+(missing.size-3)+'개':'')+'. HTML과 CSS·이미지·글꼴이 함께 있는 폴더를 선택해주세요.');
    // 원래 덱에 스크립트가 있으면 장표를 뺀 바깥 틀과 스크립트를 보관한다. 로컬 스크립트 파일은 내용을 넣는다.
    let shell, headScripts;
    if(parsed.querySelector('script')) {
      async function inlineScripts(root) {
        for(const s of root.querySelectorAll('script[src]')) {
          const url=absolute(s.getAttribute('src'),base);
          if(url.origin!==new URL(LOCAL).origin)continue; // 외부 라이브러리 주소는 그대로 둔다
          const match=find(url);
          if(!match){missing.add(decodeURIComponent(url.pathname.slice(1)));continue;}
          s.removeAttribute('src');s.textContent=await match.text();
        }
      }
      const body=parsed.body.cloneNode(true),inBody=[...body.querySelectorAll('section.slide')];
      inBody[0].before(parsed.createComment(SHELL_MARK.slice(4,-3)));inBody.forEach(s=>s.remove());
      for(const img of body.querySelectorAll('img[src]'))img.setAttribute('src',await asset(img.getAttribute('src'),base));
      await inlineScripts(body);
      const head=parsed.head.cloneNode(true);await inlineScripts(head);
      shell=body.innerHTML;headScripts=[...head.querySelectorAll('script')].map(s=>s.outerHTML).join('\n');
      if(missing.size)throw Error('함께 필요한 파일이 없습니다: '+[...missing].slice(0,3).join(', ')+'. HTML과 스크립트 파일이 함께 있는 폴더를 선택해주세요.');
    }
    const design={css:safeCss(styles.join('\n')),bodyClass:[...parsed.body.classList].filter(c=>/^[A-Za-z_][\w-]*$/.test(c)).join(' ').slice(0,200)};
    if(shell!==undefined){design.shell=shell;design.headScripts=headScripts;}
    const result={format:'slide-studio',version:1,name:(parsed.title||file.name.replace(/\.html?$/i,'')).slice(0,200),slides:nodes.map(n=>n.outerHTML),design};
    if(new Blob([JSON.stringify(result)]).size>LIMIT)throw Error('이미지·글꼴을 포함하면 64MB를 넘습니다. 이미지 크기를 줄여주세요.');
    return {data:result,assets:assets.size,localLinks};
  }
  window.SlideImport={load,validateDesign,safeCss,SHELL_MARK};
})();
