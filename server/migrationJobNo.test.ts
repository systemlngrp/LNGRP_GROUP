import test from "node:test";
import assert from "node:assert/strict";
import { migrationJobNoError, parseMigrationJobNo } from "./migrationJobNo.js";

test("parses plain old job numbers", () => {
  assert.deepEqual(parseMigrationJobNo(" JOB/26-27/6924 "), { transactionNo: "JOB/26-27/6924", fy: "26-27", number: 6924 });
  assert.equal(parseMigrationJobNo("LNCB-2/JOB/26-27/6924"), null);
  assert.equal(parseMigrationJobNo("JOB/26-27/"), null);
  assert.equal(parseMigrationJobNo("JOB/26-27/0"), null);
  assert.equal(parseMigrationJobNo(""), null);
});

test("accepts only missing numbers at or below the highest used number", () => {
  const parsed = parseMigrationJobNo("JOB/26-27/6924");
  assert.equal(migrationJobNoError(parsed, [], 10956), null);
  assert.match(String(migrationJobNoError(parsed, ["abc"], 10956)), /already exists/);
  assert.match(String(migrationJobNoError(parseMigrationJobNo("JOB/26-27/11000"), [], 10956)), /above the highest/);
  assert.match(String(migrationJobNoError(null, [], 10956)), /must look like/);
});
