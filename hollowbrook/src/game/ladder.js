/* The ladder formula, as the contract writes it:
 *   magnitude = 10·shake + 40·hitstop + burst/4 + 2·[text] + 1·[sfx]
 * charforge's Feel.magnitude() weighs the same five things differently
 * (vol·2, burst·0.08, text·0.2), so the gate reads THIS — the contract's
 * weights over the same wired table — and the runtime twin
 * (`__feelCheck` → checkLadder) is run on the live Feel to prove the wired
 * table is the one the game plays.  Pure; no THREE. */
import { CONTRACT } from './data.js';
import { FEEL } from './feeltable.js';

const W = CONTRACT.ladderWeights;

export function magnitude(event, data = {}) {
  const fx = FEEL[event];
  if (!fx) return 0;
  const val = (v) => (typeof v === 'function' ? v(data) : v);
  return W.shake * (val(fx.shake) ?? 0) + W.hitstop * (val(fx.hitstop) ?? 0)
    + W.burst * (val(fx.burst)?.count ?? 0) + W.text * (fx.text ? 1 : 0) + W.sfx * (fx.sfx ? 1 : 0);
}

/** The contract's order must be non-decreasing, plus its two named pairs. */
export function checkLadder() {
  const problems = [];
  const mags = CONTRACT.ladder.map(([ev]) => [ev, magnitude(ev, { count: 2, name: 'w', damage: 12, index: 0 })]);
  for (let i = 1; i < mags.length; i += 1) {
    if (mags[i][1] < mags[i - 1][1] - 1e-9) problems.push(`inverted: ${mags[i][0]} (${mags[i][1].toFixed(2)}) < ${mags[i - 1][0]} (${mags[i - 1][1].toFixed(2)})`);
  }
  const m = Object.fromEntries(mags);
  if (m['bolt-miss'] > m['bolt-hit']) problems.push('a whiff outranks a hit');
  if (m['player-hurt'] >= m['kill-shieldbearer']) problems.push('being hit outranks a shieldbearer kill');
  for (const [ev, declared] of CONTRACT.ladder) {
    if (Math.abs(m[ev] - declared) > Math.max(0.3, declared * 0.15)) problems.push(`${ev}: ${m[ev].toFixed(2)} vs declared ${declared}`);
  }
  return { problems, magnitudes: m };
}
