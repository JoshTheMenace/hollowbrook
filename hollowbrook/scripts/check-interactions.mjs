#!/usr/bin/env node
/**
 * Interaction gate: REGISTRATION IS NOT AN INTERACTION.  Every registered
 * interactable must demonstrate an observable effect at its own site.
 * Forked from nightbloom (its history: "Feed the koi" registered at world
 * origin, look-stall actions that changed nothing).
 *
 * Method: build the city TWICE (deterministic, seeded).  One scene is the
 * control, one the treatment; both step in lockstep.  For each interactable,
 * fire its action on the treatment only, step both 45 frames, then diff
 * object state (position/quaternion/scale/visibility) pair-by-pair.  A
 * change only counts within EFFECT_RADIUS of the registered position (the
 * position the runtime's proximity/raycast prompt uses).  Objects already
 * differing before the action (a leaky reset from an earlier test) are
 * excluded, so one interaction's leak cannot masquerade as another's effect.
 *
 *   node scripts/check-interactions.mjs
 */
import { installDomStub, makeChecker } from './lib/headless.mjs';

const EFFECT_RADIUS = 8;
const SETTLE_FRAMES = 45;
const DT = 1 / 60;
const { check, finish } = makeChecker();

try {
  installDomStub();
  const THREE = await import('three');
  const { buildVignette } = await import('../src/scene.js');
  const sceneC = new THREE.Scene();
  const control = buildVignette(sceneC, { only: null });
  const sceneT = new THREE.Scene();
  const treat = buildVignette(sceneT, { only: null });
  sceneC.updateMatrixWorld(true);
  sceneT.updateMatrixWorld(true);
  const plan = treat.plan;
  const flatten = (s) => { const out = []; s.traverse((o) => out.push(o)); return out; };
  const objsC = flatten(sceneC);
  const objsT = flatten(sceneT);
  if (objsC.length !== objsT.length) {
    console.error(`scene builds disagree (${objsC.length} vs ${objsT.length} objects) — the build is not deterministic; this gate cannot diff`);
    process.exit(2);
  }
  const districts = new Map(plan.districts.map((d) => [d.id, d]));
  const stepBoth = (n) => { for (let i = 0; i < n; i++) { control.update(DT); treat.update(DT); } sceneC.updateMatrixWorld(true); sceneT.updateMatrixWorld(true); };
  const snap = (objs) => objs.map((o) => [o.position.x, o.position.y, o.position.z, o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w, o.scale.x, o.scale.y, o.scale.z, o.visible ? 1 : 0]);
  const differs = (a, b, j) => { for (let k = 0; k < 11; k++) if (Math.abs(a[j][k] - b[j][k]) > 1e-4) return true; return false; };
  const _box = new THREE.Box3();
  const _ctr = new THREE.Vector3();

  console.log(`${treat.interactables.length} registered interactables`);
  // every PLAN interaction must be registered by its district (by name or label)
  for (const d of plan.districts) {
    for (const it of d.interactions ?? []) {
      const reg = treat.interactables.find((r) => r.owner === d.id && (r.name === it.name || r.label === it.name || (r.label ?? '').toLowerCase().includes(it.name.toLowerCase())));
      check(`interact:${d.id}:"${it.name}":registered`, !!reg, reg ? `registered as "${reg.name ?? reg.label}"` : `declared in the plan at (${it.at}) and NOT registered by ${d.id}`);
    }
  }
  for (let i = 0; i < treat.interactables.length; i++) {
    const it = treat.interactables[i];
    const name = it.name ?? it.label ?? `#${i}`;
    const wp = new THREE.Vector3();
    it.hitbox.getWorldPosition(wp);
    const d = districts.get(it.owner);
    const placed = d && wp.x >= d.envelope.x0 && wp.x <= d.envelope.x1 && wp.z >= d.envelope.z0 && wp.z <= d.envelope.z1;
    check(`interact:${name}:placed`, !!placed, `registered at (${wp.x.toFixed(1)}, ${wp.z.toFixed(1)})${placed ? ` in ${it.owner}` : ` — OUTSIDE owner district "${it.owner}"`}`);
    if (typeof it.action !== 'function') { check(`interact:${name}:effect`, false, 'no action function registered'); continue; }
    const preC = snap(objsC);
    const preT = snap(objsT);
    it.action();
    stepBoth(SETTLE_FRAMES);
    const a = snap(objsC);
    const b = snap(objsT);
    let near = 0, far = 0;
    const farWhere = [];
    for (let j = 0; j < a.length; j++) {
      if (differs(preC, preT, j)) continue;
      if (!differs(a, b, j)) continue;
      _box.setFromObject(objsT[j]);
      const c = _box.isEmpty() ? objsT[j].getWorldPosition(_ctr) : _box.getCenter(_ctr);
      const dist = Math.hypot(c.x - wp.x, c.z - wp.z);
      if (dist <= EFFECT_RADIUS) near++;
      else { far++; if (farWhere.length < 3) farWhere.push(`"${objsT[j].name || '(unnamed)'}" ${dist.toFixed(0)} m away`); }
    }
    check(`interact:${name}:effect`, near > 0, near > 0 ? `${near} object${near === 1 ? '' : 's'} changed within ${EFFECT_RADIUS} m of the prompt site` : far > 0 ? `NOTHING changed within ${EFFECT_RADIUS} m — the only effect is elsewhere: ${farWhere.join('; ')}` : `E does NOTHING — zero observable state change anywhere after ${SETTLE_FRAMES} frames`);
    treat.reset();
    stepBoth(2);
  }
  finish('RESULT');
} catch (error) {
  console.error('[check-interactions] crashed before checking:', error);
  process.exit(2);
}
