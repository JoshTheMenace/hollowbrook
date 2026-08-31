import * as THREE from 'three';
import { Pipeline } from '@town/core/post.js';
import { cel, shadowTintActive } from '@town/core/toon.js';
import { PAL } from '@town/palette.js';
import { Hero } from '@town/game/hero.js';
import { Actor } from '@forge/game/actor.js';
import { Performer } from '@forge/game/performer.js';
import { celify } from '@forge/lib/celify.js';
import { Feel } from '@forge/engine/feel.js';
import { AdaptiveMusic, SfxPlayer } from '@forge/soundforge/runtime.js';
import { SFX } from '@forge/soundforge/content/sfx-core.js';
import { LOOP } from '@forge/soundforge/content/loop-nightbloom.js';
import { buildCorner, cornerLights } from '../shared/corner.js';
import { BRIDGE } from '../shared/bridge.js';
import { ErrandRun, ERRAND_EVENTS, LAYOUT } from './rules.js';

/* ONE NPC, ONE ERRAND shell (battery B3). Rules are pure (rules.js, gated
 * headlessly); this file is presentation, performance, and persistence.
 * The caretaker acts every dialogue line through the Performer — the same
 * throw-on-unimplemented boundary as the Mira VRM renderer. */

const SAVE_KEY = 'b3-errand-v1';

const canvas = document.querySelector('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
if (!shadowTintActive()) console.error('[errand] shadow tint OFF');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 70);
cornerLights(scene);
const { colliders, string } = buildCorner(scene);
const pipeline = new Pipeline(renderer, scene, camera, {
  ink: { color: PAL.ink, fadeStart: 24, fadeEnd: 60, skyDepth: 70 },
  grade: { shadowTint: PAL.gradeShadow, lightTint: PAL.gradeLight },
});

// ---- quest state (restored before any visuals sync) -----------------------
let saved = null;
try { saved = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { /* fresh */ }
const feel = new Feel({ scene, camera, sfx: null });
// rules emit plain {x,z} positions; VFX wants world Vector3s (juicebox trap)
const fxAdapter = {
  emit: (e, d) => feel.emit(e, d?.pos ? { ...d, pos: new THREE.Vector3(d.pos.x, 1.1, d.pos.z) } : d),
};
const run = ErrandRun.restore(saved?.run, fxAdapter);
// the save is the SHELL's payload: quest snapshot + where the player stood
const save = () => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 1, run: run.serialize(),
      player: [hero.position.x, hero.position.y, hero.position.z], yaw: hero.camYaw,
    }));
  } catch { /* private mode */ }
};

// ---- the string: dark until relit -----------------------------------------
const lanternGlows = [];
string.traverse((o) => { if (o.isMesh && /^string-lantern-\d+$/.test(o.name)) lanternGlows.push(o); });
const glowMats = lanternGlows.map((o) => o.material);
const darkMat = cel({ color: '#463d4a', cache: false });
function syncString() {
  lanternGlows.forEach((o, i) => { o.material = run.lit ? glowMats[i] : darkMat; });
}
syncString();

// ---- candles ---------------------------------------------------------------
const candleProps = new Map();
{
  const wax = cel({ color: '#f2ead8', cache: false });
  for (const c of LAYOUT.candles) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.24, 8), wax);
    body.position.y = 0.12;
    body.castShadow = true;
    const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 1), new THREE.MeshBasicMaterial({ color: '#ffd9a0' }));
    flame.position.y = 0.32;
    g.add(body, flame);
    g.position.set(c.x, 0, c.z);
    g.userData.flame = flame;
    scene.add(g);
    candleProps.set(c.id, g);
  }
}
function syncCandles() {
  for (const [id, g] of candleProps) g.visible = run.stage === 'find' && !run.candles.has(id);
}
syncCandles();

// ---- the caretaker ---------------------------------------------------------
const actor = await Actor.spawn('ronin', { walkSpeed: 1.4 });
actor.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
actor.root.position.set(LAYOUT.npc.x, 0, LAYOUT.npc.z);
actor.root.rotation.y = -0.55;
actor.heading = -0.55;
scene.add(actor.root);
celify(actor.root, cel, {
  accentGuard: BRIDGE.accentGuard,
  worldSatCap: BRIDGE.worldSatCap,
  ownedAccent: BRIDGE.ownedAccent,
});
const performer = new Performer(actor);

// ---- walking camera --------------------------------------------------------
// spawn faces the CARETAKER (forward = (-sin yaw, -cos yaw); the old
// pi+0.35 opened on empty street — review r1: "the opening frame contains
// no game"). occluderRoot arms the camera pullback from the gates track.
const hero = new Hero({
  actor: null, camera, canvas, colliders,
  groundAt: () => 0,
  spawn: [2.3, 0, 4.5],
  yaw: 0.15,
  occluderRoot: scene,
});
if (Array.isArray(saved?.player)) {
  hero.position.set(...saved.player);
  if (typeof saved.yaw === 'number') hero.camYaw = saved.yaw;
}

// ---- HUD -------------------------------------------------------------------
const el = (id) => document.querySelector(id);
const tracker = el('#trackline'), trackerObj = document.querySelector('#tracker .obj');
const dlg = el('#dlg'), dlgText = el('#dlgtext'), prompt = el('#prompt'), promptVerb = el('#promptverb');
let typing = { text: '', shown: 0, t: 0 };
function showLine(text) { typing = { text, shown: 0, t: 0 }; dlg.classList.add('open'); }
function closeDlg() { dlg.classList.remove('open'); }
function syncTracker() {
  const [obj, line] = {
    meet: ['Evening at the café', 'Someone by the door looks troubled.'],
    find: ['The errand', `Find the fallen candles — ${run.candles.size}/3`],
    relight: ['The errand', 'Relight the lantern string.'],
    return: ['The errand', 'Return to the caretaker.'],
    done: ['Evening at the café', 'The corner glows again.'],
  }[run.stage];
  trackerObj.textContent = obj;
  tracker.textContent = line;
}
syncTracker();

// ---- feel table (every ERRAND_EVENTS type wired or check-feel fails) -------
// no setState('talk'): the ronin has no talk clip, and a silent no-op call
// is exactly what the feel lint mistook for wiring (review r1) — the
// Performer carries the acting over idle
feel.wire('dialogue-open', { sfx: 'ui-click', sfxOpts: { vol: 0.35, rate: 1.1 } });
feel.wire('dialogue-line', {
  sfx: 'ui-click', sfxOpts: { vol: 0.22, rate: 1.35 },
  call: (d) => { showLine(d.line.text); performer.direct(d.line.plan); },
});
feel.wire('dialogue-close', {
  sfx: 'ui-click', sfxOpts: { vol: 0.3, rate: 0.8 },
  call: () => { closeDlg(); performer.direct({ gesture: { name: 'none' }, posture: 'neutral' }); save(); syncTracker(); syncCandles(); },
});
feel.wire('quest-accept', { sfx: 'pickup-gem', sfxOpts: { vol: 0.7, rate: 1.2 }, text: () => 'errand accepted' });
feel.wire('candle-pickup', {
  sfx: 'pickup-gem', sfxOpts: (d) => ({ vol: 0.7, rate: 1 + d.count * 0.12 }),
  burst: { count: 10, color: '#ffd9a0', color2: '#fff', speed: 1.8, up: 2.0, ttl: 0.4 },
  call: (d) => { candleProps.get(d.id).visible = false; save(); syncTracker(); },
  text: (d) => `${d.count}/3`,
});
feel.wire('string-dark', { sfx: 'ui-deny', sfxOpts: { vol: 0.35 }, text: (d) => `needs ${d.missing} more candle${d.missing > 1 ? 's' : ''}` });
feel.wire('string-glow', { sfx: 'ui-click', sfxOpts: { vol: 0.3, rate: 1.6 }, text: () => 'the string glows' });
// the payoff must be WATCHABLE from the interaction spot (review r1): the
// glows live overhead with offsets baked into geometry, so burst at each
// lantern's real world center and flash a warm practical
scene.updateMatrixWorld(true);
const glowCenters = lanternGlows.map((o) => {
  if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
  return o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld);
});
const litFlash = new THREE.PointLight('#ffd9a0', 0, 14, 1.6);
litFlash.position.set(LAYOUT.string.x, 3.4, LAYOUT.string.z);
scene.add(litFlash);
feel.wire('lanterns-lit', {
  sfx: 'victory', sfxOpts: { vol: 0.55 },
  call: () => {
    syncString(); save(); syncTracker();
    litFlash.intensity = 26;
    // a rising column from eye level leads the READ up to the lanterns —
    // the payoff must be watchable from where the player is standing
    for (let i = 0; i < 4; i++) {
      feel.vfx.burst(new THREE.Vector3(LAYOUT.string.x, 1.0 + i * 0.9, LAYOUT.string.z), { count: 8, color: '#ffd9a0', color2: '#fff6d8', speed: 0.7, up: 2.2, ttl: 0.9 });
    }
    for (const c of glowCenters) feel.vfx.burst(c, { count: 12, color: '#ffd9a0', color2: '#fff6d8', speed: 1.6, up: 0.6, ttl: 0.8 });
  },
});
feel.wire('quest-complete', { sfx: 'victory', sfxOpts: { vol: 0.7, rate: 1.15 }, call: () => { save(); syncTracker(); } });
window.__feelCheck = () => feel.check(ERRAND_EVENTS);

// ---- audio -----------------------------------------------------------------
let music = null, sfxPlayer = null, audioLoading = false;
async function unlockAudio() {
  if (sfxPlayer || audioLoading) return;
  audioLoading = true;
  try {
    music = new AdaptiveMusic();
    await music.ctx.resume();
    sfxPlayer = new SfxPlayer(music.ctx);
    await sfxPlayer.load(SFX);
    feel.sfx = sfxPlayer;
    await music.load(LOOP);
    music.start();
    music.setIntensity(0.2);
  } catch (e) { console.error('[errand] audio failed:', e); }
}
addEventListener('pointerdown', unlockAudio);
addEventListener('keydown', unlockAudio);

// ---- input -----------------------------------------------------------------
addEventListener('keydown', (e) => {
  if (e.code !== 'KeyE' || e.repeat) return;
  if (run.dialogue && typing.shown < typing.text.length) { typing.shown = typing.text.length; return; }
  run.interact(hero.position.x, hero.position.z);
});

// ---- loop ------------------------------------------------------------------
const clock = new THREE.Clock();
const npcPos = new THREE.Vector3(LAYOUT.npc.x, 0, LAYOUT.npc.z);
// sim() advances everything but the walking camera — the evidence hooks call
// it directly so captures don't depend on rAF cadence (throttled rAF in a
// backgrounded pane froze the typewriter/gestures in the first capture run)
function sim(dt) {
  actor.update(dt);
  // face the player when close; head-track while talking or near
  const toPlayer = hero.position.clone().sub(npcPos);
  const near = Math.hypot(toPlayer.x, toPlayer.z) < 5;
  if (run.dialogue || near) {
    const target = Math.atan2(toPlayer.x, toPlayer.z);
    let d = ((target - actor.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    actor.heading += THREE.MathUtils.clamp(d, -1, 1) * Math.min(1, dt * 3.5);
    actor.root.rotation.y = actor.heading;
    performer.lookAt(new THREE.Vector3(hero.position.x, 1.55, hero.position.z));
  } else performer.lookAt(null);
  performer.update(dt);
  // candle flames flicker; relight flash decays
  for (const g of candleProps.values()) if (g.visible) g.userData.flame.scale.setScalar(1 + Math.sin(performance.now() * 0.02 + g.position.x) * 0.18);
  if (litFlash.intensity > 0.05) litFlash.intensity *= Math.pow(0.015, dt);
  else litFlash.intensity = 0;
  // typewriter
  if (run.dialogue) {
    typing.t += dt;
    const target = Math.min(typing.text.length, Math.floor(typing.t * 42));
    if (target > typing.shown) { typing.shown = target; dlgText.textContent = typing.text.slice(0, typing.shown); }
    else dlgText.textContent = typing.text.slice(0, typing.shown);
  }
  // interaction prompt
  const aff = run.dialogue ? null : run.affordanceAt(hero.position.x, hero.position.z);
  prompt.style.opacity = aff ? '1' : '0';
  if (aff) promptVerb.textContent = { npc: 'Talk', candle: 'Pick up', string: run.stage === 'relight' ? 'Relight' : 'Look' }[aff.type];
  feel.update(dt);
}
function tick(dt) {
  hero.update(dt);
  sim(dt);
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

// ---- gates + evidence ------------------------------------------------------
window.__errand = {
  run, feel, performer, hero, save, sim,
  candlesVisible: () => [...candleProps.entries()].filter(([, g]) => g.visible).map(([id]) => id),
  stringLit: () => lanternGlows.every((o) => o.material !== darkMat),
  reset() { localStorage.removeItem(SAVE_KEY); location.reload(); },
};
// Canvas-only debug capture through the PLAY camera. NOT bundle evidence:
// review evidence is REAL compositor frames (page.screenshot via the
// browser harness) — the hand-drawn HUD composite this used to do was an
// undeclared approximation (review r1) and is retired.
window.__shot = async (name, opts = {}) => {
  for (let i = 0; i < (opts.steps ?? 2); i++) sim(1 / 60);
  pipeline.render();
  const res = await fetch('/__shot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, data: renderer.domElement.toDataURL('image/jpeg', 0.92) }) });
  return res.json();
};
