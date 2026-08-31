# CharForge

A pipeline where AI agents create polished, animated, mobile-game-style 3D
characters from a text prompt — fully code-native Three.js, no external
assets, no accounts, no API keys.

Current roster: four procedural characters — **brute**, **archer**, **mage**,
**golem** — plus four **KayKit Adventurers** (knight, barbarian, wizard,
rogue; CC0, see `public/kaykit/PROVENANCE.md`) loaded as first-class lab
characters with curated weapon loadouts and ~75 clips each. Every character
has `idle` / `walk` / `attack` aliases, passes the same gates, and ships as
an engine-ready GLB in `exports/`.

## Try it

```sh
npm install
npm run dev     # http://localhost:5186 — pick characters/clips with the panel
```

## Make a new character (the point of all this)

From a Claude Code session in this repo:

```
run the new-character workflow with args {name: "reaper", brief: "hooded
skeletal reaper, tattered dark robe, oversized scythe, sickly green glow as
the accent; slow menacing walk; attack = wide scythe sweep"}
```

The workflow spawns a builder agent (writes `src/characters/<name>.js`
against the `KIT.md` contract, iterates through machine gates and visual
repair passes), then an independent evaluator agent that scores renders
against a 9-criterion rubric, then a repair agent if it scores under bar.
Output: registered character, `.shots/<name>-*.png` evidence, and
`exports/<name>.glb`.

## How quality happens (the mechanism)

Prose does not produce visual quality; feedback loops do (measured in the
Sakura Crossing experiments — see `../../threejs`):

1. **Machine gates** — `node scripts/check-character.mjs <name>`: grounding,
   loop-seam closure, floor penetration over every clip, triangle budget.
2. **Render evidence** — the dev server exposes `__shot` / `__turntable` /
   `__strip` (animation contact sheets) / `__silhouette` (small black-shape
   readability test), all written to `.shots/` for agents to actually read.
3. **Separate evaluator** — builders self-score high, so a different agent
   scores the renders and issues repair directives.
4. **2–3 repair passes** — budgeted by design; no first pass has passed yet.

## Layout

- `src/lib/rig.js` — named-joint skeleton factory (rigid-part chibi rigs)
- `src/lib/parts.js` — toon ramp + rim materials, lathe bodies, capsule
  limbs (self-covering joints), rounded boxes, vertex-gradient painter
- `src/lib/clips.js` — pose DSL → baked `AnimationClip`s (eased, mirrored),
  plus `groundClip`, an automatic floor-contact pass
- `src/lab/` — presentation stage + capture/export tooling
- `src/characters/` — one module per character; `KIT.md` is the contract
- `scripts/check-character.mjs` — headless gates (no browser needed)
- `exports/` — animated GLBs (verified round-trippable via GLTFLoader)

## KayKit integration

`src/characters/kaykit.js` loads the pack GLBs (`public/kaykit/`) with:
prop-loadout selection (the packs ship every weapon attached at once —
worn clothing is kept, gear must be chosen), height/ground normalization,
clip aliasing (`idle`/`walk`/`attack` → pack clip names), and a
texture-strip path so the headless gates work in Node. Add a loadout in
`src/characters/index.js`; every other clip in the pack (`Death_A`,
`Jump_Full_Long`, `Hit_B`, …) is still available by its original name —
try `__play('Cheer')` in the lab.

## Notes for later

- The procedural rigs and KayKit rigs are different skeleton styles
  (rigid-part Groups vs skinned bones), so KayKit clips don't drop onto
  procedural characters directly; a bone-map retarget is a scoped-out
  future experiment.
- Paid upgrades if ever wanted: Tripo/Meshy text-to-3D APIs (~$1/rigged
  character, accounts required), Cartwheel text-to-motion API (paid plan).
