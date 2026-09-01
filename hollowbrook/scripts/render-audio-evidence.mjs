#!/usr/bin/env node
/**
 * Evidence for the siege score and the SFX bank, and the generator for the
 * committed measurement table `src/audio/magnitude.js`.
 *
 *   node scripts/render-audio-evidence.mjs            # everything
 *   node scripts/render-audio-evidence.mjs --table    # only regenerate the table
 *
 * Writes into `.audio-evidence/` (gitignored except the gate's own output):
 *   score/<tier>.wav          the nine mastered tier stems
 *   mix/i<point>.wav          one loop at each of the contract's intent points
 *   ride-60s.wav              0.22 -> 1.00 -> 0.30 with dawn() at 48 s
 *   sfx/<event>.wav           all 36 one-shots
 *   ladder.wav                the thirteen ladder events in rank order, 0.9 s apart
 *   loudness.svg              short-term LUFS over the ride, with the intent points
 *   spectrogram.svg           the ride, dB normalised to its own peak bin
 *
 * I cannot listen to any of this.  Everything asserted about it anywhere in
 * this project is a MEASUREMENT — integrated and short-term loudness, true
 * peak, spectral centroid and band split, onset density, K-weighted energy
 * integral, seam discontinuity — plus what the plots show.  That is stated
 * here rather than implied.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { SR, seedAudio, biquad } from '../../charforge/src/soundforge/dsp.js';
import { encodeWav } from '../../charforge/src/soundforge/wav.js';
import { stft } from '../../charforge/src/soundforge/fft.js';
import { lufs, peakDb, centroidHz, spectralBands, stereoWidth } from '../../charforge/src/soundforge/features.js';
import { renderScore, mixAt, renderRide, TIERS } from '../src/audio/score.js';
import { BANK, LADDER, EVENTS, SFX_CLASSES, renderBank, seedFor } from '../src/audio/sfx-bank.js';
import { magnitude, impactDb, lowShare, attackMs } from '../src/audio/metrics.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, '.audio-evidence');
const tableOnly = process.argv.includes('--table');
const mk = (d) => { fs.mkdirSync(d, { recursive: true }); return d; };
const wav = (file, audio) => fs.writeFileSync(file, Buffer.from(encodeWav(audio)));
const sha = ([L, R]) => {
  const h = crypto.createHash('sha256');
  h.update(Buffer.from(L.buffer, L.byteOffset, L.byteLength));
  h.update(Buffer.from(R.buffer, R.byteOffset, R.byteLength));
  return h.digest('hex').slice(0, 16);
};

/* ---- intent points, read from the contract rather than retyped ---------- */
export function contractMusic() {
  const md = fs.readFileSync(path.join(ROOT, 'LOOP-CONTRACT.md'), 'utf8');
  const m = md.match(/```json\s*([\s\S]*?)```/);
  if (!m) throw new Error('LOOP-CONTRACT.md has no JSON block');
  return JSON.parse(m[1]).music;
}

/* ---- short-term loudness (BS.1770 momentary, 400 ms / 100 ms) ----------- */
export function shortTermLufs([L, R], block = 0.4, hop = 0.1) {
  const k = () => { const s = biquad('highshelf', 1681.97, 0.7071, 3.99), h = biquad('highpass', 38.13, 0.5); return (x) => h(s(x)); };
  const kl = k(), kr = k();
  const sq = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) { const a = kl(L[i]), b = kr(R[i]); sq[i] = a * a + b * b; }
  const B = Math.round(block * SR), H = Math.round(hop * SR);
  const out = [];
  for (let s = 0; s + B <= L.length; s += H) {
    let sum = 0;
    for (let i = s; i < s + B; i++) sum += sq[i];
    out.push({ t: (s + B / 2) / SR, l: -0.691 + 10 * Math.log10(sum / B + 1e-12) });
  }
  return out;
}

function loudnessSvg(track, intents, seconds) {
  const W = 1000, H = 320, PAD = 46;
  const lo = -34, hi = -6;
  const x = (t) => PAD + (t / seconds) * (W - PAD - 14);
  const y = (l) => H - PAD - ((Math.max(lo, Math.min(hi, l)) - lo) / (hi - lo)) * (H - PAD - 18);
  const pts = track.map((p) => `${x(p.t).toFixed(1)},${y(p.l).toFixed(1)}`).join(' ');
  const grid = [];
  for (let l = lo; l <= hi; l += 4) grid.push(`<line x1="${PAD}" y1="${y(l)}" x2="${W - 14}" y2="${y(l)}" stroke="#2a2f3a"/><text x="6" y="${y(l) + 4}" fill="#8a94a6" font-size="11">${l} LUFS</text>`);
  const marks = intents.map(({ t, v, name }) =>
    `<line x1="${x(t)}" y1="18" x2="${x(t)}" y2="${H - PAD}" stroke="#4b5568" stroke-dasharray="3 3"/>` +
    `<text x="${x(t) + 3}" y="30" fill="#c3cbd9" font-size="11">${name} ${v}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#11141a"/>
<text x="${PAD}" y="15" fill="#e6ebf2" font-size="13">Hollowbrook siege score — short-term loudness over the 60 s intensity ride</text>
${grid.join('')}${marks}
<polyline points="${pts}" fill="none" stroke="#e8a33d" stroke-width="1.6"/>
<text x="${PAD}" y="${H - 12}" fill="#8a94a6" font-size="11">0 s</text>
<text x="${W - 60}" y="${H - 12}" fill="#8a94a6" font-size="11">${seconds} s</text>
</svg>`;
}

function spectrogramSvg([L, R], seconds) {
  const mono = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) mono[i] = (L[i] + R[i]) * 0.5;
  const N = 2048, HOP = Math.max(1024, Math.floor(mono.length / 240));
  const frames = stft(mono, N, HOP);
  const BANDS = 72, binHz = SR / N, fMax = 12000;
  // log-spaced band edges: a linear FFT axis wastes 90 % of the picture
  const edge = (k) => 40 * Math.pow(fMax / 40, k / BANDS);
  const cell = [];
  let peak = 1e-12;
  for (const f of frames) {
    const col = new Float64Array(BANDS);
    for (let b = 0; b < BANDS; b++) {
      let e = 0, n = 0;
      for (let i = Math.floor(edge(b) / binHz); i < Math.min(f.length, Math.ceil(edge(b + 1) / binHz)); i++) { e += f[i] * f[i]; n++; }
      col[b] = n ? e / n : 0;
      if (col[b] > peak) peak = col[b];
    }
    cell.push(col);
  }
  const W = 1000, H = 360, PAD = 40;
  const cw = (W - PAD - 10) / cell.length, ch = (H - PAD - 16) / BANDS;
  let rects = '';
  for (let t = 0; t < cell.length; t++) {
    for (let b = 0; b < BANDS; b++) {
      // dB relative to the track's OWN peak bin (SOUND.md trap 4)
      const d = 10 * Math.log10(cell[t][b] / peak + 1e-12);
      if (d < -66) continue;
      const u = Math.min(1, Math.max(0, (d + 66) / 66));
      const r = Math.round(20 + 235 * Math.pow(u, 0.9));
      const g = Math.round(14 + 150 * Math.pow(u, 1.9));
      const bl = Math.round(40 + 60 * Math.pow(1 - u, 1.2));
      rects += `<rect x="${(PAD + t * cw).toFixed(1)}" y="${(H - PAD - (b + 1) * ch).toFixed(1)}" width="${(cw + 0.6).toFixed(1)}" height="${(ch + 0.6).toFixed(1)}" fill="rgb(${r},${g},${bl})"/>`;
    }
  }
  let axis = '';
  for (const f of [60, 250, 1000, 4000, 12000]) {
    const b = BANDS * Math.log(f / 40) / Math.log(fMax / 40);
    axis += `<text x="2" y="${(H - PAD - b * ch + 4).toFixed(1)}" fill="#8a94a6" font-size="10">${f >= 1000 ? f / 1000 + 'k' : f}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#0d1015"/>
<text x="${PAD}" y="14" fill="#e6ebf2" font-size="13">the same ride — log-frequency spectrogram, dB relative to its own peak bin</text>
${rects}${axis}
<text x="${PAD}" y="${H - 10}" fill="#8a94a6" font-size="11">0 s</text><text x="${W - 60}" y="${H - 10}" fill="#8a94a6" font-size="11">${seconds} s</text>
</svg>`;
}

/* ======================================================================== */

const t0 = Date.now();
const score = renderScore();
const bank = renderBank();

/* ---- the measurement table (always) ------------------------------------ */
const rows = {};
for (const name of EVENTS) {
  const a = bank[name];
  rows[name] = {
    rank: LADDER.indexOf(name) >= 0 ? LADDER.indexOf(name) + 1 : null,
    cls: BANK[name].class,
    magnitude: magnitude(a),
    impactDb: impactDb(a),
    lowShare: lowShare(a),
    peakDb: peakDb(a),
    durSec: +(a[0].length / SR).toFixed(4),
    centroidHz: centroidHz(a),
    attackMs: attackMs(a),
    seed: seedFor(name),
    sha: sha(a),
  };
}
const tableSrc = `// GENERATED by scripts/render-audio-evidence.mjs — do not hand-edit.
//
// The measured level of every sound in the bank.  THIS IS THE TABLE THE GAME
// READS: \`play()\` never takes a per-call-site gain to make an event feel
// bigger, because "bigger" is \`magnitude\` here and \`scripts/check-music.mjs\`
// fails the moment it stops being monotone in the contract's ladder rank.
//
//   magnitude   impactDb + 4·lowShare — see src/audio/metrics.js for why
//   impactDb    K-weighted energy INTEGRAL (loudness x duration).  Integrated
//               LUFS is -Infinity for anything under 400 ms and most of this
//               bank is under 400 ms, which is the whole reason this column
//               exists instead of a LUFS one.
//   lowShare    fraction of energy under 250 Hz — weight, independent of level
//   sha         first 16 hex of SHA-256 over the rendered samples.  Two runs
//               in different processes produce the same string or the bank is
//               not deterministic; the gate asserts exactly that.
//
// Regenerate:  node scripts/render-audio-evidence.mjs --table
export const MAGNITUDE = ${JSON.stringify(rows, null, 2).replace(/"([\w-]+)":/g, (m, k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? `${k}:` : `'${k}':`))};

export const MAGNITUDE_META = {
  events: ${EVENTS.length},
  ladder: ${LADDER.length},
  bankBytes: ${Object.values(bank).reduce((a, x) => a + (x[0].length + x[1].length) * 4, 0)},
  sampleRate: ${SR},
};
`;
fs.writeFileSync(path.join(ROOT, 'src/audio/magnitude.js'), tableSrc);
console.log(`wrote src/audio/magnitude.js — ${EVENTS.length} events`);
if (tableOnly) process.exit(0);

/* ---- WAVs -------------------------------------------------------------- */
mk(OUT); mk(path.join(OUT, 'score')); mk(path.join(OUT, 'mix')); mk(path.join(OUT, 'sfx'));
for (const name of score.order) wav(path.join(OUT, 'score', `${name}.wav`), score.stems[name].audio);
const M = contractMusic();
const POINTS = [['breather', M.intent.breather], ['w1', M.intent.w1], ['w2', M.intent.w2], ['w3', M.intent.w3],
  ['w4', M.intent.w4], ['w4captain', M.intent.w4captain], ['w5', M.intent.w5], ['w6', M.intent.w6], ['dawn', M.intent.dawn]];
for (const [name, v] of POINTS) wav(path.join(OUT, 'mix', `i-${name}-${v.toFixed(2)}.wav`), mixAt(score, v));
wav(path.join(OUT, 'mix', 'i-dawn-0.30-with-bell.wav'), mixAt(score, M.intent.dawn, { dawn: 1 }));
for (const name of EVENTS) wav(path.join(OUT, 'sfx', `${name}.wav`), bank[name]);

// the ladder in rank order, so its steps can be heard against each other
{
  const GAP = 0.9;
  const n = Math.round((LADDER.length * GAP + 7) * SR);
  const out = [new Float32Array(n), new Float32Array(n)];
  LADDER.forEach((name, i) => {
    const a = bank[name], s = Math.round(i * GAP * SR);
    for (let c = 0; c < 2; c++) for (let j = 0; j < a[c].length && s + j < n; j++) out[c][s + j] += a[c][j];
  });
  wav(path.join(OUT, 'ladder.wav'), out);
}

/* ---- the 60 s ride ----------------------------------------------------- */
const RIDE_SEC = 60;
const RIDE = [[0, 0.22], [6, 0.22], [14, 0.50], [22, 0.68], [30, 0.80], [38, 0.90], [46, 1.00], [50, 1.00], [56, 0.30], [60, 0.30]];
const ride = renderRide(score, RIDE, RIDE_SEC, { dawnFrom: 50 });
wav(path.join(OUT, 'ride-60s.wav'), ride);

const st = shortTermLufs(ride);
fs.writeFileSync(path.join(OUT, 'loudness.svg'), loudnessSvg(st, RIDE.filter((_, i) => i % 2 === 0).map(([t, v]) => ({ t, v, name: '' })), RIDE_SEC));
fs.writeFileSync(path.join(OUT, 'spectrogram.svg'), spectrogramSvg(ride, RIDE_SEC));

/* ---- a small report ---------------------------------------------------- */
const lines = [];
lines.push(`score: ${score.order.length} stems, loop ${score.loopSec.toFixed(2)} s at ${score.meta.bpm} bpm, ${score.meta.bars} bars`);
for (const t of TIERS) {
  const s = score.stems[t.name];
  lines.push(`  ${t.name.padEnd(12)} ${t.type.padEnd(10)} window ${JSON.stringify(t.window).padEnd(13)} LUFS ${String(lufs(s.audio)).padStart(7)}  peak ${String(peakDb(s.audio)).padStart(6)}`);
}
for (const [name, v] of POINTS) {
  const m = mixAt(score, v);
  lines.push(`  mix @ ${name.padEnd(10)} ${v.toFixed(2)}  LUFS ${String(lufs(m)).padStart(7)}  peak ${String(peakDb(m)).padStart(6)}`);
}
const full = mixAt(score, 1);
lines.push(`  full mix bands ${JSON.stringify(spectralBands(full))}  width ${JSON.stringify(stereoWidth(full))}`);
lines.push(`ride: ${RIDE_SEC}s, short-term LUFS ${Math.min(...st.map((p) => p.l)).toFixed(1)} .. ${Math.max(...st.map((p) => p.l)).toFixed(1)}`);
fs.writeFileSync(path.join(OUT, 'render-report.txt'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
console.log(`\nevidence in .audio-evidence/  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
