import * as THREE from 'three';
import { createBuilder } from '../builders.js';
import { cel } from '../core/toon.js';
import { PAL } from '../palette.js';
import { KIT_MANIFEST, KIT_ROWS } from './index.js';

/* ------------------------------------------------------------------ *
 * The kit showcase: one of every generator, on flat ground, in four
 * labelled rows.
 *
 * This scene exists to be GATED, not to be pretty.  city-scale.md makes
 * the kit the one stage whose gate cannot be deferred — a defect in the
 * kit is a defect in every district — so the showcase's whole job is to
 * put every generator in front of the spatial audit and the camera check
 * at once, before five district agents inherit the same bug and hand-patch
 * it five different ways.
 *
 * It returns exactly what src/scene.js's `buildVignette` returns, so every
 * existing tool (check-spatial's boot, check-cameras, the in-page
 * `window.__vignette` surface) works against it unchanged.
 *
 * ROW PACKING.  Rows are packed from each entry's declared `width`, not
 * from a constant stride: a 13.6 m station halt and a 0.8 m stone lantern
 * on one 6 m grid either overlap or scatter.  The audit's OVERLAP test is
 * a world-bbox test, so two units that touch in plan FAIL the gate — which
 * is the right way round, because an understated width is then a gate
 * failure rather than a muddle nobody notices.
 * ------------------------------------------------------------------ */

const GAP = 6;            // clear metres between neighbours in a row
const ROW_Z = [-36, -12, 12, 36];
const FOOTPRINT = { width: 76, height: 110, depth: 110 };

/**
 * Build the kit showcase into `scene`.
 *
 * @returns the same shape as `buildVignette`: `{ root, groundAt, colliders,
 *   interactables, update, reset, state, diagnostics, footprint,
 *   footprintHeight, reviewCameras }`, plus `placed` (a Map of generator
 *   name -> `{ x, z, object }`) and `meshCounts` for the gate's report.
 */
export function buildShowcase(scene) {
  const root = new THREE.Group();
  root.name = 'kit-showcase';
  scene.add(root);
  const ctx = createBuilder(root);

  /* --- flat cel ground, subdivided ---------------------------------- *
   * Subdivided on purpose: the audit indexes every world triangle into
   * 2 m XZ cells, and two enormous triangles land in every cell in the
   * footprint, which makes each of the ~33 000 seam probes walk the whole
   * ground.  A 25 x 33 grid keeps the buckets local. */
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(FOOTPRINT.width + 24, FOOTPRINT.depth + 24, 25, 33).rotateX(-Math.PI / 2),
    cel({ color: PAL.ground }),
  );
  ground.receiveShadow = true;
  ground.name = 'showcase-ground';
  ctx.add(ground);

  /* --- lay the rows out ---------------------------------------------- */
  const placed = new Map();
  const meshCounts = [];
  for (let row = 0; row < ROW_Z.length; row += 1) {
    const items = KIT_MANIFEST.filter((e) => e.row === row);
    const total = items.reduce((a, e) => a + e.width, 0) + GAP * (items.length - 1);
    let cursor = -total / 2;
    for (const entry of items) {
      const x = cursor + entry.width / 2;
      const z = ROW_Z[row];
      cursor += entry.width + GAP;

      const object = entry.build(entry.opts);
      object.position.set(x, ctx.groundAt(x, z), z);
      ctx.add(object, `kit:${entry.name}`);

      // colliders and walkable tops come from the generator's OWN helpers,
      // never from a rect measured off the model by eye
      for (const c of entry.footprint?.(entry.opts) ?? []) {
        ctx.collide(x + c.x0, z + c.z0, x + c.x1, z + c.z1);
      }
      for (const s of entry.surfaces?.(entry.opts) ?? []) {
        ctx.platform(x + s.x0, z + s.z0, x + s.x1, z + s.z1, s.top);
      }

      let meshes = 0;
      let practicals = 0;
      object.traverse((o) => {
        if (!o.isMesh) return;
        meshes += 1;
        if (o.userData.practical) practicals += 1;
      });
      meshCounts.push({ name: entry.name, row: KIT_ROWS[row], meshes, practicals, x, z });
      placed.set(entry.name, { x, z, object });
    }
  }

  /* --- the one interaction: the yagura drum --------------------------- *
   * One is enough and one is required: the runtime's whole KeyE path is
   * dead code until something registers, and a showcase that never
   * exercises it ships a kit whose `userData.interact` contract has never
   * been run. */
  const tower = placed.get('yagura').object;
  const drum = tower.userData.parts.drum;
  let pulse = 0;
  let strikes = 0;
  ctx.interact({
    name: 'yagura-drum',
    label: tower.userData.interact.label,
    hitbox: tower.userData.interact.hitbox,
    action: () => { pulse = 1; strikes += 1; },
  });
  ctx.update((dt) => {
    if (pulse <= 0) return;
    pulse = Math.max(0, pulse - dt * 2.4);
    // A struck head swells and rings DOWN to rest — the envelope is kept
    // strictly >= 1 on purpose: a sine through zero makes the drum shrink
    // below its own size on alternate half-cycles, which reads as
    // breathing rather than as being hit.
    const s = 1 + 0.15 * pulse * (0.75 + 0.25 * Math.cos(pulse * Math.PI * 6));
    drum.scale.set(s, s, s);
    if (pulse === 0) drum.scale.set(1, 1, 1);
  });
  ctx.reset(() => { pulse = 0; strikes = 0; drum.scale.set(1, 1, 1); });

  /* --- review cameras ------------------------------------------------ *
   * Derived from the subjects' own bounding boxes rather than typed in:
   * the camera gate fails a camera whose subject drifts past |ndc| 0.95
   * and warns past 0.72, and a hand-typed target is exactly how that
   * happens the first time a row's packing changes. */
  root.updateMatrixWorld(true);
  const SPECS = [
    { name: 'kit-town-row', subject: 'kit:machiya', offset: [3.5, 1.6, 15], fov: 50 },
    { name: 'kit-shrine-row', subject: 'kit:shrineHall', offset: [5, 2.2, 14], fov: 50 },
    { name: 'kit-festival-row', subject: 'kit:yagura', offset: [4, 3.0, 15], fov: 52 },
    { name: 'kit-line-row', subject: 'kit:stationHalt', offset: [4, 2.2, 15], fov: 52 },
    { name: 'kit-overview', subject: 'kit:yagura', offset: [-6, 30, -34], fov: 46 },
  ];
  const reviewCameras = {};
  const box = new THREE.Box3();
  const centre = new THREE.Vector3();
  for (const spec of SPECS) {
    const subject = root.getObjectByName(spec.subject);
    box.setFromObject(subject).getCenter(centre);
    reviewCameras[spec.name] = {
      name: spec.name,
      position: [centre.x + spec.offset[0], centre.y + spec.offset[1], centre.z + spec.offset[2]],
      target: centre.toArray(),
      fov: spec.fov,
      subject: spec.subject,
    };
  }

  return {
    root,
    placed,
    meshCounts,
    groundAt: (x, z) => ctx.groundAt(x, z),
    colliders: ctx.colliders,
    platforms: ctx.platforms,
    interactables: ctx.interactables,
    update: (dt) => ctx.step(dt),
    reset: () => ctx.resetAll(),
    state: () => ({ drumPulse: Number(pulse.toFixed(3)), strikes }),
    diagnostics: (renderer) => ctx.diagnostics(renderer),
    // `depth` is carried alongside `height` deliberately: core/spatialcheck
    // reads `footprint.depth` for its seam grid, and a footprint that only
    // says `height` silently samples zero rows.
    footprint: { ...FOOTPRINT },
    footprintHeight: 12,
    reviewCameras,
    spawn: [0, 0, ROW_Z[3] + 16],
  };
}
