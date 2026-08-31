// Headless balance sim — the game's combat/economy gate. Runs the REAL Run
// (src/survivors/systems.js) in Node with a kiting bot, across seeds and
// characters, and asserts the run is challenging-but-winnable:
//   1. every character's bot survives >= 90s (not hopeless)
//   2. an upgrading bot reaches level >= 5 by 3:00 (XP economy flows)
//   3. a NON-upgrading bot dies before the 8:00 victory (challenge is real)
//   4. upgrading bots: median survival >= 300s and >= 1 victory across seeds
//   node scripts/simulate-run.mjs [--detail]
import * as THREE from 'three';
import { Run } from '../src/survivors/systems.js';
import { PLAYABLES, DESIGN_CURVE } from '../src/survivors/data.js';

const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Actuation-noise wrapper — ported from battery/src/juicebox/rules.js
// (makeNoisy + NOVICE): the SAME policy, played with human imperfections.
// The move vector is re-decided only after a reaction delay (~340ms, jittered
// ±30%) and each decision's direction carries aim error (±16°). A clean-
// information, zero-latency bot plays a different game than the player has —
// winnability is judged by the novice referee (review r1, finding 5).
const UP = new THREE.Vector3(0, 1, 0);
export const NOVICE = { delay: 0.34, jitterDeg: 16, seed: 5 };
function makeNoisyMove({ delay, jitterDeg, seed }) {
  const r = mulberry32(seed);
  const held = new THREE.Vector3();
  let idle = true;
  let nextDecideAt = 0;
  return (run, desired) => {
    if (run.time >= nextDecideAt) {
      nextDecideAt = run.time + delay * (0.7 + r() * 0.6);
      if (desired && desired.lengthSq() > 0) {
        held.copy(desired).applyAxisAngle(UP, (r() - 0.5) * 2 * (jitterDeg * Math.PI / 180));
        idle = false;
      } else idle = true;
    }
    return idle ? null : held;
  };
}

function simulate({ character = 'ronin', seed = 1, upgrade = true, maxTime = 480, noise = null } = {}) {
  const rng = mulberry32(seed);
  const noisy = noise ? makeNoisyMove(noise) : null;
  // designed-curve instrumentation: enemy lifetimes + level-up timestamps
  const born = new Map();
  const ttkByKind = {};
  let firstEliteKill = null;
  const levelUpsAt = [];
  const fx = {
    // TTK is FIRST-DAMAGE -> death. Spawn->death includes the walk from the
    // spawn ring (~6s) and measures geography, not lethality (TRAPS.md).
    hit: (e) => { if (!born.has(e)) born.set(e, run.time); },
    kill: (e) => {
      const t = born.get(e);
      if (t !== undefined) (ttkByKind[e.id] ||= []).push({ at: run.time, ttk: run.time - t });
      if (e.def.elite && firstEliteKill === null) firstEliteKill = run.time;
    },
    levelUp: () => levelUpsAt.push(run.time),
  };
  const run = new Run({ character, rng, fx });
  const dt = 1 / 30;
  const move = new THREE.Vector3();
  const away = new THREE.Vector3();
  let minHp = run.stats.hp;
  let levelAt180 = 1;
  const timeline = [];              // one row per 30s: {t, level, hpFrac, kills}
  let nextSample = 30;
  const centroid = new THREE.Vector3();
  while (!run.over && run.time < maxTime + 1) {
    // skilled-play bot: circle-strafe the horde's edge (weapons keep hitting,
    // gems get swept) while hard-dodging anything that gets close.
    const P = run.playerPos;
    move.set(0, 0, 0);
    centroid.set(0, 0, 0);
    let n = 0, nearest = Infinity;
    for (const e of run.enemies) {
      const d = e.pos.distanceTo(P);
      nearest = Math.min(nearest, d);
      if (d < 7) { centroid.add(e.pos); n++; }
      if (d < 1.5) move.addScaledVector(away.copy(P).sub(e.pos).setY(0).normalize(), (1.5 - d) * 3.5);
    }
    if (n) {
      centroid.multiplyScalar(1 / n);
      const out = P.clone().sub(centroid).setY(0).normalize();
      const press = Math.max(-0.35, Math.min(2.5, (3.0 - nearest) / 1.4)); // keep ~3m off the edge
      move.addScaledVector(out, press);
      move.add(new THREE.Vector3(-out.z, 0, out.x)); // tangential strafe
    }
    if (run.gems.length) {
      let best = null, bd = Infinity;
      for (const g of run.gems) {
        const d = g.pos.distanceToSquared(P);
        if (d < bd) { bd = d; best = g; }
      }
      move.addScaledVector(best.pos.clone().sub(P).setY(0).normalize(), nearest < 1.8 ? 0.6 : 1.4);
    }
    // stay off the walls: bias toward center when near the edge
    if (Math.abs(P.x) > 8.5 || Math.abs(P.z) > 8.5) {
      move.addScaledVector(P.clone().negate().normalize(), 2.0);
    }
    const applied = noisy ? noisy(run, move.lengthSq() > 0 ? move : null) : (move.lengthSq() > 0 ? move : null);
    run.update(dt, applied);
    while (upgrade && run.pendingLevelUps > 0) {
      run.pendingLevelUps--;
      const ch = run.choices();
      if (ch.length) run.applyChoice(ch[Math.floor(rng() * ch.length)]);
    }
    minHp = Math.min(minHp, run.stats.hp);
    if (run.time >= 180 && levelAt180 === 1) levelAt180 = run.level;
    if (run.time >= nextSample) {
      timeline.push({ t: nextSample, level: run.level, hpFrac: run.stats.hp / run.stats.maxHp, kills: run.kills });
      nextSample += 30;
    }
  }
  return {
    character, seed, upgrade,
    outcome: run.over || 'timeout',
    time: +run.time.toFixed(1),
    level: run.level, levelAt180, kills: run.kills, gold: run.gold, minHp: +minHp.toFixed(0),
    timeline, ttkByKind, firstEliteKill, levelUpsAt,
  };
}

const detail = process.argv.includes('--detail');
const results = [];
const checks = [];
const check = (id, pass, note) => { checks.push({ id, pass, note }); };
const info = (id, note) => { checks.push({ id, info: true, note }); };

// 1. every character baseline. A baseline that DIES partway is a NUMBER,
// never a pass — "survived 212.6s" with a green check certified 44% of the
// objective as success (review r1, finding 5). Only a victory earns the
// checkmark; dying before 90s is the hopeless floor and fails.
for (const c of Object.keys(PLAYABLES)) {
  const r = simulate({ character: c, seed: 7, upgrade: true });
  results.push(r);
  if (r.outcome === 'victory') check(`baseline:${c}`, true, `${c} VICTORY at ${r.time}s (level ${r.level}, ${r.kills} kills)`);
  else if (r.time < 90) check(`baseline:${c}`, false, `${c} dead at ${r.time}s — hopeless (< 90s floor)`);
  else info(`baseline:${c}`, `${c} survived ${r.time}s of 480s (${(r.time / 480 * 100).toFixed(0)}% of objective, level ${r.level}, ${r.kills} kills) — partial survival, not a pass`);
}
// 2. upgrading ronin across seeds — the ECONOMY/CURVE instrument (clean bot:
// these are measurements of the design, not a claim a player wins)
const seeds = [1, 2, 3, 4, 5, 6];
const upruns = seeds.map((s) => simulate({ character: 'ronin', seed: s, upgrade: true }));
results.push(...upruns);
check('economy', upruns.every((r) => r.levelAt180 >= 5), `levels at 3:00 = ${upruns.map((r) => r.levelAt180).join(',')}`);
// 4. WINNABILITY is refereed by the NOVICE actuation-noise bot — reaction
// ~340ms, aim error ±16° — because the clean bot plays a game where you can
// see and react to everything instantly, which no player has.
const novruns = seeds.map((s) => simulate({ character: 'ronin', seed: s, upgrade: true, noise: { ...NOVICE, seed: NOVICE.seed + s } }));
results.push(...novruns);
const times = novruns.map((r) => r.time).sort((a, b) => a - b);
const median = times[Math.floor(times.length / 2)];
const wins = novruns.filter((r) => r.outcome === 'victory').length;
check('winnable', median >= 300 && wins >= 1,
  `NOVICE referee (340ms/16°): median ${median}s, wins ${wins}/${seeds.length} (times ${times.join(',')})`);
// 3. no-upgrade bot must die
const nu = simulate({ character: 'ronin', seed: 3, upgrade: false });
results.push(nu);
check('challenge', nu.outcome === 'defeat' && nu.time < 480, `no-upgrade bot: ${nu.outcome} at ${nu.time}s`);

// 5. THE DESIGNED CURVE — a run can be winnable and still be wrong. Medians
// across the upgrading seeds; a run only contributes to a checkpoint it
// survived to (dying is the challenge gate's business, not the curve's).
const med = (arr) => {
  const v = arr.filter((x) => x !== undefined && x !== null).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
};
const rowAt = (r, sec) => r.timeline.find((row) => row.t === sec);
for (const [min, lo, hi] of DESIGN_CURVE.level) {
  const m = med(upruns.map((r) => rowAt(r, min * 60)?.level));
  check(`curve:level@${min}m`, m !== null && m >= lo && m <= hi, `median level ${m} (window ${lo}..${hi})`);
}
for (const [min, lo, hi] of DESIGN_CURVE.hpFrac) {
  const m = med(upruns.map((r) => rowAt(r, min * 60)?.hpFrac));
  check(`curve:hp@${min}m`, m !== null && m >= lo && m <= hi, `median hp ${m === null ? '-' : (m * 100).toFixed(0) + '%'} (window ${lo * 100}..${hi * 100}%)`);
}
for (const [min, lo, hi] of DESIGN_CURVE.killsPerMin) {
  const m = med(upruns.map((r) => {
    const now = rowAt(r, min * 60), before = min > 1 ? rowAt(r, (min - 1) * 60) : { kills: 0 };
    return now && before ? now.kills - before.kills : null;
  }));
  check(`curve:kills@${min}m`, m !== null && m >= lo && m <= hi, `median ${m} kills in minute ${min} (window ${lo}..${hi})`);
}
for (const [kind, min, lo, hi] of DESIGN_CURVE.ttk) {
  // p25 = committed engagements. A kiting bot's MEDIAN includes long
  // disengaged stretches between chip hits, which measures the bot's
  // circling, not the enemy's sponginess (TRAPS.md).
  const q25 = (arr) => { const v = arr.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length * 0.25)] : null; };
  const m = med(upruns.map((r) => {
    const ks = (r.ttkByKind[kind] ?? []).filter((k) => Math.abs(k.at - min * 60) < 45).map((k) => k.ttk);
    return q25(ks);
  }));
  check(`curve:ttk-${kind}@${min}m`, m !== null && m >= lo && m <= hi, `p25 ${kind} TTK ${m?.toFixed(2)}s near minute ${min} (window ${lo}..${hi}s, first-damage->death, committed kills)`);
}
{
  const firsts = upruns.map((r) => r.firstEliteKill).filter((t) => t !== null);
  const m = med(firsts);
  check('curve:first-elite', firsts.length >= 3 && m <= DESIGN_CURVE.firstEliteKillBySec,
    `first elite falls in ${firsts.length}/${upruns.length} runs, median ${m === null ? '-' : m.toFixed(0)}s (<= ${DESIGN_CURVE.firstEliteKillBySec}s)`);
}
{
  const [gapLo, gapHi] = DESIGN_CURVE.levelUpGapSec;
  const maxGaps = [], minGaps = [];
  for (const r of upruns) {
    const ts = r.levelUpsAt.filter((t) => t >= 60 && t <= Math.min(360, r.time));
    if (ts.length < 2) continue;
    const gaps = ts.slice(1).map((t, i) => t - ts[i]);
    maxGaps.push(Math.max(...gaps));
    minGaps.push(Math.min(...gaps));
  }
  check('curve:upgrade-cadence', med(maxGaps) !== null && med(maxGaps) <= gapHi && med(minGaps) >= gapLo,
    `level-up gaps (min 1-6): median-longest ${med(maxGaps)?.toFixed(0)}s <= ${gapHi}, median-shortest ${med(minGaps)?.toFixed(0)}s >= ${gapLo}`);
}

if (detail) console.table(results);
const failed = checks.filter((c) => !c.info && !c.pass);
for (const c of checks) console.log(`${c.info ? '·' : c.pass ? '✓' : '✗'} ${c.id}: ${c.note}`);
console.log(failed.length ? `FAIL (${failed.length})` : 'ALL PASS');
process.exit(failed.length ? 1 : 0);
