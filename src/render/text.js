import { clamp, lerp, easeOutBack, easeOutCubic, INK } from './util.js';

// النص العربي: كل كلمة تُرسم كسلسلة كاملة (لا تقسيم للحروف) فيبقى الاتصال والتشكيل سليمًا.
// الترتيب من اليمين إلى اليسار: أول كلمة في أقصى اليمين.
export const LYRIC_FONT = 'Lalezar';

const layoutCache = new Map();

export function layoutWords(ctx, words, size, maxWidth, font = LYRIC_FONT) {
  const key = words.map((w) => w.text).join(' ') + '|' + size + '|' + Math.round(maxWidth) + font;
  if (layoutCache.has(key)) return layoutCache.get(key);
  ctx.save();
  ctx.font = `${size}px "${font}", "Cairo", sans-serif`;
  ctx.direction = 'rtl';
  const space = ctx.measureText(' ').width * 1.4;
  const widths = words.map((w) => ctx.measureText(w.text).width);
  ctx.restore();
  const rows = [];
  let row = { items: [], width: 0 };
  widths.forEach((w, i) => {
    const add = (row.items.length ? space : 0) + w;
    if (row.items.length && row.width + add > maxWidth) { rows.push(row); row = { items: [], width: 0 }; }
    row.items.push({ i, w, off: row.width + (row.items.length ? space : 0) });
    row.width += row.items.length > 1 ? add : w;
  });
  if (row.items.length) rows.push(row);
  const lh = size * 1.35;
  const slots = [];
  rows.forEach((r, ri) => {
    const y = (ri - (rows.length - 1) / 2) * lh;
    for (const it of r.items) {
      // من اليمين: الحافة اليمنى للسطر = +width/2
      const right = r.width / 2 - it.off;
      slots[it.i] = { x: right - it.w / 2, y, w: it.w };
    }
  });
  const res = { slots, rows: rows.length, width: Math.max(...rows.map((r) => r.width)), height: rows.length * lh, size };
  if (layoutCache.size > 400) layoutCache.clear();
  layoutCache.set(key, res);
  return res;
}

// يختار حجمًا يلائم الصندوق (حد أقصى صفّين قدر الإمكان)
export function fitLayout(ctx, words, box, font) {
  let size = box.size || 72;
  for (let k = 0; k < 14; k++) {
    const L = layoutWords(ctx, words, size, box.w, font);
    if ((L.rows <= (box.maxRows || 2) && L.height <= (box.h || 1e9)) || size < 26) return L;
    size = Math.round(size * 0.9);
  }
  return layoutWords(ctx, words, size, box.w, font);
}

// حالة كل كلمة في الزمن t
export function wordStates(line, t) {
  if (!line) return [];
  return line.words.map((w) => {
    const st = w.start ?? line.start, en = w.end ?? line.end;
    return { text: w.text, start: st, end: en, since: t - st, k: clamp((t - st) / Math.max(0.05, en - st)), state: t < st ? 'future' : t < en ? 'active' : 'past' };
  });
}

/**
 * رسم كلمات السطر بحركة إبداعية.
 * box: {x, y, w, size, maxRows}
 * style: {fill, active, stroke, strokeW, shadow, ghost, from(i,slot)->{x,y}, pos(i,slot,word)->{x,y}, motion, bob, rot, font, glow}
 * motion: 'pop' | 'fly' | 'drop' | 'rise' | 'type' | 'wave'
 */
export function drawLyricWords(ctx, s, box, style = {}) {
  const ws = s.words;
  if (!ws || !ws.length) return null;
  const L = fitLayout(ctx, ws, box, style.font);
  const out = s.lineOut || 0;
  ctx.save();
  ctx.font = `${L.size}px "${style.font || LYRIC_FONT}", "Cairo", sans-serif`;
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ws.forEach((w, i) => {
    const slot = L.slots[i];
    if (!slot) return;
    let a = w.state === 'future' ? (style.ghost ?? 0) : 1;
    if (a <= 0 && w.state === 'future') return;
    const appear = w.state === 'future' ? 0 : clamp(w.since / (style.appearDur || 0.28));
    let x = box.x + slot.x, y = box.y + slot.y, sc = 1, rot = 0;
    const motion = style.motion || 'pop';
    if (w.state !== 'future') {
      if (motion === 'fly' && style.from) {
        const f = style.from(i, { x, y });
        const e = easeOutCubic(appear);
        x = lerp(f.x, x, e); y = lerp(f.y, y, e) - Math.sin(e * Math.PI) * 60;
        sc = lerp(0.3, 1, easeOutBack(appear));
      } else if (motion === 'drop') {
        y = lerp(y - 260, y, easeOutBack(appear)); rot = (1 - appear) * 0.4 * (i % 2 ? 1 : -1);
      } else if (motion === 'rise') {
        y = lerp(y + 200, y, easeOutCubic(appear)); a *= appear;
      } else if (motion === 'type') {
        sc = appear < 1 ? lerp(0.6, 1, easeOutBack(appear)) : 1; a *= clamp(appear * 3);
      } else if (motion === 'wave') {
        sc = lerp(0.2, 1, easeOutBack(appear));
      } else {
        sc = lerp(0.2, 1, easeOutBack(appear));
      }
      if (w.state === 'active') sc *= 1 + 0.12 * Math.sin(clamp(w.k * 1.2) * Math.PI) + 0.06 * (s.beat?.pulse || 0);
    }
    // موضع مخصص: الكلمة تلتصق بعنصر في المشهد (بالون، قارب…)
    if (style.pos) { const p = style.pos(i, slot, w); if (!p) return; x = p.x; y = p.y; }
    if (style.bob) y += Math.sin(s.t * 2.4 + i * 0.9) * style.bob;
    if (style.rot) rot += Math.sin(s.t * 1.7 + i) * style.rot;
    // الخروج: تتلاشى الكلمات وتتحرك باتجاه المشهد التالي
    if (out > 0) { a *= 1 - out; y -= out * 40 * (style.exitDir || 1); sc *= 1 + out * 0.15; }
    if (a <= 0.01) return;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc);
    const active = w.state === 'active';
    if (style.glow || active) { ctx.shadowColor = active ? style.activeGlow || 'rgba(255,230,120,0.9)' : style.glow; ctx.shadowBlur = active ? 28 : 16; }
    ctx.lineJoin = 'round';
    ctx.lineWidth = style.strokeW ?? Math.max(4, L.size * 0.12);
    ctx.strokeStyle = style.stroke || INK;
    if (ctx.lineWidth > 0) ctx.strokeText(w.text, 0, 0);
    ctx.shadowBlur = 0;
    ctx.fillStyle = w.state === 'future' ? style.ghostFill || 'rgba(255,255,255,0.5)' : active ? style.active || '#ffe066' : style.fill || '#fff';
    ctx.fillText(w.text, 0, 0);
    ctx.restore();
  });
  ctx.restore();
  return L;
}
