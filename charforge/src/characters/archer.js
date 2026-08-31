import * as THREE from 'three';
import { buildSkeleton } from '../lib/rig.js';
import {
  toonMaterial, latheBody, limbMesh, blob, ball, chunkyBox, facetBall, facet,
  paintGradient,
} from '../lib/parts.js';
import { bakeClip, mirrorPose, groundClip } from '../lib/clips.js';

// "Archer" — slim hooded ranged unit. Forest-green ID, oversized bow in the
// LEFT hand, leather quiver + bandolier, drooping hood tail as the signature.
// Conventions: faces +Z; negative rx swings a hanging limb forward;
// positive ry turns the character's left (+X) side forward.
export function build() {
  const P = {
    hipHeight: 0.54, spineLen: 0.10, chestLen: 0.18, neckLen: 0.13, headLen: 0.05,
    shoulderX: 0.17, shoulderY: 0.09,
    upperArmLen: 0.17, forearmLen: 0.15,
    hipX: 0.09, thighLen: 0.23, shinLen: 0.22,
  };
  const { root, joints } = buildSkeleton(P);
  const D = THREE.MathUtils.degToRad;
  // Slight rest flare so the hands clear the hips.
  joints.upperArmL.rotation.z = D(8);
  joints.upperArmR.rotation.z = D(-8);

  // Materials. Large masses use the shared vertex-color material and get a
  // painted vertical gradient (fake AO: dark at the ground, light on crowns).
  const vc = toonMaterial('#ffffff', { vertexColors: true });
  const grad = (mesh, bottom, top) => { paintGradient(mesh.geometry, bottom, top); return mesh; };
  const skin = toonMaterial('#e8b58a');
  const cloakDark = toonMaterial('#245c2d');
  const pantsDark = toonMaterial('#4c463a');  // one value step up: legs read vs floor shadow
  const leather = toonMaterial('#7a5231');        // straps, pads, grip
  const bootHide = toonMaterial('#9c6a3a');       // boots: lighter + warmer than straps
  const quiverHide = toonMaterial('#472f18');     // quiver: darkest brown, reads vs boots
  const leatherDark = toonMaterial('#54381f');
  const cream = toonMaterial('#e6d9b8', { rim: 0.4 });
  const brass = toonMaterial('#c99b3f', { rim: 0.5 });
  const wood = toonMaterial('#8f4a2c');           // bow: red-brown, separates from gear
  const stringMat = toonMaterial('#f2ead8', { rim: 0.5 });
  const fletch = toonMaterial('#c9503c', { rim: 0.45 });
  const dark = toonMaterial('#2a2622', { rim: 0 });
  const brow = toonMaterial('#3a2c1c', { rim: 0 });

  // --- Torso: faceted green tunic, layered skirt with cream hem trim -------
  // Tunic sits ~15% darker than the hood so the two greens separate at 0°.
  const tunic = grad(latheBody(
    [[0.0, -0.13], [0.19, -0.11], [0.205, 0.02], [0.19, 0.18], [0.16, 0.30], [0.0, 0.36]],
    vc, { facet: true }
  ), '#1a3f20', '#2e6337');
  joints.hips.add(tunic);

  const skirt = grad(latheBody(
    [[0.22, -0.20], [0.19, -0.15], [0.16, -0.095]],  // bottom->top = outward normals
    vc, { facet: true, scaleZ: 0.9 }
  ), '#173a1e', '#295a31');
  joints.hips.add(skirt);

  const trimGeo = new THREE.TorusGeometry(0.211, 0.018, 5, 18);
  trimGeo.rotateX(Math.PI / 2); trimGeo.scale(1, 1, 0.9);
  const hemTrim = facet(trimGeo, cream);
  hemTrim.position.y = -0.193;
  joints.hips.add(hemTrim);

  // Belt + brass buckle + side studs (proud of the tunic so they read).
  const belt = chunkyBox(0.38, 0.07, 0.345, leatherDark, { radius: 0.45 });
  belt.position.y = -0.1;
  joints.hips.add(belt);
  const buckle = chunkyBox(0.07, 0.065, 0.03, brass, { radius: 0.3 });
  buckle.position.set(0, -0.1, 0.178);
  joints.hips.add(buckle);
  for (const s of [-1, 1]) {
    const stud = facetBall(0.018, brass, [1, 1, 1], [5, 4]);
    stud.position.set(s * 0.14, -0.1, 0.155);
    joints.hips.add(stud);
  }

  // Cream cowl collar filling the neck gap under the hood.
  const collarGeo = new THREE.TorusGeometry(0.085, 0.036, 6, 12);
  collarGeo.rotateX(Math.PI / 2);
  const collar = facet(collarGeo, cream);
  collar.position.set(0, 0.11, 0.01);
  joints.chest.add(collar);

  // Leather bandolier wrapping the torso diagonally (quiver strap), with
  // brass studs so the strap reads as gear, not a stripe.
  const bandGeo = new THREE.TorusGeometry(0.195, 0.028, 5, 18);
  bandGeo.rotateX(Math.PI / 2); bandGeo.scale(1, 1, 0.88);
  const band = facet(bandGeo, leatherDark);
  band.position.set(0, 0.02, 0);
  band.rotation.z = D(-28);   // high over the right shoulder, down to left hip
  joints.chest.add(band);
  for (const [sx, sy, sz] of [[-0.075, 0.065, 0.155], [0, 0.015, 0.175], [0.075, -0.035, 0.16]]) {
    const stud = facetBall(0.017, brass, [1, 1, 1], [5, 4]);
    stud.position.set(sx, sy, sz);
    joints.chest.add(stud);
  }

  // Quiver: big tapered leather tube slung diagonally across the back —
  // this IS the back read (no cape slab behind it).
  const quiver = new THREE.Group();
  const tube = facet(new THREE.CylinderGeometry(0.075, 0.055, 0.44, 7), quiverHide);
  quiver.add(tube);
  const qrimGeo = new THREE.TorusGeometry(0.072, 0.02, 5, 10);
  qrimGeo.rotateX(Math.PI / 2);
  const qrim = facet(qrimGeo, leatherDark);
  qrim.position.y = 0.215;
  quiver.add(qrim);
  const qstrapGeo = new THREE.TorusGeometry(0.068, 0.014, 5, 10);
  qstrapGeo.rotateX(Math.PI / 2);
  const qstrap = facet(qstrapGeo, leatherDark);
  qstrap.position.y = -0.09;
  quiver.add(qstrap);
  for (const [dx, dz, h] of [[-0.032, 0.012, 0.20], [0.034, -0.018, 0.16], [0.0, 0.038, 0.24], [0.028, 0.03, 0.13]]) {
    const shaft = facet(new THREE.BoxGeometry(0.018, h, 0.018), wood);
    shaft.position.set(dx, 0.14 + h / 2, dz);
    quiver.add(shaft);
    const fl = facetBall(0.042, fletch, [1, 1.45, 1], [6, 5]);
    fl.position.set(dx, 0.14 + h, dz);
    quiver.add(fl);
  }
  quiver.rotation.x = D(-18);  // top leans back, rim clear of the hood shell
  quiver.rotation.z = D(36);   // top leans to the right shoulder, feathers outboard
  quiver.position.set(-0.045, -0.04, -0.215);
  joints.chest.add(quiver);

  // --- Head: tan face + brows inside a faceted forest-green hood -----------
  const face = ball(0.185, skin, [1, 1.02, 0.95]);
  face.position.y = 0.12;
  joints.head.add(face);
  const nose = ball(0.038, skin, [1, 1, 1.35]);
  nose.position.set(0, 0.07, 0.17);
  joints.head.add(nose);
  for (const s of [-1, 1]) {
    const eye = ball(0.03, dark);
    eye.position.set(s * 0.065, 0.12, 0.16);
    joints.head.add(eye);
    const b = chunkyBox(0.062, 0.02, 0.025, brow, { radius: 0.3 });
    b.position.set(s * 0.066, 0.168, 0.152);
    b.rotation.z = D(s * -8);    // inner ends dip: determined look
    joints.head.add(b);
  }
  // Hood: clearly brighter green than the tunic (value separation), faceted.
  const hood = grad(facetBall(0.225, vc, [1.02, 1.05, 1.02], [10, 6]), '#3d8f4a', '#63c06f');
  hood.position.set(0, 0.16, -0.07);
  joints.head.add(hood);
  // Hood rim: darker ring framing the face opening.
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.04, 8, 24), cloakDark);
  rim.position.set(0, 0.14, 0.1);
  rim.rotation.x = D(4);
  joints.head.add(rim);
  // Messy hair tufts spilling from under the hood rim — clustered detail at
  // the face, asymmetric on purpose.
  const hair = toonMaterial('#6b4526', { rim: 0.2 });
  for (const [hx, hy, hs, hr] of [[-0.075, 0.205, 1.0, 22], [-0.01, 0.218, 1.25, -8], [0.06, 0.208, 0.85, -26]]) {
    const tuft = facetBall(0.034, hair, [1.3 * hs, 0.55, 0.9], [6, 4]);
    tuft.position.set(hx, hy, 0.135);
    tuft.rotation.z = D(hr);
    tuft.rotation.x = D(-18);
    joints.head.add(tuft);
  }
  // SIGNATURE: long drooping hood tail, swinging via its own named group.
  const hoodTip = new THREE.Group();
  hoodTip.name = 'hoodTip';
  hoodTip.position.set(0, 0.30, -0.10);
  const t1 = grad(facetBall(0.105, vc, [0.85, 0.9, 1.5], [7, 5]), '#37823f', '#57b463');
  t1.position.set(0.005, -0.045, -0.09);
  t1.rotation.x = D(-32);
  hoodTip.add(t1);
  const t2 = grad(facetBall(0.062, vc, [0.7, 0.8, 1.5], [7, 5]), '#2f7038', '#4aa156');
  t2.position.set(0.045, -0.10, -0.22);
  t2.rotation.x = D(-55);
  t2.rotation.y = D(12);
  hoodTip.add(t2);
  const tassel = ball(0.045, cream);
  tassel.position.set(0.07, -0.17, -0.28);
  hoodTip.add(tassel);
  joints.head.add(hoodTip);

  // --- Limbs: faceted green sleeves, leather pads/bracers, layered boots ---
  for (const s of ['L', 'R']) {
    const upper = grad(limbMesh(0.058, P.upperArmLen, vc, { taper: 0.9, facet: true }),
      '#1c4423', '#2f653a');
    joints[`upperArm${s}`].add(upper);
    const pad = facetBall(0.068, leather, [1.05, 0.75, 1.05], [7, 5]);
    pad.position.set(s === 'L' ? -0.025 : 0.025, 0.045, 0);
    joints[`upperArm${s}`].add(pad);
    const fore = limbMesh(0.052, P.forearmLen + 0.03, skin, { taper: 1.05 });
    joints[`forearm${s}`].add(fore);
    // Tall bracer bridging the sleeve hem down PAST the wrist — no bare gap.
    const bracer = chunkyBox(0.095, 0.17, 0.095, leatherDark, { radius: 0.35 });
    bracer.position.y = -0.09;
    joints[`forearm${s}`].add(bracer);
    // Cuff ring parented to the HAND so it rides the wrist through any pose,
    // plugging the seam between bracer bottom and fist top.
    const cuffGeo = new THREE.TorusGeometry(0.057, 0.022, 5, 10);
    cuffGeo.rotateX(Math.PI / 2);
    const wristCuff = facet(cuffGeo, leather);
    wristCuff.position.y = 0.028;
    joints[`hand${s}`].add(wristCuff);
    // Faceted wedge fist: 4-sided tapered block (broad knuckles, narrow
    // fingers) + a thumb wedge inboard — no more sphere mittens. Raised so
    // its top overlaps the bracer even when the wrist bends back.
    const fistGeo = new THREE.CylinderGeometry(0.082, 0.056, 0.135, 4, 1);
    fistGeo.rotateY(Math.PI / 4);
    fistGeo.scale(1, 1, 1.25);
    const fist = facet(fistGeo, skin);
    fist.position.y = 0.0;
    joints[`hand${s}`].add(fist);
    // Shallow knuckle grooves ON the mitt surface (thin flush strips, no
    // detached slats, no gaps): hint at fingers at hero distance.
    for (const gx of [-0.021, 0.001, 0.023]) {
      const groove = chunkyBox(0.008, 0.062, 0.012, brow, { radius: 0.3 });
      groove.position.set(gx, -0.028, 0.062);
      groove.rotation.x = D(-6);
      joints[`hand${s}`].add(groove);
    }
    const thumb = facetBall(0.03, skin, [0.9, 1.35, 0.9], [5, 4]);
    thumb.position.set(s === 'L' ? -0.048 : 0.048, 0.005, 0.05);
    thumb.rotation.z = D(s === 'L' ? 24 : -24);
    joints[`hand${s}`].add(thumb);
    const thigh = grad(limbMesh(0.07, P.thighLen, vc, { taper: 0.92, facet: true }),
      '#474134', '#635b4a');
    joints[`thigh${s}`].add(thigh);
    const shin = limbMesh(0.06, P.shinLen - 0.05, pantsDark, { taper: 1.05, facet: true });
    joints[`shin${s}`].add(shin);
    const boot = chunkyBox(0.125, 0.095, 0.21, bootHide, { radius: 0.35 });
    boot.position.set(0, -0.02, 0.035);
    joints[`foot${s}`].add(boot);
    const cuff = chunkyBox(0.135, 0.05, 0.17, leatherDark, { radius: 0.35 });
    cuff.position.set(0, 0.035, 0.005);
    joints[`foot${s}`].add(cuff);
  }

  // --- The signature BOW — chord ~1.2m, held in the left hand --------------
  // Built so the chord runs along local Y and the belly bulges toward +Z:
  // vertical at rest; handL rx≈+80 in aim poses keeps it vertical when the
  // arm points forward.
  const bow = new THREE.Group();
  const R = 0.61, arc = D(110);   // shrunk ~15%: tips clear floor/legs at all angles
  const limbGeo = new THREE.TorusGeometry(R, 0.028, 5, 22, arc);
  limbGeo.rotateZ(-arc / 2);       // symmetric about +X
  limbGeo.rotateY(-Math.PI / 2);   // belly +X -> +Z, chord along Y
  const gripDrop = 0.1;            // hand grips below the bow's midpoint
  limbGeo.translate(0, gripDrop, -R);   // grip at origin
  bow.add(facet(limbGeo, wood));
  const half = R * Math.sin(arc / 2);
  const zTip = -(R - R * Math.cos(arc / 2));
  // String as two segments pivoted at the nocks, so the attack clip can
  // rotate+stretch them to pull the midpoint back to the cheek.
  for (const [nm, sy] of [['stringT', 1], ['stringB', -1]]) {
    const seg = new THREE.Group();
    seg.name = nm;
    seg.position.set(0, sy * half + gripDrop, zTip);
    const segMesh = new THREE.Mesh(new THREE.BoxGeometry(0.01, half, 0.01), stringMat);
    segMesh.position.y = -sy * half / 2;
    seg.add(segMesh);
    bow.add(seg);
  }
  for (const sy of [-1, 1]) {      // tip nocks: chunky leather caps + cream ring
    const nock = facetBall(0.046, leatherDark, [1, 1.5, 1], [6, 5]);
    nock.position.set(0, sy * half * 0.97 + gripDrop, zTip * 0.9);
    bow.add(nock);
    const ringGeo = new THREE.TorusGeometry(0.032, 0.011, 5, 8);
    ringGeo.rotateX(Math.PI / 2);
    const ring = facet(ringGeo, cream);
    ring.position.set(0, sy * half * 0.9 + gripDrop, zTip * 0.86);
    bow.add(ring);
  }
  // Leather grip wrap: fat wrapped handle proud of the fist, cream whipping.
  const grip = chunkyBox(0.072, 0.16, 0.09, leather, { radius: 0.4 });
  bow.add(grip);
  for (const sy of [-1, 1]) {
    const wrapGeo = new THREE.TorusGeometry(0.052, 0.016, 5, 10);
    wrapGeo.rotateX(Math.PI / 2);
    const wrap = facet(wrapGeo, cream);
    wrap.position.set(0, sy * 0.095, 0);
    bow.add(wrap);
  }
  // Nocked arrow: hidden at rest (scale ~0), pops in during the draw, and
  // vanishes on release. Rides beside the riser at string height.
  const nockArrow = new THREE.Group();
  nockArrow.name = 'nockArrow';
  nockArrow.position.set(0.035, gripDrop, 0);
  nockArrow.scale.setScalar(0.001);           // rest = invisible
  const aShaft = facet(new THREE.BoxGeometry(0.014, 0.014, 0.6), wood);
  nockArrow.add(aShaft);
  const aTip = facetBall(0.022, dark, [0.8, 0.8, 1.8], [6, 5]);
  aTip.position.z = 0.31;
  nockArrow.add(aTip);
  const aFletch = facetBall(0.03, fletch, [0.8, 1, 1.6], [6, 5]);
  aFletch.position.z = -0.27;
  nockArrow.add(aFletch);
  bow.add(nockArrow);
  bow.name = 'bow';   // animatable: recoil kick on release
  bow.position.set(0, -0.02, 0.02);
  bow.rotation.x = D(6);   // slight forward cant
  bow.rotation.z = D(8);   // top tip cants OUTWARD, clear of the hood
  joints.handL.add(bow);

  // --- Clips ---------------------------------------------------------------
  // "Rest" for the attack: bow carried on a bent elbow (tip clear of floor).
  const still = { forearmL: { rot: [-38, 0, 0] }, handL: { rot: [-15, 0, 0] }, bow: { rot: [-9.4, -49.3, -42.3] } };

  // Idle: alert scanning — look left, hold, sweep right, return. Offset
  // archer stance (left foot forward, slight forward lean), breathing on the
  // chest + a root bob; bow arm stays quiet. Hood tail sways with a lag.
  const stance = {
    thighL: { rot: [-10, 0, 0] }, shinL: { rot: [4, 0, 0] }, footL: { rot: [6, 0, 0] },
    thighR: { rot: [4, 0, 0] }, footR: { rot: [-4, 0, 0] },
    spine: { rot: [3, 0, 0] },
    // Carry the bow with a bent elbow so its lower tip clears the floor.
    forearmL: { rot: [-38, 0, 0] }, handL: { rot: [-15, 0, 0] }, bow: { rot: [-9.4, -49.3, -42.3] },
  };
  const exhale = { chest: { pos: [0, 0, 0], rot: [4, 0, 0] } };
  const inhale = { chest: { pos: [0, 0.012, 0.004], rot: [1, 0, 0] } };
  // Idle is NOT ground-clipped, so hips y offsets here must stay ~0 or the
  // boots sink through the floor during the holds.
  const scanL = {
    ...stance,
    hips: { pos: [0.008, -0.001, 0], rot: [1, 3, 1.5] },
    chest: { pos: inhale.chest.pos, rot: [1, 5, -1] },
    head: { rot: [-3, 24, 0] },
    hoodTip: { rot: [-3, -10, 0] },     // lags behind the head turn
    upperArmL: { rot: [3, 0, 2] }, upperArmR: { rot: [3, 0, -3] },
    forearmR: { rot: [-7, 0, 0] },
  };
  const scanC = {
    ...stance,
    hips: { pos: [0, 0, 0], rot: [1.5, 0, 0] },
    chest: { ...exhale.chest },
    head: { rot: [-2, 2, 0] },
    hoodTip: { rot: [2, 3, 0] },
    upperArmL: { rot: [2, 0, 2] }, upperArmR: { rot: [4, 0, -2] },
    forearmR: { rot: [-9, 0, 0] },
  };
  const scanR = {
    ...stance,
    hips: { pos: [-0.008, -0.002, 0], rot: [1, -3, -1.5] },
    chest: { pos: inhale.chest.pos, rot: [1, -6, 1] },
    head: { rot: [-3, -22, 0] },
    hoodTip: { rot: [-3, 9, 0] },
    upperArmL: { rot: [4, 0, 3] }, upperArmR: { rot: [2, 0, -2] },
    forearmR: { rot: [-6, 0, 0] },
  };
  const idle = bakeClip(root, 'idle', [
    { t: 0.0, pose: scanC },
    { t: 0.55, pose: scanL },
    { t: 1.1, pose: { ...scanL, head: { rot: [-4, 20, 0] }, hoodTip: { rot: [-2, -6, 0] }, chest: { pos: [0, 0.002, 0], rot: [4, 5, -1] } } },
    { t: 1.6, pose: scanC },
    { t: 2.1, pose: scanR },
    { t: 2.55, pose: { ...scanR, head: { rot: [-2, -18, 0] }, hoodTip: { rot: [-2, 5, 0] }, chest: { pos: [0, 0.002, 0], rot: [4, -6, 1] } } },
    { t: 3.0, pose: scanC },
  ]);

  // Walk: light and quick, 0.7s. NOTE: groundClip pins the body's lowest
  // point to the floor every frame, so vertical bob must come from LEG
  // GEOMETRY: knees flexed at "down" (hips sink), planted leg straight +
  // toe-off at "up" (hips rise). The bow is carried on a bent elbow with the
  // hand tilted back so its tip is never the lowest point (which previously
  // flattened the bob entirely). Hips yaw +10 vs chest -10 (counter-rotation)
  // and the pelvis rolls toward the swing leg during single support.
  const T = 0.7;
  // Carry: elbow bent hard so the bow's lower tip stays well off the floor
  // (a grounded bow tip steals groundClip's contact and hovers the stride),
  // and the bow yawed ~12° outward from the forearm so the string plane
  // clears the hip / fur hem instead of slicing through the skirt.
  // Elbow bent HARD (forearm -72) + wrist tipped back so the bow's lower tip
  // stays well clear of the floor: if the tip ever becomes the body's lowest
  // point, groundClip pins IT to the ground, the feet float, and the crown
  // bob flattens to a constant height (the walk16 f4/f11 airborne bug).
  const carryL = {
    upperArmL: { rot: [12, 0, 4] }, forearmL: { rot: [-38, 0, 0] },
    handL: { rot: [-15, 0, 0] }, bow: { rot: [-9.4, -49.3, -42.3] },
  };
  // Stance-foot rule: footX ≈ -(thighX+shinX) keeps the sole world-flat.
  // Contact = crown LOW (deep flexion both legs), slight heel-first (~-12°
  // world) that flattens by down. Bob comes from support-leg extension:
  // contact/down flexed (hips sink 4-5% of height) -> passing near-straight.
  const contactL = {
    hips: { pos: [0, -0.05, 0], rot: [4, 8, 4] },
    chest: { rot: [4, -8, -4] },
    head: { rot: [-4, 1, 1] },
    hoodTip: { rot: [8, 0, 2] },
    thighL: { rot: [-32, 0, 0] }, shinL: { rot: [28, 0, 0] }, footL: { rot: [0, 0, 0] },
    thighR: { rot: [21, 0, 0] }, shinR: { rot: [43, 0, 0] }, footR: { rot: [8, 0, 0] },
    ...carryL,
    upperArmR: { rot: [-34, 0, -5] }, forearmR: { rot: [-28, 0, 0] },
  };
  // Down = plant absorbed: support knee flexed ~48°, sole dead flat
  // (footL = -(thigh+shin)); pelvis rolls hard toward the swing leg.
  const downL = {
    hips: { pos: [0, -0.045, 0], rot: [6, 6, 10] },
    chest: { rot: [5, -6, -8] },
    head: { rot: [-4, 1, -4] },
    hoodTip: { rot: [12, 0, 2] },
    thighL: { rot: [-36, 0, 0] }, shinL: { rot: [66, 0, 0] }, footL: { rot: [-30, 0, 0] },
    thighR: { rot: [28, 0, 0] }, shinR: { rot: [46, 0, 0] }, footR: { rot: [22, 0, 0] },
    ...carryL, upperArmL: { rot: [8, 0, 3] },
    upperArmR: { rot: [-28, 0, -5] }, forearmR: { rot: [-26, 0, 0] },
  };
  // Passing = support leg near-straight -> crown at its PEAK, foot still flat.
  const passL = {
    hips: { pos: [0, 0.012, 0], rot: [3, 0, 7] },
    chest: { rot: [3, -1, -5] },
    head: { rot: [-3, 0, -3] },
    hoodTip: { rot: [-6, 0, -1] },
    thighL: { rot: [-1, 0, 0] }, shinL: { rot: [1, 0, 0] }, footL: { rot: [0, 0, 0] },
    thighR: { rot: [8, 0, 0] }, shinR: { rot: [70, 0, 0] }, footR: { rot: [0, 0, 0] },
    ...carryL, upperArmL: { rot: [5, 0, 3] },
    upperArmR: { rot: [-8, 0, -4] }, forearmR: { rot: [-16, 0, 0] },
  };
  // Up = support leg long, sole still WORLD-FLAT (footX ≈ -(thigh+shin));
  // the heel peel happens after the opposite contact, not during support.
  const upL = {
    hips: { pos: [0, 0.01, 0], rot: [2, -6, 3] },
    chest: { rot: [3, 6, -2] },
    head: { rot: [-3, -1, -1] },
    hoodTip: { rot: [-10, 0, 0] },
    thighL: { rot: [14, 0, 0] }, shinL: { rot: [16, 0, 0] }, footL: { rot: [-26, 0, 0] },
    thighR: { rot: [-22, 0, 0] }, shinR: { rot: [60, 0, 0] }, footR: { rot: [-16, 0, 0] },
    ...carryL, upperArmL: { rot: [2, 0, 3] },
    upperArmR: { rot: [10, 0, -4] }, forearmR: { rot: [-14, 0, 0] },
  };
  // Mirror swaps arms too; re-pin the bow arm to its carry pose (it never
  // swings — a forward swing would sweep the bow tip into the floor), and
  // re-author the free right arm's BACKswing explicitly.
  const mC = mirrorPose(contactL); const mD = mirrorPose(downL);
  const mP = mirrorPose(passL); const mU = mirrorPose(upL);
  const pin = (m, ax) => {
    m.upperArmL = { rot: [ax, 0, 3] };
    m.forearmL = { rot: [-38, 0, 0] };
    m.handL = { rot: [-15, 0, 0] };
    m.bow = { rot: [-9.4, -49.3, -42.3] };   // mirror negated it — re-pin solved carry
  };
  pin(mC, 8); pin(mD, 7); pin(mP, 5); pin(mU, 3);
  mC.upperArmR = { rot: [24, 0, -5] }; mC.forearmR = { rot: [-8, 0, 0] };
  mD.upperArmR = { rot: [20, 0, -5] }; mD.forearmR = { rot: [-8, 0, 0] };
  mP.upperArmR = { rot: [0, 0, -4] }; mP.forearmR = { rot: [-14, 0, 0] };
  mU.upperArmR = { rot: [-22, 0, -4] }; mU.forearmR = { rot: [-24, 0, 0] };
  const walk = groundClip(root, bakeClip(root, 'walk', [
    { t: 0, pose: contactL },
    { t: T * 0.12, pose: downL },
    { t: T * 0.25, pose: passL },
    { t: T * 0.38, pose: upL },
    { t: T * 0.5, pose: mC },
    { t: T * 0.62, pose: mD },
    { t: T * 0.75, pose: mP },
    { t: T * 0.88, pose: mU },
    { t: T, pose: contactL },
  ]));

  // Attack: draw-and-loose. Reach to the quiver, raise the bow, DRAW with a
  // long anticipation hold (creeping tension), snap release with recoil,
  // eased recovery. The hold is >25% of the clip.
  const reach = {
    hips: { pos: [0, -0.02, 0], rot: [0, 4, 0] },
    chest: { rot: [-4, -10, 0] },
    head: { rot: [0, 14, 0] },
    hoodTip: { rot: [-4, -5, 0] },
    upperArmR: { rot: [-12, -8, -98] }, forearmR: { rot: [-128, 0, 0] },
    upperArmL: { rot: [-25, 0, 6] }, forearmL: { rot: [-5, 0, 0] },
  };
  // Steering note: on a raised arm (rx ≈ -90), local ry only twists the limb;
  // rz is what swings the aim laterally. The torso twists into an archer
  // profile, so the bow arm needs rz ≈ -(torso twist) to aim world-forward.
  const draw = {
    hips: { pos: [0, -0.03, 0], rot: [0, 10, 0] },
    chest: { rot: [-6, -24, 0] },
    head: { rot: [2, 58, 0] },
    hoodTip: { rot: [0, -14, 0] },      // tail trails the fast head turn
    upperArmL: { rot: [-104, 5, 2] }, forearmL: { rot: [0, 0, 0] },
    handL: { rot: [106, 47, -3] },   // solved: belly PARALLEL TO THE DRAW LINE, chord vertical
    upperArmR: { rot: [-42, 58, -112] }, forearmR: { rot: [-108, 55, 0] },
    thighL: { rot: [0, 6, 4] }, thighR: { rot: [0, -12, -4] },
    stringT: { rot: [17, 0, 0], scale: [1, 1.05, 1] },
    stringB: { rot: [-17, 0, 0], scale: [1, 1.05, 1] },
    nockArrow: { scale: [1, 1, 1], pos: [0, 0, -0.15] },
  };
  // In-between: the torso is already swinging into the archer profile and the
  // bow is halfway up — spreads the cross-body -> raised-aim move over
  // several frames instead of a one-frame snap.
  const aimUp = {
    ...draw,
    handL: { rot: [100, 76, 0] },   // solved for THIS frame's grip-anchor axis
    hips: { pos: [0, -0.034, 0], rot: [0, 17, 0] },
    chest: { rot: [-7, 8, 0] },
    head: { rot: [3, 6, 0] },
    hoodTip: { rot: [-2, -4, 0] },
    upperArmR: { rot: [-28, 40, -88] }, forearmR: { rot: [-92, 35, 0] },
    stringT: { rot: [21, 0, 0], scale: [1, 1.08, 1] },
    stringB: { rot: [-21, 0, 0], scale: [1, 1.08, 1] },
    nockArrow: { scale: [1, 1, 1], pos: [0, 0, -0.2] },
  };
  const drawHeld = {
    ...draw,
    hips: { pos: [0, -0.038, 0], rot: [0, 23, 0] },
    chest: { rot: [-8, 35, 0] },
    head: { rot: [3, -41, 0] },
    hoodTip: { rot: [0, 6, 0] },
    upperArmR: { rot: [-50, 70, -125] }, forearmR: { rot: [-120, 70, 0] },   // solved: fist BESIDE the right cheek
    stringT: { rot: [26, 0, 0], scale: [1, 1.11, 1] },   // full draw at the anchor
    stringB: { rot: [-26, 0, 0], scale: [1, 1.11, 1] },
    nockArrow: { scale: [1, 1, 1], pos: [0, 0, -0.25] },
  };
  // Hold-with-life: at full anchor, the aim drifts a couple of degrees and
  // the chest breathes — replaces the frozen f8-f10 statue hold.
  const aimDrift = {
    ...drawHeld,
    hips: { pos: [0, -0.036, 0], rot: [0, 22, 0] },
    chest: { pos: [0, 0.006, 0.003], rot: [-7, 33, 1] },
    head: { rot: [2, -37, 1] },
    hoodTip: { rot: [-2, 4, 0] },
    upperArmL: { rot: [-105, 5, 3] },
    upperArmR: { rot: [-48, 68, -122] }, forearmR: { rot: [-118, 68, 0] },
    stringT: { rot: [27, 0, 0], scale: [1, 1.12, 1] },   // tension still creeping
    stringB: { rot: [-27, 0, 0], scale: [1, 1.12, 1] },
  };
  // Breakdown key mid-release (string halfway home, draw hand opening) so the
  // loose spans 2-3 captured frames along an arc instead of teleporting.
  const releaseMid = {
    ...drawHeld,
    hips: { pos: [0, -0.026, 0.008], rot: [0, 15, 0] },
    chest: { rot: [-3, 10, 0] },
    head: { rot: [1, 2, 0] },
    hoodTip: { rot: [6, -3, 0] },
    upperArmL: { rot: [-108, 5, 2] },   // bow arm starts its forward punch
    upperArmR: { rot: [-16, 40, -74] }, forearmR: { rot: [-70, 25, 0] },
    stringT: { rot: [12, 0, 0], scale: [1, 1.04, 1] },
    stringB: { rot: [-12, 0, 0], scale: [1, 1.04, 1] },
    bow: { rot: [-5, 0, 0], pos: [0, 0, 0.008] },
    nockArrow: { scale: [0.001, 0.001, 0.001] },   // arrow already away
  };
  const loose = {
    hips: { pos: [0, -0.012, 0.015], rot: [0, 6, 0] },
    chest: { rot: [2, -18, 0] },
    head: { rot: [0, 48, 0] },
    hoodTip: { rot: [14, -10, 0] },     // whips on the release
    upperArmL: { rot: [-112, 5, 2] }, forearmL: { rot: [0, 0, 0] },   // overshoot past aim
    handL: { rot: [106, 47, -3] },
    upperArmR: { rot: [0, 0, -38] }, forearmR: { rot: [-45, 0, 5] },
    thighL: { rot: [0, 6, 4] }, thighR: { rot: [0, -12, -4] },
    bow: { rot: [-13, 0, 0], pos: [0, 0, 0.02] },
    nockArrow: { scale: [0.001, 0.001, 0.001] },   // loosed — arrow is gone
  };
  // Overshoot one key past the release: bow kicks further forward than it
  // will rest, string flexes the OPPOSITE way (vibration), hood tail whips.
  const recoil = {
    hips: { pos: [0, -0.008, 0.01], rot: [0, 4, 0] },
    chest: { rot: [1, -12, 0] },
    head: { rot: [0, 36, 0] },
    hoodTip: { rot: [-16, -6, 0] },
    upperArmL: { rot: [-104, 5, 0] }, forearmL: { rot: [0, 0, 0] },   // settling back
    handL: { rot: [106, 47, -3] },
    upperArmR: { rot: [-4, 0, -30] }, forearmR: { rot: [-52, 0, 4] },
    thighL: { rot: [0, 6, 4] }, thighR: { rot: [0, -12, -4] },
    bow: { rot: [-20, 0, 0], pos: [0, 0, 0.03] },
    stringT: { rot: [-8, 0, 0] }, stringB: { rot: [8, 0, 0] },   // reverse flex
    nockArrow: { scale: [0.001, 0.001, 0.001] },
  };
  const settle = {
    hips: { pos: [0, -0.005, 0.006], rot: [0, 2, 0] },
    chest: { rot: [1, -8, 0] },
    head: { rot: [0, 20, 0] },
    hoodTip: { rot: [-6, -3, 0] },
    upperArmL: { rot: [-30, 2, 8] }, handL: { rot: [30, 0, 5] },
    upperArmR: { rot: [8, 0, 18] }, forearmR: { rot: [-15, 0, 3] },
    bow: { rot: [4, 0, 0] },
    stringT: { rot: [4, 0, 0] }, stringB: { rot: [-4, 0, 0] },  // vibration overshoot
  };
  // Timing: ease-OUT on the raise so frames bunch near the top (f2-f4);
  // anchor reached by 0.84, then a live drift hold; release is a 3-key chain
  // (drawHeld -> releaseMid -> loose) spanning 2-3 captured frames, then one
  // overshoot key (recoil) before the eased settle.
  // Release keys sit ON the 16-frame sample grid (1.5/16 = 0.09375) so the
  // strip captures full draw (f11) -> half-home (f12) -> loosed+overshoot
  // (f13) -> recoil (f14) instead of a one-frame teleport.
  const F = 1.5 / 16;
  const attack = groundClip(root, bakeClip(root, 'attack', [
    { t: 0, pose: still, ease: 'out' },
    { t: 2 * F, pose: reach, ease: 'out' },        // raise bunches near its top
    // hand meets the string BEFORE the arrow materializes — nocking reads as
    // an act, and the gate never sees a visible arrow mid-transit
    { t: 4 * F, pose: { ...draw, nockArrow: { scale: [0.001, 0.001, 0.001] } }, ease: 'inOut' },
    { t: 5 * F, pose: draw, ease: 'inOut' },
    { t: 7 * F, pose: aimUp, ease: 'inOut' },
    { t: 9 * F, pose: drawHeld, ease: 'inOut' },   // at the anchor
    { t: 11 * F, pose: aimDrift, ease: 'out' },    // f11: still at full draw
    { t: 12 * F, pose: releaseMid, ease: 'out' },  // f12: string half home
    { t: 13 * F, pose: loose, ease: 'out' },       // f13: string home, arm overshoots
    { t: 14 * F, pose: recoil, ease: 'inOut' },    // f14: recoil + string reverse
    { t: 15 * F, pose: settle, ease: 'inOut' },    // f15: vibration decays
    { t: 1.5, pose: still },
  ]));

  // Per-frame string constraint: while an arrow is nocked (the draw phases),
  // both string segments aim at and stretch to the DRAW HAND, and the arrow
  // nock rides the string — so the string is always on the correct side of
  // the arm, by construction instead of by keyframe luck.
  const stringT = bow.getObjectByName('stringT');
  const stringB = bow.getObjectByName('stringB');
  const _h = new THREE.Vector3();
  const _pivot = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _restDir = new THREE.Vector3();
  const _aim = new THREE.Vector3();
  // Fully-3D draw constraint (bow-local): string segments aim at the TRUE
  // hand point (no plane clamp — clamping teleported the nock 0.4m when the
  // anchored hand left the bow plane), and the arrow's NOCK sits at the hand
  // with the shaft pointed through the arrow rest at the grip.
  const FLETCH_Z = -0.27;                            // nock offset inside the arrow group
  const update = () => {
    if (nockArrow.scale.x < 0.5) return;             // not drawing: baked keys rule
    joints.handR.getWorldPosition(_h);
    bow.worldToLocal(_h);
    for (const [seg, sy] of [[stringT, 1], [stringB, -1]]) {
      _pivot.set(0, sy * half + gripDrop, zTip);
      _dir.copy(_h).sub(_pivot);
      const len = _dir.length();
      seg.quaternion.setFromUnitVectors(_restDir.set(0, -sy, 0), _dir.normalize());
      seg.scale.set(1, len / half, 1);
    }
    _aim.set(0.035, gripDrop, 0.02).sub(_h).normalize();       // hand -> arrow rest
    nockArrow.quaternion.setFromUnitVectors(_dir.set(0, 0, 1), _aim);
    // nock AT the hand — offset scaled by the group's pop-in scale, else the
    // fletch floats off the fist while the arrow materializes
    nockArrow.position.copy(_h).addScaledVector(_aim, -FLETCH_Z * nockArrow.scale.z);
  };

  return { root, clips: [idle, walk, attack], update, meta: { height: 1.38, name: 'Archer' } };
}
