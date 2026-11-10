import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useData } from "../hooks/useData";
import { useNpdItems } from "../hooks/useNpdItems";
import { formatDate } from "../lib/serial";
import { DispatchPlan, InvoiceLineItem, LoadingSlip, Production, ProductionProcessing } from "../types";

import { computeJobsInProgressRows, text, key, quantity, roundQuantity, formatQty, addQuantity, getLineItemIdentity } from "../lib/reports/jobsInProgress";
import type { JobMovementRow } from "../lib/reports/jobsInProgress";
import { useServerReport } from "../hooks/useServerReport";
import { useTableSearch } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";

const JOBS_IN_PROGRESS_TABLES = ["productions", "production_processing", "dispatch_plans", "loading_slips", "invoice_line_items", "invoices", "npd"];

export function JobsInProgressReport() {
  // Base rows are calculated on the server; if it cannot, the lists are loaded
  // and calculated here as before.
  const serverReport = useServerReport<JobMovementRow[]>("jobs-in-progress", {}, JOBS_IN_PROGRESS_TABLES);
  const browserFallback = serverReport.failed;
  const [productions] = useData<Production>("productions", [], { enabled: browserFallback });
  const [processing] = useData<ProductionProcessing>("production_processing", [], { enabled: browserFallback });
  const [plans] = useData<DispatchPlan>("dispatch_plans", [], { enabled: browserFallback });
  const [loadingSlips] = useData<LoadingSlip>("loading_slips", [], { firmScope: "all", storageKey: "loading-slips-all-firms", enabled: browserFallback });
  const [invoiceLineItems] = useData<InvoiceLineItem>("invoice_line_items", [], { firmScope: "all", storageKey: "invoice-lines-all-firms", enabled: browserFallback });
  const items = useNpdItems({ enabled: browserFallback });
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const clientBaseRows = useMemo<JobMovementRow[]>(
    () => (browserFallback ? computeJobsInProgressRows({ productions, processing, plans, loadingSlips, invoiceLineItems }, items) : []),
    [browserFallback, invoiceLineItems, items, loadingSlips, plans, processing, productions]
  );
  const baseRows = browserFallback ? clientBaseRows : (serverReport.result || []);
  // Table search: every typed word must be in the columns the table shows.
  const searchedRows = useTableSearch(baseRows, searchTerm, (row) => [
    row.planQty, row.jobNo, formatDate(row.jobDate), row.erp, row.company, row.itemName,
    row.corrugation, row.fg, row.invoiced, row.loading, row.balance,
  ]);
  const rows = useMemo<JobMovementRow[]>(() => {
    const fromMs = dateFrom ? new Date(dateFrom).getTime() : null; const toMs = dateTo ? new Date(dateTo).getTime() : null;
    return searchedRows.filter((row) => {
      const jobDateMs = row.jobDate ? new Date(row.jobDate).getTime() : NaN; if (fromMs != null && (!Number.isFinite(jobDateMs) || jobDateMs < fromMs)) return false; if (toMs != null && (!Number.isFinite(jobDateMs) || jobDateMs > toMs)) return false; return true;
    }).sort((a, b) => { const dateDiff = new Date(b.jobDate || 0).getTime() - new Date(a.jobDate || 0).getTime(); return dateDiff || a.jobNo.localeCompare(b.jobNo, undefined, { numeric: true, sensitivity: "base" }); });
  }, [searchedRows, dateFrom, dateTo]);

  const summary = useMemo(() => rows.reduce((acc, row) => ({ jobs: acc.jobs + 1, planned: acc.planned + row.planQty, fg: acc.fg + row.fg, loading: acc.loading + row.loading, balance: acc.balance + row.balance }), { jobs: 0, planned: 0, fg: 0, loading: 0, balance: 0 }), [rows]);
  // Column sort over every filtered row; with no sort the newest-first order stays.
  const sortFields: (keyof JobMovementRow)[] = ["planQty", "jobNo", "jobDate", "erp", "company", "itemName", "corrugation", "fg", "invoiced", "loading", "balance"];
  const { sorted: sortedRows, sort, toggle: toggleSort } = useTableSort(rows, (row, key) => row[key as keyof JobMovementRow]);
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
      <div className="flex flex-col gap-2 border-b border-black pb-3"><h2 className="text-xl font-bold uppercase tracking-tight text-black">Jobs in Progress</h2></div>
      <div className="grid gap-3 md:grid-cols-5">{summaryCards.map((card) => <div key={card.label} className={`rounded border p-4 ${card.card}`}><div className={`text-xs font-black uppercase ${card.labelText}`}>{card.label}</div><div className={`mt-1 text-2xl font-black ${card.valueText}`}>{card.label === "Jobs" ? card.value : formatQty(card.value)}</div></div>)}</div>
      <div className="rounded border border-black bg-white p-3"><div className="flex flex-wrap items-center gap-3"><div className="relative min-w-[260px] flex-[1_1_300px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search" className="w-full rounded border-2 border-black py-2.5 pl-9 pr-3 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600" /></div><label className="block min-w-[150px] flex-[0_1_170px]"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">From Date</span><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} title="Job Date From" className="w-full rounded border-2 border-black px-3 py-2.5 text-sm" /></label><label className="block min-w-[150px] flex-[0_1_170px]"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">To Date</span><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} title="Job Date To" className="w-full rounded border-2 border-black px-3 py-2.5 text-sm" /></label><button type="button" onClick={handleClear} className="min-h-[42px] rounded border border-black bg-white px-3 py-2 text-sm font-bold text-black hover:bg-slate-50">Clear Filters</button></div></div>
      <div className="overflow-hidden rounded border-2 border-black bg-white shadow-sm"><div className="relative max-h-[calc(100vh-250px)] w-full overflow-auto"><table className="w-full min-w-[1500px] border-collapse text-[12px]"><thead className="sticky top-0 z-20 bg-indigo-700 text-white"><tr>{columns.map((heading, index) => <th key={heading} className="sticky top-0 z-20 whitespace-nowrap border-2 border-black bg-indigo-700 px-3 py-3 text-left text-xs font-black uppercase text-white"><SortHeader label={heading} sortKey={sortFields[index]} sort={sort} onToggle={toggleSort} align="left" /></th>)}</tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={columns.length} className="border-2 border-black px-6 py-10 text-center text-sm font-medium text-black">No active jobs match the current filters.</td></tr> : sortedRows.map((row) => <tr key={row.productionId} className="text-black hover:bg-slate-50"><td className="border-2 border-black px-3 py-3 text-right font-bold">{formatQty(row.planQty)}</td><td className="border-2 border-black px-3 py-3 font-bold">{row.jobNo || "-"}</td><td className="whitespace-nowrap border-2 border-black px-3 py-3">{formatDate(row.jobDate)}</td><td className="border-2 border-black px-3 py-3">{row.erp || "-"}</td><td className="min-w-[220px] max-w-[360px] whitespace-normal break-words border-2 border-black px-3 py-3">{row.company || "-"}</td><td className="min-w-[260px] max-w-[420px] whitespace-normal break-words border-2 border-black px-3 py-3">{row.itemName || "-"}</td><td className="border-2 border-black px-3 py-3 text-right">{formatQty(row.corrugation)}</td><td className="border-2 border-black px-3 py-3 text-right">{formatQty(row.fg)}</td><td className="border-2 border-black px-3 py-3 text-right">{formatQty(row.invoiced)}</td><td className="border-2 border-black px-3 py-3 text-right">{formatQty(row.loading)}</td><td className="border-2 border-black bg-rose-50 px-3 py-3 text-right font-bold text-rose-900">{formatQty(row.balance)}</td></tr>)}</tbody></table></div></div>
    </div>
  );
}
