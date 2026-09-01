#!/usr/bin/env node
// B3 shell gate (round 3): exercises the SHELL's own save path in a real
// headless Chrome and reads the actual localStorage it wrote; asserts ON
// THE FRAMES it captures. Review r2: the round-2 gate passed "string lit"
// from a state flag while its own screenshot contained no lantern.
// Core assertions:
//   - continuous play == post-reload at every checkpoint, after a WALK
//     between the save and the reload (equality must be able to fail)
//   - the relight payoff is VISIBLE from the interaction spot through the
//     play camera: lantern-glow ID-pass share of the captured frame >= 0.5%
//   - corrupt quest AND corrupt player payloads yield a live fresh run
// Evidence set (A0): er3-open, er3-meet, er3-reload, er3-relit, er3-done.

import { withPage } from './lib/browser-harness.mjs';
import fs from 'node:fs';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
fs.mkdirSync(new URL('../.shots', import.meta.url), { recursive: true });
const shotPath = (n) => new URL(`../.shots/${n}.png`, import.meta.url).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await withPage('/errand.html', async (page) => {
  const ready = '!!window.__errand';
  const snap = () => page.evaluate(() => ({
    stage: window.__errand.run.stage,
    tracker: document.querySelector('#trackline').textContent,
    candlesVisible: window.__errand.candlesVisible().sort(),
    lit: window.__errand.stringLit(),
    player: [window.__errand.hero.position.x, window.__errand.hero.position.z].map((n) => +n.toFixed(1)),
    storage: JSON.parse(localStorage.getItem('b3-errand-v1') ?? 'null'),
  }));
  const walkTo = (x, z) => page.evaluate((x, z) => { window.__errand.hero.position.set(x, 0, z); }, x, z);
  const pressE = async (times = 1) => {
    for (let i = 0; i < times; i++) { await page.keyboard.press('KeyE'); await sleep(90); }
  };
  const dialogueDone = async () => {
    for (let i = 0; i < 30 && await page.evaluate(() => !!window.__errand.run.dialogue); i++) await pressE();
  };
  // WALK 3 m, let the continuous save land, reload, compare — including position
  const walkReloadCompare = async (label) => {
    const s0 = await snap();
    await walkTo(s0.player[0] + 3, s0.player[1]);
    await sleep(800);                                   // > 0.5 s save interval + the idle edge
    const before = await snap();
    check(`walked 3 m before the reload @ ${label} (save caught it)`, Math.abs(before.storage?.player?.[0] - (s0.player[0] + 3)) < 0.2,
      `saved x ${before.storage?.player?.[0]?.toFixed?.(1)} vs walked-to ${(s0.player[0] + 3).toFixed(1)}`);
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForFunction(ready);
    const after = await snap();
    const same = JSON.stringify({ ...before, storage: 0 }) === JSON.stringify({ ...after, storage: 0 });
    check(`continuous == post-reload @ ${label} (incl. position)`, same,
      same ? `stage ${after.stage}, candles ${after.candlesVisible.join('/') || 'none'}, lit ${after.lit}, at ${after.player.join(',')}` : `before ${JSON.stringify(before)} after ${JSON.stringify(after)}`);
  };

  await page.evaluate(() => localStorage.removeItem('b3-errand-v1'));
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(ready);
  await page.screenshot({ path: shotPath('er3-open') });

  // MEET -> accept (real keydown path; assertions DURING continuous play)
  await walkTo(1.8, -1.6);
  await pressE();
  await sleep(500);
  await page.screenshot({ path: shotPath('er3-meet') });
  await dialogueDone();
  let s = await snap();
  check('at accept: stage find, tracker live, 3 candles visible, save says find',
    s.stage === 'find' && s.tracker.includes('0/3') && s.candlesVisible.length === 3 && s.storage?.run?.stage === 'find',
    `stage ${s.stage}, tracker "${s.tracker}", candles ${s.candlesVisible.length}, save.stage ${s.storage?.run?.stage}`);

  await walkTo(-5.2, -1.6);
  await pressE();
  s = await snap();
  check('after pickup: tracker 1/3 immediately, candle gone, save has it',
    s.tracker.includes('1/3') && s.candlesVisible.length === 2 && s.storage?.run?.candles?.length === 1,
    `tracker "${s.tracker}", visible ${s.candlesVisible.join(',')}, saved ${JSON.stringify(s.storage?.run?.candles)}`);
  await walkReloadCompare('mid-errand (1/3 candles)');
  await page.screenshot({ path: shotPath('er3-reload') });

  // remaining candles; then the relight FROM THE INTERACTION SPOT, facing away
  // from the string (the worst case the staging must cover)
  await walkTo(4.8, 0.8); await pressE();
  await walkTo(-0.8, -3.6); await pressE();
  await walkTo(-1.0, 0.2);
  await page.evaluate(() => { window.__errand.hero.camYaw = Math.PI; });   // looking away
  await pressE();
  await sleep(700);                                   // the staged hold swings the camera
  const share = await page.evaluate(() => window.__lanternPixelShare());
  await page.screenshot({ path: shotPath('er3-relit') });
  s = await snap();
  check('relight: string lit in-world and in-save', s.lit && s.storage?.run?.lit === true, `lit ${s.lit}`);
  check('relight PAYOFF VISIBLE from the interaction spot: lantern-glow pixels ≥ 0.5% of the captured frame',
    share >= 0.005, `${(share * 100).toFixed(2)}% of the frame (ID pass, play camera, camera was facing away before the press)`);
  await sleep(1200);                                  // hold ends, control returns
  check('camera hold released', !(await page.evaluate(() => window.__errand.holding)));
  await walkReloadCompare('after relight');

  // return; bow; done
  await walkTo(1.8, -1.6);
  await pressE();
  await pressE(3);
  await sleep(600);
  await page.screenshot({ path: shotPath('er3-done') });
  await dialogueDone();
  s = await snap();
  check('errand done and saved done', s.stage === 'done' && s.storage?.run?.stage === 'done', `stage ${s.stage}`);
  await walkReloadCompare('after completion');

  // truthful string after completion
  await walkTo(-1.0, 0.2);
  await pressE();
  const lastEvents = await page.evaluate(() => window.__errand.feel.log.slice(-2).map((e) => e.event));
  check('burning string reports glow, never dark', lastEvents.includes('string-glow') && !lastEvents.includes('string-dark'), lastEvents.join(','));

  // corrupt saves: quest payload, player payload, and a semantic contradiction
  const corrupt = async (label, payload, expectStage) => {
    await page.evaluate((p) => localStorage.setItem('b3-errand-v1', JSON.stringify(p)), payload);
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForFunction(ready, { timeout: 10000 }).catch(() => {});
    const r = await page.evaluate(() => window.__errand ? { stage: window.__errand.run.stage, x: window.__errand.hero.position.x, ok: Number.isFinite(window.__errand.hero.position.x) && !!window.__errand.run.affordanceAt } : null);
    check(`corrupt save (${label}) -> live run at stage ${expectStage}`, !!r && r.ok && r.stage === expectStage, r ? `stage ${r.stage}, x ${r.x}` : 'SHELL CRASHED');
  };
  await corrupt('bogus stage', { v: 1, run: { v: 1, stage: 'bogus', candles: ['nope'] } }, 'meet');
  await corrupt('done + lit:false', { v: 1, run: { v: 1, stage: 'done', candles: ['rack', 'toro', 'step'], lit: false } }, 'meet');
  await corrupt('player strings', { v: 1, run: { v: 1, stage: 'find', candles: ['rack'], lit: false }, player: ['a', 'b', 'c'], yaw: 'x' }, 'find');
  await corrupt('player NaN', { v: 1, run: { v: 1, stage: 'find', candles: ['rack'], lit: false }, player: [NaN, 0, 1e9], yaw: Infinity }, 'find');

  await page.evaluate(() => localStorage.removeItem('b3-errand-v1'));
});

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
