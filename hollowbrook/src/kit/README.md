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
} from '../kit/index.js';
```

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
