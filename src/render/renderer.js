import { beatInfo, sampleAt, snapToBeat, lowerBound } from '../audio/analysis.js';
import { wordStates } from './text.js';
import { clamp, lerp, rng, easeInOut, INK } from './util.js';
import * as A from './scenes/scenes-a.js';
import * as B from './scenes/scenes-b.js';
import { room } from './scenes/room.js';

export const SCENES = { ...A, ...B, room };
export const TRANSITIONS = ['iris', 'wipe', 'zoom', 'ink', 'slide', 'flash'];
export const TRANSITION_NAMES = { auto: 'تلقائي', iris: 'دائرة (Iris)', wipe: 'مسح متموج', zoom: 'تكبير عبر', ink: 'بقع حبر', slide: 'انزلاق', flash: 'وميض على الضربة', cut: 'قطع مباشر' };

export const BASE_W = 1280, BASE_H = 720;

/**
 * بناء اللقطات من الأسطر: كل سطر لقطة، تبدأ قبيل أول كلمة وتُلصق بأقرب ضربة إيقاع.
 * الفجوات الطويلة بين الأسطر تصبح «فاصلًا موسيقيًا»، وقبل أول سطر مقدمة وبعد آخر سطر خاتمة.
 */
export function buildShots(lines, analysis, duration) {
  const beats = analysis?.beats || [];
  const timed = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.start != null && l.end != null).sort((a, b) => a.l.start - b.l.start);
  const shots = [];
  if (!timed.length) return [{ scene: 'intro', start: 0, end: duration, lineIndex: -1, transition: null }];
  const period = analysis?.bpm ? 60 / analysis.bpm : 0.5;
  const boundary = (k) => {
    const l = timed[k].l, prev = timed[k - 1]?.l;
    const target = l.start - Math.min(0.35, period * 0.6);
    let b = snapToBeat(beats, target, 0.3);
    if (b > l.start) b = l.start - 0.05;
    if (prev) b = Math.max(b, Math.min(prev.end, l.start - 0.05));
    return Math.max(0, b);
  };
  const first = boundary(0);
  if (first > 0.4) shots.push({ scene: 'intro', start: 0, end: first, lineIndex: -1 });
  for (let k = 0; k < timed.length; k++) {
    const { l, i } = timed[k];
    const start = k === 0 && first <= 0.4 ? 0 : boundary(k);
    const nextB = k + 1 < timed.length ? boundary(k + 1) : null;
    const hold = Math.max(period * 2, 1.0);
    if (nextB == null) {
      const end = Math.min(duration, snapToBeat(beats, l.end + hold, 0.4));
      shots.push({ scene: l.scene || 'city', start, end, lineIndex: i, transition: l.transition });
      if (duration - end > 0.5) shots.push({ scene: 'outro', start: end, end: duration, lineIndex: -1 });
    } else if (nextB - l.end > 5) {
      const end = snapToBeat(beats, l.end + hold, 0.4);
      shots.push({ scene: l.scene || 'city', start, end, lineIndex: i, transition: l.transition });
      shots.push({ scene: 'interlude', start: end, end: nextB, lineIndex: -1 });
    } else {
      shots.push({ scene: l.scene || 'city', start, end: nextB, lineIndex: i, transition: l.transition });
    }
  }
  // نوع الانتقال: محدد من المستخدم أو تلقائي (وميض عند ضربة قوية في نقطة القطع)
  shots.forEach((sh, k) => {
    if (k === 0) { sh.transition = null; return; }
    let type = sh.transition && sh.transition !== 'auto' ? sh.transition : null;
    if (!type) {
      const strong = (analysis?.hits || []).some((h) => h.s > 0.6 && Math.abs(h.t - sh.start) < 0.06);
      type = strong ? 'flash' : TRANSITIONS[(k * 7 + 3) % (TRANSITIONS.length - 1)];
    }
    sh.transition = type;
    sh.tDur = type === 'cut' ? 0 : clamp(period, 0.35, 0.7);
  });
  return shots;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.bufA = document.createElement('canvas');
    this.bufB = document.createElement('canvas');
    this.project = { lines: [], title: 'شفت كلام' };
    this.analysis = null;
    this.eyes = null;
    this.shots = [];
    this.duration = 0;
  }

  setData({ project, analysis, eyes, duration }) {
    if (project) this.project = project;
    if (analysis !== undefined) this.analysis = analysis;
    if (eyes !== undefined) this.eyes = eyes;
    if (duration) this.duration = duration;
    this.rebuild();
  }

  rebuild() {
    this.shots = buildShots(this.project.lines, this.analysis, this.duration || this.analysis?.duration || 10);
  }

  shotAt(t) {
    const sh = this.shots;
    let i = lowerBound(sh, t + 1e-6, (s) => s.start) - 1;
    return clamp(i, 0, sh.length - 1);
  }

  context(shot, k, t, W = BASE_W, H = BASE_H) {
    const a = this.analysis;
    const lines = this.project.lines;
    const line = shot.lineIndex >= 0 ? lines[shot.lineIndex] : null;
    const beat = beatInfo(a?.beats, a?.downbeats, t);
    const fr = a?.frameRate || 86, off = a?.timeOffset || 0;
    let hit = 0, hitAge = 1;
    if (a?.hits?.length) {
      const hi = lowerBound(a.hits, t, (h) => h.t) - 1;
      if (hi >= 0) { hitAge = t - a.hits[hi].t; hit = a.hits[hi].s * Math.exp(-hitAge / 0.15); }
    }
    const bandCount = a?.bandCount || 16;
    const fi = Math.max(0, Math.round((t - off) * fr));
    const band = (b) => (a?.bands ? (a.bands[Math.min(a.bands.length - bandCount + b, fi * bandCount + b)] || 0) / 255 : 0.3 + 0.3 * Math.sin(t * 4 + b));
    let prevLine = null;
    for (let j = shot.lineIndex - 1; j >= 0; j--) if (lines[j]?.start != null) { prevLine = lines[j].text; break; }
    return {
      W, H, t, local: t - shot.start, dur: shot.end - shot.start, p: clamp((t - shot.start) / Math.max(0.01, shot.end - shot.start)),
      line, prevLine, words: wordStates(line, t, this.project.textMode || (this.style() === 'room' ? 'sentence' : 'words')), textMode: this.project.textMode || (this.style() === 'room' ? 'sentence' : 'words'),
      lineIn: line ? clamp((t - shot.start) / Math.max(0.2, line.start - shot.start + 0.3)) : 1,
      lineOut: line ? clamp((t - line.end - 0.15) / 0.4) : 0,
      beat, beatT: beat.index >= 0 ? beat.index + beat.phase : t * 2,
      energy: a ? sampleAt(a.energy, fr, t, off) : 0.5,
      vocal: a ? clamp((sampleAt(a.vocal, fr, t, off) - 0.4) * 1.8) : 0,
      hit, hitAge, band, bandCount,
      eyes: this.eyes, seed: k * 13 + 1, title: this.project.title,
    };
  }

  // الأبعاد المنطقية للرسم حسب المقاس: عمودي 720×1280 أو أفقي 1280×720
  dims() { return this.project.aspect === '16:9' ? [1280, 720] : [720, 1280]; }
  style() { return this.project.style || 'room'; }

  drawShot(ctx, k, t, W = BASE_W, H = BASE_H) {
    const shot = this.shots[k];
    const fn = SCENES[shot.scene] || SCENES.city;
    ctx.save();
    try { fn(ctx, this.context(shot, k, t, W, H)); }
    catch (e) { console.error('scene error', shot.scene, e); ctx.fillStyle = '#300'; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  }

  // نمط «الغرفة»: مكان واحد؛ تغيّر السطر يمزج المزاج السابق بالجديد بدل القطع
  drawRoom(ctx, k, t, W, H) {
    const shot = this.shots[k];
    const moodOf = (sh) => (!sh || sh.lineIndex < 0 ? 'neutral' : sh.scene);
    const c = this.context(shot, k, t, W, H);
    c.mood = moodOf(shot); c.prevMood = moodOf(this.shots[k - 1]); c.moodF = (t - shot.start) / 0.7;
    ctx.save();
    try { SCENES.room(ctx, c); }
    catch (e) { console.error('scene error room', e); ctx.fillStyle = '#300'; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  }

  ensureBuf(buf, w, h, lw = BASE_W, lh = BASE_H) {
    if (buf.width !== w || buf.height !== h) { buf.width = w; buf.height = h; }
    const c = buf.getContext('2d');
    c.setTransform(w / lw, 0, 0, h / lh, 0, 0);
    return c;
  }

  // رسم المشاهد الكرتونية (أفقية الأصل) في سياق بحجم w×h مع الانتقالات
  renderCartoon(ctx, k, t, w, h) {
    const shot = this.shots[k], next = this.shots[k + 1];
    let trans = null;
    if (next && next.tDur && t > next.start - next.tDur / 2) trans = { from: k, to: k + 1, type: next.transition, p: (t - (next.start - next.tDur / 2)) / next.tDur };
    else if (shot.tDur && k > 0 && t < shot.start + shot.tDur / 2) trans = { from: k - 1, to: k, type: shot.transition, p: (t - (shot.start - shot.tDur / 2)) / shot.tDur };
    if (!trans) {
      ctx.setTransform(w / BASE_W, 0, 0, h / BASE_H, 0, 0);
      this.drawShot(ctx, k, t);
    } else {
      const ca = this.ensureBuf(this.bufA, w, h), cb = this.ensureBuf(this.bufB, w, h);
      ca.clearRect(0, 0, BASE_W, BASE_H); cb.clearRect(0, 0, BASE_W, BASE_H);
      this.drawShot(ca, trans.from, t);
      this.drawShot(cb, trans.to, t);
      composite(ctx, this.bufA, this.bufB, trans.type, easeInOut(clamp(trans.p)), w, h, trans.to);
    }
    return trans;
  }

  render(t) {
    const { ctx, canvas } = this;
    if (!this.shots.length) this.rebuild();
    const W = canvas.width, H = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const k = this.shotAt(t);
    let trans = null;
    if (this.style() === 'room') {
      const [lw, lh] = this.dims();
      ctx.setTransform(W / lw, 0, 0, H / lh, 0, 0);
      this.drawRoom(ctx, k, t, lw, lh);
      return { shot: k, transition: null };
    }
    if (W >= H) {
      trans = this.renderCartoon(ctx, k, t, W, H);
      this.post(t, W, H);
    } else {
      // المشاهد الكرتونية الأفقية داخل إطار عمودي: خلفية مكبّرة ضبابية + المشهد بعرض الشاشة
      if (!this.bufF) this.bufF = document.createElement('canvas');
      const fh = Math.round((W * 9) / 16);
      const fc = this.ensureBuf(this.bufF, W, fh, W, fh);
      fc.clearRect(0, 0, W, fh);
      trans = this.renderCartoon(fc, k, t, W, fh);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const cw = (H * 16) / 9;
      ctx.filter = 'blur(18px) brightness(0.55)';
      ctx.drawImage(this.bufF, (W - cw) / 2, 0, cw, H);
      ctx.filter = 'none';
      ctx.drawImage(this.bufF, 0, (H - fh) / 2);
      this.post(t, W, H);
    }
    return { shot: k, transition: trans };
  }

  // مؤثرات نهائية: إطار مظلل ونبضة ضوء على الضربة الأولى من كل مازورة
  post(t, W, H) {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const b = beatInfo(this.analysis?.beats, this.analysis?.downbeats, t);
    if (b.downPulse > 0.05) { ctx.fillStyle = `rgba(255,255,255,${0.06 * b.downPulse})`; ctx.fillRect(0, 0, W, H); }
  }
}

function composite(ctx, A, B, type, p, W, H, seed) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const diag = Math.hypot(W, H);
  switch (type) {
    case 'iris': {
      ctx.drawImage(A, 0, 0);
      ctx.save(); ctx.beginPath(); ctx.arc(W / 2, H / 2, diag * 0.6 * p, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(B, 0, 0); ctx.restore();
      ctx.beginPath(); ctx.arc(W / 2, H / 2, diag * 0.6 * p, 0, Math.PI * 2); ctx.lineWidth = 10 * (W / BASE_W); ctx.strokeStyle = INK; if (p > 0 && p < 1) ctx.stroke();
      break;
    }
    case 'wipe': {
      // مسح من اليمين إلى اليسار (اتجاه القراءة العربية) بحافة متموجة
      ctx.drawImage(A, 0, 0);
      ctx.save(); ctx.beginPath();
      const edge = lerp(W * 1.15, -W * 0.15, p);
      ctx.moveTo(W, 0); ctx.lineTo(edge, 0);
      for (let y = 0; y <= H; y += 20) ctx.lineTo(edge + Math.sin(y * 0.02 + p * 8) * 50 * (W / BASE_W), y);
      ctx.lineTo(W, H); ctx.closePath(); ctx.clip(); ctx.drawImage(B, 0, 0); ctx.restore();
      break;
    }
    case 'zoom': {
      ctx.save(); ctx.globalAlpha = 1 - p; const s = 1 + p * 0.8; ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.drawImage(A, -W / 2, -H / 2); ctx.restore();
      ctx.save(); ctx.globalAlpha = p; const s2 = lerp(0.6, 1, p); ctx.translate(W / 2, H / 2); ctx.scale(s2, s2); ctx.rotate((1 - p) * 0.15); ctx.drawImage(B, -W / 2, -H / 2); ctx.restore();
      break;
    }
    case 'ink': {
      ctx.drawImage(A, 0, 0);
      const r = rng(seed * 31 + 5);
      ctx.save(); ctx.beginPath();
      for (let i = 0; i < 9; i++) { const x = r() * W, y = r() * H, rad = diag * 0.35 * clamp(p * 1.6 - r() * 0.6); if (rad > 0) { ctx.moveTo(x + rad, y); ctx.arc(x, y, rad, 0, Math.PI * 2); } }
      ctx.clip(); ctx.drawImage(B, 0, 0); ctx.restore();
      break;
    }
    case 'slide': {
      // اللقطة الجديدة تدخل من اليسار والقديمة تخرج يمينًا (تدفق القراءة العربية)
      const x = p * W;
      ctx.drawImage(A, x, 0); ctx.drawImage(B, x - W, 0);
      ctx.fillStyle = INK; ctx.fillRect(x - 6, 0, 12, H);
      break;
    }
    case 'flash': {
      ctx.drawImage(p < 0.5 ? A : B, 0, 0);
      ctx.fillStyle = `rgba(255,255,255,${1 - Math.abs(p - 0.5) * 2})`; ctx.fillRect(0, 0, W, H);
      break;
    }
    default:
      ctx.drawImage(p < 0.5 ? A : B, 0, 0);
  }
}
