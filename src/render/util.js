export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeInOut = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const easeOutBack = (t) => { t = clamp(t); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
export const easeOutElastic = (t) => { t = clamp(t); if (t === 0 || t === 1) return t; return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1; };

export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function noise1(x, seed = 0) {
  const h = (n) => { const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return s - Math.floor(s); };
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(h(i), h(i + 1), u) * 2 - 1;
}

export const INK = '#1d1830';

export function outline(ctx, w = 4, color = INK) { ctx.lineWidth = w; ctx.strokeStyle = color; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
export function fillOutline(ctx, fill, w = 4) { ctx.fillStyle = fill; ctx.fill(); if (w) outline(ctx, w); }

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export function heartPath(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x - s * 1.1, y - s * 0.35, x - s * 0.55, y - s * 1.05, x, y - s * 0.5);
  ctx.bezierCurveTo(x + s * 0.55, y - s * 1.05, x + s * 1.1, y - s * 0.35, x, y + s * 0.35);
  ctx.closePath();
}

export function starPath(ctx, x, y, r, points = 5, inner = 0.45, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? r * inner : r, a = rot + (i * Math.PI) / points;
    i ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

export function cloud(ctx, x, y, s, fill = '#fff', stroke = 3) {
  ctx.beginPath();
  ctx.arc(x - s * 0.6, y, s * 0.45, Math.PI * 0.5, Math.PI * 1.5);
  ctx.arc(x - s * 0.15, y - s * 0.35, s * 0.5, Math.PI, Math.PI * 1.85);
  ctx.arc(x + s * 0.45, y - s * 0.15, s * 0.42, Math.PI * 1.25, Math.PI * 0.1);
  ctx.arc(x + s * 0.65, y + s * 0.15, s * 0.3, Math.PI * 1.6, Math.PI * 0.5);
  ctx.closePath();
  fillOutline(ctx, fill, stroke);
}

export function vGrad(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}

export function sky(ctx, W, H, stops) { ctx.fillStyle = vGrad(ctx, 0, H, stops); ctx.fillRect(-W, -H, W * 3, H * 3); }

export function glow(ctx, x, y, r, color, alpha = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save(); ctx.globalAlpha *= alpha; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
}

// كاميرا: تكبير/إزاحة/دوران حول مركز الإطار
export function camera(ctx, W, H, { zoom = 1, x = 0, y = 0, rot = 0 }) {
  ctx.translate(W / 2, H / 2); ctx.rotate(rot); ctx.scale(zoom, zoom); ctx.translate(-W / 2 + x, -H / 2 + y);
}

// تلال/موجات متموجة لملء الأرض
export function hills(ctx, W, H, baseY, amp, freq, phase, fill, stroke = 4) {
  ctx.beginPath(); ctx.moveTo(-W, H * 2);
  for (let x = -W; x <= W * 2; x += 20) ctx.lineTo(x, baseY + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.3 + phase * 1.7) * amp * 0.35);
  ctx.lineTo(W * 2, H * 2); ctx.closePath();
  fillOutline(ctx, fill, stroke);
}
