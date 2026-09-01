# District brief — `chapelclose`, The Chapel Close

Read `_COMMON.md` first. You own district `chapelclose`, `x -54..-18, z -54..-12`.

## The promise (plan `brief`, verbatim)

The quiet north-west under the north and west wall-walks: ST. WENNA'S
chapel (ENTERABLE — the hedge-wizard's shelter, the ward stone inside its
porch), the graveyard with its yews, the almshouse row, and the WIZARD'S
TOWER in the corner by the NW tower, its upper windows already showing the
ward-glow: the town's ONLY cool accent and ONLY strong emissive. Wave 5
makes this the arena — the storm reaches the back of the town — so the
close needs cover among the graves (table tombs, the lych-gate, the well,
the almshouse's pentice) and the chapel needs to be a real refuge with a
door the fill can walk through. Ten minutes ago: candles being lit for a
vigil nobody will hold, the wizard's door open, a cat on the tomb.

**You own the town's one cool colour**: `ACCENT.wardGlow` / `PAL.tealGlow`,
on the tower's upper windows, the ward stone and nothing else. Everything
else in Hollowbrook is torch-warm, which is why it lands.

## The land (terrain, already built)

- level 0 over the envelope.
- wall-walk at 5.0: west run `x -51.2..-48.8, z -51.2..-12`, north run
  `x -51.2..-18, z -51.2..-48.8`, corner (−50, −50) = `nw-tower` (yours);
  landing `x -33..-30, z -48.8..-45.8`; flight `close-wall-stair`
  (−42.5, −47.3)→east to x −32.5, along the north wall's inner face.

## Sockets

| id | at | axis | width | y | mate |
|---|---|---|---|---|---|
| cc-s-lane | (−36, −12) | z | 3.2 | 0 | mr-n-lane (millreach) |
| cc-lane-e | (−18, −30) | x | 3.0 | 0 | keep-lane-w (keephill) |
| cc-walk-s | (−50, −12) | z | 2.4 | 5 | mr-walk-n (millreach) |
| cc-walk-e | (−18, −50) | x | 2.4 | 5 | keep-walk-w (keephill) |

Anchors: (−36,−30)=0 · (−50,−30)=5 · (−31.5,−47.3)=5 · (−30,−50)=5.
Waypoints: the chapel door (−30,−17.5) · the graveyard (−28,−40) · the
wizard's tower foot (−40,−34) · the north wall-walk, west run (−30,−50) ·
the west wall-walk, north half (−50,−30).

## Enterable: `chapel`

Shell 7.2 × 5.6 at [−30, −22], door on the south face (`z+`) at (−30, −19.2)
onto the lane from the market, ≥ 1.5 m clear; `interior_waypoint`
(−30, −22); camera `chapel-interior` (−27.6, 1.55, −20.6) → (−32.5, 0.9,
−24.0), subject `chapel-altar`; `min_props 8`: the altar with candles
(warm emissive), pews (benches), a tomb chest, a lectern, a font, a
candle stand, a banner (a device, no saint's face), a chest. The
hedge-wizard shelters here; 2 m clear inside the door. **Ridge under
9 m** (the `market-sees-tower` corridor crosses the chapel's NE corner).

## Neighbours' stubs

millreach south (the tannery at (−30, −4)); keephill east (the almoner's
house at (34, −30) is far; nearer, keephill's north wall-walk continues
yours at (−18, −50)); marketlow at the south-east corner (the guild hall
at (−14.2, 0) beyond your corner).

## Siege: arena `the-close`

rect `x -47..-20, z -47..-14`, approached from **east-gate** (wave 5's storm
reaches here through Keep Hill's lane at (−18, −30) and up the mill lane).
`min_cover 6, min_elevation 6, min_landmarks 1` (`district:chapelclose:wizard-tower`
from the rect centre).
- LANES: the lane in from the keep at (−18, −30) and from the mill at
  (−36, −12); they meet at the lych-gate.
- COVER: table tombs (0.9–1.1 m, colliders, `cover`), the lych-gate's
  piers, the well, the almshouse's pentice posts, a cart — the graveyard
  is the cover field, laid out in rows with a lane between.
- HIGH GROUND: the north and west wall-walks (the corner is the best
  shooting position in the district — it sees both lanes).
- CHOKE: the lych-gate (2.0 m clear between its piers — measure it with
  the radius: 2.0 m of opening is 1.32 walkable) and the chapel door.
- HEXER PERCH: the almshouse's steps and the tower's door step.

## NPC post

- `hedgewizard` (mage) at (−40, −34) facing +x, at his tower's foot; 1.5 m
  clear; shelter `chapel` — the line (−40,−34)→(−30,−19.2) walkable.

## Interaction (plan name)

- **the ward stone** at (−33, −17): a standing stone by the chapel porch;
  E wakes it — the ward-glow comes up on the stone and the tower's lamps
  brighten (your only emissive; a local glowing material with a pool).

## Sight corridors crossing you (verbatim)

- `market-sees-tower` (0,0)→(−36,−34), half 3, clear above 9.0 — "From the
  well in the sunk market the wizard's tower and its cold ward-glow are
  the one cool light in a warm town. The chapel's ridge (chapelclose) and
  the guild hall (marketlow) stay under 9 m on this line; the chapel's
  north-east corner is 0.1 m inside the corridor's edge, so its ridge
  height is a contract, not a taste."

## Vista you own: `the-close`

Camera (−22, 6.6, −50) → (−44, 10, −40), fov 52, subject
`district:chapelclose:wizard-tower`. Standing on your north wall-walk at
its east end, looking west along the parapet at the tower with its
ward-glow, the chapel roof and the yews below. The tower's silhouette (a
crooked cap, banded, 16 m) against the dusk sky ≥ 40 luma with polish ON;
the glow is the one cool point in the frame — spend it there and nowhere
else. Landmark: `wizard-tower` reads from `the-close` and from marketlow's
waypoints; `ctx.add(g, 'wizard-tower')`.

## Kit you may use

`roundTower` (the wizard's tower with `glowColor: PAL.tealGlow` — the ONLY
caller allowed to pass it; the NW corner tower), `temple` (the chapel's
form; its shell is `hollowShell`), `cottage` / `longhouse` (almshouse row),
`curtainWall`, `stairTurret`, `treeStand('yew')`, `shrineStone` (graves,
`flameColor` for a votive — warm, not teal), `wellHead`, `fenceRun`,
`pier` (lych-gate), `hedgeRun`, `bench`, `postLantern`, `siegeProps`,
`signKit` (ST. WENNA'S, bell-times, the lost-dog notice — a DRAWN dog).
Budget 440 meshes.

## Evidence

`the-close`; the four interior frames; through the lych-gate into the
graveyard; from the tower foot toward the chapel; the two lane sockets
from the neighbours' sides; from the NW corner down both walks; the orbit
sweep; a low frame up at the tower at dusk with the glow on.
