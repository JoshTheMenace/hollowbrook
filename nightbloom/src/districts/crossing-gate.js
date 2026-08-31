import * as THREE from 'three';
import { defineDistrict } from '../core/district.js';
import { seatOnGround } from '../builders.js';
import {
  M, SINK, rng, bx, cyl, member, addMesh,
  stationHalt, crossingSignal, postRack,
} from '../kit/index.js';

/* ------------------------------------------------------------------ *
 * 踏切口 — the crossing gate: the town's threshold.
 *
 * The whole district is one sentence read from the platform: a single
 * branch line runs north–south through the west of the parcel, the main
 * road crosses it at z = 0, and east of that crossing the road runs
 * dead straight into town.  The last train left twenty minutes ago —
 * the barriers are UP, the bell is silent, a bicycle leans on the
 * platform fence and the halt's notice board still carries the 宵祭
 * poster.
 *
 * THE GROUND IS THE TERRAIN'S.  Nothing here lays a plate: the ballast,
 * the road markings, the verges and the worn path are dressing seated on
 * `ctx.groundAt`, and the only registered platforms are the halt's own
 * deck/ramp (from the kit's `surfaces`) and the level crossing's timber
 * deck, which is a made surface 3.2 m × 5.2 m and says so.
 *
 * Two numbers this file is built around, because both are contracts:
 *   - the road socket at (-25, 0) keeps a 5 m corridor 3 m into the
 *     parcel, so nothing of mine collides east of x = -30;
 *   - the sight corridor "street-spine" runs from (-30, 0) east at
 *     4.5 m clear, so the parcel east of the crossing stays low.
 * ------------------------------------------------------------------ */

/* ---- the permanent way ------------------------------------------------ */

const TRACK_X = -50;          // the branch line's centreline
const GAUGE = 0.53;           // half gauge (1.067 m, a country branch)
const RAIL_Z0 = -30;          // the line runs on into the fields, both ways
const RAIL_Z1 = 24;
const FADE_M = 6;             // over which the whole formation sinks away
const BALLAST_TOP = 0.10;
const SLEEPER_TOP = 0.15;
const RAIL_TOP = 0.23;        // rail foot/web top === the crossing deck
const HEAD_TOP = 0.255;       // the polished head, proud of the deck
const PANEL_HX = 1.6;         // crossing deck half-width across the track
const APRON_HX = 2.05;
const PANEL_HZ = 2.6;         // ... and along the road
const APRON_TOP = 0.13;

const ROAD_HW = 2.5;          // main road half width away from the crossing

/* A country road NARROWS at its crossing — the verge is pulled in and the
 * two masts stand on it rather than on the carriageway. That is what the
 * throat is for, and it is also what keeps the mast bases off the
 * plan's "crossing mirror" waypoint. */
const roadHalf = (x) => {
  const d = Math.abs(x - TRACK_X);
  return d >= 9 ? ROAD_HW : ROAD_HW - 0.5 * (1 - Math.max(0, d - 2.6) / 6.4);
};

/* The line does not stop, it leaves: over the last FADE_M the entire
 * formation — ballast, sleepers, rails — is carried down together, so the
 * far ends are under the field rather than sawn off in mid-air. */
const dip = (z) => {
  const d = Math.max(0, Math.min(z - RAIL_Z0, RAIL_Z1 - z));
  return d >= FADE_M ? 0 : -0.6 * (1 - d / FADE_M) ** 1.5;
};

function branchLine() {
  const g = new THREE.Group();
  const ballast = [];
  const crown = [];
  const sleepers = [];
  const rails = [];
  const heads = [];

  const SEG = 1;
  for (let z = RAIL_Z0; z < RAIL_Z1 - 1e-6; z += SEG) {
    const zc = z + SEG / 2;
    const y = dip(zc);
    // the bank is a solid mass down into the ground, so the dipping ends
    // stay closed from every angle
    ballast.push(bx(3.7, 0.42, SEG + 0.02, TRACK_X, y + 0.055 - 0.21, zc));
    crown.push(bx(3.0, 0.06, SEG + 0.02, TRACK_X, y + BALLAST_TOP - 0.03, zc));
    for (const s of [-1, 1]) {
      rails.push(bx(0.07, RAIL_TOP - SLEEPER_TOP, SEG + 0.02, TRACK_X + s * GAUGE, y + (RAIL_TOP + SLEEPER_TOP) / 2, zc));
      heads.push(bx(0.085, HEAD_TOP - RAIL_TOP, SEG + 0.02, TRACK_X + s * GAUGE, y + (HEAD_TOP + RAIL_TOP) / 2, zc));
    }
  }
  for (let z = RAIL_Z0 + 0.4; z < RAIL_Z1; z += 0.62) {
    if (Math.abs(z) < PANEL_HZ + 0.2) continue;   // hidden under the deck
    const y = dip(z);
    sleepers.push(bx(2.5, SLEEPER_TOP - 0.03, 0.24, TRACK_X, y + (SLEEPER_TOP + 0.03) / 2, z));
  }

  addMesh(g, ballast, M.stone, { cast: false, name: 'ballast' });
  addMesh(g, crown, M.stonePale, { cast: false, name: 'ballast-crown' });
  addMesh(g, sleepers, M.cedarDark, { name: 'sleepers' });
  addMesh(g, rails, M.joinery, { name: 'rails' });
  addMesh(g, heads, M.stonePale, { cast: false, name: 'railheads' });
  return g;
}

/* ---- the level crossing's timber deck --------------------------------- */

function crossingDeck(ctx) {
  const g = new THREE.Group();
  const D = 2 * PANEL_HZ;
  const inner = [];
  const outer = [];
  const apron = [];

  // between the rails, and outside each rail out to the deck edge
  inner.push(bx(2 * (GAUGE - 0.035), RAIL_TOP + 0.12, D, TRACK_X, (RAIL_TOP - 0.12) / 2, 0));
  for (const s of [-1, 1]) {
    const x0 = GAUGE + 0.035;
    const w = PANEL_HX - x0;
    // planked, in four boards with a 25 mm joint: one box reads as a slab
    for (let i = 0; i < 4; i += 1) {
      const dz = D / 4;
      outer.push(bx(w, RAIL_TOP + 0.12, dz - 0.025, TRACK_X + s * (x0 + w / 2), (RAIL_TOP - 0.12) / 2, -D / 2 + dz * (i + 0.5)));
    }
    apron.push(bx(APRON_HX - PANEL_HX, APRON_TOP + 0.12, D, TRACK_X + s * (PANEL_HX + APRON_HX) / 2, (APRON_TOP - 0.12) / 2, 0));
  }
  addMesh(g, inner, M.cedarDark, { name: 'crossing-inner-baulk' });
  addMesh(g, outer, M.cedar, { name: 'crossing-planks' });
  addMesh(g, apron, M.stone, { cast: false, name: 'crossing-apron' });

  // A made surface, and small enough to be one: 3.2 x 5.2 m of deck plus
  // two 0.45 m gravel aprons that break the step up onto it into 0.13 and
  // 0.10 — the walker climbs 0.38 and would otherwise take one 0.23 lip.
  ctx.platform(TRACK_X - PANEL_HX, -PANEL_HZ, TRACK_X + PANEL_HX, PANEL_HZ, RAIL_TOP);
  for (const s of [-1, 1]) {
    ctx.platform(TRACK_X + s * PANEL_HX, -PANEL_HZ, TRACK_X + s * APRON_HX, PANEL_HZ, APRON_TOP);
  }
  return g;
}

/* ---- the road, its verges and the evidence on it ---------------------- */

function roadDressing(ctx, r) {
  const g = new THREE.Group();
  const shoulder = [];
  const verge = [];
  const kerb = [];

  /* The road edge is a LADDER, not a line: carriageway, then a narrow dark
   * gravel shoulder pinned to the road's own half width, then dry grass
   * whose OUTER edge wanders. Runs butt end to end — an earlier pass
   * jittered both edges and every segment read as a loose paving slab
   * dropped beside the road. */
  for (const s of [-1, 1]) {
    for (let x = -63; x < -26;) {
      const x1 = Math.min(x + r.range(2.2, 4.0), -26);
      const xc = (x + x1) / 2;
      const len = x1 - x + 0.06;
      if (Math.abs(xc - TRACK_X) > APRON_HX + 0.7) {
        const inner = roadHalf(xc) + 0.06;
        const zs = s * (inner + 0.28);
        shoulder.push(bx(len, 0.05, 0.56, xc, ctx.groundAt(xc, zs) + 0.012, zs));
        const gw = r.range(1.0, 1.55);
        const zg = s * (inner + 0.56 + gw / 2);
        verge.push(bx(len, 0.08, gw, xc, ctx.groundAt(xc, zg) + 0.022, zg));
      }
      x = x1;
    }
  }
  addMesh(g, shoulder, M.stone, { cast: false, name: 'road-shoulder' });
  // kerb stones only where the town has bothered: the road head approach
  for (const s of [-1, 1]) {
    for (let x = -44; x < -28; x += 0.86) {
      kerb.push(bx(0.74, 0.22, 0.17, x, ctx.groundAt(x, s * (ROAD_HW + 0.08)) + 0.05, s * (ROAD_HW + 0.08)));
    }
  }
  addMesh(g, verge, M.moss, { cast: false, name: 'road-verge' });
  addMesh(g, kerb, M.stone, { cast: false, name: 'road-kerb' });
  return g;
}

/**
 * The paint band on the road and the path worn from the platform ramp
 * down to it — the two pieces of meso evidence that say this crossing is
 * used, laid at 25 mm proud so they are marks and not kerbs.
 */
function groundMarks(ctx, r) {
  const g = new THREE.Group();
  const paint = [];
  const worn = [];

  // A stop line on each approach, on the near half only: traffic keeps
  // left, so the westbound line is south of the centre and the eastbound
  // line north of it.
  for (const s of [-1, 1]) {
    const x = TRACK_X + s * 3.4;                  // 3.4 m out on each approach
    const hw = roadHalf(x) - 0.14;
    paint.push(bx(0.5, 0.03, hw - 0.16, x, ctx.groundAt(x, (s * hw) / 2) + 0.015, (s * (hw + 0.16)) / 2));
  }
  // centre dashes, skipping the deck
  for (let x = -62; x < -26; x += 4.2) {
    if (Math.abs(x + 0.8 - TRACK_X) < APRON_HX + 0.8) continue;
    paint.push(bx(1.7, 0.03, 0.12, x + 0.85, ctx.groundAt(x + 0.85, 0) + 0.015, 0));
  }
  addMesh(g, paint, M.paper, { cast: false, receive: false, name: 'road-paint' });

  /* Wheel ruts. The carriageway fills a third of every frame taken from
   * the road head, and one flat tone over that much of the picture is a
   * colouring book. Two wandering bands at a light truck's track width,
   * plus the fan of wear where everything slows for the crossing. */
  const ruts = [];
  const fan = [];
  for (const s of [-1, 1]) {
    for (let x = -63; x < -26;) {
      const x1 = Math.min(x + r.range(2.6, 5.5), -26);
      const xc = (x + x1) / 2;
      if (Math.abs(xc - TRACK_X) > PANEL_HX + 0.5 && r.chance(0.82)) {
        // one width, wandering centre: a rut is a worn LINE, and letting the
        // width vary per segment turned it into a row of grey tape
        const z = s * r.range(0.84, 0.94);
        ruts.push(bx(x1 - x + 0.08, 0.02, 0.32, xc, ctx.groundAt(xc, z) + 0.01, z, { ry: r.range(-0.02, 0.02) }));
      }
      x = x1;
    }
  }
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i += 1) {
      const x = TRACK_X + s * (2.6 + i * 1.15);
      const w = 3.6 - i * 0.55;
      fan.push(bx(1.05, 0.02, w, x, ctx.groundAt(x, 0) + 0.008, r.range(-0.25, 0.25)));
    }
  }
  addMesh(g, ruts, M.stone, { cast: false, name: 'road-ruts' });
  addMesh(g, fan, M.cedarPale, { cast: false, name: 'crossing-wear' });

  // the path worn between the ramp foot and the road, twenty years deep
  let px = -53.95;
  for (let z = 4.1; z > 0.4; z -= 0.52) {
    px += r.range(0.02, 0.14);
    worn.push(bx(r.range(0.95, 1.35), 0.025, 0.62, px, ctx.groundAt(px, z) + 0.012, z, { ry: r.range(-0.2, 0.2) }));
  }
  addMesh(g, worn, M.cedarPale, { cast: false, name: 'worn-path' });
  return g;
}

/* ---- the railway boundary fence --------------------------------------- */

/**
 * Post-and-wire along the lineside, gapped at the road. It is 0.95 m of
 * nothing much, and it is what turns the middle ground either side of the
 * track from empty floor into a place with a boundary — three converging
 * lines that carry the eye out of the parcel the way the line itself does.
 * One swept collider per run: a swept fence needs a swept collider.
 */
function lineFence(ctx, x, z0, z1, posts, wires) {
  const H = 0.95;
  for (let z = z0; z <= z1 + 1e-6; z += 2.4) {
    posts.push(bx(0.09, H + SINK, 0.09, x, ctx.groundAt(x, z) + (H - SINK) / 2, z));
  }
  const zc = (z0 + z1) / 2;
  const y0 = ctx.groundAt(x, zc);
  for (const h of [0.36, 0.63, 0.9]) wires.push(bx(0.03, 0.03, z1 - z0, x, y0 + h, zc));
  ctx.collide(x - 0.08, z0, x + 0.08, z1);
}

function linesideFences(ctx) {
  const g = new THREE.Group();
  const posts = [];
  const wires = [];
  for (const x of [TRACK_X + 2.8, TRACK_X - 2.8]) lineFence(ctx, x, -24, -5, posts, wires);
  lineFence(ctx, TRACK_X + 2.8, 5, 21, posts, wires);
  addMesh(g, posts, M.cedarDark, { name: 'lineside-posts' });
  addMesh(g, wires, M.joinery, { cast: false, name: 'lineside-wires' });
  return g;
}

/* ---- the convex traffic mirror ---------------------------------------- */

/**
 * カーブミラー: a galvanised post with a hooded convex disc tilted down at
 * the crossing. Built from pole and disc, and the tilt lives on the head
 * group so the disc's own axis is never a guessed rotation.
 */
function trafficMirror(ctx, x, z, ry) {
  const g = new THREE.Group();
  const H = 2.35;
  addMesh(g, [
    cyl(0.055, 0.075, H + SINK, 8, 0, (H - SINK) / 2, 0),
    bx(0.22, 0.07, 0.2, 0, H - 0.05, 0.08),
  ], M.joinery, { name: 'mirror-post' });

  const head = new THREE.Group();
  // the frame and hood behind, the convex face in front — a truncated cone
  // with the smaller radius forward is a convex mirror in two triangles' worth
  addMesh(head, [
    cyl(0.46, 0.46, 0.07, 20, 0, 0, -0.03, { rx: Math.PI / 2 }),
    bx(0.16, 0.2, 0.1, 0, -0.4, -0.02),
  ], M.tile, { name: 'mirror-frame' });
  // the face is the brightest thing on the post — a convex mirror is a
  // disc of sky, and in M.stonePale it read as a dark blot from the road
  addMesh(head, [cyl(0.33, 0.41, 0.09, 20, 0, 0, 0.05, { rx: Math.PI / 2 })], M.paper,
    { cast: false, name: 'mirror-face' });
  head.position.set(0, H + 0.38, 0.1);
  head.rotation.x = -0.28;
  g.add(head);

  g.position.set(x, 0, z);
  seatOnGround(g, ctx.groundAt);
  g.rotation.y = ry;
  g.userData.prop = true;
  ctx.collide(x - 0.22, z - 0.22, x + 0.22, z + 0.22);
  return g;
}

/* ---- the railway telegraph line and its sky band ---------------------- */

const POLE_X = -57.8;
const POLE_Z = [-14, -4, 6.5, 15.5];

function telegraphLine(ctx) {
  const g = new THREE.Group();
  const timber = [];
  const iron = [];
  const wires = [];
  const H = 5.4;
  const ARM_Y = 4.82;
  const OFF = [-0.62, -0.21, 0.21, 0.62];

  for (const z of POLE_Z) {
    const y0 = ctx.groundAt(POLE_X, z);
    timber.push(cyl(0.085, 0.125, H + SINK, 7, POLE_X, y0 + (H - SINK) / 2, z));
    timber.push(bx(1.5, 0.09, 0.1, POLE_X, y0 + ARM_Y - 0.09, z));
    timber.push(bx(0.09, 0.5, 0.09, POLE_X, y0 + ARM_Y - 0.36, z, { rz: 0.5 }));
    for (const o of OFF) iron.push(cyl(0.038, 0.038, 0.17, 5, POLE_X + o, y0 + ARM_Y + 0.05, z));
    ctx.collide(POLE_X - 0.16, z - 0.16, POLE_X + 0.16, z + 0.16);
  }
  // Real sag between real anchors: the sky band over the west verge is the
  // one place this district owns overhead, and an empty gradient there is
  // dead canvas.
  for (let i = 0; i < POLE_Z.length - 1; i += 1) {
    const za = POLE_Z[i];
    const zb = POLE_Z[i + 1];
    const ya = ctx.groundAt(POLE_X, za) + ARM_Y + 0.13;
    const yb = ctx.groundAt(POLE_X, zb) + ARM_Y + 0.13;
    for (const o of OFF) {
      const N = 6;
      const at = (t) => [POLE_X + o, ya + (yb - ya) * t - 0.34 * 4 * t * (1 - t), za + (zb - za) * t];
      for (let k = 0; k < N; k += 1) wires.push(member(at(k / N), at((k + 1) / N), 0.022, 4));
    }
  }
  addMesh(g, timber, M.cedarDark, { name: 'telegraph-poles' });
  addMesh(g, iron, M.stonePale, { cast: false, name: 'telegraph-insulators' });
  const wire = addMesh(g, wires, M.joinery, { cast: false, receive: false, name: 'telegraph-wires' });
  if (wire) wire.userData.airborne = true;
  return g;
}

/* ---- the fields west of the line -------------------------------------- */

/**
 * The surrounds are the terrain's; this is the light scatter that stops
 * the west edge of the frame being a flat green card — paddy-edge posts
 * and dry grass tufts, two merged meshes, seated by query.
 */
function fieldEdge(ctx, r) {
  const g = new THREE.Group();
  const tufts = [];
  const posts = [];
  for (let i = 0; i < 18; i += 1) {
    const x = r.range(-70, -59);
    const z = r.range(-16, 14);
    const y = ctx.groundAt(x, z);
    for (let k = 0, n = r.int(2, 3); k < n; k += 1) {
      const h = r.range(0.22, 0.44);
      tufts.push(bx(r.range(0.18, 0.34), h, r.range(0.16, 0.3),
        x + r.range(-0.35, 0.35), y + h / 2 - 0.03, z + r.range(-0.35, 0.35), { ry: r.range(0, 1.5) }));
    }
  }
  for (let i = 0; i < 7; i += 1) {
    const x = r.range(-69, -60);
    const z = r.range(-15, 13);
    const y = ctx.groundAt(x, z);
    const h = r.range(0.8, 1.15);
    posts.push(bx(0.1, h + SINK, 0.1, x, y + (h - SINK) / 2, z, { rz: r.range(-0.09, 0.09) }));
  }
  addMesh(g, tufts, M.moss, { cast: false, name: 'field-tufts' });
  addMesh(g, posts, M.cedarDark, { name: 'paddy-posts' });
  return g;
}

/* ---- the halt --------------------------------------------------------- */

/* ry = +PI/2 turns the halt's local +z (its track side) to world +x, so
 * the platform faces the line at x = -50 and its ramp lands at the NORTH
 * end — the end nearest the road, which is where the path is worn. */
const HALT = Object.freeze({ seed: 4, ry: Math.PI / 2, len: 10, w: 3.0, hutW: 2.2, hutD: 1.5 });
const HALT_AT = Object.freeze([-53.7, 10.5]);

/** The kit's notice board mesh — a Mesh, because the runtime raycast is
 *  non-recursive and a Group is never hit. The name board is 2 m wide and
 *  the notice 0.52 m, so the width separates them without a magic index. */
function haltNoticeMesh(halt) {
  let found = null;
  halt.traverse((o) => {
    if (o.isMesh && o.userData.signH && (o.geometry?.parameters?.width ?? 9) < 1) found = o;
  });
  if (!found) {
    throw new Error('[crossing-gate] stationHalt no longer exposes a printed notice panel — ' +
      'the plan\'s interaction "read the halt notice board" has nothing to hang on. Report the kit change.');
  }
  return found;
}

export default defineDistrict({
  id: 'crossing-gate',
  envelope: { x0: -65, z0: -18, x1: -25, z1: 16 },

  build(ctx) {
    const r = rng(31);

    /* --- the line, and the road's crossing of it --------------------- */
    ctx.add(branchLine(), 'branch-line');
    ctx.add(crossingDeck(ctx), 'crossing-deck');
    ctx.add(roadDressing(ctx, r), 'road-dressing');
    ctx.add(linesideFences(ctx), 'lineside-fence');
    ctx.add(groundMarks(ctx, r), 'ground-marks');

    /* --- the halt: deck and ramp are SURFACES, hut/fence/board are not */
    const [hx, hz] = HALT_AT;
    const halt = stationHalt(HALT);
    halt.position.set(hx, ctx.groundAt(hx, hz), hz);
    ctx.add(halt, 'halt');
    for (const f of stationHalt.footprint(HALT)) ctx.collide(hx + f.x0, hz + f.z0, hx + f.x1, hz + f.z1);
    for (const s of stationHalt.surfaces(HALT)) ctx.platform(hx + s.x0, hz + s.z0, hx + s.x1, hz + s.z1, s.top);

    /* --- the crossing itself: barriers UP, twenty minutes after the
     *     last train. Masts diagonally opposite, each facing the traffic
     *     it warns; `lowered: false` also keeps the arm out of the
     *     footprint, so the road socket stays open.                     */
    const masts = [
      { at: [-47, -2.0], ry: Math.PI / 2, h: 5.0, name: 'crossing-signal' },      // town side, faces east
      { at: [-53, 2.0], ry: -Math.PI / 2, h: 4.6, name: 'crossing-signal-west' }, // field side, faces west
    ];
    for (const m of masts) {
      const o = { seed: m.name === 'crossing-signal' ? 1 : 5, ry: m.ry, h: m.h, lowered: false };
      const sig = crossingSignal(o);
      sig.position.set(m.at[0], ctx.groundAt(m.at[0], m.at[1]), m.at[1]);
      ctx.add(sig, m.name);
      for (const f of crossingSignal.footprint(o)) {
        ctx.collide(m.at[0] + f.x0, m.at[1] + f.z0, m.at[0] + f.x1, m.at[1] + f.z1);
      }
    }

    /* --- the mirror that lets a driver see up the line ---------------- */
    ctx.add(trafficMirror(ctx, -45.8, -4.2, Math.atan2(15.8, 4.7)), 'traffic-mirror');

    /* --- one bicycle, left against the platform fence ----------------- */
    const rackAt = [-57.4, 12.5];
    const rackOpts = { seed: 6, ry: Math.PI / 2, slots: 4, bikes: 1 };
    const rack = postRack(rackOpts);
    rack.position.set(rackAt[0], 0, rackAt[1]);
    seatOnGround(rack, ctx.groundAt);
    ctx.add(rack, 'halt-bicycles');
    for (const f of postRack.footprint(rackOpts)) {
      ctx.collide(rackAt[0] + f.x0, rackAt[1] + f.z0, rackAt[0] + f.x1, rackAt[1] + f.z1);
    }

    /* --- overhead and the fields -------------------------------------- */
    ctx.add(telegraphLine(ctx), 'telegraph-line');
    ctx.add(fieldEdge(ctx, r), 'field-edge');

    /* --- THE INTERACTION ---------------------------------------------
     * The 宵祭 poster is the town's invitation, and reading it is the one
     * verb this district owns. The reaction is small on purpose: the
     * paper lifts off its board and catches the low sun, the way a pinned
     * notice does when someone leans in. */
    const notice = haltNoticeMesh(halt);
    notice.name = 'halt-notice-poster';
    const rest = { rx: notice.rotation.x, z: notice.position.z };
    const mat = notice.material;
    const emissive0 = mat.emissive ? mat.emissive.clone() : null;
    let t = 0;
    const settle = () => {
      notice.rotation.x = rest.rx;
      notice.position.z = rest.z;
      if (emissive0) mat.emissive.copy(emissive0);
    };
    ctx.update((dt) => {
      if (t <= 0) return;
      t = Math.max(0, t - dt / 1.15);
      const c = Math.sin(t * Math.PI) ** 2;
      notice.rotation.x = rest.rx - 0.3 * c;
      notice.position.z = rest.z + 0.11 * c;
      if (emissive0) {
        mat.emissive.setRGB(emissive0.r + 0.34 * c, emissive0.g + 0.3 * c, emissive0.b + 0.2 * c);
      }
      if (t === 0) settle();
    });
    ctx.reset(() => { t = 0; settle(); });
    ctx.interact({
      name: 'read the halt notice board',
      label: 'read the halt notice board',
      hitbox: notice,
      action: () => { t = 1; },
    });
  },
});
