import * as THREE from 'three';
import { buildQuadSkeleton } from '../lib/rig.js';
import {
  toonMaterial, latheBody, limbMesh, facetBall, chunkyBox, facet, paintGradient,
} from '../lib/parts.js';
import { bakeClip, blendPoses, groundClip } from '../lib/clips.js';

// "Fox" — ambient village animal, the kit's first QUADRUPED.
// Rust coat, cream chest/belly/tail-tip, charcoal socks, big brush tail.
//
// Conventions (faces +Z = nose forward, hips are the REAR):
//   negative rx swings a hanging limb FORWARD (+Z), positive backward.
//
// Leg authoring: poses name a PAW TARGET (forward offset + height above the
// floor) and a 2-link solver produces the joint angles. Two corrections make
// contact exact — both were silently floating the front paws before:
//   1. The rig hangs each foot joint at (0, -shinLen, +0.01), so the last
//      link is hypot(shinLen, 0.01) long and tilted atan(0.01/shinLen)
//      forward of the shin. Solving with the naive length put the rear paw
//      7mm under the floor and the front paw 3mm over it.
//   2. The front legs hang off the CHEST, which rides 0.27m forward of the
//      hips — any hip/spine pitch moves their roots vertically. So the solve
//      runs against the joint's ACTUAL world position with the body pose
//      applied, not against a constant drop.
export function build() {
  // Segment lengths. The distal joint of each leg is the hock/carpus; the
  // metapodium below it hangs vertically to the paw, giving the canid Z-leg.
  const REAR_A = 0.17, REAR_B = 0.155, HOCK_Y = 0.108;      // femur, tibia, metatarsus
  const FRONT_A = 0.152, FRONT_B = 0.142, CARPUS_Y = 0.125; // humerus, radius, metacarpus
  const HIP_Y = 0.375, CHEST_DROP = 0.02;                   // shoulder height 0.395
  const FOOT_Z = 0.01;                                      // rig's foot-joint forward offset

  const P = {
    hipHeight: HIP_Y, bodyLen: 0.27, chestDrop: CHEST_DROP,
    neckLen: 0.135, neckPitch: -34, hipX: 0.078, shoulderX: 0.078,
    rearThighLen: REAR_A, rearShinLen: REAR_B,
    frontThighLen: FRONT_A, frontShinLen: FRONT_B,
    tailLen: 0.15,
  };
  const { root, joints } = buildQuadSkeleton(P);

  // --- Leg solver ----------------------------------------------------------
  const DEG = 180 / Math.PI, RAD = Math.PI / 180;
  const cl = (v) => Math.min(1, Math.max(-1, v));
  // Planar 2-link IK in the leg's sagittal plane. dz = paw offset forward of
  // the leg-root joint, drop = paw distance below it. kneeBack pushes the
  // middle joint rearward (front limb: elbow behind) instead of forward
  // (rear limb: stifle). Returns WORLD pitches in degrees, plus the local
  // foot angle that keeps the metapodium vertical.
  function solveLeg(a, b, dz, drop, kneeBack) {
    const bE = Math.hypot(b, FOOT_Z);            // true hip-of-shin -> foot length
    const phi = Math.atan2(FOOT_Z, b) * DEG;     // link leans forward of the shin
    const d = Math.min(Math.hypot(dz, drop), (a + bE) * 0.985);
    const knee = Math.acos(cl((a * a + bE * bE - d * d) / (2 * a * bE))) * DEG;
    const offA = Math.acos(cl((a * a + d * d - bE * bE) / (2 * a * d))) * DEG;
    const aim = Math.atan2(dz, drop) * DEG;
    const s = kneeBack ? -1 : 1;
    const th = -aim - s * offA;                  // thigh world pitch
    const shin = th + s * (180 - knee) + phi;    // shin world pitch
    return { th, sh: shin - th, ft: -shin };
  }
  const REAR_DROP = HIP_Y - 0.02 - HOCK_Y;                 // 0.255
  const FRONT_DROP = HIP_Y + CHEST_DROP - 0.02 - CARPUS_Y; // 0.260
  const REST_R = solveLeg(REAR_A, REAR_B, 0, REAR_DROP, false);
  const REST_F = solveLeg(FRONT_A, FRONT_B, 0, FRONT_DROP, true);

  // Rest tweaks BEFORE any bake: the bind pose is the standing stance, so all
  // four paws sit on y=0 and pose angles read as deltas from a real stance.
  for (const s of ['L', 'R']) {
    joints[`rearThigh${s}`].rotation.x = REST_R.th * RAD;
    joints[`rearShin${s}`].rotation.x = REST_R.sh * RAD;
    joints[`rearFoot${s}`].rotation.x = REST_R.ft * RAD;
    joints[`frontThigh${s}`].rotation.x = REST_F.th * RAD;
    joints[`frontShin${s}`].rotation.x = REST_F.sh * RAD;
    joints[`frontFoot${s}`].rotation.x = REST_F.ft * RAD;
  }
  // Level the head frame (the neck rests pitched up 22°) so nods/scans are
  // clean, and drop the tail from the rig's 35° carry to a fox's level brush.
  // Neck rides higher and the head is scaled up: from the side the old head
  // sat level with the shoulder and read as a lump, losing every contest with
  // the tail plume for "which end is the front" (render pass 3).
  joints.head.rotation.x = 30 * RAD;
  // Tail carry is the signature silhouette feature. Held level it merely
  // extends the back line and the whole animal reads as one horizontal tube
  // (first render pass) — so the base sweeps steeply UP off the rump and the
  // second joint arcs it back over, giving a plume that breaks the profile.
  joints.tail1.rotation.x = 46 * RAD;
  joints.tail2.rotation.x = -24 * RAD;
  root.updateMatrixWorld(true);
  // Rest world z of each leg root — paw targets are absolute, so a swaying
  // body slides underneath planted feet instead of dragging them along.
  const Z0 = {};
  for (const pre of ['rear', 'front']) for (const s of ['L', 'R'])
    Z0[`${pre}${s}`] = joints[`${pre}Thigh${s}`].getWorldPosition(new THREE.Vector3()).z;

  // --- Materials -----------------------------------------------------------
  const rust = toonMaterial('#cc5f28', { vertexColors: true });        // ID color
  const rustDeep = toonMaterial('#a3441a', { vertexColors: true });
  const cream = toonMaterial('#f0e3c6', { vertexColors: true });
  const sock = toonMaterial('#332e2c', { vertexColors: true, rim: 0.25 });
  const inner = toonMaterial('#7b3826', { rim: 0.2 });
  const nose = toonMaterial('#231e1d', { rim: 0.3 });
  const amber = toonMaterial('#eda52c', { rim: 0.6 });
  const pupil = toonMaterial('#1b1715', { rim: 0 });
  const G = (mesh, lo = '#6f5a4e', hi = '#ffffff') => {
    paintGradient(mesh.geometry, lo, hi);
    return mesh;
  };
  const CREAM_G = ['#8f846c', '#f6ecd6'], SOCK_G = ['#191614', '#6b615c'];
  // Lathe whose axis runs along +Z (body barrel).
  const zLathe = (profile, material, narrow = 0.84) => {
    const m = latheBody(profile, material, { facet: true, scaleZ: 1 });
    m.geometry.rotateX(Math.PI / 2);
    m.geometry.scale(narrow, 1, 1);
    return G(m);
  };

  // --- Body ----------------------------------------------------------------
  // Barrel parented to the spine: deep chest, tucked waist, heavy haunch.
  const barrel = zLathe([
    [0.015, -0.185], [0.075, -0.155], [0.101, -0.10], [0.092, -0.02],
    [0.097, 0.055], [0.108, 0.125], [0.058, 0.19],
  ], rust);
  barrel.name = 'ribcage';
  joints.spine.add(barrel);
  // Tucked well inside the barrel's underside: at 2.0 z-scale its rear end
  // hung below the narrowing waist and showed as a pale wedge between the
  // hind legs through the whole walk (render pass 3).
  const belly = G(facetBall(0.070, cream, [0.84, 0.46, 1.8], [8, 5]), ...CREAM_G);
  belly.position.set(0, -0.046, 0.015);
  joints.spine.add(belly);
  for (const s of [1, -1]) {          // haunches over the rear legs
    const haunch = G(facetBall(0.086, rust, [0.85, 1.05, 1.15], [8, 6]));
    haunch.position.set(s * 0.048, 0.0, -0.028);
    joints.hips.add(haunch);
  }
  const rump = G(facetBall(0.075, rustDeep, [1.0, 0.95, 0.9], [8, 6]));
  rump.position.set(0, 0.018, -0.088);
  joints.hips.add(rump);
  const bib = G(facetBall(0.064, cream, [0.9, 1.05, 0.65], [8, 6]), ...CREAM_G);
  bib.position.set(0, -0.03, 0.05);
  joints.chest.add(bib);
  for (const s of [1, -1]) {          // shoulder masses burying the humerus
    const shoulder = G(facetBall(0.068, rust, [0.8, 1.0, 1.05], [8, 6]));
    shoulder.position.set(s * 0.05, 0.0, 0.005);
    joints.chest.add(shoulder);
  }

  // --- Neck ---------------------------------------------------------------
  const neckMass = G(limbMesh(0.056, 0.125, rust, { taper: 1.25, facet: true }));
  neckMass.rotation.x = -Math.PI / 2;      // run along the neck's +Z
  joints.neck.add(neckMass);
  for (const s of [1, -1]) {               // ruff tufts widening the neck base
    const ruff = G(facetBall(0.05, rustDeep, [0.8, 1.15, 0.75], [7, 5]));
    ruff.position.set(s * 0.038, -0.005, 0.018);
    joints.neck.add(ruff);
  }

  // --- Head ---------------------------------------------------------------
  const skull = G(facetBall(0.083, rust, [1.0, 0.95, 1.05], [9, 7]));
  skull.position.set(0, 0.012, 0.010);
  joints.head.add(skull);
  const muzzle = G(limbMesh(0.041, 0.086, rust, { taper: 0.48, facet: true }));
  muzzle.rotation.x = -Math.PI / 2;
  muzzle.position.set(0, -0.014, 0.048);
  joints.head.add(muzzle);
  // Underjaw. At z=0.098 with a 1.95 z-stretch it hung clear of the muzzle
  // taper and the daylight between them read as a dark red gap — a broken jaw
  // (render pass 5). Now it is short enough and high enough that both ends
  // are BURIED in the muzzle and only a 2mm cream swell shows between
  // z≈0.07-0.12: a continuous underjaw with no cavity at either seam.
  const chin = G(facetBall(0.029, cream, [0.86, 0.72, 1.35], [7, 5]), ...CREAM_G);
  chin.position.set(0, -0.036, 0.086);
  joints.head.add(chin);
  // Nose pad: rounder and seated ON the muzzle tip. At r=0.023/z=0.163 it
  // overhung the taper by 30mm and its 7x5 facets read as a black brick
  // stuck to the side of the face (render pass 4).
  const snout = G(facetBall(0.020, nose, [1.12, 0.9, 0.95], [9, 7]), '#151212', '#3a3230');
  snout.position.set(0, 0.002, 0.150);
  joints.head.add(snout);
  for (const s of [1, -1]) {
    // Cheek ruff. At x=0.064/r=0.048 its outer edge stood 9mm outside the
    // r=0.083 skull and it read as a floating cream egg beside the head
    // (render pass 5). Pulled in and shrunk so its outer edge clears the
    // skull by ~1mm — a swell in the jawline, not a separate object.
    const cheek = G(facetBall(0.040, cream, [0.72, 1.0, 0.85], [7, 5]), ...CREAM_G);
    cheek.position.set(s * 0.048, -0.018, 0.022);
    joints.head.add(cheek);
    const eye = facetBall(0.021, amber, [1.0, 0.62, 0.82], [8, 6]);
    eye.position.set(s * 0.052, 0.035, 0.068);
    eye.rotation.set(0, s * 0.35, s * 0.28);
    joints.head.add(eye);
    const iris = facetBall(0.010, pupil, [1, 1, 0.7], [6, 5]);
    iris.position.set(s * 0.057, 0.034, 0.080);
    joints.head.add(iris);
    // NO mask stripe here. A box cannot lie flat on a tapering cone: at
    // x=0.045 it read as a twig beside the face (pass 4), at x=0.027 as a
    // brick glued to the snout (pass 5), and thinned and pushed forward to
    // x=0.020 its corners still broke the surface as a dark red lozenge
    // floating off the muzzle. The muzzle carries enough dark detail from the
    // nose pad alone, so the stripe is deleted rather than re-placed.
    // Ears: faceted cone + dark inner cone, in a named group so they flick.
    const ear = new THREE.Group();
    ear.name = `ear${s > 0 ? 'L' : 'R'}`;
    ear.position.set(s * 0.050, 0.066, -0.006);
    ear.rotation.set(-0.14, s * 0.18, s * 0.24);
    joints.head.add(ear);
    const shell = G(facet(new THREE.ConeGeometry(0.049, 0.132, 5), rust), '#6b3418', '#ffb27a');
    shell.position.y = 0.060;
    ear.add(shell);
    const cup = facet(new THREE.ConeGeometry(0.033, 0.098, 5), inner);
    cup.position.set(0, 0.052, 0.019);
    ear.add(cup);
  }

  // --- Legs ---------------------------------------------------------------
  // Socks cover only the LOWER half of each shin, not the whole segment: a
  // full-length charcoal shin plus charcoal metapodium turned every leg into
  // an unarticulated black pole (render pass 2) and pushed the ID colour out
  // of the bottom half of the frame.
  // The rust `lower` used to run b*0.86 (tip 16mm PAST the shin's end joint)
  // while the charcoal `boot` started at 0.62-0.68 of the shin and was only
  // 2% fatter — 140mm of two near-coincident faceted capsules, which crumpled
  // into z-fought rust/charcoal noise on every leg (render pass 5). Now the
  // rust shaft stops at 70% and the boot is a short ankle block, 7% fatter,
  // whose top cap swallows the rust tip with ~5mm of clearance all round.
  const LEG_MESH = [
    ['rear', REAR_A, REAR_B, HOCK_Y, 0.062, 0.038, 0.036, 0.037, 0.095, 0.040],
    ['front', FRONT_A, FRONT_B, CARPUS_Y, 0.056, 0.036, 0.034, 0.034, 0.088, 0.036],
  ];
  for (const [pre, a, b, meta, rUp, rLo, rCa, sockLen, sockOff, rKn] of LEG_MESH) {
    for (const s of ['L', 'R']) {
      // Cone length: a*0.85 ran 33mm PAST the joint and a bent shin swung its
      // own shaft through it (crumpled coincident faces); a*0.68 fixed that but
      // opened a visible gap at the stifle whenever the knee closed. a*0.82
      // with a gentler 0.85 taper carries the mass down to the joint, and the
      // kneeCap ball below covers the seam instead of the cone overshooting it.
      const upper = G(limbMesh(rUp, a * 0.82, rust, { taper: 0.85, facet: true }));
      joints[`${pre}Thigh${s}`].add(upper);
      // Ball at the shin's own origin: caps the knee/elbow so a folded leg
      // shows a joint instead of two cone tips meeting in mid-air.
      const kneeCap = G(facetBall(rKn, rust, [0.95, 1, 1], [7, 5]));
      joints[`${pre}Shin${s}`].add(kneeCap);
      const lower = G(limbMesh(rLo, b * 0.70, rust, { taper: 0.8, facet: true }));
      joints[`${pre}Shin${s}`].add(lower);
      const boot = G(limbMesh(rLo * 1.07, sockLen, sock, { taper: 0.88, facet: true }), ...SOCK_G);
      boot.position.y = -sockOff;
      joints[`${pre}Shin${s}`].add(boot);
      // Cannon flares slightly INTO the paw and is sized off the ankle above
      // it, so the shaft never pinches thinner than the boot. Its length is
      // solved so the bottom cap tip stops at -meta = the paw's contact plane
      // (any longer and a fatter cannon punches through the floor).
      const cannon = G(limbMesh(rCa, meta - rCa - 0.002, sock, { taper: 1.06, facet: true }), ...SOCK_G);
      joints[`${pre}Foot${s}`].add(cannon);
      const paw = G(chunkyBox(rCa * 2.15, 0.038, rCa * 2.7, sock, { radius: 0.38 }), ...SOCK_G);
      paw.position.set(0, -(meta - 0.019), 0.012);
      joints[`${pre}Foot${s}`].add(paw);
    }
  }

  // --- Tail: 2 chain joints, 4 overlapping masses + cream tip -------------
  const fluff1 = new THREE.Group(); fluff1.name = 'fluff1'; joints.tail1.add(fluff1);
  const fluff2 = new THREE.Group(); fluff2.name = 'fluff2'; joints.tail2.add(fluff2);
  // Masses are FATTER than the barrel's rear (0.101) and less elongated, so
  // the brush reads as fluff rather than as another length of body.
  const tailBase = G(limbMesh(0.060, 0.085, rust, { taper: 1.7, facet: true }));
  tailBase.rotation.x = Math.PI / 2;      // run along the tail's -Z
  fluff1.add(tailBase);
  const tailMid = G(facetBall(0.104, rust, [1.0, 1.05, 1.3], [8, 6]));
  tailMid.position.set(0, 0.004, -0.098);
  fluff1.add(tailMid);
  const tailFar = G(facetBall(0.100, rust, [0.98, 1.0, 1.25], [8, 6]));
  tailFar.position.set(0, 0, -0.055);
  fluff2.add(tailFar);
  const tailTip = G(facetBall(0.079, cream, [0.96, 0.96, 1.15], [8, 6]), ...CREAM_G);
  tailTip.position.set(0, -0.006, -0.142);
  fluff2.add(tailTip);

  // --- Pose plumbing -------------------------------------------------------
  // Solving legs needs the body pose already applied, so the scratch pass
  // poses the real hierarchy, reads world transforms, then restores rest
  // (bakeClip captures rest at call time — it must be clean).
  const SNAP = [];
  root.traverse((o) => SNAP.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]));
  const restoreRest = () => {
    for (const [o, p, q, s] of SNAP) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s); }
    root.updateMatrixWorld(true);
  };
  const qOf = (r) => new THREE.Quaternion()
    .setFromEuler(new THREE.Euler(r[0] * RAD, r[1] * RAD, r[2] * RAD, 'XYZ'));
  const applyBody = (body) => {
    restoreRest();
    for (const [jn, p] of Object.entries(body)) {
      const o = root.getObjectByName(jn);
      if (!o) continue;
      if (p.rot) o.quaternion.multiply(qOf(p.rot));   // rest * pose, as bakeClip does
      if (p.pos) o.position.add(new THREE.Vector3(p.pos[0], p.pos[1], p.pos[2]));
      if (p.scale) o.scale.set(p.scale[0], p.scale[1], p.scale[2]);
    }
    root.updateMatrixWorld(true);
  };
  const m4 = new THREE.Matrix4(), eul = new THREE.Euler(), v3 = new THREE.Vector3();
  const pitchOf = (o) => eul.setFromRotationMatrix(m4.extractRotation(o.matrixWorld), 'XYZ').x * DEG;

  const LEGS = [['rear', 'L'], ['front', 'L'], ['rear', 'R'], ['front', 'R']];
  // spec: { dz, y, pitch } — dz forward of the leg's rest station, y the paw's
  // height above the floor (0 = planted), pitch an optional toe-up in swing.
  const legDeltas = (pre, side, spec) => {
    const isRear = pre === 'rear';
    const [a, b, meta, R] = isRear
      ? [REAR_A, REAR_B, HOCK_Y, REST_R] : [FRONT_A, FRONT_B, CARPUS_Y, REST_F];
    const jt = joints[`${pre}Thigh${side}`];
    jt.getWorldPosition(v3);
    const pPitch = pitchOf(jt.parent);
    // foot JOINT sits `meta` above the paw's contact point when it hangs level
    const drop = v3.y - (meta + (spec.y || 0));
    const dz = (Z0[`${pre}${side}`] + (spec.dz || 0)) - v3.z;
    const v = solveLeg(a, b, dz, drop, !isRear);
    return {
      [`${pre}Thigh${side}`]: { rot: [v.th - pPitch - R.th, 0, 0] },
      [`${pre}Shin${side}`]: { rot: [v.sh - R.sh, 0, 0] },
      [`${pre}Foot${side}`]: { rot: [v.ft + (spec.pitch || 0) - R.ft, 0, 0] },
    };
  };
  // Build a full pose: body first (it decides where the leg roots are), then
  // the four legs solved against it.
  const mk = (body, specs) => {
    applyBody(body);
    const out = Object.assign({}, body);
    LEGS.forEach(([pre, side], i) => Object.assign(out, legDeltas(pre, side, specs[i])));
    restoreRest();
    return out;
  };

  const TAU = Math.PI * 2;
  // Tail sine sway — in EVERY clip. tail2 carries a larger amplitude on a
  // phase lag so the brush whips a beat behind its base.
  const tail = (u, a1 = 15, a2 = 20, rx1 = 0, rx2 = 0) => ({
    tail1: { rot: [rx1, a1 * Math.sin(TAU * u), 0] },
    tail2: { rot: [rx2, a2 * Math.sin(TAU * (u - 0.15)), 0] },
  });
  const bush = (s) => ({ fluff1: { scale: [s, s, 1] }, fluff2: { scale: [s, s, 1] } });
  const ears = (l, r) => ({ earL: { rot: l }, earR: { rot: r } });
  const EAR_UP = [0, 0, 0];
  // Standing paw stations, deliberately unsquare so the stance never twins.
  const STAND = [{ dz: -0.014 }, { dz: 0.018 }, { dz: -0.034 }, { dz: 0.003 }];
  const stand = (shift = 0) => STAND.map((s, i) => ({ dz: s.dz + (i % 2 ? -shift : shift) }));

  // --- idle: standing alert, 2.6s ------------------------------------------
  // Breathing = ribcage scale + a slow body lift the legs absorb (every paw
  // stays planted because the solver re-reaches after the body moves).
  const idleBody = (lift, sway, o) => blendPoses({
    hips: { pos: [0, lift, 0], rot: [0, 0, 0] },
    chest: { rot: [0, 0, 0] }, spine: { rot: [0, 0, 0] },
    neck: { rot: [0, 0, 0] }, head: { rot: [0, 0, 0] },
    ribcage: { scale: [1, 1, 1] },
  }, tail(sway, 16, 21, 0, 2), ears(EAR_UP, EAR_UP), bush(1), o);

  const idleA = mk(idleBody(0, 0.0, {
    hips: { pos: [0, 0, 0], rot: [0, -1.5, 0] },
    chest: { rot: [0, 2, 0.5] }, spine: { rot: [0.5, 0, 0] },
    neck: { rot: [0, 3, 0] }, head: { rot: [-2, 6, 1] },
    tail1: { rot: [-4, 0, 0] },
  }), stand(0));
  const idleB = mk(idleBody(0.006, 0.17, {
    hips: { pos: [0, 0.006, 0], rot: [-0.6, -1, 0] },
    chest: { rot: [-1, 1.5, 0.5] }, spine: { rot: [-1.2, 0, 0] },
    neck: { rot: [-1, 2, 0] }, head: { rot: [-1, 4, 1] },
    ribcage: { scale: [1.045, 1.05, 1.01] }, tail1: { rot: [-1, 3.4, 0] },
  }), stand(0.005));
  const idleC = mk(idleBody(0, 0.34, {
    hips: { pos: [0, 0, 0], rot: [0.4, 1, 0] },
    chest: { rot: [0.5, -2, -0.5] }, spine: { rot: [0.3, 0, 0] },
    neck: { rot: [0, -5, 0] }, head: { rot: [1, -12, -1] },
    tail1: { rot: [3, 15.2, 0] },
  }), stand(-0.005));
  // One ear flick beat — right ear only, so the pair never twins.
  const flickR = blendPoses(idleC, ears([2, 0, 3], [-28, 15, -22]));
  const idleD = mk(idleBody(0.003, 0.55, {
    hips: { pos: [0, 0.003, 0], rot: [0, 2, 0] },
    chest: { rot: [0, -3, -1] }, spine: { rot: [-0.8, 0, 0] },
    neck: { rot: [0, -7, 0] }, head: { rot: [-3, -19, -2] },
    ribcage: { scale: [1.02, 1.025, 1] }, tail1: { rot: [5, -4.9, 0] },
  }), stand(-0.006));
  const idleE = mk(idleBody(0.006, 0.78, {
    hips: { pos: [0, 0.006, 0], rot: [-0.5, 0, 0] },
    chest: { rot: [-1, 0, 0] }, spine: { rot: [-1.2, 0, 0] },
    neck: { rot: [-1, -1, 0] }, head: { rot: [-2, -4, 1] },
    ribcage: { scale: [1.04, 1.045, 1.01] }, tail1: { rot: [1, -15.2, 0] },
  }, ears([-15, 8, -11], EAR_UP)), stand(0.004));
  const idle = groundClip(root, bakeClip(root, 'idle', [
    { t: 0.0, pose: idleA },
    { t: 0.55, pose: idleB },
    { t: 1.0, pose: idleC },
    { t: 1.18, pose: flickR, ease: 'out' },
    { t: 1.30, pose: idleC, ease: 'inOut' },
    { t: 1.75, pose: idleD },
    { t: 2.15, pose: idleE },
    { t: 2.6, pose: idleA },
  ]));

  // --- walk: lateral sequence, 0.7s ---------------------------------------
  // ONE authored leg-swing cycle in 8 phases; each leg reads it at its own
  // offset — rearL 0.0, frontL 0.25, rearR 0.5, frontR 0.75 of the stride.
  // Stance spans phases 0-5 (duty 0.75), so three paws carry weight at all
  // times and the footfalls land as four separate beats.
  const T = 0.7;
  const CYCLE = [
    { dz: 0.100, y: 0, pitch: -4 },   // 0 touchdown, front of the stride
    { dz: 0.060, y: 0 },              // 1 support
    { dz: 0.020, y: 0 },              // 2 mid-stance
    { dz: -0.020, y: 0 },             // 3 support
    { dz: -0.060, y: 0 },             // 4 late support
    { dz: -0.100, y: 0, pitch: 5 },   // 5 lift-off, heel rolls up
    { dz: -0.030, y: 0.075, pitch: -10 }, // 6 swing peak, knee folded
    { dz: 0.060, y: 0.040, pitch: -6 },   // 7 reach, dropping to contact
  ];
  const OFFSET = { 'rear|L': 0, 'front|L': 2, 'rear|R': 4, 'front|R': 6 };
  // Bob is authored DOWNWARD only: the front legs stand at 88% extension, so
  // lifting the body would out-reach them, while dropping it just flexes the
  // carpus. The solver re-reaches every planted paw, so this survives
  // groundClip instead of being flattened out of the clip.
  // A smooth -0.018*(1-cos(2t)) cosine put the two minima on the FRONT
  // footfalls and glided through the hind ones, so the body never looked like
  // it caught any weight. This is a two-beat table keyed to the footfalls
  // themselves: deepest on each hind touchdown (k=0 rearL, k=4 rearR), a
  // secondary dip on each front touchdown (k=2, k=6), and a fast fall / slow
  // recovery instead of a symmetric wave.
  const BOB = [-0.022, -0.006, -0.015, -0.003, -0.022, -0.006, -0.015, -0.003];
  // Per-leg pelvis drop: with one hind paw airborne the unsupported side of
  // the pelvis sags toward it. +z rolls the RIGHT hip down, and the right hind
  // is in swing at k=2-3, the left at k=6-7 — so this sharpens the sine roll
  // into a stride-locked drop rather than doubling it.
  const HIND_SWING = [0, 0.30, 1, 0.55, 0, -0.30, -1, -0.55];
  const walkKeys = [];
  for (let k = 0; k <= 8; k++) {
    const u = k / 8;
    const sw = Math.sin(TAU * u), sw2 = Math.sin(TAU * 2 * u);
    const bob = BOB[k % 8];
    const hipDrop = HIND_SWING[k % 8];
    const specs = LEGS.map(([pre, side]) => {
      const c = CYCLE[(((k - OFFSET[`${pre}|${side}`]) % 8) + 8) % 8];
      return { dz: c.dz * (pre === 'front' ? 0.85 : 1), y: c.y, pitch: c.pitch || 0 };
    });
    walkKeys.push({
      t: T * u,
      pose: mk(blendPoses(tail(u, 15, 20, 3 * sw2, -4), {
        // hips and chest counter-pitch and counter-yaw: the spine undulates
        // ~3° while the head counter-swings against it. The pelvic z-roll is
        // the walk's main weight cue and was far too timid at 1.6°.
        hips: { pos: [0, bob, 0], rot: [1.2 * sw2, 2.4 * sw, 5 * sw + 2.5 * hipDrop] },
        chest: { rot: [-2.6 * sw2, -2.8 * sw, -1.3 * sw] },
        spine: { rot: [0.8 * sw2, 1.2 * sw, 0] },
        neck: { rot: [0.6 * sw2, -0.8 * sw, 0] },
        head: { rot: [1.4 * sw2, -5 * sw, 2.5 * sw] },
        ribcage: { scale: [1, 1, 1] },
      }, ears([2 * sw, 0, 0], [-2 * sw, 0, 0]), bush(1)), specs),
    });
  }
  const walk = groundClip(root, bakeClip(root, 'walk', walkKeys));

  // --- startle: 0.7s one-shot ---------------------------------------------
  // Crouch-flinch DOWN and BACK, ears pinned flat, tail bushed, then release.
  // The game plays this the instant the player closes in, before the flee.
  const restBody = blendPoses({
    hips: { pos: [0, 0, 0], rot: [0, 0, 0] }, chest: { rot: [0, 0, 0] },
    spine: { rot: [0, 0, 0] }, neck: { rot: [0, 0, 0] }, head: { rot: [0, 0, 0] },
    ribcage: { scale: [1, 1, 1] },
  }, tail(0, 10, 13, -2, 2), ears(EAR_UP, EAR_UP), bush(1));
  const rest0 = mk(restBody, stand(0));
  // Pinned ears must lay BACK along the skull: the ear cone points +Y, so
  // rx must be NEGATIVE (Rx tips +Y toward +Z = forward). At +60 the ears
  // flopped forward past the muzzle for 10 frames of the strip (pass 5).
  const PIN_L = [-62, -20, -28], PIN_R = [-62, 20, 28];
  // depth/back drive the crouch; tw is a twist that keeps the hold alive.
  const crouch = (depth, back, fluff, pinL, pinR, tw = 0) => mk(blendPoses(
    tail(0, 8, 10, 26 + depth * 90, 16),
    {
      hips: { pos: [0, -depth, -back], rot: [-4 - depth * 26, tw, 0] },
      chest: { rot: [7 + depth * 34, -tw, 0] },
      spine: { rot: [4 + depth * 26, tw * 0.5, 0] },
      neck: { rot: [10 + depth * 50, tw, 0] },
      head: { rot: [8 + depth * 34, -tw * 2, 0] },
      ribcage: { scale: [1.02, 1.02, 1] },
    },
    ears(pinL, pinR), bush(fluff)
  ), stand(0));
  // Anticipation. Without it the fox simply drops: one beat of the head
  // snapping UP and the weight rocking BACK over the hips before the crouch
  // gives the flinch a cause and doubles the apparent speed of the drop.
  const alert = mk(blendPoses(tail(0, 12, 15, 14, 8), {
    hips: { pos: [0, 0.004, -0.012], rot: [3, 0, 0] },
    chest: { rot: [-5, 0, 0] }, spine: { rot: [-3, 0, 0] },
    neck: { rot: [-9, 0, 0] }, head: { rot: [-7, 0, 0] },
    ribcage: { scale: [1.05, 1.05, 1] },
  }, ears([-5, 4, -6], [-5, -4, 6]), bush(1.14)), stand(0));
  const release = mk(blendPoses(tail(0.05, 10, 13, 4, 4), {
    hips: { pos: [0, 0.005, 0], rot: [1, 0, 0] }, chest: { rot: [-2, 0, 0] },
    spine: { rot: [-1, 0, 0] }, neck: { rot: [-3, 0, 0] }, head: { rot: [-4, 2, 0] },
    ribcage: { scale: [1.03, 1.03, 1] },
  }, ears([-8, 3, -4], [-8, -3, 4]), bush(1.08)), stand(0.004));
  const startle = groundClip(root, bakeClip(root, 'startle', [
    { t: 0.0, pose: rest0, ease: 'out' },
    // anticipation up-and-back, then a 0.06s snap to the deepest crouch
    { t: 0.04, pose: alert, ease: 'in' },
    // ease 'linear' out of the deep key: 'out' front-loads the segment, which
    // spends the creep in the first 0.1s and then stalls — the same stillness
    // the four jitter keys were trying to paper over.
    { t: 0.10, pose: crouch(0.074, 0.034, 1.50, PIN_L, PIN_R, 6), ease: 'linear' },
    // The hold used to be four keys 5mm apart — 0.31s of jitter that read as
    // a broken loop. It is now ONE moving key: the fox stays pinned low while
    // creeping 26mm backward and swiveling 12° the other way, so the whole
    // hold is continuous motion with no second pose to snap to.
    { t: 0.42, pose: crouch(0.070, 0.060, 1.46, PIN_L, PIN_R, -6), ease: 'in' },
    { t: 0.50, pose: crouch(0.028, 0.016, 1.22, [-30, -11, -15], [-28, 11, 14], -1), ease: 'inOut' },
    { t: 0.60, pose: release, ease: 'inOut' },
    { t: 0.7, pose: rest0 },
  ]));

  return {
    root,
    clips: [idle, walk, startle],
    meta: {
      height: 0.64, name: 'Fox', role: 'ambient',
      requiredClips: ['idle', 'walk', 'startle'],
    },
  };
}
