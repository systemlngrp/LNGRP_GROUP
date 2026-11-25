import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download } from "lucide-react";
import { useData } from "../hooks/useData";
import { useNpdItemsWithoutStock } from "../hooks/useNpdItems";
import type { Company, Firm, LoadingSlip, Order, OrderSchedule, Production, ProductionProcessing } from "../types";
import { normalizeMachineName } from "../lib/productionMachineNames";
import { getLoadingJobNumber } from "../lib/pendingLoadingEligibility";
import { formatDate } from "../lib/serial";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";

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

  const visibleRows = useMemo(() => {
    const words = searchWords(searchTerm);
    return rows
      .filter((row) => !fromDate || row.date >= fromDate)
      .filter((row) => !toDate || row.date <= toDate)
      .filter((row) => !firmFilter || row.firmId === firmFilter)
      .filter((row) => view === "all" || (view === "negative" ? row.balance < 0 : row.balance !== 0))
      .filter((row) => matchesTableSearch([row.jobNo, row.companyName, row.itemName, row.firmName, row.status].join(" "), words))
      .sort((a, b) => b.jobNo.localeCompare(a.jobNo, undefined, { numeric: true, sensitivity: "base" }));
  }, [rows, searchTerm, fromDate, toDate, firmFilter, view]);

  const totals = useMemo(
    () => visibleRows.reduce(
      (acc, row) => ({
        corrugation: acc.corrugation + row.corrugation,
        printed: acc.printed + row.printed,
        loaded: acc.loaded + row.loaded,
        invoiced: acc.invoiced + row.invoiced,
        loadingWastage: acc.loadingWastage + row.loadingWastage,
        balance: acc.balance + row.balance,
      }),
      { corrugation: 0, printed: 0, loaded: 0, invoiced: 0, loadingWastage: 0, balance: 0 },
    ),
    [visibleRows],
  );

  const exportExcel = () => {
    const sheet = XLSX.utils.json_to_sheet(visibleRows.map((row) => ({
      "Job No": row.jobNo,
      "Job Date": row.date,
      Status: row.status,
      Firm: row.firmName,
      Company: row.companyName,
      Item: row.itemName,
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

      <div className="overflow-x-auto rounded border-2 border-black bg-white">
        <table className="w-full min-w-[1100px] border-collapse">
          <thead className="sticky top-0 bg-indigo-700 text-white">
            <tr>
              <th className={`${TH} text-left`}>Job No</th>
              <th className={`${TH} text-left`}>Company / Item</th>
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
              <tr><td colSpan={8} className="p-6 text-center text-sm italic text-slate-500">No jobs found.</td></tr>
            ) : visibleRows.map((row) => (
              <tr key={row.jobId} className={row.balance < 0 ? "bg-red-50" : "hover:bg-slate-50"}>
                <td className={`${TD} font-bold`}>
                  {row.jobNo}
                  <div className="text-[10px] font-normal text-slate-500">{formatDate(row.date)} · {row.status}{row.firmName ? ` · ${row.firmName}` : ""}</div>
                </td>
                <td className={TD}>
                  <div className="font-semibold">{row.companyName || "-"}</div>
                  <div className="text-[11px] text-slate-600">{row.itemName || "-"}</div>
                </td>
                <td className={`${TD} text-right`}>{num(row.corrugation)}</td>
                <td className={`${TD} text-right`}>
                  {num(row.printed)}
                  <div className={`text-[10px] font-black ${row.printingComplete ? "text-indigo-700" : "text-slate-400"}`}>{row.printingComplete ? "Complete" : row.printed ? "In Progress" : "Not started"}</div>
                </td>
                <td className={`${TD} text-right`}>{num(row.loaded)}</td>
                <td className={`${TD} text-right`}>{num(row.invoiced)}</td>
                <td className={`${TD} text-right`}>{num(row.loadingWastage)}</td>
                <td className={`${TD} text-right text-sm font-black ${row.balance < 0 ? "text-red-700" : ""}`}>{row.balance.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          {visibleRows.length > 0 ? (
            <tfoot>
              <tr className="bg-slate-100 font-black">
                <td className={TD} colSpan={2}>Total ({visibleRows.length} jobs)</td>
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
    </div>
  );
}
