# REVIEW-BUNDLE — INTENSITY RIDE (battery B4, round 1)

Factual launch + instrumentation only. Loop contract: LOOP-CONTRACT.md —
contract 5351bda (13:08), amendments A1 98a9255 (13:12), A2 7134d9c
(13:17) + addendum 8931e5e (13:20), A3 0b12aa9 (13:22), A4 366a58c
(13:23); substrate 143ef88; build daaef2b. A1–A4 were each committed
before the code they authorize. **Attribution slip, disclosed:** A5 (the
fifth-measurement record, which authorizes no code) was written to the
contract after the measurement and then swept into the build commit
daaef2b by a directory-level `git add` — it should have been its own
commit titled as an amendment. No evaluation here.

## Launch

```
cd ~/Documents/ChatGPT/animation/battery
npm run dev        # port 5183
# open http://127.0.0.1:5183/ride.html
```

WASD moves; the blade swings on its own; 1/2/3 or click picks a card at
level-up (the sim pauses while you choose). Three minutes.

## Gates (exit-coded, in-tree) — output PASTED from the run at daaef2b

```
node scripts/check-ride.mjs
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

```
node scripts/check-ride-camera.mjs      # headless Chrome, play camera, canonical seeded start
```
```
{"frames":7169,"visibleP10":0.8,"survived":173.1,"climaxLegibleFrac":0.697,"climaxSamples":92,"eliteLegibleFrac":1,"pass":true}
PASS  play camera: p10 of combat-range threats in frustum >= 0.8 — p10 0.8 over 7169 frames (bot survived 173.1s)
PASS  climax legibility: >= 60% of combat-range threats legible — 0.697 over 92 samples
PASS  elite legible as an elite (marker pixels) >= 80% of its frames — 1

ALL PASS
```

```
node scripts/check-ride-feel.mjs        # headless Chrome, the SAME wired table
```
```
PASS  coverage: 11 declared, 11 wired
PASS  runtime feel check
ladder magnitudes: kill@0.15=2.28  kill@0.55=4.44  kill@1.0=9.28  elite-kill=21.20  hurt@1.0=7.80  hit@1.0=1.78
PASS  ladder monotone in intent/value + named pairs

ALL PASS
```

```
node scripts/check-contract-drift.mjs   # ride rows
```
```
PASS  ride: RIDE_SECONDS contract=180 code=180
PASS  ride: CURVE.length contract=10 code=10
PASS  ride: TRACK.minR contract=0.75 code=0.75
PASS  ride: TRACK.maxMAE contract=0.18 code=0.18
PASS  ride: TRACK.breatherDrop contract=0.15 code=0.15
PASS  ride: SPAWN.everyMax contract=1.8 code=1.8
PASS  ride: SPAWN.everyMin contract=0.6 code=0.6
PASS  ride: SPAWN.hpScaleMax contract=1.35 code=1.35
PASS  ride: SPAWN.lead contract=4 code=4
PASS  ride: CLIMAX.at contract=150 code=150
PASS  ride: CLIMAX.minMusic contract=0.82 code=0.82
PASS  ride: CLIMAX.holdUntil contract=172 code=172
PASS  ride: HEADROOM.min contract=1.3 code=1.3
PASS  ride: HEADROOM.floorPerMin contract=10 code=10
ALL PASS — 28 constants match
```

Drift-baseline provenance: TRACK, CLIMAX.at/minMusic, CURVE.length and
RIDE_SECONDS were designed before the code (5351bda). SPAWN.*,
CLIMAX.holdUntil and HEADROOM.* were set or moved by amendments after
measurements — "recorded, not designed" in the sense of the TRAPS rule;
their later changes need a design justification.

## Red rows, stated plainly

- Tracking r 0.736 (target 0.75) and MAE 0.182 (target 0.18). Five
  measurements are in the amendment log with what moved each time. The
  residual shape error: the climax's first seconds read 0.44 against an
  intent of 1.0, and the release decays slower than the curve drops.
- Novice referee 1/6. The 340 ms / ±16° bot does not survive a ring at
  any size tried (A3: 8 boneheads; A4: 5). Expert 6/6.
- Observed in the evidence, not gated: the elite (420 HP × 1.35) is alive
  at 180 s on every seed — the "release" still has the elite standing;
  the contract's "the last kill echoes" does not happen. At night, away
  from the café, the arena reads as a flat wash disc under the bloom
  light (ride-climax, ride-release).

## What the curve drives (mechanics, all from `intentAt(t)`)

spawn cadence 1.8 → 0.6 s; mix widens (imp capped at 1.2 past 0.75);
enemy HP scale 1 → 1.35; scripted bursts LEAD their beats by 4 s (21 s
6 slimes, 66 s 5 boneheads, 116 s 24 bats, 146 s 6 slimes, 150 s elite);
no spawns after 172 s; `AdaptiveMusic.setIntensity(intent)` every frame
(drive drums open ≥ 0.82); dusk → night fade at the first beat ≥ 0.8;
bloom light 14 → 28 with intent; every feel magnitude scales with intent
(ladder above); imps telegraph their charge (swell + ring, 0.4 s).

## Instrumentation

- `__ride` — { ride, startRun, feel, hero, camera, music }.
- `__autoplay(on, seed)` — the standard survivors referee bot at EXPERT
  noise plays the real loop at rAF cadence; bypasses the player's cards.
- `__playCheck(seconds)` — canonical seeded start; frustum p10 over
  combat-range threats; ID-pass legibility sampled through the climax.
- `__legibility()`, `__feelCheck()`, `__feelLadder()`.

## Evidence (REAL compositor frames, play camera only, .shots/)

ride-title, ride-arrival (5 s), ride-push1 (30 s), ride-breathe (50 s),
ride-surround (125 s), ride-climax (158 s), ride-release (178 s) —
captured by `capture-ride-evidence.mjs` from an autoplay run (seed 1);
`ride-curve.svg` — intent (amber) vs normalized measured (blue), expert
seed 1, written by `check-ride.mjs` at this commit.

## Known notes

- Skill axis HYBRID declared; headroom axis substituted by coordinator
  ruling (quoted in A2); kills row kept.
- The imp telegraph exists in the shell; the contract's "no
  un-telegraphed charger ≥ 80 %" is not yet a separate gate row
  (declared open).
