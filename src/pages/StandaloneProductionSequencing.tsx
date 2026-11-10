import React, { useMemo, useState } from "react";
import { useData } from "../hooks/useData";
import { ClientPagination } from "../components/ClientPagination";
import { TableControls } from "../components/TableControls";
import { useClientPagination } from "../hooks/useClientPagination";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { getOrderItemSourceLabel } from "../lib/orderItems";
import { OrderItemSource, Production } from "../types";
import { Select } from "../components/Select";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";

const getJobMasterEntityName = (source: Extract<OrderItemSource, "PHP" | "PLATE">) =>
  source === "PHP" ? "php_job_master" : "plate_job_master";

type WorkflowSource = Extract<OrderItemSource, "PHP" | "PLATE"> | "ALL";
type JobRow = Production & { jobSource: Extract<OrderItemSource, "PHP" | "PLATE"> };
type Props = { source: WorkflowSource };

const SOURCE_OPTIONS = [
  { value: "ALL", label: "All" },
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
  const { itemsBySource } = useOrderItemCatalog();
  const [searchTerm, setSearchTerm] = useState("");
  const [sourceFilter, setSourceFilter] = useState<WorkflowSource>(source === "ALL" ? "ALL" : source);
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

  const pendingJobs = useMemo(() => {
    const words = searchWords(searchTerm);
    return jobs
      .filter((job) => job.status !== "Cancelled" && job.status !== "Completed")
      .filter((job) => activeSourceFilter === "ALL" || job.jobSource === activeSourceFilter)
      .filter((job) => String(job.scheduledDate || "").trim() && String(job.shift || "").trim() && String(job.methodology || "").trim())
      .filter((job) => !String(job.sequence || "").trim())
      .filter((job) => {
        const item = (itemsBySource[job.jobSource] || []).find((entry) => entry.id === String(job.itemId || "").trim());
        if (!words.length) return true;
        return matchesTableSearch([job.jobSource, job.transactionNo, item?.name || job.itemId, job.scheduledDate, job.shift, job.methodology], words);
      })
      .sort((a, b) => String(a.scheduledDate || "").localeCompare(String(b.scheduledDate || "")) || String(a.transactionNo || "").localeCompare(String(b.transactionNo || "")));
  }, [activeSourceFilter, itemsBySource, jobs, searchTerm]);

  const { sorted: sortedJobs, sort, toggle: toggleSort } = useTableSort(pendingJobs, (job: JobRow, key) => {
    if (key === "item") return (itemsBySource[job.jobSource] || []).find((entry) => entry.id === String(job.itemId || "").trim())?.name || job.itemId;
    return (job as any)[key];
  }, [itemsBySource]);
  const { page, setPage, pageSize, setPageSize, totalItems, paginatedItems } = useClientPagination(sortedJobs, 25);
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
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-black pb-4">
        <h2 className="text-xl font-bold text-black uppercase tracking-tight">{pageTitle}</h2>
        {source === "ALL" ? (
          <div className="w-full md:w-52">
            <Select options={SOURCE_OPTIONS} value={sourceFilter} onChange={(value) => setSourceFilter(value as WorkflowSource)} placeholder="Select source..." />
          </div>
        ) : null}
      </div>
      <TableControls searchTerm={searchTerm} onSearchChange={setSearchTerm} placeholder="Search" />
      <div className="bg-white border border-black rounded shadow-sm overflow-auto">
        <table className="min-w-[1280px] w-full divide-y divide-black border-collapse">
          <thead className="sticky top-0 z-30 bg-slate-100">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-black uppercase"><SortHeader label="Source" sortKey="jobSource" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase"><SortHeader label="Job No" sortKey="transactionNo" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase"><SortHeader label="Item" sortKey="item" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase"><SortHeader label="Scheduled Date" sortKey="scheduledDate" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase"><SortHeader label="Shift" sortKey="shift" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase"><SortHeader label="Methodology" sortKey="methodology" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-3 py-2 text-center text-xs font-black uppercase">Action</th>
            </tr>
          </thead>
          <tbody>
            {paginatedItems.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-black font-medium">No jobs pending sequencing.</td></tr>
            ) : paginatedItems.map((job) => {
              const item = (itemsBySource[job.jobSource] || []).find((entry) => entry.id === String(job.itemId || "").trim());
              return (
                <tr key={`${job.jobSource}:${job.id}`} className="border-t border-black">
                  <td className="px-3 py-2 text-sm font-bold">{job.jobSource}</td>
                  <td className="px-3 py-2 text-sm font-semibold">{formatCell(job.transactionNo)}</td>
                  <td className="px-3 py-2 text-sm">{formatCell(item?.name || job.itemId)}</td>
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
