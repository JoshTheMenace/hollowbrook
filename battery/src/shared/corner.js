import * as THREE from 'three';
import { cel } from '@town/core/toon.js';
import { PAL } from '@town/palette.js';
import { skyTexture } from '@town/textures.js';
import { machiya, stoneLantern, postRack, lanternString } from '@town/kit/index.js';

// The Tsukimi café corner — the one slice of Yoizaka the battery reuses
// (B2 celbridge, B3 errand). Same geometry in both so reviews compare like
// with like. Returns colliders (AABBs) and named handles.

export function cornerLights(scene) {
  const sun = new THREE.DirectionalLight(PAL.sun, 2.0);
  sun.position.set(-9, 11, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(PAL.fill, 0.9);
  fill.position.set(8, 6, -6);
  scene.add(fill, fill.target);
  const hemi = new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, 1.0);
  scene.add(hemi);
  scene.background = skyTexture(css(PAL.sky.top), css(PAL.sky.mid), css(PAL.sky.haze));
  scene.fog = new THREE.Fog(PAL.fog, 20, 46);
  return { sun, fill, hemi };
}

export function buildCorner(scene) {
  const colliders = [];
  const collide = (x0, z0, x1, z1) => colliders.push({ x0, z0, x1, z1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), cel({ color: '#bcb0a6' }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const shop = machiya({ tenant: '喫茶 月見', seed: 3, w: 6.4 });
  shop.position.set(-2.5, 0, -5.4);
  scene.add(shop);
  for (const r of machiya.footprint({ w: 6.4 })) collide(r.x0 - 2.5, r.z0 - 5.4, r.x1 - 2.5, r.z1 - 5.4);
  const toro = stoneLantern({ size: 'large' });
  toro.position.set(3.4, 0, -2.2);
  scene.add(toro);
  collide(3.0, -2.6, 3.8, -1.8);
  const rack = postRack({ seed: 2, bikes: 2 });
  rack.position.set(-6.6, 0, -3.4);
  rack.rotation.y = 0.4;
  scene.add(rack);
  const string = lanternString({ span: 9, height: 4.6, sag: 0.5 });
  string.position.set(-1, 0, -1.2);
  scene.add(string);
  return { colliders, shop, toro, rack, string };
}

function css(v) { return '#' + v.toString(16).padStart(6, '0'); }
