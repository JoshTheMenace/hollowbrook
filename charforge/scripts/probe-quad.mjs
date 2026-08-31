// Quad foot probe: per-paw floor distance at the strip's own sample times.
import * as THREE from 'three';
import { characters } from '../src/characters/index.js';

const [name, clipName, sampleArg] = process.argv.slice(2);
const N = Number(sampleArg) || 16;
const mod = await characters[name]();
const { root, clips } = await mod.build();
const clip = clips.find((c) => c.name === clipName);
const mixer = new THREE.AnimationMixer(root);
mixer.clipAction(clip).play();
const b = new THREE.Box3(), box = new THREE.Box3();
const legs = ['rearL', 'frontL', 'rearR', 'frontR'];
const footY = (n) => {
  const f = root.getObjectByName(`${n.slice(0, -1).replace(/(rear|front)/, '$1')}`);
  const pre = n.startsWith('rear') ? 'rear' : 'front';
  const side = n.endsWith('L') ? 'L' : 'R';
  const o = root.getObjectByName(`${pre}Foot${side}`);
  const fb = new THREE.Box3();
  o.traverse((m) => { if (m.isMesh) fb.union(b.setFromObject(m)); });
  return fb.min.y;
};
const rows = [];
for (let i = 0; i < N; i++) {
  const t = (clip.duration * i) / N;
  mixer.setTime(t);
  root.updateMatrixWorld(true);
  box.makeEmpty();
  root.traverse((o) => { if (o.isMesh) box.union(b.setFromObject(o)); });
  const r = { f: i, t: +t.toFixed(3), crown: +box.max.y.toFixed(3) };
  for (const l of legs) r[l] = +(footY(l) * 1000).toFixed(0); // mm above floor
  rows.push(r);
}
console.table(rows);
const cr = rows.map((r) => r.crown);
console.log(`crown ${Math.min(...cr).toFixed(3)}..${Math.max(...cr).toFixed(3)} bob ${(Math.max(...cr) - Math.min(...cr)).toFixed(3)}m`);
