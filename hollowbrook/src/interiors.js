import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cel, flat } from './core/toon.js';
import { cached } from './core/texkit.js';
import { PAL } from './palette.js';

/* ------------------------------------------------------------------ *
 * THE INTERIOR DRESSING VOCABULARY.
 *
 * `hollowShell` gives a district a room. This gives it something to put
 * in one, so that furnishing an inn, a shop or a workshop is a matter of
 * choosing and placing rather than of inventing a table — the same reason
 * a city has a kit at all. A declared enterable that is a bare box is
 * worse than a painted window, and `check-city` fails one.
 *
 * NO PEOPLE. Not standing, not seated, not painted on a wall, not as a
 * silhouette behind glass. The evidence of use IS the dressing: a stool
 * pushed back, a cup left on the table, half a shelf empty. This rule has
 * been broken in this codebase exactly once, by painted passengers in a
 * train window, and it survived for months because it was small.
 *
 * CONVENTIONS
 *
 *  - ORIGIN, and there are two of them on purpose:
 *      FREESTANDING props (table, stool, benchSeat, barrel, crateStack)
 *      have their origin at the centre of their own footprint, ON THE
 *      FLOOR: `at: [x, floorY, z]`.
 *      WALL props (hearth, shelf, counter, bed) have their origin at the
 *      CENTRE OF THEIR BACK FACE, on the floor — i.e. a point ON the
 *      wall's inner face. Placing one is then "where does it touch the
 *      wall", which is the question you actually have, instead of "where
 *      is its centre given a depth I have to remember".
 *  - `ry` IS THE DIRECTION THE PROP FACES, and every generator is authored
 *    facing +z. For a wall prop that is the wall's INWARD normal:
 *    `ry = Math.atan2(nx, nz)` — the same expression every name plate and
 *    outdoor unit in the flagship uses, and the one that was got backwards
 *    on half of them.
 *  - EVERYTHING IS POOLED PER MATERIAL and tagged `userData.prop = true`
 *    with a `userData.kind`, so the spatial audit counts a shelf as one
 *    unit rather than as twenty-two anonymous boxes, and `check-city`'s
 *    terminus pass can say what closes a view.
 *  - ANYTHING HUNG sets `userData.airborne = true`. A lamp on a chain is
 *    held by the ceiling; without the flag the audit reads it as a unit
 *    floating in open air, which is exactly what it is.
 *  - SEEDED. Same seed, same furniture. A string seed is hashed, so name
 *    them after the thing ('inn-table-2') rather than counting integers.
 *
 * LIGHTING: DARK BY SHADOW, LIFTED BY PRACTICALS.
 * A room under a roof gets no direct sun, so every surface in it sits on
 * the cel ramp's bottom band with the violet shadow tint on it — which is
 * correct, and is why the ceiling and floor materials here are HIGH-VALUE
 * despite reading as dark: choosing a darker colour for a surface that
 * gets no direct light at all takes it to nearly the ink value. What
 * lifts the room is polish mechanism 6, practicals that travel: a banded
 * body, a SMALL warm emissive glass, and a soft light pool on the floor
 * under it. `hearth` and `hangingLamp` are both built that way and
 * `lightPool` is exported for anything else that burns.
 * ------------------------------------------------------------------ */

/* ---- seeded rng ---------------------------------------------------- */

export function hashSeed(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.floor(v * 2654435761) >>> 0;
  const s = String(v ?? 'interior');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

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
    next,
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length) % arr.length],
    chance: (p) => next() < p,
    sign: () => (next() < 0.5 ? -1 : 1),
  };
}

/* ---- geometry plumbing --------------------------------------------- */

const boxCache = new Map();
function boxBase(w, h, d) {
  const k = `${w}:${h}:${d}`;
  if (!boxCache.has(k)) boxCache.set(k, new THREE.BoxGeometry(w, h, d));
  return boxCache.get(k);
}

/** A box as loose geometry, rotated about its own centre then translated. */
function bx(w, h, d, x = 0, y = 0, z = 0, { rx = 0, ry = 0, rz = 0 } = {}) {
  const g = boxBase(w, h, d).clone();
  if (rx) g.applyMatrix4(new THREE.Matrix4().makeRotationX(rx));
  if (rz) g.applyMatrix4(new THREE.Matrix4().makeRotationZ(rz));
  if (ry) g.applyMatrix4(new THREE.Matrix4().makeRotationY(ry));
  g.translate(x, y, z);
  return g;
}

/** A cylinder as loose geometry; axis +y unless rotated. */
function cyl(r0, r1, h, x = 0, y = 0, z = 0, { seg = 9, rx = 0, rz = 0 } = {}) {
  const g = new THREE.CylinderGeometry(r0, r1, h, seg);
  if (rx) g.applyMatrix4(new THREE.Matrix4().makeRotationX(rx));
  if (rz) g.applyMatrix4(new THREE.Matrix4().makeRotationZ(rz));
  g.translate(x, y, z);
  return g;
}

/** The per-material collector every generator here ends with. */
function pool() {
  const byMat = new Map();
  return {
    add(material, ...geoms) {
      let list = byMat.get(material);
      if (!list) byMat.set(material, (list = []));
      for (const g of geoms) if (g) list.push(g);
      return this;
    },
    flush(group, { cast = true } = {}) {
      let i = 0;
      for (const [material, list] of byMat) {
        const normalised = list.map((g) => {
          const n = g.index ? g.toNonIndexed() : g;
          if (n !== g) g.dispose();
          if (!n.attributes.normal) n.computeVertexNormals();
          if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
          return n;
        });
        const mesh = new THREE.Mesh(mergeGeometries(normalised, false), material);
        normalised.forEach((g) => g.dispose());
        mesh.castShadow = cast;
        mesh.receiveShadow = true;
        mesh.name = `pool-${i}`;
        i += 1;
        group.add(mesh);
      }
      byMat.clear();
      return group;
    },
  };
}

function finish(group, kind, { at = [0, 0, 0], ry = 0, extra = {} } = {}) {
  group.position.set(at[0], at[1], at[2]);
  group.rotation.y = ry;
  group.userData = { ...group.userData, ...extra, prop: true, kind };
  group.name = group.name || kind;
  return group;
}

/* ---- materials ------------------------------------------------------
 * One bag, built once, from the palette. A scene that wants its own
 * interior tones passes its own `mats` — every generator takes it. */

let MATS = null;

/**
 * The default interior material bag. Values are deliberately HIGH: every
 * one of these surfaces lives on the cel ramp's bottom band, so a "dark
 * oak" here renders within a few per cent of the ink colour.
 */
export function interiorMats() {
  if (MATS) return MATS;
  MATS = {
    timber: cel({ color: 0xb9a186, bands: 3 }),
    timberDark: cel({ color: 0x94795f, bands: 3 }),
    stone: cel({ color: 0xc9c2c8, bands: 3 }),
    /* THE HEARTH'S OWN STONE, and the reason it is a separate material.
     * Read off two repair passes: at 0xa9a4ac the surround came back a
     * cold blue-grey — the ramp's bottom band plus the violet tint, on a
     * mass that by definition gets no direct light. Lifting the base
     * colour helped and was not enough, because the band is the band
     * whatever colour goes into it. A LOW WARM EMISSIVE is what works: it
     * lifts the value while keeping the facet shading, which is the same
     * trick a lit selection button uses, and it is also physically the
     * right story — the masonry round a fire is lit BY the fire. */
    stoneWarm: cel({ color: 0xd8ccc0, emissive: 0x7a5334, emissiveIntensity: 0.3, bands: 3 }),
    plaster: cel({ color: 0xe4dccb, bands: 3 }),
    metal: cel({ color: 0x7b7684, bands: 4 }),
    cloth: cel({ color: 0xc9c2d6, bands: 3 }),
    clothWarm: cel({ color: 0xd6b08d, bands: 3 }),
    goodsA: cel({ color: 0xb98f63, bands: 3 }),
    goodsB: cel({ color: 0x8fa8a0, bands: 3 }),
    // the LIT part is the loud part, so it is always small
    glow: cel({ color: PAL.warmLight, emissive: PAL.warmLight, emissiveIntensity: 0.9, bands: 'soft' }),
    ember: cel({ color: 0xe08a4a, emissive: 0xe08a4a, emissiveIntensity: 0.8, bands: 'soft' }),
  };
  return MATS;
}

/* ---- practicals ----------------------------------------------------- */

function poolTexture(inner, outer) {
  return cached(`interior-pool-${inner}-${outer}`, 128, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const g = c.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.45, outer);
    g.addColorStop(1, 'rgba(255,200,120,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });
}

let poolWarm = null;
let poolEmber = null;

/**
 * The soft warm disc a practical throws on the floor. Flat, unlit,
 * `depthWrite: false` so the ink pass does not outline it into a ring,
 * never a collider and never a platform.
 *
 * IT IS NOT A LIGHT. It is a decal, and it is the difference between a
 * lamp that lights a room and a bright dot hanging in a dark one. In an
 * interior it does more work than anywhere outdoors, because there is no
 * direct light in the room for it to compete with.
 */
export function lightPool({ r = 1.5, y = 0.015, ember = false, opacity = 0.5 } = {}) {
  if (!poolWarm) {
    poolWarm = flat({ color: PAL.warmLight, map: poolTexture('rgba(255,236,190,0.95)', 'rgba(255,206,132,0.36)'), transparent: true, depthWrite: false, cache: false });
    poolEmber = flat({ color: 0xe08a4a, map: poolTexture('rgba(255,206,150,0.95)', 'rgba(232,140,74,0.4)'), transparent: true, depthWrite: false, cache: false });
  }
  // clone rather than mutate: the two pool materials are shared, and
  // `mesh.material.opacity = …` on a shared material sets it for every
  // practical in the scene to whatever the last one asked for
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), (ember ? poolEmber : poolWarm).clone());
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.material.opacity = opacity;
  mesh.renderOrder = 2;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.airborne = true;
  mesh.name = 'light-pool';
  return mesh;
}

/**
 * A soft glow card standing in front of a fire or a lamp: the halo, seen
 * from the room. Unlit, additive-ish through a radial alpha, `depthWrite`
 * off. Authored facing +z like everything else here.
 */
export function glowCard({ w = 0.9, h = 0.7, ember = true, opacity = 0.55 } = {}) {
  const mat = flat({
    color: ember ? 0xe89a58 : PAL.warmLight,
    map: poolTexture(ember ? 'rgba(255,214,158,0.95)' : 'rgba(255,240,205,0.95)', 'rgba(240,160,90,0.28)'),
    transparent: true, depthWrite: false, cache: false,
  });
  mat.opacity = opacity;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.renderOrder = 2;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.airborne = true;
  mesh.name = 'glow-card';
  return mesh;
}

/* Attach pools/cards to a prop WITHOUT putting them inside its audit unit.
 * `Box3.setFromObject` takes every descendant, so a 3 m pool parented to a
 * 1.3 m hearth gives that hearth a 3 m bounding box and the OVERLAP test
 * then flags it against every neighbour in the room. So the returned outer
 * group is untagged, the body inside it carries the tag, and the decals are
 * its siblings. */
function withDecals(body, decals) {
  if (!decals.length) return body;
  const outer = new THREE.Group();
  outer.name = `${body.name || 'prop'}-lit`;
  outer.position.copy(body.position);
  outer.rotation.y = body.rotation.y;
  body.position.set(0, 0, 0);
  body.rotation.y = 0;
  outer.add(body, ...decals);
  outer.userData = { lit: true, kind: body.userData.kind, body };
  return outer;
}

/* ---- freestanding --------------------------------------------------- */

/**
 * A table. Origin at the centre of its own footprint, on the floor.
 * `clutter` puts a cup, a bowl and a stub of candle on it — the evidence
 * that somebody was here ten minutes ago, which is the whole point of
 * dressing an interior at all.
 */
export function table({ w = 1.25, d = 0.78, h = 0.76, seed = 'table', clutter = true, at = [0, 0, 0], ry = 0, mats = interiorMats() } = {}) {
  const r = rng(seed);
  const g = new THREE.Group();
  const P = pool();
  const T = 0.055;
  P.add(mats.timber, bx(w, T, d, 0, h - T / 2, 0));
  const inset = 0.11;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      P.add(mats.timberDark, bx(0.075, h - T, 0.075, sx * (w / 2 - inset), (h - T) / 2, sz * (d / 2 - inset)));
    }
  }
  // rails, joint to joint on the legs
  for (const sz of [-1, 1]) P.add(mats.timberDark, bx(w - inset * 2 - 0.075, 0.055, 0.04, 0, h - T - 0.12, sz * (d / 2 - inset)));
  for (const sx of [-1, 1]) P.add(mats.timberDark, bx(0.04, 0.055, d - inset * 2 - 0.075, sx * (w / 2 - inset), h - T - 0.12, 0));
  if (clutter) {
    P.add(mats.goodsB, cyl(0.055, 0.05, 0.09, r.range(-0.3, 0.1), h + 0.045, r.range(-0.15, 0.15)));
    P.add(mats.plaster, cyl(0.115, 0.09, 0.06, r.range(0.1, 0.35), h + 0.03, r.range(-0.2, 0.2)));
    if (r.chance(0.7)) P.add(mats.plaster, cyl(0.02, 0.02, 0.13, r.range(-0.45, -0.2), h + 0.065, r.range(-0.2, 0.2)));
  }
  P.flush(g);
  return finish(g, 'table', { at, ry, extra: { topY: at[1] + h } });
}

/** A three-legged stool. Origin at its footprint centre, on the floor. */
export function stool({ h = 0.45, r: rad = 0.17, seed = 'stool', at = [0, 0, 0], ry = 0, mats = interiorMats() } = {}) {
  const r = rng(seed);
  const g = new THREE.Group();
  const P = pool();
  P.add(mats.timber, cyl(rad, rad * 0.96, 0.05, 0, h - 0.025, 0));
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2 + r.range(0, 0.5);
    const rr = rad * 0.62;
    P.add(mats.timberDark, cyl(0.028, 0.034, h - 0.05, Math.sin(a) * rr, (h - 0.05) / 2, Math.cos(a) * rr, { seg: 6 }));
  }
  P.flush(g);
  return finish(g, 'stool', { at, ry: ry + r.range(-0.4, 0.4), extra: { topY: at[1] + h } });
}

/** A plank bench on two trestles. Origin at its footprint centre. */
export function benchSeat({ w = 1.5, h = 0.44, d = 0.34, seed = 'bench', at = [0, 0, 0], ry = 0, mats = interiorMats() } = {}) {
  const g = new THREE.Group();
  const P = pool();
  P.add(mats.timber, bx(w, 0.055, d, 0, h - 0.0275, 0));
  for (const s of [-1, 1]) {
    P.add(mats.timberDark, bx(0.06, h - 0.055, d - 0.04, s * (w / 2 - 0.16), (h - 0.055) / 2, 0));
    P.add(mats.timberDark, bx(0.08, 0.05, d, s * (w / 2 - 0.16), 0.025, 0));
  }
  P.add(mats.timberDark, bx(w - 0.5, 0.05, 0.05, 0, h * 0.4, 0));
  P.flush(g);
  return finish(g, 'bench-seat', { at, ry, extra: { topY: at[1] + h } });
}

/** A barrel. Origin at its footprint centre. */
export function barrel({ h = 0.82, r: rad = 0.28, seed = 'barrel', at = [0, 0, 0], ry = 0, mats = interiorMats() } = {}) {
  const r = rng(seed);
  const g = new THREE.Group();
  const P = pool();
  P.add(mats.timberDark, cyl(rad * 0.86, rad, h * 0.5, 0, h * 0.25, 0, { seg: 11 }));
  P.add(mats.timberDark, cyl(rad, rad * 0.86, h * 0.5, 0, h * 0.75, 0, { seg: 11 }));
  for (const y of [h * 0.18, h * 0.5, h * 0.82]) {
    const rr = rad * (y === h * 0.5 ? 1.01 : 0.94);
    P.add(mats.metal, cyl(rr, rr, 0.045, 0, y, 0, { seg: 11 }));
  }
  P.add(mats.timber, cyl(rad * 0.83, rad * 0.83, 0.035, 0, h - 0.01, 0, { seg: 11 }));
  P.flush(g);
  return finish(g, 'barrel', { at, ry: ry + r.range(0, 1.2), extra: { topY: at[1] + h } });
}

/** A stack of crates, seeded. Origin at its footprint centre. */
export function crateStack({ n = 3, size = 0.46, seed = 'crates', at = [0, 0, 0], ry = 0, mats = interiorMats() } = {}) {
  const r = rng(seed);
  const g = new THREE.Group();
  const P = pool();
  let y = 0;
  for (let i = 0; i < n; i += 1) {
    const s = size * r.range(0.86, 1.06);
    const hh = s * r.range(0.62, 0.82);
    const ox = r.range(-0.06, 0.06);
    const oz = r.range(-0.06, 0.06);
    const a = r.range(-0.22, 0.22);
    P.add(i % 2 ? mats.timber : mats.timberDark, bx(s, hh, s, ox, y + hh / 2, oz, { ry: a }));
    // battens, built outward from the crate face
    for (const sz of [-1, 1]) {
      P.add(mats.timberDark, bx(s * 1.01, 0.035, 0.02, ox, y + hh * 0.78, oz + sz * (s / 2 + 0.008), { ry: a }));
    }
    y += hh - 0.008;
  }
  P.flush(g);
  return finish(g, 'crate-stack', { at, ry, extra: { topY: at[1] + y } });
}

/* ---- wall props: origin at the CENTRE OF THE BACK FACE --------------- */

/**
 * A shelf unit with goods on it. Origin on the wall's inner face, at the
 * floor. `ry` is the wall's inward normal: `Math.atan2(nx, nz)`.
 *
 * Leave one bay short. A shelf loaded evenly to the ends reads as
 * warehouse stock; a shelf with a gap reads as somebody having taken
 * something off it.
 */
export function shelf({ w = 1.15, h = 1.75, d = 0.34, boards = 4, goods = true, seed = 'shelf', at = [0, 0, 0], ry = 0, mats = interiorMats() } = {}) {
  const r = rng(seed);
  const g = new THREE.Group();
  const P = pool();
  const T = 0.035;
  for (const s of [-1, 1]) P.add(mats.timberDark, bx(0.055, h, d, s * (w / 2 - 0.028), h / 2, d / 2));
  P.add(mats.timberDark, bx(w, h, 0.025, 0, h / 2, 0.012));   // back board
  const ys = [];
  for (let i = 0; i < boards; i += 1) {
    const y = 0.28 + (i * (h - 0.42)) / Math.max(1, boards - 1);
    ys.push(y);
    P.add(mats.timber, bx(w - 0.05, T, d - 0.02, 0, y, d / 2));
  }
  if (goods) {
    for (const y of ys) {
      if (r.chance(0.22)) continue;             // the empty bay
      const n = r.int(2, 4);
      for (let i = 0; i < n; i += 1) {
        const x = -w / 2 + 0.14 + (i * (w - 0.28)) / Math.max(1, n - 1) + r.range(-0.03, 0.03);
        const mat = r.chance(0.5) ? mats.goodsA : mats.goodsB;
        if (r.chance(0.55)) {
          const hh = r.range(0.14, 0.24);
          P.add(mat, cyl(r.range(0.05, 0.08), r.range(0.05, 0.075), hh, x, y + T / 2 + hh / 2, d / 2 + r.range(-0.03, 0.03), { seg: 8 }));
        } else {
          const hh = r.range(0.12, 0.2);
          const ww = r.range(0.13, 0.2);
          P.add(mat, bx(ww, hh, r.range(0.14, 0.22), x, y + T / 2 + hh / 2, d / 2 + r.range(-0.02, 0.02), { ry: r.range(-0.3, 0.3) }));
        }
      }
    }
  }
  P.flush(g);
  return finish(g, 'shelf', { at, ry, extra: { depth: d } });
}

/**
 * A serving / working counter. Origin on the wall's inner face; the
 * counter runs `w` along the wall and `d` out into the room, so it is
 * placed by where it MEETS the wall.
 */
export function counter({ w = 2.1, h = 1.0, d = 0.62, seed = 'counter', goods = true, at = [0, 0, 0], ry = 0, mats = interiorMats() } = {}) {
  const r = rng(seed);
  const g = new THREE.Group();
  const P = pool();
  const T = 0.06;
  P.add(mats.timber, bx(w + 0.09, T, d + 0.06, 0, h - T / 2, d / 2));            // top, oversailing
  P.add(mats.timberDark, bx(w, h - T, 0.055, 0, (h - T) / 2, d - 0.0275));       // front panel
  for (const s of [-1, 1]) P.add(mats.timberDark, bx(0.055, h - T, d, s * (w / 2 - 0.028), (h - T) / 2, d / 2));
  P.add(mats.timberDark, bx(w - 0.12, 0.04, d - 0.12, 0, h * 0.42, d / 2));      // under-shelf
  if (goods) {
    P.add(mats.metal, cyl(0.1, 0.1, 0.035, r.range(-0.6, -0.2), h + 0.02, d * 0.55, { seg: 10 }));
    P.add(mats.goodsA, bx(0.24, 0.14, 0.18, r.range(0.2, 0.6), h + 0.07, d * 0.5, { ry: r.range(-0.3, 0.3) }));
    P.add(mats.plaster, cyl(0.05, 0.045, 0.16, r.range(-0.1, 0.1), h + 0.08, d * 0.62, { seg: 8 }));
  }
  P.flush(g);
  return finish(g, 'counter', { at, ry, extra: { topY: at[1] + h, depth: d } });
}

/**
 * A bed. Origin at the head end, on the wall's inner face; it runs `l`
 * out into the room.
 */
export function bed({ w = 1.0, l = 1.95, h = 0.36, seed = 'bed', at = [0, 0, 0], ry = 0, mats = interiorMats() } = {}) {
  const r = rng(seed);
  const g = new THREE.Group();
  const P = pool();
  P.add(mats.timberDark, bx(w, 0.7, 0.06, 0, 0.35, 0.03));                       // headboard
  for (const s of [-1, 1]) P.add(mats.timberDark, bx(0.07, h, l, s * (w / 2 - 0.035), h / 2, l / 2));
  P.add(mats.timberDark, bx(w, 0.09, 0.06, 0, h - 0.045, l - 0.03));             // foot rail
  P.add(mats.cloth, bx(w - 0.09, 0.16, l - 0.1, 0, h + 0.02, l / 2));            // mattress
  P.add(mats.clothWarm, bx(w - 0.05, 0.07, l * r.range(0.5, 0.62), 0, h + 0.13, l * r.range(0.6, 0.68)));  // blanket, thrown back
  P.add(mats.plaster, bx(w * 0.5, 0.11, 0.3, r.range(-0.12, 0.12), h + 0.14, 0.27));
  P.flush(g);
  return finish(g, 'bed', { at, ry, extra: { length: l } });
}

/**
 * A hearth with a fire in it — the interior's key light, and the one
 * thing that stops a room reading as a grey box under a roof.
 *
 * Three things, per polish mechanism 6: a banded stone body, a SMALL
 * emissive ember bed inside the opening, and a light pool on the floor in
 * front of it. The pool and the glow card are siblings of the tagged body,
 * not children, so the hearth's audit bounding box stays the size of the
 * hearth.
 *
 * Origin on the wall's inner face, at the floor; `ry` is the inward normal.
 */
export function hearth({ w = 1.4, h = 1.5, d = 0.5, seed = 'hearth', lit = true, at = [0, 0, 0], ry = 0, mats = interiorMats() } = {}) {
  const r = rng(seed);
  const g = new THREE.Group();
  const P = pool();
  const openW = w * 0.54;
  const openH = 0.66;
  const jamb = (w - openW) / 2;
  P.add((lit ? mats.stoneWarm : mats.stone), bx(w, h, 0.12, 0, h / 2, 0.06));                             // back
  for (const s of [-1, 1]) P.add((lit ? mats.stoneWarm : mats.stone), bx(jamb, h * 0.72, d, s * (w - jamb) / 2, h * 0.36, d / 2));
  P.add((lit ? mats.stoneWarm : mats.stone), bx(w, 0.16, d, 0, openH + 0.08, d / 2));                     // lintel
  // The hood TAPERS from the lintel. Written as one narrower, set-back box
  // it reads as a stepped machine rather than as a chimney breast — which
  // is what the first interior frame came back as. Four courses, each one
  // narrower and shallower than the last, starting flush with the lintel.
  const hoodH = h - openH - 0.16;
  const courses = 4;
  for (let i = 0; i < courses; i += 1) {
    const t = (i + 0.5) / courses;
    const cw = w * (1 - 0.42 * t);
    const cd = d * (1 - 0.5 * t);
    P.add((lit ? mats.stoneWarm : mats.stone), bx(cw, hoodH / courses + 0.01, cd, 0, openH + 0.16 + (i + 0.5) * (hoodH / courses), cd / 2));
  }
  P.add((lit ? mats.stoneWarm : mats.stone), bx(w + 0.24, 0.07, d + 0.34, 0, 0.035, (d + 0.34) / 2 - 0.17)); // hearthstone
  // the fire itself, small
  P.add(mats.timberDark, cyl(0.045, 0.045, openW * 0.7, 0, 0.16, d * 0.45, { seg: 6, rz: Math.PI / 2 }));
  P.add(mats.timberDark, cyl(0.04, 0.04, openW * 0.6, 0, 0.22, d * 0.45, { seg: 6, rz: Math.PI / 2, rx: 0.3 }));
  if (lit) P.add(mats.ember, bx(openW * 0.74, 0.14, d * 0.46, 0, 0.11, d * 0.46));
  P.flush(g);
  finish(g, 'hearth', { at, ry, extra: { openH } });
  if (!lit) return g;
  const card = glowCard({ w: openW * 1.15, h: openH * 0.92, ember: true, opacity: r.range(0.55, 0.66) });
  card.position.set(0, openH * 0.4, d + 0.16);
  const p = lightPool({ r: 1.35, ember: true, opacity: 0.55 });
  p.position.set(0, 0.02, d + 0.55);
  return withDecals(g, [card, p]);
}

/**
 * A lamp on a chain. `from` is the CEILING height, `at` the floor point
 * under it — the two ends of the drop, so the chain cannot be the wrong
 * length. The body is `airborne`, because it is held by the ceiling; the
 * pool it throws lands on the floor.
 */
export function hangingLamp({ from, drop = 0.55, seed = 'lamp', lit = true, at = [0, 0, 0], mats = interiorMats() } = {}) {
  if (typeof from !== 'number') throw new Error('[interiors] hangingLamp: `from` is the ceiling height — a chain has two ends');
  const r = rng(seed);
  const g = new THREE.Group();
  const P = pool();
  const bodyY = from - at[1] - drop;
  P.add(mats.metal, cyl(0.012, 0.012, drop, 0, bodyY + drop / 2, 0, { seg: 5 }));
  P.add(mats.metal, cyl(0.14, 0.09, 0.09, 0, bodyY + 0.05, 0, { seg: 9 }));       // shade
  P.add(mats.metal, cyl(0.05, 0.07, 0.06, 0, bodyY - 0.13, 0, { seg: 8 }));       // base
  P.add(lit ? mats.glow : mats.plaster, cyl(0.062, 0.062, 0.14, 0, bodyY - 0.05, 0, { seg: 9 }));
  P.flush(g, { cast: false });
  finish(g, 'hanging-lamp', { at, ry: 0, extra: { airborne: true, bodyY: at[1] + bodyY } });
  if (!lit) return g;
  const p = lightPool({ r: r.range(1.3, 1.6), opacity: 0.42 });
  p.position.set(0, 0.018, 0);
  return withDecals(g, [p]);
}
