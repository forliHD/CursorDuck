/* CursorDuck — Popup */
(function () {
  'use strict';

  var DEFAULTS = {
    enabled: true, model: 'mallard', size: 1.0, speed: 1.0, ducklings: 0,
    playfulness: 1.0, sound: false, volume: 0.35, effects: true,
    reflection: true, opacity: 1.0, peck: true, sleepAfter: 15,
    disabledHosts: []
  };

  var cfg = null;
  var activeTab = null;
  var hostName = '';
  var babyCache = {};

  // Außerhalb der Extension (Vorschau im Browser) auf localStorage zurückfallen,
  // damit sich das Popup auch ohne chrome-APIs ansehen lässt.
  if (typeof chrome === 'undefined' || !chrome.storage) {
    var mem = JSON.parse(localStorage.getItem('cursorduck') || '{}');
    window.chrome = {
      storage: {
        sync: {
          get: function (d, cb) { var o = {}; for (var k in d) o[k] = (k in mem) ? mem[k] : d[k]; cb(o); },
          set: function (p) { Object.assign(mem, p); localStorage.setItem('cursorduck', JSON.stringify(mem)); }
        },
        local: { get: function (d, cb) { cb(d); }, set: function () {} }
      },
      tabs: { query: function (q, cb) { cb([{ id: 0, url: location.href }]); }, sendMessage: function () {} },
      runtime: {}
    };
  }

  var SLIDERS = [
    ['size', function (v) { return v.toFixed(1) + '×'; }],
    ['speed', function (v) { return v.toFixed(1) + '×'; }],
    ['ducklings', function (v) { return String(v | 0); }],
    ['playfulness', function (v) { return v.toFixed(1) + '×'; }],
    ['opacity', function (v) { return Math.round(v * 100) + ' %'; }]
  ];
  var CHECKS = ['peck', 'effects', 'reflection', 'sound'];
  var TRICKS = [
    ['quack', 'Quaken'], ['flap', 'Flattern'], ['preen', 'Putzen'],
    ['dabble', 'Gründeln'], ['dive', 'Tauchen'], ['spin', 'Pirouette'],
    ['bathe', 'Baden'], ['shake', 'Schütteln'], ['sleep', 'Nickerchen']
  ];

  function save(patch) {
    Object.assign(cfg, patch);
    chrome.storage.sync.set(patch);
  }

  function send(msg) {
    if (!activeTab) return;
    chrome.tabs.sendMessage(activeTab.id, msg, function () { void chrome.runtime.lastError; });
  }

  // ── Vorschau oben ───────────────────────────────────────────
  var hero = document.getElementById('hero');
  var hctx = hero.getContext('2d');
  var t0 = performance.now();

  function drawHero(ts) {
    requestAnimationFrame(drawHero);
    if (!cfg) return;
    var t = (ts - t0) / 1000;
    var m = DuckModels.get(cfg.model);
    hctx.setTransform(1, 0, 0, 1, 0, 0);
    hctx.clearRect(0, 0, hero.width, hero.height);
    // Wasser
    var g = hctx.createLinearGradient(0, 120, 0, hero.height);
    g.addColorStop(0, 'rgba(255,255,255,0.30)');
    g.addColorStop(1, 'rgba(120,180,225,0.30)');
    hctx.fillStyle = g;
    hctx.fillRect(0, 128, hero.width, hero.height - 128);

    var cyc = t % 7;
    var pose = {
      x: hero.width / 2 + Math.sin(t * 0.55) * 96,
      y: 136, r: 52, t: t,
      dir: Math.cos(t * 0.55) >= 0 ? 1 : -1,
      bob: Math.sin(t * 2.4) * 2.6,
      paddle: t * 4,
      wingFlap: cyc > 6.3 ? Math.abs(Math.sin(t * 15)) : 0,
      beakOpen: (cyc > 3.0 && cyc < 3.35) ? 0.75 : 0,
      eyeOpen: (cyc > 5.0 && cyc < 5.13) ? 0.05 : 1,
      headRot: Math.sin(t * 0.9) * 0.12,
      reflection: true
    };
    // Küken hinterher
    var n = cfg.ducklings | 0;
    for (var i = n; i >= 1; i--) {
      var bt = t - i * 0.42;
      var bm = babyCache[m.id] || (babyCache[m.id] = DuckRender.babyOf(m));
      DuckRender.draw(hctx, bm, {
        x: hero.width / 2 + Math.sin(bt * 0.55) * 90,
        y: 142, r: 27, t: bt,
        dir: Math.cos(bt * 0.55) >= 0 ? 1 : -1,
        bob: Math.sin(bt * 2.8) * 2, paddle: bt * 5, reflection: false
      });
    }
    DuckRender.draw(hctx, m, pose);
  }
  requestAnimationFrame(drawHero);

  // ── Modell-Raster ───────────────────────────────────────────
  function buildModels() {
    var wrap = document.getElementById('models');
    wrap.textContent = '';
    DuckModels.list.forEach(function (m) {
      var d = document.createElement('div');
      d.className = 'm tier-' + m.tier + (m.id === cfg.model ? ' on' : '');
      d.title = m.name + (m.tier !== 'common' ? ' · ' + m.tier : '');
      d.dataset.id = m.id;
      var c = document.createElement('canvas');
      var W = 88, H = 52, dpr = Math.min(2, devicePixelRatio || 1);
      c.width = W * dpr; c.height = H * dpr;
      var x = c.getContext('2d');
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      DuckRender.draw(x, m, { x: W / 2, y: H - 11, r: 19, t: 1.4, dir: 1, reflection: false });
      var s = document.createElement('span');
      s.textContent = m.name;
      d.appendChild(c); d.appendChild(s);
      d.onclick = function () {
        save({ model: m.id });
        wrap.querySelectorAll('.m').forEach(function (el) { el.classList.remove('on'); });
        d.classList.add('on');
        document.getElementById('modelName').textContent = m.name;
      };
      wrap.appendChild(d);
    });
  }

  // ── Verdrahtung ─────────────────────────────────────────────
  function bind() {
    var en = document.getElementById('enabled');
    en.checked = cfg.enabled;
    en.onchange = function () { save({ enabled: en.checked }); };

    SLIDERS.forEach(function (pair) {
      var id = pair[0], fmt = pair[1];
      var el = document.getElementById(id), out = document.getElementById(id + 'V');
      el.value = cfg[id];
      out.textContent = fmt(parseFloat(cfg[id]));
      el.oninput = function () {
        var v = parseFloat(el.value);
        out.textContent = fmt(v);
        save(id === 'ducklings' ? { ducklings: v | 0 } : (function () { var o = {}; o[id] = v; return o; })());
      };
    });

    CHECKS.forEach(function (id) {
      var el = document.getElementById(id);
      el.checked = !!cfg[id];
      el.onchange = function () { var o = {}; o[id] = el.checked; save(o); };
    });

    document.getElementById('randomBtn').onclick = function () {
      var id = DuckModels.randomId();
      save({ model: id });
      document.getElementById('modelName').textContent = DuckModels.get(id).name;
      buildModels();
    };

    var tr = document.getElementById('tricks');
    TRICKS.forEach(function (a) {
      var b = document.createElement('button');
      b.textContent = a[1];
      b.onclick = function () { send({ type: 'duck:trigger', action: a[0], dur: a[0] === 'sleep' ? 8 : 2.4 }); };
      tr.appendChild(b);
    });

    var so = document.getElementById('siteOff');
    so.checked = (cfg.disabledHosts || []).indexOf(hostName) !== -1;
    so.onchange = function () {
      var list = (cfg.disabledHosts || []).slice();
      var i = list.indexOf(hostName);
      if (so.checked && i === -1) list.push(hostName);
      if (!so.checked && i !== -1) list.splice(i, 1);
      save({ disabledHosts: list });
    };
  }

  // ── Start ───────────────────────────────────────────────────
  chrome.storage.sync.get(DEFAULTS, function (loaded) {
    cfg = loaded;
    document.getElementById('modelName').textContent = DuckModels.get(cfg.model).name;
    buildModels();
    bind();
  });

  chrome.storage.local.get({ stats: { pets: 0, pecks: 0 } }, function (o) {
    document.getElementById('pets').textContent = o.stats.pets || 0;
    document.getElementById('pecks').textContent = o.stats.pecks || 0;
  });

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    activeTab = tabs && tabs[0];
    try {
      hostName = new URL(activeTab.url).hostname;
    } catch (e) { hostName = ''; }
    document.getElementById('host').textContent = hostName || 'dieser Seite';
    var so = document.getElementById('siteOff');
    if (cfg) so.checked = (cfg.disabledHosts || []).indexOf(hostName) !== -1;
    if (!hostName) so.disabled = true;
  });
})();
