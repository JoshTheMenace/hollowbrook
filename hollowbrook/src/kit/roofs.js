import * as THREE from 'three';
import { gableRoof, shedRoof } from '../builders.js';
import { bx, cyl, tubeGeo, parts, mergeParts, rng, pushQuad, pushQuadUV, polyGeometry, polyGeometryUV } from './util.js';
import { M } from './mats.js';

/* ------------------------------------------------------------------ *
 * ROOFS — and in Thistledown the roof IS the town.
 *
 * `gableRoof` and `shedRoof` come straight from the architecture kit in
 * builders.js and are re-exported so a district has ONE import. Everything
 * else here is built to the same rule and it is the rule that matters:
 * EVERY PART IS DERIVED FROM THE RIDGE LINE AND THE EAVE LINE, and nothing
 * is placed by eye.
 *
 * All of them share one contract. THE ORIGIN IS THE CENTRE OF THE WALL
 * TOP: put the returned group at (cx, wallTopY, cz) and the surfaces cross
 * y = 0 exactly at the wall line, so the wall's top edge sits embedded in
 * the roof. No gap at the eaves, no poke-through at the ridge. Read
 * `userData.ridgeY` / `eaveY` off the result; never re-derive them.
 *
 * ------------------------------------------------------------------
 * THATCH — the new roof type, and the thing this kit exists to get right.
 * ------------------------------------------------------------------
 *
 * A thatched roof is NOT a gable roof in a straw colour. Four things make
 * it, and a builder that leaves out any one of them ships a brown gable:
 *
 *  1. IT IS THICK. Three hundred and forty millimetres of straw, and you
 *     see that thickness at every edge. A 0.12 m plane does not.
 *  2. THE EAVE IS A ROLL, not a cut edge. The outer surface curves round
 *     the eave and back UNDER to the soffit — which is why a thatched
 *     cottage has a soft dark shadow all along its eaves instead of a line.
 *  3. IT UNDULATES. The rafters under it are straight; the straw over them
 *     is not. `thatchRoof` puts the undulation in the THICKNESS, per
 *     station along the ridge, so the ridge and eave lines waver by a few
 *     centimetres while THE WALL LINE IS UNTOUCHED — the roof still meets
 *     the wall exactly, which a wobbled ridge line would break.
 *  4. IT IS COMBED. The straw runs down the pitch in bundles. Those lines
 *     are not silhouettes and not creases, so the ink pass cannot draw
 *     them: they live in `surface.js`'s `thatchTex`, and the loft below
 *     carries the UVs that put them the right way up. A lofted surface has
 *     no UVs of its own, and a missing uv attribute is filled with zeros —
 *     one texel, stretched over a whole roof, which renders as flat colour
 *     with nothing anywhere reporting a problem.
 *
 * On top of that: a ROLLED RIDGE with liggers and spars pegging it down
 * (the one piece of visible craft on a cottage) and EYEBROW DORMERS, which
 * are the single most recognisable thing a thatched roof does and are why
 * this is a lofted solid rather than two boxes.
 *
 * WINDING. `cel()` is single-sided, and a hand-wound face that comes out
 * backwards renders as a hole with no error anywhere. The thatch section is
 * a boomerang and is NOT star-shaped about any single point, so a global
 * reference point flips a third of its faces. Every ring vertex therefore
 * carries its own INWARD point — the midpoint of the outer/soffit pair, or
 * the eave roll's own centre — and each quad is wound against that.
 * ------------------------------------------------------------------ */

export { gableRoof, shedRoof };

/** The band a thatch pitch may sit in, in radians (45-55 degrees). Thatch
 *  is STEEP — it sheds water by pitch alone — and a shallow thatch reads as
 *  a hayrick. Seed inside this; do not leave it without a reason. */
export const THATCH_PITCH = Object.freeze({ min: 0.80, max: 0.96 });

/** Shingle sits shallower, 30-40 degrees. */
export const SHINGLE_PITCH = Object.freeze({ min: 0.52, max: 0.70 });

/* ---- thatch ------------------------------------------------------------- */

/**
 * A deep straw thatch over a `w` x `d` wall footprint.
 *
 * Origin: the CENTRE OF THE WALL TOP. Returns a group with
 * `userData = { ridgeY, eaveY, rise, slopeLen, thick, kind: 'thatch' }`.
 *
 * @param {object} o
 * @param {number} o.w  footprint width (x)
 * @param {number} o.d  footprint depth (z)
 * @param {number} [o.pitch]     radians; seed inside THATCH_PITCH
 * @param {number} [o.overhang]  eave overhang past the wall, ACROSS the ridge
 * @param {number} [o.endOver]   overhang past the gable ends, ALONG the ridge
 * @param {number} [o.thick]     thatch depth at the eave (0.30-0.40 reads)
 * @param {number} [o.soffit]    how far the soffit sits inside the rafter line
 * @param {'x'|'z'} [o.ridgeAxis]
 * @param {string|number} [o.seed]  drives the undulation
 * @param {number} [o.wobble]    thickness undulation, 0 for a new thatch
 * @param {Array} [o.dormers]    `[{ side: 1|-1, u, t, w, h, lit }]` eyebrows;
 *                               `u` is along the ridge from centre, `t` the
 *                               fraction from ridge (0) to eave (1)
 * @param {THREE.Material} [o.mat] face tone (see `thatchMaterial(r)`)
 */
export function thatchRoof({
  w, d, pitch = 0.88, overhang = 0.55, endOver = 0.4, thick = 0.34, soffit = 0.07,
  ridgeAxis = 'x', seed = 'thatch', wobble = 0.075, dormers = [], ridge = true,
  mat = M.thatch, ridgeMat = M.thatchRidge, sparMat = M.oakDark, deepMat = M.thatchDeep,
  glassMat = null, stations, pool = null, xf = null,
}) {
  const along = ridgeAxis === 'x' ? w : d;   // footprint length ALONG the ridge
  const span = ridgeAxis === 'x' ? d : w;    // footprint length ACROSS it
  const halfSpan = span / 2 + overhang;
  const rise = Math.tan(pitch) * halfSpan;
  const slopeLen = Math.hypot(halfSpan, rise);
  const slope = Math.atan2(rise, halfSpan);
  const ridgeY = Math.tan(pitch) * (span / 2);   // wall line crosses y = 0
  const eaveY = ridgeY - rise;
  const A = along + 2 * endOver;                 // total length along the ridge
  const cosS = Math.cos(slope);
  const sinS = Math.sin(slope);

  const r = rng(seed);
  const ph1 = r.range(0, 6.28);
  const ph2 = r.range(0, 6.28);
  /* THE UNDULATION IS IN THE THICKNESS, not in the ridge height. A wobbled
   * ridge line moves the wall crossing and opens a gap between the roof and
   * the gable wall; a wobbled thickness moves only the outer surface, which
   * is exactly what a thatcher's handfuls of straw actually do. */
  const tTopAt = (a) => thick * (1 + wobble * (Math.sin(a * 0.9 + ph1) * 0.6 + Math.sin(a * 2.1 + ph2) * 0.4));

  const N = 5;                                          // steps down each pitch
  const K = 5;                                          // ridge arc steps
  const NOSE = 5;                                       // eave roll steps
  const nStations = Math.max(4, stations ?? Math.round(A / 1.1) + 1);

  // In the section frame: `v` is across the ridge, `y` is up.
  // side s: down-slope d_s = (s*cos, -sin); outward normal n_s = (s*sin, cos)
  const ring = (a) => {
    const tTop = tTopAt(a);
    const tBot = soffit;
    const O = [];       // outer chain, left eave -> ridge -> right eave
    const I = [];       // soffit chain, paired one for one with O
    const push = (v, y) => O.push([v, y]);
    // left pitch, eave -> ridge
    for (let i = 0; i <= N; i += 1) {
      const t = 1 - i / N;
      push(-1 * (t * slopeLen * cosS) + -1 * sinS * tTop, ridgeY - t * slopeLen * sinS + cosS * tTop);
    }
    // ridge arc: joins the two top surfaces over the top
    const rr = sinS * tTop;
    const cy = ridgeY + cosS * tTop;
    for (let k = 1; k < K; k += 1) {
      const ang = Math.PI - (k / K) * Math.PI;     // pi (left) -> 0 (right)
      push(Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
    }
    // right pitch, ridge -> eave
    for (let i = 0; i <= N; i += 1) {
      const t = i / N;
      push(t * slopeLen * cosS + sinS * tTop, ridgeY - t * slopeLen * sinS + cosS * tTop);
    }
    // the soffit is the rafter line offset INWARD by tBot: two straight runs
    // meeting at an apex below the ridge at ridgeY - tBot/cos(slope)
    const apex = [0, ridgeY - tBot / cosS];
    const IL = [-(halfSpan) - -sinS * tBot, eaveY - cosS * tBot];
    const IR = [halfSpan + -sinS * tBot, eaveY - cosS * tBot];
    const Mn = O.length;
    for (let i = 0; i < Mn; i += 1) {
      const f = i / (Mn - 1);
      const [p, q] = f < 0.5
        ? [IL, apex] : [apex, IR];
      const g = f < 0.5 ? f * 2 : (f - 0.5) * 2;
      I.push([p[0] + (q[0] - p[0]) * g, p[1] + (q[1] - p[1]) * g]);
    }
    // the two eave rolls, as arcs about their own centres
    const noseAt = (s) => {
      const nz = s * sinS;
      const ny = cosS;
      const ev = s * halfSpan;
      const C = [ev + nz * (tTop - tBot) / 2, eaveY + ny * (tTop - tBot) / 2];
      const rn = (tTop + tBot) / 2;
      const dz = s * cosS;
      const dy = -sinS;
      const pts = [];
      for (let k = 1; k < NOSE; k += 1) {
        const ang = (k / NOSE) * Math.PI;
        pts.push([C[0] + Math.cos(ang) * nz * rn + Math.sin(ang) * dz * rn,
                  C[1] + Math.cos(ang) * ny * rn + Math.sin(ang) * dy * rn]);
      }
      return { C, pts };
    };
    return { O, I, left: noseAt(-1), right: noseAt(1), tTop };
  };

  /* Ring index -> the point INSIDE the thatch nearest it, for winding. See
   * the note at the head of this file: the section is a boomerang and a
   * single global reference flips a third of its faces. */
  const buildRing = (a) => {
    const R = ring(a);
    const pts = [];
    const inw = [];
    const uvv = [];   // v texture coordinate: 0 at the ridge, 1 at the eave
    const Mn = R.O.length;
    const vAt = (i) => Math.abs(i / (Mn - 1) - 0.5) * 2;
    for (let i = 0; i < Mn; i += 1) {
      pts.push(R.O[i]);
      inw.push([(R.O[i][0] + R.I[i][0]) / 2, (R.O[i][1] + R.I[i][1]) / 2]);
      uvv.push(vAt(i));
    }
    for (const p of R.right.pts) { pts.push(p); inw.push(R.right.C); uvv.push(1); }
    for (let i = Mn - 1; i >= 0; i -= 1) {
      pts.push(R.I[i]);
      inw.push([(R.O[i][0] + R.I[i][0]) / 2, (R.O[i][1] + R.I[i][1]) / 2]);
      uvv.push(vAt(i));
    }
    for (let i = R.left.pts.length - 1; i >= 0; i -= 1) { pts.push(R.left.pts[i]); inw.push(R.left.C); uvv.push(1); }
    return { pts, inw, uvv, R };
  };

  const rings = [];
  for (let j = 0; j < nStations; j += 1) {
    const a = -A / 2 + (A * j) / (nStations - 1);
    rings.push({ a, ...buildRing(a) });
  }

  // section (v, y) at along-coordinate a  ->  local 3D, before the yaw
  const P3 = (a, p) => [a, p[1], p[0]];
  const TILE_U = 2.6;   // metres of ridge per texture tile
  const pos = [];
  const uvs = [];
  for (let j = 0; j < rings.length - 1; j += 1) {
    const R0 = rings[j];
    const R1 = rings[j + 1];
    const u0 = R0.a / TILE_U;
    const u1 = R1.a / TILE_U;
    const n = R0.pts.length;
    for (let i = 0; i < n; i += 1) {
      const k = (i + 1) % n;
      pushQuadUV(pos, uvs,
        P3(R0.a, R0.pts[i]), P3(R0.a, R0.pts[k]), P3(R1.a, R1.pts[k]), P3(R1.a, R1.pts[i]),
        [u0, R0.uvv[i]], [u0, R0.uvv[k]], [u1, R1.uvv[k]], [u1, R1.uvv[i]],
        P3((R0.a + R1.a) / 2, R0.inw[i]), true);
    }
  }
  /* THE GABLE-END CAP IS THE THATCH'S BEST FEATURE. It is where the 340 mm
   * is actually seen, and it is what makes a thatched gable read as a
   * cushion rather than as a card. Strip between the outer chain and the
   * soffit, plus a fan round each eave roll. */
  const capRef = [0, (ridgeY + eaveY) / 2, 0];
  for (const end of [0, rings.length - 1]) {
    const R = rings[end];
    const Mn = R.R.O.length;
    const u = R.a / TILE_U;
    for (let i = 0; i < Mn - 1; i += 1) {
      pushQuadUV(pos, uvs,
        P3(R.a, R.R.O[i]), P3(R.a, R.R.O[i + 1]), P3(R.a, R.R.I[i + 1]), P3(R.a, R.R.I[i]),
        [u, R.uvv[i]], [u, R.uvv[i + 1]], [u + 0.16, R.uvv[i + 1]], [u + 0.16, R.uvv[i]],
        capRef, true);
    }
    for (const [nose, endO, endI] of [[R.R.right, R.R.O[Mn - 1], R.R.I[Mn - 1]], [R.R.left, R.R.O[0], R.R.I[0]]]) {
      const chain = [endO, ...nose.pts, endI];
      for (let i = 0; i < chain.length - 1; i += 1) {
        pushQuadUV(pos, uvs,
          P3(R.a, nose.C), P3(R.a, chain[i]), P3(R.a, chain[i + 1]), P3(R.a, chain[i + 1]),
          [u, 0.9], [u, 1], [u + 0.1, 1], [u + 0.1, 1], capRef, true);
      }
    }
  }

  const group = new THREE.Group();
  /* POOLING ACROSS THE BUILDING. A roof handed a caller's `parts()` collector
   * merges into the BUILDING's material pool instead of making four more
   * meshes of its own — which at forty buildings is a hundred and sixty
   * draw calls. `xf` is the caller's own frame (a cottage's upper storey
   * leans, and the roof leans with it): it is applied to the GEOMETRY, so
   * the joints stay exact and nothing has a transform to lose. */
  const P = pool ?? parts();
  const yawM = ridgeAxis === 'z' ? new THREE.Matrix4().makeRotationY(Math.PI / 2) : null;
  const full = xf && yawM ? xf.clone().multiply(yawM) : (xf ?? yawM);
  const put = (material, ...gs) => {
    for (const g of gs) {
      if (!g) continue;
      if (full) g.applyMatrix4(full);
      P.add(material, g);
    }
  };
  put(mat, polyGeometryUV(pos, uvs));

  /* ---- the eyebrow dormers ----------------------------------------------
   * A bump lofted out of the roof's own surface frame, so it cannot float
   * over the thatch or sink into it: the section at j = 0 stands ON the top
   * surface and every section after it is measured from the same frame. */
  for (const dm of dormers) {
    const s = dm.side >= 0 ? 1 : -1;
    const t0 = dm.t ?? 0.55;
    const dw = dm.w ?? 1.5;
    const dh = dm.h ?? 0.5;
    const a0 = dm.u ?? 0;
    const tTop = tTopAt(a0);
    // the frame on the roof's top surface at (a0, t0)
    const Ov = s * (t0 * slopeLen * cosS) + s * sinS * tTop;
    const Oy = ridgeY - t0 * slopeLen * sinS + cosS * tTop;
    const Dv = s * cosS;
    const Dy = -sinS;                    // down-slope, in (v, y)
    const Nv = s * sinS;
    const Ny = cosS;                     // outward normal, in (v, y)
    const Ld = dw * 0.85;                // how far up-slope the bump reaches
    const KK = 9;
    /* THE STATIONS RUN FROM IN FRONT OF THE WINDOW TO BEHIND IT. The first
     * cut started them AT the window and lofted up-slope only, so the
     * thatch was entirely BEHIND the glass and the dormer rendered as a
     * dark half-disc stuck flat on the pitch with a bar under it. An
     * eyebrow dormer is a roll of straw that comes DOWN OVER the opening
     * and back up behind it — the front lip is the whole feature, and the
     * window lives in the shade under it.
     *
     * `f` is the fraction of `Ld` UP-slope; negative is down-slope, in
     * front of the window. `w` and `h` are the section's half-width and
     * height as fractions of the widest one, which is at f = 0. */
    const PROFILE = [
      [-0.30, 0.78, 0.70],   // the front lip, curling down over the mouth
      [-0.14, 0.94, 0.93],
      [0.00, 1.00, 1.00],    // the widest section
      [0.30, 0.92, 0.88],
      [0.62, 0.70, 0.60],
      [1.00, 0.16, 0.02],    // where it dies back into the pitch
    ];
    const sectionAt = (f, wf, hf) => {
      const hw = (dw / 2) * wf;
      const hh = dh * hf;
      const bv = Ov - Dv * (Ld * f);
      const by = Oy - Dy * (Ld * f);
      const sec = [];
      for (let k = 0; k <= KK; k += 1) {
        const ang = -Math.PI / 2 + (k / KK) * Math.PI;
        sec.push([a0 + Math.sin(ang) * hw, by + Ny * (Math.cos(ang) * hh), bv + Nv * (Math.cos(ang) * hh)]);
      }
      return { sec, ref: [a0, by - Ny * 0.3, bv - Nv * 0.3] };
    };
    const secs = PROFILE.map(([f, wf, hf]) => sectionAt(f, wf, hf));
    const dp = [];
    const du = [];
    for (let j = 0; j < secs.length - 1; j += 1) {
      for (let k = 0; k < KK; k += 1) {
        const uu = (j / (secs.length - 1)) * 0.55;
        const uu2 = ((j + 1) / (secs.length - 1)) * 0.55;
        pushQuadUV(dp, du,
          secs[j].sec[k], secs[j].sec[k + 1], secs[j + 1].sec[k + 1], secs[j + 1].sec[k],
          [k / KK, uu], [(k + 1) / KK, uu], [(k + 1) / KK, uu2], [k / KK, uu2],
          secs[j].ref, true);
      }
    }
    /* the mouth: the annulus between the front lip's arch and the window's,
     * which is the thatch's own visible thickness round the opening. It is
     * what makes the window read as being UNDER something. */
    const win = sectionAt(-0.02, 0.72, 0.70);
    for (let k = 0; k < KK; k += 1) {
      pushQuadUV(dp, du,
        secs[0].sec[k], secs[0].sec[k + 1], win.sec[k + 1], win.sec[k],
        [k / KK, 0.62], [(k + 1) / KK, 0.62], [(k + 1) / KK, 0.78], [k / KK, 0.78],
        [a0, (secs[0].sec[k][1] + win.sec[k][1]) / 2 - Ny * 0.35,
          (secs[0].sec[k][2] + win.sec[k][2]) / 2 - Nv * 0.35], true);
    }
    put(mat, polyGeometryUV(dp, du));
    // the window itself: a fan filling the arch, facing DOWN-SLOPE out of
    // the mouth, with the thatch's front lip overhanging it
    const face = [];
    const base = win.sec;
    const cx = a0;
    const cyv = Ov - Dv * (Ld * -0.02);
    const cyy = Oy - Dy * (Ld * -0.02);
    for (let k = 0; k < base.length - 1; k += 1) {
      pushQuad(face, [cx, cyy, cyv], base[k], base[k + 1], base[k + 1],
        [cx, cyy - Ny * 0.4, cyv - Nv * 0.4], true);
    }
    put(glassMat ?? (dm.lit ? M.lit : M.glassDark), polyGeometry(face));
    // two glazing bars across it, or the window is a hole
    for (const bf of [0.34, 0.64]) {
      put(sparMat, bx(dw * 0.62 * (1 - Math.abs(bf - 0.5)), 0.028, 0.03,
        a0, cyy + Ny * dh * 0.7 * bf + 0.01, cyv + Nv * dh * 0.7 * bf + 0.01));
    }
    put(sparMat, bx(0.03, dh * 0.62, 0.03, a0, cyy + Ny * dh * 0.34, cyv + Nv * dh * 0.34));
    // the sill board a dormer is always finished with, at the mouth's foot
    put(sparMat, bx(dw * 0.78, 0.05, 0.16, a0, cyy - 0.01, cyv + Dv * 0.02));
  }

  /* ---- the rolled ridge, the liggers and the spars -----------------------
   * The one piece of visible craft on a cottage: a roll of sedge over the
   * apex, held down by two runs of split hazel with short spars pegged
   * across them in a zigzag. It is thirty small boxes and it is what makes
   * the skyline of this town read as thatch from sixty metres. */
  if (ridge) {
    const rollR = thick * 0.44;
    const rollY = ridgeY + cosS * thick + rollR * 0.35;
    put(ridgeMat, cyl(rollR, rollR, A, 0, rollY, 0, { seg: 9, rz: Math.PI / 2 }));
    // A point ON THE TOP SURFACE at slope fraction t, side s: the liggers and
    // the spars are all derived from this, so nothing lies off the thatch.
    const topAt = (s, t) => [
      s * (t * slopeLen * cosS) + s * sinS * (thick + 0.02),
      ridgeY - t * slopeLen * sinS + cosS * (thick + 0.02),
    ];
    const nS = Math.max(5, Math.round(A / 0.42));
    for (const s of [-1, 1]) {
      const up = topAt(s, 0.055);
      const lo = topAt(s, 0.155);
      // the two split-hazel liggers, laid along the ridge on the thatch
      for (const [v, y] of [up, lo]) {
        put(sparMat, cyl(0.019, 0.019, A, 0, y, v, { seg: 5, rz: Math.PI / 2 }));
      }
      // the spars: short rods pegged BETWEEN the two liggers in a zigzag,
      // each one a member drawn between two real joints on the frame
      for (let i = 0; i < nS; i += 1) {
        const a = -A / 2 + (A * (i + 0.5)) / nS;
        const lean = (i % 2 ? 1 : -1) * (A / nS) * 0.5;
        put(sparMat, tubeGeo([a - lean, up[1], up[0]], [a + lean, lo[1], lo[0]], 0.016, 4));
      }
      // the block cut: the scalloped edge a thatcher trims along the ridge
      for (let i = 0; i < nS; i += 1) {
        const a = -A / 2 + (A * (i + 0.5)) / nS;
        put(ridgeMat, bx((A / nS) * 0.6, 0.075, 0.09, a, rollY - rollR * 0.78, s * rollR * 0.86));
      }
    }
  }
  /* The shadow line a 340 mm overhang throws under itself. It is tucked well
   * inside the eave roll on purpose: outboard of the soffit it stops being a
   * shadow and becomes a dark bar hanging off the roof. */
  for (const s of [-1, 1]) {
    const iv = s * (halfSpan - 0.22) - s * sinS * soffit;
    const iy = ridgeY - (1 - 0.22 / slopeLen) * rise - cosS * soffit + 0.012;
    put(deepMat, bx(A, 0.05, 0.13, 0, iy, iv));
  }

  if (!pool) P.flush(group, { cast: true, receive: true });
  group.userData = { kind: 'thatch', ridgeY, eaveY, rise, slopeLen, thick, ridgeAxis, halfSpan };
  return group;
}

/* ---- shingle ------------------------------------------------------------ */

/**
 * Mossy oak shingle over a gable: `gableRoof` plus the two things a shingle
 * roof has that a plane does not — the COURSES (a stepped shadow line every
 * 0.3 m down the pitch, which is what tells you the roof is made of small
 * pieces) and a boarded ridge. Four meshes at most, and it pools with the
 * building it sits on.
 *
 * Same origin and same `userData` as `gableRoof`.
 */
export function shingleRoof({
  w, d, pitch = 0.6, overhang = 0.34, thickness = 0.11, ridgeAxis = 'x',
  courses = true, spacing = 0.34, mat = M.shingle, ridgeMat = M.shingleDark, trimMat = M.oakDark,
}) {
  const group = gableRoof({ w, d, pitch, overhang, thickness, ridgeAxis, mat, ridgeMat, trimMat });
  if (!courses) return group;
  const along = ridgeAxis === 'x' ? w : d;
  const span = ridgeAxis === 'x' ? d : w;
  const halfSpan = span / 2 + overhang;
  const rise = Math.tan(pitch) * halfSpan;
  const slopeLen = Math.hypot(halfSpan, rise);
  const slope = Math.atan2(rise, halfSpan);
  const ridgeY = Math.tan(pitch) * (span / 2);
  const eaveY = ridgeY - rise;
  const ridgeLen = along + 2 * overhang;
  const n = Math.max(2, Math.round(slopeLen / spacing));
  const geo = [];
  for (const s of [-1, 1]) {
    const nz = s * Math.sin(slope);
    const ny = Math.cos(slope);
    for (let i = 1; i <= n; i += 1) {
      // a course lies ON the plane's top surface at fraction f down the slope
      const f = i / n;
      const cy = ridgeY - f * rise + ny * (thickness / 2 + 0.012);
      const cz = s * f * halfSpan + nz * (thickness / 2 + 0.012);
      geo.push(bx(ridgeLen, 0.026, 0.055, 0, cy, cz, { rx: s * slope }));
    }
    // the eave course: doubled, and a shade proud, which is how a shingle
    // roof is actually started and what stops the eave reading as a card
    geo.push(bx(ridgeLen, 0.05, 0.09, 0,
      eaveY + ny * (thickness / 2 + 0.02), s * halfSpan + nz * (thickness / 2 + 0.02), { rx: s * slope }));
  }
  if (ridgeAxis === 'z') {
    const m = new THREE.Matrix4().makeRotationY(Math.PI / 2);
    for (const g of geo) g.applyMatrix4(m);
  }
  const mesh = mergeParts(geo, mat, { name: 'pool-courses' });
  if (mesh) group.add(mesh);
  return group;
}

/* ---- hip ---------------------------------------------------------------- */

/**
 * A hipped roof over a `w` x `d` footprint: four pitches, eaves all round at
 * one height, no gable ends. ONE CLOSED SOLID rather than four planes,
 * because four planes meeting on two hip lines is exactly the joint that
 * opens a hairline at the corners. Degenerates to a pyramid when w == d,
 * which is what a porch cap and a well hood want.
 */
export function hipRoof({ w, d, pitch, overhang = 0.34, thickness = 0.12, capW = 0.16, mat = M.shingle, ridgeMat = M.shingleDark }) {
  const span = Math.min(w, d);
  const halfSpan = span / 2 + overhang;
  const rise = Math.tan(pitch) * halfSpan;
  const ridgeY = Math.tan(pitch) * (span / 2);
  const eaveY = ridgeY - rise;
  const W2 = w / 2 + overhang;
  const D2 = d / 2 + overhang;
  const alongX = w >= d;
  const ridgeLen = Math.max(capW, Math.abs(w - d));
  const RX = alongX ? ridgeLen / 2 : capW / 2;
  const RZ = alongX ? capW / 2 : ridgeLen / 2;
  const skirtY = eaveY - thickness;
  const ref = [0, (skirtY + ridgeY) / 2, 0];

  const ring = (hx, hz, y) => [[-hx, y, -hz], [hx, y, -hz], [hx, y, hz], [-hx, y, hz]];
  const eave = ring(W2, D2, eaveY);
  const skirt = ring(W2, D2, skirtY);
  const ridge = ring(RX, RZ, ridgeY);

  const pos = [];
  const uvs = [];
  const uv = (p) => [Math.hypot(p[0], p[2]) / 1.4, p[1] / 1.4];
  const q = (a, b, c, dd) => pushQuadUV(pos, uvs, a, b, c, dd, uv(a), uv(b), uv(c), uv(dd), ref, true);
  for (let i = 0; i < 4; i += 1) {
    const j = (i + 1) % 4;
    q(eave[i], eave[j], ridge[j], ridge[i]);
    q(skirt[i], skirt[j], eave[j], eave[i]);
  }
  q(skirt[0], skirt[1], skirt[2], skirt[3]);
  q(ridge[0], ridge[1], ridge[2], ridge[3]);

  const group = new THREE.Group();
  const mesh = new THREE.Mesh(polyGeometryUV(pos, uvs), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  if (ridgeMat && ridgeLen > capW * 1.5) {
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(alongX ? ridgeLen : capW * 1.6, thickness * 0.8, alongX ? capW * 1.6 : ridgeLen),
      ridgeMat,
    );
    cap.position.y = ridgeY + thickness * 0.3;
    cap.castShadow = true;
    group.add(cap);
  }
  group.userData = { ridgeY, eaveY, rise, ridgeLen, ridgeAxis: alongX ? 'x' : 'z' };
  return group;
}

/* ---- conical caps ------------------------------------------------------- */

/**
 * A tower's cap: a cone lofted from a base ring to an APEX THAT MAY BE
 * OFFSET, which is what makes it crooked. Returned as loose geometry in the
 * caller's frame so it pools with the tower's own materials.
 *
 * The crook is a real offset of the apex, not a rotation — a rotated cone
 * lifts off its own wall on one side, and the tell is a crescent of daylight
 * under the eave. Every base vertex stays exactly on the ring.
 *
 * @param {{r:number, h:number, y0:number, lean?:[number,number], seg?:number,
 *   flare?:number, skirt?:number, courses?:number}} o
 * @returns {THREE.BufferGeometry[]}
 */
export function coneCap({ r = 1.6, h = 2.4, y0 = 0, lean = [0, 0], seg = 12, flare = 0.28, skirt = 0.16, courses = 3 }) {
  const apex = [lean[0], y0 + h, lean[1]];
  const base = [];
  const out = [];
  const uvs = [];
  const pos = [];
  for (let i = 0; i < seg; i += 1) {
    const a = (i / seg) * Math.PI * 2;
    base.push([Math.cos(a) * (r + flare), y0, Math.sin(a) * (r + flare)]);
  }
  const under = base.map((p) => [p[0] * 1.0, y0 - skirt, p[2] * 1.0]);
  const ref = [lean[0] * 0.4, y0 + h * 0.4, lean[1] * 0.4];
  for (let i = 0; i < seg; i += 1) {
    const j = (i + 1) % seg;
    const u0 = i / seg * (2 * Math.PI * r) / 1.4;
    const u1 = (i + 1) / seg * (2 * Math.PI * r) / 1.4;
    // the pitch: base ring to the (possibly offset) apex
    pushQuadUV(pos, uvs, base[i], base[j], apex, apex,
      [u0, 0], [u1, 0], [(u0 + u1) / 2, h / 1.4], [(u0 + u1) / 2, h / 1.4], ref, true);
    // the eave fascia and the soffit, so the cap is a closed solid
    pushQuadUV(pos, uvs, under[i], under[j], base[j], base[i],
      [u0, -0.1], [u1, -0.1], [u1, 0], [u0, 0], ref, true);
    pushQuadUV(pos, uvs, under[i], under[j], [0, y0 - skirt, 0], [0, y0 - skirt, 0],
      [u0, -0.2], [u1, -0.2], [0, 0], [0, 0], ref, true);
  }
  out.push(polyGeometryUV(pos, uvs));
  // shingle courses round the cone: rings of thin boxes, each on the cone's
  // own surface at its own radius, so they narrow as they climb
  for (let c = 1; c <= courses; c += 1) {
    const f = c / (courses + 1);
    const rr = (r + flare) * (1 - f);
    const yy = y0 + h * f;
    const cx = lean[0] * f;
    const cz = lean[1] * f;
    for (let i = 0; i < seg; i += 1) {
      const a = ((i + 0.5) / seg) * Math.PI * 2;
      const step = (2 * Math.PI * rr) / seg;
      // length TANGENTIAL: at ry = -a local +z is the tangent and local +x
      // the radius, so a course written the other way round is a starburst
      out.push(bx(0.05, 0.03, step * 1.06,
        cx + Math.cos(a) * rr, yy, cz + Math.sin(a) * rr, { ry: -a }));
    }
  }
  return out;
}

/* ---- gable fill, chimneys ----------------------------------------------- */

/**
 * The triangular wall that fills a gable end, as loose geometry to merge
 * into the building's wall pool. ONE prism spanning the whole ridge length
 * closes both ends at once and costs eight triangles.
 *
 * Built 20 mm inside the roof planes on purpose: a prism whose slope faces
 * are exactly coplanar with the roof's mid-surfaces is a coin toss the
 * renderer will lose somewhere, and the tell is a flickering triangle of
 * wall colour on a roof.
 */
export function gableFill({ span, along, ridgeY, inset = 0.02 }, ridgeAxis = 'x') {
  const hs = span / 2 - inset * 1.2;
  const ha = along / 2;
  const apex = ridgeY - inset;
  const ref = [0, apex / 3, 0];
  const pt = (u, y, v) => (ridgeAxis === 'x' ? [v, y, u] : [u, y, v]);
  const A = [pt(-hs, 0, -ha), pt(hs, 0, -ha), pt(0, apex, -ha)];
  const B = [pt(-hs, 0, ha), pt(hs, 0, ha), pt(0, apex, ha)];
  const pos = [];
  pushQuad(pos, A[0], A[1], A[2], A[2], ref, true);
  pushQuad(pos, B[0], B[1], B[2], B[2], ref, true);
  pushQuad(pos, A[0], A[2], B[2], B[0], ref, true);
  pushQuad(pos, A[1], A[2], B[2], B[1], ref, true);
  pushQuad(pos, A[0], A[1], B[1], B[0], ref, true);
  return polyGeometry(pos);
}

/**
 * A stone chimney stack. Thistledown's are rubble, battered (wider at the
 * bottom), and they lean with the house they are built into.
 *
 * `baseY` should be at or below the wall top so the stack is EMBEDDED in the
 * roof rather than balanced on it — a chimney that starts at the ridge line
 * shows daylight under it from the street. Returns `{ stack, pots }` for two
 * material pools.
 */
export function chimney({ x = 0, z = 0, baseY = 0, topY = 3, w = 0.72, d = 0.62, batter = 0.12, pots = 1, potR = 0.11 }) {
  const h = topY - baseY;
  const stack = [];
  const steps = 3;
  for (let i = 0; i < steps; i += 1) {
    const f0 = i / steps;
    const f1 = (i + 1) / steps;
    const ww = w + batter * (1 - (f0 + f1) / 2);
    const dd = d + batter * (1 - (f0 + f1) / 2);
    stack.push(bx(ww, h / steps + 0.02, dd, x, baseY + h * (f0 + f1) / 2, z));
  }
  stack.push(bx(w + 0.2, 0.12, d + 0.2, x, topY + 0.06, z));   // the oversailing cap
  const potGeo = [];
  for (let i = 0; i < pots; i += 1) {
    const off = pots === 1 ? 0 : (i - (pots - 1) / 2) * (w * 0.5);
    potGeo.push(cyl(potR * 0.86, potR, 0.34, x + off, topY + 0.29, z, { seg: 8 }));
  }
  return { stack, pots: potGeo };
}
