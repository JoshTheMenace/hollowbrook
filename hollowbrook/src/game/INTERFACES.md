# src/game — the interfaces the pieces meet at

The rules (`rules.js`) are pure and tick-fixed (`TICK = 1/60`). Everything
visual is a VIEW over the rules' records: it reads them every frame and
never writes them. The shell (`main.js`) owns the scene, the Feel bus, the
HUD, the save path and the accumulator (`stepper.js`).

## Enemy record (`run.enemies[]`)

```
{ id, kind: 'cutpurse'|'reaver'|'shieldbearer'|'hexer'|'captain',
  x, y, z,             // feet, world flat coords (y from world.groundAt)
  heading,             // radians; 0 faces +z, atan2(dx, dz) — charforge Actor's convention
  hp, hpMax, scale,    // scale 0.94..1.08 (captain 1.0), seeded
  tint,                // 0..1 seeded, for a per-instance cloth tint
  state,               // 'move'|'windup'|'strike'|'recover'|'hit'|'cast'|'dashwind'|'dash'|'retreat'|'dead'
  stateT,              // seconds in state
  moving, running, speed,
  telegraph,           // 0..1 while windup/cast/dashwind (drive the glow)
  seq: { hit, flinch, attack, cast, death, dash },   // counters: play a one-shot when one changes
  elite,               // true for the captain
  gone }               // record about to be dropped (retreated off the map)
```
A record with `state === 'dead'` lies for `CORPSE_SECONDS` (6) then leaves
the array; the view removes the body when the record is gone.

## NPC record (`run.npcs[]`)

```
{ id: 'reeve'|'runner'|'bowman'|'smith'|'millwarden'|'hedgewizard'|'vixen',
  character: 'elder'|'mika'|'archer'|'brute'|'golem'|'mage'|'fox',   // charforge registry name
  name, x, y, z, heading, moving, running, speed,
  state: 'post'|'toShelter'|'sheltered'|'toPost'|'escort'|'flee'|'hiding',
  talking,             // true while this NPC owns the open dialogue
  lineSeq,             // increments on every dialogue line this NPC speaks
  performer }          // plan says this rig is Performer-driven
```
`run.dialogue` is `{ npc, key, i, lines, ticks }` or null; `lines[i]` is
`{ text, plan }` with `plan` already normalised through Mira's contract
(`script.js`). The view directs the Performer with `lines[i].plan` when
`lineSeq` changes and blends the gesture out on `dialogue-close`.

## Views

- `enemies.js`: `await createEnemyView({ scene, cel, world })` →
  `{ update(dt, run, camera), markers(), bodies(), dispose() }`.
  `markers()` returns the elite marker meshes (banner + HP bar), which the
  legibility ID pass paints into the green channel; `bodies()` returns one
  `{ id, root }` per live body for the ID pass. The view MUST tag every
  enemy root `userData.enemy = id` and every marker `userData.marker = true`.
- `cast.js`: `await createCast({ scene, cel, world, run })` →
  `{ update(dt, run, camera, playerEye), dispose() }`, plus
  `soakCast({ seconds })` for scripts/check-npc-soak.mjs (headless, Node).
  Each NPC root is named `npc:<id>` with `userData.npc = id` (check-game).
- `dialogue.js`: `createDialogueUI(root)` → `{ open(name), line(text), close(), update(dt), typing }`.

## Events (`events.js`) the views may listen to via the Feel table's `call`

Views do not subscribe; the shell wires `FEEL[event].call` to view methods
where needed (e.g. `barricade-up` → the district's `userData.raise()`).

## District contract (what the game reads from the built town)

- cover: `userData.cover = true` on a prop with a collider ≥ 0.9 m; the
  collider record may also carry `cover: true`, `top`, `bottom`.
- practicals: `userData.practical`, `userData.setLit(bool)`; the three
  town lights are `userData.townLight = 0|1|2` on a building's window
  group — `light-lost` calls `setLit(false)` on the matching index.
- barricades: `userData.raise()` / `lower()` / `state`, within 3 m of an
  `o2-barricades` point; braziers with `setLit` within 3 m of an `o3` point.
- the bell: an interaction named exactly `the bell rope` in keephill.
- shelters: the plan's `enterable[].interior_waypoint` must be on the nav
  grid (door ≥ 1.4 m clear) or the NPC stops at the door.
- an elevated walkable platform the player must pass UNDER is fine: the
  walker asks `groundAt(x, z, fromY)` (world.js), which only offers a
  surface within 0.55 m of the feet. The nav grid is the ground layer.

## Audio contract (`src/audio/index.js`, the music agent's)

`music.js` sends ONE number: `intensityOf(run)` every 0.25 s (the contract's
formula during a wave, the breather intent point in a breather, `dawn()` on
the bell). SFX go through the feel table's `sfx` names, which the bank
resolves via its own `ALIASES`; gain comes from the bank's measured
`MAGNITUDE`, never from a call site — the shell passes only pitch and the
positional triple (`pos`, `listener`, `yaw`). `scripts/check-music-state.mjs`
gates the sent number against MEASURED threat with a null-model table.
