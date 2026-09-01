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
        const b = typeof fx.burst === 'function' ? fx.burst(data) : fx.burst;
        if (b && data.pos) this.vfx.burst(data.pos, b); // visuals still land
        return true;
      }
      this._throttle.set(event, now);
    }
    // shake / hitstop / burst may be functions of the event data so a
    // ladder can SCALE with value (juicebox review r1: binary multi-pop,
    // gold pop with zero shake) — magnitude() resolves them the same way
    const val = (v) => (typeof v === 'function' ? v(data) : v);
    if (fx.sfx && this.sfx) this.sfx.play(fx.sfx, val(fx.sfxOpts));
    if (fx.call) fx.call(data);
    const burst = val(fx.burst), shake = val(fx.shake), hitstop = val(fx.hitstop);
    if (burst && data.pos) this.vfx.burst(data.pos, burst);
    if (shake) this.shake.add(shake);
    if (hitstop) this.hitstop.trigger(hitstop);
    if (fx.text && data.pos) {
      const at = fx.textOffset ? data.pos.clone().add(fx.textOffset(data)) : data.pos;
      this.vfx.text(at, val(fx.text), this.camera, fx.textOpts);
    }
    return true;
  }

  update(dt, rawDt) {
    this.shake.update(rawDt ?? dt);
    this.vfx.update(dt, this.camera);
  }

  // Feedback magnitude of one event as wired — a single dimensionless
  // number the ladder gate can order. Sound, shake, hit-stop, particles,
  // text all count; nothing is free.
  magnitude(event, data = {}) {
    const fx = this.table.get(event);
    if (!fx) return 0;
    const opts = typeof fx.sfxOpts === 'function' ? fx.sfxOpts(data) : fx.sfxOpts;
    const vol = fx.sfx ? (opts?.vol ?? 1) : 0;
    const shake = typeof fx.shake === 'function' ? fx.shake(data) : (fx.shake ?? 0);
    const hitstop = typeof fx.hitstop === 'function' ? fx.hitstop(data) : (fx.hitstop ?? 0);
    const burst = typeof fx.burst === 'function' ? fx.burst(data) : fx.burst;
    return vol * 2 + shake * 10 + hitstop * 40 + (burst?.count ?? 0) * 0.08 + (fx.text ? 0.2 : 0);
  }

  // The ladder gate (juicebox review r1): magnitude must be non-decreasing
  // in the value of the moment, and named pairs must hold. steps: ordered
  // by ascending value [{name, event, data, value}]; pairs: [[lo, hi]] by
  // step name where hi must be strictly louder than lo.
  checkLadder(steps, pairs = []) {
    const problems = [];
    const mag = new Map(steps.map((s) => [s.name, this.magnitude(s.event, s.data)]));
    // steps with value == null (e.g. being hit) get a magnitude for the
    // pairs but sit outside the value ordering
    const ordered = steps.filter((s) => s.value != null);
    for (let i = 1; i < ordered.length; i++) {
      const a = ordered[i - 1], b = ordered[i];
      if (b.value > a.value && mag.get(b.name) < mag.get(a.name) - 1e-6) {
        problems.push(`ladder inverted: "${a.name}" (value ${a.value}, mag ${mag.get(a.name).toFixed(2)}) > "${b.name}" (value ${b.value}, mag ${mag.get(b.name).toFixed(2)})`);
      }
    }
    for (const [lo, hi] of pairs) {
      if (!(mag.get(hi) > mag.get(lo))) problems.push(`"${hi}" (mag ${mag.get(hi)?.toFixed(2)}) must outrank "${lo}" (mag ${mag.get(lo)?.toFixed(2)})`);
    }
    return { problems, magnitudes: Object.fromEntries(mag) };
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
