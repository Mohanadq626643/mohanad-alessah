// الخط الزمني: موجة الصوت + مناطق الغناء + الضربات + كتل الأسطر القابلة للسحب
export class Timeline {
  constructor(canvas, { onSeek, onChange, onSelect }) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.onSeek = onSeek; this.onChange = onChange; this.onSelect = onSelect;
    this.peaks = null; this.duration = 0; this.zoom = 1; this.view0 = 0; this.time = 0;
    this.lines = []; this.analysis = null; this.shots = []; this.selected = -1; this.drag = null;
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', () => this.up());
    canvas.addEventListener('wheel', (e) => { if (!this.duration) return; e.preventDefault(); this.view0 = Math.max(0, Math.min(this.duration - this.span(), this.view0 + (e.deltaY + e.deltaX) * this.span() / 1500)); this.draw(); }, { passive: false });
    new ResizeObserver(() => this.resize()).observe(canvas);
  }
  resize() { const r = this.c.getBoundingClientRect(); this.c.width = Math.max(300, Math.round(r.width * devicePixelRatio)); this.c.height = Math.round(170 * devicePixelRatio); this.draw(); }
  setAudio(buffer) {
    this.duration = buffer.duration;
    const ch = buffer.getChannelData(0), n = 4000, step = Math.max(1, Math.floor(ch.length / n));
    this.peaks = new Float32Array(n);
    for (let i = 0; i < n; i++) { let m = 0; for (let k = i * step; k < Math.min(ch.length, (i + 1) * step); k += 4) m = Math.max(m, Math.abs(ch[k])); this.peaks[i] = m; }
    this.draw();
  }
  span() { return this.duration / this.zoom; }
  setZoom(z) { const center = this.time; this.zoom = z; this.view0 = Math.max(0, Math.min(this.duration - this.span(), center - this.span() / 2)); this.draw(); }
  // RTL: الزمن يتقدم من اليمين إلى اليسار
  x(t) { return this.c.width - ((t - this.view0) / this.span()) * this.c.width; }
  t(x) { return this.view0 + ((this.c.width - x) / this.c.width) * this.span(); }
  evX(e) { const r = this.c.getBoundingClientRect(); return (e.clientX - r.left) * (this.c.width / r.width); }
  evY(e) { const r = this.c.getBoundingClientRect(); return (e.clientY - r.top) * (this.c.height / r.height); }
  hitLine(x, y) {
    const H = this.c.height, ly = H * 0.62, lh = H * 0.3;
    if (y < ly || y > ly + lh) return null;
    const tol = 6 * devicePixelRatio;
    for (let i = 0; i < this.lines.length; i++) {
      const l = this.lines[i]; if (l.start == null) continue;
      const xs = this.x(l.start), xe = this.x(l.end);
      if (Math.abs(x - xs) < tol) return { i, edge: 'start' };
      if (Math.abs(x - xe) < tol) return { i, edge: 'end' };
      if (x < xs && x > xe) return { i, edge: 'move' };
    }
    return null;
  }
  down(e) {
    if (!this.duration) return;
    const x = this.evX(e), y = this.evY(e), h = this.hitLine(x, y);
    if (h) {
      const l = this.lines[h.i];
      this.drag = { ...h, t0: this.t(x), s0: l.start, e0: l.end, w0: l.words.map((w) => [w.start, w.end]) };
      this.selected = h.i; this.onSelect?.(h.i);
      this.c.setPointerCapture(e.pointerId);
    } else this.onSeek?.(Math.max(0, Math.min(this.duration, this.t(x))));
    this.draw();
  }
  move(e) {
    const x = this.evX(e);
    if (!this.drag) { const h = this.hitLine(x, this.evY(e)); this.c.style.cursor = h ? (h.edge === 'move' ? 'grab' : 'ew-resize') : 'pointer'; return; }
    const d = this.drag, l = this.lines[d.i], dt = this.t(x) - d.t0;
    const prev = this.lines.slice(0, d.i).reverse().find((q) => q.start != null), next = this.lines.slice(d.i + 1).find((q) => q.start != null);
    const lo = prev ? prev.end + 0.02 : 0, hi = next ? next.start - 0.02 : this.duration;
    let ns = d.s0, ne = d.e0;
    if (d.edge === 'start') ns = Math.min(d.e0 - 0.15, Math.max(lo, d.s0 + dt));
    else if (d.edge === 'end') ne = Math.max(d.s0 + 0.15, Math.min(hi, d.e0 + dt));
    else { const sh = Math.max(lo - d.s0, Math.min(hi - d.e0, dt)); ns = d.s0 + sh; ne = d.e0 + sh; }
    // إعادة قياس الكلمات بنسبة التغيير
    l.words.forEach((w, k) => { const [a, b] = d.w0[k]; if (a == null) return; const f = (v) => ns + ((v - d.s0) / (d.e0 - d.s0)) * (ne - ns); w.start = f(a); w.end = f(b); });
    l.start = ns; l.end = ne; l.status = 'confirmed'; l.source = 'manual';
    this.draw();
  }
  up() { if (this.drag) { this.drag = null; this.onChange?.(); } }
  draw() {
    const { ctx, c } = this, W = c.width, H = c.height, dpr = devicePixelRatio;
    const css = getComputedStyle(document.documentElement);
    ctx.clearRect(0, 0, W, H);
    if (!this.duration) { ctx.fillStyle = css.getPropertyValue('--muted'); ctx.font = `${14 * dpr}px Cairo`; ctx.textAlign = 'center'; ctx.fillText('حمّل ملف الأغنية لعرض الخط الزمني', W / 2, H / 2); return; }
    const a = this.analysis;
    // مناطق الغناء
    if (a) { ctx.fillStyle = 'rgba(46,196,182,0.22)'; for (const s of a.segments) { const x1 = this.x(s.end), x0 = this.x(s.start); if (x0 < 0 || x1 > W) { if (x0 < 0 && x1 < 0) continue; if (x1 > W && x0 > W) continue; } ctx.fillRect(x1, 0, x0 - x1, H * 0.6); } }
    // الموجة
    const mid = H * 0.3; ctx.fillStyle = '#8a80b8';
    if (this.peaks) for (let x = 0; x < W; x += dpr) { const t = this.t(x); const v = this.peaks[Math.min(this.peaks.length - 1, Math.max(0, Math.floor((t / this.duration) * this.peaks.length)))] || 0; ctx.fillRect(x, mid - v * mid * 0.95, dpr, v * mid * 1.9); }
    // الضربات
    if (a) {
      const down = new Set(a.downbeats.map((b) => b.toFixed(3)));
      for (const b of a.beats) { const x = this.x(b); if (x < 0 || x > W) continue; const d = down.has(b.toFixed(3)); ctx.fillStyle = d ? '#ff5d8f' : 'rgba(255,93,143,0.45)'; ctx.fillRect(x, d ? 0 : H * 0.48, dpr * (d ? 2 : 1), d ? H * 0.6 : H * 0.12); }
    }
    // حدود اللقطات
    ctx.strokeStyle = 'rgba(128,128,128,0.5)'; ctx.setLineDash([4 * dpr, 4 * dpr]);
    for (const s of this.shots) { const x = this.x(s.start); ctx.beginPath(); ctx.moveTo(x, H * 0.6); ctx.lineTo(x, H); ctx.stroke(); }
    ctx.setLineDash([]);
    // الأسطر
    const ly = H * 0.62, lh = H * 0.3;
    ctx.font = `${13 * dpr}px Cairo`; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
    this.lines.forEach((l, i) => {
      if (l.start == null) return;
      const xs = this.x(l.start), xe = this.x(l.end);
      if (xs < 0 || xe > W) return;
      ctx.fillStyle = i === this.selected ? '#8f6bff' : '#6c3cf0';
      ctx.fillRect(xe, ly, xs - xe, lh);
      if (l.status !== 'confirmed') { ctx.save(); ctx.beginPath(); ctx.rect(xe, ly, xs - xe, lh); ctx.clip(); ctx.strokeStyle = '#ffb547'; ctx.lineWidth = 3 * dpr; for (let k = xe - lh; k < xs; k += 10 * dpr) { ctx.beginPath(); ctx.moveTo(k, ly + lh); ctx.lineTo(k + lh, ly); ctx.stroke(); } ctx.restore(); }
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (const w of l.words) if (w.start != null) ctx.fillRect(this.x(w.start), ly, dpr, lh * 0.35);
      ctx.save(); ctx.beginPath(); ctx.rect(xe, ly, xs - xe, lh); ctx.clip(); ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.fillText(`${i + 1}. ${l.text}`, xs - 4 * dpr, ly + lh * 0.62); ctx.restore();
    });
    // رأس التشغيل
    const px = this.x(this.time); ctx.fillStyle = '#ff3d3d'; ctx.fillRect(px - dpr, 0, 2 * dpr, H);
    ctx.fillStyle = css.getPropertyValue('--muted'); ctx.font = `${11 * dpr}px monospace`; ctx.textAlign = 'right'; ctx.direction = 'ltr';
    const step = this.span() > 120 ? 20 : this.span() > 40 ? 5 : this.span() > 10 ? 1 : 0.5;
    for (let t = Math.ceil(this.view0 / step) * step; t < this.view0 + this.span(); t += step) { const x = this.x(t); ctx.fillRect(x, H - 6 * dpr, dpr, 6 * dpr); ctx.fillText(t.toFixed(step < 1 ? 1 : 0), x - 2 * dpr, H - 10 * dpr); }
  }
  setTime(t) {
    this.time = t;
    if (this.zoom > 1 && (t < this.view0 || t > this.view0 + this.span())) this.view0 = Math.max(0, Math.min(this.duration - this.span(), t - this.span() * 0.1));
    this.draw();
  }
}
