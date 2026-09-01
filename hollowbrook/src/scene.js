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
export function buildVignette(scene, { only = null } = {}) {
  if (only === null && typeof location !== 'undefined') {
    only = new URLSearchParams(location.search).get('only');
  }
  const root = new THREE.Group();
  root.name = 'city';
  scene.add(root);
  const ctx = createBuilder(root);

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
