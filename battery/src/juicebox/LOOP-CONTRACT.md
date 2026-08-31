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
