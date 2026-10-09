import { INK, clamp, lerp, rng, noise1, easeOutBack, easeInOut, smooth, fillOutline, outline, roundRect, heartPath, starPath, cloud, sky, glow, camera, hills, vGrad } from '../util.js';
import { drawCharacter, drawEyes, blinkAt } from '../character.js';
import { drawLyricWords } from '../text.js';

const stars = (() => { const r = rng(11); return Array.from({ length: 140 }, () => ({ x: r() * 1600 - 160, y: r() * 520 - 60, s: 0.6 + r() * 2.2, ph: r() * 6 })); })();

function charOpts(s, extra = {}) {
  return { t: s.t, beat: s.beat.pulse, mouth: s.vocal, blink: blinkAt(s.t, s.seed), eyeSource: s.eyes, ...extra };
}

// ——— مقدمة: ستارة مسرح تنفتح على عنوان الأغنية ———
export function intro(ctx, s) {
  const { W, H } = s;
  sky(ctx, W, H, ['#2a0f3d', '#5b1a5e', '#ff7a59']);
  glow(ctx, W / 2, H * 0.45, 520, 'rgba(255,200,120,0.5)', 0.6 + 0.4 * s.beat.pulse);
  // أضواء دوّارة
  ctx.save(); ctx.translate(W / 2, H * 1.1);
  for (let i = 0; i < 12; i++) {
    ctx.rotate(Math.PI / 6 + s.t * 0.05);
    ctx.fillStyle = `rgba(255,240,200,${0.05 + 0.05 * s.beat.pulse})`;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-60, -1200); ctx.lineTo(60, -1200); ctx.fill();
  }
  ctx.restore();
  const open = easeInOut(clamp(s.local / Math.max(1.2, s.dur * 0.6)));
  ctx.save();
  ctx.font = `${150 + 8 * s.beat.pulse}px "Lalezar", sans-serif`; ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 14; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
  const ty = H * 0.42 + Math.sin(s.t * 2) * 6;
  ctx.strokeText(s.title || 'شفت كلام', W / 2, ty);
  const g = vGrad(ctx, ty - 80, ty + 80, ['#fff6a8', '#ffb347', '#ff5e62']);
  ctx.fillStyle = g; ctx.fillText(s.title || 'شفت كلام', W / 2, ty);
  ctx.restore();
  // شخصية تطل من الأسفل بعيون المرجع
  drawCharacter(ctx, W / 2, H + 40 - 40 * easeOutBack(clamp(s.local / 1.5)), 70, charOpts(s, { look: { x: Math.sin(s.t), y: -0.6 }, mouth: 0 }));
  // الستارة
  for (const side of [-1, 1]) {
    ctx.save();
    const x0 = side < 0 ? 0 : W, w = (W / 2) * (1 - open);
    ctx.beginPath();
    ctx.moveTo(x0, -10);
    ctx.lineTo(x0 - side * w, -10);
    for (let y = 0; y <= H + 20; y += 30) ctx.lineTo(x0 - side * (w + Math.sin(y * 0.03 + s.t * 2) * 12 * (1 - open)), y);
    ctx.lineTo(x0, H + 20); ctx.closePath();
    ctx.fillStyle = vGrad(ctx, 0, H, ['#b3122e', '#7a0b20']); ctx.fill(); outline(ctx, 5);
    ctx.restore();
  }
  ctx.fillStyle = '#7a0b20'; ctx.fillRect(0, 0, W, 50); ctx.fillStyle = '#ffcf4a';
  for (let i = 0; i < 26; i++) { ctx.globalAlpha = (i + s.beat.index) % 2 ? 1 : 0.35; ctx.beginPath(); ctx.arc(25 + i * 50, 25, 9, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1;
}

// ——— العيون: لقطة مقربة للوجه بعيون الصورة المرجعية، والكلمات تنطلق من النظرة ———
export function eyes(ctx, s) {
  const { W, H } = s;
  ctx.save();
  camera(ctx, W, H, { zoom: 1 + 0.1 * smooth(s.p) + 0.015 * s.beat.downPulse, rot: Math.sin(s.t * 0.6) * 0.015 });
  sky(ctx, W, H, ['#ffd1e8', '#c38bff', '#5d3fd3']);
  ctx.save(); ctx.translate(W / 2, H * 0.55);
  for (let i = 0; i < 18; i++) {
    ctx.rotate((Math.PI * 2) / 18);
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 1200, s.t * 0.15, s.t * 0.15 + 0.17); ctx.fill();
  }
  ctx.restore();
  // الوجه
  const fx = W / 2, fy = H * 0.98, r = 380;
  ctx.beginPath(); ctx.ellipse(fx, fy, r * 1.1, r, 0, 0, Math.PI * 2); fillOutline(ctx, '#f6c9a4', 8);
  ctx.beginPath(); ctx.moveTo(fx - r * 1.08, fy - r * 0.15); ctx.bezierCurveTo(fx - r * 1.1, fy - r * 1.25, fx + r * 1.1, fy - r * 1.25, fx + r * 1.08, fy - r * 0.15);
  ctx.quadraticCurveTo(fx + r * 0.6, fy - r * 0.75, fx, fy - r * 0.68); ctx.quadraticCurveTo(fx - r * 0.6, fy - r * 0.75, fx - r * 1.08, fy - r * 0.15); fillOutline(ctx, '#2b1d14', 8);
  // اتجاه النظر يتبع الكلمة النشطة
  const ai = s.words.findIndex((w) => w.state === 'active');
  const lookX = s.words.length ? (ai >= 0 ? 0.8 - (1.6 * ai) / Math.max(1, s.words.length - 1) : 0) : Math.sin(s.t * 0.8) * 0.6;
  // رمشة طبيعية + رمشة على الضربة الأولى من كل مقطعين
  const blink = Math.max(blinkAt(s.t, s.seed), s.beat.index % 8 === 0 ? Math.sin(clamp(s.beat.phase * 4) * Math.PI) : 0);
  drawEyes(ctx, fx, fy - r * 0.42, r * 0.95, { eyeSource: s.eyes, look: { x: lookX, y: -0.5 }, blink, skin: '#f6c9a4' });
  ctx.fillStyle = 'rgba(255,110,110,0.35)';
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(fx + sd * r * 0.72, fy - r * 0.12, r * 0.16, r * 0.08, 0, 0, Math.PI * 2); ctx.fill(); }
  // شعاع النظرة
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const sd of [-1, 1]) glow(ctx, fx + sd * r * 0.38, fy - r * 0.42, 140, 'rgba(255,240,170,0.7)', 0.3 + 0.5 * s.vocal);
  ctx.restore();
  // جسيمات بريق مع الضربات
  const rr = rng(s.seed * 7 + 3);
  for (let i = 0; i < 30; i++) {
    const a = rr() * Math.PI * 2, d = ((s.t * 120 + rr() * 600) % 600);
    ctx.globalAlpha = (1 - d / 600) * (0.4 + 0.6 * s.beat.pulse);
    starPath(ctx, fx + Math.cos(a) * d, fy - r * 0.45 + Math.sin(a) * d * 0.6, 4 + rr() * 6); ctx.fillStyle = '#fff'; ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  drawLyricWords(ctx, s, { x: W / 2, y: H * 0.2, w: W * 0.82, size: 92 }, {
    motion: 'fly', from: (i) => ({ x: W / 2 + (i % 2 ? 150 : -150), y: H * 0.55 }), fill: '#fff', active: '#ffe066', glow: 'rgba(120,60,200,0.6)',
  });
}

// ——— الكلام: مقهى، شخصيتان، وفقاعة كلام تمتلئ بالكلمات الخارجة من الفم ———
export function talk(ctx, s) {
  const { W, H } = s;
  ctx.save();
  const pan = lerp(-60, 40, easeInOut(s.p));
  camera(ctx, W, H, { zoom: 1.05 + 0.04 * Math.sin(s.p * Math.PI), x: pan });
  ctx.fillStyle = '#ffe3b3'; ctx.fillRect(-200, -200, W + 400, H + 400);
  // ورق جدران مخطط
  for (let x = -200; x < W + 200; x += 60) { ctx.fillStyle = x / 60 % 2 ? '#ffd59a' : '#ffe3b3'; ctx.fillRect(x, -200, 30, H * 0.72 + 200); }
  // نافذة بالخارج سماء
  roundRect(ctx, 80, 70, 300, 220, 20); fillOutline(ctx, '#8fd3ff', 6);
  cloud(ctx, 180 + Math.sin(s.t * 0.3) * 30, 150, 50); cloud(ctx, 310 - Math.sin(s.t * 0.25) * 25, 220, 35);
  ctx.beginPath(); ctx.moveTo(230, 70); ctx.lineTo(230, 290); ctx.moveTo(80, 180); ctx.lineTo(380, 180); outline(ctx, 6);
  // مصابيح معلقة تتأرجح مع الإيقاع
  for (const [lx, ph] of [[560, 0], [880, 1.3], [1120, 2.1]]) {
    const a = Math.sin(s.t * 2 + ph) * 0.12 + 0.05 * s.beat.pulse;
    ctx.save(); ctx.translate(lx, -10); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 120); outline(ctx, 3);
    ctx.beginPath(); ctx.moveTo(-40, 160); ctx.quadraticCurveTo(0, 90, 40, 160); ctx.closePath(); fillOutline(ctx, '#ff7b54', 4);
    glow(ctx, 0, 175, 120, 'rgba(255,230,150,0.8)', 0.5 + 0.5 * s.beat.pulse);
    ctx.restore();
  }
  // أرضية
  ctx.fillStyle = '#b5703f'; ctx.fillRect(-200, H * 0.72, W + 400, H); ctx.beginPath(); ctx.moveTo(-200, H * 0.72); ctx.lineTo(W + 200, H * 0.72); outline(ctx, 5);
  // الشخصيتان والطاولة
  drawCharacter(ctx, 330, H * 0.86, 62, charOpts(s, { shirt: '#4ecdc4', hair: '#5a2d0c', facing: 1, pose: 'sit', look: { x: 1, y: 0 }, mouth: 0.05, eyeSource: null, blink: blinkAt(s.t, 17) }));
  const me = drawCharacter(ctx, 950, H * 0.86, 66, charOpts(s, { facing: -1, pose: 'sit', look: { x: -1, y: 0 } }));
  roundRect(ctx, 470, H * 0.66, 340, 26, 10); fillOutline(ctx, '#7b4a2a', 5);
  ctx.beginPath(); ctx.moveTo(640, H * 0.66 + 26); ctx.lineTo(640, H * 0.9); outline(ctx, 12);
  for (const [cx, col] of [[560, '#fff'], [720, '#fff']]) {
    roundRect(ctx, cx - 22, H * 0.6, 44, 46, 8); fillOutline(ctx, col, 4);
    for (let k = 0; k < 3; k++) { ctx.globalAlpha = 0.5; ctx.beginPath(); const yy = H * 0.58 - ((s.t * 30 + k * 20) % 60); ctx.moveTo(cx - 8 + k * 8, yy); ctx.quadraticCurveTo(cx + Math.sin(s.t * 3 + k) * 10, yy - 15, cx - 8 + k * 8, yy - 30); outline(ctx, 3, '#fff'); ctx.globalAlpha = 1; }
  }
  // فقاعة الكلام: تكبر مع ظهور السطر
  const grow = easeOutBack(clamp((s.lineIn || 1) * 1.3)) * (1 - (s.lineOut || 0));
  if (s.words.length && grow > 0.02) {
    ctx.save(); ctx.translate(780, 180); ctx.scale(grow, grow);
    roundRect(ctx, -380, -110, 760, 220, 90); ctx.fillStyle = '#fff'; ctx.fill(); outline(ctx, 7);
    ctx.beginPath(); ctx.moveTo(140, 100); ctx.lineTo(200, 220); ctx.lineTo(60, 105); ctx.fillStyle = '#fff'; ctx.fill(); outline(ctx, 7);
    ctx.fillStyle = '#fff'; ctx.fillRect(55, 92, 150, 20);
    ctx.restore();
  }
  drawLyricWords(ctx, s, { x: 780, y: 180, w: 660, size: 80, maxRows: 2 }, {
    motion: 'fly', from: () => ({ x: me.mouthX, y: me.mouthY }), fill: INK, stroke: '#fff', strokeW: 6, active: '#ff4d6d', activeGlow: 'rgba(255,77,109,0.5)',
  });
  ctx.restore();
}

// ——— الهاتف: غرفة ليلية وشاشة محادثة تُكتب فيها الكلمات ———
export function phone(ctx, s) {
  const { W, H } = s;
  sky(ctx, W, H, ['#0f1033', '#26215c']);
  for (let i = 0; i < 40; i++) { const st = stars[i]; ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(s.t + st.ph)); ctx.fillStyle = '#fff'; ctx.fillRect(st.x * 0.4, st.y * 0.5, 2, 2); }
  ctx.globalAlpha = 1;
  roundRect(ctx, 40, 60, 360, 300, 16); fillOutline(ctx, '#151540', 6);
  ctx.beginPath(); ctx.arc(300, 150, 50, 0, Math.PI * 2); fillOutline(ctx, '#fff4c2', 4);
  // سرير وشخصية تمسك الهاتف
  roundRect(ctx, -40, H * 0.68, 560, 200, 30); fillOutline(ctx, '#6c5ce7', 6);
  roundRect(ctx, 20, H * 0.6, 160, 80, 30); fillOutline(ctx, '#fff', 5);
  drawCharacter(ctx, 300, H * 0.98, 60, charOpts(s, { pose: 'sit', phone: true, shirt: '#fd79a8', look: { x: 1, y: 0.2 }, mouth: s.vocal * 0.6 }));
  glow(ctx, 360, H * 0.62, 260, 'rgba(120,200,255,0.6)', 0.6);
  // الهاتف الكبير
  ctx.save();
  const tilt = -0.06 + Math.sin(s.t * 0.9) * 0.02;
  ctx.translate(W * 0.68, H * 0.5 + Math.sin(s.t * 1.3) * 6 - 10 * s.beat.pulse); ctx.rotate(tilt);
  roundRect(ctx, -230, -330, 460, 660, 50); fillOutline(ctx, '#1e1e2e', 8);
  roundRect(ctx, -205, -290, 410, 590, 26); ctx.fillStyle = vGrad(ctx, -290, 300, ['#e8f6ff', '#cde9ff']); ctx.fill();
  roundRect(ctx, -205, -290, 410, 70, 26); ctx.fillStyle = '#4a69ff'; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '28px "Cairo", sans-serif'; ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.fillText('💬', 180, -245);
  // السطر السابق رسالة واردة
  if (s.prevLine) {
    ctx.font = '26px "Cairo", sans-serif'; ctx.textAlign = 'left';
    const pw = Math.min(330, ctx.measureText(s.prevLine).width + 40);
    roundRect(ctx, -185, -200, pw, 56, 22); fillOutline(ctx, '#fff', 3); ctx.fillStyle = '#333'; ctx.direction = 'rtl'; ctx.textAlign = 'right';
    ctx.save(); ctx.beginPath(); ctx.rect(-185, -200, pw, 56); ctx.clip(); ctx.fillText(s.prevLine, -185 + pw - 20, -163); ctx.restore();
  }
  const anyStarted = s.words.some((w) => w.state !== 'future');
  roundRect(ctx, -185, -110, 370, 260, 28); fillOutline(ctx, '#4a69ff', 4);
  if (!anyStarted && s.words.length) {
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(-30 + k * 30, 20 - 10 * Math.max(0, Math.sin(s.t * 8 - k)), 10, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); }
  }
  ctx.restore();
  // قلوب ورموز تطفو مع الضربات القوية
  const rr = rng(s.seed + 99);
  for (let i = 0; i < 10; i++) {
    const x = W * 0.45 + rr() * W * 0.5, sp = 40 + rr() * 60, y = H + 40 - ((s.local * sp + rr() * 700) % (H + 80));
    ctx.globalAlpha = 0.7; heartPath(ctx, x, y, 14 + rr() * 14 + 6 * s.beat.pulse); fillOutline(ctx, rr() > 0.5 ? '#ff6b9d' : '#ffd93d', 3);
  }
  ctx.globalAlpha = 1;
  ctx.save(); ctx.translate(W * 0.68, H * 0.5 + Math.sin(s.t * 1.3) * 6 - 10 * s.beat.pulse); ctx.rotate(tilt);
  drawLyricWords(ctx, s, { x: 0, y: 20, w: 330, size: 58, maxRows: 4, h: 240 }, { motion: 'type', fill: '#fff', active: '#ffe066', strokeW: 0, glow: null, activeGlow: 'rgba(255,255,255,0.6)' });
  ctx.restore();
}

// ——— الليل: سطح بيت، قمر، والكلمات تتحول إلى أبراج نجوم ———
export function night(ctx, s) {
  const { W, H } = s;
  ctx.save();
  const tiltY = lerp(-60, 80, easeInOut(s.p));
  camera(ctx, W, H, { zoom: 1.08, y: tiltY });
  sky(ctx, W, H, ['#050824', '#1b1f5e', '#3b2f80']);
  for (const st of stars) { ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(s.t * 1.5 + st.ph)) * (0.7 + 0.3 * s.beat.pulse); ctx.fillStyle = '#fff'; starPath(ctx, st.x, st.y, st.s * 1.6, 4, 0.4); ctx.fill(); }
  ctx.globalAlpha = 1;
  // نيزك عند الضربات القوية
  if (s.hit > 0.3) { ctx.save(); ctx.globalAlpha = s.hit; ctx.beginPath(); const mx = 1000 - s.hitAge * 900, my = 60 + s.hitAge * 300; ctx.moveTo(mx, my); ctx.lineTo(mx + 140, my - 50); outline(ctx, 4, '#fff'); ctx.restore(); }
  const mx = 1050, my = 150;
  glow(ctx, mx, my, 260, 'rgba(255,250,210,0.6)');
  ctx.beginPath(); ctx.arc(mx, my, 85, 0, Math.PI * 2); fillOutline(ctx, '#fff7c9', 5);
  ctx.fillStyle = 'rgba(200,190,140,0.5)'; for (const [cx, cy, cr] of [[-25, -20, 16], [20, 25, 12], [30, -30, 8]]) { ctx.beginPath(); ctx.arc(mx + cx, my + cy, cr, 0, Math.PI * 2); ctx.fill(); }
  // أفق المدينة
  const r0 = rng(5);
  for (let x = -100; x < W + 100;) {
    const w = 60 + r0() * 90, h = 120 + r0() * 200;
    ctx.beginPath(); ctx.rect(x, H * 0.75 - h, w, h + 200); fillOutline(ctx, '#151838', 4);
    for (let wy = H * 0.75 - h + 15; wy < H * 0.75 - 10; wy += 28) for (let wx = x + 10; wx < x + w - 15; wx += 22) {
      const on = (Math.floor(wx * 7 + wy * 3) + (s.beat.index >> 1)) % 5 === 0;
      ctx.fillStyle = on ? '#ffd86b' : '#262a55'; ctx.fillRect(wx, wy, 10, 14);
    }
    x += w + 8;
  }
  // السطح والشخصية الجالسة
  ctx.beginPath(); ctx.rect(150, H * 0.82, 700, 300); fillOutline(ctx, '#6b4f3a', 5);
  drawCharacter(ctx, 460, H * 0.86, 60, charOpts(s, { pose: 'sit', shirt: '#ffd166', look: { x: 0.6, y: -1 }, mouth: s.vocal * 0.7 }));
  ctx.restore();
  // الكلمات أبراجًا: خطوط بين الكلمات المتتالية
  const L = drawLyricWords(ctx, s, { x: W * 0.45, y: H * 0.25, w: W * 0.7, size: 84 }, { motion: 'pop', fill: '#e8ecff', active: '#fff6a8', glow: 'rgba(160,180,255,0.9)', strokeW: 0, bob: 4 });
  if (L) {
    ctx.save(); ctx.globalAlpha = 0.6 * (1 - (s.lineOut || 0)); ctx.setLineDash([4, 8]); ctx.strokeStyle = '#cfd8ff'; ctx.lineWidth = 2;
    let prev = null;
    s.words.forEach((w, i) => {
      if (w.state === 'future' || !L.slots[i]) return;
      const p = { x: W * 0.45 + L.slots[i].x, y: H * 0.25 + L.slots[i].y - L.size * 0.55 };
      starPath(ctx, p.x, p.y, 7, 4, 0.35); ctx.fillStyle = '#fff'; ctx.fill();
      if (prev) { ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke(); }
      prev = p;
    });
    ctx.restore();
  }
}

// ——— البحر: قارب يتمايل عند الغروب، والكلمات تطفو على الموج ———
export function sea(ctx, s) {
  const { W, H } = s;
  ctx.save();
  camera(ctx, W, H, { zoom: 1.06, x: lerp(40, -40, s.p) });
  sky(ctx, W, H, ['#ff9a8b', '#ffc3a0', '#ffe29a']);
  glow(ctx, W * 0.3, H * 0.52, 300, 'rgba(255,240,180,0.9)');
  ctx.beginPath(); ctx.arc(W * 0.3, H * 0.52, 90, Math.PI, 0); fillOutline(ctx, '#ffdd6b', 5);
  for (let i = 0; i < 4; i++) cloud(ctx, ((i * 380 + s.t * 15) % (W + 300)) - 150, 90 + (i % 2) * 70, 55 + i * 6, '#fff3e6');
  // نوارس
  for (let i = 0; i < 4; i++) {
    const gx = ((s.t * 60 + i * 300) % (W + 200)) - 100, gy = 140 + i * 25 + Math.sin(s.t * 2 + i) * 10, f = Math.sin(s.t * 8 + i) * 12;
    ctx.beginPath(); ctx.moveTo(gx - 20, gy - f); ctx.quadraticCurveTo(gx - 8, gy - 10, gx, gy); ctx.quadraticCurveTo(gx + 8, gy - 10, gx + 20, gy - f); outline(ctx, 3);
  }
  const wave = (base, amp, sp, col) => {
    ctx.beginPath(); ctx.moveTo(-200, H + 200);
    for (let x = -200; x <= W + 200; x += 16) ctx.lineTo(x, base + Math.sin(x * 0.012 + s.t * sp) * amp + Math.sin(x * 0.03 - s.t * sp * 1.3) * amp * 0.3);
    ctx.lineTo(W + 200, H + 200); ctx.closePath(); fillOutline(ctx, col, 4);
  };
  wave(H * 0.56, 8, 1.2, '#4facfe');
  wave(H * 0.66, 12 + 6 * s.beat.pulse, 1.6, '#2f80ed');
  // القارب
  const bx = W * 0.62, by = H * 0.66 + Math.sin(bx * 0.012 + s.t * 1.6) * 14, rot = Math.sin(s.t * 1.6) * 0.07;
  ctx.save(); ctx.translate(bx, by); ctx.rotate(rot);
  ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(0, -300); outline(ctx, 7);
  ctx.beginPath(); ctx.moveTo(8, -290); ctx.quadraticCurveTo(170 + 20 * s.beat.pulse, -170, 8, -40); ctx.closePath(); fillOutline(ctx, '#fff', 5);
  drawCharacter(ctx, -60, -10, 46, charOpts(s, { pose: 'sit', shirt: '#ff6b6b', look: { x: -0.8, y: 0 } }));
  ctx.beginPath(); ctx.moveTo(-200, -30); ctx.lineTo(200, -30); ctx.lineTo(150, 40); ctx.lineTo(-150, 40); ctx.closePath(); fillOutline(ctx, '#a0522d', 6);
  ctx.restore();
  wave(H * 0.8, 16, 2, '#1c5fd1');
  ctx.restore();
  drawLyricWords(ctx, s, { x: W * 0.5, y: H * 0.84, w: W * 0.86, size: 78, maxRows: 2 }, { motion: 'rise', fill: '#fff', active: '#ffe066', bob: 10, rot: 0.05, glow: 'rgba(0,40,120,0.6)' });
}

// ——— المطر: نافذة ضبابية، قطرات، والكلمات تُكتب على الزجاج ———
export function rain(ctx, s) {
  const { W, H } = s;
  ctx.save();
  camera(ctx, W, H, { zoom: lerp(1.12, 1.0, easeInOut(s.p)) });
  sky(ctx, W, H, ['#2c3e50', '#4a6178', '#6d8299']);
  // مدينة ضبابية بالخارج
  const r0 = rng(21);
  ctx.globalAlpha = 0.55;
  for (let x = -100; x < W + 100;) { const w = 80 + r0() * 100, h = 150 + r0() * 250; ctx.fillStyle = '#34495e'; ctx.fillRect(x, H * 0.8 - h, w, h + 200); x += w + 20; }
  ctx.globalAlpha = 1;
  if (s.hit > 0.5) { ctx.fillStyle = `rgba(230,240,255,${0.5 * s.hit})`; ctx.fillRect(-200, -200, W + 400, H + 400); }
  // خيوط المطر
  ctx.strokeStyle = 'rgba(200,220,255,0.55)'; ctx.lineWidth = 2;
  const rr = rng(4);
  for (let i = 0; i < 160; i++) {
    const x = rr() * (W + 200) - 100, sp = 500 + rr() * 500, y = ((s.t * sp + rr() * H) % (H + 100)) - 50;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 6, y + 26); ctx.stroke();
  }
  // ضباب على الزجاج
  ctx.fillStyle = 'rgba(220,230,240,0.28)'; ctx.fillRect(140, 60, W - 280, H - 170);
  // قطرات على الزجاج
  const rd = rng(8);
  for (let i = 0; i < 40; i++) {
    const x = 160 + rd() * (W - 320), y0 = 80 + rd() * (H - 220), slide = ((s.t * (5 + rd() * 30) + rd() * 200) % 200);
    ctx.beginPath(); ctx.ellipse(x, y0 + slide, 5 + rd() * 5, 7 + rd() * 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(40,60,90,0.5)'; ctx.stroke();
  }
  // إطار النافذة
  ctx.lineWidth = 0;
  ctx.fillStyle = '#e9d8c4';
  ctx.fillRect(-200, -200, W + 400, 260); ctx.fillRect(-200, H - 110, W + 400, 400); ctx.fillRect(-200, -200, 340, H + 400); ctx.fillRect(W - 140, -200, 400, H + 400);
  ctx.beginPath(); ctx.rect(140, 60, W - 280, H - 170); outline(ctx, 10, '#5d4037');
  ctx.beginPath(); ctx.moveTo(W / 2, 60); ctx.lineTo(W / 2, H - 110); outline(ctx, 12, '#5d4037');
  roundRect(ctx, 100, H - 120, W - 200, 34, 10); fillOutline(ctx, '#bfa58a', 5);
  // الشخصية تتكئ على حافة النافذة
  drawCharacter(ctx, W * 0.17, H + 70, 72, charOpts(s, { shirt: '#74b9ff', hair: '#3d2817', look: { x: 1, y: -0.3 }, mouth: s.vocal * 0.5 }));
  ctx.restore();
  // الكلمات مكتوبة بالإصبع على الزجاج الضبابي
  drawLyricWords(ctx, s, { x: W / 2, y: H * 0.42, w: W * 0.62, size: 86 }, { motion: 'type', fill: 'rgba(255,255,255,0.92)', active: '#ffffff', stroke: 'rgba(60,80,110,0.55)', strokeW: 5, activeGlow: 'rgba(200,230,255,0.9)', exitDir: -1 });
}
