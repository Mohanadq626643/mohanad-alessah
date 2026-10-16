import { analyzeAudio, detectVocalSegments } from '../audio/analysis.js';
import { parseLyrics, alignLines, fillWordTimes, toLRC, splitWords, activeLineIndex } from '../lyrics/lyrics.js';
import { suggestScenes, SCENE_NAMES, LYRIC_SCENES } from '../lyrics/meaning.js';
import { Renderer, TRANSITION_NAMES } from '../render/renderer.js';
import { Timeline } from './timeline.js';
import { CropEditor } from './crop.js';

const $ = (id) => document.getElementById(id);
const audio = $('audio');
const state = { project: { title: 'شفت كلام', lines: [], aspect: '9:16', style: 'room', textMode: 'sentence' }, analysis: null, buffer: null, selected: -1, audioName: null, imageData: null, tap: null };
const renderer = new Renderer($('stage'));
const crop = new CropEditor($('cropCanvas'), $('eyePreview'), () => { renderer.setData({ eyes: crop.source() }); redraw(); autosave(); });
const timeline = new Timeline($('timeline'), {
  onSeek: (t) => seek(t),
  onChange: () => { renderer.rebuild(); renderTable(); syncTimeline(); autosave(); redraw(); },
  onSelect: (i) => select(i),
});

const fmt = (t) => { if (t == null || !isFinite(t)) return '--:--.--'; const m = Math.floor(t / 60), s = t - m * 60; return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`; };
function msg(text, ms = 0) { const el = $('msg'); el.textContent = text; el.classList.toggle('show', !!text); if (ms) setTimeout(() => { if (el.textContent === text) el.classList.remove('show'); }, ms); }

// ———————————————— الصوت ————————————————
let actx = null, mediaSrc = null, streamDest = null;
function audioGraph() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (!mediaSrc) { mediaSrc = actx.createMediaElementSource(audio); mediaSrc.connect(actx.destination); streamDest = actx.createMediaStreamDestination(); mediaSrc.connect(streamDest); }
  return actx;
}

async function loadAudioFile(file) {
  state.audioName = file.name;
  audio.src = URL.createObjectURL(file);
  $('audioInfo').textContent = `جارٍ فك ترميز «${file.name}»…`;
  const buf = await file.arrayBuffer();
  const ctx = audioGraph();
  state.buffer = await ctx.decodeAudioData(buf);
  $('audioInfo').textContent = `${file.name} — ${fmt(state.buffer.duration)} — ${state.buffer.numberOfChannels === 2 ? 'ستيريو' : 'أحادي'} ${state.buffer.sampleRate}Hz`;
  timeline.setAudio(state.buffer);
  renderer.setData({ duration: state.buffer.duration });
  $('analyzeBtn').disabled = false; $('playBtn').disabled = false;
  $('expTo').placeholder = state.buffer.duration.toFixed(1);
  await analyze();
}

function runAnalysis(channels, sampleRate, opts) {
  return new Promise((resolve, reject) => {
    let w;
    try { w = new Worker(new URL('../audio/worker.js', import.meta.url), { type: 'module' }); }
    catch { return resolve(analyzeAudio(channels, sampleRate, opts)); }
    w.onmessage = (e) => { w.terminate(); e.data.ok ? resolve(e.data.analysis) : reject(new Error(e.data.error)); };
    w.onerror = () => { w.terminate(); try { resolve(analyzeAudio(channels, sampleRate, opts)); } catch (err) { reject(err); } };
    w.postMessage({ channels, sampleRate, opts }, channels.map((c) => c.buffer));
  });
}

async function analyze() {
  if (!state.buffer) return msg('حمّل ملف الأغنية أولًا.', 3000);
  const b = state.buffer;
  $('analyzeBtn').disabled = true;
  $('analysisInfo').innerHTML = 'جارٍ تحليل الصوت (الإيقاع، الضربات، مناطق الغناء)…';
  const t0 = performance.now();
  const channels = [];
  for (let c = 0; c < Math.min(2, b.numberOfChannels); c++) channels.push(b.getChannelData(c).slice());
  try {
    state.analysis = await runAnalysis(channels, b.sampleRate, { segment: { threshold: Number($('vocalThr').value) } });
  } catch (e) {
    $('analysisInfo').innerHTML = `<span class="warn">تعذّر تحليل الصوت: ${e.message}. جرّب ملفًا آخر (WAV/MP3).</span>`;
    $('analyzeBtn').disabled = false;
    return;
  }
  const a = state.analysis;
  showAnalysis(performance.now() - t0);
  timeline.analysis = a;
  renderer.setData({ analysis: a });
  $('analyzeBtn').disabled = false;
  $('autoAlign').disabled = !state.project.lines.length;
  $('exportBtn').disabled = false; $('tapLines').disabled = !state.project.lines.length;
  if (state.project.lines.some((l) => l.status !== 'confirmed')) autoAlign(true);
  syncTimeline(); redraw();
}

function showAnalysis(ms) {
  const a = state.analysis;
  const vocalTime = a.segments.reduce((s, x) => s + x.end - x.start, 0);
  $('analysisInfo').innerHTML = `
    <div>الإيقاع: <b>${a.bpm.toFixed(1)}</b> BPM</div><div>الضربات: <b>${a.beats.length}</b> (${a.downbeats.length} بداية مازورة)</div>
    <div>مناطق غناء: <b>${a.segments.length}</b> (${vocalTime.toFixed(1)} ث)</div><div>توقفات/صمت: <b>${a.silences.length}</b></div>
    <div>ضربات قوية: <b>${a.hits.length}</b></div><div>${a.stereo ? 'فصل المنتصف/الجوانب مفعّل' : '<span class="warn">ملف أحادي: كشف الغناء أقل دقة</span>'}</div>
    ${ms ? `<div class="hint">استغرق ${(ms / 1000).toFixed(1)} ث</div>` : ''}`;
}

$('vocalThr').addEventListener('input', () => {
  if (!state.analysis) return;
  const a = state.analysis;
  a.segments = detectVocalSegments(a.vocal, a.frameRate, { threshold: Number($('vocalThr').value) }).map((s) => ({ start: s.start + a.timeOffset, end: s.end + a.timeOffset }));
  showAnalysis();
  timeline.draw();
});
$('vocalThr').addEventListener('change', () => { if (state.analysis && state.project.lines.some((l) => l.status === 'auto')) autoAlign(true); });

// ———————————————— الكلمات ————————————————
function applyLyrics() {
  const text = $('lyricsInput').value;
  const { lines, timed } = parseLyrics(text);
  if (!lines.length) { msg('أضف كلمات الأغنية الصحيحة (سطر لكل جملة) — لن تُخمَّن الكلمات.', 4000); return; }
  const sug = suggestScenes(lines);
  lines.forEach((l, i) => { l.scene = sug[i].scene; l.sceneReason = sug[i].reason; l.transition = 'auto'; });
  state.project.lines = lines;
  if (timed) for (const l of lines) if (l.status === 'confirmed' && !l.words.every((w) => w.start != null && w.end != null)) fillWordTimes(l, state.analysis);
  if (state.analysis) autoAlign(true);
  $('autoAlign').disabled = !state.analysis; $('tapLines').disabled = !state.buffer;
  select(0);
  renderer.setData({ project: state.project });
  renderTable(); syncTimeline(); redraw(); autosave();
  msg(timed ? `اعتُمدت الأسطر (${lines.length}) بتوقيتات ملف LRC.` : `اعتُمدت الأسطر (${lines.length}).` + (state.analysis ? ' التوقيت الحالي تقديري — راجعه.' : ' حمّل الصوت لحساب التوقيت.'), 4000);
}

function autoAlign(silent) {
  if (!state.analysis) return msg('حلّل الصوت أولًا.', 3000);
  if (!state.project.lines.length) return msg('أضف الكلمات أولًا.', 3000);
  if (!state.analysis.segments.length) { msg('لم تُكتشف مناطق غناء. خفّض «حساسية كشف الغناء» أو استخدم المزامنة بالنقر.', 5000); return; }
  alignLines(state.project.lines, state.analysis);
  renderer.rebuild(); renderTable(); syncTimeline(); redraw(); autosave();
  if (!silent) msg('تمت المحاذاة التلقائية. الأسطر المخططة بالبرتقالي تقديرية — أكّدها بالاستماع.', 4000);
}

// ———————————————— الجدول ————————————————
function renderTable() {
  const tb = $('linesTable').tBodies[0];
  tb.innerHTML = '';
  state.project.lines.forEach((l, i) => {
    const tr = document.createElement('tr');
    tr.dataset.i = i;
    if (i === state.selected) tr.classList.add('selected');
    const sceneOpts = LYRIC_SCENES.map((k) => `<option value="${k}" ${k === l.scene ? 'selected' : ''}>${SCENE_NAMES[k]}</option>`).join('');
    const trOpts = Object.entries(TRANSITION_NAMES).map(([k, v]) => `<option value="${k}" ${k === (l.transition || 'auto') ? 'selected' : ''}>${v}</option>`).join('');
    const badge = l.status === 'confirmed' ? `<span class="badge confirmed">مؤكد${l.source === 'tap' ? ' (نقر)' : l.source === 'lrc' ? ' (LRC)' : ''}</span>` : l.status === 'auto' ? '<span class="badge auto">تقدير آلي</span>' : '<span class="badge none">بلا توقيت</span>';
    tr.innerHTML = `<td>${i + 1}</td>
      <td class="text"><div contenteditable="true" spellcheck="false"></div><div class="words" hidden></div></td>
      <td><input type="number" step="0.01" min="0" class="st" value="${l.start != null ? l.start.toFixed(2) : ''}"></td>
      <td><input type="number" step="0.01" min="0" class="en" value="${l.end != null ? l.end.toFixed(2) : ''}"></td>
      <td><select class="sc">${sceneOpts}</select><span class="reason">${l.sceneReason || ''}</span></td>
      <td><select class="tr">${trOpts}</select></td>
      <td>${badge}</td>
      <td><div class="icons"><button class="ghost play" title="تشغيل السطر">▶</button><button class="ghost wbtn" title="توقيت الكلمات">ك</button>${l.status === 'auto' ? '<button class="ghost ok" title="تأكيد بعد الاستماع">✓</button>' : ''}</div></td>`;
    tr.querySelector('[contenteditable]').textContent = l.text;
    tb.appendChild(tr);
  });
}

$('linesTable').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-i]'); if (!tr) return;
  const i = Number(tr.dataset.i), l = state.project.lines[i];
  select(i);
  if (e.target.closest('.play')) { if (l.start != null) { seek(Math.max(0, l.start - 0.5)); play(); stopAt = l.end + 0.6; } }
  if (e.target.closest('.wbtn')) toggleWords(tr, l);
  if (e.target.closest('.ok')) { l.status = 'confirmed'; l.source = 'manual'; renderTable(); syncTimeline(); autosave(); }
});
$('linesTable').addEventListener('change', (e) => {
  const tr = e.target.closest('tr[data-i]'); if (!tr) return;
  const l = state.project.lines[Number(tr.dataset.i)];
  if (e.target.classList.contains('sc')) { l.scene = e.target.value; l.sceneReason = 'اختيار يدوي'; }
  else if (e.target.classList.contains('tr')) l.transition = e.target.value;
  else if (e.target.classList.contains('st') || e.target.classList.contains('en')) {
    const s = parseFloat(tr.querySelector('.st').value), en = parseFloat(tr.querySelector('.en').value);
    if (isFinite(s) && isFinite(en) && en > s) {
      l.start = s; l.end = en; l.status = 'confirmed'; l.source = 'manual';
      if (!l.wordsTapped) { for (const w of l.words) { delete w.start; delete w.end; } fillWordTimes(l, state.analysis); }
    }
  } else if (e.target.dataset.w != null) {
    const w = l.words[Number(e.target.dataset.w)], v = parseFloat(e.target.value);
    if (isFinite(v)) { w.start = v; l.words.forEach((x, k) => { const nx = l.words[k + 1]; if (nx && nx.start != null && x.start != null) x.end = Math.min(x.end ?? nx.start, nx.start); }); l.wordsTapped = true; l.status = 'confirmed'; l.source = 'manual'; }
  }
  renderer.rebuild(); renderTable(); syncTimeline(); redraw(); autosave();
});
$('linesTable').addEventListener('focusout', (e) => {
  if (!e.target.matches('[contenteditable]')) return;
  const tr = e.target.closest('tr[data-i]'), l = state.project.lines[Number(tr.dataset.i)];
  const text = e.target.textContent.trim();
  if (!text || text === l.text) return;
  l.text = text; l.words = splitWords(text).map((w) => ({ text: w })); l.wordsTapped = false;
  fillWordTimes(l, state.analysis);
  renderer.rebuild(); syncTimeline(); redraw(); autosave();
});

function toggleWords(tr, l) {
  const box = tr.querySelector('.words');
  box.hidden = !box.hidden;
  if (box.hidden) return;
  box.innerHTML = l.words.map((w, k) => `<span class="w" data-k="${k}">${w.text}<input type="number" step="0.01" data-w="${k}" value="${w.start != null ? w.start.toFixed(2) : ''}"></span>`).join('');
}

function select(i) {
  state.selected = i;
  timeline.selected = i;
  $('tapWords').disabled = !(i >= 0 && state.buffer && state.project.lines[i]);
  for (const tr of $('linesTable').tBodies[0].rows) tr.classList.toggle('selected', Number(tr.dataset.i) === i);
  timeline.draw();
}

function syncTimeline() { timeline.lines = state.project.lines; timeline.shots = renderer.shots; timeline.draw(); }

// ———————————————— التشغيل ————————————————
let stopAt = null, lastActive = -2;
function play() { audioGraph().resume(); audio.play(); }
function pause() { audio.pause(); }
function seek(t) { audio.currentTime = t; timeline.setTime(t); redraw(); }
$('playBtn').addEventListener('click', () => (audio.paused ? play() : pause()));
audio.addEventListener('play', () => { $('playBtn').textContent = '⏸ إيقاف'; loop(); });
audio.addEventListener('pause', () => { $('playBtn').textContent = '▶ تشغيل'; });
$('fullBtn').addEventListener('click', () => $('stage').requestFullscreen?.());
$('zoom').addEventListener('input', (e) => timeline.setZoom(Number(e.target.value)));

function redraw() {
  const t = audio.currentTime || 0;
  const info = renderer.render(t);
  const sh = renderer.shots[info.shot];
  $('timeView').textContent = `${fmt(t)} / ${fmt(state.buffer?.duration || 0)}`;
  $('shotView').textContent = sh ? `${SCENE_NAMES[sh.scene] || sh.scene}${info.transition ? ' ← انتقال: ' + (TRANSITION_NAMES[info.transition.type] || '') : ''}` : '';
  const act = activeLineIndex(state.project.lines, t);
  if (act !== lastActive) { lastActive = act; for (const tr of $('linesTable').tBodies[0].rows) tr.classList.toggle('active', Number(tr.dataset.i) === act); }
  if (!state.buffer) msg('ابدأ بتحميل ملف الأغنية، ثم الصق الكلمات الصحيحة.');
  else if (!state.project.lines.length) msg('أضف كلمات الأغنية واضغط «اعتماد الكلمات» — لا تُخمَّن الكلمات تلقائيًا.');
  else if ($('msg').textContent.startsWith('ابدأ') || $('msg').textContent.startsWith('أضف كلمات')) msg('');
}

function loop() {
  if (audio.paused && !recording) return;
  const t = audio.currentTime;
  if (stopAt != null && t >= stopAt) { stopAt = null; pause(); }
  redraw();
  timeline.setTime(t);
  requestAnimationFrame(loop);
}

// ———————————————— المزامنة بالنقر ————————————————
function startTap(mode) {
  if (!state.buffer || !state.project.lines.length) return;
  if (state.tap) return endTap();
  if (mode === 'lines') {
    const idx = Math.max(0, state.selected);
    state.tap = { mode, idx, down: false };
    const prev = state.project.lines[idx - 1];
    seek(Math.max(0, prev?.end != null ? prev.end - 1 : audio.currentTime));
    $('tapHelp').innerHTML = `<b>اضغط مع بداية السطر ${idx + 1} وارفع إصبعك عند نهايته</b> — زر المسافة أو اضغط مطوّلًا على المعاينة. Esc للإنهاء.`;
  } else {
    const idx = state.selected, l = state.project.lines[idx];
    if (!l) return;
    state.tap = { mode, idx, k: 0, down: false };
    seek(Math.max(0, (l.start ?? audio.currentTime) - 1.5));
    $('tapHelp').innerHTML = `<b>اضغط مع بداية كل كلمة من السطر ${idx + 1}</b>، وارفع عند نهاية الكلمة الأخيرة. Esc للإنهاء.`;
  }
  $(mode === 'lines' ? 'tapLines' : 'tapWords').classList.add('rec');
  play();
}
function endTap() {
  if (!state.tap) return;
  $('tapLines').classList.remove('rec'); $('tapWords').classList.remove('rec');
  state.tap = null; $('tapHelp').textContent = ''; pause();
  renderer.rebuild(); renderTable(); syncTimeline(); autosave();
}
function tapDown() {
  const tp = state.tap; if (!tp || tp.down) return;
  tp.down = true;
  const t = audio.currentTime, lines = state.project.lines;
  if (tp.mode === 'lines') {
    const l = lines[tp.idx]; if (!l) return endTap();
    const dur = l.end != null && l.start != null ? l.end - l.start : 2;
    l.start = t; l.end = t + dur; l.status = 'confirmed'; l.source = 'tap'; l.wordsTapped = false;
  } else {
    const l = lines[tp.idx], w = l.words[tp.k];
    if (!w) return;
    if (tp.k === 0) l.start = t;
    if (tp.k > 0) l.words[tp.k - 1].end = t;
    w.start = t; w.end = Math.max(t + 0.1, l.end ?? t + 0.5);
  }
  renderer.rebuild(); syncTimeline();
}
function tapUp() {
  const tp = state.tap; if (!tp || !tp.down) return;
  tp.down = false;
  const t = audio.currentTime, lines = state.project.lines;
  if (tp.mode === 'lines') {
    const l = lines[tp.idx];
    l.end = Math.max(l.start + 0.15, t);
    for (const w of l.words) { delete w.start; delete w.end; }
    fillWordTimes(l, state.analysis);
    // السطر التالي لا يبدأ قبل نهاية هذا
    tp.idx++;
    if (tp.idx >= lines.length) { endTap(); msg('اكتملت مزامنة جميع الأسطر ✓', 3000); return; }
    select(tp.idx);
    $('tapHelp').innerHTML = `<b>السطر ${tp.idx + 1}:</b> «${lines[tp.idx].text}»`;
  } else {
    const l = lines[tp.idx];
    tp.k++;
    if (tp.k >= l.words.length) {
      l.words[l.words.length - 1].end = Math.max(l.words[l.words.length - 1].start + 0.08, t);
      l.end = l.words[l.words.length - 1].end; l.status = 'confirmed'; l.source = 'tap'; l.wordsTapped = true;
      endTap(); msg(`تمت مزامنة كلمات السطر ${tp.idx + 1} ✓`, 3000); return;
    }
  }
  renderer.rebuild(); renderTable(); syncTimeline();
}
$('tapLines').addEventListener('click', () => startTap('lines'));
$('tapWords').addEventListener('click', () => startTap('words'));
window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, [contenteditable], select')) return;
  if (e.code === 'Space') { e.preventDefault(); if (state.tap) tapDown(); else if (state.buffer) (audio.paused ? play() : pause()); }
  if (e.code === 'Escape') endTap();
});
window.addEventListener('keyup', (e) => { if (e.code === 'Space' && state.tap) { e.preventDefault(); tapUp(); } });
$('stage').addEventListener('pointerdown', () => state.tap && tapDown());
$('stage').addEventListener('pointerup', () => state.tap && tapUp());

// ———————————————— الإخراج: النمط والمقاس وطريقة عرض الكلمات ————————————————
function applyOutput() {
  const p = state.project, c = $('stage');
  const [w, h] = p.aspect === '16:9' ? [1280, 720] : [720, 1280];
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  c.style.setProperty('--ar', p.aspect === '16:9' ? '16 / 9' : '9 / 16');
  c.classList.toggle('landscape', p.aspect === '16:9');
  $('styleSel').value = p.style; $('aspectSel').value = p.aspect; $('textModeSel').value = p.textMode;
  renderer.rebuild(); redraw();
}
$('styleSel').addEventListener('change', (e) => { state.project.style = e.target.value; applyOutput(); autosave(); });
$('aspectSel').addEventListener('change', (e) => { state.project.aspect = e.target.value; applyOutput(); autosave(); });
$('textModeSel').addEventListener('change', (e) => { state.project.textMode = e.target.value; applyOutput(); autosave(); });

// ———————————————— الصورة ————————————————
function loadImageURL(url, cropRect) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => { crop.setImage(img, cropRect); renderer.setData({ eyes: crop.source() }); redraw(); res(); };
    img.onerror = rej; img.src = url;
  });
}
$('imageFile').addEventListener('change', (e) => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { state.imageData = r.result; loadImageURL(r.result).then(autosave); };
  r.readAsDataURL(f);
});
$('eyeMode').addEventListener('change', (e) => { crop.mode = e.target.value; crop.draw(); renderer.setData({ eyes: crop.source() }); redraw(); autosave(); });

// ———————————————— المدخلات ————————————————
$('audioFile').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) loadAudioFile(f).catch((err) => { $('audioInfo').innerHTML = `<span class="warn">تعذّر قراءة الملف الصوتي: ${err.message}</span>`; }); });
$('analyzeBtn').addEventListener('click', analyze);
$('applyLyrics').addEventListener('click', applyLyrics);
$('autoAlign').addEventListener('click', () => autoAlign(false));
$('lyricsFile').addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) { $('lyricsInput').value = await f.text(); applyLyrics(); } });
$('songTitle').addEventListener('input', (e) => { state.project.title = e.target.value; $('titleView').textContent = e.target.value; renderer.project.title = e.target.value; redraw(); autosave(); });

// ———————————————— الحفظ ————————————————
function projectJSON() {
  return { app: 'cartoon-clip-studio', version: 1, title: state.project.title, audioName: state.audioName, lines: state.project.lines, eyes: { image: state.imageData, crop: crop.crop, mode: crop.mode }, aspect: state.project.aspect, style: state.project.style, textMode: state.project.textMode, lyricsText: $('lyricsInput').value, vocalThreshold: Number($('vocalThr').value) };
}
function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
$('saveProject').addEventListener('click', () => download('shift-kalam-project.json', new Blob([JSON.stringify(projectJSON(), null, 1)], { type: 'application/json' })));
$('exportLrc').addEventListener('click', () => { if (!state.project.lines.some((l) => l.start != null)) return msg('لا توجد توقيتات بعد.', 3000); download('shift-kalam.lrc', new Blob([toLRC(state.project.lines)], { type: 'text/plain' })); });
$('loadProject').addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) restore(JSON.parse(await f.text())); });

async function restore(p) {
  if (!p || !Array.isArray(p.lines)) return;
  state.project.title = p.title || 'شفت كلام'; $('songTitle').value = state.project.title; $('titleView').textContent = state.project.title;
  state.project.lines = p.lines;
  if (p.aspect) state.project.aspect = p.aspect;
  if (p.style) state.project.style = p.style;
  if (p.textMode) state.project.textMode = p.textMode;
  applyOutput();
  $('lyricsInput').value = p.lyricsText || p.lines.map((l) => l.text).join('\n');
  if (p.vocalThreshold) $('vocalThr').value = p.vocalThreshold;
  if (p.eyes?.mode) { crop.mode = p.eyes.mode; $('eyeMode').value = p.eyes.mode; }
  if (p.eyes?.image) { state.imageData = p.eyes.image; await loadImageURL(p.eyes.image, p.eyes.crop).catch(() => {}); }
  renderer.setData({ project: state.project });
  renderTable(); syncTimeline(); redraw();
  if (p.audioName && !state.buffer) msg(`حُمّل المشروع. أعد تحميل ملف الصوت «${p.audioName}».`, 5000);
}
let saveTimer = null;
function autosave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem('clipStudio.project', JSON.stringify(projectJSON())); } catch { /* المساحة أو الوضع الخاص */ } }, 400); }

// ———————————————— التصدير ————————————————
let recording = false;
$('exportBtn').addEventListener('click', () => exportVideo().catch((e) => { recording = false; $('exportInfo').innerHTML = `<span class="warn">فشل التصدير: ${e.message}</span>`; }));
async function exportVideo(opts = {}) {
  if (!state.buffer) throw new Error('لا يوجد ملف صوتي');
  const unconfirmed = state.project.lines.filter((l) => l.status !== 'confirmed').length;
  const from = opts.from ?? (parseFloat($('expFrom').value) || 0);
  const to = opts.to ?? (parseFloat($('expTo').value) || state.buffer.duration);
  const sc = Number(opts.res || $('expRes').value) || 1;
  const [w, h] = (state.project.aspect === '16:9' ? [1280, 720] : [720, 1280]).map((v) => Math.round(v * sc));
  const canvas = $('stage'), ow = canvas.width, oh = canvas.height;
  canvas.width = w; canvas.height = h;
  audioGraph(); await actx.resume();
  const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...streamDest.stream.getAudioTracks()]);
  const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: sc > 1 ? 12e6 : 6e6 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((r) => (rec.onstop = r));
  pause();
  const seeked = new Promise((r) => { audio.addEventListener('seeked', r, { once: true }); setTimeout(r, 1500); });
  audio.currentTime = from;
  await seeked;
  recording = true; $('exportBtn').disabled = true;
  rec.start(500);
  stopAt = to;
  await audio.play();
  loop();
  await new Promise((r) => { const iv = setInterval(() => { $('exportInfo').textContent = `جارٍ التسجيل… ${fmt(audio.currentTime)} / ${fmt(to)}`; if (audio.paused || audio.ended || audio.currentTime >= to) { clearInterval(iv); r(); } }, 200); });
  pause(); rec.stop(); await done; recording = false;
  canvas.width = ow; canvas.height = oh; redraw();
  $('exportBtn').disabled = false;
  const blob = new Blob(chunks, { type: 'video/webm' });
  $('exportInfo').innerHTML = `اكتمل: ${(blob.size / 1e6).toFixed(1)} ميغابايت.` + (unconfirmed ? ` <span class="warn">تنبيه: ${unconfirmed} سطرًا بتوقيت تقديري غير مؤكد.</span>` : '');
  if (!opts.noDownload) download('shift-kalam-clip.webm', blob);
  return blob;
}

// ———————————————— البدء ————————————————
(async function init() {
  try { await Promise.all([document.fonts.load('80px "Lalezar"'), document.fonts.load('20px "Cairo"')]); } catch { /* يُستخدم خط بديل */ }
  try { const saved = JSON.parse(localStorage.getItem('clipStudio.project') || 'null'); if (saved) await restore(saved); } catch { /* تجاهل */ }
  renderer.setData({ project: state.project, eyes: crop.source(), duration: 10 });
  applyOutput();
  renderTable(); redraw();
  setInterval(() => crop.draw(), 120);
})();

// واجهة للاختبارات الآلية
window.__app = {
  state, renderer, timeline,
  loadAudioFile, applyLyrics, autoAlign, analyze, exportVideo, loadImageURL, restore,
  setLyrics: (t) => { $('lyricsInput').value = t; applyLyrics(); },
  renderAt: (t) => { audio.currentTime = t; return renderer.render(t); },
  tapDown, tapUp, startTap, endTap,
};
