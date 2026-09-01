# JUICE BOX — loop contract (battery B1)

A 60-second one-verb score-attack arcade game. The battery point: stress the
feel bus, SFX, hit feedback, input latency, the play camera, and the
designed-curve gates on a genre that is NOT survivors. The game is small on
purpose; the seam is the deliverable.

**Skill axis: EXECUTION** (aim + reaction). Headroom instrument:
actuation-noise profiles on the same policy family — expert (120ms, 4°)
vs novice (340ms, 16°); measured 1.78×.

## The loop

- **Core verb: DASH.** Tap a direction (WASD/arrows, or click toward the
  cursor) → the box dashes 3.6 m with a 0.16 s recovery. There is no other
  input. Held keys do nothing — the verb is discrete, so every input is a
  decision and latency is nakedly felt.
- **Objects:** lantern spirits drift in from the edges on a SEEDED schedule
  and fade after a TTL. Dashing through one pops it: +score × combo. GOLD
  spirits (worth 5×, shorter-lived, far from centre) appear every ~6 s —
  weaving one in without dropping the chain is the commitment decision.
- **Stake per failure:** a spirit that fades unpopped resets the combo; a
  dash that hits nothing costs 0.16 s of the clock and your chain timing.
- **Per-run decision (every ~5 s):** route — commit to a risky multi-pop
  line through a cluster, or bank the safe lone spirit before the chain
  timer (1.9 s since last pop) drops the combo.
- **HARD RULE holds:** no player-facing choice resolved by RNG. The spawn
  schedule is a pure function of the run seed — every attempt at seed N is
  the identical puzzle (score-attack fairness IS determinism). Daily seed by
  date; practice seeds selectable.
- **60 seconds**, then a score screen. One number, replayable in one keypress.

## Designed curve (gated headlessly in scripts/check-juicebox.mjs)

| Property | Window |
|---|---|
| Greedy bot final score (median across seeds) | 900..2600 |
| Execution-skill headroom: expert-reflex bot (120ms/4°) over novice-reflex (340ms/16°), same policy family | ≥ 1.3× (the design must reward the skill it asks for; planning bots measured ~1.0× — this is an execution-skill design, recorded as a B1 finding) |
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

```constants
DASH.len = 3.2
DASH.time = 0.1
DASH.recover = 0.45
CHAIN_WINDOW = 1.6
ONI.count = 2
ONI.stun = 0.5
ONI.telegraph = 0.5
SPIRIT.ttlMin = 2.9
SPIRIT.ttlMax = 3.9
GOLD.value = 30
GOLD.comboGain = 1
RUN_SECONDS = 60
```
