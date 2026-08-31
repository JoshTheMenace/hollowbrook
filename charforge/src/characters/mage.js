import * as THREE from 'three';
import { buildSkeleton } from '../lib/rig.js';
import {
  toonMaterial, latheBody, limbMesh, ball, facetBall, chunkyBox, facet, paintGradient,
} from '../lib/parts.js';
import { bakeClip, mirrorPose, groundClip } from '../lib/clips.js';

// "Mage" — violet robed caster, KayKit-bar rebuild, round 5 (final polish).
// This round: each arm is ONE continuous sleeve (wide faceted shoulder root
// tucked in the capelet, flush telescoped elbow — dark elbow ring removed —
// slight bell into the gold cuff) so no ball-joint seam at turntable 90/270;
// sleeve purple lifted one value step ABOVE the robe so arms separate from
// the torso; front skirt flap kicks ~8 deg further at contact/down so the
// leading shin clears the panel edge in walk16s f9-f10; brows thickened and
// a subtle mouth line added between mustache and beard.

// Bake a darker-toward-ground gradient into a mesh (material needs vertexColors).
const grad = (mesh, lo = '#8a86a4', hi = '#ffffff') => {
  paintGradient(mesh.geometry, lo, hi);
  return mesh;
};

// Flat 5-point star applique, extruded along +Z.
function starMesh(radius, depth, material) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? radius * 0.45 : radius;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    i ? shape.lineTo(x, y) : shape.moveTo(x, y);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

// 8-sided faceted sleeve of revolution (KayKit style): profile is
// [radius, y] pairs listed bottom-to-top (closed at both ends with r=0
// points); slope changes between points read as crisp facet breaks.
function sleeveLathe(profile, material) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  return facet(new THREE.LatheGeometry(pts, 8), material);
}

export function build() {
  const P = {
    hipHeight: 0.55, spineLen: 0.10, chestLen: 0.18, neckLen: 0.10, headLen: 0.05,
    shoulderX: 0.20, shoulderY: 0.11,   // pivot raised so walk cuffs clear the skirt
    upperArmLen: 0.18, forearmLen: 0.16,
    hipX: 0.10, thighLen: 0.24, shinLen: 0.22,
  };
  const { root, joints } = buildSkeleton(P);
  joints.upperArmL.rotation.z = THREE.MathUtils.degToRad(10);
  joints.upperArmR.rotation.z = THREE.MathUtils.degToRad(-14);
  joints.upperArmR.rotation.x = THREE.MathUtils.degToRad(-20);

  // Materials — *G variants carry vertex-color gradients.
  const violetG = toonMaterial('#5b2ca6', { vertexColors: true }); // ID color: torso/robe/hat
  const sleeveG = toonMaterial('#7a52c9', { vertexColors: true }); // one value step LIGHTER than robe
  const violet = toonMaterial('#5b2ca6');                          // plain, for small fills
  const sleeveDk = toonMaterial('#38195f');                        // elbow ring accent
  const liningG = toonMaterial('#3f2478', { vertexColors: true }); // under-layer
  const panelG = toonMaterial('#4c2590', { vertexColors: true });  // skirt flaps: ~10% darker value than robe
  const gold = toonMaterial('#d8a53a', { rim: 0.55 });
  const rope = toonMaterial('#c9a86b', { rim: 0.25 });
  const skinG = toonMaterial('#e8b48c', { vertexColors: true });
  const skin = toonMaterial('#e8b48c');
  const whiteG = toonMaterial('#f2ede4', { vertexColors: true });
  const wood = toonMaterial('#6b4a32');
  const bootG = toonMaterial('#5a3d2b', { vertexColors: true });
  const orbMat = toonMaterial('#bdfdff', { rim: 1.0 });
  const dark = toonMaterial('#2a2622', { rim: 0 });

  // --- Legs + boots (emerge below the raised hem) ---------------------------
  for (const s of ['L', 'R']) {
    const thigh = grad(limbMesh(0.055, P.thighLen, liningG, { taper: 0.95, facet: true }));
    joints[`thigh${s}`].add(thigh);
    const shin = grad(limbMesh(0.05, P.shinLen, bootG, { taper: 1.15, facet: true }), '#9a90a0');
    joints[`shin${s}`].add(shin);
    const boot = grad(chunkyBox(0.105, 0.085, 0.165, bootG, { radius: 0.35 }), '#8a8098');
    boot.position.set(0, -0.028, 0.035);
    joints[`foot${s}`].add(boot);
    const cuff = grad(chunkyBox(0.118, 0.055, 0.125, liningG, { radius: 0.4 }), '#a49cc0');
    cuff.position.set(0, 0.022, 0.01);
    joints[`foot${s}`].add(cuff);
  }

  // --- Robe: lining skirt + shorter over-robe (layered), rope belt ----------
  const robe = new THREE.Group();
  robe.name = 'robe';
  joints.hips.add(robe);
  // Lining skirt, hem raised so the boots read below it.
  const skirt = grad(latheBody(
    [[0.0, -0.40], [0.30, -0.40], [0.27, -0.28], [0.21, -0.12], [0.17, 0.0], [0.16, 0.10]],
    liningG, { facet: true }
  ), '#9a96b8');
  robe.add(skirt);
  const hemTrim = facet(new THREE.TorusGeometry(0.283, 0.018, 6, 14), gold);
  hemTrim.rotation.x = Math.PI / 2;
  hemTrim.position.y = -0.388;
  hemTrim.scale.z = 0.88;
  robe.add(hemTrim);
  // Violet over-robe ends above the hem so the lining reads as a layer.
  const overRobe = grad(latheBody(
    [[0.255, -0.28], [0.25, -0.24], [0.22, -0.12], [0.185, 0.0], [0.175, 0.11]],
    violetG, { facet: true }
  ));
  robe.add(overRobe);
  const overTrim = facet(new THREE.TorusGeometry(0.238, 0.016, 6, 14), gold);
  overTrim.rotation.x = Math.PI / 2;
  overTrim.position.y = -0.27;
  overTrim.scale.z = 0.88;
  robe.add(overTrim);
  // Front/back skirt flaps: kick with the stride so the walk reads as steps.
  const mkFlap = (z, restRx) => {
    const g = new THREE.Group();
    g.position.set(0, -0.035, z);
    g.rotation.x = THREE.MathUtils.degToRad(restRx);
    const panel = grad(chunkyBox(0.20, 0.37, 0.045, panelG, { radius: 0.3 }), '#8b87ab');
    panel.position.set(0, -0.20, z > 0 ? 0.04 : -0.04);
    g.add(panel);
    const trim = chunkyBox(0.19, 0.03, 0.052, gold, { radius: 0.4 });
    trim.position.set(0, -0.34, z > 0 ? 0.04 : -0.04);
    g.add(trim);
    robe.add(g);
    return g;
  };
  const flapF = mkFlap(0.13, -13);
  flapF.name = 'flapF';
  const flapB = mkFlap(-0.13, 13);
  flapB.name = 'flapB';
  // Rope belt with hanging tails + knots and a side pouch.
  const belt = facet(new THREE.TorusGeometry(0.20, 0.030, 6, 14), rope);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = -0.02;
  belt.scale.z = 0.9;
  robe.add(belt);
  for (const [x, tilt] of [[0.025, 0.10], [0.105, 0.38]]) {
    const tail = limbMesh(0.016, 0.13, rope, { facet: true });
    tail.position.set(x, -0.035, 0.180);
    tail.rotation.z = tilt;
    robe.add(tail);
    const knot = facetBall(0.026, rope, [1, 1, 1], [6, 5]);
    knot.position.set(x + Math.sin(tilt) * 0.13, -0.035 - Math.cos(tilt) * 0.13, 0.180);
    robe.add(knot);
  }
  const pouch = chunkyBox(0.09, 0.10, 0.06, wood, { radius: 0.35 });
  pouch.position.set(-0.19, -0.09, 0.06);
  pouch.rotation.z = 0.1;
  robe.add(pouch);
  const pouchFlap = chunkyBox(0.095, 0.04, 0.065, dark, { radius: 0.35 });
  pouchFlap.position.set(-0.19, -0.055, 0.06);
  pouchFlap.rotation.z = 0.1;
  robe.add(pouchFlap);
  // Star + moon appliques WELDED to the skirt: base sits ~0.005 inside the
  // lathe surface, +Z aligned with the outward normal (yaw phi from +Z, then
  // pitch back by the skirt's slope), so they read as stitched-on, not decals.
  const weld = (mesh, r, y, phi, tilt, spin = 0) => {
    mesh.position.set(Math.sin(phi) * r, y, Math.cos(phi) * r * 0.88);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.set(-tilt, phi, spin);
    robe.add(mesh);
  };
  weld(starMesh(0.045, 0.012, gold), 0.269, -0.30, 0.80, 0.24, 0.2);   // lining r≈0.276
  weld(starMesh(0.032, 0.012, gold), 0.278, -0.34, -0.75, 0.24, -0.3); // lining r≈0.285
  const moon = facet(new THREE.TorusGeometry(0.034, 0.013, 6, 10, Math.PI * 1.25), gold);
  weld(moon, 0.231, -0.17, -0.77, 0.24, 0.5);                          // over-robe r≈0.233
  // Back detail (turn 180 was an empty plane): vertical gold trim line down
  // the back flap's outward face, finished with a small stitched star.
  // (Mounted on flapB, not the skirt — the flap covers the back seam.)
  const backTrim = chunkyBox(0.03, 0.22, 0.014, gold, { radius: 0.4 });
  backTrim.position.set(0, -0.185, -0.066);
  flapB.add(backTrim);
  const backStar = starMesh(0.026, 0.012, gold);
  backStar.position.set(0.045, -0.29, -0.061);
  backStar.rotation.y = Math.PI;
  flapB.add(backStar);

  // --- Torso + capelet -------------------------------------------------------
  const torso = grad(latheBody(
    [[0.11, -0.26], [0.17, -0.12], [0.185, 0.02], [0.15, 0.12], [0.0, 0.18]],
    violetG, { facet: true }
  ));
  joints.chest.add(torso);
  // Deep-violet capelet hugging the shoulders (snug, not a hoop).
  const capelet = grad(latheBody(
    [[0.10, 0.17], [0.185, 0.08], [0.205, 0.02]],
    liningG, { facet: true }
  ));
  joints.chest.add(capelet);
  // Gold clasp star at the throat.
  const clasp = starMesh(0.03, 0.012, gold);
  clasp.position.set(0, 0.10, 0.155);
  joints.chest.add(clasp);

  // --- Head, face, beard -----------------------------------------------------
  const head = grad(facetBall(0.165, skinG, [1, 1.02, 0.95], [10, 7]), '#b09680', '#ffffff');
  head.position.y = 0.05;
  joints.head.add(head);
  const nose = ball(0.042, skin, [1, 1, 1.35]);
  nose.position.set(0, 0.025, 0.155);
  joints.head.add(nose);
  for (const s of [-1, 1]) {
    const eye = ball(0.028, dark);
    eye.position.set(s * 0.06, 0.075, 0.135);
    joints.head.add(eye);
    const brow = chunkyBox(0.085, 0.046, 0.04, whiteG, { radius: 0.4 });
    paintGradient(brow.geometry, '#cccccc', '#ffffff');
    brow.position.set(s * 0.065, 0.117, 0.148);
    brow.rotation.z = s * -0.22;
    joints.head.add(brow);
    const ear = facetBall(0.035, skin, [0.6, 1, 0.8], [6, 5]);
    ear.position.set(s * 0.16, 0.03, 0.0);
    joints.head.add(ear);
  }
  const beard = grad(facetBall(0.125, whiteG, [0.95, 1.55, 0.75], [8, 6]), '#c6c0b2', '#ffffff');
  beard.position.set(0, -0.10, 0.09);
  joints.head.add(beard);
  const mustache = grad(facetBall(0.075, whiteG, [1.5, 0.5, 0.7], [8, 5]), '#ccc6b8', '#ffffff');
  mustache.position.set(0, -0.005, 0.135);
  joints.head.add(mustache);
  // Subtle mouth line: thin dark bar peeking between mustache and beard.
  const mouth = chunkyBox(0.05, 0.016, 0.018, dark, { radius: 0.45 });
  mouth.position.set(0, -0.052, 0.182);
  joints.head.add(mouth);

  // --- Oversized hat with bent drooping tip (signature) ----------------------
  const brim = grad(facet(new THREE.CylinderGeometry(0.30, 0.345, 0.05, 12), violetG),
    '#8a84a0', '#ffffff');
  brim.position.y = 0.165;   // lowered: brim seats on the crown, no face gap
  joints.head.add(brim);
  // Shadow band under the brim: dark ring hugging the crown so the hat casts
  // a read even with flat toon lighting (face detail beat).
  const brimShadow = facet(new THREE.CylinderGeometry(0.160, 0.150, 0.04, 10),
    toonMaterial('#2e1656', { rim: 0 }));
  brimShadow.position.y = 0.135;
  joints.head.add(brimShadow);
  const hatBase = grad(facet(new THREE.CylinderGeometry(0.145, 0.215, 0.22, 10), violetG));
  hatBase.position.y = 0.29;
  joints.head.add(hatBase);
  const band = facet(new THREE.TorusGeometry(0.20, 0.024, 6, 12), gold);
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.205;
  joints.head.add(band);
  const hatStar = starMesh(0.038, 0.012, gold);
  hatStar.position.set(0.045, 0.295, 0.165);
  hatStar.rotation.x = -0.25;
  joints.head.add(hatStar);
  const hatMidJ = new THREE.Group();
  hatMidJ.position.y = 0.40;
  hatMidJ.rotation.z = THREE.MathUtils.degToRad(-16);
  joints.head.add(hatMidJ);
  const hatMid = grad(facet(new THREE.CylinderGeometry(0.078, 0.142, 0.18, 9), violetG));
  hatMid.position.y = 0.085;
  hatMidJ.add(hatMid);
  // Fold roll closing the ledge where the mid-tier leaves the base.
  const midRoll = facet(new THREE.TorusGeometry(0.136, 0.030, 6, 10), violet);
  midRoll.rotation.x = Math.PI / 2;
  midRoll.position.y = 0.004;
  hatMidJ.add(midRoll);
  const hatTip = new THREE.Group();          // animatable: droops + wobbles
  hatTip.name = 'hatTip';
  hatTip.position.y = 0.17;
  hatTip.rotation.z = THREE.MathUtils.degToRad(-42);
  hatMidJ.add(hatTip);
  const tipCone = grad(facet(new THREE.ConeGeometry(0.076, 0.26, 8), violetG));
  tipCone.position.y = 0.10;
  hatTip.add(tipCone);
  // Fill ball at the bend so the mid-tier -> cone seam never opens.
  const tipFill = facetBall(0.080, violet, [1, 0.85, 1], [7, 5]);
  tipFill.position.y = 0.005;
  hatTip.add(tipFill);
  const tipBall = facetBall(0.042, gold, [1, 1, 1], [6, 5]);
  tipBall.position.y = 0.235;
  hatTip.add(tipBall);

  // --- Arms: ONE continuous beveled sleeve per arm --------------------------
  // Upper lathe is wide at the shoulder root (tucked inside the capelet) and
  // tapers past the elbow; the forearm bell's top telescopes flush inside the
  // upper's mouth (same radius, same color, no ring) so the elbow reads as a
  // fold in a single sleeve, not a ball joint — at 90/270 no seam shows.
  for (const s of ['L', 'R']) {
    const upper = grad(sleeveLathe([
      [0.0, -0.23], [0.058, -0.23], [0.062, -0.11],   // extends 0.05 past the
      [0.068, -0.02], [0.084, 0.05], [0.0, 0.07],     // elbow to swallow the bell top
    ], sleeveG));
    joints[`upperArm${s}`].add(upper);
    const bell = grad(sleeveLathe([
      [0.0, -0.158], [0.090, -0.158], [0.066, -0.095], // slight bell to the cuff;
      [0.058, -0.03], [0.056, 0.04], [0.0, 0.05],      // top hides inside the upper
    ], sleeveG));
    joints[`forearm${s}`].add(bell);
    // Wide gold cuff lip + dark opening at the bell mouth.
    const cuffBand = facet(new THREE.CylinderGeometry(0.096, 0.106, 0.042, 8), gold);
    cuffBand.position.y = -P.forearmLen + 0.014;
    joints[`forearm${s}`].add(cuffBand);
    const cuffIn = facet(new THREE.CylinderGeometry(0.062, 0.070, 0.05, 8), sleeveDk);
    cuffIn.position.y = -P.forearmLen - 0.006;
    joints[`forearm${s}`].add(cuffIn);
    const hand = facetBall(0.07, skin, [1, 0.85, 1.05], [7, 5]);
    hand.position.y = -0.02;
    joints[`hand${s}`].add(hand);
  }

  // --- Orb staff in the right hand: carried outward + forward so the orb ----
  // breaks the profile at the 90/270 turntable angles.
  const staff = new THREE.Group();
  staff.name = 'staff';
  staff.rotation.x = THREE.MathUtils.degToRad(28);
  staff.rotation.z = THREE.MathUtils.degToRad(17);
  joints.handR.add(staff);
  const shaft = facet(new THREE.CylinderGeometry(0.022, 0.032, 1.15, 7), wood);
  shaft.position.y = 0.12;
  staff.add(shaft);
  const gripWrap = facet(new THREE.CylinderGeometry(0.034, 0.034, 0.09, 7), rope);
  gripWrap.position.y = 0.0;
  staff.add(gripWrap);
  const ferrule = facet(new THREE.ConeGeometry(0.034, 0.05, 7), gold);
  ferrule.rotation.x = Math.PI;
  ferrule.position.y = -0.45;
  staff.add(ferrule);
  const collar = facet(new THREE.TorusGeometry(0.036, 0.014, 6, 10), gold);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.645;
  staff.add(collar);
  const orb = new THREE.Group();
  orb.name = 'orb';
  orb.position.y = 0.735;
  staff.add(orb);
  orb.add(ball(0.078, orbMat));
  for (let i = 0; i < 3; i++) {                 // gold prongs cradling the orb
    const prong = chunkyBox(0.016, 0.075, 0.016, gold, { radius: 0.3 });
    const a = (i / 3) * Math.PI * 2;
    prong.position.set(Math.cos(a) * 0.055, -0.045, Math.sin(a) * 0.055);
    prong.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
    orb.add(prong);
  }

  // --- Clips ----------------------------------------------------------------
  const still = {};

  // Idle: slow breathing sway; hat tip and orb drift with a lag; L/R offset.
  const idleA = {
    hips: { pos: [0, -0.004, 0], rot: [1.5, 2, 1] },
    chest: { rot: [2, -2, -1] },
    head: { rot: [-2, 3, 1] },
    upperArmL: { rot: [3, 0, 4] }, forearmL: { rot: [-8, 0, 0] },
    upperArmR: { rot: [2, 0, -3] }, forearmR: { rot: [-4, 0, 0] },
    staff: { rot: [2, 0, 3] },
    orb: { pos: [0, 0.015, 0] },
    robe: { rot: [0, 0, 1] },
    hatTip: { rot: [0, 0, 5] },
  };
  const idleB = {
    hips: { pos: [0, -0.007, 0], rot: [2.5, -2, -1] },
    chest: { rot: [4, 2, 1] },
    head: { rot: [-3, -3, -1] },
    thighL: { rot: [-3, 0, 0] }, shinL: { rot: [6, 0, 0] }, footL: { rot: [-3, 0, 0] },
    thighR: { rot: [-2, 0, 0] }, shinR: { rot: [4, 0, 0] }, footR: { rot: [-2, 0, 0] },
    upperArmL: { rot: [5, 0, 5] }, forearmL: { rot: [-11, 0, 0] },
    upperArmR: { rot: [4, 0, -4] }, forearmR: { rot: [-6, 0, 0] },
    staff: { rot: [-2, 0, -3] },
    orb: { pos: [0, -0.02, 0] },
    robe: { rot: [0, 0, -1] },
    hatTip: { rot: [4, 0, -7] },
  };
  const idle = bakeClip(root, 'idle', [
    { t: 0.0, pose: idleA },
    { t: 1.3, pose: idleB },
    { t: 2.6, pose: idleA },
  ]);

  // Walk 0.75s: real stepping legs under the robe. Four phases per half
  // stride (contact / down / passing / up), boots planted flat at contact,
  // root bob synced to the steps, hips/shoulders counter-rotate, and the
  // front/back robe flaps kick with the leading leg. Left arm swings big;
  // the staff arm keeps a damped swing so the orb never whips.
  const T = 0.75;
  const contactL = {                              // left boot plants, flat
    hips: { pos: [0, -0.025, 0.01], rot: [4, 13, 5] },
    chest: { rot: [5, -15, -7] },
    head: { rot: [-4, 4, 2] },
    thighL: { rot: [-31, 0, 0] }, shinL: { rot: [4, 0, 0] }, footL: { rot: [27, 0, 0] },
    thighR: { rot: [24, 0, 0] }, shinR: { rot: [18, 0, 0] }, footR: { rot: [-20, 0, 0] },
    upperArmL: { rot: [14, 0, 9] }, forearmL: { rot: [-8, 0, 0] },
    upperArmR: { rot: [-10, 0, -8] }, forearmR: { rot: [-10, 0, 0] },
    staff: { rot: [3, 0, 1] },
    orb: { pos: [0, 0.015, 0] },
    flapF: { rot: [-34, 0, 0] }, flapB: { rot: [22, 0, 0] },
    robe: { rot: [4, -4, 2] },
    hatTip: { rot: [3, 0, 2] },
  };
  const downL = {                                 // weight taken: hips lowest
    // Support knee bent DEEP (hidden by the robe) — groundClip keeps the boot
    // planted, so this shortened leg is what actually lowers the crown ~0.04m.
    hips: { pos: [0, -0.10, 0], rot: [6, 9, 10] },     // +4 deg roll toward swing leg
    chest: { rot: [9, -11, -9] },                       // matching counter-roll
    head: { rot: [-7, 3, -3] },
    thighL: { rot: [-30, 0, 0] }, shinL: { rot: [45, 0, 0] }, footL: { rot: [-15, 0, 0] },
    thighR: { rot: [30, 0, 0] }, shinR: { rot: [28, 0, 0] }, footR: { rot: [-30, 0, 0] },
    upperArmL: { rot: [10, 0, 8] }, forearmL: { rot: [-9, 0, 0] },
    upperArmR: { rot: [-6, 0, -7] }, forearmR: { rot: [-10, 0, 0] },
    staff: { rot: [2, 0, 0] },
    orb: { pos: [0, -0.01, 0] },
    flapF: { rot: [-31, 0, 0] }, flapB: { rot: [18, 0, 0] },  // kicked clear of the leading shin
    robe: { rot: [6, -3, 3] },
    hatTip: { rot: [-2, 0, -2] },
  };
  const passL = {                                 // right leg swings through
    hips: { pos: [0, -0.048, -0.005], rot: [5, 0, 3] },
    chest: { rot: [6, 0, -3] },
    head: { rot: [-5, 0, -1] },
    thighL: { rot: [-2, 0, 0] }, shinL: { rot: [2, 0, 0] }, footL: { rot: [0, 0, 0] },
    // Swing knee bent hard + toe pulled up: its toe must never dip below the
    // stance sole, or groundClip lifts the whole body off the planted boot.
    thighR: { rot: [-12, 0, 0] }, shinR: { rot: [46, 0, 0] }, footR: { rot: [-26, 0, 0] },
    upperArmL: { rot: [4, 0, 8] }, forearmL: { rot: [-10, 0, 0] },
    upperArmR: { rot: [-2, 0, -7] }, forearmR: { rot: [-9, 0, 0] },
    staff: { rot: [0, 0, 0] },
    orb: { pos: [0, 0.005, 0] },
    flapF: { rot: [8, 0, 0] }, flapB: { rot: [-7, 0, 0] },
    robe: { rot: [2, 0, 1] },
    hatTip: { rot: [1, 0, 1] },
  };
  const upL = {                                   // push-off: hips highest
    hips: { pos: [0, -0.012, 0.005], rot: [3, -7, -4] },
    chest: { rot: [3, 8, 5] },
    head: { rot: [-3, -3, -1] },
    thighL: { rot: [13, 0, 0] }, shinL: { rot: [6, 0, 0] }, footL: { rot: [-12, 0, 0] },
    thighR: { rot: [-24, 0, 0] }, shinR: { rot: [34, 0, 0] }, footR: { rot: [-8, 0, 0] },
    upperArmL: { rot: [-12, 0, 8] }, forearmL: { rot: [-10, 0, 0] },
    upperArmR: { rot: [2, 0, -7] }, forearmR: { rot: [-9, 0, 0] },
    staff: { rot: [-2, 0, 1] },
    orb: { pos: [0, 0.01, 0] },
    flapF: { rot: [-18, 0, 0] }, flapB: { rot: [14, 0, 0] },
    robe: { rot: [3, 3, -2] },
    hatTip: { rot: [2, 0, 1] },
  };
  // Mirrored half-stride, with damped overrides on the staff arm so the big
  // swing stays on the left arm and the staff only drifts.
  const armsR = (uL, fL, uR, fR, st) => ({
    upperArmL: { rot: [uL, 0, 9] }, forearmL: { rot: [fL, 0, 0] },
    upperArmR: { rot: [uR, 0, -8] }, forearmR: { rot: [fR, 0, 0] },
    staff: { rot: st },
  });
  const walk = groundClip(root, bakeClip(root, 'walk', [
    { t: 0, pose: contactL },
    { t: T * 0.125, pose: downL },
    { t: T * 0.25, pose: passL },
    { t: T * 0.375, pose: upL },
    { t: T * 0.5, pose: { ...mirrorPose(contactL), ...armsR(-20, -10, 8, -8, [-3, 0, 2]) } },
    { t: T * 0.625, pose: { ...mirrorPose(downL), ...armsR(-14, -10, 6, -9, [-2, 0, 1]) } },
    { t: T * 0.75, pose: { ...mirrorPose(passL), ...armsR(-4, -10, 2, -9, [0, 0, 0]) } },
    { t: T * 0.875, pose: { ...mirrorPose(upL), ...armsR(8, -9, -6, -10, [2, 0, 1]) } },
    { t: T, pose: contactL },
  ]));

  // Attack — spell slam: long crouched wind-up (ease-in), arcing raise with a
  // true in-between, a 2-frame overhead drift (no dead hold), then a FAST
  // strike-down with overshoot + recoil before the settle.
  const windup = {                                // f5 — deepest anticipation
    hips: { pos: [0, -0.05, -0.02], rot: [-6, -22, 0] },
    chest: { rot: [-10, -20, 0] },
    head: { rot: [5, 14, 0] },
    robe: { rot: [-4, -8, 0], scale: [1.05, 0.92, 1.05] },
    thighL: { rot: [-14, 0, 0] }, shinL: { rot: [24, 0, 0] }, footL: { rot: [-10, 0, 0] },
    thighR: { rot: [18, 0, 0] }, shinR: { rot: [20, 0, 0] }, footR: { rot: [-20, 0, 0] },
    upperArmR: { rot: [30, 0, -42] }, forearmR: { rot: [-28, 0, 0] },
    staff: { rot: [-20, 0, -4] },
    upperArmL: { rot: [-25, 0, 12] }, forearmL: { rot: [-30, 0, 0] },
    flapF: { rot: [6, 0, 0] }, flapB: { rot: [-4, 0, 0] },
    hatTip: { rot: [8, 0, 8] },
  };
  const raise = {                                 // breakdown 1: staff leaves the hip,
    hips: { pos: [0, -0.045, -0.005], rot: [-4, -17, 0] },   // sweeping out to the side
    chest: { rot: [-7, -15, 0] },
    head: { rot: [4, 11, 0] },
    robe: { rot: [-3, -6, 0], scale: [1.04, 0.94, 1.04] },
    thighL: { rot: [-12, 0, 0] }, shinL: { rot: [20, 0, 0] }, footL: { rot: [-8, 0, 0] },
    thighR: { rot: [16, 0, 0] }, shinR: { rot: [18, 0, 0] }, footR: { rot: [-17, 0, 0] },
    upperArmR: { rot: [5, 0, -48] }, forearmR: { rot: [-22, 0, 0] },
    staff: { rot: [2, 0, 6] },
    upperArmL: { rot: [-15, 0, 12] }, forearmL: { rot: [-26, 0, 0] },
    flapF: { rot: [4, 0, 0] }, flapB: { rot: [-3, 0, 0] },
    hatTip: { rot: [8, 0, 8] },                   // lags the head by ~1 key
  };
  const liftMid = {                               // NEW breakdown: raise -> midsweep
    hips: { pos: [0, -0.041, -0.002], rot: [-3.5, -15.5, 0] },  // (kills the fr5->6 pop)
    chest: { rot: [-6, -13.5, 0] },
    head: { rot: [3.5, 10, 0] },
    robe: { rot: [-2.5, -5.5, 0], scale: [1.035, 0.95, 1.035] },
    thighL: { rot: [-11.5, 0, 0] }, shinL: { rot: [18.5, 0, 0] }, footL: { rot: [-7, 0, 0] },
    thighR: { rot: [15, 0, 0] }, shinR: { rot: [17, 0, 0] }, footR: { rot: [-16, 0, 0] },
    upperArmR: { rot: [-12, 0, -50] }, forearmR: { rot: [-20, 0, 0] },
    staff: { rot: [15, 0, 12] },
    upperArmL: { rot: [-11, 0, 12] }, forearmL: { rot: [-24, 0, 0] },
    hatTip: { rot: [6, 0, 7] },
  };
  const midsweep = {                              // breakdown: raise -> sweep arc
    hips: { pos: [0, -0.038, 0], rot: [-3, -14, 0] },
    chest: { rot: [-5, -12, 0] },
    head: { rot: [3, 9, 0] },
    robe: { rot: [-2, -5, 0], scale: [1.03, 0.96, 1.03] },
    thighL: { rot: [-11, 0, 0] }, shinL: { rot: [17, 0, 0] }, footL: { rot: [-6, 0, 0] },
    thighR: { rot: [14, 0, 0] }, shinR: { rot: [16, 0, 0] }, footR: { rot: [-15, 0, 0] },
    upperArmR: { rot: [-28, 0, -52] }, forearmR: { rot: [-19, 0, 0] },
    staff: { rot: [28, 0, 18] },
    upperArmL: { rot: [-8, 0, 12] }, forearmL: { rot: [-23, 0, 0] },
    hatTip: { rot: [5, 0, 6] },
  };
  const sweep = {                                 // breakdown 2: arm arcs up-and-out
    hips: { pos: [0, -0.03, 0.01], rot: [-2, -10, 0] },
    chest: { rot: [-3, -8, 0] },
    head: { rot: [2, 6, 0] },
    robe: { rot: [-1, -4, 0], scale: [1.02, 0.97, 1.02] },
    thighL: { rot: [-10, 0, 0] }, shinL: { rot: [14, 0, 0] }, footL: { rot: [-4, 0, 0] },
    thighR: { rot: [12, 0, 0] }, shinR: { rot: [14, 0, 0] }, footR: { rot: [-12, 0, 0] },
    upperArmR: { rot: [-55, 0, -55] }, forearmR: { rot: [-16, 0, 0] },
    staff: { rot: [55, 0, 30] },
    upperArmL: { rot: [0, 0, 12] }, forearmL: { rot: [-20, 0, 0] },
    hatTip: { rot: [2, 0, 4] },
  };
  const arcUp = {                                 // breakdown: sweep -> overhead arc
    hips: { pos: [0, -0.02, 0.02], rot: [1, -1, 0] },
    chest: { rot: [2, 2, 0] },
    head: { rot: [-3, 0, 0] },
    robe: { rot: [1, 0, 0], scale: [1, 1, 1] },
    thighL: { rot: [-8, 0, 0] }, shinL: { rot: [11, 0, 0] }, footL: { rot: [-3, 0, 0] },
    thighR: { rot: [9, 0, 0] }, shinR: { rot: [12, 0, 0] }, footR: { rot: [-14, 0, 0] },
    upperArmR: { rot: [-100, 0, -35] }, forearmR: { rot: [-13, 0, 0] },
    staff: { rot: [102, 0, 20] },
    orb: { scale: [1.2, 1.2, 1.2] },
    upperArmL: { rot: [15, 0, 14] }, forearmL: { rot: [-17, 0, 0] },
    hatTip: { rot: [3, 0, 4] },
  };
  const overhead = {                              // f7 — staff up
    hips: { pos: [0, -0.01, 0.03], rot: [4, 8, 0] },
    chest: { rot: [8, 12, 0] },
    head: { rot: [-8, -6, 0] },
    robe: { rot: [4, 4, 0], scale: [0.98, 1.03, 0.98] },
    thighL: { rot: [-6, 0, 0] }, shinL: { rot: [8, 0, 0] }, footL: { rot: [-2, 0, 0] },
    thighR: { rot: [6, 0, 0] }, shinR: { rot: [10, 0, 0] }, footR: { rot: [-16, 0, 0] },
    upperArmR: { rot: [-140, 0, -10] }, forearmR: { rot: [-10, 0, 0] },
    staff: { rot: [148, 0, 12] },
    orb: { scale: [1.4, 1.4, 1.4] },
    upperArmL: { rot: [30, 0, 16] }, forearmL: { rot: [-14, 0, 0] },
    hatTip: { rot: [4, 0, 5] },                   // still forward: lags the head snap
  };
  const drift = {                                 // f8 — 2-frame drifting hold
    ...overhead,
    hips: { pos: [0, -0.005, 0.035], rot: [5, 9, 0] },
    head: { rot: [-10, -7, 0] },
    upperArmR: { rot: [-146, 0, -9] },
    staff: { rot: [154, 0, 12] },
    orb: { scale: [1.65, 1.65, 1.65] },
    hatTip: { rot: [-26, 0, -8] },                // catches up one key late
  };
  const midStrike = {                             // breakdown: overhead -> hit arc
    hips: { pos: [0, -0.02, 0.06], rot: [7, 12, 0] },
    chest: { rot: [15, 15, 0] },
    head: { rot: [-11, -8, 0] },
    robe: { rot: [7, 5, 0], scale: [1.02, 0.98, 1.02] },
    thighL: { rot: [-13, 0, 0] }, shinL: { rot: [9, 0, 0] }, footL: { rot: [4, 0, 0] },
    thighR: { rot: [15, 0, 0] }, shinR: { rot: [14, 0, 0] }, footR: { rot: [-19, 0, 0] },
    upperArmR: { rot: [-100, 0, -12] }, forearmR: { rot: [-20, 0, 0] },
    staff: { rot: [95, 0, 11] },
    orb: { scale: [1.9, 1.9, 1.9] },
    upperArmL: { rot: [28, 0, 17] }, forearmL: { rot: [-18, 0, 0] },
    flapF: { rot: [-8, 0, 0] }, flapB: { rot: [7, 0, 0] },
    hatTip: { rot: [-26, 0, -8] },                // hat still back mid-slam
  };
  const strike = {                                // fast slam down-forward
    hips: { pos: [0, -0.035, 0.10], rot: [10, 16, 0] },
    chest: { rot: [22, 18, 0] },
    head: { rot: [-12, -8, 0] },
    robe: { rot: [10, 6, 0], scale: [1.06, 0.94, 1.06] },
    thighL: { rot: [-20, 0, 0] }, shinL: { rot: [10, 0, 0] }, footL: { rot: [10, 0, 0] },
    thighR: { rot: [24, 0, 0] }, shinR: { rot: [18, 0, 0] }, footR: { rot: [-22, 0, 0] },
    upperArmR: { rot: [-52, 0, -14] }, forearmR: { rot: [-32, 0, 0] },
    staff: { rot: [30, 0, 10] },
    orb: { scale: [2.2, 2.2, 2.2] },
    upperArmL: { rot: [26, 0, 18] }, forearmL: { rot: [-22, 0, 0] },
    flapF: { rot: [-14, 0, 0] }, flapB: { rot: [12, 0, 0] },
    hatTip: { rot: [-16, 0, -5] },                // lags the slam by ~1 key
  };
  const overshoot = {                             // f10 — 1-frame past the hit
    ...strike,
    hips: { pos: [0, -0.055, 0.115], rot: [14, 17, 0] },
    chest: { rot: [30, 19, 0] },
    robe: { rot: [14, 6, 0], scale: [1.03, 0.97, 1.03] },
    upperArmR: { rot: [-42, 0, -16] },
    staff: { rot: [18, 0, 8] },
    orb: { scale: [1.8, 1.8, 1.8] },
    hatTip: { rot: [20, 0, 7] },                  // whips forward late
  };
  const recoil = {                                // f11-f12 — rebound
    ...strike,
    hips: { pos: [0, -0.025, 0.07], rot: [7, 12, 0] },
    chest: { rot: [14, 12, 0] },
    head: { rot: [-7, -5, 0] },
    robe: { rot: [6, 4, 0], scale: [1, 1, 1] },
    upperArmR: { rot: [-70, 0, -12] },
    staff: { rot: [52, 0, 11] },
    orb: { scale: [1.35, 1.35, 1.35] },
    upperArmL: { rot: [16, 0, 14] }, forearmL: { rot: [-16, 0, 0] },
    flapF: { rot: [-6, 0, 0] }, flapB: { rot: [5, 0, 0] },
    hatTip: { rot: [26, 0, 8] },                  // still swinging through
  };
  const settle = {                                // f13 — soft follow-through
    hips: { pos: [0, -0.01, 0.02], rot: [3, 5, 0] },
    chest: { rot: [5, 4, 0] },
    head: { rot: [-3, -2, 0] },
    robe: { rot: [2, 1, 0] },
    thighL: { rot: [-6, 0, 0] }, shinL: { rot: [6, 0, 0] }, footL: { rot: [0, 0, 0] },
    thighR: { rot: [8, 0, 0] }, shinR: { rot: [8, 0, 0] }, footR: { rot: [-12, 0, 0] },
    upperArmR: { rot: [-30, 0, -8] }, forearmR: { rot: [-10, 0, 0] },
    staff: { rot: [22, 0, 6] },
    orb: { scale: [1.12, 1.12, 1.12] },
    upperArmL: { rot: [8, 0, 10] }, forearmL: { rot: [-12, 0, 0] },
    hatTip: { rot: [-6, 0, -2] },                 // settles back last
  };
  // Breakdown keys ~0.06s apart keep the staff tip on a visible arc: at 16
  // captured frames (~0.09s each) the raise and the slam each span 2-3 frames.
  const attack = groundClip(root, bakeClip(root, 'attack', [
    { t: 0, pose: still, ease: 'in' },
    { t: 0.38, pose: windup, ease: 'inOut' },
    { t: 0.44, pose: raise, ease: 'out' },        // ease-out into the overhead arc
    { t: 0.47, pose: liftMid, ease: 'out' },
    { t: 0.50, pose: midsweep, ease: 'inOut' },
    { t: 0.56, pose: sweep, ease: 'inOut' },
    { t: 0.62, pose: arcUp, ease: 'inOut' },
    { t: 0.66, pose: overhead, ease: 'inOut' },
    { t: 0.70, pose: drift, ease: 'in' },
    { t: 0.76, pose: midStrike, ease: 'out' },
    { t: 0.82, pose: strike, ease: 'out' },
    { t: 0.87, pose: overshoot, ease: 'inOut' },
    { t: 0.98, pose: recoil, ease: 'inOut' },
    { t: 1.14, pose: settle, ease: 'inOut' },
    { t: 1.35, pose: still },
  ]));

  return { root, clips: [idle, walk, attack], meta: { height: 1.7, name: 'Mage' } };
}
