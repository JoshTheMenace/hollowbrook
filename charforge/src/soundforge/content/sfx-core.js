// SoundForge core SFX bank — every sound is LAYERED (transient + body + tail)
// and carries a class so the gates can check it behaves like its family:
//   ui (short, bright) · pickup (sparkly rise) · combat (punchy) ·
//   heavy (low, long) · voice (mid stingers)

export const SFX = {
  'ui-click': {
    class: 'ui', gainDb: -8,
    layers: [
      { gen: 'chirp', from: 1150, to: 1350, reps: 1, dur: 0.035, gain: 0.8 },
      { gen: 'noise', kind: 'white', filter: { type: 'highpass', f: 4000 }, dur: 0.03, gain: 0.25 },
    ],
  },
  'ui-confirm': {
    class: 'ui', gainDb: -8,
    layers: [
      { gen: 'noise', kind: 'white', filter: { type: 'highpass', f: 5000 }, dur: 0.02, gain: 1.1 },
      { gen: 'chirp', from: 880, to: 1100, reps: 2, dur: 0.045, gap: 0.025, gain: 0.6 },
      { gen: 'metal', base: 1760, ratios: [1, 2.4], dur: 0.28, bright: 0.9, gain: 0.28, delay: 0.05 },
    ],
  },
  'ui-deny': {
    class: 'ui', gainDb: -9,
    layers: [
      { gen: 'sweep', wave: 'square', from: 330, to: 240, dur: 0.09, gain: 0.6 },
      { gen: 'sweep', wave: 'square', from: 262, to: 190, dur: 0.11, delay: 0.08, gain: 0.4 },
    ],
  },
  'pickup-gem': {
    class: 'pickup', gainDb: -9,
    layers: [
      { gen: 'chirp', from: 1046, to: 1568, reps: 1, dur: 0.06, gain: 0.7 },
      { gen: 'metal', base: 2093, ratios: [1, 1.5, 2.02], dur: 0.3, bright: 1, gain: 0.35, delay: 0.05 },
    ],
    fx: [{ fx: 'reverb', size: 0.5, mix: 0.15 }],
  },
  'level-up': {
    class: 'pickup', gainDb: -6,
    layers: [
      { gen: 'sweep', wave: 'saw', from: 220, to: 880, curve: 1, dur: 0.35, gain: 0.4 },
      { gen: 'chirp', from: 523, to: 1046, reps: 3, dur: 0.08, gap: 0.05, gain: 0.6, delay: 0.1 },
      { gen: 'metal', base: 1568, ratios: [1, 1.5, 2, 3], dur: 0.9, bright: 0.8, gain: 0.4, delay: 0.32 },
      { gen: 'noise', kind: 'pink', filter: { type: 'highpass', f: 3000 }, fEnd: 9000, dur: 0.5, gain: 0.2 },
    ],
    fx: [{ fx: 'reverb', size: 0.8, mix: 0.25 }],
  },
  'slash': {
    class: 'combat', gainDb: -7,
    layers: [
      { gen: 'noise', kind: 'pink', filter: { type: 'bandpass', f: 2400, q: 1.1 }, fEnd: 600, dur: 0.15, attack: 0.001, gain: 1.4 },
      { gen: 'sweep', wave: 'tri', from: 900, to: 300, dur: 0.1, gain: 0.25 },
    ],
  },
  'impact-hit': {
    class: 'combat', gainDb: -7,
    layers: [
      { gen: 'impact', pitch: 180, drop: 16, dur: 0.16, punch: 0.8, gain: 0.85 },
      { gen: 'noise', kind: 'white', filter: { type: 'bandpass', f: 2200, q: 0.9 }, dur: 0.08, gain: 0.5 },
    ],
  },
  'impact-heavy': {
    class: 'heavy', gainDb: -5,
    layers: [
      { gen: 'impact', pitch: 70, drop: 9, dur: 0.5, punch: 0.9, gain: 1 },
      { gen: 'noise', kind: 'pink', filter: { type: 'lowpass', f: 900 }, dur: 0.4, gain: 0.6 },
      { gen: 'crackle', density: 60, dur: 0.5, tone: 2400, gain: 0.35, delay: 0.06 },
    ],
    fx: [{ fx: 'reverb', size: 0.7, damp: 0.6, mix: 0.18 }],
  },
  'magic-bolt': {
    class: 'combat', gainDb: -8,
    layers: [
      { gen: 'sweep', wave: 'sine', from: 300, to: 700, curve: 0.7, dur: 0.22, gain: 0.5 },
      { gen: 'metal', base: 1400, ratios: [1, 2.76, 4.1], dur: 0.3, bright: 0.9, gain: 0.3, delay: 0.04 },
      { gen: 'noise', kind: 'white', filter: { type: 'bandpass', f: 5000, q: 2 }, dur: 0.2, gain: 0.2 },
    ],
    fx: [{ fx: 'delay', time: 0.12, feedback: 0.3, mix: 0.2 }],
  },
  'thunder-strike': {
    class: 'heavy', gainDb: -5,
    layers: [
      { gen: 'noise', kind: 'white', filter: { type: 'highpass', f: 4200 }, dur: 0.04, attack: 0.0005, gain: 0.8 },
      { gen: 'impact', pitch: 82, drop: 7, dur: 0.7, punch: 0.6, gain: 1.0, delay: 0.03 },
      { gen: 'crackle', density: 100, dur: 0.6, tone: 1900, gain: 0.24, delay: 0.1 },
    ],
    fx: [{ fx: 'reverb', size: 0.9, damp: 0.5, mix: 0.25 }],
  },
  'hurt': {
    class: 'combat', gainDb: -7,
    layers: [
      { gen: 'sweep', wave: 'square', from: 260, to: 110, dur: 0.16, gain: 0.6 },
      { gen: 'impact', pitch: 140, drop: 14, dur: 0.14, punch: 0.4, gain: 0.5 },
    ],
  },
  'defeat': {
    class: 'voice', gainDb: -6,
    layers: [
      { gen: 'sweep', wave: 'tri', from: 440, to: 110, curve: 0.8, dur: 1.1, gain: 0.5 },
      { gen: 'metal', base: 220, ratios: [1, 1.19, 2.31], dur: 1.4, bright: 0.3, gain: 0.35, delay: 0.15 },
    ],
    fx: [{ fx: 'reverb', size: 0.9, damp: 0.4, mix: 0.3 }],
  },
  'victory': {
    class: 'voice', gainDb: -6,
    layers: [
      { gen: 'chirp', from: 659, to: 880, reps: 3, dur: 0.1, gap: 0.06, gain: 0.6 },
      { gen: 'metal', base: 1319, ratios: [1, 1.5, 2], dur: 1.2, bright: 0.7, gain: 0.45, delay: 0.4 },
      { gen: 'sweep', wave: 'saw', from: 330, to: 660, dur: 0.5, gain: 0.25, delay: 0.3 },
    ],
    fx: [{ fx: 'reverb', size: 0.85, mix: 0.28 }],
  },
  'footstep': {
    class: 'foley', gainDb: -14,
    layers: [
      { gen: 'noise', kind: 'pink', filter: { type: 'lowpass', f: 700 }, dur: 0.05, attack: 0.001, gain: 0.8 },
      { gen: 'impact', pitch: 95, drop: 30, dur: 0.05, punch: 0.2, gain: 0.4 },
    ],
  },
};

// Gate expectations per class: [minCentroidHz, maxCentroidHz, maxDurSec]
export const SFX_CLASSES = {
  ui: [900, 7000, 0.6],
  pickup: [800, 6500, 2.2],
  combat: [500, 5000, 1.2],
  heavy: [120, 3000, 2.6],
  foley: [200, 3000, 0.5],
  voice: [300, 4000, 3.0],
};
