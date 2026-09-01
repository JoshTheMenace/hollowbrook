#!/usr/bin/env node
// B4 gate: does the ride the player experiences have the SHAPE the designer
// wrote? Headless, exit-coded. Also writes .shots/ride-curve.svg — the
// intent curve and the measured curve on one plot, from this run.
//   node scripts/check-ride.mjs [--detail]

import fs from 'node:fs';
import { RideRun, CURVE, TRACK, CLIMAX, HEADROOM, RIDE_SECONDS, kiteBot, makeNoisyMove, NOVICE, EXPERT, mulberry32, pearson, mae, intentAt } from '../src/ride/curve.js';

const checks = [];
const check = (id, pass, note) => checks.push({ id, pass, note });
const info = (id, note) => checks.push({ id, pass: null, note });
const med = (arr) => { const v = [...arr].sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
const SEEDS = [1, 2, 3, 4, 5, 6];

function play(profile, seed) {
  const rr = new RideRun({ rng: mulberry32(seed), autoPick: true });
  const bot = makeNoisyMove(kiteBot, { ...profile, seed: seed * 3 + 1 });
  const dt = 1 / 60;
  let eliteAliveAtHold = false, eliteSeen = false;
  while (!rr.over) {
    rr.update(dt, bot(rr));
    if (rr.time >= CLIMAX.at && rr.time <= CLIMAX.holdUntil && rr.run.enemies.some((e) => e.def.elite && !e.dead)) eliteAliveAtHold = true;
    if (rr.run.enemies.some((e) => e.def.elite)) eliteSeen = true;
  }
  return { rr, over: rr.over, survived: rr.time, kills: rr.run.kills, level: rr.run.level, samples: rr.samples, eliteAliveAtHold, eliteSeen, dmgPerMin: rr.damageTaken / Math.max(1e-3, rr.time / 60) };
}

const expert = SEEDS.map((s) => play(EXPERT, s));
const novice = SEEDS.map((s) => play(NOVICE, s));

// A2: the measured series is judged as a SHAPE — divided by its own run
// maximum, so no hand-sized normalizer can drift the gate
const normalized = (r) => { const mx = Math.max(1e-6, ...r.samples.map((s) => s.measured)); return r.samples.map((s) => ({ ...s, measured: s.measured / mx })); };
// 1. tracking (expert): r + MAE between intent and normalized measured
{
  const rs = [], maes = [];
  for (const r of expert) {
    const S = normalized(r);
    const I = S.map((s) => s.intent), M = S.map((s) => s.measured);
    rs.push(pearson(I, M)); maes.push(mae(I, M));
  }
  check('track:pearson', med(rs) >= TRACK.minR, `median r ${med(rs).toFixed(3)} (>= ${TRACK.minR})`);
  check('track:mae', med(maes) <= TRACK.maxMAE, `median MAE ${med(maes).toFixed(3)} (<= ${TRACK.maxMAE}, normalized)`);
}
// 2. breathers are real: normalized measured at 45s and 95s at least breatherDrop below the preceding peak
{
  const drops = [];
  for (const r of expert) {
    const S = normalized(r);
    const at = (t) => S.reduce((b, s) => (Math.abs(s.t - t) < Math.abs(b.t - t) ? s : b)).measured;
    const peak = (t0, t1) => Math.max(...S.filter((s) => s.t >= t0 && s.t <= t1).map((s) => s.measured));
    drops.push(Math.min(peak(15, 40) - at(52), peak(60, 90) - at(102)));
  }
  check('track:breathers', med(drops) >= TRACK.breatherDrop, `median breather drop ${med(drops).toFixed(3)} (>= ${TRACK.breatherDrop}, normalized)`);
}
// 3. climax: elite alive during the hold, and the music (== intent) opens the drive tier
{
  const alive = expert.filter((r) => r.eliteAliveAtHold).length;
  check('climax:elite-alive-in-hold', alive >= 5, `elite alive during ${CLIMAX.at}-${CLIMAX.holdUntil}s on ${alive}/${SEEDS.length} expert seeds`);
  const musicOK = intentAt(CLIMAX.at) >= CLIMAX.minMusic && intentAt(CLIMAX.holdUntil) >= CLIMAX.minMusic;
  check('climax:drive-tier-open', musicOK, `intent ${intentAt(CLIMAX.at)} at ${CLIMAX.at}s, ${intentAt(CLIMAX.holdUntil)} at ${CLIMAX.holdUntil}s (>= ${CLIMAX.minMusic})`);
}
// 4. winnability, refereed by the NOVICE bot; partial survival prints as seconds
{
  const nw = novice.filter((r) => r.over === 'victory').length;
  const ew = expert.filter((r) => r.over === 'victory').length;
  check('win:novice', nw >= 4, `novice survives ${nw}/${SEEDS.length}; survived s: ${novice.map((r) => r.survived.toFixed(0)).join(',')}`);
  check('win:expert', ew === SEEDS.length, `expert survives ${ew}/${SEEDS.length}; survived s: ${expert.map((r) => r.survived.toFixed(0)).join(',')}`);
}
// 5. headroom (A2 ruling): damage taken per minute survived, novice / floored expert.
//    The kills row stays as a recorded finding (it saturates by construction).
{
  const ek = med(expert.map((r) => r.kills)), nk = med(novice.map((r) => r.kills));
  info('headroom:kills (recorded, saturates by construction)', `expert ${ek} vs novice ${nk} kills = ${(ek / nk).toFixed(2)}x`);
  const ed = med(expert.map((r) => r.dmgPerMin)), nd = med(novice.map((r) => r.dmgPerMin));
  const ratio = nd / Math.max(HEADROOM.floorPerMin, ed);
  check('headroom:damage-per-min', ratio >= HEADROOM.min, `novice ${nd.toFixed(1)} vs expert ${ed.toFixed(1)} dmg/min (floor ${HEADROOM.floorPerMin}) = ${ratio.toFixed(2)}x (need >= ${HEADROOM.min})`);
}
// 6. determinism
{
  const a = play(EXPERT, 42), b = play(EXPERT, 42);
  check('determinism', a.kills === b.kills && a.survived === b.survived, `seed 42 twice: ${a.kills}/${a.survived.toFixed(1)} vs ${b.kills}/${b.survived.toFixed(1)}`);
}
info('measured-at-keyframes (expert seed 1)', CURVE.map(([t, v]) => {
  const s = expert[0].samples.reduce((b, x) => (Math.abs(x.t - t) < Math.abs(b.t - t) ? x : b));
  return `${t}s: intent ${v.toFixed(2)} / measured ${s.measured.toFixed(2)}`;
}).join('; '));

// the plot: intent (amber) vs measured (blue), expert seed 1
{
  const W = 900, H = 320, L = 50, B = 40;
  const x = (t) => L + (t / RIDE_SECONDS) * (W - L - 20);
  const y = (v) => H - B - v * (H - B - 20);
  const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ');
  const measured = normalized(expert[0]).map((s) => [s.t, s.measured]);
  const ticks = [0, 30, 60, 90, 120, 150, 180].map((t) => `<text x="${x(t)}" y="${H - 14}" font-size="12" fill="#888" text-anchor="middle">${t}s</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="background:#16121f;font-family:system-ui">
<text x="${L}" y="18" font-size="13" fill="#cfc4e8">INTENSITY RIDE — intent (amber) vs measured (blue), expert bot, seed 1</text>
${[0, 0.25, 0.5, 0.75, 1].map((v) => `<line x1="${L}" y1="${y(v)}" x2="${W - 20}" y2="${y(v)}" stroke="#2a2438"/><text x="${L - 6}" y="${y(v) + 4}" font-size="11" fill="#888" text-anchor="end">${v}</text>`).join('')}
${ticks}
<path d="${path(CURVE)}" fill="none" stroke="#ffd76a" stroke-width="2.5"/>
<path d="${path(measured)}" fill="none" stroke="#6ee0ff" stroke-width="2"/>
${CURVE.map(([t, v]) => `<circle cx="${x(t)}" cy="${y(v)}" r="3.5" fill="#ffd76a"/>`).join('')}
</svg>`;
  fs.mkdirSync(new URL('../.shots', import.meta.url), { recursive: true });
  fs.writeFileSync(new URL('../.shots/ride-curve.svg', import.meta.url), svg);
}

if (process.argv.includes('--detail')) {
  console.table(SEEDS.map((s, i) => ({ seed: s, expert: expert[i].over, eSurvived: +expert[i].survived.toFixed(0), eKills: expert[i].kills, eLevel: expert[i].level, novice: novice[i].over, nSurvived: +novice[i].survived.toFixed(0), nKills: novice[i].kills })));
}
for (const c of checks) console.log(`${c.pass === null ? '·' : c.pass ? '✓' : '✗'} ${c.id}: ${c.note}`);
const failed = checks.filter((c) => c.pass === false);
console.log(failed.length ? `FAIL (${failed.length})` : 'ALL PASS', '— plot: .shots/ride-curve.svg');
process.exit(failed.length ? 1 : 0);
