import * as THREE from 'three';
import { toonMaterial, chunkyBox, facet, latheBody, facetBall, paintGradient } from '../lib/parts.js';

// Little village square for the fetch-quest demo. Sakura-style collision
// model, simplified: axis-aligned boxes, resolved on the smallest overlap.
export const colliders = [];
const solid = (x, z, w, d) => colliders.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 });

const G = (mesh, lo, hi) => { paintGradient(mesh.geometry, lo, hi); return mesh; };

export function buildWorld(scene) {
  const grass = toonMaterial('#5a8a4a', { rim: 0, vertexColors: true });
  const path = toonMaterial('#b09a72', { rim: 0 });
  const wallM = toonMaterial('#e8dcc0', { rim: 0.1, vertexColors: true });
  const woodM = toonMaterial('#6e4a2e', { rim: 0.1, vertexColors: true });
  const roofM = toonMaterial('#a8503c', { rim: 0.15, vertexColors: true });
  const roofM2 = toonMaterial('#4a6a8a', { rim: 0.15, vertexColors: true });
  const leafM = toonMaterial('#3f7a3a', { rim: 0.2, vertexColors: true });
  const stoneM = toonMaterial('#8a8f98', { rim: 0.1, vertexColors: true });

  // Ground: big disc with painted center-lightening.
  const ground = new THREE.Mesh(new THREE.CircleGeometry(22, 48), grass);
  paintGradient(ground.geometry, '#4a7a3e', '#699a56');
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Paths: flattened boxes.
  for (const [x, z, w, d, rot] of [[0, 2, 2.2, 12, 0], [3, -1.5, 8, 1.8, 0]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), path);
    p.position.set(x, 0.02, z);
    p.rotation.y = rot;
    p.receiveShadow = true;
    scene.add(p);
  }

  // House: walls + gable roof + door + window boxes.
  function house(x, z, rotY, roof) {
    const g = new THREE.Group();
    const w = 3.2, d = 2.6, h = 1.9;
    const walls = G(chunkyBox(w, h, d, wallM, { radius: 0.06 }), '#c9b896', '#f4ecd8');
    walls.position.y = h / 2;
    g.add(walls);
    const roofGeo = new THREE.CylinderGeometry(0.02, 1.9, 1.3, 4, 1);
    roofGeo.rotateY(Math.PI / 4);
    roofGeo.scale(w / 2.3, 1, d / 2.3);
    const roofMesh = G(facet(roofGeo, roof), '#7a3a2c', '#c46a50');
    roofMesh.position.y = h + 0.6;
    g.add(roofMesh);
    const door = chunkyBox(0.6, 1.1, 0.08, woodM, { radius: 0.2 });
    door.position.set(0.5, 0.55, d / 2 + 0.02);
    g.add(door);
    for (const wx of [-0.8]) {
      const win = chunkyBox(0.55, 0.5, 0.08, toonMaterial('#9ac7d8', { rim: 0.4 }), { radius: 0.2 });
      win.position.set(wx, 1.1, d / 2 + 0.02);
      g.add(win);
      const frame = chunkyBox(0.65, 0.6, 0.06, woodM, { radius: 0.2 });
      frame.position.set(wx, 1.1, d / 2);
      g.add(frame);
    }
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(g);
    // collider: unrotated approx (rotY multiples of ~90° here)
    const swap = Math.abs(Math.sin(rotY)) > 0.5;
    solid(x, z, (swap ? d : w) + 0.2, (swap ? w : d) + 0.2);
    return g;
  }
  house(-4.5, -4, 0.25, roofM);
  house(4.8, -4.5, -0.35, roofM2);
  house(-5.2, 3.5, Math.PI / 2 + 0.2, roofM2);

  // Trees.
  function tree(x, z, s = 1) {
    const g = new THREE.Group();
    const trunk = G(facet(new THREE.CylinderGeometry(0.12 * s, 0.18 * s, 0.9 * s, 6), woodM), '#4a2e1c', '#8a6240');
    trunk.position.y = 0.45 * s;
    g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const blob = G(facetBall(0.55 * s - i * 0.12 * s, leafM, [1.15, 0.8, 1.1], [7, 5]), '#2c5a28', '#6aa856');
      blob.position.y = 0.9 * s + i * 0.38 * s;
      g.add(blob);
    }
    g.position.set(x, 0, z);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    scene.add(g);
    solid(x, z, 0.5 * s, 0.5 * s);
  }
  tree(-2.2, -7, 1.2); tree(7.5, -1, 1); tree(-7.8, -1.5, 1.1); tree(2.5, 6.5, 0.9); tree(-3.5, 7.5, 1.3); tree(8, 5, 1.1);

  // The old well — the quest target lives here.
  const well = new THREE.Group();
  const ring = G(facet(new THREE.CylinderGeometry(0.62, 0.68, 0.55, 8), stoneM), '#5f646e', '#b0b6c0');
  ring.position.y = 0.28;
  well.add(ring);
  for (const sx of [-1, 1]) {
    const post = chunkyBox(0.1, 1.15, 0.1, woodM, { radius: 0.3 });
    post.position.set(sx * 0.55, 0.85, 0);
    well.add(post);
  }
  const wellRoofGeo = new THREE.CylinderGeometry(0.02, 0.95, 0.55, 4, 1);
  wellRoofGeo.rotateY(Math.PI / 4);
  const wellRoof = G(facet(wellRoofGeo, roofM), '#7a3a2c', '#c46a50');
  wellRoof.position.y = 1.65;
  well.add(wellRoof);
  well.position.set(6.5, 0, 3.5);
  well.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(well);
  solid(6.5, 3.5, 1.5, 1.5);

  // Fences along the square edge.
  function fence(x0, z0, x1, z1) {
    const dir = new THREE.Vector2(x1 - x0, z1 - z0);
    const len = dir.length();
    const n = Math.round(len / 0.9);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const post = chunkyBox(0.09, 0.6, 0.09, woodM, { radius: 0.3 });
      post.position.set(x0 + dir.x * t, 0.3, z0 + dir.y * t);
      post.castShadow = true;
      scene.add(post);
    }
    const rail = chunkyBox(len, 0.08, 0.06, woodM, { radius: 0.3 });
    rail.position.set((x0 + x1) / 2, 0.48, (z0 + z1) / 2);
    rail.rotation.y = -Math.atan2(dir.y, dir.x);
    rail.castShadow = true;
    scene.add(rail);
  }
  fence(-8, 8.5, 1, 8.5);
  fence(9.5, -6.5, 9.5, 1.5);

  // The lost spectacles: glowing pickup near the well.
  const item = new THREE.Group();
  item.name = 'questItem';
  const lensM = toonMaterial('#ffd76a', { rim: 1.0, rimColor: '#fff3c4' });
  for (const sx of [-1, 1]) {
    const lens = facet(new THREE.TorusGeometry(0.09, 0.025, 6, 12), lensM);
    lens.position.x = sx * 0.11;
    item.add(lens);
  }
  const bridge = chunkyBox(0.06, 0.02, 0.02, lensM, { radius: 0.3 });
  item.add(bridge);
  item.position.set(7.4, 0.5, 4.6);
  item.rotation.x = -0.6;
  scene.add(item);

  // World bounds (keep everyone in the square).
  colliders.push({ x0: -60, z0: 9.4, x1: 60, z1: 60 });   // north wall past fences
  colliders.push({ x0: 10.4, z0: -60, x1: 60, z1: 60 });
  colliders.push({ x0: -60, z0: -60, x1: -9.4, z1: 60 });
  colliders.push({ x0: -60, z0: -60, x1: 60, z1: -9.4 });

  return { item };
}

// Circle-vs-AABB push-out on the smallest overlap axis (Sakura's model).
export function collide(pos, radius) {
  for (const c of colliders) {
    const nx = Math.max(c.x0, Math.min(pos.x, c.x1));
    const nz = Math.max(c.z0, Math.min(pos.z, c.z1));
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      pos.x = nx + (dx / d) * radius;
      pos.z = nz + (dz / d) * radius;
    } else {
      // center inside the box: push out along smallest overlap
      const oxL = pos.x - c.x0 + radius, oxR = c.x1 - pos.x + radius;
      const ozL = pos.z - c.z0 + radius, ozR = c.z1 - pos.z + radius;
      const m = Math.min(oxL, oxR, ozL, ozR);
      if (m === oxL) pos.x = c.x0 - radius;
      else if (m === oxR) pos.x = c.x1 + radius;
      else if (m === ozL) pos.z = c.z0 - radius;
      else pos.z = c.z1 + radius;
    }
  }
}
