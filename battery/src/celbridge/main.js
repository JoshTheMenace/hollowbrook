import * as THREE from 'three';
import { Pipeline } from '@town/core/post.js';
import { cel, shadowTintActive } from '@town/core/toon.js';
import { PAL } from '@town/palette.js';
import { Hero } from '@town/game/hero.js';
import { buildCorner, cornerLights } from '../shared/corner.js';
import { BRIDGE } from '../shared/bridge.js';
import { DayNight } from '@town/game/daynight.js';
import { Actor } from '@forge/game/actor.js';
import { celify, celCensus } from '@forge/lib/celify.js';

/* THE CEL BRIDGE (battery B2) — one CharForge character inside a
 * scene-pipeline cel/ink corner, re-materialed through the world's own
 * cel() factory. B toggles the bridge for the A/B the review needs. */

const canvas = document.querySelector('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
if (!shadowTintActive()) console.error('[celbridge] shadow tint OFF');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 70);
const { sun, fill, hemi } = cornerLights(scene);
const { colliders } = buildCorner(scene);

// ---- the character --------------------------------------------------------
let actor = null;
let bridged = false;
let rawMaterials = null;          // mesh -> original material, for the A/B
const pipeline = new Pipeline(renderer, scene, camera, {
  ink: { color: PAL.ink, fadeStart: 24, fadeEnd: 60, skyDepth: 70 },
  grade: { shadowTint: PAL.gradeShadow, lightTint: PAL.gradeLight },
});

// graded vertex colors swap alongside materials so the A/B stays honest
function setVertexColors(raw) {
  actor.root.traverse((o) => {
    const ud = o.isMesh && o.geometry?.userData;
    if (ud?.rawColorArray) {
      o.geometry.attributes.color.array.set(raw ? ud.rawColorArray : ud.celColorArray);
      o.geometry.attributes.color.needsUpdate = true;
    }
  });
}
function setBridge(on) {
  if (!actor || on === bridged) return;
  if (on) {
    if (!rawMaterials) {
      rawMaterials = new Map();
      actor.root.traverse((o) => { if (o.isMesh) rawMaterials.set(o, o.material); });
      const report = celify(actor.root, cel, {
        accentGuard: BRIDGE.accentGuard,
        worldSatCap: BRIDGE.worldSatCap,
        ownedAccent: BRIDGE.ownedAccent,
      });
      console.log(`[celbridge] celified ${report.converted}/${report.meshes} meshes,`, [...report.colors.keys()].length, 'source colors');
    } else {
      actor.root.traverse((o) => { if (o.isMesh && o.userData._celMat) o.material = o.userData._celMat; });
    }
    actor.root.traverse((o) => { if (o.isMesh) o.userData._celMat = o.material; });
    setVertexColors(false);
  } else {
    actor.root.traverse((o) => { if (o.isMesh && rawMaterials.has(o)) o.material = rawMaterials.get(o); });
    setVertexColors(true);
  }
  bridged = on;
}

actor = await Actor.spawn('ronin', { walkSpeed: 1.4, runSpeed: 3.2 });
actor.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
actor.root.position.set(1.2, 0, -2.8);
actor.root.rotation.y = -0.55;   // facing the approach — you MEET him
actor.heading = -0.55;
scene.add(actor.root);
setBridge(true);

// night value seat (review r1: char val p50 0.486 vs world 0.298 at night —
// he floats). At night his albedo sits down toward the world's; day untouched.
const SEAT_AMOUNT = 0.58;   // tuned by __renderedBand at all 3 contract cameras (A2)
const seatBase = new Map();
actor.root.traverse((o) => {
  const m = o.isMesh && o.material;
  if (m?.userData?.celified && !m.userData.practical && m.color && !seatBase.has(m)) seatBase.set(m, m.color.clone());
});
let lastSeat = -1;
function nightSeat() {
  const seat = 1 - SEAT_AMOUNT * Math.max(0, (daynight.level - 0.25) / 0.75);
  if (Math.abs(seat - lastSeat) < 0.003) return;
  lastSeat = seat;
  for (const [m, base] of seatBase) m.color.copy(base).multiplyScalar(seat);
}

// ---- walkable approach ----------------------------------------------------
const hero = new Hero({
  actor: null, camera, canvas,
  colliders,
  groundAt: () => 0,
  spawn: [2.5, 0, 6],
  yaw: 0.15,               // forward = (-sin, -cos): face the ronin, not empty street
  occluderRoot: scene,
});
// the hero here is a walking CAMERA; the ronin is the subject standing still
const daynight = new DayNight({ scene, sun, fill, hemi, pipeline, root: scene });
// world matrices must be current or every practical registers at its LOCAL
// position — all six lanterns stacked at one point below ground (review r1)
scene.updateMatrixWorld(true);
daynight.collectPracticals(scene);
daynight.set('day');

addEventListener('keydown', (e) => {
  if (e.code === 'KeyB') setBridge(!bridged);
  if (e.code === 'KeyN') daynight.fadeTo(daynight.current === 'night' ? 'day' : 'night', 2);
});

// ---- loop -----------------------------------------------------------------
const clock = new THREE.Clock();
let frozen = false;   // __frame parks the camera for a real page.screenshot
function tick(dt) {
  if (!frozen) hero.update(dt);
  actor.update(dt);
  daynight.update(dt, hero.position);
  nightSeat();
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

// ---- gates + evidence -----------------------------------------------------
window.__tick = tick;
window.__bridge = { setBridge, get bridged() { return bridged; }, actor, daynight, hero, scene };
// rendered-band census: char vs world statistics measured in the JUDGING
// space — the composited frame — at the contract cameras (A2: thresholds
// must never come from the mechanism's own output)
const CAMS = {
  meet: [[3.6, 1.7, 0.6], [0.4, 1, -3.6]],
  portrait: [[0.4, 1.35, -0.7], [1.2, 1.0, -2.8]],
  far: [[10, 2.2, 6], [0, 1, -4]],
};
window.__renderedBand = (cam = 'meet', phase = 'day') => {
  const was = daynight.current;
  daynight.set(phase); lastSeat = -1; nightSeat();
  const [pos, look] = CAMS[cam];
  camera.position.fromArray(pos);
  camera.lookAt(new THREE.Vector3().fromArray(look));
  const grab = () => {
    pipeline.render();
    const c = document.createElement('canvas');
    c.width = renderer.domElement.width; c.height = renderer.domElement.height;
    const x = c.getContext('2d');
    x.drawImage(renderer.domElement, 0, 0);
    return x.getImageData(0, 0, c.width, c.height).data;
  };
  const withChar = grab();
  actor.root.visible = false;
  const without = grab();
  actor.root.visible = true;
  const charSat = [], worldSat = [], charLum = [], worldLum = [];
  const hotHues = {};   // hue histogram of char pixels above sat 0.5 (debug/tuning)
  for (let i = 0; i < withChar.length; i += 8) {
    const r = withChar[i], g = withChar[i + 1], b = withChar[i + 2];
    const diff = Math.abs(r - without[i]) + Math.abs(g - without[i + 1]) + Math.abs(b - without[i + 2]);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = (mx - mn) / 255;
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (diff > 24) {
      charSat.push(sat); charLum.push(lum);
      if (sat > 0.5 && d > 0) {
        const rr = r / 255, gg = g / 255, bb = b / 255, dd = mx / 255 - mn / 255;
        let h = mx === r ? ((gg - bb) / dd) % 6 : mx === g ? (bb - rr) / dd + 2 : (rr - gg) / dd + 4;
        h = ((h / 6) + 1) % 1;
        const key = (Math.round(h * 12) * 30) % 360;
        hotHues[key] = (hotHues[key] ?? 0) + 1;
      }
    } else { worldSat.push(sat); worldLum.push(lum); }
  }
  for (const a of [charSat, worldSat, charLum, worldLum]) a.sort((x1, x2) => x1 - x2);
  const q = (a, f) => a[Math.min(a.length - 1, Math.floor(f * a.length))] ?? 0;
  daynight.set(was); lastSeat = -1; nightSeat();
  return {
    cam, phase, charPixels: charSat.length, hotHues,
    char: { satP50: q(charSat, 0.5), satP90: q(charSat, 0.9), satP99: q(charSat, 0.99), lumP50: q(charLum, 0.5) },
    world: { satP50: q(worldSat, 0.5), satP90: q(worldSat, 0.9), satP99: q(worldSat, 0.99), lumP50: q(worldLum, 0.5) },
    lumRatio: q(charLum, 0.5) / (q(worldLum, 0.5) || 1),
  };
};
// park a contract camera + phase + bridge state for a REAL compositor
// capture (page.screenshot through the harness); free cameras are allowed
// by the look contract
window.__frame = (cam = 'meet', phase = 'day', on = true) => {
  setBridge(on);
  daynight.set(phase); lastSeat = -1; nightSeat();
  const [pos, look] = CAMS[cam];
  camera.position.fromArray(pos);
  camera.lookAt(new THREE.Vector3().fromArray(look));
  frozen = true;
  pipeline.render();
};
// measured night seat: luma p50 of character pixels vs world pixels in the
// night meet framing (char mask = pixels that change when he is hidden) —
// kept unchanged for same-instrument comparability with r2
window.__nightSeat = () => {
  const wasNight = daynight.current === 'night';
  daynight.set('night');
  lastSeat = -1; nightSeat();
  camera.position.set(3.6, 1.7, 0.6);
  camera.lookAt(0.4, 1, -3.6);
  const grab = () => {
    pipeline.render();
    const c = document.createElement('canvas');
    c.width = renderer.domElement.width; c.height = renderer.domElement.height;
    const x = c.getContext('2d');
    x.drawImage(renderer.domElement, 0, 0);
    return x.getImageData(0, 0, c.width, c.height).data;
  };
  const withChar = grab();
  actor.root.visible = false;
  const without = grab();
  actor.root.visible = true;
  const charL = [], worldL = [];
  for (let i = 0; i < withChar.length; i += 16) {   // every 4th pixel
    const d = Math.abs(withChar[i] - without[i]) + Math.abs(withChar[i + 1] - without[i + 1]) + Math.abs(withChar[i + 2] - without[i + 2]);
    const luma = (0.2126 * withChar[i] + 0.7152 * withChar[i + 1] + 0.0722 * withChar[i + 2]) / 255;
    (d > 24 ? charL : worldL).push(luma);
  }
  charL.sort((a, b) => a - b); worldL.sort((a, b) => a - b);
  const p50 = (a) => a[Math.floor(a.length / 2)] ?? 0;
  if (!wasNight) { daynight.set('day'); lastSeat = -1; nightSeat(); }
  return { charP50: p50(charL), worldP50: p50(worldL), ratio: p50(charL) / (p50(worldL) || 1), charPixels: charL.length };
};
window.__census = () => celCensus(actor.root, {
  satThreshold: BRIDGE.worldSatCap + 0.02,
  maxAccents: 1,
  forbiddenHues: BRIDGE.forbiddenHues,
  ownedAccent: BRIDGE.ownedAccent,
});
window.__shot = async (name, opts = {}) => {
  actor.update(1 / 60);
  daynight.update(1 / 60, hero.position);
  nightSeat();
  if (opts.pos) { camera.position.fromArray(opts.pos); camera.lookAt(new THREE.Vector3().fromArray(opts.lookAt ?? [0, 1, -3])); }
  pipeline.render();   // NOT tick(): hero.update would re-seize the camera
  const data = renderer.domElement.toDataURL('image/jpeg', 0.92);
  const res = await fetch('/__shot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, data }) });
  return res.json();
};
window.__evidence = async () => {
  const out = [];
  const meet = { pos: [3.6, 1.7, 0.6], lookAt: [0.4, 1, -3.6] };
  setBridge(true);
  out.push(await window.__shot('cb-meet', meet));
  out.push(await window.__shot('cb-close', { pos: [0.4, 1.35, -0.7], lookAt: [1.2, 1.0, -2.8] }));  // portrait from his front, shadow side in frame
  out.push(await window.__shot('cb-far', { pos: [10, 2.2, 6], lookAt: [0, 1, -4] }));
  setBridge(false);
  out.push(await window.__shot('cb-ab-raw', meet));
  setBridge(true);
  daynight.set('night');
  out.push(await window.__shot('cb-night', meet));
  daynight.set('day');
  return out.map((r) => r.file);
};
