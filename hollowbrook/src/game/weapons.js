/* ------------------------------------------------------------------ *
 * WEAPONS — the viewmodel and the things that fly.
 *
 * A view over the rules: the crossbow and the lance hang off the camera,
 * their recoil / reload / charge poses are read off run.player every
 * frame (fireCd, reloadLeft, charge), the bolt tracer is drawn from the
 * muzzle to the point the hitscan ALREADY resolved (cosmetic — the bolt
 * you see flying never decides anything), the lance projectile and the
 * hexbolts are placed at their rules positions.  Nothing here is gameplay.
 * ------------------------------------------------------------------ */
import * as THREE from 'three';
import { CONTRACT as C } from './data.js';
import { PAL, ACCENT, JOINERY } from '../palette.js';

const TRACERS = 10;
const LANCES = 6;
const HEXBOLTS = 12;

export function createWeaponsView({ scene, camera, cel, flat }) {
  const group = new THREE.Group();
  group.name = 'viewmodel';
  group.scale.setScalar(0.62);              // authored in metres, shown at arm's length: a 0.5 m stock at 0.5 m is a crate
  camera.add(group);
  if (!camera.parent) scene.add(camera);

  const oak = cel({ color: hex(JOINERY.oakStain), cache: false });
  const iron = cel({ color: hex(PAL.iron), cache: false });
  const brass = cel({ color: hex(PAL.brass), cache: false });
  const emberMat = flat({ color: hex(PAL.ember), cache: false });
  const emberCore = new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.warmLight), toneMapped: false, fog: false });
  const tealMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.tealGlow), toneMapped: false, fog: false });

  /* ---- crossbow, right hand: stock, tiller, two limbs, string, the magazine box ---- */
  const bow = new THREE.Group();
  bow.name = 'crossbow';
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.52), oak);
  stock.position.set(0, -0.01, 0.06);
  const tiller = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.4), iron);
  tiller.position.set(0, 0.035, -0.06);
  const limbL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.018, 0.028), iron);
  limbL.position.set(-0.14, 0.035, -0.24); limbL.rotation.y = 0.18;
  const limbR = limbL.clone(); limbR.position.x = 0.14; limbR.rotation.y = -0.18;
  const string = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.006, 0.006), brass);
  string.position.set(0, 0.035, -0.2);
  const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.16), oak);
  magazine.position.set(0, 0.085, -0.02);
  const boltRow = new THREE.Group();
  const boltGeo = new THREE.BoxGeometry(0.012, 0.012, 0.15);
  const bolts = [];
  for (let i = 0; i < C.crossbow.magazine; i += 1) {
    const b = new THREE.Mesh(boltGeo, brass);
    b.position.set(-0.02 + (i % 2) * 0.04, 0.06 + Math.floor(i / 2) * 0.014, -0.02);
    boltRow.add(b); bolts.push(b);
  }
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.09, 0.02), iron);
  lever.position.set(0, -0.06, 0.16); lever.rotation.x = 0.5;
  bow.add(stock, tiller, limbL, limbR, string, magazine, boltRow, lever);
  bow.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });
  const BOW_REST = new THREE.Vector3(0.30, -0.30, -0.72);
  bow.position.copy(BOW_REST);
  bow.rotation.set(0.02, -0.06, 0);
  group.add(bow);

  /* ---- emberlance, left hand: haft, iron collar, the ember head ---- */
  const lance = new THREE.Group();
  lance.name = 'emberlance';
  const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.9, 7), oak);
  haft.rotation.x = Math.PI / 2; haft.position.z = -0.25;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.08, 8), iron);
  collar.rotation.x = Math.PI / 2; collar.position.z = -0.62;
  const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), emberMat);
  head.position.z = -0.72;
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), emberCore);
  core.position.z = -0.72;
  lance.add(haft, collar, head, core);
  lance.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });
  const LANCE_REST = new THREE.Vector3(-0.34, -0.34, -0.55);
  const LANCE_AIM = new THREE.Vector3(0.0, -0.22, -0.5);
  lance.position.copy(LANCE_REST);
  lance.rotation.set(0.1, 0.12, 0);
  group.add(lance);
  const lanceLight = new THREE.PointLight(PAL.ember, 0, 4, 1.8);
  lanceLight.position.set(0, -0.1, -0.7);
  group.add(lanceLight);

  /* ---- tracers ---- */
  const tracerMat = new THREE.LineBasicMaterial({ color: new THREE.Color(PAL.paper), transparent: true, opacity: 0.9, toneMapped: false, fog: false, depthWrite: false });
  const tracers = [];
  for (let i = 0; i < TRACERS; i += 1) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(g, tracerMat.clone());
    line.frustumCulled = false; line.visible = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  const tmpA = new THREE.Vector3(); const tmpB = new THREE.Vector3();

  /* ---- projectiles ---- */
  const emberGeo = new THREE.SphereGeometry(0.16, 10, 8);
  const trailGeo = new THREE.ConeGeometry(0.14, 0.9, 7);
  const lanceMeshes = [];
  for (let i = 0; i < LANCES; i += 1) {
    const g = new THREE.Group();
    const s = new THREE.Mesh(emberGeo, emberCore);
    const t = new THREE.Mesh(trailGeo, emberMat);
    t.rotation.x = -Math.PI / 2; t.position.z = 0.5;
    const l = new THREE.PointLight(PAL.ember, 6, 7, 1.6);
    g.add(s, t, l); g.visible = false;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    scene.add(g); lanceMeshes.push(g);
  }
  const hexGeo = new THREE.SphereGeometry(0.2, 10, 8);
  const hexMeshes = [];
  for (let i = 0; i < HEXBOLTS; i += 1) {
    const m = new THREE.Mesh(hexGeo, tealMat);
    m.visible = false; m.frustumCulled = false;
    scene.add(m); hexMeshes.push(m);
  }

  const recoil = { kick: 0 };
  let muzzleWorld = new THREE.Vector3();

  function onEvent(name, data) {
    if (name === 'bolt-fired' && data.pos) {
      recoil.kick = 1;
      // tracer from the muzzle to the resolved end point
      const t = tracers.find((x) => x.life <= 0) ?? tracers[0];
      bow.updateWorldMatrix(true, false);
      muzzleWorld.set(0, 0.04, -0.3).applyMatrix4(bow.matrixWorld);
      const end = data.hit ?? data.end ?? null;
      const p = t.line.geometry.attributes.position.array;
      p[0] = muzzleWorld.x; p[1] = muzzleWorld.y; p[2] = muzzleWorld.z;
      if (end) { p[3] = end.x; p[4] = end.y; p[5] = end.z; }
      else { tmpA.set(data.dir.x, data.dir.y, data.dir.z).multiplyScalar(C.crossbow.range).add(tmpB.set(data.pos.x, data.pos.y, data.pos.z)); p[3] = tmpA.x; p[4] = tmpA.y; p[5] = tmpA.z; }
      t.line.geometry.attributes.position.needsUpdate = true;
      t.line.visible = true; t.line.material.opacity = 0.9; t.life = 0.14;
    }
    if (name === 'lance-fired') recoil.kick = 1.6;
  }

  function update(dt, run) {
    const p = run.player;
    // crossbow pose: recoil kick, reload dip, empty tilt
    recoil.kick = Math.max(0, recoil.kick - dt * 9);
    const k = recoil.kick * recoil.kick;
    const reload = p.reloadLeft > 0 ? 1 - p.reloadLeft / C.crossbow.reload : 0;
    const dip = p.reloadLeft > 0 ? Math.sin(reload * Math.PI) : 0;
    bow.position.set(BOW_REST.x + k * 0.01, BOW_REST.y - dip * 0.16, BOW_REST.z + k * 0.06);
    bow.rotation.set(0.02 + k * 0.22 + dip * 0.6, -0.06 - dip * 0.5, dip * 0.3);
    lever.rotation.x = 0.5 + dip * 1.4;
    for (let i = 0; i < bolts.length; i += 1) bolts[i].visible = i < p.bolts || p.reloadLeft > 0 && reload > 0.6;
    // lance pose: raised to centre while charging, ember brightening with the charge
    const c = p.charge / C.lance.charge;
    const raise = p.charging ? Math.min(1, c * 3) : 0;
    lance.position.lerpVectors(LANCE_REST, LANCE_AIM, raise);
    lance.position.z += k * 0.03;
    lance.rotation.set(0.1 - raise * 0.12, 0.12 - raise * 0.12, 0);
    const glow = p.charging ? 0.3 + c * 0.7 : 0.25;
    core.scale.setScalar(0.6 + glow * (p.charging && c >= 1 ? 1.6 : 1.0));
    lanceLight.intensity = p.charging ? c * 3.2 : 0;
    head.material.color.setHex(PAL.ember).lerp(new THREE.Color(PAL.warmLight), c);
    // tracers
    for (const t of tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.14) * 0.9;
      if (t.life <= 0) t.line.visible = false;
    }
    // projectiles
    run.lances.forEach((l, i) => {
      if (i >= LANCES) return;
      const g = lanceMeshes[i];
      g.visible = true;
      g.position.set(l.x, l.y, l.z);
      g.lookAt(l.x + l.dx, l.y + l.dy, l.z + l.dz);
    });
    for (let i = run.lances.length; i < LANCES; i += 1) lanceMeshes[i].visible = false;
    run.hexbolts.forEach((h, i) => { if (i >= HEXBOLTS) return; hexMeshes[i].visible = true; hexMeshes[i].position.set(h.x, h.y, h.z); });
    for (let i = run.hexbolts.length; i < HEXBOLTS; i += 1) hexMeshes[i].visible = false;
  }

  function dispose() {
    camera.remove(group);
    for (const t of tracers) scene.remove(t.line);
    for (const g of lanceMeshes) scene.remove(g);
    for (const m of hexMeshes) scene.remove(m);
  }

  return { update, onEvent, dispose, group, bow, lance };
}

const hex = (v) => '#' + v.toString(16).padStart(6, '0');
// silence the unused-import lint for the accent: the enemy owns it, the viewmodel never wears it
void ACCENT;
