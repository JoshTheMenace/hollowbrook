#!/usr/bin/env node
/**
 * Interaction gate: REGISTRATION IS NOT AN INTERACTION. Every registered
 * interactable must demonstrate an observable effect at its own site.
 *
 * Method: build the city TWICE (deterministic, seeded). One scene is the
 * control, one the treatment; both step in lockstep so ambient animation is
 * identical. For each interactable, fire its action on the treatment only,
 * step both 45 frames, then diff object state (position/quaternion/scale/
 * visibility) pair-by-pair. A change only counts if it happens within
 * EFFECT_RADIUS of the interactable's registered position — the position the
 * runtime's proximity prompt uses (hitbox.getWorldPosition). Change location
 * is the changed object's Box3 centre, because baked-geometry meshes carry
 * their world position in the geometry, not the object origin.
 *
 * This catches, mechanically:
 *   - a no-op action (nothing changes anywhere);
 *   - an interactable registered away from its own effect ("Feed the koi"
 *     registered at world origin while the koi swim 44 m away);
 *   - a hitbox whose registered position is outside its owner district.
 *
 *   node scripts/check-interactions.mjs
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EFFECT_RADIUS = 8;      // m: the effect must be visible from where you stand
const SETTLE_FRAMES = 45;     // 0.75 s at 60 — mid-animation for every current effect
const DT = 1 / 60;

function installDomStub() {
  const anything = new Proxy(function () {}, {
    get(t, p) {
      if (p === Symbol.toPrimitive) return () => 0;
      if (p === 'width' || p === 'height') return 10;
      if (p === 'then') return undefined;
      return anything;
    },
    apply: () => anything,
    construct: () => anything,
    set: () => true,
    has: () => true,
  });
  const makeCanvas = () => ({ width: 0, height: 0, style: {}, getContext: () => anything, toDataURL: () => 'data:', addEventListener() {} });
  globalThis.self ??= globalThis;
  globalThis.document ??= {
    createElement: (tag) => (tag === 'canvas' ? makeCanvas() : { style: {}, addEventListener() {}, appendChild() {} }),
    createElementNS: () => makeCanvas(),
    body: { appendChild() {} },
    addEventListener() {},
  };
  globalThis.window ??= globalThis;
  globalThis.location ??= { search: '' };
  globalThis.navigator ??= { userAgent: 'node' };
  globalThis.addEventListener ??= () => {};
  globalThis.requestAnimationFrame ??= () => 0;
}

const checks = [];
const check = (id, pass, note) => checks.push({ id, pass, note });

installDomStub();
const server = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { default: plan } = await server.ssrLoadModule('/city-plan.json');
  const { THREE: three } = await server.ssrLoadModule('/src/game/three-export.js');
  const scenejs = await server.ssrLoadModule('/src/scene.js');

  const sceneC = new three.Scene();
  const control = scenejs.buildVignette(sceneC, { only: null });
  const sceneT = new three.Scene();
  const treat = scenejs.buildVignette(sceneT, { only: null });
  sceneC.updateMatrixWorld(true);
  sceneT.updateMatrixWorld(true);

  // pair every object by traversal order — two seeded builds are identical
  const flatten = (s) => { const out = []; s.traverse((o) => out.push(o)); return out; };
  const objsC = flatten(sceneC);
  const objsT = flatten(sceneT);
  if (objsC.length !== objsT.length) {
    console.error(`scene builds disagree (${objsC.length} vs ${objsT.length} objects) — the build is not deterministic; this gate cannot diff`);
    process.exit(2);
  }

  const districts = new Map(plan.districts.map((d) => [d.id, d]));
  const stepBoth = (frames) => {
    for (let i = 0; i < frames; i++) { control.update(DT); treat.update(DT); }
    sceneC.updateMatrixWorld(true);
    sceneT.updateMatrixWorld(true);
  };
  const snap = (objs) => objs.map((o) => [
    o.position.x, o.position.y, o.position.z,
    o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w,
    o.scale.x, o.scale.y, o.scale.z,
    o.visible ? 1 : 0,
  ]);
  const _box = new three.Box3();
  const _ctr = new three.Vector3();

  console.log(`${treat.interactables.length} registered interactables`);
  for (let i = 0; i < treat.interactables.length; i++) {
    const it = treat.interactables[i];
    const name = it.name ?? it.label ?? `#${i}`;
    const wp = new three.Vector3();
    it.hitbox.getWorldPosition(wp);

    // 1. placement: the position the proximity prompt fires at must be
    // inside the owner district's envelope
    const d = districts.get(it.owner);
    const placed = d && wp.x >= d.envelope.x0 && wp.x <= d.envelope.x1 && wp.z >= d.envelope.z0 && wp.z <= d.envelope.z1;
    check(`interact:${name}:placed`, !!placed,
      `registered at (${wp.x.toFixed(1)}, ${wp.z.toFixed(1)})${placed ? ` in ${it.owner}` : ` — OUTSIDE owner district "${it.owner}" ${d ? JSON.stringify(d.envelope) : '(unknown district)'}`}`);

    // 2. observable effect at the site
    if (typeof it.action !== 'function') {
      check(`interact:${name}:effect`, false, 'no action function registered');
      continue;
    }
    // objects already differing (e.g. a leaky reset from an earlier test)
    // are excluded — only changes CAUSED by this action count
    const differs = (a, b, j) => {
      for (let k = 0; k < 11; k++) if (Math.abs(a[j][k] - b[j][k]) > 1e-4) return true;
      return false;
    };
    const preC = snap(objsC);
    const preT = snap(objsT);
    it.action();
    stepBoth(SETTLE_FRAMES);
    const a = snap(objsC);
    const b = snap(objsT);
    let changedNear = 0, changedFar = 0;
    const farWhere = [];
    for (let j = 0; j < a.length; j++) {
      if (differs(preC, preT, j)) continue;   // pre-existing leak, not this action
      if (!differs(a, b, j)) continue;
      _box.setFromObject(objsT[j]);
      const c = _box.isEmpty() ? objsT[j].getWorldPosition(_ctr) : _box.getCenter(_ctr);
      const dist = Math.hypot(c.x - wp.x, c.z - wp.z);
      if (dist <= EFFECT_RADIUS) changedNear++;
      else { changedFar++; if (farWhere.length < 3) farWhere.push(`"${objsT[j].name || '(unnamed)'}" ${dist.toFixed(0)}m away at (${c.x.toFixed(1)}, ${c.z.toFixed(1)})`); }
    }
    check(`interact:${name}:effect`, changedNear > 0,
      changedNear > 0
        ? `${changedNear} object${changedNear === 1 ? '' : 's'} changed within ${EFFECT_RADIUS}m of the prompt site`
        : changedFar > 0
          ? `NOTHING changed within ${EFFECT_RADIUS}m of the prompt site — the only effect is elsewhere: ${farWhere.join('; ')}`
          : `E does NOTHING — zero observable state change anywhere after ${SETTLE_FRAMES} frames`);

    treat.reset();
    stepBoth(2);   // both settle back to base before the next interactable
  }
} finally {
  await server.close();
}

for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.id} — ${c.note}`);
const failed = checks.filter((c) => !c.pass);
console.log(failed.length ? `RESULT: FAIL (${failed.length})` : 'RESULT: PASS');
process.exit(failed.length ? 1 : 0);
