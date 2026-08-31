# TRAPS.md — lessons this project already paid for

Scene-pipeline convention: every trap was a real defect that shipped past a
green gate or cost a debugging round. Read before extending anything; add a
row when you pay for a new one. (Gate-calibration lessons evaporate fastest —
that is why this file exists.)

## Gate calibration

| Trap | The rule |
|---|---|
| Time-to-see measured on every off-screen period made a passing camera fail (p90 6.7s) | Measure **spawn → FIRST sight** only. Re-entries are pursuit dynamics — a kiting player always has trailing threats off-frame — not camera failure. |
| A single sparse frame (1 of 3 enemies visible) failed the whole visibility gate | Ratio metrics need population floors and percentiles: sample only frames with **≥5 live**, gate on **p10**, never a single-frame min. |
| The play-camera check froze at the level-up pause and sampled a static scene for 1000+ frames | A gate's bot may auto-pick through player pauses — the no-RNG-choice rule binds **players**, not measurement bots. Exclude scripted transitions (camera lerp) from samples. |
| A sight corridor whose endpoint was its own subject failed against the subject | Corridors end **short of** what they exist to show; the vista/landmark raycast owns the subject itself. |
| The vista ray to a torii "hit nothing": a gate's bbox centre is open air | Subject-aimed rays target bbox centres. Give hollow-centred landmarks something solid there (the 額 plaque) or the camera gate cannot read them. |
| "TTK" measured spawn→death graded geography: it included the ~6s walk from the spawn ring | TTK is **first-damage → death**. Any lifetime metric must state which clock starts it. |
| TTK medians under a kiting bot graded the bot, not the enemy (strafe-orbit lands ~1 hit/pass; residual floor ~5-7s on tanky chaff) | Use p25 (committed engagements), know the instrument's floor, and never tune game data to fix a bot artifact — the 42→30hp cut was the real signal; the rest was the bot. |
| A curve checkpoint asked about slimes at minute 4 — waves stop spawning them at 2:30 | A designed-curve point must name an enemy that EXISTS in that wave phase. |
| check-audio flaked 79%→100% between identical runs | Unseeded synthesis. ALL render randomness goes through `seedAudio`/`arand`; gates seed per item. Byte-diff two runs to prove it. |
| A seam-click gate failed a drum loop's downbeat | Compare the seam step to the stem's **own max transient** — an attack at the wrap is music, not a click. |

## Composition / build

| Trap | The rule |
|---|---|
| `scene.js` passed `footprint` without `.depth`; the in-page seam grid silently sampled zero rows | Match the consumer's full shape (`{width, height, depth}`). A gate that samples nothing reports PASS. |
| terrain `surrounds` default baseline (`minLevel − 0.45`) sits under the spatial audit's −0.5 hole floor | Set `terrain.surrounds.y` explicitly; with roughness, dips cross the floor and report as holes owned by nobody. |
| Terrain tone keys are FIXED (`ground/paving/bank/surrounds/shore/skirt/water`) | A plan tone outside that set maps to an undefined material. `sand` → `shore`. |
| Vista camera placed where a district later built a wall | Vista positions are contracts against FUTURE geometry; re-run check-cameras after every district lands. |
| Aliasing `three` to a directory broke `three/addons/*` | Use `resolve.dedupe: ['three']`, never a path alias — the alias bypasses package `exports`. |
| A backgrounded Browser-pane tab reports `innerWidth 0` → 0×0 canvas → 6-byte captures | Every entry sizes with a fallback (`innerWidth \|\| 1280`) and `__shot` takes explicit dimensions. |
| Critter hit-flash tinted a SHARED cached material — every slime on screen flashed | Per-instance feedback uses per-instance state (scale-pop on the root), never a cached material's colour. |
| `boundary features` check is skipped in `--district` mode | A butt-joint agreement is only proven by the full-city run with both neighbours real. |

## Game layer

| Trap | The rule |
|---|---|
| 197 of 199 events discarded unheard while every gate stayed green | Whatever nothing guards is where defects live: every emitted event type needs a consumer, enforced by `check-feel.mjs` (exit-coded). |
| The exploration camera fought a horde battle (1 of 41 threats in frame) | Combat framing is a gated number through the PLAY camera (`__playCheck`); free-camera captures are banned as gameplay evidence. |
| `autoPick()` resolved the genre's defining decision by RNG | No player-facing choice is resolved by RNG — ever. Pause the sim; the player picks. |
| A `setInterval` music loop outlived its scene (audible after server kill) | Audio is scene-owned: `dispose()` ends all sound; "audio continues after exit" is a defect class. |
| Actor time never advanced when driven manually → `lockUntil` froze it in attack pose forever | Drive Actors via `actor.update(dt)` (then re-copy sim-owned position), never `mixer.update` alone. |

## Process

- Builder never scores. Measured self-score inflation in this stack: ~0.2.
- Commit per fix, from a baseline committed BEFORE the first change.
- Check disk state before redoing a crashed agent's work — it usually survived.
- grep call SITES, not definitions, when verifying something is wired.
