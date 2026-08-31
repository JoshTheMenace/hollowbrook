import { SR, stereo, mixInto, applyFxChain, duckFx, compressFx, limitFx, filterBuf, buf } from './dsp.js';
import { renderNotes, renderDrums } from './synth.js';
import { scale, noteToMidi, chordMidis, leadVoices, realizeMotif, DEVELOPMENTS, humanize, seededRng } from './theory.js';

// SoundForge composer — a song is a DATA spec:
// {
//   bpm, key: 'A2', mode: 'minor', seed, swing: 0..0.3,
//   instruments: { padName: instrSpec, ... },   // synth.js specs
//   sections: [{
//     name, bars, chords: ['i','VI','III','VII'],  // one per bar, loops
//     intensity: 0..1,
//     parts: {
//       pads:  { instrument, gain, style: 'held'|'pulse' },
//       bass:  { instrument, gain, style: 'roots'|'eighths'|'drive' },
//       arp:   { instrument, gain, rate: 2|4, shape: 'up'|'updown' },
//       lead:  { instrument, gain, motif, plan: ['statement','echo',...], octave },
//       drums: { style: 'sparse'|'straight'|'drive'|'heavy', gain },
//     },
//   }],
// }
// Every part is optional per section — arrangement = parts entering/leaving.
// Returns { master, stems, meta } — stems keyed by part for adaptive layers.

const BEATS_PER_BAR = 4;

function partNotesToEvents(notes, secPerBeat, t0, swing) {
  return notes.map((n) => {
    let t = t0 + n.beat * secPerBeat;
    if (swing) { // delay off-beat 8ths
      const eighth = Math.round(n.beat * 2);
      if (eighth % 2 === 1 && Math.abs(n.beat * 2 - eighth) < 0.01) t += swing * secPerBeat * 0.5;
    }
    return { t, dur: n.durBeats * secPerBeat * 0.92, midi: n.midi, vel: n.vel };
  });
}

// --- part generators (beat-space within one bar) ---------------------------
function genBass(style, chordM, rng) {
  const root = chordM[0] - 12;
  const fifth = root + 7;
  if (style === 'roots') return [{ beat: 0, durBeats: 3.9, midi: root, vel: 0.9 }];
  if (style === 'eighths') {
    const out = [];
    for (let b = 0; b < 8; b++) out.push({ beat: b / 2, durBeats: 0.45, midi: b === 6 ? fifth : root, vel: b % 2 ? 0.6 : 0.85 });
    return out;
  }
  if (style === 'drive') {
    const out = [];
    for (let b = 0; b < 8; b++) {
      const oct = b % 4 === 2 ? 12 : 0;
      out.push({ beat: b / 2, durBeats: 0.4, midi: (rng() < 0.12 ? fifth : root) + oct, vel: b % 2 ? 0.65 : 0.9 });
    }
    return out;
  }
  throw new Error(`no bass style "${style}"`);
}

function genPads(style, voiced) {
  if (style === 'pulse') {
    const out = [];
    for (let b = 0; b < 4; b += 2) for (const m of voiced) out.push({ beat: b, durBeats: 1.7, midi: m, vel: 0.55 });
    return out;
  }
  return voiced.map((m) => ({ beat: 0, durBeats: 3.95, midi: m, vel: 0.6 })); // held
}

function genArp(rate, shape, voiced, rng) {
  const seq = shape === 'updown' ? [...voiced, ...[...voiced].reverse().slice(1, -1)] : voiced;
  const out = [];
  const n = BEATS_PER_BAR * rate;
  for (let i = 0; i < n; i++) {
    const m = seq[i % seq.length] + (shape === 'up' && i % (seq.length * 2) >= seq.length ? 12 : 0);
    out.push({ beat: i / rate, durBeats: 0.8 / rate, midi: m + 12, vel: 0.5 + 0.2 * (i % rate === 0 ? 1 : 0) + rng() * 0.06 });
  }
  return out;
}

// --- drum patterns ---------------------------------------------------------
// 16 steps per bar. k=kick s=snare h=hat o=open-hat r=ride c=clap x=shaker
const DRUM_STYLES = {
  sparse: { k: '1000000000100000', h: '0010001000100010', x: '0000100000001000' },
  straight: { k: '1000100010001000', s: '0000100000001000', h: '1010101010101010' },
  drive: { k: '1000100110001000', s: '0000100000001001', h: '1110101011101010', o: '0000000000000010' },
  heavy: { k: '1001100010011000', s: '0000100000001000', c: '0000100000001000', h: '1111111111111111', r: '1000100010001000' },
};
const FILLS = {
  snareRoll: [{ st: 12, kind: 's', n: 4 }],
  tomRun: [{ st: 12, kind: 't', n: 4 }],
  crashInto: [],
};
const KIND = { k: 'kick', s: 'snare', h: 'hat', o: 'hat', c: 'clap', r: 'ride', x: 'shaker', t: 'tom' };

function genDrumBar(style, intensity, isFill, rng) {
  const pat = DRUM_STYLES[style];
  const hits = [];
  for (const [ch, steps] of Object.entries(pat)) {
    for (let st = 0; st < 16; st++) {
      if (steps[st] !== '1') continue;
      if (ch === 'h' && intensity < 0.35 && st % 4 === 2) continue; // thin hats when calm
      if (isFill && st >= 12 && (ch === 'h' || ch === 'x')) continue;
      hits.push({
        st, kind: KIND[ch],
        params: ch === 'o' ? { open: true } : ch === 't' ? { pitch: 100 } : undefined,
        vel: (st % 4 === 0 ? 1 : 0.72) * (0.75 + intensity * 0.25) * (0.92 + rng() * 0.16) * (ch === 'h' || ch === 'r' || ch === 'x' ? 1.35 : 1),
        pan: ch === 'h' || ch === 'x' ? 0.25 : ch === 'r' ? -0.3 : 0,
      });
    }
  }
  if (isFill) {
    const fill = rng() < 0.5 ? FILLS.snareRoll : FILLS.tomRun;
    for (const f of fill) for (let i = 0; i < f.n; i++) {
      hits.push({ st: f.st + i, kind: KIND[f.kind === 't' ? 't' : 's'], vel: 0.6 + i * 0.12, params: f.kind === 't' ? { pitch: 140 - i * 22 } : undefined });
    }
  }
  return hits;
}

// --- the arranger ----------------------------------------------------------
export function composeSong(song) {
  const rng = seededRng(song.seed ?? 1);
  const secPerBeat = 60 / song.bpm;
  const barSec = secPerBeat * BEATS_PER_BAR;
  const rootMidi = noteToMidi(song.key);
  const sc = scale(rootMidi, song.mode);
  const scHigh = scale(rootMidi + 12, song.mode);

  const totalBars = song.sections.reduce((a, s) => a + s.bars, 0);
  const totalSec = totalBars * barSec + 3; // reverb/release tail
  const partNotes = new Map();   // partKey -> {instrument, gain, events[]}
  const drumHits = [];
  let drumGain = 0.9;
  const meta = { bpm: song.bpm, key: song.key, mode: song.mode, barSec, sections: [] };

  let bar = 0;
  let prevVoicing = null;
  for (const sec of song.sections) {
    const t0 = bar * barSec;
    meta.sections.push({ name: sec.name, start: t0, end: t0 + sec.bars * barSec, intensity: sec.intensity, bars: sec.bars });
    for (let b = 0; b < sec.bars; b++) {
      const tBar = (bar + b) * barSec;
      const numeral = sec.chords[b % sec.chords.length];
      const raw = chordMidis(numeral, sc, 0);
      const voiced = leadVoices(prevVoicing, raw);
      prevVoicing = voiced;
      const isFill = b === sec.bars - 1 && sec.parts.drums; // fill into next section

      for (const [key, p] of Object.entries(sec.parts)) {
        if (key === 'drums') {
          for (const h of genDrumBar(p.style, sec.intensity, isFill, rng)) {
            drumHits.push({ ...h, t: tBar + (h.st / 4) * secPerBeat });
          }
          drumGain = p.gain ?? drumGain;
          continue;
        }
        let notes;
        if (key === 'bass') notes = genBass(p.style, voiced, rng);
        else if (key === 'pads') notes = genPads(p.style || 'held', voiced);
        else if (key === 'arp') notes = genArp(p.rate || 4, p.shape || 'up', voiced, rng);
        else if (key === 'lead' || key === 'counter') {
          const dev = DEVELOPMENTS[p.plan[(b) % p.plan.length]];
          const mo = dev(p.motif);
          notes = realizeMotif(mo, scHigh, numeral, { octave: p.octave ?? 0 });
        } else throw new Error(`no part type "${key}"`);
        const evs = humanize(partNotesToEvents(notes, secPerBeat, tBar, song.swing || 0), { rng, timing: key === 'pads' ? 0.012 : 0.006 });
        const slot = partNotes.get(key) || { instrument: song.instruments[p.instrument], gain: p.gain ?? 0.8, events: [] };
        slot.gain = p.gain ?? slot.gain;
        partNotes.set(key, slot);
        slot.events.push(...evs);
      }
    }
    bar += sec.bars;
  }

  // ---- render stems ----
  const stems = new Map();
  for (const [key, slot] of partNotes) {
    if (!slot.instrument) throw new Error(`part "${key}" names missing instrument`);
    stems.set(key, { audio: renderNotes(slot.instrument, slot.events, totalSec), gain: slot.gain });
  }
  if (drumHits.length) {
    stems.set('drums', { audio: renderDrums(drumHits, totalSec, { gain: 1 }), gain: drumGain });
  }

  // ---- mix ----
  const master = stereo(totalSec);
  // sidechain trigger = kick-ish lows of the drum stem
  let trigger = null;
  if (stems.has('drums')) {
    const [dl] = stems.get('drums').audio;
    trigger = Float32Array.from(dl);
    filterBuf(trigger, 'lowpass', 150, 0.7);
  }
  // stage the parts across the stereo field — a mono stack is a demo, not a mix
  const PART_PAN = { pads: 0, bass: 0, drums: 0, arp: 0.3, lead: -0.08, counter: -0.35 };
  for (const [key, s] of stems) {
    if (trigger && (key === 'pads' || key === 'bass')) duckFx(s.audio, trigger, { amount: key === 'bass' ? 0.45 : 0.3 });
    mixInto(master, s.audio, s.gain, PART_PAN[key] || 0);
  }
  // master chain: gentle glue + tone + safety limiter
  filterBuf(master[0], 'highpass', 28, 0.7); filterBuf(master[1], 'highpass', 28, 0.7);
  filterBuf(master[0], 'highshelf', 5200, 0.7, 3.5); filterBuf(master[1], 'highshelf', 5200, 0.7, 3.5);
  filterBuf(master[0], 'highshelf', 10500, 0.7, 2.5); filterBuf(master[1], 'highshelf', 10500, 0.7, 2.5);
  filterBuf(master[0], 'peak', 300, 0.9, -1.5); filterBuf(master[1], 'peak', 300, 0.9, -1.5);
  compressFx(master, { threshDb: -14, ratio: 2.5, attack: 0.01, release: 0.18, makeupDb: 3 });
  limitFx(master, { ceilingDb: -1 });

  return { master, stems, meta, totalSec };
}

// --- adaptive loop ---------------------------------------------------------
// Runtime music is a seamless N-bar loop rendered as TIER STEMS over the same
// timeline; the game crossfades tiers by intensity (runtime.js). Spec:
// { bpm, key, mode, seed, swing, bars, chords, instruments,
//   tiers: { name: { window: [on, off], // intensity range where stem is audible
//                    type: 'pads'|'bass'|'arp'|'lead'|'counter'|'drums', ...partOpts } } }
export function composeAdaptiveLoop(spec) {
  const rng = seededRng(spec.seed ?? 1);
  const secPerBeat = 60 / spec.bpm;
  const barSec = secPerBeat * BEATS_PER_BAR;
  const loopSec = spec.bars * barSec;
  const rootMidi = noteToMidi(spec.key);
  const sc = scale(rootMidi, spec.mode);
  const scHigh = scale(rootMidi + 12, spec.mode);
  // voice-led chord per bar, shared by every tier so stems stay in harmony
  const voicings = [];
  let prev = null;
  for (let b = 0; b < spec.bars; b++) {
    prev = leadVoices(prev, chordMidis(spec.chords[b % spec.chords.length], sc, 0));
    voicings.push(prev);
  }
  // loop baking: render 2.5s PAST the loop, then fold the overflow back onto
  // the start — reverb/release tails wrap around and the seam is seamless.
  const tailSec = 2.5;
  const fold = ([L, R]) => {
    const n = Math.round(loopSec * SR);
    const out = [new Float32Array(n), new Float32Array(n)];
    for (let c = 0; c < 2; c++) {
      const src = c ? R : L;
      out[c].set(src.subarray(0, n));
      for (let i = n; i < src.length; i++) out[c][i - n] += src[i];
    }
    return out;
  };
  const stems = {};
  for (const [name, tier] of Object.entries(spec.tiers)) {
    if (tier.type === 'drums') {
      const hits = [];
      for (let b = 0; b < spec.bars; b++) {
        for (const h of genDrumBar(tier.style, tier.intensity ?? 0.7, b === spec.bars - 1 && tier.fills, rng)) {
          hits.push({ ...h, t: b * barSec + (h.st / 4) * secPerBeat });
        }
      }
      stems[name] = { audio: fold(renderDrums(hits, loopSec + tailSec, { gain: tier.gain ?? 0.9 })), window: tier.window };
      continue;
    }
    const events = [];
    for (let b = 0; b < spec.bars; b++) {
      const numeral = spec.chords[b % spec.chords.length];
      let notes;
      if (tier.type === 'bass') notes = genBass(tier.style, voicings[b], rng);
      else if (tier.type === 'pads') notes = genPads(tier.style || 'held', voicings[b]);
      else if (tier.type === 'arp') notes = genArp(tier.rate || 4, tier.shape || 'up', voicings[b], rng);
      else if (tier.type === 'lead' || tier.type === 'counter') {
        const dev = DEVELOPMENTS[tier.plan[b % tier.plan.length]];
        notes = realizeMotif(dev(tier.motif), scHigh, numeral, { octave: tier.octave ?? 0 });
      } else throw new Error(`no tier type "${tier.type}"`);
      events.push(...humanize(partNotesToEvents(notes, secPerBeat, b * barSec, spec.swing || 0), { rng }));
    }
    stems[name] = { audio: fold(renderNotes(spec.instruments[tier.instrument], events, loopSec + tailSec)), window: tier.window };
  }
  return { stems, loopSec, meta: { bpm: spec.bpm, bars: spec.bars, barSec } };
}
