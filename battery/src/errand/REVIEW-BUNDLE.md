# REVIEW-BUNDLE — ONE NPC, ONE ERRAND (battery B3, round 3)

Factual launch + instrumentation only. Loop contract incl. A0 (record
corrections) and A1 (round-3 contract): LOOP-CONTRACT.md at 0705b98
(13:32), BEFORE the round-3 code: shared substrate 3b84c3c (Performer
blend-out / SHAPE / bow sign / pacing, Hero.orbitDist) and 56be3e4
(celify), entry db877fb. No evaluation here.

## Launch

```
cd ~/Documents/ChatGPT/animation/battery
npm run dev        # port 5183
# open http://127.0.0.1:5183/errand.html
```

WASD walk + mouse look (click) + **E**. Evening light from the start. The
relight swings and holds the camera on the string for 1.5 s.

## Gates — output PASTED from the runs at db877fb (all ALL PASS)

```
node scripts/check-errand-shell.mjs      # headless Chrome; asserts on its own frames
```
```
PASS  at accept: stage find, tracker live, 3 candles visible, save says find — stage find, tracker "Find the fallen candles — 0/3", candles 3, save.stage find
PASS  after pickup: tracker 1/3 immediately, candle gone, save has it — tracker "Find the fallen candles — 1/3", visible step,toro, saved ["rack"]
PASS  walked 3 m before the reload @ mid-errand (1/3 candles) (save caught it) — saved x -2.2 vs walked-to -2.2
PASS  continuous == post-reload @ mid-errand (1/3 candles) (incl. position) — stage find, candles step/toro, lit false, at -2.2,-1.6
PASS  relight: string lit in-world and in-save — lit true
PASS  relight PAYOFF VISIBLE from the interaction spot: lantern-glow pixels ≥ 0.5% of the captured frame — 2.69% of the frame (ID pass, play camera, camera was facing away before the press)
PASS  camera hold released
PASS  walked 3 m before the reload @ after relight (save caught it) — saved x 2.0 vs walked-to 2.0
PASS  continuous == post-reload @ after relight (incl. position) — stage return, candles none, lit true, at 2,0.2
PASS  errand done and saved done — stage done
PASS  walked 3 m before the reload @ after completion (save caught it) — saved x 4.8 vs walked-to 4.8
PASS  continuous == post-reload @ after completion (incl. position) — stage done, candles none, lit true, at 4.8,-1.6
PASS  burning string reports glow, never dark — string-glow
PASS  corrupt save (bogus stage) -> live run at stage meet — stage meet, x 2.3
PASS  corrupt save (done + lit:false) -> live run at stage meet — stage meet, x 2.3
PASS  corrupt save (player strings) -> live run at stage find — stage find, x 2.3
PASS  corrupt save (player NaN) -> live run at stage find — stage find, x 2.3

ALL PASS
```

```
node scripts/check-performer-shape.mjs   # signed direction per verb + blend-out (tail)
```
```
PASS  "bow" moves in its signed direction at the peak — spine.x− head.x+
PASS  blend-out: max single-frame upperArmR delta on a mid-wave line advance ≤ 0.35 rad — 0.243 rad/frame (arm was at 2.21 rad)

ALL PASS
```

```
node scripts/check-performer-soak.mjs
```
```
PASS  every joint bounded through 60s (max < π rad) — max |rot| 2.24 rad (upperArmR)
PASS  back at rest after the performance (±0.02 rad vs control actor) — worst residue 0.0004 rad (head)

ALL PASS
```

```
node scripts/check-errand.mjs            # pure rules (13 checks) — tail
```
```
PASS  save/reload at every step (18 forks) — all forks completed
PASS  every ok action is observable (event or state delta) — no silent successes
PASS  every scripted gesture moves rig joints — wave,small_shrug,open_hand,point,tilt_left,nod,bow
PASS  gaze turns the head

ALL PASS
```

Drift: `PASS  errand: RADIUS contract=1.7 code=1.7` (recorded, not designed — A0).

## The r2 findings, mechanically

| r2 finding | measured then | now |
|---|---|---|
| payoff unseen from the interaction spot (lanterns at NDC y 1.35–1.48; flash 350 ms; no text); gate passed from a flag | lantern pixels in the captured frame: 0 | camera swings to the string's centroid, dollies 4.4 → 2.4 m and holds 1.5 s; "the string wakes" text; the flash decays onto a persistent glow (7); gate asserts lantern-glow ID-pass share of ITS OWN frame from the spot with the camera facing away before the press: **2.69 %** (≥ 0.5 %) |
| bow head sign inverted (+0.729 chin-up), gaze craning | — | bow = torso forward AND head down; gaze damped to zero over the bow; SHAPE gate: every verb's signed direction at its peak vs a control actor |
| 126° single-frame arm snap on a mid-envelope line advance | 2.2 rad/frame | 0.15 s cross-fade in `direct()`, both envelopes functions of time: **0.243 rad/frame** (≤ 0.35) |
| 3 of 9 lines finished acting before the text | 3/9 | `minDuration = text.length / 42 × 0.9` — the pose outlives the typewriter on every line (0/9 by construction; the reviewer can time it) |
| position saved at six events only (5.6 m teleport on F5) | 5.6 m | saved every 0.5 s while moving and on the move→idle edge; the gate WALKS 3 m before every reload and compares position |
| corrupt player array bricked the run; `done + lit:false` restored verbatim | bricked | shell payload validated (`Number.isFinite`, bounds); `return/done ⇒ lit`, `relight+ ⇒ 3 candles`, `meet/find ⇒ !lit`; four corrupt variants → live fresh runs |
| sun 2.0 + gold sky at "evening"; a dark string under daylight | — | DayNight 'dusk' from the start; dark lanterns are not practicals (the night pool casts nothing under an unlit string) |
| bursts at y = 1.1; candles pop in; Look on the string = ui-deny | — | per-event heights; spawn puff on accept; Look = soft tick + "still dark — N more"; a look returns `ok:false` |
| observability gate passed `{ok:true}` on a refused press | — | `ok:true` only for a state change or a truthful event |

## Instrumentation

- `__errand` — { run, feel, performer, hero, save, sim, daynight,
  candlesVisible(), stringLit(), holding, reset() }.
- `__lanternPixelShare()` — ID-pass share of the current play-camera
  frame covered by the lantern glow meshes (what the gate asserts on).
- `__shot()` — canvas-only debug capture; NOT evidence.

## Evidence (REAL frames, play camera only, .shots/, A0's declared set)

er3-open, er3-meet, er3-reload (after a 3 m walk + hard reload),
er3-relit (from the interaction spot, during the hold), er3-done —
captured by `check-errand-shell.mjs` itself at db877fb.

## Known notes

- The caretaker's body is now stepped/faceted by the shared bridge
  (56be3e4) — the B2 thread owns that look.
- Idle-gesture cadence for lines longer than one gesture is not built;
  A1's pacing uses the stretched envelope only.
- Feel lint is still a regex over the table (disclosed); the ladder
  form from B1 is not applied here (B3 has no ladder contract).
