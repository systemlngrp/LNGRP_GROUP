import crypto from "node:crypto";
import type { Express } from "express";
import type mysql from "mysql2/promise";
import { ORDER_SYNC_SECRET } from "./config.js";

const SHEET_ID = "1UMXRwrnrxSS9SEAfA6TUdU6cD2Sm3Y55vIr0YXwW5Lg";
const FIRST_DATE = "2026-04-01";
const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const cell = (row: Record<string, unknown>, name: string) => String(row[name] ?? "").trim();

export function parseSheetDate(value: unknown): string {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(`${raw}T00:00:00Z`)) ? raw : "";
  const date = new Date(Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2])));
  return date.getUTCFullYear() === Number(match[3]) && date.getUTCMonth() === Number(match[1]) - 1 && date.getUTCDate() === Number(match[2])
    ? date.toISOString().slice(0, 10) : "";
}

function quantity(value: unknown, label: string): number {
  const raw = String(value ?? "").trim().replace(/,/g, "");
  const number = Number(raw);
  if (!raw || !Number.isFinite(number) || number <= 0 || !Number.isInteger(number)) throw new Error(`${label} must be a positive whole number`);
  return number;
}

function amount(value: unknown, label: string): number {
  const raw = String(value ?? "").trim().replace(/,/g, "");
  const number = Number(raw);
  if (!raw || !Number.isFinite(number) || number < 0) throw new Error(`${label} must be a non-negative number`);
  return number;
}

export function parseSalesOrderRow(raw: Record<string, unknown>) {
  const row = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key.trim(), value]));
  const sourceId = cell(row, "Order Id");
  if (!sourceId || sourceId.length > 100) throw new Error("Order Id is missing or too long");
  const orderDate = parseSheetDate(row["Order Date"]);
  if (!orderDate) throw new Error("Order Date is invalid");
  if (orderDate < FIRST_DATE) return null;
  const company = cell(row, "Company Name");
  const erp = cell(row, "ERP Code");
  if (!company || !erp) throw new Error("Company Name and ERP Code are required");
  const qty = quantity(row.Qty, "Qty");
  const rate = amount(row.Rate, "Rate");
  const schedules: { slot: number; date: string; qty: number }[] = [];
  for (let slot = 1; slot <= 10; slot++) {
    const dateRaw = cell(row, `Scheduled Date ${slot}`);
    const qtyRaw = cell(row, `Qty ${slot}`);
    if (!dateRaw && !qtyRaw) continue;
    const date = parseSheetDate(dateRaw);
    if (!date) throw new Error(`Scheduled Date ${slot} is invalid or missing`);
    schedules.push({ slot, date, qty: quantity(qtyRaw, `Qty ${slot}`) });
  }
  if (schedules.reduce((sum, schedule) => sum + schedule.qty, 0) > qty) throw new Error("Scheduled quantity exceeds order quantity");
  return { sourceId, orderDate, company, erp, itemName: cell(row, "Item"), qty, rate, schedules,
    poNumber: cell(row, "PO Number"), poType: cell(row, "PO Type"), orderBy: cell(row, "Order By"),
    remarks: cell(row, "Remarks") };
}

async function ensureSchema(db: mysql.Pool) {
  await db.query(`CREATE TABLE IF NOT EXISTS sales_order_sheet_links (
    spreadsheetId VARCHAR(100) NOT NULL, sourceOrderId VARCHAR(100) NOT NULL,
    orderId VARCHAR(36) NOT NULL, PRIMARY KEY (spreadsheetId, sourceOrderId), UNIQUE KEY uq_sales_sheet_order (orderId)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS sales_order_sheet_schedule_links (
    spreadsheetId VARCHAR(100) NOT NULL, sourceOrderId VARCHAR(100) NOT NULL,
    slotNo TINYINT UNSIGNED NOT NULL, scheduleId VARCHAR(36) NOT NULL,
    PRIMARY KEY (spreadsheetId, sourceOrderId, slotNo), UNIQUE KEY uq_sales_sheet_schedule (scheduleId)
  )`);
}

async function oneMatch(conn: mysql.PoolConnection, sql: string, params: unknown[], label: string) {
  const [rows] = await conn.query(sql, params);
  const matches = rows as any[];
  if (matches.length !== 1) throw new Error(`${label}: ${matches.length ? "ambiguous" : "not found"}`);
  return matches[0];
}

async function syncOne(db: mysql.Pool, raw: Record<string, unknown>) {
  const parsed = parseSalesOrderRow(raw);
  if (!parsed) return { status: "before_start_date" };
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const company = await oneMatch(conn, "SELECT id, name FROM companies WHERE LOWER(TRIM(name)) = LOWER(?) LIMIT 2", [parsed.company], `Company ${parsed.company}`);
    const item = await oneMatch(conn, "SELECT id, erp, itemName, companyId FROM npd WHERE TRIM(erp) = ? AND COALESCE(syncStatus, 'active') <> 'removed' LIMIT 2", [parsed.erp], `ERP ${parsed.erp}`);
    if (item.companyId && String(item.companyId).trim() !== company.id && normalize(item.companyId) !== normalize(company.name)) throw new Error(`ERP ${parsed.erp} belongs to a different company`);
    if (parsed.itemName && normalize(parsed.itemName) !== normalize(item.itemName)) throw new Error(`ERP ${parsed.erp} item name does not match`);
    const [linkRows] = await conn.query("SELECT orderId FROM sales_order_sheet_links WHERE spreadsheetId = ? AND sourceOrderId = ? FOR UPDATE", [SHEET_ID, parsed.sourceId]);
    const orderId = (linkRows as any[])[0]?.orderId || crypto.randomUUID();
    const [oldRows] = await conn.query("SELECT id, firmId, firmName, orderBy FROM orders WHERE id = ? FOR UPDATE", [orderId]);
    const old = (oldRows as any[])[0];
    // The NPD master does not store firmId. Existing orders for this ERP/item provide the only safe inference.
    const [firmRows] = await conn.query("SELECT DISTINCT f.id, f.firmName FROM orders o JOIN firms f ON f.id = o.firmId WHERE o.itemId = ? AND COALESCE(o.firmId, '') <> '' LIMIT 2", [item.id]);
    const firms = firmRows as any[];
    const firm = old?.firmId
      ? await oneMatch(conn, "SELECT id, firmName FROM firms WHERE id = ? LIMIT 2", [old.firmId], "Existing order firm")
      : firms.length === 1 ? firms[0] : null;
    if (!firm) throw new Error(`Firm for ERP ${parsed.erp}: ${firms.length ? "ambiguous" : "not found"}`);
    let orderBy = old?.orderBy || "";
    if (parsed.orderBy) {
      const [userRows] = await conn.query("SELECT id FROM users WHERE LOWER(TRIM(name)) = LOWER(?) LIMIT 2", [parsed.orderBy]);
      if ((userRows as any[]).length !== 1) throw new Error(`Order By ${parsed.orderBy}: ${(userRows as any[]).length ? "ambiguous" : "not found"}`);
      orderBy = (userRows as any[])[0].id;
    }
    if (old) {
      await conn.query(`UPDATE orders SET orderDate=?, companyId=?, poNumber=?, erpCode=?, itemId=?, itemSource='FG', npdId=?, qty=?, rate=?, orderAmount=?, orderBy=?, poType=?, remarks=?, updatedBy='Salesman App Sync', updateTimestamp=? WHERE id=?`,
        [parsed.orderDate, company.id, parsed.poNumber, parsed.erp, item.id, item.id, parsed.qty, parsed.rate, parsed.qty * parsed.rate, orderBy, parsed.poType, parsed.remarks, new Date().toISOString(), orderId]);
    } else {
      await conn.query(`INSERT INTO orders (id, firmId, firmName, orderDate, companyId, poNumber, erpCode, itemId, itemSource, npdId, qty, rate, orderAmount, orderBy, poType, remarks, status, updatedBy, updateTimestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'FG', ?, ?, ?, ?, ?, ?, ?, 'Pending PH', 'Salesman App Sync', ?)`,
        [orderId, firm.id, firm.firmName, parsed.orderDate, company.id, parsed.poNumber, parsed.erp, item.id, item.id, parsed.qty, parsed.rate, parsed.qty * parsed.rate, orderBy, parsed.poType, parsed.remarks, new Date().toISOString()]);
      await conn.query("INSERT INTO sales_order_sheet_links (spreadsheetId, sourceOrderId, orderId) VALUES (?, ?, ?)", [SHEET_ID, parsed.sourceId, orderId]);
    }
    const [scheduleRows] = await conn.query("SELECT l.slotNo, l.scheduleId, s.scheduledDate, s.qty, s.producedQty, s.canceledQty FROM sales_order_sheet_schedule_links l JOIN orders_schedule s ON s.id=l.scheduleId WHERE l.spreadsheetId=? AND l.sourceOrderId=? FOR UPDATE", [SHEET_ID, parsed.sourceId]);
    const existing = new Map((scheduleRows as any[]).map((row) => [Number(row.slotNo), row]));
    for (const schedule of parsed.schedules) {
      const prior: any = existing.get(schedule.slot);
      if (prior) {
        existing.delete(schedule.slot);
        if (prior.scheduledDate !== schedule.date || Number(prior.qty) !== schedule.qty) {
          const [productionRows] = await conn.query("SELECT id FROM productions WHERE scheduleId = ? LIMIT 1", [prior.scheduleId]);
          if ((productionRows as any[]).length || Number(prior.producedQty) || Number(prior.canceledQty)) throw new Error(`Schedule ${schedule.slot} has production or fulfillment and cannot be changed`);
          await conn.query("UPDATE orders_schedule SET scheduledDate=?, qty=?, updatedBy='Salesman App Sync', updateTimestamp=? WHERE id=?", [schedule.date, schedule.qty, new Date().toISOString(), prior.scheduleId]);
        }
      } else {
        const scheduleId = crypto.randomUUID();
        await conn.query("INSERT INTO orders_schedule (id, orderId, firmId, firmName, scheduledDate, qty, producedQty, canceledQty, updatedBy, updateTimestamp) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'Salesman App Sync', ?)", [scheduleId, orderId, firm.id, firm.firmName, schedule.date, schedule.qty, new Date().toISOString()]);
        await conn.query("INSERT INTO sales_order_sheet_schedule_links (spreadsheetId, sourceOrderId, slotNo, scheduleId) VALUES (?, ?, ?, ?)", [SHEET_ID, parsed.sourceId, schedule.slot, scheduleId]);
      }
    }
    for (const prior of existing.values() as any) {
      const [productionRows] = await conn.query("SELECT id FROM productions WHERE scheduleId = ? LIMIT 1", [prior.scheduleId]);
      if ((productionRows as any[]).length || Number(prior.producedQty) || Number(prior.canceledQty)) throw new Error(`Schedule ${prior.slotNo} has production or fulfillment and cannot be removed`);
      await conn.query("DELETE FROM sales_order_sheet_schedule_links WHERE spreadsheetId=? AND sourceOrderId=? AND slotNo=?", [SHEET_ID, parsed.sourceId, prior.slotNo]);
      await conn.query("DELETE FROM orders_schedule WHERE id=?", [prior.scheduleId]);
    }
    await conn.commit();
    return { status: old ? "updated" : "inserted", orderId };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally { conn.release(); }
}

export function registerSalesOrderSync(app: Express, getPool: () => Promise<mysql.Pool | null>) {
  app.post("/api/sales-order-sync", async (req, res) => {
    const secret = ORDER_SYNC_SECRET;
    if (!secret) return res.status(503).json({ error: "ORDER_SYNC_SECRET is not configured" });
    if (req.headers["x-order-sync-secret"] !== secret) return res.status(401).json({ error: "Invalid sync secret" });
    if (req.body?.spreadsheetId !== SHEET_ID || req.body?.tabName !== "Order Master" || !Array.isArray(req.body?.rows) || req.body.rows.length > 100) return res.status(400).json({ error: "Invalid sheet or batch (maximum 100 rows)" });
    const db = await getPool();
    if (!db) return res.status(503).json({ error: "Database unavailable" });
    try {
      await ensureSchema(db);
      const seen = new Set<string>();
      const results = [];
      for (const row of req.body.rows as Record<string, unknown>[]) {
        const sourceId = String(row?.["Order Id"] ?? "").trim();
        if (seen.has(sourceId)) { results.push({ sourceId, status: "error", error: "Duplicate Order Id in batch" }); continue; }
        seen.add(sourceId);
        try { results.push({ sourceId, ...await syncOne(db, row) }); }
        catch (error) { results.push({ sourceId, status: "error", error: (error as Error).message }); }
      }
      return res.json({ ok: true, results });
    } catch (error) { return res.status(500).json({ error: (error as Error).message }); }
  });
}
