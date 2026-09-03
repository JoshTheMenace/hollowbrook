import * as THREE from 'three';
import { defineDistrict } from '../core/district.js';
import {
  M, glowing, PAL, ACCENT, JOINERY,
  place, rng, seatOnGround, parts, bx, cyl, tubeGeo,
  cottage, roundTower,
  curtainWall, gatehouse, stairTurret, barricade, siegeProps, placeCover,
  campFire, tent,
  cart, barrelStack, crateStack, sackStack, logPile, hayRick, trough, villageProps,
  mountingBlock, wellHead, bannerPole, torch, brazier, postLantern,
  fenceRun, lightPool, interactive,
  signKit,
} from '../kit/index.js';
/* `tree` is a kit generator (`kit/trees.js`) that `kit/index.js` does not
 * re-export.  It is ONE tagged unit per tree, and the treeline needs it —
 * see the note where the treeline is laid.  Append-only request logged for
 * the coordinator: add `tree` to the index's `trees.js` re-export. */
import { tree } from '../kit/trees.js';

/* ==================================================================== *
 * SOUTHGATE — the barbican, the gate square, and the surrounds.
 *
 * THE LAND, MEASURED BEFORE ANYTHING WAS DRAWN (probe over the composed
 * terrain with `only: 'southgate'`, 3 m grid over the whole envelope):
 *   - x -18..18, z 16..48 is FLAT at y = 0.000, every metre of it, and so
 *     are all three ground sockets: gate-road (0, 16), sg-w-lane
 *     (-18, 34), sg-e-lane (18, 36).  This district lays NO ground.
 *   - the wall-walk shelves stand at y = 5.000 over z 48.8..51.2 for
 *     x -18..-3.5 and x 3.5..18; the gate gap x -3.5..3.5 reads 0.000 at
 *     every z through the passage, which is what `groundAt(x, z, fromY)`
 *     buys and the only reason the gate and the walk can share a plan.
 *   - the stair-head landing x -18..-15, z 45.8..48.8 is 5.000; the
 *     terrain's flight falls from it along z = 47.3 to 0.000 at x = -5.0
 *     (measured: -15 -> 4.80, -12 -> 3.20, -9 -> 1.80, -6 -> 0.20).
 *   - z = 52 is still 0.000 and z = 53 is 0.000 (the berm); the moor
 *     starts at z = 54 (-0.05) and falls to about -0.4 by z = 60, with
 *     the plan's 0.3 m roughness on it.  The spawn ring at (0, 60) is on
 *     that.
 *   - `groundAt` STOPS MOVING PAST z = 66: it reads the same value at 70,
 *     80 and 94 while the drawn `terrain:surrounds` mesh runs to z = 71.
 *     So NOTHING here is placed past z = 66 — a tree out there would be
 *     seated by a query that has stopped describing the ground.
 *
 * THE PLAN, and why:
 *   The lane is x -3..3 and it is the wave-1 channel: arch -> square ->
 *   the market ramp at (0, 16).  Everything is laid to leave it clear and
 *   to put cover on BOTH flanks of it, in two clusters rather than as
 *   scatter — the muster ground west, the stable yard east.  The square
 *   stays 28 m of open cobble because an arena is a place to fight in,
 *   and the temptation to fill it is the thing to resist.
 *
 *   HIGH GROUND is three-tiered on purpose: the wall-walk at 5.0 (the
 *   bowman's post, reached by the terrain's stair at x -5.6 or by either
 *   turret door), the gatehouse deck at 5.0 which looks straight down the
 *   lane, and THE SHOOTING STAGE at 0.86 in the muster ground — a plank
 *   platform on trestles the wardens threw up this afternoon so bows can
 *   shoot over the heads of the men in the square.  The stage is also the
 *   only elevation `check-game` can measure inside the arena rect: the
 *   terrain there is flat 0.000 to the millimetre and the walk is at
 *   z 48.8, outside the rect's z1 of 47, so without a made surface the
 *   arena reads ZERO elevated samples against a required six.  Its rect
 *   (x -13.0..-8.0, z 37.9..43.4) is 27.5 m², under composeCity's 30 m²
 *   "you are laying ground" limit, and covers nine of the gate's 2 m
 *   sample points.
 *
 *   ACCENT: `ACCENT.wardenMadder`, spent on the heraldic PAIR flanking
 *   the arch on the field face and on the two gate torches' device
 *   plates, and on nothing else.  `ACCENT.companyRust` appears ONCE, on
 *   the Company's banner in their camp — it is the enemy's colour and
 *   that camp is the one place in the world it is allowed.
 *
 *   TEN MINUTES AGO: the wardens were barring the gate — the draw bar is
 *   out of its sockets and leaning on the west pier with the crow and the
 *   maul dropped beside it, the leaves are swung back and not yet pulled
 *   to, the winch is rigged but the portcullis is still up.  A carrier's
 *   cart stands on the stable side with half its load on the cobbles and
 *   its horse gone.  A cart barricade is up across the east flank with
 *   its 1.9 m gap still open.
 *
 * TRAPS THIS FILE PAID FOR (append here, do not delete):
 *   - The plan's winch position (-5, 46.5) is INSIDE the kit gatehouse's
 *     west turret: the turret sits at (-5.6, 46.6) with r 1.6, i.e. an
 *     AABB of x -7.2..-4.0, z 45.0..48.2.  A prop written at the plan's
 *     own coordinate would have been inside a drum and inside a collider,
 *     and `check-interactions` would still have passed it — that gate
 *     only wants an effect within 8 m of the prompt, and never checks the
 *     prompt against the plan.  The kit's turrets are gone (see below) and
 *     the windlass stands out in the muster ground at (-4.7, 43.8), 7.78 m
 *     from the portcullis it drives — and, more to the point, 0.32 m clear
 *     of the ONLY route to the stair foot.  Every position nearer the gate
 *     was tried and each one closed that route to a single 0.35 m cell:
 *     the pocket between the pier and the stair's cheek wall is 1.9 m wide
 *     and a windlass is 1.4 of it.
 *   - THE KIT'S GATEHOUSE TURRETS STAND ON THE TERRAIN'S STAIR.  They are
 *     placed at (+-5.6, 46.6) with r 1.6 by construction, and the plan's
 *     `south-wall-stair` starts at (-5.6, 47.3) and runs west: the west
 *     turret's collider (x -7.36..-3.84, z 44.84..48.36) swallows the
 *     first four treads, so the wall-walk and the stair-head turret are
 *     BOTH unreachable and the gate renders perfectly.  `towers: false`,
 *     and the pair is rebuilt — first set back into the square, which
 *     filled the bowman's gallery, and finally as mural drums OUTSIDE the
 *     wall.  See the note at the placement for all four of their numbers.
 *   - A LANDMARK IS READ BY A RAY AT ITS BOUNDING-BOX CENTRE, and a
 *     gatehouse's box centre is on the gate's own axis 3.4 m up — inside
 *     the open arch.  The ray went through the opening, out over the moor
 *     and hit NOTHING: `arena:gate-square:landmarks` read 0/1 while the
 *     gatehouse filled every frame from the square.  The banner pair flies
 *     from the deck now, which takes the box to 10.0 m and puts its centre
 *     at 5.01 — measured against a scan of target heights, of which
 *     4.2..5.8 hit stone and everything outside it hits nothing.
 *   - ONE `treeStand` WITH TWELVE SPOTS IS ONE 55 m UNIT.  Its tagged box
 *     spans every spot, so the audit read the treeline as a linear run
 *     over bare moor (BURIED-RUN, worst 9.48 m) and then flagged OVERLAP
 *     against every tent, ladder and camp fire standing between the trees:
 *     nineteen failures from one call, none of them visible in any frame.
 *     `tree()` — one tagged unit per tree — is what the kit provides for
 *     this, and it is not in `kit/index.js`'s re-export list.
 *   - SEATING A PROP INSIDE THE GATE PASSAGE PUTS IT ON THE GATE'S ROOF.
 *     See `buildGroundWear`: two-argument `groundAt` is a max over
 *     platforms and the deck is one of them.
 *   - A LANDING THAT ABUTS A WALK SOCKET COSTS THAT SOCKET 0.34 m.  See
 *     the note at the stair turret: the corridor read 1.32 m against a
 *     1.40 m limit and the fix is to set the turret's dressing 0.14 m back
 *     off the walk's inner plane.
 *   - `check-game`'s elevation test samples `groundAt` with NO `fromY`,
 *     on a 2 m grid from `rect.x0 + 1`.  A raised deck must therefore be
 *     a registered PLATFORM, and it must be big enough that whole grid
 *     points land on it.
 *   - A raised deck needs its solid to be a COLLIDER WITH `top`, not no
 *     collider at all.  Without one the walker's `groundAt(x, z, fromY)`
 *     refuses the platform (it is more than 0.55 m up), answers with the
 *     terrain, and the player walks straight through the trestles at
 *     ground level.  With `top` the stage is solid from the square and
 *     stood on from the steps — the gatehouse pier's own pattern.
 *   - Everything the district owns in the SURROUNDS (the road, the berm,
 *     the camp, the treeline) is more than 2 m outside the envelope, so
 *     composeCity reports OUTSIDE-ENVELOPE warnings for it.  That is
 *     correct and decided: `plan.surrounds.owner` is southgate and no
 *     envelope in the plan contains the surrounds.  Warnings, not
 *     failures — but read them, because a REAL stray would hide there.
 * ==================================================================== */

const E = { x0: -18, z0: 16, x1: 18, z1: 54 };

/* ---- the shooting stage: the arena's own high ground ----------------- */
const STAGE = { x0: -13.0, x1: -8.0, z0: 37.9, z1: 43.4, y: 0.86 };
const STEP_N = 3;
const STEP_GOING = 0.42;                 // the route gate strides 0.35: never under 0.36
const STEP_RISE = STAGE.y / STEP_N;      // 0.287, under the 0.38 step limit
const STEP_X = [-11.25, -9.75];

/* ---- the flanking drums.  MINE, not the kit gatehouse's, and OUTSIDE
 * the wall rather than inside it — every one of these four numbers is
 * forced, and the note at the placement says by what. ----------------- */
const TOWER = { x: 7.4, z: 52.5, r: 1.7, h: 6.0, capH: 1.9 };

/* ---- the interactions ------------------------------------------------ */
const WINCH = [-4.7, 43.8];   // see the trap note: NOT the plan's (-5, 46.5)
const BRAZIER = [5.5, 44.0];  // the plan's own point

/* ---- the surrounds --------------------------------------------------- */
const ROAD_X = 0;
/** The siege road wanders: a dead straight lane across a moor is a runway. */
const roadAt = (z) => ROAD_X + Math.sin((z - 52) * 0.11) * 0.55 + Math.sin((z - 52) * 0.27) * 0.22;

/* ==================================================================== *
 * THE SHOOTING STAGE.  Trestles, a plank deck, a breastwork on the gate
 * side and a flight of three treads off the square.  Built here rather
 * than asked of the kit because it is a piece of temporary carpentry and
 * not a building: the kit has no generator for it, and the coordinator's
 * append-only rule says a local helper plus a note in the report is the
 * answer.  Every member runs between two joints.
 *
 * The breastwork's collider carries `bottom` for exactly the reason a
 * parapet does — it fences the deck and must not be a wall standing in
 * the muster ground three feet under it.
 * ==================================================================== */
function buildStage(ctx) {
  const r = rng('gate-stage');
  const g = new THREE.Group();
  const P = parts();
  const cx = (STAGE.x0 + STAGE.x1) / 2;
  const cz = (STAGE.z0 + STAGE.z1) / 2;
  const y0 = ctx.groundAt(cx, cz);
  const W = STAGE.x1 - STAGE.x0;
  const D = STAGE.z1 - STAGE.z0;
  const top = y0 + STAGE.y;

  /* the trestles: nine posts, braced both ways */
  const px = [STAGE.x0 + 0.3, cx, STAGE.x1 - 0.3];
  const pz = [STAGE.z0 + 0.3, cz, STAGE.z1 - 0.3];
  for (const x of px) {
    for (const z of pz) P.add(M.oakDark, bx(0.16, STAGE.y - 0.1, 0.16, x, y0 + (STAGE.y - 0.1) / 2, z));
  }
  for (const z of pz) P.add(M.oakDark, bx(W - 0.2, 0.13, 0.11, cx, y0 + 0.34, z, { seg: 4 }));
  for (const x of [px[0], px[2]]) {
    P.add(M.oak, tubeGeo([x, y0 + 0.06, pz[0]], [x, top - 0.14, pz[1]], 0.055, 5));
    P.add(M.oak, tubeGeo([x, y0 + 0.06, pz[2]], [x, top - 0.14, pz[1]], 0.055, 5));
  }

  /* the deck: real boards, so the top of it is not one flat card */
  const nB = Math.round(D / 0.32);
  for (let i = 0; i < nB; i += 1) {
    const z = STAGE.z0 + (i + 0.5) * (D / nB);
    P.add(r.chance(0.34) ? M.oakDark : M.oakSilver,
      bx(W, 0.09, D / nB - 0.014, cx, top - 0.045, z, { seg: 5 }));
  }
  P.add(M.oakDark, bx(W + 0.1, 0.16, 0.09, cx, top - 0.12, STAGE.z0 - 0.03, { seg: 5 }));

  /* the breastwork on the gate side: chest height, shot OVER */
  const BH = 0.95;
  for (let i = 0; i < 13; i += 1) {
    const x = STAGE.x0 + 0.1 + (i / 12) * (W - 0.2);
    P.add(r.chance(0.4) ? M.oakDark : M.oakSilver,
      bx(W / 13 - 0.02, BH, 0.07, x, top + BH / 2, STAGE.z1 - 0.09, { seg: 2 }));
  }
  for (const yy of [0.28, BH - 0.16]) {
    P.add(M.oakDark, bx(W, 0.09, 0.11, cx, top + yy, STAGE.z1 - 0.16, { seg: 5 }));
  }
  for (const x of [STAGE.x0 + 0.12, cx, STAGE.x1 - 0.12]) {
    P.add(M.oakDark, bx(0.13, BH + 0.12, 0.13, x, top + (BH + 0.12) / 2, STAGE.z1 - 0.12));
  }
  /* the two side rails: posts and a top rail, open enough to see through
   * so the stage does not read as a shed */
  for (const sx of [-1, 1]) {
    const x = sx < 0 ? STAGE.x0 + 0.12 : STAGE.x1 - 0.12;
    for (const z of [STAGE.z0 + 0.5, cz]) P.add(M.oakDark, bx(0.12, 1.0, 0.12, x, top + 0.5, z));
    P.add(M.oakSilver, bx(0.1, 0.09, D - 0.9, x, top + 0.96, cz - 0.2, { seg: 4 }));
  }

  /* the flight off the square.  The treads OVERLAP rather than meet — a
   * platform seam is a hole a 0.35 m grid lands on every single time. */
  const sw = STEP_X[1] - STEP_X[0];
  const scx = (STEP_X[0] + STEP_X[1]) / 2;
  for (let i = 0; i < STEP_N; i += 1) {
    const h = (i + 1) * STEP_RISE;
    const z1 = STAGE.z0 - STEP_GOING * (STEP_N - 1 - i);
    const z0 = z1 - STEP_GOING;
    P.add(M.oakSilver, bx(sw, 0.1, STEP_GOING + 0.04, scx, y0 + h - 0.05, (z0 + z1) / 2, { seg: 2 }));
    P.add(M.oakDark, bx(sw, Math.max(0.08, h - 0.1), 0.1, scx, y0 + Math.max(0.08, h - 0.1) / 2, z0 + 0.05));
    ctx.platform(STEP_X[0], z0 - 0.03, STEP_X[1], z1 + 0.03, y0 + h);
  }
  for (const x of STEP_X) {
    P.add(M.oakDark, tubeGeo([x, y0 + 0.05, STAGE.z0 - STEP_GOING * STEP_N],
      [x, top - 0.1, STAGE.z0 - 0.05], 0.07, 5));
  }

  /* what is standing ON the deck is built INTO this group, not placed on
   * it.  A tagged prop set on a platform is two audit units sharing a
   * bounding box, and the spatial audit fails both for OVERLAP — which is
   * exactly what a spear rack and a lantern up here did. */
  for (let i = 0; i < 5; i += 1) {                    // spare shafts, leaning
    const x = cx + 1.05 + i * 0.055;
    P.add(i % 2 ? M.oakSilver : M.oakDark,
      cyl(0.026, 0.03, 2.05, x, top + 0.98, STAGE.z1 - 0.42, { seg: 5, rz: 0.11, rx: -0.16 }));
  }
  for (let i = 0; i < 3; i += 1) {                    // a bundle of boards
    P.add(M.oakSilver, bx(2.3, 0.07, 0.26, cx - 1.2, top + 0.05 + i * 0.075, STAGE.z0 + 0.75,
      { ry: 0.04 * i, seg: 3 }));
  }
  P.add(M.rope, cyl(0.3, 0.3, 0.11, cx - 1.9, top + 0.06, cz + 0.9, { seg: 10 }));
  P.add(M.rope, cyl(0.2, 0.2, 0.09, cx - 1.9, top + 0.15, cz + 0.9, { seg: 10 }));
  for (let i = 0; i < 4; i += 1) {                    // arrows stuck in the rail
    P.add(M.oakSilver, cyl(0.014, 0.014, 0.72, cx - 0.4 + i * 0.09, top + BH + 0.2, STAGE.z1 - 0.18,
      { seg: 4, rz: 0.08 * (i - 1.5) }));
  }

  P.flush(g);
  g.name = 'shooting-stage';
  g.userData = { prop: true, kind: 'shooting-stage', cover: true, coverH: 1.35 };

  ctx.platform(STAGE.x0, STAGE.z0, STAGE.x1, STAGE.z1, top);
  ctx.collide(STAGE.x0, STAGE.z0, STAGE.x1, STAGE.z1, top, undefined);
  ctx.collide(STAGE.x0, STAGE.z1 - 0.24, STAGE.x1, STAGE.z1, undefined, top);
  ctx.add(g, 'shooting-stage');
  return { group: g, top };
}

/* ==================================================================== *
 * THE WINDLASS.  A drum on two standards with a ratchet and a pawl, the
 * chain running up into the gatehouse's own chase.  Built from joints:
 * the standards carry the axle and the axle carries the drum.
 * ==================================================================== */
function buildWinch(ctx, at) {
  const g = new THREE.Group();
  const P = parts();
  const [x, z] = at;
  const y = ctx.groundAt(x, z);
  const AX = 0.92;
  const HW = 0.62;
  const spin = new THREE.Group();
  const S = parts();

  for (const sx of [-1, 1]) {
    P.add(M.oakDark, bx(0.19, AX + 0.24, 0.24, x + sx * HW, y + (AX + 0.24) / 2, z, { seg: 2 }));
    P.add(M.oak, tubeGeo([x + sx * HW, y + AX - 0.12, z], [x + sx * (HW + 0.42), y + 0.05, z + 0.32], 0.06, 5));
  }
  P.add(M.oakDark, bx(HW * 2 + 0.5, 0.16, 0.44, x, y + 0.08, z, { seg: 3 }));
  P.add(M.ironRust, cyl(0.28, 0.28, 0.06, x + HW + 0.11, y + AX, z, { seg: 12, rz: Math.PI / 2 }));
  P.add(M.ironRust, tubeGeo([x + HW + 0.11, y + AX + 0.3, z + 0.1], [x + HW + 0.11, y + AX - 0.16, z + 0.34], 0.04, 5));

  S.add(M.oak, cyl(0.23, 0.23, HW * 2 - 0.18, 0, 0, 0, { seg: 10, rz: Math.PI / 2 }));
  for (const sx of [-1, 1]) S.add(M.ironRust, cyl(0.245, 0.245, 0.05, sx * (HW - 0.16), 0, 0, { seg: 10, rz: Math.PI / 2 }));
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * Math.PI * 2;
    S.add(M.oakDark, bx(HW * 2 - 0.2, 0.06, 0.06, 0, Math.sin(a) * 0.21, Math.cos(a) * 0.21, { seg: 3 }));
  }
  S.add(M.rope, cyl(0.27, 0.27, 0.5, 0.1, 0, 0, { seg: 10, rz: Math.PI / 2 }));
  S.add(M.iron, bx(0.05, 0.05, 0.44, -HW - 0.06, 0, 0.22, { seg: 2 }));
  S.add(M.oakDark, cyl(0.05, 0.05, 0.24, -HW - 0.2, 0, 0.44, { seg: 6, rz: Math.PI / 2 }));
  S.flush(spin, { receive: false });
  spin.position.set(x, y + AX, z);
  g.add(spin);

  // the chain, leaving the drum for the chase in the gatehouse's west pier
  P.add(M.ironRust, tubeGeo([x + 0.1, y + AX + 0.25, z], [x + 0.55, y + 2.15, z + 2.0], 0.045, 5));

  P.flush(g);
  g.name = 'portcullis-winch';
  g.userData = { prop: true, kind: 'windlass' };
  ctx.add(g, 'portcullis-winch');
  ctx.collide(x - HW - 0.1, z - 0.34, x + HW + 0.1, z + 0.34);
  return { group: g, spin };
}

/* ==================================================================== *
 * GROUND WEAR.  Cart ruts out of the gate, the trodden apron under the
 * arch, mud and straw where the horses stand.  Thin merged slabs a few
 * millimetres over the terrain: the district lays no ground, this is
 * paint on the ground somebody else laid.
 * ==================================================================== */
function buildGroundWear(ctx) {
  const r = rng('gate-wear');
  const g = new THREE.Group();
  const P = parts();
  /* `groundAt(x, z, 0)` AND NOT `groundAt(x, z)`.  Every builder in the kit
   * seats a prop with two arguments, and that is right — until the ground
   * under the prop has a second walkable level over it.  The gatehouse
   * registers its deck as a platform at 5.0 across x -3.8..3.8,
   * z 47.6..52.4, so the two-argument query answers FIVE METRES for every
   * rut and every gravel patch inside the gate passage: the wear laid
   * itself on the roof of the gate, over the heads of anyone walking
   * through it, and neither the spatial audit nor any frame from the
   * square said a word.  A raycast at the gatehouse found it — the hit
   * list had `ground-wear` in it at y 5.00. */
  const put = (mat, w, d, x, z, ry = 0, lift = 0.012) => {
    P.add(mat, bx(w, 0.02, d, x, ctx.groundAt(x, z, 0) + lift, z, { ry }));
  };
  for (const sx of [-1, 1]) {
    for (let z = 17; z < 53; z += 1.6) {
      const x = sx * 0.78 + Math.sin(z * 0.09) * 0.5;
      put(M.pavingDark, 0.34, 1.5, x, z, Math.sin(z * 0.4) * 0.03);
    }
  }
  /* the apron is `pavingDark` two times in three.  In `gravel` — the palest
   * ground tone in the pool — every patch reads at two metres as a sheet of
   * pale paper laid on the road, and the gate mouth is exactly where the
   * player stands two metres from the ground. */
  for (let i = 0; i < 26; i += 1) {
    put(r.chance(0.34) ? M.gravel : M.pavingDark,
      r.range(0.5, 1.3), r.range(0.45, 1.1), r.range(-3.1, 3.1), r.range(44.5, 53.5), r.range(0, 3.14), 0.01);
  }
  for (let i = 0; i < 14; i += 1) {
    put(r.chance(0.5) ? M.earth : M.straw, r.range(0.7, 1.9), r.range(0.6, 1.5),
      r.range(4.6, 13.5), r.range(20, 33), r.range(0, 3.14), 0.01);
  }
  for (let i = 0; i < 12; i += 1) {
    put(r.chance(0.4) ? M.earth : M.gravel, r.range(0.8, 2.0), r.range(0.7, 1.6),
      r.range(-14.5, -5.0), r.range(29, 44), r.range(0, 3.14), 0.01);
  }
  P.flush(g, { cast: false });
  g.name = 'ground-wear';
  ctx.add(g, 'ground-wear');
  return g;
}

/* ==================================================================== */

export const southgate = defineDistrict({
  id: 'southgate',
  envelope: E,
  after: [],
  build(ctx, { plan }) {
    const G = (x, z) => ctx.groundAt(x, z);
    /** Seat a prop by query, add it, optionally collide an absolute rect. */
    const put = (obj, x, z, name, { ry = 0, box = null } = {}) => {
      obj.position.set(x, 0, z);
      if (ry) obj.rotation.y = ry;
      seatOnGround(obj, ctx.groundAt);
      ctx.add(obj, name);
      if (box) ctx.collide(box[0], box[1], box[2], box[3]);
      return obj;
    };
    const boxAt = (x, z, hx, hz) => [x - hx, z - hz, x + hx, z + hz];

    /* ================================================================ *
     * 1. THE WALL AND THE GATE
     *
     * Both runs end in 'none' at BOTH ends: the west run meets
     * millreach's `mr-walk-s` at x -18 and the gatehouse at x -3.5, the
     * east run meets the gatehouse at 3.5 and wardrow's `wr-walk-s` at
     * 18.  A pier at any of those four is a pier standing in somebody
     * else's wall.
     * ================================================================ */
    curtainWall({ from: -18, to: -3.5, side: 's', ctx, plan, seed: 'sg-curtain-w', endCaps: ['none', 'none'] });
    curtainWall({ from: 3.5, to: 18, side: 's', ctx, plan, seed: 'sg-curtain-e', endCaps: ['none', 'none'] });

    /* the gatehouse.  `name: 'gatehouse'` is a CONTRACT, not a label:
     * `landmarks_citywide` names `district:southgate:gatehouse`, and both
     * `check-game`'s landmark ray and the `from-the-keep` vista look it
     * up by that exact string. */
    /* `towers: false` — SEE THE TRAP NOTE.  The kit's own flanking pair
     * lands at (+-5.6, 46.6) with r 1.6, and the terrain's stair starts at
     * (-5.6, 47.3): the west turret stands on the first four treads and
     * seals the only way up to the wall.  Measured before the frames:
     * a linear trace up z = 47.3 is BLOCKED by the turret's own collider
     * (x -7.36..-3.84, z 44.84..48.36) from x -4.0 to -7.5, and the flood
     * fill reported both the wall-walk and the stair-head turret
     * unreachable while every frame of the gate looked perfect. */
    const gh = gatehouse({
      gate: plan.siege.gates['south-gate'], ctx, plan,
      seed: 'south-gatehouse', id: 'south-gate', name: 'gatehouse',
      accent: JOINERY.oakStain, towers: false,
    });

    /* THE FLANKING DRUMS STAND OUTSIDE THE WALL, and the reason is the
     * bowman.  They were first set back into the square at (+-5.9, 42.6),
     * which is the only town-side ground the stair leaves free — and the
     * frame from the militia bowman's own post at (8, 50) came back with
     * the east drum filling the middle of it.  His post exists to be a
     * shooting gallery down onto the wave-1 lane; a 7.9 m drum on that
     * line is the gallery.  Out in the ditch they are mural towers
     * flanking the gate from the field, which is what a barbican pair is
     * anyway, and the square is left open for the fight.
     *
     * Every number is forced:
     *   - z 52.5 with r 1.7 puts the drum's inner face at 50.80, which is
     *     exactly where the curtain's own parapet collider already ends:
     *     one metre further in and the drum eats the walk (measured: at
     *     z 51.8 the free band across the walk falls to 0.96 m and the
     *     bowman's own post is inside it);
     *   - x +-7.4 puts its west face at 5.70, and the spawn ring is
     *     (0, 60) r 8: at the drum's own north face (z 54.2) the ring
     *     reaches |x| = 5.51, so 5.70 is 0.19 m outside it.  NOTHING may
     *     carry a collider in that ring — a prop that seals it is a wave
     *     that never arrives;
     *   - h 6.0 + capH 1.9 = 7.90, and that is the VISTA.  The
     *     `from-the-road` camera runs (-8, 8.5, 64) -> (4, 12, -30), so at
     *     the drums' own z its ray is at x -6.53, y 8.93 — inside the west
     *     drum's plan and 1.03 m over its cap.  At the kit gatehouse's own
     *     9.6 m + cone it would have gone straight through the subject,
     *     and with keephill still a stub NO GATE COULD HAVE TOLD ME. */
    for (const [tag, sx] of [['w', -1], ['e', 1]]) {
      const t = roundTower({
        seed: `gate-drum-${tag}`, r: TOWER.r, h: TOWER.h, taper: 0.1, crook: 0.3, seg: 13,
        wall: 'granite', cap: 'cone', capH: TOWER.capH, bands: 2,
        corbel: true, machicolation: true, finial: sx > 0,
        windows: [
          { y: 2.3, a: sx * 0.5, w: 0.26, h: 0.9 },
          { y: 4.3, a: sx * 2.3, w: 0.26, h: 0.9 },
          { y: 4.3, a: sx * 0.3, w: 0.26, h: 0.9 },
        ],
        door: null,
      });
      place(ctx, t, { x: sx * TOWER.x, z: TOWER.z, yaw: 0, name: `gate-drum-${tag}` });
    }

    /* the stair turret, on the terrain's own landing.
     *
     * THE LANDING IS PASSED 0.14 m SHORT OF THE WALK'S INNER PLANE, and
     * that is the only way this socket passes.  The landing (x -18..-15,
     * z 45.8..48.8) is the one stair head in the town that abuts a
     * wall-walk SOCKET — `sg-walk-w` at (-18, 50).  Every collider the
     * turret registers on it (its west parapet, its doorway jambs) caps at
     * `landing.z1`, and a walker's 0.34 m radius then reaches 0.34 m into
     * the walk: measured, the corridor came back 1.32 m clear against the
     * seam gate's 1.40 m limit, with the curtain's own parapet taking the
     * other side.  Setting the dressing back to 48.66 (and telling
     * `siegeOf` so, or the walk-side derivation throws) reads 1.46 m.  The
     * stonework's own facing is 0.38 m thick and battered outward, so it
     * still covers the terrain's scarp; nothing moves but the colliders. */
    const shelf = plan.terrain.shelves.find((s) => s.in === 'southgate' && s.z0 === 45.8);
    const landing = { ...shelf, z1: 48.66 };
    const flight = plan.terrain.crossings.find((c) => c.id === 'south-wall-stair');
    const turretPlan = { ...plan, siege: { ...plan.siege, wall_inner: 48.66 } };
    stairTurret({ landing, flight, ctx, plan: turretPlan, seed: 'sg-stair-turret', name: 'stair-turret' });

    /* the gatehouse's own two wall torches, lit — the wardens are on the
     * wall and it is nearly dark.  The kit builds them unlit and merely
     * hides the flame, so this is a real switch and not a rebuild. */
    for (const t of gh.userData.practicals ?? []) t.userData.setLit?.(true);

    /* ================================================================ *
     * 2. THE ACCENT — `ACCENT.wardenMadder`, and it is spent HERE.
     *
     * The heraldic pair stands on the FIELD face flanking the arch, at
     * x +-4.35, z 52.9: clear of the wall's own face, outside the 5.7 m
     * passage, and in the `from-the-road` frame.  The device is the
     * portcullis, which is the wardens' charge and which is standing over
     * your head in the arch — that is what stops it reading as ornament.
     * ================================================================ */
    /* THE PAIR FLIES FROM THE DECK, and that is a landmark decision as much
     * as a heraldic one.  `check-game` reads a landmark by raycasting from
     * the arena's centre to the object's BOUNDING-BOX CENTRE, and a
     * gatehouse's box centre is 3.37 m up on the gate's own axis — i.e.
     * inside the open arch.  The ray went clean through the opening and
     * out over the moor: ZERO hits, and the landmark read 0/1 while every
     * frame showed a gatehouse filling the view.  Two staffs on the deck
     * take the box to 11.4 m, which puts its centre at 5.7 and the ray on
     * the town-face parapet — solid stone.  They carry NO collider, the
     * call `chainAcross` and the kit's own wall torches already make:
     * slim furniture on a 3.6 m walk is not a wall. */
    for (const [tag, sx] of [['w', -1], ['e', 1]]) {
      const b = bannerPole({
        seed: `gate-banner-${tag}`, h: 4.45, bw: 0.9, bh: 2.6, folds: 5,
        field: ACCENT.wardenMadder, band: JOINERY.bone,
        device: 'portcullis', deviceInk: JOINERY.bone, base: 'stone',
      });
      b.position.set(sx * 3.0, 5.0, -0.5);
      b.rotation.y = Math.PI;
      b.userData.airborne = true;
      b.name = `gate-banner-${tag}`;
      gh.add(b);
    }
    /* the two gate torches on the field face, each carrying a madder
     * device plate — the second and last thing wearing the accent */
    for (const [tag, x] of [['w', -4.6], ['e', 4.6]]) {
      put(torch({ seed: `gate-torch-${tag}`, h: 2.4, lit: true, post: true }), x, 51.9, `gate-torch-${tag}`,
        { box: boxAt(x, 51.9, 0.2, 0.2) });
      const plate = signKit.devicePlate({
        device: 'portcullis', w: 0.46, h: 0.52, seed: `gate-plate-${tag}`,
        bg: ACCENT.wardenMadder, ink: JOINERY.bone,
      });
      plate.position.set(x, G(x, 51.9) + 1.44, 52.02);
      plate.userData.airborne = true;
      ctx.add(plate, `gate-plate-${tag}`);
    }

    /* ================================================================ *
     * 3. THE SQUARE — the wardens' lodge west, the stable east, and the
     *    lane between them left alone.
     * ================================================================ */
    /* the wardens' lodge.  Two storeys of granite under shingle, front
     * (authored +z) turned to +x by yaw PI/2 so its door and its fascia
     * address the muster ground and the lane — a shelter's door faces the
     * arena.  Rotated footprint: x -15.0..-9.0, z 21.6..28.8. */
    const lodge = cottage({
      seed: 'wardens-lodge', w: 7.2, d: 6.0, storeys: 2, groundH: 2.5, upperH: 2.2,
      wall: 'granite', roof: 'shingle', ridgeAxis: 'x', crook: 0.5,
      door: JOINERY.oakStain, shutter: JOINERY.doveGrey, shutters: 'mixed',
      chimney: true, litWindows: 2, jetty: 0,
    });
    place(ctx, lodge, { x: -12.0, z: 25.2, yaw: Math.PI / 2, name: 'wardens-lodge' });

    /* the stable.  Long and low, front turned to -x so it opens onto its
     * own yard and the lane.  Rotated footprint: x 8.8..14.4, z 18.5..27.5. */
    const stable = cottage({
      seed: 'gate-stable', w: 9.0, d: 5.6, storeys: 1.5, groundH: 2.6,
      wall: 'render', roof: 'shingle', ridgeAxis: 'x', crook: 0.9,
      door: JOINERY.oakStain, shutter: JOINERY.mossPaint, shutters: 'open',
      chimney: false, litWindows: 1,
    });
    place(ctx, stable, { x: 11.6, z: 23.0, yaw: -Math.PI / 2, name: 'gate-stable' });

    /* the shooting stage: the arena's own high ground and its hexer perch */
    const stage = buildStage(ctx);

    /* ================================================================ *
     * 4. COVER — two clusters, and the lane between them left clear.
     *
     * Every tagged prop goes through `placeCover`, which registers the
     * ROTATED footprint and throws on anything tagged `cover` under
     * 0.9 m.  Nothing stands inside x -3..3: the wave has to be able to
     * run the lane, and the player has to be able to break its line by
     * stepping off it.
     * ================================================================ */
    /* -- west: the muster ground.  A mantlet facing the arch, gabions
     *    rammed and set in a short lane toward the stage, the spear rack
     *    and the trough behind them. */
    placeCover(ctx, siegeProps.mantlet({ seed: 'muster-mantlet', w: 1.7, h: 1.5 }),
      { x: -9.2, z: 44.9, yaw: 0, name: 'muster-mantlet' });
    for (const [tag, x, z] of [['a', -6.2, 38.6], ['b', -7.0, 36.8], ['c', -5.4, 40.6]]) {
      placeCover(ctx, siegeProps.gabion({ seed: `muster-gabion-${tag}`, r: 0.54, h: 1.05 }),
        { x, z, name: `muster-gabion-${tag}` });
    }
    placeCover(ctx, siegeProps.spearRack({ seed: 'muster-spears', n: 8, w: 1.6 }),
      { x: -13.6, z: 35.8, yaw: Math.PI / 2, name: 'muster-spears' });
    put(trough({ seed: 'muster-trough', len: 1.9, w: 0.7 }), -9.2, 34.0, 'muster-trough',
      { ry: Math.PI / 2, box: boxAt(-9.2, 34.0, 0.42, 1.02) });
    /* the log pile is at 30.8 and not at 33: the `sg-w-lane` socket keeps a
     * 3 m corridor over z 32.5..35.5 for 3 m into this side, and at 33 the
     * pile's own collider narrowed it to 0.94 m — a lane that renders
     * perfectly and that the seam gate fails. */
    put(logPile({ seed: 'muster-logs', w: 2.2, h: 1.05, d: 0.7 }), -15.6, 30.8, 'muster-logs',
      { ry: Math.PI / 2, box: boxAt(-15.6, 30.8, 0.47, 1.22) });
    for (const [tag, x, z] of [['a', -7.7, 39.5], ['b', -13.7, 44.1]]) {
      placeCover(ctx, siegeProps.arrowBundle({ seed: `muster-arrows-${tag}`, n: 22 }),
        { x, z, name: `muster-arrows-${tag}` });
    }

    /* -- east: the stable yard.  The carrier's cart abandoned mid-unload,
     *    its load half on the cobbles, the well, the barrels rolled out. */
    {
      const c = cart({ seed: 'carrier-cart', L: 2.8, W: 1.4, load: 'crates', shafts: true });
      c.userData.cover = true;
      c.userData.coverH = 1.15;
      placeCover(ctx, c, { x: 6.6, z: 28.6, yaw: -Math.PI / 2, name: 'carrier-cart' });
    }
    put(crateStack({ seed: 'carrier-crates', n: 4, spill: true }), 4.8, 32.8, 'carrier-crates',
      { box: boxAt(4.8, 32.8, 0.75, 0.6) });
    put(sackStack({ seed: 'carrier-sacks', n: 5 }), 8.2, 30.6, 'carrier-sacks',
      { box: boxAt(8.2, 30.6, 0.4, 0.4) });
    put(wellHead({ seed: 'gate-well', r: 0.85, h: 0.76, roof: true, bucket: true }), 8.4, 34.8, 'gate-well',
      { box: boxAt(8.4, 34.8, 1.1, 1.1) });
    put(barrelStack({ seed: 'stable-barrels-a', rows: 3 }), 4.9, 24.2, 'stable-barrels-a',
      { ry: Math.PI / 2, box: boxAt(4.9, 24.2, 0.62, 1.0) });
    put(barrelStack({ seed: 'stable-barrels-b', rows: 2 }), 6.4, 20.6, 'stable-barrels-b',
      { box: boxAt(6.4, 20.6, 1.0, 0.62) });
    /* the rick is 1.25 m and tucked against the stable's north gable, not
     * 1.7 m out in the yard.  Straw is the most saturated material in the
     * pool after the accent itself, and from the bowman's post a 3.4 m
     * orange drum standing clear of everything was the loudest thing in
     * the frame — louder than the madder it must not compete with. */
    put(hayRick({ seed: 'stable-rick', r: 1.25, h: 2.1 }), 12.6, 29.2, 'stable-rick',
      { box: boxAt(12.6, 29.2, 1.3, 1.3) });
    put(villageProps.hayBale({ seed: 'stable-bale-a', r: 0.52 }), 10.6, 29.6, 'stable-bale-a',
      { box: boxAt(10.6, 29.6, 0.5, 0.5) });
    put(villageProps.hayBale({ seed: 'stable-bale-b', r: 0.5, square: true }), 10.9, 31.0, 'stable-bale-b',
      { box: boxAt(10.9, 31.0, 0.5, 0.5) });
    put(trough({ seed: 'stable-trough', len: 2.1, w: 0.72 }), 8.0, 20.0, 'stable-trough',
      { box: boxAt(8.0, 20.0, 1.12, 0.44) });
    /* the mounting block — the hexer perch on the east side.  It registers
     * its own treads as platforms and carries NO footprint collider, so
     * it is stood on rather than walked into. */
    {
      const mb = mountingBlock({ seed: 'stable-block', w: 1.0, treads: 3, rise: 0.24, going: 0.42 });
      put(mb, 8.6, 27.8, 'stable-block');
      for (let i = 0; i < 3; i += 1) {
        ctx.platform(8.1, 27.8 - 0.42 * (i + 1) - 0.03, 9.1, 27.8 - 0.42 * i + 0.03, G(8.6, 27.8) + 0.24 * (i + 1));
      }
    }
    put(logPile({ seed: 'stable-logs', w: 2.0, h: 1.0, d: 0.65 }), 15.4, 25.6, 'stable-logs',
      { ry: Math.PI / 2, box: boxAt(15.4, 25.6, 0.45, 1.12) });

    /* -- the CHOKEPOINT on the east flank: a cart barricade the wardens
     *    got up this afternoon, with its 1.9 m gap still open.  The gap is
     *    the whole point — the kit throws under 1.8 m because a barricade
     *    laid clean across a lane is a sealed lane. */
    barricade({
      seed: 'east-flank-barricade', kind: 'carts', w: 5.2, gap: 1.9, gapAt: 'right',
      at: [10.8, 43.4], yaw: 0, ctx, state: 'up', name: 'east-barricade',
    });
    /* barrels rolled out of the stable and stood on end just inside the
     * arch: the east flank's answer to the muster ground's gabions, so a
     * player driven off the lane has cover on BOTH sides of it. */
    put(barrelStack({ seed: 'gate-barrels-a', rows: 3 }), 6.8, 41.5, 'gate-barrels-a',
      { ry: Math.PI / 2, box: boxAt(6.8, 41.5, 0.62, 1.0) });
    put(barrelStack({ seed: 'gate-barrels-b', rows: 2 }), 8.0, 39.6, 'gate-barrels-b',
      { box: boxAt(8.0, 39.6, 1.0, 0.62) });
    placeCover(ctx, siegeProps.felledCart({ seed: 'gate-felled-cart' }),
      { x: 13.0, z: 39.2, yaw: Math.PI / 2, name: 'gate-felled-cart' });

    /* -- ten minutes ago: the wardens were barring the gate.  The draw bar
     *    is out of its sockets and leaning on the west pier, with the crow
     *    and the maul dropped where they were using them. */
    {
      const g = new THREE.Group();
      const P = parts();
      const ax = 4.2;
      const az = 47.3;
      const y = G(ax, az);
      P.add(M.oakDark, bx(0.22, 3.4, 0.26, ax, y + 1.6, az, { rx: 0.34, seg: 4 }));
      P.add(M.ironRust, bx(0.26, 0.1, 0.3, ax, y + 0.6, az - 0.34, { rx: 0.34 }));
      P.add(M.ironRust, bx(0.26, 0.1, 0.3, ax, y + 2.45, az + 0.29, { rx: 0.34 }));
      P.add(M.iron, cyl(0.035, 0.045, 1.35, ax + 0.85, y + 0.06, az - 0.55, { seg: 6, rz: Math.PI / 2, ry: 0.5 }));
      P.add(M.oakDark, cyl(0.045, 0.045, 0.8, ax + 1.35, y + 0.07, az - 1.15, { seg: 6, rz: Math.PI / 2, ry: -0.3 }));
      P.add(M.ironDark, bx(0.16, 0.16, 0.3, ax + 1.75, y + 0.12, az - 1.27, { ry: -0.3 }));
      P.add(M.rope, cyl(0.34, 0.34, 0.12, ax + 0.45, y + 0.06, az + 0.95, { seg: 10 }));
      P.flush(g);
      g.name = 'the-draw-bar';
      g.userData = { prop: true, kind: 'draw-bar' };
      ctx.add(g, 'the-draw-bar');
      ctx.collide(ax - 0.3, az - 0.7, ax + 0.3, az + 0.7);
    }

    /* ================================================================ *
     * 5. THE INTERACTIONS
     * ================================================================ */
    /* -- the portcullis winch.  The kit's gatehouse hands back the real
     *    portcullis as a live group; E turns the drum and drops it 1.2 m.
     *    The prop moves now; the mechanic is the game's later. */
    {
      const w = buildWinch(ctx, WINCH);
      const pc = gh.userData.portcullis;
      const pcY0 = pc.position.y;
      const DROP = 1.2;
      let t = 0;
      let turning = 0;
      ctx.update((dt) => {
        if (turning <= 0) return;
        const step = Math.min(dt / 1.6, turning);
        turning -= step;
        t = Math.min(1, t + step);
        w.spin.rotation.x -= step * 7.4;
        pc.position.y = pcY0 - DROP * t;
      });
      ctx.reset(() => { t = 0; turning = 0; w.spin.rotation.x = 0; pc.position.y = pcY0; });
      interactive(ctx, {
        name: 'the portcullis winch', label: 'Turn the winch',
        at: [WINCH[0], G(WINCH[0], WINCH[1]) + 1.0, WINCH[1]], size: [1.9, 1.9, 1.4],
        action: () => { turning = 1 - t; },
      });
    }

    /* -- the gate brazier, built UNLIT.  The flame and the pool are LOCAL
     *    materials and local meshes: `brazier`'s own lit form drives the
     *    SHARED pooled ember material, and a district that animates a
     *    shared material animates every practical in the town. */
    {
      const [BX, BZ] = BRAZIER;
      const by = G(BX, BZ);
      put(brazier({ seed: 'gate-brazier', r: 0.42, h: 0.68, lit: false }), BX, BZ, 'gate-brazier',
        { box: boxAt(BX, BZ, 0.46, 0.46) });

      const fire = new THREE.Group();
      const F = parts();
      const flameMat = glowing(PAL.ember, PAL.ember, 0.8);
      const coreMat = glowing(PAL.warmLight, PAL.warmLight, 0.95);
      F.add(M.emberDeep, cyl(0.26, 0.06, 0.16, 0, 0.08, 0, { seg: 8 }));
      F.add(flameMat, cyl(0.21, 0.03, 0.5, 0.02, 0.34, -0.01, { seg: 7 }));
      F.add(flameMat, cyl(0.13, 0.02, 0.32, -0.09, 0.26, 0.06, { seg: 6 }));
      F.add(coreMat, cyl(0.1, 0.02, 0.22, 0.01, 0.2, 0, { seg: 6 }));
      F.flush(fire, { cast: false, receive: false });
      fire.position.set(BX, by + 0.84, BZ);
      fire.scale.setScalar(0.6);
      fire.userData.airborne = true;
      ctx.add(fire, 'brazier-fire');

      const pool = lightPool({ r: 2.6, ember: true, opacity: 0.42 });
      pool.position.set(BX, by + 0.03, BZ);
      pool.scale.setScalar(0.7);
      ctx.add(pool, 'brazier-pool');

      let t = 0;
      let flare = 0;
      ctx.update((dt) => {
        t += dt;
        flare = Math.max(0, flare - dt * 0.3);
        const breathe = 1 + Math.sin(t * 2.3) * 0.05 + Math.sin(t * 5.7) * 0.03;
        const k = (0.6 + flare * 1.0) * breathe;
        fire.scale.set(k * 0.92, k, k * 0.92);
        pool.scale.setScalar((0.7 + flare * 0.6) * (1 + Math.sin(t * 1.9) * 0.03));
      });
      ctx.reset(() => { flare = 0; });
      interactive(ctx, {
        name: 'the gate brazier', label: 'Stir the gate brazier',
        at: [BX, by + 1.0, BZ], size: [1.2, 2.0, 1.2],
        action: () => { flare = 1; },
      });
    }

    /* ================================================================ *
     * 6. SIGNAGE AND PRACTICALS.  No people anywhere — the wardens'
     *    charge is a portcullis, the muster bill calls hands to the
     *    gates, and the bell drawn on it is a bell.
     * ================================================================ */
    {
      const faceX = -9.0;   // the lodge's +x elevation, after its yaw
      const board = signKit.fasciaBoard({
        tenant: 'wardensHollowbrook', w: 3.4, h: 0.68, seed: 'wardens-fascia', corbels: true,
      });
      board.position.set(faceX + 0.02, G(faceX, 25.2) + 2.74, 25.2);
      board.rotation.y = Math.PI / 2;
      board.userData.airborne = true;
      ctx.add(board, 'wardens-fascia');

      const note = signKit.wallNotice({ notice: 'rota', w: 0.62, h: 0.82, seed: 'wardens-rota' });
      note.position.set(faceX + 0.02, G(faceX, 27.4) + 1.62, 27.4);
      note.rotation.y = Math.PI / 2;
      note.userData.airborne = true;
      ctx.add(note, 'wardens-rota');

      const stand = signKit.noticeBoardStand({
        notices: ['muster', 'gatetoll'], w: 1.35, h: 0.92, postH: 1.1, seed: 'gate-notices',
        accent: JOINERY.oakStain,
      });
      put(stand, -7.2, 28.4, 'gate-notices', { ry: Math.PI / 2, box: boxAt(-7.2, 28.4, 0.24, 0.78) });
    }
    // the square's two lamps, lit — one each side of the lane, well off it
    for (const [tag, x, z] of [['w', -4.9, 31.4], ['e', 4.9, 36.8]]) {
      put(postLantern({ seed: `square-lamp-${tag}`, h: 2.8, lit: true, arm: true }), x, z, `square-lamp-${tag}`,
        { box: boxAt(x, z, 0.22, 0.22) });
    }
    /* a lamp at the stage's foot.  It was a `lantern` SET DOWN ON the
     * breastwork, and a spear rack was stood on the deck; the spatial
     * audit reads a prop on a platform as two units sharing a bbox and
     * fails both for OVERLAP.  Anything that belongs ON the stage is
     * built into the stage's own group instead — see `buildStage`. */
    put(postLantern({ seed: 'stage-lamp', h: 2.6, lit: true, arm: true }), -13.9, 39.4, 'stage-lamp',
      { box: boxAt(-13.9, 39.4, 0.22, 0.22) });

    /* the stable's paddock rail, closing its yard's south end without
     * closing the lane: it stops 8 m short of the lane's east edge. */
    fenceRun({
      points: [[16.0, 18.6], [16.0, 30.4], [11.2, 30.4]],
      kind: 'post-rail', h: 1.15, seed: 'stable-rail', groundAt: ctx.groundAt, ctx,
    });

    buildGroundWear(ctx);

    /* ================================================================ *
     * 7. THE SURROUNDS — the siege road, the berm, and the Company's
     *    camp.  These are OUTSIDE the envelope (plan.surrounds.owner is
     *    southgate and no envelope covers them), so composeCity warns
     *    OUTSIDE-ENVELOPE for every one.  Decided, not missed.
     *
     *    NOTHING IN THE SPAWN RING CARRIES A COLLIDER.  The ring is
     *    (0, 60) r 3..8 and `check-nav` asserts it is open ground: a prop
     *    that seals it is a wave that never arrives.  The approach line
     *    (0, 58) -> (0, 50) -> (0, 40) is left clear the whole way, and
     *    so is the road it runs on.
     * ================================================================ */
    {
      const r = rng('siege-road');
      const g = new THREE.Group();
      const P = parts();
      /* the kerb stones are `rubble` and `graniteDark`, and small.  In
       * `granite` at 0.6 m they read from the arch as a scatter of pale
       * pebbles strewn across the road rather than as its edge — the
       * palest stone in the town on the darkest ground in it. */
      for (let z = 52.6; z < 66; z += 0.72) {
        for (const sx of [-1, 1]) {
          const x = roadAt(z) + sx * (2.9 + Math.sin(z * 0.21) * 0.4);
          P.add(r.chance(0.45) ? M.graniteDark : M.rubble,
            bx(r.range(0.26, 0.44), r.range(0.11, 0.19), r.range(0.5, 0.78), x, G(x, z) + 0.05, z, { ry: r.range(-0.3, 0.3) }));
        }
        const x = roadAt(z);
        P.add(M.gravel, bx(4.6, 0.02, 1.35, x, G(x, z) + 0.012, z, { ry: Math.sin(z * 0.3) * 0.03 }));
      }
      /* the ditch's counterscarp: the spoil they threw out of it, along
       * the foot of the curtain, stopping either side of the road */
      for (let x = -17; x <= 17; x += 1.5) {
        if (Math.abs(x) < 4.6) continue;
        const z = 54.3 + Math.sin(x * 0.4) * 0.35;
        P.add(r.chance(0.5) ? M.earth : M.turf,
          bx(1.6, r.range(0.4, 0.66), r.range(1.5, 2.2), x, G(x, z) + 0.2, z,
            { ry: r.range(-0.2, 0.2), rz: r.range(-0.1, 0.1) }));
      }
      P.flush(g, { cast: false });
      g.name = 'siege-road';
      ctx.add(g, 'siege-road');
    }

    /* stakes driven in the berm, angled at whoever is coming — every one
     * leaning the SAME way, because alternating them builds a row of X's
     * and reads as a hurdle rather than as a defence */
    {
      const r = rng('berm-stakes');
      const g = new THREE.Group();
      const P = parts();
      for (let i = 0; i < 26; i += 1) {
        const x = r.range(-16.5, 16.5);
        const z = 53.5 + r.range(-0.5, 0.9);
        const L = r.range(1.3, 1.7);
        if (Math.abs(x) < 4.4) continue;
        P.add(M.oakDark, cyl(0.055, 0.085, L, x, G(x, z) + L / 2 - 0.08, z, { seg: 6, rx: -r.range(0.34, 0.46) }));
      }
      P.flush(g);
      g.name = 'berm-stakes';
      ctx.add(g, 'berm-stakes');
    }

    /* -- the Company's camp at the spawn ring.  Their rust is the ONE
     *    place in the world that colour is allowed, and it is the enemy's. */
    /* THE CAMP IS SPACED BY THE AUDIT'S OWN RULE, not by eye.  A tent is
     * 2.9 x 3.7 (half-diagonal 2.4), a camp fire with its spit is about
     * 1.1, a ladder 0.9 and a hedgerow canopy 3.0 — and the OVERLAP test
     * fails any pair sharing more than 15 % of the smaller one's box.  The
     * first camp had all of it inside the treeline: nineteen failures, and
     * a frame that looked like a camp under trees. */
    for (const [tag, x, z, lit] of [
      ['a', -4.0, 58.2, true], ['b', 6.6, 62.2, true], ['c', -0.4, 61.0, false],
    ]) {
      put(campFire({ seed: `company-fire-${tag}`, r: 0.85, lit, ctx, spit: tag !== 'c' }), x, z, `company-fire-${tag}`);
    }
    for (const [tag, x, z, ry] of [
      ['a', -8.0, 59.0, Math.PI / 2], ['b', 8.0, 58.6, -Math.PI / 2],
      ['c', 2.8, 63.8, Math.PI], ['d', -3.2, 63.8, 0],
    ]) {
      put(tent({ seed: `company-tent-${tag}`, w: 2.9, d: 3.7, h: 1.8, company: true, open: true }),
        x, z, `company-tent-${tag}`, { ry });
    }
    {
      const b = bannerPole({
        seed: 'company-banner', h: 4.6, bw: 0.8, bh: 2.3, folds: 4,
        field: ACCENT.companyRust, band: JOINERY.pitch, base: 'stone',
      });
      put(b, 3.6, 57.4, 'company-banner');
    }
    /* their gear, dumped where the road ends and the dark begins */
    for (const [tag, x, z, ry] of [['a', -10.8, 56.4, 0.7], ['b', 10.8, 56.2, -1.2]]) {
      put(siegeProps.siegeLadder({ seed: `company-ladder-${tag}`, len: 6.2 }), x, z, `company-ladder-${tag}`, { ry });
    }
    /* the oil pots stand OFF the road, not across it.  At x -2.0 the four
     * of them read from under the arch as a row of pale bollards planted
     * in the middle of the approach the wave has to run. */
    put(siegeProps.oilPots({ seed: 'company-pots', n: 4 }), -5.6, 56.2, 'company-pots');

    /* -- the treeline that closes the road's +z view.  It stops at z = 66
     *    because that is where `groundAt` stops describing the ground (see
     *    the header), and it opens for the road, so the dark the Company
     *    came out of is still a way through.
     *
     *    ONE `tree` PER TREE, never one `treeStand` with twelve spots.  A
     *    stand's tagged box spans EVERY spot it was given, so a 55 m
     *    treeline is a 55 x 4 m unit: the audit read it as a linear RUN,
     *    swept stations along it, found bare moor between the trunks and
     *    reported BURIED-RUN at 9.48 m — and then flagged OVERLAP against
     *    every tent, ladder and camp fire standing inside the box.
     *    Nineteen failures from one call.  The kit says so in its own
     *    errata and `tree()` exists for exactly this.
     *
     *    Every spot is clear of the spawn ring: at z 65 the ring reaches
     *    |x| 6.2 and at z 62 it reaches 7.8, so nothing here is nearer the
     *    road than 8.6.  The gap the road runs out through is 17 m and not
     *    25: at 25 the view out of the arch ended in open sky. */
    for (const [x, z, sc] of [
      [-28.0, 63.4, 1.15], [-21.5, 64.8, 1.0], [-15.0, 63.2, 1.25], [-9.0, 65.6, 0.9],
      [9.0, 65.6, 0.9], [15.0, 63.2, 1.2], [21.5, 64.8, 1.0], [28.0, 63.4, 1.15],
    ]) {
      ctx.add(tree({
        seed: `far-tree-${x}-${z}`, kind: 'hedgerow', at: [x, z, sc],
        groundAt: ctx.groundAt, density: 0.6, scale: 1.15,
      }), `far-tree-${Math.round(x)}-${Math.round(z)}`);
    }
  },
});
