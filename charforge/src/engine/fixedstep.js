// Fixed-timestep simulation driver (campaign rule, juicebox review r2):
// the simulation runs on SIM_DT with an accumulator; render interpolates.
// Nothing gameplay-relevant integrates per render frame. Inputs are
// stamped with the sim tick they land on, so a tick-indexed input tape
// replayed at any frame rate produces byte-identical state.
//
//   const step = new FixedStep({ dt: 1/120, onTick: (tick) => run.update(dt, inputFor(tick)) });
//   frame(rawDt) { step.advance(rawDt); alpha = step.alpha; ...interpolate... }

export class FixedStep {
  constructor({ dt = 1 / 120, maxSteps = 8, onTick } = {}) {
    this.dt = dt;
    this.maxSteps = maxSteps;      // the spiral-of-death cap: a long frame drops time, never runs unbounded
    this.onTick = onTick;
    this.acc = 0;
    this.tick = 0;
    this.alpha = 0;                // fraction of a sim step the render sits past the last tick
    this.dropped = 0;              // seconds discarded by the cap (a number for the gate, not hidden)
  }

  advance(rawDt) {
    this.acc += Math.max(0, rawDt);
    let steps = 0;
    while (this.acc >= this.dt && steps < this.maxSteps) {
      this.onTick?.(this.tick, this.dt);
      this.tick++;
      this.acc -= this.dt;
      steps++;
    }
    if (this.acc >= this.dt) { this.dropped += this.acc - (this.dt - 1e-9); this.acc = this.dt - 1e-9; }
    this.alpha = this.acc / this.dt;
    return steps;
  }

  reset() { this.acc = 0; this.tick = 0; this.alpha = 0; this.dropped = 0; }
}

// A tick-indexed input tape: record what landed on which tick; replay it
// through the same FixedStep at any render cadence.
export class InputTape {
  constructor() { this.events = []; }
  record(tick, input) { this.events.push({ tick, input }); }
  at(tick) { return this.events.filter((e) => e.tick === tick).map((e) => e.input); }
  toJSON() { return this.events; }
  static from(json) { const t = new InputTape(); t.events = json.map((e) => ({ tick: e.tick, input: e.input })); return t; }
}
