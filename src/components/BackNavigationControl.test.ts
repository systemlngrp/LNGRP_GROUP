import { test } from "node:test";
import assert from "node:assert/strict";
import { APP_BACK_FALLBACK, hasPreviousAppHistory } from "./BackNavigationControl";

test("back navigation uses the router history index when available", () => {
  assert.equal(hasPreviousAppHistory({ idx: 2 }), true);
  assert.equal(hasPreviousAppHistory({ idx: 0 }), false);
});

test("back navigation falls back when browser history is unavailable", () => {
  assert.equal(hasPreviousAppHistory(null), false);
  assert.equal(hasPreviousAppHistory(undefined), false);
  assert.equal(APP_BACK_FALLBACK, "/operations-dashboard");
});
