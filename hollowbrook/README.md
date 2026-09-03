# Hollowbrook

A first-person siege in a walled fantasy town, built on the scene pipeline
(Thistledown's kit and gates, forked), CharForge characters and SoundForge
audio. Read in this order: `GAME-DESIGN.md` (why), `LOOP-CONTRACT.md`
(every number, every gate), `city-plan.json` (the town's contract),
`KIT-GAPS.md` (what the kit still needs), `DISTRICT-BRIEFS/` (one per
district agent).

```sh
npm install
npm run dev              # http://127.0.0.1:5220 — the town viewer (no game layer yet)
npm run build
npm run check            # validate plan + terrain + nav + city
npm run gates            # every gate, PASS/FAIL per line (many are honestly red)
```

Dev servers for this project use ports 5220–5229 only. The frame grabber is
the usual one: in the page, `await __shot('name', 1280, 720, { review:
'from-the-road' })` or `{ pos, lookAt }` writes `.shots/name.jpg`.

## State

- Contracts, plan (validated), scaffold, terrain, nav grid: **built and gated**.
- Districts: six stubs (`src/districts/*.js`) — the town is the terrain.
- Kit extensions (`KIT-GAPS.md`), game layer (`src/game/*` except `nav.js`),
  cast, audio, HUD, persistence: **not built**; their gates exist and exit 1.

## Layout

- `src/core/` — the rendering stack and the gates' engines (cel/ink/grade,
  terrain, district composer, seams, spatial audit, legibility, interiors).
  Two Hollowbrook changes, both marked in place: shelf-aware socket
  targets and corridor hairlines in `core/terrain.js`; a `holeFloorY`
  option on the spatial audit.
- `src/terrain.js` — the coordinator's terrain module (tones + probes).
- `src/kit/` — Thistledown's kit, verbatim; siege additions to come.
- `src/game/nav.js` — the flood fill's grid as the enemies' nav grid.
- `scripts/` — every gate, exit-coded. `lib/headless.mjs` boots the town in
  Node; `lib/browser-harness.mjs` boots headless Chrome (battery's).

## The game layer (src/game/) — state at handover

`game.html` is the siege; `index.html` stays the town viewer. Read
`src/game/INTERFACES.md` for the record shapes and the district / audio
contracts the game consumes.

- **Rules are pure and tick-fixed** (`rules.js`, `TICK = 1/60`): no wall clock,
  no `Math.random` (one seeded generator for cosmetic scatter), every consumer
  drives the same accumulator (`stepper.js`). `check-reproducibility` replays a
  tick-indexed tape at 30/60/90/144 fps ± 35 % and asserts byte-identical state.
- **Referee** (`sim.js`, `bots.js`): one policy under the contract's two hands,
  the player's information state (view cone, line of sight, reaction delay),
  three degenerate bots under the novice hand. Realised constants are measured
  in the running rules by `check-contract-drift`.
- **Gates**: `npm run check:siege-game` runs drift → feel → ladder → replay →
  referee → music-vs-state → npc-soak → shell-persistence → play-camera.

### Traps this layer paid for

| Trap | The rule |
|---|---|
| A smoothed nav path hugging a scarp line: the body drifts half a radius over the edge, drops 5 m and can never climb back; every "stuck NPC" was this | `lineOpen` is a three-rail corridor and both rails must agree at every station; A* charges cells on a lip; a stuck body re-paths without smoothing from a cell on ITS OWN level (`nearestOpen(…, fromY)`) |
| A* seeded from the nearest open cell put a body at the foot of the keep mound on a cell halfway up it | The start cell must be within a step of the feet's actual height |
| A frame-rate spread that read NONZERO was the harness comparing hashes at unequal tick counts | Gates compare state at ONE tick (`stepper.stopTick`), never at "about 400 s" |
| Whole-run kills/min saturates: every spawn dies for both hands, the schedule sets the pace | Headroom is kills in a wave's first minute on its FIRST attempt (a restart re-feeds the table) |
| The contract wants the first hexer dead by 60 s of wave 2; the first hexer spawned at 47 s | Authoring, not balance: hexers ride the second knot |
| `Feel.magnitude()` weighs vol·2/burst·0.08; the contract weighs sfx·1/burst·0.25 — the runtime twin inverted lance-fired over kill-cutpurse | The runtime ladder twin applies the CONTRACT's weights over the live table |
| charforge's Shake renders trauma SQUARED, so a 0.35 hurt shook 12× a 0.1 kill and the rendered ladder inverted | Table shake is added as √s; measured shake comes off trauma with rendering disabled |
| The play-camera segment faced the market while the wave came from the south gate: 0 sightings, visibleFrac 0 | Canonical segments face the gate they are judged against; a wrong yaw returns a composed frame of nothing |
| The ID pass at 480×270 gave the Captain's HP bar 3 px; at 1280×720 it is 21 | Count contract pixel floors in the pixels the player gets |
| A grey cart-heap burst on grey ground is a 30-delta, and the payoff gate at 60 said nothing happened while its own frame showed it | The payoff threshold is the smallest delta the eye reads, and the frame is read after every failure |
| `hud.state()` said 2 lights with 3 in the run: the player had died standing still during the probe's first 30 s | A probe that stands still is a probe that dies; say what it was doing |
| The contract's music formula carries the wave term into breathers: 0.40 before wave 6 against a stated breather intent of 0.22 | A breather sends the breather intent; the formula is a fight formula |
| Puppeteer's default 480-cell ID grid and a 60-delta both passed a "0 px" payoff | Every pixel gate reads its own capture at full resolution |

### Traps the integration paid for (all six districts composed)

| Trap | The rule |
|---|---|
| The plan promised `(50, 22) expect_top 0` under a gatehouse deck at 5.0; composeCity asserted anchors with the two-argument `groundAt` (a max over platforms) and check-game's passage test took no feet height — so wardrow shipped a 30 mm SLOT in the deck, the only geometry both gates accepted, and a walker whose centre landed in it dropped 5 m | **A gate that cannot express two levels at one point will be satisfied with a hole.** Anchors assert FROM their promised height (`groundAt(x, z, expect_top)`), every gate reads a NAMED layer (`vignette.groundLayerAt` / `surfaceTopAt`), and `scripts/probe-decks.mjs` walks both decks at 5 mm. No gate calls the two-argument form any more. |
| `simulate-siege.mjs` did `process.exit(await runReferee() ? 0 : 1)`; `runReferee` returns an object, so eighteen FAIL rows exited 0 | A gate that cannot fail is not a gate. Exit on `.ok`, and read the exit code of every script in the suite, never its prose. |
| `check-siege` booted the FINISHED town and built the kit's perimeter on top of it: both gate decks read y 10 and the ring "failed" in southgate's evidence | A kit-stage gate stands the kit up on the terrain (`bootCity({ terrainOnly: true })`), and terrain-only builds no massing stubs either — a stub is a solid with a collider across the passage it is meant to prove open. |
| `check-arena-visibility` measured the-close at 0 % and the-keep at 23 % against a gate 100 m away that no cell could see with every mesh in the district hidden | An arena's approach is the ENTRY THE WAVE USES (amendment A1, `approach: { gate, points, why }`); the threshold does not move to fit geography. And the keep's rect was 61 % yew close on ground the mound hides the climbs from (A7). |
| check-game's landmark ray fired from one point — the rect centre — which was inside a cottage once and against the keep's hall the next time | An arena is an area: read landmarks from its centre and the eight points halfway to its edges, aim at the subject's solid (80 % height AND centre), count a clear ray as visible — the convention check-city already had. |
| check-game reported `npc:*:present` FAIL in every district's evidence because the cast lives in the game layer and the gate booted the town without it | A gate that judges the cast casts it: check-game runs `createCast` headlessly (the soak's path) before it looks for `npc:<id>` roots. |
| A builders.js import of `kit/mats.js` (added for a window-glass material) crashed the siege sim and the drift gate with `document is not defined`: mats.js draws canvas textures at import and nav.js → builders.js loads before any DOM stub | Nothing under `src/builders.js` may import a module that touches `document` at load; `scripts/lib/headless.mjs` installs the DOM stub at ITS import, first in every gate. |
| The referee's "best high ground far from the gate" was the inside of the Reeve's Hall — a room with one door — and it died in that doorway three times a run | `world.inRoom` and the bot's `holdable` test: never hold inside a registered interior or in a pocket with fewer than five open neighbours; never step (`bestStep`) into one either. Every novice death trace on the composed town ended in a corner a blind step had walked into. |
| Every trace-driven policy change was measured on all six seeds, and two that were obviously right were wrong: letting melee in to 8 m (a ±16° hand lands 10 % at 12 m) sent both hands back to dying in wave 2; sidestepping the Captain's dash telegraph cost the expert two wins | The referee grades the design only when the policy is held still; change it from a trace, run all seeds, keep only what the numbers keep. Three knots of four in wave 1 was tried and reverted the same way. |
| The play gate's "spawn → first sight" counted only bodies that had first been OFF screen, so a bot facing the gate scored FEWER sightings; its in-frustum rows sampled frames with ≥ 3 near and wave 1 — killed in threes at 12 m — had none | Count spawn→first-sight for every body (0 s is a sighting), floor the population per segment, and a segment with under 10 sampled frames says INSUFFICIENT rather than 0. |
| Puppeteer's default 180 s protocol timeout killed the play gate inside its draw-call step (5 × 45 s of rendered frames in one `evaluate`) on the composed town | A gate must not fail on its own clock: `protocolTimeout` is 900 s in the harness. |
