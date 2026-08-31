# THE CEL BRIDGE — look contract (battery B2)

The biggest unproven seam in the stack: a CharForge character standing
inside a scene-pipeline cel/ink vignette without reading as pasted-on. Pure
look; the review is frames. "No gameplay beyond walking up to them."

**Skill axis: n/a** (not a game loop). This contract's gates are material
and image checks; the independent review judges the one question that
matters: *can an art-direction reviewer tell the character came from a
different pipeline?*

## The seam, named

The world renders through the vignette-starter stack: `cel()` materials
(quantized MeshToon ramp + dark bands tinted toward violet, never black)
under a screen-space ink pass (second difference of depth) and a grade.
CharForge bodies use their own `toonMaterial` (different ramp, rim-lighting,
grey shade). Side by side, the character's shadow side goes GREY while every
surface around it leans violet — the "pasted-on" tell measured in the
nightbloom audit.

## What must hold (gated)

1. **Material unification** — `celify(root, cel)` re-materials every mesh in
   the character subtree through the WORLD's `cel()` factory, preserving
   base color, vertexColors, emissive/practical glows, and transparency.
   Gate: a census over the subtree — 0 meshes carrying non-cel materials
   (`scripts/check-celbridge.mjs`, headless, exit-coded).
2. **Shadow discipline** — the character's shaded side leans violet exactly
   like the world's (comes free with cel(); the gate asserts
   `shadowTintActive()` and the census proves coverage).
3. **Ink coherence** — the ink pass fires on the character's silhouette and
   creases the way it does on the world (screen-space, so free — the review
   verifies no double-outline artifacts against charforge rim remnants;
   celify must strip charforge rim effects).
4. **Palette accent discipline** — the world's rule: one saturated accent
   per area, owned. Gate: census lists character material colors with
   HSV saturation > 0.7; at most 2 distinct accent hues, and neither may
   collide with the scene's owned accents (amber, blossom pink) unless it
   IS that accent.
5. **Animation survives** — clips + per-frame constraints still run after
   re-materialing (idle plays; the census runs post-build, post-update).

## Evidence set (captured for the review; free cameras ALLOWED here —
this is a look review, not gameplay)

- `cb-meet` — eye-level, walking distance: character + world in one frame.
- `cb-close` — portrait distance, shadow side visible.
- `cb-far` — the character at 12m among world props.
- `cb-ab-raw` — SAME framing as cb-meet with celify OFF (the A/B the
  reviewer uses to see what the bridge changed).
- `cb-night` — the same corner under the night rig (practicals + moon).

## Non-goals (recorded so the review scores the right thing)

Retargeting, gesture vocabulary, blend layers (Phase 2 owns those). One
character (ronin), one vignette corner, standing idle + walkable approach.

## Amendments

**A1 (post art-review r1).**
- The declared gate `scripts/check-celbridge.mjs` now exists: headless,
  exit-coded, with a gate-teeth check (the RAW character must fail the
  census, or the gate is asserting nothing).
- Census judges EFFECTIVE color (material × vertex colors, sRGB) and is
  additionally pixel-weighted via a 4-view software rasterizer
  (`charforge/src/lib/pixel-census.js`).
- All thresholds are measured from the world's material table at import
  (`src/shared/bridge.js`): base band = max non-accent world saturation,
  accent ceiling = max world accent saturation. Nothing derives from the
  guard's output.
- Accent decision: the character owns exactly ONE accent — the hair
  (indigo, 225°). The scarf and brass are graded into the world band; brass
  hue is pushed OUT of the lantern-amber band, not merely desaturated.
- Night value seat: character albedo eases down as `daynight.level` rises;
  measured by `__nightSeat` (char/world rendered luma p50) — 1.63 → 1.15.
- Known open: ink edge weight on the character (~22% heavier than world at
  matched depth, review r1 measurement). The ink pass is a single global
  screen-space depth pass; per-object weighting needs a selective buffer in
  the pipeline. Deferred with this note rather than half-fixed.

**A2 (post art-review r2 — committed BEFORE the round-3 implementation).**

Review r2 found that A1 fenced the r1 headline instead of fixing it: the
hair was bit-identical raw vs bridged (0/30 vertex entries changed; rendered
sat p90 0.629→0.633, i.e. unmoved), while the owned-accent band, the 0.708
material-table ceiling, and an ownedShare check that reads 17.2% on the raw
character too were all fitted around the unchanged surface. The hue push
also regressed the irises (e8a13c → e8d48c, warm amber to pale olive). A2
exists to move those numbers, and names them:

- **Hair (the r1/r2 headline):** measured r2 at portrait: char rendered sat
  p90 0.633 vs world rendered p90 0.409 / p99 0.520; 21.9% of character
  pixels in 195–270° where the world has 0.00%. Target: char rendered sat
  p90 ≤ 0.52 at the portrait camera. Indigo stays the owned accent AS A
  HUE; the saturation comes down to the world's rendered band and value
  contrast carries the read. The change is made in the character's SOURCE
  authoring, not by widening any band.
- **Irises:** restored to the warm-amber family. The guard's anti-collision
  grade pushes VALUE down (and caps saturation) with hue unchanged — a
  lantern-amber iris becomes deep amber-brown, never olive.
- **Guard/census decoupling:** the guard becomes a safety net with a
  correction BUDGET reported by celify and enforced by the gate (a
  character whose authoring needs more than the budget fails — the gate
  surfaces authoring problems instead of silently absorbing them). The
  owned accent band gets its own saturation cap (no unlimited-sat hole).
  Gate teeth move to a synthetic violator so they cannot rot as the ronin
  improves.
- **Judging space:** a second exit-coded gate measures RENDERED character
  pixels against the world's RENDERED band (day and night, three contract
  cameras) via a scripted headless browser — thresholds live in the space
  the reviewer judges, not in the mechanism's own output.
- **Night seat:** measured at all three cameras (r2: portrait-night 2.015
  with the seat tuned at one camera). Target: char/world rendered luma p50
  within [0.8, 1.6] at every contract camera at night.
- Parked (outside celify's remit, recorded so it isn't lost): 4-head chibi
  proportion vs realistic-proportion props is the reviewer's second tell
  after hue — a kit-level art-direction question for Phase 2 / Stage C.
