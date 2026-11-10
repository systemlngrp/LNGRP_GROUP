import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { useData } from "../hooks/useData";
import { ClientPagination } from "../components/ClientPagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { getOrderItemSourceLabel } from "../lib/orderItems";
import { resolvePhpPlateFgLink } from "../lib/phpPlateFgLink";
import { Firm, Order, OrderItemSource, OrderSchedule, Production } from "../types";
import { Select } from "../components/Select";
import { getFirmDisplayName, getFirmDisplayNameById } from "../lib/firmDisplay";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { resolvePhpPlateFirmId, workflowDate } from "../lib/phpPlateFirm";
import { SortHeader, useTableSort } from "../lib/tableSort";

const getJobMasterEntityName = (source: Extract<OrderItemSource, "PHP" | "PLATE">) =>
  source === "PHP" ? "php_job_master" : "plate_job_master";

type WorkflowSource = Extract<OrderItemSource, "PHP" | "PLATE"> | "ALL";
type JobRow = Production & { jobSource: Extract<OrderItemSource, "PHP" | "PLATE"> };
type Props = { source: WorkflowSource };

const SOURCE_OPTIONS = [
  { value: "PHP", label: "PHP" },
  { value: "PLATE", label: "Plate" },
];

function formatCell(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return "-";
  return String(value);
}

function formatNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString() : "0";
}

function getFgCellClasses(isBlocked: boolean, requiresFgGate: boolean) {
  if (requiresFgGate && isBlocked) return "bg-red-100 text-red-700 font-bold";
  if (requiresFgGate) return "bg-emerald-50 text-emerald-700 font-bold";
  return "bg-slate-50 text-black font-semibold";
}

export function StandaloneProductionExecution({ source }: Props) {
  const [phpJobs, setPhpJobs] = useData<Production>(getJobMasterEntityName("PHP"), [], { firmScope: "all", storageKey: "php-job-master-all-firms" });
  const [plateJobs, setPlateJobs] = useData<Production>(getJobMasterEntityName("PLATE"), [], { firmScope: "all", storageKey: "plate-job-master-all-firms" });
  const [fgProductions] = useData<Production>("productions", [], { firmScope: "all", storageKey: "productions-all-firms" });
  const [schedules] = useData<OrderSchedule>("orders_schedule", [], { firmScope: "all" });
  const [orders] = useData<Order>("orders", [], { firmScope: "all" });
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const { itemsBySource } = useOrderItemCatalog();
  const [searchTerm, setSearchTerm] = useState("");
  const [sourceFilter, setSourceFilter] = useState<WorkflowSource>(source === "ALL" ? "ALL" : source);
  const [firmFilter, setFirmFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [shiftFilter, setShiftFilter] = useState("");
  const [methodologyFilter, setMethodologyFilter] = useState("");
  const [selectedJobKey, setSelectedJobKey] = useState("");
  const [completionTime, setCompletionTime] = useState("");
  const [outputQty, setOutputQty] = useState("");

  const jobs = useMemo<JobRow[]>(() => {
    const sourceJobs = [
      ...phpJobs.map((job) => ({ ...job, jobSource: "PHP" as const })),
      ...plateJobs.map((job) => ({ ...job, jobSource: "PLATE" as const })),
    ].map((job) => {
      const linkField = job.jobSource === "PHP" ? "phpScheduledJobId" : "plateScheduledJobId";
      const linked = fgProductions.find((production) => String((production as any)[linkField] || "") === job.id);
      return linked && String(linked.methodology || "").trim().toUpperCase() === "SCRAP"
        ? { ...job, methodology: linked.methodology, scheduledDate: linked.scheduledDate || job.scheduledDate, plannedQty: linked.plannedQty || job.plannedQty, productionOutputQty: linked.prodFromFFG || linked.productionOutputQty || job.productionOutputQty }
        : job;
    });
    const sourceIds = new Set(sourceJobs.map((job) => `${job.jobSource}:${job.id}`));
    const scrapProductions = fgProductions
      .filter((production) => String(production.methodology || "").trim().toUpperCase() === "SCRAP")
      .flatMap((production) => {
        const phpId = String(production.phpScheduledJobId || "").trim();
        const plateId = String(production.plateScheduledJobId || "").trim();
        const jobSource = phpId ? "PHP" : plateId ? "PLATE" : "";
        const jobId = phpId || plateId;
        if (!jobSource || !jobId || sourceIds.has(`${jobSource}:${jobId}`)) return [];
        return [{
          ...production,
          id: jobId,
          transactionNo: production.transactionNo,
          jobSource: jobSource as "PHP" | "PLATE",
          scheduledDate: production.scheduledDate || production.date,
          shift: production.shift || "Day",
          sequence: production.sequence,
          productionOutputQty: production.prodFromFFG || production.productionOutputQty || 0,
        }];
      });
    const merged = [...sourceJobs, ...scrapProductions];
    return source === "ALL" ? merged : merged.filter((job) => job.jobSource === source);
  }, [fgProductions, phpJobs, plateJobs, source]);

  const activeSourceFilter = source === "ALL" ? sourceFilter : source;
  const getJobItemName = (job: JobRow) =>
    String((itemsBySource[job.jobSource] || []).find((entry) => entry.id === String(job.itemId || "").trim())?.name || job.itemId || "");
  const queueJobs = useMemo(() => jobs
    .filter((job) => job.status !== "Cancelled" && job.status !== "Completed")
    .filter((job) => String(job.scheduledDate || "").trim() && String(job.shift || "").trim() && String(job.sequence || "").trim())
    .filter((job) => !String(job.jobCompletionTimeOutput || "").trim() || !(Number(job.productionOutputQty || 0) > 0)), [jobs]);
  const firmOptions = useMemo(() => {
    const ids = new Set(queueJobs.map((job) => String(resolvePhpPlateFirmId(job, schedules, orders) || "")).filter(Boolean));
    return firms
      .filter((firm) => ids.has(String(firm.id)))
      .map((firm) => ({ value: String(firm.id), label: getFirmDisplayName(firm), searchText: `${getFirmDisplayName(firm)} ${String(firm.firmName || "")}`.trim() }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [firms, orders, queueJobs, schedules]);
  const toOptions = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const itemOptions = useMemo(() => toOptions(queueJobs.map((job) => getJobItemName(job))), [itemsBySource, queueJobs]);
  const shiftOptions = useMemo(() => toOptions(queueJobs.map((job) => String(job.shift || "").trim())), [queueJobs]);
  const methodologyOptions = useMemo(() => toOptions(queueJobs.map((job) => String(job.methodology || "").trim())), [queueJobs]);

  const unsequencedJobs = useMemo(() => jobs.filter((job) =>
    job.status !== "Cancelled" && job.status !== "Completed" &&
    (activeSourceFilter === "ALL" || job.jobSource === activeSourceFilter) &&
    (!firmFilter || resolvePhpPlateFirmId(job, schedules, orders) === firmFilter) &&
    (!fromDate || workflowDate(job) >= fromDate) && (!toDate || workflowDate(job) <= toDate) &&
    String(job.scheduledDate || "").trim() && String(job.shift || "").trim() &&
    !String(job.sequence || "").trim() &&
    (!String(job.jobCompletionTimeOutput || "").trim() || !(Number(job.productionOutputQty || 0) > 0)) &&
    (!searchTerm.trim() || [job.transactionNo, job.erpCode, job.methodology, job.jobSource].join(" ").toLowerCase().includes(searchTerm.trim().toLowerCase()))
  ), [activeSourceFilter, firmFilter, fromDate, jobs, orders, schedules, searchTerm, toDate]);

  const pendingJobs = useMemo(() => {
    const words = searchWords(searchTerm);
    return queueJobs
      .filter((job) => activeSourceFilter === "ALL" || job.jobSource === activeSourceFilter)
      .filter((job) => !firmFilter || resolvePhpPlateFirmId(job, schedules, orders) === firmFilter)
      .filter((job) => !itemFilter || getJobItemName(job) === itemFilter)
      .filter((job) => !shiftFilter || String(job.shift || "").trim() === shiftFilter)
      .filter((job) => !methodologyFilter || String(job.methodology || "").trim() === methodologyFilter)
      .filter((job) => { const date = workflowDate(job); return (!fromDate || date >= fromDate) && (!toDate || date <= toDate); })
      .filter((job) => {
        if (!words.length) return true;
        return matchesTableSearch([
          job.jobSource,
          getFirmDisplayNameById(resolvePhpPlateFirmId(job, schedules, orders), firms),
          job.transactionNo,
          job.sequence,
          job.shift,
          getJobItemName(job),
          job.scheduledDate,
          job.methodology,
          resolvePhpPlateFgLink(job, fgProductions, job.jobSource).fgValue,
        ], words);
      })
      .sort((a, b) => String(a.scheduledDate || "").localeCompare(String(b.scheduledDate || "")) || Number(a.sequence || 0) - Number(b.sequence || 0));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSourceFilter, fgProductions, firmFilter, firms, fromDate, itemFilter, itemsBySource, methodologyFilter, orders, queueJobs, schedules, searchTerm, shiftFilter, toDate]);

  const { sorted: sortedJobs, sort, toggle: toggleSort } = useTableSort(pendingJobs, (job: JobRow, key) => {
    if (key === "firm") return getFirmDisplayNameById(resolvePhpPlateFirmId(job, schedules, orders), firms);
    if (key === "item") return (itemsBySource[job.jobSource] || []).find((entry) => entry.id === String(job.itemId || "").trim())?.name || job.itemId;
    if (key === "fgValue") { const parsed = Number(resolvePhpPlateFgLink(job, fgProductions, job.jobSource).fgValue); return Number.isFinite(parsed) ? parsed : 0; }
    return (job as any)[key];
  }, [firms, schedules, orders, itemsBySource, fgProductions]);
  const { page, setPage, pageSize, setPageSize, totalItems, paginatedItems } = useClientPagination(sortedJobs, 25);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, sourceFilter, firmFilter, itemFilter, shiftFilter, methodologyFilter, fromDate, toDate, setPage]);
  const selectedJob = pendingJobs.find((job) => `${job.jobSource}:${job.id}` === selectedJobKey) || jobs.find((job) => `${job.jobSource}:${job.id}` === selectedJobKey);
  const selectedItem = selectedJob
    ? (itemsBySource[selectedJob.jobSource] || []).find((entry) => entry.id === String(selectedJob.itemId || "").trim())
    : undefined;
  const selectedJobFgState = useMemo(
    () => (selectedJob ? resolvePhpPlateFgLink(selectedJob, fgProductions, selectedJob.jobSource) : undefined),
    [fgProductions, selectedJob]
  );

  const closeModal = () => {
    setSelectedJobKey("");
    setCompletionTime("");
    setOutputQty("");
  };

  const openModal = (job: JobRow) => {
    setSelectedJobKey(`${job.jobSource}:${job.id}`);
    setCompletionTime(String(job.jobCompletionTimeOutput || ""));
    const fgState = resolvePhpPlateFgLink(job, fgProductions, job.jobSource);
    setOutputQty(fgState.requiresFgGate ? String(fgState.fgValue) : job.productionOutputQty === undefined || job.productionOutputQty === null ? "0" : String(job.productionOutputQty));
  };

  const saveProduction = async () => {
    if (!selectedJob) return;
    if (!completionTime.trim()) {
      window.alert("Job completion time is required.");
      return;
    }
    const nextOutput = selectedJobFgState?.requiresFgGate ? selectedJobFgState.fgValue : Number(outputQty || 0);
    if (!Number.isFinite(nextOutput) || nextOutput < 0) {
      window.alert("Output must be zero or more.");
      return;
    }
    if (selectedJobFgState?.requiresFgGate && selectedJobFgState.isBlocked) {
      window.alert("Report Printing output first. PHP/Plate production unlocks when Printing quantity is available.");
      return;
    }
    const timestamp = new Date().toISOString();
    const updateJobs = (prev: Production[]) =>
      prev.map((job) =>
        job.id === selectedJob.id
          ? { ...job, jobCompletionTimeOutput: completionTime,
              ...(!selectedJobFgState?.requiresFgGate ? { productionOutputQty: nextOutput } : {}),
              updatedBy: "System User", updateTimestamp: timestamp }
          : job
      );
    if (selectedJob.jobSource === "PHP") {
      await setPhpJobs(updateJobs);
    } else {
      await setPlateJobs(updateJobs);
    }
    window.alert("Production saved successfully.");
    closeModal();
  };

  const filtersActive = Boolean(searchTerm.trim() || firmFilter || itemFilter || shiftFilter || methodologyFilter || fromDate || toDate || (source === "ALL" && sourceFilter !== "ALL"));
  const clearFilters = () => {
    setSearchTerm(""); setSourceFilter("ALL"); setFirmFilter(""); setItemFilter(""); setShiftFilter(""); setMethodologyFilter(""); setFromDate(""); setToDate(""); closeModal();
  };

  const pageTitle = source === "ALL" ? "Pending Production - PHP / Plate" : `Pending Production - ${getOrderItemSourceLabel(source)}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-black uppercase tracking-tight">{pageTitle}</h2>
      </div>
      <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
          {source === "ALL" ? (
            <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Source</span><Select compact options={SOURCE_OPTIONS} value={sourceFilter === "ALL" ? "" : sourceFilter} onChange={(value) => { setSourceFilter((value || "ALL") as WorkflowSource); closeModal(); }} placeholder="All" /></div>
          ) : null}
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Firm</span><Select compact options={firmOptions} value={firmFilter} onChange={(value) => { setFirmFilter(value); closeModal(); }} placeholder="All" /></div>
          <div className="col-span-2 min-w-0 md:col-span-1"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Item</span><Select compact options={itemOptions} value={itemFilter} onChange={(value) => { setItemFilter(value); closeModal(); }} placeholder="All" /></div>
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Shift</span><Select compact options={shiftOptions} value={shiftFilter} onChange={(value) => { setShiftFilter(value); closeModal(); }} placeholder="All" /></div>
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Methodology</span><Select compact options={methodologyOptions} value={methodologyFilter} onChange={(value) => { setMethodologyFilter(value); closeModal(); }} placeholder="All" /></div>
          <div data-date-pair="true" className="col-span-2 grid min-w-0 grid-cols-2 gap-2">
            <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">From Date</span><input type="date" aria-label="From Date" value={fromDate} max={toDate || undefined} onChange={(e) => { setFromDate(e.target.value); closeModal(); }} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
            <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">To Date</span><input type="date" aria-label="To Date" value={toDate} min={fromDate || undefined} onChange={(e) => { setToDate(e.target.value); closeModal(); }} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
          </div>
        </div>
        <div data-mf-actions="true" className="flex justify-end gap-2">
          {filtersActive ? (
            <button type="button" onClick={clearFilters} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button>
          ) : null}
          <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
        </div>
      </div>
      {unsequencedJobs.length > 0 && <div className="rounded border border-amber-600 bg-amber-50 px-4 py-3 text-sm text-black" role="status">{unsequencedJobs.length} scheduled {unsequencedJobs.length === 1 ? "job is" : "jobs are"} waiting for a sequence and excluded from Pending Production. <Link to="/production/php-plate/sequencing" className="font-bold text-amber-800 underline">Set sequence</Link></div>}
      <div className="overflow-x-auto rounded border border-black bg-white">
        <table className="min-w-[1560px] w-full divide-y divide-black border-collapse">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-black uppercase"><SortHeader label="Source" sortKey="jobSource" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase"><SortHeader label="Firm" sortKey="firm" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase"><SortHeader label="Job No" sortKey="transactionNo" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase"><SortHeader label="Sequence" sortKey="sequence" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase"><SortHeader label="Shift" sortKey="shift" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase whitespace-normal break-words min-w-[200px] max-w-[300px]"><SortHeader label="Item" sortKey="item" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase"><SortHeader label="Scheduled Date" sortKey="scheduledDate" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase"><SortHeader label="Methodology" sortKey="methodology" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-3 py-2 text-right text-xs font-black uppercase"><SortHeader label="FG Value" sortKey="fgValue" sort={sort} onToggle={toggleSort} align="right" /></th>
              <th className="px-3 py-2 text-center text-xs font-black uppercase">Action</th>
            </tr>
          </thead>
          <tbody>
            {paginatedItems.length === 0 ? (
              <tr><td colSpan={10} className="h-16" aria-label="No records" /></tr>
            ) : paginatedItems.map((job) => {
              const item = (itemsBySource[job.jobSource] || []).find((entry) => entry.id === String(job.itemId || "").trim());
              const fgState = resolvePhpPlateFgLink(job, fgProductions, job.jobSource);
              return (
                <tr key={`${job.jobSource}:${job.id}`} className="border-t border-black">
                  <td className="px-3 py-2 text-sm font-bold">{job.jobSource}</td>
                  <td className="px-3 py-2 text-sm">{getFirmDisplayNameById(resolvePhpPlateFirmId(job, schedules, orders), firms)}</td>
                  <td className="px-3 py-2 text-sm font-semibold">{formatCell(job.transactionNo)}</td>
                  <td className="px-3 py-2 text-sm">{formatCell(job.sequence)}</td>
                  <td className="px-3 py-2 text-sm">{formatCell(job.shift)}</td>
                  <td className="px-3 py-2 text-sm whitespace-normal break-words min-w-[200px] max-w-[300px]">{formatCell(item?.name || job.itemId)}</td>
                  <td className="px-3 py-2 text-sm">{formatCell(job.scheduledDate)}</td>
                  <td className="px-3 py-2 text-sm">{formatCell(job.methodology)}</td>
                  <td className={`px-3 py-2 text-sm text-right ${getFgCellClasses(fgState.isBlocked, fgState.requiresFgGate)}`}>{formatNumber(fgState.fgValue)}</td>
                  <td className="px-3 py-2 text-center text-sm"><button type="button" onClick={() => openModal(job)} className="rounded border border-black px-2 py-1 font-bold uppercase hover:bg-slate-50">Production</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {selectedJob ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded border-2 border-black bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between border-b border-black pb-3">
              <h3 className="text-sm font-black uppercase tracking-wide text-black">Production</h3>
              <button type="button" onClick={closeModal} className="rounded border border-black px-3 py-1 text-xs font-bold uppercase text-black hover:bg-slate-50">Close</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-black uppercase text-slate-500">Source</div>
                <div className="mt-1 rounded border border-black bg-slate-100 px-3 py-2 text-sm font-bold text-black">{selectedJob.jobSource}</div>
              </div>
              <div>
                <div className="text-xs font-black uppercase text-slate-500">Job No</div>
                <div className="mt-1 rounded border border-black bg-slate-100 px-3 py-2 text-sm font-bold text-black">{selectedJob.transactionNo}</div>
              </div>
              <div className="md:col-span-2">
                <div className="text-xs font-black uppercase text-slate-500">Item</div>
                <div className="mt-1 rounded border border-black bg-slate-100 px-3 py-2 text-sm font-bold text-black">{selectedItem?.name || selectedJob.itemId}</div>
              </div>
              <div>
                <div className="text-xs font-black uppercase text-slate-500">Methodology</div>
                <div className="mt-1 rounded border border-black bg-slate-100 px-3 py-2 text-sm font-bold text-black">{formatCell(selectedJob.methodology)}</div>
              </div>
              <div>
                <div className="text-xs font-black uppercase text-slate-500">FG Value</div>
                <div className={`mt-1 rounded border border-black px-3 py-2 text-sm text-right ${getFgCellClasses(!!selectedJobFgState?.isBlocked, !!selectedJobFgState?.requiresFgGate)}`}>{formatNumber(selectedJobFgState?.fgValue ?? 0)}</div>
              </div>
              <div>
                <label className="text-xs font-black uppercase text-slate-500">Job Completion Time</label>
                <input type="time" value={completionTime} onChange={(e) => setCompletionTime(e.target.value)} className="mt-1 w-full border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600" />
              </div>
              <div>
                <label className="text-xs font-black uppercase text-slate-500">Output</label>
                <input type="number" min={0} step="any" value={selectedJobFgState?.requiresFgGate ? selectedJobFgState.fgValue : outputQty} disabled={!!selectedJobFgState?.requiresFgGate} onChange={(e) => setOutputQty(e.target.value)} className="mt-1 w-full border-2 border-black rounded p-2 text-black disabled:bg-slate-100 disabled:cursor-not-allowed focus:outline-none focus:border-indigo-600 focus:ring-1 focus:border-indigo-600" />
              </div>
            </div>
            {selectedJobFgState?.requiresFgGate && selectedJobFgState.isBlocked ? (
              <div className="mt-4 rounded border border-red-400 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                Printing output is still 0. Report Printing quantity to unlock PHP/Plate production.
              </div>
            ) : null}
            <div className="mt-5 flex gap-3">
              <button type="button" disabled={!!selectedJobFgState?.requiresFgGate && !!selectedJobFgState?.isBlocked} onClick={() => void saveProduction()} className="rounded border border-black bg-emerald-600 px-4 py-2 text-sm font-bold uppercase text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">Save</button>
              <button type="button" onClick={closeModal} className="rounded border border-black bg-white px-4 py-2 text-sm font-bold uppercase text-black hover:bg-slate-50">Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
      <ClientPagination page={page} pageSize={pageSize} totalItems={totalItems} onPageChange={setPage} onPageSizeChange={setPageSize} />
    </div>
  );
}
