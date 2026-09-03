#!/usr/bin/env node
/**
 * Arena visibility gate — the first-person answer to nightbloom's camera
 * occlusion sweep.  There is no boom to bury here; what a first-person
 * siege can get wrong is a wave that arrives from somewhere the arena
 * cannot SEE: enemies that are on top of you before they were ever on
 * screen.  So, per arena: from every open 2 m cell inside the rect, at the
 * player's eye (1.62 m over the ground), raycast to each of the approach
 * points of the gate that feeds it, at 1.0 m (a chibi raider's chest).  A
 * cell "sees the approach" if any point is unblocked.  PASS when >= 40 % of
 * the arena's open cells do — enough that a player who moves finds a line,
 * and few enough that cover is real.  Also prints the fraction of cells
 * that see the GATE itself (the choke), advisory.
 *
 *   node scripts/check-arena-visibility.mjs
 */
import { bootCity, makeChecker } from './lib/headless.mjs';

const { check, finish } = makeChecker();
const MIN_FRAC = 0.4;
const R = 0.34;

try {
  const { THREE, scene, vignette, plan } = await bootCity();
  const game = plan.game;
  if (!game) { check('game:block', false, 'plan has no game block'); finish(); }
  const gates = new Map((game.gates ?? []).map((g) => [g.id, g]));
  const ray = new THREE.Raycaster();
  /* HEIGHT-AWARE, on the ground layer.  The first cut used the two-argument
   * `groundAt` for the approach points and the eye, which is a max over
   * every platform: at (0, 50) that is the gatehouse DECK, so the arena was
   * asked whether it could see a raider standing on the roof of the gate
   * (millreach measured 25.7 -> 28.1 % from that alone).  `groundLayerAt`
   * is the terrain layer a walker stands on; `colliderBlocks` is the one
   * copy of the top/bottom arithmetic, shared with the player. */
  const { colliderBlocks } = await import('../src/builders.js');
  const groundAt = vignette.groundLayerAt;
  const blocked = (x, z) => { const y = groundAt(x, z); return vignette.colliders.some((c) => colliderBlocks(c, x, z, y, R)); };
  const clear = (from, to) => {
    const dir = to.clone().sub(from);
    const far = dir.length();
    ray.set(from, dir.normalize());
    ray.far = far - 0.3;
    ray.near = 0.05;
    const hit = ray.intersectObject(vignette.root, true).find((h) => h.distance > 1e-3 && h.object.visible);
    return !hit;
  };
  for (const a of game.arenas ?? []) {
    /* An arena's approach is declared PER ARENA: either a gate id (the
     * wave's own approach points) or `{ gate, points, why }` — the entry the
     * wave actually uses to reach this arena (the close's east gap, the
     * keep's climbs, the mill's wall lane).  Plan amendment A1: a rect a
     * hundred metres from the gate that feeds it measured 0 % with every
     * mesh in its own district hidden, which is a fact about geography and
     * not about cover. */
    const ap = typeof a.approach === 'string' ? { gate: a.approach } : (a.approach ?? {});
    const g = gates.get(ap.gate);
    if (!g) { check(`arena:${a.id}:visibility`, false, `approach gate "${ap.gate}" is not a gate`); continue; }
    const declared = ap.points ?? g.approach ?? [];
    const pts = declared.map(([x, z]) => new THREE.Vector3(x, groundAt(x, z) + 1.0, z));
    const gatePt = new THREE.Vector3(g.at[0], groundAt(g.at[0], g.at[1]) + 1.0, g.at[1]);
    const via = ap.points ? `its declared approach (${ap.points.map((p) => `(${p})`).join(' ')}) from ${g.id}` : `an approach point of ${g.id}`;
    let open = 0, sees = 0, seesGate = 0;
    for (let x = a.rect.x0 + 1; x < a.rect.x1; x += 2) {
      for (let z = a.rect.z0 + 1; z < a.rect.z1; z += 2) {
        if (blocked(x, z)) continue;
        open++;
        const eye = new THREE.Vector3(x, groundAt(x, z) + 1.62, z);
        if (pts.some((p) => clear(eye, p))) sees++;
        if (clear(eye, gatePt)) seesGate++;
      }
    }
    const frac = open ? sees / open : 0;
    check(`arena:${a.id}:visibility`, frac >= MIN_FRAC, `${sees}/${open} open cells (${(frac * 100).toFixed(0)} %) see ${via} (need >= ${MIN_FRAC * 100} %); ${seesGate} see the gate itself`);
  }
  finish('RESULT');
} catch (error) {
  console.error('[check-arena-visibility] crashed before checking:', error);
  process.exit(2);
}
