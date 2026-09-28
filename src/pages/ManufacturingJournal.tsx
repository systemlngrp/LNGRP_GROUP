import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download, RotateCcw } from "lucide-react";
import { useData } from "../hooks/useData";
import { Firm, MaterialIssueReelLine, MaterialReturnReelLine, Production, ProductionProcessing } from "../types";
import { normalizeMachineName } from "../lib/productionMachineNames";
import { getFirmDisplayNameById } from "../lib/firmDisplay";
import { formatDate } from "../lib/serial";
import { ClientPagination } from "../components/ClientPagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { areUnitOneReelsComplete } from "../lib/manufacturingJournalCompletion";

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

  const rows = useMemo<JournalRow[]>(() => processing
    .filter((entry) => {
      const stage = normalizeMachineName(entry.machineName);
      return stageNames.includes(stage as typeof stageNames[number]) && normalize(entry.completionStatus || "Full") === "full";
    })
    .map((entry) => {
      const stage = normalizeMachineName(entry.machineName) as "Corrugation Liner" | "Printing";
      const production = jobs.find((job) => job.id === entry.productionId);
      const firm = stage === "Corrugation Liner" ? unit1 : unit2;
      return { ...entry, machineName: stage, unit: stage === "Corrugation Liner" ? "Unit-1" : "Unit-2", firmId: String(firm?.id || ""), firmName: firm ? getFirmDisplayNameById(String(firm.id), firms) : stage === "Corrugation Liner" ? "Unit-1" : "Unit-2", itemName: entry.itemName || production?.remarks || "-", erp: String(entry.erp || production?.erpCode || "-") };
    })
    .filter((row) => {
      if (row.machineName === "Corrugation Liner" && !areUnitOneReelsComplete(row.productionId, row.jobNo, issueReels, returnReels, jobs)) return false;
      const query = normalize(search);
      const haystack = [row.jobNo, row.itemName, row.erp, row.machineName, row.unit, row.firmName, row.operatorName, row.tallyPostingStatus].map(normalize).join(" ");
      const tally = String(row.tallyPostingStatus || "Pending").trim() || "Pending";
      return (!query || haystack.includes(query)) && (!firmFilter || row.firmId === firmFilter) && (!stageFilter || row.machineName === stageFilter) && (!tallyFilter || tally === tallyFilter) && (!fromDate || row.date >= fromDate) && (!toDate || row.date <= toDate);
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date))), [firmFilter, firms, fromDate, issueReels, jobs, processing, returnReels, search, stageFilter, tallyFilter, toDate, unit1, unit2]);

  const { page, setPage, pageSize, setPageSize, totalItems, paginatedItems: pageRows } = useClientPagination(rows, 25);
  const clear = () => { setSearch(""); setFirmFilter(""); setStageFilter(""); setTallyFilter(""); setFromDate(""); setToDate(""); setPage(1); };
  const exportExcel = () => {
    const data = rows.map((row) => ({ Date: row.date, "Job No": row.jobNo, Unit: row.unit, Firm: row.firmName, "Item Name": row.itemName, ERP: row.erp, Stage: row.machineName, Shift: row.shift || "Day", Quantity: row.qty, Operator: row.operatorName, Completion: row.completionStatus || "Full", "Tally Posting": row.tallyPostingStatus || "Pending" }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data), "Manufacturing Journal");
    XLSX.writeFile(workbook, "Manufacturing_Journal.xlsx");
  };

  return <div className="space-y-5">
    <div className="flex items-center justify-between border-b border-black pb-4"><h2 className="text-xl font-black uppercase">Manufacturing Journal</h2><button onClick={exportExcel} className="inline-flex items-center gap-2 rounded border-2 border-black bg-emerald-50 px-3 py-2 text-xs font-bold"><Download size={14} /> Excel</button></div>
    <div className="grid grid-cols-1 gap-3 rounded border-2 border-black bg-white p-3 md:grid-cols-2 xl:grid-cols-6">
      <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search job, item, ERP, operator..." className="rounded border-2 border-black px-3 py-2 text-sm" />
      <select value={firmFilter} onChange={(e) => setFirmFilter(e.target.value)} className="rounded border-2 border-black px-3 py-2 text-sm"><option value="">All Units</option>{firms.map((firm) => <option key={firm.id} value={firm.id}>{firm.firmName}</option>)}</select>
      <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="rounded border-2 border-black px-3 py-2 text-sm"><option value="">All Stages</option>{stageNames.map((stage) => <option key={stage}>{stage}</option>)}</select>
      <select value={tallyFilter} onChange={(e) => setTallyFilter(e.target.value)} className="rounded border-2 border-black px-3 py-2 text-sm"><option value="">All Tally Status</option><option>Pending</option><option>Posted</option><option>Completed</option><option>Not Applicable</option></select>
      <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded border-2 border-black px-3 py-2 text-sm" /><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded border-2 border-black px-3 py-2 text-sm" />
      <button onClick={clear} className="inline-flex items-center justify-center gap-2 rounded border-2 border-black bg-white px-3 py-2 text-xs font-bold"><RotateCcw size={14} /> Clear</button>
    </div>
    <div className="overflow-auto rounded border-2 border-black bg-white"><table className="min-w-[1250px] w-full border-collapse"><thead><tr className="bg-indigo-700 text-left text-xs font-black uppercase text-white">{["Date", "Job No", "Unit / Firm", "Item Name", "ERP", "Stage", "Shift", "Quantity", "Operator", "Completion", "Tally Posting"].map((heading) => <th key={heading} className="border border-black px-3 py-3 whitespace-nowrap">{heading}</th>)}</tr></thead><tbody>{pageRows.length === 0 ? <tr><td colSpan={11} className="p-8 text-center italic">No entries found. Unit-1 Corrugation rows require Full completion and all issued reels returned.</td></tr> : pageRows.map((row) => <tr key={row.id} className="divide-x divide-black"><td className="border border-black px-3 py-3 text-sm whitespace-nowrap">{formatDate(row.date)}</td><td className="border border-black px-3 py-3 text-sm font-bold whitespace-nowrap">{row.jobNo}</td><td className="border border-black px-3 py-3 text-sm font-bold">{row.unit} - {row.firmName}</td><td className="border border-black px-3 py-3 text-sm">{row.itemName}</td><td className="border border-black px-3 py-3 text-sm">{row.erp}</td><td className="border border-black px-3 py-3 text-sm">{row.machineName}</td><td className="border border-black px-3 py-3 text-sm">{row.shift || "Day"}</td><td className="border border-black px-3 py-3 text-right text-sm font-bold">{Number(row.qty || 0).toLocaleString()}</td><td className="border border-black px-3 py-3 text-sm">{row.operatorName || "-"}</td><td className="border border-black px-3 py-3 text-sm">{row.completionStatus || "Full"}</td><td className="border border-black px-3 py-3 text-sm font-bold">{row.tallyPostingStatus || "Pending"}</td></tr>)}</tbody></table></div>
    <ClientPagination page={page} pageSize={pageSize} totalItems={totalItems} onPageChange={setPage} onPageSizeChange={setPageSize} />
  </div>;
}
