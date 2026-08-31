# GATE-FLIPS — post-review-r1 upgraded suite vs the reviewed build

Facts only. The review target was `add34ef` (nightbloom-play-review-r1);
the upgraded suite and the four mechanical fixes land in the commits after
it. "At review build" = the upgraded gate run against the pre-fix state;
"now" = the same gate after the mechanical fixes (2a–2d).

## Gates that flipped RED where the old suite was green

| Gate | Old suite said | Upgraded gate, at review build | Now | Review finding |
|---|---|---|---|---|
| check-game `npc:elder/mika/fox` | PASS (standable ground) | FAIL ×3 `:present` — no character object within 2m of any post | FAIL ×3 (declared known-red in city-plan.json; NPC cast is a deferred stage) | finding 1 |
| check-city interactions (counts) + nothing else | PASS (registration counts) | new `check-interactions.mjs`: FAIL(4) — `feed-koi` registered at (0,0) outside canal-lane with its only effect 44m away; `look-stall-36.2` and `look-stall-47.6` actions change nothing anywhere | FAIL(2) — feed-koi fixed (registered (-28.9, 33.0), effect within 8m); both look-stall no-ops remain | finding 2, gap 10 |
| `__playCheck` | bundle recorded PASS (frustum terms only) | pass:false — legibleFrac 0.401, eliteLegibleFrac 0 by the marker term (unmarked), while visibleFrac 0.933 | pass:false — legibleFrac 0.574 (< 0.6), p90TimeToSeeSec 4.52 (> 4); eliteLegibleFrac 1.0 after the marker fix. Chaff contrast in night fog is a content gap, not closed by any mechanical fix here | finding 3 |
| simulate-run `winnable` | ✓ 3/6 wins, median 480s (clean bot) | ✗ NOVICE referee (340ms/±16°): 0/6 wins, median 105.9s | ✗ unchanged (no balance change was in scope; five human review runs also all lost, median 143s) | finding 5 |
| simulate-run `baseline:*` | ✓ at ≥90s survival | dying baselines print as numbers, not passes: ronin 212.6s (44%), archer 208.2s (43%), mage 293.8s (61%), brute 242.5s (51%) | same — · lines, no checkmark; a victory would earn ✓, <90s would FAIL | finding 5 |
| (no old gate) play-camera occlusion | — | new `check-occlusion.mjs`: FAIL(3) — arena 10/432 blind cells (x 29.5–30.5, z 0.5–4.5; identical to the review's measured 10/432), night-entry 9/33 arrival points fully hidden, town 386/2860 walkable cells bury the camera | PASS(3) — 0 blind cells everywhere after camera pullback + spawn clamp x0+1→x0+4 | findings 3, 6, highest-impact defect |

## The __playCheck discrepancy (bundle PASS vs review FAIL)

Cause found and fixed: the gate inherited caller state — a fresh call
sampled the sparse 0–20s wave (p90 first-sight 0.77s), a call during a live
mid-fight sampled dense waves (5.5s measured at a t=40s start), on an
unseeded Run. Not tick-vs-rAF. The gate now disposes any running battle,
starts from the canonical town→arena entry with a seeded run, and returns
identical numbers fresh, repeated, and after manual key-driven play.
Details in TRAPS.md.

## Unchanged

- check-feel: PASS (17 emitted / 17 wired / 0 problems); `__feelCheck()` [].
- check-cameras (vista): PASS 5/5.
- check-city: RESULT PASS.
- charforge check-audio: ALL PASS.
- `__latencyCheck`: 1 frame (16.7ms), pass.
- check-game arena `cover` 0/3 and `elevation` 0/1: FAIL, declared known-red
  since A2 (unchanged).
- check-game `arena:landmarks`: PASS — the yagura still reads from the arena
  centre; the blind strip it used to cast is now covered by check-occlusion,
  which is green after the fixes (the landmark and the camera are gated
  separately; finding 7's failure mode is caught by the occlusion sweep).

## Known blind spots this round did not close

- Per-event FEEDBACK legibility (kill bursts, hit flashes as pixels on
  screen) is still not gated: check-feel verifies wiring, `__playCheck`
  legibility covers threats only (finding 4 is only partially mechanized).
- The two look-stall interactions still promise "look" and do nothing;
  check-interactions keeps them red until they act or are deregistered.
