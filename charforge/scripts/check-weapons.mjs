// Per-frame weapon-state gate with DECLARED acceptance windows. Prints a
// frame table (sampled at GIF rate, 20fps — what the viewer actually sees)
// and fails naming the exact offending frames. A fix counts only when the
// previously-failing frames pass.
//   node scripts/check-weapons.mjs <character>
import * as THREE from 'three';
import { characters } from '../src/characters/index.js';

const FPS = 20;

// Specs. Each rule: { clip, frames: [t0,t1] | 'all', check(state) -> string|null }
// state: per-frame measurements provided by the character's probe config.
const SPECS = {
  brute: {
    probe(root) {
      const mh = root.getObjectByName('maulHead').getWorldPosition(new THREE.Vector3());
      const hand = root.getObjectByName('handR').getWorldPosition(new THREE.Vector3());
      return { haftY: mh.clone().sub(hand).normalize().y, headY: mh.y };
    },
    rules: [
      { clip: 'attack', window: [0.0, 0.36], desc: 'raise: haft never inverted',
        check: (s) => (s.haftY < -0.2 ? `haftY=${s.haftY.toFixed(2)} (inverted during raise)` : null) },
      { clip: 'attack', window: [0.5, 0.56], desc: 'impact: head down (it is a smash)',
        check: (s) => (s.haftY > -0.3 ? `haftY=${s.haftY.toFixed(2)} (no committed impact)` : null) },
      { clip: 'attack', window: [0.72, 1.05], desc: 'recovery: head back UP promptly',
        check: (s) => (s.haftY < 0.25 ? `haftY=${s.haftY.toFixed(2)} (carried upside down)` : null) },
      { clip: 'idle', window: 'all', desc: 'idle: carry head-up',
        check: (s) => (s.haftY < 0.2 ? `haftY=${s.haftY.toFixed(2)}` : null) },
      { clip: 'walk', window: 'all', desc: 'walk: carry head-up',
        check: (s) => (s.haftY < 0.2 ? `haftY=${s.haftY.toFixed(2)}` : null) },
    ],
  },
  archer: {
    probe(root) {
      const bow = root.getObjectByName('bow');
      const q = new THREE.Quaternion(); bow.getWorldQuaternion(q);
      const chord = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      const belly = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      // world tip positions from bow geometry constants (R=0.61, arc=110deg, gripDrop=0.1)
      const R = 0.61, arc = THREE.MathUtils.degToRad(110), gripDrop = 0.1;
      const half = R * Math.sin(arc / 2), zTip = -(R - R * Math.cos(arc / 2));
      let tipMin = Infinity;
      for (const sy of [-1, 1]) {
        const tip = new THREE.Vector3(0, sy * half + gripDrop, zTip);
        bow.localToWorld(tip);
        tipMin = Math.min(tipMin, tip.y);
      }
      // top-tip clearance from the head axis (character space): the limb
      // crossing the face was a shipped regression — now a gated property.
      const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
      const tipT = new THREE.Vector3(0, half + gripDrop, zTip);
      bow.localToWorld(tipT); tipT.applyMatrix4(inv);
      const headClear = Math.max(Math.abs(tipT.x), tipT.z);
      // nocked-arrow naturalness (only meaningful while drawing)
      const arrow = root.getObjectByName('nockArrow');
      let arrowPitch = 0, fletchGap = 0, drawing = false, bellyDotAim = 1, misalignDeg = 0;
      if (arrow && arrow.scale.x > 0.5) {
        drawing = true;
        const aq = new THREE.Quaternion(); arrow.getWorldQuaternion(aq);
        const shaft = new THREE.Vector3(0, 0, 1).applyQuaternion(aq);
        arrowPitch = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(shaft.y, -1, 1)));
        const fletchW = arrow.localToWorld(new THREE.Vector3(0, 0, -0.27));
        const handW = root.getObjectByName('handR').getWorldPosition(new THREE.Vector3());
        fletchGap = fletchW.distanceTo(handW);
        const gripW = bow.getWorldPosition(new THREE.Vector3());
        const aimDir = gripW.sub(handW).normalize();
        bellyDotAim = belly.dot(aimDir);
        misalignDeg = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(bellyDotAim, -1, 1)));
      }
      return { chordTilt: THREE.MathUtils.radToDeg(Math.acos(Math.min(1, Math.abs(chord.y)))), bellyZ: belly.z, tipMin, headClear, tipTY: tipT.y, arrowPitch, fletchGap, drawing, bellyDotAim, misalignDeg };
    },
    rules: [
      { clip: 'idle', window: 'all', desc: 'carry: bow near-vertical',
        check: (s) => (s.chordTilt > 30 ? `chord tilted ${s.chordTilt.toFixed(0)}° from vertical` : null) },
      { clip: 'walk', window: 'all', desc: 'carry: bow near-vertical',
        check: (s) => (s.chordTilt > 32 ? `chord tilted ${s.chordTilt.toFixed(0)}°` : null) },
      { clip: 'idle', window: 'all', desc: 'tips clear the floor',
        check: (s) => (s.tipMin < 0.05 ? `tip at ${s.tipMin.toFixed(2)}m` : null) },
      { clip: 'walk', window: 'all', desc: 'tips clear the floor',
        check: (s) => (s.tipMin < 0.04 ? `tip at ${s.tipMin.toFixed(2)}m` : null) },
      { clip: 'attack', window: 'all', desc: 'draw: bow faces along the draw line (grip-anchor axis)',
        check: (s) => (s.drawing && s.bellyDotAim < 0.9 ? `belly ${s.misalignDeg.toFixed(0)}° off the draw axis` : null) },
      { clip: 'attack', window: 'all', desc: 'tips clear the floor',
        check: (s) => (s.tipMin < 0.04 ? `tip at ${s.tipMin.toFixed(2)}m` : null) },
      { clip: 'attack', window: 'all', desc: 'nocked arrow near-level',
        check: (s) => (s.drawing && Math.abs(s.arrowPitch) > 18 ? `arrow pitched ${s.arrowPitch.toFixed(0)}°` : null) },
      { clip: 'attack', window: 'all', desc: 'arrow nock rides the draw hand',
        check: (s) => (s.drawing && s.fletchGap > 0.07 ? `nock ${s.fletchGap.toFixed(2)}m from the hand` : null) },
      { clip: 'idle', window: 'all', desc: 'upper limb never crosses the face',
        check: (s) => (s.tipTY > 0.95 && s.headClear < 0.28 ? `top tip only ${s.headClear.toFixed(2)}m off the head axis` : null) },
      { clip: 'walk', window: 'all', desc: 'upper limb never crosses the face',
        check: (s) => (s.tipTY > 0.95 && s.headClear < 0.28 ? `top tip only ${s.headClear.toFixed(2)}m off the head axis` : null) },
    ],
  },
  ronin: {
    _prevTipX: null,
    probe(root) {
      const drawn = root.getObjectByName('drawnKatana');
      const sheathed = root.getObjectByName('sheathedKatana');
      const saya = root.getObjectByName('saya');
      const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
      const tipW = root.getObjectByName('bladeTip').getWorldPosition(new THREE.Vector3());
      const tip = tipW.clone().applyMatrix4(inv);
      const hand = root.getObjectByName('handR').getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
      const hips = root.getObjectByName('hips').getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
      const mid = tip.clone().lerp(hand, 0.5);   // blade midpoint (hilt-to-tip)
      const axisDist = (p) => Math.hypot(p.x - hips.x, p.z - hips.z);
      const sq = new THREE.Quaternion(); saya.getWorldQuaternion(sq);
      const sayaDir = new THREE.Vector3(0, 0, 1).applyQuaternion(sq);
      const sayaTilt = THREE.MathUtils.radToDeg(
        Math.acos(THREE.MathUtils.clamp(sayaDir.dot(saya.userData.restDir), -1, 1)));
      const sayaHipDist = saya.getWorldPosition(new THREE.Vector3())
        .distanceTo(root.getObjectByName('hips').getWorldPosition(new THREE.Vector3()));
      const prevTipX = this._prevTipX;
      this._prevTipX = tip.x;
      return {
        drawnVis: drawn.scale.x > 0.5, sheathedVis: sheathed.scale.x > 0.5,
        tipX: tip.x, prevTipX, tipY: tipW.y,
        midDist: axisDist(mid), tipDist: axisDist(tip), sayaTilt, sayaHipDist,
      };
    },
    rules: [
      { clip: 'attack', window: [0, 0.51], desc: 'pre-draw: drawn hidden, sheathed visible',
        check: (s) => (s.drawnVis ? 'drawn katana visible before the draw'
          : !s.sheathedVis ? 'sheathed katana missing before the draw' : null) },
      { clip: 'attack', window: [1.14, 1.4], desc: 'post-sheathe: drawn hidden, sheathed visible',
        check: (s) => (s.drawnVis ? 'drawn katana still visible after re-sheathe'
          : !s.sheathedVis ? 'sheathed katana missing after re-sheathe' : null) },
      { clip: 'attack', window: [0.55, 1.10], desc: 'draw window: drawn visible, sheathed empty',
        check: (s) => (!s.drawnVis ? 'drawn katana missing during the draw'
          : s.sheathedVis ? 'both katanas visible at once' : null) },
      { clip: 'attack', window: [0.58, 0.66], desc: 'slash: bladeTip x sweeps monotonically (+x -> -x)',
        check: (s) => (s.prevTipX == null || s.prevTipX - s.tipX >= 0.02 ? null
          : `tip stalled/backtracked dx=${(s.prevTipX - s.tipX).toFixed(3)}m`) },
      { clip: 'attack', window: 'all', desc: 'blade clear of the body (>=0.15m off spine axis)',
        check: (s) => (s.drawnVis && Math.min(s.midDist, s.tipDist) < 0.15
          ? `blade ${Math.min(s.midDist, s.tipDist).toFixed(2)}m from the spine axis` : null) },
      { clip: 'attack', window: 'all', desc: 'blade tip clear of the floor while drawn',
        check: (s) => (s.drawnVis && s.tipY < 0.05 ? `tip at y=${s.tipY.toFixed(2)}m` : null) },
      { clip: 'idle', window: 'all', desc: 'saya at the hip, near rest angle',
        check: (s) => (s.sayaTilt > 25 ? `saya tilted ${s.sayaTilt.toFixed(0)}° from rest`
          : s.sayaHipDist > 0.30 ? `saya ${s.sayaHipDist.toFixed(2)}m from the hip` : null) },
      { clip: 'walk', window: 'all', desc: 'saya at the hip, near rest angle',
        check: (s) => (s.sayaTilt > 25 ? `saya tilted ${s.sayaTilt.toFixed(0)}° from rest`
          : s.sayaHipDist > 0.30 ? `saya ${s.sayaHipDist.toFixed(2)}m from the hip` : null) },
      { clip: 'attack', window: 'all', desc: 'saya at the hip, near rest angle',
        check: (s) => (s.sayaTilt > 25 ? `saya tilted ${s.sayaTilt.toFixed(0)}° from rest`
          : s.sayaHipDist > 0.30 ? `saya ${s.sayaHipDist.toFixed(2)}m from the hip` : null) },
      { clip: 'idle', window: 'all', desc: 'sheathed katana visible outside the attack',
        check: (s) => (!s.sheathedVis ? 'sheathed katana missing' : s.drawnVis ? 'drawn katana visible in idle' : null) },
      { clip: 'walk', window: 'all', desc: 'sheathed katana visible outside the attack',
        check: (s) => (!s.sheathedVis ? 'sheathed katana missing' : s.drawnVis ? 'drawn katana visible in walk' : null) },

      // run/hit/death never draw — sheathed stays visible, drawn stays hidden.
      ...['run', 'hit', 'death'].map((clip) => ({
        clip, window: 'all', desc: 'sheathed katana visible, never drawn',
        check: (s) => (!s.sheathedVis ? 'sheathed katana missing' : s.drawnVis ? `drawn katana visible in ${clip}` : null),
      })),
      // run/hit keep the character upright, so the saya's world tilt from
      // rest is still a meaningful "still on the hip" signal.
      ...['run', 'hit'].map((clip) => ({
        clip, window: 'all', desc: 'saya at the hip, near rest angle',
        check: (s) => (s.sayaTilt > 25 ? `saya tilted ${s.sayaTilt.toFixed(0)}° from rest`
          : s.sayaHipDist > 0.30 ? `saya ${s.sayaHipDist.toFixed(2)}m from the hip` : null),
      })),
      // death legitimately tips the whole body (and the saya with it, since
      // it's rigidly parented to hips) well past a standing tilt as the
      // character collapses — only check it hasn't slid off the hip.
      { clip: 'death', window: 'all', desc: 'saya still attached at the hip',
        check: (s) => (s.sayaHipDist > 0.30 ? `saya ${s.sayaHipDist.toFixed(2)}m from the hip` : null) },
    ],
  },
  mika: {
    probe(root) {
      const basket = root.getObjectByName('basket');
      const q = new THREE.Quaternion(); basket.getWorldQuaternion(q);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      const tiltDeg = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(up.y, -1, 1)));
      const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
      const bp = basket.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
      const hips = root.getObjectByName('hips').getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
      const axisDist = Math.hypot(bp.x - hips.x, bp.z - hips.z);
      return { tiltDeg, axisDist };
    },
    rules: [
      { clip: 'idle', window: 'all', desc: 'basket stays within 25° of world-up',
        check: (s) => (s.tiltDeg > 25 ? `tilt ${s.tiltDeg.toFixed(0)}°` : null) },
      { clip: 'walk', window: 'all', desc: 'basket stays within 25° of world-up',
        check: (s) => (s.tiltDeg > 25 ? `tilt ${s.tiltDeg.toFixed(0)}°` : null) },
      { clip: 'talk', window: 'all', desc: 'basket stays within 25° of world-up',
        check: (s) => (s.tiltDeg > 25 ? `tilt ${s.tiltDeg.toFixed(0)}°` : null) },
      { clip: 'idle', window: 'all', desc: 'basket clear of the torso axis',
        check: (s) => (s.axisDist < 0.12 ? `only ${s.axisDist.toFixed(2)}m from the torso axis` : null) },
      { clip: 'walk', window: 'all', desc: 'basket clear of the torso axis',
        check: (s) => (s.axisDist < 0.12 ? `only ${s.axisDist.toFixed(2)}m from the torso axis` : null) },
      { clip: 'talk', window: 'all', desc: 'basket clear of the torso axis',
        check: (s) => (s.axisDist < 0.12 ? `only ${s.axisDist.toFixed(2)}m from the torso axis` : null) },
    ],
  },
  elder: {
    probe(root) {
      const handR = root.getObjectByName('handR').getWorldPosition(new THREE.Vector3());
      const tip = root.getObjectByName('caneTip').getWorldPosition(new THREE.Vector3());
      const hips = root.getObjectByName('hips').getWorldPosition(new THREE.Vector3());
      const mid = handR.clone().lerp(tip, 0.5);
      const axisDist = (p) => Math.hypot(p.x - hips.x, p.z - hips.z);
      return { tipY: tip.y, midAxisDist: axisDist(mid), tipAxisDist: axisDist(tip) };
    },
    rules: [
      { clip: 'idle', window: 'all', desc: 'cane tip touches the floor during idle',
        check: (s) => (Math.abs(s.tipY) > 0.05 ? `tip y=${s.tipY.toFixed(3)}` : null) },
      { clip: 'idle', window: 'all', desc: 'cane clear of the body',
        check: (s) => (Math.min(s.midAxisDist, s.tipAxisDist) < 0.05
          ? `cane ${Math.min(s.midAxisDist, s.tipAxisDist).toFixed(2)}m from the body axis` : null) },
    ],
  },
};

const name = process.argv[2];
const spec = SPECS[name];
if (!spec) { console.error(`no weapon spec for '${name}' (have: ${Object.keys(SPECS).join(', ')})`); process.exit(2); }

const mod = await characters[name]();
const built = await mod.build();
const { root, clips } = built;
const mixer = new THREE.AnimationMixer(root);

let failures = 0;
for (const clip of clips) {
  const rules = spec.rules.filter((r) => r.clip === clip.name);
  if (!rules.length) continue;
  const action = mixer.clipAction(clip); action.play();
  const n = Math.max(2, Math.round(clip.duration * FPS));
  const rows = [];
  for (let i = 0; i < n; i++) {
    const t = (clip.duration * i) / n;
    mixer.setTime(Math.min(t, clip.duration - 1e-6));
    root.updateMatrixWorld(true);
    built.update?.(t);
    root.updateMatrixWorld(true);
    const state = spec.probe(root);
    for (const r of rules) {
      const [t0, t1] = r.window === 'all' ? [0, Infinity] : r.window;
      if (t < t0 || t > t1) continue;
      const err = r.check(state);
      if (err) { rows.push(`  ✗ f${i} t=${t.toFixed(2)}s [${r.desc}] ${err}`); failures++; }
    }
  }
  console.log(`${clip.name}: ${rows.length ? 'FAIL' : 'pass'} (${n} frames @ ${FPS}fps)`);
  rows.forEach((r) => console.log(r));
  action.stop();
}
process.exit(failures ? 1 : 0);
