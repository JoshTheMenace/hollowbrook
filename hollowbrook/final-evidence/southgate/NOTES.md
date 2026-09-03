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
| `play-10-stable-yard` | the square → east | the stable, the rick, the carrier's cart, the barrels |
| `play-13-the-wardens-lodge` | the square → the lodge | the fascia, THE WATCH notice and the well — and the reason the lodge is east of the lane (below) |
| `play-14-relight-brazier-unlit` / `play-15-...-lit` | the wall-walk, west of the gate | the `o3-relight-wall` brazier at (−10, 50.4), before and after `setLit(true)` |
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

5. **`the-mill`'s visibility was 25.7 % and the cause was in THIS district.**
   millreach's arena is approached from `south-gate`, so
   `check-arena-visibility` rays every open cell of its rect at the gate's
   three approach points — and of the three, only (0, 40) is reachable
   from inside the town at all: (0, 58) is behind the curtain wall, and
   (0, 50) sits at **y 6.00** because that gate samples `groundAt(x, z)`
   with two arguments and the gatehouse deck is a platform. So the whole
   number turns on how much of this square stands between the mill and one
   point. Measured by hiding one group's MESHES at a time (hiding the
   GROUP does nothing — the gate filters on `hit.object.visible`, and a
   group's flag does not reach its children; the first isolation run
   reported every candidate as worth zero):

   | | cells | |
   |---|---|---|
   | baseline | 75/292 | 25.7 % |
   | minus the shooting stage | 80/292 | 27.4 % |
   | **minus the wardens' lodge** | **173/292** | **59.2 %** |
   | minus every other southgate mass | 75/292 | 25.7 % |
   | with (0, 50) at street level | 77/292 | 26.4 % |

   The lodge was 98 of the 100 cells. Nothing at x > 0 can block a ray
   from the mill (every source x ≤ −20) to (0, 40), so the lodge crossed
   the lane to (9.6, 35.4) and the muster ground became what its name
   says. `arena:the-mill:visibility` now reads **175/292 = 60 %**, and
   `arena:gate-square` is unchanged at 84 %.

6. **`GATE-check-siege.txt`: `surrounds:under-wall — 4 of 188 blocked`.**
   The two mural drums flanking the gate project into the ditch, so the
   1.4 m strip at the wall's foot is closed where they stand. That is what
   a mural tower does, and the alternatives were measured: inside the wall
   the west drum stands on the terrain's stair, and set back into the
   square it fills the bowman's gallery. Coordinator's call if the strip
   must be continuous — the drums would then have to go.


## The `o3-relight-wall` brazier (integration edit, verified here)

A later integration pass added a brazier to this district's file for the
plan's `o3-relight-wall` point at (−10, 50) — the game lights "braziers with
`setLit` within 3 m" of it (`src/game/INTERFACES.md`) and no district had put
one on this stretch of walk. Measured after the edit, not assumed:

- the point reads `groundAt(−10, 50, fromY 5) = 5.00` and **no collider
  covers it** — it stays standable, which is what the objective needs;
- the brazier stands 0.40 m from it, its `userData.setLit` is a function and
  `setLit(true)` renders (`play-14` / `play-15`);
- it is seated on the walk, not floating: bbox min y **4.99** against a walk
  surface of 5.00;
- it carries **no collider** on purpose. The walk's free band is 1.71 m and a
  boxed brazier would wall the one route round the town;
- `check-city --district southgate` **PASS** (368/400 meshes) and
  `check-spatial` reports **no southgate rows**.
