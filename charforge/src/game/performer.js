import * as THREE from 'three';

// Performer — Mira's acting contract driving a CharForge rigid-rig body.
// The plan (already validated by mira's normalizePlan) arrives via direct();
// gestures render as ADDITIVE joint offsets applied AFTER the Actor's mixer
// each frame, so idle/talk clips keep breathing underneath the performance.
//
// The rule that made B3 exist: a renderer THROWS on vocabulary it does not
// implement. IMPLEMENTED is the declaration; direct() is the boundary.

const DURATION = {
  nod: 0.65, shake: 0.9, tilt_left: 1.1, tilt_right: 1.1, lean_in: 1.5,
  lean_back: 1.5, small_shrug: 1.1, open_hand: 1.6, wave: 1.8, point: 1.4, bow: 1.5,
};

export class Performer {
  static IMPLEMENTED = Object.freeze(['none', ...Object.keys(DURATION)]);

  constructor(actor) {
    this.actor = actor;
    const j = (name) => actor.root.getObjectByName(name);
    this.j = {
      head: j('head'), neck: j('neck'), chest: j('chest'), spine: j('spine'),
      upperArmR: j('upperArmR'), forearmR: j('forearmR'),
      upperArmL: j('upperArmL'), forearmL: j('forearmL'),
      shoulderL: j('shoulderL'), shoulderR: j('shoulderR'),
    };
    this.current = { name: 'none', at: 0, intensity: 0.5 };
    this.posture = 'neutral';
    this.gazeTarget = null;      // world-space point to face-track, or null
    this.time = 0;
  }

  // plan: mira normalizePlan output. Throws on unimplemented vocabulary.
  direct(plan) {
    const g = plan.gesture?.name ?? 'none';
    if (!Performer.IMPLEMENTED.includes(g)) {
      throw new Error(`gesture "${g}" is in the vocabulary but NOT implemented by this performer — implemented: ${Performer.IMPLEMENTED.join(', ')}`);
    }
    this.current = { name: g, at: this.time, intensity: plan.gesture?.intensity ?? 0.5 };
    this.posture = plan.posture ?? 'neutral';
    return this;
  }

  lookAt(worldPos) { this.gazeTarget = worldPos ? worldPos.clone() : null; }

  // call AFTER actor.update(dt) each frame — offsets add onto the mixer pose
  update(dt) {
    this.time += dt;
    const { name, at, intensity } = this.current;
    const el = this.time - at;
    const dur = DURATION[name] ?? 1;
    const p = Math.min(1, el / dur);
    const arc = Math.sin(Math.PI * p);            // rise-and-settle envelope
    const I = 0.5 + intensity * 0.9;
    const J = this.j;
    if (name === 'nod') J.head.rotation.x += arc * 0.35 * I;
    else if (name === 'shake') J.head.rotation.y += Math.sin(el * 9) * 0.28 * arc * I;
    else if (name === 'tilt_left') J.head.rotation.z += arc * 0.28 * I;
    else if (name === 'tilt_right') J.head.rotation.z -= arc * 0.28 * I;
    else if (name === 'lean_in') { J.spine.rotation.x -= arc * 0.16 * I; J.head.rotation.x += arc * 0.06 * I; }
    else if (name === 'lean_back') { J.spine.rotation.x += arc * 0.13 * I; J.head.rotation.x -= arc * 0.05 * I; }
    else if (name === 'bow') { J.spine.rotation.x -= arc * 0.5 * I; J.head.rotation.x -= arc * 0.1; }
    else if (name === 'small_shrug') {
      const lift = Math.sin(Math.PI * Math.min(1, p * 1.6)) * 0.18 * I;
      if (J.shoulderL) J.shoulderL.rotation.z += lift;
      if (J.shoulderR) J.shoulderR.rotation.z -= lift;
      J.head.rotation.z += lift * 0.4;
    } else if (name === 'wave') {
      const w = Math.min(1, p * 2.5);
      J.upperArmR.rotation.z += w * 2.2;          // arm up sideways
      J.forearmR.rotation.z += w * 0.5 + Math.sin(el * 10) * 0.35 * arc;
    } else if (name === 'point') {
      const w = Math.min(1, p * 2);
      J.upperArmR.rotation.x -= w * 1.45 * I;      // forward raise
      J.forearmR.rotation.x -= w * 0.1;
    } else if (name === 'open_hand') {
      const w = Math.min(1, p * 1.8);
      J.upperArmR.rotation.x -= w * 0.9 * I;
      J.upperArmR.rotation.z += w * 0.35;
      J.forearmR.rotation.x -= w * 0.3;
    }
    // sustained posture under everything
    if (this.posture === 'lean_in') J.spine.rotation.x -= 0.12;
    else if (this.posture === 'lean_back') J.spine.rotation.x += 0.1;
    // gaze: head yaw/pitch toward a world target, clamped to neck range
    if (this.gazeTarget && J.head) {
      const headPos = J.head.getWorldPosition(new THREE.Vector3());
      const to = this.gazeTarget.clone().sub(headPos);
      const yawWorld = Math.atan2(to.x, to.z);
      let dy = yawWorld - this.actor.heading;
      dy = ((dy + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      J.head.rotation.y += THREE.MathUtils.clamp(dy, -0.7, 0.7) * 0.75;
      const dist = Math.hypot(to.x, to.z);
      J.head.rotation.x += THREE.MathUtils.clamp(Math.atan2(-to.y, dist), -0.35, 0.45) * 0.6;
    }
    this.actor.root.updateMatrixWorld(true);
  }

  done() { return this.time - this.current.at >= (DURATION[this.current.name] ?? 0); }
}
