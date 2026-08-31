import * as THREE from 'three';
import { buildSkeleton } from '../lib/rig.js';
import {
  toonMaterial, latheBody, limbMesh, ball, facetBall, chunkyBox, facet, paintGradient,
} from '../lib/parts.js';
import { bakeClip, mirrorPose, blendPoses, groundClip } from '../lib/clips.js';

// "Ronin" — anime-style wandering swordsman. Off-white kimono + charcoal
// hakama (light outfit), deep indigo spiky hair + near-black scabbard (dark
// frame), crimson trailing scarf (accent). Katana worn edge-up at the LEFT
// hip; the attack is an iai draw-slash with an after-slash freeze.
// TWO katana representations swapped by scale (like the archer's nockArrow):
//   'sheathedKatana' (hilt in the saya, visible at rest)
//   'drawnKatana'    (in the right hand, scale 0.001 at rest, tip mesh
//                     named 'bladeTip' for the trajectory gate)
// Conventions: faces +Z; negative rx swings a hanging limb forward;
// positive ry turns the character's left (+X) side forward.
export function build() {
  const P = {
    hipHeight: 0.54, spineLen: 0.10, chestLen: 0.18, neckLen: 0.13, headLen: 0.05,
    shoulderX: 0.17, shoulderY: 0.09,
    upperArmLen: 0.17, forearmLen: 0.15,
    hipX: 0.10, thighLen: 0.23, shinLen: 0.22,
  };
  const { root, joints } = buildSkeleton(P);
  const D = THREE.MathUtils.degToRad;
  // Rest flare so wide sleeves clear the obi.
  joints.upperArmL.rotation.z = D(9);
  joints.upperArmR.rotation.z = D(-9);

  // Materials — big masses use vertexColors + painted gradient (fake AO).
  const vc = toonMaterial('#ffffff', { vertexColors: true });
  const grad = (mesh, bottom, top) => { paintGradient(mesh.geometry, bottom, top); return mesh; };
  const skin = toonMaterial('#f0c29a');
  const skinShade = toonMaterial('#d8ac88');       // cheek/vertex-shaded face uses vc instead
  const hakamaFlat = toonMaterial('#43424c');
  const obiM = toonMaterial('#4a3f4d');
  const scarfM = toonMaterial('#a56b68', { rim: 0.45 });
  const sayaM = toonMaterial('#232028', { rim: 0.4 });
  const hiltWrap = toonMaterial('#35313d', { rim: 0.3 });
  const bladeM = toonMaterial('#d7dde4', { rim: 0.65 });
  const gold = toonMaterial('#c9b37d', { rim: 0.5 });
  const cream = toonMaterial('#e2d6bc', { rim: 0.3 });
  const dark = toonMaterial('#2a2622', { rim: 0 });
  const white = toonMaterial('#f7f4ee', { rim: 0.2 });
  const amber = toonMaterial('#a78d68', { rim: 0.25 });
  const hairFlat = toonMaterial('#3d476e', { rim: 0.35 });
  const sandalM = toonMaterial('#a08863');

  // --- Torso: off-white kimono over charcoal hakama ------------------------
  const kimono = grad(latheBody(
    [[0.0, -0.13], [0.20, -0.11], [0.21, 0.02], [0.19, 0.18], [0.155, 0.30], [0.0, 0.36]],
    vc, { facet: true }
  ), '#a89f8b', '#f6efdd');
  joints.hips.add(kimono);

  // Hakama hip skirt (short — legs carry the wide pant shapes).
  const hipSkirt = grad(latheBody(
    [[0.245, -0.20], [0.225, -0.12], [0.19, -0.05]],
    vc, { facet: true }
  ), '#2b2a32', '#55545f');
  joints.hips.add(hipSkirt);

  // Obi belt + crimson cord + back knot.
  const obi = grad(latheBody(
    [[0.20, -0.115], [0.215, -0.065], [0.20, -0.015]],
    vc, { facet: true }
  ), '#3a323d', '#5c4f60');
  joints.hips.add(obi);
  const cordGeo = new THREE.TorusGeometry(0.208, 0.014, 5, 16);
  cordGeo.rotateX(Math.PI / 2); cordGeo.scale(1, 1, 0.88);
  const cord = facet(cordGeo, scarfM);
  cord.position.y = -0.065;
  joints.hips.add(cord);
  const knot = chunkyBox(0.10, 0.06, 0.05, obiM, { radius: 0.35 });
  knot.position.set(0, -0.06, -0.20);
  joints.hips.add(knot);

  // Kimono V-collar: two crossed lapel strips lying ON the chest + a small
  // skin notch at the throat (kept flat — big wedges read as praying hands).
  for (const [s, z] of [[1, 0.125], [-1, 0.133]]) {
    const lapel = chunkyBox(0.062, 0.20, 0.022, cream, { radius: 0.3 });
    lapel.position.set(s * 0.048, 0.035, z);
    lapel.rotation.z = D(s * 26);
    lapel.rotation.x = D(-14);
    joints.chest.add(lapel);
  }
  const chestV = facet(new THREE.CylinderGeometry(0.030, 0.002, 0.05, 3), skin);
  chestV.position.set(0, 0.085, 0.128);
  chestV.rotation.x = D(-16);
  joints.chest.add(chestV);

  // --- Head + the ANIME face -----------------------------------------------
  // Face ball with a vertical vertex gradient: warm shade low on the cheeks,
  // light on the brow — the "cheek shading" read.
  const face = grad(ball(0.185, vc, [1, 1.02, 0.95]), '#d8ac88', '#f6d0ab');
  face.position.y = 0.12;
  joints.head.add(face);
  // Layered anime eyes, ~1.5x the archer's: sclera / amber iris / pupil /
  // white highlight offset up-left (same corner both eyes, classic style).
  for (const s of [-1, 1]) {
    const sclera = ball(0.050, white, [1, 1.18, 0.42]);
    sclera.position.set(s * 0.073, 0.125, 0.152);
    sclera.rotation.y = D(s * 12);
    joints.head.add(sclera);
    const iris = ball(0.035, amber, [1, 1.22, 0.30]);
    iris.position.set(s * 0.071, 0.121, 0.172);
    iris.rotation.y = D(s * 12);
    joints.head.add(iris);
    const pupil = ball(0.0175, dark, [1, 1.3, 0.3]);
    pupil.position.set(s * 0.070, 0.117, 0.181);
    pupil.rotation.y = D(s * 12);
    joints.head.add(pupil);
    const hi = ball(0.011, white, [1, 1, 0.5]);
    hi.position.set(s * 0.070 - 0.013, 0.138, 0.183);
    joints.head.add(hi);
    // Thin dark brow, slightly angled — composed, not angry.
    const b = chunkyBox(0.082, 0.013, 0.02, dark, { radius: 0.3 });
    b.position.set(s * 0.075, 0.192, 0.158);
    b.rotation.z = D(s * -7);
    joints.head.add(b);
  }
  // Tiny anime nose + small calm mouth line (offset a touch: asymmetry).
  const nose = ball(0.014, skinShade, [1, 1.3, 1]);
  nose.position.set(0, 0.082, 0.180);
  joints.head.add(nose);
  const mouth = chunkyBox(0.042, 0.009, 0.012, skinShade, { radius: 0.3 });
  mouth.position.set(0.012, 0.038, 0.172);
  mouth.rotation.z = D(-4);
  joints.head.add(mouth);
  for (const s of [-1, 1]) {
    const ear = ball(0.038, skin, [0.6, 1, 0.75]);
    ear.position.set(s * 0.180, 0.10, 0.0);
    joints.head.add(ear);
  }

  // --- Signature spiky hair: indigo cones sweeping back-right --------------
  const hairGrad = (mesh) => grad(mesh, '#2d3552', '#7a8bc4');
  const cap = hairGrad(facetBall(0.196, vc, [1.0, 0.94, 0.98], [9, 6]));
  cap.position.set(0, 0.165, -0.025);
  joints.head.add(cap);
  // Crown spikes: [x, y, z, len, rx(back tilt), rz(right sweep)]
  const SPIKES = [
    [0.055, 0.290, 0.055, 0.17, -0.55, 0.30],
    [-0.045, 0.300, 0.030, 0.19, -0.60, 0.45],
    [0.105, 0.265, -0.030, 0.17, -0.75, 0.35],
    [-0.100, 0.270, -0.020, 0.16, -0.70, 0.55],
    [-0.055, 0.255, -0.115, 0.18, -1.05, 0.40],
    [0.115, 0.235, -0.100, 0.15, -1.00, 0.30],
    [-0.135, 0.245, 0.030, 0.13, -0.45, 0.75],
    [0.150, 0.240, 0.040, 0.12, -0.45, -0.15],
  ];
  for (const [x, y, z, len, rx, rz] of SPIKES) {
    const spike = hairGrad(facet(new THREE.ConeGeometry(0.052, len, 5), vc));
    spike.geometry.translate(0, len / 2, 0);   // pivot at base
    spike.position.set(x, y, z);
    spike.rotation.set(rx, 0, rz);
    joints.head.add(spike);
  }
  // The longest back spike gets its own named group so idle can sway it.
  const hairSpike = new THREE.Group();
  hairSpike.name = 'hairSpike';
  hairSpike.position.set(0.030, 0.260, -0.105);
  const bigSpike = hairGrad(facet(new THREE.ConeGeometry(0.058, 0.22, 5), vc));
  bigSpike.geometry.translate(0, 0.11, 0);
  bigSpike.rotation.set(-1.15, 0, 0.35);
  hairSpike.add(bigSpike);
  joints.head.add(hairSpike);
  // Bangs: three cones flipped down over the forehead.
  for (const [x, len, rz, rx] of [[-0.075, 0.13, 0.25, 2.75], [0.005, 0.15, -0.1, 2.65], [0.085, 0.12, -0.3, 2.75]]) {
    const bang = hairGrad(facet(new THREE.ConeGeometry(0.042, len, 5), vc));
    bang.geometry.translate(0, len / 2, 0);
    bang.position.set(x, 0.245, 0.135);
    bang.rotation.set(rx, 0, rz);
    joints.head.add(bang);
  }
  // Sideburn tufts framing the face.
  for (const s of [-1, 1]) {
    const burn = hairGrad(facet(new THREE.ConeGeometry(0.034, 0.11, 5), vc));
    burn.geometry.translate(0, 0.055, 0);
    burn.position.set(s * 0.165, 0.155, 0.075);
    burn.rotation.set(2.9, 0, s * -0.25);
    joints.head.add(burn);
  }

  // --- Crimson scarf: neck ring + lagging two-link tail chain --------------
  const ringGeo = new THREE.TorusGeometry(0.105, 0.040, 6, 14);
  ringGeo.rotateX(Math.PI / 2); ringGeo.scale(1, 1, 0.92);
  const ring = grad(facet(ringGeo, vc), '#8f5c5a', '#e0948d');
  ring.position.set(0, 0.125, 0.01);
  joints.chest.add(ring);
  // Tail: two chained named groups; segments OVERLAP so the tail reads as
  // one continuous ribbon, not floating pebbles.
  const scarfA = new THREE.Group();
  scarfA.name = 'scarfA';
  scarfA.position.set(0.035, 0.115, -0.115);
  const knotBall = grad(facetBall(0.052, vc, [1.1, 1.0, 0.9], [6, 5]), '#8f5c5a', '#e0948d');
  knotBall.position.set(0.005, -0.005, -0.005);
  scarfA.add(knotBall);
  const segA = grad(facetBall(0.058, vc, [0.95, 1.85, 0.55], [7, 5]), '#8f5c5a', '#e0948d');
  segA.position.set(0.012, -0.075, -0.030);
  segA.rotation.x = D(-16);
  scarfA.add(segA);
  const scarfB = new THREE.Group();
  scarfB.name = 'scarfB';
  scarfB.position.set(0.018, -0.150, -0.055);
  const segB = grad(facetBall(0.050, vc, [0.9, 1.85, 0.5], [7, 5]), '#7e514f', '#d18a84');
  segB.position.set(0.008, -0.055, -0.012);
  segB.rotation.x = D(-10);
  scarfB.add(segB);
  const tipSeg = grad(facetBall(0.038, vc, [0.8, 1.6, 0.5], [6, 4]), '#7e514f', '#d18a84');
  tipSeg.position.set(0.020, -0.135, -0.022);
  tipSeg.rotation.x = D(-6);
  scarfB.add(tipSeg);
  scarfA.add(scarfB);
  joints.chest.add(scarfA);

  // --- Limbs ---------------------------------------------------------------
  for (const s of ['L', 'R']) {
    // Kimono sleeve: seated INTO the shoulder (top tucked toward the torso)
    // and a moderate flare — wide enough to read kimono, not an egg blob.
    const sleeve = grad(limbMesh(0.066, 0.125, vc, { taper: 1.32, facet: true }),
      '#a89f8b', '#f2ead8');
    sleeve.position.set(s === 'L' ? -0.018 : 0.018, 0.035, 0);
    sleeve.rotation.z = D(s === 'L' ? -8 : 8);
    joints[`upperArm${s}`].add(sleeve);
    const upper = grad(limbMesh(0.056, P.upperArmLen, vc, { taper: 0.95, facet: true }),
      '#b5ac97', '#efe7d4');
    joints[`upperArm${s}`].add(upper);
    // Sleeve mouth trim ring hugging the hem opening (crimson echo).
    const trimGeo = new THREE.TorusGeometry(0.083, 0.013, 5, 10);
    trimGeo.rotateX(Math.PI / 2);
    const strim = facet(trimGeo, scarfM);
    strim.position.set(s === 'L' ? -0.014 : 0.014, -0.105, 0);
    strim.rotation.z = D(s === 'L' ? -8 : 8);
    joints[`upperArm${s}`].add(strim);
    // Bare forearm out of the sleeve.
    const fore = limbMesh(0.046, P.forearmLen + 0.02, skin, { taper: 1.02 });
    joints[`forearm${s}`].add(fore);
    // Faceted wedge fist (archer pattern — no sphere mittens).
    const fistGeo = new THREE.CylinderGeometry(0.072, 0.050, 0.12, 4, 1);
    fistGeo.rotateY(Math.PI / 4);
    fistGeo.scale(1, 1, 1.22);
    const fist = facet(fistGeo, skin);
    joints[`hand${s}`].add(fist);
    const thumb = facetBall(0.026, skin, [0.9, 1.3, 0.9], [5, 4]);
    thumb.position.set(s === 'L' ? -0.042 : 0.042, 0.005, 0.045);
    thumb.rotation.z = D(s === 'L' ? 24 : -24);
    joints[`hand${s}`].add(thumb);
    // Charcoal hakama: wide pant lathe shapes on thigh + shin.
    const thigh = grad(limbMesh(0.092, P.thighLen, vc, { taper: 1.18, facet: true }),
      '#2b2a32', '#55545f');
    joints[`thigh${s}`].add(thigh);
    const shin = grad(limbMesh(0.096, P.shinLen - 0.06, vc, { taper: 0.82, facet: true }),
      '#26252c', '#4c4b56');
    joints[`shin${s}`].add(shin);
    // Cream ankle wrap (kyahan) closing the hakama hem. Bottom must stay
    // ABOVE the sandal sole or groundClip pins the wrap, hovering the feet.
    const wrap = limbMesh(0.05, 0.04, cream, { taper: 1.05, facet: true });
    wrap.position.y = -0.115;
    joints[`shin${s}`].add(wrap);
    // White tabi foot bridging ankle to sole, then the flat sandal.
    const tabi = chunkyBox(0.095, 0.06, 0.17, white, { radius: 0.35 });
    tabi.position.set(0, -0.028, 0.025);
    joints[`foot${s}`].add(tabi);
    const sole = chunkyBox(0.115, 0.034, 0.21, sandalM, { radius: 0.3 });
    sole.position.set(0, -0.052, 0.035);
    joints[`foot${s}`].add(sole);
    const strap = chunkyBox(0.10, 0.018, 0.05, dark, { radius: 0.35 });
    strap.position.set(0, -0.028, 0.085);
    strap.rotation.x = D(24);
    joints[`foot${s}`].add(strap);
  }

  // --- Katana at the LEFT hip: saya + sheathed hilt + drawn twin -----------
  // Saya worn edge-up iai style: mouth forward, tail back, pitched ~15° so
  // the hilt rides up-forward.
  const saya = new THREE.Group();
  saya.name = 'saya';
  saya.position.set(0.155, -0.085, 0.04);
  saya.rotation.set(-0.26, -0.12, 0);
  const sayaTube = facet(new THREE.CylinderGeometry(0.028, 0.024, 0.46, 6)
    .rotateX(Math.PI / 2), sayaM);
  sayaTube.position.z = -0.09;
  saya.add(sayaTube);
  const koiguchi = facet(new THREE.TorusGeometry(0.028, 0.008, 5, 8), gold);
  koiguchi.position.z = 0.135;
  saya.add(koiguchi);
  // Sageo cord wraps (crimson).
  for (const z of [0.02, -0.05]) {
    const sag = facet(new THREE.TorusGeometry(0.030, 0.007, 5, 8), scarfM);
    sag.position.z = z;
    saya.add(sag);
  }
  const kojiri = facetBall(0.026, gold, [1, 1, 1.3], [6, 4]);
  kojiri.position.z = -0.325;
  saya.add(kojiri);
  // Rest world direction of the saya axis (parents are identity at rest) —
  // the weapon gate checks the saya never strays >25° from this.
  saya.userData.restDir = new THREE.Vector3(0, 0, 1).applyQuaternion(saya.quaternion.clone());
  joints.hips.add(saya);

  // (a) Sheathed representation: wrapped hilt + tsuba at the saya mouth.
  const sheathed = new THREE.Group();
  sheathed.name = 'sheathedKatana';
  sheathed.position.set(0, 0, 0.14);
  const sHilt = facet(new THREE.CylinderGeometry(0.020, 0.023, 0.14, 6)
    .rotateX(Math.PI / 2), hiltWrap);
  sHilt.position.z = 0.08;
  sheathed.add(sHilt);
  const sKashira = facetBall(0.022, gold, [1, 1, 1], [5, 4]);
  sKashira.position.z = 0.15;
  sheathed.add(sKashira);
  const sTsuba = facet(new THREE.CylinderGeometry(0.040, 0.040, 0.012, 8)
    .rotateX(Math.PI / 2), gold);
  sTsuba.position.z = 0.008;
  sheathed.add(sTsuba);
  saya.add(sheathed);

  // (b) Drawn katana in the RIGHT hand. Built blade-along +Y then flipped so
  // the blade extends past the fist as an arm extension (hand local -Y).
  const drawn = new THREE.Group();
  drawn.name = 'drawnKatana';
  drawn.position.set(0, -0.02, 0);
  drawn.rotation.x = Math.PI;
  const dHilt = facet(new THREE.CylinderGeometry(0.023, 0.020, 0.15, 6), hiltWrap);
  dHilt.position.y = -0.015;
  drawn.add(dHilt);
  const dKashira = facetBall(0.023, gold, [1, 1.2, 1], [5, 4]);
  dKashira.position.y = -0.09;
  drawn.add(dKashira);
  const dTsuba = facet(new THREE.CylinderGeometry(0.042, 0.042, 0.013, 8), gold);
  dTsuba.position.y = 0.062;
  drawn.add(dTsuba);
  const blade = facet(new THREE.BoxGeometry(0.013, 0.44, 0.048), bladeM);
  blade.position.set(0, 0.285, 0.004);
  drawn.add(blade);
  const bladeTip = facet(new THREE.CylinderGeometry(0.0015, 0.020, 0.06, 4), bladeM);
  bladeTip.name = 'bladeTip';
  bladeTip.geometry.scale(0.65, 1, 2.2);
  bladeTip.position.set(0, 0.535, 0.004);
  drawn.add(bladeTip);
  drawn.scale.setScalar(0.001);   // rest = hidden; attack swaps it in
  joints.handR.add(drawn);

  // --- Clips ---------------------------------------------------------------
  // Guard pose: left hand resting on the saya, right hand hovering near the
  // hilt front-center — the iai carry that idle/walk keep.
  const guardArms = {
    upperArmL: { rot: [-10, 0, -4] }, forearmL: { rot: [-14, 0, 0] }, handL: { rot: [-22, 0, 0] },
    upperArmR: { rot: [-14, 0, 10] }, forearmR: { rot: [-30, 0, 0] }, handR: { rot: [8, 0, 0] },
  };

  // Idle 2.5s: weight settled BACK, slow breath, scarf + back hair spike
  // swaying with lag. Asymmetric holds — zero twinning.
  const idleA = {
    hips: { pos: [0, -0.008, -0.012], rot: [-2, -3, 1] },
    chest: { rot: [3, 4, -1] },
    head: { rot: [1, -5, 1.5] },
    scarfA: { rot: [4, 2, 1] }, scarfB: { rot: [3, 0, 0] },
    hairSpike: { rot: [2, 0, 1] },
    thighL: { rot: [-3, 0, 0] }, shinL: { rot: [5, 0, 0] }, footL: { rot: [-2, 0, 0] },
    thighR: { rot: [-1.5, 0, 0] }, shinR: { rot: [2.5, 0, 0] }, footR: { rot: [-1, 0, 0] },
    ...guardArms,
  };
  const idleB = {
    hips: { pos: [0, -0.016, -0.016], rot: [-3, -1, -1] },
    chest: { pos: [0, 0.010, 0.004], rot: [1, 1, 1] },       // inhale
    head: { rot: [-2, 3, -1] },
    scarfA: { rot: [8, -2, -1] }, scarfB: { rot: [6, 1, 0] },   // lags the breath
    hairSpike: { rot: [5, 0, -2] },
    thighL: { rot: [-4.5, 0, 0] }, shinL: { rot: [7, 0, 0] }, footL: { rot: [-2.5, 0, 0] },
    thighR: { rot: [-3, 0, 0] }, shinR: { rot: [5, 0, 0] }, footR: { rot: [-2, 0, 0] },
    upperArmL: { rot: [-12, 0, -5] }, forearmL: { rot: [-16, 0, 0] }, handL: { rot: [-20, 0, 0] },
    upperArmR: { rot: [-11, 0, 9] }, forearmR: { rot: [-26, 0, 0] }, handR: { rot: [11, 0, 0] },
  };
  const idleC = {
    hips: { pos: [0.006, -0.011, -0.010], rot: [-2, 3, 0] },
    chest: { rot: [4, -3, 0] },                              // exhale
    head: { rot: [0, 8, 0.5] },
    scarfA: { rot: [2, 4, 2] }, scarfB: { rot: [5, -2, 1] },
    hairSpike: { rot: [3, 0, 3] },
    thighL: { rot: [-3.5, 0, 0] }, shinL: { rot: [5.5, 0, 0] }, footL: { rot: [-2, 0, 0] },
    thighR: { rot: [-2, 0, 0] }, shinR: { rot: [3.5, 0, 0] }, footR: { rot: [-1.5, 0, 0] },
    upperArmL: { rot: [-9, 0, -4] }, forearmL: { rot: [-13, 0, 0] }, handL: { rot: [-24, 0, 0] },
    upperArmR: { rot: [-17, 0, 11] }, forearmR: { rot: [-33, 0, 0] }, handR: { rot: [5, 0, 0] },
  };
  const idle = groundClip(root, bakeClip(root, 'idle', [
    { t: 0.0, pose: idleA },
    { t: 0.9, pose: idleB },
    { t: 1.75, pose: idleC },
    { t: 2.5, pose: idleA },
  ]));

  // Walk 0.85s: measured, upright glide. Hands stay near the hilt (pinned
  // after mirroring), bob comes from support-leg extension, scarf trails.
  const T = 0.85;
  // Per-phase arm micro-variants keep the pinned arms from reading rigid.
  // Left palm rides the saya (tiny drift only); the right arm swings against
  // the stride — swing is the upperArm rx delta, elbow follows.
  const armWalk = (swing, dl = 0) => ({
    upperArmL: { rot: [-10 + dl, 0, -4] }, forearmL: { rot: [-14 - dl, 0, 0] }, handL: { rot: [-22, 0, 0] },
    upperArmR: { rot: [-14 + swing, 0, 10] }, forearmR: { rot: [-24 - Math.max(0, -swing) * 0.8, 0, 0] }, handR: { rot: [6, 0, 0] },
  });
  const contactL = {
    hips: { pos: [0, -0.045, 0], rot: [3, 7, 3] },
    chest: { rot: [2, -8, -3] },
    head: { rot: [-2, 1, 0.5] },
    scarfA: { rot: [10, 0, 1] }, scarfB: { rot: [8, 0, 0] },
    // Rear toe pulled UP (sum 50, not 70) so groundClip pins the front sole,
    // not a dangling push-off toe — that hover was visible in the probe.
    thighL: { rot: [-30, 0, 0] }, shinL: { rot: [28, 0, 0] }, footL: { rot: [0, 0, 0] },
    thighR: { rot: [20, 0, 0] }, shinR: { rot: [42, 0, 0] }, footR: { rot: [-12, 0, 0] },
  };
  const downL = {
    hips: { pos: [0, -0.042, 0], rot: [5, 5, 8] },
    chest: { rot: [4, -6, -6] },
    head: { rot: [-3, 1, -2.5] },
    scarfA: { rot: [14, 0, 1] }, scarfB: { rot: [10, 0, 0] },
    thighL: { rot: [-34, 0, 0] }, shinL: { rot: [64, 0, 0] }, footL: { rot: [-30, 0, 0] },
    thighR: { rot: [26, 0, 0] }, shinR: { rot: [46, 0, 0] }, footR: { rot: [-6, 0, 0] },
  };
  const passL = {
    hips: { pos: [0, 0.012, 0], rot: [2, 0, 6] },
    chest: { rot: [2, -1, -4] },
    head: { rot: [-2, 0, -2] },
    scarfA: { rot: [6, 0, -1] }, scarfB: { rot: [12, 0, 0] },
    thighL: { rot: [-2, 0, 0] }, shinL: { rot: [2, 0, 0] }, footL: { rot: [0, 0, 0] },
    thighR: { rot: [8, 0, 0] }, shinR: { rot: [68, 0, 0] }, footR: { rot: [-20, 0, 0] },
  };
  const upL = {
    hips: { pos: [0, 0.010, 0], rot: [2, -5, 2.5] },
    chest: { rot: [2, 6, -1.5] },
    head: { rot: [-2, -1, -1] },
    scarfA: { rot: [4, 0, -1] }, scarfB: { rot: [8, 0, -1] },
    thighL: { rot: [13, 0, 0] }, shinL: { rot: [15, 0, 0] }, footL: { rot: [-24, 0, 0] },
    thighR: { rot: [-22, 0, 0] }, shinR: { rot: [58, 0, 0] }, footR: { rot: [-16, 0, 0] },
  };
  const mC = mirrorPose(contactL), mD = mirrorPose(downL);
  const mP = mirrorPose(passL), mU = mirrorPose(upL);
  const walk = groundClip(root, bakeClip(root, 'walk', [
    { t: 0, pose: blendPoses(contactL, armWalk(-16, 1)) },   // left leg fwd -> right arm fwd
    { t: T * 0.12, pose: blendPoses(downL, armWalk(-13, 2)) },
    { t: T * 0.25, pose: blendPoses(passL, armWalk(-4, 0)) },
    { t: T * 0.38, pose: blendPoses(upL, armWalk(6, -1)) },
    { t: T * 0.5, pose: blendPoses(mC, armWalk(12, -1)) },    // right leg fwd -> right arm back
    { t: T * 0.62, pose: blendPoses(mD, armWalk(9, 0)) },
    { t: T * 0.75, pose: blendPoses(mP, armWalk(2, 0)) },
    { t: T * 0.88, pose: blendPoses(mU, armWalk(-8, 1)) },
    { t: T, pose: blendPoses(contactL, armWalk(-16, 1)) },
  ]));

  // Attack 1.4s: IAI DRAW-SLASH.
  //   0.00-0.55  anticipation (39%): settle, crouch, hand closes on the hilt
  //   0.55       SWAP on the 20fps grid (f11): sheathed out, drawn in
  //   0.55-0.65  instant horizontal draw-slash — bladeTip sweeps +x -> -x
  //              across f11/f12/f13 (keys ON the grid; clip baked at 40fps
  //              so 0.025-step samples hit every key exactly)
  //   0.65-0.95  after-slash FREEZE, scarf still settling
  //   0.95-1.15  quick re-sheathe (swap back between f22 and f23)
  //   1.15-1.40  return to rest
  const still = { ...guardArms, scarfA: { rot: [2, 0, 0] }, scarfB: { rot: [2, 0, 0] } };
  const shift = {
    hips: { pos: [0, -0.035, 0], rot: [3, 6, 0] },
    chest: { rot: [5, 9, 0] },
    head: { rot: [-3, -7, 0] },
    scarfA: { rot: [6, 1, 0] }, scarfB: { rot: [4, 0, 0] },
    thighL: { rot: [-11, 0, 0] }, shinL: { rot: [16, 0, 0] }, footL: { rot: [-5, 0, 0] },
    thighR: { rot: [-9, 0, 0] }, shinR: { rot: [14, 0, 0] }, footR: { rot: [-5, 0, 0] },
    upperArmL: { rot: [-21, 0, -14] }, forearmL: { rot: [-33, 0, 0] },
    upperArmR: { rot: [-32, -6, 24] }, forearmR: { rot: [-42, 0, 0] }, handR: { rot: [10, 0, 0] },
  };
  // Coil: DEEP crouch wound toward the saya side, chest leaning down-left so
  // the right hand visibly closes on the hilt (a chibi arm can't truly reach
  // the left hip — the lean sells the grip).
  const coil = {
    hips: { pos: [0, -0.10, 0], rot: [7, 14, 0] },
    chest: { rot: [12, 20, 0] },
    head: { rot: [-8, -16, 0] },
    scarfA: { rot: [12, 3, 1] }, scarfB: { rot: [8, 1, 0] },
    thighL: { rot: [-26, 0, 0] }, shinL: { rot: [38, 0, 0] }, footL: { rot: [-12, 0, 0] },
    thighR: { rot: [-20, 0, 0] }, shinR: { rot: [32, 0, 0] }, footR: { rot: [-12, 0, 0] },
    upperArmL: { rot: [-28, 0, -16] }, forearmL: { rot: [-36, 0, 0] }, handL: { rot: [-6, 0, 0] },
    upperArmR: { rot: [-46, -14, 34] }, forearmR: { rot: [-44, 0, 0] }, handR: { rot: [16, 0, 0] },
  };
  const coilHold = {
    ...coil,
    hips: { pos: [0, -0.105, 0], rot: [8, 15, 0] },
    chest: { rot: [13, 21, 0] },
    head: { rot: [-9, -17, 0] },
    scarfA: { rot: [13, 3, 1] }, scarfB: { rot: [10, 1, 0] },
    upperArmR: { rot: [-48, -14, 36] }, forearmR: { rot: [-46, 0, 0] }, handR: { rot: [18, 0, 0] },
    sheathedKatana: { scale: [1, 1, 1] },
    drawnKatana: { scale: [0.001, 0.001, 0.001] },
  };
  // f11 (0.55): the SWAP — blade clear of the saya, arm still cross-body
  // left; the tip starts far on the +x side.
  const drawStart = {
    hips: { pos: [0, -0.050, 0], rot: [4, 8, 0] },
    chest: { rot: [5, 10, 0] },
    head: { rot: [-3, -6, 0] },
    scarfA: { rot: [8, 2, 0] }, scarfB: { rot: [8, 1, 0] },
    thighL: { rot: [-18, 0, 0] }, shinL: { rot: [27, 0, 0] }, footL: { rot: [-9, 0, 0] },
    thighR: { rot: [-14, 0, 0] }, shinR: { rot: [23, 0, 0] }, footR: { rot: [-9, 0, 0] },
    upperArmL: { rot: [-26, 0, -14] }, forearmL: { rot: [-30, 0, 0] },
    upperArmR: { rot: [-52, -14, 34] }, forearmR: { rot: [-26, 0, 0] }, handR: { rot: [4, 0, 0] },
    sheathedKatana: { scale: [0.001, 0.001, 0.001] },
    drawnKatana: { scale: [1, 1, 1] },
  };
  // f12 (0.60): mid-slash — blade horizontal across the front center.
  const slashMid = {
    hips: { pos: [0, -0.045, 0.02], rot: [4, -4, 0] },
    chest: { rot: [5, -9, 0] },
    head: { rot: [-3, 4, 0] },
    scarfA: { rot: [-6, -3, 0] }, scarfB: { rot: [4, 0, 0] },
    thighL: { rot: [-20, 0, 0] }, shinL: { rot: [28, 0, 0] }, footL: { rot: [-8, 0, 0] },
    thighR: { rot: [-10, 0, 0] }, shinR: { rot: [20, 0, 0] }, footR: { rot: [-10, 0, 0] },
    upperArmL: { rot: [-18, 0, -18] }, forearmL: { rot: [-36, 0, 0] },
    upperArmR: { rot: [-74, 0, -6] }, forearmR: { rot: [-10, 0, 0] }, handR: { rot: [2, 0, 0] },
    sheathedKatana: { scale: [0.001, 0.001, 0.001] },
    drawnKatana: { scale: [1, 1, 1] },
  };
  // f13 (0.65): full extension right — the famous freeze pose.
  const slashEnd = {
    hips: { pos: [0, -0.050, 0.05], rot: [5, -16, 0] },
    chest: { rot: [6, -24, 0] },
    head: { rot: [-3, 14, 0] },
    scarfA: { rot: [-18, -6, -2] }, scarfB: { rot: [-10, -2, 0] },
    thighL: { rot: [-26, 0, 0] }, shinL: { rot: [34, 0, 0] }, footL: { rot: [-8, 0, 0] },
    thighR: { rot: [4, 0, 0] }, shinR: { rot: [30, 0, 0] }, footR: { rot: [-20, 0, 0] },
    upperArmL: { rot: [-14, 0, -24] }, forearmL: { rot: [-40, 0, 0] },
    upperArmR: { rot: [-72, 0, -58] }, forearmR: { rot: [-8, 0, 0] }, handR: { rot: [0, 0, 0] },
    sheathedKatana: { scale: [0.001, 0.001, 0.001] },
    drawnKatana: { scale: [1, 1, 1] },
  };
  // Tiny overshoot then the freeze hold; scarf keeps settling through it.
  const freezeA = {
    ...slashEnd,
    hips: { pos: [0, -0.053, 0.05], rot: [5, -17, 0] },
    chest: { rot: [6, -26, 0] },
    upperArmR: { rot: [-73, 0, -60] },
    scarfA: { rot: [-24, -7, -2] }, scarfB: { rot: [-16, -3, 0] },
  };
  const freezeB = {
    ...slashEnd,
    hips: { pos: [0, -0.050, 0.048], rot: [5, -16, 0] },
    chest: { rot: [6, -24, 0] },
    head: { rot: [-2, 12, 0] },
    upperArmR: { rot: [-72, 0, -58] },
    scarfA: { rot: [-4, -1, 0] }, scarfB: { rot: [-14, -2, -1] },   // tail still catching up
  };
  const freezeC = {
    ...slashEnd,
    hips: { pos: [0, -0.049, 0.047], rot: [5, -15.5, 0] },
    head: { rot: [-2, 11, 0] },
    scarfA: { rot: [3, 1, 0] }, scarfB: { rot: [-2, 0, 0] },
  };
  // Re-sheathe: blade swings back over the front (kept clear of the body),
  // then swaps back into the saya between f22 and f23.
  const resheatheMid = {
    hips: { pos: [0, -0.045, 0.02], rot: [3, 2, 0] },
    chest: { rot: [4, 6, 0] },
    head: { rot: [-2, -8, 0] },
    scarfA: { rot: [6, 1, 0] }, scarfB: { rot: [4, 1, 0] },
    thighL: { rot: [-16, 0, 0] }, shinL: { rot: [24, 0, 0] }, footL: { rot: [-8, 0, 0] },
    thighR: { rot: [-12, 0, 0] }, shinR: { rot: [20, 0, 0] }, footR: { rot: [-8, 0, 0] },
    upperArmL: { rot: [-22, 0, -14] }, forearmL: { rot: [-32, 0, 0] },
    upperArmR: { rot: [-58, -10, 22] }, forearmR: { rot: [-30, 0, 0] }, handR: { rot: [6, 0, 0] },
    sheathedKatana: { scale: [0.001, 0.001, 0.001] },
    drawnKatana: { scale: [1, 1, 1] },
  };
  const sheathe = {
    hips: { pos: [0, -0.040, 0.01], rot: [3, 6, 0] },
    chest: { rot: [4, 9, 0] },
    head: { rot: [-2, -9, 0] },
    scarfA: { rot: [5, 1, 0] }, scarfB: { rot: [5, 1, 0] },
    thighL: { rot: [-13, 0, 0] }, shinL: { rot: [20, 0, 0] }, footL: { rot: [-7, 0, 0] },
    thighR: { rot: [-10, 0, 0] }, shinR: { rot: [17, 0, 0] }, footR: { rot: [-7, 0, 0] },
    upperArmL: { rot: [-24, 0, -15] }, forearmL: { rot: [-32, 0, 0] },
    upperArmR: { rot: [-34, -6, 24] }, forearmR: { rot: [-52, 0, 0] }, handR: { rot: [10, 0, 0] },
    sheathedKatana: { scale: [1, 1, 1] },
    drawnKatana: { scale: [0.001, 0.001, 0.001] },
  };
  // 40fps bake: samples land on the 0.025 grid, so every 20fps gate frame
  // (0.05 steps) reads key values exactly — the swap is frame-crisp.
  const attack = groundClip(root, bakeClip(root, 'attack', [
    { t: 0.00, pose: still, ease: 'inOut' },
    { t: 0.20, pose: shift, ease: 'inOut' },
    { t: 0.40, pose: coil, ease: 'in' },
    { t: 0.525, pose: coilHold, ease: 'linear' },   // tension creep, props explicit
    { t: 0.55, pose: drawStart, ease: 'linear' },   // f11: SWAP + blade far left
    { t: 0.60, pose: slashMid, ease: 'linear' },    // f12: front center
    { t: 0.65, pose: slashEnd, ease: 'out' },       // f13: extension right
    { t: 0.70, pose: freezeA, ease: 'out' },        // overshoot
    { t: 0.80, pose: freezeB, ease: 'inOut' },      // FREEZE, scarf settling
    { t: 0.95, pose: freezeC, ease: 'inOut' },
    { t: 1.10, pose: resheatheMid, ease: 'linear' },// f22: last drawn frame
    { t: 1.125, pose: sheathe, ease: 'inOut' },     // swap back before f23
    { t: 1.15, pose: sheathe, ease: 'inOut' },
    { t: 1.40, pose: still },
  ], { fps: 40 }));

  // Run 0.55s: walk's pose language pushed harder — deeper forward lean,
  // wider stride, both arms pump free of the saya (the left hand leaving the
  // hilt is correct for a sprint). Support-leg extension (bent at down,
  // straight at passing) is what gives groundClip's re-seat a real bob.
  const TR = 0.55;
  const armRun = (rSwing) => ({
    upperArmR: { rot: [-18 + rSwing, 0, 8] }, forearmR: { rot: [-50 - Math.max(0, -rSwing) * 0.5, 0, 0] }, handR: { rot: [2, 0, 0] },
    upperArmL: { rot: [-18 - rSwing, 0, -6] }, forearmL: { rot: [-50 - Math.max(0, rSwing) * 0.5, 0, 0] }, handL: { rot: [-6, 0, 0] },
  });
  const rContactL = {
    hips: { pos: [0, -0.055, 0], rot: [5, 8, 4] },
    chest: { rot: [14, -10, -4] },
    head: { rot: [-3, 1, 1] },
    scarfA: { rot: [18, 0, 2] }, scarfB: { rot: [15, 0, 0] },
    thighL: { rot: [-40, 0, 0] }, shinL: { rot: [24, 0, 0] }, footL: { rot: [2, 0, 0] },
    thighR: { rot: [30, 0, 0] }, shinR: { rot: [52, 0, 0] }, footR: { rot: [-14, 0, 0] },
  };
  const rDownL = {
    hips: { pos: [0, -0.065, 0], rot: [8, 5, 9] },
    chest: { rot: [16, -7, -8] },
    head: { rot: [-4, 1, -3] },
    scarfA: { rot: [22, 0, 2] }, scarfB: { rot: [17, 0, 0] },
    thighL: { rot: [-42, 0, 0] }, shinL: { rot: [72, 0, 0] }, footL: { rot: [-34, 0, 0] },
    thighR: { rot: [36, 0, 0] }, shinR: { rot: [56, 0, 0] }, footR: { rot: [-8, 0, 0] },
  };
  const rPassL = {
    hips: { pos: [0, 0.022, 0], rot: [5, 0, 8] },
    chest: { rot: [10, -1, -5] },
    head: { rot: [-3, 0, -2] },
    scarfA: { rot: [12, 0, -1] }, scarfB: { rot: [18, 0, 0] },
    thighL: { rot: [2, 0, 0] }, shinL: { rot: [6, 0, 0] }, footL: { rot: [4, 0, 0] },
    thighR: { rot: [14, 0, 0] }, shinR: { rot: [80, 0, 0] }, footR: { rot: [-26, 0, 0] },
  };
  const rUpL = {
    hips: { pos: [0, 0.020, 0], rot: [5, -8, 3] },
    chest: { rot: [10, 9, -2] },
    head: { rot: [-3, -1, -1] },
    scarfA: { rot: [10, 0, -1] }, scarfB: { rot: [14, 0, -1] },
    thighL: { rot: [24, 0, 0] }, shinL: { rot: [22, 0, 0] }, footL: { rot: [-32, 0, 0] },
    thighR: { rot: [-40, 0, 0] }, shinR: { rot: [60, 0, 0] }, footR: { rot: [-22, 0, 0] },
  };
  const rmC = mirrorPose(rContactL), rmD = mirrorPose(rDownL);
  const rmP = mirrorPose(rPassL), rmU = mirrorPose(rUpL);
  const run = groundClip(root, bakeClip(root, 'run', [
    { t: 0, pose: blendPoses(rContactL, armRun(-34)) },
    { t: TR * 0.12, pose: blendPoses(rDownL, armRun(-28)) },
    { t: TR * 0.25, pose: blendPoses(rPassL, armRun(-6)) },
    { t: TR * 0.38, pose: blendPoses(rUpL, armRun(16)) },
    { t: TR * 0.5, pose: blendPoses(rmC, armRun(34)) },
    { t: TR * 0.62, pose: blendPoses(rmD, armRun(28)) },
    { t: TR * 0.75, pose: blendPoses(rmP, armRun(6)) },
    { t: TR * 0.88, pose: blendPoses(rmU, armRun(-16)) },
    { t: TR, pose: blendPoses(rContactL, armRun(-34)) },
  ]));

  // Hit 0.3s one-shot: sharp flinch, starts/ends at the guard pose (`still`,
  // shared with attack). Peak by 0.08s (snappy onset), eased recovery.
  const hitPeak = {
    hips: { pos: [0, -0.01, -0.03], rot: [-4, -6, 4] },
    chest: { rot: [-10, -5, 7] },
    head: { rot: [-22, 18, -10] },
    scarfA: { rot: [-8, 4, 2] }, scarfB: { rot: [-5, 3, 1] },
    thighL: { rot: [9, 0, 0] }, shinL: { rot: [14, 0, 0] }, footL: { rot: [-5, 0, 0] },
    thighR: { rot: [-7, 0, 0] }, shinR: { rot: [9, 0, 0] }, footR: { rot: [2, 0, 0] },
    upperArmL: { rot: [-6, 0, -2] }, forearmL: { rot: [-10, 0, 0] }, handL: { rot: [-18, 0, 0] },
    upperArmR: { rot: [-42, 0, 24] }, forearmR: { rot: [-52, 0, 0] }, handR: { rot: [-6, 0, 0] },
  };
  const hitSettle = {
    hips: { pos: [0, -0.005, -0.015], rot: [-2, -3, 1.5] },
    chest: { rot: [-4, -2, 3] },
    head: { rot: [-8, 8, -4] },
    scarfA: { rot: [0, 2, 1] }, scarfB: { rot: [0, 1, 0] },
    thighL: { rot: [3, 0, 0] }, shinL: { rot: [5, 0, 0] }, footL: { rot: [-2, 0, 0] },
    thighR: { rot: [-3, 0, 0] }, shinR: { rot: [4, 0, 0] }, footR: { rot: [1, 0, 0] },
    upperArmL: { rot: [-9, 0, -3] }, forearmL: { rot: [-13, 0, 0] }, handL: { rot: [-20, 0, 0] },
    upperArmR: { rot: [-22, 0, 15] }, forearmR: { rot: [-38, 0, 0] }, handR: { rot: [2, 0, 0] },
  };
  const hit = groundClip(root, bakeClip(root, 'hit', [
    { t: 0.00, pose: still, ease: 'out' },
    { t: 0.08, pose: hitPeak, ease: 'out' },
    { t: 0.18, pose: hitSettle, ease: 'inOut' },
    { t: 0.30, pose: still },
  ]));

  // Death 1.3s one-shot: staggers, sinks to knees, folds forward to the
  // ground. Does NOT return to rest — the final pose repeats at the very
  // end (t=1.15 and t=1.30 are identical) so it holds cleanly once the
  // runtime clamps on the last frame. Katana stays sheathed throughout —
  // no pose here ever touches saya/sheathedKatana/drawnKatana, so they sit
  // at their built rest transforms (sheathed visible, drawn hidden) the
  // whole clip. groundClip re-seats hips every sample so the authored
  // hips.pos y values are just an authoring guide, not the final height —
  // the fold shape comes from spine/chest/thigh/shin rotation.
  const dStagger = {
    hips: { pos: [0, -0.02, -0.02], rot: [-6, 4, 3] },
    chest: { rot: [-8, 3, 4] },
    head: { rot: [-10, 6, -4] },
    scarfA: { rot: [-4, 2, 1] }, scarfB: { rot: [-2, 1, 0] },
    thighL: { rot: [6, 0, 0] }, shinL: { rot: [10, 0, 0] }, footL: { rot: [-3, 0, 0] },
    thighR: { rot: [-4, 0, 0] }, shinR: { rot: [7, 0, 0] }, footR: { rot: [2, 0, 0] },
    upperArmL: { rot: [-6, 0, -3] }, forearmL: { rot: [-10, 0, 0] }, handL: { rot: [-16, 0, 0] },
    upperArmR: { rot: [-10, 0, 6] }, forearmR: { rot: [-22, 0, 0] }, handR: { rot: [4, 0, 0] },
  };
  const dKneel = {
    hips: { pos: [0, -0.28, -0.04], rot: [10, 6, 2] },
    chest: { rot: [15, 4, 3] },
    head: { rot: [8, 4, -2] },
    scarfA: { rot: [10, 1, 1] }, scarfB: { rot: [8, 1, 0] },
    thighL: { rot: [-70, 0, 0] }, shinL: { rot: [110, 0, 0] }, footL: { rot: [10, 0, 0] },
    thighR: { rot: [-65, 0, 0] }, shinR: { rot: [105, 0, 0] }, footR: { rot: [8, 0, 0] },
    upperArmL: { rot: [-2, 0, -6] }, forearmL: { rot: [-6, 0, 0] }, handL: { rot: [-10, 0, 0] },
    upperArmR: { rot: [-4, 0, 4] }, forearmR: { rot: [-10, 0, 0] }, handR: { rot: [2, 0, 0] },
  };
  const dFold = {
    hips: { pos: [0, -0.34, 0.05], rot: [22, 4, 2] },
    spine: { rot: [16, 0, 0] },
    chest: { rot: [40, 3, 3] },
    head: { rot: [22, 3, -2] },
    scarfA: { rot: [18, 1, 1] }, scarfB: { rot: [14, 1, 0] },
    thighL: { rot: [-78, 0, 0] }, shinL: { rot: [130, 0, 0] }, footL: { rot: [18, 0, 0] },
    thighR: { rot: [-74, 0, 0] }, shinR: { rot: [128, 0, 0] }, footR: { rot: [16, 0, 0] },
    upperArmL: { rot: [8, 0, -10] }, forearmL: { rot: [-3, 0, 0] }, handL: { rot: [4, 0, 0] },
    upperArmR: { rot: [10, 0, 10] }, forearmR: { rot: [-4, 0, 0] }, handR: { rot: [2, 0, 0] },
  };
  const dFinal = {
    hips: { pos: [0, -0.36, 0.12], rot: [30, 2, 2] },
    spine: { rot: [28, 0, 0] },
    chest: { rot: [48, 2, 2] },
    head: { rot: [22, 2, -1] },
    scarfA: { rot: [22, 0, 1] }, scarfB: { rot: [16, 0, 0] },
    thighL: { rot: [-80, 0, 0] }, shinL: { rot: [136, 0, 0] }, footL: { rot: [20, 0, 0] },
    thighR: { rot: [-76, 0, 0] }, shinR: { rot: [134, 0, 0] }, footR: { rot: [18, 0, 0] },
    upperArmL: { rot: [12, 0, -14] }, forearmL: { rot: [-4, 0, 0] }, handL: { rot: [6, 0, 0] },
    upperArmR: { rot: [14, 0, 14] }, forearmR: { rot: [-5, 0, 0] }, handR: { rot: [4, 0, 0] },
  };
  const death = groundClip(root, bakeClip(root, 'death', [
    { t: 0.00, pose: still, ease: 'inOut' },
    { t: 0.12, pose: dStagger, ease: 'out' },
    { t: 0.45, pose: dKneel, ease: 'in' },
    { t: 0.80, pose: dFold, ease: 'inOut' },
    { t: 1.15, pose: dFinal, ease: 'inOut' },
    { t: 1.30, pose: dFinal },
  ]));

  return {
    root, clips: [idle, walk, run, attack, hit, death],
    meta: { height: 1.36, name: 'Ronin', role: 'player', requiredClips: ['idle', 'walk', 'run', 'attack', 'hit', 'death'] },
  };
}
