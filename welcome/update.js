/* Update-Seite: Was-ist-neu-Liste + echte Ente zum Ausprobieren */
/* (c) 2026 Lucas Reiser (forliHD) — Alle Rechte vorbehalten. Siehe LICENSE. */
(function () {
  'use strict';

  var isExt = typeof chrome !== 'undefined' && chrome.storage && chrome.runtime && chrome.runtime.id;

  // i18n wie auf der Willkommensseite: deutsches HTML ist der Fallback
  function MSG(key) {
    try {
      if (isExt && chrome.i18n && chrome.i18n.getMessage) return chrome.i18n.getMessage(key) || '';
    } catch (e) { /* Vorschau ohne Extension */ }
    return '';
  }
  (function applyI18n() {
    var t = MSG('uTitle');
    if (t) document.title = t;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var s = MSG(el.getAttribute('data-i18n'));
      if (s) el.textContent = s;
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      var s = MSG(el.getAttribute('data-i18n-ph'));
      if (s) el.placeholder = s;
    });
  })();

  function start(settings) {
    var engine = new window.CursorDuckEngine(settings);
    engine.sound.base = '../audio/';   // real samples on this page too
    engine.sound.preload();
    engine.mount(document.body);
    engine.start();
    window.__duck = engine;
    engine.stageName = function (id) { return MSG('stage_' + id); };
    // A family for this page only, a day or two short of the next stage each:
    // the button lets them grow the way a day together does, and the second
    // press sees the eldest off. Nothing here is stored or counted.
    var brood = { ages: [16, 11, 6, 2, 16, 11, 6, 2] };
    engine.setBrood(brood.ages);
    var dayBtn = document.getElementById('dayBtn');
    if (dayBtn) {
      dayBtn.onclick = function () {
        var grown = DuckModels.growBrood(brood, engine.babies.length);
        brood = grown.brood;
        engine.setBrood(brood.ages, grown.news);
      };
    }
    var birdsBtn = document.getElementById('birdsBtn');
    if (birdsBtn) birdsBtn.onclick = function () { engine.trigger('birds'); };
    // A quick hello, then this update's sight: the birds come over
    setTimeout(function () { engine.trigger('quack'); }, 1800);
    setTimeout(function () { engine.trigger('birds'); }, 3800);
  }

  // The user's own duck in the user's own settings, only read, never written
  // here. A few ducklings come along, so there is something to grow.
  if (isExt) {
    chrome.storage.sync.get(window.CursorDuckDefaults, function (loaded) {
      loaded.follow = true;
      loaded.ducklings = Math.max(3, loaded.ducklings | 0);
      start(loaded);
    });
  } else {
    start({ size: 1.1, sound: false, ducklings: 3 });
  }
})();
