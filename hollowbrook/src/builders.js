import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addInk } from './materials.js';

/* ---- builder context -----------------------------------------------------
 * One ctx per scene: collects meshes, colliders, interactables, per-frame
 * updaters, and reset handlers, and reports diagnostics. Pass it to every
 * build function instead of touching the scene graph directly.
 */
export function createBuilder(root) {
  const colliders = [];
  const interactables = [];
  const platforms = [];
  const updaters = [];
  const resets = [];
  /* Enterable buildings (see core/interior.js). `interiors` is the list of
   * dressing groups the distance cull owns; `interiorFloors` is what the
   * spatial audit's seam grid needs in order to see INSIDE a building at
   * all — from above, the first surface over a room is its own roof. */
  const interiors = [];
  const interiorFloors = [];

  return {
    root,
    colliders,
    interactables,
    platforms,
    interiors,
    interiorFloors,
    add(object, name) {
      if (name) object.name = name;
      root.add(object);
      return object;
    },
    collide(x0, z0, x1, z1) {
      colliders.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
    },
    /**
     * A walkable raised surface: axis-aligned box top at height `top`.
     * `opts` is merged into the record; `{ interior: true }` marks a floor
     * INSIDE a building, which composeCity exempts from its "you are
     * laying ground" warning — that warning exists because a district
     * plate stops at the envelope and nobody owns what lies beyond it,
     * and a floor inside four walls cannot have that problem.
     */
    platform(x0, z0, x1, z1, top, opts = null) {
      platforms.push({
        x0: Math.min(x0, x1), z0: Math.min(z0, z1),
        x1: Math.max(x0, x1), z1: Math.max(z0, z1), top,
        ...(opts ?? {}),
      });
    },
    /**
     * Ground height at (x, z): the max over registered platforms, else 0.
     * The test is inclusive on all four edges — treads that merely *meet*
     * would otherwise be a knife edge a grid sampler falls through.
     */
    groundAt(x, z) {
      let y = 0;
      for (const p of platforms) {
        if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1 && p.top > y) y = p.top;
      }
      return y;
    },
    interact(entry) {
      interactables.push(entry);
      return entry;
    },
    update(step) {
      updaters.push(step);
    },
    reset(step) {
      resets.push(step);
    },
    /**
     * Step every updater. `eye` is the camera/player position and is passed
     * straight through — distance-culled interiors and auto-opening doors
     * need it, and an updater written before it existed takes one argument
     * and ignores the second. main.js calls `vignette.update(dt, camera.position)`.
     */
    step(dt, eye) {
      for (const update of updaters) update(dt, eye);
    },
    resetAll() {
      for (const reset of resets) reset();
    },
    diagnostics(renderer) {
      let meshes = 0;
      let triangles = 0;
      const materials = new Set();
      root.traverse((object) => {
        if (!object.isMesh) return;
        meshes += 1;
        const geometry = object.geometry;
        triangles += geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
        const list = Array.isArray(object.material) ? object.material : [object.material];
        list.forEach((material) => materials.add(material));
      });
      return {
        meshes,
        triangles,
        materials: materials.size,
        renderer: {
          calls: renderer.info.render.calls,
          lines: renderer.info.render.lines,
          points: renderer.info.render.points,
          triangles: renderer.info.render.triangles,
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
        },
      };
    },
  };
}

/* ---- geometry helpers --------------------------------------------------- */

const boxGeometries = new Map();

function boxGeometry(width, height, depth) {
  const key = `${width}:${height}:${depth}`;
  if (!boxGeometries.has(key)) boxGeometries.set(key, new THREE.BoxGeometry(width, height, depth));
  return boxGeometries.get(key);
}

export function box(width, height, depth, material, x = 0, y = 0, z = 0, ink = false) {
  const mesh = new THREE.Mesh(boxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = height > 0.3 && width * height * depth > 0.25;
  mesh.receiveShadow = true;
  return ink ? addInk(mesh) : mesh;
}

/** Merge many `[w, h, d, x, y, z, ry?]` boxes into one mesh (one draw call). */
export function mergedBoxes(specs, material) {
  const geometries = specs.map(([width, height, depth, x, y, z, rotation = 0]) => {
    const geometry = boxGeometry(width, height, depth).clone();
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationY(rotation));
    geometry.translate(x, y, z);
    return geometry;
  });
  const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
  geometries.forEach((geometry) => geometry.dispose());
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * A cylinder member spanning two joints. Build assemblies from joints, not
 * from part positions: a shared end is then shared by construction.
 */
export function tubeBetween(start, end, radius, material) {
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 7), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.receiveShadow = true;
  return mesh;
}

/* ---- architecture kit ----------------------------------------------------
 * Roof planes, stairs and terrain banks are NEVER hand-placed with guessed
 * rotations. Every part below is derived from shared joints and dimensions,
 * so misalignment is impossible by construction. Hand-placing these is the
 * single most common source of broken geometry in agent-built scenes:
 * floating roof planes, ridge caps at the wrong angle, knife-edge treads,
 * missing-ground gaps at terrace banks.
 */

/* True in the browser dev server AND headless in Node (where import.meta.env
 * does not exist); false only in a vite production build. The guards below
 * are diagnostics for the builder, so they must fire under the check scripts
 * too. */
const DEV = (import.meta.env && import.meta.env.DEV) ?? true;

const FILL_STRIDE_M = 0.35; // the route gate's stride — see stairs()
const MIN_GOING_M = 0.36;   // one stride must land on one tread

/** Clone the cached box geometry, rotate about one axis, translate. */
function partGeometry(width, height, depth, axis, angle, x, y, z, yaw = 0) {
  const geometry = boxGeometry(width, height, depth).clone();
  if (angle) {
    const m = new THREE.Matrix4();
    if (axis === 'x') m.makeRotationX(angle);
    else if (axis === 'z') m.makeRotationZ(angle);
    else m.makeRotationY(angle);
    geometry.applyMatrix4(m);
  }
  geometry.translate(x, y, z);
  if (yaw) geometry.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw));
  return geometry;
}

/**
 * The world AABB of a box that has been ROTATED — colliders are axis-aligned,
 * so it has to be derived once rather than eyeballed at every call site.
 * `(cx, cz)` is the box centre in the local frame, `(hx, hz)` its half
 * extents there, `ry` the frame's yaw, `(ox, oz)` the frame's world origin.
 * Rotation about Y maps local (x, z) to (x·cos + z·sin, −x·sin + z·cos).
 */
function rotatedFootprint(ox, oz, hx, hz, ry, cx = 0, cz = 0) {
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
      const wx = ox + lx * c + lz * s;
      const wz = oz - lx * s + lz * c;
      x0 = Math.min(x0, wx); x1 = Math.max(x1, wx);
      z0 = Math.min(z0, wz); z1 = Math.max(z1, wz);
    }
  }
  return { x0, z0, x1, z1 };
}

function meshFrom(geometries, material) {
  const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
  geometries.forEach((geometry) => geometry.dispose());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Gable roof over a `w` (x) by `d` (z) wall footprint. Origin is the CENTER
 * OF THE WALL TOP: place the returned group at (cx, wallTopY, cz) and you
 * are done — every plane, the ridge cap and the trim are derived from the
 * ridge line and the eave lines, never positioned by eye.
 *
 * Derivation (all in the section across the ridge):
 *   halfSpan = span/2 + overhang          // span = footprint across the ridge
 *   rise     = tan(pitch) * halfSpan      // eave-to-ridge height
 *   slopeLen = hypot(halfSpan, rise)      // length of one roof plane
 *   slope    = atan2(rise, halfSpan)      // === pitch, but derived, not copied
 * The plane mid-surface crosses y = 0 exactly at the wall line (±span/2), so
 * the wall top edge sits embedded mid-thickness in the roof: no gap, no
 * poke-through. Ridge joint: (0, ridgeY = tan(pitch)*span/2). Eave joint:
 * (±halfSpan, ridgeY − rise) — i.e. the overhang droops tan(pitch)*overhang
 * BELOW the wall top, as a real eave does.
 * Each plane is a box (ridgeLen × thickness × slopeLen) centered on the
 * MIDPOINT of its ridge and eave joints and rotated s·slope about the ridge
 * axis (a box along z rotated +t about X sends its +z end DOWN, so the side
 * whose eave is at +z gets +slope). Rotating slopeLen about the joint
 * midpoint lands both box edges exactly on the two joints.
 *
 * Returns a group with `userData = { ridgeY, eaveY, rise, slopeLen }`; build
 * the gable-end wall (prism/steps) up to `ridgeY` so it too embeds
 * mid-thickness.
 *
 * @example
 *   const roof = gableRoof({ w: 6, d: 5, pitch: 0.61, mat: roofMat, ridgeMat: trimMat });
 *   roof.position.set(10, 3, -4);          // wall-top center of a 6x3x5 house
 *   ctx.add(roof, 'house-roof');           // roof.userData.ridgeY -> gable apex
 */
export function gableRoof({ w, d, pitch, overhang = 0.35, thickness = 0.12, ridgeAxis = 'x', mat, ridgeMat, trimMat }) {
  const along = ridgeAxis === 'x' ? w : d;      // footprint length along the ridge
  const span = ridgeAxis === 'x' ? d : w;       // footprint across the ridge
  const halfSpan = span / 2 + overhang;
  const rise = Math.tan(pitch) * halfSpan;
  const slopeLen = Math.hypot(halfSpan, rise);
  const slope = Math.atan2(rise, halfSpan);
  const ridgeY = Math.tan(pitch) * (span / 2);  // wall line crosses mid-surface at y=0
  const eaveY = ridgeY - rise;
  const ridgeLen = along + 2 * overhang;
  const yaw = ridgeAxis === 'z' ? Math.PI / 2 : 0;

  const planes = [];
  for (const s of [-1, 1]) {
    // plane center = midpoint of ridge joint (0, ridgeY) and eave joint (s*halfSpan, eaveY)
    planes.push(partGeometry(ridgeLen, thickness, slopeLen, 'x', s * slope, 0, (ridgeY + eaveY) / 2, (s * halfSpan) / 2, yaw));
  }
  if (trimMat) {
    // Bargeboards: same joints, same derived rotation, at the two gable ends.
    for (const e of [-1, 1]) {
      for (const s of [-1, 1]) {
        planes.push(partGeometry(0.055, thickness * 1.6, slopeLen + 0.02, 'x', s * slope,
          e * (ridgeLen / 2 + 0.028), (ridgeY + eaveY) / 2 - thickness * 0.15, (s * halfSpan) / 2, yaw));
      }
    }
  }

  const group = new THREE.Group();
  group.add(meshFrom(planes, mat));
  // Ridge cap: axis-aligned along the ridge, seated where the two top faces
  // cross the ridge plane: ridgeY + (thickness/2)/cos(slope).
  const capW = Math.max(0.2, thickness * 2.6);
  const capY = ridgeY + (thickness / 2) / Math.cos(slope);
  group.add(meshFrom([partGeometry(ridgeLen + 0.02, thickness, capW, 'x', 0, 0, capY, 0, yaw)], ridgeMat ?? mat));
  group.userData = { ridgeY, eaveY, rise, slopeLen };
  return group;
}

/**
 * Single-plane shed roof, same joint discipline as gableRoof. Origin at the
 * MID wall-top center: the plane mid-surface crosses y = 0 at the footprint
 * center, so the high wall must top out at `userData.highWallY`
 * (= tan(pitch)*span/2) and the low wall at `userData.lowWallY` — read them,
 * do not re-derive by hand. `downhill` is the direction the roof falls:
 * 'z+', 'z-', 'x+' or 'x-'.
 *
 * @example
 *   const roof = shedRoof({ w: 3, d: 2.5, pitch: 0.26, downhill: 'x+', mat });
 *   roof.position.set(0, 2.2, 0);                 // mid wall-top height
 *   // walls: high side to 2.2 + roof.userData.highWallY, low to 2.2 + lowWallY
 */
export function shedRoof({ w, d, pitch, overhang = 0.35, thickness = 0.12, downhill = 'z+', mat }) {
  const alongZ = downhill[0] === 'z';
  const span = alongZ ? d : w;
  const across = alongZ ? w : d;
  const dir = downhill[1] === '+' ? 1 : -1;
  // A shed plane spans the FULL footprint plus both overhangs — the gable
  // half-span derivation covers only half the walls (verified by raycast).
  const fullSpan = span + 2 * overhang;
  const rise = Math.tan(pitch) * fullSpan;
  const slopeLen = Math.hypot(fullSpan, rise);
  const slope = Math.atan2(rise, fullSpan);
  // Build falling toward +z (rx = +slope sends the +z end down), then yaw
  // into place: rotateY(+PI/2) maps +z to +x, rotateY(PI) maps +z to -z.
  const yaw = alongZ ? (dir === 1 ? 0 : Math.PI) : (dir === 1 ? Math.PI / 2 : -Math.PI / 2);
  const group = new THREE.Group();
  group.add(meshFrom([partGeometry(across + 2 * overhang, thickness, slopeLen, 'x', slope, 0, 0, 0, yaw)], mat));
  group.userData = {
    rise,
    slopeLen,
    highWallY: Math.tan(pitch) * (span / 2),
    lowWallY: -Math.tan(pitch) * (span / 2),
  };
  return group;
}

/**
 * A straight flight of stairs, authored IN WORLD COORDINATES (no rotated
 * group — the walkable registrations must stay axis-aligned). `at` is the
 * ground-level center of the flight's bottom edge; `dir` is the direction of
 * climb ('z-', 'z+', 'x+', 'x-'). Each tread is a solid block from the
 * ground to its own top, and consecutive treads OVERLAP by 40 mm — treads
 * that merely meet are a knife edge that height queries fall through. The
 * top tread overlaps 40 mm into the landing for the same reason: make the
 * landing platform/terrace start at or before the flight's far edge.
 *
 * With `ctx` passed, one `ctx.platform(...)` is registered per tread, so
 * `ctx.groundAt` can walk the flight. Returns the mesh, with
 * `userData = { topY, topEdge }` (topEdge = along-axis coordinate of the far
 * edge, overlap included).
 *
 * @example
 *   stairs({ w: 2, rise: 0.18, run: 0.3, steps: 6, dir: 'z-', at: [4, 0, 2], mat, ctx });
 */
export function stairs({ w, rise, run, steps, dir = 'z-', at = [0, 0, 0], mat, ctx }) {
  const PAD = 0.04; // flagship rule: treads overlap, never meet
  // A going under the route gate's own stride is not a steep flight, it is an
  // UNCLIMBABLE one: the fill steps 0.35 m along an axis, so a 0.28 m going
  // puts two treads inside one stride and the rise it measures is 2 x rise —
  // over the step limit, and a perfectly good flight is reported as sealed.
  // Warn, never throw: a decorative flight nobody has to climb is legal.
  if (DEV && run < MIN_GOING_M) {
    console.warn(`[builders] stairs: going ${run} m is under ${MIN_GOING_M} m. The route flood fill strides ${FILL_STRIDE_M} m, so one stride crosses two treads and measures a rise of ${(2 * rise).toFixed(2)} m — the flight will be reported unclimbable however good it is. Widen the going or accept that this flight is scenery.`);
  }
  const [ax, ay, az] = at;
  const alongZ = dir[0] === 'z';
  const sign = dir[1] === '+' ? 1 : -1;
  const specs = [];
  for (let i = 0; i < steps; i += 1) {
    const a0 = i * run;
    const a1 = (i + 1) * run + PAD;
    const top = ay + (i + 1) * rise;
    const mid = (a0 + a1) / 2;
    const cx = alongZ ? ax : ax + sign * mid;
    const cz = alongZ ? az + sign * mid : az;
    const h = top - ay;
    specs.push([alongZ ? w : a1 - a0, h, alongZ ? a1 - a0 : w, cx, ay + h / 2, cz]);
    if (ctx) {
      const x0 = alongZ ? ax - w / 2 : ax + sign * a0;
      const x1 = alongZ ? ax + w / 2 : ax + sign * a1;
      const z0 = alongZ ? az + sign * a0 : az - w / 2;
      const z1 = alongZ ? az + sign * a1 : az + w / 2;
      ctx.platform(x0, z0, x1, z1, top);
    }
  }
  const mesh = mergedBoxes(specs, mat);
  mesh.castShadow = true;
  mesh.userData = { topY: ay + steps * rise, topEdge: steps * run + PAD };
  return mesh;
}

/**
 * A handrail that CLIMBS. The one generic railing helper samples the ground
 * per post, which on a flight gives a rail floating at one end and buried at
 * the other — three districts hit it independently and the run sweep rejected
 * all three. So this one takes the flight's own two end joints and derives
 * everything from them:
 *
 *   run   = hypot(dx, dz)            // the flight's plan length
 *   rake  = atan2(dy, run)           // NEVER an argument: an angle passed in
 *                                    // can disagree with the joints it rides
 *   (nx, nz) = (-dz, dx) / run       // plan normal, so `side` is a lateral
 *                                    // offset to the flight's edge
 *
 * `from` / `to` are world `[x, y, z]` on the flight's WALKING SURFACE — the
 * bottom joint at the foot's ground level, the top joint at `stairs()`'
 * `userData.topY` over its `topEdge`. Posts are spaced evenly ALONG that
 * line, each one plumb and each one standing on it, so the rail is parallel
 * to the treads by construction. `side` offsets the whole rail perpendicular
 * to the climb: `side: +w/2 + 0.05` and `-w/2 - 0.05` give a rail on each
 * edge of a `w`-wide flight.
 *
 * The posts stand on a raked STRINGER `sink` deep, and that member is not
 * decoration. A flight's treads are a sawtooth about the rake line, so a rail
 * carried on posts alone has a base line that alternates between post feet
 * and the rail's own underside a metre higher — the audit cannot fit a rake
 * to that and falls back to judging the whole climbing rail against a level
 * base, which fails every time. A continuous member on the rake line is what
 * makes a raked run legible as one, and it is what a real stair rail is
 * carried on.
 *
 * `userData.joints` carries both ends of the rail (offset by `side`) and both
 * ends of the top rail, so a second flight's rail is butted to this one
 * rather than re-derived: `stairRail({ from: lower.userData.joints.to, ... })`.
 *
 * @example
 *   const flight = stairs({ w: 2.2, rise: 0.24, run: 0.4, steps: 10, dir: 'z+', at: [-2, 0, 8], mat, ctx });
 *   for (const s of [-1, 1]) ctx.add(stairRail({
 *     from: [-2, 0, 8], to: [-2, flight.userData.topY, 8 + flight.userData.topEdge],
 *     side: s * 1.15, sink: 0.24, mat: ironMat,
 *   }), `flight-rail${s}`);
 */
export function stairRail({ from, to, h = 0.95, post = 0.07, rail = 0.055, posts, sink = 0.09, mat, side = 0 }) {
  const A = new THREE.Vector3().fromArray(from);
  const B = new THREE.Vector3().fromArray(to);
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const dz = B.z - A.z;
  const run = Math.hypot(dx, dz);
  if (run < 1e-4) throw new Error('[builders] stairRail: from and to are the same point in plan — a rail needs a rake');
  const rake = Math.atan2(dy, run);
  const a = new THREE.Vector3(A.x + (-dz / run) * side, A.y, A.z + (dx / run) * side);
  const b = new THREE.Vector3(B.x + (-dz / run) * side, B.y, B.z + (dx / run) * side);

  const rakeLen = Math.hypot(run, dy);
  const n = Math.max(2, posts ?? Math.round(rakeLen / 1.15) + 1);
  const parts = [];

  // Stringer: one raked member joint to joint, its top face ON the rake line
  // and its soffit `sink` under it — which is exactly what a stair stringer
  // looks like in elevation, a straight line under a sawtooth.
  const dirUnit = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dirUnit);
  const down = new THREE.Vector3(0, -1, 0).applyQuaternion(q);
  // Tessellated along its length ON PURPOSE. A 5 m member authored with two
  // vertices has nothing in the middle of it, and every per-station sampler
  // in the toolchain — the audit's base-line fit, the planet bake's edge
  // subdivision — reads a run through its vertices. Two of them means the
  // audit cannot see the rake at all and judges a climbing rail against a
  // level base, which it then fails.
  const stringer = new THREE.BoxGeometry(post, sink, rakeLen, 1, 1, Math.max(2, Math.ceil(rakeLen / 0.4)));
  stringer.applyMatrix4(new THREE.Matrix4().compose(
    a.clone().add(b).multiplyScalar(0.5).add(down.clone().multiplyScalar(sink / 2)),
    q, new THREE.Vector3(1, 1, 1),
  ));
  parts.push(stringer);

  for (let i = 0; i < n; i += 1) {
    const p = a.clone().lerp(b, i / (n - 1));
    parts.push(boxGeometry(post, h, post).clone().translate(p.x, p.y + h / 2, p.z));
  }

  // Top rail: joint to joint, `h` over the rake line at both ends, so it is
  // parallel to the flight by construction. Over-length at each end for the
  // nosing return a real handrail has.
  const r0 = new THREE.Vector3(a.x, a.y + h, a.z);
  const r1 = new THREE.Vector3(b.x, b.y + h, b.z);
  const dir = r1.clone().sub(r0);
  const railGeom = new THREE.CylinderGeometry(rail / 2, rail / 2, dir.length() + 0.12, 8);
  railGeom.applyMatrix4(new THREE.Matrix4()
    .makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()))
    .setPosition(r0.clone().add(r1).multiplyScalar(0.5)));
  parts.push(railGeom);

  const group = new THREE.Group();
  group.add(meshFrom(parts, mat));
  group.userData = {
    prop: true,
    rake,
    joints: { from: a.toArray(), to: b.toArray(), railFrom: r0.toArray(), railTo: r1.toArray() },
  };
  return group;
}

/**
 * A standalone pier: the thing a wall ENDS in, the post a gate hangs on, and
 * the way a wall is gapped for an opening. `wallRun` builds its own from
 * this, so there is one implementation.
 *
 * `at` is `[x, y, z]` with y the BASE — take it from `ctx.groundAt(x, z)`,
 * never from memory. The base sinks 0.06 so no hairline shows, and the pier
 * stands `h` proud of that.
 *
 * GATE WIDTHS: a collider is inflated by the player's 0.34 m radius on EVERY
 * side, so the usable opening between two piers is the clear gap between
 * their FACES minus 0.68 m. A 1.1 m gate — which reads perfectly well on the
 * page — is 0.42 m of walkable ground: a gate you can see through and not
 * walk through. 1.8 m of clear face-to-face gap is the working minimum, and
 * the flood fill is the only thing that finds it when it is not.
 *
 * @example
 *   const y = ctx.groundAt(9, 5.7);
 *   ctx.add(pier({ w: 0.56, d: 0.56, h: 1.4, at: [9, y, 5.7], mat, ctx }), 'gate-post-s');
 */
export function pier({ w = 0.56, d = 0.56, h = 1.4, at = [0, 0, 0], cap = true, capOver = 0.05, mat, capMat, ctx }) {
  const SINK = 0.06;
  const [x, y, z] = at;
  const group = new THREE.Group();
  const shaft = box(w, h + SINK, d, mat, x, y + (h - SINK) / 2, z);
  shaft.castShadow = true;
  group.add(shaft);
  if (cap) {
    // Thin overhanging copings must not cast: at this cascade size a 50 mm
    // overhang's own shadow lands as a row of sawtooth triangles on the face.
    const capMesh = box(w + capOver * 2, 0.09, d + capOver * 2, capMat ?? mat, x, y + h + 0.045, z);
    capMesh.castShadow = false;
    group.add(capMesh);
  }
  if (ctx) ctx.collide(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
  group.userData = { prop: true, topY: y + h + (cap ? 0.09 : 0), footprint: [w, d] };
  return group;
}

/**
 * A boundary wall that STEPS with the ground. Two districts wrote their own
 * because the generic run helper lays a level beam: grounded at one end,
 * see-through under the rest — the FLOAT-RUN the spatial audit exists to
 * catch. Here the run is cut into panels and EVERY PANEL IS SEATED ON ITS
 * OWN GROUND:
 *
 *   base_k = min(groundAt over the panel) − 0.06   // never above the ground
 *   top_k  = max(groundAt over the panel) + h      // `h` measured on the
 *                                                  // high side, as a wall is
 *
 * so the coping steps up the slope and the foot follows it down. Panel length
 * is not a constant: it is whatever keeps the ground's fall across one panel
 * under `stepMax`, between 0.35 m and `panel`. `stepMax` is 0.28 for a
 * measured reason — a panel narrower than a metre is ground-probed at its
 * CENTRE only, and a base seated on the panel's low end therefore reads as
 * half the fall plus the foot embed under the ground there. Half of 0.28 plus
 * 0.06 is 0.20, inside the audit's 0.25 m buried tolerance; a 0.4 m step is
 * outside it and every stepped panel fails. On flat ground consecutive
 * panels with the same base and top are COALESCED back into one long panel —
 * a flat wall is one mesh and one swept unit, a stepped wall is the courses
 * it really is.
 *
 * `points` is a world polyline of `[x, z]` (a `[x, y, z]` triple is accepted
 * and its y ignored — the ground decides the height, not the caller).
 *
 * EVERY RUN ENDS IN A PIER, and so does every corner: 2 m of wall stopping in
 * mid-air reads as a grey card standing on the paving, which is a documented
 * shipped defect in the flagship this pipeline descends from. `piers` adds
 * intermediate ones at that spacing in metres. Panels are trimmed to the pier
 * faces so the two do not interpenetrate.
 *
 * Registers ONE COLLIDER PER PANEL (each the AABB of its own rotated box) —
 * never one box along the chord, which on a dog-leg fences off ground that is
 * open and lets the player through ground that is not.
 *
 * @example
 *   ctx.add(wallRun({ points: [[9, 8], [9, 15], [14, 15]], h: 1.2, mat, copingMat, ctx }), 'yard-wall');
 */
export function wallRun({
  points, h = 1.2, thick = 0.4, coping = true, copingOver = 0.06, piers,
  stepMax = 0.28, panel = 1.6, mat, copingMat, ctx, collide = true,
}) {
  if (!points || points.length < 2) throw new Error('[builders] wallRun: needs at least two points');
  const groundAt = ctx?.groundAt ? (x, z) => ctx.groundAt(x, z) : () => 0;
  const PAD = 0.01;  // panels overlap rather than meet: a butt joint is a slit
  const SINK = 0.06;
  const MAX_BURY = 0.18; // headroom under the audit's 0.25 m buried tolerance
  const pierW = thick + 0.16;
  const PIER_CAP = 0.05;
  // Trim to the pier's CAP, not to its shaft: the cap oversails by `PIER_CAP`
  // and the panel beside it is as tall as the cap is high, so trimming to the
  // shaft drives 0.08 m of panel through the cap — 16 % of the smaller unit,
  // which is an OVERLAP failure and not a subtle one.
  const pierTrim = pierW / 2 + PIER_CAP + PAD;

  const P = points.map((p) => (p.length === 3 ? [p[0], p[2]] : [p[0], p[1]]));
  const segs = [];
  let total = 0;
  for (let i = 0; i < P.length - 1; i += 1) {
    const len = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]);
    segs.push({ a: P[i], b: P[i + 1], len, s0: total, ry: Math.atan2(-(P[i + 1][1] - P[i][1]), P[i + 1][0] - P[i][0]) });
    total += len;
  }
  // world point and bearing at arc length s along the polyline
  const at = (s) => {
    const seg = segs.find((g) => s <= g.s0 + g.len + 1e-6) ?? segs[segs.length - 1];
    const t = Math.min(Math.max((s - seg.s0) / seg.len, 0), 1);
    return { x: seg.a[0] + (seg.b[0] - seg.a[0]) * t, z: seg.a[1] + (seg.b[1] - seg.a[1]) * t, ry: seg.ry };
  };

  // Pier stations: both ends and every corner, always; `piers` adds spacing.
  // The interval DIVIDES the run's own length rather than marching a fixed
  // step: a fixed step leaves the last interior pier wherever the remainder
  // falls, and on a 12.6 m run with piers: 6 that is two piers 0.6 m apart
  // whose boxes interpenetrate -- the audit flags it, correctly, and it is
  // invisible in a render because one pier hides inside the other.
  const stations = new Set([0, total]);
  for (const seg of segs.slice(1)) stations.add(seg.s0);
  if (piers > 0) {
    const n = Math.max(1, Math.round(total / piers));
    const step = total / n;
    for (let i = 1; i < n; i += 1) stations.add(i * step);
  }
  const stops = [...stations].sort((p, q) => p - q);

  const group = new THREE.Group();
  const panels = [];

  for (let i = 0; i < stops.length - 1; i += 1) {
    const s0 = stops[i] + pierTrim;
    const s1 = stops[i + 1] - pierTrim;
    if (s1 - s0 < 0.12) continue;
    // March, do not divide: panel length comes from the ground under THIS
    // panel. Averaging the fall over the whole stretch gives even panels and
    // one 0.9 m step where the bank starts.
    const span = (pa, pb) => {
      let low = Infinity;
      let high = -Infinity;
      for (let j = 0; j <= 4; j += 1) {
        const p = at(pa + ((pb - pa) * j) / 4);
        const y = groundAt(p.x, p.z);
        low = Math.min(low, y);
        high = Math.max(high, y);
      }
      return { low, high, fall: high - low };
    };
    for (let s = s0; s < s1 - 1e-6;) {
      let len = Math.min(panel, s1 - s);
      for (let guard = 0; guard < 8; guard += 1) {
        const { fall } = span(s, s + len);
        if (fall <= stepMax || len <= 0.35) break;
        len = Math.max(0.35, (len * stepMax) / fall);
      }
      if (s1 - s - len < 0.35) len = s1 - s; // never leave a sliver panel
      const { low, high } = span(s, s + len);
      const c = at(s + len / 2);
      // Seat on the panel's LOW ground, but never more than MAX_BURY under the
      // ground at its own centre — which is the one point a short panel is
      // probed at, and where an over-long last panel would otherwise read as
      // buried. The clamp only bites when the fall beat `stepMax`.
      panels.push({ s0: s, s1: s + len, base: Math.max(low - SINK, groundAt(c.x, c.z) - MAX_BURY), top: high + h });
      s += len;
    }
  }

  // Flat ground: fold neighbours that agree back into one panel, so a level
  // wall is one mesh and one swept run rather than eight point-checked stubs.
  const merged = [];
  for (const p of panels) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.s1 - p.s0) < 1e-6 && Math.abs(last.base - p.base) < 1e-3 &&
        Math.abs(last.top - p.top) < 1e-3 && Math.abs(at(last.s0 + 1e-3).ry - at(p.s0 + 1e-3).ry) < 1e-6) {
      last.s1 = p.s1;
    } else merged.push({ ...p });
  }

  for (const p of merged) {
    const mid = at((p.s0 + p.s1) / 2);
    const len = p.s1 - p.s0 + PAD * 2;
    const height = p.top - p.base;
    const cy = p.base + height / 2;
    const unit = new THREE.Group();
    const wall = mergedBoxes([[len, height, thick, mid.x, cy, mid.z, mid.ry]], mat);
    wall.castShadow = true;
    unit.add(wall);
    if (coping) {
      // Overhangs ACROSS the wall only. Overhanging the ends too makes two
      // copings of a stepped run overlap in plan, which z-fights wherever the
      // step is shallower than the coping is thick.
      const cap = mergedBoxes([[len, 0.09, thick + copingOver * 2, mid.x, p.top + 0.045, mid.z, mid.ry]], copingMat ?? mat);
      cap.castShadow = false; // sawtooth self-shadow at this cascade size
      unit.add(cap);
    }
    // One collider per panel — the AABB of THIS box, derived from its own
    // rotation, not one box along the whole chord.
    if (collide && ctx) {
      const r = rotatedFootprint(mid.x, mid.z, len / 2, thick / 2, mid.ry);
      ctx.collide(r.x0, r.z0, r.x1, r.z1);
    }
    unit.userData = { prop: true, base: p.base, top: p.top };
    group.add(unit);
  }

  for (const s of stops) {
    const p = at(s);
    const y = groundAt(p.x, p.z);
    // A pier stands proud of the coping beside it — that is what makes it
    // read as a termination rather than as the wall simply stopping.
    group.add(pier({ w: pierW, d: pierW, h: h + 0.18, capOver: PIER_CAP, at: [p.x, y, p.z], mat, capMat: copingMat, ctx }));
  }

  group.userData = { panels: merged, piers: stops.map((s) => at(s)), length: total };
  return group;
}

/**
 * A bench. Two districts cut their own out of pooled boxes, which is how a
 * city ends up with two benches.
 *
 * `facing` is THE DIRECTION THE SITTER LOOKS — `[dx, dz]` (or radians in the
 * same convention) — and the yaw is derived from it. It is deliberately not a
 * raw `ry`: a bench's rotation is a function of which side of the space it
 * stands on, so a pair written with one constant is guaranteed to be wrong
 * for one of them. Two benches facing each other across a court are
 * `facing: [0, 1]` and `facing: [0, -1]`, and neither is a number anyone had
 * to work out.
 *
 * `at` is `[x, y, z]` with y the ground — `ctx.groundAt(x, z)`.
 *
 * @example
 *   const y = ctx.groundAt(-4, 2);
 *   ctx.add(bench({ at: [-4, y, 2], facing: [0, 1], mat: timber, ctx }), 'court-bench-n');
 */
export function bench({ w = 1.6, seatH = 0.45, back = true, at = [0, 0, 0], facing = [0, 1], mat, ctx, collide = true }) {
  const SINK = 0.02;
  const d = 0.46;          // seat depth
  const t = 0.055;         // slat thickness
  const leg = 0.09;
  const backH = 0.86;
  // Authored with the sitter looking +z (the back at -z), then turned: a
  // group yawed by ry maps local +z to (sin ry, cos ry).
  const ry = typeof facing === 'number' ? facing : Math.atan2(facing[0], facing[1]);

  const specs = [];
  for (const s of [-1, 1]) {
    const lx = s * (w / 2 - leg / 2 - 0.05);
    specs.push([leg, seatH, leg, lx, seatH / 2, -d / 2 + leg]);        // rear leg
    specs.push([leg, seatH, leg, lx, seatH / 2, d / 2 - leg / 2]);     // front leg
    specs.push([leg, 0.06, d, lx, seatH - 0.03, 0]);                   // bearer
    if (back) specs.push([leg, backH - seatH, leg, lx, (seatH + backH) / 2, -d / 2 + leg / 2]);
  }
  for (let i = 0; i < 3; i += 1) {                                      // seat slats
    specs.push([w, t, 0.13, 0, seatH + t / 2, -d / 2 + 0.12 + i * 0.16]);
  }
  if (back) {
    specs.push([w, 0.11, t, 0, seatH + 0.24, -d / 2 + leg / 2]);
    specs.push([w, 0.13, t, 0, backH - 0.09, -d / 2 + leg / 2]);
  }

  const group = new THREE.Group();
  const mesh = mergedBoxes(specs, mat);
  mesh.castShadow = true;
  group.add(mesh);
  group.position.set(at[0], at[1] - SINK, at[2]);
  group.rotation.y = ry;
  if (collide && ctx) {
    const r = rotatedFootprint(at[0], at[2], w / 2, d / 2, ry);
    ctx.collide(r.x0, r.z0, r.x1, r.z1);
  }
  group.userData = { prop: true, ry, seatY: at[1] + seatH };
  return group;
}

/**
 * An open-fronted working shelter — a bin store, a trolley bay, a vending
 * lean-to, a wood store. Boarded back and sides, posts and knee braces on the
 * open side, roof from `shedRoof` falling toward the opening.
 *
 * `w` is the width of the OPEN FRONT, `d` the depth back to the wall, `h` the
 * MID wall-top height (which is what `shedRoof` wants). The back wall's top
 * and the front posts' tops are READ off the roof's `userData.highWallY` /
 * `lowWallY` — never re-derived — and the side boards are cut individually to
 * the roof line, which is why the top edge of a side follows the rake exactly
 * instead of being a box that pokes through it.
 *
 * COLLIDERS: back and sides only. A box around an open-fronted structure is a
 * shelter you cannot stand in — it renders perfectly and the flood fill reads
 * the inside as unreachable with nothing anywhere reporting a problem. That
 * is a real shipped bug in the flagship, in exactly this shape.
 *
 * @example
 *   ctx.add(leanTo({ w: 3.2, d: 2.4, h: 2.3, open: 'z+', at: [-7, ctx.groundAt(-7, 3), 3], mat: timber, roofMat: tin, ctx }), 'bin-store');
 */
export function leanTo({ w = 3, d = 2.4, h = 2.3, pitch = 0.22, open = 'z+', posts = true, at = [0, 0, 0], mat, roofMat, ctx }) {
  const SINK = 0.02;
  const T = 0.09;    // board thickness
  const POST = 0.13;
  // Authored with the opening at local +z, then yawed: local +z maps to
  // (sin ry, cos ry), so 'x+' is a quarter turn and 'z-' a half.
  const ry = { 'z+': 0, 'x+': Math.PI / 2, 'z-': Math.PI, 'x-': -Math.PI / 2 }[open];
  if (ry === undefined) throw new Error(`[builders] leanTo: open must be 'z+', 'z-', 'x+' or 'x-' (got ${open})`);

  const group = new THREE.Group();
  const roof = shedRoof({ w, d, pitch, downhill: 'z+', mat: roofMat ?? mat });
  roof.position.set(0, h, 0);
  roof.userData.airborne = true; // carried by the frame below it, not the ground
  const { highWallY, lowWallY } = roof.userData;
  const slope = (highWallY - lowWallY) / d;
  const roofY = (z) => h + highWallY - slope * (z + d / 2); // roof mid-surface

  const specs = [];
  const backTop = roofY(-d / 2);
  specs.push([w, backTop, T, 0, backTop / 2, -d / 2 + T / 2]);
  // Side boards cut one by one to the roof line — a single box would either
  // stand clear of the rake or grow through it.
  const nBoards = Math.max(3, Math.round(d / 0.34));
  for (const s of [-1, 1]) {
    for (let i = 0; i < nBoards; i += 1) {
      const z0 = -d / 2 + (d * i) / nBoards;
      const z1 = -d / 2 + (d * (i + 1)) / nBoards;
      const top = roofY((z0 + z1) / 2);
      specs.push([T, top, z1 - z0, s * (w / 2 - T / 2), top / 2, (z0 + z1) / 2]);
    }
  }

  const braces = [];
  if (posts) {
    const pz = d / 2 - POST / 2;
    const postTop = roofY(pz);
    for (const s of [-1, 1]) {
      const px = s * (w / 2 - POST / 2);
      specs.push([POST, postTop, POST, px, postTop / 2, pz]);
      // Knee brace: post shoulder to a joint on the head plate, both real
      // points on the frame — never a length and an angle.
      braces.push([
        new THREE.Vector3(px, postTop - 0.78, pz),
        new THREE.Vector3(px - s * 0.6, postTop - 0.14, pz),
      ]);
    }
    specs.push([w - POST, 0.12, POST, 0, postTop - 0.06, pz]); // head plate
  }

  const frame = mergedBoxes(specs, mat);
  frame.castShadow = true;
  group.add(frame);
  for (const [p, q] of braces) group.add(tubeBetween(p, q, 0.045, mat));
  group.add(roof);
  group.position.set(at[0], at[1] - SINK, at[2]);
  group.rotation.y = ry;

  // Back and sides only. Never the open face.
  if (ctx) {
    const put = (cx, cz, hx, hz) => {
      const r = rotatedFootprint(at[0], at[2], hx, hz, ry, cx, cz);
      ctx.collide(r.x0, r.z0, r.x1, r.z1);
    };
    put(0, -d / 2 + T / 2, w / 2, T / 2);
    for (const s of [-1, 1]) put(s * (w / 2 - T / 2), 0, T / 2, d / 2);
  }
  group.userData = { prop: true, ry, backTopY: at[1] + backTop, frontTopY: at[1] + roofY(d / 2 - POST / 2) };
  return group;
}

/**
 * A closed terrain wedge whose TOP FACE exactly spans `from` -> `to` (both
 * [x, y, z]) at width `w` — for terrace banks and ramps. Sides, end caps and
 * bottom are all closed down to min(y) − skirt, so no missing-ground gap can
 * appear at any viewing angle. Face winding is derived from the centroid, so
 * it cannot be built inside-out. Authored in world coordinates.
 *
 * @example
 *   bankWedge({ from: [8, 1.5, -2], to: [8, 0, 4], w: 5, mat: earthMat });
 */
export function bankWedge({ from, to, w, mat, skirt = 0.15 }) {
  const [fx, fy, fz] = from;
  const [tx, ty, tz] = to;
  const dx = tx - fx;
  const dz = tz - fz;
  const len = Math.hypot(dx, dz) || 1;
  const px = (-dz / len) * (w / 2);
  const pz = (dx / len) * (w / 2);
  const base = Math.min(fy, ty) - skirt;

  const A1 = [fx + px, fy, fz + pz];
  const A2 = [fx - px, fy, fz - pz];
  const B1 = [tx + px, ty, tz + pz];
  const B2 = [tx - px, ty, tz - pz];
  const dn = (v) => [v[0], base, v[2]];
  const centroid = [(fx + tx) / 2, (base + Math.max(fy, ty)) / 2, (fz + tz) / 2];

  const positions = [];
  // Push one quad as two triangles, winding chosen so the normal points away
  // from the centroid — the flagship's quadTo rule: derive, never hand-wind.
  const quad = (a, b, c, d) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const out = [a[0] - centroid[0], a[1] - centroid[1], a[2] - centroid[2]];
    const flip = n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0;
    const tris = flip ? [a, c, b, a, d, c] : [a, b, c, a, c, d];
    for (const p of tris) positions.push(p[0], p[1], p[2]);
  };
  quad(A1, B1, B2, A2);                         // top
  quad(dn(A1), dn(A2), dn(B2), dn(B1));         // bottom
  quad(A1, dn(A1), dn(B1), B1);                 // side +
  quad(A2, B2, dn(B2), dn(A2));                 // side -
  quad(A1, A2, dn(A2), dn(A1));                 // cap at `from`
  quad(B1, dn(B1), dn(B2), B2);                 // cap at `to`

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals(); // non-indexed: per-face normals, which a wedge wants
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Seat an object on the ground by QUERY, not by eye: every scattered prop
 * (bushes, rocks, crates, barrels) goes through this — a prop seated from a
 * remembered ground height floats the moment the terrain under it changes.
 * Samples `groundAt(x, z)` at the object's origin and sinks it `sink` into
 * the surface so no hairline gap shows. With `maxSlope` set, the local slope
 * is measured (±0.3 m in both axes) and the function returns false WITHOUT
 * placing when the ground is too steep — skip that spot rather than leave a
 * prop hanging off a bank on one corner.
 *
 * @example
 *   const bush = makeBush();
 *   bush.position.set(x, 0, z);
 *   if (seatOnGround(bush, ctx.groundAt, { maxSlope: 0.5 })) ctx.add(bush);
 */
export function seatOnGround(obj, groundAt, { sink = 0.02, maxSlope } = {}) {
  const { x, z } = obj.position;
  if (maxSlope !== undefined) {
    const slope = Math.hypot(
      (groundAt(x + 0.3, z) - groundAt(x - 0.3, z)) / 0.6,
      (groundAt(x, z + 0.3) - groundAt(x, z - 0.3)) / 0.6,
    );
    if (slope > maxSlope) return false;
  }
  obj.position.y = groundAt(x, z) - sink;
  return true;
}

/* ---- enterable buildings -------------------------------------------------
 * A building you can walk into is not a mass with a painted door on it: it
 * is a SHELL — four wall volumes with a real hole in one of them, a floor,
 * and a ceiling under the roof. Two things about it are load-bearing and
 * both have been shipped wrong in this codebase's history:
 *
 *   1. A BUILDING'S SINGLE FOOTPRINT COLLIDER SEALS ITS OWN DOORWAY. One
 *      box over the whole plan is what every generator here registers, and
 *      it is correct for a solid mass; over a shell it means the room is
 *      tiled, dressed, platformed and lit, and NOTHING anywhere reports a
 *      problem — the flood fill simply says the interior waypoint is
 *      unreachable while a rendered frame shows an open door. So a shell
 *      emits ONE COLLIDER PER WALL SEGMENT with a gap at the opening, and
 *      `enterableColliders()` derives them from the same `door`/`windows`
 *      parameters the geometry is cut from, so the two cannot disagree.
 *   2. YOU CANNOT CARVE A RECESS INTO A BOX, and the same rule decides the
 *      interior faces: the walls are BOXES, not planes, so each one already
 *      has an inward-facing face wound outward from its own volume. `cel()`
 *      is single-sided; a wall drawn as a plane is a wall with no inside,
 *      and the room reads as open sky through the doorway.
 *
 * DOORWAY WIDTH IS ARITHMETIC, NOT TASTE. Every collider is inflated by the
 * player's 0.34 m radius on BOTH sides, so a 0.9 m door leaves 0.22 m of
 * walkable ground — a door you can see through and not walk through, the
 * same trap `pier()` documents for gates. The route gate strides 0.35 m, so
 * a 0.22 m band is not merely tight, it is invisible to the fill. 1.4 m of
 * clear opening leaves 0.72 m and lands at least two grid points; that is
 * the working minimum and it is warned about below.
 */

/** Clear door opening under which the route flood fill cannot see a door. */
export const DOOR_MIN_CLEAR_M = 1.4;
const DOOR_HARD_MIN_M = 1.1;
const SHELL_SINK_M = 0.06;

const SHELL_FACES = {
  'z+': { axis: 'x', normal: [0, 1] },
  'z-': { axis: 'x', normal: [0, -1] },
  'x+': { axis: 'z', normal: [1, 0] },
  'x-': { axis: 'z', normal: [-1, 0] },
};

const rectOf = (axis, a0, a1, c0, c1) => (axis === 'x'
  ? { x0: a0, x1: a1, z0: c0, z1: c1 }
  : { x0: c0, x1: c1, z0: a0, z1: a1 });

/**
 * The one description both the geometry and the colliders are cut from.
 * Everything downstream — wall boxes, collider boxes, the threshold, the
 * floor platform, the doorway handed to `makeDoorLeaf` — reads THIS.
 */
function shellPlan({
  w, d, h, at, groundY = 0, wallT = 0.28, floorRise = 0.1, floorT = 0.14,
  ceilH = 2.45, ceilT = 0.12, door, windows = [], name = 'shell',
}) {
  const [cx, cz] = at;
  const X0 = cx - w / 2;
  const X1 = cx + w / 2;
  const Z0 = cz - d / 2;
  const Z1 = cz + d / 2;
  const base = groundY - SHELL_SINK_M;
  const wallTopY = groundY + h;
  const floorTopY = groundY + floorRise;

  let ceilUnderY = floorTopY + ceilH;
  if (ceilUnderY + ceilT > wallTopY - 0.02) {
    const was = ceilH;
    ceilUnderY = wallTopY - 0.02 - ceilT;
    if (DEV) {
      console.warn(`[builders] hollowShell("${name}"): ceilH ${was} m puts the ceiling through the wall top ` +
        `(${(wallTopY - groundY).toFixed(2)} m of wall, floor ${floorRise} m proud). Clamped to ` +
        `${(ceilUnderY - floorTopY).toFixed(2)} m — raise the wall or lower the floor.`);
    }
  }
  if (ceilUnderY - floorTopY < 2.0 && DEV) {
    console.warn(`[builders] hollowShell("${name}"): ${(ceilUnderY - floorTopY).toFixed(2)} m of headroom — the ` +
      "player's eye is at 1.62 m, so anything under about 2.1 m reads as a crawl space from inside.");
  }

  // The z walls own the corners; the x walls run between them.
  const walls = {
    'z-': { face: 'z-', axis: 'x', a0: X0, a1: X1, c0: Z0, c1: Z0 + wallT },
    'z+': { face: 'z+', axis: 'x', a0: X0, a1: X1, c0: Z1 - wallT, c1: Z1 },
    'x-': { face: 'x-', axis: 'z', a0: Z0 + wallT, a1: Z1 - wallT, c0: X0, c1: X0 + wallT },
    'x+': { face: 'x+', axis: 'z', a0: Z0 + wallT, a1: Z1 - wallT, c0: X1 - wallT, c1: X1 },
  };

  const openings = [];
  const push = (spec, isDoor) => {
    const wall = walls[spec.face];
    if (!wall) throw new Error(`[builders] hollowShell("${name}"): face must be one of ${Object.keys(SHELL_FACES).join(', ')} (got ${spec.face})`);
    const mid = (wall.a0 + wall.a1) / 2;
    const width = spec.width;
    const o0 = mid + (spec.offset ?? 0) - width / 2;
    const o1 = o0 + width;
    if (o0 < wall.a0 + 0.18 || o1 > wall.a1 - 0.18) {
      throw new Error(`[builders] hollowShell("${name}"): a ${width} m opening at offset ${spec.offset ?? 0} on face ` +
        `${spec.face} runs into the corner — the wall spans ${(wall.a1 - wall.a0).toFixed(2)} m and an opening needs ` +
        '0.18 m of pier at each end to have a jamb at all.');
    }
    const sillY = isDoor ? floorTopY : floorTopY + (spec.sill ?? 0.95);
    const headY = sillY + spec.height;
    if (headY > wallTopY - 0.12) {
      throw new Error(`[builders] hollowShell("${name}"): opening on ${spec.face} heads out at ${headY.toFixed(2)} ` +
        `against a wall top of ${wallTopY.toFixed(2)} — there is no lintel, so the wall above it does not exist.`);
    }
    // Walkable means: it starts at the floor and a body fits through it.
    // That, and only that, is what leaves a gap in the collider run.
    const walkable = isDoor || ((sillY - floorTopY) <= 0.05 && (headY - sillY) >= 1.8);
    openings.push({ face: spec.face, axis: wall.axis, o0, o1, sillY, headY, isDoor, walkable, width });
  };
  if (!door) throw new Error(`[builders] hollowShell("${name}"): an enterable shell needs a \`door\``);
  push({ ...door, height: door.height ?? 2.05 }, true);
  for (const win of windows) push({ ...win, height: win.height ?? 0.95 }, false);

  const doorOpening = openings[0];
  if (doorOpening.width < DOOR_HARD_MIN_M) {
    throw new Error(`[builders] hollowShell("${name}"): a ${doorOpening.width} m door leaves ` +
      `${(doorOpening.width - 0.68).toFixed(2)} m of walkable ground once the player's 0.34 m radius is added to ` +
      `each jamb. Under ${DOOR_HARD_MIN_M} m that is not a door, it is a painted one.`);
  }
  if (DEV && doorOpening.width < DOOR_MIN_CLEAR_M) {
    console.warn(`[builders] hollowShell("${name}"): door clear ${doorOpening.width} m leaves ` +
      `${(doorOpening.width - 0.68).toFixed(2)} m walkable. The route fill strides 0.35 m, so under ` +
      `${DOOR_MIN_CLEAR_M} m it may report a perfectly good doorway as sealed. Widen it or expect to argue with the gate.`);
  }

  /* per-wall boxes and per-segment colliders, from the SAME opening list */
  const wallBoxes = [];
  const colliderBoxes = [];
  for (const wall of Object.values(walls)) {
    const mine = openings.filter((o) => o.face === wall.face).sort((p, q) => p.o0 - q.o0);
    let cursor = wall.a0;
    for (const o of mine) {
      if (o.o0 - cursor > 1e-4) {
        wallBoxes.push({ ...rectOf(wall.axis, cursor, o.o0, wall.c0, wall.c1), y0: base, y1: wallTopY, kind: 'pier' });
        colliderBoxes.push({ ...rectOf(wall.axis, cursor, o.o0, wall.c0, wall.c1), part: `${wall.face}-pier` });
      }
      // header over every opening; a sill wall under the ones you cannot walk through
      wallBoxes.push({ ...rectOf(wall.axis, o.o0, o.o1, wall.c0, wall.c1), y0: o.headY, y1: wallTopY, kind: 'header' });
      if (!o.isDoor && o.sillY > base + 0.02) {
        wallBoxes.push({ ...rectOf(wall.axis, o.o0, o.o1, wall.c0, wall.c1), y0: base, y1: o.sillY, kind: 'sill' });
      }
      if (!o.walkable) {
        colliderBoxes.push({ ...rectOf(wall.axis, o.o0, o.o1, wall.c0, wall.c1), part: `${wall.face}-window` });
      }
      cursor = o.o1;
    }
    if (wall.a1 - cursor > 1e-4) {
      wallBoxes.push({ ...rectOf(wall.axis, cursor, wall.a1, wall.c0, wall.c1), y0: base, y1: wallTopY, kind: 'pier' });
      colliderBoxes.push({ ...rectOf(wall.axis, cursor, wall.a1, wall.c0, wall.c1), part: `${wall.face}-pier` });
    }
  }

  const doorWall = walls[doorOpening.face];
  const normal = SHELL_FACES[doorOpening.face].normal;
  const OUT = 0.14;   // the doorstep, proud of the wall
  const IN = 0.08;    // overlap into the floor slab: platforms overlap, never meet
  const threshold = rectOf(
    doorWall.axis, doorOpening.o0, doorOpening.o1,
    doorWall.c0 - (normal[0] < 0 || normal[1] < 0 ? OUT : IN),
    doorWall.c1 + (normal[0] > 0 || normal[1] > 0 ? OUT : IN),
  );
  const doorCentre = doorWall.axis === 'x'
    ? [(doorOpening.o0 + doorOpening.o1) / 2, (doorWall.c0 + doorWall.c1) / 2]
    : [(doorWall.c0 + doorWall.c1) / 2, (doorOpening.o0 + doorOpening.o1) / 2];

  return {
    name,
    outer: { x0: X0, x1: X1, z0: Z0, z1: Z1 },
    room: { x0: X0 + wallT, x1: X1 - wallT, z0: Z0 + wallT, z1: Z1 - wallT },
    base, wallTopY, floorTopY, ceilUnderY, ceilTopY: ceilUnderY + ceilT, wallT, floorT,
    wallBoxes, colliderBoxes, openings,
    doorway: {
      face: doorOpening.face,
      centre: doorCentre,
      clear: doorOpening.width,
      sillY: doorOpening.sillY,
      headY: doorOpening.headY,
      normal,
      axisDir: doorWall.axis === 'x' ? [1, 0] : [0, 1],
      threshold,
    },
  };
}

/**
 * The collider run for an enterable shell: one box per wall segment, with a
 * GAP at the door. Exported so a district that builds its own shell geometry
 * can still get colliders that agree with it, and so the rule is stated in
 * one place: the doorway gap IS the route, and the moment a shell is given
 * one footprint collider the room behind it stops existing to every gate in
 * this pipeline while continuing to render perfectly.
 *
 * Takes exactly the same arguments as `hollowShell` and returns
 * `[{ x0, z0, x1, z1, part }]` in world coordinates.
 */
export function enterableColliders(spec) {
  return shellPlan(spec).colliderBoxes;
}

/**
 * A building you can walk into. Axis-aligned in world coordinates, like
 * `stairs()` and for the same reason: the walkable registrations and the
 * collider gap at the door have to be exact, and a rotated AABB is not.
 * A building facing another way changes `door.face`, not its yaw.
 *
 * Builds, and REGISTERS through `ctx`:
 *   - four wall volumes, split into piers / lintels / sills round every
 *     opening, each one a box so its inward face exists;
 *   - an optional inner lining in a second material, cut by the same
 *     openings, so the room has its own tone without a second geometry pass;
 *   - the interior floor slab (one `ctx.platform`) and the threshold through
 *     the doorway (another, overlapping both the slab and the ground —
 *     platforms overlap, never meet);
 *   - the ceiling, under the roof, which is what puts the room in the sun's
 *     shadow. That is the whole interior lighting story: dark by shadow,
 *     lifted by warm practicals (see src/interiors.js `hearth`/`hangingLamp`).
 *   - one collider per wall segment, with a gap at the door.
 *
 * THE GROUP IS NOT `userData.prop`-TAGGED, on purpose. Its bounding box
 * contains every prop in the room, and the spatial audit's OVERLAP test
 * would flag every one of them against it. A shell is support geometry, the
 * same as terrain and boundary walls; its own furniture is what gets tagged.
 *
 * The roof is the caller's: put `gableRoof` at `userData.wallTopY`.
 *
 * @example
 *   const shell = hollowShell({
 *     w: 6.4, d: 5.2, h: 3.1, at: [8, -4], groundY: ctx.groundAt(8, -4),
 *     door: { face: 'z+', offset: -0.6, width: 1.5 },
 *     windows: [{ face: 'z+', offset: 1.6, width: 1.0, height: 1.0 }],
 *     mats: { wall: M.render, inner: M.plaster, floor: M.boards, ceiling: M.beam },
 *     ctx, name: 'inn',
 *   });
 *   ctx.add(gableRoof({ w: 6.4, d: 5.2, pitch: 0.62, mat: M.thatch }), 'inn-roof')
 *      .position.set(8, shell.wallTopY, -4);
 */
export function hollowShell(spec) {
  const plan = shellPlan(spec);
  const { mats = {}, ctx, name = 'shell', lining = 0.035 } = spec;
  const wallMat = mats.wall;
  const innerMat = mats.inner ?? null;
  const floorMat = mats.floor ?? wallMat;
  const ceilMat = mats.ceiling ?? floorMat;

  const group = new THREE.Group();
  group.name = name;

  const specsOf = (boxes) => boxes.map((b) => [
    b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0,
    (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2,
  ]);

  const shellMesh = mergedBoxes(specsOf(plan.wallBoxes), wallMat);
  shellMesh.castShadow = true;      // this is what shades the room
  shellMesh.receiveShadow = true;
  shellMesh.name = `${name}-walls`;
  group.add(shellMesh);

  if (innerMat && lining > 0) {
    // Same split, inset to the room side. The lining's back plane is
    // coincident with the wall's inner face and never visible (back-face
    // culled behind the lining's own front face), so there is nothing to
    // z-fight: what the room sees is one surface, `lining` metres in.
    const inner = [];
    for (const b of plan.wallBoxes) {
      const towardRoom = {
        x: b.x1 <= plan.room.x0 + 1e-6 ? 1 : b.x0 >= plan.room.x1 - 1e-6 ? -1 : 0,
        z: b.z1 <= plan.room.z0 + 1e-6 ? 1 : b.z0 >= plan.room.z1 - 1e-6 ? -1 : 0,
      };
      if (!towardRoom.x && !towardRoom.z) continue;
      const y0 = Math.max(b.y0, plan.floorTopY - 0.05);
      const y1 = Math.min(b.y1, plan.ceilUnderY + 0.02);
      if (y1 - y0 < 0.05) continue;
      const x0 = towardRoom.x > 0 ? b.x1 : towardRoom.x < 0 ? b.x0 - lining : b.x0;
      const x1 = towardRoom.x > 0 ? b.x1 + lining : towardRoom.x < 0 ? b.x0 : b.x1;
      const z0 = towardRoom.z > 0 ? b.z1 : towardRoom.z < 0 ? b.z0 - lining : b.z0;
      const z1 = towardRoom.z > 0 ? b.z1 + lining : towardRoom.z < 0 ? b.z0 : b.z1;
      inner.push([x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]);
    }
    if (inner.length) {
      const liningMesh = mergedBoxes(inner, innerMat);
      liningMesh.castShadow = false;
      liningMesh.receiveShadow = true;
      liningMesh.name = `${name}-lining`;
      group.add(liningMesh);
    }
  }

  // floor + threshold: the slab runs 0.05 UNDER the walls so no hairline
  // shows at the skirting, and the threshold overlaps both.
  const R = plan.room;
  const F = 0.05;
  const floorSpecs = [
    [R.x1 - R.x0 + F * 2, plan.floorT, R.z1 - R.z0 + F * 2,
      (R.x0 + R.x1) / 2, plan.floorTopY - plan.floorT / 2, (R.z0 + R.z1) / 2],
    [plan.doorway.threshold.x1 - plan.doorway.threshold.x0, plan.floorT,
      plan.doorway.threshold.z1 - plan.doorway.threshold.z0,
      (plan.doorway.threshold.x0 + plan.doorway.threshold.x1) / 2, plan.floorTopY - plan.floorT / 2,
      (plan.doorway.threshold.z0 + plan.doorway.threshold.z1) / 2],
  ];
  const floorMesh = mergedBoxes(floorSpecs, floorMat);
  floorMesh.castShadow = false;
  floorMesh.receiveShadow = true;
  floorMesh.name = `${name}-floor`;
  group.add(floorMesh);

  const ceilMesh = mergedBoxes([[
    R.x1 - R.x0 + F * 2, plan.ceilTopY - plan.ceilUnderY, R.z1 - R.z0 + F * 2,
    (R.x0 + R.x1) / 2, (plan.ceilUnderY + plan.ceilTopY) / 2, (R.z0 + R.z1) / 2,
  ]], ceilMat);
  ceilMesh.castShadow = true;
  ceilMesh.receiveShadow = true;
  ceilMesh.name = `${name}-ceiling`;
  group.add(ceilMesh);

  if (ctx) {
    for (const c of plan.colliderBoxes) ctx.collide(c.x0, c.z0, c.x1, c.z1);
    ctx.platform(R.x0 - F, R.z0 - F, R.x1 + F, R.z1 + F, plan.floorTopY, { interior: true });
    const T = plan.doorway.threshold;
    ctx.platform(T.x0, T.z0, T.x1, T.z1, plan.floorTopY, { interior: true });
    /* The seam grid casts down from above everything, so inside a building
     * it lands on the ROOF and the interior floor is checked by nothing.
     * Registering the room here is what lets the audit drop its ray under
     * the ceiling instead. */
    ctx.interiorFloors?.push({
      name, x0: R.x0, z0: R.z0, x1: R.x1, z1: R.z1,
      floorY: plan.floorTopY, ceilY: plan.ceilUnderY,
    });
  }

  group.userData = {
    kind: 'shell',
    shell: true,
    wallTopY: plan.wallTopY,
    floorTopY: plan.floorTopY,
    ceilUnderY: plan.ceilUnderY,
    room: plan.room,
    doorway: plan.doorway,
  };
  return {
    group,
    colliderBoxes: plan.colliderBoxes,
    doorway: plan.doorway,
    room: plan.room,
    wallTopY: plan.wallTopY,
    floorTopY: plan.floorTopY,
    ceilUnderY: plan.ceilUnderY,
    openings: plan.openings,
  };
}
