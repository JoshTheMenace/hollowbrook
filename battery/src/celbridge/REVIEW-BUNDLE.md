# REVIEW-BUNDLE — THE CEL BRIDGE (battery B2, round 2)

Factual launch + instrumentation only. Look contract (incl. Amendment A1):
LOOK-CONTRACT.md in this directory. No evaluation here.

## Launch

```
cd ~/Documents/ChatGPT/animation/battery
npm run dev        # port 5183
# open http://127.0.0.1:5183/celbridge.html
```

WASD walk + mouse orbit (click to lock) — walk up to him. **B toggles the
bridge live** (celify on/off — the A/B, materials AND graded vertex colors).
**N toggles night.**

## Gate (exit-coded, in-tree)

```
node scripts/check-celbridge.mjs
```

Round-2 run (commit 51e7163): ALL PASS — 9 checks. Output highlights,
verbatim:

```
world band (measured): base sat 0.397, accent max 0.708
gate has teeth (raw ronin exceeds world band) — raw over-band pixel share: 0°=8.2% 30°=6.2% 45°=0.6%
all meshes celified — 80/80
bridged pixels: satP50 0.158, satP90 0.475, non-accent P90 0.397, owned-accent share 17.2%
```

## Instrumentation

- `__census()` — effective-color material census (thresholds from
  `src/shared/bridge.js`, world-measured).
- `__nightSeat()` — rendered luma p50, char vs world, night meet framing.
  Round-2 measurement: charP50 0.407, worldP50 0.353, ratio 1.153
  (review r1 measured the equivalent of 1.63).
- `__evidence()` — captures cb-meet, cb-close, cb-far, cb-ab-raw, cb-night
  to .shots/. Free cameras ALLOWED per contract (look review).
- `__bridge` — { setBridge, bridged, actor, daynight, hero }.

## What changed since r1 (mechanical list)

1. `check-celbridge.mjs` exists (was declared, missing — process finding).
2. Census reads effective color incl. vertex-color paths; pixel-weighted
   via `charforge/src/lib/pixel-census.js` (4-view software rasterizer).
3. Thresholds measured from the world material table, decoupled from guard.
4. ONE owned accent: hair indigo (17.2% pixel share, under the world accent
   ceiling). Scarf graded into the world band; brass hue pushed out of
   lantern-amber (30° → ~47°), not just desaturated.
5. Night value seat: albedo eases down with daynight.level; day untouched.
6. Practicals bug: pool lights now sit at real lantern positions (geometry
   bounding-sphere centers — offsets are baked into merged geometry, so
   getWorldPosition returned one stacked point; nightbloom shares the fix).

## Known open (declared, per Amendment A1)

- Ink edge weight on the character (~22% heavier than world at matched
  depth): needs a selective buffer in the pipeline's single global ink
  pass. Not half-fixed.
- Machiya tenant renders 蕎麦よいざか despite requesting 喫茶 月見 (kit quirk,
  cosmetic).
