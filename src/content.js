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
  var focusHold = false; // Fokus-Modus: Fullscreen-Video oder Passwortfeld?

  // Einzige Stelle, die über Laufen/Nicht-Laufen entscheidet.
  function sync() {
    if (!engine) return;
    if (engine.cfg.enabled && !blocked && !focusHold) engine.start();
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

  // Fokus-Modus: Bei Fullscreen-Video oder Fokus in einem Passwortfeld
  // tritt die Ente ab — danach meldet sie sich mit "!" zurück.
  function focusHoldNow() {
    try {
      var fe = document.fullscreenElement || document.webkitFullscreenElement;
      if (fe) {
        var tag = (fe.tagName || '').toUpperCase();
        // IFRAME: embedded players (YouTube & Co.) go fullscreen as the
        // frame element — cross-origin, so assume video and stand down.
        if (tag === 'VIDEO' || tag === 'IFRAME' ||
            !!(fe.querySelector && fe.querySelector('video'))) return true;
      }
      var ae = document.activeElement;
      return !!(ae && (ae.tagName || '').toUpperCase() === 'INPUT' &&
        String(ae.type || '').toLowerCase() === 'password');
    } catch (e) { return false; }
  }
  function updateFocusHold() {
    var hold = focusHoldNow();
    if (hold === focusHold) return;
    focusHold = hold;
    sync();
    if (!hold && engine && engine.duck && engine.cfg.enabled && !blocked) {
      try { engine.duck.say('!', '#4a90d9'); } catch (e) { /* Deko */ }
    }
  }
  // Deferred by a tick: when focus jumps from one password field to the
  // next, focusout (activeElement = body) precedes focusin — evaluated
  // immediately, the duck briefly popped back up in between.
  var focusTimer = 0;
  function scheduleFocusCheck() {
    if (focusTimer) return;
    focusTimer = setTimeout(function () { focusTimer = 0; updateFocusHold(); }, 0);
  }
  document.addEventListener('fullscreenchange', scheduleFocusCheck);
  document.addEventListener('webkitfullscreenchange', scheduleFocusCheck);
  document.addEventListener('focusin', scheduleFocusCheck);
  document.addEventListener('focusout', scheduleFocusCheck);

  // Reduced motion: the OS setting is the source of truth (no popup
  // toggle) — read at boot, then follow live changes below.
  function osReduceMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }

  function boot() {
    readAll(function (cfg, stats) {
      // Tages-Serie: einmal pro Kalendertag zählen (lokale Zeit, keine
      // Netzwerk-Uhr). Idempotent pro Tag — mehrere Tabs zählen nicht doppelt.
      try {
        var today = new Date();
        var dayKey = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();
        if (stats && stats.streakLast !== dayKey) {
          var yest = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
          var yKey = yest.getFullYear() + '-' + (yest.getMonth() + 1) + '-' + yest.getDate();
          stats.streakDays = stats.streakLast === yKey ? (stats.streakDays || 0) + 1 : 1;
          stats.streakLast = dayKey;
          // persist right away — otherwise a day without petting or pecking
          // never reached storage and the streak silently broke the next day
          chrome.storage.local.set({ stats: stats });
        }
      } catch (e) { /* Serie ist Deko */ }
      var opts = {};
      for (var k in DEFAULTS) opts[k] = cfg[k];
      opts.reduceMotion = osReduceMotion();
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
      focusHold = focusHoldNow();     // login page with an autofocused password field
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

  // Follow OS reduced-motion changes live (Settings → Accessibility
  // while the tab is open). Guarded: engine may not be booted yet.
  try {
    var rmQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    if (rmQuery) {
      var rmUpdate = function () {
        if (engine) { engine.apply({ reduceMotion: !!rmQuery.matches }); sync(); }   // apply() alone would revive a paused site
      };
      if (rmQuery.addEventListener) rmQuery.addEventListener('change', rmUpdate);
      else if (rmQuery.addListener) rmQuery.addListener(rmUpdate);
    }
  } catch (e) { /* old browser: stays on the boot value */ }

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
      if (k === 'reduceMotion') continue;   // comes from the OS, never from storage
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
