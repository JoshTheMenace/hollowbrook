import * as THREE from 'three';
import { Pipeline } from '../core/post.js';
import { cel } from '../core/toon.js';
import { PAL } from '../palette.js';
import { skyTexture } from '../textures.js';
import { characters } from '@forge/characters/index.js';
import { makeCritter } from '@forge/survivors/critters.js';

// Interop derisk: CharForge characters (authored on three 0.170) rendered
// through the starter's three 0.180 + cel/ink/grade Pipeline. If ronin's
// toon materials, mixer clips and per-frame constraints survive this page,
// the whole cast can move to Yoizaka.

const canvas = document.querySelector('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = skyTexture('#9db4e2', '#e8d9c8', '#f6dcbc');
scene.fog = new THREE.Fog(PAL.fog, 20, 60);
const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 90);
camera.position.set(0, 2.2, 7.5);
camera.lookAt(0, 0.9, 0);

const sun = new THREE.DirectionalLight(PAL.sun, 2.6);
sun.position.set(-9, 7, 6);
sun.castShadow = true;
scene.add(sun);
const fill = new THREE.DirectionalLight(PAL.fill, 1.1);
fill.position.set(8, 5, -6);
scene.add(fill);
scene.add(new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, 0.9));

const ground = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), cel({ color: PAL.groundMid }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const pipeline = new Pipeline(renderer, scene, camera);
function resize() {
  // a backgrounded pane can report 0x0 — never size the canvas to nothing
  const w = innerWidth || 1280, h = innerHeight || 720;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  pipeline.setSize(w, h);
}
addEventListener('resize', resize);
resize();

// ---- cast ----
const cast = [];      // { root, mixer, update }
async function spawnChar(name, x, z, heading, clip = 'idle') {
  const mod = await characters[name]();
  const built = await mod.build();
  built.root.position.set(x, 0, z);
  built.root.rotation.y = heading;
  built.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  const mixer = new THREE.AnimationMixer(built.root);
  const c = built.clips.find((cl) => cl.name === clip) || built.clips[0];
  mixer.clipAction(c).play();
  scene.add(built.root);
  cast.push({ root: built.root, mixer, update: built.update });
  return built;
}

const status = { ok: false, errors: [] };
try {
  await spawnChar('ronin', -2.2, 0, 0.4);
  await spawnChar('brute', 0, -0.6, 0, 'idle');
  await spawnChar('fox', 2.0, 0.4, -0.5, 'walk');
  for (const [i, kind] of ['slime', 'bat', 'bonehead'].entries()) {
    const c = makeCritter(kind);
    c.root.position.set(-3.5 + i * 1.1, 0, 2.2);
    scene.add(c.root);
    cast.push({ root: c.root, mixer: null, update: null, critter: c });
  }
  status.ok = true;
} catch (e) {
  status.errors.push(String(e && e.stack || e));
  console.error('[cast-test]', e);
}

let t = 0;
function step(dt) {
  t += dt;
  for (const c of cast) {
    if (c.mixer) c.mixer.update(dt);
    if (c.critter) c.critter.update(dt, t);
    c.root.updateMatrixWorld(true);
    c.update?.();
  }
  pipeline.render();
}
renderer.setAnimationLoop(() => step(1 / 60));

// day/night calibration rig: a couple of practicals + the phase system
import { DayNight } from './daynight.js';
import { flat } from '../core/toon.js';
for (const x of [-3.5, 3.5]) {
  const lampPost = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.4, 6), cel({ color: PAL.trim }));
  lampPost.position.set(x, 1.2, -1.5);
  scene.add(lampPost);
  const glow = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 1), flat({ color: PAL.warmLight, emissive: PAL.warmLight, emissiveIntensity: 1 }));
  glow.position.set(x, 2.5, -1.5);
  glow.userData.practical = true;
  scene.add(glow);
}
const daynight = new DayNight({ scene, sun, fill, hemi: scene.children.find((o) => o.isHemisphereLight), pipeline, root: scene });
daynight.collectPracticals(scene);
daynight.set('day');
window.__daynight = daynight;

window.__cast = { status, cast, step, scene, pipeline };
window.__shotCast = async (name, opts = {}) => {
  if (opts.ink === false) pipeline.enabled.ink = false;
  step(1 / 60);
  const data = renderer.domElement.toDataURL('image/jpeg', 0.92);
  pipeline.enabled.ink = true;
  const res = await fetch('/__shot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, data }) });
  return res.json();
};
