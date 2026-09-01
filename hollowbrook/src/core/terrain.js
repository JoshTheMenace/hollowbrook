import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 * TERRAIN — one continuous ground surface over the whole city.
 *
 * This is stage 2 of the city pipeline (references/city-scale.md) and it
 * runs BEFORE the kit and before any district.  It exists because of one
 * measured finding, quoted from the independent review of the first city
 * built by decomposition:
 *
 *   "Ground is a per-district responsibility. Disjoint envelopes, each
 *    district platforming its own rectangle, nothing owning what lies
 *    between or beyond. That one decision produces the floating slabs in
 *    all four overhead frames, the headland's severed ground, net-lofts'
 *    void behind its wall, both blank-plane seam descents, and the row's
 *    missing harbour."
 *
 * The decisive part of that finding is the last sentence of the review's
 * note on it: **no district agent could have fixed it from inside its
 * parcel.**  A district can only build to its own envelope, so ground
 * left to districts is ground that stops at every boundary — and the gap
 * between two envelopes, and everything beyond the outermost one, is
 * owned by nobody and therefore built by nobody.  The fix is not a rule
 * telling districts to be careful.  It is taking the ground away from
 * them: districts DRESS this surface (pads, kerbs, steps, revetments,
 * paving laid ON it) and never platform their own rectangle.
 *
 * WHAT IS BUILT HERE, and why each piece is here
 * ----------------------------------------------
 *   levels      each district id gets a flat height over its envelope, so
 *               a district's anchors are answered by construction rather
 *               than by the district remembering to lay a slab;
 *   shelves     flat sub-regions INSIDE one district, layered over its
 *               level.  A district with real landform — a rock, a crag, a
 *               terraced hillside — cannot get it from one flat level, and
 *               the terrain-first rule forbids it laying its own; so it
 *               would have to be flat or break the rule.  Measured, the
 *               district with genuine landform scored the HIGHEST of four,
 *               so "be flat" is not an acceptable answer;
 *   mounds      smooth elliptical domes ON TOP of the level/shelf field,
 *               for landform that is not terraced.  They are faded to
 *               exactly zero inside every shelf and every crossing rect
 *               and for a margin outside it, so a contracted height stays
 *               a contracted height and anchors and seams stay honest;
 *   crossings   the terrain builds BOTH HALVES of every socket crossing —
 *               the ramp or the flight and the landings at each end.  A
 *               seam made by one builder cannot disagree with itself;
 *               two districts each building their own half can, and that
 *               is what a seam bug IS.  A crossing with no `socket` is an
 *               INTERNAL climb instead: the same ramp or flight between
 *               two heights inside ONE district, which is how a district
 *               climbs its own rock without laying ground;
 *   surrounds   everything inside city.footprint_m but outside every
 *               envelope, blended continuously out of the nearest levels
 *               and into the surrounds treatment — sea, moor, flat.  This
 *               is the half that no district could ever have built;
 *   apron+skirt a ring past the footprint falling away, and vertical walls
 *               down to a floor, so the world is a CLOSED SOLID.  A town
 *               that ends at a mesh boundary reads as a severed edge from
 *               any camera above eye height.
 *
 * THE TWO TECHNIQUES, both proven on `harbor-town`'s headland district,
 * where they killed seventeen seam defects at once:
 *
 *  (a) A CONFORMING GRID.  Grid lines are placed at the footprint edges,
 *      at every envelope edge, at every SHELF edge, at every crossing rect
 *      edge and at every stair tread edge, and only THEN is each gap
 *      subdivided to <= cell.
 *      Nothing straddles a designed edge, so a district promised 1.2 m
 *      gets exactly 1.2 m — not 1.2 rounded off a cell that half-covers
 *      its neighbour.  Quads are split on ALTERNATING diagonals: split
 *      them all the same way and the ground grows a diagonal grain that a
 *      depth-difference ink pass draws as parallel creases.
 *      A shelf edge is a designed edge in exactly the sense an envelope
 *      edge is, and for exactly the same reason: leave it off and the 5 m
 *      promised on the shelf is rounded off a cell that half-covers the
 *      ground beside it, which is the same bug one level up.
 *
 *  (b) THE WALKED SURFACE IS THE MINIMUM OF THE FIELD AT A CELL'S FOUR
 *      CORNERS.  Those corners are the drawn mesh's own nodes, and the
 *      mesh interpolates them, so min(corners) <= the drawn surface
 *      everywhere inside the cell — the height query is PROVABLY never
 *      above the ground the eye sees.  Take the cell's centre height
 *      instead and on a 1-in-1.4 face the query stands the player up to
 *      0.8 m in the air, which is exactly the "walkable height X but
 *      first surface at Y" defect the spatial audit reports.
 *
 * A NOTE ON MOUNDS AND DESIGNED FLATS.  A mound is the only thing here
 * that is ADDED to the field rather than declared as a height, so it is
 * the only thing that can silently move a height somebody was promised.
 * It is therefore multiplied by a keep-out mask (`moundKeepAt`) that is
 * EXACTLY zero inside every shelf rect, every crossing corridor and every
 * tread, and for MOUND_KEEP_M outside them, and only reaches full strength
 * MOUND_FADE_M further out.  `smoothstep` returns a hard 0 below its lower
 * bound, so this is exactness by construction and not by tolerance: a
 * shelf contracted at 6.0 m reads 6.0000 with a five-metre dome touching
 * its edge, and the flight up to it lands on 6.0000 too.  District LEVELS
 * are deliberately NOT masked — a mound that could not lift a district's
 * own ground would be a mound with nowhere to stand.
 *
 * A NOTE ON STAIR GOING.  Every flight built here has a going of at least
 * MIN_GOING_M.  This is a hard constraint, not a taste: the route flood
 * fill (and the walker it models) advances 0.35 m per test, so a going of
 * 0.33 puts two treads inside one stride and the rise it measures is
 * twice the real one — over the step limit.  The flight renders perfectly,
 * climbs perfectly by hand, and the gate calls it unclimbable.
 *
 * USAGE
 *   const terrain = buildTerrain({ plan, ctx, materials });
 *   terrain.terrainHeightAt(x, z)   // the walked ground, anywhere
 * `composeCity` calls this for you and routes `ctx.groundAt` through it.
 * ------------------------------------------------------------------ */

/* ---- constants ---------------------------------------------------- */

const CELL_DEFAULT_M = 2.0;   // target lattice size on open ground
const APRON_M = 5.0;          // ring built past the footprint edge
const MIN_GOING_M = 0.36;     // > the route gate's 0.35 m stride
const TREAD_PAD_M = 0.04;     // treads OVERLAP, never merely meet
const SCARP_M = 0.06;         // the cell that draws a level change as a face
const LANDING_M = 0.8;        // flat at the socket line, both sides
const QUANT_M = 0.05;         // walk-height quantum (merges runs of cells)
const RAMP_GRADE = 1 / 8;     // default ramp/road steepness
const STEP_RISE_M = 0.18;     // default stair rise
const MAX_CELL_RISE_M = 0.12; // corridor cells subdivide to at most this fall
const BLEND_DEFAULT_M = 10;   // envelope edge -> full surrounds treatment
const MOUND_KEEP_M = 0.6;     // a mound is EXACTLY zero this far from a flat
const MOUND_FADE_M = 2.2;     // ...and only full strength this much further
const MOUND_CELL_RISE_M = 0.30; // a mound cell may fall at most this much
const MOUND_TONE_M = 0.30;    // a cell lifted this far reads as the mound's tone
/* Peak |d(dome)/dr| in units of h per normalised radius, for the exponent
 * in `dome`: d/dr h(1-r^2)^1.55 = -3.1 h r (1-r^2)^0.55, whose maximum is at
 * r = 1/sqrt(2.1) and equals 1.49 h.  Used to size a mound's grid cuts from
 * its own shape rather than from a guess. */
const DOME_PEAK_SLOPE = 1.49;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smoothstep = (a, b, t) => {
  if (b <= a) return t >= b ? 1 : 0;
  const u = clamp((t - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
const inRect = (x, z, r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
const distOutside = (x, z, r) => Math.hypot(
  Math.max(r.x0 - x, x - r.x1, 0),
  Math.max(r.z0 - z, z - r.z1, 0));

/** Deterministic PRNG — the same city must produce the same ground twice. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Quartic-ish elliptical dome: round on top, dies to zero with a tangent. */
function dome(x, z, cx, cz, rx, rz, h) {
  const t = 1 - ((x - cx) / rx) ** 2 - ((z - cz) / rz) ** 2;
  return t <= 0 ? 0 : h * t ** 1.55;
}

/** Grid axis: hard cuts first, then every gap subdivided to <= cell. */
function axisLines(lo, hi, cuts, cell) {
  const set = new Set([lo, hi]);
  for (const c of cuts) {
    if (!isNum(c)) continue;
    if (c > lo + 1e-4 && c < hi - 1e-4) set.add(Math.round(c * 10000) / 10000);
  }
  const keys = [...set].sort((a, b) => a - b);
  const out = [keys[0]];
  for (let i = 1; i < keys.length; i += 1) {
    const span = keys[i] - keys[i - 1];
    const n = Math.max(1, Math.ceil(span / cell - 1e-9));
    for (let k = 1; k <= n; k += 1) out.push(keys[i - 1] + (span * k) / n);
  }
  return out;
}

/** Index of the last array entry <= v, clamped to a valid cell index. */
function lastBelow(arr, v) {
  let lo = 0;
  let hi = arr.length - 1;
  if (v <= arr[0]) return 0;
  if (v >= arr[hi]) return hi - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= v) lo = mid; else hi = mid;
  }
  return lo;
}

/* ---- default materials -------------------------------------------- *
 * core/ must not import the app's palette, so tones are supplied by the
 * caller.  These fallbacks exist so a headless gate can build the terrain
 * with no materials module loaded at all.
 */
const DEFAULT_TONES = {
  ground: 0x9aa08f,
  paving: 0x8d8f8a,
  bank: 0x7d7a68,
  surrounds: 0x74806b,
  shore: 0xa9a189,
  skirt: 0x53544f,
  water: 0x4a6b78,
};

function toneMaterials(materials) {
  const out = {};
  for (const [key, hex] of Object.entries(DEFAULT_TONES)) {
    out[key] = materials?.[key] ?? new THREE.MeshStandardMaterial({
      color: hex, roughness: 1, metalness: 0, flatShading: true,
    });
  }
  return out;
}

/* ==================================================================== *
 * buildTerrain
 * ==================================================================== */

/**
 * Build the city's single ground surface.
 *
 * @param {object} args
 * @param {object} args.plan       parsed city-plan.json (city, districts, terrain)
 * @param {object} args.ctx        the createBuilder ctx for the whole city
 * @param {object} [args.materials] tone -> THREE.Material:
 *        { ground, paving, bank, surrounds, shore, skirt, water }
 * @returns {{
 *   terrainHeightAt: (x: number, z: number) => number,
 *   moundAt: (x: number, z: number) => number,
 *   group: THREE.Group, footprint: object, levels: object[],
 *   shelves: object[], mounds: object[], crossings: object[], stats: object
 * }}
 */
export function buildTerrain({ plan, ctx, materials = null }) {
  const spec = plan?.terrain;
  if (!spec || typeof spec !== 'object') {
    throw new Error(
      'buildTerrain: plan.terrain is missing. Ground is the coordinator\'s, not a district\'s — ' +
      'a plan with no terrain block has no continuous surface and every district will platform its own ' +
      'rectangle, which is the floating-slab defect this stage exists to remove. Add ' +
      '{ "terrain": { "owner": "coordinator", "levels": [...], "crossings": [...] } }.');
  }
  const cell = isNum(spec.cell_m) ? Math.max(0.5, spec.cell_m) : CELL_DEFAULT_M;
  const M = toneMaterials(materials);

  /* ---- 1. the footprint: the whole city, not the union of parcels ----
   * city.footprint_m is centred on the envelopes' own centre and then
   * UNIONED with them, so the surface always covers at least every parcel
   * however the coordinator sized the footprint. */
  const env = plan.districts.reduce((a, d) => ({
    x0: Math.min(a.x0, d.envelope.x0), z0: Math.min(a.z0, d.envelope.z0),
    x1: Math.max(a.x1, d.envelope.x1), z1: Math.max(a.z1, d.envelope.z1),
  }), { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity });
  const [fw, fd] = Array.isArray(plan.city?.footprint_m) ? plan.city.footprint_m : [0, 0];
  const mx = (env.x0 + env.x1) / 2;
  const mz = (env.z0 + env.z1) / 2;
  const footprint = {
    x0: Math.min(env.x0, mx - fw / 2), x1: Math.max(env.x1, mx + fw / 2),
    z0: Math.min(env.z0, mz - fd / 2), z1: Math.max(env.z1, mz + fd / 2),
  };

  /* ---- 2. levels: one flat height per district envelope -------------- */
  const levels = [];
  const levelById = new Map();
  for (const L of spec.levels ?? []) {
    const d = plan.districts.find((x) => x.id === L.id);
    if (!d) {
      throw new Error(`buildTerrain: terrain.levels names "${L.id}", which is not a district in this plan`);
    }
    if (levelById.has(L.id)) throw new Error(`buildTerrain: two terrain levels for district "${L.id}"`);
    const rect = { ...d.envelope, y: L.y, id: L.id, tone: L.tone ?? 'ground' };
    levels.push(rect);
    levelById.set(L.id, rect);
  }
  for (const d of plan.districts) {
    if (!levelById.has(d.id)) {
      throw new Error(
        `buildTerrain: district "${d.id}" has no entry in terrain.levels, so its ground is undefined. ` +
        'Every district gets a level here — that is what stops it laying its own.');
    }
  }
  const yValues = levels.map((L) => L.y);
  const minLevel = Math.min(...yValues);

  /* ---- 2b. shelves: flat sub-regions INSIDE one district -------------- *
   * A level is the whole envelope at one height, which is all the ground a
   * flat district needs and none of what a district with landform needs.
   * A shelf is a rect inside one envelope held at its own height; it joins
   * the levels in `levelAt`'s max-over-containing-rects, so it simply wins
   * where it applies, and shelves may overlap — higher wins, the same rule
   * that already decides a shared envelope boundary.
   */
  const shelves = [];
  for (const S of spec.shelves ?? []) {
    const d = plan.districts.find((x) => x.id === S?.in);
    if (!d) {
      throw new Error(`buildTerrain: terrain.shelves names district "${S?.in}", which is not a district in this plan`);
    }
    if (!isNum(S.x0) || !isNum(S.z0) || !isNum(S.x1) || !isNum(S.z1) || S.x0 >= S.x1 || S.z0 >= S.z1 || !isNum(S.y)) {
      throw new Error(`buildTerrain: terrain.shelves entry must be { in, x0, z0, x1, z1, y } with x0 < x1, z0 < z1: ${JSON.stringify(S)}`);
    }
    const e = d.envelope;
    if (S.x0 < e.x0 - 1e-6 || S.x1 > e.x1 + 1e-6 || S.z0 < e.z0 - 1e-6 || S.z1 > e.z1 + 1e-6) {
      throw new Error(
        `buildTerrain: shelf in "${S.in}" is x ${S.x0}..${S.x1}, z ${S.z0}..${S.z1}, which is not inside that ` +
        `district's envelope x ${e.x0}..${e.x1}, z ${e.z0}..${e.z1}. A shelf is that district's own landform; ` +
        'one that overhangs is ground it does not own, and the district next door has a level there.');
    }
    shelves.push({
      x0: S.x0, z0: S.z0, x1: S.x1, z1: S.z1, y: S.y,
      id: `${S.in}:shelf-${shelves.length}`, in: S.in, tone: S.tone ?? levelById.get(S.in).tone,
    });
  }

  /* every flat the field is DECLARED at: levels and shelves together */
  const flats = [...levels, ...shelves];

  /* ---- 2c. mounds: smooth domes on top of the declared flats ---------- *
   * For landform that is not terraced — a rock, a knoll, a spur.  These are
   * the same machinery as the surrounds roughness (`dome`), used with intent
   * rather than scattered, and they are ADDED to whatever the field already
   * says.  See the header note: they are masked to exactly zero on every
   * designed flat, which is the property that keeps anchors and seams honest.
   */
  const MOUNDS = [];
  for (const m of spec.mounds ?? []) {
    if (!isNum(m?.x) || !isNum(m?.z) || !isNum(m?.rx) || !isNum(m?.rz) || !isNum(m?.h)) {
      throw new Error(`buildTerrain: terrain.mounds entry must be { x, z, rx, rz, h } numbers: ${JSON.stringify(m)}`);
    }
    if (m.rx <= 0 || m.rz <= 0) {
      throw new Error(`buildTerrain: mound at (${m.x}, ${m.z}) has rx ${m.rx}, rz ${m.rz} — both radii must be positive`);
    }
    MOUNDS.push({ x: m.x, z: m.z, rx: m.rx, rz: m.rz, h: m.h, tone: m.tone ?? 'bank' });
  }

  /* ---- 3. surrounds treatment ---------------------------------------- */
  const sur = spec.surrounds ?? {};
  const surKind = typeof sur.kind === 'string' ? sur.kind : 'flat';
  const waterY = isNum(sur.water_y) ? sur.water_y : minLevel - 0.35;
  const surY = isNum(sur.y) ? sur.y
    : surKind === 'water' ? waterY - 1.6
      : minLevel - 0.45;
  const blendM = isNum(sur.blend_m) ? Math.max(1, sur.blend_m) : BLEND_DEFAULT_M;

  /* Scattered domes, a third of them hollows, fading IN with distance from
   * the parcels.  Not decoration: a flat card forty metres across under a
   * three-band cel ramp is one tone with a hard edge and no shape at all,
   * and the surrounds is the largest single area in any city frame.  A sine
   * pair will not do — it gives every ridge the same bearing and the ink
   * pass draws them as straight parallel lines. */
  const ROUGH = (() => {
    const r = mulberry32(0x5eed17);
    const list = [];
    const w = footprint.x1 - footprint.x0 + 2 * APRON_M;
    const d = footprint.z1 - footprint.z0 + 2 * APRON_M;
    const n = Math.max(60, Math.round((w * d) / 55));
    const amp = isNum(sur.roughness_m) ? sur.roughness_m : 0.42;
    for (let i = 0; i < n; i += 1) {
      const rx = 2.2 + r() * 5.5;
      list.push([
        footprint.x0 - APRON_M + r() * w, footprint.z0 - APRON_M + r() * d,
        rx, 2.2 + r() * 5.5, (r() < 0.36 ? -1 : 1) * amp * (0.35 + r() * 0.65),
      ]);
    }
    return list;
  })();
  function roughAt(x, z) {
    let y = 0;
    for (const [cx, cz, rx, rz, h] of ROUGH) {
      if (Math.abs(x - cx) > rx || Math.abs(z - cz) > rz) continue;
      y += dome(x, z, cx, cz, rx, rz, h);
    }
    return y;
  }

  /* ---- 4. crossings: BOTH halves of every socket -------------------- *
   * The seam is made by construction here.  Two districts each building
   * their own half of a flight is exactly the arrangement that lets them
   * disagree, and a socket contract they both honour on paper is still two
   * separate pieces of geometry meeting by arithmetic.
   */
  const socketIndex = new Map();
  for (const d of plan.districts) {
    for (const s of d.sockets ?? []) socketIndex.set(s.id, { socket: s, district: d });
  }

  const crossings = [];     // { corridor, kind, ... , halves: [...] }
  const stairRects = [];    // tread regions: cells are skipped there
  const treads = [];        // { x0, z0, x1, z1, top }
  const corridors = [];     // landing + run rects, for tone and for cuts

  const span = (lo, hi) => (lo < hi ? [lo, hi] : [hi, lo]);

  /**
   * ONE half of a crossing: the flat landing at `line`, the run from there
   * up or down to `target`, and the tread rects if it is a flight.  A socket
   * crossing builds two of these — one per district, sharing the socket's
   * `baseY` — and cannot disagree with itself because it is one piece of
   * arithmetic run twice.  An INTERNAL climb builds exactly one, with
   * `landingM = 0` because its foot is a point the author named rather than
   * a boundary two districts meet on.
   */
  const buildHalf = ({ c, kind, where, districtId, baseY, target, alongX, line, centre, half, sign, room, landingM }) => {
    const drop = target - baseY;
    let run = 0;
    let steps = 0;
    let rise = 0;
    let going = 0;
    if (Math.abs(drop) > 1e-6) {
      if (kind === 'stairs') {
        going = Math.max(MIN_GOING_M, isNum(c.going) ? c.going : 0.42);
        steps = Math.max(1, Math.ceil(Math.abs(drop) / (isNum(c.rise) ? c.rise : STEP_RISE_M)));
        rise = drop / steps;
        run = steps * going;
      } else {
        const grade = Math.abs(isNum(c.grade) ? c.grade : RAMP_GRADE);
        run = Math.max(1, Math.abs(drop) / Math.max(0.01, grade));
      }
    }
    const landing = Math.min(landingM, Math.max(0, room - run - 0.2));
    if (run + landing > room + 1e-6) {
      throw new Error(
        `buildTerrain: ${where} needs ${(run + landing).toFixed(2)} m to climb ${drop.toFixed(2)} m ` +
        `in "${districtId}", which only offers ${room.toFixed(2)} m in that direction. ` +
        'Widen the envelope, move it, or steepen the crossing (grade / rise).');
    }
    const a0 = line + sign * landing;                    // where the run starts
    const a1 = a0 + sign * run;                          // where it reaches `target`
    const [cLo, cHi] = span(line, a1);
    const corridor = alongX
      ? { x0: cLo, x1: cHi, z0: centre - half, z1: centre + half }
      : { x0: centre - half, x1: centre + half, z0: cLo, z1: cHi };
    const [rLo, rHi] = span(a0, a1);
    const runRect = alongX
      ? { x0: rLo, x1: rHi, z0: centre - half, z1: centre + half }
      : { x0: centre - half, x1: centre + half, z0: rLo, z1: rHi };

    const halfRec = { district: districtId, sign, target, landing, run, steps, rise, going, a0, a1, corridor, runRect, drop };
    corridors.push({ ...corridor, kind });

    if (kind === 'stairs' && steps > 0) {
      stairRects.push({ ...runRect, half: halfRec, alongX });
      /* Treads OVERLAP by TREAD_PAD_M.  heightAt's platform test is
       * exclusive of nothing but a knife edge is still a knife edge: a
       * grid sampler lands exactly on a joint every single time, and a
       * flight whose treads merely meet reads as a hole partway up. */
      for (let i = 0; i < steps; i += 1) {
        const t0 = a0 + sign * (i * going);
        const t1 = a0 + sign * ((i + 1) * going + TREAD_PAD_M);
        const [lo, hi] = span(t0, t1);
        treads.push(alongX
          ? { x0: lo, x1: hi, z0: centre - half, z1: centre + half, top: baseY + (i + 1) * rise }
          : { x0: centre - half, x1: centre + half, z0: lo, z1: hi, top: baseY + (i + 1) * rise });
      }
    }
    return halfRec;
  };

  const crossingIds = new Set();
  for (const c of spec.crossings ?? []) {
    if (c?.socket === undefined) {
      /* ---- an INTERNAL climb: same code path, one half, inside ONE
       * district.  This is how a district climbs its own rock without
       * laying ground: the shelf is terrain, the flight up to it is
       * terrain, and the district dresses both.  `at` is the FOOT — the
       * point on the centreline where the run begins at `from` — and it
       * runs in the +axis direction unless `dir: -1` says otherwise. */
      const d = plan.districts.find((x) => x.id === c?.in);
      if (!d) {
        throw new Error(
          `buildTerrain: terrain.crossings entry ${JSON.stringify(c?.id ?? c)} has no "socket", so it is an internal ` +
          `climb and needs "in" naming the district it is inside — got "${c?.in}", which is not a district in this plan`);
      }
      if (!isStr(c.id)) throw new Error(`buildTerrain: internal crossing in "${c.in}" has no id — an internal climb is named so a failure can name it`);
      if (crossingIds.has(c.id)) throw new Error(`buildTerrain: two crossings called "${c.id}"`);
      crossingIds.add(c.id);
      if (!Array.isArray(c.at) || !isNum(c.at[0]) || !isNum(c.at[1])) throw new Error(`buildTerrain: internal crossing "${c.id}": at must be [x, z]`);
      if (c.axis !== 'x' && c.axis !== 'z') throw new Error(`buildTerrain: internal crossing "${c.id}": axis must be 'x' or 'z'`);
      if (!isNum(c.width) || c.width <= 0) throw new Error(`buildTerrain: internal crossing "${c.id}": width must be a positive number`);
      if (!isNum(c.from) || !isNum(c.to)) throw new Error(`buildTerrain: internal crossing "${c.id}": from and to must be numbers`);
      const kind = c.kind ?? 'path';
      const alongX = c.axis === 'x';
      const line = alongX ? c.at[0] : c.at[1];
      const centre = alongX ? c.at[1] : c.at[0];
      const half = c.width / 2;
      const sign = c.dir === -1 ? -1 : 1;
      const e = d.envelope;
      const far = sign > 0 ? (alongX ? e.x1 : e.z1) : (alongX ? e.x0 : e.z0);
      const room = Math.abs(far - line);
      const record = {
        id: c.id, mate: null, internal: true, in: c.in, kind, alongX, line, centre,
        width: c.width, y: c.from, halves: [],
      };
      record.halves.push(buildHalf({
        c, kind, where: `internal crossing "${c.id}"`, districtId: d.id,
        baseY: c.from, target: c.to, alongX, line, centre, half, sign, room, landingM: 0,
      }));
      crossings.push(record);
      continue;
    }

    const ref = socketIndex.get(c.socket);
    if (!ref) throw new Error(`buildTerrain: terrain.crossings names socket "${c.socket}", which is not in the plan`);
    const mateRef = socketIndex.get(ref.socket.mate);
    if (!mateRef) throw new Error(`buildTerrain: socket "${c.socket}" has no mate "${ref.socket.mate}" — a crossing has two sides`);
    const kind = c.kind ?? ref.socket.kind ?? 'path';
    const s = ref.socket;
    const alongX = s.axis === 'x';           // route crosses along x => boundary is x = const
    const line = alongX ? s.at[0] : s.at[1];
    const centre = alongX ? s.at[1] : s.at[0];
    const half = s.width / 2;
    if (crossingIds.has(s.id)) throw new Error(`buildTerrain: two crossings called "${s.id}"`);
    crossingIds.add(s.id);

    const record = { id: s.id, mate: s.mate, internal: false, kind, alongX, line, centre, width: s.width, y: s.y, halves: [] };
    for (const side of [ref, mateRef]) {
      const e = side.district.envelope;
      const mid = alongX ? (e.x0 + e.x1) / 2 : (e.z0 + e.z1) / 2;
      const sign = mid >= line ? 1 : -1;
      /* SHELF-AWARE (Hollowbrook).  The half used to ramp from the socket's
       * y to the DISTRICT LEVEL, which is right for a flat district and
       * wrong the moment a route crosses a boundary ON a shelf: a wall-walk
       * socket at y 5 into a level-0 district became a 40 m ramp into the
       * street.  The target is the flat the socket lands on in that district
       * — the highest shelf of that district covering the point half a metre
       * inside the boundary, else the level — so a walk crosses every
       * boundary flat and a street socket still ramps to the street. */
      const px = alongX ? line + sign * 0.5 : centre;
      const pz = alongX ? centre : line + sign * 0.5;
      let target = levelById.get(side.district.id).y;
      for (const S of shelves) if (S.in === side.district.id && inRect(px, pz, S) && S.y > target) target = S.y;
      record.halves.push(buildHalf({
        c, kind, where: `crossing "${s.id}"`, districtId: side.district.id,
        baseY: s.y, target, alongX, line, centre, half, sign,
        room: Math.abs((sign > 0 ? (alongX ? e.x1 : e.z1) : (alongX ? e.x0 : e.z0)) - line),
        landingM: LANDING_M,
      }));
    }
    crossings.push(record);
  }

  const stairAt = (x, z) => {
    for (const r of stairRects) if (inRect(x, z, r)) return r;
    return null;
  };
  const crossingHalfAt = (x, z) => {
    for (const c of crossings) {
      for (const h of c.halves) if (inRect(x, z, h.corridor)) return { c, h };
    }
    return null;
  };
  const flatAt = (x, z) => {
    /* MAX over the flats containing the point, not the first match.  Two
     * envelopes share their boundary line exactly, so a node on it is
     * inside both: taking the max puts the node at the HIGHER level and
     * draws the change as a face on the lower side, which is what a
     * terrace edge is.  Taking "whichever was first" makes the face's
     * position depend on array order.  A shelf is in this list too, so it
     * simply wins over its district's level where it applies, and two
     * shelves that overlap resolve the same way: higher wins. */
    let best = null;
    for (const L of flats) if (inRect(x, z, L) && (best === null || L.y > best.y)) best = L;
    return best;
  };
  const levelAt = (x, z) => flatAt(x, z)?.y ?? null;

  /* ---- 4b. mounds: masked so a designed flat is never disturbed ------ *
   * Every rect the terrain has PROMISED a height at: shelves, crossing
   * corridors and treads.  Not district levels — a mound that could not
   * lift a district's own ground would be a mound with nowhere to stand.
   */
  const FLAT_RECTS = [...shelves, ...corridors, ...treads];
  function moundKeepAt(x, z) {
    if (!FLAT_RECTS.length) return 1;
    let d = Infinity;
    for (const r of FLAT_RECTS) {
      const q = distOutside(x, z, r);
      if (q <= MOUND_KEEP_M) return 0;   // exact zero, by construction
      if (q < d) d = q;
    }
    return smoothstep(MOUND_KEEP_M, MOUND_KEEP_M + MOUND_FADE_M, d);
  }
  function moundAt(x, z) {
    if (!MOUNDS.length) return 0;
    let y = 0;
    for (const m of MOUNDS) {
      if (Math.abs(x - m.x) > m.rx || Math.abs(z - m.z) > m.rz) continue;
      y += dome(x, z, m.x, m.z, m.rx, m.rz, m.h);
    }
    return y === 0 ? 0 : y * moundKeepAt(x, z);
  }
  /** Which mound dominates here — for the cell tone, nothing else. */
  const moundToneAt = (x, z) => {
    let best = null;
    let bv = 0;
    for (const m of MOUNDS) {
      if (Math.abs(x - m.x) > m.rx || Math.abs(z - m.z) > m.rz) continue;
      const v = dome(x, z, m.x, m.z, m.rx, m.rz, m.h);
      if (Math.abs(v) > Math.abs(bv)) { bv = v; best = m; }
    }
    return best?.tone ?? 'bank';
  };

  /* ---- 5. the field: the DRAWN surface ------------------------------ */
  function baseFieldAt(x, z) {
    const ch = crossingHalfAt(x, z);
    if (ch) {
      const { c, h } = ch;
      const a = c.alongX ? x : z;
      const t = h.run > 1e-9 ? clamp(((a - h.a0) * h.sign) / h.run, 0, 1) : 0;
      const y = c.y + (h.target - c.y) * t;
      // under a flight the field runs just below the treads, so the two are
      // never coplanar — a coin toss the renderer re-tosses every frame
      return c.kind === 'stairs' && h.steps > 0 && inRect(x, z, h.runRect) ? y - 0.05 : y;
    }
    const L = levelAt(x, z);
    if (L !== null) return L;

    // the surrounds: blended out of the nearest levels, into the treatment.
    // District levels only: a shelf is inside an envelope and has no say in
    // what the ground does beyond every envelope.
    let wsum = 0;
    let ysum = 0;
    let dmin = Infinity;
    for (const l of levels) {
      const d = distOutside(x, z, l);
      if (d < dmin) dmin = d;
      const w = 1 / (d + 0.08) ** 2;
      wsum += w;
      ysum += w * l.y;
    }
    const near = wsum ? ysum / wsum : surY;
    const t = smoothstep(0, blendM, dmin);
    return near * (1 - t) + surY * t + roughAt(x, z) * t;
  }
  /** The drawn surface: the declared field, plus whatever the mounds add. */
  function fieldAt(x, z) {
    const b = baseFieldAt(x, z);
    return MOUNDS.length ? b + moundAt(x, z) : b;
  }

  /* ---- 6. the conforming grid --------------------------------------- *
   * Every designed edge is a grid line before anything is subdivided.
   */
  const xcuts = [];
  const zcuts = [];
  for (const d of plan.districts) {
    // the envelope edge itself AND a hairline outside it: the thin cell
    // between them is what DRAWS a level change as a vertical face instead
    // of ramping it across a whole cell of the lower district's ground
    for (const v of [d.envelope.x0, d.envelope.x1]) xcuts.push(v, v - SCARP_M, v + SCARP_M);
    for (const v of [d.envelope.z0, d.envelope.z1]) zcuts.push(v, v - SCARP_M, v + SCARP_M);
  }
  /* A SHELF EDGE IS A DESIGNED EDGE.  Same treatment as an envelope's, and
   * for the same reason: without the line, the cell straddling it is part
   * shelf and part the ground beside it, `cellTop` takes the minimum, and
   * the height the shelf was promised is rounded off by the drop next to
   * it.  The hairline either side is what draws the change as a vertical
   * face rather than ramping five metres across one cell of open ground. */
  for (const s of shelves) {
    for (const v of [s.x0, s.x1]) xcuts.push(v, v - SCARP_M, v + SCARP_M);
    for (const v of [s.z0, s.z1]) zcuts.push(v, v - SCARP_M, v + SCARP_M);
  }
  /* A mound is smooth, so nothing about it is a hard edge — but the walked
   * surface is min-over-corners, and on a dome that means the player stands
   * as far below the drawn mesh as the cell falls.  Size the cuts from the
   * dome's own peak gradient (DOME_PEAK_SLOPE) so no cell over a mound
   * falls more than MOUND_CELL_RISE_M.  These lines run the full width of
   * the city — the lattice is a tensor product — so mounds are cheapest
   * few and generous in radius. */
  for (const m of MOUNDS) {
    const put = (arr, lo, hi, r) => {
      const w = clamp((MOUND_CELL_RISE_M * r) / Math.max(1e-6, DOME_PEAK_SLOPE * Math.abs(m.h)), 0.5, cell);
      const n = Math.ceil((hi - lo) / w);
      for (let i = 0; i <= n; i += 1) arr.push(lo + ((hi - lo) * i) / n);
    };
    put(xcuts, m.x - m.rx, m.x + m.rx, m.rx);
    put(zcuts, m.z - m.rz, m.z + m.rz, m.rz);
  }
  /* A CORRIDOR EDGE IS A DESIGNED EDGE TOO (Hollowbrook).  `inRect` is
   * inclusive, so a grid node lying exactly on a flight's side edge takes
   * the ramp's height, and min-over-corners then lowers the whole cell
   * BESIDE the flight by up to the ramp's drop there — measured 0.25 m on
   * the market's east rim, one cell out from the east stair.  The same
   * hairline the shelves get puts that dip in a 6 cm cell that draws as
   * the flight's cheek, and the next cell is the flat it was promised. */
  for (const r of corridors) {
    for (const v of [r.x0, r.x1]) xcuts.push(v, v - SCARP_M, v + SCARP_M);
    for (const v of [r.z0, r.z1]) zcuts.push(v, v - SCARP_M, v + SCARP_M);
  }
  for (const t of treads) { xcuts.push(t.x0, t.x1); zcuts.push(t.z0, t.z1); }
  for (const c of crossings) {
    // subdivide a ramp finely enough that min-over-corners never sits far
    // under the drawn rake: one cell may fall at most MAX_CELL_RISE_M
    for (const h of c.halves) {
      if (c.kind === 'stairs' || h.run <= 1e-9) continue;
      const n = Math.max(1, Math.ceil(Math.abs(h.drop) / MAX_CELL_RISE_M));
      for (let i = 0; i <= n; i += 1) {
        const a = h.a0 + h.sign * (h.run * i) / n;
        if (c.alongX) xcuts.push(a); else zcuts.push(a);
      }
    }
    const half = c.width / 2;
    if (c.alongX) zcuts.push(c.centre - half, c.centre + half);
    else xcuts.push(c.centre - half, c.centre + half);
  }
  const XS = axisLines(footprint.x0, footprint.x1, xcuts, cell);
  const ZS = axisLines(footprint.z0, footprint.z1, zcuts, cell);

  /* ---- 7. the walked surface ---------------------------------------- *
   * min over the cell's four corners, quantised DOWN (which only ever
   * lowers, so the guarantee survives it) so a smooth slope produces runs
   * of equal-height cells that merge into single rects.
   */
  const quant = (v) => {
    const q = Math.floor(v / QUANT_M + 1e-6) * QUANT_M;
    return Math.round(q * 10000) / 10000;
  };
  /* The field at every grid NODE, once.  These are exactly the nodes the
   * drawn mesh uses, so the min-over-corners guarantee is unchanged — but a
   * mound subdivides the lattice hard, and evaluating the field four times
   * per cell instead of once per node is four times the work over the whole
   * city for the same numbers. */
  const FIELD = ZS.map((z) => XS.map((x) => fieldAt(x, z)));
  const cellTop = (i, j) => {
    const a = FIELD[j][i];
    const b = FIELD[j][i + 1];
    const c = FIELD[j + 1][i];
    const d = FIELD[j + 1][i + 1];
    const lo = Math.min(a, b, c, d);
    // flat cell: answer its exact height, so a contracted 1.2 m terrace is
    // 1.2 m and not 1.15 because the quantum happened to fall there
    if (Math.max(a, b, c, d) - lo < 1e-9) return Math.round(lo * 10000) / 10000;
    return quant(lo);
  };

  /** The walked ground anywhere in the world — the terrain's whole API. */
  function terrainHeightAt(x, z) {
    for (const t of treads) if (inRect(x, z, t)) return t.top;
    const i = lastBelow(XS, x);
    const j = lastBelow(ZS, z);
    return cellTop(i, j);
  }

  /* ---- 8. drawn geometry, pooled per tone --------------------------- */
  const APX = [footprint.x0 - APRON_M, ...XS, footprint.x1 + APRON_M];
  const APZ = [footprint.z0 - APRON_M, ...ZS, footprint.z1 + APRON_M];
  /* APX is [footprint.x0 - APRON, ...XS, footprint.x1 + APRON], so an
   * interior node is exactly FIELD[j - 1][i - 1] — the same numbers the
   * walked surface is derived from, by construction rather than by two
   * evaluations that happen to agree. */
  const H = APZ.map((z, j) => APX.map((x, i) => (
    (i === 0 || i === APX.length - 1 || j === 0 || j === APZ.length - 1)
      ? surY - 1.1   // the apron falls away, so nothing ends in a cut
      : FIELD[j - 1][i - 1])));

  const pools = new Map();
  const push = (key, a, b, c) => {
    if (!pools.has(key)) pools.set(key, []);
    const out = pools.get(key);
    out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };
  const P = (i, j) => [APX[i], H[j][i], APZ[j]];

  for (let j = 0; j < APZ.length - 1; j += 1) {
    for (let i = 0; i < APX.length - 1; i += 1) {
      const p00 = P(i, j);
      const p10 = P(i + 1, j);
      const p01 = P(i, j + 1);
      const p11 = P(i + 1, j + 1);
      const cx = (APX[i] + APX[i + 1]) / 2;
      const cz = (APZ[j] + APZ[j + 1]) / 2;
      const cy = (p00[1] + p10[1] + p01[1] + p11[1]) / 4;
      const dx = (p10[1] - p00[1] + p11[1] - p01[1]) / (2 * Math.max(1e-6, APX[i + 1] - APX[i]));
      const dz = (p01[1] - p00[1] + p11[1] - p10[1]) / (2 * Math.max(1e-6, APZ[j + 1] - APZ[j]));
      const slope = Math.hypot(dx, dz);
      // decided ONCE per cell at its centre, never per triangle: a jittered
      // per-triangle choice comes out as a zip of alternating tones along
      // every boundary, which is what a tone boundary must never look like
      let key;
      const lift = MOUNDS.length ? moundAt(cx, cz) : 0;
      if (crossingHalfAt(cx, cz)) key = 'paving';
      // a cell a mound has lifted is landform, whatever is declared under
      // it: a rock standing out of a district reads as rock, not as the
      // district's paving tinted by a shadow
      else if (Math.abs(lift) > MOUND_TONE_M) key = moundToneAt(cx, cz);
      else if (flatAt(cx, cz)) key = flatAt(cx, cz).tone ?? 'ground';
      else if (slope > 0.5) key = 'bank';
      else if (surKind === 'water' && cy < waterY + 0.45) key = 'shore';
      else key = 'surrounds';
      // ALTERNATING diagonals: one direction everywhere gives the ground a
      // diagonal grain the ink pass draws as parallel creases down a slope
      if ((i + j) & 1) { push(key, p00, p11, p10); push(key, p00, p01, p11); }
      else { push(key, p00, p01, p10); push(key, p10, p01, p11); }
    }
  }

  /* skirt: vertical walls round the apron and a floor — a closed solid, so
   * the world has no severed edge from any camera above eye height */
  const FLOOR = surY - 4.0;
  const ring = [];
  const nx = APX.length;
  const nz = APZ.length;
  for (let i = 0; i < nx; i += 1) ring.push([APX[i], H[0][i], APZ[0]]);
  for (let j = 1; j < nz; j += 1) ring.push([APX[nx - 1], H[j][nx - 1], APZ[j]]);
  for (let i = nx - 2; i >= 0; i -= 1) ring.push([APX[i], H[nz - 1][i], APZ[nz - 1]]);
  for (let j = nz - 2; j >= 1; j -= 1) ring.push([APX[0], H[j][0], APZ[j]]);
  const ringCx = (APX[0] + APX[nx - 1]) / 2;
  const ringCz = (APZ[0] + APZ[nz - 1]) / 2;
  for (let n = 0; n < ring.length; n += 1) {
    const a = ring[n];
    const b = ring[(n + 1) % ring.length];
    const ad = [a[0], FLOOR, a[2]];
    const bd = [b[0], FLOOR, b[2]];
    // wind away from the solid's own axis, so a wall can never be inside-out
    const ox = (a[0] + b[0]) / 2 - ringCx;
    const oz = (a[2] + b[2]) / 2 - ringCz;
    if ((b[2] - a[2]) * ox - (b[0] - a[0]) * oz > 0) { push('skirt', a, ad, bd); push('skirt', a, bd, b); }
    else { push('skirt', a, bd, ad); push('skirt', a, b, bd); }
  }
  const f = (i, j) => [APX[i], FLOOR, APZ[j]];
  push('skirt', f(0, 0), f(nx - 1, nz - 1), f(nx - 1, 0));
  push('skirt', f(0, 0), f(0, nz - 1), f(nx - 1, nz - 1));

  /* the stair treads: drawn as one merged pool with the paving */
  const treadPool = [];
  const boxTris = (r, top, bottom) => {
    const v = [
      [r.x0, bottom, r.z0], [r.x1, bottom, r.z0], [r.x1, bottom, r.z1], [r.x0, bottom, r.z1],
      [r.x0, top, r.z0], [r.x1, top, r.z0], [r.x1, top, r.z1], [r.x0, top, r.z1],
    ];
    const quad = (a, b, c, d) => { treadPool.push(...v[a], ...v[b], ...v[c], ...v[a], ...v[c], ...v[d]); };
    quad(4, 7, 6, 5);           // top
    quad(0, 1, 2, 3);           // bottom
    quad(0, 4, 5, 1);           // -z
    quad(2, 6, 7, 3);           // +z
    quad(3, 7, 4, 0);           // -x
    quad(1, 5, 6, 2);           // +x
  };
  for (const t of treads) boxTris(t, t.top, Math.min(t.top, surY) - 0.6);

  const group = new THREE.Group();
  group.name = 'terrain';
  let triangles = 0;
  const mesh = (list, mat, name) => {
    if (!list.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
    geo.computeVertexNormals();   // non-indexed: this IS flat shading
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.castShadow = true;
    m.receiveShadow = true;
    triangles += list.length / 9;
    group.add(m);
  };
  for (const [key, list] of pools) mesh(list, M[key] ?? M.ground, `terrain:${key}`);
  mesh(treadPool, M.paving, 'terrain:treads');

  if (surKind === 'water') {
    /* Four times the footprint, deliberately: the ground's apron may end at
     * the world's edge but WATER may not be seen to. A water plane sized to
     * the footprint puts its own straight edge in every overhead and oblique
     * frame, which reads as exactly the severed edge the apron exists to
     * remove. Beyond the ground it costs two triangles. */
    const w = (footprint.x1 - footprint.x0 + 2 * APRON_M) * 4;
    const d = (footprint.z1 - footprint.z0 + 2 * APRON_M) * 4;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.water);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set((footprint.x0 + footprint.x1) / 2, waterY, (footprint.z0 + footprint.z1) / 2);
    plane.name = 'terrain:water';
    plane.receiveShadow = true;
    group.add(plane);
    triangles += 2;
  }
  ctx.add(group, 'terrain');

  /* ---- 9. platform registrations for the walker --------------------- */
  const own = () => { ctx.platforms[ctx.platforms.length - 1].owner = 'terrain'; };
  for (const t of treads) { ctx.platform(t.x0, t.z0, t.x1, t.z1, t.top); own(); }

  let cells = 0;
  for (let j = 0; j < ZS.length - 1; j += 1) {
    const z0 = ZS[j];
    const z1 = ZS[j + 1];
    const cz = (z0 + z1) / 2;
    let runStart = -1;
    let runY = 0;
    const flush = (iEnd) => {
      if (runStart < 0) return;
      ctx.platform(XS[runStart], z0, XS[iEnd], z1, runY);
      own();
      cells += 1;
      runStart = -1;
    };
    for (let i = 0; i < XS.length - 1; i += 1) {
      const cx = (XS[i] + XS[i + 1]) / 2;
      // a cell inside a flight would be the MAX over the tread beside it and
      // would seal the climb: the treads ARE the ground there
      if (stairAt(cx, cz)) { flush(i); continue; }
      const y = cellTop(i, j);
      if (runStart >= 0 && Math.abs(y - runY) < 1e-9) continue;
      flush(i);
      runStart = i;
      runY = y;
    }
    flush(XS.length - 1);
  }

  const stats = {
    nodes: APX.length * APZ.length,
    cells: (XS.length - 1) * (ZS.length - 1),
    platforms: cells + treads.length,
    treads: treads.length,
    shelves: shelves.length,
    mounds: MOUNDS.length,
    internalCrossings: crossings.filter((c) => c.internal).length,
    triangles: Math.round(triangles),
    meshes: group.children.length,
    tones: [...pools.keys()],
    cell_m: cell,
    footprint,
  };

  return {
    terrainHeightAt, group, footprint, levels, shelves, mounds: MOUNDS,
    crossings, treads, stats,
    // exported for gates and probes: "how much did the mounds move this
    // point" is the question a designed-flat regression is asked in
    moundAt,
  };
}
