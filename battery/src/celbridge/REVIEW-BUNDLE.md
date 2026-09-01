# REVIEW-BUNDLE — THE CEL BRIDGE (battery B2, round 4 — the closing round)

Factual launch + instrumentation only. Look contract incl. A1–A3:
LOOK-CONTRACT.md. A3 at 9e86e50 (13:32) BEFORE the round-4 code:
substrate 56be3e4 (celify fill / facet / per-face tone steps; CELIFY_OPTS),
entry 44acf3f. Earlier shared substrate for this round: 3b84c3c
(paintGradient quantized at source). No evaluation here.

## Launch

```
cd ~/Documents/ChatGPT/animation/battery
npm run dev        # port 5183
# open http://127.0.0.1:5183/celbridge.html
```

## Gates — output PASTED from the runs at 44acf3f (albedo: ALL PASS; rendered: 8 FAIL)

```
node scripts/check-celbridge-rendered.mjs
```
```
PASS  day/meet: char sat p90 ≤ world sat p99 (+0.02) [object-id mask] — char p90 0.494 vs world p99 0.915 (char px 10055)
PASS  day/meet: char/world luma p50 in [0.6, 1.4] — ratio 0.840
      tone on the COMPOSITE (reviewer's instrument): char soft 15.2% / top8 36.1% vs world soft 3.5% / top8 45.9%
FAIL  day/meet: tone (beauty pass, ink+FXAA off) — char soft-gradient share ≤ 2× world — char 10.0% vs world 2.6% (same-bin pairs char 67.3% / world 93.3%)
FAIL  day/meet: tone (beauty pass) — char top-8-of-128 luma bins ≥ 50% — char 35.6% vs world 46.6%
PASS  day/meet: owned-accent budget — hot pixels in the owned band ≤ 8% of char — 0.0%
PASS  night/meet: char/world luma p50 in [0.8, 1.6] — ratio 0.827 (char 0.274 / world 0.332)
FAIL  day/portrait: char sat p90 ≤ world sat p99 (+0.02) [object-id mask] — char p90 0.568 vs world p99 0.524 (char px 39317)
PASS  day/portrait: char/world luma p50 in [0.6, 1.4] — ratio 0.851
      tone on the COMPOSITE (reviewer's instrument): char soft 8.2% / top8 43.2% vs world soft 3.1% / top8 58.3%
FAIL  day/portrait: tone (beauty pass, ink+FXAA off) — char soft-gradient share ≤ 2× world — char 4.9% vs world 2.0% (same-bin pairs char 82.9% / world 96.2%)
FAIL  day/portrait: tone (beauty pass) — char top-8-of-128 luma bins ≥ 50% — char 44.4% vs world 59.9%
PASS  day/portrait: owned-accent budget — hot pixels in the owned band ≤ 8% of char — 0.0%
PASS  night/portrait: char/world luma p50 in [0.8, 1.6] — ratio 1.209 (char 0.311 / world 0.257)
PASS  day/far: char sat p90 ≤ world sat p99 (+0.02) [object-id mask] — char p90 0.446 vs world p99 0.456 (char px 1094)
FAIL  day/far: char/world luma p50 in [0.6, 1.4] — ratio 0.420
      tone on the COMPOSITE (reviewer's instrument): char soft 22.2% / top8 40.0% vs world soft 2.8% / top8 60.8%
FAIL  day/far: tone (beauty pass, ink+FXAA off) — char soft-gradient share ≤ 2× world — char 16.3% vs world 2.1% (same-bin pairs char 37.8% / world 95.8%)
FAIL  day/far: tone (beauty pass) — char top-8-of-128 luma bins ≥ 50% — char 32.4% vs world 61.2%
PASS  day/far: owned-accent budget — hot pixels in the owned band ≤ 8% of char — 0.0%
PASS  night/far: char/world luma p50 in [0.8, 1.6] — ratio 1.080 (char 0.264 / world 0.244)

8 FAILURE(S)
```

```
node scripts/check-celbridge.mjs     # albedo-space structural gate — tail
```
```
PASS  material census clean (effective colors) — 80 meshes
albedo pixels: satP50 0.160, satP90 0.381, non-accent P90 0.358, owned-band share over world base 0.0%
PASS  no un-owned hue band louder than the world (>1% pixels) — over-bands all <1%
PASS  owned band under its albedo backstop (structural; rendered gate is authoritative) — p90 0.381 vs backstop 0.497

ALL PASS
```

## The A3 numbers, re-stated under the object-ID mask

| A3 target | r3 (diff mask) | r4 (ID mask) | moved by |
|---|---|---|---|
| portrait char sat p90 ≤ world p99 (0.524) | 0.532 | **0.568** — RED | mask correction (+0.03: the shadow was pulling the average down); fill #141414 bought 0.006; the lever A3 named (per-material key-light tint) does not exist in the cel factory — declared open, see below |
| tone: char soft-gradient share ≤ 2× world (portrait, beauty pass) | 21.9 % vs 3.9 % (r3, composite) | **4.9 % vs 2.0 %** — RED by 0.9 pt (composite 8.2 % vs 3.1 %) | per-face tone steps (see mechanism) |
| tone: char top-8 luma bins ≥ 50 % (portrait) | 35 % | **44.4 %** — RED | same |
| owned-accent share × sat ≤ 8 % | — | 0.0 % at all cams | budget row added; defeat J now fails (0.9-sat indigo → 17 %+) |
| day value [0.6, 1.4] | — | meet 0.84, portrait 0.85, **far 0.42 RED** | new row; at far he stands in the shop's shade while the frame's p50 is sunlit ground — a whole-frame reference; a local-backdrop reference is the better instrument (not built) |
| night [0.8, 1.6] | 1.034 / 1.499 / 1.161 | 0.827 / 1.209 / 1.080 | fill + ID mask |

## The mechanism, found by diagnostic (recorded in TRAPS)

Calibration first: a constant-colour body scores 0.2 % soft / 99 % same
pairs — the instrument does not count edges. Then, with the phase table
held (`__renderedBand(cam, phase, {keepPhase})`): hemisphere off, fill
light off, shadows off, sun off each moved the soft share ≤ 1.3 pt;
**vertex colours off moved it 8.3 % → 3.9 % and top-8 bins 36.9 % →
70.1 %**, and brought the skin p90 to 0.517. The painted vertex colours
are the airbrush. Quantizing `paintGradient` to 3 steps at the vertices
(3b84c3c) moved nothing because the GPU interpolates colour across each
triangle; the step that works is ONE TONE PER FACE on non-indexed
geometry (`celify({ facet, toneSteps })`, 56be3e4). Saturation is left as
painted — stepping it to the mesh maximum raised the skin p90.

What it looks like: cb4-face shows a faceted, stepped skull beside the
hair spikes; cb4-side-day the kimono beside the stone lantern. The
character now reads as low-poly faceted, which is a different answer to
"steps like the world" than the world's large flat planes give. Stated,
not scored.

## Declared open at close

- Skin lit-band saturation (portrait 0.568 vs 0.524): needs a
  per-material key-light response in the world's cel factory
  (`nightbloom/src/core/toon.js`) — pipeline work, outside the bridge.
- Tone at meet/far: the residual soft pairs are facet borders under the
  un-quantized hemisphere term (per-face normals, 1–2 bin neighbours);
  quantizing indirect light is also cel-factory work.
- Ink edge weight: re-measured under the ID mask is not yet a gate row;
  r3 found r1's ~22 % does not reproduce. Closed as a finding.
- Observed in cb4-side-day: the shop wall shows the sun shadow map's
  texel staircase (2048 px over a 28 m box). World-side, not bridge.
- Parked for Phase 2 / Stage C: 4-head proportion vs realistic props.

## Instrumentation

`__renderedBand(cam, phase, {keepPhase})` — object-ID mask; sat/luma
percentiles; `tone` (composite) and `toneBeauty` (ink + FXAA off);
`ownedHotShare`; `hotHues`. Cams: meet, portrait, far, side, face.
`__frame(cam, phase, bridged)`; `__nightSeat()` unchanged since r2;
`__census()`.

## Evidence (REAL frames, .shots/cb4-*.png, A3's declared set)

cb4-meet, cb4-portrait, cb4-far, cb4-side-day, cb4-face, cb4-night-meet,
cb4-night-portrait, cb4-side-day-raw. (cb4-tone.svg from A3's set is not
produced — the tone numbers are in the gate block above; declared.)
