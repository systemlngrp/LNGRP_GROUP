import { n, s, isoDateText } from "./summarySheet";
import type { SummaryRow } from "./summarySheet";

/** Local yyyy-mm-dd for a date shifted by `days`. */
export const localDayKey = (days = 0, now = new Date()) => {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
export const monthStartKey = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

export type SummaryTile = {
  id: string;
  label: string;
  /** null: not recorded in the app yet (tile shows blank). */
  value: number | null;
  format: "qty" | "money" | "percent" | "count";
  /** Tailwind classes for the tile (colours taken from the Google Summary Sheet). */
  tone: string;
};

export type SummaryTileSection = { id: string; title: string; tiles: SummaryTile[] };

const blank = (id: string, label: string, tone: string, format: SummaryTile["format"] = "qty"): SummaryTile => ({ id, label, value: null, format, tone });

/**
 * Header tiles of the Google "Summary Sheet" (rows 1-5), grouped by section.
 * Today/yesterday/tomorrow tiles use the job date (sales use the dispatch
 * date); range tiles use From-To (default: this month). Tiles the app does
 * not record yet are kept, blank, in the same place as on the sheet.
 */
export function computeSummarySheetSections(
  rows: SummaryRow[],
  cancelledJobDates: string[],
  range: { from: string; to: string },
  extras: SummarySheetExtras | null,
  filters: TileFilters = { firm: "", party: "", item: "", erp: "" },
  datesChosen = false,
  now = new Date(),
): SummaryTileSection[] {
  const today = localDayKey(0, now);
  const yesterday = localDayKey(-1, now);
  const tomorrow = localDayKey(1, now);
  const inRange = (date: string) => Boolean(date) && date >= range.from && date <= range.to;
  const sum = (list: SummaryRow[], pick: (row: SummaryRow) => number) => list.reduce((total, row) => total + pick(row), 0);
  const onDay = (day: string) => rows.filter((row) => isoDateText(row.Date) === day);
  const todayRows = onDay(today);
  const tomorrowRows = onDay(tomorrow);
  const saleOn = (day: string) => sum(rows.filter((row) => isoDateText(row["Dispatch Date"]) === day), (row) => n(row["Sale Value"]));
  const planValue = (list: SummaryRow[]) => sum(list, (row) => n(row["Planned Qty"]) * n(row.Rate));
  const openRows = rows.filter((row) => s(row["Job Closed"]) !== "Yes");
  const rangeRows = rows.filter((row) => inRange(isoDateText(row.Date)));
  const usedRows = rangeRows.filter((row) => n(row["PPR Used"]) > 0);
  const paperRequired = sum(usedRows, (row) => n(row["PPR Rqd."]));
  const paperUsed = sum(rangeRows, (row) => n(row["PPR Used"]));
  const paperWastagePercent = paperRequired > 0 ? (sum(usedRows, (row) => n(row["Paper Wastage"])) / paperRequired) * 100 : 0;
  const boardlineWastage = sum(rangeRows, (row) => n(row["Boardline Wastage"]));
  const boardlineWastagePercent = paperUsed > 0 ? (boardlineWastage / paperUsed) * 100 : 0;
  const rangeSale = sum(rows.filter((row) => inRange(isoDateText(row["Dispatch Date"]))), (row) => n(row["Sale Value"]));
  // Days in the range up to today (sales per day so far).
  const rangeEnd = range.to < today ? range.to : today;
  const days = range.from && rangeEnd >= range.from ? Math.round((Date.parse(rangeEnd) - Date.parse(range.from)) / 86_400_000) + 1 : 0;
  const wastageTone = (value: number) => value <= 8 ? "bg-[#00ff00] text-slate-950" : value <= 10 ? "bg-[#ff9900] text-slate-950" : "bg-[#ff0000] text-white";
  const dueUntil = localDayKey(3, now);
  const ready = extras?.version === 2;
  const total = (records: ExtraRecord[]) => records.reduce((sum, record) => sum + record[5], 0);
  const pendingOrders = ready ? filterExtraRecords(extras.pendingOrders, filters) : [];
  const slipRecords = ready ? filterExtraRecords(extras.loadingSlips, filters, datesChosen ? range : undefined) : [];
  const invoiceRecords = ready ? filterExtraRecords(extras.invoices, filters, datesChosen ? range : undefined) : [];
  const interFirmInvoiceRecords = ready ? filterExtraRecords(extras.interFirmInvoices, filters, datesChosen ? range : undefined) : [];
  const extraValue = (value: number) => (ready ? value : null);

  return [
    {
      id: "plan",
      title: "Production Plan",
      tiles: [
        { id: "todayPlan", label: "Today's Plan", value: sum(todayRows, (row) => n(row["Planned Qty"])), format: "qty", tone: "bg-[#660000] text-white" },
        { id: "tomorrowPlan", label: "Tomorrow's Plan", value: sum(tomorrowRows, (row) => n(row["Planned Qty"])), format: "qty", tone: "bg-[#ffe599] text-slate-950" },
        { id: "todayPlanValue", label: "Plan Value", value: planValue(todayRows), format: "money", tone: "bg-[#45818e] text-white" },
        { id: "tomorrowPlanValue", label: "Tom. Plan Value", value: planValue(tomorrowRows), format: "money", tone: "bg-[#b4a7d6] text-slate-950" },
        { id: "tomorrowJobs", label: "Jobs Tomorrow", value: tomorrowRows.length, format: "count", tone: "bg-[#00ffff] text-[#ff0000]" },
        { id: "todayMeter", label: "Today's Linear Meter", value: sum(todayRows, (row) => n(row.Meter)), format: "qty", tone: "bg-[#8e7cc3] text-white" },
        blank("todayReelIssue", "Today's Reel Issue", "bg-[#00ffff] text-[#ff0000]"),
      ],
    },
    {
      id: "production",
      title: "Production Summary",
      tiles: [
        { id: "todayBoardline", label: "Today's Boardline Production", value: sum(todayRows, (row) => n(row["Boardline Prod."])), format: "qty", tone: "bg-[#9900ff] text-white" },
        { id: "todayPrinting", label: "Today's BOBST Prod.", value: sum(todayRows, (row) => n(row["Printing prod."])), format: "qty", tone: "bg-[#0000ff] text-white" },
        { id: "wip", label: "WIP", value: sum(openRows, (row) => Math.max(0, n(row["Boardline Prod."]) - n(row["Printing prod."]))), format: "qty", tone: "bg-[#00ffff] text-slate-950" },
        { id: "rangePaper", label: "Paper Used / Reel Issue (Kg)", value: paperUsed, format: "qty", tone: "bg-[#00ffff] text-slate-950" },
        { id: "rangeJobs", label: "Jobs", value: rangeRows.length, format: "count", tone: "bg-[#ffe599] text-slate-950" },
        { id: "rangeClosed", label: "Closed Jobs", value: rangeRows.filter((row) => s(row["Job Closed"]) === "Yes").length, format: "count", tone: "bg-[#d9ead3] text-slate-950" },
        { id: "rangeCancelled", label: "Cancel Jobs", value: cancelledJobDates.filter(inRange).length, format: "count", tone: "bg-[#d9ead3] text-slate-950" },
        blank("rejection", "Rejection / Short Sent", "bg-white text-slate-950"),
        blank("fgOpening", "FG Opening", "bg-white text-slate-950"),
        blank("wipOpening", "WIP Opening", "bg-white text-slate-950"),
      ],
    },
    {
      id: "sales",
      title: "Sales",
      tiles: [
        { id: "todaySale", label: "Today's Sale", value: saleOn(today), format: "money", tone: "bg-[#741b47] text-white" },
        { id: "yesterdaySale", label: "Yesterday's Sale", value: saleOn(yesterday), format: "money", tone: "bg-[#7f6000] text-white" },
        { id: "rangeSale", label: "Total Sale - Rs", value: rangeSale, format: "money", tone: "bg-[#00ff00] text-slate-950" },
        { id: "achievedPerDay", label: "Achieved Sales / Day", value: days > 0 ? rangeSale / days : 0, format: "money", tone: "bg-[#ff00ff] text-slate-950" },
        blank("targetPerDay", "Target Sales / Day", "bg-[#ff00ff] text-slate-950", "money"),
        blank("revisedTargetPerDay", "Revised Target Sales / Day", "bg-[#ff00ff] text-slate-950", "money"),
        blank("shortSales", "Short Sales Till Date", "bg-[#ff0000] text-white", "money"),
        blank("spPerKg", "SP / KG", "bg-[#0c343d] text-white", "money"),
      ],
    },
    {
      id: "orders",
      title: "Orders & Dispatch",
      tiles: [
        { id: "duePendingOrderValue", label: "Due Pending Order Value", value: extraValue(total(pendingOrders.filter(([date]) => date && date <= dueUntil))), format: "money", tone: "bg-[#ff0000] text-white" },
        { id: "totalPendingOrderValue", label: "Total Pending Order Value", value: extraValue(total(pendingOrders)), format: "money", tone: "bg-[#e06666] text-white" },
        { id: "pendingSchedulingValue", label: "Total Due Planning Value", value: extraValue(ready ? total(filterExtraRecords(extras.pendingScheduling, filters)) : 0), format: "money", tone: "bg-[#ff0000] text-white" },
        { id: "fgStockValue", label: "FG Stock Value", value: extraValue(ready ? total(filterExtraRecords(extras.fgStock, filters)) : 0), format: "money", tone: "bg-[#ffe599] text-slate-950" },
        { id: "loadingSlips", label: "Total Loading Slip", value: extraValue(slipRecords.length), format: "count", tone: "bg-[#fce5cd] text-slate-950" },
        { id: "invoices", label: "Total Inv", value: extraValue(invoiceRecords.length), format: "count", tone: "bg-[#fce5cd] text-slate-950" },
        { id: "interFirmInvoices", label: "Inter-Firm Inv", value: extraValue(interFirmInvoiceRecords.length), format: "count", tone: "bg-[#fce5cd] text-slate-950" },
        { id: "slipsNotInvoiced", label: "Loading Slip Not Invoiced", value: extraValue(slipRecords.filter((record) => record[5] === 0).length), format: "count", tone: "bg-[#ffff00] text-slate-950" },
      ],
    },
    {
      id: "wastage",
      title: "Wastage Analysis",
      tiles: [
        { id: "paperWastage", label: "P Wastage %", value: paperWastagePercent, format: "percent", tone: wastageTone(paperWastagePercent) },
        { id: "boardlineWastagePercent", label: "C Wastage %", value: boardlineWastagePercent, format: "percent", tone: "bg-[#ffff00] text-slate-950" },
        blank("dispatchWastage", "D Wastage %", "bg-[#ffff00] text-slate-950", "percent"),
        blank("totalWastage", "Total Wastage %", "bg-[#ff0000] text-white", "percent"),
        { id: "boardlineWastage", label: "Boardline Wastage (Kg)", value: boardlineWastage, format: "qty", tone: "bg-[#ffff00] text-slate-950" },
        { id: "printingWastage", label: "Printing Wastage", value: sum(rangeRows, (row) => n(row["Printing Wastage"])), format: "qty", tone: "bg-[#ffff00] text-slate-950" },
        blank("noHisab", "No Hisab (Kg)", "bg-[#ffff00] text-slate-950"),
        blank("gp", "GP %", "bg-[#ffff00] text-slate-950", "percent"),
        blank("lcd", "LCD", "bg-[#d9d2e9] text-slate-950", "money"),
      ],
    },
    {
      id: "stocks",
      title: "Stocks (Balance)",
      tiles: STORE_STOCK_TILES.map((tile) => {
        const stock = extras?.storeStocks?.[tile.id];
        if (!stock) return blank(tile.id, tile.label, tile.tone);
        // Sheet colours: up to the low level red, between light green, above green.
        const tone = stock.qty <= tile.red ? "bg-[#ff0000] text-white" : stock.qty < tile.green ? "bg-[#b7e1cd] text-slate-950" : "bg-[#00ff00] text-slate-950";
        return { id: tile.id, label: stock.unit ? `${tile.label} (${stock.unit})` : tile.label, value: stock.qty, format: "qty" as const, tone };
      }),
    },
    {
      id: "phpPlate",
      title: "PHP & Plate",
      tiles: [
        { id: "phpScheduling", label: "Pending Scheduling", value: extras?.phpPlate ? extras.phpPlate.scheduling : null, format: "count", tone: "bg-[#7f6000] text-white" },
        { id: "phpSequence", label: "Pending Sequence", value: extras?.phpPlate ? extras.phpPlate.sequence : null, format: "count", tone: "bg-[#7f6000] text-white" },
        { id: "phpProduction", label: "Pending Production", value: extras?.phpPlate ? extras.phpPlate.production : null, format: "count", tone: "bg-[#7f6000] text-white" },
      ],
    },
  ];
}

const between = (value: number, low: number, high: number) => value >= low && value <= high;
const filled = (value: unknown) => s(value) !== "";

/** Cell colours of the Google Summary Sheet's conditional formatting, per app column. */
export function summarySheetCellClass(column: string, row: SummaryRow, now = new Date()): string {
  const value = row[column];
  const num = n(value);
  switch (column) {
    case "Date":
    case "Party Name":
    case "Item Name":
    case "ERP":
    case "Planned Qty": {
      const date = isoDateText(row.Date);
      if (!date) return "";
      const today = localDayKey(0, now);
      const yesterday = localDayKey(-1, now);
      const tomorrow = localDayKey(1, now);
      if (date === today) return "bg-[#00ffff] text-slate-950 font-bold";
      if (date === yesterday) return "bg-[#e6b8af] text-slate-950 font-bold";
      if (date < yesterday) return "bg-[#fff2cc] text-[#ff0000] font-bold";
      if (date === tomorrow) return "bg-[#9fc5e8] text-slate-950 font-bold";
      return "bg-[#134f5c] text-white font-bold";
    }
    case "Job Weight":
      return filled(value) && num !== 0 ? "bg-[#a4c2f4]" : "";
    case "Customer Complaint":
      return filled(value) ? "bg-[#ff00ff]" : "";
    case "PDI REPORT":
      return /^QC P/i.test(s(value)) ? "bg-[#93c47d]" : /^QC F/i.test(s(value)) ? "bg-[#cc0000] text-white" : "";
    case "FG Stock":
      return num > 0 ? "bg-[#6d9eeb] text-white" : num < 0 ? "bg-[#ff0000] text-white" : "";
    case "App Stock":
      return num > 0 ? "bg-[#a4c2f4]" : num < 0 ? "bg-[#ff0000] text-white" : "";
    case "Plate per box":
    case "Boardline Prod.":
    case "Printing prod.":
    case "PPR Rqd.":
    case "PPR Used":
    case "Boardline Wastage":
      return num > 0 ? "bg-[#ead1dc]" : "";
    case "Paper Wastage": {
      const required = n(row["PPR Rqd."]);
      if (!filled(value) || required <= 0) return "";
      const ratio = num / required;
      if (ratio > 0.1) return "bg-[#ff0000] text-white";
      if (ratio >= 0) return "bg-[#ead1dc]";
      return "bg-[#ffff00]";
    }
    case "Printing Wastage":
      if (!filled(value)) return "";
      return num > 50 ? "bg-[#ffff00] text-[#ff0000]" : "bg-[#b6d7a8] text-[#0000ff]";
    case "Actual Realization / kg":
      if (!filled(value) || num === 0) return "";
      if (num < 41) return "bg-[#ff0000] text-white";
      if (num < 45) return "bg-[#ea9999]";
      if (num < 50) return "bg-[#d9ead3]";
      if (between(num, 50, 55)) return "bg-[#b6d7a8]";
      return "bg-[#00ff00] text-[#0000ff]";
    case "Dispatched Qty": {
      if (!filled(value) || num === 0) return "";
      const pdi = s(row["PDI REPORT"]).toUpperCase();
      if (pdi === "QC PASS") return "bg-[#00ff00]";
      if (pdi === "QC FAIL") return "bg-[#ff0000] text-white";
      return "bg-[#b7e1cd]";
    }
    case "Dispatch Date":
    case "Vehicle No":
    case "Invoice No. 1":
    case "Rate":
      return filled(value) && value !== 0 ? "bg-[#b7e1cd]" : "";
    case "FG LEFT":
      if (!filled(value)) return "";
      return num === 0 ? "bg-[#6aa84f] text-white" : num > 0 ? "bg-[#b4a7d6]" : "";
    case "FINAL FG LEFT":
      if (!filled(value)) return "";
      return num <= 25 ? "bg-[#b7e1cd]" : "bg-[#ffff00] text-[#ff0000]";
    case "Remarks": {
      const text = s(value);
      if (/CANCELLED/i.test(text)) return "bg-[#ff0000] text-white";
      if (/^Riki/i.test(text)) return "bg-[#ff9900]";
      if (/system/i.test(text)) return "bg-[#ff0000]";
      return "";
    }
    default:
      return "";
  }
}

/** [date, firm, party, item, erp, value] — kept small so the page can filter it. */
export type ExtraRecord = [string, string, string, string, string, number];
export type SummarySheetExtras = {
  version: 2;
  /** Pending dispatch value per schedule: (qty − cancel − loaded) × rate; date = scheduled date. */
  pendingOrders: ExtraRecord[];
  /** Orders waiting for scheduling: (order qty − scheduled qty) × rate; date = order date. */
  pendingScheduling: ExtraRecord[];
  /** Active loading slips; value 1 = invoiced, 0 = not invoiced; date = slip date. */
  loadingSlips: ExtraRecord[];
  /** Active invoices to customers (inter-firm invoices left out); value = invoice total; date = invoice date. */
  invoices: ExtraRecord[];
  /** Active inter-firm invoices (billed to one of our own firms). */
  interFirmInvoices?: ExtraRecord[];
  /** FG stock (positive balance) × latest order rate, per item; no date. */
  fgStock: ExtraRecord[];
  /** Store stock balance (opening + receipts − issues, as on the Materials page) by tile; null = no such material yet. */
  storeStocks?: Record<string, { qty: number; unit: string; materials: string[] } | null>;
  /** Live PHP + Plate job counts waiting on the Scheduling / Sequencing / Production screens. */
  phpPlate?: { scheduling: number; sequence: number; production: number };
};

/** Same rules as the PHP & Plate Scheduling, Sequencing and Production screens. */
function computePhpPlateCounts(lists: Record<string, any[]>) {
  const jobs = [...(lists.phpJobs || []), ...(lists.plateJobs || [])].filter((job) => job.status !== "Cancelled");
  const filled = (value: unknown) => s(value) !== "";
  const scheduling = jobs.filter((job) => !filled(job.scheduledDate) || !filled(job.shift) || !filled(job.methodology) || !(n(job.plannedQty) > 0)).length;
  const open = jobs.filter((job) => job.status !== "Completed");
  const sequence = open.filter((job) => filled(job.scheduledDate) && filled(job.shift) && filled(job.methodology) && !filled(job.sequence)).length;
  const production = open.filter((job) => filled(job.scheduledDate) && filled(job.shift) && filled(job.sequence) && (!filled(job.jobCompletionTimeOutput) || !(n(job.productionOutputQty) > 0))).length;
  return { scheduling, sequence, production };
}

/** Store stock tiles: Materials whose name contains one of the words. */
export const STORE_STOCK_TILES = [
  { id: "starch", label: "Starch", keywords: ["starch", "corrugation gum", "pasting gum"], red: 4000, green: 7000, tone: "bg-[#ffd966] text-slate-950" },
  { id: "fevicol", label: "Fevicol", keywords: ["fevicol"], red: 200, green: 400, tone: "bg-[#ffd966] text-slate-950" },
  { id: "diesel", label: "Diesel", keywords: ["diesel"], red: 500, green: 1000, tone: "bg-[#e69138] text-slate-950" },
  { id: "firewood", label: "Firewood", keywords: ["firewood", "fire wood"], red: 20000, green: 40000, tone: "bg-[#93c47d] text-slate-950" },
  { id: "strapping", label: "Strapping Roll", keywords: ["strapping"], red: 30, green: 60, tone: "bg-[#ffd966] text-slate-950" },
] as const;

/** Balance per store stock tile, same formula as the Materials page for non-reel items. */
function computeStoreStocks(lists: Record<string, any[]>) {
  const materials = (lists.materials || []).filter((material) => String(material.type || "") !== "Reel");
  const firmOpenings = new Map<string, number>();
  (lists.materialFirmOpenings || []).forEach((row) => firmOpenings.set(String(row.materialId), (firmOpenings.get(String(row.materialId)) || 0) + n(row.openingQty)));
  const receipts = new Map<string, number>();
  (lists.materialIn || []).forEach((receipt) => {
    if (receipt.mrrType === "Reel" || isCancelled(receipt)) return;
    (receipt.lines || []).forEach((line: any) => {
      const id = String(line.itemId || line.npdId || "").trim();
      if (!id || line.lineType === "Service") return;
      receipts.set(id, (receipts.get(id) || 0) + n(line.actualQty ?? line.qty ?? line.invoiceQty));
    });
  });
  const issues = new Map<string, number>();
  (lists.issueLines || []).forEach((line) => issues.set(String(line.materialId), (issues.get(String(line.materialId)) || 0) + n(line.qty)));
  const result: Record<string, { qty: number; unit: string; materials: string[] } | null> = {};
  STORE_STOCK_TILES.forEach((tile) => {
    const matched = materials.filter((material) => {
      const name = s(material.name).toLowerCase();
      return tile.keywords.some((keyword) => name.includes(keyword));
    });
    if (!matched.length) { result[tile.id] = null; return; }
    const qty = matched.reduce((sum, material) => {
      const id = String(material.id);
      const opening = firmOpenings.has(id) ? firmOpenings.get(id) || 0 : n(material.openingQty);
      return sum + opening + (receipts.get(id) || 0) - (issues.get(id) || 0);
    }, 0);
    result[tile.id] = { qty: Math.round(qty * 100) / 100, unit: s(matched[0].unit || matched[0].uom), materials: matched.map((material) => s(material.name)) };
  });
  return result;
}

const isCancelled = (row: any) => /cancel/i.test(String(row?.status || "")) || Boolean(row?.cancelledAt);

/** Extra Summary Sheet tiles that need orders, schedules, loading slips and invoices (runs on the server). */
export function computeSummarySheetExtras(lists: Record<string, any[]>, npdItems: any[]): SummarySheetExtras {
  const firmName = new Map((lists.firms || []).map((firm) => [String(firm.id), s(firm.firmName)]));
  const companyName = new Map((lists.companies || []).map((company) => [String(company.id), s(company.name || company.companyName)]));
  const itemById = new Map(npdItems.map((item) => [String(item.id), { name: s(item.name || item.itemName), erp: s(item.erp || item.erpCode) }]));
  const orders = (lists.orders || []).filter((order) => !isCancelled(order));
  const orderById = new Map(orders.map((order) => [String(order.id), order]));
  const orderFirm = (order: any) => s(order.firmName) || firmName.get(String(order.firmId)) || "";
  const orderParty = (order: any) => s(order.companyName) || companyName.get(String(order.companyId)) || "";
  const orderItem = (order: any) => itemById.get(String(order.npdId || order.itemId)) || { name: s(order.itemName), erp: s(order.erpCode) };
  const round = (value: number) => Math.round(value * 100) / 100;

  const planScheduleById = new Map((lists.plans || []).map((plan) => [String(plan.id), String(plan.scheduleId || "")]));
  const slips = (lists.slips || []).filter((slip) => !isCancelled(slip));
  const loadedBySchedule = new Map<string, number>();
  slips.forEach((slip) => (slip.lines || []).forEach((line: any) => {
    const scheduleId = planScheduleById.get(String(line?.dispatchPlanId || "").trim());
    if (scheduleId) loadedBySchedule.set(scheduleId, (loadedBySchedule.get(scheduleId) || 0) + n(line?.loadedQty));
  }));
  const pendingOrders: ExtraRecord[] = [];
  const scheduledByOrder = new Map<string, number>();
  (lists.schedules || []).forEach((schedule) => {
    const order = orderById.get(String(schedule.orderId));
    if (!order) return;
    scheduledByOrder.set(String(order.id), (scheduledByOrder.get(String(order.id)) || 0) + n(schedule.qty));
    const pending = n(schedule.qty) - n(schedule.canceledQty) - (loadedBySchedule.get(String(schedule.id)) || 0);
    if (pending <= 0) return;
    const item = orderItem(order);
    pendingOrders.push([isoDateText(schedule.scheduledDate), orderFirm(order), orderParty(order), item.name, item.erp, round(pending * n(order.rate))]);
  });
  const pendingScheduling: ExtraRecord[] = orders
    .filter((order) => order.status === "Pending Scheduling")
    .map((order) => {
      const item = orderItem(order);
      return [isoDateText(order.orderDate), orderFirm(order), orderParty(order), item.name, item.erp, round(Math.max(0, n(order.qty) - (scheduledByOrder.get(String(order.id)) || 0)) * n(order.rate))] as ExtraRecord;
    })
    .filter((record) => record[5] > 0);

  const invoiceRows = (lists.invoices || []).filter((invoice) => !isCancelled(invoice));
  const invoiceIds = new Set(invoiceRows.map((invoice) => String(invoice.id)));
  const invoicedSlipIds = new Set((lists.invoiceLines || []).filter((line) => invoiceIds.has(String(line.invoiceId))).map((line) => String(line.loadingSlipId || "")));
  const loadingSlips: ExtraRecord[] = slips.map((slip) => {
    const invoiced = (slip.invoiceId && invoiceIds.has(String(slip.invoiceId))) || invoicedSlipIds.has(String(slip.id));
    return [isoDateText(slip.date), firmName.get(String(slip.firmId)) || "", s(slip.companyName) || companyName.get(String(slip.companyId)) || "", "", "", invoiced ? 1 : 0];
  });
  // Inter-firm: marked inter-firm, or billed to a party with one of our firm names.
  const firmKey = (value: unknown) => s(value).toLowerCase().replace(/[^a-z0-9]/g, "");
  const ownFirmKeys = new Set((lists.firms || []).map((firm) => firmKey(firm.firmName)).filter(Boolean));
  const isInterFirm = (invoice: any) => s(invoice.interFirmFlow).toLowerCase() === "yes"
    || ownFirmKeys.has(firmKey(s(invoice.companyName) || companyName.get(String(invoice.companyId)) || ""));
  const toInvoiceRecord = (invoice: any): ExtraRecord => [
    isoDateText(invoice.date),
    firmName.get(String(invoice.firmId)) || "",
    s(invoice.companyName) || companyName.get(String(invoice.companyId)) || "",
    "",
    "",
    round(n(invoice.totalAfterGst)),
  ];
  const invoices: ExtraRecord[] = invoiceRows.filter((invoice) => !isInterFirm(invoice)).map(toInvoiceRecord);
  const interFirmInvoices: ExtraRecord[] = invoiceRows.filter(isInterFirm).map(toInvoiceRecord);

  // Latest order rate per FG item (by order date).
  const latestRate = new Map<string, { date: string; rate: number }>();
  orders.forEach((order) => {
    const itemId = String(order.npdId || order.itemId || "");
    const rate = n(order.rate);
    if (!itemId || rate <= 0) return;
    const date = isoDateText(order.orderDate);
    const current = latestRate.get(itemId);
    if (!current || date >= current.date) latestRate.set(itemId, { date, rate });
  });
  const fgStock: ExtraRecord[] = npdItems
    .map((item) => [
      "",
      s(item.firmName),
      "",
      s(item.name || item.itemName),
      s(item.erp || item.erpCode),
      round(Math.max(0, n(item.balance)) * (latestRate.get(String(item.id))?.rate || 0)),
    ] as ExtraRecord)
    .filter((record) => record[5] > 0);
  return { version: 2, pendingOrders, pendingScheduling, loadingSlips, invoices, interFirmInvoices, fgStock, storeStocks: computeStoreStocks(lists), phpPlate: computePhpPlateCounts(lists) };
}

/** Filters that apply to the extra records (party / item / ERP only where the record has them). */
export type TileFilters = { firm: string; party: string; item: string; erp: string };
export function filterExtraRecords(records: ExtraRecord[] | undefined, filters: TileFilters, range?: { from: string; to: string }) {
  const lower = (value: string) => value.trim().toLowerCase();
  return (records || []).filter(([date, firm, party, item, erp]) => {
    // A filter only applies where the record carries that field.
    if (filters.firm && firm && lower(firm) !== lower(filters.firm)) return false;
    if (filters.party && party && lower(party) !== lower(filters.party)) return false;
    if (filters.item && item && lower(item) !== lower(filters.item)) return false;
    if (filters.erp && erp && lower(erp) !== lower(filters.erp)) return false;
    if (range && (!date || date < range.from || date > range.to)) return false;
    return true;
  });
}
