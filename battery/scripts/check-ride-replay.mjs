#!/usr/bin/env node
// B4 reproducibility gate (A6, campaign rule): a tick-indexed movement tape
// recorded from the referee bot at 60 fps, replayed at 30 / 60 / 90 / 144
// fps and with jittered dt, must produce byte-identical state at every
// 5-s checkpoint — through the REAL shell in headless Chrome.
import { withPage } from './lib/browser-harness.mjs';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
const seconds = 40;
const frames = (fps) => Array.from({ length: Math.round(seconds * fps) }, () => 1 / fps);
const jitter = () => { let t = 0; const out = []; let s = 7; while (t < seconds) { s = (s * 16807) % 2147483647; const dt = 1 / 30 + (s / 2147483647) * (1 / 40); out.push(dt); t += dt; } return out; };

await withPage('/ride.html', async (page) => {
  await page.waitForFunction('!!window.__drive');
  const rec = await page.evaluate((fr) => { window.__autoplay(true, 5, { record: true }); const r = window.__drive(fr); window.__autoplay(false); return r; }, frames(60));
  console.log(`recorded: ${rec.ticks} ticks, ${rec.tape.length} moves, ${rec.checkpoints.length} checkpoints, kills ${rec.kills}, dropped ${rec.dropped.toFixed(4)}s`);
  check('recording produced checkpoints and moves', rec.checkpoints.length >= 6 && rec.tape.length > 100);
  for (const [label, fr] of [['30 fps', frames(30)], ['60 fps', frames(60)], ['90 fps', frames(90)], ['144 fps', frames(144)], ['jittered 30-70 fps', jitter()]]) {
    const rep = await page.evaluate((fr, tape) => { window.__replay(5, tape); return window.__drive(fr); }, fr, rec.tape);
    const n = Math.min(rep.checkpoints.length, rec.checkpoints.length);
    let firstDiff = -1;
    for (let i = 0; i < n; i++) if (rep.checkpoints[i].hash !== rec.checkpoints[i].hash) { firstDiff = i; break; }
    check(`replay @ ${label}: ${n} checkpoints byte-identical`, n >= 6 && firstDiff < 0,
      firstDiff < 0 ? `kills ${rep.kills} (recorded ${rec.kills}), dropped ${rep.dropped.toFixed(4)}s` : `first divergence at checkpoint ${firstDiff} (tick ${rep.checkpoints[firstDiff].tick})`);
  }
}, { readyExpr: '!!window.__drive', timeout: 60000 });

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
