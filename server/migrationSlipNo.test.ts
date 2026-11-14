import assert from "node:assert/strict";
import test from "node:test";
import { migrationSlipCounterValue, migrationSlipNoError, parseMigrationSlipNo } from "./migrationSlipNo.ts";

test("parses a slip number in the firm's own LS series only", () => {
  assert.deepEqual(parseMigrationSlipNo("LNCB-1/LS/26-27/00001", "LNCB-1", "26-27"), { slipNo: "LNCB-1/LS/26-27/00001", seriesKey: "LNCB-1/LS/26-27", number: 1 });
  assert.equal(parseMigrationSlipNo("LNCB-2/LS/26-27/00001", "LNCB-1", "26-27"), null);
  assert.equal(parseMigrationSlipNo("LNCB-1/LS/25-26/00001", "LNCB-1", "26-27"), null);
  assert.equal(parseMigrationSlipNo("LNCB-1/LS/26-27/1", "LNCB-1", "26-27"), null);
  assert.equal(parseMigrationSlipNo("LNCB-1/LS/26-27/00000", "LNCB-1", "26-27"), null);
  assert.equal(parseMigrationSlipNo("LNCB1/26-27/0001", "LNCB-1", "26-27"), null);
});

test("rejects a number used by another slip", () => {
  const parsed = parseMigrationSlipNo("LNCB-1/LS/26-27/00002", "LNCB-1", "26-27");
  assert.match(String(migrationSlipNoError(parsed, "LNCB-1/LS/26-27", ["other-id"])), /already belongs/);
  assert.equal(migrationSlipNoError(parsed, "LNCB-1/LS/26-27", []), null);
  assert.match(String(migrationSlipNoError(null, "LNCB-1/LS/26-27", [])), /LNCB-1\/LS\/26-27\/00001/);
});

test("counter becomes the highest number in use, which can lower it", () => {
  const first = parseMigrationSlipNo("LNCB-1/LS/26-27/00001", "LNCB-1", "26-27")!;
  // Renaming the only slip (00002 -> 00001): the counter drops to 1.
  assert.equal(migrationSlipCounterValue(first, []), 1);
  const third = parseMigrationSlipNo("LNCB-1/LS/26-27/00003", "LNCB-1", "26-27")!;
  assert.equal(migrationSlipCounterValue(third, ["LNCB-1/LS/26-27/00001", "LNCB-1/LS/26-27/00002"]), 3);
  assert.equal(migrationSlipCounterValue(first, ["LNCB-1/LS/26-27/00007", "LNCB-2/LS/26-27/03776"]), 7);
});
