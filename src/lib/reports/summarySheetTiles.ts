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
  value: number;
  format: "qty" | "money" | "percent" | "count";
  /** Tailwind classes for the tile (colours taken from the Google Summary Sheet). */
  tone: string;
};

/**
 * Header tiles of the Google "Summary Sheet" (rows 1-5) worked out from the
 * app's summary rows. Today/yesterday/tomorrow tiles use the job date (sales
 * use the dispatch date); range tiles use From-To (default: this month).
 */
export function computeSummarySheetTiles(rows: SummaryRow[], cancelledJobDates: string[], range: { from: string; to: string }, now = new Date()) {
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
  const paperRequired = sum(rangeRows.filter((row) => n(row["PPR Used"]) > 0), (row) => n(row["PPR Rqd."]));
  const paperWastage = sum(rangeRows, (row) => n(row["Paper Wastage"]));

  const todayTiles: SummaryTile[] = [
    { id: "todayPlan", label: "Today's Plan", value: sum(todayRows, (row) => n(row["Planned Qty"])), format: "qty", tone: "bg-[#660000] text-white" },
    { id: "tomorrowPlan", label: "Tomorrow's Plan", value: sum(tomorrowRows, (row) => n(row["Planned Qty"])), format: "qty", tone: "bg-[#ffe599] text-slate-950" },
    { id: "todayPlanValue", label: "Plan Value", value: planValue(todayRows), format: "money", tone: "bg-[#45818e] text-white" },
    { id: "tomorrowPlanValue", label: "Tom. Plan Value", value: planValue(tomorrowRows), format: "money", tone: "bg-[#b4a7d6] text-slate-950" },
    { id: "tomorrowJobs", label: "Jobs Tomorrow", value: tomorrowRows.length, format: "count", tone: "bg-[#00ffff] text-[#ff0000]" },
    { id: "todayMeter", label: "Today's Linear Meter", value: sum(todayRows, (row) => n(row.Meter)), format: "qty", tone: "bg-[#8e7cc3] text-white" },
    { id: "todayBoardline", label: "Today's Boardline Production", value: sum(todayRows, (row) => n(row["Boardline Prod."])), format: "qty", tone: "bg-[#9900ff] text-white" },
    { id: "todayPrinting", label: "Today's BOBST Prod.", value: sum(todayRows, (row) => n(row["Printing prod."])), format: "qty", tone: "bg-[#0000ff] text-white" },
    { id: "yesterdaySale", label: "Yesterday's Sale", value: saleOn(yesterday), format: "money", tone: "bg-[#7f6000] text-white" },
    { id: "todaySale", label: "Today's Sale", value: saleOn(today), format: "money", tone: "bg-[#741b47] text-white" },
    { id: "wip", label: "WIP", value: sum(openRows, (row) => Math.max(0, n(row["Boardline Prod."]) - n(row["Printing prod."]))), format: "qty", tone: "bg-[#00ffff] text-slate-950" },
  ];
  const wastagePercent = paperRequired > 0 ? (paperWastage / paperRequired) * 100 : 0;
  const rangeTiles: SummaryTile[] = [
    { id: "rangeSale", label: "Total Sale - Rs", value: sum(rows.filter((row) => inRange(isoDateText(row["Dispatch Date"]))), (row) => n(row["Sale Value"])), format: "money", tone: "bg-[#00ff00] text-slate-950" },
    { id: "rangePaper", label: "Paper Used (Kg)", value: sum(rangeRows, (row) => n(row["PPR Used"])), format: "qty", tone: "bg-[#00ffff] text-slate-950" },
    {
      id: "rangeWastage",
      label: "Paper Wastage %",
      value: wastagePercent,
      format: "percent",
      // Sheet rule on Total wastage: up to 8% green, 8-10% orange, above 10% red.
      tone: wastagePercent <= 8 ? "bg-[#00ff00] text-slate-950" : wastagePercent <= 10 ? "bg-[#ff9900] text-slate-950" : "bg-[#ff0000] text-white",
    },
    { id: "rangeBoardlineWastage", label: "Boardline Wastage (Kg)", value: sum(rangeRows, (row) => n(row["Boardline Wastage"])), format: "qty", tone: "bg-[#ffff00] text-slate-950" },
    { id: "rangePrintingWastage", label: "Printing Wastage", value: sum(rangeRows, (row) => n(row["Printing Wastage"])), format: "qty", tone: "bg-[#ffff00] text-slate-950" },
    { id: "rangeJobs", label: "Jobs", value: rangeRows.length, format: "count", tone: "bg-[#ffe599] text-slate-950" },
    { id: "rangeClosed", label: "Closed Jobs", value: rangeRows.filter((row) => s(row["Job Closed"]) === "Yes").length, format: "count", tone: "bg-[#d9ead3] text-slate-950" },
    { id: "rangeCancelled", label: "Cancel Jobs", value: cancelledJobDates.filter(inRange).length, format: "count", tone: "bg-[#d9ead3] text-slate-950" },
  ];
  return { todayTiles, rangeTiles };
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

/** Order / dispatch tiles from the server extras (due = scheduled up to 3 days ahead, like the sheet). */
export function computeSummarySheetExtraTiles(extras: SummarySheetExtras, now = new Date()): SummaryTile[] {
  const dueUntil = localDayKey(3, now);
  const entries = Object.entries(extras.pendingOrderValueByDate || {});
  const due = entries.filter(([date]) => date && date <= dueUntil).reduce((sum, [, value]) => sum + value, 0);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  return [
    { id: "duePendingOrderValue", label: "Due Pending Order Value", value: due, format: "money", tone: "bg-[#ff0000] text-white" },
    { id: "totalPendingOrderValue", label: "Total Pending Order Value", value: total, format: "money", tone: "bg-[#e06666] text-white" },
    { id: "pendingSchedulingValue", label: "Total Due Planning Value", value: extras.pendingSchedulingValue, format: "money", tone: "bg-[#ff0000] text-white" },
    { id: "fgStockValue", label: "FG Stock Value", value: extras.fgStockValue, format: "money", tone: "bg-[#ffe599] text-slate-950" },
    { id: "loadingSlips", label: "Total Loading Slip", value: extras.loadingSlips, format: "count", tone: "bg-[#fce5cd] text-slate-950" },
    { id: "invoices", label: "Total Inv", value: extras.invoices, format: "count", tone: "bg-[#fce5cd] text-slate-950" },
    { id: "slipsNotInvoiced", label: "Loading Slip Not Invoiced", value: extras.slipsNotInvoiced, format: "count", tone: "bg-[#ffff00] text-slate-950" },
  ];
}
