import * as THREE from 'three';
import { defineDistrict } from '../core/district.js';
import { registerInterior, makeDoorLeaf } from '../core/interior.js';
import { hollowShell } from '../builders.js';
import {
  interiorMats, table, stool, benchSeat, shelf, hearth, hangingLamp,
  barrel as innerBarrel, crateStack as innerCrates, glowCard,
} from '../interiors.js';
import {
  M, painted, PAL, ACCENT, JOINERY,
  place, rng, seatOnGround, parts, bx, cyl, tubeGeo, tagProp,
  cottage, roundTower, gableRoof,
  stairs, stairRail, wallRun, bench, leanTo,
  treeStand, hedgeRun,
  curtainWall, stairTurret, beaconCage, wallTorch, lantern,
  siegeProps, placeCover,
  interactive, wellHead, cart, barrel, barrelStack, crateStack, logPile,
  ladder, shrineStone, bannerPole, torch, brazier, waymarker, trough, fenceRun,
  signKit,
} from '../kit/index.js';

/* ==================================================================== *
 * KEEP HILL — the keep on its mound, the last stand, and the bell.
 *
 * THE LANDFORM IS NOT MINE.  core/terrain.js laid every height here; this
 * module dresses it.  Everything below was measured off `ctx.groundAt`
 * with `?only=keephill` BEFORE a coordinate was written (scratch probe,
 * 0.05 m scans; cell_m 1.6 but the shelf rects land exactly):
 *
 *   outer ground        0.00   over the whole envelope except the shelves
 *   LOWER WARD          2.60   x -14.00..16.00, z -48.75..-22.00
 *   KEEP PLATFORM       5.20   x  -5.95..14.00, z -44.00..-28.00
 *   NORTH WALL-WALK     5.00   x -18..51.15,    z -51.15..-48.75
 *   EAST WALL-WALK      5.00   x  48.85..51.25, z -51.15..-18
 *   stair-head landing  5.00   x  40.25..43.05, z -48.75..-45.75
 *   keep-climb-1        x -1.55..1.65, tread tops (0, 0.20, -19.5) ->
 *                       (0, 2.60, -24.7)   13 treads, rise 0.20, going 0.40
 *   keep-climb-2        x  2.65..5.40, tread tops (4, 2.80, -27.4) ->
 *                       (4, 5.20, -32.6)   13 treads — a CUTTING driven
 *                       through the platform's south lobe, walled 2.4 m
 *                       on both sides, landing 2.7 m in front of the door
 *   keep-wall-stair     z -48.05..-46.45, ramping x 30.6 -> 40.25, 0 -> 5.00
 *
 * FIVE THINGS THE MEASUREMENTS FORCED, each of which changed the design
 * ------------------------------------------------------------------
 * 1. THERE ARE NO WALKABLE MOUND SKIRTS.  The brief has the raiders coming
 *    up the mound's flanks at x -18..-14 and 16..21, z -22..-18 on a
 *    1-in-6 turf bank.  Measured, that whole band is 0.00: the mound
 *    (2,-34) r 19x17 h 3.0 is masked to zero 0.6 m from every shelf and
 *    every crossing, and what survives it is 0.05..0.30 m at x 18 and a
 *    0.4 m swell at z -20.  So the ward's cliff is a hard 2.6 m step on
 *    all four sides and THE WARD HAS EXACTLY ONE APPROACH: climb 1.  That
 *    is stated here rather than quietly built around, because the arena's
 *    "three approaches" is a promise the terrain does not keep.  What it
 *    buys instead is the best chokepoint in the town — the ward gate at
 *    the head of a 3.2 m stair — and it is why the ward gate is a real
 *    gate with real piers rather than a sign.
 * 2. THE KEEP'S SECOND APPROACH IS THE EAST ALLURE, and it exists because
 *    of the arena's landmark gate.  The plan's arena rect centre is
 *    (15, -33.5), which lands on the 2 m ledge between the keep's east
 *    cliff and the ward's — 1 m BELOW the platform and 1 m from its lip.
 *    From an eye at 4.22 there the bell tower reads (ray clear) and the
 *    Warden's Hall CANNOT: measured, the ray to the hall's box centre is
 *    blocked by `terrain:paving` at (14.02, 4.53, -33.83) 1.08 m from the
 *    lens, and it stays blocked for any hall whose box centre is under
 *    14 m — i.e. a hall with a 23 m ridge.  An eye at 5.00 clears it.  So
 *    the ledge carries the keep's east curtain with a WALKABLE ALLURE at
 *    4.85, a mural stair up from the ward, and a step of 0.35 m onto the
 *    platform at its north end.  The brief says the ward->walk stair is
 *    "the one piece of walkable structure you add"; there are two, this is
 *    the second, and the sentence above is the measurement that forced it.
 *    It pays for itself three times over: it is the hexer perch the brief
 *    asks for at "the ward's east edge", it is the keep's promised second
 *    approach (the one the missing skirts took away), and it is the way
 *    DOWN off the platform that is not the way up.
 * 3. THE WARDEN'S HALL IS 9.6 x 6.4, NOT 9 x 6.4, and that is the interior
 *    camera's arithmetic.  `wardens-hall-interior` stands at (3.2, 6.75,
 *    -36.2).  At w 9.0 the room's east lining is at x 3.185 and the camera
 *    is 15 mm INSIDE it; at w 7.0 (which would put the plan's waypoint
 *    (4,-38) out on the platform where its name suggests) it is worse.
 *    At 9.6 the lining is at 4.485, the camera has 1.29 m of air, and the
 *    waypoint (4,-38) stands 0.18 m clear of the east wall's inflated
 *    collider — inside the hall, which is where the plan put it.
 * 4. EVERY REVETMENT STANDS ON THE LOW GROUND BESIDE ITS SCARP, and the
 *    sign of "low" is not the same on the two sides of the keep.  The
 *    platform's south cliff faces +z, so its wall goes at z -27.75 (the
 *    WARD, 2.60) and not at -28.28 (which is the platform itself, 5.20).
 *    The first cut had it the wrong way round on the south and on the
 *    ward's south face as well, and a wall standing on the terrace it
 *    retains is a parapet with a bare earth scarp under it.
 * 5. THE WARD->WALK STAIR HAS 8 TREADS AT 0.30, NOT 12 AT 0.20.  The north
 *    apron is 4.72 m deep (z -48.75..-44.03) and the keep's north
 *    revetment eats 0.67 of it once the player's radius is on its
 *    collider: 4.05 m of run, against 4.54 for a 0.24 m rise.  0.30 is
 *    under the walker's own 0.38 m step, the flight runs 3.56 m, and its
 *    head laps 0.21 m onto the walk shelf.
 *
 * THE SIGHT CORRIDORS, verbatim, and what is on them:
 *   `gate-sees-keep`   (0,46)->(0,-26), half 3, clear above 8.5.  Mine
 *     inside it: the ward's south revetment (top 3.10), its two flanking
 *     piers (3.28) and the ward gate (lintel 3.55, finials 4.05).  The
 *     corridor's rays END at z -26, so the keep platform and everything on
 *     it is free — which is the point: the tube is aimed AT the tower.
 *   `keep-sees-eastgate` (12,-30)->(46,20), half 3, clear above 7.5.  The
 *     line leaves my parcel at about (17,-22.7) and the only thing of mine
 *     near it is the ward's south-east pier (3.28) and the east curtain's
 *     parapet (6.00).  The almoner's house is nowhere near it — at x 34
 *     the line is at z +2.35, not -30 — but it is kept under 7.5 anyway.
 *
 * THE VISTA I OWN, `from-the-keep` (2, 7.0, -33) -> (0, 6, 50), fov 54.
 *   The camera stands on the platform 1.8 m up; the foreground is my south
 *   parapet (top 6.20, 5.25 m ahead, the bottom third of the frame) and
 *   the ward below it; the whole town lies between.  Its subject is
 *   southgate's gatehouse, so `check-cameras` cannot pass this camera
 *   until southgate builds — that failure is a handoff, not a defect here.
 *
 * ACCENT: `ACCENT.gilt`, and it wears TWO things — the bell in the belfry
 * and the beacon's fire.  Nothing else on this hill is saturated: it is
 * granite, oak, slate, iron and yew.  No `companyRust` anywhere.
 *
 * TEN MINUTES AGO: the beacon was being laid (the faggots are stacked at
 * its foot, the ladder is still against the wall, the pitch pots are open
 * and the barrow is where it was tipped) and the bell rope was untied (the
 * tail is off its cleat and coiled on the flags).  The muster is half
 * done: mantlets carried up and not yet set, spears racked, the cart on
 * its side where the wheel went.
 *
 * TRAPS HIT, in the order they were found, and by WHICH TOOL — which is
 * the reusable half:
 *  - the revetment's sign, see (4) above.  A wall standing on the terrace
 *    it retains is a parapet with a bare scarp under it.  (A plan, before
 *    anything was built.)
 *  - `stairTurret` derives its walk side by testing `|landing.z0| ==
 *    plan.siege.wall_inner` to 1e-6, so it must be handed the PLAN's
 *    landing rect (z0 -48.8) and never the measured one (-48.75): the
 *    measurement throws "touches no wall-walk plane".  (A throw.)
 *  - a `wallRun` pier is 0.66 m across and the player's radius is added to
 *    every side, so the two piers flanking climb 1 had to move out to
 *    x -2.6 / 2.7 or the 3.2 m stair head is a gate with 0.02 m of pier
 *    standing in it.  (Arithmetic.)
 *  - the almoner's house sat across the `keep-lane-e` corridor and closed
 *    it to 0 m, AND closed the view out of that socket at 2.28 m on its
 *    own gable.  (check-city's seam gate and its terminus sweep, the same
 *    building twice.)
 *  - `floorRise: 0` puts a shell's floor slab COPLANAR with the terrain
 *    shelf and the first interior frame came back z-fighting in bands
 *    across the whole room.  45 mm is the largest gap the anchor at
 *    (4,-36) allows, and it is enough.  (One frame.)
 *  - the hall's chimney stack at 0.20 m outboard has its inner face 60 mm
 *    INSIDE the room's lining, where it rendered as a cold rectangle
 *    standing over the hearth to the ceiling.  0.45.  (One frame.)
 *  - `roundTower`'s buttresses are placed by BEARING and one of them stood
 *    on the allure: 1.5 m of masonry leaving 0.22 m of walkable ground
 *    against the parapet, which sealed the allure's north half.  EVERY
 *    GATE PASSED, because no waypoint stands up there.  (One frame.)
 *  - a voussoir ring written on an ELLIPSE (sin for x, a different scale
 *    for y) with 0.42 m stones at 0.52 m centres is not an arch: nothing
 *    touches and it reads as rubble floating over the lintel.  Solve the
 *    circle.  And do not alternate the stones' tone — a stripe at 0.42 m
 *    centres is the curtain wall's own checkerboard at a smaller grid.
 *    (Two frames, one for each half.)
 *  - `leanTo` is a TAGGED PROP whose bounding box is its whole volume, so
 *    anything standing inside the shelter overlaps it by 99-100 %.  The
 *    armoury's stock stands beside it.  (check-spatial.)
 *  - `fenceRun` is ONE tagged unit and its box is the box of the whole
 *    polyline: an L 14 m by 10 m read as 100 % overlapping a votive stone
 *    eight metres from the nearest post.  Two straight runs.  (Same.)
 *  - a `stairRail` on a 0.30 m rise wants its joints on the treads' MEAN
 *    rather than on the flight's foot ground, and it must stop 0.15 m
 *    short of the wall-walk: `curtainWall` lays a 0.34 m kerb along that
 *    edge and a station on it is judged against 5.34.  (Same, four times.)
 *  - and the one that cost the most: A CLEAR RAY TO A CAMERA'S SUBJECT
 *    SAYS NOTHING ABOUT WHAT ELSE IS IN SHOT.  `from-the-keep` passed its
 *    gate with an eight-point spear rack 2.8 m from the lens filling the
 *    right third of the district's one contracted frame.  (One frame, and
 *    nothing else could ever have found it.)
 * ==================================================================== */

const E = { x0: -18, z0: -54, x1: 54, z1: -18 };

/* ---- the measured landform ---- */
const Y_OUT = 0.0;
const Y_WARD = 2.6;
const Y_KEEP = 5.2;
const Y_WALK = 5.0;
const Y_ALLURE = 4.85;

const WARD = { x0: -14.0, x1: 16.0, z0: -48.75, z1: -22.0 };
const KEEP = { x0: -5.95, x1: 14.0, z0: -44.0, z1: -28.0 };

/* climbs, as tread-top joints — never as landing heights */
const C1 = { x: 0.05, w: 3.2, y0: 0.20, z0: -19.5, y1: 2.60, z1: -24.7 };
const C2 = { x: 4.02, w: 2.75, y0: 2.80, z0: -27.4, y1: 5.20, z1: -32.6 };

/* the hall, the tower, the beacon, the rope */
/* `floorRise: 0.045` IS THE WHOLE TOLERANCE AND NOT A ROUND NUMBER.  The
 * plan's anchor (4,-36) promises `groundAt` 5.20 +-0.05 and it falls
 * INSIDE this room, so the obvious 0.10 m floor answers 5.30 and
 * `composeCity` throws the district out at the anchor assert — which is
 * how this started at 0.  At exactly 0 the floor slab's top face is
 * COPLANAR with the terrain shelf under it and the first interior frame
 * came back with the whole floor z-fighting in bands.  Two coplanar sheets
 * are a coin toss; 45 mm is the largest gap the anchor allows. */
const HALL = { x: 0, z: -38.5, w: 9.6, d: 6.4, h: 4.4, wallT: 0.28, floorRise: 0.045 };
const TOWER = { x: 11.4, z: -40.0, r: 2.2, h: 14.0 };
const BEACON = { x: -3.0, z: -42.6 };
const ROPE = { x: 9.0, z: -40.8 };

/* the east allure (see note 2) and its mural stair */
const AL = { x0: 14.0, x1: 15.70, z0: -43.60, z1: -33.15, face: 16.0 };
const MURAL = { x: 14.78, w: 1.5, z0: -28.6, steps: 12, rise: 0.1875, going: 0.42 };

/* ==================================================================== *
 * LOCAL ASSEMBLIES.  Not building generators — the kit owns those.  A
 * revetment with a walkable top, the facing of a stair cutting, a gate
 * between two piers, a headstone field and a ground-wear scatter, all
 * pooled by material and all left UNTAGGED except where a prop unit is
 * genuinely wanted: the spatial audit's unit list is the tagged props, and
 * a 10 m field tagged as one unit flags OVERLAP against everything
 * standing in it.
 * ==================================================================== */

/**
 * THE KEEP'S EAST CURTAIN — the one piece here that is not a kit call, and
 * the reason is that no generator in the kit makes a wall whose TOP IS THE
 * FLOOR.  It rises from the outer ground (0.00) in four battered bands to
 * an allure at 4.85, is 1.7 m thick behind its face, carries a crenellated
 * parapet on its outer edge and takes a mural stair up from the ward.
 *
 * Colliders: the mass with `top` (solid from the ward and from the close,
 * WALKED OVER on the allure) and the parapet with `bottom` (a fence up
 * there, and not a second wall in front of the first seen from below).
 */
function eastCurtain(ctx, R) {
  const g = new THREE.Group();
  const P = parts();
  const { x0, x1, z0, z1, face } = AL;
  const mid = (z0 + z1) / 2;
  const len = z1 - z0;

  /* the battered outer face, in bands, each one thinner than the last —
   * a vertical slab reads as a fence, a batter reads as mass */
  const bands = [
    [0.00, 1.30, 0.50], [1.30, 2.60, 0.42], [2.60, 3.90, 0.34], [3.90, Y_ALLURE, 0.28],
  ];
  P.add(M.curtainDark, bx(0.94, 0.60, len + 0.5, face - 0.02, 0.28, mid, { seg: 6 }));   // plinth
  for (const [i, [a, b, t]] of bands.entries()) {
    const mat = i === 1 ? M.graniteWarm : M.curtain;
    P.add(mat, bx(t * 2, b - a + 0.01, len + 0.4, face - 0.02, (a + b) / 2, mid, { seg: 6 }));
  }
  // a string course two bands up: what gives a tall face its scale
  P.add(M.coping, bx(0.80, 0.17, len + 0.44, face - 0.02, 2.62, mid, { seg: 6 }));
  // corbels under the parapet
  for (let z = z0 + 0.9; z < z1 - 0.6; z += 1.55) {
    P.add(M.coping, bx(0.62, 0.20, 0.34, face + 0.06, 4.62, z));
  }

  /* the core: from the ward ledge (2.60) up to the allure.  Below 2.60 the
   * outer face's first two bands are already retaining the ward's own east
   * cliff, so nothing is needed there. */
  P.add(M.curtain, bx(x1 - x0 + 0.3, Y_ALLURE - Y_WARD, len, (x0 + x1) / 2 - 0.15, (Y_WARD + Y_ALLURE) / 2, mid, { seg: 6 }));
  P.add(M.paving, bx(x1 - x0 + 0.34, 0.08, len, (x0 + x1) / 2 - 0.16, Y_ALLURE - 0.04, mid, { seg: 6 }));
  // the inner edge, a 0.2 m kerb the eye reads as the wall's own thickness
  P.add(M.coping, bx(0.22, 0.18, len, x0 + 0.06, Y_ALLURE + 0.05, mid, { seg: 6 }));

  /* the parapet: a solid breast, then merlons with real embrasures.  The
   * crenels are 0.54 and the merlons 0.86, which is `SIEGE`'s own
   * proportion — the allure has to read as the same masons' work as the
   * town wall it looks across at. */
  const PX = face - 0.30;
  P.add(M.curtain, bx(0.58, 0.60, len, PX, Y_ALLURE + 0.30, mid, { seg: 6 }));
  P.add(M.coping, bx(0.70, 0.10, len, PX, Y_ALLURE + 0.65, mid, { seg: 6 }));   // the crenel sills
  let z = z0 + 0.1;
  while (z < z1 - 0.4) {
    const w = Math.min(0.86, z1 - 0.1 - z);
    P.add(R.chance(0.3) ? M.graniteWarm : M.curtain, bx(0.58, 0.50, w, PX, Y_ALLURE + 0.95, z + w / 2));
    P.add(M.coping, bx(0.70, 0.10, w + 0.08, PX, Y_ALLURE + 1.25, z + w / 2));
    z += w + 0.54;
  }

  /* THE MURAL STAIR'S RAKING PARAPET.  South of the allure the ledge is
   * open and the flight climbs it, so the wall beside it steps DOWN with
   * the treads rather than running level: a level parapet beside a
   * climbing stair stands a metre proud at the foot and under the handrail
   * at the head, which is a shape nothing has. */
  for (let i = 0; i < 6; i += 1) {
    const za = MURAL.z0 - 0.1 - i * 0.82;
    const top = Y_WARD + 1.05 + (Y_ALLURE + 1.25 - Y_WARD - 1.05) * ((i + 1) / 6);
    P.add(M.curtain, bx(0.62, top, 0.86, face - 0.30, top / 2, za - 0.43, { seg: 5 }));
    P.add(M.coping, bx(0.74, 0.10, 0.9, face - 0.30, top + 0.05, za - 0.43));
  }

  P.flush(g);
  g.name = 'east-curtain';

  /* one collider for the mass, WALKED OVER at 4.85; one for the parapet,
   * which is a fence up there and nothing at all from the ward below */
  ctx.collide(x0, z0 - 0.25, face + 0.5, z1 + 0.25, Y_ALLURE);
  ctx.collide(PX - 0.31, z0 - 0.25, face + 0.5, z1 + 0.25, undefined, Y_ALLURE);
  // the raking parapet beside the flight is solid top to bottom
  ctx.collide(face - 0.61, MURAL.z0 - 5.1, face + 0.5, MURAL.z0 - 0.05);
  ctx.platform(x0 - 0.15, z0 - 0.05, x1 + 0.05, z1 + 0.05, Y_ALLURE);
  return g;
}

/**
 * THE FACING OF CLIMB 2'S CUTTING.  The flight is driven through the
 * platform's south lobe, so it climbs between two 2.4 m earth scarps that
 * nothing else in this pipeline dresses — and they are the two surfaces
 * you look at for the whole of the most important stair in the game.
 * Stepped coursing with a coping at the platform's own level, seated on
 * the TREAD TOPS rather than on a remembered floor.
 */
function cuttingFace(ctx) {
  const g = new THREE.Group();
  const P = parts();
  const T = 0.14;
  const steps = 7;
  for (let i = 0; i < steps; i += 1) {
    const za = C2.z0 - (i * (C2.z0 - C2.z1)) / steps;
    const zb = C2.z0 - ((i + 1) * (C2.z0 - C2.z1)) / steps;
    const floor = C2.y0 + (C2.y1 - C2.y0) * ((i + 0.5) / steps);
    for (const s of [-1, 1]) {
      const x = s < 0 ? 2.65 + T / 2 : 5.40 - T / 2;
      P.add(i % 2 ? M.curtain : M.graniteWarm, bx(T, Y_KEEP - floor, zb - za, x, (floor + Y_KEEP) / 2, (za + zb) / 2));
      P.add(M.coping, bx(0.46, 0.12, zb - za + 0.02, x + s * 0.16, Y_KEEP + 0.06, (za + zb) / 2));
    }
  }
  P.flush(g);
  return g;
}

/**
 * THE WARD GATE at the head of climb 1 — the district's chokepoint and the
 * one built thing on the `gate-sees-keep` axis.  Two piers, a timber
 * lintel with a relieving arch over it, both leaves swung back flat
 * against their own piers (they were opened for the muster and nobody has
 * shut them), and a chain slung across at waist height that stops nothing
 * and says everything.  ONLY THE PIERS COLLIDE; the leaves and the chain
 * do not, which leaves 3.96 m of walkable gate over a 3.2 m stair head.
 */
function wardGate(ctx) {
  const g = new THREE.Group();
  const P = parts();
  const z = -25.4;
  const y = Y_WARD;
  const H = 3.7;
  for (const s of [-1, 1]) {
    const x = s * 2.15;
    P.add(M.curtainDark, bx(0.86, 0.34, 0.94, x, y + 0.1, z));
    P.add(M.curtain, bx(0.74, H - 0.3, 0.82, x, y + 0.24 + (H - 0.3) / 2, z, { seg: 4 }));
    P.add(M.coping, bx(0.94, 0.14, 1.02, x, y + H + 0.01, z));
    P.add(M.coping, bx(0.42, 0.5, 0.42, x, y + H + 0.33, z));          // the finial that makes it a pier
    ctx.collide(x - 0.47, z - 0.51, x + 0.47, z + 0.51);
    // the leaf, swung back flat against its own pier
    P.add(painted(JOINERY.oakStain), bx(0.09, 2.3, 1.55, x + s * 0.5, y + 1.2, z - 0.9, { seg: 3 }));
    for (const b of [0.55, 1.75]) P.add(M.ironDark, bx(0.11, 0.1, 1.5, x + s * 0.55, y + b, z - 0.9));
  }
  /* THE LINTEL AND ITS RELIEVING ARCH.  The voussoirs sit on a REAL
   * CIRCLE, derived from the springing, and that is the difference between
   * an arch and a row of blocks with sky between them — which is exactly
   * what the first render showed.  The first cut placed them on an ellipse
   * (sin for x, a different scale for y) with 0.42 m stones at 0.52 m
   * centres, so no two of them touched and the ring read as rubble
   * floating over the lintel.  Solve the circle instead: half-angle A,
   * springing at +-HALF, so R = HALF / sin A, and the stones are the arc
   * length divided by their number. */
  P.add(M.oakDark, bx(4.9, 0.36, 0.5, 0, y + H - 0.05, z, { seg: 4 }));
  {
    const HALF = 2.35;
    const A = 0.62;
    const Rr = HALF / Math.sin(A);
    const cy = y + H + 0.13 - Math.cos(A) * Rr;
    const n = 13;
    const w = (2 * A * Rr) / n + 0.03;            // abutting, plus a joint
    /* ONE TONE, and a paler KEYSTONE.  `i % 2` alternating coping and
     * curtain is a stripe at 0.42 m centres — the same mistake the kit's
     * curtain wall documents at 3 m, and from the town axis the ring came
     * back as a rainbow band rather than as masonry. */
    for (let i = 0; i < n; i += 1) {
      const a = -A + (2 * A * (i + 0.5)) / n;
      const key = i === (n - 1) / 2;
      P.add(key ? M.coping : (i === 2 || i === n - 3 ? M.graniteWarm : M.curtain),
        bx(w, key ? 0.58 : 0.5, 0.46, Math.sin(a) * Rr, cy + Math.cos(a) * Rr, z, { rz: -a }));
    }
  }
  // the chain across: a sign that says "not this way", never a collider
  for (let i = 0; i < 16; i += 1) {
    const t = i / 15;
    const cx = -1.75 + t * 3.5;
    const sag = Math.sin(t * Math.PI) * 0.34;
    P.add(M.ironRust, cyl(0.035, 0.035, 0.26, cx, y + 1.15 - sag, z + 0.5, { seg: 5, rz: Math.PI / 2, ry: i % 2 ? 0.7 : 0 }));
  }
  P.flush(g);
  return g;
}

/** The graveyard's leaning slabs, two chest tombs and the ones that have
 *  gone over.  Every stone seated by query and leaning about its own base. */
function headstones(ctx, seed, rows) {
  const g = new THREE.Group();
  const P = parts();
  const r = rng(seed);
  for (const [x, z, kind] of rows) {
    const y = ctx.groundAt(x, z);
    const lean = r.range(-0.13, 0.13);
    const yaw = r.range(-0.24, 0.24);
    if (kind === 'chest') {
      P.add(M.granite, bx(1.8, 0.58, 0.82, x, y + 0.29, z, { ry: yaw }));
      P.add(M.graniteDark, bx(1.96, 0.11, 0.96, x, y + 0.63, z, { ry: yaw }));
      P.add(M.moss, bx(0.76, 0.02, 0.38, x + 0.18, y + 0.69, z - 0.1, { ry: yaw }));
      continue;
    }
    if (kind === 'fallen') {
      P.add(M.graniteDark, bx(0.58, 0.11, 0.9, x, y + 0.05, z, { ry: yaw }));
      P.add(M.moss, bx(0.36, 0.02, 0.54, x + 0.06, y + 0.11, z - 0.05, { ry: yaw }));
      continue;
    }
    const h = r.range(0.6, 1.02);
    const w = r.range(0.4, 0.6);
    P.add(M.graniteDark, bx(w + 0.18, 0.13, 0.4, x, y + 0.05, z, { ry: yaw }));
    P.add(r.chance(0.4) ? M.granite : M.graniteWarm, bx(w, h, 0.13, x, y + 0.1 + h / 2, z, { ry: yaw, rz: lean }));
    if (r.chance(0.5)) {
      P.add(M.granite, cyl(w / 2, w / 2, 0.13, x - Math.sin(lean) * h, y + 0.1 + h, z, { seg: 9, rx: Math.PI / 2, ry: yaw, rz: lean }));
    } else {
      P.add(M.granite, bx(w * 0.76, w * 0.4, 0.13, x - Math.sin(lean) * h, y + 0.16 + h, z, { ry: yaw, rz: lean + 0.5 }));
    }
    if (r.chance(0.34)) P.add(M.moss, bx(w * 0.7, 0.02, 0.03, x, y + 0.1 + h * 0.2, z + 0.075, { ry: yaw }));
  }
  P.flush(g);
  return g;
}

/** Ground breakup: worn slabs where feet go, moss and tussock where they
 *  do not, spoil where the bank was cut.  Nothing over 0.3 m, seated by
 *  query, every band an explicit rectangle rather than a radius. */
function groundDress(ctx, seed, spots) {
  const g = new THREE.Group();
  const P = parts();
  const r = rng(seed);
  for (const [x, z, kind, lift = 0] of spots) {
    const y = ctx.groundAt(x, z) + lift;
    const yaw = r.range(0, Math.PI);
    if (kind === 'slab') {
      P.add(r.chance(0.5) ? M.paving : M.pavingDark, bx(r.range(0.7, 1.3), 0.07, r.range(0.6, 1.1), x, y + 0.015, z, { ry: yaw }));
    } else if (kind === 'moss') {
      P.add(M.moss, bx(r.range(0.5, 1.1), 0.035, r.range(0.4, 0.9), x, y + 0.008, z, { ry: yaw }));
    } else if (kind === 'gravel') {
      P.add(M.gravel, bx(r.range(0.8, 1.7), 0.05, r.range(0.7, 1.3), x, y + 0.012, z, { ry: yaw }));
    } else if (kind === 'rock') {
      const s = r.range(0.3, 0.62);
      P.add(r.chance(0.5) ? M.rubble : M.graniteDark, bx(s, s * r.range(0.5, 0.8), s * r.range(0.7, 1.1), x, y + s * 0.24, z, { ry: yaw, rz: r.range(-0.2, 0.2) }));
    } else {
      for (let i = 0; i < 5; i += 1) {
        const a = r.range(0, Math.PI * 2);
        const d = r.range(0, 0.22);
        P.add(r.chance(0.5) ? M.turf : M.straw,
          cyl(0.035, 0.005, r.range(0.16, 0.3), x + Math.cos(a) * d, y + 0.11, z + Math.sin(a) * d, { seg: 4, rz: r.range(-0.3, 0.3), ry: a }));
      }
    }
  }
  P.flush(g);
  return g;
}

/** `wallRun` puts a pier at both ends, at every corner and then every
 *  `piers` metres — and a fixed step leaves the last interior pier
 *  wherever the remainder falls, which on a 12.6 m run with `piers: 6` is
 *  two piers 0.6 m apart interpenetrating.  Divide the run's own length. */
function pierEvery(points, target) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    total += Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
  }
  return total / Math.max(1, Math.round(total / target));
}

/** One yew, one stand, one tight bbox — `treeStand`'s box spans every spot
 *  it is given, so six spots in one call is a 20 m box the OVERLAP test
 *  flags against every grave standing inside it. */
function yew(ctx, name, x, z, scale = 1) {
  ctx.add(treeStand({
    seed: `keep-${name}`, kind: 'yew', density: 0.7, scale,
    spots: [[x, z]], groundAt: ctx.groundAt,
  }), name);
}

/* ==================================================================== */

export const keephill = defineDistrict({
  id: 'keephill',
  envelope: E,
  after: ['marketlow'],
  build(ctx, { plan }) {
    const R = rng('keephill');
    const G = (x, z) => ctx.groundAt(x, z);
    const seat = (obj, x, z, yaw = 0) => {
      obj.position.set(x, 0, z);
      obj.rotation.y = yaw;
      seatOnGround(obj, ctx.groundAt);
      return obj;
    };

    /* ================================================================
     * 1. THE WALL.  The north and north-east runs, the corner tower and
     *    the stair turret.  Built first because it is the horizon of
     *    every frame taken on this hill and everything else measures its
     *    own height against it.
     *
     *    `endCaps: 'none'` only where something continues the run: the
     *    chapelclose socket at x -18, the stair turret at x 40.25..43.05,
     *    the corner tower at the angle, and the wardrow socket at z -18.
     * ============================================================== */
    curtainWall({
      from: -18, to: 40.25, side: 'n', ctx, plan, seed: 'keep-curtain-n1',
      endCaps: ['none', 'none'], name: 'curtain-n-west',
    });
    curtainWall({
      from: 43.05, to: 48.85, side: 'n', ctx, plan, seed: 'keep-curtain-n2',
      endCaps: ['none', 'tower'], name: 'curtain-n-east',
    });
    curtainWall({
      from: -48.85, to: -18, side: 'e', ctx, plan, seed: 'keep-curtain-e',
      endCaps: ['tower', 'none'], name: 'curtain-e-north',
    });

    /* THE LANDING RECT IS THE PLAN'S, NOT THE TERRAIN'S.  `stairTurret`
     * finds the edge that abuts the walk by testing `|landing.z0| ==
     * plan.siege.wall_inner` to 1e-6, and the built shelf reads -48.75
     * against a contracted -48.8: handed the measurement it throws
     * "touches no wall-walk plane at +-48.8". */
    const landing = plan.terrain.shelves.find((s) => s.in === 'keephill' && String(s.$comment ?? '').includes('stair-head'));
    const flight = plan.terrain.crossings.find((c) => c.id === 'keep-wall-stair');
    stairTurret({ landing, flight, ctx, plan, seed: 'keep-turret', name: 'wall-stair-turret' });

    /* THE NE CORNER TOWER.  A drum centred ON the corner is a collider
     * across the only place the walk turns; pushed out along the diagonal
     * it touches the outer angle, reads as a tower on the corner from
     * every bearing and leaves 1.40 m of walk behind it. */
    place(ctx, roundTower({
      seed: 'ne-tower', r: 1.9, h: 8.6, taper: 0.1, crook: 0.4, seg: 12,
      wall: 'granite', cap: 'cone', capH: 2.3, bands: 2, machicolation: true,
      windows: [
        { y: 3.4, a: -Math.PI * 0.75, w: 0.22, h: 0.95 },
        { y: 5.6, a: -Math.PI * 0.55, w: 0.22, h: 0.95 },
        { y: 5.6, a: Math.PI * 0.95, w: 0.22, h: 0.95 },
      ],
    }), { x: 52.6, z: -52.6, yaw: 0, name: 'ne-tower' });

    /* ================================================================
     * 2. THE REVETMENTS.  Each run stands on the LOW ground beside the
     *    scarp it faces, so `wallRun`'s own rule (base = min ground -
     *    0.06, top = max ground + h) puts a stone face against the bank
     *    and a coping over the terrace above it.  See note (4).
     * ============================================================== */
    {   // the lower ward: west face + the west half of the south face
      const pts = [[-14.28, -48.4], [-14.28, -21.72], [-2.6, -21.72]];
      ctx.add(wallRun({
        points: pts, h: 3.1, thick: 0.5, piers: pierEvery(pts, 13.0),
        mat: M.curtain, copingMat: M.coping, ctx,
      }), 'ward-revetment-w');
    }
    {   // the east half of the south face, round to the allure's foot
      const pts = [[2.7, -21.72], [16.28, -21.72], [16.28, -28.1]];
      ctx.add(wallRun({
        points: pts, h: 3.1, thick: 0.5, piers: pierEvery(pts, 20.0),
        mat: M.curtain, copingMat: M.coping, ctx,
      }), 'ward-revetment-s');
    }
    ctx.add(wallRun({
      points: [[16.28, -43.7], [16.28, -48.4]], h: 3.1, thick: 0.5,
      mat: M.curtain, copingMat: M.coping, ctx,
    }), 'ward-revetment-ne');

    /* the keep's own curtain: the south face east of climb 2, and one L
     * from the west of climb 2 round to the north-east angle.  Top 6.20,
     * i.e. 1.00 m proud of the platform — a parapet a body can stand
     * behind, not a kerb it can walk off. */
    ctx.add(wallRun({
      points: [[14.05, -27.75], [6.0, -27.75]], h: 3.6, thick: 0.5, piers: 8,
      mat: M.curtain, copingMat: M.coping, ctx,
    }), 'keep-curtain-se');
    {
      const pts = [[2.05, -27.75], [-6.22, -27.75], [-6.22, -44.28], [14.05, -44.28]];
      ctx.add(wallRun({
        points: pts, h: 3.6, thick: 0.5, piers: pierEvery(pts, 15.0),
        mat: M.curtain, copingMat: M.coping, ctx,
      }), 'keep-curtain-wn');
    }

    /* ================================================================
     * 3. THE EAST ALLURE — the keep's east curtain, its walkable top and
     *    the mural stair up from the ward.  See note (2).
     * ============================================================== */
    ctx.add(eastCurtain(ctx, R), 'east-curtain');
    {
      const f = stairs({
        w: MURAL.w, rise: MURAL.rise, run: MURAL.going, steps: MURAL.steps,
        dir: 'z-', at: [MURAL.x, Y_WARD, MURAL.z0], mat: M.granite, ctx,
      });
      ctx.add(f, 'mural-stair');
      /* NO HANDRAIL, and that is the audit's answer rather than a taste.
       * A mural stair climbs BETWEEN two walls — the platform's own cliff
       * on the west and the raking parapet on the east — so there is no
       * open edge to fence.  A rail offset to either side lands on the
       * platform 2.6 m above the treads (BURIED-RUN, worst 2.60 m) or in
       * the parapet's own mass. */
    }

    /* ================================================================
     * 4. THE STAIR FROM THE WARD UP TO THE NORTH WALL-WALK — the piece
     *    `_COMMON.md` asks every district's high ground for: a way
     *    between the two levels the player will hold, 8 m apart.  See
     *    note (5) for why it is 8 treads at 0.30 and not 12 at 0.20.
     * ============================================================== */
    {
      const f = stairs({
        w: 1.8, rise: 0.3, run: 0.44, steps: 8, dir: 'z-',
        at: [-8, Y_WARD, -45.4], mat: M.granite, ctx,
      });
      ctx.add(f, 'walk-stair');
      for (const s of [-1, 1]) {
        /* The joints are the FIRST TREAD'S TOP and the flight's head, not
         * the foot's ground: a 0.30 m rise is a big sawtooth, and a rail
         * hung off the ground line has its stringer 0.54 m under the tread
         * at mid-flight, which is exactly what BURIED-RUN reported.  Half a
         * rise (0.15) lifts the rake line from the tread NOSINGS to the
         * treads' own mean, which is where a stringer actually sits.  And
         * the head joint stops at z -48.6, 0.15 m SHORT of the walk's inner
         * plane: `curtainWall` lays a 0.34 m kerb along that edge, so a
         * station on the walk itself is judged against 5.34 and reports
         * 0.60 m buried on a rail that is perfectly seated. */
        ctx.add(stairRail({
          /* the head joint takes the FLIGHT'S OWN GRADIENT (0.30 / 0.44)
           * over the 3.2 m to that point, not the flight's top height:
           * a rail run to 5.00 at z -48.6 is 0.07 steeper than the
           * treads and floats 0.23 m clear of them at mid-flight. */
          from: [-8, Y_WARD + 0.05, -45.4],
          to: [-8, Y_WARD + 0.05 + (0.30 / 0.44) * 3.2, -48.6],
          side: s * 0.62, h: 0.95, sink: 0.18, mat: M.ironRust,
        }), `walk-stair-rail-${s > 0 ? 'e' : 'w'}`);
      }
    }

    /* ================================================================
     * 5. THE TWO TERRAIN FLIGHTS, dressed.  Rails derived from the
     *    flights' own measured TREAD TOPS: a rail hung off the foot's
     *    ground sits 0.20 m under the first tread all the way up, and the
     *    audit's raked-run sweep reports exactly that.
     * ============================================================== */
    for (const s of [-1, 1]) {
      ctx.add(stairRail({
        from: [C1.x, C1.y0, C1.z0], to: [C1.x, C1.y1, C1.z1],
        side: s * (C1.w / 2 - 0.34), h: 0.95, sink: 0.2, mat: M.ironRust,
      }), `climb1-rail-${s > 0 ? 'e' : 'w'}`);
      ctx.add(stairRail({
        from: [C2.x, C2.y0, C2.z0], to: [C2.x, C2.y1, C2.z1],
        side: s * (C2.w / 2 - 0.30), h: 0.95, sink: 0.2, mat: M.ironRust,
      }), `climb2-rail-${s > 0 ? 'e' : 'w'}`);
    }
    ctx.add(cuttingFace(ctx), 'climb2-cutting');
    ctx.add(wardGate(ctx), 'ward-gate');

    /* ================================================================
     * 6. THE WARDEN'S HALL — the enterable, the Reeve's final shelter and
     *    objective 4's destination.  Axis-aligned, like every shell: the
     *    collider gap at the door has to be exact and a rotated AABB is
     *    not.  See note (3) for the width.
     * ============================================================== */
    const shell = hollowShell({
      w: HALL.w, d: HALL.d, h: HALL.h, at: [HALL.x, HALL.z], groundY: Y_KEEP,
      wallT: HALL.wallT, floorRise: HALL.floorRise, ceilH: 3.2, ceilT: 0.12,
      door: { face: 'z+', offset: 2.0, width: 1.6, height: 2.15 },
      windows: [
        { face: 'z+', offset: -2.6, width: 1.0, height: 1.1, sill: 1.15 },
        { face: 'x-', offset: -1.5, width: 0.9, height: 1.1, sill: 1.15 },
        { face: 'x-', offset: 1.5, width: 0.9, height: 1.1, sill: 1.15 },
        { face: 'x+', offset: 0.0, width: 0.9, height: 1.1, sill: 1.15 },
        /* the NORTH elevation is the one the beacon stands in front of, and
         * a 9.6 m blank granite wall behind a lit practical is the whole
         * left half of that frame */
        { face: 'z-', offset: -1.9, width: 0.9, height: 1.1, sill: 1.15 },
        { face: 'z-', offset: 2.4, width: 0.9, height: 1.1, sill: 1.15 },
      ],
      mats: { wall: M.granite, inner: M.plaster, floor: M.oakDark, ceiling: M.oak },
      ctx, name: 'wardens-hall',
    });
    /* THE GROUP NAMED `wardens-hall` CARRIES THE ROOF AND THE STACK, and
     * that is a landmark contract rather than a tidiness preference.  The
     * plan requires the hall to read from marketlow, and the city gate
     * casts at the named group's BOUNDING-BOX CENTRE: with the shell alone
     * that centre is 7.37 m and the ray from the market well passes the
     * keep's own south parapet at 5.37 against a coping at 6.20 — blocked
     * by my own wall, from two of marketlow's five sample points.  With
     * the roof and the chimney in the box the centre is 9.1 m, the ray
     * crosses the parapet at 6.64 and the hall reads.  It is also simply
     * true: what you see of this building from the market is its roof. */
    const hallGroup = new THREE.Group();
    hallGroup.add(shell.group);
    {
      const roof = gableRoof({
        w: HALL.w + 0.7, d: HALL.d + 0.7, pitch: 0.62, overhang: 0.36,
        thickness: 0.14, ridgeAxis: 'x', mat: M.slate, ridgeMat: M.lead, trimMat: M.oakDark,
      });
      roof.position.set(HALL.x, shell.wallTopY, HALL.z);
      roof.userData.airborne = true;
      hallGroup.add(roof);

      /* the stack over the hearth, on the WEST gable — the hearth inside
       * stands against that wall, so the chimney has to be over it */
      const P = parts();
      const cTop = shell.wallTopY + (roof.userData.ridgeY ?? 2.6) + 0.9;
      /* 0.45 m OUTBOARD, not 0.20.  At 0.20 the stack's east face lands at
       * x -4.425 against a room lining at -4.485: 60 mm INSIDE the room,
       * where it rendered as a cold rectangle standing over the hearth to
       * the ceiling.  You cannot carve a recess into a box and you cannot
       * hide a mass inside one either. */
      const cx = HALL.x - HALL.w / 2 - 0.45;
      P.add(M.granite, bx(1.15, cTop - Y_KEEP, 1.0, cx, (cTop + Y_KEEP) / 2, HALL.z - 1.8, { seg: 6 }));
      P.add(M.coping, bx(1.35, 0.16, 1.2, cx, cTop + 0.08, HALL.z - 1.8));
      for (const s of [-1, 1]) {
        P.add(M.curtainDark, cyl(0.16, 0.18, 0.44, cx, cTop + 0.36, HALL.z - 1.8 + s * 0.28, { seg: 8 }));
      }
      const st = new THREE.Group();
      P.flush(st);
      hallGroup.add(st);
      ctx.collide(cx - 0.58, HALL.z - 2.3, cx + 0.58, HALL.z - 1.3);
    }
    ctx.add(hallGroup, 'wardens-hall');

    /* the porch: a hood on two posts over the door.  ONLY THE POSTS
     * COLLIDE — a box round a porch is a door you cannot walk through. */
    {
      const P = parts();
      const dx = HALL.x + 2.0;
      const dz = HALL.z + HALL.d / 2;
      const H = 2.62;
      for (const s of [-1, 1]) {
        const px = dx + s * 1.28;
        P.add(M.granite, bx(0.46, 0.24, 0.46, px, Y_KEEP + 0.12, dz + 1.15));
        P.add(M.oak, bx(0.21, H, 0.21, px, Y_KEEP + 0.24 + H / 2, dz + 1.15));
        P.add(M.oakDark, tubeGeo([px, Y_KEEP + H - 0.5, dz + 1.15], [px, Y_KEEP + H + 0.1, dz + 0.5], 0.055, 5));
        ctx.collide(px - 0.15, dz + 1.0, px + 0.15, dz + 1.3);
      }
      P.add(M.oakDark, bx(3.0, 0.2, 0.18, dx, Y_KEEP + H + 0.14, dz + 1.15));
      const g = new THREE.Group();
      P.flush(g);
      const hood = gableRoof({ w: 3.4, d: 2.0, pitch: 0.6, overhang: 0.28, thickness: 0.12, ridgeAxis: 'x', mat: M.slate, ridgeMat: M.lead });
      hood.position.set(dx, Y_KEEP + H + 0.24, dz + 0.4);
      hood.userData.airborne = true;
      g.add(hood);
      ctx.add(g, 'hall-porch');
    }

    /* the door leaf, the room, and the distance cull, in that order */
    {
      const leaf = makeDoorLeaf({
        doorway: shell.doorway, hinge: 'left', mat: painted(JOINERY.oakStain),
        ironMat: M.ironDark, ctx, name: 'wardens-hall-door',
        label: "E · the Warden's Hall",
      });
      ctx.add(leaf, 'wardens-hall-door');

      const room = new THREE.Group();
      room.name = 'wardens-hall-interior';
      const mats = interiorMats();
      const Rm = shell.room;
      const fy = shell.floorTopY;
      const put = (o) => { room.add(o); return o; };

      /* THE GREAT HEARTH on the west wall, under the stack.  Its BODY is
       * named `wardens-hearth` — the plan's interior-camera subject — and
       * it is the body that is named and not the outer group `withDecals`
       * wraps a lit prop in, whose bounding box is the size of its light
       * pool. */
      const H = hearth({
        w: 1.9, h: 2.15, d: 0.55, seed: 'warden-hearth', lit: true,
        at: [Rm.x0 + 0.02, fy, -40.3], ry: Math.PI / 2, mats,
      });
      (H.userData.body ?? H).name = 'wardens-hearth';
      put(H);

      /* the long table with the town's map on it, on the room's own axis */
      put(table({ w: 3.4, d: 1.1, h: 0.78, seed: 'warden-table', clutter: true, at: [-0.4, fy, -38.6], ry: 0, mats }));
      {
        const P = parts();
        P.add(mats.plaster, bx(1.5, 0.012, 0.95, -0.6, fy + 0.79, -38.6, { ry: 0.06 }));
        P.add(mats.timberDark, bx(1.56, 0.02, 0.06, -0.6, fy + 0.786, -38.13, { ry: 0.06 }));
        P.add(mats.timberDark, bx(1.56, 0.02, 0.06, -0.6, fy + 0.786, -39.07, { ry: 0.06 }));
        /* NOT tagged.  A map lying ON the table is inside the table's own
         * bounding box by construction — 100 % of the smaller unit — so it
         * is dressing on a unit rather than a unit of its own, which is the
         * same call templeknoll's headstone field makes. */
        const m = new THREE.Group();
        P.flush(m, { cast: false });
        put(m);
      }
      put(benchSeat({ w: 2.4, seed: 'warden-bench-n', at: [-0.4, fy, -39.5], ry: 0, mats }));
      put(benchSeat({ w: 2.4, seed: 'warden-bench-s', at: [-0.4, fy, -37.7], ry: Math.PI, mats }));

      /* the warden's chair at the head of the table, facing the door */
      {
        const P = parts();
        const cx = 1.75;
        const cz = -38.6;
        P.add(mats.timberDark, bx(0.56, 0.08, 0.5, cx, fy + 0.44, cz));
        for (const [ox, oz] of [[-0.22, -0.2], [0.22, -0.2], [-0.22, 0.2], [0.22, 0.2]]) {
          P.add(mats.timberDark, bx(0.07, 0.44, 0.07, cx + ox, fy + 0.22, cz + oz));
        }
        P.add(mats.timber, bx(0.09, 1.0, 0.46, cx + 0.24, fy + 0.94, cz));
        for (const s2 of [-1, 1]) {                       // the two back stiles, proud of the panel
          P.add(mats.timberDark, bx(0.11, 1.16, 0.1, cx + 0.24, fy + 1.02, cz + s2 * 0.25));
          P.add(mats.timberDark, cyl(0.055, 0.045, 0.12, cx + 0.24, fy + 1.66, cz + s2 * 0.25, { seg: 7 }));
          P.add(mats.timber, bx(0.42, 0.07, 0.08, cx + 0.05, fy + 0.66, cz + s2 * 0.24));   // the arm
          P.add(mats.timberDark, bx(0.07, 0.24, 0.07, cx - 0.15, fy + 0.55, cz + s2 * 0.24));
        }
        P.add(mats.clothWarm, bx(0.04, 0.54, 0.36, cx + 0.17, fy + 1.0, cz));
        const c = new THREE.Group();
        P.flush(c);
        tagProp(c, 'wardens-chair');
        put(c);
      }

      /* arms on the wall — racks and a shield row, and NO figures */
      put(shelf({ w: 1.4, h: 1.8, d: 0.32, boards: 4, goods: true, seed: 'warden-shelf', at: [-2.6, fy, Rm.z0 + 0.2], ry: 0, mats }));
      for (const [i, x] of [-0.6].entries()) {
        const rack = siegeProps.spearRack({ seed: `hall-spears-${i}`, n: 8, w: 1.5, h: 1.95 });
        rack.position.set(x, fy, Rm.z0 + 0.24);
        put(rack);
      }
      {
        const P = parts();
        for (let i = 0; i < 4; i += 1) {
          const x = 1.0 + i * 0.8;
          P.add(i % 2 ? mats.timberDark : mats.timber, cyl(0.34, 0.3, 0.09, x, fy + 1.95, Rm.z0 + 0.1, { seg: 7, rx: Math.PI / 2 }));
          P.add(mats.metal, cyl(0.09, 0.07, 0.06, x, fy + 1.95, Rm.z0 + 0.16, { seg: 7, rx: Math.PI / 2 }));
        }
        const s = new THREE.Group();
        P.flush(s);
        tagProp(s, 'shield-row', { airborne: true });
        put(s);
      }

      /* the chest, the stores, the stools, the lamps */
      {
        const P = parts();
        const cx = 3.4;
        const cz = -40.4;
        P.add(mats.timberDark, bx(1.15, 0.62, 0.62, cx, fy + 0.31, cz));
        P.add(mats.timber, bx(1.19, 0.16, 0.66, cx, fy + 0.68, cz));
        for (const s of [-1, 1]) P.add(mats.metal, bx(0.07, 0.8, 0.68, cx + s * 0.38, fy + 0.4, cz));
        P.add(mats.metal, bx(0.16, 0.2, 0.08, cx, fy + 0.5, cz + 0.34));
        const c = new THREE.Group();
        P.flush(c);
        tagProp(c, 'warden-chest');
        put(c);
      }
      put(innerBarrel({ h: 0.82, r: 0.3, seed: 'hall-butt', at: [3.6, fy, -37.2], ry: 0.3, mats }));
      put(innerCrates({ n: 3, size: 0.44, seed: 'hall-crates', at: [-3.6, fy, -37.0], ry: -0.4, mats }));
      put(stool({ seed: 'hall-stool-a', at: [-1.3, fy, -40.6], ry: 0.4, mats }));
      put(stool({ seed: 'hall-stool-b', at: [2.4, fy, -36.6], ry: -0.7, mats }));
      put(hangingLamp({ from: shell.ceilUnderY, drop: 0.7, seed: 'hall-lamp-a', lit: true, at: [-0.4, fy, -38.6], mats }));
      put(hangingLamp({ from: shell.ceilUnderY, drop: 0.7, seed: 'hall-lamp-b', lit: true, at: [2.6, fy, -39.6], mats }));

      /* THE WARM DOORWAY.  A lit room seen through an open door reads as a
       * black rectangle unless something behind it is lit, because a hole
       * in a wall is exactly what that looks like.  The card sits INSIDE
       * the reveal — `normal` is OUTWARD, so this is a minus — and the
       * leaf occludes it when the door is shut. */
      const dw = shell.doorway;
      const card = glowCard({ w: dw.clear * 1.05, h: (dw.headY - dw.sillY) * 0.9, ember: false, opacity: 0.46 });
      card.position.set(dw.centre[0] - dw.normal[0] * 0.3, dw.sillY + (dw.headY - dw.sillY) * 0.46, dw.centre[1] - dw.normal[1] * 0.3);
      card.rotation.y = Math.atan2(dw.normal[0], dw.normal[1]);
      card.name = 'wardens-hall-doorglow';
      room.add(card);

      ctx.add(room, 'wardens-hall-interior');
      registerInterior(ctx, room, { door: shell.doorway, name: 'wardens-hall' });
    }

    /* ================================================================
     * 7. THE BELL TOWER — the tallest thing in Hollowbrook, the town's
     *    whole skyline, and the object wave 6 ends on.
     *
     *    THE ROPE HANGS OUTSIDE THE SHAFT, on a bracket, and that is a
     *    decision forced by the plan: the interaction is declared at
     *    (8.5, -41), which is inside any tower whose foot reaches the
     *    waypoint at (8.5, -36.5), and `roundTower`'s shaft is a solid
     *    lofted drum with no ground stage to stand in.  A rope led over a
     *    wheel on a bracket and rung from the flags is a real arrangement
     *    for a tower with no ringing chamber, and it puts the rope where a
     *    player standing on the platform can see it and reach it.
     * ============================================================== */
    const tower = roundTower({
      seed: 'keep-bell-tower', r: TOWER.r, h: TOWER.h, taper: 0.13, crook: 0.35, seg: 12,
      wall: 'granite', cap: 'none', bands: 3, machicolation: true,
      bell: ACCENT.gilt, corbel: true, finial: false,
      windows: [
        { y: 3.2, a: Math.PI, w: 0.26, h: 1.15 },
        { y: 6.4, a: Math.PI * 0.75, w: 0.26, h: 1.15 },
        { y: 6.4, a: -Math.PI * 0.75, w: 0.26, h: 1.15 },
        { y: 9.6, a: Math.PI, w: 0.26, h: 1.15, lit: true },
        { y: 9.6, a: 0, w: 0.26, h: 1.15 },
      ],
    });
    place(ctx, tower, { x: TOWER.x, z: TOWER.z, yaw: 0, name: 'bell-tower' });
    const TU = tower.userData;
    const bellY = tower.position.y + (TU.bellY ?? TOWER.h);

    /* the buttresses: the platform's cover, and what stops a 21 m drum
     * from reading as a chimney */
    {
      const P = parts();
      /* SOUTH, WEST AND NORTH — never east.  An east buttress at
       * (14.02, -40) is 1.5 m of masonry standing ON the allure: it left
       * 0.22 m of walkable ground between its own collider and the
       * parapet's, so the allure's north half was sealed and the frame
       * from it came back as a wall filling the right of the picture. */
      for (const a of [0, -Math.PI * 0.5, Math.PI]) {
        const nx = Math.sin(a);
        const nz = Math.cos(a);
        const bxc = TOWER.x + nx * (TOWER.r + 0.42);
        const bzc = TOWER.z + nz * (TOWER.r + 0.42);
        const ry = Math.atan2(nx, nz);
        P.add(M.granite, bx(1.05, 3.3, 1.5, bxc, Y_KEEP + 1.65, bzc, { ry, seg: 3 }));
        P.add(M.coping, bx(1.2, 0.16, 1.66, bxc, Y_KEEP + 3.36, bzc, { ry }));
        P.add(M.granite, bx(0.86, 1.5, 0.9, bxc - nx * 0.3, Y_KEEP + 4.1, bzc - nz * 0.3, { ry }));
        ctx.collide(bxc - 0.78, bzc - 0.78, bxc + 0.78, bzc + 0.78);
      }
      const g = new THREE.Group();
      P.flush(g);
      ctx.add(g, 'tower-buttresses');
    }

    /* THE OPEN LANTERN AND ITS CONE.  `roundTower` with `bell` wants
     * `cap: 'none'` — a belfry on a cone is a hat on a hat — and what that
     * leaves is a plain drum with a small stone frame on top: the town's
     * whole skyline, and it read from the town axis as a chimney.  The
     * brief asks for "a bell stage, an open lantern, a conical cap", so
     * the lantern and the cap go on ABOVE the bell stage: six posts, a
     * ring beam, a lead cone and an iron finial.  No gilt on any of it —
     * the accent is the bell hanging under it. */
    {
      const P = parts();
      const lx = TOWER.x;
      const lz = TOWER.z;
      const y0 = tower.position.y + TU.topY + 2.86;      // the bell stage's cap slab
      const LR = 1.02;
      const LH = 1.05;
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 + 0.26;
        P.add(M.oak, bx(0.15, LH, 0.15, lx + Math.sin(a) * LR, y0 + LH / 2, lz + Math.cos(a) * LR, { ry: -a }));
      }
      P.add(M.oakDark, cyl(LR + 0.2, LR + 0.2, 0.14, lx, y0 + LH + 0.07, lz, { seg: 6 }));
      P.add(M.lead, cyl(0.03, LR + 0.34, 1.75, lx, y0 + LH + 1.02, lz, { seg: 6 }));
      P.add(M.ironDark, cyl(0.05, 0.05, 0.7, lx, y0 + LH + 2.15, lz, { seg: 6 }));
      P.add(M.ironDark, bx(0.5, 0.05, 0.05, lx, y0 + LH + 2.36, lz));
      const g = new THREE.Group();
      P.flush(g);
      g.userData.airborne = true;
      ctx.add(g, 'bell-lantern');
    }

    /* THE ROPE.  A wheel on a bracket at the belfry, the fall plumb to a
     * cleat post on the flags, and the tail OFF the cleat and coiled —
     * somebody untied it ten minutes ago and has not come back. */
    const ropePivot = new THREE.Group();
    {
      const dx = ROPE.x - TOWER.x;
      const dz = ROPE.z - TOWER.z;
      const d = Math.hypot(dx, dz);
      const nx = dx / d;
      const nz = dz / d;
      const sx = TOWER.x + nx * (TU.rTop + 0.06);
      const sz = TOWER.z + nz * (TU.rTop + 0.06);
      /* THE ARM SPRINGS FROM THE SHAFT HEAD, NOT FROM THE BELL'S AXLE.
       * Written at the axle it stands clear above the machicolation ring
       * with nothing under it, and the first frame read it as a gibbet
       * beside the tower rather than as part of it.  At the top of the
       * shaft it comes out of the masonry under the corbels, which is
       * where a rope actually leaves a tower with no ringing chamber. */
      const armY = tower.position.y + TU.topY + 0.2;
      const P = parts();
      P.add(M.oakDark, tubeGeo([sx, armY, sz], [ROPE.x, armY, ROPE.z], 0.075, 6));
      P.add(M.oakDark, tubeGeo([sx, armY - 0.95, sz], [ROPE.x - nx * 0.14, armY - 0.08, ROPE.z - nz * 0.14], 0.06, 5));
      P.add(M.ironDark, cyl(0.2, 0.2, 0.07, ROPE.x, armY, ROPE.z, { seg: 10, rx: Math.PI / 2, ry: Math.atan2(nx, nz) }));
      const g = new THREE.Group();
      P.flush(g);
      ctx.add(g, 'bell-rope-bracket');

      /* the fall itself is the animated part: a group AT THE WHEEL with
       * the rope hanging inside it, so a swing rotates about the wheel and
       * not about the world origin */
      const RP = parts();
      const fall = armY - (Y_KEEP + 0.9);
      RP.add(M.rope, cyl(0.026, 0.026, fall, 0, -fall / 2, 0, { seg: 6 }));
      RP.add(M.rope, cyl(0.055, 0.055, 0.3, 0, -fall + 0.15, 0, { seg: 6 }));   // the sally
      RP.flush(ropePivot, { cast: false });
      ropePivot.position.set(ROPE.x, armY, ROPE.z);
      ctx.add(ropePivot, 'bell-rope');

      // the cleat post, and the untied tail coiled at its foot
      const CP = parts();
      CP.add(M.oakDark, cyl(0.09, 0.1, 1.05, ROPE.x + 0.5, Y_KEEP + 0.52, ROPE.z + 0.36, { seg: 8 }));
      CP.add(M.ironRust, bx(0.32, 0.06, 0.09, ROPE.x + 0.5, Y_KEEP + 0.86, ROPE.z + 0.36, { rz: 0.25 }));
      for (let i = 0; i < 5; i += 1) {
        CP.add(M.rope, cyl(0.028, 0.028, 1.2 + i * 0.26, ROPE.x + 0.5, Y_KEEP + 0.05 + i * 0.03, ROPE.z + 0.36,
          { seg: 5, rx: Math.PI / 2, ry: i * 0.9 }));
      }
      const cp = new THREE.Group();
      CP.flush(cp);
      tagProp(cp, 'rope-cleat');
      ctx.add(cp, 'rope-cleat');
    }

    /* THE BELL.  No bake in this city, so the pivot the generator handed
     * back is a live group: rock it and let it decay.  `tolling` is a flag
     * the game layer reads for the win channel. */
    let swing = 0;
    let phase = 0;
    tower.userData.tolling = false;
    ctx.update((dt) => {
      if (swing <= 0.0015) {
        if (TU.bellPivot && TU.bellPivot.rotation.x !== 0) TU.bellPivot.rotation.x = 0;
        if (ropePivot.rotation.x !== 0) ropePivot.rotation.x = 0;
        tower.userData.tolling = false;
        return;
      }
      phase += dt * 3.6;
      swing *= Math.exp(-dt * 0.5);
      if (TU.bellPivot) TU.bellPivot.rotation.x = Math.sin(phase) * swing;
      ropePivot.rotation.x = Math.sin(phase) * swing * 0.16;
    });
    ctx.reset(() => {
      swing = 0;
      phase = 0;
      if (TU.bellPivot) TU.bellPivot.rotation.x = 0;
      ropePivot.rotation.x = 0;
      tower.userData.tolling = false;
    });
    interactive(ctx, {
      name: 'the bell rope', label: 'E · ring the bell',
      at: [8.6, Y_KEEP + 1.2, -41.0], size: [1.4, 2.4, 1.4],
      action: () => { swing = 0.62; phase = 0; tower.userData.tolling = true; },
    });

    /* ================================================================
     * 8. THE BEACON — the crest practical, unlit, being laid.  NO
     *    COLLIDER: what a walker could hit is a 0.24 m post, and slim
     *    frangible furniture goes in without one, the same call the kit
     *    already makes for its camp fires and its stop poles.  It also
     *    keeps the platform's 2.3 m north strip walkable, which a 1.1 m
     *    collider in the middle of it would not.
     * ============================================================== */
    const cage = beaconCage({ seed: 'keep-beacon', h: 3.0, r: 0.5, lit: false, ctx, glow: ACCENT.gilt });
    seat(cage, BEACON.x, BEACON.z);
    ctx.add(cage, 'beacon-cage');
    interactive(ctx, {
      name: 'the beacon cage', label: 'E · light the beacon',
      at: [BEACON.x + 0.2, G(BEACON.x, BEACON.z) + 1.3, BEACON.z + 1.0], size: [1.6, 2.8, 1.6],
      action: () => cage.userData.setLit(true),
    });
    // ...being laid: the faggots, the pitch, the ladder, the barrow
    ctx.add(seat(logPile({ seed: 'beacon-faggots', w: 1.9, h: 0.72, d: 0.66, roof: false }), -5.0, -41.3, Math.PI / 2), 'beacon-faggots');
    ctx.collide(-5.35, -42.3, -4.65, -40.3);
    ctx.add(seat(siegeProps.oilPots({ seed: 'beacon-pitch', n: 3, spread: 1.0 }), 3.9, -42.9, 0.5), 'beacon-pitch');
    ctx.add(seat(ladder({ seed: 'beacon-ladder', len: 3.4 }), -4.1, -43.3, -0.35), 'beacon-ladder');
    ctx.add(seat(cart({ seed: 'beacon-barrow', L: 1.5, W: 0.9, wheelR: 0.34, load: 'empty', shafts: true, paint: JOINERY.oakStain }), 0.2, -42.9, 0), 'beacon-barrow');
    ctx.collide(-0.55, -43.35, 0.95, -42.45);

    /* ================================================================
     * 9. THE ARMOURY LEAN-TO and the platform's fighting gear.
     *    Colliders on the back and sides only — a box round an
     *    open-fronted structure is a shelter you cannot stand in.
     * ============================================================== */
/* THE ARMOURY AND EVERYTHING WITH IT STAND EAST OF x 6, and that is the
     * owned vista's arithmetic.  `from-the-keep` looks from (2, 7.0, -33)
     * down the town's axis at fov 54, so at 3 m ahead the frame spans
     * x -0.7..4.7 and at 5 m x -2.5..6.5.  The first cut had the spear
     * rack at (0.5, -30.6) — 2.8 m from the lens and 32 degrees off the
     * axis — and eight spear points filled the right third of the district's
     * one contracted frame.  A clear ray to the subject says nothing about
     * what else is in shot; only the frame finds that. */
    ctx.add(leanTo({
      w: 3.8, d: 2.4, h: 2.45, pitch: 0.24, open: 'z+', at: [10.0, Y_KEEP, -30.9],
      mat: M.oak, roofMat: M.slate, ctx,
    }), 'armoury');
    /* THE GEAR STANDS BESIDE THE LEAN-TO, NOT UNDER IT.  `leanTo` is a
     * tagged prop unit whose bounding box is its whole volume, so anything
     * inside it overlaps it by 99-100 % and the audit is right to say so.
     * The armoury is being emptied anyway — that is the district's story —
     * so its stock is out on the flags in front of the doors. */
    ctx.add(seat(barrelStack({ seed: 'armoury-butts', rows: 2, endColor: JOINERY.oakStain }), 12.9, -31.0, 0.2), 'armoury-butts');
    ctx.collide(12.2, -31.6, 13.6, -30.4);
    ctx.add(seat(siegeProps.arrowBundle({ seed: 'armoury-arrows', n: 22, h: 0.92 }), 12.8, -32.8, -0.4), 'armoury-arrows');
    ctx.add(seat(siegeProps.spearRack({ seed: 'armoury-spears', n: 9, w: 1.7, h: 2.0 }), 10.0, -33.0, 0), 'armoury-spears');
    ctx.collide(9.1, -33.2, 10.9, -32.8);

    /* PLATFORM COVER — carried up and set this evening.  `placeCover`
     * seats it, registers the ROTATED footprint and throws if a prop
     * tagged as cover is under 0.9 m. */
    placeCover(ctx, siegeProps.gabion({ seed: 'keep-gabion-a', r: 0.54, h: 1.1 }), { x: 6.6, z: -29.2, name: 'keep-gabion-a' });
    placeCover(ctx, siegeProps.gabion({ seed: 'keep-gabion-b', r: 0.54, h: 1.1 }), { x: 6.9, z: -30.6, name: 'keep-gabion-b' });
    placeCover(ctx, siegeProps.mantlet({ seed: 'keep-mantlet-a', w: 1.7, h: 1.5, lean: 0.2 }), { x: 13.2, z: -29.6, yaw: 0, name: 'keep-mantlet-a' });
    placeCover(ctx, siegeProps.mantlet({ seed: 'keep-mantlet-b', w: 1.7, h: 1.5, lean: 0.22 }), { x: -4.6, z: -34.6, yaw: Math.PI / 2, name: 'keep-mantlet-b' });

    /* ================================================================
     * 10. THE LOWER WARD — the well, the muster, and the ground the
     *     raiders have to cross once the gate is theirs.
     * ============================================================== */
    {
      const w = wellHead({ seed: 'ward-well', r: 0.82, h: 0.76, roof: true, bucket: true, roofColor: JOINERY.oakStain });
      ctx.add(seat(w, -7.2, -25.2), 'ward-well');
      ctx.collide(-8.05, -26.05, -6.35, -24.35);
    }
    ctx.add(seat(trough({ seed: 'ward-trough', len: 1.8, water: true }), -9.6, -26.4, 0), 'ward-trough');
    ctx.collide(-10.5, -26.75, -8.7, -26.05);

    /* THE MUSTER, on the ward's west strip: mantlets carried up and not
     * yet set, the spears racked, the cart on its side where the wheel
     * went.  Six pieces of cover, CLUSTERED rather than scattered, with a
     * lane between them toward the ward gate. */
    placeCover(ctx, siegeProps.mantlet({ seed: 'ward-mantlet-a', w: 1.7, h: 1.5, lean: 0.18 }), { x: -11.4, z: -31.6, yaw: Math.PI / 2, name: 'ward-mantlet-a' });
    placeCover(ctx, siegeProps.mantlet({ seed: 'ward-mantlet-b', w: 1.7, h: 1.5, lean: 0.24 }), { x: -11.6, z: -34.0, yaw: Math.PI / 2, name: 'ward-mantlet-b' });
    placeCover(ctx, siegeProps.gabion({ seed: 'ward-gabion-a', r: 0.56, h: 1.08 }), { x: -8.6, z: -29.5, name: 'ward-gabion-a' });
    placeCover(ctx, siegeProps.gabion({ seed: 'ward-gabion-b', r: 0.56, h: 1.08 }), { x: -9.9, z: -30.3, name: 'ward-gabion-b' });
    placeCover(ctx, siegeProps.felledCart({ seed: 'ward-cart', paint: JOINERY.oakStain }), { x: -11.0, z: -39.2, yaw: Math.PI / 2, name: 'ward-cart' });
    placeCover(ctx, siegeProps.breachRubble({ seed: 'ward-rubble', w: 2.4, d: 1.7, h: 1.1 }), { x: 9.4, z: -25.4, yaw: 0, name: 'ward-rubble' });

    ctx.add(seat(siegeProps.spearRack({ seed: 'ward-spears', n: 8, w: 1.6, h: 1.95 }), -12.9, -36.6, Math.PI / 2), 'ward-spears');
    ctx.collide(-13.15, -37.4, -12.65, -35.8);
    ctx.add(seat(siegeProps.arrowBundle({ seed: 'ward-arrows', n: 18, h: 0.88 }), -12.8, -30.2, 0.3), 'ward-arrows');
    ctx.add(seat(crateStack({ seed: 'ward-crates', n: 3, spill: true, goods: JOINERY.bone }), 12.6, -46.6, -0.5), 'ward-crates');
    ctx.collide(12.0, -47.2, 13.2, -46.0);
    ctx.add(seat(barrel({ seed: 'ward-butt', h: 0.86, r: 0.36, open: true }), -12.6, -45.4, 0), 'ward-butt');
    ctx.add(seat(logPile({ seed: 'ward-logs', w: 2.0, h: 0.9, d: 0.6, roof: false }), 3.2, -46.4, Math.PI / 2), 'ward-logs');
    ctx.collide(2.85, -47.4, 3.55, -45.4);
    ctx.add(seat(ladder({ seed: 'ward-ladder', len: 3.6 }), -13.0, -47.4, 0.15), 'ward-ladder');
    ctx.add(seat(ladder({ seed: 'ward-ladder-2', len: 4.2 }), -7.55, -37.4, Math.PI / 2), 'ward-ladder-2');
    ctx.add(bench({ at: [-9.4, G(-9.4, -46.6), -46.6], facing: [0, 1], w: 1.7, mat: M.oakSilver, ctx }), 'ward-bench');

    /* ================================================================
     * 11. THE PRACTICALS.  Warm, small and OFF the axes: a torch on the
     *     gate's own centre line is the thing you look past to the keep.
     * ============================================================== */
    for (const [i, [x, z]] of [[-3.6, -24.4], [-7.3, -33.4], [12.4, -43.4]].entries()) {
      ctx.add(seat(torch({ seed: `ward-torch-${i}`, h: 2.15, lit: true, post: true }), x, z), `ward-torch-${i}`);
    }
    {
      const b = brazier({ seed: 'ward-brazier', lit: true, ctx });
      ctx.add(seat(b, 5.6, -24.6), 'ward-brazier');
      ctx.collide(5.32, -24.88, 5.88, -24.32);
    }
    for (const [i, [x, z]] of [[-3.0, -33.0]].entries()) {
      ctx.add(seat(lantern({ seed: `keep-lamp-${i}`, h: 2.5, lit: true, post: true }), x, z), `keep-lamp-${i}`);
    }
    /* two torches on the wall-walk's inner face, the kit's own mounting
     * convention: origin ON the wall, projecting +Z, which on the north
     * run is +z into the town */
    for (const [i, x] of [-4, 26].entries()) {
      const t = wallTorch({ seed: `walk-torch-${i}`, lit: true, reach: 0.42 });
      t.position.set(x, Y_WALK + 1.1, -48.78);
      ctx.add(t, `walk-torch-${i}`);
    }

    /* A FIGHTING POSITION ON THE NORTH WALK, at x 14 — and it is there
     * because the terminating-sight-line sweep found the view east out of
     * `keep-walk-w` landing on NOTHING for 45 m: 57 m of empty parapet is
     * the emptiest frame in the district.  No collider on any of it: the
     * walk's free band is 1.71 m and a 0.56 m brazier with a box round it
     * takes 1.24 of that.  The kit makes the same call for its camp fires. */
    {
      const b = brazier({ seed: 'walk-brazier', lit: true, ctx });
      ctx.add(seat(b, 14.0, -49.9), 'walk-brazier');
      ctx.add(seat(siegeProps.arrowBundle({ seed: 'walk-arrows', n: 16, h: 0.86 }), 16.4, -50.3, 0.4), 'walk-arrows');
      ctx.add(seat(lantern({ seed: 'walk-lamp', h: 2.6, lit: true, post: true }), 18.0, -49.95), 'walk-lamp');
    }

    /* THE WARDEN'S STANDARD on the platform's south edge.  The district's
     * device is the bell and the field is muted joinery, NOT the accent:
     * the gilt is the bell itself and the beacon's fire and nothing else on
     * this hill.  A PALE FIELD AND TWO FOLDS, though, not `plumWash` and
     * three — in shade all evening a plum cloth cut into three panels reads
     * at 40 m as a dark ladder on a pole, because the eye counts the gaps
     * rather than the cloth. */
    for (const [i, x] of [-4.0].entries()) {
      const b = bannerPole({
        seed: `keep-banner-${i}`, h: 5.4, field: JOINERY.bone, band: JOINERY.plumWash,
        bw: 0.9, bh: 2.1, device: 'bell', deviceInk: JOINERY.pitch, folds: 2,
      });
      ctx.add(seat(b, x, -29.2), `keep-banner-${i}`);
      ctx.collide(x - 0.24, -29.44, x + 0.24, -28.96);
    }

    /* signage: the muster roll on the ward gate's east pier, the bell
     * times on the tower.  NO PEOPLE, on either. */
    {
      const n = signKit.wallNotice({ notice: 'muster', w: 0.72, h: 0.9, seed: 'ward-muster', tilt: 0.02 });
      n.position.set(2.62, Y_WARD + 1.55, -24.88);
      ctx.add(n, 'muster-notice');
    }
    {
      const n = signKit.wallNotice({ notice: 'bells', w: 0.68, h: 0.86, seed: 'tower-bells', tilt: 0.02 });
      n.position.set(TOWER.x - 0.35, Y_KEEP + 1.7, TOWER.z + TOWER.r + 0.04);
      ctx.add(n, 'bell-notice');
    }
    ctx.add(seat(waymarker({ seed: 'keep-waymark' }), 2.95, -20.4), 'keep-waymarker');

    /* ================================================================
     * 12. THE YEW CLOSE — the almoner's house, the graves and the fox.
     *
     *     THE ALMONER'S HOUSE MOVED TWICE, and both moves were measured
     *     rather than chosen.  The brief puts it at (34, -30); a 7 x 5.6
     *     body there CONTAINS (36, -30), which is the vixen's `flees_to`
     *     point, and the plan asks for open ground between (27,-34) and
     *     (36,-30).  Moved to (34.5, -24) it then sat across the
     *     `keep-lane-e` socket: the seam gate read "clear passage narrows
     *     to 0 m at z -20.87" for a 3.6 m corridor at x 34.2..37.8, and
     *     the terminating-sight-line sweep closed the view out of that
     *     socket at 2.28 m on the cottage's own gable.  At (30.0, -25.2)
     *     its east wall stands 0.7 m clear of the corridor once the
     *     player's radius is on it, the lane runs past its front into the
     *     close, and the fox's ground is untouched.
     * ============================================================== */
    place(ctx, cottage({
      seed: 'almoner-house', w: 7.0, d: 5.6, storeys: 1.5, roof: 'thatch',
      wall: 'limewash', crook: 0.85, pitch: 0.86, door: JOINERY.oakStain,
      shutters: 'mixed', chimney: true, litWindows: 1, dormers: 1,
      windowBoxes: false, plinth: true,
    }), { x: 30.0, z: -25.2, yaw: 0, name: 'almoner-house' });

    ctx.add(seat(logPile({ seed: 'almoner-logs', w: 2.1, h: 0.95, d: 0.6, roof: false }), 25.4, -26.6, Math.PI / 2), 'almoner-logs');
    ctx.collide(25.05, -27.65, 25.75, -25.55);
    ctx.add(seat(barrel({ seed: 'almoner-butt', h: 0.84, r: 0.36, open: true }), 34.6, -26.6, 0), 'almoner-butt');
    ctx.add(bench({ at: [32.6, G(32.6, -22.6), -22.6], facing: [-1, 0], w: 1.6, mat: M.oakSilver, ctx }), 'almoner-bench');

    // the close's boundary: a low wall on the lane, hedge and rail elsewhere
    {
      const pts = [[26.0, -30.4], [33.6, -30.4]];
      ctx.add(wallRun({
        points: pts, h: 0.9, thick: 0.34, piers: pierEvery(pts, 8.0),
        mat: M.granite, copingMat: M.graniteDark, ctx,
      }), 'close-wall');
    }
    ctx.add(hedgeRun({ points: [[20.4, -19.4], [26.6, -19.4]], h: 1.25, seed: 'close-hedge-s', groundAt: ctx.groundAt }), 'close-hedge-s');
/* TWO STRAIGHT RUNS, not one dog-leg.  `fenceRun` is a single tagged
     * unit and its bounding box is the box of the whole polyline, so an
     * L-shaped run 14 m by 10 m contains everything in the quadrant — the
     * audit read it as 100 % overlapping a votive stone eight metres from
     * the nearest post, which was a true statement about a bounding box. */
    ctx.add(fenceRun({
      points: [[20.5, -34.6], [20.5, -44.6]], kind: 'post-rail', h: 1.15,
      seed: 'close-fence-w', groundAt: ctx.groundAt, postEvery: 2.4, mat: M.oakSilver,
    }), 'close-fence-w');
    ctx.add(fenceRun({
      points: [[20.9, -45.4], [29.4, -46.8]], kind: 'post-rail', h: 1.15,
      seed: 'close-fence-n', groundAt: ctx.groundAt, postEvery: 2.4, mat: M.oakSilver,
    }), 'close-fence-n');

    /* the graveyard.  A yew's tagged box is nearly 4 m across, so every
     * grave stands in the gaps between them and not where a plan would put
     * them.  THE LANE THE FOX RUNS — (27,-34) to (36,-30) — is left open
     * ground: nothing tagged, nothing collidable, no canopy over it. */
    yew(ctx, 'close-yew-a', 22.4, -25.6, 1.06);
    yew(ctx, 'close-yew-b', 23.4, -31.8, 0.98);
    yew(ctx, 'close-yew-c', 25.8, -40.2, 1.1);
    yew(ctx, 'close-yew-d', 31.6, -41.8, 1.02);
    yew(ctx, 'close-yew-e', 39.4, -37.0, 1.08);
    ctx.add(headstones(ctx, 'close-graves', [
      [26.0, -37.2], [27.2, -37.6], [28.4, -37.2], [29.6, -37.8],
      [26.4, -39.2, 'fallen'], [28.8, -39.4], [30.0, -38.8],
      [33.0, -37.4], [34.2, -37.8], [35.4, -37.2],
      [33.4, -39.6, 'fallen'], [35.8, -39.4],
      [29.2, -35.0, 'chest'], [34.6, -35.2, 'chest'],
      [37.8, -41.4], [25.4, -42.6], [31.0, -43.4],
    ]), 'close-graves');
    for (const [i, [x, z]] of [[27.6, -35.6], [34.0, -36.0]].entries()) {
      ctx.add(seat(shrineStone({ seed: `close-light-${i}`, h: 0.52, w: 0.27, flame: i === 0, capColor: null }), x, z), `close-light-${i}`);
    }
    ctx.add(seat(shrineStone({ seed: 'close-cross', h: 1.35, w: 0.44, flame: false, capColor: null }), 30.4, -33.0), 'close-cross');

    /* ================================================================
     * 13. GROUND BREAKUP.  The climb is the composition, and a climb over
     *     one flat tone is a ramp.  Every band is an explicit rectangle,
     *     not a radius round a centre.
     * ============================================================== */
    const dress = [];
    const band = (n, x0, x1, z0, z1, kinds, lift = 0) => {
      for (let i = 0; i < n; i += 1) dress.push([R.range(x0, x1), R.range(z0, z1), R.pick(kinds), lift]);
    };
    for (let i = 0; i < 18; i += 1) {                                   // the road up to climb 1
      dress.push([R.range(-2.4, 2.4), -18.2 - (i / 17) * 6.0, R.pick(['slab', 'gravel', 'moss', 'tuft'])]);
    }
    band(16, -13.4, 15.4, -27.4, -22.6, ['slab', 'moss', 'gravel', 'tuft']);      // the ward's south apron
    band(16, -13.4, -6.6, -47.8, -28.4, ['moss', 'tuft', 'gravel', 'rock']);      // the ward's west strip
    band(12, -13.4, 15.4, -48.2, -44.6, ['moss', 'tuft', 'gravel']);              // the ward's north apron
    band(14, -5.2, 13.2, -43.2, -28.8, ['slab', 'moss', 'tuft']);                 // the keep platform
    band(12, 17.4, 25.0, -44.0, -21.0, ['tuft', 'moss', 'rock']);                 // the close's west edge
    band(14, 20.0, 45.0, -45.0, -20.5, ['tuft', 'moss', 'gravel', 'tuft']);       // the close
    band(10, -17.4, -14.8, -44.0, -23.0, ['rock', 'tuft', 'moss']);               // the lane at the ward's foot
    band(8, 16.6, 18.4, -47.0, -24.0, ['rock', 'moss', 'tuft']);                  // the east curtain's toe
    band(8, 14.2, 15.4, -43.0, -29.0, ['moss', 'moss', 'slab']);                  // the allure's own walk
    ctx.add(groundDress(ctx, 'keep-wear', dress), 'ground-wear');

    /* `Y_OUT`, `WARD` and `KEEP` are the measured landform and are kept as
     * the record of it — every coordinate above was derived from them and a
     * later round should re-derive rather than re-remember. */
    void PAL;
    void Y_OUT;
    void WARD;
    void KEEP;
  },
});
