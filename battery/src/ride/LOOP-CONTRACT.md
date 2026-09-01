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
SPAWN.everyMax = 1.6
SPAWN.everyMin = 0.28
CLIMAX.at = 150
CLIMAX.minMusic = 0.82
```

## Amendments

(none yet)
