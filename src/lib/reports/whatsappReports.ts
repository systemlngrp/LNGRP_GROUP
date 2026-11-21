// WhatsApp report PDFs: Production Plan, Dispatch Plan and Pending Loading.
// One copy of the rows and the PDF layout, used by the pages (Download PDF /
// Send on WhatsApp) and by the server (timed sends), so both make the same PDF.
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { buildFluteBatchMap, resolveFluteBatch } from "../fluteBatch";
import { formatDate } from "../serial";
import { sortProductionPlanRows } from "../productionPlanSorting";
import { findRealizationTargetForDate, parseRealizationTargets } from "../realizationTargets";
import { resolveProductionPlanCompany } from "../productionPlanCompany";
import { buildSampleJobNumbers, deriveProductionPlanStatuses } from "../productionPlanStatus";
import { getFirmDisplayNameById } from "../firmDisplay";
import { groupPhpPlatePlanByShift, phpPlatePlanTotals, type PhpPlatePlanRow } from "../phpPlatePlan";

export type WhatsappReportKey = "production-plan" | "dispatch-plan" | "pending-loading" | "php-planning" | "plate-planning" | "php-production-plan" | "plate-production-plan";

/** Reports for a plan date (the others are "as on now"). */
export const DATED_WHATSAPP_REPORTS: WhatsappReportKey[] = ["production-plan", "dispatch-plan", "php-production-plan", "plate-production-plan"];
// Timed (automatic) sends paused for these by the user; Send Times stay saved
// and the page's WhatsApp button still works. Empty this list to resume.
export const PAUSED_TIMED_WHATSAPP_REPORTS: WhatsappReportKey[] = ["production-plan", "dispatch-plan", "php-production-plan", "plate-production-plan"];
/** Reports for one firm (WhatsApp Master "Firm" for the timed PDF; the page button uses the user's firm). */
export const FIRM_WHATSAPP_REPORTS: WhatsappReportKey[] = ["production-plan", "php-planning", "plate-planning"];

/** Page (menu) of each report: its WhatsApp Master entry and who may send it. */
export const WHATSAPP_REPORT_MENUS: Record<WhatsappReportKey, string> = {
  "production-plan": "/production/plan",
  "dispatch-plan": "/dispatch/plan",
  "pending-loading": "/loading/pending",
  "php-planning": "/production/php/pending-planning",
  "plate-planning": "/production/plate/pending-planning",
  "php-production-plan": "/production/php/plan",
  "plate-production-plan": "/production/plate/plan",
};

export const whatsappReportKeyForMenu = (menu: string) =>
  (Object.keys(WHATSAPP_REPORT_MENUS) as WhatsappReportKey[]).find((key) => WHATSAPP_REPORT_MENUS[key] === menu);

export const DEFAULT_WHATSAPP_REPORT_MESSAGES: Record<WhatsappReportKey, string> = {
  "production-plan": `🏭 *PRODUCTION PLAN*

*Plan Date:* {{date}}
*Firm:* {{firm}}
*Jobs:* {{jobs}}
*Total Plan Qty:* {{totalQty}}
*Total Paper Weight:* {{totalPaperWeight}} Kg
*Total Value:* ₹{{totalValue}}

📄 Production Plan PDF attached.`,
  "dispatch-plan": `🚚 *DISPATCH PLAN*

*Plan Date:* {{date}}
*Plans:* {{plans}}
*Planned Qty:* {{planned}}
*Invoiced Qty:* {{invoiced}}
*Pending Qty:* {{pending}}

📄 Dispatch Plan PDF attached.`,
  "pending-loading": `📦 *PENDING LOADING*

*As on:* {{dateTime}}
*Pending Plans:* {{plans}}
*Planned Qty:* {{planned}}
*Loaded Qty:* {{loaded}}
*Pending Qty:* {{pending}}

📄 Pending Loading PDF attached.`,
  "php-planning": `🗂️ *PENDING PHP PLANNING*

*As on:* {{dateTime}}
*Firm:* {{firm}}
*Schedules:* {{schedules}}
*Required Qty:* {{required}}
*Already Planned:* {{planned}}
*Remaining to Plan:* {{remaining}}

📄 Pending PHP Planning PDF attached.`,
  "php-production-plan": `🏭 *PHP PRODUCTION PLAN*

*Plan Date:* {{date}}
*Jobs:* {{jobs}}
*Planned Qty:* {{planned}}
*Produced:* {{produced}}
*Balance:* {{balance}}

{{shiftLines}}

📄 PHP Production Plan PDF attached.`,
  "plate-production-plan": `🏭 *PLATE PRODUCTION PLAN*

*Plan Date:* {{date}}
*Jobs:* {{jobs}}
*Planned Qty:* {{planned}}
*Produced:* {{produced}}
*Balance:* {{balance}}

{{shiftLines}}

📄 Plate Production Plan PDF attached.`,
  "plate-planning": `🗂️ *PENDING PLATE PLANNING*

*As on:* {{dateTime}}
*Firm:* {{firm}}
*Schedules:* {{schedules}}
*Required Qty:* {{required}}
*Already Planned:* {{planned}}
*Remaining to Plan:* {{remaining}}

📄 Pending Plate Planning PDF attached.`,
};

export function renderWhatsappReportMessage(template: string, values: Record<string, string>) {
  // values.__hide = "a,b": drop template lines that use {{a}} or {{b}} (e.g. Invoiced when 0).
  const hidden = String(values.__hide || "").split(",").map((key) => key.trim()).filter(Boolean);
  const text = hidden.length
    ? String(template || "").split("\n").filter((line) => !hidden.some((key) => new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`).test(line))).join("\n")
    : String(template || "");
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => values[key] ?? "");
}

export type ReportPdfSpec = {
  report: WhatsappReportKey;
  title: string;
  subtitle: string;
  head: string[];
  body: string[][];
  foot?: string[];
  /** Body rows filled red (Production Plan: realization below target). */
  highlightRows?: number[];
  /** Body rows shown as a grey bold heading / sub-total (PHP / Plate Production Plan shifts). */
  groupRows?: number[];
  /** Body columns aligned right (quantities); defaults per report when absent. */
  rightColumns?: number[];
  /** Page orientation; landscape when not set. */
  orientation?: "portrait" | "landscape";
  /** Values for the WhatsApp message template. */
  values: Record<string, string>;
  fileName: string;
};

const qtyText = (value: unknown) => Number(value || 0).toLocaleString("en-IN");
const money = (value: number) => value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const s = (value: unknown) => String(value ?? "").trim();

/** Day a plan or production is for, in India time (as the pages read it; the server runs in UTC). */
const localDay = (value: unknown) => {
  const date = new Date(s(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" }).slice(0, 10);
};

// ---------------------------------------------------------------- Production Plan

export type ProductionPlanLists = {
  productions: any[];
  schedules: any[];
  orders: any[];
  companies: any[];
  sampleRequests: any[];
  settings: any[];
  fluteMasters: any[];
  npdItems: Array<{ id: string; name?: string }>;
};

/** Rows of the Production Plan for one date, in plan order with statuses (before table search). */
export function computeProductionPlanRows(lists: ProductionPlanLists, date: string, filters: { companies?: string[]; item?: string } = {}) {
  const { productions, schedules, orders, companies, sampleRequests, settings, fluteMasters, npdItems } = lists;
  const fluteBatchMap = buildFluteBatchMap(fluteMasters);
  const sampleJobNumbers = buildSampleJobNumbers(sampleRequests);
  const target = findRealizationTargetForDate(parseRealizationTargets(settings[0]?.realizationPerKgTargets), date);
  const requiredRealization = target ? Number(target.value || 0) * 0.98 : null;
  // Least Sheet Weight = least GSM of the same ERP code across all non-cancelled jobs.
  const erpLeastGsm = new Map<string, number>();
  productions.forEach((p) => {
    if (p.status === "Cancelled" || p.cancelTimestamp) return;
    const erp = s(p.erpCode);
    const gsm = Number(p.gsm || 0);
    if (erp && gsm > 0 && (!erpLeastGsm.has(erp) || gsm < erpLeastGsm.get(erp)!)) erpLeastGsm.set(erp, gsm);
  });
  const itemById = new Map(npdItems.map((item) => [s(item.id), item]));
  const scheduleById = new Map(schedules.map((schedule) => [schedule.id, schedule]));
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const rows = productions
    .filter((p) => (s(p.date) ? (localDay(p.date) || s(p.date)) : "") === date)
    .map((production) => {
      const schedule = scheduleById.get(production.scheduleId);
      const order = schedule ? orderById.get(schedule.orderId) : undefined;
      const company = resolveProductionPlanCompany(production, schedule, order, companies);
      const item = itemById.get(s(production.itemId));
      return { production, company, item };
    })
    .filter(({ production, company, item }) => {
      if (filters.companies?.length && !filters.companies.some((selected) => selected === company.companyId || selected === company.name)) return false;
      const itemKey = item?.id || `${item?.name || ""}::${production.erpCode || ""}`;
      return !filters.item || itemKey === filters.item;
    })
    .map(({ production, company, item }) => ({
      ...production,
      leastGsm: erpLeastGsm.get(s(production.erpCode)) ?? production.leastGsm,
      // Batch comes from the Flute Master, so a master change re-orders the plan.
      fluteBatches: resolveFluteBatch(production.flute, fluteBatchMap, production.fluteBatches),
      productionPlanCompanyName: company.name,
      productionPlanCompanyId: company.companyId,
      itemName: item?.name || "",
    }));
  return deriveProductionPlanStatuses(sortProductionPlanRows(rows as any[]), sampleJobNumbers, requiredRealization) as any[];
}

export function productionPlanPdfSpec(rows: any[], date: string, firmLabel = ""): ReportPdfSpec {
  const pdfNumber = (value: unknown) => {
    if (value === "" || value === null || value === undefined) return "";
    const num = Number(value);
    if (!Number.isFinite(num)) return String(value);
    const rounded = Math.round(num * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  };
  const jobNumber = (p: any) => {
    const text = s(p.transactionNo || p.jobCardNo);
    return text.match(/(\d+)\s*$/)?.[1] || text || "-";
  };
  let totalValue = 0;
  let totalPaperWeight = 0;
  let totalQty = 0;
  const highlightRows: number[] = [];
  const body = rows.map((p, index) => {
    const value = (Number(p.qty || 0) || 0) * (Number(p.rate || 0) || 0);
    totalValue += value;
    totalPaperWeight += Number(p.totalPaperWeight || 0) || 0;
    totalQty += Number(p.qty || 0) || 0;
    // Same colour as on screen: realization below 98% of the target and not a sample.
    if (p.shouldHighlight) highlightRows.push(index);
    return [
      jobNumber(p), s(p.productionPlanCompanyName), s(p.itemName), s(p.erpCode), pdfNumber(p.ups), pdfNumber(p.qty),
      pdfNumber(p.reelAsPerCalc), pdfNumber(p.reelActualWithTrimming), pdfNumber(p.cuttingWithTrimming), pdfNumber(p.ply), s(p.flute),
      pdfNumber(p.l1), pdfNumber(p.f1), pdfNumber(p.l2), pdfNumber(p.f2), pdfNumber(p.l3), pdfNumber(p.gsm),
      pdfNumber(p.totalPaperWeight), pdfNumber(p.plannedProductionInMeter), pdfNumber(p.realizationPerKg), pdfNumber(p.sheetWeight),
      pdfNumber(p.rate), value.toFixed(2), p.isSample ? "YES" : "", s(p.remarks),
    ];
  });
  return {
    report: "production-plan",
    title: "Production Plan",
    subtitle: `Date: ${formatDate(date)}${firmLabel ? `   Firm: ${firmLabel}` : ""}`,
    head: [
      "Job\nNo", "Company Name", "Item Name", "ERP\nCODE", "UPS", "Plan\nQTY", "Reel As\nPer\nCalculation", "REEL\nActual\nwith\nTRIMMING",
      "CUTTING\nwith\nTRIMMING", "PLY", "FLUTE", "L1", "F1", "L2", "F2", "L3", "GSM", "TOTAL\nPaper\nWEIGHT", "Planned\nProduction\nin Meter",
      "REALIZATION\nPER KG", "SHEET\nWEIGHT", "Rate", "Value", "Sample", "Remark",
    ],
    body,
    // TOTAL row: Total Paper Weight (column 18) and Value.
    foot: ["TOTAL", ...Array(16).fill(""), totalPaperWeight.toFixed(2), ...Array(4).fill(""), totalValue.toFixed(2), "", ""],
    highlightRows,
    values: {
      date: formatDate(date),
      firm: firmLabel || "All firms",
      jobs: String(rows.length),
      totalQty: qtyText(Math.round(totalQty)),
      totalPaperWeight: money(totalPaperWeight),
      totalValue: money(totalValue),
    },
    fileName: `Production_Plan_${date}.pdf`,
  };
}

// ---------------------------------------------------------------- Dispatch Plan

export type DispatchPlanDayRow = {
  plan: any;
  firmId: string;
  firmName: string;
  companyName: string;
  orderNo: string;
  itemName: string;
  itemKey: string;
  planDate: string;
  truckNo: string;
  planned: number;
  invoiced: number;
  cancelled: number;
  pending: number;
};

export function computeDispatchPlanDayRows(
  lists: { plans: any[]; orders: any[]; companies: any[]; schedules: any[]; trucks: any[]; firms: any[] },
  resolveOrderItem: (order?: any) => { name?: string; erp?: string } | undefined,
  date: string,
  toDate?: string,
): DispatchPlanDayRow[] {
  const from = date;
  const to = toDate && toDate >= date ? toDate : date;
  const orderById = new Map(lists.orders.map((order) => [order.id, order]));
  const companyById = new Map(lists.companies.map((company) => [company.id, company]));
  const scheduleFirm = new Map(lists.schedules.map((row) => [row.id, row.firmId]));
  const truckById = new Map(lists.trucks.map((truck) => [truck.id, truck]));
  return lists.plans
    .filter((plan) => {
      const day = localDay(plan.date);
      return day >= from && day <= to;
    })
    .map((plan) => {
      const order = orderById.get(plan.orderId);
      const item = resolveOrderItem(order);
      const itemName = s(item?.name);
      const itemErp = s(order?.erpCode || item?.erp);
      const firmId = String(order?.firmId || plan.orderFirmId || plan.firmId || scheduleFirm.get(plan.scheduleId) || "");
      const planned = Number(plan.plannedQty || 0);
      const invoiced = Number(plan.loadedQty || 0);
      const cancelled = Number(plan.canceledQty || 0);
      return {
        plan,
        firmId,
        firmName: getFirmDisplayNameById(firmId, lists.firms),
        companyName: s(companyById.get(order?.companyId)?.name),
        orderNo: String(order?.orderNo || ""),
        itemName: itemName && itemErp && !itemName.toLowerCase().includes(itemErp.toLowerCase()) ? `${itemName} - ${itemErp}` : itemName || itemErp,
        itemKey: `${itemName}::${itemErp}`,
        planDate: localDay(plan.date),
        truckNo: String(truckById.get(String(plan.truckId || ""))?.truckNo || plan.truckNo || ""),
        planned,
        invoiced,
        cancelled,
        pending: planned - invoiced - cancelled,
      };
    })
    // Only plan lines still to dispatch (page and WhatsApp PDF alike).
    .filter((row) => row.pending > 0.0001);
}

export const sortDispatchPlanDayRows = (rows: DispatchPlanDayRow[]) =>
  [...rows].sort((a, b) => a.planDate.localeCompare(b.planDate) || s(a.plan.planNo).localeCompare(s(b.plan.planNo), undefined, { numeric: true, sensitivity: "base" }));

/** "20-11-2026" or "From 20-11-2026 To 22-11-2026". */
export const dispatchPlanRangeLabel = (from: string, to?: string) =>
  !to || to === from ? formatDate(from) : `From ${formatDate(from)} To ${formatDate(to)}`;

/** Columns of the Dispatch Plan (page, Excel, PDF): Invoice Qty / Cancl only when some row has one. */
export function dispatchPlanColumns(rows: DispatchPlanDayRow[]) {
  const showInvoiced = rows.some((row) => Math.abs(row.invoiced) > 0.0001);
  const showCancelled = rows.some((row) => Math.abs(row.cancelled) > 0.0001);
  type Col = { key: string; label: string; qty?: boolean; cell: (row: DispatchPlanDayRow, index: number) => string | number; total?: (rows: DispatchPlanDayRow[]) => number };
  const sum = (pick: (row: DispatchPlanDayRow) => number) => (list: DispatchPlanDayRow[]) => list.reduce((total, row) => total + pick(row), 0);
  const cols: Col[] = [
    { key: "sr", label: "Sr.", cell: (_row, index) => index + 1 },
    { key: "planDate", label: "Plan Date", cell: (row) => formatDate(row.planDate) },
    { key: "planNo", label: "Plan No", cell: (row) => s(row.plan.planNo) },
    { key: "firmName", label: "Firm", cell: (row) => row.firmName },
    { key: "companyName", label: "Company", cell: (row) => row.companyName },
    { key: "orderNo", label: "Order No", cell: (row) => row.orderNo },
    { key: "itemName", label: "Item", cell: (row) => row.itemName },
    { key: "planned", label: "Planned", qty: true, cell: (row) => row.planned, total: sum((row) => row.planned) },
    ...(showInvoiced ? [{ key: "invoiced", label: "Invoice Qty", qty: true, cell: (row: DispatchPlanDayRow) => row.invoiced, total: sum((row) => row.invoiced) }] : []),
    ...(showCancelled ? [{ key: "cancelled", label: "Cancl", qty: true, cell: (row: DispatchPlanDayRow) => row.cancelled, total: sum((row) => row.cancelled) }] : []),
    { key: "pending", label: "Pending", qty: true, cell: (row) => row.pending, total: sum((row) => row.pending) },
  ];
  return { cols, showInvoiced, showCancelled };
}


export function dispatchPlanPdfSpec(rows: DispatchPlanDayRow[], date: string, toDate?: string): ReportPdfSpec {
  const to = toDate && toDate >= date ? toDate : date;
  // The PDF leaves out Plan No and Order No (owner's choice, 21-Nov-2026); the page and Excel keep them.
  const { cols: allCols, showInvoiced } = dispatchPlanColumns(rows);
  const cols = allCols.filter((col) => col.key !== "planNo" && col.key !== "orderNo");
  const totalOf = (key: string) => cols.find((col) => col.key === key)?.total?.(rows) || 0;
  const rangeLabel = dispatchPlanRangeLabel(date, to);
  return {
    report: "dispatch-plan",
    title: "Dispatch Plan",
    orientation: "portrait",
    subtitle: to === date ? `Date: ${rangeLabel}` : rangeLabel,
    head: cols.map((col) => col.label),
    body: rows.map((row, index) => cols.map((col) => col.qty ? qtyText(col.cell(row, index)) : s(col.cell(row, index)))),
    foot: cols.map((col, index) => col.total ? qtyText(col.total(rows)) : index === 0 ? "TOTAL" : ""),
    rightColumns: cols.map((col, index) => (col.qty ? index : -1)).filter((index) => index >= 0),
    values: {
      date: rangeLabel,
      plans: String(rows.length),
      planned: qtyText(totalOf("planned")),
      invoiced: qtyText(rows.reduce((total, row) => total + row.invoiced, 0)),
      cancelled: qtyText(rows.reduce((total, row) => total + row.cancelled, 0)),
      pending: qtyText(totalOf("pending")),
      ...(showInvoiced ? {} : { __hide: "invoiced" }),
    },
    fileName: to === date ? `Dispatch_Plan_${date}.pdf` : `Dispatch_Plan_${date}_to_${to}.pdf`,
  };
}

// ---------------------------------------------------------------- Pending Loading

export type PendingLoadingPdfRow = {
  date: string;
  planNo: string;
  orderNo: string;
  firmName: string;
  companyName: string;
  itemName: string;
  itemSource: string;
  planned: number;
  loaded: number;
  pending: number;
};

/** One row per pending dispatch plan (latest plan date first), from the Pending Loading projections. */
export function pendingLoadingRowsFromProjections(projections: any[], firms: any[]): PendingLoadingPdfRow[] {
  return projections
    .map((projection) => ({
      date: s(projection.plan?.date),
      planNo: s(projection.plan?.planNo),
      orderNo: s(projection.order?.orderNo) || "N/A",
      firmName: getFirmDisplayNameById(projection.firmId, firms),
      companyName: s(projection.company?.name) || "Company unavailable",
      itemName: s(projection.item?.name) || "Item unavailable",
      itemSource: s(projection.itemSource),
      planned: Number(projection.plan?.plannedQty || 0),
      loaded: Number(projection.plan?.loadedQty || 0),
      pending: Number(projection.pendingQty || 0),
    }))
    .sort((a, b) => b.date.slice(0, 10).localeCompare(a.date.slice(0, 10)) || a.planNo.localeCompare(b.planNo, undefined, { numeric: true }));
}

/** "DP/26-27/04512" -> "26-27/04512" (same short number the page shows). */
const shortDocNo = (value: string) => value.match(/(\d{2}-\d{2}\/[^/]+)$/)?.[1] || value || "-";

export function pendingLoadingPdfSpec(rows: PendingLoadingPdfRow[], asOf: Date): ReportPdfSpec {
  const totals = rows.reduce((sum, row) => ({ planned: sum.planned + row.planned, loaded: sum.loaded + row.loaded, pending: sum.pending + row.pending }), { planned: 0, loaded: 0, pending: 0 });
  const dateTime = asOf.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
  const stamp = asOf.toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" }).slice(0, 16).replace(/[: ]/g, "-");
  return {
    report: "pending-loading",
    title: "Pending Loading",
    subtitle: `As on: ${dateTime}`,
    head: ["Sr.", "Plan Date", "Plan No", "Order No", "Firm", "Company", "Item", "Source", "Planned", "Loaded", "Pending"],
    body: rows.map((row, index) => [
      String(index + 1), formatDate(row.date), shortDocNo(row.planNo), shortDocNo(row.orderNo), row.firmName, row.companyName, row.itemName, row.itemSource,
      qtyText(row.planned), qtyText(row.loaded), qtyText(row.pending),
    ]),
    foot: ["TOTAL", "", "", "", "", "", "", "", qtyText(totals.planned), qtyText(totals.loaded), qtyText(totals.pending)],
    values: {
      dateTime,
      plans: String(rows.length),
      planned: qtyText(totals.planned),
      loaded: qtyText(totals.loaded),
      pending: qtyText(totals.pending),
    },
    fileName: `Pending_Loading_${stamp}.pdf`,
  };
}

// ---------------------------------------------------------------- Pending PHP / Plate Planning

export type PlanningPdfRow = {
  scheduledDate: string;
  scheduleNo: string;
  firmName: string;
  orderNo: string;
  companyName: string;
  fgItem: string;
  mainErp: string;
  linkedErp?: string;
  linkedItem: string;
  scheduledQty: number;
  setsPerBox: string;
  requiredQty: number;
  alreadyPlannedQty: number;
  remainingQty: number;
};

export function planningPdfSpec(report: "php-planning" | "plate-planning", rows: PlanningPdfRow[], asOf: Date, firmLabel = ""): ReportPdfSpec {
  const source = report === "php-planning" ? "PHP" : "Plate";
  const totals = rows.reduce((sum, row) => ({ required: sum.required + row.requiredQty, planned: sum.planned + row.alreadyPlannedQty, remaining: sum.remaining + row.remainingQty }), { required: 0, planned: 0, remaining: 0 });
  const dateTime = asOf.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
  const stamp = asOf.toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" }).slice(0, 16).replace(/[: ]/g, "-");
  return {
    report,
    title: `Pending ${source} Planning`,
    subtitle: `As on: ${dateTime}${firmLabel ? `   Firm: ${firmLabel}` : ""}`,
    head: ["Sr.", "Sched. Date", "Schedule No", "Firm", "Order No", "Company", "FG Item", "Main ERP", `${source} ERP`, `${source} Item`, "Sched. Qty", "Sets/Pcs", "Required", "Planned", "Remaining"],
    body: rows.map((row, index) => [
      String(index + 1), formatDate(row.scheduledDate), shortDocNo(row.scheduleNo), row.firmName, shortDocNo(row.orderNo), row.companyName, row.fgItem, row.mainErp, row.linkedErp || "", row.linkedItem,
      qtyText(row.scheduledQty), row.setsPerBox, qtyText(row.requiredQty), qtyText(row.alreadyPlannedQty), qtyText(row.remainingQty),
    ]),
    foot: ["TOTAL", "", "", "", "", "", "", "", "", "", "", "", qtyText(totals.required), qtyText(totals.planned), qtyText(totals.remaining)],
    values: {
      dateTime,
      firm: firmLabel || "All firms",
      schedules: String(rows.length),
      required: qtyText(totals.required),
      planned: qtyText(totals.planned),
      remaining: qtyText(totals.remaining),
    },
    fileName: `Pending_${source}_Planning_${stamp}.pdf`,
    rightColumns: [10, 11, 12, 13, 14],
  };
}

// ---------------------------------------------------------------- PHP / Plate Production Plan

export function phpPlatePlanPdfSpec(report: "php-production-plan" | "plate-production-plan", rows: PhpPlatePlanRow[], date: string): ReportPdfSpec {
  const label = report === "php-production-plan" ? "PHP" : "Plate";
  const body: string[][] = [];
  const groupRows: number[] = [];
  const shiftLines: string[] = [];
  groupPhpPlatePlanByShift(rows).forEach((group) => {
    groupRows.push(body.length);
    body.push([`${group.shift} Shift`, "", "", "", "", "", "", "", "", "", "", "", ""]);
    group.rows.forEach((row) => body.push([
      row.sequence === null ? "No seq." : String(row.sequence), row.shift, shortDocNo(row.jobNo), row.firmName, row.companyName, row.itemName, row.mainErp, row.erp, row.methodology,
      qtyText(row.plannedQty), qtyText(row.producedQty), qtyText(row.balanceQty), row.status,
    ]));
    const totals = phpPlatePlanTotals(group.rows);
    groupRows.push(body.length);
    body.push([`${group.shift} total`, "", "", "", "", "", "", "", `${totals.jobs} jobs`, qtyText(totals.planned), qtyText(totals.produced), qtyText(totals.balance), ""]);
    shiftLines.push(`*${group.shift}:* ${totals.jobs} jobs, ${qtyText(totals.planned)} planned, ${qtyText(totals.balance)} balance`);
  });
  const totals = phpPlatePlanTotals(rows);
  return {
    report,
    title: `${label} Production Plan`,
    subtitle: `Date: ${formatDate(date)}`,
    head: ["Seq", "Shift", "Job No", "Firm", "Company", `${label} Item`, "Main ERP", `${label} ERP`, "Methodology", "Planned", "Produced", "Balance", "Status"],
    body,
    foot: ["TOTAL", "", "", "", "", "", "", "", `${totals.jobs} jobs`, qtyText(totals.planned), qtyText(totals.produced), qtyText(totals.balance), ""],
    groupRows,
    values: {
      date: formatDate(date),
      jobs: String(totals.jobs),
      planned: qtyText(totals.planned),
      produced: qtyText(totals.produced),
      balance: qtyText(totals.balance),
      shiftLines: shiftLines.join("\n") || "No jobs scheduled.",
    },
    fileName: `${label}_Production_Plan_${date}.pdf`,
  };
}

// ---------------------------------------------------------------- PDF

export function buildReportPdf(spec: ReportPdfSpec): jsPDF {
  const doc = new jsPDF({ orientation: spec.orientation || "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const isProductionPlan = spec.report === "production-plan";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(spec.title, pageWidth / 2, 12, { align: "center" });
  doc.setFontSize(isProductionPlan ? 8 : 10);
  doc.text(spec.subtitle, pageWidth / 2, 18, { align: "center" });
  const highlight = new Set(spec.highlightRows || []);
  if (isProductionPlan) {
    // Layout of the printed Production Plan sheet: plain grid, totals at the end.
    autoTable(doc, {
      head: [spec.head],
      body: spec.body,
      foot: spec.foot ? [spec.foot] : undefined,
      startY: 22,
      margin: { left: 6, right: 6 },
      theme: "grid",
      showFoot: "lastPage",
      rowPageBreak: "avoid",
      styles: { font: "helvetica", fontSize: 5.5, cellPadding: 0.8, halign: "center", valign: "middle", textColor: 0, lineColor: 0, lineWidth: 0.15, overflow: "linebreak" },
      headStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: "bold", fontSize: 5.5 },
      footStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 9 },
        1: { cellWidth: 28 },
        2: { cellWidth: 34 },
        3: { cellWidth: 11 },
        19: { cellWidth: 16 },
        22: { cellWidth: 13 },
        23: { cellWidth: 9 },
        24: { cellWidth: 26 },
      },
      didParseCell: (data) => {
        if (data.section === "foot" && data.column.index === 0) data.cell.styles.halign = "left";
        if (data.section === "body" && highlight.has(data.row.index)) data.cell.styles.fillColor = [255, 153, 153];
      },
    });
    return doc;
  }
  const qtyColumns = spec.rightColumns ? spec.rightColumns : spec.report === "pending-loading" ? [8, 9, 10]
    : spec.report === "php-production-plan" || spec.report === "plate-production-plan" ? [9, 10, 11] : [9, 10, 11, 12, 13];
  const groups = new Set(spec.groupRows || []);
  autoTable(doc, {
    startY: 22,
    head: [spec.head],
    // Total as the last body row in bold (as the Dispatch Plan PDF had it).
    body: spec.foot ? [...spec.body, spec.foot] : spec.body,
    ...(spec.orientation === "portrait" ? { margin: { left: 8, right: 8 } } : {}),
    styles: { fontSize: 7, cellPadding: 1.2, lineColor: [0, 0, 0], lineWidth: 0.1, overflow: "linebreak" },
    headStyles: { fillColor: [49, 46, 129], textColor: 255, fontStyle: "bold" },
    columnStyles: Object.fromEntries(qtyColumns.map((column) => [column, { halign: "right" }])),
    didParseCell: (data) => {
      if (data.section !== "body") return;
      if (spec.foot && data.row.index === spec.body.length) data.cell.styles.fontStyle = "bold";
      if (groups.has(data.row.index)) { data.cell.styles.fontStyle = "bold"; data.cell.styles.fillColor = [226, 232, 240]; }
    },
  });
  return doc;
}
