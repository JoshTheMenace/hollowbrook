// celify — the Cel Bridge (battery B2). Re-materials a CharForge character
// through a WORLD's cel() factory so the body shades exactly like the scene
// around it: same quantized ramp, same violet-leaning shadow bands. The
// factory is injected, so this module has no dependency on any one world.
//
// What survives the crossing: base color, vertexColors, emissive/practical
// glows, transparency, side. What is deliberately dropped: CharForge's own
// rim lighting and ramp (the world's ink pass + cel bands replace them —
// keeping both is the double-outline artifact the look contract bans).
//
// v3 (B2 art reviews r1+r2): the census judges EFFECTIVE color — material
// color × vertex colors — so a #ffffff + vertexColors hair can no longer
// hide from the gate. The guard caps saturation into the WORLD's measured
// band and pushes VALUE (never hue) inside scene-owned bands; the one owned
// accent keeps its hue but carries its own saturation cap. The guard is a
// budgeted safety net — celify reports every correction it makes, and the
// gate fails a character whose authoring leans on the guard.

export function celify(root, cel, {
  keepEmissive = true,
  accentGuard = [],          // [[name, hue0..1, tol, maxSat]] scene-owned bands
  worldSatCap = null,        // world's measured max saturation; cap everything...
  ownedAccent = null,        // ...except { name, hue, tol, satCap } — the ONE owned accent
} = {}) {
  const inOwned = (h) => ownedAccent && Math.abs(shortHue(h - ownedAccent.hue)) < (ownedAccent.tol ?? 0.05);
  // corrections are ACCOUNTED: the guard is a safety net with a budget the
  // gate enforces, never the authoring mechanism (review r2: a guard that
  // silently absorbs authoring problems means the gate can't surface them)
  const corrections = { count: 0, total: 0, maxSatDelta: 0 };
  const gradeHsv = ({ h, s, v }) => {
    const s0 = s;
    for (const [, fh, tol, maxSat] of accentGuard) {
      if (s > (maxSat ?? 0.62) && Math.abs(shortHue(h - fh)) < (tol ?? 0.05)) {
        // in a scene-owned band: cap saturation and push VALUE down (hue is
        // kept — a hue push is semantically blind and turned amber irises
        // olive in r2; deep amber-brown is the graceful degrade)
        s = Math.min(s, maxSat ?? 0.62);
        v *= 0.78;
      }
    }
    if (worldSatCap != null) {
      // the owned accent keeps its hue identity but is NOT unlimited
      s = Math.min(s, inOwned(h) ? (ownedAccent.satCap ?? worldSatCap + 0.1) : worldSatCap);
    }
    if (s !== s0) {
      corrections.count += 1;
      corrections.maxSatDelta = Math.max(corrections.maxSatDelta, s0 - s);
    }
    corrections.total += 1;
    return { h, s, v };
  };
  const guardHex = (hexColor) => {
    const { h, s, v } = hexToHsv(hexColor);
    const g = gradeHsv({ h, s, v });
    return g.h === h && g.s === s && g.v === v ? hexColor : hsvToHex(g.h, g.s, g.v);
  };

  const cache = new Map();      // source material -> cel material (shared stays shared)
  const gradedGeo = new WeakSet();
  const report = { meshes: 0, converted: 0, skipped: 0, colors: new Map(), corrections };
  root.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline) return;
    report.meshes++;
    const src = o.material;
    if (!src || src.userData?.celified) { report.skipped++; return; }
    // vertex-color surfaces: grade the attribute itself (effective color path)
    const colAttr = o.geometry?.attributes?.color;
    if (src.vertexColors && colAttr && !gradedGeo.has(o.geometry)) {
      gradedGeo.add(o.geometry);
      const arr = colAttr.array;
      o.geometry.userData.rawColorArray = arr.slice();   // for honest A/B restore
      for (let i = 0; i < colAttr.count; i++) {
        const [r, g, b] = [arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]].map(linToSrgb);
        const graded = gradeHsv(rgbToHsv(r, g, b));
        const [nr, ng, nb] = hsvToRgb(graded.h, graded.s, graded.v).map(srgbToLin);
        arr[i * 3] = nr; arr[i * 3 + 1] = ng; arr[i * 3 + 2] = nb;
      }
      o.geometry.userData.celColorArray = arr.slice();
      colAttr.needsUpdate = true;
    }
    if (!cache.has(src)) {
      const emissive = keepEmissive && src.emissive && (src.emissiveIntensity ?? 0) > 0 && !src.emissive.equals?.({ r: 0, g: 0, b: 0 })
        ? '#' + src.emissive.getHexString() : null;
      const next = cel({
        color: src.color ? guardHex('#' + src.color.getHexString()) : '#ffffff',
        vertexColors: !!src.vertexColors,
        emissive,
        emissiveIntensity: emissive ? (src.emissiveIntensity ?? 1) : 1,
        transparent: !!src.transparent,
        opacity: src.opacity ?? 1,
        side: src.side,
        cache: false,             // characters animate + tint; never share with the world
      });
      next.userData.celified = true;
      if (src.userData?.practical || o.userData?.practical) next.userData.practical = true;
      cache.set(src, next);
    }
    o.material = cache.get(src);
    report.converted++;
    if (src.color) {
      const hex = '#' + src.color.getHexString();
      report.colors.set(hex, (report.colors.get(hex) || 0) + 1);
    }
  });
  return report;
}

// Material-level census (fast, structural): every mesh must carry a celified
// material. Saturation judgement moved to pixel-census (screen-space); this
// keeps the coverage check plus a per-material effective-color listing so
// failures name the culprit mesh.
export function celCensus(root, { satThreshold = 0.7, maxAccents = 2, forbiddenHues = [], ownedAccent = null } = {}) {
  const problems = [];
  const accents = new Map();
  let meshes = 0;
  root.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline) return;
    meshes++;
    const m = o.material;
    if (!m?.userData?.celified) {
      problems.push(`mesh "${o.name || '(unnamed)'}" carries a non-cel material (${m?.type ?? 'none'})`);
      return;
    }
    // EFFECTIVE colors: material color × vertex colors (sRGB judged — linear
    // reads ~0.2 high; and #ffffff+vertexColors must not exempt a surface)
    for (const { h, s } of effectiveColors(o)) {
      if (s > satThreshold) {
        if (ownedAccent && Math.abs(shortHue(h - ownedAccent.hue)) < (ownedAccent.tol ?? 0.05)) continue;
        const hue = Math.round(h * 12) / 12;   // bucket to 30° bins
        if (!accents.has(hue)) accents.set(hue, []);
        if (!accents.get(hue).includes(o.name)) accents.get(hue).push(o.name || '(unnamed)');
        for (const [name, fh, tol] of forbiddenHues) {
          if (Math.abs(shortHue(h - fh)) < (tol ?? 0.05)) {
            problems.push(`mesh "${o.name}" effective color (hue ${Math.round(h * 360)}°, sat ${s.toFixed(2)}) collides with the scene's owned "${name}" accent`);
          }
        }
      }
    }
  });
  if (accents.size > maxAccents) {
    problems.push(`${accents.size} distinct saturated accent hues above world band (allow ${maxAccents}): ${[...accents.entries()].map(([h, names]) => `${Math.round(h * 360)}° (${names[0]})`).join(', ')}`);
  }
  return { meshes, accents: accents.size, problems };
}

// Sampled effective colors of one mesh in sRGB HSV: material color times a
// spread of vertex colors (every 16th vertex — hue statistics, not a render).
function effectiveColors(o) {
  const m = o.material;
  const base = m.color ? hexToRgb('#' + m.color.getHexString()) : [1, 1, 1];
  const colAttr = m.vertexColors ? o.geometry?.attributes?.color : null;
  if (!colAttr) return [rgbToHsv(...base)];
  const out = [];
  const arr = colAttr.array;
  for (let i = 0; i < colAttr.count; i += 16) {
    out.push(rgbToHsv(
      base[0] * linToSrgb(arr[i * 3]),
      base[1] * linToSrgb(arr[i * 3 + 1]),
      base[2] * linToSrgb(arr[i * 3 + 2]),
    ));
  }
  return out;
}

// ---- color helpers (sRGB HSV) ----------------------------------------------
export function rgbToHsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return { h, s: mx === 0 ? 0 : d / mx, v: mx };
}
export function hsvToRgb(h, s, v) {
  const f = (n) => {
    const k = (n + h * 6) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)];
}
export const shortHue = (d) => ((d + 1.5) % 1) - 0.5;
export const linToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
export const srgbToLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const hexToHsv = (hex) => rgbToHsv(...hexToRgb(hex));
function hsvToHex(h, s, v) {
  const to = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  const [r, g, b] = hsvToRgb(h, s, v);
  return '#' + to(r) + to(g) + to(b);
}
