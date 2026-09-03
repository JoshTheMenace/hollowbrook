import * as THREE from 'three';
import { defineDistrict } from '../core/district.js';
import {
  M, painted, glowing, PAL, ACCENT, JOINERY,
  place, rng, seatOnGround, parts, bx, cyl, tubeGeo, tagProp,
  longhouse, roundTower,
  treeStand, hedgeRun,
  wallRun, stairs, pier, bench,
  interactive, lightPool, postLantern, torch, brazier, bracketLantern,
  wellHead, barrel, barrelStack, crate, crateStack,
  sackStack, logPile, ladder, washingLine, trough, kitchenGarden,
  curtainWall, stairTurret, siegeProps, placeCover, wallTorch,
  gableRoof,
  noticeBoardStand, fingerpost, platePost, paintedName,
} from '../kit/index.js';
import { hollowShell } from '../builders.js';
import { registerInterior, makeDoorLeaf } from '../core/interior.js';
import {
  interiorMats, benchSeat, lightPool as roomPool, glowCard,
} from '../interiors.js';

/* ==================================================================== *
 * THE CHAPEL CLOSE — the quiet north-west, under the north and west
 * wall-walks.  ST. WENNA'S, the graveyard, the almshouse row and the
 * WIZARD'S TOWER, which carries the town's one cool accent.
 *
 * ---- THE LAND IS THE TERRAIN'S AND IS NOT MINE ----------------------
 * Measured off `ctx.groundAt` with `?only=chapelclose` before a line of
 * this was written (numbers, not memory):
 *
 *   level          y 0.00 flat over the whole envelope x -54..-18, z -54..-12
 *   west walk      y 5.00 over x -51.2..-48.8, z -51.2..-12
 *   north walk     y 5.00 over x -51.2..-18,  z -51.2..-48.8
 *   stair landing  y 5.00 over x -33..-30,    z -48.8..-45.8
 *   close-wall-stair  a terrain RAMP in z -48.2..-46.6, climbing
 *                  0.0 at x -43.0  ->  5.0 at x -32.6, in 0.4 m steps
 *   sockets        cc-s-lane (-36,-12) y 0 · cc-lane-e (-18,-30) y 0
 *                  cc-walk-s (-50,-12) y 5 · cc-walk-e (-18,-50) y 5
 *   the north curtain's INNER plinth reaches z = -48.30 (curtainWall puts
 *                  it at IN - s*0.25, 0.5 thick) — so the almshouse's
 *                  back wall stands clear of it at -47.9.
 *
 * So this module lays NO ground except ONE made surface, declared below.
 *
 * ---- THE FOUR THINGS THAT DECIDE THE WHOLE LAYOUT -------------------
 *
 * 1. THE CLOSE IS AN ENCLOSURE, which is what the word means and what
 *    the siege needs.  The town wall closes it north and west; the
 *    almshouse row closes the north-east; a 1.05 m churchyard wall
 *    closes the south and the east.  THREE ways in and no more:
 *      · the LYCH-GATE at (-30, -15.8) — 2.0 m clear between its piers,
 *        1.32 m walkable once the player's 0.34 m radius is on both — on
 *        the chapel door's own axis, so the gate frames the door.  This
 *        is the choke the brief asks for and the terminus of the route
 *        in from the mill at (-36, -12).
 *      · the EAST GAP at x -21.6, z -31.95..-28.25 (3.7 m) where the
 *        lane from the keep at (-18, -30) comes in.  Wave 5's storm
 *        arrives through this one, which is why it is the wide one.
 *      · the WALL STAIR, landing in the yard's north-west corner.
 *    NEITHER WALL MAY REACH A SOCKET'S CORRIDOR: the seam gate measures
 *    3 m into my side and wants width − 1 m of clear passage, so the
 *    south wall stands at z = -15.8 (its collider's far edge -15.26,
 *    outside the corridor's first slice at -14.875) and the east wall at
 *    x = -21.6 (far edge -21.06, outside the slice at -20.875).  Both
 *    numbers are the gate's, not taste.
 *
 * 2. THE ONE MADE SURFACE IS THE UPPER BURIAL TERRACE, and it is
 *    declared here because composeCity will (rightly) warn about it:
 *    x -47.9..-38.7, z -45.9..-36.0, top 0.55, 91 m².  A churchyard
 *    against a town wall IS raised — that is what centuries of burial do
 *    to one — and this is the arena's high ground INSIDE the rect (the
 *    wall-walk is outside it by the plan's own numbers, so without this
 *    the close has no elevation in it at all).  It is retained on its
 *    south and east faces, climbed by two flights twelve metres apart,
 *    and walked OFF anywhere: 0.55 m is over the walker's 0.38 m step,
 *    so the way down is not the way up.  The tower stands on it.
 *
 * 3. THE SUN IS AT BEARING 268, ELEVATION 9 (city.sun, read off the
 *    plan).  Due west, nine degrees up: only WEST faces and the tops of
 *    things carry the last amber, everything else is violet half-light.
 *    So the chapel's WEST gable and the tower's WEST flank are the lit
 *    elevations, and the ward-glow is spent on the tower's EAST and
 *    NORTH-EAST windows — the faces the town and the vista look at, and
 *    the only ones dark enough for a cool emissive to read as magic
 *    rather than as a smudge.
 *
 * 4. `market-sees-tower` (0,0) -> (-36,-34), half 3, clear above 9.0,
 *    crosses the chapel's north-east corner (-26.4, -24.8), which sits
 *    0.10 m off the corridor's own centre line.  So the chapel's ridge
 *    is a contract, not a taste: 6.02 m.  The bellcote — on the WEST
 *    gable, 7.1 m from that corner and well outside the band — tops out
 *    at 7.4.  The tower is at `along` 59.4 m of a 49.5 m corridor, i.e.
 *    ten metres PAST its terminus, which is why it closes the view down
 *    it instead of blocking it.
 *
 * ---- ACCENT DISCIPLINE ----------------------------------------------
 * `ACCENT.wardGlow` / `PAL.tealGlow` is the town's ONLY cool accent and
 * ONLY strong emissive.  Counted, not eyeballed — it is spent in exactly
 * three places and every one of them is the same ward:
 *   · four upper windows of the wizard's tower (what the town sees),
 *   · the ward stone's cut glyphs and its pool, once it is woken,
 *   · the two lamps in the tower's own doorway.
 * Everything else lit here is candle-warm: the vigil candles, the
 * almshouse windows, the lych-gate lantern, the sexton's brazier.
 * NOTHING here wears `ACCENT.companyRust`.
 *
 * ---- TRAPS THIS DISTRICT PAID FOR -----------------------------------
 * Every one of these rendered without an error and most of them rendered
 * without looking wrong.  The tool that found each is named, because
 * which tool finds a class of bug is the reusable part.
 *
 *  1. `stairs()` RETURNS A MESH AND ONLY REGISTERS THE PLATFORMS.  Both
 *     terrace flights and both pentice flights were called for their
 *     `ctx` side effect and never added: four staircases that `groundAt`
 *     answered 0.555 over and that had no geometry anywhere.  A frame
 *     from the yard shows a gap in the revetment, not a missing stair.
 *     *(Found by: the spatial audit's SEAM grid — "walkable height 0.55
 *     but first surface at y 0".)*
 *  2. `hollowShell` CUTS A HOLE AND BUILDS NO GLASS.  The chapel's north
 *     window was a 1.15 x 1.85 m aperture straight through the building,
 *     so the money shot — the glimpse down the nave at the altar — came
 *     back with THE ALMSHOUSE'S LIT WINDOWS hanging over the altar
 *     twenty-five metres away, reading as a small framed picture on the
 *     far wall.  *(Found by: one raycast at that pixel, which named the
 *     mesh in a single call; three guesses before it were all wrong.)*
 *  3. A PORCH LINING WRITTEN ACROSS ITS OWN DOORWAY.  A 1.72 x 2.2 m
 *     limewash panel at `Z1 + 0.03` is 0.03 m IN FRONT of the door, so
 *     the leaf and the whole lit interior were behind a blank pale
 *     rectangle in a stone surround.  Depth is built outward and an
 *     opening is left open.  *(Found by: the frame from the lych-gate.)*
 *  4. A CHAPEL PLINTH WRITTEN AS A SOLID BOX IS 0.30 m OF GRANITE INSIDE
 *     THE ROOM.  Every fitting in the chapel came back BURIED 0.26 m.  A
 *     plinth course is a ring.  *(Found by: the spatial audit.)*
 *  5. A MULTI-SPOT `treeStand` IS ONE AUDIT UNIT SPANNING EVERY SPOT.
 *     Five yews across this yard is a 20 x 20 m box that OVERLAPs the
 *     tombs, the well, the cart, the sexton's corner, the almshouse's
 *     props and the chapel's own furniture at once — 40-odd failures
 *     from one call.  One stand per tree is the same eight meshes.
 *     *(Found by: the spatial audit; it is in the kit's own errata.)*
 *  6. `roundTower` ALWAYS DRAWS ITS DOOR SHUT AND TAKES NO FLAG TO LEAVE
 *     IT OUT.  A second leaf swung back beside it reads as a spare door
 *     propped against the wall, which is exactly what the render showed.
 *     `door: null` plus a reveal, a surround and a hinged leaf of my own.
 *     *(Found by: the frame from the tower's step.)*
 *  7. A DOOR LEAF'S SWING SIGN.  A group at `rotation.y = ry` maps its
 *     local +x to the wall's tangent — the leaf SHUT.  `ry + 1.72` turns
 *     it INTO the shaft and the door vanishes inside the tower; the frame
 *     shows a doorway with no door anywhere.  Derive it, do not guess it.
 *  8. `M.lit` IS THE MATERIAL A FLAME IS MADE OF.  A 1.15 x 1.85 m sheet
 *     of it in a window is a glowing orange billboard and the loudest
 *     object in the district from both sides of the wall — and
 *     `litGlass()` is the same material under another name.  A pale base
 *     with a low emissive keeps the facet shading and reads as glazing.
 *  9. A WARD LIT AS FOUR LONG BARS IS A LIGHTBOX, NOT AN INSCRIPTION, and
 *     a 1.9 m cool pool on turf is a patch of lawn, not light.
 * 10. THE LANDMARK GATE AIMS AT A BBOX CENTRE ONLY.  A yew 0.38 m off the
 *     ray from the arena's centre to the tower's mid-shaft made the
 *     landmark read from every vista and from four of marketlow's five
 *     waypoints and NOT from the middle of its own arena.
 * 11. A `plan.terrain.shelves` LOOKUP BY WIDTH FINDS THE WALL-WALK.  The
 *     west run is also 2.4 m wide, so `x1 - x0 < 6` handed `stairTurret`
 *     a 39 m shelf and it threw "it is not a stair head".
 * ==================================================================== */

const E = { x0: -54, z0: -54, x1: -18, z1: -12 };
const TAU = Math.PI * 2;

/* the churchyard's boundary, and every number in it is load-bearing */
const WALL_Z = -15.8;          // south churchyard wall centre line
const WALL_X = -21.6;          // east churchyard wall centre line
const GATE_X = -30;            // the lych-gate, on the chapel door's axis
const GATE_HALF = 1.0;         // 2.0 m clear between the piers

/* the chapel */
const CH = { x: -30, z: -22, w: 7.2, d: 5.6, h: 4.1, wallT: 0.30 };

/* the upper burial terrace — THE ONE MADE SURFACE (see note 2) */
const TER = { x0: -47.9, z0: -45.9, x1: -38.7, z1: -36.0, y: 0.55 };

/* the wizard's tower */
const TOWER = { x: -44, z: -40, r: 2.6, h: 13.5 };
const TOWER_DOOR_A = 0.588;    // bearing from +Z: south-east, at the steps

/* the chapel's candle-lit glazing — see the note where it is used */
let GLASS = null;
const chapelGlass = () => (GLASS ??= glowing(PAL.limewashHoney, PAL.warmLight, 0.34));

/* ---- small plumbing ------------------------------------------------- */

/** Seat a prop on the ground by query and hand it to the district. */
function put(ctx, group, x, z, ry, name) {
  group.position.set(x, 0, z);
  group.rotation.y = ry;
  seatOnGround(group, ctx.groundAt);
  ctx.add(group, name);
  return group;
}

/** Mount a wall-mounted kit group (origin on the face, projecting +Z). */
function mount(ctx, group, x, y, z, ry, name) {
  group.position.set(x, y, z);
  group.rotation.y = ry;
  ctx.add(group, name);
  return group;
}

/* ==================================================================== *
 * CUSTOM DRESSING — pooled with `parts()` the way the kit does, so each
 * of these is one mesh per material.  None of them is a building
 * generator; anything at that scale comes from the kit.  Flagged as kit
 * promotion candidates at the foot of the file.
 * ==================================================================== */

/**
 * A TABLE TOMB: a chest of ashlar on stub legs under a heavy ledger slab.
 * The graveyard's cover field is made of these — 0.98-1.10 m to the top
 * of the ledger, inside the kit's 0.9-1.4 m cover band — and the
 * silhouette (a dark slot of shadow under a pale slab) is what makes it
 * read as a tomb at 25 m rather than as a crate.
 * Authored with its long axis along X, origin on the ground at its centre.
 */
function tableTomb({ seed = 'tomb', L = 2.05, W = 0.98, h = 1.02, moss = true } = {}) {
  const g = new THREE.Group();
  const P = parts();
  const r = rng(seed);
  const lean = r.range(-0.03, 0.03);
  const bodyH = h - 0.16;
  /* base slab, then the chest set back on it, then the ledger over —
   * depth built OUTWARD, three genuine layers */
  P.add(M.graniteDark, bx(L + 0.2, 0.12, W + 0.2, 0, 0.06, 0, { rz: lean }));
  for (const sx of [-1, 0, 1]) {
    for (const sz of [-1, 1]) {
      P.add(M.graniteDark, bx(0.16, bodyH - 0.16, 0.16,
        sx * (L / 2 - 0.22), 0.12 + (bodyH - 0.16) / 2, sz * (W / 2 - 0.2), { rz: lean }));
    }
  }
  P.add(M.granite, bx(L - 0.34, bodyH - 0.2, W - 0.3, 0, 0.14 + (bodyH - 0.2) / 2, 0, { rz: lean }));
  P.add(M.graniteWarm, bx(L - 0.12, 0.05, W - 0.12, 0, bodyH - 0.02, 0, { rz: lean }));
  P.add(M.coping, bx(L, 0.16, W, 0, bodyH + 0.08, 0, { rz: lean }));
  if (moss) {
    for (let i = 0; i < 4; i += 1) {
      P.add(M.moss, bx(r.range(0.3, 0.62), 0.02, r.range(0.22, 0.4),
        r.range(-L / 2 + 0.3, L / 2 - 0.3), bodyH + 0.165, r.range(-W / 2 + 0.2, W / 2 - 0.2),
        { ry: r.range(0, TAU) }));
    }
  }
  P.flush(g);
  return tagProp(g, 'table-tomb', {
    cover: true, coverH: h,
    footprint: { x0: -L / 2 - 0.08, z0: -W / 2 - 0.08, x1: L / 2 + 0.08, z1: W / 2 + 0.08 },
  });
}

/**
 * HEADSTONES: a whole plot of leaning slabs as ONE pooled unit, because
 * forty separate 0.6 m props are forty audit units standing inside each
 * other and forty draw calls.  `spots` are LOCAL to the group.  NO
 * COLLIDERS: a grave you cannot walk past is a grave in the way of a wave.
 */
function headstoneField({ seed = 'graves', spots = [] } = {}) {
  const g = new THREE.Group();
  const P = parts();
  const r = rng(seed);
  for (const [lx, lz] of spots) {
    const h = r.range(0.46, 0.86);
    const w = r.range(0.34, 0.5);
    const lean = r.range(-0.15, 0.15);
    const yaw = r.range(-0.35, 0.35);
    const tone = r.chance(0.35) ? M.graniteDark : (r.chance(0.4) ? M.graniteWarm : M.granite);
    P.add(tone, bx(w, h, 0.11, lx, h / 2, lz, { rz: lean, ry: yaw }));
    // a rounded head reads at distance; a plain rectangle reads as a board
    P.add(tone, cyl(w / 2, w / 2, 0.11, lx, h, lz, { seg: 7, rx: Math.PI / 2, ry: yaw }));
    if (r.chance(0.45)) P.add(M.moss, bx(w * 0.9, 0.12, 0.03, lx, 0.07, lz + 0.06, { ry: yaw }));
    if (r.chance(0.3)) P.add(M.turf, bx(w + 0.5, 0.05, 0.7, lx, 0.025, lz - 0.34, { ry: yaw }));
  }
  P.flush(g);
  return tagProp(g, 'headstones', { footprint: null });
}

/**
 * THE LYCH-GATE.  Two ashlar piers, a coffin stone along each inner
 * cheek, and a shingled gable over.  It is the churchyard's gate and the
 * district's chokepoint, so the CLEAR OPENING is arithmetic: 2.0 m
 * between the pier faces is 1.32 m of walkable ground once the player's
 * 0.34 m radius is added to both, which the route fill can stride and a
 * wave has to file through.
 *
 * `pier()` registers its own collider; the roof and the coffin stones
 * carry none — a roof 2.4 m up is not a wall, and a bench you cannot
 * walk round is a bollard in a gateway.
 */
function buildLychGate(ctx) {
  const g = new THREE.Group();
  const P = parts();
  const gy = ctx.groundAt(GATE_X, WALL_Z);
  const PW = 0.72;
  const PD = 1.05;
  const PH = 2.15;
  for (const s of [-1, 1]) {
    const px = GATE_X + s * (GATE_HALF + PW / 2);
    ctx.add(pier({
      w: PW, d: PD, h: PH, at: [px, gy, WALL_Z], mat: M.granite, capMat: M.coping, ctx,
    }), `lych-pier-${s > 0 ? 'e' : 'w'}`);
    // the coffin stone: one slab on two stubs, inside the gate
    P.add(M.graniteDark, bx(0.2, 0.42, 0.2, px, gy + 0.21, WALL_Z - 0.34));
    P.add(M.graniteDark, bx(0.2, 0.42, 0.2, px, gy + 0.21, WALL_Z + 0.34));
    P.add(M.coping, bx(0.5, 0.14, 1.15, px, gy + 0.49, WALL_Z));
  }
  /* the roof: a real gable on two purlins and four rafters, its ridge
   * along the wall so you walk UNDER the pitch, not into it */
  const eaveY = gy + PH + 0.32;
  const span = 1.6;
  const rise = 0.86;
  const wide = 2 * (GATE_HALF + PW) + 0.9;
  const slope = Math.atan2(rise, span);
  P.add(M.oakDark, bx(wide, 0.16, 0.16, GATE_X, eaveY - 0.08, WALL_Z - 1.05));
  P.add(M.oakDark, bx(wide, 0.16, 0.16, GATE_X, eaveY - 0.08, WALL_Z + 1.05));
  P.add(M.oak, bx(wide - 0.5, 0.14, 0.14, GATE_X, eaveY + rise, WALL_Z));
  for (const s of [-1, 1]) {
    P.add(M.shingle, bx(wide, 0.1, Math.hypot(span, rise) + 0.16,
      GATE_X, eaveY + rise / 2, WALL_Z + s * span / 2, { rx: -s * slope }));
    for (const dx of [-1, -0.34, 0.34, 1]) {
      P.add(M.oakDark, bx(0.1, 0.09, Math.hypot(span, rise),
        GATE_X + dx * (wide / 2 - 0.25), eaveY + rise / 2 - 0.09, WALL_Z + s * span / 2, { rx: -s * slope }));
    }
  }
  P.add(M.shingleDark, bx(wide + 0.1, 0.13, 0.28, GATE_X, eaveY + rise + 0.09, WALL_Z));
  // braces from the pier heads into the purlins — the joint, not a guess
  for (const s of [-1, 1]) {
    for (const t of [-1, 1]) {
      P.add(M.oakDark, tubeGeo(
        [GATE_X + s * (GATE_HALF + PW / 2), gy + PH - 0.35, WALL_Z + t * 0.3],
        [GATE_X + s * (GATE_HALF + PW / 2 + 0.34), eaveY - 0.1, WALL_Z + t * 1.05], 0.06, 5));
    }
  }
  P.flush(g);
  ctx.add(g, 'lych-gate');
}

/**
 * THE WARD STONE, and the district's interaction.  A leaning standing
 * stone by the chapel porch, older than the chapel, cut with the ward's
 * glyphs.
 *
 * BOTH STATES ARE THE SAME GEOMETRY WITH ONE OF THEM HIDDEN, which is
 * the kit's own rule (a lantern that swaps a material on a mesh inside an
 * opaque one plays its relight perfectly with nothing to see) — and it is
 * also the only kind of change `check-interactions` can measure: it diffs
 * position / quaternion / scale / VISIBILITY, never materials.  So the
 * lit glyphs, the pool and the brightened tower lamps are all built in
 * BOTH states and waking the ward flips `visible`.
 */
function buildWardStone(ctx, tower) {
  const X = -33;
  const Z = -17;
  const gy = ctx.groundAt(X, Z);
  const g = new THREE.Group();
  const P = parts();
  const r = rng('ward-stone');
  const H = 1.92;
  const lean = 0.075;

  // the socket it stands in: a ring of set kerbstones, worn smooth
  for (let i = 0; i < 9; i += 1) {
    const a = (i / 9) * TAU + 0.2;
    P.add(i % 3 === 0 ? M.graniteDark : M.rubble,
      bx(r.range(0.3, 0.44), 0.17, r.range(0.24, 0.34),
        Math.cos(a) * 0.98, 0.07, Math.sin(a) * 0.98, { ry: a + r.range(-0.2, 0.2) }));
  }
  P.add(M.granite, bx(0.86, 0.2, 0.74, 0, 0.09, 0));
  // the stone: tapered, leaning, three courses of section — not a slab
  P.add(M.granite, bx(0.7, H * 0.5, 0.44, 0, 0.18 + H * 0.25, 0, { rz: lean }));
  P.add(M.granite, bx(0.6, H * 0.34, 0.38, H * 0.28 * lean, 0.18 + H * 0.67, 0, { rz: lean }));
  P.add(M.graniteWarm, bx(0.46, H * 0.2, 0.31, H * 0.42 * lean, 0.18 + H * 0.94, 0, { rz: lean }));
  P.flush(g);
  g.position.set(X, gy, Z);
  ctx.add(g, 'ward-stone');
  ctx.collide(X - 0.45, Z - 0.32, X + 0.45, Z + 0.32);

  /* THE GLYPHS, in two states.  Cut on the stone's EAST face, which the
   * sun at bearing 268 never touches: a cool emissive on a face still
   * carrying amber is a smudge.  Built OUTWARD (0.02 proud of the shaft)
   * — you cannot carve a recess into a box. */
  const litMat = glowing(ACCENT.wardGlow, PAL.tealGlow, 0.95);
  /* AN INSCRIPTION, NOT FOUR BARS.  The first cut ran one 0.5-0.6 m mark
   * per line and lit up as four flat rectangles — which reads as a
   * lightbox, not as something cut into stone eight hundred years ago.
   * Two or three short marks a line with a vertical stroke through one of
   * them is the same mesh count and reads as writing at four metres,
   * which is the range the player is at when they press E. */
  const LINES = [
    [0.42, [[-0.20, 0.15], [0.02, 0.09], [0.18, 0.13]], 0.02],
    [0.76, [[-0.22, 0.11], [-0.02, 0.20]], -0.02],
    [1.08, [[-0.16, 0.19], [0.10, 0.10]], 0.10],
    [1.38, [[-0.10, 0.13], [0.08, 0.08]], -0.10],
  ];
  const glyphAt = (mat, dx) => {
    const q = new THREE.Group();
    const Q = parts();
    for (const [y, marks, tick] of LINES) {
      const px = 0.34 + y * lean + dx;
      for (const [u, w] of marks) Q.add(mat, bx(0.04, 0.075, w, px, 0.18 + y, u));
      Q.add(mat, bx(0.04, 0.2, 0.05, px, 0.18 + y + 0.03, tick));
    }
    Q.flush(q, { cast: false, receive: false });
    return q;
  };
  const dark = glyphAt(M.graniteDark, 0.0);
  dark.position.set(X, gy, Z);
  ctx.add(dark, 'ward-glyphs-dark');
  const lit = glyphAt(litMat, 0.006);
  lit.position.set(X, gy, Z);
  lit.visible = false;
  ctx.add(lit, 'ward-glyphs-lit');

  /* the pool the woken ward throws on the flags.  A SIBLING of the stone,
   * never a child: `Box3.setFromObject` takes every descendant, and a
   * 3.8 m pool inside a 2 m stone's audit unit flags it against
   * everything within two metres. */
  /* SMALLER AND BRIGHTER.  At r 1.9 in `ACCENT.wardGlow` the pool came out
   * as a flat green disc on the turf and read as a patch of lawn: the same
   * mistake as a pale dash on water reading as road paint.  A pool is
   * LIGHT — small, and the pale end of the family. */
  const pool = lightPool({ r: 1.35, y: 0.02, opacity: 0.4 });
  pool.material.color.setHex(PAL.tealGlow);
  pool.position.set(X, gy + 0.02, Z);
  pool.visible = false;
  ctx.add(pool, 'ward-pool');

  let awake = false;
  const set = (on) => {
    awake = on;
    lit.visible = on;
    dark.visible = !on;
    pool.visible = on;
    for (const t of tower.wardLamps) t.visible = on;
    for (const t of tower.wardDim) t.visible = !on;
  };
  ctx.reset(() => set(false));

  interactive(ctx, {
    name: 'the ward stone',
    label: 'E · wake the ward stone',
    at: [X, gy + 1.1, Z],
    size: [1.6, 2.4, 1.6],
    action: () => set(!awake),
  });
}

/* ==================================================================== *
 * THE CHAPEL'S FITTINGS — local, pooled, and each tagged so
 * `countInteriorProps` sees it.  ST. WENNA'S is a chapel, so the
 * vocabulary is: an altar with its candles, a lectern, a font, a
 * standing candle-beam, a tomb chest, a banner with a DEVICE on it (no
 * saint's face — NO PEOPLE ANYWHERE), a parish chest, and pews.
 * ==================================================================== */

function chapelAltar(mats) {
  const g = new THREE.Group();
  const P = parts();
  for (let i = 0; i < 2; i += 1) {       // two steps up: an altar stands above its nave
    const f = i / 2;
    P.add(mats.stone, bx(2.0 - f * 0.5, 0.1, 1.2 - f * 0.3, 0, 0.05 + i * 0.1, 0.2 + f * 0.14));
  }
  P.add(mats.stone, bx(1.62, 0.86, 0.62, 0, 0.63, 0));
  P.add(mats.plaster, bx(1.5, 0.7, 0.5, 0, 0.6, 0.02));           // the frontal cloth
  P.add(mats.stone, bx(1.84, 0.09, 0.76, 0, 1.11, 0));            // the slab
  for (const dx of [-0.62, -0.36, 0.36, 0.62]) {
    const h = 0.2 + Math.abs(dx) * 0.22;
    P.add(mats.metal, cyl(0.045, 0.06, 0.05, dx, 1.18, -0.08, { seg: 7 }));
    P.add(mats.plaster, cyl(0.026, 0.03, h, dx, 1.2 + h / 2, -0.08, { seg: 6 }));
    P.add(mats.glow, cyl(0.014, 0.004, 0.075, dx, 1.2 + h + 0.035, -0.08, { seg: 5 }));
  }
  P.add(mats.metal, bx(0.05, 0.5, 0.05, 0, 1.4, -0.1));
  P.add(mats.metal, bx(0.26, 0.05, 0.05, 0, 1.5, -0.1));
  P.flush(g, { receive: false });
  return tagProp(g, 'altar');
}

function chapelLectern(mats) {
  const g = new THREE.Group();
  const P = parts();
  P.add(mats.timberDark, bx(0.44, 0.07, 0.44, 0, 0.035, 0));
  P.add(mats.timberDark, cyl(0.05, 0.075, 1.02, 0, 0.55, 0, { seg: 8 }));
  P.add(mats.timber, bx(0.46, 0.05, 0.34, 0, 1.08, 0.02, { rx: -0.42 }));
  P.add(mats.plaster, bx(0.36, 0.03, 0.26, 0, 1.13, 0.03, { rx: -0.42 }));
  P.add(mats.timber, bx(0.46, 0.04, 0.05, 0, 1.02, 0.16));
  P.flush(g, { receive: false });
  return tagProp(g, 'lectern');
}

function chapelFont(mats) {
  const g = new THREE.Group();
  const P = parts();
  P.add(mats.stone, cyl(0.44, 0.5, 0.14, 0, 0.07, 0, { seg: 8 }));
  P.add(mats.stone, cyl(0.19, 0.24, 0.62, 0, 0.45, 0, { seg: 8 }));
  P.add(mats.stone, cyl(0.44, 0.3, 0.34, 0, 0.93, 0, { seg: 8 }));
  P.add(mats.metal, cyl(0.36, 0.36, 0.04, 0, 1.12, 0, { seg: 8 }));
  P.add(mats.metal, cyl(0.05, 0.03, 0.12, 0, 1.19, 0, { seg: 6 }));
  P.flush(g, { receive: false });
  return tagProp(g, 'font');
}

function chapelCandleBeam(mats, seed) {
  const g = new THREE.Group();
  const P = parts();
  const r = rng(seed);
  P.add(mats.metal, bx(0.34, 0.05, 0.34, 0, 0.025, 0));
  P.add(mats.metal, cyl(0.03, 0.045, 1.14, 0, 0.6, 0, { seg: 7 }));
  P.add(mats.metal, bx(0.92, 0.04, 0.09, 0, 1.19, 0));
  /* SOME OF THEM ARE OUT.  The vigil was being lit ten minutes ago and
   * nobody finished: four alight, three cold, one fallen on the tray. */
  const lit = [1, 1, 0, 1, 0, 1, 0];
  for (let i = 0; i < 7; i += 1) {
    const x = (i / 6 - 0.5) * 0.82;
    const h = r.range(0.1, 0.24);
    P.add(mats.metal, cyl(0.02, 0.03, 0.05, x, 1.23, 0, { seg: 5 }));
    P.add(mats.plaster, cyl(0.016, 0.019, h, x, 1.26 + h / 2, 0, { seg: 5 }));
    if (lit[i]) P.add(mats.glow, cyl(0.011, 0.003, 0.06, x, 1.26 + h + 0.03, 0, { seg: 5 }));
  }
  P.add(mats.plaster, cyl(0.017, 0.017, 0.16, 0.2, 1.245, 0.06, { seg: 5, rz: Math.PI / 2 }));
  P.flush(g, { receive: false });
  return tagProp(g, 'candle-beam');
}

function chapelTombChest(mats, seed) {
  const g = new THREE.Group();
  const P = parts();
  const r = rng(seed);
  P.add(mats.stone, bx(1.7, 0.14, 0.8, 0, 0.07, 0));
  P.add(mats.stone, bx(1.5, 0.56, 0.62, 0, 0.42, 0));
  for (let i = 0; i < 4; i += 1) {                       // blind arcading, built proud
    P.add(mats.timberDark, bx(0.06, 0.4, 0.03, (i / 3 - 0.5) * 1.1, 0.44, 0.325));
  }
  P.add(mats.stone, bx(1.8, 0.13, 0.9, 0, 0.765, 0));     // the ledger
  P.add(mats.plaster, bx(1.24, 0.02, 0.52, 0, 0.837, 0)); // an incised slab, worn pale
  if (r.chance(0.9)) P.add(mats.clothWarm, bx(0.44, 0.03, 0.26, 0.4, 0.85, 0.08, { ry: 0.4 }));
  P.flush(g, { receive: false });
  return tagProp(g, 'tomb-chest');
}

/** The parish chest: iron-bound oak, three locks, lid shut. */
function chapelChest(mats, seed) {
  const g = new THREE.Group();
  const P = parts();
  const r = rng(seed);
  P.add(mats.timberDark, bx(1.16, 0.6, 0.56, 0, 0.3, 0));
  P.add(mats.timber, bx(1.18, 0.12, 0.58, 0, 0.66, 0));
  for (const dx of [-0.42, 0, 0.42]) {
    P.add(mats.metal, bx(0.07, 0.74, 0.6, dx, 0.36, 0));
    P.add(mats.metal, bx(0.1, 0.13, 0.06, dx, 0.42, 0.32));
  }
  for (const dx of [-0.6, 0.6]) P.add(mats.metal, bx(0.05, 0.62, 0.58, dx, 0.31, 0));
  if (r.chance(0.8)) P.add(mats.cloth, bx(0.4, 0.05, 0.3, -0.2, 0.745, 0.06, { ry: 0.3 }));
  P.flush(g, { receive: false });
  return tagProp(g, 'parish-chest');
}

/**
 * A hanging BANNER with a device on it.  NO PEOPLE, EVER — including in
 * a saint's banner, which is why St. Wenna's carries her attribute (a
 * well and three drops) drawn as geometry and not a figure.
 */
function chapelBanner(mats, seed) {
  const g = new THREE.Group();
  const P = parts();
  const r = rng(seed);
  const W = 0.78;
  const H = 1.4;
  P.add(mats.timberDark, cyl(0.024, 0.024, W + 0.24, 0, 0, 0, { seg: 6, rz: Math.PI / 2 }));
  for (const s of [-1, 1]) {
    P.add(mats.metal, cyl(0.035, 0.02, 0.05, s * (W / 2 + 0.14), 0, 0, { seg: 6, rz: Math.PI / 2 }));
  }
  // the cloth in four folds, each a shade different — a flat card is a card
  for (let i = 0; i < 4; i += 1) {
    const x = (i / 3 - 0.5) * (W - W / 4);
    P.add(i % 2 ? mats.cloth : mats.clothWarm,
      bx(W / 4 + 0.01, H, 0.02, x, -H / 2 - 0.02, r.range(-0.012, 0.012)));
  }
  // the device: a well-head ring and three drops, in the chapel's own stone
  P.add(mats.stone, cyl(0.15, 0.15, 0.018, 0, -0.52, 0.02, { seg: 9, rx: Math.PI / 2 }));
  P.add(mats.plaster, cyl(0.1, 0.1, 0.022, 0, -0.52, 0.024, { seg: 9, rx: Math.PI / 2 }));
  for (const dx of [-0.16, 0, 0.16]) {
    P.add(mats.stone, cyl(0.032, 0.012, 0.02, dx, -0.86, 0.024, { seg: 6, rx: Math.PI / 2 }));
  }
  P.flush(g, { cast: false, receive: false });
  return tagProp(g, 'banner', { airborne: true });
}

/* ==================================================================== *
 * 1.  THE TOWN WALL — the curtain, the corner tower, the stair head
 * ==================================================================== */

function buildWall(ctx, plan) {
  /* Both runs stop 1.8 m short of the corner so the NW tower makes the
   * turn.  A drum centred on (-50, -50) is a collider across the only
   * place the walk turns; SIEGE.md's geometry pushes it out along the
   * diagonal, where it touches the outer corner, reads as a tower ON the
   * corner from every angle, and leaves the walk behind it. */
  /* INTEGRATION: the plan's `o3-relight-wall` point at (-50.4, -30) — the game
   * lights "braziers with setLit within 3 m" of it (src/game/INTERFACES.md)
   * and no district had put one there.  Built UNLIT against the outer
   * parapet, no collider (keephill's walk-brazier call: the walk's free band
   * is 1.71 m and a boxed brazier would wall it), so the point stays
   * standable and the relight beat has something to light. */
  {
    const rb = brazier({ seed: 'cc-relight-brazier', r: 0.36, h: 0.66, lit: false, ctx });
    rb.position.set(-50.4, 5.0, -30);
    ctx.add(rb, 'relight-brazier');
  }

  curtainWall({
    from: -50.6, to: -18, side: 'n', ctx, plan,
    endCaps: ['tower', 'none'], seed: 'cc-curtain-n', name: 'curtain-north',
  });
  curtainWall({
    from: -50.6, to: -12, side: 'w', ctx, plan,
    endCaps: ['tower', 'none'], seed: 'cc-curtain-w', name: 'curtain-west',
  });

  const nw = roundTower({
    seed: 'nw-tower', r: 1.9, h: 8.6, taper: 0.1, crook: 0.5, seg: 12,
    wall: 'granite', bands: 3, cap: 'cone', capH: 2.4, corbel: true,
    machicolation: true, door: null,
    windows: [
      { y: 3.2, a: 0.78, w: 0.34, h: 0.68 },
      { y: 5.6, a: 2.36, w: 0.34, h: 0.68 },
      { y: 6.6, a: 0.78, w: 0.34, h: 0.68 },
    ],
  });
  place(ctx, nw, { x: -52.6, z: -52.6, yaw: 0, name: 'nw-tower' });

  /* the stair head.  `landing` is the plan's own shelf and `flight` the
   * plan's own crossing, so the side that abuts the walk is DERIVED — a
   * landing exists on all four sides of this town and a hand-written side
   * is wrong on three of them. */
  /* the 3 x 3 shelf, picked by SHAPE and not by index: the west run is
   * also 2.4 m wide, so `x1 - x0 < 6` finds the wall-walk instead and
   * `stairTurret` throws that it is not a stair head. */
  const landing = plan.terrain.shelves.find((s) => s.in === 'chapelclose'
    && s.x1 - s.x0 <= 3.5 && s.z1 - s.z0 <= 3.5);
  const flight = plan.terrain.crossings.find((c) => c.id === 'close-wall-stair');
  stairTurret({ landing, flight, ctx, plan, seed: 'cc-turret', name: 'stair-turret' });

  /* two wall torches on the inner face of the north curtain, UNLIT: the
   * town's practicals are the second light source and the relight beat
   * belongs to the game layer.  Origin ON the wall face projecting +Z,
   * which on this face means facing +z, south into the close. */
  for (const x of [-38.5, -26.5]) {
    const t = wallTorch({ seed: `cc-wall-torch-${x}`, lit: false, groundDrop: -3.4 });
    mount(ctx, t, x, 3.4, -48.28, 0, `wall-torch-${Math.round(-x)}`);
  }
}

/* ==================================================================== *
 * 2.  THE CHURCHYARD WALL AND THE LYCH-GATE
 * ==================================================================== */

function buildBoundary(ctx) {
  const stone = M.granite;
  const cap = M.coping;
  const H = 1.05;
  const T = 0.4;

  /* SOUTH RUN, in two lengths with the lych-gate between them.  Its far
   * inflated edge is z = -15.26, outside the cc-s-lane corridor's first
   * slice at -14.875 — the seam gate measures 3 m into my side and this
   * is the number that keeps that socket's 3.2 m open. */
  ctx.add(wallRun({
    points: [[-48.4, WALL_Z], [GATE_X - GATE_HALF - 1.4, WALL_Z]],
    h: H, thick: T, piers: 5.4, mat: stone, copingMat: cap, ctx,
  }), 'churchyard-wall-sw');
  ctx.add(wallRun({
    points: [[GATE_X + GATE_HALF + 1.4, WALL_Z], [-21.9, WALL_Z]],
    h: H, thick: T, piers: 4.2, mat: stone, copingMat: cap, ctx,
  }), 'churchyard-wall-se');

  /* EAST RUN, broken for the lane in from the keep.  Its far inflated
   * edge is x = -21.06, outside cc-lane-e's first slice at -20.875.  The
   * break is 3.7 m — deliberately the WIDE entrance, because wave 5
   * arrives through it and a wave needs a lane, not a wicket. */
  ctx.add(wallRun({
    points: [[WALL_X, WALL_Z - 0.5], [WALL_X, -28.25]],
    h: H, thick: T, piers: 4.6, mat: stone, copingMat: cap, ctx,
  }), 'churchyard-wall-en');
  ctx.add(wallRun({
    points: [[WALL_X, -31.95], [WALL_X, -42.0]],
    h: H, thick: T, piers: 4.8, mat: stone, copingMat: cap, ctx,
  }), 'churchyard-wall-es');

  buildLychGate(ctx);

  const gy = ctx.groundAt(GATE_X, WALL_Z);
  put(ctx, torch({ seed: 'lych-lamp', h: 2.35, lit: true, post: true }),
    GATE_X - GATE_HALF - 1.5, WALL_Z + 0.7, 0, 'lych-lamp');

  /* ST WENNA'S painted on the gate's west pier, and the two notices the
   * parish actually has: the bell times and a lost dog.  NO PEOPLE — the
   * lost thing is a DOG, drawn, and that is a rule not an omission. */
  mount(ctx, paintedName({ title: "ST. WENNA'S", w: 1.0, h: 0.32, seed: 'wenna-plate' }),
    GATE_X - GATE_HALF - 0.72, gy + 1.6, WALL_Z + 0.53, 0, 'chapel-name');

  put(ctx, noticeBoardStand({
    notices: ['bells', 'lostdog'], w: 0.62, h: 0.46, postH: 1.55,
    seed: 'close-notices', accent: JOINERY.oakStain,
  }), -27.4, WALL_Z + 1.0, Math.PI, 'notice-board');

  /* the fingerpost where the route in from the mill meets the wall.  The
   * terminus of that sight line is this corner, and a corner with a post,
   * a bench and a yew over it is composed; bare wall is not. */
  put(ctx, fingerpost({
    arms: [
      { text: 'ST WENNA’S', sub: 'THE CLOSE', dir: 1 },
      { text: 'THE MILL', sub: 'MILL REACH', dir: -1 },
    ],
    postH: 2.3, w: 1.05, h: 0.24, seed: 'close-fingerpost',
  }), -35.4, WALL_Z + 1.6, 0, 'fingerpost');

  ctx.add(bench({
    w: 1.7, at: [-33.4, ctx.groundAt(-33.4, WALL_Z + 1.0), WALL_Z + 1.0],
    facing: [0, 1], mat: M.oakSilver, ctx,
  }), 'wall-bench');
}

/* ==================================================================== *
 * 3.  ST WENNA'S — the enterable chapel, and the town's shelter here
 * ==================================================================== */

function buildChapel(ctx) {
  const gy = ctx.groundAt(CH.x, CH.z);

  /* THE SHELL.  Door 1.6 m clear on the SOUTH face, which is the face the
   * arena is on — a fleeing townsman's run has to be visible.  1.6 m
   * leaves 0.92 m of walkable ground once the player's radius is on both
   * jambs, comfortably over the fill's 0.35 m stride.
   *
   * THE FLOOR STAYS NEAR ZERO ON PURPOSE.  The plan's interior camera is
   * at y 1.55 and its subject at 0.9; both are a standing eye only if the
   * floor is at datum.  So the chapel gets its mass from a plinth COURSE
   * built outward rather than from a raised platform. */
  const shell = hollowShell({
    w: CH.w, d: CH.d, h: CH.h, at: [CH.x, CH.z], groundY: gy,
    wallT: CH.wallT, floorRise: 0.12, floorT: 0.16, ceilH: 3.3, ceilT: 0.14,
    door: { face: 'z+', offset: 0, width: 1.6, height: 2.3 },
    windows: [
      { face: 'x-', offset: -1.3, width: 0.7, height: 1.5, sill: 1.25 },
      { face: 'x-', offset: 1.3, width: 0.7, height: 1.5, sill: 1.25 },
      { face: 'x+', offset: -1.3, width: 0.7, height: 1.5, sill: 1.25 },
      { face: 'x+', offset: 1.3, width: 0.7, height: 1.5, sill: 1.25 },
      { face: 'z-', offset: 0, width: 1.0, height: 1.7, sill: 1.15 },
    ],
    mats: { wall: M.granite, inner: M.limewashPale, floor: M.pavingDark, ceiling: M.oakDark },
    ctx, name: 'chapel',
  });
  ctx.add(shell.group, 'chapel-shell');

  const wallTop = shell.wallTopY;
  const roof = gableRoof({
    w: CH.w, d: CH.d, pitch: 0.60, overhang: 0.42, thickness: 0.14,
    ridgeAxis: 'x', mat: M.shingleMoss, ridgeMat: M.lead, trimMat: M.oakDark,
  });
  roof.position.set(CH.x, wallTop, CH.z);
  ctx.add(roof, 'chapel-roof');
  const ridgeY = wallTop + roof.userData.ridgeY;   // 6.02 — the contract, see note 4

  /* everything else on the chapel is one pooled group */
  const g = new THREE.Group();
  const P = parts();
  const X0 = CH.x - CH.w / 2;
  const X1 = CH.x + CH.w / 2;
  const Z0 = CH.z - CH.d / 2;
  const Z1 = CH.z + CH.d / 2;

  /* the plinth course — geometry, NOT a platform, and a RING and not a
   * box.  Written as one solid slab across the footprint it is 0.30 m of
   * granite standing INSIDE the room, and every fitting in the chapel is
   * then reported buried 0.26 m under it while rendering perfectly. */
  const PL = 0.2;                                   // how far it stands proud
  for (const s0 of [-1, 1]) {
    P.add(M.graniteDark, bx(CH.w + PL * 2, 0.3, PL, CH.x, gy + 0.15, CH.z + s0 * (CH.d / 2 + PL / 2)));
    P.add(M.coping, bx(CH.w + PL * 2 + 0.06, 0.08, PL + 0.06, CH.x, gy + 0.34, CH.z + s0 * (CH.d / 2 + PL / 2)));
    P.add(M.graniteDark, bx(PL, 0.3, CH.d, CH.x + s0 * (CH.w / 2 + PL / 2), gy + 0.15, CH.z));
    P.add(M.coping, bx(PL + 0.06, 0.08, CH.d, CH.x + s0 * (CH.w / 2 + PL / 2), gy + 0.34, CH.z));
  }

  /* buttresses in two stages on the flanks and the east angles.  A stone
   * box with nothing on it is a stone box, and these are what make it a
   * chapel and not a shed. */
  const butt = (px, pz, along) => {
    const w = along === 'z' ? 0.5 : 0.74;
    const d = along === 'z' ? 0.74 : 0.5;
    P.add(M.granite, bx(w, 2.5, d, px, gy + 1.25, pz));
    P.add(M.coping, bx(w + 0.1, 0.11, d + 0.1, px, gy + 2.56, pz));
    P.add(M.granite, bx(w - 0.16, 0.95, d - 0.16, px, gy + 3.1, pz));
    P.add(M.coping, bx(w - 0.04, 0.1, d - 0.04, px, gy + 3.62, pz));
  };
  for (const z of [CH.z - 1.55, CH.z + 1.55]) {
    butt(X0 - 0.3, z, 'z');
    butt(X1 + 0.3, z, 'z');
  }
  butt(X0 + 1.1, Z0 - 0.3, 'x');
  butt(X1 - 1.1, Z0 - 0.3, 'x');

  /* THE PORCH.  0.9 m of projection and no more: the lych-gate stands
   * 3.4 m away and the plan's chapel-door waypoint is at (-30, -17.5),
   * which has to stay open ground once every collider here is inflated by
   * 0.34 m a side.  Measured band between them: 1.7 m. */
  const PW = 2.7;
  const PD = 0.9;
  const pz = Z1 + PD / 2;
  /* TWO CHEEKS AND A HEAD, AND NOTHING ACROSS THE OPENING.  The first cut
   * put a 1.72 x 2.2 m limewash lining on the wall face at Z1 + 0.03 "to
   * line the porch": that is 0.03 m IN FRONT of the doorway, so the door,
   * the leaf and the whole lit interior were behind a flat pale panel and
   * the frame from the lych-gate came back as a blank rectangle in a stone
   * surround.  It renders perfectly and nothing reports it.  Same family as
   * the library plate behind its own reveal — depth is built outward, and
   * an opening is left OPEN. */
  for (const s of [-1, 1]) {
    P.add(M.granite, bx((PW - 1.7) / 2, 2.55, PD, CH.x + s * (PW / 2 - (PW - 1.7) / 4), gy + 1.275, pz));
  }
  P.add(M.granite, bx(PW, 0.5, PD, CH.x, gy + 2.3, pz));
  // the tympanum: limewash ABOVE the door head (0.12 + 2.3 = 2.42), never over it
  P.add(M.limewashPale, bx(1.7, 0.34, 0.05, CH.x, gy + 2.59, Z1 + 0.03));
  for (let i = 0; i < 5; i += 1) {                 // the arch ring, built proud
    const f = -0.5 + i / 4;
    P.add(M.coping, bx(0.42, 0.2, 0.16, CH.x + f * 1.7, gy + 2.03 + (0.25 - f * f) * 0.34,
      Z1 + PD + 0.04, { rz: -f * 0.62 }));
  }
  {                                                 // the porch's own gable
    const eave = gy + 2.62;
    const span = PD + 0.24;
    const rise = 0.72;
    const slope = Math.atan2(rise, span);
    P.add(M.shingleMoss, bx(PW + 0.5, 0.1, Math.hypot(span, rise) + 0.1,
      CH.x, eave + rise / 2, Z1 + span / 2 + 0.04, { rx: -slope }));
    P.add(M.oakDark, bx(PW + 0.54, 0.12, 0.12, CH.x, eave - 0.04, Z1 + span + 0.06));
    P.add(M.granite, bx(PW, rise + 0.14, 0.18, CH.x, eave + rise / 2, Z1 + 0.06));
  }
  P.add(M.coping, bx(1.9, 0.13, 0.5, CH.x, gy + 0.065, Z1 + PD + 0.2));   // the worn step

  /* THE BELLCOTE, on the WEST gable — the lit elevation at bearing 268,
   * and 7.1 m clear of the market-sees-tower corridor's edge.  Tops out
   * at 7.4 m against the corridor's 9.0 m floor. */
  {
    const bxs = X0 + 0.02;
    const base = wallTop + 0.1;
    P.add(M.granite, bx(0.7, 1.5, 1.5, bxs - 0.16, base + 0.75, CH.z));
    P.add(M.granite, bx(0.62, 0.22, 1.9, bxs - 0.2, base + 1.6, CH.z));
    for (const s of [-1, 1]) P.add(M.granite, bx(0.5, 1.05, 0.34, bxs - 0.24, base + 2.2, CH.z + s * 0.6));
    P.add(M.coping, bx(0.62, 0.14, 1.7, bxs - 0.24, base + 2.78, CH.z));
    for (const s of [-1, 1]) {
      P.add(M.shingleDark, bx(0.66, 0.1, 1.06, bxs - 0.24, base + 3.1, CH.z + s * 0.44, { rx: s * 0.62 }));
    }
    // the bell, hung on a real axle in the opening
    P.add(M.ironDark, cyl(0.035, 0.035, 1.0, bxs - 0.24, base + 2.6, CH.z, { seg: 6, rx: Math.PI / 2 }));
    P.add(M.brass, cyl(0.16, 0.3, 0.42, bxs - 0.24, base + 2.32, CH.z, { seg: 10, open: true }));
    P.add(M.brass, cyl(0.06, 0.06, 0.1, bxs - 0.24, base + 2.56, CH.z, { seg: 6 }));
    P.add(M.ironDark, cyl(0.03, 0.05, 0.2, bxs - 0.24, base + 2.14, CH.z, { seg: 5 }));
  }

  /* ---- THE GLAZING, and it is not decoration -------------------------
   * `hollowShell` cuts a real HOLE for every window and builds no glass:
   * the openings are apertures with a collider across them and nothing
   * else.  So the chapel's north window was a 1.15 x 1.85 m hole straight
   * through the building, and the frame taken from the doorway — the
   * money shot, the glimpse down the nave at the altar — came back with
   * the ALMSHOUSE'S LIT WINDOWS hanging on the far wall twenty-five
   * metres away, reading as a small framed picture over the altar.  A
   * raycast at that pixel named it in one call; three guesses before it
   * were all wrong.
   *
   * The panes are read off `shell.openings` rather than re-derived from
   * the same numbers by hand, so the glass and the hole cannot drift
   * apart.  Warm, because the vigil is being lit inside and every lit
   * thing in this town that is not the ward is candle-warm; the tracery
   * stands PROUD on both faces, because you cannot carve a recess into a
   * box and this one is seen from inside as well as out. */
  const WT = CH.wallT;
  GLASS = chapelGlass();
  for (const o of shell.openings) {
    if (o.isDoor) continue;
    /* `u` runs ALONG the wall and `v` ACROSS it, exactly the way the siege
     * kit's own wall frame does — writing the four faces out by hand is
     * how one of them ends up mirrored. */
    const alongX = o.axis === 'x';
    const c0 = o.face === 'z-' ? Z0 : o.face === 'z+' ? Z1 - WT : o.face === 'x-' ? X0 : X1 - WT;
    const cMid = c0 + WT / 2;
    const outward = (o.face === 'z+' || o.face === 'x+') ? 1 : -1;
    const u = (o.o0 + o.o1) / 2;
    const w = o.o1 - o.o0;
    const h = o.headY - o.sillY;
    const yMid = (o.sillY + o.headY) / 2;
    const box = (mat, du, dh, dv, uu, yy, vv) => P.add(mat,
      alongX ? bx(du, dh, dv, uu, yy, vv) : bx(dv, dh, du, vv, yy, uu));
    /* the pane, on the wall's own centre line: coplanar with neither face.
     * `litGlass()` and NOT `M.lit`: `M.lit` is flat full-strength warm
     * emissive — the material a candle flame is made of — and a 1.15 x
     * 1.85 m sheet of it is a glowing orange billboard that is the
     * loudest object in the district from both sides of the wall — and
     * `litGlass()` is the same material under another name.  What a
     * candle-lit window wants is a PALE base with a low emissive: it keeps
     * the facet shading, reads as glazing rather than as fire, and is
     * still warm from the close at dusk.  Same trick the interior's own
     * hearth stone uses, and the same lesson as the vending machine's
     * can: choosing a colour does not help when the surface is emitting. */
    box(GLASS, w - 0.06, h - 0.06, 0.05, u, yMid, cMid);
    box(M.ironDark, w, 0.06, 0.08, u, o.sillY + 0.03, cMid);
    box(M.ironDark, w, 0.06, 0.08, u, o.headY - 0.03, cMid);
    // tracery, standing PROUD on BOTH faces — this window is seen from
    // inside the chapel as well as from the close
    for (const side of [-1, 1]) {
      const v = cMid + side * (WT / 2 + 0.025);
      for (const f of [-0.24, 0.24]) box(M.graniteDark, 0.07, h - 0.02, 0.05, u + f * w, yMid, v);
      box(M.graniteDark, w - 0.02, 0.06, 0.05, u, yMid + h * 0.2, v);
    }
    // the sill and the hood mould, on the OUTSIDE only
    const vOut = cMid + outward * (WT / 2 + 0.09);
    box(M.coping, w + 0.36, 0.11, 0.26, u, o.sillY - 0.07, vOut);
    box(M.coping, w + 0.42, 0.13, 0.22, u, o.headY + 0.12, vOut);
  }

  /* the west gable's louvre.  Without it that elevation — the one the
   * bearing-268 sun actually lights, and therefore the one the district
   * is read by — is 7 m of blank ashlar under a bellcote.  Built OUTWARD:
   * a surround proud of the wall, the louvre boards proud of that. */
  {
    const gx = X0 - 0.02;
    const vy = wallTop + 0.55;
    P.add(M.coping, bx(0.16, 1.0, 0.86, gx - 0.08, vy, CH.z));
    P.add(M.ironDark, bx(0.06, 0.8, 0.66, gx - 0.14, vy, CH.z));
    for (let i = 0; i < 4; i += 1) {
      P.add(M.oakDark, bx(0.1, 0.09, 0.62, gx - 0.2, vy - 0.3 + i * 0.2, CH.z, { rx: 0.34 }));
    }
  }

  /* the north window's hood mould and the gable cross — the terminating
   * detail on the elevation the lane in from the keep looks at */
  P.add(M.coping, bx(1.6, 0.12, 0.16, CH.x, gy + 3.25, Z0 - 0.07));
  P.add(M.coping, bx(0.16, 0.55, 0.16, CH.x, ridgeY + 0.4, Z0 - 0.02));
  P.add(M.coping, bx(0.44, 0.14, 0.16, CH.x, ridgeY + 0.5, Z0 - 0.02));

  P.flush(g);
  ctx.add(g, 'chapel-fabric');

  /* THE DOOR, STANDING OPEN.  The wizard's door is open and so is this
   * one — the vigil is being lit and the town is being got behind doors.
   * NO COLLIDER, ever: the doorway gap IS the route. */
  ctx.add(makeDoorLeaf({
    doorway: shell.doorway, hinge: 'left', mat: painted(JOINERY.oakStain),
    ironMat: M.ironDark, ctx, open: true, name: 'chapel-door',
    label: 'E · the chapel door',
  }), 'chapel-door');

  buildChapelInterior(ctx, shell);
  return { shell, ridgeY };
}

function buildChapelInterior(ctx, shell) {
  const mats = interiorMats();
  const R = shell.room;
  const F = shell.floorTopY;
  const room = new THREE.Group();

  const at = (obj, x, z, ry = 0) => {
    obj.position.set(x, F, z);
    obj.rotation.y = ry;
    room.add(obj);
    return obj;
  };

  /* the altar at the EAST end (−z), which is where an altar is, and which
   * is what the plan's interior camera is aimed at.  Named `chapel-altar`
   * because the camera contract addresses it by that exact name — a GROUP
   * name is not rewritten by composeCity, only anonymous meshes are. */
  const altar = chapelAltar(mats);
  altar.name = 'chapel-altar';
  at(altar, -30.0, -23.7, Math.PI);

  /* ONE RANK OF PEWS, on the east, with the fittings down the west wall.
   * The room is 6.6 x 5.0 and the chancel takes 1.4 m of it; two ranks
   * with a 1.4 m aisle leaves nothing for the font, the beam, the tomb
   * and the chest but the corners, and every one of them then reports an
   * OVERLAP against a pew.  One rank gives a 2.5 m aisle, which is also
   * what a chapel with a coffin to carry down it actually needs. */
  for (const [pz, ry] of [[-20.9, 0], [-21.9, 0.03], [-22.9, -0.05]]) {
    at(benchSeat({ w: 1.5, h: 0.44, d: 0.36, seed: `pew-${pz}`, mats }), -28.6, pz, ry);
  }

  at(chapelFont(mats), -31.9, -20.15, 0);
  at(chapelCandleBeam(mats, 'vigil-beam'), -32.4, -21.3, 0.16);
  at(chapelTombChest(mats, 'chapel-tomb'), -32.35, -22.9, Math.PI / 2);
  at(chapelLectern(mats), -28.4, -23.5, -0.5);
  at(chapelChest(mats, 'parish-chest'), -27.35, -23.9, -Math.PI / 2);

  // the banner hangs off the east wall, clear of the glass and of the pews
  const banner = chapelBanner(mats, 'wenna-banner');
  banner.position.set(-26.76, F + 2.55, -21.9);
  banner.rotation.y = -Math.PI / 2;
  room.add(banner);

  /* the pools.  A candle is a bright dot in a dark room until something
   * on the floor says it is a light; these are what make the glimpse
   * through the doorway read as lamplight rather than as daylight. */
  const p1 = roomPool({ r: 2.0, y: F + 0.02, opacity: 0.5 });
  p1.position.set(-30.0, F + 0.02, -23.6);
  room.add(p1);
  const p2 = roomPool({ r: 1.5, y: F + 0.02, opacity: 0.42 });
  p2.position.set(-32.2, F + 0.02, -21.3);
  room.add(p2);
  const halo = glowCard({ w: 1.6, h: 0.85, ember: false, opacity: 0.4 });
  halo.position.set(-30.0, F + 1.4, -23.4);
  room.add(halo);

  ctx.add(room, 'chapel-interior');
  registerInterior(ctx, room, { door: shell.doorway, name: 'chapel-interior' });
}

/* ==================================================================== *
 * 4.  THE BURIAL TERRACE AND THE WIZARD'S TOWER
 * ==================================================================== */

function buildTerrace(ctx) {
  /* ---- THE ONE MADE SURFACE, and I am saying so out loud -------------
   * composeCity warns at 30 m² and this is 91.  It is NOT a district
   * plate stopping at an envelope with nobody owning what lies beyond it,
   * which is the defect that warning exists for: it is a retained burial
   * terrace against the town wall, bounded on all four sides by things
   * this district owns (the two curtain scarps and its own revetment),
   * and it is the arena's high ground.  The plan puts the wall-walk
   * OUTSIDE the arena rect, so without this the close has no elevation
   * in it at all. */
  ctx.platform(TER.x0, TER.z0, TER.x1, TER.z1, TER.y);

  const g = new THREE.Group();
  const P = parts();

  /* THE SURFACE ITSELF.  A `ctx.platform` is a promise about `groundAt`
   * and nothing else: registered without geometry under it the seam grid
   * casts down, finds the terrain at y 0 and reports 126 samples of
   * walkable-height-with-no-surface.  The fill is one solid mass of turf
   * from just under datum to the terrace top, which is what a made
   * terrace is. */
  P.add(M.turf, bx(TER.x1 - TER.x0, TER.y + 0.1, TER.z1 - TER.z0,
    (TER.x0 + TER.x1) / 2, (TER.y - 0.1) / 2, (TER.z0 + TER.z1) / 2, { seg: 6 }));

  /* the revetment on the free faces, battered, coursed and coped.  NO
   * COLLIDER: 0.55 m is already over the walker's 0.38 m step so it
   * cannot be climbed, and it can be stepped down anywhere — which is the
   * "way down that is not the way up" the vocabulary asks of high ground. */
  const face = (x0, z0, x1, z1) => {
    const alongX = (x1 - x0) > (z1 - z0);
    const len = alongX ? x1 - x0 : z1 - z0;
    const n = Math.max(1, Math.round(len / 2.4));
    for (let i = 0; i < n; i += 1) {
      const t = (i + 0.5) / n;
      const cx = alongX ? x0 + t * len : (x0 + x1) / 2;
      const cz = alongX ? (z0 + z1) / 2 : z0 + t * len;
      const dl = len / n + 0.02;
      const tone = i % 3 === 1 ? M.graniteWarm : M.granite;
      P.add(tone, alongX ? bx(dl, TER.y + 0.16, 0.44, cx, (TER.y - 0.08) / 2, cz)
        : bx(0.44, TER.y + 0.16, dl, cx, (TER.y - 0.08) / 2, cz));
      P.add(M.rubble, alongX ? bx(dl, 0.22, 0.62, cx, 0.11, cz)
        : bx(0.62, 0.22, dl, cx, 0.11, cz));
    }
    P.add(M.coping, alongX ? bx(len + 0.1, 0.12, 0.56, (x0 + x1) / 2, TER.y - 0.02, (z0 + z1) / 2)
      : bx(0.56, 0.12, len + 0.1, (x0 + x1) / 2, TER.y - 0.02, (z0 + z1) / 2));
  };
  face(TER.x0, TER.z1 - 0.22, -43.7, TER.z1 + 0.22);      // south, west of the flight
  face(-41.3, TER.z1 - 0.22, TER.x1, TER.z1 + 0.22);      // south, east of it
  face(TER.x1 - 0.22, TER.z0, TER.x1 + 0.22, TER.z1 - 0.2); // east
  face(TER.x0, TER.z0 - 0.22, -46.6, TER.z0 + 0.22);      // north, west of the flight
  face(-44.4, TER.z0 - 0.22, TER.x1, TER.z0 + 0.22);      // north, east of it
  P.flush(g);
  ctx.add(g, 'terrace-revetment');

  /* the two flights, twelve metres apart: the wizard's own off the south
   * face by his door, and the sexton's off the north face where the wall
   * stair lands.  `stairs` registers one platform per tread; a 0.5 m
   * going clears the route gate's 0.35 m stride twice over. */
  /* `stairs` RETURNS a mesh and only REGISTERS the platforms — the `ctx`
   * argument is not an `add`.  Called without one the flight is walkable,
   * `groundAt` answers 0.555 over it, and there is no geometry there at
   * all: the seam grid casts down through the treads onto the terrain and
   * reports walkable-height-with-no-surface.  Nothing renders it as a
   * missing staircase; the frame just shows a gap in the revetment. */
  ctx.add(stairs({
    w: 2.0, rise: 0.185, run: 0.5, steps: 3, dir: 'z-',
    at: [-42.5, 0, TER.z1 + 1.5], mat: M.granite, ctx,
  }), 'terrace-steps-s');
  ctx.add(stairs({
    w: 1.8, rise: 0.185, run: 0.5, steps: 3, dir: 'z+',
    at: [-45.5, 0, TER.z0 - 1.5], mat: M.granite, ctx,
  }), 'terrace-steps-n');
}

function buildTower(ctx) {
  const teal = PAL.tealGlow;
  const A = TOWER_DOOR_A;

  /* THE WIZARD'S TOWER.  Named `wizard-tower` because the plan's landmark
   * contract and the `the-close` vista both address it by that exact
   * name.  It stands at (-44, -40) on the terrace, at `along` 59.4 m of
   * the market-sees-tower corridor's 49.5 m — ten metres PAST its
   * terminus, so it closes the view down that corridor instead of
   * blocking it.
   *
   * THE FOUR GLOWING WINDOWS ARE ON THE QUADRANT THE TOWN LOOKS AT, and
   * that is arithmetic, not taste.  The bearing from the tower to the
   * market's well is a = atan2(44, 40) = 0.83; to the `the-close` camera
   * on the north walk it is atan2(22, -10) = 2.00.  Scattered round the
   * shaft only one of the four would ever show from either, and one teal
   * dot is not a promise of magic — so they spiral up the 0.85..2.05 arc
   * and both readers see three of the four.  This is the town's ONLY
   * strong emissive, and it is on the tower's east flank, which the
   * bearing-268 sun never touches: a cool glow on a lit wall is a smudge. */
  const tower = roundTower({
    seed: 'wizard-tower', r: TOWER.r, h: TOWER.h, taper: 0.16, crook: 1.5, seg: 14,
    wall: 'granite', bands: 4, cap: 'crooked', capH: 3.0, corbel: true, finial: true,
    /* `door: null` ON PURPOSE.  `roundTower` always draws its leaf SHUT in
     * the opening and takes no flag to leave it out, so a second leaf
     * swung back beside it reads as a spare door propped against the wall
     * — which is exactly what the first render showed.  The brief's "ten
     * minutes ago" says the wizard's door is OPEN, so the surround, the
     * reveal and the leaf are built here instead. */
    door: null,
    windows: [
      { y: 2.9, a: A + 2.1, w: 0.36, h: 0.72 },
      { y: 4.6, a: A - 1.5, w: 0.38, h: 0.8, lit: true },
      { y: 6.5, a: A + 0.9, w: 0.36, h: 0.74 },
      { y: 7.9, a: A - 2.3, w: 0.34, h: 0.7 },
      { y: 9.4, a: 0.85, w: 0.62, h: 1.14, glow: teal },
      { y: 10.6, a: 1.25, w: 0.66, h: 1.2, glow: teal },
      { y: 11.8, a: 1.65, w: 0.64, h: 1.16, glow: teal },
      { y: 12.9, a: 2.05, w: 0.6, h: 1.1, glow: teal },
    ],
  });
  place(ctx, tower, { x: TOWER.x, z: TOWER.z, yaw: 0, name: 'wizard-tower' });
  const baseY = tower.position.y;

  /* THE ACCENT BUDGET IS THE WINDOWS AND THE STONE, AND NOTHING ELSE.
   * The first cut hung two teal lamps in the tower's doorway on the
   * strength of the plan's "the tower's lamps brighten" — and the brief
   * is explicit that the cool colour goes on "the tower's upper windows,
   * the ward stone and nothing else".  Read against the earlier line
   * ("its upper windows already showing the ward-glow"), the tower's
   * lamps ARE those windows.  So the doorway gets a candle-warm bracket
   * lantern like everything else lit in this town that is not the ward,
   * and what the interaction brightens on the tower is the WARD POOL its
   * windows throw on the terrace below them — same accent, same object,
   * one more place rather than one more thing. */
  {
    const a = A - 0.5;
    const lampR = TOWER.r * (1 - 0.16 * (2.6 / TOWER.h)) - 0.02;
    const lamp = bracketLantern({ seed: 'tower-door-lamp', reach: 0.6, lit: true, groundDrop: -2.6 });
    mount(ctx, lamp,
      TOWER.x + Math.sin(a) * lampR, baseY + 2.6, TOWER.z + Math.cos(a) * lampR,
      Math.atan2(Math.sin(a), Math.cos(a)), 'tower-door-lamp');
  }

  /* the ward's own light on the terrace, under the four glowing windows:
   * hidden until the stone is woken.  A SIBLING of everything, never a
   * child — a 5 m pool inside a prop's audit unit flags that prop against
   * every neighbour within two metres. */
  const wardLamps = [];
  const wardDim = [];
  {
    const px = TOWER.x + Math.sin(1.45) * 3.6;
    const pz = TOWER.z + Math.cos(1.45) * 3.6;
    const pool = lightPool({ r: 2.2, y: 0.02, opacity: 0.36 });
    pool.material.color.setHex(PAL.tealGlow);
    pool.position.set(px, ctx.groundAt(px, pz) + 0.025, pz);
    pool.visible = false;
    ctx.add(pool, 'ward-tower-pool');
    wardLamps.push(pool);
  }

  /* THE WIZARD'S DOOR, STANDING OPEN — the plan's own "ten minutes ago".
   * A doorway on a round shaft is a DARK REVEAL on the surface plus a
   * surround built outward, never a recess: you cannot carve one into a
   * lofted solid, and at dusk an unlit reveal reads as a hole.  The leaf
   * is hinged on the west jamb and swung back against the shaft. */
  {
    const d = new THREE.Group();
    const D = parts();
    const nx = Math.sin(A);
    const nz = Math.cos(A);
    const ry = Math.atan2(nx, nz);
    const rad = TOWER.r * (1 - 0.16 * (1.15 / TOWER.h));
    const px = TOWER.x + nx * rad;
    const pz = TOWER.z + nz * rad;
    const DW = 1.15;
    const DH = 2.25;
    const off = (dd, side = 0) => [px + nx * dd - nz * side, 0, pz + nz * dd + nx * side];
    const put3 = (mat, w, h, t, dd, side, y, opts = {}) => {
      const [ox, , oz] = off(dd, side);
      D.add(mat, bx(w, h, t, ox, y, oz, { ry, ...opts }));
    };
    put3(M.ironDark, DW, DH, 0.05, 0.02, 0, baseY + DH / 2);          // the reveal
    for (const s of [-1, 1]) put3(M.graniteDark, 0.15, DH + 0.1, 0.1, 0.05, s * (DW / 2 + 0.08), baseY + (DH + 0.1) / 2);
    for (let i = 0; i < 7; i += 1) {                                   // seven voussoirs
      const f = -0.5 + i / 6;
      put3(M.graniteDark, (DW + 0.4) / 7.2, 0.2, 0.1, 0.05, f * (DW + 0.3),
        baseY + DH + 0.12 + (0.25 - f * f) * 0.6, { rz: -f * 0.8 });
    }
    put3(M.coping, DW + 0.5, 0.12, 0.42, 0.2, 0, baseY + 0.06);        // the threshold
    // the leaf, hinged on the west jamb: a group AT THE HINGE, never a
    // panel spun about its own centre
    const hinge = new THREE.Group();
    const L = parts();
    /* LEDGED AND BRACED ON BOTH FACES.  A door standing open is read from
     * the side nobody authored: the first cut put the straps on +z only
     * and the frame from the tower's step showed a 1.15 x 2.2 m
     * unmodulated brown card, because that is the face you are standing
     * in front of.  Same lesson as a scooter with no cockpit. */
    L.add(painted(JOINERY.oakStain), bx(DW, DH - 0.08, 0.07, DW / 2, (DH - 0.08) / 2, 0));
    for (let i = 1; i < 4; i += 1) {                                   // planking, outer face
      L.add(M.oakDark, bx(0.025, DH - 0.14, 0.02, (i / 4) * DW, (DH - 0.08) / 2, 0.045));
    }
    for (const y of [0.5, 1.75]) {
      L.add(M.ironDark, bx(DW - 0.1, 0.09, 0.03, DW / 2, y, 0.05));    // straps, outer
      L.add(M.oak, bx(DW - 0.12, 0.11, 0.04, DW / 2, y, -0.055));      // ledges, inner
    }
    L.add(M.oak, bx(Math.hypot(DW - 0.12, 1.25), 0.1, 0.04, DW / 2, 1.125, -0.055,
      { rz: Math.atan2(1.25, DW - 0.12) }));                           // the brace
    L.add(M.ironDark, cyl(0.035, 0.035, 0.18, 0.02, 1.2, 0, { seg: 6 }));
    L.flush(hinge, { receive: false });
    const [hx, , hz] = off(0.06, DW / 2 + 0.04);
    hinge.position.set(hx, baseY + 0.05, hz);
    /* THE SWING SIGN IS DERIVED, NOT GUESSED.  A group at `rotation.y =
     * ry` maps its local +x to the wall's tangent `(nz, -nx)` — which is
     * the leaf SHUT, running from the hinge across the opening.  Adding
     * 1.72 rad turns that INTO the shaft and the leaf disappears inside
     * the tower, which is what the first render showed: a doorway with no
     * door anywhere.  Subtracting three quarters of a turn swings it out
     * and back, clear of the reveal, which is a door standing open. */
    hinge.rotation.y = ry - Math.PI * 0.75;
    d.add(hinge);
    D.flush(d, { receive: false });
    ctx.add(d, 'tower-doorway');
  }
  /* what he left outside: the delivery, his firewood and the ladder — all
   * on the terrace's NORTH strip, because the tower's own base takes a
   * 3.2 m radius out of a 9.2 x 9.9 m terrace and anything inside that is
   * an OVERLAP against the shaft before it is a composition. */
  put(ctx, crateStack({ seed: 'tower-delivery', n: 3, spill: true, goods: JOINERY.mossPaint }),
    -46.4, -44.9, 0.5, 'tower-crates');
  put(ctx, barrelStack({ seed: 'tower-barrels', rows: 2, endColor: JOINERY.mossPaint }),
    -44.4, -45.0, -0.4, 'tower-barrels');
  put(ctx, logPile({ seed: 'tower-logs', w: 1.8, h: 0.9, d: 0.7, roof: false }),
    -41.4, -44.9, 0.1, 'tower-logs');
  put(ctx, ladder({ seed: 'tower-ladder', len: 3.4, w: 0.44, standoff: 0.32 }),
    -39.6, -43.4, -0.4, 'tower-ladder');

  return { wardLamps, wardDim, baseY };
}

/* ==================================================================== *
 * 5.  THE GRAVEYARD — the cover field
 * ==================================================================== */

function buildGraveyard(ctx) {
  /* THE COVER IS THE GRAVEYARD, laid out the way a level designer lays
   * cover: two ranks of table tombs with a LANE between them, so a player
   * backing away from the east gap always has one on the gate side, and a
   * third cluster round the well.  Eight tagged obstacles, all inside the
   * arena rect (x -47..-20, z -47..-14), all 0.98-1.4 m, all with
   * colliders — `placeCover` throws under 0.9 m, which is the point of
   * going through it. */
  const rows = [
    [-35.4, -39.6, 0], [-32.2, -39.9, 0.05], [-28.8, -39.5, -0.04],
    [-33.8, -36.2, 0.03], [-30.4, -36.5, 0], [-27.0, -36.0, -0.06],
  ];
  rows.forEach(([x, z, ry], i) => {
    placeCover(ctx, tableTomb({
      seed: `tomb-${i}`, L: 1.9 + (i % 3) * 0.12, W: 0.94, h: 0.98 + (i % 2) * 0.06,
    }), { x, z, yaw: ry, name: `table-tomb-${i + 1}` });
  });

  /* the well: the churchyard's own, and the third cover cluster.  0.98 m
   * to the coping, which is what makes it cover rather than a trip. */
  const well = wellHead({
    seed: 'close-well', r: 0.82, h: 0.98, roof: true, bucket: true, roofColor: JOINERY.oakStain,
  });
  well.userData.cover = true;
  well.userData.coverH = 0.98;
  placeCover(ctx, well, { x: -25.4, z: -32.4, yaw: 0, name: 'well-head' });

  /* the sexton's handcart, tipped where he left it when the horn went:
   * 1.4 m, on the lane in from the east gap, so the first thing a wave
   * meets is something the player can already be behind. */
  placeCover(ctx, siegeProps.felledCart({ seed: 'sexton-cart' }),
    { x: -23.8, z: -28.0, yaw: Math.PI / 2, name: 'sexton-cart' });

  /* headstones — one pooled unit per plot, no colliders */
  put(ctx, headstoneField({
    seed: 'graves-west',
    spots: [
      [-1.6, -1.4], [-0.8, -0.2], [0.1, -1.6], [0.9, -0.4], [1.7, -1.5],
      [-1.9, 1.1], [-0.9, 1.9], [0.2, 1.2], [1.2, 2.0], [2.0, 1.0],
    ],
  }), -36.8, -44.2, 0.15, 'graves-west');
  put(ctx, headstoneField({
    seed: 'graves-porch',
    spots: [[-1.4, -1.0], [-0.4, 0.2], [0.6, -1.1], [1.4, 0.4], [-1.2, 1.4], [0.4, 1.6]],
  }), -37.4, -25.4, -0.2, 'graves-porch');
  put(ctx, headstoneField({
    seed: 'graves-terrace',
    spots: [[-1.8, -0.6], [-0.8, 0.6], [0.2, -0.7], [1.2, 0.5], [2.0, -0.5], [0.6, 1.6]],
  }), -44.2, -37.6, 0.4, 'graves-terrace');

  /* THE YEWS.  A graveyard yew is a dark plumb column and it is what
   * gives this district its mass at dusk.  All of them clear the
   * `the-close` sight line by construction — the camera is 6.6 m up on
   * the walk and its ray to the tower rises from there, so nothing 5 m
   * tall can reach it — and all are under the corridor's 9 m floor. */
  /* ONE STAND PER TREE.  A multi-spot `treeStand` merges into one tagged
   * unit whose bounding box spans every spot — the kit's own errata —
   * so a five-spot stand across this yard is a 20 x 20 m audit unit that
   * OVERLAPs the tombs, the well, the cart, the sexton's corner, the
   * almshouse's props and the chapel's own furniture, all at once.  Eight
   * separate stands are eight tight boxes and the same eight meshes. */
  const yew = (x, z, sc, name) => ctx.add(treeStand({
    seed: `close-yew-${name}`, kind: 'yew', groundAt: ctx.groundAt, jitter: 0.5,
    spots: [[x, z, sc]],
  }), `yew-${name}`);
  yew(-36.9, -20.6, 1.15, 'porch');
  yew(-35.4, -29.6, 0.95, 'mid');
  yew(-24.0, -21.0, 0.9, 'lane');
  /* NOT on the line from the arena's centre to the tower.  `check-game`
   * aims at a landmark's bbox CENTRE only — mid-shaft, 8.7 m up — and at
   * (-37.4, -34.4) this yew stood 0.38 m off that ray with 4.5 m of
   * canopy in it: the landmark read from every vista and from four of
   * marketlow's five waypoints and NOT from the middle of its own arena. */
  yew(-32.0, -31.6, 1.0, 'yard-mid');
  yew(-46.4, -32.4, 1.0, 'west');
  yew(-41.6, -31.6, 0.95, 'yard');
  yew(-23.8, -25.6, 0.9, 'east');

  /* the sexton's corner under the east wall: his tools, his brazier and
   * the spoil from the grave he has not finished.  Evidence in a cluster,
   * never scatter. */
  put(ctx, brazier({ seed: 'sexton-brazier', r: 0.36, h: 0.66, lit: true, ctx }),
    -23.2, -34.2, 0, 'sexton-brazier');
  put(ctx, barrel({ seed: 'sexton-butt', h: 0.9, r: 0.34 }), -23.4, -35.4, 0.3, 'sexton-butt');
  put(ctx, crate({ seed: 'sexton-crate', w: 0.66, d: 0.56, h: 0.44, open: true }),
    -23.2, -36.6, -0.6, 'sexton-crate');

  /* the open grave: spoil, a plank over it and two shovels stuck in the
   * heap.  One pooled group, no collider — it is a hole, not a wall. */
  {
    const g = new THREE.Group();
    const P = parts();
    const r = rng('open-grave');
    P.add(M.earth, bx(2.3, 0.06, 1.1, 0, 0.03, 0));
    P.add(M.pavingDark, bx(2.0, 0.04, 0.85, 0, 0.05, 0));
    for (let k = 0; k < 12; k += 1) {
      const a = r.range(0, TAU);
      P.add(r.chance(0.4) ? M.turf : M.earth,
        bx(r.range(0.35, 0.7), r.range(0.14, 0.3), r.range(0.3, 0.55),
          Math.cos(a) * r.range(1.35, 1.8), r.range(0.06, 0.14), Math.sin(a) * r.range(0.7, 1.1),
          { ry: a }));
    }
    P.add(M.oakSilver, bx(2.5, 0.06, 0.24, 0, 0.09, 0.2, { ry: 0.06 }));
    for (const s of [-1, 1]) {
      P.add(M.oakDark, tubeGeo([1.4 * s, 0.05, -0.9], [1.56 * s, 1.15, -1.06], 0.03, 5));
      P.add(M.iron, bx(0.18, 0.26, 0.03, 1.42 * s, 0.16, -0.92, { ry: 0.3 * s }));
    }
    P.flush(g);
    tagProp(g, 'open-grave', { footprint: null });
    put(ctx, g, -32.4, -42.0, 0.25, 'open-grave');
  }
}

/* ==================================================================== *
 * 6.  THE ALMSHOUSE ROW
 * ==================================================================== */

function buildAlmshouse(ctx) {
  /* Its back wall stands at z = -47.9, clear of the north curtain's inner
   * plinth, which reaches -48.30 (measured off the generator, not
   * guessed).  Its west gable is flush with the stair landing's east face
   * at x = -30.0, so the row and the stair turret make one mass instead
   * of leaving a metre-wide slot nobody can use; its east gable sits on
   * the churchyard wall's own line at x = -21.6.
   *
   * `galleryDeck: false` — the kit's own note: registering the upper
   * gallery's platform answers 4.25 m for every square metre UNDER the
   * arcade, and the pentice IS that arcade.  There is no stair to the
   * gallery from my side, so the platform buys nothing and costs the
   * covered walk the brief asks for. */
  const row = longhouse({
    seed: 'close-almshouse', w: 8.4, d: 6.0, groundH: 2.4, upperH: 1.85,
    wall: 'limewash', roof: 'shingle', pitch: 0.55, ridgeAxis: 'x', crook: 0.7,
    gallery: true, galleryDeck: false, bay: true, jetty: 0.2,
    door: JOINERY.oakStain, shutter: JOINERY.doveGrey, litWindows: 2, chimney: true,
  });
  place(ctx, row, { x: -25.8, z: -44.9, yaw: 0, name: 'almshouse' });

  /* INTEGRATION: one of the town's THREE LIGHTS (src/game/INTERFACES.md):
   * `userData.townLight = 2` on the building whose windows go dark for
   * good when a light is lost.  The lit panes are the pooled `M.lit`
   * meshes inside the generator's group; `setLit(false)` hides them. */
  {
    const panes = [];
    row.traverse((o) => { if (o.isMesh && o.material === M.lit) panes.push(o); });
    row.userData.townLight = 2;
    row.userData.setLit = (on) => { for (const m of panes) m.visible = !!on; };
  }

  const front = -44.9 + row.userData.d / 2;    // -41.9, the arcade's outer line
  const gy = ctx.groundAt(-25.8, front + 0.9);

  /* THE PENTICE, and it is the district's second hexer perch: a flagged
   * walk 0.34 m proud of the yard, in front of the doors, with two steps
   * down to the graves.  11 m² — an ordinary made surface, under the
   * composer's 30 m² line, and what an almshouse row actually has. */
  const PX0 = -29.4;
  const PX1 = -22.2;
  const PZ0 = front + 0.05;
  const PZ1 = front + 1.6;
  ctx.platform(PX0, PZ0, PX1, PZ1, gy + 0.34);
  {
    const g = new THREE.Group();
    const P = parts();
    let k = 0;
    for (let x = PX0; x < PX1 - 0.05; x += 1.2) {
      const w = Math.min(1.2, PX1 - x);
      P.add(k % 2 ? M.paving : M.pavingDark,
        bx(w - 0.03, 0.34, PZ1 - PZ0 - 0.03, x + w / 2, gy + 0.17, (PZ0 + PZ1) / 2));
      k += 1;
    }
    P.add(M.coping, bx(PX1 - PX0 + 0.1, 0.09, 0.32, (PX0 + PX1) / 2, gy + 0.375, PZ1 + 0.07));
    P.flush(g);
    ctx.add(g, 'pentice-floor');
  }
  // two flights down, at the two doors, so the perch has a way off it
  ctx.add(stairs({ w: 1.5, rise: 0.17, run: 0.42, steps: 2, dir: 'z-', at: [-27.8, 0, PZ1 + 0.86], mat: M.granite, ctx }), 'pentice-steps-w');
  ctx.add(stairs({ w: 1.5, rise: 0.17, run: 0.42, steps: 2, dir: 'z-', at: [-23.6, 0, PZ1 + 0.86], mat: M.granite, ctx }), 'pentice-steps-e');

  /* the row's own life, ten minutes ago: the almsfolk have been got
   * indoors and everything is still on the walk. */
  put(ctx, benchOutside(), -25.6, PZ0 + 0.6, Math.PI, 'pentice-bench');
  put(ctx, trough({ seed: 'alms-trough', len: 1.4, w: 0.6, h: 0.52 }), -22.8, -40.4, 0, 'alms-trough');
  put(ctx, logPile({ seed: 'alms-logs', w: 2.0, h: 0.85, d: 0.65, roof: true }), -30.8, -44.4, Math.PI / 2, 'alms-logs');
  put(ctx, sackStack({ seed: 'alms-sacks', n: 3, color: JOINERY.doveGrey }), -23.2, -38.2, 0.4, 'alms-sacks');
  put(ctx, kitchenGarden({ seed: 'alms-garden', w: 2.6, d: 1.7 }), -28.8, -32.4, 0, 'alms-garden');
  ctx.add(washingLine({
    from: [-30.4, 2.3, -43.6], to: [-30.4, 2.0, -41.0],
    sag: 0.2, seed: 'alms-washing', n: 5,
    colors: [JOINERY.bone, JOINERY.doveGrey, JOINERY.skyWash],
  }), 'alms-washing');

  put(ctx, platePost({
    title: 'ST WENNA’S ALMSHOUSES', sub: 'OF THE PARISH', w: 0.94, h: 0.3,
    postH: 1.5, seed: 'alms-plate', accent: JOINERY.oakStain,
  }), -29.2, -41.2, Math.PI, 'alms-plate');
}

/** A plain outdoor bench, pooled and colliderless — the kit's `bench`
 *  registers one, and a bench under a 1.55 m pentice must not narrow it. */
function benchOutside() {
  const g = new THREE.Group();
  const P = parts();
  P.add(M.oakSilver, bx(1.7, 0.07, 0.36, 0, 0.44, 0));
  for (const s of [-1, 1]) {
    P.add(M.oakDark, bx(0.1, 0.44, 0.3, s * 0.7, 0.22, 0));
    P.add(M.oakDark, bx(0.09, 0.5, 0.09, s * 0.7, 0.66, -0.15));
  }
  P.add(M.oakSilver, bx(1.7, 0.18, 0.06, 0, 0.78, -0.16));
  P.flush(g);
  return tagProp(g, 'bench', { footprint: null });
}

/* ==================================================================== *
 * 7.  THE CLOSE'S OWN LIFE — the last details before dark
 * ==================================================================== */

function dressClose(ctx) {
  /* the hedge inside the churchyard wall, broken at both gates — it is
   * what stops 27 m of 1.05 m wall reading as a kerb from inside */
  ctx.add(hedgeRun({
    points: [[-47.6, WALL_Z - 0.8], [-32.4, WALL_Z - 0.8]],
    h: 1.15, w: 0.8, seed: 'close-hedge-w', groundAt: ctx.groundAt, gappy: true,
  }), 'close-hedge-w');
  ctx.add(hedgeRun({
    points: [[-27.6, WALL_Z - 0.8], [-22.6, WALL_Z - 0.8]],
    h: 1.1, w: 0.8, seed: 'close-hedge-e', groundAt: ctx.groundAt, gappy: true,
  }), 'close-hedge-e');

  /* the two lamps already lit on the paths — warm, and the only light in
   * the yard that is not the wizard's */
  put(ctx, postLantern({ seed: 'close-lamp-1', h: 2.7, lit: true, arm: true }), -28.4, -30.2, 0, 'close-lamp-1');
  put(ctx, postLantern({ seed: 'close-lamp-2', h: 2.6, lit: true, arm: true }), -39.6, -34.0, 0, 'close-lamp-2');

  /* THE VIGIL NOBODY WILL HOLD: the candle box open on its trestle by the
   * porch, five tapers still in it, one alight on the stand beside. */
  {
    const g = new THREE.Group();
    const P = parts();
    P.add(M.oakDark, bx(0.62, 0.42, 0.42, 0, 0.21, 0));
    P.add(M.oakSilver, bx(0.66, 0.05, 0.46, 0, 0.44, 0));
    P.add(M.oak, bx(0.5, 0.05, 0.3, 0.06, 0.48, 0.04, { ry: 0.2 }));
    for (let i = 0; i < 5; i += 1) {
      P.add(M.paper, cyl(0.017, 0.019, 0.2, -0.16 + i * 0.08, 0.58, 0.02, { seg: 5, rz: 0.06 * i - 0.1 }));
    }
    P.add(M.ironDark, cyl(0.026, 0.036, 0.9, -0.42, 0.45, -0.22, { seg: 6 }));
    P.add(M.ember, cyl(0.02, 0.006, 0.09, -0.42, 0.95, -0.22, { seg: 5 }));
    P.flush(g);
    tagProp(g, 'candle-box', { footprint: null });
    put(ctx, g, -32.2, -18.6, 0.4, 'candle-box');
  }
  put(ctx, ladder({ seed: 'chapel-ladder', len: 3.8, w: 0.46, standoff: 0.34 }),
    -34.0, -24.1, -Math.PI / 2, 'chapel-ladder');

  /* THE CAT ON THE TOMB — the plan's own "ten minutes ago", and the only
   * living thing this district may draw, because it is not a person.
   * A PROP UNDER 0.3 m READS AS A DOT unless its silhouette carries it: a
   * cat at eight metres is the curve of the back, the upright ears and
   * the tail curled round the feet, and nothing else survives. */
  {
    const g = new THREE.Group();
    const P = parts();
    const fur = painted(0x4a4553);
    P.add(fur, bx(0.42, 0.17, 0.15, 0, 0.13, 0, { rz: -0.06 }));
    P.add(fur, bx(0.2, 0.2, 0.15, -0.2, 0.2, 0));
    P.add(fur, cyl(0.075, 0.085, 0.13, -0.28, 0.31, 0, { seg: 7 }));
    for (const s of [-1, 1]) P.add(fur, bx(0.05, 0.08, 0.03, -0.3, 0.39, s * 0.045, { rz: 0.2 }));
    P.add(fur, cyl(0.03, 0.035, 0.3, 0.22, 0.09, 0.05, { seg: 6, rz: 1.2, ry: 0.5 }));
    P.add(fur, cyl(0.028, 0.03, 0.12, 0.32, 0.16, 0.09, { seg: 6, rx: 0.8 }));
    P.flush(g, { receive: false });
    tagProp(g, 'cat', { footprint: null });
    const cx = -32.2;
    const cz = -39.9;
    g.position.set(cx, ctx.groundAt(cx, cz) + 1.04, cz);
    g.rotation.y = -0.7;
    ctx.add(g, 'cat');
  }

  /* the vixen's way out: a gap under the churchyard hedge where the
   * game's fox flees to the yew close.  A hollow in the turf, a run of
   * trodden ground, and nothing else. */
  {
    const g = new THREE.Group();
    const P = parts();
    P.add(M.earth, bx(0.7, 0.05, 0.5, 0, 0.026, 0));
    P.add(M.earth, bx(0.5, 0.04, 1.1, 0.05, 0.024, -0.7, { ry: 0.2 }));
    P.flush(g, { cast: false });
    tagProp(g, 'fox-run', { footprint: null });
    put(ctx, g, -29.4, -16.8, 0, 'fox-run');
  }
}

/* ==================================================================== *
 * 8.  THE GROUND — the two routes, worn in
 * ==================================================================== */

function dressGround(ctx) {
  const g = new THREE.Group();
  const P = parts();
  const r = rng('close-ground');
  /* Ground dressing is a TONE, not a chain of cards: one family, patches
   * overlapping by half their length, almost no rotation.  Two tones a
   * long way apart alternating along a line read from any standing eye as
   * a zigzag of tilted rectangles with a visible period. */
  const lay = (mat, x, z, w, d, ry = 0) => {
    P.add(mat, bx(w, 0.05, d, x, ctx.groundAt(x, z) - 0.012, z, { ry }));
  };

  // the route in from the mill, and the turn east along the wall to the gate
  for (let z = -12.4; z > -15.2; z -= 0.9) {
    lay(r.chance(0.3) ? M.gravel : M.paving, -36 + r.range(-0.4, 0.4), z, r.range(2.9, 3.4), 1.3, r.range(-0.04, 0.04));
  }
  for (let x = -37.4; x < -28.6; x += 1.1) {
    lay(r.chance(0.32) ? M.gravel : M.paving, x, -14.4 + r.range(-0.25, 0.25), 1.6, r.range(2.0, 2.5), r.range(-0.04, 0.04));
  }
  // through the lych-gate and up to the chapel door — the worn route
  for (let z = -16.2; z > -18.4; z -= 0.8) lay(M.paving, GATE_X + r.range(-0.2, 0.2), z, 2.5, 1.2);
  lay(M.paving, GATE_X, -18.7, 3.4, 1.5);

  // the lane in from the keep: west along z -30.2, then the fork
  for (let x = -21.2; x > -27.4; x -= 1.2) {
    lay(r.chance(0.3) ? M.gravel : M.paving, x, -30.2 + r.range(-0.3, 0.3), 1.7, r.range(2.6, 3.2));
  }
  // ...south down the chapel's east flank to the forecourt
  for (let z = -29.4; z > -18.8; z -= 1.15) {
    lay(r.chance(0.35) ? M.gravel : M.paving, -24.7 + r.range(-0.35, 0.35), z, r.range(2.2, 2.7), 1.6);
  }
  // ...and north-west into the graveyard, past the well to the tower steps
  const legs = [[-27.4, -30.8], [-31.0, -33.2], [-35.0, -34.4], [-39.4, -34.8], [-42.4, -35.0]];
  for (let i = 0; i < legs.length - 1; i += 1) {
    const [ax, az] = legs[i];
    const [bxx, bz] = legs[i + 1];
    for (let t = 0; t <= 1.001; t += 0.22) {
      lay(r.chance(0.4) ? M.earth : M.gravel, ax + (bxx - ax) * t, az + (bz - az) * t,
        r.range(2.0, 2.7), r.range(1.9, 2.5), r.range(-0.06, 0.06));
    }
  }
  // the lane between the two ranks of tombs
  for (let x = -37.0; x < -25.0; x += 1.7) lay(M.gravel, x, -38.9 + r.range(-0.2, 0.2), 2.0, r.range(1.2, 1.6));
  // the walk in front of the almshouse, and the way down from the wall stair
  for (let x = -30.0; x < -21.6; x += 1.6) lay(r.chance(0.3) ? M.earth : M.gravel, x, -40.6, 1.9, 1.5);
  for (let x = -44.2; x < -35.6; x += 1.6) lay(r.chance(0.35) ? M.earth : M.gravel, x, -46.6 + r.range(-0.3, 0.3), 2.0, 1.9);

  // moss at the foot of the north and west curtains — the wet side of a
  // wall the sun never reaches
  for (let x = -47.6; x < -22.0; x += 1.8) lay(M.moss, x, -48.05, 1.9, 0.42);
  for (let z = -47.0; z < -14.0; z += 1.8) lay(M.moss, -48.55, z, 0.42, 1.9);
  // and along the churchyard wall's shaded north face, not across the gate
  for (let x = -47.0; x < -23.0; x += 2.2) {
    if (x > -32.4 && x < -27.6) continue;
    lay(M.moss, x, WALL_Z - 0.34, 2.2, 0.34);
  }

  // turf where the graves are: the yard is grass, not paving
  for (let k = 0; k < 26; k += 1) {
    lay(r.chance(0.5) ? M.turf : M.moss,
      r.range(-46.5, -22.5), r.range(-45.5, -33.0), r.range(1.6, 3.2), r.range(1.4, 2.6), r.range(-0.1, 0.1));
  }
  P.flush(g, { cast: false });
  ctx.add(g, 'ground');
}

/* ==================================================================== */

export const chapelclose = defineDistrict({
  id: 'chapelclose',
  envelope: E,
  after: ['millreach', 'keephill'],
  sockets: [
    { id: 'cc-s-lane', kind: 'path', at: [-36, -12], axis: 'z', width: 3.2, y: 0, mate: 'mr-n-lane' },
    { id: 'cc-lane-e', kind: 'path', at: [-18, -30], axis: 'x', width: 3.0, y: 0, mate: 'keep-lane-w' },
    { id: 'cc-walk-s', kind: 'path', at: [-50, -12], axis: 'z', width: 2.4, y: 5, mate: 'mr-walk-n' },
    { id: 'cc-walk-e', kind: 'path', at: [-18, -50], axis: 'x', width: 2.4, y: 5, mate: 'keep-walk-w' },
  ],
  build(ctx, { plan }) {
    buildWall(ctx, plan);
    buildTerrace(ctx);
    const tower = buildTower(ctx);
    buildBoundary(ctx);
    buildChapel(ctx);
    buildWardStone(ctx, tower);
    buildGraveyard(ctx);
    buildAlmshouse(ctx);
    dressClose(ctx);
    dressGround(ctx);
  },
});

/* ---- KIT PROMOTION CANDIDATES ---------------------------------------
 * Flagged, not invented (the kit is append-only during district builds;
 * all of these are pooled dressing, not building generators):
 *   - `tableTomb` — a chest tomb on stub legs under a ledger slab, tagged
 *     as cover at 0.98-1.10 m.  Any district with a churchyard, a crypt
 *     or a memorial wants one, and it is the cheapest metre of cover this
 *     town has that does not read as siege gear.
 *   - `headstoneField` — N leaning slabs as ONE pooled, colliderless
 *     unit.  The alternative is forty audit units inside each other.
 *   - a LYCH-GATE: two piers, coffin stones and a gable, sized off the
 *     player's radius so the opening is a chokepoint and not a wall.
 *   - `lightPool` has warm and ember maps only; the ward's pool is the
 *     warm map recoloured, which works but is the wrong falloff for a
 *     cool light.  A cool pool map would be one entry.
 * ------------------------------------------------------------------ */
