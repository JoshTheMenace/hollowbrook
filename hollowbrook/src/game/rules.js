/* ------------------------------------------------------------------ *
 * RULES — the siege, pure.
 *
 * No THREE, no DOM, no wall clock, no Math.random: one SiegeRun is a
 * function of (world, seed, the tick-indexed input stream).  The headless
 * referee (sim.js), the reproducibility gate and the browser shell all run
 * THIS object, so what the gates certify is what the player plays.
 *
 * FIXED TIMESTEP.  `step()` advances exactly one TICK (1/60 s).  Nothing
 * in here takes a dt from outside: weapons, projectiles, enemy movement,
 * hit resolution and wave timers all count ticks, and the hitscan resolves
 * on the tick whose input carried the trigger.  The shell's accumulator
 * (stepper.js) decides how many ticks a render frame is worth; the run
 * cannot tell 30 fps from 144 (coordinator directive after the Juice Box
 * review: a dash integrated per render frame delivered 2.13–3.20 m
 * depending on the frame rate, with every gate green at dt = 1/60).
 *
 * Input per tick: { move: {x, z}, sprint, yaw, pitch, fire, charge, reload,
 * interact } — move.z is forward, move.x is strafe right, both in [-1, 1];
 * fire/charge are HELD, reload/interact are edges the shell queues.
 *
 * The player-facing rule (LOOP-CONTRACT): nothing here is resolved by RNG.
 * The seeded generator is used for spawn scatter inside the declared ring
 * and for enemy scale/tint — cosmetic, and the same on every load.
 * ------------------------------------------------------------------ */
import { CONTRACT as C, BODY, SCHEDULES, VARIETY, CORPSE_SECONDS, POISE, HIT_STUN, RECOVER, HEXBOLT_RADIUS, HEXBOLT_RANGE } from './data.js';
import { astar, lineOpen, nearestOpen } from './nav.js';

export const TICK = 1 / 60;
const R = C.player.radius;
const STEP = C.player.step;
const EYE = C.player.eye;
const CHEST = 0.55;                    // fraction of a body's height a bolt is aimed at
const MELEE_SLACK = 0.35;              // a strike lands this far past the declared reach
const SEPARATION = 0.95;               // enemies push apart to this distance
const INTERACT_RANGE = 2.2;
const ACTIVATE_SECONDS = 1.0;          // holding E at a barricade / brazier
const NPC_TALK_RANGE = 2.4;

export const OBJECTIVE_TITLES = Object.freeze({
  'o1-escort-runner': 'Get Mika to the Reeve\'s Hall',
  'o2-barricades': 'Raise the three barricades on the row',
  'o3-relight-wall': 'Relight the four wall braziers',
  'o4-escort-reeve': 'Bring the Reeve up to the Warden\'s Hall',
  'o5-hold-keep': 'Hold the keep until dawn',
  'o6-ring-the-bell': 'Kill the Captain and ring the bell',
});

/** Deterministic PRNG (mulberry32) — the only randomness in the run. */
export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const wrap = (a) => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class SiegeRun {
  constructor(world, { fx = null, seed = 1 } = {}) {
    this.world = world;
    this.fx = fx;
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.tick = 0;
    this.time = 0;
    this.events = [];                  // { tick, name, data } — gates assert on this
    this.phase = 'wave';               // wave | breather | won | lost
    this.waveIndex = 0;
    this.waveTime = 0;
    this.breatherTime = 0;
    this.spawned = 0;
    this.nextId = 1;
    this.lights = C.lights;
    this.lightsLostAt = [];
    this.objectivesDone = [];
    this.objective = null;             // the live objective record
    this.enemies = [];
    this.lances = [];
    this.hexbolts = [];
    this.npcs = [];
    this.dialogue = null;
    this.input = SiegeRun.idleInput();
    this.captainSeen = 0;              // appearances so far
    this.stats = { waves: [], kills: 0, killsByKind: {}, ttk: [], firstHexerDeath: null, captainRetreatAt: null, lancesFired: [], deaths: 0, shots: 0, hits: 0 };
    const [sx, sz] = world.spawn;
    this.player = {
      x: sx, z: sz, y: world.groundAt(sx, sz, null), yaw: world.spawnYaw, pitch: 0,
      hp: C.player.hp, vx: 0, vz: 0, kbx: 0, kbz: 0,
      bolts: C.crossbow.magazine, reloadLeft: 0, fireCd: 0,
      charge: 0, charging: false, lanceCd: 0,
      hurt: [],                        // { dir (radians relative to yaw), left }
      dead: false, sprinting: false, moving: false,
      channel: 0,                      // bell channel progress (s)
      activate: 0,                     // activate-hold progress (s)
    };
    this.checkpoint = null;
    this._buildCast();
    this.startWave(0, { restore: false });
  }

  static idleInput() {
    return { move: { x: 0, z: 0 }, sprint: false, yaw: null, pitch: null, fire: false, charge: false, reload: false, interact: false };
  }

  emit(name, data = {}) {
    this.events.push({ tick: this.tick, name, data });
    if (this.events.length > 4000) this.events.splice(0, 2000);
    this.fx?.emit(name, data, this);      // the run itself: a shell handler may run before construction returns
  }

  get wave() { return C.waves[this.waveIndex]; }
  get alive() { return this.enemies.filter((e) => e.state !== 'dead').length; }
  get captain() { return this.enemies.find((e) => e.kind === 'captain' && e.state !== 'dead') ?? null; }
  get over() { return this.phase === 'won' || this.phase === 'lost'; }

  /** The music contract's pressure term. */
  pressure() {
    const peak = this.wave.peakAlive;
    return C.music.aliveW * Math.min(1, this.alive / peak) + C.music.hpW * (1 - this.player.hp / C.player.hp);
  }

  /* ---------------------------------------------------------------- *
   * cast
   * ---------------------------------------------------------------- */
  _buildCast() {
    const w = this.world;
    for (const p of w.posts) {
      const esc = w.objectives.find((o) => o.kind === 'escort' && o.npc === p.id);
      this.npcs.push({
        id: p.id, character: p.character, name: NPC_NAMES[p.id] ?? p.id,
        x: p.at[0], z: p.at[1], y: w.groundAt(p.at[0], p.at[1], null),
        heading: Math.atan2(p.facing[0], p.facing[1]),
        post: p.at.slice(), postFacing: p.facing.slice(), shelter: p.shelter, fleesTo: p.flees_to ?? null,
        state: 'post', moving: false, running: false, speed: NPC_SPEED[p.character] ?? 1.4,
        path: null, pathI: 0, repath: 0, talking: false, lineSeq: 0,
        escort: esc ? esc.id : null,   // pending escort objective, if any
        performer: p.performer,
      });
    }
  }

  npc(id) { return this.npcs.find((n) => n.id === id); }

  /* ---------------------------------------------------------------- *
   * waves
   * ---------------------------------------------------------------- */
  startWave(index, { restore = false, at = null } = {}) {
    const p = this.player;
    this.phase = 'wave';
    this.waveIndex = index;
    this.waveTime = 0;
    this.spawned = 0;
    this.enemies = [];
    this.lances = [];
    this.hexbolts = [];
    this.dialogue = null;
    this.objective = null;
    p.hp = C.player.hp;
    p.dead = false;
    p.bolts = C.crossbow.magazine;
    p.reloadLeft = 0; p.fireCd = 0; p.charge = 0; p.charging = false; p.lanceCd = 0;
    p.vx = 0; p.vz = 0; p.kbx = 0; p.kbz = 0; p.hurt = []; p.channel = 0; p.activate = 0;
    if (at) { p.x = at[0]; p.z = at[2]; p.y = this.world.groundAt(p.x, p.z, null); }
    this.stats.waves[index] = this.stats.waves[index] ?? { hpEnd: null, pressureSum: 0, ticks: 0, kills: 0, damage: 0, lances: 0, deaths: 0, cleared: false, endedBy: null, firstTick: this.tick, lastKillTick: this.tick, earlyKills: 0, attempts: 0 };
    this.stats.waves[index].attempts += 1;
    this.stats.lancesFired[index] = this.stats.lancesFired[index] ?? 0;
    // the objective o5 (hold the keep) IS wave 6
    if (this.wave.id === 'w6') this.objective = { id: 'o5-hold-keep', kind: 'hold', done: false, started: this.tick };
    for (const n of this.npcs) this._npcWaveSounds(n);
    this.checkpoint = this.serialize('wave-start');
    this.emit('wave-start', { index, id: this.wave.id, name: this.wave.name, restore, pos: this.playerPos() });
  }

  _npcWaveSounds(n) {
    n.talking = false;
    // the runner is caught outside by the first rush (o1 exists because of it)
    if (n.escort && n.escort === this.wave.objective) { n.state = 'post'; return; }
    if (n.fleesTo) { n.state = 'flee'; n.path = astar(this.world.grid, n.x, n.z, n.fleesTo[0], n.fleesTo[1], { fromY: n.y }); n.pathI = 0; n.running = true; return; }
    if (!n.shelter) { n.state = 'post'; return; }
    const pt = this.world.shelterPoint(n.shelter);
    if (!pt) { n.state = 'post'; return; }
    n.state = 'toShelter';
    n.target = pt;
    n.path = astar(this.world.grid, n.x, n.z, pt[0], pt[1], { fromY: n.y });
    n.pathI = 0;
    n.running = n.character === 'mika' || n.character === 'fox';
  }

  _endWave(endedBy) {
    const st = this.stats.waves[this.waveIndex];
    st.hpEnd = this.player.hp;
    st.cleared = true;
    st.endedBy = endedBy;
    // stragglers despawn at the gate (they turn and go)
    this.enemies = [];
    this.lances = [];
    this.hexbolts = [];
    this.emit('wave-cleared', { index: this.waveIndex, id: this.wave.id, name: this.wave.name, pos: this.playerPos(), hp: this.player.hp });
    this._startBreather();
  }

  _startBreather() {
    this.phase = 'breather';
    this.breatherTime = 0;
    const w = this.wave;
    for (const n of this.npcs) this._npcBreather(n);
    this.emit('breather-start', { index: this.waveIndex, seconds: w.breather, pos: this.playerPos() });
    if (w.objective) this._startObjective(w.objective);
  }

  _npcBreather(n) {
    if (n.state === 'flee' || n.state === 'post') { n.state = n.state === 'flee' ? 'toPost' : 'post'; }
    else n.state = 'toPost';
    if (n.state === 'toPost') {
      n.path = astar(this.world.grid, n.x, n.z, n.post[0], n.post[1], { fromY: n.y });
      n.pathI = 0;
      n.running = false;
    }
  }

  _startObjective(id) {
    const def = this.world.objectives.find((o) => o.id === id);
    const o = { id, kind: def.kind, def, done: false, failed: false, started: this.tick, progress: 0, points: [], npc: null, title: OBJECTIVE_TITLES[id] };
    if (def.kind === 'activate') o.points = def.points.map((p) => ({ x: p[0], z: p[1], done: false }));
    if (def.kind === 'escort') {
      const n = this.npc(def.npc);
      o.npc = n.id;
      n.state = 'escort';
      n.escortTo = def.to.slice();
      n.path = null;
      n.talking = false;
    }
    this.objective = o;
    this.emit('objective-start', { id, kind: def.kind, title: o.title, pos: this.playerPos(), npc: o.npc });
    // the Reeve briefs every objective; Mika speaks for her own
    const speaker = id === 'o1-escort-runner' ? 'runner' : 'reeve';
    this.openDialogue(speaker, `brief:${id}`);
  }

  _completeObjective() {
    const o = this.objective;
    o.done = true;
    if (!this.objectivesDone.includes(o.id)) this.objectivesDone.push(o.id);
    if (o.kind === 'escort') {
      const n = this.npc(o.npc);
      n.state = 'post';
      n.post = o.def.to.slice();           // escorted NPCs live where they were taken
      n.shelter = o.def.shelter ?? n.shelter;
      n.escort = null;
      n.x = clamp(n.x, o.def.to[0] - 3, o.def.to[0] + 3);
      this.emit('npc-sheltered', { id: n.id, name: n.name, pos: { x: n.x, y: n.y, z: n.z } });
    }
    // mutate THEN emit (errand review r1): the save the shell writes on this
    // event must already say the objective is done
    this.checkpoint = this.serialize('breather-done');
    // the payoff lands where the eye is: on the NPC for an escort, at the last point for an activate
    const n = o.kind === 'escort' ? this.npc(o.npc) : null;
    const pos = n ? { x: n.x, y: n.y + 1.3, z: n.z } : this.playerPos();
    this.emit('objective-done', { id: o.id, title: o.title, pos });
    this.openDialogue(o.id === 'o1-escort-runner' ? 'runner' : 'reeve', `done:${o.id}`);
  }

  /* ---------------------------------------------------------------- *
   * dialogue — a light state machine the shell renders; E advances
   * ---------------------------------------------------------------- */
  openDialogue(npcId, key) {
    const n = this.npc(npcId);
    if (!n) return;
    const lines = SCRIPT[key];
    if (!lines || !lines.length) return;
    this.dialogue = { npc: npcId, key, i: 0, lines, ticks: 0 };
    n.talking = true;
    n.lineSeq += 1;
    this.emit('dialogue-open', { npc: npcId, key, name: n.name });
    this.emit('dialogue-line', { npc: npcId, key, i: 0, line: lines[0], name: n.name });
  }

  advanceDialogue() {
    const d = this.dialogue;
    if (!d) return;
    d.i += 1;
    d.ticks = 0;
    const n = this.npc(d.npc);
    if (d.i < d.lines.length) {
      n.lineSeq += 1;
      this.emit('dialogue-line', { npc: d.npc, key: d.key, i: d.i, line: d.lines[d.i], name: n.name });
      return;
    }
    this.dialogue = null;
    n.talking = false;
    this.emit('dialogue-close', { npc: d.npc, key: d.key });
  }

  /* ---------------------------------------------------------------- *
   * persistence
   * ---------------------------------------------------------------- */
  serialize(at = 'wave-start') {
    const p = this.player;
    return {
      v: C.save.v,
      // at 'breather-done' the save names the wave the run will START next
      wave: at === 'breather-done' ? Math.min(C.waves.length, this.waveIndex + 2) : this.waveIndex + 1,
      lights: this.lights,
      hp: C.player.hp,
      objectivesDone: this.objectivesDone.slice(),
      lightsLostAt: this.lightsLostAt.slice(),
      player: [round3(p.x), round3(p.y), round3(p.z)],
      yaw: round3(p.yaw),
      at,
    };
  }

  /** A corrupt or foreign save yields a FRESH run, never a bricked one. */
  static validSave(s, world) {
    if (!s || typeof s !== 'object' || s.v !== C.save.v) return false;
    if (!Number.isInteger(s.wave) || s.wave < 1 || s.wave > C.waves.length) return false;
    if (!Number.isInteger(s.lights) || s.lights < 1 || s.lights > C.lights) return false;
    if (!Array.isArray(s.objectivesDone) || !s.objectivesDone.every((id) => OBJECTIVE_TITLES[id])) return false;
    if (!Array.isArray(s.lightsLostAt) || !s.lightsLostAt.every((id) => C.waves.some((w) => w.id === id))) return false;
    if (!Array.isArray(s.player) || s.player.length !== 3 || !s.player.every((v) => typeof v === 'number' && Number.isFinite(v))) return false;
    if (typeof s.yaw !== 'number' || !Number.isFinite(s.yaw)) return false;
    if (s.at !== 'wave-start' && s.at !== 'breather-done') return false;
    const r = world.rect;
    if (s.player[0] < r.x0 || s.player[0] > r.x1 || s.player[2] < r.z0 || s.player[2] > r.z1) return false;
    // lights lost must agree with the count, and a done objective must belong to an earlier wave
    if (s.lightsLostAt.length !== C.lights - s.lights) return false;
    for (const id of s.objectivesDone) {
      const wi = C.waves.findIndex((w) => w.objective === id);
      if (wi < 0 || wi >= s.wave - 1) return false;
    }
    return true;
  }

  static restore(snap, world, opts = {}) {
    const run = new SiegeRun(world, opts);
    if (!SiegeRun.validSave(snap, world)) return run;
    run.lights = snap.lights;
    run.lightsLostAt = snap.lightsLostAt.slice();
    run.objectivesDone = snap.objectivesDone.slice();
    // escorted NPCs live where they were taken
    for (const id of run.objectivesDone) {
      const def = world.objectives.find((o) => o.id === id);
      if (def?.kind !== 'escort') continue;
      const n = run.npc(def.npc);
      n.post = def.to.slice(); n.shelter = def.shelter ?? n.shelter; n.escort = null;
      n.x = def.to[0]; n.z = def.to[1]; n.y = world.groundAt(n.x, n.z, null);
    }
    run.player.yaw = snap.yaw;
    run.startWave(snap.wave - 1, { restore: true, at: snap.player });
    return run;
  }

  /** The comparable projection: what "the same state" means across a reload. */
  checkpointState() {
    const cp = this.checkpoint;
    return {
      wave: cp.wave, lights: this.lights, objectivesDone: this.objectivesDone.slice(),
      lightsLostAt: this.lightsLostAt.slice(), player: cp.player.slice(), yaw: cp.yaw,
    };
  }

  /** Every number that matters, for the reproducibility gate's byte-diff. */
  stateHash() {
    const p = this.player;
    const parts = [this.tick, this.phase, this.waveIndex, r3(this.waveTime), r3(this.breatherTime), this.spawned, this.lights,
      r3(p.x), r3(p.z), r3(p.y), r3(p.yaw), r3(p.pitch), r3(p.hp), p.bolts, r3(p.reloadLeft), r3(p.charge), r3(p.lanceCd),
      this.objectivesDone.join(','), this.objective ? `${this.objective.id}:${this.objective.done}:${this.objective.points.filter((q) => q.done).length}` : '-',
      this.stats.kills, this.stats.shots, this.stats.hits];
    for (const e of this.enemies) parts.push(e.id, e.kind, r3(e.x), r3(e.z), r3(e.hp), e.state, e.seq.hit, e.seq.attack);
    for (const l of this.lances) parts.push(r3(l.x), r3(l.z), r3(l.y), l.hits.length);
    for (const h of this.hexbolts) parts.push(r3(h.x), r3(h.z));
    for (const n of this.npcs) parts.push(n.id, r3(n.x), r3(n.z), n.state);
    return fnv1a(parts.join('|'));
  }

  /* ---------------------------------------------------------------- *
   * input + the tick
   * ---------------------------------------------------------------- */
  setInput(input) { this.input = input; }
  playerPos() { const p = this.player; return { x: p.x, y: p.y, z: p.z }; }

  step() {
    if (this.over) { this.tick += 1; this.time += TICK; return; }
    const inp = this.input;
    const p = this.player;
    if (inp.yaw !== null && inp.yaw !== undefined) p.yaw = inp.yaw;
    if (inp.pitch !== null && inp.pitch !== undefined) p.pitch = clamp(inp.pitch, -1.15, 1.05);
    if (this.dialogue) this.dialogue.ticks += 1;
    if (inp.interact) this._interact();
    this._movePlayer(inp);
    this._weapons(inp);
    if (this.phase === 'wave') this._waveTick();
    else if (this.phase === 'breather') this._breatherTick();
    this._projectiles();
    for (const n of this.npcs) this._npcTick(n);
    for (const h of p.hurt) h.left -= TICK;
    p.hurt = p.hurt.filter((h) => h.left > 0);
    if (p.hp <= 0 && !p.dead) this._playerDies();
    this.tick += 1;
    this.time += TICK;
    // a per-tick edge is consumed
    inp.reload = false; inp.interact = false;
  }

  /* ---- player movement: the walker's own numbers ---- */
  _movePlayer(inp) {
    const p = this.player;
    if (p.dead) return;
    const speed = p.charging ? C.player.charging : inp.sprint && inp.move.z > 0.2 ? C.player.sprint : C.player.walk;
    p.sprinting = speed === C.player.sprint;
    const fx = -Math.sin(p.yaw); const fz = -Math.cos(p.yaw);
    const rx = Math.cos(p.yaw); const rz = -Math.sin(p.yaw);
    let tx = fx * inp.move.z + rx * inp.move.x;
    let tz = fz * inp.move.z + rz * inp.move.x;
    const l = Math.hypot(tx, tz);
    if (l > 1e-6) { tx = tx / l * speed; tz = tz / l * speed; }
    else { tx = 0; tz = 0; }
    const k = 1 - Math.exp(-12 * TICK);
    p.vx += (tx - p.vx) * k; p.vz += (tz - p.vz) * k;
    p.moving = l > 1e-6;
    // knockback decays fast, on top of the walk
    const dx = (p.vx + p.kbx) * TICK; const dz = (p.vz + p.kbz) * TICK;
    p.kbx *= Math.exp(-8 * TICK); p.kbz *= Math.exp(-8 * TICK);
    moveBody(this.world, p, dx, dz, R);
  }

  /* ---- weapons ---- */
  _weapons(inp) {
    const p = this.player;
    if (p.dead) { p.charging = false; p.charge = 0; return; }
    if (p.fireCd > 0) p.fireCd -= TICK;
    if (p.lanceCd > 0) p.lanceCd -= TICK;
    if (p.reloadLeft > 0) {
      p.reloadLeft -= TICK;
      if (p.reloadLeft <= 0) { p.reloadLeft = 0; p.bolts = C.crossbow.magazine; }
    }
    if (inp.reload && p.reloadLeft === 0 && p.bolts < C.crossbow.magazine) {
      p.reloadLeft = C.crossbow.reload;
      this.emit('reload', { pos: this.playerPos() });
    }
    // the lance: hold to charge, release at full charge to fire
    if (inp.charge && p.lanceCd <= 0 && p.reloadLeft === 0) {
      p.charging = true;
      p.charge = Math.min(C.lance.charge, p.charge + TICK);
    } else if (p.charging) {
      if (p.charge >= C.lance.charge - 1e-9) this._fireLance();
      p.charging = false;
      p.charge = 0;
    }
    // the crossbow: held trigger, one bolt per interval, empty = reload
    if (inp.fire && p.reloadLeft > 0 && this.tick % 24 === 0) this.emit('dry-fire', { pos: this.playerPos() });
    if (inp.fire && !p.charging && p.fireCd <= 0 && p.reloadLeft === 0) {
      if (p.bolts > 0) this._fireBolt();
      else { p.reloadLeft = C.crossbow.reload; this.emit('reload', { pos: this.playerPos(), auto: true }); }
    }
  }

  aimDir() {
    const p = this.player;
    const cp = Math.cos(p.pitch);
    return { x: -Math.sin(p.yaw) * cp, y: Math.sin(p.pitch), z: -Math.cos(p.yaw) * cp };
  }

  eye() { const p = this.player; return { x: p.x, y: p.y + EYE, z: p.z }; }

  _fireBolt() {
    const p = this.player;
    p.bolts -= 1;
    p.fireCd = C.crossbow.interval;
    this.stats.shots += 1;
    const eye = this.eye();
    const d = this.aimDir();
    const hit = this.hitscan(eye, d, C.crossbow.range);
    this.emit('bolt-fired', { pos: eye, dir: d, bolts: p.bolts, end: hit.point });
    if (hit.enemy) {
      this.stats.hits += 1;
      const e = hit.enemy;
      let dmg = C.crossbow.damage;
      let shielded = false;
      if (e.kind === 'shieldbearer') {
        // bolts from within the shield arc of its facing do half
        const toShooter = Math.atan2(p.x - e.x, p.z - e.z);
        if (Math.abs(wrap(toShooter - e.heading)) < C.enemies.shieldbearer.shieldArcDeg * Math.PI / 180) { dmg *= C.enemies.shieldbearer.shieldFactor; shielded = true; }
      }
      this.emit('bolt-hit', { pos: hit.point, enemy: e.id, kind: e.kind, shielded, damage: dmg });
      this._damage(e, dmg, 'bolt');
    } else {
      this.emit('bolt-miss', { pos: hit.point, dist: hit.dist });
    }
  }

  /** Ray vs every live body, then occlusion: nearest wins.  No cone, no falloff. */
  hitscan(eye, d, range) {
    let best = null;
    let bestT = range;
    for (const e of this.enemies) {
      if (e.state === 'dead') continue;
      const b = BODY[e.kind];
      const r = b.radius * e.scale;
      const h = b.height * e.scale;
      // closest approach in xz to the body's axis
      const ox = e.x - eye.x; const oz = e.z - eye.z;
      const dxz = Math.hypot(d.x, d.z);
      if (dxz < 1e-6) continue;
      const ux = d.x / dxz; const uz = d.z / dxz;
      const along = ox * ux + oz * uz;               // xz distance along the ray to the closest point
      if (along < 0) continue;
      const perp = Math.abs(ox * uz - oz * ux);
      if (perp > r) continue;
      const back = Math.sqrt(Math.max(0, r * r - perp * perp));
      const xzHit = along - back;
      const t = xzHit / dxz;                          // 3D param along d
      if (t > bestT) continue;
      const y = eye.y + d.y * t;
      if (y < e.y || y > e.y + h) continue;
      best = e; bestT = t;
    }
    const point = { x: eye.x + d.x * bestT, y: eye.y + d.y * bestT, z: eye.z + d.z * bestT };
    if (best && !this.world.clear(eye.x, eye.y, eye.z, point.x, point.y, point.z)) { best = null; }
    if (!best) {
      // walk the ray out to the first blocker for the tracer's end point
      const t = this._firstBlock(eye, d, range);
      return { enemy: null, point: { x: eye.x + d.x * t, y: eye.y + d.y * t, z: eye.z + d.z * t }, dist: t };
    }
    return { enemy: best, point, dist: bestT };
  }

  _firstBlock(eye, d, range) {
    let lo = 0; let hi = range;
    if (this.world.clear(eye.x, eye.y, eye.z, eye.x + d.x * hi, eye.y + d.y * hi, eye.z + d.z * hi)) {
      // the ground, if the ray points down
      if (d.y < -1e-6) return Math.min(range, (this.world.groundAt(eye.x, eye.z, null) - eye.y) / d.y);
      return range;
    }
    for (let i = 0; i < 12; i += 1) {
      const mid = (lo + hi) / 2;
      if (this.world.clear(eye.x, eye.y, eye.z, eye.x + d.x * mid, eye.y + d.y * mid, eye.z + d.z * mid)) lo = mid; else hi = mid;
    }
    return lo;
  }

  _fireLance() {
    const p = this.player;
    p.lanceCd = C.lance.cooldown;
    this.stats.lancesFired[this.waveIndex] += 1;
    this.stats.waves[this.waveIndex].lances += 1;
    const eye = this.eye();
    const d = this.aimDir();
    this.lances.push({ x: eye.x, y: eye.y - 0.15, z: eye.z, dx: d.x, dy: d.y, dz: d.z, hits: [], kills: 0, life: 3.2, id: this.nextId++ });
    this.emit('lance-fired', { pos: eye, dir: d });
  }

  _projectiles() {
    const w = this.world;
    for (const l of this.lances) {
      l.life -= TICK;
      const steps = 3;                                 // 22 m/s × 1/60 = 0.37 m per tick; 3 substeps at 0.12 m
      const s = C.lance.speed * TICK / steps;
      for (let k = 0; k < steps && l.life > 0; k += 1) {
        const nx = l.x + l.dx * s; const ny = l.y + l.dy * s; const nz = l.z + l.dz * s;
        if (!w.clear(l.x, l.y, l.z, nx, ny, nz) || ny < w.groundAt(nx, nz, null)) { l.life = 0; break; }
        l.x = nx; l.y = ny; l.z = nz;
        for (const e of this.enemies) {
          if (e.state === 'dead' || l.hits.includes(e.id)) continue;
          const b = BODY[e.kind];
          const dxz = Math.hypot(e.x - l.x, e.z - l.z);
          if (dxz > b.radius * e.scale + C.lance.radius) continue;
          if (l.y < e.y - C.lance.radius || l.y > e.y + b.height * e.scale + C.lance.radius) continue;
          l.hits.push(e.id);
          this.emit('lance-hit', { pos: { x: e.x, y: e.y + 0.8, z: e.z }, enemy: e.id, kind: e.kind });
          const before = e.state;
          this._damage(e, C.lance.damage, 'lance');
          if (before !== 'dead' && e.state === 'dead') l.kills += 1;
          if (l.hits.length >= C.lance.pierce) { l.life = 0; break; }
        }
      }
      if (l.life <= 0 && l.kills >= 2) this.emit('lance-multikill', { count: l.kills, pos: { x: l.x, y: l.y, z: l.z } });
    }
    // a lance that spent itself with two kills still counts when it flies on
    for (const l of this.lances) if (l.life > 0 && l.kills >= 2 && !l.multi) { l.multi = true; this.emit('lance-multikill', { count: l.kills, pos: { x: l.x, y: l.y, z: l.z } }); }
    this.lances = this.lances.filter((l) => l.life > 0);

    const p = this.player;
    for (const h of this.hexbolts) {
      h.life -= TICK;
      const s = C.enemies.hexer.boltSpeed * TICK;
      const nx = h.x + h.dx * s; const ny = h.y + h.dy * s; const nz = h.z + h.dz * s;
      if (!w.clear(h.x, h.y, h.z, nx, ny, nz) || ny < w.groundAt(nx, nz, null)) { h.life = 0; continue; }
      h.x = nx; h.y = ny; h.z = nz;
      if (!p.dead && Math.hypot(p.x - h.x, p.z - h.z) < HEXBOLT_RADIUS + R && h.y > p.y && h.y < p.y + EYE + 0.3) {
        h.life = 0;
        this.emit('hexbolt-hit', { pos: { x: h.x, y: h.y, z: h.z } });
        this._hurt(C.enemies.hexer.boltDamage, h.fromX, h.fromZ, 'hexer');
      }
    }
    this.hexbolts = this.hexbolts.filter((h) => h.life > 0);
  }

  /* ---- damage both ways ---- */
  _damage(e, dmg, by) {
    if (e.state === 'dead') return;
    if (e.firstHitTick === null) e.firstHitTick = this.tick;
    e.hp -= dmg;
    e.seq.hit += 1;
    e.lastHitTick = this.tick;
    if (e.hp <= 0) { this._kill(e, by); return; }
    // hit reaction: chaff flinches every time, the heavy kinds by poise
    const poise = POISE[e.kind];
    if (poise === 0 || this.time - e.lastStun >= poise) {
      if (e.state !== 'dash' && e.state !== 'retreat') { e.state = 'hit'; e.stateT = 0; }
      e.lastStun = this.time;
      e.seq.flinch += 1;
    }
    if (e.kind === 'captain' && this.wave.id === 'w4' && e.hp <= e.hpMax * C.enemies.captain.retreatHpFrac && e.state !== 'retreat') this._captainRetreat(e, 'hp');
  }

  _kill(e, by) {
    e.state = 'dead';
    e.stateT = 0;
    e.hp = 0;
    e.seq.death += 1;
    e.killedBy = by;
    this.stats.kills += 1;
    this.stats.killsByKind[e.kind] = (this.stats.killsByKind[e.kind] ?? 0) + 1;
    const ws = this.stats.waves[this.waveIndex];
    ws.kills += 1; ws.lastKillTick = this.tick;
    if (this.waveTime <= 60 && ws.attempts === 1) ws.earlyKills += 1;   // the first attempt only: a restart re-feeds the table
    if (e.firstHitTick !== null) this.stats.ttk.push({ kind: e.kind, wave: this.waveIndex, s: (this.tick - e.firstHitTick) * TICK, dist: Math.hypot(e.x - this.player.x, e.z - this.player.z) });
    if (e.kind === 'hexer' && this.stats.firstHexerDeath === null) this.stats.firstHexerDeath = { wave: this.waveIndex, t: this.waveTime };
    const pos = { x: e.x, y: e.y + BODY[e.kind].height * e.scale * 0.6, z: e.z };
    // literal emit sites: the feel lint greps call sites for names, by design
    const d = { pos, enemy: e.id, by };
    if (e.kind === 'cutpurse') this.emit('kill-cutpurse', d);
    else if (e.kind === 'reaver') this.emit('kill-reaver', d);
    else if (e.kind === 'shieldbearer') this.emit('kill-shieldbearer', d);
    else if (e.kind === 'hexer') this.emit('kill-hexer', d);
    else if (e.kind === 'captain') this.emit('kill-captain', d);
    if (e.kind === 'captain' && this.wave.id === 'w6') this._startObjective('o6-ring-the-bell');
  }

  _hurt(dmg, fromX, fromZ, by) {
    const p = this.player;
    if (p.dead) return;
    p.hp -= dmg;
    this.stats.waves[this.waveIndex].damage += dmg;
    const dm = this.stats.waves[this.waveIndex].damageBy ??= {};
    dm[by] = (dm[by] ?? 0) + dmg;
    const dir = wrap(Math.atan2(-(fromX - p.x), -(fromZ - p.z)) - p.yaw);   // relative to the look direction
    p.hurt.push({ dir, left: 0.6 });
    this.emit('player-hurt', { damage: dmg, hp: p.hp, by, dir, pos: { x: p.x, y: p.y + 1.2, z: p.z } });
  }

  _playerDies() {
    const p = this.player;
    p.dead = true;
    this.stats.deaths += 1;
    this.stats.waves[this.waveIndex].deaths += 1;
    this.lights -= 1;
    this.lightsLostAt.push(this.wave.id);
    this.emit('player-dead', { pos: this.playerPos(), wave: this.wave.id });
    this.emit('light-lost', { lights: this.lights, wave: this.wave.id, pos: this.playerPos() });
    if (this.lights <= 0) { this.phase = 'lost'; this.emit('defeat', { pos: this.playerPos(), wave: this.wave.id }); return; }
    // the wave restarts from its checkpoint
    this.startWave(this.waveIndex, { restore: true, at: this.checkpoint.player });
  }

  /* ---- interaction: dialogue, the bell, NPC talk ---- */
  _interact() {
    if (this.dialogue) { this.advanceDialogue(); return; }
    const p = this.player;
    for (const n of this.npcs) {
      if (Math.hypot(n.x - p.x, n.z - p.z) > NPC_TALK_RANGE) continue;
      const key = this._idleLineFor(n);
      if (key) { this.openDialogue(n.id, key); return; }
    }
  }

  _idleLineFor(n) {
    const o = this.objective;
    if (o && o.kind === 'escort' && o.npc === n.id && !o.done) return `during:${o.id}`;
    if (n.id === 'reeve') return this.phase === 'breather' ? 'reeve:breather' : 'reeve:wave';
    if (n.id === 'runner') return 'runner:idle';
    if (n.id === 'smith') return 'smith:idle';
    if (n.id === 'bowman') return 'bowman:idle';
    if (n.id === 'hedgewizard') return 'wizard:idle';
    return null;
  }

  /* ---- the wave tick ---- */
  _waveTick() {
    const w = this.wave;
    const sched = SCHEDULES[this.waveIndex];
    this.waveTime += TICK;
    const st = this.stats.waves[this.waveIndex];
    st.pressureSum += Math.min(1, this.alive / w.peakAlive);
    st.ticks += 1;
    // spawn: an entry whose time has come waits for a slot under peakAlive
    while (this.spawned < sched.length && sched[this.spawned].t <= this.waveTime && this.alive < w.peakAlive && this.alive < C.aliveCap) {
      this._spawn(sched[this.spawned]);
      this.spawned += 1;
    }
    for (const e of this.enemies) this._enemyTick(e);
    this.enemies = this.enemies.filter((e) => !(e.state === 'dead' && e.stateT > CORPSE_SECONDS) && !e.gone);
    // the Captain's probe ends at 90 s whatever his health
    const cap = this.captain;
    if (cap && w.id === 'w4' && this.waveTime >= C.enemies.captain.retreatAt && cap.state !== 'retreat') this._captainRetreat(cap, 'time');
    // bell channel (o6)
    const o = this.objective;
    if (o && o.id === 'o6-ring-the-bell' && !o.done) this._bellTick(o);
    if (w.id === 'w6') return;              // last light ends only at the bell or the last light
    const exhausted = this.spawned >= sched.length;
    if ((exhausted && this.alive === 0) || this.waveTime >= w.seconds) this._endWave(exhausted && this.alive === 0 ? 'cleared' : 'time');
  }

  _bellTick(o) {
    const p = this.player;
    const bell = this.world.interactions[o.def.interaction];
    const near = bell && Math.hypot(p.x - bell.at[0], p.z - bell.at[1]) <= INTERACT_RANGE + 0.6;
    if (near && this.input.interactHeld) {
      if (p.channel === 0) this.emit('bell-channel', { pos: { x: bell.at[0], y: p.y + 1.2, z: bell.at[1] } });
      p.channel += TICK;
      if (p.channel >= o.def.channel_seconds) {
        o.done = true;
        this.objectivesDone.push(o.id);
        this.phase = 'won';
        this.stats.waves[this.waveIndex].hpEnd = p.hp;
        this.stats.waves[this.waveIndex].cleared = true;
        this.emit('objective-done', { id: o.id, title: o.title, pos: this.playerPos() });
        this.emit('bell-rung', { pos: { x: bell.at[0], y: p.y + 2.5, z: bell.at[1] } });
      }
    } else p.channel = 0;
  }

  _spawn(entry) {
    const g = this.world.gates[entry.gate];
    const ring = g.spawn_ring;
    const rng = this.rng;
    // cosmetic scatter inside the declared ring; the cell must be open
    let x = ring.centre[0]; let z = ring.centre[1];
    for (let i = 0; i < 12; i += 1) {
      const a = rng() * Math.PI * 2;
      const r = ring.r_min + rng() * (ring.r_max - ring.r_min);
      const cx = ring.centre[0] + Math.cos(a) * r; const cz = ring.centre[1] + Math.sin(a) * r;
      if (nearestOpen(this.world.grid, cx, cz, 0.3)) { x = cx; z = cz; break; }
    }
    const def = C.enemies[entry.kind];
    const scale = entry.kind === 'captain' ? 1 : VARIETY.scaleMin + rng() * (VARIETY.scaleMax - VARIETY.scaleMin);
    const e = {
      id: this.nextId++, kind: entry.kind, x, z, y: this.world.groundAt(x, z, null),
      heading: Math.atan2(g.at[0] - x, g.at[1] - z),
      hp: def.hp, hpMax: def.hp, scale: round3(scale), tint: round3(rng()),
      state: 'move', stateT: 0, moving: false, running: false, speed: 0,
      path: null, pathI: 0, repath: 0, gate: entry.gate,
      seq: { hit: 0, flinch: 0, attack: 0, cast: 0, death: 0, dash: 0 },
      firstHitTick: null, lastHitTick: -1, lastStun: -99, telegraph: 0,
      attackAt: 0, castAt: 0, dashAt: this.time + 3, elite: !!def.elite, gone: false, cover: null,
    };
    this.enemies.push(e);
    if (e.kind === 'captain') { this.captainSeen += 1; this.emit('captain-arrives', { pos: { x, y: e.y + 1.4, z }, appearance: this.captainSeen }); }
  }

  _captainRetreat(e, why) {
    e.state = 'retreat';
    e.stateT = 0;
    e.path = null;
    e.repath = 0;
    this.stats.captainRetreatAt = { t: this.waveTime, why, hp: e.hp };
    this.emit('captain-retreat', { pos: { x: e.x, y: e.y + 1.4, z: e.z }, why, t: this.waveTime });
  }

  /* ---- one enemy ---- */
  _enemyTick(e) {
    e.stateT += TICK;
    e.telegraph = 0;
    if (e.state === 'dead' || e.gone) { e.moving = false; return; }
    const p = this.player;
    const def = C.enemies[e.kind];
    const b = BODY[e.kind];
    const dx = p.x - e.x; const dz = p.z - e.z;
    const dist = Math.hypot(dx, dz);
    const reach = (def.reach ?? 1.5) + R;
    const faceP = () => { e.heading = Math.atan2(dx, dz); };
    e.moving = false; e.running = false;

    if (e.state === 'hit') { if (e.stateT >= HIT_STUN) { e.state = 'move'; e.stateT = 0; } return; }
    if (e.state === 'retreat') { this._followPath(e, this._retreatTarget(e), def.speed, true); if (this._outside(e)) e.gone = true; return; }

    if (e.kind === 'hexer') return this._hexerTick(e, def, dist, dx, dz, faceP, p);

    if (e.state === 'windup') {
      faceP();
      e.telegraph = Math.min(1, e.stateT / def.windup);
      if (e.stateT >= def.windup) {
        e.state = 'strike'; e.stateT = 0; e.seq.attack += 1;
        if (!p.dead && dist <= reach + MELEE_SLACK) {
          this._hurt(def.melee, e.x, e.z, e.kind);
          if (def.knockback) { const l = dist || 1; p.kbx += dx / l * def.knockback * 6; p.kbz += dz / l * def.knockback * 6; }
        }
      }
      return;
    }
    if (e.state === 'strike') { if (e.stateT >= 0.12) { e.state = 'recover'; e.stateT = 0; } return; }
    if (e.state === 'recover') { if (e.stateT >= RECOVER) { e.state = 'move'; e.stateT = 0; } return; }
    if (e.state === 'dashwind') {
      faceP();
      e.telegraph = Math.min(1, e.stateT / def.dashTelegraph);
      if (e.stateT >= def.dashTelegraph) { e.state = 'dash'; e.stateT = 0; e.dashDX = dx / (dist || 1); e.dashDZ = dz / (dist || 1); e.dashLeft = Math.min(def.dashRange, Math.max(0, dist - 1.2)); }
      return;
    }
    if (e.state === 'dash') {
      const s = Math.min(e.dashLeft, 20 * TICK);
      moveBody(this.world, e, e.dashDX * s, e.dashDZ * s, b.radius);
      e.dashLeft -= s;
      e.moving = true; e.running = true; e.speed = 20;
      if (e.dashLeft <= 1e-6 || e.stateT > 0.5) { e.state = 'move'; e.stateT = 0; e.dashAt = this.time + def.dashEvery; }
      return;
    }
    // move: close on the player, cover-aware, then attack in reach
    if (p.dead) { this._followPath(e, [this.checkpoint.player[0], this.checkpoint.player[2]], def.speed * 0.5, false); return; }
    if (dist <= reach && this.time >= e.attackAt) {
      faceP();
      e.state = 'windup'; e.stateT = 0; e.attackAt = this.time + def.windup + RECOVER + 0.2;
      return;
    }
    if (e.kind === 'captain' && this.time >= e.dashAt && dist > 2.5 && dist <= def.dashRange + 2.5 && this.world.clear(e.x, e.y + 0.9, e.z, p.x, p.y + 0.9, p.z)) {
      e.state = 'dashwind'; e.stateT = 0; e.seq.dash += 1;
      this.emit('captain-dash', { pos: { x: e.x, y: e.y + 1.0, z: e.z }, enemy: e.id });
      return;
    }
    const target = this._approachTarget(e, dist);
    this._followPath(e, target, def.speed, dist > 6);
    if (dist <= reach + 0.5) faceP();
  }

  /** Cover-aware approach: far out and in the player's sight, an enemy
   *  goes via the lee of a cover object that lies roughly on its way. */
  _approachTarget(e, dist) {
    const p = this.player;
    if (dist > 6 && this.world.cover.length) {
      if (e.cover && (this.tick % 30 === 0 || e.cover.reached)) {
        const c = e.cover;
        if (Math.hypot(c.x - e.x, c.z - e.z) < 1.0) c.reached = true;
        if (c.reached) e.cover = null;
      }
      if (!e.cover && this.tick % 20 === e.id % 20 && this.world.clear(e.x, e.y + 0.9, e.z, p.x, p.y + 0.9, p.z)) {
        let best = null; let bd = Infinity;
        for (const c of this.world.cover) {
          const cx = (c.x0 + c.x1) / 2; const cz = (c.z0 + c.z1) / 2;
          const dToP = Math.hypot(p.x - cx, p.z - cz);
          const dToE = Math.hypot(e.x - cx, e.z - cz);
          if (dToP > dist - 2 || dToP < 4 || dToE > 14 || dToE < 1.5) continue;
          // off the straight line by less than 5 m
          const t = ((cx - e.x) * (p.x - e.x) + (cz - e.z) * (p.z - e.z)) / (dist * dist);
          const px = e.x + (p.x - e.x) * t; const pz = e.z + (p.z - e.z) * t;
          const off = Math.hypot(cx - px, cz - pz);
          if (off > 5 || dToE + off < bd === false) continue;
          if (dToE + off < bd) { bd = dToE + off; best = c; }
        }
        if (best) {
          // the lee: the far side of the box from the player, one radius out
          const cx = (best.x0 + best.x1) / 2; const cz = (best.z0 + best.z1) / 2;
          const ax = cx - p.x; const az = cz - p.z; const l = Math.hypot(ax, az) || 1;
          const half = Math.max(best.x1 - best.x0, best.z1 - best.z0) / 2 + 0.7;
          e.cover = { x: cx + ax / l * half, z: cz + az / l * half, reached: false };
        }
      }
      if (e.cover) return [e.cover.x, e.cover.z];
    }
    return [p.x, p.z];
  }

  _hexerTick(e, def, dist, dx, dz, faceP, p) {
    const los = this.world.clear(e.x, e.y + 1.1, e.z, p.x, p.y + 1.0, p.z);
    if (e.state === 'cast') {
      faceP();
      e.telegraph = Math.min(1, e.stateT / def.telegraph);
      if (e.stateT >= def.telegraph) {
        e.state = 'move'; e.stateT = 0; e.seq.cast += 1;
        // the bolt leaves the staff toward where the player IS: dodging is the counterplay
        const sx = e.x; const sy = e.y + 1.15; const sz = e.z;
        const tx = p.x - sx; const ty = p.y + 1.0 - sy; const tz = p.z - sz;
        const l = Math.hypot(tx, ty, tz) || 1;
        this.hexbolts.push({ x: sx, y: sy, z: sz, dx: tx / l, dy: ty / l, dz: tz / l, life: HEXBOLT_RANGE / def.boltSpeed, fromX: sx, fromZ: sz, id: this.nextId++ });
      }
      return;
    }
    if (p.dead) return;
    if (los && dist <= HEXBOLT_RANGE && dist >= 4 && this.time >= e.castAt) {
      faceP();
      e.state = 'cast'; e.stateT = 0; e.castAt = this.time + def.castEvery;
      this.emit('hexer-telegraph', { pos: { x: e.x, y: e.y + 1.3, z: e.z }, enemy: e.id });
      return;
    }
    // hold 9–12 m with a line of sight
    const mid = (def.holdMin + def.holdMax) / 2;
    if (dist < def.holdMin - 0.3) {
      const l = dist || 1;
      const tx = e.x - dx / l * (mid - dist); const tz = e.z - dz / l * (mid - dist);
      this._followPath(e, [tx, tz], def.speed, false);
      faceP();
    } else if (dist > def.holdMax + 0.3 || !los) {
      this._followPath(e, [p.x, p.z], def.speed, dist > 14);
    } else faceP();
  }

  _retreatTarget(e) {
    const g = this.world.gates[e.gate];
    return [g.spawn_ring.centre[0], g.spawn_ring.centre[1]];
  }

  _outside(e) {
    const g = this.world.gates[e.gate];
    return Math.hypot(e.x - g.spawn_ring.centre[0], e.z - g.spawn_ring.centre[1]) < 2.5;
  }

  /** A* to the target (repathed on a timer or when the target moved), then
   *  walk the path with the walker's own collider rules plus separation. */
  _followPath(e, target, speed, running) {
    const b = BODY[e.kind] ?? { radius: 0.34 };
    e.repath -= TICK;
    const moved = !e.pathTarget || Math.hypot(e.pathTarget[0] - target[0], e.pathTarget[1] - target[1]) > 1.5;
    // stuck: no progress for 0.75 s -> re-path without smoothing, then via the nearest open cell
    e.stuck = (e.stuck ?? 0) + ((e.lastX !== undefined && Math.hypot(e.x - e.lastX, e.z - e.lastZ) < speed * TICK * 0.15) ? TICK : -e.stuck);
    e.lastX = e.x; e.lastZ = e.z;
    const stuck = e.stuck > 0.75;
    if (!e.path || e.pathI >= e.path.length || (e.repath <= 0 && moved) || stuck) {
      const straight = !stuck && lineOpen(this.world.grid, e.x, e.z, target[0], target[1]);
      e.path = straight ? [[target[0], target[1]]] : (astar(this.world.grid, e.x, e.z, target[0], target[1], { smooth: !stuck, fromY: e.y }) ?? [[target[0], target[1]]]);
      if (stuck) { const c = nearestOpen(this.world.grid, e.x, e.z, 1.5, e.y); if (c) e.path.unshift(this.world.grid.toWorld(c[0], c[1])); e.stuck = 0; }
      e.pathI = 0;
      e.pathTarget = target.slice();
      e.repath = 0.6 + (e.id % 7) * 0.05;   // staggered so fourteen enemies do not all path on one tick
    }
    const wp = e.path[e.pathI];
    let tx = wp[0] - e.x; let tz = wp[1] - e.z;
    let d = Math.hypot(tx, tz);
    if (d < 0.3 && e.pathI < e.path.length - 1) { e.pathI += 1; const n = e.path[e.pathI]; tx = n[0] - e.x; tz = n[1] - e.z; d = Math.hypot(tx, tz); }
    if (d < 0.05) return;
    tx /= d; tz /= d;
    // separation from other live bodies
    let sx = 0; let sz = 0;
    for (const o of this.enemies) {
      if (o === e || o.state === 'dead') continue;
      const ox = e.x - o.x; const oz = e.z - o.z;
      const od = Math.hypot(ox, oz);
      if (od < SEPARATION && od > 1e-6) { sx += ox / od * (SEPARATION - od); sz += oz / od * (SEPARATION - od); }
    }
    let mx = tx + sx * 1.5; let mz = tz + sz * 1.5;
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml; mz /= ml;
    const s = Math.min(speed * TICK, d);
    const bx = e.x; const bz = e.z;
    moveBody(this.world, e, mx * s, mz * s, b.radius);
    const went = Math.hypot(e.x - bx, e.z - bz);
    e.moving = went > 1e-4;
    e.running = running && e.moving;
    e.speed = went / TICK;
    if (e.moving) e.heading = Math.atan2(mx, mz);
  }

  /* ---- breather ---- */
  _breatherTick() {
    const w = this.wave;
    this.breatherTime += TICK;
    const o = this.objective;
    if (o && !o.done && !o.failed) {
      this._objectiveTick(o);
      if (!o.done && this.breatherTime >= (o.def.max_seconds ?? w.breather)) { o.failed = true; this.emit('objective-failed', { id: o.id, title: o.title, pos: this.playerPos() }); }
    }
    if (this.breatherTime >= w.breather) {
      if (this.waveIndex + 1 < C.waves.length) this.startWave(this.waveIndex + 1);
    }
  }

  _objectiveTick(o) {
    const p = this.player;
    if (o.kind === 'escort') {
      const n = this.npc(o.npc);
      if (Math.hypot(n.x - o.def.to[0], n.z - o.def.to[1]) <= 1.5) this._completeObjective();
      return;
    }
    if (o.kind === 'activate') {
      const pt = o.points.find((q) => !q.done && Math.hypot(q.x - p.x, q.z - p.z) <= INTERACT_RANGE);
      if (pt && this.input.interactHeld && !this.dialogue) {
        p.activate += TICK;
        if (p.activate >= ACTIVATE_SECONDS) {
          pt.done = true; p.activate = 0;
          const count = o.points.filter((q) => q.done).length;
          const d = { pos: { x: pt.x, y: this.world.groundAt(pt.x, pt.z, null) + 1.0, z: pt.z }, count, total: o.def.count, point: [pt.x, pt.z] };
          if (o.id === 'o2-barricades') this.emit('barricade-up', d); else this.emit('brazier-lit', d);
          if (count >= o.def.count) this._completeObjective();
        }
      } else p.activate = 0;
    }
  }

  /* ---- NPCs walk the same grid ---- */
  _npcTick(n) {
    n.moving = false;
    const p = this.player;
    if (n.talking) {
      n.heading = Math.atan2(p.x - n.x, p.z - n.z);
      return;
    }
    if (n.state === 'toShelter' || n.state === 'toPost' || n.state === 'flee') {
      const target = n.state === 'toPost' ? n.post : n.state === 'flee' ? n.fleesTo : n.target;
      const arrived = this._npcWalk(n, target);
      if (arrived) {
        if (n.state === 'toShelter') { n.state = 'sheltered'; this.emit('npc-sheltered', { id: n.id, name: n.name, pos: { x: n.x, y: n.y + 1, z: n.z } }); }
        else if (n.state === 'toPost') { n.state = 'post'; n.heading = Math.atan2(n.postFacing[0], n.postFacing[1]); }
        else n.state = 'hiding';
      }
      return;
    }
    if (n.state === 'escort') {
      const o = this.objective;
      const leash = o?.def.leash_m ?? 8;
      const d = Math.hypot(p.x - n.x, p.z - n.z);
      // follow the player; stop when close; wait when the leash is out
      if (d > leash) { n.waiting = true; n.heading = Math.atan2(p.x - n.x, p.z - n.z); return; }
      n.waiting = false;
      const to = o?.def.to;
      if (to && Math.hypot(p.x - to[0], p.z - to[1]) < 5) { this._npcWalk(n, to, 0.6); return; }   // the last steps are hers
      if (d > 2.4) {
        n.running = n.character === 'mika' && d > 5;
        this._npcWalk(n, [p.x, p.z], 2.0);
      } else n.heading = Math.atan2(p.x - n.x, p.z - n.z);
      return;
    }
    if (n.state === 'post' && Math.hypot(p.x - n.x, p.z - n.z) < 4) n.heading = Math.atan2(p.x - n.x, p.z - n.z);
  }

  _npcWalk(n, target, stopAt = 0.5) {
    n.repath -= TICK;
    const moved = !n.pathTarget || Math.hypot(n.pathTarget[0] - target[0], n.pathTarget[1] - target[1]) > 1.0;
    n.stuck = (n.stuck ?? 0) + ((n.lastX !== undefined && Math.hypot(n.x - n.lastX, n.z - n.lastZ) < n.speed * TICK * 0.15) ? TICK : -n.stuck);
    n.lastX = n.x; n.lastZ = n.z;
    const stuck = n.stuck > 0.75;
    if (!n.path || n.pathI >= n.path.length || (n.repath <= 0 && moved) || stuck) {
      n.path = astar(this.world.grid, n.x, n.z, target[0], target[1], { smooth: !stuck, fromY: n.y }) ?? [[target[0], target[1]]];
      if (stuck) { const c = nearestOpen(this.world.grid, n.x, n.z, 1.5, n.y); if (c) n.path.unshift(this.world.grid.toWorld(c[0], c[1])); n.stuck = 0; }
      n.pathI = 0; n.pathTarget = target.slice(); n.repath = 0.8;
    }
    const wp = n.path[n.pathI];
    let tx = wp[0] - n.x; let tz = wp[1] - n.z;
    let d = Math.hypot(tx, tz);
    if (d < 0.3 && n.pathI < n.path.length - 1) { n.pathI += 1; const w = n.path[n.pathI]; tx = w[0] - n.x; tz = w[1] - n.z; d = Math.hypot(tx, tz); }
    const total = Math.hypot(target[0] - n.x, target[1] - n.z);
    if (total <= stopAt) return true;
    if (d < 1e-4) return true;
    const speed = n.running ? n.speed * 2.1 : n.speed;
    const s = Math.min(speed * TICK, d);
    moveBody(this.world, n, tx / d * s, tz / d * s, 0.3);
    n.moving = true;
    n.heading = Math.atan2(tx, tz);
    return Math.hypot(target[0] - n.x, target[1] - n.z) <= stopAt;
  }
}

/* ---- the walker's own movement: axis-separated stepping, collider push-out,
 * step-height refusal — src/player.js's semantics, shared by every body. ---- */
export function moveBody(world, body, dx, dz, radius) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.18));
  for (let i = 0; i < steps; i += 1) {
    stepAxis(world, body, 'x', dx / steps, radius);
    stepAxis(world, body, 'z', dz / steps, radius);
  }
}

function stepAxis(world, body, axis, delta, radius) {
  if (delta === 0) return;
  const was = body[axis];
  body[axis] += delta;
  resolve(world, body, radius);
  const g = world.groundAt(body.x, body.z, body.y);
  if (g - body.y > STEP) { body[axis] = was; resolve(world, body, radius); return; }
  body.y = g;
}

function resolve(world, body, radius) {
  for (const c of world.colliders) {
    // a barrier whose job is only at height: feet more than 1.9 m under it walk through
    if (c.bottom !== undefined && c.bottom !== null && body.y < c.bottom - 1.9) continue;
    // a low kerb is stepped over, not walked into
    if (c.top !== undefined && c.top !== null && c.top - body.y <= STEP) continue;
    const x0 = c.x0 - radius; const x1 = c.x1 + radius; const z0 = c.z0 - radius; const z1 = c.z1 + radius;
    if (body.x <= x0 || body.x >= x1 || body.z <= z0 || body.z >= z1) continue;
    const d = [body.x - x0, x1 - body.x, body.z - z0, z1 - body.z];
    let m = 0;
    for (let i = 1; i < 4; i += 1) if (d[i] < d[m]) m = i;
    if (m === 0) body.x = x0; else if (m === 1) body.x = x1; else if (m === 2) body.z = z0; else body.z = z1;
  }
}

const round3 = (v) => Math.round(v * 1000) / 1000;
const r3 = (v) => Math.round(v * 1000) / 1000;
function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/* ---- cast tables ---------------------------------------------------- */
export const NPC_NAMES = Object.freeze({
  reeve: 'The Reeve', runner: 'Mika', bowman: 'Aldous the bowman', smith: 'Stanhope the smith',
  millwarden: 'The Millstone Warden', hedgewizard: 'The hedge-wizard', vixen: 'the vixen',
});
export const NPC_SPEED = Object.freeze({ elder: 1.1, mika: 1.7, archer: 1.5, brute: 1.3, golem: 1.0, mage: 1.3, fox: 1.8 });

/* Every acting plan is normalised through Mira's contract at module load
 * in script.js; the rules only carry the lines.  Imported lazily-safe: the
 * script is data. */
import { SCRIPT } from './script.js';
