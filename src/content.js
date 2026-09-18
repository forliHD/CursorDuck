/*
 * (c) 2026 Lucas Reiser (forliHD) — Alle Rechte vorbehalten. Siehe LICENSE.
 *
 * CursorDuck — Content-Script-Bootstrap
 * Top-Frame: Ente rendern. Sub-Frames: nur Cursor-Position nach oben melden.
 */
(function () {
  'use strict';

  var isExt = typeof chrome !== 'undefined' && chrome.storage && chrome.runtime && chrome.runtime.id;

  // Is a video/audio with sound playing in this document? Muted autoplay
  // hero videos don't count — nobody dances to those.
  function mediaPlayingHere() {
    var els = document.querySelectorAll('video, audio');
    for (var i = 0; i < els.length; i++) {
      var m = els[i];
      if (!m.paused && !m.ended && !m.muted && m.volume > 0 && m.readyState >= 2) return true;
    }
    return false;
  }

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
    // Embedded players (YouTube & Co.) live in iframes: heartbeat while
    // playing, one final "off" when the media stops
    var mediaWas = false;
    setInterval(function () {
      var on = mediaPlayingHere();
      if (on || mediaWas) {
        try { window.top.postMessage({ __cursorDuck: 1, media: on }, '*'); } catch (e) { /* egal */ }
      }
      mediaWas = on;
    }, 1000);
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

  // "example.com" pauses the whole site: www., subdomains, any case.
  // (Exact matching used to leave www./non-www. twins unpaused.)
  function normHost(h) { return String(h || '').toLowerCase().replace(/^www\./, ''); }
  function hostBlocked(list) {
    var nh = normHost(host);
    for (var i = 0; i < (list || []).length; i++) {
      var e = normHost(list[i]);
      if (e && (nh === e || nh.slice(-e.length - 1) === '.' + e)) return true;
    }
    return false;
  }
  function siteAllowed(cfg) {
    return !hostBlocked(cfg.disabledHosts);
  }

  function boot() {
    readAll(function (cfg, stats) {
      var opts = {};
      for (var k in DEFAULTS) opts[k] = cfg[k];
      engine = new window.CursorDuckEngine(opts);
      // sound samples live in the extension package (web_accessible_resources)
      try {
        engine.sound.base = chrome.runtime.getURL('audio/');
        engine.sound.preload();
      } catch (e) { /* keeps the synth fallback */ }
      engine.stats = stats || { pets: 0, pecks: 0 };
      engine.onStats = throttle(function (s) {
        try {
          var snap = {};
          for (var k in s) snap[k] = s[k] || 0;
          chrome.storage.local.set({ stats: snap });
        } catch (e) {}
      }, 2000);
      engine.mount(document.documentElement);
      window.__cursorDuck = engine;   // Debug-Handle
      blocked = !siteAllowed(cfg);
      sync();
    });
  }

  // ── Media watch: own document + sub-frame heartbeats → engine.setMedia ──
  var frameMedia = [];   // [{ win, t }] sub-frames that reported playing media
  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || d.__cursorDuck !== 1 || d.media === undefined) return;
    for (var i = frameMedia.length - 1; i >= 0; i--) {
      if (frameMedia[i].win === ev.source) frameMedia.splice(i, 1);
    }
    if (d.media) frameMedia.push({ win: ev.source, t: Date.now() });
  }, false);
  setInterval(function () {
    if (!engine) return;
    var now = Date.now(), any = mediaPlayingHere();
    for (var i = frameMedia.length - 1; i >= 0; i--) {
      if (now - frameMedia[i].t > 2500) frameMedia.splice(i, 1);   // stale heartbeat
      else any = true;
    }
    engine.setMedia(any);
  }, 1000);

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
        blocked = hostBlocked(changes[k].newValue);
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
