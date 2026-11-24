import React, { useMemo, useState } from "react";
import { useData } from "../hooks/useData";
import { useAuth } from "../auth/AuthContext";
import { useQtyAtJobWorker } from "../hooks/useQtyAtJobWorker";
import type { Company, DispatchPlan, Firm, LoadingSlip, LoadingSlipJobConfirmation, Order, ProductionProcessing } from "../types";
import { getFirmDisplayNameById } from "../lib/firmDisplay";
import { normalizeMachineName } from "../lib/productionMachineNames";
import { formatDate } from "../lib/serial";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import {
  LOADING_WASTAGE_CONFIRMATION_FIRST_DATE,
  loadedAndWastageByJob,
  parseJobConfirmations,
  pendingFgTickText,
  printingByJob,
  slipAwaitsWastageConfirmation,
  slipJobWastage,
  unconfirmedSlipJobs,
  wastageTickText,
} from "../lib/loadingWastageConfirmation";

/**
 * Pending Loading Wastage (Loading and Billing menus): loading slips from
 * 17-Nov-2026 whose FG jobs still need the two ticks — loading wastage and
 * Pending FG. A job can be confirmed only once its Printing is Complete;
 * until then its wastage can be adjusted. A slip reaches Pending Invoicing
 * when all its jobs are confirmed.
 */

type Row = {
  key: string;
  slip: LoadingSlip;
  jobId: string;
  jobNo: string;
  loadedOnSlip: number;
  companyName: string;
  firmName: string;
  daysWaiting: number;
  printed: number;
  printingComplete: boolean;
  loadedAll: number;
  otherWastage: number;
  savedWastage: number;
  atJobWorker: number;
  /** Pending FG before this slip's wastage: printed − loaded − other wastage − at job worker. */
  baseFg: number;
};

const lower = (value: unknown) => String(value ?? "").trim().toLowerCase();
const todayKey = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 864e5));

export function PendingLoadingWastage() {
  const { user } = useAuth();
  const userName = String(user?.name || "User").trim();
  const [loadingSlips, setLoadingSlips] = useData<LoadingSlip>("loading_slips", [], { firmScope: "all", storageKey: "loading-slips-all-firms" });
  const [processing] = useData<ProductionProcessing>("production_processing", [], { firmScope: "all", storageKey: "production-processing-all-firms", fields: ["id", "productionId", "machineName", "qty", "completionStatus"] });
  const [plans] = useData<DispatchPlan>("dispatch_plans", [], { firmScope: "all", storageKey: "dispatch-plans-all-firms" });
  const [orders] = useData<Order>("orders", [], { firmScope: "all", storageKey: "orders-all-firms" });
  const [companies] = useData<Company>("companies", [], { firmScope: "all", storageKey: "companies-all-firms" });
  const [firms] = useData<Firm>("firms", [], { firmScope: "all", storageKey: "firms-all" });
  const atJobWorkerByJobId = useQtyAtJobWorker();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "ready" | "waiting">("");
  const [wastageDraft, setWastageDraft] = useState<Record<string, string>>({});
  const [ticks, setTicks] = useState<Record<string, { wastage?: string; pendingFg?: string }>>({});
  const [savingKey, setSavingKey] = useState("");
  const [message, setMessage] = useState("");

  const printing = useMemo(() => printingByJob(processing, normalizeMachineName), [processing]);
  const totals = useMemo(() => loadedAndWastageByJob(loadingSlips), [loadingSlips]);

  const rows = useMemo<Row[]>(() => {
    const planById = new Map(plans.map((plan) => [String(plan.id), plan]));
    const orderById = new Map(orders.map((order) => [String(order.id), order]));
    const companyById = new Map(companies.map((company) => [String(company.id), company]));
    const today = todayKey();
    return loadingSlips
      .filter((slip) => slipAwaitsWastageConfirmation(slip))
      .flatMap((slip) => {
        const firstLine: any = slip.lines?.[0];
        const plan = planById.get(String(firstLine?.dispatchPlanId || ""));
        const order = orderById.get(String(plan?.orderId || ""));
        const companyName = companyById.get(String(order?.companyId || slip.companyId || firstLine?.companyId || ""))?.name || slip.companyName || firstLine?.companyName || "";
        const firmName = getFirmDisplayNameById(String(order?.firmId || slip.orderFirmId || slip.firmId || ""), firms);
        return unconfirmedSlipJobs(slip).map((job) => {
          const jobKey = lower(job.jobId);
          const savedWastage = slipJobWastage(slip, job.jobId);
          const printed = printing.printed.get(String(job.jobId).trim()) || 0;
          const loadedAll = totals.loaded.get(jobKey) || 0;
          const otherWastage = (totals.wastage.get(jobKey) || 0) - savedWastage;
          const atJobWorker = atJobWorkerByJobId.get(String(job.jobId).trim()) || 0;
          return {
            key: `${slip.id}::${job.jobId}`,
            slip,
            jobId: job.jobId,
            jobNo: job.jobNo,
            loadedOnSlip: job.loadedQty,
            companyName,
            firmName,
            daysWaiting: daysBetween(String(slip.date || today).slice(0, 10), today),
            printed,
            printingComplete: printing.complete.has(String(job.jobId).trim()),
            loadedAll,
            otherWastage,
            savedWastage,
            atJobWorker,
            baseFg: printed - loadedAll - otherWastage - atJobWorker,
          };
        });
      })
      .sort((a, b) => b.daysWaiting - a.daysWaiting || String(a.slip.slipNo).localeCompare(String(b.slip.slipNo), undefined, { numeric: true }));
  }, [atJobWorkerByJobId, companies, firms, loadingSlips, orders, plans, printing, totals]);

  const filteredRows = useMemo(() => {
    const words = searchWords(searchTerm);
    return rows.filter((row) => {
      if (statusFilter === "ready" && !row.printingComplete) return false;
      if (statusFilter === "waiting" && row.printingComplete) return false;
      return matchesTableSearch([row.slip.slipNo, formatDate(row.slip.date), row.companyName, row.firmName, row.jobNo], words);
    });
  }, [rows, searchTerm, statusFilter]);

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
      const now = new Date().toISOString();
      await setLoadingSlips((prev) => prev.map((slip) => {
        if (slip.id !== row.slip.id) return slip;
        const otherRows = (slip.jobWastage || []).filter((entry) => lower(entry.jobId) !== lower(row.jobId));
        const jobWastage = wastage > 0 ? [...otherRows, { jobId: row.jobId, jobNo: row.jobNo, qty: wastage }] : otherRows;
        const confirmations = parseJobConfirmations(slip).filter((entry) => lower(entry.jobId) !== lower(row.jobId));
        const existing = parseJobConfirmations(slip).find((entry) => lower(entry.jobId) === lower(row.jobId));
        const next: LoadingSlipJobConfirmation = {
          jobId: row.jobId,
          jobNo: row.jobNo,
          printingCompleteAtLoading: existing?.printingCompleteAtLoading ?? false,
          ...(confirm ? { wastage, pendingFg, confirmedBy: userName, confirmedById: String(user?.id || ""), confirmedAt: now } : {}),
        };
        return { ...slip, jobWastage, jobConfirmations: [...confirmations, next] };
      }));
      setWastageDraft((prev) => { const copy = { ...prev }; delete copy[row.key]; return copy; });
      setTicks((prev) => { const copy = { ...prev }; delete copy[row.key]; return copy; });
      setMessage(confirm ? `${row.slip.slipNo} · ${row.jobNo} confirmed.` : `${row.slip.slipNo} · ${row.jobNo}: wastage saved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save.");
    } finally {
      setSavingKey("");
    }
  };

  const readyCount = rows.filter((row) => row.printingComplete).length;
  const TH = "px-3 py-2 text-left text-[11px] font-black uppercase tracking-wider border border-black whitespace-nowrap";
  const TD = "px-3 py-2 text-xs border border-black align-top";

  return (
    <div className="space-y-4 pb-8">
      <div className="border-b-2 border-black pb-3">
        <h2 className="text-xl font-black uppercase">Pending Loading Wastage</h2>
        <p className="mt-1 text-xs font-semibold text-slate-600">
          Loading slips from {formatDate(LOADING_WASTAGE_CONFIRMATION_FIRST_DATE)} whose jobs still need the loading wastage and Pending FG confirmation. A job can be confirmed once its Printing is Complete; the slip then moves to Pending Invoicing.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded border-2 border-black bg-white p-3">
        <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search slip, company, job…" className="min-w-[260px] flex-1 rounded border-2 border-black px-3 py-2 text-sm" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="rounded border-2 border-black px-3 py-2 text-sm">
          <option value="">All ({rows.length})</option>
          <option value="ready">Ready to confirm ({readyCount})</option>
          <option value="waiting">Waiting for Printing Complete ({rows.length - readyCount})</option>
        </select>
      </div>

      {message ? <div className="rounded border-2 border-black bg-amber-50 px-3 py-2 text-sm font-bold">{message}</div> : null}

      <div className="overflow-x-auto rounded border-2 border-black bg-white">
        <table className="min-w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-indigo-700 text-white">
            <tr>
              <th className={TH}>Slip No</th><th className={TH}>Date</th><th className={`${TH} text-right`}>Days</th><th className={TH}>Company</th><th className={TH}>Firm</th><th className={TH}>Job No</th>
              <th className={`${TH} text-right`}>Loaded (slip)</th><th className={`${TH} text-right`}>Printed</th><th className={`${TH} text-right`}>Loaded so far</th><th className={`${TH} text-right`}>Other wastage</th><th className={`${TH} text-right`}>At Job Worker</th>
              <th className={`${TH} text-right`}>Loading Wastage</th><th className={`${TH} text-right`}>Pending FG</th><th className={TH}>Confirm</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr><td colSpan={14} className="p-8 text-center text-sm font-semibold text-slate-500">Nothing pending.</td></tr>
            ) : filteredRows.map((row) => {
              const raw = draftOf(row);
              const wastage = raw.trim() === "" ? 0 : Number(raw) || 0;
              const pendingFg = row.baseFg - wastage;
              const sig = `${wastage}`;
              const given = ticks[row.key] || {};
              const flagged = row.printingComplete && row.baseFg < 0;
              const canConfirm = row.printingComplete && !flagged && raw.trim() !== "" && pendingFg >= 0 && given.wastage === sig && given.pendingFg === sig;
              const changed = raw.trim() !== (row.savedWastage > 0 ? String(row.savedWastage) : "");
              const setTick = (field: "wastage" | "pendingFg", on: boolean) => setTicks((prev) => ({ ...prev, [row.key]: { ...(prev[row.key] || {}), [field]: on ? sig : undefined } }));
              return (
                <tr key={row.key} className={flagged ? "bg-red-50" : row.printingComplete ? "bg-white" : "bg-slate-50"}>
                  <td className={`${TD} font-black whitespace-nowrap`}>{row.slip.slipNo}</td>
                  <td className={`${TD} whitespace-nowrap`}>{formatDate(row.slip.date)}</td>
                  <td className={`${TD} text-right font-bold ${row.daysWaiting > 3 ? "text-red-700" : ""}`}>{row.daysWaiting}</td>
                  <td className={TD}>{row.companyName || "-"}</td>
                  <td className={`${TD} whitespace-nowrap`}>{row.firmName}</td>
                  <td className={`${TD} font-bold whitespace-nowrap`}>{row.jobNo}</td>
                  <td className={`${TD} text-right`}>{row.loadedOnSlip.toLocaleString()}</td>
                  <td className={`${TD} text-right`}>{row.printed.toLocaleString()}{row.printingComplete ? <div className="text-[10px] font-black text-indigo-700">Printing Complete</div> : <div className="text-[10px] font-black text-amber-700">In Progress</div>}</td>
                  <td className={`${TD} text-right`}>{row.loadedAll.toLocaleString()}</td>
                  <td className={`${TD} text-right`}>{row.otherWastage.toLocaleString()}</td>
                  <td className={`${TD} text-right`}>{row.atJobWorker.toLocaleString()}</td>
                  <td className={`${TD} text-right`}>
                    <input type="number" min={0} value={raw} onChange={(e) => setWastageDraft((prev) => ({ ...prev, [row.key]: e.target.value }))} className="h-8 w-24 rounded border-2 border-amber-400 bg-amber-50 px-2 text-right text-xs font-black" />
                    {changed ? <button type="button" disabled={savingKey === row.key} onClick={() => void saveRow(row, false)} className="mt-1 block w-full rounded border border-black px-2 py-0.5 text-[10px] font-bold uppercase hover:bg-slate-100 disabled:opacity-50">Save wastage</button> : null}
                  </td>
                  <td className={`${TD} text-right text-sm font-black ${pendingFg < 0 ? "text-red-700" : ""}`}>{pendingFg.toLocaleString()}</td>
                  <td className={`${TD} min-w-[320px]`}>
                    {!row.printingComplete ? (
                      <div className="font-bold text-amber-700">Waiting for Printing Complete</div>
                    ) : flagged ? (
                      <div className="font-bold text-red-700">Pending FG is already below 0 before this slip's wastage. Admin to check the job's production / loading entries.</div>
                    ) : raw.trim() === "" ? (
                      <div className="font-bold text-red-700">Enter Loading Wastage (0 if none).</div>
                    ) : (
                      <div className="space-y-1">
                        <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5" checked={given.wastage === sig} onChange={(e) => setTick("wastage", e.target.checked)} />{wastageTickText(userName, row.jobNo, wastage)}</label>
                        <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5" disabled={pendingFg < 0} checked={given.pendingFg === sig} onChange={(e) => setTick("pendingFg", e.target.checked)} />{pendingFgTickText(userName, row.jobNo, pendingFg)}</label>
                        <button type="button" disabled={!canConfirm || savingKey === row.key} onClick={() => void saveRow(row, true)} className="mt-1 rounded bg-emerald-600 px-3 py-1 text-[11px] font-black uppercase text-white disabled:opacity-40">{savingKey === row.key ? "Saving…" : "Confirm"}</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
