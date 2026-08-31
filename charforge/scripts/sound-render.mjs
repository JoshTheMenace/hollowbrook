// Render SoundForge content to evidence: WAV + spectrogram + waveform + report.
//   node scripts/sound-render.mjs track        — the nightbloom theme
//   node scripts/sound-render.mjs sfx          — the whole SFX bank
//   node scripts/sound-render.mjs sfx slash    — one sound
import { mkdirSync, writeFileSync } from 'node:fs';
import { composeSong } from '../src/soundforge/compose.js';
import { seedAudio } from '../src/soundforge/dsp.js';
import { renderSfx } from '../src/soundforge/sfx.js';
import { encodeWav } from '../src/soundforge/wav.js';
import { lufs, peakDb, spectralBands, sectionSimilarity, repetitionScore, onsetDensity, stereoWidth, centroidHz } from '../src/soundforge/features.js';
import { spectrogramPng, waveformPng } from './sound-lib.mjs';
import { TRACK } from '../src/soundforge/content/track-nightbloom.js';
import { SFX } from '../src/soundforge/content/sfx-core.js';

const OUT = new URL('../exports/audio/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const what = process.argv[2] || 'track';

if (what === 'track') {
  seedAudio(TRACK.seed ?? 7);
  console.time('render');
  const { master, meta, totalSec } = composeSong(TRACK);
  console.timeEnd('render');
  writeFileSync(`${OUT}${TRACK.name}.wav`, encodeWav(master));
  writeFileSync(`${OUT}${TRACK.name}-spectrogram.png`, spectrogramPng(master, { meta: { ...meta, totalSec } }));
  writeFileSync(`${OUT}${TRACK.name}-waveform.png`, waveformPng(master, { meta }));
  console.time('analyze');
  const report = {
    name: TRACK.name, seconds: +totalSec.toFixed(1), bpm: TRACK.bpm, key: TRACK.key, mode: TRACK.mode,
    lufs: lufs(master), peakDb: peakDb(master),
    bands: spectralBands(master),
    stereo: stereoWidth(master),
    repetition: repetitionScore(master, meta),
    sectionSimilarity: sectionSimilarity(master, meta),
    onsets: onsetDensity(master, meta),
    sections: meta.sections.map((s) => ({ name: s.name, start: +s.start.toFixed(1), bars: s.bars, intensity: s.intensity })),
  };
  console.timeEnd('analyze');
  writeFileSync(`${OUT}${TRACK.name}-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, sectionSimilarity: 'see json' }, null, 1));
  console.log(`\nwrote ${OUT}${TRACK.name}.wav (+ spectrogram, waveform, report)`);
} else if (what === 'sfx') {
  const only = process.argv[3];
  const rows = [];
  for (const [name, spec] of Object.entries(SFX)) {
    if (only && name !== only) continue;
    seedAudio([...name].reduce((a, c) => a * 31 + c.charCodeAt(0) | 0, 7));
    const audio = renderSfx(spec);
    writeFileSync(`${OUT}sfx-${name}.wav`, encodeWav(audio));
    rows.push({ name, class: spec.class, sec: +(audio[0].length / 44100).toFixed(2), peakDb: peakDb(audio), centroidHz: centroidHz(audio) });
  }
  console.table(rows);
  writeFileSync(`${OUT}sfx-report.json`, JSON.stringify(rows, null, 2));
  console.log(`wrote ${rows.length} sfx wavs to ${OUT}`);
}
