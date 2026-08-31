#!/usr/bin/env node
// B3 gate: quest-loop integrity for ONE NPC, ONE ERRAND. Headless, exit-coded.
// 1. vocabulary closure (script ⊆ Performer.IMPLEMENTED ⊆ Mira vocabulary)
// 2. phantom-verb probe (in-vocabulary but unimplemented gesture THROWS)
// 3. reference walkthrough completes with the right stage transitions
// 4. save/reload at EVERY step of the walkthrough (the load-bearing one)
// 5. interaction observability: every ok action emits or changes state
// 6. Performer smoke on a real rig skeleton: every scripted gesture moves joints

import { ErrandRun, SCRIPT, LAYOUT, ERRAND_EVENTS } from '../src/errand/rules.js';
import { Performer } from '../../charforge/src/game/performer.js';
import { vocabulary } from '../../src/contract.js';
import { buildSkeleton } from '../../charforge/src/lib/rig.js';
import * as THREE from 'three';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

// ---- 1. vocabulary closure -------------------------------------------------
const scriptGestures = new Set();
for (const lines of Object.values(SCRIPT)) for (const l of lines) scriptGestures.add(l.plan.gesture.name);
const unimplemented = [...scriptGestures].filter((g) => !Performer.IMPLEMENTED.includes(g));
check('script gestures ⊆ Performer.IMPLEMENTED', unimplemented.length === 0, unimplemented.join(',') || `${scriptGestures.size} gestures used`);
const phantoms = Performer.IMPLEMENTED.filter((g) => !vocabulary.gestures.includes(g));
check('Performer.IMPLEMENTED ⊆ Mira vocabulary (no phantoms)', phantoms.length === 0, phantoms.join(',') || `${Performer.IMPLEMENTED.length} implemented`);

// ---- 2. phantom-verb probe -------------------------------------------------
{
  const skel = buildSkeleton();
  const perf = new Performer({ root: skel.root, heading: 0 });
  let threw = false;
  try { perf.direct({ gesture: { name: 'dance', intensity: 0.5 } }); } catch { threw = true; }
  check('unimplemented gesture ("dance") throws', threw);
  let ok = true;
  try { perf.direct({ gesture: { name: 'nod', intensity: 0.5 } }); } catch { ok = false; }
  check('implemented gesture accepted', ok);
}

// ---- walkthrough machinery -------------------------------------------------
// Each step is one player action. Includes the optional beats (reminder talk,
// premature string attempt) so persistence is proven across them too.
const openAndFinish = (run, x, z) => {
  const steps = [() => run.interact(x, z)];
  return steps;
};
function referenceSteps() {
  const at = (p) => [p.x, p.z];
  const [c1, c2, c3] = LAYOUT.candles;
  const s = [];
  const talk = (expectKey) => {
    s.push({ name: `talk:${expectKey}`, act: (r) => r.interact(...at(LAYOUT.npc)) });
    for (let i = 1; i <= SCRIPT[expectKey].length; i++) s.push({ name: `advance:${expectKey}:${i}`, act: (r) => r.advance() });
  };
  talk('intro');                                                        // meet -> find
  s.push({ name: 'string-too-early', act: (r) => r.interact(...at(LAYOUT.string)) });
  s.push({ name: 'pickup:rack', act: (r) => r.interact(...at(c1)) });
  talk('remindFind');                                                   // mid-errand reminder
  s.push({ name: 'pickup:toro', act: (r) => r.interact(...at(c2)) });
  s.push({ name: 'pickup:step', act: (r) => r.interact(...at(c3)) });   // -> relight
  talk('remindRelight');
  s.push({ name: 'relight', act: (r) => r.interact(...at(LAYOUT.string)) }); // -> return
  talk('thanks');                                                       // -> done
  return s;
}
const countingFx = () => { const fx = { n: 0, log: [], emit(e, d) { fx.n++; fx.log.push(e); } }; return fx; };
function completeFrom(run) {
  const at = (p) => [p.x, p.z];
  for (let guard = 0; guard < 200 && !run.done(); guard++) {
    if (run.dialogue) { run.advance(); continue; }
    if (run.stage === 'meet' || run.stage === 'return' || run.stage === 'done') { run.interact(...at(LAYOUT.npc)); continue; }
    if (run.stage === 'find') {
      const next = LAYOUT.candles.find((c) => !run.candles.has(c.id));
      run.interact(next.x, next.z); continue;
    }
    if (run.stage === 'relight') { run.interact(...at(LAYOUT.string)); continue; }
  }
  return run;
}

// ---- 3. reference walkthrough ----------------------------------------------
{
  const fx = countingFx();
  const run = new ErrandRun(fx);
  const stages = [run.stage];
  for (const step of referenceSteps()) { step.act(run); if (stages[stages.length - 1] !== run.stage) stages.push(run.stage); }
  check('walkthrough completes', run.done(), `stages: ${stages.join(' → ')}`);
  check('stage order exact', stages.join(',') === 'meet,find,relight,return,done');
  check('3 candles + lit', run.candles.size === 3 && run.lit);
  const expected = ['quest-accept', 'string-dark', 'candle-pickup', 'lanterns-lit', 'quest-complete'];
  const missing = expected.filter((e) => !fx.log.includes(e));
  check('all quest events fired', missing.length === 0, missing.join(',') || `${fx.n} events`);
  const undeclared = [...new Set(fx.log)].filter((e) => !ERRAND_EVENTS.includes(e));
  check('no undeclared events', undeclared.length === 0, undeclared.join(','));
}

// ---- 4. save/reload at EVERY step ------------------------------------------
{
  const steps = referenceSteps();
  let bad = null;
  for (let k = 0; k <= steps.length; k++) {
    const run = new ErrandRun(countingFx());
    for (let i = 0; i < k; i++) steps[i].act(run);
    while (run.dialogue) run.advance();          // shell never saves mid-line
    const snap = JSON.parse(JSON.stringify(run.serialize()));
    const fork = ErrandRun.restore(snap, countingFx());
    if (JSON.stringify(fork.serialize()) !== JSON.stringify(snap)) { bad = `step ${k} (${steps[k - 1]?.name ?? 'start'}): round-trip drift`; break; }
    completeFrom(fork);
    if (!fork.done() || fork.candles.size !== 3 || !fork.lit) { bad = `step ${k} (${steps[k - 1]?.name ?? 'start'}): fork did not complete`; break; }
  }
  check(`save/reload at every step (${steps.length + 1} forks)`, !bad, bad ?? 'all forks completed');
}

// ---- 5. interaction observability ------------------------------------------
{
  const fx = countingFx();
  const run = new ErrandRun(fx);
  let silent = null;
  for (const step of referenceSteps()) {
    const before = JSON.stringify(run.serialize());
    const n0 = fx.n;
    const res = step.act(run);
    if (res?.ok && fx.n === n0 && JSON.stringify(run.serialize()) === before) { silent = step.name; break; }
  }
  check('every ok action is observable (event or state delta)', !silent, silent ?? 'no silent successes');
}

// ---- 6. Performer smoke on the real rig ------------------------------------
{
  const watched = ['head', 'spine', 'upperArmR', 'forearmR', 'shoulderL', 'shoulderR'];
  let dead = [];
  for (const g of scriptGestures) {
    const skel = buildSkeleton();
    const base = watched.map((n) => skel.root.getObjectByName(n).rotation.toArray().slice(0, 3));
    const perf = new Performer({ root: skel.root, heading: 0 });
    perf.direct({ gesture: { name: g, intensity: 0.8 }, posture: 'neutral' });
    perf.update(0.3);
    const moved = watched.some((n, i) => {
      const r = skel.root.getObjectByName(n).rotation;
      return Math.abs(r.x - base[i][0]) + Math.abs(r.y - base[i][1]) + Math.abs(r.z - base[i][2]) > 1e-4;
    });
    if (!moved) dead.push(g);
  }
  check('every scripted gesture moves rig joints', dead.length === 0, dead.join(',') || [...scriptGestures].join(','));
  // gaze smoke: head tracks a world target
  const skel = buildSkeleton();
  const perf = new Performer({ root: skel.root, heading: 0 });
  perf.lookAt(new THREE.Vector3(3, 1.5, 3));
  perf.update(0.1);
  check('gaze turns the head', Math.abs(skel.root.getObjectByName('head').rotation.y) > 0.05);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
