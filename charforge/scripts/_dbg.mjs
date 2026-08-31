import * as THREE from 'three';
import { characters } from '../src/characters/index.js';
const mod = await characters['fox']();
const { root, clips } = await mod.build();
const clip = clips.find(c => c.name === 'walk');
const mixer = new THREE.AnimationMixer(root);
mixer.clipAction(clip).play();
const b = new THREE.Box3();
const foot = (n) => { const o = root.getObjectByName(n); const fb = new THREE.Box3(); o.traverse(m => { if (m.isMesh) fb.union(b.setFromObject(m)); }); return fb.min.y; };
for (const t of [0, 0.0333, 0.0875, 0.175]) {
  mixer.setTime(t); root.updateMatrixWorld(true);
  const j = (n) => THREE.MathUtils.radToDeg(root.getObjectByName(n).rotation.x).toFixed(1);
  console.log(t, 'rearL', foot('rearFootL').toFixed(4), 'rearR', foot('rearFootR').toFixed(4),
    '| angles L', j('rearThighL'), j('rearShinL'), j('rearFootL'), ' R', j('rearThighR'), j('rearShinR'), j('rearFootR'),
    '| hipsY', root.getObjectByName('hips').position.y.toFixed(4));
}
