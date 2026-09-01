// The score's render path — pure JS, no WebAudio, so the identical function
// backs the browser runtime, the Node gate and the WAV evidence.
//
// composeAdaptiveLoop gives us the six pitched tiers on one 8-bar timeline.
// This file adds the three things it cannot do and the siege needs:
//
//   1. WAR DRUMS.  compose.js's drum styles are a pop kit — hats on every
//      eighth, a ride, a clap.  A siege wants skins: `renderWar` builds the
//      three drum tiers from `WAR` in the loop spec against the SAME bar
//      clock, with a four-piece kit of ōdaiko / naru / shime / rattle.
//   2. SIDECHAIN.  composeSong ducks pads and bass off the kick; the adaptive
//      path does not duck anything.  The duck has to be applied so it still
//      wraps: an envelope follower starts at zero, so ducking a 20 s loop
//      once leaves the first pulse un-ducked and the seam audibly asymmetric.
//      `duckLooped` runs the follower over the loop played TWICE and keeps the
//      second pass, which is the state the follower is in when the loop wraps.
//   3. A MASTERED STEM SET.  Per stem: DC/rumble highpass, drive and glue on
//      the drums only, the tier's gain, and a limiter — so a stem can be
//      summed at any window gain without the sum ever reaching the ceiling.
//
// `mixAt(score, v)` is the headless equivalent of what the WebAudio graph
// does at intensity v, and it is what the loudness-vs-intensity gate measures.

import {
  SR, seedAudio, stereo, mixInto, filterBuf, duckFx, limitFx, driveFx, compressFx, reverbFx, db,
} from '../../../charforge/src/soundforge/dsp.js';
import { renderDrums } from '../../../charforge/src/soundforge/synth.js';
import { composeAdaptiveLoop } from '../../../charforge/src/soundforge/compose.js';
import { windowGain } from '../../../charforge/src/soundforge/runtime.js';
import { seededRng } from '../../../charforge/src/soundforge/theory.js';
import { LOOP, WAR } from './loop-hollowbrook.js';

const TAIL_SEC = 2.5;          // same overflow the pitched tiers fold
export const MASTER_GAIN = 0.56; // AdaptiveMusic's master, trimmed for this score

// The kit.  Four voices, all skins except the rattle.
const WAR_KIT = {
  o: { kind: 'kick', params: { pitch: 96, drop: 7.0, decay: 0.46, click: 0.26, body: 1.0 }, pan: 0.00 },
  n: { kind: 'tom', params: { pitch: 132, decay: 0.30 }, pan: -0.18 },
  s: { kind: 'tom', params: { pitch: 205, decay: 0.16 }, pan: 0.22 },
  r: { kind: 'snare', params: { tone: 220, decay: 0.10, snap: 0.5 }, pan: 0.12 },
};

/** Fold a buffer rendered past the loop back onto its own start. */
function fold([L, R], loopSec) {
  const n = Math.round(loopSec * SR);
  const out = [new Float32Array(n), new Float32Array(n)];
  for (let c = 0; c < 2; c++) {
    const src = c ? R : L;
    out[c].set(src.subarray(0, n));
    for (let i = n; i < src.length; i++) out[c][i - n] += src[i];
  }
  return out;
}

/**
 * Duck `target` off `trigger` in a way that survives the wrap: the envelope
 * follower is run over two consecutive copies of the loop and the second copy
 * is kept, so the gain at sample 0 is the gain the follower actually holds
 * when the loop comes round again.
 */
function duckLooped(target, trigger, opts) {
  const n = target[0].length;
  const dbl = [new Float32Array(n * 2), new Float32Array(n * 2)];
  const trg = new Float32Array(n * 2);
  for (let c = 0; c < 2; c++) { dbl[c].set(target[c], 0); dbl[c].set(target[c], n); }
  trg.set(trigger, 0); trg.set(trigger, n);
  duckFx(dbl, trg, opts);
  return [dbl[0].subarray(n).slice(), dbl[1].subarray(n).slice()];
}

function renderWar(tier, meta, rng) {
  const { barSec, bars } = meta;
  const stepSec = barSec / 16;
  const hits = [];
  for (let b = 0; b < bars; b++) {
    const isFill = tier.fillBar && b === bars - 1;
    const pat = isFill ? tier.fillBar : tier.bars[b % tier.bars.length];
    for (const [ch, steps] of Object.entries(pat)) {
      const voice = WAR_KIT[ch];
      if (!voice) throw new Error(`no war-drum voice "${ch}"`);
      for (let st = 0; st < 16; st++) {
        if (steps[st] !== '1') continue;
        const accent = st === 0 ? 1.0 : st % 4 === 0 ? 0.82 : st % 2 === 0 ? 0.66 : 0.54;
        hits.push({
          t: b * barSec + st * stepSec,
          kind: voice.kind, params: voice.params, pan: voice.pan,
          vel: accent * (0.93 + rng() * 0.14),
        });
      }
    }
  }
  const audio = renderDrums(hits, meta.loopSec + TAIL_SEC, { gain: 1 });
  // A drum in a walled town has a room round it.  Small and damped: a long
  // tail on the war drums smears the pulse the whole score is built on.
  reverbFx(audio, { size: 0.55, damp: 0.62, mix: 0.13 });
  return fold(audio, meta.loopSec);
}

/** Per-stem mastering.  Drums get glue; everything gets headroom and a gain. */
function masterStem(audio, gain, { drums = false } = {}) {
  filterBuf(audio[0], 'highpass', 26, 0.7);
  filterBuf(audio[1], 'highpass', 26, 0.7);
  if (drums) {
    compressFx(audio, { threshDb: -17, ratio: 3, attack: 0.004, release: 0.13, makeupDb: 2.0 });
    driveFx(audio, { amount: 1.6, mix: 0.22 });
    // the ōdaiko's fundamental sits at 96 Hz and there are three drum tiers:
    // without this dip the 60-250 band takes 78 % of the whole score's energy
    filterBuf(audio[0], 'peak', 120, 1.0, -2.5);
    filterBuf(audio[1], 'peak', 120, 1.0, -2.5);
    // This kit has no cymbals, so the only air in the whole score is the
    // ōdaiko's beater click and the rattle: lift it or the mix reads muffled.
    filterBuf(audio[0], 'highshelf', 6500, 0.7, 7.0);
    filterBuf(audio[1], 'highshelf', 6500, 0.7, 7.0);
  } else {
    // and the melodic tiers get a little top so the score is not a wall of
    // lowmid — the horn's own filter is at 1.75 kHz and eats everything above it
    filterBuf(audio[0], 'highshelf', 8000, 0.7, 3.0);
    filterBuf(audio[1], 'highshelf', 8000, 0.7, 3.0);
  }
  for (const ch of audio) for (let i = 0; i < ch.length; i++) ch[i] *= gain;
  limitFx(audio, { ceilingDb: -3 });
  return audio;
}

/**
 * Render the whole score.  Deterministic: seeds soundforge's one RNG first,
 * and every consumer runs in a fixed order.
 * @returns {{stems: Object, order: string[], loopSec: number, meta: Object}}
 */
export function renderScore({ seed = LOOP.seed } = {}) {
  seedAudio(seed);
  const { stems: pitched, loopSec, meta } = composeAdaptiveLoop(LOOP);
  const rng = seededRng(seed ^ 0x5157);
  const wmeta = { ...meta, loopSec };

  const stems = {};
  const order = [];
  // Fixed emission order — the RNG stream and therefore the bytes depend on it.
  for (const name of Object.keys(LOOP.tiers)) {
    stems[name] = { audio: pitched[name].audio, window: pitched[name].window, gain: LOOP.tiers[name].gain, kind: LOOP.tiers[name].type };
    order.push(name);
  }
  for (const name of Object.keys(WAR)) {
    const t = WAR[name];
    stems[name] = { audio: renderWar(t, wmeta, rng), window: t.window, gain: t.gain, kind: 'war' };
    order.push(name);
  }

  // Sidechain: the marching drum is the trigger for the whole score, so the
  // low end breathes on the same pulse at every intensity that has drums —
  // and at the intensities that do not, the pads are simply un-ducked.
  const trig = Float32Array.from(stems.drumsMid.audio[0]);
  filterBuf(trig, 'lowpass', 150, 0.7);
  for (const [name, amount] of [['drone', 0.30], ['bassRoots', 0.46], ['bassDrive', 0.42]]) {
    stems[name].audio = duckLooped(stems[name].audio, trig, { amount, attack: 0.006, release: 0.16 });
  }

  for (const name of order) {
    masterStem(stems[name].audio, stems[name].gain, { drums: stems[name].kind === 'war' });
  }
  return { stems, order, loopSec, meta: wmeta };
}

/** The tier table, for the README, the gate and the game's own docs. */
export const TIERS = [
  ...Object.entries(LOOP.tiers).map(([name, t]) => ({ name, type: t.type, window: t.window, gain: t.gain })),
  ...Object.entries(WAR).map(([name, t]) => ({ name, type: 'war-drums', window: t.window, gain: t.gain })),
];

/** Stems audible at intensity v, excluding the out-of-band dawn tier. */
export const gainsAt = (score, v, dawnAmt = 0) => {
  const g = {};
  for (const name of score.order) {
    const w = score.stems[name].window;
    g[name] = w[0] > 1 ? dawnAmt : windowGain(v, w);
  }
  return g;
};

/**
 * Headless equivalent of the WebAudio graph at intensity `v`: one loop of
 * stereo, tier gains applied, master gain and the same ceiling.
 */
export function mixAt(score, v, { dawn = 0, master = MASTER_GAIN } = {}) {
  const n = score.stems[score.order[0]].audio[0].length;
  const out = [new Float32Array(n), new Float32Array(n)];
  const g = gainsAt(score, v, dawn);
  for (const name of score.order) {
    if (g[name] <= 0.0001) continue;
    const a = score.stems[name].audio;
    for (let c = 0; c < 2; c++) for (let i = 0; i < n; i++) out[c][i] += a[c][i] * g[name];
  }
  for (const ch of out) for (let i = 0; i < ch.length; i++) ch[i] *= master;
  limitFx(out, { ceilingDb: -1 });
  return out;
}

/**
 * An intensity ride, rendered as continuous audio: `points` is
 * [[seconds, intensity], ...] and the loop is repeated and crossfaded per
 * sample by the tier windows, which is precisely what setIntensity does with
 * a ramp of 0.  Evidence only — the runtime never calls this.
 */
export function renderRide(score, points, seconds, { master = MASTER_GAIN, dawnFrom = null } = {}) {
  const n = Math.round(seconds * SR);
  const loopN = score.stems[score.order[0]].audio[0].length;
  const out = [new Float32Array(n), new Float32Array(n)];
  const at = (t) => {
    for (let i = 1; i < points.length; i++) {
      if (t <= points[i][0]) {
        const [t0, v0] = points[i - 1], [t1, v1] = points[i];
        return v0 + (v1 - v0) * ((t - t0) / Math.max(1e-6, t1 - t0));
      }
    }
    return points[points.length - 1][1];
  };
  const CTRL = 512;                       // control-rate gain updates
  let g = gainsAt(score, at(0), 0);
  for (let i = 0; i < n; i++) {
    if (i % CTRL === 0) {
      const t = i / SR;
      const dawnAmt = dawnFrom === null ? 0 : Math.min(1, Math.max(0, (t - dawnFrom) / 6));
      const target = gainsAt(score, at(t), dawnAmt);
      // one-pole toward the target, matching setIntensity's 0.9 s ramp
      for (const k in target) g[k] += (target[k] - g[k]) * 0.06;
    }
    const j = i % loopN;
    let l = 0, r = 0;
    for (const name of score.order) {
      const gv = g[name];
      if (gv <= 0.0005) continue;
      const a = score.stems[name].audio;
      l += a[0][j] * gv; r += a[1][j] * gv;
    }
    out[0][i] = l * master; out[1][i] = r * master;
  }
  limitFx(out, { ceilingDb: -1 });
  return out;
}
