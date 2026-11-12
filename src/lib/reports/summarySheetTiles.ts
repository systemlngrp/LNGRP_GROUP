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
  const pendingEntries = Object.entries(extras?.pendingOrderValueByDate || {});
  const extraValue = (value: number | undefined) => (extras ? Number(value || 0) : null);

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
      title: "Orders & Dispatch (all firms)",
      tiles: [
        { id: "duePendingOrderValue", label: "Due Pending Order Value", value: extras ? pendingEntries.filter(([date]) => date && date <= dueUntil).reduce((total, [, value]) => total + value, 0) : null, format: "money", tone: "bg-[#ff0000] text-white" },
        { id: "totalPendingOrderValue", label: "Total Pending Order Value", value: extras ? pendingEntries.reduce((total, [, value]) => total + value, 0) : null, format: "money", tone: "bg-[#e06666] text-white" },
        { id: "pendingSchedulingValue", label: "Total Due Planning Value", value: extraValue(extras?.pendingSchedulingValue), format: "money", tone: "bg-[#ff0000] text-white" },
        { id: "fgStockValue", label: "FG Stock Value", value: extraValue(extras?.fgStockValue), format: "money", tone: "bg-[#ffe599] text-slate-950" },
        { id: "loadingSlips", label: "Total Loading Slip", value: extraValue(extras?.loadingSlips), format: "count", tone: "bg-[#fce5cd] text-slate-950" },
        { id: "invoices", label: "Total Inv", value: extraValue(extras?.invoices), format: "count", tone: "bg-[#fce5cd] text-slate-950" },
        { id: "slipsNotInvoiced", label: "Loading Slip Not Invoiced", value: extraValue(extras?.slipsNotInvoiced), format: "count", tone: "bg-[#ffff00] text-slate-950" },
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
      title: "Stocks",
      tiles: [
        blank("starch", "Starch", "bg-[#ffd966] text-slate-950"),
        blank("fevicol", "Fevicol", "bg-[#ffd966] text-slate-950"),
        blank("diesel", "Diesel", "bg-[#e69138] text-slate-950"),
        blank("firewood", "Firewood", "bg-[#93c47d] text-slate-950"),
        blank("strapping", "Strapping Roll", "bg-[#ffd966] text-slate-950"),
      ],
    },
    {
      id: "phpPlate",
      title: "PHP & Plate",
      tiles: [
        blank("phpScheduling", "Prod Scheduling", "bg-[#7f6000] text-white", "count"),
        blank("phpSequence", "Prod Sequence", "bg-[#7f6000] text-white", "count"),
        blank("phpProduction", "Prod Production", "bg-[#7f6000] text-white", "count"),
        blank("plateRequirement", "Plate / PHP Requirement", "bg-[#bf9000] text-slate-950", "count"),
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

export type SummarySheetExtras = {
  /** Pending dispatch value (schedule qty − cancel − loaded) × rate, by scheduled date. */
  pendingOrderValueByDate: Record<string, number>;
  /** Orders waiting for scheduling: (order qty − scheduled qty) × rate. */
  pendingSchedulingValue: number;
  loadingSlips: number;
  invoices: number;
  slipsNotInvoiced: number;
  /** FG stock (positive balance) × latest order rate of the item. */
  fgStockValue: number;
};

const isCancelled = (row: any) => /cancel/i.test(String(row?.status || "")) || Boolean(row?.cancelledAt);

/** Extra Summary Sheet tiles that need orders, schedules, loading slips and invoices (runs on the server). */
export function computeSummarySheetExtras(lists: Record<string, any[]>, npdItems: any[]): SummarySheetExtras {
  const orders = (lists.orders || []).filter((order) => !isCancelled(order));
  const orderById = new Map(orders.map((order) => [String(order.id), order]));
  const planScheduleById = new Map((lists.plans || []).map((plan) => [String(plan.id), String(plan.scheduleId || "")]));
  const slips = (lists.slips || []).filter((slip) => !isCancelled(slip));
  const loadedBySchedule = new Map<string, number>();
  slips.forEach((slip) => (slip.lines || []).forEach((line: any) => {
    const scheduleId = planScheduleById.get(String(line?.dispatchPlanId || "").trim());
    if (scheduleId) loadedBySchedule.set(scheduleId, (loadedBySchedule.get(scheduleId) || 0) + n(line?.loadedQty));
  }));
  const pendingOrderValueByDate: Record<string, number> = {};
  const scheduledByOrder = new Map<string, number>();
  (lists.schedules || []).forEach((schedule) => {
    const order = orderById.get(String(schedule.orderId));
    if (!order) return;
    scheduledByOrder.set(String(order.id), (scheduledByOrder.get(String(order.id)) || 0) + n(schedule.qty));
    const pending = n(schedule.qty) - n(schedule.canceledQty) - (loadedBySchedule.get(String(schedule.id)) || 0);
    if (pending <= 0) return;
    const date = isoDateText(schedule.scheduledDate);
    pendingOrderValueByDate[date] = (pendingOrderValueByDate[date] || 0) + pending * n(order.rate);
  });
  const pendingSchedulingValue = orders
    .filter((order) => order.status === "Pending Scheduling")
    .reduce((sum, order) => sum + Math.max(0, n(order.qty) - (scheduledByOrder.get(String(order.id)) || 0)) * n(order.rate), 0);
  const invoices = (lists.invoices || []).filter((invoice) => !isCancelled(invoice));
  const invoiceIds = new Set(invoices.map((invoice) => String(invoice.id)));
  const invoicedSlipIds = new Set((lists.invoiceLines || []).filter((line) => invoiceIds.has(String(line.invoiceId))).map((line) => String(line.loadingSlipId || "")));
  const slipsNotInvoiced = slips.filter((slip) => !(slip.invoiceId && invoiceIds.has(String(slip.invoiceId))) && !invoicedSlipIds.has(String(slip.id))).length;
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
  const fgStockValue = npdItems.reduce((sum, item) => sum + Math.max(0, n(item.balance)) * (latestRate.get(String(item.id))?.rate || 0), 0);
  return { pendingOrderValueByDate, pendingSchedulingValue, loadingSlips: slips.length, invoices: invoices.length, slipsNotInvoiced, fgStockValue };
}
