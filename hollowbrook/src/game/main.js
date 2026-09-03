/* ------------------------------------------------------------------ *
 * THE SHELL — Hollowbrook, first person.
 *
 * Presentation, persistence and the loop; the rules are pure (rules.js)
 * and tick-fixed, the stepper's accumulator decides how many ticks a
 * render frame is worth (stepper.js).  Order per frame:
 *   frame dt -> hitstop scale -> stepper.frame(dt) (N ticks, each sampling
 *   the FPS controller's input) -> camera from the interpolated tick state
 *   -> views (enemies, cast, weapons) -> feel/VFX -> HUD -> pipeline.render()
 *
 * Saves are written by THIS file, at 'wave-start' and 'objective-done',
 * through save.js — the persistence gate drives this page and reads the
 * localStorage it wrote.  Instruments live under window.__game and are
 * dev-only; a bypass (jump to a wave, complete an objective, die) is a
 * flag on the instrument, never on the game.
 * ------------------------------------------------------------------ */
import * as THREE from 'three';
import { buildVignette } from '../scene.js';
import { sunPosition, fillPosition, shadowRadius, fogRange, cameraFar } from '../core/sunrig.js';
import { PAL } from '../palette.js';
import { Pipeline } from '../core/post.js';
import { cel, flat, shadowTintActive } from '../core/toon.js';
import { setOutlineResolution } from '../core/outline.js';
import { skyTexture } from '../textures.js';
import { Feel } from '@forge/engine/feel.js';
import { initAudio, audioAdapter, dawn as audioDawn, disposeAudio, EVENTS as SFX_EVENTS, ALIASES as SFX_ALIASES } from '../audio/index.js';
import '../style.css';
import './hud.css';
import { CONTRACT as C } from './data.js';
import { GAME_EVENTS } from './events.js';
import { FEEL } from './feeltable.js';
import { SiegeRun, TICK } from './rules.js';
import { Stepper, idle } from './stepper.js';
import { buildWorld } from './world.js';
import { FirstPerson } from './fps.js';
import { createWeaponsView } from './weapons.js';
import { createHUD } from './hud.js';
import { createLegibility } from './legible.js';
import { intensityOf, intentFor, measuredPressure } from './music.js';
import { readSave, writeSave, clearSave } from './save.js';
import { makeBot, EXPERT } from './bots.js';
import { checkLadder } from './ladder.js';

const params = new URLSearchParams(location.search);
const canvas = document.querySelector('#view');
const hudRoot = document.querySelector('#hud');
const dlgRoot = document.querySelector('#dialogue');

/* ---- renderer / scene / light: the town viewer's rig, verbatim ---- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setClearColor(new THREE.Color(PAL.fog), 1);
renderer.info.autoReset = false;          // the pipeline is four renders; count them all
if (!shadowTintActive()) console.error('[game] cel shadow tint is OFF');
const hex = (v) => '#' + v.toString(16).padStart(6, '0');
const scene = new THREE.Scene();
scene.background = skyTexture(hex(PAL.sky.top), hex(PAL.sky.mid), hex(PAL.sky.haze));
scene.fog = new THREE.Fog(PAL.fog, 26, 100);
const camera = new THREE.PerspectiveCamera(52, 1, 0.08, 110);
camera.rotation.order = 'YXZ';
scene.add(camera);
const RIG = {
  sun: { color: PAL.sun, intensity: 2.0, position: [-14, 19, 13], shadows: 22 },
  fill: { color: PAL.fill, intensity: 0.9, position: [12, 8, -11] },
  bounce: { color: PAL.bounce, intensity: 0.3, position: [3, -5, 12] },
  hemi: { sky: PAL.hemiSky, ground: PAL.hemiGround, intensity: 1.0 },
};
const sun = new THREE.DirectionalLight(RIG.sun.color, RIG.sun.intensity);
sun.position.fromArray(RIG.sun.position);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -RIG.sun.shadows, right: RIG.sun.shadows, top: RIG.sun.shadows, bottom: -RIG.sun.shadows, near: 1, far: 80 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.035;
scene.add(sun, sun.target);
const fillL = new THREE.DirectionalLight(RIG.fill.color, RIG.fill.intensity); fillL.position.fromArray(RIG.fill.position); scene.add(fillL, fillL.target);
const bounce = new THREE.DirectionalLight(RIG.bounce.color, RIG.bounce.intensity); bounce.position.fromArray(RIG.bounce.position); scene.add(bounce, bounce.target);
scene.add(new THREE.HemisphereLight(RIG.hemi.sky, RIG.hemi.ground, RIG.hemi.intensity));

/* ---- the town, the scratch dressing, the world ---- */
const vignette = buildVignette(scene);
const plan = vignette.plan;
if (plan?.city?.compass) {
  const spec = plan.city;
  sun.position.fromArray(sunPosition(spec));
  fillL.position.fromArray(fillPosition(spec));
  camera.far = Math.max(camera.far, cameraFar(spec, plan.vista_cameras ?? []));
  camera.updateProjectionMatrix();
  const fogr = fogRange(spec.footprint_m, camera.far);
  scene.fog.near = fogr.near; scene.fog.far = fogr.far;
  const r = shadowRadius(spec.footprint_m);
  Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, far: Math.max(160, r * 4) });
  sun.shadow.camera.updateProjectionMatrix();
}
const world = buildWorld(vignette, plan, { scene });
const pipeline = new Pipeline(renderer, scene, camera, {
  ink: { color: PAL.ink, fadeStart: 30, fadeEnd: 80, skyDepth: 105 },
  grade: { shadowTint: PAL.gradeShadow, lightTint: PAL.gradeLight },
});

/* ---- feel: charforge's bus over the DATA table ---- */
const feel = new Feel({ scene, camera, sfx: null });
const V3 = (p) => (p ? new THREE.Vector3(p.x, p.y ?? 1.0, p.z) : undefined);
for (const [name, fx] of Object.entries(FEEL)) feel.wire(name, { ...fx, throttleMs: name === 'bolt-fired' || name === 'bolt-miss' ? 0 : undefined });
const hud = createHUD(hudRoot);
let dialogueUI = null;
let cast = null;
let enemyView = null;
let weapons = null;

/* ---- the run: restore through the shell's own save path ---- */
let run = null;
let fps = null;
let stepper = null;
let audio = null;                                   // audioAdapter() once initAudio resolves
let bot = null;                                     // an instrument's input, if any
const listener = () => [run.player.x, run.player.y + C.player.eye, run.player.z];
const shellSfx = {
  play(name, opts) { if (!audio) return; audio.sfx.play(name, { rate: opts?.rate, pos: opts?.pos ? [opts.pos.x, opts.pos.y, opts.pos.z] : undefined, listener: listener(), yaw: run.player.yaw }); },
  // the bank's own name list answers even before a gesture unlocks audio
  buffers: { has: (n) => SFX_EVENTS.includes(n) || n in SFX_ALIASES },
};
feel.sfx = shellSfx;
// charforge's Shake renders trauma SQUARED; the contract's ladder weighs shake
// linearly, so a table value s is added as sqrt(s) and the screen moves in
// proportion to the rung (the rendered-space ladder gate holds this)
const shakeAdd = feel.shake.add.bind(feel.shake);
feel.shake.add = (a) => shakeAdd(Math.sqrt(Math.max(0, a)));

const fx = {
  emit(name, data = {}, r = run) {
    const d = data.pos ? { ...data, pos: V3(data.pos) } : data;
    if (d.pos && name === 'bolt-fired') d.pos = V3(data.end ?? data.pos);   // the burst lands where the bolt did
    feel.emit(name, d);
    onEvent(name, data, r);
  },
};

function makeRun(snap) {
  const r = snap ? SiegeRun.restore(snap, world, { fx, seed: 1 }) : new SiegeRun(world, { fx, seed: 1 });
  return r;
}

function onEvent(name, data, r = run) {
  switch (name) {
    case 'wave-start':
      writeSave(r.serialize('wave-start'));
      hud.banner(`wave ${data.index + 1}`, r.wave.name, 2.6);
      fps?.snap();
      break;
    case 'objective-done':
      writeSave(r.checkpoint ?? r.serialize('breather-done'));
      break;
    case 'bolt-hit': case 'lance-hit': hud.hit('hit'); break;
    case 'kill-cutpurse': case 'kill-reaver': case 'kill-shieldbearer': case 'kill-hexer': case 'kill-captain': hud.hit('kill'); break;
    case 'player-hurt': hud.hurt(data.damage ?? 12); break;
    case 'light-lost': setTownLight(data.lights); break;
    case 'barricade-up': actNear(data.point, (u) => u.raise?.()); break;
    case 'brazier-lit': actNear(data.point, (u) => u.setLit?.(true)); break;
    case 'bell-rung': audioDawn?.(); break;
    case 'dialogue-open': dialogueUI?.open(data.name); break;
    case 'dialogue-line': dialogueUI?.line(data.line.text); break;
    case 'dialogue-close': dialogueUI?.close(); break;
    default: break;
  }
  if (name === 'bolt-fired' || name === 'lance-fired') weapons?.onEvent(name, data);
}

function setTownLight(lightsLeft) {
  // lights are indexed 0..2; losing one darkens the highest index still lit
  scene.traverse((o) => { if (o.userData?.townLight !== undefined && o.userData.townLight >= lightsLeft) o.userData.setLit?.(false); });
}
function actNear([x, z], fn) {
  scene.traverse((o) => {
    const u = o.userData;
    if (!u || (!u.raise && !u.setLit) || u.townLight !== undefined) return;
    const p = new THREE.Vector3(); o.getWorldPosition(p);
    if (Math.hypot(p.x - x, p.z - z) <= 3) fn(u);
  });
}

/* ---- boot the run and the views ---- */
async function boot() {
  const saved = readSave();
  run = makeRun(saved);
  fps = new FirstPerson({ camera, canvas, run });
  fps.shake = feel.shake;
  stepper = new Stepper(run, { input: () => (bot ? bot() : fps.input()), onTick: () => fps.afterTick() });
  weapons = createWeaponsView({ scene, camera, cel, flat });
  setTownLight(run.lights);
  try {
    const { createEnemyView } = await import('./enemies.js');
    enemyView = await createEnemyView({ scene, cel, world });
  } catch (e) { console.error('[game] enemy view failed to load:', e); }
  try {
    const { createDialogueUI } = await import('./dialogue.js');
    dialogueUI = createDialogueUI(dlgRoot);
    const { createCast } = await import('./cast.js');
    cast = await createCast({ scene, cel, world, run });
  } catch (e) { console.error('[game] cast failed to load:', e); }
  // the run may have spoken before the UI existed (a restore emits wave-start only)
  canvas.dataset.gameReady = 'true';
}

/* ---- audio unlock: a gesture ---- */
let audioPending = false;
async function unlockAudio() {
  if (audio || audioPending) return;
  audioPending = true;
  try {
    await initAudio({ onProgress: (f, label) => { canvas.dataset.audioProgress = `${Math.round(f * 100)} ${label ?? ''}`; } });
    audio = audioAdapter();
    audio.music.setIntensity(intensityOf(run), 0.3);
  } catch (e) { console.error('[game] audio failed:', e); }
  audioPending = false;
}
if (params.get('audio') !== 'off') {
  addEventListener('pointerdown', unlockAudio, { once: false });
  addEventListener('keydown', unlockAudio, { once: false });
}

/* ---- input plumbing that is not the controller's ---- */
canvas.addEventListener('click', () => { if (run && !run.over) fps.requestLock(); });
window.addEventListener('keydown', (e) => {
  if (!run) return;
  if ((e.code === 'Enter' || e.code === 'Space') && document.activeElement === canvas && document.pointerLockElement !== canvas) { e.preventDefault(); fps.requestLock(); }
  if (e.code === 'KeyR' && run.over) restartRun(run.phase === 'won');
});
function restartRun(fresh) {
  if (fresh) clearSave();
  location.reload();
}

/* ---- the loop ---- */
function resize() {
  const w = innerWidth || 1280; const h = innerHeight || 720;
  pipeline.setSize(w, h);
  setOutlineResolution(pipeline.size.x, pipeline.size.y);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
let musicAt = 0;
let frameCount = 0;
const frameTimes = [];
const eye = new THREE.Vector3();

/** One render frame of wall time `dt`: the accumulator decides the ticks. */
function frame(dt) {
  const scale = feel.hitstop.scale(dt);          // 0.12 during a hit-stop: fewer ticks this frame
  const ticks = stepper.frame(dt * scale);
  fps.applyCamera(stepper.alpha, dt);
  camera.updateMatrixWorld(true);
  eye.copy(camera.position);
  const vdt = dt * scale;
  enemyView?.update(vdt, run, camera);
  cast?.update(vdt, run, camera, eye);
  weapons?.update(vdt, run);
  vignette.update(vdt, camera.position);
  feel.update(vdt, dt);
  dialogueUI?.update(dt);
  hud.update(run, dt, { yaw: camera.rotation.y });
  if (audio && run.time - musicAt >= 0.25) { musicAt = run.time; audio.music.setIntensity(intensityOf(run)); }
  return ticks;
}

function loop() {
  const now = performance.now();
  const dt = Math.min(clock.getDelta(), 0.1);
  if (run) {
    frame(dt);
    renderer.info.reset();
    pipeline.render();
    frameCount += 1;
    frameTimes.push(performance.now() - now);
    if (frameTimes.length > 300) frameTimes.shift();
    if (frameCount % 60 === 0) canvas.dataset.stats = JSON.stringify({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, ms: +(frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length).toFixed(2), tick: run.tick, wave: run.waveIndex + 1, phase: run.phase, alive: run.alive, hp: run.player.hp });
  }
  requestAnimationFrame(loop);
}
await boot();
requestAnimationFrame(loop);

/* ---- instruments (dev only) ------------------------------------------ */
const legibility = createLegibility({ renderer, scene, camera });

window.__game = {
  get run() { return run; }, get stepper() { return stepper; }, get fps() { return fps; }, world, feel, hud, scene, camera, renderer, pipeline, THREE,
  get enemyView() { return enemyView; }, get cast() { return cast; }, get audio() { return audio; },
  save: () => readSave(), checkpointState: () => run.checkpointState(),
  intensity: () => ({ sent: intensityOf(run), intent: intentFor(run), measured: measuredPressure(run) }),
  ladder: () => checkLadder(),
  /** step N ticks with the REAL input path (keys the harness dispatched), rendering nothing */
  tick(n = 1) { for (let i = 0; i < n; i += 1) stepper.tickOnce(); fps.applyCamera(0, TICK); },
  /** step N ticks AND render each frame (for captures of animation) */
  frames(n = 1) { for (let i = 0; i < n; i += 1) { frame(TICK); renderer.info.reset(); pipeline.render(); } },
  drawCalls() { renderer.info.reset(); pipeline.render(); return renderer.info.render.calls; },
  feelCheck() { return feel.check(GAME_EVENTS); },
  /** the runtime ladder twin: the LIVE wired table through charforge's own checkLadder */
  feelLadder() {
    // the contract's weights over the LIVE wired table (feel.table), not the
    // data file: what the bus plays is what is judged
    const W = C.ladderWeights; const data = { count: 2, damage: 12, index: 0, name: 'w', pos: new THREE.Vector3() };
    const val = (v) => (typeof v === 'function' ? v(data) : v);
    const mag = (ev) => { const fx = feel.table.get(ev); return fx ? W.shake * (val(fx.shake) ?? 0) + W.hitstop * (val(fx.hitstop) ?? 0) + W.burst * (val(fx.burst)?.count ?? 0) + W.text * (fx.text ? 1 : 0) + W.sfx * (fx.sfx ? 1 : 0) : 0; };
    const magnitudes = Object.fromEntries(C.ladder.map(([ev]) => [ev, mag(ev)]));
    const problems = [];
    for (let i = 1; i < C.ladder.length; i += 1) { const a = C.ladder[i - 1][0]; const b = C.ladder[i][0]; if (magnitudes[b] < magnitudes[a] - 1e-9) problems.push(`inverted: ${b} ${magnitudes[b].toFixed(2)} < ${a} ${magnitudes[a].toFixed(2)}`); }
    if (magnitudes['bolt-miss'] > magnitudes['bolt-hit']) problems.push('a whiff outranks a hit');
    if (magnitudes['player-hurt'] >= magnitudes['kill-shieldbearer']) problems.push('being hit outranks a shieldbearer kill');
    for (const [ev, declared] of C.ladder) if (Math.abs(magnitudes[ev] - declared) > Math.max(0.3, declared * 0.15)) problems.push(`${ev} ${magnitudes[ev].toFixed(2)} vs declared ${declared}`);
    return { problems, magnitudes };
  },
  // INSTRUMENT BYPASSES: flags on the instrument, never on the game
  instrument: {
    /** a fresh, canonical run at wave n (1-based) with the player at a spot */
    jumpToWave(n, at = null, yaw = null) {
      run = makeRun(null);
      run.lights = C.lights;
      run.startWave(n - 1, { restore: true, at: at ? [at[0], 0, at[1]] : null });
      if (yaw !== null) run.player.yaw = yaw;
      fps.run = run; fps.snap();
      stepper.run = run;
      if (cast) { cast.dispose?.(); }
      return run;
    },
    skipWave() { run.enemies = []; run.spawned = 1e9; run._endWave('instrument'); },
    completeObjective() { const o = run.objective; if (!o || o.done) return false; if (o.kind === 'activate') o.points.forEach((p) => { p.done = true; }); if (o.kind === 'escort') { const n = run.npc(o.npc); n.x = o.def.to[0]; n.z = o.def.to[1]; } run._completeObjective(); return true; },
    die() { run.player.hp = 0; stepper.tickOnce(); },
    endBreather() { run.breatherTime = run.wave.breather; stepper.tickOnce(); },
    setBot(on) { bot = on ? makeBot(run, EXPERT, { seed: 97 }) : null; },
    clearSave, writeSave, readSave,
  },
};

if (import.meta.env.DEV) {
  const post = async (name, extra = {}) => {
    const data = renderer.domElement.toDataURL('image/jpeg', 0.92);
    const res = await fetch('/__shot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, data, ...extra }) });
    return res.json();
  };
  /** a debug capture through the PLAY camera (canvas only; the DOM HUD is
   *  written beside it as `.ui.json` — real evidence is page.screenshot) */
  window.__gshot = async (name, w = 1280, h = 720, { steps = 2 } = {}) => {
    const saved = { aspect: camera.aspect };
    pipeline.setSize(w, h); setOutlineResolution(pipeline.size.x, pipeline.size.y);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    for (let i = 0; i < steps; i += 1) frame(TICK);
    pipeline.render();
    const out = await post(name, { ui: hud.state() });
    camera.aspect = saved.aspect; camera.updateProjectionMatrix(); resize();
    return out;
  };
  window.__shot = async (name, w = 1280, h = 720, opts = {}) => {
    const saved = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov, aspect: camera.aspect };
    try {
      if (opts.pos) camera.position.fromArray(opts.pos);
      if (opts.lookAt) camera.lookAt(new THREE.Vector3().fromArray(opts.lookAt));
      if (opts.fov) camera.fov = opts.fov;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      pipeline.setSize(w, h); setOutlineResolution(pipeline.size.x, pipeline.size.y);
      pipeline.render();
      return await post(name);
    } finally {
      camera.position.copy(saved.position); camera.quaternion.copy(saved.quaternion); camera.fov = saved.fov; camera.aspect = saved.aspect;
      camera.updateProjectionMatrix(); resize();
    }
  };

  /* PLAY-CAMERA LEGIBILITY GATE.  Canonical state: a fresh seeded run, the
   * EXPERT-hand bot at the wheel (an instrument exemption), two segments —
   * wave 1 from the spawn (spawn -> first sight lives here) and wave 4 from
   * the market rim (crosses the Captain at 30 s).  Measured through the
   * play camera only, after the render, every 15th tick. */
  window.__playCheck = async ({ w1 = 60, w4 = 110 } = {}) => {
    const L = C.legibility;
    const segs = [];
    const frustum = new THREE.Frustum(); const mat = new THREE.Matrix4(); const pt = new THREE.Vector3();
    for (const [wave, seconds, at, yaw] of [[1, w1, [0, 30], Math.PI], [4, w4, [0, -14], Math.PI]]) {   // both face the south gate
      const r = window.__game.instrument.jumpToWave(wave, at, yaw);
      bot = makeBot(r, EXPERT, { seed: 97 });
      const seen = new Set(); const unseen = new Map(); const delays = [];
      const vis = []; const leg = []; let eliteFrames = 0; let eliteLeg = 0; let eliteBodyFrames = 0; let bodyOnlyElite = 0;
      const enemyById = (id) => r.enemies.find((e) => e.id === id);
      const ticks = Math.round(seconds / TICK);
      for (let i = 0; i < ticks; i += 1) {
        frame(TICK);
        if (i % 3 === 0) pipeline.render();
        camera.updateMatrixWorld(true);
        mat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(mat);
        let live = 0; let inView = 0;
        for (const e of r.enemies) {
          if (e.state === 'dead') continue;
          live += 1;
          const d = Math.hypot(e.x - r.player.x, e.z - r.player.z);
          const inF = frustum.containsPoint(pt.set(e.x, e.y + 0.8, e.z));
          if (inF && d <= L.combatRange) inView += 1;
          if (inF) { if (!seen.has(e.id)) { seen.add(e.id); if (unseen.has(e.id)) delays.push(i - unseen.get(e.id)); unseen.delete(e.id); } }
          else if (!seen.has(e.id) && !unseen.has(e.id)) unseen.set(e.id, i);
        }
        const near = r.enemies.filter((e) => e.state !== 'dead' && Math.hypot(e.x - r.player.x, e.z - r.player.z) <= L.combatRange).length;
        if (near >= 3 && i > 120) vis.push(inView / near);
        if (i > 120 && i % 15 === 0 && enemyView) {
          pipeline.render();
          legibility.grabColour();
          const rows = legibility.measure(enemyView.bodies(), enemyView.markers(), enemyById);
          let inRange = 0; let ok = 0;
          for (const e of r.enemies) {
            if (e.state === 'dead') continue;
            const row = rows.get(e.id);
            const d = Math.hypot(e.x - r.player.x, e.z - r.player.z);
            if (!row) continue;
            if (d <= L.combatRange) { inRange += 1; if (row.legible) ok += 1; }
            if (e.elite && frustum.containsPoint(pt.set(e.x, e.y + 0.8, e.z))) { eliteFrames += 1; if (row.legible) eliteLeg += 1; if (row.px >= L.minPx) eliteBodyFrames += 1; if (row.px >= L.minPx && row.sep >= L.minSep) bodyOnlyElite += 1; }
          }
          if (inRange >= 2) leg.push(ok / inRange);
        }
        if (r.over) break;
      }
      const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
      const sorted = vis.slice().sort((a, b) => a - b);
      segs.push({
        wave, seconds, frames: vis.length, visibleFrac: +mean(vis).toFixed(3), p10Frac: +(sorted[Math.floor(sorted.length * 0.1)] ?? 0).toFixed(3),
        p90FirstSightSec: +((delays.sort((a, b) => a - b)[Math.floor(delays.length * 0.9)] ?? 0) * TICK).toFixed(2), sightings: delays.length,
        legSamples: leg.length, legibleFrac: +mean(leg).toFixed(3),
        eliteFrames, eliteLegibleFrac: eliteFrames ? +(eliteLeg / eliteFrames).toFixed(3) : null,
        eliteBodyLegibleFrac: eliteFrames ? +(bodyOnlyElite / eliteFrames).toFixed(3) : null,
        xrayMarkers: enemyView ? legibility.xrayMarkers(enemyView.markers()) : 0,
        captainSeen: r.captainSeen, over: r.over,
      });
      bot = null;
    }
    const s1 = segs[0]; const s4 = segs[1];
    const pass = s1.visibleFrac >= L.visibleFrac && s4.visibleFrac >= L.visibleFrac
      && s1.p90FirstSightSec <= L.p90FirstSightSec && s1.sightings >= 6
      && s4.legSamples >= 5 && s4.legibleFrac >= L.legibleFrac
      && s4.eliteFrames >= 10 && s4.eliteLegibleFrac >= L.eliteFrac && s4.captainSeen >= 1;
    window.__game.instrument.jumpToWave(1, null, null);
    return { pass, segments: segs, thresholds: L };
  };

  /** RENDERED-SPACE feel magnitude: fire one event 6 m ahead at chest height
   *  through the live Feel bus, render the next 4 frames, and report the
   *  pixels that changed against the frame before (burst + text + shake
   *  move pixels; a hit-stop moves nothing but is reported as a scale) and
   *  the peak camera shake in screen pixels.  The gate orders the contract's
   *  ladder by THIS, in the judging space. */
  window.__feelRender = async (event, data = {}) => {
    const r = run; bot = null; fps.keys.clear();
    for (let i = 0; i < 90; i += 1) frame(TICK);            // let earlier bursts die
    feel.shake.trauma = 0; feel.hitstop.until = 0;
    for (const t of feel.vfx.texts) t.el.remove(); feel.vfx.texts.length = 0;
    feel.shake.enabled = false;                                // shake is read off trauma, not baked into the pixels
    pipeline.render();
    const before = new Uint8Array(legibility.grabColour().buf);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const at = camera.position.clone().addScaledVector(fwd, 6); at.y = camera.position.y - 0.4;
    feel.emit(event, { pos: at, count: 2, damage: 12, index: 0, name: 'w', ...data });
    let changed = 0; let shakePx = 0; let hitstop = 0;
    const pxPerM = (pipeline.size.y / 2) / Math.tan(camera.fov * Math.PI / 360);
    for (let f = 0; f < 4; f += 1) {
      const scale = feel.hitstop.scale(TICK); hitstop = Math.max(hitstop, 1 - scale);
      shakePx = Math.max(shakePx, feel.shake.trauma * feel.shake.trauma * 0.35 * pxPerM);
      stepper.frame(TICK * scale); fps.applyCamera(stepper.alpha, TICK); camera.updateMatrixWorld(true);
      enemyView?.update(TICK * scale, r, camera); weapons?.update(TICK * scale, r); feel.update(TICK * scale, TICK); hud.update(r, TICK, { yaw: camera.rotation.y });
      pipeline.render();
      const after = legibility.grabColour();
      let n = 0;
      for (let k = 0; k < after.buf.length; k += 16) if (Math.abs(after.buf[k] - before[k]) + Math.abs(after.buf[k + 1] - before[k + 1]) + Math.abs(after.buf[k + 2] - before[k + 2]) > 30) n += 1;
      changed = Math.max(changed, n * 4);
    }
    const text = feel.vfx.texts.length;
    feel.shake.enabled = true;
    return { event, changedPx: changed, shakePx: +shakePx.toFixed(1), hitstop: +hitstop.toFixed(2), text, at: at.toArray().map((v) => +v.toFixed(2)) };
  };

  /** A real key event through the real listeners: ticks until the feet move. */
  window.__latencyCheck = () => {
    const r = run; bot = null;
    fps.keys.clear();
    for (let i = 0; i < 10; i += 1) stepper.tickOnce();
    const x0 = r.player.x; const z0 = r.player.z;
    canvas.focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
    let moved = -1;
    for (let i = 1; i <= 10; i += 1) { stepper.tickOnce(); if (moved < 0 && Math.hypot(r.player.x - x0, r.player.z - z0) > 1e-4) moved = i; }
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
    return { ticksToMove: moved, pass: moved >= 1 && moved <= 2 };
  };

  /** PAYOFF VISIBILITY: complete an objective from the spot the player
   *  completes it, looking at it, and measure the pixels that changed at
   *  the payoff's own screen position over the next 6 frames. */
  window.__payoffCheck = async (objectiveId) => {
    const map = { 'o1-escort-runner': 1, 'o2-barricades': 2, 'o3-relight-wall': 3, 'o4-escort-reeve': 4 };
    const wave = map[objectiveId];
    const r = window.__game.instrument.jumpToWave(wave, null, null);
    window.__game.instrument.skipWave();
    for (let i = 0; i < 30; i += 1) stepper.tickOnce();
    while (r.dialogue) r.advanceDialogue();
    const o = r.objective;
    if (!o || o.id !== objectiveId) return { pass: false, reason: `objective ${objectiveId} not live (have ${o?.id})` };
    // stand where the player completes it, facing the thing
    let spot; let look;
    if (o.kind === 'activate') { const pt = o.points[o.points.length - 1]; spot = [pt.x + 1.6, pt.z + 0.8]; look = [pt.x, pt.z]; for (let i = 0; i < o.points.length - 1; i += 1) o.points[i].done = true; }
    else { spot = [o.def.to[0] + 2.2, o.def.to[1] + 1.0]; look = o.def.to; const n = r.npc(o.npc); n.x = o.def.to[0] + 4.4; n.z = o.def.to[1] + 2.0; }   // outside the 1.5 m finish: the last steps happen under the hook
    r.player.x = spot[0]; r.player.z = spot[1]; r.player.y = world.groundAt(spot[0], spot[1], null);
    r.player.yaw = Math.atan2(-(look[0] - spot[0]), -(look[1] - spot[1])); r.player.pitch = -0.15;
    fps.snap();
    frame(TICK); pipeline.render();
    const before = legibility.grabColour(); const b = new Uint8Array(before.buf);
    // fire the completion the real way: hold E on the last point, or let the escort arrive
    let payoffPos = null;
    const evHook = (name, data) => { if ((name === 'barricade-up' || name === 'brazier-lit' || name === 'npc-sheltered' || name === 'objective-done') && data.pos && !payoffPos) payoffPos = new THREE.Vector3(data.pos.x, data.pos.y, data.pos.z); };
    const origEmit = r.emit.bind(r);
    r.emit = (name, data) => { evHook(name, data); origEmit(name, data); };
    if (o.kind === 'activate') { bot = () => ({ ...idle(), yaw: r.player.yaw, pitch: r.player.pitch, interactHeld: true }); for (let i = 0; i < 75 && !o.done; i += 1) stepper.tickOnce(); bot = null; }
    else { for (let i = 0; i < 600 && !o.done; i += 1) stepper.tickOnce(); }   // the Reeve walks at 1.1 m/s
    let changed = 0; let inFrame = null; let ndc = null;
    for (let f = 0; f < 6; f += 1) {
      frame(TICK); pipeline.render();
      const after = legibility.grabColour();
      if (payoffPos && !ndc) { const v = payoffPos.clone().project(camera); ndc = [+v.x.toFixed(2), +v.y.toFixed(2)]; inFrame = Math.abs(v.x) < 0.9 && Math.abs(v.y) < 0.9 && v.z < 1; }
      if (!ndc) continue;
      const cx = Math.round((ndc[0] * 0.5 + 0.5) * after.w); const cy = Math.round((ndc[1] * 0.5 + 0.5) * after.h);
      let n = 0;
      const R = Math.round(after.h * 0.18);
      for (let y = Math.max(0, cy - R); y < Math.min(after.h, cy + R); y += 1) for (let x = Math.max(0, cx - R); x < Math.min(after.w, cx + R); x += 1) {
        const k = (y * after.w + x) * 4;
        if (Math.abs(after.buf[k] - b[k]) + Math.abs(after.buf[k + 1] - b[k + 1]) + Math.abs(after.buf[k + 2] - b[k + 2]) > 30) n += 1;   // a grey cart-heap burst on grey ground is a 30-delta, and it is there
      }
      changed = Math.max(changed, n);
    }
    r.emit = origEmit;
    return { pass: !!o.done && !!inFrame && changed >= 300, done: !!o.done, inFrame, ndc, changedPx: changed, event: payoffPos ? payoffPos.toArray().map((v) => +v.toFixed(2)) : null, hud: hud.state() };
  };
}

// audio is scene-owned
addEventListener('pagehide', () => { try { disposeAudio(); } catch { /* none */ } });
