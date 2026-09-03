# southgate — evidence

Every `play-*`, `wp-*`, `socket-*` and `int-*` frame is a PLAY CAMERA: a
standing eye at 1.62 m over `groundAt(x, z, fromY)`, captured with `__shot`
at 1280 × 720 through the full pipeline. `vista-from-the-road` is the plan's
own review camera. The four `free-orbit-*` frames are the only FREE-CAMERA
frames here and are labelled as such — 23 m up, 48 m out, 90° steps.

All frames are `?only=southgate`, so every brown box in the middle distance
is a neighbour's `massing` stub, not a building.

## The frames

| frame | camera | what it is for |
|---|---|---|
| `play-01-arrival-gate-square` | (0, 30) → the gate | wave 1 arrives through this |
| `play-02-arrival-north-the-game` | (0, 30) → north | the opening frame: the ruts, the market ramp, the keep's mass on the axis (`gate-sees-keep`) |
| `play-03-under-the-arch-in` | (0, 50.5) → the square | the choke, looking in |
| `play-04-under-the-arch-out` | (0, 49.5) → the road | the choke, looking out at the Company |
| `play-05-bowman-post-down-the-lane` | (8, 50) on the walk | the militia bowman's own post and his shooting gallery |
| `play-06-wallwalk-across-the-gap` | (−9, 50) → east | the gatehouse deck across the gate gap |
| `play-07-wallwalk-onto-the-arena` | (−6, 50) → down | the walk down onto the arena |
| `play-08-muster-ground` | the square → west | the west cover cluster: mantlet, gabions, spear rack, trough, the shooting stage |
| `play-09-shooting-stage-on-it` | ON the stage, 0.86 m | the arena's own high ground, looking at the gate it covers |
| `play-10-stable-yard` | the square → east | the east cover cluster: the carrier's cart, the well, the barrels, the rick |
| `play-11-low-at-the-towers` | the road, eye 0.45 | the roofline, low |
| `play-12-the-company-camp` | the spawn ring | the enemy's camp, and the only `ACCENT.companyRust` in the world |
| `wp-1`…`wp-5` | the plan's five waypoints | each reached by the flood fill (see `GATE-check-city-southgate.txt`) |
| `socket-*-from-*` | 4 m into the NEIGHBOUR's side | each socket looking in |
| `socket-*-looking-back` | 4 m into MY side | the same socket looking back out |
| `int-A-winch-before` / `-after` | the muster ground | E turns the windlass; the portcullis drops 1.2 m into the arch |
| `int-B-brazier-before` / `-after` | the gate mouth | E stirs the brazier to a flare |
| `vista-from-the-road` | the plan's `from-the-road` | the vista this district owns |
| `free-orbit-*` | FREE CAMERA | the massing sweep |

## Gates

Every `GATE-*.txt` is the tool's actual output. The rows that are not green
and why none of them is fixable from inside this district:

1. **`GATE-check-cameras.txt` passes `from-the-road`**, but the in-page
   `__vignette.checkAllVistas()` cannot score its LEGIBILITY yet: the
   vista's subject is `district:keephill:bell-tower` and keephill is still a
   stub, so the run reports `subject … is not in the scene`. The one vista
   whose subject IS built — `from-the-keep`, whose subject is this
   district's gatehouse — passes with **silhouette vs sky 74.12 luma over
   69 % of the outline** (the contract is ≥ 40). Re-run
   `checkAllVistas()` for `from-the-road` once keephill's tower stands.

2. **`GATE-check-game.txt`: `npc:runner:present` / `npc:bowman:present`
   FAIL.** Both posts pass `ground` and `facing`; the failure is
   "NO character in the scene graph", and the cast comes from the game
   layer. This district leaves the ground.

3. **`GATE-check-nav.txt`: the arena-centre and flow rows FAIL for BOTH
   gates.** They name `the-market` and `the-keep` centres — marketlow's and
   keephill's, being built in parallel; 99–100 % of their open cells are
   reachable. Every southgate row passes: `ring:south-gate:open`,
   `ring:south-gate:approach`, `waypoints:southgate`, `post:runner`,
   `post:bowman`.

4. **`GATE-check-siege.txt`: `walk:south-gate deck — (0, 50) at y 10`.**
   That gate BUILDS ITS OWN PERIMETER on top of the town's
   (`curtainWall` / `gatehouse` / `stairTurret` again, from the kit), so
   once a district has really built its gate the harness stacks a second
   gatehouse on the first one's deck platform: `place` seats it at
   `groundAt(0, 50)` = 5.0 and its deck lands at 10.0 — which is the height
   the failure prints. With southgate stubbed the same gate fails only at
   the east gate. It is a harness limitation, not a defect in the town: the
   passage's own rows pass (`passage:south-gate:through`,
   `passage:south-gate:width 5.05 m`), and so do `check-game`'s
   `gate:south-gate:passage-open` and check-city's fill.

5. **`GATE-check-siege.txt`: `surrounds:under-wall — 4 of 188 blocked`.**
   The two mural drums flanking the gate project into the ditch, so the
   1.4 m strip at the wall's foot is closed where they stand. That is what
   a mural tower does, and the alternatives were measured: inside the wall
   the west drum stands on the terrain's stair, and set back into the
   square it fills the bowman's gallery. Coordinator's call if the strip
   must be continuous — the drums would then have to go.
