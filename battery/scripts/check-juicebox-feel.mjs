#!/usr/bin/env node
// Feel gate for JUICE BOX (A7): coverage of JUICE_EVENTS, and the LADDER
// judged on the COMPOSITE moments the game actually fires, measured in
// RENDERED space at the play camera (screen shake px, hit-stop frames,
// changed pixels, text) — r2: the wired-parameter ladder was green while
// a double out-shouted gold, and particles rendered at 1-2 px.
import { readFileSync } from 'node:fs';
import { JUICE_EVENTS } from '../src/juicebox/rules.js';
import { withPage } from './lib/browser-harness.mjs';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
const table = readFileSync(new URL('../src/juicebox/feel-table.js', import.meta.url), 'utf8');
const wired = new Set([...table.matchAll(/feel\.wire\('([\w-]+)'/g)].map((m) => m[1]));
const unwired = JUICE_EVENTS.filter((e) => !wired.has(e));
check(`coverage: ${JUICE_EVENTS.length} declared, ${wired.size} wired`, unwired.length === 0, unwired.join(', '));

// rendered magnitude of a composite moment: what the eye gets
const magnitude = (m) => m.shakePx * 1.0 + m.hitstopFrames * 2.0 + Math.min(4000, m.particlePx) / 400 + (m.textSeen ? 2 : 0);
const ORDER = [['whiff', 0], ['single', 10], ['double', 50], ['gold', 60], ['triple', 140]];   // banked value at combo 1

await withPage('/juicebox.html', async (page) => {
  const runtime = await page.evaluate(() => window.__feelCheck());
  check('runtime feel check', runtime.length === 0, runtime.join('; '));
  const wiredLadder = await page.evaluate(() => window.__feelLadder());
  console.log(`wired-parameter ladder (kept, informational): ${Object.entries(wiredLadder.magnitudes).map(([k, v]) => `${k}=${v.toFixed(2)}`).join('  ')}`);
  const moments = {};
  for (const kind of ['whiff', 'single', 'double', 'gold', 'triple', 'hit']) {
    moments[kind] = await page.evaluate((k) => window.__renderedMoment(k), kind);
    console.log(`  ${kind.padEnd(7)} shake ${moments[kind].shakePx.toFixed(1)} px · hitstop ${moments[kind].hitstopFrames} f · changed px ${moments[kind].particlePx} · text ${moments[kind].textSeen} → ${magnitude(moments[kind]).toFixed(2)}`);
  }
  let inverted = [];
  for (let i = 1; i < ORDER.length; i++) {
    const [lo] = ORDER[i - 1], [hi] = ORDER[i];
    if (magnitude(moments[hi]) < magnitude(moments[lo]) - 1e-6) inverted.push(`${lo} (${magnitude(moments[lo]).toFixed(2)}) > ${hi} (${magnitude(moments[hi]).toFixed(2)})`);
  }
  check('rendered ladder monotone in banked value (whiff < single < double < gold < triple)', inverted.length === 0, inverted.join('; '));
  check('being hit is not louder than the best good moment (rendered)', magnitude(moments.hit) < magnitude(moments.triple), `hit ${magnitude(moments.hit).toFixed(2)} vs triple ${magnitude(moments.triple).toFixed(2)}`);
  check('gold shakes visibly more than a single (≥ 3 px more)', moments.gold.shakePx - moments.single.shakePx >= 3, `${moments.gold.shakePx} vs ${moments.single.shakePx} px`);
  check('a single pop changes ≥ 400 px (particles read at the court camera)', moments.single.particlePx >= 400, `${moments.single.particlePx} px changed`);
}, { readyExpr: '!!window.__renderedMoment' });

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
