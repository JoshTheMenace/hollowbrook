# CharForge pipeline audit — game-readiness (2026-08-24)

Three-angle audit (pipeline internals; interop with the Sakura Crossing
project; game/character domain research) toward: powering a real game
(player, NPCs, animals), more polish, smoother animation, wider variety,
2D support.

## Verdict on the core

The kit's foundations — faceting + vertex-gradient painting, the pose-DSL →
dense-bake clip model, mirrorPose, groundClip, conformalStrap, and the gate
methodology (mechanical + anatomy + frame-exact weapon gates + numeric
probes) — audit as professional-grade. **They are the reason the roster
looks the way it does. Do not rework them.**

## Shipped from this audit (done)

- Per-material toon ramps (`toonMaterial(color, { ramp })`) — metal vs skin
  vs cloth can finally band differently.
- `meta.requiredClips` — clip contract is character-declared and gate-
  enforced (also fixed: `attack` was mandated by KIT but never gated).
- Quadruped skeleton (`buildQuadSkeleton`) + gait guidance in KIT.md.
- 2D sprite-sheet exporter (`__sprites`: 8-direction × N-frame transparent
  sheets + JSON atlas per clip).
- Game runtime (`src/game/actor.js`): state machine (idle/walk/run/attack/
  hit/death/talk), research-tuned crossfades (idle↔walk 0.2s, →attack
  0.07s, →hit 0.05s…), speed-synced timeScale (no foot-sliding:
  timeScale = moveSpeed / clipNativeSpeed), hit trio (flash + knockback +
  interrupt), squash-with-overshoot, attack hit-frame events at 50%.
- Instancing story verified & documented: procedural = fresh `build()` per
  instance (or `clone(true)` sans constraints); KayKit = `SkeletonUtils.clone`.
- Model-selectable builder workflow (`new-character` accepts `model`).

## Engine layer (shipped after the audit — genre-agnostic game infrastructure)

- `src/engine/audio.js` — SFX as PARAMETER SETS (jsfxr-style synth over
  WebAudio): agents author sounds like geometry; `renderOffline()` powers an
  audio gate (peak/clipping/duration asserted — all 9 Willow Square sounds
  pass). Plus a pattern sequencer for music loops.
- `src/engine/vfx.js` — pooled particle bursts, floating text, screenshake
  (trauma model), hit-stop.
- `src/engine/juice.js` — the juice bus: gameplay emits semantic events; one
  table wires each to sfx+burst+shake+hitstop+text; `check()` lints that
  every declared event has feedback ("silent gameplay" is a gated defect);
  `log` lets playtest bots assert feedback actually fired.
- `src/engine/shell.js` — scene manager (title/play/pause), versioned
  save/load (localStorage), unified input (keyboard+gamepad+bot-injectable
  `input.virtual` — the playtest hook).
- Willow Square upgraded onto all of it and bot-verified: quest completes,
  save survives reload, pause works, juice log shows feedback on every beat.

## Roadmap (ranked, not yet done)

1. **Outline pass** (inverted hull or OutlineEffect) — biggest remaining
   "reads as a finished game" lever.
2. **`mergeStaticParts(joint)`** — merge same-material meshes per joint to
   cut 30–50 draw calls/character to ~8; prerequisite for crowds.
3. **Bloom for emissives** (EffectComposer + selective UnrealBloomPass;
   interacts with ACES tonemapping — test on golem).
4. **`check-transitions.mjs`** — sample crossfaded pose pairs through the
   anatomy/floor gates; the lab currently only ever proves hard cuts.
5. **Quadruped anatomy rules** — quadrupeds currently get zero anatomy-gate
   coverage (silently); add leg-hinge zones keyed by skeleton type.
6. **Character-declared weapon specs** — move check-weapons SPECS entries
   into each character module; the shared file doesn't scale.
7. **Procedural canvas textures** — UVs already exist unused on all
   generated geometry; a painted-canvas `map` option is the next detail
   ceiling after ramps.
8. **Runtime foot-IK** — only when terrain stops being flat.
9. **Orthographic sprite camera + anchor metadata** — upgrade the sprite
   exporter for parallax-free sheets.

## Interop with ../threejs (Sakura Crossing)

- **Now**: the mini-game lives inside charforge (one three@0.170 instance,
  direct `build()` imports — no GLB round-trip). We borrow Sakura's proven
  patterns: kinematic walker constants, AABB collide/step model, /__shot
  convention (already shared DNA).
- **Trap documented**: `GLTFExporter` silently downgrades MeshToonMaterial —
  GLBs loaded elsewhere need materials rebuilt through the host scene's toon
  factory (Sakura's `cel()`), keyed off base colors.
- **Later**: bump charforge to three ^0.180 (re-run all gates after; both
  projects patch shader chunks that can shift between versions), then
  characters import directly into vignette-starter scenes. Full integration
  into the live Sakura world is explicitly not recommended (planet-bake
  coordinate math + realistic scale vs chibi style clash).

## 2D support position

Pre-rendered sprites from the 3D lab (à la Don't Starve/classic RTS):
walk 6–8 frames/direction at 8 directions (mirror-halving optional later),
idle 4–8, TexturePacker-style JSON the target for engine import. The
`__sprites` exporter covers the core path today.
