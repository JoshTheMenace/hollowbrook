# keephill — evidence

Every frame is `__shot` from the running dev server at `?only=keephill`, so
the neighbours in them are the plan's `massing` stubs (the flat dark boxes on
the skyline) and not their real districts. Eye height is **1.62 m over
`vignette.groundAt(x, z)`** except where the table says FREE.

Reproduce any of them in the page:

```js
const V = window.__vignette, G = V.vignette.groundAt;
const E = (x, z) => [x, G(x, z) + 1.62, z];
await __shot('name', 1400, 790, { pos: E(x, z), lookAt: [tx, ty, tz] });
```

Two things have to be done by hand before some of these, because nothing
animates in a headless frame and the runtime culls what it cannot see:

```js
// the interiors are distance-culled from the PLAYER, and __shot does not
// move the player — so a room 70 m from the spawn renders empty
V.scene.traverse((o) => { if (o.userData?.interior === true) o.visible = true; });
// the beacon, the bell and the door are interactions: fire, then step
V.vignette.interactables.find((i) => i.name === 'the beacon cage').action();
for (let i = 0; i < 40; i++) V.vignette.update(1 / 60, V.camera.position);
```

## The contracted cameras

| file | camera | what it is for |
|---|---|---|
| `vista-from-the-keep.jpg` | the plan's `from-the-keep`, `{ review: 'from-the-keep' }` | **the vista keephill owns.** Its subject is southgate's gatehouse, so it can only be judged in the full city; `check-cameras` passes it there. The foreground is the keep's south parapet, the ward gate's arch and the ward. |
| `hall-interior.jpg` | the plan's `wardens-hall-interior` — pos `[3.2, 6.75, -36.2]`, target `[-2.5, 6, -40.5]`, fov 52 | the interior camera, subject `wardens-hearth`. |
| `hall-door-shut.jpg` | `E(2.0, -31.6)` → `[2.0, 6.9, -35.3]` | the street door, shut. |
| `hall-glimpse.jpg` | `E(2.0, -32.6)` → `[1.4, 6.3, -39.5]` | the glimpse through the open door: the warm doorway, the shields, the lamp. |
| `hall-out.jpg` | `[2.0, 6.95, -37.2]` → `[2.4, 5.6, -26]` | the view back OUT of the doorway, down the platform and over the ward. |
| `hall-hearth.jpg` | `[-0.6, 6.6, -38.6]` → `[-4.4, 6.1, -40.3]`, fov 48 | the great hearth alight, under its own stack. |

## The brief's own list

| file | camera | note |
|---|---|---|
| `gate-axis.jpg` | `E(0, -6)` → `[6, 14, -36]` | **the keep from the town's axis at eye height** — the whole point of the `gate-sees-keep` corridor: the climb, the ward gate, the curtain and the bell tower over them. |
| `climb1-foot.jpg` | `E(0, -18.6)` → `[0, 5, -30]` | the climb from its foot, up to the ward gate. |
| `climb2-cutting.jpg` | `E(4, -29.4)` → `[3, 8, -36]` | climb 2 in its cutting, the keep's only stair. |
| `ward-yard.jpg` | `E(-10.6, -36)` → `[-6, 4.6, -26]` | the ward at eye height, mid-cover. |
| `muster.jpg` | `E(-8.2, -37.6)` → `[-12.4, 3.8, -33]` | the muster: mantlets, gabions, the felled cart. |
| `ward-up-at-curtain.jpg` | `E(-10.4, -30)` → `[-3, 8.6, -37]` | from the ward, up at the keep's curtain. |
| `walk-down-into-ward.jpg` | `E(6, -49.8)` → `[-4, 2.9, -34]` | from the north wall-walk down into the ward — the shot the player takes from behind. |
| `ward-from-walk.jpg` | `E(20, -49.6)` → `[-2, 3, -32]` | the same, further east. |
| `platform-east-to-eastgate.jpg` | `[12, 6.9, -30]` → `[46, 5, 20]` | the `keep-sees-eastgate` corridor, over the yew close. |
| `tower-low.jpg` | `E(-6, -30)` → `[11.4, 16, -39]` | a low frame up at the bell tower from the ward. |
| `bell-close.jpg` / `bell-swinging.jpg` | `[6.6, 17.2, -35.4]` → `[11.4, 19.6, -40]` | the bell up close, still and rung (fire `the bell rope` first). |
| `rope.jpg` | `E(7.0, -40.8)` → `[9.4, 6.2, -40.8]` | the rope where it is pulled, and its cleat with the tail off it. |
| `beacon-lit.jpg` / `beacon-wide.jpg` | `E(1.6, -43.1)` / `E(6.4, -42.2)` → the cage | the beacon lit at dusk, with the faggots, the ladder and the barrow it was being laid from. |
| `allure.jpg` / `allure-down.jpg` | `E(15, -42.6)` → `[15, 6.2, -29]` | the east allure: the keep's second approach and the hexer perch. |
| `armoury.jpg`, `almoner.jpg`, `close.jpg`, `close-graves.jpg`, `banner.jpg`, `walk-east.jpg`, `ward-gate.jpg`, `platform.jpg` | see the file | the rest of the district. |

## Waypoints — one frame each, standing on it

`wp1-stair-foot` (0,−19.2) · `wp2-lower-ward` (−10,−34) ·
`wp3-keep-platform` (4,−38) · `wp4-bell-tower-foot` (8.5,−36.5) ·
`wp5-north-walk` (30,−50) · `wp6-yew-close` (36,−30) ·
`wp7-east-walk` (50,−30).

## Sockets — both ways

`sock-<id>-IN` stands on the NEIGHBOUR'S side looking into keephill;
`sock-<id>-OUT` stands on keephill's side looking out. Five sockets:
`road-s` (0,−18) · `lane-w` (−18,−30) · `lane-e` (36,−18) ·
`walk-w` (−18,−50) · `walk-e` (50,−18).

## Orbit sweep — **FREE CAMERA**, not a play camera

`orbit-S/W/N/E` at 90° steps, `[4 ± 62, 34, -36 ± 62]` → `[4, 5.2, -36]`.
These are the only frames here that are not taken from a standing eye or a
contracted camera, and they are labelled as such.

## The two gate rows that do not pass, and why they are not keephill's

- `keep-sees-eastgate` is blocked 58.9 m along by `district:wardrow:massing-0`
  — wardrow's stub massing standing where its east gatehouse will be. The
  corridor's own terminus is that gate.
- `bell-tower` from the vista `from-the-road` is blocked 11.75 m out by
  `district:southgate:massing-1` — a solid 5 × 5 × 15.5 m stub block 12 m in
  front of the lens, where southgate's gatehouse turret (a 2.6 m drum) will
  stand. No tower height clears a block that tall that close: the ray is at
  y 8.99 where the stub spans 5.0 to 15.5.

`arena:the-keep:visibility` reads 23 % against a 40 % threshold, and that is
measured rather than argued: hiding **every mesh keephill owns** takes it to
33 %, still under the bar, and hiding every district's geometry takes it to
88 % — so the ceiling is set by the terrain and by marketlow's and southgate's
masses on a 100 m diagonal, not by this parcel. keephill's own contribution is
10 points, and 10 of the 32 cells it costs are the ward's three revetments,
which are the terrace's retaining faces and cannot come out.
