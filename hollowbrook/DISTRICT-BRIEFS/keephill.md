# District brief — `keephill`, Keep Hill

Read `_COMMON.md` first. You own district `keephill`, `x -18..54, z -54..-18`
— the biggest parcel, and most of it is landform you dress rather than
ground you fill.

## The promise (plan `brief`, verbatim)

The keep on its mound at the north end of the town's axis, and the yew
close behind it to the north-east: the last stand, wave 6's arena and the
win. On the platform: the WARDEN'S HALL (ENTERABLE, the Reeve's final
shelter, objective 4's destination), the BELL TOWER (the landmark the whole
town reads, and the bell rope that ends the night), the beacon cage, the
armoury lean-to. On the lower ward: the well, the muster, the ward gate.
The north and north-east wall-walks are yours, with the NE corner tower and
the stair turret at x 40. The yew close east of the mound: the almoner's
house, the graveyard yews, the vixen's post. Accent: `ACCENT.gilt` on the
bell and the beacon fire. Ten minutes ago: the beacon being laid, the bell
rope untied.

## The land (terrain, already built)

- level 0 over the envelope; **mound** at (2, −34), rx 19, rz 17, h 3.0 —
  it fades to exactly zero 0.6 m from every shelf and corridor, so:
- **lower ward** shelf `x -14..16, z -48.8..-22` at **2.6** with a cliff of
  2.6 m round it where the mound is zero (its revetment — `wallRun` or
  `curtainWall` facing, ≥ 0.5 m proud on top); it abuts the north
  wall-walk shelf at z −48.8 (the walk stands 2.4 m above the ward: a wall
  between them, a stair or none — your call, but no hole).
- **keep platform** shelf `x -6..14, z -44..-28` at **5.2**, a 2.6 m cliff
  above the ward on three sides (the keep's own curtain, faced, parapeted).
- climbs (terrain): `keep-climb-1` (0, −19.5)→north to z −24.7 (0→2.6,
  width 3.2, 13 treads); `keep-climb-2` (4, −27.4)→north to z −32.6
  (2.6→5.2, width 2.6, 13 treads) landing 2.7 m in front of the hall door.
- wall-walk: north `x -18..51.2, z -51.2..-48.8` and east `x 48.8..51.2,
  z -51.2..-18` at 5.0, corner at (50, −50) = `ne-tower`; landing
  `x 40..43, z -48.8..-45.8`; flight `keep-wall-stair` (30.6, −47.3)→east
  to x 40.6.
- the mound's skirts (x −18..−14 and 16..21, z −22..−18) are 1-in-6 turf
  banks: the only non-terraced ground in the town; seat props with
  `seatOnGround` and let it refuse the steep bits.

## Sockets

| id | at | axis | width | y | mate |
|---|---|---|---|---|---|
| keep-road-s | (0, −18) | z | 5.0 | 0 | market-road-n (marketlow) |
| keep-lane-w | (−18, −30) | x | 3.0 | 0 | cc-lane-e (chapelclose) |
| keep-lane-e | (36, −18) | z | 3.6 | 0 | wr-lane-n (wardrow) |
| keep-walk-w | (−18, −50) | x | 2.4 | 5 | cc-walk-e (chapelclose) |
| keep-walk-e | (50, −18) | z | 2.4 | 5 | wr-walk-n (wardrow) |

Anchors: (30,−26)=0 · (−10,−30)=2.6 · (4,−36)=5.2 · (30,−50)=5 ·
(41.5,−47.3)=5 · (50,−30)=5. Waypoints: the keep stair foot (0,−19.2) · the
lower ward (−10,−34) · the keep platform (4,−38) · the bell tower foot
(8.5,−36.5) · the north wall-walk (30,−50) · the yew close (36,−30) · the
east wall-walk, north end (50,−30).

## Enterable: `wardens-hall`

Shell 9 × 6.4 at [0, −38.5] on the keep platform (ground 5.2), door on the
south face (`z+`) at (2.0, −35.3), ≥ 1.5 m clear; `interior_waypoint`
(0, −38.5); camera `wardens-hall-interior` (3.2, 6.75, −36.2) → (−2.5, 6.0,
−40.5), subject `wardens-hearth`; `min_props 12`: the great hearth, the
warden's chair, the long table with the town's map, arms on the wall
(racks, a shield row — no figures), a chest, benches, a lamp, the bell rope
does NOT hang here (it is in the tower). The Reeve shelters here from
wave 5; 2 m of clear floor inside the door.

## Neighbours' stubs

marketlow south (the north-rim house at (8, −15), the guild hall at
(−14.2, 0)); chapelclose west (the almshouse at (−26, −46) 6 m, the
wizard's tower 16 m at (−44, −40)); wardrow south-east (the smithy at
(30, −8)).

## Siege: arena `the-keep`

rect `x -16..-47.. see plan: x -16..46, z -47..-20`, approached from
**south-gate**, wave 6 (the last stand). `min_cover 8, min_elevation 30,
min_landmarks 2` (both `district:keephill:bell-tower` and
`district:keephill:wardens-hall` must read from the rect centre).
- LANES: the raiders come up climb 1 onto the ward, up climb 2 onto the
  keep, AND up the mound's skirts on both flanks (the skirts are walkable
  1-in-6) — so the ward has three approaches and the keep two. The
  Captain comes up climb 2.
- COVER: the ward needs six (the well, the muster's mantlets, a cart, the
  armoury's stack, gabions at the ward gate); the platform four (the
  tower's buttresses, the beacon's base, the hall's porch, a crenel run).
  Nothing on the hall's door line.
- HIGH GROUND: the keep platform itself (+5.2) and the north wall-walk
  (+5.0) which looks down onto the ward from behind — the player can
  hold the wall and shoot into the ward, or hold the keep. Both must be
  reachable from each other in ≤ 12 m: put a stair from the ward up to
  the north walk at x ≈ −8 (a `stairs()` flight, terrain-seated, treads
  overlapping the walk shelf by 0.3 m) — this is the one piece of
  walkable structure you add.
- CHOKES: climb 2 (2.6 m) and the ward gate at the head of climb 1.
- HEXER PERCH: the yew close's rise east of the ward (mound skirt) and the
  ward's east edge.

## NPC posts

- `vixen` (fox) at (27, −34) facing −x in the yew close; `flees_to`
  (36, −30). Leave the close open ground between them.
- The Reeve arrives here in breather 4 (objective `o4-escort-reeve` ends
  at (2, −34), the hall door).

## Interactions (plan names)

- **the bell rope** at (8.5, −41): inside the tower's foot / hanging in
  its open ground stage; E swings the bell (`roundTower({ bell })` or the
  `temple` `bellPivot` pattern) — the win channel later; the bell swings now.
- **the beacon cage** at (−3, −42): E lights it (setLit; a flame + pool).

## Sight corridors crossing you (verbatim)

- `gate-sees-keep` (0,46)→(0,−26), half 3, clear above 8.5 — ends short of
  the hall; nothing over 8.5 m at x −3..3 south of z −26 (your ward gate,
  the climb-1 rails).
- `keep-sees-eastgate` (12,−30)→(46,20), half 3, clear above 7.5 — "From
  the keep platform the East Gate must read, so the player on the high
  ground can see the second gate open in wave 3." Your almoner's house
  at (34, −30) is 6 m tall and stands on the line: keep it under 7.5.

## Vista you own: `from-the-keep`

Camera (2, 7.0, −33) → (0, 6, 50), fov 54, subject
`district:southgate:gatehouse`. You stand on your platform; your parapet
and the ward are the foreground; the whole town lies between. The gatehouse
must separate from the sky by ≥ 40 luma with polish ON — the far treeline
southgate owns is behind it; if the gate reads against trees rather than
sky, ask the coordinator before you touch southgate's wood.

Landmarks: `bell-tower` must read from `from-the-road` and from southgate,
marketlow and wardrow waypoints — it is 14 m over a 5.2 m platform, the
tallest thing in Hollowbrook, and its silhouette (a bell stage, an open
lantern, a conical cap) is the town's skyline. `wardens-hall` from
`over-the-market`. Add them as `ctx.add(g, 'bell-tower')` and
`ctx.add(g, 'wardens-hall')`.

## Kit you may use

`roundTower` (bell tower with `bell`, NE corner tower), `longhouse` /
`hollowShell` (the hall), `curtainWall`, `stairTurret`, `wallRun`
(revetments), `stairs`, `stairRail`, `cottage` (almoner's house), `leanTo`
(armoury), `beaconCage`, `brazier`, `torch`, `wellHead`, `treeStand('yew')`,
`shrineStone` (graves), `fenceRun`, `siegeProps` (mantlets, gabions, spear
racks), `bannerPole` (gilt device: the bell), `signKit` (bell-times).
Budget 460 meshes (the interior is ~50 of them).

## Evidence

`from-the-keep`; the four interior frames; from the keep stair foot looking
up both flights; from the ward looking up at the keep's curtain; from the
north wall-walk down into the ward; from the platform east over the yew
close to the east gate (the corridor); the socket frames from marketlow's,
chapelclose's and wardrow's sides; the orbit sweep; a low frame up at the
bell tower from the ward.
