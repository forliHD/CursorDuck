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
    engine.giftName = function (id) { return MSG('gift_' + id); };
    // A quick hello, then today's new trick: she fetches something (preview only,
    // nothing lands in the collection from this page)
    setTimeout(function () { engine.trigger('quack'); }, 1800);
    setTimeout(function () { engine.trigger('gift'); }, 3800);
    var giftBtn = document.getElementById('giftBtn');
    if (giftBtn) giftBtn.onclick = function () { engine.trigger('gift'); };
    var leafBtn = document.getElementById('leafBtn');
    if (leafBtn) leafBtn.onclick = function () { engine.trigger('leaf'); };
  }

  // The user's own duck in the user's own settings, only read, never written here
  if (isExt) {
    chrome.storage.sync.get(window.CursorDuckDefaults, function (loaded) {
      loaded.follow = true;
      start(loaded);
    });
  } else {
    start({ size: 1.1, sound: false });
  }
})();
