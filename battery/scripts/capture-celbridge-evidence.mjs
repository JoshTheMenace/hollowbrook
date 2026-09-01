#!/usr/bin/env node
// B2 evidence set as REAL compositor frames (page.screenshot) — never a
// hand-drawn composite. Look review: free contract cameras are allowed.
import { withPage } from './lib/browser-harness.mjs';
import fs from 'node:fs';
fs.mkdirSync(new URL('../.shots', import.meta.url), { recursive: true });
const out = (n) => new URL(`../.shots/${n}.png`, import.meta.url).pathname;
// A3 declared set
const SET = [
  ['cb4-meet', 'meet', 'day', true], ['cb4-portrait', 'portrait', 'day', true], ['cb4-far', 'far', 'day', true],
  ['cb4-side-day', 'side', 'day', true], ['cb4-face', 'face', 'day', true],
  ['cb4-night-meet', 'meet', 'night', true], ['cb4-night-portrait', 'portrait', 'night', true],
  ['cb4-side-day-raw', 'side', 'day', false],
];
await withPage('/celbridge.html', async (page) => {
  for (const [name, cam, phase, on] of SET) {
    await page.evaluate((c, p, o) => window.__frame(c, p, o), cam, phase, on);
    await new Promise((r) => setTimeout(r, 120));
    await page.screenshot({ path: out(name) });
    console.log('captured', name);
  }
}, { readyExpr: '!!window.__frame' });
