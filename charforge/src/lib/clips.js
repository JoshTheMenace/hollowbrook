import * as THREE from 'three';

// Pose-based animation authoring. Authors write named keyframe poses in
// degrees; bakeClip samples them densely with easing into an AnimationClip.
//
//   const A = { thighL: { rot: [-30, 0, 0] }, hips: { pos: [0, -0.03, 0] } };
//   const clip = bakeClip(root, 'walk', [
//     { t: 0.0,  pose: A, ease: 'inOut' },   // ease applies toward the NEXT key
//     { t: 0.35, pose: B },
//     { t: 0.7,  pose: A },                  // repeat first pose to close a loop
//   ]);
//
// Semantics:
// - Each key is a FULL pose; joints missing from a key are at rest there.
// - rot: [x,y,z] degrees, XYZ order, relative to the joint's rest orientation.
// - pos: [x,y,z] metres, OFFSET from the joint's rest position.
// - scale: [x,y,z] multipliers (squash & stretch), default [1,1,1].
// - Rest transforms are read from the hierarchy when bakeClip is called, so
//   bake clips right after building the skeleton, before posing it.

export const EASES = {
  linear: (u) => u,
  in: (u) => u * u,
  out: (u) => u * (2 - u),
  inOut: (u) => u * u * (3 - 2 * u),
  outBack: (u) => { const c = 1.70158; const x = u - 1; return 1 + x * x * ((c + 1) * x + c); },
  hold: () => 0,
};

export function bakeClip(root, name, keys, { fps = 30 } = {}) {
  if (keys.length < 2) throw new Error('bakeClip needs at least 2 keys');
  const duration = keys[keys.length - 1].t;

  // Collect every joint referenced by any key, plus rest transforms.
  const jointNames = new Set();
  for (const k of keys) for (const j of Object.keys(k.pose)) jointNames.add(j);
  const rest = new Map();
  for (const jn of jointNames) {
    const obj = root.getObjectByName(jn);
    if (!obj) throw new Error(`bakeClip: no joint "${jn}" under root`);
    rest.set(jn, { pos: obj.position.clone(), quat: obj.quaternion.clone(), scale: obj.scale.clone() });
  }

  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qo = new THREE.Quaternion();
  const e = new THREE.Euler();
  const poseQuat = (jn, pose, out) => {
    const p = pose[jn];
    if (!p || !p.rot) return out.copy(rest.get(jn).quat);
    e.set(
      THREE.MathUtils.degToRad(p.rot[0]),
      THREE.MathUtils.degToRad(p.rot[1]),
      THREE.MathUtils.degToRad(p.rot[2]), 'XYZ');
    return out.setFromEuler(e).premultiply(rest.get(jn).quat);
  };
  const poseVec = (jn, pose, field, base, out) => {
    const p = pose[jn];
    const v = p && p[field];
    if (field === 'pos') out.copy(base).add(v ? { x: v[0], y: v[1], z: v[2] } : { x: 0, y: 0, z: 0 });
    else v ? out.set(v[0], v[1], v[2]) : out.copy(base);
    return out;
  };

  const nSamples = Math.max(2, Math.round(duration * fps) + 1);
  const times = new Float32Array(nSamples);
  const tracks = [];
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vo = new THREE.Vector3();

  for (const jn of jointNames) {
    const quatVals = new Float32Array(nSamples * 4);
    const posVals = new Float32Array(nSamples * 3);
    const scaleVals = new Float32Array(nSamples * 3);
    let usesPos = false, usesScale = false, usesRot = false;
    for (const k of keys) {
      const p = k.pose[jn];
      if (p?.pos) usesPos = true;
      if (p?.scale) usesScale = true;
      if (p?.rot) usesRot = true;
    }
    for (let s = 0; s < nSamples; s++) {
      const t = (duration * s) / (nSamples - 1);
      times[s] = t;
      let i = 0;
      while (i < keys.length - 2 && t > keys[i + 1].t) i++;
      const k0 = keys[i], k1 = keys[i + 1];
      const span = Math.max(k1.t - k0.t, 1e-6);
      const uRaw = THREE.MathUtils.clamp((t - k0.t) / span, 0, 1);
      const u = (EASES[k0.ease || 'inOut'] || EASES.inOut)(uRaw);

      qo.copy(poseQuat(jn, k0.pose, qa)).slerp(poseQuat(jn, k1.pose, qb), u);
      quatVals.set([qo.x, qo.y, qo.z, qo.w], s * 4);

      const r = rest.get(jn);
      vo.copy(poseVec(jn, k0.pose, 'pos', r.pos, va)).lerp(poseVec(jn, k1.pose, 'pos', r.pos, vb), u);
      posVals.set([vo.x, vo.y, vo.z], s * 3);

      vo.copy(poseVec(jn, k0.pose, 'scale', r.scale, va)).lerp(poseVec(jn, k1.pose, 'scale', r.scale, vb), u);
      scaleVals.set([vo.x, vo.y, vo.z], s * 3);
    }
    if (usesRot) tracks.push(new THREE.QuaternionKeyframeTrack(`${jn}.quaternion`, times, quatVals));
    if (usesPos) tracks.push(new THREE.VectorKeyframeTrack(`${jn}.position`, times, posVals));
    if (usesScale) tracks.push(new THREE.VectorKeyframeTrack(`${jn}.scale`, times, scaleVals));
  }
  return new THREE.AnimationClip(name, duration, tracks);
}

// Mirror a pose across the character's YZ plane: swap L/R joints, negate
// y/z rotation components and x offsets. hips/spine/etc. mirror in place.
export function mirrorPose(pose) {
  const out = {};
  for (const [jn, p] of Object.entries(pose)) {
    const m = jn.endsWith('L') ? jn.slice(0, -1) + 'R'
      : jn.endsWith('R') ? jn.slice(0, -1) + 'L' : jn;
    const q = {};
    if (p.rot) q.rot = [p.rot[0], -p.rot[1], -p.rot[2]];
    if (p.pos) q.pos = [-p.pos[0], p.pos[1], p.pos[2]];
    if (p.scale) q.scale = [...p.scale];
    out[m] = q;
  }
  return out;
}

// Merge poses (later overrides earlier) — for layering, e.g. base + lean.
export function blendPoses(...poses) {
  return Object.assign({}, ...poses);
}

// Ground-contact pass: after baking, nudge the hips.position track per sample
// so the character's lowest mesh point never sinks below y=0 (and planted
// phases actually touch). Cheap stand-in for foot IK; call after bakeClip.
export function groundClip(root, clip, { clearance = 0.004, pullDown = true } = {}) {
  const track = clip.tracks.find((t) => t.name === 'hips.position');
  if (!track) throw new Error(`groundClip: ${clip.name} has no hips.position track`);
  const saved = [];
  root.traverse((o) => saved.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]));
  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(clip);
  action.play();
  const box = new THREE.Box3();
  for (let i = 0; i < track.times.length; i++) {
    mixer.setTime(Math.min(track.times[i], clip.duration - 1e-6));
    root.updateMatrixWorld(true);
    box.setFromObject(root);
    const err = box.min.y - clearance;           // >0 floating, <0 penetrating
    if (err < 0 || pullDown) track.values[i * 3 + 1] -= err;
  }
  action.stop();
  mixer.uncacheRoot(root);
  // restore rest pose so later bakes see clean rest transforms
  for (const [o, p, q, s] of saved) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s); }
  root.updateMatrixWorld(true);
  return clip;
}
