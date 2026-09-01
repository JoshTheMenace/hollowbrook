#!/usr/bin/env node
// Feel gate for JUICE BOX: coverage (every JUICE_EVENTS type has a consumer
// in the table) AND the LADDER (review r1: coverage certified a flat,
// partly inverted ladder). The ladder is judged on the SAME wired table
// the game runs, inside the real shell via headless Chrome.
import { readFileSync } from 'node:fs';
import { JUICE_EVENTS } from '../src/juicebox/rules.js';
import { withPage } from './lib/browser-harness.mjs';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

// coverage: static, against the table module (the shell imports it)
const table = readFileSync(new URL('../src/juicebox/feel-table.js', import.meta.url), 'utf8');
const wired = new Set([...table.matchAll(/feel\.wire\('([\w-]+)'/g)].map((m) => m[1]));
const unwired = JUICE_EVENTS.filter((e) => !wired.has(e));
check(`coverage: ${JUICE_EVENTS.length} declared, ${wired.size} wired`, unwired.length === 0, unwired.map((e) => `"${e}" has NO consumer`).join(', '));

// ladder: dynamic, through the running shell
await withPage('/juicebox.html', async (page) => {
  const runtime = await page.evaluate(() => window.__feelCheck());
  check('runtime feel check (empty mappings, missing sfx)', runtime.length === 0, runtime.join('; '));
  const ladder = await page.evaluate(() => window.__feelLadder());
  const mags = Object.entries(ladder.magnitudes).map(([k, v]) => `${k}=${v.toFixed(2)}`).join('  ');
  console.log(`ladder magnitudes: ${mags}`);
  check('ladder monotone in value + named pairs', ladder.problems.length === 0, ladder.problems.join('; '));
}, { readyExpr: '!!window.__feelLadder' });

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
