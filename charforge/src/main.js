import * as THREE from 'three';
import { buildStage } from './lab/stage.js';
import { installCapture } from './lab/capture.js';
import { characters } from './characters/index.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 200);

const stage = buildStage(scene, renderer);

const lab = { THREE, renderer, scene, camera, stage, character: null };

// Load a character module by registry name; replaces the current one.
async function load(name) {
  const entry = characters[name];
  if (!entry) throw new Error(`unknown character "${name}" — have: ${Object.keys(characters).join(', ')}`);
  if (lab.character) scene.remove(lab.character.root);
  // File-backed characters are imported with a cache-buster so an edited
  // module can NEVER be served stale (a stale module once shipped a GIF of
  // an already-fixed animation). Registry-only entries (KayKit) fall back.
  let mod;
  try {
    mod = await import(/* @vite-ignore */ `./characters/${name}.js?v=${Date.now()}`);
  } catch {
    mod = await entry();
  }
  const built = await mod.build();
  const { root, clips = [], meta = {} } = built;
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  scene.add(root);
  const mixer = new THREE.AnimationMixer(root);
  const actions = {}, clipsByName = {};
  for (const c of clips) { actions[c.name] = mixer.clipAction(c); clipsByName[c.name] = c; }
  lab.character = { root, mixer, actions, clipsByName, meta, name, update: built.update };
  document.getElementById('hud').textContent =
    `${name} — clips: ${clips.map((c) => `${c.name}(${c.duration.toFixed(2)}s)`).join(', ') || 'none'}`;
  return Object.keys(clipsByName);
}

lab.load = load;
window.__lab = lab;
installCapture(lab);

// Live preview when a human is watching (rAF may never fire under the
// headless Browser pane — captures don't depend on this loop).
const clock = new THREE.Clock();
let liveClip = null;
window.__play = (clipName) => {
  const a = lab.character?.actions[clipName];
  if (!a) return false;
  Object.values(lab.character.actions).forEach((x) => x.stop());
  a.reset().play();
  liveClip = clipName;
  return true;
};
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  if (lab.character && liveClip) {
    lab.character.mixer.update(dt);
    lab.character.root.updateMatrixWorld(true);
    lab.character.update?.();
  }
  renderer.render(scene, camera);
});

// Simple showcase panel: character switcher + clip buttons.
function refreshPanel() {
  const panel = document.getElementById('panel');
  panel.innerHTML = '';
  for (const name of Object.keys(characters)) {
    if (name === 'dummy') continue;
    const b = document.createElement('button');
    b.textContent = name;
    b.className = lab.character?.name === name ? 'on' : '';
    b.onclick = async () => { await load(name); window.__play('idle'); refreshPanel(); };
    panel.appendChild(b);
  }
  const sep = document.createElement('div');
  sep.className = 'sep';
  panel.appendChild(sep);
  for (const clip of Object.keys(lab.character?.clipsByName || {})) {
    const b = document.createElement('button');
    b.textContent = `▶ ${clip}`;
    b.onclick = () => window.__play(clip);
    panel.appendChild(b);
  }
}

const params = new URLSearchParams(location.search);
const initial = params.get('c') || Object.keys(characters)[0];
if (initial) {
  await load(initial);
  // Default camera so a human sees something sensible immediately.
  camera.position.set(1.6, 1.4, 2.6);
  camera.lookAt(0, 0.8, 0);
  if (lab.character.actions.idle) window.__play('idle');
  refreshPanel();
}
