#!/usr/bin/env node
// B4 play-camera gate: __playCheck through the real shell in headless
// Chrome — frustum p10 over combat-range threats, ID-pass legibility
// through the climax, elite legibility. Canonical seeded start inside.
import { withPage } from './lib/browser-harness.mjs';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
await withPage('/ride.html', async (page) => {
  const r = await page.evaluate(() => window.__playCheck(175));
  console.log(JSON.stringify(r));
  check('play camera: p10 of combat-range threats in frustum >= 0.8', r.visibleP10 >= 0.8, `p10 ${r.visibleP10} over ${r.frames} frames (bot survived ${r.survived}s)`);
  check('climax legibility: >= 60% of combat-range threats legible', r.climaxSamples > 0 && r.climaxLegibleFrac >= 0.6, `${r.climaxLegibleFrac} over ${r.climaxSamples} samples`);
  check('elite legible as an elite (marker pixels) >= 80% of its frames', r.eliteLegibleFrac === null ? false : r.eliteLegibleFrac >= 0.8, `${r.eliteLegibleFrac ?? 'no elite frames judged'}`);
}, { readyExpr: '!!window.__playCheck', timeout: 60000 });

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
