/*
 * (c) 2026 Lucas Reiser (forliHD) — Alle Rechte vorbehalten. Siehe LICENSE.
 *
 * CursorDuck — Engine 🦆
 * Schwimmphysik, Verhaltens-Automat, Streicheln, Picken, Füttern,
 * Fisch-Jagd, Schwindel, Küken, Sound.
 */
(function (root) {
  'use strict';

  var TAU = Math.PI * 2;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var rand = function (a, b) { return a + Math.random() * (b - a); };
  var pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  // Frameraten-unabhängiges Annähern
  function approach(cur, tgt, rate, dt) {
    return cur + (tgt - cur) * (1 - Math.exp(-rate * dt));
  }

  var DEFAULTS = {
    enabled: true,
    model: 'mallard',
    size: 1.0,          // 0.5 – 2.0
    speed: 1.0,         // 0.4 – 2.0
    ducklings: 0,       // 0 – 6
    playfulness: 1.0,   // wie oft Idle-Aktionen kommen
    sound: false,
    volume: 0.35,
    effects: true,
    reflection: true,
    opacity: 1.0,
    peck: true,
    feed: true,         // Brotkrumen per Doppelklick
    sleepAfter: 15      // Sekunden Cursor-Stillstand bis zum Nickerchen
  };

  // ── Sound (komplett synthetisch, keine Assets) ────────────────
  function Sound() { this.ac = null; this.vol = 0.35; this.on = false; }
  Sound.prototype.unlock = function () {
    if (this.ac || !this.on) return;
    try {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (AC) this.ac = new AC();
    } catch (e) { /* egal */ }
  };
  Sound.prototype._env = function (g, t0, peak, dur, attack) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + (attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  };
  Sound.prototype.quack = function (pitch, joy) {
    if (!this.on) return;
    this.unlock();
    var ac = this.ac; if (!ac || ac.state === 'closed') return;
    if (ac.state === 'suspended') ac.resume();
    var t0 = ac.currentTime, p = pitch || 1;
    var out = ac.createGain();
    this._env(out, t0, this.vol * 0.9, 0.22);
    out.connect(ac.destination);
    var bp = ac.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 5;
    bp.frequency.setValueAtTime(1500 * p, t0);
    bp.frequency.exponentialRampToValueAtTime(620 * p, t0 + 0.18);
    bp.connect(out);
    for (var i = 0; i < 2; i++) {
      var o = ac.createOscillator();
      o.type = i ? 'square' : 'sawtooth';
      var f0 = (joy ? 620 : 500) * p * (i ? 1.005 : 1);
      o.frequency.setValueAtTime(f0, t0);
      o.frequency.exponentialRampToValueAtTime((joy ? 260 : 190) * p, t0 + 0.19);
      var g = ac.createGain(); g.gain.value = i ? 0.25 : 0.6;
      o.connect(g); g.connect(bp);
      o.start(t0); o.stop(t0 + 0.26);
    }
  };
  Sound.prototype.splash = function (power) {
    if (!this.on) return;
    this.unlock();
    var ac = this.ac; if (!ac || ac.state === 'closed') return;
    if (ac.state === 'suspended') ac.resume();
    var t0 = ac.currentTime, dur = 0.28;
    var len = Math.floor(ac.sampleRate * dur);
    var buf = ac.createBuffer(1, len, ac.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    var src = ac.createBufferSource(); src.buffer = buf;
    var hp = ac.createBiquadFilter(); hp.type = 'bandpass';
    hp.frequency.setValueAtTime(1800, t0);
    hp.frequency.exponentialRampToValueAtTime(600, t0 + dur);
    hp.Q.value = 0.8;
    var g2 = ac.createGain(); g2.gain.value = this.vol * 0.5 * (power || 1);
    src.connect(hp); hp.connect(g2); g2.connect(ac.destination);
    src.start(t0);
  };
  Sound.prototype.peck = function () {
    if (!this.on) return;
    this.unlock();
    var ac = this.ac; if (!ac || ac.state === 'closed') return;
    if (ac.state === 'suspended') ac.resume();
    var t0 = ac.currentTime;
    var o = ac.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(1700, t0);
    o.frequency.exponentialRampToValueAtTime(700, t0 + 0.05);
    var g = ac.createGain();
    this._env(g, t0, this.vol * 0.5, 0.07, 0.004);
    o.connect(g); g.connect(ac.destination);
    o.start(t0); o.stop(t0 + 0.09);
  };

  Sound.prototype.pop = function () {
    // Kurzer Cartoon-Plopp (fürs Platzen nach Überfütterung)
    if (!this.on) return;
    this.unlock();
    var ac = this.ac; if (!ac || ac.state === 'closed') return;
    if (ac.state === 'suspended') ac.resume();
    var t0 = ac.currentTime;
    var o = ac.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(340, t0);
    o.frequency.exponentialRampToValueAtTime(70, t0 + 0.11);
    var g = ac.createGain();
    this._env(g, t0, this.vol * 0.9, 0.13, 0.003);
    o.connect(g); g.connect(ac.destination);
    o.start(t0); o.stop(t0 + 0.16);
  };

  // ── Verhaltens-Katalog ────────────────────────────────────────
  // w = Gewicht in der Zufallsauswahl
  var IDLE_ACTIONS = [
    { id: 'look', w: 3.0, dur: [1.4, 2.4] },
    { id: 'preen', w: 2.6, dur: [1.8, 3.0] },
    { id: 'flap', w: 2.2, dur: [1.1, 1.5] },
    { id: 'shake', w: 1.8, dur: [0.9, 1.2] },
    { id: 'quack', w: 2.0, dur: [0.9, 1.3] },
    { id: 'dabble', w: 2.0, dur: [2.0, 3.2] },
    { id: 'dive', w: 1.1, dur: [2.4, 3.0] },
    { id: 'spin', w: 1.2, dur: [2.0, 2.8] },
    { id: 'bathe', w: 1.2, dur: [2.2, 3.0] },
    { id: 'bob', w: 2.4, dur: [1.2, 2.2] },
    { id: 'dance', w: 0.8, dur: [2.6, 3.4] },
    { id: 'waddle', w: 0.8, dur: [6.15, 6.15] }   // Landgang: feste Choreo-Länge
  ];

  function weightedAction() {
    var total = 0, i;
    for (i = 0; i < IDLE_ACTIONS.length; i++) total += IDLE_ACTIONS[i].w;
    var r = Math.random() * total;
    for (i = 0; i < IDLE_ACTIONS.length; i++) {
      r -= IDLE_ACTIONS[i].w;
      if (r <= 0) return IDLE_ACTIONS[i];
    }
    return IDLE_ACTIONS[0];
  }

  // Diese Zustände darf ein davonziehender Cursor sofort abbrechen —
  // sonst putzt sie sich seelenruhig fertig und wirkt abgehängt.
  var INTERRUPTIBLE = {
    look: 1, preen: 1, flap: 1, shake: 1, quack: 1,
    dabble: 1, spin: 1, bathe: 1, bob: 1, dance: 1
  };

  // ── Ente ──────────────────────────────────────────────────────
  function Duck(engine, model, isBaby) {
    this.e = engine;
    this.model = model;
    this.baby = !!isBaby;
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.dirF = 1;            // -1..1 → x-Skalierung, erlaubt echtes Drehen
    this.face = 1;            // Zielrichtung (Vorzeichen + Verkürzung bei steilem Kurs)
    this.tilt = 0;            // Neigung des Rumpfs in Schwimmrichtung
    this.spinAcc = 0;         // Cursor-Umkreisungen (Schwindel)
    this.lastAng = null;
    this.state = 'swim'; this.stTime = 0; this.stDur = 0;
    this.phase = Math.random() * TAU;
    this.paddle = Math.random() * TAU;
    this.a = {                // Animationswerte
      headDip: 0, headSide: 0, headRot: 0, eyeOpen: 1, eyeHappy: 0,
      wingFlap: 0, wingLift: 0, lean: 0, squash: 1, submerge: 0,
      blush: 0, sleep: 0, wobble: 0, beakOpen: 0, walk: 0
    };
    this.tgt = {};
    for (var k in this.a) this.tgt[k] = this.a[k];
    this.hopY = 0;            // Sprung-Offset (Landgang, Platzen)
    this.vanish = 0;          // 1 = kurz unsichtbar (geplatzt)
    this.fullness = 0;        // wie vollgefressen (Brotkrumen am Stück)
    this.pet = 0;
    this.petHold = 0;
    this.blinkIn = rand(1.5, 5);
    this.nextIdle = rand(1.5, 4);
    this.peckCd = rand(3, 7);
    this.rippleCd = 0;
    this.actionTick = 0;
    this.trail = [];
  }

  Duck.prototype.radius = function () {
    return 26 * this.e.cfg.size * (this.baby ? 0.55 : 1);
  };

  Duck.prototype.setState = function (s, dur) {
    if (this.state === s) return;
    this.state = s;
    this.stTime = 0;
    this.stDur = dur || 1;
    this.actionTick = 0;
  };

  Duck.prototype.say = function (txt, color) {
    var h = this.headWorld();
    this.e.fx.exclaim(h.x, h.y - this.radius() * 0.9, txt, color);
  };

  Duck.prototype.headWorld = function () {
    return DuckRender.headWorld(this.model, this.pose());
  };

  Duck.prototype.pose = function () {
    var a = this.a;
    var speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    var bobAmp = this.radius() * (0.055 + Math.min(0.05, speed * 0.00016));
    var dir = this.dirF >= 0 ? Math.max(0.14, this.dirF) : Math.min(-0.14, this.dirF);
    return {
      x: this.x, y: this.y, r: this.radius(), dir: dir, t: this.e.time,
      bob: Math.sin(this.e.time * 2.4 + this.phase) * bobAmp + (a.squash - 1) * this.radius() * 0.3,
      lean: a.lean + this.tilt + Math.sin(this.e.time * 1.9 + this.phase) * 0.018,
      headDip: a.headDip, headSide: a.headSide, headRot: a.headRot,
      eyeOpen: a.eyeOpen, eyeHappy: a.eyeHappy,
      wingFlap: a.wingFlap, wingLift: a.wingLift,
      paddle: this.paddle, squash: a.squash, submerge: a.submerge,
      alpha: this.e.cfg.opacity * (1 - (this.vanish || 0)),
      blush: a.blush, sleep: a.sleep,
      wobble: a.wobble, beakOpen: a.beakOpen,
      walk: a.walk, hop: this.hopY,
      water: !this.nesting,   // im Nest keine eigene Wasserlinie
      reflection: this.e.cfg.reflection && !this.baby
    };
  };

  // Trefferfläche zum Streicheln
  Duck.prototype.hit = function (px, py) {
    var r = this.radius() * (this.model.scale || 1);
    var cx = this.x, cy = this.y - r * 0.75;
    var rx = r * 1.35, ry = r * 1.25;
    var dx = (px - cx) / rx, dy = (py - cy) / ry;
    return dx * dx + dy * dy <= 1;
  };

  // ── Bewegung ──────────────────────────────────────────────────
  Duck.prototype.swim = function (dt, tx, ty, stopDist, boost) {
    var dx = tx - this.x, dy = ty - this.y;
    var dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
    var cfg = this.e.cfg;
    // Zuschau-Modus: wackelnder Cursor → stehenbleiben und gucken
    if (this.watchT > 0 && !this.baby) {
      this.vx = approach(this.vx, 0, 6, dt);
      this.vy = approach(this.vy, 0, 6, dt);
      return;
    }
    // Nach einem Cursor-Sprung (Fenster/iframe gewechselt) kurz extra flott
    var alert = this.e.alertT > 0 ? 1.3 : 1;
    var maxSpeed = (this.baby ? 520 : 430) * cfg.speed * (boost || 1) * alert;
    if (dist > stopDist) {
      var want = clamp((dist - stopDist) * 3.4, 0, maxSpeed);
      // Sprint, wenn die Ente weit abgehängt wurde
      if (dist > 420) want = Math.min(maxSpeed * 1.9, want * 1.5);
      var ux = dx / dist, uy = dy / dist;
      // Enten schlängeln beim Paddeln leicht seitlich
      var wob = Math.sin(this.e.time * 5.5 + this.phase) * 0.10 * Math.min(1, dist / 220);
      var wx = ux * Math.cos(wob) - uy * Math.sin(wob);
      var wy = ux * Math.sin(wob) + uy * Math.cos(wob);
      this.vx = approach(this.vx, wx * want, 5.5 * alert, dt);
      this.vy = approach(this.vy, wy * want, 5.5 * alert, dt);
    } else {
      this.vx = approach(this.vx, 0, 3.2, dt);
      this.vy = approach(this.vy, 0, 3.2, dt);
    }
  };

  Duck.prototype.integrate = function (dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    var speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);

    // Blickrichtung: die Ente richtet sich nach ihrem echten Kurs.
    // Bei steilem Kurs (fast senkrecht) wird der Körper leicht verkürzt,
    // als sähe man sie von vorn/hinten — wirkt wie echtes Eindrehen.
    if (Math.abs(this.vx) > 16 && speed > 24) {
      var horiz = Math.abs(this.vx) / speed;
      // Nur milde Verkürzung — die Richtung erzählt jetzt die Rumpf-Rotation
      this.face = (this.vx > 0 ? 1 : -1) * (0.72 + 0.28 * Math.min(1, horiz * 1.2));
    } else if (speed < 30) {
      this.face = this.face >= 0 ? 1 : -1;   // im Stand zurück ins volle Profil
    }
    // Bei Tempo dreht sie schneller ein
    this.dirF = approach(this.dirF, this.face, 8 + Math.min(6, speed * 0.01), dt);

    // Kehrtwende bei Fahrt → kleiner Drift-Schwall
    var sgn = this.face >= 0 ? 1 : -1;
    if (this._faceSgn === undefined) this._faceSgn = sgn;
    if (sgn !== this._faceSgn) {
      this._faceSgn = sgn;
      if (speed > 170 && this.e.cfg.effects && !this.baby) {
        var r0 = this.radius();
        this.e.fx.ripple(this.x, this.y, r0 * 0.3, r0 * 1.7, 1.0, 'rgba(255,255,255,0.5)', 1.8);
        for (var wd = 0; wd < 3; wd++) {
          this.e.fx.droplet(this.x - sgn * r0 * 0.6, this.y - 2,
            -sgn * rand(40, 140), -rand(40, 120), rand(1.0, 1.8));
        }
      }
    }

    // Voller Kurs: der ganze Rumpf dreht sich in die Schwimmrichtung.
    // Senkrecht nach oben/unten = Schnabel voraus (bis ~72°), im Stand
    // pendelt sie zurück in die Waagerechte.
    var tgtTilt = 0;
    if (speed > 26) {
      tgtTilt = Math.atan2(this.vy, Math.abs(this.vx)) * clamp((speed - 26) / 110, 0, 1);
    }
    this.tilt = approach(this.tilt, clamp(tgtTilt, -1.25, 1.25), 8, dt);

    // Paddeln schneller bei Tempo
    this.paddle += dt * (2.2 + speed * 0.022);

    // Am Rand bleiben — wilde Enten dürfen raus, sie ziehen ja weiter
    if (!this.wild) {
      var m = this.radius() * 1.2;
      this.x = clamp(this.x, -m, this.e.w + m);
      this.y = clamp(this.y, m * 0.6, this.e.h + m);
    }
    return speed;
  };

  // ── Verhalten ─────────────────────────────────────────────────
  Duck.prototype.update = function (dt) {
    var e = this.e, cfg = e.cfg, a = this.a, t = this.tgt;
    var px = e.px, py = e.py;
    this.stTime += dt;

    // Zielwerte je Frame neu setzen (Standard = entspannt schwimmen)
    t.headDip = 0; t.headSide = 0; t.headRot = 0; t.eyeHappy = 0;
    t.wingFlap = 0; t.wingLift = 0; t.lean = 0; t.squash = 1;
    t.submerge = 0; t.blush = 0; t.sleep = 0; t.wobble = 0;
    t.beakOpen = 0; t.eyeOpen = 1; t.walk = 0;
    // Sprung-Offset klingt ab, falls ihn kein Zustand setzt
    this.hopY *= Math.max(0, 1 - dt * 14);
    // Bäuchlein leert sich mit der Zeit von selbst
    this.fullness = Math.max(0, this.fullness - dt * 0.22);

    var dx = px - this.x, dy = py - this.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var r = this.radius();
    var stopDist = r * 1.9;
    var st = this.state;

    // ── Streicheln erkennen ─────────────────────────────────
    // (nicht beim Tauchen, an Land oder mitten im Platzen)
    var inside = this.hit(px, py);
    var petting = inside && e.pointerSpeed > 55 &&
      st !== 'dive' && st !== 'waddle' && st !== 'burst';
    if (petting) {
      if (e.pointerSpeed > 2100 && this.pet < 0.15 && st !== 'startle') {
        this.setState('startle', 0.8);
        this.vx += (this.x - px) * 2.4; this.vy += (this.y - py) * 2.4 - 60;
        e.fx.feather(this.x, this.y - r, this.model.belly);
        e.fx.feather(this.x + 6, this.y - r * 1.2, this.model.body);
        e.fx.splash(this.x, this.y, 0.7);
        this.say('!', '#ff6b4a');
        e.sound.quack(this.model.quackPitch * 1.5);
        e.stats.startles = (e.stats.startles || 0) + 1;
        e.saveStats();
      } else if (st !== 'startle') {
        this.setState('pet', 99);
        this.pet = clamp(this.pet + dt * 0.85, 0, 1.0001);
        this.petHold = 0.35;
        if (Math.random() < dt * 2.2) {
          e.fx.heart(this.x + rand(-r * 0.7, r * 0.7), this.y - r * 1.6, rand(4.5, 7) * cfg.size);
        }
        if (this.pet >= 1) {
          this.pet = 0.25;
          e.stats.pets++;
          e.saveStats();
          for (var i = 0; i < 5; i++) e.fx.heart(this.x + rand(-r, r), this.y - r * 1.4, rand(6, 9) * cfg.size);
          e.fx.sparkle(this.x, this.y - r * 1.4, '#ffd6e4', 8);
          e.sound.quack(this.model.quackPitch * 1.15, true);
          if (this.model.confetti) e.fx.confetti(this.x, this.y - r * 1.5);
        }
      }
    } else {
      this.petHold -= dt;
      this.pet = Math.max(0, this.pet - dt * (this.petHold > 0 ? 0.12 : 0.7));
      if (st === 'pet' && this.petHold <= 0) this.setState(dist > stopDist * 1.4 ? 'swim' : 'idle', 1);
    }

    // ── Aufmerksamer Blick: Kopfwinkel zum Cursor ──────────
    // Im lokalen Rahmen der Ente (+x = Blickrichtung): deutlich sichtbare
    // Kopfneigung zum Cursor. Zustände dürfen das überschreiben.
    var lookX = (px - this.x) * (this.dirF >= 0 ? 1 : -1);
    var lookY = py - (this.y - r * 1.55);
    this.lookAng = clamp(Math.atan2(lookY, Math.max(lookX, r * 0.8)), -0.55, 0.6);

    // ── Abgehängt? Spielerei abbrechen und hinterher ───────
    st = this.state;
    // In aufmerksamen Zuständen dreht sie sich immer zum Cursor
    if ((st === 'idle' || st === 'look' || st === 'bob' || st === 'quack') &&
        Math.abs(dx) > r * 0.55) {
      this.face = dx > 0 ? 1 : -1;
    }
    if (INTERRUPTIBLE[st] && dist > stopDist * 3 && e.pointerSpeed > 60) {
      this.quacked = false; this.peckDone = false; this.dove = false;
      this.surfaced = false; this.dabbleUp = false; this.splashed = false;
      this.setState('swim', 1);
      st = 'swim';
    }
    // Cursor macht einen großen Sprung (Fenster/iframe gewechselt) → kurz aufmerken
    if (!this.baby && e.alertPing && dist > 260 &&
        st !== 'sleep' && st !== 'pet' && st !== 'startle' && st !== 'burst') {
      this.say('!', '#4a90d9');
    }

    // ── Schwindel: Cursor kreist um die Ente ───────────────
    if (!this.baby) {
      var circleable = st === 'idle' || st === 'swim' || st === 'bob' || st === 'look';
      if (circleable && dist > r * 0.8 && dist < r * 7 && e.pointerSpeed > 140) {
        var ang = Math.atan2(dy, dx);
        if (this.lastAng != null) {
          var dAng = ang - this.lastAng;
          if (dAng > Math.PI) dAng -= TAU; else if (dAng < -Math.PI) dAng += TAU;
          if (Math.abs(dAng) < 1.0) this.spinAcc += dAng;
        }
        this.lastAng = ang;
      } else {
        this.lastAng = null;
      }
      this.spinAcc *= Math.max(0, 1 - dt * 0.55);   // verklingt von selbst
      if (circleable && Math.abs(this.spinAcc) > TAU * 1.7) {
        this.dizzyDir = this.spinAcc >= 0 ? 1 : -1;
        this.spinAcc = 0;
        this.setState('dizzy', 2.4);
        e.sound.quack(this.model.quackPitch * 0.75);
        st = 'dizzy';
      }

      var attentive = st === 'idle' || st === 'swim' || st === 'bob' || st === 'look' || st === 'quack';
      // Wackelnder Cursor: erst mal innehalten und zuschauen (Vorfreude) —
      // sonst schwimmt sie mitten ins Gewackel und landet beim Streicheln.
      if ((st === 'idle' || st === 'swim') && e.wiggleN >= 2 && !inside && dist < 340) {
        this.watchT = 0.45;
      }
      this.watchT = Math.max(0, (this.watchT || 0) - dt);
      // Tanz-Aufforderung: Cursor wackelt schnell hin und her in ihrer Nähe.
      // spinAcc-Guard: wer kreist, will den Schwindel, kein Tänzchen.
      if (attentive && e.wiggleN >= 4 && !inside && dist < 420 &&
          Math.abs(this.spinAcc) < TAU * 0.5) {
        e.wiggleN = 0;
        this.setState('dance', rand(2.6, 3.4));
        e.sound.quack(this.model.quackPitch * 1.2, true);
        st = 'dance';
      }
      // Kuckuck: Cursor ruht auf ihr (ohne Streichel-Gewackel) → kurz abtauchen.
      // Ein zwischenzeitliches Picken setzt den Zähler nicht zurück.
      if (inside && e.pointerSpeed < 40 && (attentive || st === 'peck')) {
        this.hoverT = (this.hoverT || 0) + dt;
      } else {
        this.hoverT = 0;
      }
      if (this.hoverT > 1.2 && attentive) {
        this.hoverT = 0;
        this.pkbDove = false; this.pkbUp = false;
        this.setState('peekaboo', 2.4);
        st = 'peekaboo';
      }

      // Ziemlich vollgefressen? Hicks als Vorwarnung vorm Platzen.
      if (this.fullness >= 5 && (st === 'idle' || st === 'swim' || st === 'feed')) {
        this.hicCd = (this.hicCd || 0) - dt;
        if (this.hicCd <= 0) {
          this.hicCd = rand(1.6, 2.8);
          a.squash = 1.12;
          a.beakOpen = 0.5;
          this.say('hicks!', '#c98a2e');
          e.fx.bubble(this.x + rand(-6, 6), this.y - r * 0.4);
          e.sound.quack(this.model.quackPitch * 1.5);
        }
      }
    }

    switch (st) {
      case 'pet':
        t.eyeHappy = 1; t.blush = clamp(this.pet * 1.6, 0, 1);
        t.wobble = Math.sin(e.time * 15) * 0.55 * clamp(this.pet * 2, 0, 1);
        t.squash = 1 + Math.sin(e.time * 15) * 0.05;
        t.wingLift = 0.25 + this.pet * 0.35;
        t.headRot = -0.18;
        this.swim(dt, px, py, r * 1.2, 0.35);
        break;

      case 'startle':
        t.eyeOpen = 1; t.wingFlap = 1 - this.stTime / this.stDur;
        t.headRot = -0.45; t.beakOpen = clamp(1 - this.stTime * 2.2, 0, 1);
        t.squash = 1 + Math.max(0, 0.16 - this.stTime * 0.3);
        this.vx = approach(this.vx, 0, 2.2, dt);
        this.vy = approach(this.vy, 0, 2.2, dt);
        if (this.stTime > this.stDur) this.setState('swim', 1);
        break;

      case 'peck':
        // Erst zum Cursor hindrehen, sonst pickt sie ins Leere
        if (Math.abs(dx) > r * 0.4) this.face = dx > 0 ? 1 : -1;
        // Kopf schnellt zum Cursor
        var k = this.stTime / this.stDur;
        var dip = k < 0.28 ? (k / 0.28) : k < 0.5 ? 1 : clamp(1 - (k - 0.5) / 0.5, 0, 1);
        t.headDip = dip;
        t.lean = dip * 0.13;
        t.beakOpen = k < 0.3 ? 0.5 * (k / 0.3) : 0.1;
        if (!this.peckDone && k >= 0.28) {
          this.peckDone = true;
          var h = this.headWorld();
          e.fx.ripple(px, py + 2, 3, 26, 0.6, 'rgba(255,255,255,0.7)', 2);
          for (var s = 0; s < 4; s++) e.fx.sparkle(px + rand(-6, 6), py + rand(-6, 6), '#fff3b0', rand(3, 6));
          e.fx.droplet(h.x, h.y, rand(-40, 40), -rand(40, 90), 2, 'rgba(200,235,255,0.9)');
          e.sound.peck();
          e.stats.pecks++;
          e.saveStats();
          if (Math.random() < 0.25) this.say(pick(['nom', 'quak', '♪']), '#4a90d9');
        }
        this.swim(dt, px, py, r * 1.5, 0.5);
        if (this.stTime > this.stDur) { this.setState('idle', 1); this.peckCd = rand(4, 9) / cfg.playfulness; }
        break;

      case 'sleep':
        t.sleep = 1; t.eyeOpen = 0; t.headRot = 0.12;
        t.squash = 1 + Math.sin(e.time * 1.2) * 0.03;
        this.actionTick -= dt;
        if (this.actionTick <= 0) {
          this.actionTick = 1.6;
          var hz = this.headWorld();
          e.fx.zzz(hz.x + r * 0.3, hz.y - r * 0.5);
          // nachts träumt sie in Sternchen
          if (e.isNight()) {
            e.fx.sparkle(hz.x - r * rand(0.1, 0.6), hz.y - r * rand(0.6, 1.2), '#b9c8ff', rand(3, 5));
          }
        }
        this.vx = approach(this.vx, 0, 1.5, dt);
        this.vy = approach(this.vy, 0, 1.5, dt);
        if (e.pointerIdle < 0.2 || dist > r * 4) {
          this.setState('wake', 0.7);
          this.say('!', '#ffb03d');
          e.sound.quack(this.model.quackPitch * 0.9);
        }
        break;

      case 'wake':
        t.eyeOpen = 1; t.wingFlap = clamp(1 - this.stTime * 2, 0, 1);
        t.beakOpen = clamp(0.7 - this.stTime * 1.6, 0, 1);
        t.squash = 1 + Math.max(0, 0.12 - this.stTime * 0.4);
        if (this.stTime > this.stDur) this.setState('swim', 1);
        break;

      // ── Idle-Aktionen ────────────────────────────────────
      case 'look':
        t.headRot = Math.sin(this.stTime * 2.6) * 0.36;
        t.eyeOpen = 1;
        if (this.stTime > this.stDur) this.setState('idle', 1);
        break;

      case 'preen':
        var pk = this.stTime / this.stDur;
        t.headSide = Math.sin(clamp(pk, 0, 1) * Math.PI) * (0.75 + Math.sin(this.stTime * 9) * 0.2);
        t.eyeOpen = 0.25;
        t.wingLift = 0.3;
        this.actionTick -= dt;
        if (this.actionTick <= 0 && pk > 0.15 && pk < 0.9) {
          this.actionTick = 0.42;
          var hp = this.headWorld();
          e.fx.droplet(hp.x, hp.y, rand(-50, 50), -rand(20, 70), rand(0.9, 1.7));
          if (Math.random() < 0.4) e.fx.feather(hp.x, hp.y, this.model.belly);
        }
        if (this.stTime > this.stDur) this.setState('idle', 1);
        break;

      case 'flap':
      case 'bathe':
        var fk = this.stTime / this.stDur;
        var beat = Math.sin(this.stTime * (st === 'bathe' ? 16 : 12));
        t.wingFlap = clamp(Math.abs(beat) * (1 - Math.pow(fk, 3)), 0, 1);
        t.squash = 1 + beat * 0.06;
        t.headRot = -0.2;
        t.beakOpen = st === 'bathe' ? 0.25 + beat * 0.2 : 0;
        this.actionTick -= dt;
        if (this.actionTick <= 0 && fk < 0.85) {
          this.actionTick = st === 'bathe' ? 0.06 : 0.1;
          var n = st === 'bathe' ? 3 : 2;
          for (var f = 0; f < n; f++) {
            e.fx.droplet(this.x + rand(-r, r), this.y - r * rand(0.2, 1.2),
              rand(-190, 190), -rand(60, 230), rand(1.0, 2.1));
          }
          if (Math.random() < 0.35) e.fx.ripple(this.x, this.y, 6, 40 + Math.random() * 30, 0.9, 'rgba(255,255,255,0.45)', 1.8);
        }
        if (!this.splashed && st === 'bathe' && fk > 0.1) { this.splashed = true; e.sound.splash(0.8); }
        if (this.stTime > this.stDur) { this.splashed = false; this.setState('idle', 1); }
        break;

      case 'shake':
        var sk = this.stTime / this.stDur;
        var amp = Math.sin(clamp(sk, 0, 1) * Math.PI);
        t.wobble = Math.sin(this.stTime * 34) * amp * 1.1;
        t.squash = 1 + Math.sin(this.stTime * 34) * 0.05 * amp;
        t.wingLift = amp * 0.5;
        this.actionTick -= dt;
        if (this.actionTick <= 0 && amp > 0.3) {
          this.actionTick = 0.05;
          e.fx.droplet(this.x + rand(-r * 0.8, r * 0.8), this.y - r * rand(0.4, 1.4),
            rand(-230, 230), -rand(30, 150), rand(0.9, 1.7));
        }
        if (this.stTime > this.stDur) this.setState('idle', 1);
        break;

      case 'quack':
        var qk = this.stTime / this.stDur;
        t.beakOpen = Math.max(0, Math.sin(qk * Math.PI * 2.4)) * 0.9;
        t.headRot = -0.28 - Math.max(0, Math.sin(qk * Math.PI * 2.4)) * 0.2;
        t.squash = 1 + Math.max(0, Math.sin(qk * Math.PI * 2.4)) * 0.05;
        if (!this.quacked) {
          this.quacked = true;
          e.sound.quack(this.model.quackPitch);
          var hq = this.headWorld();
          for (var q = 0; q < 3; q++) e.fx.note(hq.x + r * 0.5, hq.y - r * 0.2 - q * 6);
          e.fx.ripple(this.x, this.y, 8, 60, 1.0, 'rgba(255,255,255,0.4)', 1.6);
          if (this.model.confetti) e.fx.confetti(hq.x, hq.y);
          // Manche Modelle haben was zu sagen (Visionärs-Ente!) —
          // aber nicht, während sie unsichtbar ist (Burst-Fenster)
          if (this.model.sayings && !this.baby && !this.vanish && Math.random() < 0.55) {
            this.say(pick(this.model.sayings), '#9aa2ad');
          }
        }
        if (this.stTime > this.stDur) { this.quacked = false; this.setState('idle', 1); }
        break;

      case 'dabble':  // Gründeln: Kopf ins Wasser, Popo hoch
        var dk = this.stTime / this.stDur;
        var inW = clamp(dk * 4, 0, 1) * clamp((1 - dk) * 4, 0, 1);
        t.lean = inW * 0.92;
        t.headDip = inW * 0.42;
        t.submerge = inW * 0.10;
        t.wobble = Math.sin(this.stTime * 11) * 0.3 * inW;
        this.actionTick -= dt;
        if (this.actionTick <= 0 && inW > 0.6) {
          this.actionTick = 0.18;
          e.fx.bubble(this.x + r * this.dirF * 0.9 + rand(-6, 6), this.y + rand(2, 10));
          e.fx.ripple(this.x + r * this.dirF * 0.8, this.y, 4, 22, 0.7, 'rgba(255,255,255,0.4)', 1.4);
        }
        if (dk > 0.86 && !this.dabbleUp) {
          this.dabbleUp = true;
          e.fx.splash(this.x + r * this.dirF * 0.7, this.y, 0.7);
          e.sound.splash(0.5);
        }
        if (this.stTime > this.stDur) { this.dabbleUp = false; this.setState('shake', 1.0); }
        break;

      case 'dive':
        var vk = this.stTime / this.stDur;
        t.submerge = clamp(vk * 3.2, 0, 1) * clamp((1 - vk) * 3.2, 0, 1);
        t.lean = t.submerge * 0.5;
        if (!this.dove && vk > 0.08) {
          this.dove = true;
          e.fx.splash(this.x, this.y, 1.1);
          e.sound.splash(0.9);
        }
        this.actionTick -= dt;
        if (this.actionTick <= 0 && t.submerge > 0.7) {
          this.actionTick = 0.14;
          e.fx.bubble(this.x + rand(-r * 0.6, r * 0.6), this.y - rand(0, 6));
        }
        // Unterwasser bewegt sie sich Richtung Cursor
        if (t.submerge > 0.6) this.swim(dt, px, py, r, 0.9);
        if (vk > 0.78 && !this.surfaced) {
          this.surfaced = true;
          e.fx.splash(this.x, this.y, 1.4);
          e.sound.splash(1.1);
          for (var b = 0; b < 5; b++) e.fx.droplet(this.x + rand(-r, r), this.y - r, rand(-160, 160), -rand(120, 260), rand(1.3, 2.4));
        }
        if (this.stTime > this.stDur) { this.dove = false; this.surfaced = false; this.setState('shake', 1.0); }
        break;

      case 'spin':
        var spk = this.stTime / this.stDur;
        this.face = Math.cos(this.stTime * 3.4) > 0 ? 1 : -1;
        this.dirF = Math.cos(this.stTime * 3.4);
        t.headRot = -0.15;
        t.wingLift = 0.4;
        this.actionTick -= dt;
        if (this.actionTick <= 0 && spk < 0.9) {
          this.actionTick = 0.16;
          e.fx.ripple(this.x, this.y, 5, 34, 0.8, 'rgba(255,255,255,0.4)', 1.5);
        }
        if (this.stTime > this.stDur) this.setState('idle', 1);
        break;

      case 'bob':
        t.squash = 1 + Math.sin(this.stTime * 4.2) * 0.05;
        t.headRot = Math.sin(this.stTime * 4.2) * 0.12;
        if (this.stTime > this.stDur) this.setState('idle', 1);
        break;

      case 'dizzy': {
        // Taumeln nach zu viel Cursor-Karussell: dreht sich immer langsamer aus
        var zk = this.stTime / this.stDur;
        var slow = 1 - zk;
        this.dirF = Math.cos(this.stTime * (9 - zk * 6)) * (0.2 + slow * 0.8) * (this.dizzyDir || 1);
        this.face = this.dirF >= 0 ? 1 : -1;
        t.wobble = Math.sin(this.stTime * 12) * 0.7 * slow;
        t.eyeOpen = 0.35;
        t.headRot = Math.sin(this.stTime * 8) * 0.32 * slow;
        t.squash = 1 + Math.sin(this.stTime * 12) * 0.04 * slow;
        this.vx = approach(this.vx, 0, 3, dt);
        this.vy = approach(this.vy, 0, 3, dt);
        this.actionTick -= dt;
        if (this.actionTick <= 0) {
          this.actionTick = 0.22;
          var hd = this.headWorld();
          var oa = this.stTime * 7;
          e.fx.sparkle(hd.x + Math.cos(oa) * r * 0.95, hd.y - r * 0.35 + Math.sin(oa) * r * 0.3, '#ffd23d', 4.5);
        }
        if (this.stTime > this.stDur) {
          e.stats.dizzy = (e.stats.dizzy || 0) + 1;
          e.saveStats();
          this.setState('shake', 0.9);
        }
        break;
      }

      case 'dance': {
        // Tänzchen: wippen, wackeln, Nötchen — und im Takt umdrehen
        var dbeat = this.stTime * 7.5;
        var denv = Math.min(1, this.stTime * 3) * clamp((this.stDur - this.stTime) * 2, 0, 1);
        t.squash = 1 + Math.sin(dbeat) * 0.07 * denv;
        t.wobble = Math.sin(dbeat * 0.5) * 0.55 * denv;
        t.wingLift = 0.3 + Math.max(0, Math.sin(dbeat)) * 0.4 * denv;
        t.headRot = -0.12 + Math.sin(dbeat + 1.2) * 0.16 * denv;
        t.beakOpen = Math.max(0, Math.sin(dbeat)) * 0.2 * denv;
        t.eyeHappy = 1;
        this.face = Math.sin(this.stTime * 2.6) >= 0 ? 1 : -1;
        this.vx = approach(this.vx, 0, 3, dt);
        this.vy = approach(this.vy, 0, 3, dt);
        this.actionTick -= dt;
        if (this.actionTick <= 0) {
          this.actionTick = 0.42;
          var hn = this.headWorld();
          e.fx.note(hn.x + rand(-r * 0.4, r * 0.4), hn.y - r * 0.5);
          if (Math.random() < 0.4) e.fx.ripple(this.x, this.y, 4, 30, 0.8, 'rgba(255,255,255,0.4)', 1.5);
        }
        if (this.stTime > this.stDur) {
          e.sound.quack(this.model.quackPitch * 1.15, true);
          e.stats.dances = (e.stats.dances || 0) + 1;
          e.saveStats();
          this.setState('idle', 1);
        }
        break;
      }

      case 'peekaboo': {
        // Kuckuck! Kurz abtauchen und neben dem Cursor wieder auftauchen
        var bk = this.stTime / this.stDur;
        t.submerge = clamp(bk * 3.6, 0, 1) * clamp((1 - bk) * 3.6, 0, 1);
        t.eyeHappy = 1;
        if (!this.pkbDove && bk > 0.05) {
          this.pkbDove = true;
          this.pkbSide = this.x < 200 ? 1 : this.x > e.w - 200 ? -1 : (Math.random() < 0.5 ? -1 : 1);
          e.fx.splash(this.x, this.y, 0.8);
          e.sound.splash(0.6);
        }
        this.actionTick -= dt;
        if (this.actionTick <= 0 && t.submerge > 0.5) {
          this.actionTick = 0.15;
          e.fx.bubble(this.x + rand(-r * 0.5, r * 0.5), this.y - rand(0, 6));
        }
        if (t.submerge > 0.5) this.swim(dt, px + this.pkbSide * 130, py + 26, r * 0.5, 1.2);
        if (bk > 0.8 && !this.pkbUp) {
          this.pkbUp = true;
          e.fx.splash(this.x, this.y, 1.1);
          e.sound.splash(0.9);
          this.say('!', '#59b6f7');
          e.sound.quack(this.model.quackPitch * 1.25, true);
        }
        if (this.stTime > this.stDur) {
          this.pkbDove = false; this.pkbUp = false;
          e.stats.peekaboos = (e.stats.peekaboos || 0) + 1;
          e.saveStats();
          this.setState('shake', 0.8);
        }
        break;
      }

      case 'waddle': {
        // Landgang: aus dem Wasser hüpfen, einmal stolz im Kreis watscheln,
        // dann genau an derselben Stelle wieder reinspringen.
        var W_OUT = 0.7, W_WALK = 4.6, W_IN = 0.8;
        if (!this.wadInit) {
          this.wadInit = true;
          this.wadDir = Math.random() < 0.5 ? -1 : 1;
          this.wadR = Math.max(46, r * 1.5);
          // Der Kreis liegt komplett auf der wadDir-Seite des Startpunkts —
          // Startpunkt so verschieben, dass alles im Fenster bleibt.
          var wx0 = this.wadDir > 0
            ? clamp(this.x, r * 1.4, e.w - this.wadR * 2 - r * 1.4)
            : clamp(this.x, this.wadR * 2 + r * 1.4, e.w - r * 1.4);
          var wy0 = clamp(this.y, r * 2 + this.wadR * 0.45, e.h - r - this.wadR * 0.45);
          this.wadX0 = wx0; this.wadY0 = wy0;
          this.x = wx0; this.y = wy0;
          e.fx.splash(wx0, wy0, 0.9);
          e.sound.splash(0.7);
          for (var wd2 = 0; wd2 < 6; wd2++) {
            e.fx.droplet(wx0 + rand(-r, r), wy0 - r * rand(0.2, 1),
              rand(-80, 80), -rand(30, 120), rand(1, 1.9));
          }
        }
        var wt = this.stTime;
        this.vx = 0; this.vy = 0;
        t.walk = 1;
        if (wt < W_OUT) {
          // Raufhüpfen auf die Oberfläche
          var ok = wt / W_OUT;
          this.hopY = Math.sin(ok * Math.PI) * r * 0.55;
          t.wingFlap = (1 - ok) * 0.5;
        } else if (wt < W_OUT + W_WALK) {
          // Einmal im Kreis (der Kreis geht durch den Startpunkt)
          var k3 = (wt - W_OUT) / W_WALK;
          var wang = k3 * TAU;
          var wpx = this.wadX0 + this.wadDir * this.wadR * (1 - Math.cos(wang));
          var wpy = this.wadY0 + this.wadR * 0.42 * Math.sin(wang);
          var ddx = wpx - this.x;
          if (Math.abs(ddx) > 0.4) this.face = ddx > 0 ? 1 : -1;
          this.x = wpx; this.y = wpy;
          // Watschel-Gang: Trippel-Schritte, Kippeln von Bein zu Bein
          this.paddle += dt * 9;
          t.lean = Math.sin(this.paddle) * 0.09;
          t.wobble = Math.sin(this.paddle) * 0.3;
          this.hopY = Math.abs(Math.sin(this.paddle)) * r * 0.07;
          t.headRot = -0.06 + Math.sin(this.paddle * 0.5) * 0.05;
          this.actionTick -= dt;
          if (this.actionTick <= 0) {
            this.actionTick = 0.3;
            // Schrittchen kräuseln die Oberfläche, frisch raus tropft sie noch
            e.fx.ripple(this.x + rand(-r * 0.3, r * 0.3), this.y, 2, 13, 0.55, 'rgba(255,255,255,0.4)', 1.2);
            if (wt < W_OUT + 1.6) {
              e.fx.droplet(this.x + rand(-r * 0.5, r * 0.5), this.y - r * 0.5,
                rand(-30, 30), rand(10, 60), rand(0.8, 1.4));
            }
          }
          if (!this.wadQuacked && k3 > 0.45) {
            this.wadQuacked = true;
            e.sound.quack(this.model.quackPitch * 1.05, true);
            var hw2 = this.headWorld();
            e.fx.note(hw2.x + this.dirF * 8, hw2.y - r * 0.3);
          }
        } else {
          // Absprung — genau dort rein, wo sie rausgeklettert ist
          var k4 = clamp((wt - W_OUT - W_WALK) / W_IN, 0, 1);
          this.x = this.wadX0; this.y = this.wadY0;
          this.hopY = Math.sin(k4 * Math.PI) * r * 0.95;
          t.wingFlap = 0.5;
          t.walk = k4 > 0.55 ? 0 : 1;
          t.eyeHappy = 1;
          if (!this.wadSplash && k4 > 0.82) {
            this.wadSplash = true;
            e.fx.splash(this.x, this.y, 1.5);
            e.sound.splash(1.2);
            for (var ws = 0; ws < 6; ws++) {
              e.fx.droplet(this.x + rand(-r, r), this.y - 2,
                rand(-170, 170), -rand(80, 240), rand(1.2, 2.2));
            }
          }
        }
        if (wt > W_OUT + W_WALK + W_IN) {
          this.wadInit = this.wadQuacked = this.wadSplash = false;
          e.stats.waddles = (e.stats.waddles || 0) + 1;
          e.saveStats();
          this.setState('bob', 1.2);
        }
        break;
      }

      case 'burst': {
        // Zu viel gefuttert: aufplustern, PLOPP, Federwolke — und gleich
        // wieder auftauchen, als wäre (fast) nichts gewesen.
        var bkT = this.stTime;
        this.vx = approach(this.vx, 0, 4, dt);
        this.vy = approach(this.vy, 0, 4, dt);
        if (bkT < 0.62) {
          var inf = bkT / 0.62;
          t.squash = 1 + inf * 0.55;
          t.wobble = Math.sin(bkT * 30) * 0.25 * inf;
          t.beakOpen = inf * 0.5;
          t.wingLift = inf * 0.8;
          t.blush = 1;
          t.eyeOpen = 1;
          if (!this.burstOh && bkT > 0.12) {
            this.burstOh = true;
            this.say('oh-oh', '#ff9d2e');
          }
        } else if (!this.burstPop) {
          this.burstPop = true;
          var br = this.radius();
          for (var fi = 0; fi < 16; fi++) {
            e.fx.feather(this.x + rand(-br, br) * 0.6, this.y - br * rand(0.2, 1.4),
              fi % 3 === 0 ? this.model.body : (fi % 3 === 1 ? this.model.belly : this.model.wing));
          }
          e.fx.splash(this.x, this.y, 1.5);
          e.fx.puff(this.x, this.y - br * 0.6, 'rgba(255,244,214,0.75)');
          e.fx.exclaim(this.x, this.y - br * 1.9, 'PLOPP!', '#ff6b4a');
          e.sound.pop();
          e.sound.splash(1.2);
          this.vanish = 1;
          this.fullness = 0;
          e.stats.bursts = (e.stats.bursts || 0) + 1;
          e.saveStats();
        } else if (bkT > 1.7 && !this.burstBack) {
          this.burstBack = true;
          this.vanish = 0;
          a.submerge = 1;      // von unten wieder auftauchen
          a.squash = 0.92;
          e.fx.splash(this.x, this.y, 1.1);
          e.sound.splash(0.9);
          e.sound.quack(this.model.quackPitch * 1.3, true);
          this.say('puh!', '#59b6f7');
        } else if (this.burstBack) {
          t.eyeHappy = 1;
          t.blush = 0.8;       // ein bisschen verlegen
        }
        // solange sie weg ist, blubbert es an der Stelle
        if (this.vanish && Math.random() < dt * 8) {
          e.fx.bubble(this.x + rand(-14, 14), this.y + rand(-4, 6));
        }
        if (bkT > this.stDur) {
          this.burstOh = this.burstPop = this.burstBack = false;
          this.setState('shake', 1.0);
        }
        break;
      }

      case 'greet': {
        // Besuch! Erst Quak-Duett, dann synchrones Tänzchen mit Pirouette.
        var vg = e.visitor;
        if (!vg) { this.setState('idle', 1); break; }
        this.vx = approach(this.vx, 0, 3, dt);
        this.vy = approach(this.vy, 0, 3, dt);
        if (vg.wildPhase === 'dance') {
          // Beide tanzen zum selben Takt (e.time), gespiegelt zueinander
          var gb = e.time * 7.5;
          var gdk = vg.stTime;
          var genv = Math.min(1, gdk * 3) * clamp((3.6 - gdk) * 2, 0, 1);
          t.eyeHappy = 1;
          t.squash = 1 + Math.sin(gb) * 0.07 * genv;
          t.wobble = Math.sin(gb * 0.5) * 0.5 * genv;
          t.wingLift = 0.25 + Math.max(0, Math.sin(gb)) * 0.4 * genv;
          t.headRot = -0.12 + Math.sin(gb + 1.2) * 0.15 * genv;
          t.beakOpen = Math.max(0, Math.sin(gb)) * 0.22 * genv;
          if (gdk > 1.55 && gdk < 2.35) {
            // Pirouette in der Mitte — gegenläufig zum Besuch
            this.dirF = Math.cos((gdk - 1.55) * 7.85) * (vg.wildSide >= 0 ? -1 : 1);
            this.face = this.dirF >= 0 ? 1 : -1;
          } else if (Math.abs(vg.x - this.x) > r * 0.4) {
            this.face = vg.x > this.x ? 1 : -1;
          }
          this.actionTick -= dt;
          if (this.actionTick <= 0) {
            this.actionTick = 0.55;
            var hgd = this.headWorld();
            e.fx.note(hgd.x + rand(-6, 6), hgd.y - r * 0.4);
          }
        } else {
          // Begrüßung: zur wilden Ente drehen und im Wechsel zurückquaken
          if (Math.abs(vg.x - this.x) > r * 0.4) this.face = vg.x > this.x ? 1 : -1;
          t.headRot = -0.1;
          t.eyeHappy = this.stTime > 1 ? 1 : 0;
          this.actionTick -= dt;
          if (this.actionTick <= 0) {
            this.actionTick = 1.8;
            e.sound.quack(this.model.quackPitch, true);
            var hgr = this.headWorld();
            e.fx.note(hgr.x + this.dirF * 6, hgr.y - r * 0.3);
            this.greetQuackT = 0.5;
          }
          this.greetQuackT = Math.max(0, (this.greetQuackT || 0) - dt);
          if (this.greetQuackT > 0) t.beakOpen = Math.sin(this.greetQuackT * Math.PI * 2) * 0.55 + 0.2;
        }
        if (this.stTime > this.stDur || vg.wildPhase === 'leave' && this.stTime > 1) {
          this.setState('idle', 1);
        }
        break;
      }

      case 'hunt': {
        // Fisch jagen: hinterher, und wenn er nah genug ist → zuschnappen
        var f = e.fish;
        if (!f) { this.setState('look', 1.0); break; }
        var hdx = f.x - this.x, hdy = f.y - this.y;
        var hdist = Math.sqrt(hdx * hdx + hdy * hdy);
        t.headRot = clamp(hdy * 0.002, -0.3, 0.35);
        t.eyeOpen = 1;
        var htx = f.x + f.vx * 0.22, hty = f.y + f.vy * 0.22;
        if (hdist > 200) {
          this.swim(dt, htx, hty, r * 0.55, 1.35);
        } else {
          // Endspurt: volle Fahrt aufs Ziel — der Proportionalregler von
          // swim() würde hier ausrollen und langsamer werden als der Fisch.
          var hd0 = Math.sqrt((htx - this.x) * (htx - this.x) + (hty - this.y) * (hty - this.y)) || 1;
          var chase = 470 * cfg.speed;
          this.vx = approach(this.vx, (htx - this.x) / hd0 * chase, 6, dt);
          this.vy = approach(this.vy, (hty - this.y) / hd0 * chase, 6, dt);
        }
        this.snapCd = Math.max(0, (this.snapCd || 0) - dt);
        // Zuschnappen ist ein Ausfall mit dem Hals, kein Punkttreffer:
        // großzügige, größenunabhängige Reichweite. Ein enges Fenster kann
        // eine kleine Ente kinematisch nie treffen (Wenderadius > Fenster),
        // sie orbitiert dann ewig um den Fisch.
        if (hdist < Math.max(95, r * 1.4) && this.snapCd <= 0 && this.stTime > 0.3) {
          this.snapCd = 0.75;
          a.headDip = 0.9; a.beakOpen = 0.9;   // Schnapp-Ruck ohne Einblenden
          e.fx.splash(f.x, f.y, 0.8);
          e.sound.splash(0.6);
          if (Math.random() < 0.65) {
            e.fish = null;
            e.stats.fish = (e.stats.fish || 0) + 1;
            e.saveStats();
            e.fx.sparkle(this.x + this.dirF * r, this.y - r, '#ffe066', 6);
            this.say('nom', '#4a90d9');
            e.sound.peck();
            this.gulped = false;
            this.setState('gulp', 1.15);
          } else {
            // Daneben! Der Fisch bekommt ein echtes Fluchtfenster:
            // sie verliert Schwung und braucht länger bis zum nächsten Schnapp.
            f.scared = 2.2;
            this.snapCd = 1.4;
            this.vx *= 0.25; this.vy *= 0.25;
            if (Math.random() < 0.5) this.say('!', '#ff9d2e');
          }
        }
        if (this.stTime > 8) this.setState('shake', 1.0);   // irgendwann aufgeben
        break;
      }

      case 'gulp':
        // Fisch runterschlucken: Kopf in den Nacken
        var gk = this.stTime / this.stDur;
        t.headRot = gk < 0.4 ? -0.55 : -0.15;
        t.beakOpen = gk < 0.35 ? 0.7 : 0;
        t.squash = 1 + Math.sin(gk * Math.PI) * 0.06;
        this.vx = approach(this.vx, 0, 3, dt);
        this.vy = approach(this.vy, 0, 3, dt);
        if (!this.gulped && gk > 0.5) {
          this.gulped = true;
          e.fx.heart(this.x, this.y - r * 1.7, 6 * cfg.size);
          e.sound.quack(this.model.quackPitch * 1.1, true);
        }
        if (this.stTime > this.stDur) { this.gulped = false; this.setState('idle', 1); }
        break;

      case 'feed': {
        // Brotkrumen aufsammeln, eine nach der anderen
        var crumbs = e.crumbs;
        if (!crumbs.length) { this.setState('idle', 1); break; }
        var best = null, bd = 1e18;
        for (var ci = 0; ci < crumbs.length; ci++) {
          var cdx = crumbs[ci].x - this.x, cdy = crumbs[ci].y - this.y;
          var cd = cdx * cdx + cdy * cdy;
          if (cd < bd) { bd = cd; best = crumbs[ci]; }
        }
        bd = Math.sqrt(bd);
        this.swim(dt, best.x, best.y, r * 0.85, 1.15);
        if (bd < r * 1.5) {
          var nib = Math.sin(e.time * 13);
          t.headDip = 0.55 + nib * 0.3;
          t.headRot = 0.1;
          t.beakOpen = Math.max(0, nib) * 0.5;
          t.lean = 0.14;
          this.actionTick -= dt;
          if (this.actionTick <= 0) {
            this.actionTick = 0.34;
            best.size -= 1.1;
            e.fx.ripple(best.x, best.y, 2, 16, 0.6, 'rgba(255,255,255,0.5)', 1.4);
            e.sound.peck();
            if (best.size <= 1.2) {
              crumbs.splice(crumbs.indexOf(best), 1);
              e.fx.sparkle(best.x, best.y - 6, '#ffe9b8', 5);
              e.stats.crumbs = (e.stats.crumbs || 0) + 1;
              e.saveStats();
              this.fullness += 1;
              if (Math.random() < 0.4) this.say('nom', '#c98a2e');
              // Zu viel am Stück? Dann macht es gleich PLOPP.
              if (this.fullness >= 9) {
                this.burstOh = this.burstPop = this.burstBack = false;
                this.setState('burst', 3.2);
                break;
              }
              if (!crumbs.length) {
                e.fx.heart(this.x, this.y - r * 1.8, 6 * cfg.size);
                e.sound.quack(this.model.quackPitch * 1.1, true);
                this.setState('idle', 1);
              }
            }
          }
        }
        break;
      }

      case 'idle':
        // Kopf folgt dem Cursor (Drehen übernimmt der Block vor dem Automaten)
        t.headRot = this.lookAng;
        this.swim(dt, px, py, stopDist, 0.6);
        this.nextIdle -= dt * cfg.playfulness;
        this.peckCd -= dt;

        // Brotkrumen schlagen alles. (Bewusst ohne cfg.feed-Check: das Setting
        // gated nur das Werfen per Doppelklick — liegen Krumen da, etwa vom
        // Popup-Knopf, werden sie immer gefressen, sonst verwaisen sie.)
        if (e.crumbs.length) { this.setState('feed', 99); break; }
        // Fisch entdeckt?
        if (e.fish && e.fish.alpha > 0.5 && !e.fish.caught) {
          var fdx0 = e.fish.x - this.x, fdy0 = e.fish.y - this.y;
          if (fdx0 * fdx0 + fdy0 * fdy0 < 320 * 320) {
            this.say('!', '#4a90d9');
            this.setState('hunt', 99);
            break;
          }
        }
        if (dist > stopDist * 1.6) { this.setState('swim', 1); break; }
        if (e.pointerIdle > cfg.sleepAfter * (e.isNight() ? 0.5 : 1)) {
          e.stats.sleeps = (e.stats.sleeps || 0) + 1;
          e.saveStats();
          this.setState('sleep', 99);
          break;
        }
        if (cfg.peck && this.peckCd <= 0 && dist < r * 3.4 && e.pointerIdle > 0.6) {
          this.peckDone = false;
          this.setState('peck', 0.62);
          break;
        }
        if (this.nextIdle <= 0) {
          var act = weightedAction();
          this.nextIdle = rand(2.2, 6.5) / cfg.playfulness;
          this.setState(act.id, rand(act.dur[0], act.dur[1]));
        }
        break;

      case 'swim':
      default:
        if (e.crumbs.length && !this.baby) { this.setState('feed', 99); break; }
        this.swim(dt, px, py, stopDist, 1);
        var spd0 = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        t.lean = clamp(-spd0 * 0.00022 - (dist > 420 ? 0.06 : 0), -0.14, 0);
        // Blick zum Ziel, überlagert vom Planing-Nicken bei Tempo
        t.headRot = clamp(this.lookAng * 0.55 - spd0 * 0.00025, -0.5, 0.45);
        t.wingLift = clamp((spd0 - 300) / 500, 0, 0.5);
        if (dist < stopDist * 1.15) this.setState('idle', 1);
        break;
    }

    // Voller Bauch macht sichtbar pummelig — bis es irgendwann PLOPP macht
    if (this.fullness > 0 && this.state !== 'burst') {
      t.squash *= 1 + Math.min(1, this.fullness / 9) * 0.15;
    }

    // ── Physik & Animation ──────────────────────────────────
    var speed = this.integrate(dt);

    // Blinzeln
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) { this.blinkIn = rand(2.2, 6.5); this.blinkT = 0.16; }
    if (this.blinkT > 0) { this.blinkT -= dt; t.eyeOpen = Math.min(t.eyeOpen, 0.05); }

    var rate = 12;
    a.headDip = approach(a.headDip, t.headDip, 22, dt);
    a.headSide = approach(a.headSide, t.headSide, 10, dt);
    a.headRot = approach(a.headRot, t.headRot, 8, dt);
    a.eyeOpen = approach(a.eyeOpen, t.eyeOpen, 26, dt);
    a.eyeHappy = approach(a.eyeHappy, t.eyeHappy, 14, dt);
    a.wingFlap = approach(a.wingFlap, t.wingFlap, 20, dt);
    a.wingLift = approach(a.wingLift, t.wingLift, 8, dt);
    a.lean = approach(a.lean, t.lean, 7, dt);
    a.squash = approach(a.squash, t.squash, rate, dt);
    a.submerge = approach(a.submerge, t.submerge, 7, dt);
    a.blush = approach(a.blush, t.blush, 6, dt);
    a.sleep = approach(a.sleep, t.sleep, 4, dt);
    a.wobble = approach(a.wobble, t.wobble, 26, dt);
    a.beakOpen = approach(a.beakOpen, t.beakOpen, 24, dt);
    a.walk = approach(a.walk, t.walk, 6, dt);

    // ── Wasserspur ──────────────────────────────────────────
    if (cfg.effects && a.submerge < 0.7) {
      this.rippleCd -= dt;
      if (this.rippleCd <= 0 && speed > 26) {
        this.rippleCd = clamp(0.36 - speed * 0.00035, 0.08, 0.36);
        var back = -this.dirF;
        e.fx.ripple(this.x + back * r * 0.5, this.y + rand(-2, 3),
          r * 0.25, r * (1.1 + speed * 0.0016), 1.3,
          'rgba(255,255,255,' + clamp(0.22 + speed * 0.0007, 0.22, 0.55).toFixed(2) + ')',
          1.4);
        if (speed > 240 && Math.random() < 0.5) {
          e.fx.droplet(this.x + this.dirF * r * 0.9, this.y - r * 0.1,
            this.vx * 0.12 + rand(-30, 30), -rand(40, 110), rand(0.9, 1.6));
        }
        if (this.model.trail) {
          e.fx.ripple(this.x, this.y, r * 0.2, r * 1.6, 1.1, this.model.trail, 3);
        }
      }
      // Funkel-Modelle
      if (this.model.sparkle && Math.random() < dt * 6 * this.model.sparkle) {
        e.fx.sparkle(this.x + rand(-r, r), this.y - r * rand(0.2, 2.0),
          this.model.glow || '#fff3b0', rand(3, 7) * cfg.size);
      }
    }

    // Trail-Punkte für die Küken
    if (!this.baby) {
      var last = this.trail[0];
      if (!last || Math.abs(last.x - this.x) + Math.abs(last.y - this.y) > 3) {
        this.trail.unshift({ x: this.x, y: this.y });
        if (this.trail.length > 400) this.trail.pop();
      }
    }
  };

  // Position entlang der Spur (Bogenlänge) – für die Küken-Reihe
  Duck.prototype.sampleTrail = function (distWanted) {
    var tr = this.trail;
    if (!tr.length) return { x: this.x, y: this.y };
    var acc = 0;
    for (var i = 1; i < tr.length; i++) {
      var dx = tr[i].x - tr[i - 1].x, dy = tr[i].y - tr[i - 1].y;
      var seg = Math.sqrt(dx * dx + dy * dy);
      if (acc + seg >= distWanted) {
        var f = seg ? (distWanted - acc) / seg : 0;
        return { x: tr[i - 1].x + dx * f, y: tr[i - 1].y + dy * f };
      }
      acc += seg;
    }
    var lastP = tr[tr.length - 1];
    return { x: lastP.x, y: lastP.y };
  };

  // ── Küken ─────────────────────────────────────────────────────
  var babyOf = DuckRender.babyOf;   // Modell-Variante lebt im Renderer

  // ── Engine ────────────────────────────────────────────────────
  function Engine(opts) {
    this.cfg = {};
    for (var k in DEFAULTS) this.cfg[k] = DEFAULTS[k];
    if (opts) for (var k2 in opts) this.cfg[k2] = opts[k2];

    this.time = 0;
    this.w = root.innerWidth || 800; this.h = root.innerHeight || 600;
    this.px = this.w * 0.5; this.py = this.h * 0.5;
    this.ppx = this.px; this.ppy = this.py;
    this.pointerSpeed = 0;
    this.pointerIdle = 0;
    this.alertT = 0;          // kurz erhöhtes Tempo nach Cursor-Sprung
    this.alertPing = false;   // Ein-Frame-Signal für die "!"-Reaktion
    this.fx = new DuckFX();
    this.sound = new Sound();
    this.sound.on = !!this.cfg.sound;
    this.sound.vol = this.cfg.volume;
    this.stats = { pets: 0, pecks: 0 };
    this.running = false;
    this.babies = [];
    this.crumbs = [];         // Brotkrumen auf dem Wasser
    this.fish = null;         // höchstens ein Fisch zur Zeit
    this.fishCd = rand(20, 45);
    this.visitor = null;      // wilde Ente auf der Durchreise
    this.visitorCd = rand(120, 300);
    this.nest = null;         // Küken-Nest, taucht auf wenn Mama schläft
    this._bound = {};
    this.setModel(this.cfg.model);
  }

  Engine.prototype.setModel = function (id) {
    var mid = (id === 'random' || !id) ? DuckModels.randomId() : id;
    var prev = this.modelId;
    this.modelId = mid;
    var m = DuckModels.get(mid);
    // Erfolgs-Zähler: Modenschau & Legendäre (nicht beim ersten Boot)
    if (this.duck && mid !== prev) {
      this.stats.modelSwitches = (this.stats.modelSwitches || 0) + 1;
      if (m.tier === 'legendary') this.stats.legendary = 1;
      this.saveStats();
    }
    if (this.duck) {
      this.duck.model = m;
    } else {
      this.duck = new Duck(this, m, false);
      this.duck.x = this.px - 80;
      this.duck.y = this.py + 40;
    }
    this.rebuildBabies();
  };

  Engine.prototype.rebuildBabies = function () {
    var want = Math.max(0, Math.min(8, this.cfg.ducklings | 0));
    var bm = babyOf(this.duck.model);
    this.babies.length = 0;
    for (var i = 0; i < want; i++) {
      var b = new Duck(this, bm, true);
      b.x = this.duck.x - (i + 1) * 24;
      b.y = this.duck.y + 6;
      b.gap = 34 * this.cfg.size * (i + 1);
      this.babies.push(b);
    }
  };

  Engine.prototype.apply = function (cfg) {
    var modelChanged = cfg.model !== undefined && cfg.model !== this.cfg.model;
    for (var k in cfg) if (cfg[k] !== undefined) this.cfg[k] = cfg[k];
    this.sound.on = !!this.cfg.sound;
    this.sound.vol = this.cfg.volume;
    if (modelChanged) this.setModel(this.cfg.model);
    else this.rebuildBabies();
    if (!this.cfg.enabled) this.stop(); else this.start();
  };

  Engine.prototype.saveStats = function () {
    if (this.onStats) this.onStats(this.stats);
  };

  // Nachts (22–6 Uhr) wird sie schneller müde und träumt mit Sternchen
  Engine.prototype.isNight = function () {
    var h = new Date().getHours();
    return h >= 22 || h < 6;
  };

  // ── Fisch ─────────────────────────────────────────────────────
  Engine.prototype.spawnFish = function () {
    var d = this.duck;
    var side = Math.random() < 0.5 ? -1 : 1;
    var y = clamp(d.y + rand(-120, 160), 40, this.h - 30);
    var x = clamp(d.x + side * rand(240, 400), -40, this.w + 40);
    this.fish = {
      x: x, y: y,
      vx: -side * rand(45, 75) * this.cfg.speed,   // zieht gemütlich an der Ente vorbei
      vy: 0,
      phase: Math.random() * TAU,
      scared: 0, life: 22, alpha: 0
    };
    return this.fish;
  };

  Engine.prototype.updateFish = function (dt) {
    var f = this.fish;
    if (!f) {
      // Nur nachlegen, wenn die Ente gerade Muße hat
      var st = this.duck.state;
      var calm = st === 'idle' || st === 'swim' || st === 'bob' || st === 'look';
      if (calm && this.cfg.playfulness > 0.25) {
        this.fishCd -= dt * this.cfg.playfulness;
        if (this.fishCd <= 0) { this.fishCd = rand(26, 55); this.spawnFish(); }
      }
      return;
    }

    f.life -= dt;
    f.alpha = Math.min(1, f.alpha + dt * 2);
    f.scared = Math.max(0, f.scared - dt);
    var d = this.duck;
    var fdx = f.x - d.x, fdy = f.y - d.y;
    var fdist = Math.sqrt(fdx * fdx + fdy * fdy) || 0.001;
    var hunted = d.state === 'hunt';

    // Kleine Enten pirschen leiser — der Fisch bemerkt sie später
    var panicDist = 190 * clamp(this.cfg.size, 0.55, 1);
    if ((hunted && fdist < panicDist) || f.scared > 0) {
      // Flucht: weg von der Ente, aber langsamer als eine sprintende Ente
      var fmax = (f.scared > 0 ? 340 : 300) * this.cfg.speed;
      f.vx = approach(f.vx, fdx / fdist * fmax, 3.5, dt);
      f.vy = approach(f.vy, fdy / fdist * fmax * 0.6, 3.5, dt);
    } else {
      f.vy = Math.sin(this.time * 1.7 + f.phase) * 26;
    }
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.y = clamp(f.y, 30, this.h - 20);
    if (this.cfg.effects && Math.random() < dt * 1.3) {
      this.fx.ripple(f.x, f.y, 2, 15, 0.8, 'rgba(255,255,255,0.30)', 1.2);
    }

    var out = f.x < -60 || f.x > this.w + 60;
    if (out || f.life <= 0) {
      if (!out) {
        // taucht ab statt zu verpuffen
        if (this.cfg.effects) this.fx.splash(f.x, f.y, 0.5);
        for (var b = 0; b < 3; b++) this.fx.bubble(f.x + rand(-8, 8), f.y + rand(0, 6));
      }
      this.fish = null;
      if (hunted) {
        d.say('?', '#4a90d9');
        d.setState('look', 1.2);
        // Der Angler-Klassiker: der Entkommene wird immer größer erzählt
        this.stats.fishEscaped = (this.stats.fishEscaped || 0) + 1;
        this.saveStats();
      }
    }
  };

  // ── Wilde Ente (Besuch) ───────────────────────────────────────
  Engine.prototype.spawnVisitor = function () {
    var pool = ['mallard', 'mallard-hen', 'teal', 'mandarin', 'wood', 'tufted', 'pekin']
      .filter(function (id) { return id !== this.modelId; }, this);
    var v = new Duck(this, DuckModels.get(pick(pool)), false);
    v.wild = true;
    v.wildPhase = 'enter';
    // von der Seite mit mehr Platz hereinschwimmen
    v.wildSide = this.duck.x < this.w / 2 ? 1 : -1;
    v.x = v.wildSide > 0 ? this.w + 70 : -70;
    v.y = clamp(this.duck.y + rand(-110, 110), 60, this.h - 40);
    v.wildY0 = v.y;
    this.visitor = v;
    return v;
  };

  Duck.prototype.updateWild = function (dt) {
    var e = this.e, t = this.tgt, a = this.a, d = e.duck;
    this.stTime += dt;
    t.wingFlap = 0; t.squash = 1; t.eyeOpen = 1; t.beakOpen = 0;
    t.headRot = 0; t.wingLift = 0; t.lean = 0; t.headDip = 0;
    t.wobble = 0; t.eyeHappy = 0;

    if (this.wildPhase === 'enter') {
      // Treffpunkt: seitlich neben der Haupt-Ente warten
      var mx = d.x + this.wildSide * Math.max(130, d.radius() * 2.8);
      this.swim(dt, mx, d.y, 26, 0.8);
      if (Math.hypot(mx - this.x, d.y - this.y) < 70 || this.stTime > 12) {
        this.wildPhase = 'greet';
        this.stTime = 0;
        this.greetTick = 0.2;
        this.wildQuack = false;
        // Für Besuch unterbricht sie auch Putzen & Co. — nur Schlafen,
        // Streicheln, Jagen und Fressen gehen vor.
        var st0 = d.state;
        if (st0 === 'idle' || st0 === 'swim' || INTERRUPTIBLE[st0]) {
          d.setState('greet', 12);   // lang genug für Duett + Tänzchen
          d.actionTick = 0.9;        // antwortet versetzt zum Besuch
        }
      }
    } else if (this.wildPhase === 'greet') {
      this.face = d.x > this.x ? 1 : -1;
      this.vx = approach(this.vx, 0, 3, dt);
      this.vy = approach(this.vy, 0, 3, dt);
      t.headRot = -0.12;
      this.greetTick -= dt;
      if (this.greetTick <= 0) {
        this.greetTick = 1.8;
        e.sound.quack(this.model.quackPitch * 1.02);
        var hw = this.headWorld();
        e.fx.note(hw.x + this.dirF * 6, hw.y - 8);
        this.wildQuackT = 0.5;
      }
      this.wildQuackT = Math.max(0, (this.wildQuackT || 0) - dt);
      if (this.wildQuackT > 0) t.beakOpen = Math.sin(this.wildQuackT * Math.PI * 2) * 0.6 + 0.2;
      if (this.stTime > 3.6) {
        // Nach dem Duett wird getanzt!
        this.wildPhase = 'dance';
        this.stTime = 0;
        this.danceNoteT = 0.25;
        e.sound.quack(this.model.quackPitch * 1.2, true);
      }
    } else if (this.wildPhase === 'dance') {
      // Synchrones Tänzchen: gleicher Takt wie die Haupt-Ente (e.time),
      // aber spiegelbildlich — mit gemeinsamer Pirouette in der Mitte.
      var beat = e.time * 7.5;
      var dk2 = this.stTime;
      var denv2 = Math.min(1, dk2 * 3) * clamp((3.6 - dk2) * 2, 0, 1);
      this.vx = approach(this.vx, 0, 4, dt);
      this.vy = approach(this.vy, 0, 4, dt);
      t.eyeHappy = 1;
      t.squash = 1 + Math.sin(beat) * 0.07 * denv2;
      t.wobble = Math.sin(beat * 0.5 + Math.PI) * 0.5 * denv2;
      t.wingLift = 0.25 + Math.max(0, Math.sin(beat)) * 0.4 * denv2;
      t.headRot = -0.1 + Math.sin(beat + 1.2) * 0.15 * denv2;
      t.beakOpen = Math.max(0, Math.sin(beat)) * 0.25 * denv2;
      if (dk2 > 1.55 && dk2 < 2.35) {
        this.dirF = Math.cos((dk2 - 1.55) * 7.85) * (this.wildSide >= 0 ? 1 : -1);
        this.face = this.dirF >= 0 ? 1 : -1;
      } else {
        this.face = d.x > this.x ? 1 : -1;
      }
      this.danceNoteT -= dt;
      if (this.danceNoteT <= 0) {
        this.danceNoteT = 0.55;
        var hw3 = this.headWorld();
        e.fx.note(hw3.x + rand(-6, 6), hw3.y - 10);
        if (Math.random() < 0.4) e.sound.quack(this.model.quackPitch * rand(1.0, 1.25), true);
      }
      if (dk2 > 3.6) {
        this.wildPhase = 'leave';
        this.stTime = 0;
        e.stats.visits = (e.stats.visits || 0) + 1;
        e.saveStats();
        e.fx.heart((this.x + d.x) / 2, Math.min(this.y, d.y) - this.radius() * 1.9, 8);
        e.fx.heart(this.x, this.y - this.radius() * 1.8, 6);
        e.fx.heart(d.x, d.y - d.radius() * 1.8, 6);
        e.sound.quack(this.model.quackPitch * 1.3, true);
      }
    } else {
      // weiterziehen und verschwinden
      var ex = this.wildSide > 0 ? e.w + this.radius() * 4 : -this.radius() * 4;
      this.swim(dt, ex, this.wildY0, 10, 0.85);
      if (this.x < -this.radius() * 3 || this.x > e.w + this.radius() * 3 || this.stTime > 14) {
        e.visitor = null;
      }
    }

    this.blinkIn -= dt;
    if (this.blinkIn <= 0) { this.blinkIn = rand(2.2, 6); this.blinkT = 0.15; }
    if (this.blinkT > 0) { this.blinkT -= dt; t.eyeOpen = 0.05; }

    a.wingFlap = approach(a.wingFlap, t.wingFlap, 20, dt);
    a.squash = approach(a.squash, t.squash, 12, dt);
    a.eyeOpen = approach(a.eyeOpen, t.eyeOpen, 24, dt);
    a.beakOpen = approach(a.beakOpen, t.beakOpen, 22, dt);
    a.headRot = approach(a.headRot, t.headRot, 8, dt);
    a.headDip = approach(a.headDip, t.headDip, 18, dt);
    a.wobble = approach(a.wobble, t.wobble, 26, dt);
    a.wingLift = approach(a.wingLift, t.wingLift, 8, dt);
    a.eyeHappy = approach(a.eyeHappy, t.eyeHappy, 14, dt);
    a.lean = approach(a.lean, t.lean, 7, dt);
    this.integrate(dt);
  };

  // ── Brotkrumen ────────────────────────────────────────────────
  Engine.prototype.throwCrumbs = function (x, y) {
    var n = 3 + Math.floor(Math.random() * 3);
    // Krumen passen zur Entengröße — einer Riesenente winzige Krümel
    // hinzuwerfen sah verloren aus
    var k = clamp(this.cfg.size, 0.6, 2);
    for (var i = 0; i < n && this.crumbs.length < 14; i++) {
      var cx = clamp(x + rand(-26, 26), 10, this.w - 10);
      var cy = clamp(y + rand(-16, 16), 10, this.h - 10);
      this.crumbs.push({ x: cx, y: cy, size: rand(3.4, 5.4) * k, phase: Math.random() * TAU });
      if (this.cfg.effects) {
        this.fx.ripple(cx, cy, 2, 18, 0.7, 'rgba(255,255,255,0.55)', 1.6);
        this.fx.droplet(cx, cy - 4, rand(-20, 20), -rand(30, 70), 1.2);
      }
    }
    this.sound.splash(0.35);
  };

  // Fisch & Krumen liegen "im Wasser" — also unter den Enten zeichnen
  Engine.prototype.drawExtras = function (ctx) {
    var t = this.time, i;

    if (this.fish) {
      var f = this.fish;
      var fr = 12 * clamp(this.cfg.size, 0.7, 1.6);
      var ang = Math.atan2(f.vy, f.vx);
      var wig = Math.sin(t * 9 + f.phase) * 0.35;
      ctx.save();
      ctx.globalAlpha = 0.5 * f.alpha;
      ctx.translate(f.x, f.y + 6);   // knapp unter der Oberfläche
      ctx.rotate(ang * 0.8);
      ctx.fillStyle = 'rgba(38,86,128,0.85)';
      // Körper
      ctx.beginPath();
      ctx.ellipse(0, 0, fr, fr * 0.42, 0, 0, TAU);
      ctx.fill();
      // Schwanzflosse wedelt
      ctx.save();
      ctx.translate(-fr * 0.9, 0);
      ctx.rotate(wig);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-fr * 0.62, -fr * 0.42);
      ctx.lineTo(-fr * 0.62, fr * 0.42);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // Rückenflosse
      ctx.beginPath();
      ctx.moveTo(-fr * 0.15, -fr * 0.36);
      ctx.quadraticCurveTo(fr * 0.12, -fr * 0.85, fr * 0.34, -fr * 0.34);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    for (i = 0; i < this.crumbs.length; i++) {
      var c = this.crumbs[i];
      var bob = Math.sin(t * 2.1 + c.phase) * 1.3;
      ctx.save();
      // kleiner Kontaktring auf dem Wasser
      ctx.strokeStyle = 'rgba(255,255,255,0.38)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + c.size * 0.55, c.size * 1.7, c.size * 0.55, 0, 0, TAU);
      ctx.stroke();
      // die Krume selbst: unregelmäßiger Brocken
      ctx.fillStyle = '#e0b073';
      ctx.strokeStyle = 'rgba(140,95,45,0.75)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(c.x + c.size, c.y + bob * 0.3);
      for (var k2 = 1; k2 <= 6; k2++) {
        var ca = k2 / 6 * TAU;
        var cr = c.size * (0.82 + 0.24 * Math.sin(c.phase * 3 + k2 * 2.4));
        ctx.lineTo(c.x + Math.cos(ca) * cr, c.y + bob * 0.3 + Math.sin(ca) * cr * 0.8);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,238,200,0.8)';
      ctx.beginPath();
      ctx.arc(c.x - c.size * 0.3, c.y + bob * 0.3 - c.size * 0.3, c.size * 0.32, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  };

  // ── Canvas ────────────────────────────────────────────────────
  Engine.prototype.mount = function (parent) {
    var host = document.createElement('div');
    host.setAttribute('data-cursor-duck', '');
    var s = host.style;
    s.setProperty('position', 'fixed', 'important');
    s.setProperty('inset', '0', 'important');
    s.setProperty('left', '0', 'important');
    s.setProperty('top', '0', 'important');
    s.setProperty('width', '100%', 'important');
    s.setProperty('height', '100%', 'important');
    s.setProperty('pointer-events', 'none', 'important');
    s.setProperty('z-index', '2147483647', 'important');
    s.setProperty('border', '0', 'important');
    s.setProperty('margin', '0', 'important');
    s.setProperty('padding', '0', 'important');
    s.setProperty('background', 'transparent', 'important');

    var shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    var canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:block;pointer-events:none;';
    shadow.appendChild(canvas);
    (parent || document.documentElement).appendChild(host);

    this.host = host;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    this.bindInput();
    return this;
  };

  Engine.prototype.resize = function () {
    // Die echte Host-Größe nehmen, sonst verzerrt eine Scrollbar das Canvas
    var rect = this.host && this.host.getBoundingClientRect();
    var w = rect && rect.width ? rect.width : root.innerWidth;
    var h = rect && rect.height ? rect.height : root.innerHeight;
    // Hintergrund-Tabs/Prerender melden gern 0×0 — das würde die Ente in die
    // Ecke klemmen. Dann lieber die letzte bekannte Größe behalten.
    if (!w || !h) { w = this.w || 800; h = this.h || 600; }
    this.w = w;
    this.h = h;
    var dpr = Math.min(2, root.devicePixelRatio || 1);
    this.dpr = dpr;
    if (this.canvas) {
      this.canvas.width = Math.round(this.w * dpr);
      this.canvas.height = Math.round(this.h * dpr);
    }
  };

  Engine.prototype.setPointer = function (x, y) {
    this.px = x; this.py = y;
    this.pointerIdle = 0;
  };

  Engine.prototype.bindInput = function () {
    var self = this;
    var b = this._bound;

    b.move = function (ev) {
      if (ev.clientX === undefined) return;
      self.setPointer(ev.clientX, ev.clientY);
    };
    b.resize = function () { self.resize(); };
    b.down = function (ev) {
      self.sound.unlock();
      var d = self.duck;
      if (!d) return;
      var dist = Math.hypot(ev.clientX - d.x, ev.clientY - d.y);
      if (self.cfg.effects) self.fx.ripple(ev.clientX, ev.clientY, 4, 34, 0.7, 'rgba(255,255,255,0.5)', 2);
      if (dist < d.radius() * 2.6 && d.state !== 'dive' &&
          d.state !== 'waddle' && d.state !== 'burst') {
        // Ente direkt angeklickt → sie quakt zurück
        d.setState('quack', 1.0);
        d.quacked = false;
      }
    };
    b.dbl = function (ev) {
      var d = self.duck;
      if (!d) return;
      var dist = ev.clientX !== undefined ? Math.hypot(ev.clientX - d.x, ev.clientY - d.y) : 0;
      if (dist < d.radius() * 2.6) {
        // Doppelklick auf die Ente → Flügelschlagen (wie gehabt)
        if (d.state !== 'dive' && d.state !== 'waddle' && d.state !== 'burst') {
          d.setState('flap', 1.3);
        }
      } else if (self.cfg.feed) {
        // Doppelklick ins Wasser → Brotkrumen werfen
        self.throwCrumbs(ev.clientX, ev.clientY);
      }
    };
    b.vis = function () {
      if (document.hidden) self.pause(); else self.resume();
    };
    // Scroll-Strömung: Scrollen erzeugt eine kurze "Strömung", die die
    // Enten mitzieht (Seite runter → Wasser zieht nach oben und umgekehrt).
    b.pageScroll = function () {
      var y = root.scrollY || root.pageYOffset || 0;
      if (self._scrollY == null) { self._scrollY = y; return; }
      var d = y - self._scrollY;
      self._scrollY = y;
      if (!self.running || Math.abs(d) < 3) return;
      var kick = clamp(-d * 0.9, -240, 240);
      var dk = self.duck;
      if (dk) {
        if (dk.state === 'sleep' && Math.abs(kick) > 150) {
          dk.setState('wake', 0.7);
          dk.say('!', '#ffb03d');
        }
        dk.vy += kick * 0.55;
        if (self.cfg.effects && Math.abs(kick) > 100 && Math.random() < 0.4) {
          self.fx.ripple(dk.x, dk.y, 4, dk.radius() * 1.3, 0.8, 'rgba(255,255,255,0.35)', 1.4);
        }
      }
      for (var bi = 0; bi < self.babies.length; bi++) self.babies[bi].vy += kick * 0.45;
      if (self.fish) self.fish.y += kick * 0.02;
      // Wellenreiten zählt — aber höchstens alle 1,5s, sonst füllt ein
      // einziger Scrollrausch den Zähler
      if (Math.abs(kick) > 180 && self.time - (self._surfT || -9) > 1.5) {
        self._surfT = self.time;
        self.stats.surfs = (self.stats.surfs || 0) + 1;
        self.saveStats();
      }
    };
    // Cursor-Position aus iframes einsammeln
    b.msg = function (ev) {
      var data = ev.data;
      if (!data || data.__cursorDuck !== 1) return;
      var frames = document.getElementsByTagName('iframe');
      for (var i = 0; i < frames.length; i++) {
        if (frames[i].contentWindow === ev.source) {
          var r = frames[i].getBoundingClientRect();
          self.setPointer(r.left + data.x, r.top + data.y);
          return;
        }
      }
    };

    root.addEventListener('mousemove', b.move, { passive: true, capture: true });
    root.addEventListener('pointermove', b.move, { passive: true, capture: true });
    root.addEventListener('mousedown', b.down, { passive: true, capture: true });
    root.addEventListener('dblclick', b.dbl, { passive: true, capture: true });
    root.addEventListener('resize', b.resize, { passive: true });
    root.addEventListener('scroll', b.pageScroll, { passive: true });
    root.addEventListener('message', b.msg, false);
    document.addEventListener('visibilitychange', b.vis, false);
    root.addEventListener('keydown', function () { self.sound.unlock(); }, { passive: true, once: true });
  };

  Engine.prototype.unbindInput = function () {
    var b = this._bound;
    if (!b.move) return;
    root.removeEventListener('mousemove', b.move, true);
    root.removeEventListener('pointermove', b.move, true);
    root.removeEventListener('mousedown', b.down, true);
    root.removeEventListener('dblclick', b.dbl, true);
    root.removeEventListener('resize', b.resize);
    root.removeEventListener('scroll', b.pageScroll);
    root.removeEventListener('message', b.msg);
    document.removeEventListener('visibilitychange', b.vis);
  };

  // ── Loop ──────────────────────────────────────────────────────
  Engine.prototype.start = function () {
    if (this.running) return;
    if (this.host) this.host.style.setProperty('display', 'block', 'important');
    this.running = true;
    this.last = 0;
    var self = this;
    var loop = function (ts) {
      if (!self.running) return;
      self.raf = requestAnimationFrame(loop);
      if (!self.last) { self.last = ts; return; }
      var dt = Math.min(0.05, (ts - self.last) / 1000);
      self.last = ts;
      self.step(dt);
      self.render();
    };
    this.raf = requestAnimationFrame(loop);
  };

  Engine.prototype.pause = function () { this.running = false; if (this.raf) cancelAnimationFrame(this.raf); };
  Engine.prototype.resume = function () { if (this.cfg.enabled) { this.last = 0; this.start(); } };
  Engine.prototype.stop = function () {
    this.pause();
    if (this.host) this.host.style.setProperty('display', 'none', 'important');
  };
  Engine.prototype.destroy = function () {
    this.stop();
    this.unbindInput();
    if (this.host && this.host.parentNode) this.host.parentNode.removeChild(this.host);
  };

  Engine.prototype.step = function (dt) {
    this.time += dt;

    // Größe gelegentlich nachziehen: Seiten, die im Hintergrund ohne Layout
    // laden, oder Scrollbars, die auftauchen, lösen kein resize-Event aus.
    this.sizeCheck = (this.sizeCheck || 0) + 1;
    if (this.sizeCheck >= 30) {
      this.sizeCheck = 0;
      var cw = this.host ? this.host.clientWidth : root.innerWidth;
      var ch = this.host ? this.host.clientHeight : root.innerHeight;
      if (cw && ch && (Math.abs(cw - this.w) > 1 || Math.abs(ch - this.h) > 1)) this.resize();
    }

    // Zeigergeschwindigkeit
    var dx = this.px - this.ppx, dy = this.py - this.ppy;
    var jump = Math.sqrt(dx * dx + dy * dy);
    var inst = jump / Math.max(0.001, dt);
    this.pointerSpeed = this.pointerSpeed * 0.6 + inst * 0.4;
    this.ppx = this.px; this.ppy = this.py;
    if (inst < 6) this.pointerIdle += dt; else this.pointerIdle = 0;

    // Cursor teleportiert (anderes Fenster, unskriptbares iframe, Randwechsel):
    // kurz "Alert" — die Ente merkt auf und holt schneller auf.
    this.alertPing = jump > 260 && this.alertT <= 0;
    this.alertT = jump > 260 ? 1.5 : Math.max(0, this.alertT - dt);

    // Wackel-Erkennung: schnelle Richtungswechsel (egal welche Achse)
    // = Tanz-Aufforderung. Kreisende Bewegungen zählen nicht — die gehören
    // dem Schwindel (dizzy) und flippen die Achsen nur langsam.
    var mvSgnX = dx > 2 ? 1 : dx < -2 ? -1 : 0;
    var mvSgnY = dy > 2 ? 1 : dy < -2 ? -1 : 0;
    var flipped = (mvSgnX && this._mvSgnX && mvSgnX !== this._mvSgnX) ||
                  (mvSgnY && this._mvSgnY && mvSgnY !== this._mvSgnY);
    if (flipped) {
      this.wiggleN = (this.wiggleN || 0) + 1;
      this.wiggleT = 1.4;
    }
    if (mvSgnX) this._mvSgnX = mvSgnX;
    if (mvSgnY) this._mvSgnY = mvSgnY;
    this.wiggleT = Math.max(0, (this.wiggleT || 0) - dt);
    if (!this.wiggleT) this.wiggleN = 0;

    this.updateFish(dt);

    // Wilde Ente: Besuch abwickeln bzw. gelegentlich einen ankündigen
    if (this.visitor) {
      this.visitor.updateWild(dt);
    } else {
      var vst = this.duck.state;
      var vCalm = vst === 'idle' || vst === 'swim' || vst === 'bob' || vst === 'look';
      if (vCalm && !this.fish && !this.crumbs.length && this.cfg.playfulness > 0.25) {
        this.visitorCd -= dt * this.cfg.playfulness;
        if (this.visitorCd <= 0) {
          this.visitorCd = rand(150, 360);
          this.spawnVisitor();
        }
      }
    }

    this.duck.update(dt);

    // ── Küken-Nest: taucht auf, wenn Mama schläft ───────────────
    var mamaSleeps = this.duck.state === 'sleep';
    if (mamaSleeps && this.babies.length && !this.nest) {
      var d0 = this.duck, nr0 = d0.radius();
      var nSide = d0.x > this.w / 2 ? -1 : 1;
      this.nest = {
        x: clamp(d0.x + nSide * nr0 * 3.1, 70, this.w - 70),
        y: clamp(d0.y + nr0 * 0.15, 70, this.h - 50),
        r: Math.max(34, 26 * this.cfg.size + Math.min(4, this.babies.length) * 7),
        appear: 0, sink: false
      };
      if (this.cfg.effects) {
        this.fx.ripple(this.nest.x, this.nest.y, 6, this.nest.r * 1.4, 1.2, 'rgba(255,255,255,0.4)', 1.6);
      }
    }
    if (this.nest) {
      var nst = this.nest;
      if ((!mamaSleeps || !this.babies.length) && !nst.sink) {
        // Mama ist wach → das Nest versinkt blubbernd; die Küken stehen
        // sofort auf (sonst schwimmen sie 0,7 s in Schlafpose davon)
        nst.sink = true;
        for (var nw = 0; nw < this.babies.length; nw++) {
          this.babies[nw].nesting = false;
          this.babies[nw].nestTry = 0;
        }
        if (this.cfg.effects) {
          for (var nb = 0; nb < 4; nb++) {
            this.fx.bubble(nst.x + rand(-nst.r, nst.r) * 0.5, nst.y + rand(-4, 4));
          }
        }
      }
      nst.appear = approach(nst.appear, nst.sink ? 0 : 1, nst.sink ? 5 : 2.2, dt);
      if (nst.sink && nst.appear < 0.03) {
        this.nest = null;
        for (var nbi = 0; nbi < this.babies.length; nbi++) {
          this.babies[nbi].nesting = false;
          this.babies[nbi].nestTry = 0;
        }
      }
    }

    // Küken folgen der Spur der Mama — außer das Nest ruft oder es
    // liegen Krumen im Wasser.
    var nestOpen = this.nest && !this.nest.sink ? this.nest : null;
    for (var i = 0; i < this.babies.length; i++) {
      var b = this.babies[i];
      var crumb = null;
      if (this.crumbs.length && !nestOpen) {
        var bd = 1e18;
        for (var ci = 0; ci < this.crumbs.length; ci++) {
          var cdx = this.crumbs[ci].x - b.x, cdy = this.crumbs[ci].y - b.y;
          var cd = cdx * cdx + cdy * cdy;
          if (cd < bd) { bd = cd; crumb = this.crumbs[ci]; }
        }
      }
      if (nestOpen) {
        // Jedes Küken hat seinen festen Kuschel-Platz im Nest
        b.eating = false;
        var slotA = (i / Math.max(1, this.babies.length)) * TAU + 0.7;
        var sx = nestOpen.x + Math.cos(slotA) * nestOpen.r * 0.34;
        var sy = nestOpen.y + Math.sin(slotA) * nestOpen.r * 0.16 - nestOpen.r * 0.05;
        if (!b.nesting) {
          b.swim(dt, sx, sy, 3, 1.0);
          b.nestTry = (b.nestTry || 0) + dt;
          // Angekommen, sobald Slot ODER Nestrand erreicht ist. Fallback:
          // nach 4 s Anflug wird eingekuschelt — sonst kann in schmalen
          // Fenstern die Mama-Kollision den Slot dauerhaft versperren.
          if (Math.hypot(sx - b.x, sy - b.y) < 12 ||
              Math.hypot(nestOpen.x - b.x, nestOpen.y - b.y) < nestOpen.r * 0.7 ||
              b.nestTry > 4) {
            b.nesting = true;
            b.vx = 0; b.vy = 0;
          }
        } else {
          b.x = approach(b.x, sx, 6, dt);
          b.y = approach(b.y, sy, 6, dt);
          b.vx = 0; b.vy = 0;
        }
      } else if (crumb) {
        b.swim(dt, crumb.x, crumb.y, b.radius() * 0.9, 1.1);
        var cdist = Math.hypot(crumb.x - b.x, crumb.y - b.y);
        b.eating = cdist < b.radius() * 1.8;
        if (b.eating) {
          b.nibbleT = (b.nibbleT || 0) - dt;
          if (b.nibbleT <= 0) {
            b.nibbleT = 0.4;
            crumb.size -= 0.7;   // Küken knabbern kleinere Happen
            if (this.cfg.effects) this.fx.ripple(crumb.x, crumb.y, 2, 12, 0.5, 'rgba(255,255,255,0.45)', 1.2);
            this.sound.peck();
            if (crumb.size <= 1.2) {
              this.crumbs.splice(this.crumbs.indexOf(crumb), 1);
              this.fx.sparkle(crumb.x, crumb.y - 5, '#ffe9b8', 4);
              this.stats.crumbs = (this.stats.crumbs || 0) + 1;
              this.saveStats();
            }
          }
        }
      } else {
        b.eating = false;
        var p = this.duck.sampleTrail(b.gap);
        var side = Math.sin(this.time * 2.4 + i * 1.7) * 5;
        b.swim(dt, p.x, p.y + side, 3, 1.15);
      }
      b.updateBaby(dt);
    }

    this.resolveOverlaps(dt);
    this.fx.update(dt);
  };

  // Anti-Overlap: die Familie auseinanderhalten, damit kein Küken hinter
  // der Mama (oder einem Geschwister) verschwindet. Fast-harte Positions-
  // Projektion (zwei Iterationen), sonst gewinnt das Spur-Folgen den
  // Dauerkampf und drückt die Küken doch wieder in die Mama.
  Engine.prototype.resolveOverlaps = function (dt) {
    if (!this.babies.length) return;
    var group = [this.duck].concat(this.babies);
    var k = 1 - Math.exp(-30 * dt);
    var dState = this.duck.state;
    // Wenn Mama abgetaucht/geplatzt ist, gibt es nichts zu verdecken
    var duckSolid = dState !== 'dive' && dState !== 'peekaboo' &&
      dState !== 'burst' && !this.duck.vanish;
    for (var pass = 0; pass < 2; pass++) {
      for (var i = 0; i < group.length; i++) {
        for (var j = i + 1; j < group.length; j++) {
          var A = group[i], B = group[j];
          if (A.nesting || B.nesting) continue;
          if (A === this.duck && !duckSolid) continue;
          var minD = (A.radius() + B.radius()) * 0.92;
          if (A.eating || B.eating) minD *= 0.72;   // am Futter wird gedrängelt
          var ddx = B.x - A.x, ddy = B.y - A.y;
          var d2 = ddx * ddx + ddy * ddy;
          if (d2 >= minD * minD) continue;
          var d = Math.sqrt(d2);
          var ux, uy;
          if (d < 0.01) { ux = Math.cos(j * 2.4); uy = Math.sin(j * 2.4); d = 0.01; }
          else { ux = ddx / d; uy = ddy / d; }
          var push = (minD - d) * k;
          if (A === this.duck) {
            // Mama bleibt wo sie ist, das Küken weicht aus
            B.x += ux * push; B.y += uy * push;
          } else {
            A.x -= ux * push * 0.5; A.y -= uy * push * 0.5;
            B.x += ux * push * 0.5; B.y += uy * push * 0.5;
          }
          // aufeinander zulaufende Geschwindigkeit wegdämpfen (nur beim
          // Küken — Mamas Kurs gehört dem Cursor)
          var bvr = B.vx * ux + B.vy * uy;
          if (bvr < 0) { B.vx -= ux * bvr; B.vy -= uy * bvr; }
          if (A !== this.duck) {
            var avr = A.vx * ux + A.vy * uy;
            if (avr > 0) { A.vx -= ux * avr; A.vy -= uy * avr; }
          }
        }
      }
    }
    // Die Pushes laufen nach dem Rand-Clamp von integrate() — Küken danach
    // wieder einfangen, sonst schiebt eine Mama am Rand sie aus dem Bild
    for (var ci2 = 1; ci2 < group.length; ci2++) {
      var C = group[ci2];
      var cm = C.radius() * 1.2;
      C.x = clamp(C.x, -cm, this.w + cm);
      C.y = clamp(C.y, cm * 0.6, this.h + cm);
    }
  };

  // Küken: einfache Version des Verhaltens
  Duck.prototype.updateBaby = function (dt) {
    var a = this.a, t = this.tgt, e = this.e;
    this.stTime += dt;
    t.wingFlap = 0; t.squash = 1; t.eyeOpen = 1; t.beakOpen = 0; t.headRot = 0; t.headDip = 0;

    this.actionTick -= dt;
    if (this.actionTick <= 0) {
      this.actionTick = rand(2.5, 7);
      if (this.nesting) {
        // im Nest: nur ab und zu ein kleines Zzz
        if (Math.random() < 0.6) {
          var hn2 = this.headWorld();
          e.fx.zzz(hn2.x + 4, hn2.y - 6);
        }
      } else {
        this.babyAct = pick(['flap', 'bob', 'quack', 'look', 'doze', 'none']);
        this.babyActT = this.babyAct === 'doze' ? rand(2.5, 4.5) : rand(0.7, 1.3);
        if (this.babyAct === 'quack') {
          e.sound.quack(this.model.quackPitch);
          var hb = this.headWorld();
          e.fx.note(hb.x, hb.y - 4, 'rgba(90,110,150,0.6)');
        }
        if (this.babyAct === 'doze') {
          var hd2 = this.headWorld();
          e.fx.zzz(hd2.x + 3, hd2.y - 5);
        }
      }
    }
    if (this.nesting) {
      // Kuschelschlaf im Nest: Augen zu, Köpfchen ins Gefieder, ruhiges Atmen
      t.eyeOpen = 0;
      t.headRot = 0.14;
      t.squash = 1 + Math.sin(e.time * 1.3 + this.phase) * 0.025;
      this.babyActT = 0;
    } else if (this.eating) {
      // Krumen picken: Köpfchen nickt im Knabber-Takt
      var nib = Math.sin(e.time * 12 + this.phase);
      t.headDip = 0.5 + nib * 0.25;
      t.beakOpen = Math.max(0, nib) * 0.5;
    } else if (this.babyActT > 0) {
      this.babyActT -= dt;
      var k = this.babyActT;
      if (this.babyAct === 'flap') { t.wingFlap = Math.abs(Math.sin(e.time * 16)); t.squash = 1 + Math.sin(e.time * 16) * 0.05; }
      else if (this.babyAct === 'bob') { t.squash = 1 + Math.sin(e.time * 6) * 0.06; }
      else if (this.babyAct === 'quack') { t.beakOpen = Math.max(0, Math.sin(k * 12)) * 0.8; }
      else if (this.babyAct === 'look') { t.headRot = Math.sin(e.time * 3) * 0.3; }
      else if (this.babyAct === 'doze') { t.eyeOpen = 0.05; t.headRot = 0.15; }
    }

    // sanftes Ein-/Ausblenden der Schlafpose (Kopf rutscht ins Gefieder)
    a.sleep = approach(a.sleep, this.nesting ? 1 : 0, 3, dt);

    this.blinkIn -= dt;
    if (this.blinkIn <= 0) { this.blinkIn = rand(2, 6); this.blinkT = 0.14; }
    if (this.blinkT > 0 && !this.nesting) { this.blinkT -= dt; t.eyeOpen = 0.05; }

    a.wingFlap = approach(a.wingFlap, t.wingFlap, 20, dt);
    a.squash = approach(a.squash, t.squash, 12, dt);
    a.eyeOpen = approach(a.eyeOpen, t.eyeOpen, 24, dt);
    a.beakOpen = approach(a.beakOpen, t.beakOpen, 22, dt);
    a.headRot = approach(a.headRot, t.headRot, 8, dt);
    a.headDip = approach(a.headDip, t.headDip, 18, dt);

    var speed = this.integrate(dt);
    if (e.cfg.effects) {
      this.rippleCd -= dt;
      if (this.rippleCd <= 0 && speed > 24) {
        this.rippleCd = 0.34;
        e.fx.ripple(this.x, this.y, this.radius() * 0.2, this.radius() * 1.2, 1.0, 'rgba(255,255,255,0.28)', 1.1);
      }
    }
  };

  Engine.prototype.render = function () {
    var ctx = this.ctx;
    if (!ctx) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);

    // Fisch & Brotkrumen liegen im/auf dem Wasser → unter die Enten
    if (this.fish || this.crumbs.length) this.drawExtras(ctx);

    // Tiefensortierung: wer weiter unten schwimmt, ist weiter vorn —
    // so verdeckt nie die falsche Ente die andere. Das Nest bildet mit
    // seinen schlafenden Küken eine Einheit (Rückwand → Küken → Rand).
    var order = [];
    if (this.visitor) order.push({ y: this.visitor.y, k: 'v' });
    for (var i = 0; i < this.babies.length; i++) {
      var b = this.babies[i];
      if (!b.nesting) order.push({ y: b.y, k: 'b', o: b });
    }
    order.push({ y: this.duck.y, k: 'd' });
    if (this.nest) order.push({ y: this.nest.y, k: 'n' });
    order.sort(function (p, q) { return p.y - q.y; });

    for (var oi = 0; oi < order.length; oi++) {
      var it = order[oi];
      if (it.k === 'v') DuckRender.draw(ctx, this.visitor.model, this.visitor.pose());
      else if (it.k === 'b') DuckRender.draw(ctx, it.o.model, it.o.pose());
      else if (it.k === 'd') DuckRender.draw(ctx, this.duck.model, this.duck.pose());
      else this.drawNest(ctx);
    }
    if (this.cfg.effects) this.fx.draw(ctx);
  };

  // ── Küken-Nest zeichnen ───────────────────────────────────────
  Engine.prototype.drawNest = function (ctx) {
    var n = this.nest;
    if (!n || n.appear < 0.02) return;
    this.drawNestRing(ctx, true);
    var ns = [];
    for (var i = 0; i < this.babies.length; i++) {
      if (this.babies[i].nesting) ns.push(this.babies[i]);
    }
    ns.sort(function (a, b) { return a.y - b.y; });
    for (var j = 0; j < ns.length; j++) DuckRender.draw(ctx, ns[j].model, ns[j].pose());
    this.drawNestRing(ctx, false);
  };

  Engine.prototype.drawNestRing = function (ctx, back) {
    var n = this.nest, ap = n.appear;
    var r = n.r * (0.72 + 0.28 * ap);
    var ry = r * 0.42;
    var y = n.y + (1 - ap) * n.r * 0.9;   // taucht von unten auf / sinkt ab
    var browns = ['#8a6a42', '#6d5232', '#a3835c'];
    ctx.save();
    ctx.globalAlpha *= Math.min(1, ap * 1.5) * this.cfg.opacity;
    if (back) {
      // Kontaktring auf dem Wasser
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(n.x, y + ry * 0.5, r * 1.2, ry * 0.62, 0, 0, TAU);
      ctx.stroke();
      // Stroh-Innenfläche
      var sg = ctx.createLinearGradient(0, y - ry, 0, y + ry);
      sg.addColorStop(0, '#e8cd9a');
      sg.addColorStop(1, '#c8a26b');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.ellipse(n.x, y, r * 0.94, ry * 0.94, 0, 0, TAU);
      ctx.fill();
      // ein paar Strohhalme
      ctx.strokeStyle = 'rgba(140,105,60,0.5)';
      ctx.lineWidth = 1.2;
      for (var s = 0; s < 5; s++) {
        var sa = s * 1.7 + 0.4;
        ctx.beginPath();
        ctx.moveTo(n.x + Math.cos(sa) * r * 0.55, y + Math.sin(sa) * ry * 0.5);
        ctx.quadraticCurveTo(n.x + Math.cos(sa + 1) * r * 0.3, y,
          n.x + Math.cos(sa + 2.2) * r * 0.5, y + Math.sin(sa + 2.2) * ry * 0.45);
        ctx.stroke();
      }
      // hinterer Rand (obere Ellipsenhälfte)
      for (var b1 = 0; b1 < 3; b1++) {
        ctx.strokeStyle = browns[b1];
        ctx.lineWidth = r * (0.14 - b1 * 0.03);
        ctx.beginPath();
        ctx.ellipse(n.x, y - b1 * 1.5, r * (1 - b1 * 0.05), ry * (1 - b1 * 0.06), 0, Math.PI, TAU);
        ctx.stroke();
      }
    } else {
      // vorderer Rand (untere Hälfte, dicker — dahinter kuscheln die Küken)
      for (var b2 = 0; b2 < 3; b2++) {
        ctx.strokeStyle = browns[b2];
        ctx.lineWidth = r * (0.17 - b2 * 0.035);
        ctx.beginPath();
        ctx.ellipse(n.x, y + b2 * 1.2, r * (1 - b2 * 0.06), ry * (1 - b2 * 0.07), 0, 0, Math.PI);
        ctx.stroke();
      }
      // Zweig-Textur: kurze schräge Striche auf dem Vorderrand
      ctx.strokeStyle = 'rgba(60,42,22,0.35)';
      ctx.lineWidth = 1.3;
      for (var t2 = 0; t2 < 7; t2++) {
        var ta = 0.25 + (t2 / 7) * (Math.PI - 0.5);
        var tx = n.x + Math.cos(ta) * r, ty = y + Math.sin(ta) * ry;
        ctx.beginPath();
        ctx.moveTo(tx - 4, ty - 3);
        ctx.lineTo(tx + 4, ty + 3);
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  // ── Debug/Steuer-API ──────────────────────────────────────────
  // Deterministisch weiterrechnen (für Tests/Screenshots, unabhängig von rAF)
  Engine.prototype.simulate = function (seconds, dt) {
    dt = dt || 1 / 60;
    var n = Math.max(1, Math.round(seconds / dt));
    for (var i = 0; i < n; i++) this.step(dt);
    this.render();
    return { time: this.time, state: this.duck.state, x: this.duck.x, y: this.duck.y };
  };

  Engine.prototype.trigger = function (action, dur) {
    if (action === 'fish') {
      if (!this.fish) this.spawnFish();
      this.fish.alpha = 1;
      this.duck.setState('hunt', 99);
      return action;
    }
    if (action === 'crumbs') {
      var d = this.duck;
      this.throwCrumbs(
        clamp(d.x + rand(-1, 1) * 220, 40, this.w - 40),
        clamp(d.y + rand(-120, 120), 40, this.h - 40));
      return action;
    }
    if (action === 'dizzy') {
      this.duck.dizzyDir = Math.random() < 0.5 ? -1 : 1;
      this.duck.setState('dizzy', dur || 2.4);
      return action;
    }
    if (action === 'visitor') {
      if (!this.visitor) this.spawnVisitor();
      return action;
    }
    if (action === 'waddle') {
      this.duck.wadInit = this.duck.wadQuacked = this.duck.wadSplash = false;
      this.duck.setState('waddle', 6.15);
      return action;
    }
    if (action === 'burst') {
      this.duck.burstOh = this.duck.burstPop = this.duck.burstBack = false;
      this.duck.setState('burst', 3.2);
      return action;
    }
    this.duck.setState(action, dur || 1.6);
    this.duck.quacked = false; this.duck.peckDone = false; this.duck.gulped = false;
    this.duck.dove = false; this.duck.surfaced = false; this.duck.dabbleUp = false;
    this.duck.pkbDove = false; this.duck.pkbUp = false;
    return action;
  };

  root.CursorDuckEngine = Engine;
  root.CursorDuckDefaults = DEFAULTS;
  root.CursorDuckIdleActions = IDLE_ACTIONS;
})(typeof window !== 'undefined' ? window : this);
