(() => {
  'use strict';

  const D = window.SITE_DATA;
  const T = window.I18N || {};
  const html = document.documentElement;
  const body = document.body;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(pointer: fine)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };
  const raf2 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const easeInOutCubic = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const tween = (set, dur) => new Promise(res => {
    const t0 = performance.now();
    const step = now => {
      const p = Math.min(1, (now - t0) / dur);
      set(easeInOutCubic(p));
      p < 1 ? requestAnimationFrame(step) : res();
    };
    requestAnimationFrame(step);
  });
  const restartClass = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

  /* ───────── Language ───────── */
  const EN = {};
  const EXTRA = {
    en: { 'cursor.drag': 'Drag', 'cursor.view': 'Book' },
    pt: { 'cursor.drag': 'Arrastar', 'cursor.view': 'Reservar' },
    uk: { 'cursor.drag': 'Тягніть', 'cursor.view': 'Бронювати' }
  };
  $$('[data-i18n]').forEach(el => { if (!(el.dataset.i18n in EN)) EN[el.dataset.i18n] = el.textContent.trim(); });

  let lang = store.get('cba-lang') || (navigator.language || 'en').slice(0, 2).toLowerCase();
  if (lang === 'ua') lang = 'uk';
  if (!['en', 'pt', 'uk'].includes(lang)) lang = 'en';

  const t = key => (EXTRA[lang] && EXTRA[lang][key]) || (lang !== 'en' && T[lang] && T[lang][key]) || EN[key] || '';
  const pick = obj => (obj && (obj[lang] || obj.en)) || '';
  const numberFormat = () => new Intl.NumberFormat(lang === 'uk' ? 'uk-UA' : lang === 'pt' ? 'pt-PT' : 'en-GB');

  // Masked headings get an inner line so the signature rise has something to lift
  $$('.mask').forEach(h => { h.innerHTML = `<span class="mask-in">${h.innerHTML}</span>`; });

  function applyLang() {
    html.lang = lang;
    $$('[data-i18n]').forEach(el => {
      const target = el.querySelector('.mask-in') || el;
      target.textContent = t(el.dataset.i18n);
    });
    $$('.lang button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    $$('.count').forEach(c => { c.textContent = numberFormat().format(+c.dataset.to); });
    renderWorld();
    renderSuite(currentSuite, false);
    renderPlaces();
    if (island && island.setLabels) island.setLabels();
    fitFooter();
    document.title = lang === 'pt' ? 'CBA Suites Madeira · Suites de quatro estrelas sobre a baía do Funchal'
      : lang === 'uk' ? 'CBA Suites Madeira · Чотиризіркові люкси над затокою Фуншала'
      : 'CBA Suites Madeira · Four-star suites above Funchal bay';
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  }
  $$('.lang button').forEach(b => b.addEventListener('click', () => {
    if (lang === b.dataset.lang) return;
    lang = b.dataset.lang;
    store.set('cba-lang', lang);
    applyLang();
  }));

  /* ───────── Hero: Madeira through the window ───────── */
  const hero = $('.experience');
  const bgVideos = $$('.background', hero);
  const canvas = $('#portal-canvas');
  const ctx = canvas.getContext('2d');
  const portal = $('#portal');
  const worldList = $('#world-list');
  const titleEl = $('#world-title');
  const factsEl = $('#facts');
  const nextNameEl = $('#next-name');
  const posters = bgVideos.map(v => { const i = new Image(); i.src = v.getAttribute('poster'); return i; });
  const N = D.worlds.length;
  const nextOf = i => (i + 1) % N;

  let current = 0;
  let target = 1;
  let rotX = 0, rotY = 0, tX = 0, tY = 0;
  let expansion = 0, maskScale = 0, busy = false, chromeOn = false, heroVisible = true;
  let windowRadius = 90;

  worldList.innerHTML = D.worlds.map((w, i) => `<li><button type="button" data-i="${i}"></button></li>`).join('');
  worldList.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) travel(+b.dataset.i);
  });

  function renderWorld() {
    const w = D.worlds[current];
    const nx = D.worlds[target];
    hero.dataset.world = current;
    titleEl.innerHTML = `<span>${pick(w.title)}</span>`;
    factsEl.innerHTML = pick(w.facts).map(([k, v]) => `<div class="fact"><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    nextNameEl.textContent = pick(nx.title);
    portal.setAttribute('aria-label', `${t('cursor.travel')}: ${pick(nx.title)}`);
    $$('button', worldList).forEach((b, i) => {
      b.textContent = pick(D.worlds[i].title);
      b.setAttribute('aria-current', String(i === current));
    });
    fitTitle();
  }

  function fitTitle() {
    const span = titleEl.firstElementChild;
    if (!span) return;
    titleEl.style.fontSize = '100px';
    const w = span.offsetWidth;
    const avail = titleEl.clientWidth;
    const phone = innerWidth <= 760;
    const cap = hero.clientHeight * (phone ? .13 : .27) / .8;
    const size = Math.max(40, Math.min(100 * avail / w, cap));
    titleEl.style.fontSize = size + 'px';
    hero.style.setProperty('--title-h', Math.round(size * .8) + 'px');
  }

  function resizeCanvas() {
    const d = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(hero.clientWidth * d);
    canvas.height = Math.round(hero.clientHeight * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    windowRadius = parseFloat(getComputedStyle(portal).borderTopLeftRadius) || 90;
  }

  function mediaFor(i) {
    const v = bgVideos[i];
    return v.readyState >= 2 ? v : posters[i];
  }

  function drawCover(c, m, W, H) {
    const mw = m.videoWidth || m.naturalWidth;
    const mh = m.videoHeight || m.naturalHeight;
    if (!mw || !mh) return;
    const s = Math.max(W / mw, H / mh);
    const w = mw * s, h = mh * s;
    c.drawImage(m, (W - w) / 2, (H - h) / 2, w, h);
  }

  // the same scrims as .shade in the CSS, faded in while the window opens so the hand-over is seamless
  function drawShade(c, W, H, k) {
    const band = (x0, y0, x1, y1, a) => {
      const g = c.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, `rgba(5,7,11,${a * k})`);
      g.addColorStop(1, 'rgba(5,7,11,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
    };
    c.fillStyle = `rgba(5,7,11,${.14 * k})`;
    c.fillRect(0, 0, W, H);
    band(0, 0, 0, H * .22, .55);
    band(0, H, 0, H * .46, .9);
    band(W, 0, W * .56, 0, .62);
    band(0, 0, W * .24, 0, .45);
  }

  function roundedPoints(w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    const pts = [];
    const arcs = [
      [w / 2 - r, -h / 2 + r, -Math.PI / 2, 0],
      [w / 2 - r, h / 2 - r, 0, Math.PI / 2],
      [-w / 2 + r, h / 2 - r, Math.PI / 2, Math.PI],
      [-w / 2 + r, -h / 2 + r, Math.PI, Math.PI * 1.5]
    ];
    for (const [ax, ay, a0, a1] of arcs) {
      for (let k = 0; k <= 10; k++) {
        const a = a0 + (a1 - a0) * k / 10;
        pts.push([ax + Math.cos(a) * r, ay + Math.sin(a) * r]);
      }
    }
    return pts;
  }

  function project(x, y, rx, ry, cx, cy) {
    const ax = rx * Math.PI / 180, ay = ry * Math.PI / 180;
    const xx = x * Math.cos(ay), yy = y * Math.cos(ax);
    const z = x * Math.sin(ay) - y * Math.sin(ax);
    const p = 850 / (850 + z);
    return [cx + xx * p, cy + yy * p];
  }

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(40, now - last);
    last = now;
    if (!heroVisible) return;
    const k = Math.min(1, dt * .009);
    rotX += (tX - rotX) * k;
    rotY += (tY - rotY) * k;

    const W = hero.clientWidth, H = hero.clientHeight;
    ctx.clearRect(0, 0, W, H);
    if (!chromeOn && expansion === 0) return;

    const hr = hero.getBoundingClientRect();
    const r = portal.getBoundingClientRect();
    const e = expansion;
    const rcx = r.left - hr.left + r.width / 2;
    const rcy = r.top - hr.top + r.height / 2;
    const cx = rcx + (W / 2 - rcx) * e;
    const cy = rcy + (H / 2 - rcy) * e;
    const s = e ? 1 : maskScale;
    const w = (r.width + (W - r.width) * e) * s;
    const h = (r.height + (H - r.height) * e) * s;
    const rad = windowRadius * (1 - e) * s;
    const rx = rotX * (1 - e), ry = rotY * (1 - e);
    if (w < 1 || h < 1) return;

    const pts = roundedPoints(w, h, rad);
    ctx.save();
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      const [px, py] = project(x, y, rx, ry, cx, cy);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = '#030303';
    ctx.fillRect(0, 0, W, H);
    drawCover(ctx, mediaFor(target), W, H);
    if (e > 0) drawShade(ctx, W, H, e);
    ctx.restore();
  }

  function syncPlayback() {
    bgVideos.forEach((v, i) => {
      const on = heroVisible && (i === current || i === target);
      if (on) {
        if (v.preload !== 'auto') v.preload = 'auto';
        const p = v.play();
        if (p && p.catch) p.catch(() => {});
      } else if (!v.paused) {
        v.pause();
      }
    });
  }

  function whenReady(v, timeout) {
    if (v.readyState >= 3) return Promise.resolve();
    return new Promise(res => {
      const done = () => { clearTimeout(timer); v.removeEventListener('canplay', done); v.removeEventListener('error', done); res(); };
      const timer = setTimeout(done, timeout);
      v.addEventListener('canplay', done);
      v.addEventListener('error', done);
    });
  }

  function revealMask() {
    restartClass(hero, 'mask-revealing');
    maskScale = 0;
    return tween(v => { maskScale = v; }, reduced ? 10 : 1050);
  }
  function revealContent() {
    hero.classList.add('content-on');
    restartClass(hero, 'content-revealing');
  }

  async function travel(to) {
    if (busy || !chromeOn) return;
    if (to === undefined) to = target;
    if (to === current) return;
    busy = true;
    tX = tY = 0;
    try {
      if (to !== target) {
        target = to;
        nextNameEl.textContent = pick(D.worlds[target].title);
      }
      syncPlayback();
      await whenReady(bgVideos[to], 1600);
      hero.classList.remove('content-revealing', 'mask-revealing');
      hero.classList.add('is-transitioning');
      await tween(v => { expansion = v; }, reduced ? 10 : 1100);

      hero.classList.add('is-committing');
      bgVideos.forEach((v, i) => v.classList.toggle('is-visible', i === to));
      current = to;
      target = nextOf(current);
      renderWorld();
      restartClass(worldList, 'is-switching');
      await raf2();
      expansion = 0;
      maskScale = 0;
      hero.classList.remove('is-transitioning', 'is-committing');
      syncPlayback();
      const m = revealMask();
      setTimeout(revealContent, 100);
      await m;
    } catch (err) {
      expansion = 0;
      maskScale = 1;
      hero.classList.remove('is-transitioning', 'is-committing');
    }
    busy = false;
  }

  portal.addEventListener('click', () => travel());
  hero.addEventListener('pointermove', e => {
    if (busy || e.pointerType !== 'mouse') return;
    tY = (e.clientX / innerWidth - .5) * 37.4;
    tX = (e.clientY / innerHeight - .5) * -33;
  });
  hero.addEventListener('pointerleave', () => { tX = tY = 0; });

  new IntersectionObserver(([entry]) => {
    heroVisible = entry.isIntersecting;
    if (chromeOn) syncPlayback();
  }).observe(hero);

  /* ───────── Preloader ───────── */
  const brand = $('#brand');
  function runPreloader() {
    const pre = $('#preloader');
    const v = $('#preloader-video');
    const val = $('#preloader-value');
    const count = $('.preloader-count');
    body.classList.add('is-preloading');
    if (window.__lenis) window.__lenis.stop();

    const br = brand.getBoundingClientRect();
    const dx = innerWidth / 2 - (br.left + br.width / 2);
    const dy = innerHeight / 2 - (br.top + br.height / 2) - 12;
    brand.style.transform = `translate(${dx}px, ${dy}px) scale(${innerWidth < 760 ? 1.6 : 2.2})`;

    const cap = reduced ? 500 : 4600;
    const t0 = performance.now();
    let done = false;

    const finish = instant => {
      if (done) return;
      done = true;
      if (instant === true) { pre.style.transition = 'none'; count.style.visibility = 'hidden'; }
      val.textContent = '100';
      count.classList.add('is-leaving');
      brand.style.transition = 'transform 1.9s cubic-bezier(.16,1,.3,1)';
      brand.style.transform = '';
      pre.classList.add('is-done');
      body.classList.remove('is-preloading');
      body.classList.add('preload-complete');
      if (window.__lenis) window.__lenis.start();
      startExperience();
      setTimeout(() => { v.pause(); v.removeAttribute('src'); v.load(); pre.remove(); brand.style.transition = ''; }, instant === true ? 0 : 2100);
    };

    const tick = now => {
      if (done) return;
      const byTime = Math.min(1, (now - t0) / cap);
      const byVideo = v.duration ? v.currentTime / v.duration : 0;
      const p = Math.max(byTime, byVideo);
      val.textContent = String(Math.min(99, Math.round(p * 100)));
      if (byTime >= 1) return finish();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    const begin = () => {
      if (v.duration) v.playbackRate = Math.max(.25, Math.min(4, v.duration / 3));
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
    };
    v.addEventListener('ended', finish);
    if (v.readyState >= 1) begin(); else v.addEventListener('loadedmetadata', begin, { once: true });
    // someone arriving mid-page (a restored scroll, a link to a section) or already scrolling skips the intro
    if (reduced) setTimeout(finish, 400);
    if (scrollY > 10 || (location.hash && location.hash.length > 1)) setTimeout(() => finish(true), 60);
    addEventListener('scroll', () => { if (scrollY > 10) finish(true); }, { passive: true });
  }

  async function startExperience() {
    syncPlayback();
    await whenReady(bgVideos[target], 1500);
    chromeOn = true;
    body.classList.add('intro-ready');
    hero.classList.add('portal-ready');
    revealMask();
    setTimeout(revealContent, 450);
  }

  /* ───────── Cursor ───────── */
  if (finePointer && !reduced) {
    html.classList.add('has-cursor');
    const cur = $('.cursor');
    const ring = $('.cursor-ring', cur);
    const dot = $('.cursor-dot', cur);
    const label = $('.cursor-label', cur);
    let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
    addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      mx = e.clientX; my = e.clientY;
      cur.classList.add('is-visible');
    }, { passive: true });
    document.addEventListener('mouseleave', () => cur.classList.remove('is-visible'));
    // position rides on `translate`, so the CSS `transform: scale()` states never fight it
    const loop = () => {
      rx += (mx - rx) * .2; ry += (my - ry) * .2;
      dot.style.translate = `${mx}px ${my}px`;
      ring.style.translate = `${rx}px ${ry}px`;
      label.style.translate = `${rx}px ${ry}px`;
      requestAnimationFrame(loop);
    };
    loop();
    const setState = (el) => {
      const mode = el && el.closest('[data-cursor]') ? el.closest('[data-cursor]').dataset.cursor : null;
      cur.classList.toggle('is-enter', !!mode);
      if (mode) label.textContent = t('cursor.' + mode);
      cur.classList.toggle('is-link', !mode && !!(el && el.closest('a, button')));
    };
    document.addEventListener('pointerover', e => setState(e.target));
  }
  portal.dataset.cursor = 'travel';
  $('#island-canvas').dataset.cursor = 'drag';
  $('#suite-window').dataset.cursor = 'view';

  /* ───────── Header ───────── */
  const header = $('#header');
  let lastY = scrollY;
  function onScroll() {
    const y = scrollY;
    header.classList.toggle('is-solid', y > hero.offsetHeight - 90);
    const goingDown = y > lastY + 4;
    const goingUp = y < lastY - 4;
    if (goingDown && y > hero.offsetHeight * .6) header.classList.add('is-hidden');
    if (goingUp || y < 80) header.classList.remove('is-hidden');
    lastY = y;
  }
  addEventListener('scroll', onScroll, { passive: true });

  /* ───────── Suites ───────── */
  const picker = $('#suite-picker');
  const suiteWindow = $('#suite-window');
  const detailImg = $('#suite-detail-photo img');
  const suiteInfo = $('#suite-info');
  let currentSuite = 0;
  picker.innerHTML = D.suites.map((s, i) => `<button class="suite-tab" type="button" role="tab" aria-controls="suite-info" data-i="${i}"></button>`).join('');
  const tabs = $$('.suite-tab', picker);

  function renderSuite(i, animate) {
    const s = D.suites[i];
    currentSuite = i;
    tabs.forEach((b, k) => {
      b.textContent = pick(D.suites[k].name);
      b.setAttribute('aria-selected', String(k === i));
      b.tabIndex = k === i ? 0 : -1;
    });
    $('#suite-name').textContent = pick(s.name);
    $('#suite-text').textContent = pick(s.text);
    $('#suite-beds').textContent = pick(s.beds);
    $('#suite-space').textContent = pick(s.space);
    $('#suite-features').textContent = pick(D.suiteFeatures);
    const alt = pick(s.name);
    if (!animate) {
      const img = $('.suite-img:last-child', suiteWindow);
      if (img && !img.src.includes(s.img)) img.src = `assets/img/${s.img}-1600.webp`;
      if (img) img.alt = alt;
      return;
    }
    const img = new Image();
    img.className = 'suite-img';
    img.alt = alt;
    img.width = 1280; img.height = 851;
    img.src = `assets/img/${s.img}-1600.webp`;
    const show = () => {
      if (currentSuite !== i) return;
      if (!reduced) img.classList.add('is-entering');
      suiteWindow.appendChild(img);
      const olds = $$('.suite-img', suiteWindow).filter(x => x !== img);
      setTimeout(() => olds.forEach(o => o.remove()), reduced ? 0 : 1150);
    };
    img.decode ? img.decode().then(show, show) : (img.onload = show);
    detailImg.style.opacity = '0';
    setTimeout(() => { detailImg.src = `assets/img/${s.img2}-800.webp`; detailImg.alt = ''; detailImg.onload = () => { detailImg.style.opacity = '1'; }; }, 250);
    if (!reduced) restartClass(suiteInfo, 'is-swapping');
  }
  picker.addEventListener('click', e => {
    const b = e.target.closest('.suite-tab');
    if (b && +b.dataset.i !== currentSuite) renderSuite(+b.dataset.i, true);
  });
  picker.addEventListener('keydown', e => {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    const i = (currentSuite + dir + D.suites.length) % D.suites.length;
    renderSuite(i, true);
    tabs[i].focus();
  });
  if (finePointer && !reduced) {
    const stage = $('#suite-stage');
    stage.addEventListener('pointermove', e => {
      const r = stage.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5;
      const y = (e.clientY - r.top) / r.height - .5;
      suiteWindow.style.transform = `rotateY(${x * 9}deg) rotateX(${-y * 7}deg)`;
    });
    stage.addEventListener('pointerleave', () => { suiteWindow.style.transform = ''; });
  }
  suiteWindow.addEventListener('click', () => window.open('https://www.booking.com/hotel/pt/cba-suits.html', '_blank', 'noopener'));
  // warm the cache so switching suites never waits on the network
  const warm = () => D.suites.forEach(s => { const i = new Image(); i.src = `assets/img/${s.img}-1600.webp`; });
  'requestIdleCallback' in window ? requestIdleCallback(warm, { timeout: 4000 }) : setTimeout(warm, 3000);

  /* ───────── Island: list, card and the 3D relief ───────── */
  const placeList = $('#place-list');
  const placeCard = $('#place-card');
  let currentPlace = 'arieiro';
  let island = null;

  function renderPlaces() {
    placeList.innerHTML = D.places.map(p =>
      `<li><button type="button" data-id="${p.id}" aria-pressed="${p.id === currentPlace}">${pick(p.name)} <em>${pick(p.time)}</em></button></li>`
    ).join('');
    fillCard(currentPlace, false);
  }
  function fillCard(id, animate) {
    const p = D.places.find(x => x.id === id);
    if (!p) return;
    $('#place-time').textContent = pick(p.time);
    $('.place-from', placeCard).textContent = p.walk ? pick(D.walkNote) : t('island.from');
    $('#place-name').textContent = pick(p.name);
    $('#place-text').textContent = pick(p.text);
    const img = $('#place-img');
    const src = `assets/img/${p.img}-900.webp`;
    if (!img.src.endsWith(src)) { img.src = src; img.alt = pick(p.name); }
    if (animate && !reduced) restartClass(placeCard, 'is-swapping');
  }
  function selectPlace(id) {
    currentPlace = id;
    $$('button', placeList).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
    fillCard(id, true);
    if (island) island.focus(id);
  }
  placeList.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) selectPlace(b.dataset.id);
  });

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  const islandSection = $('#island');
  const io = new IntersectionObserver(async ([entry]) => {
    if (!entry.isIntersecting) return;
    io.disconnect();
    try {
      if (!window.THREE) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
      await loadScript('assets/js/height-data.js');
      await loadScript('assets/js/island.js');
      island = await window.initIsland({
        canvas: $('#island-canvas'),
        stage: $('#island-stage'),
        markers: $('#island-markers'),
        hint: $('.island-hint'),
        data: D,
        pick: o => pick(o),
        reduced,
        onSelect: id => selectPlace(id),
        initial: currentPlace
      });
      if (!island) islandSection.classList.add('no-webgl');
    } catch (err) {
      islandSection.classList.add('no-webgl');
    }
  }, { rootMargin: '700px 0px' });
  io.observe(islandSection);

  /* ───────── Footer wordmark ───────── */
  const footWord = $('#foot-word');
  function fitFooter() {
    const word = footWord.firstElementChild;
    footWord.style.fontSize = '100px';
    const w = word.getBoundingClientRect().width;
    const avail = footWord.clientWidth;
    if (w) footWord.style.fontSize = (100 * avail / w * .99) + 'px';
  }

  /* ───────── Scroll choreography ───────── */
  function setupScroll() {
    const hasGsap = window.gsap && window.ScrollTrigger;
    let lenis = null;
    if (hasGsap) gsap.registerPlugin(ScrollTrigger);
    if (window.Lenis && !reduced) {
      lenis = new Lenis({ lerp: .1, smoothWheel: true });
      window.__lenis = lenis;
      if (hasGsap) {
        lenis.on('scroll', ScrollTrigger.update);
        gsap.ticker.add(time => lenis.raf(time * 1000));
        gsap.ticker.lagSmoothing(0);
      } else {
        const loop = time => { lenis.raf(time); requestAnimationFrame(loop); };
        requestAnimationFrame(loop);
      }
      if (body.classList.contains('is-preloading')) lenis.stop();
    }
    $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
      const id = a.getAttribute('href');
      const el = id.length > 1 ? $(id) : null;
      if (!el) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(el, { duration: 1.6 });
      else el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
    }));
    if (!hasGsap || reduced) return;

    // signature: headings rise from behind their own baseline
    $$('.mask .mask-in').forEach(line => {
      gsap.fromTo(line, { yPercent: 110 }, {
        yPercent: 0, duration: 1.1, ease: 'expo.out',
        scrollTrigger: { trigger: line.parentElement, start: 'top 86%', once: true }
      });
    });

    // parts of every section arrive in order
    const reveals = $$('[data-reveal]');
    gsap.set(reveals, { autoAlpha: 0, y: 26 });
    ScrollTrigger.batch(reveals, {
      start: 'top 90%',
      once: true,
      onEnter: els => gsap.to(els, { autoAlpha: 1, y: 0, duration: .9, ease: 'power3.out', stagger: .08, overwrite: true })
    });

    // pictures open from the bottom edge
    const wipe = (fig, extra = {}) => {
      const img = fig.querySelector('img');
      gsap.fromTo(fig, { clipPath: 'inset(100% 0% 0% 0%)' }, {
        clipPath: 'inset(0% 0% 0% 0%)', duration: 1.2, ease: 'expo.out',
        scrollTrigger: Object.assign({ trigger: fig, start: 'top 88%', once: true }, extra)
      });
      if (img) gsap.fromTo(img, { scale: 1.18 }, {
        scale: 1, duration: 1.6, ease: 'expo.out',
        scrollTrigger: Object.assign({ trigger: fig, start: 'top 88%', once: true }, extra)
      });
    };
    $$('[data-wipe]').filter(f => !f.closest('.exp-track')).forEach(f => wipe(f));

    // hero title drifts up as the page leaves the first screen
    gsap.to(titleEl, { yPercent: -40, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });

    // experiences: a horizontal walk on wide screens, a stack on phones
    const track = $('#exp-track');
    const mm = gsap.matchMedia();
    mm.add('(min-width: 1101px)', () => {
      // the hotel's own pictures drift past the statement at different speeds
      gsap.to('.ip1', { yPercent: -30, ease: 'none', scrollTrigger: { trigger: '.intro', start: 'top bottom', end: 'bottom top', scrub: true } });
      gsap.to('.ip2', { yPercent: -14, ease: 'none', scrollTrigger: { trigger: '.intro', start: 'top bottom', end: 'bottom top', scrub: true } });
      gsap.to('.ip3', { yPercent: -45, ease: 'none', scrollTrigger: { trigger: '.intro', start: 'top bottom', end: 'bottom top', scrub: true } });
      gsap.to('.ip4', { yPercent: -22, ease: 'none', scrollTrigger: { trigger: '.intro', start: 'top bottom', end: 'bottom top', scrub: true } });
    });
    mm.add('(max-width: 1100px)', () => {
      $$('.intro-photo').forEach(f => wipe(f));
    });
    mm.add('(min-width: 761px)', () => {
      const dist = () => track.scrollWidth - innerWidth;
      const move = gsap.to(track, {
        x: () => -dist(), ease: 'none',
        scrollTrigger: { trigger: '.exp-pin', start: 'top top', end: () => '+=' + dist(), pin: true, scrub: 1, invalidateOnRefresh: true, anticipatePin: 1 }
      });
      $$('.exp-card figure', track).forEach(f => wipe(f, { trigger: f, containerAnimation: move, start: 'left 96%' }));
    });
    mm.add('(max-width: 760px)', () => {
      $$('.exp-card figure', track).forEach(f => wipe(f));
    });

    // the photograph behind the big figure moves slower than the page
    gsap.fromTo('.stats-img', { yPercent: -6 }, { yPercent: 6, ease: 'none', scrollTrigger: { trigger: '.stats-frame', start: 'top bottom', end: 'bottom top', scrub: true } });

    // figures count up once
    $$('.count').forEach(c => {
      const to = +c.dataset.to;
      const o = { v: 0 };
      gsap.to(o, {
        v: to, duration: 2, ease: 'power2.out',
        scrollTrigger: { trigger: c, start: 'top 92%', once: true },
        onUpdate: () => { c.textContent = numberFormat().format(Math.round(o.v)); }
      });
    });

    // the guests' portrait drifts against the quote
    gsap.fromTo('.guest-portrait img', { yPercent: -5, scale: 1.1 }, { yPercent: 5, scale: 1.1, ease: 'none', scrollTrigger: { trigger: '.guests', start: 'top bottom', end: 'bottom top', scrub: true } });
    gsap.fromTo('.stay-photo > img', { scale: 1.12 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: '.stay-photo', start: 'top bottom', end: 'center center', scrub: true } });

    // marquee runs on its own and leans into the scroll direction
    const mq = gsap.to('#marquee-track', { xPercent: -50, duration: 38, ease: 'none', repeat: -1 });
    ScrollTrigger.create({
      trigger: '.marquee', start: 'top bottom', end: 'bottom top',
      onUpdate: self => { gsap.to(mq, { timeScale: self.direction * (1 + Math.min(4, Math.abs(self.getVelocity()) / 600)), duration: .3, overwrite: true }); }
    });
  }

  /* ───────── Boot ───────── */
  function boot() {
    resizeCanvas();
    applyLang();
    bgVideos.forEach(v => { v.pause(); v.currentTime = 0; });
    requestAnimationFrame(frame);
    setupScroll();
    runPreloader();
    const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    fontsReady.then(() => { fitTitle(); fitFooter(); if (window.ScrollTrigger) ScrollTrigger.refresh(); });
    let rt;
    addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => { resizeCanvas(); fitTitle(); fitFooter(); }, 120);
    });
  }
  boot();
})();
