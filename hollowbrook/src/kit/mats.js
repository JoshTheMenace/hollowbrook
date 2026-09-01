import { cel, flat } from '../materials.js';
import { PAL } from '../palette.js';
import { applyKitSurfaces } from './surface.js';

/* ------------------------------------------------------------------ *
 * THISTLEDOWN'S SHARED MATERIAL POOL.
 *
 * `cel()` caches by parameter signature, so six districts asking for the
 * same role get the SAME material object and the renderer sorts them into
 * one batch. Naming the roles here rather than calling `cel(PAL.something)`
 * at two hundred call sites is what makes a later grade change one edit.
 *
 * NEVER construct a MeshToonMaterial, and never write a hex literal in a
 * district. If you need a one-off colour, `painted(color)`.
 *
 * BAND COUNTS ARE DELIBERATE:
 *   3 bands   the default. Ground, roofs, stone: three flat steps.
 *   2 bands   small dark metal, where a third band is only noise.
 *   'soft3'   PALE MASSES THAT MUST STAY LIGHT ON THEIR SHADOW SIDE. The
 *             ramp floors at 0.67 instead of 0.36, which is the difference
 *             between "in shade" and "gone". The sun here is at bearing 247
 *             and 19 degrees up, so it rakes the WEST faces only: every
 *             east and north elevation in this town is in shade for the
 *             whole scene. Limewash, thatch, granite, canvas and paper are
 *             all on soft3 for that one reason, and it matters more here
 *             than in any scene this pipeline has built.
 *
 * THE POOL IS BORN TEXTURED. `applyKitSurfaces(M)` at the foot of this file
 * attaches the micro-texture multiply maps from `surface.js` to the pooled
 * objects themselves — zero new materials, zero new draw calls. A district
 * never attaches a map and a generator never makes its own material for a
 * surface that has a role here.
 * ------------------------------------------------------------------ */

const pale = (color) => cel(color, { bands: 'soft3' });
const solid = (color) => cel(color, { bands: 3 });
const metal = (color) => cel(color, { bands: 2 });

export const M = {
  // --- ground: what districts DRESS the terrain with ---
  ground: solid(PAL.ground),
  paving: solid(PAL.cobble),
  pavingDark: solid(PAL.groundDark),
  turf: solid(PAL.groundMid),
  earth: solid(PAL.earth),
  gravel: solid(PAL.gravel),
  moss: solid(PAL.moss),
  straw: solid(PAL.strawLitter),

  // --- walls: the cream/honey lime ladder, all soft3 ---
  limewash: pale(PAL.limewash),
  limewashHoney: pale(PAL.limewashHoney),
  limewashPale: pale(PAL.limewashPale),
  limewashRose: pale(PAL.limewashRose),
  plaster: pale(PAL.plasterWarm),
  daub: pale(PAL.plasterWarm),
  render: pale(PAL.render),
  granite: pale(PAL.granite),
  graniteWarm: pale(PAL.graniteWarm),
  graniteDark: solid(PAL.graniteDark),
  rubble: solid(PAL.rubble),

  // --- timber ---
  oak: solid(PAL.oak),
  oakDark: solid(PAL.oakDark),
  oakSilver: solid(PAL.oakSilver),
  timberFrame: solid(PAL.timberFrame),
  timberDark: solid(PAL.timberDark),
  bark: solid(PAL.bark),
  barkDark: solid(PAL.barkDark),

  // --- roofs: thatch is soft3, because a north-facing pitch is half the
  //     roofscape and a 3-band thatch on it goes to mud ---
  thatch: pale(PAL.thatch),
  thatchWorn: pale(PAL.thatchWorn),
  thatchRidge: pale(PAL.thatchRidge),
  thatchDeep: solid(PAL.thatchDeep),
  shingle: solid(PAL.shingle),
  shingleMoss: solid(PAL.shingleMoss),
  shingleDark: solid(PAL.shingleDark),
  lead: solid(PAL.lead),
  slate: solid(PAL.slate),

  // --- foliage. The canopy tones are 3-band on purpose: a tree needs its
  //     own shaded half to read as a mass rather than as a flat blob. ---
  leafLight: solid(PAL.leafLight),
  leaf: solid(PAL.leaf),
  leafDeep: solid(PAL.leafDeep),
  leafYew: solid(PAL.leafYew),
  leafOrchard: solid(PAL.leafOrchard),
  hedge: solid(PAL.hedge),

  // --- metal, glass, cloth ---
  // iron is 3 bands and not 2: a round bar on 2 bands is a lit half and a
  // dark half, and the turn between them is the whole of its roundness
  iron: solid(PAL.iron),
  ironDark: solid(PAL.ironDark),
  brass: metal(PAL.brass),
  copper: metal(PAL.copper),
  glass: solid(PAL.glass),
  glassDark: solid(PAL.glassDark),
  canvas: pale(PAL.canvas),
  canvasWorn: pale(PAL.canvasWorn),
  rope: solid(PAL.rope),
  hessian: solid(PAL.hessian),
  wicker: solid(PAL.wicker),

  // --- paper & light ---
  paper: pale(PAL.paper),
  lanternPaper: pale(PAL.lanternPaper), // an UNLIT fair lantern
  lit: flat(PAL.warmLight),             // a lit one, and every lit window
  ember: flat(PAL.ember),               // fire, brazier, banked forge
  // SPELLWARD ONLY. Do not use this outside the alchemists' quarter: it is
  // the one cool emissive in Thistledown and it only reads because nothing
  // else is cool.
  glowTeal: flat(PAL.tealGlow),
};

/**
 * A painted material for a one-off colour — a door leaf, a cart, a banner,
 * a lantern's paper, a district's accent. Districts pass their ONE accent
 * into a generator and the generator calls this. No saturated colour is
 * ever written into the kit.
 */
export const painted = (color) => cel(color, { bands: 'soft3' });

/** A glazed panel with a lamp on behind it. Flat and unlit so it holds its
 *  value against a bright golden sky. */
export const litGlass = (color = PAL.warmLight) => flat(color);

/**
 * A LIT SURFACE THAT IS STILL SHADED. Emissive on a cel material lifts the
 * value without flattening the shading — which is what a paper lantern
 * wants (it is a lit object with a shape) as against a window pane (which is
 * a hole with light behind it and wants `litGlass`). Used by the lantern
 * strings, the votive niches and the tower's teal lamps.
 */
export const glowing = (color, emissive, intensity = 0.55) =>
  cel(color, { bands: 'soft3', emissive: emissive ?? color, emissiveIntensity: intensity });

/**
 * The wall material for a named wall kind, seeded between the tones. A row
 * of cottages all in one wash reads as an extrusion of one cottage; all in
 * five different washes reads as a paint chart. Three tones with a bias is
 * the shape that reads as a village that has been painted a house at a time.
 * `r` is an rng — pass the building's own.
 */
export function wallMaterial(kind, r) {
  if (kind === 'granite') return r && r.chance(0.35) ? M.graniteWarm : M.granite;
  if (kind === 'rubble') return M.rubble;
  if (kind === 'render') return M.render;
  if (kind === 'oak') return M.oakSilver;
  if (!r) return M.limewash;
  return r.pick([M.limewash, M.limewash, M.limewashHoney, M.limewashPale, M.limewashRose]);
}

/** The infill panel between frame members. Always a shade off the main wash
 *  so the frame reads as a frame and not as a stripe painted on. */
export function panelMaterial(r) {
  return r && r.chance(0.4) ? M.plaster : M.limewashPale;
}

/** A thatch tone, seeded. `deep` is the shaded eave tone and is never
 *  chosen — it always pairs with whichever face tone came out. */
export function thatchMaterial(r) {
  return r && r.chance(0.38) ? M.thatchWorn : M.thatch;
}

/** A shingle tone, seeded. The moss one is the north-pitch tone. */
export function shingleMaterial(r) {
  return r && r.chance(0.42) ? M.shingleMoss : M.shingle;
}

/* The micro-texture maps go on the POOL, once, here. See surface.js. */
applyKitSurfaces(M);
