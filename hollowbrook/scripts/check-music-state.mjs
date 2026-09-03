#!/usr/bin/env node
/**
 * Music-vs-STATE gate (coordinator directive #2).  The music agent's
 * check-music.mjs holds the score and the intent MAPPING; this holds the
 * thing the ride review found missing: that the one number the game sends
 * follows MEASURED game state — enemies actually near the player, the
 * player's actual HP — not the wave's intent point.  A novice referee run
 * is traced once a second; the sent intensity must track the measured
 * pressure (detrended per wave, r >= 0.5), every breather must be deep
 * (<= 0.30 and 0.15 under the fight before it), and quiet stretches of a
 * wave (< 0.2 measured) must stay under 0.55 — no war drums over an empty
 * street.  A NULL-MODEL TABLE runs the same test on flat / ramp / noise /
 * intent-by-wave series and every one of them must FAIL, or the test is a
 * threshold you could have tuned to the wrong curve.
 */
import { bootWorld } from '../src/game/sim.js';
import { SiegeRun } from '../src/game/rules.js';
import { Stepper } from '../src/game/stepper.js';
import { makeBot, EXPERT } from '../src/game/bots.js';
import { traceSample, checkAgainstTrace, nullModels } from '../src/game/music.js';

const checks = [];
const check = (id, ok, note) => { checks.push({ id, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${note}`); };
try {
  const world = await bootWorld();
  const run = new SiegeRun(world, { seed: 2 });
  const st = new Stepper(run, { input: makeBot(run, EXPERT, { seed: 2 }) });
  const trace = [];
  while (!run.over && run.time < 1500) { st.ticks(60); trace.push(traceSample(run)); }
  console.log(`trace: ${trace.length} samples at 1 Hz, ${run.phase} at wave ${run.waveIndex + 1}; waves seen ${[...new Set(trace.map((s) => s.wave))].length}, breathers ${new Set(trace.filter((s) => s.phase === 'breather').map((s) => s.wave)).size}`);
  const fmt = (r) => `tracking r ${r.tracking}, breathers ${r.breathers} (min depth ${r.depthMin}, ok ${r.breatherOk}), quiet mean ${r.quietMean} over ${r.quietSamples}`;
  const real = checkAgainstTrace(trace, trace.map((s) => s.intensity));
  check('music:tracks-state', real.pass, `the intensity the shell sends: ${fmt(real)}`);
  check('music:enough-trace', trace.length >= 300 && real.breathers >= 2, `${trace.length} s traced, ${real.breathers} breathers crossed (need >= 300 s, >= 2)`);
  console.log('null models (each must FAIL the same test):');
  for (const [name, series] of Object.entries(nullModels(trace))) {
    const r = checkAgainstTrace(trace, series);
    check(`null:${name}`, !r.pass, `${r.pass ? 'PASSED — the test has no teeth' : 'fails'}: ${fmt(r)}`);
  }
} catch (e) { console.error('[check-music-state] crashed:', e); process.exit(2); }
const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `RESULT: FAIL (${failed})` : 'RESULT: PASS — the score follows the fight, and nothing else passes the test');
process.exit(failed ? 1 : 0);
