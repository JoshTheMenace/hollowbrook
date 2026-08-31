// SoundForge instrument palette — synth patches as reviewable data.
// Each entry is a synth.js instrument spec. Naming: role, not waveform.

export const INSTRUMENTS = {
  // Wide, slow-breathing pad — the harmonic bed.
  warmPad: {
    oscs: [{ type: 'saw', gain: 0.5 }, { type: 'saw', detune: 8, gain: 0.5 }, { type: 'square', oct: -1, gain: 0.18, width: 0.4 }],
    unison: { count: 3, spreadCents: 14 },
    ampEnv: { a: 0.5, d: 0.6, s: 0.75, r: 1.1 },
    filter: { type: 'lowpass', cutoff: 1150, q: 0.8, envAmount: 800, env: { a: 0.8, d: 1.2, s: 0.5, r: 1 }, keytrack: 0.3 },
    gain: 0.5,
    fx: [{ fx: 'chorus', rate: 0.4, depth: 0.005, mix: 0.4 }, { fx: 'reverb', size: 0.9, damp: 0.4, mix: 0.35 }],
  },

  // Round sub bass with a touch of grit so it reads on small speakers.
  subBass: {
    oscs: [{ type: 'sine', gain: 0.85 }, { type: 'tri', oct: 1, gain: 0.22 }],
    ampEnv: { a: 0.008, d: 0.18, s: 0.75, r: 0.12 },
    filter: { type: 'lowpass', cutoff: 500, q: 0.8, envAmount: 350, env: { a: 0.004, d: 0.12, s: 0.4, r: 0.1 }, keytrack: 0.6 },
    gain: 0.78,
    fx: [{ fx: 'drive', amount: 1.6, mix: 0.35 }],
  },

  // Karplus-Strong plucked string — the koto voice of the sakura world.
  koto: {
    pluck: { damp: 0.9955 },
    ampEnv: { a: 0.002, d: 0.4, s: 0.0, r: 0.3 },
    gain: 0.75,
    fx: [{ fx: 'reverb', size: 0.6, damp: 0.5, mix: 0.2 }, { fx: 'widen', ms: 8, amount: 0.25 }],
  },

  // FM bell — glassy counter-melody voice, long shimmering tail.
  bell: {
    oscs: [{ type: 'sine', gain: 0.8 }],
    fm: { ratio: 3.01, index: 3.4, decay: 0.5 },
    ampEnv: { a: 0.003, d: 0.9, s: 0.0, r: 0.8 },
    gain: 0.5,
    fx: [{ fx: 'delay', time: 0.375, feedback: 0.35, mix: 0.3, pingpong: true, damp: 3400 }, { fx: 'reverb', size: 0.85, damp: 0.3, mix: 0.3 }],
  },

  // Focused lead — cuts through the mix, sings with vibrato.
  lead: {
    oscs: [{ type: 'square', gain: 0.45, width: 0.42 }, { type: 'saw', detune: 6, gain: 0.4 }],
    unison: { count: 2, spreadCents: 8 },
    ampEnv: { a: 0.015, d: 0.15, s: 0.8, r: 0.2 },
    filter: { type: 'lowpass', cutoff: 2300, q: 1.3, envAmount: 2600, env: { a: 0.01, d: 0.25, s: 0.45, r: 0.2 }, keytrack: 0.4 },
    vibrato: { rate: 5.2, cents: 12, delay: 0.16 },
    gain: 0.6,
    fx: [{ fx: 'delay', time: 0.25, feedback: 0.28, mix: 0.22, pingpong: true, damp: 2800 }, { fx: 'reverb', size: 0.7, damp: 0.4, mix: 0.16 }],
  },

  // Airy pulse arp — motion layer for builds.
  glassArp: {
    oscs: [{ type: 'pulse', gain: 0.55, width: 0.28 }, { type: 'sine', oct: 1, gain: 0.2 }],
    ampEnv: { a: 0.003, d: 0.14, s: 0.1, r: 0.12 },
    filter: { type: 'lowpass', cutoff: 3400, q: 1.0, envAmount: 2000, env: { a: 0.002, d: 0.12, s: 0.2, r: 0.1 }, keytrack: 0.5 },
    gain: 0.5,
    fx: [{ fx: 'delay', time: 0.1875, feedback: 0.3, mix: 0.25, pingpong: true, damp: 4200 }, { fx: 'reverb', size: 0.6, damp: 0.5, mix: 0.14 }],
  },
};
