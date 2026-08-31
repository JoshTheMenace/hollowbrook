import { motif } from '../theory.js';
import { INSTRUMENTS } from './instruments.js';

// Adaptive battle loop for the sakura world: 8 bars, seamless, rendered as
// tier stems. The game moves ONE number (intensity 0..1) and the mix follows:
//   0.0  pads alone (menus, dawn)
//   0.3  + koto + bass (exploring)
//   0.5  + sparse drums + lead (threat nearby)
//   0.7  + straight drums + glass arp (combat)
//   0.9  + drive drums + counter bell (elite / swarm)
// Windows overlap so tiers crossfade instead of popping.

const THEME = motif([
  { deg: 0, dur: 1.0, vel: 0.85 },
  { deg: 2, dur: 0.5, vel: 0.7 },
  { deg: 4, dur: 1.0, vel: 0.9 },
  { deg: 3, dur: 0.5, vel: 0.7 },
  { deg: 2, dur: 1.0, vel: 0.75 },
]);
const COUNTER = motif([
  { deg: 7, dur: 1.5, vel: 0.6 },
  { deg: 5, dur: 0.5, vel: 0.5 },
  { deg: 4, dur: 2.0, vel: 0.65 },
]);

export const LOOP = {
  name: 'nightbloom-loop',
  bpm: 100,
  key: 'A2',
  mode: 'minor',
  seed: 11,
  swing: 0.06,
  bars: 8,
  chords: ['i', 'VI', 'III', 'VII', 'i', 'VI', 'iv', 'V'],
  instruments: INSTRUMENTS,
  tiers: {
    pads: { type: 'pads', instrument: 'warmPad', style: 'held', gain: 0.85, window: [0.0, 1.01] },
    koto: { type: 'arp', instrument: 'koto', rate: 2, shape: 'updown', gain: 0.65, window: [0.12, 0.75] },
    bass: { type: 'bass', instrument: 'subBass', style: 'eighths', gain: 0.85, window: [0.25, 1.01] },
    lead: { type: 'lead', instrument: 'lead', octave: 1, gain: 0.85, motif: THEME, plan: ['statement', 'echo', 'busy', 'cadence', 'statement', 'lift', 'answer', 'cadence'], window: [0.45, 1.01] },
    glass: { type: 'arp', instrument: 'glassArp', rate: 4, shape: 'up', gain: 0.55, window: [0.6, 1.01] },
    counter: { type: 'counter', instrument: 'bell', octave: 1, gain: 0.55, motif: COUNTER, plan: ['statement', 'sparse', 'echo', 'sparse'], window: [0.78, 1.01] },
    drumsSparse: { type: 'drums', style: 'sparse', intensity: 0.4, gain: 0.75, window: [0.35, 0.62] },
    drumsStraight: { type: 'drums', style: 'straight', intensity: 0.7, gain: 0.9, window: [0.58, 0.85] },
    drumsDrive: { type: 'drums', style: 'drive', intensity: 1.0, gain: 1.0, fills: true, window: [0.82, 1.01] },
  },
};
