/* ------------------------------------------------------------------ *
 * STEPPER — the fixed-timestep accumulator and the input tape.
 *
 * One class the shell, the referee and the reproducibility gate all
 * drive, so the loop the gates certify is the loop the player runs:
 *   frame(frameDt): acc += frameDt; while (acc >= TICK) { sample input;
 *   run.step(); acc -= TICK }
 * Input is sampled ONCE per tick from a source (`input()`), and every
 * sampled tick is written to a tape keyed by TICK INDEX, never by wall
 * clock.  Replaying a tape feeds the same input on the same tick whatever
 * the frame rate, and the rules cannot see the frame rate at all — so the
 * gate's byte-identical assertion is a real test of the shell, not of the
 * rules alone.
 *
 * Mouse look arrives between ticks as deltas; the shell folds them into
 * the yaw/pitch the tick samples, and renders with the fractional
 * remainder for responsiveness.  The hitscan fires on the tick's yaw.
 * ------------------------------------------------------------------ */
import { TICK } from './rules.js';

export const MAX_TICKS_PER_FRAME = 8;     // 133 ms: a hitch beyond that is dropped, not caught up

export class Stepper {
  constructor(run, { input = null, record = false, tape = null, onTick = null } = {}) {
    this.run = run;
    this.onTick = onTick;                 // (run) after every tick — the shell re-seats the eye
    this.source = input;                  // () => input object for THIS tick
    this.acc = 0;
    this.record = record;
    this.tape = tape;                     // replay: array of [tick, input]
    this.recorded = record ? [] : null;
    this.tapeI = 0;
    this.last = null;                     // last input applied (tape holds diffs only when equal)
    this.alpha = 0;                       // render interpolation fraction
    this.stopTick = Infinity;             // gates compare states at ONE tick, whatever the cadence
  }

  /** Advance by one render frame's worth of wall time. */
  frame(frameDt) {
    this.acc += Math.min(frameDt, TICK * MAX_TICKS_PER_FRAME);
    let ticks = 0;
    while (this.acc >= TICK - 1e-9 && ticks < MAX_TICKS_PER_FRAME && this.run.tick < this.stopTick) {
      this.tickOnce();
      this.acc -= TICK;
      ticks += 1;
    }
    if (this.acc > TICK) this.acc = 0;    // dropped
    this.alpha = this.acc / TICK;
    return ticks;
  }

  tickOnce() {
    const t = this.run.tick;
    let input;
    if (this.tape) {
      while (this.tapeI < this.tape.length && this.tape[this.tapeI][0] < t) this.tapeI += 1;
      if (this.tapeI < this.tape.length && this.tape[this.tapeI][0] === t) { this.last = cloneInput(this.tape[this.tapeI][1]); this.tapeI += 1; }
      else if (this.last) { this.last = { ...this.last, reload: false, interact: false }; }
      input = this.last ?? idle();
    } else {
      input = this.source ? this.source(t) : idle();
      if (this.recorded) this.recorded.push([t, cloneInput(input)]);
    }
    this.run.setInput(input);
    this.run.step();
    this.onTick?.(this.run);
  }

  /** Step N ticks directly (gates and instruments). */
  ticks(n) { for (let i = 0; i < n; i += 1) this.tickOnce(); }
}

export function idle() {
  return { move: { x: 0, z: 0 }, sprint: false, yaw: null, pitch: null, fire: false, charge: false, reload: false, interact: false, interactHeld: false };
}

export function cloneInput(i) {
  return { move: { x: i.move.x, z: i.move.z }, sprint: !!i.sprint, yaw: i.yaw ?? null, pitch: i.pitch ?? null, fire: !!i.fire, charge: !!i.charge, reload: !!i.reload, interact: !!i.interact, interactHeld: !!i.interactHeld };
}
