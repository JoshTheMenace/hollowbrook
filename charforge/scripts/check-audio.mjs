// SoundForge machine gates — renders the REAL content and asserts production
// properties. Every check names the measured number so a failure is a
// specific, provable defect (like a floating foot, not a vibe).
//   node scripts/check-audio.mjs [track|sfx]
import { composeSong, composeAdaptiveLoop } from '../src/soundforge/compose.js';
import { windowGain } from '../src/soundforge/runtime.js';
import { LOOP } from '../src/soundforge/content/loop-nightbloom.js';
import { renderSfx } from '../src/soundforge/sfx.js';
import { lufs, peakDb, spectralBands, sectionSimilarity, repetitionScore, onsetDensity, stereoWidth, centroidHz } from '../src/soundforge/features.js';
import { TRACK } from '../src/soundforge/content/track-nightbloom.js';
import { SFX, SFX_CLASSES } from '../src/soundforge/content/sfx-core.js';
import { SR, seedAudio } from '../src/soundforge/dsp.js';

const checks = [];
const check = (id, pass, note) => checks.push({ id, pass, note });
const what = process.argv[2] || 'all';

if (what === 'track' || what === 'all') {
  seedAudio(TRACK.seed ?? 7);
  const { master, meta, totalSec } = composeSong(TRACK);

  // 1. loudness + headroom
  const loud = lufs(master), pk = peakDb(master);
  check('track:loudness', loud >= -16.5 && loud <= -11.5, `integrated ${loud} LUFS (window -16.5..-11.5)`);
  check('track:headroom', pk <= -0.9, `true peak ${pk} dBFS (ceiling -1)`);

  // 2. the anti-"tasteless loop" gate: no verbatim bar repetition
  const rep = repetitionScore(master, meta);
  check('track:not-a-loop', rep.identicalPairFrac < 0.1, `${(rep.identicalPairFrac * 100).toFixed(1)}% of bar pairs near-identical over ${rep.bars} bars (<10%)`);

  // 3. adjacent sections must be distinguishable (harmony OR energy changes)
  const sim = sectionSimilarity(master, meta);
  const ons = onsetDensity(master, meta);
  const clones = [];
  for (let i = 0; i + 1 < meta.sections.length; i++) {
    const harmSame = sim[i][i + 1] > 0.998;
    const a = ons[i].perSec, b = ons[i + 1].perSec;
    const energySame = Math.abs(a - b) / Math.max(a, b, 0.1) < 0.08;
    if (harmSame && energySame) clones.push(`${ons[i].name}->${ons[i + 1].name}`);
  }
  check('track:sections-differ', clones.length === 0, clones.length ? `indistinguishable: ${clones.join(', ')}` : 'every adjacent section changes harmony or energy');

  // 4. dynamic arc: the track must breathe
  const dens = ons.map((o) => o.perSec);
  check('track:dynamic-arc', Math.max(...dens) >= Math.min(...dens) * 1.8, `onset density ${Math.min(...dens)}..${Math.max(...dens)}/s (max >= 1.8x min)`);

  // 5. intensity honesty: declared intensity must track measured energy
  let agree = 0, pairs = 0;
  for (let i = 0; i < ons.length; i++) for (let j = i + 1; j < ons.length; j++) {
    if (ons[i].intensity === ons[j].intensity) continue;
    pairs++;
    if ((ons[i].intensity < ons[j].intensity) === (ons[i].perSec < ons[j].perSec)) agree++;
  }
  check('track:intensity-tracks', agree / pairs >= 0.7, `declared-vs-measured ordering agreement ${(agree / pairs * 100).toFixed(0)}% (>=70%)`);

  // 6. spectral balance windows (calibrated on referenced masters)
  const bands = spectralBands(master);
  const windows = { sub: [-10, -3], low: [-8, -2], lowmid: [-11, -4], mid: [-16, -8], high: [-17, -9], air: [-25, -13] };
  const off = Object.entries(windows).filter(([k, [lo, hi]]) => bands[k] < lo || bands[k] > hi);
  check('track:spectral-balance', off.length === 0, off.length ? off.map(([k]) => `${k}=${bands[k]}dB`).join(' ') + ' out of window' : `bands ok: ${JSON.stringify(bands)}`);

  // 7. stereo image: wide but mono-compatible
  const st = stereoWidth(master);
  check('track:stereo', st.width >= 0.15 && st.correlation > 0, `width ${st.width}, correlation ${st.correlation} (width>=0.15, corr>0)`);

  // 8. structure
  check('track:structure', meta.sections.length >= 4 && totalSec >= 90 && totalSec <= 300, `${meta.sections.length} sections, ${totalSec.toFixed(0)}s`);
}

if (what === 'loop' || what === 'all') {
  seedAudio(LOOP.seed ?? 11);
  const { stems, loopSec } = composeAdaptiveLoop(LOOP);
  const n = Math.round(loopSec * SR);
  const names = Object.keys(stems);

  // every stem: exact loop length, audible, and no click at the loop seam
  const bad = [];
  for (const [name, s] of Object.entries(stems)) {
    const [L, R] = s.audio;
    if (L.length !== n) { bad.push(`${name}: ${L.length} samples != loop ${n}`); continue; }
    let pk = 0, maxStep = 0;
    for (let i = 1; i < n; i++) {
      const a = Math.abs(L[i]);
      if (a > pk) pk = a;
      const st = Math.abs(L[i] - L[i - 1]);
      if (st > maxStep) maxStep = st;
    }
    if (pk < 0.01) bad.push(`${name}: silent stem`);
    // a seam is defective only if it jumps HARDER than the stem's own
    // transients — a downbeat attack at the wrap is music, not a click
    const click = Math.max(Math.abs(L[n - 1] - L[0]), Math.abs(R[n - 1] - R[0]));
    if (click > maxStep * 1.5 + 0.05) bad.push(`${name}: seam step ${click.toFixed(2)} vs own max transient ${maxStep.toFixed(2)}`);
  }
  check('loop:stems', bad.length === 0, bad.length ? bad.join('; ') : `${names.length} stems, ${loopSec.toFixed(1)}s, aligned + seamless`);

  // intensity coverage: something audible at EVERY intensity
  const gaps = [];
  for (let v = 0; v <= 1.001; v += 0.05) {
    const maxG = Math.max(...names.map((k) => windowGain(v, stems[k].window)));
    if (maxG < 0.25) gaps.push(v.toFixed(2));
  }
  check('loop:coverage', gaps.length === 0, gaps.length ? `no stem audible at intensity ${gaps.join(', ')}` : 'every intensity 0..1 has audible stems');

  // energy honesty: mixed RMS must climb with intensity
  const rmsAt = (v) => {
    let sum = 0;
    for (let i = 0; i < n; i += 11) {
      let x = 0;
      for (const k of names) x += stems[k].audio[0][i] * windowGain(v, stems[k].window);
      sum += x * x;
    }
    return Math.sqrt(sum / (n / 11));
  };
  const levels = [0.1, 0.35, 0.6, 0.85, 1.0].map((v) => ({ v, rms: rmsAt(v) }));
  const drops = levels.slice(1).filter((l, i) => l.rms < levels[i].rms * 0.95);
  check('loop:energy-climbs', drops.length === 0,
    levels.map((l) => `${l.v}:${l.rms.toFixed(3)}`).join(' ') + (drops.length ? ' — drops at ' + drops.map((d) => d.v).join(',') : ''));
}

if (what === 'sfx' || what === 'all') {
  for (const [name, spec] of Object.entries(SFX)) {
    seedAudio([...name].reduce((a, c) => a * 31 + c.charCodeAt(0) | 0, 7));
    const audio = renderSfx(spec);
    const cls = SFX_CLASSES[spec.class];
    if (!cls) { check(`sfx:${name}`, false, `unknown class "${spec.class}"`); continue; }
    const [cMin, cMax, maxDur] = cls;
    const cent = centroidHz(audio);
    const dur = audio[0].length / SR;
    const pk = peakDb(audio);
    const problems = [];
    if (cent < cMin || cent > cMax) problems.push(`centroid ${cent}Hz outside ${spec.class} ${cMin}-${cMax}`);
    if (dur > maxDur) problems.push(`${dur.toFixed(2)}s > ${maxDur}s max for ${spec.class}`);
    if (pk > -0.5) problems.push(`peak ${pk} too hot`);
    if (pk < -26) problems.push(`peak ${pk} too quiet`);
    // transient discipline: interactive sounds must hit fast
    if (spec.class === 'ui' || spec.class === 'combat' || spec.class === 'foley') {
      const [L, R] = audio;
      let maxA = 0, maxI = 0;
      for (let i = 0; i < L.length; i++) { const a = Math.abs(L[i]) + Math.abs(R[i]); if (a > maxA) { maxA = a; maxI = i; } }
      const ms = maxI / SR * 1000;
      if (ms > 90) problems.push(`peak at ${ms.toFixed(0)}ms (interactive sfx must front-load <90ms)`);
    }
    check(`sfx:${name}`, problems.length === 0, problems.length ? problems.join('; ') : `${spec.class} ok (${cent}Hz, ${dur.toFixed(2)}s, ${pk}dB)`);
  }
}

for (const c of checks) console.log(`${c.pass ? '✓' : '✗'} ${c.id}: ${c.note}`);
const failed = checks.filter((c) => !c.pass);
console.log(failed.length ? `FAIL (${failed.length})` : 'ALL PASS');
process.exit(failed.length ? 1 : 0);
