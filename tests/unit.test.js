import { test } from 'node:test';
import assert from 'node:assert/strict';
import { synthSong } from './synth.js';
import { analyzeAudio, snapToBeat, beatInfo } from '../src/audio/analysis.js';
import { parseLyrics, alignLines, normalizeArabic, toLRC, wordWeight } from '../src/lyrics/lyrics.js';
import { sceneMatches, suggestScenes } from '../src/lyrics/meaning.js';

// إشارة اختبار بحقيقة معروفة (ليست الأغنية)
const song = synthSong();
const a = analyzeAudio(song.channels, song.sr);

test('تقدير الإيقاع يطابق الحقيقة (±1 BPM)', () => {
  assert.ok(Math.abs(a.bpm - song.bpm) < 1, `bpm=${a.bpm}`);
});

test('الضربات المكتشفة تقع على الضربات الحقيقية (خطأ وسيط < 25ms)', () => {
  const errs = song.beats.slice(2, -2).map((b) => Math.min(...a.beats.map((x) => Math.abs(x - b))));
  errs.sort((x, y) => x - y);
  const median = errs[Math.floor(errs.length / 2)];
  assert.ok(median < 0.025, `median=${median}`);
  assert.ok(errs.filter((e) => e > 0.06).length <= 2, 'ضربات شاذة كثيرة');
});

test('مناطق الغناء تطابق المقاطع الحقيقية (±0.15 ث)', () => {
  assert.equal(a.segments.length, song.vocals.length, JSON.stringify(a.segments));
  a.segments.forEach((s, i) => {
    assert.ok(Math.abs(s.start - song.vocals[i][0]) < 0.15, `start ${i}: ${s.start}`);
    assert.ok(Math.abs(s.end - song.vocals[i][1]) < 0.15, `end ${i}: ${s.end}`);
  });
});

test('المحاذاة: كل سطر يقع داخل منطقة الغناء الصحيحة', () => {
  const { lines } = parseLyrics('سطر أول للاختبار\nسطر ثان\nالسطر الثالث هنا أطول\nختام');
  alignLines(lines, a);
  lines.forEach((l, i) => {
    assert.equal(l.status, 'auto');
    assert.ok(Math.abs(l.start - song.vocals[i][0]) < 0.15 && Math.abs(l.end - song.vocals[i][1]) < 0.15, `line ${i}: ${l.start}-${l.end}`);
    for (let k = 1; k < l.words.length; k++) assert.ok(l.words[k].start >= l.words[k - 1].start, 'ترتيب الكلمات');
    assert.ok(l.words[0].start >= l.start - 1e-6 && l.words.at(-1).end <= l.end + 1e-6);
  });
});

test('أسطر أكثر من المقاطع: تُقسم المقاطع الطويلة دون تداخل', () => {
  const { lines } = parseLyrics(Array.from({ length: 6 }, (_, i) => `سطر رقم ${i + 1}`).join('\n'));
  alignLines(lines, a);
  for (let i = 1; i < lines.length; i++) assert.ok(lines[i].start >= lines[i - 1].end - 1e-6, `تداخل عند ${i}`);
});

test('الأسطر المؤكدة لا تتغير بالمحاذاة التلقائية', () => {
  const { lines } = parseLyrics('سطر أ\nسطر ب\nسطر ج');
  lines[1].start = 9.5; lines[1].end = 11; lines[1].status = 'confirmed';
  alignLines(lines, a);
  assert.equal(lines[1].start, 9.5); assert.equal(lines[1].end, 11);
  assert.ok(lines[0].end <= 9.5 && lines[2].start >= 11);
});

test('LRC و LRC المحسّن: التوقيتات الحقيقية تُحترم', () => {
  const p = parseLyrics('[ar:مغني]\n[00:02.00]شفت كلام\n[00:05.30]<00:05.30>كلمة <00:05.90>ثانية');
  assert.ok(p.timed);
  assert.equal(p.lines.length, 2);
  assert.equal(p.lines[0].start, 2); assert.equal(p.lines[0].status, 'confirmed');
  assert.equal(p.lines[1].words[1].start, 5.9);
  assert.match(toLRC(p.lines), /\[00:05\.30\]<00:05\.30>كلمة <00:05\.90>ثانية/);
});

test('تطبيع العربية والأوزان', () => {
  assert.equal(normalizeArabic('إِنَّ الحُبَّ ٱلأَوَّلْ'), 'ان الحب الاول');
  assert.ok(wordWeight('كلاااام') > wordWeight('كل'));
});

test('اختيار المشاهد من معنى الكلمات ومنع التكرار المتتالي', () => {
  assert.equal(sceneMatches('شفت عيونك')[0].scene, 'eyes');
  assert.equal(sceneMatches('وبالليل')[0].scene, 'night');
  assert.equal(sceneMatches('كلامك')[0].scene, 'talk');
  const lines = ['قلبي', 'حبيبي', 'نص بلا دلالة', 'نص آخر'].map((text) => ({ text }));
  const s = suggestScenes(lines);
  for (let i = 1; i < s.length; i++) assert.notEqual(s[i].scene, s[i - 1].scene);
  assert.equal(s[0].scene, 'heart');
});

test('أدوات الإيقاع', () => {
  assert.equal(snapToBeat([1, 2, 3], 2.1, 0.3), 2);
  assert.equal(snapToBeat([1, 2, 3], 2.5, 0.3), 2.5);
  const b = beatInfo([1, 2, 3, 4], [1], 2.05);
  assert.equal(b.index, 1); assert.ok(b.pulse > 0.6);
});
