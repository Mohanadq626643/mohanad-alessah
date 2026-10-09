import { INK, clamp, lerp, rng, noise1, easeOutBack, easeInOut, smooth, fillOutline, outline, roundRect, heartPath, starPath, cloud, sky, glow, camera, hills, vGrad } from '../util.js';
import { drawCharacter, blinkAt } from '../character.js';
import { drawLyricWords } from '../text.js';

function charOpts(s, extra = {}) {
  return { t: s.t, beat: s.beat.pulse, mouth: s.vocal, blink: blinkAt(s.t, s.seed), eyeSource: s.eyes, ...extra };
}

function tree(ctx, x, y, h, col = '#2ecc71') {
  ctx.beginPath(); ctx.rect(x - h * 0.06, y - h * 0.4, h * 0.12, h * 0.4); fillOutline(ctx, '#8b5a2b', 3);
  ctx.beginPath(); ctx.arc(x, y - h * 0.6, h * 0.32, 0, Math.PI * 2); fillOutline(ctx, col, 3);
}

// ——— الطريق: سيارة على طريق بمنظور متوازي، والكلمات على لافتة طريق ———
export function road(ctx, s) {
  const { W, H } = s;
  const speed = 420, d = s.local * speed;
  ctx.save();
  camera(ctx, W, H, { zoom: 1.04, y: Math.sin(s.t * 18) * 1.5 * (0.5 + s.energy) });
  sky(ctx, W, H, ['#56ccf2', '#a8e6ff', '#fef9d7']);
  for (let i = 0; i < 5; i++) cloud(ctx, ((i * 330 - d * 0.05) % (W + 300) + W + 300) % (W + 300) - 150, 80 + (i % 3) * 40, 50, '#fff');
  // جبال بعيدة وتلال قريبة (سرعات مختلفة)
  ctx.save(); ctx.translate(-(d * 0.1) % 600, 0);
  for (let i = -1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(i * 600 - 100, H * 0.62); ctx.lineTo(i * 600 + 200, H * 0.25); ctx.lineTo(i * 600 + 500, H * 0.62); fillOutline(ctx, '#7e8fd6', 4); ctx.beginPath(); ctx.moveTo(i * 600 + 145, H * 0.33); ctx.lineTo(i * 600 + 200, H * 0.25); ctx.lineTo(i * 600 + 255, H * 0.33); ctx.closePath(); fillOutline(ctx, '#fff', 3); }
  ctx.restore();
  hills(ctx, W, H, H * 0.62, 18, 0.006, d * 0.004, '#6fcf97');
  for (let i = -1; i < 10; i++) tree(ctx, i * 180 - ((d * 0.4) % 180), H * 0.66, 120 + (i % 3) * 20, i % 2 ? '#27ae60' : '#2ecc71');
  // الطريق
  ctx.fillStyle = '#4a4a5a'; ctx.fillRect(-200, H * 0.7, W + 400, H * 0.4); ctx.beginPath(); ctx.moveTo(-200, H * 0.7); ctx.lineTo(W + 200, H * 0.7); outline(ctx, 5);
  ctx.fillStyle = '#fff'; for (let x = -((d) % 160) - 200; x < W + 200; x += 160) ctx.fillRect(x, H * 0.84, 80, 10);
  // لافتة الطريق تدخل مع بداية السطر وتستقر
  const signX = lerp(W + 400, W * 0.55, easeOutBack(clamp((s.lineIn || 1) * 1.4))) - (s.lineOut || 0) * 900;
  ctx.beginPath(); ctx.rect(signX - 8, H * 0.38, 16, H * 0.34); fillOutline(ctx, '#888', 4);
  ctx.beginPath(); ctx.rect(signX + 350 - 8, H * 0.38, 16, H * 0.34); fillOutline(ctx, '#888', 4);
  roundRect(ctx, signX - 120, H * 0.08, 590, 240, 22); fillOutline(ctx, '#1e8449', 7);
  roundRect(ctx, signX - 105, H * 0.08 + 14, 560, 212, 14); ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke();
  // السيارة
  const cx = W * 0.3, cy = H * 0.8 + Math.abs(Math.sin(s.t * 12)) * 3 + 4 * s.beat.pulse;
  roundRect(ctx, cx - 170, cy - 70, 340, 80, 30); fillOutline(ctx, '#e74c3c', 6);
  ctx.beginPath(); ctx.moveTo(cx - 100, cy - 70); ctx.quadraticCurveTo(cx - 60, cy - 150, cx + 40, cy - 150); ctx.quadraticCurveTo(cx + 100, cy - 150, cx + 120, cy - 70); ctx.closePath(); fillOutline(ctx, '#e74c3c', 6);
  ctx.save(); ctx.beginPath(); ctx.moveTo(cx - 80, cy - 72); ctx.quadraticCurveTo(cx - 50, cy - 135, cx + 30, cy - 135); ctx.lineTo(cx + 95, cy - 72); ctx.closePath(); ctx.fillStyle = '#bfe9ff'; ctx.fill(); ctx.clip();
  drawCharacter(ctx, cx + 10, cy + 40, 40, charOpts(s, { pose: 'drive', shirt: '#f1c40f', look: { x: 1, y: 0 } }));
  ctx.restore();
  ctx.beginPath(); ctx.moveTo(cx - 80, cy - 72); ctx.quadraticCurveTo(cx - 50, cy - 135, cx + 30, cy - 135); ctx.lineTo(cx + 95, cy - 72); ctx.closePath(); outline(ctx, 5);
  for (const wx of [cx - 100, cx + 100]) {
    ctx.save(); ctx.translate(wx, cy + 10); ctx.rotate(s.t * 14);
    ctx.beginPath(); ctx.arc(0, 0, 38, 0, Math.PI * 2); fillOutline(ctx, '#222', 5);
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); fillOutline(ctx, '#ccc', 3); ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(16, 0); outline(ctx, 3);
    ctx.restore();
  }
  // غبار خلف السيارة
  for (let i = 0; i < 6; i++) { const k = ((s.t * 2 + i / 6) % 1); ctx.globalAlpha = 0.5 * (1 - k); ctx.beginPath(); ctx.arc(cx - 200 - k * 200, cy + 20 - k * 30, 15 + k * 30, 0, Math.PI * 2); ctx.fillStyle = '#ddd'; ctx.fill(); }
  ctx.globalAlpha = 1;
  drawLyricWords(ctx, s, { x: signX + 175, y: H * 0.08 + 120, w: 500, size: 70, maxRows: 2, h: 190 }, { motion: 'pop', fill: '#fff', active: '#ffe066', strokeW: 0, glow: null, activeGlow: 'rgba(255,255,255,0.5)' });
  ctx.restore();
}

// ——— القلب: حديقة تتفتح زهورها على الإيقاع، والكلمات على بالونات قلوب ———
export function heart(ctx, s) {
  const { W, H } = s;
  ctx.save();
  camera(ctx, W, H, { zoom: lerp(1.0, 1.1, easeInOut(s.p)), y: lerp(0, 30, s.p) });
  sky(ctx, W, H, ['#ffd3e8', '#ffe9f3', '#fff8e7']);
  for (let i = 0; i < 4; i++) cloud(ctx, ((i * 360 + s.t * 20) % (W + 300)) - 150, 70 + (i % 2) * 50, 45, '#fff');
  hills(ctx, W, H, H * 0.7, 20, 0.005, 1, '#a8e063');
  hills(ctx, W, H, H * 0.8, 14, 0.008, 3, '#7ed957');
  // زهور تتفتح مع الضربات
  const rr = rng(33);
  for (let i = 0; i < 26; i++) {
    const x = rr() * W, y = H * 0.82 + rr() * H * 0.15, bloom = clamp(s.local * 1.5 - rr() * 2) * (1 + 0.25 * s.beat.pulse), col = ['#ff6b9d', '#ffd93d', '#ff8c42', '#c06cff'][i % 4];
    ctx.beginPath(); ctx.moveTo(x, y + 40); ctx.lineTo(x, y); outline(ctx, 3, '#2d7a1f');
    if (bloom > 0.02) {
      for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 + s.t * 0.3; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 11 * bloom, y + Math.sin(a) * 11 * bloom, 9 * bloom, 0, Math.PI * 2); fillOutline(ctx, col, 2); }
      ctx.beginPath(); ctx.arc(x, y, 7 * bloom, 0, Math.PI * 2); fillOutline(ctx, '#fff3a0', 2);
    }
  }
  drawCharacter(ctx, W * 0.82, H * 0.9, 62, charOpts(s, { shirt: '#ff6b9d', look: { x: -0.7, y: -0.8 }, armsUp: 0.3 + 0.2 * s.beat.pulse }));
  // بالونات قلوب: بالون لكل كلمة يصعد إلى موضعها
  const baseX = W * 0.42, baseY = H * 0.36;
  const saveWords = s.words;
  // قياس مواضع الكلمات أولًا (دون رسم) ثم رسم البالونات خلفها
  const lay = drawLyricWords(ctx, { ...s, words: s.words.map((w) => ({ ...w, state: 'future' })) }, { x: baseX, y: baseY, w: W * 0.7, size: 64, maxRows: 2 }, { ghost: 0 });
  if (lay) {
    const balloon = (w, i) => {
      const sl = lay.slots[i], up = easeOutBack(clamp(w.since / 0.6));
      const sz = Math.max(62, sl.w * 0.72) * (w.state === 'active' ? 1 + 0.08 * s.beat.pulse : 1);
      const x = baseX + sl.x * 1.15 + Math.sin(s.t * 1.5 + i) * 6, y = lerp(H + 150, baseY + sl.y * 1.6, up) - (s.lineOut || 0) * 500;
      return { x, y, sz };
    };
    saveWords.forEach((w, i) => {
      if (w.state === 'future' || !lay.slots[i]) return;
      const { x, y, sz } = balloon(w, i);
      ctx.beginPath(); ctx.moveTo(x, y + sz * 0.35); ctx.quadraticCurveTo(x + 15, y + sz + 60, x - 5, y + sz + 160); outline(ctx, 2, '#555');
      heartPath(ctx, x, y, sz); fillOutline(ctx, ['#ff4d6d', '#ff85a1', '#e63946', '#ff6b9d'][i % 4], 5);
      ctx.save(); ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.ellipse(x - sz * 0.4, y - sz * 0.5, sz * 0.1, sz * 0.18, -0.6, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
    });
    // الكلمة تُحمل داخل بالونها
    drawLyricWords(ctx, { ...s, lineOut: 0 }, { x: baseX, y: baseY, w: W * 0.7, size: 64, maxRows: 2 }, {
      motion: 'pop', fill: '#fff', active: '#fff6a8', strokeW: 6, pos: (i, slot, w) => { const b = balloon(w, i); return { x: b.x, y: b.y - b.sz * 0.22 }; },
    });
  }
  ctx.restore();
}

// ——— المدينة: شارع نيون وناس يمشون، والكلمات على لافتة نيون ———
export function city(ctx, s) {
  const { W, H } = s;
  ctx.save();
  camera(ctx, W, H, { zoom: 1.05, x: lerp(50, -50, s.p) });
  sky(ctx, W, H, ['#120c2e', '#2d1b69', '#7b2cbf']);
  const r0 = rng(77), cols = ['#3a0ca3', '#4361ee', '#560bad', '#480ca8'];
  for (let x = -150; x < W + 150;) {
    const w = 110 + r0() * 120, h = 260 + r0() * 260, c = cols[Math.floor(r0() * 4)];
    ctx.beginPath(); ctx.rect(x, H * 0.78 - h, w, h + 200); fillOutline(ctx, c, 5);
    for (let wy = H * 0.78 - h + 20; wy < H * 0.7; wy += 34) for (let wx = x + 14; wx < x + w - 20; wx += 28) {
      const on = (Math.floor(wx + wy) + s.beat.index) % 7 < 3;
      ctx.fillStyle = on ? '#ffe066' : 'rgba(255,255,255,0.08)'; ctx.fillRect(wx, wy, 14, 18);
    }
    x += w + 14;
  }
  ctx.fillStyle = '#2b2d42'; ctx.fillRect(-200, H * 0.78, W + 400, H); ctx.beginPath(); ctx.moveTo(-200, H * 0.78); ctx.lineTo(W + 200, H * 0.78); outline(ctx, 5);
  ctx.fillStyle = 'rgba(255,0,200,0.15)'; ctx.fillRect(-200, H * 0.78, W + 400, 30);
  // الناس: صور ظلية تمشي في اتجاهين
  const rp = rng(9);
  for (let i = 0; i < 12; i++) {
    const dir = i % 2 ? 1 : -1, sp = 40 + rp() * 50, x = ((rp() * W + dir * s.t * sp) % (W + 200) + W + 200) % (W + 200) - 100, sc = 0.7 + rp() * 0.4;
    const step = Math.sin(s.t * 6 + i) * 8;
    ctx.save(); ctx.translate(x, H * 0.9); ctx.scale(sc, sc); ctx.fillStyle = '#1a1a2e';
    ctx.beginPath(); ctx.arc(0, -150, 22, 0, Math.PI * 2); ctx.fill();
    roundRect(ctx, -22, -128, 44, 80, 16); ctx.fill();
    ctx.lineWidth = 14; ctx.strokeStyle = '#1a1a2e'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-8, -50); ctx.lineTo(-8 + step, 0); ctx.moveTo(8, -50); ctx.lineTo(8 - step, 0); ctx.stroke();
    // فقاعة همس صغيرة
    if ((i + s.beat.index) % 5 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.ellipse(dir * 40, -200, 26, 16, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#333'; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(dir * 40 - 10 + k * 10, -200, 3, 0, Math.PI * 2); ctx.fill(); } }
    ctx.restore();
  }
  drawCharacter(ctx, W * 0.5, H * 0.95, 64, charOpts(s, { pose: 'walk', shirt: '#06d6a0', look: { x: 0, y: -0.6 } }));
  // لافتة النيون
  const flick = s.local < 0.4 ? (Math.sin(s.local * 90) > 0 ? 1 : 0.3) : 0.9 + 0.1 * s.beat.pulse;
  ctx.save(); ctx.globalAlpha = flick;
  roundRect(ctx, W * 0.14, H * 0.06, W * 0.72, 210, 30); ctx.fillStyle = 'rgba(10,0,30,0.75)'; ctx.fill();
  ctx.shadowColor = '#ff2fd6'; ctx.shadowBlur = 25; ctx.lineWidth = 6; ctx.strokeStyle = '#ff5ce1'; ctx.stroke(); ctx.shadowBlur = 0;
  drawLyricWords(ctx, s, { x: W / 2, y: H * 0.06 + 105, w: W * 0.64, size: 76, maxRows: 2, h: 180 }, { motion: 'pop', fill: '#9bf6ff', active: '#fff', stroke: '#00b4d8', strokeW: 3, glow: 'rgba(0,220,255,0.9)', activeGlow: 'rgba(255,92,225,1)' });
  ctx.restore();
  ctx.restore();
}

// ——— المسرح: أضواء ومعادل صوتي من الطيف الحقيقي، والشخصية تغني بالمايك ———
export function stage(ctx, s) {
  const { W, H } = s;
  ctx.save();
  camera(ctx, W, H, { zoom: 1.0 + 0.03 * s.beat.downPulse + 0.05 * smooth(s.p), rot: Math.sin(s.t * 0.5) * 0.01 });
  sky(ctx, W, H, ['#0b0b1a', '#1a1033', '#331a4d']);
  // شاشة LED خلفية
  roundRect(ctx, W * 0.12, H * 0.06, W * 0.76, H * 0.36, 16); fillOutline(ctx, '#05050f', 6);
  ctx.save(); ctx.beginPath(); ctx.rect(W * 0.12, H * 0.06, W * 0.76, H * 0.36); ctx.clip();
  ctx.fillStyle = 'rgba(80,40,160,0.25)'; for (let x = W * 0.12; x < W * 0.88; x += 8) for (let y = H * 0.06; y < H * 0.42; y += 8) if (((x + y) / 8 + s.beat.index) % 9 === 0) ctx.fillRect(x, y, 5, 5);
  drawLyricWords(ctx, s, { x: W / 2, y: H * 0.24, w: W * 0.7, size: 82, maxRows: 2, h: H * 0.32 }, { motion: 'pop', fill: '#ffd6ff', active: '#fff', strokeW: 0, glow: 'rgba(255,120,255,0.9)', activeGlow: 'rgba(255,255,255,1)' });
  ctx.restore();
  // كشافات تتحرك مع الإيقاع
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const a = Math.sin(s.t * 0.9 + i * 1.7) * 0.5 + (i - 1.5) * 0.2, col = ['rgba(255,80,200,', 'rgba(80,200,255,', 'rgba(255,220,80,', 'rgba(120,255,160,'][i];
    ctx.save(); ctx.translate(W * (0.15 + i * 0.23), -20); ctx.rotate(a);
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, col + (0.45 + 0.4 * s.beat.pulse) + ')'); g.addColorStop(1, col + '0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(15, 0); ctx.lineTo(170, H); ctx.lineTo(-170, H); ctx.fill(); ctx.restore();
  }
  ctx.restore();
  // المعادل الصوتي من أشرطة الطيف الفعلية
  const n = s.bandCount || 16;
  for (let i = 0; i < n; i++) {
    const v = s.band(i), bw = (W * 0.76) / n;
    for (const side of [0]) {
      const x = W * 0.12 + i * bw;
      const h = 10 + v * 140;
      roundRect(ctx, x + 4, H * 0.62 - h, bw - 8, h, 6); ctx.fillStyle = `hsl(${280 - i * 12},90%,${55 + v * 20}%)`; ctx.fill();
    }
  }
  // خشبة المسرح
  ctx.beginPath(); ctx.ellipse(W / 2, H * 0.9, W * 0.6, 110, 0, Math.PI, 0); ctx.lineTo(W * 1.1, H + 100); ctx.lineTo(-W * 0.1, H + 100); ctx.closePath(); fillOutline(ctx, '#3d2c5e', 6);
  glow(ctx, W / 2, H * 0.82, 260, 'rgba(255,240,200,0.5)', 0.6 + 0.4 * s.vocal);
  drawCharacter(ctx, W / 2, H * 0.9, 64, charOpts(s, { mic: true, shirt: '#ff006e', pose: s.vocal > 0.55 ? 'stand' : 'dance', t: s.beatT / 2, look: { x: 0, y: 0.1 }, mouth: s.vocal }));
  // أيدي الجمهور تقفز مع الضربات
  for (let i = 0; i < 22; i++) {
    const x = i * 62 + 10, up = Math.abs(Math.sin((s.beatT + i * 0.37) * Math.PI)) * 30;
    ctx.fillStyle = '#0d0d1a'; ctx.beginPath(); ctx.arc(x, H + 10, 40, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 14; ctx.strokeStyle = '#0d0d1a'; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x + 20, H - 10); ctx.lineTo(x + 30, H - 70 - up); ctx.stroke();
  }
  ctx.restore();
}

// ——— الوقت: ساعة عملاقة، عقرب الثواني يقفز مع كل ضربة، والكلمات تدور حولها ثم تستقر ———
export function clock(ctx, s) {
  const { W, H } = s;
  ctx.save();
  camera(ctx, W, H, { zoom: lerp(1.1, 0.96, easeInOut(s.p)), rot: lerp(0.05, 0, s.p), y: 20 });
  sky(ctx, W, H, ['#ffecd2', '#fcb69f']);
  // تروس
  const gear = (x, y, r, teeth, rot, col) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) { const a = (i / (teeth * 2)) * Math.PI * 2, rr = i % 2 ? r : r * 1.15; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); fillOutline(ctx, col, 4); ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); fillOutline(ctx, '#fff4e0', 4); ctx.restore();
  };
  gear(160, 160, 110, 12, s.t * 0.4, '#e9a46a'); gear(1110, 560, 140, 14, -s.t * 0.3, '#d98c5f'); gear(1150, 130, 70, 9, s.t * 0.7, '#f0b67f');
  const cx = W * 0.5, cy = H * 0.58, R = 215;
  ctx.beginPath(); ctx.arc(cx, cy, R + 24, 0, Math.PI * 2); fillOutline(ctx, '#8d5524', 7);
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); fillOutline(ctx, '#fffaf0', 5);
  ctx.font = '40px "Lalezar", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = INK;
  const nums = ['١٢', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩', '١٠', '١١'];
  nums.forEach((n, i) => { const a = (i / 12) * Math.PI * 2 - Math.PI / 2; ctx.fillText(n, cx + Math.cos(a) * (R - 40), cy + Math.sin(a) * (R - 40)); });
  // العقارب: الثواني تقفز مع كل ضربة فعلية
  const tick = s.beat.index + easeOutBack(clamp(s.beat.phase * 5));
  const hand = (a, len, w, col) => { ctx.save(); ctx.translate(cx, cy); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(0, 20); ctx.lineTo(0, -len); ctx.lineWidth = w + 6; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke(); ctx.restore(); };
  hand(s.t * 0.05, R * 0.5, 14, '#5d4037'); hand(s.t * 0.4, R * 0.75, 10, '#795548'); hand((tick / 60) * Math.PI * 2, R * 0.85, 4, '#e63946');
  ctx.beginPath(); ctx.arc(cx, cy, 16, 0, Math.PI * 2); fillOutline(ctx, '#e63946', 4);
  // الشخصية تجلس على حافة الساعة وتتأرجح
  ctx.save(); ctx.translate(cx + R * 0.72, cy + R * 0.72); ctx.rotate(Math.sin(s.t * 2) * 0.08);
  drawCharacter(ctx, 0, 0, 44, charOpts(s, { pose: 'sit', shirt: '#118ab2', look: { x: -0.7, y: -0.5 } }));
  ctx.restore();
  ctx.restore();
  // الكلمات: تدور حول الساعة ثم تستقر في الأعلى
  drawLyricWords(ctx, s, { x: W / 2, y: H * 0.1, w: W * 0.8, size: 70, maxRows: 1 }, {
    motion: 'fly', from: (i) => { const a = s.t * 2 + i; return { x: W / 2 + Math.cos(a) * 300, y: H * 0.58 + Math.sin(a) * 300 }; }, fill: '#fff', active: '#ffe066', appearDur: 0.45,
  });
}

// ——— الصحراء: كثبان وجمل وشخصية تمشي وحيدة، والكلمات تُخط على الرمل ———
export function desert(ctx, s) {
  const { W, H } = s;
  ctx.save();
  camera(ctx, W, H, { zoom: 1.05, x: lerp(-30, 30, s.p) });
  sky(ctx, W, H, ['#f6d365', '#fda085']);
  glow(ctx, W * 0.75, H * 0.25, 220, 'rgba(255,255,220,0.9)');
  ctx.beginPath(); ctx.arc(W * 0.75, H * 0.25, 70, 0, Math.PI * 2); fillOutline(ctx, '#fff4b8', 4);
  hills(ctx, W, H, H * 0.55, 40, 0.004, 0.5, '#e0a96d');
  // قافلة جمال بعيدة
  for (let i = 0; i < 3; i++) {
    const x = ((s.t * 18 + i * 70) % (W + 300)) - 150, y = H * 0.52;
    ctx.fillStyle = '#7a4a2a'; ctx.beginPath(); ctx.ellipse(x, y, 26, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(x - 4, y - 10, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(x + 20, y - 26, 6, 22); ctx.fillRect(x + 20, y - 28, 14, 7);
    for (const lx of [-16, -6, 8, 16]) ctx.fillRect(x + lx, y + 6, 4, 20 + Math.sin(s.t * 5 + lx) * 3);
  }
  hills(ctx, W, H, H * 0.72, 30, 0.006, 2, '#f0c27b');
  // صبار
  for (const [x, h] of [[120, 140], [1060, 110]]) {
    roundRect(ctx, x - 18, H * 0.75 - h, 36, h, 18); fillOutline(ctx, '#3c9d5d', 4);
    roundRect(ctx, x - 55, H * 0.75 - h * 0.7, 26, h * 0.4, 13); fillOutline(ctx, '#3c9d5d', 4);
    roundRect(ctx, x + 30, H * 0.75 - h * 0.85, 26, h * 0.45, 13); fillOutline(ctx, '#3c9d5d', 4);
  }
  // الشخصية تمشي مع ظلها
  ctx.save(); ctx.globalAlpha = 0.25; ctx.fillStyle = '#5a3a1a'; ctx.beginPath(); ctx.ellipse(W * 0.3 + 60, H * 0.9, 120, 16, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  drawCharacter(ctx, W * 0.3, H * 0.9, 56, charOpts(s, { pose: 'walk', shirt: '#9b5de5', scarf: '#f15bb5', look: { x: 1, y: 0 }, t: s.beatT / 2 }));
  // رياح ورمال متطايرة
  const rr = rng(55);
  ctx.fillStyle = 'rgba(255,240,200,0.7)';
  for (let i = 0; i < 80; i++) { const x = ((rr() * W + s.t * (150 + rr() * 200)) % (W + 100)) - 50, y = H * 0.4 + rr() * H * 0.6 + Math.sin(s.t * 3 + i) * 10; ctx.fillRect(x, y, 3, 2); }
  ctx.restore();
  drawLyricWords(ctx, s, { x: W * 0.62, y: H * 0.82, w: W * 0.62, size: 74, maxRows: 2 }, { motion: 'type', fill: '#8a5a2b', active: '#5a3410', stroke: 'rgba(255,240,200,0.8)', strokeW: 6, activeGlow: 'rgba(255,255,220,0.8)' });
}

// ——— النار: نار مخيم وشرر، والكلمات جمرات متوهجة تصعد من اللهب ———
export function fire(ctx, s) {
  const { W, H } = s;
  ctx.save();
  camera(ctx, W, H, { zoom: 1.04 + 0.02 * s.beat.pulse, x: Math.sin(s.t * 0.4) * 20 });
  sky(ctx, W, H, ['#0d0221', '#2a0a29', '#541388']);
  glow(ctx, W / 2, H * 0.8, 520, 'rgba(255,120,40,0.55)', 0.7 + 0.3 * s.energy);
  hills(ctx, W, H, H * 0.82, 10, 0.004, 0, '#1b0f24');
  // جذوع
  ctx.save(); ctx.translate(W / 2, H * 0.86);
  for (const r of [-0.25, 0.25]) { ctx.save(); ctx.rotate(r); roundRect(ctx, -110, -14, 220, 28, 14); fillOutline(ctx, '#6b3e26', 5); ctx.restore(); }
  // ألسنة اللهب (ضوضاء + طاقة الصوت)
  const flame = (scale, col) => {
    ctx.beginPath(); ctx.moveTo(-90 * scale, 0);
    for (let i = 0; i <= 20; i++) {
      const u = i / 20, x = lerp(-90, 90, u) * scale;
      const h = (Math.sin(u * Math.PI) * 220 + noise1(u * 5 + s.t * 4, 1) * 60) * scale * (0.8 + 0.4 * s.energy + 0.2 * s.beat.pulse);
      ctx.lineTo(x, -h);
    }
    ctx.lineTo(90 * scale, 0); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  };
  flame(1, '#ff4e00'); flame(0.72, '#ff9e00'); flame(0.45, '#ffe066');
  ctx.restore();
  // شرر
  const rr = rng(12);
  for (let i = 0; i < 50; i++) {
    const life = (s.t * (0.4 + rr() * 0.6) + rr()) % 1, x = W / 2 + (rr() - 0.5) * 160 + Math.sin(s.t * 3 + i) * 30 * life, y = H * 0.8 - life * 520;
    ctx.globalAlpha = 1 - life; ctx.fillStyle = rr() > 0.5 ? '#ffd166' : '#ff7b00'; ctx.beginPath(); ctx.arc(x, y, 2 + rr() * 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  drawCharacter(ctx, W * 0.24, H * 0.95, 58, charOpts(s, { pose: 'sit', shirt: '#ef476f', look: { x: 1, y: 0 }, skin: '#f2b48c' }));
  drawCharacter(ctx, W * 0.78, H * 0.95, 54, { t: s.t, beat: s.beat.pulse, pose: 'sit', shirt: '#118ab2', hair: '#111', facing: -1, look: { x: -1, y: 0 }, blink: blinkAt(s.t, 40), mouth: 0.05 });
  ctx.restore();
  drawLyricWords(ctx, s, { x: W / 2, y: H * 0.25, w: W * 0.8, size: 84, maxRows: 2 }, {
    motion: 'fly', from: () => ({ x: W / 2, y: H * 0.72 }), fill: '#ffd8a8', active: '#fff3b0', stroke: '#7a1f00', strokeW: 6, glow: 'rgba(255,120,0,0.9)', activeGlow: 'rgba(255,200,0,1)',
  });
}

// ——— الشروق: الشمس تصعد مع تقدم السطر، طيور، والشخصية ترفع يديها ———
export function sunrise(ctx, s) {
  const { W, H } = s;
  const rise = easeInOut(s.p);
  ctx.save();
  camera(ctx, W, H, { zoom: lerp(1.1, 1.0, rise), y: lerp(-20, 10, rise) });
  sky(ctx, W, H, [`hsl(${lerp(260, 200, rise)},70%,${lerp(30, 70, rise)}%)`, `hsl(${lerp(330, 40, rise)},90%,${lerp(55, 75, rise)}%)`, '#ffe8a3']);
  const sy = lerp(H * 0.75, H * 0.3, rise);
  ctx.save(); ctx.translate(W / 2, sy);
  for (let i = 0; i < 16; i++) { ctx.rotate((Math.PI * 2) / 16); ctx.fillStyle = `rgba(255,240,180,${0.15 + 0.1 * s.beat.pulse})`; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-30, -900); ctx.lineTo(30, -900); ctx.fill(); }
  ctx.restore();
  glow(ctx, W / 2, sy, 300, 'rgba(255,240,160,0.9)');
  ctx.beginPath(); ctx.arc(W / 2, sy, 110 + 6 * s.beat.pulse, 0, Math.PI * 2); fillOutline(ctx, '#ffd23f', 6);
  // طيور على شكل V
  for (let i = 0; i < 7; i++) {
    const bx = ((s.t * 50 + i * 40) % (W + 300)) - 150 + Math.abs(i - 3) * 30, by = 150 + Math.abs(i - 3) * 20, f = Math.sin(s.t * 9 + i) * 10;
    ctx.beginPath(); ctx.moveTo(bx - 16, by - f); ctx.quadraticCurveTo(bx - 6, by - 8, bx, by); ctx.quadraticCurveTo(bx + 6, by - 8, bx + 16, by - f); outline(ctx, 3);
  }
  hills(ctx, W, H, H * 0.7, 30, 0.004, 2, '#3a7d44');
  hills(ctx, W, H, H * 0.8, 20, 0.007, 5, '#5aa65a');
  drawCharacter(ctx, W * 0.22, H * 0.92, 60, charOpts(s, { shirt: '#ffb703', armsUp: 0.4 + 0.5 * rise, look: { x: 1, y: -1 } }));
  ctx.restore();
  drawLyricWords(ctx, s, { x: W * 0.55, y: lerp(H * 0.6, H * 0.5, rise), w: W * 0.75, size: 84, maxRows: 2 }, { motion: 'rise', fill: '#fff', active: '#fff3b0', glow: 'rgba(255,160,0,0.7)', appearDur: 0.4 });
}

// ——— فاصل موسيقي: حلبة رقص وكرة ديسكو، الشخصية ترقص على الضربات الحقيقية ———
export function interlude(ctx, s) {
  const { W, H } = s;
  ctx.save();
  camera(ctx, W, H, { zoom: 1 + 0.04 * s.beat.downPulse, rot: Math.sin(s.beatT * Math.PI / 2) * 0.02 });
  sky(ctx, W, H, ['#10002b', '#240046', '#3c096c']);
  // أرضية بلاطات تضيء مع الضربات
  for (let r = 0; r < 4; r++) for (let c = 0; c < 10; c++) {
    const on = (r * 3 + c + s.beat.index) % 4 === 0;
    ctx.fillStyle = on ? ['#ff006e', '#8338ec', '#3a86ff', '#ffbe0b'][(c + r) % 4] : '#1b1035';
    const y0 = H * 0.62 + r * 70, sk = r * 30;
    ctx.beginPath(); ctx.moveTo(c * 140 - 60 - sk, y0); ctx.lineTo(c * 140 + 70 - sk, y0); ctx.lineTo(c * 140 + 70 - sk - 30, y0 + 68); ctx.lineTo(c * 140 - 60 - sk - 30, y0 + 68); ctx.closePath(); ctx.fill(); outline(ctx, 3, '#000');
  }
  // كرة ديسكو
  ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, 70); outline(ctx, 3, '#aaa');
  ctx.save(); ctx.beginPath(); ctx.arc(W / 2, 130, 60, 0, Math.PI * 2); ctx.fillStyle = '#ccc'; ctx.fill(); ctx.clip();
  for (let y = 70; y < 190; y += 14) for (let x = W / 2 - 60; x < W / 2 + 60; x += 14) { ctx.fillStyle = (Math.floor(x / 14 + y / 14 + s.t * 6) % 3) ? '#eee' : '#88f'; ctx.fillRect(x + 1, y + 1, 12, 12); }
  ctx.restore(); ctx.beginPath(); ctx.arc(W / 2, 130, 60, 0, Math.PI * 2); outline(ctx, 4);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 10; i++) { const a = s.t * 0.8 + i * 0.63; glow(ctx, W / 2 + Math.cos(a) * 500, 300 + Math.sin(a * 1.3) * 200, 60, ['rgba(255,0,110,0.5)', 'rgba(58,134,255,0.5)'][i % 2], 0.5 + 0.5 * s.beat.pulse); }
  ctx.restore();
  // معادل
  const n = s.bandCount || 16;
  for (let i = 0; i < n; i++) { const v = s.band(i), bw = W / n; ctx.fillStyle = `hsla(${200 + i * 10},90%,60%,0.6)`; ctx.fillRect(i * bw + 3, H * 0.6 - v * 180, bw - 6, v * 180); }
  drawCharacter(ctx, W / 2, H * 0.88, 70, charOpts(s, { pose: 'dance', t: s.beatT / 2, shirt: '#ff006e', mouth: s.vocal * 0.5, look: { x: Math.sin(s.beatT * Math.PI / 2), y: 0 } }));
  drawCharacter(ctx, W * 0.2, H * 0.9, 50, { t: s.beatT / 2 + 0.25, beat: s.beat.pulse, pose: 'dance', shirt: '#3a86ff', hair: '#111', blink: blinkAt(s.t, 3) });
  drawCharacter(ctx, W * 0.8, H * 0.9, 50, { t: s.beatT / 2 + 0.5, beat: s.beat.pulse, pose: 'dance', shirt: '#ffbe0b', hair: '#6b2', facing: -1, blink: blinkAt(s.t, 9) });
  ctx.restore();
}

// ——— خاتمة ———
export function outro(ctx, s) {
  const { W, H } = s;
  sky(ctx, W, H, ['#1a1a40', '#4b2a7a', '#ff7a8a']);
  const rr = rng(2);
  for (let i = 0; i < 90; i++) { ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(s.t + i)); ctx.fillStyle = '#fff'; starPath(ctx, rr() * W, rr() * H * 0.6, 1 + rr() * 3, 4, 0.4); ctx.fill(); }
  ctx.globalAlpha = 1;
  hills(ctx, W, H, H * 0.78, 18, 0.005, 0, '#2d1b4e');
  const walk = clamp(s.local / Math.max(2, s.dur));
  drawCharacter(ctx, lerp(W * 0.3, W * 0.75, walk), H * 0.86, 50, charOpts(s, { pose: 'walk', shirt: '#ff6b6b', look: { x: 1, y: 0 }, mouth: 0 }));
  ctx.save(); ctx.globalAlpha = clamp(s.local / 1.2);
  ctx.font = '110px "Lalezar", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
  ctx.lineWidth = 12; ctx.strokeStyle = INK; ctx.strokeText(s.title || 'شفت كلام', W / 2, H * 0.36); ctx.fillStyle = '#ffe066'; ctx.fillText(s.title || 'شفت كلام', W / 2, H * 0.36);
  ctx.restore();
  // انغلاق دائري في النهاية
  const close = clamp((s.local - (s.dur - 1.2)) / 1.2);
  if (close > 0) { ctx.save(); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(lerp(W * 0.3, W * 0.75, walk), H * 0.7, Math.max(0, 900 * (1 - close)), 0, Math.PI * 2, true); ctx.fill('evenodd'); ctx.restore(); }
}
