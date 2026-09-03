/* ------------------------------------------------------------------ *
 * SIM — the headless siege referee.
 *
 * Runs the REAL rules (rules.js) on the REAL town (bootCity) through the
 * REAL accumulator (stepper.js) under the contract's actuation-noise
 * profiles, six seeds each, plus the three degenerate bots, and holds the
 * thresholds in CONTRACT.referee.winnable and CONTRACT.curves.
 *
 * dt: the rules tick at TICK = 1/60 s, always.  The referee drives the
 * stepper at TWO render cadences (30 fps and 144 fps, jittered ±30 %) on
 * the same seed and reports the state-hash spread — a window that holds
 * at one frame rate only is not a window (coordinator directive).
 * ------------------------------------------------------------------ */
import { CONTRACT as C } from './data.js';
import { SiegeRun, TICK, mulberry32 } from './rules.js';
import { Stepper } from './stepper.js';
import { buildWorld } from './world.js';
import { makeBot, NOVICE, EXPERT, DEGENERATE } from './bots.js';

const MAX_SIM_SECONDS = 1900;      // 25.5 min session + slack

export async function bootWorld() {
  const { bootCity } = await import('../../scripts/lib/headless.mjs');
  const { vignette, plan, scene } = await bootCity();
  return buildWorld(vignette, plan, { scene });
}

/** One full run under a bot.  `fps` drives the accumulator; `jitter`
 *  perturbs the frame time so the tick count per frame varies. */
export function playRun(world, { seed = 1, profile = NOVICE, bot = {}, fps = 60, jitter = 0, maxSeconds = MAX_SIM_SECONDS, onTick = null } = {}) {
  const run = new SiegeRun(world, { seed });
  const policy = makeBot(run, profile, { ...bot, seed });
  const st = new Stepper(run, { input: policy });
  st.stopTick = Math.round(maxSeconds / TICK);       // the same tick on every cadence
  const jr = mulberry32(seed + 99);
  const frame = 1 / fps;
  while (!run.over && run.tick < st.stopTick) {
    const dt = jitter ? frame * (1 + (jr() * 2 - 1) * jitter) : frame;
    st.frame(dt);
    if (onTick) onTick(run);
  }
  return summarise(run);
}

export function summarise(run) {
  const waves = run.stats.waves.map((w, i) => w ? ({
    id: C.waves[i].id,
    hpEnd: w.hpEnd, cleared: w.cleared, endedBy: w.endedBy,
    pressure: w.ticks ? w.pressureSum / w.ticks : 0,
    // over the fighting, not the walk to the bell: to the last kill
    killsPerMin: w.kills ? w.kills / (Math.max(1, w.lastKillTick - w.firstTick) * TICK / 60) : 0,
    earlyKills: w.earlyKills ?? 0,
    kills: w.kills, deaths: w.deaths, lances: w.lances, damage: w.damage,
  }) : null);
  return {
    won: run.phase === 'won', lost: run.phase === 'lost', phase: run.phase,
    reachedWave: run.waveIndex + 1, lightsLost: C.lights - run.lights, time: run.time,
    kills: run.stats.kills, shots: run.stats.shots, hits: run.stats.hits,
    firstHexerDeath: run.stats.firstHexerDeath, captainRetreatAt: run.stats.captainRetreatAt,
    lancesFired: run.stats.lancesFired.slice(), ttk: run.stats.ttk.slice(), waves, hash: run.stateHash(),
  };
}

const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const pct = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : NaN; };
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '—');
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '—');

export async function runReferee({ detail = false, seeds = 6, log = console.log } = {}) {
  const world = await bootWorld();
  const W = C.referee.winnable;
  const checks = [];
  const check = (id, ok, note) => { checks.push({ id, ok, note }); log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${note}`); };
  log(`referee: rules tick ${TICK.toFixed(4)} s (60 Hz); ${seeds} seeds per profile; town: ${world.colliders.length} colliders, ${world.cover.length} cover, nav ${world.grid.W}×${world.grid.D}`);

  const t0 = Date.now();
  const results = {};
  for (const profile of [NOVICE, EXPERT]) {
    results[profile.name] = [];
    for (let s = 1; s <= seeds; s += 1) {
      const r = playRun(world, { seed: s, profile });
      results[profile.name].push(r);
      if (detail) log(`  ${profile.name} seed ${s}: ${r.phase} at wave ${r.reachedWave}, lights lost ${r.lightsLost}, kills ${r.kills}, hits ${r.hits}/${r.shots}, ${f1(r.time)} s; hpEnd ${r.waves.map((w) => (w ? f1(w.hpEnd) : '—')).join('/')}`);
    }
  }
  const deg = {};
  for (const [name, opts] of Object.entries(DEGENERATE)) {
    // the degenerate bots wear the NOVICE hand: "a novice who never moves
    // must lose by wave 3" is the claim that makes position load-bearing
    deg[name] = playRun(world, { seed: 1, profile: NOVICE, bot: opts, maxSeconds: 900 });
    if (detail) log(`  ${name}: ${deg[name].phase} at wave ${deg[name].reachedWave}, ${f1(deg[name].time)} s, kills ${deg[name].kills}`);
  }
  log(`ran ${seeds * 2 + 3} runs in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  /* ---- winnable-but-hard ---- */
  const nov = results.novice; const exp = results.expert;
  const novWins = nov.filter((r) => r.won).length;
  const expWins = exp.filter((r) => r.won).length;
  check('novice-wins', novWins >= W.noviceWinsOf6, `novice wins ${novWins}/${seeds} (need ≥ ${W.noviceWinsOf6})`);
  const novLights = median(nov.map((r) => r.lightsLost));
  check('novice-lights', novLights <= W.noviceMedianLightsLost, `novice median lights lost ${novLights} (need ≤ ${W.noviceMedianLightsLost})`);
  check('expert-wins', expWins >= W.expertWinsOf6, `expert wins ${expWins}/${seeds} (need ${W.expertWinsOf6})`);
  const expEndHp = median(exp.filter((r) => r.won).map((r) => r.waves[5]?.hpEnd ?? 0));
  check('expert-end-hp', expEndHp >= W.expertEndHp, `expert median end HP ${f1(expEndHp)} (need ≥ ${W.expertEndHp})`);
  check('aim-only-loses', deg['aim-only'].lost && deg['aim-only'].reachedWave <= W.aimOnlyLosesByWave, `aim-only ${deg['aim-only'].phase} at wave ${deg['aim-only'].reachedWave} (must lose by wave ${W.aimOnlyLosesByWave})`);
  check('move-only-loses', deg['move-only'].lost && deg['move-only'].reachedWave <= W.moveOnlyLosesByWave, `move-only ${deg['move-only'].phase} at wave ${deg['move-only'].reachedWave} (must lose in wave ${W.moveOnlyLosesByWave})`);
  const dn = deg['do-nothing'];
  const dnDeath = dn.waves[0]?.deaths > 0 ? dn.time : Infinity;
  check('do-nothing-dies', dnDeath <= W.doNothingDiesBySec, `do-nothing: ${dn.phase} at ${f1(dn.time)} s, ${dn.waves[0]?.deaths ?? 0} deaths (must die ≤ ${W.doNothingDiesBySec} s)`);
  // kills/min while the table is still FEEDING (the first 60 s of every wave
  // reached): a whole-run rate saturates by construction — every spawn dies
  // for both profiles, the schedule sets the pace (nightbloom TRAPS, B4 r0)
  const kpm = (rs) => median(rs.map((r) => { const ws = r.waves.filter(Boolean); return ws.reduce((a, w) => a + w.earlyKills, 0) / ws.length; }));
  const kpmAll = (rs) => median(rs.map((r) => r.kills / (r.time / 60)));
  const headroom = kpm(exp) / kpm(nov);
  check('headroom', headroom >= W.headroomKillsPerMin, `expert kills in a wave's first minute ${f2(kpm(exp))} vs novice ${f2(kpm(nov))} = ${f2(headroom)}× (need ≥ ${W.headroomKillsPerMin}×; whole-run rate ${f2(kpmAll(exp))} vs ${f2(kpmAll(nov))} saturates on the spawn table)`);

  /* ---- designed curves (medians over seeds, novice) ---- */
  const cv = C.curves;
  for (let i = 0; i < 6; i += 1) {
    const vals = nov.map((r) => r.waves[i]?.hpEnd).filter((v) => typeof v === 'number');
    const m = median(vals);
    const [lo, hi] = cv.hpEndOfWave[i];
    check(`curve-hp-w${i + 1}`, vals.length >= Math.ceil(seeds / 2) && m >= lo && m <= hi, `novice median HP at end of w${i + 1}: ${f1(m)} over ${vals.length} runs (window ${lo}–${hi})`);
  }
  const pressures = [0, 1, 2, 3, 4, 5].map((i) => median(nov.map((r) => r.waves[i]?.pressure).filter((v) => typeof v === 'number')));
  const monotone = pressures.every((v, i) => i === 0 || !(v < pressures[i - 1] - 0.03));
  check('curve-pressure', Math.abs(pressures[0] - cv.pressureMean[0]) <= 0.12 && Math.abs(pressures[5] - cv.pressureMean[1]) <= 0.12 && monotone, `pressure means w1→w6: ${pressures.map(f2).join(' ')} (design ${cv.pressureMean[0]} → ${cv.pressureMean[1]}, non-decreasing)`);
  const cleanKpm1 = median(exp.map((r) => r.waves[0]?.killsPerMin).filter(Number.isFinite));
  const cleanKpm6 = median(exp.map((r) => r.waves[5]?.killsPerMin).filter(Number.isFinite));
  check('curve-kpm', cleanKpm1 >= cv.killsPerMin[0][0] && cleanKpm1 <= cv.killsPerMin[0][1] && cleanKpm6 >= cv.killsPerMin[1][0] && cleanKpm6 <= cv.killsPerMin[1][1], `kills/min w1 ${f1(cleanKpm1)} (window ${cv.killsPerMin[0]}), w6 ${f1(cleanKpm6)} (window ${cv.killsPerMin[1]}) — expert stands in for the clean bot`);
  const fhd = median(nov.map((r) => (r.firstHexerDeath && r.firstHexerDeath.wave === 1 ? r.firstHexerDeath.t : Infinity)));
  check('curve-first-hexer', fhd <= cv.firstHexerDeathBySec, `first hexer death median ${f1(fhd)} s into wave 2 (need ≤ ${cv.firstHexerDeathBySec})`);
  const cr = median(nov.map((r) => r.captainRetreatAt?.t ?? Infinity));
  check('curve-captain-retreat', cr >= cv.captainRetreatWindow[0] && cr <= cv.captainRetreatWindow[1], `captain retreat median ${f1(cr)} s (window ${cv.captainRetreatWindow})`);
  const lances = median(exp.flatMap((r) => r.lancesFired.slice(0, r.reachedWave)));
  check('curve-lances', lances >= cv.expertLancesPerWave, `expert lances per wave median ${lances} (need ≥ ${cv.expertLancesPerWave})`);
  // TTK windows (p25 of committed kills within 15 m, novice) — reported, gated loosely
  // crossbow kills only (amendment A8): a lance one-shots any body under 120
  // HP, so its "time to kill" is 0 s by construction and grades nothing
  const ttkAll = nov.flatMap((r) => r.ttk).filter((t) => t.dist <= 15 && t.by !== 'lance');
  for (const [kind, [lo, hi]] of Object.entries(C.ttk)) {   // the contract's own windows (amendment A6)
    const v = pct(ttkAll.filter((t) => t.kind === kind).map((t) => t.s), 0.25);
    check(`ttk-${kind}`, Number.isFinite(v) && v >= lo * 0.5 && v <= hi * 1.5, `${kind} TTK p25 ${f2(v)} s over ${ttkAll.filter((t) => t.kind === kind).length} kills (window ${lo}–${hi}, gated at ×0.5..×1.5)`);
  }

  /* ---- frame-rate blindness: same seed, two cadences, jittered ---- */
  const a = playRun(world, { seed: 1, profile: EXPERT, fps: 30, jitter: 0.3, maxSeconds: 400 });
  const b = playRun(world, { seed: 1, profile: EXPERT, fps: 144, jitter: 0.3, maxSeconds: 400 });
  const c = playRun(world, { seed: 1, profile: EXPERT, fps: 60, maxSeconds: 400 });
  check('frame-rate-spread', a.hash === b.hash && b.hash === c.hash, `state hash at 400 s: 30 fps±30% ${a.hash}, 144 fps±30% ${b.hash}, 60 fps ${c.hash} — spread ${a.hash === b.hash && b.hash === c.hash ? '0 (byte-identical)' : 'NONZERO'}`);

  const failed = checks.filter((k) => !k.ok);
  log(failed.length ? `RESULT: FAIL (${failed.length})` : 'RESULT: PASS');
  return { ok: failed.length === 0, checks, results, deg };
}

/**
 * Realised constants: the DELIVERED numbers, measured in the running rules
 * (a drift gate that reads source constants certifies nothing about what
 * the verb delivers).  Returns { name, contract, measured } rows.
 */
export function measureRealised(world) {
  const rows = [];
  const mk = (seed = 1) => { const run = new SiegeRun(world, { seed }); run.enemies = []; run.phase = 'breather'; run.breatherTime = -1e9; return run; };
  // sprint speed over 2 s of held forward+sprint (after 0.5 s to settle the lerp)
  {
    const run = mk(); const st = new Stepper(run, { input: () => ({ ...idleIn(), move: { x: 0, z: 1 }, sprint: true }) });
    run.player.x = 0; run.player.z = 40; run.player.yaw = 0;
    st.ticks(30); const z0 = run.player.z; st.ticks(120); rows.push({ name: 'player.sprint', contract: C.player.sprint, measured: (z0 - run.player.z) / 2 });
  }
  {
    const run = mk(); const st = new Stepper(run, { input: () => ({ ...idleIn(), move: { x: 0, z: 1 } }) });
    run.player.x = 0; run.player.z = 40; run.player.yaw = 0;
    st.ticks(30); const z0 = run.player.z; st.ticks(120); rows.push({ name: 'player.walk', contract: C.player.walk, measured: (z0 - run.player.z) / 2 });
  }
  {
    const run = mk(); const st = new Stepper(run, { input: () => ({ ...idleIn(), move: { x: 0, z: 1 }, charge: true }) });
    run.player.x = 0; run.player.z = 40; run.player.yaw = 0;
    st.ticks(30); const z0 = run.player.z; st.ticks(30); rows.push({ name: 'player.charging', contract: C.player.charging, measured: (z0 - run.player.z) / 0.5 });
  }
  // crossbow cadence: hold fire for 6 bolts; time between the 1st and 6th bolt-fired = 5 intervals; then the reload
  {
    const run = mk(); const st = new Stepper(run, { input: () => ({ ...idleIn(), fire: true }) });
    st.ticks(60 * 4);
    const fired = run.events.filter((e) => e.name === 'bolt-fired').map((e) => e.tick);
    rows.push({ name: 'crossbow.interval', contract: C.crossbow.interval, measured: (fired[5] - fired[0]) * TICK / 5 });
    rows.push({ name: 'crossbow.magazine', contract: C.crossbow.magazine, measured: fired.findIndex((t, i) => i > 0 && t - fired[i - 1] > C.crossbow.interval / TICK + 2) });
    const reloadAt = run.events.find((e) => e.name === 'reload').tick;
    rows.push({ name: 'crossbow.reload', contract: C.crossbow.reload, measured: (fired[6] - reloadAt) * TICK });
  }
  // lance: the MINIMUM hold that fires (release early = no shot), then the
  // projectile's speed over 1 s of flight, then the cooldown as the gap
  // between two shots under a held trigger minus the charge itself
  {
    let minHold = NaN;
    for (let hold = 48; hold <= 66; hold += 1) {
      let t = 0;
      const run = mk(); const st = new Stepper(run, { input: () => ({ ...idleIn(), charge: t++ < hold }) });
      st.ticks(hold + 2);
      if (run.events.some((e) => e.name === 'lance-fired')) { minHold = hold; break; }
    }
    rows.push({ name: 'lance.charge', contract: C.lance.charge, measured: minHold * TICK });
    // the lance fires ON RELEASE at full charge: hold 55 ticks, let go, then read the flight
    {
      let t = 0;
      const run = mk(); const st = new Stepper(run, { input: () => ({ ...idleIn(), charge: t++ < 55 }) });
      run.player.x = 0; run.player.z = 40; run.player.yaw = 0; run.player.pitch = 0;
      st.ticks(56);
      const l = run.lances[0]; const z0 = l ? l.z : NaN; st.ticks(60);
      rows.push({ name: 'lance.speed', contract: C.lance.speed, measured: run.lances[0] ? (z0 - run.lances[0].z) : NaN });
    }
    // cooldown: the earliest second release that fires, minus the charge
    let cd = NaN;
    for (let R = 200; R <= 280; R += 1) {
      let t = 0;
      const run = mk(); const st = new Stepper(run, { input: () => { t += 1; return { ...idleIn(), charge: t <= 55 || (t > 60 && t <= R) }; } });
      st.ticks(R + 2);
      const fires = run.events.filter((e) => e.name === 'lance-fired').map((e) => e.tick);
      if (fires.length >= 2) { cd = (fires[1] - fires[0]) * TICK - C.lance.charge; break; }
    }
    rows.push({ name: 'lance.cooldown', contract: C.lance.cooldown, measured: cd });
    let u = 0; const run2 = mk(); const st2 = new Stepper(run2, { input: () => ({ ...idleIn(), charge: u++ < 40 }) });
    st2.ticks(60);
    rows.push({ name: 'lance.earlyRelease', contract: 0, measured: run2.events.filter((e) => e.name === 'lance-fired').length });
  }
  return rows;
}

function idleIn() { return { move: { x: 0, z: 0 }, sprint: false, yaw: null, pitch: null, fire: false, charge: false, reload: false, interact: false, interactHeld: false }; }
