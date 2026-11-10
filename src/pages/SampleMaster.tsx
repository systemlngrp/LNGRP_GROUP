import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Select } from "../components/Select";
import { useData } from "../hooks/useData";
import { SampleRequest } from "../types";
import { formatDate } from "../lib/serial";
import { getSampleRequestStatus, sortSampleRequestsDesc } from "../lib/sampleRequests";
import { SortHeader, useTableSort } from "../lib/tableSort";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";

function getStatusClasses(status: string) {
  if (status === "Cancelled") return "bg-red-100 text-red-900 border-red-900";
  if (status === "Produced") return "bg-emerald-100 text-emerald-900 border-emerald-900";
  return "bg-amber-100 text-amber-900 border-amber-900";
}

export function SampleMaster() {
  const [sampleRequests] = useData<SampleRequest>("sample_requests", []);
  const [searchTerm, setSearchTerm] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [erpFilter, setErpFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const baseRows = useMemo(() => sampleRequests, [sampleRequests]);
  const itemFilterOptions = useMemo(() => {
    const values = new Set(baseRows.map((row) => String(row.itemName || "").trim()).filter(Boolean));
    return Array.from(values).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((value) => ({ value, label: value }));
  }, [baseRows]);
  const erpFilterOptions = useMemo(() => {
    const values = new Set(baseRows.map((row) => String(row.erp ?? "").trim()).filter(Boolean));
    return Array.from(values).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((value) => ({ value, label: value }));
  }, [baseRows]);
  const statusFilterOptions = ["Pending", "Produced", "Cancelled"].map((value) => ({ value, label: value }));
  const filtersActive = Boolean(searchTerm.trim() || itemFilter || erpFilter || statusFilter || dateFrom || dateTo);
  const clearFilters = () => {
    setSearchTerm(""); setItemFilter(""); setErpFilter(""); setStatusFilter(""); setDateFrom(""); setDateTo("");
  };

  const filteredRows = useMemo(() => {
    // Search: only the table columns (Date, Item Name, ERP, Planned Qty, Job Card No., Status, Cancel Details).
    const words = searchWords(searchTerm);
    const filtered = baseRows.filter((row) => {
      if (itemFilter && String(row.itemName || "").trim() !== itemFilter) return false;
      if (erpFilter && String(row.erp ?? "").trim() !== erpFilter) return false;
      if (statusFilter && getSampleRequestStatus(row) !== statusFilter) return false;
      const day = String(row.date || "").slice(0, 10);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      return true;
    });
    const rows = words.length
      ? filtered.filter((row) =>
          matchesTableSearch([
            formatDate(row.date),
            row.itemName,
            row.erp || "-",
            Number(row.plannedQuantity || 0).toLocaleString(),
            row.jobCardNo || "-",
            getSampleRequestStatus(row),
            row.cancelTimestamp ? `${formatDate(row.cancelTimestamp)} by ${row.cancelBy || "-"}` : "-",
          ], words)
        )
      : filtered;

    return sortSampleRequestsDesc(rows);
  }, [baseRows, searchTerm, itemFilter, erpFilter, statusFilter, dateFrom, dateTo]);
  const { sorted: sortedRows, sort, toggle: toggleSort } = useTableSort(filteredRows, (row: SampleRequest, key) => {
    if (key === "date") return row.date;
    if (key === "plannedQuantity") return Number(row.plannedQuantity || 0);
    if (key === "erp") return row.erp || "-";
    if (key === "jobCardNo") return row.jobCardNo || "-";
    if (key === "status") return getSampleRequestStatus(row);
    if (key === "cancel") return row.cancelTimestamp ? `${formatDate(row.cancelTimestamp)} by ${row.cancelBy || "-"}` : "-";
    return (row as any)[key];
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">Sample Master</h2>
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
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Item</span><Select compact value={itemFilter} onChange={setItemFilter} options={itemFilterOptions} placeholder="All" /></div>
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">ERP</span><Select compact value={erpFilter} onChange={setErpFilter} options={erpFilterOptions} placeholder="All" /></div>
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Status</span><Select compact value={statusFilter} onChange={setStatusFilter} options={statusFilterOptions} placeholder="All" /></div>
          <div data-date-pair="true" className="col-span-2 grid min-w-0 grid-cols-2 gap-2 sm:min-w-[260px]">
            <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Request From Date</span><input type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
            <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Request To Date</span><input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
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
          <table className="min-w-full divide-y divide-black border-collapse border border-black">
            <thead className="bg-slate-100 divide-x divide-black">
              <tr className="divide-x divide-black">
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Date" sortKey="date" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Item Name" sortKey="itemName" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="ERP" sortKey="erp" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Planned Qty" sortKey="plannedQuantity" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Job Card No." sortKey="jobCardNo" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Status" sortKey="status" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Cancel Details" sortKey="cancel" sort={sort} onToggle={toggleSort} align="left" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black bg-white">
              {filteredRows.length === 0 ? (
                <tr><td colSpan={7} className="h-16" aria-label="No records" /></tr>
              ) : (
                sortedRows.map((row) => {
                  const status = getSampleRequestStatus(row);
                  return (
                    <tr key={row.id} className="hover:bg-slate-50 divide-x divide-black transition-colors">
                      <td className="px-4 py-3 text-sm text-black border border-black whitespace-nowrap">{formatDate(row.date)}</td>
                      <td className="px-4 py-3 text-sm text-black border border-black whitespace-normal break-words min-w-[200px] max-w-[300px]">{row.itemName}</td>
                      <td className="px-4 py-3 text-sm text-black border border-black whitespace-nowrap">{row.erp || "-"}</td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-black border border-black whitespace-nowrap">{Number(row.plannedQuantity || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-black border border-black whitespace-nowrap">{row.jobCardNo || "-"}</td>
                      <td className="px-4 py-3 text-sm border border-black whitespace-nowrap">
                        <span className={`px-2 py-1 rounded text-[11px] font-bold border uppercase tracking-wider ${getStatusClasses(status)}`}>
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-black border border-black">
                        {row.cancelTimestamp ? `${formatDate(row.cancelTimestamp)} by ${row.cancelBy || "-"}` : "-"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
      </div>
    </div>
  );
}
