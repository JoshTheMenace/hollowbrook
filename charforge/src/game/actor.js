import * as THREE from 'three';
import { characters } from '../characters/index.js';

// Game actor: wraps a CharForge character in a small explicit state machine
// with research-tuned crossfades and speed-synced locomotion.
//
// Instances are created by calling the character's build() fresh each time
// (NOT clone()) — per-frame update() constraints are closures over the built
// nodes, so a fresh build keeps them working per instance.
//
// States: idle | walk | run | attack | hit | death (+talk for NPCs).
// Rules: hit interrupts all but death; attack locks movement; death locks all.
const FADE = {
  'idle->walk': 0.2, 'walk->idle': 0.2,
  'walk->run': 0.18, 'run->walk': 0.18, 'idle->run': 0.15, 'run->idle': 0.2,
  '*->attack': 0.07, 'attack->*': 0.12,
  '*->hit': 0.05, 'hit->*': 0.12,
  '*->death': 0.1,
  '*->talk': 0.2, 'talk->*': 0.2,
};
const fade = (a, b) => FADE[`${a}->${b}`] ?? FADE[`*->${b}`] ?? FADE[`${a}->*`] ?? 0.15;

export class Actor {
  // opts: { walkSpeed (m/s at timeScale 1), runSpeed, turnSpeed (deg/s), name }
  constructor(built, opts = {}) {
    this.root = built.root;
    this.update_ = built.update;
    this.meta = built.meta || {};
    this.opts = { walkSpeed: 1.1, runSpeed: 3.2, turnSpeed: 480, ...opts };
    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = {};
    for (const c of built.clips) this.actions[c.name] = this.mixer.clipAction(c);
    for (const one of ['attack', 'hit', 'death', 'startle']) {
      if (this.actions[one]) {
        this.actions[one].setLoop(THREE.LoopOnce);
        this.actions[one].clampWhenFinished = true;
      }
    }
    this.state = null;
    this.velocity = new THREE.Vector3();
    this.heading = 0;                    // radians, faces +Z at 0
    this.lockUntil = 0;
    this.time = 0;
    this.onEvent = null;                 // (type, actor) callback
    this.attackEventFired = false;
    this.dead = false;
    this.setState('idle', true);
    this.mixer.addEventListener('finished', (e) => {
      if (this.dead) return;
      const name = e.action.getClip().name;
      if (name === 'attack' || name === 'hit' || name === 'startle') this.setState('idle');
    });
  }

  static async spawn(name, opts) {
    const mod = await characters[name]();
    return new Actor(await mod.build(), { name, ...opts });
  }

  has(state) { return !!this.actions[state]; }

  setState(next, force = false) {
    if (this.dead) return false;
    if (!this.actions[next]) return false;
    if (this.state === next && !force) return true;
    if (!force) {
      if (this.time < this.lockUntil && !['hit', 'death'].includes(next)) return false;
    }
    const prev = this.state;
    const from = prev ? this.actions[prev] : null;
    const to = this.actions[next];
    to.reset().play();
    if (from && from !== to) from.crossFadeTo(to, fade(prev, next), false);
    this.state = next;
    if (next === 'attack') {
      this.lockUntil = this.time + Math.min(0.4, to.getClip().duration * 0.55);
      this.attackEventFired = false;
    }
    if (next === 'hit') this.lockUntil = this.time + 0.25;
    if (next === 'death') { this.dead = true; }
    return true;
  }

  // dir: desired world-space move direction (Vector3, y ignored) or null.
  // running: bool. Call every frame.
  move(dir, running, dt) {
    if (this.dead || this.time < this.lockUntil) { this.velocity.set(0, 0, 0); return; }
    const speed = dir ? (running ? this.opts.runSpeed : this.opts.walkSpeed) : 0;
    if (dir && speed > 0) {
      const target = Math.atan2(dir.x, dir.z);
      let d = target - this.heading;
      d = ((d + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const maxTurn = THREE.MathUtils.degToRad(this.opts.turnSpeed) * dt;
      this.heading += THREE.MathUtils.clamp(d, -maxTurn, maxTurn);
      this.root.rotation.y = this.heading;
      this.velocity.set(Math.sin(this.heading), 0, Math.cos(this.heading)).multiplyScalar(speed);
      const wants = running && this.has('run') ? 'run' : 'walk';
      this.setState(wants);
      // speed-synced timeScale: no foot sliding
      const act = this.actions[this.state];
      const native = this.state === 'run' ? this.opts.runSpeed : this.opts.walkSpeed;
      act.timeScale = THREE.MathUtils.clamp(speed / native, 0.5, 2.2);
    } else {
      this.velocity.set(0, 0, 0);
      if (this.state === 'walk' || this.state === 'run') this.setState('idle');
    }
  }

  attack() { return this.setState('attack'); }

  // Hit feedback trio fired together: flash + knockback + interrupt clip.
  hit(fromDir) {
    if (this.dead) return;
    this.flash();
    if (fromDir) {
      const kb = fromDir.clone().setY(0).normalize().multiplyScalar(0.22);
      this.root.position.add(kb);
    }
    if (!this.setState('hit')) this.flash(); // no hit clip: flash still fires
  }

  flash(duration = 0.1) {
    const mats = new Set();
    this.root.traverse((o) => { if (o.isMesh) mats.add(o.material); });
    for (const m of mats) {
      if (m.userData._flashing) continue;
      m.userData._flashing = true;
      const orig = m.color.clone();
      m.color.setRGB(1, 1, 1);
      setTimeout(() => { m.color.copy(orig); m.userData._flashing = false; }, duration * 1000);
    }
  }

  // Landing/impact squash: pure transform hack with overshoot.
  squash(amount = 0.25, dur = 0.2) {
    const s = this.root.scale;
    s.set(1 + amount * 0.7, 1 - amount, 1 + amount * 0.7);
    const start = performance.now();
    const tick = () => {
      const u = Math.min(1, (performance.now() - start) / (dur * 1000));
      const k = 1 + (1 - u) * -amount * Math.cos(u * Math.PI * 2.5) * (1 - u);
      s.set(2 - k, k, 2 - k);
      if (u < 1) requestAnimationFrame(tick); else s.set(1, 1, 1);
    };
    requestAnimationFrame(tick);
  }

  update(dt) {
    this.time += dt;
    this.mixer.update(dt);
    this.root.position.addScaledVector(this.velocity, dt);
    this.root.updateMatrixWorld(true);
    this.update_?.();
    // attack hit-frame event at 50% of the clip
    if (this.state === 'attack' && !this.attackEventFired) {
      const act = this.actions.attack;
      if (act.time > act.getClip().duration * 0.5) {
        this.attackEventFired = true;
        this.onEvent?.('attack-hit', this);
      }
    }
  }
}
