// تحليل الصوت: الضربات الإيقاعية، البدايات (onsets)، المقاطع الصوتية (الغناء)، والتوقفات.
// دوال صافية تعمل على Float32Array، فتعمل في المتصفح (Worker) وفي Node للاختبار.

export const DEFAULTS = { targetRate: 22050, frameSize: 1024, hop: 256, bands: 16 };

export function toMono(channels) {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length;
  const out = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i] / channels.length;
  return out;
}

export function decimate(x, factor) {
  if (factor <= 1) return x;
  const n = Math.floor(x.length / factor);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < factor; k++) s += x[i * factor + k];
    out[i] = s / factor;
  }
  return out;
}

function makeFFT(n) {
  const levels = Math.log2(n);
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < levels; b++) r |= ((i >> b) & 1) << (levels - 1 - b);
    rev[i] = r;
  }
  const cos = new Float32Array(n / 2), sin = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = Math.sin((2 * Math.PI * i) / n); }
  return function fft(re, im) {
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const a = i + j, b = a + half;
          const tre = re[b] * cos[k] + im[b] * sin[k];
          const tim = -re[b] * sin[k] + im[b] * cos[k];
          re[b] = re[a] - tre; im[b] = im[a] - tim;
          re[a] += tre; im[a] += tim;
        }
      }
    }
  };
}

function movingAverage(x, radius) {
  const n = x.length, out = new Float32Array(n);
  let s = 0, c = 0;
  for (let i = 0; i < Math.min(n, radius); i++) { s += x[i]; c++; }
  for (let i = 0; i < n; i++) {
    const add = i + radius, rem = i - radius - 1;
    if (add < n) { s += x[add]; c++; }
    if (rem >= 0) { s -= x[rem]; c--; }
    out[i] = s / c;
  }
  return out;
}

export function percentile(x, p) {
  const a = Array.from(x).sort((u, v) => u - v);
  if (!a.length) return 0;
  return a[Math.min(a.length - 1, Math.max(0, Math.round((p / 100) * (a.length - 1))))];
}

function normalize01(x, lo, hi) {
  const out = new Float32Array(x.length), d = hi - lo || 1;
  for (let i = 0; i < x.length; i++) out[i] = Math.min(1, Math.max(0, (x[i] - lo) / d));
  return out;
}

// الحساب الطيفي: onset (spectral flux)، طاقة نطاق الصوت البشري (مع فصل المنتصف/الجوانب للستيريو)، وأشرطة طيفية للتصوير.
export function computeFeatures(channels, sampleRate, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const factor = Math.max(1, Math.round(sampleRate / o.targetRate));
  const sr = sampleRate / factor;
  const stereo = channels.length >= 2;
  const mid = decimate(stereo ? toMono([channels[0], channels[1]]) : channels[0], factor);
  let side = null;
  if (stereo) {
    const L = channels[0], R = channels[1], s = new Float32Array(L.length);
    for (let i = 0; i < L.length; i++) s[i] = (L[i] - R[i]) / 2;
    side = decimate(s, factor);
  }
  const N = o.frameSize, hop = o.hop;
  const frames = Math.max(1, Math.floor((mid.length - N) / hop) + 1);
  const fft = makeFFT(N);
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const binHz = sr / N, nb = N / 2;
  const vLo = Math.round(250 / binHz), vHi = Math.round(3500 / binHz);
  const lowHi = Math.max(2, Math.round(180 / binHz));
  const fluxHi = Math.min(nb, Math.round(8000 / binHz));
  // حدود الأشرطة اللوغاريتمية من 40Hz إلى 10kHz
  const bandEdges = [];
  for (let b = 0; b <= o.bands; b++) bandEdges.push(Math.min(nb, Math.max(1, Math.round((40 * Math.pow(250, b / o.bands)) / binHz))));

  const flux = new Float32Array(frames), lowFlux = new Float32Array(frames);
  const vocalRaw = new Float32Array(frames), rms = new Float32Array(frames);
  const bandsRaw = new Float32Array(frames * o.bands);
  let prev = new Float32Array(nb), cur = new Float32Array(nb);
  const re = new Float32Array(N), im = new Float32Array(N);
  const re2 = new Float32Array(N), im2 = new Float32Array(N);

  for (let f = 0; f < frames; f++) {
    const off = f * hop;
    let e = 0;
    for (let i = 0; i < N; i++) { const v = mid[off + i]; e += v * v; re[i] = v * win[i]; im[i] = 0; }
    rms[f] = Math.sqrt(e / N);
    fft(re, im);
    if (side) {
      for (let i = 0; i < N; i++) { re2[i] = side[off + i] * win[i]; im2[i] = 0; }
      fft(re2, im2);
    }
    let fl = 0, lf = 0, vb = 0;
    for (let k = 1; k < nb; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      const m = Math.log1p(100 * Math.sqrt(p));
      cur[k] = m;
      const d = m - prev[k];
      if (d > 0) { if (k < fluxHi) fl += d; if (k < lowHi) lf += d; }
      // المحتوى المتمركز لكل تردد: طاقة المنتصف ناقص طاقة الجوانب (الغناء غالبًا في المنتصف)
      if (k >= vLo && k < vHi) vb += side ? Math.max(0, p - (re2[k] * re2[k] + im2[k] * im2[k])) : p;
    }
    for (let b = 0; b < o.bands; b++) {
      let s = 0;
      for (let k = bandEdges[b]; k < Math.max(bandEdges[b] + 1, bandEdges[b + 1]); k++) s += cur[k];
      bandsRaw[f * o.bands + b] = s / Math.max(1, bandEdges[b + 1] - bandEdges[b]);
    }
    flux[f] = fl; lowFlux[f] = lf;
        vocalRaw[f] = Math.log(1e-9 + vb);
    const t = prev; prev = cur; cur = t;
  }
  const frameRate = sr / hop;
  // زمن كل إطار = منتصف نافذته
  return { sampleRate: sr, frameRate, timeOffset: N / 2 / sr, hop, frames, duration: mid.length / sr, flux, lowFlux, vocalRaw, rms, bandsRaw, bands: o.bands, stereo };
}

export function onsetEnvelope(flux, frameRate) {
  const base = movingAverage(flux, Math.max(1, Math.round(frameRate * 0.15)));
  const o = new Float32Array(flux.length);
  let s = 0, s2 = 0;
  for (let i = 0; i < flux.length; i++) { o[i] = Math.max(0, flux[i] - base[i]); s += o[i]; s2 += o[i] * o[i]; }
  const mean = s / o.length, sd = Math.sqrt(Math.max(1e-12, s2 / o.length - mean * mean));
  for (let i = 0; i < o.length; i++) o[i] /= sd;
  return o;
}

// تقدير الإيقاع بالترابط الذاتي مع أولوية لوغاريتمية حول 120 BPM
export function estimateTempo(onset, frameRate, { min = 60, max = 200 } = {}) {
  const n = onset.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += onset[i];
  mean /= n;
  const maxLag = Math.min(n - 2, Math.ceil((60 * frameRate) / min));
  const ac = new Float32Array(maxLag + 2);
  for (let lag = 1; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += (onset[i] - mean) * (onset[i + lag] - mean);
    ac[lag] = s / (n - lag);
  }
  let best = -Infinity, bestLag = Math.round((60 * frameRate) / 120);
  const minLag = Math.max(2, Math.floor((60 * frameRate) / max));
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * frameRate) / lag;
    const w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));
    const v = ac[lag] * w;
    if (v > best && ac[lag] >= ac[lag - 1] && ac[lag] >= ac[lag + 1]) { best = v; bestLag = lag; }
  }
  const a = ac[bestLag - 1], b = ac[bestLag], c = ac[bestLag + 1];
  const den = a - 2 * b + c;
  const frac = den !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0;
  const period = bestLag + frac;
  return { bpm: (60 * frameRate) / period, period };
}

// تتبع الضربات بالبرمجة الديناميكية (Ellis 2007)
export function trackBeats(onset, period, tightness = 100) {
  const n = onset.length;
  const score = new Float32Array(n), back = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, Math.round(i - 2 * period)), hi = Math.round(i - period / 2);
    let best = -Infinity, arg = -1;
    for (let p = lo; p <= hi; p++) {
      const r = Math.log((i - p) / period);
      const v = score[p] - tightness * r * r;
      if (v > best) { best = v; arg = p; }
    }
    if (arg >= 0 && best > 0) { score[i] = onset[i] + best; back[i] = arg; } else score[i] = onset[i];
  }
  let end = n - 1, bestEnd = -Infinity;
  for (let i = Math.max(0, n - Math.round(period)); i < n; i++) if (score[i] > bestEnd) { bestEnd = score[i]; end = i; }
  const beats = [];
  for (let i = end; i >= 0; i = back[i]) beats.push(i);
  beats.reverse();
  // إكمال الضربات في البداية إن انقطع المسار
  while (beats.length && beats[0] - period > 0) beats.unshift(Math.round(beats[0] - period));
  return beats;
}

export function pickDownbeatPhase(beatFrames, lowOnset) {
  let best = -Infinity, phase = 0;
  for (let k = 0; k < 4; k++) {
    let s = 0, c = 0;
    for (let i = k; i < beatFrames.length; i += 4) { s += lowOnset[beatFrames[i]] || 0; c++; }
    const v = c ? s / c : 0;
    if (v > best) { best = v; phase = k; }
  }
  return phase;
}

export function detectHits(onset, frameRate, k = 1.5) {
  let s = 0, s2 = 0;
  for (const v of onset) { s += v; s2 += v * v; }
  const mean = s / onset.length, sd = Math.sqrt(Math.max(1e-12, s2 / onset.length - mean * mean));
  const thr = mean + k * sd, hits = [], r = 3;
  let max = 0;
  for (const v of onset) max = Math.max(max, v);
  for (let i = r; i < onset.length - r; i++) {
    const v = onset[i];
    if (v < thr) continue;
    let peak = true;
    for (let j = i - r; j <= i + r; j++) if (onset[j] > v) { peak = false; break; }
    if (peak) hits.push({ t: i / frameRate, s: Math.min(1, v / max) });
  }
  return hits;
}

// عتبة Otsu: تفصل تلقائيًا بين مستوى الخلفية ومستوى الغناء في منحنى لوغاريتمي
export function otsuThreshold(x, bins = 64) {
  let lo = Infinity, hi = -Infinity;
  for (const v of x) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (hi <= lo) return lo;
  const h = new Float64Array(bins);
  for (const v of x) h[Math.min(bins - 1, Math.floor(((v - lo) / (hi - lo)) * bins))]++;
  let total = 0, sumAll = 0;
  for (let i = 0; i < bins; i++) { total += h[i]; sumAll += i * h[i]; }
  let wB = 0, sumB = 0, best = -1, arg = 0;
  for (let i = 0; i < bins; i++) {
    wB += h[i]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += i * h[i];
    const mB = sumB / wB, mF = (sumAll - sumB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
    if (v > best) { best = v; arg = i; }
  }
  return lo + ((arg + 1) / bins) * (hi - lo);
}

// منحنى «احتمال الغناء» 0..1 حيث 0.5 = عتبة Otsu
export function vocalCurve(vocalRaw, frameRate) {
  const sm = movingAverage(vocalRaw, Math.max(1, Math.round(frameRate * 0.08)));
  const lo = percentile(sm, 3), hi = percentile(sm, 98), thr = otsuThreshold(sm);
  const out = new Float32Array(sm.length);
  for (let i = 0; i < sm.length; i++) {
    const v = sm[i];
    out[i] = v < thr ? 0.5 * Math.max(0, (v - lo) / (thr - lo || 1)) : 0.5 + 0.5 * Math.min(1, (v - thr) / (hi - thr || 1));
  }
  return out;
}

// اكتشاف مناطق الغناء بعتبة مع تخلّف (hysteresis) ودمج الفجوات الصغيرة
export function detectVocalSegments(curve, frameRate, { threshold = 0.5, minDur = 0.25, mergeGap = 0.18 } = {}) {
  const on = threshold, off = threshold * 0.85;
  let segs = [], active = false, st = 0;
  for (let i = 0; i < curve.length; i++) {
    if (!active && curve[i] >= on) { active = true; st = i; }
    else if (active && curve[i] < off) { active = false; segs.push([st, i]); }
  }
  if (active) segs.push([st, curve.length]);
  const merged = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (last && (s[0] - last[1]) / frameRate < mergeGap) last[1] = s[1];
    else merged.push([...s]);
  }
  return merged.filter((s) => (s[1] - s[0]) / frameRate >= minDur).map(([a, b]) => ({ start: a / frameRate, end: b / frameRate }));
}

export function detectSilences(rms, frameRate, { minDur = 0.3 } = {}) {
  const lo = percentile(rms, 2), hi = percentile(rms, 95);
  const thr = lo + (hi - lo) * 0.06;
  const out = [];
  let st = -1;
  for (let i = 0; i <= rms.length; i++) {
    const quiet = i < rms.length && rms[i] <= thr;
    if (quiet && st < 0) st = i;
    if (!quiet && st >= 0) { if ((i - st) / frameRate >= minDur) out.push({ start: st / frameRate, end: i / frameRate }); st = -1; }
  }
  return out;
}

export function analyzeAudio(channels, sampleRate, opts = {}) {
  const f = computeFeatures(channels, sampleRate, opts);
  const onset = onsetEnvelope(f.flux, f.frameRate);
  const low = onsetEnvelope(f.lowFlux, f.frameRate);
  const { bpm, period } = estimateTempo(onset, f.frameRate);
  const beatFrames = trackBeats(onset, period);
  const phase = pickDownbeatPhase(beatFrames, low);
  const off = f.timeOffset;
  const shift = (seg) => ({ start: seg.start + off, end: seg.end + off });
  const beats = beatFrames.map((b) => b / f.frameRate + off);
  const downbeats = beats.filter((_, i) => i % 4 === phase);
  const vocal = vocalCurve(f.vocalRaw, f.frameRate);
  const lo = percentile(f.rms, 5), hi = percentile(f.rms, 98);
  const energy = normalize01(f.rms, lo, hi);
  let bmax = 0;
  for (const v of f.bandsRaw) bmax = Math.max(bmax, v);
  const bandsQ = new Uint8Array(f.bandsRaw.length);
  for (let i = 0; i < bandsQ.length; i++) bandsQ[i] = Math.round((255 * f.bandsRaw[i]) / (bmax || 1));
  let omax = 0;
  for (const v of onset) omax = Math.max(omax, v);
  const onsetN = new Float32Array(onset.length);
  for (let i = 0; i < onset.length; i++) onsetN[i] = onset[i] / (omax || 1);
  return {
    version: 1,
    duration: f.duration,
    frameRate: f.frameRate,
    timeOffset: off,
    stereo: f.stereo,
    bpm,
    beats,
    downbeats,
    hits: detectHits(onset, f.frameRate).map((h) => ({ t: h.t + off, s: h.s })),
    onset: onsetN,
    energy,
    vocal,
    bands: bandsQ,
    bandCount: f.bands,
    segments: detectVocalSegments(vocal, f.frameRate, opts.segment).map(shift),
    silences: detectSilences(f.rms, f.frameRate).map(shift),
  };
}

// أدوات استعلام زمنية تُستخدم في العرض
export function sampleAt(arr, frameRate, t, offset = 0) {
  if (!arr || !arr.length) return 0;
  const x = (t - offset) * frameRate, i = Math.floor(x);
  if (i < 0) return arr[0];
  if (i >= arr.length - 1) return arr[arr.length - 1];
  return arr[i] + (arr[i + 1] - arr[i]) * (x - i);
}

export function lowerBound(arr, t, key = (v) => v) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (key(arr[m]) < t) lo = m + 1; else hi = m; }
  return lo;
}

export function beatInfo(beats, downbeats, t) {
  if (!beats || beats.length < 2) return { phase: 0, pulse: 0, index: -1, period: 0.5, downPulse: 0 };
  const i = lowerBound(beats, t + 1e-9) - 1;
  const period = i >= 0 && i < beats.length - 1 ? beats[i + 1] - beats[i] : beats[1] - beats[0];
  const since = i >= 0 ? t - beats[i] : 99;
  const di = lowerBound(downbeats, t + 1e-9) - 1;
  const dsince = di >= 0 ? t - downbeats[di] : 99;
  return {
    index: i,
    period,
    phase: i >= 0 ? Math.min(1, since / period) : 0,
    pulse: Math.exp(-since / 0.12),
    downPulse: Math.exp(-dsince / 0.18),
  };
}

export function snapToBeat(beats, t, window = 0.3) {
  if (!beats || !beats.length) return t;
  const i = lowerBound(beats, t);
  let best = t, bd = window;
  for (const j of [i - 1, i]) if (j >= 0 && j < beats.length && Math.abs(beats[j] - t) <= bd) { bd = Math.abs(beats[j] - t); best = beats[j]; }
  return best;
}
