#!/usr/bin/env node
// Feel gate for INTENSITY RIDE: coverage of RIDE_EVENTS + the intent
// LADDER, judged on the SAME wired table the shell runs (headless Chrome).
import { readFileSync } from 'node:fs';
import { RIDE_EVENTS } from '../src/ride/curve.js';
import { withPage } from './lib/browser-harness.mjs';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
const table = readFileSync(new URL('../src/ride/feel-table.js', import.meta.url), 'utf8');
const wired = new Set([...table.matchAll(/feel\.wire\('([\w-]+)'/g)].map((m) => m[1]));
const unwired = RIDE_EVENTS.filter((e) => !wired.has(e));
check(`coverage: ${RIDE_EVENTS.length} declared, ${wired.size} wired`, unwired.length === 0, unwired.join(', '));

await withPage('/ride.html', async (page) => {
  const runtime = await page.evaluate(() => window.__feelCheck());
  check('runtime feel check', runtime.length === 0, runtime.join('; '));
  const ladder = await page.evaluate(() => window.__feelLadder());
  console.log(`ladder magnitudes: ${Object.entries(ladder.magnitudes).map(([k, v]) => `${k}=${v.toFixed(2)}`).join('  ')}`);
  check('ladder monotone in intent/value + named pairs', ladder.problems.length === 0, ladder.problems.join('; '));
}, { readyExpr: '!!window.__feelLadder' });

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
