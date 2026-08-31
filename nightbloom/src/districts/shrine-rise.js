import * as THREE from 'three';
import { defineDistrict } from '../core/district.js';
import { bankWedge, bench, stairRail, stairs, wallRun } from '../builders.js';
import {
  M, SINK, ASPECT, rng, bx, cyl, addMesh, board, lanternRig,
  shrineHall, torii, stoneLantern, shrineNotice,
} from '../kit/index.js';
import {
  LEAF, LEAF_SHADE, broom, camphorTree, charmRack, grove, mossStones, shideStrip, stele,
} from './shrine-rise-props.js';

/* ================================================================== *
 * 宵坂神社 — the shrine rise.
 *
 * The terrain arrived shaped: a shelf at y 3.5 over x 0..34 / z −48..−26
 * with SHEER edges, one 3 m stone ramp climbing it at x 14 from z −19 to
 * z −27, and both halves of the two path sockets.  Nothing here lays
 * ground; everything here dresses that landform.
 *
 * The three things this district exists to do:
 *
 *   1. THE GATE READS.  `district:shrine-rise:torii` is raycast from two
 *      city vistas and from the festival ground's own waypoints, and the
 *      `field-to-torii` sight corridor runs at y 6 down the slope to it.
 *      So the torii sits at (14, −24.2) — a fifth of the way DOWN the
 *      ramp, where the arriving line of sight from the east meets it —
 *      and the whole south-east quadrant below the terrace is kept under
 *      three metres.  Two numbers earned that position: the corridor's
 *      rays terminate at z = −24, so the gate's own gakuzuka strut (the
 *      only member crossing y 6 on the centre line) had to sit BEHIND
 *      that endpoint, and the ±2 m offset rays cross the gate's plane at
 *      x 11.2 and 16.8, outside both posts.
 *   2. THE TERRACE EDGE LOOKS OUT.  The south precinct wall is 0.86 m —
 *      under the brief's 1 m at the lookout, and low enough everywhere
 *      that the terrace reads as a balcony over the town rather than a
 *      compound.
 *   3. THE CHARMS ARE WRONG IN NUMBER.  Three racks of warding tags line
 *      the terrace's EAST edge, every tag turned to face the festival
 *      ground, plus the charm cords over the approach and the gate's own.
 *      A town this size wants a dozen; there are a hundred and thirty.
 * ================================================================== */

/* ---- the landform, as the terrain actually built it ---------------- */
const RAMP = { x: 14, hw: 1.5, z0: -18.9, z1: -26.05 };  // stone ramp, x 12.5..15.5
const TERRACE_Y = 3.5;
const LIP_Z = -26.05;          // shelf's south edge
const EAST_X = 34;             // shelf's east edge
const WEST_X = 0;              // shelf's west edge
const TORII_Z = -24.2;

const HALL = { x: 16, z: -41, ry: 0, seed: 3 };
const TREE = { x: 25.6, z: -40.8 };
const BACK = { x: 28, foot: -17.96, steps: 20, rise: 0.175, run: 0.4125, w: 2.4 };

/* ------------------------------------------------------------------ *
 * A coursed stone revetment facing a terrain step.
 *
 * The shelf edges are a 3.5 m drop in one terrain cell — read as a raw
 * earth cut, which is what a shelf looks like before anybody builds.  A
 * revetment is what the town would actually have put there: courses
 * stacked with a batter, so the face leans back the way a dry-stone
 * retaining wall leans back, and a coping over the top.
 *
 * `axis` is the run direction; `at` is the coordinate of the face's
 * INNER side (flush with the cut) and `out` which way the exposed face
 * points.  Courses alternate material, so the coursing reads at distance
 * without a single extra draw call beyond the two pools.
 * ------------------------------------------------------------------ */
function revetment(dark, pale, cap, { axis, at, from, to, out, base, top, thick = 0.52, courses = 6, batter = 0.05 }) {
  const len = Math.abs(to - from);
  const mid = (from + to) / 2;
  const ch = (top - base) / courses;
  for (let i = 0; i < courses; i += 1) {
    const t = thick - batter * i;
    const c = at + out * (t / 2);
    const y = base + (i + 0.5) * ch;
    const g = axis === 'x' ? bx(len, ch + 0.02, t, mid, y, c) : bx(t, ch + 0.02, len, c, y, mid);
    (i % 2 ? pale : dark).push(g);
  }
  const tc = thick - batter * (courses - 1) + 0.12;
  const cc = at + out * (tc / 2 - 0.06);
  cap.push(axis === 'x' ? bx(len, 0.12, tc, mid, top + 0.06, cc) : bx(tc, 0.12, len, cc, top + 0.06, mid));
}

export default defineDistrict({
  id: 'shrine-rise',
  envelope: { x0: -8, z0: -50, x1: 38, z1: -14 },

  build(ctx) {
    const r = rng(9271);
    const G = (x, z) => ctx.groundAt(x, z);
    const TORII_Y = G(RAMP.x, TORII_Z);
    /* Every merged pool goes into a named group through ctx.add, never
     * straight onto ctx.root: composeCity stamps ownership on the way in,
     * and an unstamped mesh is the "blocked by pool-0, whose is it?"
     * archaeology the whole naming convention exists to prevent. */
    const pool = (name) => ctx.add(new THREE.Group(), name);

    /* ================================================================
     * 1. THE LANDFORM, DRESSED — revetments, ramp cheeks, banks
     * ============================================================== */

    const faceDark = [];
    const facePale = [];
    const faceCap = [];

    // the town's own view of the shrine: the south face of the terrace,
    // broken only by the ramp and by the back stair's head
    for (const [x0, x1] of [[WEST_X - 0.3, 11.7], [16.3, 26.55], [29.45, EAST_X + 0.3]]) {
      revetment(faceDark, facePale, faceCap, {
        axis: 'x', at: LIP_Z, from: x0, to: x1, out: 1, base: -0.2, top: TERRACE_Y,
      });
      ctx.collide(x0, LIP_Z, x1, LIP_Z + 0.55);
    }
    // the festival ground's view of the shrine: the east face
    revetment(faceDark, facePale, faceCap, {
      axis: 'z', at: EAST_X, from: -26.05, to: -46, out: 1, base: -0.2, top: TERRACE_Y,
    });
    ctx.collide(EAST_X, -46, EAST_X + 0.55, -26.05);
    // and a short return on the west, where the approach path passes under it
    revetment(faceDark, facePale, faceCap, {
      axis: 'z', at: WEST_X, from: -26.05, to: -33, out: -1, base: -0.2, top: TERRACE_Y,
    });
    ctx.collide(WEST_X - 0.55, -33, WEST_X, -26.05);

    /* ---- the ramp cheeks: the "moss walls" the stair climbs between --
     * Sliced along the ramp and seated slice by slice on the ramp's OWN
     * height, so the coping steps with the flight instead of running
     * level over a climb.  At the gate the cheek is cut down to the
     * torii's own base level: the posts stand ON it, which is the only
     * reason a 3.7 m gate fits on a 3 m ramp at all. */
    {
      const wallDark = [];
      const wallPale = [];
      const wallCap = [];
      const wallMoss = [];
      const SLICE = 0.35;
      const COURSES = 5;
      for (const s of [-1, 1]) {
        const xIn = RAMP.x + s * (RAMP.hw - 0.05);
        for (let z = RAMP.z0; z > RAMP.z1; z -= SLICE) {
          const zm = z - SLICE / 2;
          // the gate station: cut down to the gate's own base and pushed out
          // past the kasagi's ends, because the audit sweeps a run's whole
          // bbox and a 5.5 m kasagi over a 2.5 m plinth is two float stations
          const gate = zm < -23.25 && zm > -25.15;
          const xOut = RAMP.x + s * (gate ? 2.95 : RAMP.hw + 0.75);
          const top = gate ? TORII_Y : G(RAMP.x, zm) + 0.56;
          // coursed, not one slab: seen from the festival side the ramp is
          // a two-metre cheek two hundred metres of frame wide, and a flat
          // face that size reads as an untextured block whatever tone it is
          const ch = (top + 0.25) / COURSES;
          for (let i = 0; i < COURSES; i += 1) {
            const xo = xOut - s * 0.042 * i;
            const cx = (xIn + xo) / 2;
            (i % 2 ? wallPale : wallDark).push(
              bx(Math.abs(xo - xIn), ch + 0.02, SLICE + 0.02, cx, -0.25 + (i + 0.5) * ch, zm));
          }
          const cw = Math.abs(xOut - 0.042 * (COURSES - 1) * s - xIn) + 0.14;
          wallCap.push(bx(cw, 0.12, SLICE + 0.02,
            (xIn + xOut - s * 0.042 * (COURSES - 1)) / 2 + s * 0.05, top + 0.06, zm));
          if (r.chance(0.55)) {
            wallMoss.push(bx(0.34, r.range(0.4, 1.2), SLICE + 0.02,
              xOut - s * r.range(0.02, 0.16), r.range(0.2, top * 0.7), zm));
          }
        }
        ctx.collide(RAMP.x + s * (RAMP.hw - 0.05), RAMP.z1, RAMP.x + s * (RAMP.hw + 0.75), RAMP.z0);
        ctx.collide(RAMP.x + s * (RAMP.hw - 0.05), -25.15, RAMP.x + s * 2.95, -23.25);
      }
      const cheek = pool('ramp-cheek');
      addMesh(cheek, wallDark, M.stone, { name: 'ramp-cheek' });
      addMesh(cheek, wallPale, M.stonePale, { name: 'ramp-cheek-course' });
      addMesh(cheek, wallCap, M.stoneDeep, { cast: false, name: 'ramp-cheek-coping' });
      addMesh(cheek, wallMoss, M.moss, { cast: false, name: 'ramp-cheek-moss' });
    }

    // banks tucked into the two re-entrant corners the ramp makes with
    // the terrace face, so the junction is a slope and not a slot
    // Slumped earth at the revetment's foot — kept LOW and short.  The
    // first pass ran these 2.6 m up the face and 3 m out, and a wedge that
    // size beside a retaining wall reads as a contractor's access ramp
    // rather than as a hundred years of washed-down bank.
    for (const [i, x] of [5.2, 22.4].entries()) {
      const w = bankWedge({
        from: [x, 1.05, -25.95], to: [x, 0.04, -24.15], w: 5.0, mat: M.moss,
      });
      ctx.add(w, `terrace-talus-${i}`);
      ctx.collide(x - 2.5, -25.95, x + 2.5, -24.6);
    }

    const faceGroup = new THREE.Group();
    addMesh(faceGroup, faceDark, M.stone, { name: 'revetment-course-a' });
    addMesh(faceGroup, facePale, M.stonePale, { name: 'revetment-course-b' });
    addMesh(faceGroup, faceCap, M.stoneDeep, { cast: false, name: 'revetment-coping' });
    ctx.add(faceGroup, 'terrace-revetment');

    /* ================================================================
     * 2. THE APPROACHES — both socket paths, paved and swept
     * ============================================================== */
    {
      const flags = [];
      const kerb = [];
      const lay = (points, width) => {
        let carry = 0;
        for (let i = 0; i < points.length - 1; i += 1) {
          const [ax, az] = points[i];
          const [bxx, bz] = points[i + 1];
          const len = Math.hypot(bxx - ax, bz - az);
          const ux = (bxx - ax) / len;
          const uz = (bz - az) / len;
          for (let t = carry; t < len; t += 0.74) {
            const px = ax + ux * t;
            const pz = az + uz * t;
            const n = Math.max(2, Math.round(width / 0.82));
            for (let k = 0; k < n; k += 1) {
              const o = (-width / 2) + (width * (k + 0.5)) / n + r.range(-0.05, 0.05);
              const sx = px - uz * o;
              const sz = pz + ux * o;
              const y = G(sx, sz);
              if (y > 0.6) continue;                       // the ramp owns its own treads
              flags.push(bx(r.range(0.52, 0.74), 0.16, r.range(0.5, 0.72), sx, y - 0.06, sz,
                { ry: Math.atan2(ux, uz) + r.range(-0.09, 0.09) }));
            }
            const ey = G(px - uz * (width / 2 + 0.34), pz + ux * (width / 2 + 0.34));
            if (ey < 0.6 && r.chance(0.55)) {
              kerb.push(cyl(0.17, 0.22, 0.3, 5, px - uz * (width / 2 + 0.34), ey + 0.07,
                pz + ux * (width / 2 + 0.34), { ry: r.range(0, 3) }));
              kerb.push(cyl(0.17, 0.22, 0.3, 5, px + uz * (width / 2 + 0.34), ey + 0.07,
                pz - ux * (width / 2 + 0.34), { ry: r.range(0, 3) }));
            }
            carry = t + 0.74 - len;
          }
        }
      };
      // sr-steps-s: up from the market, then east to the foot of the flight
      lay([[0, -14.1], [0, -16.9], [4.6, -17.7], [10, -18.0], [14, -18.4]], 3.0);
      // sr-back-e: the back way in from the festival ground
      lay([[28, -14.1], [28, -16.3], [21.5, -16.6], [17, -17.5], [14.6, -18.1]], 2.4);
      lay([[28, -16.3], [28, -17.7]], 2.2);
      // the forecourt at the stair foot
      for (let i = 0; i < 96; i += 1) {
        const sx = 10.2 + r.range(0, 7.6);
        const sz = -16.6 - r.range(0, 2.1);
        flags.push(bx(r.range(0.5, 0.76), 0.16, r.range(0.5, 0.72), sx, G(sx, sz) - 0.06, sz,
          { ry: r.range(0, 3) }));
      }
      const paving = pool('approach-paving');
      addMesh(paving, flags, M.stonePale, { cast: false, name: 'path-flags' });
      addMesh(paving, kerb, M.moss, { cast: false, name: 'path-kerb-stones' });
    }

    /* ---- shrine-foot-wall: the boundary feature this district owns ---
     * On z = −14 from x 4 to 16 only: market-street builds nothing here,
     * and the sr-steps-s corridor at x 0 (±1.75 m) must stay open, so the
     * run starts four metres clear of it. */
    ctx.add(wallRun({
      points: [[4, -14], [16, -14]], h: 1.15, thick: 0.4, piers: 4,
      mat: M.stonePale, copingMat: M.stoneDeep, ctx,
    }), 'shrine-foot-wall');

    /* ---- the stair foot: marker, notice, lanterns, moss ------------- */
    {
      const s = stele({ h: 2.05 });
      s.position.set(10.5, G(10.5, -18.2), -18.2);
      ctx.add(s, 'stair-foot-stele');
      ctx.collide(10.0, -18.7, 11.0, -17.7);

      const notice = new THREE.Group();
      board(notice, shrineNotice(), 0.52, ASPECT.notice, { at: [0, 1.32, 0.05], mat: M.cedarPale });
      addMesh(notice, [
        bx(0.11, 1.5 + SINK, 0.11, -0.34, (1.5 - SINK) / 2, 0),
        bx(0.11, 1.5 + SINK, 0.11, 0.34, (1.5 - SINK) / 2, 0),
        bx(0.86, 0.1, 0.16, 0, 1.66, 0.02),
      ], M.cedar, { name: 'notice-frame' });
      notice.position.set(17.4, G(17.4, -18.3), -18.3);
      notice.rotation.y = Math.PI - 0.25;
      notice.userData.prop = true;
      ctx.add(notice, 'stair-foot-notice');
    }

    /* ================================================================
     * 3. THE GATE — the landmark. Nothing of ours east of it or below it
     *    may be tall enough to hide it.
     * ============================================================== */
    {
      const gate = torii({ seed: 5, h: 5.0 });
      // shimenawa and fresh shide, INSIDE the gate's own group: the
      // landmark raycast accepts any hit inside the named subtree, and a
      // rope hung as a sibling would read as something blocking the gate
      const nukiY = (5.0 - 0.52) * 0.76;
      const rope = [];
      const shide = [];
      const hs = (5.0 * 0.72) / 2;
      for (let i = 0; i < 7; i += 1) {
        const t = i / 6;
        const x = -hs + t * hs * 2;
        const sag = Math.sin(t * Math.PI) * 0.22;
        rope.push(cyl(0.11 - Math.abs(t - 0.5) * 0.06, 0.11 - Math.abs(t - 0.5) * 0.06, 0.56, 7,
          x, nukiY - 0.42 - sag, 0.02, { rz: Math.PI / 2 }));
      }
      for (let i = 0; i < 5; i += 1) {
        const t = (i + 0.5) / 5;
        shideStrip(shide, -hs + t * hs * 2, nukiY - 0.56 - Math.sin(t * Math.PI) * 0.22, 0.05, 0.15);
      }
      addMesh(gate, rope, M.paper, { cast: false, name: 'torii-shimenawa' });
      addMesh(gate, shide, M.paper, { cast: false, name: 'torii-shide' });
      // the gate's 額 (name plaque), centred under the shimenawa. It spans
      // the group's bbox CENTRE height — a torii's centre is otherwise open
      // air, and every centre-aimed subject ray (camera gate, landmark
      // raycasts) needs the gate itself to be the first thing it meets.
      const gaku = [];
      gaku.push(bx(0.06, 0.5, 0.05, 0, nukiY - 0.15, 0));                    // hanger strap
      gaku.push(bx(0.5, 0.86, 0.09, 0, nukiY - 0.78, 0));                    // board
      addMesh(gate, gaku, M.cedarDark, { cast: false, name: 'torii-gaku' });

      gate.position.set(RAMP.x, TORII_Y, TORII_Z);
      ctx.add(gate, 'torii');
      for (const c of torii.footprint({ seed: 5, h: 5.0 })) {
        ctx.collide(RAMP.x + c.x0, TORII_Z + c.z0, RAMP.x + c.x1, TORII_Z + c.z1);
      }
    }

    /* ================================================================
     * 4. THE PRECINCT WALL — stepped with the ground, gapped at both
     *    ways in, and LOW along the south so the terrace stays a balcony
     * ============================================================== */
    const WALL = { h: 0.86, thick: 0.38, piers: 4.2, mat: M.plasterShade, copingMat: M.tile, ctx };
    ctx.add(wallRun({ points: [[0.9, -34], [0.9, -27], [11, -27]], ...WALL }), 'precinct-wall-w');
    ctx.add(wallRun({ points: [[17, -27], [26.55, -27]], ...WALL }), 'precinct-wall-s');
    ctx.add(wallRun({ points: [[29.45, -27], [33.1, -27], [33.1, -36]], ...WALL }), 'precinct-wall-e');

    /* ================================================================
     * 5. THE BACK WAY UP — the east opening leads somewhere
     * ============================================================== */
    {
      const flight = stairs({
        w: BACK.w, rise: BACK.rise, run: BACK.run, steps: BACK.steps, dir: 'z-',
        at: [BACK.x, 0, BACK.foot], mat: M.stone, ctx,
      });
      flight.name = 'back-stair';
      ctx.add(flight, 'back-stair');
      const topZ = BACK.foot - flight.userData.topEdge;
      // the flight's top tread stops just short of where the shelf's own
      // height query takes over; a landing bridges the two rather than
      // leaving one 0.35 m cell of nothing at the head of a climb
      ctx.platform(BACK.x - 1.2, topZ - 0.75, BACK.x + 1.2, topZ + 0.1, TERRACE_Y);
      addMesh(pool('back-stair-landing'), [bx(2.9, 0.3, 1.0, BACK.x, TERRACE_Y - 0.14, topZ - 0.35)], M.stone,
        { name: 'back-stair-landing' });
      // lifted half a rise and given a shallow stringer: stairs() puts every
      // tread top ON or ABOVE the rake line through its joints, so a rail
      // hung on the raw rake line sits inside the treads it is supposed to
      // stand on and reads as buried
      ctx.add(stairRail({
        from: [BACK.x, 0.1, BACK.foot], to: [BACK.x, flight.userData.topY + 0.1, topZ],
        side: 1.15, h: 0.95, sink: 0.12, mat: M.cedarDark,
      }), 'back-stair-rail');
      // Coursed stringer cheeks on BOTH flanks.  stairs() builds each tread
      // as a solid block from the ground, so a 3.5 m flight standing free on
      // flat ground is a plain triangular slab two storeys tall — and that
      // slab is what the festival ground looks straight at.
      const kerbDark = [];
      const kerbPale = [];
      for (const s of [-1, 1]) {
        for (let i = 0; i <= BACK.steps; i += 2) {
          const z = BACK.foot - i * BACK.run;
          const h = i * BACK.rise + 0.42;
          for (let c = 0; c < 3; c += 1) {
            const t = 0.36 - c * 0.05;
            (c % 2 ? kerbPale : kerbDark).push(bx(t, h / 3 + 0.02, BACK.run * 2 + 0.06,
              BACK.x + s * (BACK.w / 2 + t / 2 + 0.02), -0.25 + (c + 0.5) * (h / 3), z - BACK.run));
          }
        }
      }
      const kerb = pool('back-stair-kerb');
      addMesh(kerb, kerbDark, M.stone, { name: 'back-stair-kerb' });
      addMesh(kerb, kerbPale, M.stoneDeep, { name: 'back-stair-kerb-course' });
    }

    /* ================================================================
     * 6. THE HALL — kit shrineHall, facing south down the stair
     * ============================================================== */
    {
      const o = { seed: HALL.seed, ry: HALL.ry };
      const hall = shrineHall(o);
      const base = G(HALL.x, HALL.z);
      hall.position.set(HALL.x, base, HALL.z);
      ctx.add(hall, 'shrine-hall');
      for (const c of shrineHall.footprint(o)) {
        ctx.collide(HALL.x + c.x0, HALL.z + c.z0, HALL.x + c.x1, HALL.z + c.z1);
      }
      // the veranda and its three treads are WALKABLE — `surfaces` tops are
      // relative to the generator's origin, so the hall's own base goes on
      for (const s of shrineHall.surfaces(o)) {
        ctx.platform(HALL.x + s.x0, HALL.z + s.z0, HALL.x + s.x1, HALL.z + s.z1, base + s.top);
      }

      /* ---- the bell rope, made swingable -------------------------- *
       * The kit hangs the rope as a straight mesh under the suzu.  A
       * pendulum needs a pivot AT the suzu, so the rope and its two pink
       * bands are re-parented into a group placed at the rope's own top
       * (read off the geometry, never remembered) and offset back by the
       * same vector — the geometry lands exactly where it already was,
       * and the group can now rotate about the point it hangs from. */
      const ropeMesh = hall.getObjectByName('shrine-rope');
      const bands = hall.getObjectByName('shrine-rope-bands');
      const pivot = new THREE.Group();
      ropeMesh.geometry.computeBoundingBox();
      const rb = ropeMesh.geometry.boundingBox;
      pivot.position.set((rb.min.x + rb.max.x) / 2, rb.max.y, (rb.min.z + rb.max.z) / 2);
      hall.add(pivot);
      for (const m of [ropeMesh, bands]) {
        if (!m) continue;
        hall.remove(m);
        pivot.add(m);
        m.position.copy(pivot.position).multiplyScalar(-1);
      }

      // one blossom petal, shaken loose by the bell
      const petal = new THREE.Group();
      addMesh(petal, [
        bx(0.17, 0.02, 0.13, 0, 0, 0),
        bx(0.11, 0.02, 0.16, 0.05, 0.005, 0.04, { ry: 0.7 }),
      ], M.blossom, { cast: false, receive: false, name: 'bell-petal' });
      petal.userData.airborne = true;
      petal.visible = false;
      // under the kohai canopy, not through it: the step roof's mid-surface
      // is at base + 2.79 over the rope, so a petal released at 3.0 fell
      // through the shingles on its first frame
      const petalTop = base + 2.35;
      const petalBase = base + 0.62;
      petal.position.set(HALL.x - 0.42, petalTop, HALL.z + 2.9);
      ctx.add(petal, 'bell-petal');

      let t = -1;
      const rest = () => { t = -1; pivot.rotation.x = 0; petal.visible = false; };
      ctx.update((dt) => {
        if (t < 0) return;
        t += dt;
        pivot.rotation.x = Math.sin(t * 6.4) * 0.2 * Math.exp(-t * 0.9);
        const f = Math.max(0, Math.min(1, (t - 0.35) / 3.1));
        petal.visible = t > 0.35 && f < 1;
        petal.position.y = petalTop - (petalTop - petalBase) * f * f;
        petal.position.x = HALL.x - 0.42 + Math.sin(t * 2.6) * 0.34;
        petal.rotation.z = t * 1.9;
        petal.rotation.y = t * 1.1;
        if (t > 4.2) rest();
      });
      ctx.reset(rest);
      ctx.interact({
        name: 'pull the shrine bell rope',
        label: 'pull the shrine bell rope',
        hitbox: ropeMesh,
        action: () => { t = 0; },
      });
    }

    /* ================================================================
     * 7. THE CAMPHOR — the hero silhouette, leaning west over the hall
     * ============================================================== */
    {
      const tree = camphorTree({ seed: 4 });
      tree.position.set(TREE.x, G(TREE.x, TREE.z), TREE.z);
      ctx.add(tree, 'camphor');
      ctx.collide(TREE.x - 0.78, TREE.z - 0.78, TREE.x + 0.78, TREE.z + 0.78);
      const stone = [];
      const moss = [];
      mossStones(stone, moss, { x: 23.6, z: -39.0, n: 6, spread: 1.7, size: 0.45, seed: 3, groundAt: G });
      mossStones(stone, moss, { x: 27.4, z: -42.6, n: 5, spread: 1.6, size: 0.4, seed: 8, groundAt: G });
      const litter = pool('camphor-root-stones');
      addMesh(litter, stone, M.stone, { name: 'camphor-root-stones' });
      addMesh(litter, moss, M.moss, { cast: false, name: 'camphor-root-moss' });
    }

    /* ================================================================
     * 8. THE SWEPT COURT and the lanterns down it
     * ============================================================== */
    {
      const grit = [];
      const rake = [];
      for (let x = 11.4; x < 21.0; x += 0.8) {
        for (let z = -38.6; z < -28.4; z += 0.8) {
          grit.push(bx(0.86, 0.14, 0.86, x, TERRACE_Y - 0.03, z));
        }
      }
      // in bands with breaks: one set of lines running the full court edge
      // to edge reads as floorboards, not as ground somebody sweeps
      for (const [z0, z1, x0, x1] of [
        [-37.9, -35.3, 12.4, 20.0], [-34.4, -31.8, 11.9, 20.4], [-30.9, -29.0, 12.9, 19.6],
      ]) {
        for (let z = z0; z > z1; z -= 0.62) {
          rake.push(bx(x1 - x0, 0.035, 0.055, (x0 + x1) / 2, TERRACE_Y + 0.055, z));
        }
      }
      const court = pool('swept-court');
      addMesh(court, grit, M.stonePale, { cast: false, name: 'court-gravel' });
      addMesh(court, rake, M.stone, { cast: false, name: 'court-rake' });
    }

    const toro = (x, z, size, seed) => {
      const g = stoneLantern({ seed, size, ry: r.range(0, 6) });
      g.position.set(x, G(x, z), z);
      ctx.add(g, `toro-${seed}`);
      const hx = size === 'large' ? 0.44 : 0.3;
      ctx.collide(x - hx, z - hx, x + hx, z + hx);
    };
    toro(11.0, -19.5, 'large', 12);      // the flight's foot
    toro(17.0, -19.5, 'large', 13);
    toro(11.6, -28.3, 'large', 14);      // the flight's head, inside the gap
    toro(16.4, -28.3, 'large', 15);
    toro(11.4, -30.5, 'large', 16);      // the avenue to the hall
    toro(20.6, -30.5, 'large', 17);
    toro(11.4, -34.5, 'large', 18);
    toro(20.6, -34.5, 'large', 19);
    toro(5.6, -28.6, 'small', 20);       // the lookout
    toro(27.8, -27.9, 'small', 21);      // the head of the back way

    /* ================================================================
     * 9. THE CHARMS — far more than a town this size should need, and
     *    every one of them turned EAST, toward the festival ground
     * ============================================================== */
    {
      const racks = [
        { x: 31.5, z: -30.6, len: 3.4, tags: 30, seed: 2, face: Math.PI / 2 },
        { x: 31.5, z: -34.3, len: 3.0, tags: 26, seed: 5, face: Math.PI / 2 + 0.06 },
        { x: 31.4, z: -38.1, len: 2.6, tags: 24, seed: 9, face: Math.PI / 2 - 0.05 },
      ];
      for (const [i, o] of racks.entries()) {
        const g = charmRack(o);
        g.position.set(o.x, G(o.x, o.z), o.z);
        ctx.add(g, `charm-rack-${i}`);
        ctx.collide(o.x - 0.3, o.z - o.len / 2 - 0.2, o.x + 0.3, o.z + o.len / 2 + 0.2);
      }

      // charm cords over the approach: posts, a catenary, paper lanterns
      // on it (the only practicals up here besides the toro) and pink
      // tags between them
      const charms = pool('charm-cords');
      const posts = [];
      const cords = [];
      const tags = [];
      const line = (x, zs) => {
        for (const z of zs) {
          posts.push(bx(0.15, 2.95 + SINK, 0.15, x, G(x, z) + (2.95 - SINK) / 2, z));
          posts.push(bx(0.28, 0.12, 0.28, x, G(x, z) + 2.98, z));
        }
        for (let i = 0; i < zs.length - 1; i += 1) {
          const a = zs[i];
          const b = zs[i + 1];
          const top = G(x, a) + 2.86;
          const spots = [];
          for (let k = 1; k <= 12; k += 1) {
            const t = k / 13;
            const z = a + (b - a) * t;
            const y = top - Math.sin(t * Math.PI) * 0.42;
            cords.push(cyl(0.022, 0.022, Math.abs(b - a) / 13 + 0.06, 4, x, y, z, { rx: Math.PI / 2 }));
            if (k % 5 === 2) spots.push([x, y - 0.05, z]);
            else {
              const drop = r.range(0.12, 0.24);
              cords.push(cyl(0.011, 0.011, drop, 4, x, y - drop / 2, z));
              const tw = r.range(0.1, 0.15);
              tags.push(bx(tw, tw * 1.55, 0.018, x + 0.03, y - drop - tw * 0.78, z));
            }
          }
          lanternRig(charms, spots, { r: 0.15, h: 0.32, radius: 4.2, name: `charm-lantern-${x}-${a}` });
        }
      };
      line(10.8, [-28.6, -32.6, -36.6]);
      line(21.4, [-28.6, -32.6]);
      addMesh(charms, posts, M.cedarDark, { name: 'charm-posts' });
      addMesh(charms, cords, M.joinery, { cast: false, name: 'charm-cords' });
      addMesh(charms, tags, M.blossom, { cast: false, name: 'charm-cord-tags' });
    }

    /* ---- the ema rack by the west approach, and the broom ----------- */
    {
      const ema = new THREE.Group();
      const frame = [];
      for (const s of [-1, 1]) frame.push(bx(0.13, 2.0 + SINK, 0.13, s * 1.15, (2.0 - SINK) / 2, 0));
      frame.push(bx(2.62, 0.14, 0.18, 0, 1.94, 0));
      frame.push(bx(2.3, 0.1, 0.14, 0, 1.02, 0));
      addMesh(ema, frame, M.cedar, { name: 'ema-rack-frame' });
      const plaques = [];
      for (let i = 0; i < 22; i += 1) {
        const row = i % 2;
        const x = -1.02 + ((i * 0.6180) % 1) * 2.04;
        const y = (row ? 1.86 : 0.94) - r.range(0.02, 0.1);
        plaques.push(bx(0.19, 0.15, 0.03, x, y - 0.11, r.range(-0.05, 0.05)));
      }
      addMesh(ema, plaques, M.blossom, { cast: false, name: 'ema-plaques' });
      ema.userData.prop = true;
      ema.position.set(6.6, G(6.6, -33.4), -33.4);
      ema.rotation.y = Math.PI / 2;
      ctx.add(ema, 'ema-rack');
      ctx.collide(6.2, -34.8, 7.0, -32.0);

      const b = broom({ ry: Math.PI / 2, lean: 0.32 });
      b.position.set(1.9, G(1.9, -31), -31);
      ctx.add(b, 'sweeping-broom');
    }

    /* ---- the lookout: a bench facing the whole town ----------------- */
    ctx.add(bench({
      w: 1.7, at: [7.4, G(7.4, -28.9), -28.9], facing: [0, 1], back: true, mat: M.cedarDark, ctx,
    }), 'lookout-bench');

    /* ---- the grove that gives the hall a back ------------------------
     * Every approach put the hall's roof against bare sky.  A stand of
     * slender trees along the terrace's north apron closes the frame from
     * the stair, from the arrival and from the orbit, and it is merged and
     * UNTAGGED on purpose: a dozen tagged units on an apron nobody walks
     * would be a dozen bbox-overlap pairs bought for no audit value. */
    {
      const bark = [];
      const crown = [];
      const under = [];
      const spots = [];
      for (let i = 0; i < 13; i += 1) {
        const x = 3.4 + i * 2.34 + r.range(-0.7, 0.7);
        const z = -45.4 - r.range(0, 2.1);
        if (x > 22.5 && x < 29.5 && z > -45.6) continue;   // the camphor's room
        spots.push([x, z, r.range(0.72, 1.18)]);
      }
      for (let i = 0; i < 5; i += 1) {
        // west edge line. The field-to-torii vista ray aims THROUGH the
        // torii's open middle (a gate's bbox centre is air) and continues to
        // (≈2.3, 7.7, -36.3) — so the band z -33..-40 stays treeless and the
        // rest stays short, or the camera gate reads the grove as the torii's
        // blocker.
        const z = -30 - i * 3.4 + r.range(-0.8, 0.8);
        if (z < -32.5 && z > -40.5) continue;
        spots.push([1.9 + r.range(-0.5, 0.5), z, r.range(0.42, 0.58)]);
      }
      const trunks = grove(bark, crown, under, { spots, seed: 6, groundAt: G });
      const g = pool('grove');
      addMesh(g, bark, M.cedarDark, { name: 'grove-trunks' });
      addMesh(g, crown, LEAF, { name: 'grove-crown' });
      addMesh(g, under, LEAF_SHADE, { name: 'grove-underside' });
      for (const [x, z, hr] of trunks) ctx.collide(x - hr, z - hr, x + hr, z + hr);
    }

    /* ---- moss and field stones along the banks ---------------------- */
    {
      const stone = [];
      const moss = [];
      for (const [x, z, n, seed] of [
        [10.4, -24.5, 7, 21], [17.6, -24.2, 7, 22], [9.8, -21.0, 6, 23], [18.4, -21.2, 6, 24],
        [3.4, -24.4, 5, 25], [23.5, -22.5, 5, 26], [31.0, -24.0, 5, 27], [25.5, -19.0, 4, 28],
        [2.0, -29.0, 4, 29], [30.0, -44.5, 5, 30],
      ]) {
        mossStones(stone, moss, { x, z, n, spread: 2.0, size: 0.46, seed, groundAt: G });
      }
      const banks = pool('bank-stones');
      addMesh(banks, stone, M.stone, { name: 'bank-stones' });
      addMesh(banks, moss, M.moss, { cast: false, name: 'bank-moss' });
    }
  },
});
