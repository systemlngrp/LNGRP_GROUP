// Summary Sheet base rows: shared by the page (browser fallback) and the server
// report engine. Same calculation the page used before; filters stay in the page.
import { getProductionWastageTotals } from "../wastageCalculations";
import { buildJobLoadingRecords } from "../jobLoadingRecords";
import { hasPaperNotRequiredBypass } from "../productionMaterialUsage";
import { findLatestInspection } from "../pdiReportData";
import { normalizeQcResult } from "../jobCellColors";
import type { Company, DispatchPlan, Firm, Invoice, InvoiceLineItem, LoadingSlip, Order, OrderSchedule, PreDispatchInspection, Production, ProductionProcessing, Truck } from "../../types";

export type SummaryRow = Record<string, string | number>;
export const n = (value: unknown) => { const result = Number(value); return Number.isFinite(result) ? result : 0; };
export const s = (value: unknown) => String(value ?? "").trim();
export const isoDateText = (value: unknown) => s(value).slice(0, 10);
const money = (value: number) => Number(value.toFixed(2));
function firstById<T extends { id: string }>(rows: T[]) {
  const map = new Map<string, T>();
  rows.forEach((row) => { if (!map.has(row.id)) map.set(row.id, row); });
  return map;
}

export type SummarySheetLists = {
  productions: Production[];
  processing: ProductionProcessing[];
  orders: Order[];
  schedules: OrderSchedule[];
  plans: DispatchPlan[];
  slips: LoadingSlip[];
  invoices: Invoice[];
  invoiceLines: InvoiceLineItem[];
  trucks: Truck[];
  companies: Company[];
  firms: Firm[];
  /** Loadings made before the app went live (table pre_app_dispatches). Reference only. */
  preAppDispatches?: PreAppDispatch[];
  /** Pre-dispatch inspections: latest result per job colours Dispatched Qty (Pass green, Fail red). */
  inspections?: PreDispatchInspection[];
  /** QC checks: board weight (grams) for Actual Realization / kg. */
  boardlineQc?: Array<{ jobNo?: string; sheetWeightGrams?: number | string; updateTimestamp?: string }>;
  printingQc?: Array<{ jobNo?: string; boxWeightGrams?: number | string; updateTimestamp?: string }>;
};

/** A loading done before the app went live, kept only so the Summary can show the job's full dispatch. */
export type PreAppDispatch = {
  id: string;
  productionId?: string;
  jobCardNo?: string;
  slipRef?: string;
  date?: string;
  qty?: number | string;
  invoiceNo?: string;
  invoiceDate?: string;
};

type DispatchRecord = { slipNo: string; date: string; qty: number; preApp: boolean };

/**
 * Pre-app loadings first (by date), then the app's own loadings, so "3 slips"
 * counts the job's first three loadings the way the Delivery Book does.
 */
export function combineWithPreApp(preApp: PreAppDispatch[], appRecords: Array<{ slipNo: string; date: string; qty: number }>): DispatchRecord[] {
  const before = preApp
    .map((row) => ({ slipNo: s(row.slipRef), date: isoDateText(row.invoiceDate || row.date), qty: n(row.qty), preApp: true }))
    .filter((row) => row.qty > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  return [...before, ...appRecords.map((row) => ({ ...row, preApp: false }))];
}

/** One row per non-cancelled job. Hidden keys: __productionId, __firmName. */
export function computeSummarySheetRows(lists: SummarySheetLists, stockItems: any[]): SummaryRow[] {
  const { productions, processing, orders, schedules, plans, slips, invoices, invoiceLines, trucks, companies, firms } = lists;
  const preAppByJob = new Map<string, PreAppDispatch[]>();
  (lists.preAppDispatches || []).forEach((row) => {
    const key = s(row.productionId) || `job:${s(row.jobCardNo).toUpperCase()}`;
    if (key === "job:") return;
    const list = preAppByJob.get(key) || [];
    list.push(row);
    preAppByJob.set(key, list);
  });
    const orderMap = new Map(orders.map((row) => [row.id, row]));
  // Latest QC board weight (grams) per job: Boardline QC sheet weight, else Printing QC box weight.
  const latestWeightByJob = <T extends { jobNo?: string; updateTimestamp?: string }>(rows: T[] | undefined, pick: (row: T) => number) => {
    const map = new Map<string, number>();
    [...(rows || [])].sort((a, b) => s(a.updateTimestamp).localeCompare(s(b.updateTimestamp))).forEach((row) => {
      const grams = pick(row);
      if (grams > 0) map.set(s(row.jobNo).toLowerCase(), grams);
    });
    return map;
  };
  const boardlineGramsByJob = latestWeightByJob(lists.boardlineQc, (row) => n(row.sheetWeightGrams));
  const printingGramsByJob = latestWeightByJob(lists.printingQc, (row) => n(row.boxWeightGrams));
  const firstScheduleById = firstById(schedules);
  const companyById = firstById(companies);
  const firmById = firstById(firms);
  const scheduleMap = new Map(schedules.map((row) => [row.id, row]));
  const invoiceMap = new Map(invoices.map((row) => [row.id, row]));
  const truckMap = new Map(trucks.map((row) => [row.id, row]));
  const stockItemById = new Map(stockItems.map((item: any) => [s(item.id), item]));
  const stockByErp = new Map(stockItems.map((item: any) => [s(item.erp || item.erpCode || item.masterItemNameErpCode), { name: s(item.name || item.itemName), balance: n(item.balance) }]));
  const invoiceLinesBySlip = new Map<string, InvoiceLineItem[]>();
  invoiceLines.forEach((line) => { const list = invoiceLinesBySlip.get(line.loadingSlipId) || []; list.push(line); invoiceLinesBySlip.set(line.loadingSlipId, list); });
  const processingByJob = new Map<string, ProductionProcessing[]>();
  processing.forEach((entry) => { const list = processingByJob.get(entry.productionId) || []; list.push(entry); processingByJob.set(entry.productionId, list); });
  const dispatchByProduction = new Map<string, { qty: number; date: string; slips: LoadingSlip[]; invoiceIds: Set<string> }>();
  const addDispatch = (productionId: string, qty: number, date = "", slip?: LoadingSlip) => {
    if (!productionId || !Number.isFinite(qty) || qty <= 0) return;
    const current = dispatchByProduction.get(productionId) || { qty: 0, date: "", slips: [], invoiceIds: new Set<string>() };
    current.qty += qty;
    current.date = current.date || date;
    if (slip && !current.slips.some((item) => item.id === slip.id)) current.slips.push(slip);
    if (slip?.invoiceId) current.invoiceIds.add(slip.invoiceId);
    dispatchByProduction.set(productionId, current);
  };
  const loadingByJob = buildJobLoadingRecords(productions, slips, plans, { includeOpeningStock: true });
  // Qty invoiced per job (invoice lines on the job's loading slips, same matching as the invoice list).
  const invoicedQtyByProduction = new Map<string, number>();
  loadingByJob.forEach((records, productionId) => records.forEach(({ slip, qty, itemIds }) => {
    addDispatch(productionId, qty, isoDateText(slip.date), slip);
    const dispatch = dispatchByProduction.get(productionId);
    invoiceLinesBySlip.get(slip.id)?.forEach((line) => {
      if (line.invoiceId && (!line.itemId || !itemIds.length || itemIds.includes(s(line.itemId).toLowerCase()))) {
        dispatch?.invoiceIds.add(line.invoiceId);
        invoicedQtyByProduction.set(productionId, (invoicedQtyByProduction.get(productionId) || 0) + n(line.qty));
      }
    });
  }));
  return productions.filter((production) => production.status !== "Cancelled").map((production) => {
    const order = orderMap.get(firstScheduleById.get(production.scheduleId)?.orderId || "");
    const schedule = scheduleMap.get(production.scheduleId || "");
    const company = companyById.get(order?.companyId || (production as any).companyId);
    const firmName = s(production.firmName || order?.firmName || firmById.get(production.firmId)?.firmName);
    const jobNo = s(production.transactionNo || production.jobCardNo);
    const erp = s(production.erpCode || production.masterErp || (production as any).erp);
    const stockItem = stockByErp.get(erp);
    const itemName = s(stockItem?.name || (production as any).itemName || (production as any).name);
    const productionRows = processingByJob.get(production.id) || [];
    const boardline = productionRows.filter((entry) => /corrugation|pasting|stitching|slotting|punching|gluing/i.test(entry.machineName)).reduce((sum, entry) => sum + n(entry.qty), 0);
    const printing = productionRows.filter((entry) => /printing/i.test(entry.machineName)).reduce((sum, entry) => sum + n(entry.qty), 0);
    const dispatch = dispatchByProduction.get(production.id) || { qty: 0, date: "", slips: [], invoiceIds: new Set<string>() };
    const relatedInvoices = Array.from(dispatch.invoiceIds).map((id) => invoiceMap.get(id)).filter(Boolean) as Invoice[];
    relatedInvoices.sort((a, b) => isoDateText(a.tallyInvDate || a.date).localeCompare(isoDateText(b.tallyInvDate || b.date)));
    const invoiceValues = relatedInvoices.map((invoice) => money(n(invoice.totalAfterGst || invoice.totalBeforeGst)));
    const invoiceDates = relatedInvoices.map((invoice) => isoDateText(invoice.tallyInvDate || invoice.date));
    const loadingRecords = (loadingByJob.get(production.id) || []).map(({ slip, qty }) => ({
      slipNo: s(slip.slipNo),
      date: isoDateText(slip.date),
      qty: money(qty),
      vehicle: s(slip.truckNo || truckMap.get(slip.truckId)?.truckNo),
    }));
    // Dispatch counts the first 6 loading slips of the job (matches Loading No/Date/Qty 1–6 columns).
    const dispatchedQty = loadingRecords.slice(0, 6).reduce((sum, record) => sum + n(record.qty), 0);
    // First 3 slips only, as the Google Summary Sheet counts them (for matching/audit).
    const dispatchedQty3 = loadingRecords.slice(0, 3).reduce((sum, record) => sum + n(record.qty), 0);
    const vehicle = Array.from(new Set(loadingRecords.map((record) => record.vehicle).filter(Boolean))).join(", ");
    const planned = n(production.plannedQty || production.qty || schedule?.qty);
    const pprUsed = n(production.actualPaperUsed);
    // Linear meter as in the Google Summary Sheet: sheets made (Boardline prod. ÷ UPS) × cutting with trimming (mm ÷ 1000).
    const ups = n(production.ups);
    const catalogItem: any = stockItemById.get(s(production.itemId));
    const cuttingMm = n(production.cuttingWithTrimming) || n(catalogItem?.cuttingSize) || n(catalogItem?.cuttingSizeLengthPiece);
    const linearMeter = ups > 0 && cuttingMm > 0 ? money((boardline / ups) * (cuttingMm / 1000)) : 0;
    const jobWeight = n(production.totalWeightOfSet) * planned;
    const rate = n(production.rate || order?.rate);
    const fgStock = stockItem?.balance || 0;
    const wastage = getProductionWastageTotals(production, productionRows);
    const realizationRaw = String(production.realizationPerKg ?? "").trim();
    const realizationValue = realizationRaw === "" || !Number.isFinite(Number(realizationRaw)) ? "" : Number(realizationRaw);
    // Job stage worked out from the data (not the saved status text), in the order the job moves.
    const isComplete = (pattern: RegExp, producedQty: number) =>
      productionRows.some((entry) => pattern.test(entry.machineName) && s(entry.completionStatus || "Full") === "Full")
      || (planned > 0 && producedQty >= planned);
    const jobClosed = s(production.closeBy).toLowerCase() === "yes" && Boolean(s(production.closeDate));
    const loadingStarted = dispatchedQty > 0;
    const stage = jobClosed ? "Job Closed"
      : !loadingStarted && pprUsed <= 0 && !hasPaperNotRequiredBypass(production) ? "Pending Material Issue"
      : !loadingStarted && !isComplete(/corrugation/i, productionRows.filter((entry) => /corrugation/i.test(entry.machineName)).reduce((sum, entry) => sum + n(entry.qty), 0)) ? "Pending Corrugation"
      : !loadingStarted && !isComplete(/printing/i, printing) ? "Pending Printing"
      : planned > 0 && dispatchedQty >= planned ? "Pending Job Closure"
      : "Pending Loading";
    // Totals: invoiced qty, loaded qty on all slips, value of invoices 1-6, all invoice numbers.
    const totalDispatch = money(invoicedQtyByProduction.get(production.id) || 0);
    const totalLoading = money(loadingRecords.reduce((sum, record) => sum + n(record.qty), 0));
    const totalInvoiceValue = money(invoiceValues.slice(0, 6).reduce((sum, value) => sum + value, 0));
    const invoiceNos = relatedInvoices.map((invoice) => s(invoice.invoiceNo || invoice.tallyInvNo)).filter(Boolean).join(", ");
    // Actual Realization / kg = Rate / (QC board weight in grams / 1000); blank without a weight or rate.
    const boardGrams = boardlineGramsByJob.get(jobNo.toLowerCase()) || printingGramsByJob.get(jobNo.toLowerCase()) || 0;
    const actualRealization = rate > 0 && boardGrams > 0 ? money(rate / (boardGrams / 1000)) : "";
    // PDI: latest inspection of the job, shown only when it is QC PASS / QC FAIL.
    const pdiResult = normalizeQcResult(findLatestInspection(lists.inspections || [], s(production.id), jobNo)?.result);
    const pdiReport = pdiResult === "QC PASS" || pdiResult === "QC FAIL" ? pdiResult : "";
    // Boardline Wastage = Boardline Prod. - Printing prod. (boxes), once printing has a quantity.
    // FG LEFT = Printing prod. - Dispatched Qty (never below 0; over-dispatch is flagged red).
    const hasPrinting = printing > 0;
    const fgLeft = hasPrinting ? money(Math.max(0, printing - dispatchedQty)) : "";
    const overDispatched = hasPrinting && dispatchedQty > printing ? 1 : "";
    // Cutting Size: length x breadth without a trailing .00 (425 x 390, 425.5 x 390).
    const row: SummaryRow = {
      "Job No.": jobNo, Date: isoDateText(production.date), "Party Name": s(production.companyName || company?.name), "Item Name": itemName, ERP: erp, "Planned Qty": planned, "FG Stock": fgStock, "Job Weight": money(jobWeight), "Customer Complaint": "", "PDI REPORT": pdiReport, "Realization / kg": realizationValue, Meter: linearMeter, "Cutting Size": [production.length, production.breadth].filter((value) => n(value) > 0).map((value) => String(Number(n(value).toFixed(2)))).join(" x "), UPS: n(production.ups), "Sheets prdcd": n(production.productionOutputQty), "Plate per box": n(production.setsPerBox), "Boardline Prod.": boardline, "Printing prod.": printing, "PPR Rqd.": n(production.totalPaperWeight), "PPR Used": pprUsed, "Paper Wastage": pprUsed && production.totalPaperWeight ? money(pprUsed - n(production.totalPaperWeight)) : "", "Boardline Wastage": hasPrinting ? money(boardline - printing) : "", __boardlineWastageKg: money(wastage.corrugationKg), __overDispatched: overDispatched, "Actual Realization / kg": actualRealization, "Dispatched Qty": money(dispatchedQty), "Dispatched Qty (3 slips)": money(dispatchedQty3), "Total Dispatch": totalDispatch, "Total Loading": totalLoading, "Total Invoice Value": totalInvoiceValue, "Invoice No": invoiceNos, "Dispatch Date": invoiceDates[0] || "", "Vehicle No": vehicle, "App Stock": fgStock, "Invoice Value 1": invoiceValues[0] ?? "", "Invoice Value 2": invoiceValues[1] ?? "", "Invoice Value 3": invoiceValues[2] ?? "", "Invoice No. 1": s(relatedInvoices[0]?.invoiceNo || relatedInvoices[0]?.tallyInvNo), "Invoice Date 1": invoiceDates[0] || "", "Invoice No. 2": s(relatedInvoices[1]?.invoiceNo || relatedInvoices[1]?.tallyInvNo), "Invoice Date 2": invoiceDates[1] || "", "Invoice No. 3": s(relatedInvoices[2]?.invoiceNo || relatedInvoices[2]?.tallyInvNo), "Invoice Date 3": invoiceDates[2] || "", "Loading No 1": loadingRecords[0]?.slipNo || "", "Loading Date 1": loadingRecords[0]?.date || "", "Loading Qty 1": loadingRecords[0]?.qty ?? "", "Vehicle 1": loadingRecords[0]?.vehicle || "", "Loading No 2": loadingRecords[1]?.slipNo || "", "Loading Date 2": loadingRecords[1]?.date || "", "Loading Qty 2": loadingRecords[1]?.qty ?? "", "Vehicle 2": loadingRecords[1]?.vehicle || "", "Loading No 3": loadingRecords[2]?.slipNo || "", "Loading Date 3": loadingRecords[2]?.date || "", "Loading Qty 3": loadingRecords[2]?.qty ?? "", "Vehicle 3": loadingRecords[2]?.vehicle || "", "Loading No 4": loadingRecords[3]?.slipNo || "", "Loading Date 4": loadingRecords[3]?.date || "", "Loading Qty 4": loadingRecords[3]?.qty ?? "", "Vehicle 4": loadingRecords[3]?.vehicle || "", "Loading No 5": loadingRecords[4]?.slipNo || "", "Loading Date 5": loadingRecords[4]?.date || "", "Loading Qty 5": loadingRecords[4]?.qty ?? "", "Vehicle 5": loadingRecords[4]?.vehicle || "", "Loading No 6": loadingRecords[5]?.slipNo || "", "Loading Date 6": loadingRecords[5]?.date || "", "Loading Qty 6": loadingRecords[5]?.qty ?? "", "Vehicle 6": loadingRecords[5]?.vehicle || "", "FG LEFT": fgLeft, Rate: rate, Status: stage, "Printing Wastage": productionRows.filter((entry) => /printing/i.test(entry.machineName)).reduce((sum, entry) => sum + n(entry.misprinting), 0), "Sale Value": money(dispatchedQty * rate), "Sale Value (3 slips)": money(dispatchedQty3 * rate), "FINAL FG LEFT": fgLeft, "wip value": money(Math.max(0, planned - dispatchedQty) * rate), Remarks: s(production.remarks), "Dispatched From FG": dispatchedQty ? "Yes" : "", Value: money(dispatchedQty * rate), Timestamp: isoDateText(production.updateTimestamp), "App sale value": money(dispatchedQty * rate),
    };
    // Before-app loadings: shown in their own columns; the app's own columns above are unchanged.
    const preApp = [
      ...(preAppByJob.get(production.id) || []),
      ...(preAppByJob.get(`job:${jobNo.toUpperCase()}`) || []),
      ...(s(production.jobCardNo) && s(production.jobCardNo) !== jobNo ? preAppByJob.get(`job:${s(production.jobCardNo).toUpperCase()}`) || [] : []),
    ].filter((row, index, all) => all.findIndex((other) => other.id === row.id) === index);
    if (preApp.length) {
      const combined = combineWithPreApp(preApp, loadingRecords);
      const preAppQty = combined.filter((record) => record.preApp).reduce((sum, record) => sum + record.qty, 0);
      const preAppDates = combined.filter((record) => record.preApp && record.date).map((record) => record.date).sort();
      const totalQty = combined.slice(0, 6).reduce((sum, record) => sum + record.qty, 0);
      const totalQty3 = combined.slice(0, 3).reduce((sum, record) => sum + record.qty, 0);
      const firstDate = [preAppDates[0], invoiceDates[0]].filter(Boolean).sort()[0] || "";
      row["Pre-App Dispatched Qty"] = money(preAppQty);
      row["Pre-App Sale Value"] = money(preAppQty * rate);
      row["Pre-App Loading No"] = combined.filter((record) => record.preApp).map((record) => record.slipNo).filter(Boolean).join(", ");
      row["Pre-App Invoice No"] = preApp.map((entry) => s(entry.invoiceNo)).filter(Boolean).join(", ");
      row["Pre-App Invoice Date"] = preAppDates[0] || "";
      row["Dispatched Qty incl. Pre-App"] = money(totalQty);
      row["Dispatched Qty incl. Pre-App (3 slips)"] = money(totalQty3);
      row["Sale Value incl. Pre-App"] = money(totalQty * rate);
      row["Sale Value incl. Pre-App (3 slips)"] = money(totalQty3 * rate);
      row["Invoice Date 1 incl. Pre-App"] = firstDate;
    } else {
      row["Dispatched Qty incl. Pre-App"] = money(dispatchedQty);
      row["Dispatched Qty incl. Pre-App (3 slips)"] = money(dispatchedQty3);
      row["Sale Value incl. Pre-App"] = money(dispatchedQty * rate);
      row["Sale Value incl. Pre-App (3 slips)"] = money(dispatchedQty3 * rate);
      row["Invoice Date 1 incl. Pre-App"] = invoiceDates[0] || "";
    }
    row["Job Closed"] = s(production.closeBy).toLowerCase() === "yes" ? "Yes" : "";
    row["Close Date"] = isoDateText(production.closeDate);
    row.__productionId = production.id;
    row.__firmName = s(production.firmName || firmById.get(production.firmId)?.firmName);
    return row;
  });
}
