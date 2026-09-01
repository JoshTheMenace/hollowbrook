#!/usr/bin/env node
// Performer SHAPE gate (B3 review r2): a Performer playing every verb
// backwards passed bounded/at-rest/moves-joints. This checks the SIGNED
// direction of each verb at its envelope peak against Performer.SHAPE,
// measured as the delta from a control actor stepped identically with no
// performer (so the mixer's own idle pose is not mistaken for a gesture).
// Also: blend-out — a line advance mid-envelope must not snap any joint
// more than 0.35 rad in one frame (r2 measured a 126° single-frame snap).

import { Actor } from '../../charforge/src/game/actor.js';
import { Performer, SHAPE } from '../../charforge/src/game/performer.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
const DT = 1 / 60;

for (const verb of Performer.IMPLEMENTED.filter((v) => v !== 'none')) {
  const actor = await Actor.spawn('ronin', {});
  const perf = new Performer(actor);
  const control = await Actor.spawn('ronin', {});
  for (let i = 0; i < 30; i++) { actor.update(DT); perf.update(DT); control.update(DT); }   // settle the mixer
  perf.direct({ gesture: { name: verb, intensity: 0.8 }, posture: 'neutral' });
  const dur = perf.current.dur;
  const steps = Math.round((dur * 0.5) / DT);          // the envelope peak
  for (let i = 0; i < steps; i++) { actor.update(DT); perf.update(DT); control.update(DT); }
  const rules = SHAPE[verb];
  check(`shape table covers "${verb}"`, !!rules);
  if (!rules) continue;
  const bad = [];
  for (const [joint, axis, sign] of rules) {
    const d = perf.j[joint].rotation[axis] - control.root.getObjectByName(joint).rotation[axis];
    const ok = sign === 'alt' ? Math.abs(d) > 0.03 : Math.sign(d) === sign && Math.abs(d) > 0.03;
    if (!ok) bad.push(`${joint}.${axis} Δ${d.toFixed(3)} (want ${sign === 'alt' ? '≠0' : sign > 0 ? '+' : '−'})`);
  }
  check(`"${verb}" moves in its signed direction at the peak`, bad.length === 0, bad.join('; ') || rules.map(([j, a, s]) => `${j}.${a}${s === 'alt' ? '±' : s > 0 ? '+' : '−'}`).join(' '));
}

// blend-out: advance a line mid-wave (the r2 case) and watch per-frame deltas
{
  const actor = await Actor.spawn('ronin', {});
  const perf = new Performer(actor);
  for (let i = 0; i < 30; i++) { actor.update(DT); perf.update(DT); }
  perf.direct({ gesture: { name: 'wave', intensity: 0.9 } });
  for (let i = 0; i < 40; i++) { actor.update(DT); perf.update(DT); }   // 0.67 s into a 1.8 s wave (arm up)
  const before = perf.j.upperArmR.rotation.z;
  perf.direct({ gesture: { name: 'nod', intensity: 0.6 } });           // the next line lands
  let worst = 0, prev = before;
  for (let i = 0; i < 20; i++) {
    actor.update(DT); perf.update(DT);
    const now = perf.j.upperArmR.rotation.z;
    worst = Math.max(worst, Math.abs(now - prev));
    prev = now;
  }
  check('blend-out: max single-frame upperArmR delta on a mid-wave line advance ≤ 0.35 rad', worst <= 0.35, `${worst.toFixed(3)} rad/frame (arm was at ${before.toFixed(2)} rad)`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
