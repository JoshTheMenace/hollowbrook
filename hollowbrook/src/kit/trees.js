import * as THREE from 'three';
import { M } from './mats.js';
import { bx, cyl, tubeGeo, parts, mergeParts, rng, pushQuadUV, polyGeometryUV, tagProp } from './util.js';

/* ------------------------------------------------------------------ *
 * TREES — half of what makes a village read as a fantasy village.
 *
 * THE GREEN'S GREAT OAK is a named vista subject: the whole town is seen
 * past it from the knoll. It gets its own generator and its own budget.
 * Everything else — the orchard on the knoll's skirt, the graveyard yews,
 * the hedgerow trees on the moor — comes from `treeStand`, which builds
 * MANY trees into ONE pooled set.
 *
 * That distinction is a mesh-budget decision, not an aesthetic one. A tree
 * built as its own group is four meshes; forty of them is a hundred and
 * sixty draw calls and a district's entire allowance. `treeStand` merges
 * every trunk and limb in the stand into ONE bark mesh and every canopy
 * blob into ONE mesh per green tone — so a twenty-tree orchard on level
 * ground costs three meshes, the same as one tree.
 *
 * (It emits one such set per HALF-METRE BAND OF GROUND the stand covers;
 * see `treeStand`'s own note. On level ground that is one band.)
 *
 * ------------------------------------------------------------------
 * TWO RULES, and the second one has cost this project a whole round.
 * ------------------------------------------------------------------
 *
 * 1. A LIMB IS DRAWN BETWEEN TWO JOINTS. Never a length and an angle.
 *    Every branch here is `tubeGeo(base, tip)` with `tip = base + dir *
 *    len`, `dir` a unit vector built from two angles — so a limb's far end
 *    is a POINT, and the blob hung on it is hung on that same point.
 *
 *    The flagship this pipeline descends from computed a trunk's tip as
 *    `x + sin(leanDir) * lean * trunkH * 0.9`, hand-deriving the effect of
 *    a rotation applied about a part's own CENTRE. Sin and cos were
 *    swapped and the 0.9 stood where a half-height belonged, so every limb
 *    and every canopy blob in that world was planted 0.4 m from a trunk top
 *    0.17 m across, at ninety degrees to the lean, in a different direction
 *    per tree. It rendered fine. Derive tips as points, or apply the
 *    rotation to the offset with `applyEuler` — never do the trigonometry
 *    by hand.
 *
 * 2. NO CANOPY MAY `receiveShadow`. A cel ramp only shapes DIRECT light,
 *    so where the shadow map zeroes the sun a blob falls back to ambient —
 *    and a big tree self-shadows heavily, so what you get is a handful of
 *    ISOLATED blobs on one canopy going almost black while the rest of the
 *    tree looks fine. The symptom is reported as "round dark circles
 *    hanging in the sky next to a tree". Every canopy here is
 *    `receiveShadow = false` and casts normally.
 * ------------------------------------------------------------------ */

const TAU = Math.PI * 2;

/** A unit direction from an azimuth and an elevation, both in radians.
 *  This is the whole of the joint discipline above: a limb's direction is
 *  a VECTOR, and its tip is base + dir * len. */
const dirOf = (az, el) => new THREE.Vector3(
  Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az),
);

/**
 * A tapered, curving trunk as loose geometry, with a root flare at the
 * foot. Returns `{ geo, topAt, ringAt }` — `topAt` is the actual point the
 * trunk ends at, which is what the limbs are grown from.
 */
function trunkGeo({ r0, r1, h, seg = 9, levels = 6, lean = [0, 0], flare = 0.5, seed = 'trunk' }) {
  const rr = rng(seed);
  const ph = rr.range(0, 6.28);
  const rings = [];
  for (let i = 0; i <= levels; i += 1) {
    const t = i / levels;
    // the flare: a trunk swells where it meets the ground, and that swell
    // is most of what makes a big tree look heavy
    const swell = 1 + flare * Math.pow(1 - t, 2.2);
    const rad = (r0 + (r1 - r0) * t) * swell;
    const cx = lean[0] * Math.pow(t, 1.5) + Math.sin(t * 3.4 + ph) * r0 * 0.28;
    const cz = lean[1] * Math.pow(t, 1.5) + Math.cos(t * 2.7 + ph) * r0 * 0.24;
    const ring = [];
    for (let k = 0; k < seg; k += 1) {
      const a = (k / seg) * TAU;
      // a trunk is not round: a seeded per-facet bulge is what gives it bark
      const b = 1 + Math.sin(a * 3 + t * 2 + ph) * 0.09;
      ring.push([cx + Math.cos(a) * rad * b, h * t, cz + Math.sin(a) * rad * b]);
    }
    rings.push({ ring, cx, cz, y: h * t, rad });
  }
  const pos = [];
  const uvs = [];
  for (let i = 0; i < levels; i += 1) {
    const A = rings[i];
    const B = rings[i + 1];
    for (let k = 0; k < seg; k += 1) {
      const j = (k + 1) % seg;
      pushQuadUV(pos, uvs, A.ring[k], A.ring[j], B.ring[j], B.ring[k],
        [(k / seg) * 3, A.y / 1.6], [((k + 1) / seg) * 3, A.y / 1.6],
        [((k + 1) / seg) * 3, B.y / 1.6], [(k / seg) * 3, B.y / 1.6],
        [(A.cx + B.cx) / 2, (A.y + B.y) / 2, (A.cz + B.cz) / 2], true);
    }
  }
  const top = rings[rings.length - 1];
  return {
    geo: polyGeometryUV(pos, uvs),
    topAt: new THREE.Vector3(top.cx, top.y, top.cz),
    topR: top.rad,
    ringAt: (t) => rings[Math.max(0, Math.min(levels, Math.round(t * levels)))],
  };
}

/**
 * Grow limbs from a trunk top and collect the canopy anchor points.
 * Returns `{ geo: [], blobs: [{ p: Vector3, r: number }] }`.
 */
function limbs({ from, r, seed, count = 5, len, taper = 0.62, depth = 2, spread = 0.9, up = 0.75 }) {
  const rr = rng(seed);
  const geo = [];
  const blobs = [];
  const grow = (base, radius, length, level, az0) => {
    const n = level === 0 ? count : rr.int(2, 3);
    for (let i = 0; i < n; i += 1) {
      const az = az0 + (i / n) * TAU + rr.range(-0.4, 0.4);
      // a limb rises steeply near the trunk and flattens as it reaches out
      const el = up * (level === 0 ? rr.range(0.55, 1.0) : rr.range(0.3, 0.85));
      const dir = dirOf(az, el * (1 - spread * 0.35));
      const L = length * rr.range(0.8, 1.15);
      const tip = base.clone().addScaledVector(dir, L);
      geo.push(tubeGeo(base.toArray(), tip.toArray(), radius, 6));
      if (level + 1 >= depth) {
        // the canopy hangs on the TIP, which is a point, not a guess
        blobs.push({ p: tip, r: L * 0.62 });
        blobs.push({ p: base.clone().lerp(tip, 0.62), r: L * 0.5 });
      } else {
        grow(tip, radius * taper, L * 0.62, level + 1, az + 0.7);
      }
    }
  };
  grow(from, r, len, 0, rr.range(0, TAU));
  return { geo, blobs };
}

/**
 * THE CROWN. Blobs filling an ellipsoid about a centre, shell-biased and
 * with more mass above the equator than below — which is what a canopy is.
 *
 * TWO NUMBERS DECIDE WHETHER THIS READS AS FOLIAGE OR AS BOULDERS, and the
 * first pass got both wrong:
 *
 *  - THE BLOB MUST BE SMALL AGAINST THE CROWN. At `size = rx * 0.42` the
 *    eye reads the UNIT and a tree is a bunch of balloons; at `rx * 0.2` it
 *    reads the MASS. The flagship hit this exact wall building a willow and
 *    wrote it down: "a frond has to be small enough that the eye reads the
 *    mass rather than the unit".
 *  - THE CROWN MUST HAVE VERTICAL EXTENT. Hanging blobs off limb tips alone
 *    puts every one of them at the same height, because a limb's secondaries
 *    all reach outward at once — and what comes back is a PARASOL: a bare
 *    trunk with a flat green plate on it. (Measured on the first render:
 *    every orchard, hedgerow and birch tree in the stand.) The crown is an
 *    ellipsoid first and the limb tips only add lobes to its edge.
 */
function crown(rr, c, rx, ry, n, size, out) {
  for (let i = 0; i < n; i += 1) {
    const az = rr.range(0, TAU);
    // -0.62..1 in sine, so the mass sits above the equator as a canopy does
    const el = Math.asin(rr.range(-0.62, 1.0));
    const t = Math.pow(rr.range(0.18, 1), 0.5);     // shell-biased
    out.push({
      x: c[0] + Math.cos(el) * Math.sin(az) * rx * t,
      y: c[1] + Math.sin(el) * ry * t,
      z: c[2] + Math.cos(el) * Math.cos(az) * rx * t,
      s: size * rr.range(0.74, 1.34),
      f: rr.range(0.76, 1.02),
      ry: rr.range(0, TAU),
      rx: rr.range(-0.45, 0.45),
      tone: rr.next(),
    });
  }
}

/** A smaller cluster hung on one limb tip, so the crown's edge is LOBED
 *  rather than a clean ellipsoid. A perfect ellipsoid of blobs is a shrub
 *  however big you make it. */
function lobe(rr, anchor, radius, n, out) {
  for (let i = 0; i < n; i += 1) {
    const az = rr.range(0, TAU);
    const el = rr.range(-0.6, 0.9);
    const d = radius * Math.pow(rr.range(0, 1), 0.5);
    out.push({
      x: anchor.x + Math.cos(el) * Math.sin(az) * d,
      y: anchor.y + Math.sin(el) * d * 0.8,
      z: anchor.z + Math.cos(el) * Math.cos(az) * d,
      s: radius * rr.range(0.3, 0.5),
      f: rr.range(0.76, 1.0),
      ry: rr.range(0, TAU),
      rx: rr.range(-0.45, 0.45),
      tone: rr.next(),
    });
  }
}

/* The canopy blob. Detail 0 is a twenty-triangle icosahedron and detail 1
 * is eighty: the hero oak gets the smoother one, a stand of twenty orchard
 * trees does not. Both are non-indexed with face normals, which is what a
 * cel ramp wants — a smooth-shaded blob has no facets to quantise and reads
 * as a billiard ball. */
const BLOB = [new THREE.IcosahedronGeometry(1, 0), new THREE.IcosahedronGeometry(1, 1)];

/**
 * Add a blob cloud to a `parts()` collector, one merged geometry per tone.
 *
 * MERGED, NOT INSTANCED — and that is a correctness decision, not a
 * performance one. Draw calls are identical either way (one per tone), but
 * the spatial audit reads triangles through `mesh.matrixWorld` and knows
 * nothing about per-instance matrices: an InstancedMesh of ninety blobs
 * registers as ONE two-metre ball at the group's origin. In a stand placed
 * in world coordinates that origin is (0, 0, 0) — a phantom sphere in the
 * middle of the town, corrupting every base-line fit and every ground ray
 * that passes near it. (Measured: it reported a correctly seated hedge as
 * buried by 1.15 m, and the ball was nowhere near the hedge.)
 *
 * `receiveShadow` is FALSE on every canopy mesh. See rule 2 at the head of
 * this file.
 */
function canopyPool(blobs, tones, P, detail = 0) {
  const base = BLOB[detail];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (const b of blobs) {
    const i = Math.min(tones.length - 1, Math.floor(b.tone * tones.length));
    const g = base.clone();
    e.set(b.rx, b.ry, 0);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(b.x, b.y, b.z), q, new THREE.Vector3(b.s, b.s * b.f, b.s));
    g.applyMatrix4(m);
    P.add(tones[i], g);
  }
}

/**
 * THE GREAT OAK. The green's centre, and a named landmark that has to read
 * from the knoll a hundred metres away and from directly under it.
 *
 * Four meshes: one merged bark mesh (trunk, every limb, the root flare)
 * and three instanced canopy meshes, one per green tone.
 *
 * @param {object} o
 * @param {number} [o.h]       height to the top of the canopy
 * @param {number} [o.spread]  canopy diameter — an oak is WIDER than it is
 *                             tall, and getting that wrong is the single
 *                             thing that stops a big tree reading as old
 * @param {number} [o.density] blobs per lobe; 9-14 reads, 4 is a bush
 * @param {boolean} [o.swing]  a rope swing hung from one limb
 */
export function bigTree({
  seed = 'oak', h = 11, spread = 10.5, trunkR = 0.62, density = 11, limbCount = 6,
  tones = null, lean = null, roots = true, swing = false, hollow = false,
} = {}) {
  const rr = rng(seed).fork('shape');
  const group = new THREE.Group();
  const P = parts();
  const T = tones ?? [M.leafDeep, M.leaf, M.leafLight];
  const ln = lean ?? [rr.range(-1, 1) * 0.35, rr.range(-1, 1) * 0.35];

  const trunkH = h * 0.38;                       // an oak breaks low
  const tr = trunkGeo({
    r0: trunkR, r1: trunkR * 0.72, h: trunkH, seg: 10, levels: 6,
    lean: ln, flare: 0.62, seed: `${seed}-trunk`,
  });
  P.add(M.bark, tr.geo);

  if (roots) {
    // root buttresses: short tapered members from the flare out to the
    // ground, each one a member between two real points
    const nr = 6;
    for (let i = 0; i < nr; i += 1) {
      const a = (i / nr) * TAU + rr.range(-0.25, 0.25);
      const base = new THREE.Vector3(0, 0.62, 0);
      const outR = trunkR * rr.range(1.7, 2.6);
      // the tip stops just ABOVE the ground, not below it: a tube's cap is
      // its full radius, so a root ending at y = -0.1 puts the mesh 0.28 m
      // under the turf and the audit reads the whole tree as buried
      const tip = new THREE.Vector3(Math.sin(a) * outR, trunkR * 0.32, Math.cos(a) * outR);
      P.add(M.barkDark, tubeGeo(base.toArray(), tip.toArray(), trunkR * 0.3, 5));
    }
  }
  if (hollow) {
    // the hollow every old oak has, which is where a village puts a shrine
    P.add(M.barkDark, bx(trunkR * 0.9, trunkH * 0.42, 0.12, 0, trunkH * 0.3, trunkR * 0.95));
  }

  const { geo, blobs } = limbs({
    from: tr.topAt, r: tr.topR * 0.72, seed: `${seed}-limb`, count: limbCount,
    len: spread * 0.3, depth: 2, spread: 0.85, up: 0.8,
  });
  for (const g of geo) P.add(M.bark, g);

  const cloud = [];
  const rx = spread / 2;
  const ry = (h - trunkH) * 0.62;
  const cy = trunkH + (h - trunkH) * 0.46;
  const size = rx * 0.2;
  crown(rr, [ln[0] * 0.5, cy, ln[1] * 0.5], rx, ry,
    Math.round(175 * (ry / rx) * (density / 11)), size, cloud);
  // the limb tips get their own lobes, which is what breaks the ellipsoid
  // into the lumps an oak actually has
  for (const b of blobs) lobe(rr, b.p, b.r * (spread / 10.5) * 1.1, Math.round(density * 0.3), cloud);

  canopyPool(cloud, T, P, 1);
  P.flush(group, { receive: false });

  if (swing) {
    const SP = parts();
    const anchor = blobs[0].p.clone().multiplyScalar(0.55);
    anchor.y = trunkH + 0.4;
    for (const s of [-1, 1]) {
      SP.add(M.rope, cyl(0.014, 0.014, anchor.y - 1.05, anchor.x + s * 0.24, (anchor.y + 1.05) / 2, anchor.z, { seg: 4 }));
    }
    SP.add(M.oakDark, bx(0.62, 0.05, 0.22, anchor.x, 1.05, anchor.z));
    SP.flush(group, { receive: false });
  }

  return tagProp(group, 'great-oak', {
    h, spread, trunkH, trunkTop: tr.topAt.toArray(), blobs: cloud.length,
    footprint: { x0: -trunkR * 1.6, z0: -trunkR * 1.6, x1: trunkR * 1.6, z1: trunkR * 1.6 },
  });
}

/** The shapes the smaller trees come in. `orchard` is a low spreading
 *  fruit tree, `yew` a dark dense column for a graveyard, `hedgerow` a
 *  thin field tree for the moor, `birch` a pale upright one. */
const KINDS = {
  orchard: { h: [3.6, 4.8], spread: 0.95, trunkR: 0.15, trunkF: 0.34, limbs: 4, density: 8, tones: () => [M.leafOrchard, M.leaf], up: 0.7 },
  yew: { h: [4.0, 5.6], spread: 0.52, trunkR: 0.22, trunkF: 0.46, limbs: 5, density: 12, tones: () => [M.leafYew, M.leafDeep], up: 1.05 },
  hedgerow: { h: [5.0, 7.5], spread: 0.72, trunkR: 0.22, trunkF: 0.4, limbs: 4, density: 8, tones: () => [M.leafDeep, M.leaf, M.leafLight], up: 0.9 },
  birch: { h: [5.5, 8.0], spread: 0.55, trunkR: 0.14, trunkF: 0.36, limbs: 4, density: 7, tones: () => [M.leafLight, M.leaf], up: 1.0 },
  oak: { h: [6.5, 9.0], spread: 0.9, trunkR: 0.34, trunkF: 0.42, limbs: 5, density: 10, tones: () => [M.leafDeep, M.leaf, M.leafLight], up: 0.8 },
};

/**
 * A STAND OF TREES as ONE pooled object: every trunk and limb merged into
 * a single bark mesh, every canopy blob in the stand packed into the same
 * two or three instanced meshes.
 *
 * `spots` is a list of `[x, z]` or `[x, z, scale]` IN THE STAND'S OWN
 * FRAME. Give it the ground height per spot with `groundAt` and each tree
 * is seated on its own ground — a stand laid on a slope from one level is
 * half buried and half floating, which is exactly what the spatial audit
 * reports and exactly what an orchard on a knoll would otherwise be.
 *
 * `density` scales the blob count. A tree is about 3 000 triangles at 1;
 * a stand of twenty is 60 000, which is a third of a district's triangle
 * allowance, so a big background orchard should pass `density: 0.7` and a
 * stand you walk under should not.
 *
 * @example
 *   const st = treeStand({ seed: 'knoll-orchard', kind: 'orchard',
 *     spots: [[2, 4], [5, 6], [8, 3.5]], groundAt: ctx.groundAt });
 *   ctx.add(st, 'orchard');            // already in world coordinates
 */
export function treeStand({
  seed = 'stand', kind = 'orchard', spots = [], groundAt = null, tones = null,
  scale = 1, jitter = 0.5, density = 1,
} = {}) {
  const K = KINDS[kind];
  if (!K) throw new Error(`[kit] treeStand: unknown kind "${kind}". Known: ${Object.keys(KINDS).join(', ')}`);
  const rr = rng(seed);
  const group = new THREE.Group();
  const cloud = [];
  const T = tones ?? K.tones();
  const footprints = [];

  /* ---- THE STAND IS BUCKETED BY GROUND LEVEL, and that is not a tidiness
   * decision. The spatial audit takes a unit's bbox and probes DOWN from
   * 0.3 m above its bottom; a stand whose trunks span a 0.8 m fall has its
   * bbox bottom at the LOW end, and every probe over the high end finds no
   * surface below it at all — so a perfectly seated orchard on a knoll
   * comes back as BURIED by the whole fall. (Measured: 0.89 m, on the first
   * showcase run, for four trees on a 1-in-6 bank.)
   *
   * So each half-metre band of ground gets its OWN merged trunk mesh and
   * its own `prop` tag. On flat ground that is one bucket and one mesh —
   * the pooling is unchanged. On a slope it is two or three, which is the
   * honest answer: those really are separate assemblies sitting on
   * separate ground.
   *
   * THE CANOPIES ARE NOT IN ANY BUCKET. They stay in the stand's shared
   * instanced meshes, untagged — which is also correct: foliage six metres
   * up is not a thing that stands on the ground, and auditing it as one is
   * how a tree gets reported for floating. */
  const buckets = new Map();
  const bucketOf = (y) => {
    const k = Math.round(y / 0.5);
    if (!buckets.has(k)) buckets.set(k, { P: parts(), cloud: [], y });
    return buckets.get(k);
  };

  spots.forEach((spot, i) => {
    const [x, z, sc = 1] = spot;
    const r2 = rng(`${seed}|${i}|${x.toFixed(2)}|${z.toFixed(2)}`);
    const s = sc * scale * r2.range(1 - jitter * 0.25, 1 + jitter * 0.25);
    const h = r2.range(K.h[0], K.h[1]) * s;
    const y = groundAt ? groundAt(x, z) : 0;
    const B = bucketOf(y);
    const trunkH = h * (kind === 'yew' ? 0.26 : 0.42);
    const tr = trunkGeo({
      r0: K.trunkR * s, r1: K.trunkR * s * 0.68, h: trunkH, seg: 7, levels: 4,
      lean: [r2.range(-1, 1) * 0.24 * s, r2.range(-1, 1) * 0.24 * s],
      flare: K.trunkF, seed: `${seed}-t${i}`,
    });
    tr.geo.translate(x, y - 0.06, z);
    B.P.add(M.bark, tr.geo);
    const from = tr.topAt.clone().add(new THREE.Vector3(x, y - 0.06, z));
    const { geo, blobs } = limbs({
      from, r: tr.topR * 0.7, seed: `${seed}-l${i}`, count: K.limbs,
      len: h * K.spread * 0.34, depth: 2, spread: 0.8, up: K.up,
    });
    for (const g of geo) B.P.add(M.bark, g);
    /* HOW MANY BLOBS. A crown is filled to a fixed DENSITY, not to a fixed
     * count: the blob size scales with the crown's radius, so the number
     * needed depends only on how tall the crown is against how wide — and a
     * yew is two and a half times taller than it is wide. A fixed count
     * gives a well-packed oak and a yew made of eight floating rocks, which
     * is exactly what the first render showed. */
    const rx = h * K.spread * 0.46;
    const ryC = (h - trunkH) * (kind === 'yew' ? 0.72 : 0.6);
    const bs = rx * 0.3;
    const nB = Math.max(16, Math.min(190, Math.round(90 * (ryC / rx) * (K.density / 9) * density)));
    crown(r2, [x, y - 0.06 + trunkH + (h - trunkH) * 0.44, z], rx, ryC, nB, bs, B.cloud);
    for (const b of blobs) lobe(r2, b.p, b.r * K.spread * 0.9, Math.max(2, Math.round(K.density * 0.35)), B.cloud);
    footprints.push({ x, z, r: K.trunkR * s * 1.7 });
  });

  let n = 0;
  let blobCount = 0;
  for (const B of buckets.values()) {
    canopyPool(B.cloud, T, B.P, 0);
    blobCount += B.cloud.length;
    const sub = new THREE.Group();
    B.P.flush(sub, { receive: false });
    tagProp(sub, `${kind}-trees`, {});
    sub.name = `${kind}-trees-${n}`;
    group.add(sub);
    n += 1;
  }
  void cloud;
  group.name = `${kind}-stand`;
  group.userData = { kind: `${kind}-stand`, trees: spots.length, blobs: blobCount, footprints, buckets: n };
  return group;
}

/**
 * One small tree, seated at the origin — a `treeStand` of one, for when a
 * district wants a single yew by a gate. Prefer `treeStand` for anything
 * more than three: three separate trees are twelve meshes, one stand of
 * three is four.
 */
export function smallTree({ seed = 'tree', kind = 'orchard', scale = 1, tones = null } = {}) {
  const g = treeStand({ seed, kind, spots: [[0, 0]], tones, scale });
  g.userData.kind = kind;
  g.userData.footprint = { x0: -0.4, z0: -0.4, x1: 0.4, z1: 0.4 };
  return g;
}

/**
 * A HEDGE that steps with the ground. Anything long in this world takes a
 * polyline of world points and is seated PER PANEL on the ground under
 * that panel: a hedge laid at one level over falling ground is grounded at
 * one end and floating under the rest, which is the float-run the spatial
 * audit exists to catch.
 */
export function hedgeRun({ points, h = 1.35, w = 0.85, seed = 'hedge', groundAt = null, gappy = 0.0, mat = null }) {
  if (!points || points.length < 2) throw new Error('[kit] hedgeRun: needs at least two points');
  const rr = rng(seed);
  const group = new THREE.Group();
  const P = parts();
  const material = mat ?? M.hedge;
  const pts = points.map((p) => (p.length === 3 ? [p[0], p[2]] : [p[0], p[1]]));
  const cloud = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [ax, az] = pts[i];
    const [bxx, bz] = pts[i + 1];
    const len = Math.hypot(bxx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 0.9));
    const ry = Math.atan2(-(bz - az), bxx - ax);
    for (let k = 0; k < n; k += 1) {
      const t0 = k / n;
      const t1 = (k + 1) / n;
      const cx = ax + (bxx - ax) * (t0 + t1) / 2;
      const cz = az + (bz - az) * (t0 + t1) / 2;
      if (gappy > 0 && rr.chance(gappy)) continue;
      const y0 = groundAt ? Math.min(groundAt(ax + (bxx - ax) * t0, az + (bz - az) * t0),
        groundAt(ax + (bxx - ax) * t1, az + (bz - az) * t1)) : 0;
      const hh = h * rr.range(0.9, 1.1);
      // the body: a box seated on THIS panel's own low ground
      P.add(material, bx(len / n + 0.06, hh + 0.1, w, cx, y0 - 0.05 + (hh + 0.1) / 2, cz,
        { ry, seg: Math.ceil((len / n) / 0.35) }));
      // and the ragged top, which is what stops a hedge being a green wall
      for (let b = 0; b < 3; b += 1) {
        cloud.push({
          x: cx + rr.range(-0.4, 0.4), y: y0 + hh + rr.range(-0.08, 0.1), z: cz + rr.range(-0.28, 0.28),
          s: rr.range(0.28, 0.46), f: rr.range(0.5, 0.72), ry: rr.range(0, TAU), rx: rr.range(-0.3, 0.3),
          tone: rr.next(),
        });
      }
    }
  }
  /* The ragged top goes in the SAME pool as the body: it is part of the
   * hedge, so the audit must see it as the hedge's own geometry. Put it in
   * a sibling group instead and the run's own foliage becomes a surface
   * ABOVE the run, and a correctly seated hedge is reported buried under
   * itself. */
  canopyPool(cloud, [material, M.leafDeep], P, 0);
  P.flush(group, { receive: false });
  return tagProp(group, 'hedge-run', { linear: true, h });
}

/**
 * One tree per tagged unit.  A multi-spot stand's tagged box spans every
 * spot it was given, so a six-spot stand is a 15 m box the OVERLAP test
 * flags against every prop standing inside it.  Where props share ground
 * with trees, place stands one tree at a time.
 */
export function tree(opts = {}) {
  const { at = [0, 0], ...rest } = opts;
  return treeStand({ ...rest, spots: [at] });
}
