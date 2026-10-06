// Canvas renderer. Reads the sim state and the fx layer, never writes to either.
import { GROUND, LH, PHYS, POWER, ZONES, FEVER } from './config.js';
import { droneY, gateCenter, gateGap, multiplier, zoneOf } from './logic.js';

const R = PHYS.birdR;
const MIN_LW = 400;
const SCENERY_W = 2400;
const DISPLAY = 'Bungee, Impact, sans-serif';
const BODY = '"Chakra Petch", "Segoe UI", sans-serif';
const POWER_STYLE = {
  shield: { col: [190, 100, 62], glyph: 'S', label: 'SHIELD' },
  magnet: { col: [48, 100, 58], glyph: 'M', label: 'MAGNET' },
  slow: { col: [280, 100, 68], glyph: 'T', label: 'SLOW-MO' },
  double: { col: [120, 90, 58], glyph: '×2', label: 'DOUBLE' },
};

const lerpH = (h1, h2, t) => (h1 + (((h2 - h1 + 540) % 360) - 180) * t + 360) % 360;
const lerpC = (c, tgt, t) => [lerpH(c[0], tgt[0], t), c[1] + (tgt[1] - c[1]) * t, c[2] + (tgt[2] - c[2]) * t];
export const hsl = (c, a = 1, dl = 0) =>
  `hsla(${c[0].toFixed(1)},${c[1].toFixed(1)}%,${Math.max(0, Math.min(100, c[2] + dl)).toFixed(1)}%,${a})`;
const zonePal = z => ({ sky0: z.sky[0], sky1: z.sky[1], a: z.a, b: z.b, gate: z.gate });

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  // LW x VH is the logical viewport: at least MIN_LW wide so the next gate is always in view,
  // at least LH tall. Extra height on tall phones becomes more floor, under the thumbs.
  let scale = 1, LW = MIN_LW, VH = LH;
  let pal = zonePal(ZONES[0]);

  function skyline(minW, maxW, minH, maxH) {
    const arr = [];
    let x = 0;
    while (x < SCENERY_W) {
      const w = minW + Math.random() * (maxW - minW);
      arr.push({ x, w, h: minH + Math.random() * (maxH - minH), win: Math.random() < 0.6 });
      x += w + 2;
    }
    return { arr, len: x };
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    scale = Math.min(canvas.height / LH, canvas.width / MIN_LW);
    LW = canvas.width / scale;
    VH = canvas.height / scale;
  }

  // Scenery is generated once, so a resize (or a phone's collapsing URL bar) never reshuffles it.
  const stars = Array.from({ length: 70 }, () => ({
    u: Math.random(), y: Math.random() * GROUND * 0.7, r: Math.random() * 1.4 + 0.3, tw: Math.random() * 6,
  }));
  const near = skyline(26, 60, 60, 170);
  const far = skyline(40, 90, 110, 260);

  const roundRect = (x, y, w, h, r) => {
    const ww = Math.max(w, 0), rr = Math.min(r, ww / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + ww, y, x + ww, y + h, rr); ctx.arcTo(x + ww, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + ww, y, rr);
    ctx.closePath();
  };

  function drawBackdrop(v) {
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, hsl(pal.sky0));
    sky.addColorStop(1, hsl(pal.sky1));
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, LW + 40, GROUND + 20);
    ctx.fillStyle = '#fff';
    for (const s of stars) {
      ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(v.clock * 1.5 + s.tw));
      ctx.fillRect((((s.u * LW - v.scroll * 0.03) % LW) + LW) % LW, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
    const span = LW + 300;
    const px = ((((LW * 0.72 - v.scroll * 0.02) % span) + span) % span) - 150;
    ctx.save();
    ctx.translate(px, 150);
    const planet = ctx.createRadialGradient(-18, -18, 4, 0, 0, 58);
    planet.addColorStop(0, hsl(pal.a, 1, 18));
    planet.addColorStop(1, hsl(pal.a, 0.25, -30));
    ctx.fillStyle = planet;
    ctx.beginPath(); ctx.arc(0, 0, 52, 0, 6.28); ctx.fill();
    ctx.strokeStyle = hsl(pal.b, 0.55); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, 92, 18, -0.35, 0, 6.28); ctx.stroke();
    ctx.restore();
    drawSkyline(far, v.scroll * 0.12, hsl(pal.sky0, 0.85, 4), GROUND - 10, false);
    drawSkyline(near, v.scroll * 0.3, hsl(pal.sky0, 1, 1), GROUND, true);
  }

  function drawSkyline(sl, scroll, col, baseY, windows) {
    const off = scroll % sl.len;
    for (let rep = 0; rep < 2; rep++) {
      for (const b of sl.arr) {
        const x = b.x - off + rep * sl.len;
        if (x > LW || x + b.w < 0) continue;
        ctx.fillStyle = col;
        ctx.fillRect(x, baseY - b.h, b.w, b.h);
        if (!windows || !b.win) continue;
        ctx.fillStyle = hsl(pal.b, 0.35);
        for (let wy = 10; wy < b.h - 8; wy += 14) {
          for (let wx = 6; wx < b.w - 6; wx += 10) {
            if (Math.floor(b.x * 7 + wx * 3 + wy * 5) % 5 === 0) ctx.fillRect(x + wx, baseY - b.h + wy, 3, 5);
          }
        }
      }
    }
  }

  function drawFloor(v) {
    ctx.fillStyle = hsl(pal.sky0, 1, -2);
    ctx.fillRect(-20, GROUND, LW + 40, VH - GROUND + 20);
    ctx.strokeStyle = hsl(pal.a, 0.9); ctx.lineWidth = 2;
    ctx.shadowColor = hsl(pal.a); ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(-20, GROUND); ctx.lineTo(LW + 20, GROUND); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = hsl(pal.a, 0.25); ctx.lineWidth = 1;
    const vp = LW / 2, depth = (VH - GROUND) / (LH - GROUND);
    for (let i = -14; i <= 22; i++) {
      const xo = i * 60 - (v.scroll % 60);
      ctx.beginPath(); ctx.moveTo(vp + (xo - vp) * 0.15, GROUND); ctx.lineTo(vp + (xo - vp) * (0.15 + 1.65 * depth), VH + 10); ctx.stroke();
    }
    for (let j = 1; j < 6; j++) {
      const yy = GROUND + Math.pow(j / 6, 1.6) * (VH - GROUND + 10);
      ctx.beginPath(); ctx.moveTo(-20, yy); ctx.lineTo(LW + 20, yy); ctx.stroke();
    }
  }

  function drawGate(gate, x, t) {
    const half = gateGap(gate, t) / 2, cy = gateCenter(gate, t), top = cy - half, bot = cy + half;
    const col = gate.type === 'move' ? pal.b : gate.type === 'pulse' ? pal.a : pal.gate;
    const body = ctx.createLinearGradient(x, 0, x + gate.w, 0);
    body.addColorStop(0, hsl(pal.sky0, 0.95, 4));
    body.addColorStop(0.5, hsl(pal.sky0, 0.95, 12));
    body.addColorStop(1, hsl(pal.sky0, 0.95, 3));
    ctx.fillStyle = body;
    ctx.fillRect(x, -10, gate.w, top + 10);
    ctx.fillRect(x, bot, gate.w, GROUND - bot);
    ctx.save();
    ctx.shadowColor = hsl(col); ctx.shadowBlur = 18; ctx.strokeStyle = hsl(col); ctx.lineWidth = 2.5;
    ctx.strokeRect(x + 1, -10, gate.w - 2, top + 10);
    ctx.strokeRect(x + 1, bot, gate.w - 2, GROUND - bot);
    ctx.fillStyle = hsl(col);
    ctx.fillRect(x - 6, top - 10, gate.w + 12, 10);
    ctx.fillRect(x - 6, bot, gate.w + 12, 10);
    ctx.restore();
    ctx.strokeStyle = hsl(col, 0.18); ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = top - 30; y > 0; y -= 26) { ctx.moveTo(x + 6, y); ctx.lineTo(x + gate.w - 6, y); }
    for (let y = bot + 30; y < GROUND; y += 26) { ctx.moveTo(x + 6, y); ctx.lineTo(x + gate.w - 6, y); }
    ctx.stroke();
    if (gate.type !== 'static') {
      const mark = gate.type === 'move' ? '⇅' : '◇';
      ctx.fillStyle = hsl(col, 0.9); ctx.font = `10px ${DISPLAY}`; ctx.textAlign = 'center';
      ctx.fillText(mark, x + gate.w / 2, top - 18);
      ctx.fillText(mark, x + gate.w / 2, bot + 26);
    }
    // near-miss bands: skim these for a PERFECT
    ctx.fillStyle = hsl(pal.a, 0.09);
    ctx.fillRect(x, top, gate.w, 14);
    ctx.fillRect(x, bot - 14, gate.w, 14);
  }

  function drawOrb(o, x) {
    const bob = Math.sin(o.t * 5) * 3;
    ctx.save();
    ctx.translate(x, o.y + bob);
    if (o.k === 'orb') {
      ctx.rotate(o.t * 2);
      ctx.shadowColor = 'hsl(48,100%,60%)'; ctx.shadowBlur = 14; ctx.fillStyle = 'hsl(48,100%,66%)';
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 0); ctx.lineTo(0, 8); ctx.lineTo(-6, 0); ctx.closePath(); ctx.fill();
    } else {
      const st = POWER_STYLE[o.k];
      ctx.shadowColor = hsl(st.col); ctx.shadowBlur = 20; ctx.strokeStyle = hsl(st.col); ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28 + o.t; ctx.lineTo(Math.cos(a) * 16, Math.sin(a) * 16); }
      ctx.closePath(); ctx.stroke();
      ctx.fillStyle = hsl(st.col, 0.25); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#fff';
      ctx.font = `${st.glyph.length > 1 ? 10 : 13}px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(st.glyph, 0, 1);
    }
    ctx.restore();
  }

  function drawDrone(dr, x, t) {
    const y = droneY(dr, t), pulse = 0.6 + 0.4 * Math.sin(t * 9 + dr.ph);
    ctx.save();
    ctx.strokeStyle = 'hsla(0,100%,66%,.16)'; ctx.lineWidth = 1; ctx.setLineDash([3, 6]);
    ctx.beginPath(); ctx.moveTo(x, dr.base - dr.amp); ctx.lineTo(x, dr.base + dr.amp); ctx.stroke();
    ctx.setLineDash([]);
    ctx.translate(x, y);
    ctx.shadowColor = 'hsl(0,100%,60%)'; ctx.shadowBlur = 16 * pulse;
    ctx.fillStyle = 'hsl(350,60%,12%)'; ctx.strokeStyle = 'hsl(0,100%,66%)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 6.28 + t * 2.4, rad = i % 2 ? 9 : 16;
      ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = `hsla(0,100%,70%,${pulse})`;
    ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, 6.28); ctx.fill();
    ctx.restore();
  }

  // Skins override the zone palette; PRISM cycles through the spectrum.
  function birdColors(v) {
    const g = v.g, skin = v.skin;
    if (skin.trail === 'rainbow') {
      const h = (v.clock * 120) % 360;
      return { body: [h, 100, 62], wing: [(h + 150) % 360, 100, 68], trail: null };
    }
    const body = skin.body || pal.a, wing = skin.wing || pal.b;
    return { body, wing, trail: g.dashT > 0 ? wing : body };
  }

  function drawTrail(v, colors) {
    const tr = v.fx.trail, g = v.g;
    if (tr.length < 3 || g.phase !== 'play') return;
    const wide = g.dashT > 0 ? 14 : g.feverT > 0 ? 11 : 8;
    ctx.lineCap = 'round';
    for (let i = 1; i < tr.length; i++) {
      const a = i / tr.length;
      const col = colors.trail || [(v.clock * 120 + i * 14) % 360, 100, 64];
      const hot = g.feverT > 0 && colors.trail ? [(v.clock * 300 + i * 18) % 360, 100, 66] : col;
      ctx.strokeStyle = hsl(hot, a * 0.7); ctx.lineWidth = a * wide;
      ctx.beginPath();
      ctx.moveTo(tr[i - 1].wx - g.dist + v.birdX, tr[i - 1].y);
      ctx.lineTo(tr[i].wx - g.dist + v.birdX, tr[i].y);
      ctx.stroke();
    }
  }

  function drawBird(v, colors) {
    const g = v.g, b = g.bird;
    if (g.phase !== 'play' && g.deadT > 0.05) return;
    if (g.invuln > 0 && g.dashT <= 0 && Math.floor(v.clock * 20) % 2 === 0) return;
    ctx.save();
    ctx.translate(v.birdX, b.y);
    ctx.rotate(b.rot);
    if (g.shield) {
      ctx.strokeStyle = `hsla(190,100%,70%,${0.55 + 0.25 * Math.sin(v.clock * 8)})`; ctx.lineWidth = 2.5;
      ctx.shadowColor = 'hsl(190,100%,60%)'; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(0, 0, R + 9, 0, 6.28); ctx.stroke();
    }
    ctx.shadowColor = hsl(g.dashT > 0 ? colors.wing : colors.body); ctx.shadowBlur = g.feverT > 0 ? 34 : 22;
    const wy = -4 - b.wing * 14;
    ctx.fillStyle = hsl(colors.wing, 0.95);
    ctx.beginPath(); ctx.moveTo(-4, -2); ctx.quadraticCurveTo(-18, wy - 4, -26, wy); ctx.quadraticCurveTo(-14, 2, -4, 4); ctx.fill();
    const body = ctx.createLinearGradient(-14, -12, 14, 12);
    body.addColorStop(0, hsl(colors.body, 1, 20));
    body.addColorStop(1, hsl(colors.body, 1, -12));
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.quadraticCurveTo(6, -13, -10, -10); ctx.quadraticCurveTo(-18, 0, -10, 10);
    ctx.quadraticCurveTo(6, 13, 16, 0); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(6, -3, 5, 3.2, 0.2, 0, 6.28); ctx.fill();
    ctx.fillStyle = hsl(pal.sky0, 1, 2); ctx.beginPath(); ctx.arc(7.5, -3, 1.8, 0, 6.28); ctx.fill();
    ctx.fillStyle = hsl(colors.wing);
    ctx.beginPath(); ctx.moveTo(-2, 0); ctx.quadraticCurveTo(-12, wy + 6, -20, wy + 8); ctx.quadraticCurveTo(-8, 6, -2, 5); ctx.fill();
    ctx.restore();
  }

  function drawFxLayer(v) {
    for (const p of v.fx.parts) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = hsl(p.col);
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const p of v.fx.pops) {
      const s = p.big ? 1 + Math.max(0, 0.25 - p.t) * 2 : 1;
      ctx.save();
      ctx.globalAlpha = 1 - Math.max(0, (p.t - 0.6) / 0.5);
      ctx.translate(Math.max(70, Math.min(LW - 70, p.x)), p.y);
      ctx.scale(s, s);
      ctx.font = `${p.big ? 18 : 14}px ${DISPLAY}`; ctx.textAlign = 'center';
      ctx.fillStyle = hsl(p.col); ctx.shadowColor = hsl(p.col); ctx.shadowBlur = 10;
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
  }

  function drawScreenFx(v) {
    const g = v.g;
    const tint = g.dashT > 0 ? hsl(pal.b, 0.35) : g.slowT > 0 ? 'hsla(280,100%,60%,.3)'
      : g.feverT > 0 ? `hsla(${(v.clock * 200) % 360},100%,60%,.22)` : null;
    if (tint) {
      const vg = ctx.createRadialGradient(LW / 2, VH / 2, VH * 0.3, LW / 2, VH / 2, VH * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, tint);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, LW, VH);
    }
    if (g.dashT > 0 && !v.reducedMotion) {
      ctx.strokeStyle = hsl(pal.b, 0.35); ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        const y = (i * 71 + v.clock * 900) % GROUND, x = (i * 137 + v.clock * 1500) % (LW + 120) - 60;
        ctx.moveTo(LW - x, y); ctx.lineTo(LW - x + 70, y);
      }
      ctx.stroke();
    }
    if (v.fx.flash > 0 && !v.reducedMotion) {
      ctx.fillStyle = `rgba(255,255,255,${v.fx.flash * 0.35})`;
      ctx.fillRect(0, 0, LW, VH);
    }
  }

  function drawChips(g) {
    let x = 16;
    const chip = (label, frac, col) => {
      ctx.fillStyle = hsl(col, 0.25); roundRect(x, 16, 74, 22, 11); ctx.fill();
      ctx.globalAlpha = 0.4; ctx.fillStyle = hsl(col); roundRect(x, 16, 74 * frac, 22, 11); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.font = `700 11px ${BODY}`; ctx.textAlign = 'center';
      ctx.fillText(label, x + 37, 31);
      x += 80;
    };
    if (g.shield) chip('SHIELD', 1, POWER_STYLE.shield.col);
    if (g.magnetT > 0) chip('MAGNET', g.magnetT / POWER.magnet, POWER_STYLE.magnet.col);
    if (g.slowT > 0) chip('SLOW-MO', g.slowT / POWER.slow, POWER_STYLE.slow.col);
    if (g.doubleT > 0) chip('DOUBLE', g.doubleT / POWER.double, POWER_STYLE.double.col);
  }

  function drawMeter(g) {
    const mx = 16, my = VH - 34, mw = Math.min(150, LW * 0.4), full = g.dashMeter >= 1;
    ctx.fillStyle = 'rgba(255,255,255,.12)'; roundRect(mx, my, mw, 10, 5); ctx.fill();
    ctx.fillStyle = hsl(pal.b, full ? 1 : 0.7);
    if (full) { ctx.shadowColor = hsl(pal.b); ctx.shadowBlur = 14; }
    roundRect(mx, my, mw * g.dashMeter, 10, 5); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left'; ctx.font = `600 11px ${BODY}`; ctx.fillStyle = 'rgba(243,238,252,.8)';
    ctx.fillText(full ? 'DASH READY' : `DASH ${Math.floor(g.dashMeter * 100)}%`, mx, my - 6);
  }

  function drawHUD(v) {
    const g = v.g, mult = multiplier({ fever: g.feverT > 0, double: g.doubleT > 0 });
    ctx.textAlign = 'center'; ctx.font = `54px ${DISPLAY}`; ctx.fillStyle = '#fff';
    ctx.shadowColor = hsl(pal.a); ctx.shadowBlur = 16;
    ctx.fillText(String(g.score), LW / 2, 104);
    ctx.shadowBlur = 0;
    let y = 130;
    if (g.feverT > 0) {
      ctx.font = `17px ${DISPLAY}`; ctx.fillStyle = `hsl(${(v.clock * 300) % 360},100%,68%)`;
      ctx.fillText(`FEVER ×${mult}`, LW / 2, y);
      ctx.fillStyle = 'rgba(255,255,255,.18)'; roundRect(LW / 2 - 50, y + 7, 100, 4, 2); ctx.fill();
      ctx.fillStyle = '#fff'; roundRect(LW / 2 - 50, y + 7, 100 * (g.feverT / FEVER.time), 4, 2); ctx.fill();
      y += 30;
    } else if (mult > 1) {
      ctx.font = `15px ${DISPLAY}`; ctx.fillStyle = hsl(POWER_STYLE.double.col, 1, 10);
      ctx.fillText(`SCORE ×${mult}`, LW / 2, y);
      y += 22;
    }
    if (g.combo > 1) {
      ctx.font = `16px ${DISPLAY}`; ctx.fillStyle = hsl(pal.a);
      ctx.fillText(`COMBO x${g.combo}`, LW / 2, y);
    }
    drawChips(g);
    drawMeter(g);
    if (v.mode === 'daily') {
      ctx.textAlign = 'right'; ctx.font = `600 11px ${BODY}`; ctx.fillStyle = 'rgba(243,238,252,.7)';
      ctx.fillText(`DAILY ${v.dateLabel}`, LW - 16, VH - 12);
    }
    const bn = v.fx.banner;
    if (!bn) return;
    ctx.globalAlpha = Math.max(0, Math.min(1, bn.dur - bn.t) * Math.min(1, bn.t * 3));
    ctx.textAlign = 'center'; ctx.font = `600 12px ${BODY}`; ctx.fillStyle = 'rgba(243,238,252,.75)';
    ctx.fillText(bn.kicker, LW / 2, LH * 0.36);
    const col = bn.col || pal.b;
    ctx.font = `28px ${DISPLAY}`; ctx.fillStyle = hsl(col); ctx.shadowColor = hsl(col); ctx.shadowBlur = 18;
    ctx.fillText(bn.title, LW / 2, LH * 0.36 + 34);
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }

  /** @param {object} v view: { g, fx, skin, birdX, scroll, clock, hud, mode, dateLabel, reducedMotion } */
  function draw(v, rdt) {
    const target = zonePal(ZONES[zoneOf(v.g.passed)]), k = Math.min(1, rdt * 1.6);
    pal = Object.fromEntries(Object.keys(pal).map(key => [key, lerpC(pal[key], target[key], k)]));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const sk = v.reducedMotion ? 0 : v.fx.shake;
    ctx.setTransform(scale, 0, 0, scale, (Math.random() - 0.5) * sk * scale, (Math.random() - 0.5) * sk * scale);
    const g = v.g, sx = wx => wx - g.dist + v.birdX;
    drawBackdrop(v);
    for (const gate of g.gates) { const x = sx(gate.wx); if (x < LW + 20 && x + gate.w > -20) drawGate(gate, x, g.t); }
    for (const o of g.orbs) { const x = sx(o.wx); if (!o.got && x < LW + 30 && x > -30) drawOrb(o, x); }
    for (const dr of g.drones) { const x = sx(dr.wx); if (!dr.dead && x < LW + 30 && x > -30) drawDrone(dr, x, g.t); }
    drawFloor(v);
    const colors = birdColors(v);
    drawTrail(v, colors);
    drawFxLayer(v);
    drawBird(v, colors);
    drawScreenFx(v);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (v.hud) drawHUD(v);
  }

  return { resize, draw, palette: () => pal, width: () => LW };
}
