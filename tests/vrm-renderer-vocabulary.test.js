import test from "node:test";
import assert from "node:assert/strict";
import { vocabulary } from "../src/contract.js";
import { IMPLEMENTED_GESTURES } from "../src/vrm-renderer.js";

// The audit's finding: 8 of 20 vocabulary gestures silently no-opped and
// nothing tested the renderer. This is the gate that keeps the renderer and
// the vocabulary from drifting apart again: full coverage, or the mismatch
// is a failing test the moment the vocabulary grows.
test("renderer implements the ENTIRE gesture vocabulary", () => {
  const missing = vocabulary.gestures.filter(g => !IMPLEMENTED_GESTURES.includes(g));
  assert.deepEqual(missing, [], `unimplemented gestures: ${missing.join(", ")}`);
});

test("renderer set contains no gestures outside the vocabulary", () => {
  const phantom = IMPLEMENTED_GESTURES.filter(g => !vocabulary.gestures.includes(g));
  assert.deepEqual(phantom, [], `renderer claims gestures the vocabulary lacks: ${phantom.join(", ")}`);
});
