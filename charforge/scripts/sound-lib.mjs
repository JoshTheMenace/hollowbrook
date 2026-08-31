import zlib from 'node:zlib';
import { SR } from '../src/soundforge/dsp.js';
import { stft } from '../src/soundforge/fft.js';

// Node-side evidence helpers: PNG encoding + spectrogram/waveform images.

// --- minimal PNG (8-bit RGB, no filter) ------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
export function encodePng(rgb, w, h) {
  const chunk = (type, data) => {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    const crcBuf = new Uint8Array(4 + data.length);
    crcBuf.set(out.subarray(4, 8)); crcBuf.set(data, 4);
    dv.setUint32(8 + data.length, crc32(crcBuf));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const raw = new Uint8Array(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1);
  const idat = zlib.deflateSync(raw);
  const sig = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((a, p) => a + p.length, 0);
  const png = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { png.set(p, o); o += p.length; }
  return png;
}

// inferno-ish colormap
const ramp = (u) => {
  u = Math.max(0, Math.min(1, u));
  return [
    Math.round(255 * Math.min(1, Math.pow(u, 0.7) * 1.4)),
    Math.round(255 * Math.pow(u, 1.8) * 0.95),
    Math.round(255 * (u < 0.5 ? 0.25 + u : Math.max(0, 1.5 - u * 1.5)) * Math.pow(u, 0.4)),
  ];
};

// Spectrogram: log-frequency 30Hz..16kHz, log magnitude, section ruler on top.
export function spectrogramPng([L, R], { height = 300, maxWidth = 1500, meta = null } = {}) {
  const mono = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) mono[i] = (L[i] + R[i]) * 0.5;
  const n = 2048;
  const totalSec = L.length / SR;
  const hop = Math.max(512, Math.floor(L.length / maxWidth));
  const frames = stft(mono, n, hop);
  const w = frames.length, h = height;
  const binHz = SR / n;
  const fMin = 30, fMax = 16000;
  const rgb = new Uint8Array(w * h * 3);
  let maxMag = 1e-9;
  for (const f of frames) for (let b = 0; b < f.length; b++) if (f[b] > maxMag) maxMag = f[b];
  // per-column log-freq resample, dB relative to the track's own peak bin
  for (let x = 0; x < w; x++) {
    const f = frames[x];
    for (let y = 0; y < h; y++) {
      const frac = 1 - y / (h - 1);
      const hz = fMin * Math.pow(fMax / fMin, frac);
      const b = Math.min(f.length - 1, hz / binHz);
      const b0 = Math.floor(b);
      const mag = f[b0] * (1 - (b - b0)) + (f[b0 + 1] || 0) * (b - b0);
      const dbv = 20 * Math.log10(mag / maxMag + 1e-7);
      const u = (dbv + 78) / 78; // -78dB..0 rel -> 0..1
      const [r, g, bl] = ramp(u);
      const o = (y * w + x) * 3;
      rgb[o] = r; rgb[o + 1] = g; rgb[o + 2] = bl;
    }
  }
  // section boundaries: white ticks down the whole image
  if (meta?.sections) {
    for (const s of meta.sections) {
      const x = Math.round((s.start / totalSec) * (w - 1));
      for (let y = 0; y < h; y++) {
        const o = (y * w + x) * 3;
        if (y % 6 < 3) { rgb[o] = 240; rgb[o + 1] = 240; rgb[o + 2] = 240; }
      }
    }
  }
  return encodePng(rgb, w, h);
}

// Waveform overview with section shading by intensity.
export function waveformPng([L, R], { height = 140, width = 1500, meta = null } = {}) {
  const rgb = new Uint8Array(width * height * 3);
  const totalSec = L.length / SR;
  for (let x = 0; x < width; x++) {
    const a = Math.floor((x / width) * L.length), b = Math.floor(((x + 1) / width) * L.length);
    let lo = 0, hi = 0;
    for (let i = a; i < b; i++) { const v = (L[i] + R[i]) * 0.5; if (v < lo) lo = v; if (v > hi) hi = v; }
    const sec = meta?.sections?.find((s) => (x / width) * totalSec >= s.start && (x / width) * totalSec < s.end);
    const bgBoost = sec ? sec.intensity * 26 : 0;
    const yTop = Math.round((1 - (hi * 0.95 + 1) / 2) * (height - 1));
    const yBot = Math.round((1 - (lo * 0.95 + 1) / 2) * (height - 1));
    for (let y = 0; y < height; y++) {
      const o = (y * width + x) * 3;
      const inWave = y >= yTop && y <= yBot;
      rgb[o] = inWave ? 110 : 16 + bgBoost;
      rgb[o + 1] = inWave ? 224 : 14 + bgBoost * 0.6;
      rgb[o + 2] = inWave ? 255 : 30 + bgBoost;
    }
  }
  return encodePng(rgb, width, height);
}
