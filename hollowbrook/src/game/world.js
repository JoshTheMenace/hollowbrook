/* ------------------------------------------------------------------ *
 * WORLD — the adapter between the built town and the rules.
 *
 * The rules (rules.js) never touch THREE or the scene; they ask a world
 * object five things: where the ground is, whether a body may stand
 * somewhere, whether a line is clear, where the plan's game points are,
 * and the nav grid.  This builds that object from what buildVignette
 * returns, in Node (the sim) and in the browser (the shell) alike.
 *
 * TWO GROUND QUERIES, ON PURPOSE.  `vignette.groundAt(x, z)` is the town's
 * "max over everything" answer, which is right for seating a prop and
 * wrong for a walker under an elevated deck: it teleports anybody who
 * steps beneath a gatehouse's walk platform straight onto it.  So the
 * walker asks `groundAt(x, z, fromY)`, which only offers a surface within
 * REACH (step + a little) of the height the feet are already at, and
 * otherwise answers with the terrain underfoot — a walk is walkable ON and
 * UNDER.  The nav grid is built from the GROUND LAYER (fromY = the terrain
 * height), so enemies see the streets, the market, the rims, the keep and
 * the wall-walk — every terrain level — and never a district's elevated
 * platform, which is what "enemies on the roofs: not built" means.
 * ------------------------------------------------------------------ */
import { CONTRACT } from './data.js';
import { buildNavGrid } from './nav.js';

const STEP = CONTRACT.player.step;
const REACH = STEP + 0.17;        // 0.55: the Sakura Crossing number, kept

/** Height a collider blocks up to when the record does not say. */
export const DEFAULT_TOP = 3.0;
export const STUB_TOP = 9.0;

export function buildWorld(vignette, plan, { scene = null } = {}) {
  const terrainAt = vignette.city?.terrain?.terrainHeightAt ?? ((x, z) => 0);
  const platforms = vignette.platforms.filter((p) => p.owner !== 'terrain');
  const colliders = vignette.colliders;

  const groundAt = (x, z, fromY = null) => {
    let y = terrainAt(x, z);
    for (const p of platforms) {
      if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1 || p.top <= y) continue;
      if (fromY !== null && p.top > fromY + REACH) continue;    // over the head: walk under it
      y = p.top;
    }
    return y;
  };

  /* blockers: every collider with a height band, for line-of-sight; cover
   * objects tagged by the districts (userData.cover) join the list with
   * their measured box so a bolt can pass OVER a 1.1 m cart. */
  const blockers = colliders.map((c) => ({
    x0: c.x0, z0: c.z0, x1: c.x1, z1: c.z1,
    top: c.top ?? (c.stub ? STUB_TOP : DEFAULT_TOP),
    bottom: c.bottom ?? -Infinity,
    base: groundAt((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2),
    cover: !!c.cover,
  }));
  const cover = [];
  if (scene) {
    scene.traverse((o) => {
      if (!o.userData?.cover) return;
      const box = boxOf(o);
      if (!box) return;
      const rect = { x0: box.min.x, z0: box.min.z, x1: box.max.x, z1: box.max.z, top: box.max.y, bottom: -Infinity, base: box.min.y, cover: true };
      cover.push(rect);
      // a cover prop that registered a collider already blocks; one that did
      // not still occludes sight (it is 0.9 m tall by contract)
      if (!colliders.some((c) => Math.abs(c.x0 - rect.x0) < 0.3 && Math.abs(c.z0 - rect.z0) < 0.3)) blockers.push(rect);
    });
  }
  for (const b of blockers) if (b.cover && !cover.includes(b)) cover.push(b);

  /* blockers are bucketed on an 8 m grid so a line test walks a handful of
   * cells instead of every collider in the town (2 000+ once the districts
   * land, × 14 enemies × several tests a tick) */
  const BK = 8;
  const bkey = (i, j) => i * 100000 + j;
  const buckets = new Map();
  const bucketAll = () => {
    buckets.clear();
    for (const c of blockers) {
      for (let i = Math.floor(c.x0 / BK); i <= Math.floor(c.x1 / BK); i += 1) {
        for (let j = Math.floor(c.z0 / BK); j <= Math.floor(c.z1 / BK); j += 1) {
          const k = bkey(i, j);
          if (!buckets.has(k)) buckets.set(k, []);
          buckets.get(k).push(c);
        }
      }
    }
  };
  const candidates = (ax, az, bx, bz) => {
    const out = new Set();
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / (BK * 0.5)));
    for (let s = 0; s <= n; s += 1) {
      const t = s / n;
      const list = buckets.get(bkey(Math.floor((ax + (bx - ax) * t) / BK), Math.floor((az + (bz - az) * t) / BK)));
      if (list) for (const c of list) out.add(c);
    }
    return out;
  };

  /** Is the segment a -> b clear of blockers?  Height-aware: a line over a
   *  blocker's top is clear, one under a parapet's bottom is clear. */
  const clear = (ax, ay, az, bx, by, bz) => {
    const dx = bx - ax; const dz = bz - az; const dy = by - ay;
    for (const c of candidates(ax, az, bx, bz)) {
      // slab test in x and z for the parametric range inside the box
      let t0 = 0; let t1 = 1;
      if (Math.abs(dx) < 1e-9) { if (ax <= c.x0 || ax >= c.x1) continue; }
      else {
        let ta = (c.x0 - ax) / dx; let tb = (c.x1 - ax) / dx;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) continue;
      }
      if (Math.abs(dz) < 1e-9) { if (az <= c.z0 || az >= c.z1) continue; }
      else {
        let ta = (c.z0 - az) / dz; let tb = (c.z1 - az) / dz;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) continue;
      }
      const ya = ay + dy * t0; const yb = ay + dy * t1;
      const lo = Math.min(ya, yb); const hi = Math.max(ya, yb);
      if (lo < c.top && hi > c.bottom) return false;         // tops are absolute heights
    }
    return true;
  };

  bucketAll();

  /* the nav grid over the whole footprint plus the surrounds the rings stand in */
  const fp = vignette.footprint;
  const [fw, fd] = plan.city.footprint_m;
  const mx = (fp.x0 + fp.x1) / 2; const mz = (fp.z0 + fp.z1) / 2;
  const rect = { x0: Math.min(fp.x0, mx - fw / 2), x1: Math.max(fp.x1, mx + fw / 2), z0: Math.min(fp.z0, mz - fd / 2), z1: Math.max(fp.z1, mz + fd / 2) };
  const grid = buildNavGrid({ colliders, groundAt: (x, z) => groundAt(x, z, terrainAt(x, z)), rect });

  const game = plan.game;
  const gates = Object.fromEntries(game.gates.map((g) => [g.id, g]));
  const arenas = Object.fromEntries(game.arenas.map((a) => [a.id, a]));
  const enterables = Object.fromEntries(plan.districts.flatMap((d) => (d.enterable ?? []).map((e) => [e.building, e])));
  const interactions = Object.fromEntries(plan.districts.flatMap((d) => (d.interactions ?? []).map((i) => [i.name, { ...i, district: d.id }])));

  return {
    plan, game, gates, arenas, enterables, interactions, grid, colliders, blockers, cover,
    groundAt, terrainAt, clear, rect,
    spawn: game.player.spawn, spawnYaw: game.player.yaw ?? 0,
    posts: game.npc_posts, objectives: game.objectives,
    /** The shelter point for a building: its interior waypoint if that is on
     *  the grid, else its door — a stub-massed town has no interiors yet. */
    shelterPoint(building) {
      const e = enterables[building];
      if (!e) return null;
      const w = e.interior_waypoint;
      const [i, j] = grid.toCell(w.x, w.z);
      if (grid.inside(i, j) && grid.open[grid.index(i, j)]) return [w.x, w.z];
      return e.door.at.slice();
    },
  };
}

function boxOf(o) {
  // measured, not read off the transform: kit geometry bakes its offset in
  let min = null; let max = null;
  o.updateWorldMatrix?.(true, false);
  o.traverse((m) => {
    if (!m.isMesh || !m.geometry) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox;
    const corners = [
      [bb.min.x, bb.min.y, bb.min.z], [bb.max.x, bb.min.y, bb.min.z], [bb.min.x, bb.max.y, bb.min.z], [bb.max.x, bb.max.y, bb.min.z],
      [bb.min.x, bb.min.y, bb.max.z], [bb.max.x, bb.min.y, bb.max.z], [bb.min.x, bb.max.y, bb.max.z], [bb.max.x, bb.max.y, bb.max.z],
    ];
    const e = m.matrixWorld.elements;
    for (const [x, y, z] of corners) {
      const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
      const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
      const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
      if (!min) { min = { x: wx, y: wy, z: wz }; max = { x: wx, y: wy, z: wz }; continue; }
      min.x = Math.min(min.x, wx); min.y = Math.min(min.y, wy); min.z = Math.min(min.z, wz);
      max.x = Math.max(max.x, wx); max.y = Math.max(max.y, wy); max.z = Math.max(max.z, wz);
    }
  });
  return min ? { min, max } : null;
}
