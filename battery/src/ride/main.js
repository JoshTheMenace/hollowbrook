import * as THREE from 'three';
import { Pipeline } from '@town/core/post.js';
import { cel, shadowTintActive } from '@town/core/toon.js';
import { PAL } from '@town/palette.js';
import { Hero } from '@town/game/hero.js';
import { DayNight } from '@town/game/daynight.js';
import { Actor } from '@forge/game/actor.js';
import { celify } from '@forge/lib/celify.js';
import { Feel } from '@forge/engine/feel.js';
import { AdaptiveMusic, SfxPlayer } from '@forge/soundforge/runtime.js';
import { SFX } from '@forge/soundforge/content/sfx-core.js';
import { LOOP } from '@forge/soundforge/content/loop-nightbloom.js';
import { makeCritter } from '@forge/survivors/critters.js';
import { toonMaterial, facetBall } from '@forge/lib/parts.js';
import { buildCorner, cornerLights } from '../shared/corner.js';
import { CELIFY_OPTS } from '../shared/bridge.js';
import { RideRun, RIDE_EVENTS, CURVE, RIDE_SECONDS, ARENA, CAMERA, SIM_DT, kiteBot, makeNoisyMove, EXPERT, mulberry32 } from './curve.js';
import { FixedStep, InputTape } from '@forge/engine/fixedstep.js';
import { wireRide, LADDER_STEPS, LADDER_PAIRS } from './feel-table.js';

/* INTENSITY RIDE shell (battery B4). The curve is the design (curve.js,
 * gated headlessly); this file is presentation: the battle bridge over
 * the survivors Run, the celified ronin as the player, intent-driven light
 * and music, HUD, the upgrade cards (the player's choice, never RNG). */

const canvas = document.querySelector('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
if (!shadowTintActive()) console.error('[ride] shadow tint OFF');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 80);
const { sun, fill, hemi } = cornerLights(scene);
const corner = buildCorner(scene);
// camera occluders are WORLD geometry only — with the whole scene the
// pullback probe hit the player's own hair and parked the camera inside
// his head (check-ride-camera: p10 0, legibility 0.023)
const occluders = new THREE.Group();
occluders.add(corner.shop, corner.toro, corner.rack);
scene.add(occluders);
const pipeline = new Pipeline(renderer, scene, camera, {
  ink: { color: PAL.ink, fadeStart: 24, fadeEnd: 60, skyDepth: 70 },
  grade: { shadowTint: PAL.gradeShadow, lightTint: PAL.gradeLight },
});
// the street is the arena: a faint wash marks it so the bounds are read
{
  const wash = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.x1 - ARENA.x0, ARENA.z1 - ARENA.z0), new THREE.MeshBasicMaterial({ color: 0x86487a, transparent: true, opacity: 0.12, depthWrite: false }));
  wash.rotation.x = -Math.PI / 2;
  wash.position.set((ARENA.x0 + ARENA.x1) / 2, 0.02, (ARENA.z0 + ARENA.z1) / 2);
  scene.add(wash);
}

// ---- the player ------------------------------------------------------------
const actor = await Actor.spawn('ronin', { walkSpeed: 1.4, runSpeed: 3.2 });
actor.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
scene.add(actor.root);
celify(actor.root, cel, CELIFY_OPTS);
const hero = new Hero({ actor, camera, canvas, colliders: [], groundAt: () => 0, spawn: [0, 0, 4], yaw: 0, occluderRoot: occluders });
hero.external = true;      // the sim owns position; the hero drives body + camera
hero.battleCam = true;
hero.battleDist = 15;      // a 13m boom at 46° shows ±5.5m; the ride's threats read from farther
// the battlefield lights itself: a warm glow riding the player so combat
// stays legible once the intent curve has taken the corner to night
// (nightbloom review: dark chaff on dark ground fails the ID-pass contrast)
const bloomLight = new THREE.PointLight(0xffd9a0, 22, 16, 1.6);
scene.add(bloomLight);

// ---- light + music: both read the curve ------------------------------------
const daynight = new DayNight({ scene, sun, fill, hemi, pipeline, root: scene });
scene.updateMatrixWorld(true);
daynight.collectPracticals(scene);
daynight.set('dusk');
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
    music.setIntensity(0.15);
  } catch (e) { console.error('[ride] audio failed:', e); }
}
addEventListener('pointerdown', unlockAudio);
addEventListener('keydown', unlockAudio);

// ---- HUD --------------------------------------------------------------------
const el = (id) => document.querySelector(id);
const hpEl = el('#hp'), statsEl = el('#stats'), clockEl = el('#clock'), tierEl = el('#tier'), vignetteEl = el('#vignette');
const cardsEl = el('#cards'), overlay = el('#overlay');
const TIER_NAMES = ['dusk', 'first push', 'breathe', 'second push', 'breathe', 'the surround', 'exhale', 'CLIMAX', 'hold', 'release'];
let choosing = false, pendingChoices = [];
function showCards() {
  const r = ride.run;
  if (ride.autoPick) return;   // an instrument picks inside RideRun; the cards are the player's
  if (r.pendingLevelUps <= 0) { choosing = false; cardsEl.style.display = 'none'; return; }
  pendingChoices = r.choices();
  if (!pendingChoices.length) { r.pendingLevelUps = 0; choosing = false; cardsEl.style.display = 'none'; return; }
  choosing = true;
  cardsEl.innerHTML = '';
  pendingChoices.forEach((c, i) => {
    const d = document.createElement('div');
    d.className = 'card';
    d.innerHTML = `<div class="key">${i + 1}</div><div class="label">${c.label}</div><div class="desc">${c.desc}</div>`;
    d.onclick = () => pick(i);
    cardsEl.appendChild(d);
  });
  cardsEl.style.display = 'flex';
}
function pick(i) {
  if (!choosing || !pendingChoices[i]) return;
  ride.run.applyChoice(pendingChoices[i]);
  ride.run.pendingLevelUps--;
  showCards();
}

// ---- feel --------------------------------------------------------------------
const feel = new Feel({ scene, camera, sfx: null });
wireRide(feel, {
  beat: (i, intent) => {
    tierEl.textContent = TIER_NAMES[i] ?? '';
    if (intent >= 0.8 && daynight.current !== 'night') daynight.fadeTo('night', 8);
  },
  levelUp: () => showCards(),
  hurt: () => { vignetteEl.style.opacity = '1'; setTimeout(() => { vignetteEl.style.opacity = '0'; }, 220); },
  end: (kind) => endRun(kind),
});
window.__feelCheck = () => feel.check(RIDE_EVENTS);
window.__feelLadder = () => feel.checkLadder(LADDER_STEPS, LADDER_PAIRS);

// ---- the battle bridge: Run state -> world ------------------------------------
const dyn = new THREE.Group();
scene.add(dyn);
const critters = new Map();     // enemy -> critter
const dying = [];
const flashFX = [];
const orbVisuals = [];
const gemGeo = new THREE.OctahedronGeometry(0.13);
const gemMat = toonMaterial('#6ee0ff', { rim: 1.0, rimColor: '#ffffff' });
const knifeGeo = new THREE.BoxGeometry(0.06, 0.06, 0.42);
const knifeMat = toonMaterial('#d8e4f0', { rim: 0.8, rimColor: '#ffffff' });
const boltMat = toonMaterial('#c060ff', { rim: 1.0, rimColor: '#ffffff' });
const orbGeo = new THREE.BoxGeometry(0.1, 0.34, 0.16);
const orbMat = toonMaterial('#b08aff', { rim: 0.9, rimColor: '#ffffff' });
const arcMat = new THREE.MeshBasicMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
// elite marker + HP bar (nightbloom review: a 700 HP threat in a 20 HP
// silhouette is unreadable; the marker is part of the threat for the ID pass)
const eliteMarkGeo = new THREE.OctahedronGeometry(0.2);
const eliteMarkMat = new THREE.MeshBasicMaterial({ color: '#ffd76a' });
const barBackGeo = new THREE.PlaneGeometry(1.2, 0.13);
const barFillGeo = new THREE.PlaneGeometry(1.2, 0.13);
barFillGeo.translate(0.6, 0, 0);
// plate AND fill in the SAME render list (both transparent): three.js draws
// the whole opaque list before the whole transparent list, so renderOrder
// cannot order an opaque fill under a transparent plate — the plate painted
// over the fill every frame and the bar drew nothing (review r1)
const barBackMat = new THREE.MeshBasicMaterial({ color: '#1c1626', transparent: true, opacity: 0.85, depthTest: false });
const barFillMat = new THREE.MeshBasicMaterial({ color: '#ff5a6e', transparent: true, opacity: 1, depthTest: false });
const _camQ = new THREE.Quaternion(), _rootQ = new THREE.Quaternion();
const up = (p) => new THREE.Vector3(p.x, 0.55, p.z);

function fxAdapter() {
  return {
    emit: (ev, d) => {
      if (ev === 'spawn' || ev === 'elite-spawn') {
        const e = d.e;
        const c = makeCritter(e.def.visual);
        c.root.position.set(e.pos.x, 0, e.pos.z);
        dyn.add(c.root);
        critters.set(e, c);
        if (e.def.elite) {
          const mk = new THREE.Group();
          mk.name = 'elite-marker';
          const gem = new THREE.Mesh(eliteMarkGeo, eliteMarkMat);
          gem.position.y = 0.42;
          const back = new THREE.Mesh(barBackGeo, barBackMat);
          const fillM = new THREE.Mesh(barFillGeo, barFillMat);
          fillM.position.x = -0.6; fillM.position.z = 0.005;
          back.renderOrder = 20; fillM.renderOrder = 21; gem.renderOrder = 20;
          mk.add(back, fillM, gem);
          mk.position.y = 1.8;
          c.root.add(mk);
          c._marker = { mk, fill: fillM, gem };
        }
        if (ev === 'spawn') return feel.emit(ev, { ...d, pos: up(d.pos) });
      }
      if (ev === 'enemy-hit') { const c = critters.get(d.e); if (c) c._pop = 0.14; }
      if (ev === 'kill' || ev === 'elite-kill') {
        const c = critters.get(d.e);
        if (c) { critters.delete(d.e); dying.push({ root: c.root, life: 0 }); }
      }
      feel.emit(ev, d.pos ? { ...d, pos: up(d.pos) } : d);
    },
    despawn: (e) => { const c = critters.get(e); if (c) { critters.delete(e); dyn.remove(c.root); } },
    gemSpawn: (g) => { const m = new THREE.Mesh(gemGeo, gemMat); m.position.set(g.pos.x, 0.25, g.pos.z); dyn.add(m); g._vis = m; },
    weaponFX: (kind, data) => {
      const P = ride.run.playerPos;
      if (kind === 'arc') {
        const half = THREE.MathUtils.degToRad(data.arc / 2);
        const geo = new THREE.RingGeometry(data.radius * 0.35, data.radius, 24, 1, -Math.PI / 2 - half, half * 2);
        geo.rotateX(-Math.PI / 2);
        const m = new THREE.Mesh(geo, arcMat.clone());
        m.rotation.y = Math.atan2(data.dir.x, data.dir.z);
        m.position.set(P.x, 0.12, P.z);
        dyn.add(m);
        flashFX.push({ mesh: m, ttl: 0.18, life: 0 });
      } else if (kind === 'nova') {
        const m = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.5, 32), arcMat.clone());
        m.rotation.x = -Math.PI / 2;
        m.position.set(P.x, 0.1, P.z);
        dyn.add(m);
        flashFX.push({ mesh: m, ttl: 0.3, life: 0, grow: data.radius });
      } else if (kind === 'strike') {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 7, 0.12), new THREE.MeshBasicMaterial({ color: '#fff6b0' }));
        m.position.set(data.pos.x, 3.5, data.pos.z);
        dyn.add(m);
        flashFX.push({ mesh: m, ttl: 0.14, life: 0 });
      }
    },
    projSpawn: (p) => {
      p._vis = p.kind === 'knife' ? new THREE.Mesh(knifeGeo, knifeMat) : facetBall(0.14, boltMat, [1, 1, 1.5], [6, 4]);
      p._vis.position.set(p.pos.x, 0.7, p.pos.z);
      dyn.add(p._vis);
    },
    projDie: (p) => { if (p._vis) dyn.remove(p._vis); },
  };
}
// gems collect through the pure layer; their visuals go when the run drops them
function syncWorld(dt) {
  const run = ride.run, t = run.time;
  const a = step ? step.alpha : 1;
  for (const [e, c] of critters) {
    const p = prevPos.get(e) ?? e.pos;
    c.root.position.set(p.x + (e.pos.x - p.x) * a, 0, p.z + (e.pos.z - p.z) * a);
    if (e.vel.lengthSq() > 0.01) c.root.rotation.y = Math.atan2(e.vel.x, e.vel.z);
    if (c._pop > 0) { c._pop -= dt; c.root.scale.setScalar(1 + 0.3 * Math.sin(Math.max(0, c._pop / 0.14) * Math.PI)); }
    else if (e.def.behavior === 'charge' && e.chargeT !== undefined && e.chargeT < 0.4 && !(e.charging > 0)) {
      // the imp's wind-up: every source of damage telegraphs (A2 ruling)
      const p = 1 - e.chargeT / 0.4;
      c.root.scale.set(1 - p * 0.25, 1 + p * 0.45, 1 - p * 0.25);
      if (!c._tele) { c._tele = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.6, 24), new THREE.MeshBasicMaterial({ color: '#ff6a7a', transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })); c._tele.rotation.x = -Math.PI / 2; c._tele.position.y = 0.05; c.root.add(c._tele); }
      c._tele.visible = true;
      c._tele.material.opacity = 0.3 + p * 0.6;
    } else {
      if (c.root.scale.x !== 1) c.root.scale.setScalar(1);
      if (c._tele) c._tele.visible = false;
    }
    if (c._marker) {
      camera.getWorldQuaternion(_camQ);
      c.root.getWorldQuaternion(_rootQ).invert();
      c._marker.mk.quaternion.copy(_rootQ).multiply(_camQ);
      c._marker.fill.scale.x = Math.max(0.001, e.hp / e.maxHp);
      c._marker.gem.position.y = 0.42 + Math.sin(t * 4) * 0.06;
    }
    c.update(dt, t);
  }
  for (let i = dying.length - 1; i >= 0; i--) {
    const d = dying[i];
    d.life += dt;
    d.root.scale.setScalar(Math.max(0.001, 1 - d.life / 0.18));
    if (d.life >= 0.18) { dyn.remove(d.root); dying.splice(i, 1); }
  }
  const liveGems = new Set(run.gems);
  for (const g of run.gems) if (g._vis) { g._vis.position.set(g.pos.x, 0.25 + Math.sin(t * 4 + g.pos.x * 3) * 0.06, g.pos.z); g._vis.rotation.y = t * 2.5; }
  for (const o of [...dyn.children]) if (o.geometry === gemGeo && ![...liveGems].some((g) => g._vis === o)) dyn.remove(o);
  for (const p of run.projectiles) if (p._vis) { p._vis.position.set(p.pos.x, 0.7, p.pos.z); p._vis.lookAt(p.pos.x + p.dir.x, 0.7, p.pos.z + p.dir.z); }
  const orbSt = run.weaponState.get('orbs');
  const want = orbSt?.orbPos?.length || 0;
  while (orbVisuals.length < want) { const m = new THREE.Mesh(orbGeo, orbMat); dyn.add(m); orbVisuals.push(m); }
  while (orbVisuals.length > want) dyn.remove(orbVisuals.pop());
  orbVisuals.forEach((m, i) => { const o = orbSt.orbPos[i]; m.position.set(o.x, 0.65, o.z); m.rotation.y = orbSt.angle + (i / want) * Math.PI * 2; });
  for (let i = flashFX.length - 1; i >= 0; i--) {
    const f = flashFX[i];
    f.life += dt;
    const u = f.life / f.ttl;
    if (u >= 1) { dyn.remove(f.mesh); flashFX.splice(i, 1); continue; }
    if (f.mesh.material.opacity !== undefined) f.mesh.material.opacity = 0.85 * (1 - u);
    if (f.grow) { const s = 1 + (f.grow / 0.5 - 1) * u; f.mesh.scale.set(s, s, s); }
  }
}

// ---- run lifecycle --------------------------------------------------------------
// A6: the sim runs on SIM_DT through FixedStep; the render interpolates.
// Movement input (player or bot) is sampled per TICK and recorded to a
// tick-indexed tape; a replay feeds the tape back at any render cadence.
let ride = null, started = false, autoplay = null, step = null, tape = null, replayTape = null;
const prevPos = new Map();        // enemy -> {x,z} at the last tick; player under key 'P'
const probe = { every: 0, checkpoints: [] };
const stateHash = () => JSON.stringify({
  t: +ride.run.time.toFixed(6), tick: step.tick, kills: ride.run.kills, hp: +ride.run.stats.hp.toFixed(4), level: ride.run.level, xp: ride.run.xp,
  pos: [+ride.run.playerPos.x.toFixed(6), +ride.run.playerPos.z.toFixed(6)],
  enemies: ride.run.enemies.map((e) => [+e.pos.x.toFixed(5), +e.pos.z.toFixed(5), +e.hp.toFixed(3)]),
});
function snapshotPrev() {
  prevPos.clear();
  prevPos.set('P', { x: ride.run.playerPos.x, z: ride.run.playerPos.z });
  for (const e of ride.run.enemies) prevPos.set(e, { x: e.pos.x, z: e.pos.z });
}
function onTick(tick) {
  if (!ride || ride.over) return;
  snapshotPrev();
  let move = null;
  if (replayTape) { const m = replayTape.at(tick)[0]; move = m ? new THREE.Vector3(m[0], 0, m[1]) : null; }
  else if (autoplay) move = autoplay(ride);
  else { const inp = hero.moveInput(); if (inp.x || inp.z) move = new THREE.Vector3(inp.x, 0, inp.z); }
  // the sim consumes exactly what the tape stores: quantize BEFORE applying,
  // or the recording and its replay differ at the 7th decimal and diverge
  if (move) move.set(+move.x.toFixed(6), 0, +move.z.toFixed(6));
  if (tape && !replayTape && move) tape.record(tick, [move.x, move.z]);
  ride.update(SIM_DT, move);
  if (probe.every && (tick + 1) % probe.every === 0) probe.checkpoints.push({ tick: tick + 1, hash: stateHash() });
}
function startRun(rng = Math.random, autoPick = false, { record = false, replay = null } = {}) {
  for (const [, c] of critters) dyn.remove(c.root);
  critters.clear(); dying.length = 0;
  while (dyn.children.length) dyn.remove(dyn.children[0]);
  orbVisuals.length = 0; flashFX.length = 0;
  ride = new RideRun({ fx: fxAdapter(), rng, autoPick });
  tape = record ? new InputTape() : null;
  replayTape = replay;
  step = new FixedStep({ dt: SIM_DT, onTick });
  snapshotPrev();
  hero.place(0, 4, 0);
  daynight.set('dusk');
  tierEl.textContent = TIER_NAMES[0];
  choosing = false; cardsEl.style.display = 'none';
  overlay.style.display = 'none';
  started = true;
  music?.setIntensity(0.15, 1);
}
function endRun(kind) {
  started = false;
  const r = ride.run;
  overlay.style.display = 'flex';
  el('#result').style.display = 'block';
  el('#finalline').textContent = kind === 'victory' ? 'you rode it out' : `the street took you at ${Math.floor(r.time / 60)}:${String(Math.floor(r.time % 60)).padStart(2, '0')}`;
  el('#finalstats').textContent = `${r.kills} kills · level ${r.level}`;
  el('#startline').textContent = 'press any direction to ride again';
  music?.setIntensity(0.1, 3);
}
addEventListener('keydown', (e) => {
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code) && !started && !e.repeat) { startRun(); return; }
  if (choosing && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) pick(Number(e.code.slice(-1)) - 1);
});
canvas.addEventListener('pointerdown', () => { if (!started) startRun(); });

// ---- loop ---------------------------------------------------------------------------
const clock = new THREE.Clock();
function tick(rawDt) {
  const dt = rawDt * feel.hitstop.scale(rawDt);   // hit-stop dilates sim TIME; ticks never change size
  if (ride && started && !choosing) {
    step.advance(dt);
    syncWorld(rawDt);
    const run = ride.run;
    const a = step.alpha, pp = prevPos.get('P') ?? run.playerPos;
    hero.position.set(pp.x + (run.playerPos.x - pp.x) * a, 0, pp.z + (run.playerPos.z - pp.z) * a);
    hero.eyeY = 0;
    bloomLight.position.set(run.playerPos.x, 3.2, run.playerPos.z);
    bloomLight.intensity = 14 + ride.intent * 14 + Math.sin(run.time * 2.1) * 3;   // breathes, and rises with the ride
    hpEl.style.width = `${Math.max(0, run.stats.hp / run.stats.maxHp) * 100}%`;
    hpEl.style.background = run.stats.hp / run.stats.maxHp < 0.3 ? '#ff5a6e' : '#7cf5a0';
    statsEl.textContent = `lv ${run.level} · ${run.kills} kills`;
    const left = Math.max(0, RIDE_SECONDS - run.time);
    clockEl.textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    music?.setIntensity(ride.intent, 0.6);
  }
  hero.update(dt);
  daynight.update(dt, hero.position);
  feel.update(dt, rawDt);
  camera.position.add(feel.shake.offset);
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

// ---- gates + evidence --------------------------------------------------------------
window.__ride = { get ride() { return ride; }, get step() { return step; }, get tape() { return tape; }, startRun, feel, hero, camera, get music() { return music; }, stateHash };
window.__tick = tick;
window.__autoplay = (on, seed = 1, opts = {}) => {
  if (on) { startRun(mulberry32(seed), true, opts); autoplay = makeNoisyMove(kiteBot, { ...EXPERT, seed: seed * 3 + 1 }); }
  else autoplay = null;
};
// replay a tape (tick -> [mx, mz]) with the same seed; no bot
window.__replay = (seed, events) => {
  autoplay = null;
  startRun(mulberry32(seed), true, { replay: { at: (tick) => events.filter((e) => e.tick === tick).map((e) => e.input) } });
};
// drive frames at an explicit render cadence; checkpoints on exact ticks
window.__drive = (rawDts, { everyTicks = 600 } = {}) => {
  probe.every = everyTicks; probe.checkpoints = [];
  for (const d of rawDts) { if (!ride || ride.over) break; tick(d); }
  const out = { checkpoints: probe.checkpoints, ticks: step.tick, over: ride.over, kills: ride.run.kills, dropped: step.dropped, tape: tape?.toJSON() ?? null };
  probe.every = 0;
  return out;
};

// ID-pass legibility (ported from nightbloom __playCheck): threats flat-
// colored by index, everything else black; per-threat pixel share + p90
// redmean separation from the backdrop; an elite reads only via marker px.
const LEGIBLE = { minPx: 14, minSep: 0.09, eliteMinPx: 56, eliteMarkerPx: 10, combatRange: CAMERA.combatRange };
let _idRT = null, _idBuf = null, _lumaCanvas = null, _idBlack = null;
const _idMats = [], _idMarkMats = [];
function measureLegibility() {
  const W = 320, H = Math.max(2, Math.round(W / camera.aspect / 2) * 2);
  if (!_idRT || _idRT.width !== W || _idRT.height !== H) {
    _idRT?.dispose();
    _idRT = new THREE.WebGLRenderTarget(W, H);
    _idBuf = new Uint8Array(W * H * 4);
    _lumaCanvas = document.createElement('canvas');
    _lumaCanvas.width = W; _lumaCanvas.height = H;
  }
  const lctx = _lumaCanvas.getContext('2d', { willReadFrequently: true });
  lctx.drawImage(renderer.domElement, 0, 0, W, H);
  const shown = lctx.getImageData(0, 0, W, H).data;
  const pairs = [...critters.entries()];
  const owner = new Map(), isMarker = new Set();
  pairs.forEach(([, c], i) => {
    c.root.traverse((o) => { if (o.isMesh) owner.set(o, i); });
    if (c._marker) c._marker.mk.traverse((o) => { if (o.isMesh) isMarker.add(o); });
  });
  _idBlack ??= new THREE.MeshBasicMaterial({ fog: false, color: 0x000000 });
  const restore = [];
  scene.traverse((o) => {
    if (o.isMesh) {
      restore.push([o, o.material]);
      const i = owner.get(o);
      if (i === undefined) o.material = _idBlack;
      else if (isMarker.has(o)) { (_idMarkMats[i] ??= new THREE.MeshBasicMaterial({ fog: false, depthTest: false })).color.setRGB((i + 1) / 255, 1, 0); o.material = _idMarkMats[i]; }
      else { (_idMats[i] ??= new THREE.MeshBasicMaterial({ fog: false })).color.setRGB((i + 1) / 255, 0, 0); o.material = _idMats[i]; }
    } else if ((o.isPoints || o.isLine || o.isSprite) && o.visible) { restore.push([o, null]); o.visible = false; }
  });
  const keepBg = scene.background, keepFog = scene.fog;
  scene.background = null; scene.fog = null;
  renderer.setRenderTarget(_idRT);
  renderer.render(scene, camera);
  renderer.readRenderTargetPixels(_idRT, 0, 0, W, H, _idBuf);
  renderer.setRenderTarget(null);
  scene.background = keepBg; scene.fog = keepFog;
  for (const [o, m] of restore) { if (m === null) o.visible = true; else o.material = m; }
  const n = pairs.length;
  const px = new Array(n).fill(0), markPx = new Array(n).fill(0);
  const pixels = Array.from({ length: n }, () => []);   // BODY pixels only (A7 §2: the marker is its own row)
  const box = Array.from({ length: n }, () => [W, H, -1, -1]);
  for (let p = 0; p < W * H; p++) {
    const id = _idBuf[p * 4];
    if (!id || id > n) continue;
    const i = id - 1, x = p % W, y = H - 1 - ((p / W) | 0);
    if (_idBuf[p * 4 + 1] > 200) { markPx[i]++; continue; }   // marker pixels never count toward the body
    px[i]++;
    pixels[i].push((y * W + x) * 4);
    const b = box[i];
    if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
  }
  const redmean = (a, b) => { const rbar = (a[0] + b[0]) / 2, dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2]; return Math.sqrt((2 + rbar / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rbar) / 256) * db * db) / 765; };
  const out = new Map();
  pairs.forEach(([e], i) => {
    let sep = 0;
    if (px[i] > 0) {
      const [x0, y0, x1, y1] = box[i];
      const back = [0, 0, 0]; let bn = 0;
      for (let y = Math.max(0, y0 - 5); y <= Math.min(H - 1, y1 + 5); y++) for (let x = Math.max(0, x0 - 5); x <= Math.min(W - 1, x1 + 5); x++) {
        if (_idBuf[((H - 1 - y) * W + x) * 4]) continue;
        const k = (y * W + x) * 4;
        back[0] += shown[k]; back[1] += shown[k + 1]; back[2] += shown[k + 2]; bn++;
      }
      if (bn) {
        const bm = back.map((v) => v / bn);
        const dists = pixels[i].map((k) => redmean([shown[k], shown[k + 1], shown[k + 2]], bm)).sort((a, b) => a - b);
        sep = dists[Math.floor(dists.length * 0.9)] ?? 0;
      }
    }
    const elite = !!e.def.elite;
    // an elite is legible by its BODY (size + contrast, like chaff at its
    // size); whether it reads AS an elite is the marker row, judged apart
    // (r1: depthTest:false marker + dead-bar pixels made the row a tautology)
    const legible = elite ? px[i] >= LEGIBLE.eliteMinPx && sep >= LEGIBLE.minSep : px[i] >= LEGIBLE.minPx && sep >= LEGIBLE.minSep;
    out.set(e, { px: px[i], markPx: markPx[i], sep: +sep.toFixed(3), elite, legible, marker: elite && markPx[i] >= LEGIBLE.eliteMarkerPx });
  });
  return out;
}
window.__legibility = () => { const m = measureLegibility(); return [...m.values()]; };
// the elite bar's PIXELS (A7 §1): red fill pixels vs dark plate pixels inside
// the bar's projected screen box — the frame-assertion rule extended to UI
window.__eliteBar = () => {
  const entry = [...critters.entries()].find(([e]) => e.def.elite && !e.dead);
  if (!entry) return null;
  const [e, c] = entry;
  const W = renderer.domElement.width, H = renderer.domElement.height;
  const corners = [-0.6, 0.6].map((dx) => { const v = new THREE.Vector3(); c._marker.mk.localToWorld(v.set(dx, 0, 0)); return v.project(camera); });
  const xs = corners.map((p) => (p.x * 0.5 + 0.5) * W), ys = corners.map((p) => (-p.y * 0.5 + 0.5) * H);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)) - 2), x1 = Math.min(W - 1, Math.ceil(Math.max(...xs)) + 2);
  const yc = (ys[0] + ys[1]) / 2, y0 = Math.max(0, Math.floor(yc - 6)), y1 = Math.min(H - 1, Math.ceil(yc + 6));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d'); ctx.drawImage(renderer.domElement, 0, 0);
  const d = ctx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1).data;
  // classify by REDNESS, not absolute brightness: under the night grade the
  // fill reads ~(163,69,99) and the plate ~(68,61,72)
  // the fill's horizontal EXTENT against the bar's projected width (the
  // plate's edge rows are not "unfilled"; a full bar must read 1.0)
  const bw = x1 - x0 + 1;
  let red = 0, dark = 0, minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (r > 110 && r > g + 50 && r > b + 35) { red++; const px = (i / 4) % bw; minX = Math.min(minX, px); maxX = Math.max(maxX, px); }
    else if (r < 95 && g < 85 && b < 105 && Math.abs(r - g) < 30) dark++;
  }
  const barWidth = Math.max(1, Math.abs(xs[1] - xs[0]));
  return { hpFrac: e.hp / e.maxHp, fillFrac: red ? Math.min(1, (maxX - minX + 1) / barWidth) : 0, red, dark, box: [x0, y0, x1, y1] };
};

// play-camera gate: canonical seeded start, the standard bot, frustum
// fraction of live threats within combat range (p10), plus ID-pass
// legibility sampled through the climax
window.__playCheck = (seconds = 175) => {
  window.__autoplay(true, 7);
  const frustum = new THREE.Frustum(), mat = new THREE.Matrix4(), pt = new THREE.Vector3();
  const samples = [], legSamples = [];
  let eliteFrames = 0, eliteLegible = 0, eliteMarker = 0;
  for (let i = 0; i < seconds * 60 && started; i++) {
    tick(1 / 60);
    camera.updateMatrixWorld();
    mat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(mat);
    const P = ride.run.playerPos;
    let vis = 0, live = 0;
    for (const e of ride.run.enemies) {
      if (e.dead || e.pos.distanceTo(P) > LEGIBLE.combatRange) continue;
      live++;
      if (frustum.containsPoint(pt.set(e.pos.x, 0.5, e.pos.z))) vis++;
    }
    if (live >= 5 && i > 120) samples.push(vis / live);
    if (ride.time >= CURVE[7][0] && ride.time <= CURVE[8][0] && i % 15 === 0) {
      const leg = measureLegibility();
      let inRange = 0, ok = 0;
      for (const e of ride.run.enemies) {
        const s = leg.get(e);
        if (!s) continue;
        if (e.pos.distanceTo(P) <= LEGIBLE.combatRange) { inRange++; if (s.legible) ok++; }
        if (s.elite && frustum.containsPoint(pt.set(e.pos.x, 0.8, e.pos.z))) { eliteFrames++; if (s.legible) eliteLegible++; if (s.marker) eliteMarker++; }
      }
      if (inRange >= 3) legSamples.push(ok / inRange);
    }
  }
  window.__autoplay(false);
  const sorted = [...samples].sort((a, b) => a - b);
  const p10 = sorted[Math.floor(sorted.length * 0.1)] ?? 0;
  const legMean = legSamples.reduce((a, b) => a + b, 0) / Math.max(1, legSamples.length);
  return {
    frames: samples.length, visibleP10: +p10.toFixed(3), survived: +ride.time.toFixed(1),
    climaxLegibleFrac: +legMean.toFixed(3), climaxSamples: legSamples.length,
    eliteLegibleFrac: eliteFrames ? +(eliteLegible / eliteFrames).toFixed(3) : null,   // BODY
    eliteMarkerFrac: eliteFrames ? +(eliteMarker / eliteFrames).toFixed(3) : null,     // marker, separately
    eliteFrames,
    pass: p10 >= 0.8 && legMean >= 0.6 && (eliteFrames === 0 || (eliteLegible / eliteFrames >= 0.8 && eliteMarker / eliteFrames >= 0.8)),
  };
};
