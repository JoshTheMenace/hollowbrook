#!/usr/bin/env node
// B1 evidence set as REAL compositor frames through the play camera: a
// noisy bot plays the actual loop at rAF cadence; the harness waits for
// named feel events and screenshots the moment (particles + text + HUD).
import { withPage } from './lib/browser-harness.mjs';
import fs from 'node:fs';
fs.mkdirSync(new URL('../.shots', import.meta.url), { recursive: true });
const out = (n) => new URL(`../.shots/${n}.png`, import.meta.url).pathname;

await withPage('/juicebox.html', async (page) => {
  await page.screenshot({ path: out('jb2-title') });
  await page.evaluate(() => { window.__game.seedSet(3); });
  await page.keyboard.press('KeyD');                 // starts the run (real input path)
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: out('jb2-open') });
  await page.evaluate(() => window.__autoplay(true));
  const waitEvent = async (name, pred = 'true', timeout = 40000) => {
    const n0 = await page.evaluate(() => window.__game.feel.log.length);
    await page.waitForFunction((name, n0, pred) => {
      const log = window.__game.feel.log;
      for (let i = n0; i < log.length; i++) if (log[i].event === name) return true;
      return false;
    }, { timeout, polling: 16 }, name, n0, pred).catch(() => console.log(`(no ${name} within ${timeout}ms)`));
  };
  await waitEvent('multi-pop');
  await page.screenshot({ path: out('jb2-multipop') });
  await waitEvent('oni-telegraph');
  await new Promise((r) => setTimeout(r, 200));      // mid wind-up
  await page.screenshot({ path: out('jb2-telegraph') });
  await page.waitForFunction(() => window.__game.run?.spirits.some((s) => s.gold), { timeout: 40000, polling: 50 }).catch(() => {});
  await page.screenshot({ path: out('jb2-gold-live') });
  await page.waitForFunction(() => window.__game.feel.log.some((e) => e.event === 'final-10s'), { timeout: 70000, polling: 100 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: out('jb2-final10') });
  await page.waitForFunction(() => window.__game.run?.over, { timeout: 20000, polling: 100 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: out('jb2-score') });
  const stats = await page.evaluate(() => window.__game.run.stats());
  console.log('autoplay run stats:', JSON.stringify(stats));
}, { readyExpr: '!!window.__autoplay' });
