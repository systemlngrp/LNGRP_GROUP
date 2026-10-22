import { test } from "node:test";
import assert from "node:assert/strict";
import { getTablePageRange, getTableScrollAction, isActionHeaderLabel, TABLE_PAGE_SIZE_OPTIONS } from "./ResizableTables";

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

test("table pagination calculates stable ranges and clamps invalid pages", () => {
  assert.deepEqual(getTablePageRange(0, 1, 25), { start: 0, end: 0, totalPages: 1 });
  assert.deepEqual(getTablePageRange(26, 1, 25), { start: 1, end: 25, totalPages: 2 });
  assert.deepEqual(getTablePageRange(26, 9, 25), { start: 26, end: 26, totalPages: 2 });
  assert.deepEqual(getTablePageRange(26, 0, 50), { start: 1, end: 26, totalPages: 1 });
});

test("shared pagination exposes the requested page-size options", () => {
  assert.deepEqual(TABLE_PAGE_SIZE_OPTIONS, [25, 50, 100, 250]);
});
