import * as THREE from 'three';
import { Run } from './systems.js';
import { PLAYABLES, WEAPONS, RUN_LENGTH } from './data.js';
import { makeCritter } from './critters.js';
import { Actor } from '../game/actor.js';
import { toonMaterial, facetBall, facet } from '../lib/parts.js';
import { audio, music } from '../engine/audio.js';
import { VFX, Shake, HitStop } from '../engine/vfx.js';
import { Juice } from '../engine/juice.js';
import { Shell, Save, Input } from '../engine/shell.js';

// Nightbloom — a survivors-like roguelite on the CharForge engine layer.
// All combat/economy logic lives in systems.js (balance-gated headlessly by
// scripts/simulate-run.mjs); this file is pure presentation + shell.

// ---- renderer / scene -----------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.appendChild(renderer.domElement);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const scene = new THREE.Scene();
scene.background = new THREE.Color('#1d1a2e');
scene.fog = new THREE.Fog('#1d1a2e', 21, 36);
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 90);

const moon = new THREE.DirectionalLight('#b8c2f2', 2.1);
moon.position.set(-6, 12, 4);
scene.add(moon);
scene.add(new THREE.HemisphereLight('#7a7ab8', '#3a3452', 1.35));
const lamp = new THREE.PointLight('#ffd9a0', 26, 14, 1.6);
lamp.position.set(0, 2.6, 0);
scene.add(lamp);

// ---- arena ----------------------------------------------------------------
{
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#403a5e';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = Math.random() < 0.5 ? '#494268' : '#383152';
    const s = 2 + Math.random() * 5;
    g.fillRect(Math.random() * 256, Math.random() * 256, s, s * 0.6);
  }
  for (let i = 0; i < 40; i++) {                       // fallen petals
    g.fillStyle = 'rgba(233,140,180,0.28)';
    g.beginPath();
    g.ellipse(Math.random() * 256, Math.random() * 256, 2.6, 1.4, Math.random() * 3, 0, 7);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 5);
  tex.colorSpace = THREE.SRGBColorSpace;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(46, 46), new THREE.MeshToonMaterial({ map: tex, color: '#cfc8ec' }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
}
{
  const rockM = toonMaterial('#38304e', { rim: 0.35, rimColor: '#8a7ac0' });
  const blossomM = toonMaterial('#e98cb4', { rim: 0.6, rimColor: '#ffe0ee' });
  const trunkM = toonMaterial('#40364f', { rim: 0.25 });
  for (let i = 0; i < 26; i++) {                       // border rocks
    const a = (i / 26) * Math.PI * 2;
    const r = 12.6 + Math.sin(i * 3.7) * 0.7;
    const rock = facetBall(0.5 + (i % 3) * 0.25, rockM, [1, 0.75 + (i % 2) * 0.4, 1], [6, 4]);
    rock.position.set(Math.cos(a) * r, 0.2, Math.sin(a) * r);
    rock.rotation.y = i * 2.1;
    scene.add(rock);
  }
  for (const [x, z] of [[-13, -13], [13, -13], [-13, 13], [13, 13], [0, -14.5], [14.5, 0], [0, 14.5], [-14.5, 0]]) {
    const tree = new THREE.Group();                    // blossom trees ring the arena
    const trunk = facet(new THREE.CylinderGeometry(0.16, 0.28, 1.9, 5), trunkM);
    trunk.position.y = 0.95;
    tree.add(trunk);
    for (let i = 0; i < 3; i++) {
      const puff = facetBall(0.8 - i * 0.14, blossomM, [1, 0.8, 1], [6, 4]);
      puff.position.set(Math.sin(i * 2.4) * 0.5, 2.1 + i * 0.45, Math.cos(i * 2.4) * 0.4);
      tree.add(puff);
    }
    tree.position.set(x, 0, z);
    scene.add(tree);
  }
}
// drifting petals: ambient atmosphere, wraps around the player
const petals = (() => {
  const N = 42, geo = new THREE.PlaneGeometry(0.09, 0.055);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#f0a8c8', side: THREE.DoubleSide, transparent: true, opacity: 0.75 }), N);
  const items = Array.from({ length: N }, () => ({
    pos: new THREE.Vector3((Math.random() - 0.5) * 24, Math.random() * 5, (Math.random() - 0.5) * 24),
    ph: Math.random() * 7, sp: 0.25 + Math.random() * 0.35,
  }));
  scene.add(mesh);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1);
  return {
    update(dt, t, center) {
      items.forEach((p, i) => {
        p.pos.y -= p.sp * dt;
        p.pos.x += Math.sin(t * 1.3 + p.ph) * 0.35 * dt;
        if (p.pos.y < 0.02) { p.pos.y = 4.5 + Math.random(); p.pos.x = center.x + (Math.random() - 0.5) * 24; p.pos.z = center.z + (Math.random() - 0.5) * 24; }
        e.set(t * 2 + p.ph, p.ph, t * 1.4);
        mesh.setMatrixAt(i, m.compose(p.pos, q.setFromEuler(e), s));
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
})();

// ---- engine services ------------------------------------------------------
const input = new Input();
const vfx = new VFX(scene);
const shake = new Shake();
const hitstop = new HitStop();
const juice = new Juice({ vfx, shake, hitstop, camera });
const shell = new Shell();
const save = new Save('nightbloom', 1);
let meta = save.load({ gold: 0, unlocked: ['ronin'], best: {}, wins: 0 });

// ---- sound bank -----------------------------------------------------------
audio.define('ui', { wave: 'triangle', freq: 660, decay: 0.07, volume: 0.3 });
audio.define('start', { wave: 'square', freq: 220, freqEnd: 660, sweepTime: 0.22, decay: 0.3, volume: 0.4, lowpass: 2400 });
audio.define('slash', { wave: 'noise', decay: 0.1, volume: 0.24, lowpass: 2600 });
audio.define('knife', { wave: 'square', freq: 900, freqEnd: 1500, sweepTime: 0.05, decay: 0.05, volume: 0.14, lowpass: 4200 });
audio.define('bolt-cast', { wave: 'sine', freq: 300, freqEnd: 620, sweepTime: 0.18, decay: 0.24, volume: 0.3, vibratoHz: 9, vibratoDepth: 14 });
audio.define('nova', { wave: 'noise', decay: 0.3, volume: 0.42, lowpass: 700 });
audio.define('strike', { wave: 'square', freq: 1600, freqEnd: 90, sweepTime: 0.14, decay: 0.18, volume: 0.4, lowpass: 3000 });
audio.define('hit', { wave: 'square', freq: 200, freqEnd: 90, sweepTime: 0.06, decay: 0.07, volume: 0.2, lowpass: 1400 });
audio.define('kill-pop', { wave: 'square', freq: 440, freqEnd: 110, sweepTime: 0.1, decay: 0.12, volume: 0.28, lowpass: 1800 });
audio.define('gem', { wave: 'triangle', freq: 880, freqEnd: 1320, sweepTime: 0.07, decay: 0.09, volume: 0.16 });
audio.define('hurt', { wave: 'square', freq: 160, freqEnd: 60, sweepTime: 0.12, decay: 0.2, volume: 0.45, lowpass: 800 });
audio.define('levelup', { wave: 'triangle', freq: 523, freqEnd: 1046, sweepTime: 0.24, decay: 0.36, volume: 0.42, vibratoHz: 8, vibratoDepth: 8 });
audio.define('choose', { wave: 'triangle', freq: 784, freqEnd: 1175, sweepTime: 0.1, decay: 0.16, volume: 0.36 });
audio.define('elite', { wave: 'square', freq: 110, freqEnd: 55, sweepTime: 0.4, decay: 0.55, volume: 0.5, lowpass: 500 });
audio.define('victory', { wave: 'triangle', freq: 659, freqEnd: 1319, sweepTime: 0.5, decay: 0.7, volume: 0.45, vibratoHz: 6, vibratoDepth: 10 });
audio.define('defeat', { wave: 'sine', freq: 220, freqEnd: 55, sweepTime: 0.8, decay: 1.0, volume: 0.45, lowpass: 900 });

// ---- juice wiring ---------------------------------------------------------
export const GAME_EVENTS = ['ui', 'run-start', 'enemy-hit', 'kill', 'elite-kill', 'gem', 'player-hurt',
  'level-up', 'choose', 'arc', 'knife', 'bolt', 'nova', 'strike', 'elite-spawn', 'victory', 'defeat'];
juice.wire('ui', { sfx: 'ui' });
juice.wire('run-start', { sfx: 'start' });
juice.wire('enemy-hit', { sfx: 'hit', burst: { count: 4, color: '#fff3c4', color2: '#ff9a5a', speed: 1.6, up: 1.2, ttl: 0.25, size: 0.06 } });
juice.wire('kill', { sfx: 'kill-pop', burst: { count: 10, color: '#b08aff', color2: '#fff', speed: 2.2, up: 1.8, ttl: 0.4 }, shake: 0.06 });
juice.wire('elite-kill', { sfx: 'kill-pop', burst: { count: 34, color: '#c060ff', color2: '#ffd76a', speed: 3.4, up: 2.6, ttl: 0.8, size: 0.12 }, shake: 0.5, hitstop: 0.12, text: 'ELITE DOWN!' });
juice.wire('gem', { sfx: 'gem', burst: { count: 5, color: '#6ee0ff', color2: '#fff', speed: 1.0, up: 2.0, ttl: 0.3, size: 0.05 } });
juice.wire('player-hurt', { sfx: 'hurt', shake: 0.45, hitstop: 0.05, burst: { count: 8, color: '#ff5a6e', color2: '#fff', speed: 2.0, up: 1.6, ttl: 0.35 } });
juice.wire('level-up', { sfx: 'levelup', burst: { count: 26, color: '#6ee0ff', color2: '#b08aff', speed: 2.2, up: 3.0, ttl: 0.8 }, text: 'LEVEL UP!' });
juice.wire('choose', { sfx: 'choose' });
juice.wire('arc', { sfx: 'slash' });
juice.wire('knife', { sfx: 'knife' });
juice.wire('bolt', { sfx: 'bolt-cast' });
juice.wire('nova', { sfx: 'nova', shake: 0.3, burst: { count: 18, color: '#c9a06a', color2: '#7a5a3c', speed: 3.2, up: 1.2, ttl: 0.5 } });
juice.wire('strike', { sfx: 'strike', shake: 0.18, burst: { count: 14, color: '#fff6b0', color2: '#6ee0ff', speed: 2.4, up: 3.4, ttl: 0.45 } });
juice.wire('elite-spawn', { sfx: 'elite', shake: 0.35, text: '⚠ ELITE ⚠' });
juice.wire('victory', { sfx: 'victory', burst: { count: 40, color: '#ffd76a', color2: '#6ee0ff', speed: 3.0, up: 3.4, ttl: 1.1 } });
juice.wire('defeat', { sfx: 'defeat' });
window.__juiceCheck = () => juice.check(GAME_EVENTS);
window.__audioGate = async () => {
  const bad = [];
  for (const name of ['ui', 'start', 'slash', 'knife', 'bolt-cast', 'nova', 'strike', 'hit', 'kill-pop', 'gem', 'hurt', 'levelup', 'choose', 'elite', 'victory', 'defeat']) {
    const r = await audio.renderOffline(name);
    if (r.peak < 0.01 || r.clipped > 0 || r.duration > 2.5) bad.push(`${name}: peak=${r.peak.toFixed(2)} clipped=${r.clipped} dur=${r.duration.toFixed(2)}`);
  }
  return bad;
};

// ---- battle music ---------------------------------------------------------
const N = (note, wave = 'triangle', vol = 1, dur) => ({ note, wave, vol, dur });
const BATTLE_TUNE = {
  bpm: 138,
  steps: [
    [N(-24, 'square', 0.8, 0.1), N(0)], null, [N(-24, 'square', 0.5, 0.08)], [N(3)],
    [N(-17, 'square', 0.8, 0.1), N(7)], null, [N(3)], null,
    [N(-24, 'square', 0.8, 0.1), N(10)], null, [N(7)], [N(3)],
    [N(-19, 'square', 0.8, 0.1), N(2)], null, [N(5)], null,
    [N(-24, 'square', 0.8, 0.1), N(0)], null, [N(-24, 'square', 0.5, 0.08)], [N(3)],
    [N(-17, 'square', 0.8, 0.1), N(7)], null, [N(10)], null,
    [N(-15, 'square', 0.8, 0.1), N(12)], null, [N(10)], [N(7)],
    [N(-19, 'square', 0.8, 0.1), N(5)], null, [N(3)], [N(2)],
  ],
};
music.volume = 0.22;

// ---- run state + fx adapter ----------------------------------------------
const CHAR_ICONS = { ronin: '🥷', archer: '🏹', mage: '🔮', brute: '🔨' };
let run = null;
let player = null;             // Actor
let overTimer = 0;             // delay before results screen
const dyn = new THREE.Group(); // everything owned by the current run
scene.add(dyn);
const critters = new Map();    // enemy -> {root, update}
const dying = [];              // shrink-out corpses
const gemGeo = new THREE.OctahedronGeometry(0.13);
const gemMat = toonMaterial('#6ee0ff', { rim: 1.0, rimColor: '#ffffff' });
const eliteGemMat = toonMaterial('#ffd76a', { rim: 1.0, rimColor: '#ffffff' });
const knifeGeo = new THREE.BoxGeometry(0.06, 0.06, 0.42);
const knifeMat = toonMaterial('#d8e4f0', { rim: 0.8, rimColor: '#ffffff' });
const boltMat = toonMaterial('#c060ff', { rim: 1.0, rimColor: '#ffffff' });
const orbGeo = new THREE.BoxGeometry(0.1, 0.34, 0.16);
const orbMat = toonMaterial('#b08aff', { rim: 0.9, rimColor: '#ffffff' });
const arcMat = new THREE.MeshBasicMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
const novaMat = new THREE.MeshBasicMaterial({ color: '#e8c9a0', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
const flashFX = [];            // transient weapon meshes {mesh, ttl, life, grow}
const orbVisuals = [];         // persistent orbit blades
const hurtEl = document.getElementById('hurtflash');
const sfxThrottle = {};
const throttled = (ev, data, ms = 70) => {
  const now = performance.now();
  if (now - (sfxThrottle[ev] || 0) < ms) {
    if (data.pos) { const fx = juice.table.get(ev); if (fx?.burst) vfx.burst(data.pos, fx.burst); }
    return;
  }
  sfxThrottle[ev] = now;
  juice.emit(ev, data);
};

const up = (p) => new THREE.Vector3(p.x, 0.55, p.z);
const fxAdapter = {
  spawn(e) {
    const c = makeCritter(e.def.visual);
    c.root.position.copy(e.pos);
    dyn.add(c.root);
    critters.set(e, c);
    if (e.def.elite) juice.emit('elite-spawn', { pos: up(e.pos) });
  },
  hit(e, dmg) {
    throttled('enemy-hit', { pos: up(e.pos) });
    // scale-pop, not material tint: critter materials are CACHED per species,
    // so tinting one would flash every critter of that kind on screen
    const c = critters.get(e);
    if (c) c._pop = 0.14;
    if (dmg >= 20) vfx.text(up(e.pos), String(Math.round(dmg)), camera, { color: '#ffd76a', ttl: 0.5, rise: 30 });
  },
  kill(e) {
    juice.emit(e.def.elite ? 'elite-kill' : 'kill', { pos: up(e.pos) });
    const c = critters.get(e);
    if (c) { critters.delete(e); dying.push({ root: c.root, life: 0 }); }
  },
  despawn(e) {
    const c = critters.get(e);
    if (c) { critters.delete(e); dyn.remove(c.root); }
  },
  gemSpawn(g) {
    const m = new THREE.Mesh(gemGeo, g.xp >= 10 ? eliteGemMat : gemMat);
    m.position.copy(g.pos).setY(0.25);
    dyn.add(m);
    g._vis = m;
  },
  gemCollect(g) {
    throttled('gem', { pos: g._vis ? g._vis.position : up(g.pos) }, 50);
    if (g._vis) dyn.remove(g._vis);
  },
  playerHurt() {
    juice.emit('player-hurt', { pos: up(run.playerPos) });
    player?.flash(0.12);
    hurtEl.style.opacity = '1';
    setTimeout(() => { hurtEl.style.opacity = '0'; }, 180);
  },
  levelUp() { juice.emit('level-up', { pos: up(run.playerPos) }); },
  weaponFX(kind, data) {
    if (kind === 'arc') {
      juice.emit('arc', {});
      const ang = Math.atan2(data.dir.x, data.dir.z);
      const half = THREE.MathUtils.degToRad(data.arc / 2);
      // sector centered on -Y so that after laying flat it points +Z; then
      // rotation.y = ang aims it at the target like any other object
      const geo = new THREE.RingGeometry(data.radius * 0.35, data.radius, 24, 1, -Math.PI / 2 - half, half * 2);
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, arcMat.clone());
      m.rotation.y = ang;
      m.position.copy(run.playerPos).setY(0.12);
      dyn.add(m);
      flashFX.push({ mesh: m, ttl: 0.18, life: 0 });
      if (player && !moving) { player.heading = ang; player.root.rotation.y = ang; player.attack(); }
    } else if (kind === 'nova') {
      juice.emit('nova', { pos: up(run.playerPos) });
      const m = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.5, 32), novaMat.clone());
      m.rotation.x = -Math.PI / 2;
      m.position.copy(run.playerPos).setY(0.1);
      dyn.add(m);
      flashFX.push({ mesh: m, ttl: 0.3, life: 0, grow: data.radius });
      if (player && !moving) player.attack();
    } else if (kind === 'strike') {
      juice.emit('strike', { pos: up(data.pos) });
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 7, 0.12), new THREE.MeshBasicMaterial({ color: '#fff6b0' }));
      m.position.copy(data.pos).setY(3.5);
      dyn.add(m);
      flashFX.push({ mesh: m, ttl: 0.14, life: 0 });
    }
  },
  projSpawn(p) {
    if (p.kind === 'knife') {
      throttled('knife', {});
      p._vis = new THREE.Mesh(knifeGeo, knifeMat);
    } else {
      juice.emit('bolt', {});
      p._vis = facetBall(0.14, boltMat, [1, 1, 1.5], [6, 4]);
    }
    p._vis.position.copy(p.pos);
    dyn.add(p._vis);
  },
  projDie(p) { if (p._vis) dyn.remove(p._vis); },
  victory() { juice.emit('victory', { pos: up(run.playerPos) }); music.stop(); overTimer = 1.6; },
  defeat() { juice.emit('defeat', {}); music.stop(); player?.setState('death'); overTimer = 1.6; },
};

// ---- HUD ------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const hud = { hp: $('hpfill'), xp: $('xpfill'), timer: $('timer'), kills: $('killct'), gold: $('goldct'), lvl: $('lvltag'), weapons: $('weapons'), name: $('charname') };
let weaponSig = '';
function updateHUD() {
  hud.hp.style.width = `${(run.stats.hp / run.stats.maxHp) * 100}%`;
  hud.xp.style.width = `${(run.xp / run.xpNeed) * 100}%`;
  const left = Math.max(0, RUN_LENGTH - run.time);
  hud.timer.textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  hud.kills.textContent = `☠ ${run.kills}`;
  hud.gold.textContent = `◆ ${run.gold}`;
  hud.lvl.textContent = `Lv ${run.level}`;
  const sig = [...run.weapons].map(([id, l]) => id + l).join();
  if (sig !== weaponSig) {
    weaponSig = sig;
    hud.weapons.innerHTML = [...run.weapons].map(([id, l]) =>
      `<div class="wslot">${WEAPONS[id].icon}<span class="pips">${'●'.repeat(l)}${'○'.repeat(5 - l)}</span></div>`).join('');
  }
}

// ---- character select -----------------------------------------------------
const rosterEl = $('roster');
const charKeys = Object.keys(PLAYABLES);
let selIdx = 0;
function renderRoster() {
  $('goldbal').textContent = `◆ ${meta.gold}`;
  rosterEl.innerHTML = charKeys.map((k, i) => {
    const c = PLAYABLES[k];
    const locked = !meta.unlocked.includes(k);
    return `<div class="card ${i === selIdx ? 'sel' : ''}" data-i="${i}">
      <div class="face">${CHAR_ICONS[k]}</div><div class="nm">${c.name}</div>
      <div class="bl">${c.blurb}<br>❤ ${c.hp} · ${WEAPONS[c.weapon].icon} ${WEAPONS[c.weapon].name}</div>
      ${locked ? `<div class="lock">🔒<span class="cost">◆ ${c.cost}</span></div>` : ''}</div>`;
  }).join('');
  const k = charKeys[selIdx];
  $('titlestart').textContent = meta.unlocked.includes(k) ? `press E to fight as ${PLAYABLES[k].name}`
    : meta.gold >= PLAYABLES[k].cost ? `press E to unlock (◆ ${PLAYABLES[k].cost})` : `need ◆ ${PLAYABLES[k].cost}`;
  const best = meta.best[k];
  $('beststat').textContent = best ? `best as ${PLAYABLES[k].name}: ${Math.floor(best / 60)}:${String(Math.floor(best % 60)).padStart(2, '0')} · total wins ${meta.wins}` : meta.wins ? `total wins ${meta.wins}` : '';
  for (const el of rosterEl.querySelectorAll('.card')) {
    el.onclick = () => { selIdx = +el.dataset.i; juice.emit('ui', {}); renderRoster(); };
  }
}
function confirmTitle() {
  const k = charKeys[selIdx];
  if (!meta.unlocked.includes(k)) {
    if (meta.gold >= PLAYABLES[k].cost) {
      meta.gold -= PLAYABLES[k].cost;
      meta.unlocked.push(k);
      save.store(meta);
      juice.emit('choose', {});
      renderRoster();
    } else juice.emit('ui', {});
    return;
  }
  startRun(k);
}

// ---- run lifecycle --------------------------------------------------------
function clearRun() {
  for (const c of critters.values()) dyn.remove(c.root);
  critters.clear();
  dying.length = 0;
  flashFX.length = 0;
  for (const o of orbVisuals) dyn.remove(o);
  orbVisuals.length = 0;
  dyn.clear();
  if (player) { scene.remove(player.root); player = null; }
  weaponSig = '';
}
async function startRun(charKey) {
  clearRun();
  run = new Run({ character: charKey, fx: fxAdapter });
  overTimer = 0;
  try {
    player = await Actor.spawn(charKey, { walkSpeed: 1.4, runSpeed: 3.2 });
    player.opts.walkSpeed = run.stats.baseSpeed;    // sync anim to real speed
    player.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    scene.add(player.root);
  } catch (e) { console.warn('[nightbloom] no actor:', e.message); }
  hud.name.textContent = PLAYABLES[charKey].name;
  juice.emit('run-start', {});
  try { music.play(BATTLE_TUNE); } catch {}
  shell.go('play');
}
function endRun() {
  const won = run.over === 'victory';
  const earned = run.gold + (won ? 150 : 0);
  meta.gold += earned;
  if (won) meta.wins++;
  const t = won ? RUN_LENGTH : run.time;
  if (!meta.best[run.character] || t > meta.best[run.character]) meta.best[run.character] = t;
  save.store(meta);
  $('goTitle').textContent = won ? 'Dawn breaks!' : 'Defeat';
  $('goTitle').style.color = won ? '#ffd76a' : '#ff7a8a';
  $('goSub').textContent = won ? 'you survived the nightbloom' : 'the bloom takes another';
  $('stats').innerHTML =
    `survived <b>${Math.floor(run.time / 60)}:${String(Math.floor(run.time % 60)).padStart(2, '0')}</b><br>` +
    `level <b>${run.level}</b> · kills <b>${run.kills}</b><br>` +
    `gold earned <b>◆ ${earned}</b>${won ? ' <small>(+150 dawn bonus)</small>' : ''}`;
  shell.go('gameover');
}

// ---- level-up UI ----------------------------------------------------------
const cardsEl = $('cards');
let pendingChoices = [];
function showLevelUp() {
  pendingChoices = run.choices();
  if (!pendingChoices.length) { run.pendingLevelUps = 0; shell.go('play'); return; }
  $('lvlupsub').textContent = `level ${run.level}${run.pendingLevelUps > 1 ? ` · ${run.pendingLevelUps} picks banked` : ''}`;
  cardsEl.innerHTML = pendingChoices.map((c, i) =>
    `<div class="up" data-i="${i}"><div class="lbl">${c.label}</div><div class="dsc">${c.desc}</div><div class="key">press ${i + 1}</div></div>`).join('');
  for (const el of cardsEl.querySelectorAll('.up')) el.onclick = () => pick(+el.dataset.i);
  if (shell.currentName !== 'levelup') shell.go('levelup');
}
function pick(i) {
  if (!pendingChoices[i]) return;
  run.applyChoice(pendingChoices[i]);
  juice.emit('choose', {});
  run.pendingLevelUps--;
  if (run.pendingLevelUps > 0) showLevelUp();
  else shell.go('play');
}
addEventListener('keydown', (e) => {
  if (shell.currentName === 'levelup' && ['1', '2', '3'].includes(e.key)) pick(+e.key - 1);
});

// ---- scenes ---------------------------------------------------------------
let moving = false;
const _dir = new THREE.Vector3();
shell.scene('title', {
  domId: 'title',
  enter() { music.stop(); renderRoster(); },
  update() {
    if (input.pressed('left')) { selIdx = (selIdx + charKeys.length - 1) % charKeys.length; juice.emit('ui', {}); renderRoster(); }
    if (input.pressed('right')) { selIdx = (selIdx + 1) % charKeys.length; juice.emit('ui', {}); renderRoster(); }
    if (input.pressed('interact') || input.pressed('attack')) confirmTitle();
  },
});
shell.scene('play', {
  enter() {
    $('hud').style.display = 'block';
    if (run && !run.over && !music.timer) { try { music.play(BATTLE_TUNE); } catch {} }
  },
  update(dt) {
    if (run.over) {                       // linger a beat on the kill/death
      overTimer -= dt;
      syncVisuals(dt);
      if (overTimer <= 0) endRun();
      return;
    }
    if (input.pressed('pause')) { juice.emit('ui', {}); shell.go('paused'); return; }
    const m = input.move;
    _dir.set(m.x, 0, m.z);
    moving = _dir.lengthSq() > 0;
    run.update(dt, moving ? _dir : null);
    if (run.pendingLevelUps > 0 && !run.over) { showLevelUp(); if (shell.currentName === 'levelup') return; }
    syncVisuals(dt);
    updateHUD();
  },
});
// hud visible under overlays; world frozen (no run.update) in these scenes
shell.scene('levelup', { domId: 'levelup', enter() { $('hud').style.display = 'block'; } });
shell.scene('paused', {
  domId: 'pause',
  enter() { music.stop(); },
  update() { if (input.pressed('pause') || input.pressed('interact')) { juice.emit('ui', {}); shell.go('play'); } },
});
shell.scene('gameover', {
  domId: 'gameover',
  enter() { $('hud').style.display = 'none'; },
  update() { if (input.pressed('interact') || input.pressed('attack')) { juice.emit('ui', {}); // evidence capture: game frames POST to the dev server like the lab's
window.__shot = async (name, opts = {}) => {
  tick(1 / 60);
  const dataUrl = renderer.domElement.toDataURL('image/png');
  const res = await fetch('/__shot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, dataUrl }) });
  return res.json();
};
shell.go('title'); } },
});

// ---- per-frame visual sync ------------------------------------------------
function syncVisuals(dt) {
  const t = run.time;
  // player actor follows the sim position
  if (player) {
    player.root.position.copy(run.playerPos);
    if (moving && !run.over) {
      const ang = Math.atan2(run.playerVel.x, run.playerVel.z);
      player.heading = ang;
      player.root.rotation.y = ang;
      if (player.state === 'idle') player.setState('walk');
      if (player.state === 'walk') player.actions.walk.timeScale = 1.4;
    } else if (player.state === 'walk') player.setState('idle');
    player.update(dt);                 // advances actor time (attack unlock) + mixer + constraints
    player.root.position.copy(run.playerPos); // sim owns position; undo velocity drift
  }
  lamp.position.set(run.playerPos.x, 2.6, run.playerPos.z);
  // enemies
  for (const [e, c] of critters) {
    c.root.position.copy(e.pos);
    if (e.vel.lengthSq() > 0.01) c.root.rotation.y = Math.atan2(e.vel.x, e.vel.z);
    if (c._pop > 0) {
      c._pop -= dt;
      const k = Math.max(0, c._pop / 0.14);
      c.root.scale.setScalar(1 + 0.3 * Math.sin(k * Math.PI));
    } else if (c.root.scale.x !== 1) c.root.scale.setScalar(1);
    c.update(dt, t);
  }
  for (let i = dying.length - 1; i >= 0; i--) {
    const d = dying[i];
    d.life += dt;
    const s = Math.max(0.001, 1 - d.life / 0.18);
    d.root.scale.setScalar(s);
    if (d.life >= 0.18) { dyn.remove(d.root); dying.splice(i, 1); }
  }
  // gems bob
  for (const g of run.gems) if (g._vis) {
    g._vis.position.set(g.pos.x, 0.25 + Math.sin(t * 4 + g.pos.x * 3) * 0.06, g.pos.z);
    g._vis.rotation.y = t * 2.5;
  }
  // projectiles
  for (const p of run.projectiles) if (p._vis) {
    p._vis.position.copy(p.pos);
    p._vis.lookAt(p.pos.x + p.dir.x, p.pos.y, p.pos.z + p.dir.z);
  }
  // orbit blades
  const orbSt = run.weaponState.get('orbs');
  const want = orbSt?.orbPos?.length || 0;
  while (orbVisuals.length < want) { const m = new THREE.Mesh(orbGeo, orbMat); dyn.add(m); orbVisuals.push(m); }
  while (orbVisuals.length > want) dyn.remove(orbVisuals.pop());
  orbVisuals.forEach((m, i) => {
    const o = orbSt.orbPos[i];
    m.position.set(o.x, 0.65, o.z);
    m.rotation.y = orbSt.angle + (i / want) * Math.PI * 2;
  });
  // transient weapon fx
  for (let i = flashFX.length - 1; i >= 0; i--) {
    const f = flashFX[i];
    f.life += dt;
    const u = f.life / f.ttl;
    if (u >= 1) { dyn.remove(f.mesh); flashFX.splice(i, 1); continue; }
    f.mesh.material.opacity = 0.85 * (1 - u);
    if (f.grow) { const s = 1 + (f.grow / 0.5 - 1) * u; f.mesh.scale.set(s, s, s); }
  }
}

// ---- main loop ------------------------------------------------------------
const clock = new THREE.Clock();
const camTarget = new THREE.Vector3();
function tick(rawDt) {
  const dt = rawDt * hitstop.scale(rawDt);
  input.pollGamepad();
  shell.update(dt);
  input.endFrame();
  shake.update(rawDt);
  vfx.update(dt, camera);
  const center = run ? run.playerPos : camTarget;
  petals.update(dt, clock.elapsedTime, center);
  camTarget.lerp(center, 1 - Math.exp(-7 * rawDt));
  camera.position.set(camTarget.x + shake.offset.x, 11.5 + shake.offset.y, camTarget.z + 7.6);
  camera.lookAt(camTarget.x, 0.4, camTarget.z);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(() => tick(Math.min(clock.getDelta(), 0.05)));
window.__tick = tick;
window.__game = {
  get run() { return run; }, get player() { return player; }, get meta() { return meta; },
  input, juice, shell, startRun, save,
};
// evidence capture: game frames POST to the dev server like the lab's
window.__shot = async (name, opts = {}) => {
  tick(1 / 60);
  const dataUrl = renderer.domElement.toDataURL('image/png');
  const res = await fetch('/__shot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, dataUrl }) });
  return res.json();
};
shell.go('title');
