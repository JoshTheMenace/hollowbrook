import * as THREE from 'three';
import { JuiceRun, JUICE_EVENTS, COURT, RUN_SECONDS, DASH, ONI, SIM_DT, greedyBot, makeNoisy, EXPERT } from './rules.js';
import { toonMaterial, facetBall, facet } from '@forge/lib/parts.js';
import { Feel } from '@forge/engine/feel.js';
import { FixedStep, InputTape } from '@forge/engine/fixedstep.js';
import { AdaptiveMusic, SfxPlayer } from '@forge/soundforge/runtime.js';
import { SFX } from '@forge/soundforge/content/sfx-core.js';
import { LOOP } from '@forge/soundforge/content/loop-nightbloom.js';
import { wireJuice, LADDER_STEPS, LADDER_PAIRS } from './feel-table.js';

/* JUICE BOX shell — the B1 micro-game. Rules are pure (rules.js, gated
 * headlessly); this file is presentation + feel.
 *
 * A7: the simulation runs on SIM_DT through a FixedStep accumulator; the
 * render interpolates. Inputs are stamped with the sim tick they land on
 * and can be recorded to / replayed from a tape — the same tape at any
 * frame rate produces byte-identical state (review r2: realised dash was
 * 2.13 m at 30 fps and 3.20 at 60; "same seed, same puzzle" was false). */

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
    const glow = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 1), new THREE.MeshBasicMaterial({ color: '#8a6a4a' }));
    glow.position.set(sx * (COURT.x1 + 0.4), 1.72, sz * (COURT.z1 + 0.4));
    scene.add(glow);
  }
}

// the box (player)
const boxMat = toonMaterial('#f0e6d2', { rim: 0.7, rimColor: '#ffffff' }).clone();
const BOX_BASE = boxMat.color.clone();
const box = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), boxMat);
box.position.y = 0.31;
box.renderOrder = 5;
scene.add(box);
const ringMat = new THREE.MeshBasicMaterial({ color: '#9adfff', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 32, 1, 0, Math.PI * 2), ringMat);
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.04;
ring.renderOrder = 6;    // the stun/recovery ring is always on top — never hidden by the oni that stunned you
scene.add(ring);
const trailMat = new THREE.MeshBasicMaterial({ color: '#9adfff', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
const trail = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5), trailMat);
trail.rotation.x = -Math.PI / 2;
trail.position.y = 0.06;
scene.add(trail);

// spirits + onis
const spiritMat = toonMaterial('#a8e8ff', { rim: 1.0, rimColor: '#ffffff' });
const goldRingMat = new THREE.MeshBasicMaterial({ color: '#ffd04a', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
const oniMat = toonMaterial('#c0506a', { rim: 0.8, rimColor: '#ff9ab0' });
const telegraphMat = new THREE.MeshBasicMaterial({ color: '#ff6a7a', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
const spiritVisuals = new Map();
const oniVisuals = [];

// ---- feel ----------------------------------------------------------------
const feel = new Feel({ scene, camera, sfx: null });
const el = (id) => document.querySelector(id);
const comboEl = el('#combo'), breakEl = el('#breakflash'), vignetteEl = el('#vignette'), clockEl = el('#clock');
let finalPulse = false, whiffFizzle = 0;
wireJuice(feel, {
  breakFlash: () => { breakEl.style.opacity = '0.55'; setTimeout(() => { breakEl.style.opacity = '0'; }, 240); },
  // the fade's read: the combo label steps down visibly
  comboStep: () => { comboEl.style.transform = 'scale(0.7)'; comboEl.style.color = '#cfc4e8'; setTimeout(() => { comboEl.style.color = '#ffd76a'; }, 260); },
  whiff: () => { whiffFizzle = 0.35; },
  telegraph: () => {},
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
  } catch (e) { console.error('[juicebox] audio failed:', e); }
}
addEventListener('pointerdown', unlockAudio);
addEventListener('keydown', unlockAudio);

// ---- run lifecycle --------------------------------------------------------
let seed = Number(new Date().toISOString().slice(0, 10).replaceAll('-', '')) % 100000; // the daily
let run = null, step = null, tape = null, replayTape = null;
let started = false, autoplay = null;
const pending = [];            // live inputs waiting for their tick: {tick, dx, dz}
const prev = { box: new THREE.Vector3(), spirits: new Map(), onis: [] };   // last-tick state for interpolation
const overlay = el('#overlay');
const scoreEl = el('#score');
const bestEl = el('#best');
el('#seedlabel').textContent = seed;
const BEST_KEY = 'juicebox-best-v3';
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

function snapshotPrev() {
  prev.box.set(run.pos.x, 0, run.pos.z);
  prev.spirits.clear();
  for (const sp of run.spirits) prev.spirits.set(sp, { x: sp.x, z: sp.z });
  prev.onis = run.onis.map((o) => ({ x: o.x, z: o.z }));
}

// ONE sim tick: apply the inputs stamped for this tick (live queue, or the
// replay tape), let a bot decide (stamped too), then Run.update(SIM_DT).
// Gate instrumentation lives HERE, on exact ticks — a checkpoint taken "at
// the first frame past tick N" lands on a different tick at every frame
// rate and diverges by construction.
const probe = { every: 0, checkpoints: [], dashes: [], dashStart: null };
function onTick(tick) {
  if (!run || run.over) return;
  snapshotPrev();
  const wasDashing = run.dashing(), x0 = run.pos.x, z0 = run.pos.z;   // BEFORE inputs: a dash starts on this tick
  const inputs = replayTape ? replayTape.at(tick) : pending.filter((p) => p.tick <= tick);
  if (!replayTape) for (let i = pending.length - 1; i >= 0; i--) if (pending[i].tick <= tick) pending.splice(i, 1);
  for (const inp of inputs) { if (run.dash(inp.dx, inp.dz)) { squash(); tape?.record(tick, inp); } }
  if (autoplay && !replayTape) {
    const realDash = run.dash.bind(run);
    run.dash = (dx, dz) => { const ok = realDash(dx, dz); if (ok) { squash(); tape?.record(tick, { dx, dz }); } return ok; };
    autoplay(run);
    run.dash = realDash;
  }
  run.update(SIM_DT);
  if (probe.every) {
    if (!wasDashing && run.dashing()) probe.dashStart = { x: x0, z: z0 };
    if (probe.dashStart && !run.dashing()) { probe.dashes.push(Math.hypot(run.pos.x - probe.dashStart.x, run.pos.z - probe.dashStart.z)); probe.dashStart = null; }
    if ((tick + 1) % probe.every === 0) probe.checkpoints.push({ tick: tick + 1, hash: stateHash() });
  }
}

function startRun({ record = false, replay = null, seedOverride = null } = {}) {
  for (const [, v] of spiritVisuals) scene.remove(v);
  spiritVisuals.clear();
  if (seedOverride != null) seed = seedOverride;
  run = new JuiceRun({ seed, fx: fxAdapter() });
  pending.length = 0;
  tape = record ? new InputTape() : null;
  replayTape = replay;
  step = new FixedStep({ dt: SIM_DT, onTick });
  snapshotPrev();
  while (oniVisuals.length < run.onis.length) {
    const o = facetBall(ONI.r, oniMat, [1, 1.1, 1], [6, 5]);
    const spike = facet(new THREE.ConeGeometry(0.1, 0.3, 4), oniMat);
    spike.position.y = 0.65;
    o.add(spike);
    const tele = new THREE.Mesh(new THREE.RingGeometry(ONI.r * 0.8, ONI.threat, 40), telegraphMat.clone());
    tele.rotation.x = -Math.PI / 2;
    tele.position.y = -0.44;
    o.add(tele);
    o.userData.tele = tele;
    o.renderOrder = 1;   // behind the player: being hit never hides you
    scene.add(o);
    oniVisuals.push(o);
  }
  started = true;
  finalPulse = false;
  vignetteEl.style.opacity = '0';
  clockEl.classList.remove('final');
  rimMat.color.copy(RIM_BASE);
  overlay.style.display = 'none';
  el('#seedlabel').textContent = seed;
  music?.setIntensity(0.55, 1.5);
}

function endRun(d) {
  started = false;
  overlay.style.display = 'flex';
  el('#result').style.display = 'block';
  el('#finalscore').textContent = d.score;
  const prevBest = best();
  const delta = el('#finaldelta');
  if (d.score > prevBest) {
    try { localStorage.setItem(BEST_KEY, String(d.score)); } catch { /* private mode */ }
    delta.textContent = prevBest ? `new best  +${d.score - prevBest}` : 'first run — that is the bar';
    delta.className = 'delta up';
  } else {
    delta.textContent = `best ${prevBest}  (${d.score - prevBest})`;
    delta.className = 'delta down';
  }
  showBest();
  el('#finalstats').textContent = `best combo ×${d.bestCombo} · ${d.pops} pops · seed ${run.seed}`;   // the seed the run USED
  el('#startline').textContent = 'press any direction to go again';
  vignetteEl.style.opacity = '0';
  clockEl.classList.remove('final');
  finalPulse = false;
  rimMat.color.copy(RIM_BASE);
  music?.setIntensity(0.3, 2);
}

// ---- input: the one verb, stamped with the sim tick it lands on -------------
const held = new Set();
function dirFromKeys() {
  let x = 0, z = 0;
  if (held.has('KeyW') || held.has('ArrowUp')) z -= 1;
  if (held.has('KeyS') || held.has('ArrowDown')) z += 1;
  if (held.has('KeyA') || held.has('ArrowLeft')) x -= 1;
  if (held.has('KeyD') || held.has('ArrowRight')) x += 1;
  return { x, z };
}
const queueDash = (dx, dz) => { if (step) pending.push({ tick: step.tick, dx, dz }); };
addEventListener('keydown', (e) => {
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    held.add(e.code);
    if (!started && !e.repeat) { startRun(); return; }
    if (!e.repeat && run && !run.over) { const d = dirFromKeys(); if (d.x || d.z) queueDash(d.x, d.z); }
    e.preventDefault();
  }
  if (!started && e.code === 'BracketLeft') { seed = (seed + 99999) % 100000; el('#seedlabel').textContent = seed; }
  if (!started && e.code === 'BracketRight') { seed = (seed + 1) % 100000; el('#seedlabel').textContent = seed; }
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
  if (hit) queueDash(hit.x - run.pos.x, hit.z - run.pos.z);
});
function squash() { box.scale.set(1.35, 0.6, 1.35); }

// ---- loop: fixed sim step, interpolated render ----------------------------------
const clock = new THREE.Clock();
function frame(rawDt) {
  // hit-stop dilates sim TIME (fewer ticks per frame); the ticks themselves never change size
  const simDt = rawDt * feel.hitstop.scale(rawDt);
  if (run && started) step.advance(simDt);
  const a = step ? step.alpha : 0;
  if (run && started) {
    const lerp = (p, c) => p + (c - p) * a;
    box.position.set(lerp(prev.box.x, run.pos.x), 0.31, lerp(prev.box.z, run.pos.z));
    box.scale.lerp(new THREE.Vector3(1, 1, 1), 1 - Math.exp(-10 * rawDt));
    const dashing = run.dashing();
    trailMat.opacity += ((dashing ? 0.5 : 0) - trailMat.opacity) * (1 - Math.exp(-14 * rawDt));
    if (whiffFizzle > 0) { whiffFizzle -= rawDt; trailMat.opacity = Math.max(trailMat.opacity, 0.5 * (whiffFizzle / 0.35)); trailMat.color.set('#6a7a98'); }
    else trailMat.color.set('#9adfff');
    trail.position.set(box.position.x - run.dashDir.x * 0.9, 0.06, box.position.z - run.dashDir.z * 0.9);
    trail.rotation.z = -Math.atan2(run.dashDir.z, run.dashDir.x);
    trail.scale.set(2.4, 1, 1);
    ring.position.set(box.position.x, 0.04, box.position.z);
    const stunned = run.stunned();
    const frac = stunned ? 1 : Math.min(1, 1 - (run.dashReadyAt - run.time) / DASH.recover);
    ring.geometry.dispose();
    ring.geometry = new THREE.RingGeometry(0.5, 0.62, 32, 1, 0, Math.max(0.01, frac) * Math.PI * 2);
    ringMat.color.set(stunned ? '#ff5a6e' : frac >= 1 ? '#9adfff' : '#5a7a98');
    ringMat.opacity = stunned ? 0.95 : frac >= 1 ? 0.35 : 0.85;
    boxMat.depthTest = !stunned;        // stunned: drawn through the oni that got you
    const live = new Set();
    for (const sp of run.spirits) {
      let v = spiritVisuals.get(sp);
      if (!v) {
        v = facetBall(0.32, sp.gold ? new THREE.MeshBasicMaterial({ color: '#ffe36a', transparent: true }) : spiritMat, [1, 1.15, 1], [6, 5]);
        if (sp.gold) {
          const halo = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.62, 28), goldRingMat);
          halo.rotation.x = -Math.PI / 2;
          v.add(halo);
          v.userData.halo = halo;
        }
        scene.add(v);
        spiritVisuals.set(sp, v);
      }
      live.add(sp);
      const p = prev.spirits.get(sp) ?? sp;
      const left = sp.dieAt - run.time;
      v.position.set(lerp(p.x, sp.x), 0.5 + Math.sin(run.time * 3 + sp.x) * 0.08, lerp(p.z, sp.z));
      if (sp.gold) {
        // gold blinks by OPACITY, never by size (r2: the blink shrank it to decor-lantern size for the deciding second)
        v.material.opacity = left < 1 ? (Math.sin(run.time * 18) > 0 ? 1 : 0.45) : 1;
        v.scale.setScalar(1.25);
        v.userData.halo.position.y = -0.46 / 1.25;
        v.userData.halo.rotation.z = run.time * 1.5;
      } else {
        // the fade's read: the last 0.5 s shrinks and dims (the stake is visible before it lands)
        const s = left < 0.5 ? 0.45 + left : 1;
        v.scale.setScalar(s);
      }
    }
    for (const [sp, v] of spiritVisuals) if (!live.has(sp)) { scene.remove(v); spiritVisuals.delete(sp); }
    run.onis.forEach((o, i) => {
      const v = oniVisuals[i];
      const p = prev.onis[i] ?? o;
      v.position.set(lerp(p.x, o.x), 0.5, lerp(p.z, o.z));
      const winding = o.windupAt >= 0;
      v.rotation.y = winding ? v.rotation.y : run.time * 2.4;
      const q = winding ? (run.time - o.windupAt) / ONI.telegraph : 0;
      v.scale.setScalar(winding ? 1 + q * 0.35 : 1);
      v.userData.tele.position.y = -0.44 / v.scale.x;
      v.userData.tele.material.opacity = winding ? 0.3 + q * 0.5 : 0;
      v.userData.tele.scale.setScalar(winding ? (1.3 - q * 0.3) / (1 + q * 0.35) : 1);
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
  feel.update(simDt, rawDt);
  // shake translates the WHOLE frame: the look target moves with the camera
  // (re-aiming at a fixed point cancelled the shake — r2 measured 0.03 px)
  const sx = feel.shake.offset.x * 3, sy = feel.shake.offset.y * 3;
  camera.position.set(sx, 14.5 + sy, 7.8);
  camera.lookAt(sx, sy, -0.4);
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
let paused = false;   // gates drive frames explicitly
requestAnimationFrame(function loop() { if (!paused) frame(Math.min(clock.getDelta(), 0.05)); requestAnimationFrame(loop); });

// ---- gates ----------------------------------------------------------------
// the state a replay must reproduce byte-for-byte
const stateHash = () => JSON.stringify({
  t: +run.time.toFixed(6), tick: step.tick, score: run.score, combo: run.combo, pops: run.pops, fades: run.fades, stuns: run.stuns,
  pos: [+run.pos.x.toFixed(6), +run.pos.z.toFixed(6)],
  spirits: run.spirits.map((s) => [+s.x.toFixed(5), +s.z.toFixed(5), s.gold ? 1 : 0]),
});
window.__tick = frame;
window.__game = { get run() { return run; }, get step() { return step; }, get tape() { return tape; }, startRun, feel, get music() { return music; }, camera, seedSet: (s) => { seed = s; }, stateHash, pause: (p) => { paused = p; } };
window.__autoplay = (on) => { autoplay = on ? makeNoisy(greedyBot, EXPERT) : null; };
// Drive the shell at an explicit render cadence. rawDts: array of frame
// durations (e.g. 1/30 repeated, or jittered). Returns checkpoints
// {tick, hash} every `everyTicks` sim ticks and every realised dash length.
window.__drive = (rawDts, { everyTicks = 600 } = {}) => {
  probe.every = everyTicks; probe.checkpoints = []; probe.dashes = []; probe.dashStart = null;
  for (const dt of rawDts) {
    if (!run || run.over) break;
    frame(dt);
  }
  const out = { checkpoints: probe.checkpoints, dashes: probe.dashes, ticks: step.tick, over: run.over, score: run.score, dropped: step.dropped };
  probe.every = 0;
  return out;
};
window.__latencyCheck = () => {
  paused = true;
  startRun({ seedOverride: 7 });
  for (let i = 0; i < 40; i++) frame(1 / 60);
  const before = { ...run.pos };
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
  let frames = -1;
  for (let i = 0; i < 20; i++) {
    frame(1 / 60);
    if (frames < 0 && (run.pos.x !== before.x || run.pos.z !== before.z)) frames = i + 1;
  }
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }));
  paused = false;
  return { framesToMove: frames, msAt60fps: +(frames * 1000 / 60).toFixed(1), pass: frames >= 1 && frames <= 2 };
};
window.__playCheck = (seconds = 30) => {
  paused = true;
  startRun({ seedOverride: 7 });
  autoplay = makeNoisy(greedyBot, EXPERT);
  const frustum = new THREE.Frustum();
  const mat = new THREE.Matrix4();
  const pt = new THREE.Vector3();
  const samples = [];
  for (let i = 0; i < seconds * 60 && !run.over; i++) {
    frame(1 / 60);
    camera.updateMatrixWorld();
    mat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(mat);
    let vis = 0;
    for (const sp of run.spirits) if (frustum.containsPoint(pt.set(sp.x, 0.5, sp.z))) vis++;
    if (run.spirits.length) samples.push(vis / run.spirits.length);
  }
  autoplay = null; paused = false;
  const mean = samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length);
  return { frames: samples.length, visibleFrac: +mean.toFixed(4), pass: mean >= 0.999 };
};
// Rendered-space feedback: fire a COMPOSITE moment (what the game actually
// fires) at a fixed court point and measure what the play camera shows —
// screen shake in px, hit-stop frames, particle pixels ≥ 3 px, text.
window.__renderedMoment = (kind) => {
  paused = true;
  if (!run || run.over) startRun({ seedOverride: 7 });
  const pos = { x: 0, z: 0 };
  for (let i = 0; i < 30; i++) frame(1 / 60);         // settle
  const W = renderer.domElement.width, H = renderer.domElement.height;
  const grab = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(renderer.domElement, 0, 0); return x.getImageData(0, 0, W, H).data; };
  const base = grab();
  const fx = run.fx;
  const events = {
    single: () => fx.pop({ pos, combo: 1, score: 10, gold: false, value: 10, nth: 1 }),
    double: () => { fx.pop({ pos, combo: 1, score: 10, gold: false, value: 10, nth: 1 }); fx.pop({ pos, combo: 2, score: 50, gold: false, value: 40, nth: 2 }); fx['multi-pop']({ pos, count: 2, value: 40 }); },
    gold: () => fx.pop({ pos, combo: 2, score: 60, gold: true, value: 60, nth: 1 }),
    triple: () => { fx.pop({ pos, combo: 1, score: 10, gold: false, value: 10, nth: 1 }); fx.pop({ pos, combo: 2, score: 50, gold: false, value: 40, nth: 2 }); fx['multi-pop']({ pos, count: 2, value: 40 }); fx.pop({ pos, combo: 3, score: 140, gold: false, value: 90, nth: 3 }); fx['multi-pop']({ pos, count: 3, value: 90 }); },
    hit: () => fx['oni-hit']({ pos }),
    whiff: () => fx.whiff({ pos }),
  };
  const proj = (v) => { const p = new THREE.Vector3(v.x, 0.5, v.z).project(camera); return [(p.x * 0.5 + 0.5) * W, (-p.y * 0.5 + 0.5) * H]; };
  const origin = proj(pos);
  let shakePx = 0, hitstopFrames = 0, particlePx = 0, textSeen = false;
  events[kind]();
  for (let i = 0; i < 40; i++) {
    const scale = feel.hitstop.scale(0);   // peek without advancing: scale(0) adds 0 time
    if (scale < 1) hitstopFrames++;
    frame(1 / 60);
    const o = proj(pos);
    shakePx = Math.max(shakePx, Math.hypot(o[0] - origin[0], o[1] - origin[1]));
    if (feel.vfx.texts.length) textSeen = true;
    if (i === 2 || i === 6) {
      const now = grab();
      let changed = 0;
      for (let p = 0; p < W * H; p++) { const k = p * 4; if (Math.abs(now[k] - base[k]) + Math.abs(now[k + 1] - base[k + 1]) + Math.abs(now[k + 2] - base[k + 2]) > 60) changed++; }
      particlePx = Math.max(particlePx, changed);
    }
  }
  paused = false;
  return { kind, shakePx: +shakePx.toFixed(2), hitstopFrames, particlePx, textSeen };
};
