/*
 * (c) 2026 Lucas Reiser (forliHD) — Alle Rechte vorbehalten. Siehe LICENSE.
 *
 * CursorDuck — Renderer 🦆
 *
 * Zeichnet eine Ente prozedural auf ein 2D-Canvas.
 * Lokales Koordinatensystem: (0,0) = Wasserlinie unter dem Entenkörper,
 * +x = Blickrichtung, -y = oben. Einheit r = Körperradius in px.
 *
 * DuckRender.draw(ctx, model, pose)
 *   pose: { x, y, r, dir, t, bob, lean, headDip, headSide, headRot, eyeOpen,
 *           eyeHappy, wingFlap, wingLift, paddle, squash, submerge, alpha,
 *           blush, sleep, wobble, reflection }
 */
(function (root) {
  'use strict';

  var TAU = Math.PI * 2;

  // Blickrichtung: kontinuierlich -1..1 (x-Skalierung). Werte nahe 0 werden
  // weggeklemmt, sonst kollabiert die Ente beim Wenden zur Linie.
  function normDir(d) {
    if (d == null || d !== d) return 1;
    d = Math.max(-1, Math.min(1, d));
    if (d >= 0) return Math.max(0.08, d);
    return Math.min(-0.08, d);
  }

  function defaultPose(p) {
    p = p || {};
    return {
      x: p.x || 0, y: p.y || 0, r: p.r || 26, dir: normDir(p.dir),
      t: p.t || 0, bob: p.bob || 0, lean: p.lean || 0,
      headDip: p.headDip || 0, headSide: p.headSide || 0, headRot: p.headRot || 0,
      eyeOpen: p.eyeOpen == null ? 1 : p.eyeOpen, eyeHappy: p.eyeHappy || 0,
      wingFlap: p.wingFlap || 0, wingLift: p.wingLift || 0,
      paddle: p.paddle || 0, squash: p.squash == null ? 1 : p.squash,
      submerge: p.submerge || 0, alpha: p.alpha == null ? 1 : p.alpha,
      blush: p.blush || 0, sleep: p.sleep || 0, wobble: p.wobble || 0,
      beakOpen: p.beakOpen || 0,
      reflection: p.reflection !== false, water: p.water !== false
    };
  }

  // ── kleine Helfer ─────────────────────────────────────────────
  function ell(ctx, cx, cy, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot || 0, 0, TAU);
  }
  function fillEll(ctx, cx, cy, rx, ry, rot, color) {
    ell(ctx, cx, cy, rx, ry, rot);
    ctx.fillStyle = color;
    ctx.fill();
  }
  function mix(a, b, t) {
    var ca = hex(a), cb = hex(b);
    return 'rgb(' + Math.round(ca[0] + (cb[0] - ca[0]) * t) + ',' +
      Math.round(ca[1] + (cb[1] - ca[1]) * t) + ',' +
      Math.round(ca[2] + (cb[2] - ca[2]) * t) + ')';
  }
  var hexCache = {};
  function hex(h) {
    if (hexCache[h]) return hexCache[h];
    var v = [200, 200, 200];
    if (h && h.charAt(0) === '#') {
      if (h.length === 7) {
        v = [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)];
      } else if (h.length === 4) {
        v = [parseInt(h.charAt(1) + h.charAt(1), 16), parseInt(h.charAt(2) + h.charAt(2), 16), parseInt(h.charAt(3) + h.charAt(3), 16)];
      }
    }
    hexCache[h] = v;
    return v;
  }
  function rgba(h, a) {
    var c = hex(h);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }

  // ── Geometrie eines Modells ───────────────────────────────────
  function geom(m, r) {
    var chonk = m.chonk || 0;
    var bw = m.bodyW * r * (1 + chonk * 0.06);
    var bh = m.bodyH * r * (1 + chonk * 0.05);
    var g = {
      r: r,
      bw: bw, bh: bh,
      bcx: -0.04 * r, bcy: -0.30 * r - chonk * 0.02 * r,
      hr: m.headR * r,
      neckLen: m.neckLen * r,
      neckW: m.neckW * r,
      beakLen: m.beakLen * r,
      beakH: m.beakH * r,
      tailUp: m.tailUp * r
    };
    g.hx = (0.38 + chonk * 0.04) * r + g.neckLen * 0.06;
    g.hy = g.bcy - g.bh * 0.62 - g.neckLen * 0.80;
    return g;
  }

  // ── Körper (ohne Kopf) ────────────────────────────────────────
  function drawTail(ctx, m, g, p) {
    var r = g.r;
    var bx = g.bcx - g.bw * 0.72, by = g.bcy - g.bh * 0.12;
    var up = g.tailUp * (1 + p.wingFlap * 0.35);
    ctx.beginPath();
    ctx.moveTo(bx + r * 0.10, by - r * 0.22);
    ctx.quadraticCurveTo(bx - r * 0.26, by - up * 0.92, bx - r * 0.44, by - up * 1.00);
    ctx.quadraticCurveTo(bx - r * 0.52, by - up * 0.58, bx - r * 0.40, by - up * 0.28);
    ctx.quadraticCurveTo(bx - r * 0.24, by + r * 0.02, bx - r * 0.22, by + r * 0.10);
    ctx.quadraticCurveTo(bx - r * 0.06, by + r * 0.16, bx + r * 0.10, by + r * 0.05);
    ctx.closePath();
    var tg = ctx.createLinearGradient(bx - r * 0.5, by - up, bx + r * 0.1, by);
    tg.addColorStop(0, mix(m.tail, '#ffffff', 0.12));
    tg.addColorStop(1, m.tail);
    ctx.fillStyle = tg;
    ctx.fill();
  }

  function bodyPath(ctx, g) {
    ell(ctx, g.bcx, g.bcy, g.bw, g.bh);
  }

  function drawBody(ctx, m, g, p) {
    var grd;
    if (m.rainbow) {
      grd = ctx.createLinearGradient(g.bcx - g.bw, g.bcy - g.bh, g.bcx + g.bw, g.bcy + g.bh);
      grd.addColorStop(0.00, '#ff6b6b');
      grd.addColorStop(0.20, '#ffa94d');
      grd.addColorStop(0.40, '#ffe066');
      grd.addColorStop(0.60, '#8ce99a');
      grd.addColorStop(0.80, '#66d9e8');
      grd.addColorStop(1.00, '#b197fc');
    } else {
      grd = ctx.createLinearGradient(0, g.bcy - g.bh, 0, g.bcy + g.bh);
      grd.addColorStop(0, mix(m.body, '#ffffff', 0.18));
      grd.addColorStop(0.55, m.body);
      grd.addColorStop(1, m.bodyDark);
    }
    bodyPath(ctx, g);
    ctx.fillStyle = grd;
    ctx.fill();

    // Sternenhimmel-Körper
    if (m.stars) {
      ctx.save();
      bodyPath(ctx, g); ctx.clip();
      for (var i = 0; i < 16; i++) {
        var a = i * 2.399, rad = Math.sqrt((i + 0.5) / 16);
        var sx = g.bcx + Math.cos(a) * rad * g.bw * 0.92;
        var sy = g.bcy + Math.sin(a) * rad * g.bh * 0.92;
        var tw = 0.45 + 0.55 * Math.abs(Math.sin(p.t * 1.8 + i));
        fillEll(ctx, sx, sy, g.r * 0.035 * tw, g.r * 0.035 * tw, 0, 'rgba(255,255,255,' + (0.5 + 0.5 * tw) + ')');
      }
      ctx.restore();
    }

    // Bauch / Brust-Aufhellung
    ctx.save();
    bodyPath(ctx, g); ctx.clip();
    var bg = ctx.createRadialGradient(
      g.bcx + g.bw * 0.35, g.bcy + g.bh * 0.30, g.r * 0.05,
      g.bcx + g.bw * 0.35, g.bcy + g.bh * 0.30, g.bw * 0.95);
    bg.addColorStop(0, rgba(m.belly, 0.85));
    bg.addColorStop(1, rgba(m.belly, 0));
    ctx.fillStyle = bg;
    ctx.fillRect(g.bcx - g.bw, g.bcy - g.bh, g.bw * 2, g.bh * 2);
    // Glanzlicht oben
    var hl = ctx.createLinearGradient(0, g.bcy - g.bh, 0, g.bcy);
    hl.addColorStop(0, 'rgba(255,255,255,0.35)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.fillRect(g.bcx - g.bw, g.bcy - g.bh, g.bw * 2, g.bh);
    ctx.restore();
  }

  function drawWing(ctx, m, g, p, far) {
    var r = g.r;
    // Flügel liegt hinten am Körper an, Spitze zeigt nach hinten
    var wx = g.bcx - g.bw * 0.10, wy = g.bcy + g.bh * 0.06;
    var sx = g.bcx + g.bw * 0.40, sy = g.bcy - g.bh * 0.40;   // Schultergelenk
    var lift = p.wingFlap * (far ? 0.86 : 1);
    if (far && lift < 0.04) return;   // der ferne Flügel ist sonst verdeckt
    ctx.save();
    if (far) ctx.globalAlpha *= 0.85;
    // um die Schulter drehen, damit die Flügelspitze nach oben schlägt
    ctx.translate(sx, sy - (far ? g.bh * 0.06 : 0));
    ctx.rotate(lift * 0.78 + p.wingLift * 0.24);
    ctx.translate(wx - sx, wy - sy);
    var wrx = g.bw * (far ? 0.60 : 0.66), wry = g.bh * 0.46 * (1 - lift * 0.14);

    ctx.beginPath();
    ctx.moveTo(-wrx * 1.02, wry * 0.42);                                  // Flügelspitze hinten
    ctx.quadraticCurveTo(-wrx * 0.62, -wry * 0.92, wrx * 0.30, -wry * 0.86);
    ctx.quadraticCurveTo(wrx * 0.92, -wry * 0.62, wrx * 0.74, wry * 0.18);
    ctx.quadraticCurveTo(wrx * 0.10, wry * 0.86, -wrx * 1.02, wry * 0.42);
    ctx.closePath();
    var wg = ctx.createLinearGradient(0, -wry, 0, wry);
    wg.addColorStop(0, mix(m.wing, far ? '#000000' : '#ffffff', far ? 0.10 : 0.20));
    wg.addColorStop(0.5, mix(m.wing, '#000000', far ? 0.22 : 0.06));
    wg.addColorStop(1, mix(m.wing, '#000000', far ? 0.36 : 0.24));
    ctx.fillStyle = wg;
    ctx.fill();

    ctx.save();
    ctx.clip();
    // Spiegelband: kurzer Streifen im hinteren Drittel
    ctx.save();
    ctx.translate(-wrx * 0.34, wry * 0.20);
    ctx.rotate(-0.30);
    ctx.fillStyle = rgba(m.wingBar, 0.85);
    ctx.fillRect(-wrx * 0.52, -wry * 0.11, wrx * 0.96, wry * 0.21);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-wrx * 0.52, wry * 0.10, wrx * 0.96, wry * 0.07);
    ctx.restore();
    // Handschwingen
    ctx.strokeStyle = 'rgba(0,0,0,0.10)';
    ctx.lineWidth = r * 0.028;
    for (var i = 0; i < 4; i++) {
      var k = i / 3;
      ctx.beginPath();
      ctx.moveTo(-wrx * (0.30 + k * 0.55), -wry * (0.55 - k * 0.35));
      ctx.quadraticCurveTo(-wrx * (0.62 + k * 0.35), wry * 0.10, -wrx * (0.78 + k * 0.26), wry * (0.52 + k * 0.1));
      ctx.stroke();
    }
    ctx.restore();

    // Kante: oben ein Lichtsaum, unten ein weicher Schatten → Flügel liest sich als Form
    ctx.beginPath();
    ctx.moveTo(-wrx * 1.02, wry * 0.42);
    ctx.quadraticCurveTo(-wrx * 0.62, -wry * 0.92, wrx * 0.30, -wry * 0.86);
    ctx.quadraticCurveTo(wrx * 0.92, -wry * 0.62, wrx * 0.74, wry * 0.18);
    ctx.strokeStyle = 'rgba(255,255,255,0.30)';
    ctx.lineWidth = r * 0.035;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(wrx * 0.74, wry * 0.18);
    ctx.quadraticCurveTo(wrx * 0.10, wry * 0.86, -wrx * 1.02, wry * 0.42);
    ctx.strokeStyle = 'rgba(0,0,0,0.16)';
    ctx.lineWidth = r * 0.045;
    ctx.stroke();
    ctx.restore();
  }

  function drawNeck(ctx, m, g, p, hx, hy) {
    var r = g.r;
    var baseFront = { x: g.bcx + g.bw * 0.52, y: g.bcy - g.bh * 0.42 };
    var baseBack = { x: g.bcx + g.bw * 0.05, y: g.bcy - g.bh * 0.80 };
    var w = g.neckW;
    var dx = hx - baseFront.x, dy = hy - baseFront.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / len, ny = dx / len; // Normale
    var sway = Math.sin(p.t * 2.2) * r * 0.02;

    ctx.beginPath();
    ctx.moveTo(baseFront.x, baseFront.y);
    ctx.quadraticCurveTo(
      baseFront.x + dx * 0.45 + nx * w * 0.55 + sway,
      baseFront.y + dy * 0.45 + ny * w * 0.55,
      hx + nx * w * 0.35, hy + ny * w * 0.35);
    ctx.lineTo(hx - nx * w * 0.55, hy - ny * w * 0.55);
    ctx.quadraticCurveTo(
      baseBack.x + dx * 0.42 - nx * w * 0.25 + sway,
      baseBack.y + dy * 0.42 - ny * w * 0.25,
      baseBack.x, baseBack.y);
    ctx.closePath();
    var ng = ctx.createLinearGradient(baseFront.x, baseFront.y, hx, hy);
    ng.addColorStop(0, m.body);
    ng.addColorStop(0.45, mix(m.body, m.head, 0.6));
    ng.addColorStop(1, m.head);
    ctx.fillStyle = ng;
    ctx.fill();

    // Den Halsring zeichnet drawHead am Kopfansatz — hier verdeckt ihn der Kopf.
  }

  function drawBeak(ctx, m, g, p) {
    var hr = g.hr, bl = g.beakLen, bhh = g.beakH;
    var bx = hr * 0.62, by = hr * 0.10;
    var open = p.beakOpen || 0;

    var bg = ctx.createLinearGradient(bx, by - bhh, bx, by + bhh);
    bg.addColorStop(0, mix(m.beak, '#ffffff', 0.25));
    bg.addColorStop(1, m.beakDark);

    // Rachen (nur sichtbar wenn offen)
    if (open > 0.02) {
      ctx.beginPath();
      ctx.moveTo(bx - hr * 0.20, by - bhh * 0.5);
      ctx.lineTo(bx + bl * 0.92, by + bhh * 0.05);
      ctx.lineTo(bx - hr * 0.16, by + bhh * (0.5 + open * 1.7));
      ctx.closePath();
      ctx.fillStyle = '#8e3b46';
      ctx.fill();
    }

    // Unterschnabel (klappt beim Quaken nach unten)
    ctx.save();
    ctx.translate(bx - hr * 0.2, by + bhh * 0.2);
    ctx.rotate(open * 0.55);
    ctx.beginPath();
    ctx.moveTo(0, -bhh * 0.30);
    ctx.quadraticCurveTo(bl * 0.55, bhh * 0.05, bl * 1.12, bhh * 0.02);
    ctx.quadraticCurveTo(bl * 0.6, bhh * 0.85, 0, bhh * 0.62);
    ctx.closePath();
    ctx.fillStyle = mix(m.beakDark, '#000000', 0.06);
    ctx.fill();
    ctx.restore();

    // Oberschnabel
    ctx.save();
    ctx.translate(bx - hr * 0.25, by - bhh * 0.2);
    ctx.rotate(-open * 0.22);
    ctx.beginPath();
    ctx.moveTo(0, -bhh * 0.7);
    ctx.quadraticCurveTo(bl * 0.75, -bhh * 0.8, bl * 1.02, bhh * 0.25);
    ctx.quadraticCurveTo(bl * 0.7, bhh * 0.95, 0, bhh * 0.9);
    ctx.closePath();
    ctx.fillStyle = bg;
    ctx.fill();
    // Nasenloch
    fillEll(ctx, bl * 0.42, -bhh * 0.05, g.r * 0.028, g.r * 0.02, 0, rgba(m.beakDark, 0.85));
    ctx.restore();

    if (open <= 0.02) {
      // geschlossene Schnabellinie
      ctx.beginPath();
      ctx.moveTo(bx - hr * 0.18, by + bhh * 0.18);
      ctx.quadraticCurveTo(bx + bl * 0.6, by + bhh * 0.28, bx + bl * 0.94, by + bhh * 0.05);
      ctx.strokeStyle = rgba(m.beakDark, 0.75);
      ctx.lineWidth = g.r * 0.035;
      ctx.stroke();
    }
  }

  function drawEye(ctx, m, g, p) {
    if (p.silhouette) return;
    var hr = g.hr;
    var ex = hr * 0.34, ey = -hr * 0.16;
    var er = hr * 0.30;
    var open = Math.max(0, Math.min(1, p.eyeOpen)) * (1 - p.sleep);

    if (p.eyeHappy > 0.5 || open < 0.06) {
      // Zufriedene ^^ Augen bzw. geschlossen
      ctx.beginPath();
      if (p.eyeHappy > 0.5) {
        ctx.moveTo(ex - er * 0.9, ey + er * 0.25);
        ctx.quadraticCurveTo(ex, ey - er * 0.95, ex + er * 0.9, ey + er * 0.25);
      } else {
        ctx.moveTo(ex - er * 0.85, ey);
        ctx.quadraticCurveTo(ex, ey + er * 0.55, ex + er * 0.85, ey);
      }
      ctx.strokeStyle = m.pupil;
      ctx.lineWidth = g.r * 0.055;
      ctx.lineCap = 'round';
      ctx.stroke();
      return;
    }

    // Augapfel
    fillEll(ctx, ex, ey, er, er * open, 0, m.eye);
    // Iris/Pupille
    var pr = er * 0.62;
    fillEll(ctx, ex + er * 0.10, ey, pr, pr * open, 0, m.pupil);
    // Glanzpunkte
    fillEll(ctx, ex + er * 0.32, ey - er * 0.34 * open, er * 0.20, er * 0.20 * open, 0, 'rgba(255,255,255,0.95)');
    fillEll(ctx, ex - er * 0.20, ey + er * 0.30 * open, er * 0.11, er * 0.11 * open, 0, 'rgba(255,255,255,0.6)');
    // Lidschatten
    ctx.beginPath();
    ctx.ellipse(ex, ey, er, er * open, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = g.r * 0.03;
    ctx.stroke();
  }

  function drawCrest(ctx, m, g, p) {
    if (!m.crest) return;
    var hr = g.hr, c = m.crest, L = c.len * hr;
    var sway = Math.sin(p.t * 3.1) * 0.12 + p.wingFlap * 0.2;
    ctx.save();
    ctx.translate(-hr * 0.15, -hr * 0.85);
    ctx.fillStyle = c.color;
    if (c.kind === 'fan') {
      for (var i = 0; i < 4; i++) {
        ctx.save();
        ctx.rotate(-0.9 + i * 0.34 + sway);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(L * 0.35, -L * 0.6, 0, -L);
        ctx.quadraticCurveTo(-L * 0.30, -L * 0.55, 0, 0);
        ctx.fill();
        ctx.restore();
      }
    } else if (c.kind === 'spike') {
      ctx.save();
      ctx.rotate(1.9 + sway * 0.5);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(L * 0.5, L * 0.25, L * 1.15, L * 0.05);
      ctx.quadraticCurveTo(L * 0.55, -L * 0.15, 0, -hr * 0.28);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else {
      for (var j = 0; j < 3; j++) {
        ctx.save();
        ctx.rotate(-0.5 + j * 0.42 + sway);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(L * 0.28, -L * 0.55, L * 0.05, -L * 0.92);
        ctx.quadraticCurveTo(-L * 0.22, -L * 0.5, 0, 0);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // ── Accessoires (im Kopf-Koordinatensystem) ───────────────────
  function drawGlasses(ctx, m, g, p) {
    if (!m.glasses || p.silhouette) return;
    var hr = g.hr, ex = hr * 0.34, ey = -hr * 0.16, er = hr * 0.32;
    ctx.save();
    if (m.glasses === 'round') {
      ctx.strokeStyle = '#2f2a24'; ctx.lineWidth = g.r * 0.045;
      ell(ctx, ex, ey, er * 1.15, er * 1.15); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ex - er * 1.15, ey); ctx.lineTo(ex - er * 1.9, ey - hr * 0.05);
      ctx.moveTo(ex + er * 1.15, ey - hr * 0.02); ctx.lineTo(ex + er * 1.5, ey - hr * 0.08);
      ctx.stroke();
      ell(ctx, ex, ey, er * 1.15, er * 1.15);
      ctx.fillStyle = 'rgba(200,235,255,0.22)'; ctx.fill();
    } else if (m.glasses === 'sun') {
      ctx.fillStyle = '#15151a';
      ctx.beginPath();
      ctx.moveTo(ex - er * 1.5, ey - er * 0.85);
      ctx.lineTo(ex + er * 1.35, ey - er * 0.95);
      ctx.lineTo(ex + er * 1.15, ey + er * 0.75);
      ctx.quadraticCurveTo(ex, ey + er * 1.0, ex - er * 1.5, ey + er * 0.25);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#15151a'; ctx.lineWidth = g.r * 0.05;
      ctx.beginPath(); ctx.moveTo(ex - er * 1.5, ey - er * 0.7); ctx.lineTo(ex - er * 2.1, ey - er * 0.4); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(ex - er * 0.7, ey - er * 0.6, er * 0.5, er * 1.1);
    } else if (m.glasses === 'visor') {
      // endet vor dem Schnabelansatz, sonst verschwindet das halbe Gesicht
      var vg = ctx.createLinearGradient(ex - er * 2, ey, ex + er * 1.1, ey);
      vg.addColorStop(0, 'rgba(255,46,136,0.75)');
      vg.addColorStop(0.55, 'rgba(0,229,255,0.85)');
      vg.addColorStop(1, 'rgba(0,229,255,0.35)');
      ctx.fillStyle = vg;
      ctx.beginPath();
      ctx.moveTo(ex - er * 2.0, ey - er * 0.75);
      ctx.lineTo(ex + er * 1.05, ey - er * 0.70);
      ctx.quadraticCurveTo(ex + er * 1.15, ey + er * 0.10, ex + er * 0.85, ey + er * 0.30);
      ctx.lineTo(ex - er * 2.0, ey + er * 0.28);
      ctx.closePath(); ctx.fill();
      ctx.save();
      ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = g.r * 0.45;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(ex - er * 1.9, ey - er * 0.18, er * 2.7, er * 0.14);
      ctx.restore();
    } else if (m.glasses === 'eyepatch') {
      // Klappe sitzt auf dem abgewandten Auge — das sichtbare Auge bleibt frei
      ctx.strokeStyle = '#1a1a1e'; ctx.lineWidth = g.r * 0.055;
      ctx.beginPath();
      ctx.ellipse(-hr * 0.05, -hr * 0.05, hr * 0.94, hr * 0.92, 0, -1.35, 0.35);
      ctx.stroke();
      ctx.fillStyle = '#1a1a1e';
      ell(ctx, ex - er * 1.75, ey + er * 0.15, er * 0.95, er * 0.92, -0.15); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ell(ctx, ex - er * 1.95, ey - er * 0.15, er * 0.34, er * 0.24, -0.3); ctx.fill();
    } else if (m.glasses === 'monocle') {
      ctx.strokeStyle = '#e8c33c'; ctx.lineWidth = g.r * 0.04;
      ell(ctx, ex, ey, er * 1.2, er * 1.2); ctx.stroke();
      ctx.fillStyle = 'rgba(220,240,255,0.2)'; ctx.fill();
    }
    ctx.restore();
  }

  function drawHat(ctx, m, g, p) {
    if (!m.hat || p.silhouette) return;
    var hr = g.hr, r = g.r;
    var top = -hr * 0.92;
    ctx.save();
    ctx.translate(-hr * 0.05, top);
    ctx.rotate(-0.12 + Math.sin(p.t * 1.6) * 0.02);

    switch (m.hat) {
      case 'pirate':
        ctx.fillStyle = '#1c1c22';
        ctx.beginPath();
        ctx.moveTo(-hr * 1.15, hr * 0.28);
        ctx.quadraticCurveTo(-hr * 0.5, -hr * 0.95, hr * 0.15, -hr * 0.62);
        ctx.quadraticCurveTo(hr * 0.9, -hr * 0.95, hr * 1.25, hr * 0.3);
        ctx.quadraticCurveTo(hr * 0.1, hr * 0.72, -hr * 1.15, hr * 0.28);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#f2ead6';
        fillEll(ctx, hr * 0.05, -hr * 0.18, hr * 0.22, hr * 0.24, 0, '#f2ead6');
        ctx.fillStyle = '#1c1c22';
        fillEll(ctx, hr * 0.0, -hr * 0.22, hr * 0.055, hr * 0.06, 0, '#1c1c22');
        fillEll(ctx, hr * 0.12, -hr * 0.22, hr * 0.055, hr * 0.06, 0, '#1c1c22');
        ctx.fillStyle = '#f2ead6';
        ctx.fillRect(-hr * 0.10, -hr * 0.06, hr * 0.32, hr * 0.10);
        break;
      case 'crown':
        var cg = ctx.createLinearGradient(0, -hr * 0.8, 0, hr * 0.2);
        cg.addColorStop(0, '#ffe98a'); cg.addColorStop(1, '#d9a316');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.moveTo(-hr * 0.85, hr * 0.2);
        ctx.lineTo(-hr * 0.85, -hr * 0.35);
        ctx.lineTo(-hr * 0.45, -hr * 0.02);
        ctx.lineTo(-hr * 0.02, -hr * 0.72);
        ctx.lineTo(hr * 0.42, -hr * 0.02);
        ctx.lineTo(hr * 0.85, -hr * 0.35);
        ctx.lineTo(hr * 0.85, hr * 0.2);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#b8892f';
        ctx.fillRect(-hr * 0.85, hr * 0.08, hr * 1.7, hr * 0.14);
        fillEll(ctx, 0, -hr * 0.02, hr * 0.13, hr * 0.13, 0, '#e0455e');
        fillEll(ctx, -hr * 0.5, hr * 0.02, hr * 0.08, hr * 0.08, 0, '#4aa3e0');
        fillEll(ctx, hr * 0.5, hr * 0.02, hr * 0.08, hr * 0.08, 0, '#4aa3e0');
        break;
      case 'party':
        ctx.fillStyle = '#ff4f9a';
        ctx.beginPath();
        ctx.moveTo(-hr * 0.62, hr * 0.28);
        ctx.lineTo(hr * 0.12, -hr * 1.45);
        ctx.lineTo(hr * 0.72, hr * 0.18);
        ctx.closePath(); ctx.fill();
        ctx.save(); ctx.clip();
        ctx.fillStyle = '#ffd23d';
        for (var s = 0; s < 4; s++) {
          ctx.save();
          ctx.translate(0, hr * 0.28 - s * hr * 0.44);
          ctx.rotate(-0.35);
          ctx.fillRect(-hr, 0, hr * 2, hr * 0.16);
          ctx.restore();
        }
        ctx.restore();
        fillEll(ctx, hr * 0.13, -hr * 1.48, hr * 0.19, hr * 0.19, 0, '#7ae1ff');
        break;
      case 'ninja':
        ctx.fillStyle = '#2a2f3d';
        ctx.beginPath();
        ctx.moveTo(-hr * 1.0, hr * 0.05);
        ctx.quadraticCurveTo(0, -hr * 0.55, hr * 1.0, hr * 0.0);
        ctx.lineTo(hr * 1.0, hr * 0.42);
        ctx.quadraticCurveTo(0, -hr * 0.1, -hr * 1.0, hr * 0.45);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#e04b4b'; ctx.lineWidth = r * 0.05;
        var fl = Math.sin(p.t * 6) * hr * 0.12;
        ctx.beginPath();
        ctx.moveTo(-hr * 0.95, hr * 0.25);
        ctx.quadraticCurveTo(-hr * 1.6, hr * 0.5 + fl, -hr * 2.1, hr * 0.35 - fl);
        ctx.moveTo(-hr * 0.95, hr * 0.35);
        ctx.quadraticCurveTo(-hr * 1.5, hr * 0.75 + fl, -hr * 1.95, hr * 0.8 - fl);
        ctx.stroke();
        break;
      case 'tophat':
        ctx.fillStyle = '#1c1c22';
        ctx.fillRect(-hr * 0.55, -hr * 1.25, hr * 1.1, hr * 1.3);
        ctx.fillRect(-hr * 1.0, hr * 0.0, hr * 2.0, hr * 0.18);
        ctx.fillStyle = '#e04b4b';
        ctx.fillRect(-hr * 0.55, -hr * 0.28, hr * 1.1, hr * 0.22);
        break;
      case 'wizard':
        var wg2 = ctx.createLinearGradient(0, -hr * 2, 0, hr * 0.3);
        wg2.addColorStop(0, '#5b47a8'); wg2.addColorStop(1, '#372a70');
        ctx.fillStyle = wg2;
        ctx.beginPath();
        ctx.moveTo(-hr * 0.75, hr * 0.15);
        ctx.quadraticCurveTo(-hr * 0.2, -hr * 1.0, -hr * 0.75, -hr * 1.85);
        ctx.quadraticCurveTo(hr * 0.35, -hr * 1.1, hr * 0.85, hr * 0.05);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#372a70';
        ctx.beginPath();
        ctx.ellipse(0, hr * 0.12, hr * 1.25, hr * 0.30, -0.06, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#ffe066';
        for (var st = 0; st < 3; st++) {
          var sa = p.t * 0.8 + st * 2.1;
          star(ctx, -hr * 0.3 + Math.cos(sa) * hr * 0.28, -hr * 0.75 - st * hr * 0.3, hr * 0.12);
        }
        break;
      case 'chef':
        // Kappe mit Kontur, sonst geht Weiß auf Weiß unter
        ctx.save();
        ctx.strokeStyle = '#cfd3cc'; ctx.lineWidth = r * 0.028;
        ctx.fillStyle = '#fdfdfa';
        ctx.beginPath();
        ctx.ellipse(-hr * 0.44, -hr * 0.50, hr * 0.42, hr * 0.40, 0, 0, TAU);
        ctx.ellipse(hr * 0.10, -hr * 0.70, hr * 0.47, hr * 0.45, 0, 0, TAU);
        ctx.ellipse(hr * 0.60, -hr * 0.44, hr * 0.38, hr * 0.36, 0, 0, TAU);
        ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-hr * 0.70, -hr * 0.34);
        ctx.lineTo(hr * 0.80, -hr * 0.34);
        ctx.quadraticCurveTo(hr * 0.86, hr * 0.12, hr * 0.72, hr * 0.16);
        ctx.lineTo(-hr * 0.62, hr * 0.16);
        ctx.quadraticCurveTo(-hr * 0.76, hr * 0.10, -hr * 0.70, -hr * 0.34);
        ctx.closePath();
        ctx.fillStyle = '#f4f3ec'; ctx.fill(); ctx.stroke();
        ctx.restore();
        break;
      case 'astro':
        // Helm umschließt Kopf UND Schnabel
        ctx.save();
        ctx.translate(hr * 0.30, hr * 0.86);
        var hg = ctx.createRadialGradient(-hr * 0.5, -hr * 0.6, hr * 0.1, 0, 0, hr * 1.8);
        hg.addColorStop(0, 'rgba(255,255,255,0.50)');
        hg.addColorStop(0.55, 'rgba(180,220,255,0.16)');
        hg.addColorStop(1, 'rgba(140,190,255,0.34)');
        ell(ctx, 0, 0, hr * 1.62, hr * 1.55); ctx.fillStyle = hg; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = r * 0.055; ctx.stroke();
        ctx.strokeStyle = 'rgba(120,170,225,0.35)'; ctx.lineWidth = r * 0.02;
        ell(ctx, 0, 0, hr * 1.44, hr * 1.38); ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(-hr * 0.55, -hr * 0.5, hr * 0.85, hr * 0.5, -0.7, 0, Math.PI);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = r * 0.06; ctx.stroke();
        ctx.restore();
        break;
      case 'halo':
        ctx.save();
        ctx.translate(0, -hr * 0.55);
        ctx.shadowColor = '#ffe98a'; ctx.shadowBlur = r * 0.5;
        ctx.strokeStyle = '#ffe066'; ctx.lineWidth = r * 0.07;
        ctx.beginPath();
        ctx.ellipse(0, Math.sin(p.t * 1.5) * hr * 0.06, hr * 0.72, hr * 0.24, 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
        break;
      case 'horns':
        ctx.fillStyle = '#8c1f2e';
        for (var hSide = 0; hSide < 2; hSide++) {
          var sx2 = hSide ? 1 : -1;
          ctx.beginPath();
          ctx.moveTo(sx2 * hr * 0.30, hr * 0.12);
          ctx.quadraticCurveTo(sx2 * hr * 0.72, -hr * 0.20, sx2 * hr * 0.52, -hr * 0.72);
          ctx.quadraticCurveTo(sx2 * hr * 0.28, -hr * 0.28, sx2 * hr * 0.10, hr * 0.14);
          ctx.closePath(); ctx.fill();
        }
        break;
      case 'cowboy':
        ctx.fillStyle = '#8a5a2c';
        ctx.beginPath();
        ctx.ellipse(0, hr * 0.16, hr * 1.5, hr * 0.34, 0, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-hr * 0.62, hr * 0.16);
        ctx.quadraticCurveTo(-hr * 0.55, -hr * 0.78, 0, -hr * 0.72);
        ctx.quadraticCurveTo(hr * 0.58, -hr * 0.78, hr * 0.62, hr * 0.16);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#5c3a18';
        ctx.fillRect(-hr * 0.62, -hr * 0.08, hr * 1.24, hr * 0.20);
        break;
      case 'cap':
        ctx.fillStyle = '#e04b4b';
        ctx.beginPath();
        ctx.arc(0, hr * 0.1, hr * 0.78, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#c23a3a';
        ctx.beginPath();
        ctx.ellipse(hr * 0.62, hr * 0.12, hr * 0.72, hr * 0.18, 0, -Math.PI, 0);
        ctx.fill();
        break;
      case 'santa': {
        // Zipfelmütze: rote Haube, weißes Bündchen, Bommel kippt nach hinten
        var sway2 = Math.sin(p.t * 1.8) * hr * 0.06;
        ctx.fillStyle = '#d6404a';
        ctx.beginPath();
        ctx.moveTo(-hr * 0.82, hr * 0.18);
        ctx.quadraticCurveTo(-hr * 0.55, -hr * 0.85, hr * 0.05, -hr * 0.72);
        ctx.quadraticCurveTo(-hr * 0.45, -hr * 1.05, -hr * 1.15, -hr * 0.62 + sway2);
        ctx.quadraticCurveTo(-hr * 0.55, -hr * 0.35, -hr * 0.35, hr * 0.05);
        ctx.lineTo(hr * 0.72, hr * 0.02);
        ctx.quadraticCurveTo(hr * 0.55, -hr * 0.55, hr * 0.05, -hr * 0.72);
        ctx.closePath();
        ctx.fill();
        // Bündchen
        ctx.save();
        ctx.strokeStyle = '#fdfdfa';
        ctx.lineWidth = hr * 0.26;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-hr * 0.82, hr * 0.16);
        ctx.quadraticCurveTo(0, hr * 0.32, hr * 0.74, hr * 0.02);
        ctx.stroke();
        ctx.restore();
        // Bommel
        fillEll(ctx, -hr * 1.15, -hr * 0.62 + sway2, hr * 0.2, hr * 0.2, 0, '#ffffff');
        break;
      }
    }
    ctx.restore();
  }

  function star(ctx, cx, cy, rad) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5;
      var rr = i % 2 ? rad * 0.42 : rad;
      var px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawHead(ctx, m, g, p) {
    var hr = g.hr;
    // Kopf
    var hg;
    if (m.rainbow) {
      hg = ctx.createLinearGradient(-hr, -hr, hr, hr);
      hg.addColorStop(0, '#ff8fa3');
      hg.addColorStop(0.35, '#ffd166');
      hg.addColorStop(0.7, '#8ce99a');
      hg.addColorStop(1, '#74c0fc');
    } else {
      hg = ctx.createRadialGradient(-hr * 0.25, -hr * 0.35, hr * 0.1, 0, 0, hr * 1.25);
      hg.addColorStop(0, mix(m.head, '#ffffff', 0.28));
      hg.addColorStop(0.65, m.head);
      hg.addColorStop(1, m.headDark);
    }
    fillEll(ctx, 0, 0, hr, hr * 0.97, 0, hg);

    // Halsring: sitzt am Kopfansatz — am Hals selbst verdeckt ihn der Kopf
    if (m.neckRing) {
      ctx.save();
      ell(ctx, 0, 0, hr, hr * 0.97); ctx.clip();
      // gebogenes Band entlang der Kopfunterkante
      ctx.strokeStyle = m.neckRing;
      ctx.lineWidth = hr * 0.26;
      ctx.beginPath();
      ctx.ellipse(0, 0, hr * 0.84, hr * 0.80, 0, 0.18, Math.PI - 0.18);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.10)';
      ctx.lineWidth = hr * 0.05;
      ctx.beginPath();
      ctx.ellipse(0, 0, hr * 0.94, hr * 0.90, 0, 0.20, Math.PI - 0.20);
      ctx.stroke();
      ctx.restore();
    }

    // Wange (Mandarin/Wood/Goose)
    if (m.cheek) {
      ctx.save();
      ell(ctx, 0, 0, hr, hr * 0.97); ctx.clip();
      fillEll(ctx, hr * 0.18, hr * 0.28, hr * 0.62, hr * 0.42, -0.25, rgba(m.cheek, 0.9));
      ctx.restore();
    }

    // Petting-Röte
    if (p.blush > 0.02) {
      fillEll(ctx, hr * 0.05, hr * 0.30, hr * 0.34, hr * 0.20, 0, 'rgba(255,120,140,' + (0.55 * p.blush) + ')');
      fillEll(ctx, -hr * 0.62, hr * 0.22, hr * 0.24, hr * 0.15, 0, 'rgba(255,120,140,' + (0.35 * p.blush) + ')');
    }

    drawCrest(ctx, m, g, p);
    drawBeak(ctx, m, g, p);
    drawEye(ctx, m, g, p);
    drawGlasses(ctx, m, g, p);
    drawHat(ctx, m, g, p);
  }

  function drawFeet(ctx, m, g, p) {
    var r = g.r;
    var ph = p.paddle;
    for (var i = 0; i < 2; i++) {
      var off = i * Math.PI;
      var swing = Math.sin(ph + off);
      var fx = g.bcx + g.bw * (0.02 + i * 0.20) + swing * r * 0.16;
      var fy = g.bh * 0.20 + r * 0.06;
      var fold = Math.max(0, swing) * 0.55; // beim Zurückziehen zusammenklappen
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(swing * 0.45);
      ctx.fillStyle = rgba(m.foot, 0.85 - i * 0.2);
      // Bein
      ctx.fillRect(-r * 0.035, -r * 0.22, r * 0.07, r * 0.26);
      // Schwimmhaut
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(r * (0.26 - fold * 0.18), r * 0.14);
      ctx.lineTo(r * (0.20 - fold * 0.14), r * 0.20);
      ctx.lineTo(-r * 0.02, r * 0.10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // ── Wasserlinie / Kontakt ─────────────────────────────────────
  function drawWaterline(ctx, m, g, p) {
    var r = g.r;
    var w = g.bw * 1.02;
    // weicher Schatten im Wasser
    var sg = ctx.createRadialGradient(g.bcx, r * 0.05, r * 0.05, g.bcx, r * 0.05, w * 1.15);
    sg.addColorStop(0, 'rgba(28,68,108,0.16)');
    sg.addColorStop(1, 'rgba(28,68,108,0)');
    ell(ctx, g.bcx, r * 0.05, w * 1.15, r * 0.26, 0);
    ctx.fillStyle = sg;
    ctx.fill();
    // Wasserkante nur seitlich andeuten, nicht als Teller umlaufend
    ctx.save();
    ctx.lineWidth = r * 0.05;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.42)';
    ctx.beginPath();
    ctx.ellipse(g.bcx, -r * 0.01, w * 0.80, r * 0.10, 0, Math.PI * 0.10, Math.PI * 0.90);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.ellipse(g.bcx, -r * 0.01, w * 0.80, r * 0.10, 0, Math.PI * 1.18, Math.PI * 1.82);
    ctx.stroke();
    ctx.restore();
  }

  // ── Hauptzeichnung ────────────────────────────────────────────
  // Kopfposition inkl. aller Kopf-Modifikatoren
  function headPos(g, p) {
    return {
      x: g.hx + p.headDip * g.r * 0.52 - p.headSide * g.r * 0.62 - p.sleep * g.r * 0.22,
      y: g.hy + p.headDip * g.r * 0.92 + p.headSide * g.r * 0.50 + p.sleep * g.r * 0.30
    };
  }

  function drawUnderwater(ctx, m, g, p) {
    drawFeet(ctx, m, g, p);
    ctx.beginPath();
    ctx.ellipse(g.bcx, g.bcy, g.bw * 0.97, g.bh * 0.97, 0, 0, TAU);
    ctx.fillStyle = mix(m.bodyDark, '#2b6ea8', 0.45);
    ctx.fill();
    // Kopf/Hals unter Wasser (beim Gründeln)
    var h = headPos(g, p);
    ctx.beginPath();
    ctx.ellipse(h.x, h.y, g.hr, g.hr * 0.97, 0, 0, TAU);
    ctx.fillStyle = mix(m.headDark, '#2b6ea8', 0.45);
    ctx.fill();
  }

  function drawAbove(ctx, m, g, p) {
    drawTail(ctx, m, g, p);
    drawWing(ctx, m, g, p, true);   // ferner Flügel hinter dem Körper
    drawBody(ctx, m, g, p);
    var h = headPos(g, p);
    drawNeck(ctx, m, g, p, h.x, h.y);
    drawWing(ctx, m, g, p);
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(p.headRot + p.headDip * 0.55 + p.headSide * 2.2 + p.wobble * 0.12);
    drawHead(ctx, m, g, p);
    ctx.restore();
  }

  // Körper-Transform (Blickrichtung, Neigung, Squash) im Weltraum
  function bodyTransform(ctx, p, fn) {
    ctx.save();
    ctx.scale(p.dir, 1);
    ctx.rotate(p.lean);
    ctx.scale(p.squash, 2 - p.squash);
    fn();
    ctx.restore();
  }

  function clipBelow(ctx, r) {
    ctx.beginPath();
    ctx.rect(-r * 8, 0, r * 16, r * 10);
    ctx.clip();
  }
  function clipAbove(ctx, r) {
    ctx.beginPath();
    ctx.rect(-r * 8, -r * 12, r * 16, r * 12 + 0.6);
    ctx.clip();
  }

  function draw(ctx, m, pose) {
    var p = defaultPose(pose);
    var r = p.r * (m.scale || 1);
    var g = geom(m, r);

    ctx.save();
    // Wasserlinie liegt bei y=0 im Weltraum der Ente
    ctx.translate(p.x, p.y + p.submerge * r * 1.35);
    ctx.globalAlpha *= p.alpha * (1 - (m.ghost || 0) * 0.45);

    // Bei steiler Rumpf-Rotation (schwimmt senkrecht) treten Wasserlinie und
    // Spiegelung zurück — sie schneidet dann durchs Wasser statt zu gleiten.
    var steep = Math.min(1, Math.abs(p.lean) * 0.75);

    // 1) Spiegelung — nur als weiche Silhouette, sonst wirkt sie wie ein zweites Tier
    if (p.reflection && p.submerge < 0.45 && steep < 0.95) {
      ctx.save();
      clipBelow(ctx, r);
      ctx.globalAlpha *= 0.15 * (1 - p.submerge * 2.2) * (1 - steep);
      ctx.translate(Math.sin(p.t * 1.7) * r * 0.05, 0);
      ctx.scale(1, -0.42);
      ctx.translate(0, p.bob * 0.6);
      p.silhouette = true;
      bodyTransform(ctx, p, function () { drawAbove(ctx, m, g, p); });
      p.silhouette = false;
      ctx.restore();
    }

    // 2) Unterwasser-Anteil
    ctx.save();
    clipBelow(ctx, r);
    ctx.globalAlpha *= 0.42;
    ctx.translate(0, p.bob * 0.35);
    bodyTransform(ctx, p, function () { drawUnderwater(ctx, m, g, p); });
    ctx.restore();

    // 3) Wasserlinie / Kontaktschatten
    if (p.water && p.submerge < 0.9 && steep < 0.95) {
      ctx.save();
      ctx.globalAlpha *= (1 - p.submerge) * (1 - steep);
      bodyTransform(ctx, p, function () { drawWaterline(ctx, m, g, p); });
      ctx.restore();
    }

    // 4) Glow
    if (m.glow && p.submerge < 0.6) {
      ctx.save();
      clipAbove(ctx, r);
      ctx.translate(0, p.bob);
      ctx.shadowColor = m.glow;
      ctx.shadowBlur = r * 0.9;
      ctx.globalAlpha *= 0.8 * (1 - p.submerge);
      bodyTransform(ctx, p, function () {
        ell(ctx, g.bcx, g.bcy, g.bw * 0.9, g.bh * 0.9);
        ctx.fillStyle = rgba(m.glow, 0.35);
        ctx.fill();
      });
      ctx.restore();
    }

    // 5) Über-Wasser-Anteil
    ctx.save();
    clipAbove(ctx, r);
    ctx.translate(0, p.bob);
    bodyTransform(ctx, p, function () { drawAbove(ctx, m, g, p); });
    ctx.restore();

    ctx.restore();
  }

  // Bounding-Box (für Treffer-Erkennung beim Streicheln)
  function bounds(m, r) {
    var rr = r * (m.scale || 1);
    var g = geom(m, rr);
    return {
      w: g.bw * 2.2,
      h: (Math.abs(g.hy) + g.hr * 1.6),
      cy: -(Math.abs(g.hy) + g.hr * 1.6) * 0.42
    };
  }

  // Kopfposition im Weltraum (für Blasen, Picken, Zzz …)
  function headWorld(m, pose) {
    var p = defaultPose(pose);
    var r = p.r * (m.scale || 1);
    var g = geom(m, r);
    var h = headPos(g, p);
    var c = Math.cos(p.lean), s = Math.sin(p.lean);
    var lx = h.x * c - h.y * s, ly = h.x * s + h.y * c;
    return { x: p.x + lx * p.dir, y: p.y + ly + p.bob + p.submerge * r * 1.35, r: g.hr };
  }

  // Küken-Variante eines Modells: kleiner, runder, flauschig-gelb,
  // von Mamas Farben bleibt nur ein Hauch.
  function babyOf(m) {
    var b = {};
    for (var k in m) b[k] = m[k];
    b.scale = (m.scale || 1) * 0.95;
    b.chonk = Math.min(1, (m.chonk || 0) + 0.55);
    b.headR = m.headR * 1.24;
    b.neckLen = m.neckLen * 0.5;
    b.neckW = m.neckW * 1.1;
    b.beakLen = m.beakLen * 0.78;
    b.bodyH = m.bodyH * 1.06;
    b.quackPitch = (m.quackPitch || 1) * 1.75;
    b.hat = null; b.glasses = null; b.crest = null; b.neckRing = null; b.cheek = null;
    b.body = mix('#ffe066', m.body, 0.22);
    b.bodyDark = mix('#e8c33e', m.bodyDark, 0.22);
    b.belly = mix('#fff6cc', m.belly, 0.15);
    b.head = mix('#ffe884', m.head, 0.18);
    b.headDark = mix('#e8c33e', m.headDark, 0.18);
    b.wing = mix('#ffdc5c', m.wing, 0.22);
    b.wingBar = mix('#fff6cc', m.wingBar, 0.3);
    b.tail = mix('#ffdc5c', m.tail, 0.22);
    b.beak = mix('#ffb03d', m.beak, 0.3);
    b.beakDark = mix('#e08a10', m.beakDark, 0.3);
    return b;
  }

  root.DuckRender = {
    draw: draw, bounds: bounds, geom: geom, headWorld: headWorld,
    babyOf: babyOf, star: star, mix: mix, rgba: rgba
  };
})(typeof window !== 'undefined' ? window : this);
