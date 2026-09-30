import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Express } from "express";
import type mysql from "mysql2/promise";
import { ORDER_SYNC_SECRET } from "./config.js";
import { registerSalesOrderSync } from "./salesOrderSync.js";

const spreadsheetId = "1UMXRwrnrxSS9SEAfA6TUdU6cD2Sm3Y55vIr0YXwW5Lg";
const baseRow = {
  "Order Id": "sheet-order-1", "Order Date": "04/01/2026", "Company Name": "Customer",
  "ERP Code": "99240145", Item: "Wrong sheet name", Qty: "10", Rate: "5", "Firm Name": "Unit-2",
};

function makeDb(items: { id: string; itemName: string; erp: string }[]) {
  const writes: { sql: string; params: unknown[] }[] = [];
  let linkedOrderId = "";
  const conn = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    query: async (sql: string, params: unknown[] = []) => {
      if (sql.includes("FROM companies")) return [[{ id: "company-1", name: "Customer" }]];
      if (sql.includes("FROM npd WHERE")) {
        assert.deepEqual(params, ["99240145"]);
        return [items];
      }
      if (sql.includes("FROM items WHERE") || sql.includes("FROM `php_item_master` WHERE") || sql.includes("FROM `plate_item_master` WHERE")) {
        assert.deepEqual(params, ["99240145"]);
        return [[]];
      }
      if (sql.includes("FROM sales_order_sheet_links WHERE")) return [linkedOrderId ? [{ orderId: linkedOrderId }] : []];
      if (sql.includes("FROM orders WHERE id")) return [linkedOrderId ? [{ id: linkedOrderId, firmId: "firm-1", orderBy: "" }] : []];
      if (sql.includes("FROM orders o JOIN firms")) return [[]];
      if (sql.includes("FROM firms WHERE")) return [[{ id: "firm-1", firmName: "Unit-2" }]];
      if (sql.includes("FROM sales_order_sheet_schedule_links l")) return [[]];
      writes.push({ sql, params });
      if (sql.startsWith("INSERT INTO sales_order_sheet_links")) linkedOrderId = String(params[2]);
      return [[]];
    },
  };
  const db = { query: async () => [[]], getConnection: async () => conn } as unknown as mysql.Pool;
  return { db, writes };
}

async function sync(db: mysql.Pool, row = baseRow) {
  let handler: any;
  registerSalesOrderSync({ post: (_path: string, callback: any) => { handler = callback; } } as unknown as Express, async () => db);
  let body: any;
  const res = { status: () => res, json: (value: any) => { body = value; return res; } };
  await handler({ headers: { "x-order-sync-secret": ORDER_SYNC_SECRET }, body: { spreadsheetId, tabName: "Order Master", rows: [row] } }, res);
  return body.results[0];
}

describe("sales order ERP lookup", () => {
  it("uses the system item name even when the sheet name differs or is blank, then updates the same order", async () => {
    const { db, writes } = makeDb([{ id: "item-1", itemName: "System Item", erp: "99240145" }]);
    const inserted = await sync(db);
    assert.equal(inserted.status, "inserted");
    assert.equal(inserted.itemName, "System Item");
    const insert = writes.find(write => write.sql.startsWith("INSERT INTO orders ("))!;
    assert.equal(insert.params[7], "item-1");
    assert.equal(insert.params[8], "FG");
    const updated = await sync(db, { ...baseRow, Item: "" });
    assert.equal(updated.status, "updated");
    assert.equal(updated.orderId, inserted.orderId);
    assert.equal(updated.itemName, "System Item");
  });

  it("rejects a missing ERP without creating an order", async () => {
    const { db, writes } = makeDb([]);
    const result = await sync(db);
    assert.equal(result.status, "error");
    assert.match(result.error, /Item ERP 99240145: not found/);
    assert.equal(writes.some(write => write.sql.includes("INTO orders (")), false);
  });

  it("rejects an ambiguous ERP without creating an order", async () => {
    const { db, writes } = makeDb([
      { id: "item-1", itemName: "First", erp: "99240145" },
      { id: "item-2", itemName: "Second", erp: "99240145" },
    ]);
    const result = await sync(db);
    assert.equal(result.status, "error");
    assert.match(result.error, /Item ERP 99240145: ambiguous/);
    assert.equal(writes.some(write => write.sql.includes("INTO orders (")), false);
  });
});
