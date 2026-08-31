# TRAPS.md — lessons this project already paid for

Scene-pipeline convention: every trap was a real defect that shipped past a
green gate or cost a debugging round. Read before extending anything; add a
row when you pay for a new one. (Gate-calibration lessons evaporate fastest —
that is why this file exists.)

## Gate calibration

The review-r1 lesson, verbatim: "registration is not an interaction, wiring
is not perceptibility, frustum is not legibility, a sim's information state
must match the player's" (nightbloom-play-review-r1).

| Trap | The rule |
|---|---|
| "Feed the koi" prompted at world origin: absolute coords baked into merged geometry left the hitbox MESH origin at (0,0,0), and `getWorldPosition()` is what the proximity prompt uses | Kit geometry is LOCAL, position goes on the mesh/group. And a gate locating a change uses the changed object's Box3 centre — object origins lie for baked meshes in both directions. |
| The interaction diff flagged a shrine bell petal in every later test — one interaction's reset() didn't restore everything, and the leak read as other actions' effects | Diff only what THIS action changed: snapshot before firing and exclude objects already differing between control and treatment. A lockstep control scene makes ambient animation cancel; per-action re-baselining makes leaky resets cancel too. |
| Mean-color separation scored a MARKED elite illegible (the dark body swamps 30 bright marker pixels) and an UNMARKED elite legible (a dark blob on lit ground is high-contrast) | Contrast is not identity. An "elite reads as elite" term counts dedicated marker pixels on screen (second ID channel in the ID pass); per-pixel p90 distance serves chaff, whose bodies are uniform. |
| The camera pullback probe from the head cleared over a shutter that hid the whole body; and a 1.2m minimum pull parked the camera behind a towel 1.0m away | Occlusion probes must cover what has to be visible (head AND waist), and the minimum pull-in must be smaller than the nearest prop you accept between camera and player. |
| Elite legibility measured ZERO frames: the 20s default segment ended before the first elite spawn (120s), and the old check bot died at ~70s anyway | A gate's segment must CROSS the events it claims to judge, and its bot must be strong enough to get there — assert sample counts (eliteFrames, legSamples floors), never trust a mean over an empty set. |
| Time-to-see measured on every off-screen period made a passing camera fail (p90 6.7s) | Measure **spawn → FIRST sight** only. Re-entries are pursuit dynamics — a kiting player always has trailing threats off-frame — not camera failure. |
| A single sparse frame (1 of 3 enemies visible) failed the whole visibility gate | Ratio metrics need population floors and percentiles: sample only frames with **≥5 live**, gate on **p10**, never a single-frame min. |
| The play-camera check froze at the level-up pause and sampled a static scene for 1000+ frames | A gate's bot may auto-pick through player pauses — the no-RNG-choice rule binds **players**, not measurement bots. Exclude scripted transitions (camera lerp) from samples. |
| A sight corridor whose endpoint was its own subject failed against the subject | Corridors end **short of** what they exist to show; the vista/landmark raycast owns the subject itself. |
| The vista ray to a torii "hit nothing": a gate's bbox centre is open air | Subject-aimed rays target bbox centres. Give hollow-centred landmarks something solid there (the 額 plaque) or the camera gate cannot read them. |
| "TTK" measured spawn→death graded geography: it included the ~6s walk from the spawn ring | TTK is **first-damage → death**. Any lifetime metric must state which clock starts it. |
| TTK medians under a kiting bot graded the bot, not the enemy (strafe-orbit lands ~1 hit/pass; residual floor ~5-7s on tanky chaff) | Use p25 (committed engagements), know the instrument's floor, and never tune game data to fix a bot artifact — the 42→30hp cut was the real signal; the rest was the bot. |
| A curve checkpoint asked about slimes at minute 4 — waves stop spawning them at 2:30 | A designed-curve point must name an enemy that EXISTS in that wave phase. |
| Bot-vs-bot "skill headroom" measured my bot-writing, not the design (three router rewrites, all ~1.0×) | Name the SKILL AXIS first. Planning games: information-advantage bots (oracle vs reactive). Execution games: actuation-noise profiles (reaction delay + aim jitter) on the SAME policy — expert 120ms/4° vs novice 340ms/16°. Perfect-execution bots cannot express execution skill at all. |
| Oracle pre-positioning had NEGATIVE value in a dash game | When the movement verb is also the scoring instrument, repositioning spends the score resource — plan-ahead gates are meaningless for such designs; that's a design classifier, not a failure. |
| The bundle recorded `__playCheck` PASS; the reviewer's run of the SAME gate returned FAIL (visibleFrac 0.805 / p10 0.571 / p90 4.17) | An in-page gate that inherits caller state measures the caller, not the game. `__playCheck` used to keep whatever battle it was called during: a fresh call sampled the sparse 0–20s opening wave (p90 first-sight 0.77s, PASS) while a call on a live mid-fight — which is what a reviewer who has been playing has — sampled dense waves whose slow spawns walk >4s into frame (measured 5.5s at t=40s start), on an unseeded Run besides. Root cause was START STATE, not tick()-vs-rAF (both drive the same synchronous tick loop). The fix: a gate makes its own canonical state — dispose the running battle, fixed entry + yaw, seeded rng (instrument exemption), segment long enough to cross the phases it claims (140s crosses the first elite). Verified drive-independent: identical results fresh, repeated, and after manual key-driven play. |
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
- **Skill axis is a first-class contract field**: every loop contract declares
  its axis — planning | reaction | execution | hybrid — and the headroom
  instrument that axis pays for (planning: oracle-vs-reactive; execution:
  actuation-noise profiles, e.g. expert 120ms/4° vs novice 340ms/16°).
  The gate is chosen by classification, never rebuilt ad hoc per game.
- **Contract amendments** (campaign rule): legal only BEFORE the review
  bundle is cut — the bundle freezes the contract. Every amendment logs the
  original number, the new number, and the design change that invalidated
  the original ("the gate failed" is never sufficient cause). Window-moves
  and game-fixes must be distinguishable in the log. The independent review
  AUDITS the amendment log; a judged goalpost-move is a scored process
  finding.
- Commit per fix, from a baseline committed BEFORE the first change.
- Check disk state before redoing a crashed agent's work — it usually survived.
- grep call SITES, not definitions, when verifying something is wired.
