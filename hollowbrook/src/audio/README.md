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

`onProgress(frac, label)` fires per stem and per SFX (54 steps). **Measured in
this browser: 2.95 s for the score, 0.30 s for the 45-sound bank**, the same as
Node. It is a loading-screen job, not a first-frame job, and `composeAdaptiveLoop`
renders all six pitched tiers in ONE synchronous call which cannot be
interleaved — splitting it would restart the seeded RNG per tier and the
browser's bytes would stop matching the gate's.

Two things worth knowing about the load:

* The context is opened with `{ sampleRate: 44100 }`. Left alone this machine
  opened it at 48 kHz and WebAudio resampled every buffer on playback, so what
  the player heard was not quite what the gate measured.
* Yields are every third stem and every twelfth sound, not every item. A hidden
  tab clamps chained `setTimeout(0)` to roughly a second, and yielding per item
  turned the same 3.2 s of DSP into a **14.2 s** load in a background tab.

Returns the audio singleton. `isReady()` is the synchronous test, and
`_internals()` hands back the live graph for `lab.html` — not for game code.

### `setIntensity(x, ramp = 0.9)`

`x` is the ONE number from `LOOP-CONTRACT.md`'s intent curve, clamped 0..1. The
music's nine tier stems crossfade by their intensity windows; `ramp` is the
seconds-scale time constant. Cheap — safe to call every frame.

`getIntensity()` returns the last value set.

### `play(name, opts = {})`

`name` is any key of `MAGNITUDE`, or any key of `ALIASES` (see below — 45
sounds: the 13 ladder events, the contract's ten also-declared events, the five
telegraphs, three surfaces, two builds, the UI and dialogue blips, and the nine
more that `src/game/feeltable.js` names). Unknown names warn once, return
`false`, and are caught by the gate before they can reach a player.

| opt | default | meaning |
|---|---|---|
| `pitch` | `1` | playback-rate multiplier; a small seeded jitter is added on top |
| `pan` | `0` | −1 … 1, hard left to hard right |
| `gain` | `1` | multiplies the **table's** level; leave it at 1 |
| `pos` | — | `[x, y, z]` world position of the event |
| `listener` | — | `[x, y, z]` world position of the player |
| `yaw` | `0` | player yaw, `atan2(-dx, -dz)` convention (0 looks along −Z) |
| `duck` | auto | dip the music to 55 % for 0.42 s; auto when `MAGNITUDE ≥ -16 dB`, i.e. the multi-kill, the wave clear, the Captain, the bell, a lost light and a barricade going up |

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

| stem | type | window | stem LUFS | job |
|---|---|---|---|---|
| `drone` | pads | `0.00 – 1.01` | −19.95 | the bed; alone at a breather |
| `bassRoots` | bass, roots | `0.16 – 1.01` | −16.92 | the floor arrives |
| `drumsLow` | war drums I | `0.30 – 0.72` | −24.35 | a slow ōdaiko pulse and one tom answer |
| `theme` | lead (siege horn) | `0.42 – 1.01` | −14.25 | the motif, stated |
| `drumsMid` | war drums II | `0.56 – 1.01` | −23.31 | the march — it never leaves again |
| `bassDrive` | bass, drive | `0.62 – 1.01` | −18.23 | eighths under the drums |
| `hornCounter` | counter (low horn) | `0.72 – 1.01` | −18.37 | the same motif, an octave down, sparser |
| `drumsHigh` | war drums III | `0.85 – 1.01` | −22.41 | the storm, with a fill into the wrap |
| `dawnBell` | counter (keep bell) | `2 – 3` — out of band | −18.46 | `dawn()` only |

`drone`, `bassRoots` and `bassDrive` are sidechained off `drumsMid`, so the low
end breathes on the same pulse at every intensity that has drums.

Mixed loudness at the contract's own intent points, which is what the gate
asserts is monotone:

| point | 0.22 | 0.30 | 0.50 | 0.58 | 0.68 | 0.80 | 0.88 | 0.90 | 1.00 |
|---|---|---|---|---|---|---|---|---|---|
| LUFS | −22.21 | −20.20 | −17.07 | −16.48 | −15.93 | −15.06 | −14.83 | −14.74 | −14.49 |
| onsets/s | 0 | 0 | 1.05 | 1.40 | 2.85 | 3.45 | 4.05 | 4.50 | 5.66 |

**Memory.** Nine 20 s stereo stems plus 45 one-shots decode to about **83 MB**
of Float32 AudioBuffer (63.5 score + 19.7 bank). The only levers on the score
half are the bar count and the tier count; the gate caps it so a tenth tier is
a visible failure rather than a silent regression.

Every number above comes from `node scripts/check-music.mjs`, whose output is
committed at `.audio-evidence/check-music.txt`. `node scripts/render-audio-evidence.mjs`
regenerates the WAVs, the loudness plot and the spectrogram, and rewrites
`magnitude.js`; `src/audio/lab.html` (served by `npm run dev`) is the same
interface driven from a real WebAudio graph.

**Nobody has listened to any of this.** Every claim here is a measurement of
the rendered buffers plus what the two plots show.

---

## Names, aliases, and the adapter the game asks for

`src/game/feeltable.js` names sounds by what they mean (`bolt-fire`,
`kill-heavy`, `bell`) and `src/game/INTERFACES.md` says a mapping lives on the
game side. It lives **here** instead, because the bank is the thing that knows
what it has: `play()` resolves through `ALIASES` before it looks in the bank,
both spellings work, and a name nothing can serve is one failing gate line
(`bank:serves-feeltable`) rather than a `console.warn` in a running game.
All 33 names the feel table uses resolve today, 15 of them through:

`bolt-fire` → `bolt-fired` · `lance-fire` → `lance-fired` · `kill-light` → `kill-cutpurse` · `kill-heavy` → `kill-reaver` · `hurt` → `player-hurt` · `multikill` → `lance-multikill` · `wave-clear` → `wave-cleared` · `bell` → `bell-rung` · `door` → `npc-sheltered` · `barricade` → `barricade-up` · `brazier` → `brazier-lit` · `hex-charge` → `hexer-telegraph` · `ui-open` → `ui-confirm` · `ui-close` → `ui-back` · `ui-line` → `blip-mid`

`play()` also accepts the feel table's own `{ vol, rate }` spelling alongside
`{ gain, pitch }`, so no table of sixty entries has to be renamed.

`audioAdapter()` returns exactly the shape `attachAudio()` expects:

```js
{ music: { setIntensity, dawn, setVolume, stop },
  sfx:   { play, footstep, buffers /* Map */, magnitude, aliases } }
```

It returns `null` until `initAudio()` has resolved.

---

## The SFX magnitude table — what the game reads instead of guessing a gain

`magnitude = impactDb + 4·lowShare`, where `impactDb` is the K-weighted energy
*integral* (loudness × duration) and `lowShare` is the fraction of energy under
250 Hz. Integrated LUFS is **−Infinity** for anything shorter than 400 ms and
most of this bank is shorter than that, which is why the column is not LUFS;
`src/audio/metrics.js` carries the derivation. The machine-readable version,
with a SHA-256 per sound, is `src/audio/magnitude.js`.

### the contract's thirteen, in rank order

| rank | event | class | magnitude dB | peak dBFS | dur s | lowShare | centroid Hz | attack ms |
|---|---|---|---|---|---|---|---|---|
| 1 | `bolt-fired` | combat | **-38.41** | -17.29 | 0.105 | 0.091 | 3463 | 4.3 |
| 2 | `bolt-miss` | combat | **-35.96** | -21.24 | 0.180 | 0.61 | 2301 | 1 |
| 3 | `bolt-hit` | combat | **-33.02** | -18.83 | 0.220 | 0.791 | 691 | 0.8 |
| 4 | `lance-fired` | heavy | **-30.01** | -17.09 | 1.170 | 0.91 | 2770 | 0.6 |
| 5 | `kill-cutpurse` | combat | **-27.51** | -17.21 | 1.190 | 0.799 | 994 | 58 |
| 6 | `player-hurt` | combat | **-25.47** | -13.67 | 0.490 | 0.597 | 3636 | 24.4 |
| 7 | `kill-hexer` | heavy | **-23.51** | -9.97 | 1.370 | 0.274 | 2269 | 30.3 |
| 8 | `kill-reaver` | heavy | **-20.97** | -11.46 | 1.250 | 0.881 | 688 | 107.7 |
| 9 | `kill-shieldbearer` | heavy | **-18.49** | -7.11 | 1.750 | 0.79 | 1497 | 23.9 |
| 10 | `lance-multikill` | heavy | **-15.47** | -7.28 | 1.810 | 0.93 | 1788 | 115.2 |
| 11 | `wave-cleared` | voice | **-12.21** | -3.01 | 2.660 | 0.472 | 3890 | 109.3 |
| 12 | `kill-captain` | toll | **-10.33** | -1.13 | 3.200 | 0.827 | 1140 | 40.5 |
| 13 | `bell-rung` | toll | **-8.65** | -0.5 | 6.400 | 0.537 | 714 | 9.4 |

Steps are 1.6 to 3.3 dB. The two shape rules the contract states hold by
measurement, not by intent: `bolt-miss` (−35.96) never outranks `bolt-hit`
(−33.02), and `player-hurt` (−25.47) sits under every kill above it.

### the other 32 — the contract's declared events, the telegraphs,
### the three surfaces, the builds, the UI and the game layer's own list

| rank | event | class | magnitude dB | peak dBFS | dur s | lowShare | centroid Hz | attack ms |
|---|---|---|---|---|---|---|---|---|
| — | `light-lost` | toll | **-17.33** | -7.72 | 3.000 | 0.459 | 475 | 58.3 |
| — | `defeat` | toll | **-17.72** | -7.78 | 3.200 | 0.269 | 612 | 236.8 |
| — | `objective-start` | voice | **-27.67** | -15.69 | 1.640 | 0.004 | 2755 | 247.5 |
| — | `objective-done` | voice | **-23.81** | -12.96 | 2.100 | 0.004 | 3115 | 375.1 |
| — | `npc-sheltered` | foley | **-29.02** | -15.21 | 0.230 | 0.904 | 1891 | 23.3 |
| — | `barricade-up` | world | **-16.24** | -6.72 | 1.360 | 0.937 | 2400 | 253.4 |
| — | `brazier-lit` | world | **-23.99** | -11.22 | 2.200 | 0.874 | 3134 | 41.3 |
| — | `reload` | world | **-28.7** | -15.5 | 0.575 | 0.177 | 3866 | 13.8 |
| — | `lance-charge` | charge | **-24.12** | -14.63 | 1.110 | 0.256 | 3547 | 809.1 |
| — | `hexer-telegraph` | charge | **-24.6** | -15.77 | 1.620 | 0 | 2220 | 555.7 |
| — | `tele-cutpurse` | combat | **-32.77** | -19.97 | 0.230 | 0 | 4244 | 33.7 |
| — | `tele-reaver` | combat | **-22.26** | -10.7 | 0.390 | 0.718 | 4072 | 54.4 |
| — | `tele-shieldbearer` | combat | **-26.07** | -11.29 | 0.470 | 0.25 | 1582 | 1.7 |
| — | `captain-dash` | combat | **-19.17** | -6.86 | 0.520 | 0.619 | 3196 | 35.7 |
| — | `step-stone` | foley | **-42.3** | -22.75 | 0.100 | 0.742 | 2970 | 5.3 |
| — | `step-timber` | foley | **-37.74** | -25.37 | 0.160 | 0.921 | 753 | 1.3 |
| — | `step-grass` | foley | **-42.95** | -23.24 | 0.135 | 0.211 | 3627 | 2.1 |
| — | `blip-low` | ui | **-42.36** | -24.52 | 0.100 | 0.004 | 1134 | 19.2 |
| — | `blip-mid` | ui | **-42.54** | -24.49 | 0.100 | 0 | 1174 | 17.5 |
| — | `blip-high` | ui | **-42.61** | -24.46 | 0.100 | 0 | 1449 | 15.6 |
| — | `ui-click` | ui | **-36.27** | -18.02 | 0.100 | 0 | 6295 | 11.2 |
| — | `ui-confirm` | ui | **-30.44** | -10.53 | 0.340 | 0 | 4205 | 1.1 |
| — | `ui-back` | ui | **-36.1** | -19.36 | 0.220 | 0 | 3266 | 20.3 |
| — | `wave-start` | voice | **-14.72** | -7.7 | 2.400 | 0.735 | 613 | 55.1 |
| — | `breather` | voice | **-28.01** | -16.86 | 2.000 | 0.061 | 494 | 119.5 |
| — | `captain-arrives` | swell | **-12.4** | -6.43 | 3.100 | 0.965 | 624 | 563 |
| — | `captain-retreat` | voice | **-21.03** | -13.29 | 2.400 | 0.638 | 442 | 177.2 |
| — | `lance-hit` | combat | **-22.94** | -11.06 | 0.490 | 0.894 | 1430 | 1.8 |
| — | `hex-hit` | combat | **-24.61** | -10.24 | 0.390 | 0.298 | 2594 | 20.5 |
| — | `player-dead` | toll | **-10.76** | -2.63 | 3.120 | 0.906 | 335 | 132.6 |
| — | `bell-pull` | foley | **-36.06** | -24.71 | 0.410 | 0.562 | 1893 | 76.1 |
| — | `ui-deny` | ui | **-35.24** | -20.56 | 0.165 | 0.001 | 1588 | 25.1 |
