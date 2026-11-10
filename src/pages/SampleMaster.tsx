import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
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

  const filteredRows = useMemo(() => {
    // Search: only the table columns (Date, Item Name, ERP, Planned Qty, Job Card No., Status, Cancel Details).
    const words = searchWords(searchTerm);
    const rows = words.length
      ? sampleRequests.filter((row) =>
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
      : sampleRequests;

    return sortSampleRequestsDesc(rows);
  }, [sampleRequests, searchTerm]);
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-black pb-4">
        <h2 className="text-xl font-bold text-black uppercase tracking-tight">Sample Master</h2>
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-black rounded focus:outline-none focus:ring-1 focus:ring-black text-sm"
          />
        </div>
      </div>

      <div className="bg-white rounded shadow-sm overflow-hidden border border-black">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-black border-collapse border border-black">
            <thead className="sticky top-0 z-30 bg-slate-100 divide-x divide-black">
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
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-black font-medium italic">
                    No sample requests found.
                  </td>
                </tr>
              ) : (
                sortedRows.map((row) => {
                  const status = getSampleRequestStatus(row);
                  return (
                    <tr key={row.id} className="hover:bg-slate-50 divide-x divide-black transition-colors">
                      <td className="px-4 py-3 text-sm text-black border border-black whitespace-nowrap">{formatDate(row.date)}</td>
                      <td className="px-4 py-3 text-sm text-black border border-black">{row.itemName}</td>
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
    </div>
  );
}
