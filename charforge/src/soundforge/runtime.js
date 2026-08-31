import { SR, arand, seedAudio } from './dsp.js';
import { composeAdaptiveLoop } from './compose.js';
import { renderSfx } from './sfx.js';

// SoundForge browser runtime. The game touches TWO things:
//   music.setIntensity(0..1)  — the whole mix follows (tier crossfades)
//   sfx.play('slash')         — pre-rendered layered one-shot, auto-varied
// Everything is owned by an explicit lifecycle: dispose() ends ALL sound.
// (Rule from SOUND.md: audio that outlives its scene is a defect.)

const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

const toBuffer = (ctx, [L, R]) => {
  const b = ctx.createBuffer(2, L.length, SR);
  b.copyToChannel(L, 0);
  b.copyToChannel(R, 1);
  return b;
};

// Tier audibility for an intensity value: fades at both window edges — but a
// window touching the ends of the scale is full there (pads at 0, drive at 1).
export function windowGain(v, [on, off], fade = 0.09) {
  const rise = on <= 0 ? 1 : Math.min(1, Math.max(0, (v - on) / fade));
  const fall = off > 1 ? 1 : 1 - Math.min(1, Math.max(0, (v - (off - fade)) / fade));
  return rise * fall;
}

export class AdaptiveMusic {
  constructor(ctx) {
    this.ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    this.ownCtx = !ctx;
    this.stems = null;          // name -> {buffer, window, gainNode?}
    this.sources = [];
    this.intensity = 0;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -12;
    this.comp.ratio.value = 4;
    this.master.connect(this.comp).connect(this.ctx.destination);
    this.playing = false;
  }

  // Render the loop's tier stems (CPU-bound; yields between stems so the page
  // stays responsive — call during a loading screen).
  async load(loopSpec, onProgress) {
    const { stems, loopSec, meta } = await (async () => {
      // compose per tier with yields: composeAdaptiveLoop is sync, so run it
      // once (it's the per-stem renders inside that cost) — acceptable at 8 bars.
      await yieldFrame();
      seedAudio(loopSpec.seed ?? 11);
      return composeAdaptiveLoop(loopSpec);
    })();
    this.loopSec = loopSec;
    this.meta = meta;
    this.stems = {};
    let done = 0;
    const names = Object.keys(stems);
    for (const name of names) {
      this.stems[name] = { buffer: toBuffer(this.ctx, stems[name].audio), window: stems[name].window };
      onProgress?.(++done / names.length, name);
      await yieldFrame();
    }
    return this;
  }

  start() {
    if (!this.stems || this.playing) return;
    const when = this.ctx.currentTime + 0.05;
    for (const s of Object.values(this.stems)) {
      const src = this.ctx.createBufferSource();
      src.buffer = s.buffer;
      src.loop = true;
      s.gainNode = this.ctx.createGain();
      s.gainNode.gain.value = windowGain(this.intensity, s.window);
      src.connect(s.gainNode).connect(this.master);
      src.start(when);              // same clock tick: stems stay phase-locked
      this.sources.push(src);
    }
    this.playing = true;
  }

  setIntensity(v, ramp = 0.9) {
    this.intensity = Math.min(1, Math.max(0, v));
    if (!this.playing) return;
    const t = this.ctx.currentTime;
    for (const s of Object.values(this.stems)) {
      s.gainNode.gain.setTargetAtTime(windowGain(this.intensity, s.window), t, ramp / 3);
    }
  }

  setVolume(v, ramp = 0.2) {
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, ramp / 3);
  }

  stop(fade = 0.6) {
    if (!this.playing) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0, t, fade / 3);
    const srcs = this.sources;
    setTimeout(() => { for (const s of srcs) { try { s.stop(); } catch {} } }, fade * 1000 + 100);
    this.sources = [];
    this.playing = false;
  }

  dispose() {
    this.stop(0.1);
    if (this.ownCtx) setTimeout(() => this.ctx.close().catch(() => {}), 400);
  }
}

export class SfxPlayer {
  constructor(ctx) {
    this.ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    this.ownCtx = !ctx;
    this.buffers = new Map();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    this.lastPlayed = new Map();
  }

  async load(bank, onProgress) {
    let done = 0;
    const entries = Object.entries(bank);
    for (const [name, spec] of entries) {
      this.buffers.set(name, toBuffer(this.ctx, renderSfx(spec)));
      onProgress?.(++done / entries.length, name);
      await yieldFrame();
    }
    return this;
  }

  // Repetition avoidance: light random detune + level variation per shot, and
  // a 30ms retrigger guard so 10 hits in one frame don't stack to a blast.
  play(name, { vol = 1, rate, pan = 0 } = {}) {
    const buf = this.buffers.get(name);
    if (!buf) { console.warn(`[sfx] no "${name}"`); return; }
    const now = performance.now();
    if (now - (this.lastPlayed.get(name) || 0) < 30) return;
    this.lastPlayed.set(name, now);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate ?? (0.94 + arand() * 0.12);
    const g = this.ctx.createGain();
    g.gain.value = vol * (0.9 + arand() * 0.2);
    let tail = g;
    if (pan) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      tail = p;
    }
    src.connect(g);
    tail.connect(this.master);
    src.start();
  }

  dispose() {
    this.master.disconnect();
    if (this.ownCtx) this.ctx.close().catch(() => {});
  }
}
