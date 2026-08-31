# LOOK.md — the LookForge authoring contract

LookForge is the rendering/VFX pipeline: the post-processing stack, toon
outlines, and color grading that separate "three.js demo" from "game with art
direction". Looks are DATA (like instruments and characters), gated on the
shipped pixels.

```
src/lookforge/
  post.js       EffectComposer stack: render -> UnrealBloom -> Grade -> Output
                Grade = exposure/contrast/saturation/temp/tint/lift-gamma-gain/vignette
  outline.js    inverted-hull toon outlines (smoothed-normal shells)
  content/looks.js   look presets: flat (control), sakura-day, nightbloom, emberfall
look-lab.html + src/lookforge/lab-look.js   evidence scene + __lookCapture()
scripts/check-look.mjs                      the gates (PNG-statistics referee)
```

## The quality loop
1. Edit a look preset (or the stack, if a capability is missing).
2. Browser: open /look-lab.html, run `__lookCapture()` → .shots/lookgate-*.png.
3. `node scripts/check-look.mjs` — all gates pass, or the failure names the
   measured defect.
4. Read the beauty shots (look-*.png) like an art director; the user's eye is
   the final calibrator.

## Using it in a game
```js
import { makePost } from './src/lookforge/post.js';
import { addOutlines } from './src/lookforge/outline.js';
import { LOOKS } from './src/lookforge/content/looks.js';
const post = makePost(renderer, scene, camera, LOOKS.nightbloom);
addOutlines(characterRoot);          // per character/prop, after build
post.render(dt);                     // instead of renderer.render
post.setLook(LOOKS.emberfall);       // scene mood changes are one call
```
Outline shells are children of their mesh (they inherit animation), marked
`userData.isOutline` — exporters, gates, and raycasts must skip them.

## Gates (check-look.mjs)
- stack-active: graded frame differs from flat control (mean|Δ| > 3) — the
  stale-render guard for pixels.
- bloom-glows / no-blowout: bloom adds luminance but <3% pure-white pixels.
- outlines-present: edge density ≥1.1x the outline-free frame.
- per-look health: meanLuma 45-170, p95-p5 spread ≥70, meanSat 0.18-0.75,
  crushed blacks <30%, clipped whites <3%.

## Calibrated traps (paid for once already)
1. **Contrast pivots at the palette's working middle (~0.36), not 0.5.** A
   stylized frame's mean luma sits near 0.3; a 0.5 pivot crushed the whole
   image (measured meanLuma 80 → 37, blacks 35%).
2. **Bloom threshold must clear toon albedo.** Bright toon shirts at
   threshold 0.72 turned characters into glow blobs; 0.85+ keeps bloom on
   emissives and speculars where it belongs.
3. **Inverted hulls need SMOOTHED normals.** Our kit is flat-shaded (split
   verts); pushing shells along face normals cracks every edge. outline.js
   bakes a position-averaged `outlineNormal` attribute first.
4. **Outline thickness is a screen-space judgement.** 0.012m was sub-pixel at
   gameplay camera distance; 0.024m reads. Check at the real camera, not
   close-ups.
5. **Gate scenes must be framed like the game.** A camera staring past the
   playfield into void sky fails contrast/crush gates for scene reasons, not
   grade reasons. Fill the frame with playfield before blaming the look.
6. Grades change mood; they do not change LIGHTING. A "day" look on a night
   scene reads dusk — pair look presets with matching scene lights.

## Backlog (next passes)
- SMAA pass (crisper outlines at 1x pixel ratio)
- emissive-material registry so bloom sources are declared, not accidental
- per-scene look blending (lerp two looks over time for dawn transitions)
- mergeStaticParts + instancing audit from AUDIT.md
