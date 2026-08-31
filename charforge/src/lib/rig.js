import * as THREE from 'three';

// Standard joint hierarchy for chunky rigid-part characters.
// Convention: character faces +Z, feet on y=0, units metres.
// Joints are plain Object3Ds; meshes are parented to them (no skinning) —
// overlapping rounded geometry hides the seams, Crossy-Road style.
//
// Joint names (targets for animation tracks):
//   hips, spine, chest, neck, head,
//   shoulderL/R, upperArmL/R, forearmL/R, handL/R,
//   thighL/R, shinL/R, footL/R
//
// Proportions describe joint pivot placement; meshes decide the visible shape.
export const DEFAULT_PROPORTIONS = {
  hipHeight: 0.62,     // hips pivot above ground
  spineLen: 0.12,      // hips -> spine
  chestLen: 0.22,      // spine -> chest
  neckLen: 0.16,       // chest -> neck
  headLen: 0.07,       // neck -> head pivot
  shoulderX: 0.21,     // chest -> shoulder, lateral
  shoulderY: 0.12,     // chest -> shoulder, up
  upperArmLen: 0.20,
  forearmLen: 0.18,
  hipX: 0.11,          // hips -> thigh, lateral
  thighLen: 0.30,
  shinLen: 0.28,
};

// Quadruped joint hierarchy. Same conventions: faces +Z (head end forward),
// feet on y=0, metres. Hips are the REAR of the animal; chest rides forward
// on the spine. Leg joints reuse thigh/shin/foot semantics with front/rear
// prefixes (frontThighL, rearShinR, ...) — mirrorPose's L/R handling works
// unchanged, and the humanoid anatomy zones auto-skip these names.
//
//   root → hips (rear)
//     ├ tail1 → tail2
//     └ spine → chest (forward +Z)
//         ├ neck → head
//         └ frontThighL/R → frontShinL/R → frontFootL/R
//     rearThighL/R → rearShinL/R → rearFootL/R   (on hips)
export const QUAD_PROPORTIONS = {
  hipHeight: 0.42,      // hips pivot above ground (rear)
  bodyLen: 0.42,        // hips -> chest along +Z
  chestDrop: 0.0,       // chest slightly lower/higher than hips
  neckLen: 0.16,        // chest -> neck (angled up-forward by neckPitch)
  neckPitch: -35,       // degrees; negative pitches the neck up-forward
  headLen: 0.10,
  hipX: 0.10,           // lateral leg offset, rear
  shoulderX: 0.10,      // lateral leg offset, front
  rearThighLen: 0.20,
  rearShinLen: 0.18,
  frontThighLen: 0.20,
  frontShinLen: 0.18,
  tailLen: 0.14,        // per tail segment (2 segments)
};

export function buildQuadSkeleton(proportions = {}) {
  const P = { ...QUAD_PROPORTIONS, ...proportions };
  const root = new THREE.Group();
  root.name = 'characterRoot';

  const hips = joint('hips', root, 0, P.hipHeight, 0);
  const spine = joint('spine', hips, 0, 0, P.bodyLen * 0.45);
  const chest = joint('chest', spine, 0, P.chestDrop, P.bodyLen * 0.55);
  const neck = joint('neck', chest, 0, 0.02, 0.06);
  neck.rotation.x = THREE.MathUtils.degToRad(P.neckPitch);
  const head = joint('head', neck, 0, 0, P.neckLen);
  const tail1 = joint('tail1', hips, 0, 0.03, -0.06);
  tail1.rotation.x = THREE.MathUtils.degToRad(35); // tail carries up-back
  const tail2 = joint('tail2', tail1, 0, 0, -P.tailLen);

  const joints = { root, hips, spine, chest, neck, head, tail1, tail2 };
  for (const [suffix, side] of [['L', 1], ['R', -1]]) {
    const rt = joint(`rearThigh${suffix}`, hips, side * P.hipX, -0.02, -0.02);
    const rs = joint(`rearShin${suffix}`, rt, 0, -P.rearThighLen, 0);
    const rf = joint(`rearFoot${suffix}`, rs, 0, -P.rearShinLen, 0.01);
    const ft = joint(`frontThigh${suffix}`, chest, side * P.shoulderX, -0.02, 0.02);
    const fs = joint(`frontShin${suffix}`, ft, 0, -P.frontThighLen, 0);
    const ff = joint(`frontFoot${suffix}`, fs, 0, -P.frontShinLen, 0.01);
    Object.assign(joints, {
      [`rearThigh${suffix}`]: rt, [`rearShin${suffix}`]: rs, [`rearFoot${suffix}`]: rf,
      [`frontThigh${suffix}`]: ft, [`frontShin${suffix}`]: fs, [`frontFoot${suffix}`]: ff,
    });
  }
  return { root, joints, proportions: P };
}

function joint(name, parent, x, y, z) {
  const j = new THREE.Group();
  j.name = name;
  j.position.set(x, y, z);
  parent.add(j);
  return j;
}

// Returns { root, joints } — root is a Group with feet at y=0.
export function buildSkeleton(proportions = {}) {
  const P = { ...DEFAULT_PROPORTIONS, ...proportions };
  const root = new THREE.Group();
  root.name = 'characterRoot';

  const hips = joint('hips', root, 0, P.hipHeight, 0);
  const spine = joint('spine', hips, 0, P.spineLen, 0);
  const chest = joint('chest', spine, 0, P.chestLen, 0);
  const neck = joint('neck', chest, 0, P.neckLen, 0);
  const head = joint('head', neck, 0, P.headLen, 0);

  const joints = { root, hips, spine, chest, neck, head };
  for (const [suffix, side] of [['L', 1], ['R', -1]]) {
    const shoulder = joint(`shoulder${suffix}`, chest, side * P.shoulderX, P.shoulderY, 0);
    const upperArm = joint(`upperArm${suffix}`, shoulder, side * 0.05, -0.02, 0);
    const forearm = joint(`forearm${suffix}`, upperArm, 0, -P.upperArmLen, 0);
    const hand = joint(`hand${suffix}`, forearm, 0, -P.forearmLen, 0);
    const thigh = joint(`thigh${suffix}`, hips, side * P.hipX, -0.02, 0);
    const shin = joint(`shin${suffix}`, thigh, 0, -P.thighLen, 0);
    const foot = joint(`foot${suffix}`, shin, 0, -P.shinLen, 0.02);
    Object.assign(joints, {
      [`shoulder${suffix}`]: shoulder, [`upperArm${suffix}`]: upperArm,
      [`forearm${suffix}`]: forearm, [`hand${suffix}`]: hand,
      [`thigh${suffix}`]: thigh, [`shin${suffix}`]: shin, [`foot${suffix}`]: foot,
    });
  }
  return { root, joints, proportions: P };
}
