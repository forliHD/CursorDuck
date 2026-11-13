/*
 * Test bridge, added only to the throwaway test copy of the extension (see
 * e2e.mjs), never packaged. It shares the isolated world with the content
 * scripts, so it can read the engine and move the clock that world sees.
 * The page talks to it through window.postMessage.
 */
(function () {
  'use strict';
  if (window.top !== window.self) return;

  var RealDate = Date, offset = 0;
  function setClock(iso) { offset = new RealDate(iso).getTime() - RealDate.now(); }
  var hash = /[#&]clock=([^&]+)/.exec(location.hash);
  if (hash) setClock(decodeURIComponent(hash[1]));
  function FakeDate() {
    if (!arguments.length) return new RealDate(RealDate.now() + offset);
    var a = [null];
    for (var i = 0; i < arguments.length; i++) a.push(arguments[i]);
    return new (Function.prototype.bind.apply(RealDate, a))();
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = function () { return RealDate.now() + offset; };
  FakeDate.parse = RealDate.parse;
  FakeDate.UTC = RealDate.UTC;
  // the scripts' own global: in Firefox `window` is only a view of the page's window
  globalThis.Date = FakeDate;

  // The birds' layer as the page sees it: its box, and how much of its canvas is painted.
  function skyBox() {
    var el = document.querySelector('[data-cursor-duck-sky]');
    if (!el) return null;
    var r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    var c = el.shadowRoot ? el.shadowRoot.querySelector('canvas') : null, ink = 0;
    if (c) {
      try {
        var px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        for (var i = 3; i < px.length; i += 4) if (px[i] > 40) ink++;
      } catch (e) { ink = -1; }
    }
    return {
      x: r.left, y: r.top, w: r.width, h: r.height, ink: ink, layers: document.querySelectorAll('[data-cursor-duck-sky]').length,
      pointerEvents: cs.pointerEvents, position: cs.position, canvas: c ? { w: c.width, h: c.height } : null
    };
  }

  function snapshot() {
    var e = window.__cursorDuck;
    if (!e) return null;
    var d = e.duck;
    var lf = e.leaf;
    return {
      state: d.state, x: d.x, y: d.y, r: d.radius(), vanish: d.vanish, submerge: d.a.submerge,
      carry: d.carry || null, giftRun: d.giftRun ? d.giftRun.id : null, home: d.dragHome || null,
      px: e.px, py: e.py, w: e.w, h: e.h, time: e.time, running: e.running, halted: !!e.halted,
      submerged: e.submerged, parked: e._parked,
      drag: e.drag ? { active: e.drag.active, touch: e.drag.touch, offX: e.drag.offX, offY: e.drag.offY } : null,
      speed: Math.hypot(d.vx, d.vy), walk: d.a.walk,
      hostDisplay: e.host.style.getPropertyValue('display'),
      stage: e.stage ? { w: e.stage.w, h: e.stage.h } : null,
      canvas: { w: e.canvas.width, h: e.canvas.height },
      babies: e.babies.map(function (b) {
        return { x: b.x, y: b.y, r: b.radius(), vanish: b.vanish || 0, submerge: b.a.submerge, stage: b.stage, egg: b.egg ? b.egg.t : null,
          gap: b.gap, headRot: b.tgt.headRot, neck: b.model.neckLen, hat: b.model.hat || null };
      }),
      // (perf.mjs runs this bridge on the previous release too, which has no brood)
      brood: e.broodAges ? { ages: e.broodAges.slice(), shown: e.broodShown.slice(), queue: e.broodQ.map(function (n) { return n.slot + ':' + n.kind; }) } : null,
      fledge: e.fledge ? { x: e.fledge.x, y: e.fledge.y, t: e.fledge.t, rise: e.fledge.rise || 0, alpha: e.fledge.alpha == null ? 1 : e.fledge.alpha } : null,
      flock: e.flock ? { x: e.flock.x, y: e.flock.y, dir: e.flock.dir, prog: e.flock.prog, n: e.flock.birds.length, half: e.flock.half,
        back: e.flock.back, front: e.flock.front, called: e.flock.called, watching: e.flock.watching, looks: e.flock.looks || 0 } : null,
      sky: skyBox(), flockCd: e.flockCd, headRot: d.a.headRot, face: d.face, calls: d.bwCalls || 0, wing: d.a.wingFlap,
      says: window.__says || null,
      leaf: lf ? { x: lf.x, y: lf.y, z: lf.z, on: lf.on, life: lf.life, vx: lf.vx, spin: lf.spin } : null,
      giftObj: e.giftObj ? { id: e.giftObj.id, x: e.giftObj.x, y: e.giftObj.y } : null,
      giftQ: e.giftQ ? e.giftQ.id : null, leafCd: e.leafCd, frames: window.__frames || 0,
      stats: e.stats, cfg: e.cfg, parts: e.fx.parts.length, month: new Date().getMonth() + 1
    };
  }

  var COMMANDS = {
    state: function () { return snapshot(); },
    trigger: function (a, dur) { window.__cursorDuck.trigger(a, dur); return true; },
    apply: function (patch) { window.__cursorDuck.apply(patch); return true; },
    setEngine: function (k, v) { window.__cursorDuck[k] = v; return true; },
    setDuck: function (k, v) { window.__cursorDuck.duck[k] = v; return true; },
    place: function (x, y) {
      var d = window.__cursorDuck.duck;
      d.x = x; d.y = y; d.vx = 0; d.vy = 0; d.setState('idle', 1);
      return true;
    },
    setClock: function (iso) { setClock(iso); return new Date().toISOString(); },
    today: function () { return window.DuckModels.dayKey(new Date()); },
    leafNow: function () { window.__cursorDuck.leafCd = 0; return true; },
    flockNow: function () { window.__cursorDuck.flockCd = 0; return true; },
    setBrood: function (ages, news) { window.__cursorDuck.setBrood(ages, news); return true; },
    // what a page would overflow by: the birds enter and leave across the edges
    overflow: function () {
      var el = document.scrollingElement || document.documentElement;
      return { x: el.scrollWidth - el.clientWidth, y: el.scrollHeight - el.clientHeight };
    },
    spawnLeafAt: function (dx, dy) {
      var e = window.__cursorDuck, lf = e.leaf || e.spawnLeaf();
      lf.x = e.duck.x + dx; lf.y = e.duck.y + dy; lf.z = 0; lf.vx = 0; lf.vy = 0; lf.cd = 0;
      return true;
    },
    // what she says from here on, bubble by bubble
    countSays: function () {
      var d = window.__cursorDuck.duck;
      if (!d.__said) {
        var orig = d.say;
        d.say = function (txt, color) { window.__says.push(String(txt) + ' ' + color); return orig.apply(this, arguments); };
        d.__said = true;
      }
      window.__says = [];
      return true;
    },
    countFrames: function () {
      var e = window.__cursorDuck;
      if (!e.__wrapped) {
        var orig = e.render;
        e.render = function () {
          window.__frames = (window.__frames || 0) + 1;
          if (e._busy) {
            var why = e.duck.state + (e.pointerIdle < 0.2 ? '/pointer' : '') + (e.fish ? '/fish' : '') + (e.visitor ? '/visitor' : '') +
              (Math.abs(e.duck.vx) + Math.abs(e.duck.vy) > 48 ? '/moving' : '') + (e.giftObj ? '/gift' : '');
            window.__busy[why] = (window.__busy[why] || 0) + 1;
          }
          return orig.apply(this, arguments);
        };
        e.__wrapped = true;
      }
      window.__frames = 0;
      window.__busy = {};
      return true;
    },
    frames: function () { return window.__frames || 0; },
    busyFrames: function () { return window.__busy || {}; },
    // Fast-forward with random input, straight on the engine. An exception inside a
    // frame would kill the loop silently, and a duck left invisible looks like nothing.
    soak: function (seed, minutes, model) {
      var e = window.__cursorDuck, d;
      var state = seed >>> 0;
      function rnd() {
        state = (state + 0x6d2b79f5) >>> 0;
        var t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      }
      var realRandom = Math.random;
      Math.random = rnd;
      if (e.raf) cancelAnimationFrame(e.raf);
      if (e._calmTimer) { clearTimeout(e._calmTimer); e._calmTimer = 0; }
      e._loopQueued = false;
      e._ensureLoop = function () {};
      e.apply({ model: model, ducklings: 3, playfulness: 2.5, peck: true, effects: true, follow: true, reduceMotion: false, escHide: true, sleepAfter: 5 });
      var ACTS = ['quack', 'flap', 'preen', 'dabble', 'dive', 'spin', 'bathe', 'shake', 'sleep', 'crumbs', 'fish', 'dizzy',
        'dance', 'peekaboo', 'waddle', 'visitor', 'disco', 'debug', 'gift', 'leaf', 'burst', 'hide', 'birds'];
      var brood = null, hatched = 0, flew = 0;
      var seen = {}, bad = [], dt = 1 / 30, steps = Math.round(minutes * 60 / dt), dragLeft = 0, quiet = 0;
      function check(i) {
        d = e.duck;
        var all = [d].concat(e.babies);
        for (var k = 0; k < all.length; k++) {
          if (!isFinite(all[k].x) || !isFinite(all[k].y)) bad.push('NaN position at step ' + i + ' in ' + d.state);
        }
        if (e.fx.parts.length > 260) bad.push('particles ' + e.fx.parts.length);
        if (d.vanish && d.state !== 'hide' && d.state !== 'burst') bad.push('invisible in ' + d.state + ' at step ' + i);
        if (document.querySelectorAll('[data-cursor-duck-sky]').length > 1) bad.push('two bird layers at step ' + i);
        if (!e.flock !== !e.sky && i % 4 === 0) bad.push('bird layer without birds (or the other way round) at step ' + i);
        for (k = 0; k < e.babies.length; k++) {
          if (!(e.babies[k].radius() > 0) || !e.babies[k].model) bad.push('duckling ' + k + ' without a look at step ' + i);
        }
        if (e.stage && e.stage.w * e.stage.h > Math.ceil(e.w + 1) * Math.ceil(e.h + 1) * 1.01) bad.push('stage ' + e.stage.w + 'x' + e.stage.h);
      }
      for (var i = 0; i < steps && bad.length < 5; i++) {
        d = e.duck;
        var r = rnd();
        // now and then the cursor rests for a while: naps and leaves need that
        if (quiet > 0) {
          quiet--;
          r = 1;
        } else if (rnd() < 0.003) {
          quiet = 300 + Math.floor(rnd() * 600);
          if (rnd() < 0.6) e.trigger('leaf');
        }
        if (r < 0.03) {
          e.setPointer(rnd() * e.w, rnd() * e.h);
        } else if (r < 0.033) {
          e.trigger(ACTS[Math.floor(rnd() * ACTS.length)], 1 + rnd() * 2);
        } else if (r < 0.035 && !e.drag) {
          e.armDrag({ clientX: d.x, clientY: d.y - d.radius() * 0.75, target: document.body }, false);
          if (e.drag) { e.beginDrag(); dragLeft = 10 + Math.floor(rnd() * 60); }
        } else if (r < 0.0365) {
          e.pressEsc();
        } else if (r < 0.0372) {
          e.apply({ follow: rnd() < 0.5, reduceMotion: rnd() < 0.2, ducklings: Math.floor(rnd() * 5) });
        } else if (r < 0.0376) {
          e.giveGift(window.DuckModels.rollGift(rnd), { isNew: rnd() < 0.5 });
        } else if (r < 0.0378) {
          e.apply({ enabled: false }); e.apply({ enabled: true });
        } else if (r < 0.038) {
          e.setMedia(rnd() < 0.5);
        } else if (r < 0.043) {
          // a day together, the way the background page reports it
          var grown = window.DuckModels.growBrood(brood, e.babies.length);
          brood = grown.brood;
          e.setBrood(brood.ages, grown.news);
        }
        for (var bi = 0; bi < e.babies.length; bi++) if (e.babies[bi].egg) hatched++;
        if (e.fledge) flew++;
        if (dragLeft > 0 && --dragLeft === 0) e.endDrag(rnd() < 0.2);
        // every trick in turn as well, so no run depends on the draw to get through all of them
        if (i % 600 === 300) e.trigger(ACTS[((i / 600) | 0) % ACTS.length], 2);
        e.step(dt);
        if (i % 4 === 0) e.render();
        seen[e.duck.state] = (seen[e.duck.state] || 0) + 1;
        check(i);
      }
      Math.random = realRandom;
      // quiet time: everything has to come back to a plain, visible duck
      if (e.drag) e.endDrag();
      e.setMedia(false);
      if (e.submerged) e.surface();
      e.setPointer(e.w / 2, e.h / 2);
      e.apply({ follow: true, reduceMotion: false, playfulness: 0, peck: false, sleepAfter: 1e6 });
      // lowest water level of the last 10 s: a cursor resting on her rightly starts
      // peekaboo, so one moment says little, but a stuck duck never comes up at all.
      // A minute in all: every duckling may still be waiting for her ceremony.
      var lowest = 1;
      for (var q = 0; q < 1800; q++) {
        e.step(dt);
        if (q % 8 === 0) e.render();
        if (q >= 1500) lowest = Math.min(lowest, e.duck.a.submerge);
      }
      d = e.duck;
      var end = {
        state: d.state, vanish: d.vanish || 0, submerge: lowest, carry: d.carry || null, giftRun: !!d.giftRun,
        babiesHidden: e.babies.filter(function (b) { return b.vanish || b.a.submerge > 0.2; }).length,
        submerged: e.submerged, drag: !!e.drag, hoard: !!e.hoard, laptop: !!e.laptop, buddy: !!e.buddy, disco: !!e.disco,
        flock: !!e.flock, sky: document.querySelectorAll('[data-cursor-duck-sky]').length, fledge: !!e.fledge,
        eggs: e.babies.filter(function (b) { return b.egg; }).length, broodQ: e.broodQ.length,
        shown: e.broodShown.slice(0, e.babies.length).join(','), ages: e.broodAges.slice(0, e.babies.length).join(',')
      };
      delete e._ensureLoop;
      e._wantPark = false;
      e.wake();
      seen.egg = hatched; seen.fledge = flew;
      return { bad: bad, seen: seen, end: end };
    },
    getURL: function (p) { return chrome.runtime.getURL(p); },
    sendMsg: function (m) {
      return new Promise(function (res) { chrome.runtime.sendMessage(m, function (r) { res(r === undefined ? null : r); }); });
    },
    openExt: function (p) { chrome.runtime.sendMessage({ type: 'test:open', path: p }); return true; },
    storageGet: function (area, keys) {
      return new Promise(function (res) { chrome.storage[area].get(keys, res); });
    },
    storageSet: function (area, patch) {
      return new Promise(function (res) { chrome.storage[area].set(patch, function () { res(true); }); });
    },
    storageClear: function (area) {
      return new Promise(function (res) { chrome.storage[area].clear(function () { res(true); }); });
    },
    // straight at the background page: the first visit of `day` (force: the popup's test switch)
    claim: function (day, at, force) {
      return new Promise(function (res) {
        chrome.runtime.sendMessage({ type: 'duck:day', day: day, at: at || 0, force: !!force }, function (r) { res(r); });
      });
    }
  };

  window.addEventListener('message', function (ev) {
    var m = ev.data;
    if (!m || m.__duckTest === undefined || ev.source !== window) return;
    var out;
    try { out = COMMANDS[m.cmd].apply(null, m.args || []); } catch (e) { out = { __error: String(e) }; }
    Promise.resolve(out).then(function (value) {
      window.postMessage({ __duckTestReply: m.__duckTest, value: JSON.stringify(value === undefined ? null : value) }, '*');
    });
  });
  document.documentElement.setAttribute('data-duck-bridge', '1');
})();
