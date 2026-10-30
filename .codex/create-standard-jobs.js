import dotenv from "dotenv";
import mysql from "mysql2/promise";
import crypto from "crypto";
import fs from "fs";

dotenv.config();

const bk = new Set(JSON.parse(fs.readFileSync(".codex/bk-order-ids.json", "utf8")).map(String));
const clean = (v) => String(v ?? "").trim();
const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const ymd = (v) => {
  const m = clean(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : "";
};
const normSource = (v) => {
  const s = clean(v).toUpperCase();
  return s === "PHP" || s === "PLATE" || s === "MATERIAL" ? s : "FG";
};
const fy = (d) => {
  const x = new Date(d + "T00:00:00");
  let y = x.getFullYear();
  if (x.getMonth() < 3) y--;
  return String(y).slice(-2) + "-" + String(y + 1).slice(-2);
};
const esc = (v) => v === undefined || v === null || v === "" ? null : v;

(async () => {
  let db;
  try {
    db = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: Number(process.env.DB_PORT || 3306),
    });

    const [colsRows] = await db.query(
      "SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='productions'"
    );
    const cols = new Set(colsRows.map((r) => String(r.COLUMN_NAME)));

    const bkIds = [...bk].filter(Boolean);
    const [rows] = await db.query(
      "SELECT s.*, o.orderNo, o.itemId, o.npdId, o.itemSource, o.erpCode AS orderErpCode, o.companyId, o.firmId AS orderFirmId, o.firmName AS orderFirmName, o.orderDate FROM orders_schedule s JOIN orders o ON o.id=s.orderId WHERE o.orderNo IN (" + bkIds.map(() => "?").join(",") + ") ORDER BY LEFT(s.scheduledDate,10), s.id",
      bkIds
    );
    const [prodRows] = await db.query(
      "SELECT * FROM productions WHERE (cancelTimestamp IS NULL OR TRIM(cancelTimestamp)='') AND status<>'Cancelled'"
    );
    const [npdRows] = await db.query("SELECT * FROM npd");
    const [companyRows] = await db.query("SELECT * FROM companies");

    const companies = new Map(companyRows.map((r) => [clean(r.id), r]));
    const npdById = new Map(npdRows.map((r) => [clean(r.id), r]));
    const npdByErp = new Map();
    for (const r of npdRows) {
      const k = clean(r.erp || r.erpCode || r.erpItemCode || r.masterItemNameErpCode);
      if (k && !npdByErp.has(k)) npdByErp.set(k, r);
    }

    const planned = new Map();
    for (const p of prodRows) {
      const sid = clean(p.scheduleId);
      if (sid) planned.set(sid, (planned.get(sid) || 0) + num(p.qty));
    }

    const fyLabel = fy("2026-04-01");
    const [jobRows] = await db.query(
      "SELECT transactionNo FROM productions WHERE transactionNo LIKE ?",
      ["JOB/" + fyLabel + "/%"]
    );
    let max = 0;
    for (const r of jobRows) {
      const n = Number.parseInt(clean(r.transactionNo).split("/").pop() || "0", 10);
      if (Number.isFinite(n) && n > max) max = n;
    }

    const now = new Date().toISOString();
    const created = [];
    const skipped = {
      bkMissing: [],
      invalidDate: [],
      nonFg: [],
      alreadyCovered: [],
      itemMissing: [],
      boxTypeMissing: [],
    };
    const eligible = [];

    for (const s of rows) {
      const oid = clean(s.orderNo);
      const sid = clean(s.id);
      const date = ymd(s.scheduledDate);
      const qty = num(s.qty);

      if (!oid || !bk.has(oid)) {
        skipped.bkMissing.push(oid || sid);
        continue;
      }
      if (!date || qty <= 0) {
        skipped.invalidDate.push(oid || sid);
        continue;
      }
      if (normSource(s.itemSource) !== "FG") {
        skipped.nonFg.push(oid);
        continue;
      }
      const already = num(planned.get(sid));
      if (already > 0) {
        skipped.alreadyCovered.push(oid + "@" + sid);
        continue;
      }

      let item = npdById.get(clean(s.itemId))
        || npdById.get(clean(s.npdId))
        || npdByErp.get(clean(s.orderErpCode));
      if (!item) {
        skipped.itemMissing.push(oid);
        item = {
          id: "",
          erp: clean(s.orderErpCode),
          itemName: clean(s.itemName || s.orderItemName || s.orderErpCode),
          boxType: "REGULAR",
          uom: "PCS",
        };
      }

      const box = clean(item.boxType || item.jobType || item.typeName || "REGULAR");
      if (!box) {
        skipped.boxTypeMissing.push(oid);
        continue;
      }

      eligible.push({ s, oid, item, qty });
    }

    const fieldOrder = [
      "id", "transactionNo", "jobCardNo", "date", "scheduleId", "itemSource",
      "itemId", "npdId", "qty", "requiredQty", "plannedQty", "uom", "remarks",
      "status", "companyName", "firmId", "firmName", "orderFirmId", "sourceFirmId",
      "planningId", "scheduledDate", "jobType", "erpCode", "masterErp",
      "setsPerBox", "rate", "noOfParts", "ups", "length", "breadth", "height",
      "ply", "flute", "fluteType", "takeUpFactor", "l1", "f1", "l2", "l3",
      "f2", "gsm", "boardGsmReq", "brustingStrengthReq", "color1", "color2",
      "printingColor", "updatedBy", "updateTimestamp",
    ];
    const insertCols = fieldOrder.filter((c) => cols.has(c));

    await db.beginTransaction();

    for (const e of eligible) {
      const s = e.s;
      const item = e.item;
      const date = ymd(s.scheduledDate);
      const q = e.qty;
      const company = companies.get(clean(s.companyId));
      const id = crypto.randomUUID();
      const txn = "JOB/" + fy(date) + "/" + String(++max).padStart(5, "0");
      const firmId = clean(s.firmId || s.orderFirmId);
      const firmName = clean(s.firmName || s.orderFirmName);

      const raw = {
        id,
        transactionNo: txn,
        jobCardNo: txn,
        date,
        scheduleId: clean(s.id),
        itemSource: "FG",
        itemId: clean(item.id),
        npdId: clean(item.id),
        qty: q,
        requiredQty: q,
        plannedQty: q,
        uom: clean(item.uom || "PCS"),
        remarks: "Created from scheduled order",
        status: "Pending Consumption",
        companyName: clean(company?.name),
        firmId,
        firmName,
        orderFirmId: firmId,
        sourceFirmId: firmId,
        planningId: clean(s.scheduleNo || s.id),
        scheduledDate: date,
        jobType: clean(item.boxType || item.jobType || item.typeName),
        erpCode: clean(item.erp || item.erpCode || item.erpItemCode || item.masterItemNameErpCode),
        masterErp: clean(item.masterItemNameErpCode),
        setsPerBox: item.numberOfSetsPerBox,
        rate: item.rate,
        noOfParts: item.noOfParts,
        ups: item.internalUps || item.ups || item.noOfUpsForRapc,
        length: item.length,
        breadth: item.breadth,
        height: item.height,
        ply: item.ply || item.noOfPly,
        flute: item.flute || item.fluteType,
        fluteType: item.fluteType || item.flute,
        takeUpFactor: item.takeUpFactor,
        l1: item.l1,
        f1: item.f1,
        l2: item.l2,
        l3: item.l3,
        f2: item.f2,
        gsm: item.gsm || item.boardGsmReq,
        boardGsmReq: item.boardGsmReq || item.gsm,
        brustingStrengthReq: item.brustingStrengthReq,
        color1: item.color1,
        color2: item.color2,
        printingColor: item.printingColor,
        updatedBy: "System Admin",
        updateTimestamp: now,
      };

      const values = insertCols.map((c) => esc(raw[c]));
      await db.query(
        "INSERT INTO productions (" + insertCols.join(",") + ") VALUES (" +
        insertCols.map(() => "?").join(",") + ")",
        values
      );
      created.push({
        orderId: e.oid,
        scheduleId: clean(s.id),
        jobNo: txn,
        qty: q,
        date,
      });
    }

    await db.commit();

    const [v] = await db.query(
      "SELECT COUNT(*) AS n FROM productions WHERE scheduleId IS NOT NULL AND LEFT(date,10)>='2026-04-01' AND status='Pending Consumption'"
    );

    console.log(JSON.stringify({
      created: created.length,
      eligibleBeforeInsert: eligible.length,
      skipped: Object.fromEntries(Object.entries(skipped).map(([k, a]) => [k, a.length])),
      sampleCreated: created.slice(0, 5),
      pendingFgJobsAfter: v[0].n,
    }));
    await db.end();
  } catch (e) {
    try { if (db) await db.rollback(); } catch {}
    console.error(JSON.stringify({ error: e.message, code: e.code }));
    process.exit(1);
  }
})();
