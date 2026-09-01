# District brief — `wardrow`, The Ward Row

Read `_COMMON.md` first. You own district `wardrow`, `x 18..54, z -18..54`.

## The promise (plan `brief`, verbatim)

The east of the town: a close-set row of crooked cottages along the row
lane from the market's east stair to the EAST GATE — the second gate, and
wave 3's breach. A. STANHOPE'S SMITHY (ENTERABLE — the smith's post and
shelter, the barricade beat's start, the forge banked) stands at the north
end by the lane from Keep Hill; THE PLOUGH & LANTERN inn at the south end;
kitchen gardens, washing lines, the bake-oven, and three BARRICADE points
on the lane that the smith and the player raise in breather 2. The east and
south-east wall-walks with the SE tower and the stair turret at z 40 are
this district's high ground. The east gate spans the terrain gap the same
way the south gatehouse does. Accent: `ACCENT.rowGreen`, the painted doors,
one bottle-green family. Ten minutes ago: doors slammed, a ladder left
against an eave, the forge fire fed one last time.

## The land (terrain, already built)

- level 0 over the envelope.
- wall-walk at 5.0: east run north of the gate `x 48.8..51.2, z -18..18.5`,
  east run south of it `z 25.5..51.2`, south run `x 18..51.2, z 48.8..51.2`,
  corner (50, 50) = `se-tower` (yours). **The gap `z 18.5..25.5` is the
  east gate passage at 0** — your `gatehouse` spans it (plan
  `siege.gates.east-gate`: passage `x 47.6..52.4, z 18.5..25.5`) with a walk
  platform at 5.0 overlapping each shelf by 0.3 m.
- landing `x 45.8..48.8, z 40..43`; flight `row-wall-stair` (47.3,
  30.6)→north to z 40.6 along the east wall's inner face, SOUTH of the
  gate. (The run north of the gate reaches the keep's stair through the
  keep-walk-e socket; the run south of it had no stair until this one.)

## Sockets

| id | at | axis | width | y | mate |
|---|---|---|---|---|---|
| wr-w-lane | (18, 36) | x | 3.6 | 0 | sg-e-lane (southgate) |
| wr-market-lane | (18, 4) | x | 3.6 | 0 | market-lane-e (marketlow) |
| wr-lane-n | (36, −18) | z | 3.6 | 0 | keep-lane-e (keephill) |
| wr-walk-s | (18, 50) | x | 2.4 | 5 | sg-walk-e (southgate) |
| wr-walk-n | (50, −18) | z | 2.4 | 5 | keep-walk-e (keephill) |

Anchors: (36,20)=0 · (50,0)=5 · (47.3,41.5)=5 · (36,50)=5 · (50,22)=0.
Waypoints: the row lane (36,20) · under the east gate (50,22) · the smithy
yard (30,−3) · the east wall-walk (50,0) · the SE tower foot (46,46) · the
east road (58,22).

## Enterable: `smithy`

Shell 7 × 5.4 at [30, −8], door on the south face (`z+`) at (31, −5.3)
onto the smithy yard, ≥ 1.5 m clear; `interior_waypoint` (30, −8); camera
`smithy-interior` (27.4, 1.55, −6.2) → (32.6, 0.9, −9.5), subject
`smithy-hearth`; `min_props 8`: the forge hearth (ember emissive), anvil,
bellows (the interaction stands at the door), quench trough, tool wall,
a rack of finished spearheads, a bench, coal. The smith shelters here.

## Neighbours' stubs

marketlow west (the chandler at (15, −8), the east rim at 0 — your market
lane arrives at its stair head); southgate south-west (the stable at
(11, 22)); keephill north (the almoner's house at (34, −30) 6 m).

## Siege: arena `the-row`

rect `x 20..47, z -16..47`, approached from **east-gate**, wave 3 (and both
gates from wave 4). `min_cover 6, min_elevation 6, min_landmarks 1`
(`district:wardrow:eastgate` reads from the rect centre).
- LANE: the row lane, gate (50, 22) → west along z ≈ 22 → the market's
  east stair (15, −2), with the branch north to the smithy and the keep.
- BARRICADES (objective `o2-barricades`, three points, all yours): at
  (40, 22) across the lane inside the gate, (36, 12) on the branch north,
  (28, 36) on the lane to the inn. Kit `barricade({ kind })`, DOWN by
  default, `raise()` on the interaction (the first one is the plan's
  interaction "the lane barricade"; the game raises the other two by the
  same API). UP state leaves the declared 1.8 m gap at one end.
- COVER: four obstacles before the barricades and six after — carts, the
  bake-oven, garden walls (`plotWall`-like `wallRun`s ≥ 0.9 m), the well,
  the inn's bench row, water butts.
- HIGH GROUND: the east wall-walk (both runs), the gatehouse platform over
  the passage (the best position in wave 3 — it looks straight down the
  lane at everything coming in), the stair turret.
- CHOKES: the gate passage (5 m), the three barricades.
- HEXER PERCH: the inn's steps and the row's bake-oven.
- SPAWN RING `camp-east` at (60, 22), r 3–8, in the surrounds (southgate
  owns the surrounds; you may place the Company's camp here IF you ask the
  coordinator — the plan currently gives the camp to southgate). No
  colliders in the ring; approach (58,22) (50,22) (40,22) open.

## NPC post

- `smith` (brute) at (33, −4.2) facing +z at the smithy door; 1.5 m clear;
  shelter `smithy`.

## Interactions (plan names)

- **the lane barricade** at (40, 22): E raises it (carts swing across, the
  collider registers, ≥ 8 objects move within 8 m).
- **the forge bellows** at (31, −4): E pumps them; the hearth flares
  (a local glowing material, its own pool).

## Sight corridors crossing you (verbatim)

- `keep-sees-eastgate` (12,−30)→(46,20), half 3, clear above 7.5 — "From
  the keep platform the East Gate must read, so the player on the high
  ground can see the second gate open in wave 3 and the Company come
  through it. Nothing over 7.5 m on this diagonal: the row's cottages stay
  under it and the smithy's chimney stands clear of it."

## Vista you own: `down-the-row`

Camera (15, 1.6, 4) → (50, 4, 22), fov 52, subject `district:wardrow:eastgate`.
Standing at the market's east stair head, looking east down the row lane at
the East Gate; every mass between is yours. The gate must read AS a gate at
the end of a lane (an arch with towers, the portcullis raised, torches lit)
against the darkening east sky — ≥ 40 luma with polish ON. Landmark:
`eastgate` reads from `down-the-row` and from marketlow's waypoints;
`ctx.add(g, 'eastgate')`.

## Kit you may use

`gatehouse` (east gate), `roundTower` (SE corner tower, the gate's towers),
`curtainWall`, `stairTurret`, `cottage` (the row, `door: ACCENT.rowGreen`),
`longhouse` + `tradeFront` (the inn), `hollowShell` (smithy), `leanTo`
(forge bay, bake-oven shed), `barricade`, `wallRun`, `fenceRun('paling')`,
`hedgeRun`, `kitchenGarden`, `washingLine`, `ladder`, `cart`, `barrelStack`,
`crateStack`, `logPile`, `wellHead`, `bench`, `bracketLantern`,
`postLantern`, `torch`, `siegeProps`, `signKit` (A. STANHOPE — SMITH, THE
PLOUGH & LANTERN, the watch rota). Budget 440 meshes.

## Evidence

`down-the-row`; the four interior frames; under the east gate looking
both ways; the lane from the gate with the barricades down and UP; from the
gatehouse platform down the lane; from the SE tower along both walks; the
socket frames from southgate's, marketlow's and keephill's sides; the orbit
sweep; a low frame up at the row's eaves.
