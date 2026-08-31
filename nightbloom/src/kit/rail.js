import * as THREE from 'three';
import { leanTo, bench, stairs } from '../builders.js';
import {
  M, SINK, ASPECT, rng, bx, cyl, member, addMesh, board, printed,
  practical, lanternRig, asProp, rect, surf,
} from './common.js';
import { haltBoard, haltNotice, warningNotice } from './signage.js';

/* ------------------------------------------------------------------ *
 * 宵坂駅 — the line: the halt and the crossing.
 *
 * NEITHER GENERATOR OWNS AN ACCENT.  The railway is the town's most
 * municipal thing and it is built in stone, cedar and dark joinery; the
 * only bright thing on it is the crossing's warm PRACTICAL lamps, which
 * are the emissive role (`M.glow`), not the shopfronts' amber.
 *
 * The track itself belongs to the district, not to the kit: a halt is a
 * platform, and where the rails run past it is a decision about the
 * line's alignment that no single prop can make.  `stationHalt`'s
 * `joints.trackSide` names which way the platform faces so a district
 * can lay its permanent way to that edge.
 * ------------------------------------------------------------------ */

/* ---- stationHalt ------------------------------------------------------ */

function stationHaltDims(o = {}) {
  const len = o.len ?? 12;
  const w = o.w ?? 3.0;
  const deckY = o.deckY ?? 0.55;
  const treads = 3;
  return {
    seed: o.seed ?? 1,
    ry: o.ry ?? 0,
    len, w, deckY, treads,
    rise: deckY / treads,
    run: 0.42,
    stepW: 1.6,
    hutW: o.hutW ?? 3.2,
    hutD: o.hutD ?? 1.9,
  };
}

/**
 * 停留所 — the unstaffed country halt: a 12 × 3 m stone platform 0.55 m
 * over the ground, an open-fronted shelter with its bench, the 宵坂駅
 * name board on two posts, the notice board still carrying the summer
 * poster, a paling fence along the back and two lamps.
 *
 * THE PLATFORM IS A SURFACE, NOT A COLLIDER.  `footprint(opts)` returns
 * the shelter, the fence and the board posts; `surfaces(opts)` returns
 * the deck and the three treads of the ramp at the +x end.  A collider
 * round the deck would be a platform you can see and never stand on —
 * which is the documented open-shelter bug in builders.js, one level up.
 *
 * The deck is 0.55 m and the walker's step limit is 0.38 m, so the ramp
 * is not decoration: without it the platform is unreachable and the city
 * flood fill says so.
 *
 * Faces LOCAL +Z: the track side is +z, the town side −z.
 */
export function stationHalt(opts = {}) {
  const D = stationHaltDims(opts);
  const { len, w, deckY, treads, rise, run, stepW, hutW, hutD } = D;
  const r = rng(D.seed + 13);
  const g = new THREE.Group();
  const hl = len / 2;
  const hwd = w / 2;

  /* --- the platform: body, coping, and a paler edge strip ------------ */
  addMesh(g, [bx(len, deckY - 0.08 + SINK, w, 0, (deckY - 0.08 - SINK) / 2, 0)], M.stone, { name: 'halt-platform' });
  addMesh(g, [bx(len, 0.08, w, 0, deckY - 0.04, 0)], M.stonePale, { name: 'halt-deck' });
  addMesh(g, [bx(len, 0.09, 0.34, 0, deckY - 0.035, hwd - 0.17)], M.tilePale, { cast: false, name: 'halt-edge' });

  /* --- the ramp at the +x end --------------------------------------- */
  const rampX = hl + treads * run;
  const ramp = stairs({ w: stepW, rise, run, steps: treads, dir: 'x-', at: [rampX, 0, 0], mat: M.stone });
  ramp.name = 'halt-ramp';
  g.add(ramp);

  /* --- shelter: builders' leanTo, open to the track ------------------ */
  // Centred on the platform ON PURPOSE.  It is where a halt shelter sits,
  // and it also puts SOLID GEOMETRY at the assembly's own bounding-box
  // centre — which is the point every review camera aims at.  With the hut
  // off to one end the centre is a metre of open air over the deck, and the
  // camera gate fails a perfectly composed frame because the ray to the
  // subject sails through it and lands on the ground beyond.
  const hutZ = -hwd + hutD / 2 + 0.16;
  const hut = leanTo({
    w: hutW, d: hutD, h: 2.42, pitch: 0.24, open: 'z+',
    at: [0, deckY, hutZ], mat: M.cedar, roofMat: M.tile,
  });
  hut.name = 'halt-shelter';
  g.add(hut);
  const seat = bench({ w: 2.1, back: false, at: [0, deckY, hutZ - 0.1], facing: [0, 1], mat: M.cedarDark });
  seat.name = 'halt-bench';
  g.add(seat);

  /* --- name board on two posts, at the town end ---------------------- */
  const boardX = hl - 2.3;
  const posts = [];
  for (const s of [-1, 1]) posts.push(bx(0.13, 2.2, 0.13, boardX + s * 1.05, deckY + 1.1, -hwd + 0.4));
  addMesh(g, posts, M.cedar, { name: 'halt-board-posts' });
  board(g, haltBoard(), 2.0, ASPECT.plate, { at: [boardX, deckY + 1.62, -hwd + 0.47], mat: M.cedarDark });

  /* --- notice board beside the shelter ------------------------------- */
  const nx = -2.9;
  const notice = printed(haltNotice(), 0.52, ASPECT.notice);
  notice.position.set(nx, deckY + 1.32, -hwd + 0.34);
  g.add(notice);
  const nposts = [];
  for (const s of [-1, 1]) nposts.push(bx(0.09, 1.72, 0.09, nx + s * 0.36, deckY + 0.86, -hwd + 0.29));
  nposts.push(bx(0.72, 0.78, 0.06, nx, deckY + 1.32, -hwd + 0.3));
  addMesh(g, nposts, M.cedarDark, { name: 'halt-notice-board' });

  /* --- paling fence along the town side, standing on the GROUND ------ */
  const fenceZ = -hwd - 0.5;
  const fence = [];
  const bays = Math.round(len / 1.8);
  for (let i = 0; i <= bays; i += 1) {
    fence.push(bx(0.12, 1.24 + SINK, 0.12, -hl + (i * len) / bays, (1.24 - SINK) / 2, fenceZ));
  }
  fence.push(bx(len, 0.09, 0.08, 0, 1.16, fenceZ));
  fence.push(bx(len, 0.08, 0.08, 0, 0.62, fenceZ));
  for (let i = 0; i < bays * 4; i += 1) {
    fence.push(bx(0.06, 1.06, 0.05, -hl + 0.1 + (i * (len - 0.2)) / (bays * 4 - 1), 0.55, fenceZ + 0.05));
  }
  addMesh(g, fence, M.cedarDark, { name: 'halt-fence' });

  /* --- practicals: two platform lamps -------------------------------- */
  const lampPosts = [];
  const lampX = [-hl + 2.2, hl - 2.2];
  for (const x of lampX) lampPosts.push(cyl(0.06, 0.075, 2.6, 6, x, deckY + 1.3, -hwd + 0.25));
  for (const x of lampX) lampPosts.push(bx(0.5, 0.08, 0.08, x + 0.25, deckY + 2.55, -hwd + 0.25));
  addMesh(g, lampPosts, M.joinery, { name: 'halt-lamp-posts' });
  lanternRig(g, lampX.map((x) => [x + 0.46, deckY + 2.5, -hwd + 0.25]),
    { r: 0.16, h: 0.3, cord: 0.08, radius: 5.5, mat: M.joinery, name: 'halt-lamp' });

  // seeded dressing: a milk crate or two waiting on the deck
  const crates = [];
  for (let i = 0, n = r.int(1, 3); i < n; i += 1) {
    const cw = r.range(0.38, 0.5);
    crates.push(bx(cw, cw * 0.66, cw * 0.8, r.range(-hl + 1.5, hl - 1.5), deckY + (cw * 0.66) / 2, r.range(-0.4, 0.4), { ry: r.range(-0.5, 0.5) }));
  }
  addMesh(g, crates, M.cedarPale, { name: 'halt-crates' });

  g.rotation.y = D.ry;
  return asProp(g, 'stationHalt', {
    joints: {
      deckY,
      trackSide: [0, 0, w / 2],
      townSide: [0, 0, -w / 2],
      rampFoot: [hl + treads * run + 0.2, 0, 0],
      endWest: [-hl, 0, 0], endEast: [hl, 0, 0],
    },
  });
}

stationHalt.footprint = (o = {}) => {
  const D = stationHaltDims(o);
  const { len, w, ry, hutW, hutD } = D;
  const hwd = w / 2;
  return [
    rect(0, -hwd + hutD / 2 + 0.16, hutW / 2, hutD / 2, ry),           // shelter
    rect(0, -hwd - 0.5, len / 2, 0.14, ry),                            // fence
    rect(len / 2 - 2.3, -hwd + 0.44, 1.14, 0.12, ry),                  // name-board posts
  ];
};

stationHalt.surfaces = (o = {}) => {
  const D = stationHaltDims(o);
  const { len, w, deckY, treads, rise, run, stepW, ry } = D;
  const out = [surf(0, 0, len / 2 - 0.05, w / 2 - 0.05, ry, deckY)];
  const x0Ramp = len / 2 + treads * run;
  for (let i = 0; i < treads; i += 1) {
    const a = x0Ramp - i * run;
    const b = x0Ramp - (i + 1) * run - 0.04;   // stairs() overlaps treads by 40 mm
    out.push(surf((a + b) / 2, 0, (a - b) / 2, stepW / 2, ry, (i + 1) * rise));
  }
  return out;
};

/* ---- crossingSignal --------------------------------------------------- */

function crossingSignalDims(o = {}) {
  return {
    seed: o.seed ?? 1,
    ry: o.ry ?? 0,
    h: o.h ?? 3.4,             // top of the mast, under the bell
    arm: o.arm ?? 3.2,         // half-barrier reach
    lowered: o.lowered ?? true,
    blockRoad: o.blockRoad ?? false,
    // The stand the arm comes down onto.  It is a real fitting on a long
    // arm, and it is also what makes the assembly auditable: a 3.2 m arm
    // ending in mid-air turns the whole signal into a LINEAR unit whose
    // own base line climbs from the mast foot to the arm, the audit fits
    // that as a rake, and the arm then reads as floating a metre over the
    // road.  An arm supported at both ends is both the honest fix and the
    // one a level crossing actually has.
    rest: o.rest ?? (o.lowered ?? true),
  };
}

/**
 * 踏切 — the level-crossing mast: stone base, mast, the crossbuck, a pair
 * of warm alarm lamps on their cross-arm, the alarm bell on top, the
 * night-warning notice, and a half barrier on a counterweighted pivot.
 *
 * `opts.lowered` (default true) drops the arm across the road; set it
 * false and the arm stands at 78° with the counterweight down, derived
 * from the SAME pivot joint — the arm is built from the pivot point and a
 * direction, never from a length and a remembered rotation, so both
 * states are the same barrier.
 *
 * COLLIDERS: `footprint(opts)` gives the mast base only.  The arm is
 * scenery unless you ask for `blockRoad: true`, because a lowered barrier
 * collider laid across a road socket seals the route and the city flood
 * fill fails a district that did nothing wrong.  If you want it to block,
 * you must say so.
 */
export function crossingSignal(opts = {}) {
  const D = crossingSignalDims(opts);
  const { h, arm, lowered, rest } = D;
  const g = new THREE.Group();

  /* --- base and mast ------------------------------------------------- */
  addMesh(g, [bx(0.62, 0.26 + SINK, 0.62, 0, (0.26 - SINK) / 2, 0)], M.stone, { name: 'crossing-base' });
  addMesh(g, [
    cyl(0.075, 0.095, h - 0.26, 8, 0, 0.26 + (h - 0.26) / 2, 0),
    bx(0.86, 0.08, 0.08, 0, 2.62, 0),                       // lamp cross-arm
  ], M.joinery, { name: 'crossing-mast' });

  /* --- crossbuck ----------------------------------------------------- */
  const buck = [];
  for (const s of [-1, 1]) buck.push(bx(1.24, 0.17, 0.05, 0, h - 0.42, 0.09, { rz: (s * Math.PI) / 5 }));
  addMesh(g, buck, M.paper, { cast: false, name: 'crossing-buck' });
  const buckEdge = [];
  for (const s of [-1, 1]) buckEdge.push(bx(1.3, 0.05, 0.04, 0, h - 0.42, 0.06, { rz: (s * Math.PI) / 5 }));
  addMesh(g, buckEdge, M.joinery, { cast: false });

  /* --- alarm lamps: housings + the practicals ------------------------ */
  const housings = [];
  for (const s of [-1, 1]) housings.push(cyl(0.19, 0.19, 0.16, 10, s * 0.4, 2.62, 0.1, { rx: Math.PI / 2 }));
  for (const s of [-1, 1]) housings.push(cyl(0.24, 0.19, 0.14, 10, s * 0.4, 2.62, 0.02, { rx: Math.PI / 2 }));  // hood
  addMesh(g, housings, M.joinery, { name: 'crossing-lamp-housings' });
  for (const s of [-1, 1]) {
    const lens = addMesh(g, [cyl(0.155, 0.155, 0.05, 10, s * 0.4, 2.62, 0.185, { rx: Math.PI / 2 })], M.glow,
      { cast: false, receive: false, name: `crossing-lamp-${s > 0 ? 'east' : 'west'}` });
    practical(lens, { radius: 4 });
  }

  /* --- alarm bell ---------------------------------------------------- */
  addMesh(g, [
    cyl(0.1, 0.24, 0.26, 10, 0, h + 0.12, 0),
    cyl(0.06, 0.06, 0.1, 6, 0, h + 0.3, 0),
  ], M.joinery, { name: 'crossing-bell' });

  /* --- half barrier, derived from ONE pivot joint -------------------- */
  const pivot = new THREE.Vector3(0.16, 1.02, 0);
  addMesh(g, [bx(0.34, 0.4, 0.36, pivot.x - 0.08, pivot.y, 0)], M.joinery, { name: 'crossing-pivot' });
  const rake = lowered ? 0 : 1.36;                         // 0 rad down, 78° up
  const dir = new THREE.Vector3(Math.cos(rake), Math.sin(rake), 0);
  const tip = pivot.clone().addScaledVector(dir, arm);
  const tail = pivot.clone().addScaledVector(dir, -0.62);  // counterweight arm

  const light = [];
  const dark = [];
  const BANDS = 8;
  for (let i = 0; i < BANDS; i += 1) {
    const a = pivot.clone().addScaledVector(dir, (arm * i) / BANDS);
    const b = pivot.clone().addScaledVector(dir, (arm * (i + 1)) / BANDS);
    const seg = member(a, b, 0.075, 4);
    (i % 2 ? dark : light).push(seg);
  }
  addMesh(g, light, M.paper, { name: 'crossing-barrier-light' });
  addMesh(g, [...dark, member(pivot, tail, 0.07, 4)], M.joinery, { name: 'crossing-barrier-dark' });
  addMesh(g, [bx(0.3, 0.3, 0.3, tail.x, tail.y, tail.z)], M.stoneDeep, { cast: false, name: 'crossing-counterweight' });
  if (rest && lowered) {
    const stand = pivot.clone().addScaledVector(dir, arm - 0.12);
    addMesh(g, [
      bx(0.16, stand.y - 0.16 + SINK, 0.16, stand.x, (stand.y - 0.16 - SINK) / 2, stand.z),
      bx(0.34, 0.1, 0.3, stand.x, stand.y - 0.13, stand.z),
      bx(0.42, 0.14, 0.42, stand.x, 0.07 - SINK, stand.z),
    ], M.cedarDark, { name: 'crossing-rest-stand' });
  }
  // the hanging skirt under a lowered arm — the thing that makes a barrier
  // read as a barrier rather than as a pole
  if (lowered) {
    const skirt = [];
    for (let i = 1; i < 6; i += 1) {
      const p = pivot.clone().addScaledVector(dir, (arm * i) / 6);
      skirt.push(cyl(0.016, 0.016, 0.34, 5, p.x, p.y - 0.2, p.z));
    }
    addMesh(g, skirt, M.joinery, { cast: false, name: 'crossing-skirt' });
  }

  /* --- the town's one visible admission, on its own post ------------- */
  const wn = printed(warningNotice(), 0.44, ASPECT.notice);
  wn.position.set(-0.62, 1.5, 0.12);
  g.add(wn);
  addMesh(g, [
    bx(0.09, 1.72 + SINK, 0.09, -0.62, (1.72 - SINK) / 2, 0.04),
    bx(0.56, 0.66, 0.05, -0.62, 1.5, 0.07),
  ], M.cedarDark, { name: 'crossing-notice' });

  g.rotation.y = D.ry;
  return asProp(g, 'crossingSignal', {
    joints: { pivot: pivot.toArray(), tip: tip.toArray(), mastTop: [0, h, 0], lowered },
  });
}

crossingSignal.footprint = (o = {}) => {
  const D = crossingSignalDims(o);
  const out = [rect(0, 0, 0.34, 0.34, D.ry)];
  if (D.rest && D.lowered) out.push(rect(0.16 + D.arm - 0.12, 0, 0.24, 0.24, D.ry));
  if (D.blockRoad && D.lowered) out.push(rect(0.16 + D.arm / 2, 0, D.arm / 2, 0.12, D.ry));
  return out;
};
