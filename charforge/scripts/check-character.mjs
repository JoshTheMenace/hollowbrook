// Headless machine gates for a character module. No WebGL needed — geometry,
// bones and animation sampling are pure math.
//   node scripts/check-character.mjs <name>        (from charforge/)
// Exits non-zero on any FAIL. Prints a JSON report.
import * as THREE from 'three';
import { characters } from '../src/characters/index.js';

const name = process.argv[2];
if (!name || !characters[name]) {
  console.error(`usage: check-character.mjs <name>; have: ${Object.keys(characters).join(', ')}`);
  process.exit(2);
}

const results = [];
const check = (id, pass, detail) => { results.push({ id, pass, detail }); };

const mod = await characters[name]();
let built;
try {
  built = await mod.build();
  check('builds', true, 'build() returned without throwing');
} catch (e) {
  check('builds', false, String(e.stack || e));
  finish();
}

const { root, clips = [] } = built;
root.updateMatrixWorld(true);

function sceneBounds() {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  return box;
}

// 1. Grounding + plausible size in bind/default pose.
{
  const box = sceneBounds();
  const size = box.getSize(new THREE.Vector3());
  check('grounded', box.min.y > -0.03 && box.min.y < 0.08,
    `min.y=${box.min.y.toFixed(3)} (feet should touch y=0)`);
  check('height', size.y >= 0.5 && size.y <= 3.2, `height=${size.y.toFixed(2)}m`);
  check('centered', Math.abs(box.getCenter(new THREE.Vector3()).x) < 0.25,
    `center.x=${box.getCenter(new THREE.Vector3()).x.toFixed(3)}`);
}

// 2. Triangle budget + NaN vertices.
{
  let tris = 0, nan = false;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    const p = g.attributes.position.array;
    for (let i = 0; i < p.length; i++) if (Number.isNaN(p[i])) { nan = true; break; }
  });
  check('tris', tris > 0 && tris <= 40000, `${Math.round(tris)} triangles (budget 40k)`);
  check('no-nan', !nan, nan ? 'NaN vertex positions found' : 'clean');
}

// 3. Clips: required set, loop continuity, floor penetration across time.
{
  const names = clips.map((c) => c.name);
  // characters may narrow/widen the contract via meta.requiredClips
  // (e.g. ambient animals: ['idle', 'walk', 'startle'])
  const required = built.meta?.requiredClips || ['idle', 'walk', 'attack'];
  for (const rc of required) {
    check(`has-${rc}`, names.includes(rc), `clips: ${names.join(', ') || 'none'}`);
  }

  // Characters carrying a big clip library (e.g. KayKit packs) include
  // one-shots that legitimately fail loop/floor rules (deaths, jumps, lies) —
  // gate only the core contract clips there.
  const gated = clips.length > 10
    ? clips.filter((c) => ['idle', 'walk', 'attack'].includes(c.name))
    : clips;

  const mixer = new THREE.AnimationMixer(root);
  for (const clip of gated) {
    const action = mixer.clipAction(clip);
    action.play();

    // Loop continuity: pose at t=0 vs t=duration must match.
    const snap = (t) => {
      mixer.setTime(t);
      root.updateMatrixWorld(true);
      const vals = [];
      root.traverse((o) => { if (o.isBone || o.isMesh || o.isGroup) vals.push(...o.matrixWorld.elements); });
      return vals;
    };
    // 'death' is a one-shot that deliberately does NOT return to rest (it
    // ends collapsed on the ground, held via clampWhenFinished at runtime —
    // see KIT.md's one-shots-by-name convention) so it's exempt from the
    // loop-continuity check; every other clip (including other one-shots
    // like attack/hit, which do return to rest) still must close cleanly.
    if (clip.name !== 'death') {
      const a = snap(0), b = snap(clip.duration - 1e-6);
      let maxd = 0;
      for (let i = 0; i < a.length; i++) maxd = Math.max(maxd, Math.abs(a[i] - b[i]));
      check(`loop:${clip.name}`, maxd < 0.02, `max transform delta at wrap = ${maxd.toFixed(4)}`);
    }

    // Floor sanity sampled across the clip. On skinned characters, measure
    // the body only — a weapon deliberately striking the ground (KayKit's
    // axe chop) is not a floor bug.
    let hasSkinned = false;
    root.traverse((o) => { if (o.isSkinnedMesh) hasSkinned = true; });
    const bodyMin = () => {
      root.updateMatrixWorld(true);
      const box = new THREE.Box3();
      const b = new THREE.Box3();
      root.traverse((o) => {
        if (!o.isMesh || (hasSkinned && !o.isSkinnedMesh)) return;
        if (o.isSkinnedMesh) {
          o.computeBoundingBox(); // pose-aware, unlike Box3.setFromObject
          box.union(b.copy(o.boundingBox).applyMatrix4(o.matrixWorld));
        } else {
          box.union(b.setFromObject(o));
        }
      });
      return box.min.y;
    };
    let minY = Infinity;
    for (let i = 0; i <= 24; i++) {
      mixer.setTime((clip.duration * i) / 24);
      minY = Math.min(minY, bodyMin());
    }
    check(`floor:${clip.name}`, minY > -0.04, `lowest body point over clip = ${minY.toFixed(3)}`);
    action.stop();
  }
}

finish();

function finish() {
  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ character: name, pass: failed.length === 0, results }, null, 2));
  process.exit(failed.length === 0 ? 0 : 1);
}
