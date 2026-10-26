import { useEffect, useMemo, useState } from "react";
import { MessageCircle } from "lucide-react";
import { getDataAuthHeaders, useData } from "../hooks/useData";
import type { BoardLineQcCheck, PrintingQcCheck, ProductionProcessing } from "../types";
import {
  buildQcScoreRows,
  buildQcScoreWhatsAppUrl,
  formatQcScorePercent,
} from "../lib/qcScore";

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function currentMonthRange(now = new Date()) {
  return {
    from: localDateKey(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: localDateKey(now),
  };
}

function displayDate(value: string) {
  return `${value.slice(8, 10)}-${value.slice(5, 7)}-${value.slice(0, 4)}`;
}

function scoreClass(value: number | null) {
  if (value == null) return "bg-slate-50 text-slate-500";
  if (value >= 100) return "bg-emerald-50 text-emerald-900";
  if (value >= 80) return "bg-amber-50 text-amber-900";
  return "bg-red-50 text-red-900";
}

const headerClass = "border-2 border-black bg-[#fff2cc] px-3 py-3 text-center text-xs font-black text-black align-middle whitespace-normal";
const cellClass = "border-2 border-black px-3 py-2 text-center text-sm font-semibold text-black align-middle";

export function QcScore() {
  const initialRange = useMemo(() => currentMonthRange(), []);
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [whatsappConfig, setWhatsappConfig] = useState<"checking" | "configured" | "missing" | "error">("checking");
  const [sendingDate, setSendingDate] = useState<string | null>(null);
  const [shareNotice, setShareNotice] = useState("");
  const [manualShareUrl, setManualShareUrl] = useState("");
  const [processing, , processingLoading] = useData<ProductionProcessing>("production_processing", []);
  const [boardlineChecks, , boardlineLoading] = useData<BoardLineQcCheck>("boardline_qc_checks", []);
  const [printingChecks, , printingLoading] = useData<PrintingQcCheck>("printing_qc_checks", []);
  const invalidRange = Boolean(fromDate && toDate && fromDate > toDate);
  const loading = processingLoading || boardlineLoading || printingLoading;

  const rows = useMemo(
    () => invalidRange ? [] : buildQcScoreRows({ fromDate, toDate, processing, boardlineChecks, printingChecks }),
    [boardlineChecks, fromDate, invalidRange, printingChecks, processing, toDate]
  );

  useEffect(() => {
    let cancelled = false;
    const checkConfig = async () => {
      try {
        const response = await fetch("/api/reports/qc-score/whatsapp-config", { headers: getDataAuthHeaders(false) });
        if (!response.ok) throw new Error("Could not check WhatsApp configuration.");
        const result = await response.json();
        if (!cancelled) setWhatsappConfig(result.configured ? "configured" : "missing");
      } catch {
        if (!cancelled) setWhatsappConfig("error");
      }
    };
    void checkConfig();
    const timer = window.setInterval(() => void checkConfig(), 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const resetRange = () => {
    const range = currentMonthRange();
    setFromDate(range.from);
    setToDate(range.to);
  };

  const shareOnWhatsApp = async (row: (typeof rows)[number]) => {
    setShareNotice("");
    setManualShareUrl("");
    if (whatsappConfig === "missing") {
      window.open(buildQcScoreWhatsAppUrl(row), "_blank", "noopener,noreferrer");
      return;
    }
    if (whatsappConfig !== "configured") {
      setShareNotice("Could not check the WhatsApp setup. Please try again shortly.");
      return;
    }
    setSendingDate(row.date);
    try {
      const response = await fetch("/api/reports/qc-score/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getDataAuthHeaders() },
        body: JSON.stringify({ date: row.date }),
      });
      const result = await response.json().catch(() => ({}));
      if (result.status === "Not Configured") {
        setWhatsappConfig("missing");
        setShareNotice("No active QC Score WhatsApp configuration was found. Open WhatsApp to share manually.");
        setManualShareUrl(buildQcScoreWhatsAppUrl(row));
      } else if (response.ok && result.status === "Sent") {
        setShareNotice(`QC Score for ${displayDate(row.date)} sent to the configured WhatsApp group.`);
      } else {
        setShareNotice(result.error || "QC Score WhatsApp message could not be sent.");
      }
    } catch {
      setShareNotice("QC Score WhatsApp message could not be sent.");
    } finally {
      setSendingDate(null);
    }
  };

  return (
    <div className="space-y-4 pb-8 text-black">
      <div className="border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight">QC Score</h2>
        <p className="mt-1 text-sm font-medium text-slate-600">Daily Boardline and Printing QC inspection score card</p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded border-2 border-black bg-white p-3">
        <label className="space-y-1">
          <span className="block text-xs font-black uppercase">From Date</span>
          <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="rounded border-2 border-black px-3 py-2 text-sm" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-black uppercase">To Date</span>
          <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="rounded border-2 border-black px-3 py-2 text-sm" />
        </label>
        <button type="button" onClick={resetRange} className="rounded border-2 border-black bg-white px-4 py-2 text-sm font-bold hover:bg-slate-50">
          Current Month
        </button>
        <div className="ml-auto text-sm font-bold text-slate-600">{rows.length} day{rows.length === 1 ? "" : "s"}</div>
      </div>

      {invalidRange ? <div role="alert" className="rounded border-2 border-red-700 bg-red-50 p-3 font-bold text-red-800">From Date cannot be after To Date.</div> : null}
      {shareNotice ? <div role="status" className="rounded border border-slate-300 bg-white p-3 font-semibold">{shareNotice}{manualShareUrl ? <a href={manualShareUrl} target="_blank" rel="noreferrer" className="ml-2 text-blue-700 underline">Open WhatsApp</a> : null}</div> : null}

      <div className="overflow-hidden rounded border-2 border-black bg-white">
        <div className="border-b-2 border-black bg-[#fff2cc] px-4 py-3 text-center text-sm font-black uppercase tracking-wide">
          QC Online Checking Score Card Report
        </div>
        <div className="max-h-[calc(100vh-260px)] overflow-auto">
          <table className="min-w-[2050px] w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className={`${headerClass} min-w-[115px]`}>Date</th>
                <th className={`${headerClass} min-w-[150px]`}>Total Checks Required with 0</th>
                <th className={`${headerClass} min-w-[180px]`}>Total No. of Boardline Checks Required</th>
                <th className={`${headerClass} min-w-[190px]`}>Total No. of Boardline Checks Performed</th>
                <th className={`${headerClass} min-w-[180px]`}>QC Person Assigned</th>
                <th className={`${headerClass} min-w-[175px]`}>Total Boardline QC Inspection Score</th>
                <th className={`${headerClass} min-w-[180px]`}>Total No. of Printing Checks Required</th>
                <th className={`${headerClass} min-w-[190px]`}>Total No. of Printing Checks Performed</th>
                <th className={`${headerClass} min-w-[180px]`}>QC Person Assigned</th>
                <th className={`${headerClass} min-w-[175px]`}>Total Printing QC Inspection Score</th>
                <th className={`${headerClass} min-w-[120px]`}>Total Score</th>
                <th className={`${headerClass} min-w-[150px]`}>WhatsApp Message</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} className="p-8 text-center font-bold">Loading QC score data...</td></tr>
              ) : rows.length ? rows.map((row) => (
                <tr key={row.date} className="odd:bg-white even:bg-slate-50 hover:bg-blue-50">
                  <td className={`${cellClass} whitespace-nowrap font-bold`}>{displayDate(row.date)}</td>
                  <td className={cellClass}>{row.totalChecksRequired}</td>
                  <td className={cellClass}>{row.boardlineChecksRequired}</td>
                  <td className={cellClass}>{row.boardlineChecksPerformed}</td>
                  <td className={`${cellClass} max-w-[240px] whitespace-normal break-words`}>{row.boardlineQcPeople.join(", ") || "-"}</td>
                  <td className={`${cellClass} ${scoreClass(row.boardlineScore)}`}>{formatQcScorePercent(row.boardlineScore)}</td>
                  <td className={cellClass}>{row.printingChecksRequired}</td>
                  <td className={cellClass}>{row.printingChecksPerformed}</td>
                  <td className={`${cellClass} max-w-[240px] whitespace-normal break-words`}>{row.printingQcPeople.join(", ") || "-"}</td>
                  <td className={`${cellClass} ${scoreClass(row.printingScore)}`}>{formatQcScorePercent(row.printingScore)}</td>
                  <td className={`${cellClass} ${scoreClass(row.totalScore)}`}>{formatQcScorePercent(row.totalScore)}</td>
                  <td className={cellClass}>
                    <button type="button" onClick={() => void shareOnWhatsApp(row)} disabled={Boolean(sendingDate) || whatsappConfig === "checking"} className="inline-flex items-center gap-2 rounded bg-[#128c7e] px-3 py-2 text-xs font-black text-white hover:bg-[#075e54] disabled:opacity-50" aria-label={`Share QC score for ${displayDate(row.date)} on WhatsApp`}>
                      <MessageCircle size={16} /> {sendingDate === row.date ? "Sending..." : "Share"}
                    </button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={12} className="p-8 text-center font-semibold">Select a valid date range to view the QC score.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
