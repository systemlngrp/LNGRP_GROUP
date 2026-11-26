import crypto from "node:crypto";
import type { Express, Request } from "express";
import type mysql from "mysql2/promise";
import {
  computeLiveStock,
  type LiveStockCutoff,
  type LiveStockItemType,
  type LiveStockJobOutput,
  type LiveStockMovement,
  type LiveStockOpening,
} from "./liveStockCompute.js";

// Live FG / PHP / Plate stock of Unit-II from the physical count (see liveStockCompute.ts).
// Opening rows: physical_stock_openings. Cutoff (time, ids saved before it, PHP/Plate job
// output at the cutoff): live_stock_cutoffs, latest row wins.

type RequestUser = { role?: string; name?: string; userId?: string } | null;

const parse = (value: unknown) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return value;
  try {
    return value ? JSON.parse(String(value)) : null;
  } catch {
    return null;
  }
};
const arr = (value: unknown): any[] => (Array.isArray(parse(value)) ? (parse(value) as any[]) : []);
const s = (value: unknown) => String(value ?? "").trim();
const n = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const sourceOf = (value: unknown): LiveStockItemType | "" => {
  const raw = s(value).toUpperCase();
  return raw === "PHP" || raw === "PLATE" ? raw : raw === "" || raw === "FG" ? "FG" : "";
};

let tablesReady = false;
async function ensureTables(db: mysql.Pool) {
  if (tablesReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS \`physical_stock_openings\` (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`itemType\` VARCHAR(10) NOT NULL,
      \`erp\` VARCHAR(64) NOT NULL,
      \`itemName\` VARCHAR(500),
      \`qty\` DECIMAL(15,2) NOT NULL DEFAULT 0,
      \`asOn\` VARCHAR(40) NOT NULL,
      \`sourceSheet\` VARCHAR(255),
      \`sourceRow\` VARCHAR(50),
      \`remarks\` VARCHAR(1000),
      \`updatedBy\` VARCHAR(255),
      \`updateTimestamp\` VARCHAR(40),
      KEY \`idx_physical_stock_openings_asOn\` (\`asOn\`)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS \`live_stock_cutoffs\` (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`asOn\` VARCHAR(40) NOT NULL,
      \`cutoffDate\` VARCHAR(10) NOT NULL,
      \`preCutoffIds\` LONGTEXT,
      \`jobBaselines\` LONGTEXT,
      \`updatedBy\` VARCHAR(255),
      \`updateTimestamp\` VARCHAR(40)
    )
  `);
  tablesReady = true;
}

async function unit2FirmId(db: mysql.Pool) {
  const [rows] = await db.query("SELECT id, firmName FROM `firms`");
  const norm = (value: unknown) => s(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
  return (rows as any[]).find((firm) => {
    const name = norm(firm.firmName);
    return name.endsWith("unit2") || name.endsWith("unitii");
  })?.id || "";
}

async function loadCutoff(db: mysql.Pool): Promise<LiveStockCutoff | null> {
  const [rows] = await db.query("SELECT * FROM `live_stock_cutoffs` ORDER BY `updateTimestamp` DESC LIMIT 1");
  const row = (rows as any[])[0];
  if (!row) return null;
  return {
    asOn: s(row.asOn),
    cutoffDate: s(row.cutoffDate),
    preCutoffIds: (parse(row.preCutoffIds) as Record<string, string[]>) || {},
    jobBaselines: (parse(row.jobBaselines) as Record<string, number>) || {},
  };
}

async function buildLiveStock(db: mysql.Pool) {
  await ensureTables(db);
  const cutoff = await loadCutoff(db);
  if (!cutoff) return { cutoff: null, rows: [] };
  const from = cutoff.cutoffDate;
  const unit2 = await unit2FirmId(db);

  const [openingRows] = await db.query("SELECT itemType, erp, itemName, qty FROM `physical_stock_openings` WHERE `asOn` = ?", [cutoff.asOn]);
  const openings: LiveStockOpening[] = (openingRows as any[]).map((row) => ({ itemType: s(row.itemType).toUpperCase() as LiveStockItemType, erp: s(row.erp), itemName: s(row.itemName), qty: n(row.qty) }));

  // Item masters: ERP and names by id.
  const [npdRows] = await db.query("SELECT id, erp, itemName FROM `npd`");
  const [phpRows] = await db.query("SELECT id, itemId, erpItemCode, itemName FROM `php_item_master`");
  const [plateRows] = await db.query("SELECT id, itemId, erpItemCode, itemName FROM `plate_item_master`");
  const npdById = new Map<string, { erp: string; name: string }>();
  for (const row of npdRows as any[]) npdById.set(s(row.id), { erp: s(row.erp), name: s(row.itemName) });
  const masterById: Record<"PHP" | "PLATE", Map<string, { erp: string; name: string }>> = { PHP: new Map(), PLATE: new Map() };
  for (const [type, rows] of [["PHP", phpRows], ["PLATE", plateRows]] as const) {
    for (const row of rows as any[]) {
      const value = { erp: s(row.erpItemCode), name: s(row.itemName) };
      if (s(row.id)) masterById[type].set(s(row.id), value);
      if (s(row.itemId)) masterById[type].set(s(row.itemId), value);
    }
  }
  const itemNames: Record<string, string> = {};
  for (const value of npdById.values()) if (value.erp && !itemNames[`FG|${value.erp}`]) itemNames[`FG|${value.erp}`] = value.name;
  for (const type of ["PHP", "PLATE"] as const) for (const value of masterById[type].values()) if (value.erp && !itemNames[`${type}|${value.erp}`]) itemNames[`${type}|${value.erp}`] = value.name;
  const erpFor = (type: LiveStockItemType, itemId: unknown, erp: unknown) => s(erp) || (type === "FG" ? npdById.get(s(itemId))?.erp : masterById[type].get(s(itemId))?.erp) || "";

  const movements: LiveStockMovement[] = [];

  // FG production: Printing entries (printed qty is already net of printing wastage).
  const [printRows] = await db.query(
    `SELECT pp.id, pp.date, pp.qty, pp.erp, pp.itemName, pp.jobNo, p.masterErp, p.npdId
     FROM \`production_processing\` pp LEFT JOIN \`productions\` p ON p.id = pp.productionId
     WHERE pp.machineName LIKE '%rint%' AND pp.date >= ?`,
    [from],
  );
  for (const row of printRows as any[]) {
    const erp = s(row.erp) || s(row.masterErp) || npdById.get(s(row.npdId))?.erp || "";
    movements.push({ entity: "production_processing", id: s(row.id), date: s(row.date), itemType: "FG", erp, itemName: s(row.itemName), kind: "production", qty: n(row.qty), ref: s(row.jobNo) });
  }

  // Receipts: FG Purchase / Rejection In MRRs into Unit-II, not the automatic inter-firm ones.
  const [mrrRows] = await db.query(
    `SELECT * FROM \`material_in\`
     WHERE mrrType IN ('FG Purchase', 'Rejection In') AND date >= ?
       AND COALESCE(status, '') NOT IN ('Cancelled', 'Canceled')
       AND COALESCE(autoGenerated, '') <> 'Yes' AND COALESCE(interFirmFlow, '') <> 'Yes'`,
    [from],
  );
  for (const row of mrrRows as any[]) {
    const firm = s(row.destinationFirmId) || s(row.firmId);
    if (unit2 && firm && firm !== unit2) continue;
    const kind = s(row.mrrType) === "Rejection In" ? "receiptRejection" : "receiptPurchase";
    for (const line of arr(row.lines)) {
      const type = sourceOf(line.itemSource);
      if (!type) continue;
      const qty = line.invoiceQty != null && s(line.invoiceQty) !== "" ? n(line.invoiceQty) : n(line.qty);
      movements.push({ entity: "material_in", id: s(row.id), date: s(row.date), itemType: type, erp: erpFor(type, line.npdId || line.itemId, line.erpCode), itemName: s(line.itemName), kind, qty, ref: s(row.transactionNo || row.mrrNo) });
    }
  }

  // Dispatch: loaded qty on loading slips (Unit-II and LNKI; Unit-I slips are boards / scrap).
  const [slipRows] = await db.query(
    "SELECT id, slipNo, date, `lines`, jobWastage FROM `loading_slips` WHERE date >= ? AND COALESCE(status, '') <> 'Cancelled' AND COALESCE(slipNo, '') NOT LIKE 'LNCB-1/%'",
    [from],
  );
  const wastageJobIds = new Set<string>();
  for (const row of slipRows as any[]) for (const w of arr(row.jobWastage)) if (s(w.jobId)) wastageJobIds.add(s(w.jobId));
  const jobErp = new Map<string, { erp: string; name: string }>();
  if (wastageJobIds.size) {
    const [jobRows] = await db.query("SELECT id, masterErp, npdId FROM `productions` WHERE id IN (?)", [[...wastageJobIds]]);
    for (const job of jobRows as any[]) {
      const npd = npdById.get(s(job.npdId));
      jobErp.set(s(job.id), { erp: s(job.masterErp) || npd?.erp || "", name: npd?.name || "" });
    }
  }
  for (const row of slipRows as any[]) {
    for (const line of arr(row.lines)) {
      const type = sourceOf(line.itemSource);
      if (!type) continue;
      movements.push({ entity: "loading_slips", id: s(row.id), date: s(row.date), itemType: type, erp: erpFor(type, line.itemId, line.erpCode), itemName: s(line.itemName), kind: "dispatched", qty: n(line.loadedQty), ref: s(row.slipNo) });
    }
    for (const w of arr(row.jobWastage)) {
      const job = jobErp.get(s(w.jobId));
      movements.push({ entity: "loading_slips", id: s(row.id), date: s(row.date), itemType: "FG", erp: job?.erp || "", itemName: job?.name, kind: "loadingWastage", qty: n(w.qty), ref: `${s(row.slipNo)} (${s(w.jobNo)})` });
    }
  }
  for (const [table, type] of [["php_loading_slips", "PHP"], ["plate_loading_slips", "PLATE"]] as const) {
    const [rows] = await db.query(`SELECT id, slipNo, date, \`lines\` FROM \`${table}\` WHERE date >= ? AND COALESCE(status, '') <> 'Cancelled'`, [from]);
    for (const row of rows as any[]) {
      for (const line of arr(row.lines)) {
        const lineType = sourceOf(line.itemSource || type) || type;
        movements.push({ entity: table, id: s(row.id), date: s(row.date), itemType: lineType, erp: erpFor(lineType, line.itemId, line.erpCode), itemName: s(line.itemName), kind: "dispatched", qty: n(line.loadedQty), ref: s(row.slipNo) });
      }
    }
  }

  // PHP / Plate production: job output since the cutoff.
  const jobOutputs: LiveStockJobOutput[] = [];
  for (const [table, type] of [["php_job_master", "PHP"], ["plate_job_master", "PLATE"]] as const) {
    const [rows] = await db.query(`SELECT * FROM \`${table}\``);
    for (const row of rows as any[]) {
      if (s(row.status) === "Cancelled" || s(row.cancelTimestamp)) continue;
      const master = masterById[type].get(s(row.itemId));
      jobOutputs.push({ entity: table, id: s(row.id), date: s(row.date), itemType: type, erp: s(row.erpCode) || master?.erp || "", itemName: master?.name, output: n(row.productionOutputQty), ref: s(row.transactionNo) });
    }
  }

  return { cutoff: { asOn: cutoff.asOn, cutoffDate: cutoff.cutoffDate }, rows: computeLiveStock({ cutoff, openings, movements, jobOutputs, itemNames }) };
}

export function registerLiveStock(
  app: Express,
  getPool: () => Promise<mysql.Pool | null>,
  getRequestUser: (req: Request) => Promise<any>,
  canView: (user: any) => boolean,
) {
  const isAdmin = (user: RequestUser) => s(user?.role) === "Admin";

  app.get("/api/live-stock", async (req, res) => {
    const user = await getRequestUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (!canView(user)) return res.status(403).json({ error: "Forbidden" });
    try {
      const db = await getPool();
      if (!db) return res.status(503).json({ error: "DB connection not available" });
      return res.json(await buildLiveStock(db));
    } catch (error) {
      console.error("[LIVE_STOCK] failed", (error as Error).message);
      return res.status(500).json({ error: "Failed to build live stock" });
    }
  });

  app.get("/api/live-stock/openings", async (req, res) => {
    const user = await getRequestUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (!canView(user)) return res.status(403).json({ error: "Forbidden" });
    try {
      const db = await getPool();
      if (!db) return res.status(503).json({ error: "DB connection not available" });
      await ensureTables(db);
      const [rows] = await db.query("SELECT * FROM `physical_stock_openings` ORDER BY asOn DESC, itemType, erp");
      return res.json(rows);
    } catch (error) {
      console.error("[LIVE_STOCK] openings failed", (error as Error).message);
      return res.status(500).json({ error: "Failed to load openings" });
    }
  });

  // Admin: replace the opening rows of the given item types for one count (asOn).
  app.post("/api/live-stock/openings", async (req, res) => {
    const user = await getRequestUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (!isAdmin(user)) return res.status(403).json({ error: "Admin only" });
    const asOn = s(req.body?.asOn);
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const itemTypes = [...new Set(rows.map((row: any) => s(row.itemType).toUpperCase()))].filter((type) => ["FG", "PHP", "PLATE"].includes(type as string)) as string[];
    if (!asOn || !rows.length || !itemTypes.length) return res.status(400).json({ error: "asOn and rows (itemType FG / PHP / PLATE) are required" });
    const db = await getPool();
    if (!db) return res.status(503).json({ error: "DB connection not available" });
    await ensureTables(db);
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query("DELETE FROM `physical_stock_openings` WHERE asOn = ? AND itemType IN (?)", [asOn, itemTypes]);
      const now = new Date().toISOString();
      for (const row of rows) {
        await conn.query(
          "INSERT INTO `physical_stock_openings` (id, itemType, erp, itemName, qty, asOn, sourceSheet, sourceRow, remarks, updatedBy, updateTimestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [crypto.randomUUID(), s(row.itemType).toUpperCase(), s(row.erp), s(row.itemName).slice(0, 500), n(row.qty), asOn, s(row.sourceSheet).slice(0, 255), s(row.sourceRow).slice(0, 50), s(row.remarks).slice(0, 1000), s(user.name || user.userId), now],
        );
      }
      await conn.commit();
      return res.json({ success: true, saved: rows.length });
    } catch (error) {
      await conn.rollback();
      console.error("[LIVE_STOCK] save openings failed", (error as Error).message);
      return res.status(500).json({ error: "Failed to save openings" });
    } finally {
      conn.release();
    }
  });

  // Admin: fix the cutoff. Movements dated the cutoff day count only when their id is in
  // postCutoffIds; PHP / Plate job output at this moment becomes the baseline.
  app.post("/api/live-stock/freeze", async (req, res) => {
    const user = await getRequestUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (!isAdmin(user)) return res.status(403).json({ error: "Admin only" });
    const asOn = s(req.body?.asOn);
    const cutoffDate = s(req.body?.cutoffDate);
    const post = (req.body?.postCutoffIds || {}) as Record<string, string[]>;
    if (!asOn || !/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)) return res.status(400).json({ error: "asOn and cutoffDate (YYYY-MM-DD) are required" });
    try {
      const db = await getPool();
      if (!db) return res.status(503).json({ error: "DB connection not available" });
      await ensureTables(db);
      const preCutoffIds: Record<string, string[]> = {};
      const sameDay: Array<[string, string]> = [
        ["production_processing", "SELECT id FROM `production_processing` WHERE date = ?"],
        ["loading_slips", "SELECT id FROM `loading_slips` WHERE date = ?"],
        ["php_loading_slips", "SELECT id FROM `php_loading_slips` WHERE date = ?"],
        ["plate_loading_slips", "SELECT id FROM `plate_loading_slips` WHERE date = ?"],
        ["material_in", "SELECT id FROM `material_in` WHERE date = ?"],
      ];
      for (const [entity, sql] of sameDay) {
        const [rows] = await db.query(sql, [cutoffDate]);
        const after = new Set((post[entity] || []).map((id) => s(id)));
        preCutoffIds[entity] = (rows as any[]).map((row) => s(row.id)).filter((id) => !after.has(id));
      }
      const jobBaselines: Record<string, number> = {};
      for (const table of ["php_job_master", "plate_job_master"]) {
        const [rows] = await db.query(`SELECT id, productionOutputQty FROM \`${table}\` WHERE date <= ?`, [cutoffDate]);
        for (const row of rows as any[]) jobBaselines[s(row.id)] = n(row.productionOutputQty);
      }
      const now = new Date().toISOString();
      await db.query(
        "INSERT INTO `live_stock_cutoffs` (id, asOn, cutoffDate, preCutoffIds, jobBaselines, updatedBy, updateTimestamp) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [crypto.randomUUID(), asOn, cutoffDate, JSON.stringify(preCutoffIds), JSON.stringify(jobBaselines), s(user.name || user.userId), now],
      );
      return res.json({ success: true, preCutoffCounts: Object.fromEntries(Object.entries(preCutoffIds).map(([key, ids]) => [key, ids.length])), jobBaselines: Object.keys(jobBaselines).length });
    } catch (error) {
      console.error("[LIVE_STOCK] freeze failed", (error as Error).message);
      return res.status(500).json({ error: "Failed to save the cutoff" });
    }
  });
}
