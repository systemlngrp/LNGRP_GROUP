import { displayJobNo } from "../lib/jobNumber";
import React, { useMemo, useState } from "react";
import { DateRangeFilter, ReportFilterBox, SelectFilter, toFilterOptions } from "../components/ReportFilterBox";
import { Download, FileText, Search } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { exportsAllowed } from "../lib/exportPolicy";
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
  const [companyFilter, setCompanyFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");

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
      if (companyFilter && row.company !== companyFilter) return false;
      if (itemFilter && row.erp !== itemFilter) return false;
      const jobDateMs = row.jobDate ? new Date(row.jobDate).getTime() : NaN; if (fromMs != null && (!Number.isFinite(jobDateMs) || jobDateMs < fromMs)) return false; if (toMs != null && (!Number.isFinite(jobDateMs) || jobDateMs > toMs)) return false; return true;
    }).sort((a, b) => { const dateDiff = new Date(b.jobDate || 0).getTime() - new Date(a.jobDate || 0).getTime(); return dateDiff || a.jobNo.localeCompare(b.jobNo, undefined, { numeric: true, sensitivity: "base" }); });
  }, [searchedRows, dateFrom, dateTo, companyFilter, itemFilter]);
  const companyOptions = useMemo(() => toFilterOptions(baseRows.map((row) => row.company)), [baseRows]);
  const itemOptions = useMemo(() => Array.from(new Map(baseRows.filter((row) => row.erp).map((row) => [row.erp, { value: row.erp, label: `${row.itemName} - ${row.erp}`, searchText: `${row.itemName} ${row.erp}` }])).values()).sort((a, b) => a.label.localeCompare(b.label)), [baseRows]);

  const summary = useMemo(() => rows.reduce((acc, row) => ({ jobs: acc.jobs + 1, planned: acc.planned + row.planQty, fg: acc.fg + row.fg, loading: acc.loading + row.loading, balance: acc.balance + row.balance }), { jobs: 0, planned: 0, fg: 0, loading: 0, balance: 0 }), [rows]);
  // Column sort over every filtered row; with no sort the newest-first order stays.
  const sortFields: (keyof JobMovementRow)[] = ["planQty", "jobNo", "jobDate", "erp", "company", "itemName", "corrugation", "fg", "invoiced", "loading", "balance"];
  const { sorted: sortedRows, sort, toggle: toggleSort } = useTableSort(rows, (row, key) => row[key as keyof JobMovementRow]);
  const handleClear = () => { setSearchTerm(""); setDateFrom(""); setDateTo(""); setCompanyFilter(""); setItemFilter(""); };
  const columns = ["Plan Qty", "Job No.", "Job Date", "ERP", "Company", "Item Name", "Corrugation", "FG", "Invoiced", "Loading", "Balance"];
  const summaryCards = [
    { label: "Jobs", value: summary.jobs, card: "border-blue-300 bg-blue-50", labelText: "text-blue-700", valueText: "text-blue-900" },
    { label: "Plan Qty", value: summary.planned, card: "border-emerald-300 bg-emerald-50", labelText: "text-emerald-700", valueText: "text-emerald-900" },
    { label: "FG", value: summary.fg, card: "border-violet-300 bg-violet-50", labelText: "text-violet-700", valueText: "text-violet-900" },
    { label: "Loading", value: summary.loading, card: "border-amber-300 bg-amber-50", labelText: "text-amber-700", valueText: "text-amber-900" },
    { label: "Balance", value: summary.balance, card: "border-rose-300 bg-rose-50", labelText: "text-rose-700", valueText: "text-rose-900" },
  ];

  // Excel / PDF of the rows in view (filters, search and sort applied), with a TOTAL row.
  const allowExports = exportsAllowed();
  const exportData = () => {
    const body = sortedRows.map((row) => [row.planQty, displayJobNo(row.jobNo), formatDate(row.jobDate), row.erp, row.company, row.itemName, row.corrugation, row.fg, row.invoiced, row.loading, row.balance]);
    const sum = (index: number) => roundQuantity(body.reduce((total, row) => total + Number(row[index] || 0), 0));
    return { body, totals: [sum(0), "TOTAL", "", "", "", "", sum(6), sum(7), sum(8), sum(9), sum(10)] };
  };
  const exportName = () => `Jobs_in_Progress_${new Date().toISOString().slice(0, 10)}`;
  const handleExcel = async () => {
    const { body, totals } = exportData();
    if (!body.length) { alert("No jobs to download."); return; }
    const XLSX = await import("xlsx-js-style");
    const ws = XLSX.utils.aoa_to_sheet([["Jobs in Progress"], [`Date: ${formatDate(new Date().toISOString())}`], columns, ...body, totals]);
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: columns.length - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: columns.length - 1 } }];
    ws["!cols"] = columns.map((heading) => ({ wch: heading === "Item Name" ? 40 : heading === "Company" ? 30 : Math.max(10, heading.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Jobs in Progress");
    XLSX.writeFile(wb, `${exportName()}.xlsx`);
  };
  const handlePdf = () => {
    const { body, totals } = exportData();
    if (!body.length) { alert("No jobs to download."); return; }
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Jobs in Progress", pageWidth / 2, 12, { align: "center" });
    doc.setFontSize(9);
    doc.text(`Date: ${formatDate(new Date().toISOString())} - ${body.length} jobs`, pageWidth / 2, 18, { align: "center" });
    const cell = (value: unknown) => (typeof value === "number" ? value.toLocaleString("en-IN") : String(value ?? ""));
    autoTable(doc, {
      startY: 22,
      head: [columns],
      body: body.map((row) => row.map(cell)),
      foot: [totals.map(cell)],
      showFoot: "lastPage",
      styles: { fontSize: 7, cellPadding: 1.2, lineColor: [0, 0, 0], lineWidth: 0.1 },
      headStyles: { fillColor: [67, 56, 202], textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [226, 232, 240], textColor: 0, fontStyle: "bold" },
      columnStyles: Object.fromEntries([0, 6, 7, 8, 9, 10].map((index) => [index, { halign: "right" as const }])),
    });
    doc.save(`${exportName()}.pdf`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black pb-3"><h2 className="text-xl font-bold uppercase tracking-tight text-black">Jobs in Progress</h2>{allowExports ? <div className="flex items-center gap-2"><button type="button" onClick={() => void handleExcel()} disabled={!sortedRows.length} title="Download Excel" className="inline-flex items-center gap-2 rounded border border-emerald-700 px-3 py-1.5 text-sm font-bold uppercase tracking-tight text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"><Download size={16} /><span>Excel</span></button><button type="button" onClick={handlePdf} disabled={!sortedRows.length} title="Download PDF" className="inline-flex items-center gap-2 rounded border border-red-700 px-3 py-1.5 text-sm font-bold uppercase tracking-tight text-red-700 hover:bg-red-50 disabled:opacity-40"><FileText size={16} /><span>PDF</span></button></div> : null}</div>
      <div className="grid gap-3 md:grid-cols-5">{summaryCards.map((card) => <div key={card.label} className={`rounded border p-4 ${card.card}`}><div className={`text-xs font-black uppercase ${card.labelText}`}>{card.label}</div><div className={`mt-1 text-2xl font-black ${card.valueText}`}>{card.label === "Jobs" ? card.value : formatQty(card.value)}</div></div>)}</div>
      <ReportFilterBox search={searchTerm} onSearch={setSearchTerm} hasFilters={Boolean(searchTerm.trim() || dateFrom || dateTo || companyFilter || itemFilter)} onClear={handleClear}>
        <SelectFilter label="Company" value={companyFilter} onChange={setCompanyFilter} options={companyOptions} wide />
        <SelectFilter label="Item" value={itemFilter} onChange={setItemFilter} options={itemOptions} wide />
        <DateRangeFilter from={dateFrom} to={dateTo} onFrom={setDateFrom} onTo={setDateTo} fromLabel="Job Date From" toLabel="Job Date To" />
      </ReportFilterBox>
      <div className="overflow-hidden rounded border-2 border-black bg-white shadow-sm"><div data-disable-table-pagination="true" className="relative max-h-[calc(100vh-250px)] w-full overflow-auto"><table className="w-full min-w-[1500px] border-collapse text-[12px]"><thead className="sticky top-0 z-20 bg-indigo-700 text-white"><tr>{columns.map((heading, index) => <th key={heading} className="sticky top-0 z-20 whitespace-nowrap border-2 border-black bg-indigo-700 px-3 py-3 text-left text-xs font-black uppercase text-white"><SortHeader label={heading} sortKey={sortFields[index]} sort={sort} onToggle={toggleSort} align="left" /></th>)}</tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={columns.length} className="border-2 border-black px-6 py-10 text-center text-sm font-medium text-black">No active jobs match the current filters.</td></tr> : sortedRows.map((row) => <tr key={row.productionId} className="text-black hover:bg-slate-50"><td className="border-2 border-black px-3 py-3 text-right font-bold">{formatQty(row.planQty)}</td><td className="border-2 border-black px-3 py-3 font-bold" title={row.jobNo}>{displayJobNo(row.jobNo) || "-"}</td><td className="whitespace-nowrap border-2 border-black px-3 py-3">{formatDate(row.jobDate)}</td><td className="border-2 border-black px-3 py-3">{row.erp || "-"}</td><td className="min-w-[220px] max-w-[360px] whitespace-normal break-words border-2 border-black px-3 py-3">{row.company || "-"}</td><td className="min-w-[260px] max-w-[420px] whitespace-normal break-words border-2 border-black px-3 py-3">{row.itemName || "-"}</td><td className="border-2 border-black px-3 py-3 text-right">{formatQty(row.corrugation)}</td><td className="border-2 border-black px-3 py-3 text-right">{formatQty(row.fg)}</td><td className="border-2 border-black px-3 py-3 text-right">{formatQty(row.invoiced)}</td><td className="border-2 border-black px-3 py-3 text-right">{formatQty(row.loading)}</td><td className="border-2 border-black bg-rose-50 px-3 py-3 text-right font-bold text-rose-900">{formatQty(row.balance)}</td></tr>)}</tbody>{sortedRows.length ? (() => { const t = sortedRows.reduce((acc, row) => ({ plan: acc.plan + Number(row.planQty || 0), corr: acc.corr + Number(row.corrugation || 0), fg: acc.fg + Number(row.fg || 0), inv: acc.inv + Number(row.invoiced || 0), load: acc.load + Number(row.loading || 0), bal: acc.bal + Number(row.balance || 0) }), { plan: 0, corr: 0, fg: 0, inv: 0, load: 0, bal: 0 }); const cell = "sticky bottom-0 z-10 border-2 border-black bg-slate-200 px-3 py-3 font-black"; return <tfoot><tr className="text-black"><td className={`${cell} text-right`}>{formatQty(t.plan)}</td><td className={cell} colSpan={5}>TOTAL ({sortedRows.length} jobs)</td><td className={`${cell} text-right`}>{formatQty(t.corr)}</td><td className={`${cell} text-right`}>{formatQty(t.fg)}</td><td className={`${cell} text-right`}>{formatQty(t.inv)}</td><td className={`${cell} text-right`}>{formatQty(t.load)}</td><td className={`${cell} text-right text-rose-900`}>{formatQty(t.bal)}</td></tr></tfoot>; })() : null}</table></div></div>
    </div>
  );
}
