/* ------------------------------------------------------------------ *
 * The Yoizaka kit — the ONE import a district needs.
 *
 *   import { machiya, stoneLantern, KIT_MANIFEST } from '../kit/index.js';
 *
 * Districts import from here and nowhere else in the kit: the file split
 * (town / shrine / festival / rail / street) is the kit's own business and
 * moving a generator between files must never be a district's problem.
 *
 * THE CONTRACT, in one paragraph (the long form is at the top of
 * common.js): every generator takes an options object, returns a THREE
 * Group whose ORIGIN IS AT GROUND LEVEL at the assembly's plan centre,
 * faces LOCAL +Z, varies deterministically with `opts.seed`, yaws with
 * `opts.ry`, is tagged `userData.prop = true` so the spatial audit reads
 * the whole assembly as ONE unit, registers NOTHING (districts own ctx),
 * and exposes `name.footprint(opts)` — collider rects relative to the
 * origin, already yawed.  Anything with a walkable top also exposes
 * `name.surfaces(opts)` for `ctx.platform`.  Every emissive lantern mesh
 * carries `userData.practical = true`.
 * ------------------------------------------------------------------ */

export {
  SINK, TONE, M, mix, ASPECT,
  rng, bx, cyl, member, plank, meshOf, addMesh,
  printed, board, practical, lanternRig, asProp, rect, surf,
} from './common.js';

export {
  TENANTS, TENANT_IDS, tenantOf,
  tenantFascia, tenantPlate, tenantNoren,
  haltBoard, haltNotice, warningNotice,
  shrinePlate, shrineNotice,
  festivalNobori, festivalBanner, phonePlate, stallPlate,
} from './signage.js';

export { machiya, rowhouse } from './town.js';
export { shrineHall, torii, stoneLantern } from './shrine.js';
export { yagura, matsuriStall, lanternString } from './festival.js';
export { stationHalt, crossingSignal } from './rail.js';
export { canalKerb, footbridge, phonebox, postRack } from './street.js';

import { machiya, rowhouse } from './town.js';
import { shrineHall, torii, stoneLantern } from './shrine.js';
import { yagura, matsuriStall, lanternString } from './festival.js';
import { stationHalt, crossingSignal } from './rail.js';
import { canalKerb, footbridge, phonebox, postRack } from './street.js';

/**
 * Every generator, once, with the options the showcase builds it from and
 * the plan width it needs on a row.  This is the list the showcase scene
 * and `scripts/check-kit.mjs` walk — so a generator that is added to the
 * kit and NOT added here is a generator no gate has ever looked at.
 *
 * `width` is the assembly's plan size along x INCLUDING eaves and flags:
 * the showcase packs rows from it, and the spatial audit's OVERLAP test is
 * a bbox test, so an understated width fails the gate rather than quietly
 * producing a muddle.
 */
export const KIT_MANIFEST = Object.freeze([
  { name: 'machiya', build: machiya, footprint: machiya.footprint, opts: { seed: 4, tenant: 'kissaten' }, width: 8.4, row: 0 },
  { name: 'rowhouse', build: rowhouse, footprint: rowhouse.footprint, opts: { seed: 2, variant: 1 }, width: 7.0, row: 0 },
  { name: 'phonebox', build: phonebox, footprint: phonebox.footprint, opts: { seed: 1 }, width: 1.4, row: 0 },
  { name: 'postRack', build: postRack, footprint: postRack.footprint, opts: { seed: 6 }, width: 2.7, row: 0 },

  { name: 'shrineHall', build: shrineHall, footprint: shrineHall.footprint, surfaces: shrineHall.surfaces, opts: { seed: 3 }, width: 7.2, row: 1 },
  { name: 'torii', build: torii, footprint: torii.footprint, opts: { seed: 5, h: 5.2 }, width: 5.7, row: 1 },
  { name: 'stoneLantern-large', build: stoneLantern, footprint: stoneLantern.footprint, opts: { seed: 8, size: 'large' }, width: 1.1, row: 1 },
  { name: 'stoneLantern-small', build: stoneLantern, footprint: stoneLantern.footprint, opts: { seed: 9, size: 'small' }, width: 0.8, row: 1 },

  { name: 'yagura', build: yagura, footprint: yagura.footprint, opts: { seed: 7 }, width: 5.9, row: 2 },
  { name: 'matsuriStall-open', build: matsuriStall, footprint: matsuriStall.footprint, opts: { seed: 2, goods: 0 }, width: 3.6, row: 2 },
  { name: 'matsuriStall-shut', build: matsuriStall, footprint: matsuriStall.footprint, opts: { seed: 5, goods: 3, shut: true }, width: 3.6, row: 2 },
  { name: 'lanternString', build: lanternString, footprint: lanternString.footprint, opts: { seed: 1, span: 9 }, width: 9.6, row: 2 },

  { name: 'stationHalt', build: stationHalt, footprint: stationHalt.footprint, surfaces: stationHalt.surfaces, opts: { seed: 4 }, width: 13.6, row: 3 },
  { name: 'crossingSignal', build: crossingSignal, footprint: crossingSignal.footprint, opts: { seed: 1 }, width: 4.4, row: 3 },
  { name: 'canalKerb', build: canalKerb, footprint: canalKerb.footprint, opts: { seed: 3, len: 10 }, width: 10.4, row: 3 },
  { name: 'footbridge', build: footbridge, footprint: footbridge.footprint, surfaces: footbridge.surfaces, opts: { seed: 1 }, width: 5.8, row: 3 },
]);

/** The four showcase rows, north to south, for camera and report labels. */
export const KIT_ROWS = Object.freeze(['town', 'shrine', 'festival', 'line']);
