#!/usr/bin/env node
/**
 * Music gate — exit 0 pass, 1 defects, 2 crashed.  Every number is printed.
 *
 * What it holds, and why each one is here rather than being taken on trust:
 *
 *  A. DETERMINISM.  soundforge's RNG is one module-level variable; a render
 *     that forgets to seed it is *silently* different every run, and every
 *     other number below stops meaning anything.  Two independent renders in
 *     this process must be byte-identical, and both must match the SHA-256
 *     committed in `src/audio/magnitude.js`, which was written by a DIFFERENT
 *     process — so this is cross-process, not just "the same list twice".
 *  B. THE SCORE.  Nine stems, exact loop length, none silent, no seam click
 *     harder than the stem's own worst transient, peaks under the ceiling,
 *     something audible at every intensity, and LUFS inside a declared band.
 *  C. MONOTONICITY IN INTENSITY.  The contract's intent points are parsed out
 *     of LOOP-CONTRACT.md (not retyped here) and the mix is measured at each:
 *     loudness must be non-decreasing in intensity, every wave-to-wave step
 *     must be positive, and onset density must climb too — "0.80 must be
 *     louder AND denser than 0.68" is two measurements, not one.
 *  D. THE LADDER.  Every one of the contract's 13 ranked events and its 10
 *     other declared events exists in the bank; measured magnitude is strictly
 *     increasing in rank; the two negative-event rules hold (a whiff never
 *     outranks a hit, being hit never outranks a bigger kill).
 *  E. CLASS DISCIPLINE.  Centroid / duration / peak / attack per class, plus
 *     "the three surfaces and the five telegraphs are actually different
 *     sounds" — a family that is one sound at three gains passes every other
 *     check in this file.
 *  F. SIZE.  The bank is decoded into AudioBuffers at load; a bank that
 *     doubles is a memory regression nobody would otherwise notice.
 *  G. THE MOTIF IS ONE MOTIF.  The three melodic tiers are chroma-compared:
 *     "the theme escalates rather than three unrelated loops" is a claim, and
 *     this is the number behind it.
 *  H. THE GAME'S MAPPING, if `src/game/music.js` exists.  That file belongs to
 *     the game agent; until it lands this section reports SKIP rather than
 *     failing, and says so loudly.
 *
 * HONEST LIMIT: nobody has listened to any of this.  Every claim above is a
 * measurement of the rendered buffers, plus the two plots written by
 * `scripts/render-audio-evidence.mjs`.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { SR } from '../../charforge/src/soundforge/dsp.js';
import { windowGain } from '../../charforge/src/soundforge/runtime.js';
import { lufs, peakDb, centroidHz, spectralBands, stereoWidth, chromaFrames } from '../../charforge/src/soundforge/features.js';
import { renderScore, mixAt } from '../src/audio/score.js';
import { BANK, LADDER, DECLARED, EVENTS, SURFACES, SFX_CLASSES, ALIASES, resolve, renderBank, seedFor } from '../src/audio/sfx-bank.js';
import { magnitude, attackMs, seamStep, meanFlux, onsetsPerSec, bandProfile, profileDistance } from '../src/audio/metrics.js';
import { MAGNITUDE, MAGNITUDE_META } from '../src/audio/magnitude.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const r2 = (v) => Math.round(v * 100) / 100;

/* ---- declared targets.  Stated here so a failure is a decision, not a
 *      mystery — and so that widening one is a visible diff. ------------- */
const TARGET = {
  mixFullLufs: [-16.5, -11.5],     // charforge's own track window, unchanged
  mixBreatherLufs: [-25.0, -19.0], // a bed under footsteps and dialogue
  stemLufs: [-30.0, -10.0],
  stemPeakDb: -1.0,
  mixPeakDb: -0.9,
  sfxPeakDb: [-26.0, -0.5],
  waveSpanDb: 2.0,                 // w1 -> w6 must open up by at least this much
  ladderStepDb: 0.8,               // minimum separation between adjacent ranks
  familyDistanceDb: 5.0,           // how far apart two sounds in one family must be
  scoreBytesMax: 72e6,
  bankBytesMax: 24e6,
  motifKinship: 0.80,
  // This score's own spectral windows.  They differ from charforge's in two
  // bands and both differences are the KIT: there are no cymbals and no glass
  // arp here, so `air` is darker than a pop mix by construction, and three
  // tiers of skin drum over a sub bass put `low` at the top of its range on
  // purpose.  Everything else is charforge's number unchanged.
  bands: { sub: [-16, -3], low: [-8, -1], lowmid: [-11, -4], mid: [-16, -8], high: [-20, -9], air: [-40, -20] },
};

const checks = [];
const check = (id, pass, note) => checks.push({ id, pass, note });
const skips = [];

const sha = ([L, R]) => {
  const h = crypto.createHash('sha256');
  h.update(Buffer.from(L.buffer, L.byteOffset, L.byteLength));
  h.update(Buffer.from(R.buffer, R.byteOffset, R.byteLength));
  return h.digest('hex').slice(0, 16);
};

/** Time by which `frac` of a sound's energy has arrived. */
function energyTime([L, R], frac) {
  let tot = 0;
  for (let i = 0; i < L.length; i++) tot += L[i] * L[i] + R[i] * R[i];
  let acc = 0;
  for (let i = 0; i < L.length; i++) {
    acc += L[i] * L[i] + R[i] * R[i];
    if (acc >= tot * frac) return i / SR;
  }
  return L.length / SR;
}

try {
  /* ==================== A. determinism ================================= */
  const scoreA = renderScore();
  const scoreB = renderScore();
  const bankA = renderBank();
  const bankB = renderBank();

  const scoreDiff = scoreA.order.filter((n) => sha(scoreA.stems[n].audio) !== sha(scoreB.stems[n].audio));
  check('determinism:score', scoreDiff.length === 0,
    scoreDiff.length ? `differs between runs: ${scoreDiff.join(', ')}`
      : `${scoreA.order.length}/${scoreA.order.length} stems byte-identical across two renders — ${scoreA.order.map((n) => `${n}:${sha(scoreA.stems[n].audio)}`).join(' ')}`);

  const bankDiff = EVENTS.filter((n) => sha(bankA[n]) !== sha(bankB[n]));
  check('determinism:bank', bankDiff.length === 0,
    bankDiff.length ? `differs between runs: ${bankDiff.join(', ')}` : `${EVENTS.length}/${EVENTS.length} sfx byte-identical across two renders`);

  const tableDiff = EVENTS.filter((n) => !MAGNITUDE[n] || MAGNITUDE[n].sha !== sha(bankA[n]));
  check('determinism:cross-process', tableDiff.length === 0,
    tableDiff.length ? `sha differs from the committed table (regenerate: node scripts/render-audio-evidence.mjs --table): ${tableDiff.join(', ')}`
      : `all ${EVENTS.length} sha256 match src/audio/magnitude.js, which a separate process wrote`);

  const numDiff = [];
  for (const n of EVENTS) {
    const m = MAGNITUDE[n];
    if (!m) continue;
    if (Math.abs(m.magnitude - magnitude(bankA[n])) > 0.01) numDiff.push(`${n}:mag`);
    if (Math.abs(m.peakDb - peakDb(bankA[n])) > 0.01) numDiff.push(`${n}:peak`);
    if (m.seed !== seedFor(n)) numDiff.push(`${n}:seed`);
  }
  check('table:matches-render', numDiff.length === 0, numDiff.length ? numDiff.join(' ') : `${EVENTS.length} rows of magnitude.js re-derive exactly`);

  /* ==================== B. the score =================================== */
  const n = Math.round(scoreA.loopSec * SR);
  const bad = [];
  const stemRows = [];
  for (const name of scoreA.order) {
    const s = scoreA.stems[name];
    const [L] = s.audio;
    if (L.length !== n) { bad.push(`${name}: ${L.length} samples != loop ${n}`); continue; }
    let pk = 0;
    for (let i = 0; i < n; i++) { const a = Math.abs(L[i]); if (a > pk) pk = a; }
    if (pk < 0.01) bad.push(`${name}: silent stem`);
    const seam = seamStep(s.audio);
    // charforge's rule: a downbeat attack at the wrap is music, not a click
    if (seam.click > seam.maxStep * 1.5 + 0.05) bad.push(`${name}: seam ${seam.click} vs own worst transient ${seam.maxStep}`);
    const dbp = peakDb(s.audio), lu = lufs(s.audio);
    if (dbp > TARGET.stemPeakDb) bad.push(`${name}: peak ${dbp} over ${TARGET.stemPeakDb}`);
    if (lu < TARGET.stemLufs[0] || lu > TARGET.stemLufs[1]) bad.push(`${name}: ${lu} LUFS outside ${JSON.stringify(TARGET.stemLufs)}`);
    stemRows.push(`${name} ${lu}LUFS/${dbp}dB/seam ${seam.ratio}x`);
  }
  check('score:stems', bad.length === 0,
    bad.length ? bad.join('; ') : `${scoreA.order.length} stems, ${scoreA.loopSec.toFixed(2)}s @ ${scoreA.meta.bpm}bpm — ${stemRows.join('  ')}`);

  const gaps = [];
  for (let v = 0; v <= 1.001; v += 0.05) {
    const g = Math.max(...scoreA.order.map((k) => (scoreA.stems[k].window[0] > 1 ? 0 : windowGain(v, scoreA.stems[k].window))));
    if (g < 0.25) gaps.push(v.toFixed(2));
  }
  check('score:coverage', gaps.length === 0, gaps.length ? `nothing audible at intensity ${gaps.join(', ')}` : 'every intensity 0..1 has an audible tier');

  const fullMix = mixAt(scoreA, 1);
  const bandsFull = spectralBands(fullMix);
  const offBands = Object.entries(TARGET.bands).filter(([k, [lo, hi]]) => bandsFull[k] < lo || bandsFull[k] > hi);
  check('score:spectral-balance', offBands.length === 0,
    offBands.length ? offBands.map(([k]) => `${k}=${bandsFull[k]}dB outside ${JSON.stringify(TARGET.bands[k])}`).join(' ') : `bands ${JSON.stringify(bandsFull)}`);
  const width = stereoWidth(fullMix);
  check('score:stereo', width.width >= 0.15 && width.correlation > 0,
    `width ${width.width}, correlation ${width.correlation} (need width>=0.15, corr>0 for mono compatibility)`);

  /* ==================== C. monotone in intensity ======================= */
  const md = fs.readFileSync(path.join(ROOT, 'LOOP-CONTRACT.md'), 'utf8');
  const jm = md.match(/```json\s*([\s\S]*?)```/);
  if (!jm) throw new Error('LOOP-CONTRACT.md has no machine-readable JSON block');
  const CONTRACT = JSON.parse(jm[1]);
  const MUSIC = CONTRACT.music;
  const INTENT = MUSIC.intent;
  const WAVE_KEYS = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'];

  const points = Object.entries(INTENT).filter(([, v]) => v > 0).map(([name, v]) => ({ name, v })).sort((a, b) => a.v - b.v);
  // ONE absolute onset threshold for every point, taken from the full mix.
  // charforge's onsetDensity normalises to each signal's own mean flux, which
  // makes a quiet pad bed score HIGHER than a full war-drum mix (measured: 9.4
  // against 5.7) and turns "denser" into a meaningless comparison.
  const fluxThresh = meanFlux(mixAt(scoreA, 1)) * 1.6;
  const seen = new Map();
  for (const p of points) {
    const key = p.v.toFixed(3);
    if (!seen.has(key)) {
      const m = mixAt(scoreA, p.v);
      seen.set(key, { lufs: lufs(m), peak: peakDb(m), onsets: onsetsPerSec(m, fluxThresh) });
    }
    Object.assign(p, seen.get(key));
  }
  const rowsTxt = points.map((p) => `${p.name}@${p.v} ${p.lufs}LUFS/${p.onsets}on-s`).join('  ');

  const drops = [];
  for (let i = 1; i < points.length; i++) if (points[i].lufs < points[i - 1].lufs) drops.push(`${points[i - 1].name}->${points[i].name} ${points[i - 1].lufs}->${points[i].lufs}`);
  check('intensity:loudness-monotone', drops.length === 0,
    drops.length ? `drops at ${drops.join(', ')}` : `non-decreasing over all ${points.length} intent points — ${rowsTxt}`);

  const onDrops = [];
  for (let i = 1; i < points.length; i++) if (points[i].onsets < points[i - 1].onsets - 0.15) onDrops.push(`${points[i - 1].name}->${points[i].name} ${points[i - 1].onsets}->${points[i].onsets}`);
  check('intensity:density-monotone', onDrops.length === 0,
    onDrops.length ? `onset density falls at ${onDrops.join(', ')}`
      : `onsets/s at one fixed threshold, non-decreasing (0.15/s tolerance): ${points.map((p) => `${p.name} ${p.onsets}`).join(' <= ')}`);

  const waveRows = WAVE_KEYS.map((k) => points.find((p) => p.name === k));
  const flat = [];
  for (let i = 1; i < waveRows.length; i++) if (waveRows[i].lufs <= waveRows[i - 1].lufs) flat.push(`${WAVE_KEYS[i - 1]}->${WAVE_KEYS[i]}`);
  check('intensity:wave-steps', flat.length === 0,
    flat.length ? `no rise at ${flat.join(', ')}` : `each wave louder than the last: ${waveRows.map((r, i) => `${WAVE_KEYS[i]} ${r.lufs}`).join(' < ')}`);

  const span = waveRows[5].lufs - waveRows[0].lufs;
  check('intensity:wave-span', span >= TARGET.waveSpanDb, `w1 ${waveRows[0].lufs} -> w6 ${waveRows[5].lufs} = ${r2(span)} dB (need >= ${TARGET.waveSpanDb})`);

  const w4 = points.find((p) => p.name === 'w4'), cap = points.find((p) => p.name === 'w4captain');
  check('intensity:captain-above-w4', cap.lufs > w4.lufs, `w4 ${w4.lufs} -> w4captain ${cap.lufs} (+${r2(cap.lufs - w4.lufs)} dB)`);

  const br = points.find((p) => p.name === 'breather');
  check('intensity:breather-band', br.lufs >= TARGET.mixBreatherLufs[0] && br.lufs <= TARGET.mixBreatherLufs[1],
    `breather ${br.lufs} LUFS in ${JSON.stringify(TARGET.mixBreatherLufs)}, ${r2(waveRows[0].lufs - br.lufs)} dB under wave 1`);
  check('intensity:full-band', waveRows[5].lufs >= TARGET.mixFullLufs[0] && waveRows[5].lufs <= TARGET.mixFullLufs[1],
    `w6 ${waveRows[5].lufs} LUFS in ${JSON.stringify(TARGET.mixFullLufs)}`);
  const hotPeaks = points.filter((p) => p.peak > TARGET.mixPeakDb);
  check('intensity:headroom', hotPeaks.length === 0,
    hotPeaks.length ? hotPeaks.map((p) => `${p.name} peak ${p.peak}`).join(' ') : `worst peak ${Math.max(...points.map((p) => p.peak))} dBFS (ceiling ${TARGET.mixPeakDb})`);

  // the dawn tier must be reachable ONLY by dawn(), or the 0.30 point moves
  const dawnPlain = lufs(mixAt(scoreA, INTENT.dawn));
  const dawnBell = lufs(mixAt(scoreA, INTENT.dawn, { dawn: 1 }));
  const dawnWin = scoreA.stems.dawnBell.window;
  check('intensity:dawn-out-of-band', windowGain(1, dawnWin) === 0 && dawnBell > dawnPlain + 0.5,
    `dawnBell window ${JSON.stringify(dawnWin)} is silent at every intensity; dawn() takes 0.30 from ${dawnPlain} to ${dawnBell} LUFS`);

  /* ==================== D. the ladder ================================== */
  const missing = [...LADDER, ...DECLARED, ...SURFACES.map((s) => `step-${s}`)].filter((k) => !BANK[k]);
  check('bank:events-present', missing.length === 0,
    missing.length ? `missing: ${missing.join(', ')}` : `${LADDER.length} ladder + ${DECLARED.length} other declared + ${SURFACES.length} surfaces, ${EVENTS.length} sounds total`);

  const contractLadder = CONTRACT.ladder.map(([k]) => k);
  check('bank:ladder-matches-contract', JSON.stringify(contractLadder) === JSON.stringify(LADDER),
    `${JSON.stringify(contractLadder) === JSON.stringify(LADDER) ? 'bank order IS' : 'bank order is NOT'} LOOP-CONTRACT.md's: ${contractLadder.join(' < ')}`);

  const magOf = (k) => magnitude(bankA[k]);
  const mags = LADDER.map((k) => ({ k, m: magOf(k) }));
  const inversions = [];
  for (let i = 1; i < mags.length; i++) {
    const d = mags[i].m - mags[i - 1].m;
    if (d < TARGET.ladderStepDb) inversions.push(`${mags[i - 1].k}(${mags[i - 1].m}) -> ${mags[i].k}(${mags[i].m}) = ${r2(d)} dB`);
  }
  check('ladder:monotone', inversions.length === 0,
    inversions.length ? `steps under ${TARGET.ladderStepDb} dB: ${inversions.join('; ')}` : mags.map((x, i) => `${i + 1}.${x.k} ${x.m}`).join(' < '));

  check('ladder:whiff-never-outranks-hit', magOf('bolt-miss') <= magOf('bolt-hit'),
    `bolt-miss ${magOf('bolt-miss')} <= bolt-hit ${magOf('bolt-hit')}`);
  const biggerKills = ['kill-hexer', 'kill-reaver', 'kill-shieldbearer', 'kill-captain'];
  const hurtViol = biggerKills.filter((k) => magOf('player-hurt') >= magOf(k));
  check('ladder:hurt-below-big-kills', hurtViol.length === 0,
    hurtViol.length ? `player-hurt outranks ${hurtViol.join(', ')}` : `player-hurt ${magOf('player-hurt')} under ${biggerKills.map((k) => `${k} ${magOf(k)}`).join(', ')}`);

  /* ==================== E. class discipline =========================== */
  const clsProblems = [];
  const buildRows = [];
  for (const name of EVENTS) {
    const a = bankA[name];
    const cls = SFX_CLASSES[BANK[name].class];
    if (!cls) { clsProblems.push(`${name}: unknown class "${BANK[name].class}"`); continue; }
    const [cmin, cmax, dmax, amax] = cls;
    const cent = centroidHz(a), dur = a[0].length / SR, pk = peakDb(a), atk = attackMs(a);
    if (cent < cmin || cent > cmax) clsProblems.push(`${name}: centroid ${cent}Hz outside ${BANK[name].class} ${cmin}-${cmax}`);
    if (dur > dmax) clsProblems.push(`${name}: ${dur.toFixed(2)}s > ${dmax}s for ${BANK[name].class}`);
    if (pk > TARGET.sfxPeakDb[1]) clsProblems.push(`${name}: peak ${pk} too hot`);
    if (pk < TARGET.sfxPeakDb[0]) clsProblems.push(`${name}: peak ${pk} too quiet`);
    if (amax > 0 && atk > amax) clsProblems.push(`${name}: peaks at ${atk}ms (${BANK[name].class} must front-load under ${amax}ms)`);
    if (amax < 0) {
      // a BUILD: the loudest moment must sit in the back of the sound's own
      // body, measured against the time 95 % of its energy has arrived — not
      // against the buffer length, which is mostly reverb tail
      const t95 = energyTime(a, 0.95) * 1000;
      if (atk < t95 * 0.45) clsProblems.push(`${name}: peaks at ${atk}ms of a ${r2(t95)}ms body — a build must peak in its back half`);
      buildRows.push(`${name} peaks ${atk}/${r2(t95)}ms`);
    }
  }
  check('sfx:classes', clsProblems.length === 0,
    clsProblems.length ? clsProblems.join('; ') : `${EVENTS.length} sounds inside their class windows; builds: ${buildRows.join(', ')}`);

  const oneLayer = EVENTS.filter((k) => (BANK[k].layers?.length ?? 0) < 2);
  check('sfx:layered', oneLayer.length === 0, oneLayer.length ? `single-generator prototypes: ${oneLayer.join(', ')}` : 'every sound is 2+ layers');

  // A family that is one sound at three gains passes every other check in this
  // file.  Distance is RMS over the six band levels in dB — see metrics.js for
  // why neither centroid nor a cosine works here.
  const familyCheck = (id, names, why) => {
    const prof = names.map((k) => bandProfile(bankA[k]));
    let worst = Infinity, pair = '';
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const d = profileDistance(prof[i], prof[j]);
        if (d < worst) { worst = d; pair = `${names[i]}/${names[j]}`; }
      }
    }
    check(id, worst >= TARGET.familyDistanceDb,
      `closest pair ${pair} is ${worst} dB apart across the six bands (need >= ${TARGET.familyDistanceDb}) — ${why}`);
  };
  familyCheck('sfx:surfaces-distinct', SURFACES.map((s) => `step-${s}`), 'three surfaces, not one footstep at three gains');
  familyCheck('sfx:telegraphs-distinct', ['tele-cutpurse', 'tele-reaver', 'tele-shieldbearer', 'hexer-telegraph', 'captain-dash'],
    'the player has 0.5-0.7 s to tell which kind is winding up');

  /* ==================== F. size ======================================= */
  const bankBytes = EVENTS.reduce((a, k) => a + (bankA[k][0].length + bankA[k][1].length) * 4, 0);
  const scoreBytes = scoreA.order.reduce((a, k) => a + scoreA.stems[k].audio[0].length * 2 * 4, 0);
  check('size:bank', bankBytes <= TARGET.bankBytesMax,
    `sfx ${(bankBytes / 1e6).toFixed(2)} MB + score ${(scoreBytes / 1e6).toFixed(2)} MB = ${((bankBytes + scoreBytes) / 1e6).toFixed(2)} MB of Float32 resident (bank cap ${TARGET.bankBytesMax / 1e6} MB)`);
  check('size:score', scoreBytes <= TARGET.scoreBytesMax,
    `${scoreA.order.length} stems x ${scoreA.loopSec.toFixed(1)}s stereo Float32 = ${(scoreBytes / 1e6).toFixed(2)} MB (cap ${TARGET.scoreBytesMax / 1e6} MB). The levers are the bar count and the tier count, nothing else.`);
  check('size:table-in-sync', MAGNITUDE_META.bankBytes === bankBytes && MAGNITUDE_META.events === EVENTS.length,
    `magnitude.js declares ${MAGNITUDE_META.events} events / ${MAGNITUDE_META.bankBytes} B; the render says ${EVENTS.length} / ${bankBytes} B`);

  /* ==================== G. one motif ================================== */
  const chromaOf = (name) => {
    const [L, R] = scoreA.stems[name].audio;
    const mono = new Float32Array(L.length);
    for (let i = 0; i < L.length; i++) mono[i] = (L[i] + R[i]) * 0.5;
    const fr = chromaFrames(mono, scoreA.meta.barSec);
    const avg = new Float32Array(12);
    for (const f of fr) for (let k = 0; k < 12; k++) avg[k] += f[k];
    const nn = Math.sqrt(avg.reduce((a, v) => a + v * v, 0)) + 1e-9;
    for (let k = 0; k < 12; k++) avg[k] /= nn;
    return avg;
  };
  const cos = (a, b) => { let s = 0; for (let i = 0; i < 12; i++) s += a[i] * b[i]; return +s.toFixed(3); };
  const ct = chromaOf('theme'), cc = chromaOf('hornCounter'), cb = chromaOf('dawnBell');
  const kin = [['theme~hornCounter', cos(ct, cc)], ['theme~dawnBell', cos(ct, cb)], ['hornCounter~dawnBell', cos(cc, cb)]];
  const weak = kin.filter(([, v]) => v < TARGET.motifKinship);
  check('score:one-motif', weak.length === 0,
    weak.length ? `melodic tiers diverge: ${weak.map(([k, v]) => `${k}=${v}`).join(' ')} (need >= ${TARGET.motifKinship})`
      : `the three melodic tiers are the same motif — ${kin.map(([k, v]) => `${k} ${v}`).join('  ')}`);

  /* ==================== H. the game's mapping ========================= */
  if (fs.existsSync(path.join(ROOT, 'src/game/music.js'))) {
    const mod = await import('../src/game/music.js');
    const f = mod.intensityFor ?? mod.default?.intensityFor;
    if (typeof f !== 'function') {
      check('mapping:intensityFor', false, 'src/game/music.js exists but exports no intensityFor()');
    } else {
      // The designed peak is alive == peakAlive and HP SOMEWHERE INSIDE that
      // wave's end-of-wave window — not at one end of it.  Taking the floor
      // puts w1 at 0.601 against an intent of 0.50 and taking the ceiling puts
      // w4 at 0.685 against 0.80; both are wrong readings of the same correct
      // mapping.  `waveIndex` is 0-based, which is what makes the contract's
      // `0.05·(wave-1)` term come out right.
      const best = (i, captain) => {
        const [lo, hi] = CONTRACT.curves.hpEndOfWave[i];
        const w = CONTRACT.waves[i];
        let bd = Infinity, bv = 0, bhp = 0;
        for (let hp = lo; hp <= hi; hp++) {
          const got = f({ alive: w.peakAlive, peakAlive: w.peakAlive, hp, waveIndex: i, captain });
          const d = Math.abs(got - (captain ? INTENT.w4captain : INTENT[`w${i + 1}`]));
          if (d < bd) { bd = d; bv = got; bhp = hp; }
        }
        return { d: bd, v: r2(bv), hp: bhp };
      };
      const rows = [], miss = [];
      CONTRACT.waves.forEach((w, i) => {
        // w4's own intent point is the one WITHOUT the Captain; w6's is with
        const b = best(i, w.id === 'w6');
        rows.push(`w${i + 1} ${b.v}@hp${b.hp} (want ${INTENT[`w${i + 1}`]})`);
        if (b.d > MUSIC.tol) miss.push(`w${i + 1}: best ${b.v} at hp ${b.hp} vs ${INTENT[`w${i + 1}`]} +-${MUSIC.tol}`);
      });
      const bc = best(3, true);
      rows.push(`w4captain ${bc.v}@hp${bc.hp} (want ${INTENT.w4captain})`);
      if (bc.d > MUSIC.tol) miss.push(`w4captain: best ${bc.v} at hp ${bc.hp} vs ${INTENT.w4captain}`);

      let mono = true;
      for (let a = 0; a < 14; a++) if (f({ alive: a, peakAlive: 14, hp: 100, waveIndex: 2 }) > f({ alive: a + 1, peakAlive: 14, hp: 100, waveIndex: 2 }) + 1e-9) mono = false;
      for (let hp = 100; hp > 0; hp -= 5) if (f({ alive: 5, peakAlive: 14, hp, waveIndex: 2 }) > f({ alive: 5, peakAlive: 14, hp: hp - 5, waveIndex: 2 }) + 1e-9) mono = false;
      check('mapping:intent-points', miss.length === 0, miss.length ? miss.join('; ') : `every point within +-${MUSIC.tol}: ${rows.join('  ')}`);
      check('mapping:monotone', mono, mono ? 'monotone in alive and in missing HP' : 'NOT monotone in alive or in missing HP');

      // and the names the feel table asks for must all resolve in this bank
      if (fs.existsSync(path.join(ROOT, 'src/game/feeltable.js'))) {
        const { FEEL } = await import('../src/game/feeltable.js');
        const want = [...new Set(Object.values(FEEL).map((e) => e.sfx).filter(Boolean))];
        const unresolved = want.filter((k) => !BANK[resolve(k)]);
        check('bank:serves-feeltable', unresolved.length === 0,
          unresolved.length ? `feeltable.js names sounds this bank cannot serve: ${unresolved.join(', ')}`
            : `all ${want.length} names in src/game/feeltable.js resolve (${Object.keys(ALIASES).length} through ALIASES)`);
      }
    }
  } else {
    skips.push('mapping — src/game/music.js does not exist yet and the game agent owns it. The AUDIO half of the contract\'s music gate is fully checked above; the pressure->intensity half is NOT, and this gate is incomplete until that file lands.');
  }
} catch (e) {
  console.log(`FAIL check-music: CRASHED — ${e.stack}`);
  console.log('RESULT: FAIL (crashed)');
  process.exit(2);
}

for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.id} — ${c.note}`);
for (const s of skips) console.log(`SKIP ${s}`);
const failed = checks.filter((c) => !c.pass);
console.log(failed.length ? `RESULT: FAIL (${failed.length} of ${checks.length})` : `RESULT: PASS (${checks.length} checks${skips.length ? `, ${skips.length} skipped` : ''})`);
process.exit(failed.length ? 1 : 0);
