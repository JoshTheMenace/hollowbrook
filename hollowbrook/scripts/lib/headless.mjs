/**
 * Shared headless boot for the game-side gates: the Canvas2D no-op stub
 * (geometry never depends on what a canvas contains) and one `bootCity()`
 * that imports src/scene.js and builds the whole town in Node.  The
 * scene-side gates (check-city, check-spatial, check-cameras) carry their
 * own copy of this stub on purpose — they are forked verbatim from the
 * scene pipeline and must keep working when this file changes.
 */
export function installDomStub() {
  const noop = () => stubContext;
  const stubContext = new Proxy({}, {
    get: (t, prop) => {
      if (prop === 'canvas') return stubCanvas;
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop: () => {} });
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
  globalThis.document ??= { createElement: () => stubCanvas, createElementNS: () => stubCanvas };
  globalThis.window ??= globalThis;
  globalThis.self ??= globalThis;
}

export async function bootCity({ only = null } = {}) {
  installDomStub();
  const THREE = await import('three');
  const { buildVignette } = await import('../../src/scene.js');
  const scene = new THREE.Scene();
  const vignette = buildVignette(scene, { only });
  scene.updateMatrixWorld(true);
  return { THREE, scene, vignette, plan: vignette.plan };
}

export function makeChecker() {
  const checks = [];
  return {
    check: (id, pass, note) => checks.push({ id, pass, note }),
    finish: (label = 'RESULT') => {
      for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.id} — ${c.note}`);
      const failed = checks.filter((c) => !c.pass);
      console.log(failed.length ? `${label}: FAIL (${failed.length})` : `${label}: PASS`);
      process.exit(failed.length ? 1 : 0);
    },
  };
}

/** A gate whose subject is not built yet says so, loudly and exit-coded. */
export function notBuilt(gate, missing, why) {
  console.log(`FAIL ${gate}: NOT BUILT — ${missing} does not exist yet. ${why}`);
  console.log('RESULT: FAIL (1)');
  process.exit(1);
}
