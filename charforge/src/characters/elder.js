import * as THREE from 'three';
import { buildSkeleton } from '../lib/rig.js';
import {
  toonMaterial, latheBody, limbMesh, ball, facetBall, chunkyBox, facet, paintGradient,
} from '../lib/parts.js';
import { bakeClip, mirrorPose, blendPoses, groundClip } from '../lib/clips.js';

// "Elder" — village quest-giver NPC. Kind, stooped old woman: silver hair in
// a tight bun, warm plum shawl (ID color) over a sand dress, round brass
// spectacles, a gnarled cane in the right hand that reaches the ground. The
// stoop lives in the REST pose (spine/chest rx), so every clip below is
// authored as small DELTAS from an already-hunched baseline.
// Conventions: faces +Z; negative rx swings a hanging limb forward; positive
// rx on an UPWARD-extending bone (spine/chest) tips its top forward (+Z) —
// that is how the stoop is built. Positive ry turns the character's left
// (+X) side forward.
export function build() {
  const P = {
    hipHeight: 0.44, spineLen: 0.07, chestLen: 0.145, neckLen: 0.05, headLen: 0.04,
    shoulderX: 0.125, shoulderY: 0.02,
    upperArmLen: 0.125, forearmLen: 0.105,
    hipX: 0.075, thighLen: 0.185, shinLen: 0.175,
  };
  const { root, joints } = buildSkeleton(P);
  const D = THREE.MathUtils.degToRad;

  // --- Rest tweaks (BEFORE any bake) --------------------------------------
  // The stoop: spine + chest both tip forward a few degrees. Positive rx on
  // these upward bones swings their tops toward +Z (see file header).
  joints.spine.rotation.x = D(14);
  joints.chest.rotation.x = D(11);
  // Partial counter-tilt so she still looks mostly ahead, not at her feet.
  joints.neck.rotation.x = D(-10);

  // Cane arm: shoulder flared out and slightly forward, elbow bent so the
  // grip sits beside the hip, wrist curled over the handle. NEVER posed in
  // idle/talk (weight rests on the cane); walk swings it gently.
  joints.upperArmR.rotation.set(D(-4), 0, D(-8));
  joints.forearmR.rotation.x = D(-16);
  joints.handR.rotation.x = D(10);
  // Free hand: relaxed at the side, ready for the shawl-adjust/talk gestures.
  joints.upperArmL.rotation.set(D(-2), 0, D(6));
  joints.forearmL.rotation.x = D(-14);

  // --- Materials -----------------------------------------------------------
  const vc = (c, extra) => toonMaterial(c, { vertexColors: true, ...extra });
  const G = (mesh, lo, hi) => { paintGradient(mesh.geometry, lo, hi); return mesh; };
  const skin = vc('#d9ab80');
  const plum = vc('#7c4d72');        // ID color — shawl
  const plumDark = vc('#5a3653');
  const sand = vc('#c8a86e');        // dress base
  const cream = vc('#f2e6c9');
  const creamShade = vc('#d8c69a');
  const shoeBrown = vc('#4a3623');
  const silver = vc('#d8dbe0');
  const silverShade = vc('#aeb2ba');
  const brass = toonMaterial('#b8933f', { rim: 0.45 });
  const wood = vc('#6b4a30');
  const dark = toonMaterial('#241d16', { rim: 0 });
  const white = toonMaterial('#fffaf0', { rim: 0 });
  const iris = toonMaterial('#6b4a2c');

  // --- Torso: sand dress (skirt shows below), plum shawl over the top -----
  const dress = G(latheBody(
    [[0.0, -0.19], [0.205, -0.175], [0.195, -0.05], [0.165, 0.02],
     [0.175, 0.09], [0.17, 0.17], [0.15, 0.25], [0.0, 0.29]],
    sand, { facet: true }
  ), '#8a6f42', '#e6cf9c');
  joints.hips.add(dress);
  const underskirt = G(latheBody(
    [[0.0, -0.205], [0.19, -0.185], [0.185, -0.165]],
    cream, { facet: true }
  ), '#a89370', '#fff9e8');
  joints.hips.add(underskirt);
  // Cream apron panel — a small charm/support-color detail on the belly.
  const apron = G(chunkyBox(0.16, 0.19, 0.03, cream, { radius: 0.3 }), '#a89370', '#fff9e8');
  apron.position.set(0, -0.02, 0.175);
  apron.rotation.x = 0.12;
  joints.hips.add(apron);
  const apronTie = G(chunkyBox(0.19, 0.03, 0.03, creamShade, { radius: 0.3 }), '#a89370', '#eadcb2');
  apronTie.position.set(0, 0.075, 0.165);
  joints.hips.add(apronTie);

  // Shawl: wraps the shoulders and upper chest, wider than the dress at the
  // same heights so it reads as a garment worn OVER it, no z-fighting.
  const shawl = G(latheBody(
    [[0.0, 0.0], [0.225, 0.01], [0.25, 0.09], [0.22, 0.17], [0.195, 0.235], [0.0, 0.285]],
    plum, { facet: true }
  ), '#3f2539', '#a875a0');
  joints.hips.add(shawl);
  // Front brooch closing the shawl.
  const brooch = facetBall(0.028, brass, [1, 1, 0.6], [6, 5]);
  brooch.position.set(0, 0.185, 0.235);
  joints.hips.add(brooch);
  // Collar trim — thin ring at the neckline, parented to CHEST so it (like
  // a real collar) follows the shoulders through breathing/talk poses.
  const collar = G(latheBody([[0.10, -0.02], [0.115, 0.0], [0.10, 0.02]], plumDark, { facet: true }),
    '#3f2539', '#a875a0');
  collar.position.y = 0.02;
  joints.chest.add(collar);

  // Neck: a short skin bridge between collar and head — without it the
  // stoop's counter-tilt (head rocked back relative to a forward-leaning
  // chest) opens a gap that shows background through in side views.
  const neckMesh = G(limbMesh(0.075, P.neckLen + 0.05, skin, { taper: 1.1, facet: true }),
    '#b3835c', '#f0c99a');
  neckMesh.position.y = 0.03;
  joints.neck.add(neckMesh);

  // --- Head: face, spectacles, silver bun -----------------------------------
  const head = G(ball(0.125, skin, [1, 1.0, 0.95]), '#b3835c', '#f0c99a');
  head.position.y = 0.115;
  joints.head.add(head);
  const nose = G(ball(0.028, skin, [0.85, 1, 1.25]));
  nose.position.set(0, 0.075, 0.118);
  nose.rotation.x = D(12);
  joints.head.add(nose);
  for (const s of [-1, 1]) {
    const ear = G(ball(0.028, skin, [0.7, 1, 0.85]));
    ear.position.set(s * 0.122, 0.07, 0.0);
    joints.head.add(ear);
    // Big friendly eyes — sclera/iris/pupil/highlight, gentle downward tilt.
    const sclera = ball(0.036, white, [1, 1.1, 0.35]);
    sclera.position.set(s * 0.052, 0.085, 0.10);
    sclera.rotation.y = D(s * 12);
    joints.head.add(sclera);
    const irisM = ball(0.024, iris, [1, 1.15, 0.28]);
    irisM.position.set(s * 0.051, 0.082, 0.115);
    irisM.rotation.y = D(s * 12);
    joints.head.add(irisM);
    const pupil = ball(0.012, dark, [1, 1.25, 0.28]);
    pupil.position.set(s * 0.05, 0.08, 0.121);
    pupil.rotation.y = D(s * 12);
    joints.head.add(pupil);
    const hi = ball(0.008, white, [1, 1, 0.5]);
    hi.position.set(s * 0.05 - 0.009, 0.093, 0.123);
    joints.head.add(hi);
    // Soft grey brow — a few degrees of kindly arch, not a fierce angle.
    const brow = G(chunkyBox(0.05, 0.01, 0.014, silverShade, { radius: 0.4 }));
    brow.position.set(s * 0.05, 0.118, 0.108);
    brow.rotation.z = D(s * -10);
    joints.head.add(brow);
    // Round spectacles: a thin torus ring in front of each eye.
    const ringGeo = new THREE.TorusGeometry(0.042, 0.006, 6, 14);
    const ring = facet(ringGeo, brass);
    ring.position.set(s * 0.052, 0.086, 0.128);
    joints.head.add(ring);
  }
  // Spectacle bridge — tiny bar joining the two lenses.
  const bridge = chunkyBox(0.03, 0.007, 0.007, brass, { radius: 0.4 });
  bridge.position.set(0, 0.086, 0.132);
  joints.head.add(bridge);

  // Silver hair: short fringe at the front, tight bun at the back.
  const fringe = G(facetBall(0.09, silver, [1.08, 0.5, 0.85], [7, 5]), '#8f939c', '#eef0f4');
  fringe.position.set(0, 0.15, 0.075);
  joints.head.add(fringe);
  const cap = G(facetBall(0.115, silver, [1.05, 0.85, 0.95], [8, 6]), '#8f939c', '#eef0f4');
  cap.position.set(0, 0.135, -0.015);
  joints.head.add(cap);
  const bun = G(facetBall(0.075, silver, [1.0, 0.95, 0.9], [7, 6]), '#8f939c', '#eef0f4');
  bun.position.set(0, 0.15, -0.135);
  joints.head.add(bun);
  const bunWrap = facet(new THREE.TorusGeometry(0.06, 0.012, 5, 12), silverShade);
  bunWrap.rotation.x = Math.PI / 2;
  bunWrap.position.set(0, 0.15, -0.135);
  joints.head.add(bunWrap);

  // --- Arms & legs -----------------------------------------------------
  for (const s of ['L', 'R']) {
    const side = s === 'L' ? 1 : -1;
    // Long dress sleeve down to the wrist (sand), aged skin only at the hand.
    const sleeve = G(limbMesh(0.042, P.upperArmLen, sand, { taper: 0.9, facet: true }),
      '#8a6f42', '#e6cf9c');
    sleeve.position.y = -0.028;   // tuck the capsule's top cap under the shawl
    joints[`upperArm${s}`].add(sleeve);
    const cuffSleeve = G(limbMesh(0.036, P.forearmLen, sand, { taper: 1.05, facet: true }),
      '#8a6f42', '#e6cf9c');
    joints[`forearm${s}`].add(cuffSleeve);
    const cuffTrim = G(facet(new THREE.TorusGeometry(0.035, 0.008, 5, 12), cream), '#a89370', '#eadcb2');
    cuffTrim.rotation.x = Math.PI / 2;
    cuffTrim.position.y = -0.09;
    joints[`forearm${s}`].add(cuffTrim);
    const hand = G(facetBall(0.04, skin, [1, 0.92, 1.05], [6, 5]), '#b3835c', '#f0c99a');
    hand.position.y = -0.02;
    joints[`hand${s}`].add(hand);
    // Legs: cream stockings, small dark slipper. Skirt covers the thigh, so
    // only a sliver of stocking and the shoe read below the hem.
    const thigh = G(limbMesh(0.055, P.thighLen, cream, { taper: 0.95, facet: true }), '#a89370', '#eadcb2');
    joints[`thigh${s}`].add(thigh);
    const shin = G(limbMesh(0.046, P.shinLen - 0.02, cream, { taper: 1.04, facet: true }), '#a89370', '#eadcb2');
    joints[`shin${s}`].add(shin);
    const shoe = G(chunkyBox(0.085, 0.05, 0.125, shoeBrown, { radius: 0.4 }), '#241a10', '#6b4a30');
    shoe.position.set(0, -0.005, 0.025);
    joints[`foot${s}`].add(shoe);
  }

  // --- Cane: gnarled wood, held in the right hand, tip reaching the floor --
  // A "mount" cancels handR's full REST rotation (mika's basket trick,
  // generalized) so the shaft hangs world-vertical by default — any pose
  // DELTA later authored on upperArmR/forearmR/handR then reads as the
  // cane's own tilt. Must cancel the WORLD rotation, not just the arm-local
  // chain: the stoop puts real rotation on spine/chest too, upstream of the
  // arm, so a purely-local product leaves a residual tilt that shortens the
  // cane's effective drop — invisible at a few degrees of stoop, but a
  // measurable few centimeters at this character's forward lean.
  root.updateMatrixWorld(true);
  const handWorldQ = joints.handR.getWorldQuaternion(new THREE.Quaternion());
  const caneMount = new THREE.Group();
  caneMount.name = 'caneMount';
  caneMount.quaternion.copy(handWorldQ.clone().invert());
  caneMount.position.set(0, -0.02, 0.015);
  joints.handR.add(caneMount);

  // Length is derived from the MOUNT's own world height (not the hand
  // joint's), minus the tip ball's radius, so the tip's FLOOR SURFACE — not
  // its center — lands at y=0.
  root.updateMatrixWorld(true);
  const tipRadius = 0.02;
  const mountWorldY = caneMount.getWorldPosition(new THREE.Vector3()).y;
  const caneLen = Math.max(0.1, mountWorldY - tipRadius);

  const cane = new THREE.Group();
  cane.name = 'cane';
  caneMount.add(cane);
  const shaft = G(limbMesh(0.02, caneLen, wood, { taper: 1, facet: true }), '#3f2b1c', '#8a6440');
  cane.add(shaft);
  // Gnarled knots along the shaft.
  for (const u of [0.28, 0.58, 0.8]) {
    const knot = G(facetBall(0.026, wood, [1, 0.8, 1], [6, 4]), '#3f2b1c', '#8a6440');
    knot.position.set((u % 2 ? 1 : -1) * 0.012, -caneLen * u, 0.006);
    cane.add(knot);
  }
  // Crook handle, curling forward above the grip.
  const crookGeo = new THREE.TorusGeometry(0.045, 0.016, 6, 12, Math.PI * 1.15);
  const crook = G(facet(crookGeo, wood), '#3f2b1c', '#8a6440');
  crook.rotation.set(0, Math.PI / 2, Math.PI * 0.15);
  crook.position.set(0, 0.03, 0.01);
  cane.add(crook);
  // Tip — the object the weapon gate probes.
  const caneTip = G(facetBall(tipRadius, wood, [1, 0.85, 1], [6, 4]), '#3f2b1c', '#8a6440');
  caneTip.name = 'caneTip';
  caneTip.position.set(0, -caneLen, 0);
  cane.add(caneTip);

  // --- Clips ---------------------------------------------------------------

  // Idle (3s loop): calm breathing, tiny head nods, weight on the cane — the
  // cane arm (upperArmR/forearmR/handR) is NEVER touched below, so it (and
  // the cane) stays perfectly still and planted, exactly like Mika's basket
  // arm. One shawl-adjust beat around t=2s: the free left hand rises to the
  // collar and settles back.
  const legRest = {
    thighL: { rot: [-2, 0, 0] }, shinL: { rot: [3, 0, 0] }, footL: { rot: [-1, 0, 0] },
    thighR: { rot: [-1.5, 0, 0] }, shinR: { rot: [2.5, 0, 0] }, footR: { rot: [-1, 0, 0] },
  };
  const breatheA = {
    ...legRest,
    hips: { pos: [0, 0, 0], rot: [1, -1, 0.5] },
    chest: { rot: [2, 1, -0.5] },
    head: { rot: [-2, 2, 0] },
  };
  const breatheIn = {
    ...legRest,
    hips: { pos: [0, 0.006, 0], rot: [1.5, -1, 0.5] },
    chest: { rot: [3.5, 1, -0.5] },
    head: { rot: [-3, 2, 0] },
  };
  const shawlAdjust = {
    ...legRest,
    hips: { pos: [0.004, 0.002, 0], rot: [1, 2, 1] },
    chest: { rot: [3, 3, -1] },
    head: { rot: [-5, 8, 2] },
    upperArmL: { rot: [-40, 10, -6] }, forearmL: { rot: [-38, 0, 0] }, handL: { rot: [10, 0, 0] },
  };
  const shawlAdjustHold = {
    ...legRest,
    hips: { pos: [0.004, 0.003, 0], rot: [1, 2, 1] },
    chest: { rot: [3, 3, -1] },
    head: { rot: [-4, 7, 2] },
    upperArmL: { rot: [-44, 11, -7] }, forearmL: { rot: [-40, 0, 0] }, handL: { rot: [8, 0, 0] },
  };
  const idle = groundClip(root, bakeClip(root, 'idle', [
    { t: 0.0, pose: breatheA },
    { t: 0.9, pose: breatheIn },
    { t: 1.7, pose: breatheA },
    { t: 2.0, pose: shawlAdjust },
    { t: 2.35, pose: shawlAdjustHold },
    { t: 2.75, pose: breatheA },
    { t: 3.0, pose: breatheA },
  ]));

  // Walk (1.0s loop): SLOW shuffle, short steps, modest ~2%-height bob from
  // real support-knee extension change. The cane arm swings gently and, once
  // per cycle, dips to plant the tip near the floor in rhythm with the
  // stride (kept shy of y=0 off-plant so it never fights groundClip's
  // foot-driven hip height the rest of the cycle).
  const T = 1.0;
  const contactL = {
    hips: { pos: [0, -0.006, 0], rot: [3, 10, -0.5] },
    chest: { rot: [2, -11, 0.5] },
    head: { rot: [-3, 3, 0] },
    thighL: { rot: [-16, 0, 0] }, shinL: { rot: [14, 0, 0] }, footL: { rot: [2, 0, 0] },
    thighR: { rot: [12, 0, 0] }, shinR: { rot: [18, 0, 0] }, footR: { rot: [-14, 0, 0] },
    upperArmL: { rot: [10, 0, 8] }, forearmL: { rot: [-10, 0, 0] },
  };
  const downL = {
    hips: { pos: [0, -0.022, 0], rot: [4, 7, 2.5] },
    chest: { rot: [3, -8, -1.5] },
    head: { rot: [-4, 1, -0.5] },
    thighL: { rot: [-11, 0, 0] }, shinL: { rot: [34, 0, 0] }, footL: { rot: [-24, 0, 0] },
    thighR: { rot: [16, 0, 0] }, shinR: { rot: [32, 0, 0] }, footR: { rot: [-20, 0, 0] },
    upperArmL: { rot: [7, 0, 8] }, forearmL: { rot: [-11, 0, 0] },
    upperArmR: { rot: [10, -2, -15] }, forearmR: { rot: [-16, 0, 0] }, handR: { rot: [10, 0, 0] },
  };
  const passL = {
    hips: { pos: [0, 0.002, 0], rot: [2, 0, 1] },
    chest: { rot: [2.5, 0.5, -0.5] },
    head: { rot: [-3, 0, 0] },
    thighL: { rot: [-2, 0, 0] }, shinL: { rot: [3, 0, 0] }, footL: { rot: [0, 0, 0] },
    thighR: { rot: [-1.5, 0, 0] }, shinR: { rot: [40, 0, 0] }, footR: { rot: [-16, 0, 0] },
    upperArmL: { rot: [2, 0, 6] }, forearmL: { rot: [-13, 0, 0] },
    upperArmR: { rot: [-3, -1, -15] }, forearmR: { rot: [-16, 0, 0] }, handR: { rot: [10, 0, 0] },
  };
  const swingMidL = {
    hips: { pos: [0, 0.006, 0], rot: [2, -3, 0] },
    chest: { rot: [2.5, 3, 0] },
    head: { rot: [-3, 0, 0] },
    thighL: { rot: [1, 0, 0] }, shinL: { rot: [4, 0, 0] }, footL: { rot: [-4, 0, 0] },
    thighR: { rot: [-8, 0, 0] }, shinR: { rot: [32, 0, 0] }, footR: { rot: [-18, 0, 0] },
    upperArmL: { rot: [-3, 0, 6] }, forearmL: { rot: [-15, 0, 0] },
    upperArmR: { rot: [-8, 0, -14] }, forearmR: { rot: [-16, 0, 0] }, handR: { rot: [9, 0, 0] },
  };
  const upL = {
    hips: { pos: [0, 0.01, 0], rot: [2, -6, -1] },
    chest: { rot: [2.5, 6, 0.5] },
    head: { rot: [-3, -1, 0] },
    thighL: { rot: [5, 0, 0] }, shinL: { rot: [4, 0, 0] }, footL: { rot: [-8, 0, 0] },
    thighR: { rot: [-14, 0, 0] }, shinR: { rot: [20, 0, 0] }, footR: { rot: [-10, 0, 0] },
    upperArmL: { rot: [-7, 0, 6] }, forearmL: { rot: [-17, 0, 0] },
    upperArmR: { rot: [-14, 1, -14] }, forearmR: { rot: [-15, 0, 0] }, handR: { rot: [8, 0, 0] },
  };
  // Plant: once per cycle the cane arm dips forward-down (extra negative rx
  // on the shoulder/elbow beyond rest) so the tip taps near the floor.
  const plantL = {
    hips: { pos: [0, 0.003, 0], rot: [3, -9, -1.5] },
    chest: { rot: [2.5, 9, 1] },
    head: { rot: [-4, -2, 0] },
    thighL: { rot: [8, 0, 0] }, shinL: { rot: [4, 0, 0] }, footL: { rot: [-12, 0, 0] },
    thighR: { rot: [-18, 0, 0] }, shinR: { rot: [12, 0, 0] }, footR: { rot: [-4, 0, 0] },
    upperArmL: { rot: [-11, 0, 6] }, forearmL: { rot: [-16, 0, 0] },
    upperArmR: { rot: [-30, 3, -13] }, forearmR: { rot: [-6, 0, 0] }, handR: { rot: [4, 0, 0] },
  };
  const K = (base, r) => blendPoses(base, r);
  const walk = groundClip(root, bakeClip(root, 'walk', [
    { t: 0, pose: contactL },
    { t: T * 0.12, pose: downL },
    { t: T * 0.25, pose: passL },
    { t: T * 0.35, pose: swingMidL },
    { t: T * 0.45, pose: upL },
    { t: T * 0.5, pose: K(mirrorPose(contactL), plantL) },
    { t: T * 0.62, pose: mirrorPose(downL) },
    { t: T * 0.75, pose: mirrorPose(passL) },
    { t: T * 0.85, pose: mirrorPose(swingMidL) },
    { t: T * 0.95, pose: mirrorPose(upL) },
    { t: T, pose: contactL },
  ]));

  // Talk (1.6s loop): warm gesturing while dialogue is open. Cane arm stays
  // planted (weight on the cane); the free left hand rises palm-up, head
  // tilts, a gentle nod. Must loop smoothly and read friendly.
  const talkBase = {
    thighL: { rot: [-2, 0, 0] }, shinL: { rot: [3, 0, 0] }, footL: { rot: [-1, 0, 0] },
    thighR: { rot: [-1.5, 0, 0] }, shinR: { rot: [2.5, 0, 0] }, footR: { rot: [-1, 0, 0] },
  };
  const talkA = {
    ...talkBase,
    hips: { pos: [0, 0, 0], rot: [1, -2, 0.5] },
    chest: { rot: [2, 2, -0.5] },
    head: { rot: [-3, -3, 1] },
    upperArmL: { rot: [-8, 4, -10] }, forearmL: { rot: [-20, 0, 0] }, handL: { rot: [6, 0, 0] },
  };
  const talkB = {
    ...talkBase,
    hips: { pos: [0, 0.006, 0], rot: [0.5, 1, -0.5] },
    chest: { rot: [1, -3, 0.5] },
    head: { rot: [-5, 4, -1] },
    upperArmL: { rot: [-36, 8, -16] }, forearmL: { rot: [-46, 0, 0] }, handL: { rot: [-16, 0, 0] },
  };
  const talkC = {
    ...talkBase,
    hips: { pos: [0, 0.002, 0], rot: [1.5, -3, 0] },
    chest: { rot: [2.5, 3, -1] },
    head: { rot: [-2, -5, 1.5] },
    upperArmL: { rot: [-14, 5, -12] }, forearmL: { rot: [-28, 0, 0] }, handL: { rot: [0, 0, 0] },
  };
  const talkD = {
    ...talkBase,
    hips: { pos: [0, 0, 0], rot: [1, 0.5, 0] },
    chest: { rot: [2, -0.5, 0] },
    head: { rot: [-3.5, 0, 0.5] },
    upperArmL: { rot: [-2, 2, -9] }, forearmL: { rot: [-16, 0, 0] }, handL: { rot: [8, 0, 0] },
  };
  const talk = bakeClip(root, 'talk', [
    { t: 0.0, pose: talkA },
    { t: 0.45, pose: talkB },
    { t: 0.9, pose: talkC },
    { t: 1.3, pose: talkD },
    { t: 1.6, pose: talkA },
  ]);

  // Uniform bump to the ~1.15m brief target (proportions above were tuned
  // and gate-verified at their native ~1.0m scale; scaling the whole root
  // about the origin keeps feet at y=0 and every ratio intact).
  root.scale.setScalar(1.13);

  return {
    root,
    clips: [idle, walk, talk],
    meta: { height: 1.15, name: 'Elder', role: 'npc', requiredClips: ['idle', 'walk', 'talk'] },
  };
}
