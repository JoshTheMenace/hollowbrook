// JUICE BOX rules — pure logic, no rendering, no DOM. The renderer and the
// headless gate consume the same class through the fx adapter (the survivors
// architecture, applied to a 60-second score attack).
//
// Determinism is the fairness model: the whole spirit schedule is a pure
// function of the seed. Same seed = the identical puzzle. Gold placement is
// a pure function of seed + PLAY (A5): a replay of identical inputs is
// identical, but a board-blind route cannot pre-script it.
//
// Every number here is declared in LOOP-CONTRACT.md's `constants` block and
// diffed by scripts/check-contract-drift.mjs.

export const COURT = { x0: -8.5, z0: -5, x1: 8.5, z1: 5 };
export const RUN_SECONDS = 60;
export const DASH = { len: 3.2, time: 0.1, recover: 0.45, radius: 0.5 };
export const CHAIN_WINDOW = 1.6;   // seconds between pops that keep the combo
export const SPIRIT = { r: 0.35, ttlMin: 2.9, ttlMax: 3.9, driftMin: 0.35, driftMax: 0.75 };
export const GOLD = { value: 30, comboGain: 1, ttlMin: 2.3, ttlMax: 2.8, distMin: 5, distMax: 7, everyMin: 5.5, everyMax: 7.1 };
export const FINAL_SECONDS = 10;     // the final-10s escalation
export const WINDOWS = { deadAirMax: 1.5 };   // gate windows with units live in the block too (A7)
// A7: a cluster is a line; members this far apart along its orientation.
// The n-th pop multiplier pays only for a sweep ALIGNED with the line
// (within tolDeg of its axis): an off-axis dash that happens to clip two
// members banks two singles and grows nothing. Lines are READ or nothing.
export const CLUSTER = { spacingMin: 1.3, spacingMax: 1.7, tolDeg: 15 };
// A7: the simulation's fixed step (the shell drives Run on this, never on the render dt)
export const SIM_DT = 1 / 120;
// the oni: FREEZES to telegraph, then bites its threat radius; a dash is an
// i-frame through the bite (threat == bite radius, so a telegraph is always
// a real threat to a stationary player and never a surprise)
export const ONI = { r: 0.62, stun: 0.5, telegraph: 0.5, threat: 1.07, cooldown: 1.0, count: 2 };

export const JUICE_EVENTS = [
  'dash', 'pop', 'multi-pop', 'combo-break', 'fade-warning', 'spirit-fade',
  'oni-telegraph', 'oni-hit', 'whiff', 'final-10s', 'timeup',
];

const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const clampCourt = (v, lo, hi) => Math.max(lo + 0.3, Math.min(hi - 0.3, v));

// The seeded schedule: [{t, x, z, vx, vz, ttl}] for the whole run.
// Rhythm: a base drip plus a 3-spirit cluster burst roughly every 7 s —
// the cluster is the risk/reward the contract promises. Gold entries carry
// only a time + ttl + a seeded angle; their position resolves at spawn.
export function makeSchedule(seed) {
  const r = mulberry32(seed);
  const events = [];
  let t = 0.6;
  let nextCluster = 5 + r() * 3;
  const edgeSpawn = () => {
    const side = Math.floor(r() * 4);
    const u = r();
    let x, z;
    if (side === 0) { x = COURT.x0 + 0.2; z = COURT.z0 + u * (COURT.z1 - COURT.z0); }
    else if (side === 1) { x = COURT.x1 - 0.2; z = COURT.z0 + u * (COURT.z1 - COURT.z0); }
    else if (side === 2) { z = COURT.z0 + 0.2; x = COURT.x0 + u * (COURT.x1 - COURT.x0); }
    else { z = COURT.z1 - 0.2; x = COURT.x0 + u * (COURT.x1 - COURT.x0); }
    // drift inward with a slight tangent
    const cx = -x * (0.4 + r() * 0.4), cz = -z * (0.4 + r() * 0.4);
    const len = Math.hypot(cx, cz) || 1;
    const sp = SPIRIT.driftMin + r() * (SPIRIT.driftMax - SPIRIT.driftMin);
    return { x, z, vx: (cx / len) * sp + (r() - 0.5) * 0.2, vz: (cz / len) * sp + (r() - 0.5) * 0.2 };
  };
  while (t < RUN_SECONDS - 1.2) {
    if (t >= nextCluster) {
      // a cluster is a LINE (A7): 3 spirits spaced CLUSTER.spacing apart
      // along one orientation. A 3.2 m dash aligned with the line takes
      // 2-3; from any other angle the 0.85 m sweep takes 1. r2 measured
      // clusters of 3 inside 1.6 m — "lines are not read, they are
      // collected" — so the per-run decision did not exist.
      const base = edgeSpawn();
      const ang = r() * Math.PI * 2;
      const spacing = CLUSTER.spacingMin + r() * (CLUSTER.spacingMax - CLUSTER.spacingMin);
      // keep the whole line on the court: slide the centre inward if needed
      const half = spacing;
      const cx = Math.max(COURT.x0 + 0.3 + Math.abs(Math.cos(ang)) * half, Math.min(COURT.x1 - 0.3 - Math.abs(Math.cos(ang)) * half, base.x));
      const cz = Math.max(COURT.z0 + 0.3 + Math.abs(Math.sin(ang)) * half, Math.min(COURT.z1 - 0.3 - Math.abs(Math.sin(ang)) * half, base.z));
      for (let i = 0; i < 3; i++) {
        events.push({
          t: t + i * 0.12,
          x: cx + Math.cos(ang) * (i - 1) * spacing,
          z: cz + Math.sin(ang) * (i - 1) * spacing,
          vx: base.vx * 0.4, vz: base.vz * 0.4,   // the line drifts as one, slowly — it stays readable
          ttl: SPIRIT.ttlMin + r() * (SPIRIT.ttlMax - SPIRIT.ttlMin),
          line: ang,                               // the axis a sweep must align with
        });
      }
      nextCluster = t + 4.5 + r() * 2;
      t += 0.9 + r() * 0.5;
    } else {
      const ttl = SPIRIT.ttlMin + r() * (SPIRIT.ttlMax - SPIRIT.ttlMin);
      // projected-alive cap: an unpopped board must stay readable
      const alive = events.filter((e) => e.t <= t && e.t + e.ttl > t).length;
      if (alive < 7) events.push({ t, ...edgeSpawn(), ttl });
      t += 0.5 + r() * 0.4;
    }
  }
  // gold: the commitment decision. Position resolves at spawn time relative
  // to the PLAYER (far side, distance band) — see JuiceRun.update.
  for (let gt = 4 + r() * 2; gt < RUN_SECONDS - 3; gt += GOLD.everyMin + r() * (GOLD.everyMax - GOLD.everyMin)) {
    events.push({ t: gt, x: 0, z: 0, vx: 0, vz: 0, ttl: GOLD.ttlMin + r() * (GOLD.ttlMax - GOLD.ttlMin), gold: true, angle: (r() - 0.5) * 1.2, dist: GOLD.distMin + r() * (GOLD.distMax - GOLD.distMin) });
  }
  events.sort((a, b) => a.t - b.t);
  return events;
}

export class JuiceRun {
  constructor({ seed = 1, fx = {} } = {}) {
    this.seed = seed;
    this.fx = fx;
    this.schedule = makeSchedule(seed);
    this.nextSpawn = 0;
    this.time = 0;
    this.score = 0;
    this.combo = 1;
    this.bestCombo = 1;
    this.lastPopAt = -Infinity;
    this.pops = 0;
    this.fades = 0;
    this.dashes = 0;
    this.whiffs = 0;
    this.spirits = [];
    this.pos = { x: 0, z: 0 };
    this.dashUntil = 0;          // dashing while time < dashUntil
    this.dashReadyAt = 0;
    this.dashDir = { x: 0, z: 0 };
    this.over = false;
    this._final10 = false;
    this._dashPops = 0;
    // oni orbs: seeded lissajous patrols — the risk the router routes around
    const orng = mulberry32(seed * 7 + 13);
    this.onis = Array.from({ length: ONI.count }, () => ({
      ax: 5.5 + orng() * 2, az: 3 + orng() * 1.2,
      fx: 0.25 + orng() * 0.2, fz: 0.31 + orng() * 0.2,
      px: orng() * 6.28, pz: orng() * 6.28,
      x: 0, z: 0,
      windupAt: -1,              // telegraph started at (or -1)
      readyAt: 0,                // may telegraph again after this
      paused: 0,                 // patrol time spent frozen in wind-ups
    }));
    this.stunnedUntil = -1;
    this.stuns = 0;
    // A5 instrumentation: what the gates measure
    this.stunnedTime = 0;
    this.comboUptime = 0;        // seconds spent at combo >= 2
  }

  canDash() { return !this.over && this.time >= this.dashReadyAt && this.time >= this.stunnedUntil; }
  dashing() { return this.time < this.dashUntil; }
  stunned() { return this.time < this.stunnedUntil; }

  dash(dx, dz) {
    if (!this.canDash()) return false;
    const l = Math.hypot(dx, dz);
    if (l < 1e-6) return false;
    this.dashDir = { x: dx / l, z: dz / l };
    this.dashUntil = this.time + DASH.time;
    this.dashReadyAt = this.time + DASH.recover;
    this.dashes++;
    this._dashPops = 0;
    this._lineRun = 1;
    this.fx.dash?.({ pos: { ...this.pos }, dir: { ...this.dashDir } });
    return true;
  }

  // gold resolves far from where the player STANDS: across the court in the
  // direction away from them, within the distance band, on the court
  _placeGold(e) {
    const px = this.pos.x, pz = this.pos.z;
    let ax = -px, az = -pz;
    const l = Math.hypot(ax, az);
    if (l < 0.5) { ax = Math.cos(e.angle); az = Math.sin(e.angle); }
    else { ax /= l; az /= l; }
    const ca = Math.cos(e.angle), sa = Math.sin(e.angle);
    const dx = ax * ca - az * sa, dz = ax * sa + az * ca;
    const x = clampCourt(px + dx * e.dist, COURT.x0, COURT.x1);
    const z = clampCourt(pz + dz * e.dist, COURT.z0, COURT.z1);
    return { x, z, vx: -x * 0.05, vz: -z * 0.05 };
  }

  _decayCombo(reason) {
    if (this.combo <= 1) return;
    this.combo -= 1;
    this.fx['combo-break']?.({ reason, to: this.combo });
  }

  update(dt) {
    if (this.over) return;
    this.time += dt;
    if (this.time >= RUN_SECONDS) {
      this.over = true;
      this.fx.timeup?.({ score: this.score, bestCombo: this.bestCombo, pops: this.pops });
      return;
    }
    if (!this._final10 && this.time >= RUN_SECONDS - FINAL_SECONDS) {
      this._final10 = true;
      this.fx['final-10s']?.({});
    }
    if (this.stunned()) this.stunnedTime += dt;
    if (this.combo >= 2) this.comboUptime += dt;
    // spawn
    while (this.nextSpawn < this.schedule.length && this.schedule[this.nextSpawn].t <= this.time) {
      const s = this.schedule[this.nextSpawn++];
      const at = s.gold ? this._placeGold(s) : s;
      this.spirits.push({ x: at.x, z: at.z, vx: at.vx, vz: at.vz, dieAt: this.time + s.ttl, warned: false, gold: !!s.gold, line: s.line });
    }
    // dash movement (swept hits)
    if (this.dashing()) {
      const step = (DASH.len / DASH.time) * dt;
      const nx = this.pos.x + this.dashDir.x * step;
      const nz = this.pos.z + this.dashDir.z * step;
      for (const sp of this.spirits) {
        if (sp.popped) continue;
        if (segCircle(this.pos.x, this.pos.z, nx, nz, sp.x, sp.z, DASH.radius + SPIRIT.r)) {
          sp.popped = true;
          this.pops++;
          // a 2nd+ pop counts as a LINE only when the dash is aligned with
          // the spirit's line axis (A7): reading pays, clipping does not
          let aligned = false;
          if (this._dashPops >= 1 && sp.line !== undefined) {
            const dashAng = Math.atan2(this.dashDir.z, this.dashDir.x);
            // axis-symmetric angular distance to the line (0 when parallel either way)
            const delta = Math.abs((((dashAng - sp.line + Math.PI / 2) % Math.PI) + Math.PI) % Math.PI - Math.PI / 2);
            aligned = delta <= CLUSTER.tolDeg * Math.PI / 180;
          }
          if (this._dashPops >= 1 && aligned) this._lineRun = (this._lineRun ?? 1) + 1;
          this._dashPops++;
          const nth = aligned ? this._lineRun : 1;
          if (this.time - this.lastPopAt > CHAIN_WINDOW) this.combo = 1;
          if (nth >= 2) this.combo += 1;                // READ lines build the combo
          if (sp.gold) this.combo += GOLD.comboGain;    // commitment builds it
          this.bestCombo = Math.max(this.bestCombo, this.combo);
          this.lastPopAt = this.time;
          // A5 repricing: the n-th pop of one ALIGNED sweep is worth 10·n·combo; gold
          // is worth 30·combo — a triple line outpays a solo gold
          const value = sp.gold ? GOLD.value * this.combo : 10 * nth * this.combo;
          this.score += value;
          this.fx.pop?.({ pos: { x: sp.x, z: sp.z }, combo: this.combo, score: this.score, gold: sp.gold, value, nth });
          if (nth >= 2) { this.multiPops = (this.multiPops ?? 0) + 1; this.fx['multi-pop']?.({ pos: { x: sp.x, z: sp.z }, count: nth, value }); }
        }
      }
      this.pos.x = Math.max(COURT.x0, Math.min(COURT.x1, nx));
      this.pos.z = Math.max(COURT.z0, Math.min(COURT.z1, nz));
    } else if (this.dashUntil > 0 && this.time - DASH.time < this.dashUntil && this.time >= this.dashUntil && this._dashPops === 0 && !this._whiffCounted) {
      // a dash just ended with no pop — it gets a READ (r2: 53-62% of inputs landed in silence)
      this._whiffCounted = true;
      this.whiffs++;
      this.fx.whiff?.({ pos: { ...this.pos } });
    }
    if (this.dashing()) this._whiffCounted = false;
    // chain decay: too long since a pop drops the combo (bank behavior)
    if (this.combo > 1 && this.time - this.lastPopAt > CHAIN_WINDOW) {
      this.combo = 1;
      this.fx['combo-break']?.({ reason: 'timer', to: 1 });
    }
    // spirits drift, warn, fade — a fade DECAYS the combo one step (A5)
    for (let i = this.spirits.length - 1; i >= 0; i--) {
      const sp = this.spirits[i];
      if (sp.popped) { this.spirits.splice(i, 1); continue; }
      sp.x += sp.vx * dt;
      sp.z += sp.vz * dt;
      sp.x = Math.max(COURT.x0, Math.min(COURT.x1, sp.x));
      sp.z = Math.max(COURT.z0, Math.min(COURT.z1, sp.z));
      const left = sp.dieAt - this.time;
      if (!sp.warned && left < 1.0) { sp.warned = true; this.fx['fade-warning']?.({ pos: { x: sp.x, z: sp.z } }); }
      if (left <= 0) {
        this.spirits.splice(i, 1);
        this.fades++;
        this._decayCombo('fade');
        this.fx['spirit-fade']?.({ pos: { x: sp.x, z: sp.z } });
      }
    }
    // oni: patrol → telegraph when the player is in threat range → bite.
    // A dash in progress is an i-frame; a stationary player always sees the
    // telegraph first. Never stuns while already stunned.
    for (const o of this.onis) {
      if (o.windupAt >= 0) o.paused += dt;           // frozen while winding up
      const pt = this.time - o.paused;
      o.x = Math.sin(pt * o.fx * 6.28 + o.px) * o.ax;
      o.z = Math.sin(pt * o.fz * 6.28 + o.pz) * o.az;
      const d = Math.hypot(this.pos.x - o.x, this.pos.z - o.z);
      if (o.windupAt < 0) {
        if (this.time >= o.readyAt && d < ONI.threat && !this.stunned()) {
          o.windupAt = this.time;
          this.fx['oni-telegraph']?.({ pos: { x: o.x, z: o.z }, index: this.onis.indexOf(o) });
        }
      } else if (this.time - o.windupAt >= ONI.telegraph) {
        o.windupAt = -1;
        o.readyAt = this.time + ONI.cooldown;
        const bite = d < ONI.threat && !this.dashing() && !this.stunned();
        if (bite) {
          this.stunnedUntil = this.time + ONI.stun;
          this.stuns++;
          this._decayCombo('oni');
          this.fx['oni-hit']?.({ pos: { x: o.x, z: o.z } });
        }
      }
    }
  }

  // A5 gate instrumentation
  stats() {
    const scheduled = this.schedule.length;
    return {
      score: this.score, bestCombo: this.bestCombo, pops: this.pops, fades: this.fades, dashes: this.dashes, whiffs: this.whiffs,
      multiPops: this.multiPops ?? 0,   // the decisive column (r2): lines READ, not collected
      stuns: this.stuns, stunTax: this.stunnedTime / RUN_SECONDS,
      poppedFraction: this.pops / scheduled, comboUptime: this.comboUptime / RUN_SECONDS,
    };
  }
}

function segCircle(x1, z1, x2, z2, cx, cz, r) {
  const dx = x2 - x1, dz = z2 - z1;
  const l2 = dx * dx + dz * dz;
  let t = l2 ? ((cx - x1) * dx + (cz - z1) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const px = x1 + t * dx - cx, pz = z1 + t * dz - cz;
  return px * px + pz * pz <= r * r;
}

// --- bots (for gates; players are humans) ----------------------------------
// Greedy: dash at the nearest live spirit whenever ready.
export function greedyBot(run) {
  if (!run.canDash() || !run.spirits.length) return;
  let best = null, bd = Infinity;
  for (const sp of run.spirits) {
    const d = (sp.x - run.pos.x) ** 2 + (sp.z - run.pos.z) ** 2;
    if (d < bd) { bd = d; best = sp; }
  }
  run.dash(best.x - run.pos.x, best.z - run.pos.z);
}

// Router: the skilled bot. Stays where density is (corridor sweeps among
// NEAR spirits), and commits to gold when it is worth the trip — chain
// preservation by popping often beats heroic cross-court saves. Reads the
// oni's telegraph: a winding-up oni in reach is dodged with a dash.
export function routerBot(run) {
  if (!run.canDash()) return;
  for (const o of run.onis) {
    const d = Math.hypot(run.pos.x - o.x, run.pos.z - o.z);
    if (o.windupAt >= 0 && d < ONI.r + 0.9) {
      let ex = run.pos.x - o.x, ez = run.pos.z - o.z;
      const l = Math.hypot(ex, ez) || 1;
      ex = ex / l - run.pos.x * 0.06;
      ez = ez / l - run.pos.z * 0.06;
      run.dash(ex, ez);
      return;
    }
  }
  if (!run.spirits.length) return;
  // LINE SEEKING: combo grows only on multi-pop dashes, so the skilled move
  // is a dash whose corridor sweeps a PAIR. Enumerate pairs, test whether a
  // single dash from here can take both (aim through the far one).
  {
    let bestPair = null, bestVal = -Infinity;
    const sp = run.spirits;
    for (let i = 0; i < sp.length; i++) {
      for (let j = 0; j < sp.length; j++) {
        if (i === j) continue;
        const a2 = sp[i], b2 = sp[j];
        const dx = b2.x - run.pos.x, dz = b2.z - run.pos.z;
        const l = Math.hypot(dx, dz) || 1;
        if (l > DASH.len + SPIRIT.r) continue;
        const ex = run.pos.x + (dx / l) * DASH.len, ez = run.pos.z + (dz / l) * DASH.len;
        if (!segCircle(run.pos.x, run.pos.z, ex, ez, a2.x, a2.z, DASH.radius + SPIRIT.r)) continue;
        let oniRisk = 0;
        for (const o of run.onis) if (segCircle(run.pos.x, run.pos.z, ex, ez, o.x, o.z, ONI.r + 0.45)) oniRisk++;
        const val = 30 + (a2.gold ? 40 : 0) + (b2.gold ? 40 : 0) - oniRisk * 200 - l * 0.3;
        if (val > bestVal) { bestVal = val; bestPair = { dx, dz }; }
      }
    }
    if (bestPair && bestVal > 0) { run.dash(bestPair.dx, bestPair.dz); return; }
    // no pair sweepable from HERE: read the board for a line and dash to
    // its entry point (behind the near member, on the line's axis) so the
    // next dash sweeps it — the alignment move that makes a line a decision
    // (A7: with lines spaced 1.3-1.7 m, a nearest-target policy collects
    // nothing; the referee must be able to read one)
    let bestEntry = null, bestEntryVal = -Infinity;
    for (let i = 0; i < sp.length; i++) {
      for (let j = i + 1; j < sp.length; j++) {
        const a2 = sp[i], b2 = sp[j];
        const lx = b2.x - a2.x, lz = b2.z - a2.z;
        const L = Math.hypot(lx, lz);
        if (L < 0.8 || L > DASH.len - 0.4) continue;             // not a line, or too long to sweep
        const ux = lx / L, uz = lz / L;
        for (const [near, sgn] of [[a2, -1], [b2, 1]]) {
          const ex = near.x + ux * sgn * 0.9, ez = near.z + uz * sgn * 0.9;   // entry behind the near member
          const d = Math.hypot(ex - run.pos.x, ez - run.pos.z);
          if (d > DASH.len * 1.05 || d < 0.3) continue;
          const dieSoon = Math.min(a2.dieAt, b2.dieAt) - run.time;
          if (dieSoon < DASH.recover + 0.4) continue;             // no time for the two-dash plan
          let oniRisk = 0;
          for (const o of run.onis) if (Math.hypot(o.x - ex, o.z - ez) < ONI.r + 0.9) oniRisk++;
          const val = 20 + (a2.gold || b2.gold ? 30 : 0) - d * 0.5 - oniRisk * 200;
          if (val > bestEntryVal) { bestEntryVal = val; bestEntry = { dx: ex - run.pos.x, dz: ez - run.pos.z }; }
        }
      }
    }
    if (bestEntry && bestEntryVal > 0) { run._entryDashes = (run._entryDashes ?? 0) + 1; run.dash(bestEntry.dx, bestEntry.dz); return; }
  }
  const near = run.spirits.filter((sp) => Math.hypot(sp.x - run.pos.x, sp.z - run.pos.z) <= DASH.len * 1.6);
  const pool = near.length ? near : run.spirits;
  let best = null, bestScore = -Infinity;
  for (const target of pool) {
    const dx = target.x - run.pos.x, dz = target.z - run.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const ex = run.pos.x + (dx / dist) * DASH.len, ez = run.pos.z + (dz / dist) * DASH.len;
    let count = 0, goldOnLine = 0;
    for (const sp of run.spirits) {
      if (segCircle(run.pos.x, run.pos.z, ex, ez, sp.x, sp.z, DASH.radius + SPIRIT.r)) {
        count++;
        if (sp.gold) goldOnLine++;
      }
    }
    let oniRisk = 0;
    for (const o of run.onis) {
      if (segCircle(run.pos.x, run.pos.z, ex, ez, o.x, o.z, ONI.r + 0.45)) oniRisk++;
    }
    const s = count * 12 + goldOnLine * 40 - dist * 0.5 - oniRisk * 200;
    if (s > bestScore) { bestScore = s; best = { dx, dz }; }
  }
  if (best) run.dash(best.dx, best.dz);
}

// Oracle: the router plus SEED KNOWLEDGE — between engagements it
// pre-positions toward spawns arriving in the next ~2.6s (clusters first;
// gold positions are unknowable in advance by design, so only their
// timing is planned around). This is the ORIGINAL planning-headroom
// instrument, restored by A5: it measures whether the DESIGN pays for
// planning, and its number is recorded whatever it is.
export function oracleBot(run) {
  if (!run.canDash()) return;
  const nearNow = run.spirits.some((sp) => Math.hypot(sp.x - run.pos.x, sp.z - run.pos.z) <= DASH.len * 1.35);
  if (nearNow) { routerBot(run); return; }
  const soon = run.schedule.filter((e) => e.t > run.time && e.t < run.time + 2.6 && !e.gold);
  if (soon.length) {
    let wx = 0, wz = 0, w = 0;
    for (const e of soon) {
      const wt = 1 / Math.max(0.3, e.t - run.time);
      wx += e.x * wt; wz += e.z * wt; w += wt;
    }
    const tx = wx / w, tz = wz / w;
    const d = Math.hypot(tx - run.pos.x, tz - run.pos.z);
    if (d > 1.2) { run.dash(tx - run.pos.x, tz - run.pos.z); return; }
  }
  routerBot(run);
}

// Control case for the stun-tax gate: never dashes. Its number is printed,
// never passed — it documents what standing still costs.
export function stillBot() {}

// Actuation-noise wrapper: the measurable form of EXECUTION skill. The same
// policy, played with human imperfections — reaction delay + aim jitter —
// at two profiles.
export function makeNoisy(policy, { delay = 0.25, jitterDeg = 12, seed = 99 } = {}) {
  const r = mulberry32(seed);
  let pendingAt = -1;
  return (run) => {
    if (!run.canDash()) { pendingAt = -1; return; }
    if (pendingAt < 0) { pendingAt = run.time + delay * (0.7 + r() * 0.6); return; }
    if (run.time < pendingAt) return;
    pendingAt = -1;
    const realDash = run.dash.bind(run);
    let chosen = null;
    run.dash = (dx, dz) => { chosen = { dx, dz }; return true; };
    policy(run);
    run.dash = realDash;
    if (!chosen) return;
    const ang = Math.atan2(chosen.dz, chosen.dx) + (r() - 0.5) * 2 * (jitterDeg * Math.PI / 180);
    realDash(Math.cos(ang), Math.sin(ang));
  };
}

export const NOVICE = { delay: 0.34, jitterDeg: 16, seed: 5 };
export const EXPERT = { delay: 0.12, jitterDeg: 4, seed: 5 };
