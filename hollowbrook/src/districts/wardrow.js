import * as THREE from 'three';
import { defineDistrict } from '../core/district.js';
import { registerInterior, makeDoorLeaf } from '../core/interior.js';
import * as room from '../interiors.js';
import {
  M, painted, glowing, PAL, ACCENT, JOINERY,
  place, rng, seatOnGround, parts, bx, cyl, tubeGeo, tagProp,
  cottage, longhouse, roundTower, tradeFront,
  shingleRoof, gableFill,
  treeStand, hedgeRun,
  villageProps, lightPool, interactive, signKit,
  curtainWall, gatehouse, stairTurret, barricade,
  siegeProps, placeCover,
  stairs, stairRail, wallRun, leanTo, bench,
} from '../kit/index.js';
/* `hollowShell` and `enterableColliders` are builders, not kit — the kit
 * re-exports the architecture helpers but not these two. */
import { hollowShell } from '../builders.js';

/* ==================================================================== *
 * THE WARD ROW — wardrow.  The east of Hollowbrook: the row lane from
 * the market's east stair to the EAST GATE, the second gate, and the
 * lanes wave 3 is fought in.
 *
 * ------------------------------------------------------------------
 * THE LAND, MEASURED (not remembered).  Sampled through composeCity's
 * groundAt over the whole envelope with `?only=wardrow`, x 18..54 at 2 m
 * and z -18..54 at 3 m, before a single coordinate was chosen:
 *
 *   level 0.00 over EVERYTHING inside the wall.  There is no mound, no
 *   rim and no scarp anywhere in this parcel except the perimeter's.
 *   - east wall-walk shelf 5.00 at x 48.8..51.2, z -18..18.5 and
 *     z 25.5..51.2; the gate gap between them reads 0.00;
 *   - south wall-walk shelf 5.00 at z 48.8..51.2, x 18..51.2;
 *   - `row-wall-stair` climbs 0.00 -> 5.00 in x 46.5..48.1 from z 30.6
 *     to z 40.6 (25 treads, rise 0.2, going 0.4) into the landing shelf
 *     x 45.8..48.8, z 40..43;
 *   - x > 51.2 and z > 51.2 is the surrounds, 0.00 falling to -0.05 and
 *     then to the moor's -0.4.  southgate owns it; I build nothing out
 *     there except the SE corner tower the plan gives me.
 *
 *   The ONLY colliders standing in the parcel before I start are the
 *   neighbours' massing stubs — marketlow's chandler (12.5..17.5,
 *   -10.5..-5.5) and its south-rim block (5..11, -17.5..-12.5),
 *   southgate's stable (6.5..15.5, 19.5..24.5) — all of them WEST of
 *   x = 18.  Nothing of mine has to dodge anything.
 *
 * SO EVERY METRE OF ELEVATION IN THIS DISTRICT IS SOMETHING I BUILD.
 * `game.arenas["the-row"]` asks for `min_elevation 6`: six samples of a
 * 2 m grid over x 21..45, z -15..45 standing more than 0.3 m over the
 * level.  The wall-walk, the gatehouse deck and the stair-head landing
 * are ALL outside that grid (they start at x 45.8), so on the bare
 * terrain it scores ZERO.  What scores it is the inn's gallery
 * (12.4 x 1.44 at 2.68, 7 samples), its outside stair (2) and the
 * bake-oven's raised yard at 0.52 (6) — fifteen in all.  Those three are
 * registered platforms with real ways up for that reason, not scenery.
 *
 * ------------------------------------------------------------------
 * SOCKETS.  The terrain built both halves of each; I keep 3 m into my
 * side clear of colliders across the socket's full width.
 *   wr-w-lane      (18, 36) path 3.6 y0  -> southgate  sg-e-lane
 *   wr-market-lane (18,  4) path 3.6 y0  -> marketlow  market-lane-e
 *   wr-lane-n      (36,-18) path 3.6 y0  -> keephill   keep-lane-e
 *   wr-walk-s      (18, 50) path 2.4 y5  -> southgate  sg-walk-e
 *   wr-walk-n      (50,-18) path 2.4 y5  -> keephill   keep-walk-e
 * The two walk sockets are the terrain's own shelf and the curtain runs
 * end `'none'` at them, so the masonry carries on into the neighbour.
 *
 * ------------------------------------------------------------------
 * THE COMPOSITION, and why it is shaped like this.
 *
 * This is the game's LANE-FIGHTING level, so it is laid out as lanes and
 * not as a place.  Two long channels running east-west, a spine at each
 * end, and three cross-cuts between them:
 *
 *   A  the row lane      z 19.6..24.8  x 24.6..47.6   the gate's lane
 *   D  the inn lane      z 34.2..38.4  x 18..38.8     the second channel
 *   C  the back row      x 21.0..24.6  z 2..38.4      the west spine
 *   B  the keep lane     x 32.8..37.8  z -18..19.6    the east spine
 *   F  the gennel        x 30.2..32.8  z 24.8..34.2   cross-cut, 2.6 m
 *   G  the wall cut      x 38.8..42.4  z 24.8..34.2   cross-cut, 3.6 m
 *   J  the wall lane     x 43.4..47.8  z 38.4..47.6   the pomerium
 *
 * The Company comes through the gate at (50, 22) and runs A west.  Every
 * eight metres of A has a flank off it — F and G to the south, the keep
 * lane to the north, the 1.8 m garden gate in the north wall at
 * x 40.8..42.6 — and cover sits on ALTERNATING kerbs, so the lane never
 * has less than 2.5 m of clear ground and never a straight unbroken run.
 *
 * THE VISTA DECIDED WHERE THE HOUSES ARE NOT.  `down-the-row` stands at
 * (15, 1.6, 4) — the market's east stair head, in marketlow — and looks
 * at the gate.  That sight line crosses my parcel on a DIAGONAL: (24,9)
 * (30,12) (36,15) (42,18) (48,21), climbing from 1.6 m to about 5.5.  A
 * 1.5-storey thatch ridges at 5.5, so ANY cottage on that diagonal closes
 * the vista outright.  The whole block between the market lane and the
 * row lane is therefore the row's KITCHEN GARDENS, its drying ground and
 * its bake-oven — nothing over 2.5 m anywhere from x 33 to x 47 — and the
 * cottages stand NORTH of the diagonal (h6, h7, the smithy) or SOUTH of
 * it (h1, h3, h4, h5, the inn).  That is not a compromise: a walled
 * town's back land IS gardens, and it is what the brief asked for.
 *
 * The same diagonal carries the arena's landmark ray, which check-game
 * fires from the rect centre (33.5, 15.5) at the gate.  That is why the
 * keep lane is widened to 5.0 m from z 4 to 19.6: the arena's centre has
 * to be ground you can stand on, and at 3.6 m the lane's east kerb ran
 * through it.
 *
 * `keep-sees-eastgate` ((12,-30) to (46,20), half 3, clear above 7.5)
 * crosses at (24,-12) (30,-3.5) (36,5) (42,14) — the west field, the
 * smithy yard, the keep lane and the allotments, all open.  The smithy's
 * ridge is 5.2 and its chimney tops out at 6.5, both under 7.5.
 *
 * LIGHT.  The sun is bearing 268 and nine degrees up — due west, nearly
 * down.  In this district that means only WEST elevations and roof tops
 * are lit and everything facing the gate is in the violet half-light.
 * Nothing here fights that: what carries the frames is the gate's own lit
 * west face at the end of the lane, its two wall torches, the deck
 * brazier, the forge seen through the smithy door, and the lit windows
 * down the row.
 *
 * ACCENT.  `ACCENT.rowGreen`, on SIX DOORS and nothing else — one
 * bottle-green family painted a house at a time out of the same pot.
 * NEVER `ACCENT.companyRust` (the enemy's, town-wide) and never
 * `ACCENT.wardGlow` (chapelclose's).
 *
 * ------------------------------------------------------------------
 * TRAPS THIS FILE PAID FOR (append as they are found):
 *
 *  - THE GATE ANCHOR AND THE GATEHOUSE DECK WERE IN DIRECT CONFLICT, and
 *    the first cut shipped a 40 mm hole in the deck to satisfy two
 *    height-blind gates.  Resolved at integration by making the gates
 *    height-aware (see the note at the deck below); the deck is one
 *    platform again.  A gate that cannot express two levels at one point
 *    will be satisfied with a hole, and nobody will see it.
 *  - The vista's diagonal is not the lane.  Three cottages were sited on
 *    the north side of the row lane before anyone plotted where the
 *    `down-the-row` ray actually goes; all three sat squarely on it and
 *    the gate would have been invisible from the camera that exists to
 *    show it.  Plot the ray at five x values BEFORE choosing a footprint.
 *  - The arena's rect centre is a raycast origin.  (33.5, 15.5) was
 *    inside a cottage in the first layout, so check-game's landmark ray
 *    started inside a wall and the gate "did not read" from an arena that
 *    can see it from everywhere else.
 *  - A HIDDEN GROUP IS NOT A HIDDEN MESH.  `barricade` hides its raised
 *    state by setting `visible = false` on the GROUP; three's raycaster
 *    does not test ancestors and `check-arena-visibility` filters on the
 *    HIT MESH's own flag.  The barricade nobody could see was blocking
 *    the sight line to the gate's approach from 94 of the arena's 298
 *    open cells, and the gate read 29 % against a floor of 40.  Wrapping
 *    raise/lower so the leaves agree took it to 52 %.  It is the mirror
 *    of the kit's "Box3.setFromObject does not skip invisible children".
 *  - THE BOUNDING-BOX CENTRE OF A GATE IS THE HOLE IN IT.  check-game's
 *    landmark test fires ONE ray at the subject's bbox centre and scores
 *    it only if that ray HITS; the ray flew straight through the open
 *    passage and the district's own landmark read 0/1.  (check-city's
 *    landmark check counts a clear ray as visible, so it passed there —
 *    two gates, opposite conventions, same subject.)  The standard on the
 *    deck is what puts the centre on masonry.
 *  - `roundTower`'s top is NOT `h + capH`: the machicolation corbel and
 *    the cap flare add 0.70 m.  Measure the built bbox before trusting a
 *    height against a sight corridor.
 *  - `placeCover` seats through `seatOnGround`, which sets y from the
 *    height query and never measures the prop, so a generator that dips
 *    below its own origin lands buried.  `breachRubble` does, by 0.28 m.
 *  - A LIGHT POOL IS A SURFACE TO THE AUDIT.  The forge pool reached
 *    under the bellows and the bellows came back "hovering 0.55 m above
 *    light-pool" — the real fault being that a bellows with no legs IS
 *    hovering.  Same for the banner pole over the gate brazier's pool.
 *  - `stairs()` builds a sawtooth whose nosings lie on `y = a·rise/run +
 *    rise`, so a `stairRail` drawn from the flight's own origin sits half
 *    a rise under every tread; and a rail offset OUTSIDE the going has
 *    nothing under it at all.  Both read as failed runs in the audit.
 * ==================================================================== */

const E = { x0: 18, z0: -18, x1: 54, z1: 54 };
const HALF = Math.PI / 2;

/* THE ROW-GREEN DOOR FAMILY — derived from ACCENT.rowGreen by GAIN, not
 * by hue, and for a measured reason.  rowGreen is 0x3f6b4a: relative
 * luminance about 0.16, and the sun is due WEST while every door on this
 * lane faces north, south or east.  Not one of them ever sees direct
 * light, so on the cel ramp's shaded band a raw bottle green lands within
 * a few per cent of the ink colour and six doors read as six dark holes.
 * Value up, hue and saturation untouched: unmistakably one pot. */
const gain = (hex, k) => {
  const ch = (sh) => Math.min(255, Math.round(((hex >> sh) & 255) * k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
const DOOR = [1.34, 1.48, 1.24, 1.56, 1.40, 1.28].map((k) => gain(ACCENT.rowGreen, k));
/* Five of the six are on the five cottages and the sixth is the inn's own
 * door; nothing else in the district wears the accent.  There is no house
 * on the keep lane's east side because that is where `keep-sees-eastgate`
 * runs and because 440 meshes do not stretch to a sixth cottage on top of
 * a gatehouse, two gate turrets, a corner tower and three curtain runs. */

/* ---- the lanes -------------------------------------------------------
 * Paving DECALS, never platforms: the terrain is already at 0.00 here and
 * a district that platforms its own rectangle is the floating-slab defect
 * composeCity warns about.  The rects BUTT and never overlap — two
 * coplanar slabs at one height are a coin toss, so each leg owns its own
 * junctions. */
const LANES = [
  { id: 'A', x0: 24.6, z0: 19.6, x1: 47.6, z1: 24.8 },               // the row lane
  { id: 'B1', x0: 34.2, z0: -18.0, x1: 37.8, z1: 4.0 },              // keep lane, north leg
  { id: 'B2', x0: 32.8, z0: 4.0, x1: 37.8, z1: 19.6 },               // keep lane, the row's head
  { id: 'C', x0: 21.0, z0: 2.0, x1: 24.6, z1: 38.4 },                // the back row
  { id: 'Dw', x0: 18.0, z0: 34.2, x1: 21.0, z1: 38.4 },              // out to southgate
  { id: 'De', x0: 24.6, z0: 34.2, x1: 38.8, z1: 38.4 },              // the inn lane
  { id: 'Dc', x0: 26.6, z0: 38.4, x1: 38.8, z1: 39.96 },             // the inn's forecourt
  { id: 'Em', x0: 18.0, z0: 2.0, x1: 21.0, z1: 5.9 },                // out to marketlow
  { id: 'F', x0: 30.2, z0: 24.8, x1: 32.8, z1: 34.2 },               // the gennel
  { id: 'G', x0: 38.8, z0: 24.8, x1: 42.4, z1: 34.2 },               // the wall cut
  { id: 'H', x0: 42.4, z0: 30.2, x1: 47.8, z1: 34.2 },               // the stair apron
  { id: 'I', x0: 38.8, z0: 34.2, x1: 47.8, z1: 38.4 },               // to the wall lane
  { id: 'J', x0: 43.4, z0: 38.4, x1: 47.8, z1: 47.6 },               // the pomerium
  { id: 'K', x0: 26.0, z0: -5.1, x1: 34.2, z1: 0.6, mat: 'earth' },  // the smithy yard
  { id: 'Y', x0: 38.8, z0: 38.4, x1: 43.4, z1: 47.6, mat: 'earth' }, // the inn's stable yard
];

/* ---- the houses ------------------------------------------------------
 * `yaw` is a multiple of PI/2 (place's registered collider is the rotated
 * AABB and is exact only there) and names the way the FRONT looks:
 * 0 south (+z), PI north (-z), +PI/2 east (+x), -PI/2 west (-x).  The
 * extents in the comments are AFTER the yaw, measured, because on a
 * quarter turn `w` runs in z and `d` runs in x. */
const HOMES = [
  { // north side of the row lane; the ONLY house on that side, because
    // the vista's diagonal owns everything east of it.  x 25.3..31.7,
    // z 14.6..19.2 — 0.7 m of verge to the back row, 1.1 to the keep lane
    id: 'h1', seed: 'row-cottage-1', x: 28.5, z: 16.9, yaw: 0,
    w: 6.4, d: 4.6, ridgeAxis: 'x', roof: 'thatch', storeys: 1.5,
    door: DOOR[0], crook: 1.15, lit: 2, shutters: 'mixed', wall: 'limewash',
  },
  { // south side, west of the gennel.  x 24.5..29.5, z 25.7..30.7
    id: 'h3', seed: 'row-cottage-3', x: 27.0, z: 28.2, yaw: Math.PI,
    w: 5.0, d: 5.0, ridgeAxis: 'x', roof: 'thatch', storeys: 1.5,
    door: DOOR[1], crook: 1.3, lit: 1, shutters: 'closed', wall: 'limewash',
  },
  { // south side, east of the gennel — the row's one two-storey, and the
    // tallest thing between the market and the gate.  x 33.0..37.8
    id: 'h4', seed: 'row-cottage-4', x: 35.4, z: 28.2, yaw: Math.PI,
    w: 4.8, d: 5.0, ridgeAxis: 'x', roof: 'shingle', storeys: 2,
    door: DOOR[2], crook: 0.95, lit: 2, shutters: 'open', wall: 'render',
  },
  { // the inn lane's west end, backing onto the south wall.
    // x 18.8..24.4, z 40.5..45.5 — 3.3 m clear of the wall's scarp
    id: 'h5', seed: 'row-cottage-5', x: 21.6, z: 43.0, yaw: Math.PI,
    w: 5.6, d: 5.0, ridgeAxis: 'x', roof: 'thatch', storeys: 1.5,
    door: DOOR[3], crook: 1.1, lit: 1, shutters: 'mixed', wall: 'limewash',
  },
  { /* EAST side of the keep lane, and it started on the west side at
     * (30.5, 7.0).  It was moved because check-city's landmark contract
     * said so: from marketlow's east stair head and its north steps the
     * ray to the East Gate crosses x 28.6..32.4 at z 7.7..10.4, which was
     * squarely through this cottage, and the gate — the thing wave 3
     * comes through — could not be seen from the market it is two
     * hundred metres from.  Over here the same rays cross at z 16.4 and
     * the house is clear of every one of them.  x 38.8..43.2, z 3.1..7.7;
     * a quarter turn, so `d` runs in x and `w` in z. */
    id: 'h6', seed: 'row-cottage-6', x: 41.0, z: 5.4, yaw: -HALF,
    w: 4.6, d: 4.4, ridgeAxis: 'z', roof: 'shingle', storeys: 1.5,
    door: DOOR[4], crook: 0.85, lit: 2, shutters: 'closed', wall: 'granite',
  },
];

/* THE SMITHY'S SHELL, and its numbers are the plan's `enterable` entry:
 * 7 x 5.4 at [30, -8] with the door on z+ at (31, -5.3), so the offset
 * from that wall's own midpoint is +1.0 and the room is x 26.78..33.22,
 * z -10.42..-5.58 once the 0.28 m walls come off. */
const SMITHY = {
  w: 7, d: 5.4, h: 3.3, at: [30, -8], wallT: 0.28,
  door: { face: 'z+', offset: 1.0, width: 1.6, height: 2.1 },
};

/* local (u along the front, v out of the front) -> world, for a yaw that
 * is a multiple of PI/2.  The same mapping `place` uses for its collider
 * AABB, so a doorstep worked out here lands where the door actually is. */
function toWorld(cx, cz, yaw, u, v) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [cx + u * c + v * s, cz - u * s + v * c];
}

export const wardrow = defineDistrict({
  id: 'wardrow',
  envelope: E,
  after: ['southgate', 'marketlow', 'keephill'],

  build(ctx, { plan }) {
    const G = (x, z) => ctx.groundAt(x, z);

    /** put a prop down: position, turn, seat by query, add. */
    const put = (obj, name, x, z, ry = 0, sink = 0.02) => {
      obj.position.set(x, 0, z);
      obj.rotation.y = ry;
      seatOnGround(obj, ctx.groundAt, { sink });
      ctx.add(obj, name);
      return obj;
    };
    /** a wall-mounted thing: origin ON the face, projecting +z, turned so
     *  its +z IS the wall's outward normal — signkit's convention, and
     *  `ry = atan2(nx, nz)` is the only place that normal is consulted. */
    const onWall = (obj, name, x, y, z, ry) => {
      obj.position.set(x, y, z);
      obj.rotation.y = ry;
      ctx.add(obj, name);
      return obj;
    };

    /* ================================================================ *
     * 1. THE PERIMETER — the wall is TERRAIN and this is its masonry.
     * ================================================================ */
    const S = plan.siege;

    // east run NORTH of the gate: 'none' at both ends — keephill's run
    // continues it at z = -18 (the wr-walk-n socket) and the gatehouse
    // closes it at 18.5.
    ctx.add(curtainWall({
      from: -18, to: 18.5, side: 'e', ctx, plan, seed: 'wr-curtain-en',
      endCaps: ['none', 'none'], hoardings: true,
    }), 'curtain-east-north');

    // east run SOUTH of the gate, carried into the corner the SE tower
    // stands on.
    ctx.add(curtainWall({
      from: 25.5, to: 51.2, side: 'e', ctx, plan, seed: 'wr-curtain-es',
      endCaps: ['none', 'none'], hoardings: true,
    }), 'curtain-east-south');

    // south run, east half: 'none' at x = 18 because southgate's run
    // continues it through the wr-walk-s socket.
    ctx.add(curtainWall({
      from: 18, to: 48.8, side: 's', ctx, plan, seed: 'wr-curtain-s',
      endCaps: ['none', 'none'], hoardings: true,
    }), 'curtain-south-east');

    /* THE SE CORNER TOWER.  Pushed OUT along the diagonal to
     * (52.6, 52.6), which is SIEGE.md's measured geometry: a drum centred
     * on (50, 50) is a collider across the only place the walk turns,
     * and this one touches the outer corner, reads as a tower ON the
     * corner from every angle, and leaves 1.40 m of walk behind it. */
    place(ctx, roundTower({
      seed: 'wr-se-tower', r: 1.9, h: 8.6, taper: 0.12, crook: 0.8,
      wall: 'granite', cap: 'cone', bands: 2, machicolation: true,
      windows: [
        { y: 3.2, a: Math.PI * 1.25, w: 0.2, h: 1.0 },
        { y: 6.4, a: Math.PI * 1.25, w: 0.2, h: 1.0 },
        { y: 6.4, a: Math.PI * 0.75, w: 0.2, h: 1.0 },
      ],
    }), { x: 52.6, z: 52.6, yaw: 0, name: 'se-tower' });

    /* THE EAST GATE.  `gatehouse` derives its whole orientation from the
     * plan's gate entry, so there is no per-gate arithmetic here to get
     * backwards.  It is added as `eastgate` because that is the name both
     * the plan's landmark and the `down-the-row` vista point at
     * (composeCity stamps it `district:wardrow:eastgate`). */
    const gate = gatehouse({
      gate: S.gates['east-gate'], ctx, plan, id: 'east-gate',
      seed: 'wr-eastgate', name: 'eastgate', towers: false,
    });

    /* ---- THE GATE'S TWO FLANKING TOWERS, AND WHY THEY ARE MINE -------
     * `gatehouse({ towers: true })` stands a pair of 9.6 m drums on the
     * town side at local x +-5.6, world (46.6, 16.4) and (46.6, 27.6).
     * The NORTH one lands inside `keep-sees-eastgate`: measured, its
     * centre is 2.50 m off that corridor's axis against a half-width of
     * 3.0, so at the corridor's own test height of 7.5 m a 1.49 m shaft
     * radius sits 1.99 m inside the band and the ray from the keep is
     * stopped 4 m short of the gate it exists to show.  check-city named
     * it in one line; no frame would have.
     *
     * There is nowhere to move it to.  Off the corridor means either 4 m
     * INTO the town (a gate turret standing in the kitchen gardens) or
     * onto the wall-walk itself, which is the one thing SIEGE.md's own
     * note says a turret must never do.  So the towers are shorter
     * instead: `roundTower` at the kit's own two centres, shaft 5.9 and
     * a 1.5 m cap, capTop 7.40 — under the corridor's 7.5 by 0.10 m, and
     * still 1.25 m proud of the gate deck's parapet at 6.15, which is
     * what makes the gate read as an arch WITH TOWERS from the lane. */
    /* 5.2 and not 5.9: `roundTower`'s own top is NOT `h + capH`.  The
     * machicolation corbel course and the cap's flare put 0.7 m on top of
     * the arithmetic, and the first cut measured 8.09 — still 0.6 m into
     * the corridor.  Measure the built bbox; do not add the parameters up.
     *
     * They are ATTACHED to the gatehouse rather than added beside it, and
     * that is not tidiness: `district:wardrow:eastgate` is the landmark
     * the plan says must read from marketlow, the check aims at its
     * bounding box's centre and its 80 % height, and with the towers
     * standing outside the group that box lost 1.3 m of height and the
     * read went from 5/5 of marketlow's points to 1/5.  A gate's towers
     * are part of the gate.  `attach` keeps the world transform through
     * the gatehouse's own quarter turn, which `add` would not. */
    gate.updateMatrixWorld(true);
    for (const [tz, tag] of [[16.4, 'n'], [27.6, 's']]) {
      const t = roundTower({
        seed: `wr-gate-turret-${tag}`, r: 1.6, h: 5.2, taper: 0.09, crook: 0.2,
        wall: 'granite', cap: 'cone', capH: 1.5, bands: 2, machicolation: true,
        windows: [
          { y: 2.6, a: Math.PI * 0.5, w: 0.18, h: 1.0 },
          { y: 4.2, a: Math.PI * 1.5, w: 0.18, h: 1.0 },
        ],
      });
      t.name = `gate-turret-${tag}`;
      t.position.set(46.6, ctx.groundAt(46.6, tz) - 0.03, tz);
      t.updateMatrixWorld(true);
      gate.attach(t);
      const fp = t.userData.footprint;
      ctx.collide(46.6 + fp.x0, tz + fp.z0, 46.6 + fp.x1, tz + fp.z1);
    }

    /* ---- THE ANCHOR AT (50, 22): THE SLOT IS CLOSED (integration) -----
     *
     * The plan promises `(50, 22) expect_top 0` — the gate passage's own
     * floor — and `gatehouse` registers its deck as ONE platform at 5.0
     * spanning the whole passage, which it must: that platform is what
     * makes the wall-walk one ring instead of two arcs.  This district
     * first shipped with the deck split into two rects and a 40 mm SLOT
     * between them at x 49.98..50.02, because composeCity asserted anchors
     * with the two-argument `groundAt` (a max over platforms, 5.000 here)
     * and check-game's passage test was height-blind — the two contracts
     * together demanded a point on the deck with no platform and no
     * collider, i.e. a hole a walker's centre could drop 5 m through.
     *
     * Both gates are height-aware now (core/district.js asserts an anchor
     * FROM the height it promises, `groundAt(x, z, expect_top)`; check-game
     * tests the passage at the feet of whoever walks it), the plan carries a
     * second anchor at (50, 22) expecting the DECK at 5.0, and the kit's
     * single deck platform stands as registered.  Verified by check-city's
     * fill, check-siege's walk-only fill, and a 5 mm trace across both
     * decks at feet height (scripts/probe-decks.mjs).
     *
     * The gate's signal brazier stays against the outer parapet at x 51.4,
     * where it was put to clear the mid-line: a brazier in the middle of a
     * 2.4 m walk is a brazier you cannot walk past. */
    {
      const bzr = villageProps.brazier({ seed: 'wr-gate-brazier', r: 0.34, h: 0.58, lit: true, ctx });
      bzr.position.set(51.4, 5.0, 22.0);
      ctx.add(bzr, 'gate-brazier');
      ctx.collide(51.0, 21.6, 51.8, 22.4, 5.7, 5.0);
    }

    /* ---- THE STANDARD ON THE GATE, AND WHY IT IS NOT DECORATION ------
     * `check-game`'s arena landmark test fires ONE ray from the arena's
     * rect centre at the subject's bounding-box CENTRE and scores it only
     * if that ray HITS something — and the bounding-box centre of a
     * gatehouse is the hole in the middle of it.  Measured: the ray flew
     * clean through the open passage, out over the moor, hit nothing at
     * all, and the gate the whole district is arranged around read as
     * 0/1 landmarks.  (check-city's own landmark check disagrees: it
     * counts a clear ray as visible, which is why that one passed.  Two
     * gates, opposite conventions, same subject.)  Same family as the
     * kit's "a camera's subject must be something SOLID".
     *
     * The fix is to make the centre land on masonry, and the arithmetic
     * says how: the group's min.y is -0.23, the deck's own coping slab is
     * solid across the whole passage at y 4.80..5.00, so a bounding box
     * reaching about 10.2 m puts the centre inside it.  A gate flies a
     * standard; this one is 5.2 m of staff on the deck, ATTACHED to the
     * gatehouse so it is part of the landmark's mass.
     *
     * COORDINATOR: the field is `JOINERY.doveGrey` and the band
     * `JOINERY.oakStain` — muted joinery, NOT `ACCENT.wardenMadder`,
     * which is southgate's banner pair.  The device is the wardens'
     * portcullis, which is the town's charge and nobody's accent. */
    {
      const pole = villageProps.bannerPole({
        seed: 'wr-gate-standard', h: 5.2, field: JOINERY.doveGrey,
        band: JOINERY.oakStain, bw: 1.05, bh: 2.7, device: 'portcullis',
        /* `base: 'stone'` is not decoration: without it the staff's own
         * geometry starts 0.30 m above its origin, and standing on the
         * deck inside the gate brazier's light pool that reads to the
         * audit as a banner hovering over the floor. */
        deviceInk: JOINERY.bone, folds: 4, base: 'stone',
      });
      /* AND IT FACES WEST.  `bannerPole` hangs its cloth on the group's
       * +z, so at the identity it hangs south and from the row lane —
       * the one place this thing has to read from — it is edge-on: five
       * metres of bare staff and a line of sky.  Turned a quarter, the
       * field and the portcullis face down the lane and back toward the
       * market, which is where both of the contracts that need it are. */
      pole.rotation.y = -HALF;
      pole.position.set(51.35, 5.0, 24.35);
      pole.updateMatrixWorld(true);
      gate.attach(pole);
    }

    /* the gate's own two wall torches, LIT: this is the last gate still
     * open at dusk and the vista's caption says so.  Flames and pools are
     * built whatever `lit` said, so `setLit(true)` is never a no-op. */
    for (const t of gate.userData.practicals ?? []) t.userData.setLit?.(true);

    /* THE STAIR TURRET on the landing the terrain drew at x 45.8..48.8,
     * z 40..43 — the south run's only way up until the gatehouses bridge
     * the gaps, which is why the plan put a stair here at all. */
    ctx.add(stairTurret({
      landing: { x0: 45.8, z0: 40, x1: 48.8, z1: 43, y: 5 },
      flight: (plan.terrain.crossings ?? []).find((c) => c.id === 'row-wall-stair'),
      ctx, plan, seed: 'wr-turret',
    }), 'stair-turret');

    /* ================================================================ *
     * 2. THE HOUSES.  Built before the lanes because the lane pass reads
     * their `userData` for the doorsteps.
     * ================================================================ */
    const built = {};
    for (const h of HOMES) {
      const g = cottage({
        seed: h.seed, w: h.w, d: h.d, storeys: h.storeys,
        ridgeAxis: h.ridgeAxis, roof: h.roof, wall: h.wall,
        crook: h.crook, door: h.door, shutters: h.shutters,
        shutter: JOINERY.doveGrey, litWindows: h.lit,
        windowBoxes: h.id === 'h1' || h.id === 'h5',
      });
      place(ctx, g, { x: h.x, z: h.z, yaw: h.yaw, name: h.id });
      built[h.id] = { g, ...h, u: g.userData };
    }

    /* ================================================================ *
     * 3. THE LANES AND THE GROUND BREAKUP.  Decals: each slab runs from
     * y -0.10 up to a top a few centimetres proud, so no face of it is
     * coplanar with the terrain the audit casts down onto.
     * ================================================================ */
    {
      const P = parts();
      const slab = (r, top, mat) => P.add(mat, bx(
        r.x1 - r.x0, top + 0.10, r.z1 - r.z0,
        (r.x0 + r.x1) / 2, (top - 0.10) / 2, (r.z0 + r.z1) / 2,
      ));
      for (const r of LANES) {
        slab(r, r.mat === 'earth' ? 0.022 : 0.028, r.mat === 'earth' ? M.earth : M.gravel);
      }
      // the gate's own apron in stone, because a gate road is metalled
      // where nothing else in a row is: from the passage mouth to the
      // first barricade point, and it stops there.
      slab({ x0: 42.6, z0: 19.6, x1: 47.6, z1: 24.8 }, 0.034, M.paving);

      /* RUTS.  A BROKEN line, a hand's width of lateral wander, and
       * barely a shade off the gravel they are worn into — one continuous
       * band of a second tone down a lane is a road marking, not wear. */
      const rr = rng('wr-ruts');
      const wear = M.paving;
      const rut = (ax, az, bxx, bz, sep) => {
        const len = Math.hypot(bxx - ax, bz - az);
        const ux = (bxx - ax) / len;
        const uz = (bz - az) / len;
        for (const side of [-1, 1]) {
          let t = rr.range(0.2, 0.9);
          while (t < len - 0.5) {
            const l = Math.min(rr.range(0.9, 2.4), len - 0.35 - t);
            const wob = rr.range(-0.12, 0.12);
            const cx = ax + ux * (t + l / 2) - uz * (side * sep + wob);
            const cz = az + uz * (t + l / 2) + ux * (side * sep + wob);
            P.add(wear, bx(
              Math.abs(ux) > 0.5 ? l : 0.24, 0.14, Math.abs(ux) > 0.5 ? 0.24 : l,
              cx, -0.043, cz, { ry: rr.range(-0.05, 0.05) },
            ));
            t += l + rr.range(0.5, 1.9);
          }
        }
      };
      rut(25.4, 22.2, 46.8, 22.2, 0.62);      // the row lane
      rut(35.9, 19.0, 35.9, -17.4, 0.58);     // the keep lane
      rut(22.8, 3.0, 22.8, 37.6, 0.5);        // the back row
      rut(19.0, 36.3, 38.2, 36.3, 0.56);      // the inn lane
      rut(45.6, 39.2, 45.6, 46.8, 0.5);       // the pomerium

      /* A DOORSTEP IS A STONE with an irregular scuff of trodden earth in
       * front of it — not a pale square painted on the turf. */
      const step = M.rubble;
      for (const h of HOMES) {
        const b = built[h.id];
        const [sx, sz] = toWorld(h.x, h.z, h.yaw, b.u.doorX, b.u.frontZ + 0.26);
        const along = Math.abs(Math.cos(h.yaw)) > 0.5;
        P.add(step, bx(along ? 1.0 : 0.48, 0.17, along ? 0.48 : 1.0, sx, -0.062, sz));
        for (let i = 0; i < 3; i += 1) {
          const [wx, wz] = toWorld(h.x, h.z, h.yaw,
            b.u.doorX + rr.range(-0.55, 0.55), b.u.frontZ + rr.range(0.6, 1.5));
          P.add(wear, bx(rr.range(0.5, 0.95), 0.13, rr.range(0.45, 0.85), wx, -0.045, wz,
            { ry: rr.range(0, Math.PI) }));
        }
      }
      const g = new THREE.Group();
      P.flush(g, { cast: false });
      ctx.add(g, 'lanes');
    }

    /* drifted litter at wall feet — the thing that stops a wall meeting
     * the ground in a perfect line.  TUFTS, NOT PLATES: a pale flat quad
     * lying face-up takes the cel ramp's TOP band and reads as a sheet of
     * paper; a low cone in a dark tone reads as drift. */
    {
      const P = parts();
      const r = rng('wr-litter');
      const drift = (x0, z0, x1, z1, mats, n) => {
        for (let i = 0; i < n; i += 1) {
          const x = r.range(x0, x1);
          const z = r.range(z0, z1);
          const rad = r.range(0.09, 0.24);
          P.add(r.pick(mats), cyl(rad * 0.35, rad, r.range(0.05, 0.13),
            x, G(x, z) + 0.03, z, { seg: 6, rz: r.range(-0.16, 0.16) }));
        }
      };
      const damp = [M.moss, M.earth];
      const dry = [M.earth, M.moss];
      drift(25.4, 19.2, 31.6, 19.6, dry, 10);        // under h1's eaves
      drift(24.6, 24.8, 37.8, 25.4, dry, 16);        // the south row's feet
      drift(47.6, 19.6, 48.6, 24.8, damp, 8);        // the gate's jambs
      drift(43.6, 39.0, 47.6, 47.4, damp, 20);       // the pomerium, wall foot
      drift(27.0, 39.9, 39.2, 40.4, dry, 12);        // under the inn's arcade
      const g = new THREE.Group();
      P.flush(g, { cast: false });
      ctx.add(g, 'litter');
    }

    /* ================================================================ *
     * 4. A. STANHOPE'S SMITHY — the district's enterable, the smith's
     * post and his shelter, and the building the barricade beat starts
     * at.  `hollowShell` cuts its collider run from the SAME opening list
     * as its geometry: one footprint collider round an enterable is a
     * room that renders perfectly and that every gate here reports as
     * unreachable.
     * ================================================================ */
    const smithy = hollowShell({
      w: SMITHY.w, d: SMITHY.d, h: SMITHY.h, at: SMITHY.at,
      groundY: G(SMITHY.at[0], SMITHY.at[1]), wallT: SMITHY.wallT, ceilH: 2.7,
      door: SMITHY.door,
      windows: [
        { face: 'z+', offset: -2.1, width: 1.0, height: 0.9, sill: 1.15 },
        { face: 'x-', offset: 0.6, width: 0.9, height: 0.9, sill: 1.15 },
        /* the EAST window is the cheapest thing in this district: it costs
         * no meshes (the shell is cut from one box list either way) and it
         * puts the forge's own ember light onto the keep lane, which is
         * the elevation everybody arriving from Keep Hill walks past.  Its
         * offset keeps it clear of the tool wall at z -9.5..-7.2 inside. */
        { face: 'x+', offset: 1.4, width: 1.0, height: 0.9, sill: 1.15 },
      ],
      mats: { wall: M.granite, inner: M.plaster, floor: M.pavingDark, ceiling: M.oakDark },
      ctx, name: 'smithy',
    });
    ctx.add(smithy.group, 'smithy');
    {
      // shingle, not thatch: a forge under a thatch is a forge that has
      // burnt down once already.
      const rf = shingleRoof({
        w: SMITHY.w + 0.5, d: SMITHY.d + 0.5, pitch: 0.6, ridgeAxis: 'x',
        overhang: 0.34, mat: M.shingleDark, ridgeMat: M.slate, trimMat: M.oakDark,
      });
      rf.position.set(SMITHY.at[0], smithy.wallTopY, SMITHY.at[1]);
      ctx.add(rf, 'smithy-roof');

      const FG = parts();
      FG.add(M.granite, gableFill({ span: SMITHY.d, along: SMITHY.w, ridgeY: rf.userData.ridgeY }, 'x'));
      const fg = new THREE.Group();
      FG.flush(fg);
      fg.position.set(SMITHY.at[0], smithy.wallTopY, SMITHY.at[1]);
      ctx.add(fg, 'smithy-gables');

      /* the flue, over the forge inside.  Its top is 6.50, and that is a
       * CONTRACT and not a look: `keep-sees-eastgate` wants nothing over
       * 7.5 m on the diagonal and the brief names this chimney. */
      const CP = parts();
      const cx = 32.1;
      const cz = -10.02;
      CP.add(M.rubble, bx(0.86, 6.3, 0.74, cx, 3.15, cz, { seg: 3 }));
      CP.add(M.graniteDark, bx(1.02, 0.14, 0.9, cx, 6.36, cz));
      for (const s of [-1, 1]) {
        CP.add(M.graniteDark, cyl(0.11, 0.13, 0.3, cx + s * 0.2, 6.58, cz, { seg: 8 }));
      }
      const cg = new THREE.Group();
      CP.flush(cg);
      ctx.add(cg, 'smithy-chimney');
    }

    /* the door leaf, left standing OPEN — the smith went out to the yard
     * ten minutes ago and has not been back.  No collider, ever: the
     * doorway gap IS the route, and a collider on the leaf seals it
     * exactly when the door is open. */
    /* HINGED ON THE EAST JAMB AND SWUNG NEARLY FLAT.  It started hinged
     * west at the default 1.92 rad, which stands a 1.6 x 2.0 m planked
     * leaf in the middle of the room three metres from the plan's own
     * interior camera: a third of that frame was one black slab and the
     * forge behind it.  The camera gate cannot see this — it asks whether
     * the ray to the subject is clear, and it was.  Only the frame does.
     * Hinge right and swing 2.3 rad lays the leaf back along the east
     * jamb, edge-on to the camera and clear of the hearth. */
    ctx.add(makeDoorLeaf({
      doorway: smithy.doorway, hinge: 'right', swing: 2.3, mat: painted(JOINERY.pitch),
      ironMat: M.ironRust, ctx, open: true, name: 'smithy-door',
      label: 'E · the smithy door',
    }), 'smithy-door');

    /* ---- the forge room ------------------------------------------- */
    let flare = 0;
    {
      const mats = room.interiorMats();
      const interior = new THREE.Group();
      const F = smithy.floorTopY;
      const R = smithy.room;             // x 26.78..33.22, z -10.42..-5.58

      /* THE FORGE.  Named `smithy-hearth` because that is the subject the
       * plan's interior camera declares, and a camera whose subject is
       * not in the scene fails with a message about the NAME rather than
       * about the room.  It is a CHILD of the dressing group, so
       * composeCity's anonymous-mesh stamp leaves its own name alone. */
      const hearth = new THREE.Group();
      {
        const P = parts();
        const hx = 32.1;
        const hz = -10.02;              // the block's front face at -9.62
        P.add(M.rubble, bx(1.9, 0.86, 0.8, hx, F + 0.43, hz));
        P.add(M.rubble, bx(2.04, 0.1, 0.88, hx, F + 0.91, hz));
        // the hood, raked back to the wall on two legs
        P.add(M.iron, bx(2.0, 0.06, 0.95, hx, F + 1.92, hz + 0.06, { rx: -0.5 }));
        for (const s of [-1, 1]) P.add(M.iron, bx(0.06, 1.05, 0.06, hx + s * 0.95, F + 1.42, hz + 0.42));
        P.flush(hearth);
      }
      tagProp(hearth, 'forge-hearth');
      hearth.name = 'smithy-hearth';
      interior.add(hearth);

      /* the coals, on LOCAL materials.  `M.ember` is shared across the
       * whole town and animating it would flare every fire in Hollowbrook
       * at once. */
      const coalHot = glowing(0xd9803f, 0xd9803f, 0.5);
      const coalLo = glowing(0xa15a38, 0xa15a38, 0.3);
      {
        const P = parts();
        const cr = rng('wr-forge-fire');
        P.add(painted(0x584a52), bx(1.5, 0.16, 0.6, 32.1, F + 0.99, -10.02));
        for (let i = 0; i < 18; i += 1) {
          P.add(cr.chance(0.4) ? coalHot : coalLo,
            bx(cr.range(0.08, 0.18), cr.range(0.05, 0.1), cr.range(0.08, 0.16),
              32.1 + cr.range(-0.58, 0.58), F + 1.04 + cr.range(0, 0.03),
              -10.02 + cr.range(-0.22, 0.22), { ry: cr.range(0, Math.PI) }));
        }
        // the block's own front face catches its fire, or it is the
        // darkest thing in the room
        P.add(coalLo, bx(0.9, 0.07, 0.04, 32.1, F + 0.8, -9.6));
        /* the coals are a CHILD of the hearth and are NOT tagged: two
         * tagged units where one is entirely inside the other is a 100 %
         * OVERLAP for ever, and the fire IS the hearth as far as the
         * audit and the interior camera's subject are concerned. */
        const g = new THREE.Group();
        P.flush(g, { cast: false });
        g.userData.airborne = true;
        hearth.add(g);
      }
      /* the pool is a DECAL and the audit down-casts onto it like any
       * other surface, so it must not reach under a prop: at r 1.9 from
       * (32.1) it ran to x 30.2 and the bellows came back "hovering
       * 0.55 m above light-pool". */
      const forgePool = room.lightPool({ r: 1.5, ember: true, opacity: 0.45 });
      forgePool.material = forgePool.material.clone();
      forgePool.position.set(32.4, F + 0.02, -9.4);
      interior.add(forgePool);

      /* FLAMES ONLY EXIST WHILE THE BELLOWS ARE WORKING.  Lifting the
       * coals' emissive alone is nearly invisible — a cel material at 0.5
       * is already near the top of its ramp — so what reads is a SHAPE
       * that was not there before. */
      const flames = new THREE.Group();
      {
        const P = parts();
        const fr = rng('wr-flames');
        const flameMat = glowing(0xffbe6a, 0xffbe6a, 0.95);
        for (let i = 0; i < 11; i += 1) {
          const fh = fr.range(0.13, 0.4);
          // cyl(rTOP, rBOTTOM, ...) — the other way round it is a row of
          // funnels standing on their points
          P.add(flameMat, cyl(0.006, fr.range(0.045, 0.085), fh,
            fr.range(-0.52, 0.52), fh / 2 - 0.03, fr.range(-0.2, 0.2),
            { seg: 5, rz: fr.range(-0.22, 0.22) }));
        }
        P.flush(flames, { cast: false, receive: false });
      }
      flames.position.set(32.1, F + 1.09, -10.02);
      flames.visible = false;
      flames.userData.airborne = true;
      hearth.add(flames);

      /* THE BELLOWS, west of the forge against the north wall, with its
       * arm as its OWN pivot group OUTSIDE the pooled merge — geometry
       * that has been merged per material cannot move. */
      const bellowsArm = new THREE.Group();
      {
        const P = parts();
        const bxp = 29.9;
        const bzp = -10.02;
        /* IT STANDS ON A FRAME.  Without one its lowest geometry is the
         * bottom board at F + 0.57 and the audit reads the bellows
         * hovering half a metre over the hearth's light pool — which is
         * exactly what a bellows with no legs would be doing. */
        for (const s2 of [-1, 1]) {
          P.add(M.oakDark, bx(0.1, 0.62, 0.1, bxp + s2 * 0.44, F + 0.31, bzp - 0.22));
          P.add(M.oakDark, bx(0.1, 0.62, 0.1, bxp + s2 * 0.44, F + 0.31, bzp + 0.22));
        }
        P.add(M.oakDark, bx(1.05, 0.1, 0.62, bxp, F + 0.62, bzp));
        P.add(M.hessian, bx(0.95, 0.26, 0.56, bxp, F + 0.78, bzp));
        P.add(M.oakDark, bx(1.05, 0.1, 0.62, bxp, F + 0.94, bzp, { rz: 0.05 }));
        P.add(M.iron, tubeGeo([bxp + 0.5, F + 0.8, bzp], [bxp + 1.1, F + 0.84, bzp - 0.12], 0.035, 5));
        const g = new THREE.Group();
        P.flush(g);
        tagProp(g, 'bellows');
        interior.add(g);

        /* the arm is a CHILD of the bellows, not a sibling.  As a sibling
         * it hangs directly over the body and the audit's down-cast lands
         * on the arm first: "bellows BURIED 0.53 m under pool-0", which is
         * a true statement about two halves of one object. */
        bellowsArm.position.set(bxp - 0.62, F + 1.06, bzp);
        const A = parts();
        A.add(M.oak, bx(1.5, 0.085, 0.085, 0.75, 0, 0));
        A.add(M.oakDark, bx(0.22, 0.12, 0.12, 1.44, 0, 0));
        A.add(M.ironDark, tubeGeo([0.12, 0, 0], [0.5, -0.26, 0], 0.03, 5));
        A.flush(bellowsArm, { receive: false });
        g.add(bellowsArm);
      }

      /* the anvil on its elm stump, deliberately OFF the interior
       * camera's line to the hearth — measured 1.13 m clear of it and
       * 0.28 m under it, so it frames the fire instead of hiding it. */
      {
        const P = parts();
        const ax = 30.6;
        const az = -7.4;
        P.add(M.oakDark, cyl(0.34, 0.36, 0.5, ax, F + 0.25, az, { seg: 9 }));
        P.add(M.iron, bx(0.72, 0.14, 0.28, ax, F + 0.57, az));
        P.add(M.iron, bx(0.4, 0.12, 0.22, ax, F + 0.68, az));
        P.add(M.iron, bx(0.62, 0.1, 0.3, ax, F + 0.79, az));
        P.add(M.iron, cyl(0.09, 0.05, 0.34, ax + 0.45, F + 0.79, az, { seg: 7, rz: HALF }));
        P.add(M.iron, bx(0.09, 0.09, 0.5, ax - 0.1, F + 0.92, az + 0.1, { rx: 0.3, ry: 0.5 }));
        const g = new THREE.Group();
        P.flush(g);
        tagProp(g, 'anvil');
        interior.add(g);
      }

      // the quench trough
      {
        const P = parts();
        P.add(M.oakDark, bx(1.5, 0.5, 0.6, 28.3, F + 0.25, -9.95));
        P.add(M.iron, bx(1.36, 0.06, 0.46, 28.3, F + 0.44, -9.95));
        P.add(M.iron, bx(1.52, 0.05, 0.62, 28.3, F + 0.12, -9.95));
        const g = new THREE.Group();
        P.flush(g);
        tagProp(g, 'quench-trough');
        interior.add(g);
      }
      // the tool wall: a rail on the east wall, everything hung OUTWARD
      // from the face, because you cannot carve a recess into a box
      {
        const P = parts();
        const wx = R.x1 - 0.05;
        const tr = rng('wr-tools');
        P.add(M.oakDark, bx(0.07, 0.09, 2.4, wx - 0.05, F + 1.62, -8.2));
        for (let i = 0; i < 9; i += 1) {
          const tz = -9.5 + i * 0.26;
          const l = tr.range(0.3, 0.62);
          P.add(M.ironDark, cyl(0.021, 0.026, l, wx - 0.12, F + 1.62 - l / 2, tz, { seg: 5 }));
          if (tr.chance(0.5)) {
            P.add(M.ironDark, bx(0.1, 0.09, 0.2, wx - 0.12, F + 1.62 - l, tz, { ry: tr.range(-0.3, 0.3) }));
          }
        }
        /* AIRBORNE: it is bolted to the wall, and without the flag the
         * audit's run check reads five stations hanging in mid-air. */
        const g = new THREE.Group();
        P.flush(g, { receive: false });
        tagProp(g, 'tool-wall');
        g.userData.airborne = true;
        interior.add(g);
      }
      // the finished spearheads, racked and ready to go up the lane
      {
        const P = parts();
        const sx = 28.2;
        const sz = -5.95;
        P.add(M.oakDark, bx(1.2, 0.1, 0.4, sx, F + 0.9, sz));
        P.add(M.oakDark, bx(1.2, 0.1, 0.4, sx, F + 0.16, sz));
        for (const s of [-1, 1]) P.add(M.oakDark, bx(0.09, 0.95, 0.09, sx + s * 0.55, F + 0.47, sz));
        const sr = rng('wr-spears');
        for (let i = 0; i < 11; i += 1) {
          const px = sx - 0.5 + i * 0.1;
          const lean = sr.range(-0.09, 0.09);
          P.add(M.oakDark, cyl(0.022, 0.024, 1.5, px, F + 0.75, sz + sr.range(-0.1, 0.1), { seg: 5, rz: lean }));
          P.add(M.iron, cyl(0.006, 0.035, 0.3, px + Math.sin(-lean) * 0.9, F + 1.62, sz, { seg: 5, rz: lean }));
        }
        const g = new THREE.Group();
        P.flush(g);
        tagProp(g, 'spear-rack');
        interior.add(g);
      }
      // the coal, heaped in the south-east corner CLEAR of the door's
      // own swing — the leaf sweeps x 31.8..32.9 at z -5.3..-6.5
      {
        const P = parts();
        const cr = rng('wr-coal');
        const coal = painted(0x3d3844);
        for (let i = 0; i < 26; i += 1) {
          const a = cr.range(0, Math.PI * 2);
          const rad = cr.range(0, 0.45);
          const s2 = cr.range(0.1, 0.24);
          P.add(coal, bx(s2, s2 * 0.8, s2 * 0.9,
            32.5 + Math.cos(a) * rad, F + 0.05 + (0.45 - rad) * 0.6 * cr.range(0.4, 1),
            -8.3 + Math.sin(a) * rad * 0.8,
            { rx: cr.range(-0.4, 0.4), ry: cr.range(0, 3), rz: cr.range(-0.4, 0.4) }));
        }
        const g = new THREE.Group();
        P.flush(g);
        tagProp(g, 'coal-heap');
        interior.add(g);
      }
      interior.add(room.benchSeat({ w: 1.5, seed: 'wr-forge-bench', at: [27.5, F, -7.8], ry: HALF, mats }));
      interior.add(room.hangingLamp({
        from: smithy.ceilUnderY, drop: 0.5, seed: 'wr-forge-lamp', lit: true,
        at: [29.9, F, -8.2], mats,
      }));

      ctx.add(interior, 'smithy-interior');
      registerInterior(ctx, interior, { door: smithy.doorway, name: 'smithy' });

      /* a banked fire breathes on its own; the bellows push it up and it
       * settles back over about four seconds. */
      let clock = 0;
      ctx.update((dt) => {
        clock += dt;
        flare = Math.max(0, flare - dt * 0.26);
        const breathe = 0.06 * Math.sin(clock * 1.1);
        coalHot.emissiveIntensity = 0.58 + breathe + flare * 0.9;
        coalLo.emissiveIntensity = 0.3 + flare * 0.7;
        forgePool.material.opacity = 0.42 + flare * 0.4;
        forgePool.scale.setScalar(1 + flare * 0.34);
        const pump = flare > 0.02 ? 0.5 + 0.5 * Math.sin(clock * 7.5) : 0;
        bellowsArm.rotation.z = -flare * 0.3 * pump;
        flames.visible = flare > 0.03;
        if (flames.visible) {
          flames.scale.set(0.8 + 0.2 * pump, flare * (0.75 + 0.35 * pump), 0.8 + 0.2 * pump);
        }
      });
      ctx.reset(() => { flare = 0; bellowsArm.rotation.z = 0; flames.visible = false; });

      /* THE PLAN'S INTERACTION, at (31, -4): you stand in the doorway and
       * work the bellows.  The hearth is 5.7 m away through the opening —
       * inside check-interactions' 8 m radius, and VISIBLE from the
       * prompt, which is the half a raycast cannot tell you: from (31,-4)
       * the 1.6 m door subtends out to x 34.4 at the hearth's own z. */
      interactive(ctx, {
        name: 'the forge bellows',
        label: 'E · work the forge bellows',
        at: [31, G(31, -4) + 1.1, -4],
        size: [2.0, 2.2, 1.6],
        action: () => { flare = 1; },
      });
    }

    /* the smith's board and his chalked list, on the granite either side
     * of the door.  `ry` is the wall's outward normal, atan2(nx, nz) — a
     * z+ face is 0. */
    onWall(signKit.hangingSign({
      tenant: 'stanhope', w: 1.2, h: 0.88, seed: 'wr-stanhope-board', ctx, sway: 0.045,
    }), 'stanhope-sign', 33.05, 2.65, -5.29, 0);

    /* ================================================================ *
     * 5. THE SMITHY YARD — the smith's post, and the ground the brute
     * stands on.  The plan's post is (33, -4.2) facing +z, 1.1 m off his
     * own wall; everything here keeps 1.5 m clear of it.
     * ================================================================ */
    {
      const y = G(30, -3);
      /* the woodpile stands BESIDE the bay, never in it: an
       * open-fronted shed's bounding box is the whole shed, roof
       * overhang included, so any tagged prop inside one is a 99 %
       * OVERLAP that no frame will ever show. */
      put(villageProps.logPile({ seed: 'wr-yard-logs', w: 2.0, h: 0.9, d: 0.58 }), 'yard-logs', 30.6, -2.6, 0.06);
      put(villageProps.sackStack({ seed: 'wr-yard-coal', n: 3, color: JOINERY.oakStain }), 'yard-coal-sacks', 26.6, -0.6, -0.5);
    }

    /* ================================================================ *
     * 6. THE ROW'S BACK LAND — kitchen gardens, the drying ground and the
     * bake-oven, in the block between the market lane and the row lane.
     *
     * NOTHING HERE IS OVER 2.5 m, and that is a contract rather than a
     * taste: the `down-the-row` vista and the arena's landmark ray both
     * cross this block on the diagonal and both need the gate at the end
     * of it.  See the header.
     * ================================================================ */

    /* the bake-oven on its raised yard.  The yard is a PLATFORM (0.52)
     * with two treads up off the back row, because this is the row's one
     * piece of middle high ground and the brief calls it a hexer perch.
     * 14.96 m², under composeCity's 30 m² "you are laying ground" line. */
    {
      const Y = { x0: 24.9, z0: 5.9, x1: 29.3, z1: 9.3 };
      const P = parts();
      P.add(M.paving, bx(Y.x1 - Y.x0, 0.62, Y.z1 - Y.z0, (Y.x0 + Y.x1) / 2, 0.21, (Y.z0 + Y.z1) / 2));
      P.add(M.rubble, bx(Y.x1 - Y.x0 + 0.14, 0.16, Y.z1 - Y.z0 + 0.14,
        (Y.x0 + Y.x1) / 2, 0.44, (Y.z0 + Y.z1) / 2));            // the kerb, proud
      const g = new THREE.Group();
      P.flush(g, { cast: false });
      ctx.add(g, 'oven-yard');
      ctx.platform(Y.x0, Y.z0, Y.x1, Y.z1, 0.52);

      // the treads overlap the yard by 0.34: platforms overlap, never meet
      ctx.add(stairs({
        w: 1.8, rise: 0.26, run: 0.44, steps: 2, dir: 'x+',
        at: [24.5, 0, 7.6], mat: M.rubble, ctx,
      }), 'oven-steps');

      /* the oven: a rubble drum with a clay dome on it, and the mouth
       * built OUTWARD — jambs and a lintel standing proud, with the
       * opening between them, because you cannot carve a recess into a
       * box. */
      const B = parts();
      const ox = 27.4;
      const oz = 7.4;
      const y0 = 0.52;
      const throat = painted(0x39323f);
      B.add(M.rubble, bx(2.3, 0.5, 1.95, ox, y0 + 0.25, oz));
      B.add(M.rubble, bx(2.0, 0.32, 1.7, ox, y0 + 0.66, oz));
      const dome = new THREE.SphereGeometry(1.1, 16, 9, 0, Math.PI * 2, 0, Math.PI * 0.54);
      dome.scale(1.0, 0.72, 0.9);
      dome.translate(ox, y0 + 0.8, oz);
      B.add(M.plaster, dome);
      B.add(M.rubble, cyl(1.08, 1.1, 0.12, ox, y0 + 0.84, oz, { seg: 16 }));
      B.add(M.rubble, bx(0.42, 1.35, 0.4, ox + 0.54, y0 + 1.52, oz + 0.1, { rz: -0.045 }));
      B.add(M.graniteDark, bx(0.5, 0.11, 0.48, ox + 0.58, y0 + 2.22, oz + 0.1));
      const face = oz - 0.98;
      const mz = face - 0.15;
      B.add(throat, bx(0.64, 0.44, 0.04, ox, y0 + 0.96, face + 0.01));
      for (const s of [-1, 1]) B.add(M.graniteDark, bx(0.18, 0.54, 0.26, ox + s * 0.4, y0 + 0.96, mz));
      B.add(M.graniteDark, bx(0.98, 0.16, 0.28, ox, y0 + 1.27, mz));
      B.add(M.graniteWarm, bx(1.02, 0.09, 0.32, ox, y0 + 0.68, mz - 0.02));
      // the iron door SWUNG RIGHT BACK against the front, not left across
      // the opening — otherwise the frame is a black rectangle where the
      // fire is
      B.add(M.ironDark, bx(0.66, 0.48, 0.05, ox - 0.84, y0 + 0.96, mz - 0.24, { ry: -1.15 }));
      const og = new THREE.Group();
      B.flush(og);
      tagProp(og, 'bake-oven');
      ctx.add(og, 'bake-oven');
      ctx.collide(ox - 1.2, oz - 1.05, ox + 1.2, oz + 1.0);

      /* STILL WARM, and warm is not orange: a banked oven is mostly ASH
       * with a few lumps still alight in it, in two heats. */
      const H = parts();
      const hr = rng('wr-oven-fire');
      const eLo = glowing(0xa9603c, 0xa9603c, 0.3);
      const eHi = glowing(0xd9803f, 0xd9803f, 0.46);
      H.add(painted(0x584a52), bx(0.58, 0.09, 0.38, ox, y0 + 0.77, face - 0.2));
      H.add(eLo, bx(0.32, 0.13, 0.03, ox, y0 + 0.85, face - 0.01));
      for (let i = 0; i < 11; i += 1) {
        H.add(hr.chance(0.45) ? eHi : eLo,
          bx(hr.range(0.07, 0.15), hr.range(0.05, 0.09), hr.range(0.07, 0.13),
            ox + hr.range(-0.22, 0.22), y0 + 0.82 + hr.range(0, 0.03), face - hr.range(0.04, 0.3),
            { ry: hr.range(0, Math.PI) }));
      }
      const hg = new THREE.Group();
      H.flush(hg, { cast: false, receive: false });
      hg.userData.airborne = true;
      ctx.add(hg, 'oven-mouth');
      const pool = lightPool({ r: 1.25, ember: true, opacity: 0.3 });
      pool.material = pool.material.clone();
      pool.position.set(ox, y0 + 0.05, mz - 0.55);
      ctx.add(pool, 'oven-pool');

      // the trestle and the peel: the evening's loaves went in and nobody
      // came back for them
      const T = parts();
      const tx = 25.9;
      const tz = 8.5;
      for (const s of [-1, 1]) {
        T.add(M.oak, bx(0.08, 0.76, 0.08, tx + s * 0.6, y0 + 0.38, tz - 0.22));
        T.add(M.oak, bx(0.08, 0.76, 0.08, tx + s * 0.6, y0 + 0.38, tz + 0.22));
      }
      T.add(M.oak, bx(1.55, 0.07, 0.64, tx, y0 + 0.79, tz));
      for (let i = 0; i < 5; i += 1) {
        T.add(M.hessian, bx(0.25, 0.14, 0.18, tx - 0.5 + i * 0.24, y0 + 0.9, tz + (i % 2) * 0.16));
      }
      T.add(M.canvasWorn, bx(0.62, 0.09, 0.58, tx + 0.2, y0 + 0.94, tz, { rz: 0.03 }));
      T.add(M.oak, bx(0.06, 0.06, 1.85, 28.9, y0 + 0.98, 6.4, { rx: 0.6 }));
      T.add(M.oak, bx(0.36, 0.03, 0.4, 28.9, y0 + 0.06, 5.7));
      const tg = new THREE.Group();
      T.flush(tg);
      ctx.add(tg, 'oven-trestle');
    }

    // the kitchen gardens: the whole diagonal block, every one of them
    // under half a metre
    /* THREE beds, not seven.  Each `kitchenGarden` is six meshes and the
     * budget is 440 for a district that spends 44 on its gate alone; what
     * the vista needs from this block is LOW GROUND, and three long beds
     * with the drying ground between them say allotment as well as seven
     * do.  Sized and spaced to read at 30 m rather than at 3. */
    put(villageProps.kitchenGarden({ seed: 'wr-bed-1', w: 3.4, d: 1.6, rows: 4 }), 'bed-1', 26.9, 12.0, 0);

    ctx.add(hedgeRun({
      points: [[25.2, 10.4], [31.6, 10.4]], h: 1.1, w: 0.7, seed: 'wr-hedge-1',
      groundAt: ctx.groundAt, gappy: 0.3,
    }), 'hedge-gardens-w');
    ctx.add(hedgeRun({
      points: [[38.8, 9.4], [47.2, 9.4]], h: 0.9, w: 0.75, seed: 'wr-hedge-2',
      groundAt: ctx.groundAt, gappy: 0.28,
    }), 'hedge-gardens-e');
    /* this one used to run to x 46.6 and 3 of its 16 stations came back
     * BURIED 0.35 m: the gate's north turret stands at x 45.0..48.2,
     * z 14.8..18.0 and the hedge was inside it.  It stops at 44.0. */
    ctx.add(hedgeRun({
      points: [[38.8, 15.8], [44.0, 15.8]], h: 0.8, w: 0.7, seed: 'wr-hedge-3',
      groundAt: ctx.groundAt, gappy: 0.34,
    }), 'hedge-gardens-e2');

    /* the drying ground.  The posts are slim frangible furniture and
     * carry NO collider — the same call the kit's own stop poles make;
     * a 0.4 m box in a lane takes 1.08 m of it. */
    {
      const P = parts();
      const post = (x, z, h) => {
        const y = G(x, z);
        P.add(M.oakSilver, cyl(0.055, 0.075, h, x, y + h / 2, z, { seg: 6 }));
        P.add(M.oakSilver, bx(0.5, 0.06, 0.06, x, y + h - 0.1, z, { ry: 0.3 }));
        return [x, y + h - 0.06, z];
      };
      const a1 = post(25.4, 15.2, 2.15);
      const a2 = post(25.4, 11.8, 2.05);
      const g = new THREE.Group();
      P.flush(g, { receive: false });
      ctx.add(g, 'drying-posts');
      ctx.add(villageProps.washingLine({
        from: a1, to: a2, sag: 0.24, n: 4, seed: 'wr-wash-1',
        colors: [PAL.paper, PAL.canvasWorn, JOINERY.bone, JOINERY.skyWash],
      }), 'washing-1');
      /* ONE line, not two.  Six meshes each and the budget is spoken for;
       * a single run with five pieces on it across the widest part of the
       * drying ground says what two say. */
    }

    /* ================================================================ *
     * 7. THE LANE'S OWN WALLS — what makes the row lane a CHANNEL rather
     * than an open field with houses in it.  Two runs of garden wall on
     * the north kerb east of the keep lane with a 1.8 m GATE between
     * them: that gate is the lane's north flank into the allotments, and
     * without it the barricade at (40, 22) has nothing to be a gap in.
     * ================================================================ */
    /* 0.92 m, and the last 0.18 m of it was decided by a gate rather
     * than by taste.  `check-arena-visibility` asks what fraction of the
     * arena's open cells can see a point 1.0 m up on the gate's approach;
     * from an eye at 1.62 m the sight line to (40, 22) crosses z 19.15 at
     * 1.176 m, so a 1.10 m wall with a 0.06 m coping on it stopped 46
     * cells of the north gardens and the whole keep lane by three
     * centimetres.  At 0.92 the wall is still a channel and still cover
     * (the 0.9 m floor is the referee's, not a rounding), and the row's
     * back land can see the lane it backs onto. */
    ctx.add(wallRun({
      points: [[37.8, 19.15], [40.8, 19.15]], h: 0.92, thick: 0.36,
      piers: 3.0, mat: M.rubble, copingMat: M.coping, ctx,
    }), 'lane-wall-a');
    ctx.add(wallRun({
      points: [[42.6, 19.15], [45.6, 19.15]], h: 0.92, thick: 0.36,
      piers: 3.0, mat: M.rubble, copingMat: M.coping, ctx,
    }), 'lane-wall-b');
    // the back gardens' boundary, east of the gennel's mouth
    ctx.add(wallRun({
      points: [[33.1, 33.85], [38.4, 33.85]], h: 0.95, thick: 0.32,
      mat: M.rubble, copingMat: M.coping, ctx,
    }), 'garden-wall-e');


    /* ================================================================ *
     * 8. THE PLOUGH & LANTERN — the inn at the south end, and the row's
     * only piece of reachable high ground inside the arena.
     *
     * `longhouse` with `gallery: true` gives the coaching-inn front: an
     * ARCADE at street level whose posts collide ONE AT A TIME (never a
     * box round the opening — that is a shelter you cannot stand in) and
     * a boarded gallery over it that IS registered as a platform.  A
     * gallery with no stair to it buys nothing, so it has one: eleven
     * treads off the forecourt at its west gable, up to 2.68.
     *
     * Body x 26.91..39.49, z 41.31..46.99 (measured off the generator's
     * own numbers, not guessed: the hall is set BACK from its arcade by
     * arcade/2, so `bodyZ` is -0.75 in its own frame).  Arcade posts at
     * z 39.98..40.22; gallery deck x 27.0..39.4, z 39.96..41.4 at 2.68.
     * ================================================================ */
    const inn = longhouse({
      seed: 'wr-plough-lantern', w: 12.4, d: 7.0, groundH: 2.6, upperH: 2.35,
      wall: 'limewash', roof: 'thatch', ridgeAxis: 'x', crook: 0.6,
      gallery: true, galleryDeck: true, bay: true, jetty: 0.26,
      door: DOOR[1], shutter: JOINERY.doveGrey, litWindows: 4, dormers: 2,
    });
    place(ctx, inn, { x: 33.2, z: 43.4, yaw: Math.PI, name: 'plough-lantern' });

    /* INTEGRATION: one of the town's THREE LIGHTS (src/game/INTERFACES.md):
     * `userData.townLight = 1` on the building whose windows go dark for
     * good when a light is lost.  The lit panes are the pooled `M.lit`
     * meshes inside the generator's group; `setLit(false)` hides them. */
    {
      const panes = [];
      inn.traverse((o) => { if (o.isMesh && o.material === M.lit) panes.push(o); });
      inn.userData.townLight = 1;
      inn.userData.setLit = (on) => { for (const m of panes) m.visible = !!on; };
    }

    {
      /* the gallery stair.  Its top platform (z 41.04) stops CLEAR of the
       * inn's own plinth (z 41.32), and its x band overlaps the gallery
       * deck by 0.5 m — platforms overlap, never meet. */
      const flight = stairs({
        w: 1.9, rise: 0.2436, run: 0.4, steps: 11, dir: 'z+',
        at: [39.0, 0, 36.6], mat: M.oakSilver, ctx,
      });
      ctx.add(flight, 'gallery-stair');
      /* The rail is derived from the flight's own two JOINTS — an angle
       * passed in can disagree with the joints it rides.  `side` is a
       * lateral offset along (-dz, dx)/run, which for a `z+` climb is
       * (-1, 0).  It has to land ON THE TREADS, not beside them: at
       * side -1.0 (x 39.55) it stands 0.05 m clear of the flight's own
       * edge and the audit reads 8 of its 9 stations hanging in mid-air
       * over ground five metres below its top.  side -0.8 puts it at
       * x 39.80, inside the 1.9 m going and CLEAR IN X of the gallery
       * deck's own edge at 39.4 — at 39.35 the deck is 0.61 m over the
       * rail's top post and the audit calls that buried too.  (Inboard, at 37.75, it would be under the gallery
       * deck at 2.68 — the first cut did that and read 2.4 m buried.) */
      /* AND IT RIDES THE NOSINGS, not a line through the flight's own
       * origin.  `stairs()` builds tread i from a = i*run with its top at
       * (i+1)*rise, so the walking surface is a sawtooth whose front
       * edges lie on `y = a*rise/run + rise` — a rake line drawn from
       * (0, z0) sits half a rise UNDER every tread and the audit reads
       * three of nine stations buried.  From the first nosing to the top
       * edge instead, with a shallower stringer. */
      const RISE = 0.2436;
      ctx.add(stairRail({
        from: [39.0, RISE, 36.6], to: [39.0, flight.userData.topY, 36.6 + 11 * 0.4],
        side: -0.8, sink: 0.12, mat: M.oakDark, h: 0.95,
      }), 'gallery-stair-rail');
    }

    /* THE TAP WINDOW on the inn's west gable, facing the back row's own
     * junction.  `tradeFront`'s origin sits ON the wall face and projects
     * +Z, so `ry` is that wall's outward normal — atan2(-1, 0) = -PI/2 —
     * and the plinth's face (x 26.83) is where it stands, not the wall's.
     * It carries no collider of its own, so it gets one here: without it
     * the fill walks straight through a 0.6 m counter. */
    /* A `tradeFront` tap window went on this gable and came out again at
     * nine meshes — 2 % of the district — for a shop front on the one
     * elevation of the inn that faces a 2.6 m dead slot between it and
     * h5.  What the budget bought instead is the hoardings on the south
     * walk and the spears at its stair head, which are on ground the
     * player is going to fight along.  If the ceiling ever moves, this is
     * the first thing to put back. */

    /* the inn's boards.  The fascia goes on the arcade's head beam, which
     * is the only face of this building the street actually reads — the
     * hall wall behind it is 1.25 m back and in shade all evening. */
    onWall(signKit.fasciaBoard({
      tenant: 'ploughLantern', w: 4.6, h: 0.62, seed: 'wr-inn-fascia', depth: 0.09,
    }), 'inn-fascia', 33.2, 2.16, 39.93, Math.PI);

    /* one bracket lantern under the arcade, on the hall's own face.  The
     * covered walk is the only part of this district that gets neither
     * the west sun nor a lit window, and the inn-lane frame came back
     * with a black band across the whole of the inn's front. */
    onWall(villageProps.bracketLantern({ seed: 'wr-lamp-inn', reach: 0.46, lit: true, groundDrop: -2.25 }),
      'inn-arcade-lamp', 30.2, G(30.2, 40.6) + 2.25, 41.39, Math.PI);

    // the inn's bench row under the arcade, and its tables outside it
    ctx.add(bench({
      w: 2.0, at: [30.6, G(30.6, 40.8), 40.8], facing: [0, -1],
      mat: M.oakSilver, ctx, collide: true,
    }), 'inn-bench-1');
    ctx.add(bench({
      w: 2.0, at: [36.0, G(36.0, 40.8), 40.8], facing: [0, -1],
      mat: M.oakSilver, ctx, collide: true,
    }), 'inn-bench-2');

    /* the stable, in the inn's yard, open to the yard and never across
     * it; and the inn's own cart, drawn up against the wall lane. */
    ctx.add(leanTo({
      w: 5.0, d: 2.6, h: 2.6, pitch: 0.24, open: 'x-',
      at: [42.2, G(42.2, 44.0), 44.0], mat: M.oakDark, roofMat: M.thatchWorn, ctx,
    }), 'inn-stable');

    /* ================================================================ *
     * 9. THE SIEGE LAYER — the barricades, the cover and the gate's own
     * debris.  Every cover prop goes down through `placeCover`, which
     * seats it, registers the ROTATED footprint and refuses anything
     * under 0.9 m: the referee reads `userData.cover` for its behind-cover
     * test and a 0.6 m barrel tagged as cover is a promise the player
     * cannot cash.
     *
     * COVER SITS ON ALTERNATING KERBS.  Measured clear ground left in the
     * row lane (5.2 m between kerbs) after each: 3.16, 3.50, 3.10, 3.42,
     * 4.00, 2.66, 2.80.  Nothing here is nearer the far kerb than 2.5 m,
     * which is the difference between cover and a wall.
     * ================================================================ */
    /* `placeCover` seats through `seatOnGround`, which sets y from the
     * height query and NEVER measures the prop — so a generator whose own
     * geometry dips below its origin lands buried and the audit says so:
     * `breachRubble` tumbles rotated boxes centred at 0.06, and a 0.58 m
     * one at 0.4 rad reaches -0.30.  Measure the placed bbox and lift. */
    const cover = (prop, name, x, z, yaw = 0) => {
      const g = placeCover(ctx, prop, { x, z, yaw, name });
      g.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(g);
      const want = ctx.groundAt(x, z) - 0.05;
      if (b.min.y < want) g.position.y += want - b.min.y;
      return g;
    };

    /* Two rules held the whole time these were placed.  (1) The lane's
     * two kerbs alternate, so no two consecutive obstacles are on the
     * same side and there is always a clear diagonal.  (2) NOTHING may
     * stand on the row lane's waypoint (36, 20), which is also the flood
     * fill's own seed: the first cut put a felled cart at (35.2, 20.4)
     * whose 3.05 m footprint reached x 36.95, and check-city's answer was
     * "the fill seed is inside a collider" — one line, and every route in
     * the district unverified behind it. */
    // --- the gate's own ground, east of the first barricade -----------
    cover(siegeProps.breachRubble({ seed: 'wr-rubble-a3', w: 2.4, d: 1.4, h: 1.1 }),
      'gate-rubble-a', 45.4, 21.0, 0);                // north; 2.71 m clear south
    cover(siegeProps.breachRubble({ seed: 'wr-rubble-b', w: 2.4, d: 1.5, h: 1.1 }),
      'gate-rubble-b', 44.0, 24.0, -0.1);            // south; 3.31 m clear north
    cover(siegeProps.gabion({ seed: 'wr-gabion-1', r: 0.52, h: 1.05 }), 'gabion-1', 41.5, 24.2);

    // --- the row lane, west of the first barricade --------------------
    cover(siegeProps.gabion({ seed: 'wr-gabion-2', r: 0.5, h: 1.02 }), 'gabion-2', 38.4, 19.9);
    cover(siegeProps.mantlet({ seed: 'wr-mantlet-2', w: 1.5, h: 1.45 }), 'mantlet-2', 33.8, 24.1, 0);
    cover(siegeProps.felledCart({ seed: 'wr-cart-1' }), 'felled-cart-1', 31.0, 20.3, 0);
    cover(siegeProps.felledCart({ seed: 'wr-cart-2' }), 'felled-cart-2', 25.6, 20.2, Math.PI);

    // --- the flanks ----------------------------------------------------
    /* hard against the gennel's WEST kerb.  At (30.9) it left 1.06 m of
     * clear ground in a 2.6 m cut and the flood fill could only thread it
     * on one 0.35 m column; at 30.72 the clear side is 1.19 m and four
     * columns wide.  A chokepoint is 1.8-3.0 m of throat, not 1.0. */
    cover(siegeProps.gabion({ seed: 'wr-gabion-3', r: 0.5, h: 1.02 }), 'gabion-3', 30.72, 33.4);
    cover(siegeProps.felledCart({ seed: 'wr-cart-3' }), 'felled-cart-3', 41.4, 39.8, 0);

    /* the row's well, in the middle of the lane where a row's well is —
     * 0.95 m of curb, so it is real cover, and its collider leaves 2.66 m
     * of clear lane on its north side. */
    {
      const w = villageProps.wellHead({ seed: 'wr-well', r: 0.82, h: 0.95, roof: true, bucket: true, roofColor: JOINERY.mossPaint });
      put(w, 'row-well', 28.0, 23.5, 0.3);
      ctx.collide(27.18, 22.68, 28.82, 24.32);
    }

    /* the militia's stores at the gate — arrows, spears and oil, stacked
     * where the wall-walk stair comes down.  No colliders: they are
     * ankle-high and this is the busiest metre in the district. */

    /* the militia's spears, stood against the parapet at the stair head.
     * The south walk is thirty metres of fighting top and, read off the
     * frame from the SE tower, nothing whatever was standing on it. */
    put(siegeProps.spearRack({ seed: 'wr-spears-walk', n: 7, w: 1.5, h: 1.9 }), 'walk-spears', 44.0, 49.6, Math.PI);

    /* ---- THE THREE BARRICADES.  DOWN by default: `check-game` asserts
     * the objective's three points are standable and `(40, 22)` is also
     * the east gate's own approach point.  UP they leave the declared
     * 1.8 m gap at ONE end — the generator throws under 1.8 — and each
     * one is laid so the gap is on the side the flank is NOT, which is
     * what makes the player choose. */
    /* `gapAt` is where the material is HEAPED while the barricade is
     * down, and on the lane it decides whether the gate's own approach
     * point can be seen.  At 'right' the heap lands at (40, 20.3) — 1.7 m
     * from (40, 22), 1.35 m tall, dead on the axis — and 42 of the
     * arena's 298 open cells lost their line to the approach to a pile of
     * planks.  At 'left' the heap is on the south kerb at z 24.1, BEHIND
     * the point from every cell that matters, and when the barricade goes
     * up its 1.8 m gap is at the south end, which is also where the wall
     * cut opens: raising it funnels the Company into the cross-cut the
     * player has cover in.  Same argument on the keep lane. */
    const bars = [];
    bars.push(barricade({
      w: 5.2, seed: 'wr-barricade-lane', kind: 'carts', at: [40, 22.2], yaw: HALF,
      gap: 1.8, gapAt: 'left', ctx, name: 'barricade-lane', accent: JOINERY.oakStain,
    }));
    bars.push(barricade({
      w: 5.0, seed: 'wr-barricade-keep', kind: 'stakes', at: [35.3, 12], yaw: 0,
      gap: 1.8, gapAt: 'left', ctx, name: 'barricade-keep', accent: DOOR[2],
    }));
    bars.push(barricade({
      w: 4.2, seed: 'wr-barricade-inn', kind: 'doors', at: [28, 36.3], yaw: HALF,
      gap: 1.8, gapAt: 'left', ctx, name: 'barricade-inn', accent: DOOR[2],
    }));
    /* THE THREE KINDS ARE NOT DECORATION.  Read off the raised frames:
     * `carts` is two tipped beds and two wheels, all four in `M.oakDark`,
     * and at dusk in a shaded lane it comes back as two black wedges —
     * the same "two leaning boards" the kit's own note records for
     * `felledCart`, which was fixed there with a pale rim and is not
     * fixed here.  It stays on the row lane because the brief names carts
     * for that one and because the gate behind it carries the frame; the
     * inn lane gets `doors` instead, whose leaves take the row's own
     * green and read at twenty-five metres.  (KIT NOTE for the
     * coordinator: `barricade`'s cart wheels want `felledCart`'s
     * treatment.) */

    /* A HIDDEN GROUP IS NOT A HIDDEN MESH, and the difference cost this
     * district its arena-visibility gate.  `barricade` builds both states
     * and hides one by setting `up.visible = false` on the GROUP; three's
     * raycaster does not test ancestors, and `check-arena-visibility`
     * filters on `h.object.visible` — the mesh's own flag, which is still
     * true.  So the raised barricade nobody can see was stopping the
     * sight line to the gate's own approach point from 94 of the arena's
     * 298 open cells, and every frame of the lane showed it lowered.
     * Same family as "Box3.setFromObject does not skip invisible
     * children", from the other side.  Wrap raise/lower so the leaves
     * agree with the group; the game's own API is unchanged. */
    for (const b of bars) {
      const up = b.getObjectByName('barricade-up');
      const down = b.getObjectByName('barricade-down');
      const leaves = (g, v) => g.traverse((o) => { if (o.isMesh) o.visible = v; });
      const rawRaise = b.userData.raise;
      const rawLower = b.userData.lower;
      b.userData.raise = () => { rawRaise(); leaves(up, true); leaves(down, false); };
      b.userData.lower = () => { rawLower(); leaves(up, false); leaves(down, true); };
      b.userData.lower();
    }
    ctx.reset(() => { for (const b of bars) b.userData.lower(); });

    /* the plan's interaction.  The game raises the other two through the
     * same API (`userData.raise()`), which is why all three are built the
     * same way and only this one carries a prompt. */
    interactive(ctx, {
      name: 'the lane barricade',
      label: 'E · raise the lane barricade',
      at: [40, G(40, 22.2) + 1.0, 22.2],
      size: [2.2, 2.2, 5.6],
      action: () => bars[0].userData.raise(),
    });
    /* The other two carry prompts of their own.  The plan declares one
     * interaction here and the game raises the rest through
     * `userData.raise()`, but `o2-barricades` is three points and a
     * breather the PLAYER is in: a barricade you can only watch somebody
     * else raise is not a beat.  Same API, same 1.8 m gap, no extra
     * contract. */
    interactive(ctx, {
      name: 'the keep-lane barricade',
      label: 'E · raise the keep-lane barricade',
      at: [35.3, G(35.3, 12) + 1.0, 12],
      size: [5.6, 2.2, 2.2],
      action: () => bars[1].userData.raise(),
    });
    interactive(ctx, {
      name: 'the inn-lane barricade',
      label: 'E · raise the inn-lane barricade',
      at: [28, G(28, 36.3) + 1.0, 36.3],
      size: [2.2, 2.2, 4.6],
      action: () => bars[2].userData.raise(),
    });

    /* ================================================================ *
     * 10. SIGNAGE, LIGHT AND TEN MINUTES AGO
     * ================================================================ */

    // the row's board, where the row lane meets the keep lane: the muster
    // bill is the newest thing on it and the watch rota is under it
    put(signKit.noticeBoardStand({
      notices: ['muster', 'rota'], w: 1.4, h: 0.95, postH: 1.05,
      seed: 'wr-board', accent: JOINERY.oakStain,
    }), 'row-board', 33.4, 18.6, Math.PI);

    // wayfinding at the back row's junction with the row lane
    // the toll board on the gate's own inner jamb, and a muster bill on
    // the smithy's flank where everyone queues
    onWall(signKit.wallNotice({ notice: 'gatetoll', w: 0.34, h: 0.46, seed: 'wr-notice-toll', tilt: 0.03 }),
      'notice-gatetoll', 47.55, 1.95, 19.9, -HALF);
    onWall(signKit.wallNotice({ notice: 'muster', w: 0.32, h: 0.44, seed: 'wr-notice-muster', tilt: -0.04 }),
      'notice-muster', 26.49, 1.9, -8.6, -HALF);

    /* the row's own light: two post lanterns down the lane and a bracket
     * over three doors, all warm and all small.  A lit lamp is three
     * things — a body, a lit pane and a pool — or it is an orange quad. */
    put(villageProps.postLantern({ seed: 'wr-lamp-1', h: 3.0, lit: true }), 'lane-lamp-1', 33.6, 19.3);
    {
      const h3 = built.h3;
      const fz = h3.z - h3.d / 2;          // yaw PI: the front is at -z
      onWall(villageProps.bracketLantern({ seed: 'wr-lamp-h3', reach: 0.46, lit: true, groundDrop: -2.3 }),
        'h3-lamp', 25.9, G(25.9, fz - 0.5) + 2.3, fz - 0.01, Math.PI);
    }

    /* TEN MINUTES AGO.  A ladder left against h4's eave — the row was
     * getting the shutters closed and the last one is still open above
     * it.  `ladder` leans toward its own local +z, so ry = 0 puts its top
     * against a wall on the +z side of its foot: h4 fronts north, its
     * wall is at z 25.7, and the foot stands in the lane at 24.7. */
    {
      const h4 = built.h4;
      const eave = h4.u.eaveY;
      const standoff = 1.0;
      put(villageProps.ladder({
        seed: 'wr-ladder', len: Math.hypot(eave + 0.34, standoff), w: 0.46, standoff,
      }), 'eave-ladder', 36.9, 25.7 - standoff, 0, 0.0);
    }
    // a pail put down and a besom against the wall at the row's doors
    {
      const P = parts();
      const stool = (x, z) => {
        const y = G(x, z);
        P.add(M.oakSilver, bx(0.34, 0.05, 0.3, x, y + 0.4, z));
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          P.add(M.oakDark, cyl(0.026, 0.03, 0.4, x + sx * 0.13, y + 0.2, z + sz * 0.11, { seg: 5 }));
        }
      };
      const besom = (x, z, ry) => {
        const y = G(x, z);
        P.add(M.oak, cyl(0.024, 0.028, 1.25, x, y + 0.63, z, { seg: 5, rz: 0.16 * Math.cos(ry), rx: 0.16 * Math.sin(ry) }));
        P.add(M.straw, cyl(0.09, 0.045, 0.34, x - 0.1 * Math.cos(ry), y + 0.17, z - 0.1 * Math.sin(ry), { seg: 6 }));
      };
      const pail = (x, z) => {
        const y = G(x, z);
        P.add(M.oakSilver, cyl(0.16, 0.13, 0.28, x, y + 0.14, z, { seg: 9 }));
        P.add(M.iron, cyl(0.165, 0.165, 0.03, x, y + 0.24, z, { seg: 9 }));
      };
      stool(28.2, 25.2);
      besom(29.2, 25.2, 0.4);
      besom(25.1, 19.35, 1.2);
      P.add(M.canvasWorn, bx(0.5, 0.14, 0.42, 30.9, G(30.9, 22.4) + 0.07, 22.4, { ry: 0.5, rz: 0.06 }));
      const g = new THREE.Group();
      P.flush(g);
      ctx.add(g, 'door-stuff');
    }

    /* ================================================================ *
     * 11. THE EDGES — the pomerium and the corner nobody builds on.
     * Trees are the TRIANGLE cost in this town and there are only four,
     * all of them closing a frame rather than filling a space.
     * ================================================================ */
    /* TWO trees, and both of them in the north field where there is room
     * for one.  A `treeStand` bounding box is its whole canopy — 8-9 m
     * across at these scales — so anything tagged within about 4.5 m of
     * one is an OVERLAP the audit will report for ever, and a walled
     * town's streets have no room for that.  The row's greenery is its
     * gardens and its hedges; the trees close the view out of the keep
     * lane and nothing else. */
    ctx.add(treeStand({ spots: [[21.5, -13.0]], seed: 'wr-tree-1', kind: 'oak', scale: 0.85, groundAt: ctx.groundAt }), 'tree-1');

    ctx.add(hedgeRun({
      points: [[19.4, 8.0], [19.4, 32.0]], h: 1.2, w: 0.75, seed: 'wr-hedge-w',
      groundAt: ctx.groundAt, gappy: 0.3,
    }), 'hedge-west-boundary');

    // the north field between the keep lane and the wall: hurdles, a
    // haystack and the row's woodpile.  Nothing here is over 2 m — the
    // keep's own sight line to the gate crosses it.
    ctx.add(villageProps.fenceRun({
      points: [[38.6, -2.0], [46.6, -2.0]], kind: 'hurdle', h: 1.05,
      seed: 'wr-hurdle-n', groundAt: ctx.groundAt, ctx, postEvery: 2.0,
    }), 'north-hurdle');

    /* THE SMITHY'S EAST FLANK IS 7 m OF BLANK GRANITE and it faces the
     * keep lane, which is how the whole north half of this district
     * arrives.  Read off the lane frame: a third of it was one unbroken
     * pale elevation with nothing on it at all.  A stock pile and the
     * chalked list are what a working smithy puts on that wall, and the
     * board is on the flank people actually queue along rather than
     * beside the door where it started. */
    put(villageProps.logPile({ seed: 'wr-smithy-stock', w: 2.2, h: 1.0, d: 0.6, roof: true }),
      'smithy-flank-logs', 34.4, -8.8, HALF);
    onWall(signKit.chalkedBoard({
      head: 'TAKEN IN', lines: ['SIX SPEAR HEADS', 'GATE BAR — DONE', 'NO SHOEING TODAY'],
      w: 0.8, h: 0.62, seed: 'wr-stanhope-chalk',
    }), 'stanhope-chalk', 33.51, 1.66, -9.4, HALF);
  },
});
