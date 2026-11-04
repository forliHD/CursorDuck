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

  // Esc with the focus in this frame never reaches the top frame on its own.
  // Same rules as engine.escBlocked(): judged in the capture phase, before the
  // frame's own handlers can close the dialog it belongs to; sent in the bubble
  // phase, so a key they used stays theirs. Never prevented, never stopped.
  function escBelongsToFrame() {
    try {
      var el = document.activeElement;
      while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
      var tag = el && el.tagName ? el.tagName.toUpperCase() : '';
      var role = el && el.getAttribute ? el.getAttribute('role') : null;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el && el.isContentEditable) ||
          role === 'textbox' || role === 'searchbox' || role === 'combobox') return true;
      if (document.designMode === 'on' || document.fullscreenElement) return true;
      if (document.querySelector('dialog[open]')) return true;
      var open = document.querySelectorAll('[aria-modal="true"], [role="dialog"], [role="alertdialog"]');
      for (var i = 0; i < open.length; i++) {
        var dlg = open[i];
        if (dlg.getAttribute('aria-hidden') === 'true' || !dlg.getClientRects().length) continue;
        var css = window.getComputedStyle(dlg);
        if (css.visibility === 'hidden' || css.opacity === '0') continue;
        if (dlg.getAttribute('aria-modal') === 'true' || dlg.getAttribute('role') === 'alertdialog' ||
            (el && el !== document.body && dlg.contains(el))) return true;
      }
      try { if (document.querySelector('[popover]:popover-open')) return true; } catch (e2) { /* older browser */ }
    } catch (e) { return true; }
    return false;
  }
  var escTaken = false;
  window.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' || ev.key === 'Esc') escTaken = escBelongsToFrame();
  }, { passive: true, capture: true });
  window.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape' && ev.key !== 'Esc') return;
    if (escTaken || ev.repeat || ev.isComposing || ev.defaultPrevented) return;
    if (ev.ctrlKey || ev.shiftKey || ev.metaKey || ev.altKey) return;
    try { window.top.postMessage({ __cursorDuck: 1, esc: true }, '*'); } catch (e) { /* cross-origin */ }
  }, { passive: true });

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
