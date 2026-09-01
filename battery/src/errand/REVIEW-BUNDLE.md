# REVIEW-BUNDLE — ONE NPC, ONE ERRAND (battery B3, round 2)

Factual launch + instrumentation only. Loop contract: LOOP-CONTRACT.md
(0a0de5c). Round-2 implementation: 5a18ded (+ TRAPS rows in d32b313). No
evaluation here.

## Launch

```
cd ~/Documents/ChatGPT/animation/battery
npm run dev        # port 5183
# open http://127.0.0.1:5183/errand.html
```

WASD walk + mouse look (click) + **E**. Spawn faces the caretaker. Progress
(quest + player position) autosaves; reload anywhere. `__errand.reset()`.

## Gates (exit-coded, in-tree)

```
node scripts/check-errand.mjs           # pure rules: vocabulary, walkthrough, 18 forks, observability
node scripts/check-errand-shell.mjs     # SHELL save path in headless Chrome (real keys, real reloads, real localStorage)
node scripts/check-performer-soak.mjs   # 60s every verb/posture/gaze: bounded + back at rest vs control actor
node scripts/check-errand-feel.mjs      # feel coverage
node scripts/check-contract-drift.mjs   # constants block vs code
```

Recorded run at 5a18ded, verbatim highlights:

```
PASS  every joint bounded through 60s (max < π rad) — max |rot| 2.24 rad (upperArmR)
PASS  back at rest after the performance (±0.02 rad vs control actor) — worst residue 0.0004 rad (head)

PASS  at accept: stage find, tracker live, 3 candles visible, save says find (the r1 ordering bug)
PASS  after pickup: tracker 1/3 immediately, candle gone, save has it
PASS  continuous == post-reload @ mid-errand (1/3 candles)
PASS  relight: string lit in-world and in-save
PASS  continuous == post-reload @ after relight
PASS  errand done and saved done
PASS  continuous == post-reload @ after completion
PASS  burning string reports glow, never dark
PASS  corrupt save -> fresh run, shell alive
```

## The r1 blockers, mechanically

| r1 finding | measured then | now |
|---|---|---|
| Performer spine integrator (`rotation.x +=` on an undriven joint) | −7.2 rad/s; headless caretaker by line 3 | stateless per frame: undriven joints reset to rest, every envelope zero at both ends (ramp-and-hold verbs replaced with rise-hold-fall); soak residue 0.0004 rad vs a control actor over 62 s |
| Save ordering (handlers ran before `advance()` mutated stage) | tracker stale, candles invisible, save said "meet" at accept | rules mutate THEN emit; shell gate asserts tracker/candles/save AT the moment of accept during continuous play, then reload-equivalence at three checkpoints |
| Persistence gate serialized the pure layer | shell bug invisible by construction | `check-errand-shell.mjs` drives the shell with `page.keyboard`, reloads the page, reads `localStorage` |

## Ranked fixes (r1 list)

spawn faces the caretaker (yaw 0.15; forward = (−sin, −cos)); relight
payoff: rising spark column from eye level + warm practical flash + bursts
at each lantern's geometry center; truthful string (`string-glow` event; a
burning string never reports dark; `{ok, lit:true}`); dead `setState('talk')`
removed; `tenantOf` throws on unknown ids and the corner is now actually
`kissaten` (喫茶 月見); corrupt saves yield a fresh run; player position +
yaw persisted; `occluderRoot` passed (camera pullback armed) here and in
celbridge.

## Evidence (REAL compositor frames, play camera only, .shots/er2-*.png)

er2-open (opening frame), er2-meet (dialogue open), er2-reload (the beat
after a hard page reload; tracker 1/3), er2-relit (from the interaction
spot; spark column + flash), er2-done (bow). Captured by
`check-errand-shell.mjs` itself — the gate and the evidence are one run.
The hand-drawn HUD composite is gone; `__shot` is canvas-only and labeled
debug.

## Known notes

- The NPC body is the B2 ronin through the shared bridge spec — art
  questions belong to the B2 thread.
- Feel lint still counts wire calls (coverage); the effect-verification
  form is a TRAPS rule, not yet a gate here.
- Skill axis: NONE (declared).
