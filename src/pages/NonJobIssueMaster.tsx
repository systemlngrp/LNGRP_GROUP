import React, { useMemo, useState } from "react";
import { getFirmDisplayName } from "../lib/firmDisplay";
import { ChevronDown, ChevronRight, Search, XCircle } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { getDataAuthHeaders, useData } from "../hooks/useData";
import { DailyConsumptionLine, DailyConsumptionRow, useDailyConsumptions } from "../hooks/useDailyConsumptions";
import { ClientPagination } from "../components/ClientPagination";
import { formatDate } from "../lib/serial";
import { Firm } from "../types";

const CANCEL_ALLOWED_EMAIL = "pankaj@bizskilledu.com";

function formatMoney(value?: number) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function DetailChip({ label, value }: { label: string; value?: React.ReactNode }) {
  return <div className="min-w-[130px] border-r border-slate-300 pr-3 last:border-r-0"><span className="mr-1 text-[9px] font-black uppercase text-slate-500">{label}:</span><span className="text-[11px] font-bold text-black">{value || "-"}</span></div>;
}

export function NonJobIssueMaster() {
  const { user } = useAuth();
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const [searchTerm, setSearchTerm] = useState("");
  const [firmFilter, setFirmFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [linesById, setLinesById] = useState<Record<string, DailyConsumptionLine[]>>({});
  const [lineLoadingId, setLineLoadingId] = useState<string | null>(null);

  const { rows, total, loading, error, httpStatus, loadLines, refresh, retry } = useDailyConsumptions({ page, pageSize, date: "", firmId: firmFilter, search: searchTerm, dateFrom, dateTo, status: statusFilter });
  const canCancelIssues = String(user?.email || "").trim().toLowerCase() === CANCEL_ALLOWED_EMAIL;
  const expandedLines = expandedIssueId ? linesById[expandedIssueId] || [] : [];
  const colSpan = canCancelIssues ? 10 : 9;

  const toggleExpanded = (id: string) => {
    const opening = expandedIssueId !== id;
    setExpandedIssueId(opening ? id : null);
    if (opening && !linesById[id]) {
      setLineLoadingId(id);
      void loadLines(id).then((lines) => setLinesById((current) => ({ ...current, [id]: lines || [] }))).catch(() => undefined).finally(() => setLineLoadingId((current) => current === id ? null : current));
    }
  };

  const cancelIssue = async (row: DailyConsumptionRow) => {
    if (cancellingId !== row.id) {
      setCancellingId(row.id);
      setCancelError(null);
      return;
    }
    try {
      const response = await fetch(`/api/daily-consumptions/${encodeURIComponent(row.id)}/cancel`, { method: "PATCH", headers: { ...getDataAuthHeaders(false), "Content-Type": "application/json" } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body?.error || response.statusText || "Unable to cancel Daily Consumption."));
      setCancellingId(null);
      await refresh();
    } catch (cause) {
      setCancelError((cause as Error).message || "Unable to cancel Daily Consumption.");
      setCancellingId(null);
    }
  };

  const firmById = useMemo(() => new Map(firms.map((firm) => [firm.id, firm])), [firms]);
  const firmCode = (row: DailyConsumptionRow) => {
    const firm = row.firmId ? firmById.get(row.firmId) : undefined;
    return firm ? getFirmDisplayName(firm) : (row.firmName || "Legacy / Unassigned");
  };
  const resetView = () => { setPage(1); setExpandedIssueId(null); };
  const filtersActive = Boolean(searchTerm.trim() || firmFilter || dateFrom || dateTo || statusFilter);
  const clearFilters = () => { setSearchTerm(""); setFirmFilter(""); setDateFrom(""); setDateTo(""); setStatusFilter(""); resetView(); };

  // Item lines and Tally details of one issue (table row and phone card).
  const renderDetailsBody = (row: DailyConsumptionRow) => {
    const tallyValues = [["Voucher", (row as any).tallyVoucherNo], ["Date", formatDate((row as any).tallyVoucherDate)], ["Type", (row as any).tallyVoucherType], ["By", (row as any).tallyPostedBy], ["At", (row as any).tallyTimestamp], ["Remark", (row as any).tallyPostingRemark], ["Error", (row as any).tallyPostingError]].filter(([, value]) => String(value || "").trim());
    return (
      <div className="space-y-2 text-xs">
        <div className="overflow-x-auto rounded border border-slate-300 bg-white">
          {lineLoadingId === row.id ? <div className="p-4 text-center">Loading item details…</div> : (
            <table className="min-w-[560px] w-full border-collapse text-xs">
              <thead className="bg-slate-100 text-[11px] uppercase text-slate-700">
                <tr>
                  <th className="px-2 py-2 text-left">Item</th>
                  <th className="px-2 py-2 text-right">Qty</th>
                  <th className="px-2 py-2 text-left">UOM</th>
                  <th className="px-2 py-2 text-right">Last Purchase Rate</th>
                  <th className="px-2 py-2 text-right">Opening Rate</th>
                  <th className="px-2 py-2 text-right">Rate</th>
                  <th className="px-2 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {expandedLines.map((line) => (
                  <tr key={line.id} className="border-t border-slate-200">
                    <td className="px-2 py-1.5 font-semibold">{line.materialName || line.materialId || "-"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{Number(line.qty || 0).toLocaleString()}</td>
                    <td className="px-2 py-1.5">{line.uom || "-"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney((line as any).lastPurchaseRate)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney((line as any).openingRate)}</td>
                    <td className="px-2 py-1.5 text-right font-bold tabular-nums text-indigo-700">{formatMoney(line.rate)}</td>
                    <td className="px-2 py-1.5 text-right font-bold tabular-nums text-emerald-700">{formatMoney(line.amount)}</td>
                  </tr>
                ))}
              </tbody>
              {expandedLines.length > 0 ? (
                <tfoot className="border-t-2 border-black bg-emerald-50">
                  <tr><td colSpan={6} className="px-2 py-1.5 text-right font-black">TOTAL</td><td className="px-2 py-1.5 text-right font-black tabular-nums">{formatMoney(expandedLines.reduce((sum, line) => sum + Number(line.amount || 0), 0))}</td></tr>
                </tfoot>
              ) : null}
            </table>
          )}
        </div>
        {tallyValues.length > 0 ? (
          <div className="rounded border border-slate-300 bg-white px-3 py-1.5">
            <span className="mr-2 font-black uppercase">Tally</span>
            {tallyValues.map(([label, value]) => <span key={label} className="mr-4 inline-block"><b className="text-slate-500">{label}:</b> {value}</span>)}
          </div>
        ) : null}
      </div>
    );
  };

  const statusBadge = (status?: string) => {
    const value = String(status || "").trim();
    const tone = /posted|success/i.test(value) ? "border-emerald-300 bg-emerald-50 text-emerald-800"
      : /cancel/i.test(value) ? "border-slate-300 bg-slate-100 text-slate-600"
      : /fail|error/i.test(value) ? "border-red-300 bg-red-50 text-red-700"
      : /not applicable/i.test(value) ? "border-slate-300 bg-slate-50 text-slate-700"
      : "border-amber-300 bg-amber-50 text-amber-900";
    return <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${tone}`}>{value || "Pending"}</span>;
  };

  const cancelButton = (row: DailyConsumptionRow) => (
    <button
      type="button"
      title={cancellingId === row.id ? "Click again to confirm" : "Cancel"}
      aria-label="Cancel"
      onClick={() => void cancelIssue(row)}
      disabled={String(row.tallyPostingStatus || "").trim().toLowerCase() === "cancelled"}
      className={`${cancellingId === row.id ? "animate-pulse border-amber-600 text-amber-600" : "border-red-600 text-red-600"} inline-flex h-8 w-8 items-center justify-center rounded-md border-2 bg-white disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400`}
    >
      <XCircle size={16} />
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">Daily Consumption Master</h2>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border-2 border-black bg-indigo-50 p-3 text-indigo-900">
          <div className="text-[11px] font-black uppercase tracking-wide">Issues</div>
          <div className="text-xl font-black tabular-nums">{total.toLocaleString()}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded border border-black bg-white p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(130px,1fr))_auto] lg:items-end">
        <label className="block sm:col-span-2 lg:col-span-1">
          <span className="mb-1 block text-[11px] font-black uppercase text-slate-600">Search</span>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              value={searchTerm}
              onChange={(event) => { setSearchTerm(event.target.value); resetView(); }}
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
            <option value="posted">Posted</option>
            <option value="na">Not Applicable</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        {filtersActive ? (
          <button type="button" onClick={clearFilters} className="rounded border-2 border-black bg-white px-3 py-2 text-sm font-bold hover:bg-slate-100">Clear</button>
        ) : <span className="hidden lg:block" />}
      </div>

      {cancelError ? <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">Unable to cancel: {cancelError}</div> : null}
      {loading && rows.length === 0 ? <div className="rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-600">Loading...</div> : null}
      {error ? (
        <div className="flex flex-wrap items-center gap-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          Unable to load: {error}
          {httpStatus === 503 ? <button type="button" onClick={() => retry()} className="rounded border border-red-700 bg-white px-3 py-1 font-bold hover:bg-red-50">Retry</button> : null}
        </div>
      ) : null}

      {/* Desktop table (also shown on phones when empty) */}
      <div className={`${rows.length === 0 ? "block" : "hidden md:block"} overflow-x-auto rounded border border-black bg-white`}>
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-slate-100 text-xs font-bold uppercase text-black">
            <tr>
              <th className="border border-black px-3 py-3 text-left">Issue No</th>
              <th className="border border-black px-3 py-3 text-left">Firm</th>
              <th className="border border-black px-3 py-3 text-left">Consumption No</th>
              <th className="border border-black px-3 py-3 text-left">Date</th>
              <th className="border border-black px-3 py-3 text-left">Tally Status</th>
              <th className="border border-black px-3 py-3 text-left">Items</th>
              <th className="border border-black px-3 py-3 text-right">Total Qty</th>
              <th className="border border-black px-3 py-3 text-right">Total Value</th>
              <th className="border border-black px-3 py-3 text-left">Remarks</th>
              {canCancelIssues ? <th className="border border-black px-3 py-3 text-center">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={colSpan} className="h-16" aria-label="No records" /></tr>
            ) : rows.map((row) => {
              const expanded = expandedIssueId === row.id;
              return (
                <React.Fragment key={row.id}>
                  <tr className="hover:bg-slate-50">
                    <td className="border border-black px-3 py-2 font-bold">
                      <button type="button" onClick={() => toggleExpanded(row.id)} className="inline-flex items-center gap-2 text-left" title={expanded ? "Hide items" : "Show items"}>
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-300 bg-white">{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                        {row.issueNo}
                      </button>
                    </td>
                    <td className="border border-black px-3 py-2 font-semibold">{firmCode(row)}</td>
                    <td className="border border-black px-3 py-2 font-semibold text-indigo-700">{row.consumptionTransactionNo || "-"}</td>
                    <td className="border border-black px-3 py-2">{formatDate(row.date) || "-"}</td>
                    <td className="border border-black px-3 py-2">{statusBadge(row.tallyPostingStatus)}</td>
                    <td className="border border-black px-3 py-2">{row.itemNames || "-"}</td>
                    <td className="border border-black px-3 py-2 text-right font-bold tabular-nums">{Number(row.totalQty || 0).toLocaleString()}</td>
                    <td className="border border-black px-3 py-2 text-right font-black tabular-nums text-emerald-700">{formatMoney(row.totalValue)}</td>
                    <td className="border border-black px-3 py-2">{row.remarks || "-"}</td>
                    {canCancelIssues ? <td className="border border-black px-3 py-2 text-center">{cancelButton(row)}</td> : null}
                  </tr>
                  {expanded ? (
                    <tr className="bg-slate-50"><td colSpan={colSpan} className="border border-black px-3 py-3">{renderDetailsBody(row)}</td></tr>
                  ) : null}
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
            const expanded = expandedIssueId === row.id;
            return (
              <div key={row.id} className="rounded-md border-2 border-black bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-black">{row.issueNo}</div>
                    <div className="text-xs font-semibold text-slate-600">{formatDate(row.date) || "-"} · {firmCode(row)}{row.consumptionTransactionNo ? ` · ${row.consumptionTransactionNo}` : ""}</div>
                  </div>
                  {statusBadge(row.tallyPostingStatus)}
                </div>
                {row.itemNames ? <div className="mt-1 line-clamp-2 text-sm">{row.itemNames}</div> : null}
                <div className="mt-2 grid grid-cols-2 gap-2 rounded bg-slate-50 px-2 py-1.5 text-xs">
                  <div><div className="font-bold text-slate-500">Total Qty</div><div className="font-bold tabular-nums">{Number(row.totalQty || 0).toLocaleString()}</div></div>
                  <div className="text-right"><div className="font-bold text-slate-500">Total Value</div><div className="text-sm font-black tabular-nums text-emerald-700">{formatMoney(row.totalValue)}</div></div>
                </div>
                {row.remarks ? <div className="mt-1 text-xs text-slate-600">{row.remarks}</div> : null}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <button type="button" onClick={() => toggleExpanded(row.id)} className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1.5 text-xs font-bold">
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {row.itemCount || 0} {(row.itemCount || 0) === 1 ? "item" : "items"}
                  </button>
                  {canCancelIssues ? cancelButton(row) : null}
                </div>
                {expanded ? <div className="mt-2">{renderDetailsBody(row)}</div> : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <ClientPagination page={page} pageSize={pageSize} totalItems={total} onPageChange={(next) => { setPage(next); setExpandedIssueId(null); }} onPageSizeChange={(next) => { setPageSize(next); setPage(1); setExpandedIssueId(null); }} pageSizeOptions={[25, 50, 100, 250]} />
    </div>
  );
}
