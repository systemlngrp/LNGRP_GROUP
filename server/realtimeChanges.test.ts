import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractWrittenTables, getChangesSince, recordChangeVersion } from "./realtimeChanges.js";

describe("realtime change tracking", () => {
  it("ignores reads", () => {
    assert.deepEqual(extractWrittenTables("SELECT updateTimestamp FROM orders WHERE note = 'update set'"), { tables: [], unknown: false });
  });

  it("finds written tables", () => {
    assert.deepEqual(extractWrittenTables("INSERT INTO `npd` (a) VALUES (?) ON DUPLICATE KEY UPDATE a = VALUES(a)").tables, ["npd"]);
    assert.deepEqual(extractWrittenTables("UPDATE `orders` o JOIN dispatch_plans dp ON dp.orderId = o.id SET o.status = ?").tables.sort(), ["dispatch_plans", "orders"]);
    assert.deepEqual(extractWrittenTables({ sql: "DELETE FROM loading_slips WHERE id = ?" }).tables, ["loading_slips"]);
  });

  it("falls back to a full refresh for statements it cannot read", () => {
    assert.equal(extractWrittenTables("ALTER TABLE orders ADD COLUMN x INT").unknown, true);
    assert.equal(extractWrittenTables("DELETE ls FROM loading_slips ls JOIN orders o ON o.id = ls.orderId").unknown, true);
  });

  it("answers changes since a version", () => {
    recordChangeVersion(1, ["orders"]);
    recordChangeVersion(2, ["loading_slips", "dispatch_plans"]);
    assert.deepEqual(getChangesSince(2, 2), []);
    assert.deepEqual(getChangesSince(1, 2).sort(), ["dispatch_plans", "loading_slips"]);
    assert.deepEqual(getChangesSince(5, 2), ["*"]);
    recordChangeVersion(3, ["*"]);
    assert.deepEqual(getChangesSince(2, 3), ["*"]);
  });
});
