# INTENSITY RIDE — loop contract (battery B4)

A three-minute scripted encounter whose every system — spawns, enemy mix,
adaptive music tiers, feedback magnitudes, lighting — is choreographed to
ONE written intent curve. The battery point: prove the stack can carry a
DESIGNED emotional shape (rise, breathe, rise, climax, release) rather than
a flat drip, and prove it with a gate that measures the shape the player
actually experiences against the shape the designer wrote.

**Skill axis: HYBRID (execution + reaction), declared.** Headroom
instrument: actuation-noise profiles on the same policy — expert (120 ms /
4°) vs novice (340 ms / 16°) — the B1 taxonomy. The winnability referee is
the NOVICE bot (nightbloom lesson: a clean-information bot certifies
nothing about humans).

## The intent curve (the design, as numbers)

Intensity is a 0..1 scalar. The designer writes it as keyframes; the game
reads it every frame (linear interpolation). Three minutes:

| t (s) | intent | beat |
|---|---|---|
| 0 | 0.15 | arrival — the corner at dusk, first slimes wander in |
| 25 | 0.45 | first push |
| 45 | 0.30 | breathe — the push thins, a gem or two |
| 70 | 0.65 | second push: bats + boneheads, the mix widens |
| 95 | 0.40 | breathe — enough to level, not enough to rest |
| 120 | 0.80 | the surround: a bat ring |
| 140 | 0.55 | a short exhale |
| 150 | 1.00 | climax: the elite brute, everything on |
| 172 | 0.95 | hold |
| 180 | 0.10 | release — silence but the practicals, the last kill echoes |

What the intent curve DRIVES (each a pure function of intent):
- **spawn cadence**: `spawnEvery = lerp(1.6 s, 0.28 s, intent)`; **mix**
  widens with intent (slime → bat → bonehead → imp → wisp; the elite is a
  scripted event at 150 s, never a mix roll).
- **music**: `AdaptiveMusic.setIntensity(intent)` — the loop's tier
  windows ARE the ride's tiers (pad → sparse drums → straight → drive).
- **feedback magnitudes**: the hit/kill ladder scales with intent (a kill
  at 0.15 is a tap; a kill at 1.0 is a hit-stopped, shaken, particle-lit
  event). Ladder gated (monotone in intent AND in value) with the shared
  `Feel.checkLadder`.
- **light**: the practical pool warms and the sky falls toward night as
  intent rises (dusk → night by the climax); the release brings the
  practicals alone.

## What must hold (gated)

1. **Tracking** — the MEASURED intensity (a normalized blend of threat
   pressure: live enemies within 8 m, incoming-damage rate, kill rate,
   smoothed over 3 s) tracks the intent curve: Pearson r ≥ 0.75 over the
   run and mean absolute error ≤ 0.18, for the router bot at EXPERT noise.
   Breathers are real: measured intensity at 45 s and 95 s is at least 0.15
   below its value at the preceding peak.
2. **Climax** — at 150–172 s the elite is alive and the drive-drums tier
   is audible (music intensity ≥ 0.82 → the `drumsDrive` window is open).
3. **Winnability, refereed honestly** — NOVICE bot survives the full 180 s
   on ≥ 4/6 seeds; EXPERT on 6/6. Partial survival prints as seconds,
   never a checkmark.
4. **Headroom** — expert kills ≥ 1.3× novice kills (same policy).
5. **Feel ladder** — `check-ride-feel.mjs`: kill magnitude at intent 1.0 >
   at 0.55 > at 0.15; player-hurt never outranks the climax kill; coverage
   of every `RIDE_EVENTS` type.
6. **Play camera** — the follow camera keeps ≥ 90 % of live threats within
   12 m inside the frustum (p10 over the run ≥ 0.8); measured with the
   nightbloom legibility terms (ID-pass pixel share) at the climax.
7. **Determinism** — a seeded run twice is identical (instrument rule:
   measurement bots may seed; players fight `Math.random`).
8. **Drift** — the `constants` block below vs code.

## Substrate (what B4 may change in shared code)

`charforge/src/survivors/systems.js` `Run` gains an injectable
`timeline` ({ waves, events } or a function of time) so B4 supplies its own
choreography; default behavior unchanged for nightbloom and the balance sim
(their gates must stay green). `Run.pressure()` exposes the measured
intensity inputs. Nothing else in charforge changes for B4.

## Feel contract

`RIDE_EVENTS`: spawn, enemy-hit, kill, elite-spawn, elite-kill, gem,
player-hurt, level-up, beat (a curve keyframe passed — the music's tier
boundary is its consumer), victory, defeat. Every type wired or the lint
fails.

## Evidence set (REAL frames via the harness, play camera only)

`ride-arrival` (t≈5), `ride-push1` (t≈30), `ride-breathe` (t≈50),
`ride-surround` (t≈125), `ride-climax` (t≈158), `ride-release` (t≈178),
plus `ride-curve.svg`: the intent curve and the measured curve on one
plot, from the gate's own run.

## Non-goals

Upgrades UI beyond the survivors cards; a second character; the town
outside the corner; day/night beyond the intent-driven dusk ramp.

```constants
RIDE_SECONDS = 180
CURVE.length = 10
TRACK.minR = 0.75
TRACK.maxMAE = 0.18
TRACK.breatherDrop = 0.15
SPAWN.everyMax = 1.8
SPAWN.everyMin = 0.6
SPAWN.hpScaleMax = 1.35
SPAWN.lead = 4
CLIMAX.at = 150
CLIMAX.minMusic = 0.82
CLIMAX.holdUntil = 172
HEADROOM.min = 1.3
HEADROOM.floorPerMin = 10
```

## Amendments

**A1 (first headless measurement, before any code change to the ride).**
`check-ride.mjs` at the contract's original constants (SPAWN.everyMin
0.28, everyMax 1.6, 8-minute HP scaling inherited from data.js):

- Winnability: novice 0/6 (survived 133, 134, 88, 122, 89, 153 s), expert
  0/6 (113, 151, 62, 83, 59, 86 s). Nobody reaches the climax.
- Elite alive during the 150–172 s hold on 1/6 expert seeds.
- Breather drop: median 0.000 — the measured curve never comes down
  because the board never clears; tracking r 0.750 / MAE 0.114 only
  because the first 60 s track before the backlog swamps everything.
- Headroom: expert 70 vs novice 145 kills — the faster-reacting bot
  jitters (re-decides every 120 ms) and dies sooner; an instrument
  artifact, not a design signal.

Cause, by design: the intent→cadence map put 8-minute late-game density
(0.28 s spawns ≈ the 400 s+ wave) at 150 s on a character with two
minutes of upgrades, and the elite inherited `HP_SCALE(150)` ≈ 1.95×
(≈ 819 HP). The ride must own its own scaling.

Design changes (numbers moved, failed numbers kept above):
- `SPAWN.everyMin` 0.28 → **0.5**, `SPAWN.everyMax` 1.6 → **1.8**.
- The timeline owns enemy HP scaling: `hpScale = 1 + intent ×
  (SPAWN.hpScaleMax − 1)`, max **1.5** (substrate: `Run` reads
  `timeline.hpScale?.(t)` before falling back to `HP_SCALE`).
- Instrument, not design: the ride's referee bot becomes the campaign's
  standard survivors kiting policy (circle-strafe + hard dodge + gem sweep
  + wall bias, from nightbloom's `__playCheck` / `simulate-run`) with the
  same actuation-noise profiles. The weak first bot is retired.

The tracking, breather, climax, winnability and headroom windows are
unchanged. Whatever the second measurement says is recorded as-is.

**A2 (second measurement, after A1's code landed; before any gate edit).**
- Winnability: expert **5/6** (180,180,180,179,180,180 s), novice **3/6**
  (180,171,180,180,167,154 s) — novice window is ≥ 4/6; short by one.
- Climax: elite alive through the hold on 6/6; drive tier open.
- Tracking: r **0.644** (≥ 0.75), MAE **0.288** (≤ 0.18), breather drop
  **0.109** (≥ 0.15). The measured series sits at 0.09–0.21 for most of
  the run and 0.59 in the hold: the instrument's fixed normalizers (near
  ÷ 12, damage ÷ 30, kills ÷ 10) were sized for A0's density and now
  under-read everything by ~3×. The SHAPE still tracks (the curve plot
  shows the same rises and falls at a third of the height).
- Headroom by kills: expert 187 vs novice 177 = **1.06×**. In a scripted
  ride nearly every spawn dies whoever plays (≈190 spawned); kills cannot
  express execution skill here. The number is recorded; the axis is NOT
  substituted without coordinator sign-off (campaign rule). Proposed
  replacement, pending ruling: damage taken, novice ÷ expert ≥ 1.3×.

Instrument change (the design is untouched): measured intensity is
judged as a SHAPE — the sampled series is divided by its own run maximum
before comparison, so the gate has no hand-sized normalizers to drift
(the weights 0.55 / 0.25 / 0.20 / elite +0.15 stay as written before the
first measurement). Windows unchanged: r ≥ 0.75, MAE ≤ 0.18 on the
normalized series, breather drop ≥ 0.15 normalized. If the normalized
shape still fails, the choreography changes — not the weights.

Shell bug (not a contract matter, recorded): the autoplay instrument
tripped the player's upgrade cards and froze the sim at the first
level-up during `__playCheck` (22.3 s); instruments bypass the cards.

**Coordinator ruling on the headroom axis (quoted):** "APPROVED, and this
is the legitimate case the rule was written to distinguish — the metric
is structurally incapable of varying (kills saturate because the script
guarantees every spawn dies), which is a measurement-validity argument,
not 'it failed so change it.' Conditions: (1) the kills row stays in A2
as a recorded finding with its 1.06× number; (2) define damage-taken so
it doesn't saturate the other way — novice deaths truncate damage taken,
so measure it as damage per minute survived, and floor the expert
denominator so a near-zero expert doesn't blow the ratio up into a vanity
number; (3) state the design implication in the contract: a ride where
the kill count is fixed by choreography means ALL the danger is incoming
damage, so the feel ladder and the telegraphs are load-bearing for skill
expression — that's a design property to gate, not just a metric note;
(4) survival referee stays as written: expert 5/6 against a 6/6 target is
currently a FAIL — resolve it by tuning the choreography or the
telegraphs, never the window."

Applied:
- Headroom = damage taken per minute survived, novice ÷ max(expert,
  `HEADROOM.floorPerMin`) ≥ `HEADROOM.min` (1.3). Kills row kept: 1.06×.
- Design implication, stated: with the kill count fixed by the script,
  every unit of danger is INCOMING damage. Therefore (a) the intent
  ladder on `player-hurt` and `kill` is load-bearing and stays gated; (b)
  every source of damage telegraphs — the imp's charge gets a wind-up
  read (flash + swell over its 0.4 s before the lunge) like the elite's
  marker; gated in the feel/legibility pass as "no un-telegraphed
  charger": the imp is legible during its wind-up ≥ 80 % of sampled
  charge frames.
- Survival (expert seed 4 died at 179 s, in the release): the release
  beat now means what it says — after `CLIMAX.holdUntil` the timeline
  stops spawning (the remaining board is the release). The window stays
  6/6; the next measurement is recorded whatever it says.
- Camera bug found by `check-ride-camera.mjs` (recorded): the camera
  occluder set included the player's own body, so the pullback probe hit
  his hair and parked the camera inside his head (p10 0, legibility
  0.023). Occluders are world geometry only.

**A3 (third measurement, after A2's release-stops-spawns; before any
further code change).**
- Survival: expert **6/6** (the release fix held). Novice **2/6**
  (179, 171, 180, 180, 167, 154 s) — every novice death is inside the
  climax/hold (150–172 s) or the first seconds after it.
- Headroom (damage per minute survived): novice 49.2 vs expert 28.0 =
  **1.76×** (≥ 1.3). Kills row: 1.04× (recorded).
- Tracking (normalized): r **0.665** (≥ 0.75), MAE **0.214** (≤ 0.18),
  breather drop **0.141** (≥ 0.15). Measured at the keyframes, expert
  seed 1: 25 s 0.18 · 45 s 0.13 · **70 s 0.12** (intent 0.65) · 95 s 0.09
  · **120 s 0.21** (intent 0.80) · 140 s 0.09 · **150 s 0.13** (intent
  1.00) · 172 s 0.59 · 180 s 0.33. The pushes at 70 s and 120 s and the
  climax's first seconds do not register: by 70 s the blade is level 4–5
  and clears the cadence at range, so "near" never accumulates; the bat
  ring (9 HP each) is gone in two swings. The shape is wrong because the
  pushes are not pushes, not because the instrument is.
- Camera (headless Chrome, before the light/boom change): p10 **0.636**
  (≥ 0.8), climax legibility **0.432** (≥ 0.6), elite legibility 1.0.
  A 46° camera on a 13 m boom shows ±5.5 m along the tilt; the 12 m
  combat radius cannot be in frame by construction, and at the night
  climax dark chaff on dark ground fails the contrast term.

Design changes (choreography and presentation; windows untouched):
- Pushes become scripted BURSTS on top of the cadence so they land
  regardless of weapon level: 25 s — a cluster of 6 slimes at 6 m;
  70 s — a ring of 8 boneheads (30 HP, the blade cannot clear it in one
  swing) at 7 m; 120 s — the bat ring stays, 18 → 24; 150 s — the elite
  arrives WITH a ring of 10 slimes so the climax's first seconds are
  dense, not the elite alone walking in.
- Climax mix: the imp (charger) weight at intent ≥ 0.75 is capped so the
  hold is a swarm to cut through, not a charger gauntlet (novice deaths
  clustered on imp charges at 2.6× speed).
- Presentation for legibility: a warm bloom light rides the player
  (14–28 intensity, rising with intent); the battle boom goes 13 → 15 m
  (`hero.battleDist`, a per-game knob added to the shared Hero — default
  unchanged for nightbloom).

Fourth measurement to be recorded whatever it says.

**A4 (fourth measurement, after A3's bursts; before any further code
change).**
- Now green: MAE **0.176**, breather drop **0.337**, expert **6/6**,
  headroom **1.58×**; camera gate ALL PASS (p10 **0.80**, climax
  legibility **0.723**, elite 1.0) — the bloom light and the 15 m boom
  did what A3 said.
- Still red: r **0.670** (≥ 0.75); novice **1/6** (165, 80, 180, 167,
  163, 165 s) — worse than A3's 2/6. Seed 2 died at 80 s to the 70 s
  bonehead ring at level 3; the rest died in the hold.
- Why r stays low, read off the keyframes: a burst fired AT a keyframe
  registers 3–4 s later (spawn at 6–7 m, walk-in, the declared 3 s
  smoothing) — 70 s reads 0.09 and 150 s reads 0.17 while 140 s reads
  0.24 and 172 s reads 0.79. The measured shape is the intent shape
  shifted late. The instrument's lag is declared (`TRACK.smooth`); the
  design should LEAD the beat rather than the gate forgiving the lag.

Design changes (choreography; windows untouched, instrument untouched):
- Every burst fires 4 s BEFORE its keyframe: 21 s, 66 s, 116 s, and the
  climax company at 146 s with the elite still at 150 s.
- Ring sizes for the novice: boneheads 8 → **5**, climax slimes 10 →
  **6**, bats stay 24 (9 HP each — volume, not lethality).
- The hold is a swarm, not a wall: `SPAWN.everyMin` 0.5 → **0.6**,
  `SPAWN.hpScaleMax` 1.5 → **1.35**. (Both were set in A1 from the first
  measurement; this is the second and last cadence move — if the novice
  referee is still red after A4, it ships red as a recorded finding.)

Fifth measurement to be recorded whatever it says.

**A5 (fifth measurement — the round-1 bundle ships on these numbers; no
further tuning before review, per A4).**
- Tracking: r **0.736** (≥ 0.75 — red by 0.014), MAE **0.182** (≤ 0.18 —
  red by 0.002), breather drop **0.302** (green). Keyframes, expert seed 1:
  25 s 0.32 · 45 s 0.20 · 70 s 0.31 · 95 s 0.10 · 120 s 0.55 · 140 s
  0.20 · 150 s 0.44 · 172 s 0.62 · 180 s 0.50 — the shape now has every
  rise and fall in the right order; the residual is the climax's first
  seconds (0.44 vs 1.0) and a release that decays slower than the curve
  drops (0.50 vs 0.10 at 180 s).
- Survival: expert **6/6**; novice **1/6** (157, 84, 169, 133, 106,
  180 s) — red, recorded. The novice referee (340 ms, ±16°) does not
  survive a ring at any size tried; whether the ride should be
  novice-survivable at all is a design question for the review.
- Headroom (damage/min): novice 58.7 vs expert 29.3 = **2.00×** (green).
  Kills row: 1.19× (recorded).
- Climax: elite alive through the hold 6/6; drive tier open. Camera gate:
  p10 **0.80**, climax legibility **0.703**, elite legibility **1.0**
  (green). Determinism green. Drift: 28 constants match.
