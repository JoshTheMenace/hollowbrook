import * as THREE from 'three';
import { defineDistrict } from '../core/district.js';
import {
  M, SINK, rng, bx, cyl, member, addMesh, practical,
  canalKerb, footbridge, phonebox, postRack, rowhouse, stoneLantern,
} from '../kit/index.js';
import { wallRun, bench, leanTo, seatOnGround } from '../builders.js';

/* ------------------------------------------------------------------ *
 * 川端小路 — the canal lane.  The quiet south loop, where the town
 * actually lives: an irrigation channel laid ON the flat ground (kerbs
 * proud, water 0.10 m over the paving — never a terrain cut), two timber
 * footbridges over it, modest rowhouses facing the water from both
 * banks, and a phone box glowing at the lane's west end.
 *
 * Three things here are load-bearing and were reasoned to, not guessed:
 *
 * 1. THE CANAL IS BUILT IN THREE SEGMENTS with a gap at each bridge,
 *    because `canalKerb.footprint` INCLUDES the water — a continuous run
 *    is a continuous collider and every bridge over it is a bridge to
 *    nowhere.  The gaps are only 2.3 m (the bridge is 2.0 m wide), and a
 *    bed-and-water patch with NO collider is laid under each bridge so
 *    the channel still reads as one length of water.
 * 2. THE EAST BRIDGE IS OFFSET 0.6 m SOUTH of the canal centreline.  The
 *    plan's `canal-west` vista sights from (10, 1.8, 33) straight down
 *    the water to this district's `footbridge-west`, and a bridge centred
 *    on z 33 puts its crown post and its rail exactly on that line 26 m
 *    short of the subject.  Offset, the sight line passes over its rail
 *    with 0.11 m to spare; the deck still spans the channel and its
 *    abutments still land clear of both kerbs.
 * 3. THE WEST BRIDGE CARRIES A LAMP, and its height is a number rather
 *    than a taste: the vista's ray is aimed at the subject's bounding-box
 *    CENTRE, so the group's overall height sets the ray's rake.  At a
 *    3.02 m lamp top the ray leaves the camera at 1.8 m, clears the east
 *    bridge's rail, and lands in the middle of the west bridge's crown
 *    post — the subject's own geometry.  Shorten or raise that lamp and
 *    the vista either grazes the wrong bridge or sails over its own.
 * ------------------------------------------------------------------ */

const CZ = 33;                                   // canal centreline (world z)
const CANAL = { chan: 2.2, kerb: 0.44, kerbY: 0.3, waterY: 0.1 };
const HALF_W = CANAL.chan / 2 + CANAL.kerb;      // kerb outer edge, 1.54
const WB = { x: -28, z: 33 };                    // west footbridge — waypoint + interaction
const EB = { x: -2, z: 33.6 };                   // east footbridge (see note 2)
const BRIDGE = { span: 5.0, w: 2.0 };
const LAMP_TOP = 3.02;                           // see note 3

/** Register a kit prop's suggested colliders, offset to where it stands. */
function collideAt(ctx, rects, x, z) {
  for (const r of rects) ctx.collide(x + r.x0, z + r.z0, x + r.x1, z + r.z1);
}

/** Stand a kit assembly on the ground at (x, z) and hand it to ctx. */
function stand(ctx, group, x, z, name) {
  group.position.set(x, ctx.groundAt(x, z), z);
  return ctx.add(group, name);
}

/** One flat koi silhouette lying just under the water plane. */
function koiGeoms(x, z, ry, len) {
  const body = new THREE.CylinderGeometry(0.5, 0.5, 0.03, 8);
  body.scale(len, 1, len * 0.34);
  const tail = new THREE.CylinderGeometry(0, 0.5, 0.03, 3);
  tail.scale(len * 0.42, 1, len * 0.36);
  tail.rotateY(-Math.PI / 2);
  tail.translate(-len * 0.52, 0, 0);
  return [body, tail].map((g) => g.rotateY(ry).translate(x, 0, z));
}

export default defineDistrict({
  id: 'canal-lane',
  envelope: { x0: -45, z0: 16, x1: 18, z1: 50 },

  build(ctx) {
    const r = rng(91);

    /* ---- 1. the lanes, laid as paving on the terrain ----------------- */
    // Thin dressing (35 mm), never a platform: the ground is the terrain's
    // and a district plate here is the floating-slab defect.
    const paving = [
      bx(50, 0.035, 1.85, -17, 0.0175, 30.42),        // north bank lane
      bx(50, 0.035, 1.95, -17, 0.0175, 35.65),        // south bank lane
      bx(3.2, 0.035, 13.8, -8, 0.0175, 22.9),         // from the market socket
      bx(10, 0.035, 2.9, 13, 0.0175, 21),             // out to the festival ground
      bx(3.0, 0.035, 10.5, 7.5, 0.0175, 25.8),        // the east elbow
      bx(3.0, 0.035, 9.0, -40, 0.0175, 40.5),         // down to the phone box
    ];
    addMesh(ctx.add(new THREE.Group(), 'lanes'), paving, M.plaster,
      { cast: false, name: 'lane-paving' });

    /* ---- 2. the canal ------------------------------------------------ */
    // Segment ends are the bridge gaps: 2.3 m clear against a 2.0 m deck.
    const canal = ctx.add(new THREE.Group(), 'canal');
    const SEGS = [
      { x0: -42, x1: -29.15, seed: 3, stepSide: 1 },
      { x0: -26.85, x1: -3.15, seed: 7, stepSide: -1 },
      { x0: -0.85, x1: 8, seed: 11, stepSide: 1 },
    ];
    for (const s of SEGS) {
      const opts = { ...CANAL, seed: s.seed, len: s.x1 - s.x0, stepSide: s.stepSide };
      const cx = (s.x0 + s.x1) / 2;
      const run = canalKerb(opts);
      run.position.set(cx, ctx.groundAt(cx, CZ), CZ);
      canal.add(run);
      collideAt(ctx, canalKerb.footprint(opts), cx, CZ);
    }

    // Bed and water carried THROUGH each bridge gap — no collider, so the
    // deck above it is the only way across, and the channel still reads as
    // one length of water rather than three ponds.
    const culvertBed = [];
    const culvertWater = [];
    for (const b of [WB, EB]) {
      const len = 2.3;
      culvertBed.push(bx(len, 0.06 + SINK, CANAL.chan, b.x, (0.06 - SINK) / 2, CZ));
      culvertWater.push(bx(len, 0.02, CANAL.chan - 0.06, b.x, CANAL.waterY - 0.01, CZ));
    }
    addMesh(canal, culvertBed, M.stoneDeep, { cast: false, name: 'culvert-bed' });
    addMesh(canal, culvertWater, M.water, { cast: false, receive: false, name: 'culvert-water' });

    // the head wall where the channel is fed, closing the east end
    addMesh(canal, [
      bx(0.5, 0.62 + SINK, HALF_W * 2, 8.25, (0.62 - SINK) / 2, CZ),
      bx(0.62, 0.08, HALF_W * 2 + 0.12, 8.25, 0.64, CZ),
    ], M.stone, { name: 'canal-head' });
    ctx.collide(7.95, CZ - HALF_W, 8.55, CZ + HALF_W);

    /* ---- 3. the koi, and the ripple they make ------------------------ */
    // The koi sit 6 mm OVER the water plane, not under it: the kit's water
    // is 86 % opaque, so a koi laid beneath it is invisible — which is the
    // whole point of the thing gone.  Dark shapes ON the surface read as
    // fish hanging in the bridge's shade, which is what a koi shadow is.
    const koiGroup = new THREE.Group();
    const fish = [
      ...koiGeoms(-29.7, 32.7, 0.32, 0.62),
      ...koiGeoms(-28.9, 33.4, -0.22, 0.54),
      ...koiGeoms(-28.1, 32.85, 0.14, 0.48),
    ].map((g) => g.translate(0, CANAL.waterY + 0.006, 0));
    addMesh(koiGroup, fish, M.stoneDeep, { cast: false, receive: false, name: 'koi' });
    canal.add(koiGroup);

    const ripple = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.46, 22).rotateX(-Math.PI / 2),
      M.stonePale,
    );
    ripple.position.set(-28.9, CANAL.waterY + 0.008, 33.2);
    ripple.name = 'koi-ripple';
    ripple.castShadow = false;
    ripple.receiveShadow = false;
    ripple.visible = false;
    ripple.userData.airborne = true;
    canal.add(ripple);

    /* ---- 4. the footbridges ------------------------------------------ */
    // surfaces() -> platforms (one per deck segment, or the player walks on
    // air over both approaches); footprint() -> colliders (the parapets
    // only — a box round a bridge is a bridge you cannot cross).
    const bridgeAt = (b, opts, name) => {
      const o = { ry: Math.PI / 2, ...BRIDGE, ...opts };
      const deck = footbridge(o);
      deck.position.set(b.x, ctx.groundAt(b.x, b.z), b.z);
      const holder = new THREE.Group();
      holder.add(deck);
      collideAt(ctx, footbridge.footprint(o), b.x, b.z);
      for (const s of footbridge.surfaces(o)) {
        ctx.platform(b.x + s.x0, b.z + s.z0, b.x + s.x1, b.z + s.z1, s.top);
      }
      ctx.add(holder, name);
      return holder;
    };

    const west = bridgeAt(WB, { seed: 3 }, 'footbridge-west');
    bridgeAt(EB, { seed: 8, camber: 0.36, abut: 0.22 }, 'footbridge-east');

    // the bridge lamp — the lane's beacon at dusk, and the height that
    // makes the plan's canal-west vista land on this bridge (note 3)
    const lx = WB.x + BRIDGE.w / 2 - 0.06;           // on the crown rail post
    addMesh(west, [
      bx(0.09, 1.06, 0.09, lx, 2.19, WB.z),
      bx(0.2, 0.06, 0.2, lx, 2.65, WB.z),
      bx(0.36, 0.07, 0.36, lx, LAMP_TOP - 0.035, WB.z),
    ], M.cedarDark, { name: 'bridge-lamp-post' });
    const lampGlow = addMesh(west, [bx(0.26, 0.3, 0.26, lx, 2.83, WB.z)], M.glow,
      { cast: false, receive: false, name: 'bridge-lamp' });
    practical(lampGlow, { radius: 6 });

    // the feed box on the far rail — the koi interaction's hitbox
    const fx = WB.x - BRIDGE.w / 2 + 0.06;
    const feedBox = addMesh(west, [
      bx(0.34, 0.26, 0.3, fx, 1.79, WB.z),
      bx(0.4, 0.05, 0.36, fx, 1.945, WB.z),
    ], M.cedarDark, { name: 'koi-feed-box' });

    /* ---- 5. feed the koi from the west footbridge --------------------- */
    let t = -1;                                    // <0 idle, else seconds in
    const DART = [-0.55, 0.42];                    // the jump, in x and z
    ctx.interact({
      name: 'feed-koi',
      label: 'Feed the koi',
      verb: 'feed',
      hitbox: feedBox,
      action() {
        t = 0;
        koiGroup.position.set(DART[0], 0, DART[1]);
        ripple.scale.setScalar(0.35);
        ripple.visible = true;
      },
    });
    ctx.update((dt) => {
      if (t < 0) return;
      t += dt;
      const k = Math.min(t / 1.4, 1);
      const ease = 1 - (1 - k) * (1 - k);
      koiGroup.position.set(DART[0] * (1 - ease), 0, DART[1] * (1 - ease));
      ripple.scale.setScalar(0.35 + 2.5 * ease);
      if (k >= 1) { t = -1; ripple.visible = false; }
    });
    ctx.reset(() => {
      t = -1;
      koiGroup.position.set(0, 0, 0);
      ripple.visible = false;
    });

    /* ---- 6. the rowhouses, facing the water from both banks ---------- */
    // North bank frontages on z 28.2, south bank on z 38.2: the lane
    // between the house line and the kerb is then 2.6 m and 3.0 m of clear
    // walking, which is what a lantern or a bench standing in it needs.
    const VAR = [{ d: 5.6 }, { d: 5.0 }, { d: 6.0 }];
    const HOUSES = [
      { x: -24.5, variant: 1, seed: 12, bank: 'n' },
      { x: -17.5, variant: 0, seed: 5, bank: 'n' },
      { x: -11.6, variant: 2, seed: 23, bank: 'n' },
      { x: -4.5, variant: 0, seed: 44, bank: 'n' },
      { x: -35, variant: 0, seed: 9, bank: 's' },
      { x: -21, variant: 1, seed: 17, bank: 's' },
      { x: 4, variant: 2, seed: 31, bank: 's' },
    ];
    const homes = ctx.add(new THREE.Group(), 'rowhouses');
    let litHouse = null;
    for (const h of HOUSES) {
      const north = h.bank === 'n';
      const d = VAR[h.variant].d;
      const z = north ? 28.2 - d / 2 : 38.2 + d / 2;
      const opts = { seed: h.seed, variant: h.variant, ry: north ? 0 : Math.PI };
      const g = rowhouse(opts);
      g.position.set(h.x, ctx.groundAt(h.x, z), z);
      homes.add(g);
      collideAt(ctx, rowhouse.footprint(opts), h.x, z);
      if (h.x === -21) litHouse = { x: h.x, z, d };
    }

    // laundry in, evening settling: ONE window lit behind its shutter
    const pane = addMesh(homes, [bx(0.86, 0.74, 0.06, litHouse.x + 1.2, 1.55, litHouse.z - litHouse.d / 2 - 0.04)],
      M.glow, { cast: false, receive: false, name: 'lit-window' });
    practical(pane, { radius: 4.5 });

    /* ---- 7. the phone box at the lane's end -------------------------- */
    // 1.2 m west of the waypoint, door facing east onto it: a quest prop
    // you can stand in front of, not one you stand inside.
    const pbOpts = { seed: 4, ry: Math.PI / 2 };
    const pb = phonebox(pbOpts);
    stand(ctx, pb, -41.2, 44, 'phone-box');
    collideAt(ctx, phonebox.footprint(pbOpts), -41.2, 44);
    let ring = -1;
    ctx.interact({
      name: 'phone-box',
      label: pb.userData.interact.label,
      verb: 'use',
      hitbox: pb.userData.interact.hitbox,
      action() { ring = 0; },
    });
    const phoneLamp = pb.getObjectByName('phonebox-lamp');
    ctx.update((dt) => {
      if (ring < 0) return;
      ring += dt;
      if (phoneLamp) phoneLamp.visible = Math.floor(ring * 5) % 2 === 0;
      if (ring > 2) { ring = -1; if (phoneLamp) phoneLamp.visible = true; }
    });
    ctx.reset(() => { ring = -1; if (phoneLamp) phoneLamp.visible = true; });

    /* ---- 8. lanterns, a bench, the bicycles -------------------------- */
    const TORO = [
      { x: -30.6, z: 30.5, size: 'large', seed: 2 },   // west bridge, north head
      { x: -25.4, z: 35.6, size: 'large', seed: 6 },   // west bridge, south head
      { x: -42.2, z: 41.5, size: 'small', seed: 14 },  // the phone box corner
      { x: 6, z: 31, size: 'large', seed: 21 },        // the canal head
    ];
    for (const [i, l] of TORO.entries()) {
      const opts = { seed: l.seed, size: l.size, ry: r.range(-0.4, 0.4) };
      const g = stoneLantern(opts);
      stand(ctx, g, l.x, l.z, `lantern-${i}`);
      collideAt(ctx, stoneLantern.footprint(opts), l.x, l.z);
    }

    ctx.add(bench({
      w: 1.6, at: [-24, 0, 35.9], facing: [0, -1], mat: M.cedar, ctx,
    }), 'canal-bench');

    // the wood store on the south bank, open to the water: the long gap
    // between the two south rowhouses is the district's one blank stretch
    // and a shelter fills it for a fraction of a house's meshes
    // Boarded in mid cedar, not cedarDark: from the south lane this shelter
    // is 6 m from the eye and a dark board wall at that range reads as one
    // unrelieved black slab — the district's own value floor, standing in
    // front of everything the frame is about.
    const store = leanTo({
      w: 3.0, d: 2.2, h: 2.05, open: 'x+', at: [-9.5, ctx.groundAt(-9.5, 38.9), 38.9],
      mat: M.cedar, roofMat: M.tilePale, ctx,
    });
    // opening turned to face EAST, up the lane: both the south-bank walk
    // and the plan's canal-west vista arrive from that side, and an
    // open-fronted shelter presented back-on is just a board wall.
    addMesh(store, [
      bx(0.26, 0.26, 1.5, -0.9, 0.15, -0.1, { rx: 0.1 }),
      bx(0.26, 0.26, 1.5, -0.6, 0.42, -0.05, { rx: -0.08 }),
      bx(0.26, 0.26, 1.4, 0.8, 0.15, 0, { rx: 0.06 }),
    ], M.cedarDark, { name: 'stacked-wood' });
    ctx.add(store, 'wood-store');

    const rackOpts = { seed: 6, ry: Math.PI / 2, slots: 4 };
    const rack = postRack(rackOpts);
    stand(ctx, rack, -29.6, 27.2, 'bicycle-rack');
    collideAt(ctx, postRack.footprint(rackOpts), -29.6, 27.2);

    /* ---- 9. the ten-minutes-ago layer -------------------------------- */
    // Each of these is its OWN tagged unit.  Grouping the district's
    // scatter under one `prop` makes a single audit unit whose AABB spans
    // half the parcel, and it then "overlaps" every building it reaches
    // over — the bbox is the unit, so a sprawling unit is a sprawling bug.
    const scatter = (name, x, z) => {
      const g = new THREE.Group();
      g.userData.prop = true;
      seatOnGround(g, (px, pz) => ctx.groundAt(px, pz), { sink: 0 });
      ctx.add(g, name);
      return g;
    };

    // laundry poles: bare but for one towel — nothing shaped like a person
    for (const [i, [px, z0, z1, towel]] of [[-30, 38.9, 41.4, true], [-13.5, 39.2, 41.2, false]].entries()) {
      const line = scatter(`laundry-${i}`, px, (z0 + z1) / 2);
      const poles = [];
      for (const pz of [z0, z1]) {
        poles.push(cyl(0.05, 0.06, 1.86 + SINK, 6, px, (1.86 - SINK) / 2, pz));
        poles.push(cyl(0.05, 0.05, 0.5, 6, px, 1.7, pz + (pz === z0 ? 0.24 : -0.24), { rx: Math.PI / 2 }));
      }
      poles.push(member([px, 1.78, z0], [px, 1.78, z1], 0.035, 6));
      addMesh(line, poles, M.cedarDark, { name: 'laundry-poles' });
      if (towel) addMesh(line, [bx(0.04, 0.62, 0.44, px, 1.45, (z0 + z1) / 2 - 0.3)], M.paper, { name: 'laundry-towel' });
    }

    // watering can, set down clear of the genkan it belongs to
    const can = scatter('watering-can', -15.8, 29.4);
    addMesh(can, [
      cyl(0.15, 0.17, 0.3, 8, -15.8, 0.15 - SINK, 29.4),
      cyl(0.03, 0.05, 0.34, 6, -15.5, 0.28, 29.55, { rz: -0.7 }),
      member([-15.8, 0.32, 29.27], [-15.8, 0.32, 29.53], 0.02, 5),
    ], M.stoneDeep, { name: 'watering-can' });

    // the fence between the two south yards, with a cat-sized gap at the
    // foot: the paling above it is there, the bottom 0.30 m is not
    const fence = scatter('yard-fence', -16.6, 41.3);
    const palings = [];
    const fx0 = -16.6;
    for (let i = 0; i < 14; i += 1) {
      const pz = 38.6 + i * 0.42;
      const gap = i === 6 || i === 7;               // the gap the cat uses
      palings.push(bx(0.06, gap ? 0.82 : 1.12 + SINK, 0.24, fx0, gap ? 0.71 : (1.12 - SINK) / 2, pz));
    }
    palings.push(member([fx0, 0.5, 38.4], [fx0, 0.5, 44.2], 0.035, 5));
    palings.push(member([fx0, 1.06, 38.4], [fx0, 1.06, 44.2], 0.035, 5));
    for (const pz of [38.4, 44.2]) palings.push(bx(0.13, 1.3 + SINK, 0.13, fx0, (1.3 - SINK) / 2, pz));
    addMesh(fence, palings, M.cedarDark, { name: 'yard-fence' });
    ctx.collide(fx0 - 0.12, 38.35, fx0 + 0.12, 44.25);

    /* ---- 10. the socket mouths --------------------------------------- */
    // cl-lane-n (-8, 16), a 4 m path down from the market: a low wall
    // turning the corner on each side, 5 m of clear mouth between them.
    // Both runs stop clear of the rowhouse EAVES (0.5 m past the wall
    // line) — the overlap test is a bbox test and an eave is in the box.
    const wallOpts = { h: 0.95, thick: 0.34, mat: M.stone, copingMat: M.stonePale, ctx };
    ctx.add(wallRun({ points: [[-16.2, 21.6], [-16.2, 19.2], [-10.6, 19.2]], ...wallOpts }), 'wall-lane-w');
    ctx.add(wallRun({ points: [[-5.6, 19.2], [-2.2, 19.2], [-2.2, 21.3]], ...wallOpts }), 'wall-lane-e');
    // cl-field-e (18, 21), a 3 m path out to the festival ground
    ctx.add(wallRun({ points: [[18, 18.7], [11.5, 18.7]], ...wallOpts }), 'wall-field-n');
    ctx.add(wallRun({ points: [[18, 23.6], [12.5, 23.6]], ...wallOpts }), 'wall-field-s');

    for (const [i, [hx, hz, hw]] of [[-12.6, 20.8, 1.5], [-4.2, 20.4, 1.3]].entries()) {
      const hedge = scatter(`hedge-${i}`, hx, hz);
      const lumps = [];
      for (let k = 0; k < 3; k += 1) {
        lumps.push(cyl(hw * 0.42, hw * 0.5, 0.9 + SINK, 7,
          hx + r.range(-0.45, 0.45), (0.9 - SINK) / 2, hz + r.range(-0.35, 0.35)));
      }
      addMesh(hedge, lumps, M.moss, { name: 'hedge' });
      ctx.collide(hx - hw * 0.7, hz - hw * 0.6, hx + hw * 0.7, hz + hw * 0.6);
    }
  },
});
