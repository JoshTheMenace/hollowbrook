#!/usr/bin/env node
/**
 * Play-camera occlusion gate. The vista cameras were gated; the camera the
 * player actually has was gated by nothing, and the review's highest-impact
 * defect lived exactly there (yagura fully hiding the player at the night
 * spawn clamp; camera buried in the shrine stair in town).
 *
 * Sweeps REACHABLE positions and, at each, computes the camera with the very
 * function the runtime uses (resolveCamera from src/game/hero.js — shared by
 * construction), then raycasts camera -> player body (3 heights). A position
 * where every body sample is blocked FULLY HIDES the player: FAIL.
 *
 *   1. festival arena at 1m grid, battle camera (dist 13, pitch -1.08,
 *      town-arrival yaw -PI/2) — plus the actual night entry clamp point
 *      (arenaEntry from src/game/night.js) as a named check;
 *   2. town free-roam along the walkable set (flood fill at the walker's
 *      numbers), exploration camera (dist 4.4, pitch -0.18), 4 yaws.
 *
 * Occlusion handling: the sweep passes a raycast to resolveCamera only if
 * main.js actually wires `occluderRoot` into the Hero — the gate measures
 * the camera the build ships, not the one the code could ship.
 *
 *   node scripts/check-occlusion.mjs
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
  const { resolveCamera } = await server.ssrLoadModule('/src/game/hero.js');
  const { ARENA, arenaEntry } = await server.ssrLoadModule('/src/game/night.js');

  const scene = new three.Scene();
  const vignette = scenejs.buildVignette(scene, { only: null });
  scene.updateMatrixWorld(true);
  const { groundAt, colliders } = vignette;

  // the sweep uses occlusion pullback only if the shipped Hero does
  const mainSrc = readFileSync(new URL('../src/game/main.js', import.meta.url), 'utf8');
  const wired = /occluderRoot\s*:/.test(mainSrc);
  console.log(`camera occlusion handling wired in main.js: ${wired ? 'YES (sweep uses pullback)' : 'NO (sweep uses the raw boom)'}`);

  const raycaster = new three.Raycaster();
  const rayHit = (from, to) => {
    const dir = new three.Vector3(to.x - from.x, to.y - from.y, to.z - from.z);
    const far = dir.length();
    raycaster.set(new three.Vector3(from.x, from.y, from.z), dir.normalize());
    raycaster.near = 0.05;
    raycaster.far = far;
    return raycaster.intersectObject(vignette.root, true).find((h) => h.object.visible) ?? null;
  };
  const camRaycast = wired ? rayHit : null;

  const R = 0.34;
  const blocked = (x, z) => colliders.some((c) => x > c.x0 - R && x < c.x1 + R && z > c.z0 - R && z < c.z1 + R);

  // fully hidden = every body sample (0.3 / 0.9 / 1.5 above the feet) has
  // town geometry between it and the camera
  const BODY = [0.3, 0.9, 1.5];
  const hiddenFrom = (px, pz, eyeY, camYaw, pitch, dist) => {
    const cam = resolveCamera({ px, pz, eyeY, camYaw, pitch, dist, groundAt, raycast: camRaycast });
    let blockedN = 0;
    for (const h of BODY) {
      const target = { x: px, y: eyeY + h, z: pz };
      const hit = rayHit({ x: cam.bx, y: cam.by, z: cam.bz }, target);
      const span = Math.hypot(target.x - cam.bx, target.y - cam.by, target.z - cam.bz);
      if (hit && hit.distance < span - 0.35) blockedN++;
    }
    return blockedN === BODY.length;
  };

  /* ---- 1. the arena, through the battle camera ------------------------ */
  {
    const camYaw = -Math.PI / 2;    // the yaw every town arrival has (main.js spawn)
    let cells = 0;
    const blind = [];
    for (let x = ARENA.x0 + 0.5; x < ARENA.x1; x += 1) {
      for (let z = ARENA.z0 + 0.5; z < ARENA.z1; z += 1) {
        if (blocked(x, z)) continue;
        cells++;
        if (hiddenFrom(x, z, 0, camYaw, -1.08, 13)) blind.push([x, z]);
      }
    }
    check('occlusion:arena', blind.length === 0,
      `${blind.length}/${cells} reachable 1m cells fully hide the player from the battle camera` +
      (blind.length ? ` — first at (${blind[0][0]}, ${blind[0][1]}), all: ${blind.slice(0, 12).map(([a, b]) => `(${a},${b})`).join(' ')}${blind.length > 12 ? ' …' : ''}` : ''));

    // the actual night entries: a town arrival can stand at ANY z when night
    // falls — sweep every point the clamp can produce (west arrivals all
    // land on the same x line)
    const entries = new Set();
    for (let z = -6; z <= 18; z += 0.5) {
      const e = arenaEntry(-30, z);
      entries.add(`${e.x},${e.z}`);
    }
    const blindEntries = [...entries].map((s) => s.split(',').map(Number))
      .filter(([x, z]) => hiddenFrom(x, z, 0, camYaw, -1.08, 13));
    check('occlusion:night-entry', blindEntries.length === 0,
      `${blindEntries.length}/${entries.size} possible town-arrival entry points fully hide the player` +
      (blindEntries.length ? ` — e.g. (${blindEntries[0][0]}, ${blindEntries[0][1]}): the spawn clamp lands players behind the yagura` : ''));
  }

  /* ---- 2. town free-roam along the walkable set ----------------------- */
  {
    // flood fill at the walker's numbers (2m cells: a camera defect is never
    // a single-metre feature; the shrine stair is ~3m wide)
    const CELL = 2, STEP = 0.38;
    const u = plan.districts.reduce((acc, d) => ({
      x0: Math.min(acc.x0, d.envelope.x0), z0: Math.min(acc.z0, d.envelope.z0),
      x1: Math.max(acc.x1, d.envelope.x1), z1: Math.max(acc.z1, d.envelope.z1),
    }), { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity });
    const ci = (x) => Math.round((x - u.x0) / CELL);
    const cj = (z) => Math.round((z - u.z0) / CELL);
    const W = ci(u.x1) + 1, D = cj(u.z1) + 1;
    const seedWp = plan.districts[0].waypoints[0];
    const seen = new Set();
    const walkable = [];
    const q = [[ci(seedWp.x), cj(seedWp.z), groundAt(seedWp.x, seedWp.z)]];
    seen.add(`${q[0][0]},${q[0][1]}`);
    while (q.length) {
      const [i, j, y] = q.pop();
      walkable.push([u.x0 + i * CELL, u.z0 + j * CELL]);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= D) continue;
        const k = `${ni},${nj}`;
        if (seen.has(k)) continue;
        const nx = u.x0 + ni * CELL, nz = u.z0 + nj * CELL;
        if (blocked(nx, nz)) continue;
        const ny = groundAt(nx, nz);
        if (ny - y > STEP) continue;
        seen.add(k);
        q.push([ni, nj, ny]);
      }
    }
    const YAWS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    const blind = [];
    for (const [x, z] of walkable) {
      const eyeY = groundAt(x, z);
      for (const yaw of YAWS) {
        if (hiddenFrom(x, z, eyeY, yaw, -0.18, 4.4)) { blind.push([x, z, yaw]); break; }
      }
    }
    check('occlusion:town', blind.length === 0,
      `${blind.length}/${walkable.length} walkable 2m cells fully hide the player at some camera yaw (dist 4.4, pitch -0.18)` +
      (blind.length ? ` — first at (${blind[0][0]}, ${blind[0][1]}) yaw ${blind[0][2].toFixed(2)}; sample: ${blind.slice(0, 8).map(([a, b]) => `(${a},${b})`).join(' ')}${blind.length > 8 ? ' …' : ''}` : ''));
  }
} finally {
  await server.close();
}

for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.id} — ${c.note}`);
const failed = checks.filter((c) => !c.pass);
console.log(failed.length ? `RESULT: FAIL (${failed.length})` : 'RESULT: PASS');
process.exit(failed.length ? 1 : 0);
