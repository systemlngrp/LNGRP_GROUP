import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useData } from "../hooks/useData";
import { useNpdItems } from "../hooks/useNpdItems";
import { formatDate } from "../lib/serial";
import { normalizeMachineName } from "../lib/productionMachineNames";
import { DispatchPlan, InvoiceLineItem, LoadingSlip, Production, ProductionProcessing } from "../types";

type JobMovementRow = {
  productionId: string;
  jobNo: string;
  jobDate: string;
  erp: string;
  company: string;
  itemName: string;
  planQty: number;
  corrugation: number;
  fg: number;
  invoiced: number;
  loading: number;
  balance: number;
};

function text(value: unknown) { return String(value ?? "").trim(); }
function key(value: unknown) { return text(value).toLowerCase(); }
function quantity(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function roundQuantity(value: number) { return Number(quantity(value).toFixed(2)); }
function formatQty(value: number) { return roundQuantity(value).toFixed(2); }
function addQuantity(map: Map<string, number>, id: string, amount: number) { if (id && Number.isFinite(amount)) map.set(id, roundQuantity((map.get(id) || 0) + amount)); }
function getLineItemIdentity(line: { itemId?: string; itemSource?: string; npdId?: string }) { return `${key(line.itemSource)}::${key(line.itemId)}::${key(line.npdId)}`; }

export function JobsInProgressReport() {
  const [productions] = useData<Production>("productions", []);
  const [processing] = useData<ProductionProcessing>("production_processing", []);
  const [plans] = useData<DispatchPlan>("dispatch_plans", []);
  const [loadingSlips] = useData<LoadingSlip>("loading_slips", [], { firmScope: "all", storageKey: "loading-slips-all-firms" });
  const [invoiceLineItems] = useData<InvoiceLineItem>("invoice_line_items", [], { firmScope: "all", storageKey: "invoice-lines-all-firms" });
  const items = useNpdItems();
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const rows = useMemo<JobMovementRow[]>(() => {
    const productionById = new Map(productions.map((production) => [production.id, production]));
    const productionByJob = new Map<string, Production>();
    productions.forEach((production) => { const jobNo = key(production.transactionNo || production.jobCardNo); if (jobNo) productionByJob.set(jobNo, production); });
    const planById = new Map(plans.map((plan) => [plan.id, plan]));
    const loadingByProduction = new Map<string, number>();
    const loadingEvidence = new Set<string>();
    const companyByProduction = new Map<string, string>();
    const itemNameByProduction = new Map<string, string>();
    const loadingAllocationsBySlip = new Map<string, Array<{ productionId: string; qty: number; identity: string }>>();
    const resolveProductionId = (jobId: unknown, jobNo: unknown) => { const directId = text(jobId); if (directId && productionById.has(directId)) return directId; return productionByJob.get(key(jobNo))?.id || ""; };
    const recordLoadingMetadata = (productionId: string, line: LoadingSlip["lines"][number]) => {
      if (text(line.companyName)) companyByProduction.set(productionId, text(line.companyName));
      if (text(line.itemName)) itemNameByProduction.set(productionId, text(line.itemName));
    };

    loadingSlips.forEach((slip) => {
      if (slip.status === "Cancelled") return;
      const slipAllocations: Array<{ productionId: string; qty: number; identity: string }> = [];
      slip.lines.forEach((line) => {
        const plan = planById.get(line.dispatchPlanId);
        const allocations = (line.allocations || []).filter((allocation) => allocation.sourceType === "job");
        const resolvedAllocations = allocations.map((allocation) => ({ productionId: resolveProductionId(allocation.jobId, allocation.jobNo), qty: quantity(allocation.qty) })).filter((allocation) => allocation.productionId && allocation.qty > 0);
        if (resolvedAllocations.length) {
          resolvedAllocations.forEach((allocation) => { const identity = getLineItemIdentity(line); recordLoadingMetadata(allocation.productionId, line); addQuantity(loadingByProduction, allocation.productionId, allocation.qty); loadingEvidence.add(allocation.productionId); slipAllocations.push({ ...allocation, identity }); });
          return;
        }
        const planProductionId = text(plan?.productionId);
        const jobNumbers = (line.jobNos || []).map(key).filter(Boolean);
        const fallbackProductionId = planProductionId && productionById.has(planProductionId) ? planProductionId : jobNumbers.length === 1 ? productionByJob.get(jobNumbers[0])?.id || "" : "";
        if (!fallbackProductionId || quantity(line.loadedQty) <= 0) return;
        const fallback = { productionId: fallbackProductionId, qty: quantity(line.loadedQty), identity: getLineItemIdentity(line) };
        recordLoadingMetadata(fallback.productionId, line);
        addQuantity(loadingByProduction, fallback.productionId, fallback.qty); loadingEvidence.add(fallback.productionId); slipAllocations.push(fallback);
      });
      if (slipAllocations.length) loadingAllocationsBySlip.set(slip.id, slipAllocations);
    });

    plans.forEach((plan) => { const productionId = text(plan.productionId); if (productionId && !loadingEvidence.has(productionId)) addQuantity(loadingByProduction, productionId, quantity(plan.loadedQty)); });

    const invoicedByProduction = new Map<string, number>();
    invoiceLineItems.forEach((invoiceLine) => {
      const invoiceQty = quantity(invoiceLine.qty); if (invoiceQty <= 0) return;
      const allocations = loadingAllocationsBySlip.get(invoiceLine.loadingSlipId) || [];
      const invoiceIdentity = getLineItemIdentity(invoiceLine);
      const matchingAllocations = allocations.filter((allocation) => allocation.identity === invoiceIdentity || allocation.identity.split("::")[1] === key(invoiceLine.itemId) || allocation.identity.split("::")[2] === key(invoiceLine.npdId));
      const candidates = matchingAllocations.length ? matchingAllocations : allocations;
      const totalAllocated = candidates.reduce((sum, allocation) => sum + allocation.qty, 0);
      if (totalAllocated > 0) candidates.forEach((allocation) => addQuantity(invoicedByProduction, allocation.productionId, invoiceQty * allocation.qty / totalAllocated));
    });

    const corrugationByProduction = new Map<string, number>();
    processing.forEach((entry) => { if (normalizeMachineName(entry.machineName).startsWith("Corrugation")) addQuantity(corrugationByProduction, entry.productionId, quantity(entry.qty)); });
    const query = key(searchTerm); const fromMs = dateFrom ? new Date(dateFrom).getTime() : null; const toMs = dateTo ? new Date(dateTo).getTime() : null;

    return productions.filter((production) => production.status !== "Cancelled" && !production.cancelTimestamp).map((production) => {
      const erp = text(production.erpCode || production.masterErp);
      const item = items.find((candidate: any) => key(candidate.id) === key(production.itemId) || key(candidate.id) === key(production.npdId) || key(candidate.erp) === key(erp));
      const planQty = quantity(production.plannedQty || production.qty); const loading = roundQuantity(loadingByProduction.get(production.id) || 0);
      return { productionId: production.id, jobNo: text(production.transactionNo || production.jobCardNo), jobDate: text(production.date), erp, company: text(production.companyName || (item as any)?.companyName || companyByProduction.get(production.id)), itemName: text((production as Production & { itemName?: string }).itemName || (item as any)?.name || (item as any)?.itemName || itemNameByProduction.get(production.id) || production.itemId), planQty, corrugation: roundQuantity(corrugationByProduction.get(production.id) || 0), fg: roundQuantity(production.prodFromFFG), invoiced: roundQuantity(invoicedByProduction.get(production.id) || 0), loading, balance: roundQuantity(Math.max(0, planQty - loading)) };
    }).filter((row) => {
      const haystack = [row.jobNo, row.erp, row.company, row.itemName].map(key).join(" "); if (query && !haystack.includes(query)) return false;
      const jobDateMs = row.jobDate ? new Date(row.jobDate).getTime() : NaN; if (fromMs != null && (!Number.isFinite(jobDateMs) || jobDateMs < fromMs)) return false; if (toMs != null && (!Number.isFinite(jobDateMs) || jobDateMs > toMs)) return false; return true;
    }).sort((a, b) => { const dateDiff = new Date(b.jobDate || 0).getTime() - new Date(a.jobDate || 0).getTime(); return dateDiff || a.jobNo.localeCompare(b.jobNo, undefined, { numeric: true, sensitivity: "base" }); });
  }, [dateFrom, dateTo, invoiceLineItems, items, loadingSlips, plans, processing, productions, searchTerm]);

  const summary = useMemo(() => rows.reduce((acc, row) => ({ jobs: acc.jobs + 1, planned: acc.planned + row.planQty, fg: acc.fg + row.fg, loading: acc.loading + row.loading, balance: acc.balance + row.balance }), { jobs: 0, planned: 0, fg: 0, loading: 0, balance: 0 }), [rows]);
  const handleClear = () => { setSearchTerm(""); setDateFrom(""); setDateTo(""); };
  const columns = ["Plan Qty", "Job No.", "Job Date", "ERP", "Company", "Item Name", "Corrugation", "FG", "Invoiced", "Loading", "Balance"];
  const summaryCards = [
    { label: "Jobs", value: summary.jobs, card: "border-blue-300 bg-blue-50", labelText: "text-blue-700", valueText: "text-blue-900" },
    { label: "Plan Qty", value: summary.planned, card: "border-emerald-300 bg-emerald-50", labelText: "text-emerald-700", valueText: "text-emerald-900" },
    { label: "FG", value: summary.fg, card: "border-violet-300 bg-violet-50", labelText: "text-violet-700", valueText: "text-violet-900" },
    { label: "Loading", value: summary.loading, card: "border-amber-300 bg-amber-50", labelText: "text-amber-700", valueText: "text-amber-900" },
    { label: "Balance", value: summary.balance, card: "border-rose-300 bg-rose-50", labelText: "text-rose-700", valueText: "text-rose-900" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 border-b border-black pb-3"><h2 className="text-xl font-bold uppercase tracking-tight text-black">Job Movement Tracker</h2></div>
      <div className="grid gap-3 md:grid-cols-5">{summaryCards.map((card) => <div key={card.label} className={`rounded border p-4 ${card.card}`}><div className={`text-xs font-black uppercase ${card.labelText}`}>{card.label}</div><div className={`mt-1 text-2xl font-black ${card.valueText}`}>{card.label === "Jobs" ? card.value : formatQty(card.value)}</div></div>)}</div>
      <div className="rounded border border-black bg-white p-3"><div className="flex flex-wrap items-center gap-3"><div className="relative min-w-[260px] flex-[1_1_300px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search job / ERP / company / item" className="w-full rounded border-2 border-black py-2.5 pl-9 pr-3 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600" /></div><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} title="Job Date From" className="min-w-[150px] flex-[0_1_170px] rounded border-2 border-black px-3 py-2.5 text-sm" /><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} title="Job Date To" className="min-w-[150px] flex-[0_1_170px] rounded border-2 border-black px-3 py-2.5 text-sm" /><button type="button" onClick={handleClear} className="min-h-[42px] rounded border border-black bg-white px-3 py-2 text-sm font-bold text-black hover:bg-slate-50">Clear Filters</button></div></div>
      <div className="overflow-hidden rounded border-2 border-black bg-white shadow-sm"><div className="relative max-h-[calc(100vh-250px)] w-full overflow-auto"><table className="w-full min-w-[1500px] border-collapse text-[12px]"><thead className="sticky top-0 z-20 bg-indigo-700 text-white"><tr>{columns.map((heading) => <th key={heading} className="sticky top-0 z-20 whitespace-nowrap border-2 border-black bg-indigo-700 px-3 py-3 text-left text-xs font-black uppercase text-white">{heading}</th>)}</tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={columns.length} className="border-2 border-black px-6 py-10 text-center text-sm font-medium text-black">No active jobs match the current filters.</td></tr> : rows.map((row) => <tr key={row.productionId} className="text-black hover:bg-slate-50"><td className="border-2 border-black px-3 py-3 text-right font-bold">{formatQty(row.planQty)}</td><td className="border-2 border-black px-3 py-3 font-bold">{row.jobNo || "-"}</td><td className="whitespace-nowrap border-2 border-black px-3 py-3">{formatDate(row.jobDate)}</td><td className="border-2 border-black px-3 py-3">{row.erp || "-"}</td><td className="min-w-[220px] max-w-[360px] whitespace-normal break-words border-2 border-black px-3 py-3">{row.company || "-"}</td><td className="min-w-[260px] max-w-[420px] whitespace-normal break-words border-2 border-black px-3 py-3">{row.itemName || "-"}</td><td className="border-2 border-black px-3 py-3 text-right">{formatQty(row.corrugation)}</td><td className="border-2 border-black px-3 py-3 text-right">{formatQty(row.fg)}</td><td className="border-2 border-black px-3 py-3 text-right">{formatQty(row.invoiced)}</td><td className="border-2 border-black px-3 py-3 text-right">{formatQty(row.loading)}</td><td className="border-2 border-black bg-rose-50 px-3 py-3 text-right font-bold text-rose-900">{formatQty(row.balance)}</td></tr>)}</tbody></table></div></div>
    </div>
  );
}
