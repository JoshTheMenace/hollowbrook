# REVIEW-BUNDLE — INTENSITY RIDE (battery B4, round 2)

Factual launch + instrumentation only. Loop contract incl. A1–A6:
LOOP-CONTRACT.md. A6 at 228ad07 (14:04) BEFORE the round-2 code; shared
substrate ee984ca (FixedStep + InputTape); entry a0d2f1b. Round 1 was
daaef2b (bundle 11e625e). Commit hygiene note: this entry's commit was
first cut as 20a5c9c in a series where the preceding B1 commit had
swallowed foreign staged files; the series was rewritten (a0d2f1b) — see
the B1 bundle. No evaluation here.

## Launch

```
cd ~/Documents/ChatGPT/animation/battery
npm run dev        # port 5183
# open http://127.0.0.1:5183/ride.html
```

## Gates — output PASTED from the runs at e54f504 (tree identical to a0d2f1b for this entry)

```
node scripts/check-ride-replay.mjs      # headless Chrome; the reproducibility gate (A6)
```
```
recorded: 4789 ticks, 4773 moves, 7 checkpoints, kills 32, dropped 0.0000s
PASS  recording produced checkpoints and moves
PASS  replay @ 30 fps: 7 checkpoints byte-identical — kills 32 (recorded 32), dropped 0.0000s
PASS  replay @ 60 fps: 7 checkpoints byte-identical — kills 32 (recorded 32), dropped 0.0000s
PASS  replay @ 90 fps: 7 checkpoints byte-identical — kills 32 (recorded 32), dropped 0.0000s
PASS  replay @ 144 fps: 7 checkpoints byte-identical — kills 32 (recorded 32), dropped 0.0000s
PASS  replay @ jittered 30-70 fps: 7 checkpoints byte-identical — kills 32 (recorded 32), dropped 0.0000s

ALL PASS
```

```
node scripts/check-ride-camera.mjs      # headless Chrome, play camera, canonical seeded start
```
```
{"frames":8485,"visibleP10":0.833,"survived":173.2,"climaxLegibleFrac":0.696,"climaxSamples":92,"eliteLegibleFrac":1,"pass":true}
PASS  play camera: p10 of combat-range threats in frustum >= 0.8 — p10 0.833 over 8485 frames (bot survived 173.2s)
PASS  climax legibility: >= 60% of combat-range threats legible — 0.696 over 92 samples
PASS  elite legible as an elite (marker pixels) >= 80% of its frames — 1

ALL PASS
```

```
node scripts/check-ride-feel.mjs
```
```
PASS  coverage: 11 declared, 11 wired
PASS  runtime feel check
ladder magnitudes: kill@0.15=2.28  kill@0.55=4.44  kill@1.0=9.28  elite-kill=21.20  hurt@1.0=7.80  hit@1.0=1.78
PASS  ladder monotone in intent/value + named pairs

ALL PASS
```

```
node scripts/check-ride.mjs             # headless curve gate — unchanged from round 1 (3 RED, recorded)
```
```
✗ track:pearson: median r 0.736 (>= 0.75)
✗ track:mae: median MAE 0.182 (<= 0.18, normalized)
✓ track:breathers: median breather drop 0.302 (>= 0.15, normalized)
✓ climax:elite-alive-in-hold: elite alive during 150-172s on 6/6 expert seeds
✓ climax:drive-tier-open: intent 1 at 150s, 0.95 at 172s (>= 0.82)
✗ win:novice: novice survives 1/6; survived s: 157,84,169,133,106,180
✓ win:expert: expert survives 6/6; survived s: 180,180,180,180,180,180
· headroom:kills (recorded, saturates by construction): expert 200 vs novice 168 kills = 1.19x
✓ headroom:damage-per-min: novice 58.7 vs expert 29.3 dmg/min (floor 10) = 2.00x (need >= 1.3)
✓ determinism: seed 42 twice: 199/180.0 vs 199/180.0
· measured-at-keyframes (expert seed 1): 0s: intent 0.15 / measured 0.00; 25s: intent 0.45 / measured 0.32; 45s: intent 0.30 / measured 0.20; 70s: intent 0.65 / measured 0.31; 95s: intent 0.40 / measured 0.10; 120s: intent 0.80 / measured 0.55; 140s: intent 0.55 / measured 0.20; 150s: intent 1.00 / measured 0.44; 172s: intent 0.95 / measured 0.62; 180s: intent 0.10 / measured 0.50
FAIL (3) — plot: .shots/ride-curve.svg
```

Drift: ride rows all match incl. `SIM_DT`, `TRACK.radius/smooth/
breather1/breather2`, `CAMERA.combatRange`, noise profiles; prose scan
passes.

## What changed in round 2 (A6 only — choreography untouched pending the round-1 verdict)

- The shell drives `RideRun` on `SIM_DT` (1/120) through `FixedStep`; the
  player and every critter are interpolated between ticks; the bot's (or
  the player's) movement input is sampled per tick, quantized to six
  decimals BEFORE the sim consumes it, and recorded to a tick-indexed tape.
- `check-ride-replay.mjs`: a 40-s tape replayed at five cadences is
  byte-identical at all seven checkpoints (time, kills, hp, level, xp,
  player position, every enemy's position and hp).
- The play-camera gate re-run on the fixed-step shell: p10 0.80 → 0.833,
  climax legibility 0.696, elite 1.0.
- The headless curve gate is unchanged (it always stepped at 1/60 on the
  pure `RideRun`); its three red rows stand exactly as in round 1 and are
  recorded, not tuned.

## Recorded, not scored (carried from round 1)

- The elite outlives the hold on every seed; the release still has it
  standing. At night away from the café the arena reads as a flat wash
  disc. Both unchanged by A6.

## Instrumentation

- `__drive(rawDts, {everyTicks})`, `__replay(seed, events)`,
  `__autoplay(on, seed, {record})`, `__ride.tape`, `__ride.stateHash()`.
- `__playCheck(seconds)`, `__legibility()`, `__feelCheck()`, `__feelLadder()`.

## Evidence

Round 1's frames (ride-* at daaef2b) and ride-curve.svg stand; this round
is the reproducibility gate (numeric).
