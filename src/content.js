/*
 * CursorDuck — Content-Script-Bootstrap
 * Top-Frame: Ente rendern. Sub-Frames: nur Cursor-Position nach oben melden.
 */
(function () {
  'use strict';

  var isExt = typeof chrome !== 'undefined' && chrome.storage && chrome.runtime && chrome.runtime.id;

  // ── Sub-Frames: Cursorposition an das Top-Fenster melden ──────
  if (window.top !== window.self) {
    var lastSend = 0;
    window.addEventListener('mousemove', function (ev) {
      var now = Date.now();
      if (now - lastSend < 16) return;
      lastSend = now;
      try {
        window.parent.postMessage({ __cursorDuck: 1, x: ev.clientX, y: ev.clientY }, '*');
      } catch (e) { /* cross-origin, egal */ }
    }, { passive: true, capture: true });
    return;
  }

  if (!isExt) return; // Demo-Seite bootet selbst

  var DEFAULTS = window.CursorDuckDefaults;
  var engine = null;
  var host = location.hostname;
  var blocked = false;   // Seite über das Popup pausiert?

  // Einzige Stelle, die über Laufen/Nicht-Laufen entscheidet.
  function sync() {
    if (!engine) return;
    if (engine.cfg.enabled && !blocked) engine.start();
    else engine.stop();
  }

  function readAll(cb) {
    var keys = {};
    for (var k in DEFAULTS) keys[k] = DEFAULTS[k];
    keys.disabledHosts = [];
    chrome.storage.sync.get(keys, function (cfg) {
      chrome.storage.local.get({ stats: { pets: 0, pecks: 0 } }, function (loc) {
        cb(cfg, loc.stats);
      });
    });
  }

  function siteAllowed(cfg) {
    var list = cfg.disabledHosts || [];
    return list.indexOf(host) === -1;
  }

  function boot() {
    readAll(function (cfg, stats) {
      var opts = {};
      for (var k in DEFAULTS) opts[k] = cfg[k];
      engine = new window.CursorDuckEngine(opts);
      engine.stats = stats || { pets: 0, pecks: 0 };
      engine.onStats = throttle(function (s) {
        try {
          chrome.storage.local.set({ stats: {
            pets: s.pets || 0, pecks: s.pecks || 0,
            fish: s.fish || 0, crumbs: s.crumbs || 0
          } });
        } catch (e) {}
      }, 2000);
      engine.mount(document.documentElement);
      window.__cursorDuck = engine;   // Debug-Handle
      blocked = !siteAllowed(cfg);
      sync();
    });
  }

  function throttle(fn, ms) {
    var t = 0, pending = null;
    return function (arg) {
      pending = arg;
      var now = Date.now();
      if (now - t >= ms) { t = now; fn(pending); }
    };
  }

  // Live-Updates aus dem Popup
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (!engine || (area !== 'sync' && area !== 'local')) return;
    var patch = {};
    for (var k in changes) {
      if (k === 'disabledHosts') {
        blocked = (changes[k].newValue || []).indexOf(host) !== -1;
        continue;
      }
      if (k === 'stats') { engine.stats = changes[k].newValue || engine.stats; continue; }
      patch[k] = changes[k].newValue;
    }
    if (Object.keys(patch).length) engine.apply(patch);
    sync();
  });

  // Direkte Kommandos aus dem Popup (Vorschau-Aktionen)
  chrome.runtime.onMessage.addListener(function (msg, sender, respond) {
    if (!msg || !engine) return;
    if (msg.type === 'duck:trigger') engine.trigger(msg.action, msg.dur);
    if (msg.type === 'duck:model') engine.setModel(msg.model);
    if (msg.type === 'duck:ping') respond({ ok: true, model: engine.modelId, stats: engine.stats });
    return true;
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
