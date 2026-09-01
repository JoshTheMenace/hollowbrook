import * as THREE from 'three';
import { PAL, JOINERY } from '../palette.js';
import { M, painted, litGlass, glowing, wallMaterial, panelMaterial, thatchMaterial, shingleMaterial } from './mats.js';
import { bx, cyl, tubeGeo, parts, rng, pushQuadUV, polyGeometryUV } from './util.js';
import { thatchRoof, shingleRoof, hipRoof, coneCap, gableFill, chimney, THATCH_PITCH, SHINGLE_PITCH } from './roofs.js';

/* ------------------------------------------------------------------ *
 * THE FIVE BUILDING TYPES OF THISTLEDOWN.
 *
 *   cottage     1.5 or 2 storeys of timber frame under thatch. Thirty of
 *               the town's forty buildings are this one generator.
 *   longhouse   the inn and the guildhall: a hall building with a gallery
 *   roundTower  the gate towers (6 m) and the wizards' tower (16 m)
 *   temple      the shrine on the knoll: porch, bellcote, votive niches
 *   windmill    the tower mill, with FOUR SAILS THAT TURN
 *
 * CONVENTIONS, all five the same and all five load-bearing:
 *
 *  - AUTHORED FACING +Z, origin on the ground at the centre of the
 *    footprint. You never rotate one by hand: `place(ctx, group, {x, z,
 *    yaw})` seats it on the ground BY QUERY, rotates it, and registers its
 *    footprint collider and any platforms it declared.
 *  - GEOMETRY IS POOLED PER MATERIAL. A generator that emits one mesh per
 *    stud blows a 460-mesh district budget on its fourth cottage, so every
 *    one of these collects into `parts()` and flushes one mesh per
 *    material — and hands its own collector to `thatchRoof`, so the roof
 *    merges into the building's pool rather than adding four more meshes.
 *  - DEPTH IS BUILT OUTWARD. You cannot carve a recess into a box. Every
 *    volume here is a solid BoxGeometry or a lofted solid, and a panel
 *    written BEHIND a wall face is inside the render, not recessed. Order
 *    going out from the wall is always glass -> bars -> frame -> shutters,
 *    each layer genuinely in front of the last.
 *  - THE ACCENT IS A PARAMETER AND NOTHING DEFAULTS TO ONE. `door` defaults
 *    to `JOINERY.oakStain`, `shutter` to `JOINERY.mossPaint`, a bell to
 *    `M.brass`, a sail's cloth to `M.canvas` — all muted. A district that
 *    wants its hedge-green on the doors passes `door: ACCENT.hedgeGreen`.
 *    Nothing in this file paints anything saturated on its own.
 *
 * ------------------------------------------------------------------
 * CROOKEDNESS — the thing that makes this a fantasy village and not a
 * tudor kit home, and the one mechanism here worth reading carefully.
 * ------------------------------------------------------------------
 *
 * A cottage that has stood four hundred years in soft ground LEANS, and
 * its upper storey leans a different way from its lower one. The naive
 * ways to do that both break the building:
 *
 *   - rotating the finished GROUP lifts one corner off the ground;
 *   - leaning the walls and leaving the roof level opens a wedge of
 *     daylight along one eave, which is the defect this whole kit's joint
 *     discipline exists to prevent.
 *
 * So the lean is a MATRIX APPLIED TO THE GEOMETRY, per storey, and every
 * storey's frame is composed from the one below it: the roof is authored
 * at the upper storey's wall-top centre and then multiplied by that
 * storey's own frame, so it leans WITH the wall it stands on and meets it
 * exactly. The lift the lean causes is computed, and the plinth is
 * extended down by exactly that much — which is what a settled cottage's
 * plinth actually looks like, buried on the high side.
 *
 * `crook` scales the whole effect: 0 for a new building (the guildhall, a
 * gate tower), 1 for the village, 1.6 for the alchemists' tower.
 * ------------------------------------------------------------------ */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const TAU = Math.PI * 2;

/* ---- openings ----------------------------------------------------------- */

/* THE OUTWARD NORMAL OF EACH FACE, and the ONLY sign in this file that
 * decides which side of a wall a dressing lands on.  `[cos yaw, sin yaw]`
 * written exactly rather than computed, so a half turn does not arrive with
 * 1.2e-16 of fuzz on it. */
const FACE = {
  'z+': { out: 1, axis: 'z', yaw: 0, co: 1, si: 0 },
  'z-': { out: -1, axis: 'z', yaw: Math.PI, co: -1, si: 0 },
  'x+': { out: 1, axis: 'x', yaw: Math.PI / 2, co: 0, si: 1 },
  'x-': { out: -1, axis: 'x', yaw: -Math.PI / 2, co: 0, si: -1 },
};

/** The four face names, in the order a building dresses them. */
export const FACES = Object.keys(FACE);

/**
 * WHERE A FACE'S WALL PLANE IS, derived from the face's own outward normal.
 *
 * `half` is the OUTWARD half-extent of the body — always positive, always the
 * same number for a face and its opposite — and `centre` is the body's own
 * centre on that axis (0 for anything symmetric about the origin; the
 * longhouse sets its hall back from its arcade, the temple from its porch).
 *
 * This exists because a per-face sign written by hand is wrong on the faces
 * nobody renders, and it renders perfectly either way: the frame is simply
 * somewhere else.  Every call site here passed `+d/2` for BOTH z faces for
 * the whole life of this kit, so every back and west elevation in the town
 * had its timber frame buried in the opposite wall and every front and east
 * one wore two.  Nothing threw; the walls were solid boxes.
 */
export function facePlane(face, half, centre = 0) {
  const f = FACE[face];
  if (!f) throw new Error(`[kit] facePlane: face must be 'z+' | 'z-' | 'x+' | 'x-', got ${face}`);
  if (!(half >= 0)) {
    throw new Error(`[kit] facePlane('${face}'): 'half' is the OUTWARD half-extent and must be ` +
      `>= 0 (got ${half}). The sign belongs to the face, not to the caller.`);
  }
  return centre + f.out * half;
}

/**
 * Map a point authored in a canonical +Z-facing frame onto one of the four
 * faces of a building — one rigid transform, `anchor + R_y(yaw) · p`, so
 * there is no per-case arithmetic to get backwards.
 *
 * `u` runs along the face and `pz` runs OUTWARD from it, on every face: a
 * dressing written at `pz = +0.05` stands 50 mm proud of whichever wall it is
 * put on.  `px` runs to the RIGHT as seen from outside that face, which is
 * why a gap or an opening at local `+u` on a 'z-' face is at `-px` there.
 *
 * @param {string} face   'z+' | 'z-' | 'x+' | 'x-'
 * @param {number} half   the body's OUTWARD half-extent on that face's axis
 * @param {number} u      where along the face, in the body's own frame
 * @param {number} centre the body's centre on that axis (default 0)
 */
export function faceFrame(face, half, u, centre = 0) {
  const c = facePlane(face, half, centre);
  const { axis, yaw, co, si } = FACE[face];
  return {
    yaw,
    at: (px, py, pz) => {
      const rx = px * co + pz * si;
      const rz = pz * co - px * si;
      return axis === 'z' ? [u + rx, py, c + rz] : [c + rx, py, u + rz];
    },
  };
}

/**
 * A leaded casement in a timber frame. Small panes and a heavy oak
 * surround: the glazing bars are what make a window read at thirty metres,
 * where a single dark rectangle reads as a hole in the wall.
 *
 * `lit: true` puts a WARM INTERIOR CARD behind the glass rather than
 * painting the pane yellow — a lit window is a room you can half see into,
 * and the difference is the whole of polish mechanism 6.
 *
 * @param {object} P the generator's `parts()` collector
 */
export function windowOn(P, {
  face, half, centre = 0, u, y, w = 0.72, h = 0.9, cols = 2, rows = 3,
  shutters = 'none', shutterColor = JOINERY.mossPaint, lit = false, sill = true,
  frameMat = M.oakDark, glassMat = null, dressing = null, mullion = true, boxed,
}) {
  const F = faceFrame(face, half, u, centre);
  const put = (mat, bw, bh, bd, px, py, pz, rot = {}) =>
    P.add(mat, bx(bw, bh, bd, ...F.at(px, py, pz), { ry: F.yaw, ...rot }));
  const stone = dressing ?? M.oakDark;

  // the pane, and BEHIND it the warm card that makes a lit window a room
  put(glassMat ?? M.glassDark, w, h, 0.02, 0, y, 0.012);
  if (lit) put(M.lit, w * 0.94, h * 0.94, 0.015, 0, y, 0.022);
  const bar = 0.03;
  if (mullion) {
    for (let i = 1; i < cols; i += 1) put(frameMat, bar * 1.5, h, 0.022, (i / cols - 0.5) * w, y, 0.03);
    for (let j = 1; j < rows; j += 1) put(frameMat, w, bar, 0.022, 0, y + (j / rows - 0.5) * h, 0.03);
  }
  // frame: jambs, head, sill. The sill oversails and throws the shadow line
  // across the wash that seats the window in the wall — never leave it off.
  for (const s of [-1, 1]) put(frameMat, 0.07, h + 0.09, 0.075, s * (w / 2 + 0.035), y, 0.032);
  put(frameMat, w + 0.2, 0.09, 0.08, 0, y + h / 2 + 0.045, 0.036);
  if (sill) put(stone, w + 0.3, 0.075, 0.16, 0, y - h / 2 - 0.04, 0.058);
  if (boxed) {
    // a window box: the one place a cottage puts colour on its own account
    put(M.oakDark, w * 0.9, 0.16, 0.2, 0, y - h / 2 - 0.16, 0.11);
    put(M.leaf, w * 0.84, 0.14, 0.16, 0, y - h / 2 - 0.09, 0.11);
  }
  if (shutters === 'open') {
    for (const s of [-1, 1]) {
      put(painted(shutterColor), w * 0.52, h * 0.98, 0.04, s * (w * 0.8), y, 0.066);
      put(painted(shutterColor), w * 0.48, 0.05, 0.045, s * (w * 0.8), y + h * 0.28, 0.09);
    }
  } else if (shutters === 'closed') {
    put(painted(shutterColor), w + 0.06, h * 0.99, 0.04, 0, y, 0.066);
    for (const s of [-1, 1]) put(painted(shutterColor), w + 0.06, 0.05, 0.05, 0, y + s * h * 0.28, 0.09);
    put(M.ironDark, 0.05, 0.05, 0.06, 0, y, 0.096);
  }
}

/**
 * A plank door with strap hinges, a threshold and an optional hood. Same
 * outward-layering rule as the windows. `color` is a PARAMETER: lowrow's
 * hedge-green door family is passed in, never defaulted here.
 */
export function doorOn(P, {
  face, half, centre = 0, u, w = 0.92, h = 1.94, y0 = 0, color = JOINERY.oakStain,
  planks = 4, hinges = true, step = true, hood = false, arch = false,
  frameMat = M.oakDark, stepMat = M.graniteDark, latch = true, leaf = true,
}) {
  const F = faceFrame(face, half, u, centre);
  const put = (mat, bw, bh, bd, px, py, pz, rot = {}) =>
    P.add(mat, bx(bw, bh, bd, ...F.at(px, py, pz), { ry: F.yaw, ...rot }));
  const cy = y0 + h / 2;
  /* `leaf: false` is what an ENTERABLE building asks for: the opening is a
   * real hole cut by `hollowShell` and the leaf is a hinged group built by
   * core/interior.js `makeDoorLeaf`, so the painted plank panel, its straps
   * and its latch all move onto that and must not be drawn here as well.
   * The SURROUND — posts, lintel, relieving arch, step, hood — stays: it is
   * the wall's own joinery and it is what keeps the elevation unchanged. */
  const leafMat = painted(color);
  if (leaf) {
    put(leafMat, w, h, 0.06, 0, cy, 0.035);
    for (let i = 1; i < planks; i += 1) {
      put(M.ironDark, 0.018, h * 0.94, 0.018, (i / planks - 0.5) * w, cy, 0.068);
    }
  }
  // the frame: two posts and a heavy oak lintel, which is what a cottage
  // door actually has instead of dressed stone
  for (const s of [-1, 1]) put(frameMat, 0.11, h + 0.12, 0.08, s * (w / 2 + 0.055), cy + 0.06, 0.03);
  put(frameMat, w + 0.32, 0.15, 0.09, 0, y0 + h + 0.075, 0.034);
  if (arch) {
    // a shallow relieving arch of five stones over the lintel
    for (let i = 0; i < 5; i += 1) {
      const a = -0.5 + i / 4;
      put(M.graniteDark, (w + 0.3) / 5.4, 0.16, 0.06, a * (w + 0.24), y0 + h + 0.2 + (0.25 - a * a) * 0.34, 0.028, { rz: -a * 0.5 });
    }
  }
  if (hinges && leaf) for (const s of [-1, 1]) put(M.ironDark, w * 0.66, 0.05, 0.018, -w * 0.14, cy + s * h * 0.3, 0.072);
  if (latch && leaf) {
    put(M.ironDark, 0.05, 0.05, 0.085, w * 0.32, cy + 0.03, 0.078);
    put(M.ironDark, 0.11, 0.02, 0.02, w * 0.26, cy + 0.12, 0.072);
  }
  if (step) put(stepMat, w + 0.36, 0.11, 0.36, 0, y0 + 0.055, 0.2);
  if (hood) {
    put(M.oakDark, w + 0.46, 0.07, 0.5, 0, y0 + h + 0.28, 0.25);
    for (const s of [-1, 1]) {
      P.add(M.oakDark, tubeGeo(F.at(s * (w / 2 + 0.05), y0 + h - 0.15, 0.05),
        F.at(s * (w / 2 + 0.05), y0 + h + 0.26, 0.42), 0.035, 5));
    }
  }
}

/**
 * THE TIMBER FRAME on one elevation. Sill beam, corner posts, studs at a
 * seeded spacing, a mid-rail and the wall plate — plus curved braces at the
 * corners, which is the single detail that separates a timber-frame wall
 * from a wall with stripes painted on it.
 *
 * The members are emitted PROUD of the wall face (0.05 m), because you
 * cannot carve a recess into a box: a frame written flush is a texture and
 * a frame written behind the face is not there at all.
 */
export function frameElevation(P, {
  face, half, centre = 0, w, y0 = 0, h = 2.3, u = 0, seed = 'frame', mat = M.timberFrame,
  studs, braces = true, midRail = true, proud = 0.05, t = 0.13, skip = [], gaps = [],
}) {
  const r = rng(seed);
  const F = faceFrame(face, half, u, centre);
  const put = (bw, bh, bd, px, py, pz, rot = {}) =>
    P.add(mat, bx(bw, bh, bd, ...F.at(px, py, pz), { ry: F.yaw, ...rot }));
  const z = proud;

  /* `gaps` is what a WALKABLE opening needs and `skip` is not.  `skip` only
   * drops studs, which is right for a painted door: a sill beam across its
   * foot and a mid-rail across its middle read as the frame passing behind
   * a panel.  Cut a real hole in the wall and those two members become a
   * kerb at 0.4 m and a bar at 1.4 m standing IN the doorway — geometry the
   * player walks through, in the one place a building has to be open.  So a
   * gap splits the horizontal runs as well as dropping the studs. */
  const blocked = (a, b) => gaps.some(([g0, g1]) => b > g0 && a < g1);
  const run = (bh, py, bd = t + 0.02) => {
    const cuts = [-w / 2, w / 2];
    for (const [g0, g1] of gaps) cuts.push(Math.max(-w / 2, g0), Math.min(w / 2, g1));
    cuts.sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i += 1) {
      const a = cuts[i];
      const b = cuts[i + 1];
      if (b - a < 0.02 || blocked(a, b)) continue;
      put(b - a, bh, bd, (a + b) / 2, py, z);
    }
  };
  run(t, y0 + t / 2);                                          // sill beam
  put(w, t * 1.15, t + 0.02, 0, y0 + h - t * 0.575, z);        // wall plate
  for (const s of [-1, 1]) put(t * 1.2, h, t + 0.02, s * (w / 2 - t * 0.6), y0 + h / 2, z);  // corner posts
  const mid = y0 + h * 0.52;
  if (midRail) run(t * 0.8, mid, t);
  const n = studs ?? Math.max(1, Math.round(w / r.range(1.0, 1.5)));
  for (let i = 1; i < n; i += 1) {
    const px = (i / n - 0.5) * w;
    if (skip.some(([a, b]) => px > a && px < b)) continue;
    if (blocked(px - t * 0.4, px + t * 0.4)) continue;
    put(t * 0.78, h - t * 1.6, t * 0.9, px, y0 + h / 2, z);
  }
  if (braces) {
    // corner braces: a curved member from the post to the plate, drawn as
    // three short segments on a circular arc so it reads as sawn from a
    // crooked limb rather than as a straight diagonal
    for (const s of [-1, 1]) {
      const x0 = s * (w / 2 - t * 0.6);
      const y1 = y0 + h - t * 1.1;
      const reach = Math.min(w * 0.3, 1.0);
      /* a corner brace reaches a metre in from the post and drops to 0.95 m
       * above the sill — straight across the head of a 1.5 m opening cut
       * near that corner.  It is the third member `gaps` has to own, after
       * the sill beam and the mid-rail. */
      if (blocked(Math.min(x0, x0 - s * reach) - t, Math.max(x0, x0 - s * reach) + t)) continue;
      for (let k = 0; k < 3; k += 1) {
        const f0 = k / 3;
        const f1 = (k + 1) / 3;
        const p = (f) => [x0 - s * reach * f, y1 - reach * 0.95 * (1 - f) * (1 - f * 0.35)];
        const a = p(f0);
        const b = p(f1);
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        put(len + 0.02, t * 0.72, t * 0.85, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z,
          { rz: Math.atan2(b[1] - a[1], b[0] - a[0]) });
      }
    }
  }
}

/**
 * A TRADE FRONT bolted onto a wall: a shuttered stall opening with its
 * drop-down counter, a doorway beside it, and a fascia over both.
 *
 * ORIGIN ON THE WALL FACE, projecting +Z, and `userData.airborne = true` —
 * it is carried by the wall behind it, and the spatial audit must not read
 * a fascia three metres up as a unit floating in the air.
 *
 * `accent` is a parameter with NO default: pass your district's, or leave
 * it out and the front is joinery colours only.
 */
export function tradeFront({
  seed = 'trade', w = 3.2, h = 2.3, doorSide = 'right', accent = null,
  fasciaH = 0.42, counter = true, lit = false, goods = true, doorColor = JOINERY.oakStain,
  doorW = 0.94, doorLeaf = true,
}) {
  const g = new THREE.Group();
  const P = parts();
  const r = rng(seed);
  const s = doorSide === 'right' ? 1 : -1;
  /* `doorW` is a parameter because a shop you can WALK INTO needs 1.4 m of
   * clear opening (every collider is inflated by the walker's 0.34 m radius
   * on both jambs, so 0.94 m leaves 0.26 m and the route fill, which
   * strides 0.35 m, cannot even land a sample in it).  The stall opening
   * gives up what the door takes: the fascia, the sign bracket and every
   * offset a district reads off `userData.w` stay where they were. */
  const winW = w - doorW - 0.36;
  const winX = -s * (w / 2 - winW / 2 - 0.1);
  const doorX = s * (w / 2 - doorW / 2 - 0.12);

  // the stall opening: a dark reveal, the counter over it, the shutter above
  const winY = 1.22;
  const winH = 1.1;
  P.add(M.glassDark, bx(winW, winH, 0.03, winX, winY, 0.02));
  if (lit) P.add(M.lit, bx(winW * 0.92, winH * 0.9, 0.02, winX, winY, 0.032));
  for (let i = 1; i < 4; i += 1) P.add(M.oakDark, bx(0.045, winH, 0.03, winX + (i / 4 - 0.5) * winW, winY, 0.04));
  for (const e of [-1, 1]) P.add(M.oakDark, bx(0.1, winH + 0.16, 0.1, winX + e * (winW / 2 + 0.05), winY, 0.045));
  P.add(M.oakDark, bx(winW + 0.3, 0.12, 0.11, winX, winY + winH / 2 + 0.09, 0.05));
  if (counter) {
    // the drop-down counter a stall is actually served over, on its two
    // chains: this is the detail that says the shop is OPEN this evening
    P.add(M.oak, bx(winW + 0.24, 0.07, 0.52, winX, winY - winH / 2 - 0.06, 0.27));
    for (const e of [-1, 1]) {
      P.add(M.ironDark, tubeGeo([winX + e * (winW / 2 + 0.06), winY - winH / 2 - 0.06, 0.5],
        [winX + e * (winW / 2 + 0.06), winY + winH / 2 - 0.05, 0.06], 0.014, 4));
    }
    if (goods) {
      for (let i = 0; i < 4; i += 1) {
        const gx = winX + (i / 3 - 0.5) * winW * 0.8;
        P.add(r.chance(0.5) ? M.wicker : M.hessian,
          bx(r.range(0.16, 0.24), r.range(0.1, 0.17), r.range(0.16, 0.22), gx, winY - winH / 2 + 0.02, 0.3));
      }
    }
  }
  if (doorLeaf) {
    P.add(painted(doorColor), bx(doorW, 1.98, 0.05, doorX, 0.99, 0.028));
    for (let i = 1; i < 4; i += 1) P.add(M.ironDark, bx(0.016, 1.86, 0.016, doorX + (i / 4 - 0.5) * doorW, 0.99, 0.058));
  }
  for (const e of [-1, 1]) P.add(M.oakDark, bx(0.1, 2.12, 0.09, doorX + e * (doorW / 2 + 0.05), 1.06, 0.032));
  P.add(M.oakDark, bx(w, fasciaH, 0.1, 0, h + fasciaH / 2, 0.05));
  if (accent != null) P.add(painted(accent), bx(w - 0.1, 0.06, 0.12, 0, h + 0.03, 0.06));
  P.add(M.oakDark, bx(w + 0.16, 0.08, 0.34, 0, h + fasciaH + 0.04, 0.17));   // the drip over the fascia
  P.flush(g, { receive: false });
  g.userData = {
    kind: 'trade-front', prop: true, airborne: true,
    w, h, fasciaY: h + fasciaH / 2, fasciaZ: 0.1, doorX, doorW, doorH: 1.98, winX, winY, sillY: winY - winH / 2,
  };
  return g;
}

/* ---- the cottage -------------------------------------------------------- */

/**
 * THE COTTAGE. Thirty of Thistledown's forty buildings.
 *
 * @param {object} o
 * @param {string|number} o.seed
 * @param {number} [o.w] [o.d]        footprint, metres
 * @param {1.5|2} [o.storeys]         1.5 puts the upper rooms IN the roof
 *                                    with eyebrow dormers, which is what a
 *                                    thatched cottage usually is
 * @param {'thatch'|'shingle'} [o.roof]
 * @param {'limewash'|'granite'|'render'|'oak'} [o.wall]
 * @param {number} [o.crook]          0 straight, 1 village, 1.6 alarming
 * @param {number} [o.jetty]          the upper storey's overhang on the front
 * @param {number} [o.door]           door colour — YOUR ACCENT GOES HERE
 * @param {number} [o.shutter]        shutter colour, muted by default
 * @param {object|false} [o.trade]    `{ tenant, accent, lit }` -> a trade front
 * @param {number} [o.litWindows]     how many panes get a warm interior card
 * @returns {THREE.Group} userData {
 *   kind, w, d, storeys, wallTopY, upperY, eaveY, ridgeY, frontZ, doorX,
 *   doorY, sillY, chimneyTop, lean, footprint }
 *   eaveY / ridgeY are ABSOLUTE heights above the group origin. Read them;
 *   adding a wall height to a remembered roof rise is how a lamp bracket
 *   ends up inside a roof.
 */
export function cottage({
  seed = 'cottage', w = 5.6, d = 4.8, storeys = 1.5, groundH = 2.3, upperH = 2.05,
  wall = 'limewash', wallColor = null, roof = 'thatch', pitch, ridgeAxis = 'x',
  crook = 1, jetty = null, door = JOINERY.oakStain, shutter = JOINERY.mossPaint,
  shutters = 'mixed', trade = false, tradeAccent = null, chimney: withChimney = true,
  dormers = null, litWindows = 0, plinth = true, frame = true, thatchWobble = 0.075,
  windowBoxes = null, hollow = null,
} = {}) {
  const r = rng(seed);
  const rr = r.fork('shape');
  const group = new THREE.Group();
  const P = parts();

  const two = storeys >= 2;
  const jet = jetty ?? (two && rr.chance(0.55) ? rr.range(0.16, 0.3) : 0);
  const pit = pitch ?? (roof === 'thatch'
    ? rr.range(THATCH_PITCH.min, THATCH_PITCH.max)
    : rr.range(SHINGLE_PITCH.min, SHINGLE_PITCH.max));
  const wallMat = wallColor != null ? painted(wallColor) : wallMaterial(wall, r.fork('wall'));
  const panelMat = wall === 'limewash' ? panelMaterial(r.fork('panel')) : wallMat;
  const roofMat = roof === 'thatch' ? thatchMaterial(r.fork('roof')) : shingleMaterial(r.fork('roof'));

  /* ---- the lean. See the note at the head of this file. --------------- */
  /* About 1.5 degrees on the ground storey and another 1.7 on the one over
   * it, at `crook: 1`. Under a degree is a survey error and reads as
   * nothing; over four is a building falling down. This band is what makes
   * a row of these read as a settled village rather than as a kit. */
  const lz0 = rr.range(-1, 1) * 0.026 * crook;
  const lx0 = rr.range(-1, 1) * 0.020 * crook;
  const lz1 = rr.range(-1, 1) * 0.030 * crook;
  const lx1 = rr.range(-1, 1) * 0.024 * crook;
  const XF0 = new THREE.Matrix4().makeRotationZ(lz0).multiply(new THREE.Matrix4().makeRotationX(lx0));
  const upperY = groundH;
  const XF1 = two
    ? XF0.clone()
      .multiply(new THREE.Matrix4().makeTranslation(0, upperY, 0))
      .multiply(new THREE.Matrix4().makeRotationZ(lz1))
      .multiply(new THREE.Matrix4().makeRotationX(lx1))
    : XF0;
  // how far the lean lifts the highest base corner off the ground — the
  // plinth is extended DOWN by exactly this, which is what a settled
  // cottage's plinth looks like: buried on the high side
  const lift = (w / 2) * Math.abs(lz0) + (d / 2) * Math.abs(lx0) + 0.05;

  const put0 = (mat, ...gs) => { for (const g of gs) if (g) { g.applyMatrix4(XF0); P.add(mat, g); } };
  const put1 = (mat, ...gs) => { for (const g of gs) if (g) { g.applyMatrix4(XF1); P.add(mat, g); } };
  // the two collectors the opening helpers write into: `parts()`-shaped
  // proxies that fold the storey's own frame into every geometry
  const P0 = { add: (mat, ...gs) => put0(mat, ...gs) };
  const P1 = { add: (mat, ...gs) => put1(mat, ...gs) };

  /* ---- ground storey ---- */
  const plinthH = plinth ? 0.34 : 0;
  /* HOLLOW: the ground storey stops being a solid box.  Its four walls, its
   * floor and its ceiling are built by `hollowShell` in world coordinates
   * (see src/rooms.js) so that the colliders and the opening come from ONE
   * description; what is left here is everything that is NOT the wall — the
   * plinth, the openings' joinery, the frame, the storey above and the roof.
   * The plinth becomes a RING for the same reason the wall goes: a solid
   * podium 0.34 m tall fills the room it is meant to stand under, and the
   * furniture then floats on it.  The ring is gapped at the doorway so the
   * threshold is flush rather than a kerb across the one walkable opening. */
  if (plinth && !hollow) put0(M.rubble, bx(w + 0.14, plinthH + lift, d + 0.14, 0, (plinthH - lift) / 2, 0));
  if (!hollow) put0(wallMat, bx(w, groundH - plinthH + 0.02, d, 0, plinthH + (groundH - plinthH) / 2, 0));

  const frontZ = d / 2;
  const doorX = rr.range(-0.26, 0.26) * w;
  const doorY = plinthH * 0.2;
  const sillY = plinthH + 0.95;
  const shutterFor = () => (shutters === 'mixed' ? rr.pick(['open', 'open', 'none', 'closed']) : shutters);
  let lit = litWindows;
  const takeLit = () => (lit > 0 ? (lit -= 1, true) : false);

  let tradeGroup = null;
  /* Where the WALKABLE opening is, in this generator's own frame — reported
   * on userData so the shell is cut where the joinery actually is instead of
   * at a number somebody re-derived.
   *
   * `faceCoord` HERE IS THE SIGNED PLANE, not the half-extent the dressing
   * helpers take: `src/rooms.js` measures the door's offset from the body
   * centre off it, so it wants the coordinate rather than the extent.  It is
   * always `facePlane(face, half, centre)` of the face the door is in. */
  let hollowDoor = null;
  if (trade) {
    const tw = clamp(w * 0.62, 2.6, 3.6);
    tradeGroup = tradeFront({
      seed: `${seed}-trade`, w: tw, h: groundH - plinthH - 0.12,
      accent: tradeAccent ?? trade.accent ?? null, lit: trade.lit ?? false,
      doorSide: rr.chance(0.5) ? 'right' : 'left', doorColor: door,
      doorW: hollow ? (hollow.doorW ?? 1.5) : 0.94, doorLeaf: !hollow,
    });
    tradeGroup.position.set(rr.range(-0.1, 0.1) * w, plinthH, frontZ);
    tradeGroup.applyMatrix4(XF0);
    if (hollow) {
      hollowDoor = {
        face: 'z+', faceCoord: frontZ,
        u: tradeGroup.position.x + tradeGroup.userData.doorX,
        w: tradeGroup.userData.doorW, h: tradeGroup.userData.doorH, y0: plinthH,
      };
    }
  } else {
    if (hollow) {
      hollowDoor = {
        face: 'z+', faceCoord: frontZ, u: hollow.doorU ?? doorX,
        w: hollow.doorW ?? 1.5, h: hollow.doorH ?? 1.94, y0: doorY,
      };
    }
    doorOn(P0, {
      face: 'z+', half: d / 2, u: hollowDoor ? hollowDoor.u : doorX,
      w: hollowDoor ? hollowDoor.w : 0.92, h: hollowDoor ? hollowDoor.h : 1.94,
      y0: doorY, color: door, leaf: !hollow,
      hood: rr.chance(0.45), arch: wall === 'granite',
    });
    // a window each side of the door, whichever side has room
    for (const s of [-1, 1]) {
      const u = doorX + s * rr.range(1.35, 1.75);
      if (Math.abs(u) > w / 2 - 0.65) continue;
      windowOn(P0, {
        face: 'z+', half: d / 2, u, y: sillY + 0.42, w: 0.72, h: 0.88,
        shutters: shutterFor(), shutterColor: shutter, lit: takeLit(),
        boxed: windowBoxes ?? rr.chance(0.3),
      });
    }
  }
  for (const face of ['x+', 'x-']) {
    if (rr.chance(0.8)) {
      windowOn(P0, {
        face, half: w / 2, u: rr.range(-0.22, 0.22) * d, y: sillY + 0.4,
        w: 0.62, h: 0.8, shutters: shutterFor(), shutterColor: shutter, lit: takeLit(),
      });
    }
  }
  if (rr.chance(0.7)) {
    windowOn(P0, {
      face: 'z-', half: d / 2, u: rr.range(-0.3, 0.3) * w, y: sillY + 0.4,
      w: 0.6, h: 0.78, shutters: 'none', shutterColor: shutter, lit: takeLit(),
    });
  }
  if (frame) {
    // the doorway's own gap, jambs included: a sill beam or a mid-rail run
    // across a real opening is a member standing in the doorway
    const doorGap = hollowDoor
      ? [[hollowDoor.u - hollowDoor.w / 2 - 0.17, hollowDoor.u + hollowDoor.w / 2 + 0.17]]
      : [];
    /* THE GAP GOES ON 'z+' ONLY, and it used to have to go on 'z-' as well.
     * While `faceFrame`'s '-' cases took the positive half-extent every call
     * site handed them, the whole BACK elevation's frame was drawn 0.05 m
     * inside the FRONT wall — so cutting a doorway in the front wall made the
     * back frame appear standing in the opening, and it had to be gapped too,
     * mirrored, because `px` runs the other way there.  The sign is derived
     * now (`facePlane`), the back frame is on the back wall, and there is no
     * doorway in it: one gap, on the face the door is actually in. */
    for (const [face, half, span] of [['z+', d / 2, w], ['z-', d / 2, w], ['x+', w / 2, d], ['x-', w / 2, d]]) {
      frameElevation(P0, {
        face, half: half + 0.001, w: span, y0: plinthH, h: groundH - plinthH,
        seed: `${seed}-f-${face}`, braces: true, proud: 0.05,
        gaps: face === 'z+' ? doorGap : [],
      });
    }
  }

  /* the plinth as a RING, gapped at the doorway (see the note above) */
  if (plinth && hollow) {
    const band = (hollow.wallT ?? 0.28) + 0.07;
    const oX = w / 2 + 0.07;
    const oZ = d / 2 + 0.07;
    const py = (plinthH - lift) / 2;
    const ph = plinthH + lift;
    put0(M.rubble, bx(w + 0.14, ph, band, 0, py, -oZ + band / 2));            // z-
    put0(M.rubble, bx(band, ph, d + 0.14 - band * 2, -oX + band / 2, py, 0)); // x-
    put0(M.rubble, bx(band, ph, d + 0.14 - band * 2, oX - band / 2, py, 0));  // x+
    const g0 = hollowDoor.u - hollowDoor.w / 2 - 0.03;
    const g1 = hollowDoor.u + hollowDoor.w / 2 + 0.03;
    for (const [a, b] of [[-oX, g0], [g1, oX]]) {
      if (b - a > 0.02) put0(M.rubble, bx(b - a, ph, band, (a + b) / 2, py, oZ - band / 2));
    }
  }

  /* ---- upper storey ---- */
  let wallTopY = groundH;
  let upW = w;
  let upD = d;
  if (two) {
    upW = w + jet * 2 * 0;      // the jetty projects on the FRONT only
    upD = d + jet;
    put1(wallMat, bx(upW, upperH, upD, 0, upperH / 2, jet / 2));
    if (jet > 0) {
      // the jetty needs its bressummer and its brackets, or the upper
      // storey is a box hanging in the air
      put1(M.oakDark, bx(upW + 0.12, 0.18, 0.2, 0, 0.09, d / 2 + jet - 0.06));
      for (const s of [-1, 1]) {
        put1(M.oakDark, tubeGeo([s * (upW / 2 - 0.35), -0.02, d / 2 + jet - 0.1],
          [s * (upW / 2 - 0.35), -0.62, d / 2 - 0.02], 0.055, 5));
      }
    }
    /* the upper storey's own body: `upD` deep, centred on `jet / 2`, because
     * the jetty projects on the front only.  Both z faces take that centre —
     * the front plane comes out at `d / 2 + jet` and the back one at `-d / 2`,
     * which is where the wall below it is. */
    const upZC = jet / 2;
    for (const s of [-1, 1]) {
      const u = s * rr.range(0.16, 0.3) * upW;
      windowOn(P1, {
        face: 'z+', half: upD / 2, centre: upZC, u, y: upperH * 0.52, w: 0.66, h: 0.82,
        shutters: shutterFor(), shutterColor: shutter, lit: takeLit(),
        boxed: windowBoxes ?? rr.chance(0.22),
      });
    }
    if (rr.chance(0.7)) {
      windowOn(P1, {
        face: rr.chance(0.5) ? 'x+' : 'x-', half: upW / 2, u: upZC + rr.range(-0.2, 0.2) * upD,
        y: upperH * 0.52, w: 0.56, h: 0.72, shutters: 'none', shutterColor: shutter, lit: takeLit(),
      });
    }
    if (frame) {
      for (const [face, half, span, ctr] of [['z+', upD / 2, upW, upZC], ['z-', upD / 2, upW, upZC],
        ['x+', upW / 2, upD, 0], ['x-', upW / 2, upD, 0]]) {
        frameElevation(P1, {
          face, half: half + 0.001, centre: ctr, w: span, y0: 0.02, h: upperH - 0.02,
          seed: `${seed}-g-${face}`, braces: true, proud: 0.05, u: face[0] === 'x' ? upZC : 0,
        });
      }
    }
    wallTopY = upperH;
  }

  /* ---- the roof ---- */
  const rw = two ? upW : w;
  const rd = two ? upD : d;
  const roofXF = XF1.clone().multiply(new THREE.Matrix4().makeTranslation(0, wallTopY, two ? jet / 2 : 0));
  const nDorm = dormers ?? (storeys < 2 ? rr.int(1, 2) : (rr.chance(0.35) ? 1 : 0));
  const dormerList = [];
  for (let i = 0; i < nDorm; i += 1) {
    const along = ridgeAxis === 'x' ? rw : rd;
    dormerList.push({
      side: 1,
      u: nDorm === 1 ? rr.range(-0.18, 0.18) * along : (i - (nDorm - 1) / 2) * (along / (nDorm + 0.4)),
      t: rr.range(0.48, 0.62), w: rr.range(1.35, 1.65), h: rr.range(0.54, 0.68),
      lit: takeLit(),
    });
  }
  let roofData;
  if (roof === 'thatch') {
    const rg = thatchRoof({
      w: rw, d: rd, pitch: pit, ridgeAxis, seed: `${seed}-thatch`, wobble: thatchWobble,
      dormers: dormerList, mat: roofMat, pool: P, xf: roofXF,
      overhang: rr.range(0.48, 0.62), endOver: rr.range(0.3, 0.44),
      thick: rr.range(0.3, 0.38),
    });
    roofData = rg.userData;
  } else {
    const rg = shingleRoof({ w: rw, d: rd, pitch: pit, ridgeAxis, mat: roofMat });
    rg.applyMatrix4(roofXF);
    group.add(rg);
    roofData = rg.userData;
  }
  // the gable-end fill, so the wall closes right up under the ridge
  const span = ridgeAxis === 'x' ? rd : rw;
  const along = ridgeAxis === 'x' ? rw : rd;
  const fill = gableFill({ span, along, ridgeY: roofData.ridgeY }, ridgeAxis);
  fill.applyMatrix4(roofXF);
  P.add(panelMat, fill);
  if (frame && wall === 'limewash') {
    // the gable's own frame: a collar and two rafters, on both ends
    for (const e of [-1, 1]) {
      const ha = along / 2;
      const hs = span / 2;
      const apex = roofData.ridgeY;
      for (const s of [-1, 1]) {
        const a = [s * hs, 0];
        const b = [0, apex];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const g = ridgeAxis === 'x'
          ? bx(0.13, 0.12, len, e * (ha + 0.005), (a[1] + b[1]) / 2, (a[0] + b[0]) / 2, { rx: -Math.atan2(b[1] - a[1], b[0] - a[0]) })
          : bx(len, 0.12, 0.13, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, e * (ha + 0.005), { rz: Math.atan2(b[1] - a[1], b[0] - a[0]) });
        g.applyMatrix4(roofXF);
        P.add(M.timberFrame, g);
      }
      const cg = ridgeAxis === 'x'
        ? bx(0.12, 0.11, span * 0.56, e * (ha + 0.005), apex * 0.44, 0)
        : bx(span * 0.56, 0.11, 0.12, 0, apex * 0.44, e * (ha + 0.005));
      cg.applyMatrix4(roofXF);
      P.add(M.timberFrame, cg);
    }
  }

  /* ---- the chimney ---- */
  let chimneyTop = null;
  if (withChimney) {
    const cs = rr.chance(0.5) ? 1 : -1;
    const cx = ridgeAxis === 'x' ? cs * (rw / 2 - 0.28) : rr.range(-0.16, 0.16) * rw;
    const cz = ridgeAxis === 'x' ? rr.range(-0.16, 0.16) * rd : cs * (rd / 2 - 0.28);
    const topY = roofData.ridgeY + rr.range(0.62, 1.0);
    const ch = chimney({ x: cx, z: cz, baseY: -0.5, topY, w: 0.7, d: 0.6, pots: rr.int(1, 2) });
    for (const g of ch.stack) { g.applyMatrix4(roofXF); P.add(M.rubble, g); }
    for (const g of ch.pots) { g.applyMatrix4(roofXF); P.add(M.graniteDark, g); }
    chimneyTop = new THREE.Vector3(cx, topY + 0.4, cz).applyMatrix4(roofXF);
  }

  P.flush(group);
  if (tradeGroup) group.add(tradeGroup);

  const eaveY = wallTopY + (two ? upperY : 0) + roofData.eaveY;
  const ridgeYAbs = wallTopY + (two ? upperY : 0) + roofData.ridgeY;
  group.userData = {
    kind: 'cottage', w, d, storeys, jetty: jet, ridgeAxis, groundH, plinthH,
    wallTopY: (two ? upperY : 0) + wallTopY,
    upperY: two ? upperY : null,
    eaveY, ridgeY: ridgeYAbs,
    frontZ, upperFrontZ: two ? d / 2 + jet : frontZ,
    doorX, doorY, sillY, chimneyTop: chimneyTop ? chimneyTop.toArray() : null,
    lean: [lz0, lx0], trade: tradeGroup ? tradeGroup.userData : null,
    /* the wall material, so a shell built OUTSIDE this generator can be the
     * same seeded limewash/granite the rest of the elevation is.  Two
     * materials that are nearly the same read as a repair patch. */
    mats: { wall: wallMat, panel: panelMat, roof: roofMat },
    hollow: hollow ? { ...hollow, door: hollowDoor } : null,
    /* NO `footprint` when hollow: one box over the plan seals the doorway,
     * which renders perfectly and is invisible to everything except the
     * flood fill.  `hollowShell` registers a collider per wall segment. */
    ...(hollow ? {} : { footprint: { x0: -w / 2 - 0.09, z0: -d / 2 - 0.09, x1: w / 2 + 0.09, z1: d / 2 + 0.09 } }),
  };
  return group;
}

/* ---- the longhouse ------------------------------------------------------ */

/**
 * THE LONGHOUSE: the inn (THE MOON & MARE) and the guildhall. A hall
 * building — long, two full storeys, and big enough that its roof is a
 * landmark rather than a detail.
 *
 * `gallery: true` gives it the coaching-inn front: an arcade of posts at
 * ground level with a boarded, balustraded gallery over it. THE ARCADE IS
 * NOT WALLED OFF — it registers a collider per POST and none across the
 * opening, because a box round an open-fronted structure is a shelter you
 * cannot stand in, and it renders perfectly while the flood fill reads the
 * inside as unreachable.
 */
export function longhouse({
  seed = 'longhouse', w = 12, d = 7, groundH = 2.6, upperH = 2.35,
  wall = 'limewash', wallColor = null, roof = 'thatch', pitch, ridgeAxis = 'x',
  crook = 0.55, gallery = true, bay = true, door = JOINERY.oakStain,
  shutter = JOINERY.mossPaint, chimney: withChimney = true, litWindows = 3,
  dormers = null, jetty = 0.26, accent = null, hollow = null, galleryDeck = true,
} = {}) {
  const r = rng(seed);
  const rr = r.fork('shape');
  const group = new THREE.Group();
  const P = parts();
  const pit = pitch ?? (roof === 'thatch'
    ? rr.range(THATCH_PITCH.min, THATCH_PITCH.max)
    : rr.range(SHINGLE_PITCH.min, SHINGLE_PITCH.max));
  const wallMat = wallColor != null ? painted(wallColor) : wallMaterial(wall, r.fork('wall'));
  const roofMat = roof === 'thatch' ? thatchMaterial(r.fork('roof')) : shingleMaterial(r.fork('roof'));

  const lz0 = rr.range(-1, 1) * 0.009 * crook;
  const lx0 = rr.range(-1, 1) * 0.007 * crook;
  const XF0 = new THREE.Matrix4().makeRotationZ(lz0).multiply(new THREE.Matrix4().makeRotationX(lx0));
  const XF1 = XF0.clone().multiply(new THREE.Matrix4().makeTranslation(0, groundH, 0))
    .multiply(new THREE.Matrix4().makeRotationZ(rr.range(-1, 1) * 0.011 * crook));
  const lift = (w / 2) * Math.abs(lz0) + (d / 2) * Math.abs(lx0) + 0.05;
  const put0 = (mat, ...gs) => { for (const g of gs) if (g) { g.applyMatrix4(XF0); P.add(mat, g); } };
  const put1 = (mat, ...gs) => { for (const g of gs) if (g) { g.applyMatrix4(XF1); P.add(mat, g); } };
  const P0 = { add: (mat, ...gs) => put0(mat, ...gs) };
  const P1 = { add: (mat, ...gs) => put1(mat, ...gs) };

  const arcade = gallery ? 1.5 : 0;             // depth of the covered walk
  const plinthH = 0.36;
  const bodyD = d - arcade;
  const bodyZ = -arcade / 2;
  /* HOLLOW — see the long note in `cottage`.  The hall's ground storey is
   * built by `hollowShell` in world coordinates; the plinth becomes a ring
   * gapped at the doorway, and everything else on this elevation stays. */
  if (!hollow) put0(M.rubble, bx(w + 0.16, plinthH + lift, bodyD + 0.16, 0, (plinthH - lift) / 2, bodyZ));
  if (!hollow) put0(wallMat, bx(w, groundH - plinthH + 0.02, bodyD, 0, plinthH + (groundH - plinthH) / 2, bodyZ));

  const frontZ = bodyD / 2 + bodyZ;
  const doorX = rr.range(-0.12, 0.12) * w;
  const doorW = hollow ? (hollow.doorW ?? 1.55) : 1.15;
  const doorU = hollow ? (hollow.doorU ?? doorX) : doorX;
  const hollowDoor = hollow
    ? { face: 'z+', faceCoord: frontZ, u: doorU, w: doorW, h: 2.1, y0: plinthH * 0.2 }
    : null;
  doorOn(P0, {
    face: 'z+', half: bodyD / 2, centre: bodyZ, u: doorU, y0: plinthH * 0.2, color: door,
    w: doorW, h: 2.1, hood: !gallery, arch: true, leaf: !hollow,
  });
  if (hollow) {
    const band = (hollow.wallT ?? 0.30) + 0.08;
    const oX = w / 2 + 0.08;
    const oZ0 = bodyZ - bodyD / 2 - 0.08;
    const oZ1 = bodyZ + bodyD / 2 + 0.08;
    const py = (plinthH - lift) / 2;
    const ph = plinthH + lift;
    put0(M.rubble, bx(w + 0.16, ph, band, 0, py, oZ0 + band / 2));
    put0(M.rubble, bx(band, ph, bodyD + 0.16 - band * 2, -oX + band / 2, py, bodyZ));
    put0(M.rubble, bx(band, ph, bodyD + 0.16 - band * 2, oX - band / 2, py, bodyZ));
    const g0 = doorU - doorW / 2 - 0.03;
    const g1 = doorU + doorW / 2 + 0.03;
    for (const [a, b] of [[-oX, g0], [g1, oX]]) {
      if (b - a > 0.02) put0(M.rubble, bx(b - a, ph, band, (a + b) / 2, py, oZ1 - band / 2));
    }
  }
  const nWin = Math.max(2, Math.round(w / 3.1));
  let lit = litWindows;
  for (let i = 0; i < nWin; i += 1) {
    const u = (i / (nWin - 1) - 0.5) * (w - 1.8);
    if (Math.abs(u - doorX) < 1.2) continue;
    windowOn(P0, {
      face: 'z+', half: bodyD / 2, centre: bodyZ, u, y: plinthH + 1.32, w: 1.0, h: 1.06, cols: 3,
      shutters: 'none', shutterColor: shutter, lit: lit-- > 0,
    });
  }
  for (const face of ['x+', 'x-']) {
    windowOn(P0, {
      face, half: w / 2, u: bodyZ + rr.range(-0.2, 0.2) * bodyD, y: plinthH + 1.32,
      w: 0.8, h: 1.0, shutters: 'none', shutterColor: shutter,
    });
  }

  /* the arcade: posts, a head beam, and knee braces at every post — three
   * members meeting at ONE joint, which is why the brace is drawn between
   * two points on the frame and never as a length and an angle */
  const postXs = [];
  if (gallery) {
    const n = Math.max(3, Math.round(w / 2.6));
    for (let i = 0; i <= n; i += 1) {
      const px = (i / n - 0.5) * (w - 0.3);
      postXs.push(px);
      put0(M.oak, bx(0.24, groundH, 0.24, px, groundH / 2, d / 2 - 0.2));
      const s = i === 0 ? 1 : i === n ? -1 : (i % 2 ? 1 : -1);
      put0(M.oakDark, tubeGeo([px + s * 0.06, groundH - 0.85, d / 2 - 0.2],
        [px + s * 0.72, groundH - 0.12, d / 2 - 0.2], 0.055, 5));
    }
    put0(M.oakDark, bx(w, 0.24, 0.3, 0, groundH - 0.12, d / 2 - 0.2));
    put0(M.oak, bx(w, 0.1, arcade, 0, groundH + 0.03, d / 2 - arcade / 2));   // the gallery floor
  }

  /* upper storey, jettied over the arcade */
  const upD = d + jetty;
  put1(wallMat, bx(w, upperH, bodyD, 0, upperH / 2, bodyZ));
  const upFrontZ = frontZ;
  for (let i = 0; i < nWin; i += 1) {
    const u = (i / (nWin - 1) - 0.5) * (w - 1.6);
    windowOn(P1, {
      face: 'z+', half: bodyD / 2, centre: bodyZ, u, y: upperH * 0.54, w: 0.86, h: 0.98, cols: 2,
      shutters: rr.chance(0.4) ? 'open' : 'none', shutterColor: shutter, lit: lit-- > 0,
    });
  }
  for (const face of ['x+', 'x-']) {
    windowOn(P1, {
      face, half: w / 2, u: bodyZ + rr.range(-0.2, 0.2) * bodyD,
      y: upperH * 0.54, w: 0.72, h: 0.9, shutters: 'none', shutterColor: shutter,
    });
  }
  /* THE HALL IS SET BACK FROM ITS ARCADE, so `bodyZ` is the centre of every
   * one of its four faces on the z axis and `bodyD / 2` the half-extent —
   * both z faces take the SAME pair, and `facePlane` turns them into +1.30
   * and −2.80 rather than the caller writing either.  It used to write
   * `-bodyZ + bodyD / 2` for the back, which is +2.80: the hall's back frame
   * stood 1.45 m in FRONT of its own front wall, in the arcade, across the
   * door.
   *
   * THE GROUND STOREY'S FRONT IS DRAWN ON PURPOSE and it did not used to be:
   * that misplaced back frame WAS the inn's half-timbered frontage, floating
   * in the covered walk a metre and a half off the wall it belonged to, and
   * putting it back where it goes leaves the hall wall behind the arcade
   * blank.  So the front elevation is framed on its own plane, gapped at the
   * doorway — the arcade posts stand 1.25 m clear in front of it. */
  const zFrames = [['z+', bodyD / 2, w, 0, bodyZ], ['z-', bodyD / 2, w, 0, bodyZ],
    ['x+', w / 2, bodyD, bodyZ, 0], ['x-', w / 2, bodyD, bodyZ, 0]];
  for (const [face, half, span, u, ctr] of zFrames) {
    frameElevation(P1, {
      face, half: half + 0.001, centre: ctr, w: span, u, y0: 0.02, h: upperH - 0.02,
      seed: `${seed}-u-${face}`, proud: 0.055,
    });
  }
  /* the doorway's gap, on the face the door is actually in.  `px` runs the
   * same way as the body's own x on a 'z+' face, so the opening at `+doorU`
   * is at `+doorU` here — no mirroring, which is what the '-' faces needed
   * while the frame on them was drawn on the wrong wall. */
  const doorGap = [[doorU - doorW / 2 - 0.20, doorU + doorW / 2 + 0.20]];
  for (const [face, half, span, u, ctr] of zFrames) {
    frameElevation(P0, {
      face, half: half + 0.001, centre: ctr, w: span, u, y0: plinthH, h: groundH - plinthH,
      seed: `${seed}-l-${face}`, proud: 0.055, gaps: face === 'z+' ? doorGap : [],
    });
  }

  /* the gallery balustrade, and the bay that breaks the long front */
  if (gallery) {
    const balY = 0.06;
    put1(M.oakDark, bx(w, 0.1, 0.14, 0, balY + 0.92, d / 2 - 0.12));
    put1(M.oakDark, bx(w, 0.1, 0.14, 0, balY + 0.1, d / 2 - 0.12));
    const nb = Math.round(w / 0.34);
    for (let i = 0; i <= nb; i += 1) {
      put1(M.oak, cyl(0.035, 0.045, 0.78, (i / nb - 0.5) * (w - 0.1), balY + 0.51, d / 2 - 0.12, { seg: 6 }));
    }
    for (const px of postXs) put1(M.oak, bx(0.2, 1.02, 0.2, px, balY + 0.5, d / 2 - 0.12));
  }
  if (bay) {
    // an oriel over the door: the one place a long front gets a vertical
    const bw = 1.9;
    const bd = 0.55;
    put1(wallMat, bx(bw, upperH * 0.8, bd, doorX, upperH * 0.52, upFrontZ + bd / 2));
    put1(M.oakDark, bx(bw + 0.16, 0.14, bd + 0.16, doorX, upperH * 0.12, upFrontZ + bd / 2));
    for (const s of [-1, 1]) {
      put1(M.oakDark, tubeGeo([doorX + s * 0.7, upperH * 0.06, upFrontZ + bd],
        [doorX + s * 0.7, -0.4, upFrontZ - 0.02], 0.05, 5));
    }
    // the oriel's own front plane: half a bay deeper than the hall's
    windowOn(P1, {
      face: 'z+', half: bodyD / 2 + bd, centre: bodyZ, u: doorX,
      y: upperH * 0.56, w: bw - 0.36, h: 0.94, cols: 4, shutters: 'none', lit: true,
    });
    put1(M.lead, bx(bw + 0.24, 0.09, bd + 0.3, doorX, upperH * 0.92, upFrontZ + bd / 2 + 0.03));
  }

  /* the roof */
  const roofXF = XF1.clone().multiply(new THREE.Matrix4().makeTranslation(0, upperH, bodyZ));
  const rw = ridgeAxis === 'x' ? w : bodyD;
  const rd = ridgeAxis === 'x' ? bodyD : w;
  const nDorm = dormers ?? 2;
  const dormerList = [];
  for (let i = 0; i < nDorm; i += 1) {
    dormerList.push({
      side: 1, u: (i - (nDorm - 1) / 2) * (w / (nDorm + 0.3)), t: 0.5,
      w: 1.55, h: 0.6, lit: i === 0,
    });
  }
  let roofData;
  if (roof === 'thatch') {
    roofData = thatchRoof({
      w: rw, d: rd, pitch: pit, ridgeAxis, seed: `${seed}-thatch`, dormers: dormerList,
      mat: roofMat, pool: P, xf: roofXF, overhang: 0.6, endOver: 0.42, thick: 0.36,
    }).userData;
  } else {
    const rg = shingleRoof({ w: rw, d: rd, pitch: pit, ridgeAxis, mat: roofMat });
    rg.applyMatrix4(roofXF);
    group.add(rg);
    roofData = rg.userData;
  }
  const span = ridgeAxis === 'x' ? rd : rw;
  const along = ridgeAxis === 'x' ? rw : rd;
  const fill = gableFill({ span, along, ridgeY: roofData.ridgeY }, ridgeAxis);
  fill.applyMatrix4(roofXF);
  P.add(wallMat, fill);

  let chimneyTop = null;
  if (withChimney) {
    for (const cs of [-1, 1]) {
      const cx = cs * (w / 2 - 0.4);
      const topY = roofData.ridgeY + 1.1;
      const ch = chimney({ x: cx, z: bodyZ * 0, baseY: -1.2, topY, w: 0.9, d: 0.78, pots: 2 });
      for (const g of ch.stack) { g.applyMatrix4(roofXF); P.add(M.rubble, g); }
      for (const g of ch.pots) { g.applyMatrix4(roofXF); P.add(M.graniteDark, g); }
      if (cs === 1) chimneyTop = new THREE.Vector3(cx, topY + 0.4, 0).applyMatrix4(roofXF).toArray();
    }
  }
  if (accent != null) {
    // one painted band on the bressummer — an accent spent as a BAND, never
    // as a whole wall: an accent the size of a plane is not an accent
    put1(painted(accent), bx(w + 0.04, 0.1, 0.16, 0, -0.24, d / 2 - 0.06));
  }

  P.flush(group);
  /* The hall's own body box, and it goes when the hall is hollow for the
   * reason stated in `cottage`: one collider over the plan seals the very
   * doorway the shell cuts, and nothing renders the failure. */
  const colliders = hollow ? [] : [{ x0: -w / 2 - 0.09, z0: bodyZ - bodyD / 2 - 0.09, x1: w / 2 + 0.09, z1: bodyZ + bodyD / 2 + 0.09 }];
  for (const px of postXs) colliders.push({ x0: px - 0.16, z0: d / 2 - 0.32, x1: px + 0.16, z1: d / 2 - 0.08 });
  group.userData = {
    kind: 'longhouse', w, d, groundH, upperH, gallery, arcade, plinthH, bodyD, bodyZ,
    wallTopY: groundH + upperH, eaveY: groundH + upperH + roofData.eaveY,
    ridgeY: groundH + upperH + roofData.ridgeY,
    frontZ, arcadeZ: d / 2 - arcade / 2, galleryY: groundH + 0.08,
    doorX, doorY: 0, chimneyTop, lean: [lz0, lx0],
    mats: { wall: wallMat, roof: roofMat },
    hollow: hollow ? { ...hollow, door: hollowDoor } : null,
    // NO `footprint`: the arcade is walkable and a box round it seals it.
    colliders,
    /* THE UPPER GALLERY IS A DECK OVER A WALKABLE ARCADE, and `groundAt` here
     * is a plain max over platforms with no from-height — so registering it
     * answers 4.25 m for every square metre UNDER the arcade and the covered
     * walk becomes a plateau the walker cannot step onto and cannot pass.
     * Measured on the inn: ground 1.60 at z 14.8, 4.25 from 15.0 to 16.2,
     * 1.60 again at 16.4.  Nothing renders it and no waypoint was ever put
     * in there.  A gallery with no stair to it buys nothing as a platform,
     * so `galleryDeck: false` gives the arcade back. */
    platforms: gallery && galleryDeck ? [{ x0: -w / 2, z0: d / 2 - arcade, x1: w / 2, z1: d / 2 - 0.06, top: groundH + 0.08 }] : [],
  };
  return group;
}

/* ---- the round tower ---------------------------------------------------- */

/**
 * A lofted tapered shaft with a CURVED lean, as loose geometry. Shared by
 * `roundTower` and `windmill`.
 *
 * The lean is a curve, not a tilt: `offset(t) = lean * t^1.7`, so the tower
 * is plumb where it comes out of the ground and drifts as it climbs, which
 * is what settlement actually does to a stone tower. A tilted cylinder
 * leaves a crescent of daylight at its own footing.
 *
 * Every ring vertex is on the surface of revolution at its own level, so
 * the loft closes exactly however far it leans.
 */
function taperedShaft({ r0, r1, h, y0 = 0, lean = [0, 0], seg = 12, levels = 8, wobble = 0, seed = 'shaft', tile = 1.6 }) {
  const rr = rng(seed);
  const ph = rr.range(0, 6.28);
  const rings = [];
  for (let i = 0; i <= levels; i += 1) {
    const t = i / levels;
    const rad = r0 + (r1 - r0) * t + (wobble ? Math.sin(t * 5.1 + ph) * wobble * r0 : 0);
    const cx = lean[0] * Math.pow(t, 1.7);
    const cz = lean[1] * Math.pow(t, 1.7);
    const y = y0 + h * t;
    const ring = [];
    for (let k = 0; k < seg; k += 1) {
      const a = (k / seg) * TAU;
      ring.push([cx + Math.cos(a) * rad, y, cz + Math.sin(a) * rad]);
    }
    rings.push({ ring, cx, cz, y, rad });
  }
  const uTiles = Math.max(1, Math.round((TAU * r0) / tile));
  const pos = [];
  const uvs = [];
  for (let i = 0; i < levels; i += 1) {
    const A = rings[i];
    const B = rings[i + 1];
    for (let k = 0; k < seg; k += 1) {
      const j = (k + 1) % seg;
      // A WHOLE NUMBER OF TILES ROUND THE SHAFT. Left as a raw
      // circumference/tile ratio the map does not meet itself at the loft's
      // seam, and what shows is one hard vertical line the full height of
      // the tower — which reads as a crack in the render.
      const u0 = (k / seg) * uTiles;
      const u1 = ((k + 1) / seg) * uTiles;
      pushQuadUV(pos, uvs, A.ring[k], A.ring[j], B.ring[j], B.ring[k],
        [u0, A.y / tile], [u1, A.y / tile], [u1, B.y / tile], [u0, B.y / tile],
        [(A.cx + B.cx) / 2, (A.y + B.y) / 2, (A.cz + B.cz) / 2], true);
    }
  }
  return { geo: polyGeometryUV(pos, uvs), rings };
}

/**
 * A STONE OR RENDERED TOWER with a seeded taper and lean and a conical cap.
 * Scales from a 6 m squat gate tower to the 16 m wizards' tower on one set
 * of parameters — which is the point: the town's two most different towers
 * are the same generator, so they read as the same masons' work.
 *
 * `windows` is a list of `{ y, a, w, h, lit, glow }`, `a` being the bearing
 * round the tower in radians measured from +Z (the authored front). A
 * window's surround is placed ON THE SHAFT SURFACE at its own level, so it
 * follows the taper and the lean instead of hanging off a remembered
 * radius.
 *
 * `glow` takes a colour. THE ONLY CALLER THAT SHOULD PASS ONE IS SPELLWARD:
 * the alchemical teal is the town's one cool emissive.
 */
export function roundTower({
  seed = 'tower', r = 1.8, h = 9, taper = 0.14, crook = 1, seg = 12,
  wall = 'granite', wallColor = null, cap = 'cone', capH = null, bands = 2,
  windows = null, door = null, doorColor = JOINERY.oakStain, finial = true,
  corbel = true, machicolation = false, capMat = null, glowColor = null,
} = {}) {
  const rr = rng(seed).fork('shape');
  const group = new THREE.Group();
  const P = parts();
  const wallMat = wallColor != null ? painted(wallColor) : wallMaterial(wall, rng(seed).fork('wall'));
  const rTop = r * (1 - taper);
  /* The lean is a real drift of the axis, in metres at the top, and it has
   * to be BIG ENOUGH TO SEE: the first cut used 0.009 * h * crook, which on
   * the 14.5 m wizards' tower is 0.21 m — inside the taper, and invisible.
   * A crooked tower is crooked by a fortieth of its height per unit of
   * `crook`, so the gate towers (crook 0.4) stay plumb and the alchemists'
   * (crook 1.6) leans most of a metre. */
  const lean = [rr.range(-1, 1) * 0.026 * h * crook, rr.range(-1, 1) * 0.026 * h * crook];

  const shaft = taperedShaft({
    r0: r, r1: rTop, h, lean, seg, levels: Math.max(6, Math.round(h / 1.2)),
    wobble: 0.012 * crook, seed: `${seed}-shaft`,
  });
  P.add(wallMat, shaft.geo);
  // a plinth course, sunk, so the tower comes out of the ground rather than
  // standing on it
  P.add(M.rubble, cyl(r * 1.1, r * 1.06, 0.5, 0, 0.05, 0, { seg }));

  const at = (t) => {
    const i = clamp(Math.round(t * (shaft.rings.length - 1)), 0, shaft.rings.length - 1);
    return shaft.rings[i];
  };

  /* string courses: a ring of stones a shade proud, which is what gives a
   * tall shaft its scale. Built as boxes on the ring so they follow the
   * lean; a torus at a remembered radius would drift off the wall. */
  for (let b = 1; b <= bands; b += 1) {
    const t = b / (bands + 1);
    const R = at(t);
    for (let k = 0; k < seg; k += 1) {
      const a = ((k + 0.5) / seg) * TAU;
      const step = (TAU * R.rad) / seg;
      /* THE LONG AXIS OF A RING SEGMENT IS ITS DEPTH, NOT ITS WIDTH.
       * `bx`'s ry rotates local +x to (cos ry, 0, -sin ry); at ry = -a that
       * is (cos a, 0, sin a) — the RADIAL direction. A course written
       * `bx(step, ...)` therefore comes out as twelve spikes sticking out of
       * the tower like a cartwheel, which is exactly what the first render
       * showed. Local +z maps to (sin ry, 0, cos ry) = (-sin a, 0, cos a),
       * which IS the tangent, so the segment's length goes in `d`. */
      P.add(M.graniteDark, bx(0.1, 0.16, step * 1.08,
        R.cx + Math.cos(a) * (R.rad + 0.04), R.y, R.cz + Math.sin(a) * (R.rad + 0.04), { ry: -a }));
    }
  }

  const winList = windows ?? (() => {
    const out = [];
    const n = Math.max(1, Math.round(h / 3.0));
    for (let i = 0; i < n; i += 1) {
      out.push({ y: 1.5 + (i * (h - 2.6)) / Math.max(n - 1, 1), a: rr.range(-0.5, 0.5) + (i % 2 ? Math.PI * 0.6 : 0), w: 0.42, h: 0.78 });
    }
    return out;
  })();
  for (const win of winList) {
    const t = clamp(win.y / h, 0, 1);
    const R = at(t);
    const a = win.a ?? 0;
    // +Z is the authored front, so a bearing of 0 puts the window on +Z
    const nx = Math.sin(a);
    const nz = Math.cos(a);
    const ww = win.w ?? 0.42;
    const wh = win.h ?? 0.78;
    const ry = Math.atan2(nx, nz);
    const px = R.cx + nx * R.rad;
    const pz = R.cz + nz * R.rad;
    const off = (dd) => [px + nx * dd, win.y, pz + nz * dd];
    const glow = win.glow ?? glowColor;
    const pane = glow != null ? glowing(glow, glow, 0.85) : (win.lit ? M.lit : M.glassDark);
    P.add(pane, bx(ww, wh, 0.04, ...off(0.02), { ry }));
    P.add(M.oakDark, bx(0.035, wh, 0.03, ...off(0.05), { ry }));
    for (let j = 1; j < 3; j += 1) P.add(M.oakDark, bx(ww, 0.03, 0.03, px + nx * 0.05, win.y + (j / 3 - 0.5) * wh, pz + nz * 0.05, { ry }));
    // the dressed surround, proud of the shaft
    for (const s of [-1, 1]) {
      P.add(M.graniteDark, bx(0.13, wh + 0.24, 0.09, px + nx * 0.045 - nz * s * (ww / 2 + 0.06), win.y, pz + nz * 0.045 + nx * s * (ww / 2 + 0.06), { ry }));
    }
    P.add(M.graniteDark, bx(ww + 0.32, 0.12, 0.09, ...off(0.045), { ry }));
    P.add(M.graniteDark, bx(ww + 0.32, 0.12, 0.09, px + nx * 0.045, win.y + wh / 2 + 0.12, pz + nz * 0.045, { ry }));
    P.add(M.graniteDark, bx(ww + 0.34, 0.08, 0.16, px + nx * 0.07, win.y - wh / 2 - 0.08, pz + nz * 0.07, { ry }));
  }

  let doorAt = null;
  if (door !== null) {
    const a = door?.a ?? 0;
    const R = at(0.02);
    const nx = Math.sin(a);
    const nz = Math.cos(a);
    const ry = Math.atan2(nx, nz);
    const dw = door?.w ?? 1.0;
    const dh = door?.h ?? 2.0;
    const px = R.cx + nx * (R.rad - 0.02);
    const pz = R.cz + nz * (R.rad - 0.02);
    P.add(painted(doorColor), bx(dw, dh, 0.06, px + nx * 0.04, dh / 2, pz + nz * 0.04, { ry }));
    for (let i = 1; i < 4; i += 1) {
      P.add(M.ironDark, bx(0.018, dh * 0.92, 0.018,
        px + nx * 0.075 - nz * (i / 4 - 0.5) * dw, dh / 2, pz + nz * 0.075 + nx * (i / 4 - 0.5) * dw, { ry }));
    }
    // a real arch of seven voussoirs over it
    for (let i = 0; i < 7; i += 1) {
      const f = -0.5 + i / 6;
      const ax = f * (dw + 0.3);
      const ay = dh + 0.12 + (0.25 - f * f) * 0.6;
      P.add(M.graniteDark, bx((dw + 0.4) / 7.2, 0.2, 0.1,
        px + nx * 0.05 - nz * ax, ay, pz + nz * 0.05 + nx * ax, { ry, rz: -f * 0.8 }));
    }
    for (const s of [-1, 1]) {
      P.add(M.graniteDark, bx(0.15, dh + 0.1, 0.1,
        px + nx * 0.05 - nz * s * (dw / 2 + 0.08), (dh + 0.1) / 2, pz + nz * 0.05 + nx * s * (dw / 2 + 0.08), { ry }));
    }
    P.add(M.graniteDark, bx(dw + 0.5, 0.12, 0.42, px + nx * 0.2, 0.06, pz + nz * 0.2, { ry }));
    doorAt = [px + nx * 0.3, 0, pz + nz * 0.3];
  }

  /* the cap. `corbel` throws a course out under it, which is what stops a
   * cone on a cylinder reading as a party hat. */
  const top = at(1);
  const ch = capH ?? clamp(r * 1.5, 1.4, 3.4);
  if (corbel) {
    for (let k = 0; k < seg; k += 1) {
      const a = ((k + 0.5) / seg) * TAU;
      const step = (TAU * top.rad) / seg;
      P.add(M.graniteDark, bx(0.24, 0.22, step * 1.1,
        top.cx + Math.cos(a) * (top.rad + 0.09), top.y - 0.11, top.cz + Math.sin(a) * (top.rad + 0.09), { ry: -a }));
    }
  }
  if (machicolation) {
    for (let k = 0; k < seg; k += 1) {
      const a = ((k + 0.5) / seg) * TAU;
      const step = (TAU * top.rad) / seg;
      P.add(M.granite, bx(0.28, 0.55, step * 0.62,
        top.cx + Math.cos(a) * (top.rad + 0.06), top.y + 0.28, top.cz + Math.sin(a) * (top.rad + 0.06), { ry: -a }));
    }
  }
  let capTop = top.y;
  if (cap !== 'none') {
    const crookLean = cap === 'crooked'
      ? [rr.range(-1, 1) * ch * 0.3 * crook, rr.range(-1, 1) * ch * 0.3 * crook]
      : [0, 0];
    const cone = coneCap({
      r: top.rad, h: ch, y0: top.y + (machicolation ? 0.56 : 0.02), lean: crookLean,
      seg, flare: r * 0.16, skirt: 0.14, courses: 3,
    });
    for (const g of cone) { g.translate(top.cx, 0, top.cz); P.add(capMat ?? M.shingleDark, g); }
    capTop = top.y + ch;
    if (finial) {
      const fx = top.cx + crookLean[0];
      const fz = top.cz + crookLean[1];
      P.add(M.iron, cyl(0.035, 0.035, 0.7, fx, capTop + 0.3, fz, { seg: 6 }));
      P.add(M.iron, bx(0.36, 0.03, 0.03, fx, capTop + 0.58, fz));
      P.add(M.iron, bx(0.03, 0.03, 0.36, fx, capTop + 0.58, fz));
      P.add(M.brass, cyl(0.075, 0.075, 0.075, fx, capTop + 0.68, fz, { seg: 7 }));
    }
  }

  P.flush(group);
  group.userData = {
    kind: 'round-tower', r, h, rTop, lean, topY: top.y, capTop, doorAt,
    topCentre: [top.cx, top.y, top.cz],
    footprint: { x0: -r - 0.16, z0: -r - 0.16, x1: r + 0.16, z1: r + 0.16 },
  };
  return group;
}

/* ---- the temple --------------------------------------------------------- */

/**
 * THE TEMPLE on the knoll: a small stone shrine with a porch, a bellcote
 * over the gable and votive niches down its flanks. It is the arrival
 * vista's subject, so its silhouette does the work — the bellcote is what
 * you see from the gate road, and it is deliberately tall and open.
 *
 * `bell` is the bell's colour and it defaults to `M.brass`, NOT to gilt:
 * gilt is templeknoll's owned accent and the district passes it in.
 *
 * `userData.bellPivot` is a live group. Swing it from a district's
 * interaction: `bellPivot.rotation.z = Math.sin(t * 4) * 0.3`.
 */
export function temple({
  seed = 'temple', w = 7, d = 5.6, h = 4.0, wall = 'granite', wallColor = null,
  roof = 'shingle', pitch = 0.66, porch = true, porchD = 2.0, bellcote = true,
  spire = false, niches = 3, bell = null, door = JOINERY.oakStain, litNiches = true,
  ridgeAxis = 'z',
} = {}) {
  const r = rng(seed);
  const rr = r.fork('shape');
  const group = new THREE.Group();
  const P = parts();
  const wallMat = wallColor != null ? painted(wallColor) : wallMaterial(wall, r.fork('wall'));
  const roofMat = roof === 'thatch' ? thatchMaterial(r.fork('roof')) : shingleMaterial(r.fork('roof'));
  const bellMat = bell != null ? painted(bell) : M.brass;

  /* three steps up to the platform: a temple stands ABOVE the ground it is
   * approached over, and the steps are half of why it reads as a temple */
  const platY = 0.42;
  const platforms = [];
  for (let i = 0; i < 3; i += 1) {
    const f = i / 3;
    const ex = 0.62 * (1 - f) + 0.16;
    P.add(M.graniteDark, bx(w + ex * 2, platY / 3 + 0.03, d + porchD + ex * 2, 0, (platY * (i + 0.5)) / 3, (porchD / 2) * 0 - 0));
    platforms.push({ x0: -w / 2 - ex, z0: -(d + porchD) / 2 - ex, x1: w / 2 + ex, z1: (d + porchD) / 2 + ex, top: (platY * (i + 1)) / 3 });
  }

  const bodyZ = -porchD / 2;
  P.add(wallMat, bx(w, h, d, 0, platY + h / 2, bodyZ));
  // pilaster buttresses: a stone box with nothing on it is a stone box
  for (const s of [-1, 1]) {
    for (const t of [-0.28, 0.28]) {
      P.add(M.graniteWarm, bx(0.3, h * 0.86, 0.3, s * (w / 2 - 0.01), platY + h * 0.43, bodyZ + t * d));
    }
  }
  P.add(M.graniteDark, bx(w + 0.24, 0.16, d + 0.24, 0, platY + h - 0.08, bodyZ));   // the cornice

  const frontZ = bodyZ + d / 2;
  doorOn(P, {
    face: 'z+', half: d / 2, centre: bodyZ, u: 0, y0: platY, color: door, w: 1.24, h: 2.3,
    arch: true, step: false, planks: 5,
  });
  for (const s of [-1, 1]) {
    windowOn(P, {
      face: s > 0 ? 'x+' : 'x-', half: w / 2, u: bodyZ - 0.1, y: platY + h * 0.62,
      w: 0.5, h: 1.15, cols: 2, rows: 4, shutters: 'none', dressing: M.graniteDark,
    });
  }

  /* the votive niches: arched recesses down the flanks with a shelf and a
   * candle in each. BUILT OUTWARD — a niche written behind the wall face is
   * inside the render. The reveal is a dark plane ON the wall and the
   * surround stands proud of it, which is what a shallow niche looks like
   * anyway. */
  const niched = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i < niches; i += 1) {
      const u = bodyZ + (i - (niches - 1) / 2) * (d / (niches + 0.3));
      const F = faceFrame(s > 0 ? 'x+' : 'x-', w / 2, u);
      const ny = platY + 1.3;
      P.add(M.graniteDark, bx(0.44, 0.72, 0.03, ...F.at(0, ny, 0.02), { ry: F.yaw }));
      for (const e of [-1, 1]) P.add(M.graniteWarm, bx(0.1, 0.9, 0.13, ...F.at(e * 0.27, ny + 0.03, 0.05), { ry: F.yaw }));
      P.add(M.graniteWarm, bx(0.64, 0.11, 0.15, ...F.at(0, ny + 0.42, 0.06), { ry: F.yaw }));
      P.add(M.graniteWarm, bx(0.7, 0.09, 0.22, ...F.at(0, ny - 0.4, 0.09), { ry: F.yaw }));
      // the candle, and the little flame that makes a niche a votive niche
      P.add(M.paper, cyl(0.035, 0.035, 0.17, ...F.at(0, ny - 0.26, 0.05), { seg: 6 }));
      if (litNiches) {
        P.add(M.lit, cyl(0.022, 0.006, 0.075, ...F.at(0, ny - 0.14, 0.05), { seg: 5 }));
        niched.push(F.at(0, ny - 0.14, 0.05));
      }
    }
  }

  /* the porch: four posts, a beam and a small gable, all standing ON the
   * platform. NO collider across the opening — you walk in under it. */
  const porchPosts = [];
  let porchRoofY = platY + h * 0.72;
  if (porch) {
    const pz = frontZ + porchD / 2;
    const ph = h * 0.72;
    for (const sx of [-1, 1]) {
      for (const sz of [0, 1]) {
        const px = sx * (w / 2 - 0.35);
        const pzz = frontZ + 0.18 + sz * (porchD - 0.42);
        P.add(M.oak, bx(0.24, ph, 0.24, px, platY + ph / 2, pzz));
        porchPosts.push([px, pzz]);
      }
    }
    for (const sx of [-1, 1]) {
      const px = sx * (w / 2 - 0.35);
      P.add(M.oakDark, bx(0.18, 0.2, porchD - 0.18, px, platY + ph - 0.1, pz));
      for (const sz of [-1, 1]) {
        P.add(M.oakDark, tubeGeo([px, platY + ph - 0.85, pz + sz * (porchD / 2 - 0.24)],
          [px, platY + ph - 0.16, pz + sz * (porchD / 2 - 0.8)], 0.05, 5));
      }
    }
    P.add(M.oakDark, bx(w - 0.3, 0.2, 0.2, 0, platY + ph - 0.1, pz + porchD / 2 - 0.2));
    const proof = hipRoof({ w: w - 0.1, d: porchD + 0.5, pitch: 0.5, overhang: 0.3, mat: roofMat, ridgeMat: M.shingleDark });
    proof.position.set(0, platY + ph, pz);
    group.add(proof);
    porchRoofY = platY + ph + proof.userData.ridgeY;
  }

  /* the main roof, gable end to the approach */
  const rw = ridgeAxis === 'x' ? w : d;
  const rd = ridgeAxis === 'x' ? d : w;
  const mroof = roof === 'thatch'
    ? thatchRoof({ w: rw, d: rd, pitch, ridgeAxis, seed: `${seed}-thatch`, mat: roofMat, overhang: 0.5 })
    : shingleRoof({ w: rw, d: rd, pitch, ridgeAxis, mat: roofMat, overhang: 0.42 });
  mroof.position.set(0, platY + h, bodyZ);
  group.add(mroof);
  const span = ridgeAxis === 'x' ? rd : rw;
  const along = ridgeAxis === 'x' ? rw : rd;
  const fill = gableFill({ span, along, ridgeY: mroof.userData.ridgeY }, ridgeAxis);
  fill.translate(0, platY + h, bodyZ);
  P.add(wallMat, fill);

  /* THE BELLCOTE — the silhouette the whole arrival vista points at.
   * Two piers, a lintel, a little gabled cap, and the bell hung on a real
   * axle between the piers with its rope coming down where a hand can
   * reach it. The bell is a solid of revolution, not a box. */
  const bellPivot = new THREE.Group();
  let bellY = null;
  if (bellcote) {
    const bcZ = bodyZ + (ridgeAxis === 'z' ? along / 2 - 0.3 : 0);
    const baseY = platY + h + mroof.userData.ridgeY * (ridgeAxis === 'z' ? 0.86 : 1) - 0.2;
    const bw = 1.5;
    const bh = 1.85;
    P.add(M.graniteWarm, bx(bw + 0.5, 0.3, 0.66, 0, baseY + 0.15, bcZ));
    for (const s of [-1, 1]) P.add(M.graniteWarm, bx(0.34, bh, 0.5, s * bw / 2, baseY + 0.3 + bh / 2, bcZ));
    P.add(M.graniteWarm, bx(bw + 0.6, 0.26, 0.56, 0, baseY + 0.3 + bh + 0.13, bcZ));
    // the little gable over it
    const capR = shingleRoof({ w: bw + 0.8, d: 0.8, pitch: 0.72, overhang: 0.2, thickness: 0.09, mat: M.shingleDark, courses: false });
    capR.position.set(0, baseY + 0.3 + bh + 0.26, bcZ);
    group.add(capR);
    // the axle, then the bell hanging from it
    const axleY = baseY + 0.3 + bh - 0.28;
    P.add(M.ironDark, cyl(0.045, 0.045, bw + 0.3, 0, axleY, bcZ, { seg: 7, rz: Math.PI / 2 }));
    bellPivot.position.set(0, axleY, bcZ);
    const BP = parts();
    BP.add(M.ironDark, bx(0.08, 0.2, 0.08, 0, -0.1, 0));
    // the bell: four rings, mouth widest, with a lip
    const prof = [[0.09, 0.0], [0.17, -0.14], [0.24, -0.32], [0.30, -0.5], [0.33, -0.62]];
    for (let i = 0; i < prof.length - 1; i += 1) {
      BP.add(bellMat, cyl(prof[i][0], prof[i + 1][0], prof[i][1] - prof[i + 1][1],
        0, (prof[i][1] + prof[i + 1][1]) / 2 - 0.2, 0, { seg: 12, open: true }));
    }
    BP.add(bellMat, cyl(0.35, 0.33, 0.06, 0, -0.85, 0, { seg: 12 }));
    BP.add(M.ironDark, cyl(0.02, 0.02, 0.42, 0, -0.66, 0, { seg: 5 }));
    BP.add(M.ironDark, cyl(0.05, 0.05, 0.08, 0, -0.88, 0, { seg: 7 }));
    BP.flush(bellPivot, { receive: false });
    group.add(bellPivot);
    // the rope, hanging down the gable to the porch
    P.add(M.rope, cyl(0.016, 0.016, axleY - 1.05 - (platY + 1.1), 0.24,
      (axleY - 0.88 + platY + 1.1) / 2, bcZ + 0.06, { seg: 5 }));
    P.add(M.oak, cyl(0.035, 0.035, 0.3, 0.24, platY + 1.15, bcZ + 0.06, { seg: 6 }));
    bellY = axleY;
  }
  if (spire) {
    const cone = coneCap({ r: 0.55, h: 2.4, y0: platY + h + mroof.userData.ridgeY, seg: 8, flare: 0.1, courses: 2 });
    for (const g of cone) P.add(M.shingleDark, g);
  }

  P.flush(group);
  const colliders = [{ x0: -w / 2 - 0.08, z0: bodyZ - d / 2 - 0.08, x1: w / 2 + 0.08, z1: bodyZ + d / 2 + 0.08 }];
  for (const [px, pz] of porchPosts) colliders.push({ x0: px - 0.16, z0: pz - 0.16, x1: px + 0.16, z1: pz + 0.16 });
  group.userData = {
    kind: 'temple', w, d, h, platY, bodyZ, frontZ,
    eaveY: platY + h + mroof.userData.eaveY, ridgeY: platY + h + mroof.userData.ridgeY,
    porchRoofY, bellPivot, bellY, votives: niched,
    ropeAt: [0.24, platY + 1.3, bodyZ + (ridgeAxis === 'z' ? along / 2 - 0.24 : 0.06)],
    colliders, platforms,
  };
  return group;
}

/* ---- the windmill ------------------------------------------------------- */

/**
 * THE TOWER MILL, and the one moving landmark in Thistledown.
 *
 * THE SAILS ARE BUILT AS TWO CROSSED STOCKS, NOT AS FOUR ARMS ON A HUB.
 * That is the whole reason the cross cannot be off-centre: a stock is ONE
 * member passing through the hub, so its two arms are the same piece of
 * timber and are exactly opposite by construction. Four arms attached to a
 * hub is four chances to be a centimetre out, and a sail cross that is a
 * centimetre out wobbles visibly the moment it turns.
 *
 * The rig, outward: cap (yawed to the wind) -> windshaft group (tilted, its
 * +Z along the shaft) -> sail group (rotating about its own local Z). The
 * sails therefore turn about the windshaft's true axis whatever the cap is
 * yawed to, and `rotation.z` on the sail group is the only animated number.
 *
 * Pass `ctx` and it registers the updater itself. Without one, step it by
 * hand with `userData.spin(dt)` — which is what the showcase does before
 * taking a frame, since nothing animates in a headless page.
 */
export function windmill({
  seed = 'mill', r = 3.0, h = 8.6, taper = 0.26, seg = 14, crook = 0.3,
  wall = 'granite', wallColor = null, capH = 2.1, sailLen = 6.4, sails = 4,
  speed = 0.15, gallery = true, galleryT = 0.44, tailpole = true,
  windDir = -0.5, cloth = null, door = JOINERY.oakStain, ctx = null, litWindows = 1,
} = {}) {
  const rr = rng(seed).fork('shape');
  const group = new THREE.Group();
  const P = parts();
  const wallMat = wallColor != null ? painted(wallColor) : wallMaterial(wall, rng(seed).fork('wall'));
  const clothMat = cloth != null ? painted(cloth) : M.canvas;
  const rTop = r * (1 - taper);

  const shaft = taperedShaft({
    r0: r, r1: rTop, h, lean: [rr.range(-1, 1) * 0.1 * crook, rr.range(-1, 1) * 0.1 * crook],
    seg, levels: Math.max(7, Math.round(h / 1.1)), seed: `${seed}-shaft`, tile: 1.8,
  });
  P.add(wallMat, shaft.geo);
  P.add(M.rubble, cyl(r * 1.08, r * 1.04, 0.55, 0, 0.06, 0, { seg }));
  const top = shaft.rings[shaft.rings.length - 1];

  const at = (t) => shaft.rings[clamp(Math.round(t * (shaft.rings.length - 1)), 0, shaft.rings.length - 1)];

  /* the gallery: the stage a miller walks round to reef the sails. It is
   * carried on brackets off the tower, which is what a real one is, and it
   * is what stops a tapered cylinder reading as a chimney. */
  let galleryY = null;
  if (gallery) {
    const G = at(galleryT);
    const gr = G.rad + 1.05;
    galleryY = G.y;
    for (let k = 0; k < seg * 2; k += 1) {
      const a = (k / (seg * 2)) * TAU;
      P.add(M.oakDark, tubeGeo([G.cx + Math.cos(a) * (G.rad - 0.05), G.y - 1.05, G.cz + Math.sin(a) * (G.rad - 0.05)],
        [G.cx + Math.cos(a) * gr, G.y - 0.06, G.cz + Math.sin(a) * gr], 0.06, 5));
    }
    for (let k = 0; k < seg * 2; k += 1) {
      const a = ((k + 0.5) / (seg * 2)) * TAU;
      const step = (TAU * ((gr + G.rad) / 2)) / (seg * 2);
      P.add(M.oak, bx(gr - G.rad + 0.1, 0.09, step * 1.12,
        G.cx + Math.cos(a) * ((gr + G.rad) / 2), G.y, G.cz + Math.sin(a) * ((gr + G.rad) / 2), { ry: -a }));
    }
    for (let k = 0; k < seg * 2; k += 1) {
      const a = (k / (seg * 2)) * TAU;
      P.add(M.oak, bx(0.07, 0.92, 0.07, G.cx + Math.cos(a) * gr, G.y + 0.46, G.cz + Math.sin(a) * gr));
    }
    for (const hy of [0.5, 0.88]) {
      for (let k = 0; k < seg * 2; k += 1) {
        const a0 = (k / (seg * 2)) * TAU;
        const a1 = ((k + 1) / (seg * 2)) * TAU;
        P.add(M.oakDark, tubeGeo([G.cx + Math.cos(a0) * gr, G.y + hy, G.cz + Math.sin(a0) * gr],
          [G.cx + Math.cos(a1) * gr, G.y + hy, G.cz + Math.sin(a1) * gr], 0.026, 4));
      }
    }
  }

  // door, and two small windows up the shaft
  {
    const R = at(0.02);
    const dw = 1.05;
    const dh = 2.05;
    P.add(painted(door), bx(dw, dh, 0.06, R.cx, dh / 2, R.cz + R.rad + 0.02));
    for (let i = 1; i < 4; i += 1) P.add(M.ironDark, bx(0.018, dh * 0.9, 0.018, R.cx + (i / 4 - 0.5) * dw, dh / 2, R.cz + R.rad + 0.055));
    for (const s of [-1, 1]) P.add(M.graniteDark, bx(0.15, dh + 0.2, 0.1, R.cx + s * (dw / 2 + 0.08), (dh + 0.2) / 2, R.cz + R.rad + 0.03));
    P.add(M.graniteDark, bx(dw + 0.46, 0.16, 0.11, R.cx, dh + 0.18, R.cz + R.rad + 0.03));
    P.add(M.graniteDark, bx(dw + 0.5, 0.12, 0.42, R.cx, 0.06, R.cz + R.rad + 0.2));
  }
  for (const [t, a] of [[0.3, 2.2], [0.66, -1.6], [0.82, 0.5]]) {
    const R = at(t);
    const nx = Math.sin(a);
    const nz = Math.cos(a);
    const ry = Math.atan2(nx, nz);
    const px = R.cx + nx * R.rad;
    const pz = R.cz + nz * R.rad;
    P.add(litWindows-- > 0 ? M.lit : M.glassDark, bx(0.44, 0.6, 0.04, px + nx * 0.03, R.y, pz + nz * 0.03, { ry }));
    P.add(M.oakDark, bx(0.55, 0.09, 0.09, px + nx * 0.05, R.y + 0.35, pz + nz * 0.05, { ry }));
    P.add(M.graniteDark, bx(0.6, 0.08, 0.14, px + nx * 0.06, R.y - 0.34, pz + nz * 0.06, { ry }));
  }

  /* ---- the cap ----------------------------------------------------------
   * A boat-shaped cap: rings that shrink and roll over, lofted. It carries
   * everything above it, so it is its own group and everything is measured
   * from IT rather than from a remembered tower height. */
  const cap = new THREE.Group();
  cap.position.set(top.cx, top.y, top.cz);
  cap.rotation.y = windDir;
  const CP = parts();
  const capR = rTop + 0.12;
  const capRings = [];
  const LV = 6;
  for (let i = 0; i <= LV; i += 1) {
    const t = i / LV;
    const rad = capR * Math.sqrt(Math.max(0.0001, 1 - t * t * 0.94));
    const ring = [];
    for (let k = 0; k < seg; k += 1) {
      const a = (k / seg) * TAU;
      // the boat shape: longer along the shaft than across it
      ring.push([Math.cos(a) * rad * 0.92, t * capH, Math.sin(a) * rad * 1.1]);
    }
    capRings.push(ring);
  }
  {
    const pos = [];
    const uvs = [];
    for (let i = 0; i < LV; i += 1) {
      for (let k = 0; k < seg; k += 1) {
        const j = (k + 1) % seg;
        pushQuadUV(pos, uvs, capRings[i][k], capRings[i][j], capRings[i + 1][j], capRings[i + 1][k],
          [k / seg * 4, i / LV * 2], [(k + 1) / seg * 4, i / LV * 2], [(k + 1) / seg * 4, (i + 1) / LV * 2], [k / seg * 4, (i + 1) / LV * 2],
          [0, (i + 0.5) * capH / LV, 0], true);
      }
    }
    CP.add(M.shingleDark, polyGeometryUV(pos, uvs));
  }
  CP.add(M.oakDark, cyl(capR * 1.06, capR * 1.02, 0.2, 0, 0.02, 0, { seg }));   // the curb
  // the neck bearing and the windshaft: a tapered timber out the front
  const tilt = 0.14;                       // the windshaft rakes UP at the tail
  const shaftGroup = new THREE.Group();
  shaftGroup.position.set(0, capH * 0.52, 0);
  shaftGroup.rotation.x = tilt;            // +z is the shaft's outward axis
  const SG = parts();
  SG.add(M.oakDark, cyl(0.19, 0.26, capR * 2.1, 0, 0, capR * 0.5, { seg: 8, rx: Math.PI / 2 }));
  SG.add(M.iron, cyl(0.3, 0.3, 0.16, 0, 0, capR * 1.35, { seg: 10, rx: Math.PI / 2 }));

  /* THE SAIL CROSS. Two stocks, each ONE member through the hub. */
  const sailGroup = new THREE.Group();
  sailGroup.position.set(0, 0, capR * 1.5);
  const SL = parts();
  const L = sailLen;
  const nStock = Math.max(1, Math.round(sails / 2));
  SL.add(M.iron, cyl(0.26, 0.26, 0.34, 0, 0, 0, { seg: 10, rx: Math.PI / 2 }));
  for (let s = 0; s < nStock; s += 1) {
    const a = (s / nStock) * Math.PI;
    // ONE member, 2L long, through the centre, laid in the sail plane at
    // angle `a`: its two arms are the same timber and cannot disagree
    SL.add(M.oak, bx(2 * L, 0.19, 0.15, 0, 0, (s - (nStock - 1) / 2) * 0.16, { rz: a }));
  }
  for (let k = 0; k < sails; k += 1) {
    const a = (k / sails) * TAU;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const zoff = (Math.floor(k / 2) - (nStock - 1) / 2) * 0.16;
    const side = k % 2 === 0 ? 1 : 1;   // cloth always on the same side of the whip
    // the leading-edge board and the bars: everything measured along the arm
    const barLen = L * 0.19;
    const t0 = 0.2 * L;
    const nBars = 10;
    /* THE CLOTH GOES BEHIND THE LATTICE AND STOPS SHORT OF THE TIP. Written
     * the other way round — cloth proud of the bars, running the full length
     * — a sail is a plain pale rectangle on a stick, which is what the first
     * render showed. A mill's sail reads because you can see the frame
     * THROUGH and over the canvas, and because the outer bays are bare where
     * the miller has reefed it. */
    const cloth0 = t0 + 0.1;
    const cloth1 = L - L * 0.22;
    SL.add(clothMat, bx(cloth1 - cloth0, barLen * 0.9, 0.025,
      ca * ((cloth0 + cloth1) / 2) - sa * (barLen * 0.52) * side,
      sa * ((cloth0 + cloth1) / 2) + ca * (barLen * 0.52) * side, zoff + 0.1, { rz: a }));
    for (let b = 0; b <= nBars; b += 1) {
      const t = t0 + ((L - 0.15 - t0) * b) / nBars;
      const bx0 = ca * t - sa * (barLen / 2) * side;
      const by0 = sa * t + ca * (barLen / 2) * side;
      SL.add(M.oakDark, bx(barLen, 0.05, 0.045, bx0, by0, zoff + 0.135, { rz: a + Math.PI / 2 }));
    }
    // the whip's outer rail, parallel to the stock at the bars' far ends
    SL.add(M.oakDark, bx(L - t0, 0.055, 0.045,
      ca * ((t0 + L) / 2) - sa * barLen * side, sa * ((t0 + L) / 2) + ca * barLen * side, zoff + 0.135, { rz: a }));
    // and a mid-rail, so the lattice is a lattice and not a comb
    SL.add(M.oakDark, bx(L - t0, 0.045, 0.04,
      ca * ((t0 + L) / 2) - sa * (barLen * 0.5) * side, sa * ((t0 + L) / 2) + ca * (barLen * 0.5) * side, zoff + 0.135, { rz: a }));
  }
  SL.flush(sailGroup, { receive: false });
  shaftGroup.add(sailGroup);
  SG.flush(shaftGroup, { receive: false });
  cap.add(shaftGroup);

  /* the tailpole: the beam the miller pushes to turn the cap into the
   * wind, raked down to a wheel that runs on a track round the tower */
  if (tailpole) {
    const tl = r * 2.6;
    const footY = -top.y + 0.55;
    CP.add(M.oak, tubeGeo([0, capH * 0.34, -capR * 0.7], [0, footY, -tl], 0.11, 6));
    for (const s of [-1, 1]) {
      CP.add(M.oakDark, tubeGeo([s * capR * 0.55, capH * 0.2, -capR * 0.5], [0, footY + 0.9, -tl * 0.7], 0.055, 5));
    }
    CP.add(M.iron, cyl(0.3, 0.3, 0.12, 0, footY + 0.24, -tl, { seg: 10, rz: Math.PI / 2 }));
    CP.add(M.oakDark, bx(0.7, 0.1, 0.1, 0, footY + 0.62, -tl));
  }
  CP.flush(cap);
  group.add(cap);

  const spin = (dt) => { sailGroup.rotation.z += speed * dt; };
  if (ctx && ctx.update) ctx.update(spin);

  P.flush(group);
  group.userData = {
    kind: 'windmill', r, h, rTop, topY: top.y, capH, galleryY, sailLen: L,
    sailGroup, cap, spin, speed,
    hubAt: [top.cx, top.y + capH * 0.52 + Math.sin(tilt) * capR * 1.5, top.cz + Math.cos(windDir) * capR * 1.5],
    doorAt: [0, 0, r + 0.3],
    footprint: { x0: -r - 0.14, z0: -r - 0.14, x1: r + 0.14, z1: r + 0.14 },
  };
  return group;
}
