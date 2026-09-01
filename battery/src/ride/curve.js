import * as THREE from 'three';
import { Run } from '../../../charforge/src/survivors/systems.js';

// INTENSITY RIDE — the pure layer. The intent curve is the design; every
// system reads it. RideRun wraps the survivors Run with the ride's
// timeline and measures the intensity the player actually experiences so
// the gate can compare shape against shape. No THREE rendering, no DOM.
// Every number here is declared in LOOP-CONTRACT.md's constants block.

export const RIDE_SECONDS = 180;
// [t, intent] — the written curve (see the contract's beat table)
export const CURVE = [
  [0, 0.15], [25, 0.45], [45, 0.30], [70, 0.65], [95, 0.40],
  [120, 0.80], [140, 0.55], [150, 1.00], [172, 0.95], [180, 0.10],
];
// A1: 0.28/1.6 put 8-minute late-game density at 150s on a 2-minute
// character (0/6 survival both profiles) — the ride owns its own scaling
// A4: hold is a swarm not a wall (0.6 / 1.35); bursts LEAD their beat by
// `lead` seconds because spawn→threat→smoothing registers ~4 s late
export const SPAWN = { everyMax: 1.8, everyMin: 0.6, hpScaleMax: 1.35, lead: 4 };
export const TRACK = { minR: 0.75, maxMAE: 0.18, breatherDrop: 0.15, smooth: 3, radius: 8, breather1: 45, breather2: 95, beatErr: 0.2, detrendedR: 0.5 };
export const CAMERA = { combatRange: 12 };
// A7 constants (each item's implementation lands in its own commit)
export const ELITE = { hpMul: 0.55 };                    // §3 the climax is a fight the player can END
export const FLOOR = { min: 3, span: 5 };                // §6 pressure floor: min + intent·span enemies alive
export const MUSIC = { corr: 0.6, driveEnemies: 4 };     // §5 music follows measured pressure
export const REFEREE = { reactionCliffMs: 240 };         // §7 the cliff must sit outside the human band
// A6: the shell drives the sim on this step, never on the render dt
export const SIM_DT = 1 / 120;
export const CLIMAX = { at: 150, minMusic: 0.82, holdUntil: 172 };
// A2 ruling: headroom = damage taken per minute survived, novice / expert,
// expert floored so a near-zero denominator cannot make a vanity ratio
export const HEADROOM = { min: 1.3, floorPerMin: 10 };
export const ARENA = { x0: -12, z0: -1.2, x1: 12, z1: 13 };   // the street in front of the café (clear of the stone lantern)

export const RIDE_EVENTS = [
  'spawn', 'enemy-hit', 'kill', 'elite-spawn', 'elite-kill', 'gem',
  'player-hurt', 'level-up', 'beat', 'victory', 'defeat',
];

export function intentAt(t) {
  if (t <= CURVE[0][0]) return CURVE[0][1];
  for (let i = 1; i < CURVE.length; i++) {
    const [t1, v1] = CURVE[i], [t0, v0] = CURVE[i - 1];
    if (t <= t1) return v0 + (v1 - v0) * ((t - t0) / (t1 - t0));
  }
  return CURVE[CURVE.length - 1][1];
}

// the mix widens with intent: slime → bat → bonehead → imp → wisp. The
// charger (imp) is capped past 0.75 (A3): the hold is a swarm to cut
// through, not a charger gauntlet — novice deaths clustered on charges.
export function mixFor(intent) {
  const mix = { slime: 5 };
  if (intent > 0.25) mix.bat = 2 + intent * 4;
  if (intent > 0.45) mix.bonehead = (intent - 0.45) * 8;
  if (intent > 0.6) mix.imp = Math.min(1.2, (intent - 0.6) * 8);
  if (intent > 0.75) mix.wisp = (intent - 0.75) * 10;
  return mix;
}

export const TIMELINE = {
  length: RIDE_SECONDS,
  at: (t) => {
    const i = intentAt(t);
    // the release means what it says: after the hold, no new spawns
    if (t > CLIMAX.holdUntil) return { spawnEvery: 1e9, mix: { slime: 1 } };
    return { spawnEvery: SPAWN.everyMax + (SPAWN.everyMin - SPAWN.everyMax) * i, mix: mixFor(i) };
  },
  hpScale: (t) => 1 + intentAt(t) * (SPAWN.hpScaleMax - 1),
  // A3: the pushes are scripted BURSTS so they land at any weapon level
  events: [
    { at: 25 - SPAWN.lead, type: 'ring', enemy: 'slime', count: 6, radius: 6 },       // first push
    { at: 70 - SPAWN.lead, type: 'ring', enemy: 'bonehead', count: 5, radius: 7 },    // second push: 30 HP each
    { at: 120 - SPAWN.lead, type: 'ring', enemy: 'bat', count: 24, radius: 7 },       // the surround
    { at: CLIMAX.at - SPAWN.lead, type: 'ring', enemy: 'slime', count: 6, radius: 6 }, // the climax's company arrives first...
    { at: CLIMAX.at, type: 'elite' },                                                 // ...then the elite, on the beat
  ],
};

// measured intensity: what the player is actually under, 0..1, from the
// Run's trailing-window pressure — smoothed so it has the same time
// constant as the felt experience. Weights fixed HERE, before the first
// measurement; they are not tuned to make the gate pass (TRAPS).
export function measure(p) {
  const near = Math.min(1, p.near / 12);
  const hurt = Math.min(1, p.hurt / 30);
  const kills = Math.min(1, p.kills / 10);
  return Math.min(1, 0.55 * near + 0.25 * hurt + 0.2 * kills + (p.elite ? 0.15 : 0));
}

export class RideRun {
  constructor({ fx = {}, rng = Math.random, autoPick = false } = {}) {
    this.fx = fx;
    this.autoPick = autoPick;     // instruments only — players pick their own cards
    this.run = new Run({
      character: 'ronin', rng, bounds: ARENA, timeline: TIMELINE,
      fx: {
        spawn: (e) => fx.emit?.(e.def.elite ? 'elite-spawn' : 'spawn', { e, pos: e.pos, intent: this.intent }),
        hit: (e, dmg, dir) => fx.emit?.('enemy-hit', { e, dmg, dir, pos: e.pos, intent: this.intent }),
        kill: (e) => fx.emit?.(e.def.elite ? 'elite-kill' : 'kill', { e, pos: e.pos, intent: this.intent }),
        despawn: (e) => fx.despawn?.(e),
        gemSpawn: (g) => fx.gemSpawn?.(g),
        gemCollect: (g) => fx.emit?.('gem', { g, pos: g.pos, intent: this.intent }),
        playerHurt: (dmg) => { this.damageTaken += dmg; fx.emit?.('player-hurt', { dmg, pos: this.run.playerPos, intent: this.intent }); },
        levelUp: () => fx.emit?.('level-up', { pos: this.run.playerPos, intent: this.intent }),
        weaponFX: (kind, d) => fx.weaponFX?.(kind, d),
        projSpawn: (p) => fx.projSpawn?.(p),
        projDie: (p) => fx.projDie?.(p),
        victory: () => fx.emit?.('victory', {}),
        defeat: () => fx.emit?.('defeat', {}),
      },
    });
    this.run.playerPos.set(0, 0, 4);
    this.damageTaken = 0;
    this.measured = 0;
    this.samples = [];            // {t, intent, measured} every 0.5 s — the gate's curve
    this._nextSample = 0;
    this._beat = 0;
  }

  get time() { return this.run.time; }
  get intent() { return intentAt(this.run.time); }
  get over() { return this.run.over; }

  update(dt, moveDir) {
    const run = this.run;
    if (run.over) return;
    run.update(dt, moveDir);
    if (this.autoPick) {
      while (run.pendingLevelUps > 0) { run.applyChoice(run.choices()[0]); run.pendingLevelUps--; }
    }
    // EMA toward the instantaneous measurement, τ = TRACK.smooth
    const inst = measure(run.pressure(TRACK.radius, TRACK.smooth));
    this.measured += (inst - this.measured) * (1 - Math.exp(-dt / TRACK.smooth));
    if (run.time >= this._nextSample) {
      this._nextSample += 0.5;
      this.samples.push({ t: run.time, intent: this.intent, measured: this.measured });
    }
    // a keyframe passed: the music's tier boundary is this event's consumer
    while (this._beat < CURVE.length && run.time >= CURVE[this._beat][0]) {
      this.fx.emit?.('beat', { index: this._beat, intent: CURVE[this._beat][1], pos: run.playerPos });
      this._beat++;
    }
  }
}

// --- bots (instruments; players are humans) ---------------------------------
// The campaign's standard survivors referee (charforge simulate-run /
// nightbloom __playCheck): circle-strafe the horde's edge so weapons keep
// hitting, hard-dodge anything within 1.5 m, sweep gems, stay off walls.
const _v = new THREE.Vector3(), _c = new THREE.Vector3();
export function kiteBot(rr) {
  const run = rr.run;
  const P = run.playerPos;
  const move = new THREE.Vector3();
  _c.set(0, 0, 0);
  let n = 0, nearest = Infinity;
  for (const e of run.enemies) {
    if (e.dead) continue;
    const d = e.pos.distanceTo(P);
    nearest = Math.min(nearest, d);
    if (d < 7) { _c.add(e.pos); n++; }
    if (d < 1.5) move.addScaledVector(_v.copy(P).sub(e.pos).setY(0).normalize(), (1.5 - d) * 3.5);
  }
  if (n) {
    _c.multiplyScalar(1 / n);
    const out = _v.copy(P).sub(_c).setY(0).normalize();
    const press = Math.max(-0.35, Math.min(2.5, (3.0 - nearest) / 1.4));   // keep ~3 m off the edge
    move.addScaledVector(out, press);
    move.add(new THREE.Vector3(-out.z, 0, out.x));                          // tangential strafe
  }
  if (run.gems.length) {
    let best = null, bd = Infinity;
    for (const g of run.gems) { const d = g.pos.distanceToSquared(P); if (d < bd) { bd = d; best = g; } }
    move.addScaledVector(_v.copy(best.pos).sub(P).setY(0).normalize(), nearest < 1.8 ? 0.6 : 1.4);
  }
  const b = run.bounds;
  if (Math.min(P.x - b.x0, b.x1 - P.x) < 2.5 || Math.min(P.z - b.z0, b.z1 - P.z) < 2.5) {
    move.addScaledVector(_v.set((b.x0 + b.x1) / 2 - P.x, 0, (b.z0 + b.z1) / 2 - P.z).normalize(), 2.0);
  }
  return move.lengthSq() > 0 ? move.normalize() : null;
}

// Actuation noise for a movement policy: decisions are latched for a
// reaction delay and the heading is jittered — EXECUTION skill, the B1
// taxonomy, applied to a steering verb.
export function makeNoisyMove(policy, { delay = 0.25, jitterDeg = 12, seed = 99 } = {}) {
  const r = mulberry32(seed);
  let held = null, until = -1;
  return (rr) => {
    if (rr.time < until) return held;
    const want = policy(rr);
    until = rr.time + delay * (0.7 + r() * 0.6);
    if (!want) { held = null; return null; }
    const ang = Math.atan2(want.z, want.x) + (r() - 0.5) * 2 * (jitterDeg * Math.PI / 180);
    held = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
    return held;
  };
}
export const NOVICE = { delay: 0.34, jitterDeg: 16, seed: 5 };
export const EXPERT = { delay: 0.12, jitterDeg: 4, seed: 5 };

export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- statistics for the tracking gate ---------------------------------------
export function pearson(a, b) {
  const n = Math.min(a.length, b.length);
  const ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return num / Math.sqrt(da * db || 1);
}
export const mae = (a, b) => a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0) / a.length;
