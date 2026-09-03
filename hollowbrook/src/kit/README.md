# The Thistledown kit — how to use it

Everything a district builds with comes from here:

```js
import {
  M, painted, glowing, PAL, ACCENT, JOINERY,   // materials & palette
  place, rng, seatOnGround, parts, bx, cyl,    // plumbing
  cottage, longhouse, roundTower, temple, windmill, tradeFront,
  thatchRoof, shingleRoof, hipRoof, coneCap,
  bigTree, treeStand, smallTree, hedgeRun,
  villageProps, marketStall, lanternString, interactive,
  signKit,
  // the siege kit — read SIEGE.md in this folder before your first wall
  SIEGE, curtainWall, gatehouse, stairTurret, barricade,
  wallTorch, beaconCage, lantern, arrowSlit, arrowSlitAt,
  siegeProps, placeCover, campFire, tent, colliderBlocks,
} from '../kit/index.js';
```

**The perimeter, the gates and everything a raid leaves behind are in
`SIEGE.md`**, next to this file. Two things in it are not optional and are
not obvious: a collider now carries `top` and `bottom` (a parapet 5 m up
fences the walk and must not wall the street; a gatehouse pier is solid from
the road and is walked over), and `ctx.groundAt(x, z, fromY)` takes a third
argument, which is the only reason a gate passage and the wall-walk over it
can both exist.

**The kit is append-only during district builds.** If you need a generator that
is not here, ask the coordinator — do not write your own building generator.
Two districts inventing their own bakery is how a town stops being one place.
Variation lives in seeds and parameters; identity lives in the kit.

---

## The six rules

**1. Every generator takes a seed and uses it.** Same seed, same building. Name
your seeds after the thing (`'green-inn'`, `'row-cottage-3'`), not after a
counter — then adding a cottage in the middle of a row does not reshuffle the
rest of it.

**2. Buildings are authored facing +Z with the origin on the ground at the
centre of the footprint.** You never rotate one by hand: `place(ctx, group,
{ x, z, yaw })` seats it on the ground **by query**, rotates it, and registers
its footprint collider and any platforms it declared. Use yaw in multiples of
`PI/2` — the registered collider is the rotated AABB, exact only there, and
`place` warns if you don't.

**3. Read the joints off `userData`; never re-derive them.** Every building
returns at least:

```
{ kind, w, d, wallTopY, eaveY, ridgeY, frontZ, doorX, doorY, footprint }
```

`eaveY` and `ridgeY` are **absolute** heights above the group's origin. A
bracket lantern under the eaves is `h.userData.eaveY - 0.7`, and a fascia goes
at `z = ±h.userData.frontZ` in world space after the yaw. Adding a wall height
to a remembered roof rise is how a bracket ends up inside a roof.

**4. Props go on the ground by query.**

```js
const p = villageProps.beehive({ seed: 'mill-skep-2' });
p.position.set(x, 0, z);
seatOnGround(p, ctx.groundAt);
ctx.add(p, 'skep');
```

They are all tagged `userData.prop = true`, so the spatial audit counts them as
units. Anything **long** — a fence, a hedge, a washing line — takes a polyline
of world points and steps with the ground under it. Hand it `ctx.groundAt`;
never a length and a level.

**5. Your accent is a parameter you pass in, and nothing in the kit defaults to
one.** See the table below. If a generator has a colour that could be an accent
— a door leaf, a cart's paint, a lantern's paper, a bell, a banner's field — it
takes a parameter with a **muted** default from `JOINERY`. Passing another
district's accent is the one thing this kit cannot stop you doing.

**6. Anything wall-mounted sets `userData.airborne = true` and every prop group
sets `userData.prop = true`.** Both are already set by everything here. If you
hang something of your own on a wall, set `airborne`, or the audit reads a unit
floating three metres up.

---

## The API

### Buildings — `buildings.js`

```js
cottage({ seed, w = 5.6, d = 4.8, storeys = 1.5|2, groundH, upperH,
          wall = 'limewash'|'granite'|'render'|'oak', wallColor,
          roof = 'thatch'|'shingle', pitch, ridgeAxis = 'x'|'z',
          crook = 0..1.6,          // 0 straight, 1 village, 1.6 alarming
          jetty,                   // upper-storey overhang on the front
          door,                    // YOUR ACCENT GOES HERE (JOINERY.oakStain)
          shutter, shutters = 'mixed'|'open'|'closed'|'none',
          trade = false | { lit }, tradeAccent,
          chimney = true, dormers, litWindows = 0, plinth = true,
          frame = true, windowBoxes, thatchWobble })
  -> Group  userData { kind, w, d, storeys, jetty, wallTopY, upperY, eaveY,
                       ridgeY, frontZ, upperFrontZ, doorX, doorY, sillY,
                       chimneyTop, lean, trade, footprint }

longhouse({ seed, w = 12, d = 7, groundH, upperH, wall, roof, pitch,
            crook = 0.55, gallery = true, bay = true, jetty = 0.26,
            door, shutter, chimney = true, litWindows = 3, dormers, accent })
  -> Group  userData { ..., gallery, arcade, arcadeZ, galleryY, chimneyTop,
                       colliders, platforms }
  // NOTE: NO `footprint`. The arcade is WALKABLE, so it registers a collider
  // per POST and one for the body. Do not add a box round it.

roundTower({ seed, r = 1.8, h = 9, taper = 0.14, crook = 1, seg = 12,
             wall = 'granite'|'render', wallColor, cap = 'cone'|'crooked'|'none',
             capH, bands = 2, windows = [{ y, a, w, h, lit, glow }],
             door = { a, w, h } | null, doorColor, finial, corbel,
             machicolation, capMat, glowColor })
  -> Group  userData { kind, r, h, rTop, lean, topY, capTop, topCentre,
                       doorAt, footprint }
  // `a` is a bearing in radians from +Z (the authored front).
  // `glowColor` IS SPELLWARD'S AND NOBODY ELSE'S — see the accent table.

temple({ seed, w = 7, d = 5.6, h = 4.0, wall, roof, pitch = 0.66,
         porch = true, porchD = 2.0, bellcote = true, spire = false,
         niches = 3, bell, door, litNiches = true, ridgeAxis = 'z' })
  -> Group  userData { ..., platY, bodyZ, frontZ, porchRoofY,
                       bellPivot, bellY, votives, ropeAt, colliders, platforms }
  // `bellPivot` is a LIVE group: swing it from your interaction.
  // Its three entrance steps are registered platforms.

windmill({ seed, r = 3.0, h = 8.6, taper = 0.26, seg = 14, crook = 0.3,
           wall, capH = 2.1, sailLen = 6.4, sails = 4, speed = 0.15,
           gallery = true, galleryT = 0.44, tailpole = true, windDir = -0.5,
           cloth, door, ctx, litWindows = 1 })
  -> Group  userData { ..., topY, capH, galleryY, sailLen, sailGroup, cap,
                       spin, speed, hubAt, doorAt, footprint }
  // PASS `ctx` and it registers its own updater; the sails turn at
  // `speed` rad/s about the true windshaft axis. Without a ctx, step it by
  // hand with `userData.spin(dt)` — nothing animates in a headless page.

tradeFront({ seed, w = 3.2, h = 2.3, doorSide = 'right'|'left', accent,
             fasciaH, counter = true, lit = false, goods = true, doorColor })
  -> Group  userData { ..., fasciaY, fasciaZ, doorX, winX, winY, sillY,
                       prop, airborne }
  // ORIGIN ON THE WALL FACE, projecting +Z. Bolt one onto any wall.

windowOn(P, { face:'z+'|'z-'|'x+'|'x-', half, centre, u, y, w, h, cols, rows,
              shutters, shutterColor, lit, sill, frameMat, glassMat,
              dressing, mullion, boxed })
doorOn(P, { face, half, centre, u, w, h, y0, color, planks, hinges, step,
            hood, arch, latch })
frameElevation(P, { face, half, centre, w, u, y0, h, seed, studs, braces,
                    midRail, proud, t, skip, gaps })
facePlane(face, half, centre = 0) -> number      // the signed wall plane
  // `half` IS THE OUTWARD HALF-EXTENT AND IS ALWAYS POSITIVE — the same
  // number for a face and its opposite. `centre` is the body's own centre on
  // that axis (0 unless the mass is set back, like the longhouse's hall
  // behind its arcade). The sign comes from the face's outward normal, in
  // `facePlane`, and nowhere else. `half + 0.001` to stand a layer 1 mm
  // proud; `centre + 0.001` would push a '-' face 1 mm INTO the wall.
  // Not `faceCoord` any more — see the errata.
  // for punching openings in and framing your OWN masses; `P` is a `parts()`
```

### Roofs — `roofs.js` (and the architecture kit, re-exported)

```js
thatchRoof({ w, d, pitch, overhang, endOver, thick, soffit, ridgeAxis, seed,
             wobble, dormers: [{ side, u, t, w, h, lit }], ridge,
             mat, ridgeMat, sparMat, deepMat, glassMat, stations,
             pool, xf })                                    // THE roof here
shingleRoof({ w, d, pitch, overhang, thickness, ridgeAxis, courses, spacing,
              mat, ridgeMat, trimMat })
hipRoof({ w, d, pitch, overhang, thickness, capW, mat, ridgeMat })
coneCap({ r, h, y0, lean, seg, flare, skirt, courses })  // loose geometry
gableRoof(...)  shedRoof(...)
gableFill({ span, along, ridgeY, inset }, ridgeAxis)     // loose geometry
chimney({ x, z, baseY, topY, w, d, batter, pots, potR })  // -> { stack, pots }
THATCH_PITCH   // { min: 0.80, max: 0.96 } rad — 46 to 55 degrees
SHINGLE_PITCH  // { min: 0.52, max: 0.70 } rad — 30 to 40 degrees
```

All of them put their **origin at the wall-top centre** and hand back
`userData.ridgeY / eaveY`. Never hand-place a roof plane.

**Pitch is the skyline.** Thatch is STEEP — it sheds water by pitch alone, and
a shallow thatch reads as a hayrick. Stay inside `THATCH_PITCH`.

`thatchRoof` takes `pool` (a `parts()` collector) and `xf` (a Matrix4): hand it
your building's own pool and its storey frame and the roof merges into your
material pool instead of adding four meshes of its own. `cottage` and
`longhouse` do exactly that.

### Trees — `trees.js`

```js
bigTree({ seed, h = 11, spread = 10.5, trunkR, density = 11, limbCount,
          tones, lean, roots = true, swing = false, hollow = false })
treeStand({ seed, kind: 'orchard'|'yew'|'hedgerow'|'birch'|'oak',
            spots: [[x, z, scale?]], groundAt, tones, scale, jitter, density })
smallTree({ seed, kind, scale, tones })
hedgeRun({ points, h = 1.35, w = 0.85, seed, groundAt, gappy, mat })
```

`treeStand`'s spots are in **world coordinates** and it seats each tree by
query — hand it `ctx.groundAt`. It is the right primitive for anything more
than three trees: three separate trees are nine meshes, a stand of three is
three. It emits one pooled set **per half-metre band of ground it covers**, so
keep a stand on one slope or call it twice.

### Props, lights and the fair — `props.js`

```js
lanternString({ from, to, count, sag, lit, colors, seed, drop, size,
                groundAt, pools })        // -> userData.setLit(bool)
lightPool({ r, y, ember, opacity })       bracketLantern({ seed, reach, lit, glow, groundDrop })
postLantern({ seed, h, lit, glow, arm })  torch({ seed, h, lit, post })
brazier({ seed, r, h, lit, ctx })         wellHead({ seed, r, h, roof, bucket, roofColor })
cart({ seed, L, W, wheelR, paint, load: 'flour'|'hay'|'crates'|'barrels'|'empty', shafts, sackColor })
hayBale({ seed, r, square })              hayRick({ seed, r, h })
barrel({ seed, h, r, tipped, open, endColor })   barrelStack({ seed, rows, endColor })
crate({ seed, w, d, h, open, goods })     crateStack({ seed, n, spill, goods })
sackStack({ seed, n, color })             logPile({ seed, w, h, d, roof })
chickenCoop({ seed, w, d, h, run, roofColor })   beehive({ seed, r, h, stand })
shrineStone({ seed, h, w, flame, capColor })
fenceRun({ points, kind: 'post-rail'|'paling'|'hurdle'|'palisade',
           h, seed, groundAt, ctx, postEvery, mat, collide, gateAt })
bannerPole({ seed, h, field, band, bw, bh, device, deviceInk, folds, base })
ladder({ seed, len, w, standoff })        washingLine({ from, to, sag, seed, colors, n })
marketStall({ seed, w, d, h, tones, back, goods: 'produce'|'bread'|'lanterns'|'crocks', trestle, sag, valance })
trough / mountingBlock / waymarker / kitchenGarden
hitbox({ w, h, d, at, name })             interactive(ctx, { name, label, at, size, action })
```

**`lanternString` is the fair.** Two anchor points in world space, real
catenary sag, lanterns hanging plumb off wherever the cord happens to be.
`lit: false` is the town's default state this evening; `lit: true` swaps the
paper for warm emissive glass and drops ONE merged light-pool decal under the
whole run. `userData.setLit(true)` flips a built string, which is what an
interaction that lights one does.

**Your district's one interaction is two lines:**

```js
const s = lanternString({ from: [-6, 5.4, 2], to: [2, 4.2, -3], count: 9,
  colors: [ACCENT.lanternRed, ACCENT.lanternGold], groundAt: ctx.groundAt });
ctx.add(s, 'test-string');
interactive(ctx, {
  name: 'test-string', label: 'Light the test string',
  at: [-2, ctx.groundAt(-2, 0) + 2.2, 0], size: [1.6, 2.2, 1.6],
  action: () => s.userData.setLit(true),
});
```

`hitbox` makes an invisible, named, raycastable box: out of the render, out of
the spatial audit, in the interaction raycast. `ctx.interact` throws without
one. **Every district owes at least one interaction.**

### Signage — `signkit.js`

The measured cheapest specificity lever there is. **You never pass pixels; you
pass metres**, and the canvas is generated at the face's own aspect, so a sign
cannot be crushed.

```js
signKit.TENANTS   // moonmare, holloway, tansy, pestle, scrivener,
                  // emberwright, mill, wardens
signKit.NOTICES   // fair, programme, familiar, flour, belltimes, wardens, toll
signKit.DEVICES   // moonAndMare, mortarAndPestle, hammerAndAnvil, quillAndBook,
                  // millSails, portcullis, sheaf, loaf, bell, lantern, cat

fasciaBoard({ tenant|title, sub, device, w, h, bg, ink, depth, seed, corbels })
hangingSign({ tenant|title, sub, device, w, h, bg, ink, standoff, seed, ctx, sway })
wallNotice({ notice|head+lines, device, hand, w, h, seed, tilt })
chalkedBoard({ head, lines, w, h, seed, frame, bg })
noticeBoardStand({ notices: ['fair','programme'], w, h, postH, seed, accent })
fingerpost({ arms: [{ text, sub, dir }], postH, w, h, seed, bg, ink, cap })
platePost({ tenant|title, sub, device, w, h, postH, double, accent, bg, ink, seed })
paintedName({ title, w, h, ink, bg, seed })    // painted onto limewash
devicePlate({ device, w, h, bg, ink, seed, double, border })
printedPlane(map, w, h)                        // raw, faces +z
```

**Mounting convention:** every wall-mounted sign has its origin **on the wall
face** and projects +Z, and carries `userData.airborne = true` — set here, once,
for all six of you. Free-standing ones (`platePost`, `fingerpost`,
`noticeBoardStand`) have their origin on the ground and seat with
`seatOnGround`.

`printedPlane` faces **+z**. A sign put on the far side of a wall is simply not
there and the frame comes back as a blank elevation.

**Tenants are owned by districts** (`TENANTS[key].district`). Do not use another
district's tenant. Need a new business? Ask the coordinator.

**NO PEOPLE, EVER** — not in a device, not in a silhouette, not on a notice.
The mare is a horse, the lost familiar is a cat, the wardens' charge is a
portcullis. That is a hard constraint, not an omission.

### Materials & palette — `mats.js`, `../palette.js`

`M` is the shared pool — one material object per role, so the renderer batches
across districts. Never construct a `MeshToonMaterial`; never write a hex
literal in a district.

```
ground paving pavingDark turf earth gravel moss straw
limewash limewashHoney limewashPale limewashRose plaster daub render
granite graniteWarm graniteDark rubble
oak oakDark oakSilver timberFrame timberDark bark barkDark
thatch thatchWorn thatchRidge thatchDeep shingle shingleMoss shingleDark lead slate
leafLight leaf leafDeep leafYew leafOrchard hedge
iron ironDark brass copper glass glassDark canvas canvasWorn rope hessian wicker
paper lanternPaper lit ember glowTeal
```

`painted(color)` for a one-off paint colour; `glowing(color, emissive, i)` for a
lit thing that still has shading (a paper lantern, a votive niche);
`litGlass()` for a window with a lamp behind it; `wallMaterial(kind, r)`,
`panelMaterial(r)`, `thatchMaterial(r)` and `shingleMaterial(r)` pick a seeded
tone so a row is not one extrusion of one building.

**The pool is born textured.** `surface.js` attaches micro-texture multiply maps
to the pooled material objects — limewash mottle and brush drag, thatch
combing, shingle courses and moss, oak grain, granite joints and lichen, canvas
weave, the lit-glass treatment. Zero extra materials, zero extra draw calls. A
district never attaches a map.

**ONE saturated accent per district, and each is OWNED:**

| district | accent | what wears it |
|---|---|---|
| green | `ACCENT.lanternRed` (+ `lanternGold`) | the fair-lantern paper, and nothing else |
| lowrow | `ACCENT.hedgeGreen` | the painted door family |
| millward | `ACCENT.milledOchre` | the flour sacks and the mill cart's paint |
| spellward | `ACCENT.alchemicalTeal` | bottle glass, the cauldron, the tower's lamps |
| templeknoll | `ACCENT.gilt` | the bell, and the votive flames |
| gateward | `ACCENT.wardenMadder` | the heraldic banner pair |

`ACCENT.alchemicalTeal` is **the town's only cool accent and its only strong
emissive**, and it belongs to spellward. Magic here reads as restraint: it lands
because every other lit thing in Thistledown is candle-warm. Do not put teal
anywhere else, and do not give anything else a strong emissive.

`JOINERY` (`oakStain`, `mossPaint`, `doveGrey`, `bone`, `pitch`, `plumWash`,
`skyWash`, `barnRust`) is **muted** and is NOT an accent: doors, shutters,
gates, carts and boards may use it freely without spending your one saturated
colour.

---

## Budgets

Measured (`kit-budget.mjs` in the kit's scratch harness), so you can plan
against your **460–520 meshes**:

| generator | meshes | triangles |
|---|---|---|
| `cottage` 1.5 storey, thatch | 12 | 3 262 |
| `cottage` 2 storey, jettied | 13 | 4 050 |
| `cottage` + `trade` front | 21 | 4 138 |
| `cottage` 1.5, shingle on granite | 12 | 2 034 |
| `longhouse` 12×7 with gallery | 14 | 7 650 |
| `roundTower` 6 m gate tower | 11 | 1 732 |
| `roundTower` 14.5 m wizards' | 10 | 2 200 |
| `temple` 7×5.6 with bellcote | 20 | 2 162 |
| `windmill` r 3, h 8.6 | 19 | 3 760 |
| `tradeFront` alone | 7 | 272 |
| `bigTree` the great oak | 5 | 19 224 |
| `treeStand` orchard ×6 | 3 | 17 232 |
| `treeStand` yew ×3 | 3 | 18 552 |
| `smallTree` | 3 | 2 872 |
| `hedgeRun` 18 m | 2 | 1 760 |
| `fenceRun` 18 m (rail / paling / palisade) | 2 | 1 296 / 3 816 / 4 044 |
| `marketStall` | 7 | 802 |
| `lanternString` 8, lit / unlit | 5 / 3 | 1 616 |
| `wellHead` | 7 | 432 |
| `cart` laden | 4 | 1 480 |
| `logPile` | 4 | 3 328 |
| `barrelStack` (3 rows) | 4 | 1 656 |
| `noticeBoardStand` (4 sheets) / `bannerPole` / `fingerpost` | 11 / 8 / 8 | ~150–260 |
| `chickenCoop` / `kitchenGarden` / `torch` / `postLantern` | 5–6 | 170–900 |
| `hangingSign` / `wellHead` / `marketStall` | 3–7 | 50–800 |
| `beehive` / `brazier` / `crateStack` / `hayRick` / `washingLine` | 3–5 | 190–380 |
| `barrel` / `hayBale` / `ladder` / `sackStack` / `wallNotice` / `hedgeRun` | 2 | 14–1 760 |

Eight cottages is about 100 meshes; a longhouse is a cottage and a half.
**Trees are the triangle cost in this town, not the mesh cost** — an orchard of
twenty is 57 000 triangles, a third of a district's allowance, so pass
`density: 0.7` to a background stand.

Geometry is already pooled per material inside every generator. If you build
your own kerbs, pads or walls, use `parts()` from the kit and pool yours the
same way rather than emitting a mesh per slab.

---

## Traps this kit already avoids, and that your own geometry will not

- **You cannot carve a recess into a box.** Every building volume is a solid
  `BoxGeometry` or a lofted solid; a panel written *behind* the wall face is
  inside the render. Build depth **outward**: backing, then detail, then frame,
  each genuinely in front of the last.
- **Two coplanar sheets are a coin toss.** A material edit with *no* visual
  effect means the mesh is not being drawn — look for a coincident face before
  you look at the material.
- **`cel()` is single-sided.** A `PlaneGeometry` faces +z. Anything printed on
  a face that looks −z has to be turned to face out.
- **A collider is inflated by the player's radius on every side.** A 1.4 m
  notice board occupies 2.08 m of a 2.1 m alley. Boards go flat against walls,
  and a gate needs 1.8 m of clear face-to-face gap to be walkable.
- **A box along Z rotated by +t about X sends its +z end DOWN.** Derive every
  rake from its two joints; do not guess the sign.
- **A ring segment's length is its DEPTH, not its width.** `bx`'s `ry` maps
  local +x to `(cos ry, 0, −sin ry)`; at `ry = −a` that is the RADIAL direction,
  so a string course written `bx(step, h, t)` comes out as twelve spikes
  sticking out of the tower like a cartwheel. It is local **+z** that is the
  tangent. (This shipped in the first render of the wizards' tower.)
- **Anything long must be TESSELLATED along its length.** A 12 m rail authored
  with two vertices has nothing in the middle of it, and the audit's run check
  reads a base line through a unit's own vertices: it finds none between the
  panel ends, falls back to the run's global minimum, and reports a perfectly
  seated fence on a bank as buried by the whole rise. `bx(..., { seg })` does it.
- **A light pool must not be inside the prop's audit unit.** `Box3.setFromObject`
  takes every descendant, so a 3.8 m pool plane parented to a 0.4 m torch gives
  the torch a 3.8 m bounding box and the OVERLAP test flags it against every
  neighbour within two metres. Everything here uses `withPools`, which keeps the
  pool a sibling of the tagged body. If you make your own lit prop, do the same.
- **A canopy must never `receiveShadow`.** A cel ramp only shapes direct light,
  so a self-shadowed blob falls back to ambient and renders as an isolated black
  circle hanging in the sky. Every canopy here is `receiveShadow = false`.
- **An `InstancedMesh` is invisible to the spatial audit's geometry, and worse
  than invisible.** The audit reads triangles through `matrixWorld` and knows
  nothing about instance matrices, so a hundred instanced blobs register as ONE
  unit sphere at the group's origin — a phantom ball in the middle of the town.
  Every canopy here is MERGED, which costs the same draw calls.
- **A staircase needs a going of at least 0.36 m.** The route gate strides
  0.35 m, so a 0.3 m going puts two treads in one stride and measures twice the
  rise: a perfect flight reported unclimbable.
- **A panel seated on its own low ground is buried at its high end by the fall
  across it.** `fenceRun`, `hedgeRun` and `wallRun` all shorten their panels
  until that fall is under the audit's tolerance. If you lay your own run, do
  the same or expect a BURIED-RUN on every slope.

---

## Seeing what you built

`src/kit/_showcase.js` lays out one of every generator with a name plate by
each: the five building types at `z = 0`, yard gear at 16 and 20.5, working
gear and street furniture at 24.6, the runs at 27.5–35 **across a bank**, the
signage wall at 30, and the trees at `z = −14`. `SHOWCASE_CAMERAS` covers the
buildings, a LOW ANGLE UP AT THE THATCH EAVES, the ridge and its dormers, the
two towers, the mill mid-turn, the temple, the great oak from under it, both
prop ranks, the runs where they cross the bank, the lantern strings lit and
unlit, and the signage wall at three metres.

Point a scratch copy's `scene.js` at `buildShowcase` if you change anything in
the kit, and run `node scripts/check-spatial.mjs` against it. **The ground
slabs warn as UNEXPLAINED-MASS and that is correct and decided** — they are the
harness's stand-in for `core/terrain.js`, which the showcase does not run
because it is not a city. Everything else must come back clean.

## Post-gate errata (from the first district builds)

- `wallRun`'s `piers: N` now DIVIDES the run's length (fixed): no more twin
  piers 0.6 m apart at a run's tail.
- **`hayRick`'s thatch cap was an upside-down cone (fixed).** `cyl` takes
  `(radiusTOP, radiusBOTTOM, …)` and the cap passed `cyl(R * 1.02, 0.06, …)`,
  so the thatch came to a point where it met the stack and flared to the full
  2 m at the sky. A render does not say "your arguments are swapped" — it says
  **parasol**, and that is how millward reported it from three separate frames
  before anyone read the numbers. It survived two rounds of tuning the radius
  and a rope net added to break up the silhouette, because neither was the
  cause. If a prop reads as the wrong object and changing its size and its
  dressing does not help, check the sign and the argument order of its cone
  before dressing it again. Any district that shipped a frame with a rick in
  it before this fix wants a recapture.
- `shrineStone`: pass `flameColor`, never `capColor`, for a votive accent —
  a painted cap is a bucket.
- Trees: where props share ground with trees, use `tree({ at: [x,z], ... })`
  (one tagged unit per tree). A multi-spot `treeStand` box spans every spot
  and the OVERLAP test flags everything standing between them.
- `temple`'s plinth registers whole-plinth platform rects with a 0.21 m
  going — half the route gate's stride. If a walker must reach the porch,
  re-platform stepped rects in front of the doors yourself and collide the
  side ledges (see templeknoll's district file for the working pattern).
- **`faceFrame`'s '-' faces put every back and west dressing INSIDE the
  opposite wall, and doubled the front and east ones (fixed).** The helper
  took `faceCoord`, the *signed* coordinate of the wall plane, and computed
  `faceCoord - pz` on a '-' face — which is right for a signed plane. Every
  call site in `buildings.js` passed the POSITIVE half-extent for both faces
  of an axis. So a `z-` member landed at `+d/2 - proud`: 50 mm inside the
  front wall, where the wall was a solid box and nothing could be seen. The
  longhouse was worse — it wrote `-bodyZ + bodyD/2` for the hall's back, i.e.
  **+2.80 instead of −2.80**, so the inn's back frame stood 1.45 m in FRONT
  of its own front wall, in the arcade, across the door. That misplaced frame
  *was* the inn's half-timbered frontage.

  Measured on a plumb 5.2 × 4.4 cottage, timberFrame vertices proud of each
  elevation: **360 / 12 / 372 / 36** (front / back / east / west) before,
  **180 / 192 / 204 / 204** after. On the inn: **1188 / 0 / 468 / 0** before,
  **480 / 468 / 348 / 360** after. `scripts/probe-faceframe.mjs` is that
  measurement, and `final-evidence/faceframe/` is the picture of it.

  **The fix is that the sign is DERIVED, not written.** `facePlane(face,
  half, centre)` is the only place a face's outward normal is consulted;
  `half` must be `>= 0` or it throws, so the class of mistake cannot come
  back silently. `faceFrame` is one rigid transform — `anchor + R_y(yaw)·p` —
  rather than four hand-written cases, and `pz` is outward on every face.
  `windowOn` / `doorOn` / `frameElevation` take `half` (+ optional `centre`)
  instead of `faceCoord`; the only surviving `faceCoord` in the kit is the
  one on `userData.hollow.door`, which is a signed plane on purpose because
  `src/rooms.js` measures a door offset off it.

  Two consequences worth knowing. The cottage's doorway gap used to be
  applied to `z+` **and** a mirrored copy to `z-`, because the back frame was
  standing in the front doorway; that is one gap on `z+` now. And the
  longhouse's ground-storey front is framed **deliberately** for the first
  time — putting the back frame where it belongs left the hall wall behind
  the arcade blank, so `z+` is in the ground loop with the doorway gapped.

  Still true after the fix and NOT caused by it: a seeded stud can land
  across a window on any elevation. The probe counts it (2 on a cottage, 4 on
  a longhouse, worst bite 0.126 m) and the count is **identical before and
  after** — the fix redistributes the same clashes onto their own faces
  rather than piling both faces' worth on the '+' one.

---

## Traps the SIEGE round added, all of them shipped and all of them found

Every one of these rendered perfectly and threw nothing. The tool that found
each is named, because which tool finds a class of bug is the reusable part.

- **A collider has no top and no bottom unless you give it one, and a wall
  town needs both.** `ctx.collide` took four arguments for the life of this
  codebase. A gatehouse cannot exist under that contract: its parapet, 5 m
  up, is directly over the gate passage, so a full-height collider there
  **seals a 7 m gate** — and its piers are solid stone from the road that
  the wall-walk has to be walked **over**, so without `top` the walk stops
  dead at both gates. There is no geometry that dodges either one: a parapet
  is above a passage by definition. `colliderBlocks` in `src/builders.js` is
  the one copy of the test; the player and the route fill both call it.
  *(Found by: a walk-only flood fill, `check-siege.mjs`.)*
- **Two walkable levels cannot share a footprint without `fromY`.** The
  gatehouse's deck platform at 5.0 spans the passage, and `groundAt` is a max
  over platforms — so the gate's floor became 5 m high, the walk was
  perfectly continuous, and the gate was sealed **by the very platform that
  made the walk work**. One symptom, two causes, and the fill that proves the
  walk is the fill that hides it. `groundAt(x, z, fromY)` now refuses a
  platform more than 0.55 m above your feet. Builders seating props keep
  calling it with two arguments. *(Found by: a ground-level fill from the
  spawn failing to reach the moor.)*
- **Anything that crosses a gate has to take the arch's own spans.** The
  gatehouse's string course went in as one 7.5 × 5.1 m slab at y 3.45 — 0.15 m
  of coping straight across the opening. From the road it did not read as a
  mistake: it read as a **lintel**, with the arch ring floating above it like
  a decoration. From inside the passage it was the **ceiling** — a flat
  coursed soffit, with the real vault a metre above it, never once seen. The
  vault's own courses were correct the whole time. *(Found by: one frame from
  under the arch.)*
- **A semicircular arch does not fit over a wide gate in a low wall, and the
  numbers say so before any render does.** A 5.70 m opening under a 5.00 m
  wall head crowns 2.85 m above its springing, which puts the springing at
  1.75 m — head height at the jambs. Segmental, springing 3.10, rise 1.35,
  crown 4.45, 0.43 m of spandrel. Solve it; do not pick it.
- **A generator that varies tone at its own construction grid is telling you
  where its construction grid is.** The curtain chose a stone tone per
  3 m segment per 1.2 m band from three tones a long way apart, and 40 m of
  wall came back as a **checkerboard** — which reads as damage, not masonry.
  A wall reads horizontally because its courses do: the band index picks the
  tone, and the stone-scale variation is the micro-texture map's job, which
  is the right scale for it. The same mistake in vertical form turned a stair
  cheek wall into stripes at 0.42 m centres (`i % 2`).
- **A raked slab's vertical half-extent is `L·sin(θ)/2 + h·cos(θ)/2`, and the
  second term is not small.** A 2.4 m cart bed written at 1.42 rad (81°) and
  centred at 0.62 puts 0.59 m of itself under the ground. Three props here
  did it — a felled cart, a barricade's tipped cart, its side board — and
  the audit reports BURIED while the street reads it as a *shorter* prop.
  *(Found by: `check-spatial.mjs`.)*
- **`Box3.setFromObject` does not skip invisible children.** A two-state prop
  (a barricade with `up` hidden) is audited as the union of both states, so a
  defect in the state you cannot see is reported against the state you can.
  That is correct and useful — fix the hidden state.
- **The lit thing must not be inside the unlit thing.** `lantern` built its
  glass as a solid 0.185 m box and its lit pane at 0.175 **inside** it, so
  `setLit(true)` swapped a material on a mesh entirely within an opaque one:
  the relight beat played perfectly with nothing whatever to see, and the lit
  lantern was pixel-identical to the unlit one beside it. Two states are the
  **same box** with one of them hidden. (Same shape as a vending machine
  dropping its can inside its own body.) *(Found by: one frame with the two
  side by side — which is why the showcase has both.)*
- **A dressed surround has to be paler than the void it dresses.** The arrow
  slits' frame was `curtainDark` and their slot `ironDark`: same value, so
  the whole opening read as one dark blob on the wall rather than as a slot
  in raised stone. `M.coping` for the surround and the slit appears.
- **A camera's subject must be something SOLID.** The camera gate casts at a
  subject's bounding-box **centre**, and the centre of a chain slung between
  two posts is empty air — the ray sails under the catenary, between the
  posts, and lands on the ground beyond, which the gate correctly calls a
  blocked view. Frame a thin open prop; name something solid in the frame.
- **A clear ray to the subject says nothing about what else is in shot.** The
  bell-tower camera passed its gate with a 1 m beacon cage 2.3 m from the
  lens filling a third of the frame and reading as part of the tower. The
  gate cannot find that one; only the frame can.
- **A camera named after a thing is not aimed at it until somebody checks.**
  Two cameras inherited in this showcase were wrong and had never been
  looked at: `tower` was aimed six metres west of the tower, at the inn, and
  `trees` stood inside the inn's own footprint collider. A wrong aim returns
  a perfectly composed frame of something else. **Declare a `subject` on
  every review camera** — the gate refuses one without it, and that refusal
  is the whole value.
- **The audit's hole grid samples the footprint you declare, not the ground
  you laid.** Quote a rounder, bigger rectangle than the slabs actually
  cover and every square metre outside them comes back as HOLE: a true
  statement about a false contract. And two ground slabs that **butt** at a
  round number are a row of samples falling between them — overlap by 0.1 m.
- **All the stakes lean the same way.** Alternating the sign per stake — the
  obvious way to get variety — builds a row of X's, which is a
  chevaux-de-frise and not a stockade: the eye reads the crossings, not the
  points. The variety is in the angle.
- **A fire reads by being taller than it is wide.** A camp fire's flame at
  0.6 × its ring radius is a 0.96 m trapezoid of flat saturated orange and
  the loudest object in any frame with a camp in it.
- **A wheel is what makes a cart a cart.** A cart on its side is read by its
  wheels and by nothing else — the bed and the boards are planks at an angle
  — and both wheels drawn in `oakDark` against ground of nearly the same
  value at dusk gave a prop that came back as *two leaning boards*. Pale rim,
  dark spokes.
- **A prop's own light pool is on the SHARED pooled material.** `lightPool`
  hands back a mesh whose material is one of two objects for the whole town,
  so `pool.material.opacity = k` in a per-frame updater writes the opacity of
  every warm pool in Hollowbrook — six districts' braziers fighting over one
  number, and whichever updater ran last won the frame. Breathe by
  `scale`, never by opacity. (This was live in the inherited `brazier`.)
- **A roof written over the wall's centre line overhangs the walk.** The
  curtain's hoarding put a 3.2 × 2.0 m unmodulated dark plane across a
  quarter of the frame from a standing eye on the wall. Hold it outboard of
  the parapet, put rafters under it, and do not draw a big flat card in
  `oakDark` at dusk.

## Post-gate errata (reported by the districts, fixed once all six were up)

- **`brazier`'s flame was an upside-down cone (fixed).** The hayRick parasol
  again, in the one prop that is always the brightest thing in its frame:
  `cyl(R * 0.62, R * 0.18, …)` puts the wide radius at the TOP, so the fire
  came to a point at the coals and flared at the sky. Measured on the ember
  cone before and after: r(bottom) 0.0648 / r(top) 0.2232 becomes 0.2232 /
  0.0648. The cone's centre moved h + 0.40 → h + 0.38 so its wide end lands
  exactly on the coal disc's top face at h + 0.17 rather than 20 mm over it;
  `fireY` is unchanged, because a district that hung something off it did so
  against the old number. **The third time `cyl(r0, r1)` has been read as
  (bottom, top) in this kit. It is (TOP, BOTTOM).**
- **`windmill`'s footprint sealed its own gallery (fixed).** The collider was
  `±(r + 0.14)` — the base square — while the gallery deck reaches
  `G.rad + 1.05` from the axis. On a 3.0 m mill that is 3.48 m of inflated
  collider against a 3.66 m ring: **0.18 m of stage**, i.e. the one place a
  district would want to stand on a mill, walled off. The footprint is now
  the shaft ring at `galleryT` (`G.rad + 0.05` = 2.66), which leaves 0.66 m —
  wider than the route fill's 0.35 m stride — and `userData.galleryRing =
  { cx, cz, rIn, rOut, y }` is exposed so a district can platform the deck
  from the same numbers the brackets were drawn from. `gallery: false` keeps
  the old base square, because without a deck there is nothing to seal.
  (millreach's `collide: false` workaround still stands; it does not need
  removing.)
- **`leanTo` returned no `userData.kind` (fixed).** It set `prop: true` and
  nothing else, so the terminus pass counted a finished shelter as an
  untagged mesh in every district that stood one up. `kind: 'lean-to'`. A
  generator that tags itself a prop and not a *kind* is invisible to half the
  gates while rendering perfectly.
- **`tree` was not re-exported from `index.js` (fixed).** The errata row four
  screens up tells districts to prefer `tree({ at })` over a multi-spot
  `treeStand`, and the one import a district is supposed to use did not carry
  it — southgate reached round the barrel to `'../kit/trees.js'`. Appended to
  the trees line; that direct import still works and was left alone.
- **`bracketLantern` and `postLantern` could not switch (fixed).** Neither had
  `setLit`, and a `glow` made the pane glow for ever. The blocker was
  structural rather than an omission: the pane was `P.add(pane, …)` into the
  per-material pool, and **a merged mesh has one material**, so there was
  nothing to swap. The pane is its own one-box mesh now (cast off, tagged
  with the rest); everything else stays pooled, at one draw call a lamp. Both
  carry `practical`, `lit` and `setLit(on)` — pane to the lit material or
  `M.glass`, pool shown or hidden — and **the pool is built whatever `lit`
  says** and merely hidden, which is the brazier's rule and the reason
  `setLit(true)` is not a silent no-op on the dark half of the town. Initial
  state is exactly what it was, `lit || glow != null`; `bracketLantern` still
  has no pool without a `groundDrop`; the pool is still a `withPools`
  sibling, so no lamp's bounding box grows by a 4 m plane.
- **`hollowShell`'s windows cut holes and built no glass (fixed).** The
  chapel saw the almshouse's lit windows 25 m away through its own north
  window, and from inside a dark room a bright rectangle on the far wall
  reads as a second doorway. A window may now carry `glass: true` (a 0.02 m
  pane in `mats.glass`) or `glass: <material>` for that one opening. The pane
  is centred in the wall's own thickness — never on either face, because two
  coplanar sheets are a coin toss and here the loser is the whole elevation —
  and carries no collider, the window's own box already being in the run.
  Default is no glass, so nothing already built changed. **`builders.js` may
  not import `kit/mats.js`**: the nav/sim layer imports this file before any
  DOM stub exists and `kit/mats.js` builds canvas textures at import, so
  `mats.glass` is required rather than defaulted, and asking for `glass: true`
  without it throws with the material named.

- **The brazier's parasol was in four more props (fixed at integration).**
  `torch` (props.js), `wallTorch`, `beaconCage` and `campFire` (siege.js) all
  wrote their flame as `cyl(rBIG, rSMALL, …)` — wide at the sky, a point in
  the coals — exactly the `hayRick` / `brazier` argument-order trap, found by
  the evidence re-shoot after the brazier fix ("an apex-down orange funnel in
  most gate frames town-wide").  When one prop has the cone the wrong way up,
  grep every `cyl(` under a flame for the same pair.
