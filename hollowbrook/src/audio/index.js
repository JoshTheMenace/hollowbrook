/**
 * src/audio/index.js — the whole audio interface for Hollowbrook.
 *
 * The game layer imports THIS and nothing else from `src/audio/`, and never
 * imports `@forge/soundforge/*` directly: soundforge's RNG is one module-level
 * variable in `dsp.js`, so a second copy of that module means `seedAudio()`
 * seeds one renderer while another one runs, and determinism goes without a
 * single error.  Everything here reaches soundforge by relative path, which
 * resolves to the identical absolute file the `@forge` alias resolves to.
 *
 * See README.md in this directory for the full interface.  In one line each:
 *
 *   await initAudio({ onProgress })   from a user gesture; renders everything
 *   setIntensity(x, ramp)             the contract's one number, 0..1
 *   play(name, { pos, listener, yaw, pitch, pan, gain, duck })
 *   footstep(surface)                 'stone' | 'timber' | 'grass'
 *   dawn(on = true)                   the fourth tier, out of band
 *   stopMusic / setMusicVolume / setSfxVolume / disposeAudio
 *
 * Nothing here reads or writes `src/game/` or `src/kit/`.
 */

import { SR } from '../../../charforge/src/soundforge/dsp.js';
import { windowGain } from '../../../charforge/src/soundforge/runtime.js';
import { renderScore, MASTER_GAIN } from './score.js';
import { BANK, EVENTS, SURFACES, LADDER, DECLARED, ALIASES, resolve, renderBank } from './sfx-bank.js';
import { MAGNITUDE } from './magnitude.js';
import { TIERS } from './score.js';

export { MAGNITUDE, LADDER, DECLARED, EVENTS, SURFACES, TIERS, ALIASES };

/* ---- tuning constants, all in one place -------------------------------- */
export const AUDIO = {
  musicVolume: MASTER_GAIN,   // 0.56 — the level the loudness gate measures at
  sfxVolume: 0.95,
  refDistance: 6,             // metres at which a positional sound is full
  maxAudible: 55,             // beyond this `play` returns false and costs nothing
  maxPan: 0.85,               // a hard-panned cue is unlocatable; never reach 1
  retriggerMs: 28,            // per-name guard so ten hits in a frame are one blast
  duckAbove: -16,             // MAGNITUDE at which a shot dips the music
  duckTo: 0.55,               // ...to this fraction of the music volume
  duckHoldMs: 420,
  dawnFadeSec: 6,
};

/* ---- music -------------------------------------------------------------- */

const toBuffer = (ctx, [L, R]) => {
  const b = ctx.createBuffer(2, L.length, SR);
  b.copyToChannel(L, 0);
  b.copyToChannel(R, 1);
  return b;
};
const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

/**
 * The adaptive score as a WebAudio graph.  Not charforge's `AdaptiveMusic`,
 * for two reasons that both matter: this score's war drums and sidechain come
 * from `renderScore()` rather than from `composeAdaptiveLoop` alone, and the
 * dawn tier's gain has to survive `setIntensity` — an AdaptiveMusic sweep sets
 * EVERY stem from its window, which would zero the bell on the next frame.
 */
class SiegeMusic {
  constructor(ctx, score) {
    this.ctx = ctx;
    this.score = score;
    this.intensity = 0;
    this.dawnAmt = 0;
    this.stems = {};
    this.sources = [];
    this.playing = false;
    this.master = ctx.createGain();
    this.master.gain.value = AUDIO.musicVolume;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -12;
    this.comp.ratio.value = 4;
    this.master.connect(this.comp).connect(ctx.destination);
  }

  attach(name) {
    const s = this.score.stems[name];
    this.stems[name] = { buffer: toBuffer(this.ctx, s.audio), window: s.window, isWar: s.kind === 'war' };
  }

  /** Gain for one stem at the current intensity and dawn amount. */
  _gain(name) {
    const s = this.stems[name];
    if (s.window[0] > 1) return this.dawnAmt;                 // the dawn tier
    const g = windowGain(this.intensity, s.window);
    return s.isWar ? g * (1 - this.dawnAmt) : g;              // dawn pulls the drums out
  }

  start() {
    if (this.playing) return;
    const when = this.ctx.currentTime + 0.06;
    for (const [name, s] of Object.entries(this.stems)) {
      const src = this.ctx.createBufferSource();
      src.buffer = s.buffer;
      src.loop = true;
      s.node = this.ctx.createGain();
      s.node.gain.value = this._gain(name);
      src.connect(s.node).connect(this.master);
      src.start(when);           // one clock tick for all of them = phase-locked
      this.sources.push(src);
    }
    this.playing = true;
  }

  _apply(ramp) {
    if (!this.playing) return;
    const t = this.ctx.currentTime;
    for (const name of Object.keys(this.stems)) {
      this.stems[name].node.gain.setTargetAtTime(this._gain(name), t, Math.max(0.01, ramp) / 3);
    }
  }

  setIntensity(v, ramp = 0.9) {
    this.intensity = Math.min(1, Math.max(0, v));
    this._apply(ramp);
  }

  setDawn(on) {
    this.dawnAmt = on ? 1 : 0;
    this._apply(AUDIO.dawnFadeSec);
  }

  setVolume(v, ramp = 0.25) {
    AUDIO.musicVolume = v;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, ramp / 3);
  }

  duck(to, holdMs) {
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(AUDIO.musicVolume * to, t, 0.02);
    this.master.gain.setTargetAtTime(AUDIO.musicVolume, t + holdMs / 1000, 0.12);
  }

  stop(fade = 1.2) {
    if (!this.playing) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0, t, fade / 3);
    const srcs = this.sources;
    setTimeout(() => { for (const s of srcs) { try { s.stop(); } catch { /* already stopped */ } } }, fade * 1000 + 120);
    this.sources = [];
    this.playing = false;
  }
}

/* ---- sfx ---------------------------------------------------------------- */

class SfxBank {
  constructor(ctx) {
    this.ctx = ctx;
    this.buffers = new Map();
    this.last = new Map();
    this.master = ctx.createGain();
    this.master.gain.value = AUDIO.sfxVolume;
    this.master.connect(ctx.destination);
    this.warned = new Set();
    // a small deterministic jitter source, so two identical shots differ but
    // a replay of the same session does not
    let a = 0x9E37;
    this.rand = () => {
      a = (a * 1103515245 + 12345) & 0x7fffffff;
      return a / 0x7fffffff;
    };
  }

  add(name, audio) { this.buffers.set(name, toBuffer(this.ctx, audio)); }

  play(name, { pitch = 1, pan = 0, gain = 1 } = {}) {
    const buf = this.buffers.get(name);
    if (!buf) {
      if (!this.warned.has(name)) { console.warn(`[audio] no sfx "${name}"`); this.warned.add(name); }
      return false;
    }
    const now = this.ctx.currentTime * 1000;
    if (now - (this.last.get(name) ?? -1e9) < AUDIO.retriggerMs) return false;
    this.last.set(name, now);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = pitch * (0.97 + this.rand() * 0.06);
    const g = this.ctx.createGain();
    g.gain.value = gain * (0.94 + this.rand() * 0.12);
    let tail = g;
    if (pan) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      tail = p;
    }
    src.connect(g);
    tail.connect(this.master);
    src.start();
    return true;
  }
}

/* ---- the singleton ------------------------------------------------------ */

let A = null;          // { ctx, music, sfx }
let booting = null;
let stepFoot = 0;

/**
 * Create the context and render everything.  MUST be called from a user
 * gesture handler; a `resume()` outside one is a silent no-op and every later
 * call goes to a suspended context.  Idempotent.
 *
 * The score render is ~2.5 s of synchronous DSP (composeAdaptiveLoop renders
 * all six pitched tiers in one call and cannot be interleaved without changing
 * the RNG stream, which would stop the browser's bytes matching the gate's).
 * Call it behind a loading screen, not on the first frame.
 */
export async function initAudio({ onProgress = null } = {}) {
  if (A) return A;
  if (booting) return booting;
  booting = (async () => {
    const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctx) throw new Error('[audio] no WebAudio in this environment');
    // ASK FOR soundforge's RATE.  Left to itself this machine opened the
    // context at 48 kHz, and every buffer here is authored at 44.1 — which
    // WebAudio then resamples on playback, so what the player hears is not
    // quite what `check-music.mjs` measured.  Requesting the rate is honoured
    // where it is supported and harmlessly ignored where it is not.
    let ctx;
    try { ctx = new Ctx({ sampleRate: SR }); } catch { ctx = new Ctx(); }
    await ctx.resume().catch(() => {});
    onProgress?.(0, 'score');
    await yieldFrame();
    const score = renderScore();
    const music = new SiegeMusic(ctx, score);
    let done = 0;
    const total = score.order.length + EVENTS.length;
    // Yield sparingly.  A hidden tab clamps chained setTimeout(0) to about a
    // second each, so yielding per item turned a 3.2 s load into 14.2 s in a
    // background tab; the DSP itself is 2.95 s for the score and 0.25 s for
    // the bank, measured in this browser and in Node.
    for (const name of score.order) {
      music.attach(name);
      onProgress?.(++done / total, name);
      if (done % 3 === 0) await yieldFrame();
    }
    const sfx = new SfxBank(ctx);
    const rendered = renderBank();
    for (const name of EVENTS) {
      sfx.add(name, rendered[name]);
      onProgress?.(++done / total, name);
      if (done % 12 === 0) await yieldFrame();
    }
    music.start();
    music.setIntensity(0, 0.01);
    A = { ctx, music, sfx, score };
    return A;
  })();
  return booting;
}

export const isReady = () => A !== null;
export const audioContext = () => A?.ctx ?? null;

/** The live graph, for `lab.html` and for anything that has to ASSERT on the
 *  WebAudio side rather than on the rendered buffers.  Not for game code. */
export const _internals = () => A;

/** The contract's one number. */
export function setIntensity(x, ramp = 0.9) { A?.music.setIntensity(x, ramp); }
export function getIntensity() { return A ? A.music.intensity : 0; }

/**
 * Pan and distance gain from a world position.  `yaw` is the player's, in the
 * `atan2(-dx, -dz)` convention: 0 looks along -Z, +yaw turns left.
 *   forward = (-sin yaw, -cos yaw)   right = (-forward.z, forward.x)
 * Returns null when the source is past `maxAudible`.
 */
export function spatial(pos, listener, yaw = 0) {
  const dx = pos[0] - listener[0], dz = pos[2] - listener[2];
  const dist = Math.hypot(dx, dz);
  if (dist > AUDIO.maxAudible) return null;
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);        // the right vector
  const pan = dist < 1e-4 ? 0 : Math.max(-1, Math.min(1, (dx * rx + dz * rz) / dist)) * AUDIO.maxPan;
  const gain = AUDIO.refDistance / (AUDIO.refDistance + Math.max(0, dist - AUDIO.refDistance));
  return { pan, gain, dist };
}

/**
 * Fire one event.  `gain` multiplies the BANK'S OWN level — the bank is
 * calibrated so `MAGNITUDE` is monotone in the contract's ladder, and setting
 * a gain per call site is how that stops being true.  Returns false if the
 * sound was dropped (unknown, out of range, or inside the retrigger guard).
 */
export function play(rawName, opts = {}) {
  if (!A) return false;
  // the game's feel table names things semantically ('bolt-fire', 'kill-heavy',
  // 'bell'); ALIASES in sfx-bank.js is where those meet the bank's own keys
  const name = resolve(rawName);
  let { pitch = 1, pan = 0, gain = 1, vol, rate, pos = null, listener = null, yaw = 0, duck = null } = opts;
  // feeltable.js writes `{ vol, rate }`; accept both spellings rather than
  // making the other agent rename a table of sixty entries
  if (vol !== undefined) gain *= vol;
  if (rate !== undefined) pitch *= rate;
  if (pos && listener) {
    const s = spatial(pos, listener, yaw);
    if (!s) return false;
    pan = s.pan;
    gain *= s.gain;
  }
  const mag = MAGNITUDE[name]?.magnitude;
  const shouldDuck = duck === null ? (mag !== undefined && mag >= AUDIO.duckAbove) : duck;
  const ok = A.sfx.play(name, { pitch, pan, gain });
  if (ok && shouldDuck) A.music.duck(AUDIO.duckTo, AUDIO.duckHoldMs);
  return ok;
}

const warnedSurface = new Set();
/** One footstep.  Alternates feet so a run does not machine-gun one sample. */
export function footstep(surface = 'stone', opts = {}) {
  let s = surface;
  if (!SURFACES.includes(s)) {
    if (!warnedSurface.has(s)) { console.warn(`[audio] no surface "${s}", using stone`); warnedSurface.add(s); }
    s = 'stone';
  }
  stepFoot ^= 1;
  return play(`step-${s}`, { ...opts, pitch: (opts.pitch ?? 1) * (stepFoot ? 1.045 : 0.955) });
}

/** The fourth tier: the bell in, the war drums out, over 6 s. */
export function dawn(on = true) { A?.music.setDawn(on); }

export function stopMusic(fade = 1.2) { A?.music.stop(fade); }
export function setMusicVolume(v) { A?.music.setVolume(v); }
export function setSfxVolume(v) {
  AUDIO.sfxVolume = v;
  if (A) A.sfx.master.gain.setTargetAtTime(v, A.ctx.currentTime, 0.05);
}

/**
 * The shape `src/game/INTERFACES.md` asks for:
 *   attachAudio({ music: { setIntensity }, sfx: { play, buffers } })
 * Returns null until `initAudio()` has resolved.
 */
export function audioAdapter() {
  if (!A) return null;
  return {
    music: { setIntensity, dawn, setVolume: setMusicVolume, stop: stopMusic },
    sfx: { play, footstep, buffers: A.sfx.buffers, magnitude: MAGNITUDE, aliases: ALIASES },
  };
}

/** Ends every sound and closes the context.  Audio that outlives its scene is
 *  a defect class (charforge SOUND.md), and this is the only way out. */
export function disposeAudio() {
  if (!A) { booting = null; return; }
  const { ctx, music, sfx } = A;
  music.stop(0.15);
  sfx.master.disconnect();
  A = null;
  booting = null;
  setTimeout(() => ctx.close().catch(() => {}), 400);
}
