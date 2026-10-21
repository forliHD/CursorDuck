/*
 * (c) 2026 Lucas Reiser (forliHD) — Alle Rechte vorbehalten. Siehe LICENSE.
 *
 * CursorDuck — sub-frame relay.
 * Runs in every frame, including the top one (where it does nothing).
 * Reports the cursor to the parent frame and, while a video or audio
 * element is actually playing with sound, a heartbeat to the top frame.
 * The duck itself is drawn only in the top frame.
 */
(function () {
  'use strict';

  if (window.top === window.self) return;

  function mediaPlayingHere() {
    var lists = [document.getElementsByTagName('video'), document.getElementsByTagName('audio')];
    for (var n = 0; n < lists.length; n++) {
      var els = lists[n];
      for (var i = 0; i < els.length; i++) {
        var m = els[i];
        if (!m.paused && !m.ended && !m.muted && m.volume > 0 && m.readyState >= 2) return true;
      }
    }
    return false;
  }

  var lastSend = 0;
  window.addEventListener('mousemove', function (ev) {
    var now = Date.now();
    if (now - lastSend < 16) return;
    lastSend = now;
    try {
      window.parent.postMessage({ __cursorDuck: 1, x: ev.clientX, y: ev.clientY }, '*');
    } catch (e) { /* cross-origin */ }
  }, { passive: true, capture: true });

  // Embedded players (YouTube and the like) live in iframes. Idle frames
  // — ads, trackers — must not keep a timer. A heartbeat starts only once
  // something audible is playing, and stops with one final "off".
  var mediaWas = false;
  var timer = 0;

  function send(on) {
    try { window.top.postMessage({ __cursorDuck: 1, media: !!on }, '*'); } catch (e) { /* cross-origin */ }
  }

  function beat() {
    if (document.hidden) return;
    var on = mediaPlayingHere();
    if (on) {
      send(true);
      mediaWas = true;
      return;
    }
    if (mediaWas) send(false);
    mediaWas = false;
    if (timer) { clearInterval(timer); timer = 0; }
  }

  function ensure() {
    if (document.hidden) return;
    if (!timer) timer = setInterval(beat, 1000);
    beat();
  }

  function isMediaEl(ev) {
    var m = ev.target;
    if (!m || !m.tagName) return null;
    var tag = m.tagName;
    if (tag !== 'VIDEO' && tag !== 'AUDIO') return null;
    return m;
  }

  document.addEventListener('play', function (ev) {
    if (isMediaEl(ev)) ensure();
  }, true);
  document.addEventListener('volumechange', function (ev) {
    var m = isMediaEl(ev);
    if (!m) return;
    if (!m.paused && !m.muted && m.volume > 0) ensure();
    else beat();
  }, true);
  document.addEventListener('pause', function (ev) { if (isMediaEl(ev)) beat(); }, true);
  document.addEventListener('ended', function (ev) { if (isMediaEl(ev)) beat(); }, true);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (timer) { clearInterval(timer); timer = 0; }
    } else if (mediaWas || mediaPlayingHere()) {
      ensure();
    }
  });

  // document_idle can land after autoplay has already started
  if (mediaPlayingHere()) ensure();
})();
