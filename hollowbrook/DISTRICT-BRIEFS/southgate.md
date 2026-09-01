# District brief — `southgate`, The South Gate

Read `_COMMON.md` first. You own district `southgate`. Build it as a
vignette inside `x -18..18, z 16..54`. Your plan entry in `city-plan.json`
is your contract; this file is the excerpt, the neighbours, and the siege.

## The promise (plan `brief`, verbatim)

The barbican and the gate square: the town's front door and wave 1's arena.
A stone gatehouse with two round towers spans the terrain's gap in the south
wall-walk; inside is a cobbled square 28 m wide with the wardens' lodge, the
stable and the muster ground, dressed for a siege that is minutes away.
Outside the gate you own the SURROUNDS: the siege road, the ditch and berm
under the curtain, and the Company's camp fires at the spawn ring where the
road meets the dark. Accent: `ACCENT.wardenMadder` on the banner pair and the
gate torches, nothing else. Ten minutes ago: the wardens barring the gate, a
cart abandoned mid-unload.

## The land (terrain, already built — measure it, do not lay it)

- level 0.0 over the envelope; surrounds beyond z 54 fall to −0.4 over 8 m.
- wall-walk shelves at y 5.0: `x -18..-3.5` and `x 3.5..18`, `z 48.8..51.2`;
  **the gap `x -3.5..3.5` is the gate passage at 0** — your `gatehouse` spans
  it and registers the walk platform at 5.0 across it, overlapping each
  shelf by 0.3 m (plan `siege.gates.south-gate`: passage `x -3.5..3.5, z 47.6..52.4`).
- stair-head landing `x -18..-15, z 45.8..48.8` at 5.0; the flight
  `south-wall-stair` runs from (−5.6, 47.3) west to x −15.6, width 1.6, 25
  treads (terrain). Dress it with `stairTurret` + a cheek wall; do not
  collide the treads or the landing top.
- outer scarp 5 m tall along z 51.2 (the curtain's field face) down to the
  berm at z 51.2..54 — `curtainWall` faces both scarps.

## Sockets (all honoured by the terrain; keep the corridors clear 3 m in)

| id | at | axis | width | y | mate (district) |
|---|---|---|---|---|---|
| gate-road | (0, 16) | z | 6.0 | 0 | market-road-s (marketlow) |
| sg-w-lane | (−18, 34) | x | 3.0 | 0 | mr-e-lane (millreach) |
| sg-e-lane | (18, 36) | x | 3.6 | 0 | wr-w-lane (wardrow) |
| sg-walk-w | (−18, 50) | x | 2.4 | 5 | mr-walk-s (millreach) |
| sg-walk-e | (18, 50) | x | 2.4 | 5 | wr-walk-s (wardrow) |

Anchors: (0,30)=0 · (−10,50)=5 · (−16.5,47.3)=5 · (0,53)=0.
Waypoints: the gate square (0,30) · under the arch (0,50) · the south
wall-walk (−10,50) · the stair-head turret (−16.5,47.3) · the siege road (0,58).

## Neighbours' stubs (what you compose against)

marketlow to the north at level −1.4 with its south rim at 0 (`z 8..16`)
and the guild hall stub at (−14.2, 0); millreach west (mill 14 m tall at
(−38, 24), granary at (−28, 42)); wardrow east (inn 7 m at (28, 42), the
east gate at (50, 22)). The market ramp comes up to your `gate-road` socket:
from the arch the road runs 34 m to the top of that ramp — that view is
`gate-sees-keep`.

## Siege: arena `gate-square`

rect `x -16..16, z 18..47`, approached from **south-gate**, waves 1 (2 also
passes through). `min_cover 6, min_elevation 6, min_landmarks 1`
(`district:southgate:gatehouse` must read from the rect centre — it is your
own landmark and the from-the-keep vista's subject).
- LANE: arch → square → the market ramp at (0, 16): a 6 m channel down the
  middle; nothing tall on the axis (corridor below).
- COVER: six or more `userData.cover` obstacles 0.9–1.4 m tall in two
  clusters: the muster ground west of the axis (a mantlet, gabions, a
  spear rack, the trough) and the stable side east (carts, barrels, the
  well). Leave the axis itself clear.
- CHOKE: the arch (5 m passage). HIGH GROUND: the walk either side of the
  gate (via the stair at x −5.6 and the towers' door platforms) and the
  gatehouse's own platform, which looks straight down the lane.
- HEXER PERCH: the stable's mounting block / a cart bed on the east side.
- SPAWN RING `camp-south` at (0, 60), r 3–8: the Company's camp (kit
  `campFire`, `tent`, a `bannerPole` in `companyRust` — the ONE place in
  the world that colour is allowed, and it is the enemy's). NO colliders in
  the ring; approach points (0,58) (0,50) (0,40) stay open.

## NPC posts (leave the ground; the cast is the game's)

- `runner` (mika) at (3, 27) facing −z — she runs to the guild hall in
  breather 1; keep the line (3,27)→(0,16)→(−14.2,5) walkable and legible.
- `bowman` (archer) at (8, 50) facing +z, ON the wall-walk over the field;
  1.5 m clear round him, a crenel in front of him.

## Interactions (plan; register with these names)

- **the portcullis winch** at (−5, 46.5): a windlass in the west tower's
  foot; E turns it and the portcullis in the arch drops 1.2 m (visible
  within 8 m) — the mechanic is the game's later; the prop moves now.
- **the gate brazier** at (5.5, 44): built unlit; E stirs it to a flare
  (Thistledown's gateward pattern — a LOCAL glowing material, never the
  pooled one).

## Sight corridors crossing you (verbatim)

- `gate-sees-keep` (0,46)→(0,−26), half-width 3, clear above 8.5 m —
  "Coming through the south gate the keep's bell tower over the far end of
  the market is the axis of the whole town and the place the siege ends.
  Nothing over 8.5 m stands on this line." Your gatehouse's parapet is at
  47.6..52.4 — BEHIND the corridor's start; keep the square's axis clear.

## Vista you own: `from-the-road`

Camera (−8, 8.5, 64) → (4, 12, −30), fov 50, subject
`district:keephill:bell-tower`. You stand on the siege road you own; the
gatehouse frames the tower; the camp fires are the foreground. The number
8.5 is derived (gatehouse parapet 9 m at 14 m; tower 94 m out; below y 7.25
the gate hides it) — if you raise the gatehouse, re-derive. Passes the
legibility gate with polish ON: silhouette vs sky ≥ 40 luma.

Landmark contract: `district:southgate:gatehouse` must read from vista
`from-the-keep` and from marketlow's waypoints — add the gatehouse as
`ctx.add(group, 'gatehouse')`.

## Kit you may use

`gatehouse`, `roundTower` (the two flanking towers, `door` platforms onto
the walk), `curtainWall`, `stairTurret`, `cottage` (lodge, stable),
`leanTo`, `fenceRun('palisade')`, `bannerPole`, `torch`, `brazier`,
`postLantern`, `cart`, `barrelStack`, `crateStack`, `trough`, `hayRick`,
`mountingBlock`, `logPile`, `siegeProps` (mantlet, gabions, spear rack,
felled cart), `campFire`, `tent`, `treeStand('hedgerow')` for the far
treeline (the surrounds' terminus — the check-city terminus list says the
road's +z view ends in fog until you close it), `signKit` (WARDENS OF
HOLLOWBROOK fascia, toll board, MUSTER bills). Budget 400 meshes.

## Evidence

Contracted: `from-the-road`; plus: standing at (0, 30) looking north (the
opening frame of the game — it must contain the game: the ramp down, the
market, the tower); under the arch looking both ways; the wall-walk looking
east across the gap at the gatehouse platform; the socket frames from
marketlow's, millreach's and wardrow's sides; the orbit sweep; a low frame
up at the towers from the road.
