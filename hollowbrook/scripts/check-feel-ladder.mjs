#!/usr/bin/env node
/**
 * The ladder gate — feedback magnitude must be MONOTONE in value.  The
 * juicebox review found a flat, partly inverted ladder (a whiff louder than
 * a hit, a +150 pop with zero shake, being hit the loudest event in the
 * game) with every coverage gate green; coverage is not a ladder.
 *
 * Reads the declared ladder and weights from LOOP-CONTRACT.md's JSON block,
 * computes each event's magnitude from src/game/feeltable.js with those
 * weights (or `feel.magnitude()` once charforge ships it — see
 * src/game/ladder.js), and asserts:
 *   - the declared order is non-decreasing in computed magnitude;
 *   - each computed magnitude is within 15 % of the declared one;
 *   - bolt-miss <= bolt-hit (a whiff never outranks a hit);
 *   - player-hurt < kill-shieldbearer (being hit never outranks a real kill).
 */
import fs from 'node:fs';
import { notBuilt } from './lib/headless.mjs';

const md = fs.readFileSync(new URL('../LOOP-CONTRACT.md', import.meta.url), 'utf8');
const contract = JSON.parse(md.split('```json')[1].split('```')[0]);
if (!fs.existsSync(new URL('../src/game/feeltable.js', import.meta.url))) {
  notBuilt('check-feel-ladder', 'src/game/feeltable.js', `The contract declares a ${contract.ladder.length}-rung ladder; nothing implements it yet.`);
}
const { FEEL } = await import('../src/game/feeltable.js');
const W = contract.ladderWeights;
const magnitude = (fx) => (fx ? W.shake * (fx.shake ?? 0) + W.hitstop * (fx.hitstop ?? 0) + W.burst * (fx.burst?.count ?? 0) + W.text * (fx.text ? 1 : 0) + W.sfx * (fx.sfx ? 1 : 0) : 0);
let failures = 0;
const fail = (m) => { failures++; console.log(`FAIL ${m}`); };
const got = new Map();
for (const [ev, declared] of contract.ladder) {
  const fx = FEEL[ev];
  if (!fx) { fail(`"${ev}" is on the declared ladder and not in FEEL`); continue; }
  const m = magnitude(fx);
  got.set(ev, m);
  const ok = Math.abs(m - declared) <= Math.max(0.3, declared * 0.15);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${ev}: computed ${m.toFixed(2)} vs declared ${declared}`);
  if (!ok) failures++;
}
for (let i = 1; i < contract.ladder.length; i++) {
  const [a] = contract.ladder[i - 1];
  const [b] = contract.ladder[i];
  if (got.has(a) && got.has(b) && got.get(b) < got.get(a) - 1e-9) fail(`ladder inverted: "${b}" (${got.get(b).toFixed(2)}) < "${a}" (${got.get(a).toFixed(2)})`);
}
if (got.get('bolt-miss') > got.get('bolt-hit')) fail('a whiff outranks a hit');
if (got.get('player-hurt') >= got.get('kill-shieldbearer')) fail('being hit outranks a shieldbearer kill');
console.log(failures ? `RESULT: FAIL (${failures})` : 'RESULT: PASS — ladder monotone');
process.exit(failures ? 1 : 0);
