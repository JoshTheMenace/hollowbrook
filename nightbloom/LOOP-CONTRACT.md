# LOOP-CONTRACT.md — what Nightbloom is, in enforceable statements

The audit's rule: a game ships against a loop contract the way a scene ships
against a plan. GAME.md describes intent; THIS page is the part gates hold.

**Skill axis: HYBRID (planning + execution).** Planning: the upgrade draft
and pack-splitting routes (instrument: the designed-curve sim with the
random-pick bot as the planning floor). Execution: kiting precision
(instrument: actuation-noise profiles — applied post-review-r1: the NOVICE
profile ported from battery juicebox rules, reaction ~340ms / aim ±16°, is
the winnability referee in charforge simulate-run.mjs; the clean bot remains
the curve/economy instrument only. Baselines that die partway are reported
as numbers, never passes).

## The loop

- **Core verb:** positioning. The player never presses an attack button —
  weapons auto-fire; skill is where you stand, which pack you split, when
  you cross the field. (Movement is the whole input; anything that degrades
  movement readability is a core-verb defect.)
- **Stake per failure:** a night lost = half that night's gold and the run's
  upgrades; town progress (unlocks, quest state) is never lost. Death costs
  the night, not the game.
- **Per-minute decision:** the upgrade draft (every level: 3 cards) and one
  positional commitment (engage the pack vs. cross to the gem field).
- **HARD RULE — no player-facing choice is resolved by RNG.** Gate bots may
  auto-pick; a player never does. (`autoPick()` is deleted; the cards pause
  the fight until the player chooses.)

## The gates that hold it (all exit-coded or in-page with numbers)

| Property | Gate | Threshold |
|---|---|---|
| Balance winnable-but-hard | charforge `simulate-run.mjs` | 4 checks, ALL PASS |
| Every event heard/felt | `scripts/check-feel.mjs` + `__feelCheck()` | 0 unwired |
| Threats visible in the PLAY camera | `__playCheck()` | visibleFrac ≥0.8, p10 ≥0.4, p90 first-sight ≤4s |
| Threats LEGIBLE in the PLAY camera | `__playCheck()` legibility terms | legibleFrac ≥0.6 (ID-pass px ≥14 + p90 redmean sep ≥0.09 at ≤12m), elite frames ≥0.9 legible (px ≥56 AND ≥10 dedicated marker pixels on screen — identity, not just contrast); segment must cross the first elite (default 140s) |
| Audio deterministic + produced | charforge `check-audio.mjs` | ALL PASS, byte-identical runs |
| Town integrity under the game | `scripts/check-city.mjs` | RESULT: PASS |
| Arena stays an arena | festival district contract | no collider in x 29..53, z −3..15 |

Free-camera captures are **banned as gameplay evidence** — every review frame
of combat comes from `__gshot` through the camera the player has.

Amendment log (post-review-r1 gate calibration): `__playCheck` originally
gated frustum containment only (visibleFrac/p10/first-sight). Review r1
gate-blindness finding 3 measured an unmarked 739 HP elite and 14 invisible
particles both counting as "visible"; the legibility terms above were added
in response. The original thresholds are unchanged — this adds terms, it
moves no window.

## Honest status (re-derived from what runs, not from plans)

BUILT + GATED: town, day/night, battle (combat, upgrade draft, feel bus,
adaptive music by live pressure, overhead battle camera), evidence hooks.
NOT BUILT (GAME.md sections describing these are intent, not state): quests,
NPC day cast, meta save/unlocks in this shell, phase timer (nights start via
T / interactions, not a clock), arena cover/elevation vocabulary in the plan
schema, designed-curve extension of the balance sim, input-latency probe,
independent play review round.
