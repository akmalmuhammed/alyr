import assert from "node:assert/strict";
import test from "node:test";

import {
  alyrTokens,
  control,
  navigation,
  spacing,
} from "../dist/index.js";

test("navigation preserves the approved four-destination contract", () => {
  assert.deepEqual(navigation.primaryDestinations, [
    "home",
    "assets",
    "family",
    "vault",
  ]);
  assert.deepEqual(navigation.contextualActions, ["search", "capture"]);
});

test("touch targets and spacing meet mobile foundation constraints", () => {
  assert.ok(control.minimumTouchTarget >= 44);
  assert.equal(spacing[1], 4);
  assert.equal(alyrTokens.colors.dark.canvas, "#02060D");
});
