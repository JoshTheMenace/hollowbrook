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
import { PLAYABLES } from '../src/survivors/data.js';

const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function simulate({ character = 'ronin', seed = 1, upgrade = true, maxTime = 480 } = {}) {
  const rng = mulberry32(seed);
  const run = new Run({ character, rng });
  const dt = 1 / 30;
  const move = new THREE.Vector3();
  const away = new THREE.Vector3();
  let minHp = run.stats.hp;
  let levelAt180 = 1;
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
    run.update(dt, move.lengthSq() > 0 ? move : null);
    while (upgrade && run.pendingLevelUps > 0) {
      run.pendingLevelUps--;
      const ch = run.choices();
      if (ch.length) run.applyChoice(ch[Math.floor(rng() * ch.length)]);
    }
    minHp = Math.min(minHp, run.stats.hp);
    if (run.time >= 180 && levelAt180 === 1) levelAt180 = run.level;
  }
  return {
    character, seed, upgrade,
    outcome: run.over || 'timeout',
    time: +run.time.toFixed(1),
    level: run.level, levelAt180, kills: run.kills, gold: run.gold, minHp: +minHp.toFixed(0),
  };
}

const detail = process.argv.includes('--detail');
const results = [];
const checks = [];
const check = (id, pass, note) => { checks.push({ id, pass, note }); };

// 1. every character baseline
for (const c of Object.keys(PLAYABLES)) {
  const r = simulate({ character: c, seed: 7, upgrade: true });
  results.push(r);
  check(`baseline:${c}`, r.time >= 90, `${c} survived ${r.time}s (level ${r.level}, ${r.kills} kills)`);
}
// 2+4. upgrading ronin across seeds
const seeds = [1, 2, 3, 4, 5, 6];
const upruns = seeds.map((s) => simulate({ character: 'ronin', seed: s, upgrade: true }));
results.push(...upruns);
const times = upruns.map((r) => r.time).sort((a, b) => a - b);
const median = times[Math.floor(times.length / 2)];
const wins = upruns.filter((r) => r.outcome === 'victory').length;
check('economy', upruns.every((r) => r.levelAt180 >= 5), `levels at 3:00 = ${upruns.map((r) => r.levelAt180).join(',')}`);
check('winnable', median >= 300 && wins >= 1, `median ${median}s, wins ${wins}/${seeds.length}`);
// 3. no-upgrade bot must die
const nu = simulate({ character: 'ronin', seed: 3, upgrade: false });
results.push(nu);
check('challenge', nu.outcome === 'defeat' && nu.time < 480, `no-upgrade bot: ${nu.outcome} at ${nu.time}s`);

if (detail) console.table(results);
const failed = checks.filter((c) => !c.pass);
for (const c of checks) console.log(`${c.pass ? '✓' : '✗'} ${c.id}: ${c.note}`);
console.log(failed.length ? `FAIL (${failed.length})` : 'ALL PASS');
process.exit(failed.length ? 1 : 0);
