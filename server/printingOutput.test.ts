import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { withPrintingOutputTransaction } from "./printingOutput.js";

function database(link?: "php" | "plate") {
  let reports = [{ id: "r1", productionId: "job", machineName: "Printing", qty: 2001, completionStatus: "Full" }];
  let totals: Record<string, number> = { job: 0, other: 77 };
  let sourceOutput = 0;
  let snapshot: any;
  const events: string[] = [];
  let failOutput = false;
  const conn = {
    async beginTransaction() { events.push("begin"); snapshot = structuredClone({ reports, totals, sourceOutput }); },
    async commit() { events.push("commit"); },
    async rollback() { events.push("rollback"); ({ reports, totals, sourceOutput } = snapshot); },
    release() { events.push("release"); },
    async query(sql: string, args: any[]) {
      const id = args[args.length - 1];
      if (sql.includes("FOR UPDATE")) { events.push("lock:" + args[0]); return [[], []]; }
      if (sql.includes("SELECT p.id")) return [[{ id: args[0], status: "Open", ...(link ? { [link === "php" ? "phpScheduledJobId" : "plateScheduledJobId"]: "source", sourceMethodology: "CORRUGATION" } : {}) }], []];
      if (sql.includes("SUM(qty)")) {
        assert.match(sql, /LOWER\(TRIM\(machineName\)\) = 'printing'/);
        assert.ok(!sql.includes("completionStatus"));
        return [[{ output: reports.filter(r => r.productionId === args[0] && r.machineName.trim().toLowerCase() === "printing").reduce((sum, r) => sum + r.qty, 0) }], []];
      }
      if (sql.startsWith("UPDATE productions")) {
        if (failOutput) throw new Error("output failed");
        totals[id] = args[0];
      } else if (sql.startsWith("UPDATE")) sourceOutput = args[0];
      return [[], []];
    },
  };
  return {
    pool: { async getConnection() { return conn; } } as any,
    reports: () => reports,
    totals: () => totals,
    source: () => sourceOutput,
    events,
    fail() { failOutput = true; },
    add(r: any) { reports.push(r); },
    remove(id: string) { reports = reports.filter(r => r.id !== id); },
  };
}

describe("Printing FFG transactions", () => {
  it("backfills 2,001 and adds Part/Full printing without counting other machines", async () => {
    const db = database();
    await withPrintingOutputTransaction(db.pool, ["job"], async () => {});
    assert.equal(db.totals().job, 2001);
    await withPrintingOutputTransaction(db.pool, ["job"], async () => {
      db.add({ id: "r2", productionId: "job", machineName: " printing ", qty: 100, completionStatus: "Part" });
      db.add({ id: "r3", productionId: "job", machineName: "Pasting", qty: 500 });
      db.add({ id: "r4", productionId: "job", machineName: "Corrugation Liner", qty: 500 });
    });
    assert.equal(db.totals().job, 2101);
    assert.equal(db.totals().other, 77);
    assert.deepEqual(db.events.slice(0, 4), ["begin", "lock:job", "commit", "release"]);
  });
  it("recalculates edits, job moves, machine changes and final deletion", async () => {
    const db = database();
    await withPrintingOutputTransaction(db.pool, ["job"], async () => { db.reports()[0].qty = 1500; });
    assert.equal(db.totals().job, 1500);
    await withPrintingOutputTransaction(db.pool, ["other", "job", "other"], async () => { db.reports()[0].productionId = "other"; });
    assert.equal(db.totals().job, 0);
    assert.equal(db.totals().other, 1500);
    await withPrintingOutputTransaction(db.pool, ["other"], async () => { db.reports()[0].machineName = "Pasting"; });
    assert.equal(db.totals().other, 0);
    await withPrintingOutputTransaction(db.pool, ["other"], async () => { db.reports()[0].machineName = "Printing"; });
    await withPrintingOutputTransaction(db.pool, ["other"], async () => { db.remove("r1"); });
    assert.equal(db.totals().other, 0);
  });
  it("rolls back report mutations when output synchronization fails", async () => {
    const db = database(); db.fail();
    await assert.rejects(withPrintingOutputTransaction(db.pool, ["job"], async () => { db.reports()[0].qty = 3000; }), /output failed/);
    assert.equal(db.reports()[0].qty, 2001);
    assert.equal(db.totals().job, 0);
    assert.deepEqual(db.events, ["begin", "lock:job", "rollback", "release"]);
  });
  it("keeps manual FFG for non-printing changes and rolls back mutation failures", async () => {
    const db = database();
    await withPrintingOutputTransaction(db.pool, [], async () => {
      db.add({ id: "pasting", productionId: "other", machineName: "Pasting", qty: 100 });
    });
    assert.equal(db.totals().other, 77);
    await assert.rejects(withPrintingOutputTransaction(db.pool, ["job"], async () => {
      db.reports()[0].qty = 99;
      throw new Error("report failed");
    }), /report failed/);
    assert.equal(db.reports()[0].qty, 2001);
  });
  for (const source of ["php", "plate"] as const) {
    it("preserves linked " + source + " source output", async () => {
      const db = database(source);
      await withPrintingOutputTransaction(db.pool, ["job"], async () => {});
      assert.equal(db.totals().job, 2001);
      assert.equal(db.source(), 2001);
    });
  }
});
