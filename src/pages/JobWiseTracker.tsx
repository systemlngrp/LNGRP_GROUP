import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download, Pencil } from "lucide-react";
import { getDataAuthHeaders, useData } from "../hooks/useData";
import { useAuth } from "../auth/AuthContext";
import { useNpdItemsWithoutStock } from "../hooks/useNpdItems";
import type { Company, Firm, LoadingSlip, Order, OrderSchedule, Production, ProductionProcessing } from "../types";
import { normalizeMachineName } from "../lib/productionMachineNames";
import { getLoadingJobNumber } from "../lib/pendingLoadingEligibility";
import { formatDate } from "../lib/serial";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";

const LoadingMasterFocus = React.lazy(() => import("./LoadingMaster").then((module) => ({ default: module.LoadingMaster })));

type CorrectionField = "Corrugation" | "Printed" | "Loaded" | "Loading Wastage";

/**
 * Job Wise Tracker: for each FG job, what was corrugated, printed, loaded,
 * invoiced and wasted at loading, and the balance still with the job.
 * Balance = Printed − Loaded − Loading Wastage.
 */

const FIRST_DATE = "2026-11-17";
const TH = "border border-black px-3 py-2 text-[11px] font-black uppercase";
const TD = "border border-black px-3 py-2 text-xs";

type Row = {
  jobId: string;
  jobNo: string;
  date: string;
  status: string;
  firmId: string;
  firmName: string;
  companyName: string;
  itemName: string;
  plannedQty: number;
  corrugation: number;
  printed: number;
  printingComplete: boolean;
  loaded: number;
  invoiced: number;
  loadingWastage: number;
  balance: number;
};

const num = (value: number) => (value ? value.toLocaleString() : "0");
const isCancelledSlip = (slip: LoadingSlip) => ["cancelled", "canceled"].includes(String(slip.status || "").trim().toLowerCase());

export function JobWiseTracker() {
  const [productions] = useData<Production>("productions", [], { firmScope: "all" });
  const [processing] = useData<ProductionProcessing>("production_processing", [], {
    firmScope: "all",
    storageKey: "production-processing-all-firms",
    fields: ["id", "productionId", "machineName", "qty", "completionStatus"],
  });
  const [loadingSlips] = useData<LoadingSlip>("loading_slips", [], { firmScope: "all", storageKey: "loading-slips-all-firms" });
  const [schedules] = useData<OrderSchedule>("orders_schedule", [], { firmScope: "all" });
  const [orders] = useData<Order>("orders", [], { firmScope: "all", storageKey: "orders-all-firms" });
  const [companies] = useData<Company>("companies", []);
  const [firms] = useData<Firm>("firms", [], { firmScope: "all", storageKey: "firms-all" });
  const npdItems = useNpdItemsWithoutStock();

  const [searchTerm, setSearchTerm] = useState("");
  const [firmFilter, setFirmFilter] = useState("");
  const [fromDate, setFromDate] = useState(FIRST_DATE);
  const [toDate, setToDate] = useState("");
  const [view, setView] = useState<"open" | "negative" | "all">("open");
  const [loadFilter, setLoadFilter] = useState<"" | "loaded" | "notLoaded">("");
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";
  const [correction, setCorrection] = useState<{ row: Row; field: CorrectionField } | null>(null);

  const rows = useMemo<Row[]>(() => {
    const corrugation = new Map<string, number>();
    const printed = new Map<string, number>();
    const printingComplete = new Set<string>();
    processing.forEach((entry) => {
      const jobId = String(entry.productionId || "").trim();
      if (!jobId) return;
      const machine = normalizeMachineName(entry.machineName);
      const qty = Number(entry.qty) || 0;
      if (machine === "Corrugation Liner") corrugation.set(jobId, (corrugation.get(jobId) || 0) + qty);
      if (machine === "Printing") {
        printed.set(jobId, (printed.get(jobId) || 0) + qty);
        const status = String(entry.completionStatus || "").trim().toLowerCase();
        if (!status || status === "full") printingComplete.add(jobId);
      }
    });

    const loaded = new Map<string, number>();
    const invoiced = new Map<string, number>();
    const wastage = new Map<string, number>();
    loadingSlips.forEach((slip) => {
      if (isCancelledSlip(slip)) return;
      const isInvoiced = Boolean(String(slip.invoiceId || "").trim());
      (slip.lines || []).forEach((line) => (line.allocations || []).forEach((allocation: any) => {
        if (String(allocation?.sourceType || "").trim().toLowerCase() !== "job") return;
        const jobId = String(allocation?.jobId || "").trim();
        const qty = Number(allocation?.qty) || 0;
        if (!jobId || !qty) return;
        loaded.set(jobId, (loaded.get(jobId) || 0) + qty);
        if (isInvoiced) invoiced.set(jobId, (invoiced.get(jobId) || 0) + qty);
      }));
      (slip.jobWastage || []).forEach((row) => {
        const jobId = String(row?.jobId || "").trim();
        if (jobId) wastage.set(jobId, (wastage.get(jobId) || 0) + (Number(row?.qty) || 0));
      });
    });

    const scheduleById = new Map(schedules.map((row) => [String(row.id), row]));
    const orderById = new Map(orders.map((row) => [String(row.id), row]));
    const companyById = new Map(companies.map((row) => [String(row.id), row]));
    const firmById = new Map(firms.map((row) => [String(row.id), row]));
    const itemNameByKey = new Map<string, string>();
    npdItems.forEach((item: any) => {
      const name = String(item.itemName || item.name || "").trim();
      [item.id, item.npdId, item.erp].forEach((value) => {
        const key = String(value ?? "").trim().toLowerCase();
        if (key && name) itemNameByKey.set(key, name);
      });
    });

    return productions
      .filter((job) => String(job.itemSource || "FG").toUpperCase() !== "PHP" && String(job.itemSource || "FG").toUpperCase() !== "PLATE")
      .filter((job) => String(job.status || "") !== "Cancelled")
      .map((job) => {
        const jobId = String(job.id);
        const schedule: any = scheduleById.get(String(job.scheduleId || ""));
        const order: any = orderById.get(String(schedule?.orderId || (job as any).orderId || ""));
        const firmId = String((job as any).orderFirmId || order?.firmId || job.firmId || "");
        const printedQty = printed.get(jobId) || 0;
        const loadedQty = loaded.get(jobId) || 0;
        const wastageQty = wastage.get(jobId) || 0;
        const itemKey = String((job as any).npdId || job.itemId || "").trim().toLowerCase();
        return {
          jobId,
          jobNo: getLoadingJobNumber(job) || String(job.transactionNo || jobId),
          date: String(job.date || "").slice(0, 10),
          status: String(job.status || ""),
          firmId,
          firmName: String(firmById.get(firmId)?.firmName || job.firmName || ""),
          companyName: String(companyById.get(String(order?.companyId || ""))?.name || ""),
          itemName: itemNameByKey.get(itemKey) || String((job as any).itemName || ""),
          plannedQty: Number(job.qty) || 0,
          corrugation: corrugation.get(jobId) || 0,
          printed: printedQty,
          printingComplete: printingComplete.has(jobId),
          loaded: loadedQty,
          invoiced: invoiced.get(jobId) || 0,
          loadingWastage: wastageQty,
          balance: printedQty - loadedQty - wastageQty,
        };
      });
  }, [productions, processing, loadingSlips, schedules, orders, companies, firms, npdItems]);

  const firmOptions = useMemo(
    () => Array.from(new Map(rows.filter((row) => row.firmId).map((row) => [row.firmId, row.firmName || row.firmId])).entries()),
    [rows],
  );

  const baseRows = useMemo(() => {
    const words = searchWords(searchTerm);
    return rows
      .filter((row) => !fromDate || row.date >= fromDate)
      .filter((row) => !toDate || row.date <= toDate)
      .filter((row) => !firmFilter || row.firmId === firmFilter)
      .filter((row) => view === "all" || (view === "negative" ? row.balance < 0 : row.balance !== 0))
      .filter((row) => matchesTableSearch([row.jobNo, row.companyName, row.itemName, row.firmName, row.status].join(" "), words))
      .sort((a, b) => b.jobNo.localeCompare(a.jobNo, undefined, { numeric: true, sensitivity: "base" }));
  }, [rows, searchTerm, fromDate, toDate, firmFilter, view]);
  const loadCounts = useMemo(() => ({
    all: baseRows.length,
    loaded: baseRows.filter((row) => row.loaded > 0).length,
    notLoaded: baseRows.filter((row) => row.loaded <= 0).length,
  }), [baseRows]);
  const visibleRows = useMemo(
    () => baseRows.filter((row) => !loadFilter || (loadFilter === "loaded" ? row.loaded > 0 : row.loaded <= 0)),
    [baseRows, loadFilter],
  );

  const totals = useMemo(
    () => visibleRows.reduce(
      (acc, row) => ({
        plannedQty: acc.plannedQty + row.plannedQty,
        corrugation: acc.corrugation + row.corrugation,
        printed: acc.printed + row.printed,
        loaded: acc.loaded + row.loaded,
        invoiced: acc.invoiced + row.invoiced,
        loadingWastage: acc.loadingWastage + row.loadingWastage,
        balance: acc.balance + row.balance,
      }),
      { plannedQty: 0, corrugation: 0, printed: 0, loaded: 0, invoiced: 0, loadingWastage: 0, balance: 0 },
    ),
    [visibleRows],
  );

  const exportExcel = () => {
    const sheet = XLSX.utils.json_to_sheet(visibleRows.map((row) => ({
      "Job No": row.jobNo,
      "Job Date": row.date,
      Company: row.companyName,
      Item: row.itemName,
      "Planned Qty": row.plannedQty,
      Status: row.status,
      Firm: row.firmName,
      Corrugation: row.corrugation,
      Printed: row.printed,
      "Printing Status": row.printingComplete ? "Complete" : row.printed ? "In Progress" : "Not started",
      Loaded: row.loaded,
      Invoiced: row.invoiced,
      "Loading Wastage": row.loadingWastage,
      Balance: row.balance,
    })));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Job Wise Tracker");
    XLSX.writeFile(book, `Job_Wise_Tracker_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-black pb-3">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-tight text-black">Job Wise Tracker</h2>
          <p className="text-xs text-slate-600">Balance = Printed − Loaded − Loading Wastage. Red = more loaded than printed.</p>
        </div>
        <button type="button" onClick={exportExcel} className="flex items-center gap-2 rounded border-2 border-black bg-white px-3 py-1.5 text-xs font-bold hover:bg-slate-100">
          <Download size={14} /> Excel
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded border border-black bg-white p-3 md:grid-cols-6">
        <input type="text" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search job, company, item…" className="col-span-2 h-9 rounded border-2 border-black px-3 text-sm" />
        <select value={firmFilter} onChange={(event) => setFirmFilter(event.target.value)} className="h-9 rounded border-2 border-black px-2 text-sm">
          <option value="">All firms</option>
          {firmOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select value={view} onChange={(event) => setView(event.target.value as any)} className="h-9 rounded border-2 border-black px-2 text-sm">
          <option value="open">Balance not 0</option>
          <option value="negative">Negative balance only</option>
          <option value="all">All jobs</option>
        </select>
        <label className="flex items-center gap-1 text-xs font-bold">From<input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="h-9 w-full rounded border-2 border-black px-2 text-sm" /></label>
        <label className="flex items-center gap-1 text-xs font-bold">To<input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="h-9 w-full rounded border-2 border-black px-2 text-sm" /></label>
      </div>

      <div className="flex flex-wrap gap-2">
        {([["", `All (${loadCounts.all})`], ["loaded", `Loaded (${loadCounts.loaded})`], ["notLoaded", `Not Loaded (${loadCounts.notLoaded})`]] as const).map(([value, label]) => (
          <button key={value || "all"} type="button" onClick={() => setLoadFilter(value)} className={`rounded border-2 border-black px-4 py-1.5 text-xs font-black uppercase ${loadFilter === value ? "bg-indigo-700 text-white" : "bg-white hover:bg-slate-100"}`}>{label}</button>
        ))}
      </div>

      <div className="overflow-x-auto rounded border-2 border-black bg-white">
        <table className="w-full min-w-[1300px] border-collapse">
          <thead className="sticky top-0 bg-indigo-700 text-white">
            <tr>
              <th className={`${TH} text-left`}>Job No</th>
              <th className={`${TH} text-left`}>Job Date</th>
              <th className={`${TH} text-left`}>Company</th>
              <th className={`${TH} text-left`}>Item</th>
              <th className={`${TH} text-right`}>Planned Qty</th>
              <th className={`${TH} text-right`}>Corrugation</th>
              <th className={`${TH} text-right`}>Printed</th>
              <th className={`${TH} text-right`}>Loaded</th>
              <th className={`${TH} text-right`}>Invoiced</th>
              <th className={`${TH} text-right`}>Loading Wastage</th>
              <th className={`${TH} text-right`}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr><td colSpan={11} className="p-6 text-center text-sm italic text-slate-500">No jobs found.</td></tr>
            ) : visibleRows.map((row) => (
              <tr key={row.jobId} className={row.balance < 0 ? "bg-red-50" : "hover:bg-slate-50"}>
                <td className={`${TD} font-bold`}>
                  {row.jobNo}
                  <div className="text-[10px] font-normal text-slate-500">{row.status}{row.firmName ? ` · ${row.firmName}` : ""}</div>
                </td>
                <td className={`${TD} whitespace-nowrap`}>{formatDate(row.date)}</td>
                <td className={TD}>{row.companyName || "-"}</td>
                <td className={TD}>{row.itemName || "-"}</td>
                <td className={`${TD} text-right`}>{num(row.plannedQty)}</td>
                <td className={`${TD} text-right whitespace-nowrap`}>{num(row.corrugation)}{isAdmin ? <button type="button" onClick={() => setCorrection({ row, field: "Corrugation" })} className="ml-1 inline-flex text-slate-400 hover:text-indigo-700" title="Correct (Admin)"><Pencil size={12} /></button> : null}</td>
                <td className={`${TD} text-right whitespace-nowrap`}>
                  {num(row.printed)}{isAdmin ? <button type="button" onClick={() => setCorrection({ row, field: "Printed" })} className="ml-1 inline-flex text-slate-400 hover:text-indigo-700" title="Correct (Admin)"><Pencil size={12} /></button> : null}
                  <div className={`text-[10px] font-black ${row.printingComplete ? "text-indigo-700" : "text-slate-400"}`}>{row.printingComplete ? "Complete" : row.printed ? "In Progress" : "Not started"}</div>
                </td>
                <td className={`${TD} text-right whitespace-nowrap`}>{num(row.loaded)}{isAdmin ? <button type="button" onClick={() => setCorrection({ row, field: "Loaded" })} className="ml-1 inline-flex text-slate-400 hover:text-indigo-700" title="Correct (Admin)"><Pencil size={12} /></button> : null}</td>
                <td className={`${TD} text-right`}>{num(row.invoiced)}</td>
                <td className={`${TD} text-right whitespace-nowrap`}>{num(row.loadingWastage)}{isAdmin ? <button type="button" onClick={() => setCorrection({ row, field: "Loading Wastage" })} className="ml-1 inline-flex text-slate-400 hover:text-indigo-700" title="Correct (Admin)"><Pencil size={12} /></button> : null}</td>
                <td className={`${TD} text-right text-sm font-black ${row.balance < 0 ? "text-red-700" : ""}`}>{row.balance.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          {visibleRows.length > 0 ? (
            <tfoot>
              <tr className="bg-slate-100 font-black">
                <td className={TD} colSpan={4}>Total ({visibleRows.length} jobs)</td>
                <td className={`${TD} text-right`}>{num(totals.plannedQty)}</td>
                <td className={`${TD} text-right`}>{num(totals.corrugation)}</td>
                <td className={`${TD} text-right`}>{num(totals.printed)}</td>
                <td className={`${TD} text-right`}>{num(totals.loaded)}</td>
                <td className={`${TD} text-right`}>{num(totals.invoiced)}</td>
                <td className={`${TD} text-right`}>{num(totals.loadingWastage)}</td>
                <td className={`${TD} text-right ${totals.balance < 0 ? "text-red-700" : ""}`}>{totals.balance.toLocaleString()}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      {correction ? (
        <JobCorrectionModal
          row={correction.row}
          field={correction.field}
          loadingSlips={loadingSlips}
          userName={String(user?.name || "Admin")}
          onClose={() => setCorrection(null)}
        />
      ) : null}
    </div>
  );
}

type ProcessingEntry = ProductionProcessing & Record<string, any>;

/**
 * Admin correction of one figure of a job: lists the entries behind it and lets
 * the Admin change one entry, with a reason. Saves go through the normal save
 * (so every existing rule still applies) and are written to the correction log.
 */
function JobCorrectionModal({ row, field, loadingSlips, userName, onClose }: {
  row: Row;
  field: CorrectionField;
  loadingSlips: LoadingSlip[];
  userName: string;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<ProcessingEntry[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState("");
  const [editSlipId, setEditSlipId] = useState("");
  const isProcessing = field === "Corrugation" || field === "Printed";
  const machine = field === "Corrugation" ? "Corrugation Liner" : "Printing";

  React.useEffect(() => {
    if (!isProcessing) return;
    let active = true;
    fetch("/api/production-processing", { headers: { ...getDataAuthHeaders(false) } })
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        const list = (Array.isArray(data) ? data : []).filter((entry: any) =>
          String(entry.productionId || "").trim() === row.jobId && normalizeMachineName(entry.machineName) === machine);
        list.sort((a: any, b: any) => String(a.date || "").localeCompare(String(b.date || "")));
        setEntries(list);
      })
      .catch(() => active && setMessage("Could not load the entries."));
    return () => { active = false; };
  }, [isProcessing, machine, row.jobId]);

  const slipRows = useMemo(() => loadingSlips
    .filter((slip) => !isCancelledSlip(slip))
    .map((slip) => {
      const loadedQty = (slip.lines || []).reduce((sum, line) => sum + (line.allocations || []).reduce((inner, allocation: any) =>
        inner + (String(allocation?.sourceType || "").toLowerCase() === "job" && String(allocation?.jobId || "").trim() === row.jobId ? Number(allocation?.qty) || 0 : 0), 0), 0);
      const wastageQty = (slip.jobWastage || []).filter((item) => String(item.jobId || "").trim() === row.jobId).reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
      return { slip, loadedQty, wastageQty };
    })
    .filter((item) => item.loadedQty > 0 || item.wastageQty > 0)
    .sort((a, b) => String(a.slip.date || "").localeCompare(String(b.slip.date || ""))), [loadingSlips, row.jobId]);

  const logCorrection = async (payload: { entryRef: string; entryId: string; oldValue: number; newValue: number }) => {
    const response = await fetch("/api/job-corrections", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getDataAuthHeaders(false) },
      body: JSON.stringify({ jobId: row.jobId, jobNo: row.jobNo, field, reason: reason.trim(), ...payload }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(String(body?.error || "The correction was saved but could not be logged."));
    }
  };

  const requireReason = () => {
    if (reason.trim().length < 5) {
      setMessage("Enter the reason (at least 5 characters) before saving.");
      return false;
    }
    return true;
  };

  const saveProcessing = async (entry: ProcessingEntry) => {
    if (!requireReason()) return;
    const newValue = Number(drafts[entry.id]);
    const oldValue = Number(entry.qty) || 0;
    if (!Number.isFinite(newValue) || newValue <= 0) return setMessage("Enter a quantity greater than 0.");
    if (newValue === oldValue) return setMessage("The quantity is unchanged.");
    setSavingId(entry.id);
    setMessage("");
    try {
      const response = await fetch("/api/production-processing", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getDataAuthHeaders(false) },
        body: JSON.stringify({ ...entry, qty: newValue, updatedBy: userName, updateTimestamp: new Date().toISOString() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body?.error || "Save failed."));
      await logCorrection({ entryRef: `${formatDate(String(entry.date || ""))} ${entry.shift || ""} ${entry.completionStatus === "Part" ? "In Progress" : "Complete"}`.trim(), entryId: entry.id, oldValue, newValue });
      setEntries((prev) => (prev || []).map((item) => (item.id === entry.id ? { ...item, qty: newValue } : item)));
      window.dispatchEvent(new CustomEvent("sync-data-production_processing"));
      setMessage(`Saved: ${oldValue.toLocaleString()} → ${newValue.toLocaleString()}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setSavingId("");
    }
  };

  const saveWastage = async (slip: LoadingSlip, oldValue: number) => {
    if (!requireReason()) return;
    const raw = drafts[slip.id];
    const newValue = raw === undefined || raw === "" ? NaN : Number(raw);
    if (!Number.isFinite(newValue) || newValue < 0) return setMessage("Enter a wastage of 0 or more.");
    if (newValue === oldValue) return setMessage("The wastage is unchanged.");
    if (row.printingComplete) {
      const othersUsed = row.loaded + row.loadingWastage - oldValue;
      if (othersUsed + newValue > row.printed + 0.0001) {
        return setMessage(`Printing is Complete: printed ${row.printed.toLocaleString()}, loaded + other wastage ${othersUsed.toLocaleString()}, so wastage can be at most ${Math.max(0, row.printed - othersUsed).toLocaleString()}.`);
      }
    }
    setSavingId(slip.id);
    setMessage("");
    try {
      const rest = (slip.jobWastage || []).filter((item) => String(item.jobId || "").trim() !== row.jobId);
      const jobWastage = newValue > 0 ? [...rest, { jobId: row.jobId, jobNo: row.jobNo, qty: newValue }] : rest;
      const response = await fetch("/api/loading-slips", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getDataAuthHeaders(false) },
        body: JSON.stringify({ ...slip, jobWastage, pdfRedownloadRequired: "Yes", updatedBy: userName, updateTimestamp: new Date().toISOString() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body?.error || "Save failed."));
      await logCorrection({ entryRef: `Slip ${slip.slipNo}`, entryId: slip.id, oldValue, newValue });
      window.dispatchEvent(new CustomEvent("sync-data-loading_slips"));
      setMessage(`Saved: ${oldValue.toLocaleString()} → ${newValue.toLocaleString()}. Download the slip PDF again before invoicing.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setSavingId("");
    }
  };

  const onSlipSaved = async (before: LoadingSlip, after: LoadingSlip) => {
    const jobQty = (slip: LoadingSlip) => (slip.lines || []).reduce((sum, line) => sum + (line.allocations || []).reduce((inner, allocation: any) =>
      inner + (String(allocation?.sourceType || "").toLowerCase() === "job" && String(allocation?.jobId || "").trim() === row.jobId ? Number(allocation?.qty) || 0 : 0), 0), 0);
    const jobWastage = (slip: LoadingSlip) => (slip.jobWastage || []).filter((item) => String(item.jobId || "").trim() === row.jobId).reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
    try {
      if (jobQty(before) !== jobQty(after)) await logCorrection({ entryRef: `Slip ${after.slipNo}`, entryId: after.id, oldValue: jobQty(before), newValue: jobQty(after) });
      if (jobWastage(before) !== jobWastage(after)) {
        await fetch("/api/job-corrections", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getDataAuthHeaders(false) },
          body: JSON.stringify({ jobId: row.jobId, jobNo: row.jobNo, field: "Loading Wastage", reason: reason.trim(), entryRef: `Slip ${after.slipNo}`, entryId: after.id, oldValue: jobWastage(before), newValue: jobWastage(after) }),
        });
      }
      setMessage(`Slip ${after.slipNo} saved and logged. Download its PDF again before invoicing.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Logging failed.");
    }
  };

  const cell = "border border-black px-2 py-1.5 text-xs";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded border-2 border-black bg-white p-4 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]">
        <div className="mb-3 flex items-start justify-between border-b-2 border-black pb-2">
          <div>
            <div className="text-sm font-black uppercase">Correct {field}</div>
            <div className="text-xs text-slate-600">Job {row.jobNo} · {row.companyName} · {row.itemName}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded border border-black px-3 py-1 text-xs font-bold hover:bg-slate-100">Close</button>
        </div>

        <label className="mb-3 block text-xs font-bold">
          Reason for correction *
          <input type="text" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this figure being corrected?" className="mt-1 h-9 w-full rounded border-2 border-black px-3 text-sm" />
        </label>

        {message ? <div className="mb-3 rounded border border-amber-400 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">{message}</div> : null}

        {isProcessing ? (
          entries === null ? <div className="text-sm text-slate-600">Loading entries…</div> : entries.length === 0 ? <div className="text-sm text-slate-600">No {machine} entries on this job.</div> : (
            <table className="w-full border-collapse">
              <thead className="bg-slate-100"><tr>{["Date", "Shift", "Status", field === "Printed" ? "Printing Machine" : "Machine", "Qty", "New Qty", ""].map((heading) => <th key={heading} className={`${cell} text-left font-black uppercase`}>{heading}</th>)}</tr></thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className={cell}>{formatDate(String(entry.date || ""))}</td>
                    <td className={cell}>{entry.shift || "-"}</td>
                    <td className={cell}>{entry.completionStatus === "Part" ? "In Progress" : "Complete"}</td>
                    <td className={cell}>{field === "Printed" ? entry.printingMachine || "-" : entry.machineName}</td>
                    <td className={`${cell} text-right font-bold`}>{(Number(entry.qty) || 0).toLocaleString()}</td>
                    <td className={cell}><input type="number" min={1} value={drafts[entry.id] ?? ""} onChange={(event) => setDrafts((prev) => ({ ...prev, [entry.id]: event.target.value }))} className="h-8 w-28 rounded border-2 border-black px-2 text-right text-xs" /></td>
                    <td className={cell}><button type="button" disabled={savingId === entry.id || !drafts[entry.id]} onClick={() => void saveProcessing(entry)} className="rounded bg-indigo-600 px-3 py-1 text-xs font-bold text-white disabled:bg-slate-400">{savingId === entry.id ? "Saving…" : "Save"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : slipRows.length === 0 ? <div className="text-sm text-slate-600">No loading slips for this job.</div> : (
          <table className="w-full border-collapse">
            <thead className="bg-slate-100"><tr>{["Slip No", "Date", "Invoice", "Loaded (this job)", "Loading Wastage", field === "Loading Wastage" ? "New Wastage" : "", ""].map((heading, index) => <th key={`${heading}-${index}`} className={`${cell} text-left font-black uppercase`}>{heading}</th>)}</tr></thead>
            <tbody>
              {slipRows.map(({ slip, loadedQty, wastageQty }) => {
                const invoiced = Boolean(String(slip.invoiceId || "").trim());
                return (
                  <tr key={slip.id}>
                    <td className={`${cell} font-bold`}>{slip.slipNo}</td>
                    <td className={cell}>{formatDate(String(slip.date || ""))}</td>
                    <td className={cell}>{invoiced ? slip.invoiceNo || "Invoiced" : "-"}</td>
                    <td className={`${cell} text-right`}>{loadedQty.toLocaleString()}</td>
                    <td className={`${cell} text-right`}>{wastageQty.toLocaleString()}</td>
                    <td className={cell}>
                      {field === "Loading Wastage" && !invoiced ? <input type="number" min={0} value={drafts[slip.id] ?? ""} onChange={(event) => setDrafts((prev) => ({ ...prev, [slip.id]: event.target.value }))} className="h-8 w-24 rounded border-2 border-black px-2 text-right text-xs" /> : null}
                    </td>
                    <td className={cell}>
                      {invoiced ? <span className="text-[11px] font-bold text-slate-500">Invoiced: cannot change</span>
                        : field === "Loading Wastage"
                          ? <button type="button" disabled={savingId === slip.id || drafts[slip.id] === undefined || drafts[slip.id] === ""} onClick={() => void saveWastage(slip, wastageQty)} className="rounded bg-indigo-600 px-3 py-1 text-xs font-bold text-white disabled:bg-slate-400">{savingId === slip.id ? "Saving…" : "Save"}</button>
                          : <button type="button" onClick={() => { if (requireReason()) setEditSlipId(slip.id); }} className="rounded bg-indigo-600 px-3 py-1 text-xs font-bold text-white">Edit slip</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {editSlipId ? (
          <div className="mt-4 rounded border-2 border-indigo-600 p-3">
            <React.Suspense fallback={<div className="p-4 text-sm text-slate-600">Loading slip…</div>}>
              <LoadingMasterFocus focusSlipId={editSlipId} onFocusDone={() => setEditSlipId("")} onFocusSaved={(before, after) => void onSlipSaved(before, after)} />
            </React.Suspense>
          </div>
        ) : null}
      </div>
    </div>
  );
}
