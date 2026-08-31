import * as THREE from 'three';
import { buildVignette } from '../scene.js';
import { Pipeline } from '../core/post.js';
import { shadowTintActive } from '../core/toon.js';
import { sunPosition, fillPosition, shadowRadius } from '../core/sunrig.js';
import { PAL } from '../palette.js';
import { skyTexture } from '../textures.js';
import { Hero } from './hero.js';
import { DayNight } from './daynight.js';
import { NightBattle } from './night.js';
import { Actor } from '@forge/game/actor.js';

/* ------------------------------------------------------------------ *
 * Nightbloom game boot: the generated town (scene.js/composeCity) + a
 * third-person CharForge hero + the day/night system. Rendering goes
 * through the starter Pipeline — never renderer.render directly.
 * ------------------------------------------------------------------ */

const canvas = document.querySelector('#view');
const promptEl = document.querySelector('#prompt');
const phaseEl = document.querySelector('#phase');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
if (!shadowTintActive()) console.error('[game] cel shadow tint is OFF');

const scene = new THREE.Scene();
scene.background = skyTexture(css(PAL.sky.top), css(PAL.sky.mid), css(PAL.sky.haze));
scene.fog = new THREE.Fog(PAL.fog, 26, 100);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 130);

function css(v) { return '#' + v.toString(16).padStart(6, '0'); }

// light rig (day pole; DayNight owns it from here on)
const sun = new THREE.DirectionalLight(PAL.sun, 2.0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.035;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(PAL.fill, 0.9);
scene.add(fill, fill.target);
const bounce = new THREE.DirectionalLight(PAL.bounce, 0.3);
bounce.position.set(3, -5, 12);
scene.add(bounce, bounce.target);
const hemi = new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, 1.0);
scene.add(hemi);

// ---- the town -------------------------------------------------------------
const vignette = buildVignette(scene);
const spec = vignette.plan.city;
sun.position.fromArray(sunPosition(spec));
fill.position.fromArray(fillPosition(spec));
const r = shadowRadius(spec.footprint_m);
sun.shadow.camera.left = -r; sun.shadow.camera.right = r;
sun.shadow.camera.top = r; sun.shadow.camera.bottom = -r;
sun.shadow.camera.near = 1; sun.shadow.camera.far = Math.max(160, r * 4);
sun.shadow.camera.updateProjectionMatrix();

const pipeline = new Pipeline(renderer, scene, camera, {
  ink: { color: PAL.ink, fadeStart: 30, fadeEnd: 80, skyDepth: 115 },
  grade: { shadowTint: PAL.gradeShadow, lightTint: PAL.gradeLight },
});

// ---- hero -----------------------------------------------------------------
let hero = null;
let actor = null;
try {
  actor = await Actor.spawn('ronin', { walkSpeed: 1.4, runSpeed: 3.2 });
  actor.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(actor.root);
} catch (e) {
  console.error('[game] hero actor failed to load:', e);
}
hero = new Hero({
  actor, camera, canvas,
  colliders: vignette.colliders,
  groundAt: vignette.groundAt,
  spawn: [-30, 0, 0],
  yaw: -Math.PI / 2,           // camera behind, looking east down the street
});

// ---- day/night ------------------------------------------------------------
const daynight = new DayNight({ scene, sun, fill, hemi, pipeline, root: scene });
const found = daynight.collectPracticals(scene);
console.log(`[game] ${found} practicals collected`);
daynight.set('day');
phaseEl.textContent = 'day';

// ---- night battle ---------------------------------------------------------
let battle = null;
const _move = new THREE.Vector3();
function startNight() {
  battle = new NightBattle({
    scene, hero, character: 'ronin', groundY: 0,
    onEvent: (type, data) => {
      // v1: log-only juice; SoundForge SFX + particles wire in next pass
      if (type === 'level-up') autoPick();
      if (type === 'victory' || type === 'defeat') endNight(type);
    },
  });
  hero.external = true;
}
function autoPick() {
  const r = battle.run;
  while (r.pendingLevelUps > 0) {
    r.pendingLevelUps--;
    const ch = r.choices();
    if (ch.length) r.applyChoice(ch[Math.floor(Math.random() * ch.length)]);
  }
}
function endNight(result) {
  phaseEl.textContent = result === 'victory' ? 'dawn — survived' : 'the bloom takes another';
  setTimeout(() => {
    battle?.dispose();
    battle = null;
    hero.external = false;
    daynight.fadeTo('day', 5);
    phaseEl.textContent = 'day';
  }, 2200);
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyT') {                      // cycle phases (dev)
    const cur = daynight.fade?.name ?? daynight.current ?? 'day';
    const next = { day: 'dusk', dusk: 'night', night: 'day' }[cur];
    daynight.fadeTo(next, 3);
    phaseEl.textContent = next;
    if (next === 'night' && !battle) startNight();
    if (next === 'day' && battle) { battle.dispose(); battle = null; hero.external = false; }
  }
  if (e.code === 'KeyE' && nearInteract) nearInteract.action();
  if (e.code === 'KeyR' && !battle) hero.place(-30, 0, -Math.PI / 2);
});

// ---- interaction: proximity, not camera ray (third person) ----------------
let nearInteract = null;
const _wp = new THREE.Vector3();
function findInteract() {
  let best = null, bd = 2.4 * 2.4;
  for (const it of vignette.interactables) {
    if (!it.hitbox) continue;
    it.hitbox.getWorldPosition(_wp);
    const d = (_wp.x - hero.position.x) ** 2 + (_wp.z - hero.position.z) ** 2;
    if (d < bd) { bd = d; best = it; }
  }
  return best;
}

// ---- resize / loop --------------------------------------------------------
function resize() {
  const w = innerWidth || 1280, h = innerHeight || 720;
  pipeline.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
function tick(dt) {
  if (battle) {
    const inp = hero.moveInput();
    _move.set(inp.x, 0, inp.z);
    battle.update(dt, _move.lengthSq() > 0 ? _move : null);
    const r = battle.run;
    phaseEl.textContent = `night · ❤ ${Math.max(0, Math.round(r.stats.hp))}/${r.stats.maxHp} · lv ${r.level} · ☠ ${r.kills} · ${Math.max(0, Math.ceil(480 - r.time))}s`;
  }
  hero.update(dt);
  vignette.update(dt);
  daynight.update(dt, hero.position);
  nearInteract = battle ? null : findInteract();
  promptEl.textContent = nearInteract ? `E · ${nearInteract.label ?? nearInteract.name}` : '';
  pipeline.render();
}
requestAnimationFrame(function loop() {
  tick(Math.min(clock.getDelta(), 0.05));
  requestAnimationFrame(loop);
});

// ---- capture + bot hooks --------------------------------------------------
window.__tick = tick;
window.__game = { hero, actor, daynight, vignette, scene, camera, pipeline, startNight, get battle() { return battle; } };
window.__gshot = async (name, width = 1280, height = 720, opts = {}) => {
  const keep = { pos: camera.position.clone(), quat: camera.quaternion.clone(), aspect: camera.aspect };
  pipeline.setSize(width, height);
  camera.aspect = width / height;
  if (opts.pos) camera.position.fromArray(opts.pos);
  if (opts.lookAt) camera.lookAt(new THREE.Vector3().fromArray(opts.lookAt));
  camera.updateProjectionMatrix();
  pipeline.render();
  const data = renderer.domElement.toDataURL('image/jpeg', 0.92);
  const res = await fetch('/__shot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, data }) });
  camera.position.copy(keep.pos);
  camera.quaternion.copy(keep.quat);
  camera.aspect = keep.aspect;
  camera.updateProjectionMatrix();
  resize();
  return res.json();
};
