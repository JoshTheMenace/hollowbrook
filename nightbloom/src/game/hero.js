import * as THREE from 'three';

// Third-person hero: the starter Walker's PROVEN movement semantics
// (axis-separated stepping, collider pushout, step-height wall refusal)
// driving a CharForge Actor body with an orbit camera.
//
// The Actor's clips/constraints run, but POSITION is owned here — the actor
// root is teleported each frame (same pattern the survivors shell proved).

const RADIUS = 0.34;
const STEP = 0.38;

export class Hero {
  constructor({ actor, camera, canvas, colliders, groundAt, spawn = [0, 0, 0], yaw = 0 }) {
    this.actor = actor;
    this.camera = camera;
    this.canvas = canvas;
    this.colliders = colliders;
    this.groundAt = groundAt;
    this.position = new THREE.Vector3(spawn[0], groundAt(spawn[0], spawn[2]), spawn[2]);
    this.velocity = new THREE.Vector3();
    this.camYaw = yaw;
    this.camPitch = -0.18;
    this.dist = 4.4;
    this.eyeY = this.position.y;
    this.keys = new Set();
    this.virtual = { move: { x: 0, z: 0 }, run: false }; // bot channel
    this.enabled = true;

    this.onKeyDown = (e) => { if (!e.repeat) this.keys.add(e.code); else this.keys.add(e.code); };
    this.onKeyUp = (e) => this.keys.delete(e.code);
    this.onBlur = () => this.keys.clear();
    this.onMouseMove = (e) => {
      if (document.pointerLockElement !== this.canvas) return;
      this.camYaw -= e.movementX * 0.0026;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch - e.movementY * 0.0022, -1.1, 0.5);
    };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('click', () => { if (this.enabled) canvas.requestPointerLock?.(); });
  }

  resolve() {
    for (const c of this.colliders) {
      const x0 = c.x0 - RADIUS, x1 = c.x1 + RADIUS, z0 = c.z0 - RADIUS, z1 = c.z1 + RADIUS;
      if (this.position.x <= x0 || this.position.x >= x1 || this.position.z <= z0 || this.position.z >= z1) continue;
      const d = [this.position.x - x0, x1 - this.position.x, this.position.z - z0, z1 - this.position.z];
      const edge = d.indexOf(Math.min(...d));
      if (edge === 0) this.position.x = x0;
      else if (edge === 1) this.position.x = x1;
      else if (edge === 2) this.position.z = z0;
      else this.position.z = z1;
    }
  }

  stepAxis(axis, delta) {
    const was = this.position[axis];
    this.position[axis] += delta;
    this.resolve();
    const ground = this.groundAt(this.position.x, this.position.z);
    if (ground - this.position.y > STEP) {
      this.position[axis] = was;
      this.resolve();
      return;
    }
    this.position.y = ground;
  }

  moveInput() {
    if (this.virtual.move.x || this.virtual.move.z) {
      return { x: this.virtual.move.x, z: this.virtual.move.z, run: this.virtual.run };
    }
    let f = 0, s = 0;
    if (this.keys.has('KeyW')) f += 1;
    if (this.keys.has('KeyS')) f -= 1;
    if (this.keys.has('KeyD')) s += 1;
    if (this.keys.has('KeyA')) s -= 1;
    if (this.keys.has('ArrowLeft')) this.camYaw += 0.045;
    if (this.keys.has('ArrowRight')) this.camYaw -= 0.045;
    // camera-relative
    const fx = -Math.sin(this.camYaw), fz = -Math.cos(this.camYaw);
    const rx = Math.cos(this.camYaw), rz = -Math.sin(this.camYaw);
    return { x: fx * f + rx * s, z: fz * f + rz * s, run: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') };
  }

  update(dt) {
    if (this.external) {
      // a battle (or cutscene) owns position: derive velocity from the delta
      // so the body still animates, and keep the camera riding
      if (!this._prev) this._prev = this.position.clone();
      this.velocity.set((this.position.x - this._prev.x) / Math.max(dt, 1e-4), 0, (this.position.z - this._prev.z) / Math.max(dt, 1e-4));
      this._prev.copy(this.position);
      this.eyeY += (this.position.y - this.eyeY) * (1 - Math.exp(-20 * dt));
    } else {
      this._prev = null;
      const inp = this.enabled ? this.moveInput() : { x: 0, z: 0, run: false };
      const target = new THREE.Vector3(inp.x, 0, inp.z);
      const speed = inp.run ? 4.6 : 2.3;
      if (target.lengthSq() > 0) target.normalize().multiplyScalar(speed);
      this.velocity.lerp(target, 1 - Math.exp(-12 * dt));
      const steps = Math.max(1, Math.ceil(this.velocity.length() * dt / 0.18));
      for (let i = 0; i < steps; i++) {
        this.stepAxis('x', this.velocity.x * dt / steps);
        this.stepAxis('z', this.velocity.z * dt / steps);
      }
      this.eyeY += (this.position.y - this.eyeY) * (1 - Math.exp(-20 * dt));
    }

    // drive the body
    const a = this.actor;
    if (a) {
      const sp = this.velocity.length();
      if (sp > 0.25) {
        const heading = Math.atan2(this.velocity.x, this.velocity.z);
        let d = heading - a.heading;
        d = ((d + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        a.heading += THREE.MathUtils.clamp(d, -12 * dt, 12 * dt);
        a.root.rotation.y = a.heading;
        const wants = sp > 3.1 && a.has('run') ? 'run' : 'walk';
        if (a.state === 'idle' || a.state === 'walk' || a.state === 'run') a.setState(wants);
        const act = a.actions[a.state];
        if (act && (a.state === 'walk' || a.state === 'run')) {
          const native = a.state === 'run' ? a.opts.runSpeed : a.opts.walkSpeed;
          act.timeScale = THREE.MathUtils.clamp(sp / native, 0.6, 2.2);
        }
      } else if (a.state === 'walk' || a.state === 'run') a.setState('idle');
      a.root.position.copy(this.position);
      a.update(dt);
      a.root.position.copy(this.position); // sim owns position
    }

    // orbit camera with terrain-aware boom
    const cy = this.eyeY + 1.55;
    const bx = this.position.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * this.dist;
    const bz = this.position.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * this.dist;
    let by = cy - Math.sin(this.camPitch) * this.dist;
    const floor = this.groundAt(bx, bz) + 0.35;
    if (by < floor) by = floor;
    this.camera.position.set(bx, by, bz);
    this.camera.lookAt(this.position.x, cy - 0.35, this.position.z);
  }

  place(x, z, camYaw = this.camYaw) {
    this.position.set(x, this.groundAt(x, z), z);
    this.eyeY = this.position.y;
    this.velocity.set(0, 0, 0);
    this.camYaw = camYaw;
    this.update(0.001);
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('mousemove', this.onMouseMove);
  }
}
