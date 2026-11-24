import { useMemo, useState } from "react";
import { Select } from "../components/Select";
import { Search } from "lucide-react";
import { useNpdItemsWithStatus } from "../hooks/useNpdItems";
import { getDataAuthHeaders, useData } from "../hooks/useData";
import type { Item, LoadingSlip } from "../types";
import { useTableSearch } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";

type FgStockRow = {
  id: string;
  erp: string;
  itemName: string;
  customer: string;
  uom: string;
  opening: number;
  receipt: number;
  production: number;
  invoiced: number;
  balance: number;
  /** On active loading slips that are not invoiced yet (still in stock). */
  loadedNotInvoiced: number;
  rate: number;
  stockValue: number;
  keys: string[];
};

type BreakupJob = { jobId: string; jobNo: string; date: string; status: string; produced: number; invoiced: number; loadedNotInvoiced: number };
type Breakup = {
  opening: number;
  receipts: Array<{ mrrNo: string; date: string; mrrType: string; qty: number }>;
  jobs: BreakupJob[];
  loadedNotInvoiced: number;
};

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatQty(value: number) {
  return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function textValue(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "-";
}

function toRow(item: Item): FgStockRow {
  const opening = numberValue(item.opening);
  const receipt = numberValue(item.receipt);
  const production = numberValue(item.production);
  const invoiced = numberValue(item.invoiced);
  const balance = numberValue(item.balance);
  const rate = numberValue(item.rate);

  return {
    id: String(item.id || (item as any).npdId || (item as any).itemId || item.erp || item.name || crypto.randomUUID()),
    erp: textValue(item.erp, (item as any).erpCode, (item as any).masterItemNameErpCode),
    itemName: textValue(item.name, (item as any).itemName),
    customer: textValue(item.customer, (item as any).customerName, (item as any).companyName, (item as any).partyName),
    uom: textValue(item.uom),
    opening,
    receipt,
    production,
    invoiced,
    balance,
    loadedNotInvoiced: 0,
    rate,
    stockValue: balance * rate,
    keys: [item.id, (item as any).npdId, (item as any).itemId, item.erp].map((value) => String(value ?? "").trim().toLowerCase()).filter(Boolean),
  };
}

const FILTER_LABEL = "mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600";

export function FGStockReport() {
  const { items, loading, error } = useNpdItemsWithStatus();
  const [loadingSlips] = useData<LoadingSlip>("loading_slips", []);
  const [breakupRow, setBreakupRow] = useState<FgStockRow | null>(null);
  const [breakup, setBreakup] = useState<Breakup | null>(null);
  const [breakupError, setBreakupError] = useState("");

  // FG quantity on active loading slips that are not invoiced yet, per item key.
  const loadedNotInvoicedByKey = useMemo(() => {
    const totals = new Map<string, number>();
    loadingSlips.forEach((slip) => {
      if (String(slip.status || "").trim().toLowerCase() === "cancelled" || String(slip.invoiceId || "").trim()) return;
      (slip.lines || []).forEach((line) => {
        if (String(line.itemSource || "FG").trim().toUpperCase() !== "FG") return;
        const key = String((line as any).npdId || line.itemId || "").trim().toLowerCase();
        if (key) totals.set(key, (totals.get(key) || 0) + (Number(line.loadedQty) || 0));
      });
    });
    return totals;
  }, [loadingSlips]);

  const openBreakup = async (row: FgStockRow) => {
    setBreakupRow(row);
    setBreakup(null);
    setBreakupError("");
    try {
      const response = await fetch(`/api/fg-stock-breakup/${encodeURIComponent(row.id)}`, { headers: { ...getDataAuthHeaders(false) } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body?.error || "Failed to load the breakup."));
      setBreakup(body as Breakup);
    } catch (err) {
      setBreakupError(err instanceof Error ? err.message : "Failed to load the breakup.");
    }
  };
  const [searchTerm, setSearchTerm] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [uomFilter, setUomFilter] = useState("");

  const baseRows = useMemo(
    () =>
      items
        .map(toRow)
        .map((row) => ({ ...row, loadedNotInvoiced: Array.from(new Set(row.keys)).reduce((sum, key) => sum + (loadedNotInvoicedByKey.get(key) || 0), 0) }))
        .filter((row) => row.balance > 0)
        .sort((a, b) => b.balance - a.balance || a.erp.localeCompare(b.erp, undefined, { numeric: true, sensitivity: "base" })),
    [items, loadedNotInvoicedByKey],
  );

  const filterOptions = useMemo(() => {
    const toOptions = (values: string[]) => Array.from(new Set(values.map((value) => String(value || "").trim()).filter((value) => value && value !== "-"))).sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value }));
    return {
      customers: toOptions(baseRows.map((row) => row.customer)),
      items: Array.from(new Map(baseRows.map((row) => [row.erp, { value: row.erp, label: `${row.itemName} - ${row.erp}`, searchText: `${row.itemName} ${row.erp}` }])).values()).filter((option) => option.value).sort((a, b) => a.label.localeCompare(b.label)),
      uoms: toOptions(baseRows.map((row) => row.uom)),
    };
  }, [baseRows]);
  const filteredRows = useMemo(() => baseRows.filter((row) =>
    (!customerFilter || row.customer === customerFilter) &&
    (!itemFilter || row.erp === itemFilter) &&
    (!uomFilter || row.uom === uomFilter)
  ), [baseRows, customerFilter, itemFilter, uomFilter]);
  const hasFilters = Boolean(searchTerm.trim() || customerFilter || itemFilter || uomFilter);
  const clearFilters = () => { setSearchTerm(""); setCustomerFilter(""); setItemFilter(""); setUomFilter(""); };

  const rows = useTableSearch(filteredRows, searchTerm, (row) => [
    row.erp,
    row.itemName,
    row.customer,
    row.uom,
    row.opening,
    row.receipt,
    row.production,
    row.invoiced,
    row.balance,
    row.rate,
    row.stockValue,
  ]);

  // Column sort over every searched row; with no sort the highest-balance-first order stays.
  const { sorted: sortedRows, sort, toggle: toggleSort } = useTableSort(rows, (row, key) => row[key as keyof FgStockRow]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          balance: acc.balance + row.balance,
          loadedNotInvoiced: acc.loadedNotInvoiced + row.loadedNotInvoiced,
          stockValue: acc.stockValue + row.stockValue,
        }),
        { balance: 0, loadedNotInvoiced: 0, stockValue: 0 },
      ),
    [rows],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-black pb-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-tight text-black">FG Stock</h2>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded border border-amber-300 bg-amber-50 p-4">
          <div className="text-xs font-black uppercase text-amber-700">Total FG Items</div>
          <div className="mt-1 text-2xl font-black text-amber-900">{rows.length}</div>
        </div>
        <div className="rounded border border-emerald-300 bg-emerald-50 p-4">
          <div className="text-xs font-black uppercase text-emerald-700">Total Balance Qty</div>
          <div className="mt-1 text-2xl font-black text-emerald-900">{formatQty(totals.balance)}</div>
        </div>
        <div className="rounded border border-purple-300 bg-purple-50 p-4">
          <div className="text-xs font-black uppercase text-purple-700">Total Stock Value</div>
          <div className="mt-1 text-2xl font-black text-purple-900">{formatQty(totals.stockValue)}</div>
        </div>
      </div>

      <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
        <div className="relative w-full"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" placeholder="Search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600" /></div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
          <div className="col-span-2 min-w-0 md:col-span-1"><span className={FILTER_LABEL}>Customer / Party</span><Select compact value={customerFilter} onChange={setCustomerFilter} options={filterOptions.customers} placeholder="All" /></div>
          <div className="col-span-2 min-w-0 md:col-span-1"><span className={FILTER_LABEL}>Item</span><Select compact value={itemFilter} onChange={setItemFilter} options={filterOptions.items} placeholder="All" /></div>
          <div className="min-w-0"><span className={FILTER_LABEL}>UOM</span><Select compact value={uomFilter} onChange={setUomFilter} options={filterOptions.uoms} placeholder="All" /></div>
        </div>
        <div data-mf-actions="true" className="flex justify-end gap-2">
          {hasFilters ? <button type="button" onClick={clearFilters} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button> : null}
          <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
        </div>
      </div>

      <div className="overflow-hidden rounded border-2 border-black bg-white shadow-sm">
        <div className="max-h-[calc(100vh-220px)] w-full overflow-auto relative">
          <table className="w-full min-w-max border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-indigo-700 text-white">
                {([["ERP", "erp"], ["Item Name", "itemName"], ["Customer / Party", "customer"], ["UOM", "uom"], ["Opening", "opening"], ["Receipt", "receipt"], ["Production", "production"], ["Invoiced", "invoiced"], ["Balance", "balance"], ["Loaded, Not Invoiced", "loadedNotInvoiced"], ["Rate", "rate"], ["Stock Value", "stockValue"]] as const).map(([heading, sortKey]) => (
                  <th key={heading} className="whitespace-nowrap border-2 border-black bg-indigo-700 px-3 py-3 text-left text-xs font-black uppercase">
                    <SortHeader label={heading} sortKey={sortKey} sort={sort} onToggle={toggleSort} align="left" />
                  </th>
                ))}
              </tr>
              {rows.length > 0 ? (
                <tr className="bg-slate-100 text-black">
                  <th className="border-2 border-black bg-slate-100 px-3 py-3 text-left text-sm font-black" colSpan={8}>TOTAL</th>
                  <th className="border-2 border-black bg-emerald-100 px-3 py-3 text-left text-sm font-black text-emerald-900">{formatQty(totals.balance)}</th>
                  <th className="border-2 border-black bg-amber-100 px-3 py-3 text-left text-sm font-black text-amber-900">{formatQty(totals.loadedNotInvoiced)}</th>
                  <th className="border-2 border-black bg-slate-100 px-3 py-3 text-left text-sm font-black">-</th>
                  <th className="border-2 border-black bg-purple-100 px-3 py-3 text-left text-sm font-black text-purple-900">{formatQty(totals.stockValue)}</th>
                </tr>
              ) : null}
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={12} className="border-2 border-black px-6 py-10 text-center font-medium text-black">Loading FG stock...</td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={12} className="border-2 border-black px-6 py-10 text-center font-medium text-red-700">{error}</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="border-2 border-black px-6 py-10 text-center font-medium text-black">No FG stock found with balance greater than 0.</td>
                </tr>
              ) : (
                sortedRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap border-2 border-black px-3 py-3 text-sm text-black">{row.erp}</td>
                    <td className="min-w-[260px] max-w-[420px] whitespace-normal break-words border-2 border-black px-3 py-3 text-sm text-black">{row.itemName}</td>
                    <td className="min-w-[180px] max-w-[320px] whitespace-normal break-words border-2 border-black px-3 py-3 text-sm text-black">{row.customer}</td>
                    <td className="whitespace-nowrap border-2 border-black px-3 py-3 text-sm text-black">{row.uom}</td>
                    <td className="border-2 border-black px-3 py-3 text-right text-sm text-black">{formatQty(row.opening)}</td>
                    <td className="border-2 border-black bg-blue-50/50 px-3 py-3 text-right text-sm text-blue-900">{formatQty(row.receipt)}</td>
                    <td className="border-2 border-black bg-cyan-50/50 px-3 py-3 text-right text-sm text-cyan-900">{formatQty(row.production)}</td>
                    <td className="border-2 border-black bg-red-50/40 px-3 py-3 text-right text-sm text-red-800">{formatQty(row.invoiced)}</td>
                    <td className="border-2 border-black bg-emerald-50 px-3 py-3 text-right text-sm font-bold text-emerald-900">
                      <button type="button" onClick={() => void openBreakup(row)} className="font-bold text-emerald-900 underline decoration-dotted underline-offset-2 hover:text-indigo-700" title="Show what this balance is made of">{formatQty(row.balance)}</button>
                    </td>
                    <td className="border-2 border-black bg-amber-50/60 px-3 py-3 text-right text-sm text-amber-900">{row.loadedNotInvoiced ? formatQty(row.loadedNotInvoiced) : "-"}</td>
                    <td className="border-2 border-black px-3 py-3 text-right text-sm text-black">{formatQty(row.rate)}</td>
                    <td className="border-2 border-black bg-purple-50 px-3 py-3 text-right text-sm font-bold text-purple-900">{formatQty(row.stockValue)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
                </div>
      </div>
      {breakupRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setBreakupRow(null)}>
          <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-xl border-2 border-black bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 flex items-start justify-between gap-3 border-b-2 border-black bg-indigo-700 px-4 py-3 text-white">
              <div>
                <div className="text-sm font-black uppercase">Closing Stock Breakup</div>
                <div className="text-xs">{breakupRow.erp} · {breakupRow.itemName}</div>
              </div>
              <button type="button" onClick={() => setBreakupRow(null)} className="rounded border border-white px-3 py-1 text-xs font-bold hover:bg-white/10">Close</button>
            </div>
            <div className="p-4">
              {breakupError ? <div className="font-bold text-red-700">{breakupError}</div> : !breakup ? <div className="text-sm text-slate-600">Loading…</div> : (() => {
                const jobInvoiced = breakup.jobs.reduce((sum, job) => sum + job.invoiced, 0);
                const notLinked = breakupRow.invoiced - jobInvoiced;
                const jobRows = breakup.jobs.filter((job) => Math.abs(job.produced - job.invoiced) > 0.0001 || job.loadedNotInvoiced > 0);
                const hiddenJobs = breakup.jobs.length - jobRows.length;
                const hiddenNet = breakup.jobs.filter((job) => !jobRows.includes(job)).reduce((sum, job) => sum + job.produced - job.invoiced, 0);
                const receiptTotal = breakup.receipts.reduce((sum, row) => sum + row.qty, 0);
                const jobNet = breakup.jobs.reduce((sum, job) => sum + job.produced - job.invoiced, 0);
                const rebuilt = breakupRow.opening + breakupRow.receipt + breakupRow.production - breakupRow.invoiced;
                return (
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-100 text-xs font-black uppercase">
                        <th className="border border-black px-3 py-2 text-left">Part</th>
                        <th className="border border-black px-3 py-2 text-right">Produced / In</th>
                        <th className="border border-black px-3 py-2 text-right">Invoiced</th>
                        <th className="border border-black px-3 py-2 text-right">Loaded, Not Invoiced</th>
                        <th className="border border-black px-3 py-2 text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr><td className="border border-black px-3 py-2 font-bold">Opening</td><td className="border border-black px-3 py-2 text-right">{formatQty(breakupRow.opening)}</td><td className="border border-black px-3 py-2 text-right">-</td><td className="border border-black px-3 py-2 text-right">-</td><td className="border border-black px-3 py-2 text-right font-bold">{formatQty(breakupRow.opening)}</td></tr>
                      {breakup.receipts.map((receipt) => (
                        <tr key={`${receipt.mrrNo}-${receipt.date}`}><td className="border border-black px-3 py-2">Receipt {receipt.mrrNo} ({receipt.mrrType}, {receipt.date})</td><td className="border border-black px-3 py-2 text-right">{formatQty(receipt.qty)}</td><td className="border border-black px-3 py-2 text-right">-</td><td className="border border-black px-3 py-2 text-right">-</td><td className="border border-black px-3 py-2 text-right font-bold">{formatQty(receipt.qty)}</td></tr>
                      ))}
                      {Math.abs(receiptTotal - breakupRow.receipt) > 0.0001 ? (
                        <tr><td className="border border-black px-3 py-2 italic text-slate-600">Receipts not matched to an MRR line</td><td className="border border-black px-3 py-2 text-right">{formatQty(breakupRow.receipt - receiptTotal)}</td><td className="border border-black px-3 py-2 text-right">-</td><td className="border border-black px-3 py-2 text-right">-</td><td className="border border-black px-3 py-2 text-right font-bold">{formatQty(breakupRow.receipt - receiptTotal)}</td></tr>
                      ) : null}
                      {jobRows.map((job) => (
                        <tr key={job.jobId}><td className="border border-black px-3 py-2">Job {job.jobNo} <span className="text-xs text-slate-500">({job.date}, {job.status})</span></td><td className="border border-black px-3 py-2 text-right">{formatQty(job.produced)}</td><td className="border border-black px-3 py-2 text-right">{formatQty(job.invoiced)}</td><td className="border border-black px-3 py-2 text-right text-amber-800">{job.loadedNotInvoiced ? formatQty(job.loadedNotInvoiced) : "-"}</td><td className={`border border-black px-3 py-2 text-right font-bold ${job.produced - job.invoiced < 0 ? "text-red-700" : ""}`}>{formatQty(job.produced - job.invoiced)}</td></tr>
                      ))}
                      {hiddenJobs > 0 ? (
                        <tr><td className="border border-black px-3 py-2 italic text-slate-600">{hiddenJobs} other job(s), fully invoiced</td><td className="border border-black px-3 py-2 text-right">-</td><td className="border border-black px-3 py-2 text-right">-</td><td className="border border-black px-3 py-2 text-right">-</td><td className="border border-black px-3 py-2 text-right font-bold">{formatQty(hiddenNet)}</td></tr>
                      ) : null}
                      {Math.abs(jobNet + jobInvoiced - breakupRow.production) > 0.0001 ? (
                        <tr><td className="border border-black px-3 py-2 italic text-slate-600">Production not matched to a job</td><td className="border border-black px-3 py-2 text-right">{formatQty(breakupRow.production - (jobNet + jobInvoiced))}</td><td className="border border-black px-3 py-2 text-right">-</td><td className="border border-black px-3 py-2 text-right">-</td><td className="border border-black px-3 py-2 text-right font-bold">{formatQty(breakupRow.production - (jobNet + jobInvoiced))}</td></tr>
                      ) : null}
                      {Math.abs(notLinked) > 0.0001 ? (
                        <tr><td className="border border-black px-3 py-2 italic text-slate-600">Invoiced, not linked to a job (FG Stock / older invoices)</td><td className="border border-black px-3 py-2 text-right">-</td><td className="border border-black px-3 py-2 text-right">{formatQty(notLinked)}</td><td className="border border-black px-3 py-2 text-right">-</td><td className="border border-black px-3 py-2 text-right font-bold">{formatQty(-notLinked)}</td></tr>
                      ) : null}
                    </tbody>
                    <tfoot>
                      <tr className="bg-emerald-50 font-black"><td className="border-2 border-black px-3 py-2">Closing Stock</td><td className="border-2 border-black px-3 py-2" /><td className="border-2 border-black px-3 py-2" /><td className="border-2 border-black px-3 py-2 text-right text-amber-800">{formatQty(breakupRow.loadedNotInvoiced)}</td><td className="border-2 border-black px-3 py-2 text-right text-emerald-900">{formatQty(rebuilt)}</td></tr>
                    </tfoot>
                  </table>
                );
              })()}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
