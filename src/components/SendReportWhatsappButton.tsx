import { useState } from "react";
import { friendlyWhatsappError } from "../lib/whatsappErrorText";
import { MessageCircle } from "lucide-react";
import { getDataAuthHeaders } from "../hooks/useData";
import { buildReportPdf, type ReportPdfSpec, type WhatsappReportKey } from "../lib/reports/whatsappReports";

type Status = { kind: "sending" | "sent" | "failed"; text: string } | null;

/**
 * "WhatsApp" button on Production Plan / Dispatch Plan / Pending Loading:
 * sends the PDF of what is on screen (same PDF as Download) to the group set
 * for that page in WhatsApp Master.
 */
export function SendReportWhatsappButton({ report, buildSpec, disabled }: { report: WhatsappReportKey; buildSpec: () => ReportPdfSpec | null; disabled?: boolean }) {
  const [status, setStatus] = useState<Status>(null);
  const send = async () => {
    const spec = buildSpec();
    if (!spec || status?.kind === "sending") return;
    if (!window.confirm(`Send ${spec.title} (${spec.subtitle}) on WhatsApp?`)) return;
    setStatus({ kind: "sending", text: "Sending…" });
    try {
      const pdf = buildReportPdf(spec).output("datauristring");
      const response = await fetch(`/api/whatsapp-reports/${report}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getDataAuthHeaders() },
        body: JSON.stringify({ pdf, fileName: spec.fileName, values: spec.values, label: spec.subtitle }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.status === "Sent") setStatus({ kind: "sent", text: "Sent on WhatsApp" });
      else setStatus({ kind: "failed", text: result.status === "Not Configured" ? String(result.error || "") : friendlyWhatsappError(result.error, spec.title) });
    } catch {
      setStatus({ kind: "failed", text: "WhatsApp message could not be sent." });
    }
  };
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => void send()}
        disabled={disabled || status?.kind === "sending"}
        title="Send PDF on WhatsApp"
        className="inline-flex items-center gap-2 rounded border border-green-700 px-3 py-1.5 text-sm font-bold uppercase tracking-tight text-green-700 transition-colors hover:bg-green-50 disabled:opacity-40"
      >
        <MessageCircle size={16} />
        <span>{status?.kind === "sending" ? "Sending…" : "WhatsApp"}</span>
      </button>
      {status && status.kind !== "sending" ? (
        <span role="status" className={`max-w-[320px] text-xs font-bold ${status.kind === "sent" ? "text-green-700" : "text-red-600"}`}>
          {status.text}
          <button type="button" onClick={() => setStatus(null)} aria-label="Dismiss" className="ml-1 text-slate-500 hover:text-black">×</button>
        </span>
      ) : null}
    </span>
  );
}
