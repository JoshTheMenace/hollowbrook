# LOOP-CONTRACT.md — what Nightbloom is, in enforceable statements

The audit's rule: a game ships against a loop contract the way a scene ships
against a plan. GAME.md describes intent; THIS page is the part gates hold.

**Skill axis: HYBRID (planning + execution).** Planning: the upgrade draft
and pack-splitting routes (instrument: the designed-curve sim with the
random-pick bot as the planning floor). Execution: kiting precision
(instrument: actuation-noise profiles — NOT YET APPLIED to this game;
recorded as an open gate to add).

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
| Audio deterministic + produced | charforge `check-audio.mjs` | ALL PASS, byte-identical runs |
| Town integrity under the game | `scripts/check-city.mjs` | RESULT: PASS |
| Arena stays an arena | festival district contract | no collider in x 29..53, z −3..15 |

Free-camera captures are **banned as gameplay evidence** — every review frame
of combat comes from `__gshot` through the camera the player has.

## Honest status (re-derived from what runs, not from plans)

BUILT + GATED: town, day/night, battle (combat, upgrade draft, feel bus,
adaptive music by live pressure, overhead battle camera), evidence hooks.
NOT BUILT (GAME.md sections describing these are intent, not state): quests,
NPC day cast, meta save/unlocks in this shell, phase timer (nights start via
T / interactions, not a clock), arena cover/elevation vocabulary in the plan
schema, designed-curve extension of the balance sim, input-latency probe,
independent play review round.
