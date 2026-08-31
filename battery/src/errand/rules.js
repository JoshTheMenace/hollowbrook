import { normalizePlan } from '../../../src/contract.js';

// ONE NPC, ONE ERRAND — pure quest logic (battery B3). No THREE, no DOM:
// this file runs identically under the headless gate and the browser shell.
// Fixed authored layout, zero RNG (campaign rule: no player-facing choice
// resolved by randomness — satisfied here by having none at all).
//
// Every acting plan below is normalized through Mira's contract AT MODULE
// LOAD: a line written outside the vocabulary throws before anything ships.

export const ERRAND_EVENTS = [
  'dialogue-open', 'dialogue-line', 'dialogue-close',
  'quest-accept', 'candle-pickup', 'string-dark', 'string-glow', 'lanterns-lit', 'quest-complete',
];
export const STAGES = ['meet', 'find', 'relight', 'return', 'done'];

export const RADIUS = 1.7;
export const LAYOUT = Object.freeze({
  npc: { x: 1.2, z: -2.8 },
  string: { x: -1.0, z: -1.2 },
  candles: [
    { id: 'rack', x: -5.2, z: -1.6 },   // rolled under the bike rack
    { id: 'toro', x: 4.8, z: 0.8 },     // fetched up against the stone lantern
    { id: 'step', x: -0.8, z: -3.6 },   // by the café step
  ],
});

const line = (text, plan = {}) => ({ text, plan: normalizePlan({ speech: text, ...plan }) });

export const SCRIPT = Object.freeze({
  intro: [
    line('Ah — good evening. You picked a dim night to visit us.', { gesture: { name: 'wave', intensity: 0.7 }, emotion: { name: 'happy', intensity: 0.5 } }),
    line('The wind took my candles right off the string. Three of them, gone rolling.', { gesture: { name: 'small_shrug', intensity: 0.65 }, emotion: { name: 'concerned', intensity: 0.6 } }),
    line('Would you find them for me? They cannot have gone far.', { gesture: { name: 'open_hand', intensity: 0.7 }, posture: 'lean_in' }),
    line('The string hangs just there. It should be glowing by now.', { gesture: { name: 'point', intensity: 0.85 } }),
  ],
  remindFind: [
    line('Any luck? One rolled toward the bike rack, I think. Mind the stone lantern too.', { gesture: { name: 'tilt_left', intensity: 0.6 }, emotion: { name: 'concerned', intensity: 0.4 } }),
  ],
  remindRelight: [
    line('All three! Go on then — give the string its light back.', { gesture: { name: 'point', intensity: 0.9 }, emotion: { name: 'excited', intensity: 0.7 }, posture: 'lean_in' }),
  ],
  thanks: [
    line('There it is. The corner looks like itself again.', { gesture: { name: 'nod', intensity: 0.8 }, emotion: { name: 'happy', intensity: 0.8 } }),
    line('Thank you, traveler. Stop by whenever the night runs long.', { gesture: { name: 'bow', intensity: 0.9 } }),
  ],
  epilogue: [
    line('A fine glow, is it not.', { gesture: { name: 'nod', intensity: 0.5 }, posture: 'lean_back', emotion: { name: 'happy', intensity: 0.5 } }),
  ],
});

const dist = (a, x, z) => Math.hypot(a.x - x, a.z - z);

export class ErrandRun {
  constructor(fx) {
    this.fx = fx ?? { emit() {} };
    this.stage = 'meet';            // meet -> find -> relight -> return -> done
    this.candles = new Set();       // collected candle ids
    this.lit = false;
    this.dialogue = null;           // { key, lines, i } while a box is open
  }

  // nearest interactable within reach, or null. Candles only exist as
  // affordances during 'find' (before the ask they are set dressing).
  affordanceAt(x, z) {
    const options = [{ type: 'npc', ...LAYOUT.npc }];
    if (this.stage !== 'meet') options.push({ type: 'string', ...LAYOUT.string });
    if (this.stage === 'find') {
      for (const c of LAYOUT.candles) if (!this.candles.has(c.id)) options.push({ type: 'candle', id: c.id, x: c.x, z: c.z });
    }
    let best = null, bd = RADIUS;
    for (const o of options) { const d = dist(o, x, z); if (d < bd) { bd = d; best = o; } }
    return best;
  }

  interact(x, z) {
    if (this.dialogue) return this.advance();
    const a = this.affordanceAt(x, z);
    if (!a) return null;
    if (a.type === 'npc') {
      const key = { meet: 'intro', find: 'remindFind', relight: 'remindRelight', return: 'thanks', done: 'epilogue' }[this.stage];
      this.dialogue = { key, lines: SCRIPT[key], i: 0 };
      this.fx.emit('dialogue-open', { key });
      this.fx.emit('dialogue-line', { line: this.dialogue.lines[0], i: 0 });
      return { ok: true, type: 'npc', key };
    }
    if (a.type === 'candle') {
      this.candles.add(a.id);
      const count = this.candles.size;
      if (count === 3) this.stage = 'relight';
      this.fx.emit('candle-pickup', { id: a.id, count, all: count === 3, pos: { x: a.x, z: a.z } });
      return { ok: true, type: 'candle', id: a.id, count };
    }
    if (a.type === 'string') {
      if (this.stage === 'relight') {
        this.lit = true;
        this.stage = 'return';
        this.fx.emit('lanterns-lit', { pos: { x: a.x, z: a.z } });
        return { ok: true, type: 'string', lit: true };
      }
      if (this.lit) {   // a burning string is never "dark" (truthful state)
        this.fx.emit('string-glow', { pos: { ...LAYOUT.string } });
        return { ok: true, type: 'string', lit: true };
      }
      this.fx.emit('string-dark', { missing: 3 - this.candles.size, pos: { ...LAYOUT.string } });
      return { ok: true, type: 'string', lit: false };
    }
  }

  advance() {
    const d = this.dialogue;
    if (!d) return null;
    d.i += 1;
    if (d.i < d.lines.length) {
      this.fx.emit('dialogue-line', { line: d.lines[d.i], i: d.i });
      return { ok: true, type: 'line', i: d.i };
    }
    // mutate THEN emit: dialogue-close handlers save and sync UI, so every
    // state change lands before the first handler runs (B3 review r1: the
    // tracker was stale and the save said "meet" at the moment of accept)
    this.dialogue = null;
    if (d.key === 'intro') this.stage = 'find';
    if (d.key === 'thanks') this.stage = 'done';
    this.fx.emit('dialogue-close', { key: d.key });
    if (d.key === 'intro') this.fx.emit('quest-accept', { pos: { ...LAYOUT.npc } });
    if (d.key === 'thanks') this.fx.emit('quest-complete', { pos: { ...LAYOUT.npc } });
    return { ok: true, type: 'close', key: d.key };
  }

  get line() { return this.dialogue ? this.dialogue.lines[this.dialogue.i] : null; }
  done() { return this.stage === 'done'; }

  // Persistence contract: snapshots are taken at stable states (no open
  // dialogue box — the shell closes/never saves mid-line).
  serialize() { return { v: 1, stage: this.stage, candles: [...this.candles].sort(), lit: this.lit }; }
  // A corrupt save yields a FRESH run, never a bricked one: unknown stages
  // and unknown candle ids are rejected wholesale (B3 review r1).
  static restore(snap, fx) {
    const run = new ErrandRun(fx);
    if (!snap || snap.v !== 1 || !STAGES.includes(snap.stage) || !Array.isArray(snap.candles)) return run;
    const known = new Set(LAYOUT.candles.map((c) => c.id));
    if (!snap.candles.every((id) => known.has(id))) return run;
    run.stage = snap.stage;
    run.candles = new Set(snap.candles);
    run.lit = !!snap.lit;
    return run;
  }
}
