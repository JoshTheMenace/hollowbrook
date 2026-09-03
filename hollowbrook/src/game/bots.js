/* ------------------------------------------------------------------ *
 * BOTS — one policy, played under actuation noise.
 *
 * The skill axis is EXECUTION first (aim, reload timing, lance lead) and
 * POSITIONING second, so the instrument is the juicebox one: the SAME
 * policy under two noise profiles — NOVICE { delay 0.34 s, jitter ±16° }
 * and EXPERT { delay 0.12 s, jitter ±4° } — plus three degenerate bots
 * (aim-only, move-only, do-nothing) that prove each half is load-bearing.
 * Nothing here branches on the profile: the two referees differ by the
 * hand alone.
 *
 * THE BOT'S INFORMATION STATE IS THE PLAYER'S.  It knows an enemy only
 * after seeing it: inside a 90° cone about its own yaw, within crossbow
 * range, with a clear line from eye to chest through the town's blockers,
 * and only from `delay` seconds after first sight (reaction).  A known
 * enemy it has not seen for 4 s is forgotten.  When it knows nothing it
 * scans toward the wave's gate.  Being hit tells it where from — as the
 * damage ring tells the player.  Nothing here reads a record the HUD does
 * not show.
 *
 * Jitter is TRIANGULAR on ±jitterDeg (the sum of two uniforms): most
 * shots land near the aim point, the worst ones are a full jitter off,
 * which is what a hand does; it is applied to yaw AND pitch at the tick
 * the trigger is pulled, then the shot resolves on that tick.
 *
 * Every decision is made on a fixed tick cadence (`delay`), so the bot is
 * as frame-rate blind as the rules.
 *
 * HISTORY: a second version of this file (a sixteen-heading steering fan
 * with a committed sprint-retreat) measured expert 0–1/6 wins against this
 * one's 5–6/6; it is kept out of the tree on purpose.  The next attempt at
 * the novice's threshold should start from a TRACE of where this policy
 * dies, not from a rewrite.
 * ------------------------------------------------------------------ */
import { CONTRACT as C, BODY } from './data.js';
import { TICK, mulberry32 } from './rules.js';
import { astar, nearestOpen } from './nav.js';
import { idle } from './stepper.js';

export const NOVICE = Object.freeze({ ...C.referee.novice, name: 'novice' });
export const EXPERT = Object.freeze({ ...C.referee.expert, name: 'expert' });

const FOV_HALF = Math.PI / 4;        // 90° cone — the play camera's own width at 16:9
const FORGET = 4;                    // seconds
const TURN = Math.PI * 3;            // 540°/s — a mouse flick
const wrap = (a) => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

export function makeBot(run, profile, { aim = true, move = true, seed = 7 } = {}) {
  const r = mulberry32(seed * 1000 + 17);
  const jit = () => (r() + r() - 1) * profile.jitterDeg * Math.PI / 180;   // triangular
  const delayTicks = Math.max(1, Math.round(profile.delay / TICK));
  const known = new Map();           // id -> { x, z, first, last, kind, e }
  const st = {
    yaw: run.player.yaw, pitch: 0, target: null, intent: { x: 0, z: 0, sprint: false }, nextDecision: 0,
    path: null, pathI: 0, pathAt: -99, pathTo: null, scanDir: 1, holdSpot: null, lastFire: -99,
    lastPhase: null, lastWave: -1, dodgeUntil: 0, fallback: null, fallbackAt: -1e9, retreating: false,
  };
  const w = run.world;

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
      if (k) { k.x = e.x; k.z = e.z; k.last = run.tick; }
      else known.set(e.id, { id: e.id, x: e.x, z: e.z, first: run.tick, last: run.tick, kind: e.kind, e });
    }
    // being hit tells you where from (the damage ring): a melee enemy in reach becomes known
    for (const ev of run.events.slice(-6)) {
      if (ev.name !== 'player-hurt' || ev.tick !== run.tick - 1) continue;
      for (const e of run.enemies) {
        if (e.state === 'dead' || known.has(e.id)) continue;
        if (Math.hypot(e.x - p.x, e.z - p.z) < 3) known.set(e.id, { id: e.id, x: e.x, z: e.z, first: run.tick - delayTicks, last: run.tick, kind: e.kind, e });
      }
    }
    for (const [id, k] of known) {
      if (k.e.state === 'dead' || !run.enemies.includes(k.e) || run.tick - k.last > FORGET / TICK) known.delete(id);
    }
  };

  const acquired = () => [...known.values()].filter((k) => run.tick - k.first >= delayTicks);

  // engagement discipline: a bolt at 20 m under a ±16° hand is a wasted
  // reload; the policy lets melee come to 12 m, reaches for hexers at their
  // own hold band and the Captain a little further
  const ENGAGE = { cutpurse: 12, reaver: 12, shieldbearer: 12, hexer: 18, captain: 16 };
  const chooseTarget = (list) => {
    const p = run.player;
    let best = null; let bs = -Infinity;
    for (const k of list) {
      const d = Math.hypot(k.x - p.x, k.z - p.z);
      if (d > ENGAGE[k.kind]) continue;
      let s = -d;
      if (k.kind === 'hexer') s += 14;                       // "which hexer to go for" — always
      if (k.kind === 'captain') s += 4;
      if (d < 3) s += 6;                                     // the one about to hit you
      if (s > bs) { bs = s; best = k; }
    }
    return best;
  };

  const edgeNear = (grid, i, j) => {
    // 1 when a cell within 0.7 m drops or climbs over a step — do not stand on a lip
    const y = grid.y[grid.index(i, j)];
    for (let dj = -2; dj <= 2; dj += 1) for (let di = -2; di <= 2; di += 1) {
      const k = grid.index(i + di, j + dj);
      if (grid.inside(i + di, j + dj) && (!grid.open[k] || Math.abs(grid.y[k] - y) > C.player.step)) return 1;
    }
    return 0;
  };

  const arenaHold = () => {
    // "where to stand for the next thirty seconds": the highest ground in
    // the arena that is reachable, biased away from the approach gate — the
    // market's north rim, the keep's platform; on flat ground, the far third
    const wave = run.wave;
    const a = w.arenas[wave.arena];
    const g = w.gates[wave.gates[0]];
    const p = run.player;
    const level = w.plan.terrain.levels.find((l) => l.id === a.district)?.y ?? 0;
    let best = null; let bs = -Infinity;
    for (let x = a.rect.x0 + 1; x <= a.rect.x1 - 1; x += 2) {
      for (let z = a.rect.z0 + 1; z <= a.rect.z1 - 1; z += 2) {
        const [i, j] = w.grid.toCell(x, z);
        if (!w.grid.inside(i, j) || !w.grid.open[w.grid.index(i, j)]) continue;
        const y = w.grid.y[w.grid.index(i, j)];
        const dg = Math.hypot(x - g.at[0], z - g.at[1]);
        const s = (y - level) * 6 + Math.min(dg, 40) * 0.25 - edgeNear(w.grid, i, j) * 4;
        if (s > bs) { bs = s; best = [x, z]; }
      }
    }
    if (best && !astar(w.grid, p.x, p.z, best[0], best[1], { fromY: p.y })) {
      return [(a.rect.x0 + a.rect.x1) / 2, (a.rect.z0 + a.rect.z1) / 2];
    }
    return best ?? [(a.rect.x0 + a.rect.x1) / 2, (a.rect.z0 + a.rect.z1) / 2];
  };

  const shouldRetreat = (seen, p) => {
    let near = 0; let melee = 0;
    for (const k of seen) { const d = Math.hypot(k.x - p.x, k.z - p.z); if (k.kind !== 'hexer' && d < 7) near += 1; if (k.kind !== 'hexer' && d < 3.2) melee += 1; }
    return (near >= 3 && p.hp < 80) || (melee >= 2) || (p.hp < 35 && near >= 1);
  };
  const fallbackSpot = (seen, p) => {
    const a = w.arenas[run.wave.arena];
    const level = w.plan.terrain.levels.find((l) => l.id === a.district)?.y ?? 0;
    let best = null; let bs = -Infinity;
    for (let x = a.rect.x0 + 1; x <= a.rect.x1 - 1; x += 3) {
      for (let z = a.rect.z0 + 1; z <= a.rect.z1 - 1; z += 3) {
        const [i, j] = w.grid.toCell(x, z);
        if (!w.grid.inside(i, j) || !w.grid.open[w.grid.index(i, j)]) continue;
        const y = w.grid.y[w.grid.index(i, j)];
        let dmin = Infinity;
        for (const k of seen) dmin = Math.min(dmin, Math.hypot(k.x - x, k.z - z));
        const dp = Math.hypot(p.x - x, p.z - z);
        if (dp < 6 || dp > 30) continue;
        const sc = Math.min(dmin, 25) + (y - level) * 4 - edgeNear(w.grid, i, j) * 4;
        if (sc > bs) { bs = sc; best = [x, z]; }
      }
    }
    return best ?? [p.x, p.z];
  };

  const walkTo = (target, out, { stopAt = 1.0, sprint = false } = {}) => {
    const p = run.player;
    if (Math.hypot(target[0] - p.x, target[1] - p.z) <= stopAt) return true;
    st.stuck = (st.stuck ?? 0) + ((st.lastX !== undefined && Math.hypot(p.x - st.lastX, p.z - st.lastZ) < 0.01) ? TICK : -st.stuck);
    st.lastX = p.x; st.lastZ = p.z;
    const stuck = st.stuck > 0.75;
    if (!st.path || !st.pathTo || Math.hypot(st.pathTo[0] - target[0], st.pathTo[1] - target[1]) > 1 || run.time - st.pathAt > 1.0 || st.pathI >= st.path.length || stuck) {
      st.path = astar(w.grid, p.x, p.z, target[0], target[1], { smooth: !stuck, fromY: p.y }) ?? [[target[0], target[1]]];
      if (stuck) { const c = nearestOpen(w.grid, p.x, p.z, 1.5, p.y); if (c) st.path.unshift(w.grid.toWorld(c[0], c[1])); st.stuck = 0; }
      st.pathI = 0; st.pathTo = target.slice(); st.pathAt = run.time;
    }
    let wp = st.path[st.pathI];
    if (Math.hypot(wp[0] - p.x, wp[1] - p.z) < 0.5 && st.pathI < st.path.length - 1) { st.pathI += 1; wp = st.path[st.pathI]; }
    const dx = wp[0] - p.x; const dz = wp[1] - p.z; const l = Math.hypot(dx, dz) || 1;
    worldToLocal(dx / l, dz / l, st.yaw, out);
    out.sprint = sprint;
    return false;
  };

  const decideWave = () => {
    const p = run.player;
    const seen = acquired();
    st.target = chooseTarget(seen);
    let nearest = null; let nd = Infinity;
    for (const k of seen) { const d = Math.hypot(k.x - p.x, k.z - p.z); if (k.kind !== 'hexer' && d < nd) { nd = d; nearest = k; } }
    const mv = { x: 0, z: 0, sprint: false };
    // a hexer's staff-glow (0.7 s) and a bolt in the air are both on screen:
    // the counterplay is a sidestep
    let threat = null;
    for (const k of seen) if (k.kind === 'hexer' && k.e.state === 'cast') threat = k;
    for (const h of run.hexbolts) {
      const dx = p.x - h.x; const dz = p.z - h.z; const d = Math.hypot(dx, dz);
      if (d < 14 && (dx * h.dx + dz * h.dz) / (d || 1) > 0.85) threat = { x: h.x, z: h.z };
    }
    if (move && threat) {
      const ax = p.x - threat.x; const az = p.z - threat.z; const l = Math.hypot(ax, az) || 1;
      worldToLocal(-az / l * st.scanDir, ax / l * st.scanDir, st.yaw, mv);
      mv.sprint = true;
      st.dodgeUntil = run.tick + Math.round(0.6 / TICK);
    } else if (move && run.tick < st.dodgeUntil) {
      mv.x = st.intent.x; mv.z = st.intent.z; mv.sprint = true;
    } else if (move && shouldRetreat(seen, p)) {
      // pressed: somewhere else — sprint to the farthest reachable high spot
      // in the arena and re-engage from there
      if (!st.fallback || Math.hypot(st.fallback[0] - p.x, st.fallback[1] - p.z) < 3 || run.tick - st.fallbackAt > 600) { st.fallback = fallbackSpot(seen, p); st.fallbackAt = run.tick; }
      walkTo(st.fallback, mv, { stopAt: 1.5, sprint: true });
      st.retreating = true;
    } else if (move) {
      st.retreating = false;
      if (nearest && nd < 4.5) {
        // back off along the line, strafing a little so a windup misses
        const ax = p.x - nearest.x; const az = p.z - nearest.z; const l = Math.hypot(ax, az) || 1;
        const sx = -az / l * st.scanDir; const sz = ax / l * st.scanDir;
        worldToLocal(ax / l * 0.85 + sx * 0.5, az / l * 0.85 + sz * 0.5, st.yaw, mv);
        mv.sprint = p.hp < 60 || nd < 2.6;
        st.scanDir = run.tick % 240 < 120 ? 1 : -1;
      } else if (st.target && st.target.kind === 'hexer' && Math.hypot(st.target.x - p.x, st.target.z - p.z) > 14 && !nearest) {
        walkTo([st.target.x, st.target.z], mv, { stopAt: 10 });
      } else if (!st.holdSpot || run.tick % 600 === 0) {
        st.holdSpot = arenaHold();
      }
      if (mv.x === 0 && mv.z === 0 && st.holdSpot && !(nearest && nd < 6)) walkTo(st.holdSpot, mv, { stopAt: 1.5 });
    }
    st.intent = mv;
    st.wantReload = !p.charging && p.bolts === 0 ? true : (p.bolts <= 2 && !(nearest && nd < 6) && seen.length === 0);
    // lance: a lane of two, or a shieldbearer front-on, at 5–20 m
    st.wantLance = false;
    if (aim && p.lanceCd <= 0 && seen.length) {
      const lane = countInCone(seen, p, 12 * Math.PI / 180, 5, 20);
      const sb = seen.find((k) => k.kind === 'shieldbearer' && Math.hypot(k.x - p.x, k.z - p.z) < 15);
      if (lane.count >= 2 || sb) st.wantLance = true;
    }
  };

  const breatherMove = (mv) => {
    const o = run.objective;
    if (run.dialogue) { st.pressInteract = run.tick % 20 === 0; return; }
    if (o && !o.done && !o.failed) {
      if (o.kind === 'escort') { const n = run.npc(o.npc); if (n.waiting) walkTo([n.x, n.z], mv, { stopAt: 3 }); else walkTo(o.def.to, mv, { stopAt: 1.2 }); }
      else if (o.kind === 'activate') { const pt = o.points.find((q) => !q.done); if (pt) st.holdInteract = walkTo([pt.x, pt.z], mv, { stopAt: 1.4 }); }
    } else if (move) {
      if (!st.holdSpot) {
        const next = C.waves[Math.min(C.waves.length - 1, run.waveIndex + 1)];
        const a = w.arenas[next.arena]; const g = w.gates[next.gates[0]];
        const cx = (a.rect.x0 + a.rect.x1) / 2; const cz = (a.rect.z0 + a.rect.z1) / 2;
        const ax = cx - g.at[0]; const az = cz - g.at[1]; const l = Math.hypot(ax, az) || 1;
        st.holdSpot = [cx + ax / l * 6, cz + az / l * 6];
      }
      walkTo(st.holdSpot, mv, { stopAt: 1.5 });
    }
  };

  const bellMove = (mv) => {
    const o = run.objective;
    if (!o || o.id !== 'o6-ring-the-bell' || o.done) return false;
    const bell = w.interactions[o.def.interaction];
    st.holdInteract = walkTo([bell.at[0], bell.at[1]], mv, { stopAt: 1.6 });
    return true;
  };

  return () => {
    const p = run.player;
    const inp = idle();
    if (run.over) return inp;
    perceive();
    st.holdInteract = false; st.pressInteract = false;
    if (run.phase !== st.lastPhase || run.waveIndex !== st.lastWave) { st.holdSpot = null; st.path = null; st.lastPhase = run.phase; st.lastWave = run.waveIndex; }
    if (run.tick >= st.nextDecision) {
      st.nextDecision = run.tick + delayTicks;
      if (run.phase === 'wave') decideWave();
      else { st.wantLance = false; st.wantReload = p.bolts < C.crossbow.magazine; st.target = null; }
    }
    // the continuous parts: keep walking the path, keep tracking the target
    if (run.phase === 'breather' || (run.wave.id === 'w6' && !run.captain && run.objective && !run.objective.done)) {
      const mv = { x: 0, z: 0, sprint: false };
      if (run.phase === 'breather') breatherMove(mv); else bellMove(mv);
      if (move || run.phase === 'breather') st.intent = mv;
    }
    // aim: turn toward the target (or scan) at a bounded rate
    let desiredYaw = st.yaw; let desiredPitch = 0;
    if (st.target && aim) {
      const e = st.target.e;
      const dx = e.x - p.x; const dz = e.z - p.z; const d = Math.hypot(dx, dz) || 1;
      desiredYaw = Math.atan2(-dx, -dz);
      const cy = e.y + BODY[e.kind].height * e.scale * 0.55;
      desiredPitch = Math.atan2(cy - (p.y + C.player.eye), d);
    } else if (run.phase === 'wave') {
      const g = w.gates[run.wave.gates[Math.floor(run.time / 4) % run.wave.gates.length]];
      const base = Math.atan2(-(g.at[0] - p.x), -(g.at[1] - p.z));
      desiredYaw = base + Math.sin(run.time * 0.9) * 0.9;
    } else if (st.intent && (st.intent.x || st.intent.z)) {
      const f = localToWorld(st.intent.x, st.intent.z, st.yaw);
      desiredYaw = Math.atan2(-f.x, -f.z);
    }
    const maxTurn = TURN * TICK;
    st.yaw += Math.max(-maxTurn, Math.min(maxTurn, wrap(desiredYaw - st.yaw)));
    st.pitch += Math.max(-maxTurn, Math.min(maxTurn, desiredPitch - st.pitch));
    inp.yaw = st.yaw; inp.pitch = st.pitch;
    inp.move.x = st.intent?.x ?? 0; inp.move.z = st.intent?.z ?? 0; inp.sprint = !!st.intent?.sprint;
    if (!move) { inp.move.x = 0; inp.move.z = 0; inp.sprint = false; }
    inp.interactHeld = st.holdInteract;
    inp.interact = st.pressInteract;
    // trigger discipline
    if (aim && st.target && run.phase === 'wave') {
      const onTarget = Math.abs(wrap(desiredYaw - st.yaw)) < 0.06 && Math.abs(desiredPitch - st.pitch) < 0.06;
      if (st.wantLance || p.charging) {
        inp.charge = true;
        if (p.charge >= C.lance.charge - 1e-9 && onTarget) { inp.charge = false; inp.yaw = st.yaw + jit(); inp.pitch = st.pitch + jit() * 0.5; }
      } else if (onTarget && p.bolts > 0 && p.fireCd <= 0 && p.reloadLeft === 0) {
        inp.fire = true;
        inp.yaw = st.yaw + jit(); inp.pitch = st.pitch + jit() * 0.5;   // the hand, on the tick the trigger is pulled
        st.lastFire = run.tick;
      }
    }
    if (aim && st.wantReload && p.reloadLeft === 0 && !p.charging) inp.reload = true;
    return inp;
  };
}

function countInCone(list, p, half, near, far) {
  let best = 0;
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
    best = Math.max(best, n);
  }
  return { count: best };
}

function worldToLocal(wx, wz, yaw, out) {
  const fx = -Math.sin(yaw); const fz = -Math.cos(yaw);
  const rx = Math.cos(yaw); const rz = -Math.sin(yaw);
  out.z = wx * fx + wz * fz;
  out.x = wx * rx + wz * rz;
  return out;
}
function localToWorld(lx, lz, yaw) {
  const fx = -Math.sin(yaw); const fz = -Math.cos(yaw);
  const rx = Math.cos(yaw); const rz = -Math.sin(yaw);
  return { x: fx * lz + rx * lx, z: fz * lz + rz * lx };
}

export const DEGENERATE = Object.freeze({
  'aim-only': { aim: true, move: false },
  'move-only': { aim: false, move: true },
  'do-nothing': { aim: false, move: false },
});
