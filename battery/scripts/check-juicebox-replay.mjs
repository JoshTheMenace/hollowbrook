#!/usr/bin/env node
// B1 reproducibility gate (A7, campaign rule): a tick-indexed input tape
// replayed at 30 / 60 / 90 / 144 fps and with jittered dt must produce
// byte-identical state at every checkpoint — through the REAL shell in
// headless Chrome. Also the DELIVERED-value rows: realised dash reach at
// every rate must be DASH.len ± 0.05 m (r2: 2.13 m at 30 fps, 3.20 at 60).
import { withPage } from './lib/browser-harness.mjs';
import { DASH, RUN_SECONDS } from '../src/juicebox/rules.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
const seconds = 30;   // half a run is enough for 6 checkpoints and ~50 dashes
const frames = (fps) => Array.from({ length: Math.round(seconds * fps) }, () => 1 / fps);
const jitter = () => { let t = 0; const out = []; let s = 1; while (t < seconds) { s = (s * 16807) % 2147483647; const dt = 1 / 30 + (s / 2147483647) * (1 / 40); out.push(dt); t += dt; } return out; };

await withPage('/juicebox.html', async (page) => {
  await page.waitForFunction('!!window.__drive');
  // 1. record: an EXPERT-noise bot plays at 60 fps render cadence; its
  //    decisions land on sim ticks and go to the tape
  const rec = await page.evaluate((fr) => {
    window.__game.pause(true);
    window.__game.startRun({ record: true, seedOverride: 3 });
    window.__autoplay(true);
    const r = window.__drive(fr);
    window.__autoplay(false);
    return { ...r, tape: window.__game.tape.toJSON() };
  }, frames(60));
  console.log(`recorded: ${rec.ticks} ticks, ${rec.tape.length} inputs, ${rec.checkpoints.length} checkpoints, score ${rec.score}, dropped ${rec.dropped.toFixed(4)}s`);
  check('recording produced checkpoints and inputs', rec.checkpoints.length >= 5 && rec.tape.length > 10);

  // 2. replay at other cadences: byte-identical checkpoints
  const rates = [['30 fps', frames(30)], ['60 fps', frames(60)], ['90 fps', frames(90)], ['144 fps', frames(144)], ['jittered 30-70 fps', jitter()]];
  const reachRows = [];
  for (const [label, fr] of rates) {
    const rep = await page.evaluate((fr, tape) => {
      window.__game.pause(true);
      const { InputTape } = { InputTape: null };
      window.__game.startRun({ replay: { at: (tick) => tape.filter((e) => e.tick === tick).map((e) => e.input) }, seedOverride: 3 });
      return window.__drive(fr);
    }, fr, rec.tape);
    const n = Math.min(rep.checkpoints.length, rec.checkpoints.length);
    let firstDiff = -1;
    for (let i = 0; i < n; i++) if (rep.checkpoints[i].hash !== rec.checkpoints[i].hash) { firstDiff = i; break; }
    check(`replay @ ${label}: ${n} checkpoints byte-identical to the recording`, n >= 5 && firstDiff < 0,
      firstDiff < 0 ? `score ${rep.score} (recorded ${rec.score}), dropped ${rep.dropped.toFixed(4)}s` : `first divergence at checkpoint ${firstDiff} (tick ${rep.checkpoints[firstDiff].tick})`);
    const reach = rep.dashes.length ? [...rep.dashes].sort((a, b) => a - b)[Math.floor(rep.dashes.length / 2)] : 0;
    reachRows.push([label, reach, rep.dashes.length]);
  }
  // 3. delivered values: realised dash reach at every rate
  for (const [label, reach, n] of reachRows) {
    check(`delivered dash reach @ ${label} = ${DASH.len} ± 0.05 m`, Math.abs(reach - DASH.len) <= 0.05, `median ${reach.toFixed(3)} m over ${n} dashes`);
  }
}, { readyExpr: '!!window.__drive', timeout: 60000 });

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
