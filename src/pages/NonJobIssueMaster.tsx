import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, XCircle } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { getDataAuthHeaders, useData } from "../hooks/useData";
import { DailyConsumptionLine, DailyConsumptionRow, useDailyConsumptions } from "../hooks/useDailyConsumptions";
import { ClientPagination } from "../components/ClientPagination";
import { TableControls } from "../components/TableControls";
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [linesById, setLinesById] = useState<Record<string, DailyConsumptionLine[]>>({});
  const [lineLoadingId, setLineLoadingId] = useState<string | null>(null);

  const { rows, total, loading, error, loadLines, refresh } = useDailyConsumptions({ page, pageSize, date: "", firmId: firmFilter, search: searchTerm });
  const canCancelIssues = String(user?.email || "").trim().toLowerCase() === CANCEL_ALLOWED_EMAIL;
  const expandedRow = useMemo(() => rows.find((row) => row.id === expandedIssueId) || null, [expandedIssueId, rows]);
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

  const renderDetails = (row: DailyConsumptionRow) => {
    const tallyValues = [["Voucher", (row as any).tallyVoucherNo], ["Date", formatDate((row as any).tallyVoucherDate)], ["Type", (row as any).tallyVoucherType], ["By", (row as any).tallyPostedBy], ["At", (row as any).tallyTimestamp], ["Remark", (row as any).tallyPostingRemark], ["Error", (row as any).tallyPostingError]].filter(([, value]) => String(value || "").trim());
    return <tr key={`${row.id}-details`} className="bg-slate-50"><td colSpan={colSpan} className="border-t border-black px-3 py-2"><div className="space-y-2 text-[11px]">
      <div className="flex flex-wrap gap-x-3 gap-y-1 rounded border border-slate-300 bg-white px-3 py-2"><DetailChip label="Issue" value={row.issueNo} /><DetailChip label="Firm" value={row.firmName || "Legacy / Unassigned"} /><DetailChip label="Consumption" value={row.consumptionTransactionNo} /><DetailChip label="Date" value={formatDate(row.date)} /><DetailChip label="Type" value={row.issueType} /><DetailChip label="Tally" value={row.tallyPostingStatus} /><DetailChip label="Remarks" value={row.remarks} /></div>
      <div className="overflow-x-auto rounded border border-black bg-white">{lineLoadingId === row.id ? <div className="p-4 text-center">Loading item details…</div> : <table className="min-w-full divide-y divide-black text-[11px]"><thead className="bg-slate-100"><tr className="divide-x divide-black"><th className="px-2 py-1 text-left">Item</th><th className="px-2 py-1 text-right">Qty</th><th className="px-2 py-1 text-left">UOM</th><th className="px-2 py-1 text-right">Last Purchase Rate</th><th className="px-2 py-1 text-right">Opening Rate</th><th className="px-2 py-1 text-right">Rate</th><th className="px-2 py-1 text-right">Amount</th></tr></thead><tbody className="divide-y divide-black">{expandedLines.length === 0 ? <tr><td colSpan={7} className="px-2 py-3 text-center text-slate-600">No item lines found.</td></tr> : expandedLines.map((line) => <tr key={line.id} className="divide-x divide-black"><td className="px-2 py-1 font-semibold">{line.materialName || line.materialId || "-"}</td><td className="px-2 py-1 text-right">{Number(line.qty || 0).toLocaleString()}</td><td className="px-2 py-1">{line.uom || "-"}</td><td className="px-2 py-1 text-right">{formatMoney((line as any).lastPurchaseRate)}</td><td className="px-2 py-1 text-right">{formatMoney((line as any).openingRate)}</td><td className="px-2 py-1 text-right font-bold text-indigo-700">{formatMoney(line.rate)}</td><td className="px-2 py-1 text-right font-bold text-emerald-700">{formatMoney(line.amount)}</td></tr>)}</tbody>{expandedLines.length > 0 ? <tfoot className="border-t-2 border-black bg-emerald-50"><tr><td colSpan={6} className="px-2 py-1 text-right font-black">TOTAL</td><td className="px-2 py-1 text-right font-black">{formatMoney(expandedLines.reduce((sum, line) => sum + Number(line.amount || 0), 0))}</td></tr></tfoot> : null}</table>}</div>
      <div className="rounded border border-slate-300 bg-white px-3 py-1.5"><span className="mr-2 font-black uppercase">Tally Details</span>{tallyValues.length === 0 ? <span>-</span> : tallyValues.map(([label, value]) => <span key={label} className="mr-4 inline-block"><b className="text-slate-500">{label}:</b> {value}</span>)}</div>
    </div></td></tr>;
  };

  return <div className="space-y-6">
    <div className="flex items-center justify-between border-b border-black pb-4"><h2 className="text-xl font-bold uppercase tracking-tight">Daily Consumption Master</h2><span className="text-sm font-bold text-slate-600">{total} issue(s)</span></div>
    <div className="flex flex-wrap gap-3"><TableControls searchTerm={searchTerm} onSearchChange={(value) => { setSearchTerm(value); setPage(1); setExpandedIssueId(null); }} placeholder="Search issue no, consumption no, firm, date, item, remarks..." /><select value={firmFilter} onChange={(event) => { setFirmFilter(event.target.value); setPage(1); setExpandedIssueId(null); }} className="min-w-52 rounded border-2 border-black bg-white px-3 py-2 text-sm font-bold"><option value="">All firms</option>{firms.map((firm) => <option key={firm.id} value={firm.id}>{firm.firmName}</option>)}</select></div>
    {cancelError ? <div className="border border-red-600 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">Unable to cancel Daily Consumption: {cancelError}</div> : null}
    <div className="overflow-hidden rounded border border-black bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-full divide-y divide-black border-collapse"><thead className="bg-slate-100"><tr className="divide-x divide-black"><th className="px-4 py-3 text-left text-xs font-bold uppercase">Issue No</th><th className="px-4 py-3 text-left text-xs font-bold uppercase">Firm</th><th className="px-4 py-3 text-left text-xs font-bold uppercase">Consumption No</th><th className="px-4 py-3 text-left text-xs font-bold uppercase">Date</th><th className="px-4 py-3 text-left text-xs font-bold uppercase">Tally Status</th><th className="px-4 py-3 text-left text-xs font-bold uppercase">Items</th><th className="px-4 py-3 text-right text-xs font-bold uppercase">Total Qty</th><th className="px-4 py-3 text-right text-xs font-bold uppercase">Total Value</th><th className="px-4 py-3 text-left text-xs font-bold uppercase">Remarks</th>{canCancelIssues ? <th className="px-4 py-3 text-right text-xs font-bold uppercase">Actions</th> : null}</tr></thead><tbody className="divide-y divide-black">
      {loading && rows.length === 0 ? <tr><td colSpan={colSpan} className="px-6 py-10 text-center">Loading Daily Consumption…</td></tr> : error ? <tr><td colSpan={colSpan} className="px-6 py-10 text-center text-red-700">Unable to load Daily Consumption: {error}</td></tr> : rows.length === 0 ? <tr><td colSpan={colSpan} className="px-6 py-10 text-center text-slate-600">No Daily Consumption issues found.</td></tr> : rows.map((row) => { const expanded = expandedIssueId === row.id; return <><tr key={row.id} className="divide-x divide-black hover:bg-slate-50"><td className="px-4 py-3 text-sm font-bold"><button type="button" onClick={() => toggleExpanded(row.id)} className="flex items-start gap-2 text-left"><span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded border border-black bg-white">{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>{row.issueNo}</button></td><td className="px-4 py-3 text-sm">{row.firmName || "Legacy / Unassigned"}</td><td className="px-4 py-3 text-sm font-semibold text-indigo-700">{row.consumptionTransactionNo || "-"}</td><td className="px-4 py-3 text-sm">{formatDate(row.date) || "-"}</td><td className="px-4 py-3 text-sm">{row.tallyPostingStatus || "-"}</td><td className="px-4 py-3 text-sm">{row.itemNames || "-"}</td><td className="px-4 py-3 text-right text-sm font-black">{Number(row.totalQty || 0).toLocaleString()}</td><td className="px-4 py-3 text-right text-sm font-black text-emerald-700">{formatMoney(row.totalValue)}</td><td className="px-4 py-3 text-sm">{row.remarks || "-"}</td>{canCancelIssues ? <td className="px-4 py-3 text-right"><button type="button" title={cancellingId === row.id ? "Click again to confirm" : "Cancel"} onClick={() => void cancelIssue(row)} disabled={String(row.tallyPostingStatus || "").trim().toLowerCase() === "cancelled"} className={`${cancellingId === row.id ? "text-amber-600 animate-pulse" : "text-red-600"} inline-flex items-center justify-end font-bold disabled:cursor-not-allowed disabled:text-slate-400`}><XCircle size={16} /></button></td> : null}</tr>{expanded ? renderDetails(row) : null}</>; })}
    </tbody></table></div></div>
    <ClientPagination page={page} pageSize={pageSize} totalItems={total} onPageChange={(next) => { setPage(next); setExpandedIssueId(null); }} onPageSizeChange={(next) => { setPageSize(next); setPage(1); setExpandedIssueId(null); }} pageSizeOptions={[25, 50, 100, 250]} />
  </div>;
}
