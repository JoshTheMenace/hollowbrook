# District brief — `millreach`, The Mill Reach

Read `_COMMON.md` first. You own district `millreach`, `x -54..-18, z -12..54`.

## The promise (plan `brief`, verbatim)

The working west of the town under the west wall: the tower windmill with
its sails turning in the last of the wind, the granary, the tannery, the
miller's cottage, sheep pens, the cart track in from the market lane, and
the whole south-west and west wall-walk with the SW corner tower and the
stair turret at z 30. No gate here: this is the wall you HOLD, and the
Millstone Warden (the golem, an ally) stands in the mill yard. The mill lane
(sg-w-lane) is the back way from the gate square. Accent: `ACCENT.sailOchre`
on the mill sails' canvas. Ten minutes ago: flour being sacked and stopped;
the sheep driven in; somebody dropped a lantern on the track.

## The land (terrain, already built)

- level 0 over the envelope.
- wall-walk at 5.0: south run `x -51.2..-18, z 48.8..51.2` and west run
  `x -51.2..-48.8, z -12..51.2`, meeting at the SW corner (−50, 50) =
  `sw-tower` (yours); landing `x -48.8..-45.8, z 30..33`; flight
  `mill-wall-stair` (−47.3, 20.6)→north to z 30.6, width 1.6, along the
  west wall's inner face.
- outer scarps along x −51.2 (west) and z 51.2 (south) down to the berm.

## Sockets

| id | at | axis | width | y | mate |
|---|---|---|---|---|---|
| mr-e-lane | (−18, 34) | x | 3.0 | 0 | sg-w-lane (southgate) |
| mr-market-lane | (−18, 6) | x | 3.6 | 0 | market-lane-w (marketlow) |
| mr-n-lane | (−36, −12) | z | 3.2 | 0 | cc-s-lane (chapelclose) |
| mr-walk-s | (−18, 50) | x | 2.4 | 5 | sg-walk-w (southgate) |
| mr-walk-n | (−50, −12) | z | 2.4 | 5 | cc-walk-s (chapelclose) |

Anchors: (−36,20)=0 · (−50,10)=5 · (−47.3,31.5)=5 · (−30,50)=5.
Waypoints: under the mill (−38,24) · the mill lane (−22,34) · the west
wall-walk (−50,10) · the SW tower foot (−46,46) · the tannery yard (−40,−4).

## Neighbours' stubs

southgate east (the lodge at (−11, 24), the gatehouse at (0, 50));
marketlow east (the guild hall at (−14.2, 0), whose west wall is 0.4 m from
your boundary — your market lane arrives beside it); chapelclose north (a
cottage-sized tannery stub at (−30, −4) is YOURS; the chapel at (−30, −22)
is theirs).

## Siege: arena `the-mill`

rect `x -47..-20, z -10..47`, approached from **south-gate** (wave 2's
stragglers and wave 5 spill here from the gate square down the mill lane).
`min_cover 6, min_elevation 6, min_landmarks 1` (`district:millreach:mill`
reads from the rect centre).
- LANE: the mill lane from (−18, 34) west into the yard, and the market
  lane from (−18, 6).
- COVER: the yard's working gear — the cart, sack stacks, the rick, the
  sheep pens' hurdles (`fenceRun('hurdle')`, collide), the granary's
  corner, a mantlet. Two clusters: the yard and the tannery.
- HIGH GROUND: the west wall-walk (the whole 63 m of it) and the mill's
  gallery (`windmill({ gallery })` — register its platform and a way up;
  Thistledown's mill had none: add an external stair, treads overlapping).
- CHOKE: the narrow between the granary and the tannery (2.4 m), and the
  mill lane's mouth at the gate square.
- HEXER PERCH: the granary's loading step.

## NPC post

- `millwarden` (golem) at (−32.5, 22) facing +x, in the yard between the
  mill and the lane; 2 m clear (he is 1.55 m of stone and swings); no
  shelter (he does not flee).

## Interaction (plan name)

- **the mill brake** at (−37, 22): E throws the brake lever; the sails
  stop (windmill's `spin`) and start again on the second press.

## Vista you own: `along-the-wall`

Camera (−50, 6.6, 0) → (−42, 8, 26), fov 52, subject
`district:millreach:mill`. Standing on your west wall-walk: the parapet is
the foreground, the mill and its yard below are the subject, the SW tower
closes the walk. This frame is the one that says the wall is a place you
stand on; compose the merlons so the sails are seen THROUGH the crenels.
Legibility with polish ON; the mill's cap and sails against the dusk sky.

Landmark: `district:millreach:mill` must read from `along-the-wall` and
from southgate's waypoints (14 m at (−38, 24): it clears the lodge).
`ctx.add(g, 'mill')`.

## Kit you may use

`windmill` (pass `ctx` so the sails turn; `cloth: ACCENT.sailOchre`),
`cottage` (miller's, tannery), `longhouse` (granary), `roundTower` (SW
tower), `curtainWall`, `stairTurret`, `fenceRun('hurdle' | 'post-rail')`,
`cart` ('flour'), `sackStack`, `hayRick`, `hayBale`, `barrelStack`,
`logPile`, `trough`, `chickenCoop`, `postLantern`, `torch`, `siegeProps`,
`treeStand('orchard')` (a few trees against the north end), `signKit`
(HOLLOWBROOK MILL, THE TANNERY, flour prices). Budget 400 meshes.

## Evidence

`along-the-wall`; under the mill looking up; the mill lane from the gate
square's side (the socket frame); the market lane from marketlow's side;
the stair and turret from the yard; from the SW tower along the south walk
toward the gate; the orbit sweep; a low frame up at the sails.
