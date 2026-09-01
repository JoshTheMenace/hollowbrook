import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 * Enterable buildings — the runtime half.
 *
 * SEAMLESS, ONE WORLD.  There is no cell load, no fade, no teleport and
 * no second scene.  An interior is ordinary geometry in the ordinary
 * world, inside the building's footprint, on the same height query and
 * in the same collider list as the street outside it.  That is not an
 * aesthetic preference: EVERY gate in this pipeline — the flood fill,
 * the spatial audit, the camera gate, the seam checks — works because
 * there is one coordinate space, one `groundAt` and one `colliders`.
 * A loaded interior is a second world and none of them can see into it.
 *
 * So the only thing this file does at runtime is DISTANCE CULLING, and
 * the distinction matters:
 *
 *   - what is culled is the DRESSING, never the shell.  The walls, the
 *     floor and the ceiling are the building; they are always drawn,
 *     because a doorway is a hole and a hole with nothing behind it is
 *     a window onto the sky.  What is worth culling is the furniture,
 *     the goods and the practicals, which is where the 30-60 meshes an
 *     interior costs actually live;
 *   - it is culling, not loading.  Nothing is created or destroyed and
 *     nothing streams: `group.visible` is set false past the radius and
 *     true inside it, with a couple of metres of hysteresis so a player
 *     standing on the boundary does not flicker.  Walk in and the
 *     furniture was always there.
 *
 * THE GATES MUST FORCE IT VISIBLE.  Culling is a runtime optimisation
 * and a check is not the runtime: `spatialcheck.js`'s down-cast skips
 * `!mesh.visible`, `check-city`'s terminus pass filters on it, and
 * three's raycaster has changed its mind about it between versions.  An
 * audit run against a culled interior reports every piece of furniture
 * in it as floating in mid-air, with nothing anywhere naming the cause.
 * `withInteriorsVisible(root, fn)` is the answer and both core checks
 * call it themselves, so a gate inherits the behaviour rather than
 * having to remember it.
 *
 * PER-FRAME PLUMBING.  `ctx.update(fn)` collects updaters and
 * `ctx.step(dt, eye)` runs them; main.js passes `camera.position` as
 * `eye`.  An updater written before this change takes one argument and
 * ignores the second, so nothing else had to move.  A registered
 * interior starts VISIBLE and is only ever culled once an eye has
 * actually been supplied — a headless gate that never steps the world
 * therefore sees a fully dressed room.
 * ------------------------------------------------------------------ */

const DEV = (import.meta.env && import.meta.env.DEV) ?? true;

/** Past this from the door, an interior's dressing stops being drawn. */
export const INTERIOR_RADIUS_M = 25;
/** Extra metres before it is culled again, so the boundary cannot flicker. */
export const INTERIOR_HYSTERESIS_M = 2;

const xz = (p) => (p.length === 2 ? [p[0], p[1]] : [p[0], p[2]]);

/**
 * Mark a group as one interior's dressing and cull it by distance from
 * its own door.
 *
 * Pass the DRESSING — the furniture, the goods, the practicals — not the
 * shell.  `hollowShell` builds the walls, floor and ceiling and those stay
 * drawn: they are the building seen from the street, and the doorway is a
 * hole through them.
 *
 * @param {object} ctx      the builder ctx (wrapped, in a city)
 * @param {THREE.Group} group the dressing group, already added with ctx.add
 * @param {object} o
 * @param {number[]|object} o.door  `[x, z]`, `[x, y, z]`, or the `doorway`
 *        object `hollowShell` returns (its `centre` is used) — the point the
 *        player's distance is measured from, so the room is dressed by the
 *        time they are at the threshold
 * @param {number} [o.radius=25]
 * @param {string} [o.name]  for the report; defaults to the group's name
 * @returns {THREE.Group} the same group
 *
 * @example
 *   const room = new THREE.Group();
 *   dressTheRoom(room);
 *   ctx.add(room, 'inn-interior');
 *   registerInterior(ctx, room, { door: shell.doorway });
 */
export function registerInterior(ctx, group, { door, radius = INTERIOR_RADIUS_M, hysteresis = INTERIOR_HYSTERESIS_M, name } = {}) {
  if (!group || !group.isObject3D) throw new Error('[interior] registerInterior: needs an Object3D');
  const at = Array.isArray(door) ? xz(door) : (door && Array.isArray(door.centre) ? xz(door.centre) : null);
  if (!at) {
    throw new Error('[interior] registerInterior: `door` must be [x, z], [x, y, z], or the doorway object ' +
      'hollowShell returns. The cull radius is measured from the door, not from the room centre, so a player ' +
      'at the threshold is always looking at a dressed room.');
  }
  const [dx, dz] = at;
  group.userData = {
    ...group.userData,
    interior: true,
    interiorDoor: [dx, dz],
    interiorRadius: radius,
    interiorName: name ?? group.name ?? 'interior',
  };
  (ctx.interiors ??= []).push(group);

  // start visible: a gate that never supplies an eye must see a dressed room
  group.visible = true;
  let on = true;
  ctx.update((dt, eye) => {
    if (!eye) return;
    const d = Math.hypot(eye.x - dx, eye.z - dz);
    on = d < (on ? radius + hysteresis : radius);
    if (group.visible !== on) group.visible = on;
  });
  return group;
}

/**
 * Force every registered interior visible, run `fn`, restore.  EVERY gate
 * that raycasts, down-casts or counts geometry must do this: culling is a
 * runtime optimisation, and an audit that runs against a culled interior
 * reports its furniture as floating in open air.
 *
 * `spatialcheck.checkSpatial` and `camcheck.checkCamera` call it
 * themselves, so a script that goes through either one inherits it.
 */
export function withInteriorsVisible(root, fn) {
  const saved = [];
  root.traverse((o) => {
    if (o.userData && o.userData.interior === true) {
      saved.push([o, o.visible]);
      o.visible = true;
    }
  });
  try {
    return fn();
  } finally {
    for (const [o, v] of saved) o.visible = v;
  }
}

/** Every registered interior group under `root`, for gates and reports. */
export function interiorsIn(root) {
  const out = [];
  root.traverse((o) => { if (o.userData && o.userData.interior === true) out.push(o); });
  return out;
}

/**
 * Count the dressed props inside one interior: anything carrying
 * `userData.prop` or `userData.kind`, topmost tagged node only (a shelf's
 * jars are part of the shelf).  A declared interior that is a bare box is
 * worse than a painted window, which is why this is a gate and not a note.
 */
export function countInteriorProps(group) {
  let n = 0;
  (function walk(o) {
    const tagged = o.userData && (o.userData.prop === true || typeof o.userData.kind === 'string');
    if (tagged && o !== group) { n += 1; return; }
    for (const c of o.children) walk(c);
  })(group);
  return n;
}

/* ---- the door ------------------------------------------------------ */

const EASE_PER_S = 7;
const LEAF_GAP_M = 0.012;  // the hairline round a real leaf, top and sides

/**
 * A hinged door leaf that opens and shuts.
 *
 * TAKE THE `doorway` FROM `hollowShell` AND PASS IT IN WHOLE.  The leaf,
 * the wall opening and the collider gap then come from one set of numbers
 * and cannot drift apart — the same rule as `enterableColliders`, and the
 * reason neither of them takes a width of its own.
 *
 * PIVOT.  A door is a group AT THE HINGE with the leaf offset inside it;
 * it is never a mesh spun about its own centre, which puts the hinge edge
 * in the middle of the opening and swings half the leaf into the wall.
 * The hinge group's own yaw puts its local +x along the doorway toward the
 * free edge; the animation adds to that.  Which SIGN opens the door inward
 * is derived, not guessed: both are evaluated against the doorway's inward
 * normal and the one that moves the free edge into the room wins.
 *
 * NO COLLIDER, EVER.  A door leaf is slim frangible furniture in the one
 * place in a building that has to stay walkable; the doorway gap IS the
 * route, and a collider on the leaf seals it exactly when the door is
 * open.  (The same call `makeCone` and the bus-stop pole already make.)
 *
 * `E` is the primary opener because that is the pipeline's interaction
 * system and a district owes at least one interaction anyway; `auto: true`
 * additionally swings it when the player comes within `autoRadius`.
 *
 * @example
 *   const leaf = makeDoorLeaf({ doorway: shell.doorway, hinge: 'left',
 *     mat: M.door, ctx, label: 'E · open the door' });
 *   ctx.add(leaf, 'inn-door');
 */
export function makeDoorLeaf({
  doorway, hinge = 'left', swing = 1.92, thick = 0.07, inset = 0.02,
  mat, ironMat, ctx, auto = false, autoRadius = 2.6, open = false,
  label = 'E · open the door', name = 'door', interact = true,
}) {
  if (!doorway || !Array.isArray(doorway.centre)) {
    throw new Error('[interior] makeDoorLeaf: pass the `doorway` object hollowShell returns — the leaf and the ' +
      'wall opening must come from the same numbers');
  }
  const { centre, clear, sillY, headY, normal, axisDir } = doorway;
  const leafW = clear - LEAF_GAP_M * 2;
  const leafH = headY - sillY - LEAF_GAP_M;
  const [nx, nz] = normal;         // outward, away from the room
  const [ax, az] = axisDir;        // unit vector along the doorway, in plan

  // hinge on the left or right as seen from OUTSIDE, i.e. looking along -n
  const side = hinge === 'left' ? -1 : 1;
  const hx = centre[0] + ax * side * (clear / 2 - LEAF_GAP_M / 2) - nx * inset;
  const hz = centre[1] + az * side * (clear / 2 - LEAF_GAP_M / 2) - nz * inset;
  // the free edge lies from the hinge back along the doorway
  const fx = -ax * side;
  const fz = -az * side;
  // a group yawed by ry maps local +x to (cos ry, -sin ry)
  const ry0 = Math.atan2(-fz, fx);

  // which sign swings the leaf INTO the room?  Evaluate both against the
  // inward normal rather than reasoning about it — a door that opens the
  // wrong way renders perfectly and stands in the street.
  const edgeAt = (phi) => [Math.cos(ry0 + phi), -Math.sin(ry0 + phi)];
  const inward = (phi) => { const [ex, ez] = edgeAt(phi); return ex * -nx + ez * -nz; };
  const sign = inward(swing) >= inward(-swing) ? 1 : -1;

  const group = new THREE.Group();          // stationary: carries the frame
  const pivot = new THREE.Group();          // the hinge itself
  pivot.position.set(hx, sillY, hz);
  pivot.rotation.y = ry0;
  group.add(pivot);

  const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, leafH, thick), mat);
  leaf.position.set(leafW / 2, leafH / 2 + LEAF_GAP_M, 0);
  leaf.castShadow = true;
  leaf.receiveShadow = true;
  leaf.name = `${name}-leaf`;
  pivot.add(leaf);

  // Planked face and a handle, built OUTWARD from the leaf face — depth in
  // this pipeline is never a panel written behind a surface.
  const boards = Math.max(3, Math.round(leafW / 0.24));
  const trimGeoms = [];
  for (let i = 1; i < boards; i += 1) {
    const g = new THREE.BoxGeometry(0.02, leafH - 0.1, thick + 0.012);
    g.translate(leafW * (i / boards), leafH / 2 + LEAF_GAP_M, 0);
    trimGeoms.push(g);
  }
  for (const y of [leafH * 0.22, leafH * 0.78]) {
    const g = new THREE.BoxGeometry(leafW - 0.05, 0.07, thick + 0.02);
    g.translate(leafW / 2, y, 0);
    trimGeoms.push(g);
  }
  const handle = new THREE.BoxGeometry(0.05, 0.05, 0.16);
  handle.translate(leafW - 0.13, leafH * 0.48, -(thick / 2 + 0.06));
  trimGeoms.push(handle);
  const trim = new THREE.Mesh(mergeMany(trimGeoms), ironMat ?? mat);
  trim.castShadow = false;
  trim.receiveShadow = true;
  trim.name = `${name}-ironwork`;
  pivot.add(trim);

  let want = open ? 1 : 0;
  let cur = want;
  pivot.rotation.y = ry0 + sign * swing * cur;

  const setOpen = (v) => { want = v ? 1 : 0; };
  const toggle = () => { want = want > 0.5 ? 0 : 1; };

  if (interact && ctx) {
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(clear, headY - sillY, 1.0),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.position.set(centre[0], (sillY + headY) / 2, centre[1]);
    hit.visible = false;
    hit.name = `hit-${name}`;
    hit.userData.airborne = true;
    ctx.add(hit, `hit-${name}`);
    ctx.interact({ name, label, hitbox: hit, action: toggle });
  }

  ctx?.update((dt, eye) => {
    if (auto && eye) {
      const d = Math.hypot(eye.x - centre[0], eye.z - centre[1]);
      want = d < autoRadius ? 1 : 0;
    }
    if (Math.abs(cur - want) > 1e-4) {
      cur += (want - cur) * (1 - Math.exp(-EASE_PER_S * dt));
      if (Math.abs(cur - want) < 1e-3) cur = want;
      pivot.rotation.y = ry0 + sign * swing * cur;
    }
  });
  ctx?.reset(() => { want = open ? 1 : 0; cur = want; pivot.rotation.y = ry0 + sign * swing * cur; });

  group.userData = {
    prop: true,
    kind: 'door-leaf',
    setOpen,
    toggle,
    isOpen: () => want > 0.5,
    angle: () => cur * swing,
    swingSign: sign,
  };
  group.name = name;
  if (DEV && leafH < 1.8) {
    console.warn(`[interior] makeDoorLeaf("${name}"): leaf is ${leafH.toFixed(2)} m tall — under 1.8 m it reads as a hatch`);
  }
  return group;
}

/* Local merge so this module does not depend on builders.js (which
 * imports nothing from core/ and should stay that way). */
function mergeMany(geometries) {
  const positions = [];
  const normals = [];
  const uvs = [];
  for (const g of geometries) {
    const src = g.index ? g.toNonIndexed() : g;
    positions.push(...src.attributes.position.array);
    normals.push(...src.attributes.normal.array);
    if (src.attributes.uv) uvs.push(...src.attributes.uv.array);
    else uvs.push(...new Float32Array((src.attributes.position.count) * 2));
    if (src !== g) src.dispose();
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return out;
}
