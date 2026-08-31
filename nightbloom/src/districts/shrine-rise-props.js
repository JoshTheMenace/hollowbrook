import * as THREE from 'three';
import {
  M, TONE, SINK, mix, rng, bx, cyl, member, addMesh, asProp,
} from '../kit/index.js';
import { cel } from '../core/toon.js';

/* ------------------------------------------------------------------ *
 * 宵坂神社 — the shrine rise's own small vocabulary.
 *
 * Everything here is district dressing, not a kit generator: one old
 * camphor, the warding-charm racks the story needs far too many of, the
 * shide, the broom, the moss stones on the stair banks.  Nothing in this
 * file is a building — buildings come from src/kit/index.js.
 *
 * Palette: blossom pink is the shrine's, and it is spent on charm tags
 * and ema only.  The two leaf tones are the one thing the kit has no
 * role for; both are mixed from kit TONE roles (moss for the base, the
 * violet stoneDeep for the shaded underside), so the tree still retunes
 * from src/palette.js with everything else.
 * ------------------------------------------------------------------ */

const LEAF_BASE = mix(TONE.moss, 0x86a068, 0.62);   // camphor crown, lit
export const LEAF = cel({ color: LEAF_BASE, bands: 4 });
export const LEAF_SHADE = cel({ color: mix(LEAF_BASE, TONE.stoneDeep, 0.42), bands: 4 });

/**
 * A faceted foliage lump: a short belly between two 8-sided cones.
 *
 * The belly is the whole trick.  Two cones nose to nose give a diamond,
 * and a crown built from diamonds reads as a stack of flat plates however
 * many you use — the first pass of this tree did exactly that.  A 0.36 r
 * cylinder between them turns each lump into a rounded mass, and fifteen
 * of them overlapping at 1.3–2 m read as one crown with a bumpy edge,
 * which is what a camphor's silhouette actually is.
 */
function lump(geoms, x, y, z, r, ry = 0) {
  geoms.push(cyl(r, r * 0.42, r * 0.62, 8, x, y - r * 0.5, z, { ry }));
  geoms.push(cyl(r * 0.92, r, r * 0.36, 8, x, y + r * 0.02, z, { ry }));
  geoms.push(cyl(r * 0.22, r * 0.92, r * 0.58, 8, x, y + r * 0.49, z, { ry: ry + 0.32 }));
}

/* ---- the old camphor ------------------------------------------------- */

/**
 * 楠 — the shrine's camphor: a leaning trunk built joint to joint, five
 * limbs off two trunk joints, and ten crown lumps.  Origin at the ROOT
 * COLLAR on the ground; the whole tree leans toward local −x, so a
 * district yaws it with `ry` to lean it over whatever it should lean over.
 *
 * ~11 m to the crown, ~11 m across.  This is the district's hero
 * silhouette: it is deliberately taller than the hall's ridge and wider
 * than the hall's plan, because a guardian tree that a building can
 * contain is scenery rather than a landmark.
 */
export function camphorTree(opts = {}) {
  const seed = opts.seed ?? 1;
  const r = rng(seed + 31);
  const g = new THREE.Group();

  // trunk joints — every member below is built from two of these, never
  // from a length and an angle
  const J = {
    root: [0, 0, 0],
    low: [-0.3, 1.7, -0.05],
    fork: [-0.85, 3.3, -0.15],
    high: [-1.5, 4.7, -0.2],
  };

  // Each segment STARTS INSIDE the one below it, never at the joint: a
  // narrower member butted onto a wider one leaves the wider one's top
  // face exposed as a flat disc, and a trunk built that way reads as a
  // stack of crates — which is exactly what the first pass looked like.
  const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const bark = [];
  bark.push(member([0, -0.2, 0], J.low, 0.64, 10));
  bark.push(member(lerp(J.root, J.low, 0.5), J.fork, 0.53, 10));
  bark.push(member(lerp(J.low, J.fork, 0.45), J.high, 0.42, 9));
  bark.push(member(lerp(J.fork, J.high, 0.5), [-1.7, 5.7, -0.15], 0.3, 8));
  // root flare: five buttresses splaying to the ground collar
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2 + r.range(0, 0.5);
    bark.push(member([0, 0.85, 0], [Math.cos(a) * 0.92, -SINK, Math.sin(a) * 0.92], 0.2, 6));
  }
  addMesh(g, bark, M.cedarDark, { name: 'camphor-trunk' });

  const limbs = [];
  const limb = (from, mid, tip, r0, r1) => {
    limbs.push(member(from, mid, r0, 6));
    limbs.push(member(mid, tip, r1, 5));
  };
  limb(J.fork, [-3.0, 5.0, -0.7], [-4.0, 5.9, -1.1], 0.3, 0.17);   // west, over the hall
  limb(J.fork, [-1.6, 5.4, 2.3], [-2.1, 6.4, 3.6], 0.27, 0.15);    // south
  limb(J.fork, [0.8, 5.2, -2.4], [1.5, 6.2, -3.9], 0.26, 0.15);    // north
  limb(J.high, [-1.3, 6.7, 0.5], [-1.0, 7.9, 1.0], 0.28, 0.16);    // leader
  limb(J.high, [1.9, 5.6, 0.5], [3.0, 6.3, 1.0], 0.24, 0.14);      // east
  addMesh(g, limbs, M.cedar, { name: 'camphor-limbs' });

  // The crown, lump by lump.  The westmost edge is a hard number: local
  // −6.3, which is where the hall's eave line is once the tree is placed.
  // A crown that reached further would lean over the hall convincingly and
  // then fail the audit's bbox-overlap test against it.
  const crown = [];
  for (const [x, y, z, rad] of [
    [-4.4, 6.3, -0.9, 1.9], [-3.2, 7.4, 1.3, 1.8], [-2.6, 6.2, 2.6, 1.6],
    [-1.4, 8.4, -0.4, 2.0], [-0.2, 7.5, 2.6, 1.8], [0.6, 8.2, -2.2, 1.8],
    [-2.4, 7.0, -2.6, 1.7], [1.8, 7.0, -3.5, 1.6], [2.6, 6.6, 0.4, 1.7],
    [1.2, 6.4, 2.4, 1.5], [-0.6, 9.4, 0.9, 1.6], [-3.4, 8.0, -1.9, 1.5],
    [0.8, 9.0, -0.8, 1.5], [3.4, 6.0, -1.4, 1.3],
  ]) lump(crown, x, y, z, rad, r.range(0, 1));
  addMesh(g, crown, LEAF, { name: 'camphor-crown' });

  const under = [];
  for (const [x, y, z, rad] of [
    [-3.4, 5.6, 0.4, 1.3], [-1.0, 5.9, 1.9, 1.2], [1.4, 5.9, -1.6, 1.2],
    [-1.6, 6.0, -2.6, 1.2], [2.2, 5.7, 1.2, 1.1], [-4.4, 5.9, -1.6, 1.1],
  ]) lump(under, x, y, z, rad, r.range(0, 1));
  addMesh(g, under, LEAF_SHADE, { name: 'camphor-underside' });

  // Shimenawa round the trunk: this tree is enshrined, not landscaping.
  // Laid as twelve members round a ring rather than as one squat cylinder —
  // a ten-sided disc 0.26 m deep reads as a crate nailed to the bark, which
  // is precisely what the first pass looked like.
  const rope = [];
  const shide = [];
  const RR = 0.76;
  const ring = (i) => {
    const a = (i / 12) * Math.PI * 2;
    return [Math.cos(a) * RR - 0.24, 1.42 + Math.sin(a * 2) * 0.03, Math.sin(a) * RR - 0.04];
  };
  for (let i = 0; i < 12; i += 1) rope.push(member(ring(i), ring(i + 1), 0.085, 5));
  addMesh(g, rope, M.paper, { cast: false, name: 'camphor-shimenawa' });
  for (let i = 0; i < 6; i += 1) {
    const p = ring(i * 2);
    shideStrip(shide, p[0], p[1] - 0.1, p[2], 0.15, (i / 6) * Math.PI * 2);
  }
  addMesh(g, shide, M.paper, { cast: false, name: 'camphor-shide' });

  g.rotation.y = opts.ry ?? 0;
  return asProp(g, 'camphorTree', { joints: { fork: J.fork, crownY: 10.6 } });
}

/* ---- shide ----------------------------------------------------------- */

/** 紙垂 — the folded paper zigzag: four leaves stepping alternately, hung
 *  from (x, y, z) downward.  Pushed into a caller's geometry list so a
 *  whole rope's worth is one mesh. */
export function shideStrip(geoms, x, y, z, w = 0.13, ry = 0) {
  const step = w * 0.7;
  for (let i = 0; i < 4; i += 1) {
    const s = i % 2 ? 1 : -1;
    geoms.push(bx(w, w * 0.92, 0.012, x + s * step * 0.5, y - w * 0.5 - i * w * 0.8, z, { ry }));
  }
}

/* ---- warding charms -------------------------------------------------- */

/**
 * 御札掛け — a warding-charm rack: two posts, two rails, and a wall of
 * small pink tags hung off them.  `face` is the direction the tags LOOK
 * (radians); the tags are thin plates whose front normal follows it, so a
 * rack that is meant to be watching something can be pointed at it and
 * read as watching it from anywhere in the frame.
 *
 * Origin on the ground at the rack's plan centre, run along local x.
 */
export function charmRack(opts = {}) {
  const { len = 3.2, h = 1.9, tags = 26, seed = 1, face = 0 } = opts;
  const r = rng(seed + 47);
  const g = new THREE.Group();

  const frame = [];
  for (const s of [-1, 1]) frame.push(bx(0.13, h + SINK, 0.13, s * (len / 2), (h - SINK) / 2, 0));
  frame.push(bx(len + 0.34, 0.14, 0.16, 0, h - 0.07, 0));         // head rail
  frame.push(bx(len, 0.09, 0.12, 0, h - 0.62, 0));
  frame.push(bx(len, 0.09, 0.12, 0, h - 1.16, 0));
  addMesh(g, frame, M.cedar, { name: 'charm-rack-frame' });

  const paper = [];
  const cords = [];
  for (let i = 0; i < tags; i += 1) {
    const row = i % 3;
    const railY = [h - 0.09, h - 0.62, h - 1.16][row];
    const x = -len / 2 + 0.16 + ((i * 0.9137) % 1) * (len - 0.32);
    const drop = r.range(0.1, 0.2);
    const tw = r.range(0.1, 0.15);
    // thin in LOCAL Z, so `face` — which yaws the whole rack — is literally
    // the direction the tags look
    cords.push(cyl(0.011, 0.011, drop, 4, x, railY - drop / 2, 0.03));
    paper.push(bx(tw, tw * 1.55, 0.018, x, railY - drop - tw * 0.78, 0.045));
  }
  addMesh(g, paper, M.blossom, { cast: false, name: 'charm-rack-tags' });
  addMesh(g, cords, M.joinery, { cast: false });

  g.rotation.y = face;
  return asProp(g, 'charmRack', { joints: { railY: h - 0.09 } });
}

/* ---- the broom ------------------------------------------------------- */

/** 竹箒 — a bamboo broom leaning against a wall, bristles on the ground.
 *  `lean` is the tilt off plumb; origin at the bristle end on the ground. */
export function broom(opts = {}) {
  const g = new THREE.Group();
  const lean = opts.lean ?? 0.34;
  const L = 1.72;
  const tip = [0, Math.cos(lean) * L, -Math.sin(lean) * L];
  addMesh(g, [member([0, 0.12, 0], tip, 0.032, 6)], M.cedar, { name: 'broom-handle' });
  const bristles = [];
  for (let i = 0; i < 7; i += 1) {
    const a = -0.4 + (i / 6) * 0.8;
    bristles.push(member([0, 0.3, -0.06], [Math.sin(a) * 0.26, 0.01, 0.3], 0.017, 4));
  }
  bristles.push(cyl(0.055, 0.05, 0.16, 6, 0, 0.3, -0.03));
  addMesh(g, bristles, M.cedarPale, { cast: false, name: 'broom-bristles' });
  g.rotation.y = opts.ry ?? 0;
  return asProp(g, 'broom');
}

/* ---- ground furniture ------------------------------------------------ */

/**
 * A cluster of mossed field stones, seeded.  Pushed into the caller's
 * two geometry lists (stone, moss) so a whole bank's worth of them is two
 * meshes rather than sixty.  `groundAt` is queried per stone — a rock
 * seated from a remembered height floats the moment terrain changes.
 */
export function mossStones(stone, moss, { x, z, n = 5, spread = 1.6, size = 0.5, seed = 1, groundAt }) {
  const r = rng(seed + 61);
  for (let i = 0; i < n; i += 1) {
    const px = x + r.range(-spread, spread);
    const pz = z + r.range(-spread, spread);
    const s = size * r.range(0.6, 1.35);
    const y = groundAt(px, pz);
    stone.push(cyl(s * 0.62, s * 0.9, s * 0.85, r.int(5, 6), px, y + s * 0.34, pz, { ry: r.range(0, 3) }));
    if (r.chance(0.75)) {
      moss.push(cyl(s * 0.7, s * 0.95, s * 0.2, 6, px, y + s * 0.16, pz, { ry: r.range(0, 3) }));
    }
  }
}

/** A standing stone marker (社号標): a battered stele on a two-step base. */
export function stele(opts = {}) {
  const { h = 2.05, w = 0.42 } = opts;
  const g = new THREE.Group();
  addMesh(g, [
    bx(w + 0.62, 0.22 + SINK, w + 0.62, 0, (0.22 - SINK) / 2, 0),
    bx(w + 0.32, 0.18, w + 0.32, 0, 0.31, 0),
  ], M.stoneDeep, { name: 'stele-base' });
  addMesh(g, [bx(w, h, w * 0.82, 0, 0.4 + h / 2, 0), bx(w + 0.05, 0.08, w * 0.87, 0, 0.44 + h, 0)],
    M.stonePale, { name: 'stele-shaft' });
  addMesh(g, [cyl(w * 0.66, w * 0.72, 0.13, 6, 0, 0.46, 0)], M.moss, { cast: false, name: 'stele-moss' });
  g.rotation.y = opts.ry ?? 0;
  return asProp(g, 'stele', { joints: { topY: 0.48 + h } });
}

/* ---- the grove behind the hall --------------------------------------- */

/**
 * A stand of slender trees, merged into two pools.  This is BACKDROP, not
 * a prop: the shrine hall stood against bare sky from every approach until
 * something grew behind it, and a dozen tagged units on the terrace's back
 * apron would have been a dozen bbox-overlap pairs for nothing.  Trunks
 * are returned so the district can collide them one by one.
 */
export function grove(bark, crown, under, { spots, seed = 1, groundAt }) {
  const r = rng(seed + 73);
  const trunks = [];
  for (const [x, z, scale] of spots) {
    const y = groundAt(x, z);
    // short in the bole and deep in the crown.  A tall bare trunk with one
    // ball on it is a lollipop, and a row of lollipops behind a shrine hall
    // is worse than bare sky — the crown starts a third of the way up and
    // three lumps overlap down it, so the stand reads as one dark hedge.
    const h = (3.1 + r.range(0, 1.3)) * scale;
    const lean = r.range(-0.14, 0.14);
    const top = [x + lean * h, y + h, z + r.range(-0.12, 0.12) * h];
    bark.push(member([x, y - SINK, z], top, 0.24 * scale, 7));
    const rad = (1.25 + r.range(0, 0.45)) * scale;
    lump(crown, top[0], top[1] + rad * 0.34, top[2], rad, r.range(0, 1));
    lump(crown, top[0] + r.range(-0.8, 0.8), top[1] - rad * 0.42, top[2] + r.range(-0.8, 0.8),
      rad * 0.88, r.range(0, 1));
    lump(crown, top[0] + r.range(-0.6, 0.6), top[1] + rad * 0.92, top[2] + r.range(-0.6, 0.6),
      rad * 0.62, r.range(0, 1));
    lump(under, top[0] + r.range(-0.6, 0.6), top[1] - rad * 1.02, top[2] + r.range(-0.6, 0.6),
      rad * 0.72, r.range(0, 1));
    trunks.push([x, z, 0.34 * scale]);
  }
  return trunks;
}
