import * as THREE from 'three';
import { defineDistrict } from '../core/district.js';
import { wallRun, bench, leanTo, seatOnGround } from '../builders.js';
import {
  M, SINK, ASPECT, rng, bx, cyl, addMesh, board, practical, lanternRig, asProp,
  machiya, stoneLantern, lanternString, postRack, warningNotice,
} from '../kit/index.js';

/* ------------------------------------------------------------------ *
 * 宵坂通り — the market street.
 *
 * Seven machiya face each other across the town's one real street at the
 * hour the shopkeepers light up before closing.  Everything here is
 * arranged around ONE geometric fact: the plan's `street-spine` corridor
 * runs from (-30, 0) to (22, 2) with a half width of 2.4 m and 4.5 m of
 * clear head — the long look from the crossing road-head to the yagura.
 * So the two rows are the walls of that slot and NOTHING of ours may
 * cross y = 4.5 inside it:
 *
 *   corridor centre z(x) = (x + 30) / 26, band = z(x) ± 2.4
 *     x = -25 -> -2.21 .. 2.59      x = 10 -> -0.86 .. 3.94
 *     x =   0 -> -1.25 .. 3.55      x = 18 -> -0.55 .. 4.25
 *
 * The north frontage line is z = -4.85 and the south is z = +5.85, which
 * clears the widest band by 1.4 m / 1.6 m with the hisashi eaves counted
 * in.  The two lantern strings are hung ABOVE the corridor instead —
 * anchor 5.65 m, sag 0.42 m, so the lowest lantern cap sits at 4.73 m,
 * 0.23 m over the ray.  Hanging them at the "natural" 4.2 m would have
 * read beautifully and failed the corridor at four of five offsets.
 *
 * The frontage lines are also what puts the plan's four door waypoints
 * where they belong: machiya's `door` joint is 0.55 m proud of the
 * frontage, the waypoint stands 0.30 m proud of that, so an NPC on the
 * quest node has 0.51 m of clear ground to the inflated shopfront
 * collider and 1.5 m of clear ground in every other direction.  The four
 * quest shops carry seeds whose crate roll is ZERO (machiya seeds 0-2
 * crates 0.85-1.15 m in front of its own frontage — i.e. exactly on the
 * NPC stand); their crates are placed by hand, off to the side.
 *
 * Two gaps in the rows are routes, not accidents: x -6.9 .. -1.1 on the
 * north side is the shrine approach to socket mk-shrine-n at (0, -14),
 * and the ground west of the dagashi is the way down to mk-canal-s at
 * (-8, 16).  The south boundary wall stops at x = -16.2 to leave that
 * second one open.
 * ------------------------------------------------------------------ */

const NORTH_FRONT = -4.85;   // frontage plane of the north row (faces +z)
const SOUTH_FRONT = 5.85;    // frontage plane of the south row (faces -z)

/* The seven tenants, west to east.  Widths, depths, wall heights and
 * pitches are all authored rather than seeded: a row of seven built from
 * one generator has to be unequal ON PURPOSE, and ridge heights spread
 * 5.99 .. 6.90 m is what gives the high orbit shot a roofline instead of
 * a hedge.  `seed` picks the open door bay and the crate roll only. */
const SHOPS = [
  // north row — faces south (+z), ry = 0
  { tenant: 'soba', side: 'n', x: -18.0, w: 6.8, d: 5.2, wallTop: 5.35, pitch: 0.44, seed: 3, noren: true, lantern: true },
  { tenant: 'rice', side: 'n', x: -9.8, w: 5.8, d: 4.8, wallTop: 4.70, pitch: 0.50, seed: 25, noren: false, lantern: true },
  { tenant: 'hardware', side: 'n', x: 2.0, w: 6.2, d: 5.4, wallTop: 5.55, pitch: 0.46, seed: 13, noren: false, lantern: true },
  { tenant: 'pharmacy', side: 'n', x: 11.6, w: 5.6, d: 4.6, wallTop: 4.85, pitch: 0.52, seed: 7, noren: true, lantern: false },
  // south row — faces north (-z), ry = PI
  { tenant: 'dagashi', side: 's', x: -8.0, w: 6.4, d: 5.0, wallTop: 5.05, pitch: 0.48, seed: 4, noren: true, lantern: true },
  { tenant: 'florist', side: 's', x: 0.6, w: 5.6, d: 4.6, wallTop: 4.75, pitch: 0.50, seed: 21, noren: true, lantern: true },
  { tenant: 'kissaten', side: 's', x: 10.2, w: 7.0, d: 5.5, wallTop: 5.60, pitch: 0.44, seed: 1, noren: true, lantern: true },
];

/** Place one machiya from its row and register its footprint. */
function shopfront(ctx, s) {
  const north = s.side === 'n';
  const z = north ? NORTH_FRONT - s.d / 2 : SOUTH_FRONT + s.d / 2;
  const opts = {
    seed: s.seed, tenant: s.tenant, w: s.w, d: s.d, ry: north ? 0 : Math.PI,
    wallTop: s.wallTop, pitch: s.pitch, noren: s.noren, lantern: s.lantern,
  };
  const g = machiya(opts);
  g.position.set(s.x, ctx.groundAt(s.x, z), z);
  ctx.add(g, `shop-${s.tenant}`);
  for (const r of machiya.footprint(opts)) ctx.collide(s.x + r.x0, z + r.z0, s.x + r.x1, z + r.z1);
  return { group: g, x: s.x, z, ...s };
}

/**
 * A stack of delivery crates: two or three on the ground, one or two
 * squared up on top, all seeded.  These are the crates being carried in,
 * so they are real obstacles and they collide — which is why every one of
 * them is placed at least 1.6 m to the SIDE of a door waypoint.
 */
function crateStack(ctx, x, z, seed, { ry = 0, collide = true, parent = null } = {}) {
  const r = rng(seed + 61);
  const g = new THREE.Group();
  const geoms = [];
  const base = r.int(2, 3);
  const cw = r.range(0.5, 0.62);
  let widest = 0;
  for (let i = 0; i < base; i += 1) {
    const w = cw + r.range(-0.05, 0.05);
    const px = (i - (base - 1) / 2) * (cw + 0.06);
    geoms.push(bx(w, w * 0.72, w * 0.86, px, (w * 0.72) / 2 - SINK, r.range(-0.05, 0.05), { ry: r.range(-0.13, 0.13) }));
    widest = Math.max(widest, Math.abs(px) + w / 2);
  }
  const top = r.int(1, 2);
  for (let i = 0; i < top; i += 1) {
    const w = cw * r.range(0.82, 0.96);
    const px = (i - (top - 1) / 2) * (cw + 0.05);
    geoms.push(bx(w, w * 0.7, w * 0.84, px, cw * 0.72 + (w * 0.7) / 2 - 0.02, r.range(-0.06, 0.06), { ry: r.range(-0.22, 0.22) }));
  }
  addMesh(g, geoms, M.cedarPale, { name: 'crates' });
  // lid slats, so a crate is a crate and not a beige brick
  const slats = [];
  for (let i = 0; i < base; i += 1) {
    const px = (i - (base - 1) / 2) * (cw + 0.06);
    slats.push(bx(cw + 0.04, 0.04, 0.08, px, cw * 0.72 - 0.02, 0.0));
  }
  addMesh(g, slats, M.cedarDark, { cast: false, name: 'crate-slats' });

  g.rotation.y = ry;
  /* Crates stacked INSIDE another assembly (the goods bay) are that
   * assembly's own contents — parent them, or the audit reads a stack
   * standing in a lean-to as two units interpenetrating by 99 %. */
  if (parent) {
    g.position.set(x - parent.position.x, ctx.groundAt(x, z) - parent.position.y, z - parent.position.z);
    parent.add(g);
    return g;
  }
  g.position.set(x, ctx.groundAt(x, z), z);
  asProp(g, 'crateStack');
  ctx.add(g, `crates-${seed}`);
  if (collide) {
    const hx = Math.abs(Math.cos(ry)) * widest + Math.abs(Math.sin(ry)) * 0.42;
    const hz = Math.abs(Math.sin(ry)) * widest + Math.abs(Math.cos(ry)) * 0.42;
    ctx.collide(x - hx, z - hz, x + hx, z + hz);
  }
  return g;
}

/**
 * 夜間立入注意 — the town's one visible admission, on two posts under a
 * small board cap.  The kit owns the FACE (signage.warningNotice at its
 * native 3:4); the carcass is four boxes, which is what a notice board
 * is.  Faces local +z, so `ry` aims it.
 */
function noticePost(ctx, x, z, ry) {
  const g = new THREE.Group();
  const W = 0.9;
  const face = board(g, warningNotice(), W, ASPECT.notice, { at: [0, 1.66, 0.05], mat: M.cedarDark });
  const h = face.userData.signH;
  const top = 1.66 + h / 2;
  const frame = [];
  for (const s of [-1, 1]) frame.push(bx(0.1, top + 0.12 + SINK, 0.1, s * (W / 2 + 0.03), (top + 0.12 - SINK) / 2, 0));
  frame.push(bx(W + 0.34, 0.09, 0.3, 0, top + 0.16, 0.02));   // cap
  frame.push(bx(W + 0.16, 0.08, 0.12, 0, 1.66 - h / 2 - 0.09, 0.02));
  addMesh(g, frame, M.cedar, { name: 'notice-frame' });
  g.rotation.y = ry;
  g.position.set(x, ctx.groundAt(x, z), z);
  asProp(g, 'noticePost');
  ctx.add(g, 'night-notice');
  const c = Math.abs(Math.cos(ry));
  const s = Math.abs(Math.sin(ry));
  ctx.collide(x - (c * 0.58 + s * 0.16), z - (s * 0.58 + c * 0.16), x + (c * 0.58 + s * 0.16), z + (s * 0.58 + c * 0.16));
  return g;
}

/**
 * 雨戸 — storm boards taken down and stood against a wall, which is what
 * "half the shutters are still up" looks like at ground level.  Left
 * UNTAGGED on purpose: they lean on a shopfront and belong to it, and a
 * separate audit unit standing inside a machiya's bbox is an overlap
 * failure that says nothing true.  Faces local +z; `ry` aims the lean.
 */
function leanBoards(ctx, x, z, ry, seed, n = 3) {
  const r = rng(seed + 5);
  const g = new THREE.Group();
  const boards = [];
  for (let i = 0; i < n; i += 1) {
    const h = r.range(1.55, 1.9);
    const tilt = r.range(0.13, 0.2);
    boards.push(bx(r.range(0.42, 0.56), h, 0.055, r.range(-0.5, 0.5) + i * 0.14,
      (h / 2) * Math.cos(tilt) - SINK, (h / 2) * Math.sin(tilt) + 0.06, { rx: tilt }));
  }
  addMesh(g, boards, M.cedarDark, { name: 'amado' });
  g.rotation.y = ry;
  g.position.set(x, ctx.groundAt(x, z), z);
  ctx.add(g, `amado-${seed}`);
  return g;
}

/** Kerb bands, the gutter and the shrine-lane stepping stones. */
function dressGround(ctx) {
  const g = new THREE.Group();

  /* Kerb bands along both road edges, coursed rather than extruded, and
   * BROKEN where a route leaves the street: the north band opens for the
   * shrine approach, the south band for the alley to the canal lane. */
  const slabs = [];
  const runs = [
    [-25, -7.0, -2.62], [-1.0, 18, -2.62],
    [-25, -4.6, 2.62], [-2.0, 18, 2.62],
  ];
  for (const [x0, x1, z] of runs) {
    const n = Math.max(2, Math.round((x1 - x0) / 1.15));
    for (let i = 0; i < n; i += 1) {
      const a = x0 + ((x1 - x0) * i) / n;
      const b = x0 + ((x1 - x0) * (i + 1)) / n;
      const h = 0.075 + (i % 3) * 0.009;
      slabs.push(bx(b - a - 0.05, h + SINK, 0.52, (a + b) / 2, (h - SINK) / 2, z));
    }
  }
  addMesh(g, slabs, M.stonePale, { cast: false, name: 'street-kerb' });

  /* The gutter, north side only — a street is not symmetrical. */
  const drain = [];
  for (let x = -24.2; x < 17.2; x += 0.92) {
    drain.push(bx(0.88, 0.05, 0.36, x + 0.46, 0.0, -2.06));
  }
  addMesh(g, drain, M.stoneDeep, { cast: false, name: 'street-drain' });
  const grates = [];
  for (let x = -21.5; x < 17; x += 5.6) {
    for (let i = 0; i < 5; i += 1) grates.push(bx(0.62, 0.045, 0.035, x, 0.015, -2.06 - 0.14 + i * 0.07));
  }
  addMesh(g, grates, M.joinery, { cast: false, name: 'street-grates' });

  /* The shrine approach: stepping stones off the street, through the gap
   * in the north row, bending east to the mk-shrine-n socket at (0, -14).
   * The gap in the row is a route; the stones say so from the street. */
  const path = [];
  const pts = [
    [-4.0, -2.9], [-4.0, -4.0], [-4.05, -5.2], [-4.0, -6.4], [-3.95, -7.6],
    [-3.9, -8.8], [-3.7, -10.0], [-3.2, -11.0], [-2.3, -11.7], [-1.2, -12.2],
    [-0.4, -12.8], [0.0, -13.6],
  ];
  const pr = rng(9);
  for (const [px, pz] of pts) {
    path.push(bx(pr.range(0.78, 0.98), 0.07 + SINK, pr.range(0.6, 0.76), px, (0.07 - SINK) / 2, pz, { ry: pr.range(-0.2, 0.2) }));
  }
  addMesh(g, path, M.stonePale, { cast: false, name: 'shrine-lane-stones' });

  ctx.add(g, 'street-paving');
  return g;
}

/** A boarded shutter pulled down over a shopfront that is closing. */
function shutterDown(ctx, shop) {
  const g = new THREE.Group();
  const zf = shop.d / 2;
  const boards = [];
  const n = Math.max(4, Math.round((shop.w - 0.36) / 0.42));
  for (let i = 0; i < n; i += 1) {
    const x0 = -(shop.w - 0.36) / 2 + ((shop.w - 0.36) * i) / n;
    const x1 = -(shop.w - 0.36) / 2 + ((shop.w - 0.36) * (i + 1)) / n;
    boards.push(bx(x1 - x0 - 0.02, 1.86, 0.07, (x0 + x1) / 2, 1.02, zf + 0.02));
  }
  boards.push(bx(shop.w - 0.3, 0.1, 0.11, 0, 1.99, zf + 0.02));
  addMesh(g, boards, M.cedarDark, { name: 'shutter' });
  g.rotation.y = shop.side === 'n' ? 0 : Math.PI;
  g.position.set(shop.x, ctx.groundAt(shop.x, shop.z), shop.z);
  ctx.add(g, `shutter-${shop.tenant}`);
  return g;
}

export default defineDistrict({
  id: 'market-street',
  envelope: { x0: -25, z0: -14, x1: 18, z1: 16 },
  build(ctx) {
    /* ---- 1. the ground the street already has, dressed ------------- */
    dressGround(ctx);

    /* ---- 2. the seven shopfronts ----------------------------------- */
    const built = {};
    for (const s of SHOPS) built[s.tenant] = shopfront(ctx, s);

    // two shops are already boarding up — that is what "half the shutters
    // are still up" looks like from the other half's point of view
    shutterDown(ctx, built.rice);
    shutterDown(ctx, built.pharmacy);

    /* ---- 3. the interaction the plan names -------------------------
     * "shop door chime at the dagashi shop" at (-8, 5).  The hitbox is
     * machiya's own glazing MESH (the runtime raycasts hitboxes
     * non-recursively, so a Group would never be hit); the reaction
     * slides that door leaf ajar and sets the doorway lantern swinging.
     * The lantern is moved, never re-materialled: M.glow is one shared
     * material and dimming it would dim every lantern in the town. */
    const dagashi = built.dagashi.group;
    const doorLeaf = dagashi.userData.interact.hitbox;
    const doorLantern = dagashi.getObjectByName('machiya-lantern');
    let chime = -1;
    const rest = () => {
      doorLeaf.position.x = 0;
      if (doorLantern) doorLantern.position.set(0, 0, 0);
    };
    ctx.interact({
      name: 'shop door chime at the dagashi shop',
      label: 'Slide the door at 駄菓子 ほしや',
      verb: 'open',
      hitbox: doorLeaf,
      action: () => { chime = 0; },
    });
    ctx.update((dt) => {
      if (chime < 0) return;
      chime += dt;
      const SPAN = 3.2;
      const open = Math.min(chime / 0.4, 1) * (chime > 2.4 ? Math.max(0, (SPAN - chime) / 0.8) : 1);
      doorLeaf.position.x = -0.36 * open;
      if (doorLantern) {
        const decay = Math.exp(-chime * 1.05);
        doorLantern.position.x = 0.075 * Math.sin(chime * 8.4) * decay;
        doorLantern.position.y = -0.03 * (1 - Math.cos(chime * 16.8)) * decay;
      }
      if (chime > SPAN) { chime = -1; rest(); }
    });
    ctx.reset(() => { chime = -1; rest(); });

    /* ---- 4. the kissaten's amber ------------------------------------
     * The plan gives the shopfronts and the festival ground the amber,
     * and this is the shop the brief says is already spilling it: three
     * extra lanterns under the hisashi and a lit interior behind the
     * glazing, all PRACTICALS so the night pass finds them. */
    const kissaten = built.kissaten;
    const amber = new THREE.Group();
    const kz = SOUTH_FRONT - 0.5;
    lanternRig(amber, [-2.3, -0.5, 1.6].map((dx) => [kissaten.x + dx, 3.28, kz]),
      { r: 0.18, h: 0.38, cord: 0.16, radius: 5.5, name: 'kissaten-lantern' });
    /* The lit interior sits 0.5 m BEHIND the glazing plane (world z 5.93
     * for a row that faces -z), not on it: a glow slab in front of the
     * glass reads as an orange card stuck to the shopfront, which is
     * exactly what the first review frame showed. */
    const inside = addMesh(amber, [
      bx(kissaten.w - 1.6, 1.45, 0.07, kissaten.x, 1.24, SOUTH_FRONT + 0.55),
      bx(kissaten.w - 2.8, 0.09, 0.7, kissaten.x, 2.26, SOUTH_FRONT + 0.75),
    ], M.glow, { cast: false, receive: false, name: 'kissaten-interior' });
    practical(inside, { radius: 7 });
    amber.userData.airborne = true;
    ctx.add(amber, 'kissaten-glow');

    /* ---- 5. the strings, hung OVER the sight corridor ---------------
     * Two heights, and the difference is measured, not stylistic.  The
     * `main-street-east` vista shoots from (-30, 2, 0) at the yagura's
     * upper mass, so its ray CLIMBS across this parcel: y = 3.7 at the
     * west string's x = -8.6, but y = 5.28 at the east string's x = 10.6,
     * where a cord sagging to 5.23 blocked the town's own landmark
     * contract by five centimetres.  The east string is therefore hung
     * 0.5 m higher — cord low point 5.75, still 0.7 m of clearance over
     * the ray, and its lowest lantern cap at 5.23 m is 0.73 m over the
     * street-spine corridor's 4.5 m head.  The west string is untouched:
     * it is the near arc in the arrival frame and the ray is 1.5 m under
     * it there. */
    for (const [x, seed, height] of [[-8.6, 5, 5.65], [10.6, 2, 6.15]]) {
      const opts = { seed, span: 8.6, height, sag: 0.40, count: 6, masts: false, ry: Math.PI / 2 };
      const str = lanternString(opts);
      str.position.set(x, ctx.groundAt(x, 0.5), 0.5);
      ctx.add(str, `lantern-string-${seed}`);
    }

    /* ---- 6. street furniture ---------------------------------------
     * The south side west of the dagashi is the quiet stretch: a
     * boundary wall gives the west approach its edge, and it STOPS at
     * x = -16.2 so the way down to the canal lane stays open. */
    ctx.add(wallRun({
      points: [[-23.4, 5.4], [-16.2, 5.4]], h: 1.55, thick: 0.34, piers: 3.6,
      mat: M.plasterShade, copingMat: M.tile, ctx,
    }), 'south-yard-wall');

    const rackOpts = { seed: 6, len: 2.6, slots: 4, bikes: 3 };
    const rack = postRack(rackOpts);
    rack.position.set(-19.0, ctx.groundAt(-19.0, 4.15), 4.15);
    ctx.add(rack, 'bicycles');
    for (const r of postRack.footprint(rackOpts)) {
      ctx.collide(-19.0 + r.x0, 4.15 + r.z0, -19.0 + r.x1, 4.15 + r.z1);
    }

    ctx.add(bench({
      w: 1.7, at: [-21.9, ctx.groundAt(-21.9, 4.2), 4.2], facing: [0, -1], mat: M.cedar, ctx,
    }), 'street-bench');

    /* The two toro that mark the shrine approach off the street.  They
     * stand at z = -3.15, clear of the row's own eave line at -3.635:
     * a prop tucked under a hisashi audits as interpenetrating it. */
    for (const [x, seed, size] of [[-5.75, 8, 'large'], [-2.15, 12, 'small']]) {
      const opts = { seed, size, ry: seed * 0.4 };
      const t = stoneLantern(opts);
      t.position.set(x, ctx.groundAt(x, -3.15), -3.15);
      ctx.add(t, `toro-${seed}`);
      for (const r of stoneLantern.footprint(opts)) ctx.collide(x + r.x0, -3.15 + r.z0, x + r.x1, -3.15 + r.z1);
    }

    /* The goods bay: the vending lean-to in the gap between the hardware
     * shop and the pharmacy, stacked with crates.  It fills a slot that
     * would otherwise read as a missing tooth in the north row. */
    const bay = leanTo({
      w: 1.9, d: 1.5, h: 2.25, open: 'z+', at: [6.95, ctx.groundAt(6.95, -4.2), -4.2],
      mat: M.cedar, roofMat: M.tilePale, ctx,
    });
    crateStack(ctx, 6.95, -4.45, 31, { ry: 0.1, parent: bay });
    ctx.add(bay, 'goods-bay');

    /* Crates being carried in — beside three doors, never in front of
     * one: the door waypoints are NPC stands and quest nodes.  They also
     * stand clear of the eave line for the same reason the toro do. */
    crateStack(ctx, -20.6, -3.0, 17, { ry: 0.18 });
    crateStack(ctx, -10.5, 4.25, 23, { ry: -0.5 });
    crateStack(ctx, 4.7, -3.2, 44, { ry: 0.6 });

    /* Bicycles in the slot between the florist and the kissaten, and a
     * second cluster with a bench at the east mouth: the two stretches
     * the first review frames showed as bare road either side of the
     * reveal.  Both stand SOUTH of the sight corridor's south edge
     * (z(x) + 2.4), which is 3.75 m at x = 5 and 4.15 m at x = 15.5. */
    const rack2Opts = { seed: 14, len: 2.2, slots: 3, bikes: 2 };
    const rack2 = postRack(rack2Opts);
    rack2.position.set(5.05, ctx.groundAt(5.05, 4.95), 4.95);
    ctx.add(rack2, 'bicycles-kissaten');
    for (const r of postRack.footprint(rack2Opts)) {
      ctx.collide(5.05 + r.x0, 4.95 + r.z0, 5.05 + r.x1, 4.95 + r.z1);
    }

    ctx.add(bench({
      w: 1.5, at: [17.3, ctx.groundAt(17.3, 4.4), 4.4], facing: [-0.5, -1], mat: M.cedar, ctx,
    }), 'east-bench');
    crateStack(ctx, 15.5, 5.15, 52, { ry: -0.3 });

    // storm boards down: against the dagashi's west gable, which the west
    // approach reads as one blank plaster card, and by the hardware door
    leanBoards(ctx, -11.55, 7.6, -Math.PI / 2, 33);
    leanBoards(ctx, 5.35, -4.5, 0, 41, 2);

    /* 夜間立入注意 at the east mouth, turned to face the festival ground
     * — three-quarter on to a player walking east, so it is readable on
     * the way to the thing it warns about. */
    noticePost(ctx, 15.6, -3.55, 0.85);

    /* ---- 7. two potted plants at the soba door, seated by query ----- */
    const pots = new THREE.Group();
    const pr = rng(77);
    const potGeoms = [];
    for (const [px, pz] of [[-15.2, -4.35], [-14.75, -4.2], [-3.15, 5.2]]) {
      const y = ctx.groundAt(px, pz);
      potGeoms.push(cyl(0.16, 0.13, 0.3, 7, px, y + 0.15 - SINK, pz));
      potGeoms.push(cyl(0.19, 0.05, 0.34, 6, px, y + 0.44 + pr.range(0, 0.05), pz));
    }
    addMesh(pots, potGeoms.filter((_, i) => i % 2 === 0), M.stonePale, { name: 'pots' });
    addMesh(pots, potGeoms.filter((_, i) => i % 2 === 1), M.moss, { name: 'pot-plants' });
    ctx.add(pots, 'door-pots');

    // one crate left on the kerb outside the florist, seated by query
    const lone = new THREE.Group();
    addMesh(lone, [bx(0.56, 0.4, 0.46, 0, 0.2, 0, { ry: 0.24 })], M.cedarPale, { name: 'kerb-crate' });
    lone.position.set(3.3, 0, 4.15);
    asProp(lone, 'crate');
    if (seatOnGround(lone, ctx.groundAt)) ctx.add(lone, 'kerb-crate');
    ctx.collide(3.3 - 0.36, 4.15 - 0.32, 3.3 + 0.36, 4.15 + 0.32);
  },
});
