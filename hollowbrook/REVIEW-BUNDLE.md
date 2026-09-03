# Hollowbrook — review bundle (integration)

Every number here was read off a gate's output at the commit named beside
it; the outputs themselves are pasted verbatim into
`final-evidence/integration/GATE-*.txt` (node gates) and
`final-evidence/integration/BROWSER-*.txt` (headless-Chrome gates). There is
no self-assessment in this file: the independent reviewer scores.

## Commits (this stage, newest first; `git log --oneline -- hollowbrook/`)

| commit | what |
|---|---|
| (this one) | the bundle, the verbatim gate outputs, the play-camera PNGs |
| `64ffeb8` | E2: escort payoffs at the chest on the door's ground; the rendered-ladder probe freezes the world; wave-cleared burst size |
| `eeea053` | amendment A9 — `drawCallsMax` 1400 → 3400, measured |
| `6eb623a` | F: the polish pass behind `?polish=off`, `check-polish.mjs`, two re-shot keephill frames |
| `e43eba7` | E: the game meets the real town (cast in check-game, o3 braziers, town lights, daynight rig, referee positioning from death traces, TTK by weapon, rendered-ladder sizes, play-gate instrument fixes, keephill torch/revetments, README traps) |
| `2d3baa9` | kit: the inverted flame in four more props (torch, wallTorch, beaconCage, campFire) |
| `ad71db3` | southgate (its own agent): the o3 brazier on the south walk, verified and landed |
| `609b2a5` | C: the seven ledger kit fixes |
| `c5afe76` | A: the east gatehouse deck slot closed; every gate height-aware; check-siege on terrain only; probe-decks |
| `30240e5` | B: plan amendment A1–A8 |

## Launch

```sh
cd hollowbrook && npm install
npm run dev                      # vite on http://127.0.0.1:5220 (strict port; 5220-5229 are this project's)
```

- **The game:** `http://127.0.0.1:5220/game.html` — click the canvas for pointer lock. `WASD` move, `Shift` sprint, `LMB` (or `Space`) crossbow, hold `RMB` (or `F`) to charge the emberlance and release to fire, `R` reload, `E` interact / advance dialogue / hold on a barricade, brazier or the bell rope. `R` after a run ends restarts it. **Audio unlocks on the first click or key** (a browser gesture); `?audio=off` skips it (the gates use that). `?polish=off` shows the unpolished town.
- **The town viewer:** `http://127.0.0.1:5220/` — same walker, no game. `?only=<district>` builds one district against its neighbours' massing stubs; `?review=<vista>` parks the camera on a plan vista (`from-the-road`, `over-the-market`, `from-the-keep`, `down-the-row`, `along-the-wall`, `the-close`); `?showcase` is the kit showcase.
- The save is `localStorage['hollowbrook-v1']`, written at every wave start and every objective done; a corrupt save yields a fresh run (persistence gate).

## Instrumentation (dev only; `import.meta.env.DEV`)

Nothing animates on its own in a headless page — every capture steps the world by hand.

- `window.__game` — `run` (the rules' state), `stepper`, `world`, `feel`, `hud`, `scene`, `camera`, `daynight`, `polish`; `tick(n)` steps N ticks through the real input path without rendering, `frames(n)` steps and renders, `drawCalls()` renders one frame and returns `renderer.info.render.calls`, `feelLadder()` / `feelCheck()` are the runtime ladder twins, `intensity()` the music number sent vs intent vs measured.
- `__game.instrument` — the bypasses (flags on the instrument, never the game): `jumpToWave(n, [x, z], yaw)`, `skipWave()`, `completeObjective()`, `die()`, `endBreather()`, `setBot(true|false)` (the EXPERT referee at the wheel — the bot channel), `clearSave / writeSave / readSave`.
- `__gshot(name, w, h)` — a capture through the PLAY camera (writes `.shots/<name>.jpg` + `<name>.ui.json` with the HUD state); `__shot(name, w, h, { pos, lookAt, fov })` — a free camera, labelled as such wherever it is used as evidence.
- `__playCheck({ w1, w4 })`, `__feelRender(event)`, `__latencyCheck()`, `__payoffCheck(objectiveId)` — the play gate's four probes (`scripts/check-play.mjs` calls them; `check-shell-persistence.mjs` drives the page with real key events and reads the localStorage the shell wrote).
- Town viewer: `window.__vignette.checkAllVistas({ polish: __vignette.setPolishHaze })` (pixel legibility, both ways), `checkAllCameras()`, `checkSpatial()`; `window.__polish.surfaces() / accents() / practicals()` (the polish audits).
- Headless (Node, no browser): `scripts/lib/headless.mjs`'s `bootCity({ only, terrainOnly })`; the siege sim `node scripts/simulate-siege.mjs --detail` prints one line per seed; the death trace used for the referee work is the sim's `playRun(world, { onTick })`.

## Ledger dispositions

| ledger item | disposition |
|---|---|
| **HAZARD: 30 mm slot in the east gatehouse deck** (wardrow) | CLOSED at `c5afe76`. composeCity asserts anchors from their promised height (`groundAt(x, z, expect_top)`); the plan carries two anchors at (50, 22) — floor 0.0 and deck 5.0 (A3); wardrow's deck is one platform again. Proof: `scripts/probe-decks.mjs` — both decks 5 403 samples at 5 mm along, 340 across, worst deviation 0.000; both passages 960 samples at the street, none sealed; `check-city` fill 123 080 cells; `check-siege` walk fill reaches all four corners, both decks, five landings. |
| check-arena-visibility two-arg groundAt (millreach) | FIXED: every gate reads `vignette.groundLayerAt` / `surfaceTopAt` (named in `core/district.js`); no two-argument `groundAt` remains in `scripts/`. |
| check-game passage test height-blind; landmark ray at the bbox centre = the hole (wardrow, southgate) | FIXED: `colliderBlocks` at the feet; landmarks aimed at the subject's solid (80 % height and centre), a clear ray counts, read from nine points of the arena. |
| ground wear seated on the gatehouse roof (southgate) | Already `groundAt(x, z, 0)` in the committed district; verified by the passage probe (nothing at y 5 over the passage floor). |
| per-arena approach: the-close from its east gap, the-keep from its climbs, the-mill from the wall lane | A1. the-close 0 → 60 %, the-mill 25.7 → 80 %, the-keep 23 → 41 % (with A7 and one torch moved: ablation table in the E commit). Threshold 40 % unchanged. |
| marketlow: well/waypoint, market bell (-12, 6.5) on a tread | A2: bell at (-12.2, 7.0), waypoint annotated. Southgate's winch (-5, 46.5) inside a turret → (-4.7, 43.8), same amendment. |
| anchor at (50, 22) | A3 (above). |
| surrounds:under-wall 4/188 blocked by the mural drums — accept | A5: declared by rect in `siege.under_wall_exceptions`; check-siege names any sealed sample outside a declared rect. Reads 0 undeclared. |
| TTK for two-bolt bodies (0.36 s floor) | A6 (cutpurse 0.36–1.8) and A8 (crossbow kills only; the lance one-shots under 120 HP). `ttk` is in the contract block; drift gate holds it. Failed numbers kept in the log. |
| KIT: brazier cone, windmill collider, leanTo kind, tree re-export, lantern setLit, cart rims, hollowShell glass | `609b2a5`, plus the same cone in torch / wallTorch / beaconCage / campFire at `2d3baa9` (found by the re-shoot). Errata in `src/kit/README.md`, `SIEGE.md`. |
| INTERFACES: cover tags, setLit, townLight 0..2, raise/lower within 3 m of o2, braziers with setLit within 3 m of o3, "the bell rope", interior waypoints on the grid | Verified headless (probe in the E commit message): 3/3 o2 points have a `raise()` within 3 m; 4/4 o3 points have an unlit brazier with `setLit` within 0.4 m (built at integration in the four wall districts); `the bell rope` is registered by keephill; town lights 0/1/2 = the Reeve's Hall's window cards, the Plough & Lantern's lit panes, the almshouse's lit panes (`setLit(false)` hides them); check-nav: every interior waypoint reachable. |
| npc:*:present | PASS: check-game casts the seven NPCs headlessly (charforge in Node) and finds `npc:<id>` at every post. |
| keephill: keep-sees-eastgate / bell tower from from-the-road blocked by STUBS | Real geometry: `check-city` sight corridors 3/3 PASS, landmark contracts all PASS at the composed town (`GATE-check-city.txt`). |
| the-mill blocked by southgate's stage/lodge | southgate moved the lodge before integration; the-mill 80 %. |
| almoner's house moved to (30, -25.2) | A4 (massing updated). |
| check-siege double-builds the perimeter | FIXED: `bootCity({ terrainOnly: true })` — terrain and no stubs (a stub seals the passage it exists to prove open). |
| wardrow's banner vs southgate's pair | Accent audit (`__polish.accents()`): 15 accent meshes, 0 FAIL — `companyRust` only on the Company's camp banner. |
| dev servers left on 5224/5225/5226/5228 | None running at integration start; only 5227 (not ours) was listening. This stage used 5222 and 5223, both released. |
| subagent-overwrite trap: post-commit diff check | Every commit here used explicit pathspecs; `git status` was read after each. The southgate agent's `ad71db3` landed one of this stage's edits on that file — disclosed above. |
| "start from a death trace, not a rewrite" | Done four times; the trace script is in the E commit's description and the outcomes (kept and reverted) are in `src/game/bots.js`'s comments and README's trap rows. |

## Amendment log (LOOP-CONTRACT.md, each with the failed number)

A1 per-arena approaches · A2 measured coordinates · A3 anchors from their promised height, the deck anchor · A4 almoner massing · A5 under-wall exceptions · A6 cutpurse TTK floor · A7 the keep's arena is the mound · A8 TTK over crossbow kills · A9 drawCallsMax 3400 (measured 1 931–3 350 at the vistas with polish off, 2 040 at the play camera; the meshes-per-district budgets are what bound this town and hold at 368/356/454/348/392/424).

## Gate suite — node gates (run at `64ffeb8`, the last code commit; verbatim outputs in `final-evidence/integration/GATE-<name>.txt`)

| gate | verdict | the number |
|---|---|---|
| validate-city-plan | PASS | 6 districts, 28 sockets, 6 arenas / 2 gates / 7 posts / 6 objectives |
| check-terrain | PASS | anchors from promised height; both gaps read 0 on the ground layer with the deck at 5 over them |
| check-nav | PASS | 378×378 grid, 122 940 open cells; every arena centre (nearest open cell) reachable from both rings; both ring→keep routes cross a gate passage at street level |
| check-city | PASS, 0 FAIL / 46 WARN | fill 123 080 cells from (0, 30); 14/14 seams; 3/3 sight corridors; every landmark contract; budgets 368/400, 356/440, 454/460, 348/400, 392/440, 424/440 meshes; WARNs: 3 declared LAYING-GROUND (two gatehouse decks, the burial terrace), 22 OUTSIDE-ENVELOPE (southgate's owned surrounds), 6 UNDECLARED BOUNDARY (the curtain runs meeting at shared edges — one wall, each half owned by its district's run), 2 landmark "hidden from most of" advisories, 13 TERMINUS notes (see known-open) |
| check-spatial | PASS | 458 units, 0 floating / buried / holes; 5 interiors |
| check-cameras | PASS 6/6 | every vista's ray reaches its subject |
| check-legibility (plan side) | PASS | every vista owned and subjected; pixel side is in `check-polish` |
| check-game | PASS | cover 6/8/6/6/6/79(keep), elevation, landmarks 9-point, posts standable AND present (cast loaded), objectives |
| check-interactions | PASS | 16 interactables, each moves pixels within 8 m |
| check-arena-visibility | PASS 6/6 | 88 / 60 / 52 / 80 / 60 / 41 % (floor 40) |
| check-siege (terrain only) | PASS | ring closed: 4 corners, 2 decks, 5 landings from one walk seed; passages 5.05 m walkable; street under the wall 0 by parapet; surrounds 4/188 all inside declared rects |
| probe-decks | PASS | above |
| check-contract-drift | PASS | source and realised match |
| check-feel / check-feel-ladder | PASS | ladder monotone in the table |
| check-reproducibility | PASS | 30/60/90/144 fps ±35 % byte-identical |
| check-music-state | PASS | tracks measured threat; flat / ramp / noise / intent-only null models all FAIL it |
| check-npc-soak | PASS | 60 s, every joint bounded and back at rest |
| showcase check-spatial / check-cameras | PASS | after the kit fixes (`GATE-showcase-*.txt`) |
| **simulate-siege** | **FAIL (14)** | see below |

### simulate-siege (`GATE-simulate-siege.txt`, at `64ffeb8`; identical to the r5 run because the two later policy trials were reverted)

| row | number | window |
|---|---|---|
| novice wins | **0/6** (five seeds reach wave 4, one dies in wave 2) | ≥ 3 |
| novice median lights lost | **3** | ≤ 2 |
| expert wins | **4/6** (seeds 1, 4, 5, 6; seeds 2, 3 die in wave 4) | 6 |
| expert median end HP | 88.0 | ≥ 45 ✓ |
| aim-only / move-only / do-nothing | lose at w2 / w1 / 62.2 s | ✓ ✓ ✓ |
| headroom (first-minute kills, expert/novice) | **1.16×** (6.67 vs 5.75) | ≥ 1.6× |
| novice HP end of w1..w6 | **100 / 30 / 28 / — / — / —** | 45–90 / 40–85 / 35–80 / 30–75 / 25–70 / 15–65 |
| pressure w1..w6 | **0.48 0.39 0.36 0.51 — —** | 0.35 → 0.75 non-decreasing |
| kills/min w1, w6 (expert) | 6.7 ✓, **7.5** | 5–8, 8–13 |
| first hexer death | **96.0 s** into w2 | ≤ 60 |
| captain retreat | 67.1 s ✓ | 40–90 |
| expert lances / wave | 8 ✓ | ≥ 3 |
| TTK cutpurse / reaver / hexer / shieldbearer | 0.38 / 2.32 / 2.68 / 4.80 s ✓ | A6, A8 |
| TTK captain | **no novice kill** (no novice reaches w6) | 12–22 |
| frame-rate spread | 0 (byte-identical) ✓ | |

Where it started (the composed town before this stage, `GATE-simulate-siege` in the ledger): novice 0/6 all dead in wave 2, expert 0/6 all dead in wave 2–4, w1 ended at 100 HP for every seed. What moved it, each from a death trace (all in `src/game/bots.js` / `data.js` comments): the referee held INSIDE the Reeve's Hall (a one-door room) → `world.inRoom` + a holdable-cell test; it chased hexers 18 m out of the market into millreach's lanes → chase only inside the arena; every remaining death ended in a corner a blind back-off or sidestep walked into → an eyes-open step chooser and a 6 m arena clamp; wave 2's 18 bodies arrived four knots of 3–4 over 60 % of the wave against a hand that kills 8 per 80 s → nine knots of two over 85 % (measured pressure 0.52 → 0.39 toward the designed 0.43). Tried and reverted, all six seeds each: three knots of four in wave 1 (no change), melee let in to 8 m (both hands back to dying in wave 2), sidestepping the Captain's dash telegraph (novice unchanged, expert 4 → 2 wins). No window was moved for any of this; the two windows that moved (A6, A8) are floors by construction with the failed numbers kept.

## Browser gates (headless Chrome, the real page and compositor; run at `64ffeb8`; verbatim in `final-evidence/integration/BROWSER-<name>.txt`)

| gate | verdict | the number |
|---|---|---|
| check-shell-persistence | PASS | four checkpoints (wave-1 start, objective 1 done, wave-2 start, a death) continuous == post-reload; no mid-wave save; a garbage save yields a fresh live run |
| check-polish | PASS | silhouette vs sky, off → on: from-the-road 48.31 → 45.88, over-the-market 66.26 → 66.12, from-the-keep 69.31 → 66.11, down-the-row 65.83 → 65.83, along-the-wall 56.40 → 56.93, the-close 59.72 → 59.80 (floor 40, max drop 8); draw calls off → on at the six vistas + two street cameras: 3350→3358, 2593→2601, 2981→2989, 2053→2061, 2303→2311, 1931→1939, 2854→2862, 1963→1971 (the layer is +8 at most); 33 pooled materials mapped, largest unmapped 1.25 % of a frame; 15 accent meshes on their owners, `companyRust` on the camp banner only; 32/32 lit practicals carry a pool |
| check-music | PASS | 33 checks |
| **check-play** | **FAIL (1)** | latency 1 tick ✓ · runtime ladder + feel wiring ✓ · **rendered ladder monotone ✓** (px/shake/hitstop/text per rung pasted in the file; measured with the world frozen) · whiff ✓ · every rung ≥ 400 px ✓ · composite ✓ · w1: 368 sampled frames, visibleFrac 0.952, first sight p90 1.38 s over 12 sightings ✓ · **w4: 251 frames, visibleFrac 0.608 (need 0.7)** · legible 0.763 over 38 ✓ · Captain legible-as-elite 0.968 over 31 frames, body-only 0.774, 0 x-ray markers ✓ · draw calls w1 2399 / w2 2927 / w3 2449 / w5 2716 / w6 2496 with a wave alive (cap 3400, A9) ✓ · HUD pixels from a real screenshot: HP bar 62 % warm pixels for HP 62, 4 pips for 4 bolts, 3 lamps for 3 lights, tracker 1018 text pixels reading "wave 2 · the market / hold the market" ✓ · payoffs asserted ON THE FRAME: o1 NDC (0.29, 0.44) 42 192 px, o2 (-0.02, -0.37) 16 469 px, o3 (0.02, -0.41) 17 007 px, o4 (-0.70, -0.26) 36 988 px, all in frame ✓ |

## Evidence set

- **Play-camera only** unless a filename says otherwise: `final-evidence/integration/PLAYCAM-play-hud.png` (the HUD frame the pixel assertions were read from) and `PLAYCAM-payoff-o{1..4}-*.png` (the frame each payoff row asserts on), captured by `page.screenshot` of the real compositor. Every district's own set is under `final-evidence/<district>/`, with its frames named per its README/NOTES; files carrying `FREECAM` or `orbit` in the name are free cameras and labelled so by the districts.
- `final-evidence/RESHOT-AFTER-KIT-FIXES.txt` — which frames were re-shot after the brazier/lantern/cart fixes (two of keephill's, pixel-diffed to the fix), and which candidates could not be because no camera was recorded for them (most of southgate's, millreach's, wardrow's and chapelclose's brazier and barricade frames — the districts wrote positions without targets).
- `final-evidence/polish/README.md`, `ab.json`, `frames/` — the A/B pairs for every mechanism at the six vistas and two street cameras, polish off/on, read frame by frame; three defects found by reading them are listed there (rectangular clouds, a dedupe that dropped half the wear, tiled lane patches).
- `final-evidence/integration/GATE-*.txt` / `BROWSER-*.txt` — every gate's output, verbatim, at `64ffeb8`.

## Known-open (red rows, with their numbers; nothing here was tuned away)

1. **simulate-siege, 14 rows** (table above). Novice 0/6 wins (five seeds reach wave 4, the Captain's probe, and die there to the Captain's 30-damage strikes after his 6 m dash; one dies in wave 2), median lights lost 3; expert 4/6 (seeds 2 and 3 die in wave 4); headroom 1.16× (first-minute kills are bounded by arrivals now that wave 2 comes in knots of two — the whole-run rate saturates on the table, 5.83 vs 4.59); novice HP w1 100 (a sprinting player at 6.4 m/s cannot be caught by a 4.4 m/s cutpurse on 28 m of open cobble, and wave 1 has no ranged body — six seeds, three knot layouts, same 100), w2 30, w3 28; pressure w1 0.48 vs designed 0.35; kills/min w6 7.5 vs 8–13; first hexer death 96 s (the novice hand lands ~10 % at the hexer's 9–12 m hold range); no novice Captain kill. Four trace-driven design/policy changes took the referee from "every hand dies in wave 2" to this; three more were measured and reverted. No window moved.
2. **check-play `play:visible` w4 0.608** (need 0.7): wave 4 comes through BOTH gates into the sunk market; from the north rim (the arena's only high ground, where the referee holds) the south ramp is dead ahead and the east stair is 45° off the axis of a camera whose horizontal half-angle is ~40°, so a third of the near bodies are out of frame by geometry while the bot faces its target. Improved from 0.435 (ledger) by the hold policy; the rest is the two-gate geometry of the market.
3. **13 TERMINUS notes** in check-city (warn-only, editorial): the six wall-walk sockets look along a straight 100 m walk whose terminus is the corner tower 70 m out, past the pass's 45 m reach (the towers stand pushed out along the diagonal, so the outward rays leave the town); `market-road-n` +z ends on the gatehouse 68 m out; `market-lane-e` −x on the west curtain 66 m out; `market-road-n` −z and `keep-lane-w` +x close on the keep's climb treads and the ward's revetment (tagged now) at 3–4 m — a wall in the face by design, the stair head and the ward's cliff; `sg-e-lane` −x closes at 5.4 m on a cottage (southgate's stable-yard cottage at the socket — the one that reads as a defect and is recorded as such).
4. **Two `check-city` landmark advisories** (warn): the bell tower is hidden from most of wardrow's waypoints (the gatehouse and the smithy stand between) and the hall from most of marketlow's; both landmarks still read from the vistas and districts the plan contracts.
5. **Evidence frames not re-shot**: the districts' brazier/torch/barricade frames for which no camera was recorded (list in `RESHOT-AFTER-KIT-FIXES.txt`) still show the flame cone the wrong way up.

## Traps hit this stage

Appended to `README.md` ("Traps the integration paid for"): the deck slot and the two height-blind gates; a gate whose exit code could not fail; check-siege double-building the perimeter; arena approaches measured against a gate no cell could see; a landmark ray from one point; a cast-less check-game; a `document`-at-import crash from a kit import; the referee holding inside a room; two "obviously right" policy changes that measured worse; the play gate's sighting count that rewarded looking away; puppeteer's protocol clock. Kit errata: the brazier's parasol was in four more props.
