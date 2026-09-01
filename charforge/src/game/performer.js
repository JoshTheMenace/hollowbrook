import * as THREE from 'three';

// Performer — Mira's acting contract driving a CharForge rigid-rig body.
// The plan (already validated by mira's normalizePlan) arrives via direct();
// gestures render as joint offsets applied AFTER the Actor's mixer each
// frame, so idle/talk clips keep breathing underneath the performance.
//
// STATELESS PER FRAME (B3 review r1): each frame, joints the running
// clips do NOT drive are reset to the rest pose, then every offset is
// recomputed from its envelope. Every envelope is zero at p=0 and p>=1,
// so the pose returns to rest by construction; nothing integrates.
//
// BLEND-OUT (B3 review r2): direct() keeps the outgoing gesture running
// with a falling weight for BLEND seconds while the new one rises — both
// are functions of time, so statelessness holds and a mid-envelope line
// advance no longer snaps an arm 126° in one frame.
//
// The rule that made B3 exist: a renderer THROWS on vocabulary it does not
// implement. IMPLEMENTED is the declaration; direct() is the boundary.

const DURATION = {
  nod: 0.65, shake: 0.9, tilt_left: 1.1, tilt_right: 1.1, lean_in: 1.5,
  lean_back: 1.5, small_shrug: 1.1, open_hand: 1.6, wave: 1.8, point: 1.4, bow: 1.5,
};
const BLEND = 0.15;
// rise → hold → fall, 0 at both ends
const plateau = (p) => {
  if (p <= 0 || p >= 1) return 0;
  if (p < 0.3) return smooth(p / 0.3);
  if (p > 0.72) return smooth((1 - p) / 0.28);
  return 1;
};
const arc = (p) => (p <= 0 || p >= 1 ? 0 : Math.sin(Math.PI * p));
const smooth = (t) => t * t * (3 - 2 * t);

// Signed direction of each verb at its peak, checked by the shape gate
// (B3 r2: a Performer playing every verb backwards passed every gate).
// [joint, axis, sign] — sign 'alt' = must move, either way.
export const SHAPE = Object.freeze({
  nod: [['head', 'x', +1]],
  shake: [['head', 'y', 'alt']],
  tilt_left: [['head', 'z', +1]],
  tilt_right: [['head', 'z', -1]],
  lean_in: [['spine', 'x', -1]],
  lean_back: [['spine', 'x', +1]],
  bow: [['spine', 'x', -1], ['head', 'x', +1]],        // torso forward AND head down
  small_shrug: [['shoulderL', 'z', +1], ['shoulderR', 'z', -1]],
  wave: [['upperArmR', 'z', +1]],
  point: [['upperArmR', 'x', -1]],
  open_hand: [['upperArmR', 'x', -1]],
});

export class Performer {
  static IMPLEMENTED = Object.freeze(['none', ...Object.keys(DURATION)]);

  // Construct BEFORE the actor's first update: the joints' current pose is
  // captured as the rest pose that undriven joints return to.
  constructor(actor) {
    this.actor = actor;
    const j = (name) => actor.root.getObjectByName(name);
    this.j = {
      head: j('head'), neck: j('neck'), chest: j('chest'), spine: j('spine'),
      upperArmR: j('upperArmR'), forearmR: j('forearmR'),
      upperArmL: j('upperArmL'), forearmL: j('forearmL'),
      shoulderL: j('shoulderL'), shoulderR: j('shoulderR'),
    };
    this.rest = new Map();
    for (const [name, joint] of Object.entries(this.j)) {
      if (joint) this.rest.set(name, joint.quaternion.clone());
    }
    this._drivenByClip = new Map();   // clip name -> Set of joint names
    this.current = { name: 'none', at: 0, intensity: 0.5, dur: 1 };
    this.prev = null;                 // outgoing gesture during a blend
    this.switchAt = -1;
    this.posture = 'neutral';
    this.gazeTarget = null;           // world-space point to face-track, or null
    this.time = 0;
  }

  // plan: mira normalizePlan output. Throws on unimplemented vocabulary.
  // opts.minDuration: pace the acting to the line (the pose outlives the text).
  direct(plan, { minDuration = 0 } = {}) {
    const g = plan.gesture?.name ?? 'none';
    if (!Performer.IMPLEMENTED.includes(g)) {
      throw new Error(`gesture "${g}" is in the vocabulary but NOT implemented by this performer — implemented: ${Performer.IMPLEMENTED.join(', ')}`);
    }
    if (this.current.name !== 'none' && this.time - this.current.at < this.current.dur) {
      this.prev = this.current;       // still mid-envelope: blend it out
      this.switchAt = this.time;
    } else { this.prev = null; this.switchAt = -1; }
    this.current = { name: g, at: this.time, intensity: plan.gesture?.intensity ?? 0.5, dur: Math.max(DURATION[g] ?? 1, minDuration) };
    this.posture = plan.posture ?? 'neutral';
    return this;
  }

  lookAt(worldPos) { this.gazeTarget = worldPos ? worldPos.clone() : null; }

  // joints owned by any running mixer action this frame (the mixer rewrites
  // those absolutely; everything else must be reset to rest by hand)
  _driven() {
    const out = new Set();
    for (const action of Object.values(this.actor.actions ?? {})) {
      if (!action.isRunning?.() || action.getEffectiveWeight?.() === 0) continue;
      const clip = action.getClip();
      let set = this._drivenByClip.get(clip.name);
      if (!set) {
        set = new Set(clip.tracks.map((t) => t.name.split('.')[0]));
        this._drivenByClip.set(clip.name, set);
      }
      for (const n of set) out.add(n);
    }
    return out;
  }

  // one gesture's offsets at weight k — pure function of (gesture, time)
  _apply(g, k) {
    const { name, at, intensity, dur } = g;
    if (name === 'none' || k <= 0) return 0;
    const el = this.time - at;
    const p = el / dur;
    const a = arc(p) * k, w = plateau(p) * k;
    const I = 0.5 + intensity * 0.9;
    const J = this.j;
    let gazeWeight = 1;
    if (name === 'nod') J.head.rotation.x += a * 0.35 * I;
    else if (name === 'shake') J.head.rotation.y += Math.sin(el * 9) * 0.28 * a * I;
    else if (name === 'tilt_left') J.head.rotation.z += a * 0.28 * I;
    else if (name === 'tilt_right') J.head.rotation.z -= a * 0.28 * I;
    else if (name === 'lean_in') { J.spine.rotation.x -= w * 0.16 * I; J.head.rotation.x += w * 0.06 * I; }
    else if (name === 'lean_back') { J.spine.rotation.x += w * 0.13 * I; J.head.rotation.x -= w * 0.05 * I; }
    else if (name === 'bow') {
      // torso forward AND head down (r2: the head sign was inverted — chin up)
      J.spine.rotation.x -= w * 0.5 * I;
      J.head.rotation.x += w * 0.25 * I;
      gazeWeight = 1 - plateau(p);   // no craning at the player mid-bow
    } else if (name === 'small_shrug') {
      const lift = arc(Math.min(1, p * 1.25)) * k * 0.18 * I;
      if (J.shoulderL) J.shoulderL.rotation.z += lift;
      if (J.shoulderR) J.shoulderR.rotation.z -= lift;
      J.head.rotation.z += lift * 0.4;
    } else if (name === 'wave') {
      J.upperArmR.rotation.z += w * 2.2;          // arm up sideways
      J.forearmR.rotation.z += w * 0.5 + Math.sin(el * 10) * 0.35 * w;
    } else if (name === 'point') {
      J.upperArmR.rotation.x -= w * 1.45 * I;      // forward raise
      J.forearmR.rotation.x -= w * 0.1;
    } else if (name === 'open_hand') {
      J.upperArmR.rotation.x -= w * 0.9 * I;
      J.upperArmR.rotation.z += w * 0.35;
      J.forearmR.rotation.x -= w * 0.3;
    }
    return 1 - gazeWeight;   // how much this gesture damps the gaze
  }

  // call AFTER actor.update(dt) each frame — reset, then stateless offsets
  update(dt) {
    this.time += dt;
    const driven = this._driven();
    for (const [name, quat] of this.rest) {
      if (!driven.has(name)) this.j[name].quaternion.copy(quat);
    }
    let blend = 1;
    if (this.prev) {
      blend = Math.min(1, (this.time - this.switchAt) / BLEND);
      if (blend >= 1) this.prev = null;
    }
    let gazeDamp = 0;
    if (this.prev) gazeDamp = Math.max(gazeDamp, this._apply(this.prev, 1 - blend));
    gazeDamp = Math.max(gazeDamp, this._apply(this.current, blend));
    const J = this.j;
    // sustained posture under everything (stateless too — reapplied per frame)
    if (this.posture === 'lean_in') J.spine.rotation.x -= 0.12;
    else if (this.posture === 'lean_back') J.spine.rotation.x += 0.1;
    // gaze: head yaw/pitch toward a world target, clamped to neck range
    if (this.gazeTarget && J.head && gazeDamp < 1) {
      const gk = 1 - gazeDamp;
      const headPos = J.head.getWorldPosition(new THREE.Vector3());
      const to = this.gazeTarget.clone().sub(headPos);
      const yawWorld = Math.atan2(to.x, to.z);
      let dy = yawWorld - this.actor.heading;
      dy = ((dy + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      J.head.rotation.y += THREE.MathUtils.clamp(dy, -0.7, 0.7) * 0.75 * gk;
      const dist = Math.hypot(to.x, to.z);
      J.head.rotation.x += THREE.MathUtils.clamp(Math.atan2(-to.y, dist), -0.35, 0.45) * 0.6 * gk;
    }
    this.actor.root.updateMatrixWorld(true);
  }

  done() { return this.time - this.current.at >= this.current.dur; }
}
