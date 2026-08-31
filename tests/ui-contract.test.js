import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("the voice and performance controls required by the app exist", () => {
  const ids = [
    "actor", "actor-canvas", "model-loading", "microphone-button", "voice-select", "utterance-input",
    "speak-button", "stop-voice-button", "live-transcript", "voice-state", "state-controls",
    "emotion-controls", "gaze-controls", "gesture-controls", "body-controls", "camera-controls", "plan-select", "plan-editor",
    "play-button", "interrupt-button", "timeline", "event-log", "viseme-readout"
  ];
  ids.forEach(id => assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`));
});

test("the full-body actor is a project-local VRM model", () => {
  const model = readFileSync(new URL("../models/mira.vrm", import.meta.url));
  assert.equal(model.toString("ascii", 0, 4), "glTF");
  assert.ok(model.length > 1_000_000);
});
