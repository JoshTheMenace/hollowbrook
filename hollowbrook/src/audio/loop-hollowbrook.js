// The siege score — one adaptive loop, authored as a soundforge song spec.
//
// 8 bars at 96 bpm in D minor = a 20.0 s seamless loop rendered as TIER STEMS
// over one timeline (compose.js `composeAdaptiveLoop`).  The game moves ONE
// number and the tiers crossfade by their intensity windows; the windows are
// laid out against LOOP-CONTRACT.md's intent points, so each point lands in a
// different arrangement:
//
//   0.22 breather   drone alone, and one bass note per bar
//   0.50 wave 1     + the low war drum, + the motif stated on the horn
//   0.58 wave 2     the marching drum takes over from the slow one
//   0.68 wave 3     + driving bass eighths
//   0.80 wave 4     + the low horn answering the motif
//   0.90 Captain    + the heavy drum with its fills
//   0.88 wave 5     (between the two above by construction)
//   1.00 wave 6     everything
//   0.30 dawn       drone + roots again, and `dawn()` brings the bell in
//
// THE MOTIF IS ONE MOTIF.  `theme`, `hornCounter` and `dawnBell` are the same
// five notes under different development plans and octaves — a statement, a
// low augmented answer, and a resolution — which is why the score escalates
// instead of being three unrelated loops stacked on each other.  The three
// war-drum tiers are NOT in this spec: composeAdaptiveLoop's drum styles are a
// pop kit (hats, ride, clap) and a siege needs skins, so score.js builds them
// with its own patterns on top of this timeline.  Same bars, same bar clock.

import { motif } from '../../../charforge/src/soundforge/theory.js';
import { INSTRUMENTS } from './instruments.js';

// Five notes: a held root, a step up and back, the minor third above, and a
// fall.  Short enough to survive `thin`, wide enough for `invert` to say
// something.  Total 4 beats = exactly one bar.
export const SIEGE = motif([
  { deg: 0, dur: 1.0, vel: 0.92 },
  { deg: 2, dur: 0.5, vel: 0.70 },
  { deg: 1, dur: 0.5, vel: 0.66 },
  { deg: 4, dur: 1.0, vel: 0.95 },
  { deg: 3, dur: 1.0, vel: 0.78 },
]);

export const LOOP = {
  name: 'hollowbrook-siege',
  bpm: 96,
  key: 'D3',
  mode: 'minor',
  seed: 1806,
  swing: 0,                     // a siege does not swing
  bars: 8,
  // i i VI VII | i iv VI V — two four-bar sentences, the second one darker.
  chords: ['i', 'i', 'VI', 'VII', 'i', 'iv', 'VI', 'V'],
  instruments: INSTRUMENTS,
  tiers: {
    drone: {
      type: 'pads', instrument: 'hollowDrone', style: 'held',
      gain: 0.80, window: [0.0, 1.01],
    },
    bassRoots: {
      type: 'bass', instrument: 'ironBass', style: 'roots',
      gain: 0.54, window: [0.16, 1.01],
    },
    theme: {
      type: 'lead', instrument: 'siegeHorn', octave: 1, gain: 0.92,
      motif: SIEGE,
      plan: ['statement', 'echo', 'busy', 'cadence', 'statement', 'lift', 'answer', 'cadence'],
      window: [0.42, 1.01],
    },
    bassDrive: {
      type: 'bass', instrument: 'ironBass', style: 'drive',
      gain: 0.48, window: [0.62, 1.01],
    },
    hornCounter: {
      type: 'counter', instrument: 'lowHorn', octave: 0, gain: 0.72,
      motif: SIEGE,
      plan: ['sparse', 'statement', 'sparse', 'answer', 'sparse', 'mirror', 'sparse', 'cadence'],
      window: [0.72, 1.01],
    },
    // Out of band on purpose: windowGain(v<=1, [2,3]) === 0, so `dawn()` can
    // own this stem's gain without the intensity sweep stomping it — and the
    // loudness-vs-intensity curve stays monotone at the 0.30 dawn point.
    dawnBell: {
      type: 'counter', instrument: 'keepBell', octave: 1, gain: 0.62,
      motif: SIEGE,
      plan: ['statement', 'sparse', 'lift', 'cadence', 'statement', 'sparse', 'answer', 'cadence'],
      window: [2, 3],
    },
  },
};

// The three war-drum tiers, rendered by score.js against the same bar clock.
// 16 steps per bar.  `o` = ōdaiko (the big drum), `n` = naru (mid tom),
// `s` = shime (high tight tom), `r` = a rattle.  No hats, no ride, no clap:
// this kit has skins and one snare and that is the entire point of it.
export const WAR = {
  drumsLow: {
    window: [0.30, 0.72], gain: 0.62,
    // one slow pulse and a tom answer — three metres of drumhead, hit twice
    bars: [
      { o: '1000000010000000', n: '0000000000001000' },
      { o: '1000000010000000', n: '0000000000000010' },
    ],
  },
  drumsMid: {
    window: [0.56, 1.01], gain: 0.60,
    // a march: the company has found the gate
    bars: [
      { o: '1000001010000010', n: '0000100000001000' },
      { o: '1000001010000010', n: '0000100000101000' },
      { o: '1000001010000010', n: '0000100000001000' },
      { o: '1000001010001010', n: '0000100010001010' },
    ],
  },
  drumsHigh: {
    window: [0.85, 1.01], gain: 0.60,
    // the storm — arriving late on purpose, so wave 6 is audibly past the
    // Captain's 0.90 rather than a rounding error above it
    // and the eighth bar is a fill, so the wrap has a lead-in
    bars: [
      { o: '1010010010100100', n: '0010100010101000', s: '0000100000001000', r: '0000100000000000' },
      { o: '1010010010100100', n: '0010100010101010', s: '0000100000001010', r: '0000100000001000' },
    ],
    fillBar: { o: '1000100010001010', n: '1010101010101110', s: '0010001000111111', r: '0000100000001111' },
  },
};
