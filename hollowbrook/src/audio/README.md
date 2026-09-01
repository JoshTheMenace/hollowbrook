# src/audio — the interface the game codes against

Owned by the music/SFX agent. **The game layer imports `src/audio/index.js` and
nothing else from here, and never imports `@forge/soundforge/*` directly** — one
copy of `dsp.js` must be loaded or `seedAudio()` seeds a module the renderer is
not using and determinism quietly dies. Every module under `src/audio/` reaches
soundforge by *relative path* (`../../../charforge/src/soundforge/…`) for the
same reason: it resolves to the identical absolute file the `@forge` alias in
`vite.config.js` resolves to, so Vite dedupes it to one module — and Node can
resolve it too, which an alias cannot, which is what lets the gate run headless.

Nothing here touches `src/game/` or `src/kit/`.

---

## The whole interface

```js
import {
  initAudio, isReady, setIntensity, getIntensity,
  play, footstep, dawn, stopMusic, setMusicVolume, setSfxVolume, disposeAudio,
  MAGNITUDE, LADDER, TIERS, EVENTS, SURFACES,
} from './audio/index.js';
```

### `await initAudio({ onProgress } = {})`

Creates the `AudioContext`, renders the score's tier stems and the whole SFX
bank, and starts the music at intensity 0. **Must be called from inside a user
gesture handler** (click / keydown) or the browser's autoplay policy leaves the
context suspended and every later call is silent; `initAudio` calls
`ctx.resume()` itself, but a resume outside a gesture is a no-op. Idempotent —
a second call returns the same promise.

`onProgress(frac, label)` fires per stem and per SFX (≈ 45 steps). The render is
CPU-bound pure JS (~1.5 s on this machine) and yields between items, so it is a
loading-screen job, not a first-frame job.

Returns the audio singleton. `isReady()` is the synchronous test.

### `setIntensity(x, ramp = 0.9)`

`x` is the ONE number from `LOOP-CONTRACT.md`'s intent curve, clamped 0..1. The
music's nine tier stems crossfade by their intensity windows; `ramp` is the
seconds-scale time constant. Cheap — safe to call every frame.

`getIntensity()` returns the last value set.

### `play(name, opts = {})`

`name` is any key of `MAGNITUDE` (see the table below — the 13 ladder events,
the contract's ten also-declared events, telegraphs, footsteps, UI, blips).
Unknown names warn once and return `false`.

| opt | default | meaning |
|---|---|---|
| `pitch` | `1` | playback-rate multiplier; a small seeded jitter is added on top |
| `pan` | `0` | −1 … 1, hard left to hard right |
| `gain` | `1` | multiplies the **table's** level; leave it at 1 |
| `pos` | — | `[x, y, z]` world position of the event |
| `listener` | — | `[x, y, z]` world position of the player |
| `yaw` | `0` | player yaw, `atan2(-dx, -dz)` convention (0 looks along −Z) |
| `duck` | auto | dip the music under this shot; auto for magnitude ≥ 30 |

**Positional pan.** Give `pos` + `listener` + `yaw` and `pan`/`gain` are derived
and any explicit `pan` is ignored:

```
d      = pos − listener                       (XZ only; Y is ignored)
fwd    = (−sin yaw, −cos yaw)                 right = (−fwd.z, fwd.x) = (cos yaw, −sin yaw)
pan    = clamp(dot(d̂, right), −0.9, 0.9)      · 0.85   (never hard-panned: a hard-panned
                                                        cue is unlocatable on speakers)
gain   = REF / (REF + max(0, |d| − REF))      REF = 6 m, so 6 m = 1.0, 18 m = 0.33
```

Beyond `MAX_AUDIBLE = 55 m` the call is dropped and returns `false`, so the
game may fire events for every enemy without gating by distance itself.

**Do not set `gain` from your own idea of how big an event is.** Perceived
magnitude is already baked into the bank and *measured* — `MAGNITUDE[name]` is
the measurement, and `scripts/check-music.mjs` fails if the ladder stops being
monotone in it. If an event feels wrong, that is a defect in this module and a
number in that table, not a multiplier at the call site.

### `footstep(surface, opts = {})`

`surface` ∈ `SURFACES` = `'stone' | 'timber' | 'grass'`. Anything else falls
back to `'stone'` (and warns once). Alternates a left/right pitch pair and adds
a seeded per-step jitter, so a run does not machine-gun one sample. Accepts the
same positional options as `play` (usually you want none — it is the player's
own feet).

### `dawn()`

Fires the fourth tier: the bell stem fades **in** over 6 s while the three war-
drum tiers are pulled out, regardless of the current intensity. It is the wave-6
resolution, not an intensity level — the dawn tier's window is `[2, 3]`, i.e.
unreachable from `setIntensity`, which is exactly why the loudness curve stays
monotone at the contract's `dawn: 0.30` intent point. Call `setIntensity(0.30)`
alongside it for the intent curve; call `dawn(false)` to cancel.

### `stopMusic(fade = 1.2)` · `setMusicVolume(v)` · `setSfxVolume(v)` · `disposeAudio()`

`disposeAudio()` ends every sound and closes the context — the scene owns the
audio, and audio that outlives its scene is a defect class (`SOUND.md`).

---

## Headless render path (no WebAudio)

The same code renders in Node, which is what the gate and the evidence run on:

```js
import { renderScore, mixAt, TIERS } from './audio/score.js';
import { renderBank, BANK } from './audio/sfx-bank.js';

const score = renderScore();          // { stems: {name: {audio:[L,R], window}}, loopSec, meta }
const mix   = mixAt(score, 0.68);     // one loop's worth of stereo at that intensity
const bank  = renderBank();           // { name: [L, R] }
```

Every render is seeded (`seedAudio()` from soundforge's `dsp.js`) and therefore
**byte-identical between runs** — `check-music.mjs` proves it by rendering twice
and comparing SHA-256 of the raw sample bytes.

---

## The score's tiers

Nine stems on one 20 s / 8-bar timeline at 96 bpm in D minor, phase-locked, each
audible over an intensity window. Three of them are the war drums; the fourth
drum-family tier is the dawn bell, out of band. The lead, the horn counter and
the dawn bell are the **same motif** under different development plans, so the
theme escalates instead of three unrelated loops playing.

| stem | type | window | job |
|---|---|---|---|
| `drone` | pads | `0.00 – 1.01` | the bed; alone at a breather |
| `bassRoots` | bass roots | `0.16 – 1.01` | the floor arrives |
| `drumsLow` | drums, sparse | `0.30 – 0.66` | war drums I — a slow taiko pulse |
| `theme` | lead | `0.42 – 1.01` | the siege motif, stated |
| `drumsMid` | drums, straight | `0.56 – 0.90` | war drums II |
| `bassDrive` | bass drive | `0.62 – 1.01` | eighths under the drums |
| `hornCounter` | counter | `0.70 – 1.01` | the motif again, low and augmented |
| `drumsHigh` | drums, heavy + fills | `0.82 – 1.01` | war drums III |
| `dawnBell` | counter (bell) | `2 – 3` (out of band) | `dawn()` only |

`drone` and both basses are sidechained off the mid war drums, so the low end
breathes with the pulse instead of fighting it.

The measured LUFS at every intent point, the per-event magnitudes, and the
proof that both are monotone are in `.audio-evidence/check-music.txt`, which is
committed. Run `node scripts/check-music.mjs` to reproduce every number and
`node scripts/render-audio-evidence.mjs` to regenerate the WAVs and the plots.
