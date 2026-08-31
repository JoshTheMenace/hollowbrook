import * as THREE from 'three';
import { buildVignette } from '../scene.js';
import { Pipeline } from '../core/post.js';
import { shadowTintActive } from '../core/toon.js';
import { sunPosition, fillPosition, shadowRadius } from '../core/sunrig.js';
import { PAL } from '../palette.js';
import { skyTexture } from '../textures.js';
import { Hero } from './hero.js';
import { DayNight } from './daynight.js';
import { NightBattle, NIGHT_EVENTS } from './night.js';
import { Feel } from './feel.js';
import { Actor } from '@forge/game/actor.js';
import { AdaptiveMusic, SfxPlayer } from '@forge/soundforge/runtime.js';
import { SFX } from '@forge/soundforge/content/sfx-core.js';
import { LOOP } from '@forge/soundforge/content/loop-nightbloom.js';

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

// ---- feel + sound ---------------------------------------------------------
// SoundForge is the game's audio — the deprecated engine/audio.js is banned
// here, and check-feel fails any emitted event without a consumer.
const feel = new Feel({ scene, camera, sfx: null });
export const GAME_EVENTS = [...NIGHT_EVENTS, 'interact', 'night-falls', 'dawn'];
feel.wire('enemy-hit', { sfx: 'impact-hit', throttleMs: 70, burst: { count: 4, color: '#fff3c4', color2: '#ff9a5a', speed: 1.6, up: 1.2, ttl: 0.25, size: 0.06 } });
feel.wire('kill', { sfx: 'impact-hit', sfxOpts: { vol: 0.7 }, throttleMs: 60, burst: { count: 10, color: '#b08aff', color2: '#fff', speed: 2.2, up: 1.8, ttl: 0.4 }, shake: 0.05 });
feel.wire('elite-kill', { sfx: 'impact-heavy', burst: { count: 34, color: '#c060ff', color2: '#ffd76a', speed: 3.4, up: 2.6, ttl: 0.8, size: 0.12 }, shake: 0.5, hitstop: 0.12, text: 'ELITE DOWN' });
feel.wire('elite-spawn', { sfx: 'impact-heavy', sfxOpts: { vol: 0.6, rate: 0.7 }, shake: 0.35, text: '⚠' });
feel.wire('gem', { sfx: 'pickup-gem', sfxOpts: { vol: 0.5 }, throttleMs: 50, burst: { count: 5, color: '#6ee0ff', color2: '#fff', speed: 1.0, up: 2.0, ttl: 0.3, size: 0.05 } });
feel.wire('player-hurt', { sfx: 'hurt', shake: 0.45, hitstop: 0.05, burst: { count: 8, color: '#ff5a6e', color2: '#fff', speed: 2.0, up: 1.6, ttl: 0.35 } });
feel.wire('level-up', { sfx: 'level-up', burst: { count: 26, color: '#6ee0ff', color2: '#b08aff', speed: 2.2, up: 3.0, ttl: 0.8 } });
feel.wire('arc', { sfx: 'slash', throttleMs: 80 });
feel.wire('nova', { sfx: 'impact-heavy', sfxOpts: { vol: 0.7 }, shake: 0.3, burst: { count: 18, color: '#c9a06a', color2: '#7a5a3c', speed: 3.2, up: 1.2, ttl: 0.5 } });
feel.wire('strike', { sfx: 'thunder-strike', sfxOpts: { vol: 0.7 }, shake: 0.18, burst: { count: 14, color: '#fff6b0', color2: '#6ee0ff', speed: 2.4, up: 3.4, ttl: 0.45 } });
feel.wire('knife', { sfx: 'slash', sfxOpts: { vol: 0.35, rate: 1.4 }, throttleMs: 90 });
feel.wire('bolt', { sfx: 'magic-bolt', sfxOpts: { vol: 0.6 }, throttleMs: 120 });
feel.wire('victory', { sfx: 'victory', burst: { count: 40, color: '#ffd76a', color2: '#6ee0ff', speed: 3.0, up: 3.4, ttl: 1.1 } });
feel.wire('defeat', { sfx: 'defeat' });
feel.wire('interact', { sfx: 'ui-confirm' });
feel.wire('night-falls', { sfx: 'defeat', sfxOpts: { vol: 0.4, rate: 1.6 } });
feel.wire('dawn', { sfx: 'victory', sfxOpts: { vol: 0.4, rate: 1.3 } });
window.__feelCheck = () => feel.check(GAME_EVENTS);

// Audio unlocks on the first user gesture (autoplay policy); everything else
// works without it, and the lint can still verify wiring pre-unlock.
let music = null, sfxPlayer = null, audioReady = false, audioLoading = false;
async function unlockAudio() {
  if (audioReady || audioLoading) return;
  audioLoading = true;
  try {
    music = new AdaptiveMusic();
    await music.ctx.resume();
    sfxPlayer = new SfxPlayer(music.ctx);
    await sfxPlayer.load(SFX);
    feel.sfx = sfxPlayer;
    await music.load(LOOP);
    music.start();
    music.setIntensity(0.18);
    audioReady = true;
    console.log('[game] audio unlocked: 9 stems +', sfxPlayer.buffers.size, 'sfx');
  } catch (e) { console.error('[game] audio unlock failed:', e); }
  audioLoading = false;
}
window.addEventListener('pointerdown', unlockAudio, { once: false });
window.addEventListener('keydown', unlockAudio, { once: false });

// ---- night battle ---------------------------------------------------------
let battle = null;
let choosing = false;          // level-up cards up: sim pauses, player decides
const _move = new THREE.Vector3();
const cardsEl = document.querySelector('#cards');
const levelupEl = document.querySelector('#levelup');

function startNight(rng) {
  battle = new NightBattle({
    scene, hero, character: 'ronin', groundY: 0, rng,
    onEvent: (type, data) => {
      feel.emit(type, data);
      if (type === 'arc' && actor && hero.velocity.lengthSq() < 0.3) actor.attack();
      if (type === 'player-hurt') flashHurt();
      if (type === 'level-up') showChoices();
      if (type === 'victory' || type === 'defeat') endNight(type);
    },
  });
  hero.external = true;
  hero.battleCam = true;       // pull back + up: the horde must be ON SCREEN
  feel.emit('night-falls', {});
}

// The upgrade draft is the genre's defining decision — it is the PLAYER's.
// (The audit named the old Math.random() autopick the worst line in the
// project; the hard rule now: no player-facing choice resolved by RNG.)
let pendingChoices = [];
function showChoices() {
  const r = battle.run;
  if (r.pendingLevelUps <= 0) return;
  pendingChoices = r.choices();
  if (!pendingChoices.length) { r.pendingLevelUps = 0; return; }
  cardsEl.innerHTML = pendingChoices.map((c, i) =>
    `<div class="up" data-i="${i}"><div class="lbl">${c.label}</div><div class="dsc">${c.desc}</div><div class="key">${i + 1}</div></div>`).join('');
  for (const el of cardsEl.querySelectorAll('.up')) el.onclick = () => pick(+el.dataset.i);
  levelupEl.style.display = 'flex';
  choosing = true;
}
function pick(i) {
  if (!choosing || !pendingChoices[i]) return;
  const r = battle.run;
  r.applyChoice(pendingChoices[i]);
  r.pendingLevelUps--;
  feel.emit('interact', {});
  if (r.pendingLevelUps > 0) { showChoices(); return; }
  levelupEl.style.display = 'none';
  choosing = false;
}

function endNight(result) {
  phaseEl.textContent = result === 'victory' ? 'dawn — survived' : 'the bloom takes another';
  levelupEl.style.display = 'none';
  choosing = false;
  setTimeout(() => {
    battle?.dispose();
    battle = null;
    hero.external = false;
    hero.battleCam = false;
    daynight.fadeTo('day', 5);
    phaseEl.textContent = 'day';
    feel.emit('dawn', {});
    music?.setIntensity(0.18, 3);
  }, 2200);
}

const hurtEl = document.querySelector('#hurtflash');
function flashHurt() {
  if (!hurtEl) return;
  hurtEl.style.opacity = '1';
  setTimeout(() => { hurtEl.style.opacity = '0'; }, 180);
}

window.addEventListener('keydown', (e) => {
  if (choosing && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) { pick(+e.code.slice(5) - 1); return; }
  if (e.code === 'KeyT') {                      // cycle phases (dev)
    const cur = daynight.fade?.name ?? daynight.current ?? 'day';
    const next = { day: 'dusk', dusk: 'night', night: 'day' }[cur];
    daynight.fadeTo(next, 3);
    phaseEl.textContent = next;
    music?.setIntensity({ day: 0.18, dusk: 0.45, night: 0.55 }[next] ?? 0.18, 2.5);
    if (next === 'night' && !battle) startNight();
    if (next === 'day' && battle) { battle.dispose(); battle = null; hero.external = false; hero.battleCam = false; choosing = false; levelupEl.style.display = 'none'; }
  }
  if (e.code === 'KeyE' && nearInteract) { feel.emit('interact', {}); nearInteract.action(); }
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
let musicTimer = 0;
function tick(rawDt) {
  const dt = rawDt * feel.hitstop.scale(rawDt);   // hit-stop bites everything
  if (battle && !choosing) {
    const inp = hero.moveInput();
    _move.set(inp.x, 0, inp.z);
    battle.update(dt, _move.lengthSq() > 0 ? _move : null);
    const r = battle.run;
    phaseEl.textContent = `night · ❤ ${Math.max(0, Math.round(r.stats.hp))}/${r.stats.maxHp} · lv ${r.level} · ☠ ${r.kills} · ${Math.max(0, Math.ceil(480 - r.time))}s`;
    musicTimer -= dt;
    if (music && musicTimer <= 0) {               // the dial follows the fight
      music.setIntensity(battle.pressure());
      musicTimer = 0.8;
    }
  }
  hero.update(dt);
  vignette.update(dt);
  daynight.update(dt, hero.position);
  feel.update(dt, rawDt);
  camera.position.add(feel.shake.offset);         // trauma shake on the play camera
  nearInteract = battle ? null : findInteract();
  promptEl.textContent = nearInteract ? `E · ${nearInteract.label ?? nearInteract.name}` : '';
  pipeline.render();
}
requestAnimationFrame(function loop() {
  tick(Math.min(clock.getDelta(), 0.05));
  requestAnimationFrame(loop);
});

// ---- legibility instrument ------------------------------------------------
// Frustum containment is not legibility (review r1, gate-blindness 3): a
// threat must also OCCUPY pixels and SEPARATE from its backdrop. Two reads
// per sample: an ID pass (each enemy rendered a flat unique red index to an
// offscreen target — pixel share, occlusion-true) and the frame the player
// actually saw (canvas is preserved; luma judged in sRGB) for contrast.
const LEGIBLE = {
  minPx: 14, minSep: 0.09,        // a chaff threat at combat range
  eliteMinPx: 56, eliteMinSep: 0.12, // an elite must read AS an elite
  combatRange: 12,                // m — the threats that can kill you soon
};
let _idRT = null, _idBuf = null, _lumaCanvas = null, _idBlack = null;
const _idMats = [];
function measureLegibility() {
  if (!battle) return null;
  const W = 320, H = Math.max(2, Math.round(W / camera.aspect / 2) * 2);
  if (!_idRT || _idRT.width !== W || _idRT.height !== H) {
    _idRT?.dispose();
    _idRT = new THREE.WebGLRenderTarget(W, H);
    _idBuf = new Uint8Array(W * H * 4);
    _lumaCanvas = document.createElement('canvas');
    _lumaCanvas.width = W; _lumaCanvas.height = H;
  }
  // the frame the player saw, downscaled to the ID pass grid
  const lctx = _lumaCanvas.getContext('2d', { willReadFrequently: true });
  lctx.drawImage(renderer.domElement, 0, 0, W, H);
  const shown = lctx.getImageData(0, 0, W, H).data;
  // ID pass: threats flat-colored by index, everything else black, no sky/fog
  const pairs = [...battle.critters.entries()];   // [enemy, critter]
  const owner = new Map();
  pairs.forEach(([, c], i) => c.root.traverse((o) => { if (o.isMesh) owner.set(o, i); }));
  _idBlack ??= new THREE.MeshBasicMaterial({ fog: false });
  _idBlack.color.setRGB(0, 0, 0);
  const restore = [];
  scene.traverse((o) => {
    if (o.isMesh) {
      restore.push([o, o.material]);
      const i = owner.get(o);
      if (i === undefined) o.material = _idBlack;
      else {
        if (!_idMats[i]) { _idMats[i] = new THREE.MeshBasicMaterial({ fog: false }); }
        _idMats[i].color.setRGB((i + 1) / 255, 0, 0);
        o.material = _idMats[i];
      }
    } else if ((o.isPoints || o.isLine || o.isSprite) && o.visible) {
      restore.push([o, null]);
      o.visible = false;
    }
  });
  const keepBg = scene.background, keepFog = scene.fog;
  scene.background = null; scene.fog = null;
  renderer.setRenderTarget(_idRT);
  renderer.render(scene, camera);   // instrument pass, not presentation
  renderer.readRenderTargetPixels(_idRT, 0, 0, W, H, _idBuf);
  renderer.setRenderTarget(null);
  scene.background = keepBg; scene.fog = keepFog;
  for (const [o, m] of restore) { if (m === null) o.visible = true; else o.material = m; }
  // per-enemy pixel share + bbox + own luma (RT rows are y-flipped vs canvas)
  const n = pairs.length;
  const px = new Array(n).fill(0);
  const rgb = Array.from({ length: n }, () => [0, 0, 0]);
  const box = Array.from({ length: n }, () => [W, H, -1, -1]);
  for (let p = 0; p < W * H; p++) {
    const id = _idBuf[p * 4];
    if (!id || id > n) continue;
    const i = id - 1;
    const x = p % W, ry = (p / W) | 0, y = H - 1 - ry;
    const k = (y * W + x) * 4;
    px[i]++;
    rgb[i][0] += shown[k]; rgb[i][1] += shown[k + 1]; rgb[i][2] += shown[k + 2];
    const b = box[i];
    if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y;
    if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
  }
  // redmean color distance in sRGB, normalized 0..1 — hue counts, so a green
  // threat on grey ground scores what the eye gets, not just brightness
  const redmean = (a, b) => {
    const rbar = (a[0] + b[0]) / 2;
    const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return Math.sqrt((2 + rbar / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rbar) / 256) * db * db) / 765;
  };
  const out = new Map();
  pairs.forEach(([e], i) => {
    let sep = 0;
    if (px[i] > 0) {
      const [x0, y0, x1, y1] = box[i];
      const back = [0, 0, 0];
      let bn = 0;
      for (let y = Math.max(0, y0 - 5); y <= Math.min(H - 1, y1 + 5); y++) {
        for (let x = Math.max(0, x0 - 5); x <= Math.min(W - 1, x1 + 5); x++) {
          if (_idBuf[((H - 1 - y) * W + x) * 4]) continue;   // another threat, not backdrop
          const k = (y * W + x) * 4;
          back[0] += shown[k]; back[1] += shown[k + 1]; back[2] += shown[k + 2];
          bn++;
        }
      }
      if (bn) sep = redmean(rgb[i].map((v) => v / px[i]), back.map((v) => v / bn));
    }
    const elite = !!e.def.elite;
    const okPx = px[i] >= (elite ? LEGIBLE.eliteMinPx : LEGIBLE.minPx);
    const okSep = sep >= (elite ? LEGIBLE.eliteMinSep : LEGIBLE.minSep);
    out.set(e, { px: px[i], sep: +sep.toFixed(3), elite, legible: okPx && okSep });
  });
  return out;
}
window.__legibility = () => {
  const m = measureLegibility();
  return m ? [...m.values()] : null;
};

// ---- play-camera gate -----------------------------------------------------
// Measured through the PLAY camera (free-camera captures are banned as
// gameplay evidence). Runs a scripted battle segment and reports:
//   visibleFrac — mean fraction of live threats inside the frustum
//   worstFrac   — the worst single frame
//   timeToSee   — frames until the nearest threat was on screen at spawn
// default 140s: the segment must cross the first elite spawn (120s) or the
// elite-legibility term never gets a frame to judge
const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
window.__playCheck = async (seconds = 140) => {
  // CANONICAL START — the result must not depend on how the game was driven
  // before the call. The review ran this mid-battle (their fights were live)
  // and got FAIL where the bundle's fresh-start run recorded PASS: a 20s
  // segment at t=0 samples the sparse opening wave, a mid-fight segment
  // samples dense waves whose slow spawns take >4s to walk into frame
  // (TRAPS.md, gate calibration). So: dispose any running battle, place the
  // hero on the canonical town->arena entry, seed the run (instrument
  // exemption — players always fight Math.random).
  if (battle) {
    battle.dispose();
    battle = null;
    hero.external = false;
    hero.battleCam = false;
    choosing = false;
    levelupEl.style.display = 'none';
  }
  hero.place(-30, 0, -Math.PI / 2);
  daynight.set('night');
  startNight(mulberry32(97));
  const frustum = new THREE.Frustum();
  const mat = new THREE.Matrix4();
  const pt = new THREE.Vector3();
  const samples = [];
  // spawn -> FIRST sight only. Re-entries are pursuit dynamics (a kiting
  // player always has trailing threats off-frame), not camera failure.
  let seeDelays = [], unseen = new Map(), seen = new WeakSet();
  const legSamples = [];              // per-sample legible fraction, combat range
  let eliteFrames = 0, eliteLegible = 0;
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i++) {
    // the sim's kiting bot (circle-strafe + hard dodge + gem sweep + wall
    // bias) — it must survive past the first elite (120s) or the elite
    // legibility term has nothing to judge
    const r = battle.run;
    const P = r.playerPos;
    let mx = 0, mz = 0, cx = 0, cz = 0, n = 0, nearest = 1e9;
    for (const e of r.enemies) {
      const d = Math.hypot(P.x - e.pos.x, P.z - e.pos.z);
      nearest = Math.min(nearest, d);
      if (d < 7) { cx += e.pos.x; cz += e.pos.z; n++; }
      if (d < 1.5) {
        const l = d || 1;
        mx += ((P.x - e.pos.x) / l) * (1.5 - d) * 3.5;
        mz += ((P.z - e.pos.z) / l) * (1.5 - d) * 3.5;
      }
    }
    if (n) {
      cx /= n; cz /= n;
      let ox = P.x - cx, oz = P.z - cz;
      const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
      const press = Math.max(-0.35, Math.min(2.5, (3.0 - nearest) / 1.4));
      mx += ox * press - oz; mz += oz * press + ox;
    }
    if (r.gems.length) {
      let best = null, bd = 1e9;
      for (const g of r.gems) {
        const d = (g.pos.x - P.x) ** 2 + (g.pos.z - P.z) ** 2;
        if (d < bd) { bd = d; best = g; }
      }
      const l = Math.sqrt(bd) || 1, w = nearest < 1.8 ? 0.6 : 1.4;
      mx += ((best.pos.x - P.x) / l) * w;
      mz += ((best.pos.z - P.z) / l) * w;
    }
    // stay off the arena walls: bias to centre near the edge
    const CX = (r.bounds.x0 + r.bounds.x1) / 2, CZ = (r.bounds.z0 + r.bounds.z1) / 2;
    if (Math.min(P.x - r.bounds.x0, r.bounds.x1 - P.x) < 2.5 || Math.min(P.z - r.bounds.z0, r.bounds.z1 - P.z) < 2.5) {
      const l = Math.hypot(CX - P.x, CZ - P.z) || 1;
      mx += ((CX - P.x) / l) * 2.0;
      mz += ((CZ - P.z) / l) * 2.0;
    }
    const ml = Math.hypot(mx, mz) || 1;
    hero.virtual.move = { x: mx / ml, z: mz / ml };
    if (choosing) pick(0);   // the CHECK's bot picks; a player never auto-picks
    tick(1 / 60);
    // measure through the play camera, post-render
    camera.updateMatrixWorld();
    mat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(mat);
    let vis = 0, live = 0;
    for (const e of battle.run.enemies) {
      live++;
      const inView = frustum.containsPoint(pt.set(e.pos.x, 0.5, e.pos.z));
      if (inView) {
        vis++;
        if (!seen.has(e)) {
          seen.add(e);
          if (unseen.has(e)) { seeDelays.push(i - unseen.get(e)); unseen.delete(e); }
        }
      } else if (!seen.has(e) && !unseen.has(e)) unseen.set(e, i);
    }
    if (live >= 5 && i > 120) samples.push(vis / live);  // skip cam transition + sparse frames (a 1-of-3 ratio is noise, not framing)
    // legibility sample: every 15th frame after the camera settles
    if (i > 120 && i % 15 === 0) {
      const leg = measureLegibility();
      if (leg) {
        let inRange = 0, ok = 0;
        for (const e of battle.run.enemies) {
          const s = leg.get(e);
          if (!s) continue;
          const d = Math.hypot(P.x - e.pos.x, P.z - e.pos.z);
          if (d <= LEGIBLE.combatRange) { inRange++; if (s.legible) ok++; }
          if (s.elite && frustum.containsPoint(pt.set(e.pos.x, 0.8, e.pos.z))) {
            eliteFrames++;
            if (s.legible) eliteLegible++;
          }
        }
        if (inRange >= 3) legSamples.push(ok / inRange);
      }
    }
    if (battle.run.over) break;
  }
  hero.virtual.move = { x: 0, z: 0 };
  const mean = samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length);
  const sorted = samples.slice().sort((a, b) => a - b);
  const worst = sorted[Math.floor(sorted.length * 0.1)] ?? 0;   // p10, not a single-frame outlier
  const p90see = seeDelays.sort((a, b) => a - b)[Math.floor(seeDelays.length * 0.9)] ?? 0;
  const legMean = legSamples.reduce((a, b) => a + b, 0) / Math.max(1, legSamples.length);
  const eliteFrac = eliteFrames ? eliteLegible / eliteFrames : null;
  return {
    frames: samples.length,
    visibleFrac: +mean.toFixed(3),
    p10Frac: +worst.toFixed(3),
    p90TimeToSeeSec: +(p90see / 60).toFixed(2),
    // legibility: pixel share + luma separation, not frustum containment
    legSamples: legSamples.length,
    legibleFrac: +legMean.toFixed(3),
    eliteFrames,
    eliteLegibleFrac: eliteFrac === null ? null : +eliteFrac.toFixed(3),
    pass: mean >= 0.8 && worst >= 0.4 && p90see / 60 <= 4
      && legSamples.length >= 5 && legMean >= 0.6
      && (eliteFrames === 0 || eliteFrac >= 0.9),
  };
};

// ---- input-latency probe --------------------------------------------------
// A real key event through the real listeners: how many ticks until the
// hero's position responds? 1 = consumed next tick (the design target).
window.__latencyCheck = () => {
  hero.virtual.move = { x: 0, z: 0 };
  for (let i = 0; i < 40; i++) tick(1 / 60);
  const before = hero.position.clone();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  let framesToMove = -1;
  for (let i = 0; i < 20; i++) {
    tick(1 / 60);
    if (framesToMove < 0 && hero.position.distanceTo(before) > 1e-3) framesToMove = i + 1;
  }
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
  for (let i = 0; i < 40; i++) tick(1 / 60);
  return { framesToMove, msAt60fps: +(framesToMove * 1000 / 60).toFixed(1), pass: framesToMove >= 1 && framesToMove <= 2 };
};

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
