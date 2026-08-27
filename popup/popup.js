/* CursorDuck — Popup */
/* (c) 2026 Lucas Reiser (forliHD) — Alle Rechte vorbehalten. Siehe LICENSE. */
(function () {
  'use strict';

  var DEFAULTS = {
    enabled: true, model: 'mallard', size: 1.0, speed: 1.0, ducklings: 0,
    playfulness: 1.0, sound: false, volume: 0.35, effects: true,
    reflection: true, opacity: 1.0, peck: true, feed: true, sleepAfter: 15,
    randomOnStart: false, disabledHosts: []
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
  var CHECKS = ['peck', 'feed', 'effects', 'reflection', 'sound', 'randomOnStart'];
  var TRICKS = [
    ['quack', 'Quaken'], ['flap', 'Flattern'], ['preen', 'Putzen'],
    ['dabble', 'Gründeln'], ['dive', 'Tauchen'], ['spin', 'Pirouette'],
    ['bathe', 'Baden'], ['shake', 'Schütteln'], ['sleep', 'Nickerchen'],
    ['crumbs', 'Füttern'], ['fish', 'Fisch-Jagd'], ['dizzy', 'Schwindel'],
    ['dance', 'Tänzchen'], ['peekaboo', 'Kuckuck'], ['waddle', 'Landgang'],
    ['visitor', 'Besuch']
  ];

  // [Stat-Schlüssel, Ziel, Emoji, i18n-Key, Name (Fallback), Erklärung (Fallback)]
  // Ein Klick auf einen Erfolg klappt die Erklärung auf.
  var ACHIEVEMENTS = [
    ['pets', 10, '🫶', 'achPets1', 'Streichel-Fan', 'Streichle die Ente 10-mal so lange, bis die Herzchen sprühen.'],
    ['pets', 100, '💖', 'achPets2', 'Schmuse-Profi', '100 volle Streicheleinheiten — sie erkennt deine Maus am Geräusch.'],
    ['pets', 500, '🧸', 'achPets3', 'Lieblingsmensch', '500 Streicheleinheiten. Zugegeben: Eigentlich hat sie DICH gezähmt.'],
    ['pecks', 25, '🐦', 'achPecks1', 'Pick-Pick', 'Halt die Maus still, bis sie den Cursor 25-mal angepickt hat.'],
    ['pecks', 200, '🪵', 'achPecks2', 'Ehrenspecht', '200 Pickser gegen deinen Cursor. Der arme Zeiger.'],
    ['pecks', 1000, '⛏️', 'achPecks3', 'Presslufthammer', '1000 Pickser. Beantrage besser einen neuen Cursor.'],
    ['fish', 1, '🐟', 'achFish1', 'Erster Fang', 'Ihr erster gefangener Fisch. Sie war sehr stolz.'],
    ['fish', 25, '🎣', 'achFish2', 'Meisterangler', '25 Fische geschnappt — im Teich erzählt man sich Geschichten.'],
    ['fish', 100, '🦈', 'achFish3', 'Schrecken der Meere', '100 Fische. Die Fische haben inzwischen einen Steckbrief von ihr.'],
    ['fishEscaped', 10, '🐠', 'achFishEsc', 'Der war SO groß!', '10 Fische sind ihr entwischt. Jeder einzelne war natürlich riesig.'],
    ['crumbs', 20, '🍞', 'achCrumbs1', 'Brotpatron', 'Wirf per Doppelklick Brotkrumen ins Wasser — 20 wurden verputzt.'],
    ['crumbs', 100, '🥖', 'achCrumbs2', 'Bäcker-Liebling', '100 Krumen serviert. Beim Bäcker grüßt man dich mit Vornamen.'],
    ['crumbs', 500, '🏭', 'achCrumbs3', 'Großbäckerei', '500 Krumen. Du fütterst nicht mehr — du belieferst.'],
    ['bursts', 3, '🎈', 'achBurst', 'Platzt vor Glück', 'Füttere sie 3-mal so voll, dass es PLOPP macht. Keine Sorge, sie kommt wieder.'],
    ['bursts', 10, '💥', 'achBurst2', 'Plopp-Stammkundin', '10 Plopps. Die Federn haben inzwischen eine eigene Flugroute.'],
    ['dances', 5, '💃', 'achDance1', 'Tanzpartner', 'Wackel den Cursor schnell neben ihr hin und her — 5 Tänzchen getanzt.'],
    ['dances', 25, '🕺', 'achDance2', 'Discokugel', '25 Tänzchen. Der Teich gilt jetzt offiziell als Club.'],
    ['visits', 1, '💕', 'achVisit1', 'Neue Freundin', 'Der erste Besuch einer wilden Ente — Quak-Duett und Tänzchen inklusive.'],
    ['visits', 10, '🏡', 'achVisit2', 'Beliebtes Ufer', '10 Besuche. Es hat sich offenbar rumgesprochen.'],
    ['visits', 50, '🎪', 'achVisit3', 'Enten-Festival', '50 Besuche. Streng genommen veranstaltest du inzwischen ein Festival.'],
    ['startles', 10, '😱', 'achStartle', 'Buh!', 'Wisch 10-mal blitzschnell durch sie durch — Federn flogen.'],
    ['dizzy', 5, '🎠', 'achDizzy', 'Karussellfahrt', 'Kreise den Cursor schnell um sie herum, bis ihr 5-mal schwummrig wurde.'],
    ['dizzy', 25, '🌀', 'achDizzy2', 'Waschmaschine', '25 Schleudergänge. Sie sieht bis heute Sternchen.'],
    ['peekaboos', 5, '🫣', 'achPeek', 'Guck-guck!', 'Leg den Cursor ruhig auf ihr ab — 5-mal Kuckuck gespielt.'],
    ['sleeps', 10, '😴', 'achSleep', 'Sandmännchen', 'Lass sie 10-mal ungestört einschlafen. Zzz.'],
    ['sleeps', 50, '🛌', 'achSleep2', 'Murmeltier', '50 Nickerchen. Und täglich grüßt die Ente.'],
    ['nests', 5, '🪺', 'achNest', 'Gute-Nacht-Geschichte', 'Bring die Küken 5-mal ins Nest — Mama stupst sie höchstpersönlich zu Bett.'],
    ['surfs', 25, '🏄', 'achSurf', 'Wellenreiterin', 'Scroll kräftig durch die Seite — 25-mal ritt die Familie die Strömung.'],
    ['surfs', 100, '🌊', 'achSurf2', 'Tsunami-Reiterin', '100 Wellen. Dein Scrollrad verlangt Gefahrenzulage.'],
    ['modelSwitches', 10, '👗', 'achStyle', 'Modenschau', 'Wechsle 10-mal das Entenmodell im Popup.'],
    ['modelSwitches', 100, '🎭', 'achStyle2', 'Identitätskrise', '100 Modellwechsel. Wer bin ich — und wenn ja, wie viele Enten?'],
    ['legendary', 1, '✨', 'achLegend', 'Es glitzert!', 'Wähle eine legendäre Ente: Regenbogen, Galaxie oder Gold.'],
    ['quotes', 10, '🎤', 'achQuote', 'Keynote-Fan', 'Hör dir 10 Sprüche der Visionärs-Ente an. One more thing …'],
    ['waddles', 5, '🚶', 'achWaddle', 'Landratte', 'Sieh ihr 5-mal beim Landgang zu — oder stups ihn im Popup an.'],
    ['waddles', 25, '🥾', 'achWaddle2', 'Wanderverein', '25 Landgänge. Die Watschelrunde ist jetzt ein eingetragener Verein.']
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
      var desc = document.createElement('div'); desc.className = 'desc';
      desc.textContent = MSG(a[3] + 'D') || a[5];
      d.appendChild(em); d.appendChild(tx); d.appendChild(pr); d.appendChild(desc);
      // Klick klappt die Erklärung auf (immer nur eine gleichzeitig)
      d.onclick = function () {
        var was = d.classList.contains('open');
        wrap.querySelectorAll('.a.open').forEach(function (el) { el.classList.remove('open'); });
        if (!was) d.classList.add('open');
      };
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
