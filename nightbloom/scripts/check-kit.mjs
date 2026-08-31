#!/usr/bin/env node
/**
 * KIT GATE — the one gate city-scale.md says cannot be deferred.
 *
 * Builds the kit showcase headless (one instance of every generator in
 * src/kit/, on flat ground) and runs the same audits the city runs:
 *
 *   1. the SPATIAL AUDIT (src/core/spatialcheck.js) — FLOAT / BURIED /
 *      FLOAT-RUN / BURIED-RUN / OVERLAP / ground HOLE-SEAM.  A defect
 *      here is a defect in every district that uses the generator, which
 *      is exactly why this runs before districts start: on the first city
 *      built this way, three of four district agents independently
 *      hand-patched the same two kit bugs.
 *   2. the CAMERA GATE (src/core/camcheck.js) over the showcase's review
 *      cameras, so the frames the coordinator reviews are known to show
 *      what they claim to show.
 *   3. a per-generator MESH / PRACTICAL census — report only, never a
 *      verdict.  A generator with zero practicals is not wrong; a
 *      generator with 90 meshes is a budget conversation.
 *
 *   node scripts/check-kit.mjs    # exit 0 pass · 1 defects found · 2 crashed
 *
 * Booted exactly like scripts/check-spatial.mjs: plain dynamic import
 * under a Canvas2D no-op stub.  Geometry never depends on what a canvas
 * contains, so the signage textures can "draw" into nothing.
 */

const noop = () => stubContext;
const stubContext = new Proxy({}, {
  get: (t, prop) => {
    if (prop === 'canvas') return stubCanvas;
    if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
      return () => ({ addColorStop: () => {} });
    }
    if (prop === 'measureText') return () => ({ width: 1 });
    if (prop === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    return noop;
  },
  set: () => true,
});
const stubCanvas = new Proxy({ width: 2, height: 2 }, {
  get: (t, prop) => (prop === 'getContext' ? () => stubContext : (prop in t ? t[prop] : noop)),
  set: (t, prop, v) => ((t[prop] = v), true),
});
globalThis.document = { createElement: () => stubCanvas, createElementNS: () => stubCanvas };
globalThis.window = globalThis;
globalThis.self = globalThis;

try {
  const THREE = await import('three');
  const { buildShowcase } = await import('../src/kit/showcase.js');
  const { KIT_MANIFEST } = await import('../src/kit/index.js');
  const { createSpatialCheck } = await import('../src/core/spatialcheck.js');
  const { createCameraCheck } = await import('../src/core/camcheck.js');

  const scene = new THREE.Scene();
  const showcase = buildShowcase(scene);
  scene.updateMatrixWorld(true);

  /* --- 1. every generator in the manifest actually landed ------------ */
  const missing = KIT_MANIFEST.filter((e) => !showcase.placed.has(e.name)).map((e) => e.name);
  if (missing.length) {
    console.error(`FAIL MANIFEST — ${missing.join(', ')} never reached the scene`);
    process.exit(1);
  }

  /* --- 2. spatial audit --------------------------------------------- *
   * The rect is passed explicitly rather than as {width, height}: the
   * seam grid reads `footprint.depth`, and a footprint that names only a
   * height samples zero rows and reports a clean pass over nothing. */
  const fp = showcase.footprint;
  const { checkSpatial } = createSpatialCheck({
    scene,
    groundAt: showcase.groundAt,
    colliders: showcase.colliders,
    footprint: { x0: -fp.width / 2, x1: fp.width / 2, z0: -fp.depth / 2, z1: fp.depth / 2 },
  });
  const spatial = checkSpatial();
  console.log(spatial.report);

  /* --- 3. camera gate ------------------------------------------------ */
  const { checkAllCameras } = createCameraCheck({
    scene,
    cameras: showcase.reviewCameras,
    colliders: showcase.colliders,
    footprintHeight: showcase.footprintHeight,
  });
  const cameras = checkAllCameras();
  console.log('\ncamera gate:');
  console.log(cameras.report);

  /* --- 4. census: report only ---------------------------------------- */
  console.log('\nper-generator census (report only — no verdict):');
  const w = Math.max(...showcase.meshCounts.map((m) => m.name.length));
  let meshes = 0;
  let practicals = 0;
  for (const m of showcase.meshCounts) {
    meshes += m.meshes;
    practicals += m.practicals;
    console.log(`  ${m.name.padEnd(w)}  ${String(m.meshes).padStart(3)} meshes  ${String(m.practicals).padStart(2)} practicals  [${m.row}]  @ (${m.x.toFixed(1)}, ${m.z})`);
  }
  console.log(`  ${'TOTAL'.padEnd(w)}  ${String(meshes).padStart(3)} meshes  ${String(practicals).padStart(2)} practicals over ${showcase.meshCounts.length} generators`);
  console.log(`  colliders ${showcase.colliders.length} · walkable surfaces ${showcase.platforms.length} · interactables ${showcase.interactables.length}`);

  const ok = spatial.ok && cameras.ok;
  console.log(`\n${ok ? 'PASS' : 'FAIL'} check-kit`);
  process.exit(ok ? 0 : 1);
} catch (error) {
  console.error('[check-kit] crashed before auditing:', error);
  process.exit(2);
}
