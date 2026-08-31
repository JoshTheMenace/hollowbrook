// SoundForge DSP core — pure-JS sample-level synthesis and effects.
// No WebAudio: everything is Float32Array math, so the identical code renders
// headlessly in Node (gates, WAV evidence) and in the browser (game runtime).
// All processors work at SR and are written as tight per-sample loops.

export const SR = 44100;

// The ONE random source for all synthesis. Unseeded audio made check-audio
// flaky (a metric swung 79%->100% between identical runs — audit finding);
// gates and renders call seedAudio(n) first, so every render is reproducible.
let RAND = Math.random;
export const arand = () => RAND();
export function seedAudio(seed = null) {
  if (seed === null) { RAND = Math.random; return; }
  let a = seed | 0;
  RAND = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const buf = (seconds) => new Float32Array(Math.ceil(seconds * SR));
export const db = (d) => Math.pow(10, d / 20);
export const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// --- Oscillators -----------------------------------------------------------
// polyBLEP anti-aliasing: cheap band-limiting for saw/square. `phase` in 0..1.
const polyblep = (t, dt) => {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
};

// An oscillator is a stateful closure: osc(freqHz) -> sample in -1..1.
export function makeOsc(type) {
  let phase = arand(); // free-running start avoids phasey unison stacks
  if (type === 'sine') return (f) => { phase = (phase + f / SR) % 1; return Math.sin(phase * 2 * Math.PI); };
  if (type === 'tri') return (f) => { phase = (phase + f / SR) % 1; return 4 * Math.abs(phase - 0.5) - 1; };
  if (type === 'saw') return (f) => {
    const dt = f / SR;
    phase = (phase + dt) % 1;
    return 2 * phase - 1 - polyblep(phase, dt);
  };
  if (type === 'square' || type === 'pulse') return (f, width = 0.5) => {
    const dt = f / SR;
    phase = (phase + dt) % 1;
    let v = phase < width ? 1 : -1;
    v += polyblep(phase, dt);
    v -= polyblep((phase + 1 - width) % 1, dt);
    return v;
  };
  throw new Error(`no osc type "${type}"`);
}

// White + pink noise (Voss-ish filtered), both stateful closures.
export function makeNoise(kind = 'white') {
  if (kind === 'white') return () => arand() * 2 - 1;
  let b0 = 0, b1 = 0, b2 = 0;
  return () => { // pink: Paul Kellet economy filter
    const w = arand() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.96300 * b1 + w * 0.2965164;
    b2 = 0.57000 * b2 + w * 1.0526913;
    return (b0 + b1 + b2 + w * 0.1848) * 0.18;
  };
}

// --- Envelopes -------------------------------------------------------------
// ADSR with exponential-ish curves. Returns env(gateOffSample) sampler:
// value at sample i given the note releases at sample `rel`.
export function adsr({ a = 0.005, d = 0.1, s = 0.7, r = 0.15, curve = 2 } = {}) {
  const A = Math.max(1, a * SR), D = Math.max(1, d * SR), R = Math.max(1, r * SR);
  return (i, rel) => {
    let v;
    if (i < A) v = Math.pow(i / A, 1 / curve);
    else if (i < A + D) v = 1 - (1 - s) * Math.pow((i - A) / D, 1 / curve);
    else v = s;
    if (i >= rel) {
      const relStartVal = rel < A ? Math.pow(rel / A, 1 / curve)
        : rel < A + D ? 1 - (1 - s) * Math.pow((rel - A) / D, 1 / curve) : s;
      const k = (i - rel) / R;
      v = k >= 1 ? 0 : relStartVal * Math.pow(1 - k, curve);
    }
    return v;
  };
}

// --- Filters ---------------------------------------------------------------
// RBJ biquad. Stateful closure: bi(x) -> y. setF(cutoff, q) retunes in place.
export function biquad(type, f0 = 1000, q = 0.707, gainDb = 0) {
  let b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const set = (f, Q = q, g = gainDb) => {
    f = Math.min(Math.max(f, 10), SR * 0.45);
    const w = 2 * Math.PI * f / SR, cw = Math.cos(w), sw = Math.sin(w);
    const alpha = sw / (2 * Q), A = Math.pow(10, g / 40);
    let a0;
    if (type === 'lowpass') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
    else if (type === 'highpass') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
    else if (type === 'bandpass') { b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
    else if (type === 'notch') { b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
    else if (type === 'peak') { b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; }
    else if (type === 'lowshelf') {
      const s2 = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) - (A - 1) * cw + s2); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s2);
      a0 = (A + 1) + (A - 1) * cw + s2; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s2;
    } else if (type === 'highshelf') {
      const s2 = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) + (A - 1) * cw + s2); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s2);
      a0 = (A + 1) - (A - 1) * cw + s2; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s2;
    } else throw new Error(`no biquad type "${type}"`);
    b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  };
  set(f0);
  const fn = (x) => {
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
  fn.set = set;
  return fn;
}

// Process a whole buffer through a biquad spec (convenience for master EQ).
export function filterBuf(x, type, f, q, gainDb) {
  const bi = biquad(type, f, q, gainDb);
  for (let i = 0; i < x.length; i++) x[i] = bi(x[i]);
  return x;
}

// --- Effects (in-place on stereo pairs [L, R]) -----------------------------
export function delayFx([L, R], { time = 0.3, feedback = 0.35, mix = 0.25, pingpong = true, damp = 4000 } = {}) {
  const n = Math.round(time * SR);
  const dl = new Float32Array(n), dr = new Float32Array(n);
  const lpL = biquad('lowpass', damp), lpR = biquad('lowpass', damp);
  let w = 0;
  for (let i = 0; i < L.length; i++) {
    const tapL = dl[w], tapR = dr[w];
    dl[w] = lpL((pingpong ? tapR : tapL) * feedback + L[i]);
    dr[w] = lpR((pingpong ? tapL : tapR) * feedback + R[i]);
    L[i] += tapL * mix;
    R[i] += tapR * mix;
    w = (w + 1) % n;
  }
}

// Freeverb-style reverb: 8 combs + 4 allpasses per channel, stereo-spread.
export function reverbFx([L, R], { size = 0.82, damp = 0.35, mix = 0.22, width = 1 } = {}) {
  const combTunes = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const apTunes = [556, 441, 341, 225];
  const spread = 23;
  const fb = 0.7 + size * 0.28;
  const makeCombs = (off) => combTunes.map((t) => ({ b: new Float32Array(t + off), i: 0, f: 0 }));
  const makeAps = (off) => apTunes.map((t) => ({ b: new Float32Array(t + off), i: 0 }));
  const cL = makeCombs(0), cR = makeCombs(spread), aL = makeAps(0), aR = makeAps(spread);
  const one = (x, combs, aps) => {
    let out = 0;
    for (const c of combs) {
      const y = c.b[c.i];
      c.f = y * (1 - damp) + c.f * damp;
      c.b[c.i] = x * 0.015 + c.f * fb;
      c.i = (c.i + 1) % c.b.length;
      out += y;
    }
    for (const p of aps) {
      const y = p.b[p.i];
      p.b[p.i] = out + y * 0.5;
      out = y - out;
      p.i = (p.i + 1) % p.b.length;
    }
    return out;
  };
  const wet1 = mix * (width / 2 + 0.5), wet2 = mix * ((1 - width) / 2);
  for (let i = 0; i < L.length; i++) {
    const inMono = (L[i] + R[i]) * 0.5;
    const wl = one(inMono, cL, aL), wr = one(inMono, cR, aR);
    L[i] = L[i] * (1 - mix * 0.4) + wl * wet1 + wr * wet2;
    R[i] = R[i] * (1 - mix * 0.4) + wr * wet1 + wl * wet2;
  }
}

export function chorusFx([L, R], { rate = 0.6, depth = 0.004, mix = 0.35 } = {}) {
  const max = Math.ceil(0.05 * SR);
  const dl = new Float32Array(max), dr = new Float32Array(max);
  let w = 0;
  for (let i = 0; i < L.length; i++) {
    const t = i / SR;
    const dSampL = (0.018 + depth * Math.sin(2 * Math.PI * rate * t)) * SR;
    const dSampR = (0.018 + depth * Math.sin(2 * Math.PI * rate * t + 2)) * SR;
    const rd = (dsmp) => {
      const p = (w - dsmp + max * 2) % max;
      const i0 = Math.floor(p), fr = p - i0;
      return dl[i0 % max] * (1 - fr) + dl[(i0 + 1) % max] * fr;
    };
    const rdr = (dsmp) => {
      const p = (w - dsmp + max * 2) % max;
      const i0 = Math.floor(p), fr = p - i0;
      return dr[i0 % max] * (1 - fr) + dr[(i0 + 1) % max] * fr;
    };
    dl[w] = L[i]; dr[w] = R[i];
    L[i] += rd(dSampL) * mix;
    R[i] += rdr(dSampR) * mix;
    w = (w + 1) % max;
  }
}

export function driveFx([L, R], { amount = 2, mix = 1 } = {}) {
  for (let i = 0; i < L.length; i++) {
    L[i] = L[i] * (1 - mix) + Math.tanh(L[i] * amount) / Math.tanh(amount) * mix;
    R[i] = R[i] * (1 - mix) + Math.tanh(R[i] * amount) / Math.tanh(amount) * mix;
  }
}

// Feed-forward compressor with lookahead-free envelope follower.
export function compressFx([L, R], { threshDb = -18, ratio = 3, attack = 0.005, release = 0.12, makeupDb = 0 } = {}) {
  const atk = Math.exp(-1 / (attack * SR)), rel = Math.exp(-1 / (release * SR));
  const makeup = db(makeupDb);
  let env = 0;
  for (let i = 0; i < L.length; i++) {
    const x = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    env = x > env ? atk * env + (1 - atk) * x : rel * env + (1 - rel) * x;
    const envDb = 20 * Math.log10(env + 1e-9);
    const over = envDb - threshDb;
    const gain = over > 0 ? db(-over * (1 - 1 / ratio)) : 1;
    L[i] *= gain * makeup;
    R[i] *= gain * makeup;
  }
}

// Sidechain duck: attenuate [L,R] whenever `trigger` (mono env source) is hot.
export function duckFx([L, R], trigger, { amount = 0.5, attack = 0.008, release = 0.18 } = {}) {
  const atk = Math.exp(-1 / (attack * SR)), rel = Math.exp(-1 / (release * SR));
  let env = 0;
  for (let i = 0; i < L.length; i++) {
    const x = Math.abs(trigger[i] || 0);
    env = x > env ? atk * env + (1 - atk) * x : rel * env + (1 - rel) * x;
    const g = 1 - Math.min(1, env * 2.2) * amount;
    L[i] *= g; R[i] *= g;
  }
}

// Brickwall-ish limiter: hard knee at ceiling with fast smoothed gain.
export function limitFx([L, R], { ceilingDb = -1 } = {}) {
  const ceil = db(ceilingDb);
  const rel = Math.exp(-1 / (0.05 * SR));
  let gain = 1;
  for (let i = 0; i < L.length; i++) {
    const peak = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    const want = peak * gain > ceil ? ceil / (peak + 1e-9) : 1;
    gain = want < gain ? want : rel * gain + (1 - rel) * want;
    L[i] *= gain; R[i] *= gain;
  }
}

// Haas widener: tiny cross-channel delay for width without phase disaster.
export function widenFx([L, R], { ms = 9, amount = 0.3 } = {}) {
  const n = Math.round(ms / 1000 * SR);
  const dl = new Float32Array(n);
  let w = 0;
  for (let i = 0; i < L.length; i++) {
    const d = dl[w];
    dl[w] = L[i];
    R[i] += d * amount;
    w = (w + 1) % n;
  }
}

export const FX = { delay: delayFx, reverb: reverbFx, chorus: chorusFx, drive: driveFx, compress: compressFx, limit: limitFx, widen: widenFx };

export function applyFxChain(stereo, chain = []) {
  for (const step of chain) {
    const fn = FX[step.fx];
    if (!fn) throw new Error(`no fx "${step.fx}"`);
    fn(stereo, step);
  }
  return stereo;
}

// --- Bus utils -------------------------------------------------------------
export const stereo = (seconds) => [buf(seconds), buf(seconds)];
export function mixInto(dst, src, gain = 1, pan = 0) {
  // constant-power pan, -1..1
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  const n = Math.min(dst[0].length, src[0].length);
  for (let i = 0; i < n; i++) { dst[0][i] += src[0][i] * gl; dst[1][i] += src[1][i] * gr; }
  return dst;
}
export function gainBuf(stereoPair, g) {
  for (const ch of stereoPair) for (let i = 0; i < ch.length; i++) ch[i] *= g;
  return stereoPair;
}
export function peakOf(stereoPair) {
  let p = 0;
  for (const ch of stereoPair) for (let i = 0; i < ch.length; i++) { const a = Math.abs(ch[i]); if (a > p) p = a; }
  return p;
}
