import * as THREE from 'three';
import { JuiceRun, JUICE_EVENTS, COURT, RUN_SECONDS, DASH, ONI, greedyBot, makeNoisy, EXPERT } from './rules.js';
import { toonMaterial, facetBall, facet } from '@forge/lib/parts.js';
import { Feel } from '@forge/engine/feel.js';
import { AdaptiveMusic, SfxPlayer } from '@forge/soundforge/runtime.js';
import { SFX } from '@forge/soundforge/content/sfx-core.js';
import { LOOP } from '@forge/soundforge/content/loop-nightbloom.js';
import { wireJuice, LADDER_STEPS, LADDER_PAIRS } from './feel-table.js';

/* JUICE BOX shell — the B1 micro-game. Rules are pure (rules.js, gated
 * headlessly); this file is presentation + feel. The feel table lives in
 * feel-table.js so the ladder gate wires the SAME table it judges. */

const canvas = document.querySelector('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#191430');
scene.fog = new THREE.Fog('#191430', 24, 44);
const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 80);
camera.position.set(0, 14.5, 7.8);
camera.lookAt(0, 0, -0.4);

scene.add(new THREE.HemisphereLight('#8a86c8', '#3a3050', 1.2));
const key = new THREE.DirectionalLight('#cfd4ff', 1.6);
key.position.set(-6, 12, 6);
scene.add(key);

// the court: glowing plate + rim + corner lanterns
const rimMat = new THREE.MeshBasicMaterial({ color: '#171226' });
const RIM_BASE = rimMat.color.clone();
{
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(COURT.x1 - COURT.x0 + 1, COURT.z1 - COURT.z0 + 1), toonMaterial('#2c2547', { rim: 0.3, rimColor: '#6a5a9a' }));
  plate.rotation.x = -Math.PI / 2;
  scene.add(plate);
  const band = new THREE.Mesh(new THREE.PlaneGeometry(COURT.x1 - COURT.x0 + 1.6, COURT.z1 - COURT.z0 + 1.6), rimMat);
  band.rotation.x = -Math.PI / 2;
  band.position.y = -0.02;
  scene.add(band);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const post = facet(new THREE.CylinderGeometry(0.07, 0.09, 1.6, 5), toonMaterial('#3c3358', { rim: 0.3 }));
    post.position.set(sx * (COURT.x1 + 0.4), 0.8, sz * (COURT.z1 + 0.4));
    scene.add(post);
    // decor lanterns stay DIM: gold must be the brightest thing on the court
    const glow = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 1), new THREE.MeshBasicMaterial({ color: '#8a6a4a' }));
    glow.position.set(sx * (COURT.x1 + 0.4), 1.72, sz * (COURT.z1 + 0.4));
    scene.add(glow);
  }
}

// the box (player): chunky cel cube, squashes on dash
// UNIQUE material for the box: it gets tinted on stun, and tinting a cached
// shared toonMaterial would tint everything with the same key (TRAPS.md)
const boxMat = toonMaterial('#f0e6d2', { rim: 0.7, rimColor: '#ffffff' }).clone();
const BOX_BASE = boxMat.color.clone();
const box = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), boxMat);
box.position.y = 0.31;
scene.add(box);
// the recovery ring: the 0.45s cooldown made visible (fills as it recharges;
// red while stunned) — review r1: inputs were swallowed with no read
const ringMat = new THREE.MeshBasicMaterial({ color: '#9adfff', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 32, 1, 0, Math.PI * 2), ringMat);
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.04;
scene.add(ring);
const trail = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5), new THREE.MeshBasicMaterial({ color: '#9adfff', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
trail.rotation.x = -Math.PI / 2;
trail.position.y = 0.06;
scene.add(trail);

// spirits + onis
const spiritMat = toonMaterial('#a8e8ff', { rim: 1.0, rimColor: '#ffffff' });
const goldMat = new THREE.MeshBasicMaterial({ color: '#ffe36a' });   // unlit: reads as light, not paint
const goldRingMat = new THREE.MeshBasicMaterial({ color: '#ffd04a', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
const oniMat = toonMaterial('#c0506a', { rim: 0.8, rimColor: '#ff9ab0' });
const telegraphMat = new THREE.MeshBasicMaterial({ color: '#ff6a7a', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
const spiritVisuals = new Map();
const oniVisuals = [];

// ---- feel ----------------------------------------------------------------
const feel = new Feel({ scene, camera, sfx: null });
const el = (id) => document.querySelector(id);
const comboEl = el('#combo'), breakEl = el('#breakflash'), vignetteEl = el('#vignette'), clockEl = el('#clock');
let finalPulse = false;
wireJuice(feel, {
  breakFlash: () => { breakEl.style.opacity = '0.55'; setTimeout(() => { breakEl.style.opacity = '0'; }, 240); },
  telegraph: (i) => { const v = oniVisuals[i]; if (v) v.userData.telegraphAt = performance.now(); },
  final10: () => { finalPulse = true; vignetteEl.style.opacity = '1'; clockEl.classList.add('final'); },
});
window.__feelCheck = () => feel.check(JUICE_EVENTS);
window.__feelLadder = () => feel.checkLadder(LADDER_STEPS, LADDER_PAIRS);

// ---- audio ----------------------------------------------------------------
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
    music.setIntensity(0.3);
    console.log('[juicebox] audio unlocked');
  } catch (e) { console.error('[juicebox] audio failed:', e); }
}
addEventListener('pointerdown', unlockAudio);
addEventListener('keydown', unlockAudio);

// ---- run lifecycle --------------------------------------------------------
let seed = Number(new Date().toISOString().slice(0, 10).replaceAll('-', '')) % 100000; // the daily
let run = null;
let started = false;
const overlay = el('#overlay');
const scoreEl = el('#score');
const bestEl = el('#best');
el('#seedlabel').textContent = seed;
const BEST_KEY = 'juicebox-best-v2';
const best = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; } };
const showBest = () => { const b = best(); bestEl.textContent = b ? `BEST ${b}` : ''; };
showBest();

function fxAdapter() {
  const at = (p) => new THREE.Vector3(p.x, 0.5, p.z);
  const wrap = {};
  for (const ev of JUICE_EVENTS) {
    wrap[ev] = (d = {}) => feel.emit(ev, { ...d, pos: d.pos ? at(d.pos) : undefined });
  }
  const base = wrap.timeup;
  wrap.timeup = (d) => { base(d); endRun(d); };
  const fin = wrap['final-10s'];
  wrap['final-10s'] = (d) => { fin(d); music?.setIntensity(0.95, 2); };
  return wrap;
}

function startRun() {
  for (const [, v] of spiritVisuals) scene.remove(v);
  spiritVisuals.clear();
  run = new JuiceRun({ seed, fx: fxAdapter() });
  while (oniVisuals.length < run.onis.length) {
    const o = facetBall(ONI.r, oniMat, [1, 1.1, 1], [6, 5]);
    const spike = facet(new THREE.ConeGeometry(0.1, 0.3, 4), oniMat);
    spike.position.y = 0.65;
    o.add(spike);
    // the telegraph: a wide bite-radius disc that brightens through the
    // wind-up so the bite is READ before it lands (an 8cm ring at 14m was
    // ~2px — invisible in the first capture)
    const tele = new THREE.Mesh(new THREE.RingGeometry(ONI.r * 0.8, ONI.threat, 40), telegraphMat.clone());
    tele.rotation.x = -Math.PI / 2;
    tele.position.y = -0.44;
    o.add(tele);
    o.userData.tele = tele;
    scene.add(o);
    oniVisuals.push(o);
  }
  started = true;
  finalPulse = false;
  vignetteEl.style.opacity = '0';
  clockEl.classList.remove('final');
  rimMat.color.copy(RIM_BASE);
  overlay.style.display = 'none';
  music?.setIntensity(0.55, 1.5);
}

function endRun(d) {
  started = false;
  overlay.style.display = 'flex';
  el('#result').style.display = 'block';
  el('#finalscore').textContent = d.score;
  const prev = best();
  const delta = el('#finaldelta');
  if (d.score > prev) {
    try { localStorage.setItem(BEST_KEY, String(d.score)); } catch { /* private mode */ }
    delta.textContent = prev ? `new best  +${d.score - prev}` : 'first run — that is the bar';
    delta.className = 'delta up';
  } else {
    delta.textContent = `best ${prev}  (${d.score - prev})`;
    delta.className = 'delta down';
  }
  showBest();
  el('#finalstats').textContent = `best combo ×${d.bestCombo} · ${d.pops} pops · seed ${seed}`;
  el('#startline').textContent = 'press any direction to go again';
  vignetteEl.style.opacity = '0';
  clockEl.classList.remove('final');
  finalPulse = false;
  rimMat.color.copy(RIM_BASE);
  music?.setIntensity(0.3, 2);
}

// ---- input: the one verb --------------------------------------------------
const held = new Set();
function dirFromKeys() {
  let x = 0, z = 0;
  if (held.has('KeyW') || held.has('ArrowUp')) z -= 1;
  if (held.has('KeyS') || held.has('ArrowDown')) z += 1;
  if (held.has('KeyA') || held.has('ArrowLeft')) x -= 1;
  if (held.has('KeyD') || held.has('ArrowRight')) x += 1;
  return { x, z };
}
addEventListener('keydown', (e) => {
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    held.add(e.code);
    if (!started && !e.repeat) { startRun(); return; }
    if (!e.repeat && run && !run.over) {
      const d = dirFromKeys();
      if (run.dash(d.x, d.z)) squash();
    }
    e.preventDefault();
  }
  if (e.code === 'BracketLeft') { seed = (seed + 99999) % 100000; el('#seedlabel').textContent = seed; }
  if (e.code === 'BracketRight') { seed = (seed + 1) % 100000; el('#seedlabel').textContent = seed; }
});
addEventListener('keyup', (e) => held.delete(e.code));
const ray = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
canvas.addEventListener('pointerdown', (e) => {
  if (!started) { startRun(); return; }
  if (!run || run.over) return;
  ray.setFromCamera({ x: (e.clientX / innerWidth) * 2 - 1, y: -(e.clientY / innerHeight) * 2 + 1 }, camera);
  const hit = new THREE.Vector3();
  ray.ray.intersectPlane(groundPlane, hit);
  if (hit && run.dash(hit.x - run.pos.x, hit.z - run.pos.z)) squash();
});
function squash() {
  box.scale.set(1.35, 0.6, 1.35);
}

// ---- loop -----------------------------------------------------------------
const clock = new THREE.Clock();
let autoplay = null;   // evidence capture: a bot plays through the REAL loop at rAF cadence
function tick(rawDt) {
  const dt = rawDt * feel.hitstop.scale(rawDt);
  if (run && started) {
    if (autoplay) autoplay(run);
    run.update(dt);
    // sync visuals
    box.position.set(run.pos.x, 0.31, run.pos.z);
    box.scale.lerp(new THREE.Vector3(1, 1, 1), 1 - Math.exp(-10 * dt));
    const dashing = run.dashing();
    trail.material.opacity += ((dashing ? 0.5 : 0) - trail.material.opacity) * (1 - Math.exp(-14 * dt));
    trail.position.set(run.pos.x - run.dashDir.x * 0.9, 0.06, run.pos.z - run.dashDir.z * 0.9);
    trail.rotation.z = -Math.atan2(run.dashDir.z, run.dashDir.x);
    trail.scale.set(2.4, 1, 1);
    // recovery ring: arc fills over DASH.recover; solid red while stunned
    ring.position.set(run.pos.x, 0.04, run.pos.z);
    const stunned = run.stunned();
    const frac = stunned ? 1 : Math.min(1, 1 - (run.dashReadyAt - run.time) / DASH.recover);
    ring.geometry.dispose();
    ring.geometry = new THREE.RingGeometry(0.5, 0.62, 32, 1, 0, Math.max(0.01, frac) * Math.PI * 2);
    ringMat.color.set(stunned ? '#ff5a6e' : frac >= 1 ? '#9adfff' : '#5a7a98');
    ringMat.opacity = stunned ? 0.95 : frac >= 1 ? 0.35 : 0.85;
    const live = new Set();
    for (const sp of run.spirits) {
      let v = spiritVisuals.get(sp);
      if (!v) {
        v = facetBall(0.32, sp.gold ? goldMat : spiritMat, [1, 1.15, 1], [6, 5]);
        if (sp.gold) {
          const halo = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.62, 28), goldRingMat);
          halo.rotation.x = -Math.PI / 2;
          halo.position.y = -0.46;
          v.add(halo);
          v.userData.halo = halo;
        }
        scene.add(v);
        spiritVisuals.set(sp, v);
      }
      live.add(sp);
      const left = sp.dieAt - run.time;
      const blink = left < 1 ? (Math.sin(run.time * 18) > 0 ? 1 : 0.35) : 1;
      v.position.set(sp.x, 0.5 + Math.sin(run.time * 3 + sp.x) * 0.08, sp.z);
      v.scale.setScalar(blink * (sp.gold ? 1.25 : 1));
      if (v.userData.halo) {
        // child offset is scaled by the parent — keep the halo on the court
        v.userData.halo.position.y = -0.46 / v.scale.x;
        v.userData.halo.rotation.z = run.time * 1.5;
      }
    }
    for (const [sp, v] of spiritVisuals) if (!live.has(sp)) { scene.remove(v); spiritVisuals.delete(sp); }
    run.onis.forEach((o, i) => {
      const v = oniVisuals[i];
      v.position.set(o.x, 0.5, o.z);
      const winding = o.windupAt >= 0;
      v.rotation.y = winding ? v.rotation.y : run.time * 2.4;
      const p = winding ? (run.time - o.windupAt) / ONI.telegraph : 0;
      v.scale.setScalar(winding ? 1 + p * 0.35 : 1);
      v.userData.tele.position.y = -0.44 / v.scale.x;   // stays on the court while the oni swells
      v.userData.tele.material.opacity = winding ? 0.3 + p * 0.5 : 0;
      v.userData.tele.scale.setScalar(winding ? (1.3 - p * 0.3) / (1 + p * 0.35) : 1);   // disc shrinks to the bite radius as the parent swells
    });
    if (stunned) boxMat.color.setRGB(1, 0.42, 0.42);
    else boxMat.color.copy(BOX_BASE);
    scoreEl.textContent = run.score;
    comboEl.textContent = run.combo > 1 ? `combo ×${run.combo}` : '';
    comboEl.style.transform = `scale(${1 + Math.min(0.5, run.combo * 0.03)})`;
    clockEl.textContent = Math.max(0, Math.ceil(RUN_SECONDS - run.time));
    if (finalPulse) rimMat.color.copy(RIM_BASE).lerp(new THREE.Color('#ff4a3a'), 0.5 + 0.5 * Math.sin(run.time * 9));
    if (music && Math.floor(run.time * 2) % 4 === 0) music.setIntensity(0.45 + Math.min(0.45, run.combo * 0.04));
  }
  feel.update(dt, rawDt);
  camera.position.set(feel.shake.offset.x, 14.5 + feel.shake.offset.y, 7.8);
  camera.lookAt(0, 0, -0.4);
  renderer.render(scene, camera);
}
function resize() {
  const w = innerWidth || 1280, h = innerHeight || 720;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
requestAnimationFrame(function loop() { tick(Math.min(clock.getDelta(), 0.05)); requestAnimationFrame(loop); });

// ---- gates ----------------------------------------------------------------
window.__tick = tick;
window.__game = { get run() { return run; }, startRun, feel, get music() { return music; }, camera, seedSet: (s) => { seed = s; } };
window.__autoplay = (on) => { autoplay = on ? makeNoisy(greedyBot, EXPERT) : null; };
window.__latencyCheck = () => {
  if (!run || run.over) { seed = 7; startRun(); }
  for (let i = 0; i < 40; i++) tick(1 / 60);
  const before = { ...run.pos };
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
  let frames = -1;
  for (let i = 0; i < 20; i++) {
    tick(1 / 60);
    if (frames < 0 && (run.pos.x !== before.x || run.pos.z !== before.z)) frames = i + 1;
  }
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }));
  return { framesToMove: frames, msAt60fps: +(frames * 1000 / 60).toFixed(1), pass: frames >= 1 && frames <= 2 };
};
window.__playCheck = (seconds = 30) => {
  if (!run || run.over) { seed = 7; startRun(); }
  const bot = makeNoisy(greedyBot, EXPERT);
  const frustum = new THREE.Frustum();
  const mat = new THREE.Matrix4();
  const pt = new THREE.Vector3();
  const samples = [];
  for (let i = 0; i < seconds * 60 && !run.over; i++) {
    bot(run);
    tick(1 / 60);
    camera.updateMatrixWorld();
    mat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(mat);
    let vis = 0;
    for (const sp of run.spirits) if (frustum.containsPoint(pt.set(sp.x, 0.5, sp.z))) vis++;
    if (run.spirits.length) samples.push(vis / run.spirits.length);
  }
  const mean = samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length);
  return { frames: samples.length, visibleFrac: +mean.toFixed(4), pass: mean >= 0.999 };
};
