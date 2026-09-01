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
  // A7 §1: the elite bar's pixels track HP — sampled at two HP values in the hold
  const bar = await page.evaluate(() => {
    window.__autoplay(true, 7);
    const samples = [];
    for (let i = 0; i < 172 * 60 && window.__ride.ride && !window.__ride.ride.over; i++) {
      window.__tick(1 / 60);
      const t = window.__ride.ride.time;
      if (t >= 152 && samples.length === 0) { const b = window.__eliteBar(); if (b) samples.push({ t: +t.toFixed(1), ...b }); }
      if (t >= 165 && samples.length === 1) { const b = window.__eliteBar(); if (b) samples.push({ t: +t.toFixed(1), ...b }); }
      if (samples.length >= 2) break;
    }
    window.__autoplay(false);
    return samples;
  });
  console.log('elite bar samples:', JSON.stringify(bar));
  for (const s of bar) check(`elite bar pixels track HP @ ${s.t}s (fill ${(s.fillFrac * 100).toFixed(0)}% vs HP ${(s.hpFrac * 100).toFixed(0)}%, ±10%)`, Math.abs(s.fillFrac - s.hpFrac) <= 0.1, `red ${s.red} / dark ${s.dark} px in box ${s.box.join(',')}`);
  check('elite bar sampled at two HP values', bar.length === 2, `${bar.length} samples`);
  check('play camera: p10 of combat-range threats in frustum >= 0.8', r.visibleP10 >= 0.8, `p10 ${r.visibleP10} over ${r.frames} frames (bot survived ${r.survived}s)`);
  check('climax legibility: >= 60% of combat-range threats legible', r.climaxSamples > 0 && r.climaxLegibleFrac >= 0.6, `${r.climaxLegibleFrac} over ${r.climaxSamples} samples`);
  check('elite BODY legible (size + contrast, marker pixels excluded) >= 80% of its frames', r.eliteLegibleFrac === null ? false : r.eliteLegibleFrac >= 0.8, `${r.eliteLegibleFrac ?? 'no elite frames judged'} over ${r.eliteFrames} frames`);
  check('elite MARKER visible (>= 10 marker pixels) >= 80% of its frames — a separate row', r.eliteMarkerFrac === null ? false : r.eliteMarkerFrac >= 0.8, `${r.eliteMarkerFrac ?? 'no elite frames judged'}`);
}, { readyExpr: '!!window.__playCheck', timeout: 60000 });

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
