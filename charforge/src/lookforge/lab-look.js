import * as THREE from 'three';
import { characters } from '../characters/index.js';
import { toonMaterial, facetBall, facet } from '../lib/parts.js';
import { makePost } from './post.js';
import { addOutlines } from './outline.js';
import { LOOKS } from './content/looks.js';

// LookForge lab — one representative scene (characters, props, an emissive
// source for bloom to bite on) rendered through the post stack. Exposes
// __lookShot / __lookCapture so gates get a standard evidence set.

const W = 960, H = 540;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#1d1a2e');
scene.fog = new THREE.Fog('#1d1a2e', 22, 44);
const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 60);
camera.position.set(2.4, 3.4, 4.4);
camera.lookAt(0, 0.5, -0.4);

scene.add(new THREE.HemisphereLight('#7a7ab8', '#3a3452', 1.3));
const moon = new THREE.DirectionalLight('#b8c2f2', 2.0);
moon.position.set(-5, 8, 4);
scene.add(moon);
const lampLight = new THREE.PointLight('#ffc887', 18, 9, 1.7);
lampLight.position.set(2.2, 1.7, -0.3);
scene.add(lampLight);

// ground + props
const ground = new THREE.Mesh(new THREE.CircleGeometry(26, 48), toonMaterial('#3a3454', { rim: 0.2 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
for (let i = 0; i < 5; i++) {
  const rock = facetBall(0.3 + (i % 3) * 0.18, toonMaterial('#4a4066', { rim: 0.35, rimColor: '#8a7ac0' }), [1, 0.8, 1], [6, 4]);
  rock.position.set(Math.sin(i * 2.4) * 3.4, 0.12, Math.cos(i * 2.4) * 2.6 - 1);
  scene.add(rock);
}
// lantern: the emissive bloom source
const lantern = new THREE.Group();
const post = facet(new THREE.CylinderGeometry(0.05, 0.07, 1.6, 5), toonMaterial('#2c2440', { rim: 0.2 }));
post.position.y = 0.8;
lantern.add(post);
const glow = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 1), new THREE.MeshBasicMaterial({ color: '#ffd9a0' }));
glow.position.y = 1.7;
lantern.add(glow);
lantern.position.set(2.3, 0, -0.5);
scene.add(lantern);

// cast: two heroes mid-pose
const cast = [];
async function spawn(name, x, z, heading, clip = 'idle', t = 0.4) {
  const mod = await characters[name]();
  const built = await mod.build();
  built.root.position.set(x, 0, z);
  built.root.rotation.y = heading;
  const mixer = new THREE.AnimationMixer(built.root);
  const c = built.clips.find((cl) => cl.name === clip) || built.clips[0];
  mixer.clipAction(c).play();
  mixer.update(t);
  built.root.updateMatrixWorld(true);
  built.update?.();
  scene.add(built.root);
  cast.push(built.root);
  return built;
}
await spawn('ronin', -0.5, 0.4, 0.5);
await spawn('brute', 0.9, -0.7, -0.4, 'idle', 0.9);

// post stack + outlines
const postFx = makePost(renderer, scene, camera, LOOKS.nightbloom);
let removeOutlines = addOutlines(scene);
let outlinesOn = true;

function setOutlines(on) {
  if (on === outlinesOn) return;
  if (on) removeOutlines = addOutlines(scene);
  else removeOutlines();
  outlinesOn = on;
}

function renderOnce() {
  postFx.render(1 / 60);
}
renderOnce();

// __lookShot('name', { look: 'nightbloom'|lookObj, outlines: true, raw: false })
window.__lookShot = async (name, opts = {}) => {
  const look = typeof opts.look === 'string' ? LOOKS[opts.look] : (opts.look || LOOKS.nightbloom);
  setOutlines(opts.outlines ?? true);
  postFx.setLook(look);
  if (opts.raw) renderer.render(scene, camera);
  else renderOnce();
  const dataUrl = renderer.domElement.toDataURL('image/png');
  const res = await fetch('/__shot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, dataUrl }) });
  return res.json();
};

// The standard gate set + a beauty shot per look preset.
window.__lookCapture = async () => {
  const out = [];
  out.push(await window.__lookShot('lookgate-flat', { look: 'flat', outlines: false }));
  out.push(await window.__lookShot('lookgate-base', { look: 'nightbloom', outlines: true }));
  out.push(await window.__lookShot('lookgate-nobloom', { look: { ...LOOKS.nightbloom, bloom: { strength: 0 } }, outlines: true }));
  out.push(await window.__lookShot('lookgate-nooutline', { look: 'nightbloom', outlines: false }));
  for (const l of ['sakura-day', 'nightbloom', 'emberfall']) {
    out.push(await window.__lookShot(`look-${l}`, { look: l, outlines: true }));
  }
  return out.map((r) => r.file);
};

// tiny UI for humans
const ui = document.getElementById('ui');
for (const l of Object.keys(LOOKS)) {
  const b = document.createElement('button');
  b.textContent = l;
  b.className = l === 'nightbloom' ? 'on' : '';
  b.onclick = () => {
    postFx.setLook(LOOKS[l]);
    renderOnce();
    for (const x of ui.children) x.classList.toggle('on', x === b);
  };
  ui.appendChild(b);
}
const ob = document.createElement('button');
ob.textContent = 'outlines';
ob.className = 'on';
ob.onclick = () => { setOutlines(!outlinesOn); ob.classList.toggle('on', outlinesOn); renderOnce(); };
ui.appendChild(ob);
window.__look = { scene, camera, renderer, postFx, setOutlines, renderOnce, LOOKS };
window.__lookReady = true;
