# REVIEW-BUNDLE — JUICE BOX (battery B1, round 3 — the closing round)

Factual launch + instrumentation only. Loop contract incl. A5–A7:
LOOP-CONTRACT.md. A7 at e892c8d (13:44) BEFORE the round-3 code; shared
substrate ee984ca (FixedStep + InputTape, VFX point size, text cap) and
e54f504 (drift gate prose scan); entry 7328d19. Commit hygiene note: the
entry commit was first cut as ef56565, which swallowed 14 staged files
belonging to the FPS build; it was rewritten to 7328d19 with only B1
paths (incident reported to the coordinator; TRAPS row added). No
evaluation here.

## Launch

```
cd ~/Documents/ChatGPT/animation/battery
npm run dev        # port 5183
# open http://127.0.0.1:5183/juicebox.html
```

## Gates — output PASTED from the runs at e54f504 (tree identical to 7328d19 for this entry)

```
node scripts/check-juicebox-replay.mjs     # headless Chrome; the reproducibility gate
```
```
recorded: 3594 ticks, 51 inputs, 5 checkpoints, score 370, dropped 0.0000s
PASS  recording produced checkpoints and inputs
PASS  replay @ 30 fps: 5 checkpoints byte-identical to the recording — score 370 (recorded 370), dropped 0.0000s
PASS  replay @ 60 fps: 5 checkpoints byte-identical to the recording — score 370 (recorded 370), dropped 0.0000s
PASS  replay @ 90 fps: 5 checkpoints byte-identical to the recording — score 370 (recorded 370), dropped 0.0000s
PASS  replay @ 144 fps: 5 checkpoints byte-identical to the recording — score 370 (recorded 370), dropped 0.0000s
PASS  replay @ jittered 30-70 fps: 5 checkpoints byte-identical to the recording — score 370 (recorded 370), dropped 0.0000s
PASS  delivered dash reach @ 30 fps = 3.2 ± 0.05 m — median 3.200 m over 51 dashes
PASS  delivered dash reach @ 60 fps = 3.2 ± 0.05 m — median 3.200 m over 51 dashes
PASS  delivered dash reach @ 90 fps = 3.2 ± 0.05 m — median 3.200 m over 51 dashes
PASS  delivered dash reach @ 144 fps = 3.2 ± 0.05 m — median 3.200 m over 51 dashes
PASS  delivered dash reach @ jittered 30-70 fps = 3.2 ± 0.05 m — median 3.200 m over 51 dashes

ALL PASS
```

```
node scripts/check-juicebox-feel.mjs       # rendered-space ladder on COMPOSITES, play camera
```
```
PASS  coverage: 11 declared, 11 wired
PASS  runtime feel check
wired-parameter ladder (kept, informational): whiff=0.72  single-pop=2.44  double-line=7.70  gold-pop=13.64  triple-line=11.20  oni-hit=7.32
  whiff   shake 0.0 px · hitstop 0 f · changed px 14390 · text false → 10.00
  single  shake 0.0 px · hitstop 0 f · changed px 13491 · text true → 12.00
  double  shake 7.8 px · hitstop 4 f · changed px 14561 · text true → 27.83
  gold    shake 7.2 px · hitstop 6 f · changed px 7859 · text true → 31.17
  triple  shake 29.8 px · hitstop 6 f · changed px 33572 · text true → 53.75
  hit     shake 3.8 px · hitstop 3 f · changed px 14618 · text false → 19.84
PASS  rendered ladder monotone in banked value (whiff < single < double < gold < triple)
PASS  being hit is not louder than the best good moment (rendered) — hit 19.84 vs triple 53.75
PASS  gold shakes visibly more than a single (≥ 3 px more) — 7.17 vs 0 px
PASS  a single pop changes ≥ 400 px (particles read at the court camera) — 13491 px changed

ALL PASS
```

```
node scripts/check-juicebox.mjs            # headless curve gate at SIM_DT — 4 RED rows, recorded
```
```
sim dt = 0.008333 s (SIM_DT); referee also run at 1/60 s below for the record
· curve:greedy-score (recorded, window retired by A7): median greedy 1490, router 1340
✗ decision:router-reads-lines: router multiPops 3 vs greedy 5 (need >= 1.4x = 7.0) — lines READ, not collected
✗ decision:router-outscores-greedy: router median 1340 vs greedy median 1490; router wins 3/7 seeds
· referee @ dt 1/60 (record): router median 1100 vs 1340 at SIM_DT
✓ curve:execution-headroom: expert-reflex router 950 vs novice-reflex router 630 (need >= 1.3x = 819)
· curve:planning-headroom: oracle 840 vs router 950 at the same noise = 0.88x (recorded; A5 withdraws the substitution)
✓ curve:reachability: 0/661 scheduled spirits unreachable from the worst corner
✓ curve:gold-reachable: gold at 7m needs 1.32s < ttl 2.3s
✓ curve:dead-air: median dead air 0.30s (<= 1.5s)
✗ curve:max-combo: router median best combo 3 (need >= 5)
✓ curve:population: max simultaneous spirits 8 (band 1..8)
✓ oni:stun-tax: router stunned 0.0% of run time (< 8%); stuns median 0
· oni:standing-still-control: still bot: stunned 11.7% of run, 14 stuns (control, not a pass)
✓ supply:popped-fraction: router pops 66% of scheduled spirits (>= 45%)
✗ supply:combo-uptime: router at combo >= 2 for 28% of the run (>= 40%)
✓ economy:line-beats-gold: triple line 140 vs solo gold 60
✓ determinism: seed 42 twice: 1010/61 vs 1010/61
FAIL (4)
```

Drift: 33 juicebox constants match and the prose scan passes
(`node scripts/check-contract-drift.mjs`, ALL PASS — 56 constants across
three entries).

## The r2 findings, mechanically

| r2 finding | measured then | now |
|---|---|---|
| shell integrates per render frame; realised dash 2.13–3.20 m; 1.29× on one seed with zero input variation; replayed tape 680 vs 1740 | see left | sim on `SIM_DT` 1/120 through `FixedStep`; render interpolates; inputs stamped with their sim tick; **byte-identical state at 30/60/90/144 fps and jittered dt; dash 3.200 m at every rate** |
| every gate at dt = 1/60 | — | the curve gate states its dt and steps at SIM_DT; the 1/60 referee is printed for the record (router median 1100 vs 1340 — the pure sim IS step-dependent, which is why the shell may never run it at anything else) |
| drift gate read only the block; prose carried 3.6 m / 0.16 s / 1.9 s / 5× / 1.78× | 14 constants | prose reconciled; block extended to 33 constants (10 marked recorded, not designed); the gate scans prose for unit-bearing numbers the block does not carry |
| ladder judged synthetic singles; double 16.07 > gold 8.41; particles 1–2 px | — | rendered ladder on composites at the play camera (shake px, hit-stop frames, changed px, text): single 12.0 < double 27.8 < gold 31.2 < triple 53.8; hit 19.8; shake translates the frame; VFX point size ×3.75 |
| "lines are not read, they are collected" — multiPops 14.6 vs 15.1 | — | clusters are LINES (1.3–1.7 m spacing, per-cluster axis); the n-th pop multiplier, combo growth and the multiPops count pay only within 15° of the axis; the referee gains an alignment dash. Result: **aligned multiPops greedy 5 vs router 3; router median 1340 vs greedy 1490; router wins 3/7** — RED, recorded. The referee aligns 4–10 times per run and converts poorly; A7's design change did not make reading pay. |
| whiff 53–62 % of inputs silent | — | `whiff` event: grey trail fizzle + dull tick + 4 dark specks |
| player occluded by the oni during a stun | — | oni renders behind; the box draws through it while stunned; the ring is always on top |
| text collision; fade has no read; gold blink shrinks it; seed label shows two seeds | — | texts capped at two; fading spirit shrinks + dims over its last 0.5 s and the combo label steps down; gold blinks by opacity; score screen shows the run's own seed |
| A6 window drawn from the instrument's spread | — | retired; decision rows replace it |

## Recorded, not scored

- Combo ceiling 3 and combo uptime 28 % under aligned-only growth (were 5
  / 45 % when any clip grew the combo): the combo economy was living on
  collected lines.
- Execution headroom 1.51× (expert 950 vs novice 630) at SIM_DT.
- Oni: stun tax 0.0 % for the router, 11.7 % standing still — the r2
  "inert vs counterplay" ambiguity stands; no new instrument.

## Instrumentation

- `__drive(rawDts, {everyTicks})` — drives the shell at an explicit render
  cadence; exact-tick checkpoints + realised dash lengths.
- `__game.startRun({record, replay, seedOverride})`, `__game.tape`,
  `__game.stateHash()`, `__game.pause()`.
- `__renderedMoment(kind)` — fires a composite at a fixed court point and
  measures shake px / hit-stop frames / changed px / text.
- `__feelCheck`, `__feelLadder` (wired-parameter, informational),
  `__latencyCheck`, `__playCheck`, `__autoplay`.

## Evidence

The reviewer's own harness produced r2's frames; this round's evidence is
the gate output above (the round is about reproducibility and rendered
magnitude, both numeric). `capture-juicebox-evidence.mjs` still writes
jb2-* frames from an autoplay run if frames are wanted.

## B1 closes here (per A7 and the coordinator). Lessons carried to Stage C:
fixed timestep + replay gate (shared engine), delivered-value drift, the
rendered ladder, windows from intent, and "a line must be READ" as an
unsolved design question.
