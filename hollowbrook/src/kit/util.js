import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ------------------------------------------------------------------ *
 * Kit plumbing: seeded randomness, geometry pooling, the local->world
 * placement helper, and the two polygon writers the boat and the hip
 * roof are built from.
 *
 * Nothing here is Thistledown-specific. Everything above it is.
 * ------------------------------------------------------------------ */

/* ---- seeded randomness -------------------------------------------------
 * Every generator takes a seed and uses it. Same seed, same building —
 * that is the whole contract that lets six district agents scatter forty
 * houses and still get a reproducible town. A seed may be a number or a
 * string ('row-cottage-3'); strings are hashed, so a district can name its
 * seeds after the thing rather than counting integers.
 */

export function hashSeed(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.floor(v * 2654435761) >>> 0;
  const s = String(v ?? 'thistledown');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Deterministic RNG (mulberry32) plus the four helpers every generator
 * actually wants. `r.fork('windows')` gives an independent stream keyed off
 * the same seed — so adding a shutter option cannot shift the window layout
 * of every other building in the town.
 *
 * @example
 *   const r = rng(seed);
 *   const h = r.range(2.4, 2.9);
 *   if (r.chance(0.3)) addShutters();
 */
export function rng(seed) {
  let a = hashSeed(seed);
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    seed,
    next,
    /** float in [lo, hi) */
    range: (lo, hi) => lo + next() * (hi - lo),
    /** integer in [lo, hi] inclusive */
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    /** one element of an array */
    pick: (arr) => arr[Math.floor(next() * arr.length) % arr.length],
    /** true with probability p */
    chance: (p) => next() < p,
    /** -1 or +1 */
    sign: () => (next() < 0.5 ? -1 : 1),
    /** an independent stream from the same seed */
    fork: (label) => rng(`${seed}|${label}`),
  };
}

/* ---- geometry pooling ---------------------------------------------------
 * The districts have per-district mesh budgets (460-520 each). A generator
 * that emits one mesh per plank blows that on its third building, so every
 * generator here pools by MATERIAL: collect geometries, merge once, add one
 * mesh per material. `parts()` is the collector.
 */

const boxCache = new Map();
function boxBase(w, h, d) {
  const k = `${w}:${h}:${d}`;
  let g = boxCache.get(k);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    boxCache.set(k, g);
  }
  return g;
}

/**
 * A box as loose GEOMETRY, ready to merge. `rx`/`ry`/`rz` are applied about
 * the box centre in that order, then it is translated — so a raked member is
 * built exactly the way `gableRoof` builds a roof plane: rotate about the
 * joint midpoint, and both ends land on their joints.
 *
 * `seg` TESSELLATES THE LONGEST AXIS, and it is not decoration. A 12 m rail
 * authored with two vertices has NOTHING IN THE MIDDLE OF IT, and every
 * per-station sampler in this toolchain reads a run through its vertices:
 * the spatial audit's run check takes the lowest own vertex in each 0.5 m
 * slab, finds none between the panel ends, falls back to the run's GLOBAL
 * minimum, and then reports a perfectly seated fence on a bank as buried by
 * the whole rise. (Measured on the first showcase run: 18 of 23 stations,
 * worst 1.18 m, on a fence that was correct.) Anything long and continuous
 * — a rail, a hedge body, a weaver — passes `seg`.
 */
export function bx(w, h, d, x = 0, y = 0, z = 0, { rx = 0, ry = 0, rz = 0, seg = 0 } = {}) {
  const g = seg > 1 ? segBox(w, h, d, seg) : boxBase(w, h, d).clone();
  if (rx) g.applyMatrix4(new THREE.Matrix4().makeRotationX(rx));
  if (rz) g.applyMatrix4(new THREE.Matrix4().makeRotationZ(rz));
  if (ry) g.applyMatrix4(new THREE.Matrix4().makeRotationY(ry));
  g.translate(x, y, z);
  return g;
}

/** A cylinder as loose geometry, axis +y unless rotated. Radial segments
 *  default to 8: at this scale nothing needs more, and the flat shading
 *  wants facets anyway. */
/** A box subdivided along whichever axis is longest. Never cached: the
 *  segment count is part of the shape. */
function segBox(w, h, d, seg) {
  const n = Math.max(2, Math.round(seg));
  if (w >= h && w >= d) return new THREE.BoxGeometry(w, h, d, n, 1, 1);
  if (d >= h) return new THREE.BoxGeometry(w, h, d, 1, 1, n);
  return new THREE.BoxGeometry(w, h, d, 1, n, 1);
}

export function cyl(r0, r1, h, x = 0, y = 0, z = 0, { seg = 8, rx = 0, ry = 0, rz = 0, open = false } = {}) {
  const g = new THREE.CylinderGeometry(r0, r1, h, seg, 1, open);
  if (rx) g.applyMatrix4(new THREE.Matrix4().makeRotationX(rx));
  if (rz) g.applyMatrix4(new THREE.Matrix4().makeRotationZ(rz));
  if (ry) g.applyMatrix4(new THREE.Matrix4().makeRotationY(ry));
  g.translate(x, y, z);
  return g;
}

/**
 * A cylindrical member spanning two joints, as loose geometry. Build
 * assemblies from joints, never from part positions and a guessed angle:
 * a shared end is then shared by construction. (`tubeBetween` in
 * builders.js is the same idea returning a mesh; this one merges.)
 */
export function tubeGeo(a, b, r, seg = 6) {
  const A = new THREE.Vector3().fromArray(a);
  const B = new THREE.Vector3().fromArray(b);
  const dir = B.clone().sub(A);
  const len = dir.length() || 1e-4;
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g;
}

/**
 * Reconcile one batch for `mergeGeometries`, which refuses a list unless
 * every member is indexed or none of them is, and unless they all carry the
 * same attributes. A generator legitimately mixes both — `bx()` gives an
 * indexed BoxGeometry and `gableFill()` gives a hand-wound non-indexed
 * prism — and the failure is a console error plus a null geometry, i.e. a
 * building that silently does not exist. Normalise instead of asking every
 * generator to remember.
 */
function reconcile(list) {
  const anyIndexed = list.some((g) => g.index);
  const allIndexed = list.every((g) => g.index);
  const out = list.map((g) => {
    let n = anyIndexed && !allIndexed && g.index ? g.toNonIndexed() : g;
    if (n !== g) g.dispose();
    if (!n.attributes.normal) n.computeVertexNormals();
    if (!n.attributes.uv) {
      n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    }
    for (const key of Object.keys(n.attributes)) {
      if (key !== 'position' && key !== 'normal' && key !== 'uv') n.deleteAttribute(key);
    }
    return n;
  });
  return out;
}

/** Merge loose geometries into ONE mesh. Returns null for an empty list, so
 *  a caller can `if (m) group.add(m)` without guarding the array. */
export function mergeParts(geometries, material, { cast = true, receive = true, name } = {}) {
  const list = reconcile(geometries.filter(Boolean));
  if (!list.length) return null;
  const merged = mergeGeometries(list, false);
  if (!merged) throw new Error(`[kit] mergeParts failed for ${list.length} geometries (material ${material?.name || material?.uuid})`);
  list.forEach((g) => g.dispose());
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  if (name) mesh.name = name;
  return mesh;
}

/**
 * The per-material collector every generator uses.
 *
 * @example
 *   const P = parts();
 *   P.add(M.render, bx(6, 3, 5, 0, 1.5, 0));
 *   P.add(M.slate, ...);
 *   P.flush(group);            // one mesh per material, cast/receive set
 */
export function parts() {
  const byMaterial = new Map();
  return {
    add(material, ...geometries) {
      let list = byMaterial.get(material);
      if (!list) byMaterial.set(material, (list = []));
      for (const g of geometries) if (g) list.push(g);
      return this;
    },
    flush(group, opts = {}) {
      let i = 0;
      for (const [material, list] of byMaterial) {
        const mesh = mergeParts(list, material, { ...opts, name: `pool-${i}` });
        i += 1;
        if (mesh) group.add(mesh);
      }
      byMaterial.clear();
      return group;
    },
  };
}

/* ---- polygon writers ----------------------------------------------------
 * A quad's winding cannot be written down once for a surface that has four
 * orientations, and `cel()` is single-sided — a hand-wound face that comes
 * out backwards renders as a hole with no error anywhere. Both writers
 * below DERIVE the winding from a reference point, so it cannot be got
 * backwards: pass the solid's interior and say whether the face looks away
 * from it.
 */

/** Push one quad (a,b,c,d in order round the face) as two triangles, wound
 *  so its normal points away from (`outward`) or toward `ref`. */
export function pushQuad(out, a, b, c, d, ref, outward = true) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const o = [a[0] - ref[0], a[1] - ref[1], a[2] - ref[2]];
  const away = n[0] * o[0] + n[1] * o[1] + n[2] * o[2] >= 0;
  const tris = away === outward ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
  for (const p of tris) out.push(p[0], p[1], p[2]);
}

/** Same, for a triangle. */
export function pushTri(out, a, b, c, ref, outward = true) {
  pushQuad(out, a, b, c, c, ref, outward);
}

/** Turn a flat position list into non-indexed geometry with per-face
 *  normals — which is what a faceted solid wants under a cel ramp. */
export function polyGeometry(positions) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

/* ---- placement ----------------------------------------------------------
 * Every building generator authors in LOCAL space facing +Z with its origin
 * on the ground at the centre of its footprint, and declares what it needs
 * registered in `userData` (footprint, colliders, platforms — all local
 * rects). `place()` is the one function that turns that into world space.
 *
 * Doing it here rather than in each district is not a convenience: the
 * rotated-AABB arithmetic is the thing six agents would each get subtly
 * wrong, and a collider is inflated by the player's radius on EVERY side, so
 * being 0.3 m out is a sealed lane nobody sees in a render.
 */

const HALF_PI = Math.PI / 2;

function rotRect(rect, yaw, x, z) {
  // Corner-rotate and take the AABB. Exact for yaw a multiple of PI/2, which
  // is the only yaw a town on a street grid ever needs.
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [lx, lz] of [[rect.x0, rect.z0], [rect.x1, rect.z0], [rect.x1, rect.z1], [rect.x0, rect.z1]]) {
    const wx = x + lx * c + lz * s;
    const wz = z - lx * s + lz * c;
    x0 = Math.min(x0, wx); x1 = Math.max(x1, wx);
    z0 = Math.min(z0, wz); z1 = Math.max(z1, wz);
  }
  return { x0, z0, x1, z1 };
}

/**
 * Place a kit group in the world: seat it on the ground by QUERY, rotate it,
 * and register everything it declared.
 *
 * @param {object} ctx      the district ctx (wrapped — ownership is stamped)
 * @param {THREE.Group} group  from any kit building generator
 * @param {object} o
 * @param {number} o.x, o.z world position of the group's local origin
 * @param {number} [o.yaw]  0 faces +Z, PI faces -Z, +PI/2 faces +X. Use
 *                          multiples of PI/2: the collider AABB is exact
 *                          there and only there.
 * @param {number} [o.y]    override the ground query (a quay edge, a deck)
 * @param {boolean} [o.collide=true] register the footprint as a collider
 * @param {number} [o.sink=0.03] how far to bed the base into the ground
 * @param {string} [o.name] scene-graph name
 * @returns {THREE.Group} the same group, positioned
 *
 * @example
 *   const h = cottage({ seed: 'row-3', w: 5.4, trade: { tenant: 'tansy' } });
 *   place(ctx, h, { x: -12, z: 4, yaw: Math.PI, name: 'tansy-baker' });
 */
export function place(ctx, group, { x, z, yaw = 0, y, collide = true, sink = 0.03, name } = {}) {
  const snapped = Math.round(yaw / HALF_PI) * HALF_PI;
  if (Math.abs(snapped - yaw) > 1e-6) {
    console.warn(`[kit] place("${name ?? group.name}"): yaw ${yaw.toFixed(3)} is not a multiple of PI/2 — ` +
      'the registered collider is the rotated AABB and will be larger than the building.');
  }
  const base = y ?? ctx.groundAt(x, z);
  group.position.set(x, base - sink, z);
  group.rotation.y = yaw;
  const u = group.userData ?? {};
  if (collide && u.footprint) {
    const r = rotRect(u.footprint, yaw, x, z);
    ctx.collide(r.x0, r.z0, r.x1, r.z1);
  }
  for (const rect of u.colliders ?? []) {
    const r = rotRect(rect, yaw, x, z);
    ctx.collide(r.x0, r.z0, r.x1, r.z1);
  }
  for (const rect of u.platforms ?? []) {
    const r = rotRect(rect, yaw, x, z);
    ctx.platform(r.x0, r.z0, r.x1, r.z1, base - sink + rect.top);
  }
  ctx.add(group, name ?? u.kind ?? 'building');
  return group;
}

/**
 * Tag a small object as a prop UNIT so the spatial audit counts it as one
 * thing rather than as eleven anonymous boxes. Every prop generator ends
 * with this.
 */
export function tagProp(group, kind, extra = {}) {
  group.userData = { ...group.userData, ...extra, prop: true, kind };
  group.name = group.name || kind;
  return group;
}

/**
 * Same, WITH texture coordinates. Every lofted surface in this kit (the
 * thatch, the tower shafts, the conical caps) is hand-wound and therefore
 * carries no UVs of its own — and `mergeParts` fills a missing uv attribute
 * with ZEROS, so the whole surface samples one texel and the pooled
 * micro-texture map simply does not appear on it. It renders as a flat
 * colour and nothing anywhere reports a problem.
 *
 * That is the trap: the map IS attached, the material IS right, and the
 * surface is untextured because it has no coordinates to sample it with.
 * Push a uv pair for every position pushed, in metres divided by the tile
 * size you want, and the map tiles (every kit map is RepeatWrapping).
 */
export function polyGeometryUV(positions, uvs) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

/**
 * Push one quad as two triangles into BOTH a position list and a uv list,
 * wound so its normal points away from `ref`. The uv corners are pushed in
 * the SAME order the winding chose, which is the whole reason this is one
 * function and not two: emit the triangles in one place and the texture
 * coordinates in another, and half the faces of a lofted solid come back
 * with their map mirrored.
 */
export function pushQuadUV(out, uvOut, a, b, c, d, ua, ub, uc, ud, ref, outward = true) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const o = [a[0] - ref[0], a[1] - ref[1], a[2] - ref[2]];
  const away = n[0] * o[0] + n[1] * o[1] + n[2] * o[2] >= 0;
  const tris = away === outward ? [[a, ua], [b, ub], [c, uc], [a, ua], [c, uc], [d, ud]]
                                : [[a, ua], [c, uc], [b, ub], [a, ua], [d, ud], [c, uc]];
  for (const [p, t] of tris) {
    out.push(p[0], p[1], p[2]);
    uvOut.push(t[0], t[1]);
  }
}
