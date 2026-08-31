import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// KayKit Character Pack: Adventurers (CC0, see public/kaykit/PROVENANCE.md).
// Professionally rigged + animated GLBs, loaded as first-class lab characters:
// same contract as the procedural ones, ~75 clips each, with idle/walk/attack
// aliased onto the pack's clip names so all the lab tooling works unchanged.

// In Node (headless gates) GLTFLoader chokes on embedded textures — strip the
// texture tables from the GLB's JSON chunk; geometry/skeleton/clips survive.
function stripTextures(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const jsonLen = dv.getUint32(12, true);
  const jsonStart = 20;
  const json = JSON.parse(new TextDecoder().decode(u8.subarray(jsonStart, jsonStart + jsonLen)));
  delete json.images; delete json.textures; delete json.samplers;
  const scrub = (o) => {
    if (!o || typeof o !== 'object') return;
    for (const k of Object.keys(o)) {
      if (k.endsWith('Texture')) delete o[k];
      else scrub(o[k]);
    }
  };
  (json.materials || []).forEach(scrub);
  let jsonOut = new TextEncoder().encode(JSON.stringify(json));
  const pad = (4 - (jsonOut.length % 4)) % 4;
  if (pad) {
    const padded = new Uint8Array(jsonOut.length + pad).fill(0x20);
    padded.set(jsonOut);
    jsonOut = padded;
  }
  const rest = u8.subarray(jsonStart + jsonLen); // remaining chunks (BIN)
  const out = new Uint8Array(20 + jsonOut.length + rest.length);
  const odv = new DataView(out.buffer);
  odv.setUint32(0, 0x46546c67, true);           // 'glTF'
  odv.setUint32(4, 2, true);
  odv.setUint32(8, out.length, true);
  odv.setUint32(12, jsonOut.length, true);
  odv.setUint32(16, 0x4e4f534a, true);          // 'JSON'
  out.set(jsonOut, 20);
  out.set(rest, 20 + jsonOut.length);
  return out.buffer;
}

async function loadGLB(url) {
  const loader = new GLTFLoader();
  if (typeof window === 'undefined') {
    const fs = await import('node:fs');
    const buf = fs.readFileSync('public' + url);
    const ab = stripTextures(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    return new Promise((res, rej) => loader.parse(ab, '', res, rej));
  }
  return loader.loadAsync(url);
}

const pick = (clips, candidates) => {
  for (const c of candidates) {
    const hit = clips.find((k) => k.name === c);
    if (hit) return hit;
  }
  return null;
};

export function kaykitCharacter(file, { attack = [], height = 1.3, props = [] } = {}) {
  return async function build() {
    const gltf = await loadGLB(`/kaykit/${file}.glb`);
    const inner = gltf.scene;
    const root = new THREE.Group();
    root.name = `kaykit-${file}`;
    root.add(inner);

    // The packs ship every weapon/accessory variant attached at once — the
    // game is expected to pick. Keep skinned body parts and worn clothing;
    // rigid gear (weapons, shields, mugs) stays only if chosen for this
    // loadout. (Gear can be file-prefixed too, e.g. Barbarian_Round_Shield.)
    const WORN = /_(Hat|Helmet|Cape|Hood)$/;
    const doomed = [];
    inner.traverse((o) => {
      if (o.isMesh && !o.isSkinnedMesh && !WORN.test(o.name) && !props.includes(o.name))
        doomed.push(o);
    });
    doomed.forEach((o) => o.removeFromParent());

    // Normalize: feet on y=0, uniform scale to target height, facing +Z.
    inner.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inner);
    const size = box.getSize(new THREE.Vector3());
    const s = height / size.y;
    inner.scale.setScalar(s);
    inner.position.y = -box.min.y * s;
    inner.traverse((o) => { if (o.isSkinnedMesh) o.frustumCulled = false; });

    const clips = gltf.animations.map((c) => c.clone());
    const alias = (name, candidates) => {
      const src = pick(clips, candidates);
      if (!src) return;
      const c = src.clone();
      c.name = name;
      clips.unshift(c);
    };
    alias('idle', ['Idle', 'Idle_B', 'Idle_A']);
    alias('walk', ['Walking_A', 'Walking_B', 'Walking_C']);
    alias('attack', attack.length ? attack
      : ['1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Chop', '2H_Melee_Attack_Chop',
         'Spellcast_Shoot', 'Unarmed_Melee_Attack_Punch_A']);

    return { root, clips, meta: { height, name: `KayKit ${file}` } };
  };
}
