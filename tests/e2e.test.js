// اختبار شامل في متصفح حقيقي (Chromium عبر Playwright):
// تحميل صوت اختباري بحقيقة معروفة + صورة، تحليل، محاذاة، رسم كل المشاهد، مزامنة بالنقر، وتصدير فيديو فعلي يُفحص بـ ffprobe.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from '../scripts/serve.mjs';
import { synthSong, writeWav } from './synth.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'test-output');
fs.mkdirSync(out, { recursive: true });

async function loadPlaywright() {
  try { return await import('playwright'); } catch {
    const req = createRequire(path.join(execSync('npm root -g').toString().trim(), 'x.js'));
    return req('playwright');
  }
}

let server, browser, page, base;
const errors = [];
const song = synthSong({ duration: 16 });
// كلمات اختبارية فقط (ليست كلمات الأغنية) — تحتوي كلمات دالة لاختبار اختيار المشاهد
const TEST_LYRICS = ['شفت عيونك في الليل', 'وكلامك ما نسيته', 'قلبي على الطريق البعيد', 'والبحر يسمع'].join('\n');

before(async () => {
  writeWav(path.join(out, 'test-song.wav'), { sr: song.sr, channels: song.channels }, fs);
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}/`;
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.__app && document.fonts.check('40px "Lalezar"'));
});

after(async () => { await browser?.close(); server?.close(); });

test('تحميل الصوت وتحليله داخل المتصفح', async () => {
  await page.setInputFiles('#audioFile', path.join(out, 'test-song.wav'));
  await page.waitForFunction(() => window.__app.state.analysis, null, { timeout: 30000 });
  const a = await page.evaluate(() => { const a = window.__app.state.analysis; return { bpm: a.bpm, segs: a.segments, beats: a.beats.length }; });
  assert.ok(Math.abs(a.bpm - 120) < 1, `bpm ${a.bpm}`);
  assert.equal(a.segs.length, song.vocals.length);
});

test('اعتماد الكلمات ومحاذاتها مع مناطق الغناء الحقيقية', async () => {
  await page.evaluate((t) => window.__app.setLyrics(t), TEST_LYRICS);
  const lines = await page.evaluate(() => window.__app.state.project.lines.map((l) => ({ start: l.start, end: l.end, scene: l.scene, status: l.status })));
  assert.equal(lines.length, 4);
  lines.forEach((l, i) => {
    assert.ok(Math.abs(l.start - song.vocals[i][0]) < 0.15, `line ${i} start ${l.start}`);
    assert.equal(l.status, 'auto');
  });
  assert.deepEqual(lines.map((l) => l.scene), ['eyes', 'talk', 'heart', 'sea']);
  const rows = await page.locator('#linesTable tbody tr').count();
  assert.equal(rows, 4);
});

test('تزامن العرض: السطر والكلمة النشطة في المشهد يطابقان الزمن', async () => {
  // نمط المشاهد الكرتونية الأفقية مع إضاءة كلمة بكلمة
  await page.selectOption('#styleSel', 'cartoon');
  await page.selectOption('#aspectSel', '16:9');
  await page.selectOption('#textModeSel', 'words');
  const res = await page.evaluate(() => {
    const app = window.__app, r = app.renderer, out = [];
    app.state.project.lines.forEach((l, i) => {
      l.words.forEach((w, k) => {
        const t = (w.start + w.end) / 2;
        const info = r.render(t);
        const shot = r.shots[info.shot];
        const ctx = r.context(shot, info.shot, t);
        out.push({ i, k, shotLine: shot.lineIndex, active: ctx.words.findIndex((x) => x.state === 'active') });
      });
    });
    return out;
  });
  for (const x of res) { assert.equal(x.shotLine, x.i, `line ${x.i}`); assert.equal(x.active, x.k, `word ${x.i}:${x.k}`); }
  // قبل أول سطر: مقدمة بلا كلمات
  const introScene = await page.evaluate(() => { const r = window.__app.renderer; return r.shots[r.render(0.3).shot].scene; });
  assert.equal(introScene, 'intro');
});

test('بدايات اللقطات ملتصقة بالضربات الإيقاعية', async () => {
  const d = await page.evaluate(() => {
    const { renderer: r, state } = window.__app;
    return r.shots.slice(1).map((s) => Math.min(...state.analysis.beats.map((b) => Math.abs(b - s.start))));
  });
  assert.ok(d.filter((x) => x < 0.01).length >= Math.ceil(d.length / 2), JSON.stringify(d));
});

test('كل المشاهد تُرسم بلا أخطاء ومختلفة بصريًا، مع العيون المرجعية', async () => {
  // صورة مرجعية اختبارية مولدة (عينان زرقاوان) — المستخدم يرفع صورته الحقيقية
  await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 200; const x = c.getContext('2d');
    x.fillStyle = '#f2c9a0'; x.fillRect(0, 0, 400, 200);
    for (const cx of [100, 300]) { x.fillStyle = '#fff'; x.beginPath(); x.ellipse(cx, 100, 80, 60, 0, 0, 7); x.fill(); x.fillStyle = '#1e6fd9'; x.beginPath(); x.arc(cx, 100, 40, 0, 7); x.fill(); x.fillStyle = '#000'; x.beginPath(); x.arc(cx, 100, 18, 0, 7); x.fill(); }
    await window.__app.loadImageURL(c.toDataURL(), { x: 0, y: 20, w: 400, h: 160 });
  });
  const ids = ['eyes', 'talk', 'phone', 'night', 'sea', 'rain', 'road', 'heart', 'city', 'stage', 'clock', 'desert', 'fire', 'sunrise'];
  const sigs = {};
  for (const id of ids) {
    const sig = await page.evaluate((id) => {
      const { state, renderer } = window.__app, l = state.project.lines[0];
      l.scene = id; renderer.rebuild();
      const t = (l.words[1].start + l.words[1].end) / 2 + 0.05;
      renderer.render(t);
      const c = renderer.canvas, x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const sig = []; for (let gy = 0; gy < 9; gy++) for (let gx = 0; gx < 16; gx++) { const i = ((Math.floor((gy + 0.5) * c.height / 9)) * c.width + Math.floor((gx + 0.5) * c.width / 16)) * 4; sig.push(x[i], x[i + 1], x[i + 2]); }
      return { sig, url: c.toDataURL('image/jpeg', 0.8) };
    }, id);
    fs.writeFileSync(path.join(out, `scene-${id}.jpg`), Buffer.from(sig.url.split(',')[1], 'base64'));
    const nonBlank = new Set(sig.sig.map((v) => v >> 4)).size;
    assert.ok(nonBlank > 6, `${id} يبدو فارغًا`);
    sigs[id] = sig.sig;
  }
  // كل مشهدين مختلفان فعلًا (ليست نفس اللقطة بتغيير بسيط)
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = sigs[ids[i]], b = sigs[ids[j]];
    let d = 0; for (let k = 0; k < a.length; k++) d += Math.abs(a[k] - b[k]);
    assert.ok(d / a.length > 12, `${ids[i]} ≈ ${ids[j]} (${(d / a.length).toFixed(1)})`);
  }
  for (const id of ['intro', 'interlude', 'outro']) {
    await page.evaluate((id) => { const r = window.__app.renderer; const k = r.shots.findIndex((s) => s.scene === id); if (k >= 0) r.render((r.shots[k].start + r.shots[k].end) / 2); else { r.shots.unshift({ scene: id, start: 0, end: 2, lineIndex: -1 }); r.render(1); r.rebuild(); } }, id);
  }
  // استعادة المشهد المقترح
  await page.evaluate(() => { const { state, renderer } = window.__app; state.project.lines[0].scene = 'eyes'; renderer.rebuild(); });
  // صور للانتقالات
  const types = ['iris', 'wipe', 'zoom', 'ink', 'slide', 'flash'];
  for (const ty of types) {
    const url = await page.evaluate((ty) => {
      const { renderer: r } = window.__app; const sh = r.shots[2]; const old = sh.transition; sh.transition = ty; sh.tDur = 0.6;
      r.render(sh.start + 0.02); const u = r.canvas.toDataURL('image/jpeg', 0.7); sh.transition = old; return u;
    }, ty);
    fs.writeFileSync(path.join(out, `transition-${ty}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
  }
  await page.screenshot({ path: path.join(out, 'ui.png'), fullPage: true });
  assert.deepEqual(errors, []);
});

test('نمط الغرفة الواحدة (9:16): كل معنى يحوّل الغرفة، والجملة تظهر كاملة مع بداية السطر', async () => {
  await page.selectOption('#styleSel', 'room');
  await page.selectOption('#aspectSel', '9:16');
  await page.selectOption('#textModeSel', 'sentence');
  const size = await page.evaluate(() => [document.getElementById('stage').width, document.getElementById('stage').height]);
  assert.deepEqual(size, [720, 1280]);
  // الجملة كاملة: بعد بداية السطر بقليل كل الكلمات ظاهرة
  const vis = await page.evaluate(() => {
    const { renderer: r, state } = window.__app, l = state.project.lines[1], t = l.start + 0.3;
    const k = r.shotAt(t); return r.context(r.shots[k], k, t, 720, 1280).words.map((w) => w.state);
  });
  assert.ok(vis.every((x) => x !== 'future'), JSON.stringify(vis));
  const moods = ['eyes', 'talk', 'phone', 'night', 'sea', 'rain', 'road', 'heart', 'city', 'stage', 'clock', 'desert', 'fire', 'sunrise'];
  const sigs = {};
  for (const m of moods) {
    const r = await page.evaluate((m) => {
      const { state, renderer } = window.__app, l = state.project.lines[1];
      l.scene = m; renderer.rebuild();
      renderer.render(l.start + 1.2);
      const c = renderer.canvas, x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, sig = [];
      for (let gy = 0; gy < 16; gy++) for (let gx = 0; gx < 9; gx++) { const i = (Math.floor((gy + 0.5) * c.height / 16) * c.width + Math.floor((gx + 0.5) * c.width / 9)) * 4; sig.push(x[i], x[i + 1], x[i + 2]); }
      return { sig, url: c.toDataURL('image/jpeg', 0.85) };
    }, m);
    fs.writeFileSync(path.join(out, `room-${m}.jpg`), Buffer.from(r.url.split(',')[1], 'base64'));
    sigs[m] = r.sig;
  }
  // المكان ثابت لكن كل معنى يغيّر الغرفة بشكل ملحوظ
  for (let i = 0; i < moods.length; i++) for (let j = i + 1; j < moods.length; j++) {
    const a = sigs[moods[i]], b = sigs[moods[j]]; let d = 0; for (let q = 0; q < a.length; q++) d += Math.abs(a[q] - b[q]);
    assert.ok(d / a.length > 1.5, `${moods[i]} ≈ ${moods[j]} (${(d / a.length).toFixed(2)})`);
  }
  // لقطات أثناء المزج بين مزاجين (تحوّل لا قطع)
  await page.evaluate(() => { const { state, renderer } = window.__app; state.project.lines[0].scene = 'eyes'; state.project.lines[1].scene = 'talk'; state.project.lines[2].scene = 'heart'; state.project.lines[3].scene = 'sea'; renderer.rebuild(); });
  for (const [name, dt] of [['blend-a', 0.1], ['blend-b', 0.35], ['blend-c', 0.8]]) {
    const url = await page.evaluate((dt) => { const { renderer: r } = window.__app; const sh = r.shots.find((x) => x.lineIndex === 2); r.render(sh.start + dt); return r.canvas.toDataURL('image/jpeg', 0.8); }, dt);
    fs.writeFileSync(path.join(out, `room-${name}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
  }
  assert.deepEqual(errors, []);
});

test('المزامنة بالنقر تسجّل التوقيت الفعلي وتؤكد السطر', async () => {
  await page.evaluate(() => { window.__app.state.selected = 0; window.__app.startTap('lines'); });
  await page.waitForTimeout(400);
  await page.keyboard.down('Space');
  const t0 = await page.evaluate(() => document.getElementById('audio').currentTime);
  await page.waitForTimeout(700);
  await page.keyboard.up('Space');
  const l = await page.evaluate(() => { const l = window.__app.state.project.lines[0]; return { start: l.start, end: l.end, status: l.status, source: l.source }; });
  await page.evaluate(() => window.__app.endTap());
  assert.equal(l.status, 'confirmed'); assert.equal(l.source, 'tap');
  assert.ok(Math.abs(l.start - t0) < 0.1, `${l.start} vs ${t0}`);
  assert.ok(Math.abs(l.end - l.start - 0.7) < 0.2, `dur ${l.end - l.start}`);
});

test('تصدير فيديو WebM حقيقي بالصوت والصورة', async () => {
  const b64 = await page.evaluate(async () => {
    // إعادة التوقيت الآلي للسطر الأول بعد اختبار النقر، ثم تصدير مقطع يشمل سطرين وانتقالًا
    const app = window.__app; app.state.project.lines[0].status = 'auto'; app.autoAlign(true);
    const blob = await app.exportVideo({ from: 1.5, to: 6.5, noDownload: true, res: 1 });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  });
  const file = path.join(out, 'export.webm');
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  assert.ok(fs.statSync(file).size > 20000, 'الملف صغير جدًا');
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]).toString());
  const kinds = probe.streams.map((s) => s.codec_type).sort();
  assert.deepEqual(kinds, ['audio', 'video']);
  const v = probe.streams.find((s) => s.codec_type === 'video');
  assert.equal(v.width, 720); assert.equal(v.height, 1280);
  // استخراج إطارات للمراجعة البصرية
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', 'fps=2,scale=270:-1,tile=5x2', '-frames:v', '1', path.join(out, 'export-frames.jpg')]);
  assert.deepEqual(errors, []);
});
