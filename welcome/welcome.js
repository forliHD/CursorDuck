/* Willkommensseite: echte Ente zum Ausprobieren + Modellgalerie */
/* (c) 2026 Lucas Reiser (forliHD) — Alle Rechte vorbehalten. Siehe LICENSE. */
(function () {
  'use strict';

  var isExt = typeof chrome !== 'undefined' && chrome.storage && chrome.runtime && chrome.runtime.id;
  var cfg = { model: 'mallard', size: 1.1, ducklings: 2, sound: false };

  // ── i18n: Texte aus _locales/, das deutsche HTML bleibt der Fallback ──
  function MSG(key) {
    try {
      if (isExt && chrome.i18n && chrome.i18n.getMessage) return chrome.i18n.getMessage(key) || '';
    } catch (e) { /* Vorschau ohne Extension */ }
    return '';
  }
  function modelName(m) {
    return MSG('model_' + m.id.replace(/-/g, '_')) || m.name;
  }
  (function applyI18n() {
    var t = MSG('wTitle');
    if (t) document.title = t;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var s = MSG(el.getAttribute('data-i18n'));
      if (s) el.textContent = s;
    });
  })();

  function start(settings) {
    var engine = new window.CursorDuckEngine(settings);
    engine.mount(document.body);
    engine.start();
    window.__duck = engine;
    // Auf dieser Seite gibt es kein Content-Script — Änderungen im Popup
    // trotzdem live übernehmen.
    if (isExt) {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'sync') return;
        var patch = {};
        for (var k in changes) if (k !== 'disabledHosts') patch[k] = changes[k].newValue;
        if (Object.keys(patch).length) engine.apply(patch);
      });
    }
  }

  if (isExt) {
    chrome.storage.sync.get(window.CursorDuckDefaults, function (loaded) {
      loaded.ducklings = loaded.ducklings || 2;   // zur Begrüßung mit Küken
      start(loaded);
    });
  } else {
    start(cfg);
  }

  // Galerie
  var grid = document.getElementById('grid');
  var tiles = [];
  DuckModels.list.forEach(function (m, i) {
    if (!DuckModels.isAvailable(m)) return;   // Saison-Enten nur in ihrem Monat
    var d = document.createElement('div');
    d.className = 'g';
    d.title = modelName(m);
    var c = document.createElement('canvas');
    var W = 90, H = 58, dpr = Math.min(2, devicePixelRatio || 1);
    c.width = W * dpr; c.height = H * dpr;
    c.style.width = W + 'px'; c.style.height = H + 'px';
    var s = document.createElement('span');
    s.textContent = modelName(m);
    d.appendChild(c); d.appendChild(s);
    d.onclick = function () {
      if (window.__duck) window.__duck.apply({ model: m.id });
      if (isExt) chrome.storage.sync.set({ model: m.id });
    };
    grid.appendChild(d);
    tiles.push({ m: m, ctx: c.getContext('2d'), dpr: dpr, W: W, H: H, ph: i * 0.7 });
  });

  var t0 = performance.now();
  (function loop(ts) {
    requestAnimationFrame(loop);
    var t = (ts - t0) / 1000;
    for (var i = 0; i < tiles.length; i++) {
      var it = tiles[i], x = it.ctx;
      x.setTransform(it.dpr, 0, 0, it.dpr, 0, 0);
      x.clearRect(0, 0, it.W, it.H);
      var cyc = (t + it.ph) % 6;
      DuckRender.draw(x, it.m, {
        x: it.W / 2, y: it.H - 12, r: 17, t: t + it.ph, dir: 1,
        bob: Math.sin(t * 2.3 + it.ph) * 1.3,
        paddle: t * 3 + it.ph,
        wingFlap: cyc > 5.5 ? Math.abs(Math.sin(t * 14)) : 0,
        beakOpen: (cyc > 2.6 && cyc < 2.9) ? 0.7 : 0,
        eyeOpen: (cyc > 4.2 && cyc < 4.32) ? 0.05 : 1,
        reflection: false
      });
    }
  })(t0);
})();
