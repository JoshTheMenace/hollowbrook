import * as THREE from 'three';
import { gableRoof, shedRoof } from '../builders.js';
import {
  M, TONE, SINK, ASPECT, rng, bx, addMesh, board, printed, practical, asProp, rect,
} from './common.js';
import { tenantOf, tenantFascia, tenantPlate, tenantNoren } from './signage.js';

/* ------------------------------------------------------------------ *
 * The town fabric: the gabled timber shopfront and the tiled dwelling
 * every lane is made of.  Both face LOCAL +Z.
 * ------------------------------------------------------------------ */

/* ---- machiya ---------------------------------------------------------- */

/** Resolved dimensions — shared by the generator and by `footprint`, so the
 *  collider can never drift from the building. */
function machiyaDims(o = {}) {
  const seed = o.seed ?? 1;
  const r = rng(seed);
  const w = o.w ?? Number((5.6 + r() * 1.4).toFixed(2));   // 5.6 .. 7.0 m
  const d = o.d ?? Number((4.6 + r() * 0.9).toFixed(2));   // 4.6 .. 5.5 m
  return {
    seed, w, d, ry: o.ry ?? 0,
    tenant: tenantOf(o.tenant ?? 0),
    head: 2.45,          // shopfront head beam top — 2.2 m clear at the door
    fasciaTop: 3.30,     // top of the fascia band
    eave: 3.45,          // hisashi (penthouse eave) height
    wallTop: o.wallTop ?? 5.15,
    pitch: o.pitch ?? 0.46,
    lantern: o.lantern ?? true,
    noren: o.noren ?? true,
  };
}

/**
 * 町家 — the gabled timber shopfront: fascia board over a sliding door
 * bay, a low first floor with its rail and lattice, a hisashi eave over
 * the frontage, a projecting side plate and (optionally) a noren.
 *
 * ~5.6–7.0 m wide, ridge ~6.4 m, doors 2.2 m clear.  `opts.tenant` picks
 * one of the seven shops in the plan's signage table; `opts.seed` varies
 * width, depth, which door panel stands open and where the crates sit.
 *
 * @example
 *   const g = machiya({ seed: 4, tenant: 'kissaten', ry: Math.PI });
 *   g.position.set(x, ctx.groundAt(x, z), z);
 *   ctx.add(g, 'shop-kissaten');
 *   for (const c of machiya.footprint({ seed: 4, ry: Math.PI }))
 *     ctx.collide(x + c.x0, z + c.z0, x + c.x1, z + c.z1);
 */
export function machiya(opts = {}) {
  const D = machiyaDims(opts);
  const { w, d, head, fasciaTop, eave, wallTop, pitch } = D;
  const r = rng(D.seed + 17);
  const t = D.tenant;
  const g = new THREE.Group();
  const T = 0.17;              // wall thickness
  const zf = d / 2;            // frontage plane
  const hw = w / 2;

  /* --- plaster: back, sides, the upper frontage bands, gable ends ---- */
  const plaster = [];
  plaster.push(bx(w, wallTop + SINK, T, 0, (wallTop - SINK) / 2, -zf + T / 2));
  for (const s of [-1, 1]) plaster.push(bx(T, wallTop + SINK, d, s * (hw - T / 2), (wallTop - SINK) / 2, 0));
  // frontage above the shop: a sill band, a 0.85 m lattice void, then the
  // upper wall to the eave line
  plaster.push(bx(w, 0.26, T, 0, fasciaTop + 0.13, zf - T / 2));
  plaster.push(bx(w, wallTop - (fasciaTop + 1.11), T, 0, (wallTop + fasciaTop + 1.11) / 2, zf - T / 2));
  // gable ends: four courses stepping to the ridge, so the wall meets the
  // roof planes mid-thickness the way gableRoof's header describes
  const ridgeY = Math.tan(pitch) * (d / 2);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i += 1) {
      const y0 = (ridgeY * i) / 4;
      const y1 = (ridgeY * (i + 1)) / 4;
      const dep = d * (1 - (i + 0.5) / 4);
      plaster.push(bx(T, y1 - y0 + 0.02, dep, s * (hw - T / 2), wallTop + (y0 + y1) / 2, 0));
    }
  }
  addMesh(g, plaster, M.plaster, { name: 'machiya-walls' });

  /* --- cedar frame: corner posts, shopfront posts, head beam --------- */
  const cedar = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) cedar.push(bx(0.17, wallTop, 0.17, sx * (hw - 0.085), wallTop / 2, sz * (zf - 0.085)));
  }
  const bays = 4;
  for (let i = 0; i <= bays; i += 1) {
    const x = -hw + 0.09 + (i * (w - 0.18)) / bays;
    cedar.push(bx(0.13, head, 0.15, x, head / 2, zf - 0.075));
  }
  cedar.push(bx(w, 0.22, 0.18, 0, head - 0.11, zf - 0.09));       // head beam
  cedar.push(bx(w, 0.16, 0.18, 0, 0.08, zf - 0.09));              // threshold sill
  cedar.push(bx(w - 0.3, 0.14, 0.16, 0, fasciaTop + 0.33, zf - 0.08)); // first-floor sill
  addMesh(g, cedar, M.cedar, { name: 'machiya-frame' });

  /* --- dark joinery: lattice, first-floor rail, door stiles ---------- */
  const joinery = [];
  const latY0 = fasciaTop + 0.40;
  const latY1 = fasciaTop + 1.11;
  joinery.push(bx(w - 0.34, latY1 - latY0, 0.05, 0, (latY0 + latY1) / 2, zf - T - 0.02)); // mushikomado backing
  for (let i = 0; i < 13; i += 1) {
    const x = -hw + 0.34 + (i * (w - 0.68)) / 12;
    joinery.push(bx(0.045, latY1 - latY0, 0.07, x, (latY0 + latY1) / 2, zf - T + 0.03));
  }
  // first-floor rail in front of the lattice
  const railY = fasciaTop + 0.46;
  joinery.push(bx(w - 0.2, 0.07, 0.08, 0, railY + 0.62, zf + 0.05));
  joinery.push(bx(w - 0.2, 0.06, 0.08, 0, railY, zf + 0.05));
  for (let i = 0; i < 11; i += 1) {
    const x = -hw + 0.2 + (i * (w - 0.4)) / 10;
    joinery.push(bx(0.04, 0.62, 0.05, x, railY + 0.31, zf + 0.05));
  }
  addMesh(g, joinery, M.joinery, { name: 'machiya-joinery' });

  /* --- glazed sliding doors: one bay left open, seeded ---------------- */
  const glass = [];
  const openBay = r.int(0, bays - 1);
  for (let i = 0; i < bays; i += 1) {
    if (i === openBay) continue;
    const x = -hw + 0.09 + ((i + 0.5) * (w - 0.18)) / bays;
    glass.push(bx((w - 0.18) / bays - 0.14, head - 0.42, 0.05, x, 0.16 + (head - 0.42) / 2, zf - 0.075));
  }
  const glazing = addMesh(g, glass, M.glass, { cast: false, name: 'machiya-glazing' });

  /* --- stone: genkan step, and a seeded crate or two ----------------- */
  const stone = [bx(w * 0.5, 0.15, 0.72, 0, 0.075 - SINK, zf + 0.34)];
  addMesh(g, stone, M.stone, { name: 'machiya-step' });
  const crates = [];
  const nCrates = r.int(0, 2);
  for (let i = 0; i < nCrates; i += 1) {
    const cw = r.range(0.42, 0.58);
    crates.push(bx(cw, cw * 0.7, cw * 0.8, r.range(-hw + 0.6, hw - 0.6), (cw * 0.7) / 2 - SINK, zf + r.range(0.85, 1.15),
      { ry: r.range(-0.4, 0.4) }));
  }
  addMesh(g, crates, M.cedarPale, { name: 'machiya-crates' });

  /* --- roofs: NEVER hand-placed planes ------------------------------- */
  const roof = gableRoof({
    w, d, pitch, overhang: 0.62, thickness: 0.14, ridgeAxis: 'x',
    mat: M.tile, ridgeMat: M.tilePale, trimMat: M.cedarDark,
  });
  roof.position.set(0, wallTop, 0);
  roof.userData.airborne = true;
  g.add(roof);

  const hisashi = shedRoof({ w: w + 0.5, d: 1.15, pitch: 0.30, overhang: 0.22, thickness: 0.1, downhill: 'z+', mat: M.tile });
  hisashi.position.set(0, eave, zf + 0.42);
  hisashi.userData.airborne = true;
  g.add(hisashi);
  // eave brackets, cut to the roof's own low-wall height rather than guessed
  const brackets = [];
  for (const s of [-1, 1]) {
    brackets.push(bx(0.1, 0.1, 0.95, s * (hw - 0.3), eave + hisashi.userData.highWallY - 0.12, zf + 0.3));
  }
  addMesh(g, brackets, M.cedar, { name: 'machiya-brackets' });

  /* --- signage: every face at its native aspect ---------------------- */
  const fasciaW = w - 0.5;
  board(g, tenantFascia(t), fasciaW, ASPECT.fascia, {
    at: [0, (head + 0.06 + fasciaTop) / 2, zf + 0.05], mat: M.cedarDark,
  });
  // projecting side plate (sode-kanban): normal along +x, so it reads from
  // down the street rather than only from straight ahead
  board(g, tenantPlate(t), 1.5, ASPECT.plate, {
    at: [hw + 0.16, 2.02, zf - 0.62], ry: Math.PI / 2, mat: M.cedarDark,
  });
  addMesh(g, [bx(0.32, 0.07, 0.07, hw + 0.02, 2.02, zf - 0.62)], M.cedar, { cast: false });

  if (D.noren) {
    const noren = printed(tenantNoren(t), 1.62, ASPECT.noren, { doubleSide: true, transparent: true });
    noren.position.set(-0.05, head - 0.02 - noren.userData.signH / 2, zf + 0.12);
    g.add(noren);
    addMesh(g, [bx(1.72, 0.06, 0.06, -0.05, head + 0.01, zf + 0.12)], M.cedarDark, { cast: false });
  }

  /* --- the practical: one paper lantern by the door ------------------ */
  let lanternMesh = null;
  if (D.lantern) {
    addMesh(g, [bx(0.34, 0.06, 0.06, hw - 0.52, head + 0.14, zf + 0.16)], M.cedarDark, { cast: false });
    lanternMesh = addMesh(g, [
      new THREE.CylinderGeometry(0.15, 0.15, 0.32, 10).translate(hw - 0.66, head - 0.14, zf + 0.16),
    ], M.glow, { cast: false, receive: false, name: 'machiya-lantern' });
    practical(lanternMesh, { radius: 4 });
    addMesh(g, [
      cylCap(0.155, hw - 0.66, head + 0.03, zf + 0.16),
      cylCap(0.155, hw - 0.66, head - 0.31, zf + 0.16),
    ], M.cedarDark, { cast: false });
  }

  g.rotation.y = D.ry;
  return asProp(g, 'machiya', {
    joints: {
      // where a neighbouring machiya butts: party walls at ±w/2 on the
      // frontage line, and the door centre a district aims a route at
      partyWest: [-w / 2, 0, 0], partyEast: [w / 2, 0, 0],
      door: [0, 0, zf + 0.55], ridgeY: wallTop + Math.tan(pitch) * (d / 2),
    },
    interact: { label: `Look in at ${t.title}`, verb: 'look', hitbox: glazing },
  });
}

function cylCap(r, x, y, z) {
  return new THREE.CylinderGeometry(r, r, 0.045, 10).translate(x, y, z);
}

machiya.footprint = (o = {}) => {
  const D = machiyaDims(o);
  return [rect(0, 0, D.w / 2, D.d / 2, D.ry)];
};

/* ---- rowhouse --------------------------------------------------------- */

const ROWHOUSE_VARIANTS = [
  { w: 5.0, d: 5.6, wallTop: 2.85, pitch: 0.52, porch: true, shutters: 2 },
  { w: 5.8, d: 5.0, wallTop: 3.15, pitch: 0.44, porch: false, shutters: 3 },
  { w: 4.4, d: 6.0, wallTop: 2.70, pitch: 0.56, porch: true, shutters: 1 },
];

function rowhouseDims(o = {}) {
  const seed = o.seed ?? 1;
  const r = rng(seed);
  const v = ROWHOUSE_VARIANTS[o.variant ?? r.int(0, ROWHOUSE_VARIANTS.length - 1)];
  return { seed, ry: o.ry ?? 0, ...v, ...(o.w ? { w: o.w } : {}), ...(o.d ? { d: o.d } : {}) };
}

/**
 * 長屋 — the modest tiled dwelling the lanes are made of: a genkan step
 * up to a sliding entrance, shuttered windows, a tiled gable, and on two
 * of the three variants a small shed porch over the door.
 *
 * Three seeded variants (`opts.variant` pins one).  No accent colour: the
 * amber belongs to the shopfronts and the pink to the shrine, and a lane
 * of houses that reached for either would spend the town's whole budget
 * of loud on the quietest thing in it.
 */
export function rowhouse(opts = {}) {
  const D = rowhouseDims(opts);
  const { w, d, wallTop, pitch, porch, shutters } = D;
  const r = rng(D.seed + 41);
  const g = new THREE.Group();
  const T = 0.16;
  const zf = d / 2;
  const hw = w / 2;
  const ridgeY = Math.tan(pitch) * (d / 2);

  const plaster = [];
  plaster.push(bx(w, wallTop + SINK, T, 0, (wallTop - SINK) / 2, -zf + T / 2));
  for (const s of [-1, 1]) plaster.push(bx(T, wallTop + SINK, d, s * (hw - T / 2), (wallTop - SINK) / 2, 0));
  // frontage: solid either side of a 1.5 m entrance bay
  const doorW = 1.5;
  for (const s of [-1, 1]) {
    const segW = hw - doorW / 2;
    plaster.push(bx(segW, wallTop + SINK, T, s * (hw - segW / 2), (wallTop - SINK) / 2, zf - T / 2));
  }
  plaster.push(bx(doorW, wallTop - 2.15, T, 0, (wallTop + 2.15) / 2, zf - T / 2)); // over the door
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i += 1) {
      const y0 = (ridgeY * i) / 4;
      const y1 = (ridgeY * (i + 1)) / 4;
      plaster.push(bx(T, y1 - y0 + 0.02, d * (1 - (i + 0.5) / 4), s * (hw - T / 2), wallTop + (y0 + y1) / 2, 0));
    }
  }
  addMesh(g, plaster, M.plasterShade, { name: 'rowhouse-walls' });

  const cedar = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) cedar.push(bx(0.15, wallTop, 0.15, sx * (hw - 0.075), wallTop / 2, sz * (zf - 0.075)));
  }
  cedar.push(bx(doorW + 0.3, 0.18, 0.16, 0, 2.24, zf - 0.08));  // door head
  cedar.push(bx(doorW + 0.3, 0.12, 0.16, 0, 0.06, zf - 0.08));  // door sill
  // shuttered windows along the frontage, seeded left/right
  const shutterY = 1.55;
  for (let i = 0; i < shutters; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (doorW / 2 + 0.45 + Math.floor(i / 2) * 1.35);
    if (Math.abs(x) > hw - 0.55) continue;
    cedar.push(bx(1.0, 0.9, 0.08, x, shutterY, zf - 0.02));
    cedar.push(bx(1.12, 0.1, 0.14, x, shutterY + 0.52, zf - 0.02));
  }
  addMesh(g, cedar, M.cedar, { name: 'rowhouse-frame' });

  const joinery = [];
  for (const s of [-1, 1]) joinery.push(bx(doorW / 2 - 0.04, 2.1, 0.05, s * doorW / 4, 1.16, zf - 0.09));
  addMesh(g, joinery, M.joinery, { name: 'rowhouse-door' });

  addMesh(g, [bx(doorW + 0.5, 0.14, 0.66, 0, 0.07 - SINK, zf + 0.31)], M.stone, { name: 'rowhouse-genkan' });

  const roof = gableRoof({
    w, d, pitch, overhang: 0.5, thickness: 0.13, ridgeAxis: 'x',
    mat: M.tile, ridgeMat: M.tilePale, trimMat: M.cedarDark,
  });
  roof.position.set(0, wallTop, 0);
  roof.userData.airborne = true;
  g.add(roof);

  if (porch) {
    const p = shedRoof({ w: doorW + 1.0, d: 0.95, pitch: 0.28, overhang: 0.18, thickness: 0.09, downhill: 'z+', mat: M.tilePale });
    p.position.set(0, 2.52, zf + 0.38);
    p.userData.airborne = true;
    g.add(p);
    addMesh(g, [
      bx(0.09, 0.09, 0.8, -doorW / 2 - 0.2, 2.52 + p.userData.highWallY - 0.1, zf + 0.25),
      bx(0.09, 0.09, 0.8, doorW / 2 + 0.2, 2.52 + p.userData.highWallY - 0.1, zf + 0.25),
    ], M.cedar, { cast: false });
  }

  // dressing: a water butt, a broom, a potted plant — the "somebody lives
  // here ten minutes ago" layer, all seeded
  const dress = [];
  const bx0 = r.chance(0.5) ? -1 : 1;
  dress.push(new THREE.CylinderGeometry(0.28, 0.26, 0.62, 8).translate(bx0 * (hw - 0.45), 0.31 - SINK, zf + 0.45));
  addMesh(g, dress, M.cedarDark, { name: 'rowhouse-butt' });
  const pots = [];
  const nPots = r.int(1, 3);
  for (let i = 0; i < nPots; i += 1) {
    const px = -bx0 * (hw - 0.4 - i * 0.42);
    pots.push(new THREE.CylinderGeometry(0.13, 0.1, 0.24, 7).translate(px, 0.12 - SINK, zf + r.range(0.34, 0.5)));
  }
  addMesh(g, pots, M.stonePale, { name: 'rowhouse-pots' });

  g.rotation.y = D.ry;
  return asProp(g, 'rowhouse', {
    joints: { partyWest: [-hw, 0, 0], partyEast: [hw, 0, 0], door: [0, 0, zf + 0.6], ridgeY: wallTop + ridgeY },
  });
}

rowhouse.footprint = (o = {}) => {
  const D = rowhouseDims(o);
  return [rect(0, 0, D.w / 2, D.d / 2, D.ry)];
};
rowhouse.VARIANTS = ROWHOUSE_VARIANTS.length;
