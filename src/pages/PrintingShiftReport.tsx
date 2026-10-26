import { useEffect, useState } from "react";
import { getDataAuthHeaders } from "../hooks/useData";

type ShiftReport = {
  shiftDate: string;
  shift: "Day" | "Night";
  currentMessage: string;
  sentMessage: string | null;
  status: string;
  error: string | null;
  sentAt: string | null;
  dueAt: string;
};

function localDate(now: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function PrintingShiftReport() {
  const [from, setFrom] = useState(() => localDate(new Date(Date.now() - 6 * 86_400_000)));
  const [to, setTo] = useState(() => localDate(new Date()));
  const [rows, setRows] = useState<ShiftReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!from || !to || from > to) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/reports/printing-shift?from=${from}&to=${to}`, { headers: getDataAuthHeaders(false) });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Could not load reports.");
        const data = await response.json();
        if (!cancelled) { setRows(data); setError(""); }
      } catch (cause) {
        if (!cancelled) setError((cause as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [from, to]);

  return <div className="space-y-5 pb-8">
    <div className="border-b border-black pb-3"><h2 className="text-xl font-bold uppercase">Printing Shift Report</h2><p className="text-sm text-slate-600">Day and Night output with WhatsApp delivery status</p></div>
    <div className="flex flex-wrap gap-4 rounded border border-slate-300 bg-white p-4">
      <label className="text-sm font-semibold">From date <input className="ml-2 rounded border p-2" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label className="text-sm font-semibold">To date <input className="ml-2 rounded border p-2" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
    </div>
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-700">{error}</p>}
    {loading && !rows.length && <p>Loading Printing shift reports...</p>}
    <div className="grid gap-4">
      {rows.map((row) => <article key={`${row.shiftDate}-${row.shift}`} className="rounded border border-slate-300 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{row.shiftDate} · {row.shift} shift</h3><span className="rounded bg-slate-100 px-3 py-1 text-sm font-semibold">{row.status}</span></div>
        <p className="mb-2 text-xs text-slate-500">Scheduled: {new Date(row.dueAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}{row.sentAt ? ` · Sent: ${new Date(row.sentAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}` : ""}</p>
        {row.error && <p className="mb-2 text-sm text-amber-700">{row.error}</p>}
        <div className="grid gap-3 lg:grid-cols-2">
          <div><h4 className="mb-1 text-sm font-bold">Current figures</h4><pre className="whitespace-pre-wrap break-words rounded bg-slate-50 p-3 text-sm">{row.currentMessage}</pre></div>
          {row.sentMessage && <div><h4 className="mb-1 text-sm font-bold">Message sent</h4><pre className="whitespace-pre-wrap break-words rounded bg-emerald-50 p-3 text-sm">{row.sentMessage}</pre></div>}
        </div>
      </article>)}
    </div>
  </div>;
}
