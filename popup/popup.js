/* CursorDuck — Popup */
/* (c) 2026 Lucas Reiser (forliHD) — Alle Rechte vorbehalten. Siehe LICENSE. */
(function () {
  'use strict';

  var DEFAULTS = {
    enabled: true, model: 'mallard', size: 1.0, speed: 1.0, distance: 1.0, ducklings: 0,
    playfulness: 1.0, sound: false, volume: 0.35, effects: true,
    reflection: true, opacity: 1.0,
    peck: true, feed: true, sleepAfter: 15, duckName: '',
    hat: '', glasses: '', follow: true, randomOnStart: false, disabledHosts: []
  };

  var cfg = null;
  var activeTab = null;
  var hostName = '';
  var babyCache = {};

  // ── Garderobe ───────────────────────────────────────────────
  // Same override rule as engine.dress(): '' = the model's own accessory,
  // 'none' = bare, anything else a kind from render.js.
  var statsCache = null;
  function dressed(m, hat, gl) {
    if (!hat && !gl) return m;
    var d = {};
    for (var k in m) d[k] = m[k];
    if (hat) d.hat = hat === 'none' ? null : hat;
    if (gl) d.glasses = gl === 'none' ? null : gl;
    return d;
  }
  var heroCache = { key: '', m: null };
  function heroModel() {
    var key = cfg.model + '|' + (cfg.hat || '') + '|' + (cfg.glasses || '');
    if (heroCache.key !== key) {
      heroCache.key = key;
      heroCache.m = dressed(DuckModels.get(cfg.model), cfg.hat, cfg.glasses);
    }
    return heroCache.m;
  }
  function renderWardrobe() {
    if (!cfg || !statsCache) return;
    var base = DuckModels.get(cfg.model);
    var unlocked = 0, total = 0;
    [['hat', 'wearHats'], ['glasses', 'wearGlasses']].forEach(function (pair) {
      var kind = pair[0], wrap = document.getElementById(pair[1]);
      if (!wrap) return;
      wrap.textContent = '';
      var items = [{ id: '', name: MSG('wearDefault') || 'Wie das Modell' },
                   { id: 'none', name: MSG('wearNone') || 'Ohne' }];
      DuckModels.wardrobe.forEach(function (w) {
        if (w.kind === kind) items.push({ id: w.id, name: MSG('wear_' + w.id) || w.name, w: w });
      });
      items.forEach(function (it) {
        var locked = !!(it.w && (statsCache[it.w.stat] || 0) < it.w.goal);
        if (it.w) { total++; if (!locked) unlocked++; }
        var d = document.createElement('div');
        d.className = 'w' + ((cfg[kind] || '') === it.id ? ' on' : '') + (locked ? ' locked' : '');
        // the tile shows the current model wearing this piece (plus whatever
        // is selected in the other row), so combinations are visible at once
        var c = document.createElement('canvas');
        var W = 62, H = 46, dpr = Math.min(2, devicePixelRatio || 1);
        c.width = W * dpr; c.height = H * dpr;
        var x = c.getContext('2d');
        x.setTransform(dpr, 0, 0, dpr, 0, 0);
        var dm = dressed(base, kind === 'hat' ? it.id : cfg.hat, kind === 'glasses' ? it.id : cfg.glasses);
        DuckRender.draw(x, dm, { x: W / 2, y: H - 9, r: 15, t: 1.4, dir: 1, reflection: false });
        var sp = document.createElement('span'); sp.textContent = it.name;
        d.appendChild(c); d.appendChild(sp);
        if (locked) {
          var lk = document.createElement('span'); lk.className = 'lock'; lk.textContent = '🔒';
          d.appendChild(lk);
          d.title = (MSG('wearLocked') || 'Freischalten mit: ') + achName(it.w.ach);
        } else {
          d.title = it.name;
          d.onclick = function () {
            var o = {}; o[kind] = it.id;
            save(o);
            renderWardrobe();
          };
        }
        wrap.appendChild(d);
      });
    });
    var cnt = document.getElementById('wearCount');
    if (cnt) cnt.textContent = unlocked + '/' + total;
  }

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

  function headerTitle(m) {
    return (cfg.duckName ? '\u201C' + cfg.duckName + '\u201D · ' : '') + m.emoji + '\u2002' + modelName(m);
  }

  function showModel(m) {
    document.getElementById('modelName').textContent = headerTitle(m);
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

  // ── Einklappbare Sektionen ──────────────────────────────────
  // Zustand liegt im localStorage des Popups (reine UI-Vorliebe, muss
  // nicht zwischen Geräten wandern). Ohne gespeicherten Zustand sind nur
  // Modell, Einstellungen und Seiten offen — der Rest wartet hinter dem Pfeil.
  var UI_KEY = 'cursorduck-ui';
  var DEFAULT_COLLAPSED = { wardrobe: 1, behaviour: 1, tricks: 1, achievements: 1 };
  function loadUi() {
    try { return JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveUi(ui) {
    try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) { /* privater Modus o. ä. */ }
  }
  (function initCollapsibles() {
    var ui = loadUi();
    var saved = ui.collapsed || {};
    document.querySelectorAll('section[data-sec]').forEach(function (sec) {
      var key = sec.dataset.sec;
      var h = sec.querySelector('h2.sec-toggle');
      if (!h) return;
      var collapsed = (key in saved) ? !!saved[key] : !!DEFAULT_COLLAPSED[key];
      function set(c) {
        sec.classList.toggle('collapsed', c);
        h.setAttribute('aria-expanded', String(!c));
      }
      set(collapsed);
      h.setAttribute('role', 'button');
      h.tabIndex = 0;
      function toggle() {
        var now = !sec.classList.contains('collapsed');
        set(now);
        var u = loadUi();
        u.collapsed = u.collapsed || {};
        u.collapsed[key] = now ? 1 : 0;
        saveUi(u);
      }
      h.onclick = toggle;
      h.onkeydown = function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); }
      };
    });
  })();

  var SLIDERS = [
    ['size', function (v) { return v.toFixed(1) + '×'; }],
    ['speed', function (v) { return v.toFixed(1) + '×'; }],
    ['distance', function (v) { return v.toFixed(1) + '×'; }],
    ['ducklings', function (v) { return String(v | 0); }],
    ['playfulness', function (v) { return v.toFixed(1) + '×'; }],
    ['opacity', function (v) { return Math.round(v * 100) + ' %'; }],
    ['volume', function (v) { return Math.round(v * 100) + ' %'; }],
    ['sleepAfter', function (v) { return Math.round(v) + ' s'; }]
  ];
  var CHECKS = ['follow', 'peck', 'feed', 'effects', 'reflection', 'sound', 'randomOnStart'];
  var TRICKS = [
    ['quack', 'Quaken', '📣'], ['flap', 'Flattern', '🪶'], ['preen', 'Putzen', '🧼'],
    ['dabble', 'Gründeln', '🙃'], ['dive', 'Tauchen', '🤿'], ['spin', 'Pirouette', '🌀'],
    ['bathe', 'Baden', '🛁'], ['shake', 'Schütteln', '💦'], ['sleep', 'Nickerchen', '😴'],
    ['crumbs', 'Füttern', '🍞'], ['fish', 'Fisch-Jagd', '🐟'], ['dizzy', 'Schwindel', '😵'],
    ['dance', 'Tänzchen', '💃'], ['peekaboo', 'Kuckuck', '🫣'], ['waddle', 'Landgang', '🚶'],
    ['visitor', 'Besuch', '💕'], ['disco', 'Disco', '🪩'], ['debug', 'Debuggen', '🐤']
  ];

  // [Stat-Schlüssel, Ziel, Emoji, i18n-Key, Name (Fallback), Erklärung (Fallback), Stufe]
  // Stufen: bronze → silver → gold → diamond. Ein Klick klappt die Erklärung auf.
  var ACHIEVEMENTS = [
    ['pets', 10, '🫶', 'achPets1', 'Streichel-Fan', 'Streichle die Ente 10-mal so lange, bis die Herzchen sprühen.', 'bronze'],
    ['pets', 100, '💖', 'achPets2', 'Schmuse-Profi', '100 volle Streicheleinheiten — sie erkennt deine Maus am Geräusch.', 'silver'],
    ['pets', 500, '🧸', 'achPets3', 'Lieblingsmensch', '500 Streicheleinheiten. Zugegeben: Eigentlich hat sie DICH gezähmt.', 'gold'],
    ['pets', 2500, '🪄', 'achPets4', 'Entenflüsterer', '2500 Streicheleinheiten. Sie hört inzwischen auf deinen Namen — und du auf ihren.', 'diamond'],
    ['pecks', 25, '🐦', 'achPecks1', 'Pick-Pick', 'Halt die Maus still, bis sie den Cursor 25-mal angepickt hat.', 'bronze'],
    ['pecks', 200, '🪵', 'achPecks2', 'Ehrenspecht', '200 Pickser gegen deinen Cursor. Der arme Zeiger.', 'silver'],
    ['pecks', 1000, '⛏️', 'achPecks3', 'Presslufthammer', '1000 Pickser. Beantrage besser einen neuen Cursor.', 'gold'],
    ['pecks', 5000, '🏗️', 'achPecks4', 'Bohrinsel', '5000 Pickser. Der Cursor hat Löcher. Wir zählen trotzdem weiter.', 'diamond'],
    ['fish', 1, '🐟', 'achFish1', 'Erster Fang', 'Ihr erster gefangener Fisch. Sie war sehr stolz.', 'bronze'],
    ['fish', 25, '🎣', 'achFish2', 'Meisterangler', '25 Fische geschnappt — im Teich erzählt man sich Geschichten.', 'silver'],
    ['fish', 100, '🦈', 'achFish3', 'Schrecken der Meere', '100 Fische. Die Fische haben inzwischen einen Steckbrief von ihr.', 'gold'],
    ['fish', 500, '🐋', 'achFish4', 'Fischmarkt', '500 Fische. Der Teich hat jetzt einen Wikipedia-Artikel über sie.', 'diamond'],
    ['fishEscaped', 10, '🐠', 'achFishEsc', 'Der war SO groß!', '10 Fische sind ihr entwischt. Jeder einzelne war natürlich riesig.', 'bronze'],
    ['fishEscaped', 100, '🧜', 'achFishEsc2', 'Anglerlatein', '100 entwischte Fische — jeder davon in der Erzählung mindestens hüfthoch.', 'silver'],
    ['crumbs', 20, '🍞', 'achCrumbs1', 'Brotpatron', 'Wirf per Doppelklick Brotkrumen ins Wasser — 20 wurden verputzt.', 'bronze'],
    ['crumbs', 100, '🥖', 'achCrumbs2', 'Bäcker-Liebling', '100 Krumen serviert. Beim Bäcker grüßt man dich mit Vornamen.', 'silver'],
    ['crumbs', 500, '🏭', 'achCrumbs3', 'Großbäckerei', '500 Krumen. Du fütterst nicht mehr — du belieferst.', 'gold'],
    ['crumbs', 2500, '🌾', 'achCrumbs4', 'Brotimperium', '2500 Krumen. Du hast jetzt offiziell eine Lieferkette.', 'diamond'],
    ['bursts', 3, '🎈', 'achBurst', 'Platzt vor Glück', 'Füttere sie 3-mal so voll, dass es PLOPP macht. Keine Sorge, sie kommt wieder.', 'bronze'],
    ['bursts', 10, '💥', 'achBurst2', 'Plopp-Stammkundin', '10 Plopps. Die Federn haben inzwischen eine eigene Flugroute.', 'silver'],
    ['bursts', 50, '🎆', 'achBurst3', 'Feuerwerkerin', '50 Plopps. Die Federn kommen mit eigenem Wetterbericht.', 'gold'],
    ['dances', 5, '💃', 'achDance1', 'Tanzpartner', 'Wackel den Cursor schnell neben ihr hin und her — 5 Tänzchen getanzt.', 'bronze'],
    ['dances', 25, '🕺', 'achDance2', 'Discokugel', '25 Tänzchen. Der Teich gilt jetzt offiziell als Club.', 'silver'],
    ['dances', 100, '🪩', 'achDance3', 'Tanzlehrerin', '100 Tänzchen. Sie gibt jetzt Kurse — Anmeldung am Teichrand.', 'gold'],
    ['visits', 1, '💕', 'achVisit1', 'Neue Freundin', 'Der erste Besuch einer wilden Ente — Quak-Duett und Tänzchen inklusive.', 'bronze'],
    ['visits', 10, '🏡', 'achVisit2', 'Beliebtes Ufer', '10 Besuche. Es hat sich offenbar rumgesprochen.', 'silver'],
    ['visits', 50, '🎪', 'achVisit3', 'Enten-Festival', '50 Besuche. Streng genommen veranstaltest du inzwischen ein Festival.', 'gold'],
    ['visits', 200, '🌆', 'achVisit4', 'Enten-Metropole', '200 Besuche. Der Teich hat Stoßzeiten und ein Verkehrskonzept.', 'diamond'],
    ['startles', 10, '😱', 'achStartle', 'Buh!', 'Wisch 10-mal blitzschnell durch sie durch — Federn flogen.', 'bronze'],
    ['startles', 50, '👻', 'achStartle2', 'Schreckgespenst', '50-mal durch sie durchgewischt. Sie zuckt schon, wenn du nur die Maus anfasst.', 'silver'],
    ['startles', 250, '🫨', 'achStartle3', 'Nervenbündel', '250 Schrecken. Sie hat jetzt eine Therapeutin — auch eine Ente.', 'gold'],
    ['dizzy', 5, '🎠', 'achDizzy', 'Karussellfahrt', 'Kreise den Cursor schnell um sie herum, bis ihr 5-mal schwummrig wurde.', 'bronze'],
    ['dizzy', 25, '🌀', 'achDizzy2', 'Waschmaschine', '25 Schleudergänge. Sie sieht bis heute Sternchen.', 'silver'],
    ['dizzy', 100, '🚀', 'achDizzy3', 'Zentrifuge', '100 Schleudergänge. Die Sternchen kreisen jetzt von allein.', 'gold'],
    ['peekaboos', 5, '🫣', 'achPeek', 'Guck-guck!', 'Leg den Cursor ruhig auf ihr ab — 5-mal Kuckuck gespielt.', 'bronze'],
    ['peekaboos', 25, '🙈', 'achPeek2', 'Versteckspiel-Profi', '25-mal Kuckuck. Sie hat feste Verstecke und wechselt sie regelmäßig.', 'silver'],
    ['peekaboos', 100, '🥷', 'achPeek3', 'Jetzt siehst du mich', '100 Kuckucks. Angeblich war sie die ganze Zeit da.', 'gold'],
    ['sleeps', 10, '😴', 'achSleep', 'Sandmännchen', 'Lass sie 10-mal ungestört einschlafen. Zzz.', 'bronze'],
    ['sleeps', 50, '🛌', 'achSleep2', 'Murmeltier', '50 Nickerchen. Und täglich grüßt die Ente.', 'silver'],
    ['sleeps', 250, '🌙', 'achSleep3', 'Dornröschen', '250 Nickerchen. Beim nächsten Mal bitte leise: Sie träumt gerade von dir.', 'gold'],
    ['goldNaps', 1, '💰', 'achGold1', 'Geldbad', 'Die Milliardärs-Ente ist zum ersten Mal in ihren Goldhaufen gesprungen.', 'bronze'],
    ['goldNaps', 10, '🪙', 'achGold2', 'Goldkind', '10 Goldbäder. Die Münzen haben inzwischen ihren Abdruck.', 'silver'],
    ['goldNaps', 50, '🏦', 'achGold3', 'Krösus', '50-mal im Gold geschlafen. Sie zählt es nachts nach — jede Münze.', 'gold'],
    ['codeNaps', 1, '⌨️', 'achCode1', 'Tastatur-Kissen', 'Die IT-Ente ist zum ersten Mal am Laptop eingeschlafen — mit dem Gesicht auf der Tastatur.', 'bronze'],
    ['codeNaps', 10, '🌙', 'achCode2', 'Nachtschicht', '10 Laptop-Nickerchen. Der Bildschirmschoner kennt sie inzwischen mit Namen.', 'silver'],
    ['codeNaps', 50, '🖥️', 'achCode3', 'Legacy-System', '50-mal am Laptop eingeschlafen. Ihr Code läuft trotzdem in Produktion.', 'gold'],
    ['nests', 5, '🪺', 'achNest', 'Gute-Nacht-Geschichte', 'Bring die Küken 5-mal ins Nest — Mama stupst sie höchstpersönlich zu Bett.', 'bronze'],
    ['nests', 25, '🍼', 'achNest2', 'Kita-Leitung', '25-mal die Küken ins Nest gebracht. Mit Gute-Nacht-Lied, versteht sich.', 'silver'],
    ['nests', 100, '👑', 'achNest3', 'Entenmutter des Jahres', '100 Nest-Abende. Die Küken haben eine Dankesrede vorbereitet.', 'gold'],
    ['surfs', 25, '🏄', 'achSurf', 'Wellenreiterin', 'Scroll kräftig durch die Seite — 25-mal ritt die Familie die Strömung.', 'bronze'],
    ['surfs', 100, '🌊', 'achSurf2', 'Tsunami-Reiterin', '100 Wellen. Dein Scrollrad verlangt Gefahrenzulage.', 'silver'],
    ['surfs', 500, '🌪️', 'achSurf3', 'Big-Wave-Surferin', '500 Wellen. Dein Scrollrad ist jetzt olympisch zertifiziert.', 'gold'],
    ['modelSwitches', 10, '👗', 'achStyle', 'Modenschau', 'Wechsle 10-mal das Entenmodell im Popup.', 'bronze'],
    ['modelSwitches', 100, '🎭', 'achStyle2', 'Identitätskrise', '100 Modellwechsel. Wer bin ich — und wenn ja, wie viele Enten?', 'silver'],
    ['modelSwitches', 500, '🪞', 'achStyle3', 'Tausend Gesichter', '500 Modellwechsel. Der Spiegel hat aufgegeben.', 'gold'],
    ['legendary', 1, '✨', 'achLegend', 'Es glitzert!', 'Wähle eine legendäre Ente: Regenbogen, Galaxie oder Gold.', 'gold'],
    ['quotes', 10, '🎤', 'achQuote', 'Keynote-Fan', 'Hör dir 10 Sprüche der Visionärs- oder IT-Ente an. One more thing …', 'bronze'],
    ['quotes', 50, '📱', 'achQuote2', 'Keynote-Stammgast', '50 Sprüche. Du hast Frontrow-Tickets für jede Präsentation.', 'silver'],
    ['quotes', 200, '💫', 'achQuote3', 'Reality Distortion Field', '200 Sprüche. Du glaubst inzwischen alles, was sie sagt.', 'gold'],
    ['waddles', 5, '🚶', 'achWaddle', 'Landratte', 'Sieh ihr 5-mal beim Landgang zu — oder stups ihn im Popup an.', 'bronze'],
    ['waddles', 25, '🥾', 'achWaddle2', 'Wanderverein', '25 Landgänge. Die Watschelrunde ist jetzt ein eingetragener Verein.', 'silver'],
    ['waddles', 100, '🏃', 'achWaddle3', 'Watschel-Marathon', '100 Landgänge. 42,195 Kilometer — in Entenschritten.', 'gold'],
    ['streakDays', 30, '🔥', 'achStreak', 'Stammgast', '30 Tage in Folge besucht. Sie hat dir längst einen Stammplatz freigehalten.', 'diamond']
  ];

  // achievement display name by key (localized, German fallback from the list)
  function achName(key) {
    for (var i = 0; i < ACHIEVEMENTS.length; i++) {
      if (ACHIEVEMENTS[i][3] === key) return MSG(key) || ACHIEVEMENTS[i][4];
    }
    return MSG(key) || key;
  }

  function renderAchievements(stats) {
    var wrap = document.getElementById('achievements');
    if (!wrap) return;
    wrap.textContent = '';
    var earned = 0;
    ACHIEVEMENTS.forEach(function (a) {
      var val = stats[a[0]] || 0, goal = a[1], done = val >= goal, tier = a[6] || 'bronze';
      if (done) earned++;
      var d = document.createElement('div');
      d.className = 'a t-' + tier + (done ? ' done' : '');
      d.title = MSG('tier' + tier.charAt(0).toUpperCase() + tier.slice(1)) || tier;
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
    var cnt = document.getElementById('achCount');
    if (cnt) cnt.textContent = earned + '/' + ACHIEVEMENTS.length;
  }

  // ── Pausierte Seiten ──────────────────────────────────────
  // "example.com" deckt www. und alle Subdomains ab — dieselbe Regel wie
  // im Content-Script, sonst zeigt das Häkchen etwas anderes als die Ente tut.
  function normHost(h) { return String(h || '').toLowerCase().replace(/^www\./, ''); }
  function hostMatches(entry, h) {
    var e = normHost(entry), n = normHost(h);
    return !!e && !!n && (n === e || n.slice(-e.length - 1) === '.' + e);
  }
  function isPaused(list, h) {
    return (list || []).some(function (e) { return hostMatches(e, h); });
  }
  function setHosts(list) {
    save({ disabledHosts: list });
    renderSites();
    syncSiteBox();
  }
  function syncSiteBox() {
    var so = document.getElementById('siteOff');
    so.checked = isPaused(cfg && cfg.disabledHosts, hostName);
    so.disabled = !hostName;
  }
  function renderSites() {
    var wrap = document.getElementById('siteList');
    if (!wrap) return;
    wrap.textContent = '';
    var list = (cfg && cfg.disabledHosts) || [];
    if (!list.length) {
      var none = document.createElement('div');
      none.className = 'site-none';
      none.textContent = MSG('sitesNone') || 'Noch keine Seite pausiert.';
      wrap.appendChild(none);
      return;
    }
    list.forEach(function (h) {
      var row = document.createElement('div'); row.className = 'site-row';
      var name = document.createElement('span'); name.textContent = h; name.title = h;
      var x = document.createElement('button');
      x.type = 'button'; x.className = 'site-x'; x.textContent = '×';
      x.title = MSG('sitesRemove') || 'Entfernen';
      x.onclick = function () { setHosts(list.filter(function (e) { return e !== h; })); };
      row.appendChild(name); row.appendChild(x);
      wrap.appendChild(row);
    });
  }

  // fill the range track up to the thumb (plain tracks look unfinished)
  function paintRange(el) {
    var min = parseFloat(el.min) || 0, max = parseFloat(el.max) || 1;
    var pct = ((parseFloat(el.value) - min) / (max - min)) * 100;
    el.style.background = 'linear-gradient(to right, var(--accent) ' + pct +
      '%, var(--line) ' + pct + '%)';
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
    var m = heroModel();
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

  // ── Soundboard: Samples direkt anhören (Popup-Lautstärke gilt) ──
  function buildSoundboard() {
    var wrap = document.getElementById('soundboard');
    if (!wrap) return;
    var base = null;
    try {
      base = (chrome.runtime && chrome.runtime.getURL) ? chrome.runtime.getURL('audio/') : null;
    } catch (e) { base = null; }
    if (!base) {
      wrap.style.display = 'none';
      var head = wrap.previousElementSibling;
      if (head) head.style.display = 'none';
      return;
    }
    var sounds = [
      ['quack.wav', '📣'], ['quack-alt1.wav', '🦆'], ['quack-alt2.wav', '🦆'],
      ['splash.wav', '💧'], ['peck.wav', '🐦'], ['pop.wav', '🍾'],
      ['coins-small.wav', '🪙'], ['coins-big.wav', '💰']
    ];
    sounds.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = s[1];
      b.title = s[0];
      b.onclick = function () {
        try {
          var a = new Audio(base + s[0]);
          a.volume = Math.max(0, Math.min(1, cfg.volume));
          var p = a.play();
          if (p && p.catch) p.catch(function () {});
        } catch (e) { /* stiller Button */ }
      };
      wrap.appendChild(b);
    });
  }

  // ── Modell-Raster ───────────────────────────────────────────
  function buildModels(filter) {
    var wrap = document.getElementById('models');
    wrap.textContent = '';
    var q = String(filter || '').toLowerCase();
    DuckModels.list.forEach(function (m) {
      // Saison-Enten nur in ihrem Monat zeigen (außer sie ist gerade gewählt)
      if (!DuckModels.isAvailable(m) && m.id !== cfg.model) return;
      // Suche filtert nach lokalisiertem Namen — das gewählte Modell bleibt sichtbar
      if (q && modelName(m).toLowerCase().indexOf(q) === -1 && m.id !== cfg.model) return;
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
        showModel(m);
        renderWardrobe();
      };
      wrap.appendChild(d);
    });
  }

  // ── Verdrahtung ─────────────────────────────────────────────
  function bind() {
    var en = document.getElementById('enabled');
    en.checked = cfg.enabled;
    en.onchange = function () { save({ enabled: en.checked }); };

    var dn = document.getElementById('duckName');
    dn.placeholder = MSG('duckNamePh') || 'Ente benennen …';
    dn.value = cfg.duckName || '';
    dn.onchange = function () {
      var v = dn.value.trim().slice(0, 24);
      dn.value = v;
      save({ duckName: v });
      showModel(DuckModels.get(cfg.model));
    };

    var ms = document.getElementById('modelSearch');
    ms.placeholder = MSG('modelSearchPh') || 'Modelle suchen …';
    ms.oninput = function () { buildModels(ms.value); };

    buildSoundboard();

    SLIDERS.forEach(function (pair) {
      var id = pair[0], fmt = pair[1];
      var el = document.getElementById(id), out = document.getElementById(id + 'V');
      el.value = cfg[id];
      out.textContent = fmt(parseFloat(cfg[id]));
      paintRange(el);
      el.oninput = function () {
        var v = parseFloat(el.value);
        out.textContent = fmt(v);
        paintRange(el);
        var patch = {};
        patch[id] = id === 'sleepAfter' ? Math.round(v) : (id === 'ducklings' ? v | 0 : v);
        save(patch);
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
      showModel(DuckModels.get(id));
      renderWardrobe();
      buildModels(document.getElementById('modelSearch').value);   // keep the search filter
    };

    var tr = document.getElementById('tricks');
    TRICKS.forEach(function (a) {
      var b = document.createElement('button');
      b.textContent = (a[2] ? a[2] + ' ' : '') + (MSG('trick_' + a[0]) || a[1]);
      b.onclick = function () { send({ type: 'duck:trigger', action: a[0], dur: a[0] === 'sleep' ? 8 : 2.4 }); };
      tr.appendChild(b);
    });

    var so = document.getElementById('siteOff');
    syncSiteBox();
    so.onchange = function () {
      var list = (cfg.disabledHosts || []).slice();
      if (so.checked) {
        if (!isPaused(list, hostName)) list.push(normHost(hostName));
      } else {
        // alle Einträge raus, die diese Seite pausieren (auch die Domain darüber)
        list = list.filter(function (e) { return !hostMatches(e, hostName); });
      }
      setHosts(list);
    };
    renderSites();
    document.getElementById('siteAdd').onsubmit = function (ev) {
      ev.preventDefault();
      var inp = document.getElementById('siteInput');
      var h = normHost(inp.value.trim().replace(/^[a-z]+:\/\//i, '').split(/[\/?#]/)[0]);
      if (!h) return;
      var list = (cfg.disabledHosts || []).slice();
      if (list.indexOf(h) === -1) list.push(h);
      inp.value = '';
      setHosts(list);
    };
  }

  // ── Start ───────────────────────────────────────────────────
  chrome.storage.sync.get(DEFAULTS, function (loaded) {
    cfg = loaded;
    showModel(DuckModels.get(cfg.model));
    buildModels();
    bind();
    renderWardrobe();
  });

  chrome.storage.local.get({ stats: { pets: 0, pecks: 0, fish: 0, crumbs: 0, dances: 0, visits: 0 } }, function (o) {
    document.getElementById('pets').textContent = o.stats.pets || 0;
    document.getElementById('pecks').textContent = o.stats.pecks || 0;
    document.getElementById('fishN').textContent = o.stats.fish || 0;
    renderAchievements(o.stats);
    statsCache = o.stats;
    renderWardrobe();
  });

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    activeTab = tabs && tabs[0];
    try {
      hostName = new URL(activeTab.url).hostname;
    } catch (e) { hostName = ''; }
    document.getElementById('host').textContent = hostName || (MSG('hostFallback') || 'dieser Seite');
    if (cfg) syncSiteBox();
    else document.getElementById('siteOff').disabled = !hostName;
  });
})();
