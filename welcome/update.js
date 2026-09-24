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
    // A quick hello, then the new duck shows off her laptop nap
    setTimeout(function () { engine.trigger('quack'); }, 2200);
    setTimeout(function () { engine.trigger('sleep'); }, 4500);
    // The "try it" card toggles free roam for this page's duck only
    var btn = document.getElementById('roamBtn');
    if (btn) {
      btn.onclick = function () {
        var roam = !!engine.cfg.follow;   // about to switch
        engine.apply({ follow: !roam });
        btn.textContent = MSG(roam ? 'uTryFollow' : 'uTryRoam') ||
          (roam ? 'Wieder dem Cursor folgen' : 'Freilauf ausprobieren');
      };
    }
  }

  // This page's duck is the new IT duck, whatever the popup says — the
  // user's own settings are only read, never written here
  if (isExt) {
    chrome.storage.sync.get(window.CursorDuckDefaults, function (loaded) {
      loaded.model = 'techie';
      loaded.follow = true;
      start(loaded);
    });
  } else {
    start({ model: 'techie', size: 1.1, sound: false });
  }
})();
