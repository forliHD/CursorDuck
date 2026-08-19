/* CursorDuck — Popup */
/* (c) 2026 Lucas Reiser (forliHD) — Alle Rechte vorbehalten. Siehe LICENSE. */
(function () {
  'use strict';

  var DEFAULTS = {
    enabled: true, model: 'mallard', size: 1.0, speed: 1.0, ducklings: 0,
    playfulness: 1.0, sound: false, volume: 0.35, effects: true,
    reflection: true, opacity: 1.0, peck: true, feed: true, sleepAfter: 15,
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

  // ── i18n: Texte kommen aus _locales/, das deutsche HTML ist der Fallback ──
  function MSG(key) {
    try {
      if (chrome.i18n && chrome.i18n.getMessage) return chrome.i18n.getMessage(key) || '';
    } catch (e) { /* Vorschau ohne Extension-Kontext */ }
    return '';
  }

  function modelName(m) {
    return MSG('model_' + m.id.replace(/-/g, '_')) || m.name;
  }

  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var t = MSG(el.getAttribute('data-i18n'));
      if (t) el.textContent = t;
    });
    document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      var t = MSG(el.getAttribute('data-i18n-title'));
      if (t) el.title = t;
    });
    // "Auf <host> pausieren" — der Hostname steckt mitten im Satz
    var sp = MSG('sitePause');
    var lab = document.getElementById('siteLabel');
    if (sp && sp.indexOf('{host}') !== -1 && lab) {
      var parts = sp.split('{host}');
      var hostB = document.getElementById('host');
      var hostText = (hostB && hostB.textContent) || MSG('hostFallback') || 'dieser Seite';
      lab.textContent = '';
      lab.appendChild(document.createTextNode(parts[0]));
      var b = document.createElement('b');
      b.id = 'host';
      b.textContent = hostText;
      lab.appendChild(b);
      lab.appendChild(document.createTextNode(parts[1] || ''));
    }
  }
  applyI18n();

  var SLIDERS = [
    ['size', function (v) { return v.toFixed(1) + '×'; }],
    ['speed', function (v) { return v.toFixed(1) + '×'; }],
    ['ducklings', function (v) { return String(v | 0); }],
    ['playfulness', function (v) { return v.toFixed(1) + '×'; }],
    ['opacity', function (v) { return Math.round(v * 100) + ' %'; }]
  ];
  var CHECKS = ['peck', 'feed', 'effects', 'reflection', 'sound'];
  var TRICKS = [
    ['quack', 'Quaken'], ['flap', 'Flattern'], ['preen', 'Putzen'],
    ['dabble', 'Gründeln'], ['dive', 'Tauchen'], ['spin', 'Pirouette'],
    ['bathe', 'Baden'], ['shake', 'Schütteln'], ['sleep', 'Nickerchen'],
    ['crumbs', 'Füttern'], ['fish', 'Fisch-Jagd'], ['dizzy', 'Schwindel'],
    ['dance', 'Tänzchen'], ['peekaboo', 'Kuckuck'], ['visitor', 'Besuch']
  ];

  // [Stat-Schlüssel, Ziel, Emoji, i18n-Key, deutscher Fallback]
  var ACHIEVEMENTS = [
    ['pets', 10, '🫶', 'achPets1', 'Streichel-Fan'],
    ['pets', 100, '💖', 'achPets2', 'Schmuse-Profi'],
    ['pecks', 25, '🐦', 'achPecks1', 'Pick-Pick'],
    ['fish', 1, '🐟', 'achFish1', 'Erster Fang'],
    ['fish', 25, '🎣', 'achFish2', 'Meisterangler'],
    ['crumbs', 20, '🍞', 'achCrumbs1', 'Brotpatron'],
    ['dances', 5, '💃', 'achDance1', 'Tanzpartner'],
    ['visits', 1, '💕', 'achVisit1', 'Neue Freundin']
  ];

  function renderAchievements(stats) {
    var wrap = document.getElementById('achievements');
    if (!wrap) return;
    wrap.textContent = '';
    ACHIEVEMENTS.forEach(function (a) {
      var val = stats[a[0]] || 0, goal = a[1], done = val >= goal;
      var d = document.createElement('div');
      d.className = 'a' + (done ? ' done' : '');
      var em = document.createElement('span'); em.className = 'em'; em.textContent = a[2];
      var tx = document.createElement('span'); tx.className = 'tx'; tx.textContent = MSG(a[3]) || a[4];
      var pr = document.createElement('span'); pr.className = 'pr';
      pr.textContent = done ? '✓' : Math.min(val, goal) + '/' + goal;
      d.appendChild(em); d.appendChild(tx); d.appendChild(pr);
      wrap.appendChild(d);
    });
  }

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
      // Saison-Enten nur in ihrem Monat zeigen (außer sie ist gerade gewählt)
      if (!DuckModels.isAvailable(m) && m.id !== cfg.model) return;
      var d = document.createElement('div');
      d.className = 'm tier-' + m.tier + (m.id === cfg.model ? ' on' : '');
      d.title = modelName(m) + (m.tier !== 'common' ? ' · ' + m.tier : '');
      d.dataset.id = m.id;
      var c = document.createElement('canvas');
      var W = 88, H = 52, dpr = Math.min(2, devicePixelRatio || 1);
      c.width = W * dpr; c.height = H * dpr;
      var x = c.getContext('2d');
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      DuckRender.draw(x, m, { x: W / 2, y: H - 11, r: 19, t: 1.4, dir: 1, reflection: false });
      var s = document.createElement('span');
      s.textContent = modelName(m);
      d.appendChild(c); d.appendChild(s);
      d.onclick = function () {
        save({ model: m.id });
        wrap.querySelectorAll('.m').forEach(function (el) { el.classList.remove('on'); });
        d.classList.add('on');
        document.getElementById('modelName').textContent = modelName(m);
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
      document.getElementById('modelName').textContent = modelName(DuckModels.get(id));
      buildModels();
    };

    var tr = document.getElementById('tricks');
    TRICKS.forEach(function (a) {
      var b = document.createElement('button');
      b.textContent = MSG('trick_' + a[0]) || a[1];
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
    document.getElementById('modelName').textContent = modelName(DuckModels.get(cfg.model));
    buildModels();
    bind();
  });

  chrome.storage.local.get({ stats: { pets: 0, pecks: 0, fish: 0, crumbs: 0, dances: 0, visits: 0 } }, function (o) {
    document.getElementById('pets').textContent = o.stats.pets || 0;
    document.getElementById('pecks').textContent = o.stats.pecks || 0;
    document.getElementById('fishN').textContent = o.stats.fish || 0;
    renderAchievements(o.stats);
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
