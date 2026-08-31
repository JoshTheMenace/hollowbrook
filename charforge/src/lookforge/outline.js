import * as THREE from 'three';

// Inverted-hull toon outlines. Each mesh gets a backface shell pushed along
// SMOOTHED normals — our kit geometry is flat-shaded (split vertices per
// facet), and pushing along face normals cracks the hull at every edge, so we
// bake a position-averaged normal into a second attribute first.

const shellMats = new Map();
function shellMaterial(color, thickness) {
  const key = `${color}|${thickness}`;
  if (!shellMats.has(key)) {
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { color: { value: new THREE.Color(color) }, thickness: { value: thickness } },
      vertexShader: /* glsl */ `
        attribute vec3 outlineNormal;
        uniform float thickness;
        void main() {
          // world-space scale so hulls stay even when parts are scaled
          float sc = length(vec3(modelMatrix[0].x, modelMatrix[0].y, modelMatrix[0].z));
          vec3 p = position + outlineNormal * (thickness / max(sc, 0.0001));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 color;
        void main() { gl_FragColor = vec4(color, 1.0); }`,
    });
    shellMats.set(key, m);
  }
  return shellMats.get(key);
}

const smoothedCache = new WeakMap();
function ensureOutlineNormals(geo) {
  if (geo.getAttribute('outlineNormal')) return;
  if (smoothedCache.has(geo)) { geo.setAttribute('outlineNormal', smoothedCache.get(geo)); return; }
  const pos = geo.getAttribute('position');
  const nrm = geo.getAttribute('normal');
  const acc = new Map(); // rounded position -> summed normal
  const key = (i) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    const a = acc.get(k) || [0, 0, 0];
    a[0] += nrm.getX(i); a[1] += nrm.getY(i); a[2] += nrm.getZ(i);
    acc.set(k, a);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const a = acc.get(key(i));
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    out[i * 3] = a[0] / l; out[i * 3 + 1] = a[1] / l; out[i * 3 + 2] = a[2] / l;
  }
  const attr = new THREE.BufferAttribute(out, 3);
  geo.setAttribute('outlineNormal', attr);
  smoothedCache.set(geo, attr);
}

// Add outline shells under every mesh of `root`. Shells are children of their
// mesh (inherit animation transforms) and marked userData.isOutline so
// exporters/gates/raycasts can skip them. Returns a remover.
export function addOutlines(root, { thickness = 0.024, color = '#171226', minSize = 0.02 } = {}) {
  const shells = [];
  const box = new THREE.Box3(), size = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline || o.isSkinnedMesh) return;
    if (o.geometry.getAttribute('position').count > 20000) return;
    box.setFromObject(o).getSize(size);
    if (Math.max(size.x, size.y, size.z) < minSize) return; // eyes/rivets: skip
    ensureOutlineNormals(o.geometry);
    const shell = new THREE.Mesh(o.geometry, shellMaterial(color, thickness));
    shell.userData.isOutline = true;
    shell.renderOrder = (o.renderOrder || 0) - 0.1;
    shell.frustumCulled = o.frustumCulled;
    o.add(shell);
    shells.push(shell);
  });
  return () => { for (const s of shells) s.parent?.remove(s); };
}
