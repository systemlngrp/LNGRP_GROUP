import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Send } from "lucide-react";
import { getDataAuthHeaders } from "../hooks/useData";

type SendRow = {
  id: string;
  report: string;
  source: string;
  reportDate?: string;
  slot?: string;
  label?: string;
  fileName?: string;
  status?: string;
  error?: string;
  attempts?: number;
  sentAt?: string;
  sentBy?: string;
  createdAt?: string;
};

const REPORT_LABELS: Record<string, string> = {
  "production-plan": "Production Plan",
  "dispatch-plan": "Dispatch Plan",
  "pending-loading": "Pending Loading",
};
const SOURCE_LABELS: Record<string, string> = { Scheduled: "Timed", Page: "Page button", "Send Now": "Send now", Resend: "Resend" };

const when = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
};

/** WhatsApp Master: Production Plan / Dispatch Plan / Pending Loading sends, with Resend. */
export function WhatsappReportSendHistory() {
  const [rows, setRows] = useState<SendRow[]>([]);
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendingId, setResendingId] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/whatsapp-reports/log${report ? `?report=${encodeURIComponent(report)}` : ""}`, { headers: getDataAuthHeaders() });
      const body = await response.json().catch(() => ({}));
      setRows(Array.isArray(body.rows) ? body.rows : []);
    } finally {
      setLoading(false);
    }
  }, [report]);
  useEffect(() => { void load(); }, [load]);

  const resend = async (row: SendRow) => {
    if (resendingId || !window.confirm(`Send ${REPORT_LABELS[row.report] || row.report} again on WhatsApp?`)) return;
    setResendingId(row.id);
    setNotice("");
    try {
      const response = await fetch(`/api/whatsapp-reports/log/${encodeURIComponent(row.id)}/resend`, { method: "POST", headers: getDataAuthHeaders() });
      const body = await response.json().catch(() => ({}));
      setNotice(body.status === "Sent" ? "Sent again on WhatsApp." : String(body.error || "WhatsApp message could not be sent."));
      await load();
    } finally {
      setResendingId("");
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
        <div>
          <h3 className="font-black text-slate-900">Report PDF sends</h3>
          <p className="text-sm font-medium text-slate-500">Production Plan, Dispatch Plan and Pending Loading (latest 100)</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={report} onChange={(e) => setReport(e.target.value)} className="h-[34px] rounded border-2 border-black px-2 text-xs font-semibold">
            <option value="">All reports</option>
            {Object.entries(REPORT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button type="button" onClick={() => void load()} title="Refresh" className="inline-flex h-[34px] items-center gap-1 rounded border-2 border-black px-3 text-xs font-bold hover:bg-slate-100"><RefreshCw size={14} className={loading ? "animate-spin" : ""} />Refresh</button>
        </div>
      </div>
      {notice ? <div role="status" className="border-b border-slate-200 bg-slate-50 px-5 py-2 text-sm font-bold text-slate-700">{notice}</div> : null}
      <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full border-collapse text-sm">
          <thead className="bg-slate-900 text-left text-xs uppercase tracking-wider text-white">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Report</th>
              <th className="px-4 py-3">How</th>
              <th className="px-4 py-3">For</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">PDF</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center font-bold text-slate-500">{loading ? "Loading…" : "No report sends yet."}</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-200 align-top">
                <td className="px-4 py-3 whitespace-nowrap">{when(row.sentAt || row.createdAt)}{row.slot ? <div className="text-xs font-bold text-slate-500">Slot {row.slot}</div> : null}</td>
                <td className="px-4 py-3 font-bold">{REPORT_LABELS[row.report] || row.report}</td>
                <td className="px-4 py-3">{SOURCE_LABELS[row.source] || row.source}{row.sentBy ? <div className="text-xs text-slate-500">{row.sentBy}</div> : null}</td>
                <td className="px-4 py-3 text-xs">{row.label || "-"}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-black ${row.status === "Sent" ? "bg-emerald-100 text-emerald-800" : row.status === "Failed" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>{row.status || "-"}</span>
                  {row.status !== "Sent" && row.error ? <div className="mt-1 max-w-[260px] text-xs text-red-600">{row.error}</div> : null}
                  {row.source === "Scheduled" && Number(row.attempts || 0) > 1 ? <div className="mt-1 text-xs text-slate-500">Tries: {row.attempts}</div> : null}
                </td>
                <td className="px-4 py-3">{row.fileName ? <a href={`/uploads/${encodeURIComponent(row.fileName)}`} target="_blank" rel="noreferrer" className="font-bold text-indigo-700 underline">Open</a> : "-"}</td>
                <td className="px-4 py-3">
                  <button type="button" onClick={() => void resend(row)} disabled={Boolean(resendingId) || row.status === "Sending"} className="inline-flex items-center gap-1 rounded border border-green-700 px-2 py-1 text-xs font-bold text-green-700 hover:bg-green-50 disabled:opacity-40">
                    <Send size={12} />{resendingId === row.id ? "Sending…" : "Resend"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
