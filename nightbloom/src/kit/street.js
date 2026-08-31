import * as THREE from 'three';
import {
  M, SINK, ASPECT, rng, bx, cyl, member, plank, addMesh, printed,
  practical, asProp, rect, surf,
} from './common.js';
import { phonePlate } from './signage.js';

/* ------------------------------------------------------------------ *
 * The street: the water, the crossing over it, and the two props that
 * make a lane look inhabited ten minutes ago.
 *
 * `canalKerb` is DRESSING, not terrain.  It lays a stone channel ON the
 * ground rather than cutting one into it: the terrain stage owns the
 * whole city's ground and a prop that dug its own trench would punch a
 * hole through it that only the seam grid would ever see.  So the canal
 * is brim-full — kerbs proud of the paving, water 0.10 m above it — the
 * way a small 用水路 actually runs.  Nothing under the water plane is
 * missing; the town's ground is still there.
 * ------------------------------------------------------------------ */

/* ---- canalKerb -------------------------------------------------------- */

function canalKerbDims(o = {}) {
  const len = o.len ?? 10;
  const chan = o.chan ?? 2.2;         // clear water width
  const kerb = o.kerb ?? 0.44;
  return {
    seed: o.seed ?? 1,
    ry: o.ry ?? 0,
    len, chan, kerb,
    kerbY: o.kerbY ?? 0.3,            // kerb top over the ground
    waterY: o.waterY ?? 0.1,
    steps: o.steps ?? true,           // the inset flight down to the water
    stepSide: o.stepSide ?? 1,        // which bank the flight is cut into
  };
}

/**
 * A stone canal run laid along LOCAL X: a coursed kerb on each bank, the
 * channel bed between them, the water plane, a moss line at the waterline
 * and (by default) a short inset flight down to the water on one bank —
 * the washing step every canal lane has.
 *
 * `joints.west` / `joints.east` are the run's two ends, so successive
 * sections BUTT rather than each being placed from the district's memory
 * of where the last one stopped.
 *
 * COLLIDERS: `footprint(opts)` returns both kerbs AND the channel — you
 * cannot walk on water.  Build the run in two calls with a gap where a
 * `footbridge` crosses; a bridge over a collider is a bridge to nowhere
 * and the flood fill is the only thing that will tell you.
 */
export function canalKerb(opts = {}) {
  const D = canalKerbDims(opts);
  const { len, chan, kerb, kerbY, waterY, steps, stepSide } = D;
  const r = rng(D.seed + 19);
  const g = new THREE.Group();
  const hl = len / 2;
  const inner = chan / 2;
  const outer = inner + kerb;

  /* --- kerbs, coursed rather than extruded --------------------------- */
  const stones = [];
  const courses = Math.max(4, Math.round(len / 1.15));
  for (const s of [-1, 1]) {
    for (let i = 0; i < courses; i += 1) {
      const x0 = -hl + (i * len) / courses;
      const x1 = -hl + ((i + 1) * len) / courses;
      const h = kerbY + r.range(-0.02, 0.02);
      stones.push(bx(x1 - x0 - 0.02, h + SINK, kerb, (x0 + x1) / 2, (h - SINK) / 2, s * (inner + kerb / 2)));
    }
  }
  addMesh(g, stones, M.stone, { name: 'canal-kerb' });
  // a paler coping strip so the bank edge reads at a distance
  addMesh(g, [-1, 1].map((s) => bx(len, 0.06, kerb - 0.1, 0, kerbY + 0.02, s * (inner + kerb / 2))),
    M.stonePale, { cast: false, name: 'canal-coping' });

  /* --- channel bed and revetment walls ------------------------------- */
  addMesh(g, [
    bx(len, 0.06 + SINK, chan, 0, (0.06 - SINK) / 2, 0),                       // bed slab, laid ON the ground
    ...[-1, 1].map((s) => bx(len, kerbY + SINK, 0.1, 0, (kerbY - SINK) / 2, s * (inner + 0.05))),
  ], M.stoneDeep, { name: 'canal-bed' });

  /* --- the water: a plane, deliberately, so it stays flat and cheap -- */
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(len - 0.06, chan - 0.06).rotateX(-Math.PI / 2).translate(0, waterY, 0),
    M.water,
  );
  water.castShadow = false;
  water.receiveShadow = false;
  water.name = 'canal-water';
  water.userData.airborne = true;
  g.add(water);
  addMesh(g, [-1, 1].map((s) => bx(len, 0.07, 0.07, 0, waterY + 0.02, s * (inner - 0.03))),
    M.moss, { cast: false, name: 'canal-moss' });

  /* --- the washing steps, cut into one bank -------------------------- */
  if (steps) {
    const sx = r.range(-hl + 1.6, hl - 1.6);
    const tread = [];
    const N = 3;
    for (let i = 0; i < N; i += 1) {
      const y = kerbY - ((i + 1) * (kerbY - waterY + 0.04)) / N;
      const z = stepSide * (inner + kerb - 0.1 - ((i + 1) * (kerb + 0.2)) / N);
      tread.push(bx(1.1, 0.1, (kerb + 0.24) / N + 0.06, sx, y, z));
    }
    addMesh(g, tread, M.stonePale, { name: 'canal-steps' });
  }

  g.rotation.y = D.ry;
  return asProp(g, 'canalKerb', {
    joints: {
      west: [-hl, 0, 0], east: [hl, 0, 0],
      bankNorth: [0, kerbY, -outer], bankSouth: [0, kerbY, outer],
      waterY, kerbY, clearW: chan,
    },
  });
}

canalKerb.footprint = (o = {}) => {
  const D = canalKerbDims(o);
  const inner = D.chan / 2;
  return [
    rect(0, 0, D.len / 2, inner, D.ry),                                  // the water itself
    ...[-1, 1].map((s) => rect(0, s * (inner + D.kerb / 2), D.len / 2, D.kerb / 2, D.ry)),
  ];
};

/* ---- footbridge ------------------------------------------------------- */

function footbridgeDims(o = {}) {
  return {
    seed: o.seed ?? 1,
    ry: o.ry ?? 0,
    span: o.span ?? 5.0,
    w: o.w ?? 1.7,
    camber: o.camber ?? 0.4,
    abut: o.abut ?? 0.24,     // deck height at the abutments
    segs: 6,
  };
}

/**
 * A timber footbridge on a shallow camber, spanning along LOCAL X.  The
 * deck is cut into six flat segments and the handrails are members
 * between the post tops, so rail, deck and stringer share their joints and
 * the rake is right by construction rather than by a rotation someone
 * chose.
 *
 * It stands on the GROUND at both ends (0.24 m at the abutments, 0.64 m at
 * the crown), so it works over a `canalKerb` — which is dressing on flat
 * ground — and equally on a level lane.  0.24 m is under the walker's
 * 0.38 m step, so you can get on it.
 *
 * `surfaces(opts)` returns one platform per deck segment: registering ONE
 * rect at the crown height would leave the player walking on air over both
 * approaches, which the seam grid reports and nothing else would.
 */
export function footbridge(opts = {}) {
  const D = footbridgeDims(opts);
  const { span, w, camber, abut, segs } = D;
  const g = new THREE.Group();
  const hs = span / 2;
  const hw = w / 2;
  /** Deck TOP at x — a parabola through both abutments. */
  const yAt = (x) => abut + camber * (1 - (x / hs) ** 2);

  /* --- abutment sills on the ground ---------------------------------- */
  addMesh(g, [-1, 1].map((s) => bx(0.7, abut + SINK, w + 0.4, s * (hs + 0.2), (abut - SINK) / 2, 0)),
    M.stone, { name: 'bridge-abutment' });

  /* --- stringers and deck, segment by segment ------------------------ */
  const stringers = [];
  const deck = [];
  for (let i = 0; i < segs; i += 1) {
    const x0 = -hs + (span * i) / segs;
    const x1 = -hs + (span * (i + 1)) / segs;
    const a = [x0, yAt(x0) - 0.13, 0];
    const b = [x1, yAt(x1) - 0.13, 0];
    for (const s of [-1, 1]) {
      stringers.push(plank([a[0], a[1], s * (hw - 0.14)], [b[0], b[1], s * (hw - 0.14)], 0.16, 0.18));
    }
    // Deck boards: 4 per segment, each laid flat at its own segment top,
    // and each 20 mm OVER-WIDE so consecutive boards overlap rather than
    // meet.  Boards that merely meet leave a 20 mm slot, the seam grid
    // samples on a 0.5 m lattice, and sooner or later one sample drops
    // through the deck and reports the bridge as walking on air — which
    // is builders.js's own "treads overlap, never meet" rule applied to a
    // deck.
    const top = (yAt(x0) + yAt(x1)) / 2;
    for (let k = 0; k < 4; k += 1) {
      const cx = x0 + ((k + 0.5) * (x1 - x0)) / 4;
      deck.push(bx((x1 - x0) / 4 + 0.02, 0.09, w, cx, top - 0.045, 0));
    }
  }
  addMesh(g, stringers, M.cedarDark, { name: 'bridge-stringers' });
  addMesh(g, deck, M.cedarPale, { name: 'bridge-deck' });

  /* --- handrails: posts on the deck, rails between their tops -------- */
  const rails = [];
  const POSTS = 5;
  const RAIL_H = 1.02;
  for (const s of [-1, 1]) {
    const tops = [];
    for (let i = 0; i < POSTS; i += 1) {
      const x = -hs + (span * i) / (POSTS - 1);
      const y = yAt(x);
      rails.push(bx(0.11, RAIL_H, 0.11, x, y + RAIL_H / 2, s * (hw - 0.06)));
      tops.push([x, y + RAIL_H, s * (hw - 0.06)]);
    }
    for (let i = 0; i < POSTS - 1; i += 1) {
      rails.push(plank(tops[i], tops[i + 1], 0.13, 0.09));
      rails.push(member(
        [tops[i][0], tops[i][1] - 0.46, tops[i][2]],
        [tops[i + 1][0], tops[i + 1][1] - 0.46, tops[i + 1][2]],
        0.035, 5,
      ));
    }
  }
  addMesh(g, rails, M.cedar, { name: 'bridge-rails' });

  g.rotation.y = D.ry;
  return asProp(g, 'footbridge', {
    joints: {
      west: [-hs - 0.2, abut, 0], east: [hs + 0.2, abut, 0],
      crown: [0, yAt(0), 0], clearW: w, abutY: abut,
    },
  });
}

footbridge.footprint = (o = {}) => {
  const D = footbridgeDims(o);
  // the two parapets only — the deck is walkable, and a box around the
  // bridge is a bridge you cannot cross
  return [-1, 1].map((s) => rect(0, s * (D.w / 2 - 0.06), D.span / 2, 0.1, D.ry));
};

footbridge.surfaces = (o = {}) => {
  const D = footbridgeDims(o);
  const { span, w, camber, abut, segs, ry } = D;
  const hs = span / 2;
  const yAt = (x) => abut + camber * (1 - (x / hs) ** 2);
  const out = [];
  for (let i = 0; i < segs; i += 1) {
    const x0 = -hs + (span * i) / segs;
    const x1 = -hs + (span * (i + 1)) / segs;
    out.push(surf((x0 + x1) / 2, 0, (x1 - x0) / 2 + 0.02, w / 2 - 0.14, ry, (yAt(x0) + yAt(x1)) / 2));
  }
  return out;
};

/* ---- phonebox --------------------------------------------------------- */

function phoneboxDims(o = {}) {
  return {
    seed: o.seed ?? 1,
    ry: o.ry ?? 0,
    w: o.w ?? 1.06,
    d: o.d ?? 1.06,
    h: o.h ?? 2.42,          // top of the frame; the cap adds 0.12
  };
}

/**
 * 公衆電話 — the glazed phone box: a cedar-and-joinery frame, glass on all
 * four sides, a boarded kick panel, a flat overhanging cap, the 公衆電話
 * plate over the door and a warm ceiling light inside it.
 *
 * It is a QUEST PROP, so it carries `userData.interact` with the glazing
 * as its hitbox — a district hands that straight to `ctx.interact`.  It is
 * also the brightest small thing on a lane at dusk: the ceiling glow is a
 * PRACTICAL, which is what makes it findable from down the street.
 *
 * Door clear height 2.05 m; the box is 1.06 m square, so it reads as one
 * person's width and not as a shed.
 */
export function phonebox(opts = {}) {
  const D = phoneboxDims(opts);
  const { w, d, h } = D;
  const g = new THREE.Group();
  const hw = w / 2;
  const hd = d / 2;
  const kick = 0.26;

  /* --- frame --------------------------------------------------------- */
  const frame = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) frame.push(bx(0.1, h + SINK, 0.1, sx * (hw - 0.05), (h - SINK) / 2, sz * (hd - 0.05)));
  }
  for (const sz of [-1, 1]) {
    frame.push(bx(w, 0.12, 0.1, 0, h - 0.06, sz * (hd - 0.05)));
    frame.push(bx(w, 0.09, 0.1, 0, kick + 0.045, sz * (hd - 0.05)));
  }
  for (const sx of [-1, 1]) {
    frame.push(bx(0.1, 0.12, d - 0.2, sx * (hw - 0.05), h - 0.06, 0));
    frame.push(bx(0.1, 0.09, d - 0.2, sx * (hw - 0.05), kick + 0.045, 0));
  }
  addMesh(g, frame, M.joinery, { name: 'phonebox-frame' });

  /* --- kick panel and cap -------------------------------------------- */
  addMesh(g, [
    bx(w, kick + SINK, d, 0, (kick - SINK) / 2, 0),
    bx(w + 0.18, 0.12, d + 0.18, 0, h + 0.06, 0),
  ], M.cedarDark, { name: 'phonebox-shell' });

  /* --- glazing ------------------------------------------------------- */
  // glass runs from the kick rail to the frame head: 2.04 m of clear
  // opening over the kick panel, which is the door height rule
  const gY0 = kick + 0.09;
  const gY1 = h - 0.14;
  const glassGeoms = [];
  for (const sz of [-1, 1]) glassGeoms.push(bx(w - 0.18, gY1 - gY0, 0.05, 0, (gY0 + gY1) / 2, sz * (hd - 0.05)));
  for (const sx of [-1, 1]) glassGeoms.push(bx(0.05, gY1 - gY0, d - 0.18, sx * (hw - 0.05), (gY0 + gY1) / 2, 0));
  const glazing = addMesh(g, glassGeoms, M.glass, { cast: false, name: 'phonebox-glazing' });

  /* --- the instrument inside ----------------------------------------- */
  addMesh(g, [
    bx(0.34, 0.46, 0.16, 0, 1.34, -hd + 0.16),
    bx(0.46, 0.06, 0.24, 0, 1.04, -hd + 0.2),
    bx(0.09, 0.2, 0.09, -0.19, 1.36, -hd + 0.24),
  ], M.stoneDeep, { name: 'phonebox-phone' });

  /* --- the practical: the ceiling light ------------------------------ */
  const lamp = addMesh(g, [bx(w - 0.28, 0.07, d - 0.28, 0, h - 0.17, 0)], M.glow,
    { cast: false, receive: false, name: 'phonebox-lamp' });
  practical(lamp, { radius: 5 });

  /* --- the plate ----------------------------------------------------- */
  const plate = printed(phonePlate(), 0.9, ASPECT.plate);
  plate.position.set(0, h + 0.06, hd + 0.11);
  g.add(plate);
  addMesh(g, [bx(0.96, plate.userData.signH + 0.06, 0.05, 0, h + 0.06, hd + 0.08)], M.cedarDark, { cast: false });

  g.rotation.y = D.ry;
  return asProp(g, 'phonebox', {
    joints: { door: [0, 0, hd + 0.5], topY: h + 0.12 },
    interact: { label: 'Use the public phone', verb: 'use', hitbox: glazing },
  });
}

phonebox.footprint = (o = {}) => {
  const D = phoneboxDims(o);
  return [rect(0, 0, D.w / 2 + 0.09, D.d / 2 + 0.09, D.ry)];
};

/* ---- postRack --------------------------------------------------------- */

function postRackDims(o = {}) {
  const seed = o.seed ?? 1;
  const r = rng(seed);
  const slots = o.slots ?? 4;
  return {
    seed, ry: o.ry ?? 0, slots,
    len: o.len ?? 2.3,
    bikes: Math.min(slots, o.bikes ?? r.int(1, 3)),
  };
}

/**
 * One bicycle, built from its joints, standing in the rack at local x and
 * turned by `ry`.  Nothing here is a length at a guessed angle: the tubes
 * span hub / bottom-bracket / seat-top / head-top, and the wheels take
 * their axle from the SAME `ry` the frame does.
 *
 * The wheel is two discs in two materials — a dark tyre and a pale spoke
 * plate 0.82 of its radius — because one disc in one tone reads as a
 * brown blob from three metres away, which is exactly what a wheel must
 * not do.  (An earlier pass wrapped each wheel in a full-radius mudguard
 * disc, which covered the whole wheel and produced precisely that blob.)
 */
function bicycle(x, ry, geoms) {
  const R = 0.33;                      // wheel radius
  const base = R;                      // hub height
  const wheelbase = 1.06;
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  // local (u along the bike, v across) -> group (x, z)
  const P = (u, y, v) => [x + u * c + v * s, y, -u * s + v * c];
  const rear = P(-wheelbase / 2, base, 0);
  const front = P(wheelbase / 2, base, 0);
  const bb = P(-0.16, 0.3, 0);         // bottom bracket
  const seatT = P(-0.42, 0.92, 0);
  const headT = P(0.36, 0.98, 0);

  // A cylinder is authored along +y; rotateX(90 deg) lays it along +z and
  // rotateY(ry) swings that onto the bike's OWN across-axis (sin ry, 0,
  // cos ry).  Deriving the axle from the frame's own yaw is what stops a
  // bicycle looking like it was assembled by two different people.
  for (const hub of [rear, front]) {
    geoms.tyre.push(cyl(R, R, 0.06, 14, hub[0], hub[1], hub[2], { rx: Math.PI / 2, ry }));
    geoms.spoke.push(cyl(R * 0.82, R * 0.82, 0.035, 14, hub[0], hub[1], hub[2], { rx: Math.PI / 2, ry }));
  }
  // frame: seat tube, down tube, top tube, chainstay, seatstay, fork
  geoms.frame.push(member(bb, seatT, 0.036, 5));
  geoms.frame.push(member(bb, headT, 0.036, 5));
  geoms.frame.push(member(seatT, headT, 0.032, 5));
  geoms.frame.push(member(bb, rear, 0.03, 5));
  geoms.frame.push(member(seatT, rear, 0.03, 5));
  geoms.frame.push(member(headT, front, 0.038, 5));
  geoms.frame.push(member(P(0.36, 1.04, -0.25), P(0.36, 1.04, 0.25), 0.028, 5));   // handlebar
  // saddle and the front basket every town bicycle has
  geoms.dress.push(bx(0.26, 0.07, 0.16, seatT[0], seatT[1] + 0.05, seatT[2], { ry }));
  const basket = P(0.44, 0.86, 0);
  geoms.dress.push(bx(0.3, 0.26, 0.3, basket[0], basket[1], basket[2], { ry }));
}

/**
 * 駐輪場 — the bicycle rack and its parked bicycles: a low steel-grey
 * frame with `slots` wheel hoops, and 1–3 bicycles seeded into it by
 * `opts.seed`.  The bikes stand ACROSS the rack (front wheel in a slot),
 * which is both what a rack is for and what keeps the assembly from
 * auditing as a long thin run.
 *
 * Every bicycle is built from its own joints — hubs, bottom bracket, seat
 * and head tops — so no tube is ever a length at a guessed angle, and the
 * whole cluster is one merged mesh per material.
 *
 * No people, anywhere: the bikes ARE the people.
 */
export function postRack(opts = {}) {
  const D = postRackDims(opts);
  const { len, slots, bikes } = D;
  const r = rng(D.seed + 3);
  const g = new THREE.Group();
  const hl = len / 2;

  /* --- the rack: two ground rails and one hoop per slot -------------- */
  const rack = [];
  for (const s of [-1, 1]) {
    rack.push(member([-hl, 0.07, s * 0.26], [hl, 0.07, s * 0.26], 0.035, 6));
  }
  for (let i = 0; i < slots; i += 1) {
    const x = -hl + 0.28 + (i * (len - 0.56)) / Math.max(1, slots - 1);
    rack.push(member([x, -SINK, -0.26], [x, 0.42, -0.26], 0.028, 5));
    rack.push(member([x, -SINK, 0.26], [x, 0.42, 0.26], 0.028, 5));
    rack.push(member([x, 0.42, -0.26], [x, 0.42, 0.26], 0.028, 5));
  }
  addMesh(g, rack, M.joinery, { name: 'rack-frame' });

  /* --- the bicycles -------------------------------------------------- */
  const geoms = { tyre: [], spoke: [], frame: [], dress: [] };
  const taken = new Set();
  for (let i = 0; i < bikes; i += 1) {
    let slot = r.int(0, slots - 1);
    for (let guard = 0; guard < 8 && taken.has(slot); guard += 1) slot = (slot + 1) % slots;
    taken.add(slot);
    const x = -hl + 0.28 + (slot * (len - 0.56)) / Math.max(1, slots - 1);
    // parked ACROSS the rack, front wheel in the slot, with a little slop
    bicycle(x, Math.PI / 2 + r.range(-0.09, 0.09), geoms);
  }
  addMesh(g, geoms.tyre, M.joinery, { name: 'rack-tyres' });
  addMesh(g, geoms.spoke, M.stonePale, { cast: false, name: 'rack-wheels' });
  addMesh(g, geoms.frame, M.stoneDeep, { name: 'rack-bikes' });
  addMesh(g, geoms.dress, M.cedarDark, { name: 'rack-bike-dress' });

  g.rotation.y = D.ry;
  return asProp(g, 'postRack', {
    joints: { west: [-hl, 0, 0], east: [hl, 0, 0], slots },
  });
}

postRack.footprint = (o = {}) => {
  const D = postRackDims(o);
  return [rect(0, 0, D.len / 2 + 0.15, 0.95, D.ry)];
};
