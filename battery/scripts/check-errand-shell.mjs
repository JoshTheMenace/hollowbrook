#!/usr/bin/env node
// B3 shell gate: exercises the SHELL's own save path in a real headless
// Chrome and reads the actual localStorage it wrote. Review r1: the 18-fork
// gate called run.serialize() itself, so the one state the shell failed to
// persist was invisible to it by construction — this gate closes that.
// Core assertion: continuous play == post-reload at every checkpoint
// ("the game must never be more correct after a hard reload").
// Also captures the bundle's evidence as REAL compositor frames
// (page.screenshot), through the play camera only.

import { withPage } from './lib/browser-harness.mjs';
import fs from 'node:fs';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
fs.mkdirSync(new URL('../.shots', import.meta.url), { recursive: true });
const shotPath = (n) => new URL(`../.shots/${n}.png`, import.meta.url).pathname;

await withPage('/errand.html', async (page) => {
  const ready = '!!window.__errand';
  const snap = () => page.evaluate(() => ({
    stage: window.__errand.run.stage,
    tracker: document.querySelector('#trackline').textContent,
    candlesVisible: window.__errand.candlesVisible().sort(),
    lit: window.__errand.stringLit(),
    player: [window.__errand.hero.position.x, window.__errand.hero.position.z].map((n) => +n.toFixed(2)),
    storage: JSON.parse(localStorage.getItem('b3-errand-v1') ?? 'null'),
  }));
  const walkTo = (x, z) => page.evaluate((x, z) => { window.__errand.hero.position.set(x, 0, z); }, x, z);
  const pressE = async (times = 1) => {
    for (let i = 0; i < times; i++) { await page.keyboard.press('KeyE'); await new Promise((r) => setTimeout(r, 90)); }
  };
  const dialogueDone = async () => {
    for (let i = 0; i < 30 && await page.evaluate(() => !!window.__errand.run.dialogue); i++) await pressE();
  };
  const reloadAndCompare = async (label) => {
    const before = await snap();
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForFunction(ready);
    const after = await snap();
    const same = JSON.stringify({ ...before, storage: 0 }) === JSON.stringify({ ...after, storage: 0 });
    check(`continuous == post-reload @ ${label}`, same,
      same ? `stage ${after.stage}, candles ${after.candlesVisible.join('/') || 'none'}, lit ${after.lit}` : `before ${JSON.stringify(before)} after ${JSON.stringify(after)}`);
  };

  await page.evaluate(() => localStorage.removeItem('b3-errand-v1'));
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(ready);

  // opening frame is evidence for the spawn fix (play camera, real frame)
  await page.screenshot({ path: shotPath('er2-open') });

  // MEET -> accept (real keydown path; assertions DURING continuous play)
  await walkTo(1.8, -1.6);
  await pressE();                       // open dialogue
  await page.screenshot({ path: shotPath('er2-meet') });
  await dialogueDone();                 // through intro -> accept
  let s = await snap();
  check('at accept: stage find, tracker live, 3 candles visible, save says find (the r1 ordering bug)',
    s.stage === 'find' && s.tracker.includes('0/3') && s.candlesVisible.length === 3 && s.storage?.run?.stage === 'find',
    `stage ${s.stage}, tracker "${s.tracker}", candles ${s.candlesVisible.length}, save.stage ${s.storage?.run?.stage}`);

  // first candle, then THE hard reload
  await walkTo(-5.2, -1.6);
  await pressE();
  s = await snap();
  check('after pickup: tracker 1/3 immediately, candle gone, save has it',
    s.tracker.includes('1/3') && s.candlesVisible.length === 2 && s.storage?.run?.candles?.length === 1,
    `tracker "${s.tracker}", visible ${s.candlesVisible.join(',')}, saved ${JSON.stringify(s.storage?.run?.candles)}`);
  await reloadAndCompare('mid-errand (1/3 candles)');
  await page.screenshot({ path: shotPath('er2-reload') });

  // finish candles; relight watched from the interaction spot
  await walkTo(4.8, 0.8); await pressE();
  await walkTo(-0.8, -3.6); await pressE();
  await walkTo(-1.0, 0.2);              // stand at the string, facing it
  await page.evaluate(() => { window.__errand.hero.camYaw = 0; });   // forward = (-sin, -cos) -> -z
  await pressE();
  s = await snap();
  check('relight: string lit in-world and in-save', s.lit && s.storage?.run?.lit === true, `lit ${s.lit}`);
  await new Promise((r) => setTimeout(r, 350));   // flash + bursts mid-air
  await page.screenshot({ path: shotPath('er2-relit') });
  await reloadAndCompare('after relight');

  // return; bow; done
  await walkTo(1.8, -1.6);
  await pressE();
  await pressE(3);                      // into the bow line
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: shotPath('er2-done') });
  await dialogueDone();
  s = await snap();
  check('errand done and saved done', s.stage === 'done' && s.storage?.run?.stage === 'done', `stage ${s.stage}`);
  await reloadAndCompare('after completion');

  // truthful string: interacting with the burning string must not say dark
  await walkTo(-1.0, 0.2);
  await pressE();
  const lastEvents = await page.evaluate(() => window.__errand.feel.log.slice(-2).map((e) => e.event));
  check('burning string reports glow, never dark', lastEvents.includes('string-glow') && !lastEvents.includes('string-dark'), lastEvents.join(','));

  // corrupt save must yield a fresh run, not a bricked shell
  await page.evaluate(() => localStorage.setItem('b3-errand-v1', JSON.stringify({ v: 1, run: { v: 1, stage: 'bogus', candles: ['nope'] } })));
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(ready, { timeout: 10000 }).catch(() => {});
  const fresh = await page.evaluate(() => window.__errand?.run.stage ?? 'CRASHED');
  check('corrupt save -> fresh run, shell alive', fresh === 'meet', `stage ${fresh}`);

  await page.evaluate(() => localStorage.removeItem('b3-errand-v1'));
});

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
