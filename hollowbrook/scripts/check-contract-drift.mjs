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
console.log(diffs.length ? `RESULT: FAIL (${diffs.length} drifts)` : 'RESULT: PASS — code matches the contract leaf for leaf');
process.exit(diffs.length ? 1 : 0);
