#!/usr/bin/env node
// B2 evidence set as REAL compositor frames (page.screenshot) — never a
// hand-drawn composite. Look review: free contract cameras are allowed.
import { withPage } from './lib/browser-harness.mjs';
import fs from 'node:fs';
fs.mkdirSync(new URL('../.shots', import.meta.url), { recursive: true });
const out = (n) => new URL(`../.shots/${n}.png`, import.meta.url).pathname;
const SET = [
  ['cb3-meet', 'meet', 'day', true], ['cb3-portrait', 'portrait', 'day', true], ['cb3-far', 'far', 'day', true],
  ['cb3-ab-raw', 'meet', 'day', false], ['cb3-portrait-raw', 'portrait', 'day', false],
  ['cb3-night-meet', 'meet', 'night', true], ['cb3-night-portrait', 'portrait', 'night', true],
  ['cb3-night-meet-raw', 'meet', 'night', false],
];
await withPage('/celbridge.html', async (page) => {
  for (const [name, cam, phase, on] of SET) {
    await page.evaluate((c, p, o) => window.__frame(c, p, o), cam, phase, on);
    await new Promise((r) => setTimeout(r, 120));
    await page.screenshot({ path: out(name) });
    console.log('captured', name);
  }
}, { readyExpr: '!!window.__frame' });
