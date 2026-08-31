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
const run = ErrandRun.restore(saved, fxAdapter);
const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(run.serialize())); } catch { /* private mode */ } };

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
  accentGuard: [['lantern-amber', 36 / 360, 0.04, 0.62], ['blossom-pink', 330 / 360, 0.04, 0.62]],
});
const performer = new Performer(actor);

// ---- walking camera --------------------------------------------------------
const hero = new Hero({
  actor: null, camera, canvas, colliders,
  groundAt: () => 0,
  spawn: [2.5, 0, 6],
  yaw: Math.PI + 0.35,
});

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
feel.wire('dialogue-open', { sfx: 'ui-click', sfxOpts: { vol: 0.35, rate: 1.1 }, call: () => actor.setState('talk') });
feel.wire('dialogue-line', {
  sfx: 'ui-click', sfxOpts: { vol: 0.22, rate: 1.35 },
  call: (d) => { showLine(d.line.text); performer.direct(d.line.plan); },
});
feel.wire('dialogue-close', {
  sfx: 'ui-click', sfxOpts: { vol: 0.3, rate: 0.8 },
  call: () => { closeDlg(); actor.setState('idle'); performer.direct({ gesture: { name: 'none' }, posture: 'neutral' }); save(); syncTracker(); syncCandles(); },
});
feel.wire('quest-accept', { sfx: 'pickup-gem', sfxOpts: { vol: 0.7, rate: 1.2 }, text: () => 'errand accepted' });
feel.wire('candle-pickup', {
  sfx: 'pickup-gem', sfxOpts: (d) => ({ vol: 0.7, rate: 1 + d.count * 0.12 }),
  burst: { count: 10, color: '#ffd9a0', color2: '#fff', speed: 1.8, up: 2.0, ttl: 0.4 },
  call: (d) => { candleProps.get(d.id).visible = false; save(); syncTracker(); },
  text: (d) => `${d.count}/3`,
});
feel.wire('string-dark', { sfx: 'ui-deny', sfxOpts: { vol: 0.35 }, text: (d) => `needs ${d.missing} more candle${d.missing > 1 ? 's' : ''}` });
feel.wire('lanterns-lit', {
  sfx: 'victory', sfxOpts: { vol: 0.55 },
  burst: { count: 26, color: '#ffd9a0', color2: '#fff6d8', speed: 2.6, up: 2.4, ttl: 0.7 },
  call: () => { syncString(); save(); syncTracker(); },
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
  // candle flames flicker
  for (const g of candleProps.values()) if (g.visible) g.userData.flame.scale.setScalar(1 + Math.sin(performance.now() * 0.02 + g.position.x) * 0.18);
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
  reset() { localStorage.removeItem(SAVE_KEY); location.reload(); },
};
window.__shot = async (name, opts = {}) => {
  for (let i = 0; i < (opts.steps ?? 2); i++) sim(1 / 60);
  if (opts.pos) { camera.position.fromArray(opts.pos); camera.lookAt(new THREE.Vector3().fromArray(opts.lookAt ?? [0, 1, -3])); }
  pipeline.render();
  const frame = renderer.domElement.toDataURL('image/jpeg', 0.92);
  // composite the DOM HUD onto the frame — review evidence must include UI
  const c = document.createElement('canvas');
  c.width = renderer.domElement.width; c.height = renderer.domElement.height;
  const ctx = c.getContext('2d');
  await new Promise((ok) => { const img = new Image(); img.onload = () => { ctx.drawImage(img, 0, 0); ok(); }; img.src = frame; });
  ctx.font = '600 15px ui-rounded, system-ui';
  ctx.fillStyle = 'rgba(20,16,34,0.72)';
  ctx.fillRect(c.width - 280, 12, 268, 44);
  ctx.fillStyle = '#ffd9a0'; ctx.textAlign = 'right';
  ctx.fillText(trackerObj.textContent.toUpperCase(), c.width - 24, 30);
  ctx.fillStyle = '#f2ecdf';
  ctx.fillText(tracker.textContent, c.width - 24, 48);
  if (dlg.classList.contains('open')) {
    const w = Math.min(620, c.width * 0.86), x = (c.width - w) / 2, y = c.height - 120;
    ctx.fillStyle = 'rgba(22,17,36,0.92)'; ctx.fillRect(x, y, w, 92);
    ctx.fillStyle = '#ffd9a0'; ctx.fillRect(x, y, 3, 92);
    ctx.textAlign = 'left';
    ctx.fillText('CARETAKER', x + 20, y + 24);
    ctx.fillStyle = '#f2ecdf';
    ctx.fillText(dlgText.textContent.slice(0, 70), x + 20, y + 48);
    if (dlgText.textContent.length > 70) ctx.fillText(dlgText.textContent.slice(70), x + 20, y + 68);
  }
  const res = await fetch('/__shot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, data: c.toDataURL('image/jpeg', 0.92) }) });
  return res.json();
};
