import { drawEyes } from '../render/character.js';

// محرر القص: يرسم الصورة ويسمح بسحب مستطيل يحدد منطقة العيون (بإحداثيات الصورة الأصلية)
export class CropEditor {
  constructor(canvas, preview, onChange) {
    this.c = canvas; this.ctx = canvas.getContext('2d'); this.p = preview; this.onChange = onChange;
    this.img = null; this.crop = null; this.mode = 'pair'; this.drag = null;
    canvas.addEventListener('pointerdown', (e) => { if (!this.img) return; const p = this.pt(e); this.drag = p; this.crop = { x: p.x, y: p.y, w: 1, h: 1 }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.drag) return; const p = this.pt(e), d = this.drag;
      this.crop = { x: Math.min(d.x, p.x), y: Math.min(d.y, p.y), w: Math.max(4, Math.abs(p.x - d.x)), h: Math.max(4, Math.abs(p.y - d.y)) };
      this.draw();
    });
    canvas.addEventListener('pointerup', () => { if (this.drag) { this.drag = null; this.draw(); this.onChange?.(); } });
    this.draw();
  }
  pt(e) {
    const r = this.c.getBoundingClientRect(), sx = (e.clientX - r.left) * (this.c.width / r.width), sy = (e.clientY - r.top) * (this.c.height / r.height);
    return { x: Math.max(0, Math.min(this.img.width, (sx - this.ox) / this.sc)), y: Math.max(0, Math.min(this.img.height, (sy - this.oy) / this.sc)) };
  }
  setImage(img, crop) {
    this.img = img;
    this.crop = crop || { x: img.width * 0.2, y: img.height * 0.3, w: img.width * 0.6, h: img.height * 0.25 };
    this.draw();
  }
  source() { return this.img ? { img: this.img, crop: this.crop, mode: this.mode } : null; }
  draw() {
    const { ctx, c } = this;
    ctx.clearRect(0, 0, c.width, c.height);
    if (!this.img) { ctx.fillStyle = '#888'; ctx.font = '14px Cairo'; ctx.textAlign = 'center'; ctx.fillText('لم تُحمَّل صورة — ستُستخدم عيون كرتونية افتراضية', c.width / 2, c.height / 2); }
    else {
      this.sc = Math.min(c.width / this.img.width, c.height / this.img.height);
      this.ox = (c.width - this.img.width * this.sc) / 2; this.oy = (c.height - this.img.height * this.sc) / 2;
      ctx.drawImage(this.img, this.ox, this.oy, this.img.width * this.sc, this.img.height * this.sc);
      const r = this.crop;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.rect(0, 0, c.width, c.height); ctx.rect(this.ox + r.x * this.sc, this.oy + r.y * this.sc, r.w * this.sc, r.h * this.sc); ctx.fill('evenodd');
      ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 2; ctx.strokeRect(this.ox + r.x * this.sc, this.oy + r.y * this.sc, r.w * this.sc, r.h * this.sc);
    }
    const p = this.p.getContext('2d');
    p.clearRect(0, 0, this.p.width, this.p.height);
    p.fillStyle = '#f6c9a4'; p.beginPath(); p.ellipse(80, 70, 72, 62, 0, 0, Math.PI * 2); p.fill(); p.lineWidth = 3; p.strokeStyle = '#1d1830'; p.stroke();
    drawEyes(p, 80, 60, 60, { eyeSource: this.source(), look: { x: Math.sin(performance.now() / 700) * 0.6, y: 0 } });
  }
}
