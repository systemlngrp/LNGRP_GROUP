import { test } from "node:test";
import assert from "node:assert/strict";
import { getTableScrollAction, isActionHeaderLabel } from "./ResizableTables";

const metrics = {
  clientHeight: 500,
  clientWidth: 600,
  scrollHeight: 1800,
  scrollTop: 250,
  scrollWidth: 2400,
  scrollLeft: 300,
};

test("table keyboard scrolling maps arrows and paging to the correct axis", () => {
  assert.deepEqual(getTableScrollAction("ArrowRight", false, metrics), { direction: "right", left: 40, top: 0 });
  assert.deepEqual(getTableScrollAction("ArrowDown", false, metrics), { direction: "down", left: 0, top: 40 });
  assert.deepEqual(getTableScrollAction("PageDown", false, metrics), { direction: "down", left: 0, top: 450 });
});

test("table keyboard scrolling maps Home and End to horizontal or vertical edges", () => {
  assert.deepEqual(getTableScrollAction("Home", false, metrics), { direction: "left", left: -300, top: 0 });
  assert.deepEqual(getTableScrollAction("End", false, metrics), { direction: "right", left: 1500, top: 0 });
  assert.deepEqual(getTableScrollAction("Home", true, metrics), { direction: "up", left: 0, top: -250 });
  assert.deepEqual(getTableScrollAction("End", true, metrics), { direction: "down", left: 0, top: 1050 });
});

test("unsupported keys do not move the table", () => {
  assert.equal(getTableScrollAction("Enter", false, metrics), null);
});

test("action header labels are recognized for fixed action columns", () => {
  assert.equal(isActionHeaderLabel("Action"), true);
  assert.equal(isActionHeaderLabel(" ACTIONS "), true);
  assert.equal(isActionHeaderLabel("Operations"), true);
  assert.equal(isActionHeaderLabel("Status"), false);
});
