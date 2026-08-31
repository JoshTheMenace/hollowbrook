#!/usr/bin/env node
/**
 * Game-vocabulary gate (Stage A2). The plan's `game` block is a contract the
 * BUILT scene must satisfy — arenas with real cover/elevation/landmarks,
 * NPC posts on walkable ground, objectives that reference real things.
 * Prose in a brief is not vocabulary; this is.
 *
 *   node scripts/check-game.mjs
 *
 * Boots the whole city headless (same path as check-spatial) and measures.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// same DOM stub as the other headless gates
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
  const { THREE: three } = await server.ssrLoadModule('/src/game/three-export.js'); // same instance as the scene graph
  const scenejs = await server.ssrLoadModule('/src/scene.js');
  const scene = new three.Scene();
  const vignette = scenejs.buildVignette(scene, { only: null });

  const game = plan.game;
  if (!game) {
    check('game:block', false, 'plan has no `game` block — the vocabulary does not exist');
  } else {
    const districts = new Map(plan.districts.map((d) => [d.id, d]));

    // ---- arenas ----
    for (const a of game.arenas ?? []) {
      const d = districts.get(a.district);
      check(`arena:${a.id}:district`, !!d, d ? `district ${a.district} exists` : `unknown district "${a.district}"`);
      if (d) {
        const inside = a.rect.x0 >= d.envelope.x0 && a.rect.x1 <= d.envelope.x1 && a.rect.z0 >= d.envelope.z0 && a.rect.z1 <= d.envelope.z1;
        check(`arena:${a.id}:in-envelope`, inside, `rect ${JSON.stringify(a.rect)} inside ${a.district}`);
      }
      const sr = a.spawn_ring ?? {};
      check(`arena:${a.id}:spawn-ring`, sr.r_min > 0 && sr.r_max > sr.r_min, `ring ${sr.r_min}..${sr.r_max} m`);

      // measured against the BUILT scene:
      const inRect = (x, z) => x >= a.rect.x0 && x <= a.rect.x1 && z >= a.rect.z0 && z <= a.rect.z1;
      // cover = collider-bearing obstacles fully inside the rect
      const cover = vignette.colliders.filter((c) => inRect(c.x0, c.z0) && inRect(c.x1, c.z1));
      check(`arena:${a.id}:cover`, cover.length >= a.min_cover, `${cover.length} cover colliders inside (need >= ${a.min_cover})`);
      // elevation: sample groundAt over the rect — any point standing >0.3m
      // over the district level is raised fightable ground
      let elevated = 0;
      for (let x = a.rect.x0 + 1; x < a.rect.x1; x += 2) {
        for (let z = a.rect.z0 + 1; z < a.rect.z1; z += 2) {
          if (vignette.groundAt(x, z) > 0.3) elevated++;
        }
      }
      check(`arena:${a.id}:elevation`, elevated >= a.min_elevation, `${elevated} raised ground samples inside (need >= ${a.min_elevation})`);
      // landmarks readable FROM the rect: reuse the plan's citywide landmarks
      // owned by this district — raycast from the rect centre at eye height
      const ray = new three.Raycaster();
      const centre = new three.Vector3((a.rect.x0 + a.rect.x1) / 2, 1.6, (a.rect.z0 + a.rect.z1) / 2);
      let seen = 0;
      const names = (d?.landmarks_citywide ?? []).map((l) => l.object);
      for (const name of names) {
        const obj = scene.getObjectByName(name);
        if (!obj) continue;
        const box = new three.Box3().setFromObject(obj);
        const target = box.getCenter(new three.Vector3());
        ray.set(centre, target.clone().sub(centre).normalize());
        const hit = ray.intersectObjects(scene.children, true)[0];
        if (hit) {
          let o = hit.object, ok = false;
          while (o) { if (o === obj) { ok = true; break; } o = o.parent; }
          if (ok || box.clampPoint(hit.point, new three.Vector3()).distanceTo(hit.point) < 1) seen++;
        }
      }
      check(`arena:${a.id}:landmarks`, seen >= a.min_landmarks, `${seen}/${names.length} district landmarks read from the arena centre (need >= ${a.min_landmarks})`);
    }

    // ---- npc posts ----
    for (const p of game.npc_posts ?? []) {
      const d = districts.get(p.district);
      const [x, z] = p.at;
      const inEnv = d && x >= d.envelope.x0 && x <= d.envelope.x1 && z >= d.envelope.z0 && z <= d.envelope.z1;
      // standable: not inside any collider (inflated by the walker radius)
      const R = 0.34;
      const blocked = vignette.colliders.find((c) => x > c.x0 - R && x < c.x1 + R && z > c.z0 - R && z < c.z1 + R);
      check(`npc:${p.id}`, !!inEnv && !blocked,
        !inEnv ? `post (${x}, ${z}) outside district "${p.district}"` :
        blocked ? `post (${x}, ${z}) stands inside a collider (${blocked.x0.toFixed(1)},${blocked.z0.toFixed(1)})..(${blocked.x1.toFixed(1)},${blocked.z1.toFixed(1)})` :
        `standable at (${x}, ${z}) in ${p.district}, ground y ${vignette.groundAt(x, z).toFixed(2)}`);
    }

    // ---- objectives ----
    for (const o of game.objectives ?? []) {
      if (o.kind === 'survive') {
        const arena = (game.arenas ?? []).find((a) => a.id === o.arena);
        check(`objective:${o.id}`, !!arena && o.seconds > 0, arena ? `survive ${o.seconds}s in ${o.arena}` : `references unknown arena "${o.arena}"`);
      } else check(`objective:${o.id}`, false, `unknown objective kind "${o.kind}"`);
    }
  }
} finally {
  await server.close();
}

for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.id} — ${c.note}`);
const failed = checks.filter((c) => !c.pass);
console.log(failed.length ? `RESULT: FAIL (${failed.length})` : 'RESULT: PASS');
process.exit(failed.length ? 1 : 0);
