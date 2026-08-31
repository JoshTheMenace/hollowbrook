import * as THREE from 'three';
import { rgbToHsv, linToSrgb, shortHue } from './celify.js';

// Screen-space accent census: rasterizes the character's triangles with
// their EFFECTIVE albedo (material color × vertex colors, sRGB) from four
// orthographic views and reports pixel-weighted saturation statistics.
// Pure JS, deterministic, headless — no GL, so it is gate-safe (B2 review
// r1: a census that counts materials lets 15 hair meshes outshout a scarf).

export function pixelCensus(root, { res = 220, satThreshold = 0.56, ownedAccent = null } = {}) {
  root.updateMatrixWorld(true);
  // gather world-space triangles with per-vertex effective sRGB color
  const tris = [];
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  root.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline) return;
    const g = o.geometry;
    const pos = g.attributes.position;
    const col = o.material.vertexColors ? g.attributes.color : null;
    const base = o.material.color ? o.material.color.getHexString() : 'ffffff';
    const bc = [0, 2, 4].map((i) => parseInt(base.slice(i, i + 2), 16) / 255);
    const idx = g.index ? g.index.array : null;
    const n = idx ? idx.length : pos.count;
    for (let t = 0; t < n; t += 3) {
      const p = [];
      let r = 0, gg = 0, b = 0;
      for (let k = 0; k < 3; k++) {
        const i = idx ? idx[t + k] : t + k;
        v[k].fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        p.push(v[k].x, v[k].y, v[k].z);
        if (col) { r += linToSrgb(col.getX(i)); gg += linToSrgb(col.getY(i)); b += linToSrgb(col.getZ(i)); }
        else { r += 1; gg += 1; b += 1; }
      }
      tris.push({ p, name: o.name || '(unnamed)', c: rgbToHsv(bc[0] * r / 3, bc[1] * gg / 3, bc[2] * b / 3) });
    }
  });
  // bounds
  const bb = new THREE.Box3().setFromObject(root);
  const size = bb.getSize(new THREE.Vector3());
  const ctr = bb.getCenter(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z) * 1.05;

  // four orthographic views around Y: axes (right, up=Y, depth)
  const views = [0, Math.PI / 2, Math.PI, -Math.PI / 2].map((a) => ({ rx: Math.cos(a), rz: -Math.sin(a), dx: Math.sin(a), dz: Math.cos(a) }));
  const pixels = [];       // { h, s, v, name }
  const depth = new Float32Array(res * res);
  const pix = new Int32Array(res * res);
  for (const view of views) {
    depth.fill(-Infinity); pix.fill(-1);
    for (let ti = 0; ti < tris.length; ti++) {
      const { p } = tris[ti];
      const xs = [], ys = [], zs = [];
      for (let k = 0; k < 3; k++) {
        const wx = p[k * 3] - ctr.x, wy = p[k * 3 + 1] - ctr.y, wz = p[k * 3 + 2] - ctr.z;
        xs.push(((wx * view.rx + wz * view.rz) / span + 0.5) * res);
        ys.push((wy / span + 0.5) * res);
        zs.push(wx * view.dx + wz * view.dz);
      }
      const minX = Math.max(0, Math.floor(Math.min(...xs))), maxX = Math.min(res - 1, Math.ceil(Math.max(...xs)));
      const minY = Math.max(0, Math.floor(Math.min(...ys))), maxY = Math.min(res - 1, Math.ceil(Math.max(...ys)));
      const d = (xs[1] - xs[0]) * (ys[2] - ys[0]) - (xs[2] - xs[0]) * (ys[1] - ys[0]);
      if (Math.abs(d) < 1e-9) continue;
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const w0 = ((xs[1] - x) * (ys[2] - y) - (xs[2] - x) * (ys[1] - y)) / d;
        const w1 = ((xs[2] - x) * (ys[0] - y) - (xs[0] - x) * (ys[2] - y)) / d;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * zs[0] + w1 * zs[1] + w2 * zs[2];
        const at = y * res + x;
        if (z > depth[at]) { depth[at] = z; pix[at] = ti; }
      }
    }
    for (let i = 0; i < pix.length; i++) if (pix[i] >= 0) pixels.push(tris[pix[i]]);
  }

  // statistics
  const sats = pixels.map((t) => t.c.s).sort((a, b) => a - b);
  const q = (f) => sats[Math.min(sats.length - 1, Math.floor(f * sats.length))] ?? 0;
  const inOwned = (h) => ownedAccent && Math.abs(shortHue(h - ownedAccent.hue)) < (ownedAccent.tol ?? 0.05);
  const over = new Map();  // hue bucket -> { share, names }
  let ownedShare = 0;
  for (const t of pixels) {
    if (t.c.s <= satThreshold) continue;
    if (inOwned(t.c.h)) { ownedShare += 1; continue; }
    const bucket = Math.round(t.c.h * 24) / 24;
    if (!over.has(bucket)) over.set(bucket, { n: 0, names: new Set() });
    const e = over.get(bucket);
    e.n += 1; e.names.add(t.name);
  }
  const total = pixels.length || 1;
  const overBands = [...over.entries()]
    .map(([hue, e]) => ({ hue: Math.round(hue * 360), share: e.n / total, names: [...e.names].slice(0, 4) }))
    .filter((b) => b.share > 0.002)
    .sort((a, b) => b.share - a.share);
  const nonAccentSats = pixels.filter((t) => !inOwned(t.c.h)).map((t) => t.c.s).sort((a, b) => a - b);
  const qa = (f) => nonAccentSats[Math.min(nonAccentSats.length - 1, Math.floor(f * nonAccentSats.length))] ?? 0;
  return {
    pixels: pixels.length,
    satP50: q(0.5), satP90: q(0.9),
    nonAccentP90: qa(0.9),
    ownedShare: ownedShare / total,
    overBands,          // hue bands louder than the world, pixel-weighted, named
  };
}
