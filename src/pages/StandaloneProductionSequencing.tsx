import React, { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useData } from "../hooks/useData";
import { ClientPagination } from "../components/ClientPagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { getOrderItemSourceLabel } from "../lib/orderItems";
import { Firm, Order, OrderItemSource, OrderSchedule, Production } from "../types";
import { getFirmDisplayName } from "../lib/firmDisplay";
import { resolvePhpPlateFirmId, workflowDate } from "../lib/phpPlateFirm";
import { Select } from "../components/Select";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
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

export function StandaloneProductionSequencing({ source }: Props) {
  const [phpJobs, setPhpJobs] = useData<Production>(getJobMasterEntityName("PHP"), [], { firmScope: "all", storageKey: "php-job-master-all-firms" });
  const [plateJobs, setPlateJobs] = useData<Production>(getJobMasterEntityName("PLATE"), [], { firmScope: "all", storageKey: "plate-job-master-all-firms" });
  const [schedules] = useData<OrderSchedule>("orders_schedule", [], { firmScope: "all" });
  const [orders] = useData<Order>("orders", [], { firmScope: "all" });
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const { itemsBySource } = useOrderItemCatalog();
  const [searchTerm, setSearchTerm] = useState("");
  const [sourceFilter, setSourceFilter] = useState<WorkflowSource>(source === "ALL" ? "ALL" : source);
  const [firmFilter, setFirmFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [shiftFilter, setShiftFilter] = useState("");
  const [methodologyFilter, setMethodologyFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedJobKey, setSelectedJobKey] = useState("");
  const [sequence, setSequence] = useState("");

  const jobs = useMemo<JobRow[]>(() => {
    const merged = [
      ...phpJobs.map((job) => ({ ...job, jobSource: "PHP" as const })),
      ...plateJobs.map((job) => ({ ...job, jobSource: "PLATE" as const })),
    ];
    return source === "ALL" ? merged : merged.filter((job) => job.jobSource === source);
  }, [phpJobs, plateJobs, source]);

  const activeSourceFilter = source === "ALL" ? sourceFilter : source;
  const getJobItemName = (job: JobRow) =>
    String((itemsBySource[job.jobSource] || []).find((entry) => entry.id === String(job.itemId || "").trim())?.name || job.itemId || "");

  const queueJobs = useMemo(() => jobs
    .filter((job) => job.status !== "Cancelled" && job.status !== "Completed")
    .filter((job) => String(job.scheduledDate || "").trim() && String(job.shift || "").trim() && String(job.methodology || "").trim())
    .filter((job) => !String(job.sequence || "").trim()), [jobs]);

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
        const item = (itemsBySource[job.jobSource] || []).find((entry) => entry.id === String(job.itemId || "").trim());
        if (!words.length) return true;
        return matchesTableSearch([job.jobSource, job.transactionNo, item?.name || job.itemId, job.scheduledDate, job.shift, job.methodology], words);
      })
      .sort((a, b) => String(a.scheduledDate || "").localeCompare(String(b.scheduledDate || "")) || String(a.transactionNo || "").localeCompare(String(b.transactionNo || "")));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSourceFilter, firmFilter, fromDate, itemFilter, itemsBySource, methodologyFilter, orders, queueJobs, schedules, searchTerm, shiftFilter, toDate]);

  const { sorted: sortedJobs, sort, toggle: toggleSort } = useTableSort(pendingJobs, (job: JobRow, key) => {
    if (key === "item") return (itemsBySource[job.jobSource] || []).find((entry) => entry.id === String(job.itemId || "").trim())?.name || job.itemId;
    return (job as any)[key];
  }, [itemsBySource]);
  const { page, setPage, pageSize, setPageSize, totalItems, paginatedItems } = useClientPagination(sortedJobs, 25);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, sourceFilter, firmFilter, itemFilter, shiftFilter, methodologyFilter, fromDate, toDate, setPage]);

  const filtersActive = Boolean(searchTerm.trim() || firmFilter || itemFilter || shiftFilter || methodologyFilter || fromDate || toDate || (source === "ALL" && sourceFilter !== "ALL"));
  const clearFilters = () => {
    setSearchTerm(""); setSourceFilter("ALL"); setFirmFilter(""); setItemFilter(""); setShiftFilter(""); setMethodologyFilter(""); setFromDate(""); setToDate("");
  };
  const selectedJob = pendingJobs.find((job) => `${job.jobSource}:${job.id}` === selectedJobKey) || jobs.find((job) => `${job.jobSource}:${job.id}` === selectedJobKey);

  const openModal = (job: JobRow) => {
    setSelectedJobKey(`${job.jobSource}:${job.id}`);
    setSequence(String(job.sequence || "0"));
  };

  const saveSequence = async () => {
    if (!selectedJob) return;
    const nextSequence = String(sequence || "").trim();
    if (!nextSequence) {
      window.alert("Sequence is required.");
      return;
    }
    const timestamp = new Date().toISOString();
    const updateJobs = (prev: Production[]) => prev.map((job) => job.id === selectedJob.id ? { ...job, sequence: nextSequence, updatedBy: "System User", updateTimestamp: timestamp } : job);
    if (selectedJob.jobSource === "PHP") {
      await setPhpJobs(updateJobs);
    } else {
      await setPlateJobs(updateJobs);
    }
    window.alert("Sequence saved successfully.");
    setSelectedJobKey("");
    setSequence("");
  };

  const pageTitle = source === "ALL" ? "Pending Sequencing - PHP / Plate" : `Pending Sequencing - ${getOrderItemSourceLabel(source)}`;

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
            <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Source</span><Select compact options={SOURCE_OPTIONS} value={sourceFilter === "ALL" ? "" : sourceFilter} onChange={(value) => setSourceFilter((value || "ALL") as WorkflowSource)} placeholder="All" /></div>
          ) : null}
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Firm</span><Select compact options={firmOptions} value={firmFilter} onChange={setFirmFilter} placeholder="All" /></div>
          <div className="col-span-2 min-w-0 md:col-span-1"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Item</span><Select compact options={itemOptions} value={itemFilter} onChange={setItemFilter} placeholder="All" /></div>
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Shift</span><Select compact options={shiftOptions} value={shiftFilter} onChange={setShiftFilter} placeholder="All" /></div>
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Methodology</span><Select compact options={methodologyOptions} value={methodologyFilter} onChange={setMethodologyFilter} placeholder="All" /></div>
          <div data-date-pair="true" className="col-span-2 grid min-w-0 grid-cols-2 gap-2">
            <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">From Date</span><input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
            <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">To Date</span><input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
          </div>
        </div>
        <div data-mf-actions="true" className="flex justify-end gap-2">
          {filtersActive ? (
            <button type="button" onClick={clearFilters} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button>
          ) : null}
          <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
        </div>
      </div>
      <div className="overflow-x-auto rounded border border-black bg-white">
        <table className="min-w-[1280px] w-full divide-y divide-black border-collapse">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-black uppercase"><SortHeader label="Source" sortKey="jobSource" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase"><SortHeader label="Job No" sortKey="transactionNo" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase whitespace-normal break-words min-w-[200px] max-w-[300px]"><SortHeader label="Item" sortKey="item" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase"><SortHeader label="Scheduled Date" sortKey="scheduledDate" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase"><SortHeader label="Shift" sortKey="shift" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase"><SortHeader label="Methodology" sortKey="methodology" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-3 py-2 text-center text-xs font-black uppercase">Action</th>
            </tr>
          </thead>
          <tbody>
            {paginatedItems.length === 0 ? (
              <tr><td colSpan={7} className="h-16" aria-label="No records" /></tr>
            ) : paginatedItems.map((job) => {
              const item = (itemsBySource[job.jobSource] || []).find((entry) => entry.id === String(job.itemId || "").trim());
              return (
                <tr key={`${job.jobSource}:${job.id}`} className="border-t border-black">
                  <td className="px-3 py-2 text-sm font-bold">{job.jobSource}</td>
                  <td className="px-3 py-2 text-sm font-semibold">{formatCell(job.transactionNo)}</td>
                  <td className="px-3 py-2 text-sm whitespace-normal break-words min-w-[200px] max-w-[300px]">{formatCell(item?.name || job.itemId)}</td>
                  <td className="px-3 py-2 text-sm">{formatCell(job.scheduledDate)}</td>
                  <td className="px-3 py-2 text-sm">{formatCell(job.shift)}</td>
                  <td className="px-3 py-2 text-sm">{formatCell(job.methodology)}</td>
                  <td className="px-3 py-2 text-center text-sm"><button type="button" onClick={() => openModal(job)} className="rounded border border-black px-2 py-1 font-bold uppercase hover:bg-slate-50">Set Sequence</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {selectedJob ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setSelectedJobKey(""); setSequence(""); }}>
          <div className="bg-white border border-black rounded shadow-sm p-4 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-black uppercase tracking-wide text-black mb-4">Sequence</h3>
            <div className="text-xs font-black uppercase text-slate-500">Source</div>
            <div className="mt-1 mb-4 rounded border border-black bg-slate-100 px-3 py-2 text-sm font-bold text-black">{selectedJob.jobSource}</div>
            <div className="text-xs font-black uppercase text-slate-500">Job No</div>
            <div className="mt-1 mb-4 rounded border border-black bg-slate-100 px-3 py-2 text-sm font-bold text-black">{selectedJob.transactionNo}</div>
            <div className="text-xs font-black uppercase text-slate-500">Sequence</div>
            <input type="number" min={0} step="1" value={sequence} onChange={(e) => setSequence(e.target.value)} className="mt-1 w-full border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600" />
            <div className="mt-4 flex gap-3">
              <button type="button" onClick={() => void saveSequence()} className="rounded border border-black bg-emerald-600 px-4 py-2 text-sm font-bold uppercase text-white hover:bg-emerald-700">Save</button>
              <button type="button" onClick={() => { setSelectedJobKey(""); setSequence(""); }} className="rounded border border-black bg-white px-4 py-2 text-sm font-bold uppercase text-black hover:bg-slate-50">Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
      <ClientPagination page={page} pageSize={pageSize} totalItems={totalItems} onPageChange={setPage} onPageSizeChange={setPageSize} />
    </div>
  );
}
