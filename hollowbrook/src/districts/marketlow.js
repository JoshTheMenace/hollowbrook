import * as THREE from 'three';
import { defineDistrict } from '../core/district.js';
import { registerInterior, makeDoorLeaf } from '../core/interior.js';
import * as room from '../interiors.js';
/* `hollowShell` is in builders.js and is NOT re-exported by the kit index —
 * the enterable path is the pipeline's, not the kit's. */
import { hollowShell } from '../builders.js';
import {
  M, painted, PAL, ACCENT, JOINERY,
  place, rng, seatOnGround, parts, bx, cyl,
  cottage, treeStand, hipRoof,
  villageProps, marketStall, lanternString, interactive,
  stairRail, bench, leanTo,
  siegeProps, lantern,
  signKit,
} from '../kit/index.js';

/* ==================================================================== *
 * THE LOW MARKET — marketlow.  x -18..18, z -18..16.
 *
 * THE DISTRICT IS ONE ARENA.  The level here IS the sunk square at -1.4
 * and the four rims are shelves at 0, so everything the siege vocabulary
 * asks for is already in the land: high ground all the way round a
 * 440 m2 floor, five chokepoints into it, and a 1.4 m lip the player can
 * drop off but the raiders have to walk round.  What this module adds is
 * (a) a face on that lip, (b) cover on the floor arranged as a market,
 * (c) the Reeve's Hall on the west rim, and (d) the evidence that the
 * market was clearing when the bell rang and stopped.
 *
 * ------------------------------------------------------------------
 * WHAT THE TERRAIN ALREADY DID — measured, not remembered
 * (scratch/map.mjs prints all of it; every number below came off it).
 *
 *   the square          -1.400 over x -10..12, z -12..8   (440 m2)
 *   the four rims        0.000 — N z -18..-12, S z 8..16,
 *                        W x -18..-10, E x 12..18
 *   the scarps           between two 0.1 m samples, i.e. the drawn face
 *                        stands at  x = -9.95 / 12.05,  z = -11.95 / 8.05.
 *                        Everything this module lays against a scarp is
 *                        seated on the FLOOR and hugs that line; a run
 *                        seated on the rim would be a parapet with a
 *                        1.4 m void under it.
 *   market-stair-n       x -2..2.  Walking surface  z -14.86 (0.00) down
 *                        to z -11.50 (-1.400); 8 treads, rise .175, going .42
 *   market-ramp-s        x -3..3.  z 15.0 (0.00) down to z 8.5 (-1.400)
 *   market-stair-w       z 4..7.   x -13.0 (0.00) down to x -9.5 (-1.400)
 *   market-stair-e       z -3.5..-0.5.  x 15.0 (0.00) down to x 12.0 (-1.400)
 *
 *   anchors  (0,0) -1.400 | (6,-15) 0.000 | (-14.2,6) 0.000 | (15,-8) 0.000
 *
 *   sockets, landing profile flat at 0.000 on both sides of all four:
 *     market-road-s (0,16) z, 6.0 | market-road-n (0,-18) z, 5.0
 *     market-lane-w (-18,6) x, 3.6 | market-lane-e (18,4) x, 3.6
 *
 * WHAT THAT FORBIDS, and it decided three placements:
 *
 *   gate-sees-keep   (0,46)->(0,-26), +/-3, nothing over 8.5 m.  So the
 *     band x -3..3 carries NOTHING but the ramp and the north stair over
 *     the whole district, and the corn cross is at x -6.8 for that reason
 *     and no other.  The vista camera's own ray passes 5.10 m up at
 *     (0.96, -12) — the Reeve's house starts at x 5.2 and is clear of it.
 *   market-sees-tower (0,0)->(-36,-34), +/-3, nothing over 9.0 m.  The
 *     guild hall's hipped ridge is 5.36 and its nearest corner is 5.24 m
 *     off the corridor's axis, so it is outside the corridor AND under it.
 *     The corn cross is deliberately SOUTH of the well, behind the ray's
 *     own origin, rather than west of it where it would stand in front of
 *     the one cool light in the town.
 *   market-lane-w    keeps x -18..-15, z 4.2..7.8 clear 3 m into my side,
 *     which is why the Reeve's notice board is at the FOOT of the west
 *     stair on the floor and not on the porch where it belongs socially.
 *
 * ------------------------------------------------------------------
 * SIEGE READ.  Wave 2 comes down the SOUTH RAMP; wave 4 adds the EAST rim.
 *
 *   LANE      the ramp foot (0, 8.5) north to the north steps (0, -11.5).
 *             Two stall rows flank it (x -4.4 and x 5.6) leaving 8.3 m,
 *             narrowed to 2.36 m by the watch's two gabions at z 6.8 —
 *             the one choke on the floor itself.
 *   COVER     tagged, collider-bearing obstacles ON THE FLOOR: the well
 *             is the pivot, the two stall rows are the lanes of it, and
 *             the tipped gear at the ramp foot is what you take first.
 *   HIGH      all four rims at +1.4, and the RIM IS HALF WALLED ON PURPOSE.
 *             Walled (0.62 m proud, collider): the west run under the
 *             hall, the north-east run under the Reeve's house, and the
 *             south-east/east-south return where the row lane lands.
 *             Open (coping flush, NO collider): the north-west corner
 *             (the hexers' perch), the south-west, and the whole east
 *             rim north of its stair — which is where wave 4 pours over
 *             and where the player drops out of a fight.
 *   PERCHES   (-7, -13.5) on the north-west rim and the east stair head
 *             (15, -2): both open ground, both seen from the floor.
 *
 * ACCENT is `ACCENT.hallAmber` and it is spent on the guild hall's
 * lanterns and NOTHING else: two bracket lamps at its door, two strings
 * over its porch, and two lanterns inside it.  All of them come up when
 * the market bell is rung.  Everything else warm in the district is
 * ember (the watch's brazier, the hall's hearth), which is not an accent.
 *
 * LOCAL HELPERS, and each is a kit request rather than a preference:
 *   rimRun()      the revetment/parapet on a terrain scarp.  `wallRun`
 *                 tops every panel at ground+h, so seated on the floor it
 *                 gives a level top (right) at ~56 meshes for this rim
 *                 (13 % of the whole budget).  This is 4 pooled meshes.
 *                 KIT REQUEST: `revetment({ from, to, faceY, topY })`.
 *   marketCross() the corn cross.  The brief says to ask for one.
 *   bellFrame()   two posts, a headstock and a swinging bell.  `temple`
 *                 has a bellcote and `roundTower` a belfry; neither is a
 *                 free-standing market bell.  KIT REQUEST: `bellFrame`.
 *   struckStall() a stall with its canvas struck and its boards leaning —
 *                 a STATE of `marketStall`, not a second stall.
 *                 KIT REQUEST: `marketStall({ struck: true })`.
 *   hipped roof   `hollowShell` leaves an open gable over its wall head
 *                 and the kit's `hipRoof` is what closes it; this one is
 *                 written locally only because it also carries the two
 *                 hip slopes' own materials.  See the note at its call.
 *
 * TRAPS HIT — the log is at the foot of this file.
 * ==================================================================== */

const E = { x0: -18, z0: -18, x1: 18, z1: 16 };

const FLOOR_Y = -1.4;
const RIM_Y = 0;
/* the drawn scarp lines, off the 0.1 m sweep in scratch/map.mjs */
const W_EDGE = -9.95;
const E_EDGE = 12.05;
const N_EDGE = -11.95;
const S_EDGE = 8.05;

const T = 0.44;          // revetment thickness
const PROUD = 0.62;      // a walled rim stands this far over the shelf.
                         // 0.62 > the walker's 0.38 step, so the collider
                         // is a barrier and not a kerb you stroll over.

const HALL = { x: -14.2, z: 0, w: 6.8, d: 6.0, h: 3.55 };

export const marketlow = defineDistrict({
  id: 'marketlow',
  envelope: E,
  after: ['southgate'],
  anchors: [
    { x: 1, z: -3, expect_top: -1.4, tol: 0.05 },     // the well stands on it
    { x: -13.2, z: 5.2, expect_top: 0, tol: 0.05 },   // the Reeve's post
  ],
  build(ctx) {
    const G = (x, z) => ctx.groundAt(x, z);
    const r = rng('marketlow');

    /* a prop seated by query with no collider — scatter a walker brushes
     * past.  Anything with a real footprint goes through `place`. */
    const prop = (obj, x, z, ry, name) => {
      obj.position.set(x, 0, z);
      obj.rotation.y = ry ?? 0;
      seatOnGround(obj, G);
      ctx.add(obj, name);
      return obj;
    };
    /* a wall-mounted thing: origin ON the face, projecting +Z, turned so
     * its +Z is the wall's outward normal.  ry = atan2(nx, nz). */
    const onWall = (obj, x, y, z, nx, nz, name) => {
      obj.position.set(x, y, z);
      obj.rotation.y = Math.atan2(nx, nz);
      ctx.add(obj, name);
      return obj;
    };

    /* A THATCH EAVE OVERHANGS 0.85 m AND THE AUDIT UNIT IS ITS BBOX.
     * `cottage` is one tagged unit, so a 1.5-storey thatch whose eave
     * stands 0.85 m past its own wall has a bounding box 1.7 m wider than
     * the building — and then EVERY plate hung on its frontage reads as
     * interpenetrating it.  That is the bbox artifact the spatial audit's
     * own header names, and the flagship's fix is the same one: make the
     * overhang a SIBLING of the tagged unit rather than a child of it.
     * Everything above the wall head goes into an `airborne` group; the
     * walls stay tagged and are still ground-checked.
     * The threshold is the EAVE and not the wall top, and that is the
     * whole of it: a thatch eave hangs BELOW its own wall head (measured
     * on the chandler's, 1.58 against a wall top of 2.50), so a lift
     * written against `wallTopY` matches nothing at all and the artifact
     * survives with the fix apparently applied.
     * KIT REQUEST: `cottage({ roofSibling: true })`, or the same move
     * inside the generator, since every district will hit this. */
    const liftRoof = (building, eaveY, name) => {
      const roof = new THREE.Group();
      roof.name = `${name}-roof`;
      roof.userData = { airborne: true };
      const box = new THREE.Box3();
      for (const child of [...building.children]) {
        if (!child.isMesh) continue;
        box.setFromObject(child);
        if (box.min.y - building.position.y >= eaveY - 0.35) roof.add(child);
      }
      if (roof.children.length) {
        roof.position.copy(building.position);
        roof.rotation.copy(building.rotation);
        ctx.add(roof, name + '-roof');
      }
      return roof;
    };

    /* COVER, and the height is MEASURED rather than declared.  The
     * referee's "behind cover" test reads `userData.cover` and the
     * enemies read the collider list, so a prop tagged at a height it
     * does not have is a promise the player cannot cash. */
    const coverList = [];
    const cover = (obj, x, z, ry, name) => {
      place(ctx, obj, { x, z, yaw: ry ?? 0, name });
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj);
      const h = box.max.y - G(x, z);
      if (h < 0.9) throw new Error(`[marketlow] cover "${name}" measures ${h.toFixed(2)} m — cover is 0.9 m or it is a trip hazard`);
      obj.userData.cover = true;
      obj.userData.coverH = h;
      coverList.push([name, Number(h.toFixed(2))]);
      return obj;
    };

    /* ---------------------------------------------------------------- *
     * 1. THE RIM — a coursed face on the terrain's own scarp.
     *
     * From the floor the scarp is 1.4 m of nothing; from the rim it is an
     * edge with no edge on it.  `rimRun` gives it a plinth, a coursed
     * face, a string course and a coping, all seated on the FLOOR so the
     * top stays level while the face height is set by the square.
     *
     * `proud` decides everything else.  0.62 m over the shelf is a
     * barrier — the walker's step is 0.38, so the collider actually stops
     * them.  0.0 is a coping flush with the shelf, NO collider, and it is
     * a ROUTE: the player drops 1.4 m into the square and the raiders
     * have to take a stair.  Half the rim is each, on purpose.
     * ---------------------------------------------------------------- */
    const rim = parts();
    /**
     * `from`/`to` are [x, z], axis-aligned, on the FLOOR side of the
     * scarp and in the middle of the wall's own thickness.
     */
    const rimRun = (from, to, proud) => {
      const alongX = Math.abs(to[0] - from[0]) > Math.abs(to[1] - from[1]);
      const a0 = Math.min(alongX ? from[0] : from[1], alongX ? to[0] : to[1]);
      const a1 = Math.max(alongX ? from[0] : from[1], alongX ? to[0] : to[1]);
      const c = alongX ? from[1] : from[0];
      const len = a1 - a0;
      if (len < 0.2) return;
      const base = FLOOR_Y - 0.06;
      const top = RIM_Y + proud;
      const seg = Math.max(2, Math.ceil(len / 2));
      const put = (mat, thick, y0, y1) => {
        const w = alongX ? len : thick;
        const d = alongX ? thick : len;
        const cx = alongX ? (a0 + a1) / 2 : c;
        const cz = alongX ? c : (a0 + a1) / 2;
        rim.add(mat, bx(w, y1 - y0, d, cx, (y0 + y1) / 2, cz, { seg }));
      };
      put(M.rubble, T + 0.12, base, FLOOR_Y + 0.28);                  // plinth
      put(M.curtain, T, FLOOR_Y + 0.26, top - 0.10);                  // the face
      put(M.curtainDark, T + 0.05, FLOOR_Y + 0.92, FLOOR_Y + 1.02);   // string course
      put(M.coping, T + 0.14, top - 0.10, top);                       // coping
      /* A run that stops in mid-air reads as a grey card standing on the
       * paving.  Every walled run ends in a quoin proud of its own
       * coping, which is also what makes a stair notch read as an
       * OPENING in a wall rather than as the wall running out. */
      if (proud > 0.4) {
        for (const a of [a0, a1]) {
          const qx = alongX ? a : c;
          const qz = alongX ? c : a;
          rim.add(M.coping, bx(T + 0.26, top + 0.14 - base, T + 0.26, qx, (base + top + 0.14) / 2, qz, { seg: 2 }));
        }
        const half = T / 2 + 0.13;
        if (alongX) ctx.collide(a0, c - half, a1, c + half);
        else ctx.collide(c - half, a0, c + half, a1);
      }
    };

    /* WEST — walled from the north corner to the west stair: the guild
     * hall's east flank stands 0.85 m off this edge and a doorstep beside
     * an unguarded 1.4 m drop is not a doorstep. */
    rimRun([W_EDGE + T / 2, N_EDGE + 0.01], [W_EDGE + T / 2, 4.00], PROUD);
    /* WEST south of the stair and the SOUTH-WEST corner: OPEN.  This is
     * the drop off the hall's rim into the market's west end. */
    rimRun([W_EDGE + T / 2, 7.00], [W_EDGE + T / 2, S_EDGE - T / 2 + 0.05], 0);
    rimRun([W_EDGE, S_EDGE - T / 2], [-3.00, S_EDGE - T / 2], 0);
    /* SOUTH-EAST and the EAST return: walled.  The row lane from wardrow
     * lands on this rim at z = 4 and walks straight at the drop. */
    rimRun([3.00, S_EDGE - T / 2], [E_EDGE, S_EDGE - T / 2], PROUD);
    rimRun([E_EDGE - T / 2, S_EDGE - T / 2], [E_EDGE - T / 2, -0.50], PROUD);
    /* EAST north of its stair: OPEN.  Wave 4 comes in over this edge. */
    rimRun([E_EDGE - T / 2, -3.50], [E_EDGE - T / 2, N_EDGE + 0.01], 0);
    /* NORTH-EAST: walled, under the Reeve's house. */
    rimRun([E_EDGE, N_EDGE + T / 2], [2.00, N_EDGE + T / 2], PROUD);
    /* NORTH-WEST: OPEN — the hexers' corner, and the one the player drops
     * off when the north steps are held against them. */
    rimRun([-2.00, N_EDGE + T / 2], [W_EDGE, N_EDGE + T / 2], 0);
    rim.flush(ctx.add(new THREE.Group(), 'rim'), { receive: true });

    /* ---------------------------------------------------------------- *
     * 2. THE FIVE CLIMBS.  Stone cheeks on the two wide ones (they carry
     *    a real lateral drop and a real collider); iron rails on the two
     *    narrow stairs, because a rail carries none and the Reeve's post
     *    stands 1.56 m from the nearest cheek corner as it is.
     *    Never a collider on a tread.
     * ---------------------------------------------------------------- */
    const cheeks = parts();
    const cheek = (x0, z0, x1, z1) => {
      const top = RIM_Y + 0.55;
      const base = FLOOR_Y - 0.06;
      const sx = Math.max(2, Math.ceil((x1 - x0) / 2));
      const sz = Math.max(2, Math.ceil((z1 - z0) / 2));
      cheeks.add(M.curtain, bx(x1 - x0, top - 0.09 - base, z1 - z0,
        (x0 + x1) / 2, (base + top - 0.09) / 2, (z0 + z1) / 2, { seg: Math.max(sx, sz) }));
      cheeks.add(M.coping, bx(x1 - x0 + 0.12, 0.09, z1 - z0 + 0.12,
        (x0 + x1) / 2, top - 0.045, (z0 + z1) / 2));
      ctx.collide(x0, z0, x1, z1);
    };
    /* the north stair: the cheeks stop at z -14.60 so their inflated
     * collider (-14.94) stays clear of market-road-n's corridor, z -18..-15 */
    cheek(2.00, -14.60, 2.36, N_EDGE);
    cheek(-2.36, -14.60, -2.00, N_EDGE);
    /* the south ramp: the same arithmetic against market-road-s, z 13..16 */
    cheek(3.00, S_EDGE, 3.36, 12.40);
    cheek(-3.36, S_EDGE, -3.00, 12.40);
    cheeks.flush(ctx.add(new THREE.Group(), 'stair-cheeks'), { receive: true });

    /* the two narrow stairs.  `stairRail` derives its rake from the
     * flight's own two joints — an angle passed in can disagree with the
     * joints it rides.  Both surfaces here are measured, not assumed. */
    for (const s of [-1, 1]) {
      ctx.add(stairRail({
        from: [-9.5, FLOOR_Y, 5.5], to: [-13.0, RIM_Y, 5.5],
        side: s * 1.05, h: 0.95, sink: 0.12, mat: M.ironDark,
      }), `west-stair-rail-${s > 0 ? 'n' : 's'}`);
      ctx.add(stairRail({
        from: [12.0, FLOOR_Y, -2.0], to: [15.0, RIM_Y, -2.0],
        side: s * 1.05, h: 0.95, sink: 0.12, mat: M.ironDark,
      }), `east-stair-rail-${s > 0 ? 's' : 'n'}`);
    }

    /* ---------------------------------------------------------------- *
     * 3. GROUND BREAKUP.  The square is 440 m2 of one paving tone and it
     *    fills the lower two thirds of the vista this district owns.
     *    These are 30 mm proud decals on a 0.3 m box, so nothing can
     *    float, laid only where feet actually go.
     * ---------------------------------------------------------------- */
    const wear = parts();
    const patch = (mat, cx, cz, w, d, ry = 0) => {
      const top = G(cx, cz) + 0.03;
      wear.add(mat, bx(w, 0.3, d, cx, top - 0.15, cz, { ry }));
    };
    const desire = (mat, a, b, width, { pace = 1.1, wob = 0.5 } = {}) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.round(len / pace));
      const ry = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
      for (let i = 0; i < n; i += 1) {
        const t = (i + 0.5) / n;
        const px = a[0] + (b[0] - a[0]) * t;
        const pz = a[1] + (b[1] - a[1]) * t;
        const off = (r.next() - 0.5) * wob;
        patch(mat, px - Math.sin(-ry) * off, pz - Math.cos(-ry) * off,
          (len / n) * 1.5, width * r.range(0.75, 1.15), ry + r.range(-0.2, 0.2));
      }
    };
    /* PALER THAN THE PAVING, NOT DARKER.  The key light stands at
     * (-59, 9, 2) — 9 degrees over the horizon, from the west — so the
     * west rim's 2.02 m of revetment throws 12.7 m of shadow across a
     * 22 m floor and more than half the square is in it.  A dark decal
     * on ground that is already the ramp's bottom band is a decal nobody
     * can see: measured off one frame from the floor, the whole middle
     * of the square came back as a single flat violet area with the wear
     * lines invisible in it.  Earth, gravel and straw read there; one
     * `pavingDark` line is kept where the lane crosses the sunlit strip. */
    desire(M.earth, [0.4, 7.6], [1.2, -3.8], 2.6);           // the lane
    desire(M.earth, [1.2, -3.8], [0.2, -11.0], 2.4);
    desire(M.gravel, [1.4, -2.4], [-8.6, 5.4], 1.7);         // off it to each stair
    desire(M.gravel, [1.6, -2.6], [11.2, -2.0], 1.7);
    desire(M.pavingDark, [-2.4, 0.6], [-3.4, -6.0], 1.4);
    desire(M.earth, [4.6, 1.2], [4.8, -5.4], 1.4);
    patch(M.straw, -3.3, -0.8, 1.5, 9.6, 0.02);              // chaff down the rows
    patch(M.straw, 4.6, -0.6, 1.4, 8.4, -0.02);
    patch(M.straw, -3.0, 1.5, 1.6, 1.2, 0.4);
    patch(M.earth, 1.0, -2.2, 3.8, 4.2, 0.15);               // trodden at the well
    patch(M.earth, -6.9, 0.6, 2.8, 2.6, -0.2);               // and round the cross
    /* the porch decal stops at x -13.0, which is the west stair's HEAD.  A
     * decal is a 0.3 m box seated on the ground under its own CENTRE, so a
     * 5 m one centred on the rim hangs 0.35 m over the first four treads —
     * and what found it was not a frame but the stair rail's run check,
     * reporting itself buried under a surface at y 0.03 that had no
     * business being there. */
    patch(M.gravel, -15.0, 4.8, 4.0, 3.0, 0.0);              // the hall's porch
    patch(M.gravel, 14.2, -8.0, 2.4, 5.2, 0.0);              // the chandler's apron
    patch(M.gravel, 8.4, -12.9, 6.0, 1.4, 0.0);              // the Reeve's doorstep
    patch(M.moss, W_EDGE + 0.55, -6.0, 0.8, 8.0, 0.0);       // damp at the scarps
    patch(M.moss, E_EDGE - 0.6, 2.0, 0.8, 6.0, 0.0);
    /* THE RAMP'S OWN WEAR, and it is a RAKED SOLID rather than a run of
     * decals.  A patch is a box seated on the ground under its own
     * CENTRE, which is exactly right on the level and useless on a
     * 1-in-4.6: a chain of paces up the ramp comes out as a ladder of
     * tiles hovering over it, each one proud at its low end.  One box per
     * rut, raked by the grade its own two ends measure — and the profile
     * is the TERRAIN'S, taken off the crossing (z 15.0 at 0.00 falling to
     * z 8.5 at -1.40), not off `groundAt`, which is the min over a cell's
     * corners and sits under the drawn surface on a slope.
     * A box along Z turned by +rx about X sends its +z end DOWN; this
     * ramp's +z end is UP, so the sign is negative and it is derived. */
    const rampY = (z) => Math.max(-1.4, Math.min(0, -1.4 + ((z - 8.5) / 6.5) * 1.4));
    const rut = (mat, x, z0, z1, w, up = 0.035) => {
      const y0 = rampY(z0) + up;
      const y1 = rampY(z1) + up;
      const len = Math.hypot(z1 - z0, y1 - y0);
      wear.add(mat, bx(w, 0.18, len, x, (y0 + y1) / 2 - 0.09, (z0 + z1) / 2,
        { rx: Math.atan2(y0 - y1, z1 - z0), seg: 10 }));
    };
    rut(M.gravel, 0.1, 9.0, 14.6, 2.9);
    rut(M.earth, -1.15, 9.2, 14.4, 0.62);
    rut(M.earth, 1.35, 9.2, 14.4, 0.58);
    wear.flush(ctx.add(new THREE.Group(), 'ground-wear'), { receive: true });

    /* ---------------------------------------------------------------- *
     * 4. THE REEVE'S HALL — the enterable, on the west rim.
     *
     * Door on the SOUTH face (z+).  NOT on the east face, which opens
     * 0.85 m from a 1.4 m drop.  A HIPPED roof rather than a gable, so
     * there is no gable triangle over the wall head to fill — and a ridge
     * at 5.36 m, which is what `market-sees-tower` costs.
     * ---------------------------------------------------------------- */
    const hallGround = G(HALL.x, HALL.z);
    const shell = hollowShell({
      w: HALL.w, d: HALL.d, h: HALL.h, at: [HALL.x, HALL.z], groundY: hallGround,
      wallT: 0.30, floorRise: 0.10, floorT: 0.16, ceilH: 2.50,
      door: { face: 'z+', offset: 0, width: 1.60, height: 2.20 },
      windows: [
        { face: 'z+', offset: 2.35, width: 1.05, height: 1.00, sill: 0.95 },
        { face: 'z+', offset: -2.35, width: 1.05, height: 1.00, sill: 0.95 },
        { face: 'x+', offset: 1.40, width: 1.10, height: 1.00, sill: 0.95 },
        { face: 'x+', offset: -1.40, width: 1.10, height: 1.00, sill: 0.95 },
        { face: 'x-', offset: 0, width: 1.20, height: 0.90, sill: 1.25 },
      ],
      mats: { wall: M.render, inner: M.plaster, floor: M.oakDark, ceiling: M.oak },
      ctx, name: 'guildhall',
    });
    ctx.add(shell.group, 'guildhall');

    /* THE ROOF is HIPPED and it is the KIT'S, not a local one.  A hip
     * written by hand as four raked slabs was the first cut, and it came
     * back with two horns: the hip-end slabs, rotated about Z, run PAST
     * the ridge line at their tops, and from every frame with the hall in
     * it the roof read as a pagoda.  A hip is two trapezia and two
     * triangles, not four slopes, and `hipRoof` builds it.
     * Hipped rather than gabled for a second reason: `hollowShell`'s wall
     * head is flat and it does not fill a gable, so a gable roof leaves an
     * open triangle over the wall with the room's ceiling showing through. */
    const hallRoof = hipRoof({
      w: HALL.w + 0.84, d: HALL.d + 0.84, pitch: 0.55, overhang: 0,
      thickness: 0.16, capW: 1.0, mat: M.shingle, ridgeMat: M.shingleDark,
    });
    hallRoof.position.set(HALL.x, shell.wallTopY, HALL.z);
    hallRoof.userData = { ...(hallRoof.userData ?? {}), airborne: true };
    ctx.add(hallRoof, 'guildhall-roof');

    /* the door leaf.  No collider, ever — the doorway gap IS the route. */
    ctx.add(makeDoorLeaf({
      doorway: shell.doorway, hinge: 'left', mat: painted(JOINERY.oakStain),
      ironMat: M.ironDark, ctx, auto: false, open: false,
      label: "E · the Reeve's Hall", name: 'guildhall-door',
    }), 'guildhall-door');

    /* -- THE ROOM.  It is the runner's shelter and the Reeve's, so the
     * two metres of floor inside the door stay EMPTY: nothing at all
     * stands in x -15.2..-13.2, z 1.0..2.70. */
    const R = shell.room;
    const F = shell.floorTopY;
    const interior = new THREE.Group();
    const add = (o) => { interior.add(o); return o; };

    const hearth = room.hearth({
      w: 1.5, h: 1.6, d: 0.52, seed: 'guildhall-hearth', lit: true,
      at: [-15.4, F, R.z0], ry: 0,
    });
    hearth.name = 'guildhall-hearth';
    add(hearth);
    add(room.table({ w: 1.9, d: 0.9, seed: 'reeve-table', at: [-15.4, F, -0.55], ry: 0 }));
    /* a bench's ry is a function of which side of the table it stands on;
     * written as one constant it is guaranteed wrong for one of a pair */
    add(room.benchSeat({ w: 1.5, seed: 'reeve-bench-w', at: [-16.9, F, -0.55], ry: Math.PI / 2 }));
    add(room.benchSeat({ w: 1.5, seed: 'reeve-bench-e', at: [-13.9, F, -0.55], ry: -Math.PI / 2 }));
    add(room.stool({ seed: 'reeve-stool-a', at: [-16.4, F, 1.35], ry: 0.4 }));
    add(room.stool({ seed: 'reeve-stool-b', at: [-12.5, F, 1.5], ry: -0.7 }));
    add(room.shelf({ w: 1.15, h: 1.75, seed: 'ledgers-w', at: [R.x0, F, 1.6], ry: Math.PI / 2 }));
    add(room.shelf({ w: 1.15, h: 1.75, seed: 'ledgers-e', at: [R.x1, F, -1.9], ry: -Math.PI / 2 }));
    add(room.counter({ w: 2.0, seed: 'muster-desk', at: [R.x1, F, 0.9], ry: -Math.PI / 2 }));
    add(room.crateStack({ n: 2, size: 0.5, seed: 'town-chest', at: [-12.6, F, -2.1], ry: 0.28 }));
    add(room.barrel({ seed: 'hall-barrel', at: [-16.6, F, 2.15], ry: 0.5 }));
    add(room.hangingLamp({ from: shell.ceilUnderY, drop: 0.72, seed: 'hall-lamp', at: [-14.2, F, 0.35] }));
    /* the two amber lanterns — the district's accent, indoors, unlit
     * until the bell.  `post: false` is a lantern SET DOWN. */
    const hallLamps = [
      lantern({ seed: 'hall-lantern-a', post: false, lit: false, glow: ACCENT.hallAmber }),
      lantern({ seed: 'hall-lantern-b', post: false, lit: false, glow: ACCENT.hallAmber }),
    ];
    /* ON the counter's top and ON the floor, seated from the surfaces'
     * own heights: `lantern`'s base plate is 0.05 under its origin, so a
     * lantern written at the surface height hovers by exactly that. */
    /* BOTH ON THE FLOOR, by the door, and not one of them on the counter:
     * `counter` carries goods on its top, so its bbox reaches 0.25 m over
     * the working surface and a lantern seated ON that surface reads to
     * the audit as 30 % inside it.  Two lanterns stood by the door on
     * muster night are also the better story — they are going out. */
    hallLamps[0].position.set(-12.10, F + 0.05, 0.90);
    hallLamps[1].position.set(-12.25, F + 0.05, 2.10);
    hallLamps.forEach((l, i) => { l.name = `hall-lantern-${i}`; add(l); });
    /* the guild banner off the north wall beside the hearth.  Local,
     * because the kit's `bannerPole` stands in a yard on its own ground. */
    const banner = (() => {
      const g = new THREE.Group();
      const P = parts();
      /* BONE FIELD, PLUM BANDS, and it is that way round because the room
       * has no direct light in it: a plum-wash cloth under the cel ramp's
       * bottom band came back as a black rectangle on the wall with its
       * own trim invisible — the same reason `interiors.js` says its
       * plaster and boards are HIGH-VALUE despite reading as dark. */
      P.add(M.ironDark, cyl(0.022, 0.022, 1.05, 0, 2.42, 0.13, { seg: 5, rz: Math.PI / 2 }));
      P.add(painted(JOINERY.bone), bx(0.95, 1.35, 0.03, 0, 1.72, 0.11, { seg: 3 }));
      for (const y of [1.09, 2.31]) P.add(painted(JOINERY.plumWash), bx(0.95, 0.09, 0.035, 0, y, 0.108));
      P.flush(g, { cast: false });
      g.userData = { prop: true, kind: 'banner', airborne: true };
      g.name = 'guildhall-banner';
      const dev = signKit.devicePlate({
        device: 'bell', w: 0.44, h: 0.44, bg: JOINERY.bone, ink: JOINERY.plumWash,
        seed: 'guild-banner-device', border: false,
      });
      dev.position.set(0, 1.74, 0.13);
      g.add(dev);
      g.position.set(-13.05, F, R.z0);
      return g;
    })();
    add(banner);
    /* THE OPENINGS HAVE TO CARRY LIGHT OR THE HALL IS A DEAD BOX.
     * `hollowShell` cuts a hole and puts nothing behind it, so at dusk
     * every window on this building read as a dark rectangle in a pale
     * reveal — an empty box with a roof on, from the one frame that
     * matters (a low shot up at its eaves from the floor).  A glow card
     * on the INNER face of each opening is what a room with a fire in it
     * actually looks like from the street.  The front pair is always on
     * (the Reeve is in there); the pair that faces the square comes up
     * with the bell, which is the beat.
     *
     * THEY ARE NOT PART OF THE INTERIOR GROUP, and that is the whole
     * point: `registerInterior` distance-culls the dressing from 25 m,
     * measured from the DOOR and using the PLAYER'S position — so a glow
     * card parented to the room is invisible from anywhere in the square,
     * which is the only place it was ever meant to be seen from.  The
     * cards are the building seen from the street, like the shell and the
     * roof, and they are drawn always. */
    const hallWindows = new THREE.Group();
    const glowAt = (x, z, ry, w, h, on) => {
      const c = room.glowCard({ w, h, ember: false, opacity: 0.5 });
      c.position.set(x, F + 1.35, z);
      c.rotation.y = ry;
      c.visible = on;
      hallWindows.add(c);
      return c;
    };
    glowAt(HALL.x + 2.35, R.z1 - 0.03, 0, 0.95, 0.9, true);
    glowAt(HALL.x - 2.35, R.z1 - 0.03, 0, 0.95, 0.9, true);
    /* one of the pair that faces the square is ALWAYS on — a shelter with
     * two dead windows at dusk is a dead building, and the low frame up at
     * this hall's eaves is one of the district's own evidence shots.  The
     * other comes up with the bell, so the beat still reads. */
    glowAt(R.x1 - 0.03, -1.40, Math.PI / 2, 1.0, 0.9, true);
    const eastGlow = [glowAt(R.x1 - 0.03, 1.40, Math.PI / 2, 1.0, 0.9, false)];
    ctx.add(hallWindows, 'guildhall-windows');
    ctx.add(interior, 'guildhall-interior');
    registerInterior(ctx, interior, { door: shell.doorway, name: 'guildhall' });

    /* -- what the hall wears outside.  The frontage is z+, outward normal
     * (0, 1), so every plate on it is ry = atan2(0, 1) = 0. */
    const FRONT_Z = HALL.z + HALL.d / 2;
    onWall(signKit.fasciaBoard({
      tenant: 'reeveHall', w: 3.6, h: 0.66, seed: 'hall-fascia', depth: 0.09, corbels: true,
    }), HALL.x, hallGround + 2.86, FRONT_Z + 0.001, 0, 1, 'hall-fascia');
    onWall(signKit.wallNotice({ notice: 'muster', w: 0.4, h: 0.54, seed: 'hall-muster', tilt: 0.03 }),
      HALL.x + 1.06, hallGround + 1.62, FRONT_Z + 0.002, 0, 1, 'hall-muster');
    onWall(signKit.wallNotice({ notice: 'rota', w: 0.38, h: 0.5, seed: 'hall-rota', tilt: -0.02 }),
      HALL.x + 1.58, hallGround + 1.6, FRONT_Z + 0.002, 0, 1, 'hall-rota');
    /* THE MARKET'S PRICES, chalked, and it is on the HALL and not on the
     * chandler's for a measured reason: `cottage` is ONE tagged audit unit
     * whose bbox includes its `tradeFront` (x 13.28 against a wall plane
     * of 13.80) and 0.85 m of thatch overhang, so anything flat bolted to
     * a cottage frontage reads to the spatial audit as interpenetrating
     * it, wherever on the wall it goes.  `hollowShell` is deliberately not
     * tagged, so the hall's own wall can carry one — and a Reeve's hall on
     * market day is where the prices are posted anyway.
     * The board sits in the WEST jamb pier (x -16.03..-15.00): the
     * openings are the wall, and there are only four solid pieces of it. */
    onWall(signKit.chalkedBoard({
      head: 'THIS DAY', lines: ['WHEAT  4 d. THE BUSHEL', 'WOOL  —  NO SALE', 'TALLOW  6 a d.'],
      w: 0.78, h: 0.6, seed: 'market-prices',
    }), HALL.x - 1.31, hallGround + 1.42, FRONT_Z + 0.004, 0, 1, 'market-prices');
    onWall(signKit.devicePlate({
      device: 'bell', w: 0.42, h: 0.42, bg: JOINERY.plumWash, ink: JOINERY.bone, seed: 'hall-device',
    }), HALL.x + 3.02, hallGround + 2.24, FRONT_Z + 0.002, 0, 1, 'hall-device');

    /* THE ACCENT: two bracket lamps at the door and two strings over the
     * porch.  All of them UNLIT, and all of them come up on the bell. */
    /* ONLY THE WEST ONE CARRIES A FLOOR POOL.  A light pool is a flat
     * decal at one height, and the east bracket stands 1.2 m from the head
     * of the west stair: measured, its 3.4 m pool reached x -11.32, z 5.22
     * — hanging over the fourth tread, 0.38 m in the air.  Nothing renders
     * that as a mistake; what found it was the stair rail's own run check,
     * reporting itself buried under a surface at y 0.03. */
    /* `bracketLantern` HAS NO `setLit`, AND `glow` LIGHTS IT UNCONDITIONALLY.
     * Read off a low frame up at the eaves and then confirmed in the
     * source: the pane is `glowing(glow, glow, 0.9)` whatever `lit` says,
     * so the district's whole accent was already up before the bell and
     * `setLit?.()` on it was a silent no-op — the beat played with nothing
     * to see.  Two brackets are built at the SAME POINT, one glazed and
     * one lit, and one of them is hidden: the kit's own rule for
     * `lantern`, applied from outside.  Only the unlit one is a tagged
     * audit unit, because two units in one place is a 100 % OVERLAP.
     * KIT REQUEST: put `bracketLantern` through `switchable`. */
    const hallBrackets = [];
    for (const [i, dx] of [-1.18, 1.18].entries()) {
      const states = [false, true].map((on) => {
        const b = villageProps.bracketLantern({
          seed: `hall-bracket-${i}`, reach: 0.52, lit: false,
          glow: on ? ACCENT.hallAmber : null,
          groundDrop: on && i === 0 ? -2.42 : null,
        });
        /* `withPools` hands back a WRAPPER whose child carries the tag, so
         * clearing `prop` on the wrapper clears nothing: the audit found
         * the inner `bracket-lantern` unit and flagged it 100 % inside its
         * own dark twin.  Untag the subtree. */
        if (on) b.traverse((o) => { if (o.userData?.prop) o.userData = { ...o.userData, prop: false }; });
        b.visible = on;
        return onWall(b, HALL.x + dx, hallGround + 2.42, FRONT_Z + 0.001, 0, 1,
          `hall-bracket-${i}-${on ? 'lit' : 'dark'}`);
      });
      states[0].visible = true;
      states[1].visible = false;
      hallBrackets.push({ userData: { setLit: (on) => { states[0].visible = !on; states[1].visible = on; } } });
    }

    /* two poles on the south rim carry the strings off the hall's eaves.
     * (-15.8, 8.8) and (-11.2, 8.8): both clear of market-lane-w's
     * corridor, which keeps x -18..-15, z 4.2..7.8 open into my side. */
    /* `lantern` from the siege kit and NOT `postLantern`: the second has
     * no `setLit` and glazes an unlit lamp in `M.glass`, which at this
     * hour is a cool blue box at eye height — the one cool note in a town
     * whose whole rule is that cool belongs to chapelclose. */
    const POLES = [[-15.8, 8.8], [-11.2, 8.8]];
    const poleLamps = POLES.map(([x, z], i) => place(ctx, lantern({
      seed: `market-pole-${i}`, h: 3.2, post: true, lit: false, glow: ACCENT.hallAmber,
    }), { x, z, yaw: 0, name: `market-pole-${i}` }));

    const eaveY = shell.wallTopY + 0.16;
    const strings = [
      lanternString({
        seed: 'hall-string-w', from: [HALL.x - 2.6, eaveY, FRONT_Z + 0.30],
        to: [POLES[0][0], G(...POLES[0]) + 3.5, POLES[0][1]],
        count: 9, sag: 0.7, lit: false, size: 0.22,
        colors: [ACCENT.hallAmber, PAL.lanternPaper], groundAt: G,
      }),
      lanternString({
        seed: 'hall-string-e', from: [HALL.x + 2.6, eaveY, FRONT_Z + 0.30],
        to: [POLES[1][0], G(...POLES[1]) + 3.5, POLES[1][1]],
        count: 9, sag: 0.7, lit: false, size: 0.22,
        colors: [ACCENT.hallAmber, PAL.lanternPaper], groundAt: G,
      }),
    ];
    strings.forEach((s, i) => ctx.add(s, `hall-string-${i}`));

    /* the hall's yard, north of it on the west rim: the wood for its
     * hearth, its store, and the watch's spears out of the rain.  None of
     * it is within 1.5 m of the Reeve's post at (-13.2, 5.2). */
    ctx.add(leanTo({
      w: 3.2, d: 2.2, h: 2.3, open: 'x+', at: [-16.0, G(-16.0, -6.4), -6.4],
      mat: M.oakSilver, roofMat: M.shingleMoss, ctx,
    }), 'hall-store');
    place(ctx, villageProps.logPile({ seed: 'hall-logs', w: 1.9, h: 0.9, d: 0.6, roof: false }),
      { x: -16.2, z: -4.1, yaw: 0, name: 'hall-logs' });
    prop(siegeProps.spearRack({ seed: 'hall-spears', n: 7, w: 1.5, h: 1.9 }), -12.6, -7.4, Math.PI / 2, 'hall-spears');
    prop(villageProps.barrel({ seed: 'hall-rain-butt' }), -11.3, -3.4, 0, 'hall-rain-butt');

    /* ---------------------------------------------------------------- *
     * 5. THE OTHER TWO FRONTAGES.
     * ---------------------------------------------------------------- */
    /* THE CHANDLER'S, on the east rim, front to the square.  d 3.8 and
     * not a square plan for one measured reason: the rim is 6 m deep and
     * a 5 m building leaves a metre of apron, i.e. a shopfront on the lip
     * of a 1.4 m drop.  At 3.8 the apron is 1.75 m. */
    const CHA = { x: 15.7, z: -8.0 };
    const chandler = cottage({
      seed: 'market-chandlers', w: 6.0, d: 3.8, storeys: 1.5, groundH: 2.5,
      wall: 'limewash', wallColor: PAL.limewashHoney, roof: 'thatch', pitch: 0.86, crook: 0.95,
      door: JOINERY.oakStain, shutter: JOINERY.barnRust, shutters: 'mixed',
      trade: { lit: true }, tradeAccent: JOINERY.barnRust, litWindows: 1, dormers: 1,
    });
    place(ctx, chandler, { x: CHA.x, z: CHA.z, yaw: -Math.PI / 2, name: 'chandlers' });
    liftRoof(chandler, chandler.userData.eaveY, 'chandlers');
    const chaBase = G(CHA.x, CHA.z) - 0.03;
    /* the face is the GENERATOR'S, not d/2: a cottage carries a plinth and
     * a thatch overhang past its own footprint, so a plate written at
     * `x - d/2` is inside the render.  frontZ is the body's own front. */
    const CHA_FACE = CHA.x - (chandler.userData.frontZ ?? 1.9) - 0.02;
    onWall(signKit.hangingSign({
      tenant: 'chandlers', w: 1.3, h: 1.0, seed: 'chandlers-board', standoff: 0.24, ctx, sway: 0.05,
    }), CHA_FACE, chaBase + 2.95, CHA.z - 2.1, -1, 0, 'chandlers-sign');
    prop(villageProps.crateStack({ seed: 'chandlers-crates', n: 2, spill: true }), 13.5, -10.2, -0.4, 'chandlers-crates');
    prop(villageProps.barrel({ seed: 'chandlers-barrel', tipped: true }), 13.4, -5.5, 0.3, 'chandlers-barrel');

    /* THE REEVE'S OWN HOUSE, on the north rim.  Two storeys and shingle:
     * it is the Reeve's.  It is clear of the vista's own ray (5.10 m up
     * at x 0.96) only because it starts at x 5.2. */
    const REE = { x: 8.4, z: -15.7 };
    const reeveHouse = cottage({
      seed: 'market-reeve-house', w: 6.4, d: 4.0, storeys: 2, groundH: 2.4, upperH: 2.1,
      jetty: 0.26, wall: 'limewash', roof: 'shingle', pitch: 0.56, crook: 0.4,
      door: JOINERY.plumWash, shutter: JOINERY.doveGrey, shutters: 'open',
      litWindows: 2, windowBoxes: true,
    });
    place(ctx, reeveHouse, { x: REE.x, z: REE.z, yaw: 0, name: 'reeve-house' });
    liftRoof(reeveHouse, reeveHouse.userData.eaveY, 'reeve-house');
    const reeBase = G(REE.x, REE.z) - 0.03;
    onWall(signKit.devicePlate({
      device: 'sheaf', w: 0.42, h: 0.42, bg: JOINERY.doveGrey, ink: PAL.ink, seed: 'reeve-house-plate',
    }), REE.x - 2.3, reeBase + 2.2, REE.z + 2.02, 0, 1, 'reeve-house-plate');
    place(ctx, villageProps.kitchenGarden({ seed: 'reeve-garden', w: 2.6, d: 1.5 }),
      { x: 13.2, z: -15.6, yaw: 0, name: 'reeve-garden' });
    ctx.add(bench({
      w: 1.6, at: [4.6, G(4.6, -13.0), -13.0], facing: [0, 1], mat: M.oakSilver, ctx,
    }), 'reeve-house-bench');

    /* ---------------------------------------------------------------- *
     * 6. THE MARKET — the cover, laid out as a market.
     *
     * Two rows N-S at x -4.4 and x 5.6 leave an 8.3 m lane down the
     * middle with the well as its pivot; the watch's gabions narrow it to
     * 2.36 m at the ramp foot, which is the choke on the floor itself.
     * ---------------------------------------------------------------- */
    const STALLS = [
      ['a1', -4.4, 4.4, Math.PI / 2, 'produce', [PAL.canvas, PAL.canvasWorn], false],
      ['a2', -4.4, 1.0, Math.PI / 2, 'crocks', [PAL.canvasWorn, JOINERY.doveGrey], false],
      ['a3', -4.4, -2.4, Math.PI / 2, 'bread', [PAL.canvas, JOINERY.mossPaint], true],
      ['b1', 5.6, 3.0, -Math.PI / 2, 'lanterns', [PAL.canvasWorn, JOINERY.bone], false],
      ['b2', 5.6, -0.4, -Math.PI / 2, 'produce', [PAL.canvas, JOINERY.plumWash], false],
      ['b3', 5.6, -3.8, -Math.PI / 2, 'crocks', [PAL.canvasWorn, JOINERY.barnRust], true],
    ];
    for (const [id, x, z, yaw, goods, tones, back] of STALLS) {
      const st = marketStall({
        seed: `market-stall-${id}`, w: 2.5, d: 1.7, h: 2.15,
        goods, tones, sag: 0.13, valance: true, back,
      });
      place(ctx, st, { x, z, yaw, name: `stall-${id}` });
      /* `marketStall` collides its four POSTS and nothing else, so you can
       * stand under the canopy — right for a fair, and not enough for a
       * siege.  The TRESTLE is the thing you get behind, and it needs a
       * collider of its own or the referee's "behind cover" test has
       * nowhere to be.  Every stall here is yawed +/-PI/2, so its w runs
       * along z and its d along x. */
      ctx.collide(x - 0.62, z - 1.22, x + 0.62, z + 1.22);
      st.userData.cover = true;
      st.userData.coverH = 2.05;    // the canopy: a stall is a sight block
      coverList.push([`stall-${id}`, 2.05]);
    }

    /* THE STRUCK STALL — a4, the one they had got the canvas off when the
     * bell went.  Its boards lean on its own frame, which is the 1.3 m of
     * cover at the row's north end and the district's "ten minutes ago". */
    const struckStall = ({ seed, w = 2.5, d = 1.7, h = 2.15 }) => {
      const rr = rng(seed);
      const g = new THREE.Group();
      const P = parts();
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        P.add(M.oak, cyl(0.045, 0.055, h, sx * (w / 2 - 0.06), h / 2, sz * (d / 2 - 0.06), { seg: 6 }));
      }
      for (const sz of [-1, 1]) P.add(M.oakDark, bx(w, 0.05, 0.05, 0, h - 0.03, sz * (d / 2 - 0.06)));
      for (const sx of [-1, 1]) P.add(M.oakDark, bx(0.05, 0.05, d, sx * (w / 2 - 0.06), h - 0.08, 0));
      /* the canvas rolled and lashed along the ridge — the reason the
       * frame reads as STRUCK rather than as never built */
      P.add(M.canvasWorn, cyl(0.17, 0.17, w - 0.2, 0, h + 0.06, 0, { seg: 8, rz: Math.PI / 2 }));
      for (const u of [-0.7, 0, 0.7]) P.add(M.rope, cyl(0.02, 0.02, 0.42, u * w * 0.5, h + 0.06, 0, { seg: 4 }));
      /* THE BOARDS, off the trestle and leaning on the frame.  A raked
       * slab's vertical half-extent is L*sin(t)/2 + th*cos(t)/2 and the
       * second term is not small: the foot is ON the ground and the head
       * on the mid-rail, so the centre is derived from both rather than
       * guessed.  head 1.24 over a 2.26 m board -> t 0.5766. */
      const bl = 2.26;
      const head = 1.24;
      const t = Math.asin(head / bl);
      for (let i = 0; i < 3; i += 1) {
        const off = (i - 1) * 0.32;
        P.add(M.oakSilver, bx(bl, 0.055, 0.4, 0.02, head / 2, off + 0.2,
          { rz: t + rr.range(-0.03, 0.03), seg: 4 }));
      }
      /* the trestle horses themselves, folded against the far post */
      P.add(M.oakDark, bx(0.09, 0.82, 0.09, -w / 2 + 0.5, 0.41, -d / 2 + 0.4, { rz: 0.22 }));
      P.add(M.oakDark, bx(0.09, 0.82, 0.09, -w / 2 + 0.68, 0.41, -d / 2 + 0.4, { rz: -0.18 }));
      P.flush(g);
      g.userData = {
        prop: true, kind: 'struck-stall', w, d, h,
        footprint: { x0: -w / 2 - 0.08, z0: -d / 2 - 0.08, x1: w / 2 + 0.08, z1: d / 2 + 0.08 },
      };
      g.name = 'struck-stall';
      return g;
    };
    cover(struckStall({ seed: 'market-stall-a4' }), -4.4, -5.8, Math.PI / 2, 'stall-a4-struck');

    /* THE WELL — the pivot of the floor, and the second interaction.
     *
     * (1, -1.5) AND NOT (1, -3), which is where the brief draws it: (1, -3)
     * is the plan's own waypoint "the well", and a 2.25 m footprint centred
     * on a waypoint puts that waypoint 1.13 m inside a collider.  The flood
     * fill seeds THERE, so the whole district came back unreachable from
     * its own seed with every route in it open.  (1, -3) is now the ground
     * you stand on at the well's south kerb, 1.6 m off its centre, which is
     * what a waypoint called "the well" should have been all along.
     *
     * h 0.92 rather than the default 0.72 because a well head that is
     * cover has to MEASURE 0.9 at the rim, and the referee reads what it
     * measures.
     *
     * NO ROOF, and that is decided rather than skipped.  `wellHead`'s
     * cover is a single-pitch shed scaled off the drum's radius, carried
     * on the two windlass posts and overhanging both of them: at r 0.9 it
     * came out 2.6 m across over a 1.8 m drum and read, from three metres
     * and from the district's own vista, as a slab hovering over the well
     * with nothing holding it.  Shrinking it helped and did not fix it,
     * which is the tell that the shape and not the size is wrong.  A well
     * is read by its drum, its windlass and its bucket — and this one
     * stands in the middle of an arena, where an ambiguous 2.6 m canopy
     * over the one piece of central cover is worse than no canopy. */
    const WELL = { x: 1.0, z: -1.5 };
    /* yaw 0 and a PALE roof.  `wellHead`'s cover is a single-pitch shed
     * falling to local +z; turned a quarter turn it falls east, and from
     * the ramp foot — which is the district's own vista and the way wave 2
     * arrives — you saw it edge on: one dark plank at 25 degrees hanging
     * over the well with nothing under it, in `M.shingleMoss` against a
     * violet sky.  Square to the lane and painted a pale dove grey, it
     * reads as a roof. */
    const well = villageProps.wellHead({
      seed: 'market-well', r: 0.78, h: 0.92, roof: false, bucket: false,
    });
    cover(well, WELL.x, WELL.z, 0, 'well');
    const wellY = G(WELL.x, WELL.z);

    /* THE CORN CROSS.  x -6.8 and not the middle of the square, because
     * `gate-sees-keep` keeps x -3..3 clear over the whole district; and
     * SOUTH of the well rather than west of it, so that from the well the
     * wizards' tower on the (-36, -34) bearing is behind the cross's own
     * origin rather than in front of it. */
    const marketCross = ({ seed }) => {
      const g = new THREE.Group();
      const P = parts();
      let y = 0;
      [[1.72, 0.30, M.rubble], [1.34, 0.30, M.granite], [0.98, 0.32, M.granite]]
        .forEach(([sw, sh, mat]) => {
          P.add(mat, bx(sw, sh, sw, 0, y + sh / 2, 0, { seg: 2 }));
          y += sh;
        });
      P.add(M.graniteWarm, bx(0.72, 0.14, 0.72, 0, y + 0.07, 0));
      y += 0.14;
      /* the shaft is OCTAGONAL and tapers — a square post reads as a
       * fence post at 25 m, which is what a market cross must not do */
      P.add(M.granite, cyl(0.15, 0.23, 2.30, 0, y + 1.15, 0, { seg: 8 }));
      y += 2.30;
      P.add(M.graniteWarm, cyl(0.30, 0.19, 0.20, 0, y + 0.10, 0, { seg: 8 }));
      y += 0.20;
      /* the head: a small gabled tabernacle.  NO PEOPLE on it, including
       * in a niche — the niches carry a sheaf and a bell instead. */
      P.add(M.graniteWarm, bx(0.52, 0.46, 0.52, 0, y + 0.23, 0, { seg: 2 }));
      for (const s of [-1, 1]) {
        P.add(M.coping, bx(0.44, 0.09, 0.62, s * 0.13, y + 0.53, 0, { rz: -s * 0.62 }));
      }
      P.add(M.coping, cyl(0.02, 0.06, 0.34, 0, y + 0.74, 0, { seg: 6 }));
      P.flush(g);
      g.userData = {
        prop: true, kind: 'market-cross', plinthY: 0.92,
        footprint: { x0: -0.9, z0: -0.9, x1: 0.9, z1: 0.9 },
      };
      g.name = 'market-cross';
      return g;
    };
    /* (-6.9, 0.6) and not (-6.8, 3.2): a market cross belongs in the
     * middle of its square, and read off the district's own vista the
     * first position sat behind stall a1's canopy with only its head
     * clear.  It stays off x -3..3 (`gate-sees-keep`) and 4.67 m off
     * `market-sees-tower`'s axis, which is what fixes it in x at all. */
    cover(marketCross({ seed: 'market-cross' }), -6.9, 0.6, 0.0, 'corn-cross');

    /* the rest of the cover, CLUSTERED: the two gabions the watch stood
     * at the ramp foot this afternoon (a 2.36 m throat between them once
     * the player's radius is on both sides), the gear that came off the
     * carts with them, and the market's own goods piled at the rows' ends. */
    cover(siegeProps.gabion({ seed: 'ramp-gabion-w', r: 0.58, h: 1.08 }), -2.0, 6.8, 0, 'gabion-w');
    cover(siegeProps.gabion({ seed: 'ramp-gabion-e', r: 0.58, h: 1.08 }), 2.2, 6.8, 0, 'gabion-e');
    cover(siegeProps.mantlet({ seed: 'ramp-mantlet', w: 1.7, h: 1.5, lean: 0.2 }), 8.6, 4.6, -Math.PI / 2, 'mantlet');
    cover(siegeProps.felledCart({ seed: 'market-felled-cart' }), 7.8, 6.4, Math.PI / 2, 'felled-cart');
    cover(villageProps.crateStack({ seed: 'market-crates-s', n: 3, spill: true }), -1.9, 4.9, -Math.PI / 2, 'crates-south');
    cover(villageProps.crateStack({ seed: 'market-crates-n', n: 3, spill: true }), -7.6, -2.6, Math.PI / 2, 'crates-west');
    cover(villageProps.barrelStack({ seed: 'market-barrels', rows: 3 }), 8.8, -1.4, 0, 'barrels-east');
    cover(villageProps.cart({
      seed: 'market-cart', L: 2.6, W: 1.35, wheelR: 0.5, load: 'crates', shafts: true,
    }), -1.4, -9.4, 0, 'market-cart');

    /* ---------------------------------------------------------------- *
     * 7. TEN MINUTES AGO — the market was clearing and stopped.
     *    Clusters of evidence, not scatter.
     * ---------------------------------------------------------------- */
    prop(villageProps.crate({ seed: 'spilled-basket', w: 0.56, d: 0.5, h: 0.4, open: true, goods: PAL.strawLitter }),
      -2.7, 2.1, 0.7, 'spilled-basket');
    const spill = parts();
    for (let i = 0; i < 11; i += 1) {
      const a = r.range(0, Math.PI * 2);
      const rad = r.range(0.35, 1.5);
      const s = r.range(0.09, 0.15);
      const sx = -2.7 + Math.sin(a) * rad;
      const sz = 2.1 + Math.cos(a) * rad * 0.8;
      spill.add(r.chance(0.5) ? M.leafOrchard : M.straw,
        cyl(s, s * 0.9, s * 1.5, sx, G(sx, sz) + s * 0.7, sz, { seg: 7, rz: r.range(-0.4, 0.4) }));
    }
    /* the dog's bowl on the cross's bottom step, and the rope he was tied
     * with still lying by it.  The lost-dog bill is on the board. */
    spill.add(M.rubble, cyl(0.15, 0.11, 0.09, -5.82, G(-5.82, 0.9) + 0.045, 0.9, { seg: 9, open: true }));
    spill.add(M.rope, cyl(0.032, 0.032, 0.9, -6.6, G(-6.6, 1.3) + 0.05, 1.3, { seg: 5, rz: Math.PI / 2, ry: 0.5 }));
    spill.add(M.rope, cyl(0.03, 0.03, 0.5, -6.2, G(-6.2, 1.1) + 0.05, 1.1, { seg: 5, rz: Math.PI / 2, ry: -0.9 }));
    /* the broom put down mid-sweep at the row's end */
    spill.add(M.oakDark, cyl(0.026, 0.026, 1.35, 4.5, G(4.5, 1.6) + 0.09, 1.6, { seg: 5, rz: 1.44, ry: 0.8 }));
    spill.add(M.straw, bx(0.36, 0.18, 0.16, 4.86, G(4.86, 1.9) + 0.09, 1.9, { ry: 0.8 }));
    spill.flush(ctx.add(new THREE.Group(), 'ten-minutes-ago'));

    prop(villageProps.sackStack({ seed: 'market-sacks', n: 4 }), 6.9, -6.6, 0.4, 'market-sacks');
    prop(villageProps.barrel({ seed: 'market-barrel-tipped', tipped: true }), -6.0, -6.4, 0.9, 'tipped-barrel');
    prop(siegeProps.arrowBundle({ seed: 'market-arrows', n: 18, h: 0.95 }), -8.6, 2.6, 0.4, 'arrow-bundle');
    prop(siegeProps.oilPots({ seed: 'market-oil', n: 3, spread: 1.0 }), 2.7, -10.8, 0.2, 'oil-pots');
    prop(siegeProps.stretcher({ seed: 'market-stretcher' }), 5.4, -9.9, 1.1, 'stretcher');
    prop(villageProps.ladder({ seed: 'market-ladder', len: 3.4, standoff: 0.85 }), 10.6, -9.4, -Math.PI / 2, 'market-ladder');

    /* THE WATCH'S BRAZIER, lit — ember, which is fire and not an accent.
     *
     * TWO THINGS ARE FIXED HERE AND BOTH CAME OFF FRAMES.  (a) `brazier`'s
     * flame is an UPSIDE-DOWN CONE: `cyl` takes (radiusTOP, radiusBOTTOM)
     * and props.js writes `cyl(R * 0.62, R * 0.18, ...)`, so the fire is
     * 0.47 m across at the sky and comes to a point at the coals.  From
     * two metres it is a traffic cone; from the ramp foot it filled a
     * sixth of the frame in flat saturated orange.  Same class as the
     * `hayRick` parasol in the kit's own errata, and the same tell — the
     * prop reads as the wrong object and no amount of resizing helps.
     * The kit's flame group is hidden and an upright one built over it,
     * taller than it is wide, which is the other half of the rule.
     * KIT REQUEST: swap the two radii in `brazier`'s flame.
     * (b) at (0.2, 5.5) it stood on the LANE'S OWN CENTRE LINE, 1.5 m from
     * the ramp foot and dead centre of the district's vista.  It belongs
     * beside the row, not in the road. */
    const brazier = villageProps.brazier({ seed: 'market-brazier', r: 0.38, h: 0.66, lit: true, ctx });
    const kitFlame = brazier.getObjectByName('brazier-flame');
    if (kitFlame) kitFlame.visible = false;
    (() => {
      const R2 = 0.38;
      const hh = 0.66;
      const f = new THREE.Group();
      const P = parts();
      P.add(M.emberDeep, cyl(R2 * 0.5, R2 * 0.44, 0.1, 0, hh + 0.12, 0, { seg: 9 }));
      P.add(M.ember, cyl(R2 * 0.16, R2 * 0.58, 0.5, 0, hh + 0.38, 0, { seg: 8 }));
      P.add(M.lit, cyl(R2 * 0.07, R2 * 0.3, 0.3, 0, hh + 0.28, 0, { seg: 7 }));
      P.flush(f, { receive: false, cast: false });
      f.name = 'brazier-flame-upright';
      brazier.add(f);
    })();
    place(ctx, brazier, { x: -5.6, z: 6.4, yaw: 0, name: 'watch-brazier' });

    /* two benches on the floor, each derived from which side it stands on */
    ctx.add(bench({ w: 1.7, at: [3.2, wellY, -3.4], facing: [-1, 0.25], mat: M.oakSilver, ctx }), 'well-bench-e');
    ctx.add(bench({ w: 1.7, at: [-7.4, G(-7.4, 4.4), 4.4], facing: [1, -0.2], mat: M.oakSilver, ctx }), 'stair-foot-bench');

    /* ---------------------------------------------------------------- *
     * 8. THE TWO INTERACTIONS.
     * ---------------------------------------------------------------- */
    /* -- THE MARKET BELL.  The plan puts it at (-12, 6.5), which measures
     * -0.525: the fourth tread of the west stair.  The frame stands on
     * the rim beside the stair head instead and the hitbox reaches back
     * over it.  E swings the bell and brings the hall's amber up. */
    const BELL = { x: -12.3, z: 7.55 };
    const bellFrame = (() => {
      const g = new THREE.Group();
      const P = parts();
      const H = 2.9;
      for (const s of [-1, 1]) {
        P.add(M.oak, bx(0.19, H, 0.19, s * 0.62, H / 2, 0, { seg: 3 }));
        /* a raking brace, derived from its two joints rather than from an
         * angle: a member written as a length at a bearing puts one end
         * where it belongs and the other in mid-air */
        const j0 = [s * 0.62, H - 0.9];
        const j1 = [s * 0.2, H - 0.16];
        const len = Math.hypot(j1[0] - j0[0], j1[1] - j0[1]);
        P.add(M.oakDark, bx(len, 0.09, 0.09, (j0[0] + j1[0]) / 2, (j0[1] + j1[1]) / 2, 0,
          { rz: Math.atan2(j1[1] - j0[1], j1[0] - j0[0]) }));
      }
      P.add(M.oakDark, bx(1.76, 0.2, 0.22, 0, H - 0.1, 0, { seg: 3 }));
      P.add(M.granite, bx(1.86, 0.18, 0.74, 0, 0.09, 0, { seg: 3 }));   // the pad
      P.flush(g);
      /* THE BELL IS A LIVE PIVOT and it hangs UNDER the headstock, which
       * is the whole point: a bell modelled about its own centre swings
       * its crown as far as its lip and reads as a wobbling cone. */
      const pivot = new THREE.Group();
      pivot.position.set(0, H - 0.24, 0);
      const B = parts();
      B.add(M.oakDark, bx(0.5, 0.14, 0.2, 0, 0, 0));
      B.add(M.brass, cyl(0.1, 0.34, 0.46, 0, -0.31, 0, { seg: 12, open: true }));
      B.add(M.brass, cyl(0.35, 0.35, 0.06, 0, -0.55, 0, { seg: 12 }));
      B.add(M.ironDark, cyl(0.028, 0.028, 0.3, 0, -0.4, 0, { seg: 5 }));
      B.add(M.ironDark, cyl(0.07, 0.07, 0.07, 0, -0.56, 0, { seg: 7 }));
      B.add(M.oakSilver, cyl(0.33, 0.33, 0.05, 0.3, 0, 0, { seg: 14, rz: Math.PI / 2 }));
      B.flush(pivot, { receive: false });
      g.add(pivot);
      const rope = new THREE.Group();
      const RP = parts();
      RP.add(M.rope, cyl(0.022, 0.022, 1.5, 0.62, H - 1.05, 0, { seg: 5 }));
      RP.flush(rope, { receive: false });
      g.add(rope);
      g.userData = {
        prop: true, kind: 'bell-frame', bellPivot: pivot, topY: H,
        footprint: { x0: -0.95, z0: -0.42, x1: 0.95, z1: 0.42 },
      };
      g.name = 'market-bell';
      return g;
    })();
    place(ctx, bellFrame, { x: BELL.x, z: BELL.z, yaw: Math.PI / 2, name: 'market-bell' });
    const bellPivot = bellFrame.userData.bellPivot;

    const setHallLit = (on) => {
      for (const s of strings) s.userData.setLit?.(on);
      for (const b of hallBrackets) b.userData.setLit?.(on);
      for (const l of hallLamps) l.userData.setLit?.(on);
      for (const l of poleLamps) l.userData.setLit?.(on);
      for (const c of eastGlow) c.visible = on;
    };
    let swing = 0;
    let t0 = 0;
    interactive(ctx, {
      name: 'the market bell',
      label: 'E · ring the market bell',
      at: [BELL.x + 0.15, G(BELL.x, BELL.z) + 1.6, BELL.z - 0.5],
      size: [2.0, 2.8, 2.0],
      action: () => { swing = 9.0; setHallLit(true); },
    });
    /* it rings for nine seconds and decays; the lanterns stay up.  A
     * swing that has settled by the 45th frame is a swing nothing can
     * see and nothing can measure. */
    ctx.update((dt) => {
      if (swing <= 0) return;
      swing -= dt;
      t0 += dt;
      bellPivot.rotation.z = Math.sin(t0 * 5.6) * 0.62 * Math.min(1, Math.max(0, swing / 9));
      if (swing <= 0) { swing = 0; t0 = 0; bellPivot.rotation.z = 0; }
    });

    /* -- THE WELL BUCKET.  `wellHead` merges its own bucket into one
     * pooled mesh, so the well is built with `bucket: false` and the
     * bucket is its own group: a thing that has to MOVE cannot be inside
     * a merged mesh, and an interaction whose only effect is a material
     * swap on a mesh nobody sees move plays perfectly with nothing at all
     * to look at. */
    const bucketRig = (() => {
      const g = new THREE.Group();
      const P = parts();
      P.add(M.oakDark, cyl(0.16, 0.14, 0.28, 0, 0, 0, { seg: 10, open: true }));
      P.add(M.iron, cyl(0.165, 0.165, 0.03, 0, 0.11, 0, { seg: 10 }));
      P.add(M.iron, cyl(0.165, 0.165, 0.03, 0, -0.09, 0, { seg: 10 }));
      P.add(M.glassDark, cyl(0.13, 0.13, 0.02, 0, 0.02, 0, { seg: 10 }));
      P.flush(g, { receive: false });
      /* NOT tagged as a prop unit: it hangs inside the well head's own
       * bbox, and a second tagged unit there is an OVERLAP against the
       * thing it belongs to.  It is part of the well, like a shutter is
       * part of a window. */
      g.userData = { airborne: true };
      g.name = 'well-bucket-body';
      return g;
    })();
    const ropeRig = (() => {
      const g = new THREE.Group();
      const P = parts();
      // authored 1 m long, hanging from y = 0 down to y = -1, scaled in y
      P.add(M.rope, cyl(0.014, 0.014, 1.0, 0, -0.5, 0, { seg: 4 }));
      P.flush(g, { receive: false });
      g.userData = { airborne: true };
      g.name = 'well-rope';
      return g;
    })();
    const WINDLASS_Y = wellY + 0.92 + 1.05;     // wellHead's own windlass height
    /* at rest the bucket's rim sits LEVEL WITH THE WELL'S, not down the
     * shaft: a bucket you cannot see is a prompt with nothing under it,
     * and this is the district's second interaction. */
    const BUCKET_DOWN = wellY + 0.80;
    const BUCKET_UP = BUCKET_DOWN + 0.80;
    const bucketGroup = new THREE.Group();
    bucketGroup.add(bucketRig, ropeRig);
    ctx.add(bucketGroup, 'well-bucket');
    let bucketY = BUCKET_DOWN;
    let bucketTo = BUCKET_DOWN;
    const seatBucket = () => {
      bucketRig.position.set(WELL.x, bucketY, WELL.z);
      ropeRig.position.set(WELL.x, WINDLASS_Y, WELL.z);
      ropeRig.scale.y = Math.max(0.05, WINDLASS_Y - bucketY - 0.16);
    };
    seatBucket();
    interactive(ctx, {
      name: 'the well bucket',
      label: 'E · wind the well bucket',
      /* the box spans the well AND the plan's own (1, -3), so the prompt
       * reads from the kerb you actually stand on */
      at: [WELL.x, wellY + 1.2, WELL.z - 0.75],
      size: [2.4, 2.8, 3.4],
      action: () => { bucketTo = bucketTo > BUCKET_DOWN + 0.4 ? BUCKET_DOWN : BUCKET_UP; },
    });
    ctx.update((dt) => {
      if (Math.abs(bucketY - bucketTo) < 1e-4) return;
      bucketY += Math.sign(bucketTo - bucketY) * Math.min(Math.abs(bucketTo - bucketY), dt * 1.2);
      seatBucket();
    });
    ctx.reset(() => {
      swing = 0; t0 = 0; bellPivot.rotation.z = 0; setHallLit(false);
      bucketY = BUCKET_DOWN; bucketTo = BUCKET_DOWN; seatBucket();
    });

    /* ---------------------------------------------------------------- *
     * 9. WAYFINDING AND WHAT IS WRITTEN.
     * ---------------------------------------------------------------- */
    /* the Reeve's board stands at the FOOT of the west stair rather than
     * on the porch: market-lane-w's corridor keeps x -18..-15, z 4.2..7.8
     * clear into my side, and the porch strip that is left is where the
     * Reeve and the runner have to be able to stand. */
    place(ctx, signKit.noticeBoardStand({
      notices: ['muster', 'rota', 'lostdog'], w: 1.6, h: 1.02, postH: 1.05,
      seed: 'market-board', accent: null,
    }), { x: -7.4, z: 6.6, yaw: Math.PI / 2, name: 'notice-board' });

    place(ctx, signKit.platePost({
      title: 'THE LOW MARKET', sub: 'CORN · WOOL · TALLOW', w: 0.98, h: 0.3, postH: 1.55,
      double: true, seed: 'market-plate', accent: null,
    }), { x: 4.4, z: 6.8, yaw: Math.PI / 2, name: 'market-plate' });

    place(ctx, signKit.fingerpost({
      postH: 2.25, w: 1.1, h: 0.22, seed: 'market-finger', bg: JOINERY.bone, ink: PAL.ink,
      arms: [
        { text: 'THE KEEP', dir: Math.PI },
        { text: 'SOUTH GATE', dir: 0 },
        { text: 'THE ROW', dir: Math.PI / 2 },
        { text: 'THE MILL', dir: -Math.PI / 2 },
      ],
    }), { x: 5.6, z: 10.6, yaw: 0, name: 'fingerpost' });

    place(ctx, villageProps.waymarker({ seed: 'market-marker', h: 0.72 }),
      { x: -6.2, z: -13.2, yaw: 0, name: 'north-marker' });

    /* ---------------------------------------------------------------- *
     * 10. PLANTING.  The square itself carries none — it is a market
     *     floor and every square metre of it is cover, lane or choke.
     *     ONE compact stand, on the south rim east of the ramp — which is
     *     where the vista camera stands, so it is the frame's own near
     *     edge.  NOTHING on the west rim: `market-sees-tower` runs out of
     *     the square across it and a 6 m orchard tree 2 m off that axis is
     *     the one cool light in the town gone.  NOTHING on the north rim
     *     across x -3..3 either — that is the vista's sight line and the
     *     keep's.  Two trees, four metres apart: a stand's audit unit is
     *     the bbox over every spot it carries, so two trees forty metres
     *     apart is a phantom that overlaps everything between them.
     * ---------------------------------------------------------------- */
    /* YEW AND NOT ORCHARD.  `M.leafOrchard` is a light yellow-green, and
     * two trees of it on a rim, seen against a violet dusk sky from the
     * far side of the square, were the loudest thing in the frame and the
     * only saturated colour in the district that is not the accent.  Yew
     * is the dark one, and dark is what a skyline wants. */
    ctx.add(treeStand({
      seed: 'market-stand-se', kind: 'yew', groundAt: G, density: 0.7,
      spots: [[9.4, 12.6], [11.2, 13.8]],
    }), 'south-east-trees');

    void coverList;
  },
});

/* ==================================================================== *
 * TRAPS HIT ON THIS DISTRICT, in the order they were found.  Every one
 * of them rendered perfectly and threw nothing, and the tool that found
 * each is named, because which tool finds a class of bug is the reusable
 * part.
 *
 * 1. A PROP CENTRED ON ITS OWN WAYPOINT IS A WAYPOINT INSIDE A COLLIDER.
 *    The well went at (1, -3) because that is where the plan draws "the
 *    well", and the plan ALSO seeds the flood fill there — so the whole
 *    district came back unreachable from its own seed with every route in
 *    it open.  The waypoint is the ground you stand on at the well, not
 *    the well.  (Found by: check-city's fill, which refused to start.)
 *
 * 2. A 5 m GROUND DECAL SEATED ON ITS OWN CENTRE HANGS OVER THE STAIR
 *    BESIDE IT.  The hall's gravel porch was 5 m wide and reached 1.2 m
 *    into the west stair's notch, floating 0.35 m over the top treads.
 *    Nothing renders it as a mistake — a pale patch on a pale rim.  What
 *    found it was the STAIR RAIL, reported BURIED-RUN under "a surface at
 *    y 0.03" that had no business being there.  (Found by: check-spatial.)
 *
 * 3. …AND SO DOES A LIGHT POOL.  A pool is a flat decal at one height:
 *    the east bracket lantern's, 3.4 m across, reached x -11.32, z 5.22 —
 *    over the fourth tread.  Only the west bracket carries one now.
 *
 * 4. `bracketLantern` HAS NO `setLit`, AND `glow` LIGHTS IT
 *    UNCONDITIONALLY (props.js: the pane is `glowing(glow, glow, 0.9)`
 *    whatever `lit` says).  So the district's whole accent was already up
 *    before the bell, and `b.userData.setLit?.(true)` on it was a silent
 *    no-op: the beat played with nothing to see.  Same for `postLantern`,
 *    which additionally glazes an unlit lamp in `M.glass` — a cool blue
 *    box at eye height in a town whose one cool accent belongs to
 *    chapelclose.  (Found by: one low frame up at the hall's eaves.)
 *
 * 5. `brazier`'s FLAME IS AN UPSIDE-DOWN CONE.  `cyl` takes
 *    (radiusTOP, radiusBOTTOM) and props.js writes `cyl(R * 0.62,
 *    R * 0.18, ...)`, so the fire is 0.47 m across at the sky and comes to
 *    a point at the coals.  Exactly the `hayRick` parasol in the kit's own
 *    errata, and the same tell: the prop reads as the wrong object (a
 *    traffic cone) and resizing it does not help.  (Found by: two frames.)
 *
 * 6. A COTTAGE IS ONE TAGGED UNIT AND ITS BBOX INCLUDES 0.85 m OF THATCH
 *    AND ITS WHOLE `tradeFront`, so ANY flat thing bolted to its frontage
 *    reads to the audit as interpenetrating it, wherever on the wall it
 *    goes.  Lifting the roof into an `airborne` sibling fixes half of it
 *    — and the lift must be written against the EAVE, not the wall top,
 *    because a thatch eave hangs BELOW its own wall head (measured 1.58
 *    against a wall top of 2.50), so a lift against `wallTopY` matches
 *    nothing and the artifact survives with the fix apparently applied.
 *    The chandler's chalked board went on the guild hall in the end:
 *    `hollowShell` is deliberately not tagged.  (Found by: check-spatial.)
 *
 * 7. `registerInterior` CULLS THE DRESSING FROM THE PLAYER'S POSITION, so
 *    a glow card parented to the room is invisible from the square, which
 *    is the only place it was ever meant to be seen from — the building's
 *    windows read as dark holes in a pale box from every frame in the
 *    district.  The cards are the building seen from the street, like the
 *    shell and the roof, and they are their own always-drawn group now.
 *    The same fact bites the CAPTURE: `__shot` moves the camera and not
 *    the player, so an interior frame needs
 *    `vignette.update(dt, { x, y, z })` near the door FIRST or it comes
 *    back as an empty room.  (Found by: two frames that disagreed.)
 *
 * 8. A HIP ROOF WRITTEN AS FOUR RAKED SLABS HAS HORNS.  The hip-end
 *    slabs, rotated about Z, run PAST the ridge line at their tops and
 *    the roof reads as a pagoda from every frame with the hall in it.  A
 *    hip is two trapezia and two triangles; `hipRoof` builds it.
 *
 * 9. A DARK DECAL ON GROUND THAT IS ALREADY IN SHADOW IS A DECAL NOBODY
 *    CAN SEE.  The key light stands 9 degrees over the horizon in the
 *    west, so the west rim's 2.02 m of revetment throws 12.7 m of shadow
 *    across a 22 m floor: the `pavingDark` wear lines were invisible over
 *    more than half the square.  Earth, gravel and straw read there.
 *
 * 10. `wellHead` SCALES ITS SHED ROOF OFF THE DRUM'S RADIUS, and r was
 *    raised to 0.9 to make the rim 0.9 m of cover — which gave a 2.6 m
 *    canopy over a 1.8 m drum, carried on two posts and overhanging both,
 *    reading as a slab hovering over the well.  Shrinking it helped and
 *    did not fix it, which is the tell that the shape and not the size is
 *    wrong.  The well has no roof now; it is read by its drum, its
 *    windlass and its bucket, and it stands in the middle of an arena
 *    where an ambiguous 2.6 m canopy over the one piece of central cover
 *    is worse than no canopy.
 *
 * 11. `M.leafOrchard` IS A LIGHT YELLOW-GREEN.  Two orchard trees on a
 *    rim, against a violet dusk sky from the far side of the square, were
 *    the loudest thing in the frame and the only saturated colour in the
 *    district that was not the accent.  Yew is the dark one.
 *
 * 12. A BUCKET AT REST DOWN THE SHAFT IS A PROMPT WITH NOTHING UNDER IT.
 *    It hangs level with the rim now and winds 0.80 m clear of it.
 * ==================================================================== */
