import * as THREE from 'three';
import { Actor } from './actor.js';
import { buildWorld, collide } from './world.js';
import { audio, music } from '../engine/audio.js';
import { VFX, Shake, HitStop } from '../engine/vfx.js';
import { Juice } from '../engine/juice.js';
import { Shell, Save, Input } from '../engine/shell.js';

// ---- renderer / scene -----------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const scene = new THREE.Scene();
scene.background = new THREE.Color('#aee3f5');
scene.fog = new THREE.Fog('#aee3f5', 26, 42);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 120);

const sun = new THREE.DirectionalLight('#fff3dc', 2.4);
sun.position.set(-8, 14, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16 });
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(new THREE.HemisphereLight('#bfe0ff', '#4a6a3e', 0.85));

const { item } = buildWorld(scene);

// ---- engine services ------------------------------------------------------
const input = new Input();
const vfx = new VFX(scene);
const shake = new Shake();
const hitstop = new HitStop();
const juice = new Juice({ vfx, shake, hitstop, camera });
const save = new Save('willow-square', 1);
const shell = new Shell();

// ---- sound bank (parameter sets — agents author these like geometry) ------
audio.define('ui', { wave: 'triangle', freq: 660, decay: 0.08, volume: 0.35 });
audio.define('talk', { wave: 'triangle', freq: 520, freqEnd: 640, decay: 0.09, volume: 0.3 });
audio.define('talk-advance', { wave: 'triangle', freq: 470, decay: 0.06, volume: 0.25 });
audio.define('pickup', { wave: 'square', freq: 620, freqEnd: 1240, sweepTime: 0.12, decay: 0.16, volume: 0.34, lowpass: 3200 });
audio.define('quest-done', { wave: 'triangle', freq: 523, freqEnd: 1046, sweepTime: 0.3, decay: 0.4, volume: 0.42, vibratoHz: 7, vibratoDepth: 9 });
audio.define('swing', { wave: 'noise', decay: 0.12, volume: 0.28, lowpass: 1800 });
audio.define('slash-hit', { wave: 'square', freq: 180, freqEnd: 70, sweepTime: 0.1, decay: 0.12, volume: 0.4, lowpass: 900 });
audio.define('startle', { wave: 'square', freq: 880, freqEnd: 1500, sweepTime: 0.08, decay: 0.1, volume: 0.3 });
audio.define('step', { wave: 'noise', decay: 0.045, volume: 0.11, lowpass: 900 });

// ---- juice wiring (the lint checks every declared event is wired) ---------
export const GAME_EVENTS = ['talk-open', 'talk-advance', 'pickup', 'quest-done', 'attack-swing', 'attack-hit', 'fox-startle', 'ui'];
juice.wire('talk-open', { sfx: 'talk' });
juice.wire('talk-advance', { sfx: 'talk-advance' });
juice.wire('pickup', { sfx: 'pickup', burst: { count: 16, color: '#ffd76a', color2: '#fff6d8', up: 2.2, speed: 1.4, ttl: 0.6 }, text: '+ spectacles' });
juice.wire('quest-done', { sfx: 'quest-done', burst: { count: 30, color: '#ffd76a', color2: '#8fe14e', up: 2.8, speed: 2.4, ttl: 0.9 }, shake: 0.25, text: 'Quest complete!' });
juice.wire('attack-swing', { sfx: 'swing' });
juice.wire('attack-hit', { sfx: 'slash-hit', burst: { count: 10, color: '#fff3c4', color2: '#c9503c', speed: 2.6, up: 1.2, ttl: 0.35 }, shake: 0.35, hitstop: 0.06 });
juice.wire('fox-startle', { sfx: 'startle', burst: { count: 8, color: '#c96a2e', color2: '#fff', speed: 1.2, up: 1.8, ttl: 0.4, size: 0.06 } });
juice.wire('ui', { sfx: 'ui' });
window.__juiceCheck = () => juice.check(GAME_EVENTS);

// ---- HUD / dialogue -------------------------------------------------------
const hud = document.getElementById('quest');
const dlg = document.getElementById('dialogue');
const dlgName = document.getElementById('dlg-name');
const dlgText = document.getElementById('dlg-text');
let dialogueOpen = false, dialogueQueue = [], dialogueActor = null;

function say(actorName, lines, actor) {
  dialogueQueue = lines.slice();
  dlgName.textContent = actorName;
  dialogueActor = actor || null;
  dialogueActor?.setState('talk');
  juice.emit('talk-open', {});
  dlgText.textContent = dialogueQueue.shift();
  dlg.style.display = 'block';
  dialogueOpen = true;
}
function advanceDialogue() {
  if (!dialogueQueue.length) {
    dlg.style.display = 'none';
    dialogueOpen = false;
    dialogueActor?.setState('idle');
    dialogueActor = null;
    return;
  }
  juice.emit('talk-advance', {});
  dlgText.textContent = dialogueQueue.shift();
}

// ---- cast -----------------------------------------------------------------
const actors = [];
async function trySpawn(name, opts, x, z, heading = 0) {
  try {
    const a = await Actor.spawn(name, opts);
    a.root.position.set(x, 0, z);
    a.heading = heading;
    a.root.rotation.y = heading;
    a.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(a.root);
    actors.push(a);
    return a;
  } catch (e) {
    console.warn(`[game] ${name} not available:`, e.message);
    return null;
  }
}

const player = await trySpawn('ronin', { walkSpeed: 1.5, runSpeed: 3.6 }, 0, 6.5, Math.PI);
const elder = await trySpawn('elder', { walkSpeed: 0.7 }, -3.6, -2.2, 0.6);
const mika = await trySpawn('mika', { walkSpeed: 1.0 }, 3, 1, 0);
const fox = await trySpawn('fox', { walkSpeed: 1.4, runSpeed: 3.0, turnSpeed: 720 }, -6, 5, 1.2);

if (player) player.onEvent = (type) => { if (type === 'attack-hit') juice.emit('attack-hit', { pos: hitPoint() }); };
function hitPoint() {
  const p = player.root.position.clone();
  p.y = 0.7;
  p.x += Math.sin(player.heading) * 0.55;
  p.z += Math.cos(player.heading) * 0.55;
  return p;
}

// ---- quest state (persisted) ----------------------------------------------
const state = save.load({ quest: 'start', carried: false });
let { quest, carried } = state;
if (quest === 'return' || quest === 'done') item.visible = quest !== 'return' ? item.visible : false;
if (carried || quest === 'done') item.visible = false;
function persist() { save.store({ quest, carried }); }
function setHint(t) { hud.textContent = t; }
function hintForState() {
  if (quest === 'start') return 'Find the village elder. (WASD move, Shift run, E talk, F slash, Esc pause)';
  if (quest === 'fetch') return 'Fetch the spectacles from the old well (east). Press E near them.';
  if (quest === 'return') return 'You have the spectacles! Return them to Elder Yune.';
  return 'Quest complete! ✨  Keep exploring — and say hi to the fox.';
}

function interact() {
  if (dialogueOpen) { advanceDialogue(); return; }
  if (!player) return;
  const p = player.root.position;
  if (elder && p.distanceTo(elder.root.position) < 1.6) {
    faceEachOther(elder, player);
    if (quest === 'start') {
      quest = 'fetch'; persist();
      say('Elder Yune', [
        'Oh, thank goodness — a traveler!',
        'I have lost my spectacles... I cannot see a thing without them.',
        'I believe I dropped them by the old well, east of the square.',
        'Would you fetch them for me, dear?',
      ], elder);
    } else if (quest === 'fetch') {
      say('Elder Yune', ['The old well, dear — just east of the square!'], elder);
    } else if (quest === 'return' && carried) {
      quest = 'done'; carried = false; persist();
      say('Elder Yune', [
        'My spectacles! Oh, bless you, dear.',
        'Now I can finally see that fox that keeps stealing my herbs...',
        'Thank you, traveler. The village is brighter with you in it.',
      ], elder);
      juice.emit('quest-done', { pos: elder.root.position.clone().setY(1.3) });
      player.squash(0.2, 0.25);
    } else {
      say('Elder Yune', ['Lovely weather over the square today, is it not?'], elder);
    }
    setHint(hintForState());
    return;
  }
  if (mika && p.distanceTo(mika.root.position) < 1.6) {
    faceEachOther(mika, player);
    say('Mika', quest === 'fetch'
      ? ['The well? Follow the path east — past the big tree!', 'Watch out for the fox. She is FAST.']
      : ['Hi hi! Did you see the fox? She has been sneaking around all morning.'], mika);
    return;
  }
  if (!carried && quest === 'fetch' && item.visible && p.distanceTo(item.position) < 1.4) {
    carried = true; quest = 'return'; persist();
    item.visible = false;
    juice.emit('pickup', { pos: item.position.clone() });
    setHint(hintForState());
    player.squash(0.15, 0.2);
  }
}
function faceEachOther(a, b) {
  const d = b.root.position.clone().sub(a.root.position);
  a.heading = Math.atan2(d.x, d.z);
  a.root.rotation.y = a.heading;
}

// ---- NPC behaviors --------------------------------------------------------
const mikaWaypoints = [new THREE.Vector3(3, 0, 1), new THREE.Vector3(1, 0, -3.4), new THREE.Vector3(6.8, 0, -2.6), new THREE.Vector3(4.5, 0, 2.6)];
let mikaTarget = 0, mikaWait = 0;
let foxState = 'wander', foxTimer = 0, foxDir = new THREE.Vector3(1, 0, 0);
const _v = new THREE.Vector3();

function updateNPCs(dt) {
  if (mika && mika !== dialogueActor) {
    const target = mikaWaypoints[mikaTarget];
    const d = _v.copy(target).sub(mika.root.position); d.y = 0;
    if (mikaWait > 0) { mikaWait -= dt; mika.move(null, false, dt); }
    else if (d.length() < 0.3) { mikaWait = 2 + Math.random() * 3; mikaTarget = (mikaTarget + 1) % mikaWaypoints.length; }
    else mika.move(d, false, dt);
  } else if (mika) mika.move(null, false, dt);

  if (fox) {
    const pd = player ? fox.root.position.distanceTo(player.root.position) : 99;
    if (foxState === 'wander') {
      foxTimer -= dt;
      if (foxTimer <= 0) {
        foxTimer = 2 + Math.random() * 3;
        const a = Math.random() * Math.PI * 2;
        foxDir.set(Math.sin(a), 0, Math.cos(a));
        if (Math.random() < 0.4) foxDir.set(0, 0, 0);
      }
      fox.move(foxDir.lengthSq() > 0 ? foxDir : null, false, dt);
      if (pd < 1.6) {
        foxState = 'startle'; foxTimer = 0.65;
        fox.setState('startle');
        fox.move(null, false, dt);
        juice.emit('fox-startle', { pos: fox.root.position.clone().setY(0.6) });
      }
    } else if (foxState === 'startle') {
      foxTimer -= dt;
      fox.move(null, false, dt);
      if (foxTimer <= 0) {
        foxState = 'flee'; foxTimer = 2.2;
        foxDir.copy(fox.root.position).sub(player.root.position).setY(0).normalize();
      }
    } else if (foxState === 'flee') {
      foxTimer -= dt;
      fox.move(foxDir, true, dt);
      if (foxTimer <= 0) foxState = 'wander';
    }
    const fp = fox.root.position;
    if (Math.abs(fp.x) > 8.5 || Math.abs(fp.z) > 8.5) {
      foxDir.copy(fp).multiplyScalar(-1).setY(0).normalize();
      if (foxState === 'flee') foxState = 'wander';
    }
  }

  if (elder && elder !== dialogueActor && player) {
    if (elder.root.position.distanceTo(player.root.position) < 2.2) faceEachOther(elder, player);
  }
}

// ---- village music --------------------------------------------------------
const N = (note, wave = 'triangle', vol = 1, dur) => ({ note, wave, vol, dur });
const VILLAGE_TUNE = {
  bpm: 92,
  steps: [
    [N(0), N(-12, 'sine', 0.7)], null, [N(4)], null, [N(7)], null, [N(4)], null,
    [N(5), N(-15, 'sine', 0.7)], null, [N(9)], null, [N(7)], null, [N(4)], null,
    [N(2), N(-10, 'sine', 0.7)], null, [N(5)], null, [N(9)], null, [N(5)], null,
    [N(4), N(-12, 'sine', 0.7)], null, [N(7)], null, [N(0, 'triangle', 1, 0.5)], null, null, null,
  ],
};

// ---- scenes ---------------------------------------------------------------
shell.scene('title', {
  domId: 'title',
  enter() { music.stop(); },
  update() {
    if (input.pressed('interact') || input.pressed('attack')) {
      juice.emit('ui', {});
      shell.go('play');
    }
  },
});
shell.scene('play', {
  enter() {
    setHint(hintForState());
    audio.ensure?.();
    try { music.play(VILLAGE_TUNE); } catch {}
  },
  update(dt) {
    if (input.pressed('pause')) { shell.go('paused'); return; }
    if (input.pressed('interact')) interact();
    if (input.pressed('attack') && !dialogueOpen) {
      if (player?.attack()) juice.emit('attack-swing', {});
    }
    if (player) {
      if (dialogueOpen) player.move(null, false, dt);
      else {
        const m = input.move;
        const dir = _v.set(m.x, 0, m.z);
        player.move(dir.lengthSq() > 0 ? dir : null, input.held('run'), dt);
      }
    }
    updateNPCs(dt);
    for (const a of actors) {
      a.update(dt);
      collide(a.root.position, 0.32);
    }
  },
});
shell.scene('paused', {
  domId: 'pause',
  enter() { music.stop(); },
  update() {
    if (input.pressed('pause') || input.pressed('interact')) {
      juice.emit('ui', {});
      shell.go('play');
    }
  },
});

// ---- main loop ------------------------------------------------------------
const clock = new THREE.Clock();
const camTarget = new THREE.Vector3();
let elapsed = 0;

function tick(rawDt) {
  const dt = rawDt * hitstop.scale(rawDt);
  elapsed += dt;
  const t = elapsed;

  input.pollGamepad();
  shell.update(dt);
  input.endFrame();

  if (item.visible) {
    item.position.y = 0.5 + Math.sin(t * 2.4) * 0.06;
    item.rotation.y = t * 1.2;
  }

  shake.update(rawDt);
  vfx.update(dt, camera);

  if (player) {
    camTarget.lerp(player.root.position, 1 - Math.exp(-6 * rawDt));
    camera.position.set(camTarget.x + 0.4 + shake.offset.x, camTarget.y + 4.6 + shake.offset.y, camTarget.z + 6.4);
    camera.lookAt(camTarget.x, camTarget.y + 0.7, camTarget.z);
  }
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(() => tick(Math.min(clock.getDelta(), 0.05)));
window.__tick = tick;
window.__game = {
  actors, get player() { return player; }, elder, mika, fox, input, interact, item, juice, shell,
  get quest() { return quest; }, save,
};
shell.go('title');
tick(1 / 60);
