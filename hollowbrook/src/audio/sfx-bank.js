// Hollowbrook's SFX bank — 35 layered one-shots, every one a soundforge
// `sfx.js` spec.  Rules that are not negotiable here:
//
//   * EVERY SOUND IS LAYERS (transient + body + tail).  A one-generator sound
//     is a prototype (SOUND.md), and at this scale the ladder cannot separate
//     thirteen prototypes.
//   * THE LADDER IS THE DESIGN.  `LADDER` below is LOOP-CONTRACT.md's
//     thirteen events in rank order, and `scripts/check-music.mjs` fails if
//     the measured `magnitude()` of the rendered bank stops being monotone in
//     that rank.  The gainDb values here were *tuned against the measurement*,
//     which is why some of them look arbitrary — they are not arbitrary, they
//     are the value at which the sound sits between its two neighbours.
//   * NO VOICES.  The no-people rule covers audio: nothing here is a shout, a
//     grunt or a death cry.  A kill reads as impact + material + a token, and
//     dialogue is abstract blips.  That is a constraint, not an omission.
//   * FRONT-LOADING.  ui / combat / foley must peak inside 90 ms or the game
//     feels laggy.  Two families deliberately must NOT — a 0.9 s charge and a
//     0.7 s staff glow are *builds* — so they carry the `charge` class, which
//     is exempt and is checked for the opposite property (peak in the last
//     third).
//
// A note on the ember lance's charge: `sfx.js`'s `sweep` and `noise` gens both
// have a hard-coded DECAYING envelope (`pow(1 - u, 1.4)`), so there is no way
// to ask this library for one rising tone.  The build is therefore nine short
// sweeps at rising pitch and rising gain, overlapped 0.10 s apart — the sum's
// envelope rises because the later layers are louder, and it ratchets, which
// is what a wound crossbow-lance should do anyway.

import { renderSfx } from '../../../charforge/src/soundforge/sfx.js';
import { seedAudio } from '../../../charforge/src/soundforge/dsp.js';

/**
 * Class windows: `[minCentroidHz, maxCentroidHz, maxDurSec, maxAttackMs]`.
 *
 * The first three columns for ui / foley / combat / heavy / voice are
 * charforge's numbers unchanged, so a sound that would fail there fails here.
 * The fourth column is new and it makes the front-load rule a PROPERTY OF THE
 * CLASS instead of a hard-coded list of three class names: an interactive
 * sound must peak inside 90 ms, a heavy impact is allowed 150 (its own rise is
 * part of its weight), and a stinger is allowed 400.  `world` and `toll` are
 * Hollowbrook's own — a barricade going up and a bell tolling are neither
 * foley one-shots nor stingers.  `charge` is the exception: `maxAttackMs: -1`
 * means the opposite test, "the loudest moment must be in the BACK of the
 * sound", which is the whole point of a build.
 */
export const SFX_CLASSES = {
  ui: [900, 7000, 0.6, 90],
  foley: [200, 3800, 0.5, 90],
  combat: [500, 5000, 1.2, 90],
  heavy: [120, 3000, 2.6, 150],
  world: [200, 5000, 3.5, 450],   // barricades, braziers, the reload sequence
  voice: [300, 4000, 3.0, 400],
  toll: [140, 3200, 6.5, 400],    // the keep bell, the Captain, a lost light
  charge: [250, 4500, 1.7, -1],   // a BUILD — peak must be in the back half
  swell: [140, 3200, 3.5, -1],    // a long dread build: the Captain arriving
};

/** LOOP-CONTRACT.md's feel ladder, in rank order.  The gate reads this. */
export const LADDER = [
  'bolt-fired', 'bolt-miss', 'bolt-hit', 'lance-fired', 'kill-cutpurse',
  'player-hurt', 'kill-hexer', 'kill-reaver', 'kill-shieldbearer',
  'lance-multikill', 'wave-cleared', 'kill-captain', 'bell-rung',
];

/** The contract's other declared events — wired or `check-feel` is red. */
export const DECLARED = [
  'defeat', 'light-lost', 'objective-start', 'objective-done', 'npc-sheltered',
  'barricade-up', 'brazier-lit', 'reload', 'hexer-telegraph', 'captain-dash',
];

export const SURFACES = ['stone', 'timber', 'grass'];

export const BANK = {
  // ---- 1. bolt-fired ------------------------------------------------------
  // The prod release: a nut click, the string's thrum, a breath of air.  The
  // quietest thing in the game and it fires every 0.36 s, so it has to read
  // at a level that never tires.
  'bolt-fired': {
    class: 'combat', gainDb: -14.4,
    layers: [
      // pink, not white: a band-passed WHITE layer put this sound's centroid at
      // 9.0 kHz — the second-order slope leaks highs (SOUND.md trap 3) and the
      // whole click read as a hiss rather than as a bowstring
      { gen: 'noise', kind: 'pink', filter: { type: 'highpass', f: 2200 }, dur: 0.028, attack: 0.0004, gain: 0.60 },
      { gen: 'sweep', wave: 'tri', from: 940, to: 250, curve: 1.2, dur: 0.055, gain: 0.72 },
      { gen: 'impact', pitch: 230, drop: 34, dur: 0.05, punch: 0.30, gain: 0.34 },
    ],
  },

  // ---- 2. bolt-miss -------------------------------------------------------
  // Into stone or a shutter, away from you: a harder tick with a splinter.
  'bolt-miss': {
    class: 'combat', gainDb: -17.5,
    layers: [
      { gen: 'impact', pitch: 165, drop: 24, dur: 0.10, punch: 0.62, gain: 0.62 },
      { gen: 'noise', kind: 'white', filter: { type: 'bandpass', f: 1500, q: 1.0 }, dur: 0.055, attack: 0.0004, gain: 0.55 },
      { gen: 'crackle', density: 40, dur: 0.11, tone: 3100, gain: 0.16, delay: 0.02 },
    ],
  },

  // ---- 3. bolt-hit --------------------------------------------------------
  // Into a body: lower, wetter, with a tick off a buckle so it reads as a HIT
  // and not as the same sound slightly louder.
  'bolt-hit': {
    class: 'combat', gainDb: -20.2,
    layers: [
      { gen: 'impact', pitch: 128, drop: 15, dur: 0.17, punch: 0.75, gain: 0.85 },
      { gen: 'noise', kind: 'pink', filter: { type: 'lowpass', f: 1300 }, fEnd: 520, dur: 0.11, attack: 0.0008, gain: 0.85 },
      { gen: 'metal', base: 1180, ratios: [1, 2.31], dur: 0.13, bright: 0.85, gain: 0.20, delay: 0.006 },
    ],
  },

  // ---- 4. lance-fired -----------------------------------------------------
  // Release of the emberlance: a low whoomph with fire in it, and the bolt
  // leaving.  Longer than anything above it and that is most of its size.
  'lance-fired': {
    class: 'heavy', gainDb: -20.4,
    layers: [
      { gen: 'noise', kind: 'white', filter: { type: 'highpass', f: 3800 }, dur: 0.03, attack: 0.0003, gain: 0.7 },
      { gen: 'impact', pitch: 74, drop: 9, dur: 0.34, punch: 0.85, gain: 1.0 },
      { gen: 'noise', kind: 'pink', filter: { type: 'bandpass', f: 950, q: 0.8 }, fEnd: 210, dur: 0.30, attack: 0.001, gain: 1.0, delay: 0.008 },
      { gen: 'crackle', density: 150, dur: 0.34, tone: 2100, gain: 0.30, delay: 0.03 },
    ],
    fx: [{ fx: 'reverb', size: 0.6, damp: 0.6, mix: 0.13 }],
  },

  // ---- 5. kill-cutpurse ---------------------------------------------------
  // The lightest death.  Body down on stone, a coin purse, and the falling
  // two-note token every kill in this game shares.
  'kill-cutpurse': {
    class: 'combat', gainDb: -15.7,
    layers: [
      { gen: 'impact', pitch: 110, drop: 13, dur: 0.24, punch: 0.60, gain: 0.85 },
      { gen: 'noise', kind: 'pink', filter: { type: 'lowpass', f: 900 }, dur: 0.20, attack: 0.001, gain: 0.75 },
      { gen: 'metal', base: 1560, ratios: [1, 1.71, 2.94], dur: 0.34, bright: 0.9, gain: 0.24, delay: 0.05 },
      { gen: 'chirp', from: 780, to: 520, reps: 2, dur: 0.055, gap: 0.03, gain: 0.28, delay: 0.07 },
    ],
    fx: [{ fx: 'reverb', size: 0.55, damp: 0.6, mix: 0.14 }],
  },

  // ---- 6. player-hurt -----------------------------------------------------
  // A NEGATIVE event: it must be unmistakable and must never outrank a real
  // kill above it.  Low, close, with a dull ring that says *you*, not them.
  'player-hurt': {
    class: 'combat', gainDb: -15.1,
    layers: [
      { gen: 'impact', pitch: 150, drop: 17, dur: 0.22, punch: 0.55, gain: 0.85 },
      { gen: 'sweep', wave: 'square', from: 285, to: 96, curve: 0.8, dur: 0.30, gain: 0.55 },
      { gen: 'noise', kind: 'pink', filter: { type: 'lowpass', f: 420 }, dur: 0.42, attack: 0.004, gain: 0.85, delay: 0.02 },
    ],
  },

  // ---- 7. kill-hexer ------------------------------------------------------
  // A ward coming apart: the metal falls instead of ringing, and the body is
  // barely there.  Distinct from every other kill by *material*.
  'kill-hexer': {
    class: 'heavy', gainDb: -11.5,
    layers: [
      { gen: 'sweep', wave: 'sine', from: 1350, to: 190, curve: 1.6, dur: 0.42, gain: 0.75 },
      { gen: 'metal', base: 620, ratios: [1, 1.41, 2.09, 3.31], dur: 0.55, bright: 0.45, gain: 0.55, delay: 0.02 },
      { gen: 'impact', pitch: 96, drop: 12, dur: 0.24, punch: 0.35, gain: 0.55 },
      { gen: 'noise', kind: 'white', filter: { type: 'bandpass', f: 4200, q: 1.6 }, fEnd: 700, dur: 0.34, gain: 0.30 },
    ],
    fx: [{ fx: 'reverb', size: 0.72, damp: 0.45, mix: 0.20 }],
  },

  // ---- 8. kill-reaver -----------------------------------------------------
  // Heavier body, heavier fall, and mail.
  'kill-reaver': {
    class: 'heavy', gainDb: -11.9,
    layers: [
      { gen: 'impact', pitch: 82, drop: 10, dur: 0.42, punch: 0.85, gain: 1.0 },
      { gen: 'noise', kind: 'pink', filter: { type: 'lowpass', f: 700 }, dur: 0.34, attack: 0.001, gain: 0.9 },
      { gen: 'metal', base: 890, ratios: [1, 1.93, 3.12, 4.6], dur: 0.42, bright: 0.6, gain: 0.34, delay: 0.03 },
      { gen: 'chirp', from: 700, to: 440, reps: 2, dur: 0.07, gap: 0.04, gain: 0.26, delay: 0.09 },
    ],
    fx: [{ fx: 'reverb', size: 0.7, damp: 0.55, mix: 0.17 }],
  },

  // ---- 9. kill-shieldbearer ----------------------------------------------
  // The shield goes down first and it is the loudest object in the event: a
  // real clang on stone, then the body.
  'kill-shieldbearer': {
    class: 'heavy', gainDb: -10.8,
    layers: [
      { gen: 'metal', base: 340, ratios: [1, 2.14, 3.41, 5.06, 7.2], dur: 0.95, bright: 0.72, gain: 0.85 },
      { gen: 'impact', pitch: 66, drop: 8, dur: 0.55, punch: 0.9, gain: 1.0, delay: 0.02 },
      { gen: 'noise', kind: 'pink', filter: { type: 'lowpass', f: 800 }, dur: 0.40, attack: 0.001, gain: 0.85, delay: 0.02 },
      { gen: 'crackle', density: 55, dur: 0.55, tone: 2600, gain: 0.24, delay: 0.10 },
    ],
    fx: [{ fx: 'reverb', size: 0.78, damp: 0.5, mix: 0.20 }],
  },

  // ---- 10. lance-multikill -----------------------------------------------
  // Two or more on one shot.  It is the lance's payoff, so the ignition comes
  // back, three impacts arrive in 0.2 s, and it rings.
  'lance-multikill': {
    class: 'heavy', gainDb: -9.2,
    layers: [
      { gen: 'impact', pitch: 70, drop: 8, dur: 0.55, punch: 0.9, gain: 1.0 },
      { gen: 'impact', pitch: 92, drop: 11, dur: 0.40, punch: 0.7, gain: 0.75, delay: 0.09 },
      { gen: 'impact', pitch: 118, drop: 13, dur: 0.34, punch: 0.6, gain: 0.62, delay: 0.19 },
      { gen: 'crackle', density: 200, dur: 0.85, tone: 1900, gain: 0.40, delay: 0.02 },
      { gen: 'metal', base: 480, ratios: [1, 1.78, 2.96, 4.4], dur: 0.95, bright: 0.7, gain: 0.42, delay: 0.06 },
    ],
    fx: [{ fx: 'reverb', size: 0.82, damp: 0.45, mix: 0.24 }],
  },

  // ---- 11. wave-cleared ---------------------------------------------------
  // Not a fanfare — the town breathing out.  A held low horn token resolving
  // up a fourth, with the wall's own reverb on it.
  'wave-cleared': {
    class: 'voice', gainDb: -3.0,
    layers: [
      // the low half was added because the event measured 6 dB short of its
      // rank with 25 % of its energy under 250 Hz — a bright chime does not
      // outweigh a shieldbearer going down, and it should not
      { gen: 'sweep', wave: 'saw', from: 98, to: 131, curve: 0.6, dur: 1.30, gain: 0.70 },
      { gen: 'metal', base: 147, ratios: [1, 1.5, 2, 3], dur: 1.8, bright: 0.35, gain: 0.55, delay: 0.06 },
      { gen: 'sweep', wave: 'saw', from: 147, to: 196, curve: 0.6, dur: 0.9, gain: 0.60 },
      { gen: 'metal', base: 294, ratios: [1, 1.5, 2.0, 3.0], dur: 1.5, bright: 0.55, gain: 0.62, delay: 0.10 },
      { gen: 'chirp', from: 392, to: 588, reps: 2, dur: 0.16, gap: 0.09, gain: 0.34, delay: 0.30 },
      { gen: 'noise', kind: 'pink', filter: { type: 'bandpass', f: 700, q: 0.7 }, fEnd: 2200, dur: 0.7, attack: 0.02, gain: 0.28 },
    ],
    fx: [{ fx: 'reverb', size: 0.88, damp: 0.4, mix: 0.30 }],
  },

  // ---- 12. kill-captain ---------------------------------------------------
  // 408 HP of elite going down in full plate.  The biggest thing in the game
  // that is not the bell, and the only kill with a tail you wait through.
  'kill-captain': {
    class: 'toll', gainDb: -4.6,
    layers: [
      { gen: 'metal', base: 262, ratios: [1, 2.07, 3.28, 4.91, 6.7, 9.1], dur: 2.4, bright: 0.68, gain: 0.90 },
      { gen: 'impact', pitch: 58, drop: 6, dur: 1.1, punch: 1.0, gain: 1.0, delay: 0.03 },
      { gen: 'noise', kind: 'pink', filter: { type: 'lowpass', f: 620 }, dur: 0.9, attack: 0.001, gain: 0.9, delay: 0.02 },
      { gen: 'sweep', wave: 'tri', from: 330, to: 82, curve: 1.1, dur: 1.4, gain: 0.42, delay: 0.12 },
      { gen: 'crackle', density: 90, dur: 1.6, tone: 2200, gain: 0.30, delay: 0.16 },
    ],
    fx: [{ fx: 'reverb', size: 0.92, damp: 0.38, mix: 0.32 }],
  },

  // ---- 13. bell-rung ------------------------------------------------------
  // Dawn.  The whole run ends on this, so it is allowed to be enormous and
  // allowed to be long: three strikes of one inharmonic bell 0.9 s apart, the
  // third one left ringing.
  'bell-rung': {
    class: 'toll', gainDb: -1.0,
    layers: [
      { gen: 'metal', base: 196, ratios: [1, 2.00, 2.42, 2.97, 4.16, 5.43, 7.09], dur: 3.6, bright: 0.62, gain: 1.0 },
      { gen: 'impact', pitch: 88, drop: 14, dur: 0.35, punch: 0.55, gain: 0.55 },
      { gen: 'metal', base: 196, ratios: [1, 2.00, 2.42, 2.97, 4.16, 5.43], dur: 3.2, bright: 0.6, gain: 0.80, delay: 0.90 },
      { gen: 'metal', base: 196, ratios: [1, 2.00, 2.42, 2.97, 4.16, 5.43, 7.09], dur: 3.0, bright: 0.66, gain: 0.90, delay: 1.80 },
      { gen: 'noise', kind: 'pink', filter: { type: 'bandpass', f: 1600, q: 0.8 }, dur: 0.5, attack: 0.004, gain: 0.24 },
      // The hum note.  The bell was measuring the same impact energy as the
      // Captain and reading SMALLER, because only 46 % of it was under 250 Hz
      // against his 83 %.  It is already on the limiter, so more gain buys
      // nothing: what a great bell has and a clang does not is a low partial
      // that is still there four seconds later.
      { gen: 'metal', base: 98, ratios: [1, 2.0, 3.02], dur: 4.6, bright: 0.30, gain: 0.95 },
      { gen: 'metal', base: 98, ratios: [1, 2.0], dur: 3.8, bright: 0.28, gain: 0.60, delay: 1.80 },
    ],
    fx: [{ fx: 'reverb', size: 0.95, damp: 0.30, mix: 0.34 }],
  },

  // ======================= the contract's other declared events ============

  // Three lights and the run is over.  A cracked, falling half-toll — the
  // bell's own material, wrong.
  'light-lost': {
    class: 'toll', gainDb: -5.0,
    layers: [
      { gen: 'metal', base: 156, ratios: [1, 1.83, 2.31, 3.77, 5.1], dur: 2.2, bright: 0.34, gain: 0.85 },
      { gen: 'sweep', wave: 'tri', from: 300, to: 72, curve: 1.3, dur: 1.5, gain: 0.45, delay: 0.05 },
      { gen: 'noise', kind: 'pink', filter: { type: 'lowpass', f: 500 }, dur: 1.0, attack: 0.02, gain: 0.45, delay: 0.10 },
    ],
    fx: [{ fx: 'reverb', size: 0.92, damp: 0.42, mix: 0.30 }],
  },

  'defeat': {
    class: 'toll', gainDb: -5.0,
    layers: [
      { gen: 'sweep', wave: 'tri', from: 392, to: 82, curve: 0.85, dur: 1.6, gain: 0.60 },
      { gen: 'metal', base: 174, ratios: [1, 1.19, 2.31, 3.02], dur: 2.2, bright: 0.28, gain: 0.50, delay: 0.20 },
      { gen: 'noise', kind: 'pink', filter: { type: 'lowpass', f: 380 }, dur: 1.4, attack: 0.05, gain: 0.42, delay: 0.15 },
    ],
    fx: [{ fx: 'reverb', size: 0.9, damp: 0.45, mix: 0.30 }],
  },

  'objective-start': {
    class: 'voice', gainDb: -10,
    layers: [
      { gen: 'chirp', from: 392, to: 523, reps: 2, dur: 0.12, gap: 0.06, gain: 0.55 },
      { gen: 'metal', base: 784, ratios: [1, 1.5, 2.24], dur: 0.7, bright: 0.7, gain: 0.30, delay: 0.14 },
      { gen: 'noise', kind: 'pink', filter: { type: 'highpass', f: 2600 }, dur: 0.16, gain: 0.20 },
    ],
    fx: [{ fx: 'reverb', size: 0.6, mix: 0.16 }],
  },
  'objective-done': {
    class: 'voice', gainDb: -8,
    layers: [
      { gen: 'chirp', from: 523, to: 784, reps: 3, dur: 0.11, gap: 0.055, gain: 0.55 },
      { gen: 'metal', base: 1046, ratios: [1, 1.5, 2, 3], dur: 1.0, bright: 0.78, gain: 0.38, delay: 0.30 },
      { gen: 'sweep', wave: 'saw', from: 262, to: 392, curve: 0.7, dur: 0.5, gain: 0.22, delay: 0.10 },
    ],
    fx: [{ fx: 'reverb', size: 0.8, mix: 0.24 }],
  },

  // A door, a bar dropped, and quiet.  The one sound in the game that means
  // somebody is safe.
  'npc-sheltered': {
    class: 'foley', gainDb: -13,
    layers: [
      { gen: 'noise', kind: 'pink', filter: { type: 'lowpass', f: 620 }, dur: 0.12, attack: 0.002, gain: 0.75 },
      { gen: 'impact', pitch: 96, drop: 20, dur: 0.16, punch: 0.35, gain: 0.60, delay: 0.01 },
      { gen: 'noise', kind: 'white', filter: { type: 'bandpass', f: 1900, q: 1.4 }, dur: 0.05, gain: 0.30, delay: 0.13 },
    ],
  },

  // Timber into its brackets: a heave, a drop, a settle.
  'barricade-up': {
    class: 'world', gainDb: -6.0,
    layers: [
      { gen: 'noise', kind: 'pink', filter: { type: 'bandpass', f: 700, q: 0.7 }, fEnd: 300, dur: 0.30, attack: 0.02, gain: 0.55 },
      { gen: 'impact', pitch: 88, drop: 16, dur: 0.34, punch: 0.75, gain: 0.95, delay: 0.22 },
      { gen: 'noise', kind: 'pink', filter: { type: 'lowpass', f: 1100 }, dur: 0.22, attack: 0.001, gain: 0.70, delay: 0.22 },
      { gen: 'impact', pitch: 120, drop: 26, dur: 0.16, punch: 0.4, gain: 0.42, delay: 0.40 },
    ],
    fx: [{ fx: 'reverb', size: 0.6, damp: 0.6, mix: 0.14 }],
  },

  // Pitch catching: a soft thump of air and then fire that stays.
  'brazier-lit': {
    class: 'world', gainDb: -8.0,
    layers: [
      { gen: 'noise', kind: 'pink', filter: { type: 'lowpass', f: 900 }, fEnd: 2600, dur: 0.45, attack: 0.03, gain: 0.75 },
      { gen: 'impact', pitch: 62, drop: 11, dur: 0.30, punch: 0.30, gain: 0.50 },
      { gen: 'crackle', density: 240, dur: 1.3, tone: 2400, gain: 0.42, delay: 0.10 },
    ],
    fx: [{ fx: 'reverb', size: 0.7, damp: 0.55, mix: 0.18 }],
  },

  // Six bolts back into the magazine: a lever, a rattle, a lock.  1.4 s in
  // the contract, so the last click lands at 1.28 and the shot is over.
  'reload': {
    class: 'world', gainDb: -11,
    layers: [
      // the lever is the LOUDEST element on purpose: a reload has to confirm
      // at the keypress, not 0.37 s later when the magazine locks
      { gen: 'noise', kind: 'pink', filter: { type: 'bandpass', f: 2200, q: 1.4 }, dur: 0.055, attack: 0.0005, gain: 1.1 },
      { gen: 'metal', base: 1350, ratios: [1, 2.7], dur: 0.10, bright: 0.9, gain: 0.55, delay: 0.01 },
      { gen: 'crackle', density: 260, dur: 0.34, tone: 3200, gain: 0.34, delay: 0.16 },
      { gen: 'impact', pitch: 190, drop: 30, dur: 0.09, punch: 0.4, gain: 0.42, delay: 0.36 },
      { gen: 'metal', base: 980, ratios: [1, 2.31, 3.9], dur: 0.16, bright: 0.7, gain: 0.26, delay: 0.365 },
    ],
  },

  // ======================= builds (the `charge` class) =====================

  // 0.9 s, and it must GROW.  Nine overlapping sweeps at rising pitch and
  // rising gain, then a ready-ping at 0.84.  See the header.
  'lance-charge': {
    class: 'charge', gainDb: -12,
    layers: [
      { gen: 'sweep', wave: 'tri', from: 165, to: 190, curve: 1, dur: 0.20, delay: 0.00, gain: 0.16, attack: 0.02 },
      { gen: 'sweep', wave: 'tri', from: 190, to: 220, curve: 1, dur: 0.20, delay: 0.10, gain: 0.21, attack: 0.02 },
      { gen: 'sweep', wave: 'tri', from: 220, to: 262, curve: 1, dur: 0.20, delay: 0.20, gain: 0.27, attack: 0.02 },
      { gen: 'sweep', wave: 'saw', from: 262, to: 311, curve: 1, dur: 0.20, delay: 0.30, gain: 0.33, attack: 0.02 },
      { gen: 'sweep', wave: 'saw', from: 311, to: 370, curve: 1, dur: 0.20, delay: 0.40, gain: 0.40, attack: 0.02 },
      { gen: 'sweep', wave: 'saw', from: 370, to: 440, curve: 1, dur: 0.20, delay: 0.50, gain: 0.48, attack: 0.02 },
      { gen: 'sweep', wave: 'tri', from: 440, to: 523, curve: 1, dur: 0.20, delay: 0.60, gain: 0.70, attack: 0.02 },
      { gen: 'sweep', wave: 'tri', from: 523, to: 622, curve: 1, dur: 0.20, delay: 0.70, gain: 0.82, attack: 0.02 },
      { gen: 'sweep', wave: 'tri', from: 622, to: 740, curve: 1, dur: 0.22, delay: 0.79, gain: 0.95, attack: 0.02 },
      // a held low third under the whole build, so the charge has a floor
      { gen: 'sweep', wave: 'tri', from: 110, to: 124, curve: 1, dur: 0.95, gain: 0.45, attack: 0.05 },
      { gen: 'crackle', density: 130, dur: 0.90, tone: 1100, gain: 0.20, delay: 0.05 },
      { gen: 'metal', base: 880, ratios: [1, 2.0, 3.0], dur: 0.22, bright: 0.9, gain: 0.34, delay: 0.84 },
    ],
  },

  // The hexer's 0.7 s staff glow — the one telegraph the player MUST read
  // across a street, so it is the brightest thing in the bank.
  'hexer-telegraph': {
    class: 'charge', gainDb: -12,
    layers: [
      { gen: 'chirp', from: 1100, to: 1450, reps: 3, dur: 0.07, gap: 0.055, gain: 0.34, delay: 0.00 },
      { gen: 'chirp', from: 1500, to: 2000, reps: 3, dur: 0.06, gap: 0.045, gain: 0.48, delay: 0.32 },
      { gen: 'sweep', wave: 'sine', from: 800, to: 2400, curve: 0.55, dur: 0.60, gain: 0.34, delay: 0.06, attack: 0.05 },
      { gen: 'metal', base: 2200, ratios: [1, 1.53, 2.44], dur: 0.30, bright: 1.0, gain: 0.50, delay: 0.52 },
    ],
    fx: [{ fx: 'delay', time: 0.09, feedback: 0.28, mix: 0.20 }],
  },

  // ======================= telegraphs (front-loaded) ======================
  // One per enemy kind, distinct by MATERIAL rather than by pitch: a knife,
  // a chest, a shield rim, and the Captain's dash.

  'tele-cutpurse': {
    class: 'combat', gainDb: -13,
    layers: [
      { gen: 'noise', kind: 'pink', filter: { type: 'bandpass', f: 5000, q: 1.8 }, dur: 0.05, attack: 0.0004, gain: 0.95 },
      { gen: 'metal', base: 2600, ratios: [1, 2.9], dur: 0.16, bright: 1.0, gain: 0.40, delay: 0.005 },
      { gen: 'chirp', from: 1800, to: 2300, reps: 2, dur: 0.03, gap: 0.05, gain: 0.28, delay: 0.02 },
    ],
  },
  'tele-reaver': {
    class: 'combat', gainDb: -11,
    layers: [
      { gen: 'impact', pitch: 130, drop: 20, dur: 0.16, punch: 0.45, gain: 1.0 },
      // this swept UP to 1.2 kHz and the "low guttural" telegraph measured
      // 3.9 kHz — indistinguishable from the cutpurse's knife
      { gen: 'noise', kind: 'pink', filter: { type: 'bandpass', f: 900, q: 0.7 }, fEnd: 260, dur: 0.34, attack: 0.002, gain: 0.85 },
      { gen: 'sweep', wave: 'square', from: 128, to: 190, curve: 0.8, dur: 0.30, gain: 0.55, delay: 0.02 },
    ],
  },
  'tele-shieldbearer': {
    class: 'combat', gainDb: -11,
    layers: [
      { gen: 'metal', base: 520, ratios: [1, 2.11, 3.4, 4.9], dur: 0.42, bright: 0.75, gain: 0.65 },
      { gen: 'impact', pitch: 150, drop: 24, dur: 0.12, punch: 0.6, gain: 0.55 },
      { gen: 'noise', kind: 'white', filter: { type: 'bandpass', f: 3000, q: 1.4 }, dur: 0.06, attack: 0.0006, gain: 0.45 },
    ],
  },
  // The Captain's 0.5 s dash tell: stone under boots and air moving.
  'captain-dash': {
    class: 'combat', gainDb: -8.5,
    layers: [
      { gen: 'impact', pitch: 104, drop: 15, dur: 0.20, punch: 0.75, gain: 0.85 },
      // brighter and more metallic than the reaver's growl on purpose: those
      // two telegraphs measured 5.6 dB apart across the six bands and a player
      // has 0.5 s to tell which one is about to land on them
      { gen: 'noise', kind: 'pink', filter: { type: 'bandpass', f: 900, q: 0.6 }, fEnd: 2600, dur: 0.45, attack: 0.006, gain: 0.85, delay: 0.02 },
      { gen: 'metal', base: 1150, ratios: [1, 2.4, 3.9, 5.6], dur: 0.34, bright: 0.9, gain: 0.55, delay: 0.03 },
      { gen: 'sweep', wave: 'saw', from: 220, to: 96, curve: 1.1, dur: 0.30, gain: 0.26, delay: 0.06 },
    ],
  },

  // ======================= footsteps (three surfaces) =====================
  // Quiet: they fire twice a second for twenty-five minutes.  The difference
  // between them is the body, not the level — stone is a tick with no tail,
  // timber is a hollow box, grass is all air and no fundamental.

  'step-stone': {
    class: 'foley', gainDb: -21,
    layers: [
      { gen: 'noise', kind: 'pink', filter: { type: 'lowpass', f: 1000 }, dur: 0.045, attack: 0.0006, gain: 0.85 },
      { gen: 'impact', pitch: 112, drop: 38, dur: 0.045, punch: 0.28, gain: 0.55 },
      { gen: 'noise', kind: 'white', filter: { type: 'highpass', f: 4200 }, dur: 0.018, attack: 0.0004, gain: 0.24 },
    ],
  },
  'step-timber': {
    class: 'foley', gainDb: -22.5,
    layers: [
      { gen: 'impact', pitch: 84, drop: 19, dur: 0.11, punch: 0.35, gain: 0.85 },
      { gen: 'noise', kind: 'pink', filter: { type: 'bandpass', f: 520, q: 1.3 }, dur: 0.075, attack: 0.0008, gain: 0.75 },
      { gen: 'metal', base: 240, ratios: [1, 2.4], dur: 0.10, bright: 0.3, gain: 0.16, delay: 0.004 },
    ],
  },
  'step-grass': {
    class: 'foley', gainDb: -16.5,
    layers: [
      // a HIGHPASS on pink noise measured 9.3 kHz: above the corner there is
      // nothing left to roll the centroid back down.  A bandpass has two sides.
      { gen: 'noise', kind: 'pink', filter: { type: 'bandpass', f: 1050, q: 0.55 }, fEnd: 1900, dur: 0.085, attack: 0.002, gain: 1.2 },
      { gen: 'noise', kind: 'pink', filter: { type: 'bandpass', f: 1700, q: 0.9 }, dur: 0.05, attack: 0.001, gain: 0.45 },
      { gen: 'impact', pitch: 70, drop: 46, dur: 0.035, punch: 0.10, gain: 0.20 },
    ],
  },

  // ======================= UI and dialogue ================================
  // Dialogue is BLIPS, not voices: three pitches so a line reads as speech
  // without a single person in it.

  'blip-low': {
    class: 'ui', gainDb: -19,
    layers: [
      { gen: 'chirp', from: 520, to: 470, reps: 1, dur: 0.038, gain: 0.75 },
      { gen: 'noise', kind: 'white', filter: { type: 'bandpass', f: 2800, q: 1.6 }, dur: 0.02, gain: 0.30 },
    ],
  },
  'blip-mid': {
    class: 'ui', gainDb: -19,
    layers: [
      { gen: 'chirp', from: 660, to: 700, reps: 1, dur: 0.036, gain: 0.75 },
      { gen: 'noise', kind: 'white', filter: { type: 'bandpass', f: 2600, q: 1.6 }, dur: 0.02, gain: 0.22 },
    ],
  },
  'blip-high': {
    class: 'ui', gainDb: -19,
    layers: [
      { gen: 'chirp', from: 830, to: 920, reps: 1, dur: 0.034, gain: 0.75 },
      { gen: 'noise', kind: 'white', filter: { type: 'bandpass', f: 3200, q: 1.6 }, dur: 0.02, gain: 0.22 },
    ],
  },

  'ui-click': {
    class: 'ui', gainDb: -14,
    layers: [
      { gen: 'chirp', from: 1150, to: 1330, reps: 1, dur: 0.032, gain: 0.80 },
      { gen: 'noise', kind: 'white', filter: { type: 'highpass', f: 4200 }, dur: 0.026, gain: 0.26 },
    ],
  },
  'ui-confirm': {
    class: 'ui', gainDb: -13,
    layers: [
      { gen: 'noise', kind: 'white', filter: { type: 'highpass', f: 5200 }, dur: 0.018, attack: 0.0004, gain: 1.0 },
      { gen: 'chirp', from: 880, to: 1175, reps: 2, dur: 0.042, gap: 0.022, gain: 0.60 },
      { gen: 'metal', base: 1760, ratios: [1, 2.4], dur: 0.24, bright: 0.9, gain: 0.26, delay: 0.05 },
    ],
  },
  'ui-back': {
    class: 'ui', gainDb: -14,
    layers: [
      { gen: 'chirp', from: 980, to: 760, reps: 1, dur: 0.040, gain: 0.75 },
      { gen: 'noise', kind: 'white', filter: { type: 'highpass', f: 3200 }, dur: 0.024, gain: 0.24 },
      { gen: 'metal', base: 660, ratios: [1, 2.1], dur: 0.14, bright: 0.6, gain: 0.18, delay: 0.03 },
    ],
  },
  // ======================= the game layer's other events ==================
  // `src/game/feeltable.js` declares thirteen more events than the contract's
  // ladder does.  They are NOT ranked, so they only owe their class window —
  // but a feel table naming a sound that does not exist is a red `check-feel`,
  // so every one of them is here rather than aliased onto something close.

  // A war horn from the wall: two notes, the second held.  The biggest thing
  // that is not a kill, because it is the moment the player stops resting.
  'wave-start': {
    class: 'voice', gainDb: -5.5,
    layers: [
      // 'saw' in sfx.js is a naive ramp, NOT band-limited like dsp.js's
      // polyBLEP oscillator — at 110 Hz it aliases all the way to Nyquist and
      // dragged this horn's centroid to 4.5 kHz.  A triangle at these pitches
      // is the right call anyway.
      { gen: 'sweep', wave: 'tri', from: 110, to: 147, curve: 0.5, dur: 0.55, gain: 0.85 },
      { gen: 'metal', base: 220, ratios: [1, 1.5, 2, 3], dur: 1.4, bright: 0.4, gain: 0.55, delay: 0.04 },
      { gen: 'sweep', wave: 'tri', from: 147, to: 165, curve: 0.5, dur: 1.10, gain: 0.75, delay: 0.50 },
      // swept to 1.5 kHz this read as 4.5 kHz overall and left the `voice`
      // window: a horn is not a hiss (SOUND.md trap 3 again)
      { gen: 'noise', kind: 'pink', filter: { type: 'bandpass', f: 450, q: 0.7 }, fEnd: 800, dur: 0.6, attack: 0.03, gain: 0.20 },
    ],
    fx: [{ fx: 'reverb', size: 0.9, damp: 0.42, mix: 0.30 }],
  },
  // The other side of it: warm, short, and going down instead of up.
  'breather': {
    class: 'voice', gainDb: -11,
    layers: [
      { gen: 'chirp', from: 523, to: 392, reps: 2, dur: 0.16, gap: 0.08, gain: 0.50 },
      { gen: 'metal', base: 262, ratios: [1, 1.5, 2.02], dur: 1.1, bright: 0.4, gain: 0.40, delay: 0.10 },
      { gen: 'noise', kind: 'pink', filter: { type: 'lowpass', f: 900 }, dur: 0.5, attack: 0.06, gain: 0.24 },
    ],
    fx: [{ fx: 'reverb', size: 0.8, damp: 0.5, mix: 0.24 }],
  },

  // He is here.  Low, slow, and the only sound in the game with no transient.
  'captain-arrives': {
    class: 'swell', gainDb: -5.0,
    layers: [
      { gen: 'sweep', wave: 'tri', from: 55, to: 82, curve: 0.6, dur: 1.6, gain: 0.85, attack: 0.15 },
      { gen: 'metal', base: 131, ratios: [1, 1.97, 3.11, 4.6], dur: 2.0, bright: 0.3, gain: 0.60, delay: 0.30 },
      { gen: 'impact', pitch: 62, drop: 7, dur: 0.9, punch: 0.5, gain: 0.70, delay: 0.55 },
      { gen: 'crackle', density: 45, dur: 1.4, tone: 1400, gain: 0.20, delay: 0.40 },
    ],
    fx: [{ fx: 'reverb', size: 0.93, damp: 0.35, mix: 0.32 }],
  },
  // And going: the same material, receding, ending on nothing.
  'captain-retreat': {
    class: 'voice', gainDb: -8.0,
    layers: [
      { gen: 'metal', base: 147, ratios: [1, 1.97, 3.11], dur: 1.6, bright: 0.35, gain: 0.60 },
      { gen: 'sweep', wave: 'tri', from: 196, to: 87, curve: 1.2, dur: 1.3, gain: 0.50, delay: 0.10 },
      { gen: 'noise', kind: 'pink', filter: { type: 'lowpass', f: 700 }, dur: 0.8, attack: 0.05, gain: 0.34, delay: 0.12 },
    ],
    fx: [{ fx: 'reverb', size: 0.88, damp: 0.45, mix: 0.28 }],
  },

  // The lance bolt landing in a body — the fire arrives with it.
  'lance-hit': {
    class: 'combat', gainDb: -12.0,
    layers: [
      { gen: 'impact', pitch: 104, drop: 13, dur: 0.24, punch: 0.80, gain: 0.90 },
      { gen: 'noise', kind: 'pink', filter: { type: 'lowpass', f: 1100 }, fEnd: 420, dur: 0.16, attack: 0.0008, gain: 0.85 },
      { gen: 'crackle', density: 170, dur: 0.42, tone: 1900, gain: 0.30, delay: 0.02 },
    ],
  },
  // A hexbolt landing on YOU: bright, wrong, and a dull thump under it.
  'hex-hit': {
    class: 'combat', gainDb: -12.5,
    layers: [
      { gen: 'metal', base: 1480, ratios: [1, 1.41, 2.09, 3.31], dur: 0.34, bright: 0.85, gain: 0.70 },
      { gen: 'sweep', wave: 'sine', from: 1600, to: 420, curve: 1.5, dur: 0.26, gain: 0.50 },
      { gen: 'impact', pitch: 118, drop: 18, dur: 0.18, punch: 0.4, gain: 0.55, delay: 0.01 },
      { gen: 'noise', kind: 'white', filter: { type: 'bandpass', f: 3600, q: 1.8 }, fEnd: 900, dur: 0.20, gain: 0.30 },
    ],
  },

  // One of the three lights is about to go out.
  'player-dead': {
    class: 'toll', gainDb: -4.5,
    layers: [
      { gen: 'impact', pitch: 58, drop: 6, dur: 1.0, punch: 0.85, gain: 1.0 },
      { gen: 'sweep', wave: 'tri', from: 262, to: 65, curve: 0.9, dur: 1.5, gain: 0.55, delay: 0.05 },
      { gen: 'metal', base: 117, ratios: [1, 1.83, 2.97], dur: 2.2, bright: 0.25, gain: 0.55, delay: 0.12 },
      { gen: 'noise', kind: 'pink', filter: { type: 'lowpass', f: 420 }, dur: 1.1, attack: 0.01, gain: 0.55, delay: 0.02 },
    ],
    fx: [{ fx: 'reverb', size: 0.92, damp: 0.42, mix: 0.30 }],
  },

  // The 3 s bell channel: rope through a headstock, not the bell itself.
  'bell-pull': {
    class: 'foley', gainDb: -15,
    layers: [
      { gen: 'noise', kind: 'pink', filter: { type: 'bandpass', f: 620, q: 1.1 }, fEnd: 1400, dur: 0.22, attack: 0.02, gain: 0.85 },
      { gen: 'metal', base: 196, ratios: [1, 2.42], dur: 0.30, bright: 0.25, gain: 0.30, delay: 0.06 },
      { gen: 'impact', pitch: 92, drop: 22, dur: 0.10, punch: 0.25, gain: 0.30, delay: 0.14 },
    ],
  },

  'ui-deny': {
    class: 'ui', gainDb: -15,
    layers: [
      { gen: 'chirp', from: 820, to: 690, reps: 1, dur: 0.05, gain: 0.70 },
      { gen: 'chirp', from: 620, to: 500, reps: 1, dur: 0.06, gain: 0.55, delay: 0.055 },
      { gen: 'noise', kind: 'white', filter: { type: 'bandpass', f: 2600, q: 1.3 }, dur: 0.035, gain: 0.40 },
    ],
  },
};

/**
 * The game layer's feel table (`src/game/feeltable.js`) names its sounds
 * semantically — `bolt-fire`, `kill-light`, `kill-heavy`, `bell` — and
 * `src/game/INTERFACES.md` says a mapping lives on the game side.  Putting it
 * HERE instead is the smaller surface: the bank knows what it has, and a name
 * the feel table invents that nothing can serve is then one failing gate line
 * rather than a silent `console.warn` in a running game.
 *
 * `play()` resolves through this before it looks in the bank, so both spellings
 * work and neither agent has to rename anything.
 */
export const ALIASES = {
  'bolt-fire': 'bolt-fired',
  'lance-fire': 'lance-fired',
  'kill-light': 'kill-cutpurse',
  'kill-heavy': 'kill-reaver',
  'hurt': 'player-hurt',
  'multikill': 'lance-multikill',
  'wave-clear': 'wave-cleared',
  'bell': 'bell-rung',
  'door': 'npc-sheltered',
  'barricade': 'barricade-up',
  'brazier': 'brazier-lit',
  'hex-charge': 'hexer-telegraph',
  'ui-open': 'ui-confirm',
  'ui-close': 'ui-back',
  'ui-line': 'blip-mid',
};

/** Resolve a semantic name to a bank key. */
export const resolve = (name) => (BANK[name] ? name : ALIASES[name] ?? name);


/** Every event name in the bank, in a stable order. */
export const EVENTS = Object.keys(BANK);

/** Per-name render seed: stable, name-derived, so one sound cannot be changed
 *  by adding another one before it in the table. */
export const seedFor = (name) => [...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 1806);

/**
 * Render the whole bank headlessly.  Deterministic by construction: each spec
 * is rendered under its own NAME-DERIVED seed, so adding a sound to the table
 * cannot change the bytes of the ones already in it — which is the difference
 * between a determinism gate that means something and one that only proves
 * two runs of the same list agree.
 * @returns {{[name: string]: [Float32Array, Float32Array]}}
 */
export function renderBank({ only = null } = {}) {
  const out = {};
  for (const name of EVENTS) {
    if (only && !only.includes(name)) continue;
    seedAudio(seedFor(name));
    out[name] = renderSfx(BANK[name]);
  }
  return out;
}

/** One sound, by name — same seed the bank uses. */
export function renderOne(name) {
  if (!BANK[name]) throw new Error(`no sfx "${name}"`);
  seedAudio(seedFor(name));
  return renderSfx(BANK[name]);
}
