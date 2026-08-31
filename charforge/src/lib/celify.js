// celify — the Cel Bridge (battery B2). Re-materials a CharForge character
// through a WORLD's cel() factory so the body shades exactly like the scene
// around it: same quantized ramp, same violet-leaning shadow bands. The
// factory is injected, so this module has no dependency on any one world.
//
// What survives the crossing: base color, vertexColors, emissive/practical
// glows, transparency, side. What is deliberately dropped: CharForge's own
// rim lighting and ramp (the world's ink pass + cel bands replace them —
// keeping both is the double-outline artifact the look contract bans).

export function celify(root, cel, { keepEmissive = true, accentGuard = [] } = {}) {
  // accentGuard: [[name, hue0..1, tol, maxSat]] — a crossing color that lands
  // in a scene-owned accent band is graded DOWN to maxSat (hue/value kept):
  // the character keeps its identity but stops competing for the accent.
  const guard = (hexColor) => {
    const sr = parseInt(hexColor.slice(1, 3), 16) / 255, sg = parseInt(hexColor.slice(3, 5), 16) / 255, sb = parseInt(hexColor.slice(5, 7), 16) / 255;
    const { h, s, v } = rgbToHsv(sr, sg, sb);
    for (const [, fh, tol, maxSat] of accentGuard) {
      if (s > (maxSat ?? 0.62) && Math.abs(shortHue(h - fh)) < (tol ?? 0.05)) {
        return hsvToHex(h, maxSat ?? 0.62, v);
      }
    }
    return hexColor;
  };
  const cache = new Map();      // source material -> cel material (shared stays shared)
  const report = { meshes: 0, converted: 0, skipped: 0, colors: new Map() };
  root.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline) return;
    report.meshes++;
    const src = o.material;
    if (!src || src.userData?.celified) { report.skipped++; return; }
    if (!cache.has(src)) {
      const emissive = keepEmissive && src.emissive && (src.emissiveIntensity ?? 0) > 0 && !src.emissive.equals?.({ r: 0, g: 0, b: 0 })
        ? '#' + src.emissive.getHexString() : null;
      const next = cel({
        color: src.color ? guard('#' + src.color.getHexString()) : '#ffffff',
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

// Census for the gate: every mesh in the subtree must carry a celified
// material, and saturated accents must stay within the allowance.
export function celCensus(root, { maxAccents = 2, forbiddenHues = [] } = {}) {
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
    if (m.color) {
      // judge color in sRGB — material .r/.g/.b are LINEAR under color
      // management, and linear-space saturation reads ~0.2 high (a 0.5-sat
      // brass graded as a 0.78-sat accent in the first census run)
      const hex = m.color.getHexString();
      const sr = parseInt(hex.slice(0, 2), 16) / 255, sg = parseInt(hex.slice(2, 4), 16) / 255, sb = parseInt(hex.slice(4, 6), 16) / 255;
      const { h, s } = rgbToHsv(sr, sg, sb);
      if (s > 0.7) {
        const hue = Math.round(h * 12) / 12;   // bucket to 30° bins
        accents.set(hue, (accents.get(hue) || 0) + 1);
        for (const [name, fh, tol] of forbiddenHues) {
          if (Math.abs(shortHue(h - fh)) < (tol ?? 0.05)) {
            problems.push(`accent ${'#' + m.color.getHexString()} collides with the scene's owned "${name}" accent`);
          }
        }
      }
    }
  });
  if (accents.size > maxAccents) {
    problems.push(`${accents.size} distinct saturated accent hues (allow ${maxAccents}): ${[...accents.keys()].map((h) => Math.round(h * 360) + '°').join(', ')}`);
  }
  return { meshes, accents: accents.size, problems };
}

function rgbToHsv(r, g, b) {
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
const shortHue = (d) => ((d + 1.5) % 1) - 0.5;
function hsvToHex(h, s, v) {
  const f = (n) => {
    const k = (n + h * 6) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  const to = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return '#' + to(f(5)) + to(f(3)) + to(f(1));
}
