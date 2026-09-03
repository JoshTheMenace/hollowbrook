#!/usr/bin/env node
/**
 * Contract drift gate.  The juicebox review found the contract saying dash
 * recovery 0.16 s where the code said 0.45 — 2.8x off on the number the
 * central feel claim rested on — with every gate green, because no gate
 * read both.  This one does: LOOP-CONTRACT.md's JSON block is parsed and
 * deep-compared against `CONTRACT` exported by src/game/data.js.  Every
 * leaf in the contract must exist in the code with the same value; extra
 * leaves in the code are listed as warnings (the code may know more, the
 * contract may not lie).
 */
import fs from 'node:fs';
import { notBuilt } from './lib/headless.mjs';

const md = fs.readFileSync(new URL('../LOOP-CONTRACT.md', import.meta.url), 'utf8');
const contract = JSON.parse(md.split('```json')[1].split('```')[0]);
if (!fs.existsSync(new URL('../src/game/data.js', import.meta.url))) {
  notBuilt('check-contract-drift', 'src/game/data.js', 'The contract has numbers; the code has none yet to drift from them.');
}
const { CONTRACT } = await import('../src/game/data.js');
const diffs = [];
const extras = [];
const walk = (a, b, path) => {
  if (Array.isArray(a) || (a && typeof a === 'object')) {
    if (!b || typeof b !== 'object') { diffs.push(`${path}: missing in code`); return; }
    for (const k of Object.keys(a)) walk(a[k], b[k], `${path}.${k}`);
    for (const k of Object.keys(b)) if (!(k in a)) extras.push(`${path}.${k}`);
  } else if (a !== b) diffs.push(`${path}: contract ${JSON.stringify(a)} vs code ${JSON.stringify(b)}`);
};
walk(contract, CONTRACT, 'CONTRACT');
for (const d of diffs) console.log(`FAIL ${d}`);
for (const e of extras.slice(0, 20)) console.log(`WARN code carries ${e} that the contract does not declare`);
console.log(diffs.length ? `source: FAIL (${diffs.length} drifts)` : 'source: PASS — code matches the contract leaf for leaf');

/* REALISED constants (coordinator directive): a source constant that says
 * 22 m/s certifies nothing about what the verb delivers.  Measure the
 * delivered numbers in the running rules through the real accumulator —
 * sprint/walk/charging speed over held input, bolt cadence and magazine and
 * reload from the event ticks, lance charge time, early-release, projectile
 * speed, cooldown — and hold them within 2 % (one tick of quantisation on
 * the timings). */
let realisedFails = 0;
try {
  const { bootWorld, measureRealised } = await import('../src/game/sim.js');
  const world = await bootWorld();
  for (const row of measureRealised(world)) {
    const tol = Math.max(0.02 * Math.abs(row.contract), 1 / 60 + 1e-6);
    const ok = Number.isFinite(row.measured) && Math.abs(row.measured - row.contract) <= tol;
    if (!ok) realisedFails += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'} realised ${row.name}: contract ${row.contract}, delivered ${Number.isFinite(row.measured) ? row.measured.toFixed(3) : 'NaN'} (tol ±${tol.toFixed(3)}, rules tick 1/60)`);
  }
} catch (e) { realisedFails += 1; console.log(`FAIL realised: could not measure — ${e.message}`); }
const total = diffs.length + realisedFails;
console.log(total ? `RESULT: FAIL (${total})` : 'RESULT: PASS — source and delivered values match the contract');
process.exit(total ? 1 : 0);
