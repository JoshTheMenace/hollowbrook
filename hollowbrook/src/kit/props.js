import * as THREE from 'three';
import { cached } from '../core/texkit.js';
import { flat } from '../materials.js';
import { PAL, JOINERY } from '../palette.js';
import { M, painted, glowing } from './mats.js';
import { mergeGeometries as mergeGeos } from 'three/addons/utils/BufferGeometryUtils.js';
import { bx, cyl, tubeGeo, parts, rng, tagProp } from './util.js';
import { shedRoof } from '../builders.js';
import { devicePlate } from './signkit.js';

/* ------------------------------------------------------------------ *
 * THE VILLAGE'S FURNITURE, ITS WORKING GEAR AND ITS LIGHTS.
 *
 * CONVENTIONS, and every one of them has cost this project turns:
 *
 *  - ORIGIN ON THE GROUND at the centre of the prop's own footprint, so
 *    `seatOnGround(p, ctx.groundAt)` is the whole placement:
 *        const p = villageProps.beehive({ seed: 'mill-skep-2' });
 *        p.position.set(x, 0, z);
 *        seatOnGround(p, ctx.groundAt);
 *        ctx.add(p, 'skep');
 *  - EVERY PROP IS TAGGED `userData.prop = true` (via `tagProp`) so the
 *    spatial audit counts it as ONE unit rather than as fourteen anonymous
 *    boxes, and geometry is POOLED PER MATERIAL inside every one.
 *  - ANYTHING WALL-MOUNTED SETS `userData.airborne = true`. A bracket
 *    lantern three metres up is held by the wall behind it; without the
 *    flag the audit reads it as a unit floating in the air. It is set here,
 *    once, for all six districts.
 *  - ANYTHING LONG TAKES A POLYLINE OF WORLD POINTS and steps with the
 *    ground under it. `fenceRun` seats every panel on its own ground.
 *    A level rail over falling ground is grounded at one end and
 *    see-through under the rest.
 *  - NOTHING HERE DEFAULTS TO AN ACCENT. Where a prop has a colour that
 *    could be one — a cart's paint, a banner's field, a lantern's paper, a
 *    door leaf — it is a PARAMETER with a neutral default from JOINERY. In
 *    the last city built this way a shared prop defaulted to one district's
 *    owned red and leaked it into two others; the rule exists because of
 *    that, and Thistledown has SIX owned accents to leak.
 *
 * ------------------------------------------------------------------
 * PRACTICALS THAT TRAVEL (polish mechanism 6).
 * ------------------------------------------------------------------
 * A lit thing in this kit is always THREE things, never one orange
 * rectangle: a banded body, a small warm emissive glass, and a soft
 * light-pool decal on the ground under it. `lightPool()` is that third
 * thing and every lit generator here calls it. Fires get a wider, redder
 * pool than lamps do. The lit part is the LOUD part, so it is kept small:
 * the glow reads because the body around it does not.
 * ------------------------------------------------------------------ */

const TAU = Math.PI * 2;

/* ---- light pools -------------------------------------------------------- */

let poolMatWarm = null;
let poolMatEmber = null;

function poolTexture(inner, outer) {
  return cached(`th-pool-${inner}-${outer}`, 128, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const g = c.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.45, outer);
    g.addColorStop(1, 'rgba(255,200,120,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });
}

/**
 * The soft warm disc a practical throws on the ground under it. Flat,
 * unlit, `depthWrite: false` so the ink pass does not outline it into a
 * ring, and never a collider or a platform.
 *
 * IT IS NOT A LIGHT. It is a decal, and it is what makes a lantern read as
 * lighting the ground rather than as a bright dot in the air.
 *
 * @param {{r?:number, y?:number, ember?:boolean, opacity?:number}} o
 */
export function lightPool({ r = 1.5, y = 0.02, ember = false, opacity = 0.5 } = {}) {
  if (!poolMatWarm) {
    poolMatWarm = flat(PAL.warmLight, {
      map: poolTexture('rgba(255,236,190,0.95)', 'rgba(255,206,132,0.36)'),
      transparent: true, opacity: 1, depthWrite: false, fog: true,
    });
    poolMatEmber = flat(PAL.ember, {
      map: poolTexture('rgba(255,206,150,0.95)', 'rgba(232,140,74,0.4)'),
      transparent: true, opacity: 1, depthWrite: false, fog: true,
    });
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), ember ? poolMatEmber : poolMatWarm);
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
 * Attach light pools to a prop WITHOUT putting them inside its audit unit.
 *
 * THIS IS NOT COSMETIC. `Box3.setFromObject` takes every descendant, so a
 * 3.8 m pool plane parented to a 0.4 m torch gives that torch a 3.8 m
 * bounding box — and the spatial audit's OVERLAP test then flags the torch
 * against every neighbour within two metres, in every district, for ever.
 * (Measured on the first showcase run: a torch, a brazier and a post
 * lantern each swallowed their own name plate whole.)
 *
 * So the returned group is UNTAGGED, the prop body inside it carries the
 * `prop` tag, and the pools are siblings of the body. The audit sees the
 * body; the renderer sees both; nothing has to remember anything.
 */
export function withPools(body, pools) {
  if (!pools || !pools.length) return body;
  const outer = new THREE.Group();
  outer.name = `${body.name || 'prop'}-lit`;
  outer.add(body);
  for (const p of pools) outer.add(p);
  outer.userData = { ...body.userData, prop: false, body, pools };
  return outer;
}

/* ---- interaction -------------------------------------------------------- */

/**
 * An invisible box the interaction raycast can hit. `visible = false` keeps
 * it out of the render AND out of the spatial audit's surface set, while
 * three.js' raycaster still tests it — exactly what an interaction volume
 * wants.
 */
export function hitbox({ w = 0.9, h = 1.4, d = 0.9, at = [0, 0, 0], name = 'hitbox' } = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
  mesh.position.set(at[0], at[1], at[2]);
  mesh.visible = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = name;
  mesh.userData.airborne = true;
  return mesh;
}

/**
 * Register one interaction in one call: builds the hitbox, adds it to the
 * scene and hands the entry to `ctx.interact`. `ctx.interact` REFUSES an
 * entry with no hitbox, because main.js raycasts every frame and a missing
 * one blanks the page from inside the render loop.
 *
 * EVERY DISTRICT OWES AT LEAST ONE INTERACTION. The first city built this
 * way shipped none at all and the runtime's whole interaction system was
 * dead code in a finished town.
 *
 * @example
 *   interactive(ctx, {
 *     name: 'test-string', label: 'Light the test lantern string',
 *     at: [-6, ctx.groundAt(-6, 2) + 1.6, 2], size: [1.6, 2.2, 1.6],
 *     action: () => string.userData.setLit(true),
 *   });
 */
export function interactive(ctx, { name, label, at, size = [1.0, 1.6, 1.0], action, ...rest }) {
  const box = hitbox({ w: size[0], h: size[1], d: size[2], at, name: `hit-${name}` });
  ctx.add(box, `hit-${name}`);
  return ctx.interact({ name, label: label ?? name, hitbox: box, action: action ?? (() => {}), ...rest });
}

/* ---- lantern strings ---------------------------------------------------- */

/**
 * A CATENARY RUN OF PAPER LANTERNS, and the whole story of the Lantern
 * Fair: the town is stringing them this evening and they are all UNLIT
 * except one test run that is already glowing.
 *
 * `from` and `to` are world `[x, y, z]` — the two anchor points, an eave
 * hook and a pole top. The cord hangs between them with real sag and the
 * lanterns hang PLUMB off the cord wherever it happens to be, which is the
 * difference between a garland and a row of dots.
 *
 * `lit: true` swaps the paper for warm emissive glass AND drops a light
 * pool under every lantern (pass `groundAt`, or they land at y = 0).
 * `userData.setLit(bool)` flips a built string, so a district's interaction
 * can light one.
 *
 * `colors` is a list of paper colours. IT DEFAULTS TO NEUTRAL CREAM. The
 * green's warm reds and golds are its OWNED accent and are passed in.
 *
 * @example
 *   const s = lanternString({
 *     from: [-6, 5.4, 2], to: [2, 4.2, -3], count: 9, sag: 0.9,
 *     colors: [ACCENT.lanternRed, ACCENT.lanternGold], groundAt: ctx.groundAt,
 *   });
 *   ctx.add(s, 'fair-string-1');
 */
export function lanternString({
  from, to, count = 8, sag = 0.8, lit = false, colors = null, seed = 'string',
  r = 0.017, drop = 0.14, size = 0.2, groundAt = null, pools = true, cordMat = null,
}) {
  const rr = rng(seed);
  const A = new THREE.Vector3().fromArray(from);
  const B = new THREE.Vector3().fromArray(to);
  const group = new THREE.Group();
  const P = parts();
  // a catenary is near enough a sine over a span this short
  const at = (t) => {
    const p = A.clone().lerp(B, t);
    p.y -= Math.sin(Math.PI * t) * sag;
    return p;
  };
  const segs = Math.max(10, count * 2);
  let prev = at(0);
  for (let i = 1; i <= segs; i += 1) {
    const cur = at(i / segs);
    P.add(cordMat ?? M.rope, tubeGeo(prev.toArray(), cur.toArray(), r, 4));
    prev = cur;
  }

  /* A LIT COLOURED LANTERN KEEPS ITS COLOUR. Emissive at `warmLight` and
   * 0.9 washes a red paper lantern to the same orange-yellow as a cream one,
   * and the green's whole accent goes with it. Emissive at the lantern's OWN
   * colour lifts the value and leaves the hue alone; only the neutral cream
   * default glows at the flame's colour, which is what cream paper does. */
  const tones = (colors ?? [PAL.lanternPaper]).map((c) => (lit ? glowing(c, c, 0.78) : painted(c)));
  const unlitDefault = M.lanternPaper;
  const litDefault = glowing(PAL.lanternPaper, PAL.warmLight, 0.9);
  const paperFor = (i) => (colors ? tones[i % tones.length] : (lit ? litDefault : unlitDefault));
  const bodies = [];
  const poolGroup = new THREE.Group();

  for (let i = 0; i < count; i += 1) {
    const t = (i + 0.5) / count;
    const p = at(t);
    const s = size * rr.range(0.88, 1.12);
    const y = p.y - drop;
    // the hanger, then the lantern: cap, body of two rings, base, tassel
    P.add(M.oakDark, cyl(0.008, 0.008, drop, p.x, p.y - drop / 2, p.z, { seg: 4 }));
    P.add(M.oakDark, cyl(s * 0.34, s * 0.34, 0.028, p.x, y + 0.005, p.z, { seg: 8 }));
    const paper = paperFor(i);
    P.add(paper, cyl(s * 0.4, s * 0.62, s * 0.44, p.x, y - s * 0.24, p.z, { seg: 9 }));
    P.add(paper, cyl(s * 0.62, s * 0.38, s * 0.44, p.x, y - s * 0.68, p.z, { seg: 9 }));
    P.add(M.oakDark, cyl(s * 0.34, s * 0.3, 0.03, p.x, y - s * 0.92, p.z, { seg: 8 }));
    P.add(M.rope, cyl(0.008, 0.008, s * 0.3, p.x, y - s * 1.08, p.z, { seg: 4 }));
    bodies.push({ x: p.x, y: y - s * 0.55, z: p.z, s });
  }
  P.flush(group, { receive: false });

  /* ONE POOL MESH FOR THE WHOLE STRING. A plane per lantern is eight meshes
   * on a string, and a district hanging fifteen runs across a green spends
   * a hundred and twenty draw calls on light that is not even lit yet. They
   * share a material and they all lie flat on the ground, so they merge. */
  const buildPools = () => {
    const geos = bodies.map((b) => {
      const g = new THREE.PlaneGeometry(2.3, 2.3);
      g.rotateX(-Math.PI / 2);
      g.translate(b.x, (groundAt ? groundAt(b.x, b.z) : 0) + 0.025, b.z);
      return g;
    });
    const proto = lightPool({ r: 1.15, opacity: 0.34 });
    const mesh = new THREE.Mesh(mergeGeos(geos), proto.material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 2;
    mesh.name = 'light-pool';
    mesh.userData.airborne = true;
    poolGroup.add(mesh);
  };
  if (lit && pools) {
    buildPools();
    group.add(poolGroup);
  }

  /* Flipping a built string. The bodies are already merged into one mesh
   * per material, so lighting one is a MATERIAL swap on those meshes, not a
   * rebuild — which is what makes an interaction that lights a string cheap
   * enough to run on a click. */
  const setLit = (on) => {
    group.traverse((o) => {
      if (!o.isMesh || o === poolGroup) return;
      if (o.material === unlitDefault && on) o.material = litDefault;
      else if (o.material === litDefault && !on) o.material = unlitDefault;
      else if (colors) {
        const i = tones.indexOf(o.material);
        if (i >= 0) o.material = on ? glowing(colors[i % colors.length], colors[i % colors.length], 0.78) : painted(colors[i % colors.length]);
      }
    });
    poolGroup.visible = on;
    if (on && poolGroup.children.length === 0 && pools) {
      buildPools();
      group.add(poolGroup);
    }
  };
  group.name = 'lantern-string';
  group.userData = { kind: 'lantern-string', airborne: true, lit, count, setLit, anchors: [from, to] };
  return group;
}

/* ---- lamps, torches, fire ----------------------------------------------- */

/**
 * THE PANE OF A LANTERN THAT SWITCHES, as its own small mesh.
 *
 * A merged mesh has ONE material, so a pooled pane cannot be swapped for
 * `M.glass` and back — which is why both lanterns below built their pane
 * lit-or-dark once and then had no way to change their minds. The rest of
 * the lantern stays pooled; this is the one part that has to stand out of
 * the pool, and at one box it costs a single draw call per lamp.
 */
function switchPane(geometry, litMat, isLit) {
  const mesh = new THREE.Mesh(geometry, isLit ? litMat : M.glass);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = 'lantern-pane';
  return mesh;
}

/**
 * Wire `practical` / `lit` / `setLit` onto a lamp body. Called BEFORE
 * `withPools`, because `withPools` copies the body's userData onto the
 * outer group — set it after and the switch exists on the body nobody
 * holds a reference to.
 */
function wireSwitch(body, pane, litMat, pool, isLit) {
  body.userData.practical = true;
  body.userData.lit = isLit;
  body.userData.setLit = (on) => {
    const now = !!on;
    pane.material = now ? litMat : M.glass;
    if (pool) pool.visible = now;
    body.userData.lit = now;
  };
  return body;
}

/**
 * A lantern on a wall bracket. ORIGIN ON THE WALL FACE, projecting +Z, and
 * `airborne: true`. Pass `groundY` (the ground height BELOW the bracket,
 * relative to the bracket's own origin, i.e. negative) to get its pool.
 *
 * IT SWITCHES. `userData.setLit(bool)` swaps the pane between its lit
 * material and `M.glass` and shows or hides the pool, and `practical` is
 * how the day-night rig finds it. The pool is built whatever `lit` says
 * (and merely hidden), because a light that has nothing to become makes
 * `setLit(true)` a silent no-op — the same trap the brazier records.
 */
export function bracketLantern({ seed = 'bracket', reach = 0.55, lit = false, glow = null, groundDrop = null } = {}) {
  const g = new THREE.Group();
  const P = parts();
  P.add(M.ironDark, bx(0.15, 0.22, 0.06, 0, 0, 0.03));
  P.add(M.iron, bx(0.045, 0.045, reach, 0, 0.06, reach / 2));
  P.add(M.iron, tubeGeo([0, -0.24, 0.04], [0, 0.045, reach * 0.72], 0.022, 5));
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * TAU + Math.PI / 4;
    P.add(M.ironDark, bx(0.026, 0.32, 0.026, Math.cos(a) * 0.105, -0.19, reach + Math.sin(a) * 0.105));
  }
  P.add(M.ironDark, cyl(0.17, 0.02, 0.13, 0, 0.0, reach, { seg: 4 }));
  P.add(M.ironDark, bx(0.2, 0.03, 0.2, 0, -0.35, reach));
  P.flush(g, { receive: false });
  const isLit = !!(lit || glow != null);
  const litMat = glow != null ? glowing(glow, glow, 0.9) : M.lit;
  const pane = switchPane(bx(0.17, 0.28, 0.17, 0, -0.19, reach), litMat, isLit);
  g.add(pane);
  tagProp(g, 'bracket-lantern', { airborne: true, reach, lampY: -0.19 });
  const pools = [];
  let pool = null;
  if (groundDrop != null) {
    pool = lightPool({ r: 1.7, opacity: 0.42 });
    pool.position.set(0, groundDrop + 0.03, reach);
    pool.visible = isLit;
    pools.push(pool);
  }
  wireSwitch(g, pane, litMat, pool, isLit);
  return withPools(g, pools);
}

/**
 * A lantern on a post: the village's street light. Origin on the ground.
 * IT SWITCHES — see `bracketLantern` above for why the pane is its own
 * mesh and why the pool is built whether or not it starts lit.
 */
export function postLantern({ seed = 'post-lantern', h = 2.6, lit = false, glow = null, arm = true, mat = null } = {}) {
  const rr = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  const post = mat ?? M.oak;
  P.add(M.graniteDark, cyl(0.2, 0.17, 0.24, 0, 0.12, 0, { seg: 8 }));
  P.add(post, cyl(0.065, 0.09, h - 0.2, 0, 0.2 + (h - 0.2) / 2, 0, { seg: 8 }));
  const ly = h + 0.14;
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * TAU + Math.PI / 4;
    P.add(M.ironDark, bx(0.03, 0.4, 0.03, Math.cos(a) * 0.13, ly, Math.sin(a) * 0.13));
  }
  P.add(M.ironDark, cyl(0.21, 0.02, 0.16, 0, ly + 0.26, 0, { seg: 4 }));
  P.add(M.ironDark, bx(0.25, 0.04, 0.25, 0, ly - 0.2, 0));
  if (arm) P.add(M.iron, bx(0.42, 0.026, 0.026, 0, h - 0.36, 0));
  P.flush(g);
  void rr;
  const isLit = !!(lit || glow != null);
  const litMat = glow != null ? glowing(glow, glow, 0.9) : M.lit;
  const pane = switchPane(bx(0.21, 0.35, 0.21, 0, ly, 0), litMat, isLit);
  g.add(pane);
  tagProp(g, 'post-lantern', {
    topY: ly + 0.34, lampY: ly, hookAt: [0, h - 0.36, 0],
    footprint: { x0: -0.22, z0: -0.22, x1: 0.22, z1: 0.22 },
  });
  const pool = lightPool({ r: 2.1, opacity: 0.42 });
  pool.position.y = 0.03;
  pool.visible = isLit;
  wireSwitch(g, pane, litMat, pool, isLit);
  return withPools(g, [pool]);
}

/**
 * A pitch torch in an iron ring on a post, and the ember pool under it. A
 * fire gets a WIDER, REDDER pool than a lamp — that difference is most of
 * what tells the eye which one it is looking at.
 */
export function torch({ seed = 'torch', h = 2.0, lit = true, post = true } = {}) {
  const g = new THREE.Group();
  const P = parts();
  if (post) {
    P.add(M.oakDark, cyl(0.06, 0.075, h, 0, h / 2, 0, { seg: 7 }));
    P.add(M.graniteDark, cyl(0.18, 0.15, 0.2, 0, 0.1, 0, { seg: 7 }));
  }
  P.add(M.ironDark, cyl(0.11, 0.11, 0.05, 0, h - 0.18, 0, { seg: 9, open: true }));
  P.add(M.ironDark, cyl(0.11, 0.11, 0.05, 0, h - 0.38, 0, { seg: 9, open: true }));
  P.add(M.oakDark, cyl(0.045, 0.055, 0.55, 0, h - 0.22, 0, { seg: 6 }));
  if (lit) {
    // (radiusTOP, radiusBOTTOM): a flame narrows toward the sky — the same
    // parasol as hayRick and brazier, fixed at integration
    P.add(M.ember, cyl(0.02, 0.085, 0.3, 0, h + 0.16, 0, { seg: 7 }));
    P.add(M.lit, cyl(0.012, 0.05, 0.16, 0, h + 0.11, 0, { seg: 6 }));
  }
  P.flush(g, { receive: false });
  tagProp(g, 'torch', { flameY: h + 0.16, footprint: { x0: -0.2, z0: -0.2, x1: 0.2, z1: 0.2 } });
  const pools = [];
  if (lit) {
    const pool = lightPool({ r: 1.9, ember: true, opacity: 0.4 });
    pool.position.y = 0.03;
    pools.push(pool);
  }
  return withPools(g, pools);
}

/**
 * A BRAZIER: an iron basket of coals on three legs, with logs and an ember
 * pool. The gate's interaction and the forge's evening fire.
 *
 * IT SWITCHES.  `userData.setLit(bool)` is the relight beat: the flame, the
 * bed of coals and the ember pool are built whatever `lit` says and merely
 * HIDDEN when it is false, because a fire you can light has to have
 * something to become.  (Building them on demand would mean merging
 * geometry inside a frame, and the first version of this — `if (lit)`
 * around the flame — made `setLit(true)` a silent no-op on every unlit
 * brazier in the town, which is exactly the beat the game needs.)
 *
 * `userData.practical = true` is how the day-night rig finds every switching
 * light in the town without a district registering anything.
 */
export function brazier({ seed = 'brazier', r: R = 0.36, h = 0.62, lit = true, ctx = null } = {}) {
  const rr = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * TAU;
    P.add(M.ironDark, tubeGeo([Math.cos(a) * R * 0.82, 0, Math.sin(a) * R * 0.82],
      [Math.cos(a) * R * 0.34, h, Math.sin(a) * R * 0.34], 0.032, 5));
  }
  P.add(M.ironDark, cyl(R * 0.5, R, 0.3, 0, h + 0.13, 0, { seg: 11, open: true }));
  P.add(M.ironDark, cyl(R * 0.52, R * 0.52, 0.03, 0, h - 0.01, 0, { seg: 11 }));
  for (let i = 0; i < 5; i += 1) {
    const a = rr.range(0, TAU);
    P.add(M.barkDark, cyl(0.045, 0.05, R * rr.range(0.9, 1.3), rr.range(-0.1, 0.1), h + 0.14 + i * 0.03, rr.range(-0.1, 0.1),
      { seg: 5, rz: Math.PI / 2, ry: a }));
  }
  P.flush(g, { receive: false });
  /* the fire itself, in its OWN group, so it can be switched. Coals under
   * the flame: a fire drawn in one tone is a paper cut-out. */
  const flame = new THREE.Group();
  flame.name = 'brazier-flame';
  const F = parts();
  /* `cyl(r0, r1, ...)` is (radius TOP, radius BOTTOM). A flame is wide at
   * the coals and pointed at the sky, so the WIDE radius is the second
   * argument — written the other way round the fire is a funnel standing on
   * its point, which is the hayRick parasol again. The ember cone's y is
   * set so its wide end lands exactly on the coal disc's top face
   * (h + 0.17); the pale core sits just inside it. */
  F.add(M.emberDeep, cyl(R * 0.5, R * 0.44, 0.1, 0, h + 0.12, 0, { seg: 9 }));
  F.add(M.ember, cyl(R * 0.18, R * 0.62, 0.42, 0, h + 0.38, 0, { seg: 8 }));
  F.add(M.lit, cyl(R * 0.08, R * 0.34, 0.24, 0, h + 0.32, 0, { seg: 7 }));
  F.flush(flame, { receive: false, cast: false });
  flame.visible = lit;
  g.add(flame);
  tagProp(g, 'brazier', { fireY: h + 0.4, footprint: { x0: -R, z0: -R, x1: R, z1: R } });
  const glowPart = lightPool({ r: 2.6, ember: true, opacity: 0.46 });
  glowPart.position.y = 0.03;
  glowPart.visible = lit;
  let isLit = lit;
  g.userData.practical = true;
  g.userData.lit = lit;
  g.userData.setLit = (on) => {
    isLit = !!on;
    flame.visible = isLit;
    glowPart.visible = isLit;
    g.userData.lit = isLit;
  };
  const out = withPools(g, [glowPart]);
  if (ctx) {
    /* A fire is never still — but it BREATHES BY SIZE, not by opacity.
     * `lightPool` hands back a mesh on the SHARED pooled material, so
     * `glowPart.material.opacity = k` was writing the opacity of every warm
     * ember pool in the town: six districts' braziers fighting over one
     * number, and whichever updater ran last won the frame. */
    let t = rr.range(0, 6);
    ctx.update((dt) => {
      if (!isLit) return;
      t += dt;
      glowPart.scale.setScalar(1 + Math.sin(t * 2.1) * 0.035 + Math.sin(t * 5.3) * 0.02);
    });
  }
  return out;
}

/* ---- the well ----------------------------------------------------------- */

/**
 * THE WELL HEAD under the great oak. An octagonal stone kerb worn round the
 * rim, an oak frame with the windlass in it, and the bucket on its chain.
 * BOTH ENDS OF THE CHAIN ARE REAL POINTS ON THE FRAME — a chain drawn
 * between a guessed length and an angle is the detail everybody notices is
 * wrong without knowing why.
 */
export function wellHead({ seed = 'well', r: R = 0.8, h = 0.72, roof = true, bucket = true, roofColor = null } = {}) {
  const rr = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  P.add(M.graniteWarm, cyl(R * 1.16, R * 1.22, 0.2, 0, 0.1, 0, { seg: 8 }));
  P.add(M.granite, cyl(R, R * 1.06, h - 0.2, 0, 0.2 + (h - 0.2) / 2, 0, { seg: 8, open: true }));
  P.add(M.graniteWarm, cyl(R * 1.1, R * 1.1, 0.12, 0, h + 0.02, 0, { seg: 8, open: true }));
  P.add(M.ironDark, cyl(R * 0.92, R * 0.92, 0.04, 0, h - 0.4, 0, { seg: 8 }));   // the dark down the shaft
  const postY = h + 1.5;
  for (const s of [-1, 1]) {
    P.add(M.oak, bx(0.13, 1.5, 0.13, s * R * 0.86, h + 0.75, 0));
  }
  P.add(M.oak, bx(R * 2.1, 0.13, 0.13, 0, postY, 0));
  // the windlass barrel between the two posts, and the crank handle
  P.add(M.oakDark, cyl(0.1, 0.1, R * 1.5, 0, h + 1.05, 0, { seg: 9, rz: Math.PI / 2 }));
  P.add(M.iron, tubeGeo([R * 0.86, h + 1.05, 0], [R * 1.05, h + 1.05, 0], 0.02, 5));
  P.add(M.iron, tubeGeo([R * 1.05, h + 1.05, 0], [R * 1.05, h + 1.05, 0.26], 0.02, 5));
  P.add(M.oakDark, cyl(0.032, 0.032, 0.16, R * 1.05, h + 1.05, 0.34, { seg: 6, rx: Math.PI / 2 }));
  if (bucket) {
    const by = h + 0.42;
    P.add(M.ironDark, cyl(0.011, 0.011, h + 1.0 - by - 0.14, 0, (h + 1.0 + by + 0.14) / 2, 0, { seg: 4 }));
    P.add(M.oakDark, cyl(0.15, 0.13, 0.26, 0, by, 0, { seg: 10, open: true }));
    P.add(M.iron, cyl(0.155, 0.155, 0.03, 0, by + 0.1, 0, { seg: 10 }));
    P.add(M.iron, cyl(0.155, 0.155, 0.03, 0, by - 0.08, 0, { seg: 10 }));
    P.add(M.iron, tubeGeo([-0.15, by + 0.08, 0], [0, by + 0.24, 0], 0.011, 4));
    P.add(M.iron, tubeGeo([0.15, by + 0.08, 0], [0, by + 0.24, 0], 0.011, 4));
  }
  if (roof) {
    const rmat = roofColor != null ? painted(roofColor) : M.shingleMoss;
    const sr = shedRoof({ w: R * 2.4, d: R * 1.9, pitch: 0.5, overhang: 0.22, thickness: 0.09, downhill: 'z+', mat: rmat });
    sr.position.set(0, postY + 0.2, 0);
    sr.userData.airborne = true;
    g.add(sr);
    for (const s of [-1, 1]) P.add(M.oakDark, tubeGeo([s * R * 0.86, postY - 0.5, 0], [s * R * 0.3, postY + 0.06, 0], 0.04, 5));
  }
  P.flush(g);
  void rr;
  return tagProp(g, 'well-head', {
    rimY: h + 0.08, windlassY: h + 1.05,
    footprint: { x0: -R * 1.25, z0: -R * 1.25, x1: R * 1.25, z1: R * 1.25 },
  });
}

/* ---- the cart ----------------------------------------------------------- */

/**
 * A FARM CART, four-wheeled, with a plank body and shafts. Authored ALONG
 * X WITH THE SHAFTS AT +X, so `rotation.y` is the direction it would be
 * pulled: 0 is +x, PI/2 is -z, PI is -x, -PI/2 is +z.
 *
 * `paint` is a parameter with a neutral default. Millward's painted mill
 * cart is its OWNED accent and is passed in; nobody else's cart is painted.
 * `load` is 'flour' | 'hay' | 'crates' | 'barrels' | 'empty'.
 */
export function cart({
  seed = 'cart', L = 2.6, W = 1.35, wheelR = 0.5, paint = null, load = 'empty',
  shafts = true, tipped = false, sackColor = null,
} = {}) {
  const rr = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  const body = paint != null ? painted(paint) : M.oak;
  const bedY = wheelR + 0.34;
  const tilt = tipped ? 0.22 : 0;

  // wheels: spoked, and a spoked wheel is what says cart rather than crate
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wx = sx * L * 0.34;
      const wz = sz * (W / 2 + 0.06);
      const wr = sx > 0 ? wheelR : wheelR * 0.92;
      P.add(M.oakDark, cyl(wr, wr, 0.09, wx, wr, wz, { seg: 14, rx: Math.PI / 2, open: true }));
      P.add(M.iron, cyl(wr + 0.03, wr + 0.03, 0.055, wx, wr, wz, { seg: 14, open: true }));
      P.add(M.oakDark, cyl(0.09, 0.09, 0.16, wx, wr, wz, { seg: 8, rx: Math.PI / 2 }));
      for (let k = 0; k < 8; k += 1) {
        const a = (k / 8) * TAU;
        P.add(M.oak, tubeGeo([wx, wr, wz], [wx + Math.cos(a) * wr * 0.94, wr + Math.sin(a) * wr * 0.94, wz], 0.022, 4));
      }
    }
    P.add(M.iron, cyl(0.04, 0.04, W + 0.22, sx * L * 0.34, wheelR, 0, { seg: 6, rx: Math.PI / 2 }));
  }
  // the bed: planks, so it is not one slab
  const nPlank = 6;
  for (let i = 0; i < nPlank; i += 1) {
    P.add(body, bx(L, 0.06, W / nPlank - 0.012, 0, bedY, (i / (nPlank - 1) - 0.5) * (W - W / nPlank), { rz: tilt }));
  }
  P.add(M.oakDark, bx(L + 0.1, 0.1, 0.11, 0, bedY - 0.09, W / 2 - 0.04, { rz: tilt }));
  P.add(M.oakDark, bx(L + 0.1, 0.1, 0.11, 0, bedY - 0.09, -W / 2 + 0.04, { rz: tilt }));
  // the sides: three rails each, which is a hay cart's own shape
  for (const sz of [-1, 1]) {
    for (const k of [0, 1]) {
      P.add(body, bx(L, 0.11, 0.05, 0, bedY + 0.16 + k * 0.24, sz * (W / 2 - 0.02), { rz: tilt }));
    }
    for (let i = 0; i < 4; i += 1) {
      P.add(M.oakDark, bx(0.07, 0.5, 0.07, (i / 3 - 0.5) * (L - 0.2), bedY + 0.24, sz * (W / 2 - 0.02), { rz: tilt }));
    }
  }
  P.add(body, bx(0.06, 0.42, W, -L / 2 + 0.03, bedY + 0.22, 0, { rz: tilt }));   // the tailboard
  if (shafts) {
    for (const sz of [-1, 1]) {
      P.add(M.oak, tubeGeo([L / 2 - 0.1, bedY - 0.06, sz * W * 0.3], [L / 2 + 1.5, wheelR * 0.62, sz * W * 0.24], 0.045, 5));
    }
    P.add(M.oakDark, tubeGeo([L / 2 + 1.42, wheelR * 0.62, -W * 0.24], [L / 2 + 1.42, wheelR * 0.62, W * 0.24], 0.035, 5));
  }
  // the load
  const top = bedY + 0.06;
  if (load === 'flour') {
    const sm = sackColor != null ? painted(sackColor) : M.hessian;
    for (let i = 0; i < 6; i += 1) {
      const px = (i % 3 - 1) * (L * 0.28);
      const pz = (Math.floor(i / 3) - 0.5) * (W * 0.4);
      const py = top + 0.18 + (i > 2 ? 0.0 : 0);
      P.add(sm, cyl(0.16, 0.2, 0.4, px + rr.range(-0.05, 0.05), py, pz, { seg: 8, rz: rr.range(-0.2, 0.2) }));
    }
    for (let i = 0; i < 2; i += 1) {
      P.add(sm, cyl(0.16, 0.2, 0.4, rr.range(-0.3, 0.3), top + 0.56, rr.range(-0.2, 0.2), { seg: 8, rz: rr.range(-0.4, 0.4) }));
    }
  } else if (load === 'hay') {
    for (let i = 0; i < 3; i += 1) {
      P.add(M.straw, bx(L * 0.3, 0.44, W * 0.86, (i - 1) * L * 0.31, top + 0.24, 0, { ry: rr.range(-0.1, 0.1) }));
    }
    P.add(M.straw, bx(L * 0.7, 0.34, W * 0.7, 0, top + 0.6, 0, { ry: rr.range(-0.15, 0.15) }));
  } else if (load === 'crates') {
    for (let i = 0; i < 4; i += 1) {
      P.add(M.oakSilver, bx(0.44, 0.34, 0.42, (i % 2 - 0.5) * 0.6, top + 0.17 + Math.floor(i / 2) * 0.35, rr.range(-0.2, 0.2), { ry: rr.range(-0.2, 0.2) }));
    }
  } else if (load === 'barrels') {
    for (let i = 0; i < 3; i += 1) {
      P.add(M.oak, cyl(0.2, 0.24, 0.56, (i - 1) * 0.62, top + 0.28, 0, { seg: 10 }));
      P.add(M.iron, cyl(0.245, 0.245, 0.035, (i - 1) * 0.62, top + 0.46, 0, { seg: 10 }));
    }
  }
  P.flush(g);
  return tagProp(g, 'cart', {
    L, W, bedY: top, wheelR,
    footprint: { x0: -L / 2 - 0.14, z0: -W / 2 - 0.16, x1: L / 2 + (shafts ? 1.6 : 0.14), z1: W / 2 + 0.16 },
  });
}

/* ---- farm and yard gear ------------------------------------------------- */

/** A round hay bale, or a rectangular one with `square: true`. */
export function hayBale({ seed = 'bale', r: R = 0.55, square = false, tipped = false } = {}) {
  const rr = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  if (square) {
    P.add(M.straw, bx(R * 1.7, R * 1.05, R * 1.1, 0, R * 0.53, 0, { ry: rr.range(-0.2, 0.2) }));
    for (const s of [-1, 1]) P.add(M.rope, bx(R * 1.72, 0.03, 0.03, 0, R * 0.53, s * R * 0.3));
  } else {
    P.add(M.straw, cyl(R, R, R * 1.4, 0, R, 0, tipped ? { seg: 12 } : { seg: 12, rz: Math.PI / 2 }));
    for (const s of [-1, 0, 1]) {
      P.add(M.rope, cyl(R + 0.012, R + 0.012, 0.024, s * R * 0.42, R, 0, { seg: 12, rz: Math.PI / 2 }));
    }
  }
  P.flush(g);
  return tagProp(g, 'hay-bale', { footprint: { x0: -R * 0.9, z0: -R * 0.9, x1: R * 0.9, z1: R * 0.9 } });
}

/** A HAYRICK: the big thatched-top stack in a farmyard. */
export function hayRick({ seed = 'rick', r: R = 1.8, h = 2.8 } = {}) {
  const rr = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  P.add(M.oakDark, cyl(R * 0.9, R * 0.9, 0.24, 0, 0.12, 0, { seg: 10 }));
  P.add(M.straw, cyl(R * 0.96, R, h * 0.66, 0, 0.24 + h * 0.33, 0, { seg: 11 }));
  /* `cyl` is (radiusTOP, radiusBOTTOM, ...).  This was written
   * `cyl(R * 1.02, 0.06, ...)` -- an UPSIDE-DOWN cone: a point where it meets
   * the stack, flaring to full width at the sky.  Nothing about a render says
   * "the arguments are swapped"; it says PARASOL, and two rounds of radius
   * tuning could not fix it because the proportion was never the problem. */
  P.add(M.thatchWorn, cyl(0.06, R * 1.02, h * 0.4, 0, 0.24 + h * 0.66 + h * 0.2, 0, { seg: 11 }));
  for (let i = 0; i < 5; i += 1) {
    const a = rr.range(0, TAU);
    P.add(M.straw, bx(0.5, 0.16, 0.24, Math.sin(a) * R * 0.9, rr.range(0.4, h * 0.6), Math.cos(a) * R * 0.9, { ry: -a, rz: rr.range(-0.2, 0.2) }));
  }
  P.flush(g);
  return tagProp(g, 'hay-rick', { h, footprint: { x0: -R, z0: -R, x1: R, z1: R } });
}

/** A barrel. `tipped` lays it on its side in chocks, which is how one
 *  waits by a door. */
export function barrel({ seed = 'barrel', h = 0.78, r: R = 0.3, tipped = false, open = false, endColor = null } = {}) {
  const rr = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  const stave = rr.chance(0.35) ? M.oakSilver : M.oak;
  const axial = (t) => (tipped ? [(t - 0.5) * h, R, 0] : [0, t * h, 0]);
  const rot = tipped ? { rz: Math.PI / 2, seg: 11 } : { seg: 11 };
  const put = (mat, t, r0, r1, len) => P.add(mat, cyl(r0, r1, len, ...axial(t), rot));
  put(stave, 0.25, R * 0.88, R, h * 0.5);
  put(stave, 0.75, R, R * 0.88, h * 0.5);
  for (const t of [0.1, 0.5, 0.9]) {
    const rr2 = R * (1 - Math.abs(t - 0.5) * 2 * 0.12) + 0.012;
    put(M.iron, t, rr2, rr2, 0.05);
  }
  if (!open) put(endColor != null ? painted(endColor) : M.oakSilver, 0.985, R * 0.85, R * 0.85, 0.05);
  if (tipped) {
    for (const s of [-1, 1]) P.add(M.oakDark, bx(0.14, 0.1, 0.24, s * h * 0.3, 0.05, 0));
  }
  P.flush(g);
  return tagProp(g, 'barrel', { footprint: { x0: -R - 0.02, z0: -R - 0.02, x1: R + 0.02, z1: R + 0.02 } });
}

/** A stack of barrels, two or three rows in a pyramid. */
export function barrelStack({ seed = 'barrels', rows = 3, endColor = null } = {}) {
  const rr = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  const R = 0.3;
  const h = 0.78;
  let n = rows;
  let y = R;
  let tier = 0;
  while (n > 0) {
    for (let i = 0; i < n; i += 1) {
      const z = (i - (n - 1) / 2) * (R * 2.1);
      const stave = rr.chance(0.35) ? M.oakSilver : M.oak;
      P.add(stave, cyl(R * 0.88, R, h * 0.5, 0, y, z, { seg: 11, rz: Math.PI / 2 }));
      P.add(stave, cyl(R, R * 0.88, h * 0.5, 0, y, z, { seg: 11, rz: Math.PI / 2 }));
      for (const t of [-0.34, 0, 0.34]) P.add(M.iron, cyl(R + 0.012, R + 0.012, 0.05, t * h, y, z, { seg: 11, rz: Math.PI / 2 }));
      P.add(endColor != null ? painted(endColor) : M.oakSilver, cyl(R * 0.85, R * 0.85, 0.05, h * 0.48, y, z, { seg: 11, rz: Math.PI / 2 }));
    }
    for (const s of [-1, 1]) P.add(M.oakDark, bx(0.14, 0.12, 0.3, s * h * 0.34, 0.06, (n - 1) / 2 * R * 2.1 + R * 0.6, { rz: 0 }));
    y += R * 1.78;
    n -= 1;
    tier += 1;
  }
  P.flush(g);
  const halfZ = rows * R * 1.05 + 0.1;
  return tagProp(g, 'barrel-stack', { tiers: tier, footprint: { x0: -h / 2 - 0.1, z0: -halfZ, x1: h / 2 + 0.1, z1: halfZ } });
}

/** A slatted crate. `open: true` shows the goods in it. */
export function crate({ seed = 'crate', w = 0.5, d = 0.46, h = 0.4, open = false, goods = null } = {}) {
  const rr = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  const mat = rr.chance(0.4) ? M.oakSilver : M.oak;
  for (const s of [-1, 1]) {
    P.add(mat, bx(w, h, 0.035, 0, h / 2, s * (d / 2)));
    P.add(mat, bx(0.035, h, d, s * (w / 2), h / 2, 0));
    for (const k of [-1, 1]) P.add(M.oakDark, bx(0.055, h, 0.055, s * (w / 2 - 0.03), h / 2, k * (d / 2 - 0.03)));
  }
  P.add(mat, bx(w, 0.035, d, 0, 0.02, 0));
  if (!open) P.add(mat, bx(w, 0.035, d, 0, h - 0.02, 0));
  else if (goods != null) P.add(painted(goods), bx(w * 0.82, 0.12, d * 0.82, 0, h - 0.06, 0));
  P.flush(g);
  return tagProp(g, 'crate', { w, d, h, footprint: { x0: -w / 2 - 0.02, z0: -d / 2 - 0.02, x1: w / 2 + 0.02, z1: d / 2 + 0.02 } });
}

/** A leaning stack of crates. */
export function crateStack({ seed = 'crates', n = 3, spill = true, goods = null } = {}) {
  const rr = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  let y = 0;
  for (let i = 0; i < n; i += 1) {
    const w = rr.range(0.44, 0.56);
    const d = rr.range(0.4, 0.52);
    const h = rr.range(0.32, 0.42);
    const mat = rr.chance(0.4) ? M.oakSilver : M.oak;
    const ry = rr.range(-0.22, 0.22);
    const ox = rr.range(-0.07, 0.07);
    const oz = rr.range(-0.07, 0.07);
    for (const s of [-1, 1]) {
      P.add(mat, bx(w, h, 0.035, ox, y + h / 2, oz + s * (d / 2), { ry }));
      P.add(mat, bx(0.035, h, d, ox + s * (w / 2), y + h / 2, oz, { ry }));
    }
    P.add(mat, bx(w, 0.035, d, ox, y + 0.02, oz, { ry }));
    P.add(mat, bx(w, 0.035, d, ox, y + h - 0.02, oz, { ry }));
    y += h;
  }
  if (spill) {
    const c = crate({ seed: `${seed}-spill`, open: true, goods });
    c.position.set(rr.range(0.5, 0.7), 0, rr.range(-0.4, 0.4));
    c.rotation.y = rr.range(-0.5, 0.5);
    g.add(c);
  }
  P.flush(g);
  return tagProp(g, 'crate-stack', { topY: y, footprint: { x0: -0.4, z0: -0.4, x1: 0.9, z1: 0.4 } });
}

/**
 * A stack of sacks. `color` is a parameter — MILLWARD'S FLOUR SACKS are its
 * owned accent and pass it in; every other sack in town is hessian.
 */
export function sackStack({ seed = 'sacks', n = 4, color = null, leaning = true } = {}) {
  const rr = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  const mat = color != null ? painted(color) : M.hessian;
  let y = 0;
  for (let i = 0; i < n; i += 1) {
    const h = rr.range(0.34, 0.46);
    const w = rr.range(0.2, 0.26);
    const ox = rr.range(-0.14, 0.14);
    const oz = rr.range(-0.14, 0.14);
    const rz = leaning ? rr.range(-0.28, 0.28) : 0;
    P.add(mat, cyl(w * 0.82, w, h, ox, y + h / 2, oz, { seg: 8, rz, ry: rr.range(0, TAU) }));
    P.add(mat, cyl(w * 0.3, w * 0.5, 0.1, ox, y + h - 0.02, oz, { seg: 7, rz }));
    P.add(M.rope, cyl(w * 0.32, w * 0.32, 0.02, ox, y + h - 0.06, oz, { seg: 7, rz }));
    y += h * rr.range(0.82, 0.95);
  }
  P.flush(g);
  return tagProp(g, 'sack-stack', { topY: y, footprint: { x0: -0.34, z0: -0.34, x1: 0.34, z1: 0.34 } });
}

/** A LOG PILE: split logs stacked with their cut ends out. The cut ends
 *  are the whole read — a pile with its logs end-on is a pile of sticks. */
export function logPile({ seed = 'logs', w = 2.0, h = 1.0, d = 0.6, roof = false } = {}) {
  const rr = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  const rows = Math.max(2, Math.round(h / 0.17));
  for (let row = 0; row < rows; row += 1) {
    const y = 0.09 + row * (h / rows);
    const n = Math.max(2, Math.round(w / rr.range(0.17, 0.23)));
    for (let i = 0; i < n; i += 1) {
      const R = rr.range(0.07, 0.105);
      const x = (i / (n - 1) - 0.5) * (w - R * 2);
      P.add(rr.chance(0.5) ? M.bark : M.barkDark,
        cyl(R, R, d * rr.range(0.9, 1.0), x + rr.range(-0.02, 0.02), y, rr.range(-0.03, 0.03), { seg: 7, rx: Math.PI / 2 }));
      P.add(M.oakSilver, cyl(R * 0.92, R * 0.92, 0.02, x, y, d / 2 + 0.01, { seg: 7, rx: Math.PI / 2 }));
    }
  }
  for (const s of [-1, 1]) P.add(M.oakDark, bx(0.08, h + 0.2, 0.08, s * (w / 2 + 0.06), (h + 0.2) / 2, 0));
  if (roof) {
    const sr = shedRoof({ w: w + 0.5, d: d + 0.5, pitch: 0.24, overhang: 0.16, thickness: 0.08, downhill: 'z+', mat: M.oakSilver });
    sr.position.set(0, h + 0.24, 0);
    sr.userData.airborne = true;
    g.add(sr);
  }
  P.flush(g);
  return tagProp(g, 'log-pile', { h, footprint: { x0: -w / 2 - 0.12, z0: -d / 2 - 0.08, x1: w / 2 + 0.12, z1: d / 2 + 0.08 } });
}

/** A CHICKEN COOP: a boarded box on legs with a ramp, a pop-hole and a run
 *  of wire. No birds — the environment carries the narrative. */
export function chickenCoop({ seed = 'coop', w = 1.3, d = 1.0, h = 0.9, run = true, roofColor = null } = {}) {
  const rr = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  const legH = 0.32;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    P.add(M.oakDark, bx(0.08, legH, 0.08, sx * (w / 2 - 0.07), legH / 2, sz * (d / 2 - 0.07)));
  }
  const nb = Math.max(4, Math.round(w / 0.2));
  for (let i = 0; i < nb; i += 1) {
    const x = (i / (nb - 1) - 0.5) * (w - 0.16);
    P.add(rr.chance(0.4) ? M.oakSilver : M.oak, bx(w / nb - 0.01, h - legH, d, x, legH + (h - legH) / 2, 0));
  }
  P.add(M.oakDark, bx(0.24, 0.28, 0.03, -w * 0.2, legH + 0.16, d / 2 + 0.02));   // the pop-hole
  P.add(M.oakDark, tubeGeo([-w * 0.2, legH + 0.02, d / 2 + 0.02], [-w * 0.2, 0.0, d / 2 + 0.5], 0.05, 4));
  const sr = shedRoof({ w: w + 0.3, d: d + 0.3, pitch: 0.3, overhang: 0.14, thickness: 0.07, downhill: 'z-', mat: roofColor != null ? painted(roofColor) : M.shingleMoss });
  sr.position.set(0, h, 0);
  sr.userData.airborne = true;
  g.add(sr);
  if (run) {
    const rw = w + 1.3;
    const rd = d + 0.2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      P.add(M.oakDark, bx(0.05, 0.62, 0.05, sx * rw / 2, 0.31, sz * rd / 2 + d * 0.9));
    }
    for (const sz of [-1, 1]) P.add(M.oakDark, bx(rw, 0.045, 0.045, 0, 0.6, sz * rd / 2 + d * 0.9));
    for (let i = 0; i <= 10; i += 1) {
      P.add(M.iron, cyl(0.006, 0.006, 0.6, (i / 10 - 0.5) * rw, 0.3, rd / 2 + d * 0.9, { seg: 3 }));
    }
  }
  P.flush(g);
  return tagProp(g, 'chicken-coop', { footprint: { x0: -w / 2 - 0.1, z0: -d / 2 - 0.1, x1: w / 2 + 0.1, z1: d / 2 + 0.1 } });
}

/** A BEEHIVE — a straw skep on a stone, which is what a village keeps bees
 *  in. Three or four in a row along a south wall is a whole story. */
export function beehive({ seed = 'skep', r: R = 0.3, h = 0.42, stand = true } = {}) {
  const rr = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  const y0 = stand ? 0.24 : 0;
  if (stand) {
    P.add(M.graniteDark, bx(R * 2.4, 0.14, R * 2.4, 0, 0.07, 0));
    P.add(M.oakDark, bx(R * 2.2, 0.08, R * 2.2, 0, 0.19, 0));
  }
  const coils = 6;
  for (let i = 0; i < coils; i += 1) {
    const t = i / coils;
    const rad = R * Math.sqrt(Math.max(0.02, 1 - t * t * 0.92));
    P.add(M.straw, cyl(rad * 0.94, rad, h / coils + 0.012, 0, y0 + h * t + h / coils / 2, 0, { seg: 10 }));
  }
  P.add(M.straw, cyl(0.05, 0.02, 0.09, 0, y0 + h + 0.03, 0, { seg: 7 }));
  P.add(M.barkDark, bx(0.11, 0.05, 0.03, 0, y0 + 0.05, R * 0.94));   // the entrance
  void rr;
  P.flush(g);
  return tagProp(g, 'beehive', { footprint: { x0: -R * 1.25, z0: -R * 1.25, x1: R * 1.25, z1: R * 1.25 } });
}

/**
 * A SHRINE-STONE: a standing stone with a carved band and a shelf for
 * offerings — the votive way up the knoll is a line of these. `flame: true`
 * puts a candle on the shelf with its own small pool.
 */
// capColor paints the 0.35 m cap cone -- on a votive stone that is a bucket
// (measured: the loudest thing in three frames running). The accent on a
// votive stone is its FLAME: pass flameColor instead and leave the cap stone.
export function shrineStone({ seed = 'stone', h = 1.1, w = 0.44, flame = false, capColor = null, flameColor = null } = {}) {
  const rr = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  const lean = rr.range(-0.05, 0.05);
  P.add(M.graniteDark, bx(w * 1.6, 0.16, w * 1.5, 0, 0.07, 0));
  P.add(M.granite, bx(w, h, w * 0.72, 0, 0.14 + h / 2, 0, { rz: lean }));
  P.add(M.graniteDark, bx(w + 0.12, 0.1, w * 0.84, 0, 0.14 + h * 0.62, 0, { rz: lean }));   // the carved band
  P.add(capColor != null ? painted(capColor) : M.graniteWarm,
    cyl(w * 0.55, w * 0.4, 0.16, 0, 0.14 + h + 0.06, 0, { seg: 7, rz: lean }));
  P.add(M.granite, bx(w * 1.5, 0.09, 0.28, 0, 0.14 + h * 0.3, w * 0.5, { rz: lean }));      // the offering shelf
  if (flame) {
    P.add(M.paper, cyl(0.03, 0.03, 0.13, 0.06, 0.14 + h * 0.3 + 0.11, w * 0.52, { seg: 6 }));
    P.add(flameColor != null ? painted(flameColor, { emissive: flameColor, emissiveIntensity: 0.7 }) : M.lit,
      cyl(0.02, 0.005, 0.07, 0.06, 0.14 + h * 0.3 + 0.21, w * 0.52, { seg: 5 }));
  }
  P.flush(g);
  tagProp(g, 'shrine-stone', { h, shelfY: 0.14 + h * 0.3, footprint: { x0: -w * 0.85, z0: -w * 0.8, x1: w * 0.85, z1: w * 0.8 } });
  const pools = [];
  if (flame) {
    const pool = lightPool({ r: 0.85, opacity: 0.3 });
    pool.position.set(0.06, 0.03, w * 0.52);
    pools.push(pool);
  }
  return withPools(g, pools);
}

/* ---- runs: fences, banners ---------------------------------------------- */

/**
 * A FENCE THAT STEPS WITH THE GROUND. `points` is a world polyline of
 * `[x, z]`; every panel is seated on the LOW ground under itself and topped
 * at `h` over the HIGH ground under itself, so the rails step down a slope
 * the way a real fence does. Pass `ctx` and it registers one collider per
 * panel — never one box along the chord, which on a dog-leg fences off open
 * ground and lets the player through ground that is not.
 *
 * `kind`: 'post-rail' (two rails, the moor and the fields), 'paling' (a
 * cottage garden's pointed pales), 'hurdle' (woven hazel, the fair ground),
 * 'palisade' (the gate's defensive line).
 */
export function fenceRun({
  points, kind = 'post-rail', h = 1.05, seed = 'fence', groundAt = null, ctx = null,
  postEvery = 1.9, mat = null, collide = true, gateAt = null,
}) {
  if (!points || points.length < 2) throw new Error('[kit] fenceRun: needs at least two points');
  const rr = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  const timber = mat ?? (kind === 'hurdle' ? M.wicker : M.oakSilver);
  const ground = groundAt ?? (() => 0);
  const pts = points.map((p) => (p.length === 3 ? [p[0], p[2]] : [p[0], p[1]]));

  for (let i = 0; i < pts.length - 1; i += 1) {
    const [ax, az] = pts[i];
    const [bxx, bz] = pts[i + 1];
    const len = Math.hypot(bxx - ax, bz - az);
    const n = Math.max(1, Math.round(len / postEvery));
    const ry = Math.atan2(-(bz - az), bxx - ax);
    /* PANEL LENGTH IS NOT A CONSTANT. A panel seated on its own low ground
     * is buried at its high end by exactly the fall across it, so the fall
     * across ONE panel has to stay under the audit's 0.3 m — which is the
     * same rule `wallRun` in builders.js marches to, and for the same
     * reason. Shorten until it does. */
    const FALL_MAX = 0.24;
    const fallOver = (t0, t1) => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let j = 0; j <= 4; j += 1) {
        const t = t0 + ((t1 - t0) * j) / 4;
        const y = ground(ax + (bxx - ax) * t, az + (bz - az) * t);
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
      }
      return { lo, hi, fall: hi - lo };
    };
    const cuts = [0];
    for (let k = 1; k <= n; k += 1) {
      let t0 = cuts[cuts.length - 1];
      const t1 = k / n;
      for (let guard = 0; guard < 6 && (t1 - t0) * len > 0.4; guard += 1) {
        if (fallOver(t0, t1).fall <= FALL_MAX) break;
        const mid = (t0 + t1) / 2;
        cuts.push(mid);
        t0 = mid;
      }
      cuts.push(t1);
    }
    for (let k = 0; k < cuts.length - 1; k += 1) {
      const t0 = cuts[k];
      const t1 = cuts[k + 1];
      if (t1 - t0 < 1e-6) continue;
      const p0 = [ax + (bxx - ax) * t0, az + (bz - az) * t0];
      const p1 = [ax + (bxx - ax) * t1, az + (bz - az) * t1];
      const cx = (p0[0] + p1[0]) / 2;
      const cz = (p0[1] + p1[1]) / 2;
      if (gateAt && Math.hypot(cx - gateAt[0], cz - gateAt[1]) < (gateAt[2] ?? 1.6)) continue;
      // THE PANEL IS SEATED ON ITS OWN GROUND — this is the whole point
      const sp = fallOver(t0, t1);
      const y0 = sp.lo - 0.05;
      const y1 = sp.hi + h;
      const pl = len * (t1 - t0);
      if (kind === 'paling') {
        const np = Math.max(3, Math.round(pl / 0.16));
        for (let j = 0; j < np; j += 1) {
          const u = (j / (np - 1) - 0.5) * (pl - 0.08);
          const px = cx + Math.cos(-ry) * u;
          const pz = cz + Math.sin(-ry) * u;
          const ph = y1 - y0 - 0.1 + rr.range(-0.03, 0.03);
          P.add(timber, bx(0.06, ph, 0.028, px, y0 + ph / 2, pz, { ry }));
          P.add(timber, bx(0.06, 0.07, 0.028, px, y0 + ph + 0.03, pz, { ry, rz: 0 }));
        }
        for (const hy of [0.3, 0.78]) P.add(M.oakDark, bx(pl + 0.02, 0.055, 0.05, cx, y0 + (y1 - y0) * hy, cz, { ry, seg: Math.ceil(pl / 0.35) }));
      } else if (kind === 'hurdle') {
        const nw = Math.max(4, Math.round((y1 - y0) / 0.13));
        for (let j = 0; j < nw; j += 1) {
          P.add(timber, bx(pl + 0.02, 0.055, 0.05 + (j % 2 ? 0.02 : 0), cx, y0 + 0.08 + j * ((y1 - y0 - 0.1) / nw), cz,
            { ry, seg: Math.ceil(pl / 0.35) }));
        }
        for (let j = 0; j < 3; j += 1) {
          const u = (j / 2 - 0.5) * (pl - 0.1);
          P.add(M.oakDark, bx(0.05, y1 - y0, 0.06, cx + Math.cos(-ry) * u, (y0 + y1) / 2, cz + Math.sin(-ry) * u, { ry }));
        }
      } else if (kind === 'palisade') {
        const np = Math.max(4, Math.round(pl / 0.24));
        for (let j = 0; j < np; j += 1) {
          const u = (j / (np - 1) - 0.5) * (pl - 0.1);
          const px = cx + Math.cos(-ry) * u;
          const pz = cz + Math.sin(-ry) * u;
          const ph = y1 - y0 + rr.range(-0.06, 0.06);
          P.add(M.oakDark, cyl(0.075, 0.085, ph, px, y0 + ph / 2, pz, { seg: 6 }));
          P.add(M.oakDark, cyl(0.075, 0.012, 0.16, px, y0 + ph + 0.07, pz, { seg: 6 }));
        }
        P.add(M.oak, bx(pl + 0.02, 0.09, 0.09, cx, y0 + (y1 - y0) * 0.6, cz + 0.11, { ry, seg: Math.ceil(pl / 0.35) }));
      } else {
        for (const hy of [0.42, 0.84]) {
          P.add(timber, bx(pl + 0.04, 0.075, 0.055, cx, y0 + 0.05 + (y1 - y0 - 0.05) * hy, cz,
            { ry, seg: Math.ceil(pl / 0.35) }));
        }
      }
      if (collide && ctx) {
        const hx = Math.abs(Math.cos(ry)) * pl / 2 + 0.06;
        const hz = Math.abs(Math.sin(ry)) * pl / 2 + 0.06;
        ctx.collide(cx - hx, cz - hz, cx + hx, cz + hz);
      }
    }
    // a post at every station, seated on its OWN ground
    for (let k = 0; k <= n; k += 1) {
      const t = k / n;
      const px = ax + (bxx - ax) * t;
      const pz = az + (bz - az) * t;
      if (gateAt && Math.hypot(px - gateAt[0], pz - gateAt[1]) < (gateAt[2] ?? 1.6) * 0.5) continue;
      const y0 = ground(px, pz) - 0.08;
      const ph = kind === 'palisade' ? h + 0.3 : h + 0.1;
      P.add(M.oakDark, bx(0.11, ph, 0.11, px, y0 + ph / 2, pz));
      if (kind === 'post-rail') P.add(M.oakDark, cyl(0.075, 0.03, 0.1, px, y0 + ph + 0.04, pz, { seg: 6 }));
    }
  }
  P.flush(g);
  return tagProp(g, 'fence-run', { linear: true, kind, h });
}

/**
 * A BANNER POLE. `field` is the banner's colour and there is NO default
 * saturated one: gateward's heraldic pair passes `ACCENT.wardenMadder`.
 * The banner hangs from a cross-yard and has real folds, because a flat
 * rectangle of colour is a card and not cloth.
 */
export function bannerPole({
  seed = 'banner', h = 5.0, field = null, band = null, bw = 0.85, bh = 2.4,
  device = null, deviceInk = null, folds = 5, base = 'stone',
} = {}) {
  const rr = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  if (base === 'stone') {
    P.add(M.graniteDark, cyl(0.36, 0.3, 0.32, 0, 0.16, 0, { seg: 8 }));
    P.add(M.granite, cyl(0.26, 0.22, 0.16, 0, 0.38, 0, { seg: 8 }));
  }
  P.add(M.oak, cyl(0.07, 0.095, h, 0, h / 2 + 0.3, 0, { seg: 8 }));
  P.add(M.brass, cyl(0.055, 0.012, 0.28, 0, h + 0.44, 0, { seg: 7 }));
  const yardY = h + 0.12;
  P.add(M.oakDark, bx(bw + 0.24, 0.06, 0.06, 0, yardY, 0));
  for (const s of [-1, 1]) P.add(M.brass, cyl(0.03, 0.03, 0.05, s * (bw / 2 + 0.1), yardY, 0, { seg: 6 }));
  // the cloth: `folds` vertical panels, each at its own slight angle, so
  // the banner has a section instead of being a plane
  const cloth = field != null ? painted(field) : M.canvasWorn;
  for (let i = 0; i < folds; i += 1) {
    const u = (i / (folds - 1) - 0.5) * bw;
    const wobble = Math.sin((i / (folds - 1)) * Math.PI * 2 + rr.range(0, 1)) * 0.05;
    P.add(cloth, bx(bw / folds + 0.01, bh, 0.035, u, yardY - 0.04 - bh / 2, wobble, { ry: wobble * 2 }));
  }
  if (band != null) {
    P.add(painted(band), bx(bw + 0.02, 0.16, 0.045, 0, yardY - 0.04 - bh * 0.22, 0.006));
    P.add(painted(band), bx(bw + 0.02, 0.16, 0.045, 0, yardY - 0.04 - bh * 0.78, 0.006));
  }
  P.add(cloth, bx(bw + 0.06, 0.08, 0.045, 0, yardY - 0.03, 0));
  P.flush(g, { receive: false });
  if (device) {
    /* The heraldic charge, printed on BOTH faces of the cloth — two planes
     * back to back, never one DoubleSide plane, whose back face is the
     * artwork mirrored. It rides 4 mm proud of the folds so it is never
     * coplanar with them: two coplanar sheets are a coin toss. */
    const dp = devicePlate({
      device, w: bw * 0.72, h: bw * 0.72, double: true,
      bg: field ?? PAL.canvasWorn, ink: deviceInk ?? PAL.ink, seed: `${seed}-dev`,
    });
    dp.position.set(0, yardY - 0.04 - bh * 0.42, 0.032);
    g.add(dp);
  }
  return tagProp(g, 'banner-pole', {
    h, yardY, clothTop: yardY - 0.04, clothW: bw, clothH: bh, device,
    footprint: { x0: -0.36, z0: -0.36, x1: 0.36, z1: 0.36 },
  });
}

/** A LADDER against a wall — lowrow's story is somebody up one hanging a
 *  lantern from the eaves. `lean` is derived from the two joints it stands
 *  between, never guessed. */
export function ladder({ seed = 'ladder', len = 3.4, w = 0.44, standoff = 0.9 } = {}) {
  const g = new THREE.Group();
  const P = parts();
  const rise = Math.sqrt(Math.max(0.01, len * len - standoff * standoff));
  const lean = Math.atan2(standoff, rise);
  for (const s of [-1, 1]) {
    P.add(M.oak, bx(0.055, len, 0.075, s * w / 2, len / 2 * Math.cos(lean), len / 2 * Math.sin(lean), { rx: -lean }));
  }
  const n = Math.max(6, Math.round(len / 0.32));
  for (let i = 1; i < n; i += 1) {
    const t = i / n;
    P.add(M.oakDark, cyl(0.02, 0.02, w, 0, len * t * Math.cos(lean), len * t * Math.sin(lean), { seg: 6, rz: Math.PI / 2 }));
  }
  P.flush(g, { receive: false });
  return tagProp(g, 'ladder', { len, lean, topAt: [0, rise, standoff], footprint: { x0: -w / 2 - 0.06, z0: -0.1, x1: w / 2 + 0.06, z1: standoff + 0.1 } });
}

/** A washing line between two points, with cloths pegged on it. Cloth
 *  colours are a PARAMETER — washing is the cheapest colour in a village
 *  and the easiest place to spend somebody else's accent by accident. */
export function washingLine({ from, to, sag = 0.28, seed = 'washing', colors = null, n = 5 }) {
  const rr = rng(seed);
  const A = new THREE.Vector3().fromArray(from);
  const B = new THREE.Vector3().fromArray(to);
  const g = new THREE.Group();
  const P = parts();
  const at = (t) => {
    const p = A.clone().lerp(B, t);
    p.y -= Math.sin(Math.PI * t) * sag;
    return p;
  };
  let prev = at(0);
  for (let i = 1; i <= 12; i += 1) {
    const cur = at(i / 12);
    P.add(M.rope, tubeGeo(prev.toArray(), cur.toArray(), 0.01, 4));
    prev = cur;
  }
  const tones = (colors ?? [PAL.paper, PAL.canvasWorn, JOINERY.bone]).map((c) => painted(c));
  for (let i = 0; i < n; i += 1) {
    const t = (i + 0.6) / (n + 0.2);
    const p = at(t);
    const w = rr.range(0.34, 0.62);
    const h = rr.range(0.4, 0.8);
    P.add(tones[i % tones.length], bx(w, h, 0.02, p.x, p.y - h / 2 - 0.02, p.z, { ry: rr.range(-0.2, 0.2) }));
    P.add(M.oakDark, bx(0.03, 0.07, 0.03, p.x - w * 0.36, p.y, p.z));
    P.add(M.oakDark, bx(0.03, 0.07, 0.03, p.x + w * 0.36, p.y, p.z));
  }
  P.flush(g, { receive: false });
  g.name = 'washing-line';
  g.userData = { kind: 'washing-line', airborne: true };
  return g;
}

/* ---- the market stall --------------------------------------------------- */

/**
 * A FAIR STALL: four posts, a canvas canopy in two or three tones, a
 * trestle and its goods. The green's fair is rigged with these.
 *
 * THE CANOPY IS STRIPED IN PANELS, not one sheet, and it SAGS between its
 * posts — those two things are the whole difference between a stall and a
 * table with a lid. `tones` is a parameter with a neutral default; a
 * district passes its own.
 *
 * `back: true` boards the back, which is what a stall against a wall has.
 */
export function marketStall({
  seed = 'stall', w = 2.4, d = 1.6, h = 2.15, tones = null, back = false,
  goods = 'produce', trestle = true, sag = 0.11, valance = true, ctx = null,
} = {}) {
  const rr = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  const cloths = (tones ?? [PAL.canvas, PAL.canvasWorn]).map((c) => painted(c));
  const posts = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = sx * (w / 2 - 0.06);
    const pz = sz * (d / 2 - 0.06);
    P.add(M.oak, cyl(0.045, 0.055, h, px, h / 2, pz, { seg: 6 }));
    posts.push([px, pz]);
  }
  for (const sz of [-1, 1]) P.add(M.oakDark, bx(w, 0.05, 0.05, 0, h - 0.03, sz * (d / 2 - 0.06)));
  for (const sx of [-1, 1]) P.add(M.oakDark, bx(0.05, 0.05, d, sx * (w / 2 - 0.06), h - 0.08, 0));

  /* the canopy: panels across the ridge, each dipping by its own share of
   * the sag, so the cloth is a curve and not a plane */
  const nPanel = Math.max(3, Math.round(w / 0.42));
  const ridgeY = h + 0.34;
  for (let i = 0; i < nPanel; i += 1) {
    const u = (i / (nPanel - 1) - 0.5) * w;
    const dip = Math.sin((i / (nPanel - 1)) * Math.PI) * sag;
    const mat = cloths[i % cloths.length];
    for (const sz of [-1, 1]) {
      const eaveY = h + 0.04 - dip * 0.5;
      const rise = ridgeY - dip - eaveY;
      const run = d / 2 + 0.24;
      P.add(mat, bx(w / nPanel + 0.012, 0.03, Math.hypot(run, rise),
        u, (ridgeY - dip + eaveY) / 2, sz * run / 2, { rx: sz * Math.atan2(rise, run) }));
    }
  }
  P.add(M.oakDark, cyl(0.035, 0.035, w + 0.16, 0, ridgeY - sag * 0.5, 0, { seg: 6, rz: Math.PI / 2 }));
  if (valance) {
    // the scalloped valance along the front eave, which is the one detail
    // that says FAIR rather than market
    const nv = Math.max(5, Math.round(w / 0.24));
    for (let i = 0; i < nv; i += 1) {
      const u = (i / (nv - 1) - 0.5) * w;
      const dip = Math.sin((i / (nv - 1)) * Math.PI) * sag;
      P.add(cloths[i % cloths.length], bx(w / nv + 0.008, 0.2, 0.03, u, h - 0.06 - dip * 0.5, d / 2 + 0.24));
    }
  }
  if (back) {
    for (let i = 0; i < 5; i += 1) {
      P.add(cloths[(i + 1) % cloths.length], bx(w / 5 + 0.01, h - 0.1, 0.025, (i / 4 - 0.5) * w, (h - 0.1) / 2, -d / 2 - 0.02));
    }
  }
  if (trestle) {
    const tY = 0.86;
    P.add(M.oak, bx(w - 0.12, 0.06, d * 0.7, 0, tY, 0.08));
    P.add(M.oakDark, bx(w - 0.12, 0.1, 0.05, 0, tY - 0.06, 0.08 + d * 0.33));
    for (const sx of [-1, 1]) {
      for (const s2 of [-1, 1]) {
        P.add(M.oakDark, tubeGeo([sx * (w / 2 - 0.3), tY - 0.04, 0.08], [sx * (w / 2 - 0.3) + s2 * 0.3, 0, 0.08 + s2 * 0.22], 0.04, 4));
      }
    }
    // a cloth over the front of the trestle, and the goods on it
    P.add(cloths[1 % cloths.length], bx(w - 0.14, 0.68, 0.02, 0, tY - 0.34, 0.08 + d * 0.35));
    if (goods === 'produce') {
      for (let i = 0; i < 5; i += 1) {
        const px = (i / 4 - 0.5) * (w - 0.6);
        P.add(M.wicker, cyl(0.16, 0.13, 0.13, px, tY + 0.09, 0.06, { seg: 9, open: true }));
        P.add(rr.pick([M.leafOrchard, M.leaf, M.straw]), cyl(0.14, 0.1, 0.09, px, tY + 0.15, 0.06, { seg: 9 }));
      }
    } else if (goods === 'bread') {
      for (let i = 0; i < 7; i += 1) {
        P.add(M.thatchRidge, cyl(0.07, 0.07, 0.24, (i % 4 - 1.5) * 0.24, tY + 0.1 + Math.floor(i / 4) * 0.12, 0.02 + (i % 2) * 0.14, { seg: 7, rz: Math.PI / 2, ry: rr.range(-0.3, 0.3) }));
      }
    } else if (goods === 'lanterns') {
      for (let i = 0; i < 6; i += 1) {
        P.add(M.lanternPaper, cyl(0.06, 0.09, 0.1, (i % 3 - 1) * 0.32, tY + 0.09 + Math.floor(i / 3) * 0.11, (i % 2 - 0.5) * 0.2, { seg: 8 }));
      }
      P.add(M.oakSilver, bx(0.5, 0.3, 0.34, w * 0.3, tY + 0.18, 0.02));
    } else if (goods === 'crocks') {
      for (let i = 0; i < 6; i += 1) {
        P.add(rr.pick([M.rubble, M.graniteWarm, M.copper]), cyl(0.07, 0.1, 0.16, (i % 3 - 1) * 0.34, tY + 0.11, (i % 2 - 0.5) * 0.22, { seg: 8 }));
      }
    }
  }
  P.flush(g);
  void ctx;
  return tagProp(g, 'market-stall', {
    w, d, h, ridgeY, trestleY: 0.86,
    // posts only, so you can stand under the canopy; a box round a stall is
    // a stall you cannot buy anything at
    colliders: posts.map(([px, pz]) => ({ x0: px - 0.1, z0: pz - 0.1, x1: px + 0.1, z1: pz + 0.1 })),
    footprintNone: true,
  });
}

/* ---- small stone furniture ---------------------------------------------- */

/** A stone trough, with or without water. */
export function trough({ seed = 'trough', len = 1.7, w = 0.66, h = 0.56, water = true } = {}) {
  const g = new THREE.Group();
  const P = parts();
  P.add(M.granite, bx(len, h, w, 0, h / 2, 0));
  P.add(M.graniteDark, bx(len - 0.16, 0.1, w - 0.16, 0, h - 0.04, 0));
  if (water) P.add(M.glass, bx(len - 0.2, 0.03, w - 0.2, 0, h - 0.08, 0));
  P.add(M.graniteDark, bx(len + 0.12, 0.1, w + 0.12, 0, 0.05, 0));
  P.flush(g);
  return tagProp(g, 'trough', { footprint: { x0: -len / 2 - 0.07, z0: -w / 2 - 0.07, x1: len / 2 + 0.07, z1: w / 2 + 0.07 } });
}

/** A mounting block: three worn treads by a gate. Registers platforms so
 *  it can actually be stood on. */
export function mountingBlock({ seed = 'block', w = 0.9, treads = 3, rise = 0.22, going = 0.4 } = {}) {
  const g = new THREE.Group();
  const P = parts();
  const platforms = [];
  for (let i = 0; i < treads; i += 1) {
    const h = (i + 1) * rise;
    const z0 = -going * (i + 1);
    P.add(M.granite, bx(w, h, going + 0.04, 0, h / 2, z0 + going / 2));
    platforms.push({ x0: -w / 2, z0: z0 - 0.02, x1: w / 2, z1: z0 + going + 0.02, top: h });
  }
  P.flush(g);
  return tagProp(g, 'mounting-block', { platforms, footprint: null });
}

/** A milestone / waymarker: the little leaning stone at a lane end. */
export function waymarker({ seed = 'marker', h = 0.7 } = {}) {
  const rr = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  const lean = rr.range(-0.09, 0.09);
  P.add(M.granite, cyl(0.16, 0.13, h, 0, h / 2, 0, { seg: 7, rz: lean }));
  P.add(M.graniteWarm, cyl(0.14, 0.05, 0.14, 0, h + 0.05, 0, { seg: 7, rz: lean }));
  P.add(M.moss, cyl(0.165, 0.165, 0.1, 0, 0.1, 0, { seg: 7, rz: lean }));
  P.flush(g);
  return tagProp(g, 'waymarker', { footprint: { x0: -0.2, z0: -0.2, x1: 0.2, z1: 0.2 } });
}

/** A KITCHEN GARDEN bed: earth, rows of green, and a couple of canes. */
export function kitchenGarden({ seed = 'garden', w = 2.4, d = 1.5, rows = 4, canes = true } = {}) {
  const rr = rng(seed);
  const g = new THREE.Group();
  const P = parts();
  P.add(M.oakSilver, bx(w + 0.1, 0.14, 0.08, 0, 0.07, d / 2));
  P.add(M.oakSilver, bx(w + 0.1, 0.14, 0.08, 0, 0.07, -d / 2));
  P.add(M.oakSilver, bx(0.08, 0.14, d, w / 2, 0.07, 0));
  P.add(M.oakSilver, bx(0.08, 0.14, d, -w / 2, 0.07, 0));
  P.add(M.earth, bx(w, 0.12, d, 0, 0.06, 0));
  for (let r0 = 0; r0 < rows; r0 += 1) {
    const z = (r0 / (rows - 1) - 0.5) * (d - 0.3);
    const n = Math.max(3, Math.round(w / 0.3));
    for (let i = 0; i < n; i += 1) {
      const x = (i / (n - 1) - 0.5) * (w - 0.24);
      P.add(rr.pick([M.leaf, M.leafOrchard, M.hedge]),
        cyl(0.02, 0.11, rr.range(0.16, 0.28), x, 0.12 + 0.1, z, { seg: 6 }));
    }
  }
  if (canes) {
    for (let i = 0; i < 4; i += 1) {
      const x = (i / 3 - 0.5) * (w - 0.5);
      P.add(M.oakDark, cyl(0.014, 0.014, 1.1, x, 0.6, -d * 0.28, { seg: 4, rz: rr.range(-0.14, 0.14) }));
    }
    P.add(M.oakDark, bx(w - 0.4, 0.02, 0.02, 0, 1.08, -d * 0.28));
  }
  P.flush(g);
  return tagProp(g, 'kitchen-garden', { footprint: { x0: -w / 2 - 0.08, z0: -d / 2 - 0.08, x1: w / 2 + 0.08, z1: d / 2 + 0.08 } });
}

/** Everything above, on one object, for `import { villageProps } from '../kit'`. */
export const villageProps = {
  lightPool, hitbox, interactive, lanternString,
  bracketLantern, postLantern, torch, brazier,
  wellHead, cart, hayBale, hayRick, barrel, barrelStack, crate, crateStack,
  sackStack, logPile, chickenCoop, beehive, shrineStone,
  fenceRun, bannerPole, ladder, washingLine, marketStall,
  trough, mountingBlock, waymarker, kitchenGarden,
};
