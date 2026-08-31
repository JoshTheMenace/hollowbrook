import * as THREE from 'three';
import plan from '../city-plan.json' with { type: 'json' };
import { createBuilder } from './builders.js';
import { composeCity } from './core/district.js';
import { cel } from './core/toon.js';
import { PAL } from './palette.js';
import { DISTRICTS } from './districts/index.js';

/**
 * Yoizaka — city-mode scene entry. The plan owns the layout, the terrain
 * stage owns the ground, district modules own everything standing on it.
 * This file only composes; content lives in src/districts/ and src/kit/.
 */

// terrain tone -> material (keys fixed by core/terrain.js)
function terrainMaterials() {
  return {
    ground: cel({ color: PAL.groundMid }),
    paving: cel({ color: PAL.ground }),
    bank: cel({ color: PAL.groundDark }),
    surrounds: cel({ color: 0xa8ab8a }),  // dry-field green beyond the town
    shore: cel({ color: 0xd2c4a2 }),      // festival ground's swept sand
    skirt: cel({ color: PAL.groundDeep }),
    water: cel({ color: 0x5a7e8e }),
  };
}

export function buildVignette(scene, { only = null } = {}) {
  // district agents view their parcel against neighbour massing stubs with
  // ?district=<id>; check-city --district passes `only` directly
  if (only === null && typeof location !== 'undefined') {
    only = new URLSearchParams(location.search).get('district');
  }
  const root = new THREE.Group();
  root.name = 'yoizaka';
  scene.add(root);
  const ctx = createBuilder(root);

  const city = composeCity({ plan, districts: DISTRICTS, ctx, terrainMaterials: terrainMaterials(), only });

  return {
    root,
    plan,
    city,
    groundAt: (x, z) => ctx.groundAt(x, z),
    colliders: ctx.colliders,
    interactables: ctx.interactables,
    update: (dt) => ctx.step(dt),
    reset: () => ctx.resetAll(),
    state: () => ({}),
    diagnostics: (renderer) => ctx.diagnostics(renderer),
    footprintHeight: plan.city.footprint_m[1],
    // spatialcheck reads footprint.depth — without it the in-page seam grid
    // silently samples zero rows (kit agent's finding)
    footprint: { width: plan.city.footprint_m[0], height: plan.city.footprint_m[1], depth: plan.city.footprint_m[1] },
    reviewCameras: Object.fromEntries(plan.vista_cameras.map((v) => [v.name, { ...v }])),
  };
}
