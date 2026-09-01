import { cel, flat } from './materials.js';
import { PAL } from './palette.js';

/* ------------------------------------------------------------------ *
 * TERRAIN — the coordinator's module.  The SHAPE of the ground is the
 * plan's `terrain` block (city-plan.json) and the engine that builds it is
 * src/core/terrain.js, called by composeCity before any district.  This
 * file owns the two things that are neither: the TONES the terrain draws
 * in, and the PROBES scripts/check-terrain.mjs runs against the built
 * surface.
 *
 * WHAT THE PLAN'S TERRAIN CARRIES HERE, and why it is terrain and not kit:
 *
 *   the wall-walk   a 2.4 m shelf at y 5.0 inside each district's outer
 *                   edge (48.8..51.2), gapped only at the two gates.  Its two
 *                   5 m scarps ARE the curtain wall's faces; the kit's
 *                   curtainWall dresses them.  Terrain, because a perimeter
 *                   five districts share has to be one surface: the walk is
 *                   walkable and gate-proven before a single building
 *                   stands, and no district can leave a hole in it.
 *   stair turrets   one internal flight per district, parallel to the wall,
 *                   landing 0.5-0.6 m INSIDE a 3 x 3 m landing shelf that
 *                   abuts the walk.  The landing is the turret's base.
 *   the market      the LEVEL of marketlow is the sunk square at -1.4; its
 *                   four rims are shelves at 0.  Flats resolve higher-wins,
 *                   so a sunk shelf inside a 0 level is impossible; the
 *                   square is the level and the rims are the shelves.
 *   the keep        two shelves (2.6 ward, 5.2 keep) on a mound that fades
 *                   to zero at every shelf edge, so each has a revetment
 *                   cliff the district dresses as its wall; two flights.
 *
 * ONE ENGINE CHANGE (src/core/terrain.js, marked SHELF-AWARE): a socket
 * crossing's half used to ramp from the socket's y to the DISTRICT LEVEL.
 * A wall-walk socket at y 5 into a level-0 district would then be a 40 m
 * ramp.  The target is now the flat the socket lands on in that district —
 * a shelf if one covers the point just inside the boundary, else the
 * level — so the walk crosses every boundary flat.
 * ------------------------------------------------------------------ */

export const TERRAIN_TONES = () => ({
  ground: cel(PAL.groundMid),
  paving: cel(PAL.ground),
  bank: cel(PAL.groundDark),
  surrounds: cel(PAL.groundDeep),
  shore: cel(PAL.groundMid),
  skirt: cel(PAL.ink),
  water: flat(PAL.glass, { transparent: true, opacity: 0.84 }),
  stub: cel(PAL.groundDark),
});

/** Every wall-walk shelf (y 5.0, 2.4 m wide) in the plan, by district. */
export function wallWalkShelves(plan) {
  const y = plan.siege?.wall_walk_y ?? 5.0;
  const near = (a, b) => Math.abs(a - b) < 1e-6;   // 51.2 - 48.8 is not 2.4 in IEEE754
  return (plan.terrain.shelves ?? []).filter((s) => s.y === y && (near(s.x1 - s.x0, 2.4) || near(s.z1 - s.z0, 2.4)));
}

/** The stair-head landings (3 x 3 at the walk height). */
export function landingShelves(plan) {
  const y = plan.siege?.wall_walk_y ?? 5.0;
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  return (plan.terrain.shelves ?? []).filter((s) => s.y === y && near(s.x1 - s.x0, 3) && near(s.z1 - s.z0, 3));
}

/**
 * Walk an internal crossing from its foot to its head the way the player
 * does — 0.15 m strides carrying the feet forward, refusing any rise over
 * `step` — and report the worst rise and whether the head was reached at
 * the promised height.  A flight that renders and climbs by hand can still
 * be reported unclimbable by the route fill (going under 0.36 m), and a
 * flight whose head lands 0.1 m short of its shelf is a 5 m hole in the
 * wall-walk that no frame shows.
 */
export function traceClimb(groundAt, c, { step = 0.38, stride = 0.15 } = {}) {
  const alongX = c.axis === 'x';
  const dir = c.dir === -1 ? -1 : 1;
  const rise = Math.abs(c.to - c.from);
  const run = c.kind === 'stairs'
    ? Math.max(1, Math.ceil(rise / (c.rise ?? 0.18))) * Math.max(0.36, c.going ?? 0.42)
    : Math.max(1, rise / Math.abs(c.grade ?? 0.125));
  const [x0, z0] = c.at;
  let y = groundAt(x0, z0);
  let worst = 0;
  const total = run + 1.0;               // one metre past the head, onto the shelf
  for (let s = stride; s <= total; s += stride) {
    const x = alongX ? x0 + dir * s : x0;
    const z = alongX ? z0 : z0 + dir * s;
    const g = groundAt(x, z);
    const d = g - y;
    if (d > worst) worst = d;
    if (d <= step) y = g;                // a rise over the step is a wall: stay put
  }
  const head = groundAt(alongX ? x0 + dir * (run + 0.9) : x0, alongX ? z0 : z0 + dir * (run + 0.9));
  return { id: c.id, run, worst, reachedY: y, headY: head, ok: worst <= step && Math.abs(y - c.to) < 0.06 && Math.abs(head - c.to) < 0.06 };
}
