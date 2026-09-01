# Common brief — read before your district's file

You are one of six parallel district agents building **Hollowbrook**, a
first-person siege in a walled fantasy town (`GAME-DESIGN.md`). You own ONE
district and build it as a vignette inside your envelope. The plan
(`city-plan.json`) is the contract; your district's entry is your promise;
your sockets and anchors are non-negotiable; you import every generator
from `src/kit/index.js` and never write a building generator of your own.
Read `src/kit/README.md` (its six rules and trap list) and
`src/kit/SIEGE.md` (the kit-extension agent's notes on `curtainWall`,
`gatehouse`, `stairTurret`, `barricade`, the switching practicals) before
your first line.

## What is already there

**The ground is the terrain's, not yours.** Every level, every rim, every
shelf, the whole wall-walk (a 2.4 m shelf at y 5.0 at x/z ±48.8..51.2, gapped
only at the two gates), your stair-head landing and the flight up to it,
the market's four rims and its stairs, the keep's two shelves and its two
flights — all of it stands before you start, gated by `check-terrain.mjs`.
You DRESS it: paving decals, kerbs, steps you lay on it, revetment facing on
the cliffs the terrain drew. You never `ctx.platform` a rectangle over 30 m²
(composeCity warns) and you never move a promised height (composeCity
throws). Measure the land first: build with `?only=<id>` and print
`ctx.groundAt` over your envelope and every socket landing into your
module's header, the way Thistledown's `gateward.js` does.

**Your wall.** If your envelope carries a wall-walk shelf, you call
`curtainWall` for each run of it (both scarps, parapet, merlons) and
`stairTurret` on your landing. Runs end in your corner tower (`roundTower`)
or at a socket, never in mid-air. The parapet's colliders carry `bottom` so
the street under the wall is not sealed. Corner towers are yours if
`plan.siege.corner_towers` says so.

**Your neighbours** arrive as stub massing (`composeCity({ only })`), so
your edges compose against the right masses at the right heights. Their
sockets are yours to honour: ground continuous within a step, a corridor of
the socket's width kept clear 3 m into your side, and the flood fill must
cross. A route across a boundary anywhere else is a seam bug.

## What every district owes

- **At least one interaction** (yours are in the plan) that changes something
  visible within 8 m of its prompt — `check-interactions.mjs` diffs the
  scene before and after and fails a no-op. Register with `interactive(ctx,
  { name, label, at, size, action })`; the `name` must be the plan's.
- **Cover.** Your arena rect (plan `game.arenas`) needs `min_cover`
  collider-bearing obstacles fully inside it, tagged `userData.cover`,
  ≥ 0.9 m tall, placed so a player can put one between themselves and the
  gate your arena is approached from. Cover is placed like a level designer
  places it — clusters, not scatter; a lane of it toward the high ground.
- **Elevation and landmarks** per the arena entry; `check-game.mjs`.
- **NPC posts** (plan `game.npc_posts` in your district): standable ground
  (no collider within 0.34 m), facing the declared way, 1.5 m of clear
  ground round them, and the shelter route walkable. The characters
  themselves come from the game layer; you leave the ground.
- **Objective points** in your district (`game.objectives`): standable, and
  the thing they name (a barricade, a brazier) is yours to build with the
  kit's switching prop.
- **Enterable buildings** declared in your entry: `hollowShell` +
  `enterableColliders` (never one footprint collider), door ≥ 1.4 m clear,
  interior dressed from `src/interiors.js` to `min_props`, `registerInterior`,
  the interior camera passing the camera gate. Four frames of evidence:
  street door shut, glimpse through the open door, interior wide, and the
  view back OUT of the doorway. The room is a shelter: 2 m of clear floor
  inside the door for an NPC to stand in.
- **Sight corridors** that cross you (verbatim in your file) and the vista
  you own, passing the legibility gate with the polish layer on.
- **Your accent**, on the thing the plan says and nothing else. NEVER
  `ACCENT.companyRust` — that is the enemy's, town-wide, and the raiders'
  legibility depends on nothing in the town wearing it. NEVER
  `ACCENT.wardGlow` / `PAL.tealGlow` unless you are chapelclose.
- **No people anywhere** — signs, notices, devices, silhouettes. Living
  beings come only from the character pipeline.
- **Ten minutes ago.** Every district brief says who was here and what they
  dropped. Clusters of evidence, not scatter.

## Siege design vocabulary (what "good" means here)

- **Lanes**: the gate → arena → next-arena path is a 5–6 m channel the
  enemies will run; keep it legible and keep one flank of it covered.
- **Chokepoints**: 1.8–3.0 m throats (a gap in a wall, a barricade with its
  1.8 m gap, a stair) where the player can hold; every district has one.
- **High ground**: the wall-walk, the market rim, the keep, a mill gallery —
  reachable in ≤ 12 m of walking from the arena centre, with a way DOWN
  that is not the way up.
- **Cover** reads at 25 m and is 0.9–1.4 m tall (crouch does not exist; a
  1.4 m cart is a wall you shoot over, a 0.6 m barrel is a trip).
- **Hexer perches**: one or two spots at +1.5..+5 m the hexers will stand
  on; keep them visible from the arena floor.
- **Shelter doors** face the arena so a fleeing NPC's run is visible.

## Gates you must pass before you finish

```
node scripts/validate-city-plan.mjs
node scripts/check-city.mjs --district <id>       # seams, fill, budget, interiors
node scripts/check-spatial.mjs                    # floating / buried / holes
node scripts/check-cameras.mjs                    # your vista and interior cameras
node scripts/check-game.mjs                       # cover / elevation / landmarks / posts
node scripts/check-interactions.mjs               # your interactions act
node scripts/check-arena-visibility.mjs           # your arena sees its approach
```
and in the page: `__vignette.checkAllVistas()` for your vista (legibility,
polish ON) and `__vignette.checkSpatial()`.

## Evidence (play-camera only)

Every frame is captured with `__shot` from a standing eye (1.62 m) or from
the plan's vista/interior cameras — never a free flying camera except the
four-shot orbit sweep. Your set: your contracted cameras; a route sweep (one
frame per waypoint plus one looking back); a low frame up at your roofline;
an orbit sweep at 90° steps; the four interior frames per enterable; the
per-socket frame FROM THE NEIGHBOUR'S SIDE; and one frame from the
wall-walk down onto your arena. Read every image. Name the single worst
defect, fix at the earliest failed stage, recapture. Two to three repair
passes are the budget, not the failure.

## Budget

Your `budgets.max_meshes` is binding (400–460); triangles are not the
constraint. Pool per material (`parts()`), instance repeated props, and
remember the game will add ~200 meshes of enemies and effects on top of
the whole town: **do not spend your last 40 meshes**.
