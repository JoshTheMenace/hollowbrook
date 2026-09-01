# ONE NPC, ONE ERRAND — loop contract (battery B3)

A micro quest loop, complete and closed: meet an NPC, be given an errand,
do it, come back, be thanked — and the world remembers where you were at
every step. The two things B3 exists to prove:

1. **The performance seam** — Mira's acting contract (`src/contract.js`
   vocabulary + `normalizePlan`) drives a CharForge body through a
   `Performer` that THROWS on any verb it has not implemented. The dialogue
   script is written in the contract's language; the renderer refuses
   silently-dropped vocabulary by construction.
2. **Persistence is load-bearing** — save/reload works at EVERY stage of the
   errand, including mid-collection. This is gated headlessly at every step
   of the reference walkthrough, not just at stage boundaries. (Campaign
   ruling: this requirement may not be descoped or traded for polish.)

**Skill axis: NONE (declared).** B3 is not a challenge loop; there is no
skill to measure and no difficulty knob. The gates are correctness and
integrity gates: vocabulary closure, persistence closure, interaction
observability, feel coverage. Anything scored as "challenge" here would be
measuring noise.

## The errand

The caretaker of the Tsukimi café corner has a problem: the lantern string
went dark before the evening rush, and the three candles that light it were
scattered by the wind.

- **MEET** — walk to the caretaker, `E` to talk. Dialogue plays; each line
  carries a Mira acting plan (gesture / posture / gaze) performed live.
- **FIND** — three candles at fixed, authored positions (no RNG anywhere in
  this loop — campaign rule, trivially satisfied by having no randomness).
  `E` collects; the objective tracker counts 0/3 → 3/3.
- **RELIGHT** — with all three, `E` at the lantern string relights it: an
  OBSERVABLE world change (emissives on, practicals registered). Interaction
  without observable effect is the defect the nightbloom review named;
  B3 bakes the lesson in from birth — the headless gate diffs serialized
  state across every successful interaction and fails on identical.
- **RETURN** — `E` at the caretaker: thanks, bow. Errand complete.

Talking to the caretaker mid-errand replays a short reminder (with its own
performance) — the NPC always has something true to say about the state.

## Persistence contract

- `ErrandRun.serialize()` → plain JSON snapshot; `ErrandRun.restore(snap)`
  → a run that continues identically. Round-trip identity is gated.
- Browser shell autosaves to localStorage on every state change; a page
  reload mid-errand resumes exactly (stage, candles held, lanterns lit,
  dialogue NOT mid-line — reload lands at the nearest stable state, which
  is every state outside an open dialogue box).
- Headless gate: run the reference walkthrough; at EVERY step, fork via
  serialize→restore and complete the fork; the fork must reach `done` with
  identical counters.

## Vocabulary contract

- Every acting plan in the dialogue script passes Mira `normalizePlan` at
  module load (invalid vocabulary cannot ship — import throws).
- Every gesture used by the script ∈ `Performer.IMPLEMENTED`.
- `Performer.direct()` with an in-vocabulary but unimplemented gesture
  THROWS (gated with a phantom-verb probe). Same boundary as the VRM
  renderer (committed 20/20 there).

## Feel contract

`ERRAND_EVENTS` is the declared event list; every event has a non-empty
feel wiring (sfx and/or visual) or `check-errand-feel` fails. Dialogue UI
is designed, not debug text: name plate, typewriter reveal, continue
affordance, objective tracker.

## Gates (all exit-coded)

- `scripts/check-errand.mjs` — vocabulary closure, phantom-verb throw,
  reference walkthrough, save/reload-at-every-step, interaction
  observability diff, restore round-trip identity, Performer joint-motion
  smoke test on a real rig skeleton.
- `scripts/check-errand-feel.mjs` — feel table coverage in the browser.

## Evidence set

- `er-meet` — dialogue open: NPC mid-gesture + UI card in frame.
- `er-candle` — a candle pickup moment with tracker visible.
- `er-relit` — the lantern string relit (the observable change).
- `er-reload` — the beat AFTER a hard page reload mid-errand, tracker
  showing preserved count (the persistence proof).
- `er-done` — the bow.

## Non-goals

Multiple NPCs, quest chains, rewards/economy, retargeting, Mira LLM
integration (the script is authored, the contract is what's exercised).
Stage C owns composition.

```constants
RADIUS = 1.7
```

## Amendments

**A0 (corrections to the record, before round 3).**
- The `constants` block above was added to this contract by commit
  2f8cbd8, titled "B1 Amendment A6" — a B3 contract edit filed under a
  B1 amendment. Recorded here as the B3 amendment it should have been.
  `RADIUS = 1.7` was transcribed FROM the code after implementation:
  **recorded, not designed** — any change needs a design justification.
- The round-2 evidence set (er2-open, er2-meet, er2-reload, er2-relit,
  er2-done) replaced the declared set (er-candle dropped, er2-open added)
  with no amendment. Declared set from round 3: er3-open, er3-meet,
  er3-reload (after a WALK), er3-relit (from the interaction spot, the
  lanterns in frame), er3-done.
- Round-1's contract and build commits carried identical timestamps
  (staged together); round 2 had 10 m 40 s separation. Noted.

**A1 (post play-review r2, composite 0.44 — committed BEFORE the round-3
implementation).** The blockers are dead; the round fixed the symptoms a
reviewer named and not their cause: nothing in the loop is composed for
where the player stands. Measured: from the interaction spot the six
lanterns project to NDC y 1.35–1.48 (35–48 % above the top of the
frame); the relight flash is gone in 350 ms; `lanterns-lit` has no text;
and `check-errand-shell` passed "string lit" from a state flag while its
own captured frame contained no lantern. Also: bow tips the head
BACKWARDS (head.x −= where nod uses +=; peak +0.729 chin-up) with gaze
still craning; a 126° single-frame arm snap when a line advances
mid-envelope; three of nine lines finish acting before the text; position
saved only at six quest events (5.6 m teleport on F5); a corrupt player
array bricks the run; `done + lit:false` restores verbatim.

Targets, each with its number to move:
- **Payoff staged for the interaction spot.** On `lanterns-lit` the camera
  pitches up and holds on the string for 1.5 s (`hero` boom pitch to the
  string's centroid, eased in/out), the event carries text ("the string
  wakes"), and the flash becomes a persistent low practical (the string's
  own glow is the light). Gate: the shell gate's er3-relit frame is
  asserted ON — lantern pixels (ID-mask, lantern glow meshes) ≥ 0.5 % of
  the frame from the interaction spot through the play camera. A state
  flag no longer passes this row.
- **Gesture blend-out**: `direct()` cross-fades 0.15 s — the outgoing
  envelope keeps running with a falling weight while the new one rises;
  stateless per frame is preserved (both are functions of time).
  Number: max single-frame joint delta across a mid-envelope line advance
  ≤ 0.35 rad (was 126° ≈ 2.2 rad).
- **Gesture shape**: bow's head sign fixed (head down with the torso);
  gaze damped to zero over the bow. Gate: `check-performer-shape.mjs` —
  a signed-direction table per verb (nod: head.x +; shake: head.y
  alternates; bow: spine.x − AND head.x +; wave/point/open_hand: upperArmR
  raised; lean_in: spine.x −; lean_back: spine.x +; tilt_left/right:
  head.z ±; small_shrug: shoulders up) checked at the envelope peak; a
  Performer playing any verb backwards fails.
- **Acting paced to the line**: gesture duration scales to
  max(DURATION, text.length ÷ 42 s × 0.9) so the pose outlives the
  typewriter; lines longer than one gesture get an idle-gesture cadence
  (a second, softer gesture at the midpoint). Number: 0 of 9 lines finish
  acting before the text (was 3 of 9).
- **Persistence**: position saved continuously (every 0.5 s while moving,
  and on move→idle); `reloadAndCompare` WALKS 3 m between the save and the
  reload; the shell payload is validated like the quest payload
  (`Number.isFinite` on every component, else fresh); `done` implies
  `lit` (an inconsistent snapshot restores fresh).
- **The corner at evening**: sun 2.0 → the dusk phase (DayNight 'dusk'
  from the start; the string being dark is then a contradiction the
  player can see); candles pop in under a short spawn puff; bursts at
  the event's own height, not y = 1.1; `Look` on the string during find
  reads as a look (a soft tick + "still dark"), not `ui-deny`.
- Observability gate: a refused press returns `{ok:false}`; `ok:true` is
  reserved for a state change or a truthful event.
