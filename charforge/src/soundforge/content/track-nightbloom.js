import { motif } from '../theory.js';
import { INSTRUMENTS } from './instruments.js';

// "Nightbloom Theme" — adaptive game track, A minor, 6 sections spanning
// calm exploration -> combat -> climax -> resolve. The lead melody is ONE
// motif developed differently per bar (statement/echo/answer/...) so the
// tune is coherent but never a verbatim loop.

// The seed idea: a rising-then-falling 4-beat phrase.
const THEME = motif([
  { deg: 0, dur: 1.0, vel: 0.85 },
  { deg: 2, dur: 0.5, vel: 0.7 },
  { deg: 4, dur: 1.0, vel: 0.9 },
  { deg: 3, dur: 0.5, vel: 0.7 },
  { deg: 2, dur: 1.0, vel: 0.75 },
]);
// Counter-melody: sparser, offset contour, lives in the bell.
const COUNTER = motif([
  { deg: 7, dur: 1.5, vel: 0.6 },
  { deg: 5, dur: 0.5, vel: 0.5 },
  { deg: 4, dur: 2.0, vel: 0.65 },
]);

export const TRACK = {
  name: 'nightbloom-theme',
  bpm: 100,
  key: 'A2',
  mode: 'minor',
  seed: 7,
  swing: 0.06,
  instruments: INSTRUMENTS,
  sections: [
    { // night falls: pads breathe, koto sketches the harmony
      name: 'intro', bars: 8, intensity: 0.15,
      chords: ['i', 'VI', 'III', 'VII'],
      parts: {
        pads: { instrument: 'warmPad', gain: 0.9 },
        arp: { instrument: 'koto', gain: 0.7, rate: 2, shape: 'up' },
      },
    },
    { // exploring: theme stated, ground under the feet
      name: 'explore', bars: 8, intensity: 0.35,
      chords: ['i', 'VI', 'III', 'VII'],
      parts: {
        pads: { instrument: 'warmPad', gain: 0.8 },
        bass: { instrument: 'subBass', gain: 0.85, style: 'roots' },
        arp: { instrument: 'koto', gain: 0.65, rate: 2, shape: 'updown' },
        lead: { instrument: 'lead', gain: 0.8, octave: 1, motif: THEME, plan: ['statement', 'echo', 'answer', 'cadence'] },
        drums: { style: 'sparse', gain: 0.7 },
      },
    },
    { // threat builds: pulse tightens, glass arp enters
      name: 'build', bars: 8, intensity: 0.55,
      chords: ['i', 'VI', 'iv', 'V'],
      parts: {
        pads: { instrument: 'warmPad', gain: 0.7, style: 'pulse' },
        bass: { instrument: 'subBass', gain: 0.9, style: 'eighths' },
        arp: { instrument: 'glassArp', gain: 0.6, rate: 4, shape: 'up' },
        lead: { instrument: 'lead', gain: 0.85, octave: 1, motif: THEME, plan: ['statement', 'busy', 'lift', 'cadence'] },
        drums: { style: 'straight', gain: 0.85 },
      },
    },
    { // combat: full drive, counter-melody answers the theme
      name: 'combat', bars: 16, intensity: 0.8,
      chords: ['i', 'VII', 'VI', 'V'],
      parts: {
        pads: { instrument: 'warmPad', gain: 0.55, style: 'pulse' },
        bass: { instrument: 'subBass', gain: 1.0, style: 'drive' },
        arp: { instrument: 'glassArp', gain: 0.6, rate: 4, shape: 'updown' },
        lead: { instrument: 'lead', gain: 0.9, octave: 1, motif: THEME, plan: ['statement', 'lift', 'busy', 'answer', 'echo', 'busy', 'mirror', 'cadence'] },
        counter: { instrument: 'bell', gain: 0.55, octave: 1, motif: COUNTER, plan: ['statement', 'sparse', 'echo', 'sparse'] },
        drums: { style: 'drive', gain: 1.0 },
      },
    },
    { // climax: heaviest pattern, theme augmented over the top
      name: 'climax', bars: 8, intensity: 1.0,
      chords: ['i', 'VI', 'iv', 'VII'],
      parts: {
        pads: { instrument: 'warmPad', gain: 0.6, style: 'pulse' },
        bass: { instrument: 'subBass', gain: 1.0, style: 'drive' },
        arp: { instrument: 'glassArp', gain: 0.65, rate: 4, shape: 'updown' },
        lead: { instrument: 'lead', gain: 0.95, octave: 1, motif: THEME, plan: ['statement', 'busy', 'lift', 'cadence'] },
        counter: { instrument: 'bell', gain: 0.6, motif: COUNTER, plan: ['statement', 'echo'] },
        drums: { style: 'heavy', gain: 1.0 },
      },
    },
    { // dawn: everything falls away, koto and bell resolve home
      name: 'outro', bars: 8, intensity: 0.15,
      chords: ['VI', 'VII', 'i', 'i'],
      parts: {
        pads: { instrument: 'warmPad', gain: 0.9 },
        arp: { instrument: 'koto', gain: 0.7, rate: 2, shape: 'up' },
        counter: { instrument: 'bell', gain: 0.5, motif: COUNTER, plan: ['sparse', 'cadence'] },
      },
    },
  ],
};
