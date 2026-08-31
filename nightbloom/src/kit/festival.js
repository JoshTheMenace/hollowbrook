import * as THREE from 'three';
import { shedRoof } from '../builders.js';
import {
  M, SINK, ASPECT, rng, bx, cyl, member, plank, addMesh, printed,
  lanternRig, asProp, rect,
} from './common.js';
import { festivalNobori, festivalBanner, stallPlate } from './signage.js';

/* ------------------------------------------------------------------ *
 * 宵祭 — the festival vocabulary: the drum tower, the stalls, the
 * lantern strings.
 *
 * This file and the shopfronts are the only places allowed to spend
 * amber (`M.amber` / PAL.accent).  Here it is the bunting, the nobori
 * and the stall plates — the loud things a festival is *for*.  Warm
 * PRACTICAL light (`M.glow`) is a different role and is not the accent:
 * see the note in common.js's TONE table.
 *
 * Every generator below faces LOCAL +Z, origin at ground, plan centre.
 * ------------------------------------------------------------------ */

/* ---- yagura ----------------------------------------------------------- */

function yaguraDims(o = {}) {
  const h = o.h ?? 6.9;                   // top of the frame; the roof adds ~0.95
  return {
    seed: o.seed ?? 1,
    ry: o.ry ?? 0,
    h,
    base: o.base ?? 3.7,                  // post centres at the ground
    top: o.top ?? 3.05,                   // post centres at the frame head
    deckY: o.deckY ?? 4.5,
  };
}

/**
 * 櫓 — the festival drum tower: four battered corner posts, three
 * horizontal levels with their diagonal braces, a plank deck at 4.5 m
 * with a waist rail, a ladder up the back face, an amber-and-paper
 * bunting skirt, two nobori on poles, four lanterns at the deck corners
 * and the taiko on its cradle at the top.  ~7.9 m to the finial.
 *
 * EVERY PART IS DERIVED FROM THE FRAME'S OWN JOINTS.  The posts batter
 * inward (3.7 m at the foot, 3.05 m at the head), so a rail, a brace or a
 * ladder stile placed from a remembered number is wrong at every level
 * but one; `half(y)` below is the single source of the frame's plan size
 * at any height, and nothing in this function measures the tower twice.
 *
 * `group.userData.parts.drum` is the drum's own Group — scale or rotate it
 * for a struck-drum reaction — and `userData.interact.hitbox` is the drum
 * BODY mesh, because the runtime raycasts hitboxes non-recursively and a
 * Group is never hit.
 */
export function yagura(opts = {}) {
  const D = yaguraDims(opts);
  const { h, base, top, deckY } = D;
  const r = rng(D.seed + 31);
  const g = new THREE.Group();

  /** Half the frame's plan size at height y — the tower's one dimension. */
  const half = (y) => (base / 2) + ((top - base) / 2) * (y / h);
  const corner = (sx, sz, y) => [sx * half(y), y, sz * half(y)];
  const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

  /* --- corner posts -------------------------------------------------- */
  const posts = CORNERS.map(([sx, sz]) => member(corner(sx, sz, -SINK), corner(sx, sz, h), 0.13, 6));
  addMesh(g, posts, M.cedarDark, { name: 'yagura-posts' });

  /* --- levels: rails all round, plus a brace per face ---------------- */
  const LEVELS = [1.5, 3.0, deckY, h];
  const frame = [];
  LEVELS.forEach((y, li) => {
    for (let i = 0; i < 4; i += 1) {
      const a = corner(CORNERS[i][0], CORNERS[i][1], y);
      const b = corner(CORNERS[(i + 1) % 4][0], CORNERS[(i + 1) % 4][1], y);
      frame.push(plank(a, b, 0.15, 0.15));
      if (li < LEVELS.length - 1) {
        // one diagonal per face per storey, alternating hand so the tower
        // is braced rather than decorated
        const y2 = LEVELS[li + 1];
        const a2 = corner(CORNERS[(i + 1) % 4][0], CORNERS[(i + 1) % 4][1], y2);
        const b2 = corner(CORNERS[i][0], CORNERS[i][1], y2);
        frame.push(member((li + i) % 2 ? a : b, (li + i) % 2 ? a2 : b2, 0.06, 5));
      }
    }
  });
  addMesh(g, frame, M.cedar, { name: 'yagura-frame' });

  /* --- deck ---------------------------------------------------------- */
  const dh = half(deckY);
  const deck = [];
  const nPlank = 11;
  for (let i = 0; i < nPlank; i += 1) {
    deck.push(bx((dh * 2) - 0.04, 0.09, ((dh * 2) - 0.06) / nPlank - 0.02, 0, deckY + 0.16, -dh + 0.03 + ((i + 0.5) * ((dh * 2) - 0.06)) / nPlank));
  }
  addMesh(g, deck, M.cedarPale, { name: 'yagura-deck' });

  /* --- waist rail round the deck ------------------------------------- */
  const rail = [];
  const railY = deckY + 1.05;
  for (let i = 0; i < 4; i += 1) {
    const a = corner(CORNERS[i][0], CORNERS[i][1], deckY);
    const b = corner(CORNERS[(i + 1) % 4][0], CORNERS[(i + 1) % 4][1], deckY);
    for (const t of [0.5]) {
      const px = a[0] + (b[0] - a[0]) * t;
      const pz = a[2] + (b[2] - a[2]) * t;
      rail.push(bx(0.09, 0.9, 0.09, px, deckY + 0.6, pz));
    }
    rail.push(plank([a[0], railY, a[2]], [b[0], railY, b[2]], 0.1, 0.09));
  }
  for (const [sx, sz] of CORNERS) rail.push(bx(0.1, 0.9, 0.1, sx * dh, deckY + 0.6, sz * dh));
  addMesh(g, rail, M.cedarDark, { name: 'yagura-rail' });

  /* --- ladder up the -z face, joint to joint ------------------------- */
  const ladder = [];
  const footZ = -half(0) - 0.55;
  const headZ = -half(deckY) - 0.06;
  for (const s of [-1, 1]) {
    ladder.push(member([s * 0.4, -SINK, footZ], [s * 0.4, deckY + 0.2, headZ], 0.07, 5));
  }
  const RUNGS = 10;
  for (let i = 1; i <= RUNGS; i += 1) {
    const t = i / (RUNGS + 1);
    const y = -SINK + (deckY + 0.2 + SINK) * t;
    const z = footZ + (headZ - footZ) * t;
    ladder.push(member([-0.4, y, z], [0.4, y, z], 0.045, 5));
  }
  addMesh(g, ladder, M.cedar, { name: 'yagura-ladder' });

  /* --- bunting skirt on the 3.0 m rail: amber and paper, alternating -- */
  const amberPanels = [];
  const paperPanels = [];
  const bY = 3.0;
  const bh = half(bY);
  for (let i = 0; i < 4; i += 1) {
    const a = corner(CORNERS[i][0], CORNERS[i][1], bY);
    const b = corner(CORNERS[(i + 1) % 4][0], CORNERS[(i + 1) % 4][1], bY);
    const ry = Math.atan2(b[0] - a[0], b[2] - a[2]);
    const N = 7;
    for (let k = 0; k < N; k += 1) {
      const t = (k + 0.5) / N;
      const px = a[0] + (b[0] - a[0]) * t;
      const pz = a[2] + (b[2] - a[2]) * t;
      const panel = bx((bh * 2) / N - 0.04, 0.46, 0.04, px, bY - 0.31, pz, { ry });
      (k % 2 ? amberPanels : paperPanels).push(panel);
    }
  }
  addMesh(g, amberPanels, M.amber, { cast: false, name: 'yagura-bunting-amber' });
  addMesh(g, paperPanels, M.paper, { cast: false, name: 'yagura-bunting-paper' });

  /* --- the taiko on its cradle --------------------------------------- */
  const drum = new THREE.Group();
  drum.name = 'yagura-drum';
  const body = new THREE.Mesh(cyl(0.5, 0.5, 0.68, 14, 0, 0, 0, { rx: Math.PI / 2 }), M.cedarDark);
  body.castShadow = true;
  body.name = 'yagura-drum-body';
  drum.add(body);
  const heads = [];
  for (const s of [-1, 1]) heads.push(cyl(0.53, 0.53, 0.07, 14, 0, 0, s * 0.36, { rx: Math.PI / 2 }));
  addMesh(drum, heads, M.paper, { name: 'yagura-drum-heads' });
  addMesh(drum, [
    cyl(0.545, 0.545, 0.06, 14, 0, 0, 0.2, { rx: Math.PI / 2 }),
    cyl(0.545, 0.545, 0.06, 14, 0, 0, -0.2, { rx: Math.PI / 2 }),
  ], M.joinery, { cast: false, name: 'yagura-drum-hoops' });
  drum.position.set(0, deckY + 0.83, 0);
  g.add(drum);
  const cradle = [];
  for (const s of [-1, 1]) {
    cradle.push(member([s * 0.62, deckY + 0.2, -0.42], [s * 0.16, deckY + 0.78, 0], 0.07, 5));
    cradle.push(member([s * 0.62, deckY + 0.2, 0.42], [s * 0.16, deckY + 0.78, 0], 0.07, 5));
  }
  addMesh(g, cradle, M.cedar, { name: 'yagura-cradle' });

  /* --- roof: a four-sided cap, faces square to the frame ------------- */
  const roofR = half(h) + 0.62;
  const roof = addMesh(g, [cyl(0.0, roofR * 1.42, 0.95, 4, 0, h + 0.5, 0, { ry: Math.PI / 4 })], M.tile, { name: 'yagura-roof' });
  roof.userData.airborne = true;
  addMesh(g, [cyl(0.08, 0.11, 0.34, 6, 0, h + 1.1, 0)], M.tilePale, { cast: false });

  /* --- nobori at two ground corners ---------------------------------- */
  const poles = [];
  for (const s of [-1, 1]) {
    const px = s * (base / 2 + 0.9);
    poles.push(cyl(0.06, 0.07, 3.4 + SINK, 6, px, (3.4 - SINK) / 2, base / 2 + 0.15));
    poles.push(bx(0.5, 0.06, 0.06, px + 0.24, 3.24, base / 2 + 0.15));
    const flag = printed(festivalNobori(), 0.46, ASPECT.nobori, { doubleSide: true });
    flag.position.set(px + 0.28, 3.2 - flag.userData.signH / 2, base / 2 + 0.15);
    g.add(flag);
  }
  addMesh(g, poles, M.cedar, { name: 'yagura-nobori-poles' });

  /* --- practicals: four lanterns hung off the deck rail -------------- */
  lanternRig(g, CORNERS.map(([sx, sz]) => [sx * (dh + 0.1), railY - 0.12, sz * (dh + 0.1)]),
    { r: 0.19, h: 0.4, radius: 6, name: 'yagura-lantern' });

  // seeded dressing: a couple of crates stacked at the foot
  const crates = [];
  for (let i = 0, n = r.int(1, 3); i < n; i += 1) {
    const cw = r.range(0.44, 0.6);
    crates.push(bx(cw, cw * 0.72, cw * 0.8, r.range(-base / 2, base / 2), (cw * 0.72) / 2 - SINK, base / 2 + r.range(0.5, 0.9), { ry: r.range(-0.5, 0.5) }));
  }
  addMesh(g, crates, M.cedarPale, { name: 'yagura-crates' });

  g.rotation.y = D.ry;
  g.userData.parts = { drum };
  return asProp(g, 'yagura', {
    joints: { deckY, ladderFoot: [0, 0, footZ], drum: [0, deckY + 0.83, 0], roofY: h + 0.95 },
    interact: { label: 'Strike the festival drum', verb: 'strike', hitbox: body },
  });
}

yagura.footprint = (o = {}) => {
  const D = yaguraDims(o);
  return [rect(0, 0, D.base / 2 + 0.2, D.base / 2 + 0.2, D.ry)];
};

/* ---- matsuriStall ----------------------------------------------------- */

const STALL_GOODS = Object.freeze([
  { title: '金魚すくい', sub: 'すくい' },
  { title: 'たこ焼', sub: '八個' },
  { title: '綿菓子', sub: 'わたあめ' },
  { title: '射的', sub: 'まと' },
  { title: '焼きとうもろこし', sub: '一本' },
]);

function matsuriStallDims(o = {}) {
  const seed = o.seed ?? 1;
  const r = rng(seed);
  return {
    seed,
    ry: o.ry ?? 0,
    w: o.w ?? 2.9,
    d: o.d ?? 1.9,
    shut: o.shut ?? false,
    goods: STALL_GOODS[o.goods ?? r.int(0, STALL_GOODS.length - 1)],
    counterH: 0.95,
    headY: 2.4,      // awning MID wall-top; the front eave lands at ~2.11 m
  };
}

/**
 * 屋台 — the festival stall, in two variants (`opts.shut`):
 *
 *   OPEN — counter, goods plate, a rail of hanging goods, a banner over
 *     the awning and two lanterns burning under it.
 *   SHUT — the same frame with its shutter boards dropped across the
 *     front, the goods gone, and one small lamp left on the corner post.
 *
 * The awning's front eave sits 2.11 m over the ground (derived from
 * shedRoof's own rake, not guessed), so the player walks up to the
 * counter without ducking.  `opts.goods` picks one of five stalls from
 * the plan's table; `opts.seed` picks it for you.
 */
export function matsuriStall(opts = {}) {
  const D = matsuriStallDims(opts);
  const { w, d, shut, goods, counterH, headY } = D;
  const r = rng(D.seed + 7);
  const g = new THREE.Group();
  const hw = w / 2;
  const zf = d / 2;

  /* --- frame: four posts, head plate, counter bearers ---------------- */
  const roof = shedRoof({ w: w + 0.5, d, pitch: 0.22, overhang: 0.35, thickness: 0.1, downhill: 'z+', mat: M.tilePale });
  roof.position.set(0, headY, 0);
  roof.userData.airborne = true;
  const { highWallY, lowWallY } = roof.userData;

  const cedar = [];
  for (const sx of [-1, 1]) {
    cedar.push(bx(0.12, headY + lowWallY + SINK, 0.12, sx * (hw - 0.06), (headY + lowWallY - SINK) / 2, zf - 0.06));
    cedar.push(bx(0.12, headY + highWallY + SINK, 0.12, sx * (hw - 0.06), (headY + highWallY - SINK) / 2, -zf + 0.06));
  }
  cedar.push(bx(w, 0.13, 0.12, 0, headY + lowWallY - 0.07, zf - 0.06));    // front head plate
  cedar.push(bx(w, 0.13, 0.12, 0, headY + highWallY - 0.07, -zf + 0.06));  // back head plate
  addMesh(g, cedar, M.cedar, { name: 'stall-frame' });
  g.add(roof);

  /* --- counter and its skirt ----------------------------------------- */
  const counter = addMesh(g, [
    bx(w + 0.24, 0.09, 0.62, 0, counterH, zf - 0.05),
    bx(w - 0.1, counterH - 0.1 + SINK, 0.14, 0, (counterH - 0.1 - SINK) / 2, zf - 0.3),
  ], M.cedarPale, { name: 'stall-counter' });
  addMesh(g, [bx(w, 0.44, 0.06, 0, counterH - 0.28, zf + 0.2)], M.amber, { cast: false, name: 'stall-apron' });

  /* --- back boards, so a stall is never see-through ------------------ */
  const backTop = headY + highWallY - 0.1;
  const back = [];
  for (let i = 0; i < 6; i += 1) back.push(bx(w / 6 - 0.02, backTop - 0.9, 0.05, -hw + w / 12 + (i * w) / 6, 0.9 + (backTop - 0.9) / 2, -zf + 0.03));
  addMesh(g, back, M.cedarDark, { name: 'stall-back' });

  /* --- the variant --------------------------------------------------- */
  const frontHead = headY + lowWallY - 0.14;
  if (shut) {
    const boards = [];
    const n = 5;
    for (let i = 0; i < n; i += 1) {
      const y0 = counterH + 0.06 + (i * (frontHead - counterH - 0.06)) / n;
      const y1 = counterH + 0.06 + ((i + 1) * (frontHead - counterH - 0.06)) / n;
      boards.push(bx(w - 0.06, y1 - y0 - 0.015, 0.05, 0, (y0 + y1) / 2, zf - 0.14));
    }
    addMesh(g, boards, M.cedarDark, { name: 'stall-shutters' });
    // a single night lamp left on the corner post
    lanternRig(g, [[hw - 0.12, frontHead - 0.06, zf - 0.16]], { r: 0.13, h: 0.28, radius: 3, name: 'stall-lantern' });
  } else {
    // goods rail with hanging stock, seeded
    addMesh(g, [bx(w - 0.2, 0.06, 0.06, 0, frontHead - 0.28, zf - 0.34)], M.cedar, { cast: false });
    const stock = [];
    const cords = [];
    for (let i = 0, n = r.int(4, 7); i < n; i += 1) {
      const x = -hw + 0.3 + (i * (w - 0.6)) / Math.max(1, n - 1);
      const drop = r.range(0.2, 0.44);
      cords.push(cyl(0.014, 0.014, drop, 5, x, frontHead - 0.31 - drop / 2, zf - 0.34));
      stock.push(bx(r.range(0.14, 0.22), r.range(0.16, 0.26), 0.09, x, frontHead - 0.31 - drop - 0.11, zf - 0.34));
    }
    addMesh(g, stock, M.paper, { cast: false, name: 'stall-goods' });
    addMesh(g, cords, M.joinery, { cast: false });
    lanternRig(g, [[-hw + 0.42, frontHead - 0.04, zf - 0.2], [hw - 0.42, frontHead - 0.04, zf - 0.2]],
      { r: 0.15, h: 0.32, radius: 4.5, name: 'stall-lantern' });
  }

  /* --- signage: the goods plate, and a banner over the awning -------- */
  const plate = printed(stallPlate(goods.title, goods.sub), 1.5, ASPECT.plate);
  plate.position.set(0, frontHead + 0.16, zf + 0.32);
  g.add(plate);
  addMesh(g, [bx(1.56, plate.userData.signH + 0.06, 0.05, 0, frontHead + 0.16, zf + 0.29)], M.cedarDark, { cast: false });

  const banner = printed(festivalBanner(), 0.8, ASPECT.noren, { doubleSide: true, transparent: true });
  banner.position.set(-hw + 0.05, frontHead + 0.62, zf + 0.34);
  banner.rotation.y = 0.12;
  g.add(banner);

  g.rotation.y = D.ry;
  return asProp(g, 'matsuriStall', {
    joints: { counter: [0, counterH, zf + 0.3], partyWest: [-hw, 0, 0], partyEast: [hw, 0, 0], headY: frontHead },
    interact: shut ? null : { label: `Look over the ${goods.title} stall`, verb: 'look', hitbox: counter },
  });
}

matsuriStall.footprint = (o = {}) => {
  const D = matsuriStallDims(o);
  return [rect(0, 0, D.w / 2 + 0.14, D.d / 2 + 0.2, D.ry)];
};
matsuriStall.GOODS = STALL_GOODS.length;

/* ---- lanternString ---------------------------------------------------- */

function lanternStringDims(o = {}) {
  const span = o.span ?? 9;
  return {
    seed: o.seed ?? 1,
    ry: o.ry ?? 0,
    span,
    height: o.height ?? 3.9,
    sag: o.sag ?? 0.85,
    count: o.count ?? Math.max(3, Math.round(span / 1.4)),
    masts: o.masts ?? true,
  };
}

/**
 * A catenary of paper lanterns, strung along LOCAL X from `−span/2` to
 * `+span/2` at `height`, sagging `sag` at midspan.  With `masts: true`
 * (the default) it brings its own two cedar poles and stands on the
 * ground; with `masts: false` it is pure rigging between two buildings and
 * the whole assembly is marked `airborne`, which is the ONLY honest way to
 * audit a thing that is hung rather than stood.
 *
 * EVERY LANTERN IS ITS OWN GLOW MESH with `userData.practical = true` —
 * merging them would give the game one light at the middle of the street
 * instead of twelve along it.  The cord is laid segment by segment between
 * sampled points on the curve, so it is a real sag rather than a straight
 * beam pretending.
 *
 * `userData.joints.west/east` are the two anchor points, so the next
 * string butts to this one instead of re-deriving the height.
 */
export function lanternString(opts = {}) {
  const D = lanternStringDims(opts);
  const { span, height, sag, count, masts } = D;
  const g = new THREE.Group();
  const hs = span / 2;
  /** The curve: a parabola through both anchors, `sag` low at midspan. */
  const yAt = (t) => height - sag * (1 - (2 * t - 1) ** 2);

  const cord = [];
  const SEG = Math.max(8, count * 2);
  for (let i = 0; i < SEG; i += 1) {
    const t0 = i / SEG;
    const t1 = (i + 1) / SEG;
    cord.push(member([-hs + span * t0, yAt(t0), 0], [-hs + span * t1, yAt(t1), 0], 0.022, 5));
  }
  addMesh(g, cord, M.joinery, { cast: false, name: 'string-cord' });

  const spots = [];
  for (let i = 0; i < count; i += 1) {
    const t = (i + 1) / (count + 1);
    spots.push([-hs + span * t, yAt(t) - 0.1, 0]);
  }
  lanternRig(g, spots, { r: 0.17, h: 0.36, cord: 0.1, radius: 5, name: 'string-lantern' });

  if (masts) {
    const mastTop = height + 0.22;
    const poles = [];
    for (const s of [-1, 1]) {
      poles.push(cyl(0.075, 0.095, mastTop + SINK, 7, s * hs, (mastTop - SINK) / 2, 0));
      poles.push(bx(0.34, 0.09, 0.09, s * (hs - 0.17), height, 0));
    }
    addMesh(g, poles, M.cedarDark, { name: 'string-masts' });
    addMesh(g, [-1, 1].map((s) => cyl(0.16, 0.2, 0.16, 8, s * hs, 0.08 - SINK, 0)), M.stone, { cast: false });
  }

  g.rotation.y = D.ry;
  return asProp(g, 'lanternString', {
    airborne: !masts,
    joints: { west: [-hs, height, 0], east: [hs, height, 0], lowY: height - sag },
  });
}

lanternString.footprint = (o = {}) => {
  const D = lanternStringDims(o);
  if (!D.masts) return [];
  return [-1, 1].map((s) => rect((s * D.span) / 2, 0, 0.2, 0.2, D.ry));
};
