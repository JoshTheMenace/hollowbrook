import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export { RoundedBoxGeometry };

// --- Materials -------------------------------------------------------------

// Soft painted toon ramp. LinearFilter blurs the band edges toward the
// hand-painted mobile-game look (hard NearestFilter would be anime cel).
export function toonRamp(stops = [0.35, 0.62, 0.85, 1.0], soft = true) {
  const data = new Uint8Array(stops.map((s) => Math.round(s * 255)));
  const tex = new THREE.DataTexture(data, stops.length, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = soft ? THREE.LinearFilter : THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

let sharedRamp = null;

// One toon material per color; rim light injected via onBeforeCompile.
export function toonMaterial(color, { rim = 0.35, rimColor = '#ffe9c4', vertexColors = false, ramp = null } = {}) {
  sharedRamp ||= toonRamp();
  const mat = new THREE.MeshToonMaterial({
    // per-material ramps give real material language: try ramp: [0.3, 1.0]
    // (hard 2-stop) for metal, [0.35, 0.55, 0.75, 0.9, 1.0] for soft skin
    color, gradientMap: ramp ? toonRamp(ramp) : sharedRamp, vertexColors,
  });
  if (rim > 0) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uRimColor = { value: new THREE.Color(rimColor) };
      shader.uniforms.uRim = { value: rim };
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'uniform vec3 uRimColor; uniform float uRim;\nvoid main() {')
        .replace('#include <opaque_fragment>', `
          float rimF = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);
          outgoingLight += uRimColor * rimF * uRim;
          #include <opaque_fragment>`);
    };
  }
  return mat;
}

// Vertical hand-painted gradient baked into vertex colors: darker toward the
// ground (fake AO), lighter on top. Enable material.vertexColors to use.
export function paintGradient(geo, bottomColor, topColor) {
  const pos = geo.attributes.position;
  const cb = new THREE.Color(bottomColor), ct = new THREE.Color(topColor), c = new THREE.Color();
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.smoothstep(pos.getY(i), min.y, max.y);
    c.lerpColors(cb, ct, t);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}

// --- Geometry helpers ------------------------------------------------------

// Capsule limb hanging down (-Y) from its joint pivot, pivoted at the top
// cap's sphere center — rotating it about the pivot is self-covering, so the
// joint needs no extra sphere. radiusTop/radiusBottom via cone-ish scaling.
export function limbMesh(radius, length, material, { taper = 1, facet = false, segments } = {}) {
  const [capSeg, radSeg] = segments || (facet ? [3, 8] : [6, 18]);
  const geo = new THREE.CapsuleGeometry(radius, length, capSeg, radSeg);
  // capsule is centered; shift so the top cap center sits at origin
  geo.translate(0, -length / 2, 0);
  if (taper !== 1) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const f = THREE.MathUtils.lerp(1, taper, THREE.MathUtils.clamp(-y / (length + radius), 0, 1));
      pos.setX(i, pos.getX(i) * f);
      pos.setZ(i, pos.getZ(i) * f);
    }
  }
  if (facet) {
    const g = geo.toNonIndexed();
    g.computeVertexNormals();
    return new THREE.Mesh(g, material);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

// Chunky body of revolution from a (radius, height) profile, smoothed with
// Catmull-Rom so the silhouette is clean. scaleZ flattens front-to-back.
export function latheBody(profile, material, { segments = 28, scaleZ = 0.88, facet = false } = {}) {
  const curve = new THREE.CatmullRomCurve3(profile.map(([r, y]) => new THREE.Vector3(r, y, 0)));
  const pts = curve.getPoints(facet ? 12 : 32).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
  let geo = new THREE.LatheGeometry(pts, facet ? Math.min(segments, 10) : segments);
  geo.scale(1, 1, scaleZ);
  if (facet) geo = geo.toNonIndexed();
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

export function facetBall(radius, material, scale = [1, 1, 1], detail = [8, 6]) {
  const geo = new THREE.SphereGeometry(radius, detail[0], detail[1]);
  geo.scale(...scale);
  const g = geo.toNonIndexed();
  g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}

// Rounded box mesh — the chunky-toy workhorse. radius as fraction of the
// smallest dimension (0.2–0.4 reads toy-like).
export function chunkyBox(w, h, d, material, { radius = 0.3 } = {}) {
  const r = Math.min(w, h, d) * radius;
  return new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, r), material);
}

export function ball(radius, material, scale = [1, 1, 1]) {
  const geo = new THREE.SphereGeometry(radius, 24, 18);
  geo.scale(...scale);
  return new THREE.Mesh(geo, material);
}

// Simple mitt hand / foot blob.
export function blob(radius, material, scale = [1, 0.8, 1.15]) {
  return ball(radius, material, scale);
}

// A strap/trim that CONFORMS to a lathe body's surface — overlapping box
// segments walking from `from` to `to` in (theta, y) around the profile.
// radiusAt(y) returns the body profile radius at height y (same frame the
// strap is parented into); scaleZ must match the body's front-back squash.
// Fixes the classic floating-band defect: tori and rings cannot hug a pear.
export function conformalStrap({ radiusAt, from, to, material, scaleZ = 0.88, width = 0.055, thick = 0.02, segments = 12, offset = 0.012 }) {
  const group = new THREE.Group();
  const pt = (u) => {
    const th = THREE.MathUtils.lerp(from.theta, to.theta, u);
    const y = THREE.MathUtils.lerp(from.y, to.y, u);
    const r = radiusAt(y) + offset;
    return new THREE.Vector3(Math.sin(th) * r, y, Math.cos(th) * r * scaleZ);
  };
  for (let i = 0; i < segments; i++) {
    const a = pt(i / segments), b = pt((i + 1) / segments);
    const mid = a.clone().lerp(b, 0.5);
    const tangent = b.clone().sub(a);
    const len = tangent.length() * 1.3; // overlap so bends show no gaps
    const yA = tangent.normalize();
    const n = new THREE.Vector3(mid.x, 0, mid.z / (scaleZ * scaleZ)).normalize();
    const zA = n.sub(yA.clone().multiplyScalar(n.dot(yA))).normalize();
    const xA = new THREE.Vector3().crossVectors(yA, zA);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(width, len, thick), material);
    seg.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xA, yA, zA));
    seg.position.copy(mid);
    group.add(seg);
  }
  return group;
}

// Piecewise-linear radius lookup for a lathe profile ([[r, y], ...]).
export function profileRadius(profile) {
  const pts = [...profile].sort((a, b) => a[1] - b[1]);
  return (y) => {
    if (y <= pts[0][1]) return pts[0][0];
    for (let i = 1; i < pts.length; i++) {
      if (y <= pts[i][1]) {
        const u = (y - pts[i - 1][1]) / (pts[i][1] - pts[i - 1][1]);
        return THREE.MathUtils.lerp(pts[i - 1][0], pts[i][0], u);
      }
    }
    return pts[pts.length - 1][0];
  };
}

// Flat-shaded accent (hair tufts, rocks, crystals).
export function facet(geo, material) {
  const g = geo.toNonIndexed();
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, material);
  return mesh;
}
