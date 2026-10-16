import { clamp, lerp, rng, noise1, easeOutBack, easeInOut, smooth, roundRect, heartPath, starPath, glow } from '../util.js';
import { drawCharacter, drawEyes, blinkAt } from '../character.js';
import { drawLyricWords } from '../text.js';

// «غرفة واحدة تتحوّل»: مكان ثابت بتفاصيل وإضاءة ليلية، ومعنى كل سطر يغيّر عناصر الغرفة
// (لون الضوء، شاشة التلفاز، منظر النافذة، الساعة، صاحب الصورة الذي يخرج من إطاره…) بدل القطع إلى مشهد جديد.

// كل معنى ← مزاج: لون الإضاءة، أيقونة التلفاز، منظر النافذة، وفعل خاص
export const MOODS = {
  neutral: { light: '#ffae42', tv: 'static', win: 'night' },
  eyes: { light: '#c9a7ff', tv: 'eye', win: 'night', act: 'eyes' },
  talk: { light: '#ffd166', tv: 'bubble', win: 'night', act: 'visitor' },
  phone: { light: '#7fd4ff', tv: 'msg', win: 'night', act: 'phone' },
  night: { light: '#8fa8ff', tv: 'moon', win: 'stars' },
  sea: { light: '#4fc3f7', tv: 'wave', win: 'sea' },
  rain: { light: '#6d8cff', tv: 'drop', win: 'rain', act: 'tear' },
  road: { light: '#ff8a3d', tv: 'road', win: 'cars' },
  heart: { light: '#ff5d8f', tv: 'heart', win: 'night', act: 'heart' },
  city: { light: '#b388ff', tv: 'people', win: 'city' },
  stage: { light: '#ff4fd8', tv: 'eq', win: 'city', act: 'spot' },
  clock: { light: '#fff1b8', tv: 'hourglass', win: 'night', act: 'spin' },
  desert: { light: '#f4a261', tv: 'sun', win: 'dunes' },
  fire: { light: '#ff5a1f', tv: 'flame', win: 'night', act: 'flicker' },
  sunrise: { light: '#ffd23f', tv: 'sun', win: 'dawn', act: 'warm' },
};

const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
function mix(a, b, f) { const x = hex(a), y = hex(b); return `rgb(${x.map((v, i) => Math.round(lerp(v, y[i], f))).join(',')})`; }
const rgba = (c, a) => { const m = c.startsWith('#') ? hex(c) : c.match(/\d+/g); return `rgba(${m[0]},${m[1]},${m[2]},${a})`; };

const LINE = '#0b0814';
function stroke(ctx, w) { ctx.lineWidth = w; ctx.strokeStyle = LINE; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }

function layout(W, H) {
  const portrait = H >= W;
  // k = وحدة الحجم؛ في العمودي تملأ العناصر العرض، وفي الأفقي تنتشر على الجدار
  const k = portrait ? (W / 720) * 1.18 : (H / 720) * 0.92;
  const floorY = portrait ? H * 0.74 : H * 0.8;
  const cx = W / 2;
  const tvW = 150 * k, tvH = 118 * k;
  const left = portrait ? 0 : W * 0.12, right = portrait ? W : W * 0.88;
  return {
    k, floorY, portrait,
    // الساعة تحت سطر الكلمات حتى لا يتداخل النص معها
    clock: { x: portrait ? W * 0.17 : cx - 330 * k, y: portrait ? H * 0.255 : floorY - 560 * k, r: 46 * k },
    frame: { x: left + (portrait ? 30 : 40) * k, y: floorY - (portrait ? 470 : 520) * k, w: 150 * k, h: 190 * k },
    win: { x: portrait ? cx + 10 * k : cx + 90 * k, y: floorY - 560 * k, w: 205 * k, h: 280 * k },
    lamp: { x: left + 52 * k, y: floorY },
    tv: { x: right - tvW - (portrait ? 14 : 30) * k, y: floorY - tvH - 92 * k, w: tvW, h: tvH },
    chair: { x: portrait ? cx - 20 * k : cx - 40 * k, y: floorY + 10 * k },
    text: { x: W - 26 * (W / 720), y: portrait ? H * 0.11 : H * 0.1 },
  };
}

// موضع رأس الشخصية (لتكبير الكاميرا على العينين)
const head0Y = (L) => L.chair.y - 92 * L.k - (0.2 + 1.35 + 0.9) * 58 * L.k;

// ——— عناصر الغرفة ———
function wall(ctx, W, H, L, light) {
  const g = ctx.createLinearGradient(0, 0, 0, L.floorY);
  g.addColorStop(0, '#120c18'); g.addColorStop(1, '#2a1c2b');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, L.floorY);
  // ورق جدران بنقش خفيف
  ctx.save(); ctx.globalAlpha = 0.06; ctx.strokeStyle = '#d9b8ff'; ctx.lineWidth = 1.5 * L.k;
  for (let x = -40; x < W + 40; x += 46 * L.k) for (let y = 30 * L.k; y < L.floorY; y += 70 * L.k) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 12 * L.k, y + 18 * L.k, x, y + 36 * L.k); ctx.quadraticCurveTo(x - 12 * L.k, y + 18 * L.k, x, y); ctx.stroke();
  }
  ctx.restore();
  // إزار خشبي
  ctx.fillStyle = '#1a1018'; ctx.fillRect(0, L.floorY - 26 * L.k, W, 26 * L.k);
  ctx.fillStyle = rgba(light, 0.12); ctx.fillRect(0, L.floorY - 26 * L.k, W, 3 * L.k);
  // الأرضية والسجادة
  const f = ctx.createLinearGradient(0, L.floorY, 0, H);
  f.addColorStop(0, '#2b1a26'); f.addColorStop(1, '#120a12');
  ctx.fillStyle = f; ctx.fillRect(0, L.floorY, W, H - L.floorY);
  const rx = W / 2, ry = L.floorY + (H - L.floorY) * 0.45, rw = Math.min(W * 0.92, 620 * L.k * (L.portrait ? 1 : 1.6)), rh = (H - L.floorY) * 0.5;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(rx - rw * 0.42, ry - rh / 2); ctx.lineTo(rx + rw * 0.42, ry - rh / 2); ctx.lineTo(rx + rw / 2, ry + rh / 2); ctx.lineTo(rx - rw / 2, ry + rh / 2); ctx.closePath();
  ctx.fillStyle = '#3a1f33'; ctx.fill(); ctx.clip();
  ctx.strokeStyle = 'rgba(255,190,230,0.12)'; ctx.lineWidth = 3 * L.k;
  for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.ellipse(rx, ry, rw * 0.1 * i, rh * 0.1 * i, 0, 0, Math.PI * 2); ctx.stroke(); }
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + Math.cos(a) * rw * 0.45, ry + Math.sin(a) * rh * 0.45); ctx.stroke(); }
  ctx.restore();
  // شراشيب السجادة
  ctx.strokeStyle = 'rgba(230,200,220,0.25)'; ctx.lineWidth = 1.5 * L.k;
  for (let x = rx - rw / 2; x < rx + rw / 2; x += 7 * L.k) { ctx.beginPath(); ctx.moveTo(x, ry + rh / 2); ctx.lineTo(x, ry + rh / 2 + 9 * L.k); ctx.stroke(); }
}

function drawClock(ctx, s, L, mood, f) {
  const { x, y, r } = L.clock;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 18 * L.k; ctx.shadowOffsetY = 8 * L.k;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = '#d8d2dc'; ctx.fill(); ctx.restore();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); stroke(ctx, 6 * L.k);
  ctx.beginPath(); ctx.arc(x, y, r * 0.86, 0, Math.PI * 2); ctx.fillStyle = '#eeeaf0'; ctx.fill();
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.72, y + Math.sin(a) * r * 0.72); ctx.lineTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8); stroke(ctx, (i % 3 ? 2 : 4) * L.k); }
  // العقارب: الدقيقة تقفز مع كل ضربة؛ «الوقت» يجعلها تدور بسرعة
  const spin = mood.act === 'spin' ? f * s.local * 6 : 0;
  const hand = (a, len, w, col) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(a) * len, y - Math.cos(a) * len); ctx.lineWidth = w; ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.stroke(); };
  const tick = s.beat.index + easeOutBack(clamp(s.beat.phase * 6));
  hand(2.1 + s.t * 0.01 + spin * 0.1, r * 0.45, 5 * L.k, '#241b2c');
  hand((tick / 60) * Math.PI * 2 + spin, r * 0.68, 3.5 * L.k, '#241b2c');
  ctx.beginPath(); ctx.arc(x, y, 4 * L.k, 0, Math.PI * 2); ctx.fillStyle = '#241b2c'; ctx.fill();
  // انعكاس زجاج
  ctx.save(); ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(x, y, r * 0.86, Math.PI * 1.1, Math.PI * 1.6); ctx.lineWidth = 6 * L.k; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.restore();
}

function windowView(ctx, s, L, kind, alpha) {
  const { x, y, w, h } = L.win, k = L.k;
  ctx.save(); ctx.globalAlpha *= alpha;
  const skies = { night: ['#0b1a4a', '#2a3f9a'], stars: ['#050a26', '#1d2770'], sea: ['#0d2a5c', '#3d6fb5'], rain: ['#1a2238', '#3a4a68'], cars: ['#0b1a4a', '#2a3f9a'], city: ['#170a3a', '#4b2a8a'], dunes: ['#3a1d4a', '#d07a4a'], dawn: ['#3b3a8a', '#ffb36b'] };
  const g = ctx.createLinearGradient(0, y, 0, y + h); const c = skies[kind] || skies.night; g.addColorStop(0, c[0]); g.addColorStop(1, c[1]);
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  const r = rng(kind.length * 17);
  if (kind === 'stars' || kind === 'night' || kind === 'cars' || kind === 'city') for (let i = 0; i < (kind === 'stars' ? 60 : 22); i++) { ctx.globalAlpha = alpha * (0.4 + 0.6 * Math.abs(Math.sin(s.t * 1.3 + i))); ctx.fillStyle = '#fff'; ctx.fillRect(x + r() * w, y + r() * h * 0.6, 1.6 * k, 1.6 * k); }
  ctx.globalAlpha = alpha;
  // القمر أو الشمس
  if (kind === 'dawn' || kind === 'dunes') { const sy = y + h * lerp(0.85, 0.45, clamp(s.p * 1.3)); glow(ctx, x + w * 0.5, sy, 90 * k, 'rgba(255,220,140,0.8)'); ctx.beginPath(); ctx.arc(x + w * 0.5, sy, 26 * k, 0, Math.PI * 2); ctx.fillStyle = '#ffe08a'; ctx.fill(); }
  else { glow(ctx, x + w * 0.75, y + h * 0.28, 60 * k, 'rgba(230,240,255,0.7)'); ctx.beginPath(); ctx.arc(x + w * 0.75, y + h * 0.28, 15 * k, 0, Math.PI * 2); ctx.fillStyle = '#f4f6ff'; ctx.fill(); }
  if (kind === 'sea') {
    for (let j = 0; j < 4; j++) { ctx.beginPath(); ctx.moveTo(x, y + h); for (let xx = 0; xx <= w; xx += 6) ctx.lineTo(x + xx, y + h * (0.6 + j * 0.1) + Math.sin(xx * 0.05 + s.t * (1.2 + j * 0.3)) * 5 * k); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fillStyle = ['#1f4f9a', '#1a4488', '#153a75', '#102e60'][j]; ctx.fill(); }
  } else if (kind === 'dunes') {
    for (let j = 0; j < 2; j++) { ctx.beginPath(); ctx.moveTo(x, y + h); for (let xx = 0; xx <= w; xx += 6) ctx.lineTo(x + xx, y + h * (0.7 + j * 0.12) + Math.sin(xx * 0.03 + j * 2) * 12 * k); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fillStyle = j ? '#a8552f' : '#c86b3c'; ctx.fill(); }
  } else {
    // أفق مدينة بنوافذ مضاءة
    for (let bx = x - 5 * k; bx < x + w;) {
      const bw = (18 + r() * 26) * k, bh = (40 + r() * 110) * k;
      ctx.fillStyle = '#0a0f2e'; ctx.fillRect(bx, y + h - bh, bw, bh);
      for (let wy = y + h - bh + 6 * k; wy < y + h - 4 * k; wy += 11 * k) for (let wx = bx + 4 * k; wx < bx + bw - 5 * k; wx += 8 * k) {
        const on = kind === 'city' ? (Math.floor(wx + wy) + s.beat.index) % 4 === 0 : r() > 0.78;
        if (on) { ctx.fillStyle = kind === 'city' ? '#ffd86b' : 'rgba(255,214,120,0.75)'; ctx.fillRect(wx, wy, 3 * k, 4 * k); }
      }
      bx += bw + 2 * k;
    }
    if (kind === 'cars') for (let i = 0; i < 6; i++) { const cx = x + (((s.t * 60 + i * 50) * k) % (w + 40 * k)) - 20 * k; ctx.fillStyle = i % 2 ? '#ff4040' : '#fff3c0'; ctx.beginPath(); ctx.arc(cx, y + h - 6 * k, 2.4 * k, 0, Math.PI * 2); ctx.fill(); }
  }
  if (kind === 'rain') { ctx.strokeStyle = 'rgba(200,220,255,0.6)'; ctx.lineWidth = 1.2 * k; for (let i = 0; i < 50; i++) { const rx = x + r() * w, ry = y + ((s.t * 300 * k + r() * h) % h); ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 3 * k, ry + 12 * k); ctx.stroke(); } }
  ctx.restore();
}

function drawWindow(ctx, s, L, prev, cur, f, light) {
  const { x, y, w, h } = L.win, k = L.k;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  windowView(ctx, s, L, prev, 1);
  if (cur !== prev) windowView(ctx, s, L, cur, f);
  ctx.restore();
  // الإطار والقضبان
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.lineWidth = 10 * k; ctx.strokeStyle = '#140d18'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.moveTo(x, y + h * 0.45); ctx.lineTo(x + w, y + h * 0.45); ctx.lineWidth = 6 * k; ctx.stroke();
  ctx.save(); ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.rect(x - 5 * k, y - 5 * k, w + 10 * k, h + 10 * k); ctx.lineWidth = 2 * k; ctx.strokeStyle = rgba(light, 0.8); ctx.stroke(); ctx.restore();
  // الستارة: تتمايل قليلًا
  const cw = w * 0.32, sway = Math.sin(s.t * 0.8) * 4 * k;
  for (const side of [1]) {
    ctx.beginPath(); ctx.moveTo(x + w - cw * 0.2, y - 22 * k);
    ctx.lineTo(x + w + cw * 0.9, y - 22 * k);
    ctx.quadraticCurveTo(x + w + cw * 0.95 + sway, y + h * 0.6, x + w + cw * 0.8, y + h + 30 * k);
    ctx.lineTo(x + w + cw * 0.1, y + h + 30 * k);
    ctx.quadraticCurveTo(x + w - cw * 0.3 + sway, y + h * 0.5, x + w - cw * 0.2, y - 22 * k); ctx.closePath();
    const g = ctx.createLinearGradient(x + w - cw * 0.3, 0, x + w + cw, 0); g.addColorStop(0, '#3d1f4d'); g.addColorStop(0.5, '#5a2d6b'); g.addColorStop(1, '#2c1538'); ctx.fillStyle = g; ctx.fill(); stroke(ctx, 3 * k);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2 * k; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + w + cw * (i * 0.25 - 0.1), y - 18 * k); ctx.quadraticCurveTo(x + w + cw * (i * 0.25) + sway, y + h * 0.6, x + w + cw * (i * 0.22), y + h + 26 * k); ctx.stroke(); }
    void side;
  }
  ctx.fillStyle = '#140d18'; ctx.fillRect(x - 20 * k, y - 30 * k, w + cw + 30 * k, 8 * k);
}

function drawFrame(ctx, s, L, out, eyes) {
  const { x, y, w, h } = L.frame, k = L.k;
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 16 * k; ctx.shadowOffsetY = 8 * k;
  ctx.fillStyle = '#6b4a24'; ctx.fillRect(x - 10 * k, y - 10 * k, w + 20 * k, h + 20 * k); ctx.restore();
  ctx.strokeStyle = '#a07a3c'; ctx.lineWidth = 3 * k; ctx.strokeRect(x - 6 * k, y - 6 * k, w + 12 * k, h + 12 * k);
  ctx.fillStyle = '#5a5560'; ctx.fillRect(x, y, w, h);
  // صاحب الصورة: يتلاشى من الإطار حين «يخرج» منه
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.globalAlpha = 1 - out;
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#77727d'); g.addColorStop(1, '#3d3a44'); ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.filter = 'grayscale(1) contrast(1.1)';
  drawCharacter(ctx, x + w / 2, y + h * 0.42 + 3.55 * 40 * k, 40 * k, { t: s.t, shirt: '#4b5a3a', hair: '#1a1a1a', look: { x: 0, y: 0 }, blink: blinkAt(s.t, 21), mouth: 0, armsUp: 0 });
  ctx.filter = 'none';
  ctx.restore();
  // لمعة الزجاج
  ctx.save(); ctx.globalAlpha = 0.12; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w * 0.5, y); ctx.lineTo(x, y + h * 0.6); ctx.fill(); ctx.restore();
  void eyes;
}

function drawLamp(ctx, s, L, light, flicker) {
  const { x, y } = L.lamp, k = L.k;
  const top = y - 330 * k;
  ctx.beginPath(); ctx.moveTo(x, y - 6 * k); ctx.lineTo(x, top + 50 * k); ctx.lineWidth = 6 * k; ctx.strokeStyle = '#120a14'; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(x, y - 4 * k, 34 * k, 8 * k, 0, 0, Math.PI * 2); ctx.fillStyle = '#120a14'; ctx.fill();
  // مخروط الضوء للأسفل
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const cone = ctx.createLinearGradient(0, top + 60 * k, 0, y); cone.addColorStop(0, rgba(light, 0.55 * flicker)); cone.addColorStop(1, rgba(light, 0));
  ctx.fillStyle = cone; ctx.beginPath(); ctx.moveTo(x - 45 * k, top + 60 * k); ctx.lineTo(x + 45 * k, top + 60 * k); ctx.lineTo(x + 140 * k, y + 20 * k); ctx.lineTo(x - 140 * k, y + 20 * k); ctx.fill();
  glow(ctx, x, top + 40 * k, 220 * k, rgba(light, 0.5 * flicker));
  ctx.restore();
  // غطاء المصباح
  ctx.beginPath(); ctx.moveTo(x - 28 * k, top); ctx.lineTo(x + 28 * k, top); ctx.lineTo(x + 52 * k, top + 60 * k);
  for (let i = 0; i <= 8; i++) { const xx = x + 52 * k - (i / 8) * 104 * k; ctx.lineTo(xx, top + 60 * k + (i % 2 ? 7 : 0) * k); }
  ctx.closePath();
  const sh = ctx.createLinearGradient(0, top, 0, top + 66 * k); sh.addColorStop(0, '#4a1d5e'); sh.addColorStop(1, mix('#6a2a7a', light.startsWith('#') ? light : '#ffae42', 0.35)); ctx.fillStyle = sh; ctx.fill(); stroke(ctx, 2.5 * k);
}

const TV_ICONS = {
  static: (ctx, s, x, y, w, h, k, c) => { const r = rng(Math.floor(s.t * 20)); for (let i = 0; i < 260; i++) { ctx.fillStyle = `rgba(255,255,255,${r() * 0.5})`; ctx.fillRect(x + r() * w, y + r() * h, 2 * k, 2 * k); } void c; },
  eye: (ctx, s, x, y, w, h, k, c) => { ctx.beginPath(); ctx.moveTo(x + w * 0.15, y + h / 2); ctx.quadraticCurveTo(x + w / 2, y + h * 0.05, x + w * 0.85, y + h / 2); ctx.quadraticCurveTo(x + w / 2, y + h * 0.95, x + w * 0.15, y + h / 2); ctx.lineWidth = 3 * k; ctx.strokeStyle = c; ctx.stroke(); ctx.beginPath(); ctx.arc(x + w / 2 + Math.sin(s.t * 2) * 6 * k, y + h / 2, h * 0.17, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); },
  bubble: (ctx, s, x, y, w, h, k, c) => { roundRect(ctx, x + w * 0.18, y + h * 0.18, w * 0.64, h * 0.48, 10 * k); ctx.fillStyle = c; ctx.fill(); ctx.beginPath(); ctx.moveTo(x + w * 0.35, y + h * 0.66); ctx.lineTo(x + w * 0.3, y + h * 0.85); ctx.lineTo(x + w * 0.48, y + h * 0.66); ctx.fill(); ctx.fillStyle = '#0b0814'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + w * (0.38 + i * 0.12), y + h * 0.42 - (Math.floor(s.t * 4) % 3 === i ? 3 * k : 0), 3.5 * k, 0, Math.PI * 2); ctx.fill(); } },
  msg: (ctx, s, x, y, w, h, k, c) => { roundRect(ctx, x + w * 0.32, y + h * 0.15, w * 0.36, h * 0.7, 6 * k); ctx.lineWidth = 3 * k; ctx.strokeStyle = c; ctx.stroke(); roundRect(ctx, x + w * 0.38, y + h * 0.3, w * 0.24, h * 0.14, 3 * k); ctx.fillStyle = c; ctx.fill(); },
  moon: (ctx, s, x, y, w, h, k, c) => { ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, h * 0.3, 0.6, Math.PI * 2 - 0.6, false); ctx.arc(x + w / 2 + h * 0.15, y + h / 2 - h * 0.05, h * 0.25, Math.PI * 2 - 0.9, 0.9, true); ctx.fillStyle = c; ctx.fill(); },
  wave: (ctx, s, x, y, w, h, k, c) => { ctx.lineWidth = 3 * k; ctx.strokeStyle = c; for (let j = 0; j < 3; j++) { ctx.beginPath(); for (let i = 0; i <= 20; i++) { const xx = x + w * 0.1 + (i / 20) * w * 0.8; ctx.lineTo(xx, y + h * (0.35 + j * 0.15) + Math.sin(i * 0.8 + s.t * 3) * 4 * k); } ctx.stroke(); } },
  drop: (ctx, s, x, y, w, h, k, c) => { const yy = y + h * 0.2 + ((s.t * 0.6) % 1) * h * 0.12; ctx.beginPath(); ctx.moveTo(x + w / 2, yy); ctx.quadraticCurveTo(x + w * 0.68, yy + h * 0.38, x + w / 2, yy + h * 0.55); ctx.quadraticCurveTo(x + w * 0.32, yy + h * 0.38, x + w / 2, yy); ctx.fillStyle = c; ctx.fill(); },
  road: (ctx, s, x, y, w, h, k, c) => { ctx.beginPath(); ctx.moveTo(x + w * 0.42, y + h * 0.15); ctx.lineTo(x + w * 0.58, y + h * 0.15); ctx.lineTo(x + w * 0.85, y + h * 0.9); ctx.lineTo(x + w * 0.15, y + h * 0.9); ctx.closePath(); ctx.lineWidth = 3 * k; ctx.strokeStyle = c; ctx.stroke(); for (let i = 0; i < 3; i++) { const u = ((i / 3 + s.t * 0.8) % 1); ctx.fillStyle = c; ctx.fillRect(x + w / 2 - (1 + u * 2) * k, y + h * (0.18 + u * 0.68), (2 + u * 4) * k, (4 + u * 8) * k); } },
  heart: (ctx, s, x, y, w, h, k, c) => { heartPath(ctx, x + w / 2, y + h * 0.6, h * 0.32 * (1 + 0.12 * s.beat.pulse)); ctx.fillStyle = c; ctx.fill(); },
  people: (ctx, s, x, y, w, h, k, c) => { ctx.fillStyle = c; for (let i = 0; i < 3; i++) { const px = x + w * (0.3 + i * 0.2), py = y + h * (0.42 + (i === 1 ? -0.06 : 0)); ctx.beginPath(); ctx.arc(px, py, h * 0.09, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(px, py + h * 0.3, h * 0.17, Math.PI, 0); ctx.fill(); } },
  eq: (ctx, s, x, y, w, h, k, c) => { ctx.fillStyle = c; for (let i = 0; i < 8; i++) { const v = s.band(i * 2), bh = h * (0.1 + v * 0.65); ctx.fillRect(x + w * 0.12 + i * w * 0.1, y + h * 0.85 - bh, w * 0.07, bh); } },
  hourglass: (ctx, s, x, y, w, h, k, c) => { ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(Math.floor(s.t / 2) * Math.PI + clamp((s.t % 2) - 1.6) * Math.PI * 2.5); ctx.beginPath(); ctx.moveTo(-h * 0.22, -h * 0.32); ctx.lineTo(h * 0.22, -h * 0.32); ctx.lineTo(-h * 0.22, h * 0.32); ctx.lineTo(h * 0.22, h * 0.32); ctx.closePath(); ctx.lineWidth = 3 * k; ctx.strokeStyle = c; ctx.stroke(); ctx.restore(); },
  sun: (ctx, s, x, y, w, h, k, c) => { ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, h * 0.17, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 3 * k; ctx.strokeStyle = c; for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + s.t * 0.5; ctx.beginPath(); ctx.moveTo(x + w / 2 + Math.cos(a) * h * 0.25, y + h / 2 + Math.sin(a) * h * 0.25); ctx.lineTo(x + w / 2 + Math.cos(a) * h * 0.36, y + h / 2 + Math.sin(a) * h * 0.36); ctx.stroke(); } },
  flame: (ctx, s, x, y, w, h, k, c) => { ctx.beginPath(); const fx = x + w / 2, fy = y + h * 0.85; ctx.moveTo(fx - h * 0.2, fy); for (let i = 0; i <= 10; i++) { const u = i / 10; ctx.lineTo(fx - h * 0.2 + u * h * 0.4, fy - (Math.sin(u * Math.PI) * h * 0.55 + noise1(u * 4 + s.t * 5) * h * 0.08)); } ctx.closePath(); ctx.fillStyle = c; ctx.fill(); },
};

function drawTV(ctx, s, L, prev, cur, f, light) {
  const { x, y, w, h } = L.tv, k = L.k;
  // الطاولة
  ctx.strokeStyle = '#0f0910'; ctx.lineWidth = 3 * k;
  ctx.beginPath(); ctx.ellipse(x + w / 2, y + h + 6 * k, w * 0.42, 6 * k, 0, 0, Math.PI * 2); ctx.fillStyle = '#1a0f18'; ctx.fill();
  for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.moveTo(x + w * (0.12 + i * 0.12), y + h + 8 * k); ctx.lineTo(x + w * (0.88 - i * 0.12), L.floorY - 2 * k); ctx.stroke(); }
  // الهوائي
  ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w * 0.2, y - 60 * k); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w * 0.8, y - 70 * k); ctx.lineWidth = 2.5 * k; ctx.strokeStyle = '#2a2230'; ctx.stroke();
  // الجسم والشاشة
  roundRect(ctx, x, y, w, h, 10 * k); ctx.fillStyle = '#231a24'; ctx.fill(); stroke(ctx, 3 * k);
  const sx = x + 10 * k, sy = y + 10 * k, sw = w - 34 * k, shh = h - 20 * k;
  roundRect(ctx, sx, sy, sw, shh, 8 * k); ctx.fillStyle = '#05040a'; ctx.fill();
  ctx.save(); roundRect(ctx, sx, sy, sw, shh, 8 * k); ctx.clip();
  const c = light;
  if (f < 1 && prev !== cur) { ctx.globalAlpha = 1 - f; (TV_ICONS[prev] || TV_ICONS.static)(ctx, s, sx, sy, sw, shh, k, c); }
  ctx.globalAlpha = f; (TV_ICONS[cur] || TV_ICONS.static)(ctx, s, sx, sy, sw, shh, k, c);
  // تشويش لحظة تغيّر القناة
  if (f > 0 && f < 0.5) { ctx.globalAlpha = 1 - f * 2; TV_ICONS.static(ctx, s, sx, sy, sw, shh, k); }
  ctx.globalAlpha = 0.12; for (let yy = sy; yy < sy + shh; yy += 3 * k) { ctx.fillStyle = '#000'; ctx.fillRect(sx, yy, sw, 1.2 * k); }
  ctx.restore();
  for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(x + w - 12 * k, y + 24 * k + i * 22 * k, 5 * k, 0, Math.PI * 2); ctx.fillStyle = '#4a3a4a'; ctx.fill(); }
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, sx + sw / 2, sy + shh / 2, 150 * k, rgba(c, 0.35)); ctx.restore();
}

function drawChair(ctx, L) {
  const { x, y } = L.chair, k = L.k;
  const g = ctx.createLinearGradient(x - 140 * k, 0, x + 140 * k, 0); g.addColorStop(0, '#2a1838'); g.addColorStop(0.5, '#43285a'); g.addColorStop(1, '#2a1838');
  roundRect(ctx, x - 120 * k, y - 300 * k, 240 * k, 230 * k, 60 * k); ctx.fillStyle = g; ctx.fill(); stroke(ctx, 3 * k);
  roundRect(ctx, x - 150 * k, y - 170 * k, 70 * k, 140 * k, 30 * k); ctx.fillStyle = '#331d45'; ctx.fill(); stroke(ctx, 3 * k);
  roundRect(ctx, x + 80 * k, y - 170 * k, 70 * k, 140 * k, 30 * k); ctx.fillStyle = '#331d45'; ctx.fill(); stroke(ctx, 3 * k);
  ctx.fillStyle = '#120a14'; ctx.fillRect(x - 130 * k, y - 40 * k, 14 * k, 40 * k); ctx.fillRect(x + 116 * k, y - 40 * k, 14 * k, 40 * k);
}
// مقدمة الوسادة تُرسم فوق الشخصية فتبدو جالسة على المقعد
function drawCushion(ctx, L) {
  const { x, y } = L.chair, k = L.k;
  roundRect(ctx, x - 112 * k, y - 112 * k, 224 * k, 74 * k, 22 * k);
  const g = ctx.createLinearGradient(0, y - 112 * k, 0, y - 38 * k); g.addColorStop(0, '#4a2a62'); g.addColorStop(1, '#2e1a40');
  ctx.fillStyle = g; ctx.fill(); stroke(ctx, 3 * k);
}

export function room(ctx, s) {
  const { W, H } = s;
  const cur = MOODS[s.mood] || MOODS.neutral, prev = MOODS[s.prevMood] || MOODS.neutral;
  const f = s.prevMood === s.mood ? 1 : easeInOut(clamp(s.moodF));
  const light = mix(prev.light, cur.light, f);
  const L = layout(W, H), k = L.k;
  // كاميرا: دفع بطيء نحو الوجه في «العيون»، تنفّس خفيف ونبضة على بداية المازورة
  const eyesF = (cur.act === 'eyes' ? f : 0) * (prev.act === 'eyes' && cur.act !== 'eyes' ? 0 : 1) + (prev.act === 'eyes' && cur.act !== 'eyes' ? 1 - f : 0);
  const zoom = 1 + 0.03 * Math.sin(s.p * Math.PI) + 0.008 * s.beat.downPulse + eyesF * 1.4;
  const focusX = L.chair.x, focusY = head0Y(L);
  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.scale(zoom, zoom);
  ctx.translate(-lerp(W / 2, focusX, eyesF * 0.95), -lerp(H / 2, focusY, eyesF * 0.95));
  wall(ctx, W, H, L, light);
  drawClock(ctx, s, L, cur, f);
  drawWindow(ctx, s, L, prev.win, cur.win, f, light);
  // «الزائر»: صاحب الصورة يخرج من إطاره ويقف قرب الشخصية ثم يعود
  const visitor = (cur.act === 'visitor' ? f : 0) + (prev.act === 'visitor' && cur.act !== 'visitor' ? 1 - f : 0);
  drawFrame(ctx, s, L, clamp(visitor * 1.5), s.eyes);
  const flicker = cur.act === 'flicker' ? 0.75 + 0.25 * noise1(s.t * 9, 4) : 0.92 + 0.08 * s.beat.pulse;
  drawLamp(ctx, s, L, light, flicker);
  drawTV(ctx, s, L, prev.tv, cur.tv, f, light);
  drawChair(ctx, L);
  // الشخصية الرئيسية بعيون الصورة المرجعية، تنظر نحو ما يتغير
  const lookT = cur.act === 'visitor' ? { x: -0.8, y: -0.3 } : cur.act === 'phone' ? { x: 0.4, y: 0.3 } : { x: Math.sin(s.t * 0.4) * 0.5 + 0.4, y: -0.1 };
  const R = 58 * k;
  const head = drawCharacter(ctx, L.chair.x, L.chair.y - 92 * k, R, {
    t: s.t, beat: s.beat.pulse * 0.5, pose: 'sit', shirt: '#3d5a46', hair: '#5a2a1a', skin: '#e9b892',
    mouth: s.vocal * 0.7, look: lookT, blink: blinkAt(s.t, s.seed), eyeSource: s.eyes, phone: cur.act === 'phone' && f > 0.3,
  });
  drawCushion(ctx, L);
  if (visitor > 0.02) {
    ctx.save(); ctx.globalAlpha = clamp(visitor * 1.4);
    const vx = lerp(L.frame.x + L.frame.w / 2, L.chair.x - 165 * k, easeInOut(visitor)), vy = lerp(L.frame.y + L.frame.h, L.floorY + 30 * k, easeInOut(visitor));
    ctx.filter = `grayscale(${1 - visitor})`;
    drawCharacter(ctx, vx, vy, 52 * k, { t: s.t, shirt: '#4b5a3a', hair: '#1a1a1a', look: { x: 1, y: 0.2 }, blink: blinkAt(s.t, 21), armsUp: 0.15, facing: 1 });
    ctx.filter = 'none'; ctx.restore();
  }
  // قلب يتوهج على صدر الشخصية
  const heartF = (cur.act === 'heart' ? f : 0) + (prev.act === 'heart' && cur.act !== 'heart' ? 1 - f : 0);
  if (heartF > 0.02) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, L.chair.x, head.headY + 1.75 * R, 90 * k, rgba(cur.light, 0.6 * heartF)); ctx.restore();
    ctx.save(); ctx.globalAlpha = heartF; heartPath(ctx, L.chair.x + 0.3 * R, head.headY + 1.8 * R, 15 * k * (1 + 0.15 * s.beat.pulse)); ctx.fillStyle = '#ff6b9d'; ctx.shadowColor = '#ff6b9d'; ctx.shadowBlur = 20 * k; ctx.fill(); ctx.restore();
  }
  // دمعة تنزل في «المطر/الحزن»
  if (cur.act === 'tear' && f > 0.5) {
    const ty = head.headY + 0.15 * R + ((s.local * 0.7) % 1) * 0.9 * R;
    ctx.save(); ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.ellipse(L.chair.x - 0.4 * R, ty, 3.5 * k, 6 * k, 0, 0, Math.PI * 2); ctx.fillStyle = '#bfe3ff'; ctx.fill(); ctx.restore();
  }
  // ضوء الهاتف على الوجه
  if (cur.act === 'phone' && f > 0.3) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, L.chair.x + 40 * k, head.headY + 20 * k, 120 * k, `rgba(140,210,255,${0.35 * f})`); ctx.restore(); }
  // كشافات «المسرح» تمسح الغرفة على الإيقاع
  if (cur.act === 'spot') {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) { const a = Math.sin(s.t * 1.2 + i * 2) * 0.5; ctx.save(); ctx.translate(W * (0.2 + i * 0.3), 0); ctx.rotate(a); const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, rgba(cur.light, 0.25 * f * (0.6 + 0.4 * s.beat.pulse))); g.addColorStop(1, rgba(cur.light, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.lineTo(120 * k, H); ctx.lineTo(-120 * k, H); ctx.fill(); ctx.restore(); }
    ctx.restore();
  }
  // دفء الشروق يملأ الغرفة
  if (cur.act === 'warm') { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, L.win.x + L.win.w / 2, L.win.y + L.win.h, 500 * k, `rgba(255,170,80,${0.25 * f})`); ctx.restore(); }
  // ضوء القمر من النافذة وظلال الزوايا
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, L.win.x + L.win.w / 2, L.win.y + L.win.h / 2, 260 * k, 'rgba(90,120,255,0.12)'); ctx.restore();
  ctx.restore();
  // تظليل سينمائي (خارج الكاميرا)
  const v = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.5, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  // النص: أعلى اليمين، هادئ كجملة، أو كلمة بكلمة
  if (s.words.length) {
    const words = s.textMode === 'sentence';
    const u = L.portrait ? W / 720 : H / 720;
    drawLyricWords(ctx, s, { x: L.text.x - (L.portrait ? 320 : 420) * u, y: L.text.y, w: (L.portrait ? 640 : 840) * u, size: 54 * u, maxRows: 2, align: 'right' }, {
      font: 'Cairo', weight: 700, motion: 'type', appearDur: words ? 0.5 : 0.22,
      fill: '#f3eefa', active: mix('#ffffff', cur.light, 0.6), stroke: 'rgba(10,6,20,0.6)', strokeW: 5 * u, activeGlow: rgba(cur.light, 0.9), glow: 'rgba(0,0,0,0.5)',
    });
  }
}
