import test from "node:test";
import assert from "node:assert/strict";
import { normalizePlan } from "../src/contract.js";
import { BehaviorEngine } from "../src/engine.js";

const plan = overrides => ({
  speech: "Fine.", state: "speaking",
  emotion: { name: "skeptical", intensity: 0.7 },
  gaze: { target: "left", intensity: 0.8 },
  gesture: { name: "small_shrug", intensity: 0.5 },
  posture: "lean_back", energy: 0.4, holdMs: 1000,
  ...overrides
});

test("rejects unknown vocabulary and malformed numeric values", () => {
  assert.throws(() => normalizePlan({ state: "flying" }), /state must be one of/);
  assert.throws(() => normalizePlan({ gesture: { name: "explode" } }), /gesture.name must be one of/);
  assert.throws(() => normalizePlan({ energy: "high" }), /energy must be a finite number/);
});

test("trims speech and clamps valid numeric ranges", () => {
  const normalized = normalizePlan({ speech: "  hello  ", emotion: { intensity: 9 }, gaze: { intensity: -2 }, energy: 2, holdMs: 99_000 });
  assert.equal(normalized.speech, "hello");
  assert.equal(normalized.state, "speaking");
  assert.equal(normalized.emotion.intensity, 1);
  assert.equal(normalized.gaze.intensity, 0);
  assert.equal(normalized.energy, 1);
  assert.equal(normalized.holdMs, 10_000);
});

test("whitespace-only speech does not imply speaking", () => {
  assert.equal(normalizePlan({ speech: "   " }).state, "idle");
});

test("preserves meaningful zero values", () => {
  const normalized = normalizePlan({ emotion: { intensity: 0 }, energy: 0, holdMs: 0 });
  assert.equal(normalized.emotion.intensity, 0);
  assert.equal(normalized.energy, 0);
  assert.equal(normalized.holdMs, 0);
});

test("applies one semantic plan as coherent renderer state", () => {
  const engine = new BehaviorEngine({ now: () => 1000, random: () => 0 });
  const result = engine.applyPlan(plan(), 1000);
  assert.equal(result.gestureAccepted, true);
  assert.deepEqual(engine.snapshot(), {
    conversation: "speaking", emotion: "skeptical", emotionIntensity: 0.7,
    gaze: "left", gazeIntensity: 0.8, gesture: "small_shrug", gestureIntensity: 0.5,
    posture: "lean_back", energy: 0.4, mouth: 0, viseme: "rest", blink: 0, breath: 0,
    speech: "Fine.", interrupted: false, lastCommandAt: 1000
  });
});

test("subscribers never see a partially applied plan", () => {
  const engine = new BehaviorEngine({ now: () => 1000, random: () => 0 });
  const seen = [];
  engine.subscribe((state, event) => { if (event) seen.push({ state, event }); });
  engine.applyPlan(plan(), 1000);
  assert.ok(seen.every(({ state }) => state.conversation === "speaking" && state.emotion === "skeptical" && state.gaze === "left"));
  assert.equal(seen[0].event.type, "plan.applied");
});

test("rejects overlapping and cooling-down gestures", () => {
  const engine = new BehaviorEngine({ now: () => 0, random: () => 0, cooldownMs: 2600 });
  engine.applyPlan(plan(), 100);
  assert.equal(engine.startGesture({ name: "point", intensity: 1 }, 200), false);
  engine.tick(1200);
  assert.equal(engine.startGesture({ name: "small_shrug", intensity: 1 }, 1300), false);
  assert.equal(engine.startGesture({ name: "small_shrug", intensity: 1 }, 2800), true);
  assert.equal(engine.events.filter(event => event.type === "gesture.rejected").length, 2);
});

test("interruption cancels speech and gesture, then recovers to listening", () => {
  const engine = new BehaviorEngine({ now: () => 0, random: () => 0 });
  engine.applyPlan(plan(), 100);
  engine.setMouth(0.8, 200);
  engine.interrupt(300);
  assert.equal(engine.snapshot().conversation, "interrupted");
  assert.equal(engine.snapshot().gesture, "none");
  assert.equal(engine.snapshot().mouth, 0);
  assert.equal(engine.snapshot().speech, "");
  engine.tick(1151);
  assert.equal(engine.snapshot().conversation, "listening");
});

test("a new plan supersedes stale interruption recovery", () => {
  const engine = new BehaviorEngine({ now: () => 0, random: () => 0 });
  engine.interrupt(0);
  engine.applyPlan(plan(), 500);
  engine.tick(900);
  assert.equal(engine.snapshot().conversation, "speaking");
});

test("duplicate interruption is idempotent", () => {
  const engine = new BehaviorEngine({ now: () => 0, random: () => 0 });
  assert.equal(engine.interrupt(0), true);
  assert.equal(engine.interrupt(100), false);
  assert.equal(engine.events.filter(event => event.type === "performance.interrupted").length, 1);
});

test("an interrupted plan obeys interruption invariants", () => {
  const engine = new BehaviorEngine({ now: () => 0, random: () => 0 });
  engine.applyPlan(plan({ state: "interrupted" }), 100);
  assert.equal(engine.snapshot().conversation, "interrupted");
  assert.equal(engine.snapshot().interrupted, true);
  assert.equal(engine.snapshot().speech, "");
  assert.equal(engine.snapshot().gesture, "none");
});

test("direct methods reject unknown state and gesture values", () => {
  const engine = new BehaviorEngine({ now: () => 0, random: () => 0 });
  assert.throws(() => engine.setConversation("flying"), /Unknown conversation state/);
  assert.throws(() => engine.startGesture({ name: "explode", intensity: 1 }), /gesture.name must be one of/);
  assert.equal(engine.snapshot().gesture, "none");
});

test("ending speech clears the completed utterance", () => {
  const engine = new BehaviorEngine({ now: () => 0, random: () => 0 });
  engine.applyPlan(plan(), 100);
  engine.setConversation("idle", 500);
  assert.equal(engine.snapshot().speech, "");
  assert.equal(engine.snapshot().mouth, 0);
});

test("visemes only animate during speech and interruption closes the mouth", () => {
  const engine = new BehaviorEngine({ now: () => 0, random: () => 0 });
  engine.setViseme("A", 1, 50);
  assert.equal(engine.snapshot().viseme, "rest");
  engine.applyPlan(plan(), 100);
  engine.setViseme("O", .8, 150);
  assert.equal(engine.snapshot().viseme, "O");
  assert.equal(engine.snapshot().mouth, .8);
  engine.interrupt(200);
  assert.equal(engine.snapshot().viseme, "rest");
  assert.equal(engine.snapshot().mouth, 0);
  assert.throws(() => engine.setViseme("TH", 1), /Unknown viseme/);
});

test("explicit gaze expires and emotion decays instead of snapping", () => {
  const engine = new BehaviorEngine({ now: () => 0, random: () => 0 });
  engine.applyPlan(plan(), 100);
  engine.tick(1101);
  assert.equal(engine.snapshot().gaze, "user");
  engine.tick(2600);
  assert.equal(engine.snapshot().emotion, "skeptical");
  assert.ok(engine.snapshot().emotionIntensity < 0.7);
  assert.ok(engine.snapshot().emotionIntensity > 0);
});

test("gaze override holds until its exact expiry boundary", () => {
  const engine = new BehaviorEngine({ now: () => 0, random: () => 0 });
  engine.setGaze("left", 1, 1000, 100);
  engine.tick(1099);
  assert.equal(engine.snapshot().gaze, "left");
  engine.tick(1100);
  assert.equal(engine.snapshot().gaze, "user");
});

test("reset invalidates pending gesture, gaze, and recovery effects", () => {
  const engine = new BehaviorEngine({ now: () => 0, random: () => 0 });
  engine.applyPlan(plan(), 100);
  engine.interrupt(200);
  engine.reset(300);
  engine.tick(5000);
  assert.equal(engine.snapshot().conversation, "idle");
  assert.equal(engine.snapshot().gesture, "none");
  assert.equal(engine.snapshot().gaze, "user");
});

test("emotion decay is independent of tick granularity", () => {
  const oneTick = new BehaviorEngine({ now: () => 0, random: () => 0 });
  const manyTicks = new BehaviorEngine({ now: () => 0, random: () => 0 });
  oneTick.applyPlan(plan(), 100);
  manyTicks.applyPlan(plan(), 100);
  oneTick.tick(4100);
  for (let at = 500; at <= 4100; at += 400) manyTicks.tick(at);
  assert.equal(oneTick.snapshot().emotionIntensity, manyTicks.snapshot().emotionIntensity);
});
