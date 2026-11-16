(() => {
  const slides = [...document.querySelectorAll('.slide')];
  const stage = document.querySelector('#stage');
  const notes = document.querySelector('#notes');
  const previous = document.querySelector('#previous');
  const next = document.querySelector('#next');
  const moved={5:18,8:17,11:25,14:24,16:27,23:39,26:36};
  document.querySelectorAll('a[href^="#"]').forEach(a=>{const n=a.getAttribute('href').slice(1);if(moved[n])a.href=`#${moved[n]}`;});
  slides.forEach((slide,i)=>{slide.setAttribute('aria-label',`${i+1}번 슬라이드`);const page=slide.querySelector('.pageno');if(page)page.textContent=`${String(i+1).padStart(2,'0')} / ${slides.length}`;});
  let current = 0;
  function stopMedia(slide) {
    slide.querySelectorAll('video').forEach(video => video.pause());
    slide.querySelectorAll('.video-stage iframe').forEach(frame => frame.remove());
    slide.querySelectorAll('.video-stage').forEach(stage => {
      stage.classList.remove('playing');
      stage.querySelector('.video-load').disabled = false;
      stage.querySelector('.media-status').textContent = '';
    });
  }
  function fit() { const height = document.querySelector('#controls').offsetHeight + 12; stage.style.setProperty('--controls-height', `${height}px`); stage.style.setProperty('--scale', Math.max(.05, Math.min((innerWidth - 24) / 1600, (innerHeight - height - 24) / 900))); }
  function show(index) {
    const nextIndex = Math.min(slides.length - 1, Math.max(0, Number.isFinite(index) ? index : 0));
    if (current !== nextIndex) stopMedia(slides[current]);
    current = nextIndex;
    slides.forEach((slide, i) => { slide.classList.toggle('on', i === current); slide.setAttribute('aria-hidden', String(i !== current)); });
    document.querySelector('#count').textContent = `${current + 1} / ${slides.length}`;
    document.querySelector('#progress').style.width = `${(current + 1) / slides.length * 100}%`;
    document.querySelector('#note-body').textContent = slides[current].querySelector('.speaker-note').textContent;
    previous.disabled = current === 0; next.disabled = current === slides.length - 1;
    history.replaceState(null, '', `#${current + 1}`);
  }
  function fromHash() { show(Number(location.hash.slice(1)) - 1); }
  function toggleNotes() { notes.hidden = !notes.hidden; document.querySelector('#note-toggle').setAttribute('aria-expanded', String(!notes.hidden)); }
  async function fullscreen() { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { document.querySelector('#count').textContent = '전체화면 불가 · 브라우저 F11 사용'; } }
  previous.addEventListener('click', () => show(current - 1));
  next.addEventListener('click', () => show(current + 1));
  document.querySelector('#note-toggle').addEventListener('click', toggleNotes);
  document.querySelector('#note-close').addEventListener('click', toggleNotes);
  document.querySelector('#fullscreen').addEventListener('click', fullscreen);
  document.querySelector('#print').addEventListener('click', () => window.print());
  addEventListener('resize', fit); addEventListener('hashchange', fromHash);
  addEventListener('keydown', event => {
    if (event.target.closest('input,textarea,select,video,iframe') || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); show(current + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); show(current - 1); }
    if (event.key === 'Home') { event.preventDefault(); show(0); }
    if (event.key === 'End') { event.preventDefault(); show(slides.length - 1); }
    if (event.key.toLowerCase() === 'n') toggleNotes();
    if (event.key.toLowerCase() === 'f') fullscreen();
    if (event.key === 'Escape' && !notes.hidden) toggleNotes();
  });
  document.querySelectorAll('.video-stage').forEach(stage => {
    const button = stage.querySelector('.video-load');
    const status = stage.querySelector('.media-status');
    button.addEventListener('click', () => {
      status.textContent = '영상 불러오는 중';
      button.disabled = true;
      if (stage.dataset.kind === 'iframe') {
        const frame = document.createElement('iframe');
        frame.title = `${stage.dataset.title} 원본 영상`;
        frame.allow = 'autoplay; fullscreen; picture-in-picture';
        frame.allowFullscreen = true;
        frame.referrerPolicy = 'strict-origin-when-cross-origin';
        frame.src = stage.dataset.src;
        if (frame.src.includes('instagram.com')) frame.className = 'instagram-frame';
        stage.append(frame); stage.classList.add('playing');
        status.textContent = '재생이 막히면 오른쪽 원본 영상으로 열기';
        return;
      }
      let video = stage.querySelector('video');
      if (!video) {
        video = document.createElement('video');
        video.controls = true; video.playsInline = true;
        video.preload = 'metadata'; video.src = stage.dataset.src;
        video.setAttribute('aria-label', `${stage.dataset.title} 시연 영상`);
        video.addEventListener('error', () => {
          stage.classList.remove('playing'); button.disabled = false;
          status.textContent = '영상을 불러오지 못했습니다. 원본 영상으로 열어주세요.';
        });
        stage.append(video);
      }
      stage.classList.add('playing');
      video.play().then(() => { status.textContent = ''; }).catch(() => {
        button.disabled = false;
        status.textContent = '재생 버튼 또는 오른쪽 원본 영상으로 열기';
      });
    });
  });
  document.querySelectorAll('.dialog-flow').forEach(flow=>flow.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{
    flow.querySelectorAll('button').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
  })));
  fit(); fromHash();
  // 브라우저 콘솔에서 slideSelfCheck(): 장수·탐색 경계·메모·필수 기능 검증.
  window.slideSelfCheck = () => {
    const saved = current;
    console.assert(slides.length === Number(document.body.dataset.slideCount || 20), '계획된 장수');
    console.assert(document.querySelectorAll('.video-case .video-stage[data-src]').length === Number(document.body.dataset.videoCount || 8), '계획된 영상 수');
    console.assert(slides.every(s => s.querySelector('.speaker-note')?.textContent.trim()), '모든 장표의 강사메모');
    show(-1); console.assert(current === 0 && previous.disabled, '처음 탐색 경계');
    show(100); console.assert(current === slides.length - 1 && next.disabled, '마지막 탐색 경계');
    show(saved); return { slides: slides.length, notes: slides.filter(s => s.querySelector('.speaker-note')).length };
  };
})();
