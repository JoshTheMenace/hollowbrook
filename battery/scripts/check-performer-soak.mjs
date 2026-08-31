#!/usr/bin/env node
// Performer soak gate (B3 review r1): 60 seconds of scripted performance —
// every implemented verb, every posture, gaze on/off — on a REAL actor with
// the mixer running. Asserts every joint stays bounded throughout AND ends
// back at rest. A single-step gate cannot see an integrator; this one can.

import * as THREE from 'three';
import { Actor } from '../../charforge/src/game/actor.js';
import { Performer } from '../../charforge/src/game/performer.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const actor = await Actor.spawn('ronin', {});
const performer = new Performer(actor);   // construct before first update
// control: an identical actor stepped identically with NO performer — the
// residue test compares against what the mixer alone would have produced
// (comparing against the build pose flags the idle pose itself as drift)
const control = await Actor.spawn('ronin', {});
const joints = [...performer.rest.keys()];

const verbs = Performer.IMPLEMENTED.filter((v) => v !== 'none');
const postures = ['neutral', 'lean_in', 'lean_back'];
const gaze = new THREE.Vector3(2, 1.5, 3);
const DT = 1 / 60;
let maxAngle = 0, worst = '';
let boundedFail = null;

let t = 0, verbIdx = 0;
const TOTAL = 60;
while (t < TOTAL) {
  // every ~1.7s: next verb (cycles all 11 several times), rotate posture,
  // toggle gaze — the messy overlapping schedule a real conversation has
  if (t === 0 || (t % 1.7) < DT) {
    const verb = t > TOTAL - 3 ? 'none' : verbs[verbIdx++ % verbs.length];
    performer.direct({
      gesture: { name: verb, intensity: 0.4 + 0.6 * ((verbIdx * 7) % 10) / 10 },
      posture: t > TOTAL - 3 ? 'neutral' : postures[verbIdx % postures.length],
    });
    performer.lookAt(verbIdx % 3 === 0 ? null : gaze);
  }
  actor.update(DT);
  performer.update(DT);
  control.update(DT);
  for (const n of joints) {
    const r = performer.j[n].rotation;
    const mag = Math.max(Math.abs(r.x), Math.abs(r.y), Math.abs(r.z));
    if (mag > maxAngle) { maxAngle = mag; worst = n; }
    if (mag > Math.PI && !boundedFail) boundedFail = `${n} reached ${mag.toFixed(2)} rad at t=${t.toFixed(1)}s`;
  }
  t += DT;
}
check('every joint bounded through 60s (max < π rad)', !boundedFail, boundedFail ?? `max |rot| ${maxAngle.toFixed(2)} rad (${worst})`);

// settle: 2 more seconds of 'none', neutral, no gaze
performer.direct({ gesture: { name: 'none' }, posture: 'neutral' });
performer.lookAt(null);
for (let i = 0; i < 120; i++) { actor.update(DT); performer.update(DT); control.update(DT); }
let worstDrift = 0, driftJoint = '';
for (const n of joints) {
  const drift = performer.j[n].quaternion.angleTo(control.root.getObjectByName(n).quaternion);
  if (drift > worstDrift) { worstDrift = drift; driftJoint = n; }
}
check('back at rest after the performance (±0.02 rad vs control actor)', worstDrift < 0.02, `worst residue ${worstDrift.toFixed(4)} rad (${driftJoint})`);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
