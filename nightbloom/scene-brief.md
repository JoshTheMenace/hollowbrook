# Scene brief — 宵坂 (Yoizaka), the town where evening blooms

## Place

Yoizaka is a small hill-shouldered town at the end of a single-track branch
line, built for a game called **Nightbloom**: by day the visitor runs errands
through its market street and lanes; each dusk, spirit-blossoms open over the
festival ground and the night must be survived. The visitor arrives at a level
crossing beside an unstaffed halt on the west edge; from the crossing keeper's
mirror they can see the main street running east, the torii of the shrine on
its rise to the north-east, and the lantern strings of the festival ground
beyond the last shop.

## Emotional promise

A warm, worked-in town that feels safe in golden light — and carries, in its
lanterns, charms and swept festival field, the visible apparatus of a town
that lives with something it cannot name; the discovery is that everything the
town has built points at the field.

## Time and weather

Late golden hour, early autumn, dry still air. Long warm key light from the
west-south-west, violet-tinted open shade, amber practicals (lanterns, shop
interiors) already lit against the coming dusk. The game's runtime slides this
rig to night; the authored scene is the "day" pole and every district must
read under BOTH the golden key and a cool moonlit variant.

## Visual family

Cel bands with violet shade (the starter's `cel()` stack), screen-space ink
lines, selective inverted-hull outlines on hero props. Chunky, slightly
oversized joinery; no photoreal texture anywhere — signage is Canvas2D, and
surfaces are flat color with painted-in gradients. Palette anchors: aged cedar
wood, indigo-grey roof tile, paper-lantern amber; one saturated accent —
spirit-blossom pink — reserved for blossom, charms, and nothing else.

## Exploration length

60-90 seconds for the spine: arrival at the crossing → east down the market
street (compression between shopfronts) → the festival ground opens as the
reveal → shrine stairs climb as the counter-beat → look back over the roofs
from the terrace. Canal-lane is the quiet optional loop south.

## Interactions

- Crossing halt: read the notice board by the bench (train times that never
  quite agree with the bell).
- Shrine: pull the bell rope — the rope swings, the bell knocks, a petal
  falls.
- Festival ground: strike the yagura drum — one deep BOOM, lanterns sway.

## Game contract (why this town is shaped like this)

- The festival ground keeps a **clear central field ≥ 24 × 18 m** (colliders
  only at its rim) — the night-combat arena.
- Every district's waypoints are quest nodes; routes between them must pass
  the flood fill.
- The shrine torii must read from the festival field (night events are
  telegraphed from there), and the yagura must read from the shrine terrace.
- Shop fronts on the market street need door positions a character can stand
  at (NPC anchors).
