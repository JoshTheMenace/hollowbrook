# KIT-GAPS.md — what the forked kit lacks for a siege FPS

`src/kit/` is Thistledown's kit, forked verbatim (buildings, roofs, props,
trees, signkit, mats, surface, util) with `src/palette.js` re-toned for dusk
and every key preserved. It builds a fair; it does not build a siege. The
kit-extension agent adds the generators below to `src/kit/siege.js` (+
`signkit.js` tenants, `mats.js` materials), re-exports them from
`src/kit/index.js`, runs the showcase (`src/kit/_showcase.js` extended with
one of each), the spatial audit and the camera gate over it, and hands the
kit to the six district agents. **Districts import from the kit only; the
kit is append-only once districts start.**

Read `src/kit/README.md` first — its six rules and its trap list apply to
everything here. Two of them bite a siege kit hardest: *depth is built
outward* (a slit is a frame standing proud of the wall, not a groove) and
*every collider is inflated by 0.34 m on every side* (a barricade across a
3.2 m lane seals it; a barricade is two ends with a 1.8 m gap or it is a wall).

## Generators (in priority order)

1. **`curtainWall({ from, to, side, ctx })`** — the dressing of a terrain
   wall-walk shelf. The terrain already carries the walk (y 5.0, 2.4 m,
   scarps either side); this puts stone on both scarps (coursed granite,
   string course, weep holes, a batter at the foot), a **parapet with
   merlons** on the outer edge (`parapet_h` 1.15) and a low kerb on the
   inner, corbels, the odd hoarding. Registers **parapet colliders with
   `bottom`** (`ctx.collide(x0, z0, x1, z1, top, bottom)`) so the walk is
   fenced and the street 5 m below is not walled off. Reads
   `plan.siege` for the numbers. Must end every run in a pier or a tower
   (a wall that stops in mid-air is a grey card). No collider on the
   scarp faces themselves — the terrain's cliff is already unwalkable.
2. **`gatehouse({ gate, ctx })`** — spans a terrain gate gap: passage with
   a real vault (coursed, intrados stopping at the arch, per Thistledown's
   gateward), two round towers with door platforms onto the walk, a walk
   PLATFORM at 5.0 over the chamber that **overlaps the shelf either side
   by 0.3 m** (platforms overlap, never meet), merlons, the raised
   portcullis (the drop mechanic is gap 9), gate leaves swung back,
   `userData.passage` for the game. Passage clear width ≥ 5.0 m.
3. **`stairTurret({ landing, ctx })`** — dresses a 3 × 3 stair-head landing
   as a square turret base: stone faces on its three free scarps, a door
   frame onto the walk, a cheek wall along the flight (the flight itself is
   terrain). No collider on the landing top.
4. **`barricade({ w, seed, kind, ctx })`** — the raisable street barricade:
   `down` (a heap of carts/doors/barrels to one side, walkable) and `up`
   (across the lane, collider registered) states, `userData.raise()` /
   `lower()`, `userData.state`. Kinds: carts, doors, stakes. The `up`
   collider must leave the declared 1.8 m gap at one end so the lane is
   never sealed for the player.
5. **Practicals that switch** — `brazier({ lit })` exists; add
   `userData.setLit(bool)` to brazier, `wallTorch`, `beaconCage` (a
   crest-of-the-keep iron cage on a pole) and `lantern` so the relight beat
   and the daynight rig can drive them. Every one has its own ground pool
   (`withPools`) and `userData.practical`.
6. **`arrowSlit`** — a `windowOn` variant: a tall narrow reveal with a
   splayed frame standing proud, no glass, unlit or lit by a torch behind.
   For towers, the gatehouse and the keep.
7. **`siegeProps`** — breach rubble (a heap tagged `prop`, collider),
   dropped ladder against a wall, felled cart, arrow bundles, a mantlet
   (leaning, collider), spear rack, gabions, a stretcher, a chain across a
   lane, oil pots on a parapet. All seeded, all `userData.prop`.
8. **`campFire` + `tent`** — the Company's camp in the surrounds outside
   both gates (southgate owns the surrounds): lit fires with pools, low
   tents, a banner pole carrying `ACCENT.companyRust`. No colliders (they
   stand in the spawn rings and the rings must stay open).
9. **Portcullis mechanic** — *later*: a droppable portcullis with a collider
   toggle and a nav-grid dirty flag. Not before districts.
10. **`keepHall` / `bellTower`** — `longhouse` and `roundTower` cover both;
    the keep's tower needs a **bell** (`temple`'s `bellPivot` pattern) and
    a bracketed beacon platform. A `roundTower({ bell: true })` option is
    enough.
11. **Enemy-facing conventions** — every kit prop that is meant as COVER
    sets `userData.cover = true` and registers a collider ≥ 0.9 m tall;
    the game reads the collider list for its nav grid and this tag for
    the referee's "behind cover" test.

## Signage

`signkit.js`'s `TENANTS`, `NOTICES` and `DEVICES` tables are Thistledown's.
Append (never rename) the Hollowbrook tenants in `city-plan.json →
shared_kit.signage_tenants`, with devices: a bell, a portcullis, a sheaf, a
hammer-and-anvil, a plough-and-lantern, a mortar (the chandler), a mill.
**NO PEOPLE**, on anything, ever — the lost-dog notice is a drawn dog.

## Materials

`mats.js`: add `granite` variants for the curtain (`curtain`, `curtainDark`,
`coping`), `ironRust`, `canvasCompany` (companyRust), `emberDeep`. Reuse
the pool; never a hex literal in a district.

## Characters (not kit, but the same agent's problem list)

- `celify` keeps colour, not `map`: the KayKit raiders carry a palette
  atlas texture and would arrive monochrome. **Bake the atlas into vertex
  colours** (sample the texture at each vertex's UV, write `color`
  attribute, set `vertexColors`) before `celify`, so the cel bridge and its
  census see the effective colour. Do it in the game layer
  (`src/game/enemies.js`), not in charforge.
- KayKit instances need `SkeletonUtils.clone`; procedural rigs rebuild via
  `build()` per instance (charforge KIT.md).
- The Company's one accent: a rust sash/band added as a small unlit mesh
  on every raider (their identity marker, and the legibility gate's marker
  pixels for the Captain).

## Explicitly not needed

Siege engines (the Company has ladders, not trebuchets — the town is small
and the fiction is a raid), destructible walls, a moat, water.
