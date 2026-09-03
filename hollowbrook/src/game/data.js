/* ------------------------------------------------------------------ *
 * DATA — every number the game runs on.
 *
 * `CONTRACT` is the machine-readable block at the end of LOOP-CONTRACT.md,
 * leaf for leaf: scripts/check-contract-drift.mjs parses that block and
 * deep-compares it against this object, so a number that changes here
 * without changing there is a red gate.  Nothing below CONTRACT is a
 * contract number — it is authoring (spawn timing inside the declared
 * counts and lengths, body sizes, rig tables) and is marked as such.
 *
 * Pure data, no THREE, no DOM: the headless sim and the browser share it.
 * ------------------------------------------------------------------ */

export const CONTRACT = Object.freeze({
  player: { hp: 100, walk: 4.6, sprint: 6.4, charging: 2.6, eye: 1.62, radius: 0.34, step: 0.38 },
  crossbow: { damage: 34, interval: 0.36, magazine: 6, reload: 1.4, range: 40 },
  lance: { charge: 0.9, damage: 120, speed: 22, radius: 0.35, pierce: 4, cooldown: 2.4 },
  enemies: {
    cutpurse:     { rig: 'rogue',     hp: 68,  speed: 4.4, melee: 12, windup: 0.45, reach: 1.5 },
    reaver:       { rig: 'barbarian', hp: 136, speed: 3.2, melee: 22, windup: 0.65, reach: 1.6, knockback: 1.2 },
    shieldbearer: { rig: 'knight',    hp: 204, speed: 2.4, melee: 18, windup: 0.55, reach: 1.6, shieldArcDeg: 60, shieldFactor: 0.5 },
    hexer:        { rig: 'wizard',    hp: 102, speed: 2.8, holdMin: 9, holdMax: 12, boltDamage: 16, boltSpeed: 9, castEvery: 2.2, telegraph: 0.7 },
    captain:      { rig: 'ronin',     hp: 408, speed: 3.8, melee: 30, windup: 0.5, reach: 1.8, dashRange: 6, dashEvery: 6, dashTelegraph: 0.5, retreatHpFrac: 0.5, retreatAt: 90, elite: true },
  },
  aliveCap: 14,
  lights: 3,
  waves: [
    { id: 'w1', name: 'the first rush',      seconds: 120, gates: ['south-gate'], arena: 'gate-square', peakAlive: 6,  counts: { cutpurse: 8,  reaver: 4 },                                          breather: 90,  objective: 'o1-escort-runner' },
    { id: 'w2', name: 'the market',          seconds: 150, gates: ['south-gate'], arena: 'the-market',  peakAlive: 8,  counts: { cutpurse: 10, reaver: 6, hexer: 2 },                              breather: 90,  objective: 'o2-barricades' },
    { id: 'w3', name: 'the row',             seconds: 180, gates: ['east-gate'],  arena: 'the-row',     peakAlive: 9,  counts: { cutpurse: 8,  reaver: 6, hexer: 3, shieldbearer: 3 },           breather: 120, objective: 'o3-relight-wall' },
    { id: 'w4', name: "the captain's probe", seconds: 180, gates: ['south-gate', 'east-gate'], arena: 'the-market', peakAlive: 11, counts: { cutpurse: 12, reaver: 6, hexer: 4, shieldbearer: 4, captain: 1 }, breather: 120, objective: 'o4-escort-reeve' },
    { id: 'w5', name: 'the storm',           seconds: 210, gates: ['south-gate', 'east-gate'], arena: 'the-close',  peakAlive: 13, counts: { cutpurse: 14, reaver: 8, hexer: 5, shieldbearer: 6 }, breather: 30,  objective: null },
    { id: 'w6', name: 'last light',          seconds: 240, gates: ['south-gate', 'east-gate'], arena: 'the-keep',   peakAlive: 14, counts: { cutpurse: 10, reaver: 6, hexer: 4, shieldbearer: 6, captain: 1 }, breather: 0,   objective: 'o6-ring-the-bell' },
  ],
  curves: {
    hpEndOfWave: [[45, 90], [40, 85], [35, 80], [30, 75], [25, 70], [15, 65]],
    pressureMean: [0.35, 0.75],
    killsPerMin: [[5, 8], [8, 13]],
    firstHexerDeathBySec: 60,
    captainRetreatWindow: [40, 90],
    expertLancesPerWave: 3,
  },
  music: {
    base: 0.15, pressureW: 0.55, waveW: 0.05, captainW: 0.10, aliveW: 0.6, hpW: 0.4,
    intent: { breather: 0.22, w1: 0.50, w2: 0.58, w3: 0.68, w4: 0.80, w4captain: 0.90, w5: 0.88, w6: 1.00, dawn: 0.30, defeat: 0.0 },
    tol: 0.06,
  },
  ladder: [
    ['bolt-fired', 1.0], ['bolt-miss', 1.0], ['bolt-hit', 2.0], ['lance-fired', 3.1], ['kill-cutpurse', 5.0],
    ['player-hurt', 6.0], ['kill-hexer', 6.0], ['kill-reaver', 6.8], ['kill-shieldbearer', 9.8],
    ['lance-multikill', 11.9], ['wave-cleared', 12.5], ['kill-captain', 23.6], ['bell-rung', 32.0],
  ],
  ladderWeights: { shake: 10, hitstop: 40, burst: 0.25, text: 2, sfx: 1 },
  referee: {
    novice: { delay: 0.34, jitterDeg: 16 },
    expert: { delay: 0.12, jitterDeg: 4 },
    winnable: { noviceWinsOf6: 3, noviceMedianLightsLost: 2, expertWinsOf6: 6, expertEndHp: 45, aimOnlyLosesByWave: 3, moveOnlyLosesByWave: 1, doNothingDiesBySec: 90, headroomKillsPerMin: 1.6 },
  },
  save: { key: 'hollowbrook-v1', v: 1 },
  legibility: { visibleFrac: 0.7, legibleFrac: 0.6, minPx: 14, minSep: 0.09, eliteFrac: 0.9, eliteMarkerPx: 10, combatRange: 20, p90FirstSightSec: 5 },
  drawCallsMax: 1400,
});

/* ---- authoring below this line (not contract numbers) ------------------ */

/** Body sizes the hitscan, the lance and the melee reach test use. */
export const BODY = Object.freeze({
  cutpurse:     { radius: 0.32, height: 1.30 },
  reaver:       { radius: 0.40, height: 1.50 },
  shieldbearer: { radius: 0.40, height: 1.45 },
  hexer:        { radius: 0.32, height: 1.40 },
  captain:      { radius: 0.36, height: 1.36 },
});

/** Seeded per-instance variety (cosmetic only): scale band per GAME-DESIGN. */
export const VARIETY = Object.freeze({ scaleMin: 0.94, scaleMax: 1.08 });

/** How long a corpse lies before the record is dropped (presentation follows). */
export const CORPSE_SECONDS = 6;

/** A hit reaction stuns chaff outright; heavy kinds only every POISE seconds. */
export const POISE = Object.freeze({ cutpurse: 0, hexer: 0, reaver: 1.2, shieldbearer: 1.2, captain: 2.0 });
export const HIT_STUN = 0.25;
export const RECOVER = 0.55;          // seconds after a strike before the next windup
export const LEAD_IN = 6;             // seconds from wave-start to the first spawn
export const HEXBOLT_RADIUS = 0.4;
export const HEXBOLT_RANGE = 22;

/**
 * SPAWN SCHEDULE — the authored table, expanded once from the wave rows.
 * No RNG: entry i of wave w always spawns at the same time through the same
 * gate.  Composition is interleaved so a rush reads as a rush (cutpurses
 * lead, reavers arrive with the third, hexers from the second fifth,
 * shieldbearers from the middle); gates alternate for a two-gate wave; the
 * Captain has his own time.  The run holds an entry whose time has come
 * until `alive < peakAlive`, which is what makes peakAlive a real cap.
 */
const GROUPS = { w1: [3, 3, 3, 3], w2: [3, 3, 3, 4], w3: [4, 4, 4, 4], w4: [4, 4, 3, 5], w5: [4, 5, 4, 5], w6: [5, 4, 5, 5] };
const WINDOW = { w1: 0.6, w2: 0.6, w3: 0.5, w4: 0.55, w5: 0.55, w6: 0.6 };   // the table exhausts by this fraction of the wave

export function expandWave(w) {
  const order = [];
  const c = { ...w.counts };
  const total = Object.values(c).reduce((a, b) => a + b, 0) - (c.captain ?? 0);
  const take = (k) => { if (c[k] > 0) { c[k] -= 1; order.push(k); return true; } return false; };
  // deterministic interleave by quota: at each slot pick the kind furthest behind its share
  const share = { cutpurse: 1.0, reaver: 0.85, hexer: 0.7, shieldbearer: 0.6 };
  // hexers arrive with the second knot: the contract wants the first one
  // dead by 60 s of wave 2, and a body that spawns at 47 s cannot be
  const startAt = { cutpurse: 0, reaver: 2, hexer: Math.min(3, Math.floor(total * 0.2)), shieldbearer: Math.floor(total * 0.4) };
  const want = { cutpurse: w.counts.cutpurse ?? 0, reaver: w.counts.reaver ?? 0, hexer: w.counts.hexer ?? 0, shieldbearer: w.counts.shieldbearer ?? 0 };
  const done = { cutpurse: 0, reaver: 0, hexer: 0, shieldbearer: 0 };
  for (let i = 0; i < total; i += 1) {
    let best = null;
    let bestScore = -Infinity;
    for (const k of ['cutpurse', 'reaver', 'hexer', 'shieldbearer']) {
      if (!c[k] || i < startAt[k]) continue;
      const score = (want[k] - done[k]) / want[k] * share[k];
      if (score > bestScore) { bestScore = score; best = k; }
    }
    if (!best) best = ['cutpurse', 'reaver', 'hexer', 'shieldbearer'].find((k) => c[k] > 0);
    take(best);
    done[best] += 1;
  }
  /* GROUPS, not a trickle: the contract's pressure curve (alive / peak,
   * time-weighted, 0.35 → 0.75) is unreachable one body at a time — a
   * competent player kills each arrival before the next — so arrivals come
   * in knots that grow with the wave, 0.8 s apart inside a knot, with the
   * table exhausted by ~68 % of the wave's length. */
  const knot = GROUPS[w.id];
  const groups = [];
  for (let i = 0; i < total;) { const n = Math.min(knot[groups.length % knot.length], total - i); groups.push(order.slice(i, i + n)); i += n; }
  const window = w.seconds * WINDOW[w.id];
  const gap = groups.length > 1 ? window / (groups.length - 1) : 0;
  const list = [];
  groups.forEach((g, gi) => g.forEach((kind, k) => list.push({
    t: Math.round((LEAD_IN + gi * gap + k * 0.8) * 10) / 10,
    kind,
    gate: w.gates[(gi + k) % w.gates.length],
  })));
  if (w.counts.captain) list.push({ t: w.id === 'w6' ? 60 : 30, kind: 'captain', gate: w.gates[0] });
  list.sort((a, b) => a.t - b.t);
  return list;
}

export const SCHEDULES = Object.freeze(CONTRACT.waves.map(expandWave));

/** KayKit / charforge rig table for the presentation layer. */
export const RIGS = Object.freeze({
  rogue:     { file: 'Rogue',     height: 1.30, props: ['Knife', 'Knife_Offhand'], attack: ['Dualwield_Melee_Attack_Stab', '1H_Melee_Attack_Stab'] },
  barbarian: { file: 'Barbarian', height: 1.50, props: ['2H_Axe'],                 attack: ['2H_Melee_Attack_Chop', '2H_Melee_Attack_Spin'] },
  knight:    { file: 'Knight',    height: 1.45, props: ['1H_Sword', 'Round_Shield'], attack: ['1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Chop'] },
  wizard:    { file: 'Mage',      height: 1.40, props: ['2H_Staff'],               attack: ['Spellcast_Shoot', 'Spellcast_Raise'] },
});
