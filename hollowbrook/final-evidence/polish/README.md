# The polish pass — Hollowbrook

`src/polish.js`, called from **both** entry points after `buildVignette`
(`src/main.js` for the town viewer, `src/game/main.js` for the siege), behind
one URL toggle:

```
?polish=off                 the honest blockout underneath
?polish=on   (the default)  every mechanism
?polish=sky,ash,lanes,haze  one mechanism at a time — how the per-mechanism
                            draw-call delta below was measured
```

The gate:

```sh
node scripts/check-polish.mjs            # the gate            -> exit 0
node scripts/check-polish.mjs --shots    # + the A/B frames into .shots/
node scripts/check-polish.mjs --game     # + the game page's play camera
```

**`node scripts/check-polish.mjs --shots --game` → RESULT: PASS, exit 0.**
It boots this project's own vite on **port 5222** (attaching to one already
listening there rather than fighting it for the port) and drives headless
Chrome through `puppeteer-core`, the way `scripts/lib/browser-harness.mjs`
does.

The layer is **additive**: it registers no collider, no platform and no
interactable, so `world`, the nav grid, `heightAt` and every rule read the
same town with it on and off.

---

## The A/B table

Silhouette separation is `core/legibility.js`'s own gate — the median luma
difference along the part of a vista's declared subject that stands against
open sky, floor 40. Draw calls are `renderer.info.render.calls` over the
whole four-pass pipeline at 1280×720, with `autoReset` off (the pipeline is
four `renderer.render` calls and the counter resets on each one).

| camera | subject | calls off | calls on | Δ | sky-edge off | sky-edge on | drop | what changed in the frame |
|---|---|---|---|---|---|---|---|---|
| from-the-road | keephill bell tower | 3350 | 3358 | +8 | 48.31 | 45.88 | −2.43 | the top half was one flat violet wash; now a low cloud band over the roofline, ash drifting through it |
| over-the-market | wardens hall | 2593 | 2601 | +8 | 66.26 | 66.12 | −0.14 | cloud band behind the bell tower; the tower still reads as the strongest silhouette |
| from-the-keep | southgate gatehouse | 2981 | 2989 | +8 | 69.31 | 66.11 | −3.20 | **the smoke column** — two of the Company's fires now show over the south wall, which is the only frame in the town that can see them |
| down-the-row | wardrow east gate | 2053 | 2061 | +8 | 65.82 | 65.82 | 0.00 | lane wear down the row; the gate arch is unaffected |
| along-the-wall | millreach mill | 2303 | 2311 | +8 | 56.53 | 56.91 | **+0.38** | cloud band behind the sails; the haze *helped* here — the mill sits forward of the wall behind it |
| the-close | chapelclose wizard tower | 1931 | 1939 | +8 | 59.72 | 59.80 | **+0.08** | one quiet cloud left of the tower; the ward-glow is still the loudest thing in the frame |
| gate-square *(street)* | — | 2854 | 2862 | +8 | — | — | — | cloud band over the wall; ash; the gate passage's own wear is southgate's and was left alone |
| row-lane *(street)* | — | 1963 | 1971 | +8 | — | — | — | **the biggest ground change**: a flat lilac paving field becomes a worn track down the middle of the lane |

Game page, `__drawCalls()` at the play camera with a wave alive
(`--game`): **2040 off → 2045 on (+5)** at waves 1, 4 and 6. Fewer than the
town viewer's +8 because the lane wear's five merged meshes are partly out
of that frustum.

### Per-mechanism draw-call delta (against `?polish=off`, identical at every camera)

| mechanism | Δ calls | what it is |
|---|---|---|
| `sky` | **+2** | 14 cloud billboards in one `InstancedMesh`, 60 smoke puffs over 2 lit camp fires in another |
| `ash` | **+1** | 380 quads in one `InstancedMesh` |
| `lanes` | **+5** | 191 ground patches merged into 5 meshes, one per pooled ground tone |
| `haze` | **+0** | two numbers on `scene.fog` |
| **total** | **+8** | budget was 120 |

---

## Kept, dropped, retuned

| # | mechanism | verdict | why |
|---|---|---|---|
| 1 | surface micro-texture | **kept as an audit; nothing attached** | measured, not assumed — see below |
| 2 | sky band (clouds + smoke) | **kept** | the single most visible change; four of six vistas had a dead upper third |
| 2b | overhead layer | **deliberately not added** | see below |
| 3 | drifting ash | **kept** | +1 draw call, and it is what makes the air read as a siege rather than an evening |
| 4 | aerial perspective | **kept, RETUNED from 40..190 to 45..460** | 40..190 failed two vistas outright — see below |
| 5 | ground breakup in the lanes | **kept, re-authored once** | first cut read as tiles — see below |
| 6 | accent discipline | **kept as an audit; PASS, nothing to fix** | |
| 7 | practicals that travel | **kept as an audit; PASS, nothing to fix** | |

Nothing was dropped. One mechanism (4) had to be retuned because the value
the scaffolding was written around broke a promise, and two (2, 5) were
re-authored after reading their first frames.

---

## p1 — surface micro-texture: measured, and no material needed one

`window.__polish.surfaces({ measure: true })` renders a **material-ID pass**
at all six vista cameras (every mesh swapped for a flat colour keyed to its
material, 320×180, pixels read back) and gives each material its share of a
vista frame. That is what makes the reference's rule — *attach the missing
maps only where a material covers more than 2 % of a vista frame* — a
measurement rather than a guess.

- **33 pooled materials carry a multiply map, 176 do not.**
- The **largest unmapped material is 1.25 % of a vista frame**
  (`PAL.hedge` `#5f7654`, marketlow's garden hedging). Everything else
  unmapped is foliage, small metal and prop-scale timber.
- Every material over 2 % already has one: `th-granite` (9.76 %, 4.27 %,
  3.54 %, 1.18 %, 1.03 %), `th-ground` (4.93 %, 2.64 %, 2.51 %), `th-oak`
  (2.06 %, 1.63 %), `th-thatch`, `th-shingle`, `th-limewash`.

**So `src/kit/surface.js` was not touched.** The pool was already born
textured (`kit/mats.js` calls `applyKitSurfaces(M)` at module load) and the
audit says so with numbers.

## p2 — the sky band

**Clouds.** 14 billboards on a ring at 0.62 of the camera's far plane,
unlit, `depthWrite: false`, no shadows, no colliders, Y-billboarded, drifting
downwind at 0.22–0.5 m/s. Their tone is within a few luma of `PAL.sky.mid`
on purpose: six vistas look in six directions, so there is no bearing to keep
clear, and the legibility gate measures a subject against *open sky* — a
bright cloud behind a declared subject costs a promise. Shape without
contrast is also what a cel cloud at dusk actually looks like.

> **The first cut put four pale RECTANGLES in the sky.** The cloud texture
> ended with a "soft base wash" — a `fillRect` under a *linear* gradient,
> which fades vertically and is a hard cut at both ends of the x it was
> filled over. On a 40 m billboard that is a rectangle, and it is the single
> most artificial thing a sky can have in it. Everything in the map is a
> radial falloff now; nothing is a rect. It was invisible in the numbers and
> obvious in the frame, which is the whole argument for reading both.

**Smoke.** Found by traversing for `userData.kind === 'camp-fire'` —
**measured, not remembered**. The brief said "outside both gates"; the town
has **three camp fires and all three are at the south gate**
(−4, 58.2 lit · 6.6, 62.2 lit · −0.4, 61 unlit). A remembered list would
have hung two columns over an east gate with no fire under it. 30 puffs per
lit fire on one instanced mesh, rising 15.5 m and leaning 11 m downwind as
`t^1.35` (smoke goes up before it goes sideways), fading from a soot
grey-violet toward the fog tone rather than toward transparency, because at
dusk the top of a column *is* the sky's value.

> Sized against the wrong frame first. 20 puffs at 0.34 opacity was tuned on
> the gate-square camera, which faces *away* from the fires; the only picture
> in the town that can see a column is `from-the-keep`, at 93 m, where it was
> a barely-visible smear. A column is legible from the one camera that can
> see it or it is not there.

**Wind** is `(−0.29, −0.957)`: the fires are at z 58–62, south of a wall at
z 50, and the town is everything north of it, so the only wind that puts
their smoke and their ash over the town blows north. The westward component
is the sun's own quarter (bearing 268) and keeps a column off the gate axis
in `from-the-keep`.

**The overhead layer was deliberately not added.** The brief's own rule —
*banner strings and wires only where a district already hangs them; do not
add anchors to buildings you cannot measure*. `window.__polish.overhead()`
finds **13 strung runs already up**: marketlow's two lantern strings over the
market, chapelclose's alms washing, wardrow's washing line. Every one of
those is anchored to posts its own district measured. An anchor this file
cannot measure is an anchor in mid-air, so this layer reports them and hangs
nothing.

## p3 — ash

380 quads at 0.115–0.16 m in one `InstancedMesh`. **Unlit flat colour** —
the reference's crow trap at particle scale: a lit quad tumbling in the air
spends half its life with its normal away from the sun and becomes a black
speck against the sky. `depthWrite: false` so the ink pass does not outline
every fleck into speckle. Nine in a hundred are ember-warm; the rest are
ash-lilac. It drifts downwind off the fires and recycles by **wrapping a
48 m box round the eye** — 380 quads over a 132 m town is nothing, over a
48 m box round the walker it is ash.

> First cut: `0xd6cdd2` at 0.72 opacity. The frames came back with a field of
> hard white dots — snow, not ash. A fleck has to sit at or just under the
> value it is seen against (`PAL.sky.mid` is `0xb3a5be`), with only the
> ember-warm few standing out at all.

## p4 — aerial perspective, and the one mechanism that made the picture worse

`src/main.js` was scaffolded around `POLISH_FOG = { near: 40, far: 190 }`.
**Measured, that range fails two vistas.** `from-the-road` stands 94 m off
keephill's bell tower against open sky — the most fog-sensitive thing in the
town. A sweep of eight ranges through `checkAllVistas`, silhouette
separation against sky, floor 40:

| near..far | from-the-road | verdict |
|---|---|---|
| 92.4..330 *(the plan's own `fogRange`)* | 48.45 | the baseline |
| 60..400 | 46.35 | −2.10 |
| **45..460** | **46.2** | **−2.2 — this** |
| 40..340 | 42.29 | −6.16, and only 2.3 over the floor |
| 36..280 | 37.87 | **FAILS the floor** |
| 32..240 | 32.26 | **FAILS** |
| 40..190 *(the scaffold's)* | 24.35 | **FAILS — a cream ghost** |
| 26..100 *(the starter's)* | 15.61 | **FAILS**, and takes from-the-keep to 1.09 with it |

The town is 132 m across and its most distant promise is at 94 m, so there
is no linear-fog range that is strong at conversational distance *and* cheap
on that tower. What is left is honest and modest: nothing under 45 m is
touched at all, the far half of a vista picks up 10–13 %, and two vistas
(`along-the-wall` +0.38, `the-close` +0.08) come out *better* because their
subjects stand forward of the masses behind them.

**In the game page the haze owns the RANGE only.** `game/daynight.js` owns
the fog *colour* as the waves go on; the two must not fight.

## p5 — ground breakup in the lanes

The lines are **the plan's own**, not a memory of where a lane looks like it
runs: `game.gates[].approach` and `game.arenas[].approach.points` are the
polylines the waves walk, which is the definition of "where feet pass", plus
the row lane off the east gate's axis and the `gate-sees-keep` sight
corridor for the market. Decals, never platforms, no colliders, seated with
**`groundLayerAt` and not the two-argument `groundAt`** — the gatehouse
registers a deck at y 5.0 over the south gate passage, and this project has
already shipped a wear layer on the roof of its own gate.

476 stations, **191 patches** in 5 merged meshes:

| lane | patches |
|---|---|
| the-mill-approach | 82 |
| the-row-lane | 51 |
| east-gate-passage | 37 |
| the-close-approach | 12 |
| south-gate-passage | 5 |
| market-axis | 4 |
| the-keep-approach | 0 |

232 stations were dropped because **a district had already worn that
ground** (southgate's gate passage, marketlow's ramp ruts, keephill's ward —
`the-keep-approach` came out at zero, which is the dedupe working), 24 were
blocked by a collider and 29 straddled a grade steeper than 0.10 m across
the patch's own four corners.

> **Two bugs, both found by reading a frame.**
> 1. The dedupe was `Box3.setFromObject` on each `ground-wear` mesh — but a
>    district's wear is one *merged* mesh, so the box is the whole scatter's
>    envelope: southgate's is 27 × 36 m, the entire gate square. It dropped
>    182 of 364 stations and the market's bare turf got four patches. It is
>    an occupancy grid over every wear vertex now (0.9 m cells).
> 2. The tone was picked evenly from six ground tones including `earth`
>    (`#8a7b66`) and `moss` (`#6f8060`) on a lane paved in `#b7b0ab` — a
>    40-luma step per patch, and the row lane came back as two dozen separate
>    dark rectangles lying on the road. The mix is weighted now and keyed to
>    **where in the lane** a patch sits: `gravel`/`straw` for the wear,
>    `pavingDark` for the rut down the middle, `moss` at the edges only; and
>    patches are 0.9–2.4 m at 0.85 m stations, so they *overlap* and read as
>    a track rather than as tiles. (southgate's own header records the same
>    lesson from the other end: its patches are `pavingDark` two times in
>    three because `gravel` read as paper on the road.)

## p6 — accent discipline: PASS

`window.__polish.accents()`. **15 accent meshes, 0 FAIL, 0 WARN.**

- `ACCENT.companyRust` appears **once**, on
  `southgate:company-banner:pool-5` at (3.6, 57.4) — the Company's camp
  banner, and nothing else in the town wears it.
- `wardenMadder` ×2 on southgate's gatehouse; `gilt` ×2 on keephill's bell
  and beacon; `hallAmber`/`lanternGold` ×8 on marketlow's guild-hall
  lanterns and panes; `sailOchre` ×1 on millreach's mill; `wardGlow` ×1 on
  chapelclose's lit glyphs. Every one on its owner and inside its owner's
  envelope.

Note for anyone extending the audit: four of Thistledown's accent keys are
the **same hex** as a Hollowbrook one (`hallAmber`/`lanternGold`,
`rowGreen`/`hedgeGreen`, `sailOchre`/`milledOchre`,
`wardGlow`/`alchemicalTeal`), so an audit by colour cannot tell them apart
and the ownership table in `polish.js` says so in place.

Nothing was fixed in any district. The audit reports; a district's paint is
the district's.

## p7 — practicals that travel: PASS

`window.__polish.practicals()`. **48 practicals, 32 lit, 32 of those with a
`light-pool`** — every lit lamp in the town throws a pool on the ground
under it.

| district | practicals | lit | with a pool |
|---|---|---|---|
| southgate | 10 | 7 | 7 |
| marketlow | 7 | 1 | 1 |
| keephill | 8 | 6 | 6 |
| millreach | 10 | 8 | 8 |
| chapelclose | 7 | 4 | 4 |
| wardrow | 6 | 6 | 6 |

The 16 unlit ones are the day-night rig's pending list — `daynight.js`
brings them up wave by wave, and the kit builds every pool whatever `lit`
says and merely hides it, so they light correctly when their turn comes. No
pool was added by this pass.

---

## The frames

`frames/polish-<camera>-{off,on}.jpg`, 1280×720, captured through the full
`scene → ink → grade → fxaa` pipeline with `window.__shot`. Every drifting
layer is stepped by hand (240 × `vignette.update(1/60, eye)`) before a
capture, because nothing in this project animates on its own.

| pair | camera |
|---|---|
| `polish-from-the-road-{off,on}.jpg` | vista · the arrival |
| `polish-over-the-market-{off,on}.jpg` | vista · the market |
| `polish-from-the-keep-{off,on}.jpg` | vista · the keep — **the smoke** |
| `polish-down-the-row-{off,on}.jpg` | vista · the row |
| `polish-along-the-wall-{off,on}.jpg` | vista · the mill |
| `polish-the-close-{off,on}.jpg` | vista · the close |
| `polish-gate-square-{off,on}.jpg` | street · from the spawn (0, 1.66, 30) looking north |
| `polish-row-lane-{off,on}.jpg` | street · (24, 1.66, 22) looking east — **the lane wear** |

`ab.json` beside them is the gate's own output: every number in this file,
plus the full material-share table and the accent and practical rows.

## Files changed

| file | change |
|---|---|
| `src/polish.js` | **new** — the whole layer |
| `scripts/check-polish.mjs` | **new** — the gate |
| `src/main.js` | import + `applyPolish(...)` after the plan's rig; `POLISH_FOG` now comes from `polish.js` instead of a local constant; `polish` on `window.__vignette` |
| `src/game/main.js` | import + `applyPolish(..., mode: 'game')` after `buildWorld`; `polish` on `window.__game` |
| `src/scene.js` | the vignette now returns its `ctx`, so an additive layer can register its per-frame step on the same `ctx.update` list everything else uses |
| `final-evidence/polish/` | this file, `ab.json`, `frames/` |

`src/kit/surface.js` was **not** changed — the measurement says no material
needs a map it does not have. No district, no rule, no kit file was touched.
