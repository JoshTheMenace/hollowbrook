// Numeric kinematics probe: prints crown height, hips height, and per-foot
// contact data across a clip so walk weight and foot plant can be tuned by
// measurement instead of eyeballing renders.
//   node scripts/probe-clip.mjs <character> <clip> [samples]
import * as THREE from 'three';
import { characters } from '../src/characters/index.js';

const [name, clipName, sampleArg] = process.argv.slice(2);
const N = Number(sampleArg) || 16;
const mod = await characters[name]();
const { root, clips } = await mod.build();
const clip = clips.find((c) => c.name === clipName);
if (!clip) { console.error(`no clip ${clipName}`); process.exit(2); }

const mixer = new THREE.AnimationMixer(root);
mixer.clipAction(clip).play();

const box = new THREE.Box3(), b = new THREE.Box3();
const crown = () => {
  root.updateMatrixWorld(true);
  box.makeEmpty();
  root.traverse((o) => { if (o.isMesh) box.union(b.setFromObject(o)); });
  return { top: box.max.y, min: box.min.y };
};
const footInfo = (side) => {
  const foot = root.getObjectByName(`foot${side}`);
  if (!foot) return null;
  let fb = null;
  foot.traverse((o) => { if (o.isMesh) { fb = fb || new THREE.Box3(); fb.union(b.setFromObject(o)); } });
  if (!fb) return null;
  // pitch: world angle of the foot's forward axis vs horizontal
  const q = new THREE.Quaternion();
  foot.getWorldQuaternion(q);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  const pitch = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1)));
  return { minY: fb.min.y, pitch };
};

const rows = [];
for (let i = 0; i < N; i++) {
  const t = (clip.duration * i) / N;
  mixer.setTime(t);
  const c = crown();
  const hips = root.getObjectByName('hips');
  const hy = hips ? hips.getWorldPosition(new THREE.Vector3()).y : NaN;
  const L = footInfo('L'), R = footInfo('R');
  rows.push({
    f: i, t: +t.toFixed(2), crown: +c.top.toFixed(3), hips: +hy.toFixed(3),
    fL: L ? `${L.minY.toFixed(3)}/${L.pitch.toFixed(0)}°` : '-',
    fR: R ? `${R.minY.toFixed(3)}/${R.pitch.toFixed(0)}°` : '-',
  });
}
const crowns = rows.map((r) => r.crown);
console.table(rows);
console.log(`crown range: ${Math.min(...crowns).toFixed(3)} .. ${Math.max(...crowns).toFixed(3)} (bob ${(Math.max(...crowns) - Math.min(...crowns)).toFixed(3)}m)`);
