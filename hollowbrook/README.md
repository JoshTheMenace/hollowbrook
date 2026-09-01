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
