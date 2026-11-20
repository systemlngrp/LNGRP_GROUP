import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { getDataAuthHeaders } from "../hooks/useData";
import type { WhatsappReportKey } from "../lib/reports/whatsappReports";
import { friendlyWhatsappError } from "../lib/whatsappErrorText";

type Status = { kind: "sending" | "sent" | "failed"; text: string } | null;
export type WhatsappReportRequest = { date?: string; filters?: Record<string, unknown>; label: string };

/**
 * "WhatsApp" button on Production Plan / Dispatch Plan / Pending Loading.
 * The server reads the data from the database with this page's date and
 * dropdown filters, makes the PDF (same layout as Download PDF), stores it and
 * sends it to the group set for this page in WhatsApp Master.
 */
export function SendReportWhatsappButton({ report, title, buildRequest, disabled, loading }: {
  report: WhatsappReportKey;
  title: string;
  buildRequest: () => WhatsappReportRequest | null;
  disabled?: boolean;
  /** The page's lists are still loading: wait, so the filters match the data. */
  loading?: boolean;
}) {
  const [status, setStatus] = useState<Status>(null);
  const send = async () => {
    const request = buildRequest();
    if (!request || status?.kind === "sending") return;
    if (!window.confirm(`Send ${title} (${request.label}) on WhatsApp?\n\nThe PDF is made from the data saved in the database.`)) return;
    setStatus({ kind: "sending", text: "Preparing PDF…" });
    try {
      const response = await fetch(`/api/whatsapp-reports/${report}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getDataAuthHeaders() },
        body: JSON.stringify({ date: request.date, filters: request.filters || {} }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.status === "Sent") setStatus({ kind: "sent", text: "Sent on WhatsApp" });
      else setStatus({ kind: "failed", text: result.status === "Not Configured" ? String(result.error || "") : friendlyWhatsappError(result.error, title) });
    } catch {
      setStatus({ kind: "failed", text: "WhatsApp message could not be sent." });
    }
  };
  const busy = status?.kind === "sending";
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => void send()}
        disabled={disabled || loading || busy}
        title={loading ? "Wait until the page has loaded all data" : "Send PDF on WhatsApp (made from the saved data)"}
        className="inline-flex items-center gap-2 rounded border border-green-700 px-3 py-1.5 text-sm font-bold uppercase tracking-tight text-green-700 transition-colors hover:bg-green-50 disabled:opacity-40"
      >
        <MessageCircle size={16} />
        <span>{busy ? "Preparing PDF…" : loading ? "Loading data…" : "WhatsApp"}</span>
      </button>
      {status && !busy ? (
        <span role="status" className={`max-w-[320px] text-xs font-bold ${status.kind === "sent" ? "text-green-700" : "text-red-600"}`}>
          {status.text}
          <button type="button" onClick={() => setStatus(null)} aria-label="Dismiss" className="ml-1 text-slate-500 hover:text-black">×</button>
        </span>
      ) : null}
    </span>
  );
}
