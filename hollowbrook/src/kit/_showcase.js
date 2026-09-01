import * as THREE from 'three';
import { PAL, ACCENT, JOINERY } from '../palette.js';
import { M } from './mats.js';
import { box, seatOnGround } from '../builders.js';
import { cottage, longhouse, roundTower, temple, windmill, tradeFront } from './buildings.js';
import { bigTree, treeStand, hedgeRun } from './trees.js';
import {
  wellHead, cart, hayBale, hayRick, barrel, barrelStack, crate, crateStack,
  sackStack, logPile, chickenCoop, beehive, shrineStone, fenceRun, bannerPole,
  ladder, washingLine, marketStall, trough, mountingBlock, waymarker,
  kitchenGarden, torch, brazier, postLantern, bracketLantern, lanternString,
  interactive,
} from './props.js';
import { fasciaBoard, hangingSign, wallNotice, chalkedBoard, noticeBoardStand, platePost, paintedName, fingerpost } from './signkit.js';
import { place, tagProp } from './util.js';

/* ------------------------------------------------------------------ *
 * DEV ONLY. One of every generator, laid out in ranks with a name plate
 * by each, so the whole vocabulary can be reviewed in a dozen renders
 * instead of forty.
 *
 * This is NOT a district and is not part of the city. It exists so a
 * change to the kit can be SEEN, and audited, before six district agents
 * build on top of it.
 *
 *   RANK A  z = 0     the five building types
 *   RANK B  z = 16    yard and farm gear, front rank
 *   RANK C  z = 20.5  working gear and street furniture, back rank
 *   RANK D  z = 25    runs: fences, a hedge, a lantern string, washing
 *   RANK E  z = 30    signage on a length of wall, read from three metres
 *   RANK F  z = -14   the trees: the great oak, an orchard, yews
 *
 * THE GROUND IS TWO LEVELS ON PURPOSE. A fence, a hedge and a wall in
 * this kit all claim to STEP with the ground, and you cannot see that on
 * a flat slab: the bank at x = 12..22 falls 1.2 m and every run crosses
 * it.
 *
 * Every sign on the wall goes on its +Z face. `printedPlane` faces +z; a
 * sign put on the far side of a wall is simply not there, and the frame
 * comes back as a blank elevation.
 *
 * THE AUDIT WARNS ABOUT THE GROUND SLABS AND THAT IS CORRECT AND DECIDED.
 * `UNEXPLAINED-MASS` asks whether a bare block is deliberate; these are
 * the harness's stand-in for `core/terrain.js`, which the showcase does
 * not run because it is not a city. Everything else must come back clean.
 * ------------------------------------------------------------------ */

const BANK_X0 = 10;
const BANK_X1 = 22;
const BANK_Z0 = 22;      // the bank exists ONLY under the runs rank
const HIGH = 1.2;

/** The showcase's own ground: flat at 0 everywhere except a bank under the
 *  runs rank, which climbs 1.2 m over 12 m — so every "steps with the
 *  ground" claim in this kit is actually tested by something.
 *
 *  THE BANK IS CONFINED TO THE RUNS RANK ON PURPOSE. The spatial audit
 *  judges a run against a fitted straight base line, so a fence laid across
 *  flat-then-ramp-then-flat is three runs pretending to be one and fails at
 *  the kinks — which is a fact about the harness, not about the fence. Every
 *  run here crosses the bank and NOTHING ELSE stands on it. */
function groundHeight(x, z) {
  if (z < BANK_Z0) return 0;
  if (x <= BANK_X0) return 0;
  if (x >= BANK_X1) return HIGH;
  return HIGH * (x - BANK_X0) / (BANK_X1 - BANK_X0);
}

export const SHOWCASE_CAMERAS = {
  // the five types, three-quarter, from the height a person sees them
  buildings: { position: [-36, 3.4, 12.5], target: [-16, 4.4, 1], fov: 54 },
  buildings2: { position: [22, 4.0, 18], target: [4, 5.0, 1], fov: 52 },
  // LOW ANGLE UP AT THE THATCH EAVES — the roll, the soffit, the combing
  thatchLow: { position: [-19.5, 1.35, 7.2], target: [-17.6, 5.0, 1.2], fov: 58 },
  thatchLow2: { position: [-8.5, 1.3, 7.4], target: [-7.0, 5.6, 1.0], fov: 58 },
  // the ridge and the eyebrow dormers from above eye height
  thatchRidge: { position: [-14.0, 6.4, 10.5], target: [-15.0, 4.4, 0.5], fov: 50 },
  // the tower, and the mill mid-turn
  tower: { position: [10.5, 4.5, 14], target: [4.5, 8.0, 0], fov: 52 },
  mill: { position: [26, 6.5, 17], target: [17.5, 8.0, 0], fov: 50 },
  millSails: { position: [17.5, 7.5, 15], target: [17.5, 9.2, 0], fov: 44 },
  temple: { position: [36, 3.4, 13], target: [31, 5.0, 0], fov: 50 },
  // the great oak, from under it and from across the field
  oak: { position: [-30, 2.4, -4], target: [-22, 7.0, -14], fov: 55 },
  oakUnder: { position: [-24.5, 1.7, -10.5], target: [-22.2, 6.5, -14], fov: 62 },
  trees: { position: [4, 3.0, -3], target: [-4, 4.0, -14], fov: 52 },
  props: { position: [-30, 2.4, 20.5], target: [-22, 1.4, 16], fov: 52 },
  props2: { position: [-14, 2.4, 20.5], target: [-6, 1.4, 16], fov: 52 },
  props3: { position: [-30, 2.5, 25], target: [-22, 1.7, 20.5], fov: 52 },
  props4: { position: [-14, 2.5, 25], target: [-6, 1.7, 20.5], fov: 52 },
  runs: { position: [3, 3.2, 24], target: [15, 2.0, 31], fov: 58 },
  // the runs where they cross the BANK: the whole "steps with the ground" claim
  runsBank: { position: [26, 3.4, 24.5], target: [12, 1.4, 31], fov: 52 },
  // SIGNAGE AT THREE METRES, head-on, and along the wall for the hanging
  // board, whose plate faces along the street and is a sliver head-on
  signage: { position: [-14, 2.7, 33.6], target: [-14, 2.7, 30], fov: 44 },
  signage2: { position: [-4.5, 2.7, 33.6], target: [-4.5, 2.7, 30], fov: 44 },
  hangsign: { position: [-8.0, 3.9, 30.7], target: [-2.0, 3.75, 30.7], fov: 36 },
  lanterns: { position: [-3.5, 2.3, 21.8], target: [-2, 3.5, 26.2], fov: 52 },
  wide: { position: [-44, 26, 46], target: [2, 4, 2], fov: 55 },
};

/** A name plate in front of the item, low enough not to occlude it. */
function label(ctx, textStr, x, z, w = 1.6) {
  const p = platePost({ title: textStr, w, h: 0.24, postH: 0.9, seed: `lbl-${textStr}`, bg: PAL.paper, ink: PAL.ink });
  p.position.set(x, 0, z);   // plates face +z, which is where every camera is
  seatOnGround(p, ctx.groundAt);
  ctx.add(p, `label-${textStr.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
}

export function buildShowcase(ctx) {
  /* ---- the ground: flat, plus a bank under the runs rank ------------- */
  ctx.add(box(96, 1.2, 47, M.turf, 0, -0.6, -1.5), 'ground-flat');
  ctx.platform(-48, -25, 48, BANK_Z0, 0);
  ctx.add(box(58, 1.2, 15, M.turf, -19, -0.6, 29.5), 'ground-runs-low');
  ctx.platform(-48, BANK_Z0, BANK_X0, 37, 0);
  /* the bank, in 24 steps. It has to be FINER than the shortest panel any
   * run in this kit lays, or the harness's own staircase is what the audit
   * reports instead of the run — the first pass used eight 1.5 m steps and
   * every fence came back BURIED-RUN by exactly one step. */
  const STEPS = 24;
  for (let i = 0; i < STEPS; i += 1) {
    const x0 = BANK_X0 + (BANK_X1 - BANK_X0) * (i / STEPS);
    const x1 = BANK_X0 + (BANK_X1 - BANK_X0) * ((i + 1) / STEPS);
    const top = groundHeight((x0 + x1) / 2, 30);
    ctx.add(box(x1 - x0 + 0.02, top + 1.2, 15, M.turf, (x0 + x1) / 2, (top - 1.2) / 2, 29.5), `bank-${i}`);
    ctx.platform(x0, BANK_Z0, x1, 37, top);
  }
  ctx.add(box(26, HIGH + 1.2, 15, M.turf, 35, (HIGH - 1.2) / 2, 29.5), 'ground-runs-high');
  ctx.platform(BANK_X1, BANK_Z0, 48, 37, HIGH);

  /* ---- RANK A: the five building types ------------------------------ */
  const A = 0;
  const built = [];
  const buildings = [
    ['COTTAGE 1.5 — THATCH', -30, cottage({
      seed: 'sc-c1', storeys: 1.5, w: 5.8, d: 4.8, crook: 1,
      shutter: JOINERY.mossPaint, litWindows: 1,
    })],
    ['COTTAGE 2 — JETTIED', -22.5, cottage({
      seed: 'sc-c2', storeys: 2, w: 5.4, d: 4.6, crook: 1.3, jetty: 0.28,
      wall: 'limewash', door: ACCENT.hedgeGreen, litWindows: 2,
    })],
    ['COTTAGE — TRADE FRONT', -14.5, cottage({
      seed: 'sc-c3', storeys: 2, w: 6.4, d: 5.0, crook: 0.8,
      trade: { lit: true }, tradeAccent: ACCENT.lanternRed, door: JOINERY.oakStain, litWindows: 2,
    })],
    ['COTTAGE — SHINGLE, GRANITE', -7, cottage({
      seed: 'sc-c4', storeys: 1.5, w: 5.2, d: 4.4, roof: 'shingle', wall: 'granite',
      crook: 0.5, shutter: JOINERY.skyWash,
    })],
    ['LONGHOUSE — THE INN', 2.5, longhouse({
      seed: 'sc-inn', w: 12, d: 7, litWindows: 4, accent: ACCENT.lanternRed,
    })],
  ];
  for (const [name, x, g] of buildings) {
    place(ctx, g, { x, z: A, yaw: 0, name: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') });
    label(ctx, name, x, 9.6, Math.min(3.0, 0.15 * name.length));
    built.push(g);
  }

  // a bracket lantern and a hanging sign read off the inn's OWN joints —
  // which is how a district dresses one. Never re-derive an eave height.
  const inn = built[4];
  const lamp = bracketLantern({ seed: 'sc-bl', lit: true, groundDrop: -(inn.userData.groundH ?? 2.6) });
  lamp.position.set(4.6, 2.35, inn.userData.frontZ + 0.02);
  ctx.add(lamp, 'inn-bracket-lantern');
  const hs = hangingSign({ tenant: 'moonmare', w: 1.35, h: 1.0, seed: 'sc-hs', ctx });
  hs.position.set(0.6, 3.9, inn.userData.frontZ + 0.02);
  ctx.add(hs, 'inn-hanging-sign');

  // the two towers: a squat gate tower and the wizards' tower, ONE generator
  const gt = roundTower({
    seed: 'sc-gt', r: 1.9, h: 6.2, taper: 0.1, crook: 0.4, wall: 'granite',
    cap: 'cone', machicolation: true, door: { a: 0 },
  });
  place(ctx, gt, { x: 10.5, z: A, yaw: 0, name: 'gate-tower' });
  label(ctx, 'ROUND TOWER — GATE', 10.5, 9.6, 2.6);

  const wt = roundTower({
    seed: 'sc-wt', r: 2.1, h: 14.5, taper: 0.26, crook: 1.6, wall: 'render',
    cap: 'crooked', bands: 3, door: { a: 0 }, glowColor: ACCENT.alchemicalTeal,
  });
  place(ctx, wt, { x: 17.5, z: -10, yaw: 0, name: 'wizard-tower' });
  label(ctx, "WIZARDS' TOWER", 17.5, -3.4, 2.4);

  const mill = windmill({
    seed: 'sc-mill', r: 3.0, h: 8.6, sailLen: 6.2, ctx, windDir: -0.35,
    cloth: null, gallery: true, tailpole: true,
  });
  place(ctx, mill, { x: 17.5, z: A + 1, yaw: 0, name: 'windmill' });
  label(ctx, 'WINDMILL — FOUR SAILS', 17.5, 9.6, 3.0);

  const tp = temple({
    seed: 'sc-temple', w: 7, d: 5.6, bell: ACCENT.gilt, litNiches: true,
  });
  place(ctx, tp, { x: 31, z: A + 1, yaw: 0, name: 'temple' });
  label(ctx, 'TEMPLE — BELLCOTE', 31, 9.6, 2.6);
  // the temple's bell, swinging: an interaction a district wires up
  let bellT = 0;
  let bellRing = 0;
  ctx.update((dt) => {
    if (bellRing <= 0) return;
    bellRing -= dt;
    bellT += dt;
    tp.userData.bellPivot.rotation.z = Math.sin(bellT * 5.2) * 0.34 * Math.max(0, bellRing / 4);
  });
  interactive(ctx, {
    name: 'temple-bell', label: 'Ring the temple bell',
    at: [31.24, HIGH + 1.6, tp.userData.bodyZ + 3.0], size: [1.0, 2.0, 1.0],
    action: () => { bellRing = 4; bellT = 0; },
  });

  // a free-standing trade front, off a building, so its own joints show
  const tf = tradeFront({ seed: 'sc-tf', w: 3.2, h: 2.3, accent: ACCENT.milledOchre, lit: true });
  tf.position.set(38.5, HIGH, 2.0);
  ctx.add(tagProp(tf, 'trade-front'), 'trade-front-alone');
  label(ctx, 'TRADE FRONT', 38.5, 9.6, 2.0);

  /* ---- RANK B: yard and farm gear ----------------------------------- */
  const rank = (z, items, x0, step) => items.forEach(([n, p], i) => {
    const x = x0 + i * step;
    p.position.set(x, 0, z);
    seatOnGround(p, ctx.groundAt);
    ctx.add(p, n.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    label(ctx, n, x, z - 2.4, Math.min(2.4, 0.14 * n.length));
  });
  rank(16, [
    ['WELL HEAD', wellHead({ seed: 'sc-well' })],
    ['CART — FLOUR', cart({ seed: 'sc-cart', paint: ACCENT.milledOchre, load: 'flour', sackColor: ACCENT.milledOchre })],
    ['CART — HAY', cart({ seed: 'sc-cart2', load: 'hay' })],
    ['HAY BALE', hayBale({ seed: 'sc-bale' })],
    ['HAYRICK', hayRick({ seed: 'sc-rick' })],
    ['BARREL', barrel({ seed: 'sc-bar' })],
    ['BARREL — TIPPED', barrel({ seed: 'sc-bar2', tipped: true })],
    ['BARREL STACK', barrelStack({ seed: 'sc-bars', rows: 3 })],
  ], -32, 3.9);

  /* ---- RANK C: working gear and street furniture -------------------- */
  rank(20.5, [
    ['CRATE', crate({ seed: 'sc-cr' })],
    ['CRATE STACK', crateStack({ seed: 'sc-crs', n: 3 })],
    ['SACKS', sackStack({ seed: 'sc-sk', n: 4 })],
    ['LOG PILE', logPile({ seed: 'sc-lp' })],
    ['CHICKEN COOP', chickenCoop({ seed: 'sc-coop' })],
    ['BEEHIVE', beehive({ seed: 'sc-hive' })],
    ['SHRINE-STONE', shrineStone({ seed: 'sc-ss', flame: true })],
    ['TROUGH', trough({ seed: 'sc-tr' })],
    ['MOUNTING BLOCK', mountingBlock({ seed: 'sc-mb' })],
    ['WAYMARKER', waymarker({ seed: 'sc-wm' })],
    ['KITCHEN GARDEN', kitchenGarden({ seed: 'sc-kg' })],
  ], -32, 3.4);

  rank(24.6, [
    ['TORCH', torch({ seed: 'sc-t', lit: true })],
    ['BRAZIER', brazier({ seed: 'sc-br', ctx })],
    ['POST LANTERN', postLantern({ seed: 'sc-pl', lit: true })],
    ['LADDER', ladder({ seed: 'sc-lad' })],
    ['MARKET STALL', marketStall({ seed: 'sc-st', goods: 'produce', tones: [PAL.canvas, ACCENT.lanternRed] })],
    ['STALL — LANTERNS', marketStall({ seed: 'sc-st2', goods: 'lanterns', back: true })],
  ], -32, 4.6);

  const bp = bannerPole({
    seed: 'sc-bp', h: 5.0, field: ACCENT.wardenMadder, band: JOINERY.bone,
    device: 'portcullis', deviceInk: JOINERY.bone,
  });
  bp.position.set(-2.5, 0, 24.6);
  seatOnGround(bp, ctx.groundAt);
  ctx.add(bp, 'banner-pole');
  label(ctx, 'BANNER POLE', -2.5, 22.2, 2.0);

  const fp = fingerpost({
    seed: 'sc-fp', arms: [{ text: 'THE GREEN', dir: 0 }, { text: 'MILLWARD', dir: Math.PI * 0.66 }],
  });
  fp.position.set(2.5, 0, 24.6);
  seatOnGround(fp, ctx.groundAt);
  ctx.add(fp, 'fingerpost');
  label(ctx, 'FINGERPOST', 2.5, 22.2, 1.8);

  /* ---- RANK D: the runs, and they cross the bank -------------------- */
  const fenceZ = 27.5;
  const RX0 = 10.2;
  const RSTEP = (BANK_X1 - 0.4 - RX0) / 6;
  const runPts = [];
  for (let i = 0; i <= 6; i += 1) runPts.push([RX0 + i * RSTEP, fenceZ]);
  ctx.add(fenceRun({ points: runPts, kind: 'post-rail', seed: 'sc-fr', groundAt: ctx.groundAt, ctx }), 'fence-post-rail');
  label(ctx, 'FENCE — POST & RAIL', 6.0, fenceZ - 1.6, 2.6);

  const palePts = [];
  for (let i = 0; i <= 6; i += 1) palePts.push([RX0 + i * RSTEP, fenceZ + 2.6]);
  ctx.add(fenceRun({ points: palePts, kind: 'paling', h: 0.95, seed: 'sc-fp2', groundAt: ctx.groundAt, ctx }), 'fence-paling');
  const hurdPts = [];
  for (let i = 0; i <= 6; i += 1) hurdPts.push([RX0 + i * RSTEP, fenceZ + 5.0]);
  ctx.add(fenceRun({ points: hurdPts, kind: 'hurdle', h: 1.15, seed: 'sc-fh', groundAt: ctx.groundAt, ctx }), 'fence-hurdle');
  const palPts = [];
  for (let i = 0; i <= 6; i += 1) palPts.push([RX0 + i * RSTEP, fenceZ + 7.4]);
  ctx.add(fenceRun({ points: palPts, kind: 'palisade', h: 2.2, seed: 'sc-fpl', groundAt: ctx.groundAt, ctx }), 'fence-palisade');
  label(ctx, 'PALING / HURDLE / PALISADE', 6.0, fenceZ + 4.0, 3.2);

  const hedgePts = [];
  for (let i = 0; i <= 6; i += 1) hedgePts.push([RX0 + i * RSTEP, fenceZ - 2.8]);
  ctx.add(hedgeRun({ points: hedgePts, seed: 'sc-hedge', groundAt: ctx.groundAt }), 'hedge-run');
  label(ctx, 'HEDGE RUN', 6.0, fenceZ - 4.4, 1.8);

  /* the lantern strings: the fair's whole story. Two poles, two runs —
   * one UNLIT (as the whole town is) and one LIT (the test string). */
  for (const x of [-8.5, -2.0, 4.5]) {
    const p = postLantern({ seed: `sc-sp${x}`, h: 3.6, lit: false });
    p.position.set(x, 0, 26.2);
    seatOnGround(p, ctx.groundAt);
    ctx.add(p, `string-post-${x}`);
  }
  const strA = lanternString({
    from: [-8.5, 3.5, 26.2], to: [-2.0, 3.5, 26.2], count: 8, sag: 0.62,
    seed: 'sc-str-a', lit: false, groundAt: ctx.groundAt,
  });
  ctx.add(strA, 'lantern-string-unlit');
  const strB = lanternString({
    from: [-2.0, 3.5, 26.2], to: [4.5, 3.5, 26.2], count: 8, sag: 0.62,
    seed: 'sc-str-b', lit: true, colors: [ACCENT.lanternRed, ACCENT.lanternGold],
    groundAt: ctx.groundAt,
  });
  ctx.add(strB, 'lantern-string-lit');
  label(ctx, 'LANTERN STRING — UNLIT', -5.4, 24.0, 2.8);
  label(ctx, 'LIT', 1.2, 24.0, 1.0);
  interactive(ctx, {
    name: 'test-string', label: 'Light the test string',
    at: [-5.2, 3.2, 26.2], size: [1.4, 1.6, 1.4],
    action: () => strA.userData.setLit(true),
  });

  for (const x of [-20, -15.5]) {
    const p = postLantern({ seed: `sc-wp${x}`, h: 2.6, lit: false });
    p.position.set(x, 0, 25.6);
    seatOnGround(p, ctx.groundAt);
    ctx.add(p, `washing-post-${x}`);
  }
  ctx.add(washingLine({
    from: [-20, 2.5, 25.6], to: [-15.5, 2.5, 25.6], seed: 'sc-wash', n: 4,
    colors: [PAL.paper, PAL.canvasWorn, JOINERY.bone],
  }), 'washing-line');
  label(ctx, 'WASHING LINE', -17.7, 23.4, 2.0);

  /* ---- RANK E: signage, read from three metres ---------------------- */
  const E = 30;
  ctx.add(box(24, 4.6, 0.5, M.limewash, -8, 2.3, E), 'sign-wall');
  ctx.add(box(24.3, 0.5, 0.72, M.rubble, -8, 0.25, E), 'sign-wall-plinth');
  const faceZ = E + 0.25;
  [['moonmare', -17.0, 4.0, 0.55], ['pestle', -11.6, 3.8, 0.52], ['emberwright', -6.4, 3.6, 0.5], ['mill', -1.4, 3.6, 0.5]]
    .forEach(([key, x, w, hh], i) => {
      const f = fasciaBoard({ tenant: key, w, h: hh, seed: `sc-f${i}` });
      f.position.set(x, 2.9, faceZ);
      ctx.add(f, `fascia-${key}`);
    });
  const hs2 = hangingSign({ tenant: 'tansy', w: 1.3, h: 0.95, seed: 'sc-hs2', ctx });
  hs2.position.set(2.6, 3.8, faceZ);
  ctx.add(hs2, 'hanging-tansy');
  const pn = paintedName({ title: 'HOLLOWAY & SON', w: 4.2, h: 0.6, bg: PAL.limewash, seed: 'sc-pn' });
  pn.position.set(-17.0, 1.5, faceZ);
  ctx.add(pn, 'painted-holloway');
  ['fair', 'programme', 'familiar', 'belltimes'].forEach((n, i) => {
    const s = wallNotice({ notice: n, w: 0.48, h: 0.62, seed: `sc-n-${n}`, tilt: (i % 2 ? 1 : -1) * 0.03 });
    s.position.set(-12.4 + i * 0.76, 1.6, faceZ);
    ctx.add(s, `notice-${n}`);
  });
  const ch = chalkedBoard({
    head: 'AT THE MILL', lines: ['WHEATEN  4 d.', 'BARLEY   3 d.', 'ALL FREE — FAIR DAY'],
    w: 0.9, h: 0.7, seed: 'sc-ch',
  });
  ch.position.set(-6.4, 1.7, faceZ);
  ctx.add(ch, 'chalked-mill');
  const nb = noticeBoardStand({ notices: ['fair', 'programme', 'wardens', 'toll'], w: 1.7, h: 1.05, seed: 'sc-nb' });
  nb.position.set(-2.0, 0, E + 2.8);
  seatOnGround(nb, ctx.groundAt);
  ctx.add(nb, 'notice-board');
  label(ctx, 'NOTICE BOARD', -2.0, E - 0.8, 2.0);

  /* ---- RANK F: the trees -------------------------------------------- */
  const oak = bigTree({ seed: 'sc-oak', h: 11.5, spread: 11, density: 11, swing: true });
  oak.position.set(-22, 0, -14);
  seatOnGround(oak, ctx.groundAt);
  ctx.add(oak, 'great-oak');
  ctx.collide(-22.9, -14.9, -21.1, -13.1);
  label(ctx, 'THE GREAT OAK', -22, -4.6, 2.4);

  ctx.add(treeStand({
    seed: 'sc-orchard', kind: 'orchard', groundAt: ctx.groundAt,
    spots: [[-10, -13], [-7, -15.5], [-4, -12.5], [-1, -15], [-8.5, -18], [-3, -18.5]],
  }), 'orchard');
  label(ctx, 'ORCHARD STAND', -6, -9.5, 2.2);

  ctx.add(treeStand({
    seed: 'sc-yews', kind: 'yew', groundAt: ctx.groundAt,
    spots: [[3, -13], [6, -15], [9, -12.5]],
  }), 'yews');
  label(ctx, 'YEWS', 6, -9.5, 1.2);

  ctx.add(treeStand({
    seed: 'sc-hedgerow', kind: 'hedgerow', groundAt: ctx.groundAt,
    spots: [[14, -14], [18, -16], [23, -13.5], [28, -16]],
  }), 'hedgerow-trees');
  label(ctx, 'HEDGEROW / BIRCH', 20, -9.5, 2.4);
  ctx.add(treeStand({
    seed: 'sc-birch', kind: 'birch', groundAt: ctx.groundAt,
    spots: [[33, -14], [36, -16.5], [39, -13]],
  }), 'birches');

  return { spawn: [-14, 0, 12] };
}
