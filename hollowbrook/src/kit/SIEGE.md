# The siege kit — the wall, the gates, and the things a raid leaves

`src/kit/siege.js`. Read `README.md` first (its six rules and its trap list
apply to everything here); this file is the part that is new, and the part
that will bite you.

```js
import {
  SIEGE, curtainWall, gatehouse, stairTurret, barricade,
  wallTorch, beaconCage, lantern, arrowSlit, arrowSlitAt,
  siegeProps, placeCover, campFire, tent,
  colliderBlocks,                    // the collider contract, shared
} from '../kit/index.js';
```

---

## The one thing to understand before you write a line

**The wall is TERRAIN and this kit is its dressing.** `city-plan.json`'s
terrain already carries the whole perimeter — a 2.4 m shelf at y 5.0 between
48.8 and 51.2, gapped only at the two gates, a 5 m scarp on each side of it,
one stair per district up to it. It is walkable and gate-proven
(`check-terrain.mjs`) before a single stone stands. You put masonry on it.
You never lay ground, and you never move a promised height.

**A collider now carries `top` and `bottom`, and the perimeter depends on
both.** `ctx.collide(x0, z0, x1, z1, top, bottom)` — the last two are
optional and everything without them behaves exactly as it always did.

| | what it means | why the wall needs it |
|---|---|---|
| `bottom` | the collider's lower edge. A walker more than 1.9 m below it walks straight underneath. | A parapet 5 m up **fences the walk** and must not wall the street. Without it every run of curtain puts a 1.03 m band of dead ground along the foot of the wall, and the gatehouse's own parapet **seals the gate passage outright** — a 7 m opening with an invisible wall across it. |
| `top` | the collider's upper surface. A walker whose feet are at or above it (within one 0.38 m step) is **standing on it**, not walking into it. | A gatehouse's piers are solid stone from the road and are **walked over** at 5 m. Without it the wall-walk stops dead at both gatehouses and the flood fill reports the walk as two arcs. |

`colliderBlocks(c, x, z, feetY, radius)` in `src/builders.js` is the **one**
copy of that arithmetic. The player (`src/player.js`) and the route fill
(`scripts/check-city.mjs`) both call it. A second copy is a second world that
one of the gates does not look at.

**And `ctx.groundAt(x, z, fromY)` takes a third argument now.** With it, a
platform more than 0.55 m above your feet is one you are *underneath*.
That is the only way two walkable levels can share a footprint, and
Hollowbrook has exactly one place that needs it: the gate passage, with the
walk crossing 5 m over it. **Omit it** and you get the old max-over-
everything answer, which is what seating a prop on the ground wants —
every builder in this kit still calls it with two arguments.

> **HANDOFF — `src/game/nav.js` still needs both.** Its `blocked()` is
> height-blind and its `buildNavGrid` calls `groundAt(x, z)` with two
> arguments, so on the nav grid the gatehouse deck is the ground over the
> passage and the piers are walls: **the enemies cannot come through either
> gate.** The fix is two lines — `import { colliderBlocks } from
> '../builders.js'` and pass the cell's own `y` to both — and it belongs to
> whoever owns `src/game/`. The kit-extension agent did not touch that file.

---

## The generators

### `curtainWall({ from, to, side, ctx, plan, ... })`

One call per run of wall-walk shelf. `from`/`to` are positions **along** the
wall (an x for the north and south runs, a z for east and west); `side` is
`'s' | 'n' | 'e' | 'w'`.

```js
curtainWall({ from: -18, to: -3.5, side: 's', ctx, plan, endCaps: ['none', 'none'] });
```

Gives you: a battered, coursed facing on **both** scarps seated on their own
ground per 3 m segment, a plinth, a string course, corbels, weepers, a
parapet with real merlons and embrasures and coping, a 0.34 m inner kerb,
the odd timber hoarding, and an end pier at each end.

Registers: **the parapet's colliders and nothing else**, one per 12 m, each
with `bottom = walkY`.

- `endCaps: ['pier'|'tower'|'none', ...]` — a wall that stops in mid-air is
  a grey card. Pass `'none'` **only** where a corner tower, a gatehouse or
  the next district's run continues it.
- **No collider on a scarp face.** The terrain's cliff is already
  unwalkable; a second wall there is 0.68 m of dead walk.
- **The inner edge of the walk is deliberately unfenced.** That is the
  walk's way *down* — a 5 m drop into the street — which is what
  `_COMMON.md` asks every piece of high ground for. The kerb is 0.34 m and
  carries no collider. If your district wants the walk sealed on the inside,
  that is your decision to make and to say out loud.
- `userData.walkBand` is the free band across the walk once the parapet's
  collider is inflated: **1.71 m**.

### `gatehouse({ gate, ctx, plan, id })`

Spans a terrain gate gap. Pass the plan's `siege.gates[id]` entry — the
orientation is derived from it, so there is no per-gate arithmetic to get
backwards. It places itself.

Gives you: two coursed piers, a **segmental** vault whose courses stop at the
intrados, an arch ring and imposts on both faces, machicolation, the deck
slab, parapets on all four deck edges (the walk's two ends left open), the
raised portcullis in its chases, the gate leaves swung back, arrow slits, two
flanking turrets on the **town** side, and two wall torches.

Registers: the two pier colliders (`top = 5.0`), the deck platform, the
parapet colliders (`bottom = 5.0`), the turret footprints.

- **Passage clear 5.70 m, walkable 5.02 m** after the player's radius.
- `userData.passage` is the world rect plus `inward` / `outward` points and
  the walkable width — the game layer's handle on the gate.
- `userData.portcullis` is a live group. Dropping it is KIT-GAPS item 9 and
  is explicitly later; the handle is here for it.
- `userData.practicals` are the two wall torches, unlit. Light them from
  your relight beat.
- **Footprint: 12.9 m along the wall by 7.2 m across it** (the turrets
  project 2.6 m into the town past the passage rect). Leave that clear.
- **The arch is segmental and that is forced, not stylistic.** The opening
  is 5.70 m and the wall head is 5.00: a semicircular arch over that span
  crowns 2.85 m above its springing, so the springing would have to sit at
  1.75 m — head height at the jambs, i.e. a gate you cannot ride through.
  Springing 3.10, rise 1.35, crown 4.45, and 0.43 m of spandrel under the
  deck. Change the opening and those move.

### `stairTurret({ landing, flight, ctx, plan })`

Dresses a 3 × 3 stair-head landing. `landing` is the plan's shelf rect;
`flight` is the plan's crossing entry (optional — it is what draws the cheek
wall). The side that abuts the walk is **derived** from the landing's own
coordinates, because a landing exists on all four sides of this town.

Gives you: coursed facing on the three free scarps, a plinth and a capping
course, a low parapet on those three edges (`bottom` again), a real doorway
onto the walk with jambs, a lintel and voussoirs, and a stepped cheek wall
along the flight.

- **No collider on the landing top** — it is the stair's head.
- The doorway's clear opening is `doorClear`, default **1.9 m** geometric
  (1.22 m walkable). The flight's own edge is left open.
- The cheek wall stands 0.32 m clear of the tread edge so the flight keeps
  1.42 m of walkable width and the route gate can still climb it.

### `barricade({ w, seed, kind, at, yaw, ctx, gap, gapAt, state })`

Two states, both built and one hidden. `kind` is `'carts' | 'doors' |
'stakes'`. `userData.raise()` / `lower()` / `state`; raising registers the
collider, lowering splices it out, and both call `ctx.navDirty?.()`.

**The gap is not decoration.** Every collider is inflated by the player's
0.34 m radius on every side, so a barricade laid clean across a 3.2 m lane
seals it — for the player, for the fleeing NPCs and for the enemies whose
whole route it is. The declared `gap` is the **clear, face-to-face** number
and the generator throws under 1.8 m. At 1.8 a body gets 1.46 m.

Tagged `userData.cover` at 1.35 m.

### Practicals that switch

`brazier` (in `props.js`), `wallTorch`, `beaconCage`, `lantern` and
`campFire` all carry `userData.practical = true` and `userData.setLit(bool)`.
Flames and pools are **built whatever `lit` says** and merely hidden — a
`setLit(true)` on a prop whose flame was never built is a silent no-op, and
the relight beat is a scripted moment in this game.

- `wallTorch` — origin **on the wall face**, projecting +Z, `airborne`, the
  signkit's mounting convention. Pass `groundDrop` (negative) for its pool.
- `beaconCage` — the crest-of-the-keep iron cage. Sized to read at 60 m, not
  at three.
- `lantern` — `post: true` for the town's lamp post, `false` for one set
  down on a sill or a parapet.
- `campFire` — **no collider, ever.** Same for `tent`. They stand in the
  enemies' spawn rings and `check-nav.mjs` asserts those rings are open
  ground; a prop that seals a ring is a wave that never arrives.

### `arrowSlit(P, {...})` / `arrowSlitAt(P, {...})`

A `windowOn` variant with no glass. `arrowSlit` takes `face` / `half` /
`centre` / `u` like every other opening in this kit; `arrowSlitAt` takes a
point on the surface and the bearing of its outward normal, for a tower
shaft or any surface that is not one of a body's four faces.

The surround is `M.coping` — **paler than the wall** — and the void is
`M.ironDark`. `lit: true` swaps the void for a warm card: a torch behind it.

### `siegeProps` and `placeCover`

`breachRubble`, `siegeLadder`, `felledCart`, `arrowBundle`, `mantlet`,
`spearRack`, `gabion`, `stretcher`, `chainAcross`, `oilPots`, plus
`campFire` and `tent`.

**`placeCover(ctx, prop, { x, z, yaw })` is the only sanctioned way to put
down a cover prop.** It seats it, rotates it, registers the rotated
footprint, and **throws** if the prop claims `userData.cover` and is under
0.9 m. The game's referee reads that tag for its "behind cover" test and the
enemies read the collider list; a 0.6 m barrel tagged as cover is a promise
the player cannot cash.

Cover props and their heights: `breachRubble` 1.15, `felledCart` 1.4,
`mantlet` 1.5, `gabion` 1.05, `barricade` 1.35.

`chainAcross` carries **no** collider on purpose: it is a sign that says
"not this way", and a waist-high chain that stops a body is a fence nobody
drew.

### `roundTower({ bell, beacon })`

`bell` (a colour, or `true` for brass) hangs a real bell on a real axle in an
open belfry on the tower head — it wants `cap: 'none'`. `userData.bellPivot`
is a live group; swing it from your interaction, exactly as `temple` is
swung. `beacon` (true, or a bearing in radians) throws a bracketed platform
out of the shaft; `userData.beaconAt` is where to stand a `beaconCage`.

---

## Budgets (measured)

| generator | meshes | triangles | colliders |
|---|---|---|---|
| `curtainWall` 18.5 m run | 7 | 1 956 | 2 |
| `curtainWall` 33 m run | 7 | 3 328 | 3 |
| **`gatehouse`** | **44** | 8 396 | 10 |
| `stairTurret` | 4 | 1 056 | 5 |
| `barricade` carts / doors / stakes | 5 / 8 / 6 | ~600–1 000 | 0 (1 when up) |
| `roundTower({ bell, beacon })` | 10 | 1 364 | 1 |
| `campFire` lit | 11 | 510 | 0 |
| `beaconCage` lit | 7 | 1 038 | 0 |
| `wallTorch` / `lantern` lit | 7 / 6 | 260 / 186 | 0 |
| `tent` | 4 | 310 | 0 |
| `breachRubble` / `felledCart` / `mantlet` / `gabion` | 4 / 2 / 3 / 3 | 216–634 | 1 each |
| `siegeLadder` / `spearRack` / `arrowBundle` / `stretcher` / `oilPots` / `chainAcross` | 2–4 | 112–676 | 0 |

**Two of these are expensive and you should plan for them.** A `gatehouse`
is 44 meshes — a tenth of a district's whole allowance — because it carries
two `roundTower`s, two gate leaves and a portcullis of its own. And
`campFire` is 11: four of them is a `longhouse`.

The whole perimeter dressed — eleven curtain runs, two gatehouses, five
stair turrets and four corner towers — is **88 colliders, 6 platforms and
about 100 meshes** over the terrain.

---

## Corner towers

The plan gives four (`siege.corner_towers`), one per district, at
`(±50, ±50)`. **A drum centred on the corner is a collider across the only
place the walk turns.** The geometry that works, and the one
`check-siege.mjs` stands up, is a tower pushed out along the diagonal:

```js
roundTower({ seed: 'corner-sw', r: 1.9, h: 8.6, cap: 'cone', machicolation: true })
// placed at (±52.6, ±52.6)
```

At that centre it touches the outer corner, reads as a tower **on** the
corner from every angle, and leaves 1.40 m of walk behind it.

---

## Signage

`TENANTS`, `NOTICES` and `DEVICES` are **append-only** — every `device:`,
`tenant:` and `notice:` in the town is a key into them and every `variant:`
is an index, so renaming one silently re-letters a sign somewhere else.
Thistledown's eight tenants are kept because the forked kit's defaults and
its showcase name them by key; nothing in Hollowbrook uses them.

New tenants (each owned by a district): `reeveHall`, `chandlers` (marketlow),
`stanhope`, `ploughLantern` (wardrow), `hollowbrookMill`, `tannery`
(millreach), `stWenna` (chapelclose), `wardensHollowbrook` (southgate).

New notices: `muster`, `rota`, `lostdog`, `gatetoll`, `bells`,
`flourprices`.

New devices: `ploughAndLantern`, `dog`.

**NO PEOPLE, EVER**, and that is why the lost notice is a lost **dog**,
drawn. What separates it from the `cat` two entries above it at forty pixels
is the silhouette: a dog is long in the muzzle, deep in the chest, straight
in the tail and level in the back. Round the head and you have redrawn the
familiar.

---

## Seeing it

`src/kit/_showcase.js` has RANK G (a mock wall-walk shelf at the plan's own
numbers, with a gate gap in it) and RANK H (the props, the practicals, the
barricades, the camp). The shelf is at the real numbers on purpose: all
three wall generators dress ground somebody else made, and a showcase that
stood them on a flat slab would exercise code the town never runs.

```sh
HOLLOWBROOK_SHOWCASE=1 node scripts/check-spatial.mjs   # floating / buried / holes
HOLLOWBROOK_SHOWCASE=1 node scripts/check-cameras.mjs   # 44 review cameras
node scripts/check-siege.mjs                            # the perimeter, in the REAL terrain
```

and in the page, `http://127.0.0.1:5220/?showcase`, then
`await __shot('name', 1280, 720, { review: 'gateOut' })`.

**`check-siege.mjs` is the one that matters.** The showcase proves each
generator is not floating, buried or overlapping; it cannot prove the only
thing that is actually true or false about a curtain wall, which is that the
walk is **one ring**. That gate stands the whole perimeter up in the real
terrain and flood-fills the walk with a 4.5 m floor, so the fill cannot
cheat by dropping into the street, walking round and coming back up a stair.
It reads 5 986 cells and reaches all four corners, both gate decks and all
five stair-head landings from one seed.
