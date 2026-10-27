import React, { useState } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { TableControls } from "../components/TableControls";
import { ClientPagination } from "../components/ClientPagination";
import { useConfirm } from "../components/ConfirmDialog";
import { formatDate } from "../lib/serial";
import { usePendingConsumptionTally, type PendingTallyRow } from "../hooks/usePendingConsumptionTally";

function formatMoney(value?: number) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PendingConsumptionTallyPosting() {
  const confirm = useConfirm();
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const { rows, total, loading, error, linesByIssueId, lineLoadingId, loadLines, deletePending } = usePendingConsumptionTally({ page, pageSize, search: searchTerm });

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setPage(1);
    setExpandedIssueId(null);
  };

  const handlePageSizeChange = (value: number) => {
    setPageSize(Math.min(250, Math.max(1, value)));
    setPage(1);
    setExpandedIssueId(null);
  };

  const handleExpand = (row: PendingTallyRow) => {
    const nextExpanded = expandedIssueId === row.id ? null : row.id;
    setExpandedIssueId(nextExpanded);
    if (nextExpanded && !linesByIssueId[row.id]) {
      setDetailError(null);
      void loadLines(row.id).catch((cause) => setDetailError(cause instanceof Error ? cause.message : "Unable to load item details."));
    }
  };

  const handleDelete = async (row: PendingTallyRow) => {
    const issueNo = row.issueNo || row.id;
    if (!await confirm(`Delete Daily Consumption ${issueNo}? This permanently removes the issue and all its material lines before Tally posting.`)) return;
    setDeletingId(row.id);
    try {
      await deletePending(row.id);
      setExpandedIssueId(null);
      if (rows.length === 1 && page > 1) setPage((current) => current - 1);
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : "Failed to delete Daily Consumption.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-black pb-4">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">Pending Consumption Tally Posting</h2>
        <div className="text-sm font-bold text-slate-700">Pending: {total.toLocaleString()}</div>
      </div>

      <TableControls searchTerm={searchTerm} onSearchChange={handleSearchChange} placeholder="Search issue no, consumption no, date, error, item..." />
      {error ? <div className="border border-red-700 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">Unable to load pending Consumption Tally posting: {error}</div> : null}

      <div className="overflow-hidden rounded border border-black bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-black border-collapse">
            <thead className="sticky top-0 z-30 bg-slate-100">
              <tr className="divide-x divide-black">
                <th className="px-4 py-3 text-left text-xs font-bold uppercase">Issue No</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase">Consumption No</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase">Date</th>
                <th className="px-4 py-3 text-right text-xs font-bold uppercase">No. of Items</th>
                <th className="px-4 py-3 text-right text-xs font-bold uppercase">Total Value</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase">Remark</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase">Error</th>
                <th className="px-4 py-3 text-center text-xs font-bold uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black">
              {loading && rows.length === 0 ? (
                <tr><td colSpan={9} className="px-6 py-8 text-center font-medium text-slate-600">Loading pending Consumption Tally posting…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="px-6 py-8 text-center font-medium text-slate-600">No pending Consumption Tally posting rows found.</td></tr>
              ) : rows.map((row) => {
                const isExpanded = expandedIssueId === row.id;
                const lines = linesByIssueId[row.id] || [];
                return (
                  <React.Fragment key={row.id}>
                    <tr className="divide-x divide-black hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-bold">
                        <button type="button" title={isExpanded ? "Hide item details" : "Show item details"} onClick={() => handleExpand(row)} className="flex items-start gap-2 text-left font-bold text-black hover:text-sky-800">
                          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-black bg-white">{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                          <span>{row.issueNo || row.id}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-indigo-700">{row.consumptionTransactionNo || row.issueNo || "-"}</td>
                      <td className="px-4 py-3 text-sm">{formatDate(row.date) || "-"}</td>
                      <td className="px-4 py-3 text-right text-sm font-black text-slate-800">{Number(row.itemCount || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-sm font-black text-emerald-700">{formatMoney(row.totalValue)}</td>
                      <td className="px-4 py-3 text-sm">{row.tallyPostingStatus || "-"}</td>
                      <td className="px-4 py-3 text-sm">{row.tallyPostingRemark || row.remarks || "-"}</td>
                      <td className="px-4 py-3 text-sm text-red-700">{row.tallyPostingError || "-"}</td>
                      <td className="px-4 py-3 text-center">
                        <button type="button" title="Delete Daily Consumption" aria-label={`Delete ${row.issueNo || row.id}`} disabled={deletingId === row.id} onClick={() => void handleDelete(row)} className="inline-flex items-center gap-1 rounded border border-red-700 px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">
                          <Trash2 size={14} /> {deletingId === row.id ? "Deleting…" : "Delete"}
                        </button>
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="bg-slate-50">
                        <td colSpan={9} className="border-t border-black px-3 py-2">
                          <div className="overflow-hidden rounded border border-black bg-white">
                            {lineLoadingId === row.id ? <div className="px-3 py-4 text-center text-sm text-slate-600">Loading item details…</div> : (
                              detailError ? <div className="px-3 py-4 text-center text-sm font-semibold text-red-700">{detailError}</div> :
                              <table className="min-w-full divide-y divide-black text-[11px]">
                                <thead className="bg-slate-100"><tr className="divide-x divide-black"><th className="px-2 py-1 text-left font-black uppercase">Item</th><th className="px-2 py-1 text-right font-black uppercase">Qty</th><th className="px-2 py-1 text-left font-black uppercase">UOM</th><th className="px-2 py-1 text-right font-black uppercase">Rate</th><th className="px-2 py-1 text-right font-black uppercase">Amount</th></tr></thead>
                                <tbody className="divide-y divide-black">
                                  {lines.length === 0 ? <tr><td colSpan={5} className="px-2 py-2 text-center text-slate-600">No item lines found.</td></tr> : lines.map((line) => <tr key={line.id} className="divide-x divide-black"><td className="px-2 py-1 font-semibold">{line.materialName || line.materialId || "-"}</td><td className="px-2 py-1 text-right font-semibold">{Number(line.qty || 0).toLocaleString()}</td><td className="px-2 py-1">{line.uom || "-"}</td><td className="px-2 py-1 text-right font-semibold">{formatMoney(line.rate)}</td><td className="px-2 py-1 text-right font-black text-emerald-700">{formatMoney(Number(line.amount || 0) > 0 ? line.amount : Number(line.qty || 0) * Number(line.rate || 0))}</td></tr>)}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <ClientPagination page={page} pageSize={pageSize} totalItems={total} onPageChange={(nextPage) => { setPage(nextPage); setExpandedIssueId(null); }} onPageSizeChange={handlePageSizeChange} pageSizeOptions={[25, 50, 100, 250]} />
      </div>
    </div>
  );
}
