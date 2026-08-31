# REVIEW-BUNDLE — ONE NPC, ONE ERRAND (battery B3)

Factual launch + instrumentation only. Loop contract: LOOP-CONTRACT.md in
this directory (committed before the build, its own commit: 0a0de5c). No
evaluation here.

## Launch

```
cd ~/Documents/ChatGPT/animation/battery
npm run dev        # port 5183
# open http://127.0.0.1:5183/errand.html
```

WASD walk + mouse look (click) + **E** to interact. The errand: talk to the
caretaker by the café, find three candles, relight the lantern string,
return. Progress autosaves; reload the page anywhere to test resume.
`__errand.reset()` clears the save.

## Gates (exit-coded, in-tree)

```
node scripts/check-errand.mjs        # 13 checks
node scripts/check-errand-feel.mjs   # feel table coverage
```

Recorded run (commit 69d58fc): ALL PASS. Highlights, verbatim:

```
PASS  script gestures ⊆ Performer.IMPLEMENTED — 7 gestures used
PASS  unimplemented gesture ("dance") throws
PASS  stage order exact  (meet → find → relight → return → done)
PASS  save/reload at every step (18 forks) — all forks completed
PASS  every ok action is observable (event or state delta) — no silent successes
PASS  every scripted gesture moves rig joints — wave,small_shrug,open_hand,point,tilt_left,nod,bow
feel lint: 8 declared, 8 wired
```

## Instrumentation

- `__errand` — { run, feel, performer, hero, save, sim, reset }.
- `__feelCheck()` — runtime feel-table check against ERRAND_EVENTS.
- `__shot(name, {steps, pos, lookAt})` — advances the sim explicitly
  (capture cadence never depends on rAF), composites the DOM HUD onto the
  frame, saves to .shots/.

## Evidence set (in .shots/, captured through the hooks)

- `er-meet` — dialogue open, caretaker mid-wave, gaze on the player.
- `er-candle` — after first pickup, tracker 1/3.
- `er-reload` — the beat after a HARD page reload mid-errand; tracker shows
  the preserved 1/3 (the persistence proof). Restored snapshot verbatim:
  `{"v":1,"stage":"find","candles":["rack"],"lit":false}`.
- `er-relit` — the lantern string relit (observable world change).
- `er-done` — the bow, mid-thanks.

## Performance seam facts

- Dialogue lines carry Mira acting plans normalized through
  `src/contract.js` at module load; the caretaker performs each line via
  `charforge/src/game/performer.js` (additive overlays over the Actor
  mixer; head gaze tracks the player within 5m).
- Both renderers throw on in-vocabulary-but-unimplemented gestures: the VRM
  renderer (commit \"Mira renderer: 20/20\") and the Performer (probe in
  check-errand.mjs). Performer implements 12/20; the 8 locomotion verbs
  (walk/strafe/turn/jump/dance) belong to the Actor's clip layer, declared
  in `Performer.IMPLEMENTED`.

## Known notes for the reviewer

- The NPC body is the B2 ronin celified through the same bridge spec
  (`src/shared/bridge.js`) in the same kit corner — art questions belong to
  the B2 thread; B3 is the loop.
- Saves land only at stable states (never mid-dialogue-line) by design.
- Skill axis: NONE (declared in the contract) — correctness/integrity
  gates only.
