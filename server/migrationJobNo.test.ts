import test from "node:test";
import assert from "node:assert/strict";
import { migrationJobNoError, migrationNeedsCounterRaise, parseMigrationJobNo } from "./migrationJobNo.js";

test("parses plain old job numbers", () => {
  assert.deepEqual(parseMigrationJobNo(" JOB/25-26/6924 "), { transactionNo: "JOB/25-26/6924", fy: "25-26", number: 6924 });
  assert.equal(parseMigrationJobNo("LNCB-2/JOB/26-27/6924"), null);
  assert.equal(parseMigrationJobNo("JOB/26-27/"), null);
  assert.equal(parseMigrationJobNo("JOB/26-27/0"), null);
  assert.equal(parseMigrationJobNo(""), null);
});

test("current year: old numbers keep the counter; newer numbers raise it", () => {
  const old = parseMigrationJobNo("JOB/26-27/7949")!;
  assert.equal(migrationJobNoError(old, [], 10956, "26-27"), null);
  assert.equal(migrationNeedsCounterRaise(old, 10956, "26-27"), false);
  const newer = parseMigrationJobNo("JOB/26-27/11000")!;
  assert.equal(migrationJobNoError(newer, [], 10956, "26-27"), null);
  assert.equal(migrationNeedsCounterRaise(newer, 10956, "26-27"), true);
  assert.match(String(migrationJobNoError(old, ["abc"], 10956, "26-27")), /already exists/);
  assert.match(String(migrationJobNoError(null, [], 10956, "26-27")), /must look like/);
});

test("closed year: a number above its counter is allowed and raises that counter", () => {
  const closed = parseMigrationJobNo("JOB/25-26/6930")!;
  assert.equal(migrationJobNoError(closed, [], 6928, "26-27"), null);
  assert.equal(migrationNeedsCounterRaise(closed, 6928, "26-27"), true);
  assert.equal(migrationNeedsCounterRaise(parseMigrationJobNo("JOB/25-26/6546")!, 6928, "26-27"), false);
});
