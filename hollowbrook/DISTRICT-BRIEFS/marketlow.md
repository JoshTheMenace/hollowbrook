# District brief — `marketlow`, The Low Market

Read `_COMMON.md` first. You own district `marketlow`, `x -18..18, z -18..16`.

## The promise (plan `brief`, verbatim)

The sunk market, a step below the town: the level here IS the square at
−1.4 and the four rims are shelves at 0, so the whole district is one arena
with a rim of high ground round it. Twenty-two by twenty metres of cobbled
floor with the well in the middle, market stalls left standing when the
bell rang (the cover), the corn cross, the ramp up to the gate road on the
south and stone steps up on the other three sides. On the west rim THE
REEVE'S HALL, the guild hall, is ENTERABLE: the Reeve's post, the runner's
shelter, the place objectives are given. The chandler's on the east rim
and the Reeve's own house on the north rim. Accent: the guild hall's amber
lanterns (`ACCENT.hallAmber`). Ten minutes ago: the market was clearing and
stopped — a spilled basket, a tipped stall, a dog's bowl.

## The land (terrain, already built)

- level **−1.4** over the envelope (the square). Rim shelves at 0: north
  `z -18..-12`, south `z 8..16`, west `x -18..-10`, east `x 12..18`. The
  floor is `x -10..12, z -12..8` (440 m²). The rim edges are 1.4 m cliffs
  the terrain drew as vertical faces — you face them (coursed stone kerb
  with a coping; `wallRun` at the edge, ≥ 0.5 m proud where a fall would be
  possible: a rim wall flush with the rim lets the player stroll off it).
- climbs (terrain): `market-stair-n` (0,−12)→north, width 4; `market-ramp-s`
  (0, 8)→south, width 6, grade 0.2; `market-stair-w` (−10, 5.5)→west, width
  3; `market-stair-e` (12, −2)→east, width 3. Dress with cheek walls and
  rails (`stairRail` from the flight's two end joints); never collide a
  tread.
- the west stair lands on the rim beside the guild hall's door (z 4..7):
  hall door, then steps down into the square — compose that.

## Sockets

| id | at | axis | width | y | mate |
|---|---|---|---|---|---|
| market-road-s | (0, 16) | z | 6.0 | 0 | gate-road (southgate) |
| market-road-n | (0, −18) | z | 5.0 | 0 | keep-road-s (keephill) |
| market-lane-w | (−18, 6) | x | 3.6 | 0 | mr-market-lane (millreach) |
| market-lane-e | (18, 4) | x | 3.6 | 0 | wr-market-lane (wardrow) |

Anchors: (0,0)=−1.4 · (6,−15)=0 · (−14.2,6)=0 · (15,−8)=0.
Waypoints: the well (1,−3) · the north steps (0,−13.5) · the guild hall
porch (−14.2, 5.5) · the east stair head (15,−2) · the ramp foot (0, 7).

## Enterable: `guildhall` (plan entry, verbatim intent)

Shell 6.8 × 6.0 at [−14.2, 0] on the west rim (ground 0), door on the
SOUTH face (`z+`) at (−14.2, 3.0), ≥ 1.5 m clear — NOT on the east face,
which opens 0.8 m from a 1.4 m drop. `interior_waypoint` (−14.2, 0);
`interior_camera` `guildhall-interior` (−11.6, 1.55, 2.2) → (−15.5, 0.9,
−1.6), subject `guildhall-hearth`; `min_props 10`: the hearth (warm
emissive), the Reeve's table with the muster roll, benches, the town chest,
a lantern rack, shelves of ledgers, a banner. Two metres of clear floor
inside the door: the Reeve and the runner shelter here. The door faces the
square, so a fleeing NPC's run is watchable.

## Neighbours' stubs

southgate south (the gatehouse 9 m at (0, 50), towers 10.5 m); keephill
north (the hall on the keep at 5.2 + 7.5, the bell tower 14 m at (10,−40));
millreach west (a cottage at (−42, 4)); wardrow east (the smithy at (30,−8)).

## Siege: arena `the-market`

rect `x -17..17, z -17..15`, approached from **south-gate**, waves 2 and 4.
`min_cover 8, min_elevation 20, min_landmarks 0`.
- LANES: enemies come down the SOUTH RAMP (wave 2) and, in wave 4, also
  in over the EAST rim from the row lane. The north steps are the player's
  way out to the keep.
- COVER: eight or more `userData.cover` on the FLOOR — stalls (`marketStall`,
  1.2 m trestles read as cover; give each a collider), the well, the corn
  cross's plinth, crate stacks, a tipped cart — arranged so the floor has
  two rows with a lane between, and the well as the centre pivot.
- HIGH GROUND: all four rims (+1.4). Rails only where a fall is possible
  (the rim wall must stand ≥ 0.5 proud), because a 1.4 m rim with no wall
  is a rim the player can drop off — which is a route, and wanted: the
  player drops, the raiders take the stairs.
- HEXER PERCHES: the north rim's west corner and the east stair head —
  visible from everywhere on the floor.
- CHOKES: the four stairs (3–4 m) and the ramp (6 m).

## NPC post

- `reeve` (elder) at (−13.2, 5.2) facing +x, on the rim in front of the
  hall door; 1.5 m clear; shelter `guildhall`. Objective 4 walks him from
  here to the keep — the line (−13.2,5.2)→(0,−13.5)→(0,−19) must be walkable.

## Interactions (plan names)

- **the market bell** at (−12, 6.5): a bell on a post by the hall porch; E
  rings it (the bell swings — `temple`'s `bellPivot` pattern) and the hall's
  lanterns come up (setLit). The game later uses it to send NPCs to shelter.
- **the well bucket** at (1, −3): E winds the bucket up (rope + bucket move
  0.8 m, visible within 8 m).

## Sight corridors crossing you (verbatim)

- `gate-sees-keep` (0,46)→(0,−26), half 3, clear above 8.5 m — "Nothing
  over 8.5 m stands on this line: no building on the market's rims across
  x −3..3". Your north-rim house at (8, −15) is clear; keep the corn cross
  under 8.5 and off the axis.
- `market-sees-tower` (0,0)→(−36,−34), half 3, clear above 9.0 — "From the
  well in the sunk market the wizard's tower and its cold ward-glow are the
  one cool light in a warm town. The guild hall (marketlow) stays under
  9 m on this line."

## Vista you own: `over-the-market`

Camera (0, 2.4, 14) → (2, 8, −40), fov 52, subject
`district:keephill:wardens-hall`. Standing on your own south rim: the
lower two thirds of the frame are yours — the sunk square, stalls, well,
north steps; the hall on the keep clears them by construction. Legibility
gate with polish ON. Landmark `district:keephill:bell-tower` must read
from your waypoints (do not put anything over 8.5 m on the axis).

## Kit you may use

`cottage` + `tradeFront` (chandler, the Reeve's house), `longhouse`
(the guild hall's shell is `hollowShell`; its roof `thatchRoof`/`shingleRoof`),
`marketStall`, `wellHead`, `waymarker`/`shrineStone` (the corn cross —
ask the kit agent for a `marketCross` if you want a proper one),
`crateStack`, `barrelStack`, `cart`, `sackStack`, `bench`, `postLantern`,
`bracketLantern`, `lanternString` (lit, amber — your accent), `stairRail`,
`wallRun` (rim kerb), `siegeProps`, `signKit` (THE REEVE'S HALL fascia,
HOLLOWBROOK CHANDLERS, the watch rota notice, flour prices). Budget 440
meshes (the interior is 30–60 of them).

## Evidence

`over-the-market`; the four interior frames; standing at the ramp foot
looking north; from the well looking at each stair; the north steps
looking back south at the ramp; a rim frame from the north-west corner
(a hexer's eye view); the socket frames from all four neighbours' sides;
the orbit sweep; a low frame up at the hall's eaves from the floor.
