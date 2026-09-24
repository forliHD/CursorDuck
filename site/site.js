/* Cursor Duck website — (c) 2026 Lucas Reiser (forliHD). All rights reserved. See LICENSE. */
/* The page runs the real extension engine: the duck that follows the visitor is
 * the shipped code, not a video. Everything else here is glue: language toggle,
 * store detection, the trick bar, the model gallery, the changelog and a tiny
 * procedural beat that the media-dance feature can react to. */
(function () {
  'use strict';

  var doc = document;
  var DATA = window.CD_DATA || {};
  var META = DATA.meta || {};
  var NAMES = DATA.names || { en: {}, de: {} };
  var DE = DATA.de || { dom: {}, js: {} };

  var STORES = {
    chrome: 'https://chromewebstore.google.com/detail/hohfcnokdpmjggmicebcjalgjcfpfblg',
    firefox: 'https://addons.mozilla.org/firefox/addon/cursor-duck/',
    edge: 'https://microsoftedge.microsoft.com/addons/detail/cursor-duck/bflhnhaiomokfncloblfonafkeomfabj'
  };

  // English strings used from JavaScript; the German ones live in site/de.json ("js")
  var STR_EN = {
    addTo: 'Add to {browser}',
    storeChrome: 'Chrome Web Store',
    storeFirefox: 'Firefox Add-ons',
    storeEdge: 'Edge Add-ons',
    chrome: 'Chrome',
    firefox: 'Firefox',
    edge: 'Edge',
    safariNote: 'Safari isn’t supported yet. Chrome, Firefox and Edge are.',
    otherNote: 'Chromium browsers like Brave, Opera and Vivaldi use the Chrome Web Store.',
    nowSwimming: 'Swimming right now:',
    trick_quack: 'Quack',
    trick_flap: 'Flap',
    trick_crumbs: 'Feed',
    trick_fish: 'Fish hunt',
    trick_visitor: 'Visitor',
    trick_waddle: 'Shore leave',
    trick_disco: 'Disco',
    trick_debug: 'Debug',
    another: 'Another duck',
    soundOn: 'Sound on',
    soundOff: 'Sound off',
    beatPlay: 'Play a beat',
    beatStop: 'Stop the beat',
    latest: 'Latest',
    whatsNew: 'What’s new',
    onGithub: 'Release on GitHub',
    season_1: 'January',
    season_2: 'February',
    season_10: 'October',
    season_12: 'December',
    season_easter: 'Easter',
    themeDay: 'Switch to day',
    themeNight: 'Switch to night',
    langSwitch: 'Auf Deutsch wechseln',
    menuOpen: 'Open menu',
    menuClose: 'Close menu',
    toTop: 'Back to top'
  };

  function $(sel, root) { return (root || doc).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }
  function el(tag, cls, text) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, val);
    } catch (e) { /* storage blocked: preferences simply don't persist */ }
    return null;
  }

  // ── Language: English lives in the markup, German in de.json ─────
  var lang = 'en';
  var EN = {};   // captured once so the toggle can switch back
  $$('[data-i18n]').forEach(function (e) { EN[e.getAttribute('data-i18n')] = e.textContent; });
  $$('[data-i18n-ph]').forEach(function (e) { EN['ph:' + e.getAttribute('data-i18n-ph')] = e.getAttribute('placeholder') || ''; });
  $$('[data-i18n-content]').forEach(function (e) { EN['content:' + e.getAttribute('data-i18n-content')] = e.getAttribute('content') || ''; });
  // /de/ is pre-rendered in German, so the start page's English comes from the build
  var EN_BUILT = (DATA.en && DATA.en.dom) || {};
  Object.keys(EN_BUILT).forEach(function (k) { EN[k] = EN_BUILT[k]; });

  function T(key) {
    if (lang === 'de' && DE.js && DE.js[key]) return DE.js[key];
    return STR_EN[key] || key;
  }
  function domText(key, prefix) {
    if (lang === 'de' && DE.dom && DE.dom[key] !== undefined) return DE.dom[key];
    return EN[(prefix || '') + key];
  }
  function detectLang() {
    var q = /[?&]lang=(de|en)(?:&|$)/.exec(location.search);
    if (q) return q[1];
    if (/^\/de(\/|$)/.test(location.pathname)) return 'de';   // /de/ is the German start page
    var saved = store('cd-lang');
    if (saved === 'de' || saved === 'en') return saved;
    var nl = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    return /^de/i.test(nl) ? 'de' : 'en';
  }
  function applyLang(next) {
    lang = next === 'de' ? 'de' : 'en';
    doc.documentElement.lang = lang;
    $$('[data-i18n]').forEach(function (e) {
      var v = domText(e.getAttribute('data-i18n'));
      if (v !== undefined) e.textContent = v;
    });
    $$('[data-i18n-ph]').forEach(function (e) {
      var v = domText(e.getAttribute('data-i18n-ph'), 'ph:');
      if (v !== undefined) e.setAttribute('placeholder', v);
    });
    $$('[data-i18n-content]').forEach(function (e) {
      var v = domText(e.getAttribute('data-i18n-content'), 'content:');
      if (v !== undefined) e.setAttribute('content', v);
    });
    $$('[data-lang-toggle]').forEach(function (b) {
      b.textContent = lang === 'de' ? 'EN' : 'DE';
      b.setAttribute('aria-label', T('langSwitch'));
    });
    renderInstall();
    renderTricks();
    renderGallery();
    renderTimeline();
    renderBeatBtn();
    renderTheme();
    renderMenuLabels();
    try { doc.dispatchEvent(new CustomEvent('cd:lang', { detail: lang })); } catch (e) { /* old browser */ }
  }

  // The start page exists as / (English) and /de/ (German, for search engines);
  // the address follows the language on screen (on load and after a switch),
  // so a reload or a shared link keeps it.
  // Privacy, imprint and 404 are one bilingual page and keep their address.
  function syncUrl() {
    var path = location.pathname;
    if (path !== '/' && !/^\/de\/?$/.test(path)) return;
    var target = lang === 'de' ? '/de/' : '/';
    var search = location.search.replace(/([?&])lang=(?:de|en)(&|$)/, '$1').replace(/[?&]$/, '');
    if (path === target && search === location.search) return;
    try { history.replaceState(null, '', target + search + location.hash); } catch (e) { /* stays put */ }
  }

  // ── Day / night ───────────────────────────────────────────────
  function effectiveTheme() {
    var t = doc.documentElement.getAttribute('data-theme');
    if (t === 'dark' || t === 'light') return t;
    try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch (e) { return 'light'; }
  }
  function renderTheme() {
    var b = $('#themeBtn');
    if (!b) return;
    var dark = effectiveTheme() === 'dark';
    b.textContent = dark ? '☀️' : '🌙';
    var label = T(dark ? 'themeDay' : 'themeNight');
    b.setAttribute('title', label);
    b.setAttribute('aria-label', label);
  }
  function toggleTheme() {
    var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    doc.documentElement.setAttribute('data-theme', next);
    store('cd-theme', next);
    renderTheme();
  }

  // ── Install buttons: the visitor's browser goes first ─────────
  function browserKind() {
    var ua = navigator.userAgent || '';
    if (/Edg\//.test(ua)) return 'edge';
    if (/Firefox\//.test(ua)) return 'firefox';
    if (/Chrome\//.test(ua)) return 'chrome';
    if (/Safari\//.test(ua)) return 'safari';
    return 'other';
  }
  function renderInstall() {
    var cta = $('#cta');
    if (!cta) return;
    var kind = browserKind();
    var primary = STORES[kind] ? kind : 'chrome';
    var order = [primary].concat(['chrome', 'firefox', 'edge'].filter(function (k) { return k !== primary; }));
    cta.innerHTML = '';
    order.forEach(function (k, i) {
      var a = el('a', 'btn ' + (i === 0 ? 'btn-primary' : 'btn-ghost'));
      a.href = STORES[k];
      a.rel = 'noopener';
      a.textContent = (i === 0 && STORES[kind])
        ? T('addTo').replace('{browser}', T(k))
        : T('store' + k.charAt(0).toUpperCase() + k.slice(1));
      cta.appendChild(a);
    });
    $$('[data-install]').forEach(function (a) { a.href = STORES[primary]; });
    var note = $('#browserNote');
    if (note) note.textContent = kind === 'safari' ? T('safariNote') : (kind === 'other' ? T('otherNote') : '');
  }

  // ── The duck herself ──────────────────────────────────────────
  var engine = null;
  var soundOn = store('cd-sound') === '1';
  function reduceMotion() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  function mediaPlaying() {
    var els = doc.querySelectorAll('video, audio');
    for (var i = 0; i < els.length; i++) {
      var m = els[i];
      if (m.id === 'beat') continue;   // the beat reports itself
      if (!m.paused && !m.ended && !m.muted && m.volume > 0 && m.readyState >= 2) return true;
    }
    return false;
  }
  function bootDuck() {
    if (!window.CursorDuckEngine) return;
    engine = new window.CursorDuckEngine({
      model: 'mallard', size: 1.1, ducklings: 2, sound: soundOn, volume: 0.3,
      sleepAfter: 20, reduceMotion: reduceMotion()
    });
    engine.sound.base = '/audio/';
    try { engine.sound.preload(); } catch (e) { /* synth fallback */ }
    engine.mount(doc.body);
    engine.start();
    window.__duck = engine;
    try {
      var q = window.matchMedia('(prefers-reduced-motion: reduce)');
      var onChange = function () { engine.apply({ reduceMotion: !!q.matches }); };
      if (q.addEventListener) q.addEventListener('change', onChange);
      else if (q.addListener) q.addListener(onChange);
    } catch (e) { /* stays on the boot value */ }
    setInterval(function () { engine.setMedia(beat.playing || mediaPlaying()); }, 1000);
  }
  function modelName(id) {
    var n = NAMES[lang] && NAMES[lang][id];
    if (n) return n;
    var m = window.DuckModels && DuckModels.get ? DuckModels.get(id) : null;
    return m ? m.name : id;
  }
  function renderCurrent() {
    var c = $('#curDuck');
    if (!c || !engine) return;
    c.textContent = '';
    c.appendChild(doc.createTextNode(T('nowSwimming') + ' '));
    c.appendChild(el('b', '', modelName(engine.modelId)));
  }

  var TRICKS = [
    ['quack', '📣'], ['flap', '🪶'], ['crumbs', '🍞'], ['fish', '🐟'],
    ['visitor', '💕'], ['waddle', '🚶'], ['disco', '🪩'], ['debug', '🐤']
  ];
  function renderTricks() {
    var box = $('#tricks');
    if (!box || !engine) return;
    box.innerHTML = '';
    TRICKS.forEach(function (tr) {
      var b = el('button', 'btn btn-ghost btn-mini', tr[1] + ' ' + T('trick_' + tr[0]));
      b.type = 'button';
      b.onclick = function () { engine.trigger(tr[0], 2.2); };
      box.appendChild(b);
    });
    var rnd = el('button', 'btn btn-ghost btn-mini', '🎲 ' + T('another'));
    rnd.type = 'button';
    rnd.onclick = function () {
      var id = DuckModels.randomId();
      for (var tries = 0; id === engine.modelId && tries < 5; tries++) id = DuckModels.randomId();
      engine.apply({ model: id });
      renderCurrent();
    };
    box.appendChild(rnd);
    var snd = el('button', 'btn btn-ghost btn-mini' + (soundOn ? ' on' : ''),
      (soundOn ? '🔊 ' : '🔇 ') + T(soundOn ? 'soundOn' : 'soundOff'));
    snd.type = 'button';
    snd.onclick = function () {
      soundOn = !soundOn;
      engine.apply({ sound: soundOn });
      store('cd-sound', soundOn ? '1' : '0');
      renderTricks();
    };
    box.appendChild(snd);
    var cur = el('div', 'cur');
    cur.id = 'curDuck';
    box.appendChild(cur);
    renderCurrent();
  }

  // ── The flock: every model, drawn by the real renderer ────────
  var tiles = [], galleryLoop = false, visibleTiles = 0;
  function seasonLabel(m) {
    if (!m.season) return '';
    if (m.season.easter) return T('season_easter');
    return (m.season.months || []).map(function (mo) { return T('season_' + mo); }).join(', ');
  }
  function drawTile(it, t) {
    var x = it.ctx;
    x.setTransform(it.dpr, 0, 0, it.dpr, 0, 0);
    x.clearRect(0, 0, it.W, it.H);
    var cyc = (t + it.ph) % 6;
    DuckRender.draw(x, it.m, {
      x: it.W / 2, y: it.H - 13, r: 18, t: t + it.ph, dir: 1,
      bob: Math.sin(t * 2.3 + it.ph) * 1.3, paddle: t * 3 + it.ph,
      wingFlap: cyc > 5.5 ? Math.abs(Math.sin(t * 14)) : 0,
      beakOpen: (cyc > 2.6 && cyc < 2.9) ? 0.7 : 0,
      eyeOpen: (cyc > 4.2 && cyc < 4.32) ? 0.05 : 1,
      reflection: false
    });
  }
  function renderGallery() {
    var grid = $('#gallery');
    if (!grid || !window.DuckModels || !window.DuckRender) return;
    if (tiles.length) {   // language switch: only the labels change
      tiles.forEach(function (it) {
        it.label.textContent = modelName(it.m.id);
        it.el.title = modelName(it.m.id);
        if (it.when) it.when.textContent = seasonLabel(it.m);
      });
      return;
    }
    var io = ('IntersectionObserver' in window) ? new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var it = en.target.__tile;
        if (!it || en.isIntersecting === it.vis) return;
        it.vis = en.isIntersecting;
        visibleTiles += it.vis ? 1 : -1;
      });
      if (visibleTiles > 0) startGalleryLoop();
    }, { rootMargin: '80px' }) : null;
    DuckModels.list.forEach(function (m, i) {
      var d = el('div', 'tile ' + m.tier + (DuckModels.isAvailable(m) ? '' : ' off'));
      d.setAttribute('role', 'button');
      d.tabIndex = 0;
      var c = el('canvas');
      var W = 100, H = 64, dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = W * dpr; c.height = H * dpr;
      c.style.width = W + 'px'; c.style.height = H + 'px';
      var s = el('span', '', modelName(m.id));
      d.appendChild(c);
      d.appendChild(s);
      var when = null;
      if (m.season) { when = el('em', '', seasonLabel(m)); d.appendChild(when); }
      d.title = modelName(m.id);
      var pick = function () {
        if (!engine) return;
        engine.apply({ model: m.id });
        renderCurrent();
      };
      d.onclick = pick;
      d.onkeydown = function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } };
      grid.appendChild(d);
      var it = { m: m, el: d, ctx: c.getContext('2d'), dpr: dpr, W: W, H: H, ph: i * 0.7, label: s, when: when, vis: !io };
      d.__tile = it;
      tiles.push(it);
      drawTile(it, 0);
      if (io) io.observe(d);
    });
    if (!io) { visibleTiles = tiles.length; startGalleryLoop(); }
  }
  function startGalleryLoop() {
    if (galleryLoop || reduceMotion()) return;
    galleryLoop = true;
    var t0 = performance.now();
    (function loop(ts) {
      if (visibleTiles <= 0 || doc.hidden) { galleryLoop = false; return; }
      var t = (ts - t0) / 1000;
      for (var i = 0; i < tiles.length; i++) if (tiles[i].vis) drawTile(tiles[i], t);
      requestAnimationFrame(loop);
    })(t0);
  }
  doc.addEventListener('visibilitychange', function () { if (!doc.hidden && visibleTiles > 0) startGalleryLoop(); });

  // ── Changelog from releases.json ──────────────────────────────
  var releases = null;
  function loadReleases() {
    if (!window.fetch || !$('#timeline')) return;
    fetch('/releases.json')
      .then(function (r) { return r.json(); })
      .then(function (j) { releases = j; renderTimeline(); })
      .catch(function () { /* the GitHub link in the markup stays */ });
  }
  function fmtDate(iso) {
    try {
      return new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
        .format(new Date(iso + 'T12:00:00'));
    } catch (e) { return iso; }
  }
  function renderTimeline() {
    var box = $('#timeline');
    if (!box || !releases) return;
    box.innerHTML = '';
    releases.forEach(function (r, i) {
      var art = el('article', 'release');
      var h = el('h3', '', 'v' + r.version + ' · ' + (r.title[lang] || r.title.en));
      if (i === 0) h.appendChild(el('span', 'badge', T('latest')));
      art.appendChild(h);
      var meta = el('p', 'meta', fmtDate(r.date));
      if (r.github) {
        meta.appendChild(doc.createTextNode(' · '));
        var a = el('a', '', T('onGithub'));
        a.href = 'https://github.com/forliHD/CursorDuck/releases/tag/v' + r.version;
        a.rel = 'noopener';
        // every entry has this link: the version keeps the names apart for screen readers
        a.setAttribute('aria-label', T('onGithub') + ' (v' + r.version + ')');
        meta.appendChild(a);
      }
      art.appendChild(meta);
      var ul = el('ul');
      (r.items[lang] || r.items.en).forEach(function (s) { ul.appendChild(el('li', '', s)); });
      if (i < 2) {
        art.appendChild(ul);
      } else {
        var det = el('details');
        det.appendChild(el('summary', '', T('whatsNew')));
        det.appendChild(ul);
        art.appendChild(det);
      }
      box.appendChild(art);
    });
  }

  // ── Numbers from the build (data.js) ──────────────────────────
  function renderStats() {
    var m = $('#statModels');
    if (m && window.DuckModels) m.textContent = DuckModels.list.length;
    if (META.achievements && $('#statAch')) $('#statAch').textContent = META.achievements;
    if (META.tricks && $('#statTricks')) $('#statTricks').textContent = META.tricks;
    var fv = $('#footVersion');
    if (fv && META.version) fv.textContent = 'Cursor Duck ' + META.version;
  }
  function drawLogo() {
    var c = $('#logo');
    if (!c || !window.DuckRender || !window.DuckModels) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1), W = 36, H = 30;
    c.width = W * dpr; c.height = H * dpr;
    var x = c.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    DuckRender.draw(x, DuckModels.get('mallard'), {
      x: 17, y: 20, r: 10, t: 0, dir: 1, bob: 0, paddle: 0, wingFlap: 0, beakOpen: 0, eyeOpen: 1, reflection: false
    });
  }

  // ── A tiny procedural beat: two bars of chiptune, routed through a real
  // <audio> element so it counts as "music playing on the page" ──────
  var beat = (function () {
    var ctx = null, master = null, dest = null, audioEl = null, noise = null;
    var timer = 0, next = 0, step = 0, playing = false;
    var BPM = 118, STEP = 60 / BPM / 2;   // eighth notes
    var LEAD = [72, 76, 79, 76, 81, 79, 76, 74, 72, 76, 79, 84, 83, 79, 76, 79,
                72, 76, 79, 76, 81, 79, 76, 74, 77, 76, 74, 72, 74, 0, 72, 0];
    var BASS = [48, 0, 55, 0, 45, 0, 52, 0, 53, 0, 48, 0, 55, 0, 55, 0,
                48, 0, 55, 0, 45, 0, 52, 0, 53, 0, 50, 0, 55, 0, 48, 0];
    function hz(n) { return 440 * Math.pow(2, (n - 69) / 12); }
    function tone(n, t, dur, type, vol) {
      if (!n) return;
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(hz(n), t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.02);
    }
    function kick(t) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 0.2);
    }
    function hat(t, vol) {
      if (!noise) {
        noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
        var d = noise.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      var s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      s.buffer = noise;
      f.type = 'highpass'; f.frequency.value = 6000;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      s.connect(f); f.connect(g); g.connect(master);
      s.start(t);
    }
    function schedule() {
      while (next < ctx.currentTime + 0.12) {
        var i = step % 32;
        tone(LEAD[i], next, STEP * 0.9, 'square', 0.05);
        tone(BASS[i], next, STEP * 1.6, 'triangle', 0.16);
        if (i % 4 === 0) kick(next);
        hat(next, i % 2 ? 0.03 : 0.06);
        next += STEP;
        step++;
      }
    }
    function start() {
      if (playing) return;
      try {
        if (!ctx) {
          ctx = new (window.AudioContext || window.webkitAudioContext)();
          master = ctx.createGain();
          master.gain.value = 0.6;
          audioEl = doc.getElementById('beat');
          if (audioEl && ctx.createMediaStreamDestination) {
            dest = ctx.createMediaStreamDestination();
            master.connect(dest);
            audioEl.srcObject = dest.stream;
          } else {
            master.connect(ctx.destination);
          }
        }
        if (ctx.state === 'suspended') ctx.resume();
        if (audioEl && dest) {
          var p = audioEl.play();
          if (p && p.catch) p.catch(function () { master.disconnect(); master.connect(ctx.destination); });
        }
        next = ctx.currentTime + 0.05;
        step = 0;
        schedule();
        timer = setInterval(schedule, 40);
        playing = true;
      } catch (e) { playing = false; }
    }
    function stop() {
      if (!playing) return;
      clearInterval(timer);
      playing = false;
      if (audioEl && dest) audioEl.pause();
    }
    return { start: start, stop: stop, get playing() { return playing; } };
  })();
  function renderBeatBtn() {
    var b = $('#beatBtn');
    if (!b) return;
    b.textContent = (beat.playing ? '⏹ ' : '🎶 ') + T(beat.playing ? 'beatStop' : 'beatPlay');
    b.classList.toggle('on', beat.playing);
  }
  function toggleBeat() {
    if (beat.playing) beat.stop(); else beat.start();
    if (engine) engine.setMedia(beat.playing || mediaPlaying());
    renderBeatBtn();
  }

  // ── Menu (hamburger), active section, back to top ─────────────
  var menuOpen = false;
  function setMenu(open) {
    var nav = $('.nav'), btn = $('#menuBtn');
    if (!nav || !btn) return;
    menuOpen = open;
    nav.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.textContent = open ? '✕' : '☰';
    renderMenuLabels();
  }
  function renderMenuLabels() {
    var btn = $('#menuBtn');
    if (btn) btn.setAttribute('aria-label', T(menuOpen ? 'menuClose' : 'menuOpen'));
    var top = $('#toTop');
    if (top) top.setAttribute('aria-label', T('toTop'));
  }
  function setupMenu() {
    var nav = $('.nav'), btn = $('#menuBtn'), links = $('#siteNav');
    if (!nav || !btn || !links) return;
    btn.onclick = function () { setMenu(!menuOpen); };
    links.addEventListener('click', function (ev) { if (ev.target.tagName === 'A') setMenu(false); });
    doc.addEventListener('click', function (ev) { if (menuOpen && !nav.contains(ev.target)) setMenu(false); });
    doc.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && menuOpen) { setMenu(false); btn.focus(); } });
    window.addEventListener('resize', function () { if (menuOpen && window.innerWidth > 900) setMenu(false); });
    setMenu(false);
  }
  function setupScrollSpy() {
    var links = $$('#siteNav a[href^="#"]');
    if (!links.length || !('IntersectionObserver' in window)) return;
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var order = ['top'].concat(Object.keys(byId));
    var visible = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { visible[en.target.id] = en.isIntersecting; });
      var current = null;
      for (var i = 0; i < order.length; i++) if (visible[order[i]]) { current = order[i]; break; }
      links.forEach(function (a) { a.classList.toggle('active', byId[current] === a); });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    order.forEach(function (id) { var s = doc.getElementById(id); if (s) io.observe(s); });   // the hero (top) lights nothing up
  }
  function setupToTop() {
    var b = $('#toTop');
    if (!b) return;
    var shown = false;
    function check() {
      var want = (window.scrollY || window.pageYOffset || 0) > 700;
      if (want !== shown) { shown = want; b.classList.toggle('show', want); }
    }
    window.addEventListener('scroll', check, { passive: true });
    b.onclick = function () { window.scrollTo(0, 0); };
    check();
  }

  // ── Boot ──────────────────────────────────────────────────────
  function init() {
    setupMenu();
    setupScrollSpy();
    setupToTop();
    lang = detectLang();
    drawLogo();
    bootDuck();
    applyLang(lang);
    syncUrl();   // the address names the language on screen, / or /de/
    renderStats();
    loadReleases();
    var lb = $('#langBtn');
    if (lb) lb.onclick = function () { var next = lang === 'de' ? 'en' : 'de'; store('cd-lang', next); applyLang(next); syncUrl(); };
    var tb = $('#themeBtn');
    if (tb) tb.onclick = toggleTheme;
    var bb = $('#beatBtn');
    if (bb) bb.onclick = toggleBeat;
    try {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', renderTheme);
      else if (mq.addListener) mq.addListener(renderTheme);
    } catch (e) { /* no live theme updates */ }
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})();
