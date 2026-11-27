import crypto from "node:crypto";
import { computeLiveStock, countsAfterCutoff, } from "./liveStockCompute.js";
// Live FG / PHP / Plate stock of Unit-II from the physical count (see liveStockCompute.ts).
// Opening rows: physical_stock_openings. Cutoff (time, ids saved before it, PHP/Plate job
// output at the cutoff): live_stock_cutoffs, latest row wins.
/** Jobs from this date were made in the app: their own record is their stock. */
const APP_START_DATE = "2026-11-17";
const parse = (value) => {
    if (Array.isArray(value))
        return value;
    if (value && typeof value === "object")
        return value;
    try {
        return value ? JSON.parse(String(value)) : null;
    }
    catch {
        return null;
    }
};
const arr = (value) => (Array.isArray(parse(value)) ? parse(value) : []);
const s = (value) => String(value ?? "").trim();
const n = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};
const sourceOf = (value) => {
    const raw = s(value).toUpperCase();
    return raw === "PHP" || raw === "PLATE" ? raw : raw === "" || raw === "FG" ? "FG" : "";
};
// What one slip takes out of stock. Shared by the live stock report and the save check,
// so both always agree. Linked PHP / Plate on an FG slip are counted from the FG slip's
// phpDetails / plateDetails (their own php / plate slips are often missing since Nov-2026),
// so php / plate slips linked to an FG slip (fgLoadingId) are not counted again.
function slipMovements(entity, row, erpFor, jobErp) {
    const out = [];
    if (["cancelled", "canceled"].includes(s(row?.status).toLowerCase()))
        return out;
    if (entity === "loading_slips" && s(row?.slipNo).startsWith("LNCB-1/"))
        return out;
    if (entity !== "loading_slips" && s(row?.fgLoadingId))
        return out;
    const fallback = entity === "php_loading_slips" ? "PHP" : entity === "plate_loading_slips" ? "PLATE" : "FG";
    for (const line of arr(row?.lines)) {
        const type = entity === "loading_slips" ? sourceOf(line.itemSource) : sourceOf(line.itemSource || fallback) || fallback;
        if (!type)
            continue;
        out.push({ entity, id: s(row.id), date: s(row.date), itemType: type, erp: erpFor(type, line.itemId, line.erpCode), itemName: s(line.itemName), kind: "dispatched", qty: n(line.loadedQty), ref: s(row.slipNo) });
    }
    if (entity === "loading_slips") {
        for (const [field, type] of [["phpDetails", "PHP"], ["plateDetails", "PLATE"]]) {
            for (const detail of arr(row?.[field])) {
                out.push({ entity, id: s(row.id), date: s(row.date), itemType: type, erp: erpFor(type, detail.itemId, detail.erpCode), itemName: s(detail.itemName), kind: "dispatched", qty: n(detail.requiredQty), ref: `${s(row.slipNo)} (linked ${type === "PLATE" ? "Plate" : "PHP"})` });
            }
        }
        for (const w of arr(row?.jobWastage)) {
            const job = jobErp.get(s(w.jobId));
            out.push({ entity, id: s(row.id), date: s(row.date), itemType: "FG", erp: job?.erp || "", itemName: job?.name, kind: "loadingWastage", qty: n(w.qty), ref: `${s(row.slipNo)} (${s(w.jobNo)})` });
        }
    }
    return out;
}
let tablesReady = false;
async function ensureTables(db) {
    if (tablesReady)
        return;
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
async function unit2FirmId(db) {
    const [rows] = await db.query("SELECT id, firmName FROM `firms`");
    const norm = (value) => s(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
    return rows.find((firm) => {
        const name = norm(firm.firmName);
        return name.endsWith("unit2") || name.endsWith("unitii");
    })?.id || "";
}
async function loadCutoff(db) {
    const [rows] = await db.query("SELECT * FROM `live_stock_cutoffs` ORDER BY `updateTimestamp` DESC LIMIT 1");
    const row = rows[0];
    if (!row)
        return null;
    return {
        asOn: s(row.asOn),
        cutoffDate: s(row.cutoffDate),
        preCutoffIds: parse(row.preCutoffIds) || {},
        jobBaselines: parse(row.jobBaselines) || {},
    };
}
export async function buildLiveStock(db) {
    await ensureTables(db);
    const cutoff = await loadCutoff(db);
    if (!cutoff)
        return { cutoff: null, rows: [], context: null };
    const from = cutoff.cutoffDate;
    const unit2 = await unit2FirmId(db);
    const [openingRows] = await db.query("SELECT itemType, erp, itemName, qty FROM `physical_stock_openings` WHERE `asOn` = ?", [cutoff.asOn]);
    const openings = openingRows.map((row) => ({ itemType: s(row.itemType).toUpperCase(), erp: s(row.erp), itemName: s(row.itemName), qty: n(row.qty) }));
    // Item masters: ERP and names by id.
    const [npdRows] = await db.query("SELECT * FROM `npd`");
    const [phpRows] = await db.query("SELECT id, itemId, erpItemCode, itemName FROM `php_item_master`");
    const [plateRows] = await db.query("SELECT id, itemId, erpItemCode, itemName FROM `plate_item_master`");
    const npdById = new Map();
    const companyByErp = new Map();
    for (const row of npdRows) {
        npdById.set(s(row.id), { erp: s(row.erp), name: s(row.itemName) });
        const company = s(row.customerName || row.companyName);
        if (s(row.erp) && company && !companyByErp.has(s(row.erp)))
            companyByErp.set(s(row.erp), company);
    }
    const masterById = { PHP: new Map(), PLATE: new Map() };
    for (const [type, rows] of [["PHP", phpRows], ["PLATE", plateRows]]) {
        for (const row of rows) {
            const value = { erp: s(row.erpItemCode), name: s(row.itemName) };
            if (s(row.id))
                masterById[type].set(s(row.id), value);
            if (s(row.itemId))
                masterById[type].set(s(row.itemId), value);
        }
    }
    const itemNames = {};
    for (const value of npdById.values())
        if (value.erp && !itemNames[`FG|${value.erp}`])
            itemNames[`FG|${value.erp}`] = value.name;
    for (const type of ["PHP", "PLATE"])
        for (const value of masterById[type].values())
            if (value.erp && !itemNames[`${type}|${value.erp}`])
                itemNames[`${type}|${value.erp}`] = value.name;
    // PHP / Plate lines often carry the FG item's ERP in erpCode, so the item master decides.
    const erpFor = (type, itemId, erp) => (type === "FG" ? s(erp) || npdById.get(s(itemId))?.erp : masterById[type].get(s(itemId))?.erp || s(erp)) || "";
    const movements = [];
    // FG jobs started in the app: their whole record counts (printed - loaded - loading wastage).
    // Closed jobs count 0. Cancelled jobs do not count.
    const [appJobRows] = await db.query("SELECT id, transactionNo, masterErp, npdId, closeBy, status FROM `productions` WHERE LEFT(`date`, 10) >= ? AND COALESCE(status, '') <> 'Cancelled'", [APP_START_DATE]);
    const appJobs = new Map();
    for (const job of appJobRows) {
        const npd = npdById.get(s(job.npdId));
        appJobs.set(s(job.id), { erp: s(job.masterErp) || npd?.erp || "", name: npd?.name || "", ref: s(job.transactionNo), no: s(job.transactionNo).split("/").pop() || s(job.transactionNo), closed: s(job.closeBy).toLowerCase() === "yes" });
    }
    const countedJob = (jobId) => { const job = appJobs.get(s(jobId)); return job && !job.closed ? job : null; };
    if (appJobs.size) {
        const [printRows] = await db.query("SELECT * FROM `production_processing` WHERE machineName LIKE '%rint%' AND productionId IN (?)", [[...appJobs.keys()]]);
        for (const row of printRows) {
            const job = countedJob(row.productionId);
            if (!job)
                continue;
            movements.push({ entity: "production_processing", id: s(row.id), date: s(row.date), itemType: "FG", erp: job.erp || s(row.erp), itemName: s(row.itemName) || job.name, kind: "production", qty: n(row.qty), ref: s(row.jobNo) || job.ref, always: true, bucket: job.no });
        }
    }
    // Receipts: FG Purchase / Rejection In MRRs into Unit-II, not the automatic inter-firm ones.
    const [mrrRows] = await db.query(`SELECT * FROM \`material_in\`
     WHERE mrrType IN ('FG Purchase', 'Rejection In') AND date >= ?
       AND COALESCE(status, '') NOT IN ('Cancelled', 'Canceled')
       AND COALESCE(autoGenerated, '') <> 'Yes' AND COALESCE(interFirmFlow, '') <> 'Yes'`, [from]);
    for (const row of mrrRows) {
        const firm = s(row.destinationFirmId) || s(row.firmId);
        if (unit2 && firm && firm !== unit2)
            continue;
        const kind = s(row.mrrType) === "Rejection In" ? "receiptRejection" : "receiptPurchase";
        for (const line of arr(row.lines)) {
            const type = sourceOf(line.itemSource);
            if (!type)
                continue;
            const qty = line.invoiceQty != null && s(line.invoiceQty) !== "" ? n(line.invoiceQty) : n(line.qty);
            movements.push({ entity: "material_in", id: s(row.id), date: s(row.date), itemType: type, erp: erpFor(type, line.npdId || line.itemId, line.erpCode), itemName: s(line.itemName), kind, qty, ref: s(row.transactionNo || row.mrrNo), bucket: type === "FG" ? "Opening" : undefined });
        }
    }
    // Dispatch. FG: loading against an app job (from 17-Nov) counts whatever its date;
    // everything else (opening stock, older jobs, no job) counts after the count only.
    // Linked PHP / Plate on FG slips as before. Unit-I slips are boards / scrap.
    const [slipRows] = await db.query("SELECT * FROM `loading_slips` WHERE date >= ? AND COALESCE(status, '') <> 'Cancelled' AND COALESCE(slipNo, '') NOT LIKE 'LNCB-1/%'", [APP_START_DATE < from ? APP_START_DATE : from]);
    const wastageJobIds = new Set();
    for (const row of slipRows)
        for (const w of arr(row.jobWastage))
            if (s(w.jobId))
                wastageJobIds.add(s(w.jobId));
    const jobErp = new Map();
    if (wastageJobIds.size) {
        const [jobRows] = await db.query("SELECT id, masterErp, npdId FROM `productions` WHERE id IN (?)", [[...wastageJobIds]]);
        for (const job of jobRows) {
            const npd = npdById.get(s(job.npdId));
            jobErp.set(s(job.id), { erp: s(job.masterErp) || npd?.erp || "", name: npd?.name || "" });
        }
    }
    for (const row of slipRows) {
        const afterCount = countsAfterCutoff(cutoff, "loading_slips", s(row.id), s(row.date));
        for (const m of slipMovements("loading_slips", row, erpFor, jobErp))
            if (m.itemType !== "FG" && afterCount)
                movements.push(m);
        if (["cancelled", "canceled"].includes(s(row.status).toLowerCase()))
            continue;
        for (const line of arr(row.lines)) {
            if (sourceOf(line.itemSource) !== "FG")
                continue;
            const erp = erpFor("FG", line.itemId, line.erpCode);
            let toJobs = 0;
            for (const a of arr(line.allocations)) {
                if (s(a.sourceType) !== "job" || !appJobs.has(s(a.jobId)))
                    continue;
                toJobs += n(a.qty);
                const job = countedJob(a.jobId);
                if (job)
                    movements.push({ entity: "loading_slips", id: s(row.id), date: s(row.date), itemType: "FG", erp: job.erp || erp, itemName: s(line.itemName), kind: "dispatched", qty: n(a.qty), ref: `${s(row.slipNo)} (${job.ref})`, always: true, bucket: job.no });
            }
            const rest = n(line.loadedQty) - toJobs;
            if (afterCount && rest > 0.0001)
                movements.push({ entity: "loading_slips", id: s(row.id), date: s(row.date), itemType: "FG", erp, itemName: s(line.itemName), kind: "dispatched", qty: rest, ref: `${s(row.slipNo)} (old stock)`, bucket: "Opening" });
        }
        for (const w of arr(row.jobWastage)) {
            const isApp = appJobs.has(s(w.jobId));
            const job = countedJob(w.jobId);
            if (isApp && !job)
                continue;
            if (!isApp && !afterCount)
                continue;
            const info = jobErp.get(s(w.jobId));
            movements.push({ entity: "loading_slips", id: s(row.id), date: s(row.date), itemType: "FG", erp: job?.erp || info?.erp || "", itemName: info?.name, kind: "loadingWastage", qty: n(w.qty), ref: `${s(row.slipNo)} (${s(w.jobNo)})`, always: isApp, bucket: job ? job.no : "Opening" });
        }
    }
    for (const [table, type] of [["php_loading_slips", "PHP"], ["plate_loading_slips", "PLATE"]]) {
        const [rows] = await db.query(`SELECT * FROM \`${table}\` WHERE date >= ? AND COALESCE(status, '') <> 'Cancelled'`, [from]);
        for (const row of rows)
            movements.push(...slipMovements(table, row, erpFor, jobErp));
    }
    // PHP / Plate production: job output since the cutoff.
    const jobOutputs = [];
    for (const [table, type] of [["php_job_master", "PHP"], ["plate_job_master", "PLATE"]]) {
        const [rows] = await db.query(`SELECT * FROM \`${table}\``);
        for (const row of rows) {
            if (s(row.status) === "Cancelled" || s(row.cancelTimestamp))
                continue;
            const master = masterById[type].get(s(row.itemId));
            jobOutputs.push({ entity: table, id: s(row.id), date: s(row.date), itemType: type, erp: master?.erp || s(row.erpCode) || "", itemName: master?.name, output: n(row.productionOutputQty), ref: s(row.transactionNo) });
        }
    }
    const rows = computeLiveStock({ cutoff, openings, movements, jobOutputs, itemNames })
        .map((row) => (row.itemType === "FG" ? { ...row, company: companyByErp.get(row.erp) || "" } : row));
    return { cutoff: { asOn: cutoff.asOn, cutoffDate: cutoff.cutoffDate }, rows, context: { cutoff, erpFor, npdById, jobErp } };
}
export const LIVE_STOCK_SLIP_ENTITIES = ["loading_slips", "php_loading_slips", "plate_loading_slips"];
// Block a slip save that would take any item's live stock (physical count + movements
// since the cutoff) below zero. Only the change made by this save is checked, so an
// item that is already short can still be reduced or left as it is.
export async function checkSlipsAgainstLiveStock(db, entity, incoming) {
    const rowsIn = incoming.filter((row) => row && typeof row === "object" && s(row.id));
    if (!rowsIn.length)
        return [];
    const live = await buildLiveStock(db);
    if (!live.context)
        return [];
    const { cutoff, erpFor, jobErp } = live.context;
    const ids = rowsIn.map((row) => s(row.id));
    const [storedRows] = await db.query(`SELECT * FROM \`${entity}\` WHERE id IN (?)`, [ids]);
    const storedById = new Map(storedRows.map((row) => [s(row.id), row]));
    const missingJobs = new Set();
    for (const row of rowsIn)
        for (const w of arr(row.jobWastage))
            if (s(w.jobId) && !jobErp.has(s(w.jobId)))
                missingJobs.add(s(w.jobId));
    if (missingJobs.size) {
        const [jobRows] = await db.query("SELECT id, masterErp, npdId FROM `productions` WHERE id IN (?)", [[...missingJobs]]);
        for (const job of jobRows) {
            const npd = live.context.npdById.get(s(job.npdId));
            jobErp.set(s(job.id), { erp: s(job.masterErp) || npd?.erp || "", name: npd?.name || "" });
        }
    }
    const delta = new Map();
    const names = new Map();
    const add = (movements, sign, table) => {
        for (const m of movements) {
            if (!m.erp || !countsAfterCutoff(cutoff, table, m.id, m.date))
                continue;
            const key = `${m.itemType}|${m.erp}`;
            delta.set(key, (delta.get(key) || 0) + sign * m.qty);
            if (m.itemName && !names.has(key))
                names.set(key, m.itemName);
        }
    };
    for (const row of rowsIn) {
        const stored = storedById.get(s(row.id));
        const next = { ...(stored || {}), ...row };
        add(slipMovements(entity, next, erpFor, jobErp), 1, entity);
        if (stored)
            add(slipMovements(entity, stored, erpFor, jobErp), -1, entity);
    }
    const liveByKey = new Map(live.rows.map((row) => [`${row.itemType}|${row.erp}`, row]));
    const errors = [];
    for (const [key, change] of delta) {
        if (change <= 0.0001)
            continue;
        // Wastage scrap (Corrugated Wastage Scrap, Wastage Scrap Core Pipe) is not in the physical count: never blocked.
        const [, keyErp] = key.split("|");
        if (NO_STOCK_CHECK_ERPS.has(keyErp) || /scrap/i.test(liveByKey.get(key)?.itemName || names.get(key) || ""))
            continue;
        const row = liveByKey.get(key);
        const current = row?.live || 0;
        const after = Math.round((current - change) * 100) / 100;
        if (after >= -0.0001)
            continue;
        const [type, erp] = key.split("|");
        const label = type === "PLATE" ? "Plate" : type;
        errors.push(`${label} ${erp} ${row?.itemName || names.get(key) || ""}: live stock ${current.toLocaleString("en-IN")}, this slip takes ${change.toLocaleString("en-IN")}, which leaves ${after.toLocaleString("en-IN")}.`);
    }
    return errors;
}
const NO_STOCK_CHECK_ERPS = new Set(["99010001", "99010004"]);
export function liveStockErrorMessage(errors) {
    return `Not enough stock (jobs from 17-Nov: printed − loaded − wastage; older stock: physical count as on 26-Nov-2026 5 PM − loaded since). Stock cannot go below zero:\n${errors.join("\n")}\nIf the stock is really there, ask Admin to add an adjustment row in the physical count.`;
}
export function registerLiveStock(app, getPool, getRequestUser, canView) {
    const isAdmin = (user) => s(user?.role) === "Admin";
    app.get("/api/live-stock", async (req, res) => {
        const user = await getRequestUser(req);
        if (!user)
            return res.status(401).json({ error: "Unauthorized" });
        if (!canView(user))
            return res.status(403).json({ error: "Forbidden" });
        try {
            const db = await getPool();
            if (!db)
                return res.status(503).json({ error: "DB connection not available" });
            const { cutoff, rows } = await buildLiveStock(db);
            return res.json({ cutoff, rows });
        }
        catch (error) {
            console.error("[LIVE_STOCK] failed", error.message);
            return res.status(500).json({ error: isAdmin(user) ? `Failed to build live stock: ${error.message}` : "Failed to build live stock" });
        }
    });
    // Any signed-in user: would saving these slips take any item below zero?
    app.post("/api/live-stock/check", async (req, res) => {
        const user = await getRequestUser(req);
        if (!user)
            return res.status(401).json({ error: "Unauthorized" });
        const entity = s(req.body?.entity);
        if (!LIVE_STOCK_SLIP_ENTITIES.includes(entity))
            return res.status(400).json({ error: "Unknown entity" });
        const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
        try {
            const db = await getPool();
            if (!db)
                return res.status(503).json({ error: "DB connection not available" });
            const errors = await checkSlipsAgainstLiveStock(db, entity, rows);
            return res.json({ ok: errors.length === 0, errors, message: errors.length ? liveStockErrorMessage(errors) : "" });
        }
        catch (error) {
            console.error("[LIVE_STOCK] check failed", error.message);
            return res.status(500).json({ error: "Could not check live stock. Please try again." });
        }
    });
    // Admin: correct the output of a PHP / Plate job after it was entered, with a reason.
    // Each change is logged on the job (outputCorrections). A reduction may not take the
    // item's live stock below zero. Jobs made on the corrugator get their output from the
    // FG job's printing, so they are corrected there, not here.
    app.post("/api/live-stock/job-output", async (req, res) => {
        const user = await getRequestUser(req);
        if (!user)
            return res.status(401).json({ error: "Unauthorized" });
        if (!isAdmin(user))
            return res.status(403).json({ error: "Admin only" });
        const source = s(req.body?.source).toUpperCase();
        const jobId = s(req.body?.jobId);
        const reason = s(req.body?.reason);
        const newOutput = Number(req.body?.newOutput);
        if (!["PHP", "PLATE"].includes(source) || !jobId)
            return res.status(400).json({ error: "source (PHP / PLATE) and jobId are required" });
        if (!Number.isFinite(newOutput) || newOutput < 0)
            return res.status(400).json({ error: "New output must be 0 or more" });
        if (reason.length < 3)
            return res.status(400).json({ error: "Please give a reason" });
        const table = source === "PHP" ? "php_job_master" : "plate_job_master";
        try {
            const db = await getPool();
            if (!db)
                return res.status(503).json({ error: "DB connection not available" });
            const [jobRows] = await db.query(`SELECT * FROM \`${table}\` WHERE id = ? LIMIT 1`, [jobId]);
            const job = jobRows[0];
            if (!job)
                return res.status(404).json({ error: "Job not found" });
            if (s(job.status) === "Cancelled" || s(job.cancelTimestamp))
                return res.status(400).json({ error: "This job is cancelled" });
            const linkColumn = source === "PHP" ? "phpScheduledJobId" : "plateScheduledJobId";
            const [linkRows] = await db.query(`SELECT transactionNo FROM \`productions\` WHERE ${linkColumn} = ? AND COALESCE(status, '') <> 'Cancelled' LIMIT 1`, [jobId]);
            if (linkRows.length && s(job.methodology).toUpperCase() === "CORRUGATION") {
                return res.status(400).json({ error: `This job is made on the corrugator: its output comes from the printing of FG job ${s(linkRows[0].transactionNo)}. Correct the printing entry instead.` });
            }
            const oldOutput = n(job.productionOutputQty);
            const round = (value) => Math.round(value * 100) / 100;
            if (round(newOutput) === round(oldOutput))
                return res.status(400).json({ error: "The output is already " + oldOutput });
            // Stock check for a reduction: does this job's output count in live stock?
            if (newOutput < oldOutput) {
                const live = await buildLiveStock(db);
                if (live.context) {
                    const { cutoff } = live.context;
                    const counts = jobId in cutoff.jobBaselines || !s(job.date) || s(job.date).slice(0, 10) > cutoff.cutoffDate;
                    if (counts) {
                        const [masterRows] = await db.query(`SELECT erpItemCode, itemName FROM \`${source === "PHP" ? "php_item_master" : "plate_item_master"}\` WHERE id = ? OR itemId = ? LIMIT 1`, [s(job.itemId), s(job.itemId)]);
                        const erp = s(masterRows[0]?.erpItemCode) || s(job.erpCode);
                        const row = live.rows.find((item) => item.itemType === source && item.erp === erp);
                        const after = round((row?.live || 0) - (oldOutput - newOutput));
                        if (after < -0.0001) {
                            return res.status(400).json({ error: `Live stock of ${erp} ${row?.itemName || ""} is ${(row?.live || 0).toLocaleString("en-IN")}. Reducing this output by ${(oldOutput - newOutput).toLocaleString("en-IN")} would leave ${after.toLocaleString("en-IN")}: some of it has already been loaded.` });
                        }
                    }
                }
            }
            const [columnRows] = await db.query("SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'outputCorrections'", [table]);
            if (!Number(columnRows[0]?.n || 0))
                await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`outputCorrections\` LONGTEXT NULL`);
            const now = new Date().toISOString();
            const who = s(user.name || user.userId);
            const log = arr(job.outputCorrections);
            log.push({ at: now, by: who, from: oldOutput, to: round(newOutput), reason: reason.slice(0, 500) });
            await db.query(`UPDATE \`${table}\` SET productionOutputQty = ?, outputCorrections = ?, updatedBy = ?, updateTimestamp = ? WHERE id = ?`, [round(newOutput), JSON.stringify(log), who, now, jobId]);
            return res.json({ success: true, from: oldOutput, to: round(newOutput) });
        }
        catch (error) {
            console.error("[LIVE_STOCK] job output change failed", error.message);
            return res.status(500).json({ error: "Could not change the output" });
        }
    });
    // Any signed-in user: one item's live stock with its parts (Production Form).
    app.get("/api/live-stock/item", async (req, res) => {
        const user = await getRequestUser(req);
        if (!user)
            return res.status(401).json({ error: "Unauthorized" });
        const itemType = (s(req.query.type) || "FG").toUpperCase();
        const erp = s(req.query.erp);
        if (!erp)
            return res.status(400).json({ error: "erp is required" });
        try {
            const db = await getPool();
            if (!db)
                return res.status(503).json({ error: "DB connection not available" });
            const { cutoff, rows } = await buildLiveStock(db);
            const row = rows.find((item) => item.itemType === itemType && item.erp === erp);
            const empty = { itemType, erp, itemName: "", opening: 0, production: 0, receiptPurchase: 0, receiptRejection: 0, dispatched: 0, loadingWastage: 0, live: 0 };
            const { movements, ...parts } = row || { ...empty, movements: [] };
            // Printed qty (all dates) of the given jobs, for Production In Progress.
            const jobIds = s(req.query.jobs).split(",").map((id) => id.trim()).filter(Boolean).slice(0, 500);
            const printedByJob = {};
            if (jobIds.length) {
                const [printRows] = await db.query("SELECT productionId, SUM(qty) AS printed FROM `production_processing` WHERE machineName LIKE '%rint%' AND productionId IN (?) GROUP BY productionId", [jobIds]);
                for (const printRow of printRows)
                    printedByJob[s(printRow.productionId)] = n(printRow.printed);
            }
            return res.json({ cutoff, item: parts, printedByJob });
        }
        catch (error) {
            console.error("[LIVE_STOCK] item failed", error.message);
            return res.status(500).json({ error: "Could not load live stock" });
        }
    });
    // Any signed-in user: live stock per item, for the loading screens.
    app.get("/api/live-stock/levels", async (req, res) => {
        const user = await getRequestUser(req);
        if (!user)
            return res.status(401).json({ error: "Unauthorized" });
        try {
            const db = await getPool();
            if (!db)
                return res.status(503).json({ error: "DB connection not available" });
            const { cutoff, rows } = await buildLiveStock(db);
            return res.json({ cutoff, levels: Object.fromEntries(rows.map((row) => [`${row.itemType}|${row.erp}`, row.live])) });
        }
        catch (error) {
            console.error("[LIVE_STOCK] levels failed", error.message);
            return res.status(500).json({ error: "Could not load live stock" });
        }
    });
    app.get("/api/live-stock/openings", async (req, res) => {
        const user = await getRequestUser(req);
        if (!user)
            return res.status(401).json({ error: "Unauthorized" });
        if (!canView(user))
            return res.status(403).json({ error: "Forbidden" });
        try {
            const db = await getPool();
            if (!db)
                return res.status(503).json({ error: "DB connection not available" });
            await ensureTables(db);
            const [rows] = await db.query("SELECT * FROM `physical_stock_openings` ORDER BY asOn DESC, itemType, erp");
            return res.json(rows);
        }
        catch (error) {
            console.error("[LIVE_STOCK] openings failed", error.message);
            return res.status(500).json({ error: "Failed to load openings" });
        }
    });
    // Admin: replace the opening rows of the given item types for one count (asOn).
    app.post("/api/live-stock/openings", async (req, res) => {
        const user = await getRequestUser(req);
        if (!user)
            return res.status(401).json({ error: "Unauthorized" });
        if (!isAdmin(user))
            return res.status(403).json({ error: "Admin only" });
        const asOn = s(req.body?.asOn);
        const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
        const itemTypes = [...new Set(rows.map((row) => s(row.itemType).toUpperCase()))].filter((type) => ["FG", "PHP", "PLATE"].includes(type));
        if (!asOn || !rows.length || !itemTypes.length)
            return res.status(400).json({ error: "asOn and rows (itemType FG / PHP / PLATE) are required" });
        const db = await getPool();
        if (!db)
            return res.status(503).json({ error: "DB connection not available" });
        await ensureTables(db);
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query("DELETE FROM `physical_stock_openings` WHERE asOn = ? AND itemType IN (?)", [asOn, itemTypes]);
            const now = new Date().toISOString();
            for (const row of rows) {
                await conn.query("INSERT INTO `physical_stock_openings` (id, itemType, erp, itemName, qty, asOn, sourceSheet, sourceRow, remarks, updatedBy, updateTimestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [crypto.randomUUID(), s(row.itemType).toUpperCase(), s(row.erp), s(row.itemName).slice(0, 500), n(row.qty), asOn, s(row.sourceSheet).slice(0, 255), s(row.sourceRow).slice(0, 50), s(row.remarks).slice(0, 1000), s(user.name || user.userId), now]);
            }
            await conn.commit();
            return res.json({ success: true, saved: rows.length });
        }
        catch (error) {
            await conn.rollback();
            console.error("[LIVE_STOCK] save openings failed", error.message);
            return res.status(500).json({ error: "Failed to save openings" });
        }
        finally {
            conn.release();
        }
    });
    // Admin: fix the cutoff. Movements dated the cutoff day count only when their id is in
    // postCutoffIds; PHP / Plate job output at this moment becomes the baseline.
    app.post("/api/live-stock/freeze", async (req, res) => {
        const user = await getRequestUser(req);
        if (!user)
            return res.status(401).json({ error: "Unauthorized" });
        if (!isAdmin(user))
            return res.status(403).json({ error: "Admin only" });
        const asOn = s(req.body?.asOn);
        const cutoffDate = s(req.body?.cutoffDate);
        const post = (req.body?.postCutoffIds || {});
        if (!asOn || !/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate))
            return res.status(400).json({ error: "asOn and cutoffDate (YYYY-MM-DD) are required" });
        try {
            const db = await getPool();
            if (!db)
                return res.status(503).json({ error: "DB connection not available" });
            await ensureTables(db);
            const preCutoffIds = {};
            const sameDay = [
                ["production_processing", "SELECT id FROM `production_processing` WHERE date = ?"],
                ["loading_slips", "SELECT id FROM `loading_slips` WHERE date = ?"],
                ["php_loading_slips", "SELECT id FROM `php_loading_slips` WHERE date = ?"],
                ["plate_loading_slips", "SELECT id FROM `plate_loading_slips` WHERE date = ?"],
                ["material_in", "SELECT id FROM `material_in` WHERE date = ?"],
            ];
            for (const [entity, sql] of sameDay) {
                const [rows] = await db.query(sql, [cutoffDate]);
                const after = new Set((post[entity] || []).map((id) => s(id)));
                preCutoffIds[entity] = rows.map((row) => s(row.id)).filter((id) => !after.has(id));
            }
            const jobBaselines = {};
            for (const table of ["php_job_master", "plate_job_master"]) {
                const [rows] = await db.query(`SELECT id, productionOutputQty FROM \`${table}\` WHERE date <= ?`, [cutoffDate]);
                for (const row of rows)
                    jobBaselines[s(row.id)] = n(row.productionOutputQty);
            }
            const now = new Date().toISOString();
            await db.query("INSERT INTO `live_stock_cutoffs` (id, asOn, cutoffDate, preCutoffIds, jobBaselines, updatedBy, updateTimestamp) VALUES (?, ?, ?, ?, ?, ?, ?)", [crypto.randomUUID(), asOn, cutoffDate, JSON.stringify(preCutoffIds), JSON.stringify(jobBaselines), s(user.name || user.userId), now]);
            return res.json({ success: true, preCutoffCounts: Object.fromEntries(Object.entries(preCutoffIds).map(([key, ids]) => [key, ids.length])), jobBaselines: Object.keys(jobBaselines).length });
        }
        catch (error) {
            console.error("[LIVE_STOCK] freeze failed", error.message);
            return res.status(500).json({ error: "Failed to save the cutoff" });
        }
    });
}
