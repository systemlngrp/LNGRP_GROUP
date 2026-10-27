import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useData } from "../hooks/useData";
import { useDailyConsumptions } from "../hooks/useDailyConsumptions";
import { ClientPagination } from "../components/ClientPagination";
import { formatDate } from "../lib/serial";
import { Firm } from "../types";

export function DailyConsumptionMaster() {
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });

  const [date, setDate] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [firmFilter, setFirmFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const { rows, total, loading, error, linesById, lineLoadingId, loadLines } = useDailyConsumptions({ page, pageSize, date, firmId: firmFilter, search: searchTerm });

  const selectedIssue = useMemo(
    () => rows.find((issue) => issue.id === selectedIssueId) || null,
    [rows, selectedIssueId]
  );

  const selectedLines = useMemo(() => {
    if (!selectedIssue) return [];
    return linesById[selectedIssue.id] || [];
  }, [linesById, selectedIssue]);

  const selectIssue = (id: string) => {
    setSelectedIssueId((prev) => (prev === id ? null : id));
    if (id && !linesById[id]) void loadLines(id);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-black pb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-black uppercase tracking-tight">Daily Consumption Master</h2>
          <div className="text-sm font-bold text-slate-600">
            {date ? formatDate(date) : "All dates"}: {total} issue(s)
          </div>
        </div>
        <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
          <div className="w-full md:w-44">
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setPage(1);
                setSelectedIssueId(null);
              }}
              className="w-full px-3 py-2 border border-black rounded focus:outline-none focus:ring-1 focus:ring-black text-sm"
            />
          </div>
          <select value={firmFilter} onChange={(e) => { setFirmFilter(e.target.value); setPage(1); setSelectedIssueId(null); }} className="w-full md:w-52 px-3 py-2 border border-black rounded text-sm font-bold bg-white">
            <option value="">All firms</option>
            {firms.map((firm) => <option key={firm.id} value={firm.id}>{firm.firmName}</option>)}
          </select>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search issue no / remarks..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); setSelectedIssueId(null); }}
              className="w-full pl-10 pr-4 py-2 border border-black rounded focus:outline-none focus:ring-1 focus:ring-black text-sm"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded shadow-sm overflow-hidden border border-black">
        <div className="block md:hidden space-y-3 p-3">
          {loading && rows.length === 0 ? (
            <div className="p-4 text-center text-sm">Loading Daily Consumption…</div>
          ) : error ? (
            <div className="p-4 text-center text-sm text-red-700">Unable to load Daily Consumption: {error}</div>
          ) : rows.length === 0 ? (
            <div className="p-4 bg-slate-50 border border-dashed border-black text-center text-sm">No Daily Consumption records found.</div>
          ) : (
            rows.map((issue) => {
              const count = Number(issue.itemCount || 0);
              const isSelected = issue.id === selectedIssueId;
              return (
                <button
                  key={issue.id}
                  type="button"
                  onClick={() => selectIssue(issue.id)}
                  className={`w-full text-left border-2 border-black p-4 rounded shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${
                    isSelected ? "bg-slate-50" : "bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-bold">{issue.issueNo}</div>
                    <div className="text-xs font-bold text-slate-600">{count} line(s)</div>
                  </div>
                  <div className="text-xs text-slate-600 mt-1">{issue.remarks || "-"}</div>
                  <div className="text-xs font-bold text-slate-600 mt-1">{issue.firmName || firms.find((firm) => firm.id === issue.firmId)?.firmName || "Legacy / Unassigned"}</div>
                </button>
              );
            })
          )}
        </div>

        <table className="hidden md:table min-w-full divide-y divide-black border-collapse border border-black">
          <thead className="sticky top-0 z-30 bg-slate-100">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-black text-black uppercase tracking-wider border border-black">Issue No</th>
              <th className="px-4 py-3 text-left text-xs font-black text-black uppercase tracking-wider border border-black">Firm</th>
              <th className="px-4 py-3 text-left text-xs font-black text-black uppercase tracking-wider border border-black">Remarks</th>
              <th className="px-4 py-3 text-left text-xs font-black text-black uppercase tracking-wider border border-black">Lines</th>
              <th className="px-4 py-3 text-left text-xs font-black text-black uppercase tracking-wider border border-black">Updated</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-black">
            {loading && rows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm">Loading Daily Consumption…</td></tr>
            ) : error ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-red-700">Unable to load Daily Consumption: {error}</td></tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-600 border border-black">
                  No issues found for this date.
                </td>
              </tr>
            ) : (
              rows.map((issue) => {
                const count = Number(issue.itemCount || 0);
                const isSelected = issue.id === selectedIssueId;
                return (
                  <tr
                    key={issue.id}
                    className={`hover:bg-slate-50 cursor-pointer ${isSelected ? "bg-slate-50" : ""}`}
                    onClick={() => selectIssue(issue.id)}
                  >
                    <td className="px-4 py-3 text-sm font-bold border border-black">{issue.issueNo}</td>
                    <td className="px-4 py-3 text-sm border border-black">{issue.firmName || firms.find((firm) => firm.id === issue.firmId)?.firmName || "Legacy / Unassigned"}</td>
                    <td className="px-4 py-3 text-sm border border-black">{issue.remarks || "-"}</td>
                    <td className="px-4 py-3 text-sm border border-black">{count}</td>
                    <td className="px-4 py-3 text-sm border border-black">{formatDate(issue.updateTimestamp || issue.date)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <ClientPagination page={page} pageSize={pageSize} totalItems={total} onPageChange={(nextPage) => { setPage(nextPage); setSelectedIssueId(null); }} onPageSizeChange={(nextSize) => { setPageSize(nextSize); setPage(1); setSelectedIssueId(null); }} pageSizeOptions={[25, 50, 100, 250]} />

      <div className="bg-white rounded shadow-sm overflow-hidden border border-black">
        <div className="p-4 border-b border-black flex items-center justify-between">
          <div className="font-bold uppercase tracking-tight">Issue Details</div>
          {selectedIssue ? <div className="text-sm font-bold text-slate-600">{selectedIssue.issueNo}</div> : null}
        </div>
        {!selectedIssue ? (
          <div className="p-6 text-sm text-slate-700">Select an issue to view its lines.</div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Detail label="Date" value={formatDate(selectedIssue.date)} />
              <Detail label="Firm" value={selectedIssue.firmName || firms.find((firm) => firm.id === selectedIssue.firmId)?.firmName || "Legacy / Unassigned"} />
              <Detail label="Remarks" value={selectedIssue.remarks || "-"} />
              <Detail label="Total Lines" value={String(selectedLines.length)} />
            </div>

            <div className="bg-slate-50 rounded border border-black overflow-hidden">
                              {lineLoadingId === selectedIssue.id ? <div className="p-4 text-center text-sm">Loading lines…</div> : <table className="min-w-full divide-y divide-black border-collapse border border-black">
                <thead className="sticky top-0 z-30 bg-slate-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-black text-black uppercase tracking-wider border border-black">Material</th>
                    <th className="px-4 py-3 text-right text-xs font-black text-black uppercase tracking-wider border border-black">Qty</th>
                    <th className="px-4 py-3 text-left text-xs font-black text-black uppercase tracking-wider border border-black">UOM</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-black">
                  {selectedLines.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-10 text-center text-sm text-slate-600 border border-black">
                        No lines found.
                      </td>
                    </tr>
                  ) : (
                    selectedLines.map((line) => {
                      return (
                        <tr key={line.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-sm border border-black">{line.materialName || line.materialId || "Unknown Material"}</td>
                          <td className="px-4 py-3 text-sm border border-black text-right">{Number(line.qty || 0).toFixed(2)}</td>
                          <td className="px-4 py-3 text-sm border border-black">{line.uom}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                              </table>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-black p-3">
      <div className="text-xs font-black text-slate-600 uppercase tracking-wider">{label}</div>
      <div className="text-sm font-bold text-black mt-1">{value}</div>
    </div>
  );
}

