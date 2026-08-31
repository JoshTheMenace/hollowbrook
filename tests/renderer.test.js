import test from "node:test";
import assert from "node:assert/strict";
import { vocabulary } from "../src/contract.js";

test("the performance vocabulary exposes full-body motion", () => {
  ["wave", "point", "bow", "walk_forward", "walk_back", "strafe_left", "strafe_right", "turn_left", "turn_right", "jump", "dance"].forEach(name => assert.ok(vocabulary.gestures.includes(name), `missing ${name}`));
});
