#!/usr/bin/env node
/**
 * Nav gate — the enemies' world is the flood fill's world.
 *
 * Builds the town headless, builds the nav grid (src/game/nav.js: the same
 * 0.35 m / radius 0.34 / step 0.38 numbers as check-city's route fill) and
 * asserts, for the plan's `game` block:
 *   - each gate's spawn ring stands on open ground in the surrounds and its
 *     approach points are open;
 *   - from EVERY spawn ring, every arena's centre and >= 60 % of its open
 *     cells are reachable (a wave that cannot reach its arena is a wave that
 *     stands at the gate);
 *   - from the player's spawn, every district waypoint and every NPC post
 *     is reachable (the town's own route contract, restated on the grid);
 *   - a flow field toward the keep from each ring reaches the ring (the
 *     directed reverse-BFS agrees with the forward fill).
 *
 *   node scripts/check-nav.mjs       # exit 0 pass · 1 defects · 2 crashed
 */
import { bootCity, makeChecker } from './lib/headless.mjs';

const { check, finish } = makeChecker();

try {
  const { vignette, plan } = await bootCity();
  const { buildNavGrid, reachableFrom, flowToward } = await import('../src/game/nav.js');
  const game = plan.game;
  if (!game) { check('game:block', false, 'plan has no game block'); finish(); }
  const fp = vignette.footprint;
  const [fw, fd] = plan.city.footprint_m;
  const mx = (fp.x0 + fp.x1) / 2;
  const mz = (fp.z0 + fp.z1) / 2;
  const rect = { x0: Math.min(fp.x0, mx - fw / 2), x1: Math.max(fp.x1, mx + fw / 2), z0: Math.min(fp.z0, mz - fd / 2), z1: Math.max(fp.z1, mz + fd / 2) };
  const t0 = Date.now();
  const grid = buildNavGrid({ colliders: vignette.colliders, groundAt: vignette.groundAt, rect });
  const openCells = grid.open.reduce((a, b) => a + b, 0);
  console.log(`nav grid ${grid.W}×${grid.D} at ${grid.cell} m over x ${rect.x0}..${rect.x1}, z ${rect.z0}..${rect.z1}: ${openCells} open cells, ${vignette.colliders.length} colliders, built in ${Date.now() - t0} ms`);

  const at = (mask, x, z) => {
    const [i, j] = grid.toCell(x, z);
    for (let di = -1; di <= 1; di += 1) for (let dj = -1; dj <= 1; dj += 1) {
      if (grid.inside(i + di, j + dj) && mask[grid.index(i + di, j + dj)]) return true;
    }
    return false;
  };
  const isOpen = (x, z) => { const [i, j] = grid.toCell(x, z); return grid.inside(i, j) && grid.open[grid.index(i, j)] === 1; };

  const rings = new Map();
  for (const g of game.gates ?? []) {
    const c = g.spawn_ring.centre;
    check(`ring:${g.id}:open`, isOpen(c[0], c[1]), `spawn ring centre (${c}) ${isOpen(c[0], c[1]) ? 'is open ground' : 'is BLOCKED'}`);
    const bad = (g.approach ?? []).filter(([x, z]) => !isOpen(x, z));
    check(`ring:${g.id}:approach`, bad.length === 0, bad.length ? `approach points blocked: ${bad.map((p) => `(${p})`).join(' ')}` : `${(g.approach ?? []).length} approach points open`);
    rings.set(g.id, reachableFrom(grid, c[0], c[1]));
  }

  for (const a of game.arenas ?? []) {
    const cx = (a.rect.x0 + a.rect.x1) / 2;
    const cz = (a.rect.z0 + a.rect.z1) / 2;
    for (const [gid, mask] of rings) {
      let open = 0;
      let reached = 0;
      for (let x = a.rect.x0 + 0.5; x < a.rect.x1; x += 1) {
        for (let z = a.rect.z0 + 0.5; z < a.rect.z1; z += 1) {
          if (!isOpen(x, z)) continue;
          open += 1;
          if (at(mask, x, z)) reached += 1;
        }
      }
      const frac = open ? reached / open : 0;
      check(`arena:${a.id}:from:${gid}`, at(mask, cx, cz) && frac >= 0.6, `centre ${at(mask, cx, cz) ? 'reached' : 'NOT reached'}, ${reached}/${open} open cells (${(frac * 100).toFixed(0)} %) reachable from ${gid}`);
    }
  }

  const spawn = game.player?.spawn ?? [0, 30];
  const fromSpawn = reachableFrom(grid, spawn[0], spawn[1]);
  for (const d of plan.districts) {
    const miss = (d.waypoints ?? []).filter((w) => !at(fromSpawn, w.x, w.z)).map((w) => `"${w.name}" (${w.x}, ${w.z})`);
    check(`waypoints:${d.id}`, miss.length === 0, miss.length ? `unreachable from the spawn: ${miss.join('; ')}` : `${d.waypoints.length} waypoints reachable from the spawn (${spawn})`);
  }
  for (const p of game.npc_posts ?? []) {
    check(`post:${p.id}`, at(fromSpawn, p.at[0], p.at[1]), `(${p.at}) ${at(fromSpawn, p.at[0], p.at[1]) ? 'reachable' : 'UNREACHABLE'} from the spawn`);
  }
  for (const o of game.objectives ?? []) {
    const pts = o.kind === 'escort' ? [o.from, o.to] : o.kind === 'activate' ? o.points : [];
    const miss = pts.filter(([x, z]) => !at(fromSpawn, x, z));
    if (pts.length) check(`objective:${o.id}:reachable`, miss.length === 0, miss.length ? `points unreachable: ${miss.map((p) => `(${p})`).join(' ')}` : `${pts.length} points reachable`);
  }

  // the directed flow field agrees with the forward fill
  const keep = (game.arenas ?? []).find((a) => a.id === 'the-keep');
  if (keep) {
    const kx = (keep.rect.x0 + keep.rect.x1) / 2;
    const kz = (keep.rect.z0 + keep.rect.z1) / 2;
    const flow = flowToward(grid, kx, kz);
    for (const g of game.gates ?? []) {
      const [i, j] = grid.toCell(g.spawn_ring.centre[0], g.spawn_ring.centre[1]);
      const d = flow.dist[grid.index(i, j)];
      check(`flow:${g.id}->keep`, d >= 0, d >= 0 ? `${d} steps (${(d * grid.cell).toFixed(0)} m of walking) from the ring to the keep's centre` : 'the reverse BFS does not reach the ring');
      // the route must go THROUGH a gate passage, on the passage's own level —
      // a gatehouse deck read as ground, or piers read as walls, both fail here
      const passages = Object.values(plan.siege?.gates ?? {}).map((s) => s.passage).filter(Boolean);
      let n = grid.index(i, j); let via = null; let hops = 0;
      while (n >= 0 && hops < 5000) {
        const ci = n % grid.W; const cj = (n - ci) / grid.W;
        const [x, z] = grid.toWorld(ci, cj);
        const hit = passages.find((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
        if (hit && grid.y[n] < 1.0) { via = { x: +x.toFixed(1), z: +z.toFixed(1), y: +grid.y[n].toFixed(2) }; break; }
        n = flow.next[n]; hops += 1;
      }
      check(`route:${g.id}->keep:through-passage`, !!via, via ? `passes a gate passage cell at (${via.x}, ${via.z}) y ${via.y}` : passages.length ? 'the ring-to-keep route never crosses a gate passage at street level' : 'plan has no siege.gates passages to test');
    }
  }
  finish('RESULT');
} catch (error) {
  console.error('[check-nav] crashed before checking:', error);
  process.exit(2);
}
