import { SR, buf, biquad, makeNoise, applyFxChain, limitFx } from './dsp.js';

// SoundForge SFX — layered one-shots. A production sound is LAYERS with
// different jobs (transient, body, sub, tail, sparkle), not one oscillator.
//
// SFX spec: { layers: [layerSpec...], fx: [...], gainDb, duck: 'music' }
// Layer generators, all params in one flat object:
//   sweep:   { wave, from, to, curve, dur, delay, gain, pitchJitter }
//   noise:   { kind, filter: {type,f,q}, fEnd, dur, attack, delay, gain }
//   impact:  { pitch, drop, dur, gain, punch }
//   metal:   { base, ratios[], dur, bright, gain }        — bells/clangs
//   crackle: { density, dur, tone, gain }                 — debris/embers
//   chirp:   { from, to, reps, dur, gap, wave, gain }     — UI/magic ticks
// `delay` offsets a layer (transient first, tail later). `spread` pans it.

const GENS = {
  sweep({ wave = 'sine', from = 440, to = 880, curve = 1.5, dur = 0.2, gain = 1, attack = 0.004 }) {
    const n = Math.round(dur * SR), out = new Float32Array(n);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const f = from + (to - from) * Math.pow(u, curve);
      phase += f / SR;
      const v = wave === 'square' ? (phase % 1 < 0.5 ? 1 : -1)
        : wave === 'saw' ? 2 * (phase % 1) - 1
        : wave === 'tri' ? 4 * Math.abs((phase % 1) - 0.5) - 1
        : Math.sin(phase * 2 * Math.PI);
      const env = Math.min(1, i / (attack * SR)) * Math.pow(1 - u, 1.4);
      out[i] = v * env * gain;
    }
    return out;
  },
  noise({ kind = 'white', filter, fEnd, dur = 0.25, attack = 0.002, gain = 1 }) {
    const n = Math.round(dur * SR), out = new Float32Array(n);
    const src = makeNoise(kind);
    const bi = filter ? biquad(filter.type, filter.f, filter.q || 0.9) : null;
    for (let i = 0; i < n; i++) {
      const u = i / n;
      if (bi && fEnd && i % 32 === 0) bi.set(filter.f + (fEnd - filter.f) * u, filter.q || 0.9);
      let v = src();
      if (bi) v = bi(v);
      out[i] = v * Math.min(1, i / (attack * SR)) * Math.pow(1 - u, 1.6) * gain * 1.6;
    }
    return out;
  },
  impact({ pitch = 90, drop = 12, dur = 0.35, gain = 1, punch = 0.5 }) {
    const n = Math.round(dur * SR), out = new Float32Array(n);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR, u = i / n;
      phase += (pitch * Math.exp(-t * drop) + pitch * 0.5) / SR;
      let v = Math.sin(phase * 2 * Math.PI) * Math.pow(1 - u, 1.2);
      if (i < 240) v += (Math.random() * 2 - 1) * punch * (1 - i / 240);
      out[i] = Math.tanh(v * 1.8) * gain;
    }
    return out;
  },
  metal({ base = 320, ratios = [1, 2.76, 5.4, 8.93], dur = 0.6, bright = 0.6, gain = 1 }) {
    const n = Math.round(dur * SR), out = new Float32Array(n);
    const phases = ratios.map(() => Math.random());
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let v = 0;
      for (let k = 0; k < ratios.length; k++) {
        phases[k] = (phases[k] + base * ratios[k] / SR) % 1;
        v += Math.sin(phases[k] * 2 * Math.PI) * Math.exp(-t * (3 + k * 3 * (1.2 - bright))) / (1 + k * 0.5);
      }
      out[i] = v * gain * 0.6;
    }
    return out;
  },
  crackle({ density = 90, dur = 0.5, tone = 3000, gain = 1 }) {
    const n = Math.round(dur * SR), out = new Float32Array(n);
    const bp = biquad('bandpass', tone, 1.4);
    let burst = 0;
    for (let i = 0; i < n; i++) {
      if (Math.random() < density / SR) burst = 1;
      const v = burst > 0.01 ? (Math.random() * 2 - 1) * burst : 0;
      burst *= 0.94;
      out[i] = bp(v) * Math.pow(1 - i / n, 1.2) * gain * 2.2;
    }
    return out;
  },
  chirp({ from = 900, to = 1400, reps = 2, dur = 0.05, gap = 0.03, wave = 'sine', gain = 1 }) {
    const step = Math.round((dur + gap) * SR);
    const n = step * reps, out = new Float32Array(n);
    for (let r = 0; r < reps; r++) {
      let phase = 0;
      const dn = Math.round(dur * SR);
      for (let i = 0; i < dn; i++) {
        const u = i / dn;
        phase += (from + (to - from) * u) * Math.pow(1.13, r) / SR;
        const v = wave === 'square' ? (phase % 1 < 0.5 ? 1 : -1) : Math.sin(phase * 2 * Math.PI);
        out[r * step + i] = v * Math.sin(u * Math.PI) * gain;
      }
    }
    return out;
  },
};

export function renderSfx(spec) {
  // total length = longest layer end + fx tail headroom
  let end = 0.05;
  for (const l of spec.layers) {
    const dur = (l.dur || 0.25) * (l.gen === 'chirp' ? (l.reps || 2) : 1) + (l.gap || 0) * (l.reps || 0);
    end = Math.max(end, (l.delay || 0) + dur);
  }
  const tail = spec.fx?.some((f) => f.fx === 'reverb' || f.fx === 'delay') ? 0.8 : 0.05;
  const total = end + tail;
  const L = buf(total), R = buf(total);
  for (const l of spec.layers) {
    const gen = GENS[l.gen];
    if (!gen) throw new Error(`no sfx gen "${l.gen}"`);
    const mono = gen(l);
    const start = Math.round((l.delay || 0) * SR);
    const pan = l.pan ?? 0;
    const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
    for (let i = 0; i < mono.length && start + i < L.length; i++) {
      L[start + i] += mono[i] * gl;
      R[start + i] += mono[i] * gr;
    }
  }
  const out = [L, R];
  if (spec.fx) applyFxChain(out, spec.fx);
  const g = Math.pow(10, (spec.gainDb ?? -6) / 20);
  for (const ch of out) for (let i = 0; i < ch.length; i++) ch[i] *= g;
  limitFx(out, { ceilingDb: -0.5 });
  return out;
}
