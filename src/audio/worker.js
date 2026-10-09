import { analyzeAudio } from './analysis.js';

self.onmessage = (e) => {
  const { channels, sampleRate, opts } = e.data;
  try {
    const a = analyzeAudio(channels, sampleRate, opts);
    self.postMessage({ ok: true, analysis: a }, [a.onset.buffer, a.energy.buffer, a.vocal.buffer, a.bands.buffer]);
  } catch (err) {
    self.postMessage({ ok: false, error: String(err && err.stack || err) });
  }
};
