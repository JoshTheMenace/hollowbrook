# REVIEW-BUNDLE — JUICE BOX (battery B1, round 2)

Factual launch + instrumentation only. Loop contract incl. Amendments A5
(6157480, 12:50) and A6 (2f8cbd8, 12:57), both committed BEFORE the
implementation they authorize. No evaluation here.

## Launch

```
cd ~/Documents/ChatGPT/animation/battery
npm run dev        # port 5183
# open http://127.0.0.1:5183/juicebox.html
```

WASD/arrows or click to dash. `[` `]` change seed.

## Gates (exit-coded, in-tree)

```
node scripts/check-juicebox.mjs --detail   # designed curve (A5/A6 rows)
node scripts/check-juicebox-feel.mjs       # coverage + LADDER (headless Chrome)
node scripts/check-contract-drift.mjs      # contract constants vs code (all entries)
```

Recorded run at this commit, verbatim:

```
✓ curve:greedy-score: median greedy score 3210 (window 1500..4500, A6)
✓ curve:execution-headroom: expert-reflex router 1410 vs novice-reflex router 930 (need >= 1.3x = 1209)
· curve:planning-headroom: oracle 1480 vs router 1410 at the same noise = 1.05x (recorded; A5 withdraws the substitution)
✓ curve:reachability: 0/653 scheduled spirits unreachable from the worst corner
✓ curve:gold-reachable: gold at 7m needs 1.32s < ttl 2.3s
✓ curve:dead-air: median dead air 0.00s (<= 1.5s)
✓ curve:max-combo: router median best combo 5 (need >= 5)
✓ curve:population: max simultaneous spirits 8 (band 1..8)
✓ oni:stun-tax: router stunned 0.0% of run time (< 8%); stuns median 0
· oni:standing-still-control: still bot: stunned 11.6% of run, 14 stuns (control, not a pass)
✓ supply:popped-fraction: router pops 66% of scheduled spirits (>= 45%)
✓ supply:combo-uptime: router at combo >= 2 for 47% of the run (>= 40%)
✓ economy:line-beats-gold: triple line 140 vs solo gold 60
✓ determinism: seed 42 twice: 2680/65 vs 2680/65

ladder magnitudes: whiff=0.56  single-pop=2.44  double-line=7.70  gold-pop=8.41  triple-line=11.20  oni-hit=7.32
PASS  ladder monotone in value + named pairs

ALL PASS — 14 constants match
```

## What changed since r1 (mechanical list, by review order)

1. **Ladder** — feel table moved to `feel-table.js` (the gate wires the
   SAME table the shell runs). shake/hitstop/burst are functions of value
   (shared engine: `Feel.magnitude`, `Feel.checkLadder`, fn-valued fx).
   r1 measured: whiff 0.194 trauma, gold pop 0 shake / 0 hitstop, multi-pop
   binary. Now: see magnitudes above; multi-pop scales with count.
2. **Oni** — freezes to telegraph 0.5 s (swelling ring + scale), bites its
   1.07 m threat radius; a dash is an i-frame; stun 1.2 → 0.5 s; cooldown
   1.0 s. Router bot reads the telegraph and dodges. Stun tax gated < 8 %
   (router 0.0 %); standing-still control printed (11.6 %, 14 stuns).
3. **Gold economy** — gold resolves at spawn RELATIVE TO THE PLAYER (far
   side, 5–7 m band; deterministic for identical play, unscriptable
   board-blind). Repriced: n-th pop of a dash = 10·n·combo; gold 30·combo,
   +1 combo. Triple line 140 > solo gold 60. Original planning metric
   re-measured: **1.05×** (A6 first measurement was 0.80×; after the oni
   freeze the oracle's pre-positioning stopped colliding with frozen onis).
   Execution axis: 1.52× (both policies router, EXPERT vs NOVICE noise).
4. **Combo** — fade DECAYS one step (was board-wide reset). Gates:
   popped fraction ≥ 45 % (66 %), combo uptime ≥ 40 % (47 %). Pop text is
   staggered by n-th/combo parity.
5. **Legibility** — recovery ring under the box (fills over 0.45 s; solid
   red while stunned); gold = unlit bright #ffe36a with a rotating halo,
   decor lanterns dimmed to #8a6a4a; final 10 s: court rim pulses red,
   vignette, clock ticks; best score in localStorage, score screen shows
   delta ("new best +N" / "best N (−M)").
6. **Contract sync** — A5 declares the real constants (recovery 0.45,
   chain 1.6, oni everything); drift gate diffs 14 constants across
   juicebox + errand.
7. Tooling — `.shots/` excluded from the Vite watcher in this entry
   (`server.watch.ignored`).

## Instrumentation

- `__feelCheck()`, `__feelLadder()` — coverage / ladder on the live table.
- `__latencyCheck()`, `__playCheck(seconds)` — unchanged from r1.
- `__autoplay(on)` — an EXPERT-noise greedy bot plays through the real
  loop at rAF cadence (for evidence capture only; `stats()` on the run
  reports stunTax / poppedFraction / comboUptime / whiffs).
- `__game` — { run, startRun, feel, music, camera, seedSet }.

## Evidence (REAL compositor frames through the fixed play camera, .shots/jb2-*.png)

jb2-title, jb2-open, jb2-multipop (captured on the `multi-pop` event),
jb2-telegraph (mid wind-up), jb2-gold-live, jb2-final10, jb2-score.
Captured by `scripts/capture-juicebox-evidence.mjs`; autoplay run stats
for that capture: score 1730, bestCombo 4, pops 62, whiffs 49, stuns 1,
stunTax 0.8 %, poppedFraction 60 %, comboUptime 24 % (a greedy bot, not
the router — the gate rows above are the router's numbers).

## Recorded, not scored (builder states facts)

- Greedy-nearest outscores the router on 4/7 seeds under the A5 economy
  (table in `--detail`). Bots are instruments; whether nearest-dash
  spam should beat routing is a design question for the review.
- Planning headroom 1.05×: the design pays little for planning; it pays
  for execution (1.52×) and line-reading.
