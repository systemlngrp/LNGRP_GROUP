import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, Trash2 } from "lucide-react";
import { useData } from "../hooks/useData";
import { getFirmDisplayName } from "../lib/firmDisplay";
import { Firm } from "../types";
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
  const [firmFilter, setFirmFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const firmById = useMemo(() => new Map(firms.map((firm) => [firm.id, firm])), [firms]);
  const firmCode = (row: PendingTallyRow) => {
    const firm = row.firmId ? firmById.get(row.firmId) : undefined;
    return firm ? getFirmDisplayName(firm) : (row.firmName || row.firmId || "-");
  };
  const { rows, total, loading, error, linesByIssueId, lineLoadingId, loadLines, deletePending } = usePendingConsumptionTally({ page, pageSize, search: searchTerm, firmId: firmFilter, dateFrom, dateTo, status: statusFilter });

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setPage(1);
    setExpandedIssueId(null);
  };

  const resetView = () => { setPage(1); setExpandedIssueId(null); };
  const filtersActive = Boolean(searchTerm.trim() || firmFilter || dateFrom || dateTo || statusFilter);
  const clearFilters = () => { setSearchTerm(""); setFirmFilter(""); setDateFrom(""); setDateTo(""); setStatusFilter(""); resetView(); };

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

  const renderLines = (row: PendingTallyRow) => {
    const lines = linesByIssueId[row.id] || [];
    if (lineLoadingId === row.id) return <div className="px-3 py-4 text-center text-sm text-slate-600">Loading item details…</div>;
    if (detailError) return <div className="px-3 py-4 text-center text-sm font-semibold text-red-700">{detailError}</div>;
    return (
      <div className="overflow-x-auto rounded border border-slate-300 bg-white">
        <table className="min-w-[420px] w-full border-collapse text-xs">
          <thead className="bg-slate-100 text-[11px] uppercase text-slate-700">
            <tr><th className="px-2 py-2 text-left">Item</th><th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2 text-left">UOM</th><th className="px-2 py-2 text-right">Rate</th><th className="px-2 py-2 text-right">Amount</th></tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-t border-slate-200">
                <td className="px-2 py-1.5 font-semibold">{line.materialName || line.materialId || "-"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{Number(line.qty || 0).toLocaleString()}</td>
                <td className="px-2 py-1.5">{line.uom || "-"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(line.rate)}</td>
                <td className="px-2 py-1.5 text-right font-bold tabular-nums text-emerald-700">{formatMoney(Number(line.amount || 0) > 0 ? line.amount : Number(line.qty || 0) * Number(line.rate || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const deleteButton = (row: PendingTallyRow) => (
    <button type="button" title="Delete" aria-label={`Delete ${row.issueNo || row.id}`} disabled={deletingId === row.id} onClick={() => void handleDelete(row)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border-2 border-red-600 bg-white text-red-600 hover:bg-red-50 disabled:animate-pulse disabled:opacity-50">
      <Trash2 size={15} />
    </button>
  );

  const statusBadge = (status?: string | null) => {
    const value = String(status || "").trim();
    const tone = /fail|error/i.test(value) ? "border-red-300 bg-red-50 text-red-700" : "border-amber-300 bg-amber-50 text-amber-900";
    return <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${tone}`}>{value || "Pending"}</span>;
  };

  const pageValue = rows.reduce((sum, row) => sum + Number(row.totalValue || 0), 0);

  return (
    <div className="space-y-4">
      <div className="border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">Pending Daily Consumables Tally Posting</h2>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border-2 border-black bg-amber-50 p-3 text-amber-900">
          <div className="text-[11px] font-black uppercase tracking-wide">Pending</div>
          <div className="text-xl font-black tabular-nums">{total.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border-2 border-black bg-emerald-50 p-3 text-emerald-900">
          <div className="text-[11px] font-black uppercase tracking-wide">Value (this page)</div>
          <div className="text-xl font-black tabular-nums">{formatMoney(pageValue)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded border border-black bg-white p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(130px,1fr))_auto] lg:items-end">
        <label className="block sm:col-span-2 lg:col-span-1">
          <span className="mb-1 block text-[11px] font-black uppercase text-slate-600">Search</span>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              value={searchTerm}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder="Search"
              className="w-full rounded border-2 border-black py-2 pl-9 pr-3 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
            />
          </div>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-black uppercase text-slate-600">Firm</span>
          <select value={firmFilter} onChange={(event) => { setFirmFilter(event.target.value); resetView(); }} className="w-full rounded border-2 border-black bg-white px-3 py-2 text-sm font-semibold">
            <option value="">All</option>
            {firms.map((firm) => <option key={firm.id} value={firm.id}>{getFirmDisplayName(firm)}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-black uppercase text-slate-600">From</span>
          <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => { setDateFrom(event.target.value); resetView(); }} className="w-full rounded border-2 border-black bg-white px-3 py-2 text-sm font-semibold" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-black uppercase text-slate-600">To</span>
          <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => { setDateTo(event.target.value); resetView(); }} className="w-full rounded border-2 border-black bg-white px-3 py-2 text-sm font-semibold" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-black uppercase text-slate-600">Tally Status</span>
          <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); resetView(); }} className="w-full rounded border-2 border-black bg-white px-3 py-2 text-sm font-semibold">
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </label>
        {filtersActive ? (
          <button type="button" onClick={clearFilters} className="rounded border-2 border-black bg-white px-3 py-2 text-sm font-bold hover:bg-slate-100">Clear</button>
        ) : <span className="hidden lg:block" />}
      </div>

      {error ? <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">Unable to load: {error}</div> : null}
      {loading && rows.length === 0 ? <div className="rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-600">Loading...</div> : null}

      {/* Desktop table (also shown on phones when empty) */}
      <div className={`${rows.length === 0 ? "block" : "hidden md:block"} overflow-x-auto rounded border border-black bg-white`}>
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-slate-100 text-xs font-bold uppercase text-black">
            <tr>
              <th className="border border-black px-3 py-3 text-left">Issue No</th>
              <th className="border border-black px-3 py-3 text-left">Firm</th>
              <th className="border border-black px-3 py-3 text-left">Consumption No</th>
              <th className="border border-black px-3 py-3 text-left">Date</th>
              <th className="border border-black px-3 py-3 text-right">No. of Items</th>
              <th className="border border-black px-3 py-3 text-right">Total Value</th>
              <th className="border border-black px-3 py-3 text-left">Status</th>
              <th className="border border-black px-3 py-3 text-left">Remark</th>
              <th className="border border-black px-3 py-3 text-left">Error</th>
              <th className="border border-black px-3 py-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={10} className="h-16" aria-label="No records" /></tr>
            ) : rows.map((row) => {
              const isExpanded = expandedIssueId === row.id;
              return (
                <React.Fragment key={row.id}>
                  <tr className="hover:bg-slate-50">
                    <td className="border border-black px-3 py-2 font-bold">
                      <button type="button" title={isExpanded ? "Hide items" : "Show items"} onClick={() => handleExpand(row)} className="inline-flex items-center gap-2 text-left">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-300 bg-white">{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                        {row.issueNo || row.id}
                      </button>
                    </td>
                    <td className="border border-black px-3 py-2 font-semibold">{firmCode(row)}</td>
                    <td className="border border-black px-3 py-2 font-semibold text-indigo-700">{row.consumptionTransactionNo || row.issueNo || "-"}</td>
                    <td className="border border-black px-3 py-2">{formatDate(row.date) || "-"}</td>
                    <td className="border border-black px-3 py-2 text-right font-bold tabular-nums">{Number(row.itemCount || 0).toLocaleString()}</td>
                    <td className="border border-black px-3 py-2 text-right font-black tabular-nums text-emerald-700">{formatMoney(row.totalValue)}</td>
                    <td className="border border-black px-3 py-2">{statusBadge(row.tallyPostingStatus)}</td>
                    <td className="border border-black px-3 py-2">{row.tallyPostingRemark || row.remarks || "-"}</td>
                    <td className="border border-black px-3 py-2 text-red-700">{row.tallyPostingError || "-"}</td>
                    <td className="border border-black px-3 py-2 text-center">{deleteButton(row)}</td>
                  </tr>
                  {isExpanded ? <tr className="bg-slate-50"><td colSpan={10} className="border border-black px-3 py-3">{renderLines(row)}</td></tr> : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phone cards */}
      {rows.length > 0 ? (
        <div className="space-y-3 md:hidden">
          {rows.map((row) => {
            const isExpanded = expandedIssueId === row.id;
            const remark = row.tallyPostingRemark || row.remarks;
            return (
              <div key={row.id} className="rounded-md border-2 border-black bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-black">{row.issueNo || row.id}</div>
                    <div className="text-xs font-semibold text-slate-600">{formatDate(row.date) || "-"} · {firmCode(row)}{row.consumptionTransactionNo ? ` · ${row.consumptionTransactionNo}` : ""}</div>
                  </div>
                  {statusBadge(row.tallyPostingStatus)}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 rounded bg-slate-50 px-2 py-1.5 text-xs">
                  <div><div className="font-bold text-slate-500">Items</div><div className="font-bold tabular-nums">{Number(row.itemCount || 0).toLocaleString()}</div></div>
                  <div className="text-right"><div className="font-bold text-slate-500">Total Value</div><div className="text-sm font-black tabular-nums text-emerald-700">{formatMoney(row.totalValue)}</div></div>
                </div>
                {remark ? <div className="mt-1 text-xs text-slate-600">{remark}</div> : null}
                {row.tallyPostingError ? <div className="mt-1 text-xs font-semibold text-red-700">{row.tallyPostingError}</div> : null}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <button type="button" onClick={() => handleExpand(row)} className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1.5 text-xs font-bold">
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Items
                  </button>
                  {deleteButton(row)}
                </div>
                {isExpanded ? <div className="mt-2">{renderLines(row)}</div> : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <ClientPagination page={page} pageSize={pageSize} totalItems={total} onPageChange={(nextPage) => { setPage(nextPage); setExpandedIssueId(null); }} onPageSizeChange={handlePageSizeChange} pageSizeOptions={[25, 50, 100, 250]} />
    </div>
  );
}
