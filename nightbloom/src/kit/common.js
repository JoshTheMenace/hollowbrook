import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cel, flat } from '../core/toon.js';
import { PAL } from '../palette.js';

/* ------------------------------------------------------------------ *
 * Yoizaka kit — shared vocabulary.
 *
 * THE KIT CONTRACT (every generator in this folder honours it):
 *
 *   1. `name(opts)` returns a THREE.Group whose ORIGIN IS AT GROUND
 *      LEVEL, at the assembly's plan centre.  A district does
 *      `g.position.set(x, ctx.groundAt(x, z), z)` and is done.
 *   2. The returned group carries `userData.prop = true` (the spatial
 *      audit's unit marker — see core/spatialcheck.js) and
 *      `userData.kit = '<generator>'`.  The topmost tagged node is the
 *      unit, so everything inside audits as ONE assembly: a wall-mounted
 *      sign inside a machiya can never be read as a floating unit.
 *   3. `opts.seed` drives every random choice through the local
 *      mulberry32 below.  Same seed, same building, forever.
 *   4. `opts.ry` yaws the whole assembly.  Frontages are authored facing
 *      LOCAL +Z (the craft convention), so `ry` is "which way does this
 *      thing look".
 *   5. Generators NEVER register colliders — districts own ctx.  Instead
 *      each generator exports `name.footprint(opts)` returning suggested
 *      collider rects `[{x0,z0,x1,z1}]` RELATIVE TO THE ORIGIN and
 *      already yawed by `opts.ry`, so a district writes:
 *          for (const r of machiya.footprint(o))
 *            ctx.collide(x + r.x0, z + r.z0, x + r.x1, z + r.z1);
 *      Generators with a WALKABLE top (stationHalt, footbridge,
 *      shrineHall) additionally export `name.surfaces(opts)` returning
 *      `[{x0,z0,x1,z1,top}]` for `ctx.platform`.
 *   6. Every lantern-glow mesh carries `userData.practical = true` (plus
 *      `practicalColor` / `practicalRadius`), so the game can find the
 *      town's light sources by traversal later.  Practicals are also
 *      `airborne` so they can never be mistaken for a floating unit if
 *      someone re-tags one.
 *   7. Roofs come from gableRoof/shedRoof, stairs from stairs(), banks
 *      from bankWedge, walls from wallRun — never a hand-rotated plane.
 *   8. Palette: amber `PAL.accent` belongs to shopfronts and the
 *      festival; blossom pink `PAL.accentCool` belongs to the shrine.
 *      Nothing else in this file may reach for either.  Practical light
 *      uses `PAL.warmLight`, which is the emissive role and is NOT the
 *      amber accent.
 * ------------------------------------------------------------------ */

/** Everything sits this far into the ground: no hairline, well inside the
 *  audit's 0.25 m buried tolerance. */
export const SINK = 0.03;

/* ---- determinism ---------------------------------------------------- */

/** mulberry32. Returns a function with `range`, `int`, `pick`, `chance`. */
export function rng(seed = 1) {
  let a = (Math.imul(seed | 0, 1831565813) + 0x6d2b79f5) >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + next() * (hi - lo);
  next.int = (lo, hi) => Math.floor(lo + next() * (hi - lo + 1));
  next.pick = (list) => list[Math.floor(next() * list.length)];
  next.chance = (p) => next() < p;
  return next;
}

/* ---- tones -----------------------------------------------------------
 * Every tone is a PAL role or a measured blend of two of them, so the
 * whole kit still retunes from src/palette.js in one edit.  `water` is
 * the one literal: it matches the terrain water tone src/scene.js hands
 * to core/terrain.js, and a canal that disagreed with the town's own
 * water would be a bug nothing could see.
 */
const mixHex = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
export const mix = mixHex;

export const TONE = Object.freeze({
  plaster: PAL.primary,
  plasterShade: mixHex(PAL.primary, PAL.trim, 0.20),
  cedar: PAL.secondary,
  cedarPale: mixHex(PAL.secondary, PAL.paper, 0.36),
  cedarDark: mixHex(PAL.secondary, PAL.ink, 0.40),
  tile: PAL.trim,
  tilePale: mixHex(PAL.trim, PAL.paper, 0.26),
  joinery: PAL.ink,
  paper: PAL.paper,
  stone: PAL.groundDark,
  stonePale: PAL.groundMid,
  stoneDeep: PAL.groundDeep,
  moss: mixHex(PAL.groundMid, 0xa8ab8a, 0.72), // matches scene.js's surrounds green
  water: 0x5a7e8e,                              // == scene.js terrainMaterials().water
  amber: PAL.accent,                            // shopfronts + festival ONLY
  blossom: PAL.accentCool,                      // shrine + charms ONLY
  glow: PAL.warmLight,                          // practicals everywhere
});

/* ---- materials -------------------------------------------------------
 * cel()/flat() cache internally, so one module-level table is one set of
 * shader programs for the whole city.  NEVER construct a Mesh*Material.
 */
export const M = Object.freeze({
  plaster: cel({ color: TONE.plaster }),
  plasterShade: cel({ color: TONE.plasterShade }),
  cedar: cel({ color: TONE.cedar }),
  cedarPale: cel({ color: TONE.cedarPale }),
  cedarDark: cel({ color: TONE.cedarDark }),
  tile: cel({ color: TONE.tile, bands: 4 }),
  tilePale: cel({ color: TONE.tilePale, bands: 4 }),
  joinery: cel({ color: TONE.joinery, bands: 2 }),
  paper: cel({ color: TONE.paper, bands: 'soft3' }),
  stone: cel({ color: TONE.stone }),
  stonePale: cel({ color: TONE.stonePale }),
  stoneDeep: cel({ color: TONE.stoneDeep }),
  moss: cel({ color: TONE.moss, bands: 4 }),
  amber: cel({ color: TONE.amber, bands: 3 }),
  blossom: cel({ color: TONE.blossom, bands: 'soft3' }),
  glass: cel({ color: PAL.glass, bands: 2, transparent: true, opacity: 0.46 }),
  water: flat({ color: TONE.water, transparent: true, opacity: 0.86 }),
  glow: flat({ color: TONE.glow }),
});

/* ---- geometry helpers ------------------------------------------------
 * Every generator is a list of geometries merged PER MATERIAL, which is
 * why a whole machiya is a dozen meshes rather than eighty.
 */

/** A box, optionally rotated (x, then z, then y) and translated. */
export function bx(w, h, d, x = 0, y = 0, z = 0, { rx = 0, rz = 0, ry = 0 } = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

/** A cylinder / cone / prism, same convention. `seg` 6 gives a hexagon. */
export function cyl(rTop, rBot, h, seg, x = 0, y = 0, z = 0, { rx = 0, rz = 0, ry = 0 } = {}) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

/**
 * A member spanning two JOINTS. Built from the two points, never from a
 * length plus an angle — a shared end is then shared by construction,
 * which is the whole discipline the architecture kit is built on.
 */
export function member(a, b, r, seg = 6) {
  const A = Array.isArray(a) ? new THREE.Vector3().fromArray(a) : a;
  const B = Array.isArray(b) ? new THREE.Vector3().fromArray(b) : b;
  const dir = new THREE.Vector3().subVectors(B, A);
  const g = new THREE.CylinderGeometry(r, r, dir.length(), seg);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()),
  ));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g;
}

/** A rectangular plank between two joints — a deck board on a camber, a
 *  brace, a barrier arm. Same joint rule as `member`. */
export function plank(a, b, w, t) {
  const A = Array.isArray(a) ? new THREE.Vector3().fromArray(a) : a;
  const B = Array.isArray(b) ? new THREE.Vector3().fromArray(b) : b;
  const dir = new THREE.Vector3().subVectors(B, A);
  const g = new THREE.BoxGeometry(dir.length(), t, w);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.clone().normalize()),
  ));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g;
}

/** Merge a geometry list into one mesh. Returns null for an empty list. */
export function meshOf(geoms, material, { cast = true, receive = true, name } = {}) {
  const list = geoms.filter(Boolean);
  if (!list.length) return null;
  const mesh = new THREE.Mesh(list.length === 1 ? list[0] : mergeGeometries(list), material);
  if (list.length > 1) list.forEach((g) => g.dispose());
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  if (name) mesh.name = name;
  return mesh;
}

/** `group.add(meshOf(...))`, skipping empties. */
export function addMesh(group, geoms, material, opts) {
  const mesh = meshOf(geoms, material, opts);
  if (mesh) group.add(mesh);
  return mesh;
}

/* ---- signage panels --------------------------------------------------
 * THE ASPECT RULE (core/texkit.js): a texture must land on a face whose
 * aspect matches its canvas, or it renders as an unreadable smear rather
 * than as an error.  So a printed panel is only ever given a WIDTH and
 * its native aspect — the height is derived, never passed.
 */
export const ASPECT = Object.freeze({ plate: 4, fascia: 6.4, notice: 3 / 4, noren: 2, nobori: 1 / 4 });

/**
 * One printed face at its native aspect. `width` is the only dimension
 * you choose; `aspect` comes from ASPECT.
 * Returns a Mesh with `userData.signH` = the derived height.
 */
export function printed(tex, width, aspect, { doubleSide = false, transparent = false } = {}) {
  const h = width / aspect;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, h), cel({
    map: tex,
    bands: transparent ? 'soft3' : 3,
    transparent,
    alphaTest: transparent ? 0.4 : 0,
    side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  }));
  mesh.castShadow = false;
  mesh.receiveShadow = !transparent;
  // carried by whatever it is nailed to; opt out of ground contact so a
  // sign can never be read as a floating unit
  mesh.userData.airborne = true;
  mesh.userData.signH = h;
  return mesh;
}

/** A printed face on a board: the panel plus a backing box 20 mm behind
 *  it, so the sign has a thickness and an ink silhouette. */
export function board(group, tex, width, aspect, { at = [0, 0, 0], ry = 0, mat = M.cedarPale, back = 0.05 } = {}) {
  const face = printed(tex, width, aspect);
  const h = face.userData.signH;
  face.position.set(at[0], at[1], at[2]);
  face.rotation.y = ry;
  group.add(face);
  const g = bx(width + 0.06, h + 0.06, back, 0, 0, -back / 2 - 0.005, { ry: 0 });
  g.rotateY(ry);
  g.translate(at[0], at[1], at[2]);
  addMesh(group, [g], mat, { cast: false });
  return face;
}

/* ---- markers ---------------------------------------------------------- */

/**
 * Mark a mesh as a PRACTICAL: a light source the scene reads as lit at
 * dusk and the game can find later by traversal.  Always `flat()` warm —
 * a toon-lit lantern goes dark exactly when it should be brightest.
 */
export function practical(mesh, { radius = 3.5, color = TONE.glow } = {}) {
  if (!mesh) return mesh;
  mesh.userData.practical = true;
  mesh.userData.practicalColor = color;
  mesh.userData.practicalRadius = radius;
  mesh.userData.airborne = true; // carried, never standing on the ground
  mesh.castShadow = false;
  return mesh;
}

/**
 * Hang N paper lanterns and return their glow meshes.
 *
 * ONE MESH PER LANTERN, deliberately: the shades could be merged into a
 * single glow mesh for one fewer draw call, but then the whole string is
 * one `userData.practical` at the merge centroid — and the game finds the
 * town's night lights by exactly that marker, so eight lanterns would
 * become one light in the middle of nowhere.  The hardware (caps and
 * cords), which nothing has to find, IS merged.
 *
 * `spots` are `[x, y, z]` with y the TOP of the shade — i.e. the point the
 * cord ties to, which is the joint a carrier (a rail, an eave, a catenary)
 * actually gives you.
 */
export function lanternRig(group, spots, {
  r = 0.16, h = 0.34, cord = 0.14, radius = 4, mat = M.cedarDark, name = 'lantern',
} = {}) {
  const hardware = [];
  const glows = [];
  spots.forEach(([x, y, z], i) => {
    const glow = addMesh(group, [cyl(r, r, h, 10, x, y - h / 2, z)], M.glow,
      { cast: false, receive: false, name: `${name}-${i}` });
    practical(glow, { radius });
    glows.push(glow);
    hardware.push(
      cyl(r * 0.74, r * 0.74, 0.05, 10, x, y + 0.015, z),
      cyl(r * 0.74, r * 0.74, 0.05, 10, x, y - h - 0.015, z),
      cyl(0.02, 0.02, cord, 6, x, y + cord / 2 + 0.04, z),
    );
  });
  addMesh(group, hardware, mat, { cast: false, name: `${name}-hardware` });
  return glows;
}

/**
 * Stamp the kit contract onto a finished assembly.
 * `joints` are LOCAL points a neighbour must butt to (per the builders.js
 * convention); `interact` names the obvious verb and the mesh a district
 * should hand to `ctx.interact` as its hitbox.
 */
export function asProp(group, kit, { joints = null, interact = null, airborne = false } = {}) {
  group.userData = {
    ...group.userData,
    prop: true,
    kit,
    ...(joints ? { joints } : {}),
    ...(interact ? { interact } : {}),
    ...(airborne ? { airborne: true } : {}),
  };
  return group;
}

/* ---- footprints ------------------------------------------------------- */

/**
 * The axis-aligned rect covering a `2hx × 2hz` box centred at (cx, cz) in
 * a frame yawed by `ry` — colliders are axis-aligned, so the yaw has to be
 * resolved once here rather than eyeballed at every district call site.
 * Rotation about Y maps local (x, z) to (x·cos + z·sin, −x·sin + z·cos),
 * the same derivation builders.js uses for its own colliders.
 */
export function rect(cx, cz, hx, hz, ry = 0) {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const lx = cx + sx * hx;
      const lz = cz + sz * hz;
      const wx = lx * c + lz * s;
      const wz = -lx * s + lz * c;
      x0 = Math.min(x0, wx); x1 = Math.max(x1, wx);
      z0 = Math.min(z0, wz); z1 = Math.max(z1, wz);
    }
  }
  return { x0, z0, x1, z1 };
}

/** `rect` with a `top` — a walkable surface for `ctx.platform`. */
export function surf(cx, cz, hx, hz, ry, top) {
  return { ...rect(cx, cz, hx, hz, ry), top };
}
