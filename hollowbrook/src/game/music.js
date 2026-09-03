/* ------------------------------------------------------------------ *
 * MUSIC — the one number the game hands the score.
 *
 * `intensityFor` is LOOP-CONTRACT's formula, verbatim from data.js:
 *   intensity = clamp(0.15 + 0.55·pressure + 0.05·(wave−1) + 0.10·captain)
 *   pressure  = 0.6·min(1, alive/peakAlive) + 0.4·(1 − hp/100)
 *
 * Two gates read this file:
 *  - scripts/check-music.mjs (the music agent's) imports `intensityFor` and
 *    holds the mapping half of the contract: each intent point reachable
 *    ±tol at its wave's designed peak, monotone in alive and in missing HP.
 *  - the referee (sim.js) records a per-tick trace of the intensity the
 *    shell would send AND the MEASURED threat (enemies actually near the
 *    player, the player's actual HP) and holds `checkAgainstTrace`: the
 *    layer must follow game state, not the intent curve — and a table of
 *    null models (flat, ramp, noise, intent-by-wave) must FAIL the same
 *    test (coordinator directive #2: a linear ramp passed the ride's gate
 *    at Pearson 0.79; 48 s of war drums played over two enemies).
 *
 * The audio seam is src/audio/index.js (`audioAdapter()`): the feel table's
 * sfx names resolve through the bank's own ALIASES, gain comes from the
 * bank's measured MAGNITUDE table, never from a call site.
 * ------------------------------------------------------------------ */
import { CONTRACT as C } from './data.js';

export function intensityFor({ alive = 0, peakAlive = 1, hp = 100, waveIndex = 0, captain = false } = {}) {
  const m = C.music;
  const pressure = m.aliveW * Math.min(1, alive / Math.max(1, peakAlive)) + m.hpW * (1 - hp / C.player.hp);
  const v = m.base + m.pressureW * pressure + m.waveW * waveIndex + m.captainW * (captain ? 1 : 0);
  return Math.min(1, Math.max(0, v));
}

/** The intent point a run should be at right now (HUD/debug; never a gate input). */
export function intentFor(run) {
  if (run.phase === 'lost') return C.music.intent.defeat;
  if (run.phase === 'won') return C.music.intent.dawn;
  if (run.phase === 'breather') return C.music.intent.breather;
  const w = run.wave.id;
  if (w === 'w4' && run.captain) return C.music.intent.w4captain;
  return C.music.intent[w];
}

/** What the shell sends every tick, from the live run. */
export function intensityOf(run) {
  if (run.phase === 'lost') return 0;
  if (run.phase === 'won') return C.music.intent.dawn;
  // a breather is the contract's own intent point (0.22): the formula's wave
  // term is a FIGHT term — carried into the rests it climbs to 0.40 by wave 6,
  // which is the drums playing over an empty street the state gate forbids
  if (run.phase === 'breather') return C.music.intent.breather;
  return intensityFor({ alive: run.alive, peakAlive: run.wave.peakAlive, hp: run.player.hp, waveIndex: run.waveIndex, captain: !!run.captain });
}

/**
 * MEASURED threat: what is actually bearing on the player — live enemies
 * within 20 m weighted by closeness (a body at 3 m counts 1, at 20 m 0),
 * over the wave's peak, plus missing HP.  This is game STATE, not intent.
 */
export function measuredPressure(run) {
  const p = run.player;
  let near = 0;
  for (const e of run.enemies) {
    if (e.state === 'dead') continue;
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    if (d < 20) near += d <= 3 ? 1 : 1 - (d - 3) / 17;
  }
  return C.music.aliveW * Math.min(1, near / run.wave.peakAlive) + C.music.hpW * (1 - p.hp / C.player.hp);
}

/** One trace sample per second from a run; the referee records these. */
export function traceSample(run) {
  return { t: run.time, phase: run.phase, wave: run.waveIndex, intensity: intensityOf(run), measured: measuredPressure(run), alive: run.alive, captain: !!run.captain };
}

/**
 * Gate a series against MEASURED game state.  `series[i]` is the layer's
 * value at trace[i]; the run's own intensity is one candidate, the null
 * models are the others.  Three tests, none scale-invariant:
 *   1. detrended tracking — correlation between the series' and the
 *      measured pressure's deviations from their per-wave means ≥ 0.5;
 *   2. breather depth — in every breather the series' mean is ≤ 0.30 AND at
 *      least 0.10 under the LOUDEST moment of the preceding wave's fighting
 *      (a wave is mostly the walk between knots; the breather is judged
 *      against what the wave reached, not its average).  0.10, not
 *      more: the contract's own mapping opens only 0.30 above the breather
 *      at wave 1 with everybody alive, and an expert never has everybody
 *      alive;
 *   3. quiet-fight honesty — over wave samples with measured pressure < 0.2
 *      (≤ 2 bodies near, healthy) the series' mean stays ≤ 0.55: no war
 *      drums over an empty street.
 */
export function checkAgainstTrace(trace, series) {
  const waves = [...new Set(trace.map((s) => s.wave))];
  const detrend = (vals, key) => {
    const out = new Array(trace.length).fill(0);
    for (const w of waves) {
      const idx = trace.map((s, i) => (s.wave === w && s.phase === 'wave' ? i : -1)).filter((i) => i >= 0);
      if (!idx.length) continue;
      const mean = idx.reduce((a, i) => a + (key ? trace[i][key] : vals[i]), 0) / idx.length;
      for (const i of idx) out[i] = (key ? trace[i][key] : vals[i]) - mean;
    }
    return out;
  };
  const a = detrend(series, null); const b = detrend(null, 'measured');
  let sab = 0; let saa = 0; let sbb = 0;
  for (let i = 0; i < trace.length; i += 1) { if (trace[i].phase !== 'wave') continue; sab += a[i] * b[i]; saa += a[i] * a[i]; sbb += b[i] * b[i]; }
  const tracking = saa > 1e-9 && sbb > 1e-9 ? sab / Math.sqrt(saa * sbb) : 0;
  let breatherOk = true; let breathers = 0; let depthMin = Infinity;
  for (const w of waves) {
    const fight = trace.filter((s) => s.wave === w && s.phase === 'wave');
    const rest = trace.filter((s) => s.wave === w && s.phase === 'breather');
    if (!rest.length || !fight.length) continue;
    breathers += 1;
    const fv = fight.map((s) => series[trace.indexOf(s)]).sort((a, b) => a - b);
    const mf = fv[fv.length - 1];
    const mr = rest.reduce((x, s) => x + series[trace.indexOf(s)], 0) / rest.length;
    depthMin = Math.min(depthMin, mf - mr);
    if (mr > 0.30 || mf - mr < 0.10) breatherOk = false;
  }
  const quiet = trace.map((s, i) => (s.phase === 'wave' && s.measured < 0.2 ? series[i] : null)).filter((v) => v !== null);
  const quietMean = quiet.length ? quiet.reduce((x, v) => x + v, 0) / quiet.length : 0;
  const pass = tracking >= 0.5 && breatherOk && quietMean <= 0.55;
  return { pass, tracking: +tracking.toFixed(3), breathers, breatherOk, depthMin: Number.isFinite(depthMin) ? +depthMin.toFixed(3) : null, quietSamples: quiet.length, quietMean: +quietMean.toFixed(3) };
}

/** The null-model table every curve gate ships with. */
export function nullModels(trace, seed = 5) {
  const n = trace.length;
  let s = seed | 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const intent = C.music.intent;
  return {
    flat: new Array(n).fill(0.6),
    ramp: trace.map((_, i) => i / Math.max(1, n - 1)),
    noise: trace.map(() => rnd()),
    // the intent curve by wave index alone — what a layer gated against the design would play
    'intent-by-wave': trace.map((t) => (t.phase === 'breather' ? intent.breather : intent[C.waves[t.wave].id])),
  };
}
