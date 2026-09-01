#!/usr/bin/env node
// B2 rendered-space gate (Amendment A2): measures the CHARACTER's rendered
// pixels against the WORLD's rendered band in the same frame, at all three
// contract cameras, day and night — real headless Chrome, real compositor
// output. This is the judging space; the albedo gate is only structural.
//
// Day:   char sat p90 ≤ world sat p99 + margin (the world's own most
//        saturated rendered content bounds the character's).
// Night: char/world luma p50 ratio within [0.8, 1.6] at EVERY camera
//        (r2: the seat was tuned at one camera; portrait read 2.015).

import { withPage } from './lib/browser-harness.mjs';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
const MARGIN = 0.02;

await withPage('/celbridge.html', async (page) => {
  await page.waitForFunction('!!window.__renderedBand');
  for (const cam of ['meet', 'portrait', 'far']) {
    const day = await page.evaluate((c) => window.__renderedBand(c, 'day'), cam);
    check(`day/${cam}: char sat p90 ≤ world sat p99 (+${MARGIN})`,
      day.char.satP90 <= day.world.satP99 + MARGIN,
      `char p90 ${day.char.satP90.toFixed(3)} vs world p99 ${day.world.satP99.toFixed(3)} (char px ${day.charPixels})`);
    const night = await page.evaluate((c) => window.__renderedBand(c, 'night'), cam);
    check(`night/${cam}: char/world luma p50 in [0.8, 1.6]`,
      night.lumRatio >= 0.8 && night.lumRatio <= 1.6,
      `ratio ${night.lumRatio.toFixed(3)} (char ${night.char.lumP50.toFixed(3)} / world ${night.world.lumP50.toFixed(3)})`);
  }
}, { readyExpr: '!!window.__renderedBand' });

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
