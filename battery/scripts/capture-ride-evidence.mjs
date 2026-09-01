#!/usr/bin/env node
// B4 evidence: REAL compositor frames through the play camera at the
// contract's beats, from a bot playing the real loop at rAF cadence.
import { withPage } from './lib/browser-harness.mjs';
import fs from 'node:fs';
fs.mkdirSync(new URL('../.shots', import.meta.url), { recursive: true });
const out = (n) => new URL(`../.shots/${n}.png`, import.meta.url).pathname;
const BEATS = [['ride-arrival', 5], ['ride-push1', 30], ['ride-breathe', 50], ['ride-surround', 125], ['ride-climax', 158], ['ride-release', 178]];

await withPage('/ride.html', async (page) => {
  await page.screenshot({ path: out('ride-title') });
  await page.evaluate(() => window.__autoplay(true, 1));
  for (const [name, t] of BEATS) {
    await page.waitForFunction((t) => !window.__ride.ride || window.__ride.ride.time >= t || window.__ride.ride.over, { timeout: 240000, polling: 100 }, t);
    await page.screenshot({ path: out(name) });
    const s = await page.evaluate(() => ({ t: +window.__ride.ride.time.toFixed(1), over: window.__ride.ride.over, kills: window.__ride.ride.run.kills, hp: Math.round(window.__ride.ride.run.stats.hp), intent: +window.__ride.ride.intent.toFixed(2), measured: +window.__ride.ride.measured.toFixed(2) }));
    console.log(name, JSON.stringify(s));
    if (s.over) break;
  }
}, { readyExpr: '!!window.__autoplay', timeout: 60000 });
