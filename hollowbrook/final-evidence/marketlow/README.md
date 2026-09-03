# marketlow — The Low Market: evidence

Built against `DISTRICT-BRIEFS/marketlow.md`. Every frame is a **play
camera** — a standing eye at 1.62 m over `groundAt`, or one of the plan's
own contracted cameras — except the four in `mk-40-orbit-*-FREE-CAMERA`,
which are labelled as such and exist only to show the whole parcel at once.

All frames captured through `window.__shot` on `?only=marketlow`, so the
neighbours stand as their plan `massing` stubs (the dark blocks on every
skyline are southgate's, keephill's, millreach's and wardrow's, not mine).

## The contracted cameras

| frame | what it is |
|---|---|
| `mk-01-vista-over-the-market` | **the vista this district owns**, plan camera (0, 2.4, 14) → (2, 8, −40), fov 52. Everything in the lower two thirds is marketlow's. Its declared subject is keephill's `wardens-hall`, which is a stub here — the headless whole-city run of `check-cameras.mjs` and `check-legibility.mjs` both PASS it (see the GATE files). |
| `mk-12-guildhall-interior` | plan camera (−11.6, 1.55, 2.2) → (−15.5, 0.9, −1.6), subject `guildhall-hearth`. |

## The arena

`mk-02` … `mk-05` are the square from each of its four rims; `mk-16` is the
rim looking **down** onto the floor. `mk-06` is the floor at eye height in
the middle of the cover, `mk-07` the well as the lane's pivot, `mk-25` the
ramp foot looking north up the lane the enemies run, `mk-22` the north
steps looking back south at the ramp. `mk-26` is the north-west rim corner,
which is one of the two declared hexer perches (the other is the east stair
head, `mk-24`).

## The enterable — the Reeve's Hall

Four frames, in the order `_COMMON.md` asks for them:

- `mk-10-guildhall-door-shut` — the street door shut
- `mk-11-guildhall-glimpse-through-door` — the glimpse through the open door
- `mk-12-guildhall-interior` — the interior, on the plan's own camera
- `mk-13-guildhall-back-out-of-the-door` — the view back OUT

The dressing is distance-culled from the **player's** position and `__shot`
moves only the camera, so each of these was captured after stepping the
world once with an eye near the door (`vignette.update(dt, { x, y, z })`).
An interior frame taken without that comes back as an empty room.

## The interactions

- `mk-50` / `mk-51` — the market bell, before and after `E` (the bell swings
  for nine seconds and the hall's amber comes up and stays)
- `mk-52` / `mk-53` — the same beat read from the square: two lantern
  strings, two bracket lamps and the hall's second east window
- `mk-54` / `mk-55` — the well bucket, down at the rim and wound 0.80 m clear

`ACCENT.hallAmber` is on those lanterns and on nothing else in the district.

## The sockets

`mk-30` … `mk-33` are the four sockets **from the neighbour's side**,
looking in: southgate's gate road, keephill's keep road, millreach's lane,
wardrow's row lane.

## Gates

`GATE-*.txt` are the raw outputs. The whole-city runs contain other
districts' rows; marketlow's are:

- `check-spatial` — **zero marketlow rows** (grep the file)
- `check-city --district marketlow` — PASS throughout: 4 seam pairs, all
  5 waypoints reached by the flood fill, 356 meshes / 440, 50 500 triangles
  / 160 000, the interior's 15 props / doorway / route / camera, both sight
  corridors, 3 interactables for 2 declared
- `check-game` — every `arena:the-market:*` and `npc:reeve:{ground,facing,
  shelter}` row PASSES, and both escort objectives that touch this district.
  `npc:reeve:present` FAILS for all seven posts town-wide: the character
  comes from the game layer, not from a district.
- `check-arena-visibility` — `the-market` PASSES at 60 %
- `check-cameras` / `check-legibility` — `over-the-market` PASSES
- `check-interactions` — PASS, both declared interactions registered and
  both demonstrably act

`check-spatial.mjs`, `check-game.mjs` and `check-arena-visibility.mjs` exit
non-zero because of **other** districts' rows and the game layer's absent
cast; the marketlow rows in each are listed above.
