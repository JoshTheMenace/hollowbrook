/* ------------------------------------------------------------------ *
 * ENEMIES — the presentation view over `run.enemies`.
 *
 * The rules are pure and tick-fixed; this file NEVER writes a record.  It
 * reads x/y/z/heading/state/seq every frame and moves geometry to match.
 *
 * Five things here are load-bearing, and each is a trap paid for once:
 *
 * 1. THE ATLAS IS BAKED INTO VERTEX COLOURS BEFORE celify.  KayKit ships
 *    one palette-atlas texture per character and every mesh samples a few
 *    texels of it; `celify` carries colour, vertexColors and emissive
 *    across and deliberately drops `map`.  Skip the bake and the whole
 *    Company arrives as untextured white plastic — which renders, throws
 *    nothing, and reads as a lighting bug.  The bake runs ONCE on each
 *    template, so every clone inherits a coloured geometry.
 *
 * 2. THE ACTOR MUST NOT DRIVE POSITION.  charforge's Actor integrates its
 *    own `velocity` into `root.position` inside `update()`.  The rules own
 *    position, so `velocity` is pinned to zero and the record's x/y/z and
 *    heading are copied in every frame.  `update(dt)` still has to be
 *    called on every live actor or `lockUntil` never expires and the rig
 *    freezes mid-attack for the rest of the run.
 *
 * 3. GEOMETRY IS SHARED, MATERIALS ARE NOT.  `SkeletonUtils.clone` shares
 *    geometry and materials with the template.  Shared materials mean one
 *    enemy's tint (or hit flash) repaints every enemy of that kind — the
 *    nightbloom slime bug.  So `celify` runs per INSTANCE (it builds with
 *    `cache: false`), and a cloned instance's teardown disposes MATERIALS
 *    ONLY; the geometries belong to the templates and go once, in
 *    `dispose()`.  The Captain is the exception: procedural rigs are built
 *    fresh per instance (their per-frame constraints are closures over the
 *    built nodes), so that instance owns its geometry and disposes it.
 *
 * 4. celify's colour grading is idempotent HERE and only here.  It grades
 *    the shared `color` attribute in place, so running it per instance
 *    would compound — except that with `accentGuard: []` and
 *    `toneSteps: 0` the only operation on a colour is `s = min(s, cap)`,
 *    which is a fixed point.  Add an accent-guard band or tone stepping
 *    and this stops being true: grade the template once instead.
 *
 * 5. A ONE-SHOT FIRES ON A SEQ COUNTER, NEVER ON A STATE.  `state` is
 *    sampled at whatever rate the shell renders at, so a 0.12 s strike can
 *    be missed entirely between two frames; `seq.attack` cannot.
 * ------------------------------------------------------------------ */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Actor } from '@forge/game/actor.js';
import { kaykitCharacter } from '@forge/characters/kaykit.js';
import { characters } from '@forge/characters/index.js';
import { celify, rgbToHsv } from '@forge/lib/celify.js';
import { RIGS, BODY, CONTRACT } from './data.js';
import { ACCENT } from '../palette.js';

const KINDS = ['cutpurse', 'reaver', 'shieldbearer', 'hexer', 'captain'];

/* `native` is the ground speed the locomotion clips read as at timeScale 1
 * for a 1.80 m rig.  KayKit's walks and runs are in place, so the only cure
 * for foot slide is `timeScale = record.speed / native`, scaled by height. */
const NATIVE = { walk: 1.40, run: 3.80, ref: 1.80 };

/* The Company's one accent.  Its hue is computed, not typed: celify's owned
 * band is a hue in 0..1 and a wrong constant silently desaturates the only
 * saturated thing an enemy is allowed to wear. */
const RUST = ACCENT.companyRust;
const RUST_HUE = rgbToHsv(((RUST >> 16) & 255) / 255, ((RUST >> 8) & 255) / 255, (RUST & 255) / 255).h;
const OWNED = { name: 'company-rust', hue: RUST_HUE, tol: 0.05, satCap: 0.72 };
const WORLD_SAT_CAP = 0.62;

const TEAL = ACCENT.wardGlow;               // the hexer's staff telegraph
const SKIN = /head|face|hand|skin|hair|eye|beard/i;
const JOINTS = ['chest', 'spine', 'torso', 'hips'];   // charforge's procedural rig names

/* scratch — the hot path allocates nothing */
const _s = new THREE.Vector3();
const _hsl = { h: 0, s: 0, l: 0 };
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const srgbToLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/* ------------------------------------------------------------------ *
 * the atlas bake
 * ------------------------------------------------------------------ */
function imageData(image) {
  const w = image.width;
  const h = image.height;
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  return { data: ctx.getImageData(0, 0, w, h).data, w, h };
}

/**
 * Sample each material's map at every vertex UV, write it into a `color`
 * attribute, then drop the map.  NEAREST sample: an atlas is flat patches,
 * and a bilinear tap across a patch boundary invents a colour that is in
 * neither.  Vertex colours are read in the working (linear) space, so the
 * sRGB texel is converted — the same convention celify grades in.
 */
function bakeAtlasToVertexColours(root) {
  const images = new Map();       // texture.image -> { data, w, h }
  const baked = new Set();        // geometry
  const mats = new Set();
  let count = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const mat = list.find((m) => m && m.map);
    if (!mat) return;
    mats.add(mat);
    const uv = o.geometry?.attributes?.uv;
    if (!uv || baked.has(o.geometry)) return;
    const tex = mat.map;
    if (!tex.image || !tex.image.width) return;
    if (!images.has(tex.image)) images.set(tex.image, imageData(tex.image));
    const { data, w, h } = images.get(tex.image);
    const pos = o.geometry.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const wrapU = tex.wrapS === THREE.RepeatWrapping;
    const wrapV = tex.wrapT === THREE.RepeatWrapping;
    for (let i = 0; i < pos.count; i += 1) {
      let u = uv.getX(i);
      let v = uv.getY(i);
      u = wrapU ? ((u % 1) + 1) % 1 : clamp(u, 0, 1);
      v = wrapV ? ((v % 1) + 1) % 1 : clamp(v, 0, 1);
      // glTF sets flipY = false, so v = 0 is the image's TOP row.  Both ways.
      const row = tex.flipY ? (1 - v) * h : v * h;
      const px = clamp(Math.floor(u * w), 0, w - 1);
      const py = clamp(Math.floor(row), 0, h - 1);
      const k = (py * w + px) * 4;
      col[i * 3] = srgbToLin(data[k] / 255);
      col[i * 3 + 1] = srgbToLin(data[k + 1] / 255);
      col[i * 3 + 2] = srgbToLin(data[k + 2] / 255);
    }
    o.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    baked.add(o.geometry);
    count += 1;
  });
  for (const m of mats) { m.vertexColors = true; m.map = null; m.needsUpdate = true; }
  return count;
}

/* ------------------------------------------------------------------ *
 * templates
 * ------------------------------------------------------------------ */
const BONE_PREF = [/upperchest/i, /chest/i, /spine/i, /torso/i, /hips|pelvis/i];

/** The torso node the sash hangs off — a skeleton Bone, or a procedural
 *  rig's plain joint Object3D (charforge names them `chest`/`spine`/...). */
function findTorso(root) {
  const cand = [];
  root.traverse((o) => { if (o.isBone || JOINTS.includes(o.name)) cand.push(o); });
  for (const re of BONE_PREF) {
    const hit = cand.filter((b) => re.test(b.name));
    if (hit.length) return hit[hit.length - 1];      // the highest spine link
  }
  return cand[0] ?? null;
}

/**
 * The torso's world box at the bind pose.  A sash is sized and seated off
 * THIS, not off the joint: a KayKit chest bone sits at 67 % of the torso's
 * height (level with the collar), so a band centred on the joint crosses
 * the chin.  Two rigs, two ways to find the torso — a KayKit body is one
 * named skinned mesh, a charforge rig's torso is the plain meshes hung
 * directly on hips/spine/chest — and a height-derived box if neither hits.
 */
function torsoBox(root, height) {
  const box = new THREE.Box3();
  root.traverse((o) => { if (o.isMesh && /_body$|torso|kimono/i.test(o.name)) box.expandByObject(o); });
  if (box.isEmpty()) {
    root.traverse((o) => {
      if (!JOINTS.includes(o.name)) return;
      for (const c of o.children) if (c.isMesh) box.expandByObject(c);
    });
  }
  if (box.isEmpty()) {
    box.set(
      new THREE.Vector3(-height * 0.16, height * 0.34, -height * 0.13),
      new THREE.Vector3(height * 0.16, height * 0.62, height * 0.13),
    );
  }
  return box;
}

/** Alias a clip under a second name so the Actor's state machine finds it. */
function alias(clips, name, candidates) {
  if (clips.some((c) => c.name === name)) return true;
  for (const want of candidates) {
    const src = clips.find((c) => c.name === want);
    if (!src) continue;
    const c = src.clone();
    c.name = name;
    clips.unshift(c);
    return true;
  }
  return false;
}

async function buildTemplate(kind) {
  const rig = CONTRACT.enemies[kind].rig;
  const procedural = !RIGS[rig];                     // the Captain: charforge's ronin
  let make = null;
  let built;
  if (procedural) {
    const mod = await characters[rig]();
    make = mod.build;
    built = make();
  } else {
    const spec = RIGS[rig];
    built = await kaykitCharacter(spec.file, spec)();
    // kaykit.js aliases idle/walk/attack only — the roster needs three more.
    alias(built.clips, 'run', ['Running_A', 'Running_B', 'Running_C']);
    alias(built.clips, 'hit', ['Hit_A', 'Hit_B']);
    alias(built.clips, 'death', ['Death_A', 'Death_B']);
  }
  const bakedMeshes = bakeAtlasToVertexColours(built.root);
  built.root.updateMatrixWorld(true);
  const height = built.meta?.height ?? BODY[kind].height;
  const torso = findTorso(built.root);
  const boneFix = new THREE.Quaternion();
  const jointAt = new THREE.Vector3();
  let boneScale = 1;
  if (torso) {
    torso.getWorldScale(_s);
    boneScale = _s.x || 1;
    torso.getWorldQuaternion(boneFix).invert();
    torso.getWorldPosition(jointAt);
  }
  // the sash, measured off the torso rather than guessed off the joint
  const tb = torsoBox(built.root, height);
  const size = tb.getSize(new THREE.Vector3());
  const mid = tb.getCenter(new THREE.Vector3());
  const sash = {
    // shoulder-to-hip run, but never longer than the torso is wide: a
    // charforge rig's torso box swallows its collar and the diagonal alone
    // would send the band out past both shoulders
    len: Math.min(Math.hypot(size.x, size.y) * 0.80, size.x * 1.20),
    band: clamp(size.y * 0.17, 0.06, 0.115),
    depth: size.z * 1.04,                       // through the body: front AND back
    offset: mid.sub(jointAt),                   // hook space is world-axis, world-scale
  };
  let meshCount = 0;
  built.root.traverse((o) => { if (o.isMesh) meshCount += 1; });
  return {
    kind, rig, procedural, make, built, height,
    torso: torso?.name ?? null,
    boneScale, boneFix, sash,
    clipNames: built.clips.map((c) => c.name),
    bakedMeshes, meshCount,
  };
}

/* ------------------------------------------------------------------ *
 * the view
 * ------------------------------------------------------------------ */
const WINDUP = { cutpurse: 0.45, reaver: 0.65, shieldbearer: 0.55, hexer: 0.7, captain: 0.5 };

export async function createEnemyView({ scene, cel, world }) {
  const templates = new Map();
  for (const t of await Promise.all(KINDS.map(buildTemplate))) templates.set(t.kind, t);

  /* View-owned materials: nothing per instance mutates them, and they are
   * disposed exactly once.  `cache: false` so they are never the town's. */
  const sashMat = cel({ color: RUST, emissive: RUST, emissiveIntensity: 0.34, bands: 2, cache: false });
  const bannerMat = cel({ color: RUST, emissive: RUST, emissiveIntensity: 0.34, bands: 2, side: THREE.DoubleSide, cache: false });
  const poleMat = cel({ color: 0x3a3128, bands: 2, cache: false });
  const hpBackMat = cel({ color: 0x241d24, emissive: 0x241d24, emissiveIntensity: 0.6, bands: 2, side: THREE.DoubleSide, cache: false });
  const hpFillMat = cel({ color: RUST, emissive: RUST, emissiveIntensity: 0.75, bands: 2, side: THREE.DoubleSide, cache: false });
  const viewMats = [sashMat, bannerMat, poleMat, hpBackMat, hpFillMat];

  /* one geometry of each, for every enemy in the run.  The sash is a unit
   * box scaled per kind — the band is measured off each rig's own torso. */
  const GEO = {
    sash: new THREE.BoxGeometry(1, 1, 1),
    glow: new THREE.SphereGeometry(0.13, 8, 6),
    pole: new THREE.CylinderGeometry(0.024, 0.028, 0.60, 6),
    cloth: new THREE.PlaneGeometry(0.34, 0.24),
    bar: new THREE.PlaneGeometry(1, 1),
  };

  const instances = new Map();
  const markerList = [];
  const bodyList = [];
  const seen = new Set();
  const NEEDED = ['idle', 'walk', 'run', 'attack', 'hit', 'death'];
  const report = {
    templates: Object.fromEntries([...templates.values()].map((t) => [t.kind, {
      rig: t.rig, torsoBone: t.torso, meshes: t.meshCount, bakedMeshes: t.bakedMeshes,
      clips: NEEDED.filter((n) => t.clipNames.includes(n)),
      missingClips: NEEDED.filter((n) => !t.clipNames.includes(n)),
    }])),
    corrections: { count: 0, total: 0, maxSatDelta: 0 },
    spawned: 0, removed: 0, live: 0, extraMeshes: 0,
  };

  /* ---- find the weapon a telegraph glows on ---------------------- */
  /** The weapon the telegraph glows on.  Searched in the loadout's own
   *  order, because the Knight's props are ['1H_Sword', 'Round_Shield'] and
   *  a traversal takes whichever comes first in the file — which put the
   *  Captain's tell on his shield. */
  function findProp(node, t) {
    const want = RIGS[t.rig]?.props ?? [];
    for (const w of want) {
      let hit = null;
      node.traverse((o) => { if (!hit && o.isMesh && o.geometry && o.name.includes(w)) hit = o; });
      if (hit) return hit;
    }
    let hit = null;
    if (t.procedural) node.traverse((o) => { if (!hit && o.isMesh && /katana|blade|saya/i.test(o.name)) hit = o; });
    return hit;
  }

  /* ---- one enemy ------------------------------------------------- */
  function makeInstance(rec) {
    const t = templates.get(rec.kind);
    // procedural rigs rebuild per instance; KayKit rigs clone (skeleton and all)
    const fresh = t.procedural ? t.make() : null;
    const node = fresh ? fresh.root : cloneSkinned(t.built.root);
    const clips = fresh ? fresh.clips : t.built.clips;
    const inst = {
      id: rec.id, kind: rec.kind, t, root: node,
      mats: [], markers: [], ownsGeometry: !!fresh,
    };
    node.name = `enemy:${rec.id}`;
    node.userData.enemy = rec.id;

    /* per-INSTANCE materials.  celify passes `cache: false`, so every mesh
     * here gets its own — one enemy's tint cannot repaint the rest. */
    const rep = celify(node, cel, { worldSatCap: WORLD_SAT_CAP, ownedAccent: OWNED });
    report.corrections.count += rep.corrections.count;
    report.corrections.total += rep.corrections.total;
    report.corrections.maxSatDelta = Math.max(report.corrections.maxSatDelta, rep.corrections.maxSatDelta);

    /* seeded variety, cosmetic only: scale straight off the record, and a
     * value/hue nudge through the per-instance material colour, which
     * multiplies the baked vertex colours.  Skin and hair keep their hue. */
    const tint = rec.tint ?? 0.5;
    const value = 0.94 + tint * 0.12;                     // +/- 6 % value
    const hueShift = (tint - 0.5) * 0.018;                // ~ +/- 3 degrees, cloth only
    node.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = false;    // a self-shadowing rig on a cel ramp bands into blobs
      const m = o.material;
      if (!m?.userData?.celified || inst.mats.includes(m)) return;
      inst.mats.push(m);
      if (SKIN.test(o.name)) { m.color.multiplyScalar(value); return; }
      m.color.getHSL(_hsl);
      m.color.setHSL((_hsl.h + hueShift + 1) % 1, _hsl.s, clamp(_hsl.l * value, 0, 1));
    });

    /* the sash — the ONE accent every raider wears.  Parented to a torso
     * joint so it rides the body; the joint carries the rig's own
     * normalisation scale and bind rotation, so the hook undoes both and
     * the band can be authored in world metres. */
    const torso = t.torso ? node.getObjectByName(t.torso) : null;
    const hook = new THREE.Group();
    hook.scale.setScalar(1 / (t.boneScale || 1));
    hook.quaternion.copy(t.boneFix);
    const sash = new THREE.Mesh(GEO.sash, sashMat);
    sash.scale.set(t.sash.len, t.sash.band, t.sash.depth);
    sash.rotation.z = 0.55;                    // shoulder to opposite hip
    sash.position.copy(t.sash.offset);
    sash.castShadow = false;
    hook.add(sash);
    (torso ?? node).add(hook);
    if (!torso) hook.position.y = t.height * 0.50;

    /* the telegraph: a glow on the weapon, driven by `record.telegraph`.
     * Located by the prop's GEOMETRY BOUNDS — a weapon's origin is its grip
     * and the read is at the head of the axe or the head of the staff. */
    const teal = rec.kind === 'hexer';
    const glowMat = cel({
      color: teal ? TEAL : RUST, emissive: teal ? TEAL : RUST, emissiveIntensity: 1.0,
      bands: 2, transparent: true, opacity: 0, depthWrite: false, cache: false,
    });
    const glow = new THREE.Mesh(GEO.glow, glowMat);
    glow.castShadow = false;
    glow.visible = false;
    // The Captain's katana is sheathed at rest and his `drawnKatana` group is
    // hidden, so a glow parented to it is a telegraph nobody can see.  A
    // procedural rig gets a chest pulse on the sash hook instead — always in
    // frame, which is what an elite's tell has to be.
    const prop = t.procedural ? null : findProp(node, t);
    if (prop) {
      if (!prop.geometry.boundingBox) prop.geometry.computeBoundingBox();
      const bb = prop.geometry.boundingBox;
      // Located by the GEOMETRY'S BOUNDS, never by the transform: a weapon's
      // origin is its grip (that is where the hand joint holds it), so the
      // bbox CENTRE is inside the haft.  The tell belongs at the business
      // end — the far end of the longest axis, one tenth back from the tip.
      bb.getCenter(glow.position);
      const ext = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z];
      const ax = ext.indexOf(Math.max(...ext));
      const lo = ax === 0 ? bb.min.x : ax === 1 ? bb.min.y : bb.min.z;
      const hi = ax === 0 ? bb.max.x : ax === 1 ? bb.max.y : bb.max.z;
      const far = Math.abs(hi) >= Math.abs(lo) ? hi : lo;
      glow.position.setComponent(ax, far - Math.sign(far) * ext[ax] * 0.10);
      // the prop rides a hand joint, so it carries the rig's scale too
      glow.scale.setScalar(0.85 / (t.boneScale || 1));
      prop.add(glow);
    } else {
      glow.position.copy(t.sash.offset);
      glow.position.z += t.sash.depth * 0.5 + 0.08;
      glow.position.y += t.sash.band * 0.6;
      glow.scale.setScalar(0.72);
      hook.add(glow);
    }
    inst.glow = glow;
    inst.glowMat = glowMat;
    inst.glowBase = glow.scale.x;
    inst.mats.push(glowMat);

    /* the elite marker: a banner over the head and a world-space HP bar,
     * both yaw-billboarded in update().  Only the Captain carries it. */
    if (rec.elite) {
      const top = t.height * (rec.scale ?? 1);
      const banner = new THREE.Group();
      banner.position.y = top + 0.30;
      const pole = new THREE.Mesh(GEO.pole, poleMat);
      pole.position.y = 0.30;
      const cloth = new THREE.Mesh(GEO.cloth, bannerMat);
      cloth.position.set(0.18, 0.47, 0.01);
      banner.add(pole, cloth);
      node.add(banner);

      const bar = new THREE.Group();
      bar.position.y = top + 0.17;
      const back = new THREE.Mesh(GEO.bar, hpBackMat);
      back.scale.set(0.64, 0.082, 1);
      const fill = new THREE.Mesh(GEO.bar, hpFillMat);
      fill.scale.set(0.60, 0.048, 1);
      fill.position.z = 0.008;
      bar.add(back, fill);
      node.add(bar);

      inst.markers.push(pole, cloth, back, fill);
      inst.banner = banner;
      inst.bar = bar;
      inst.fill = fill;
      inst.fillW = 0.60;
    }
    for (const m of inst.markers) { m.userData.marker = true; m.castShadow = false; markerList.push(m); }
    report.extraMeshes += 2 + inst.markers.length;

    node.scale.setScalar(rec.scale ?? 1);
    node.position.set(rec.x, rec.y ?? world?.groundAt?.(rec.x, rec.z, null) ?? 0, rec.z);
    node.rotation.y = rec.heading ?? 0;
    scene.add(node);

    const actor = new Actor({ root: node, clips, meta: t.built.meta, update: fresh?.update ?? null });
    actor.heading = rec.heading ?? 0;
    actor.velocity.set(0, 0, 0);              // the rules own position, not the actor
    inst.actor = actor;
    inst.entry = { id: rec.id, root: node };     // bodies() hands this back; no per-frame alloc
    inst.seq = { ...rec.seq };
    instances.set(rec.id, inst);
    report.spawned += 1;
    return inst;
  }

  function removeInstance(inst) {
    inst.actor.mixer.stopAllAction();
    inst.actor.mixer.uncacheRoot(inst.root);
    inst.root.removeFromParent();
    for (const m of inst.mats) m.dispose();
    // A clone's geometry is the TEMPLATE'S and is shared with every other
    // clone of that kind — disposing it here empties the rest of the wave.
    if (inst.ownsGeometry) inst.root.traverse((o) => { if (o.isMesh) o.geometry?.dispose(); });
    for (const m of inst.markers) {
      const i = markerList.indexOf(m);
      if (i >= 0) markerList.splice(i, 1);
    }
    instances.delete(inst.id);
    report.removed += 1;
  }

  /* ---- per-frame state mapping ----------------------------------- */
  function drive(inst, rec) {
    const a = inst.actor;
    const s = inst.seq;

    if (rec.state === 'dead') {
      if (rec.seq.death !== s.death) { s.death = rec.seq.death; a.setState('death'); }
      if (inst.glow.visible) inst.glow.visible = false;
      if (inst.banner) { inst.banner.visible = false; inst.bar.visible = false; }
      return;
    }
    // one-shots fire on a COUNTER, never on a state: a 0.12 s strike can
    // fall between two render frames, a seq bump cannot
    if (rec.seq.flinch !== s.flinch) { s.flinch = rec.seq.flinch; a.setState('hit'); }
    // the attack clip starts WITH the windup and is time-scaled so its hit
    // frame (50 % of the clip, Actor's own event point) lands on the strike:
    // the swing the player sees is the swing that hits, not one after it
    const winding = rec.state === 'windup' || rec.state === 'cast' || rec.state === 'dashwind';
    if (winding && !s.winding) {
      s.winding = true;
      if (a.setState('attack')) {
        const clip = a.actions.attack.getClip();
        const windup = rec.state === 'cast' ? 0.7 : rec.state === 'dashwind' ? 0.5 : (WINDUP[rec.kind] ?? 0.5);
        a.actions.attack.timeScale = clamp((clip.duration * 0.5) / windup, 0.5, 3.0);
      }
    } else if (!winding && s.winding) { s.winding = false; if (a.actions.attack) a.actions.attack.timeScale = 1; }
    if (rec.seq.dash !== s.dash) { s.dash = rec.seq.dash; }
    s.attack = rec.seq.attack; s.cast = rec.seq.cast;
    s.hit = rec.seq.hit;

    // the windup/cast IS the telegraph: no clip, a glow that grows on
    // `record.telegraph` (0..1) — 0.45-0.7 s of it, the contract's read
    const tel = rec.telegraph ?? 0;
    if (tel > 0.02) {
      inst.glow.visible = true;
      inst.glowMat.opacity = 0.25 + tel * 0.72;
      inst.glow.scale.setScalar(inst.glowBase * (0.55 + tel * 1.05));
    } else if (inst.glow.visible) inst.glow.visible = false;

    // an attacker standing still plays the whole clip; a moving one is cut
    // out of it by the Actor's own lock, which is the intended read
    if (a.state === 'attack' && !rec.moving && rec.state !== 'dash') return;
    if (rec.moving || rec.state === 'dash') {
      const want = (rec.state === 'dash' || rec.running) && a.has('run') ? 'run' : 'walk';
      if (a.setState(want)) {
        const native = (want === 'run' ? NATIVE.run : NATIVE.walk) * (inst.t.height / NATIVE.ref);
        a.actions[want].timeScale = clamp((rec.speed || native) / native, 0.5, 2.2);
      }
    } else a.setState('idle');
  }

  /* ---- the frame ------------------------------------------------- */
  function update(dt, run, camera) {
    if (!run?.enemies) return;
    seen.clear();
    const list = run.enemies;
    for (let i = 0; i < list.length; i += 1) {
      const rec = list[i];
      seen.add(rec.id);
      const inst = instances.get(rec.id) ?? makeInstance(rec);
      const root = inst.root;
      root.position.set(rec.x, rec.y, rec.z);
      root.rotation.y = rec.heading;
      inst.actor.heading = rec.heading;
      inst.actor.velocity.set(0, 0, 0);
      drive(inst, rec);
      inst.actor.update(dt);                 // never skip: lockUntil needs the clock
      if (inst.bar && rec.state !== 'dead') {
        const frac = clamp(rec.hpMax ? rec.hp / rec.hpMax : 1, 0, 1);
        inst.fill.scale.x = inst.fillW * frac;
        inst.fill.position.x = -inst.fillW * (1 - frac) * 0.5;
        if (camera) {
          // yaw-only billboard, expressed in the root's frame (which already
          // carries the record's heading)
          const yaw = Math.atan2(camera.position.x - rec.x, camera.position.z - rec.z) - rec.heading;
          inst.bar.rotation.y = yaw;
          inst.banner.rotation.y = yaw;
        }
      }
    }
    for (const inst of instances.values()) if (!seen.has(inst.id)) removeInstance(inst);
    report.live = instances.size;
  }

  function markers() { return markerList; }

  function bodies() {
    bodyList.length = 0;
    for (const inst of instances.values()) bodyList.push(inst.entry);
    return bodyList;
  }

  function dispose() {
    for (const inst of [...instances.values()]) removeInstance(inst);
    for (const m of viewMats) m.dispose();
    for (const g of Object.values(GEO)) g.dispose();
    for (const t of templates.values()) {
      t.built.root.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry?.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m?.dispose());
      });
    }
    templates.clear();
    markerList.length = 0;
  }

  return { update, markers, bodies, dispose, report };
}
