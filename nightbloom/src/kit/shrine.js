import * as THREE from 'three';
import { gableRoof, shedRoof, stairs } from '../builders.js';
import {
  M, SINK, ASPECT, rng, bx, cyl, plank, addMesh, board, printed,
  practical, lanternRig, asProp, rect, surf,
} from './common.js';
import { shrinePlate, shrineNotice } from './signage.js';

/* ------------------------------------------------------------------ *
 * 宵坂神社 — the shrine vocabulary: the hall, the gate, the lanterns.
 *
 * This file owns the town's blossom pink (`M.blossom`).  Nothing outside
 * the shrine may reach for it — see the palette rule in common.js — and
 * it is spent here on exactly three things: the charm tags on the torii,
 * the bell rope's bands, and the ema plaques.  Everything else is the
 * same weathered cedar and stone as the rest of the town, which is what
 * makes those three read at all.
 *
 * NO VERMILION.  A country shrine is unpainted cedar gone silver; the
 * red-gate cliché would also spend a third saturated accent the palette
 * has not got.
 * ------------------------------------------------------------------ */

/* ---- shrineHall ------------------------------------------------------- */

/** Resolved dimensions — shared by the generator, `footprint` and
 *  `surfaces`, so the collider and the walkable deck can never drift from
 *  the building. */
function shrineHallDims(o = {}) {
  const w = o.w ?? 5.4;
  const d = o.d ?? 4.6;
  const apron = o.apron ?? 0.55;          // veranda oversail on every side
  const floor = o.floor ?? 0.54;          // veranda deck TOP
  const treads = 3;
  return {
    seed: o.seed ?? 1,
    ry: o.ry ?? 0,
    w, d, apron, floor, treads,
    wallTop: o.wallTop ?? floor + 2.85,
    pitch: o.pitch ?? 0.58,
    doorW: o.doorW ?? 2.2,
    rise: floor / treads,
    run: 0.42,                            // over the 0.36 m the route fill needs
    stepW: 2.3,
    zv: d / 2 + apron,                    // veranda front edge
  };
}

/**
 * 社殿 — the small shrine hall: a stone plinth, a boarded veranda with its
 * low rail, a three-tread flight to a 2.05 m sliding door, the offering
 * box and the bell rope, a deep-eaved cedar-shingle gable and a kohai
 * canopy over the steps.
 *
 * ~5.4 × 4.6 m on plan, ridge ~5.0 m, deck 0.54 m over the ground.  The
 * veranda is WALKABLE — `shrineHall.surfaces(opts)` hands a district the
 * deck and the three treads for `ctx.platform`, and `footprint(opts)`
 * gives only the hall body, so the player can walk the veranda round it.
 *
 * @example
 *   const g = shrineHall({ seed: 2, ry: Math.PI });
 *   g.position.set(x, ctx.groundAt(x, z), z);
 *   ctx.add(g, 'shrine-hall');
 *   for (const c of shrineHall.footprint({ ry: Math.PI })) ctx.collide(x + c.x0, z + c.z0, x + c.x1, z + c.z1);
 *   for (const s of shrineHall.surfaces({ ry: Math.PI })) ctx.platform(x + s.x0, z + s.z0, x + s.x1, z + s.z1, s.top);
 */
export function shrineHall(opts = {}) {
  const D = shrineHallDims(opts);
  const { w, d, apron, floor, wallTop, pitch, doorW, treads, rise, run, stepW, zv } = D;
  const r = rng(D.seed + 23);
  const g = new THREE.Group();
  const T = 0.18;
  const hw = w / 2;
  const zf = d / 2;
  const pw = w + apron * 2;     // plinth / deck plan size
  const pd = d + apron * 2;
  const headY = floor + 2.15;   // door head — 2.05 m clear leaf under it

  /* --- plinth and deck ---------------------------------------------- */
  addMesh(g, [bx(pw, floor - 0.14 + SINK, pd, 0, (floor - 0.14 - SINK) / 2, 0)], M.stoneDeep, { name: 'shrine-plinth' });
  addMesh(g, [bx(pw, 0.14, pd, 0, floor - 0.07, 0)], M.cedarPale, { name: 'shrine-deck' });

  /* --- walls: back, sides, the two front piers and the door lintel --- */
  const plaster = [];
  const wallH = wallTop - floor;
  plaster.push(bx(w, wallH, T, 0, floor + wallH / 2, -zf + T / 2));
  for (const s of [-1, 1]) plaster.push(bx(T, wallH, d, s * (hw - T / 2), floor + wallH / 2, 0));
  const pierW = (w - doorW) / 2;
  for (const s of [-1, 1]) plaster.push(bx(pierW, wallH, T, s * (hw - pierW / 2), floor + wallH / 2, zf - T / 2));
  plaster.push(bx(doorW, wallTop - headY, T, 0, (wallTop + headY) / 2, zf - T / 2));
  // gable ends stepping to the ridge, so the wall meets the roof planes
  // mid-thickness the way gableRoof's header describes
  const ridgeY = Math.tan(pitch) * (d / 2);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i += 1) {
      const y0 = (ridgeY * i) / 4;
      const y1 = (ridgeY * (i + 1)) / 4;
      plaster.push(bx(T, y1 - y0 + 0.02, d * (1 - (i + 0.5) / 4), s * (hw - T / 2), wallTop + (y0 + y1) / 2, 0));
    }
  }
  addMesh(g, plaster, M.plaster, { name: 'shrine-walls' });

  /* --- cedar frame -------------------------------------------------- */
  const cedar = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) cedar.push(bx(0.19, wallH, 0.19, sx * (hw - 0.095), floor + wallH / 2, sz * (zf - 0.095)));
  }
  cedar.push(bx(w, 0.24, 0.2, 0, headY + 0.12, zf - 0.1));            // door head beam
  cedar.push(bx(w, 0.16, 0.2, 0, floor + 0.08, zf - 0.1));            // threshold
  cedar.push(bx(w + 0.16, 0.16, 0.2, 0, wallTop - 0.08, zf - 0.02));  // frieze under the eave
  // kohai posts: two cedar columns off the front of the veranda carrying
  // the step canopy, standing on the GROUND beside the flight
  const kohaiY = floor + 2.05;
  const kohaiD = 1.5;
  const kohaiZ = zv + 1.05;
  const kohaiPostTop = kohaiY - Math.tan(0.3) * (kohaiZ + kohaiD / 2 - 0.14 - kohaiZ);
  for (const s of [-1, 1]) cedar.push(bx(0.16, kohaiPostTop + SINK, 0.16, s * 1.52, (kohaiPostTop - SINK) / 2, kohaiZ + 0.5));
  addMesh(g, cedar, M.cedar, { name: 'shrine-frame' });

  /* --- joinery: the two door leaves and the transom lattice ---------- */
  const joinery = [];
  for (const s of [-1, 1]) joinery.push(bx(doorW / 2 - 0.05, 2.05, 0.07, (s * doorW) / 4, floor + 1.06, zf - 0.13));
  for (let i = 0; i < 9; i += 1) {
    joinery.push(bx(0.05, 0.3, 0.06, -doorW / 2 + 0.16 + (i * (doorW - 0.32)) / 8, headY + 0.34, zf - 0.06));
  }
  addMesh(g, joinery, M.joinery, { name: 'shrine-door' });

  /* --- veranda rail (kouran): three sides, gapped at the flight ------ */
  const rail = [];
  const railY = floor + 0.52;
  const put = (x, z) => rail.push(bx(0.09, 0.52, 0.09, x, floor + 0.26, z));
  for (let i = 0; i <= 6; i += 1) {
    const z = -pd / 2 + 0.1 + (i * (pd - 0.2)) / 6;
    for (const s of [-1, 1]) put(s * (pw / 2 - 0.1), z);
  }
  for (const s of [-1, 1]) {
    rail.push(bx(0.1, 0.08, pd - 0.2, s * (pw / 2 - 0.1), railY, 0));
    rail.push(bx(0.1, 0.06, pd - 0.2, s * (pw / 2 - 0.1), floor + 0.24, 0));
  }
  rail.push(bx(pw - 0.2, 0.08, 0.1, 0, railY, -pd / 2 + 0.1));         // back run
  for (const s of [-1, 1]) {                                            // front, gapped for the steps
    const segW = (pw - stepW - 0.3) / 2;
    rail.push(bx(segW, 0.08, 0.1, s * (pw / 2 - segW / 2 - 0.1), railY, pd / 2 - 0.1));
    for (let i = 0; i <= 2; i += 1) put(s * (pw / 2 - 0.1 - (i * (segW - 0.2)) / 2), pd / 2 - 0.1);
  }
  addMesh(g, rail, M.cedarDark, { name: 'shrine-rail' });

  /* --- the flight: builders' stairs, never hand-placed treads -------- */
  const flight = stairs({ w: stepW, rise, run, steps: treads, dir: 'z-', at: [0, 0, zv + treads * run], mat: M.stone });
  flight.name = 'shrine-steps';
  g.add(flight);

  /* --- offering box, bell rope, suzu --------------------------------- */
  const box = [bx(1.16, 0.56, 0.62, 0, floor + 0.28, zf + 0.36)];
  for (let i = 0; i < 7; i += 1) box.push(bx(0.1, 0.07, 0.6, -0.48 + i * 0.16, floor + 0.58, zf + 0.36));
  addMesh(g, box, M.cedarDark, { name: 'shrine-offering-box' });

  // The bell hangs from a beam UNDER the eave, and the eave line is read
  // off the roof's own derivation rather than remembered: at z = zf + 0.34
  // the gable's mid-surface is wallTop + ridgeY - tan(pitch)·z, so a beam
  // top over that is a box growing through the roof — which renders as a
  // small dark block on the shingles and nothing measures it.
  const eaveHere = wallTop + ridgeY - Math.tan(pitch) * (zf + 0.34) - 0.14;
  const suzuY = Math.min(floor + 2.62, eaveHere - 0.28);
  addMesh(g, [bx(0.16, 0.16, 1.0, 0, suzuY + 0.2, zf + 0.34)], M.cedar, { cast: false });   // hanging beam
  addMesh(g, [cyl(0.15, 0.19, 0.3, 10, 0, suzuY - 0.05, zf + 0.34)], M.joinery, { name: 'shrine-suzu' });
  const ropeTop = suzuY - 0.2;
  const ropeBot = floor + 0.75;
  addMesh(g, [cyl(0.055, 0.055, ropeTop - ropeBot, 8, 0, (ropeTop + ropeBot) / 2, zf + 0.34)], M.paper, { name: 'shrine-rope' });
  addMesh(g, [
    cyl(0.07, 0.07, 0.12, 8, 0, ropeBot + 0.42, zf + 0.34),
    cyl(0.07, 0.07, 0.12, 8, 0, ropeBot + 0.92, zf + 0.34),
  ], M.blossom, { cast: false, name: 'shrine-rope-bands' });

  /* --- roofs --------------------------------------------------------- */
  const roof = gableRoof({
    w, d, pitch, overhang: 0.85, thickness: 0.16, ridgeAxis: 'x',
    mat: M.cedarDark, ridgeMat: M.tile, trimMat: M.cedar,
  });
  roof.position.set(0, wallTop, 0);
  roof.userData.airborne = true;
  g.add(roof);

  const kohai = shedRoof({ w: 3.5, d: kohaiD, pitch: 0.3, overhang: 0.25, thickness: 0.11, downhill: 'z+', mat: M.cedarDark });
  kohai.position.set(0, kohaiY, kohaiZ);
  kohai.userData.airborne = true;
  g.add(kohai);

  /* --- signage: name plate, ema rack, charm plaques ------------------ */
  board(g, shrinePlate(), 2.0, ASPECT.plate, { at: [0, headY + 0.42, zf + 0.02], mat: M.cedarDark });

  const rackX = -(hw + apron) - 0.05;
  const notice = printed(shrineNotice(), 0.46, ASPECT.notice, { doubleSide: false });
  notice.position.set(rackX - 0.06, 1.42, zf - 0.4);
  notice.rotation.y = -Math.PI / 2;
  g.add(notice);
  const rack = [];
  for (const s of [-1, 1]) rack.push(bx(0.11, 1.9 + SINK, 0.11, rackX, (1.9 - SINK) / 2, zf - 0.4 + s * 0.55));
  rack.push(bx(0.13, 0.12, 1.3, rackX, 1.86, zf - 0.4));
  rack.push(bx(0.13, 0.1, 1.3, rackX, 0.92, zf - 0.4));
  addMesh(g, rack, M.cedar, { name: 'shrine-ema-rack' });
  const ema = [];
  const nEma = r.int(5, 8);
  for (let i = 0; i < nEma; i += 1) {
    ema.push(bx(0.03, 0.18, 0.15, rackX + 0.06, 1.68 - r.range(0, 0.06), zf - 0.4 + r.range(-0.52, 0.52)));
  }
  addMesh(g, ema, M.blossom, { cast: false, name: 'shrine-ema' });

  /* --- practicals: a pair of lanterns under the front eave ----------- */
  lanternRig(g, [[-hw + 0.35, wallTop - 0.18, zf + 0.5], [hw - 0.35, wallTop - 0.18, zf + 0.5]],
    { r: 0.17, h: 0.36, radius: 5, name: 'shrine-lantern' });

  g.rotation.y = D.ry;
  return asProp(g, 'shrineHall', {
    joints: {
      door: [0, floor, zf + 0.05],
      approach: [0, 0, zv + treads * run + 0.4],   // the foot of the flight
      deckY: floor,
      ridgeY: wallTop + ridgeY,
    },
  });
}

shrineHall.footprint = (o = {}) => {
  const D = shrineHallDims(o);
  // the hall BODY only: the veranda is walkable, and a box round the whole
  // plinth is a shrine you can look at and never stand on
  return [rect(0, 0, D.w / 2, D.d / 2, D.ry)];
};

shrineHall.surfaces = (o = {}) => {
  const D = shrineHallDims(o);
  const { apron, w, d, floor, treads, rise, run, stepW, zv, ry } = D;
  const out = [surf(0, 0, (w + apron * 2) / 2 - 0.06, (d + apron * 2) / 2 - 0.06, ry, floor)];
  const zBot = zv + treads * run;
  for (let i = 0; i < treads; i += 1) {
    const z0 = zBot - i * run;
    const z1 = zBot - (i + 1) * run - 0.04;   // stairs() overlaps treads by 40 mm
    out.push(surf(0, (z0 + z1) / 2, stepW / 2, (z0 - z1) / 2, ry, (i + 1) * rise));
  }
  return out;
};

/* ---- torii ------------------------------------------------------------ */

function toriiDims(o = {}) {
  const h = Math.min(6, Math.max(4, o.h ?? 5.0));   // kasagi top, 4–6 m
  return {
    seed: o.seed ?? 1,
    ry: o.ry ?? 0,
    h,
    span: o.span ?? Number((h * 0.72).toFixed(2)),  // post centres
    postR: Number((0.15 + h * 0.02).toFixed(3)),
  };
}

/**
 * 鳥居 — the gate, in weathered cedar rather than vermilion: two battered
 * posts on stone kiso, a through-beam (nuki), the shimaki, and a kasagi
 * whose ends turn UP — the curve is sampled off a parabola and laid as
 * planks joint to joint, never as one box tilted by eye.
 *
 * `opts.h` is the height of the kasagi, clamped to 4–6 m; the post spacing
 * follows from it, so a small gate and a big one are the same gate.  Clear
 * passage is `span − 2·postR` (3.1 m at the 5 m default) and the nuki sits
 * well over 2 m, so a torii is never a door you cannot walk through.
 *
 * Pink is spent HERE: the charm tags knotted along the nuki, seeded by
 * `opts.seed`.
 */
export function torii(opts = {}) {
  const D = toriiDims(opts);
  const { h, span, postR } = D;
  const r = rng(D.seed + 5);
  const g = new THREE.Group();
  const hs = span / 2;
  const postTop = h - 0.52;

  /* --- posts, battered: fatter at the foot than at the head ---------- */
  const posts = [];
  for (const s of [-1, 1]) posts.push(cyl(postR, postR * 1.14, postTop + SINK, 9, s * hs, (postTop - SINK) / 2, 0));
  addMesh(g, posts, M.cedarDark, { name: 'torii-posts' });
  addMesh(g, [-1, 1].map((s) => cyl(postR * 1.5, postR * 1.72, 0.28, 8, s * hs, 0.14 - SINK, 0)), M.stone, { name: 'torii-kiso' });

  /* --- nuki (through beam), shimaki, gakuzuka ------------------------ */
  const timber = [];
  const nukiY = postTop * 0.76;
  timber.push(bx(span + 0.9, 0.26, 0.26, 0, nukiY, 0));
  const shimakiY = h - 0.34;
  timber.push(bx(span + 1.5, 0.24, 0.34, 0, shimakiY, 0));
  timber.push(bx(0.22, shimakiY - nukiY - 0.25, 0.28, 0, (shimakiY + nukiY) / 2, 0));  // gakuzuka strut
  addMesh(g, timber, M.cedar, { name: 'torii-beams' });

  /* --- kasagi: a shallow parabola, laid plank to plank --------------- */
  const kw = span + 1.9;
  const camber = 0.2;
  const yAt = (t) => h - camber + camber * (2 * t - 1) ** 2;
  const cap = [];
  const SEG = 8;
  for (let i = 0; i < SEG; i += 1) {
    const t0 = i / SEG;
    const t1 = (i + 1) / SEG;
    cap.push(plank(
      [-kw / 2 + kw * t0, yAt(t0), 0],
      [-kw / 2 + kw * t1, yAt(t1), 0],
      0.44, 0.24,
    ));
  }
  addMesh(g, cap, M.cedarDark, { name: 'torii-kasagi' });

  /* --- charm tags along the nuki: the shrine's pink ------------------ */
  const tags = [];
  const cords = [];
  const nTags = r.int(4, 7);
  for (let i = 0; i < nTags; i += 1) {
    const x = r.range(-hs + 0.4, hs - 0.4);
    const drop = r.range(0.16, 0.3);
    cords.push(cyl(0.014, 0.014, drop, 5, x, nukiY - 0.13 - drop / 2, 0.16));
    tags.push(bx(0.13, 0.2, 0.025, x, nukiY - 0.13 - drop - 0.1, 0.16));
  }
  addMesh(g, tags, M.blossom, { cast: false, name: 'torii-charms' });
  addMesh(g, cords, M.joinery, { cast: false });

  g.rotation.y = D.ry;
  return asProp(g, 'torii', {
    joints: {
      postWest: [-hs, 0, 0], postEast: [hs, 0, 0],
      centre: [0, 0, 0], clearW: span - postR * 2, headY: nukiY - 0.13,
    },
  });
}

torii.footprint = (o = {}) => {
  const D = toriiDims(o);
  const hx = D.postR * 1.8;
  return [-1, 1].map((s) => rect((s * D.span) / 2, 0, hx, hx, D.ry));
};

/* ---- stoneLantern ----------------------------------------------------- */

const TORO_SIZES = Object.freeze({ small: 1.15, large: 1.85 });

function stoneLanternDims(o = {}) {
  const H = TORO_SIZES[o.size] ?? TORO_SIZES.large;
  return { seed: o.seed ?? 1, ry: o.ry ?? 0, size: o.size ?? 'large', H, s: H / TORO_SIZES.large };
}

/**
 * 灯籠 — the stone lantern, in two sizes (`opts.size: 'small' | 'large'`,
 * 1.15 m and 1.85 m).  Hexagonal throughout: kiso, shaft, chudai, the
 * paper fire box with its glow, the kasa and the hoju finial, with a moss
 * skirt round the base because a stone that has stood in a shrine avenue
 * for a century is never clean at the foot.
 *
 * The fire box glow is a PRACTICAL — this is the town's most-scattered
 * light source and the one a night pass will find most of.
 */
export function stoneLantern(opts = {}) {
  const D = stoneLanternDims(opts);
  const { s } = D;
  const r = rng(D.seed + 11);
  const g = new THREE.Group();

  let y = 0;
  const stone = [];
  stone.push(cyl(0.3 * s, 0.37 * s, 0.24 * s + SINK, 6, 0, (0.24 * s - SINK) / 2, 0));
  y = 0.24 * s;
  stone.push(cyl(0.12 * s, 0.14 * s, 0.62 * s, 6, 0, y + 0.31 * s, 0));                 // sao
  y += 0.62 * s;
  stone.push(cyl(0.23 * s, 0.17 * s, 0.13 * s, 6, 0, y + 0.065 * s, 0));                // chudai
  y += 0.13 * s;
  const fireY = y;
  stone.push(cyl(0.44 * s, 0.1 * s, 0.28 * s, 6, 0, y + 0.34 * s + 0.14 * s, 0));       // kasa
  stone.push(cyl(0.0, 0.1 * s, 0.17 * s, 6, 0, y + 0.34 * s + 0.28 * s + 0.085 * s, 0)); // hoju
  addMesh(g, stone, M.stone, { name: 'toro-stone' });

  // fire box: paper shell, hex posts, and the glow inside it
  addMesh(g, [cyl(0.23 * s, 0.21 * s, 0.34 * s, 6, 0, fireY + 0.17 * s, 0)], M.paper, { name: 'toro-hibukuro' });
  const glow = addMesh(g, [cyl(0.17 * s, 0.16 * s, 0.28 * s, 6, 0, fireY + 0.17 * s, 0)], M.glow,
    { cast: false, receive: false, name: 'toro-glow' });
  practical(glow, { radius: 3.2 + 1.4 * s });

  // moss: a skirt at the foot and one patch riding up the shaft, seeded
  const moss = [cyl(0.39 * s, 0.41 * s, 0.08 * s, 6, 0, 0.04 * s - SINK, 0)];
  if (r.chance(0.7)) moss.push(cyl(0.145 * s, 0.15 * s, 0.16 * s, 6, 0, 0.24 * s + r.range(0.06, 0.4) * s, 0));
  addMesh(g, moss, M.moss, { cast: false, name: 'toro-moss' });

  g.rotation.y = D.ry;
  return asProp(g, 'stoneLantern', { joints: { flameY: fireY + 0.17 * s, topY: y + 0.62 * s } });
}

stoneLantern.footprint = (o = {}) => {
  const D = stoneLanternDims(o);
  return [rect(0, 0, 0.42 * D.s, 0.42 * D.s, D.ry)];
};
stoneLantern.SIZES = Object.keys(TORO_SIZES);
