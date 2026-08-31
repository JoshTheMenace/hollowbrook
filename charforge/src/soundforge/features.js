import { SR, biquad } from './dsp.js';
import { stft } from './fft.js';

// SoundForge measurement — the numbers the gates assert on. All analysis is
// on the RENDERED buffers, so the evidence is the shipped audio itself.

// --- Loudness: ITU-R BS.1770 integrated LUFS -------------------------------
export function lufs([L, R]) {
  const kWeight = () => {
    const shelf = biquad('highshelf', 1681.97, 0.7071, 3.99);
    const hp = biquad('highpass', 38.13, 0.5);
    return (x) => hp(shelf(x));
  };
  const kwL = kWeight(), kwR = kWeight();
  const block = Math.round(0.4 * SR), hop = Math.round(0.1 * SR);
  // running K-weighted squares
  const sqL = new Float32Array(L.length), sqR = new Float32Array(R.length);
  for (let i = 0; i < L.length; i++) { const a = kwL(L[i]); sqL[i] = a * a; const b = kwR(R[i]); sqR[i] = b * b; }
  const blocks = [];
  for (let s = 0; s + block <= L.length; s += hop) {
    let sum = 0;
    for (let i = s; i < s + block; i++) sum += sqL[i] + sqR[i];
    const ms = sum / block;
    blocks.push(-0.691 + 10 * Math.log10(ms + 1e-12));
  }
  const gated1 = blocks.filter((b) => b > -70);
  if (!gated1.length) return -Infinity;
  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const pow = (arr) => 10 * Math.log10(mean(arr.map((b) => Math.pow(10, b / 10))));
  const rel = pow(gated1) - 10;
  const gated2 = gated1.filter((b) => b > rel);
  return gated2.length ? +pow(gated2).toFixed(2) : -Infinity;
}

export function peakDb([L, R]) {
  let p = 0;
  for (const ch of [L, R]) for (let i = 0; i < ch.length; i++) { const a = Math.abs(ch[i]); if (a > p) p = a; }
  return +(20 * Math.log10(p + 1e-12)).toFixed(2);
}

// --- Spectral balance: band energies in dB (relative to total) -------------
export const BANDS = [
  ['sub', 20, 60], ['low', 60, 250], ['lowmid', 250, 800],
  ['mid', 800, 2500], ['high', 2500, 8000], ['air', 8000, 16000],
];
export function spectralBands([L, R]) {
  const mono = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) mono[i] = (L[i] + R[i]) * 0.5;
  const frames = stft(mono, 4096, 2048);
  const binHz = SR / 4096;
  const acc = {};
  for (const [name] of BANDS) acc[name] = 0;
  let total = 0;
  for (const f of frames) {
    for (const [name, lo, hi] of BANDS) {
      let e = 0;
      for (let b = Math.floor(lo / binHz); b < Math.min(f.length, Math.ceil(hi / binHz)); b++) e += f[b] * f[b];
      acc[name] += e;
      total += e;
    }
  }
  const out = {};
  for (const [name] of BANDS) out[name] = +(10 * Math.log10(acc[name] / (total + 1e-12) + 1e-12)).toFixed(1);
  return out;
}

// --- Chroma per beat (pitch-class energy) — basis for similarity -----------
export function chromaFrames(mono, secPerBeat) {
  const n = 4096, binHz = SR / n;
  const hop = Math.round(secPerBeat * SR);
  const frames = [];
  const win = Math.min(n, hop);
  for (let s = 0; s + n <= mono.length; s += hop) {
    const seg = mono.subarray(s, s + n);
    const mags = stft(seg, n, n)[0];
    if (!mags) break;
    const ch = new Float32Array(12);
    for (let b = Math.floor(60 / binHz); b < Math.floor(5000 / binHz); b++) {
      const f = b * binHz;
      const pc = ((Math.round(12 * Math.log2(f / 440)) % 12) + 12 + 9) % 12;
      ch[pc] += mags[b];
    }
    let norm = 0;
    for (let i = 0; i < 12; i++) norm += ch[i] * ch[i];
    norm = Math.sqrt(norm) + 1e-9;
    for (let i = 0; i < 12; i++) ch[i] /= norm;
    frames.push(ch);
  }
  return frames;
}
const cosSim = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

// Section-level similarity: how alike is each pair of sections' harmonic
// content? >0.995 between ADJACENT sections = the "same loop forever" defect.
export function sectionSimilarity([L, R], meta) {
  const mono = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) mono[i] = (L[i] + R[i]) * 0.5;
  const spb = meta.barSec / 4;
  const chroma = chromaFrames(mono, spb);
  const secChroma = meta.sections.map((s) => {
    const a = Math.floor(s.start / spb), b = Math.min(chroma.length, Math.floor(s.end / spb));
    const avg = new Float32Array(12);
    for (let i = a; i < b; i++) for (let k = 0; k < 12; k++) avg[k] += chroma[i]?.[k] || 0;
    let norm = Math.sqrt(avg.reduce((x, v) => x + v * v, 0)) + 1e-9;
    for (let k = 0; k < 12; k++) avg[k] /= norm;
    return avg;
  });
  const m = [];
  for (let i = 0; i < secChroma.length; i++) {
    m.push(secChroma.map((c) => +cosSim(secChroma[i], c).toFixed(3)));
  }
  return m;
}

// Bar-level self-similarity: fraction of bar pairs that are near-identical.
// A song that is one bar looped scores ~1.0; real arrangement scores lower.
export function repetitionScore([L, R], meta) {
  const mono = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) mono[i] = (L[i] + R[i]) * 0.5;
  const chroma = chromaFrames(mono, meta.barSec); // one frame per bar
  if (chroma.length < 4) return { identicalPairFrac: 0, bars: chroma.length };
  let identical = 0, pairs = 0;
  for (let i = 0; i < chroma.length; i++) for (let j = i + 1; j < chroma.length; j++) {
    pairs++;
    if (cosSim(chroma[i], chroma[j]) > 0.997) identical++;
  }
  return { identicalPairFrac: +(identical / pairs).toFixed(3), bars: chroma.length };
}

// --- Onset density (spectral flux peaks) per section -----------------------
export function onsetDensity([L, R], meta) {
  const mono = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) mono[i] = (L[i] + R[i]) * 0.5;
  const hop = 512;
  const frames = stft(mono, 1024, hop);
  const flux = frames.map((f, t) => {
    if (!t) return 0;
    let s = 0;
    for (let b = 0; b < f.length; b++) { const d = f[b] - frames[t - 1][b]; if (d > 0) s += d; }
    return s;
  });
  const mean = flux.reduce((a, b) => a + b, 0) / flux.length;
  const onsets = [];
  for (let t = 2; t < flux.length - 2; t++) {
    if (flux[t] > mean * 1.6 && flux[t] >= flux[t - 1] && flux[t] > flux[t + 1] && flux[t] > flux[t - 2]) {
      onsets.push(t * hop / SR);
    }
  }
  return meta.sections.map((s) => {
    const n = onsets.filter((t) => t >= s.start && t < s.end).length;
    return { name: s.name, perSec: +(n / (s.end - s.start)).toFixed(2), intensity: s.intensity };
  });
}

// Stereo width: 1 - |correlation|; 0 = dual mono.
export function stereoWidth([L, R]) {
  let sl = 0, sr = 0, slr = 0;
  for (let i = 0; i < L.length; i++) { sl += L[i] * L[i]; sr += R[i] * R[i]; slr += L[i] * R[i]; }
  const corr = slr / (Math.sqrt(sl * sr) + 1e-12);
  return { correlation: +corr.toFixed(3), width: +(1 - Math.abs(corr)).toFixed(3) };
}

// Spectral centroid over time (Hz) — brightness contour, useful for SFX class checks.
export function centroidHz([L, R]) {
  const mono = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) mono[i] = (L[i] + R[i]) * 0.5;
  const frames = stft(mono, 2048, 1024);
  const binHz = SR / 2048;
  let num = 0, den = 0;
  for (const f of frames) for (let b = 0; b < f.length; b++) { num += f[b] * b * binHz; den += f[b]; }
  return Math.round(num / (den + 1e-9));
}
