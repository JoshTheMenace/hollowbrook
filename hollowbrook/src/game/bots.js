/* ------------------------------------------------------------------ *
 * BOTS — one policy, played under actuation noise.
 *
 * The skill axis is EXECUTION first (aim, reload timing, lance lead) and
 * POSITIONING second, so the instrument is the juicebox one: the SAME
 * policy under two noise profiles — NOVICE { delay 0.34 s, jitter ±16° }
 * and EXPERT { delay 0.12 s, jitter ±4° } — plus three degenerate bots
 * (aim-only, move-only, do-nothing) that prove each half is load-bearing.
 * NOTHING in here branches on the profile: the two referees differ by the
 * hand alone, which is the claim the contract's skill axis rests on.
 *
 * THE BOT'S INFORMATION STATE IS THE PLAYER'S.  It knows an enemy only
 * after seeing it: inside a 90° cone about its own yaw, within crossbow
 * range, with a clear line from eye to chest through the town's blockers,
 * and only from `delay` seconds after first sight (reaction).  A known
 * enemy it has not seen for 4 s is forgotten, and it will not SHOOT at
 * one it has not seen this quarter-second — a stale record aims a bolt at
 * a body that is no longer there, which is what a player's screen does.
 * Velocity for the lance lead is differenced from those same sightings.
 * Being hit tells it where from — as the damage ring tells the player —
 * and it turns to look, because the cone is 90° and the thing that kills
 * you is behind you.  Nothing here reads a record the HUD does not show.
 *
 * WHAT THE POLICY PLAYS (GAME-DESIGN, "the decision per minute").
 *   - WHERE TO STAND is chosen twice over: a hold spot (the highest
 *     reachable ground in the arena, away from the gate) at the 10 s
 *     scale, and a steering direction at the 0.3 s scale.  The steering
 *     is a sampled fan: sixteen headings, each scored by where the known
 *     melee will be in 0.9 s if it keeps closing, by the ground it leads
 *     onto, by whether it goes where the hold spot is, and by how square
 *     it is to a live hexbolt.  That is one mechanism for backing off,
 *     sidestepping a staff-glow and walking a lane, instead of three
 *     branches that fight each other.
 *   - MELEE IS A FOOTWORK PROBLEM.  An enemy in windup does not move, so
 *     a player who is already walking away when the swing starts is not
 *     hit at all.  Everything that gets a bot killed is therefore a thing
 *     that stops it moving: charging the lance at 2.6 m/s, or two bodies
 *     on opposite sides.  So the lance is gated on space (nothing closing
 *     inside 8.5 m) and aborted when that space is lost, and the fan
 *     scores a heading by its worst threat rather than its nearest.
 *   - WHEN PRESSED, TURN AND RUN.  Sprint only applies to forward motion
 *     (rules.js: `sprint && move.z > 0.2`), so a bot that backpedals while
 *     facing its target can never sprint — it walks at 4.6 against a
 *     cutpurse's 4.4 and is caught the moment it is boxed.  Repositioning
 *     is therefore a committed mode: face the way you are going, sprint,
 *     hold the commitment about a second, and take the cost of not
 *     shooting and not seeing behind you.
 *   - HEXERS FIRST, AND WITH THE LANCE.  102 HP against a 120 dmg lance
 *     is one shot, and a hexer holding its 9–12 m band is the most nearly
 *     stationary target in the game.  Bolts at that range under a ±16°
 *     hand are a wasted magazine.
 *
 * Jitter is TRIANGULAR on ±jitterDeg (the sum of two uniforms): most
 * shots land near the aim point, the worst ones are a full jitter off,
 * which is what a hand does; it is applied to yaw AND pitch at the tick
 * the trigger is pulled, then the shot resolves on that tick.
 *
 * Every DECISION is made on a fixed tick cadence (`delay`); what happens
 * between decisions is the actuation of the last one, held in WORLD space
 * and re-projected into the local frame every tick.  (Holding it in the
 * local frame — which is what the input struct is — means a 540°/s turn
 * silently rotates the walk: over a novice's 0.34 s the retreat direction
 * can invert.  That is not a slower hand, it is a different policy.)
 * ------------------------------------------------------------------ */
import { CONTRACT as C, BODY } from './data.js';
import { TICK, mulberry32 } from './rules.js';
import { astar, nearestOpen } from './nav.js';
import { idle } from './stepper.js';

export const NOVICE = Object.freeze({ ...C.referee.novice, name: 'novice' });
export const EXPERT = Object.freeze({ ...C.referee.expert, name: 'expert' });

const FOV_HALF = Math.PI / 4;        // 90° cone — the play camera's own width at 16:9
const FORGET = 4;                    // seconds a lost contact stays on the mental map
const STALE_SHOT = 0.25;             // do not shoot at a contact older than this
const TURN = Math.PI * 3;            // 540°/s — a mouse flick
const FAN = 16;                      // steering headings sampled per decision
const LOOK = 0.9;                    // seconds the fan looks ahead
const MELEE = new Set(['cutpurse', 'reaver', 'shieldbearer', 'captain']);
const wrap = (a) => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* Engagement discipline, one table for both hands: a bolt at 20 m subtends
 * under a degree and is a wasted reload, and a reload is when melee lands.
 * Hexers are the exception the design asks for — they never come to you. */
const ENGAGE = { cutpurse: 15, reaver: 15, shieldbearer: 17, hexer: 21, captain: 20 };
/* Space the lance needs: 0.9 s of charge at 2.6 m/s, and a cutpurse covers
 * 4.4 m in that second.  Below ABORT the charge is dropped. */
const LANCE_SPACE = 8.5;
const LANCE_ABORT = 6.0;

/**
 * makeBot(run, profile, { aim = true, move = true }) → () => input for this tick.
 * `profile.seed` seeds the jitter; the run's own seed is separate on purpose
 * (the referee wants six runs per profile).
 */
export function makeBot(run, profile, { aim = true, move = true, seed = 7 } = {}) {
  const r = mulberry32(seed * 1000 + 17);
  const jit = () => (r() + r() - 1) * profile.jitterDeg * Math.PI / 180;   // triangular
  const delayTicks = Math.max(1, Math.round(profile.delay / TICK));
  const known = new Map();           // id -> { x, z, vx, vz, first, last, kind, e }
  const st = {
    yaw: run.player.yaw, pitch: 0, target: null, nextDecision: 0,
    dirX: 0, dirZ: 0, sprint: false, mode: 'fight', modeUntil: 0,
    path: null, pathI: 0, pathAt: -99, pathTo: null,
    holdSpot: null, holdAt: -99, lookAt: null, lookUntil: -99,
    wantLance: false, wantReload: false, lanceTarget: null,
    holdInteract: false, pressInteract: false,
  };
  const w = run.world;
  const grid = w.grid;

  /* ---- the mental map ------------------------------------------------ */
  const perceive = () => {
    const p = run.player;
    const eye = { x: p.x, y: p.y + C.player.eye, z: p.z };
    for (const e of run.enemies) {
      if (e.state === 'dead') continue;
      const dx = e.x - p.x; const dz = e.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > C.crossbow.range) continue;
      const bearing = Math.atan2(-dx, -dz);
      if (Math.abs(wrap(bearing - st.yaw)) > FOV_HALF) continue;
      const cy = e.y + BODY[e.kind].height * e.scale * 0.55;
      if (!w.clear(eye.x, eye.y, eye.z, e.x, cy, e.z)) continue;
      const k = known.get(e.id);
      if (k) {
        const dt = (run.tick - k.last) * TICK;
        if (dt > 1e-6) {
          // what the eye can tell about a body's motion: a smoothed difference
          const nvx = (e.x - k.x) / dt; const nvz = (e.z - k.z) / dt;
          const a = dt > 0.5 ? 1 : 0.35;
          k.vx += (nvx - k.vx) * a; k.vz += (nvz - k.vz) * a;
        }
        k.x = e.x; k.z = e.z; k.last = run.tick;
      } else known.set(e.id, { id: e.id, x: e.x, z: e.z, vx: 0, vz: 0, first: run.tick, last: run.tick, kind: e.kind, e });
    }
    // being hit tells you where from (the damage ring), and you turn to look
    for (const ev of run.events.slice(-8)) {
      if (ev.name !== 'player-hurt' || ev.tick !== run.tick - 1) continue;
      const src = wrap(st.yaw + ev.data.dir);
      st.lookAt = src; st.lookUntil = run.tick + Math.round(1.1 / TICK);
      for (const e of run.enemies) {
        if (e.state === 'dead' || known.has(e.id)) continue;
        if (Math.hypot(e.x - p.x, e.z - p.z) < 3.2) known.set(e.id, { id: e.id, x: e.x, z: e.z, vx: 0, vz: 0, first: run.tick - delayTicks, last: run.tick, kind: e.kind, e });
      }
    }
    for (const [id, k] of known) {
      if (k.e.state === 'dead' || !run.enemies.includes(k.e) || run.tick - k.last > FORGET / TICK) known.delete(id);
    }
  };

  const acquired = () => [...known.values()].filter((k) => run.tick - k.first >= delayTicks);
  const fresh = (k) => run.tick - k.last <= STALE_SHOT / TICK;

  /* ---- the ground ---------------------------------------------------- */
  const gy = (x, z) => {
    const [i, j] = grid.toCell(x, z);
    if (!grid.inside(i, j)) return -99;
    const n = grid.index(i, j);
    return grid.open[n] ? grid.y[n] : -99;
  };
  /** Can the walker go `len` metres along (dx, dz) from its feet? */
  const rayOK = (x, z, dx, dz, len, fromY) => {
    let y = fromY;
    for (let s = 0.45; s <= len + 1e-6; s += 0.45) {
      const [i, j] = grid.toCell(x + dx * s, z + dz * s);
      if (!grid.inside(i, j)) return false;
      const n = grid.index(i, j);
      if (!grid.open[n]) return false;
      if (grid.y[n] - y > C.player.step) return false;   // ascent is step-limited, descent is free
      y = grid.y[n];
    }
    return true;
  };

  /* ---- where to stand for the next thirty seconds --------------------- */
  const arenaHold = () => {
    const wave = run.wave;
    const a = w.arenas[wave.arena];
    const p = run.player;
    // the arena's own modal ground, so "high" means high HERE and not high
    // relative to a district datum a flat arena never leaves
    let base = 0; let n = 0;
    for (let x = a.rect.x0 + 1; x <= a.rect.x1 - 1; x += 3) for (let z = a.rect.z0 + 1; z <= a.rect.z1 - 1; z += 3) { const y = gy(x, z); if (y > -90) { base += y; n += 1; } }
    base = n ? base / n : 0;
    const gates = wave.gates.map((id) => w.gates[id]);
    let best = null; let bs = -Infinity;
    for (let x = a.rect.x0 + 1; x <= a.rect.x1 - 1; x += 2) {
      for (let z = a.rect.z0 + 1; z <= a.rect.z1 - 1; z += 2) {
        const y = gy(x, z);
        if (y < -90) continue;
        let dg = Infinity;
        for (const g of gates) dg = Math.min(dg, Math.hypot(x - g.at[0], z - g.at[1]));
        // room to give ground in every direction is what a hold spot IS
        let room = 0;
        for (let a2 = 0; a2 < 8; a2 += 1) { const ang = a2 / 8 * Math.PI * 2; if (rayOK(x, z, Math.sin(ang), Math.cos(ang), 5, y)) room += 1; }
        const s = clamp(y - base, -2, 2.5) * 3 + Math.min(dg, 34) * 0.22 + room * 1.6;
        if (s > bs) { bs = s; best = [x, z]; }
      }
    }
    const cx = (a.rect.x0 + a.rect.x1) / 2; const cz = (a.rect.z0 + a.rect.z1) / 2;
    if (!best) return [cx, cz];
    if (Math.hypot(best[0] - p.x, best[1] - p.z) > 2 && !astar(grid, p.x, p.z, best[0], best[1], { fromY: p.y })) return [cx, cz];
    return best;
  };

  /* ---- the steering fan ---------------------------------------------- */
  const pickDir = ({ threats, dodge, goal, goalW, safeW, highW, sprint }) => {
    const p = run.player;
    const v = sprint ? C.player.sprint : C.player.walk;
    const y0 = p.y;
    let gx = 0; let gz = 0;
    if (goal) { const l = Math.hypot(goal[0] - p.x, goal[1] - p.z) || 1; gx = (goal[0] - p.x) / l; gz = (goal[1] - p.z) / l; }
    let ax = 0; let az = 0;
    if (dodge) { const l = Math.hypot(p.x - dodge.x, p.z - dodge.z) || 1; ax = (p.x - dodge.x) / l; az = (p.z - dodge.z) / l; }
    let best = null; let bs = -Infinity;
    for (let a = 0; a < FAN; a += 1) {
      const ang = a / FAN * Math.PI * 2;
      const dx = Math.sin(ang); const dz = Math.cos(ang);
      const reach = v * LOOK;
      if (!rayOK(p.x, p.z, dx, dz, Math.min(reach, 3.6), y0)) continue;
      const qx = p.x + dx * reach; const qz = p.z + dz * reach;
      let dmin = Infinity;
      for (const k of threats) {
        const kd = Math.hypot(p.x - k.x, p.z - k.z) || 1;
        const es = C.enemies[k.kind].speed;
        const kx = k.x + (p.x - k.x) / kd * es * LOOK;
        const kz = k.z + (p.z - k.z) / kd * es * LOOK;
        dmin = Math.min(dmin, Math.hypot(qx - kx, qz - kz));
      }
      let s = Math.min(dmin, 9) * safeW;
      s += clamp(gy(qx, qz) - y0, -0.8, 0.8) * highW;
      if (goal) s += (dx * gx + dz * gz) * goalW;
      if (dodge) s += Math.abs(dx * -az + dz * ax) * 2.2;
      s += (dx * st.dirX + dz * st.dirZ) * 0.7;              // no dithering on the spot
      if (s > bs) { bs = s; best = [dx, dz]; }
    }
    return best;
  };

  /* ---- pathing, for the long walks (hold spot, objectives, the bell) --- */
  const walkTo = (target, { stopAt = 1.0 } = {}) => {
    const p = run.player;
    if (Math.hypot(target[0] - p.x, target[1] - p.z) <= stopAt) return null;
    st.stuck = (st.stuck ?? 0) + ((st.lastX !== undefined && Math.hypot(p.x - st.lastX, p.z - st.lastZ) < 0.012) ? TICK : -st.stuck);
    st.lastX = p.x; st.lastZ = p.z;
    const stuck = st.stuck > 0.75;
    if (!st.path || !st.pathTo || Math.hypot(st.pathTo[0] - target[0], st.pathTo[1] - target[1]) > 1 || run.time - st.pathAt > 1.0 || st.pathI >= st.path.length || stuck) {
      st.path = astar(grid, p.x, p.z, target[0], target[1], { smooth: !stuck, fromY: p.y }) ?? [[target[0], target[1]]];
      if (stuck) { const c = nearestOpen(grid, p.x, p.z, 1.5, p.y); if (c) st.path.unshift(grid.toWorld(c[0], c[1])); st.stuck = 0; }
      st.pathI = 0; st.pathTo = target.slice(); st.pathAt = run.time;
    }
    let wp = st.path[st.pathI];
    if (Math.hypot(wp[0] - p.x, wp[1] - p.z) < 0.5 && st.pathI < st.path.length - 1) { st.pathI += 1; wp = st.path[st.pathI]; }
    const dx = wp[0] - p.x; const dz = wp[1] - p.z; const l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  };

  /* ---- target choice -------------------------------------------------- */
  const chooseTarget = (list) => {
    const p = run.player;
    let best = null; let bs = -Infinity;
    for (const k of list) {
      if (!fresh(k)) continue;
      const d = Math.hypot(k.x - p.x, k.z - p.z);
      if (d > ENGAGE[k.kind]) continue;
      let s = -d * 0.6;
      if (k.kind === 'hexer') s += 16;                       // "which hexer to go for" — always
      if (k.kind === 'captain') s += 5;
      if (d < 3.5) s += 9;                                   // the one about to hit you
      if (k.e.hp < k.e.hpMax * 0.4) s += 3;                  // the world-space HP bar: finish it
      if (k === st.target) s += 2.5;                         // do not re-aim every third of a second
      if (s > bs) { bs = s; best = k; }
    }
    return best;
  };

  /* ---- the wave decision --------------------------------------------- */
  const decideWave = () => {
    const p = run.player;
    const seen = acquired();
    const threats = seen.filter((k) => MELEE.has(k.kind));
    let nd = Infinity; let near5 = 0; let near9 = 0;
    for (const k of threats) {
      const d = Math.hypot(k.x - p.x, k.z - p.z);
      if (d < nd) nd = d;
      if (d < 5.2) near5 += 1;
      if (d < 9) near9 += 1;
    }
    st.target = chooseTarget(seen);

    /* the two telegraphs the contract pays for: a staff-glow and a dash */
    let dodge = null;
    for (const k of seen) {
      if (k.kind === 'hexer' && k.e.state === 'cast') dodge = { x: k.x, z: k.z };
      if (k.kind === 'captain' && k.e.state === 'dashwind') dodge = { x: k.x, z: k.z };
    }
    for (const h of run.hexbolts) {
      const dx = p.x - h.x; const dz = p.z - h.z; const d = Math.hypot(dx, dz);
      if (d < 16 && (dx * h.dx + dz * h.dz) / (d || 1) > 0.8) dodge = { x: h.x, z: h.z };
    }

    /* pressed?  two bodies inside five metres, or one inside a swing, or
     * low and touched at all: turn and run, and commit to it */
    const pressed = near5 >= 2 || nd < 2.9 || (p.hp < 45 && near9 >= 2);
    if (move && pressed && run.tick >= st.modeUntil) { st.mode = 'reposition'; st.modeUntil = run.tick + Math.round(1.0 / TICK); }
    else if (run.tick >= st.modeUntil) st.mode = 'fight';

    if (!move) { st.dirX = 0; st.dirZ = 0; st.sprint = false; }
    else if (st.mode === 'reposition') {
      if (!st.fallback || run.tick - (st.fallbackAt ?? -1e9) > Math.round(2.5 / TICK) || Math.hypot(st.fallback[0] - p.x, st.fallback[1] - p.z) < 4) {
        st.fallback = st.holdSpot && Math.hypot(st.holdSpot[0] - p.x, st.holdSpot[1] - p.z) > 6 ? st.holdSpot : null;
        st.fallbackAt = run.tick;
      }
      const d = pickDir({ threats, dodge, goal: st.fallback, goalW: 1.2, safeW: 2.4, highW: 1.2, sprint: true });
      if (d) { st.dirX = d[0]; st.dirZ = d[1]; }
      st.sprint = true;
    } else {
      // hold the ground: keep a standoff, sidestep the telegraph, drift toward
      // the hold spot when nothing is close enough to matter
      if (!st.holdSpot || run.time - st.holdAt > 12) { st.holdSpot = arenaHold(); st.holdAt = run.time; }
      let goal = null; let goalW = 0;
      if (nd > 11) {
        const gd = Math.hypot(st.holdSpot[0] - p.x, st.holdSpot[1] - p.z);
        if (gd > 2.5) { goal = st.holdSpot; goalW = 2.0; }
      }
      const want = nd < 7 || dodge || goal;
      if (want) {
        const d = pickDir({ threats, dodge, goal, goalW, safeW: nd < 7 ? 1.7 : 0.5, highW: 1.4, sprint: false });
        if (d) { st.dirX = d[0]; st.dirZ = d[1]; } else { st.dirX = 0; st.dirZ = 0; }
      } else { st.dirX = 0; st.dirZ = 0; }
      st.sprint = false;
    }

    /* reloading is a thing you do in the gap, not a thing that happens to
     * you: top up whenever nothing is inside a two-second walk */
    st.wantReload = p.bolts === 0 || (p.bolts <= 3 && nd > 11) || (p.bolts < C.crossbow.magazine && nd > 18 && !st.target);

    /* the lance: 120 dmg through a shield, four bodies in a lane, or the
     * hexer that will not come to you — but only with room to stand still */
    st.wantLance = false; st.lanceTarget = null;
    if (aim && p.lanceCd <= 0 && nd > LANCE_SPACE) {
      const hex = seen.filter((k) => k.kind === 'hexer' && fresh(k)).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      const hard = seen.find((k) => (k.kind === 'shieldbearer' || k.kind === 'captain') && fresh(k) && Math.hypot(k.x - p.x, k.z - p.z) < 20);
      const lane = bestLane(seen.filter(fresh), p, 11 * Math.PI / 180, 5, 22);
      if (hex && Math.hypot(hex.x - p.x, hex.z - p.z) > 5) { st.wantLance = true; st.lanceTarget = hex; }
      else if (hard) { st.wantLance = true; st.lanceTarget = hard; }
      else if (lane && lane.count >= 2) { st.wantLance = true; st.lanceTarget = lane.k; }
    }
    if (p.charging && nd < LANCE_ABORT) { st.wantLance = false; st.lanceTarget = null; }
    if (st.lanceTarget) st.target = st.lanceTarget;
  };

  /* ---- breathers ------------------------------------------------------ */
  const breatherDir = () => {
    const o = run.objective;
    const p = run.player;
    if (run.dialogue) { st.pressInteract = run.tick % 18 === 0; return null; }
    if (o && !o.done && !o.failed) {
      if (o.kind === 'escort') {
        const n = run.npc(o.npc);
        if (n.waiting) return walkTo([n.x, n.z], { stopAt: 3 });
        return walkTo(o.def.to, { stopAt: 1.2 });
      }
      if (o.kind === 'activate') {
        const pt = o.points.find((q) => !q.done);
        if (pt) {
          const d = walkTo([pt.x, pt.z], { stopAt: 1.4 });
          st.holdInteract = d === null;
          return d;
        }
      }
    }
    // done, or nothing to do: walk to where the next wave is fought
    const next = C.waves[Math.min(C.waves.length - 1, run.waveIndex + 1)];
    const a = w.arenas[next.arena];
    const g = w.gates[next.gates[0]];
    const cx = (a.rect.x0 + a.rect.x1) / 2; const cz = (a.rect.z0 + a.rect.z1) / 2;
    const ax = cx - g.at[0]; const az = cz - g.at[1]; const l = Math.hypot(ax, az) || 1;
    return walkTo([cx + ax / l * 5, cz + az / l * 5], { stopAt: 1.5 });
  };

  const bellDir = () => {
    const o = run.objective;
    if (!o || o.id !== 'o6-ring-the-bell' || o.done) return null;
    const bell = w.interactions[o.def.interaction];
    const d = walkTo([bell.at[0], bell.at[1]], { stopAt: 1.5 });
    st.holdInteract = d === null;
    return d;
  };

  /* ---- one tick -------------------------------------------------------- */
  return () => {
    const p = run.player;
    const inp = idle();
    if (run.over) return inp;
    perceive();
    st.holdInteract = false; st.pressInteract = false;
    if (run.phase !== st.lastPhase || run.waveIndex !== st.lastWave) {
      st.holdSpot = null; st.path = null; st.pathTo = null; st.fallback = null;
      st.mode = 'fight'; st.modeUntil = 0; st.target = null; st.dirX = 0; st.dirZ = 0;
      st.lastPhase = run.phase; st.lastWave = run.waveIndex;
    }

    const bellWalk = run.phase === 'wave' && run.wave.id === 'w6' && !run.captain && run.objective && run.objective.id === 'o6-ring-the-bell' && !run.objective.done;
    if (run.phase === 'breather' || bellWalk) {
      // the walking phases are continuous: the path is stepped every tick
      const d = run.phase === 'breather' ? breatherDir() : bellDir();
      if (move && d) { st.dirX = d[0]; st.dirZ = d[1]; st.sprint = true; }
      else { st.dirX = 0; st.dirZ = 0; st.sprint = false; }
      st.target = null; st.wantLance = false;
      st.wantReload = run.phase === 'breather' && p.bolts < C.crossbow.magazine;
    } else if (run.tick >= st.nextDecision) {
      st.nextDecision = run.tick + delayTicks;
      decideWave();
    }

    /* aim: the target, the direction of travel when committed, the last
     * damage direction when something hit you, else a sweep of the gate */
    let desiredYaw = st.yaw; let desiredPitch = st.pitch;
    const shooting = aim && st.target && run.phase === 'wave' && st.mode !== 'reposition';
    if (shooting) {
      const k = st.target;
      const e = k.e;
      const dx = e.x - p.x; const dz = e.z - p.z; const d = Math.hypot(dx, dz) || 1;
      let tx = e.x; let tz = e.z;
      if (st.wantLance || p.charging) {
        // a 22 m/s projectile has to be led, and the lead is the velocity the
        // eye has been differencing since the contact was made
        const tof = d / C.lance.speed;
        tx += k.vx * tof; tz += k.vz * tof;
      }
      desiredYaw = Math.atan2(-(tx - p.x), -(tz - p.z));
      const cy = e.y + BODY[e.kind].height * e.scale * 0.55;
      desiredPitch = Math.atan2(cy - (p.y + C.player.eye), Math.hypot(tx - p.x, tz - p.z));
    } else if ((st.mode === 'reposition' || run.phase === 'breather' || bellWalk) && move && (st.dirX || st.dirZ)) {
      desiredYaw = Math.atan2(-st.dirX, -st.dirZ);           // face where you run, or you cannot sprint
      desiredPitch = 0;
    } else if (run.phase === 'wave' && run.tick < st.lookUntil && st.lookAt !== null) {
      desiredYaw = st.lookAt; desiredPitch = 0;              // the damage ring said behind you
    } else if (run.phase === 'wave') {
      const g = w.gates[run.wave.gates[Math.floor(run.time / 4) % run.wave.gates.length]];
      const base = Math.atan2(-(g.at[0] - p.x), -(g.at[1] - p.z));
      desiredYaw = base + Math.sin(run.time * 0.9) * 1.15;
      desiredPitch = 0;
    }
    const maxTurn = TURN * TICK;
    st.yaw += clamp(wrap(desiredYaw - st.yaw), -maxTurn, maxTurn);
    st.pitch += clamp(desiredPitch - st.pitch, -maxTurn, maxTurn);
    inp.yaw = st.yaw; inp.pitch = st.pitch;

    /* actuation: the world-space intent, re-projected into THIS tick's frame */
    if (move && (st.dirX || st.dirZ)) {
      worldToLocal(st.dirX, st.dirZ, st.yaw, inp.move);
      inp.sprint = !!st.sprint;
    }
    inp.interactHeld = st.holdInteract;
    inp.interact = st.pressInteract;

    /* trigger discipline */
    if (shooting) {
      const k = st.target;
      const onTarget = Math.abs(wrap(desiredYaw - st.yaw)) < 0.05 && Math.abs(desiredPitch - st.pitch) < 0.05;
      if (st.wantLance || p.charging) {
        inp.charge = true;
        if (p.charge >= C.lance.charge - 1e-9 && onTarget) { inp.charge = false; inp.yaw = st.yaw + jit(); inp.pitch = st.pitch + jit() * 0.5; }
      } else if (onTarget && fresh(k) && p.bolts > 0 && p.fireCd <= 0 && p.reloadLeft === 0) {
        inp.fire = true;
        inp.yaw = st.yaw + jit(); inp.pitch = st.pitch + jit() * 0.5;   // the hand, on the tick the trigger is pulled
      }
    }
    if (aim && st.wantReload && p.reloadLeft === 0 && !p.charging) inp.reload = true;
    return inp;
  };
}

/** The densest 11° lane at 5–22 m, and the body that defines it. */
function bestLane(list, p, half, near, far) {
  let best = null; let bc = 0;
  for (const a of list) {
    const da = Math.hypot(a.x - p.x, a.z - p.z);
    if (da < near || da > far) continue;
    const ang = Math.atan2(a.x - p.x, a.z - p.z);
    let n = 0;
    for (const b of list) {
      const db = Math.hypot(b.x - p.x, b.z - p.z);
      if (db < near || db > far) continue;
      if (Math.abs(wrap(Math.atan2(b.x - p.x, b.z - p.z) - ang)) < half) n += 1;
    }
    if (n > bc) { bc = n; best = a; }
  }
  return best ? { k: best, count: bc } : null;
}

function worldToLocal(wx, wz, yaw, out) {
  const fx = -Math.sin(yaw); const fz = -Math.cos(yaw);
  const rx = Math.cos(yaw); const rz = -Math.sin(yaw);
  out.z = wx * fx + wz * fz;
  out.x = wx * rx + wz * rz;
  return out;
}

export const DEGENERATE = Object.freeze({
  'aim-only': { aim: true, move: false },
  'move-only': { aim: false, move: true },
  'do-nothing': { aim: false, move: false },
});
