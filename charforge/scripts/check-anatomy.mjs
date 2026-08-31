// Anatomical plausibility gate, v2 — physical checks, not euler limits
// (euler triples are ambiguous for large compound rotations and flag legal
// poses). Three families of check per sampled frame:
//   1. Arm direction zones (character space): an upper arm may not point
//      up-and-behind the back plane, nor cross behind the body to the
//      opposite side — the two "impossible shoulder" poses.
//   2. Hinges (elbow/knee, local swing-twist about X): flexion range plus
//      near-zero off-axis swing (a hinge cannot bend sideways), and no
//      reverse bend.
//   3. Small-range joints (chest/spine/neck/head) via relative angle caps.
//   node scripts/check-anatomy.mjs <name> [clip]
import * as THREE from 'three';
import { characters } from '../src/characters/index.js';

const [name, onlyClip] = process.argv.slice(2);
if (!name || !characters[name]) {
  console.error(`usage: check-anatomy.mjs <name> [clip]`);
  process.exit(2);
}
const mod = await characters[name]();
const { root, clips } = await mod.build();

const rest = new Map();
root.traverse((o) => rest.set(o, o.quaternion.clone()));

// Swing-twist: twist of q about local axis (unit); returns signed degrees.
// For elbows/knees we peel TWO legal components — flexion (about X) and
// pronation (about the segment's long axis Y) — and only the residual
// counts as illegal sideways swing.
const twistAboutX = (q) => {
  // pronation is innermost (XYZ composition = flexion ∘ pronation): peel the
  // Y-twist first, then the X flexion, and only what's left is sideways.
  const p = new THREE.Quaternion(0, q.y, 0, q.w).normalize();
  const rest1 = q.clone().multiply(p.clone().invert());
  const t = new THREE.Quaternion(rest1.x, 0, 0, rest1.w).normalize();
  const rest2 = rest1.clone().multiply(t.clone().invert());
  return {
    twistDeg: THREE.MathUtils.radToDeg(2 * Math.atan2(t.x, t.w)),
    pronationDeg: THREE.MathUtils.radToDeg(2 * Math.atan2(p.y, p.w)),
    swingDeg: THREE.MathUtils.radToDeg(2 * Math.acos(Math.min(1, Math.abs(rest2.w)))),
  };
};
const norm180 = (d) => ((d + 540) % 360) - 180;

// Directions are measured in an anatomical reference frame: arms against
// the CHEST (a shoulder's range rides with the ribcage — an arm straight up
// on a leaned-back torso is legal), legs against the hips.
const rootInv = new THREE.Matrix4();
const frameInv = new THREE.Matrix4();
const dirOf = (a, b, refJoint) => {
  const ref = refJoint || null;
  if (ref) frameInv.copy(ref.matrixWorld).invert();
  else frameInv.copy(rootInv);
  const pa = a.getWorldPosition(new THREE.Vector3()).applyMatrix4(frameInv);
  const pb = b.getWorldPosition(new THREE.Vector3()).applyMatrix4(frameInv);
  return pb.sub(pa).normalize();
};
const relAngle = (o) => {
  const rel = rest.get(o).clone().invert().multiply(o.quaternion);
  return THREE.MathUtils.radToDeg(2 * Math.acos(Math.min(1, Math.abs(rel.w))));
};

const mixer = new THREE.AnimationMixer(root);
const violations = [];

for (const clip of clips) {
  if (onlyClip && clip.name !== onlyClip) continue;
  if (clips.length > 10 && !['idle', 'walk', 'attack'].includes(clip.name)) continue; // library packs: core only
  const action = mixer.clipAction(clip);
  action.play();
  const worst = new Map();
  const flag = (joint, kind, value, t) => {
    const key = `${clip.name}|${joint}|${kind}`;
    const prev = worst.get(key);
    if (!prev || Math.abs(value) > Math.abs(prev.value)) {
      worst.set(key, { clip: clip.name, joint, kind, value: +(+value).toFixed(1), t: +t.toFixed(2) });
    }
  };
  for (let i = 0; i <= 40; i++) {
    const t = (clip.duration * i) / 40;
    mixer.setTime(Math.min(t, clip.duration - 1e-6));
    root.updateMatrixWorld(true);
    rootInv.copy(root.matrixWorld).invert();
    for (const s of ['L', 'R']) {
      const up = root.getObjectByName(`upperArm${s}`);
      const fo = root.getObjectByName(`forearm${s}`);
      const ha = root.getObjectByName(`hand${s}`);
      if (up && fo && ha) {
        const chestRef = root.getObjectByName('chest');
        const u = dirOf(up, fo, chestRef);
        // arm raised behind the back plane
        if (u.y > 0.15 && u.z < -0.35) flag(`upperArm${s}`, 'raised-behind', THREE.MathUtils.radToDeg(Math.atan2(-u.z, u.y)), t);
        // arm crossing behind the body to the opposite side
        const sideSign = s === 'L' ? 1 : -1;
        if (u.z < -0.25 && u.x * sideSign < -0.3) flag(`upperArm${s}`, 'cross-behind', u.x * sideSign, t);
        // elbow hinge
        const rel = rest.get(fo).clone().invert().multiply(fo.quaternion);
        const { twistDeg, pronationDeg, swingDeg } = twistAboutX(rel);
        const flex = norm180(twistDeg);
        if (flex > 12) flag(`forearm${s}`, 'elbow-reverse', flex, t);
        if (flex < -155) flag(`forearm${s}`, 'elbow-overbend', flex, t);
        if (Math.abs(norm180(pronationDeg)) > 95) flag(`forearm${s}`, 'over-pronation', pronationDeg, t);
        if (swingDeg > 30) flag(`forearm${s}`, 'elbow-sideways', swingDeg, t);
      }
      const th = root.getObjectByName(`thigh${s}`);
      const sh = root.getObjectByName(`shin${s}`);
      if (th && sh) {
        const rel = rest.get(sh).clone().invert().multiply(sh.quaternion);
        const { twistDeg, swingDeg } = twistAboutX(rel);
        const flex = norm180(twistDeg);
        if (flex < -12) flag(`shin${s}`, 'knee-reverse', flex, t);
        if (flex > 155) flag(`shin${s}`, 'knee-overbend', flex, t);
        if (swingDeg > 25) flag(`shin${s}`, 'knee-sideways', swingDeg, t);
        const tdir = dirOf(th, sh, root.getObjectByName('hips'));
        if (tdir.z < -0.72) flag(`thigh${s}`, 'leg-far-behind', tdir.z, t);
      }
    }
    for (const [jn, cap] of [['chest', 55], ['spine', 55], ['neck', 65], ['head', 65]]) {
      const o = root.getObjectByName(jn);
      if (o && rest.has(o)) {
        const ang = relAngle(o);
        if (ang > cap) flag(jn, 'over-rotated', ang, t);
      }
    }
  }
  action.stop();
  violations.push(...worst.values());
}

violations.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
const pass = violations.length === 0;
console.log(JSON.stringify({ character: name, pass, count: violations.length, violations: violations.slice(0, 25) }, null, 1));
process.exit(pass ? 0 : 1);
