import * as THREE from 'three';
import { buildSkeleton } from '../lib/rig.js';
import {
  toonMaterial, latheBody, limbMesh, ball, facetBall, chunkyBox, facet, paintGradient,
  conformalStrap, profileRadius,
} from '../lib/parts.js';
import { bakeClip, mirrorPose, blendPoses, groundClip } from '../lib/clips.js';

// "Mika" — cheerful young villager NPC. Teal pinafore dress (ID color) over
// a cream blouse, chestnut twin braids, big hazel anime eyes, a basket
// carried in the crook of the left arm. Background life for the mini-game:
// idle / walk / talk only, no attack.
// Conventions: faces +Z; negative rx swings a hanging limb forward; positive
// rx past ~55 is impossible; positive ry turns the character's left (+X)
// side forward (so a positive head.ry reads as "looking to her left").
export function build() {
  const P = {
    hipHeight: 0.49, spineLen: 0.09, chestLen: 0.16, neckLen: 0.12, headLen: 0.045,
    shoulderX: 0.155, shoulderY: 0.08,
    upperArmLen: 0.155, forearmLen: 0.135,
    hipX: 0.08, thighLen: 0.21, shinLen: 0.20,
  };
  const { root, joints } = buildSkeleton(P);
  const D = THREE.MathUtils.degToRad;

  // Rest tweaks (BEFORE any bake). Right arm hangs relaxed at the side.
  // Left arm is bent to cradle the basket and NEVER appears in any clip
  // pose key below, so it (and the basket riding on it) stays perfectly
  // rigid through idle/walk/talk — the simplest way to satisfy "basket
  // stays upright/steady in every clip".
  joints.upperArmL.rotation.set(D(-8), 0, D(20));
  joints.forearmL.rotation.x = D(-84);
  joints.handL.rotation.x = D(8);
  joints.upperArmR.rotation.z = D(-10);

  // --- Materials -------------------------------------------------------
  const vc = (c, extra) => toonMaterial(c, { vertexColors: true, ...extra });
  const G = (mesh, lo, hi) => { paintGradient(mesh.geometry, lo, hi); return mesh; };
  const skin = vc('#f2bd93');
  const teal = vc('#278f78');        // ID color — pinafore
  const tealDark = vc('#1c6c5b');
  const cream = vc('#f5e9cc');
  const creamShade = vc('#dccaa0');
  const chestnut = vc('#5c3820');
  const chestnutDark = vc('#3d2313');
  const shoeBrown = vc('#5a3a22');
  const hazel = toonMaterial('#8a6a2e');
  const dark = toonMaterial('#241d16', { rim: 0 });
  const white = toonMaterial('#fffdf6', { rim: 0 });
  const freckle = toonMaterial('#c17a4d', { rim: 0 });
  const wicker = vc('#a97a4a');
  const wickerDark = vc('#7d5530');

  // --- Torso: cream blouse base + teal pinafore overlay -------------------
  // The pinafore IS the dress — one continuous teal lathe body from the
  // skirt hem up through the bodice to the shoulders, so teal (the ID
  // color) dominates the silhouette instead of reading as a small patch on
  // a cream cylinder. The cream blouse only peeks at the collar, the puff
  // sleeves, and a thin underskirt sliver right at the hem.
  const dress = G(latheBody(
    [[0.0, -0.235], [0.195, -0.20], [0.175, -0.08], [0.145, -0.015],
     [0.16, 0.03], [0.16, 0.15], [0.145, 0.235], [0.0, 0.29]],
    teal, { facet: true }
  ), '#0f5344', '#4fc4a5');
  joints.hips.add(dress);
  // Underskirt: a thin cream sliver riding tight under the dress hem — no
  // gap, unlike a separate oversized trim ring floating below.
  const underskirt = G(latheBody(
    [[0.0, -0.255], [0.20, -0.225], [0.198, -0.205]],
    cream, { facet: true }
  ), '#a89370', '#fff9e8');
  joints.hips.add(underskirt);
  // Blouse collar: a thin cream ring right at the neckline, above the dress.
  const collar = G(latheBody([[0.13, 0.225], [0.145, 0.25], [0.125, 0.27]], cream, { facet: true }),
    '#a89370', '#fff9e8');
  joints.hips.add(collar);

  // Waist sash — darker teal band at the natural waist.
  const sash = G(latheBody([[0.15, -0.03], [0.17, 0.0], [0.15, 0.03]], tealDark, { facet: true }));
  joints.hips.add(sash);
  const buckle = G(chunkyBox(0.045, 0.04, 0.02, cream, { radius: 0.35 }), '#a89370', '#fff9e8');
  buckle.position.set(0, 0.0, 0.165);
  joints.hips.add(buckle);

  // Pinafore straps: thin conformal bands hugging the dress curve from the
  // waist, over each shoulder, to the back — not flat slabs floating proud
  // of the chest.
  // Flat (non-vertexColors) material for the strap segments — conformalStrap
  // builds plain BoxGeometry with no color attribute, so a vertexColors
  // material on it reads an unset attribute as black.
  const strapMat = toonMaterial('#155e4d');
  const dressR = profileRadius([[0.175, -0.08], [0.145, -0.015], [0.16, 0.03], [0.16, 0.15], [0.145, 0.235]]);
  for (const s of [-1, 1]) {
    const stFront = conformalStrap({
      radiusAt: dressR, material: strapMat,
      from: { theta: s * 0.28, y: -0.02 }, to: { theta: s * 0.9, y: 0.22 },
      width: 0.032, thick: 0.014, segments: 6, offset: 0.006,
    });
    joints.hips.add(stFront);
    const stBack = conformalStrap({
      radiusAt: dressR, material: strapMat,
      from: { theta: s * 0.9, y: 0.22 }, to: { theta: s * (Math.PI - 0.28), y: -0.02 },
      width: 0.032, thick: 0.014, segments: 6, offset: 0.006,
    });
    joints.hips.add(stBack);
  }
  // Little back bow — a charm detail, cream.
  const bowKnot = G(facetBall(0.035, cream, [1, 0.9, 0.8], [6, 4]), '#a89370', '#fff9e8');
  bowKnot.position.set(0, 0.20, -0.155);
  joints.hips.add(bowKnot);
  for (const s of [-1, 1]) {
    const loop = G(facetBall(0.045, cream, [1.3, 0.7, 0.55], [6, 4]), '#a89370', '#fff9e8');
    loop.position.set(s * 0.05, 0.20, -0.15);
    loop.rotation.y = s * 0.5;
    joints.hips.add(loop);
  }

  // --- Head, face, hair, braids --------------------------------------------
  const head = G(ball(0.135, skin, [1, 1.03, 0.97]), '#c9946a', '#ffe0bd');
  head.position.y = 0.115;
  joints.head.add(head);
  const nose = G(ball(0.024, skin, [1, 1, 1.2]), '#c9946a', '#ffe0bd');
  nose.position.set(0, 0.075, 0.128);
  joints.head.add(nose);
  for (const s of [-1, 1]) {
    const ear = G(ball(0.03, skin, [0.7, 1, 0.85]));
    ear.position.set(s * 0.132, 0.075, 0.005);
    joints.head.add(ear);
    // Big hazel anime eyes: sclera / iris / pupil / highlight, layered.
    const sclera = ball(0.043, white, [1, 1.16, 0.4]);
    sclera.position.set(s * 0.058, 0.095, 0.11);
    sclera.rotation.y = D(s * 14);
    joints.head.add(sclera);
    const iris = ball(0.030, hazel, [1, 1.2, 0.3]);
    iris.position.set(s * 0.057, 0.091, 0.126);
    iris.rotation.y = D(s * 14);
    joints.head.add(iris);
    const pupil = ball(0.015, dark, [1, 1.3, 0.3]);
    pupil.position.set(s * 0.056, 0.088, 0.133);
    pupil.rotation.y = D(s * 14);
    joints.head.add(pupil);
    const hi = ball(0.0095, white, [1, 1, 0.5]);
    hi.position.set(s * 0.056 - 0.011, 0.104, 0.135);
    joints.head.add(hi);
    const brow = G(chunkyBox(0.06, 0.011, 0.016, chestnutDark, { radius: 0.3 }), '#2c1a0e', '#7a4d2c');
    brow.position.set(s * 0.058, 0.14, 0.118);
    brow.rotation.z = D(s * -8);
    joints.head.add(brow);
    // Freckle dots — small warm dots dusted across the cheek.
    for (const [fx, fy] of [[0.06, 0.05], [0.085, 0.04], [0.07, 0.025]]) {
      const dot = ball(0.006, freckle);
      dot.position.set(s * fx, fy + 0.06, 0.122);
      joints.head.add(dot);
    }
  }

  // Hair cap: crown + short fringe, chestnut, facing forward over the brow.
  const crown = G(facetBall(0.145, chestnut, [1.05, 0.92, 1.02], [8, 6]), '#2c1a0e', '#7a4d2c');
  crown.position.set(0, 0.135, -0.01);
  joints.head.add(crown);
  const fringe = G(facetBall(0.1, chestnut, [1.05, 0.55, 0.85], [7, 5]), '#2c1a0e', '#7a4d2c');
  fringe.position.set(0, 0.155, 0.10);
  joints.head.add(fringe);
  for (const [hx, hs] of [[-0.075, 0.9], [0.075, 0.9]]) {
    const tuft = G(facetBall(0.032, chestnut, [1.1 * hs, 0.7, 0.85], [6, 4]), '#2c1a0e', '#7a4d2c');
    tuft.position.set(hx, 0.13, 0.11);
    joints.head.add(tuft);
  }

  // Twin braids — chain-jointed tails so they swing with lag, matching the
  // archer's hoodTip pattern. Each is its own named group of 3 tapering
  // segments plus a cream tie, parented to the head.
  const makeBraid = (side) => {
    const g = new THREE.Group();
    g.name = `braid${side}`;
    g.position.set(side === 'L' ? 0.135 : -0.135, 0.155, -0.06);
    const segs = [
      { r: 0.052, y: -0.02, z: -0.03, scale: [1, 1.1, 1] },
      { r: 0.040, y: -0.115, z: -0.075, scale: [1, 1.15, 1] },
      { r: 0.028, y: -0.20, z: -0.12, scale: [1, 1.1, 1] },
    ];
    for (const seg of segs) {
      const s = G(facetBall(seg.r, chestnut, seg.scale, [6, 5]), '#2c1a0e', '#7a4d2c');
      s.position.set(0, seg.y, seg.z);
      g.add(s);
    }
    const tie = G(ball(0.022, cream, [1, 0.7, 1]), '#a89370', '#fff9e8');
    tie.position.set(0, -0.245, -0.14);
    g.add(tie);
    return g;
  };
  const braidL = makeBraid('L');
  const braidR = makeBraid('R');
  joints.head.add(braidL);
  joints.head.add(braidR);

  // --- Arms & legs -----------------------------------------------------
  for (const s of ['L', 'R']) {
    const side = s === 'L' ? 1 : -1;
    // Short puffed cream sleeve over the shoulder (blouse shows past it).
    const sleeve = G(facetBall(0.075, cream, [1.15, 0.85, 1.05], [7, 5]), '#a89370', '#fff9e8');
    sleeve.position.set(side * -0.005, 0.03, 0);
    joints[`upperArm${s}`].add(sleeve);
    const upper = G(limbMesh(0.052, P.upperArmLen, skin, { taper: 0.9, facet: true }), '#c9946a', '#ffe0bd');
    joints[`upperArm${s}`].add(upper);
    const fore = G(limbMesh(0.046, P.forearmLen, skin, { taper: 1.05, facet: true }), '#c9946a', '#ffe0bd');
    joints[`forearm${s}`].add(fore);
    const hand = G(facetBall(0.052, skin, [1, 0.92, 1.05], [6, 5]), '#c9946a', '#ffe0bd');
    hand.position.y = -0.02;
    joints[`hand${s}`].add(hand);
    // Legs: cream stockings, small brown shoe.
    const thigh = G(limbMesh(0.062, P.thighLen, cream, { taper: 0.94, facet: true }), '#a89370', '#fff9e8');
    joints[`thigh${s}`].add(thigh);
    const shin = G(limbMesh(0.052, P.shinLen - 0.03, cream, { taper: 1.02, facet: true }), '#a89370', '#fff9e8');
    joints[`shin${s}`].add(shin);
    const shoe = G(chunkyBox(0.095, 0.06, 0.145, shoeBrown, { radius: 0.35 }), '#2e1c10', '#7a5230');
    shoe.position.set(0, -0.01, 0.03);
    joints[`foot${s}`].add(shoe);
    const strapBand = G(chunkyBox(0.10, 0.018, 0.03, shoeBrown, { radius: 0.3 }), '#2e1c10', '#7a5230');
    strapBand.position.set(0, 0.03, 0.02);
    joints[`foot${s}`].add(strapBand);
  }

  // --- Basket: rigid prop in the crook of the left arm ---------------------
  // basketMount cancels the left arm's rest rotation so the basket sits
  // world-upright regardless of the (static) carry angle — no per-frame
  // constraint needed since upperArmL/forearmL/handL never animate.
  const armQ = new THREE.Quaternion()
    .multiplyQuaternions(joints.upperArmL.quaternion, joints.forearmL.quaternion)
    .multiply(joints.handL.quaternion);
  const basketMount = new THREE.Group();
  basketMount.name = 'basketMount';
  basketMount.quaternion.copy(armQ.clone().invert());
  basketMount.position.set(0.01, 0.02, 0.05);
  joints.handL.add(basketMount);

  const basket = new THREE.Group();
  basket.name = 'basket';
  basketMount.add(basket);
  const basketBody = G(latheBody(
    [[0.0, -0.01], [0.075, 0.0], [0.085, 0.05], [0.08, 0.09]],
    wicker, { facet: true, segments: 14 }
  ), '#4d3418', '#c99a5f');
  basket.add(basketBody);
  const basketRim = facet(new THREE.TorusGeometry(0.082, 0.014, 5, 12), wickerDark);
  basketRim.rotation.x = Math.PI / 2;
  basketRim.position.y = 0.09;
  basket.add(basketRim);
  const handleGeo = new THREE.TorusGeometry(0.075, 0.009, 5, 10, Math.PI);
  const handle = facet(handleGeo, wickerDark);
  handle.rotation.z = Math.PI / 2;
  handle.position.y = 0.10;
  basket.add(handle);
  // A little produce poking out — a red apple, the basket's charm detail.
  const apple = ball(0.032, toonMaterial('#c23b2e'), [1, 0.95, 1]);
  apple.position.set(-0.01, 0.1, 0.01);
  basket.add(apple);
  const leaf = G(chunkyBox(0.022, 0.008, 0.03, tealDark, { radius: 0.3 }), '#0f5344', '#4fc4a5');
  leaf.position.set(-0.01, 0.125, 0.01);
  basket.add(leaf);

  // --- Clips -------------------------------------------------------------

  // Idle (2.8s loop): light weight shifts, looks left then right as if
  // watching the village. Braids lag the head turns. Basket arm untouched.
  const stanceIdle = {
    thighL: { rot: [-2, 0, 0] }, shinL: { rot: [3, 0, 0] }, footL: { rot: [-1, 0, 0] },
    thighR: { rot: [-1.5, 0, 0] }, shinR: { rot: [2.5, 0, 0] }, footR: { rot: [-1, 0, 0] },
  };
  const centerIdle = {
    ...stanceIdle,
    hips: { pos: [0, 0, 0], rot: [1, 0, 0] },
    chest: { rot: [2, 0, -1] },
    head: { rot: [-2, 0, 0] },
    braidL: { rot: [1, 1, 0] }, braidR: { rot: [1, -1, 0] },
    upperArmR: { rot: [3, 0, -4] }, forearmR: { rot: [-6, 0, 0] },
  };
  const lookL = {
    ...stanceIdle,
    hips: { pos: [0.006, -0.002, 0], rot: [1, 3, 1] },
    chest: { rot: [2, 4, -1.5] },
    head: { rot: [-3, 26, 0] },
    braidL: { rot: [2, 8, 1] }, braidR: { rot: [2, 9, -1] },
    upperArmR: { rot: [4, 0, -5] }, forearmR: { rot: [-7, 0, 0] },
  };
  const lookLHold = {
    ...stanceIdle,
    hips: { pos: [0.006, -0.003, 0], rot: [1.5, 3, 1] },
    chest: { rot: [3, 5, -1.5] },
    head: { rot: [-3, 22, 0] },
    braidL: { rot: [2, -3, 1] }, braidR: { rot: [2, -2, -1] },
    upperArmR: { rot: [5, 0, -5] }, forearmR: { rot: [-8, 0, 0] },
  };
  const lookR = {
    ...stanceIdle,
    hips: { pos: [-0.006, -0.002, 0], rot: [1, -3, -1] },
    chest: { rot: [2, -4, 1.5] },
    head: { rot: [-3, -24, 0] },
    braidL: { rot: [2, -9, 1] }, braidR: { rot: [2, -8, -1] },
    upperArmR: { rot: [3, 0, -4] }, forearmR: { rot: [-6, 0, 0] },
  };
  const lookRHold = {
    ...stanceIdle,
    hips: { pos: [-0.006, -0.003, 0], rot: [1.5, -3, -1] },
    chest: { rot: [3, -5, 1.5] },
    head: { rot: [-3, -20, 0] },
    braidL: { rot: [2, 3, 1] }, braidR: { rot: [2, 2, -1] },
    upperArmR: { rot: [4, 0, -4] }, forearmR: { rot: [-7, 0, 0] },
  };
  const idle = bakeClip(root, 'idle', [
    { t: 0.0, pose: centerIdle },
    { t: 0.55, pose: lookL },
    { t: 1.05, pose: lookLHold },
    { t: 1.45, pose: centerIdle },
    { t: 1.95, pose: lookR },
    { t: 2.45, pose: lookRHold },
    { t: 2.8, pose: centerIdle },
  ]);

  // Walk (0.8s loop): light, slightly bouncy stride. Support-leg bob comes
  // from real knee-extension change (KIT lesson), not authored hips.pos
  // alone. Basket arm (upperArmL/forearmL/handL) never appears in any key,
  // so it — and the basket — stays perfectly steady. Only the free right
  // arm swings, on its own simple pendulum synced to the leg cycle.
  const T = 0.8;
  const contactL = {
    hips: { pos: [0, -0.008, 0], rot: [2, 14, -1] },
    chest: { rot: [2, -15, 1] },
    head: { rot: [-2, 5, 0] },
    braidL: { rot: [3, 10, 0] }, braidR: { rot: [3, 11, 0] },
    thighL: { rot: [-22, 0, 0] }, shinL: { rot: [20, 0, 0] }, footL: { rot: [2, 0, 0] },
    thighR: { rot: [18, 0, 0] }, shinR: { rot: [26, 0, 0] }, footR: { rot: [-20, 0, 0] },
  };
  const downL = {
    hips: { pos: [0, -0.04, 0], rot: [4, 10, 4] },
    chest: { rot: [4, -12, -2] },
    head: { rot: [-3, 2, -1] },
    braidL: { rot: [4, 5, 1] }, braidR: { rot: [4, 6, -1] },
    thighL: { rot: [-15, 0, 0] }, shinL: { rot: [54, 0, 0] }, footL: { rot: [-39, 0, 0] },
    thighR: { rot: [22, 0, 0] }, shinR: { rot: [50, 0, 0] }, footR: { rot: [-32, 0, 0] },
  };
  const passL = {
    hips: { pos: [0, 0.006, 0], rot: [2, 0, 1.5] },
    chest: { rot: [3, 1, -1] },
    head: { rot: [-2, 0, 0] },
    braidL: { rot: [2, -4, 0] }, braidR: { rot: [2, -3, 0] },
    thighL: { rot: [-2, 0, 0] }, shinL: { rot: [3, 0, 0] }, footL: { rot: [0, 0, 0] },
    thighR: { rot: [-2, 0, 0] }, shinR: { rot: [62, 0, 0] }, footR: { rot: [-22, 0, 0] },
  };
  const swingMidL = {
    hips: { pos: [0, 0.012, 0], rot: [2, -4, 0] },
    chest: { rot: [3, 5, 0] },
    head: { rot: [-2, 0, 0] },
    braidL: { rot: [1, -8, 0] }, braidR: { rot: [1, -9, 0] },
    thighL: { rot: [3, 0, 0] }, shinL: { rot: [5, 0, 0] }, footL: { rot: [-5, 0, 0] },
    thighR: { rot: [-12, 0, 0] }, shinR: { rot: [48, 0, 0] }, footR: { rot: [-26, 0, 0] },
  };
  const upL = {
    hips: { pos: [0, 0.02, 0], rot: [2, -9, -1] },
    chest: { rot: [3, 9, 1] },
    head: { rot: [-2, -1, 0] },
    braidL: { rot: [0, -10, -1] }, braidR: { rot: [0, -11, 1] },
    thighL: { rot: [7, 0, 0] }, shinL: { rot: [4, 0, 0] }, footL: { rot: [-10, 0, 0] },
    thighR: { rot: [-20, 0, 0] }, shinR: { rot: [30, 0, 0] }, footR: { rot: [-14, 0, 0] },
  };
  // Free right arm: simple pendulum, opposite phase to the left leg's swing
  // (forward when the left leg is forward, matching natural counter-swing).
  const armR = (u, f) => ({ upperArmR: { rot: [u, 0, -10] }, forearmR: { rot: [f, 0, 0] } });
  const K = (base, r) => blendPoses(base, r);
  const walk = groundClip(root, bakeClip(root, 'walk', [
    { t: 0, pose: K(contactL, armR(-26, -18)) },
    { t: T * 0.1, pose: K(downL, armR(-18, -16)) },
    { t: T * 0.25, pose: K(passL, armR(-2, -12)) },
    { t: T * 0.35, pose: K(swingMidL, armR(10, -10)) },
    { t: T * 0.5, pose: K(mirrorPose(contactL), armR(22, -8)) },
    { t: T * 0.6, pose: K(mirrorPose(downL), armR(16, -10)) },
    { t: T * 0.75, pose: K(mirrorPose(passL), armR(-2, -12)) },
    { t: T * 0.85, pose: K(mirrorPose(swingMidL), armR(-14, -16)) },
    { t: T, pose: K(contactL, armR(-26, -18)) },
  ]));

  // Talk (1.4s loop): bright chatting. Free right hand gestures, head bobs,
  // one little heel bounce (a quick calf-raise pop, not a foot-tilt, so the
  // sole never lifts through the floor). Basket arm stays untouched.
  const chatBase = {
    thighL: { rot: [-2, 0, 0] }, shinL: { rot: [3, 0, 0] }, footL: { rot: [-1, 0, 0] },
    thighR: { rot: [-2, 0, 0] }, shinR: { rot: [3, 0, 0] }, footR: { rot: [-1, 0, 0] },
  };
  const chatA = {
    ...chatBase,
    hips: { pos: [0, 0, 0], rot: [1, -2, 0] },
    chest: { rot: [3, 3, 0] },
    head: { rot: [-2, -4, 2] },
    braidL: { rot: [1, 2, 0] }, braidR: { rot: [1, 1, 0] },
    upperArmR: { rot: [-6, 0, -18] }, forearmR: { rot: [-22, 0, 0] }, handR: { rot: [4, 0, 0] },
  };
  const chatB = {
    ...chatBase,
    hips: { pos: [0, 0.012, 0], rot: [-0.5, 1, 0.5] },
    chest: { rot: [-1, -5, 1] },
    head: { rot: [-6, 3, -1] },
    braidL: { rot: [-2, -4, 0] }, braidR: { rot: [-2, -3, 0] },
    thighL: { rot: [-4, 0, 0] }, shinL: { rot: [1, 0, 0] }, footL: { rot: [1, 0, 0] },
    thighR: { rot: [-4, 0, 0] }, shinR: { rot: [1, 0, 0] }, footR: { rot: [1, 0, 0] },
    upperArmR: { rot: [-42, 6, -22] }, forearmR: { rot: [-58, 0, 0] }, handR: { rot: [-12, 0, 0] },
  };
  const chatC = {
    ...chatBase,
    hips: { pos: [0, 0.002, 0], rot: [1.5, -3, -0.5] },
    chest: { rot: [4, 4, -1] },
    head: { rot: [-1, -6, 1] },
    braidL: { rot: [2, 5, 0] }, braidR: { rot: [2, 6, 0] },
    upperArmR: { rot: [-16, -4, -14] }, forearmR: { rot: [-30, 0, 0] }, handR: { rot: [-4, 0, 0] },
  };
  const chatD = {
    ...chatBase,
    hips: { pos: [0, 0, 0], rot: [1, 1, 0] },
    chest: { rot: [2, -1, 0.5] },
    head: { rot: [-3, 1, -1] },
    braidL: { rot: [0, -2, 0] }, braidR: { rot: [0, -1, 0] },
    upperArmR: { rot: [-2, 0, -16] }, forearmR: { rot: [-16, 0, 0] }, handR: { rot: [2, 0, 0] },
  };
  const talk = bakeClip(root, 'talk', [
    { t: 0.0, pose: chatA },
    { t: 0.35, pose: chatB },
    { t: 0.7, pose: chatC },
    { t: 1.05, pose: chatD },
    { t: 1.4, pose: chatA },
  ]);

  return {
    root,
    clips: [idle, walk, talk],
    meta: { height: 1.25, name: 'Mika', role: 'npc', requiredClips: ['idle', 'walk', 'talk'] },
  };
}
