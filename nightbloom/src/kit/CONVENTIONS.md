# Kit conventions — every district agent reads this before building

Import from `src/kit/index.js` ONLY. The kit is append-only during district
builds: need a new generator or variant? STOP and report the need — do not
define your own building generator in a district file.

Generators: machiya, rowhouse, shrineHall, torii, stoneLantern, yagura,
matsuriStall, lanternString, stationHalt, crossingSignal, canalKerb,
footbridge, phonebox, postRack — plus the signage tables (TENANTS,
tenantFascia/Plate/Noren, haltBoard, warningNotice, shrinePlate,
festivalNobori...) and common.js helpers (rng, M materials, bx/cyl/member/
plank, printed + ASPECT, lanternRig).

Load-bearing rules (each one was earned):

1. **Colliders**: every generator has `name.footprint(opts)` returning rects
   relative to its origin — register them via ctx.collide after placing.
2. **Walkable surfaces**: shrineHall, stationHalt, footbridge ALSO have
   `name.surfaces(opts)` returning `[{x0,z0,x1,z1,top}]`, already yawed —
   register each via ctx.platform or the deck is visible and unreachable
   (halt deck is 0.55 m; the walker steps 0.38 m max).
   Walkable tops are NEVER also colliders.
3. **crossingSignal.footprint omits the barrier arm** unless `blockRoad:
   true`. A lowered-barrier collider across a road socket seals the route and
   the city flood fill fails you.
4. **canalKerb.footprint includes the water** (koi are not walkable). Build a
   kerb run as two calls with a gap where a footbridge crosses.
5. **lanternString**: `masts: false` hangs it between buildings and tags the
   group `airborne` (audit-honest rigging). Default builds its own masts.
6. **Interactions**: yagura/matsuriStall(open)/phonebox carry
   `userData.interact.hitbox` — a MESH (the runtime raycasts hitboxes
   non-recursively; a Group is never hit). yagura also exposes
   `userData.parts.drum` (Group) for the strike reaction.
7. **Practicals**: every lantern-glow mesh is `userData.practical = true` —
   the game lights the town at night by this marker. Hang extra lanterns via
   common.js `lanternRig` (one mesh per lantern; merging them gives the game
   one light at the merge centroid).
8. **Palette ownership**: amber accent = shopfronts + festival ground ONLY;
   blossom pink = shrine + charms ONLY. Crossing/street lamps use the M.glow
   emissive role, not the accent.
9. **Signage aspect rule**: a texture must land on a face matching its native
   aspect (plate 4:1, fascia 6.4:1, notice 3:4, noren 2:1, nobori 1:4) —
   use common.js `printed()`.
10. Seat every scattered prop with builders.js `seatOnGround`; roofs/stairs/
    banks/walls come from builders.js (gableRoof, shedRoof, stairs,
    bankWedge, wallRun, pier, bench, leanTo, stairRail) — never hand-placed
    planes.
