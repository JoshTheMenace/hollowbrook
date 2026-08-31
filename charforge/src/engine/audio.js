// Code-native audio: SFX are PARAMETER SETS (jsfxr-style), not files — agents
// author sounds the same way they author geometry, and the gate renders them
// offline to assert duration/peak/clipping. Music is a tiny pattern
// sequencer over the same synth.
//
//   import { audio } from '../engine/audio.js';
//   audio.define('hit', { wave: 'square', freq: 220, ... });
//   audio.play('hit');
//
// Every param has a sane default; a sound is legal with just { wave, freq }.
const DEFAULTS = {
  wave: 'square',        // square | sawtooth | sine | triangle | noise
  freq: 440,             // start frequency (Hz)
  freqEnd: null,         // sweep target (null = no sweep)
  sweepTime: null,       // seconds for the sweep (default: full duration)
  attack: 0.005,
  decay: 0.12,           // seconds to silence after attack
  sustain: 0,            // sustain level 0..1 (0 = pure pluck)
  sustainTime: 0,
  release: 0.05,
  volume: 0.5,
  lowpass: null,         // Hz, optional filter
  vibratoHz: 0, vibratoDepth: 0,
  duty: null,            // 0..0.5 pulse width (square only, via wave shaping approx)
};

export class AudioEngine {
  constructor() {
    this.ctx = null;               // lazily created on first user gesture
    this.bank = new Map();
    this.master = null;
    this._volume = 0.8;
    this.enabled = true;
  }

  ensure() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setVolume(v) {
    this._volume = v;
    if (this.master) this.master.gain.value = v;
  }

  define(name, params) { this.bank.set(name, { ...DEFAULTS, ...params }); }
  has(name) { return this.bank.has(name); }

  duration(p) {
    return p.attack + p.decay + p.sustainTime + p.release;
  }

  // Build the node graph into any BaseAudioContext (live or offline).
  buildInto(ctx, dest, p, t0) {
    const dur = this.duration(p);
    const gain = ctx.createGain();
    // envelope
    const g = gain.gain;
    g.setValueAtTime(0, t0);
    g.linearRampToValueAtTime(p.volume, t0 + p.attack);
    if (p.sustain > 0) {
      g.linearRampToValueAtTime(p.volume * p.sustain, t0 + p.attack + p.decay);
      g.setValueAtTime(p.volume * p.sustain, t0 + p.attack + p.decay + p.sustainTime);
    } else {
      g.linearRampToValueAtTime(0.0001, t0 + p.attack + p.decay);
    }
    g.linearRampToValueAtTime(0, t0 + dur);

    let src;
    if (p.wave === 'noise') {
      const len = Math.ceil(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      src = ctx.createBufferSource();
      src.buffer = buf;
    } else {
      src = ctx.createOscillator();
      src.type = p.wave;
      src.frequency.setValueAtTime(p.freq, t0);
      if (p.freqEnd != null) {
        const st = p.sweepTime ?? dur;
        src.frequency.exponentialRampToValueAtTime(Math.max(1, p.freqEnd), t0 + st);
      }
      if (p.vibratoHz > 0) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = p.vibratoHz;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = p.vibratoDepth;
        lfo.connect(lfoGain).connect(src.frequency);
        lfo.start(t0); lfo.stop(t0 + dur);
      }
    }
    let node = src;
    if (p.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = p.lowpass;
      node.connect(f);
      node = f;
    }
    node.connect(gain).connect(dest);
    src.start(t0);
    src.stop(t0 + dur + 0.01);
    return dur;
  }

  play(name, { detune = 0, volume = 1 } = {}) {
    if (!this.enabled) return;
    const p = this.bank.get(name);
    if (!p) { console.warn(`[audio] no sfx "${name}"`); return; }
    const ctx = this.ensure();
    const params = { ...p, freq: p.freq * Math.pow(2, detune / 12), volume: p.volume * volume };
    this.buildInto(ctx, this.master, params, ctx.currentTime);
  }

  // Offline render for gates/evidence: returns { samples, sampleRate, peak, clipped, rms }.
  async renderOffline(name) {
    const p = this.bank.get(name);
    if (!p) throw new Error(`no sfx "${name}"`);
    const dur = this.duration(p) + 0.02;
    const sr = 44100;
    const Ctor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new Ctor(1, Math.ceil(sr * dur), sr);
    this.buildInto(ctx, ctx.destination, p, 0);
    const buf = await ctx.startRendering();
    const s = buf.getChannelData(0);
    let peak = 0, sum = 0, clipped = 0;
    for (let i = 0; i < s.length; i++) {
      const a = Math.abs(s[i]);
      if (a > peak) peak = a;
      if (a >= 0.999) clipped++;
      sum += s[i] * s[i];
    }
    return { duration: dur, sampleRate: sr, peak, clipped, rms: Math.sqrt(sum / s.length), samples: s };
  }
}

// --- Music: a minimal pattern sequencer over the same synth ---------------
// pattern: { bpm, steps: [ [ {note, wave, dur?}... ] | null, ... ] } — each
// step is a 16th; note is semitones from A4 (0 = 440Hz).
export class Sequencer {
  constructor(engine) {
    this.engine = engine;
    this.pattern = null;
    this.timer = null;
    this.step = 0;
    this.volume = 0.35;
  }
  play(pattern) {
    this.stop();
    this.pattern = pattern;
    this.step = 0;
    const stepMs = (60_000 / pattern.bpm) / 4;
    this.timer = setInterval(() => {
      const notes = this.pattern.steps[this.step % this.pattern.steps.length];
      if (notes) for (const n of notes) {
        if (!n) continue;
        this.engine.ensure();
        this.engine.buildInto(this.engine.ctx, this.engine.master, {
          ...DEFAULTS,
          wave: n.wave || 'triangle',
          freq: 440 * Math.pow(2, n.note / 12),
          attack: 0.01, decay: n.dur || 0.18, release: 0.05,
          volume: this.volume * (n.vol ?? 1),
          lowpass: 2400,
        }, this.engine.ctx.currentTime);
      }
      this.step++;
    }, stepMs);
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}

export const audio = new AudioEngine();
export const music = new Sequencer(audio);
