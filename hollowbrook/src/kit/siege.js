import * as THREE from 'three';
import { JOINERY } from '../palette.js';
import { M, painted, glowing } from './mats.js';
import { rng, bx, cyl, tubeGeo, parts, place, tagProp, polyGeometry, pushTri } from './util.js';
import { seatOnGround } from '../builders.js';
import { lightPool, withPools } from './props.js';
import { roundTower, faceFrame } from './buildings.js';

/* ==================================================================== *
 * THE SIEGE KIT — everything Hollowbrook needs that Thistledown's kit
 * does not have, because Thistledown was a fair and this is a raid.
 *
 * READ THIS FIRST, because two of it decide every number below.
 *
 * 1. THE WALL IS TERRAIN AND THIS FILE IS ITS DRESSING.  `city-plan.json`'s
 *    terrain already carries the whole perimeter: a 2.4 m shelf at y 5.0
 *    between x/z 48.8 and 51.2, gapped only at the two gates, with a 5 m
 *    scarp on each side of it and one stair per district up to it.  It is
 *    walkable and gate-proven (`check-terrain.mjs`) before a single stone
 *    stands.  `curtainWall` puts masonry on the two scarps and a parapet on
 *    the walk; `gatehouse` bridges a gap; `stairTurret` dresses a stair
 *    head.  NONE of them lays ground, and none of them may move a promised
 *    height.
 *
 * 2. A COLLIDER NOW CARRIES `top` AND `bottom`, AND THE WHOLE PERIMETER
 *    DEPENDS ON IT.  `ctx.collide(x0, z0, x1, z1, top, bottom)`:
 *
 *      bottom   a parapet 5 m up FENCES THE WALK and must not wall the
 *               street underneath it.  Without `bottom` every run of this
 *               wall would put a 1.03 m band of dead ground along the foot
 *               of the curtain, and the gatehouse's own parapet would seal
 *               the gate passage outright — a 7 m opening with a wall
 *               across it that renders perfectly and that no frame shows.
 *      top      the gatehouse's piers are solid stone FROM THE ROAD and
 *               are WALKED OVER at 5 m.  Without `top` the wall-walk stops
 *               dead at both gatehouses and the flood fill says the walk
 *               is two arcs, which is exactly what it said the first time.
 *
 *    `colliderBlocks` in src/builders.js is the ONE copy of that
 *    arithmetic; the player, the route fill and the nav grid all call it.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO
 *
 *   - It never registers a collider on a scarp FACE.  The terrain's cliff
 *     is already unwalkable; a second wall there is 0.68 m of dead walk.
 *   - It never fences the INNER edge of the wall-walk.  That is a decision
 *     and not an omission: the inner edge is the walk's way DOWN (a 5 m
 *     drop into the street), which is what `DISTRICT-BRIEFS/_COMMON.md`
 *     asks every piece of high ground for — "a way down that is not the
 *     way up".  The inner kerb is 0.34 m and carries no collider.
 *   - It builds no portcullis MECHANIC.  Every gatehouse carries a real
 *     raised portcullis in `userData.portcullis`; dropping it is KIT-GAPS
 *     item 9 and is explicitly later.
 * ==================================================================== */

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** The perimeter contract's own numbers, and the parapet's proportions.
 *  Everything reads `plan.siege` when it is handed one and falls back to
 *  these, so a scratch harness with no plan still builds the right wall. */
export const SIEGE = Object.freeze({
  walkY: 5.0,
  inner: 48.8,
  outer: 51.2,
  parapetH: 1.15,
  /* A parapet is not one wall: it is a solid breast to `crenelY`, merlons
   * above that, and a coping on both.  Crenel sill at 0.55 of a 1.15 m
   * parapet puts the embrasure at a standing archer's chest, which is the
   * only proportion that reads as a fighting top rather than as a kerb. */
  crenelY: 0.55,
  merlonW: 0.86,
  crenelW: 0.54,
  parapetT: 0.60,
  kerbH: 0.34,
  kerbT: 0.30,
  /* Passage clear width at a gate.  KIT-GAPS asks for >= 5.0 m and the
   * gaps are 7.0 m, so the jambs may be 0.65 m each.  5.70 geometric is
   * 5.02 m WALKABLE once the player's 0.34 m radius is added to both
   * jambs, which is the number that actually matters. */
  passageClear: 5.70,
});

const siegeOf = (plan) => ({
  walkY: plan?.siege?.wall_walk_y ?? SIEGE.walkY,
  inner: plan?.siege?.wall_inner ?? SIEGE.inner,
  outer: plan?.siege?.wall_outer ?? SIEGE.outer,
  parapetH: plan?.siege?.parapet_h ?? SIEGE.parapetH,
});

/* ---- the wall's two axes ------------------------------------------------
 * A perimeter has four runs and only two of them are along x.  Writing the
 * arithmetic twice is how one of the four ends up mirrored, so it is
 * written once here: `u` runs ALONG the wall, `v` is a signed coordinate
 * ACROSS it, and `out` is +1 where outward is +u's partner axis.
 */
const SIDES = Object.freeze({
  s: { axis: 'x', out: 1 },
  n: { axis: 'x', out: -1 },
  e: { axis: 'z', out: 1 },
  w: { axis: 'z', out: -1 },
});

function wallFrame(side, plan, o = {}) {
  const S = SIDES[side];
  if (!S) throw new Error(`[siege] curtainWall: side must be 's' | 'n' | 'e' | 'w', got ${side}`);
  const P = siegeOf(plan);
  const walkY = o.y ?? P.walkY;
  const s = S.out;
  const IN = s * (o.inner ?? P.inner);
  const OUT = s * (o.outer ?? P.outer);
  const alongX = S.axis === 'x';
  return {
    side, alongX, s, IN, OUT, walkY,
    parapetH: o.parapetH ?? P.parapetH,
    /** world [x, z] of a point (u along the wall, v across it) */
    world: (u, v) => (alongX ? [u, v] : [v, u]),
    /** a box: `du` along the wall, `dv` across it. Axis-aligned by
     *  construction, so the two cases are a swap and never a rotation. */
    box: (du, h, dv, u, y, v, opts) => (alongX ? bx(du, h, dv, u, y, v, opts) : bx(dv, h, du, v, y, u, opts)),
    /** a collider rect from wall coordinates */
    rect: (u0, u1, v0, v1) => (alongX
      ? { x0: Math.min(u0, u1), x1: Math.max(u0, u1), z0: Math.min(v0, v1), z1: Math.max(v0, v1) }
      : { x0: Math.min(v0, v1), x1: Math.max(v0, v1), z0: Math.min(u0, u1), z1: Math.max(u0, u1) }),
    /** the rake key + sign for a plane that must fall OUTWARD.
     *  A box along Z rotated by +t about X sends its +z end DOWN; a box
     *  along X rotated by +t about Z sends its +x end UP.  Both signs are
     *  derived here once rather than guessed at four call sites. */
    fallOut: (t) => (alongX ? { rx: s * t } : { rz: -s * t }),
  };
}

/* ==================================================================== *
 * 1.  CURTAIN WALL
 * ==================================================================== */

/**
 * Face one run of the terrain's wall-walk shelf as a curtain wall.
 *
 * @param {object}   o
 * @param {number}   o.from  where the run starts ALONG the wall (an x for
 *                   the north and south runs, a z for east and west)
 * @param {number}   o.to    where it ends
 * @param {'s'|'n'|'e'|'w'} o.side which side of the town it is
 * @param {object}   o.ctx   the district ctx
 * @param {object}   [o.plan] the city plan, for `siege`'s numbers
 * @param {string[]} [o.endCaps] `['pier'|'tower'|'none', ...]` for the low
 *                   and high ends.  A WALL THAT STOPS IN MID-AIR IS A GREY
 *                   CARD: pass 'none' only where a corner tower, a
 *                   gatehouse or another district's run continues it.
 * @param {boolean}  [o.hoardings] the odd timber fighting gallery
 * @returns {THREE.Group}
 *
 * @example
 *   curtainWall({ from: -18, to: -3.5, side: 's', ctx, plan,
 *                 endCaps: ['none', 'none'] });   // west of the south gate
 */
export function curtainWall({
  from, to, side, ctx, plan = null, seed = null,
  y = null, parapetH = null, inner = null, outer = null,
  endCaps = ['pier', 'pier'], hoardings = true, weeps = true, corbels = true,
  innerFace = true, name = null,
}) {
  if (!ctx) throw new Error('[siege] curtainWall needs a ctx — it registers the parapet colliders');
  const F = wallFrame(side, plan, { y, parapetH, inner, outer });
  const u0 = Math.min(from, to);
  const u1 = Math.max(from, to);
  const len = u1 - u0;
  if (len < 0.5) throw new Error(`[siege] curtainWall: run ${u0}..${u1} on side '${side}' is ${len.toFixed(2)} m long`);
  const r = rng(seed ?? `curtain-${side}-${u0}-${u1}`);
  const g = new THREE.Group();
  const P = parts();
  const { s, IN, OUT, walkY } = F;
  const PH = F.parapetH;
  const put = (mat, du, h, dv, u, yy, v, opts) => P.add(mat, F.box(du, h, dv, u, yy, v, opts));
  const gAt = (u, v) => ctx.groundAt(...F.world(u, v));

  /* ---- the two scarp facings -------------------------------------------
   * The terrain drew a 5 m cliff on each side of the shelf.  The facing
   * stands PROUD of that plane and BATTERS: thick at the foot, thin at the
   * wall head.  A vertical slab reads as a fence; a batter reads as mass,
   * and it is four boxes.
   *
   * Segmented at 3 m and each segment seated on ITS OWN ground, because
   * the surrounds are not a plane and a run laid to one level is buried at
   * one end and floating at the other. */
  const SEG = 3.0;
  const nSeg = Math.max(1, Math.round(len / SEG));
  const segL = len / nSeg;
  const bandsOuter = 4;
  /* THE TONE IS CHOSEN PER COURSE, NOT PER STONE, and the first cut chose it
   * per segment-band from three tones a long way apart (including `coping`,
   * which is the palest stone in the town).  What came back was a
   * CHECKERBOARD: a 40 m wall in 3 m x 1.2 m rectangles of alternating
   * value, which reads as damage, not as masonry.  A wall reads horizontally
   * because its courses run horizontally — so the band index picks the tone
   * and only about one segment in seven deviates, which is a repair. */
  const bandTone = [];
  for (let b = 0; b < 8; b += 1) bandTone.push(r.chance(0.34) ? M.graniteWarm : M.curtain);
  /* and NO per-segment deviation: a one-in-seven jump of a 3 x 1.2 m
   * rectangle to another tone is a patchwork, not a repair, because the
   * patch is the size of the SEGMENT rather than the size of a stone.  The
   * stone-scale variation is already there — `surface.js` puts a joint-and-
   * lichen map on all three curtain tones, and that is the right scale for
   * it.  A generator that varies tone at its own construction grid is
   * telling you where its construction grid is. */
  const tone = (b) => bandTone[b % bandTone.length];

  let footLow = Infinity;
  for (let i = 0; i < nSeg; i += 1) {
    const uc = u0 + (i + 0.5) * segL;
    const gy = gAt(uc, OUT + s * 0.75);
    footLow = Math.min(footLow, gy);
    // a plinth: the wall comes OUT of the ground rather than standing on it
    put(M.curtainDark, segL + 0.02, 0.62, 0.70, uc, gy + 0.25, OUT + s * 0.35);
    for (let b = 0; b < bandsOuter; b += 1) {
      const y0 = gy + 0.5 + (walkY - gy - 0.5) * (b / bandsOuter);
      const y1 = gy + 0.5 + (walkY - gy - 0.5) * ((b + 1) / bandsOuter);
      const t = 0.46 - 0.068 * b;             // the batter: 0.46 -> 0.19
      put(tone(b), segL + 0.02, y1 - y0 + 0.01, t, uc, (y0 + y1) / 2, OUT + s * (t / 2));
    }
    // a string course, and it stands proud of the top band (0.19) by 0.16
    put(M.coping, segL + 0.02, 0.17, 0.30, uc, walkY - 1.9, OUT + s * 0.20);

    if (innerFace) {
      const iy = gAt(uc, IN - s * 0.75);
      put(M.curtainDark, segL + 0.02, 0.5, 0.5, uc, iy + 0.2, IN - s * 0.25);
      for (let b = 0; b < 3; b += 1) {
        const y0 = iy + 0.4 + (walkY - iy - 0.4) * (b / 3);
        const y1 = iy + 0.4 + (walkY - iy - 0.4) * ((b + 1) / 3);
        const t = 0.32 - 0.06 * b;
        put(tone(b + 4), segL + 0.02, y1 - y0 + 0.01, t, uc, (y0 + y1) / 2, IN - s * (t / 2));
      }
    }
  }

  /* weep holes: a WEEPER IS A SPOUT, not a hole.  You cannot carve a recess
   * into a box (the kit's first rule), so this is a stone chute standing
   * proud of the face with a dark mouth on the end of it — depth built
   * outward, which is the only way it reads at all. */
  if (weeps) {
    for (let u = u0 + 2.3; u < u1 - 1.0; u += 4.6) {
      const gy = gAt(u, OUT + s * 0.75);
      /* JUST ABOVE THE PLINTH.  At 1.55 m they sat in the middle of the face
       * and read as a row of tiny windows — which on a defensive wall is
       * exactly the wrong reading.  A weeper drains the wall's core at its
       * base, and at 0.9 m it is unmistakably plumbing. */
      put(M.curtainDark, 0.24, 0.13, 0.36, u, gy + 0.9, OUT + s * 0.20);
      put(M.ironDark, 0.12, 0.085, 0.07, u, gy + 0.9, OUT + s * 0.40);
    }
  }

  /* corbels under the wall head: what gives a 5 m face its scale */
  if (corbels) {
    for (let u = u0 + 0.6; u < u1 - 0.3; u += 1.15) {
      put(M.curtainDark, 0.25, 0.34, 0.42, u, walkY - 0.44, OUT + s * 0.25);
    }
  }

  /* ---- the parapet ------------------------------------------------------
   * It stands ON the shelf (its inner face is 0.40 m inboard of the outer
   * plane) and oversails it by 0.20.  Solid breast, then merlons with
   * embrasures between them, and a coping on both — the coping is the
   * PALEST stone in the town on purpose: it is the line that says where
   * the wall is, from anywhere. */
  const pV = OUT - s * 0.40;                 // inner face of the parapet
  const pC = OUT - s * 0.10;                 // its centre across the wall
  const CREN = SIEGE.crenelY;
  put(M.curtain, len, CREN, SIEGE.parapetT, (u0 + u1) / 2, walkY + CREN / 2, pC, { seg: Math.ceil(len / 2) });
  const period = SIEGE.merlonW + SIEGE.crenelW;
  for (let u = u0; u < u1 - 0.12; u += period) {
    const w = Math.min(SIEGE.merlonW, u1 - u);
    if (w > 0.14) {
      put(r.chance(0.3) ? M.curtainDark : M.curtain, w, PH - CREN - 0.09, SIEGE.parapetT, u + w / 2, walkY + CREN + (PH - CREN - 0.09) / 2, pC);
      put(M.coping, w + 0.11, 0.09, SIEGE.parapetT + 0.13, u + w / 2, walkY + PH - 0.045, pC);
    }
    // the embrasure's own sill, which is what stops a crenel reading as a
    // missing merlon
    const cu = u + SIEGE.merlonW;
    const cw = Math.min(SIEGE.crenelW, u1 - cu);
    if (cw > 0.1) put(M.coping, cw + 0.04, 0.08, SIEGE.parapetT + 0.10, cu + cw / 2, walkY + CREN + 0.04, pC);
  }

  /* ---- the inner kerb: 0.34 m, and NO COLLIDER (see the header) -------- */
  put(M.curtainDark, len, SIEGE.kerbH - 0.07, SIEGE.kerbT, (u0 + u1) / 2, walkY + (SIEGE.kerbH - 0.07) / 2, IN + s * (SIEGE.kerbT / 2), { seg: Math.ceil(len / 3) });
  put(M.coping, len, 0.07, SIEGE.kerbT + 0.12, (u0 + u1) / 2, walkY + SIEGE.kerbH - 0.035, IN + s * (SIEGE.kerbT / 2), { seg: Math.ceil(len / 3) });

  /* ---- hoardings: the odd timber fighting gallery ---------------------- */
  const hoardsAt = [];
  if (hoardings && len > 14) {
    const n = Math.max(1, Math.floor(len / 26));
    for (let k = 0; k < n; k += 1) {
      const u = u0 + len * ((k + 0.5) / n) + r.range(-2, 2);
      if (u - 1.6 < u0 + 1 || u + 1.6 > u1 - 1) continue;
      hoardsAt.push(u);
      const HL = 2.8;
      const proj = 1.25;
      // floor, carried on three rakers off the corbel course
      put(M.oak, HL, 0.13, proj, u, walkY - 0.06, OUT + s * (proj / 2), { seg: 3 });
      for (const du of [-HL / 2 + 0.2, 0, HL / 2 - 0.2]) {
        // a raker between two JOINTS: the corbel course and the floor's own
        // front edge, so neither end can be short of what it carries
        P.add(M.oak, tubeGeo(
          xyz(F, u + du, walkY - 1.35, OUT + s * 0.06),
          xyz(F, u + du, walkY - 0.16, OUT + s * (proj - 0.15)), 0.075, 5));
      }
      // the front boards, with the slots a hoarding exists for
      put(M.oak, HL, 1.35, 0.11, u, walkY + 0.72, OUT + s * (proj - 0.05), { seg: 3 });
      for (let j = -1; j <= 1; j += 1) put(M.ironDark, 0.11, 0.62, 0.05, u + j * 0.78, walkY + 0.78, OUT + s * (proj + 0.02));
      /* A shed roof falling outward — the rake is DERIVED, never guessed.
       * It is also HELD OUTBOARD OF THE PARAPET: written over the wall's
       * centre line it overhangs the WALK, and from a standing eye up there
       * a 3.2 x 2.0 m unmodulated dark plane is a black card across a
       * quarter of the frame.  Rafters under it, and `oak` rather than
       * `oakDark`, for the same reason. */
      const pitch = 0.38;
      put(M.oak, HL + 0.2, 0.09, proj + 0.3, u, walkY + PH + 0.2, OUT + s * (proj * 0.62), { ...F.fallOut(pitch), seg: 3 });
      for (const du of [-HL / 2 + 0.25, 0, HL / 2 - 0.25]) {
        put(M.oakDark, 0.1, 0.1, proj + 0.28, u + du, walkY + PH + 0.12, OUT + s * (proj * 0.62), F.fallOut(pitch));
      }
    }
  }

  /* ---- the ends: a pier, a tower's springing, or nothing --------------- */
  const capEnd = (u, dir, kind) => {
    if (kind === 'none') return;
    const gy = gAt(u - dir * 0.5, OUT + s * 0.75);
    const pw = 0.98;
    const uc = u - dir * pw / 2;
    put(M.curtainDark, pw, walkY + PH + 0.24 - gy, 0.86, uc, gy + (walkY + PH + 0.24 - gy) / 2, OUT + s * 0.30);
    put(M.coping, pw + 0.16, 0.12, 1.0, uc, walkY + PH + 0.30, OUT + s * 0.30);
    if (kind === 'tower') return;
    // a pier reads as a pier because it is CAPPED and because it rises
    // above the merlons; without either it is the same wall, 0.4 m fatter
    put(M.coping, pw - 0.2, 0.16, 0.7, uc, walkY + PH + 0.44, OUT + s * 0.26);
  };
  capEnd(u0, -1, endCaps[0] ?? 'pier');
  capEnd(u1, 1, endCaps[1] ?? 'pier');

  P.flush(g);
  g.name = name ?? `curtain-${side}-${Math.round(u0)}`;

  /* ---- colliders: THE PARAPET AND NOTHING ELSE ------------------------- *
   * `bottom` is the walk height, so it fences a walker up there and is not
   * there at all for anyone in the street or the field 5 m below.  One
   * rect per 12 m keeps the bucketed fill cheap. */
  const CH = 12;
  const nC = Math.max(1, Math.ceil(len / CH));
  for (let i = 0; i < nC; i += 1) {
    const a = u0 + (len * i) / nC;
    const b = u0 + (len * (i + 1)) / nC;
    const rc = F.rect(a, b, pV, OUT + s * 0.20);
    ctx.collide(rc.x0, rc.z0, rc.x1, rc.z1, undefined, walkY);
  }

  g.userData = {
    kind: 'curtain-wall', side, from: u0, to: u1, walkY, parapetH: PH,
    /** the walk's own free band across the wall, once the parapet's collider
     *  is inflated by the player's radius: the inner edge is open. */
    walkBand: [Math.min(IN, pV - s * 0.34), Math.max(IN, pV - s * 0.34)],
    hoardings: hoardsAt, footY: footLow,
  };
  ctx.add(g, g.name);
  return g;
}

/** world [x, y, z] of a wall-frame point — the tube joints need three. */
function xyz(F, u, y, v) {
  const [x, z] = F.world(u, v);
  return [x, y, z];
}

/* ==================================================================== *
 * 2.  GATEHOUSE
 * ==================================================================== */

/**
 * Bridge a terrain gate gap.
 *
 * Authored in a LOCAL frame — +z outward, +x along the wall, origin on the
 * ground at the centre of the gap — and placed by `place`, so there is one
 * rigid transform and no per-side arithmetic to get backwards.
 *
 * THE ARCH IS SEGMENTAL AND THAT IS FORCED, not stylistic.  The opening is
 * 5.70 m and the wall head is 5.00 m: a semicircular arch over that span
 * crowns at 2.85 m above its springing, so its springing would have to sit
 * at 1.75 m — head height at the jambs, i.e. a gate you cannot ride
 * through.  A segmental arch springing at 3.10 m and rising 1.35 crowns at
 * 4.45 and leaves 0.43 m of spandrel under the deck.  Both numbers were
 * solved, not chosen; change the opening and they move.
 *
 * @param {object} o
 * @param {object} o.gate  the plan's `siege.gates[id]` entry (`gap`,
 *                 `passage`), which is where the orientation comes from
 * @param {object} o.ctx
 * @returns {THREE.Group} with `userData.passage` (WORLD), `userData.portcullis`
 *          (a live group for KIT-GAPS 9) and `userData.practicals`
 */
export function gatehouse({
  gate, ctx, plan = null, seed = 'gatehouse', id = null,
  towers = true, torches = true, leaves = true, name = null,
  clear = SIEGE.passageClear, accent = null,
}) {
  if (!ctx) throw new Error('[siege] gatehouse needs a ctx');
  if (!gate?.gap || !gate?.passage) throw new Error('[siege] gatehouse needs the plan\'s gate entry ({ gap, passage })');
  const S = siegeOf(plan);
  const r = rng(seed);
  const gap = gate.gap;
  const pass = gate.passage;
  const gw = gap.x1 - gap.x0;
  const gd = gap.z1 - gap.z0;
  const alongX = gw > gd;
  const cx = (gap.x0 + gap.x1) / 2;
  const cz = (gap.z0 + gap.z1) / 2;
  const HU = (alongX ? gw : gd) / 2;                       // 3.5  half the opening
  const TH = (alongX ? gd : gw) / 2;                       // 1.2  half the wall thickness
  const PD = (alongX ? pass.z1 - pass.z0 : pass.x1 - pass.x0) / 2;  // 2.4 half the gatehouse depth
  const outSign = alongX ? Math.sign(cz) : Math.sign(cx);
  const yaw = alongX ? (outSign > 0 ? 0 : Math.PI) : (outSign > 0 ? Math.PI / 2 : -Math.PI / 2);

  const WY = S.walkY;
  const PH = S.parapetH;
  const JAMB = Math.min(clear, 2 * HU - 1.0) / 2;          // 2.85
  const DECKX = HU + 0.30;                                 // platforms OVERLAP the shelf, never meet
  const SPRING = 3.10;
  const RISE = 1.35;
  const CROWN = SPRING + RISE;                             // 4.45
  const ARCH_R = (JAMB * JAMB + RISE * RISE) / (2 * RISE); // 3.68
  const ARCH_Y = CROWN - ARCH_R;                           // the arc's centre, WELL below the springing
  const archHalf = (yy) => (yy <= SPRING ? JAMB : (yy >= CROWN ? 0 : Math.sqrt(Math.max(0, ARCH_R * ARCH_R - (yy - ARCH_Y) ** 2))));

  const g = new THREE.Group();
  const P = parts();
  const colliders = [];
  const platforms = [];

  /* ---- the two piers, coursed --------------------------------------- */
  for (const sx of [-1, 1]) {
    const w = HU - JAMB;
    const xc = sx * (JAMB + w / 2);
    P.add(M.curtainDark, bx(w + 0.22, 0.55, PD * 2 + 0.22, xc, 0.26, 0, { seg: 3 }));
    const COURSE = 0.42;
    for (let yy = 0.5; yy < WY - 0.02; yy += COURSE) {
      const h = Math.min(COURSE, WY - yy) - 0.018;
      const inset = (Math.round((yy - 0.5) / COURSE) & 1) ? 0.035 : 0;
      P.add(r.chance(0.28) ? M.curtainDark : M.curtain,
        bx(w - inset, h, PD * 2 - inset * 2, xc + sx * inset / 2, yy + h / 2, 0, { seg: 3 }));
    }
    /* SOLID FROM THE ROAD, WALKED OVER AT 5 m.  `top` is the whole reason
     * the wall-walk is one ring and not two arcs. */
    colliders.push({ x0: sx > 0 ? JAMB : -HU, x1: sx > 0 ? HU : -JAMB, z0: -PD, z1: PD, top: WY });
  }

  /* ---- the vault: courses whose ends stop at the INTRADOS ------------- *
   * A vault is a SOLID and the ring is the dressing on its face.  Stop the
   * courses at the extrados instead and the five metres between the two
   * face rings is a hole you look up at open sky through. */
  /* 0.17, not 0.30.  The soffit of this vault IS the ends of its courses, so
   * the course height is the size of the sawtooth you stand under — and you
   * stand under it: the passage is 5.7 m wide and a walker crosses it at
   * 1.62 m with the whole arch overhead.  At 0.30 the intrados read as a
   * flight of stairs bent into a curve. */
  const COURSE = 0.17;
  for (let yy = SPRING; yy < WY - 0.20; yy += COURSE) {
    const h = Math.min(COURSE, WY - 0.20 - yy) - 0.010;
    if (h < 0.04) break;
    const yc = yy + h / 2;
    const half = archHalf(yc);
    const inset = (Math.round((yy - SPRING) / COURSE) & 1) ? 0.035 : 0;
    const mat = r.chance(0.3) ? M.curtainDark : M.curtain;
    const spans = half > 0.02 ? [[-HU, -half], [half, HU]] : [[-HU, HU]];
    for (const [x0, x1] of spans) {
      if (x1 - x0 < 0.06) continue;
      P.add(mat, bx(x1 - x0, h, PD * 2 - inset * 2, (x0 + x1) / 2, yc, 0, { seg: Math.max(2, Math.ceil((x1 - x0) / 0.7)) }));
    }
  }

  /* ---- an arch ring on each face, and imposts under it ---------------- */
  const RING_T = 0.32;
  const phi0 = Math.atan2(SPRING - ARCH_Y, JAMB);
  const N = 21;
  for (const sz of [-1, 1]) {
    const zf = sz * PD;
    for (let i = 0; i < N; i += 1) {
      const th = phi0 + ((i + 0.5) / N) * (Math.PI - 2 * phi0);
      const rad = ARCH_R + RING_T / 2;
      const arcW = ((rad * (Math.PI - 2 * phi0)) / N) * 1.16;
      /* a voussoir's RADIAL dimension is the ring THICKNESS and its
       * tangential one is its width, so local +y must point out along the
       * radius: rz = PI/2 - theta.  Proud by 0.07 and no more — a ring
       * that stands a quarter of a metre off the face reads from the road
       * as a sunburst of loose blocks. */
      P.add(i % 2 ? M.coping : M.curtain, bx(arcW, RING_T, 0.26,
        Math.cos(th) * rad, ARCH_Y + Math.sin(th) * rad, zf + sz * 0.07, { rz: Math.PI / 2 - th }));
    }
    for (const sx of [-1, 1]) {
      P.add(M.curtainDark, bx(0.66, 0.22, 0.46, sx * (JAMB + 0.06), SPRING - 0.1, zf + sz * 0.08));
    }
  }

  /* ---- machicolation and a string course under the deck, outer face ---
   * THE STRING COURSE IS CUT ROUND THE ARCH, and the first version was not:
   * one 7.5 x 5.1 m slab at y 3.45 spanning the whole gatehouse, i.e. 0.15 m
   * of coping straight across the opening.  From the road it did not read as
   * a mistake — it read as a LINTEL, with the arch ring floating above it
   * like a decoration.  From inside the passage it was the CEILING: a flat
   * coursed soffit, with the real vault hidden a metre above it and never
   * once seen.  Anything that crosses a gate takes the same `archHalf`
   * spans the vault's own courses take. */
  {
    const scY = WY - 1.55;
    const scHalf = archHalf(scY);
    const spans = scHalf > 0.02 ? [[-HU - 0.25, -scHalf], [scHalf, HU + 0.25]] : [[-HU - 0.25, HU + 0.25]];
    for (const [x0, x1] of spans) {
      P.add(M.coping, bx(x1 - x0, 0.15, PD * 2 + 0.34, (x0 + x1) / 2, scY, 0, { seg: 2 }));
    }
  }
  for (let i = 0; i < 11; i += 1) {
    const x = -HU + 0.3 + (i / 10) * (HU * 2 - 0.6);
    P.add(M.curtainDark, bx(0.26, 0.36, 0.52, x, WY - 0.44, PD + 0.16));
    P.add(M.curtainDark, bx(0.21, 0.22, 0.24, x, WY - 0.7, PD + 0.31));
    P.add(M.curtainDark, bx(0.26, 0.36, 0.52, x, WY - 0.44, -PD - 0.16));
  }

  /* ---- the deck: the walk crosses the gate over this slab ------------- */
  P.add(M.coping, bx(DECKX * 2, 0.2, PD * 2, 0, WY - 0.1, 0, { seg: 8 }));
  platforms.push({ x0: -DECKX, z0: -PD, x1: DECKX, z1: PD, top: WY });

  /* ---- the deck's parapets: outer, inner, and two end returns ---------
   * The returns stop at |z| = TH so the WALK ITSELF is never fenced: the
   * shelf arrives at x = +-HU over z -TH..TH and has to run straight on. */
  const parapetRun = (x0, x1, z0, z1) => {
    const w = x1 - x0;
    const d = z1 - z0;
    const long = Math.abs(w) >= Math.abs(d);
    const CREN = SIEGE.crenelY;
    P.add(M.curtain, bx(w, CREN, d, (x0 + x1) / 2, WY + CREN / 2, (z0 + z1) / 2, { seg: Math.max(2, Math.ceil(Math.max(w, d) / 1.5)) }));
    const span = long ? w : d;
    const period = SIEGE.merlonW + SIEGE.crenelW;
    for (let t = 0; t < span - 0.12; t += period) {
      const mw = Math.min(SIEGE.merlonW, span - t);
      if (mw <= 0.14) continue;
      const c = (long ? x0 : z0) + t + mw / 2;
      const mx = long ? c : (x0 + x1) / 2;
      const mz = long ? (z0 + z1) / 2 : c;
      P.add(r.chance(0.3) ? M.curtainDark : M.curtain,
        bx(long ? mw : w, PH - CREN - 0.09, long ? d : mw, mx, WY + CREN + (PH - CREN - 0.09) / 2, mz));
      P.add(M.coping, bx(long ? mw + 0.11 : w + 0.13, 0.09, long ? d + 0.13 : mw + 0.11, mx, WY + PH - 0.045, mz));
    }
    colliders.push({ x0, x1, z0, z1, bottom: WY });
  };
  const PT = SIEGE.parapetT;
  parapetRun(-DECKX, DECKX, PD - PT, PD);
  parapetRun(-DECKX, DECKX, -PD, -PD + PT);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x0 = sx > 0 ? DECKX - PT : -DECKX;
      const x1 = sx > 0 ? DECKX : -DECKX + PT;
      const z0 = sz > 0 ? TH : -PD + PT;
      const z1 = sz > 0 ? PD - PT : -TH;
      if (z1 - z0 > 0.15) parapetRun(x0, x1, z0, z1);
    }
  }

  /* ---- the portcullis, raised and chained up into the vault ----------- *
   * The wardens' charge IS a portcullis; carrying the real one is what
   * stops the device on their banners reading as ornament.  Dropping it is
   * KIT-GAPS item 9 — this group is the handle that beat will need. */
  const pc = new THREE.Group();
  pc.name = 'portcullis';
  const PCP = parts();
  const pcY = CROWN - 0.1;
  const pcH = 2.4;
  for (let i = 0; i <= 9; i += 1) {
    const x = -JAMB + 0.4 + (i / 9) * (JAMB * 2 - 0.8);
    PCP.add(M.ironRust, cyl(0.048, 0.048, pcH, x, pcY + pcH / 2, 0, { seg: 5 }));
    PCP.add(M.ironRust, cyl(0.048, 0.03, 0.26, x, pcY - 0.13, 0, { seg: 5 }));
  }
  for (const yy of [pcY + 0.4, pcY + 1.2, pcY + 2.05]) {
    PCP.add(M.ironRust, bx(JAMB * 2 - 0.7, 0.075, 0.075, 0, yy, 0, { seg: 8 }));
  }
  PCP.flush(pc, { receive: false });
  g.add(pc);
  // the chase it runs in: a portcullis with no groove is a fence
  for (const sx of [-1, 1]) P.add(M.curtainDark, bx(0.18, WY - 0.4, 0.3, sx * (JAMB - 0.07), (WY - 0.4) / 2, 0, { seg: 5 }));

  /* ---- the leaves, swung back flat against the town-side jambs -------- */
  if (leaves) {
    for (const sx of [-1, 1]) {
      const leaf = new THREE.Group();
      const L = parts();
      const lw = 2.5;
      L.add(painted(accent ?? JOINERY.oakStain), bx(lw, 3.3, 0.12, -sx * lw / 2, 1.68, 0, { seg: 4 }));
      for (let i = 0; i < 4; i += 1) L.add(M.ironRust, bx(lw - 0.08, 0.09, 0.055, -sx * lw / 2, 0.5 + i * 0.84, 0.09));
      L.add(M.ironRust, bx(0.17, 3.3, 0.17, 0, 1.68, 0));
      L.flush(leaf, { receive: false });
      /* flat against the jamb, not standing in the opening: at a smaller
       * angle the two leaves split the arrival frame into three. */
      leaf.position.set(sx * (JAMB - 0.15), 0, -PD + 0.34);
      leaf.rotation.y = sx * 1.05;
      leaf.name = `gate-leaf-${sx > 0 ? 'a' : 'b'}`;
      g.add(leaf);
    }
  }

  /* ---- arrow slits either side of the passage, outer face ------------- */
  for (const sx of [-1, 1]) {
    arrowSlitAt(P, { at: [sx * (JAMB + 0.33), SPRING - 0.55, PD], ry: 0, h: 1.15, lit: false });
  }

  /* ---- the two turrets, on the TOWN side ------------------------------ *
   * NOT astride the walk.  A drum standing in a 2.4 m wall-walk is a
   * collider across the only route round the town: the walk has to pass
   * it, and the only version of that which does not need a doorway you
   * cannot fit through is a turret that is not in the way.  They flank the
   * gate from inside, which is what a barbican pair does anyway. */
  const turrets = [];
  const TR = 1.6;
  if (towers) {
    for (const sx of [-1, 1]) {
      const tx = sx * (DECKX + TR + 0.2);          // 5.6: its inner face clears the deck
      const tz = -PD - 1.0;                        // it overlaps the body by 0.6 and clears the walk band
      const t = roundTower({
        seed: `${seed}-turret-${sx > 0 ? 'a' : 'b'}`, r: TR, h: 9.6, taper: 0.09, crook: 0.2,
        wall: 'granite', cap: 'cone', bands: 2, machicolation: true,
        door: { a: Math.PI, w: 1.1, h: 2.1 },
        windows: [
          { y: 2.9, a: Math.PI * 0.78, w: 0.18, h: 1.0 },
          { y: 6.2, a: Math.PI * 1.24, w: 0.18, h: 1.0 },
          { y: 6.2, a: Math.PI * 0.06, w: 0.18, h: 1.0 },
        ],
      });
      t.position.set(tx, 0, tz);
      t.name = `gate-turret-${sx > 0 ? 'a' : 'b'}`;
      g.add(t);
      turrets.push(t);
      const fp = t.userData.footprint;
      colliders.push({ x0: tx + fp.x0, x1: tx + fp.x1, z0: tz + fp.z0, z1: tz + fp.z1 });
      /* the door onto the walk: a real opening in the drum at deck level,
       * facing the deck, with its threshold registered.  The turret is not
       * enterable — this is the walk's access to it, dressed. */
      const rAt = TR * (1 - 0.09 * (WY / 9.6));
      const dz = tz + 0.5;
      const dx = tx - sx * rAt;
      P.add(M.curtainDark, bx(0.16, 2.15, 0.9, dx - sx * 0.02, WY + 1.07, dz));
      P.add(M.curtainDark, bx(0.16, 2.15, 0.9, dx - sx * 0.02, WY + 1.07, dz - 1.0));
      P.add(painted(JOINERY.oakStain), bx(0.07, 1.95, 1.0, dx + sx * 0.05, WY + 0.97, dz - 0.5));
      P.add(M.coping, bx(0.5, 0.12, 1.3, dx + sx * 0.2, WY + 0.02, dz - 0.5));
      platforms.push({ x0: Math.min(dx, dx + sx * 0.55), x1: Math.max(dx, dx + sx * 0.55), z0: dz - 1.15, z1: dz + 0.15, top: WY });
    }
  }

  /* ---- practicals: two wall torches on the town-side jambs ------------ */
  const practicals = [];
  if (torches) {
    for (const sx of [-1, 1]) {
      const t = wallTorch({ seed: `${seed}-torch-${sx > 0 ? 'a' : 'b'}`, lit: false, groundDrop: -2.35 });
      t.position.set(sx * (JAMB - 0.06), 2.35, -PD + 0.06);
      t.rotation.y = -sx * Math.PI / 2;
      g.add(t);
      practicals.push(t);
    }
  }

  P.flush(g);
  g.userData = {
    kind: 'gatehouse', gate: id ?? gate.id ?? null, colliders, platforms,
    portcullis: pc, practicals, turrets,
    local: { HU, TH, PD, JAMB, DECKX, WY, PH, SPRING, CROWN, ARCH_R },
    /* the geometric opening and the WALKABLE one — the second is the
     * number a lane is judged by, and it is 0.68 m smaller by construction */
    clearWidth: JAMB * 2,
    walkableWidth: JAMB * 2 - 0.68,
  };
  place(ctx, g, { x: cx, z: cz, yaw, sink: 0, collide: false, name: name ?? `gatehouse-${id ?? ''}` });

  /* the passage, in WORLD terms, for the game layer */
  const c = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const toWorld = (lx, lz) => [cx + lx * c + lz * sn, cz - lx * sn + lz * c];
  const a = toWorld(-JAMB, -PD);
  const b = toWorld(JAMB, PD);
  g.userData.passage = {
    x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]),
    z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]),
    axis: alongX ? 'z' : 'x',
    inward: toWorld(0, -PD - 1.2),
    outward: toWorld(0, PD + 1.2),
    width: JAMB * 2, walkable: JAMB * 2 - 0.68,
  };
  return g;
}

/* ==================================================================== *
 * 3.  STAIR TURRET
 * ==================================================================== */

/**
 * Dress a 3 x 3 stair-head landing as the base of a square turret: stone on
 * its three free scarps, a doorway onto the walk, and a cheek wall along
 * the flight.  The flight and the landing are TERRAIN; this is the stone
 * round them.
 *
 * @param {object} o.landing  the plan's shelf rect `{ x0, z0, x1, z1, y }`
 * @param {object} [o.flight] the plan's crossing entry, for the cheek wall
 */
export function stairTurret({
  landing, flight = null, ctx, plan = null, seed = null, name = null,
  doorClear = 1.9, cheek = true, h = 1.15,
}) {
  if (!ctx) throw new Error('[siege] stairTurret needs a ctx');
  const S = siegeOf(plan);
  const y = landing.y ?? S.walkY;
  const r = rng(seed ?? `turret-${landing.x0}-${landing.z0}`);
  const g = new THREE.Group();
  const P = parts();

  /* which edge abuts the wall-walk?  The one that lies ON the walk's inner
   * plane — derived, because a landing exists on all four sides of this
   * town and a hand-written side is wrong on three of them. */
  const near = (a, b) => Math.abs(Math.abs(a) - b) < 1e-6;
  let walkSide = null;
  if (near(landing.z1, S.inner) && landing.z1 > 0) walkSide = 'z+';
  else if (near(landing.z0, S.inner) && landing.z0 < 0) walkSide = 'z-';
  else if (near(landing.x1, S.inner) && landing.x1 > 0) walkSide = 'x+';
  else if (near(landing.x0, S.inner) && landing.x0 < 0) walkSide = 'x-';
  if (!walkSide) {
    throw new Error(`[siege] stairTurret: landing (${landing.x0}..${landing.x1}, ${landing.z0}..${landing.z1}) ` +
      `touches no wall-walk plane at +-${S.inner} — it is not a stair head`);
  }

  const EDGES = [
    ['z+', landing.z1, 'z'], ['z-', landing.z0, 'z'],
    ['x+', landing.x1, 'x'], ['x-', landing.x0, 'x'],
  ];
  const gAt = (x, z) => ctx.groundAt(x, z);
  const midX = (landing.x0 + landing.x1) / 2;
  const midZ = (landing.z0 + landing.z1) / 2;
  const wx = landing.x1 - landing.x0;
  const wz = landing.z1 - landing.z0;

  /* ---- the three free scarps, faced ----------------------------------- */
  for (const [side, plane, axis] of EDGES) {
    if (side === walkSide) continue;
    const out = side.endsWith('+') ? 1 : -1;
    const probeX = axis === 'x' ? plane + out * 0.7 : midX;
    const probeZ = axis === 'x' ? midZ : plane + out * 0.7;
    const gy = gAt(probeX, probeZ);
    const len = (axis === 'x' ? wz : wx) + 0.3;
    for (let b = 0; b < 3; b += 1) {
      const y0 = gy + (y - gy) * (b / 3);
      const y1 = gy + (y - gy) * ((b + 1) / 3);
      const t = 0.38 - 0.075 * b;
      const cxp = axis === 'x' ? plane + out * (t / 2) : midX;
      const czp = axis === 'x' ? midZ : plane + out * (t / 2);
      const mat = r.chance(0.26) ? M.curtainDark : M.curtain;
      P.add(mat, axis === 'x'
        ? bx(t, y1 - y0 + 0.01, len, cxp, (y0 + y1) / 2, czp, { seg: 2 })
        : bx(len, y1 - y0 + 0.01, t, cxp, (y0 + y1) / 2, czp, { seg: 2 }));
    }
    // a plinth and a capping course: a face with neither is a card
    const cxp = axis === 'x' ? plane + out * 0.26 : midX;
    const czp = axis === 'x' ? midZ : plane + out * 0.26;
    P.add(M.curtainDark, axis === 'x'
      ? bx(0.55, 0.5, len + 0.2, cxp, gy + 0.22, czp) : bx(len + 0.2, 0.5, 0.55, cxp, gy + 0.22, czp));
    P.add(M.coping, axis === 'x'
      ? bx(0.44, 0.12, len + 0.12, cxp, y - 0.06, czp) : bx(len + 0.12, 0.12, 0.44, cxp, y - 0.06, czp));
    /* a low parapet on the free edges, so the landing is not a 5 m drop on
     * three sides.  `bottom` again: it fences the landing and it is not a
     * wall in the street below. */
    const pt = 0.34;
    const px = axis === 'x' ? plane - out * (pt / 2) : midX;
    const pz = axis === 'x' ? midZ : plane - out * (pt / 2);
    P.add(M.curtain, axis === 'x'
      ? bx(pt, h - 0.09, (axis === 'x' ? wz : wx), px, y + (h - 0.09) / 2, pz)
      : bx(wx, h - 0.09, pt, px, y + (h - 0.09) / 2, pz));
    P.add(M.coping, axis === 'x'
      ? bx(pt + 0.12, 0.09, wz + 0.1, px, y + h - 0.045, pz)
      : bx(wx + 0.1, 0.09, pt + 0.12, px, y + h - 0.045, pz));
    const c0x = axis === 'x' ? Math.min(plane, plane - out * pt) : landing.x0;
    const c1x = axis === 'x' ? Math.max(plane, plane - out * pt) : landing.x1;
    const c0z = axis === 'x' ? landing.z0 : Math.min(plane, plane - out * pt);
    const c1z = axis === 'x' ? landing.z1 : Math.max(plane, plane - out * pt);
    // the flight's own edge must stay open, or the landing has no foot
    const isFlightEdge = flight && flightEnters(flight, side, landing);
    if (!isFlightEdge) ctx.collide(c0x, c0z, c1x, c1z, undefined, y);
  }

  /* ---- the doorway onto the walk -------------------------------------- *
   * Two jambs and a lintel standing ON the landing at the walk edge.  The
   * clear opening is the whole point: a 3.0 m edge with 0.5 m jambs is
   * 2.0 m geometric and 1.32 m walkable, which is a doorway; make the
   * jambs 0.7 and it is a slot nobody gets through. */
  {
    const axis = walkSide.startsWith('x') ? 'x' : 'z';
    const plane = axis === 'x' ? (walkSide === 'x+' ? landing.x1 : landing.x0) : (walkSide === 'z+' ? landing.z1 : landing.z0);
    const out = walkSide.endsWith('+') ? 1 : -1;
    const edge = axis === 'x' ? wz : wx;
    const jw = Math.max(0.34, (edge - doorClear) / 2);
    const mid = axis === 'x' ? midZ : midX;
    const t = 0.42;
    for (const sg of [-1, 1]) {
      const u = mid + sg * (edge / 2 - jw / 2);
      const jx = axis === 'x' ? plane - out * (t / 2) : u;
      const jz = axis === 'x' ? u : plane - out * (t / 2);
      P.add(M.curtain, axis === 'x' ? bx(t, 2.5, jw, jx, y + 1.25, jz) : bx(jw, 2.5, t, jx, y + 1.25, jz));
      const cx0 = axis === 'x' ? Math.min(plane, plane - out * t) : u - jw / 2;
      const cx1 = axis === 'x' ? Math.max(plane, plane - out * t) : u + jw / 2;
      const cz0 = axis === 'x' ? u - jw / 2 : Math.min(plane, plane - out * t);
      const cz1 = axis === 'x' ? u + jw / 2 : Math.max(plane, plane - out * t);
      ctx.collide(cx0, cz0, cx1, cz1, undefined, y);
    }
    const lx = axis === 'x' ? plane - out * (t / 2) : mid;
    const lz = axis === 'x' ? mid : plane - out * (t / 2);
    P.add(M.coping, axis === 'x' ? bx(t + 0.1, 0.32, edge + 0.1, lx, y + 2.62, lz) : bx(edge + 0.1, 0.32, t + 0.1, lx, y + 2.62, lz));
    // six voussoirs over the opening so the head reads as an arch, not a beam
    for (let i = 0; i < 6; i += 1) {
      const f = -0.5 + i / 5;
      const uu = mid + f * doorClear;
      const yy = y + 2.42 + (0.25 - f * f) * 0.5;
      const vx = axis === 'x' ? plane - out * (t / 2 + 0.06) : uu;
      const vz = axis === 'x' ? uu : plane - out * (t / 2 + 0.06);
      P.add(M.coping, axis === 'x'
        ? bx(t + 0.14, 0.2, doorClear / 5.6, vx, yy, vz, { rx: f * 0.8 })
        : bx(doorClear / 5.6, 0.2, t + 0.14, vx, yy, vz, { rz: -f * 0.8 }));
    }
  }

  /* ---- the cheek wall along the flight -------------------------------- */
  if (cheek && flight) {
    const alongX = flight.axis === 'x';
    const dir = flight.dir === -1 ? -1 : 1;
    const [fx, fz] = flight.at;
    const rise = Math.abs(flight.to - flight.from);
    const treads = Math.max(1, Math.ceil(rise / (flight.rise ?? 0.2)));
    const going = Math.max(0.36, flight.going ?? 0.42);
    const halfW = (flight.width ?? 1.6) / 2;
    /* OUTSIDE the flight, not on it: the cheek stands 0.32 m clear of the
     * tread edge, so once its collider is inflated the flight still has
     * 1.42 m of walkable width and the route gate can climb it. */
    const off = halfW + 0.32;
    const sideSign = alongX
      ? (Math.abs(fz + off) > Math.abs(fz - off) ? -1 : 1)
      : (Math.abs(fx + off) > Math.abs(fx - off) ? -1 : 1);
    const cv = (alongX ? fz : fx) + sideSign * off;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i <= treads; i += 1) {
      const u = (alongX ? fx : fz) + dir * (i + 0.5) * going;
      const ty = flight.from + (flight.to - flight.from) * clamp(i / treads, 0, 1);
      const gy = ty - 0.9;
      const px = alongX ? u : cv;
      const pz = alongX ? cv : u;
      /* ONE TONE, not `i % 2`: alternating per tread turns a 10 m cheek wall
       * into vertical stripes at 0.42 m centres — the same mistake the
       * curtain's own bands made horizontally, and worse here because the
       * unit is a stair going and the eye counts them. */
      P.add(i % 5 === 2 ? M.graniteWarm : M.curtain,
        alongX ? bx(going + 0.02, ty + 0.95 - gy, 0.3, px, (gy + ty + 0.95) / 2, pz)
               : bx(0.3, ty + 0.95 - gy, going + 0.02, px, (gy + ty + 0.95) / 2, pz));
      P.add(M.coping, alongX ? bx(going + 0.04, 0.09, 0.4, px, ty + 1.0, pz) : bx(0.4, 0.09, going + 0.04, px, ty + 1.0, pz));
      lo = Math.min(lo, u);
      hi = Math.max(hi, u);
    }
    const c = alongX
      ? { x0: lo - going, x1: hi + going, z0: cv - 0.2, z1: cv + 0.2 }
      : { x0: cv - 0.2, x1: cv + 0.2, z0: lo - going, z1: hi + going };
    ctx.collide(c.x0, c.z0, c.x1, c.z1);
  }

  P.flush(g);
  g.name = name ?? `stair-turret-${Math.round(midX)}-${Math.round(midZ)}`;
  g.userData = { kind: 'stair-turret', walkSide, landing, y };
  ctx.add(g, g.name);
  return g;
}

/** Does `flight` arrive at the landing through edge `side`? */
function flightEnters(flight, side, landing) {
  const alongX = flight.axis === 'x';
  const dir = flight.dir === -1 ? -1 : 1;
  if (alongX) return side === (dir > 0 ? 'x-' : 'x+');
  return side === (dir > 0 ? 'z-' : 'z+');
}

/* ==================================================================== *
 * 4.  BARRICADE
 * ==================================================================== */

/**
 * The raisable street barricade — the town's own answer to the raid, and
 * one of the game's objectives.
 *
 * TWO STATES, BOTH BUILT.  `down` is the material heaped to one side of
 * the lane and the lane is open; `up` is that material across the lane
 * with a collider on it.  Both groups exist from the first frame and are
 * hidden, because building geometry inside `raise()` means merging buffers
 * in a frame and because a barricade you can raise must have something to
 * become.
 *
 * THE 1.8 m GAP IS NOT DECORATION.  Every collider is inflated by the
 * player's 0.34 m radius on EVERY side, so a barricade laid clean across a
 * 3.2 m lane leaves 3.2 - w - 0.68 metres of nothing and the lane is
 * sealed — for the player, for the fleeing NPCs and for the enemies whose
 * whole route it is.  A barricade is TWO ENDS AND A GAP or it is a wall.
 *
 * @param {object} o
 * @param {number} o.w      how far across the lane the raised barrier runs
 * @param {number[]} o.at   `[x, z]`
 * @param {number} [o.yaw]  0 puts the barrier's length along x
 * @param {'carts'|'doors'|'stakes'} [o.kind]
 * @param {number} [o.gap]  the clear end, >= 1.8
 * @returns {THREE.Group} with `userData.raise() / lower() / state`
 */
export function barricade({
  w = 3.2, seed = 'barricade', kind = 'carts', at = [0, 0], yaw = 0, ctx,
  gap = 1.8, gapAt = 'right', state = 'down', name = null, accent = null,
}) {
  if (!ctx) throw new Error('[siege] barricade needs a ctx — it registers and removes its own collider');
  if (gap < 1.8) throw new Error(`[siege] barricade: the declared gap is ${gap} m and the minimum is 1.8 — a lane a body cannot pass is a sealed lane`);
  const r = rng(seed);
  const g = new THREE.Group();
  const [ax, az] = at;
  const H = 1.35;

  /* the raised barrier runs from -w/2 to w/2 - gap, so the clear end is
   * `gap` wide at the +x end (or the -x end for gapAt 'left') */
  const bw = Math.max(0.9, w - gap);
  const bx0 = gapAt === 'left' ? w / 2 - bw : -w / 2;
  const bx1 = bx0 + bw;
  const bcx = (bx0 + bx1) / 2;

  const up = new THREE.Group();
  up.name = 'barricade-up';
  const U = parts();
  const down = new THREE.Group();
  down.name = 'barricade-down';
  const D = parts();

  const plank = (Pp, x, y, z, len, th, rz = 0, ry = 0, mat = M.oakSilver) =>
    Pp.add(mat, bx(len, th, 0.28, x, y, z, { rz, ry, seg: 2 }));

  if (kind === 'carts') {
    /* two carts run in and tipped, with everything the street had thrown
     * over them.  A cart on its side is 1.4 m of solid: the one piece of
     * street furniture that IS a barricade. */
    /* THE RAKE IS SOLVED, NOT PICKED — same arithmetic as `felledCart`.  A
     * 2.1 m bed at 1.45 rad has a 1.04 m vertical half-extent, so centred
     * at 0.72 it buries a third of itself; at 0.95 rad and a centre of 0.88
     * the low corner sits at 0.02 and the top at 1.74, which is a barricade
     * you shoot over rather than a fence you cannot see past. */
    for (const sx of [-1, 1]) {
      const cx = bcx + sx * bw * 0.26;
      U.add(M.oakDark, bx(2.1, 0.22, 1.15, cx, 0.88, 0.05, { rz: sx * 0.95, seg: 3 }));
      /* the side board rakes with the bed, so ITS half-extent is
       * `L·sin(rake)/2 + h·cos(rake)/2` and the `h` term is not small on a
       * 0.95 m board: written at the bed's own centre it reached 0.27 m
       * under the ground.  1.5 x 0.7 at 0.95 clears by 0.14. */
      U.add(M.oakSilver, bx(1.5, 0.7, 0.13, cx + sx * 0.2, 0.95, 0.42, { rz: sx * 0.95, seg: 3 }));
      for (const dz of [-0.42, 0.46]) {
        U.add(M.oakDark, cyl(0.52, 0.52, 0.12, cx - sx * 0.5, 0.58, dz, { seg: 11, rx: Math.PI / 2 }));
        for (let k = 0; k < 6; k += 1) {
          const a = (k / 6) * TAU + r.range(0, 1);
          U.add(M.oakDark, bx(0.09, 0.48, 0.07, cx - sx * 0.5 + Math.cos(a) * 0.24, 0.58 + Math.sin(a) * 0.24, dz, { rz: a }));
        }
      }
    }
    for (let i = 0; i < 7; i += 1) {
      plank(U, bcx + r.range(-bw / 2 + 0.4, bw / 2 - 0.4), r.range(0.5, H), r.range(-0.4, 0.4),
        r.range(1.1, 1.9), 0.09, r.range(-0.5, 0.5), r.range(-0.4, 0.4));
    }
  } else if (kind === 'doors') {
    /* the street's own doors and shutters, unshipped and lashed to stakes
     * — which is what a town actually does in an afternoon */
    for (let i = 0; i < 5; i += 1) {
      const x = bx0 + 0.5 + (i / 4) * (bw - 1.0);
      const lean = r.range(-0.16, 0.16);
      // 1.02, not 0.95: a leaning 1.9 m door's half-extent is 1.014
      U.add(painted(i % 2 ? (accent ?? JOINERY.oakStain) : JOINERY.doveGrey),
        bx(0.95, 1.9, 0.09, x, 1.02, r.range(-0.2, 0.2), { rz: lean, seg: 2 }));
      for (let k = 0; k < 3; k += 1) U.add(M.ironRust, bx(0.9, 0.07, 0.05, x, 0.5 + k * 0.6, r.range(-0.2, 0.2) + 0.07, { rz: lean }));
    }
    for (const sx of [-1, 1]) U.add(M.oakDark, cyl(0.09, 0.11, 2.2, bcx + sx * (bw / 2 - 0.2), 1.1, 0.22, { seg: 6 }));
    U.add(M.rope, bx(bw, 0.05, 0.05, bcx, 1.5, 0.26, { seg: 6 }));
  } else {
    /* driven stakes and hurdles: no cart to spare, and an hour to do it */
    /* EVERY STAKE LEANS THE SAME WAY.  Alternating the sign per stake — the
     * obvious way to get variety — builds a row of X's, which is a
     * chevaux-de-frise and not a stockade: the eye reads the crossings, not
     * the points.  Driven stakes lean toward whoever is coming, all of them,
     * and the variety is in the ANGLE. */
    for (let i = 0; i < 14; i += 1) {
      const x = bx0 + 0.2 + (i / 13) * (bw - 0.4);
      const lean = r.range(0.26, 0.4);
      const L = r.range(1.45, 1.7);
      U.add(M.oakDark, cyl(0.055, 0.085, L, x, L / 2 - 0.06, r.range(-0.25, 0.25), { seg: 6, rz: lean }));
      U.add(M.oakSilver, cyl(0.05, 0.02, 0.3, x - Math.sin(lean) * (L / 2 + 0.1), (L / 2 - 0.06) + Math.cos(lean) * (L / 2 + 0.1), 0, { seg: 5, rz: lean }));
    }
    for (const yy of [0.55, 1.05]) U.add(M.wicker, bx(bw, 0.16, 0.2, bcx, yy, 0.1, { seg: 8 }));
  }

  /* the DOWN state: the same material, heaped clear of the lane at the
   * gap end, low enough to walk past and tall enough to be cover */
  {
    const hx = gapAt === 'left' ? -w / 2 + 0.7 : w / 2 - 0.7;
    D.add(M.oakDark, bx(1.5, 0.24, 1.1, hx, 0.13, 0, { rz: 0.04, seg: 2 }));
    for (let i = 0; i < 8; i += 1) {
      plank(D, hx + r.range(-0.5, 0.5), 0.3 + i * 0.09, r.range(-0.35, 0.35),
        r.range(1.0, 1.7), 0.09, r.range(-0.12, 0.12), r.range(-0.7, 0.7));
    }
    D.add(M.oakDark, cyl(0.5, 0.5, 0.12, hx - 0.55, 0.5, -0.5, { seg: 11, rz: 0.5 }));
    D.add(M.wicker, bx(1.0, 0.2, 0.6, hx + 0.3, 1.0, 0.1, { seg: 2 }));
  }

  U.flush(up);
  D.flush(down);
  g.add(up, down);
  g.position.set(ax, 0, az);
  g.rotation.y = yaw;
  seatOnGround(g, ctx.groundAt);
  tagProp(g, 'barricade', { cover: true, coverH: H, kind, w, gap, gapAt });

  /* the collider, and its removal.  A rotated AABB is exact at multiples of
   * PI/2 and only there, so a barricade is laid along a street. */
  const cAt = (yy) => {
    const c = Math.cos(yy);
    const s = Math.sin(yy);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [lx, lz] of [[bx0, -0.55], [bx1, -0.55], [bx1, 0.55], [bx0, 0.55]]) {
      const X = ax + lx * c + lz * s;
      const Z = az - lx * s + lz * c;
      x0 = Math.min(x0, X); x1 = Math.max(x1, X);
      z0 = Math.min(z0, Z); z1 = Math.max(z1, Z);
    }
    return { x0, z0, x1, z1 };
  };
  const rect = cAt(yaw);
  let registered = null;
  const setState = (next) => {
    const isUp = next === 'up';
    up.visible = isUp;
    down.visible = !isUp;
    if (isUp && !registered) {
      ctx.collide(rect.x0, rect.z0, rect.x1, rect.z1);
      registered = ctx.colliders[ctx.colliders.length - 1];
    } else if (!isUp && registered) {
      const i = ctx.colliders.indexOf(registered);
      if (i >= 0) ctx.colliders.splice(i, 1);
      registered = null;
    }
    g.userData.state = next;
    /* the nav grid is built from the collider list, so a barricade that
     * changes it has to say so — KIT-GAPS 9's dirty flag, wired now so the
     * game layer only has to listen. */
    if (typeof ctx.navDirty === 'function') ctx.navDirty();
  };
  g.userData.raise = () => setState('up');
  g.userData.lower = () => setState('down');
  g.userData.rect = rect;
  setState(state === 'up' ? 'up' : 'down');
  ctx.add(g, name ?? `barricade-${kind}`);
  return g;
}

/* ==================================================================== *
 * 5.  PRACTICALS THAT SWITCH
 * ==================================================================== */

/**
 * Wire a built practical for the relight beat.  Flames and pools are BUILT
 * whatever `lit` says and merely hidden, because `setLit(true)` on a prop
 * whose flame was never built is a silent no-op — and that beat is a
 * scripted moment in this game, not a decoration.
 */
function switchable(body, { pools = [], flames = [], unlit = [], lit = false, kind }) {
  const out = withPools(body, pools);
  const set = (on) => {
    const v = !!on;
    for (const f of flames) f.visible = v;
    for (const u of unlit) u.visible = !v;
    for (const p of pools) p.visible = v;
    body.userData.lit = v;
    out.userData.lit = v;
  };
  body.userData.practical = true;
  body.userData.setLit = set;
  out.userData.practical = true;
  out.userData.setLit = set;
  out.userData.kind = kind ?? body.userData.kind;
  set(lit);
  return out;
}

/**
 * A torch in an iron ring bolted to a wall.  ORIGIN ON THE WALL FACE,
 * projecting +Z, `airborne: true` — the signkit's mounting convention, so a
 * district hangs it exactly the way it hangs a sign.
 *
 * `groundDrop` is the ground's height BELOW the bracket (negative) and is
 * what puts the pool on the pavement instead of in the air.
 */
export function wallTorch({ seed = 'wall-torch', lit = false, reach = 0.4, groundDrop = null, glow = null } = {}) {
  const g = new THREE.Group();
  const P = parts();
  P.add(M.ironDark, bx(0.2, 0.26, 0.07, 0, 0, 0.035));
  P.add(M.ironRust, tubeGeo([0, -0.02, 0.06], [0, 0.3, reach], 0.032, 5));
  P.add(M.ironRust, tubeGeo([0, -0.24, 0.06], [0, 0.16, reach * 0.82], 0.026, 5));
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * TAU;
    P.add(M.ironRust, bx(0.028, 0.3, 0.028, Math.cos(a) * 0.115, 0.4, reach + Math.sin(a) * 0.115));
  }
  P.add(M.ironRust, cyl(0.13, 0.13, 0.05, 0, 0.55, reach, { seg: 9, open: true }));
  P.add(M.oakDark, cyl(0.05, 0.06, 0.6, 0, 0.42, reach, { seg: 6 }));
  P.flush(g, { receive: false });

  const flame = new THREE.Group();
  const F = parts();
  F.add(M.emberDeep, cyl(0.1, 0.07, 0.1, 0, 0.66, reach, { seg: 7 }));
  F.add(glow != null ? glowing(glow, glow, 0.95) : M.ember, cyl(0.085, 0.02, 0.34, 0, 0.86, reach, { seg: 7 }));
  F.add(M.lit, cyl(0.05, 0.012, 0.18, 0, 0.8, reach, { seg: 6 }));
  F.flush(flame, { receive: false, cast: false });
  g.add(flame);

  tagProp(g, 'wall-torch', { airborne: true, reach, flameY: 0.86 });
  const pools = [];
  if (groundDrop != null) {
    const p = lightPool({ r: 2.0, ember: true, opacity: 0.4 });
    p.position.set(0, groundDrop + 0.03, reach);
    pools.push(p);
  }
  return switchable(g, { pools, flames: [flame], lit, kind: 'wall-torch' });
}

/**
 * THE BEACON — an iron fire-cage on a pole, on the crest of the keep, and
 * the thing the whole town looks at when it is lit.  Origin on the ground.
 *
 * It is the ONE practical here sized to be read at 60 m rather than at
 * three: the cage is 0.9 m across and the flame stands a metre out of it,
 * because a beacon that reads as a torch is not a beacon.
 */
export function beaconCage({ seed = 'beacon', h = 3.4, r: R = 0.46, lit = false, ctx = null, glow = null } = {}) {
  const rr = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  P.add(M.curtainDark, cyl(0.42, 0.52, 0.44, 0, 0.22, 0, { seg: 9 }));
  P.add(M.ironRust, cyl(0.09, 0.12, h, 0, h / 2, 0, { seg: 8 }));
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * TAU;
    P.add(M.ironRust, tubeGeo([Math.cos(a) * 0.42, 0.4, Math.sin(a) * 0.42], [Math.cos(a) * 0.1, h * 0.42, Math.sin(a) * 0.1], 0.03, 5));
  }
  // the cage: a hooped basket, and its bars are what carry it as a shape
  const cy = h + R * 0.5;
  P.add(M.ironRust, cyl(R * 0.55, R, 0.1, 0, cy - R * 0.55, 0, { seg: 12 }));
  for (const yy of [cy - R * 0.5, cy + R * 0.1, cy + R * 0.72]) {
    const rr2 = R * (yy < cy ? 0.82 : (yy > cy + R * 0.5 ? 1.06 : 0.98));
    for (let k = 0; k < 12; k += 1) {
      const a = ((k + 0.5) / 12) * TAU;
      P.add(M.ironRust, bx(0.05, 0.055, (TAU * rr2) / 12 * 1.08, Math.cos(a) * rr2, yy, Math.sin(a) * rr2, { ry: -a }));
    }
  }
  for (let k = 0; k < 10; k += 1) {
    const a = (k / 10) * TAU;
    P.add(M.ironRust, tubeGeo([Math.cos(a) * R * 0.62, cy - R * 0.6, Math.sin(a) * R * 0.62],
      [Math.cos(a) * R * 1.06, cy + R * 0.8, Math.sin(a) * R * 1.06], 0.026, 5));
  }
  for (let i = 0; i < 6; i += 1) {
    const a = rr.range(0, TAU);
    P.add(M.barkDark, cyl(0.06, 0.065, R * rr.range(1.0, 1.5), rr.range(-0.12, 0.12), cy - R * 0.28 + i * 0.045, rr.range(-0.12, 0.12),
      { seg: 5, rz: Math.PI / 2, ry: a }));
  }
  P.flush(g, { receive: false });

  const flame = new THREE.Group();
  const F = parts();
  F.add(M.emberDeep, cyl(R * 0.9, R * 0.7, 0.24, 0, cy + R * 0.1, 0, { seg: 10 }));
  F.add(glow != null ? glowing(glow, glow, 0.95) : M.ember, cyl(R * 1.0, R * 0.2, 1.25, 0, cy + R * 0.9, 0, { seg: 9 }));
  F.add(M.lit, cyl(R * 0.6, R * 0.08, 0.8, 0, cy + R * 0.72, 0, { seg: 8 }));
  F.flush(flame, { receive: false, cast: false });
  g.add(flame);

  tagProp(g, 'beacon-cage', { fireY: cy + R * 0.9, topY: cy + R * 1.5, footprint: { x0: -0.55, z0: -0.55, x1: 0.55, z1: 0.55 } });
  const pool = lightPool({ r: 4.4, ember: true, opacity: 0.5 });
  pool.position.y = 0.04;
  const out = switchable(g, { pools: [pool], flames: [flame], lit, kind: 'beacon-cage' });
  if (ctx) {
    let t = rr.range(0, 6);
    ctx.update((dt) => {
      if (!g.userData.lit) return;
      t += dt;
      // BY SIZE, never by opacity: `lightPool` hands back a mesh on the
      // SHARED pooled material and writing its opacity writes every pool
      // in the town.
      pool.scale.setScalar(1 + Math.sin(t * 1.7) * 0.05 + Math.sin(t * 4.3) * 0.03);
      flame.scale.set(1, 1 + Math.sin(t * 3.1) * 0.06, 1);
    });
  }
  return out;
}

/**
 * A horn lantern — the switchable one.  `post: true` stands it on the
 * town's own lamp post; `post: false` is a lantern set down on a sill, a
 * step or a parapet (set `airborne` yourself if you hang it).
 */
export function lantern({ seed = 'lantern', h = 2.5, lit = false, post = true, glow = null, mat = null } = {}) {
  const rr = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  const ly = post ? h + 0.12 : 0.16;
  if (post) {
    P.add(M.curtainDark, cyl(0.2, 0.17, 0.24, 0, 0.12, 0, { seg: 8 }));
    P.add(mat ?? M.oakDark, cyl(0.06, 0.085, h - 0.2, 0, 0.2 + (h - 0.2) / 2, 0, { seg: 8 }));
    P.add(M.ironRust, tubeGeo([0, h - 0.55, 0], [0.24, h + 0.02, 0], 0.022, 5));
  }
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * TAU + Math.PI / 4;
    P.add(M.ironRust, bx(0.026, 0.34, 0.026, Math.cos(a) * 0.115, ly, Math.sin(a) * 0.115));
  }
  P.add(M.ironRust, cyl(0.19, 0.02, 0.15, 0, ly + 0.25, 0, { seg: 4 }));
  P.add(M.ironRust, bx(0.23, 0.04, 0.23, 0, ly - 0.19, 0));
  P.flush(g, { receive: false });
  void rr;

  /* THE LANTERN IS THE ONE PRACTICAL WHOSE LIGHT IS INSIDE SOMETHING, and
   * the first cut got it exactly wrong: it built the dark glass as a solid
   * 0.185 m box and then put the lit pane INSIDE it at 0.175 — so
   * `setLit(true)` swapped a material on a mesh that was entirely within an
   * opaque one, and the beat played perfectly with nothing whatever to see.
   * (Same shape as a vending machine dropping its can inside its own body.)
   * The two states are the SAME BOX and one of them is hidden. */
  const dark = new THREE.Group();
  const D = parts();
  D.add(M.glassDark, bx(0.185, 0.3, 0.185, 0, ly, 0));
  D.flush(dark, { receive: false });
  g.add(dark);
  const flame = new THREE.Group();
  const F = parts();
  F.add(glow != null ? glowing(glow, glow, 0.9) : M.lit, bx(0.185, 0.3, 0.185, 0, ly, 0));
  F.flush(flame, { receive: false, cast: false });
  g.add(flame);

  tagProp(g, 'lantern', { lampY: ly, topY: ly + 0.32, footprint: post ? { x0: -0.22, z0: -0.22, x1: 0.22, z1: 0.22 } : { x0: -0.14, z0: -0.14, x1: 0.14, z1: 0.14 } });
  const pool = lightPool({ r: post ? 2.0 : 1.2, opacity: 0.4 });
  pool.position.y = post ? 0.03 : -0.02;
  return switchable(g, { pools: [pool], flames: [flame], unlit: [dark], lit, kind: 'lantern' });
}

/* ==================================================================== *
 * 6.  ARROW SLIT
 * ==================================================================== */

/* The one body, so a slit on a flat wall and a slit on a tower shaft are
 * the same opening.  `put(mat, w, h, d, px, py, pz)` maps the canonical
 * +Z-facing frame onto whatever surface the caller has. */
function slitBody(put, { y, h, w, splay, cross, lit, mat, sillMat, crossY }) {
  /* DEPTH IS BUILT OUTWARD.  A slit written as a panel BEHIND the wall
   * face is inside the render — you cannot carve a recess into a box, and
   * this is the opening where that bites hardest, because a slit is mostly
   * recess.  The dark void is the innermost layer and the dressed surround
   * stands PROUD of it, which is also what a real embrasure looks like
   * from outside: a slot in a raised frame. */
  const pane = lit ? M.lit : M.ironDark;
  put(pane, w, h, 0.03, 0, y, 0.012);
  const cy = y + h * crossY;
  const jx = w / 2 + splay / 4;
  const jw = splay / 2;
  if (cross) {
    /* the arms are about a third of the slot's height.  At 1.5 x `splay`
     * they were 56 % of it and the loop read as a plain "+" — a cross-let is
     * a slot with SHOULDERS, not a crucifix. */
    put(pane, w + splay * 0.9, 0.15, 0.03, 0, cy, 0.012);
    for (const s of [-1, 1]) {
      const lowH = (cy - 0.09) - (y - h / 2 - 0.1);
      const upH = (y + h / 2 + 0.1) - (cy + 0.09);
      put(mat, jw, lowH, 0.12, s * jx, (cy - 0.09 + y - h / 2 - 0.1) / 2, 0.055);
      put(mat, jw, upH, 0.12, s * jx, (cy + 0.09 + y + h / 2 + 0.1) / 2, 0.055);
      // the cross-let's own stops, outboard of the horizontal slot
      put(mat, jw * 0.55, 0.18, 0.1, s * (jx + splay * 0.38), cy, 0.05);
    }
  } else {
    for (const s of [-1, 1]) put(mat, jw, h + 0.2, 0.12, s * jx, y, 0.055);
  }
  put(mat, w + splay + 0.06, 0.24, 0.13, 0, y + h / 2 + 0.12, 0.06);
  put(sillMat, w + splay + 0.2, 0.15, 0.22, 0, y - h / 2 - 0.075, 0.085);
}

/**
 * An arrow slit on one face of a kit body — a `windowOn` variant with no
 * glass and no glazing bars.
 *
 * @param {object} P the generator's `parts()` collector
 */
export function arrowSlit(P, {
  face, half, centre = 0, u, y, h = 1.4, w = 0.15, splay = 0.44,
  cross = true, lit = false, crossY = 0.2, mat = M.coping, sillMat = M.coping,
}) {
  const F = faceFrame(face, half, u, centre);
  const put = (m, bw, bh, bd, px, py, pz) => P.add(m, bx(bw, bh, bd, ...F.at(px, py, pz), { ry: F.yaw }));
  slitBody(put, { y, h, w, splay, cross, lit, mat, sillMat, crossY });
}

/**
 * The same slit at an arbitrary point and bearing — for a tower shaft, a
 * gatehouse's own masonry, or any surface that is not one of a body's four
 * faces.  `at` is the point ON the surface and `ry = atan2(nx, nz)` of its
 * outward normal.
 */
export function arrowSlitAt(P, {
  at, ry = 0, y = null, h = 1.4, w = 0.15, splay = 0.44,
  cross = true, lit = false, crossY = 0.2, mat = M.coping, sillMat = M.coping,
}) {
  const [ax, ay, az] = at;
  const nx = Math.sin(ry);
  const nz = Math.cos(ry);
  /* `bx`'s ry maps local +z to (sin ry, 0, cos ry) — the outward normal —
   * and local +x to (cos ry, 0, -sin ry) = (nz, 0, -nx).  The POSITION has
   * to use the same two vectors as the ROTATION or the surround is mirrored
   * on every bearing but zero, and a symmetric frame hides it until the one
   * asymmetric member goes in. */
  const put = (m, bw, bh, bd, px, py, pz) => P.add(m, bx(bw, bh, bd,
    ax + nz * px + nx * pz, py, az - nx * px + nz * pz, { ry }));
  slitBody(put, { y: y ?? ay, h, w, splay, cross, lit, mat, sillMat, crossY });
}

/* ==================================================================== *
 * 7.  SIEGE PROPS
 * ==================================================================== */

/* Anything in this section that is meant as COVER sets `userData.cover` and
 * declares `coverH`.  `placeCover` is the only sanctioned way to put one
 * down: it seats it, rotates it, registers the collider and REFUSES a
 * cover prop under 0.9 m — because the game's referee reads that tag for
 * its "behind cover" test and the enemies read the collider list, and a
 * 0.6 m barrel tagged as cover is a promise the player cannot cash. */

/** Seat a prop, rotate it, register its footprint, and check its cover claim. */
export function placeCover(ctx, group, { x, z, yaw = 0, name = null, collide = true } = {}) {
  group.position.set(x, 0, z);
  group.rotation.y = yaw;
  seatOnGround(group, ctx.groundAt);
  const u = group.userData ?? {};
  const body = u.body?.userData ?? u;
  if (body.cover && !(body.coverH >= 0.9)) {
    throw new Error(`[siege] placeCover("${name ?? body.kind}"): tagged as cover but only ${body.coverH} m tall — ` +
      'cover is 0.9-1.4 m or it is a trip hazard the referee will still credit');
  }
  const fp = body.footprint;
  if (collide && fp) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [lx, lz] of [[fp.x0, fp.z0], [fp.x1, fp.z0], [fp.x1, fp.z1], [fp.x0, fp.z1]]) {
      const X = x + lx * c + lz * s;
      const Z = z - lx * s + lz * c;
      x0 = Math.min(x0, X); x1 = Math.max(x1, X);
      z0 = Math.min(z0, Z); z1 = Math.max(z1, Z);
    }
    ctx.collide(x0, z0, x1, z1);
  }
  ctx.add(group, name ?? body.kind ?? 'prop');
  return group;
}

/** Rubble where something came through the wall.  Cover, and a landmark. */
function breachRubble({ seed = 'rubble', w = 2.8, d = 1.9, h = 1.15 } = {}) {
  const r = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  for (let i = 0; i < 22; i += 1) {
    const t = r.next();
    const rx = r.range(-w / 2, w / 2) * (0.55 + 0.45 * (1 - t));
    const rz = r.range(-d / 2, d / 2) * (0.55 + 0.45 * (1 - t));
    const yy = (1 - Math.hypot(rx / (w / 2), rz / (d / 2))) * h * r.range(0.55, 1.0);
    const s = r.range(0.24, 0.58);
    P.add(r.chance(0.35) ? M.curtainDark : (r.chance(0.4) ? M.rubble : M.curtain),
      bx(s, s * r.range(0.5, 0.9), s * r.range(0.7, 1.2), rx, Math.max(0.1, yy) * 0.6, rz,
        { rx: r.range(-0.4, 0.4), ry: r.range(0, TAU), rz: r.range(-0.4, 0.4) }));
  }
  for (let i = 0; i < 5; i += 1) {
    P.add(M.gravel, bx(r.range(0.5, 1.2), 0.05, r.range(0.4, 0.9), r.range(-w * 0.7, w * 0.7), 0.03, r.range(-d * 0.7, d * 0.7), { ry: r.range(0, TAU) }));
  }
  P.flush(g);
  return tagProp(g, 'breach-rubble', {
    cover: true, coverH: h, footprint: { x0: -w / 2, z0: -d / 2, x1: w / 2, z1: d / 2 },
  });
}

/** A ladder dropped against a wall — the Company's whole siege train. */
function siegeLadder({ seed = 'siege-ladder', len = 6.4, lean = 0.26, w = 0.56 } = {}) {
  const r = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  /* built from JOINTS: both rails run between the same two points, so the
   * rungs cannot end up short of one of them */
  const top = [0, Math.cos(lean) * len, Math.sin(lean) * len];
  for (const s of [-1, 1]) {
    P.add(M.oakSilver, tubeGeo([s * w / 2, 0.02, 0], [s * w / 2 * 0.92, top[1], top[2]], 0.055, 5));
  }
  const n = Math.max(4, Math.round(len / 0.34));
  for (let i = 1; i < n; i += 1) {
    const t = i / n;
    P.add(M.oakDark, cyl(0.032, 0.032, w, 0, 0.02 + top[1] * t, top[2] * t, { seg: 5, rz: Math.PI / 2 }));
  }
  P.add(M.ironRust, bx(w + 0.1, 0.06, 0.09, 0, top[1] - 0.1, top[2] - 0.04 + 0.1));
  P.flush(g, { receive: false });
  return tagProp(g, 'siege-ladder', { topY: top[1], footprint: { x0: -w / 2 - 0.1, z0: -0.2, x1: w / 2 + 0.1, z1: 0.3 } });
}

/**
 * A cart run into a wall and left on its side. Cover.
 *
 * THE RAKE OF THE BED IS THE WHOLE PROP, and it has to be SOLVED rather
 * than picked: a 2.4 m slab written at 1.42 rad (81 degrees, i.e. very
 * nearly on its end) has a vertical half-extent of 1.21 m, so centred at
 * 0.62 it puts 0.59 m of itself UNDER THE GROUND — which the spatial audit
 * reports as BURIED and which from the street reads as a shorter cart.
 * 0.62 rad and a centre at 0.72 puts the low corner at 0.02 and the high
 * one at 1.42, which is also the height a body can shoot over.
 */
function felledCart({ seed = 'felled-cart', paint = null } = {}) {
  const r = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  const body = paint != null ? painted(paint) : M.oakSilver;
  const rake = 0.62;
  const bedL = 2.3;
  const bedC = 0.72;
  P.add(M.oakDark, bx(bedL, 0.22, 1.25, 0, bedC, 0, { rz: rake, seg: 3 }));
  // the two side boards, still on the bed, following its rake
  P.add(body, bx(bedL - 0.1, 0.62, 0.11, -0.04, bedC + 0.34, 0.58, { rz: rake, seg: 3 }));
  // the far board has come off and is lying flat — two boards at the bed's
  // own rake are one thick slab with a slot in it
  P.add(body, bx(bedL - 0.3, 0.1, 0.6, 0.5, 0.06, -1.05, { ry: 0.16, seg: 3 }));
  /* the axle wheel, still up; and the other one off and lying flat.  A
   * cylinder's axis is +y, so an UPRIGHT wheel needs rx = PI/2 and a wheel
   * lying on the ground needs none — the two are not the same prop turned
   * round, and writing them from one branch is how one ends up a disc in
   * the air. */
  /* THE WHEEL IS THE PROP.  A cart on its side is read by its wheels and by
   * nothing else — the bed and the boards are just planks at an angle — and
   * the first cut drew both wheels in `oakDark` against ground that is
   * nearly the same value at dusk, so the whole thing came back as two
   * leaning boards.  Pale rim, dark spokes: the disc reads at 25 m. */
  P.add(M.oakSilver, cyl(0.52, 0.52, 0.12, -0.72, 0.54, 0.42, { seg: 12, rx: Math.PI / 2 }));
  P.add(M.oakDark, cyl(0.4, 0.4, 0.14, -0.72, 0.54, 0.42, { seg: 12, rx: Math.PI / 2 }));
  P.add(M.oakSilver, cyl(0.13, 0.13, 0.2, -0.72, 0.54, 0.42, { seg: 8, rx: Math.PI / 2 }));
  for (let k = 0; k < 7; k += 1) {
    const a = (k / 7) * TAU + r.range(0, 0.6);
    P.add(M.oakSilver, bx(0.07, 0.5, 0.15, -0.72 + Math.cos(a) * 0.25, 0.54 + Math.sin(a) * 0.25, 0.42, { rz: a }));
  }
  P.add(M.oakSilver, cyl(0.52, 0.52, 0.12, 1.42, 0.08, -0.95, { seg: 12 }));
  P.add(M.oakDark, cyl(0.4, 0.4, 0.14, 1.42, 0.08, -0.95, { seg: 12 }));
  for (let k = 0; k < 7; k += 1) {
    const a = (k / 7) * TAU + r.range(0, 0.6);
    P.add(M.oakSilver, bx(0.5, 0.15, 0.07, 1.42 + Math.cos(a) * 0.25, 0.08, -0.95 + Math.sin(a) * 0.25, { ry: -a }));
  }
  // a shaft in the air, which is the silhouette that says "overturned"
  P.add(M.oakDark, cyl(0.05, 0.042, 1.7, 1.32, 1.28, 0.24, { seg: 6, rz: 0.9 }));
  P.flush(g);
  return tagProp(g, 'felled-cart', { cover: true, coverH: 1.4, footprint: { x0: -1.3, z0: -1.3, x1: 1.75, z1: 0.95 } });
}

/** A sheaf of arrows, tied, stood against something. */
function arrowBundle({ seed = 'arrows', n = 20, h = 0.9 } = {}) {
  const r = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  for (let i = 0; i < n; i += 1) {
    const a = r.range(0, TAU);
    const rad = r.range(0, 0.09);
    const lean = r.range(0.02, 0.14);
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad;
    P.add(M.oakSilver, cyl(0.008, 0.008, h, x, h / 2, z, { seg: 4, rz: Math.cos(a) * lean, rx: -Math.sin(a) * lean }));
    P.add(M.paper, cyl(0.019, 0.012, 0.11, x + Math.sin(Math.cos(a) * lean) * h * 0.46, h - 0.05, z, { seg: 4 }));
  }
  P.add(M.rope, cyl(0.11, 0.11, 0.055, 0, h * 0.55, 0, { seg: 9, open: true }));
  P.add(M.rope, cyl(0.1, 0.1, 0.05, 0, h * 0.24, 0, { seg: 9, open: true }));
  P.flush(g, { receive: false });
  return tagProp(g, 'arrow-bundle', { footprint: { x0: -0.16, z0: -0.16, x1: 0.16, z1: 0.16 } });
}

/** A mantlet: a plank pavise on a raking frame. Cover. */
function mantlet({ seed = 'mantlet', w = 1.6, h = 1.5, lean = 0.2 } = {}) {
  const r = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  const n = Math.max(4, Math.round(w / 0.24));
  for (let i = 0; i < n; i += 1) {
    const x = -w / 2 + (i + 0.5) * (w / n);
    P.add(r.chance(0.35) ? M.oakDark : M.oakSilver, bx(w / n - 0.012, h, 0.075, x, h / 2 * Math.cos(lean), Math.sin(lean) * h / 2, { rx: -lean, seg: 2 }));
  }
  for (const yy of [0.32, h - 0.3]) {
    P.add(M.oakDark, bx(w + 0.06, 0.1, 0.06, 0, yy * Math.cos(lean), Math.sin(lean) * yy + 0.07, { rx: -lean }));
  }
  for (const s of [-1, 1]) {
    P.add(M.oakDark, tubeGeo([s * (w / 2 - 0.14), h * 0.72 * Math.cos(lean), Math.sin(lean) * h * 0.72 + 0.06],
      [s * (w / 2 - 0.2), 0.03, -0.72], 0.05, 5));
  }
  P.add(M.ironRust, bx(0.16, 0.2, 0.05, 0, h * 0.55, Math.sin(lean) * h * 0.55 + 0.09));
  P.flush(g);
  return tagProp(g, 'mantlet', { cover: true, coverH: h, footprint: { x0: -w / 2 - 0.1, z0: -0.85, x1: w / 2 + 0.1, z1: 0.3 } });
}

/** A rack of spears against a wall. */
function spearRack({ seed = 'spear-rack', n = 7, w = 1.5, h = 1.9 } = {}) {
  const r = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  for (const s of [-1, 1]) P.add(M.oakDark, cyl(0.05, 0.06, 1.1, s * w / 2, 0.55, 0, { seg: 6 }));
  P.add(M.oakDark, bx(w + 0.12, 0.09, 0.16, 0, 1.02, 0, { seg: 3 }));
  P.add(M.oakDark, bx(w + 0.12, 0.09, 0.16, 0, 0.24, 0, { seg: 3 }));
  for (let i = 0; i < n; i += 1) {
    const x = -w / 2 + 0.12 + (i / Math.max(1, n - 1)) * (w - 0.24);
    const lean = r.range(-0.09, 0.09);
    P.add(M.oakSilver, cyl(0.023, 0.026, h, x, h / 2, 0.05, { seg: 5, rz: lean }));
    P.add(M.iron, cyl(0.006, 0.035, 0.3, x + Math.sin(-lean) * h * 0.5, h - 0.02, 0.05, { seg: 4, rz: lean }));
  }
  P.flush(g, { receive: false });
  return tagProp(g, 'spear-rack', { footprint: { x0: -w / 2 - 0.12, z0: -0.2, x1: w / 2 + 0.12, z1: 0.22 } });
}

/** A gabion: a wicker basket rammed with earth. The period's sandbag. Cover. */
function gabion({ seed = 'gabion', r: R = 0.52, h = 1.05 } = {}) {
  const rr = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  const seg = 11;
  P.add(M.wicker, cyl(R, R * 1.04, h, 0, h / 2, 0, { seg, open: true }));
  for (let k = 0; k < seg; k += 1) {
    const a = ((k + 0.5) / seg) * TAU;
    P.add(M.oakDark, bx(0.05, h + 0.1, 0.05, Math.cos(a) * R * 1.02, h / 2, Math.sin(a) * R * 1.02));
  }
  for (const yy of [h * 0.22, h * 0.55, h * 0.86]) {
    for (let k = 0; k < seg; k += 1) {
      const a = ((k + 0.5) / seg) * TAU;
      P.add(M.wicker, bx(0.055, 0.075, (TAU * R * 1.05) / seg * 1.1, Math.cos(a) * R * 1.05, yy, Math.sin(a) * R * 1.05, { ry: -a }));
    }
  }
  // the earth in it, heaped a little proud — an empty gabion is a bin
  for (let i = 0; i < 7; i += 1) {
    const a = rr.range(0, TAU);
    const rad = rr.range(0, R * 0.7);
    P.add(M.earth, bx(rr.range(0.2, 0.36), 0.14, rr.range(0.2, 0.36), Math.cos(a) * rad, h + 0.02, Math.sin(a) * rad, { ry: rr.range(0, TAU) }));
  }
  P.flush(g);
  return tagProp(g, 'gabion', { cover: true, coverH: h, footprint: { x0: -R - 0.06, z0: -R - 0.06, x1: R + 0.06, z1: R + 0.06 } });
}

/** A stretcher, set down. Nobody on it — no people, ever. */
function stretcher({ seed = 'stretcher', len = 1.9, w = 0.62 } = {}) {
  const r = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  for (const s of [-1, 1]) P.add(M.oakSilver, cyl(0.032, 0.032, len, 0, 0.16, s * w / 2, { seg: 5, rz: Math.PI / 2 }));
  P.add(M.canvasWorn, bx(len - 0.34, 0.05, w - 0.05, 0, 0.15, 0, { seg: 3 }));
  for (const s of [-1, 1]) P.add(M.oakDark, cyl(0.028, 0.028, w, s * (len / 2 - 0.3), 0.1, 0, { seg: 4, rx: Math.PI / 2 }));
  P.add(M.canvasWorn, bx(0.5, 0.09, 0.44, r.range(-0.3, 0.3), 0.22, r.range(-0.1, 0.1), { ry: r.range(0, TAU) }));
  P.flush(g);
  return tagProp(g, 'stretcher', { footprint: { x0: -len / 2, z0: -w / 2 - 0.05, x1: len / 2, z1: w / 2 + 0.05 } });
}

/**
 * A chain across a lane, on two staples.  It carries NO COLLIDER on
 * purpose: it is a sign that says "not this way", and a waist-high chain
 * that stops a body is a fence nobody drew.
 */
function chainAcross({ from, to, sag = 0.3, seed = 'chain', links = 22, posts = true }) {
  const r = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  const A = new THREE.Vector3().fromArray(from);
  const B = new THREE.Vector3().fromArray(to);
  const pt = (t) => new THREE.Vector3().lerpVectors(A, B, t).setY(A.y + (B.y - A.y) * t - Math.sin(Math.PI * t) * sag);
  for (let i = 0; i < links; i += 1) {
    const p0 = pt(i / links);
    const p1 = pt((i + 1) / links);
    P.add(M.ironRust, tubeGeo(p0.toArray(), p1.toArray(), 0.028, 4));
  }
  if (posts) {
    for (const p of [A, B]) {
      P.add(M.oakDark, cyl(0.07, 0.09, p.y + 0.1, p.x, (p.y + 0.1) / 2 - 0.05, p.z, { seg: 7 }));
      P.add(M.ironRust, cyl(0.05, 0.05, 0.05, p.x, p.y, p.z, { seg: 7, open: true, rx: Math.PI / 2 }));
    }
  }
  P.flush(g, { receive: false });
  void r;
  return tagProp(g, 'chain-across', { airborne: !posts });
}

/** Oil pots on a parapet — hung there this afternoon, unlit. */
function oilPots({ seed = 'oil-pots', n = 3, spread = 1.1 } = {}) {
  const r = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  for (let i = 0; i < n; i += 1) {
    const x = (i - (n - 1) / 2) * (spread / Math.max(1, n - 1)) * 2;
    const h = r.range(0.3, 0.42);
    const R = r.range(0.15, 0.2);
    P.add(M.rubble, cyl(R * 0.62, R * 0.5, 0.06, x, 0.03, 0, { seg: 9 }));
    P.add(M.plaster, cyl(R * 0.72, R, h, x, 0.03 + h / 2, 0, { seg: 9 }));
    P.add(M.plaster, cyl(R * 0.5, R * 0.72, 0.07, x, 0.03 + h + 0.035, 0, { seg: 9 }));
    P.add(M.hessian, cyl(R * 0.42, R * 0.42, 0.05, x, 0.03 + h + 0.09, 0, { seg: 8 }));
    P.add(M.rope, bx(R * 1.4, 0.03, 0.03, x, 0.03 + h * 0.7, 0));
  }
  P.flush(g);
  return tagProp(g, 'oil-pots', { footprint: { x0: -spread - 0.2, z0: -0.22, x1: spread + 0.2, z1: 0.22 } });
}

/* ==================================================================== *
 * 8.  THE COMPANY'S CAMP
 * ==================================================================== */

/**
 * A camp fire.  NO COLLIDER, and that is a hard rule for everything in the
 * surrounds: the fires and the tents stand in the enemies' spawn rings and
 * `check-nav.mjs` asserts those rings are open ground.  A prop that seals
 * a ring is a wave that never arrives.
 */
export function campFire({ seed = 'camp-fire', r: R = 0.8, lit = true, ctx = null, spit = true } = {}) {
  const rr = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  const n = 9;
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * TAU + rr.range(-0.15, 0.15);
    const s = rr.range(0.17, 0.27);
    P.add(rr.chance(0.4) ? M.curtainDark : M.rubble,
      bx(s, s * 0.7, s * 1.2, Math.cos(a) * R, s * 0.3, Math.sin(a) * R, { ry: -a + rr.range(-0.3, 0.3), rz: rr.range(-0.2, 0.2) }));
  }
  P.add(M.earth, cyl(R * 0.92, R * 0.85, 0.07, 0, 0.035, 0, { seg: 11 }));
  for (let i = 0; i < 5; i += 1) {
    const a = rr.range(0, TAU);
    P.add(M.barkDark, cyl(0.055, 0.065, R * rr.range(1.0, 1.5), Math.cos(a) * 0.1, 0.12 + i * 0.045, Math.sin(a) * 0.1,
      { seg: 5, rz: Math.PI / 2, ry: a }));
  }
  if (spit) {
    for (const s of [-1, 1]) {
      P.add(M.oakDark, tubeGeo([s * (R + 0.16), 0, -0.24], [s * (R * 0.35), 1.05, 0], 0.045, 5));
      P.add(M.oakDark, tubeGeo([s * (R + 0.1), 0, 0.28], [s * (R * 0.35), 1.05, 0], 0.045, 5));
    }
    P.add(M.ironRust, cyl(0.02, 0.02, R * 2.4, 0, 1.02, 0, { seg: 5, rz: Math.PI / 2 }));
    P.add(M.ironDark, cyl(0.16, 0.2, 0.26, 0, 0.68, 0, { seg: 10 }));
    P.add(M.ironRust, tubeGeo([-0.14, 0.82, 0], [0.14, 0.82, 0], 0.016, 4));
  }
  P.flush(g, { receive: false });

  const flame = new THREE.Group();
  const F = parts();
  F.add(M.emberDeep, cyl(R * 0.66, R * 0.5, 0.13, 0, 0.14, 0, { seg: 10 }));
  /* narrow and tall.  At 0.6 R the flame was a 0.96 m wide trapezoid of flat
   * saturated orange and it was the loudest object in any frame with a camp
   * in it — a fire reads by being TALLER than it is wide, not by being big. */
  F.add(M.ember, cyl(R * 0.4, R * 0.09, 0.82, 0, 0.52, 0, { seg: 8 }));
  F.add(M.lit, cyl(R * 0.2, R * 0.04, 0.5, 0, 0.42, 0, { seg: 7 }));
  F.flush(flame, { receive: false, cast: false });
  g.add(flame);

  tagProp(g, 'camp-fire', { fireY: 0.5, footprint: { x0: -R - 0.2, z0: -R - 0.2, x1: R + 0.2, z1: R + 0.2 } });
  const pool = lightPool({ r: R * 4.2, ember: true, opacity: 0.48 });
  pool.position.y = 0.03;
  const out = switchable(g, { pools: [pool], flames: [flame], lit, kind: 'camp-fire' });
  if (ctx) {
    let t = rr.range(0, 6);
    ctx.update((dt) => {
      if (!g.userData.lit) return;
      t += dt;
      pool.scale.setScalar(1 + Math.sin(t * 2.3) * 0.04 + Math.sin(t * 5.7) * 0.025);
    });
  }
  return out;
}

/**
 * A low ridge tent.  NO COLLIDER (see `campFire`).
 *
 * `company: true` puts it in `M.canvasCompany` — the Ashen Company's rust,
 * knocked back to a cloth value.  That colour is the ENEMY'S and belongs to
 * the surrounds and to nothing inside the walls.
 */
export function tent({ seed = 'tent', w = 2.8, d = 3.6, h = 1.75, company = false, cloth = null, open = true } = {}) {
  const r = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  const canvas = cloth != null ? painted(cloth) : (company ? M.canvasCompany : M.canvasWorn);
  const pitch = Math.atan2(h, w / 2);
  const slope = Math.hypot(h, w / 2);
  /* the rake is DERIVED: a box along X rotated by +t about Z sends its +x
   * end UP, so the slope that falls toward +x takes -pitch. */
  for (const s of [-1, 1]) {
    P.add(canvas, bx(slope, 0.055, d, s * w / 4, h / 2, 0, { rz: -s * pitch, seg: 3 }));
  }
  // ridge pole and two shears
  P.add(M.oakDark, cyl(0.045, 0.045, d + 0.5, 0, h + 0.03, 0, { seg: 6, rx: Math.PI / 2 }));
  for (const s of [-1, 1]) {
    P.add(M.oakDark, tubeGeo([-0.24, 0, s * (d / 2 - 0.1)], [0, h + 0.03, s * (d / 2 - 0.1)], 0.04, 5));
    P.add(M.oakDark, tubeGeo([0.24, 0, s * (d / 2 - 0.1)], [0, h + 0.03, s * (d / 2 - 0.1)], 0.04, 5));
  }
  /* the back gable, closed; the front left open with the flap thrown over
   * — an ends-open ridge tent is a sheet on a pole */
  const tri = [];
  const ref = [0, h / 2, 0];
  pushTri(tri, [-w / 2, 0, -d / 2], [w / 2, 0, -d / 2], [0, h, -d / 2], ref, true);
  const back = new THREE.Mesh(polyGeometry(tri), canvas);
  back.castShadow = true;
  back.receiveShadow = true;
  g.add(back);
  if (open) {
    P.add(canvas, bx(0.95, 0.05, 1.15, -w * 0.2, h * 0.72, d / 2 + 0.42, { rx: -0.5, rz: 0.4, seg: 2 }));
  } else {
    const tri2 = [];
    pushTri(tri2, [-w / 2, 0, d / 2], [w / 2, 0, d / 2], [0, h, d / 2], ref, true);
    const front = new THREE.Mesh(polyGeometry(tri2), canvas);
    front.castShadow = true;
    g.add(front);
  }
  // guys and pegs: what makes a tent read as pitched rather than as placed
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const a = [sx * w * 0.48, h * 0.88, sz * (d / 2 - 0.15)];
      const b = [sx * (w * 0.5 + 0.75), 0.02, sz * (d / 2 + 0.28)];
      P.add(M.rope, tubeGeo(a, b, 0.016, 4));
      P.add(M.oakDark, cyl(0.03, 0.02, 0.3, b[0], 0.08, b[2], { seg: 4, rz: r.range(-0.3, 0.3) }));
    }
  }
  P.flush(g);
  return tagProp(g, 'tent', {
    company, ridgeY: h, footprint: { x0: -w / 2 - 0.8, z0: -d / 2 - 0.4, x1: w / 2 + 0.8, z1: d / 2 + 0.5 },
  });
}

/** Everything in section 7, as one namespace — `villageProps`' opposite number. */
export const siegeProps = Object.freeze({
  breachRubble, siegeLadder, felledCart, arrowBundle, mantlet,
  spearRack, gabion, stretcher, chainAcross, oilPots, campFire, tent,
});
