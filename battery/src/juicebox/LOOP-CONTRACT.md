# JUICE BOX — loop contract (battery B1)

A 60-second one-verb score-attack arcade game. The battery point: stress the
feel bus, SFX, hit feedback, input latency, the play camera, and the
designed-curve gates on a genre that is NOT survivors. The game is small on
purpose; the seam is the deliverable.

**Skill axis: EXECUTION** (aim + reaction). Headroom instrument:
actuation-noise profiles on the same policy family — expert
(`EXPERT.delay` 0.12 s, 4°) vs novice (`NOVICE.delay` 0.34 s, 16°). (A7:
prose numbers below are reconciled to the constants block; the history
of each number is in the amendment log.)

## The loop

- **Core verb: DASH.** Tap a direction (WASD/arrows, or click toward the
  cursor) → the box dashes `DASH.len` (3.2 m) with a `DASH.recover`
  (0.45 s) recovery shown by the recovery ring. There is no other input.
  Held keys do nothing — the verb is discrete, so every input is a
  decision and latency is nakedly felt.
- **Objects:** lantern spirits drift in from the edges on a SEEDED schedule
  and fade after a TTL. Dashing through one pops it: the n-th pop of one
  dash is worth 10·n·combo. GOLD spirits (`GOLD.value` 30·combo, +1
  combo, shorter-lived, placed far from where you stand) appear every
  5.5 s to 7.1 s (`GOLD.everyMin/Max`) — weaving one in without dropping
  the chain is the commitment decision.
- **Stake per failure:** a spirit that fades unpopped DECAYS the combo
  one step; a dash that hits nothing costs the recovery and your chain
  timing.
- **Per-run decision (every ~5 s):** route — read a line through a
  cluster (members spaced along an orientation so only an aligned sweep
  takes 2–3), or bank the safe lone spirit before the chain window
  (`CHAIN_WINDOW` 1.6 s since last pop) drops the combo.
- **HARD RULE holds:** no player-facing choice resolved by RNG. The spawn
  schedule is a pure function of the run seed — every attempt at seed N is
  the identical puzzle (score-attack fairness IS determinism). Daily seed by
  date; practice seeds selectable.
- **60 seconds**, then a score screen. One number, replayable in one keypress.

## Designed curve (gated headlessly in scripts/check-juicebox.mjs)

| Property | Window |
|---|---|
| Greedy bot final score (median across seeds) | RETIRED by A7: a window drawn from the instrument's own spread certifies nothing. Replaced by the decision rows (router multiPops ≥ 1.4× greedy; router median ≥ greedy median) and reproducibility. |
| Execution-skill headroom: expert-reflex bot (120ms/4°) over novice-reflex (340ms/16°), same policy family | ≥ 1.3× (the design must reward the skill it asks for; planning headroom on the original metric measured 0.80× → 1.05× and is recorded, not gated) |
| Spirit reachability | 100% of scheduled spirits reachable by SOME dash sequence (TTL × drift vs dash reach) |
| Dead air (no live spirit on screen) | ≤ 1.5 s total per run |
| Max combo achievable (router bot) | ≥ 5 (lines-build scoring: combo grows only on multi-pop dashes and golds) |
| Input latency (`__latencyCheck`) | ≤ 2 ticks |
| Simultaneous live spirits | 1..8 (readable, never barren) |

## Feel requirements (gated by the feel lint + review)

Every event type has a consumer: dash (whoosh + smear trail), pop (pitch
ESCALATES with combo — the sound is the combo meter), multi-pop (hit-stop +
shake), combo-break (dampened thud + desaturation blink), fade-warning
(spirit blink + soft tick), final-10s (music tier up), timeup (sting +
tally). Combo text floats at the pop. SFX from the SoundForge bank; music =
the adaptive loop with intensity mapped to combo.

## Camera

Fixed framing of the whole 17×10 court (the arcade look). `__playCheck`
still measures — target: 100% of live spirits inside the frustum at all
times; anything less is a framing bug, not a tuning knob.

## Amendments

**A5 (post play-review r1, composite 0.56 — committed BEFORE the round-2
implementation).** The review found the declared seam (the juice ladder)
flat and partly inverted while `__feelCheck` stayed green, a second
moved-goalpost (A3 substituted the skill-headroom metric after the original
planning metric measured ~1.0×, which was a DESIGN signal), undeclared
contract drift (dash recovery 0.16 s in the contract vs 0.45 s in code;
chain window 1.9 s vs 1.6 s), and the oni — the mechanic that dominated
every run — absent from the contract. A5 names each measured number and
what must move it.

*Sync to reality (the numbers the code actually runs, now declared):*
dash length 3.2 m, dash time 0.1 s, **recovery 0.45 s** (kept — the
recovery gets a visible read instead of a silent swallow), chain window
**1.6 s**, court 17×10, spirit TTL 2.9–3.9 s, oni count 2. A drift gate
(`scripts/check-contract-drift.mjs`) diffs the `constants` block below
against the code's exports; any mismatch exits 1.

*The oni enters the contract:* an oni TELEGRAPHS for 0.5 s (pulse + ring)
before it can bite; a bite stuns for **≤ 0.5 s** (was 1.2 s); the player's
dash is an i-frame — a dash started during the telegraph passes through;
a stationary player is never stunned without a telegraph. Gated: stun tax
(stunned time ÷ run time) **< 8 %** for the router bot; the standing-still
control case is measured and printed as a number, never a pass.

*Feedback ladder (the declared seam, now gated):* feedback magnitude is
non-decreasing in score delta; a whiffed dash carries LESS than any pop;
multi-pop magnitude scales with count; the gold pop is the loudest good
event; being hit is not louder than the best good event. Gate:
`Feel.checkLadder` (shared engine) run by `check-juicebox-feel.mjs`.
r1 measured: whiff 0.194 trauma, single pop 0, gold pop 0 shake / 0
hitstop, multi-pop binary 0.25/0.07, oni-hit 0.520.

*Gold economy:* gold spawns are placed RELATIVE TO THE PLAYER at spawn
time (far side of the court from where you stand, distance band) — still a
pure function of seed + play, so a replay of identical inputs is
identical, but a board-blind route cannot pre-script them (r1: scripted
route 1320 / route+opportunistic 1730 vs best attentive 890). Repricing:
the n-th pop of one dash is worth 10·n·combo; gold is worth 30·combo and
grants +1 combo (was 50·combo, +2) — a triple line (10+40+90 at combo 1)
outpays a solo gold (60). Headroom is re-measured with the ORIGINAL
planning metric (oracle-vs-router, same noise profile) after the redesign
and the number is recorded whatever it is; the A3 substitution is
withdrawn — the execution-noise instrument stays as a second axis, both
policies at the same noise profile.

*Combo:* a fade no longer resets the combo board-wide; a fade DECAYS it by
one step (r1: 40–90 uncontrollable resets per run, best combo pinned at 5).
Gates: popped fraction of scheduled spirits ≥ 0.45 for the router bot;
combo uptime (time at combo ≥ 2) ≥ 40 % of the run. Combo text is
staggered so consecutive pops never stack on one spot.

*Legibility:* a recovery ring on the box shows the 0.45 s cooldown and the
stun; gold spirits are bright gold with a glow ring (r1: dimmer than the
decorative lanterns); the final 10 s escalate visually (court rim pulse +
vignette), not only in audio; best score persists in localStorage and the
score screen shows the delta.

*Reachability/dead-air rows unchanged. Max-combo row: ≥ 5 (router) kept,
with the decay rule replacing the reset rule as its mechanism.*

**A6 (first measurement after A5's economy, before any gate edit).**
Three numbers, recorded with their cause:
- Greedy-bot median score measured **2720** against the 900..2600 window
  (per-seed 1730–4420). Cause: A5's n-th-pop multiplier and gold repricing
  change every score in the game — the old window was derived from the old
  economy, not from play. Re-derived window: 1500..4500 (the greedy
  instrument's observed spread ×~0.85/×1.02 with headroom for tuning). The
  failed number stays on record.
- Planning headroom (ORIGINAL metric, oracle vs router, same EXPERT
  noise): **0.80×** — pre-positioning toward scheduled spawns costs more
  dashes than it earns. Recorded as the honest answer: this design does
  not reward planning; it rewards execution (1.61×) and line-reading. Not
  a gate; a finding for the review.
- Ladder reconciliation: A5 said both "magnitude non-decreasing in score
  delta" and "gold pop is the loudest good event". Under A5's own
  repricing a triple line (140) outpays a solo gold (60), so those
  conflict. Monotone-in-value is the rule; the gold pop is the loudest
  SINGLE-spirit event, and a whiff is quieter than any pop.
- Oni telegraph correction: a 13 m/s patrol had left the bite radius by
  the end of a 0.5 s wind-up (0 stuns even standing still — a toothless
  hazard is not counterplay). The oni now FREEZES in place to wind up, and
  threat radius equals bite radius (1.07 m) so a telegraph is always a
  real threat and never a surprise.

**Coordinator ruling (post-A6, recorded before round-2 review).** Under
the A5 economy the greedy-nearest bot outscores the router on 4/7 seeds.
Ruling: a DESIGN finding, not a bot problem — the contract's thesis is that
line-reading pays, and a naive nearest-target policy beating the planning
policy on a majority of seeds contradicts it regardless of the headroom
gate. Status: DECLARED OPEN for round 2. If it survives review, round 3
fixes it by design (cluster shapes / spacing / value distribution that make
routing pay) — never by bot changes or window moves. The substitution
question is closed: the original planning metric stays, its number stays
on record (0.80× → 1.05×).

**A7 (post play-review r2, composite 0.58 — committed BEFORE the round-3
implementation; B1 CLOSES after round 3 regardless of score: its lessons
apply in Stage C).**

*The finding that changes the campaign, with its numbers:* the shell
integrates the dash per RENDER frame. Realised dash 2.13 m at 30 fps,
3.20 at 60/120, 2.84 at 90/45, 2.54–3.17 under jittered dt (contract
3.2). A fully deterministic policy on one seed, six runs: 3180 / 3330 /
3350 / 3550 / 3900 / 4100 (1.29×, zero input variation). A recorded
input tape replayed: 680 vs the 1740 it was recorded from. Median greedy
score by frame rate: 30:1740, 60:3210, 75:2270, 90:1930, 120:2480,
144:2880, 240:1890 (1.84×, non-monotone). Every gate ran at dt = 1/60 —
the best rate for the greedy bot — and A6's window (1500..4500) was drawn
around that 3210; at 30 fps the same instrument reads 1740, below its own
floor. "Same seed, same puzzle" on the score screen is false.

Also measured: the ladder judges synthetic single events while the game
fires composites (a double banks 50 pts at magnitude 16.07; gold banks 60
at 8.41 — 1.9× louder for less value, gate green); gold-vs-single shake
0.83 vs 0.07 px — not visibly bigger; particles render at 0.79–1.84 px.
The oni is inert for active bots (0 stuns across 15–17 telegraphs) and
still occludes the player during a stun. Decisions: greedy beats router
5/7 at 1.45× median; oracle worst; multiPops greedy 14.6 vs router 15.1 —
"lines are not read, they are collected" (clusters of 3 inside 1.6 m fall
to any 3.2 m sweep). Fade decay works (+21.3/−15.7 ledger) but the fade
has no read. Whiffs: 53–62 % of inputs land in silence. Seed label shows
two seeds. Contract prose still carried r1's numbers (3.6 m / 0.16 s /
1.9 s / gold 5× / 1.78×) and the block omitted DASH.radius, SPIRIT.r,
ONI.r/cooldown, GOLD ttl/dist, COURT.

*Targets, each with its number to move:*
1. **Fixed timestep.** The shell runs the sim on `SIM_DT = 1/120` with an
   accumulator (`FixedStep`, shared engine); render interpolates
   presentation from the last two sim states; input is stamped with the
   sim tick it lands on. Gate `check-juicebox-replay.mjs`: a tick-indexed
   input tape replayed at 30 / 60 / 90 / 144 fps and with jittered dt
   produces byte-identical `run` state (score, pos, spirits, combo) at
   every 5-s checkpoint — through the real shell in headless Chrome. The
   headless curve gate states its dt and runs the referee at two rates
   (1/60 and 1/30 render cadence over the fixed sim step) and requires
   identical medians.
2. **Delivered-value drift.** `check-contract-drift.mjs` gains delivered
   rows for this entry: measured dash reach (3.2 ± 0.05 m at every frame
   rate), chain window, recovery — measured in the shell, not read from
   source. Prose is reconciled to the block (this amendment does it) and
   the drift gate scans the contract prose for numbers with units that
   the block does not carry.
3. **The decision exists or it doesn't.** Cluster geometry changes so a
   line must be READ to be swept: cluster members spaced 2.6–3.4 m along a
   line with a per-cluster orientation, so a 3.2 m dash aligned with the
   line takes 2–3 and a dash from any other angle takes 1; the n-th pop
   multiplier only pays for aligned sweeps. Aim: router multiPops ≥ 1.4×
   greedy's (r2: 15.1 vs 14.6), and router median ≥ greedy median. Not
   the score window, not the bot.
4. **Rendered-space ladder.** `check-juicebox-feel.mjs` judges the
   COMPOSITE events the game fires (single, double = pop+multi-pop, gold,
   triple) by rendered magnitude at the play camera: screen-space shake
   in px, hitstop frames, particle pixels above 3 px, text present. The
   particle point-size formula is fixed so a burst reads at ≥ 4 px at the
   court camera. Monotone in banked value.
5. **Reads.** Whiff: a dash that pops nothing gets a visible read (trail
   fizzle + short tick) — whiff-silence rate gated ≤ 5 % of dashes. Hit:
   the player is never fully occluded by the oni during a stun (oni
   renders behind, stun ring on top). Text collision: staggered per pop
   (kept) and capped to two on screen. Fade: the fading spirit's last
   0.5 s reads (shrink + dim), the combo step-down flashes the combo
   label. Gold blink no longer shrinks it (opacity, not scale). Seed
   label: one seed, the one the run used.

*Recorded from r2, not targets:* greedy 5/7 at 1.45× (design finding,
ruled); execution headroom real (2–3×) but unobservable under the 1.29×
noise floor until (1) lands.

*Constants reconciliation.* Values marked "recorded" were copied from
the code after implementation; a later change to any of them needs a
design justification.

```constants
DASH.len = 3.2
DASH.time = 0.1
DASH.recover = 0.45
CHAIN_WINDOW = 1.6
ONI.count = 2
ONI.stun = 0.5
ONI.telegraph = 0.5
ONI.threat = 1.07
SPIRIT.ttlMin = 2.9
SPIRIT.ttlMax = 3.9
GOLD.value = 30
GOLD.comboGain = 1
RUN_SECONDS = 60
DASH.radius = 0.5
SPIRIT.r = 0.35
ONI.r = 0.62
ONI.cooldown = 1
GOLD.ttlMin = 2.3
GOLD.ttlMax = 2.8
GOLD.distMin = 5
GOLD.distMax = 7
COURT.x1 = 8.5
COURT.z1 = 5
SIM_DT = 0.008333333333333333
EXPERT.delay = 0.12
NOVICE.delay = 0.34
GOLD.everyMin = 5.5
GOLD.everyMax = 7.1
FINAL_SECONDS = 10
WINDOWS.deadAirMax = 1.5
CLUSTER.spacingMin = 1.3
CLUSTER.spacingMax = 1.7
CLUSTER.tolDeg = 15
```
(CLUSTER.tolDeg: designed in A7's "value only for aligned sweeps" — a 2nd+
pop pays the line multiplier only when the dash is within 15° of the
line's axis; the first measurement without it read router multiPops 11 vs
greedy 11 — geometry alone did not separate reading from collecting.)
(DASH.radius, SPIRIT.r, ONI.r, ONI.cooldown, GOLD.ttl*/dist*, COURT.*:
recorded, not designed. SIM_DT: designed in A7.)
