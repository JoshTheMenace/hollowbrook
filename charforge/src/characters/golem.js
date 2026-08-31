import * as THREE from 'three';
import { buildSkeleton } from '../lib/rig.js';
import { toonMaterial, limbMesh, chunkyBox, facet, facetBall, paintGradient } from '../lib/parts.js';
import { bakeClip, mirrorPose, groundClip } from '../lib/clips.js';

// "Golem" — heavy stone creature. Slate rock stacked in plates, moss patches,
// ember vents, glowing moss-green core. Signature: an oversized crag of stone
// slabs rising off its back like a mountain ridge. Detail clusters at the face
// (brow ridge, cracked jaw) and the fists (knuckle plates + glow seams) —
// the fists ARE the weapon.
export function build() {
  const P = {
    hipHeight: 0.50, spineLen: 0.14, chestLen: 0.28, neckLen: 0.24, headLen: 0.10,
    shoulderX: 0.34, shoulderY: 0.16,
    upperArmLen: 0.42, forearmLen: 0.36,
    hipX: 0.15, thighLen: 0.24, shinLen: 0.21,
  };
  const { root, joints } = buildSkeleton(P);
  // Rest: hunched, asymmetric — head yawed, right arm leads, slight torso roll.
  joints.chest.rotation.x = THREE.MathUtils.degToRad(8);
  joints.chest.rotation.z = THREE.MathUtils.degToRad(3);
  joints.head.rotation.x = THREE.MathUtils.degToRad(-8);
  joints.head.rotation.y = THREE.MathUtils.degToRad(8);
  joints.upperArmL.rotation.z = THREE.MathUtils.degToRad(14);
  joints.upperArmR.rotation.z = THREE.MathUtils.degToRad(-14);
  joints.upperArmL.rotation.x = THREE.MathUtils.degToRad(4);
  joints.upperArmR.rotation.x = THREE.MathUtils.degToRad(-6);

  // Materials — three separated stone values + moss + glow.
  // lightStone on crowns/trim, stone (darkened ~15% from last round) for the
  // main masses, charcoal darkStone reserved for UNDERSIDES (belly, arm
  // undersides, leg backs) so it reads as shadow, not scatter.
  const lightStone = toonMaterial('#9aa5b1', { vertexColors: true });
  const stone = toonMaterial('#57616e', { vertexColors: true }); // slate underlayer, one step darker

  const armStone = toonMaterial('#7b8694', { vertexColors: true }); // arms: one step lighter than chest
  const darkStone = toonMaterial('#383f4b', { rim: 0.15, vertexColors: true });
  const underStone = toonMaterial('#2b3242', { rim: 0.1, vertexColors: true }); // pelvis/under-torso: darker + cooler
  const moss = toonMaterial('#5e8a3c', { rim: 0.3, vertexColors: true });
  const mossDark = toonMaterial('#46672c', { rim: 0.2, vertexColors: true });
  const glow = toonMaterial('#9ef255', { rim: 0.9, rimColor: '#e2ffbe' });
  glow.emissive = new THREE.Color('#5cb32e');
  // Crystals: ONE material, two-tone via vertex gradient — dark green root
  // fading to a bright lime tip (gradient multiplies the base color; the
  // modest emissive keeps even the dark root faintly lit).
  const crystalGlow = toonMaterial('#9ef255', { rim: 0.5, rimColor: '#d8ffb0', vertexColors: true });
  crystalGlow.emissive = new THREE.Color('#2e6f12');

  const B = '#565f6c', TOP = '#ffffff'; // gradient multipliers: dark feet, lit crowns
  const g = (mesh) => { paintGradient(mesh.geometry, B, TOP); return mesh; };
  // Arm/outer-boulder gradient: top faces pushed PAST white (cool overbright
  // multiplier) so arms catch a lighter crown tint and separate from the
  // darkened torso slate at turn 90/270.
  const TOPA = new THREE.Color(1.16, 1.19, 1.24);
  const gA = (mesh) => { paintGradient(mesh.geometry, B, TOPA); return mesh; };

  const rock = (r, mat, scale = [1, 1, 1], detail = [8, 6]) => g(facetBall(r, mat, scale, detail));
  const slab = (w, h, d, mat, radius = 0.12) => g(chunkyBox(w, h, d, mat, { radius }));
  const limb = (r, len, mat, opts = {}) => g(limbMesh(r, len, mat, { facet: true, ...opts }));
  const spike = (r, h, mat) => g(facet(new THREE.ConeGeometry(r, h, 5), mat));
  // Glow seam: DEEP box mostly buried in the host mass so only a sliver of the
  // face pokes through the curved surface — reads embedded, never floating.
  // Plain BoxGeometry: 12 tris, glow needs no rounding.
  const seamBox = (w, h, d = 0.1) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glow);
  // Embedded crystal: faceted truncated prism, dark-green root -> lime tip.
  const crystal = (r, h) => {
    const geo = new THREE.CylinderGeometry(r * 0.32, r, h, 5).toNonIndexed();
    geo.computeVertexNormals();
    paintGradient(geo, '#26511a', '#ffffff');
    return new THREE.Mesh(geo, crystalGlow);
  };
  // Plant a shard on a host ellipsoid boulder: `dir` picks the spot on the
  // surface, the prism axis aligns to the LOCAL SURFACE NORMAL there, and
  // `sink` (30-40%) of its length stays buried — plus a flattened dark
  // collar rock at the exit point, so it reads erupted, never floating.
  const plant = (joint, hostR, hs, hp, r, h, dir, sink = 0.35) => {
    const d = new THREE.Vector3(...dir).normalize();
    const p = new THREE.Vector3(d.x * hostR * hs[0], d.y * hostR * hs[1], d.z * hostR * hs[2])
      .add(new THREE.Vector3(...hp));
    const n = new THREE.Vector3(d.x / hs[0], d.y / hs[1], d.z / hs[2]).normalize();
    const shard = crystal(r, h);
    shard.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    shard.position.copy(p).addScaledVector(n, h * (0.5 - sink));
    joint.add(shard);
    const c = rock(r * 0.9, darkStone, [1.35, 0.4, 1.35], [5, 4]);
    c.quaternion.copy(shard.quaternion);
    c.position.copy(p);
    joint.add(c);
    return shard;
  };

  // --- Torso: stacked boulders + chest plates + rock belt ------------------
  const chestRock = rock(0.34, stone, [1.25, 0.95, 0.92]);
  chestRock.position.y = 0.02;
  joints.chest.add(chestRock);
  for (const s of [-1, 1]) { // pectoral rocks layered OVER the chest boulder
    const pec = rock(0.14, stone, [1.15, 0.85, 0.55], [6, 4]);
    pec.position.set(s * 0.15, 0.09, 0.25);
    pec.rotation.set(-0.2, s * 0.35, s * -0.15);
    joints.chest.add(pec);
  }
  const belly = rock(0.27, underStone, [1.15, 0.95, 1.0], [7, 5]);
  belly.position.y = 0.06;
  joints.hips.add(belly);
  const pelvis = rock(0.2, underStone, [1.2, 0.8, 1.0], [7, 5]);
  pelvis.position.y = -0.06;
  joints.hips.add(pelvis);
  // Stacked strata plates: chest bottom edge + hips top — layered rock bands.
  const strata1 = slab(0.36, 0.09, 0.12, stone, 0.2);
  strata1.position.set(0.02, -0.2, 0.17);
  strata1.rotation.set(0.18, 0, 0.05);
  joints.chest.add(strata1);
  const strata2 = slab(0.3, 0.08, 0.12, stone, 0.2);
  strata2.position.set(-0.02, 0.15, 0.18);
  strata2.rotation.set(0.14, 0, -0.06);
  joints.hips.add(strata2);
  // Rock belt: a ring of separate stones around the waist.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    const belt = rock(0.075 + (i % 2) * 0.02, i % 2 ? lightStone : stone, [1.1, 0.85, 1], [6, 4]);
    belt.position.set(Math.sin(a) * 0.26, 0.0 + (i % 2) * 0.025, Math.cos(a) * 0.23);
    belt.rotation.y = a;
    joints.hips.add(belt);
  }
  // Glowing core (half-sunk dome) + radiating cracks, deep-embedded.
  const core = facetBall(0.065, glow, [1, 1, 1], [6, 4]);
  core.name = 'glowCore';
  core.position.set(0, 0.02, 0.26);
  joints.chest.add(core);
  // Crystal cluster 1/3 — chest core: three prisms erupting from the CHEST
  // BOULDER itself around the core, each rooted 30-40% deep and aligned to
  // the ellipsoid's surface normal (no more floating pec shard).
  const CHEST = [0.34, [1.25, 0.95, 0.92], [0, 0.02, 0]];
  plant(joints.chest, ...CHEST, 0.095, 0.34, [-0.28, 0.3, 0.9], 0.34);
  plant(joints.chest, ...CHEST, 0.07, 0.24, [0.5, 0.2, 0.82], 0.34);
  plant(joints.chest, ...CHEST, 0.055, 0.16, [-0.08, -0.38, 0.92], 0.32);
  // Ember vents: glow slit framed by a dark recess slab so it reads as a vent
  // cut into the flank, not a sticker.
  for (const s of [-1, 1]) {
    const rim = slab(0.08, 0.14, 0.06, darkStone, 0.25);
    rim.position.set(s * 0.325, -0.01, 0.075);
    rim.rotation.set(0, s * 0.9, s * 0.25);
    joints.chest.add(rim);
    const vent = seamBox(0.035, 0.09, 0.12);
    vent.position.set(s * 0.33, -0.01, 0.08);
    vent.rotation.set(0, s * 0.9, s * 0.25);
    joints.chest.add(vent);
  }

  // --- Signature: back crag — thick stone-slab ridge merged into torso -----
  // Main ridge is 2-3 STACKED beveled boulder plates (big radius, varied yaw)
  // instead of one flat rectangular slab, so turn 180 reads hand-stacked rock.
  const cragTilts = [
    { w: 0.46, h: 0.26, d: 0.26, x: -0.01, y: 0.12, z: -0.19, rx: -0.24, ry: 0.06, rz: 0.05, m: stone, r: 0.3 },
    { w: 0.38, h: 0.24, d: 0.23, x: -0.04, y: 0.33, z: -0.24, rx: -0.3, ry: -0.14, rz: -0.08, m: stone, r: 0.32 },
    { w: 0.28, h: 0.2, d: 0.2, x: 0.02, y: 0.52, z: -0.29, rx: -0.34, ry: 0.12, rz: 0.1, m: lightStone, r: 0.32 },
    { w: 0.28, h: 0.44, d: 0.2, x: -0.2, y: 0.16, z: -0.18, rx: -0.32, ry: 0, rz: 0.3, m: stone, r: 0.15 },
    { w: 0.26, h: 0.38, d: 0.2, x: 0.18, y: 0.13, z: -0.17, rx: -0.24, ry: 0, rz: -0.34, m: stone, r: 0.15 },
  ];
  for (const c of cragTilts) {
    const s = slab(c.w, c.h, c.d, c.m, c.r);
    s.position.set(c.x, c.y, c.z);
    s.rotation.set(c.rx, c.ry, c.rz);
    joints.chest.add(s);
  }
  // Bridge boulder: fuses slab roots into the shoulder line — no pasted shelf.
  const cragBridge = rock(0.22, stone, [1.6, 0.75, 0.9], [7, 5]);
  cragBridge.position.set(0, 0.16, -0.16);
  joints.chest.add(cragBridge);
  const cragPeak = spike(0.13, 0.22, lightStone);
  cragPeak.position.set(-0.02, 0.6, -0.29);
  cragPeak.rotation.x = -0.28;
  joints.chest.add(cragPeak);
  // Moss wraps OVER the slab crown: cap tilted down the back face, plus a
  // drip lobe running below the edge — no shelf, it hugs the rock.
  const cragMoss = rock(0.15, moss, [1.1, 0.5, 0.85], [6, 4]);
  cragMoss.position.set(-0.05, 0.5, -0.27);
  cragMoss.rotation.x = -0.7;
  joints.chest.add(cragMoss);
  const cragDrip = rock(0.08, mossDark, [1.0, 1.7, 0.45], [5, 4]);
  cragDrip.position.set(-0.11, 0.38, -0.33);
  cragDrip.rotation.x = -0.2;
  joints.chest.add(cragDrip);
  // Back-slab detail (the 180 view): the single proud moss decal is demoted to
  // a small corner tuft, and the empty slab face gets a crystal pair + a dark
  // crack seam, all rooted INTO the slab.
  const backMoss = rock(0.1, mossDark, [0.9, 0.35, 0.6], [6, 4]);
  backMoss.position.set(0.16, 0.1, -0.22);
  joints.chest.add(backMoss);
  // (Back shards removed — the hovering shoulder-blade shard read detached at
  // turn 180; the stacked ridge plates + moss carry the back detail now, and
  // the crystal budget concentrates in 3 clusters: chest, R shoulder, L fist.)

  // --- Head: heavy stepped brow, cracked jaw, tusks — the focal cluster ----
  const head = rock(0.2, stone, [1.08, 0.95, 1.0], [7, 5]);
  head.position.set(0, 0.12, 0.08);
  joints.head.add(head);
  // Crest ridge fused to the skull: spikes sunk ~0.04 lower so their bases sit
  // inside the head mass, plus a base ridge rock bridging them into the crown
  // (kills the floating-shelf read at the 90-degree turn view).
  const crestBase = rock(0.1, lightStone, [0.75, 0.45, 1.3], [6, 4]);
  crestBase.position.set(0.02, 0.22, 0.05);
  joints.head.add(crestBase);
  const crownAngles = [[-0.09, 0.23, 0.02, 0.2], [0.03, 0.26, -0.03, -0.1], [0.12, 0.21, 0.05, -0.35]];
  for (const [x, y, z, rz] of crownAngles) {
    const crag = spike(0.05, 0.11, lightStone);
    crag.position.set(x, y, z + 0.06);
    crag.rotation.z = rz;
    joints.head.add(crag);
  }
  const headMoss = rock(0.1, moss, [1.3, 0.4, 1.1], [6, 4]);
  headMoss.position.set(-0.08, 0.2, 0.08); // tucked below the crag line so it
  joints.head.add(headMoss);               // never peeks over the back slab
  // Stepped brow ridge: deep overhang shades the eyes, second slab stacked.
  const brow = slab(0.36, 0.1, 0.16, darkStone, 0.2);
  brow.position.set(0, 0.215, 0.15);
  brow.rotation.set(0.12, 0, 0.06); // cocked brow — asymmetry
  joints.head.add(brow);
  const brow2 = slab(0.28, 0.08, 0.13, lightStone, 0.2);
  brow2.position.set(0.015, 0.285, 0.11);
  brow2.rotation.z = -0.08;
  joints.head.add(brow2);
  for (const s of [-1, 1]) {
    const socket = slab(0.1, 0.1, 0.05, darkStone, 0.25); // dark recess
    socket.position.set(s * 0.08, 0.125, 0.2);
    joints.head.add(socket);
    const eye = facetBall(0.05, glow, [1, 1.2, 0.7], [6, 4]);
    eye.position.set(s * 0.08, 0.125, 0.235);
    joints.head.add(eye);
    const cheek = slab(0.09, 0.11, 0.06, stone, 0.25);
    cheek.position.set(s * 0.16, 0.04, 0.17);
    cheek.rotation.z = s * -0.2;
    joints.head.add(cheek);
    const ear = rock(0.06, stone, [0.7, 1.1, 1.0], [5, 4]);
    ear.position.set(s * 0.2, 0.12, 0.02);
    joints.head.add(ear);
  }
  // Cracked jaw plate with a glow seam splitting the chin.
  const jaw = slab(0.28, 0.1, 0.15, darkStone, 0.2);
  jaw.position.set(0, -0.02, 0.15);
  joints.head.add(jaw);
  const jawCrack = seamBox(0.024, 0.08, 0.1);
  jawCrack.position.set(0.05, -0.015, 0.17);
  jawCrack.rotation.z = 0.35;
  joints.head.add(jawCrack);
  const chinStone = rock(0.06, lightStone, [1.1, 0.8, 0.9], [5, 4]);
  chinStone.position.set(-0.06, -0.06, 0.18);
  joints.head.add(chinStone);
  for (const s of [-1, 1]) { // underbite tusks
    const tusk = slab(0.05, 0.09, 0.05, lightStone, 0.3);
    tusk.position.set(s * 0.09, 0.05, 0.2);
    tusk.rotation.z = s * -0.12;
    joints.head.add(tusk);
  }

  // --- Arms & legs ---------------------------------------------------------
  for (const s of ['L', 'R']) {
    const side = s === 'L' ? 1 : -1;
    // Shoulder: stacked plates, not one blob. Left stack taller (asymmetry).
    const boulder = gA(rock(0.19, armStone, [1.15, 1.0, 0.95]));
    boulder.position.set(side * 0.04, 0.04, 0);
    joints[`shoulder${s}`].add(boulder);
    if (s === 'R') {
      // Crystal cluster 2/3 — right shoulder: two prisms rooted in the
      // shoulder boulder, punching up-and-out along its surface normals.
      const SH = [0.19, [1.15, 1.0, 0.95], [-0.04, 0.04, 0]];
      plant(joints.shoulderR, ...SH, 0.075, 0.24, [-0.9, 0.35, 0.28], 0.36);
      plant(joints.shoulderR, ...SH, 0.055, 0.16, [-0.75, 0.15, -0.55], 0.32);
    }
    const capRock = rock(0.13, lightStone, [1.25, 0.55, 1.05], [7, 5]);
    capRock.position.set(side * 0.05, s === 'L' ? 0.17 : 0.15, -0.01);
    capRock.rotation.z = side * -0.12;
    joints[`shoulder${s}`].add(capRock);
    const mossCap = rock(0.11, s === 'L' ? moss : mossDark, [1.25, 0.45, 1.0], [6, 4]);
    mossCap.position.set(side * 0.05, s === 'L' ? 0.24 : 0.21, -0.02);
    joints[`shoulder${s}`].add(mossCap);

    // Upper arm: faceted limb + charcoal plate on the UNDERSIDE (back of arm).
    const upper = gA(limb(0.13, P.upperArmLen, armStone, { taper: 1.08 }));
    joints[`upperArm${s}`].add(upper);
    const armPlate = rock(0.1, darkStone, [0.7, 1.4, 0.7], [6, 4]);
    armPlate.position.set(side * 0.06, -0.22, -0.09);
    armPlate.rotation.z = side * 0.12;
    joints[`upperArm${s}`].add(armPlate);
    // Facet chip on the OUTER face (reads at turn 90/270), asymmetric: light
    // chip high on the left arm, plain-stone chip low on the right.
    const armChip = rock(0.07, s === 'L' ? lightStone : stone, [1.1, 0.55, 0.9], [5, 4]);
    armChip.position.set(side * 0.1, s === 'L' ? -0.1 : -0.27, 0.04);
    armChip.rotation.z = side * 0.45;
    joints[`upperArm${s}`].add(armChip);
    const armMoss = rock(0.055, s === 'L' ? mossDark : moss, [1.15, 0.5, 0.9], [5, 4]);
    armMoss.position.set(side * 0.09, s === 'L' ? -0.24 : -0.09, -0.03);
    armMoss.rotation.z = side * -0.3;
    joints[`upperArm${s}`].add(armMoss);

    // Forearm: bigger, plated (no glow here — crystals cluster at the fists).
    const fore = gA(limb(0.145, P.forearmLen, armStone, { taper: 1.18 }));
    joints[`forearm${s}`].add(fore);
    const forePlate = rock(0.115, lightStone, [0.65, 1.5, 1.0], [6, 4]);
    forePlate.position.set(side * 0.14, -0.19, 0.02);
    forePlate.rotation.set(0.05, 0, side * 0.12);
    joints[`forearm${s}`].add(forePlate);
    const forePlate2 = rock(0.09, darkStone, [1.0, 1.3, 0.6], [6, 4]);
    forePlate2.position.set(0, -0.24, -0.13); // back of forearm = shaded side
    forePlate2.rotation.x = -0.12;
    joints[`forearm${s}`].add(forePlate2);

    // Fist: the weapon. Big boulder + cracked knuckle plates + glow seams.
    const fist = gA(rock(0.185, armStone, [1.1, 0.95, 1.15], [7, 5]));
    fist.position.y = -0.05;
    joints[`hand${s}`].add(fist);
    for (let k = -1; k <= 1; k++) { // large faceted knuckle plates, forward
      const knuckle = slab(0.09, 0.09, 0.08, lightStone, 0.18);
      knuckle.position.set(k * 0.083, -0.02, 0.16);
      knuckle.rotation.set(0.12, 0, k * 0.12);
      joints[`hand${s}`].add(knuckle);
    }
    if (s === 'L') {
      // Crystal cluster 3/3 — left fist only: a big shard + companion rooted
      // in the fist boulder, tips punching forward over the knuckles.
      const FIST = [0.185, [1.1, 0.95, 1.15], [0, -0.05, 0]];
      plant(joints.handL, ...FIST, 0.062, 0.19, [0.12, 0.4, 0.9], 0.36);
      plant(joints.handL, ...FIST, 0.045, 0.12, [-0.35, 0.2, 0.88], 0.32);
    }
    const handPlate = slab(0.15, 0.07, 0.13, darkStone, 0.2); // back of hand
    handPlate.position.set(0, 0.045, -0.06);
    handPlate.rotation.x = -0.3;
    joints[`hand${s}`].add(handPlate);

    // Legs: faceted stubs; charcoal reserved for calf backs + soles.
    const thigh = limb(0.105, P.thighLen, darkStone, { taper: 1.0 });
    joints[`thigh${s}`].add(thigh);
    const thighPlate = slab(0.13, 0.13, 0.07, stone, 0.2); // stacked plate over the dark thigh
    thighPlate.position.set(0, -0.13, 0.07);
    thighPlate.rotation.set(0.1, 0, side * -0.08);
    joints[`thigh${s}`].add(thighPlate);
    // Outer-thigh facet chip, offset heights L/R — kills the plain capsule
    // read at turn 90/270.
    const thighChip = rock(0.06, s === 'L' ? stone : lightStone, [1.15, 0.55, 0.9], [5, 4]);
    thighChip.position.set(side * 0.085, s === 'L' ? -0.05 : -0.16, -0.02);
    thighChip.rotation.z = side * -0.4;
    joints[`thigh${s}`].add(thighChip);
    // Shin capsule stops ABOVE the ankle (the foot box covers the joint):
    // its old tapered cap reached past the ankle and became the body's lowest
    // point in stance, so groundClip seated on the calf and hovered the feet.
    const shin = limb(0.095, P.shinLen - 0.12, stone, { taper: 1.05 });
    joints[`shin${s}`].add(shin);
    const shinPlate = slab(0.12, 0.12, 0.06, lightStone, 0.2);
    shinPlate.position.set(0, -0.08, 0.09);
    shinPlate.rotation.x = 0.12;
    joints[`shin${s}`].add(shinPlate);
    const calfPlate = rock(0.08, darkStone, [1.0, 1.3, 0.7], [5, 4]); // back of leg
    calfPlate.position.set(0, -0.05, -0.075); // high enough that a deep knee bend never swings it below the sole
    joints[`shin${s}`].add(calfPlate);
    const foot = slab(0.2, 0.11, 0.26, darkStone, 0.15);
    foot.position.set(0, 0.028, 0.03);
    joints[`foot${s}`].add(foot);
    for (let k = -1; k <= 1; k++) {
      const toe = rock(0.045, lightStone, [1, 0.9, 1.1], [5, 4]);
      toe.position.set(k * 0.065, 0.02, 0.16);
      joints[`foot${s}`].add(toe);
    }
  }
  // Moss patches, asymmetric: left thigh, right calf.
  const thighMoss = rock(0.09, moss, [1.2, 0.5, 1.0], [6, 4]);
  thighMoss.position.set(0.05, -0.1, 0.05);
  joints.thighL.add(thighMoss);
  const calfMoss = rock(0.07, mossDark, [1.2, 0.5, 1.0], [5, 4]);
  calfMoss.position.set(-0.04, -0.03, 0.06);
  joints.shinR.add(calfMoss);

  // --- Clips ---------------------------------------------------------------
  const still = {};

  // Idle: slow heavy breathing, out-of-phase arms, pulsing core.
  const idleA = {
    hips: { pos: [0, -0.006, 0], rot: [1, 0, 0.5] },
    chest: { rot: [2, 0, -0.5] },
    head: { rot: [-2, 3, 0] },
    shoulderL: { pos: [0, 0.004, 0] }, shoulderR: { pos: [0, 0.006, 0] },
    footL: { rot: [-1, 0, 0] }, footR: { rot: [-1, 0, 0] },
    upperArmL: { rot: [2, 0, 1] }, upperArmR: { rot: [5, 0, -3] },
    forearmR: { rot: [-3, 0, 0] },
    glowCore: { scale: [1, 1, 1] },
  };
  const idleB = {
    hips: { pos: [0.02, -0.012, 0], rot: [4, 2, -2.5] },
    chest: { rot: [7, -3, 2] },
    head: { rot: [-6, -4, -1] },
    shoulderL: { pos: [0, 0.026, 0] }, shoulderR: { pos: [0, 0.018, 0] },
    footL: { rot: [-4, 0, 0] }, footR: { rot: [-3, 0, 0] },
    upperArmL: { rot: [8, 0, 5] }, upperArmR: { rot: [5, 0, -3] },
    forearmL: { rot: [-5, 0, 0] }, forearmR: { rot: [-3, 0, 0] },
    glowCore: { scale: [1.25, 1.25, 1.25] },
  };
  const idle = bakeClip(root, 'idle', [
    { t: 0.0, pose: idleA },
    { t: 1.3, pose: idleB },
    { t: 2.6, pose: idleA },
  ]);

  // Walk: 1.2s ponderous stomp. Stance foot rx cancels thigh+shin so the sole
  // is FLAT and locked through down/pass/up; hip drops toward the swing side
  // right after contact (rz) to sell the tonnage.
  const T = 1.2;
  const contactL = {
    hips: { pos: [0, -0.045, 0], rot: [4, 13, 0] },
    chest: { rot: [6, -15, -5] },
    head: { rot: [-5, 3, 1] },
    // support foot FLAT from first contact: thigh+shin+foot rx sums to 0 in
    // every stance key (and every key pair interpolates 0->0), so the sole
    // never shows a shadow gap during the support phase. The SUPPORT leg must
    // also be the DEEPEST-reaching leg in every stance key, or groundClip
    // plants the trailing toe instead and the lead foot hovers.
    thighL: { rot: [-33, 0, 0] }, shinL: { rot: [16, 0, 0] }, footL: { rot: [17, 0, 0] },
    // Rear foot FLAT at contact (double support): explicit ankle key cancels
    // thigh+shin+hips so world pitch ~= 0 and the sole stays on the floor
    // until toe-off — no more toe-down drag at f8-9.
    thighR: { rot: [15, 0, 0] }, shinR: { rot: [14, 0, 0] }, footR: { rot: [-30, 0, 0] },
    // Forward (R) arm swing shortened + elbow bent so the fist rides high —
    // no near-ground hover implying a missed knuckle-plant.
    upperArmL: { rot: [31, -4, 5] }, forearmL: { rot: [-7, 0, 0] },
    upperArmR: { rot: [-21, -6, -5] }, forearmR: { rot: [-38, 0, 0] },
  };
  const downL = { // hips lowest just after contact: the tonnage SINKS in.
    hips: { pos: [0, -0.14, 0], rot: [7, 9, 9] }, // rz 9: pelvis dips toward the swing leg
    chest: { rot: [12, -10, -9] },                     // chest pitches into the sink
    head: { rot: [-11, 2, 2] },                        // head lags the dip
    shoulderL: { pos: [0, -0.018, 0] }, shoulderR: { pos: [0, -0.008, 0] }, // stance-side shoulder dips
    // Deep support-knee bend at down: groundClip erases authored hips.pos, so
    // the bob must come from the support leg actually shortening (~70 deg knee
    // -> crown sits ~0.08m / 5% lower than at passing)
    thighL: { rot: [-30, 0, 0] }, shinL: { rot: [65, 0, 0] }, footL: { rot: [-36, 0, 0] },
    // Toe-off: knee bends MORE (ankle lifts) so the departing toe pushes off
    // without scraping once groundClip seats on the stance foot.
    thighR: { rot: [24, 0, 0] }, shinR: { rot: [56, 0, 0] }, footR: { rot: [-50, 0, 0] },
    upperArmL: { rot: [25, -3, 5] }, forearmL: { rot: [-14, 0, 0] },
    upperArmR: { rot: [-13, -5, -5] }, forearmR: { rot: [-58, 0, 0] }, // deep elbow bend: fists must NEVER be the lowest point (groundClip would seat on them and hover the stance foot)
  };
  const passL = {
    hips: { pos: [0, -0.02, 0], rot: [4, 0, -4] },
    chest: { rot: [5, 1, 4] },
    head: { rot: [-4, 0, -2] },
    // ...and near-straight at passing (~1 deg): crown genuinely rises.
    thighL: { rot: [-2, 0, 0] }, shinL: { rot: [1, 0, 0] }, footL: { rot: [1, 0, 0] },
    // Swing foot LEVEL through passing (ankle key cancels the leg chain) —
    // kills the toe-down hover at f12-13.
    thighR: { rot: [-8, 0, 0] }, shinR: { rot: [55, 0, 0] }, footR: { rot: [-48, 0, 0] },
    upperArmL: { rot: [11, -2, 5] }, forearmL: { rot: [-11, 0, 0] },
    upperArmR: { rot: [-9, -3, -5] }, forearmR: { rot: [-16, 0, 0] },
  };
  const upL = {
    hips: { pos: [0, 0.032, 0], rot: [3, -6, -3] },
    chest: { rot: [4, 7, 3] },
    head: { rot: [-3, -2, -1] },
    thighL: { rot: [3, 0, 0] }, shinL: { rot: [6, 0, 0] }, footL: { rot: [-9, 0, 0] },
    thighR: { rot: [-22, 0, 0] }, shinR: { rot: [52, 0, 0] }, footR: { rot: [-30, 0, 0] },
    upperArmL: { rot: [-13, 0, 5] }, forearmL: { rot: [-17, 0, 0] },
    upperArmR: { rot: [9, 0, -5] }, forearmR: { rot: [-10, 0, 0] },
  };
  const walk = groundClip(root, bakeClip(root, 'walk', [
    { t: 0, pose: contactL },
    { t: T * 0.16, pose: downL, ease: 'out' },  // fast sink right after contact
    { t: T * 0.3, pose: passL },
    { t: T * 0.4, pose: upL },
    { t: T * 0.5, pose: mirrorPose(contactL) },
    { t: T * 0.66, pose: mirrorPose(downL), ease: 'out' },
    { t: T * 0.8, pose: mirrorPose(passL) },
    { t: T * 0.9, pose: mirrorPose(upL) },
    { t: T, pose: contactL },
  ]));

  // Attack: ground pound. Long wind-up, arms whip through a mid-drop key so
  // the fists trace a visible arc, deep overshoot slam, recoil, then a torso
  // shudder with offset hands (no frozen twinned hold), slow settle.
  const gather = {
    hips: { pos: [0, -0.06, 0], rot: [9, 0, 2] },
    chest: { rot: [11, -4, 0] },
    head: { rot: [-6, 4, 0] },
    upperArmL: { rot: [26, 0, 10] }, forearmL: { rot: [-10, 0, 0] },
    upperArmR: { rot: [32, 2, -12] }, forearmR: { rot: [-14, 0, 0] },
    thighL: { rot: [-14, 0, 0] }, shinL: { rot: [22, 0, 0] }, footL: { rot: [-8, 0, 0] },
    thighR: { rot: [-14, 0, 0] }, shinR: { rot: [22, 0, 0] }, footR: { rot: [-8, 0, 0] },
    glowCore: { scale: [1.05, 1.05, 1.05] },
  };
  const windMid = { // breakdown ON sample f3 (3 * 1.8/16 = 0.3375): arms
    // halfway up the raise with elbows deep and fists flared outward, chest
    // just starting to lean — the transition into the windup hold ARCS
    // instead of jumping from arm-high (f3) to swept-lean (f4).
    hips: { pos: [0, 0.06, -0.03], rot: [-12, 0, 1] },
    chest: { rot: [-20, -3, 2] },
    head: { rot: [13, -5, 0] },
    upperArmL: { rot: [-108, 8, 24] }, forearmL: { rot: [-48, 0, 0] },
    upperArmR: { rot: [-120, -7, -26] }, forearmR: { rot: [-56, 0, 0] },
    thighL: { rot: [-1, 0, 0] }, shinL: { rot: [8, 0, 0] }, footL: { rot: [12, 0, 0] },
    thighR: { rot: [-1, 0, 0] }, shinR: { rot: [8, 0, 0] }, footR: { rot: [12, 0, 0] },
    glowCore: { scale: [1.28, 1.28, 1.28] },
  };
  const rearUp = {
    hips: { pos: [0, 0.1, -0.04], rot: [-18, 0, 0] },
    chest: { rot: [-28, -3, 2] },
    head: { rot: [18, -5, 0] },
    upperArmL: { rot: [-152, 4, 16] }, forearmL: { rot: [-38, 0, 0] },
    upperArmR: { rot: [-164, -3, -18] }, forearmR: { rot: [-50, 0, 0] },
    thighL: { rot: [4, 0, 0] }, shinL: { rot: [2, 0, 0] }, footL: { rot: [22, 0, 0] },
    thighR: { rot: [4, 0, 0] }, shinR: { rot: [2, 0, 0] }, footR: { rot: [22, 0, 0] },
    glowCore: { scale: [1.35, 1.35, 1.35] },
  };
  const rearUp2 = { // moving hold — keeps the apex alive before the drop
    ...rearUp,
    hips: { pos: [0, 0.11, -0.045], rot: [-19, 0, 0] },
    upperArmL: { rot: [-157, 5, 17] }, upperArmR: { rot: [-168, -4, -19] },
    head: { rot: [20, -6, 0] },
    glowCore: { scale: [1.45, 1.45, 1.45] },
  };
  const midDrop1 = { // arc key 1: fists just past vertical, torso whipping over
    hips: { pos: [0, 0.06, -0.01], rot: [-4, 0, 1] },
    chest: { rot: [-8, -1, 1] },
    head: { rot: [12, -3, 0] },
    upperArmL: { rot: [-112, 3, 14] }, forearmL: { rot: [-44, 0, 0] },
    upperArmR: { rot: [-120, -3, -16] }, forearmR: { rot: [-42, 0, 0] },
    thighL: { rot: [-6, 0, 0] }, shinL: { rot: [10, 0, 0] }, footL: { rot: [4, 0, 0] },
    thighR: { rot: [-6, 0, 0] }, shinR: { rot: [10, 0, 0] }, footR: { rot: [4, 0, 0] },
    glowCore: { scale: [1.55, 1.55, 1.55] },
  };
  const midDrop2 = { // arc key 2 (breakdown between captured frames 7-8):
    // fists ~25 deg above horizontal, right arm leading, chest committed
    hips: { pos: [0, -0.06, 0.02], rot: [16, 0, 1] },
    chest: { rot: [24, 1, -2] },
    head: { rot: [2, -2, 0] },
    upperArmL: { rot: [30, 2, 12] }, forearmL: { rot: [-34, 0, 0] },
    upperArmR: { rot: [22, -2, -14] }, forearmR: { rot: [-26, 0, 0] },
    thighL: { rot: [-22, 0, 0] }, shinL: { rot: [28, 0, 0] }, footL: { rot: [-6, 0, 0] },
    thighR: { rot: [-22, 0, 0] }, shinR: { rot: [28, 0, 0] }, footR: { rot: [-6, 0, 0] },
    glowCore: { scale: [1.75, 1.75, 1.75] },
  };
  const slam = { // overshoot: deepest squash, fists driven into the floor
    hips: { pos: [0, -0.26, 0.06], rot: [26, 0, 2], scale: [1.15, 0.75, 1.15] },
    chest: { rot: [42, 3, -3] },
    head: { rot: [-18, 3, 0] },
    upperArmL: { rot: [-74, 2, 7] }, forearmL: { rot: [-28, 0, 0] },
    upperArmR: { rot: [-86, -2, -9] }, forearmR: { rot: [-18, 0, 0] },
    thighL: { rot: [-48, 0, 0] }, shinL: { rot: [58, 0, 0] }, footL: { rot: [-10, 0, 0] },
    thighR: { rot: [-48, 0, 0] }, shinR: { rot: [58, 0, 0] }, footR: { rot: [-10, 0, 0] },
    glowCore: { scale: [2.3, 2.3, 2.3] },
  };
  const rebound = { // impact bounce: whole body kicks back UP, arms lift
    hips: { pos: [0, -0.11, 0.03], rot: [15, 0, -2], scale: [0.97, 1.06, 0.97] },
    chest: { rot: [24, 2, 3] },
    head: { rot: [-24, 3, 1] },                    // head still lagging down
    upperArmL: { rot: [-44, 0, 11] }, forearmL: { rot: [-32, 0, 0] },
    upperArmR: { rot: [-54, 0, -12] }, forearmR: { rot: [-22, 0, 0] },
    thighL: { rot: [-28, 0, 0] }, shinL: { rot: [38, 0, 0] }, footL: { rot: [-8, 0, 0] },
    thighR: { rot: [-28, 0, 0] }, shinR: { rot: [38, 0, 0] }, footR: { rot: [-8, 0, 0] },
    glowCore: { scale: [1.8, 1.8, 1.8] },
  };
  const reland = { // second, smaller impact: fists settle back into the crater
    hips: { pos: [0.015, -0.18, 0.045], rot: [21, -2, 3], scale: [1.05, 0.95, 1.05] },
    chest: { rot: [33, 3, -3] },
    head: { rot: [-15, -2, -1] },
    upperArmL: { rot: [-60, 0, 12] }, forearmL: { rot: [-24, 0, 0] },
    upperArmR: { rot: [-70, 0, -10] }, forearmR: { rot: [-12, 0, 0] },
    thighL: { rot: [-36, 0, 0] }, shinL: { rot: [46, 0, 0] }, footL: { rot: [-8, 0, 0] },
    thighR: { rot: [-36, 0, 0] }, shinR: { rot: [46, 0, 0] }, footR: { rot: [-8, 0, 0] },
    glowCore: { scale: [1.55, 1.55, 1.55] },
  };
  const shudder = { // counter-shudder right, small — settling vibration
    hips: { pos: [-0.012, -0.13, 0.02], rot: [12, 1, 2] },
    chest: { rot: [19, -2, -1.5] },
    head: { rot: [-9, 1, 1] },
    upperArmL: { rot: [-46, 0, 11] }, forearmL: { rot: [-16, 0, 0] },
    upperArmR: { rot: [-52, 0, -12] }, forearmR: { rot: [-12, 0, 0] },
    thighL: { rot: [-26, 0, 0] }, shinL: { rot: [34, 0, 0] },
    thighR: { rot: [-26, 0, 0] }, shinR: { rot: [34, 0, 0] },
    glowCore: { scale: [1.3, 1.3, 1.3] },
  };
  const settle = {
    hips: { pos: [0, -0.06, 0.01], rot: [8, 0, 0] },
    chest: { rot: [12, 0, 0] },
    head: { rot: [-5, 1, 0] },
    upperArmL: { rot: [-26, 0, 12] }, forearmL: { rot: [-12, 0, 0] },
    upperArmR: { rot: [-30, 0, -14] }, forearmR: { rot: [-10, 0, 0] },
    thighL: { rot: [-16, 0, 0] }, shinL: { rot: [22, 0, 0] },
    thighR: { rot: [-16, 0, 0] }, shinR: { rot: [22, 0, 0] },
    glowCore: { scale: [1.15, 1.15, 1.15] },
  };
  // Timing tuned to the 16-frame capture grid (1.8s/16 = 0.1125s per frame):
  // cocked apex is SHORT (~f4-f5 only), the drop is spread 0.60-0.985 with
  // ease-in so f6 (~155 deg), f7 (~95 deg), f8 (~20 deg) each show the arms
  // partway along the arc, f9 lands in the slam->rebound overshoot, and
  // f10-f11 carry the reland/shudder settle. No frozen frames anywhere.
  const attack = groundClip(root, bakeClip(root, 'attack', [
    { t: 0, pose: still, ease: 'inOut' },
    { t: 0.18, pose: gather, ease: 'inOut' },
    { t: 0.3375, pose: windMid, ease: 'inOut' }, // f3 lands exactly on this breakdown
    { t: 0.45, pose: rearUp, ease: 'inOut' },    // f4 lands exactly on the apex
    { t: 0.60, pose: rearUp2, ease: 'in' },    // moving hold trimmed to 0.18s
    { t: 0.775, pose: midDrop1, ease: 'in' },  // f7 just past: arms ~95 deg
    { t: 0.885, pose: midDrop2, ease: 'in' },  // f8 just past: near horizontal
    { t: 0.985, pose: slam, ease: 'out' },     // impact; f9 reads the overshoot
    { t: 1.07, pose: rebound, ease: 'out' },   // mass kicks back up
    { t: 1.18, pose: reland, ease: 'inOut' },  // f10: second smaller landing
    { t: 1.32, pose: shudder, ease: 'inOut' }, // f11: settling vibration
    { t: 1.52, pose: settle, ease: 'inOut' },
    { t: 1.8, pose: still },
  ]));

  return { root, clips: [idle, walk, attack], meta: { height: 1.55, name: 'Golem' } };
}
