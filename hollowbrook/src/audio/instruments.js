// Hollowbrook's instrument palette — soundforge synth.js specs as data.
// Role names, not waveform names (SOUND.md).  These are NOT charforge's
// nightbloom patches: that palette is a spring town at night (koto, glass,
// warm pad) and this is a walled market town being stormed at dusk.  Five
// voices, and every one of them is picked for what it does at LOW intensity
// as well as high, because the breather (0.22) plays the drone alone.

export const INSTRUMENTS = {
  // The bed.  Hollow rather than warm: a detuned saw pair with a fifth under
  // it and a slow filter, so at intensity 0.22 there is a *room* and not a
  // chord.  Long release (2.2 s) is what the loop-tail fold exists for.
  hollowDrone: {
    oscs: [
      { type: 'saw', gain: 0.42 },
      { type: 'saw', detune: 11, gain: 0.42 },
      { type: 'tri', oct: -1, gain: 0.30 },
      { type: 'square', oct: -1, semi: 7, gain: 0.10, width: 0.35 },
    ],
    unison: { count: 3, spreadCents: 16 },
    ampEnv: { a: 0.9, d: 1.4, s: 0.72, r: 2.2 },
    filter: { type: 'lowpass', cutoff: 820, q: 0.7, envAmount: 620, env: { a: 1.6, d: 2.0, s: 0.55, r: 1.8 }, keytrack: 0.25 },
    gain: 0.46,
    fx: [
      { fx: 'chorus', rate: 0.28, depth: 0.006, mix: 0.36 },
      { fx: 'reverb', size: 0.92, damp: 0.42, mix: 0.34 },
    ],
  },

  // The floor.  Sine + a tri octave for definition on small speakers, driven
  // just enough that it survives the sidechain duck it is about to get.
  ironBass: {
    oscs: [{ type: 'sine', gain: 0.9 }, { type: 'tri', oct: 1, gain: 0.20 }, { type: 'saw', oct: 1, gain: 0.07 }],
    ampEnv: { a: 0.006, d: 0.20, s: 0.72, r: 0.14 },
    filter: { type: 'lowpass', cutoff: 420, q: 0.8, envAmount: 380, env: { a: 0.004, d: 0.13, s: 0.4, r: 0.1 }, keytrack: 0.55 },
    gain: 0.80,
    fx: [{ fx: 'drive', amount: 1.9, mix: 0.38 }],
  },

  // The siege motif's voice: a reedy horn that cuts without being bright.
  // Square + saw through a resonant lowpass with a fast envelope = a shawm,
  // which is the right instrument for a town that has walls.
  siegeHorn: {
    oscs: [{ type: 'square', gain: 0.40, width: 0.36 }, { type: 'saw', detune: 7, gain: 0.44 }],
    unison: { count: 2, spreadCents: 10 },
    ampEnv: { a: 0.030, d: 0.20, s: 0.78, r: 0.28 },
    filter: { type: 'lowpass', cutoff: 1750, q: 1.5, envAmount: 2200, env: { a: 0.02, d: 0.30, s: 0.42, r: 0.24 }, keytrack: 0.4 },
    vibrato: { rate: 4.6, cents: 14, delay: 0.22 },
    gain: 0.54,
    fx: [
      { fx: 'delay', time: 0.3125, feedback: 0.24, mix: 0.18, pingpong: true, damp: 2600 },
      { fx: 'reverb', size: 0.78, damp: 0.45, mix: 0.20 },
    ],
  },

  // The same motif an octave down and slower: a low brass answer, no vibrato,
  // no delay — it is mass, not melody.
  lowHorn: {
    oscs: [{ type: 'saw', gain: 0.5 }, { type: 'saw', detune: -9, gain: 0.5 }, { type: 'square', oct: -1, gain: 0.16, width: 0.45 }],
    unison: { count: 2, spreadCents: 13 },
    ampEnv: { a: 0.070, d: 0.35, s: 0.80, r: 0.45 },
    filter: { type: 'lowpass', cutoff: 1050, q: 1.1, envAmount: 950, env: { a: 0.06, d: 0.45, s: 0.5, r: 0.4 }, keytrack: 0.35 },
    gain: 0.50,
    fx: [{ fx: 'reverb', size: 0.85, damp: 0.5, mix: 0.24 }],
  },

  // The keep's bell — the fourth tier.  FM with a low modulator ratio and a
  // very long release, which is what makes a bell a bell and not a chime.
  keepBell: {
    oscs: [{ type: 'sine', gain: 0.85 }],
    fm: { ratio: 2.76, index: 4.2, decay: 0.9 },
    ampEnv: { a: 0.004, d: 1.6, s: 0.0, r: 2.2 },
    gain: 0.52,
    fx: [
      { fx: 'delay', time: 0.625, feedback: 0.30, mix: 0.24, pingpong: true, damp: 3000 },
      { fx: 'reverb', size: 0.93, damp: 0.28, mix: 0.34 },
    ],
  },
};
