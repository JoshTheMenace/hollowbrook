import * as THREE from 'three';
import { defineDistrict } from '../core/district.js';
import { hollowShell } from '../builders.js';
import { registerInterior, makeDoorLeaf } from '../core/interior.js';
import * as room from '../interiors.js';
import {
  M, painted, PAL, ACCENT, JOINERY,
  place, rng, seatOnGround, parts, bx, cyl, tubeGeo,
  stairs, stairRail, leanTo, gableRoof,
  cottage, roundTower, windmill,
  treeStand,
  villageProps, interactive,
  signKit,
  curtainWall, stairTurret, barricade, wallTorch, lantern,
  siegeProps, placeCover,
} from '../kit/index.js';

/* ==================================================================== *
 * MILLREACH — the working west, under the west wall.
 *
 * THE LAND, MEASURED BEFORE ANYTHING WAS PLACED (`?only=millreach`,
 * `ctx.groundAt` on a 3 m grid over x -54..-18, z -12..54):
 *
 *   - the whole town side, x -48.8..-18 by z -12..48.8, is DEAD FLAT at
 *     0.000.  Nothing here is on a slope; the SKYLINE does all the work,
 *     and the skyline is the mill.
 *   - the wall-walk shelves stand at 5.000 exactly: the west run
 *     x -51.2..-48.8 over z -12..51.2, the south run z 48.8..51.2 over
 *     x -51.2..-18.  Both are TERRAIN.  I face them; I never lay them.
 *   - `mill-wall-stair` is terrain too — 24 tread platforms at
 *     x -48.10..-46.50, z 20.60..30.64, rising 0.2 -> 5.0 — and its head is
 *     the landing shelf x -48.8..-45.8, z 30..33.
 *   - outside the wall the berm reads 0.00 out to x -54 / z 51.2 and -0.05
 *     beyond: surrounds, not mine.
 *   - all four plan anchors verified on the bare terrain: (-36,20)=0.000,
 *     (-50,10)=5.000, (-47.3,31.5)=5.000, (-30,50)=5.000.
 *   - the only foreign colliders inside the envelope in stub mode are
 *     southgate's lodge (x -14.5..-7.5, z 21..27) and marketlow's guild
 *     hall (x -17.6..-10.8, z -3..3), both east of my line.
 *
 * THE SUN is bearing 268 / elevation 9 — DUE WEST, nine degrees up.  Only
 * west faces and the tops of things are lit.  So every frontage that has
 * to read here is turned WEST: the miller's cottage (yaw -PI/2), the
 * tannery (yaw -PI/2); the mill is round and therefore always has a lit
 * limb.  The sails' ochre canvas is the district's one accent and it sits
 * on the only surface in the town that is both high and turned into the
 * last of the light.
 *
 * SITE PLAN (world AABBs as registered, so a later addition can be checked
 * against them without rebuilding):
 *
 *   the mill (windmill r 3.2 h 9.6)   (-40.0, 19.0)  x -42.90..-37.10  z 16.10..21.90
 *   the stage (gallery deck, y ~4.1)  x -36.90..-33.00  z 14.80..18.40   platform, NO collider
 *   the stage stair (17 treads)       x -36.25..-34.95  z  7.66..14.84   platforms, NO collider
 *   miller's cottage (6.6 x 5.2, 2st) (-38.8, 41.0) yaw -PI/2  x -41.40..-36.20  z 37.70..44.30
 *   the granary (shell 9.6 x 5.6)     (-29.0, 42.0)  x -33.80..-24.20  z 39.20..44.80
 *   the granary staging (y 1.45)      x -34.50..-30.50  z 36.90..39.15   platform, NO collider
 *   the tannery (7.0 x 5.2)           (-28.5, -4.5) yaw -PI/2  x -31.10..-25.90  z -8.00..-1.00
 *   the bark store (leanTo 4.6 x 3.6) (-35.3, -4.0) open x+    x -37.10..-33.50  z -6.30..-1.70
 *   the SW corner tower (r 1.9 h 8.6) (-52.6, 52.6)
 *
 * FOUR CORRIDORS ARE NO-BUILD, and every one is inflated by the walker's
 * 0.34 m before anything is placed near it:
 *
 *   the wall lane      x -48.80..-44.50, z -8..47   the lane the wall-walk
 *                      looks down and the lane wave 5 runs.  4.3 m, and the
 *                      only things in it are cover and the barricade's gap.
 *   the mill lane      z  32.40..35.60, x -18..-31  in from sg-w-lane
 *   the market lane    z   4.50.. 7.50, x -18..-46  in from market-lane-w
 *   the north lane     x -37.60..-34.40, z -12..-8  out to cc-s-lane
 *
 * THE PLAN'S OWN MASSING PUTS THE GRANARY AND THE TANNERY 46 m APART.
 * The brief asks for "the narrow between the granary and the tannery
 * (2.4 m)" as a choke, and the massing it is written against has the
 * granary block at (-28, 42) and the tannery block at (-30, -4).  Those
 * cannot be adjacent, and the massing is what the five neighbouring agents
 * composed their edges against, so the massing wins.  There are TWO 2.4 m
 * chokes instead, both real and both measured:
 *
 *   the granary narrow  x -36.20..-33.80  (cottage gable to granary gable)
 *                       -> 1.72 m walkable, the way from the mill lane to
 *                          the back of the row and the SW tower foot
 *   the tannery narrow  x -33.50..-31.10  (bark store to tannery gable)
 *                       -> 1.72 m walkable, the way from the tannery yard
 *                          through to the market lane
 *
 * THE TAILPOLE IS 8.3 m LONG AND IT IS NOT DRAWN ON ANY PLAN.  `windmill`
 * rakes it from the cap down to y 0.55 at 2.6 r opposite the sails, so
 * `windDir` decides where an eight-metre beam lands.  At windDir -2.2 the
 * shaft points WSW — 26 degrees off the axis from the `along-the-wall`
 * camera, which is a three-quarter wheel rather than a disc or an edge —
 * and the tail's wheel foot lands at (-33.3, 23.9), open yard.  Turn the
 * sails and you sweep that beam through the mill lane.
 *
 * ACCENT: ACCENT.sailOchre, and it is spent on ONE thing — the sail cloth.
 * Every other painted surface here is JOINERY (oakStain, barnRust,
 * mossPaint), which is muted and costs nobody their colour.  Nothing here
 * wears ACCENT.companyRust and nothing wears ACCENT.wardGlow.
 *
 * TRAPS HIT IN THIS BUILD:
 *   1. `windmill`'s footprint collider SEALS ITS OWN GALLERY.  The
 *      footprint is a square of half-extent r + 0.14 = 3.34, the gallery
 *      ring reaches `rad + 1.05` = 3.90 from the axis, and the collider
 *      inflated by the walker's 0.34 reaches 3.68: 0.22 m of walkable ring,
 *      which is nothing, and the four diagonals are worse.  So the mill is
 *      placed `collide: false` and carries a collider sized to the shaft AT
 *      THE GALLERY COURSE (2.90 half-extent), and the walkable high ground
 *      is a rectangular loading stage bracketed off the east flank rather
 *      than the ring itself.  Nothing about a render says this: the gallery
 *      is drawn, walked to, and refuses to be stood on.
 *   2. A stair whose treads run UNDER a platform is a stair to nowhere.
 *      `groundAt` is a max over platforms, so a deck swallows every tread it
 *      covers and the top of the flight becomes an unclimbable step.  The
 *      flight's far edge and the deck's near edge overlap by 0.04 m and by
 *      nothing more — the same rule `stairs()` states for its own treads.
 *   3. `stairRail`'s `side` IS A LATERAL OFFSET IN METRES off the centreline
 *      its two joints describe — not a sign.  Folding the offset into the
 *      joints AND passing `side: s` as well put both handrails 1.6 m off the
 *      flight, in mid-air, and the audit's raked-run sweep read 14 of 15
 *      stations unsupported over a 4.11 m gap.  And the joints are the
 *      NOSING line: struck from the foot's ground level the rail runs one
 *      rise under every tread and reads as buried in the flight.
 *   4. A COLLIDER ROUND A PROP EATS 0.68 m ON EVERY SIDE, and an NPC post is
 *      the one place that is measured.  The flour cart's footprint is 4.3 m
 *      long with its shafts on it; parked in the yard its rotated AABB
 *      reached x -31.73 and the Millstone Warden's post at (-32.5, 22) was
 *      INSIDE it.  Two yard gabions were 0.42 m off him for the same reason.
 *      check-game measures that; no frame shows it.
 *   5. A PROP INSIDE A KEEP-OUT IS SEATED ON WHATEVER IS THERE.  The log
 *      pile went in at (-46.4, 30.4), which is inside the stair-head landing
 *      shelf, and `seatOnGround` put it on the WALL-WALK, five metres up —
 *      a stack of firewood on a fighting top, rendering perfectly.
 *   6. A STORE FACES THE WORK, NOT THE ALLEY.  The bark store was opened
 *      east onto the tannery narrow; its blank back then stood 2.9 m in
 *      front of the plan's own "tannery yard" waypoint and that frame came
 *      back as a dark boarded wall filling the whole picture.
 *   7. DECK BOARDS MUST OVERLAP, NEVER MEET.  Written `d / nb - 0.015` the
 *      joints are 15 mm holes and the spatial audit's seam grid samples on a
 *      0.5 m lattice: z = 17.75 landed exactly on one, cast straight through
 *      a deck four metres up and reported the terrain underneath it.
 *   8. A SOLID FLIGHT IS A WALL TO A HORIZONTAL RAY.  `stairs()` emits a
 *      block per tread from the ground up, so a 7 m flight is 4 m of solid
 *      across every sight line that crosses it: run E-W across the yard it
 *      cost the arena 30 of its 292 cells and took check-arena-visibility
 *      under 40 % on its own.  Turned to run N-S along the mill's flank it
 *      costs 18, and the same sweep went 39.5 % -> 45.7 %.  A stair's
 *      ORIENTATION is a sight-line decision before it is a plan one.
 *   9. AND A SOLID FLIGHT LOOKS LIKE ONE.  Four metres of pale sawtooth in
 *      the middle of a yard reads as a masonry ramp; it took a dark riser
 *      under every nosing, a closed string down each flank and vertical
 *      boarding under that to read as a mill's outside stair.  Opening the
 *      risers instead is not available — see trap 7, the seam grid falls
 *      straight through an open riser.
 * ==================================================================== */

const E = { x0: -54, z0: -12, x1: -18, z1: 54 };

/* the mill, and everything measured off it */
const MILL = { x: -40.0, z: 19.0, r: 3.2, h: 9.6, sailLen: 6.6, windDir: -2.2, speed: 0.17 };
/* the shaft's half-extent at the GALLERY course — what the collider is
 * sized to.  See trap 1. */
const MILL_HALF = 2.90;
/* the loading stage bracketed off the mill's east flank: the district's
 * high ground inside the yard, with the hoist working over it */
const STAGE = { x0: -36.90, x1: -33.00, z0: 14.80, z1: 18.40 };
/* the flight up to it, authored in world coords, climbing -x */
const FLIGHT = { x: -35.60, z: 7.66, w: 1.30, run: 0.42, steps: 17 };
const BRAKE = { x: -37.0, z: 22.0 };
/* the granary's staging — the hexer perch, 1.45 m over the yard */
const GSTAGE = { x0: -34.50, x1: -30.50, z0: 36.90, z1: 39.15, top: 1.45 };

export const millreach = defineDistrict({
  id: 'millreach',
  envelope: E,
  after: ['southgate', 'marketlow'],
  build(ctx, { plan }) {
    const R = rng('millreach');
    const ground = (x, z) => ctx.groundAt(x, z);

    /* helpers -------------------------------------------------------- */

    // a prop, seated on the ground by query, added under its own name
    const prop = (g, x, z, ry = 0, name = 'prop') => {
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      seatOnGround(g, ground);
      ctx.add(g, name);
      return g;
    };
    // a collider round a prop that deserves one
    const solid = (x, z, hx, hz) => ctx.collide(x - hx, z - hz, x + hx, z + hz);
    /* a kit prop standing in for cover.  `placeCover` throws on anything
     * tagged `cover` under 0.9 m, so the tag is added HERE with the measured
     * height rather than inside the kit, which is append-only. */
    const cover = (g, h, x, z, yaw, name) => {
      g.userData = { ...g.userData, cover: true, coverH: h };
      return placeCover(ctx, g, { x, z, yaw, name });
    };

    /* ================================================================
     * 1. THE WORKED GROUND
     *
     * The district is one tone of flat terrain over roughly 1 400 m2, and
     * the `along-the-wall` vista looks down on all of it from 6.6 m.  So
     * the working ground is PAINTED: 20-40 mm proud slabs, no platform, no
     * collider, pooled into a handful of meshes.  Everything here follows an
     * action — the cart track in from the lane, the ruts in it, the apron
     * the mill door has worn, flour walked out and never swept, the mud the
     * flock made at the pen mouth, the liquor round the tan pits.
     * ============================================================== */
    {
      const G = parts();
      const patch = (mat, x, z, w, d, ry = 0, y = 0.028) =>
        G.add(mat, bx(w, 0.06, d, x, y - 0.03, z, { ry }));

      // a worn way down a polyline, with its own edge deliberately ragged
      const way = (mat, pts, width, seed, y = 0.028) => {
        const rr = rng(seed);
        for (let i = 0; i < pts.length - 1; i += 1) {
          const [ax, az] = pts[i];
          const [bxx, bz] = pts[i + 1];
          const len = Math.hypot(bxx - ax, bz - az);
          const n = Math.max(2, Math.round(len / 1.15));
          const ry = Math.atan2(-(bz - az), bxx - ax);
          for (let k = 0; k < n; k += 1) {
            const t = (k + 0.5) / n;
            patch(mat, ax + (bxx - ax) * t + rr.range(-0.26, 0.26),
              az + (bz - az) * t + rr.range(-0.26, 0.26),
              len / n + rr.range(0.5, 1.3), width * rr.range(0.74, 1.2),
              ry + rr.range(-0.14, 0.14), y);
            /* THE EDGE IS THE TELL.  Slabs of one width down a line read as
             * a row of rectangles the moment the boundary is visible.  Two
             * more pieces per station that OVERLAP the run's own edge and
             * stick out past it leave the boundary ragged and the area one
             * area — a scatter BESIDE the run just makes separate cards. */
            for (const sd of [-1, 1]) {
              const off = width * rr.range(0.22, 0.42) * sd;
              patch(mat, ax + (bxx - ax) * t + rr.range(-0.3, 0.3) - Math.sin(-ry) * off,
                az + (bz - az) * t + rr.range(-0.3, 0.3) - Math.cos(-ry) * off,
                rr.range(0.7, 1.5), rr.range(0.5, 1.0), rr.range(0, Math.PI), y - 0.004);
            }
          }
        }
      };

      // two ruts inside a way: offset perpendicular, darker, thin
      const ruts = (pts, gauge, seed, y = 0.034) => {
        const rr = rng(seed);
        for (let i = 0; i < pts.length - 1; i += 1) {
          const [ax, az] = pts[i];
          const [bxx, bz] = pts[i + 1];
          const len = Math.hypot(bxx - ax, bz - az);
          const ry = Math.atan2(-(bz - az), bxx - ax);
          const nx = -(bz - az) / len;
          const nz = (bxx - ax) / len;
          const n = Math.max(2, Math.round(len / 2.2));
          for (const s of [-1, 1]) {
            for (let k = 0; k < n; k += 1) {
              const t = (k + 0.5) / n;
              const off = s * gauge / 2 + rr.range(-0.06, 0.06);
              patch(M.pavingDark, ax + (bxx - ax) * t + nx * off,
                az + (bz - az) * t + nz * off,
                len / n + 0.4, rr.range(0.2, 0.3), ry, y);
            }
          }
        }
      };

      /* A DRIFT IS AN AREA, NOT A SCATTER: `q = next()` rather than
       * `sqrt(next())` biases the sample toward the centre so the pieces
       * pile up and merge into one area with a ragged edge, and the piece
       * size is measured against the cluster's own radius — a 1 m card in a
       * 7 m drift is a card whatever you do to its colour. */
      const drift = (mat, x, z, rx, rz, n, seed, sMin = 0.35, sMax = 1.1, y = 0.03) => {
        const rr = rng(seed);
        for (let i = 0; i < n; i += 1) {
          const a = rr.range(0, Math.PI * 2);
          const q = rr.next();
          patch(mat, x + Math.cos(a) * rx * q, z + Math.sin(a) * rz * q,
            rr.range(sMin, sMax), rr.range(sMin, sMax) * 0.82, rr.range(0, Math.PI), y);
        }
      };

      /* THE CART TRACK: in at the mill lane, round the mill's stage. */
      const TRACK = [
        [-18.6, 34.0], [-24.0, 34.0], [-28.4, 33.2], [-31.6, 30.0],
        [-33.8, 25.4], [-34.6, 21.2], [-36.4, 18.6],
      ];
      way(M.earth, TRACK, 3.2, 'track');
      ruts(TRACK, 1.5, 'track-ruts');

      // the wall lane: the whole west side, walked rather than carted
      const WALLWAY = [[-46.4, -7.0], [-46.2, 6.0], [-46.6, 20.0], [-46.2, 34.0], [-46.4, 46.0]];
      way(M.gravel, WALLWAY, 2.2, 'wall-lane', 0.026);

      // the market lane in from the guild hall, and the north lane out
      way(M.earth, [[-18.6, 6.0], [-28.0, 6.0], [-36.0, 6.2], [-42.0, 6.0], [-45.8, 6.2]], 2.6, 'market-lane');
      way(M.gravel, [[-36.0, -11.6], [-36.2, -8.0], [-37.4, -5.4], [-39.6, -3.8]], 2.0, 'north-lane', 0.026);
      // both narrows, walked hard because they are the short way
      way(M.gravel, [[-32.3, -7.4], [-32.3, -0.4], [-32.6, 3.4]], 1.4, 'tan-narrow', 0.026);
      way(M.gravel, [[-35.0, 36.0], [-35.0, 41.0], [-35.0, 46.4]], 1.3, 'gran-narrow', 0.026);

      /* THE MILL'S APRON — the ground a working doorway wears out.  Gravel
       * where the carts stand under the stage, chaff and flour where the
       * sacks come down the hoist. */
      drift(M.gravel, -35.0, 18.6, 3.4, 3.0, 20, 'apron', 0.6, 2.0, 0.024);
      drift(M.straw, -35.2, 20.6, 2.2, 1.3, 14, 'chaff', 0.3, 0.9, 0.032);
      /* FLOUR, walked out and never swept.  Small enough to read as a
       * dusting: at 0.3 m a hard-edged pale rectangle on earth is a sheet of
       * paper, which is what the first cut of this kind of drift looks like,
       * so most of it is in the gravel's own tone and only a little is
       * genuinely white. */
      drift(M.gravel, -35.4, 19.4, 1.6, 1.1, 18, 'flour-base', 0.14, 0.4, 0.034);
      drift(M.paper, -35.2, 19.2, 1.2, 0.9, 11, 'flour-spill', 0.1, 0.26, 0.038);
      drift(M.paper, -34.8, 26.4, 0.9, 0.7, 7, 'flour-cart', 0.09, 0.22, 0.038);

      // the tailpole's wheel arc, r 8.32 round the mill through the open yard
      {
        const rr = rng('tail-arc');
        for (let i = 0; i <= 18; i += 1) {
          const a = 0.42 + (i / 18) * 1.1;   // ENE through NE, all open ground
          patch(M.earth, MILL.x + Math.sin(a) * 8.32, MILL.z + Math.cos(a) * 8.32,
            rr.range(0.8, 1.3), rr.range(0.5, 0.8), -a, 0.026);
        }
      }

      /* THE OPEN GROUND.  Everything above follows a route or a doorway,
       * which leaves the yard one flat tone over most of the frame from the
       * wall-walk.  These are not wear: they are the ground having more than
       * one value in it, in the two tones either side of the terrain's own —
       * `gravel` and `straw` are three steps up and read as PAVING wherever
       * there is no reason for them. */
      drift(M.pavingDark, -34.0, 27.0, 5.0, 5.6, 26, 'yard-tone-a', 2.4, 5.0, 0.018);
      drift(M.moss, -44.4, 26.0, 3.0, 6.0, 20, 'wall-damp', 1.8, 3.8, 0.019);
      drift(M.pavingDark, -41.0, 11.6, 4.6, 4.0, 20, 'pen-tone', 2.0, 4.2, 0.018);
      drift(M.pavingDark, -42.0, -4.0, 4.8, 4.4, 20, 'tan-tone', 2.0, 4.2, 0.018);
      drift(M.moss, -46.6, 42.0, 2.2, 5.0, 16, 'sw-damp', 1.4, 3.0, 0.019);
      drift(M.moss, -47.4, 8.0, 1.3, 7.0, 16, 'wall-foot-moss', 1.1, 2.4, 0.021);

      // the pens: straw and mud where the flock came through the gate
      drift(M.straw, -41.4, 11.0, 2.4, 2.2, 20, 'pen-straw', 0.3, 0.9, 0.03);
      drift(M.earth, -42.6, 13.8, 2.0, 1.2, 12, 'pen-mouth', 0.7, 1.7, 0.024);
      // the tannery: liquor round the pits, bark chips by the store
      drift(M.earth, -42.0, -5.0, 2.6, 2.4, 16, 'pit-mud', 0.6, 1.6, 0.024);
      drift(M.bark, -36.6, -3.4, 1.6, 1.2, 12, 'bark-chips', 0.2, 0.5, 0.032);
      // the granary's staging: chaff and a spilled measure
      drift(M.straw, -32.4, 36.2, 2.6, 1.2, 14, 'gran-chaff', 0.3, 0.9, 0.03);

      const g = new THREE.Group();
      G.flush(g, { cast: false });
      ctx.add(g, 'worked-ground');
    }

    /* ================================================================
     * 2. THE WALL — two runs, a corner tower and the stair turret.
     *
     * The shelf, the scarps and the flight are TERRAIN.  These dress them.
     * Both runs end 'none' at both ends: the west run runs into
     * chapelclose's at mr-walk-n and into the corner at the other end; the
     * south run runs into the corner and into southgate's at mr-walk-s.  A
     * 'pier' cap at a socket is a wall across the seam.
     * ============================================================== */
    /* THE WEST RUN GOES TO 51.2, NOT TO 48.8, and that is the corner.
     * Stopped at the inner plane it leaves a 2.4 m hole in the outer face
     * where the two runs meet, and — measured by check-city's terminus fan —
     * the view WEST along the south walk then leaves the town and hits
     * nothing: 4 of 5 rays, 36 m out, fog.  Carried to 51.2 the west
     * parapet returns across the end of the south walk and closes it. */
    curtainWall({
      from: -12, to: 51.2, side: 'w', ctx, plan, seed: 'mr-curtain-w',
      endCaps: ['none', 'none'], name: 'curtain-west',
    });
    curtainWall({
      from: -51.2, to: -18, side: 's', ctx, plan, seed: 'mr-curtain-s',
      endCaps: ['none', 'none'], name: 'curtain-south',
    });

    /* the SW corner tower.  A drum CENTRED on (-50, 50) is a collider
     * across the only place the walk turns; SIEGE.md's geometry pushes it
     * out along the diagonal to (-52.6, 52.6), where it touches the outer
     * corner, reads as a tower ON the corner from every angle, and leaves
     * 1.40 m of walk behind it. */
    {
      const tower = roundTower({
        seed: 'mr-sw-tower', r: 1.9, h: 8.6, taper: 0.1, crook: 0.8, seg: 12,
        wall: 'granite', cap: 'cone', capH: 2.4, bands: 2,
        machicolation: true, corbel: true, door: null, finial: true,
        windows: [{ y: 3.2, a: 0.79, w: 0.3, h: 0.9 }, { y: 6.0, a: 2.36, w: 0.3, h: 0.9 }],
      });
      place(ctx, tower, { x: -52.6, z: 52.6, yaw: 0, name: 'sw-tower' });
    }

    // the stair head at z 30..33: the way from my ground up to my walk
    stairTurret({
      landing: { x0: -48.8, z0: 30, x1: -45.8, z1: 33, y: 5 },
      flight: (plan.terrain.crossings ?? []).find((c) => c.id === 'mill-wall-stair') ?? null,
      ctx, plan, seed: 'mr-turret', name: 'stair-turret',
    });

    /* the wall you HOLD, stocked this afternoon: the gear stands at the
     * stair-head where it was carried up to, on the landing's own ground.
     * `spearRack`, `arrowBundle` and `oilPots` carry no collider — slim
     * frangible furniture on a 2.4 m walk is a wall. */
    /* and the lane's own stores, at the foot of the wall where they were
     * carried down: 20 m of the wall lane's east flank was bare ground in
     * the frame from its north end, which is the lane wave 5 runs. */
    prop(villageProps.logPile({ seed: 'mr-lane-logs', w: 2.2, h: 0.95, d: 0.6, roof: false }), -47.3, 4.0, Math.PI / 2, 'lane-logs');
    solid(-47.3, 4.0, 0.42, 1.25);
    prop(villageProps.crateStack({ seed: 'mr-lane-crates', n: 3, spill: false, goods: JOINERY.oakStain }), -47.2, 11.6, -1.3, 'lane-crates');
    solid(-47.2, 11.6, 0.5, 0.5);
    prop(villageProps.barrel({ seed: 'mr-lane-butt', h: 0.9, r: 0.34 }), -47.3, 14.0, 0, 'lane-butt');

    prop(siegeProps.spearRack({ seed: 'mr-spears', n: 7 }), -47.2, 30.7, 0, 'wall-spears');
    prop(siegeProps.oilPots({ seed: 'mr-oilpots', n: 4 }), -46.4, 32.3, 0, 'wall-oilpots');
    // and one bundle still at the foot of the flight, not carried up yet
    prop(siegeProps.arrowBundle({ seed: 'mr-arrows' }), -46.2, 18.6, 0.4, 'lane-arrows');

    /* the wall's own practicals, on the INNER face over the lane, where a
     * bowman on the walk needs them and where they light the lane the enemy
     * runs.  `wallTorch`'s origin is ON the wall face projecting +Z, so its
     * `ry` is the face's outward normal — here +x, into the town. */
    for (const [tz, seed] of [[12.0, 'wall-torch-a'], [40.0, 'wall-torch-b']]) {
      const t = wallTorch({ seed, lit: true, reach: 0.42, groundDrop: -3.1 });
      t.position.set(-48.78, ground(-48.4, tz) + 3.1, tz);
      t.rotation.y = Math.PI / 2;
      ctx.add(t, seed);
    }

    /* ================================================================
     * 3. THE MILL — the landmark, and the one moving thing in the town.
     *
     * Placed `collide: false`: see trap 1 in the header.  No `ctx` either —
     * the brake owns this mill's updater (section 5).
     * ============================================================== */
    const mill = windmill({
      seed: 'hollowbrook-mill',
      r: MILL.r, h: MILL.h, taper: 0.26, seg: 14, crook: 0.26,
      wall: 'granite', capH: 2.2, sailLen: MILL.sailLen, sails: 4,
      speed: MILL.speed, gallery: true, galleryT: 0.42, tailpole: true,
      windDir: MILL.windDir,
      cloth: ACCENT.sailOchre,          // THE DISTRICT'S ONE ACCENT
      door: JOINERY.oakStain, litWindows: 1,
    });
    place(ctx, mill, { x: MILL.x, z: MILL.z, yaw: 0, collide: false, name: 'mill' });
    const millBase = ground(MILL.x, MILL.z);
    ctx.collide(MILL.x - MILL_HALF, MILL.z - MILL_HALF, MILL.x + MILL_HALF, MILL.z + MILL_HALF);
    const GY = millBase + (mill.userData.galleryY ?? MILL.h * 0.42);

    /* ---- the loading stage, and the flight up to it -------------------
     * The kit's gallery is a 1.05 m ring with its own tower filling the
     * middle of it; what the brief asks for — high ground you can hold,
     * reachable in under twelve metres from the arena centre, with a way
     * down that is not the way up (the deck's west and north sides are
     * unfenced, exactly like the wall-walk's inner edge) — is a rectangle.
     * This is a bracketed timber stage at the gallery course, which is what
     * a working tower mill has anyway: the sacks come down the hoist onto
     * it and go into the cart standing underneath. */
    {
      const P = parts();
      const y0 = ground((STAGE.x0 + STAGE.x1) / 2, (STAGE.z0 + STAGE.z1) / 2);
      const w = STAGE.x1 - STAGE.x0;
      const d = STAGE.z1 - STAGE.z0;
      const cx = (STAGE.x0 + STAGE.x1) / 2;
      const cz = (STAGE.z0 + STAGE.z1) / 2;

      /* six posts to the ground and a knee brace off each — a stage four
       * metres up is CARRIED, and the carrying is the silhouette.  Every
       * member runs between two real joints; none is a length at an angle. */
      for (const px of [STAGE.x0 + 0.35, cx, STAGE.x1 - 0.35]) {
        for (const pz of [STAGE.z0 + 0.35, STAGE.z1 - 0.35]) {
          P.add(M.oakDark, bx(0.2, GY - y0 - 0.18, 0.2, px, y0 + (GY - y0 - 0.18) / 2, pz, { seg: 3 }));
          P.add(M.oak, tubeGeo([px, GY - 1.15, pz], [px + (px < cx ? 0.72 : -0.72), GY - 0.3, pz], 0.075, 5));
        }
      }
      // bearers, joists and a boarded deck
      for (const pz of [STAGE.z0 + 0.35, cz, STAGE.z1 - 0.35]) {
        P.add(M.oakDark, bx(w, 0.17, 0.19, cx, GY - 0.26, pz, { seg: 3 }));
      }
      /* THE BOARDS OVERLAP, THEY DO NOT MEET.  Written `d / nb - 0.015` the
       * joints are 15 mm holes, and the spatial audit's seam grid samples on
       * a 0.5 m lattice: z = 17.75 landed exactly on one, cast straight
       * through a deck four metres up and reported the terrain underneath.
       * Boards 30 mm wider than their pitch, alternating 5 mm in height so
       * no two top faces are coplanar over the lap. */
      const nb = 11;
      for (let i = 0; i < nb; i += 1) {
        P.add(i % 3 === 1 ? M.oakSilver : M.oak,
          bx(w, 0.09, d / nb + 0.03, cx, GY - 0.045 - (i % 2) * 0.005, STAGE.z0 + (i + 0.5) * (d / nb)));
      }
      /* the rail: the north edge, both returns, and the south edge BROKEN
       * WHERE THE FLIGHT ARRIVES.  Run straight across, the deck's own
       * balustrade is a fence at the top of its own stair — and none of it
       * carries a collider, because a 0.09 m rail inflated by the walker's
       * radius takes 0.77 m out of a 3.9 m deck and the deck's open drop IS
       * the way down that is not the way up. */
      const railPost = (x, z) => P.add(M.oakDark, bx(0.09, 1.0, 0.09, x, GY + 0.5, z));
      const railX = (x0, x1, z) => {                       // a run along x
        const n = Math.max(2, Math.round((x1 - x0) / 1.1));
        for (let i = 0; i <= n; i += 1) railPost(x0 + (i / n) * (x1 - x0), z);
        for (const hy of [0.5, 0.95]) P.add(M.oakSilver, bx(x1 - x0, 0.06, 0.055, (x0 + x1) / 2, GY + hy, z, { seg: 4 }));
      };
      const railZ = (z0, z1, x) => {                       // a run along z
        const n = Math.max(2, Math.round((z1 - z0) / 1.1));
        for (let i = 0; i <= n; i += 1) railPost(x, z0 + (i / n) * (z1 - z0));
        for (const hy of [0.5, 0.95]) P.add(M.oakSilver, bx(0.055, 0.06, z1 - z0, x, GY + hy, (z0 + z1) / 2, { seg: 4 }));
      };
      railX(STAGE.x0 + 0.06, STAGE.x1 - 0.06, STAGE.z1 - 0.06);
      railZ(STAGE.z0 + 0.06, STAGE.z1 - 0.06, STAGE.x0 + 0.06);
      railZ(STAGE.z0 + 0.06, STAGE.z1 - 0.06, STAGE.x1 - 0.06);
      railX(STAGE.x0 + 0.06, FLIGHT.x - FLIGHT.w / 2 - 0.1, STAGE.z0 + 0.06);
      railX(FLIGHT.x + FLIGHT.w / 2 + 0.1, STAGE.x1 - 0.06, STAGE.z0 + 0.06);

      const g = new THREE.Group();
      P.flush(g);
      ctx.add(g, 'mill-stage');
      /* the deck itself: the ONLY registration.  14.0 m2, well under the
       * 30 m2 at which composeCity says you are laying ground. */
      ctx.platform(STAGE.x0, STAGE.z0, STAGE.x1, STAGE.z1, GY);
    }

    /* the flight.  Its far edge and the deck's near edge overlap by 0.04 m
     * and by nothing more — see trap 2. */
    {
      const y0 = ground(FLIGHT.x, FLIGHT.z);
      const rise = (GY - y0) / FLIGHT.steps;
      const flight = stairs({
        w: FLIGHT.w, rise, run: FLIGHT.run, steps: FLIGHT.steps, dir: 'z+',
        at: [FLIGHT.x, y0, FLIGHT.z], mat: M.oak, ctx,
      });
      ctx.add(flight, 'stage-stair');
      /* NOSINGS AND RISERS, because `stairs()` emits a solid block per tread
       * and four metres of that in one pale timber is a masonry ramp, not a
       * mill's outside stair: read off three frames — from the yard, from
       * the wall lane and from under the sails — it was the worst thing in
       * the district.  A dark riser board under every nosing puts seventeen
       * horizontal lines on it, and the mass reads as a flight. */
      {
        const S = parts();
        for (let i = 0; i < FLIGHT.steps; i += 1) {
          const top = y0 + (i + 1) * rise;
          const zf = FLIGHT.z + i * FLIGHT.run;
          /* and they run BETWEEN the two handrails, not across the full
           * width: a nosing wider than the flight overhangs the rails'
           * stringers, and the audit's run sweep then reads both rails as
           * buried 0.55 m under "their surface" — which is this board. */
          const nw = FLIGHT.w - 0.3;
          S.add(M.oakDark, bx(nw, rise * 0.86, 0.05, FLIGHT.x, top - rise * 0.55, zf - 0.02));
          S.add(M.oakDark, bx(nw, 0.055, 0.12, FLIGHT.x, top - 0.03, zf + 0.02));
        }
        /* THE CLOSED STRINGS, and they are what turns the flank from a
         * pale sawtooth slab into a stair.  A box along Z rotated by +rx
         * sends its +z end DOWN, and this flight climbs +z, so the rake is
         * NEGATIVE — derived from the two joints, not picked. */
        const rise0 = y0 + rise;
        const zTop = FLIGHT.z + FLIGHT.steps * FLIGHT.run;
        const len = Math.hypot(zTop - FLIGHT.z, GY - rise0);
        const rake = -Math.atan2(GY - rise0, zTop - FLIGHT.z);
        for (const sd of [-1, 1]) {
          S.add(M.oakDark, bx(0.09, 0.46, len, FLIGHT.x + sd * (FLIGHT.w / 2 + 0.045),
            (rise0 + GY) / 2 - 0.2, (FLIGHT.z + zTop) / 2, { rx: rake, seg: 10 }));
        }
        /* and the flank is BOARDED IN under the string.  `stairs()` emits a
         * solid block per tread, so the side of any flight built with it is
         * one pale triangle four metres tall; the boards explain that mass
         * as a boarded-in stair with a store under it, which is what a mill
         * does with the space anyway.  (Opening the flight instead is not
         * available: the audit's seam grid casts down on a 0.5 m lattice and
         * an open riser is a hole it falls straight through.) */
        const yLine = (z) => rise0 + (GY - rise0) * (z - FLIGHT.z) / (zTop - FLIGHT.z);
        for (const sd of [-1, 1]) {
          const bxx = FLIGHT.x + sd * (FLIGHT.w / 2 + 0.015);
          for (let z = FLIGHT.z + 0.24; z < zTop - 0.2; z += 0.38) {
            const hgt = yLine(z) - 0.26 - y0;
            if (hgt < 0.2) continue;
            S.add(z % 0.76 < 0.38 ? M.oak : M.oakSilver,
              bx(0.05, hgt, 0.32, bxx, y0 + hgt / 2, z, { seg: 2 }));
          }
        }
        const g = new THREE.Group();
        S.flush(g, { receive: false });
        ctx.add(g, 'stage-stair-treads');
      }
      /* `side` IS THE LATERAL OFFSET, IN METRES, OFF THE CENTRELINE THE
       * `from`/`to` JOINTS DESCRIBE.  Written with the offset folded into
       * the joints AND `side: s` as well, both rails stood 1.6 m off the
       * flight, in mid-air, and the audit's raked-run sweep found 14 of 15
       * stations unsupported over a 4.11 m gap. */
      for (const s of [-1, 1]) {
        ctx.add(stairRail({
          // and the joints are the NOSING line, not the ground line: a rail
          // struck from the foot's ground level runs one rise under every
          // tread and the audit reads its stringer as buried in the flight.
          from: [FLIGHT.x, y0 + rise, FLIGHT.z],
          // and it STOPS ONE TREAD SHORT of the deck: carried to the head it
          // ends under the deck's own boards and reads as buried.
          to: [FLIGHT.x, GY - rise, FLIGHT.z + (FLIGHT.steps - 1) * FLIGHT.run],
          h: 0.98, sink: 0.12, mat: M.oakDark, side: s * (FLIGHT.w / 2 - 0.05),
        }), `stage-stair-rail-${s > 0 ? 'e' : 'w'}`);
      }
    }

    /* the sack hoist: a beam out of the cap over the stage, a wheel on the
     * end and a rope down it.  All three are silhouette — the beam breaks
     * the tower's outline, the wheel is a circle against the sky and the
     * rope says which way the load moves.  The beam's root is INSIDE the
     * shaft rather than butted to a curved face it can never meet. */
    {
      const P = parts();
      const y = millBase + MILL.h + 0.6;
      const hz = 17.0;                       // over the middle of the stage
      const root = [MILL.x + 1.0, y - 0.55, hz];
      const tip = [MILL.x + 4.9, y, hz];
      P.add(M.oakDark, tubeGeo(root, tip, 0.11, 6));
      P.add(M.oak, tubeGeo([MILL.x + 0.8, y - 2.1, hz], [MILL.x + 3.8, y - 0.19, hz], 0.07, 5));
      P.add(M.iron, cyl(0.34, 0.34, 0.09, tip[0], tip[1], tip[2], { seg: 12, rz: Math.PI / 2 }));
      P.add(M.ironDark, cyl(0.3, 0.3, 0.13, tip[0], tip[1], tip[2], { seg: 12, rz: Math.PI / 2 }));
      P.add(M.rope, tubeGeo([tip[0], tip[1] - 0.34, tip[2]], [tip[0] + 0.06, GY + 0.9, tip[2] + 0.05], 0.022, 5));
      P.add(M.iron, cyl(0.05, 0.05, 0.3, tip[0] + 0.06, GY + 0.72, tip[2] + 0.05, { seg: 6 }));
      const g = new THREE.Group();
      P.flush(g, { receive: false });
      g.userData = { airborne: true };
      ctx.add(g, 'sack-hoist');
    }

    /* ================================================================
     * 4. THE ROW — the miller's cottage, the granary, the tannery.
     * Every frontage turned WEST, because at bearing 268 / 9 degrees a
     * south face gets nothing at all.
     * ============================================================== */
    const millerHouse = cottage({
      seed: 'mr-millers-cottage', w: 6.6, d: 5.2, storeys: 2, groundH: 2.35, upperH: 2.1,
      wall: 'limewash', roof: 'thatch', crook: 1.0, jetty: 0.24,
      door: JOINERY.oakStain, shutter: JOINERY.mossPaint, shutters: 'mixed',
      chimney: true, litWindows: 2, windowBoxes: true,
    });
    place(ctx, millerHouse, { x: -38.8, z: 41.0, yaw: -Math.PI / 2, name: 'millers-cottage' });

    const tannery = cottage({
      seed: 'mr-tannery', w: 7.0, d: 5.2, storeys: 1.5, groundH: 2.55,
      wall: 'oak', roof: 'shingle', crook: 0.6, ridgeAxis: 'x',
      door: JOINERY.barnRust, shutter: JOINERY.oakStain, shutters: 'mixed',
      chimney: true, litWindows: 1, frame: false,
    });
    place(ctx, tannery, { x: -28.5, z: -4.5, yaw: -Math.PI / 2, name: 'tannery' });

    // the bark and hide store, open across the narrow to the tannery
    {
      const shed = leanTo({
        // OPEN WEST, ONTO THE YARD.  Opened east onto the narrow instead,
        // its blank back stood 2.9 m in front of the plan's own "tannery
        // yard" waypoint and that frame came back as a dark boarded wall
        // filling the whole picture: a store faces the work, not the alley.
        w: 4.6, d: 3.6, h: 2.5, pitch: 0.24, open: 'x-',
        at: [-35.3, ground(-35.3, -4.0), -4.0],
        mat: M.oakSilver, roofMat: M.shingleMoss, ctx,
      });
      const P = parts();
      // bark stacked in courses, and hides over their poles
      for (let i = 0; i < 5; i += 1) {
        P.add(i % 2 ? M.bark : M.barkDark, bx(0.42, 0.2, 2.6, -1.35, 0.11 + i * 0.21, -0.2 + i * 0.05, { rz: 0.02 }));
      }
      for (const pz of [-1.0, 0.4]) {
        P.add(M.oakDark, cyl(0.05, 0.05, 3.2, -0.4, 1.9, pz, { seg: 6, rz: Math.PI / 2 }));
        for (let k = 0; k < 3; k += 1) {
          P.add(M.hessian, bx(0.02, 1.0, 0.62, -1.3 + k * 0.9, 1.36, pz, { rz: 0.02 }));
        }
      }
      P.flush(shed, { receive: false });
      /* the north lane's view south lands on this shed: check-city's terminus
       * pass asks that what closes a view be a composed subject rather than
       * an untagged mesh, and `leanTo` (unlike every prop generator) does not
       * name itself. */
      shed.userData = { ...shed.userData, kind: 'bark-store' };
      ctx.add(shed, 'bark-store');
    }

    /* ---- the granary: the district's ENTERABLE ------------------------
     * The plan declares no enterable for millreach, so this one is not
     * gated by check-city's interior pass; it is here because a siege
     * district owes the arena a door to run to, and its door faces the
     * arena so a fleeing run is visible.  The doorway is 1.6 m clear
     * (DOOR_MIN_CLEAR_M is 1.4, the hard floor 1.1) and `hollowShell`
     * registers ONE COLLIDER PER WALL SEGMENT with the gap at the door —
     * never a single footprint box, which is the trap that renders
     * perfectly and leaves the room unreachable to every gate here.
     */
    const granary = hollowShell({
      w: 9.6, d: 5.6, h: 4.3, at: [-29.0, 42.0], groundY: ground(-29.0, 42.0),
      wallT: 0.3, floorRise: 0.12, ceilH: 3.1,
      door: { face: 'z-', offset: 3.0, width: 1.6 },
      windows: [
        { face: 'z-', offset: -3.4, width: 0.9, height: 0.9 },
        { face: 'x-', offset: 0.6, width: 0.8, height: 0.9 },
      ],
      mats: { wall: M.oakSilver, inner: M.daub, floor: M.oak, ceiling: M.oakDark },
      ctx, name: 'granary',
    });
    ctx.add(granary.group, 'granary');
    {
      const roof = gableRoof({
        w: 9.9, d: 5.9, pitch: 0.6, overhang: 0.42, thickness: 0.14, ridgeAxis: 'x',
        mat: M.shingle, ridgeMat: M.shingleDark, trimMat: M.oakDark,
      });
      roof.position.set(-29.0, granary.wallTopY, 42.0);
      ctx.add(roof, 'granary-roof');
    }
    {
      const leaf = makeDoorLeaf({
        doorway: granary.doorway, hinge: 'left', mat: painted(JOINERY.barnRust),
        ironMat: M.ironDark, ctx, open: false, auto: true, autoRadius: 2.8,
        label: 'E · the granary door', name: 'granary-door', interact: false,
      });
      ctx.add(leaf, 'granary-door');
    }

    /* the granary's staging: a timber platform at 1.45 m along the sunlit
     * west end of its frontage.  This is the hexer perch the brief asks
     * for, and the shelter's own threshold is clear of it by 1.7 m. */
    {
      const P = parts();
      const y0 = ground((GSTAGE.x0 + GSTAGE.x1) / 2, (GSTAGE.z0 + GSTAGE.z1) / 2);
      const top = y0 + GSTAGE.top;
      const w = GSTAGE.x1 - GSTAGE.x0;
      const d = GSTAGE.z1 - GSTAGE.z0;
      const cx = (GSTAGE.x0 + GSTAGE.x1) / 2;
      for (const px of [GSTAGE.x0 + 0.3, cx, GSTAGE.x1 - 0.3]) {
        for (const pz of [GSTAGE.z0 + 0.3, GSTAGE.z1 - 0.3]) {
          P.add(M.rubble, bx(0.36, GSTAGE.top - 0.2, 0.36, px, y0 + (GSTAGE.top - 0.2) / 2, pz));
        }
      }
      P.add(M.oakDark, bx(w, 0.16, 0.18, cx, top - 0.24, GSTAGE.z0 + 0.1, { seg: 3 }));
      P.add(M.oakDark, bx(w, 0.16, 0.18, cx, top - 0.24, GSTAGE.z1 - 0.1, { seg: 3 }));
      const nb = 8;   // overlapping, for the reason the mill stage's do
      for (let i = 0; i < nb; i += 1) {
        P.add(i % 3 === 2 ? M.oakSilver : M.oak,
          bx(w, 0.08, d / nb + 0.03, cx, top - 0.04 - (i % 2) * 0.005, GSTAGE.z0 + (i + 0.5) * (d / nb)));
      }
      const g = new THREE.Group();
      P.flush(g);
      ctx.add(g, 'granary-staging');
      ctx.platform(GSTAGE.x0, GSTAGE.z0, GSTAGE.x1, GSTAGE.z1, top);

      ctx.add(stairs({
        w: 1.3, rise: GSTAGE.top / 5, run: 0.42, steps: 5, dir: 'x-',
        at: [-28.4, y0, 38.0], mat: M.oakSilver, ctx,
      }), 'granary-steps');
    }

    /* ---- the granary's room ------------------------------------------
     * Flour being sacked and STOPPED: the barrow left standing, the scoop
     * upright in an open sack, the tally chalked to halfway.  Nobody in it,
     * and nobody painted on anything.
     */
    {
      const RM = granary.room;
      const fy = granary.floorTopY;
      const rg = new THREE.Group();
      // wall props: `ry` is the wall's INWARD normal, atan2(nx, nz)
      rg.add(room.shelf({ seed: 'gran-shelf', w: 1.5, h: 1.9, d: 0.4, boards: 4, at: [-31.0, fy, RM.z1], ry: Math.atan2(0, -1) }));
      rg.add(room.counter({ seed: 'gran-counter', w: 2.0, h: 0.94, d: 0.6, goods: true, at: [-28.4, fy, RM.z1], ry: Math.atan2(0, -1) }));
      rg.add(room.benchSeat({ seed: 'gran-bench', w: 1.5, at: [-31.0, fy, RM.z0], ry: 0 }));
      rg.add(room.crateStack({ seed: 'gran-crates', n: 4, size: 0.5, at: [-32.5, fy, 43.4], ry: 0.4 }));
      rg.add(room.barrel({ seed: 'gran-barrel-a', h: 0.86, r: 0.3, at: [-26.6, fy, 43.6] }));
      rg.add(room.barrel({ seed: 'gran-barrel-b', h: 0.76, r: 0.27, at: [-25.8, fy, 43.1], ry: 0.6 }));
      rg.add(room.table({ seed: 'gran-table', w: 1.1, d: 0.7, at: [-25.6, fy, 41.4], ry: 1.3 }));
      /* THE FLOUR, SACKED AND STOPPED.  Written as a loose heap of cones at
       * random angles the first cut read as a pile of PAILS — a sack only
       * reads as a sack when it is stacked the way sacks are stacked, in
       * courses against a wall, with the two that went over at the foot of
       * them.  Squat (0.42 r at the neck against 0.6 at the foot), leaning a
       * little, three courses high, and one open with the scoop in it. */
      {
        const P = parts();
        const rr = rng('gran-sacks');
        const sx0 = RM.x0 + 0.46;
        for (let col = 0; col < 2; col += 1) {
          for (let row = 0; row < 4; row += 1) {
            for (let t = 0; t < (row === 3 ? 2 : 3); t += 1) {
              const hh = rr.range(0.34, 0.42);
              const px = sx0 + col * 0.52 + rr.range(-0.04, 0.04);
              const py = fy + 0.02 + t * 0.4;
              const pz = 40.3 + row * 0.52 + rr.range(-0.04, 0.04);
              const lean = { rz: rr.range(-0.1, 0.1), rx: rr.range(-0.08, 0.08), ry: rr.range(0, 6.28) };
              /* TWO CONES, NOT ONE.  A single truncated cone has a flat
               * circular top and a hard rim, and eight of them read as a
               * row of LAMPSHADES — which is what the first cut of this
               * looked like from the doorway.  A sack is gathered at the
               * neck: a body that barely tapers, then a short neck that
               * closes to a third of the radius. */
              P.add(M.hessian, cyl(hh * 0.5, hh * 0.62, hh * 0.72, px, py + hh * 0.36, pz, { seg: 7, ...lean }));
              P.add(M.hessian, cyl(hh * 0.18, hh * 0.5, hh * 0.3, px, py + hh * 0.86, pz, { seg: 7, ...lean }));
            }
          }
        }
        // two gone over at the foot of the stack, and one still open
        P.add(M.hessian, cyl(0.18, 0.23, 0.34, -31.9, fy + 0.2, 40.5, { seg: 7, rz: 1.35, ry: 0.4 }));
        P.add(M.hessian, cyl(0.07, 0.18, 0.16, -31.9, fy + 0.2, 40.5, { seg: 7, rz: 1.35, ry: 0.4 }));
        P.add(M.hessian, cyl(0.17, 0.22, 0.32, -31.7, fy + 0.19, 41.3, { seg: 7, rz: -1.4, ry: 1.1 }));
        P.add(M.hessian, cyl(0.07, 0.17, 0.15, -31.7, fy + 0.19, 41.3, { seg: 7, rz: -1.4, ry: 1.1 }));
        // and the scoop left standing in the one that is open
        P.add(M.oakSilver, cyl(0.028, 0.032, 0.86, -31.55, fy + 0.84, 42.1, { seg: 6, rx: -0.28, rz: 0.2 }));
        P.add(M.iron, cyl(0.13, 0.16, 0.22, -31.36, fy + 1.24, 42.0, { seg: 8, rx: -0.28, rz: 0.2, open: true }));
        const sg = new THREE.Group();
        P.flush(sg, { cast: false });
        sg.userData = { prop: true, kind: 'flour-sacks' };
        rg.add(sg);
      }
      rg.add(room.hangingLamp({ seed: 'gran-lamp', from: granary.ceilUnderY, drop: 0.62, lit: true, at: [-28.6, fy, 41.9] }));
      ctx.add(rg, 'granary-interior');
      registerInterior(ctx, rg, { door: granary.doorway, name: 'the granary' });
    }

    /* ================================================================
     * 5. THE BRAKE — the district's interaction.
     *
     * A brake wheel is a rope down the tower to a lever on a quadrant, and
     * the rope is what says the stick in the yard is connected to the thing
     * nine metres over your head.
     * ============================================================== */
    const leverPivot = new THREE.Group();
    {
      const y0 = ground(BRAKE.x, BRAKE.z);
      const P = parts();
      P.add(M.rubble, bx(0.72, 0.24, 0.62, BRAKE.x, y0 + 0.12, BRAKE.z));
      P.add(M.oakDark, bx(0.19, 1.6, 0.19, BRAKE.x, y0 + 0.9, BRAKE.z));
      P.add(M.oak, bx(0.14, 1.3, 0.14, BRAKE.x - 0.38, y0 + 0.75, BRAKE.z + 0.1, { rz: 0.16 }));
      // the quadrant the pawl drops into
      for (let i = 0; i < 6; i += 1) {
        const a = -0.35 + i * 0.16;
        P.add(M.ironDark, bx(0.07, 0.16, 0.06,
          BRAKE.x + 0.16 + Math.sin(a) * 0.42, y0 + 1.92 - Math.cos(a) * 0.42, BRAKE.z + 0.02));
      }
      P.add(M.ironDark, cyl(0.09, 0.09, 0.16, BRAKE.x, y0 + 1.5, BRAKE.z, { seg: 8, rx: Math.PI / 2 }));
      const g = new THREE.Group();
      P.flush(g);
      ctx.add(g, 'brake-post');
      solid(BRAKE.x, BRAKE.z, 0.4, 0.34);

      // the lever, on a pivot the interaction swings
      leverPivot.position.set(BRAKE.x, y0 + 1.5, BRAKE.z);
      const L = parts();
      L.add(M.oak, bx(0.13, 0.13, 2.1, 0, 0, 0.95));       // authored along +z
      L.add(M.ironDark, bx(0.17, 0.17, 0.2, 0, 0, 0.1));
      L.add(M.oakSilver, cyl(0.075, 0.06, 0.34, 0, 0, 1.95, { seg: 8, rx: Math.PI / 2 }));
      L.add(M.iron, bx(0.06, 0.3, 0.06, 0, -0.14, 0.5));   // the pawl
      L.flush(leverPivot, { receive: false });
      ctx.add(leverPivot, 'brake-lever');

      // the rope up the tower to the cap
      const RP = parts();
      const top = [MILL.x + 2.3, millBase + 5.2, MILL.z + 1.5];
      const foot = [BRAKE.x + 0.05, y0 + 1.62, BRAKE.z + 0.32];
      const mid = [(top[0] + foot[0]) / 2, (top[1] + foot[1]) / 2 - 0.34, (top[2] + foot[2]) / 2];
      RP.add(M.rope, tubeGeo(foot, mid, 0.024, 5), tubeGeo(mid, top, 0.024, 5));
      const rg = new THREE.Group();
      RP.flush(rg, { cast: false, receive: false });
      rg.userData = { airborne: true };
      ctx.add(rg, 'brake-rope');
    }

    /* the mill's updater lives here, not in the kit, because the brake owns
     * it.  Easing rather than snapping — a five-tonne sail cross does not
     * stop dead — with a trailing snap that guarantees the end state. */
    {
      const sails = mill.userData.sailGroup;
      const FULL = mill.userData.speed;
      let rate = FULL;
      let target = FULL;
      let braked = false;
      let leverT = 0;
      ctx.update((dt) => {
        const k = 1 - Math.exp(-dt * 0.7);
        rate += (target - rate) * k;
        if (Math.abs(rate - target) < 0.0016) rate = target;
        sails.rotation.z += rate * dt;
        const want = braked ? 1 : 0;
        leverT += (want - leverT) * (1 - Math.exp(-dt * 4.5));
        leverPivot.rotation.x = leverT * 0.52;   // +rx sends the +z end DOWN
      });

      const labels = [
        'E · throw the mill brake — bring the sails to rest',
        'E · let off the brake — let the sails run',
      ];
      const brake = interactive(ctx, {
        name: 'the mill brake',
        label: labels[0],
        at: [BRAKE.x, ground(BRAKE.x, BRAKE.z) + 1.1, BRAKE.z + 0.5],
        size: [1.5, 2.2, 1.9],
        action: () => {
          braked = !braked;
          target = braked ? 0 : FULL;
          brake.label = labels[braked ? 1 : 0];
        },
      });
      ctx.reset(() => {
        braked = false;
        target = FULL;
        rate = FULL;
        leverT = 0;
        leverPivot.rotation.x = 0;
        brake.label = labels[0];
      });
    }

    /* ================================================================
     * 6. THE SHEEP PENS — the flock driven in ten minutes ago.
     *
     * Three runs and a division, with the north side left open: that is the
     * side they came in from.  `fenceRun` collides, so these are cover —
     * 1.05 m of woven hazel is a thing you shoot over in a game with no
     * crouch — and they are what makes the south-west of the yard a place
     * to fight through rather than an empty pan.
     * ============================================================== */
    {
      const pen = (points, seed) => ctx.add(villageProps.fenceRun({
        points, kind: 'hurdle', h: 1.05, seed, groundAt: ground, ctx, postEvery: 1.8,
      }), seed);
      pen([[-44.0, 8.2], [-38.6, 8.2]], 'pen-south');
      pen([[-44.0, 8.4], [-44.0, 13.4]], 'pen-west');
      pen([[-38.6, 8.4], [-38.6, 13.4]], 'pen-east');
      pen([[-41.4, 8.4], [-41.4, 11.6]], 'pen-division');

      prop(villageProps.trough({ seed: 'pen-trough', len: 1.8, w: 0.66, h: 0.56, water: true }), -42.8, 9.4, Math.PI / 2, 'pen-trough');
      solid(-42.8, 9.4, 0.5, 1.0);
      prop(villageProps.hayBale({ seed: 'pen-bale-a', r: 0.55, square: true }), -39.9, 12.6, 0.3, 'pen-bale-a');
      prop(villageProps.hayBale({ seed: 'pen-bale-b', r: 0.52, square: true }), -40.4, 11.5, -0.4, 'pen-bale-b');
      // the crook, left leaning on the west hurdle
      {
        const P = parts();
        const y0 = ground(-43.9, 11.0);
        P.add(M.oakSilver, cyl(0.026, 0.03, 1.7, -43.86, y0 + 0.84, 11.0, { seg: 6, rx: 0.1, rz: -0.16 }));
        P.add(M.iron, cyl(0.02, 0.02, 0.28, -43.72, y0 + 1.66, 11.02, { seg: 5, rx: 1.2 }));
        const g = new THREE.Group();
        P.flush(g, { receive: false });
        g.userData = { prop: true, kind: 'crook' };
        ctx.add(g, 'shepherds-crook');
      }
    }

    /* ================================================================
     * 7. COVER — two clusters, the yard and the tannery.
     *
     * `min_cover` is 6 collider-bearing obstacles fully inside
     * x -47..-20, z -10..47.  These nine are the TAGGED ones, so the
     * referee's "behind cover" test can read them; the buildings' own
     * colliders are inside the rect too and count for the gate.
     *
     * Placed the way a level designer places cover: two clusters, a lane of
     * it running from the mill lane's mouth toward the stage stair (the
     * high ground), and nothing in a scatter.  The approach is the mill lane
     * from the south-east, so every piece here can be put between a body
     * and that lane.
     * ============================================================== */
    // the yard cluster — the lane of cover toward the stair
    cover(siegeProps.mantlet({ seed: 'mr-mantlet-yard', w: 1.5, h: 1.5 }), 1.5, -30.6, 26.6, -0.9, 'mantlet-yard');
        /* THE TWO YARD GABIONS ARE 2.3 m OFF THE WARDEN'S POST, MEASURED.  The
     * plan gives `millwarden` 2 m of clear ground and he is 1.55 m of stone
     * that swings; the first pair stood 0.42 m from him, which renders as a
     * golem behind a basket and fails check-game outright. */
    cover(siegeProps.gabion({ seed: 'mr-gabion-a', r: 0.62, h: 1.05 }), 1.05, -29.6, 24.4, 0, 'gabion-yard-a');
    cover(siegeProps.gabion({ seed: 'mr-gabion-b', r: 0.58, h: 1.05 }), 1.05, -28.8, 20.6, 0, 'gabion-yard-b');
    cover(villageProps.hayRick({ seed: 'mr-rick', r: 1.05, h: 2.0 }), 1.4, -44.2, 21.4, 0, 'hayrick');
    // the flour cart, half filled and left standing under the stage
    cover(villageProps.cart({
      seed: 'mr-flour-cart', L: 2.7, W: 1.4, wheelR: 0.52,
      paint: JOINERY.barnRust, load: 'flour', shafts: true, sackColor: PAL.hessian,
    /* IT STANDS ON THE TRACK BY THE MILL DOOR, and where it stands was
     * decided by arithmetic twice.  `cart`'s footprint is 4.3 m long with
     * the shafts on it: at (-34.8, 20.4) its rotated AABB reached x -31.73
     * and the Millstone Warden's post at (-32.5, 22) was INSIDE it — the
     * post reads as standable in every frame and check-game calls it
     * sealed.  Moved under the stage instead, it stood on the flight's own
     * treads, 0.48 m in the air, and took both handrails' run checks with
     * it.  2.97 m clear of the post now, on the ground, at the door. */
    }), 1.25, -35.4, 27.0, Math.PI / 2, 'flour-cart');
    // the tannery cluster
    cover(siegeProps.gabion({ seed: 'mr-gabion-c', r: 0.62, h: 1.05 }), 1.05, -30.2, -9.0, 0, 'gabion-tannery');
    cover(siegeProps.mantlet({ seed: 'mr-mantlet-tan', w: 1.5, h: 1.5 }), 1.5, -33.0, -8.8, 1.4, 'mantlet-tannery');
    cover(villageProps.barrelStack({ seed: 'mr-tan-barrels', rows: 3, endColor: JOINERY.oakStain }),
      1.1, -41.6, -1.6, 0.2, 'tan-barrels');
    cover(siegeProps.gabion({ seed: 'mr-gabion-wall', r: 0.62, h: 1.05 }), 1.05, -47.4, 35.2, 0, 'gabion-wall');

    /* the barricade at the head of the wall lane, thrown up this afternoon
     * and RAISED.  Its declared gap is the CLEAR face-to-face number and
     * the generator refuses anything under 1.8 m: a lane a body cannot pass
     * is a sealed lane, for the player, for the fleeing townsfolk and for
     * the enemies whose route it is. */
    ctx.add(barricade({
      w: 4.2, seed: 'mr-lane-barricade', kind: 'carts', at: [-46.7, 43.4],
      yaw: 0, gap: 1.9, gapAt: 'right', state: 'up', ctx, name: 'wall-lane-barricade',
    }), 'wall-lane-barricade');

    /* ================================================================
     * 8. THE WORKING GEAR AND THE STORY
     *
     * Three things stopped ten minutes ago and every prop here is one of
     * them caught halfway: flour being sacked, the sheep driven in, and
     * somebody's lantern dropped on the track.
     * ============================================================== */
    prop(villageProps.sackStack({ seed: 'mr-sacks-a', n: 5 }), -36.2, 19.3, 0.4, 'sacks-a');
    solid(-36.2, 19.3, 0.4, 0.4);
    prop(villageProps.sackStack({ seed: 'mr-sacks-b', n: 3 }), -35.2, 19.9, -0.3, 'sacks-b');
    prop(villageProps.crateStack({ seed: 'mr-crates', n: 3, spill: true, goods: JOINERY.mossPaint }), -32.4, 30.2, -0.3, 'yard-crates');
    /* AND THE LOG PILE IS ON THE LANE, NOT ON THE STAIR HEAD.  At
     * (-46.4, 30.4) it stood inside the landing shelf and `seatOnGround`
     * put it on the wall-walk, five metres up: a stack of firewood on a
     * fighting top, which renders as a stack of firewood. */
    prop(villageProps.logPile({ seed: 'mr-logs', w: 2.4, h: 1.05, d: 0.62, roof: true }), -45.6, 25.0, Math.PI / 2, 'wall-logs');
    solid(-45.6, 25.0, 0.45, 1.35);
    prop(villageProps.ladder({ seed: 'mr-ladder', len: 4.2, w: 0.46, standoff: 1.1 }), -33.4, 39.9, Math.PI, 'granary-ladder');
    prop(villageProps.chickenCoop({ seed: 'mr-coop', w: 1.3, d: 1.0, h: 0.9, run: true, roofColor: JOINERY.mossPaint }), -43.6, 38.2, -1.2, 'coop');
    solid(-43.6, 38.2, 0.8, 0.7);
    prop(villageProps.barrel({ seed: 'mr-butt', h: 0.94, r: 0.36 }), -42.0, 36.4, 0, 'water-butt');

    // the tannery's gear: the pits, the beam the hides go over, the lime tubs
    {
      const P = parts();
      const y0 = ground(-42.6, -5.6);
      /* THE PITS KEEP OFF THE PLAN'S OWN WAYPOINT.  The first cut put one at
       * (-39.4, -5.0); its 1.9 x 1.5 collider inflated by the walker's radius
       * covers (-40, -4) exactly, and "the tannery yard" came back
       * UNREACHABLE from a flood fill that had walked to within a metre of
       * it.  Nothing renders wrong: a tanyard with pits in it is a tanyard
       * with pits in it. */
      const PITS = [[-43.4, -6.6, 0.1], [-43.2, -2.6, -0.2], [-38.6, -7.2, 0.3]];
      for (const [px, pz, ry] of PITS) {
        P.add(M.graniteDark, bx(1.9, 0.24, 1.5, px, y0 + 0.12, pz, { ry }));
        P.add(M.pavingDark, bx(1.5, 0.06, 1.1, px, y0 + 0.24, pz, { ry }));
      }
      for (const s of [-1, 1]) P.add(M.oakDark, bx(0.14, 1.1, 0.14, -37.8, y0 + 0.55, -7.4 + s * 0.9));
      P.add(M.oak, cyl(0.13, 0.13, 2.2, -37.8, y0 + 1.12, -7.4, { seg: 8, rx: Math.PI / 2 }));
      P.add(M.hessian, bx(0.02, 0.8, 1.1, -37.7, y0 + 0.78, -7.4, { rz: 0.06 }));
      const g = new THREE.Group();
      P.flush(g);
      ctx.add(g, 'tan-pits');
      for (const [px, pz] of PITS) solid(px, pz, 1.0, 0.8);
      solid(-37.8, -7.4, 0.3, 1.1);
    }
    prop(villageProps.barrel({ seed: 'mr-lime-a', h: 0.9, r: 0.35 }), -38.8, -2.6, 0, 'lime-tub-a');
    prop(villageProps.barrel({ seed: 'mr-lime-b', h: 0.82, r: 0.32, tipped: true }), -38.0, -1.6, 0.7, 'lime-tub-b');

    /* THE DROPPED LANTERN.  Somebody was coming down the track with it when
     * the horn went.  `lantern({ post: false })` is the set-down variant; it
     * lies on its side on the verge, UNLIT — a lit one on the ground beside
     * a working mill is a fire, not a story. */
    {
      const l = lantern({ seed: 'mr-dropped-lantern', post: false, lit: false });
      l.position.set(-26.4, ground(-26.4, 35.4) + 0.12, 35.4);
      l.rotation.set(1.42, 0.6, 0.2);
      ctx.add(l, 'dropped-lantern');
      const P = parts();
      const rr = rng('lantern-oil');
      for (let i = 0; i < 9; i += 1) {
        P.add(M.pavingDark, bx(rr.range(0.16, 0.42), 0.04, rr.range(0.12, 0.3),
          -26.4 + rr.range(-0.5, 0.5), ground(-26.4, 35.4) + 0.01, 35.4 + rr.range(-0.4, 0.4),
          { ry: rr.range(0, 3.14) }));
      }
      const g = new THREE.Group();
      P.flush(g, { cast: false });
      ctx.add(g, 'lantern-oil');
    }

    /* PRACTICALS ARE THE ONLY LIGHT THIS DISTRICT HAS BELOW 5 m.  The sun
     * is due west at nine degrees and the west curtain is 5 m tall, so its
     * shadow reaches x -17.2 — the whole town side of millreach is in it,
     * and only the mill's head, the sails and the roof slopes are lit.
     * That is correct and it is the frame this district is for; it also
     * means every ground-level view is carried by torch and lantern. */
    prop(villageProps.postLantern({ seed: 'mr-yard-lamp', h: 2.5, lit: true }), -32.6, 32.0, 0, 'yard-lamp');
    solid(-32.6, 32.0, 0.22, 0.22);
    prop(villageProps.postLantern({ seed: 'mr-tan-lamp', h: 2.35, lit: true, arm: false }), -34.6, 1.4, 0, 'tannery-lamp');
    solid(-34.6, 1.4, 0.22, 0.22);
    {
      const br = villageProps.brazier({ seed: 'mr-brazier', r: 0.42, h: 0.85, lit: true, ctx });
      prop(br, -35.8, 30.6, 0, 'yard-brazier');
      solid(-35.8, 30.6, 0.45, 0.45);
    }
    // the fire at the barricade, on the lane the wall-walk looks down
    {
      const br = villageProps.brazier({ seed: 'mr-lane-brazier', r: 0.4, h: 0.82, lit: true, ctx });
      prop(br, -45.2, 41.4, 0, 'lane-brazier');
      solid(-45.2, 41.4, 0.44, 0.44);
    }
    // the granary's own door lamp, over the shelter the arena runs to
    prop(villageProps.postLantern({ seed: 'mr-granary-lamp', h: 2.4, lit: true, arm: true }), -25.0, 37.8, 0, 'granary-lamp');
    solid(-25.0, 37.8, 0.22, 0.22);
    // and one more on the south wall's inner face, over the row's back lane
    {
      const t = wallTorch({ seed: 'wall-torch-c', lit: true, reach: 0.42, groundDrop: -3.1 });
      t.position.set(-30.0, ground(-30.0, 48.4) + 3.1, 48.78);
      t.rotation.y = Math.PI;
      ctx.add(t, 'wall-torch-c');
    }

    /* ================================================================
     * 9. SIGNAGE — four boards, no people on any of them.
     * ============================================================== */
    {
      // slim frangible furniture: no collider, the same call the stop pole makes
      prop(signKit.platePost({
        tenant: 'hollowbrookMill', w: 1.5, h: 0.72, postH: 2.0, double: true, seed: 'mr-mill-plate',
      }), -27.6, 32.4, Math.PI / 2, 'mill-plate');
    }
    {
      const s = signKit.hangingSign({
        tenant: 'tannery', w: 1.25, h: 0.62, standoff: 0.62, seed: 'mr-tannery-sign', ctx, sway: true,
      });
      s.position.set(-31.14, ground(-31.6, -4.5) + 2.4, -4.5);
      s.rotation.y = -Math.PI / 2;
      ctx.add(s, 'tannery-sign');
    }
    {
      const n = signKit.wallNotice({ notice: 'flourprices', w: 0.56, h: 0.72, seed: 'mr-flour-notice' });
      n.position.set(-33.82, ground(-34.2, 41.4) + 1.55, 41.4);
      n.rotation.y = -Math.PI / 2;
      ctx.add(n, 'flour-notice');
    }
    {
      const b = signKit.chalkedBoard({
        head: 'GROUND THIS DAY', lines: ['WHEAT  IX SACK', 'BARLEY  VI SACK', 'RYE  —'],
        w: 0.86, h: 0.66, seed: 'mr-tally', frame: true,
      });
      b.position.set(-36.84, GY + 1.06, 16.4);
      b.rotation.y = Math.PI / 2;
      b.userData = { ...b.userData, airborne: true };
      ctx.add(b, 'mill-tally');
    }

    /* ================================================================
     * 10. TREES — a few against the north end, OUTSIDE the arena rect and
     * outside every corridor, where they close the district against
     * chapelclose without standing in a lane or in the wall-walk's sight
     * line down the wall lane.  One spot per stand: a multi-spot stand's
     * bbox spans every spot and the audit's OVERLAP test then flags
     * everything standing between them.
     * ============================================================== */
    const TREES = [
      ['orchard', -45.6, -10.4, 0.86],
      ['orchard', -42.4, -10.9, 0.80],
      ['hedgerow', -39.4, -10.2, 0.74],
    ];
    TREES.forEach(([kind, x, z, s], i) => {
      ctx.add(treeStand({ seed: `mr-tree-${i}`, kind, spots: [[x, z]], groundAt: ground, scale: s, density: 0.78 }), `tree-${i}`);
      ctx.collide(x - 0.34, z - 0.34, x + 0.34, z + 0.34);
    });

    void R;
  },
});
