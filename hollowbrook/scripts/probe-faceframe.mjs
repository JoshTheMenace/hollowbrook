#!/usr/bin/env node
/**
 * FACE-DRESSING PROBE.
 *
 * A helper that dresses the four faces of a box can only be verified one way:
 * count, per elevation, how many vertices of each dressing material stand
 * PROUD of that elevation's own wall plane. A per-face sign written by hand is
 * wrong on the faces nobody renders, and it renders perfectly either way — the
 * frame is simply somewhere else.
 *
 * Expected reading, for every building type and every one of the four
 * elevations: a NON-ZERO, ROUGHLY EQUAL count of `timberFrame` vertices proud
 * of it. Zero on one face and double on the opposite one is the sign bug.
 *
 *   node scripts/probe-faceframe.mjs
 *
 * `crook: 0` throughout: the lean is a matrix on the geometry and it moves a
 * wall top by up to 6 cm, which is more than the 5 cm the frame stands proud.
 * The sign question is asked of a plumb building or it is not asked at all.
 */

const noop = () => stubContext;
const stubContext = new Proxy({}, {
  get: (t, prop) => {
    if (prop === 'canvas') return stubCanvas;
    if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
      return () => ({ addColorStop: () => {} });
    }
    if (prop === 'measureText') return () => ({ width: 1 });
    if (prop === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    return noop;
  },
  set: () => true,
});
const stubCanvas = new Proxy({ width: 2, height: 2 }, {
  get: (t, prop) => (prop === 'getContext' ? () => stubContext : (prop in t ? t[prop] : noop)),
  set: (t, prop, v) => ((t[prop] = v), true),
});
globalThis.document = { createElement: () => stubCanvas, createElementNS: () => stubCanvas };
globalThis.window = globalThis;
globalThis.self = globalThis;

const THREE = await import('three');
const { cottage, longhouse, temple } = await import('../src/kit/buildings.js');
const { M } = await import('../src/kit/mats.js');

const NAME = new Map();
for (const [k, v] of Object.entries(M)) if (v && !NAME.has(v)) NAME.set(v, k);

const EPS = 0.005;

/**
 * @param {THREE.Group} g      a built (un-placed) building
 * @param {object} box         { x0, x1, z0, z1 } the wall planes in local space
 */
function probe(g, box, only = 'timberFrame') {
  g.updateMatrixWorld(true);
  const faces = {
    'z+ (front)': (p) => p.z - box.z1,
    'z- (back)': (p) => box.z0 - p.z,
    'x+ (east)': (p) => p.x - box.x1,
    'x- (west)': (p) => box.x0 - p.x,
  };
  const out = {};
  for (const k of Object.keys(faces)) out[k] = 0;
  const p = new THREE.Vector3();
  g.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (!mats.some((m) => NAME.get(m) === only)) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      for (const [k, f] of Object.entries(faces)) if (f(p) > EPS) out[k] += 1;
    }
  });
  return out;
}

/**
 * DOES A FRAME MEMBER STAND IN A WINDOW?
 *
 * The pane sits 2–22 mm proud and a frame member spans −25 to +125 mm, so any
 * member whose elevation footprint overlaps a pane is genuinely through it.
 * Everything here is pooled per material, but every box `bx()` emits is 24
 * consecutive vertices, so the pool can be walked back into boxes and their
 * AABBs tested pairwise. Counted per elevation, because the whole point is
 * that the faces nobody rendered must not now be worse than the ones they did.
 */
function clashes(g, box) {
  g.updateMatrixWorld(true);
  const boxes = (only) => {
    const out = [];
    const p = new THREE.Vector3();
    g.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (!mats.some((m) => NAME.get(m) === only)) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i + 24 <= pos.count; i += 24) {
        const b = new THREE.Box3();
        for (let k = 0; k < 24; k += 1) b.expandByPoint(p.fromBufferAttribute(pos, i + k).applyMatrix4(o.matrixWorld));
        out.push(b);
      }
    });
    return out;
  };
  const panes = boxes('glassDark');
  const frame = boxes('timberFrame');
  const side = (b) => {
    const c = b.getCenter(new THREE.Vector3());
    if (c.z > box.z1 - 0.2) return 'z+';
    if (c.z < box.z0 + 0.2) return 'z-';
    return c.x > 0 ? 'x+' : 'x-';
  };
  /* A member 10 cm wide landing on a pane's own EDGE overlaps it by a
   * centimetre or two and is hidden behind the window's own 7 cm jamb; a
   * member standing across the glass is 60 mm or more into it. Report the
   * worst bite rather than a count, and only count a real one. */
  const out = { 'z+': 0, 'z-': 0, 'x+': 0, 'x-': 0 };
  let worst = 0;
  const pad = new THREE.Vector3(-0.015, -0.015, -0.015);
  for (const q of panes) {
    const a = q.clone().expandByVector(pad);
    for (const f of frame) {
      const b = f.clone().expandByVector(pad);
      if (!a.intersectsBox(b)) continue;
      const i = a.clone().intersect(b);
      const s = i.getSize(new THREE.Vector3());
      const bite = Math.min(Math.max(s.x, s.z), s.y);   // the smaller in-plane span
      worst = Math.max(worst, bite);
      if (bite > 0.05) { out[side(q)] += 1; break; }
    }
  }
  out.worst = +worst.toFixed(3);
  return out;
}

const cases = [];

{
  const w = 5.2;
  const d = 4.4;
  const g = cottage({ seed: 'probe-c1', w, d, storeys: 1, crook: 0, frame: true, jetty: 0 });
  cases.push(['cottage 1-storey  5.2x4.4', g, { x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2 }]);
}
{
  const w = 5.6;
  const d = 4.8;
  const g = cottage({ seed: 'probe-c2', w, d, storeys: 2, crook: 0, frame: true, jetty: 0 });
  cases.push(['cottage 2-storey  5.6x4.8', g, { x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2 }]);
}
{
  // the smithy's shape: a granite front with a wide trade opening
  const w = 6.4;
  const d = 5.0;
  const g = cottage({
    seed: 'probe-smithy', w, d, storeys: 1, crook: 0, frame: true, jetty: 0,
    wall: 'limewash', hollow: { doorW: 1.5, doorH: 2.05, wallT: 0.28 },
  });
  cases.push(['cottage HOLLOW    6.4x5.0', g, { x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2 }]);
}
{
  // a lowrow terrace cottage: narrow, two storeys, jettied
  const w = 4.2;
  const d = 4.6;
  const g = cottage({ seed: 'probe-lowrow', w, d, storeys: 2, crook: 0, frame: true, jetty: 0.26 });
  cases.push(['cottage jettied   4.2x4.6', g, { x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2 }]);
}
{
  const w = 12.6;
  const d = 7.4;
  const arcade = 1.5;
  const bodyD = d - arcade;
  const bodyZ = -arcade / 2;
  const g = longhouse({ seed: 'probe-inn', w, d, crook: 0, gallery: true });
  cases.push(['longhouse (inn)  12.6x7.4', g,
    { x0: -w / 2, x1: w / 2, z0: bodyZ - bodyD / 2, z1: bodyZ + bodyD / 2 }]);
}
{
  const w = 12.0;
  const d = 7.0;
  const g = longhouse({ seed: 'probe-guild', w, d, crook: 0, gallery: false });
  cases.push(['longhouse (guild)12.0x7.0', g,
    { x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2 }]);
}

/* A face is dressed if it carries at least a QUARTER of what the busiest face
 * carries. "> 0" is not the test: the gable collar and the corner pilasters are
 * symmetric members that straddle both ends, so a completely undressed
 * elevation still reads a dozen or two vertices proud of it. */
const dressed = (r) => {
  const vals = Object.values(r);
  const max = Math.max(...vals);
  return vals.every((v) => v >= max * 0.25);
};

let bad = 0;
for (const [label, g, box] of cases) {
  const r = probe(g, box);
  const ok = dressed(r);
  if (!ok) bad += 1;
  const { worst, ...per } = clashes(g, box);
  const nCl = Object.values(per).reduce((a, b) => a + b, 0);
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}  ` +
    Object.entries(r).map(([k, v]) => `${k}=${String(v).padStart(4)}`).join('  ') +
    `   studs in a pane: ${nCl} (worst bite ${worst} m)`);
}

// the temple dresses only its x faces (votive niches, graniteWarm surrounds)
{
  const w = 5.4;
  const g = temple({ seed: 'probe-temple', w, d: 7.2, niches: 3 });
  const r = probe(g, { x0: -w / 2, x1: w / 2, z0: -99, z1: 99 }, 'graniteWarm');
  const m = Math.max(r['x+ (east)'], r['x- (west)']);
  const ok = r['x+ (east)'] >= m * 0.25 && r['x- (west)'] >= m * 0.25;
  if (!ok) bad += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} temple niches (graniteWarm)  ` +
    `x+ (east)=${r['x+ (east)']}  x- (west)=${r['x- (west)']}`);
}

console.log(bad ? `\n${bad} building type(s) with a face that carries no dressing.` : '\nall faces dressed.');
process.exit(bad ? 1 : 0);
