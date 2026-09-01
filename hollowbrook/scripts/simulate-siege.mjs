#!/usr/bin/env node
/**
 * The siege sim — the balance and skill referee.  Runs the REAL rules
 * (src/game/rules.js: waves, enemies, weapons, nav on the flood-fill grid)
 * in Node against ONE policy played under actuation-noise profiles:
 *   NOVICE { delay 0.34 s, jitter ±16° }   EXPERT { delay 0.12 s, jitter ±4° }
 * plus three degenerate bots (aim-only, move-only, do-nothing).  Thresholds
 * are LOOP-CONTRACT.md's `referee.winnable` and `curves`; they are read from
 * src/game/data.js (which check-contract-drift keeps honest).
 *
 *   node scripts/simulate-siege.mjs [--detail]
 */
import fs from 'node:fs';
import { notBuilt } from './lib/headless.mjs';
if (!fs.existsSync(new URL('../src/game/sim.js', import.meta.url))) {
  notBuilt('simulate-siege', 'src/game/sim.js + src/game/rules.js', 'No headless siege exists yet; winnability and the designed curves are unmeasured, not passed.');
}
const { runReferee } = await import('../src/game/sim.js');
process.exit(await runReferee({ detail: process.argv.includes('--detail') }) ? 0 : 1);
