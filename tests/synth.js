// إشارة اختبار اصطناعية بحقيقة معروفة: ضربات كيك على إيقاع ثابت + «غناء» متمركز في مقاطع محددة + آلة عريضة الستيريو.
// ليست الأغنية — تُستخدم فقط للتحقق من دقة التحليل.
export function synthSong({ sr = 44100, duration = 16, bpm = 120, offset = 0.25, vocals = [[2.0, 4.6], [5.3, 7.4], [9.0, 12.2], [13.0, 14.6]] } = {}) {
  const n = Math.round(sr * duration);
  const L = new Float32Array(n), R = new Float32Array(n);
  const period = 60 / bpm, beats = [];
  for (let t = offset; t < duration - 0.05; t += period) beats.push(t);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296) * 2 - 1;
  for (const b of beats) {
    const s0 = Math.round(b * sr);
    for (let i = 0; i < sr * 0.15 && s0 + i < n; i++) {
      const t = i / sr, env = Math.exp(-t / 0.04);
      const v = 0.6 * env * Math.sin(2 * Math.PI * (55 + 90 * Math.exp(-t / 0.02)) * t) + 0.15 * env * rnd() * Math.exp(-t / 0.01);
      L[s0 + i] += v; R[s0 + i] += v;
    }
  }
  // آلة مستمرة عريضة (معاكسة الطور بين القناتين)
  for (let i = 0; i < n; i++) { const t = i / sr, v = 0.05 * Math.sin(2 * Math.PI * 330 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.5 * t)); L[i] += v; R[i] -= v; }
  for (const [a, b] of vocals) {
    for (let i = Math.round(a * sr); i < Math.round(b * sr); i++) {
      const t = i / sr, rel = t - a, env = Math.min(1, rel / 0.03, (b - t) / 0.03);
      const f0 = 220 + 30 * Math.sin(2 * Math.PI * 5 * t) + 40 * Math.sin(2 * Math.PI * 0.7 * rel);
      let v = 0;
      for (let h = 1; h <= 8; h++) v += Math.sin(2 * Math.PI * f0 * h * t) / h;
      v *= 0.12 * env * (0.75 + 0.25 * Math.sin(2 * Math.PI * 4 * rel));
      L[i] += v; R[i] += v;
    }
  }
  return { sr, channels: [L, R], beats, vocals, bpm };
}

export function writeWav(path, { sr, channels }, fs) {
  const n = channels[0].length, ch = channels.length, buf = Buffer.alloc(44 + n * ch * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * ch * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * ch * 2, 28); buf.writeUInt16LE(ch * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * ch * 2, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(channels[c][i] * 32767))), 44 + (i * ch + c) * 2);
  fs.writeFileSync(path, buf);
}
