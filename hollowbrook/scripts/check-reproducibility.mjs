#!/usr/bin/env node
/**
 * Reproducibility gate (coordinator directive after the Juice Box review:
 * a dash integrated per render frame delivered 2.13–3.20 m by frame rate
 * with every gate green at dt = 1/60).
 *
 * Records an input TAPE — tick-indexed, never wall-clock — from the referee
 * bot playing the real rules through the real accumulator (stepper.js),
 * then replays that tape through the same accumulator at 30 / 60 / 90 /
 * 144 fps and with jittered frame times (±35 %), and asserts BYTE-IDENTICAL
 * game state (rules.stateHash over every number that matters) at every
 * checkpoint: every 10 s of sim time, plus every wave start.  Also: the
 * same tape on a fresh run twice gives the same hash (determinism), and a
 * different seed gives a different one (the hash has teeth).
 *
 *   node scripts/check-reproducibility.mjs      # exit 0 pass · 1 fail · 2 crash
 */
import { bootWorld } from '../src/game/sim.js';
import { SiegeRun, TICK, mulberry32 } from '../src/game/rules.js';
import { Stepper } from '../src/game/stepper.js';
import { makeBot, EXPERT } from '../src/game/bots.js';

const SECONDS = 150;                    // crosses wave 1, the first breather and into wave 2
const CHECK_EVERY = 10;
const RATES = [30, 60, 90, 144];
const checks = [];
const check = (id, ok, note) => { checks.push({ id, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${note}`); };

try {
  const world = await bootWorld();
  console.log(`rules tick ${TICK.toFixed(5)} s (60 Hz); ${SECONDS} s of play; checkpoints every ${CHECK_EVERY} s and at every wave start`);

  // 1. record: the bot plays at 60 fps, the stepper writes the tape
  const rec = new SiegeRun(world, { seed: 3 });
  const recStep = new Stepper(rec, { input: makeBot(rec, EXPERT, { seed: 3 }), record: true });
  recStep.stopTick = Math.round(SECONDS / TICK);
  const marks = new Map();
  const mark = (run) => { if (run.tick % (CHECK_EVERY * 60) === 0) marks.set(run.tick, run.stateHash()); };
  while (rec.tick < recStep.stopTick && !rec.over) { recStep.frame(1 / 60); mark(rec); }
  for (const e of rec.events) if (e.name === 'wave-start') marks.set(e.tick + 1, null);
  const tape = recStep.recorded;
  console.log(`tape: ${tape.length} ticks recorded, ${marks.size} checkpoints, ${rec.stats.kills} kills, phase ${rec.phase} wave ${rec.waveIndex + 1}`);

  // reference hashes at every checkpoint from a clean 60 fps replay
  const replay = (fps, jitter, seed = 3) => {
    const run = new SiegeRun(world, { seed });
    const st = new Stepper(run, { tape });
    st.stopTick = recStep.stopTick;
    const jr = mulberry32(fps * 7 + 1);
    const out = new Map();
    let frames = 0;
    while (run.tick < st.stopTick && !run.over) {
      const dt = jitter ? (1 / fps) * (1 + (jr() * 2 - 1) * jitter) : 1 / fps;
      const before = run.tick;
      st.frame(dt);
      frames += 1;
      for (let t = before + 1; t <= run.tick; t += 1) if (marks.has(t)) { /* hash at exactly that tick is only possible when we stop there */ }
      if (marks.has(run.tick)) out.set(run.tick, run.stateHash());
    }
    return { out, frames, final: run.stateHash(), tick: run.tick };
  };
  // to hash at EXACT ticks whatever the cadence, replay with stopTick at each checkpoint
  const replayAt = (fps, jitter, seed = 3) => {
    const run = new SiegeRun(world, { seed });
    const st = new Stepper(run, { tape });
    const jr = mulberry32(fps * 7 + 1);
    const out = new Map();
    const ticks = [...marks.keys()].sort((a, b) => a - b);
    let frames = 0;
    for (const t of ticks) {
      st.stopTick = t;
      while (run.tick < t && !run.over) { st.frame(jitter ? (1 / fps) * (1 + (jr() * 2 - 1) * jitter) : 1 / fps); frames += 1; }
      out.set(t, run.stateHash());
    }
    return { out, frames, tick: run.tick };
  };
  const ref = replayAt(60, 0);
  let allSame = true;
  for (const fps of RATES) {
    for (const jitter of [0, 0.35]) {
      const r = replayAt(fps, jitter);
      const diffs = [...ref.out.keys()].filter((t) => ref.out.get(t) !== r.out.get(t));
      const ok = diffs.length === 0;
      allSame = allSame && ok;
      check(`replay:${fps}fps${jitter ? '±35%' : ''}`, ok, ok ? `${ref.out.size} checkpoints byte-identical over ${r.frames} frames` : `DIFFERS at ticks ${diffs.slice(0, 5).join(', ')}`);
    }
  }
  // determinism of the recording itself, and teeth
  const again = replayAt(60, 0);
  check('replay:repeat', [...ref.out.keys()].every((t) => ref.out.get(t) === again.out.get(t)), 'the same tape on a fresh run twice: identical');
  const other = replayAt(60, 0, 4);
  check('hash:teeth', [...ref.out.keys()].some((t) => ref.out.get(t) !== other.out.get(t)), `a different seed (cosmetic scatter) changes the hash: ${ref.out.get([...ref.out.keys()][3])} vs ${other.out.get([...ref.out.keys()][3])}`);
  // and the recording's own marks agree with the replay (the recorder and the replayer are the same loop)
  const recMarks = [...marks.entries()].filter(([, h]) => h !== null);
  check('record==replay', recMarks.every(([t, h]) => ref.out.get(t) === h), `${recMarks.length} recorded checkpoints match the 60 fps replay`);
} catch (e) {
  console.error('[check-reproducibility] crashed:', e);
  process.exit(2);
}
const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `RESULT: FAIL (${failed})` : 'RESULT: PASS — the shell loop cannot tell 30 fps from 144');
process.exit(failed ? 1 : 0);
