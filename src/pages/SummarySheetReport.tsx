import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useData } from "../hooks/useData";
import { useNpdItems } from "../hooks/useNpdItems";
import { ExcelExport } from "../components/ExcelExport";
import { getProductionWastageTotals } from "../lib/wastageCalculations";
import type { Company, DispatchPlan, Firm, Invoice, InvoiceLineItem, LoadingSlip, Order, OrderSchedule, Production, ProductionProcessing, Truck } from "../types";

const COLUMNS = [
  "Job No.", "Date", "Party Name", "Item Name", "ERP", "Planned Qty", "FG Stock", "Job Weight", "Customer Complaint", "PDI REPORT", "Realization / kg", "Meter", "Cutting Size", "UPS", "Sheets prdcd", "Plate per box", "Boardline Prod.", "Printing prod.", "PPR Rqd.", "PPR Used", "Paper Wastage", "Boardline Wastage", "Actual Realization / kg", "Dispatched Qty", "Dispatch Date", "Inv No.", "Vehicle No", "FG LEFT", "Rate", "Status", "Printing Wastage", "Sale Value", "FINAL FG LEFT", "App Stock", "wip value", "Remarks", "Dispatched From FG", "Rate", "Value", "Timestamp", "App sale value", "Invoice Date 1", "Invoice Value 1", "Invoice Date 2", "Invoice Value 2", "Invoice Date 3", "Invoice Value 3",
] as const;

type SummaryRow = Record<(typeof COLUMNS)[number], string | number>;
const n = (value: unknown) => { const result = Number(value); return Number.isFinite(result) ? result : 0; };
const s = (value: unknown) => String(value ?? "").trim();
const dateText = (value: unknown) => s(value).slice(0, 10);
const money = (value: number) => Number(value.toFixed(2));

export function SummarySheetReport() {
  const [productions] = useData<Production>("productions", [], { firmScope: "all" });
  const [processing] = useData<ProductionProcessing>("production_processing", [], { firmScope: "all" });
  const [orders] = useData<Order>("orders", [], { firmScope: "all" });
  const [schedules] = useData<OrderSchedule>("orders_schedule", [], { firmScope: "all" });
  const [plans] = useData<DispatchPlan>("dispatch_plans", [], { firmScope: "all", storageKey: "summary-sheet-dispatch-plans" });
  const [slips] = useData<LoadingSlip>("loading_slips", [], { firmScope: "all", storageKey: "summary-sheet-loading-slips" });
  const [invoices] = useData<Invoice>("invoices", [], { firmScope: "all", storageKey: "summary-sheet-invoices" });
  const [invoiceLines] = useData<InvoiceLineItem>("invoice_line_items", [], { firmScope: "all", storageKey: "summary-sheet-invoice-lines" });
  const [trucks] = useData<Truck>("trucks", [], { firmScope: "all" });
  const [companies] = useData<Company>("companies", []);
  const [firms] = useData<Firm>("firms", []);
  const stockItems = useNpdItems();
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [firmFilter, setFirmFilter] = useState("");

  const rows = useMemo<SummaryRow[]>(() => {
    const orderMap = new Map(orders.map((row) => [row.id, row]));
    const scheduleMap = new Map(schedules.map((row) => [row.id, row]));
    const invoiceMap = new Map(invoices.map((row) => [row.id, row]));
    const truckMap = new Map(trucks.map((row) => [row.id, row]));
    const stockByErp = new Map(stockItems.map((item: any) => [s(item.erp || item.erpCode || item.masterItemNameErpCode), { name: s(item.name || item.itemName), balance: n(item.balance) }]));
    const invoiceLinesBySlip = new Map<string, InvoiceLineItem[]>();
    invoiceLines.forEach((line) => { const list = invoiceLinesBySlip.get(line.loadingSlipId) || []; list.push(line); invoiceLinesBySlip.set(line.loadingSlipId, list); });
    const processingByJob = new Map<string, ProductionProcessing[]>();
    processing.forEach((entry) => { const list = processingByJob.get(entry.productionId) || []; list.push(entry); processingByJob.set(entry.productionId, list); });
    const dispatchByProduction = new Map<string, { qty: number; date: string; slips: LoadingSlip[]; invoiceIds: Set<string> }>();
    plans.forEach((plan) => {
      if (!plan.productionId) return;
      const relatedSlips = slips.filter((slip) => slip.status !== "Cancelled" && slip.lines.some((line) => line.dispatchPlanId === plan.id));
      const qty = relatedSlips.reduce((sum, slip) => sum + slip.lines.filter((line) => line.dispatchPlanId === plan.id).reduce((lineSum, line) => lineSum + n(line.loadedQty), 0), 0);
      const current = dispatchByProduction.get(plan.productionId) || { qty: 0, date: "", slips: [], invoiceIds: new Set<string>() };
      const planInvoiceLines = relatedSlips.flatMap((slip) => invoiceLinesBySlip.get(slip.id) || []).filter((line) => !line.itemId || line.itemId === plan.orderId);
      current.qty += planInvoiceLines.reduce((sum, line) => sum + n(line.qty), 0) || qty || n(plan.loadedQty);
      current.date = current.date || dateText(relatedSlips[0]?.date || plan.date);
      relatedSlips.forEach((slip) => { if (slip.invoiceId) current.invoiceIds.add(slip.invoiceId); });
      planInvoiceLines.forEach((line) => { if (line.invoiceId) current.invoiceIds.add(line.invoiceId); });
      current.slips.push(...relatedSlips);
      dispatchByProduction.set(plan.productionId, current);
    });
    const query = search.trim().toLowerCase();
    return productions.filter((production) => {
      if (production.status === "Cancelled") return false;
      if (!firmFilter) return true;
      const name = s(production.firmName || firms.find((firm) => firm.id === production.firmId)?.firmName).toLowerCase();
      return name === firmFilter.toLowerCase();
    }).map((production) => {
      const order = orderMap.get(schedules.find((schedule) => schedule.id === production.scheduleId)?.orderId || "");
      const schedule = scheduleMap.get(production.scheduleId || "");
      const company = companies.find((entry) => entry.id === (order?.companyId || (production as any).companyId));
      const firmName = s(production.firmName || order?.firmName || firms.find((firm) => firm.id === production.firmId)?.firmName);
      const jobNo = s(production.transactionNo || production.jobCardNo);
      const erp = s(production.erpCode || production.masterErp || (production as any).erp);
      const stockItem = stockByErp.get(erp);
      const itemName = s(stockItem?.name || (production as any).itemName || (production as any).name);
      const productionRows = processingByJob.get(production.id) || [];
      const boardline = productionRows.filter((entry) => /corrugation|pasting|stitching|slotting|punching|gluing/i.test(entry.machineName)).reduce((sum, entry) => sum + n(entry.qty), 0);
      const printing = productionRows.filter((entry) => /printing/i.test(entry.machineName)).reduce((sum, entry) => sum + n(entry.qty), 0);
      const dispatch = dispatchByProduction.get(production.id) || { qty: 0, date: "", slips: [], invoiceIds: new Set<string>() };
      const relatedInvoices = Array.from(dispatch.invoiceIds).map((id) => invoiceMap.get(id)).filter(Boolean) as Invoice[];
      relatedInvoices.sort((a, b) => dateText(a.tallyInvDate || a.date).localeCompare(dateText(b.tallyInvDate || b.date)));
      const invoiceValues = relatedInvoices.map((invoice) => money(n(invoice.totalAfterGst || invoice.totalBeforeGst)));
      const invoiceDates = relatedInvoices.map((invoice) => dateText(invoice.tallyInvDate || invoice.date));
      const vehicle = Array.from(new Set(dispatch.slips.map((slip) => s(slip.truckNo || truckMap.get(slip.truckId)?.truckNo)).filter(Boolean))).join(", ");
      const planned = n(production.plannedQty || production.qty || schedule?.qty);
      const pprUsed = n(production.actualPaperUsed);
      const jobWeight = n(production.totalWeightOfSet) * planned;
      const rate = n(production.rate || order?.rate);
      const fgStock = stockItem?.balance || 0;
      const wastage = getProductionWastageTotals(production, productionRows);
      // The requested export layout contains two columns both labelled Rate.
      // The second value is intentionally the same rate for now because the source model has one reliable rate.
      // @ts-ignore duplicate export label is represented by the COLUMNS array.
      const row: SummaryRow = {
        // @ts-ignore The export schema intentionally repeats the Rate header.
        "Job No.": jobNo, Date: dateText(production.date), "Party Name": s(production.companyName || company?.name), "Item Name": itemName, ERP: erp, "Planned Qty": planned, "FG Stock": fgStock, "Job Weight": money(jobWeight), "Customer Complaint": "", "PDI REPORT": "", "Realization / kg": n(production.realizationPerKg), Meter: n(production.productionInMeter || production.plannedProductionInMeter), "Cutting Size": [production.length, production.breadth].filter((value) => n(value) > 0).join(" x "), UPS: n(production.ups), "Sheets prdcd": n(production.productionOutputQty), "Plate per box": n(production.setsPerBox), "Boardline Prod.": boardline, "Printing prod.": printing, "PPR Rqd.": n(production.totalPaperWeight), "PPR Used": pprUsed, "Paper Wastage": pprUsed && production.totalPaperWeight ? money(pprUsed - n(production.totalPaperWeight)) : "", "Boardline Wastage": money(wastage.corrugationKg), "Actual Realization / kg": n(production.realizationPerKg), "Dispatched Qty": money(dispatch.qty), "Dispatch Date": invoiceDates[0] || "", "Inv No.": relatedInvoices.map((invoice) => invoice.invoiceNo || invoice.tallyInvNo).filter(Boolean).join(", "), "Vehicle No": vehicle, "FG LEFT": money(Math.max(0, planned - dispatch.qty)), Rate: rate, Status: s(production.status), "Printing Wastage": productionRows.filter((entry) => /printing/i.test(entry.machineName)).reduce((sum, entry) => sum + n(entry.misprinting), 0), "Sale Value": money(dispatch.qty * rate), "FINAL FG LEFT": money(Math.max(0, planned - dispatch.qty)), "App Stock": fgStock, "wip value": money(Math.max(0, planned - dispatch.qty) * rate), Remarks: s(production.remarks), "Dispatched From FG": dispatch.qty ? "Yes" : "", "Rate": rate, Value: money(dispatch.qty * rate), Timestamp: s(production.updateTimestamp), "App sale value": money(dispatch.qty * rate), "Invoice Date 1": invoiceDates[0] || "", "Invoice Value 1": invoiceValues[0] ?? "", "Invoice Date 2": invoiceDates[1] || "", "Invoice Value 2": invoiceValues[1] ?? "", "Invoice Date 3": invoiceDates[2] || "", "Invoice Value 3": invoiceValues[2] ?? "",
      };
      return row;
    }).filter((row) => {
      const rowDate = s(row.Date);
      if (from && rowDate < from) return false;
      if (to && rowDate > to) return false;
      if (query && ![row["Job No."], row["Party Name"], row["Item Name"], row.ERP].some((value) => s(value).toLowerCase().includes(query))) return false;
      return true;
    });
  }, [companies, firmFilter, firms, from, invoiceLines, invoices, orders, plans, processing, productions, schedules, search, slips, stockItems, to, trucks]);

  const exportRows = useMemo(() => rows.map((row) => Object.fromEntries(COLUMNS.map((column) => [column, row[column] ?? ""]))), [rows]);
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black pb-3"><h2 className="text-xl font-bold uppercase">Summary Sheet</h2><ExcelExport data={exportRows} fileName="Summary_Sheet" sheetName="Summary Sheet" /></div>
    <div className="flex flex-wrap items-center gap-2 rounded border border-black bg-white p-3"><div className="relative min-w-[260px] flex-1"><Search className="absolute left-2 top-2.5 text-slate-500" size={16} /><input className="w-full rounded border border-black py-2 pl-8 pr-2" placeholder="Search job / party / item / ERP" value={search} onChange={(event) => setSearch(event.target.value)} /></div><input type="date" className="rounded border border-black p-2" value={from} onChange={(event) => setFrom(event.target.value)} /><input type="date" className="rounded border border-black p-2" value={to} onChange={(event) => setTo(event.target.value)} /><select className="rounded border border-black p-2" value={firmFilter} onChange={(event) => setFirmFilter(event.target.value)}><option value="">All Firms</option>{firms.map((firm) => <option key={firm.id} value={firm.firmName}>{firm.firmName}</option>)}</select></div>
    <div className="overflow-auto rounded border-2 border-black bg-white"><table className="min-w-[4200px] border-collapse text-[11px]"><thead><tr className="bg-indigo-700 text-white">{COLUMNS.map((column) => <th key={column} className="whitespace-nowrap border border-black px-2 py-2 text-left font-black">{column}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={`${row["Job No."]}-${index}`} className="odd:bg-white even:bg-slate-50">{COLUMNS.map((column) => <td key={column} className="whitespace-nowrap border border-black px-2 py-2">{row[column] ?? ""}</td>)}</tr>) : <tr><td colSpan={COLUMNS.length} className="p-8 text-center">No summary rows found.</td></tr>}</tbody></table></div>
  </div>;
}
