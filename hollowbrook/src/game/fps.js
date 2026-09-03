/* ------------------------------------------------------------------ *
 * FPS — the first-person controller.
 *
 * Movement lives in the rules (rules.js `moveBody`: the walker's own
 * axis-separated stepping, collider push-out with the 0.34 m radius, the
 * 0.38 m step refusal, and the fromY-aware ground query so a walk is
 * walkable ON and UNDER).  This class is the SEAM between the browser and
 * that: it turns pointer-lock mouse deltas and held keys into the per-tick
 * input the stepper samples, and it places the camera from the rules'
 * tick state — interpolated between the last two ticks by the stepper's
 * alpha, with the eye catching up over ~50 ms so a flight of treads reads
 * as a climb, and with the mouse delta not yet consumed by a tick applied
 * to the VIEW so looking never waits for the next tick.  The hitscan
 * resolves on the tick with that tick's yaw.
 *
 * No camera boom, so no occlusion class; the near plane is 0.08 m against
 * a body radius of 0.34, so a wall the player is pressed against is 0.26 m
 * past the plane.
 * ------------------------------------------------------------------ */
import * as THREE from 'three';
import { CONTRACT as C } from './data.js';
import { idle } from './stepper.js';

const EYE = C.player.eye;
const SENS = 0.0022;

export class FirstPerson {
  constructor({ camera, canvas, run }) {
    this.camera = camera;
    this.canvas = canvas;
    this.run = run;
    this.keys = new Set();
    this.mouse = { dx: 0, dy: 0, fire: false, charge: false };
    this.edges = { reload: false, interact: false };
    this.yaw = run.player.yaw;          // the view yaw (tick yaw + pending delta)
    this.pitch = run.player.pitch;
    this.prev = { x: run.player.x, y: run.player.y, z: run.player.z };
    this.cur = { ...this.prev };
    this.eyeY = run.player.y;
    this.shake = null;                  // { offset: Vector3 } from the feel bus
    this.enabled = true;
    this.virtual = null;                // a bot / gate may inject () => input
    this.bind();
  }

  get locked() { return document.pointerLockElement === this.canvas; }
  get active() { return this.locked || document.activeElement === this.canvas; }

  bind() {
    this.onMouseMove = (e) => { if (!this.locked) return; this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; };
    this.onMouseDown = (e) => { if (!this.locked) return; if (e.button === 0) this.mouse.fire = true; if (e.button === 2) this.mouse.charge = true; e.preventDefault(); };
    this.onMouseUp = (e) => { if (e.button === 0) this.mouse.fire = false; if (e.button === 2) this.mouse.charge = false; };
    this.onKeyDown = (e) => {
      if (!this.active) return;
      this.keys.add(e.code);
      if (e.code === 'KeyR' && !e.repeat) this.edges.reload = true;
      if (e.code === 'KeyE' && !e.repeat) this.edges.interact = true;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'KeyE', 'KeyR', 'KeyF'].includes(e.code)) e.preventDefault();
    };
    this.onKeyUp = (e) => this.keys.delete(e.code);
    this.onBlur = () => { this.keys.clear(); this.mouse.fire = false; this.mouse.charge = false; };
    this.onContext = (e) => e.preventDefault();
    document.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.canvas.addEventListener('contextmenu', this.onContext);
  }

  /** The stepper's per-tick input source. */
  input = () => {
    if (this.virtual) return this.virtual();
    const inp = idle();
    // fold the pending mouse delta into the tick yaw; the view has already shown it
    this.yaw -= this.mouse.dx * SENS;
    this.pitch = THREE.MathUtils.clamp(this.pitch - this.mouse.dy * SENS, -1.15, 1.05);
    this.mouse.dx = 0; this.mouse.dy = 0;
    inp.yaw = this.yaw; inp.pitch = this.pitch;
    if (this.active && this.enabled) {
      if (this.keys.has('KeyW')) inp.move.z += 1;
      if (this.keys.has('KeyS')) inp.move.z -= 1;
      if (this.keys.has('KeyD')) inp.move.x += 1;
      if (this.keys.has('KeyA')) inp.move.x -= 1;
      if (this.keys.has('ArrowLeft')) { this.yaw += 0.025; inp.yaw = this.yaw; }
      if (this.keys.has('ArrowRight')) { this.yaw -= 0.025; inp.yaw = this.yaw; }
      inp.sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      inp.fire = this.mouse.fire || this.keys.has('Space');
      inp.charge = this.mouse.charge || this.keys.has('KeyF');
      inp.interactHeld = this.keys.has('KeyE');
    }
    inp.reload = this.edges.reload; inp.interact = this.edges.interact;
    this.edges.reload = false; this.edges.interact = false;
    return inp;
  };

  /** Called by the shell after every tick: remember where the feet were. */
  afterTick() {
    const p = this.run.player;
    this.prev = this.cur;
    this.cur = { x: p.x, y: p.y, z: p.z };
  }

  /** Re-seat after a restore / a death teleport (no interpolation across it). */
  snap() {
    const p = this.run.player;
    this.prev = this.cur = { x: p.x, y: p.y, z: p.z };
    this.eyeY = p.y;
    this.yaw = p.yaw; this.pitch = p.pitch;
  }

  applyCamera(alpha, frameDt) {
    const a = Math.min(1, Math.max(0, alpha));
    const x = this.prev.x + (this.cur.x - this.prev.x) * a;
    const z = this.prev.z + (this.cur.z - this.prev.z) * a;
    const y = this.prev.y + (this.cur.y - this.prev.y) * a;
    // a teleport (death restart, restore) is not interpolated
    if (Math.hypot(this.cur.x - this.prev.x, this.cur.z - this.prev.z) > 3) { this.prev = this.cur; this.eyeY = this.cur.y; }
    this.eyeY += (y - this.eyeY) * (1 - Math.exp(-20 * frameDt));
    // the view shows mouse motion the tick has not consumed yet
    const vyaw = this.yaw - this.mouse.dx * SENS;
    const vpitch = THREE.MathUtils.clamp(this.pitch - this.mouse.dy * SENS, -1.15, 1.05);
    const sh = this.shake?.offset;
    this.camera.position.set(x + (sh?.x ?? 0), this.eyeY + EYE + (sh?.y ?? 0), z);
    this.camera.rotation.set(vpitch, vyaw, (sh ? sh.x * 0.6 : 0), 'YXZ');
  }

  requestLock() {
    this.canvas.focus();
    Promise.resolve(this.canvas.requestPointerLock?.()).catch(() => {});
  }

  dispose() {
    document.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('contextmenu', this.onContext);
  }
}
