import { INK, fillOutline, outline, roundRect, clamp } from './util.js';

// العيون: إن توفرت صورة مرجعية تُقصّ منطقة العيون منها وتُرسم داخل شكل العين الكرتوني (مع رمش وجفون مرسومة).
// mode: 'pair' = القصّة تحتوي العينين معًا، 'single' = عين واحدة تُعكس للعين الأخرى.
export function drawEyes(ctx, cx, cy, r, o = {}) {
  const { eyeSource, look = { x: 0, y: 0 }, blink = 0, skin = '#f6c9a4', sparkle = 1, lashes = true } = o;
  const dx = r * 0.4, rx = r * 0.3, ry = r * 0.36;
  const centers = [[cx - dx, cy], [cx + dx, cy]];
  const ellipse = (x, y) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); };
  const src = eyeSource && eyeSource.img && eyeSource.crop;
  for (let e = 0; e < 2; e++) {
    const [x, y] = centers[e];
    ctx.save();
    ellipse(x, y); ctx.fillStyle = '#fff'; ctx.fill(); ctx.clip();
    if (src) {
      const { img, crop, mode } = eyeSource;
      let sx = crop.x, sw = crop.w;
      let dw, dh, ox, oy;
      if (mode === 'single') {
        const sc = Math.max((rx * 2.3) / crop.w, (ry * 2.3) / crop.h);
        dw = crop.w * sc; dh = crop.h * sc;
        ox = x - dw / 2 + look.x * rx * 0.25; oy = y - dh / 2 + look.y * ry * 0.2;
        if (e === 1) { ctx.translate(x * 2, 0); ctx.scale(-1, 1); ox = x - dw / 2 - look.x * rx * 0.25; }
      } else {
        // العينان معًا: نصف القصّة لكل عين
        const half = crop.w / 2;
        sx = crop.x + (e === 0 ? 0 : half); sw = half;
        const sc = Math.max((rx * 2.3) / sw, (ry * 2.3) / crop.h);
        dw = sw * sc; dh = crop.h * sc;
        ox = x - dw / 2 + look.x * rx * 0.25; oy = y - dh / 2 + look.y * ry * 0.2;
      }
      ctx.drawImage(img, sx, crop.y, sw, crop.h, ox, oy, dw, dh);
    } else {
      const ix = x + look.x * rx * 0.35, iy = y + look.y * ry * 0.3;
      ctx.beginPath(); ctx.arc(ix, iy, rx * 0.62, 0, Math.PI * 2); ctx.fillStyle = '#5a3a22'; ctx.fill();
      ctx.beginPath(); ctx.arc(ix, iy, rx * 0.32, 0, Math.PI * 2); ctx.fillStyle = '#120c08'; ctx.fill();
    }
    if (sparkle > 0) {
      ctx.globalAlpha = 0.85 * sparkle; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x + look.x * rx * 0.3 + rx * 0.22, y - ry * 0.32, rx * 0.15, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // الجفن (الرمش)
    if (blink > 0.01) {
      ctx.fillStyle = skin;
      ctx.fillRect(x - rx - 2, y - ry - 2, rx * 2 + 4, (ry * 2 + 4) * clamp(blink));
      ctx.beginPath(); ctx.moveTo(x - rx, y - ry + ry * 2 * clamp(blink)); ctx.lineTo(x + rx, y - ry + ry * 2 * clamp(blink));
      outline(ctx, Math.max(2, r * 0.05));
    }
    ctx.restore();
    ellipse(x, y); outline(ctx, Math.max(2.5, r * 0.06));
    if (lashes) {
      ctx.save();
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI / 2 + (e === 0 ? -1 : 1) * (0.5 + k * 0.28);
        const lx = x + Math.cos(a) * rx, ly = y - ry * (1 - blink * 1.6) * Math.abs(Math.sin(a));
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + Math.cos(a) * r * 0.1, ly - r * 0.1);
        outline(ctx, Math.max(2, r * 0.04));
      }
      ctx.restore();
    }
  }
}

// شخصية كرتونية كاملة. (x,y) = موضع القدمين، size = نصف قطر الرأس
export function drawCharacter(ctx, x, y, size, o = {}) {
  const {
    skin = '#f6c9a4', shirt = '#ff6b6b', pants = '#3b4a8c', hair = '#2b1d14', pose = 'stand', t = 0, beat = 0,
    mouth = 0, look = { x: 0, y: 0 }, blink = 0, eyeSource = null, facing = 1, mic = false, phone = false, armsUp = 0, scarf = null,
  } = o;
  const r = size, lw = Math.max(3, r * 0.08);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);
  const bob = pose === 'dance' ? Math.abs(Math.sin(t * Math.PI * 2)) * r * 0.25 : beat * r * 0.08;
  const sway = pose === 'dance' ? Math.sin(t * Math.PI * 2) * 0.12 : Math.sin(t * 2) * 0.03;
  const seated = pose === 'sit' || pose === 'drive';
  const legH = seated ? r * 0.2 : r * 1.25;
  const torsoH = r * 1.35, torsoW = r * 1.15;
  ctx.translate(0, -bob);
  // الساقان
  if (!seated) {
    const step = pose === 'walk' ? Math.sin(t * Math.PI * 4) * r * 0.35 : pose === 'dance' ? Math.sin(t * Math.PI * 2) * r * 0.25 : 0;
    for (const [s, k] of [[-1, 1], [1, -1]]) {
      ctx.beginPath(); ctx.moveTo(s * r * 0.28, -legH); ctx.lineTo(s * r * 0.28 + step * k, -r * 0.08);
      ctx.lineWidth = r * 0.32; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
      ctx.lineWidth = r * 0.32 - lw * 1.6; ctx.strokeStyle = pants; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(s * r * 0.28 + step * k + r * 0.08, -r * 0.05, r * 0.26, r * 0.13, 0, 0, Math.PI * 2);
      fillOutline(ctx, '#2a2a3a', lw * 0.8);
    }
  }
  ctx.rotate(sway);
  // الجذع
  const ty = -legH;
  ctx.beginPath();
  ctx.moveTo(-torsoW / 2, ty); ctx.quadraticCurveTo(-torsoW * 0.62, ty - torsoH * 0.6, -torsoW * 0.36, ty - torsoH);
  ctx.lineTo(torsoW * 0.36, ty - torsoH); ctx.quadraticCurveTo(torsoW * 0.62, ty - torsoH * 0.6, torsoW / 2, ty); ctx.closePath();
  fillOutline(ctx, shirt, lw);
  if (scarf) { roundRect(ctx, -torsoW * 0.4, ty - torsoH - r * 0.05, torsoW * 0.8, r * 0.28, r * 0.12); fillOutline(ctx, scarf, lw * 0.8); }
  // الذراعان
  const shoulderY = ty - torsoH * 0.85;
  const arm = (side, upAmt, extra = 0) => {
    // upAmt: 0 = الذراع للأسفل، 1 = مرفوعة للأعلى والخارج
    const a0 = side * (0.35 + 0.15 * Math.sin(t * 3 + side) + upAmt * 2.3) + extra;
    const ex = side * torsoW * 0.45 + Math.sin(a0) * r * 0.75, ey = shoulderY + Math.cos(a0) * r * 0.75;
    const hx = ex + Math.sin(a0 * 1.2) * r * 0.65, hy = ey + Math.cos(a0 * 1.2) * r * 0.6;
    ctx.beginPath(); ctx.moveTo(side * torsoW * 0.42, shoulderY); ctx.quadraticCurveTo(ex, ey, hx, hy);
    ctx.lineWidth = r * 0.28; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
    ctx.lineWidth = r * 0.28 - lw * 1.6; ctx.strokeStyle = shirt; ctx.stroke();
    ctx.beginPath(); ctx.arc(hx, hy, r * 0.16, 0, Math.PI * 2); fillOutline(ctx, skin, lw * 0.8);
    return [hx, hy];
  };
  const danceUp = pose === 'dance' ? (Math.sin(t * Math.PI * 2) > 0 ? 0.8 : 0.2) : 0;
  arm(-1, Math.max(armsUp, danceUp));
  // مع المايك/الهاتف تنثني اليد نحو الفم
  const hand = mic || phone ? arm(1, 0, -2.5) : arm(1, Math.max(armsUp, pose === 'dance' ? 0.8 - danceUp : 0));
  if (mic) {
    ctx.save(); ctx.translate(hand[0], hand[1]); ctx.rotate(-0.5);
    roundRect(ctx, -r * 0.07, -r * 0.05, r * 0.14, r * 0.5, r * 0.05); fillOutline(ctx, '#333', lw * 0.7);
    ctx.beginPath(); ctx.arc(0, -r * 0.12, r * 0.15, 0, Math.PI * 2); fillOutline(ctx, '#bbb', lw * 0.7);
    ctx.restore();
  }
  if (phone) {
    ctx.save(); ctx.translate(hand[0], hand[1] - r * 0.15); ctx.rotate(-0.2);
    roundRect(ctx, -r * 0.18, -r * 0.3, r * 0.36, r * 0.6, r * 0.06); fillOutline(ctx, '#222', lw * 0.7);
    ctx.fillStyle = '#7fd4ff'; ctx.fillRect(-r * 0.13, -r * 0.24, r * 0.26, r * 0.46); ctx.restore();
  }
  // الرأس
  const hy = ty - torsoH - r * 0.9;
  ctx.beginPath(); ctx.ellipse(0, hy, r * 1.0, r * 0.95, 0, 0, Math.PI * 2); fillOutline(ctx, skin, lw);
  // الشعر
  ctx.beginPath();
  ctx.moveTo(-r * 0.98, hy - r * 0.05);
  ctx.bezierCurveTo(-r * 1.05, hy - r * 1.2, r * 1.05, hy - r * 1.25, r * 0.98, hy - r * 0.05);
  ctx.quadraticCurveTo(r * 0.7, hy - r * 0.55, r * 0.25, hy - r * 0.5);
  ctx.quadraticCurveTo(r * 0.05, hy - r * 0.75, -r * 0.2, hy - r * 0.5);
  ctx.quadraticCurveTo(-r * 0.7, hy - r * 0.55, -r * 0.98, hy - r * 0.05);
  fillOutline(ctx, hair, lw);
  // الخدود
  ctx.fillStyle = 'rgba(255,110,110,0.35)';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * r * 0.62, hy + r * 0.32, r * 0.16, r * 0.1, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.save(); ctx.scale(facing, 1); // العيون لا تُعكس
  drawEyes(ctx, 0, hy + r * 0.02, r, { eyeSource, look: { x: look.x * facing, y: look.y }, blink, skin });
  ctx.restore();
  // الفم: فتحته من طاقة الغناء الفعلية
  const mo = clamp(mouth);
  ctx.beginPath();
  if (mo < 0.08) { ctx.moveTo(-r * 0.18, hy + r * 0.55); ctx.quadraticCurveTo(0, hy + r * 0.68, r * 0.18, hy + r * 0.55); outline(ctx, lw * 0.9); }
  else {
    ctx.ellipse(0, hy + r * 0.6, r * (0.15 + mo * 0.06), r * (0.05 + mo * 0.18), 0, 0, Math.PI * 2);
    fillOutline(ctx, '#7a1f2b', lw * 0.9);
    ctx.save(); ctx.clip(); ctx.fillStyle = '#ff8a8a'; ctx.beginPath(); ctx.ellipse(0, hy + r * 0.6 + r * (0.05 + mo * 0.18) * 0.7, r * 0.12, r * 0.08, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  ctx.restore();
  return { headX: x, headY: y - bob + hy, mouthX: x, mouthY: y - bob + hy + r * 0.6 };
}

// رمشة طبيعية: كل ~3.3 ث وتختلف بحسب البذرة
export function blinkAt(t, seed = 0) {
  const period = 3.3 + (seed % 5) * 0.37;
  const ph = ((t + seed * 0.71) % period) / period;
  const d = 0.13 / period;
  return ph < d ? Math.sin((ph / d) * Math.PI) : 0;
}
