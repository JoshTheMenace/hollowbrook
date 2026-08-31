import * as THREE from 'three';
import { Pipeline } from '@town/core/post.js';
import { cel, shadowTintActive } from '@town/core/toon.js';
import { PAL } from '@town/palette.js';
import { Hero } from '@town/game/hero.js';
import { buildCorner, cornerLights } from '../shared/corner.js';
import { DayNight } from '@town/game/daynight.js';
import { Actor } from '@forge/game/actor.js';
import { celify, celCensus } from '@forge/lib/celify.js';

/* THE CEL BRIDGE (battery B2) — one CharForge character inside a
 * scene-pipeline cel/ink corner, re-materialed through the world's own
 * cel() factory. B toggles the bridge for the A/B the review needs. */

const canvas = document.querySelector('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
if (!shadowTintActive()) console.error('[celbridge] shadow tint OFF');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 70);
const { sun, fill, hemi } = cornerLights(scene);
const { colliders } = buildCorner(scene);

// ---- the character --------------------------------------------------------
let actor = null;
let bridged = false;
let rawMaterials = null;          // mesh -> original material, for the A/B
const pipeline = new Pipeline(renderer, scene, camera, {
  ink: { color: PAL.ink, fadeStart: 24, fadeEnd: 60, skyDepth: 70 },
  grade: { shadowTint: PAL.gradeShadow, lightTint: PAL.gradeLight },
});

function setBridge(on) {
  if (!actor || on === bridged) return;
  if (on) {
    if (!rawMaterials) {
      rawMaterials = new Map();
      actor.root.traverse((o) => { if (o.isMesh) rawMaterials.set(o, o.material); });
      const report = celify(actor.root, cel, {
        accentGuard: [['lantern-amber', 36 / 360, 0.04, 0.62], ['blossom-pink', 330 / 360, 0.04, 0.62]],
      });
      console.log(`[celbridge] celified ${report.converted}/${report.meshes} meshes,`, [...report.colors.keys()].length, 'source colors');
    } else {
      actor.root.traverse((o) => { if (o.isMesh && o.userData._celMat) o.material = o.userData._celMat; });
    }
    actor.root.traverse((o) => { if (o.isMesh) o.userData._celMat = o.material; });
  } else {
    actor.root.traverse((o) => { if (o.isMesh && rawMaterials.has(o)) o.material = rawMaterials.get(o); });
  }
  bridged = on;
}

actor = await Actor.spawn('ronin', { walkSpeed: 1.4, runSpeed: 3.2 });
actor.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
actor.root.position.set(1.2, 0, -2.8);
actor.root.rotation.y = -0.55;   // facing the approach — you MEET him
actor.heading = -0.55;
scene.add(actor.root);
setBridge(true);

// ---- walkable approach ----------------------------------------------------
const hero = new Hero({
  actor: null, camera, canvas,
  colliders,
  groundAt: () => 0,
  spawn: [2.5, 0, 6],
  yaw: Math.PI + 0.35,
});
// the hero here is a walking CAMERA; the ronin is the subject standing still
const daynight = new DayNight({ scene, sun, fill, hemi, pipeline, root: scene });
daynight.collectPracticals(scene);
daynight.set('day');

addEventListener('keydown', (e) => {
  if (e.code === 'KeyB') setBridge(!bridged);
  if (e.code === 'KeyN') daynight.fadeTo(daynight.current === 'night' ? 'day' : 'night', 2);
});

// ---- loop -----------------------------------------------------------------
const clock = new THREE.Clock();
function tick(dt) {
  hero.update(dt);
  actor.update(dt);
  daynight.update(dt, hero.position);
  pipeline.render();
}
function resize() {
  const w = innerWidth || 1280, h = innerHeight || 720;
  pipeline.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
requestAnimationFrame(function loop() { tick(Math.min(clock.getDelta(), 0.05)); requestAnimationFrame(loop); });

// ---- gates + evidence -----------------------------------------------------
window.__tick = tick;
window.__bridge = { setBridge, get bridged() { return bridged; }, actor, daynight, hero, scene };
window.__census = () => celCensus(actor.root, {
  maxAccents: 2,
  forbiddenHues: [['lantern-amber', 36 / 360, 0.04], ['blossom-pink', 330 / 360, 0.04]],
});
window.__shot = async (name, opts = {}) => {
  actor.update(1 / 60);
  daynight.update(1 / 60, hero.position);
  if (opts.pos) { camera.position.fromArray(opts.pos); camera.lookAt(new THREE.Vector3().fromArray(opts.lookAt ?? [0, 1, -3])); }
  pipeline.render();   // NOT tick(): hero.update would re-seize the camera
  const data = renderer.domElement.toDataURL('image/jpeg', 0.92);
  const res = await fetch('/__shot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, data }) });
  return res.json();
};
window.__evidence = async () => {
  const out = [];
  const meet = { pos: [3.6, 1.7, 0.6], lookAt: [0.4, 1, -3.6] };
  setBridge(true);
  out.push(await window.__shot('cb-meet', meet));
  out.push(await window.__shot('cb-close', { pos: [0.4, 1.35, -0.7], lookAt: [1.2, 1.0, -2.8] }));  // portrait from his front, shadow side in frame
  out.push(await window.__shot('cb-far', { pos: [10, 2.2, 6], lookAt: [0, 1, -4] }));
  setBridge(false);
  out.push(await window.__shot('cb-ab-raw', meet));
  setBridge(true);
  daynight.set('night');
  out.push(await window.__shot('cb-night', meet));
  daynight.set('day');
  return out.map((r) => r.file);
};
