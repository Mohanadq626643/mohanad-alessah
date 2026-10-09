// الكلمات: تحليل النص (عادي أو LRC/LRC مُحسَّن)، المحاذاة مع مناطق الغناء، وتوزيع الكلمات زمنيًا.
// مبدأ أساسي: التوقيت الآلي «تقدير» (status: 'auto') إلى أن يؤكده المستخدم بالنقر أو التعديل أو ملف LRC.

const TS = /\[(\d{1,2}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;
const WTS = /<(\d{1,2}):(\d{1,2}(?:[.:]\d{1,3})?)>/g;

function tsToSec(m, s) { return Number(m) * 60 + Number(String(s).replace(':', '.')); }

export const DIACRITICS = /[ً-ْٰـ]/g; // التشكيل والتطويل

export function normalizeArabic(s) {
  return s
    .replace(DIACRITICS, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^ء-يa-zA-Z0-9\s]/g, '')
    .trim();
}

export function splitWords(text) {
  return text.trim().split(/\s+/).filter(Boolean);
}

// وزن تقريبي لمدة نطق الكلمة (عدد الحروف + حروف المد)
export function wordWeight(word) {
  const w = word.replace(DIACRITICS, '').replace(/[^ء-يa-zA-Z0-9]/g, '');
  const longV = (w.match(/[اويى]/g) || []).length;
  return Math.max(1, w.length * 0.6 + longV * 0.5);
}

export function parseLyrics(text) {
  const lines = [];
  let hasTimes = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    if (/^\s*\[(ar|ti|al|by|offset|length|re|ve):/i.test(raw)) continue; // وسوم وصفية في LRC
    const stamps = [...raw.matchAll(TS)].map((m) => tsToSec(m[1], m[2]));
    let body = raw.replace(TS, '').trim();
    if (!body) continue;
    const wordStamps = [...body.matchAll(WTS)];
    let words;
    if (wordStamps.length) {
      // LRC مُحسَّن: <mm:ss.xx>كلمة
      words = [];
      const parts = body.split(WTS);
      // parts: [قبل, m, s, نص, m, s, نص...]
      for (let i = 1; i < parts.length; i += 3) {
        const t = tsToSec(parts[i], parts[i + 1]);
        for (const w of splitWords(parts[i + 2] || '')) words.push({ text: w, start: t });
      }
      body = words.map((w) => w.text).join(' ');
    } else {
      words = splitWords(body).map((w) => ({ text: w }));
    }
    if (stamps.length) hasTimes = true;
    for (const st of stamps.length ? stamps : [null]) {
      lines.push({ text: body, words: words.map((w) => ({ ...w })), start: st, end: null, status: st != null ? 'confirmed' : 'none', source: st != null ? 'lrc' : null });
    }
  }
  if (hasTimes) {
    lines.sort((a, b) => (a.start ?? 1e9) - (b.start ?? 1e9));
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i], next = lines[i + 1];
      if (l.start == null) { l.status = 'none'; continue; }
      const wordsDur = l.words.reduce((s, w) => s + wordWeight(w.text), 0) * 0.28 + 0.6;
      l.end = next && next.start != null ? Math.min(next.start - 0.05, l.start + Math.max(1.2, wordsDur * 1.6)) : l.start + wordsDur;
      fillWordTimes(l, null);
    }
  }
  return { lines, timed: hasTimes };
}

// توزيع الكلمات داخل زمن السطر. إن وُجدت مقاطع غناء ضمن السطر توزَّع على زمن الغناء الفعلي فقط (تتجاوز الفجوات)،
// ثم تُلصق بدايات الكلمات على أقرب ضربة صوتية (onset) قريبة.
export function fillWordTimes(line, analysis) {
  const ws = line.words;
  if (!ws.length || line.start == null || line.end == null) return line;
  const explicit = ws.every((w) => w.start != null);
  if (explicit) {
    for (let i = 0; i < ws.length; i++) {
      const next = i + 1 < ws.length ? ws[i + 1].start : line.end;
      ws[i].end = Math.max(ws[i].start + 0.06, Math.min(next, ws[i].start + 1.6));
    }
    return line;
  }
  let spans = [{ start: line.start, end: line.end }];
  if (analysis && analysis.segments) {
    const inside = analysis.segments
      .map((s) => ({ start: Math.max(s.start, line.start), end: Math.min(s.end, line.end) }))
      .filter((s) => s.end - s.start > 0.05);
    if (inside.length) spans = inside;
  }
  const total = spans.reduce((s, x) => s + (x.end - x.start), 0);
  const weights = ws.map((w) => wordWeight(w.text));
  const W = weights.reduce((a, b) => a + b, 0);
  const at = (u) => {
    let acc = u * total;
    for (const sp of spans) { const d = sp.end - sp.start; if (acc <= d) return sp.start + acc; acc -= d; }
    return spans[spans.length - 1].end;
  };
  let c = 0;
  for (let i = 0; i < ws.length; i++) {
    ws[i].start = at(c / W);
    c += weights[i];
    ws[i].end = at(c / W);
  }
  if (analysis && analysis.hits && analysis.hits.length) {
    for (let i = 1; i < ws.length; i++) {
      const t = ws[i].start;
      let best = null, bd = 0.07;
      for (const h of analysis.hits) { const d = Math.abs(h.t - t); if (d < bd) { bd = d; best = h.t; } }
      if (best != null && best > ws[i - 1].start + 0.08 && best < ws[i].end - 0.06) { ws[i - 1].end = Math.min(ws[i - 1].end, best); ws[i].start = best; }
    }
  }
  return line;
}

// تقسيم المقاطع الطويلة عند أخفض نقطة في منحنى الغناء حتى يصبح عددها ≥ المطلوب
function splitSegments(segments, needed, analysis) {
  const segs = segments.map((s) => ({ ...s }));
  const fr = analysis.frameRate, off = analysis.timeOffset || 0, v = analysis.vocal;
  let guard = 0;
  while (segs.length < needed && guard++ < 500) {
    let li = 0;
    for (let i = 1; i < segs.length; i++) if (segs[i].end - segs[i].start > segs[li].end - segs[li].start) li = i;
    const s = segs[li], d = s.end - s.start;
    if (d < 0.5) break;
    let bestT = s.start + d / 2, bestV = Infinity;
    for (let t = s.start + d * 0.25; t <= s.start + d * 0.75; t += 1 / fr) {
      const val = v ? v[Math.round((t - off) * fr)] ?? 1 : 1;
      if (val < bestV) { bestV = val; bestT = t; }
    }
    segs.splice(li, 1, { start: s.start, end: bestT - 0.02, split: true }, { start: bestT + 0.02, end: s.end, split: true });
  }
  return segs;
}

// محاذاة الأسطر مع مناطق الغناء بالبرمجة الديناميكية: كل سطر يأخذ مجموعة متتالية من المقاطع،
// الكلفة = عدم تطابق المدة المتوقعة (حسب طول الكلمات) − مكافأة للفصل عند فجوات طويلة.
// الأسطر المؤكدة (نقر/تعديل/LRC) تبقى ثابتة وتُستخدم مراسي؛ تُحاذى الأسطر غير المؤكدة بينها فقط.
export function alignLines(lines, analysis) {
  if (!analysis) return lines;
  let run = [], from = 0;
  const flush = (to) => { if (run.length) alignRun(run, analysis, from, to); run = []; };
  for (const l of lines) {
    if (l.status === 'confirmed' && l.start != null) { flush(l.start); from = l.end ?? l.start; }
    else run.push(l);
  }
  flush(Infinity);
  return lines;
}

function alignRun(lines, analysis, from, to) {
  let segs = (analysis.segments || [])
    .map((s) => ({ start: Math.max(s.start, from), end: Math.min(s.end, to) }))
    .filter((s) => s.end - s.start > 0.1);
  const N = lines.length;
  if (!segs.length) return lines;
  if (segs.length < N) segs = splitSegments(segs, N, analysis);
  const M = segs.length;
  const vocalTotal = segs.reduce((s, x) => s + (x.end - x.start), 0);
  const w = lines.map((l) => l.words.reduce((s, x) => s + wordWeight(x.text), 0) + 1);
  const W = w.reduce((a, b) => a + b, 0);
  const expect = w.map((x) => (x / W) * vocalTotal);
  const pre = [0];
  for (const s of segs) pre.push(pre[pre.length - 1] + (s.end - s.start));
  const gapBonus = (j) => (j <= 0 || j >= M ? 0 : Math.min(2.5, segs[j].start - segs[j - 1].end) * (segs[j].split ? 0.3 : 1));
  const INF = 1e18;
  // dp[i][j] = أقل كلفة لتوزيع أول i أسطر على أول j مقاطع
  const dp = Array.from({ length: N + 1 }, () => new Float64Array(M + 1).fill(INF));
  const bk = Array.from({ length: N + 1 }, () => new Int32Array(M + 1).fill(-1));
  dp[0][0] = 0;
  // السماح بإسقاط مقاطع قصيرة قبل السطر الأول (ضجيج) بكلفة صغيرة
  for (let j = 1; j <= M; j++) dp[0][j] = dp[0][j - 1] + 0.3 + (segs[j - 1].end - segs[j - 1].start);
  for (let i = 1; i <= N; i++) {
    for (let j = i; j <= M - (N - i); j++) {
      for (let k = i - 1; k < j; k++) {
        if (dp[i - 1][k] >= INF) continue;
        const d = pre[j] - pre[k];
        const r = Math.log(Math.max(0.05, d) / Math.max(0.05, expect[i - 1]));
        const c = dp[i - 1][k] + r * r * 2 - gapBonus(k) * 1.2;
        if (c < dp[i][j]) { dp[i][j] = c; bk[i][j] = k; }
      }
    }
  }
  // السماح بإسقاط مقاطع بعد السطر الأخير
  let bestJ = N, best = INF;
  for (let j = N; j <= M; j++) {
    const c = dp[N][j] + (pre[M] - pre[j]) + 0.3 * (M - j);
    if (c < best) { best = c; bestJ = j; }
  }
  const groups = [];
  for (let i = N, j = bestJ; i > 0; i--) { const k = bk[i][j]; groups.unshift([k, j]); j = k; }
  groups.forEach(([k, j], i) => {
    const l = lines[i];
    if (!l || l.status === 'confirmed') return;
    l.start = segs[k].start;
    l.end = segs[j - 1].end;
    l.status = 'auto';
    l.source = 'audio';
    for (const wd of l.words) { delete wd.start; delete wd.end; }
    fillWordTimes(l, analysis);
  });
  return lines;
}

export function toLRC(lines, { words = true } = {}) {
  const f = (t) => {
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
  };
  return lines
    .filter((l) => l.start != null)
    .map((l) => `[${f(l.start)}]` + (words && l.words.every((w) => w.start != null) ? l.words.map((w) => `<${f(w.start)}>${w.text}`).join(' ') : l.text))
    .join('\n');
}

// أي سطر/كلمة نشطة في زمن t
export function activeLineIndex(lines, t) {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.start == null) continue;
    if (t >= l.start && t < l.end) return i;
  }
  return idx;
}
