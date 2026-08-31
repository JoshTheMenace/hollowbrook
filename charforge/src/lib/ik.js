import * as THREE from 'three';

// Analytic 2-bone IK as a POSE-AUTHORING helper: give a hand (or foot)
// target in character space plus an elbow/knee hint, get back a pose
// fragment ({ upperArmR: {rot}, forearmR: {rot} }) in the same degree
// conventions bakeClip consumes. Authoring hand POSITIONS instead of
// shoulder angles makes impossible rotations structurally unlikely — this
// is how professional rigs (KayKit's included) are animored.
//
//   const frag = ikArm(root, 'R', [0.15, 1.05, 0.25], { hint: [0.4, 0.9, 0] });
//   const pose = blendPoses(basePose, frag);
//
// Requirements: the skeleton is in REST pose when called (call right after
// buildSkeleton / before playing clips — same rule as bakeClip), and the
// chain hangs along -Y at rest (buildSkeleton's arms/legs both do).
export function ikChain(root, upperName, midName, endName, targetChar, { hint = [0, 0, 1], flexSign = -1 } = {}) {
  const upper = root.getObjectByName(upperName);
  const mid = root.getObjectByName(midName);
  const end = root.getObjectByName(endName);
  if (!upper || !mid || !end) throw new Error(`ikChain: missing joints ${upperName}/${midName}/${endName}`);
  root.updateMatrixWorld(true);

  const a = mid.position.length();      // upper segment length
  const b = end.position.length();      // lower segment length

  // Target and hint into the upper joint's PARENT space.
  const parentInv = new THREE.Matrix4().copy(upper.parent.matrixWorld).invert();
  const rootMat = root.matrixWorld;
  const toParent = (v) => new THREE.Vector3(...v).applyMatrix4(rootMat).applyMatrix4(parentInv);
  const T = toParent(targetChar);
  const H = toParent(hint);
  const S = upper.position.clone();
  const v = T.sub(S);
  const d = THREE.MathUtils.clamp(v.length(), Math.abs(a - b) + 1e-4, a + b - 1e-4);
  const dir = v.normalize();

  // Elbow/knee interior angle via law of cosines.
  const cosC = THREE.MathUtils.clamp((a * a + b * b - d * d) / (2 * a * b), -1, 1);
  const flex = 180 - THREE.MathUtils.radToDeg(Math.acos(cosC));  // 0 = straight
  // Upper-segment offset from the aim line.
  const cosA = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const offA = Math.acos(cosA);

  // Bend-plane normal from the hint (pole vector).
  const hintDir = H.sub(S).normalize();
  let n = new THREE.Vector3().crossVectors(dir, hintDir);
  if (n.lengthSq() < 1e-6) n.set(1, 0, 0).cross(dir);
  n.normalize();

  // Aim rest -Y along dir, then rotate by offA about n (pushes the mid
  // joint toward the hint side).
  const qAim = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  const qOff = new THREE.Quaternion().setFromAxisAngle(n, offA);
  const qUpperAbs = qOff.multiply(qAim);

  // Twist about the upper segment's own axis so the local flex axis (+X)
  // matches the bend plane: forearm flexes around local X, moving the end
  // toward local -Z*flexSign... choose twist aligning local X with n*flexSign.
  const localX = new THREE.Vector3(1, 0, 0).applyQuaternion(qUpperAbs);
  const upperAxis = new THREE.Vector3(0, -1, 0).applyQuaternion(qUpperAbs);
  const wantX = new THREE.Vector3().copy(n).multiplyScalar(flexSign);
  // project both onto plane ⟂ upperAxis
  localX.addScaledVector(upperAxis, -localX.dot(upperAxis)).normalize();
  wantX.addScaledVector(upperAxis, -wantX.dot(upperAxis)).normalize();
  let twist = Math.acos(THREE.MathUtils.clamp(localX.dot(wantX), -1, 1));
  if (new THREE.Vector3().crossVectors(localX, wantX).dot(upperAxis) < 0) twist = -twist;
  const qTwist = new THREE.Quaternion().setFromAxisAngle(upperAxis, twist);
  const qUpperFinal = qTwist.multiply(qUpperAbs);

  // Express relative to rest and convert to the DSL's degrees.
  const relUpper = upper.quaternion.clone().invert().multiply(qUpperFinal);
  const eu = new THREE.Euler().setFromQuaternion(relUpper, 'XYZ');
  const relMidEu = new THREE.Euler(THREE.MathUtils.degToRad(flexSign * flex), 0, 0, 'XYZ');

  const deg = (r) => [THREE.MathUtils.radToDeg(r.x), THREE.MathUtils.radToDeg(r.y), THREE.MathUtils.radToDeg(r.z)].map((x) => +x.toFixed(1));
  return {
    [upperName]: { rot: deg(eu) },
    [midName]: { rot: deg(relMidEu) },
  };
}

// Arm convenience: elbows flex forward (negative rx in our conventions).
export function ikArm(root, side, targetChar, opts = {}) {
  return ikChain(root, `upperArm${side}`, `forearm${side}`, `hand${side}`, targetChar, { flexSign: -1, ...opts });
}

// Leg convenience: knees flex backward (positive rx).
export function ikLeg(root, side, targetChar, opts = {}) {
  return ikChain(root, `thigh${side}`, `shin${side}`, `foot${side}`, targetChar, { flexSign: 1, ...opts });
}
