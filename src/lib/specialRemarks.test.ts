import assert from "node:assert/strict";
import test from "node:test";
import type { SpecialRemarkRecord } from "../types";
import { groupSpecialRemarks } from "./specialRemarks";

function record(id: string, erpCode: string, specialRemarks: string, updateTimestamp: string, overrides: Partial<SpecialRemarkRecord> = {}): SpecialRemarkRecord {
  return {
    id,
    npdId: `npd-${id}`,
    erpCode,
    itemName: "Example Item",
    specialRemarks,
    emailAddress: "",
    updatedBy: "System Admin",
    updateDate: updateTimestamp.slice(0, 10),
    updateTimestamp,
    ...overrides,
  };
}

test("combines remarks for the same ERP chronologically and uses latest metadata", () => {
  const groups = groupSpecialRemarks([
    record("new", "1002", "Latest remark", "2026-10-13T10:00:00.000Z", { updatedBy: "New User", itemName: "Updated Item" }),
    record("old", "1002", "First remark", "2026-10-12T10:00:00.000Z"),
  ]);

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].recordIds, ["old", "new"]);
  assert.equal(groups[0].specialRemarks, "First remark\nLatest remark");
  assert.equal(groups[0].updatedBy, "New User");
  assert.equal(groups[0].itemName, "Updated Item");
});

test("keeps different ERPs in separate groups and searches older records", () => {
  const groups = groupSpecialRemarks([
    record("one", "1001", "Older remark", "2026-10-12T10:00:00.000Z"),
    record("two", "1002", "Other ERP remark", "2026-10-13T10:00:00.000Z"),
    record("three", "1001", "Newer remark", "2026-10-13T11:00:00.000Z"),
  ]);

  assert.equal(groups.length, 2);
  const first = groups.find(group => group.erpCode === "1001");
  assert.ok(first);
  assert.match(first.searchText, /older remark/);
  assert.match(first.searchText, /newer remark/);
  assert.deepEqual(first.recordIds, ["one", "three"]);
});

test("does not merge records with blank ERP codes", () => {
  const groups = groupSpecialRemarks([
    record("blank-one", "", "First", "2026-10-12T10:00:00.000Z"),
    record("blank-two", "", "Second", "2026-10-13T10:00:00.000Z"),
  ]);

  assert.equal(groups.length, 2);
});
