// SoundForge music theory — scales, functional harmony, voice leading, and
// motif development. This is the anti-"tasteless loop" layer: melodies are
// motifs plus TRANSFORMATIONS, chords move with voice leading, and nothing
// repeats verbatim for long.

export const NOTE_NAMES = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
export const noteToMidi = (s) => {
  const m = s.match(/^([A-G][#b]?)(-?\d)$/);
  if (!m) throw new Error(`bad note "${s}"`);
  return NOTE_NAMES[m[1]] + (parseInt(m[2]) + 1) * 12;
};

export const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],        // aeolian
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  insen: [0, 1, 5, 7, 10],              // Japanese pentatonic — sakura flavor
  yo: [0, 2, 5, 7, 9],
};

// Scale accessor: deg 0 = root; negative and >len degrees wrap octaves.
export function scale(rootMidi, mode) {
  const iv = MODES[mode];
  if (!iv) throw new Error(`no mode "${mode}"`);
  return (deg) => {
    const oct = Math.floor(deg / iv.length);
    const idx = ((deg % iv.length) + iv.length) % iv.length;
    return rootMidi + oct * 12 + iv[idx];
  };
}

// --- Chords ----------------------------------------------------------------
// Roman numerals against the scale: 'i' 'III' 'VI' 'VII' 'iv7' 'V' 'ii°' 'Isus4'
// Quality comes from the CASE + the mode's own intervals (diatonic stacking).
const RN = { i: 0, ii: 1, iii: 2, iv: 3, v: 4, vi: 5, vii: 6 };
export function chordDegrees(numeral) {
  const m = numeral.match(/^(b?)([ivIV]+)(°?)(7?)(sus[24])?$/);
  if (!m) throw new Error(`bad numeral "${numeral}"`);
  const root = RN[m[2].toLowerCase()];
  if (root === undefined) throw new Error(`bad numeral "${numeral}"`);
  const degs = m[5] === 'sus4' ? [0, 3, 4] : m[5] === 'sus2' ? [0, 1, 4] : [0, 2, 4];
  if (m[4]) degs.push(6);
  return { root, degs };
}
// Diatonic chord tones as midis around a center octave.
export function chordMidis(numeral, sc, baseDeg = 0) {
  const { root, degs } = chordDegrees(numeral);
  return degs.map((d) => sc(baseDeg + root + d));
}

// Voice leading: re-voice `target` pitch classes to move minimally from prev.
export function leadVoices(prevMidis, targetMidis) {
  if (!prevMidis?.length) return targetMidis.slice();
  return targetMidis.map((t, i) => {
    const anchor = prevMidis[Math.min(i, prevMidis.length - 1)];
    let best = t, bd = Infinity;
    for (let oct = -2; oct <= 2; oct++) {
      const cand = t + oct * 12;
      const d = Math.abs(cand - anchor);
      if (d < bd) { bd = d; best = cand; }
    }
    return best;
  }).sort((a, b) => a - b);
}

// --- Motifs ----------------------------------------------------------------
// A motif is rhythm + contour in SCALE DEGREES relative to a local root:
//   [{ deg, dur (beats), vel, rest? }]
export const motif = (steps) => steps.map((s) => ({ vel: 0.8, ...s }));

export const M = {
  transpose: (mo, by) => mo.map((s) => ({ ...s, deg: s.deg + by })),
  invert: (mo, around = 0) => mo.map((s) => ({ ...s, deg: around - (s.deg - around) })),
  retrograde: (mo) => [...mo].reverse(),
  // stretch/squeeze rhythm
  augment: (mo, k = 2) => mo.map((s) => ({ ...s, dur: s.dur * k })),
  // drop weak-beat notes -> sparser variant
  thin: (mo) => mo.map((s, i) => (i % 2 === 1 && s.dur < 1 ? { ...s, rest: true } : s)),
  // insert passing tones between big leaps -> busier variant
  ornament: (mo) => {
    const out = [];
    for (let i = 0; i < mo.length; i++) {
      const s = mo[i], nx = mo[i + 1];
      if (nx && !s.rest && !nx.rest && Math.abs(nx.deg - s.deg) >= 2 && s.dur >= 0.5) {
        out.push({ ...s, dur: s.dur / 2 });
        out.push({ deg: s.deg + Math.sign(nx.deg - s.deg), dur: s.dur / 2, vel: (s.vel ?? 0.8) * 0.75 });
      } else out.push(s);
    }
    return out;
  },
  endOn: (mo, deg) => mo.map((s, i) => (i === mo.length - 1 ? { ...s, deg } : s)),
};

// Development plan: which transform chain each repetition uses. This is the
// heart of "repeats WITH variation" — bar 1 states the idea, later bars vary.
export const DEVELOPMENTS = {
  statement: (mo) => mo,
  echo: (mo) => M.transpose(mo, -2),
  lift: (mo) => M.transpose(mo, 2),
  answer: (mo) => M.endOn(M.invert(mo, 2), 0),
  sparse: (mo) => M.thin(mo),
  busy: (mo) => M.ornament(mo),
  mirror: (mo) => M.retrograde(mo),
  cadence: (mo) => M.endOn(M.thin(mo), 0),
};

// Realize a motif against a chord: chord tones pulled to nearest on strong
// beats, scale used elsewhere. Returns notes with beat-times (caller scales).
export function realizeMotif(mo, sc, chordNumeral, { octave = 0, root = 0 } = {}) {
  const { root: cr, degs } = chordDegrees(chordNumeral);
  const chordSet = degs.map((d) => (cr + d) % 7);
  const notes = [];
  let beat = 0;
  for (const s of mo) {
    if (!s.rest) {
      let deg = s.deg + root;
      const strong = beat % 1 === 0; // on-beat -> prefer chord tone
      if (strong) {
        let best = deg, bd = Infinity;
        for (let o = -1; o <= 1; o++) for (const c of chordSet) {
          const cand = c + o * 7 + Math.round((deg - (c + o * 7)) / 7) * 7;
          const d = Math.abs(cand - deg);
          if (d < bd) { bd = d; best = cand; }
        }
        if (bd <= 1) deg = best;
      }
      notes.push({ beat, durBeats: s.dur, midi: sc(deg + octave * 7), vel: s.vel ?? 0.8 });
    }
    beat += s.dur;
  }
  return notes;
}

// --- Humanize --------------------------------------------------------------
export function humanize(notes, { timing = 0.008, velJitter = 0.08, rng = Math.random } = {}) {
  return notes.map((n) => ({
    ...n,
    t: Math.max(0, n.t + (rng() - 0.5) * 2 * timing),
    vel: Math.min(1, Math.max(0.1, n.vel + (rng() - 0.5) * 2 * velJitter)),
  }));
}

// Seedable rng (mulberry32) so renders are reproducible and diffable.
export const seededRng = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
