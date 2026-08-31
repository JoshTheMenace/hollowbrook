import test from "node:test";
import assert from "node:assert/strict";
import { replyForTranscript, wordToVisemes } from "../src/speech.js";

test("maps speech text into a compact mouth-shape sequence", () => {
  assert.deepEqual(wordToVisemes("Mira"), ["M", "E", "L", "A"]);
  assert.deepEqual(wordToVisemes("book"), ["M", "O", "S"]);
  assert.deepEqual(wordToVisemes("..."), []);
});

test("builds a deterministic spoken reply from final transcription", () => {
  assert.match(replyForTranscript("hello there"), /I'm Mira/);
  assert.match(replyForTranscript("animation please"), /separate channels/);
  assert.match(replyForTranscript("I like this"), /I heard you say/);
});
