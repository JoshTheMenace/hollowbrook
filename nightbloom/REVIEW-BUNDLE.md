# REVIEW-BUNDLE — Nightbloom night mode (inaugural independent play review)

Factual launch + instrumentation notes only. The loop contract is
LOOP-CONTRACT.md (read it first); TRAPS.md documents gate calibrations.
This file contains no evaluation.

## Launch

```
cd ~/Documents/ChatGPT/animation/nightbloom
npm run dev          # port 5178
# open http://127.0.0.1:5178/game.html
```

## Controls

- Click the canvas once: unlocks audio (adaptive music + SFX load ~10s;
  console logs "[game] audio unlocked: 9 stems + 14 sfx") and pointer-lock
  for mouse orbit.
- WASD move, Shift run, mouse orbit (or arrow keys), E interact, R reset.
- T cycles day → dusk → night. Entering night starts the battle in the
  festival arena (the hero teleport-clamps into the rect). Night ends on
  victory (480s) or defeat, then fades back to day.
- Level-ups pause the fight; pick with 1/2/3 or click.

## Instrumentation (all in the page, all measured through the play camera)

- `window.__playCheck(seconds)` — scripted battle segment; returns
  {visibleFrac, p10Frac, p90TimeToSeeSec, pass}.
- `window.__latencyCheck()` — key event → position response in ticks.
- `window.__feelCheck()` — runtime event-consumer lint (array of problems).
- `window.__gshot(name, w, h, {pos, lookAt})` — frame capture to .shots/
  (for REVIEW evidence use the default no-pos form: it captures the play
  camera as-is; free-camera captures are banned as gameplay evidence).
- `window.__tick(dt)` + `window.__game.hero.virtual.move = {x, z}` — headless
  stepping and a bot movement channel; `window.__game` exposes hero, battle,
  daynight, vignette.

## Gates and their current recorded state (facts, not judgment)

```
node scripts/check-feel.mjs        # feel lint
node scripts/check-city.mjs        # town integration
node scripts/check-cameras.mjs     # vista cameras
node scripts/check-game.mjs        # game vocabulary — 2 recorded FAILs:
                                   #   arena cover 0/3, elevation 0/1
cd ../charforge && node scripts/simulate-run.mjs   # balance + designed curves
cd ../charforge && node scripts/check-audio.mjs    # audio
```

The two check-game FAILs are declared in city-plan.json's game block comment.
