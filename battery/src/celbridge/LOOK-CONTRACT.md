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
