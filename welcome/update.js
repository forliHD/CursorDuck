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
    engine.mount(document.body);
    engine.start();
    window.__duck = engine;
    // Direkt was zeigen: nach kurzem Moment kommt Besuch vorbei
    setTimeout(function () { engine.trigger('visitor'); }, 2500);
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
