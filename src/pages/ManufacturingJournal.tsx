import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download, RotateCcw, Search } from "lucide-react";
import { useData } from "../hooks/useData";
import { Firm, MaterialIssueReelLine, MaterialReturnReelLine, Production, ProductionProcessing } from "../types";
import { normalizeMachineName } from "../lib/productionMachineNames";
import { getFirmDisplayName, getFirmDisplayNameById } from "../lib/firmDisplay";
import { formatDate } from "../lib/serial";
import { ClientPagination } from "../components/ClientPagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { buildUnitOneReelsChecker } from "../lib/manufacturingJournalCompletion";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";

type JournalRow = ProductionProcessing & { unit: "Unit-1" | "Unit-2"; firmId: string; firmName: string; itemName: string; erp: string };

const stageNames = ["Corrugation Liner", "Printing"] as const;
const normalize = (value: unknown) => String(value || "").trim().toLowerCase();

export function ManufacturingJournal() {
  const [processing] = useData<ProductionProcessing>("production_processing", [], { firmScope: "all", storageKey: "manufacturing-journal-processing" });
  const [productions] = useData<Production>("productions", [], { firmScope: "all", storageKey: "manufacturing-journal-productions" });
  const [phpJobs] = useData<Production>("php_job_master", [], { firmScope: "all", storageKey: "manufacturing-journal-php" });
  const [plateJobs] = useData<Production>("plate_job_master", [], { firmScope: "all", storageKey: "manufacturing-journal-plate" });
  const [issueReels] = useData<MaterialIssueReelLine>("material-issue-reel-lines", [], { firmScope: "all" });
  const [returnReels] = useData<MaterialReturnReelLine>("material-return-reel-lines", [], { firmScope: "all" });
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const [search, setSearch] = useState("");
  const [firmFilter, setFirmFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [tallyFilter, setTallyFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const unit1 = useMemo(() => firms.find((firm) => /unit[-\s]?i(?!i)/i.test(firm.firmName)), [firms]);
  const unit2 = useMemo(() => firms.find((firm) => /unit[-\s]?ii/i.test(firm.firmName)), [firms]);
  const jobs = useMemo(() => [...productions, ...phpJobs, ...plateJobs], [plateJobs, phpJobs, productions]);

  // Reel completion checked with lists indexed once (same answers as checking
  // every reel line for every entry, which took over a minute).
  const unitOneReelsComplete = useMemo(() => buildUnitOneReelsChecker(issueReels, returnReels, jobs), [issueReels, returnReels, jobs]);
  const jobById = useMemo(() => { const map = new Map<string, Production>(); jobs.forEach((job) => { if (!map.has(job.id)) map.set(job.id, job); }); return map; }, [jobs]);

  const words = useMemo(() => searchWords(search), [search]);
  const rows = useMemo<JournalRow[]>(() => processing
    .filter((entry) => {
      const stage = normalizeMachineName(entry.machineName);
      return stageNames.includes(stage as typeof stageNames[number]) && normalize(entry.completionStatus || "Full") === "full";
    })
    .map((entry) => {
      const stage = normalizeMachineName(entry.machineName) as "Corrugation Liner" | "Printing";
      const production = jobById.get(entry.productionId);
      const firm = stage === "Corrugation Liner" ? unit1 : unit2;
      return { ...entry, machineName: stage, unit: stage === "Corrugation Liner" ? "Unit-1" : "Unit-2", firmId: String(firm?.id || ""), firmName: firm ? getFirmDisplayNameById(String(firm.id), firms) : stage === "Corrugation Liner" ? "Unit-1" : "Unit-2", itemName: entry.itemName || production?.remarks || "-", erp: String(entry.erp || production?.erpCode || "-") };
    })
    .filter((row) => {
      if (row.machineName === "Corrugation Liner" && !unitOneReelsComplete(row.productionId, row.jobNo)) return false;
      const tally = String(row.tallyPostingStatus || "Pending").trim() || "Pending";
      return matchesTableSearch([row.date, row.jobNo, `${row.unit} - ${row.firmName}`, row.itemName, row.erp, row.machineName, row.shift || "Day", Number(row.qty || 0), row.operatorName, row.completionStatus || "Full", row.tallyPostingStatus || "Pending"], words) && (!firmFilter || row.firmId === firmFilter) && (!stageFilter || row.machineName === stageFilter) && (!tallyFilter || tally === tallyFilter) && (!fromDate || row.date >= fromDate) && (!toDate || row.date <= toDate);
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date))), [firmFilter, firms, fromDate, jobById, processing, stageFilter, tallyFilter, toDate, unit1, unit2, unitOneReelsComplete, words]);

  const { sorted: sortedRows, sort, toggle: toggleSort } = useTableSort(rows, (row, key) => {
    if (key === "unitFirm") return `${row.unit} - ${row.firmName}`;
    if (key === "shift") return row.shift || "Day";
    if (key === "qty") return Number(row.qty || 0);
    if (key === "operatorName") return row.operatorName || "-";
    if (key === "completionStatus") return row.completionStatus || "Full";
    if (key === "tallyPostingStatus") return row.tallyPostingStatus || "Pending";
    return (row as any)[key];
  });
  const { page, setPage, pageSize, setPageSize, totalItems, paginatedItems: pageRows } = useClientPagination(sortedRows, 25);
  const clear = () => { setSearch(""); setFirmFilter(""); setStageFilter(""); setTallyFilter(""); setFromDate(""); setToDate(""); setPage(1); };
  const exportExcel = () => {
    const data = rows.map((row) => ({ Date: row.date, "Job No": row.jobNo, Unit: row.unit, Firm: row.firmName, "Item Name": row.itemName, ERP: row.erp, Stage: row.machineName, Shift: row.shift || "Day", Quantity: row.qty, Operator: row.operatorName, Completion: row.completionStatus || "Full", "Tally Posting": row.tallyPostingStatus || "Pending" }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data), "Manufacturing Journal");
    XLSX.writeFile(workbook, "Manufacturing_Journal.xlsx");
  };

  return <div className="space-y-5">
    <div className="flex items-center justify-between gap-3 border-b border-black pb-3">
      <h2 className="text-xl font-bold uppercase tracking-tight text-black">Manufacturing Journal</h2>
      <button type="button" onClick={exportExcel} title="Download Excel" className="rounded border border-emerald-700 px-3 py-1.5 text-sm font-bold text-emerald-700">Excel</button>
    </div>
    <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
          />
        </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
        <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Unit / Firm</span><select value={firmFilter} onChange={(e) => { setFirmFilter(e.target.value); setPage(1); }} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold"><option value="">All</option>{firms.map((firm) => <option key={firm.id} value={firm.id}>{getFirmDisplayName(firm)}</option>)}</select></label>
        <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Stage</span><select value={stageFilter} onChange={(e) => { setStageFilter(e.target.value); setPage(1); }} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold"><option value="">All</option>{stageNames.map((stage) => <option key={stage}>{stage}</option>)}</select></label>
        <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Tally Status</span><select value={tallyFilter} onChange={(e) => { setTallyFilter(e.target.value); setPage(1); }} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold"><option value="">All</option><option>Pending</option><option>Posted</option><option>Completed</option><option>Not Applicable</option></select></label>
        <div data-date-pair="true" className="col-span-2 grid min-w-0 grid-cols-2 gap-2">
          <label className="block min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">From Date</span><input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} className="h-[34px] w-full rounded border-2 border-black px-2 text-xs font-semibold" /></label>
          <label className="block min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">To Date</span><input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => { setToDate(e.target.value); setPage(1); }} className="h-[34px] w-full rounded border-2 border-black px-2 text-xs font-semibold" /></label>
        </div>
      </div>
        <div data-mf-actions="true" className="flex justify-end gap-2">
          {search.trim() || firmFilter || stageFilter || tallyFilter || fromDate || toDate ? (
            <button type="button" onClick={clear} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button>
          ) : null}
          <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
        </div>
    </div>
    <div className="overflow-x-auto rounded border border-black bg-white"><table className="min-w-full border-collapse"><thead><tr className="bg-slate-100 text-xs font-black uppercase text-black">{[["Date", "date"], ["Job No", "jobNo"], ["Unit / Firm", "unitFirm"], ["Item Name", "itemName"], ["ERP", "erp"], ["Stage", "machineName"], ["Shift", "shift"], ["Quantity", "qty"], ["Operator", "operatorName"], ["Completion", "completionStatus"], ["Tally Posting", "tallyPostingStatus"]].map(([heading, key]) => <th key={heading} className="border border-black px-2 py-2"><SortHeader label={heading} sortKey={key} sort={sort} onToggle={toggleSort} align="center" /></th>)}</tr></thead><tbody>{pageRows.length === 0 ? <tr><td colSpan={11} className="h-16" aria-label="No records" /></tr> : pageRows.map((row) => <tr key={row.id} className="divide-x divide-black"><td className="border border-black px-2 py-2 text-sm whitespace-nowrap">{formatDate(row.date)}</td><td className="border border-black px-2 py-2 text-sm font-bold whitespace-nowrap">{row.jobNo}</td><td className="border border-black px-2 py-2 text-sm font-bold">{row.unit} - {row.firmName}</td><td className="border border-black px-2 py-2 text-sm">{row.itemName}</td><td className="border border-black px-2 py-2 text-sm">{row.erp}</td><td className="border border-black px-2 py-2 text-sm">{row.machineName}</td><td className="border border-black px-2 py-2 text-sm">{row.shift || "Day"}</td><td className="border border-black px-3 py-3 text-right text-sm font-bold">{Number(row.qty || 0).toLocaleString()}</td><td className="border border-black px-2 py-2 text-sm">{row.operatorName || "-"}</td><td className="border border-black px-2 py-2 text-sm">{row.completionStatus || "Full"}</td><td className="border border-black px-2 py-2 text-sm font-bold">{row.tallyPostingStatus || "Pending"}</td></tr>)}</tbody></table></div>
    <ClientPagination page={page} pageSize={pageSize} totalItems={totalItems} onPageChange={setPage} onPageSizeChange={setPageSize} />
  </div>;
}
