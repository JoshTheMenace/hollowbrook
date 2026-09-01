#!/usr/bin/env node
// B2 rendered-space gate (A2 + A3): the CHARACTER's rendered pixels vs the
// WORLD's rendered band in the same frame, at all three contract cameras,
// day and night — real headless Chrome, real compositor output, and (A3)
// an OBJECT-ID mask so the cast shadow is ground, not character.
//
// Day:   char sat p90 ≤ world sat p99 + margin; day luma ratio in [0.6, 1.4].
// Night: char/world luma p50 ratio within [0.8, 1.6] at EVERY camera.
// Tone (A3): char soft-gradient share ≤ 2× world's; char top-8-of-128 luma
//        bins ≥ 50% (the world quantizes light; the character must step too).
// Accent (A3): pixels above the world base inside the owned hue band ≤ 8%
//        of character pixels (share × saturation budget; defeat J).

import { withPage } from './lib/browser-harness.mjs';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
const MARGIN = 0.02;
const pct = (x) => (x * 100).toFixed(1) + '%';

await withPage('/celbridge.html', async (page) => {
  await page.waitForFunction('!!window.__renderedBand');
  for (const cam of ['meet', 'portrait', 'far']) {
    const day = await page.evaluate((c) => window.__renderedBand(c, 'day'), cam);
    check(`day/${cam}: char sat p90 ≤ world sat p99 (+${MARGIN}) [${day.maskKind} mask]`,
      day.char.satP90 <= day.world.satP99 + MARGIN,
      `char p90 ${day.char.satP90.toFixed(3)} vs world p99 ${day.world.satP99.toFixed(3)} (char px ${day.charPixels})`);
    check(`day/${cam}: char/world luma p50 in [0.6, 1.4]`,
      day.lumRatio >= 0.6 && day.lumRatio <= 1.4, `ratio ${day.lumRatio.toFixed(3)}`);
    console.log(`      tone on the COMPOSITE (reviewer's instrument): char soft ${pct(day.tone.char.softShare)} / top8 ${pct(day.tone.char.top8Share)} vs world soft ${pct(day.tone.world.softShare)} / top8 ${pct(day.tone.world.top8Share)}`);
    const tb = day.toneBeauty;
    check(`day/${cam}: tone (beauty pass, ink+FXAA off) — char soft-gradient share ≤ 2× world`,
      tb.char.softShare <= 2 * tb.world.softShare + 0.005,
      `char ${pct(tb.char.softShare)} vs world ${pct(tb.world.softShare)} (same-bin pairs char ${pct(tb.char.samePairShare)} / world ${pct(tb.world.samePairShare)})`);
    check(`day/${cam}: tone (beauty pass) — char top-8-of-128 luma bins ≥ 50%`,
      tb.char.top8Share >= 0.5, `char ${pct(tb.char.top8Share)} vs world ${pct(tb.world.top8Share)}`);
    check(`day/${cam}: owned-accent budget — hot pixels in the owned band ≤ 8% of char`,
      day.ownedHotShare <= 0.08, pct(day.ownedHotShare));
    const night = await page.evaluate((c) => window.__renderedBand(c, 'night'), cam);
    check(`night/${cam}: char/world luma p50 in [0.8, 1.6]`,
      night.lumRatio >= 0.8 && night.lumRatio <= 1.6,
      `ratio ${night.lumRatio.toFixed(3)} (char ${night.char.lumP50.toFixed(3)} / world ${night.world.lumP50.toFixed(3)})`);
  }
}, { readyExpr: '!!window.__renderedBand' });

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
