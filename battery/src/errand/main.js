import * as THREE from 'three';
import { Pipeline } from '@town/core/post.js';
import { cel, shadowTintActive } from '@town/core/toon.js';
import { PAL } from '@town/palette.js';
import { Hero } from '@town/game/hero.js';
import { DayNight } from '@town/game/daynight.js';
import { Actor } from '@forge/game/actor.js';
import { Performer } from '@forge/game/performer.js';
import { celify } from '@forge/lib/celify.js';
import { Feel } from '@forge/engine/feel.js';
import { AdaptiveMusic, SfxPlayer } from '@forge/soundforge/runtime.js';
import { SFX } from '@forge/soundforge/content/sfx-core.js';
import { LOOP } from '@forge/soundforge/content/loop-nightbloom.js';
import { buildCorner, cornerLights } from '../shared/corner.js';
import { CELIFY_OPTS } from '../shared/bridge.js';
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
const { sun, fill, hemi } = cornerLights(scene);
const corner = buildCorner(scene);
const { colliders, string } = corner;
const pipeline = new Pipeline(renderer, scene, camera, {
  ink: { color: PAL.ink, fadeStart: 24, fadeEnd: 60, skyDepth: 70 },
  grade: { shadowTint: PAL.gradeShadow, lightTint: PAL.gradeLight },
});
// camera occluders are world geometry only (B4 lesson: the whole scene
// includes bodies the probe should not hit)
const occluders = new THREE.Group();
occluders.add(corner.shop, corner.toro, corner.rack);
scene.add(occluders);

// ---- quest state (restored before any visuals sync) -----------------------
let saved = null;
try { saved = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { /* fresh */ }
const feel = new Feel({ scene, camera, sfx: null });
// rules emit plain {x,z} positions; VFX wants world Vector3s at the
// event's OWN height (r2: every burst was hard-coded to y=1.1)
const EVENT_Y = { 'candle-pickup': 0.35, 'quest-accept': 1.5, 'quest-complete': 1.5, 'string-dark': 3.4, 'string-glow': 3.6, 'lanterns-lit': 3.6 };
const fxAdapter = {
  emit: (e, d) => feel.emit(e, d?.pos ? { ...d, pos: new THREE.Vector3(d.pos.x, EVENT_Y[e] ?? 1.1, d.pos.z) } : d),
};
const run = ErrandRun.restore(saved?.run, fxAdapter);
// the save is the SHELL's payload: quest snapshot + where the player stood.
// Saved continuously while walking (r2: six quest-event saves = a 5.6 m
// teleport on F5).
const save = () => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 1, run: run.serialize(),
      player: [hero.position.x, hero.position.y, hero.position.z], yaw: hero.camYaw,
    }));
  } catch { /* private mode */ }
};
// the shell payload is validated like the quest payload: a corrupt player
// array yields the spawn, never a bricked run (r2)
const validPlayer = (p) => Array.isArray(p) && p.length === 3 && p.every((n) => Number.isFinite(n) && Math.abs(n) < 60);

// ---- the string: dark until relit -----------------------------------------
const lanternGlows = [];
string.traverse((o) => { if (o.isMesh && /^string-lantern-\d+$/.test(o.name)) lanternGlows.push(o); });
const glowMats = lanternGlows.map((o) => o.material);
const darkMat = cel({ color: '#463d4a', cache: false });
function syncString() {
  lanternGlows.forEach((o, i) => {
    o.material = run.lit ? glowMats[i] : darkMat;
    // a dark lantern is not a practical: the night pool must not glow
    // under a string the story says is out
    if (run.lit) o.userData.practical = o.userData._prac ?? o.userData.practical;
    else { o.userData._prac = o.userData._prac ?? o.userData.practical; delete o.userData.practical; }
  });
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
celify(actor.root, cel, CELIFY_OPTS);
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
  occluderRoot: occluders,
});
if (validPlayer(saved?.player)) {
  hero.position.set(...saved.player);
  if (Number.isFinite(saved.yaw)) hero.camYaw = saved.yaw;
}
// the premise is evening: dusk light, honest practicals (a dark string
// casts none), the corner's own lanterns carrying the street
const daynight = new DayNight({ scene, sun, fill, hemi, pipeline, root: scene });
scene.updateMatrixWorld(true);
daynight.collectPracticals(scene);
daynight.set('dusk');

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
  // acting paced to the line: the pose outlives the typewriter (42 cps)
  call: (d) => { showLine(d.line.text); performer.direct(d.line.plan, { minDuration: (d.line.text.length / 42) * 0.9 }); },
});
feel.wire('dialogue-close', {
  sfx: 'ui-click', sfxOpts: { vol: 0.3, rate: 0.8 },
  call: () => { closeDlg(); performer.direct({ gesture: { name: 'none' }, posture: 'neutral' }); save(); syncTracker(); syncCandles(); },
});
feel.wire('quest-accept', {
  sfx: 'pickup-gem', sfxOpts: { vol: 0.7, rate: 1.2 }, text: () => 'errand accepted',
  // the candles arrive under a puff instead of popping in (r2)
  call: () => { for (const c of LAYOUT.candles) feel.vfx.burst(new THREE.Vector3(c.x, 0.3, c.z), { count: 9, color: '#f2ecdf', color2: '#cfc4e8', speed: 0.8, up: 0.9, ttl: 0.6, size: 0.07 }); },
});
feel.wire('candle-pickup', {
  sfx: 'pickup-gem', sfxOpts: (d) => ({ vol: 0.7, rate: 1 + d.count * 0.12 }),
  burst: { count: 10, color: '#ffd9a0', color2: '#fff', speed: 1.8, up: 2.0, ttl: 0.4 },
  call: (d) => { candleProps.get(d.id).visible = false; save(); syncTracker(); },
  text: (d) => `${d.count}/3`,
});
// a look is a look, not a refusal (r2: Look on the string answered ui-deny)
feel.wire('string-dark', { sfx: 'ui-click', sfxOpts: { vol: 0.25, rate: 0.7 }, text: (d) => `still dark — ${d.missing} more candle${d.missing > 1 ? 's' : ''}` });
feel.wire('string-glow', { sfx: 'ui-click', sfxOpts: { vol: 0.3, rate: 1.6 }, text: () => 'the string glows' });
// the payoff must be WATCHABLE from the interaction spot (review r1): the
// glows live overhead with offsets baked into geometry, so burst at each
// lantern's real world center and flash a warm practical
scene.updateMatrixWorld(true);
const glowCenters = lanternGlows.map((o) => {
  if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
  return o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld);
});
// the string's own glow: a persistent low practical once lit (r2: a 150 ms
// flash that was gone before the eye got there), a flash on top at the moment
const STRING_GLOW = 7;
const litFlash = new THREE.PointLight('#ffd9a0', run.lit ? STRING_GLOW : 0, 14, 1.6);
litFlash.position.set(LAYOUT.string.x, 3.4, LAYOUT.string.z);
scene.add(litFlash);
// the payoff is STAGED for where the player stands (r2: from the
// interaction spot the lanterns sat 35-48% above the top of the frame):
// the camera swings to the string's centroid and holds 1.5 s
const stringCentroid = new THREE.Vector3();
let camHold = null;   // { until, yaw, pitch, restoreYaw, restorePitch }
function stageOnString() {
  const p = hero.position;
  const dx = stringCentroid.x - p.x, dz = stringCentroid.z - p.z, dy = stringCentroid.y - 1.6;
  camHold = {
    until: performance.now() + 1500,
    yaw: Math.atan2(-dx, -dz),                       // forward = (-sin yaw, -cos yaw)
    pitch: Math.atan2(dy, Math.hypot(dx, dz)) + 0.22,
    restoreYaw: hero.camYaw, restorePitch: hero.camPitch,
  };
  hero.orbitDist = 2.4;        // dolly in: the string fills the frame during the hold
  hero.enabled = false;
}
feel.wire('lanterns-lit', {
  sfx: 'victory', sfxOpts: { vol: 0.55 },
  text: () => 'the string wakes',
  call: () => {
    syncString(); daynight.collectPracticals(scene); save(); syncTracker();
    litFlash.intensity = 26;
    stageOnString();
    for (let i = 0; i < 4; i++) {
      feel.vfx.burst(new THREE.Vector3(LAYOUT.string.x, 1.0 + i * 0.9, LAYOUT.string.z), { count: 8, color: '#ffd9a0', color2: '#fff6d8', speed: 0.7, up: 2.2, ttl: 0.9 });
    }
    for (const c of glowCenters) feel.vfx.burst(c, { count: 12, color: '#ffd9a0', color2: '#fff6d8', speed: 1.6, up: 0.6, ttl: 0.8 });
  },
});
for (const c of glowCenters) stringCentroid.add(c);
stringCentroid.multiplyScalar(1 / Math.max(1, glowCenters.length));
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
const lastSaved = { pos: hero.position.clone(), t: 0, moving: false };
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
  // candle flames flicker; the relight flash decays onto the string's steady glow
  for (const g of candleProps.values()) if (g.visible) g.userData.flame.scale.setScalar(1 + Math.sin(performance.now() * 0.02 + g.position.x) * 0.18);
  const floor = run.lit ? STRING_GLOW : 0;
  if (litFlash.intensity > floor + 0.05) litFlash.intensity = floor + (litFlash.intensity - floor) * Math.pow(0.05, dt);
  else litFlash.intensity = floor;
  // the staged hold: camera on the string, then hand control back
  if (camHold) {
    hero.camYaw += ((((camHold.yaw - hero.camYaw) + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 6);
    hero.camPitch += (camHold.pitch - hero.camPitch) * Math.min(1, dt * 6);
    if (performance.now() > camHold.until) { hero.camPitch = camHold.restorePitch; hero.orbitDist = 4.4; hero.enabled = true; camHold = null; }
  }
  // continuous position save: every 0.5 s while moving, and on the move→idle edge
  const moved = hero.position.distanceToSquared(lastSaved.pos) > 0.0025;
  const now = performance.now();
  if ((moved && now - lastSaved.t > 500) || (!moved && lastSaved.moving)) { save(); lastSaved.pos.copy(hero.position); lastSaved.t = now; }
  lastSaved.moving = moved;
  daynight.update(dt, hero.position);
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
  run, feel, performer, hero, save, sim, daynight,
  candlesVisible: () => [...candleProps.entries()].filter(([, g]) => g.visible).map(([id]) => id),
  stringLit: () => lanternGlows.every((o) => o.material !== darkMat),
  get holding() { return !!camHold; },
  reset() { localStorage.removeItem(SAVE_KEY); location.reload(); },
};
// ID-pass share of the frame covered by the lantern GLOW meshes, through the
// play camera as it stands right now — the frame-asserting gate reads this
// alongside its own screenshot (r2: a state flag proved the code ran; only
// pixels prove the player saw it)
window.__lanternPixelShare = () => {
  const W = renderer.domElement.width, H = renderer.domElement.height;
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  const black = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });
  const own = new Set(lanternGlows);
  const restore = [];
  scene.traverse((o) => {
    if (o.isMesh) { restore.push([o, o.material]); o.material = own.has(o) ? white : black; }
    else if ((o.isPoints || o.isLine) && o.visible) { restore.push([o, null]); o.visible = false; }
  });
  const keepBg = scene.background, keepFog = scene.fog;
  scene.background = null; scene.fog = null;
  const rt = new THREE.WebGLRenderTarget(W, H);
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  const buf = new Uint8Array(W * H * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
  renderer.setRenderTarget(null);
  rt.dispose();
  scene.background = keepBg; scene.fog = keepFog;
  for (const [o, m] of restore) { if (m === null) o.visible = true; else o.material = m; }
  let n = 0;
  for (let p = 0; p < W * H; p++) if (buf[p * 4] > 128) n++;
  return n / (W * H);
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
