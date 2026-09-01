#!/usr/bin/env node
/**
 * JUICE BOX designed-curve gate — the loop contract's numbers (A5),
 * measured headlessly on the pure rules with the bots. Exit-coded.
 *   node scripts/check-juicebox.mjs [--detail]
 */
import { JuiceRun, makeSchedule, greedyBot, routerBot, oracleBot, stillBot, makeNoisy, NOVICE, EXPERT, RUN_SECONDS, DASH, GOLD } from '../src/juicebox/rules.js';

const checks = [];
const check = (id, pass, note) => checks.push({ id, pass, note });
const info = (id, note) => checks.push({ id, pass: null, note });   // a number, never a checkmark
const med = (arr) => { const v = [...arr].sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
const SEEDS = [1, 2, 3, 4, 5, 6, 7];

function play(bot, seed) {
  const run = new JuiceRun({ seed });
  const dt = 1 / 60;
  let deadAir = 0, maxLive = 0;
  while (!run.over) {
    bot(run);
    run.update(dt);
    if (run.spirits.length === 0 && run.time > 1 && run.time < RUN_SECONDS - 1) deadAir += dt;
    maxLive = Math.max(maxLive, run.spirits.length);
  }
  return { ...run.stats(), deadAir, maxLive };
}

const greedy = SEEDS.map((s) => play(greedyBot, s));
const router = SEEDS.map((s) => play(routerBot, s));
const still = SEEDS.map((s) => play(stillBot, s));
// EXECUTION axis: same policy, two noise profiles
const novice = SEEDS.map((s) => play(makeNoisy(routerBot, NOVICE), s));
const expert = SEEDS.map((s) => play(makeNoisy(routerBot, EXPERT), s));
// PLANNING axis (the ORIGINAL metric, restored by A5): oracle vs router at
// the SAME noise profile — recorded whatever it says
const planOracle = SEEDS.map((s) => play(makeNoisy(oracleBot, EXPERT), s));

// 1. greedy-bot score window
const gm = med(greedy.map((r) => r.score));
// window re-derived under the A5 economy (A6: measured 2720 vs the old
// 900..2600, which was derived from the old scoring, not from play)
check('curve:greedy-score', gm >= 1500 && gm <= 4500, `median greedy score ${gm} (window 1500..4500, A6)`);

// 2. execution headroom: same policy family (router), expert vs novice reflexes
const nm = med(novice.map((r) => r.score));
const em = med(expert.map((r) => r.score));
check('curve:execution-headroom', em >= nm * 1.3, `expert-reflex router ${em} vs novice-reflex router ${nm} (need >= 1.3x = ${Math.round(nm * 1.3)})`);

// 3. planning headroom: the original metric, printed as a number
const pm = med(planOracle.map((r) => r.score));
info('curve:planning-headroom', `oracle ${pm} vs router ${em} at the same noise = ${(pm / em).toFixed(2)}x (recorded; A5 withdraws the substitution)`);

// 4. reachability: every scheduled spirit is theoretically reachable
{
  let unreachable = 0, total = 0;
  for (const seed of SEEDS) {
    for (const s of makeSchedule(seed)) {
      if (s.gold) continue;   // gold resolves relative to the player, inside the dash band by construction
      total++;
      const dist = Math.hypot(s.x, s.z);
      const dashRate = DASH.len / DASH.recover;
      if (0.25 + dist / dashRate > s.ttl) unreachable++;
    }
  }
  check('curve:reachability', unreachable === 0, `${unreachable}/${total} scheduled spirits unreachable from the worst corner`);
  check('curve:gold-reachable', GOLD.distMax / (DASH.len / DASH.recover) + 0.34 < GOLD.ttlMin, `gold at ${GOLD.distMax}m needs ${(GOLD.distMax / (DASH.len / DASH.recover) + 0.34).toFixed(2)}s < ttl ${GOLD.ttlMin}s`);
}

// 5. dead air
const da = med(router.map((r) => r.deadAir));
check('curve:dead-air', da <= 1.5, `median dead air ${da.toFixed(2)}s (<= 1.5s)`);

// 6. combo ceiling
const bc = med(router.map((r) => r.bestCombo));
check('curve:max-combo', bc >= 5, `router median best combo ${bc} (need >= 5)`);

// 7. readability: live-spirit population band
const ml = Math.max(...greedy.map((r) => r.maxLive), ...router.map((r) => r.maxLive));
check('curve:population', ml >= 1 && ml <= 8, `max simultaneous spirits ${ml} (band 1..8)`);

// 8. A5: the oni's stun tax, attentive play; standing still is the control
const st = med(router.map((r) => r.stunTax));
check('oni:stun-tax', st < 0.08, `router stunned ${(st * 100).toFixed(1)}% of run time (< 8%); stuns median ${med(router.map((r) => r.stuns))}`);
info('oni:standing-still-control', `still bot: stunned ${(med(still.map((r) => r.stunTax)) * 100).toFixed(1)}% of run, ${med(still.map((r) => r.stuns))} stuns (control, not a pass)`);

// 9. A5: oversupply — popped fraction + combo uptime
const pf = med(router.map((r) => r.poppedFraction));
check('supply:popped-fraction', pf >= 0.45, `router pops ${(pf * 100).toFixed(0)}% of scheduled spirits (>= 45%)`);
const cu = med(router.map((r) => r.comboUptime));
check('supply:combo-uptime', cu >= 0.4, `router at combo >= 2 for ${(cu * 100).toFixed(0)}% of the run (>= 40%)`);

// 10. A5 repricing: a triple line outpays a solo gold at combo 1
{
  const triple = 10 * 1 * 1 + 10 * 2 * 2 + 10 * 3 * 3;
  const solo = GOLD.value * (1 + GOLD.comboGain);
  check('economy:line-beats-gold', triple > solo, `triple line ${triple} vs solo gold ${solo}`);
}

// 11. determinism: same seed + same policy twice = identical outcome
{
  const a = play(routerBot, 42), b = play(routerBot, 42);
  check('determinism', a.score === b.score && a.pops === b.pops, `seed 42 twice: ${a.score}/${a.pops} vs ${b.score}/${b.pops}`);
}

if (process.argv.includes('--detail')) {
  console.table(SEEDS.map((s, i) => ({ seed: s, greedy: greedy[i].score, router: router[i].score, oracle: planOracle[i].score, rCombo: router[i].bestCombo, stunTax: +(router[i].stunTax * 100).toFixed(1), popped: +(router[i].poppedFraction * 100).toFixed(0), uptime: +(router[i].comboUptime * 100).toFixed(0) })));
}
for (const c of checks) console.log(`${c.pass === null ? '·' : c.pass ? '✓' : '✗'} ${c.id}: ${c.note}`);
const failed = checks.filter((c) => c.pass === false);
console.log(failed.length ? `FAIL (${failed.length})` : 'ALL PASS');
process.exit(failed.length ? 1 : 0);
