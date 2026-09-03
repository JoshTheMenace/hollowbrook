# LOOP-CONTRACT.md — Hollowbrook, in enforceable statements

`GAME-DESIGN.md` is intent; THIS page is what the gates hold. Every number
here is load-bearing: `scripts/check-contract-drift.mjs` parses the JSON block
at the end of this file and diffs it against `src/game/data.js`. A number that
changes in code without changing here is a red gate; a number that changes
here after the review bundle is cut is a process finding.

**Skill axis: HYBRID — execution (aim, reload timing, lance lead) primary,
positioning (high ground, lanes, cover, hexer priority) secondary.**
Instrument: actuation-noise profiles on ONE policy in the headless siege sim
(`scripts/simulate-siege.mjs`): `NOVICE = { delay 0.34 s, jitter ±16° }`,
`EXPERT = { delay 0.12 s, jitter ±4° }`. The clean bot is the curve instrument
only and never certifies winnability.

## The loop

- **Core verbs:** the crossbow (hitscan, no cone, no falloff) and the
  emberlance (charged projectile, pierces 4, ignores shields). Sprint and
  the terrain's high ground are the movement verb.
- **Stake per failure:** death restarts the wave at its checkpoint and burns
  one of three town lights; three lost = run lost. Breather objectives are
  never lost.
- **Per-minute decision:** where to stand for the next 30 s; when to spend
  a lance; which hexer to go for.
- **HARD RULE — no player-facing choice is resolved by RNG.** Wave
  composition, timing and gate are authored tables (`WAVES`). The only seeded
  randomness is cosmetic spawn scatter inside the declared ring and enemy
  scale/tint. Measurement bots may seed anything.
- **Perspective:** first person. There is no player body; there is a
  viewmodel (crossbow + lance) and a damage-direction ring. Free-camera
  captures are banned as gameplay evidence; every review frame of combat
  comes from `__gshot` through the play camera.

## Player

| stat | value |
|---|---|
| HP | 100, refilled at every wave start; no regen inside a wave |
| walk / sprint / charging | 4.6 / 6.4 / 2.6 m/s |
| eye / radius / step | 1.62 / 0.34 / 0.38 m (the town's walker numbers) |
| crossbow | 34 dmg, 0.36 s between bolts, magazine 6, reload 1.4 s, hitscan, 40 m |
| emberlance | charge 0.9 s (release early = no shot), 120 dmg, 22 m/s, radius 0.35, pierce 4, cooldown 2.4 s |
| damage-direction ring | on for 0.6 s per hit, 12 segments |

## Enemies (HP in whole bolts; TTK windows are novice-referee, first-damage → death, p25 of committed kills)

| kind | rig | HP | speed | attack | TTK window @ ≤15 m |
|---|---|---|---|---|---|
| cutpurse | KayKit Rogue | 68 (2 bolts) | 4.4 | melee 12, windup 0.45, reach 1.5 | 0.36–1.8 s (amendment A6: a two-bolt body's first-damage→death floor is one crossbow interval by construction) |
| reaver | KayKit Barbarian | 136 (4) | 3.2 | melee 22, windup 0.65, knockback 1.2 m | 1.6–3.0 s |
| shieldbearer | KayKit Knight | 204 (6) | 2.4 | melee 18, windup 0.55; bolts from within 60° of its facing do half | flank 2.5–4.5 s / front 5–8 s |
| hexer | KayKit Mage | 102 (3) | 2.8, holds 9–12 m | hexbolt 16 dmg, 9 m/s, every 2.2 s, 0.7 s staff-glow telegraph | 1.2–2.4 s |
| Captain | ronin (elite) | 408 (12) | 3.8 | melee 30, windup 0.5; dash 6 m every 6 s, 0.5 s telegraph | 12–22 s |

Elite marker: banner + world-space HP bar (the ID pass counts marker pixels).
Every enemy wears the Company's one owned accent (rust sash) so identity
reads before contrast does.

## Waves (authored; no RNG)

| wave | length | gate(s) | composition (total) | peak alive | breather after |
|---|---|---|---|---|---|
| 1 the first rush | 120 s | south | 8 cutpurse, 4 reaver | 6 | 90 s: escort the runner |
| 2 the market | 150 s | south | 10 cutpurse, 6 reaver, 2 hexer | 8 | 90 s: three barricades |
| 3 the row | 180 s | east | 8 cutpurse, 6 reaver, 3 hexer, 3 shieldbearer | 9 | 120 s: four braziers |
| 4 the captain's probe | 180 s | both | 12 cutpurse, 6 reaver, 4 hexer, 4 shieldbearer, Captain (leaves at ≤50 % HP or at 90 s) | 11 + Captain | 120 s: escort the Reeve |
| 5 the storm | 210 s | both | 14 cutpurse, 8 reaver, 5 hexer, 6 shieldbearer | 13 | 30 s (no beat) |
| 6 last light | 240 s | both → the keep | 10 cutpurse, 6 reaver, 4 hexer, 6 shieldbearer, Captain | 14 | — |

Alive cap 14 (draw-call headroom: 14 × ~14 meshes). A wave ends when its
table is exhausted and nothing is alive, or at its length (stragglers
despawn at the gate). Session: 1080 s of waves + 450 s of breathers ≈ 25.5 min.

## Designed curves (medians over 6 seeds, NOVICE referee unless stated)

| checkpoint | window |
|---|---|
| player HP at end of wave 1 / 2 / 3 / 4 / 5 / 6 | 45–90 / 40–85 / 35–80 / 30–75 / 25–70 / 15–65 (of 100) |
| pressure (alive / peak) time-weighted mean, wave 1 → 6 | 0.35 → 0.75, non-decreasing |
| kills per minute, wave 1 → 6 (clean bot) | 5–8 → 8–13 |
| first hexer death | ≤ 60 s into wave 2 |
| Captain retreat (wave 4) | between 40 s and 90 s |
| lances fired per wave (expert) | ≥ 3 |

## Music intent curve (the one number `music.setIntensity` receives)

`intensity = clamp(0.15 + 0.55·pressure + 0.05·(wave−1) + 0.10·captain, 0, 1)`
with `pressure = 0.6·min(1, alive/peakAlive) + 0.4·(1 − hp/100)`.
Intent points: breather 0.22 · W1 peak 0.50 · W2 0.58 · W3 0.68 · W4 0.80
(0.90 with the Captain) · W5 0.88 · W6 1.00 · dawn 0.30 · defeat 0.00.
Gate: the mapping reaches each intent point ±0.06 at its wave's designed
peak, and is monotone in `alive` and in missing HP.

## Feel ladder (monotone in value; gated)

`magnitude = 10·shake + 40·hitstop + burst/4 + 2·[text] + 1·[sfx]`, computed
from the wired table (`feel.magnitude()` once charforge ships it; until then
`src/game/ladder.js` is that formula and says so).

| rank | event | magnitude |
|---|---|---|
| 1 | bolt-fired | 1.0 |
| 2 | bolt-miss | 1.0 (never > bolt-hit) |
| 3 | bolt-hit | 2.0 |
| 4 | lance-fired | 3.1 |
| 5 | kill-cutpurse | 5.0 |
| 6 | player-hurt | 6.0 (negative event; must stay < any kill above rank 6) |
| 7 | kill-hexer | 6.0 |
| 8 | kill-reaver | 6.8 |
| 9 | kill-shieldbearer | 9.8 |
| 10 | lance-multikill (≥2) | 11.9 |
| 11 | wave-cleared | 12.5 |
| 12 | kill-captain | 23.6 |
| 13 | bell-rung (victory) | 32.0 |

Also declared: `defeat`, `light-lost`, `objective-start`, `objective-done`,
`npc-sheltered`, `barricade-up`, `brazier-lit`, `reload`, `hexer-telegraph`,
`captain-dash` — every one wired or `check-feel` is red.

## Persistence

Save key `hollowbrook-v1`: `{ v, wave, lights, hp:100, objectivesDone[],
lightsLostAt[], player:[x,y,z], yaw, at: 'wave-start'|'breather-done' }`.
Written by the shell at every wave start and every objective completion —
never mid-wave. Restore lands at the nearest stable state. A corrupt or
foreign save yields a fresh run and a live shell. **Continuous play ==
post-reload at every checkpoint** (the game is never more correct after F5).

## The gates that hold it

| property | gate (in-tree, exit-coded) | threshold | state now |
|---|---|---|---|
| plan well-formed incl. `game` block | `scripts/validate-city-plan.mjs` | PASS | **PASS** |
| terrain: anchors / seams / surrounds / wall-walk | `scripts/check-terrain.mjs` | all PASS | **PASS** |
| nav grid: both spawn rings reach every arena | `scripts/check-nav.mjs` | 2/2 rings, 6/6 arenas | **PASS** (terrain-only world) |
| town integrity under the game | `scripts/check-city.mjs` | RESULT: PASS | red until districts exist |
| arenas have cover / elevation / landmarks; posts standable + present | `scripts/check-game.mjs` | all PASS | red until districts + cast |
| every interaction changes something at its site | `scripts/check-interactions.mjs` | all PASS | red until districts |
| spawn gates visible from the arena | `scripts/check-arena-visibility.mjs` | ≥40 % of arena cells see an approach point | PASS (nothing occludes yet) |
| every event heard/felt | `scripts/check-feel.mjs` + `__feelCheck()` | 0 unwired | NOT BUILT (game layer) |
| ladder monotone | `scripts/check-feel-ladder.mjs` | declared order holds, whiff ≤ hit, hurt < big kills | NOT BUILT |
| contract ↔ code drift | `scripts/check-contract-drift.mjs` | 0 diffs | NOT BUILT (`data.js` absent) |
| winnable-but-hard | `scripts/simulate-siege.mjs` | novice ≥3/6 wins, median lights lost ≤2; expert 6/6, end-HP ≥45; aim-only loses by W3; move-only loses W1; do-nothing dies ≤90 s; expert kills/min ≥1.6× novice | NOT BUILT |
| designed curves | `scripts/simulate-siege.mjs` | table above | NOT BUILT |
| threats legible in the PLAY camera | `__playCheck(seconds)` | visibleFrac ≥0.7 (in-frustum, ≤20 m), legibleFrac ≥0.6 (px ≥14, redmean ≥0.09), elite ≥0.9 with ≥10 marker px, p90 spawn→first-sight ≤5 s, segment crosses W4's Captain | NOT BUILT |
| input latency | `__latencyCheck()` | 1–2 ticks | NOT BUILT |
| music intent curve | `scripts/check-music.mjs` | loop passes charforge audio gates; intent points ±0.06 | NOT BUILT |
| NPC performances bounded | `scripts/check-npc-soak.mjs` | 60 s flee/shelter/talk cycle, every joint < π, residue < 0.02 rad | NOT BUILT |
| shell-path persistence | `scripts/check-shell-persistence.mjs` (headless Chrome, reads localStorage) | continuous == reload at 4 checkpoints; corrupt → fresh | NOT BUILT |
| draw-call headroom | `__drawCalls()` at each arena camera | ≤ 1400 calls with 14 enemies | NOT BUILT |

## Honest NOT-BUILT list (re-derived from what runs)

BUILT: contracts, plan (validated), scaffold (forked core + kit + scripts),
terrain (walkable wall-walk, market, keep), nav grid, terrain/nav gates.
NOT BUILT: every district, the kit extensions (`KIT-GAPS.md`), the whole
game layer (`src/game/*` except `nav.js`), the enemy cast, the NPC cast,
the sim and its referee, audio content, HUD, persistence shell, evidence.

## Amendment log

Each amendment carries the FAILED number it answers, and each is applied in
its own commit before the code that reads it (nightbloom TRAPS: an
amendment may not claim a gate that is not in the tree at the commit it
cites; substrate and build get their own second).

- **A1 (2026-09-03) per-arena approach declarations.** `game.arenas[].approach`
  may be `{ gate, points, why }`: the entry the wave actually uses to reach
  the arena. Failed numbers, full city, threshold 40 %: the-close 0/146 cells
  (0 %) with ALL chapelclose groups hidden; the-keep 70/298 (23 %), ceiling
  33 % with all keephill hidden and 88 % with every district hidden;
  the-mill 75/292 (25.7 %) — 28.1 % once the gate stopped sampling the
  gatehouse deck — with a 35 % ceiling. All three were measured against a gate
  60–100 m away across other districts. The threshold does not move.
- **A2 (2026-09-03) coordinate corrections measured by district agents.**
  `the market bell` (-12, 6.5) → (-12.2, 7.0): the plan's point measured
  -0.525, a stair tread. `the portcullis winch` (-5, 46.5) → (-4.7, 43.8):
  the plan's point was inside the west gate turret's drum. `the well`
  waypoint is the well's south kerb (the well stands at (1, -1.5)).
- **A3 (2026-09-03) anchors are asserted from their promised height**, and the
  east gate carries two at (50, 22): the passage floor (0.0) and the deck
  (5.0). Failed number: `ANCHOR FAILED in district "wardrow" at (50, 22):
  expected 0 ±0.05, groundAt returned 5.000`, which wardrow met with a 30 mm
  slot in the deck. Closed at integration; proven by `scripts/probe-decks.mjs`.
- **A4 (2026-09-03) keephill's almoner's house massing** (34, -30) → (30, -25.2)
  as built, off the keep-sees-eastgate line.
- **A5 (2026-09-03) `siege.under_wall_exceptions`.** check-siege
  `surrounds:under-wall` read 4/188 moor samples blocked by southgate's two
  mural drums; the drums have nowhere else to stand (the kit's turrets stood on
  the terrain's stair, and inside the wall they filled the bowman's gallery).
  Declared by rect; a sealed sample outside a declared rect still fails.
- **A6 (2026-09-03) TTK window for two-bolt bodies.** The cutpurse window was
  0.9–1.8 s at a ×0.5 gate floor of 0.45 s; a 68 HP body under a 34-damage,
  0.36 s crossbow dies one interval after first damage whenever two bolts land,
  so the p25 of committed kills sits on that floor BY CONSTRUCTION. Failed
  number: `ttk-cutpurse p25 0.38 s over 136 kills`. The window is 0.36–1.8 s,
  carried in the machine block as `ttk` (read by `sim.js`, held by
  `check-contract-drift`); the game's numbers are untouched.
- **A7 (2026-09-03) the keep's arena rect is the mound**, x -16..17 (was
  -16..46). The old rect was 61 % yew close — 183 of 299 open cells on ground
  the mound's cliffs hide the climbs from (2 of them saw any climb; the ward
  saw 25/76, the platform 28/40). Wave 6 is fought on the ward and the
  platform; the close is the vixen's ground. Failed number under A1 alone:
  52/299 (17 %).
- **A8 (2026-09-03) TTK is measured over crossbow kills.** The emberlance
  does 120 in one hit, so any body under 120 HP it touches dies 0.00 s after
  first damage — a fact about the lance, not a time to kill. Failed number:
  `ttk-hexer p25 0.00 s over 10 kills` (window 1.2–2.4). The referee keeps
  `by` on every kill record and the TTK rows read bolt kills only; lances are
  graded by `curve-lances`.

## Machine-readable numbers (parsed by `check-contract-drift.mjs`)

```json
{
  "player": { "hp": 100, "walk": 4.6, "sprint": 6.4, "charging": 2.6, "eye": 1.62, "radius": 0.34, "step": 0.38 },
  "crossbow": { "damage": 34, "interval": 0.36, "magazine": 6, "reload": 1.4, "range": 40 },
  "lance": { "charge": 0.9, "damage": 120, "speed": 22, "radius": 0.35, "pierce": 4, "cooldown": 2.4 },
  "enemies": {
    "cutpurse":     { "rig": "rogue",     "hp": 68,  "speed": 4.4, "melee": 12, "windup": 0.45, "reach": 1.5 },
    "reaver":       { "rig": "barbarian", "hp": 136, "speed": 3.2, "melee": 22, "windup": 0.65, "reach": 1.6, "knockback": 1.2 },
    "shieldbearer": { "rig": "knight",    "hp": 204, "speed": 2.4, "melee": 18, "windup": 0.55, "reach": 1.6, "shieldArcDeg": 60, "shieldFactor": 0.5 },
    "hexer":        { "rig": "wizard",    "hp": 102, "speed": 2.8, "holdMin": 9, "holdMax": 12, "boltDamage": 16, "boltSpeed": 9, "castEvery": 2.2, "telegraph": 0.7 },
    "captain":      { "rig": "ronin",     "hp": 408, "speed": 3.8, "melee": 30, "windup": 0.5, "reach": 1.8, "dashRange": 6, "dashEvery": 6, "dashTelegraph": 0.5, "retreatHpFrac": 0.5, "retreatAt": 90, "elite": true }
  },
  "aliveCap": 14,
  "lights": 3,
  "waves": [
    { "id": "w1", "name": "the first rush",      "seconds": 120, "gates": ["south-gate"], "arena": "gate-square", "peakAlive": 6,  "counts": { "cutpurse": 8,  "reaver": 4 },                                          "breather": 90,  "objective": "o1-escort-runner" },
    { "id": "w2", "name": "the market",          "seconds": 150, "gates": ["south-gate"], "arena": "the-market",  "peakAlive": 8,  "counts": { "cutpurse": 10, "reaver": 6, "hexer": 2 },                              "breather": 90,  "objective": "o2-barricades" },
    { "id": "w3", "name": "the row",             "seconds": 180, "gates": ["east-gate"],  "arena": "the-row",     "peakAlive": 9,  "counts": { "cutpurse": 8,  "reaver": 6, "hexer": 3, "shieldbearer": 3 },           "breather": 120, "objective": "o3-relight-wall" },
    { "id": "w4", "name": "the captain's probe", "seconds": 180, "gates": ["south-gate", "east-gate"], "arena": "the-market", "peakAlive": 11, "counts": { "cutpurse": 12, "reaver": 6, "hexer": 4, "shieldbearer": 4, "captain": 1 }, "breather": 120, "objective": "o4-escort-reeve" },
    { "id": "w5", "name": "the storm",           "seconds": 210, "gates": ["south-gate", "east-gate"], "arena": "the-close",  "peakAlive": 13, "counts": { "cutpurse": 14, "reaver": 8, "hexer": 5, "shieldbearer": 6 }, "breather": 30,  "objective": null },
    { "id": "w6", "name": "last light",          "seconds": 240, "gates": ["south-gate", "east-gate"], "arena": "the-keep",   "peakAlive": 14, "counts": { "cutpurse": 10, "reaver": 6, "hexer": 4, "shieldbearer": 6, "captain": 1 }, "breather": 0,   "objective": "o6-ring-the-bell" }
  ],
  "curves": {
    "hpEndOfWave": [[45, 90], [40, 85], [35, 80], [30, 75], [25, 70], [15, 65]],
    "pressureMean": [0.35, 0.75],
    "killsPerMin": [[5, 8], [8, 13]],
    "firstHexerDeathBySec": 60,
    "captainRetreatWindow": [40, 90],
    "expertLancesPerWave": 3
  },
  "music": { "base": 0.15, "pressureW": 0.55, "waveW": 0.05, "captainW": 0.10, "aliveW": 0.6, "hpW": 0.4,
             "intent": { "breather": 0.22, "w1": 0.50, "w2": 0.58, "w3": 0.68, "w4": 0.80, "w4captain": 0.90, "w5": 0.88, "w6": 1.00, "dawn": 0.30, "defeat": 0.0 }, "tol": 0.06 },
  "ladder": [
    ["bolt-fired", 1.0], ["bolt-miss", 1.0], ["bolt-hit", 2.0], ["lance-fired", 3.1], ["kill-cutpurse", 5.0],
    ["player-hurt", 6.0], ["kill-hexer", 6.0], ["kill-reaver", 6.8], ["kill-shieldbearer", 9.8],
    ["lance-multikill", 11.9], ["wave-cleared", 12.5], ["kill-captain", 23.6], ["bell-rung", 32.0]
  ],
  "ladderWeights": { "shake": 10, "hitstop": 40, "burst": 0.25, "text": 2, "sfx": 1 },
  "referee": { "novice": { "delay": 0.34, "jitterDeg": 16 }, "expert": { "delay": 0.12, "jitterDeg": 4 },
               "winnable": { "noviceWinsOf6": 3, "noviceMedianLightsLost": 2, "expertWinsOf6": 6, "expertEndHp": 45, "aimOnlyLosesByWave": 3, "moveOnlyLosesByWave": 1, "doNothingDiesBySec": 90, "headroomKillsPerMin": 1.6 } },
  "save": { "key": "hollowbrook-v1", "v": 1 },
  "legibility": { "visibleFrac": 0.7, "legibleFrac": 0.6, "minPx": 14, "minSep": 0.09, "eliteFrac": 0.9, "eliteMarkerPx": 10, "combatRange": 20, "p90FirstSightSec": 5 },
  "ttk": { "cutpurse": [0.36, 1.8], "reaver": [1.6, 3.0], "hexer": [1.2, 2.4], "shieldbearer": [2.5, 8.0], "captain": [12, 22] },
  "drawCallsMax": 1400
}
```
