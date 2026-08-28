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
  })();

  function start(settings) {
    var engine = new window.CursorDuckEngine(settings);
    engine.sound.base = '../audio/';   // real samples on this page too
    engine.sound.preload();
    engine.mount(document.body);
    engine.start();
    window.__duck = engine;
    // Show off right away: the tycoon duck introduces herself, then gets
    // sleepy and dives into her gold hoard (moving the mouse wakes her)
    setTimeout(function () { engine.setModel('tycoon'); }, 1800);
    setTimeout(function () { engine.trigger('quack'); }, 2600);
    setTimeout(function () { engine.trigger('sleep', 99); }, 7000);
  }

  if (isExt) {
    chrome.storage.sync.get(window.CursorDuckDefaults, function (loaded) {
      loaded.ducklings = Math.max(loaded.ducklings || 0, 2);
      start(loaded);
    });
  } else {
    start({ model: 'mallard', size: 1.1, ducklings: 2, sound: false });
  }
})();
