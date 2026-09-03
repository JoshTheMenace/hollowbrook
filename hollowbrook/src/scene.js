import * as THREE from 'three';
import plan from '../city-plan.json' with { type: 'json' };
import { createBuilder } from './builders.js';
import { composeCity } from './core/district.js';
import { TERRAIN_TONES } from './terrain.js';
import { southgate } from './districts/southgate.js';
import { marketlow } from './districts/marketlow.js';
import { keephill } from './districts/keephill.js';
import { millreach } from './districts/millreach.js';
import { chapelclose } from './districts/chapelclose.js';
import { wardrow } from './districts/wardrow.js';
import { buildShowcase, SHOWCASE_CAMERAS } from './kit/_showcase.js';

/**
 * Hollowbrook — the composition root.  composeCity lays ONE continuous
 * terrain over the whole footprint first (src/terrain.js owns its tones and
 * its probes; the numbers are the plan's `terrain` block), routes
 * ctx.groundAt through it, then runs the districts in `after` order; they
 * dress it.  Until a district agent replaces its stub, a district module
 * builds nothing and the town is the terrain — walls, stairs, market and
 * keep included, because the terrain is what carries them here.
 *
 * buildVignette(scene, { only }) builds one district in full and every
 * other as its plan `massing` stub — what a district agent sees mid-build.
 * The game layer (src/game/) is additive over this and never edits it.
 */
export function buildVignette(scene, { only = null, showcase = null } = {}) {
  if (only === null && typeof location !== 'undefined') {
    only = new URLSearchParams(location.search).get('only');
  }
  /* THE KIT SHOWCASE, and the reason it is a branch here rather than a
   * scratch copy of this file: `check-spatial.mjs` and `check-cameras.mjs`
   * both import THIS module, so a showcase reviewed through a fork of it
   * is reviewed by a fork of the gates.  `?showcase` in the page,
   * HOLLOWBROOK_SHOWCASE=1 for the scripts.  Inert otherwise. */
  if (showcase === null) {
    showcase = (typeof location !== 'undefined' && new URLSearchParams(location.search).has('showcase'))
      || (typeof process !== 'undefined' && !!process.env?.HOLLOWBROOK_SHOWCASE);
  }
  const root = new THREE.Group();
  root.name = 'city';
  scene.add(root);
  const ctx = createBuilder(root);

  if (showcase) return buildShowcaseVignette(root, ctx, plan);

  const MODULES = [southgate, marketlow, keephill, millreach, chapelclose, wardrow];
  const city = composeCity({
    plan,
    districts: only ? MODULES.filter((m) => m.id === only) : MODULES,
    ctx,
    terrainMaterials: TERRAIN_TONES(),
    only,
  });

  const footprint = plan.districts.reduce((acc, d) => ({
    x0: Math.min(acc.x0, d.envelope.x0), z0: Math.min(acc.z0, d.envelope.z0),
    x1: Math.max(acc.x1, d.envelope.x1), z1: Math.max(acc.z1, d.envelope.z1),
  }), { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity });

  const spawn = plan.game?.player?.spawn ?? [0, 30];
  return {
    root, plan, city,
    colliders: ctx.colliders,
    platforms: ctx.platforms,
    interactables: ctx.interactables,
    groundAt: ctx.groundAt,
    spawn: [spawn[0], 0, spawn[1]],
    update: (dt, eye) => ctx.step(dt, eye),
    interiorFloors: ctx.interiorFloors,
    reset: () => ctx.resetAll(),
    state: () => ({ district: city.only ?? 'all' }),
    diagnostics: (renderer) => ctx.diagnostics(renderer),
    footprint,
    footprintHeight: 24,
    // the spatial audit's hole floor: the sunk market is at -1.4, so a fixed
    // -0.5 would report the whole square as a hole
    holeFloorY: Math.min(...plan.terrain.levels.map((l) => l.y)) - 0.5,
    auditIslands: ['props'],
    auditLinear: ['ground'],
    reviewCameras: Object.fromEntries((plan.vista_cameras ?? []).map((v) => [v.name, v])),
  };
}

/**
 * The kit showcase as a vignette: one of every generator, laid out in
 * ranks, with `SHOWCASE_CAMERAS` as its review set.  Not a district, not
 * part of the city, and not built unless asked for.
 *
 * The ground slabs come back as UNEXPLAINED-MASS from the spatial audit and
 * that is correct and decided: they are the harness's stand-in for
 * `core/terrain.js`, which the showcase does not run because it is not a
 * city.  Everything else must come back clean.
 */
function buildShowcaseVignette(root, ctx, cityPlan) {
  const { spawn } = buildShowcase(ctx);
  return {
    root, plan: cityPlan, city: { order: [], stats: {}, warnings: [], only: 'showcase' },
    colliders: ctx.colliders,
    platforms: ctx.platforms,
    interactables: ctx.interactables,
    groundAt: ctx.groundAt,
    spawn,
    update: (dt, eye) => ctx.step(dt, eye),
    interiorFloors: ctx.interiorFloors,
    reset: () => ctx.resetAll(),
    state: () => ({ district: 'showcase' }),
    diagnostics: (renderer) => ctx.diagnostics(renderer),
    /* the footprint is what the audit's hole grid samples, so it has to be
     * the ground the showcase actually lays and not a round number: quote a
     * bigger rectangle and every square metre outside the slabs comes back
     * as HOLE, which is a true statement about a false contract. */
    footprint: { x0: -48, z0: -25, x1: 48, z1: 65.5 },
    footprintHeight: 24,
    holeFloorY: -0.5,
    auditIslands: ['props'],
    auditLinear: ['ground'],
    reviewCameras: SHOWCASE_CAMERAS,
  };
}
