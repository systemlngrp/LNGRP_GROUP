import assert from "node:assert/strict";
import { createPrintingStereoDeleteHandler } from "./printingStereoDelete.js";
import { canManageMasterRecords } from "../src/lib/masterPermissions.js";

const pairedId = "STEREO-BLOCK-12345678-1234-1234-1234-123456789abc";
async function run({ role = "Admin", access = true, id = pairedId, missing = false, fail = false, authenticated = true } = {}) {
  const calls: { sql: string; values?: unknown[] }[] = [];
  let status = 200;
  let body: any;
  const conn = {
    beginTransaction: async () => { calls.push({ sql: "begin" }); },
    commit: async () => { calls.push({ sql: "commit" }); },
    rollback: async () => { calls.push({ sql: "rollback" }); },
    release: () => { calls.push({ sql: "release" }); },
    query: async (sql: string, values: unknown[]) => {
      calls.push({ sql, values });
      if (fail && sql.startsWith("DELETE FROM `qc_block_records`")) throw new Error("simulated block delete failure");
      return [sql.startsWith("SELECT") ? (missing && sql.includes("printing_stereo_records") ? [] : [{ id }]) : { affectedRows: 1 }];
    },
  };
  const handler = createPrintingStereoDeleteHandler({
    getUser: async () => authenticated ? { role } : null,
    canManage: user => canManageMasterRecords(user.role),
    hasAccess: () => access,
    getPool: async () => ({ getConnection: async () => conn }) as any,
  });
  const res = { status(code: number) { status = code; return this; }, json(value: any) { body = value; return this; } };
  await handler({ params: { id } } as any, res as any);
  return { status, body, calls };
}
for (const role of ["Admin", "QC Manager", " qc manager "]) {
  const result = await run({ role });
  assert.equal(result.status, 200);
  const deletes = result.calls.filter(call => call.sql.startsWith("DELETE"));
  assert.equal(deletes.length, 2);
  assert.deepEqual(deletes[0].values, [pairedId]);
  assert.deepEqual(deletes[1].values, [pairedId.slice(7)]);
  assert(result.calls.some(call => call.sql === "commit"));
  assert.equal(result.calls.at(-1)?.sql, "release");
}
for (const role of ["Employee", "QC Managerx", "TruckDriver"]) {
  const result = await run({ role });
  assert.equal(result.status, 403);
  assert.equal(result.calls.length, 0);
}
assert.equal((await run({ authenticated: false })).status, 401);
assert.equal((await run({ role: "QC Manager", access: false })).status, 403);
const missing = await run({ missing: true });
assert.equal(missing.status, 404);
assert(!missing.calls.some(call => call.sql.startsWith("DELETE") || call.sql === "commit"));
assert(missing.calls.some(call => call.sql === "rollback"));
const legacy = await run({ id: "legacy-stereo" });
assert.equal(legacy.status, 200);
assert(!legacy.calls.some(call => call.sql.includes("qc_block_records")));
const originalError = console.error;
console.error = () => {};
let failed;
try { failed = await run({ fail: true }); } finally { console.error = originalError; }
assert.equal(failed.status, 500);
assert(failed.calls.some(call => call.sql === "rollback"));
assert(!failed.calls.some(call => call.sql === "commit"));
assert.equal(failed.calls.at(-1)?.sql, "release");
console.log("Printing Stereo authorization and transaction tests passed.");
