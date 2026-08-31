# CharForge character kit — builder contract

Build one polished mobile-game character (Clash Royale bar: chunky, readable,
alive). Everything is code-native — no external assets.

## Files

- Your character: `src/characters/<name>.js`, exporting
  `build() -> { root, clips, meta: { height, name } }`. Registered already in
  `src/characters/index.js`.
- Kit: `src/lib/rig.js` (skeleton), `src/lib/parts.js` (geometry + toon
  materials), `src/lib/clips.js` (pose DSL, mirroring, ground pass).
- Worked example: `src/characters/brute.js` — read it first, copy its shape.

## Hard conventions

- Metres, feet at y=0, faces +Z. Height 1.0–1.6 for humanoids (2–3 heads tall
  — the head is ~1/3 of height; oversized hands/weapon; short or no neck).
- Skeleton from `buildSkeleton(proportions)`; parts are meshes parented to the
  named joints. Rotations in poses are degrees, XYZ, relative to rest:
  **negative rx swings a hanging limb forward (+Z); positive ry turns the
  character's left side (+X) forward. For feet, negative rx = toe up.**
- Rest-pose tweaks (e.g. arm flare) go on joint `.rotation` BEFORE any
  `bakeClip` call — bakes capture rest at call time.
- Clips required: `idle` (loop, 2–3s), `walk` (loop, 0.7–1.0s), one flavored
  `attack` (one-shot, starts/ends at rest). Loops must start and end on the
  same pose (repeat key 0 at the end).
- Wrap `walk`/`attack` in `groundClip(root, bakeClip(...))` so feet contact
  the floor. The clip must animate `hips` position for that to work.
- Walk uses the four positions per half-stride: contact → down (hips lowest —
  this sells weight) → passing → up. Author one side, `mirrorPose` the other.
  Counter-rotate chest against hips. Arms swing opposite legs.
- Attack: anticipation is longer and larger than the strike (wind-up ≥ 25% of
  the clip, ease 'in' into it, 'out' snap for the hit), then eased recovery.
  Squash & stretch on big hits: scale with sx=sz≈1/sqrt(sy).
- Palette: one saturated ID color + 2–3 supports; never pure black; detail
  concentrated at face + weapon. `toonMaterial(color, {rim})` for everything.

## The loop (mandatory — no first pass has ever been good enough)

1. `node scripts/check-character.mjs <name>` — must be ALL PASS before any
   render. It checks grounding, budgets, loop wrap, floor penetration.
2. Capture in YOUR browser tab (see below), then **Read every image**:
   - `await __lab.load('<name>')` after each edit (re-imports your module).
   - `await __shot('<name>-hero', { cam: 'hero', clip: 'idle', t: 0.5 })`
   - `await __turntable('<name>-turn', { views: 4, clip: 'idle', t: 0 })`
   - `await __strip('<name>-walk', 'walk', { frames: 8, cam: 'side' })`
   - `await __strip('<name>-attack', 'attack', { frames: 8, cam: 'hero' })`
   - `await __silhouette('<name>-sil', { views: 4, clip: 'walk', t: 0 })`
   Files land in `.shots/<shotname>.png`.
3. Name the single worst defect, fix it, recapture. Budget 2–3 repair passes.
   Common defects, in observed order: parts reading as detached blobs
   (mushroom shoulders), monochrome palette, limbs sinking into the torso,
   floating/penetrating feet, robotic symmetric idle, walk with no hip drop.
4. Done = gates pass + silhouette readable + walk shows weight + attack shows
   anticipation. Report per-image what you see, honestly.

## Game roles & clip contracts

Characters now feed a game runtime (`src/game/actor.js`: state machine,
crossfades, speed-synced locomotion). Declare the contract via
`meta.requiredClips` (default `['idle','walk','attack']`); the gate enforces
whatever you declare. Role guides:

- **player**: idle, walk, run, attack, hit, death. run ≈ walk pose language
  with more lean/bounce at 0.5–0.7s/cycle.
- **npc**: idle, walk, talk (loop gesture played during dialogue — the
  highest charm-per-clip investment; players stare at NPCs while talking).
- **ambient animal**: idle, walk, startle. `meta.requiredClips:
  ['idle','walk','startle']`.

One-shots are recognized BY NAME by the runtime: attack, hit, death, startle.
Everything else loops. Walk/run must be in-place (the runtime moves the
root; `groundClip` as usual).

## Quadrupeds (animals)

`buildQuadSkeleton(proportions)` in rig.js: hips are the REAR, chest rides
forward on the spine (+Z = nose), joints: hips, spine, chest, neck, head,
tail1→tail2, and per-side front/rear legs `frontThighL, frontShinL,
frontFootL, rearThigh…` etc. `mirrorPose` works unchanged. NOTE: the
anatomy gate has no quadruped rules yet — your renders and the frame gates
are the evidence; be extra thorough with strips.

Gait (from locomotion research): **walk** = lateral sequence, one leg-swing
pose applied to all four legs with phase offsets rearL 0.0, frontL 0.25,
rearR 0.5, frontR 0.75 of the cycle. **Trot** = diagonal pairs
(rearL+frontR together, offset 0.5 from the other pair). Secondary motion
sells the animal more than gait precision: tail sine sway (10–20°, period ≈
stride), ear flicks. Author 8 keys (2 per leg phase) and let bakeClip blend.

## Instancing (many NPCs on screen)

Procedural characters are plain named Groups: spawn instances by calling
`build()` fresh per instance (keeps per-frame update() constraints working);
`root.clone(true)` also binds clips correctly (name-based tracks) but drops
update(). KayKit characters REQUIRE `SkeletonUtils.clone` instead. Budget:
each character is 30–50 meshes = 30–50 draw calls; keep simultaneous
characters ≤ ~15 until parts-merging lands (see AUDIT.md roadmap).

## Quality bar — lessons from the KayKit study

The KayKit characters (load `knight`/`barbarian`/`wizard`/`rogue` in the lab,
or Read `.shots/knight-hero.png` etc.) are the bar. What separates them from
first-generation procedural characters:

- **Facet, don't blob.** Smooth spheres/capsules read as programmer art.
  Use `facet: true` on `limbMesh`/`latheBody`, `facetBall`, and low-radius
  `chunkyBox` so surfaces show deliberate flat planes. Mix: faceted for
  organic/cloth masses, smoother only where it means something (metal).
- **Gradients, not flat color.** `paintGradient(geo, darkBottom, lightTop)` +
  `toonMaterial(color, { vertexColors: true })` fakes baked lighting — darker
  toward the ground, lighter on crowns. Use on every large mass.
- **Part density.** KayKit characters are 40+ parts: layered clothing (tunic
  OVER shirt), trim strips on hems, belt studs, hat with character (ears,
  bent tip), separate brow/nose/beard planes. Budget 30–50 parts, detail
  clustered at face and weapon.
- **A signature silhouette feature** per character (bear hat, huge axe head,
  drooping hood tip) — one, oversized, readable in the silhouette test.

## Animation naturalness — dense inspection protocol

8-frame strips hide defects. For each clip also capture 16-frame strips from
TWO angles and read every frame:

    await __strip('<n>-walk16s', 'walk', { frames: 16, cols: 4, cam: 'side' })
    await __strip('<n>-walk16f', 'walk', { frames: 16, cols: 4, cam: 'front' })

Two systemic traps every first attempt has hit:

- **Walk bob comes from leg mechanics, not `hips.pos`.** `groundClip`
  re-seats the hips every sample so the planted foot touches the floor —
  authored hips bob is erased unless the SUPPORT leg's extension actually
  changes. Bend the support knee at down (~15-25°), straighten it at
  passing/up (~0-5°): the planted foot stays at y=0 and the crown genuinely
  rises and falls. Verify: crown height must visibly differ between the
  down and passing frames of the 16-frame strip.
- **Fast strikes need breakdown keys.** One eased key from windup to hit
  makes the weapon teleport (~150° in one captured frame). Put 1–2
  intermediate keys along the swing arc (e.g. windup → overhead → hit,
  6–8ms of clip time apart) so the strike spans 2–3 captured frames, then
  overshoot 1 key past the hit and settle back (impact follow-through).

Numeric tools — use them BEFORE renders for kinematics:

- `node scripts/check-weapons.mjs <name>` — frame-exact weapon-state gate.
  It samples at 20fps (the GIF's own rate — coarser strips ALIAS: defects
  hide between 16-frame samples) against DECLARED per-clip windows (when a
  hammer may be inverted, how far a bow limb must stay from the face...) and
  fails naming exact frames. The fix workflow is: gate fails at frames N →
  fix → the SAME frames pass. When adding a prop, add its spec here first.
  Also: a quaternion blend between two correctly-oriented keys can pass
  through inverted — pin a solved key at the failing timestamp.
- `node scripts/check-anatomy.mjs <name>` — anatomical plausibility gate,
  MANDATORY alongside check-character. It catches the "arm rotates backward
  through the torso" class of impossible pose that render evaluators only
  perceive as "weird": arms raised behind the back plane or crossing behind
  the body (measured in the CHEST frame, so leaning torsos don't false-flag),
  elbow/knee reverse-bends and sideways-bends (swing-twist, pronation-aware),
  and over-rotated spines. Calibrated against KayKit's professional clips
  (all pass; their upper arms never exceed ~107° from rest — big swings come
  from chest rotation + timing, never shoulder hyperextension).
- **Raise arms with FORWARD flexion (negative rx), never positive rx** — an
  overhead windup is rx ≈ -150 with bent elbows and chest lean-back, plus
  wrist keys to cock the weapon. Positive rx past ~+55 is the single most
  common impossible pose.
- **Animate the WEAPON HEAD's path, not joint angles.** Name the weapon's
  head mesh, probe its world trajectory across the clip (see the maulHead
  probe pattern), and solve each strike key so the head hits targets on a
  real arc — apex clearly ABOVE the skull, travel down the CENTER plane
  (x≈0), impact front-center. Joint-angle authoring routinely produces
  swings that happen 0.7m off to one side and look fine from one camera
  only. If a two-hand grip is unreachable through the arc (short chibi
  arms), commit to a one-hand swing with the off-arm counter-swinging —
  never leave the off-hand floating near the haft.
- **Carry poses are poses too**: a bow is carried near-vertical at the
  side (chord ≤ ~20° from vertical), never flat across the waist.
- **Track the weapon's ORIENTATION as well as its path.** Probe the haft
  direction (headPos − handPos, normalized) at every captured frame: a
  hammer must be head-UP in carry/raise/recovery and head-down ONLY during
  the strike — anything else reads as "he's holding it upside down".
  Passing through horizontal mid-rotation is natural; passing through
  inverted is not. Wrist keys control this; solve them per key against the
  orientation target (the carry mount often means "arm at rest = head up",
  so recoveries are usually "drop the arm home fast", not wrist gymnastics).
- **Aimed props face the TARGET, not the camera.** At full draw a bow's
  chord is near-vertical and its belly points down the aim line (solve the
  bow-hand wrist for chordY + bellyZ in world). Orient nocked arrows along
  the hand→rest line in the prop's update() constraint.
- **Precise contact poses (hand at cheek/grip/face): don't hand-guess
  eulers.** Grid-search legal angles in the lab against a world-space target
  (see the archer's solved draw anchor: upper-arm TWIST ry is usually the
  ingredient hand-authoring misses), or keep two-hand props aligned with a
  per-frame `update()` constraint (return it from build(); the lab calls it
  after the mixer each frame — the archer's string tracks the draw hand this
  way, so it's on the correct side by construction).

- `node scripts/probe-clip.mjs <name> walk 16` prints crown height, hips
  height, and per-foot floor distance + pitch at exactly the 16 strip sample
  times. Tune until: crown bob ≥ 3% of height, the CAPTURED contact frame
  is visibly lower than the captured passing frame (contrast must land ON
  sample points, not between them), and stance-foot pitch stays within ±8°
  through support. Same for attack: key the strike breakdowns so they land
  ON sample times (~duration/16 apart) — a 0.1s strike between two samples
  still reads as a teleport in the evidence.
- Straps/trim on lathe bodies: use `conformalStrap` + `profileRadius` from
  parts.js — tori and rings cannot hug a pear-shaped torso and WILL float.

Checklist per frame — name the frame number when reporting a defect:
- **Contact**: planted foot flat and at y=0 in every stance frame; no frame
  where both feet hover mid-stride (unless a run's airborne phase).
- **Arcs**: hands/weapon tip trace curves across consecutive frames, never
  straight teleports; no single-frame jumps in any limb.
- **Twinning**: left and right sides must NOT mirror exactly in idle/attack —
  offset timing or angle by a few degrees/frames.
- **Ease**: motion bunches near pose extremes (slow-in/out); evenly spaced
  frames = robotic linear motion.
- **Follow-through**: after a strike, chest/head/weapon settle over several
  frames, they don't stop dead together.
- **Counter-motion**: hips and shoulders rotate opposite in walk; head
  stabilizes (counter-tilts) against body sway.

## Browser discipline (parallel agents share one browser)

The dev server runs at http://localhost:5186 (`?c=<name>` picks the initial
character). Create YOUR OWN tab with `tabs_create`, navigate it to
`http://localhost:5186/?c=<name>`, and pass YOUR `tabId` explicitly on every
browser tool call. Never touch other tabs, never call `tabs_close` on tabs
you didn't create. Vite hot-reloads edits, but `__lab.load('<name>')` is
what re-runs your `build()` — call it before each capture round (it throws
build errors into your face, which beats a blank canvas).
If `window.__lab` is undefined, reload the page once; if still broken, the
build threw at import time — check with
`await import('/src/characters/<name>.js?t=' + Date.now())` in the console.
