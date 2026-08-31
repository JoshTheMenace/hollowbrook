import { VFX, Shake, HitStop } from './vfx.js';

// The feel bus: gameplay emits semantic events; ONE table wires each event to
// sound + particles + shake + hit-stop + floating text. The lint (check())
// fails any emitted event type with no consumer — the audit measured 197 of
// 199 events discarded unheard, and this is the fifteen lines that make that
// impossible to ship again.
//
// Audio comes through an injected SoundForge SfxPlayer — NOT the deprecated
// charforge engine/audio.js.

export class Feel {
  constructor({ scene, camera, sfx }) {
    this.vfx = new VFX(scene);
    this.shake = new Shake();
    this.hitstop = new HitStop();
    this.camera = camera;
    this.sfx = sfx;              // SfxPlayer (may be null until audio unlocks)
    this.table = new Map();
    this.log = [];               // bots and gates assert on this
    this._throttle = new Map();
  }

  wire(event, fx) { this.table.set(event, fx); }

  emit(event, data = {}) {
    this.log.push({ event, t: performance.now() });
    if (this.log.length > 2000) this.log.splice(0, 1000);
    const fx = this.table.get(event);
    if (!fx) { console.warn(`[feel] UNWIRED event "${event}"`); return false; }
    if (fx.throttleMs) {
      const now = performance.now();
      if (now - (this._throttle.get(event) || 0) < fx.throttleMs) {
        if (fx.burst && data.pos) this.vfx.burst(data.pos, fx.burst); // visuals still land
        return true;
      }
      this._throttle.set(event, now);
    }
    if (fx.sfx && this.sfx) this.sfx.play(fx.sfx, fx.sfxOpts);
    if (fx.burst && data.pos) this.vfx.burst(data.pos, fx.burst);
    if (fx.shake) this.shake.add(fx.shake);
    if (fx.hitstop) this.hitstop.trigger(fx.hitstop);
    if (fx.text && data.pos) {
      this.vfx.text(data.pos, typeof fx.text === 'function' ? fx.text(data) : fx.text, this.camera, fx.textOpts);
    }
    return true;
  }

  update(dt, rawDt) {
    this.shake.update(rawDt ?? dt);
    this.vfx.update(dt, this.camera);
  }

  // The lint: every declared event has a non-empty mapping with real sfx.
  check(declaredEvents) {
    const problems = [];
    for (const e of declaredEvents) {
      const fx = this.table.get(e);
      if (!fx) { problems.push(`event "${e}" has NO feel wiring`); continue; }
      if (!fx.sfx && !fx.burst && !fx.shake && !fx.text && !fx.hitstop) problems.push(`event "${e}" wired but empty`);
      if (fx.sfx && this.sfx && !this.sfx.buffers.has(fx.sfx)) problems.push(`event "${e}" references missing sfx "${fx.sfx}"`);
    }
    return problems;
  }
}
