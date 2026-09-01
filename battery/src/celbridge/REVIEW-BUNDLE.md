# REVIEW-BUNDLE — THE CEL BRIDGE (battery B2, round 3)

Factual launch + instrumentation only. Look contract incl. Amendments A1,
A2: LOOK-CONTRACT.md in this directory. A2 was committed at 78b848c BEFORE
the round-3 implementation (6dac816). No evaluation here.

## Launch

```
cd ~/Documents/ChatGPT/animation/battery
npm run dev        # port 5183
# open http://127.0.0.1:5183/celbridge.html
```

WASD walk + mouse orbit (click); spawn now faces the ronin. **B** toggles
the bridge (materials AND graded vertex colors). **N** toggles night.

## Gates (exit-coded, in-tree)

```
node scripts/check-celbridge.mjs            # albedo-space STRUCTURAL gate
node scripts/check-celbridge-rendered.mjs   # judging-space gate (headless Chrome)
```

Round-3 run at 6dac816, verbatim highlights:

```
teeth: violator fails the world band — 30°=37.4% 135°=25.2%
teeth: owned-band violator exceeds the owned satCap too
teeth: guard corrections on the violator EXCEED the budget — corrected 100.0%, max Δsat 0.53
authoring conforms without the guard — corrected 0.0% of 9423 samples, max Δsat 0.000
albedo pixels: satP50 0.158, satP90 0.396, non-accent P90 0.370

day/meet:      char sat p90 0.479 vs world p99 0.915
day/portrait:  char sat p90 0.532 vs world p99 0.524   (gate margin +0.02)
day/far:       char sat p90 0.435 vs world p99 0.456
night/meet:    luma ratio 1.034   night/portrait: 1.499   night/far: 1.161
```

## The A2 numbers, moved or not (builder states facts; review judges)

| A2 named | r2 measured | r3 measured | note |
|---|---|---|---|
| portrait char sat p90 | 0.633 | 0.532 | target ≤0.52 NOT fully met (+0.012). Hot-pixel hue histogram at portrait: hair band (195–270°) = 0 pixels; remaining hot pixels are hue 30° (lit skin, 6595 samples) and 0° (scarf lit side, 671). Skin albedo sat 0.45→0.32 moved rendered p90 only 0.540→0.532: the residual is the warm key light on warm skin, not authoring. Declared rather than chased into pallor. |
| hair vertex entries changed | 0/30 | all (source re-authored) | hair gradient #222c52→#6d82c4 became #303852→#7f8fc4; hairFlat #2c3a6e→#414a6e |
| iris | e8d48c (olive) | a78d68 (deep amber-brown, hue 35° kept) | guard now pushes value, never hue |
| portrait-night luma ratio | 2.015 | 1.499 | seat 0.45→0.58, measured at all three cameras |
| guard/census coupling | census tested the guard's output | guard corrections on the ronin = 0.0%; teeth on a synthetic violator | |

## Instrumentation

- `__renderedBand(cam, phase)` — char vs world rendered sat/luma
  percentiles + `hotHues` histogram; cams meet/portrait/far.
- `__nightSeat()` — unchanged from r2 (same-instrument continuity).
- `__frame(cam, phase, bridged)` — parks a contract camera for a real
  `page.screenshot`; `scripts/capture-celbridge-evidence.mjs` writes the set.
- `__census()` — albedo census with BRIDGE thresholds.

## Evidence (REAL compositor frames, .shots/cb3-*.png)

cb3-meet, cb3-portrait, cb3-far, cb3-ab-raw (meet, bridge OFF),
cb3-portrait-raw, cb3-night-meet, cb3-night-portrait, cb3-night-meet-raw
(same-instrument night A/B). No hand-drawn composites.

## Known open (declared)

- Ink edge weight on the character (~22% heavier at matched depth): needs
  a selective buffer in the single global ink pass. Unchanged.
- Portrait char sat p90 0.532 vs A2's ≤0.52 (see table).
- Parked for Phase 2 / Stage C: 4-head chibi proportion vs realistic props.
