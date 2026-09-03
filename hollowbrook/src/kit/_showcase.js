import * as THREE from 'three';
import { PAL, ACCENT, JOINERY } from '../palette.js';
import { M } from './mats.js';
import { box, seatOnGround, stairs } from '../builders.js';
import { cottage, longhouse, roundTower, temple, windmill, tradeFront } from './buildings.js';
import {
  curtainWall, gatehouse, stairTurret, barricade, wallTorch, beaconCage,
  lantern, arrowSlit, siegeProps, placeCover, campFire, tent, SIEGE,
} from './siege.js';
import { bigTree, treeStand, hedgeRun } from './trees.js';
import {
  wellHead, cart, hayBale, hayRick, barrel, barrelStack, crate, crateStack,
  sackStack, logPile, chickenCoop, beehive, shrineStone, fenceRun, bannerPole,
  ladder, washingLine, marketStall, trough, mountingBlock, waymarker,
  kitchenGarden, torch, brazier, postLantern, bracketLantern, lanternString,
  interactive,
} from './props.js';
import { fasciaBoard, hangingSign, wallNotice, chalkedBoard, noticeBoardStand, platePost, paintedName, fingerpost } from './signkit.js';
import { place, tagProp, parts, bx } from './util.js';

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
 *   RANK G  z = 50    THE SIEGE KIT: a mock wall-walk shelf at y 5.0 with a
 *                     gate gap in it, dressed exactly the way the real
 *                     terrain is, plus the siege props and the camp
 *   RANK H  z = 41    the siege props, the practicals and the barricades
 *
 * RANK G IS NOT DECORATION. `curtainWall`, `gatehouse` and `stairTurret`
 * all dress GROUND THEY DID NOT MAKE, so a showcase that stood them on a
 * flat slab would be testing a different generator from the one the town
 * uses. The shelf here is at the plan's own numbers — 2.4 m wide, y 5.0,
 * inner 48.8 and outer 51.2, gapped at x -3.5..3.5 — so the ONE thing that
 * matters (the walk crossing the gate) is the same problem it is in the
 * city. The real continuity proof is `scripts/check-siege.mjs`, which runs
 * this same kit over the real terrain.
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
  buildings: { subject: 'cottage-trade-front', position: [-36, 3.4, 12.5], target: [-16, 4.4, 1], fov: 54 },
  buildings2: { subject: 'longhouse-the-inn', position: [22, 4.0, 18], target: [4, 5.0, 1], fov: 52 },
  // LOW ANGLE UP AT THE THATCH EAVES — the roll, the soffit, the combing
  thatchLow: { subject: 'cottage-trade-front', position: [-19.5, 1.35, 7.2], target: [-17.6, 5.0, 1.2], fov: 58 },
  thatchLow2: { subject: 'cottage-shingle-granite', position: [-8.5, 1.3, 7.4], target: [-7.0, 5.6, 1.0], fov: 58 },
  // the ridge and the eyebrow dormers from above eye height
  thatchRidge: { subject: 'cottage-trade-front', position: [-14.0, 6.4, 10.5], target: [-15.0, 4.4, 0.5], fov: 50 },
  // the tower, and the mill mid-turn
  // the camera called `tower` was aimed at [4.5, 8, 0] — the INN, six metres
  // west of the tower it is named after.  A wrong aim does not look wrong.
  tower: { subject: 'gate-tower', position: [10.5, 4.5, 14.5], target: [10.5, 5.2, 0], fov: 52 },
  mill: { subject: 'windmill', position: [26, 6.5, 17], target: [17.5, 8.0, 0], fov: 50 },
  millSails: { subject: 'windmill', position: [17.5, 7.5, 15], target: [17.5, 9.2, 0], fov: 44 },
  temple: { subject: 'temple', position: [36, 3.4, 13], target: [31, 5.0, 0], fov: 50 },
  // the great oak, from under it and from across the field
  oak: { subject: 'great-oak', position: [-30, 2.4, -4], target: [-22, 7.0, -14], fov: 55 },
  oakUnder: { subject: 'great-oak', position: [-24.5, 1.7, -10.5], target: [-22.2, 6.5, -14], fov: 62 },
  // and `trees` stood INSIDE the inn's own footprint collider
  trees: { subject: 'orchard', position: [4, 3.0, -6.2], target: [-4, 4.0, -14], fov: 52 },
  props: { subject: 'cart-hay', position: [-30, 2.4, 20.5], target: [-22, 1.4, 16], fov: 52 },
  props2: { subject: 'barrel-stack', position: [-14, 2.4, 20.5], target: [-6, 1.4, 16], fov: 52 },
  props3: { subject: 'log-pile', position: [-30, 2.5, 25], target: [-22, 1.7, 20.5], fov: 52 },
  // straight down the gap between the banner pole and the string posts: the
  // oblique aim this camera had crossed four ranks and was blocked 2.4 m out
  props4: { subject: 'mounting-block', position: [-4.8, 2.5, 26.4], target: [-4.8, 1.0, 20.6], fov: 52 },
  runs: { subject: 'fence-paling', position: [3, 3.2, 24], target: [15, 2.0, 31], fov: 58 },
  // the runs where they cross the BANK: the whole "steps with the ground" claim
  runsBank: { subject: 'fence-hurdle', position: [26, 3.4, 24.5], target: [12, 1.4, 31], fov: 52 },
  // SIGNAGE AT THREE METRES, head-on, and along the wall for the hanging
  // board, whose plate faces along the street and is a sliver head-on
  signage: { subject: 'notice-fair', position: [-14, 2.7, 33.6], target: [-14, 2.7, 30], fov: 44 },
  signage2: { subject: 'fascia-emberwright', position: [-4.5, 2.7, 33.6], target: [-4.5, 2.7, 30], fov: 44 },
  hangsign: { subject: 'hanging-tansy', position: [-8.0, 3.9, 30.7], target: [-2.0, 3.75, 30.7], fov: 36 },
  lanterns: { subject: 'lantern-string-lit', position: [-3.5, 2.3, 21.8], target: [-2, 3.5, 26.2], fov: 52 },
  wide: { subject: 'longhouse-the-inn', position: [-44, 26, 46], target: [2, 4, 2], fov: 55 },

  /* ---- the siege kit ------------------------------------------------- *
   * Every one of these is a STANDING EYE (1.62 m over its own ground), the
   * way the district agents' evidence has to be — except `siegeWide`,
   * which is the orbit frame. */
  /* THE PROP RANK IS READ FROM ITS +Z SIDE, like every other rank here:
   * `label` plates face +z and the camera has to be on that side of them or
   * every name plate in the frame is a blank board.  So these stand at
   * z ~46 and look back toward z 41 — which is also the only side of the
   * siege rank the wall is not standing on. */
  gateOut: { subject: 'gatehouse-showcase', position: [0, 1.62, 59.5], target: [0, 4.2, 50], fov: 55 },
  gateIn: { subject: 'gatehouse-showcase', position: [0, 1.62, 41.6], target: [0, 4.4, 49], fov: 55 },
  // aimed UP into the vault: the subject's own centre is 45 degrees above a
  // standing eye in the passage, so a level target puts it off the top edge
  gateUnder: { subject: 'gatehouse-showcase', position: [0, 1.62, 53.4], target: [0, 4.6, 47.0], fov: 62 },
  gateDeck: { subject: 'gatehouse-showcase', position: [-9, 6.62, 50.0], target: [9, 6.3, 50.0], fov: 58 },
  curtainOut: { subject: 'curtain-west', position: [-16, 1.62, 60], target: [-16, 3.6, 51.4], fov: 50 },
  curtainRake: { subject: 'curtain-west', position: [10.5, 1.62, 62], target: [-16, 4.4, 51.6], fov: 46 },
  curtainIn: { subject: 'curtain-west', position: [-14, 1.62, 42.6], target: [-14, 3.4, 48.8], fov: 52 },
  walkAlong: { subject: 'gatehouse-showcase', position: [-17.4, 6.62, 50.0], target: [4, 6.2, 50.0], fov: 60 },
  // ALONG the parapet, not out over it: a camera on the walk facing the
  // field has the merlons in the near third and its subject behind it
  walkParapet: { subject: 'curtain-east', position: [2.0, 6.62, 49.6], target: [20, 6.0, 50.4], fov: 58 },
  /* from the WEST, not from the flight side: the first aim put the eye 3 m
   * under the cheek wall, which then filled the frame and hid the turret it
   * is named after — the camera passed its gate because the cheek IS part of
   * the turret's own group. */
  turretHead: { subject: 'stair-turret', position: [-27, 1.62, 42.4], target: [-21.5, 4.6, 46.6], fov: 52 },
  hoarding: { subject: 'curtain-west', position: [-22, 1.62, 60], target: [-14.7, 5.6, 52.4], fov: 46 },
  /* from the EAST and well back.  The first aim stood 2.3 m from the prop
   * rank's own beacon cage, which then filled a third of the frame and read
   * as part of the tower — and the gate passed it, because a clear ray to
   * the subject says nothing about what else is in shot. */
  bellTower: { subject: 'bell-tower', position: [42, 1.62, 47.5], target: [33.2, 6.2, 46.4], fov: 62 },
  siegeProps1: { subject: 'felled-cart', position: [-32, 1.62, 46.6], target: [-25, 1.0, 41], fov: 54 },
  // off the stair flight: at z 46.6 this eye stood INSIDE the treads
  siegeProps2: { subject: 'arrow-bundle', position: [-16, 1.62, 44.6], target: [-9, 1.0, 41], fov: 54 },
  /* SUBJECT `oil-pots`, NOT `chain-across`, and the reason is worth keeping:
   * the camera gate casts at a subject's bbox CENTRE, and the centre of a
   * chain slung between two posts is empty air — the ray sails under the
   * catenary, between the posts, and lands on the ground beyond, which the
   * gate correctly calls a blocked view.  A thin, open prop cannot be a
   * camera's subject; frame it, and name something solid in the same frame. */
  siegeProps3: { subject: 'oil-pots', position: [0, 1.62, 48.2], target: [-1, 0.7, 41], fov: 54 },
  barricades: { subject: 'barricade-up', position: [21, 1.62, 46.4], target: [13.5, 1.1, 41], fov: 55 },
  slits: { subject: 'arrow-slit-panel', position: [23.6, 1.62, 45.2], target: [23.6, 2.0, 41.3], fov: 44 },
  practicals: { subject: 'lantern-lit', position: [37, 1.62, 45.2], target: [30.5, 1.4, 41], fov: 50 },
  camp: { subject: 'camp-fire', position: [28, 1.62, 62.5], target: [36, 1.4, 57.4], fov: 58 },
  siegeSigns: { subject: 'fascia-stanhope', position: [-40, 2.7, 40.7], target: [-40, 2.7, 44.3], fov: 44 },
  siegeWide: { subject: 'gatehouse-showcase', position: [-46, 22, 78], target: [4, 4, 48], fov: 55 },
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

  buildSiegeRanks(ctx, label, rank);

  return { spawn: [-14, 0, 12] };
}

/* ==================================================================== *
 * RANK G + H — THE SIEGE KIT
 *
 * The shelf here is the plan's own perimeter contract, cut down to 44 m:
 * 2.4 m wide, top at y 5.0, inner face 48.8, outer 51.2, gapped over
 * x -3.5..3.5.  That is not a coincidence and it is not tidiness — the
 * three generators in RANK G all dress ground somebody else made, and a
 * showcase that stood them on a flat slab would be exercising code the
 * town never runs.
 *
 * WHAT THIS CANNOT PROVE is the only thing that matters about a curtain
 * wall: that the walk is ONE RING through both gatehouses.  That is
 * `scripts/check-siege.mjs`, which stands this same kit up in the REAL
 * terrain and flood-fills the walk with a 4.5 m floor so it cannot cheat
 * by dropping into the street and coming back up a stair.
 * ==================================================================== */
function buildSiegeRanks(ctx, label, rank) {
  const WALK = SIEGE.walkY;
  const IN = SIEGE.inner;
  const OUT = SIEGE.outer;
  const GAP = 3.5;
  const X0 = -22;
  const X1 = 22;

  /* ---- the ground the siege kit dresses ------------------------------ */
  /* it OVERLAPS the runs rank's ground by 0.1 m rather than butting it:
   * the audit's hole grid samples every 0.5 m and a butt joint at a round
   * number is a row of samples that fall through between two slabs. */
  ctx.add(box(104, 1.2, 29.1, M.turf, 0, -0.6, 51.45), 'siege-plain');
  ctx.platform(-52, 36.9, 52, 66, 0);

  // the wall's own core, either side of the gap, and the walk on top of it
  for (const [a, b] of [[X0, -GAP], [GAP, X1]]) {
    ctx.add(box(b - a, WALK, OUT - IN, M.curtainDark, (a + b) / 2, WALK / 2, (IN + OUT) / 2), `siege-core-${a}`);
    ctx.platform(a, IN, b, OUT, WALK);
  }
  // the stair-head landing, and a real flight up to it
  const LAND = { x0: X0, z0: 45.8, x1: X0 + 3, z1: IN, y: WALK };
  ctx.add(box(3, WALK, 3, M.curtainDark, X0 + 1.5, WALK / 2, 47.3), 'siege-landing');
  ctx.platform(LAND.x0, LAND.z0, LAND.x1, LAND.z1, WALK);
  const FLIGHT = { at: [X0 + 12.4, 47.3], axis: 'x', dir: -1, width: 1.6, from: 0, to: WALK, rise: 0.2, going: 0.4 };
  ctx.add(stairs({ w: 1.6, rise: 0.2, run: 0.4, steps: 25, dir: 'x-', at: [FLIGHT.at[0], 0, FLIGHT.at[1]], mat: M.curtainDark, ctx }), 'siege-flight');

  /* ---- RANK G: the three wall generators ----------------------------- */
  curtainWall({ from: X0, to: -GAP, side: 's', ctx, seed: 'sc-curtain-w', endCaps: ['pier', 'none'], name: 'curtain-west' });
  curtainWall({ from: GAP, to: X1, side: 's', ctx, seed: 'sc-curtain-e', endCaps: ['none', 'pier'], name: 'curtain-east' });
  const gh = gatehouse({
    ctx, id: 'showcase', seed: 'sc-gatehouse',
    gate: { gap: { x0: -GAP, x1: GAP, z0: IN, z1: OUT }, passage: { x0: -GAP, x1: GAP, z0: 47.6, z1: 52.4 } },
  });
  stairTurret({ landing: LAND, flight: FLIGHT, ctx, seed: 'sc-turret', name: 'stair-turret' });
  label(ctx, 'CURTAIN WALL', -13, 46.4, 2.4);
  label(ctx, 'GATEHOUSE', 0, 44.0, 1.8);
  label(ctx, 'STAIR TURRET', X0 + 4.4, 44.6, 2.2);

  // one of the gatehouse's own torches lit, so the arch has a practical in
  // it — the district lights the other on its relight beat
  gh.userData.practicals[0]?.userData.setLit(true);

  // a dropped ladder against the curtain's outer face, and oil pots stood
  // on the walk behind the merlons: the two props that only read in place
  const lad = siegeProps.siegeLadder({ seed: 'sc-lad-wall', len: 6.4, lean: 0.26 });
  lad.position.set(-16, 0, 53.3);
  lad.rotation.y = Math.PI;
  seatOnGround(lad, ctx.groundAt);
  ctx.add(lad, 'siege-ladder-on-wall');
  const pots = siegeProps.oilPots({ seed: 'sc-pots-wall', n: 3 });
  pots.position.set(9.2, ctx.groundAt(9.2, 50.3), 50.3);
  ctx.add(pots, 'oil-pots-parapet');

  /* ---- a bell tower with a beacon bracket ---------------------------- */
  const bt = roundTower({
    seed: 'sc-bell', r: 2.2, h: 9.0, taper: 0.12, crook: 0.35, wall: 'granite',
    cap: 'none', bands: 2, corbel: true, machicolation: true,
    door: { a: Math.PI }, bell: ACCENT.gilt, beacon: Math.PI,
    windows: [{ y: 3.2, a: Math.PI, w: 0.2, h: 1.1 }, { y: 6.0, a: Math.PI * 0.7, w: 0.2, h: 1.1 }],
  });
  place(ctx, bt, { x: 32, z: 46, yaw: 0, name: 'bell-tower' });
  label(ctx, 'ROUND TOWER — BELL + BEACON', 32, 42.4, 3.0);
  // the beacon standing ON the bracket the tower threw out for it
  if (bt.userData.beaconAt) {
    const bc = beaconCage({ seed: 'sc-beacon-tower', h: 1.1, lit: true, ctx });
    bc.position.set(32 + bt.userData.beaconAt[0], bt.userData.beaconAt[1], 46 + bt.userData.beaconAt[2]);
    ctx.add(bc, 'tower-beacon');
  }
  let bellT = 0;
  let bellRing = 0;
  ctx.update((dt) => {
    if (bellRing <= 0) return;
    bellRing -= dt;
    bellT += dt;
    bt.userData.bellPivot.rotation.z = Math.sin(bellT * 4.6) * 0.36 * Math.max(0, bellRing / 4);
  });
  interactive(ctx, {
    name: 'keep-bell', label: 'Ring the keep bell',
    at: [32.4, 1.6, 43.6], size: [1.1, 2.2, 1.1],
    action: () => { bellRing = 4; bellT = 0; },
  });

  /* ---- RANK H: the props, at z = 41 ---------------------------------- */
  const Z = 41;
  const put = (name, g, x, { cover = false, yaw = 0, w } = {}) => {
    if (cover) placeCover(ctx, g, { x, z: Z, yaw, name: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') });
    else {
      g.position.set(x, 0, Z);
      g.rotation.y = yaw;
      seatOnGround(g, ctx.groundAt);
      ctx.add(g, name.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    }
    label(ctx, name, x, Z - 2.4, w ?? Math.min(2.6, 0.14 * name.length));
  };
  put('BREACH RUBBLE', siegeProps.breachRubble({ seed: 'sc-rubble' }), -32, { cover: true });
  put('SIEGE LADDER', siegeProps.siegeLadder({ seed: 'sc-ladder' }), -28.5);
  put('FELLED CART', siegeProps.felledCart({ seed: 'sc-fcart' }), -25, { cover: true });
  put('MANTLET', siegeProps.mantlet({ seed: 'sc-mantlet' }), -21.5, { cover: true });
  /* three gabions at 1.2 m centres: a 1.04 m basket, so their bounding
   * boxes clear each other and the audit's OVERLAP test does not read a
   * cluster as interpenetration */
  ['a', 'b', 'c'].forEach((k, i) => {
    placeCover(ctx, siegeProps.gabion({ seed: `sc-gabion-${k}` }), { x: -18.6 + i * 1.2, z: Z, name: `gabion-${k}` });
  });
  label(ctx, 'GABIONS', -17.4, Z - 2.4, 1.4);
  put('SPEAR RACK', siegeProps.spearRack({ seed: 'sc-spears' }), -13);
  put('ARROW BUNDLE', siegeProps.arrowBundle({ seed: 'sc-arrows' }), -9.5);
  put('STRETCHER', siegeProps.stretcher({ seed: 'sc-stretcher' }), -6);
  put('OIL POTS', siegeProps.oilPots({ seed: 'sc-pots' }), -2.5);

  const chain = siegeProps.chainAcross({ from: [1, 0.95, Z], to: [4.4, 0.95, Z], seed: 'sc-chain', sag: 0.3 });
  seatOnGround(chain, () => 0);
  ctx.add(chain, 'chain-across');
  label(ctx, 'CHAIN ACROSS A LANE', 2.7, Z - 2.4, 2.8);

  /* BOTH barricade states, side by side.  They are the same generator and
   * the same seed family; what differs is `state`, and seeing them
   * together is the only way to judge whether the heap reads as the
   * barrier's own material. */
  barricade({ w: 3.2, seed: 'sc-barr-a', kind: 'carts', at: [8.6, Z], ctx, gap: 1.8, state: 'down', name: 'barricade-down' });
  label(ctx, 'BARRICADE — DOWN', 8.6, Z - 2.4, 2.4);
  barricade({ w: 3.2, seed: 'sc-barr-b', kind: 'doors', at: [13.6, Z], ctx, gap: 1.8, state: 'up', name: 'barricade-up' });
  label(ctx, 'BARRICADE — UP (DOORS)', 13.6, Z - 2.4, 3.0);
  barricade({ w: 3.2, seed: 'sc-barr-c', kind: 'stakes', at: [18.6, Z], ctx, gap: 1.8, state: 'up', name: 'barricade-stakes' });
  label(ctx, 'BARRICADE — STAKES', 18.6, Z - 2.4, 2.6);

  /* an arrow slit is an OPENING, so it needs a wall to be an opening in.
   * A free-standing panel is the honest way to show one: `half` is the
   * panel's own half-thickness and the slit is written on its z+ face. */
  {
    const panel = new THREE.Group();
    const P = parts();
    const PW = 3.2;
    const PH = 3.6;
    const PD = 0.5;
    P.add(M.curtain, bx(PW, PH, PD, 0, PH / 2, 0, { seg: 3 }));
    P.add(M.curtainDark, bx(PW + 0.3, 0.55, PD + 0.3, 0, 0.24, 0));
    P.add(M.coping, bx(PW + 0.24, 0.14, PD + 0.24, 0, PH + 0.06, 0));
    for (const u of [-0.78, 0.78]) {
      arrowSlit(P, { face: 'z+', half: PD / 2, u, y: 2.0, h: 1.45, w: 0.15, lit: u > 0 });
    }
    P.flush(panel);
    /* NOT `tagProp`ped, and that is deliberate: this is a WALL, the same
     * kind of thing as `sign-wall` above, and the audit's OVERLAP test runs
     * between TAGGED units.  Tagged, the wall torch bolted to its face
     * shares 37 % of the torch's own bounding box with the coping that
     * oversails it — a true reading of the boxes and a false reading of the
     * scene, because a bracket is SUPPOSED to be inside the wall it is
     * bolted to.  Buildings in this kit are untagged for the same reason. */
    panel.position.set(23.6, 0, Z);
    seatOnGround(panel, ctx.groundAt);
    ctx.add(panel, 'arrow-slit-panel');
    ctx.collide(23.6 - PW / 2, Z - 0.4, 23.6 + PW / 2, Z + 0.4);
    label(ctx, 'ARROW SLITS — UNLIT / LIT', 23.6, Z - 2.4, 3.0);
    // and a wall torch bolted to it: ORIGIN ON THE WALL FACE, projecting +z
    const wt = wallTorch({ seed: 'sc-walltorch', lit: true, groundDrop: -2.4 });
    wt.position.set(23.6 + 1.2, 2.4, Z + PD / 2);
    ctx.add(wt, 'wall-torch');
    label(ctx, 'WALL TORCH', 24.8, Z - 3.6, 2.0);
  }

  const bc2 = beaconCage({ seed: 'sc-beacon', lit: true, ctx });
  put('BEACON CAGE', bc2, 28.2);
  put('LANTERN — LIT', lantern({ seed: 'sc-lant-a', lit: true }), 31.4);
  put('LANTERN — UNLIT', lantern({ seed: 'sc-lant-b', lit: false }), 34.4);

  /* ---- the Company's camp, OUTSIDE the wall -------------------------- *
   * No colliders on any of it, and that is a hard rule: the fires and the
   * tents stand in the enemies' spawn rings and `check-nav.mjs` asserts
   * those rings are open ground.  A prop that seals a ring is a wave that
   * never arrives. */
  const fire = campFire({ seed: 'sc-campfire', lit: true, ctx });
  fire.position.set(34, 0, 57.5);
  seatOnGround(fire, ctx.groundAt);
  ctx.add(fire, 'camp-fire');
  label(ctx, 'CAMP FIRE', 34, 54.6, 1.8);
  const t1 = tent({ seed: 'sc-tent-a', company: true });
  t1.position.set(38.4, 0, 55.6);
  t1.rotation.y = -0.5;
  seatOnGround(t1, ctx.groundAt);
  ctx.add(t1, 'company-tent-a');
  const t2 = tent({ seed: 'sc-tent-b', company: true, open: false });
  t2.position.set(37.6, 0, 62.2);
  t2.rotation.y = 0.35;
  seatOnGround(t2, ctx.groundAt);
  ctx.add(t2, 'company-tent-b');
  label(ctx, 'TENTS — THE COMPANY', 38, 51.0, 2.8);
  const bp2 = bannerPole({
    seed: 'sc-company-banner', h: 4.4, field: ACCENT.companyRust, band: JOINERY.pitch,
    device: 'hammerAndAnvil', deviceInk: JOINERY.bone,
  });
  bp2.position.set(30.6, 0, 58.6);
  seatOnGround(bp2, ctx.groundAt);
  ctx.add(bp2, 'company-banner');

  /* ---- the new signage, on its own length of wall -------------------- */
  const SX = -40;
  const SZ = 44.5;
  ctx.add(box(15, 4.4, 0.5, M.limewash, SX, 2.2, SZ), 'siege-sign-wall');
  ctx.add(box(15.3, 0.5, 0.72, M.rubble, SX, 0.25, SZ), 'siege-sign-plinth');
  const face = SZ - 0.25;              // the SOUTH face: every camera is at low z here
  [['ploughLantern', SX - 5.2, 4.0, 0.56], ['stanhope', SX - 0.2, 3.6, 0.52], ['reeveHall', SX + 4.6, 3.8, 0.54]]
    .forEach(([key, x, w, hh], i) => {
      const f = fasciaBoard({ tenant: key, w, h: hh, seed: `sc-sf${i}` });
      f.position.set(x, 2.9, face);
      f.rotation.y = Math.PI;          // printedPlane faces +z; this wall is read from -z
      ctx.add(f, `fascia-${key}`);
    });
  ['muster', 'rota', 'lostdog', 'gatetoll'].forEach((n, i) => {
    const s = wallNotice({ notice: n, w: 0.5, h: 0.64, seed: `sc-sn-${n}`, tilt: (i % 2 ? 1 : -1) * 0.03 });
    s.position.set(SX - 5.4 + i * 0.8, 1.6, face);
    s.rotation.y = Math.PI;
    ctx.add(s, `notice-${n}`);
  });
  const nb2 = noticeBoardStand({ notices: ['muster', 'rota', 'lostdog', 'flourprices'], w: 1.7, h: 1.05, seed: 'sc-nb2' });
  nb2.position.set(SX + 2.0, 0, SZ - 2.8);
  nb2.rotation.y = Math.PI;
  seatOnGround(nb2, ctx.groundAt);
  ctx.add(nb2, 'siege-notice-board');
  label(ctx, 'HOLLOWBROOK SIGNAGE', SX, SZ - 4.6, 3.0);
  void rank;
}
