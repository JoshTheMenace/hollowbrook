import { SR, buf, midiHz, makeOsc, makeNoise, adsr, biquad, applyFxChain, mixInto } from './dsp.js';

// Instruments are DATA (like character geometry) — a spec an agent can author,
// review, and diff. renderNotes() turns spec + note events into audio.
//
// Instrument spec:
// {
//   oscs: [{ type:'saw'|'square'|'tri'|'sine'|'pulse', oct, semi, detune(cents), gain, width }],
//   unison: { count, spreadCents },      // replicate each osc, detuned + spread L/R
//   fm: { ratio, index, decay },         // sine FM stacked on the note freq
//   pluck: { damp },                     // Karplus-Strong string (overrides oscs)
//   noise: { kind, gain },
//   ampEnv: {a,d,s,r,curve},
//   filter: { type, cutoff, q, envAmount, env:{a,d,s,r}, keytrack },
//   vibrato: { rate, cents, delay },
//   gain, pan, fx: [ {fx:'reverb', ...}, ... ],
// }
// Notes: [{ t (sec), dur (sec), midi, vel 0..1, pan? }]

const cents = (c) => Math.pow(2, c / 1200);

function renderVoice(L, R, instr, note) {
  const f0 = midiHz(note.midi);
  const vel = note.vel ?? 0.8;
  const start = Math.round(note.t * SR);
  const ampEnv = adsr(instr.ampEnv);
  const relSamp = Math.round(note.dur * SR);
  const tail = Math.round((instr.ampEnv?.r ?? 0.15) * SR) + 64;
  // clamp to the buffer, never skip — dropping end-of-loop notes silences seams
  const total = Math.min(relSamp + tail, L.length - start);
  if (total <= 0) return;

  const fEnv = instr.filter?.env ? adsr(instr.filter.env) : null;
  const mkFilt = () => biquad(instr.filter.type || 'lowpass', instr.filter.cutoff, instr.filter.q || 0.9);
  const filtL = instr.filter ? mkFilt() : null;
  const filtR = instr.filter ? mkFilt() : null;
  const keytrack = instr.filter?.keytrack ?? 0;
  const baseCut = instr.filter ? instr.filter.cutoff * Math.pow(f0 / 261.6, keytrack) : 0;
  const envAmt = instr.filter?.envAmount ?? 0;
  const setEvery = 32; // retune filter at control rate, not audio rate

  const pan = note.pan ?? instr.pan ?? 0;
  const gl = Math.cos((pan + 1) * Math.PI / 4) * (instr.gain ?? 0.8) * vel;
  const gr = Math.sin((pan + 1) * Math.PI / 4) * (instr.gain ?? 0.8) * vel;

  // voice sources
  const sources = [];
  if (instr.pluck) {
    // Karplus-Strong: noise burst into a damped delay line at the pitch period
    const period = Math.max(2, Math.round(SR / f0));
    const line = new Float32Array(period);
    for (let i = 0; i < period; i++) line[i] = Math.random() * 2 - 1;
    let idx = 0, prev = 0;
    const damp = instr.pluck.damp ?? 0.996;
    sources.push(() => {
      const cur = line[idx];
      const next = line[(idx + 1) % period];
      const y = (cur + next) * 0.5 * damp;
      line[idx] = y;
      idx = (idx + 1) % period;
      prev = y;
      return prev;
    });
  } else {
    const uni = instr.unison || { count: 1, spreadCents: 0 };
    for (const o of instr.oscs || [{ type: 'saw', gain: 1 }]) {
      const mult = Math.pow(2, (o.oct || 0)) * cents((o.detune || 0) + (o.semi || 0) * 100);
      for (let u = 0; u < (uni.count || 1); u++) {
        const spread = uni.count > 1 ? (u / (uni.count - 1) - 0.5) * 2 : 0;
        const det = cents(spread * (uni.spreadCents || 0));
        const osc = makeOsc(o.type);
        const g = (o.gain ?? 1) / Math.sqrt(uni.count || 1);
        const sPan = spread * 0.7;
        const src = (f, i) => {
          let fr = f * mult * det;
          if (instr.fm) {
            const idxEnv = Math.exp(-i / SR / (instr.fm.decay || 0.3));
            fr += Math.sin(2 * Math.PI * (i / SR) * f * instr.fm.ratio) * f * instr.fm.index * idxEnv;
          }
          return osc(fr, o.width) * g;
        };
        src.pan = sPan;
        sources.push(src);
      }
    }
  }
  const noise = instr.noise ? makeNoise(instr.noise.kind) : null;
  const vib = instr.vibrato;

  for (let i = 0; i < total; i++) {
    const t = i / SR;
    let f = f0;
    if (vib && t > (vib.delay || 0)) {
      const ramp = Math.min(1, (t - (vib.delay || 0)) / 0.3);
      f *= cents(Math.sin(2 * Math.PI * vib.rate * t) * vib.cents * ramp);
    }
    let sm = 0, spreadL = 0, spreadR = 0;
    for (const src of sources) {
      const v = src(f, i);
      if (src.pan) { // unison spread: distribute across the stereo field
        spreadL += v * (1 - src.pan) * 0.5;
        spreadR += v * (1 + src.pan) * 0.5;
      } else sm += v;
    }
    if (noise) sm += noise() * instr.noise.gain;
    const e = ampEnv(i, relSamp);
    if (filtL) {
      if (i % setEvery === 0) {
        const fe = fEnv ? fEnv(i, relSamp) : 1;
        const cut = baseCut + envAmt * fe;
        filtL.set(cut, instr.filter.q || 0.9);
        filtR.set(cut, instr.filter.q || 0.9);
      }
      // stereo THROUGH the filter — collapsing unison spread to mono here is
      // exactly how a mix ends up 0.95-correlated
      L[start + i] += filtL(sm + spreadL * 2) * e * gl;
      R[start + i] += filtR(sm + spreadR * 2) * e * gr;
    } else {
      L[start + i] += (sm + spreadL * 2) * e * gl;
      R[start + i] += (sm + spreadR * 2) * e * gr;
    }
  }
}

export function renderNotes(instr, notes, seconds) {
  const L = buf(seconds), R = buf(seconds);
  for (const n of notes) renderVoice(L, R, instr, n);
  const out = [L, R];
  if (instr.fx) applyFxChain(out, instr.fx);
  return out;
}

// --- Drums -----------------------------------------------------------------
// Parametric one-shot generators; hits: [{ t, kind, vel }]
export const DRUMS = {
  kick({ pitch = 150, drop = 8, decay = 0.4, click = 0.6, body = 1 } = {}) {
    const n = Math.round(decay * SR * 1.4), out = new Float32Array(n);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const f = pitch * Math.exp(-t * drop) + 40;
      phase += f / SR;
      const env = Math.exp(-t / decay * 5);
      out[i] = Math.sin(phase * 2 * Math.PI) * env * body;
      if (i < 200) out[i] += (Math.random() * 2 - 1) * click * (1 - i / 200) * 0.5;
      out[i] = Math.tanh(out[i] * 1.6);
    }
    return out;
  },
  snare({ tone = 190, decay = 0.18, snap = 0.8 } = {}) {
    const n = Math.round(decay * SR * 2), out = new Float32Array(n);
    const bp = biquad('bandpass', 1800, 0.8);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      phase += (tone * Math.exp(-t * 9) + tone) / SR;
      const bodyEnv = Math.exp(-t / decay * 6), noiseEnv = Math.exp(-t / decay * 4.5);
      out[i] = Math.sin(phase * 2 * Math.PI) * bodyEnv * 0.5 + bp(Math.random() * 2 - 1) * noiseEnv * snap * 1.6;
    }
    return out;
  },
  hat({ decay = 0.05, tone = 8000, open = false } = {}) {
    const d = open ? decay * 6 : decay;
    const n = Math.round(d * SR * 2), out = new Float32Array(n);
    const hp = biquad('highpass', tone, 0.7);
    // 6 detuned squares = classic metallic 808-ish hat source
    const ratios = [2, 3.01, 4.16, 5.43, 6.79, 8.21];
    const phases = ratios.map(() => Math.random());
    for (let i = 0; i < n; i++) {
      let v = 0;
      for (let k = 0; k < 6; k++) {
        phases[k] = (phases[k] + 320 * ratios[k] / SR) % 1;
        v += phases[k] < 0.5 ? 1 : -1;
      }
      out[i] = hp(v / 6) * Math.exp(-i / SR / d * 5.2);
    }
    return out;
  },
  tom({ pitch = 110, decay = 0.3 } = {}) {
    const n = Math.round(decay * SR * 1.5), out = new Float32Array(n);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      phase += (pitch * Math.exp(-t * 3) + pitch * 0.6) / SR;
      out[i] = Math.sin(phase * 2 * Math.PI) * Math.exp(-t / decay * 4) + (Math.random() * 2 - 1) * 0.04 * Math.exp(-t * 40);
    }
    return out;
  },
  clap({ decay = 0.14 } = {}) {
    const n = Math.round(decay * SR * 2.5), out = new Float32Array(n);
    const bp = biquad('bandpass', 1100, 1.2);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      // 3 pre-echoes then the main burst — the "many hands" effect
      const bursts = (t < 0.008 ? 1 : 0) + (t > 0.011 && t < 0.019 ? 1 : 0) + (t > 0.023 && t < 0.031 ? 1 : 0);
      const mainEnv = t > 0.03 ? Math.exp(-(t - 0.03) / decay * 5) : 0;
      out[i] = bp(Math.random() * 2 - 1) * (bursts * 0.8 + mainEnv) * 1.4;
    }
    return out;
  },
  ride({ decay = 0.6, tone = 5200 } = {}) {
    const n = Math.round(decay * SR * 2), out = new Float32Array(n);
    const hp = biquad('highpass', tone * 0.6, 0.7);
    const ratios = [1.98, 2.99, 4.02, 5.31, 6.63, 7.83, 9.14];
    const phases = ratios.map(() => Math.random());
    for (let i = 0; i < n; i++) {
      let v = 0;
      for (let k = 0; k < ratios.length; k++) {
        phases[k] = (phases[k] + 400 * ratios[k] / SR) % 1;
        v += Math.sin(phases[k] * 2 * Math.PI);
      }
      const t = i / SR;
      out[i] = hp(v / ratios.length) * (Math.exp(-t / decay * 2.4) * 0.7 + Math.exp(-t * 30) * 0.5);
    }
    return out;
  },
  shaker({ decay = 0.07 } = {}) {
    const n = Math.round(decay * SR * 2), out = new Float32Array(n);
    const bp = biquad('bandpass', 6500, 1.6);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const env = Math.min(1, t / 0.01) * Math.exp(-t / decay * 4);
      out[i] = bp(Math.random() * 2 - 1) * env * 1.3;
    }
    return out;
  },
};

export function renderDrums(hits, seconds, { kitParams = {}, gain = 1, fx = [] } = {}) {
  const L = buf(seconds), R = buf(seconds);
  const cache = new Map();
  for (const h of hits) {
    const key = h.kind + JSON.stringify(h.params || kitParams[h.kind] || {});
    if (!cache.has(key)) cache.set(key, DRUMS[h.kind](h.params || kitParams[h.kind] || {}));
    const smp = cache.get(key);
    const start = Math.round(h.t * SR);
    const v = (h.vel ?? 1) * gain;
    const pan = h.pan ?? 0;
    const gl = Math.cos((pan + 1) * Math.PI / 4) * v, gr = Math.sin((pan + 1) * Math.PI / 4) * v;
    for (let i = 0; i < smp.length && start + i < L.length; i++) {
      L[start + i] += smp[i] * gl;
      R[start + i] += smp[i] * gr;
    }
  }
  const out = [L, R];
  if (fx.length) applyFxChain(out, fx);
  return out;
}
