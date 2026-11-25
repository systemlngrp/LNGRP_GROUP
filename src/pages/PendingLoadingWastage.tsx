import React, { useMemo, useState } from "react";
import { getDataAuthHeaders, useData } from "../hooks/useData";
import { useServerReport } from "../hooks/useServerReport";
import { useAuth } from "../auth/AuthContext";
import { useQtyAtJobWorker } from "../hooks/useQtyAtJobWorker";
import type { Firm } from "../types";
import { orderedFirmTabs } from "../components/FirmTabs";
import { formatDate } from "../lib/serial";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import {
  LOADING_WASTAGE_CONFIRMATION_FIRST_DATE,
  pendingFgTickText,
  wastageTickText,
  type PendingLoadingWastageRow,
} from "../lib/loadingWastageConfirmation";

/**
 * Pending Loading Wastage (Loading and Billing menus): loading slips from
 * 17-Nov-2026 whose FG jobs still need the two ticks — loading wastage and
 * Pending FG. A job can be confirmed only once its Printing is Complete;
 * until then its wastage can be adjusted. A slip reaches Pending Invoicing
 * when all its jobs are confirmed.
 */

type Row = PendingLoadingWastageRow & {
  daysWaiting: number;
  atJobWorker: number;
  /** Pending FG before this slip's wastage: printed − loaded − other wastage − at job worker. */
  baseFg: number;
};

const todayKey = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 864e5));

export function PendingLoadingWastage() {
  const { user } = useAuth();
  const userName = String(user?.name || "User").trim();
  // Worked out on the server from its cached tables: only the waiting jobs come to the browser.
  const { result, loading, failed } = useServerReport<PendingLoadingWastageRow[]>(
    "pending-loading-wastage",
    {},
    ["loading_slips", "production_processing", "dispatch_plans", "orders", "companies", "firms"],
  );
  const [firms] = useData<Firm>("firms", [], { firmScope: "all", storageKey: "firms-all" });
  const atJobWorkerByJobId = useQtyAtJobWorker();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "ready" | "waiting">("");
  const [firmTab, setFirmTab] = useState("");
  const [wastageDraft, setWastageDraft] = useState<Record<string, string>>({});
  const [ticks, setTicks] = useState<Record<string, { wastage?: string; pendingFg?: string }>>({});
  const [savingKey, setSavingKey] = useState("");
  const [message, setMessage] = useState("");
  const [dialogKey, setDialogKey] = useState("");
  // Confirmed in this session: hidden at once, before the server list refreshes.
  const [doneKeys, setDoneKeys] = useState<Set<string>>(new Set());

  const rows = useMemo<Row[]>(() => {
    const today = todayKey();
    return (result || [])
      .filter((row) => !doneKeys.has(row.key))
      .map((row) => {
        const atJobWorker = atJobWorkerByJobId.get(String(row.jobId).trim()) || 0;
        return {
          ...row,
          atJobWorker,
          daysWaiting: daysBetween(row.date || today, today),
          baseFg: row.printed - row.loadedAll - row.otherWastage - atJobWorker,
        };
      })
      .sort((a, b) => b.daysWaiting - a.daysWaiting || a.slipNo.localeCompare(b.slipNo, undefined, { numeric: true }));
  }, [atJobWorkerByJobId, doneKeys, result]);

  // One tab per firm that has slips under the rule (Unit-II, LNKI), Unit-II first.
  const firmTabs = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((row) => counts.set(row.firmId, (counts.get(row.firmId) || 0) + 1));
    return orderedFirmTabs(firms.filter((firm) => counts.has(String(firm.id)) || /UNIT[\s-]*(II|2)\b|LNKI/i.test(`${firm.firmName} ${firm.shortName || ""}`)))
      .filter((tab) => tab.label !== "UNIT 1")
      .map((tab) => ({ ...tab, count: counts.get(tab.id) || 0 }));
  }, [firms, rows]);
  const activeFirmId = firmTab || firmTabs[0]?.id || "";

  const filteredRows = useMemo(() => {
    const words = searchWords(searchTerm);
    return rows.filter((row) => {
      if (activeFirmId && row.firmId !== activeFirmId) return false;
      if (statusFilter === "ready" && !row.printingComplete) return false;
      if (statusFilter === "waiting" && row.printingComplete) return false;
      return matchesTableSearch([row.slipNo, formatDate(row.date), row.companyName, row.firmName, row.jobNo, row.erpCode, row.itemName], words);
    });
  }, [activeFirmId, rows, searchTerm, statusFilter]);

  const draftOf = (row: Row) => (wastageDraft[row.key] ?? (row.savedWastage > 0 ? String(row.savedWastage) : ""));

  const saveRow = async (row: Row, confirm: boolean) => {
    const raw = draftOf(row).trim();
    const wastage = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(wastage) || wastage < 0) { setMessage(`${row.jobNo}: loading wastage must be 0 or more.`); return; }
    const pendingFg = row.baseFg - wastage;
    if (pendingFg < 0) { setMessage(`${row.jobNo}: wastage ${wastage.toLocaleString()} would make Pending FG negative (${pendingFg.toLocaleString()}).`); return; }
    if (confirm) {
      if (!row.printingComplete) { setMessage(`${row.jobNo}: confirm after Printing is Complete.`); return; }
      if (raw === "") { setMessage(`${row.jobNo}: enter Loading Wastage (0 if none).`); return; }
      const sig = `${wastage}`;
      const given = ticks[row.key] || {};
      if (given.wastage !== sig || given.pendingFg !== sig) { setMessage(`${row.jobNo}: tick both confirmations.`); return; }
    }
    setSavingKey(row.key);
    setMessage("");
    try {
      const response = await fetch(`/api/loading-slips/${encodeURIComponent(row.slipId)}/wastage-confirmation`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getDataAuthHeaders(true) },
        body: JSON.stringify({ jobId: row.jobId, jobNo: row.jobNo, wastage, confirm, pendingFg }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Save failed (${response.status})`);
      if (confirm) setDoneKeys((prev) => new Set(prev).add(row.key));
      setWastageDraft((prev) => { const copy = { ...prev }; delete copy[row.key]; return copy; });
      setTicks((prev) => { const copy = { ...prev }; delete copy[row.key]; return copy; });
      setMessage(confirm ? `${row.slipNo} · ${row.jobNo} confirmed.` : `${row.slipNo} · ${row.jobNo}: wastage saved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save.");
    } finally {
      setSavingKey("");
    }
  };

  const firmRows = rows.filter((row) => !activeFirmId || row.firmId === activeFirmId);
  const readyCount = firmRows.filter((row) => row.printingComplete).length;
  const dialogRow = dialogKey ? rows.find((row) => row.key === dialogKey) : undefined;
  const TH = "px-2 py-2 text-[10px] font-black uppercase tracking-wide border border-black whitespace-nowrap";
  const TD = "px-2 py-1.5 text-xs border border-black";
  const num = (value: number) => value.toLocaleString();

  return (
    <div className="space-y-4 pb-8">
      <div className="border-b-2 border-black pb-3">
        <h2 className="text-xl font-black uppercase">Pending Loading Wastage</h2>
        <p className="mt-1 text-xs font-semibold text-slate-600">
          Loading slips from {formatDate(LOADING_WASTAGE_CONFIRMATION_FIRST_DATE)} whose jobs still need the loading wastage and Pending FG confirmation. A job can be confirmed once its Printing is Complete; the slip then moves to Pending Invoicing.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded border-2 border-black bg-white p-3">
        <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search slip, company, job, ERP, item…" className="min-w-[260px] flex-1 rounded border-2 border-black px-3 py-2 text-sm" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="rounded border-2 border-black px-3 py-2 text-sm">
          <option value="">All ({firmRows.length})</option>
          <option value="ready">Ready to confirm ({readyCount})</option>
          <option value="waiting">Waiting for Printing Complete ({firmRows.length - readyCount})</option>
        </select>
      </div>

      {message ? <div className="rounded border-2 border-black bg-amber-50 px-3 py-2 text-sm font-bold">{message}</div> : null}

      <div className="flex flex-wrap gap-1 border-b-2 border-black" role="tablist">
        {firmTabs.map((tab) => {
          const active = tab.id === activeFirmId;
          return (
            <button key={tab.id} type="button" title={tab.name} onClick={() => setFirmTab(tab.id)} className={`rounded-t border-2 border-b-0 border-black px-4 py-2 text-sm font-black uppercase tracking-wide ${active ? "bg-indigo-700 text-white" : "bg-white text-black hover:bg-indigo-50"}`}>
              {tab.label} <span className={`ml-1 rounded px-1.5 py-0.5 text-xs ${active ? "bg-white text-indigo-700" : "bg-slate-200 text-black"}`}>{tab.count.toLocaleString()}</span>
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded border-2 border-black bg-white">
        <table className="min-w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-indigo-700 text-white">
            <tr>
              <th className={`${TH} text-left`}>Slip No / Date</th>
              <th className={`${TH} text-right`}>Days</th>
              <th className={`${TH} text-left`}>Company / Firm</th>
              <th className={`${TH} text-left`}>Job No</th>
              <th className={`${TH} text-left`}>ERP</th>
              <th className={`${TH} text-left`}>Item Name</th>
              <th className={`${TH} text-right`}>Loaded (slip)</th>
              <th className={`${TH} text-right`}>Printed</th>
              <th className={`${TH} text-right`}>Loaded so far</th>
              <th className={`${TH} text-right`}>Other wastage</th>
              <th className={`${TH} text-right`}>At job worker</th>
              <th className={`${TH} text-right`}>Loading wastage</th>
              <th className={`${TH} text-right`}>Pending FG</th>
              <th className={`${TH} text-center`}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr><td colSpan={14} className="p-8 text-center text-sm font-semibold text-slate-500">{failed ? "Could not load the list from the server. Refresh the page to try again." : loading && !result ? "Loading…" : "Nothing pending."}</td></tr>
            ) : filteredRows.map((row) => {
              const raw = draftOf(row);
              const wastage = raw.trim() === "" ? 0 : Number(raw) || 0;
              const pendingFg = row.baseFg - wastage;
              const flagged = row.printingComplete && row.baseFg < 0;
              const changed = raw.trim() !== (row.savedWastage > 0 ? String(row.savedWastage) : "");
              return (
                <tr key={row.key} className={flagged ? "bg-red-50" : row.printingComplete ? "bg-white" : "bg-slate-50"}>
                  <td className={`${TD} whitespace-nowrap`}><div className="font-black">{row.slipNo}</div><div className="text-[11px] text-slate-600">{formatDate(row.date)}</div></td>
                  <td className={`${TD} text-right font-bold ${row.daysWaiting > 3 ? "text-red-700" : ""}`}>{row.daysWaiting}</td>
                  <td className={`${TD} max-w-[220px]`}><div className="font-semibold leading-tight">{row.companyName || "-"}</div><div className="text-[11px] text-slate-600">{row.firmName}</div></td>
                  <td className={`${TD} whitespace-nowrap font-bold`}>{row.jobNo}</td>
                  <td className={`${TD} whitespace-nowrap`}>{row.erpCode || "-"}</td>
                  <td className={`${TD} min-w-[200px] max-w-[260px] leading-tight`}>{row.itemName || "-"}</td>
                  <td className={`${TD} text-right`}>{num(row.loadedOnSlip)}</td>
                  <td className={`${TD} text-right whitespace-nowrap`}>{num(row.printed)}<div className={`text-[10px] font-black ${row.printingComplete ? "text-indigo-700" : "text-amber-700"}`}>{row.printingComplete ? "Complete" : "In Progress"}</div></td>
                  <td className={`${TD} text-right`}>{num(row.loadedAll)}</td>
                  <td className={`${TD} text-right text-slate-600`}>{num(row.otherWastage)}</td>
                  <td className={`${TD} text-right text-slate-600`}>{num(row.atJobWorker)}</td>
                  <td className={`${TD} text-right`}>
                    <input type="number" min={0} value={raw} placeholder="0" onChange={(e) => setWastageDraft((prev) => ({ ...prev, [row.key]: e.target.value }))} className="h-8 w-20 rounded border-2 border-amber-400 bg-amber-50 px-2 text-right text-xs font-black" />
                  </td>
                  <td className={`${TD} text-right text-sm font-black ${pendingFg < 0 ? "text-red-700" : ""}`}>{num(pendingFg)}</td>
                  <td className={`${TD} w-[150px] text-center`}>
                    {flagged ? (
                      <span className="text-[11px] font-bold text-red-700" title="Pending FG is below 0 before this slip's wastage: check the job's production and loading entries.">Admin to check</span>
                    ) : row.printingComplete ? (
                      <button type="button" disabled={raw.trim() === "" || pendingFg < 0} onClick={() => { setMessage(""); setDialogKey(row.key); }} className="rounded bg-emerald-600 px-3 py-1 text-[11px] font-black uppercase text-white disabled:opacity-40" title={raw.trim() === "" ? "Enter loading wastage (0 if none) first" : "Confirm wastage and Pending FG"}>Confirm</button>
                    ) : changed ? (
                      <button type="button" disabled={savingKey === row.key} onClick={() => void saveRow(row, false)} className="rounded border border-black px-2 py-1 text-[11px] font-bold uppercase hover:bg-slate-100 disabled:opacity-50">Save wastage</button>
                    ) : (
                      <span className="text-[11px] font-bold text-amber-700">Waiting for Printing</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {dialogRow ? (() => {
        const raw = draftOf(dialogRow);
        const wastage = raw.trim() === "" ? 0 : Number(raw) || 0;
        const pendingFg = dialogRow.baseFg - wastage;
        const sig = `${wastage}`;
        const given = ticks[dialogRow.key] || {};
        const setTick = (field: "wastage" | "pendingFg", on: boolean) => setTicks((prev) => ({ ...prev, [dialogRow.key]: { ...(prev[dialogRow.key] || {}), [field]: on ? sig : undefined } }));
        const ready = given.wastage === sig && given.pendingFg === sig;
        const close = () => { setDialogKey(""); setTicks((prev) => { const copy = { ...prev }; delete copy[dialogRow.key]; return copy; }); };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded border-2 border-black bg-white p-5 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
              <div className="mb-3 border-b-2 border-black pb-2 text-sm font-black uppercase">Confirm loading wastage</div>
              <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-slate-600">Slip</span><span className="font-bold">{dialogRow.slipNo}</span>
                <span className="text-slate-600">Job</span><span className="font-bold">{dialogRow.jobNo}</span>
                <span className="text-slate-600">Item</span><span className="font-bold">{dialogRow.erpCode ? `${dialogRow.erpCode} · ` : ""}{dialogRow.itemName || "-"}</span>
                <span className="text-slate-600">Company</span><span className="font-bold">{dialogRow.companyName || "-"}</span>
                <span className="text-slate-600">Loading wastage</span><span className="font-bold">{num(wastage)}</span>
                <span className="text-slate-600">Pending FG</span><span className="font-black">{num(pendingFg)}</span>
              </div>
              <div className="space-y-2 text-sm">
                <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={given.wastage === sig} onChange={(e) => setTick("wastage", e.target.checked)} /><span>{wastageTickText(userName, dialogRow.jobNo, wastage)}</span></label>
                <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={given.pendingFg === sig} onChange={(e) => setTick("pendingFg", e.target.checked)} /><span>{pendingFgTickText(userName, dialogRow.jobNo, pendingFg)}</span></label>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={close} className="rounded border-2 border-black px-4 py-1.5 text-xs font-bold uppercase">Cancel</button>
                <button type="button" disabled={!ready || savingKey === dialogRow.key} onClick={async () => { await saveRow(dialogRow, true); setDialogKey(""); }} className="rounded bg-emerald-600 px-4 py-1.5 text-xs font-black uppercase text-white disabled:opacity-40">{savingKey === dialogRow.key ? "Saving…" : "Confirm"}</button>
              </div>
            </div>
          </div>
        );
      })() : null}
    </div>
  );
}
