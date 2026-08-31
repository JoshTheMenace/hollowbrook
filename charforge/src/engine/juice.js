import { audio } from './audio.js';

// The juice bus: gameplay code emits semantic events; ONE config table wires
// each event to sound + particles + shake + hit-stop + text. The lint
// (checkJuice) fails any declared gameplay event with no feedback mapping —
// "silent gameplay" becomes a gated defect, like a floating foot.
export class Juice {
  constructor({ vfx, shake, hitstop, camera }) {
    this.vfx = vfx; this.shake = shake; this.hitstop = hitstop; this.camera = camera;
    this.table = new Map();
    this.log = [];               // bots assert on this
  }

  // wire('hit', { sfx: 'hit', burst: {...}, shake: 0.4, hitstop: 0.06, text: (d) => `${d.amount}` })
  wire(event, fx) { this.table.set(event, fx); }

  emit(event, data = {}) {
    this.log.push({ event, t: performance.now(), data: { ...data, pos: undefined } });
    const fx = this.table.get(event);
    if (!fx) { console.warn(`[juice] UNWIRED event "${event}"`); return false; }
    if (fx.sfx) audio.play(fx.sfx, fx.sfxOpts);
    if (fx.burst && data.pos) this.vfx.burst(data.pos, fx.burst);
    if (fx.shake) this.shake.add(fx.shake);
    if (fx.hitstop) this.hitstop.trigger(fx.hitstop);
    if (fx.text && data.pos) this.vfx.text(data.pos, typeof fx.text === 'function' ? fx.text(data) : fx.text, this.camera, fx.textOpts);
    return true;
  }

  // Lint: every declared event has a mapping, every mapped sfx exists.
  check(declaredEvents) {
    const problems = [];
    for (const e of declaredEvents) {
      const fx = this.table.get(e);
      if (!fx) { problems.push(`event "${e}" has NO juice wiring`); continue; }
      if (!fx.sfx && !fx.burst && !fx.shake && !fx.text) problems.push(`event "${e}" wired but empty`);
      if (fx.sfx && !audio.has(fx.sfx)) problems.push(`event "${e}" references missing sfx "${fx.sfx}"`);
    }
    return problems;
  }
}
