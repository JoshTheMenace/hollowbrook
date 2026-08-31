import * as THREE from 'three';
import { buildSkeleton } from '../lib/rig.js';
import {
  toonMaterial, latheBody, limbMesh, ball, facetBall, chunkyBox, facet, paintGradient,
  conformalStrap, profileRadius,
} from '../lib/parts.js';
import { bakeClip, mirrorPose, blendPoses, groundClip } from '../lib/clips.js';

// "Brute" — crimson-tunic barbarian with a horned fur hat and a huge
// two-handed maul carried on the right shoulder.
// Rotation conventions (character faces +Z):
//   negative rx swings a hanging limb FORWARD, positive backward.
//   positive ry turns the LEFT side (+X) forward.
export function build() {
  const P = {
    hipHeight: 0.52, spineLen: 0.10, chestLen: 0.20, neckLen: 0.14, headLen: 0.05,
    shoulderX: 0.24, shoulderY: 0.10,
    upperArmLen: 0.19, forearmLen: 0.17,
    hipX: 0.12, thighLen: 0.22, shinLen: 0.21,
  };
  const { root, joints } = buildSkeleton(P);
  // Rest tweaks (before any bake): flare arms clear of the belly; bend the
  // right forearm so the maul rides at the shoulder.
  joints.upperArmL.rotation.z = THREE.MathUtils.degToRad(12);
  joints.upperArmR.rotation.z = THREE.MathUtils.degToRad(-12);
  joints.forearmR.rotation.x = THREE.MathUtils.degToRad(-22);

  // Materials — vertexColors ones ALWAYS get a painted gradient via G().
  const skin = toonMaterial('#e8a06c', { vertexColors: true });
  const tunic = toonMaterial('#b03a2e', { vertexColors: true });   // ID crimson
  const tunicDark = toonMaterial('#8e2b22', { vertexColors: true });
  const pants = toonMaterial('#463d55', { vertexColors: true });
  const leather = toonMaterial('#5d3d2a', { vertexColors: true });     // belt: warm mid brown
  const bootLeather = toonMaterial('#462d1c', { vertexColors: true }); // boots/bracers: ~20% darker than belt
  const strap = toonMaterial('#332014', { vertexColors: true });       // baldric: near-black, darkest step
  const fur = toonMaterial('#6b5340', { vertexColors: true });
  const hatFur = toonMaterial('#3a3532', { vertexColors: true });  // helmet fur: cool charcoal
  const padFur = toonMaterial('#d9c9a8', { vertexColors: true });  // cream shoulder fur — separates from skin/leather
  const hairM = toonMaterial('#472715', { vertexColors: true });   // beard: dark red-brown step
  const wood = toonMaterial('#573a20', { vertexColors: true });    // haft: darkened so it splits from skin
  const stone = toonMaterial('#7a8391', { vertexColors: true, rim: 0.45 });
  const cream = toonMaterial('#e8dcc5', { vertexColors: true });
  const gold = toonMaterial('#d8a53a', { rim: 0.55 });
  const dark = toonMaterial('#2a2622', { rim: 0 });

  // Fake baked lighting: darker toward the ground, lighter on crowns.
  const G = (mesh, lo = '#7e7386', hi = '#ffffff') => {
    paintGradient(mesh.geometry, lo, hi);
    return mesh;
  };

  // --- Torso: faceted pear, layered skirt, wrapping belt ------------------
  const torso = G(latheBody(
    [[0.0, -0.14], [0.25, -0.12], [0.29, 0.04], [0.29, 0.2], [0.26, 0.34], [0.0, 0.42]],
    tunic, { facet: true }
  ));
  joints.hips.add(torso);

  // Front tabard panel: a flat, slightly darker plane over the belly so the
  // tunic front reads as 2-3 planes instead of a smooth balloon; the cream
  // strip at its top edge is the chest hem-break line.
  // Chest pouch: dark leather so it separates in value from the red cuirass,
  // seated into the torso surface (front z ~0.255 at this height).
  const tabard = G(chunkyBox(0.26, 0.24, 0.05, leather, { radius: 0.25 }));
  tabard.position.set(0, 0.02, 0.235);
  tabard.rotation.x = 0.14;   // tuck the bottom against the belly; top edge steps out
  joints.hips.add(tabard);
  const chestHem = G(chunkyBox(0.27, 0.03, 0.078, cream, { radius: 0.3 }), '#8f8578', '#d8cdb8');
  chestHem.position.set(0, 0.145, 0.255);
  joints.hips.add(chestHem);

  // Skirt raised above the knees; cream trim is a band that WRAPS the hem
  // (radius strictly larger than the skirt at the same heights — no gap).
  const skirt = G(latheBody(
    [[0.235, -0.06], [0.28, -0.15], [0.295, -0.22]],
    tunicDark, { facet: true }
  ));
  joints.hips.add(skirt);
  const trim = G(latheBody(
    [[0.298, -0.235], [0.315, -0.20], [0.30, -0.165]],
    cream, { facet: true }
  ), '#8f8578', '#d8cdb8');
  joints.hips.add(trim);

  const belt = G(latheBody(
    [[0.262, -0.155], [0.285, -0.11], [0.262, -0.065]],
    leather, { facet: true }
  ));
  joints.hips.add(belt);
  const buckle = chunkyBox(0.11, 0.08, 0.035, gold, { radius: 0.35 });
  buckle.position.set(0, -0.11, 0.245);
  joints.hips.add(buckle);
  for (const a of [-0.9, 0.9, Math.PI]) {
    const stud = facetBall(0.028, gold, [1, 1, 1], [6, 4]);
    stud.position.set(Math.sin(a) * 0.27, -0.11, Math.cos(a) * 0.24);
    joints.hips.add(stud);
  }

  // Baldric: conformal strap hugging the torso lathe — right shoulder, down
  // across the chest to the left hip (front run), and back up around the
  // rear (back run). Segments follow the pear profile, so no gaps/shelves.
  const torsoR = profileRadius([[0.25, -0.12], [0.29, 0.04], [0.29, 0.2], [0.26, 0.34]]);
  const baldricFront = conformalStrap({
    radiusAt: torsoR, material: strap,
    from: { theta: -0.55, y: 0.31 }, to: { theta: 1.35, y: -0.1 },
    width: 0.06, thick: 0.02, segments: 12, offset: 0.012,
  });
  joints.hips.add(baldricFront);
  const baldricBack = conformalStrap({
    radiusAt: torsoR, material: strap,
    from: { theta: 1.35, y: -0.1 }, to: { theta: 2 * Math.PI - 0.55, y: 0.31 },
    width: 0.06, thick: 0.02, segments: 14, offset: 0.012,
  });
  joints.hips.add(baldricBack);
  const baldricStud = facetBall(0.032, gold, [1, 1, 1], [6, 4]);
  baldricStud.position.set(0.09, 0.1, 0.27);
  joints.hips.add(baldricStud);

  // Fur collar — ring of tufts at the neckline.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.26;
    const tuft = G(facetBall(0.085, fur, [1.15, 0.8, 1.0], [7, 5]));
    tuft.position.set(Math.sin(a) * 0.17, 0.155, Math.cos(a) * 0.145);
    tuft.rotation.y = a;
    joints.chest.add(tuft);
  }

  // --- Head, face, horned fur hat -----------------------------------------
  const head = G(ball(0.21, skin, [1, 1.03, 0.95]));
  head.position.y = 0.14;
  joints.head.add(head);
  const nose = G(ball(0.047, skin, [1, 1, 1.35]));
  nose.position.set(0, 0.10, 0.20);
  joints.head.add(nose);
  for (const s of [-1, 1]) {
    const eye = ball(0.034, dark);
    eye.position.set(s * 0.075, 0.155, 0.185);
    joints.head.add(eye);
    const brow = G(chunkyBox(0.095, 0.032, 0.032, hairM, { radius: 0.4 }));
    brow.position.set(s * 0.082, 0.215, 0.19);
    brow.rotation.z = s * -0.22;
    joints.head.add(brow);
    const ear = G(ball(0.045, skin, [0.7, 1, 0.8]));
    ear.position.set(s * 0.205, 0.11, 0.01);
    joints.head.add(ear);
  }
  const beard = G(facetBall(0.16, hairM, [1.18, 0.84, 0.85], [8, 6]));
  beard.position.set(0, 0.0, 0.125);
  joints.head.add(beard);

  // Hat: fur brim + dome + white horns — the signature silhouette.
  const brim = G(facetBall(0.215, hatFur, [1.14, 0.5, 1.08], [9, 6]));
  brim.position.set(0, 0.235, 0);
  joints.head.add(brim);
  const dome = G(facetBall(0.195, hatFur, [1.02, 0.82, 0.98], [8, 6]));
  dome.position.set(0, 0.30, -0.01);
  joints.head.add(dome);
  for (const s of [-1, 1]) {
    // Longer horns swept outward AND back so the 90/270 profile keeps a
    // signature read instead of collapsing to a capsule.
    const horn = G(facet(new THREE.ConeGeometry(0.055, 0.31, 6), cream));
    horn.position.set(s * 0.26, 0.33, -0.02);
    // XYZ euler: z flare is applied first, so the backward sweep must be a
    // per-side y rotation (an x-rotation cannot move a +-x-pointing tip).
    horn.rotation.set(-0.15, s * 0.55, s * -1.18);
    joints.head.add(horn);
  }

  // Fur mantle tail down the back — a second silhouette break in profile.
  const tail1 = G(facetBall(0.105, fur, [1.0, 1.5, 0.7], [7, 5]));
  tail1.position.set(0, 0.0, -0.24);
  joints.chest.add(tail1);
  const tail2 = G(facetBall(0.082, fur, [0.9, 1.5, 0.65], [7, 5]));
  tail2.position.set(0.025, -0.17, -0.245);
  joints.chest.add(tail2);

  // --- Arms & legs ---------------------------------------------------------
  for (const s of ['L', 'R']) {
    const side = s === 'L' ? 1 : -1;
    // Light tan pauldron hugging the shoulder, with a crimson trim band so
    // it separates from beard/boots at 90/270.
    const pauldron = G(facetBall(0.125, padFur, [1.25, 0.78, 1.05], [8, 5]));
    pauldron.position.set(side * -0.005, 0.045, 0);
    joints[`upperArm${s}`].add(pauldron);
    const padBandGeo = new THREE.TorusGeometry(0.112, 0.024, 5, 14);
    padBandGeo.rotateX(Math.PI / 2);
    padBandGeo.scale(1.18, 1.0, 0.95);
    const padBand = G(facet(padBandGeo, tunicDark));
    padBand.position.set(side * -0.005, -0.022, 0);
    joints[`upperArm${s}`].add(padBand);
    // Crimson short sleeve over the top of the arm.
    const sleeve = G(limbMesh(0.088, 0.09, tunic, { taper: 1.02, facet: true }));
    sleeve.position.y = 0.01;
    joints[`upperArm${s}`].add(sleeve);
    const upper = G(limbMesh(0.075, P.upperArmLen, skin, { taper: 0.92, facet: true }));
    joints[`upperArm${s}`].add(upper);
    const fore = G(limbMesh(0.068, P.forearmLen, skin, { taper: 1.12, facet: true }));
    joints[`forearm${s}`].add(fore);
    // Dark leather bracer + two near-black wrap bands so the forearm stops
    // reading as a smooth bare-skin tube.
    const bracer = G(limbMesh(0.086, 0.11, bootLeather, { taper: 1.1, facet: true }));
    bracer.position.y = -0.05;
    joints[`forearm${s}`].add(bracer);
    for (const dy of [-0.02, -0.085]) {
      const wrapGeo = new THREE.TorusGeometry(0.088, 0.015, 5, 12);
      wrapGeo.rotateX(Math.PI / 2);
      const wrap = G(facet(wrapGeo, strap));
      wrap.position.y = dy;
      joints[`forearm${s}`].add(wrap);
    }
    const hand = G(facetBall(0.105, skin, [1, 0.92, 1.1], [8, 6]));
    hand.position.y = -0.03;
    joints[`hand${s}`].add(hand);
    // Legs.
    const thigh = G(limbMesh(0.095, P.thighLen, pants, { taper: 0.95, facet: true }));
    joints[`thigh${s}`].add(thigh);
    const shin = G(limbMesh(0.085, P.shinLen - 0.06, pants, { taper: 1.05, facet: true }));
    joints[`shin${s}`].add(shin);
    const boot = G(chunkyBox(0.16, 0.11, 0.25, bootLeather, { radius: 0.35 }));
    boot.position.set(0, -0.01, 0.045);
    joints[`foot${s}`].add(boot);
    const cuff = G(facetBall(0.098, padFur, [1.12, 0.55, 1.1], [7, 5]));
    cuff.position.set(0, 0.045, 0.0);
    joints[`foot${s}`].add(cuff);
  }

  // --- Maul: huge two-handed hammer riding the right shoulder --------------
  const maul = new THREE.Group();
  maul.position.set(-0.05, -0.03, 0.02);
  maul.rotation.set(-0.60, 0, 0.62);   // carry angle out + back: head clears the pauldron
  joints.handR.add(maul);
  const handle = G(limbMesh(0.032, 0.66, wood, { taper: 1, facet: true }));
  handle.position.y = 0.44;
  maul.add(handle);
  // Faceted head: 8-sided prism, flat-shaded — hard bevel-band value planes
  // instead of a smooth steel gradient, matching the kit's faceting language.
  const headGeo = new THREE.CylinderGeometry(0.098, 0.098, 0.36, 8, 1);
  headGeo.rotateX(Math.PI / 2);          // axis along z
  headGeo.rotateZ(Math.PI / 8);          // flat plane faces up
  const headBlock = G(facet(headGeo, stone), '#4d545e', '#c3ccd6');
  headBlock.position.y = 0.58;
  headBlock.name = 'maulHead';
  maul.add(headBlock);
  for (const z of [-0.155, 0.155]) {
    const band = chunkyBox(0.19, 0.185, 0.045, gold, { radius: 0.3 });
    band.position.set(0, 0.58, z);
    maul.add(band);
  }
  const grip = G(chunkyBox(0.075, 0.035, 0.075, gold, { radius: 0.3 }));
  grip.position.y = 0.20;
  maul.add(grip);
  const pommel = facetBall(0.05, gold, [1, 1, 1], [7, 5]);
  pommel.position.y = -0.215;
  maul.add(pommel);

  // --- Clips ---------------------------------------------------------------
  const still = {};

  // Idle: asymmetric breathe + weight shift + head look — no twinning.
  // Idle bob comes from knee flex (flat soles: foot rx = -(thigh+shin)) so
  // the boots never sink; groundClip keeps the soles kissing the floor.
  const idleA = {
    hips: { pos: [0, -0.006, 0], rot: [2, -3, 1] },
    chest: { rot: [3, 2, -1] },
    head: { rot: [-2, 4, 1] },
    thighL: { rot: [-2, 0, 0] }, shinL: { rot: [3, 0, 0] }, footL: { rot: [-1, 0, 0] },
    thighR: { rot: [-1.5, 0, 0] }, shinR: { rot: [2.5, 0, 0] }, footR: { rot: [-1, 0, 0] },
    upperArmL: { rot: [3, 0, 7] }, forearmL: { rot: [-6, 0, 0] },
    upperArmR: { rot: [2, 0, -5] }, forearmR: { rot: [-8, 0, 0] }, handR: { rot: [2, 0, 0] },
  };
  const idleB = {
    hips: { pos: [0, -0.015, 0], rot: [3, -1, -1.5] },
    chest: { rot: [5, -2, 1] },
    head: { rot: [-4, -3, -1] },
    thighL: { rot: [-4, 0, 0] }, shinL: { rot: [6, 0, 0] }, footL: { rot: [-2, 0, 0] },
    thighR: { rot: [-3.5, 0, 0] }, shinR: { rot: [5.5, 0, 0] }, footR: { rot: [-2, 0, 0] },
    upperArmL: { rot: [6, 0, 9] }, forearmL: { rot: [-9, 0, 0] },
    upperArmR: { rot: [4, 0, -7] }, forearmR: { rot: [-11, 0, 0] }, handR: { rot: [4, 0, 0] },
  };
  const idleC = {
    hips: { pos: [0, -0.010, 0], rot: [2.5, 2, 0] },
    chest: { rot: [4, -3, 0] },
    head: { rot: [-3, -7, 0] },
    thighL: { rot: [-3, 0, 0] }, shinL: { rot: [4.5, 0, 0] }, footL: { rot: [-1.5, 0, 0] },
    thighR: { rot: [-2.5, 0, 0] }, shinR: { rot: [4, 0, 0] }, footR: { rot: [-1.5, 0, 0] },
    upperArmL: { rot: [4, 0, 8] }, forearmL: { rot: [-8, 0, 0] },
    upperArmR: { rot: [3, 0, -6] }, forearmR: { rot: [-10, 0, 0] }, handR: { rot: [3, 0, 0] },
  };
  const idle = groundClip(root, bakeClip(root, 'idle', [
    { t: 0.0, pose: idleA },
    { t: 0.8, pose: idleB },
    { t: 1.7, pose: idleC },
    { t: 2.6, pose: idleA },
  ]));

  // Walk: four positions per half-stride. Left arm swings free; right arm
  // carries the maul with damped swing (patched onto every key after mirror).
  const T = 0.8;
  const carryR = (u, f, h) => ({
    upperArmR: { rot: [u, 0, -8] },
    forearmR: { rot: [f, 0, 0] },
    handR: { rot: [h, 0, 0] },
  });
  // Base poses hold: left arm (first half) and a phantom right arm whose
  // mirror becomes the free LEFT arm in the second half.
  // Stance rule: planted-leg thigh+shin+foot rx sums to ~0 so the SOLE is
  // flat — groundClip pins the lowest vertex, and a tilted sole reads as a
  // hovering foot. Contact knee is pre-bent so the pelvis geometrically
  // drops on contact (groundClip overwrites authored hips-y).
  // Contact: front sole lands nearly FLAT (sum -28+14+6 = -8, a whisper of
  // heel lead) and the rear push-off toe is pulled up (sum 50, was 70) so
  // groundClip pins the front sole — not a dangling rear toe that used to
  // hover the planted foot (walk16s frame 8). Hips/chest counter-rotate 16°.
  const contactL = {
    hips: { pos: [0, -0.012, 0], rot: [4, 16, -1] },
    chest: { rot: [3, -17, 1] },
    head: { rot: [-3, 4, 0] },
    // Contact knee pre-bent harder (sum still ~0) so the captured contact
    // frame sits visibly LOWER than passing — the bob must show at the
    // strip's own sample points, not between them.
    thighL: { rot: [-26, 0, 0] }, shinL: { rot: [24, 0, 0] }, footL: { rot: [2, 0, 0] },
    thighR: { rot: [20, 0, 0] }, shinR: { rot: [30, 0, 0] }, footR: { rot: [-22, 0, 0] },
    upperArmL: { rot: [24, 0, 9] }, forearmL: { rot: [-8, 0, 0] },
    upperArmR: { rot: [-22, 0, -9] }, forearmR: { rot: [-18, 0, 0] },
  };
  // Down: support knee bends HARD (shin +50) so leg extension truly shortens
  // — groundClip then yields a real crown dip. Sole flat: -16 + 50 - 34 = 0.
  // Pelvis rolls toward the swing leg (+rz drops the free right hip); chest
  // and head counter the roll.
  // Swing foot: knee folded hard AND toe pulled up (sum 42, was 66) so the
  // boot toe never dips below the planted sole — that dip was what erased
  // the crown bob (groundClip seated the toe, not the compressed leg).
  const downL = {
    hips: { pos: [0, -0.05, 0], rot: [7, 12, 5] },
    chest: { rot: [6, -14, -3] },
    head: { rot: [-5, 2, -1] },
    thighL: { rot: [-18, 0, 0] }, shinL: { rot: [64, 0, 0] }, footL: { rot: [-46, 0, 0] },
    thighR: { rot: [26, 0, 0] }, shinR: { rot: [60, 0, 0] }, footR: { rot: [-38, 0, 0] },
    upperArmL: { rot: [18, 0, 9] }, forearmL: { rot: [-8, 0, 0] },
    upperArmR: { rot: [-16, 0, -9] }, forearmR: { rot: [-16, 0, 0] },
  };
  // Hold the dip 2-3 frames before rising into the pass. Sole flat: -12+32-20=0.
  const downHoldL = {
    hips: { pos: [0, -0.038, 0], rot: [5, 8, 4] },
    chest: { rot: [4, -11, -2] },
    head: { rot: [-4, 2, -1] },
    thighL: { rot: [-12, 0, 0] }, shinL: { rot: [40, 0, 0] }, footL: { rot: [-28, 0, 0] },
    thighR: { rot: [14, 0, 0] }, shinR: { rot: [58, 0, 0] }, footR: { rot: [-30, 0, 0] },
    upperArmL: { rot: [12, 0, 8] }, forearmL: { rot: [-9, 0, 0] },
    upperArmR: { rot: [-10, 0, -8] }, forearmR: { rot: [-14, 0, 0] },
  };
  // Passing: support leg near-straight (shin 5) — the crown's high point.
  const passL = {
    hips: { pos: [0, 0.004, 0], rot: [3, 0, 2] },
    chest: { rot: [4, 1, -1] },
    head: { rot: [-3, 0, -1] },
    thighL: { rot: [-3, 0, 0] }, shinL: { rot: [3, 0, 0] }, footL: { rot: [0, 0, 0] },
    thighR: { rot: [-2, 0, 0] }, shinR: { rot: [72, 0, 0] }, footR: { rot: [-26, 0, 0] },
    upperArmL: { rot: [4, 0, 6] }, forearmL: { rot: [-10, 0, 0] },
    upperArmR: { rot: [-2, 0, -6] }, forearmR: { rot: [-12, 0, 0] },
  };
  // Swing-clearance breakdown between pass and up: the free knee stays
  // folded while the thigh swings forward, so the big boot clears the floor.
  const swingMidL = {
    hips: { pos: [0, 0.014, 0], rot: [3, -5, 0] },
    chest: { rot: [4, 6, 0] },
    head: { rot: [-3, 0, 0] },
    thighL: { rot: [2, 0, 0] }, shinL: { rot: [4, 0, 0] }, footL: { rot: [-6, 0, 0] },
    thighR: { rot: [-14, 0, 0] }, shinR: { rot: [56, 0, 0] }, footR: { rot: [-30, 0, 0] },
    upperArmL: { rot: [-4, 0, 6] }, forearmL: { rot: [-12, 0, 0] },
    upperArmR: { rot: [4, 0, -6] }, forearmR: { rot: [-10, 0, 0] },
  };
  // Up: support stays long (sole flat: 8 + 4 - 12 = 0); swing heel drops
  // toward its strike.
  const upL = {
    hips: { pos: [0, 0.024, 0], rot: [3, -10, -1] },
    chest: { rot: [4, 11, 1] },
    head: { rot: [-3, -1, 0] },
    thighL: { rot: [8, 0, 0] }, shinL: { rot: [4, 0, 0] }, footL: { rot: [-12, 0, 0] },
    thighR: { rot: [-24, 0, 0] }, shinR: { rot: [34, 0, 0] }, footR: { rot: [-16, 0, 0] },
    upperArmL: { rot: [-12, 0, 6] }, forearmL: { rot: [-14, 0, 0] },
    upperArmR: { rot: [10, 0, -6] }, forearmR: { rot: [-8, 0, 0] },
  };
  // Double support (strip frame 7/15): rear sole nearly flat (14 + 6 - 14 = 6),
  // front heel a hair off the ground about to strike.
  const liftL = {
    hips: { pos: [0, 0.006, 0], rot: [4, -14, -2] },
    chest: { rot: [4, 15, 1] },
    head: { rot: [-3, 1, 0] },
    thighL: { rot: [14, 0, 0] }, shinL: { rot: [6, 0, 0] }, footL: { rot: [-20, 0, 0] },
    thighR: { rot: [-28, 0, 0] }, shinR: { rot: [22, 0, 0] }, footR: { rot: [-14, 0, 0] },
    upperArmL: { rot: [-18, 0, 6] }, forearmL: { rot: [-16, 0, 0] },
    upperArmR: { rot: [16, 0, -6] }, forearmR: { rot: [-8, 0, 0] },
  };
  const K = (base, r) => blendPoses(base, r);
  const walk = groundClip(root, bakeClip(root, 'walk', [
    { t: 0, pose: K(contactL, carryR(-9, -14, 2)) },
    { t: T * 0.1, pose: K(downL, carryR(-7, -13, 2)) },
    { t: T * 0.175, pose: K(downHoldL, carryR(-4, -13, 2)) },
    { t: T * 0.25, pose: K(passL, carryR(-1, -12, 1)) },
    { t: T * 0.3125, pose: K(swingMidL, carryR(2, -12, 1)) },
    { t: T * 0.375, pose: K(upL, carryR(6, -11, 0)) },
    { t: T * 0.4375, pose: K(liftL, carryR(9, -11, -1)) },
    { t: T * 0.5, pose: K(mirrorPose(contactL), carryR(11, -11, -1)) },
    { t: T * 0.6, pose: K(mirrorPose(downL), carryR(9, -11, 0)) },
    { t: T * 0.675, pose: K(mirrorPose(downHoldL), carryR(6, -12, 1)) },
    { t: T * 0.75, pose: K(mirrorPose(passL), carryR(2, -12, 1)) },
    { t: T * 0.8125, pose: K(mirrorPose(swingMidL), carryR(-1, -12, 1)) },
    { t: T * 0.875, pose: K(mirrorPose(upL), carryR(-5, -13, 2)) },
    { t: T * 0.9375, pose: K(mirrorPose(liftL), carryR(-7, -14, 2)) },
    { t: T, pose: K(contactL, carryR(-9, -14, 2)) },
  ]));

  // Attack: two-handed overhead maul smash. Long twisting wind-up, snap
  // strike with squash, then follow-through settle before recovery.
  // Mid-windup: arms come up BENT (elbows lead), so strip frames 3-5 don't
  // interpolate through a stiff straight-forward reach.
  const liftStart = {
    hips: { pos: [0, -0.008, 0], rot: [-1, -2, 0] },
    chest: { rot: [-3, -3, 0] },
    upperArmR: { rot: [-10, -8, -10] }, forearmR: { rot: [-20, 0, 0] }, handR: { rot: [30, 0, 0] },
    upperArmL: { rot: [-18, 4, 10] }, forearmL: { rot: [-30, 0, 0] }, handL: { rot: [-8, 0, 0] },
  };
  const liftBlend = {
    hips: { pos: [0, -0.009, 0], rot: [-1, -2, 0] },
    chest: { rot: [-4, -4, 0] },
    upperArmR: { rot: [-15, -7, -14] }, forearmR: { rot: [-32, 0, 0] }, handR: { rot: [28, 0, 0] },
    upperArmL: { rot: [-25, 5, 13] }, forearmL: { rot: [-42, 0, 0] }, handL: { rot: [-11, 0, 0] },
  };
  const liftMid = {
    hips: { pos: [0, -0.01, 0], rot: [-2, -3, 0] },
    chest: { rot: [-5, -5, 0] },
    upperArmR: { rot: [-40, -7, -18] }, forearmR: { rot: [-85, 0, 0] }, handR: { rot: [-60, 0, 0] },
    upperArmL: { rot: [-32, 6, 16] }, forearmL: { rot: [-55, 0, 0] }, handL: { rot: [-14, 0, 0] },
  };
  const windupMid = {
    hips: { pos: [0, -0.015, 0], rot: [-3, -5, 0] },
    chest: { rot: [-8, -7, 0] },
    head: { rot: [4, 5, 0] },
    upperArmR: { rot: [-70, -8, -26] }, forearmR: { rot: [-75, 0, 0] }, handR: { rot: [-65, 0, 0] },
    upperArmL: { rot: [-58, 9, 22] }, forearmL: { rot: [-88, 0, 0] }, handL: { rot: [6, 0, 0] },
    thighL: { rot: [-4, 0, 0] }, thighR: { rot: [5, 0, 0] }, shinR: { rot: [7, 0, 0] },
  };
  const windup = {
    hips: { pos: [0, -0.02, 0], rot: [-6, -10, 0] },
    chest: { rot: [-16, -14, 0] },
    head: { rot: [8, 10, 0] },
    upperArmR: { rot: [-145, 60, 20] }, forearmR: { rot: [-55, 0, 0] }, handR: { rot: [-70, 0, 0] },
    upperArmL: { rot: [-115, -30, 45] }, forearmL: { rot: [-95, 0, 0] }, handL: { rot: [-20, 0, 0] },
    thighL: { rot: [-8, 0, 0] }, thighR: { rot: [10, 0, 0] }, shinR: { rot: [12, 0, 0] },
  };
  // Breakdown 1: maul directly OVERHEAD — the strike reads as
  // behind-shoulder -> overhead -> hit across three captured frames.
  const overhead = {
    hips: { pos: [0, -0.025, 0], rot: [-1, -6, 0] },
    chest: { rot: [-4, -8, 0] },
    head: { rot: [3, 6, 0] },
    upperArmR: { rot: [-160, -60, 20] }, forearmR: { rot: [-35, 0, 0] }, handR: { rot: [-40, 0, 0] },
    upperArmL: { rot: [-70, -10, 30] }, forearmL: { rot: [-60, 0, 0] }, handL: { rot: [-10, 0, 0] },
    thighL: { rot: [-9, 0, 0] }, thighR: { rot: [10, 0, 0] }, shinR: { rot: [12, 0, 0] },
  };
  // Breakdown 2: the maul sweeping past the head mid-strike, so the hammer
  // traces an arc instead of teleporting overhead -> hip in one frame.
  const swing = {
    hips: { pos: [0, -0.05, 0], rot: [5, -2, 0] },
    chest: { rot: [8, -3, 0] },
    head: { rot: [-4, 2, 0] },
    upperArmR: { rot: [-145, -60, 20] }, forearmR: { rot: [-25, 0, 0] }, handR: { rot: [-10, 0, 0] },
    upperArmL: { rot: [-30, 0, 25] }, forearmL: { rot: [-35, 0, 0] }, handL: { rot: [-8, 0, 0] },
    thighL: { rot: [-20, 0, 0] }, shinL: { rot: [26, 0, 0] }, footL: { rot: [-8, 0, 0] },
    thighR: { rot: [15, 0, 0] }, shinR: { rot: [18, 0, 0] }, footR: { rot: [16, 0, 0] },
  };
  // Smear between swing and smash (strip frames 5-7): body stretches along
  // the strike, softening the pop into the hit.
  const smear = {
    hips: { pos: [0, -0.075, 0], rot: [11, 3, 0], scale: [0.97, 1.07, 0.97] },
    chest: { rot: [20, 4, 0] },
    head: { rot: [-8, -1, 0] },
    upperArmR: { rot: [-130, -60, 20] }, forearmR: { rot: [-22, 0, 0] }, handR: { rot: [-25, 0, 0] },
    upperArmL: { rot: [-10, 0, 22] }, forearmL: { rot: [-25, 0, 0] }, handL: { rot: [-8, 0, 0] },
    thighL: { rot: [-28, 0, 0] }, shinL: { rot: [38, 0, 0] }, footL: { rot: [-10, 0, 0] },
    thighR: { rot: [18, 0, 0] }, shinR: { rot: [22, 0, 0] }, footR: { rot: [20, 0, 0] },
  };
  const smash = {
    hips: { pos: [0, -0.10, 0], rot: [16, 3, 0], scale: [1.04, 0.93, 1.04] },
    chest: { rot: [30, 4, 0] },
    head: { rot: [-12, -4, 0] },
    upperArmR: { rot: [-100, -60, 20] }, forearmR: { rot: [-20, 0, 0] }, handR: { rot: [-55, 0, 0] },
    upperArmL: { rot: [5, 0, 20] }, forearmL: { rot: [-20, 0, 0] }, handL: { rot: [-8, 0, 0] },
    thighL: { rot: [-35, 0, 0] }, shinL: { rot: [50, 0, 0] }, footL: { rot: [-12, 0, 0] },
    thighR: { rot: [22, 0, 0] }, shinR: { rot: [28, 0, 0] }, footR: { rot: [24, 0, 0] },
  };
  // Impact overshoot: one key PAST the hit line, then settle back up.
  const overshoot = {
    hips: { pos: [0, -0.112, 0], rot: [17, 3, 0], scale: [1.02, 0.96, 1.02] },
    chest: { rot: [33, 4, 0] },
    head: { rot: [-13, -4, 0] },
    upperArmR: { rot: [-104, -60, 20] }, forearmR: { rot: [-19, 0, 0] }, handR: { rot: [-58, 0, 0] },
    upperArmL: { rot: [8, 0, 20] }, forearmL: { rot: [-18, 0, 0] }, handL: { rot: [-8, 0, 0] },
    thighL: { rot: [-36, 0, 0] }, shinL: { rot: [52, 0, 0] }, footL: { rot: [-13, 0, 0] },
    thighR: { rot: [23, 0, 0] }, shinR: { rot: [29, 0, 0] }, footR: { rot: [25, 0, 0] },
  };
  const settle = {
    hips: { pos: [0, -0.085, 0], rot: [13, 6, 0] },
    chest: { rot: [24, 8, 0] },
    head: { rot: [-6, -2, 0] },
    upperArmR: { rot: [-96, -55, 18] }, forearmR: { rot: [-24, 0, 0] }, handR: { rot: [-40, 0, 0] },
    upperArmL: { rot: [2, 0, 20] }, forearmL: { rot: [-24, 0, 0] }, handL: { rot: [-8, 0, 0] },
    thighL: { rot: [-32, 0, 0] }, shinL: { rot: [46, 0, 0] }, footL: { rot: [-10, 0, 0] },
    thighR: { rot: [20, 0, 0] }, shinR: { rot: [26, 0, 0] }, footR: { rot: [22, 0, 0] },
  };
  // Hoist: the maul flips head-up beside the shoulder on the way back to carry.
  const hoist = {
    hips: { pos: [0, -0.02, 0], rot: [3, 2, 0] },
    chest: { rot: [5, 2, 0] },
    head: { rot: [-1, 0, 0] },
    upperArmR: { rot: [-6, -12, 0] }, forearmR: { rot: [-16, 0, 0] }, handR: { rot: [8, 0, 0] },
    upperArmL: { rot: [-6, 0, 14] }, forearmL: { rot: [-16, 0, 0] }, handL: { rot: [-6, 0, 0] },
    thighL: { rot: [-8, 0, 0] }, shinL: { rot: [12, 0, 0] }, footL: { rot: [-2, 0, 0] },
    thighR: { rot: [6, 0, 0] }, shinR: { rot: [8, 0, 0] }, footR: { rot: [4, 0, 0] },
  };
  const recover = {
    hips: { pos: [0, -0.04, 0], rot: [6, 3, 0] },
    chest: { rot: [10, 4, 0] },
    head: { rot: [-2, -1, 0] },
    upperArmR: { rot: [-10, -15, 0] }, forearmR: { rot: [-10, 0, 0] }, handR: { rot: [20, 0, 0] },
    upperArmL: { rot: [-12, 0, 12] }, forearmL: { rot: [-22, 0, 0] }, handL: { rot: [-8, 0, 0] },
    thighL: { rot: [-14, 0, 0] }, shinL: { rot: [20, 0, 0] }, footL: { rot: [-4, 0, 0] },
    thighR: { rot: [10, 0, 0] }, shinR: { rot: [12, 0, 0] }, footR: { rot: [10, 0, 0] },
  };
  const attack = groundClip(root, bakeClip(root, 'attack', [
    { t: 0, pose: still, ease: 'inOut' },
    // Wrist pre-cocks before the arm rises, so the head never dips inverted.
    { t: 0.08, pose: liftStart, ease: 'inOut' },
    // Pin at t=0.10 (GIF f2): quaternion blends between the neighboring keys
    // pass through inverted without this key — solved, haftY=0.32.
    { t: 0.10, pose: liftBlend, ease: 'inOut' },
    // Mid-raise the haft sweeps through horizontal (never inverted).
    { t: 0.12, pose: liftMid, ease: 'inOut' },
    { t: 0.16, pose: windupMid, ease: 'inOut' },
    { t: 0.30, pose: windup, ease: 'in' },
    // Strike stretched to ~0.16s so it spans 2-3 captured frames of a
    // 16-frame strip (samples every ~0.066s) — breakdowns must land ON
    // sample points or the hammer still teleports in the evidence.
    { t: 0.33, pose: windup, ease: 'in' },        // apex holds through f5
    { t: 0.394, pose: overhead, ease: 'linear' },  // f6: over the crown
    { t: 0.459, pose: swing, ease: 'linear' },     // f7: mid-arc front
    { t: 0.49, pose: smear, ease: 'out' },
    { t: 0.525, pose: smash, ease: 'out' },        // f8: impact
    { t: 0.59, pose: overshoot, ease: 'inOut' },
    { t: 0.64, pose: settle, ease: 'inOut' },
    { t: 0.74, pose: recover, ease: 'inOut' },   // arm home fast -> head up by f15
    { t: 0.84, pose: hoist, ease: 'out' },
    { t: 1.05, pose: still },
  ]));

  return { root, clips: [idle, walk, attack], meta: { height: 1.35, name: 'Brute' } };
}
