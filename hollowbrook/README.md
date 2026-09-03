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
