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

## Amendments

(none yet)
