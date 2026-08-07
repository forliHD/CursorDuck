/*
 * CursorDuck — Partikel & Wassereffekte 💦
 * Ringe, Tropfen, Herzchen, Federn, Blubberblasen, Noten, Zzz, Konfetti, Funkeln.
 */
(function (root) {
  'use strict';

  var TAU = Math.PI * 2;

  function FX() {
    this.parts = [];
    this.max = 260;
  }

  FX.prototype.add = function (p) {
    if (this.parts.length >= this.max) this.parts.shift();
    p.age = 0;
    this.parts.push(p);
    return p;
  };

  FX.prototype.clear = function () { this.parts.length = 0; };

  // ── Spawner ───────────────────────────────────────────────────
  FX.prototype.ripple = function (x, y, r0, r1, life, color, lw) {
    return this.add({ k: 'ripple', x: x, y: y, r0: r0, r1: r1, life: life || 1.4, color: color || 'rgba(255,255,255,0.55)', lw: lw || 2 });
  };

  FX.prototype.droplet = function (x, y, vx, vy, size, color) {
    return this.add({ k: 'drop', x: x, y: y, vx: vx, vy: vy, size: size, life: 0.9 + Math.random() * 0.5, color: color || 'rgba(146,201,240,0.92)' });
  };

  FX.prototype.splash = function (x, y, power, color) {
    power = power || 1;
    this.ripple(x, y, 4 * power, 46 * power, 1.1, 'rgba(255,255,255,0.6)', 2.2);
    this.ripple(x, y, 2 * power, 26 * power, 0.8, 'rgba(190,225,255,0.45)', 1.6);
    var n = Math.round(4 + power * 5);
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + (Math.random() - 0.5) * 2.3;
      var sp = (60 + Math.random() * 130) * power;
      this.droplet(x + (Math.random() - 0.5) * 8 * power, y - 2,
        Math.cos(a) * sp, Math.sin(a) * sp,
        (1.0 + Math.random() * 1.4) * Math.min(1.5, power), color);
    }
  };

  FX.prototype.heart = function (x, y, size, color) {
    return this.add({
      k: 'heart', x: x, y: y, vx: (Math.random() - 0.5) * 26, vy: -42 - Math.random() * 28,
      size: size || 8, life: 0.95 + Math.random() * 0.4, color: color || '#ff5f8d',
      rot: (Math.random() - 0.5) * 0.5, wob: Math.random() * TAU
    });
  };

  FX.prototype.note = function (x, y, color) {
    return this.add({
      k: 'note', x: x, y: y, vx: 18 + Math.random() * 26, vy: -28 - Math.random() * 20,
      size: 8 + Math.random() * 4, life: 1.2, color: color || 'rgba(60,70,90,0.75)', wob: Math.random() * TAU
    });
  };

  FX.prototype.zzz = function (x, y) {
    return this.add({
      k: 'zzz', x: x, y: y, vx: 12, vy: -20, size: 11, life: 2.2,
      color: 'rgba(120,140,180,0.85)', wob: Math.random() * TAU
    });
  };

  FX.prototype.bubble = function (x, y, size) {
    return this.add({
      k: 'bubble', x: x, y: y, vx: (Math.random() - 0.5) * 12, vy: -26 - Math.random() * 24,
      size: size || 2 + Math.random() * 3.5, life: 1.1 + Math.random() * 0.6, wob: Math.random() * TAU
    });
  };

  FX.prototype.feather = function (x, y, color) {
    return this.add({
      k: 'feather', x: x, y: y, vx: (Math.random() - 0.5) * 50, vy: -30 - Math.random() * 30,
      size: 6 + Math.random() * 5, life: 2.4, color: color || '#fff6d8',
      rot: Math.random() * TAU, vrot: (Math.random() - 0.5) * 3, wob: Math.random() * TAU
    });
  };

  FX.prototype.sparkle = function (x, y, color, size) {
    return this.add({
      k: 'sparkle', x: x, y: y, vx: (Math.random() - 0.5) * 24, vy: (Math.random() - 0.5) * 24 - 10,
      size: size || 4 + Math.random() * 4, life: 0.7 + Math.random() * 0.5, color: color || '#fff3b0',
      rot: Math.random() * TAU
    });
  };

  FX.prototype.confetti = function (x, y) {
    var cols = ['#ff4f9a', '#ffd23d', '#7ae1ff', '#8ce99a', '#b197fc'];
    for (var i = 0; i < 14; i++) {
      this.add({
        k: 'confetti', x: x, y: y,
        vx: (Math.random() - 0.5) * 220, vy: -80 - Math.random() * 160,
        size: 3 + Math.random() * 4, life: 1.6 + Math.random() * 0.8,
        color: cols[i % cols.length], rot: Math.random() * TAU, vrot: (Math.random() - 0.5) * 12
      });
    }
  };

  FX.prototype.puff = function (x, y, color) {
    for (var i = 0; i < 7; i++) {
      var a = Math.random() * TAU;
      this.add({
        k: 'puff', x: x, y: y, vx: Math.cos(a) * (20 + Math.random() * 50), vy: Math.sin(a) * (18 + Math.random() * 40) - 12,
        size: 5 + Math.random() * 9, life: 0.6 + Math.random() * 0.4, color: color || 'rgba(230,240,255,0.5)'
      });
    }
  };

  FX.prototype.exclaim = function (x, y, ch, color) {
    return this.add({ k: 'text', x: x, y: y, vx: 0, vy: -32, size: 15, life: 0.85, color: color || '#ff6b4a', txt: ch || '!' });
  };

  // ── Update & Draw ─────────────────────────────────────────────
  FX.prototype.update = function (dt) {
    for (var i = this.parts.length - 1; i >= 0; i--) {
      var p = this.parts[i];
      p.age += dt;
      if (p.age >= p.life) { this.parts.splice(i, 1); continue; }
      switch (p.k) {
        case 'ripple': break;
        case 'drop':
          p.vy += 620 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
          break;
        case 'confetti':
          p.vy += 380 * dt; p.vx *= (1 - 1.2 * dt);
          p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vrot * dt;
          break;
        case 'feather':
          p.vy += 60 * dt; p.vy *= (1 - 1.8 * dt);
          p.x += (p.vx + Math.sin(p.age * 4 + p.wob) * 40) * dt;
          p.y += p.vy * dt; p.rot += p.vrot * dt;
          break;
        case 'puff':
          p.vx *= (1 - 2.4 * dt); p.vy *= (1 - 2.4 * dt);
          p.x += p.vx * dt; p.y += p.vy * dt; p.size += 22 * dt;
          break;
        default:
          p.vy *= (1 - 0.6 * dt);
          p.x += (p.vx + (p.wob != null ? Math.sin(p.age * 5 + p.wob) * 16 : 0)) * dt;
          p.y += p.vy * dt;
      }
    }
  };

  function heartPath(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.75);
    ctx.bezierCurveTo(x - s * 1.3, y - s * 0.25, x - s * 0.55, y - s * 1.1, x, y - s * 0.35);
    ctx.bezierCurveTo(x + s * 0.55, y - s * 1.1, x + s * 1.3, y - s * 0.25, x, y + s * 0.75);
    ctx.closePath();
  }

  FX.prototype.draw = function (ctx) {
    for (var i = 0; i < this.parts.length; i++) {
      var p = this.parts[i];
      var f = p.age / p.life;         // 0..1
      var fade = 1 - f;
      ctx.save();
      switch (p.k) {
        case 'ripple':
          var rr = p.r0 + (p.r1 - p.r0) * (1 - Math.pow(1 - f, 2));
          ctx.globalAlpha = fade * fade;
          // erst ein blauer Schattenring (sichtbar auf hellem Grund),
          // dann der helle Ring (sichtbar auf dunklem Grund)
          ctx.beginPath();
          ctx.ellipse(p.x, p.y + p.lw * 0.5, rr, rr * 0.32, 0, 0, TAU);
          ctx.strokeStyle = 'rgba(56,116,170,0.30)';
          ctx.lineWidth = p.lw * (1 - f * 0.5) * 1.5;
          ctx.stroke();
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, rr, rr * 0.32, 0, 0, TAU);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.lw * (1 - f * 0.5);
          ctx.stroke();
          break;
        case 'drop':
          ctx.globalAlpha = fade;
          var stretch = Math.min(2.4, 1 + Math.abs(p.vy) / 260);
          var rot = Math.atan2(p.vy, p.vx) - Math.PI / 2;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.size, p.size * stretch, rot, 0, TAU);
          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.strokeStyle = 'rgba(45,105,160,0.55)';
          ctx.lineWidth = Math.max(0.7, p.size * 0.22);
          ctx.stroke();
          ctx.globalAlpha = fade * 0.85;
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.beginPath();
          ctx.arc(p.x - p.size * 0.28, p.y - p.size * 0.34, p.size * 0.32, 0, TAU);
          ctx.fill();
          break;
        case 'bubble':
          ctx.globalAlpha = fade * 0.8;
          ctx.strokeStyle = 'rgba(96,170,222,0.85)';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, TAU);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.beginPath();
          ctx.arc(p.x - p.size * 0.3, p.y - p.size * 0.3, p.size * 0.25, 0, TAU);
          ctx.fill();
          break;
        case 'heart':
          ctx.globalAlpha = fade;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot + Math.sin(p.age * 6) * 0.12);
          var hs = p.size * (0.6 + 0.6 * Math.min(1, p.age * 5)) * (1 + Math.sin(p.age * 9) * 0.06);
          ctx.fillStyle = p.color;
          heartPath(ctx, 0, 0, hs);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.beginPath();
          ctx.ellipse(-hs * 0.35, -hs * 0.35, hs * 0.18, hs * 0.12, -0.6, 0, TAU);
          ctx.fill();
          break;
        case 'note':
          ctx.globalAlpha = fade;
          ctx.fillStyle = p.color;
          ctx.translate(p.x, p.y);
          ctx.rotate(Math.sin(p.age * 5 + p.wob) * 0.25);
          ctx.beginPath();
          ctx.ellipse(-p.size * 0.28, p.size * 0.42, p.size * 0.34, p.size * 0.26, -0.4, 0, TAU);
          ctx.fill();
          ctx.fillRect(-p.size * 0.02, -p.size * 0.62, p.size * 0.14, p.size * 1.1);
          ctx.beginPath();
          ctx.moveTo(p.size * 0.10, -p.size * 0.62);
          ctx.quadraticCurveTo(p.size * 0.62, -p.size * 0.48, p.size * 0.34, -p.size * 0.05);
          ctx.quadraticCurveTo(p.size * 0.46, -p.size * 0.42, p.size * 0.10, -p.size * 0.38);
          ctx.fill();
          break;
        case 'zzz':
          ctx.globalAlpha = fade * 0.9;
          ctx.fillStyle = p.color;
          ctx.font = '700 ' + (p.size * (1 + f * 0.5)).toFixed(1) + 'px ui-rounded, system-ui, sans-serif';
          ctx.fillText('z', p.x + Math.sin(p.age * 3 + p.wob) * 6, p.y);
          break;
        case 'text':
          ctx.globalAlpha = fade;
          ctx.fillStyle = p.color;
          ctx.font = '900 ' + (p.size * (1 + (1 - fade) * 0.3)).toFixed(1) + 'px ui-rounded, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(p.txt, p.x, p.y);
          break;
        case 'sparkle':
          ctx.globalAlpha = fade;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot + p.age * 3);
          ctx.fillStyle = p.color;
          var s2 = p.size * (1 - f * 0.3);
          ctx.beginPath();
          ctx.moveTo(0, -s2);
          ctx.quadraticCurveTo(s2 * 0.18, -s2 * 0.18, s2, 0);
          ctx.quadraticCurveTo(s2 * 0.18, s2 * 0.18, 0, s2);
          ctx.quadraticCurveTo(-s2 * 0.18, s2 * 0.18, -s2, 0);
          ctx.quadraticCurveTo(-s2 * 0.18, -s2 * 0.18, 0, -s2);
          ctx.fill();
          break;
        case 'feather':
          ctx.globalAlpha = fade;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.moveTo(0, -p.size);
          ctx.quadraticCurveTo(p.size * 0.62, 0, 0, p.size);
          ctx.quadraticCurveTo(-p.size * 0.62, 0, 0, -p.size);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.12)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(0, -p.size); ctx.lineTo(0, p.size); ctx.stroke();
          break;
        case 'confetti':
          ctx.globalAlpha = fade;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size * 0.5, -p.size * 0.32, p.size, p.size * 0.64);
          break;
        case 'puff':
          ctx.globalAlpha = fade * 0.55;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, TAU);
          ctx.fill();
          break;
      }
      ctx.restore();
    }
  };

  root.DuckFX = FX;
})(typeof window !== 'undefined' ? window : this);
