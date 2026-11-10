import { useMemo, useState } from "react";
import { Select } from "../components/Select";
import { Search } from "lucide-react";
import { useNpdItemsWithStatus } from "../hooks/useNpdItems";
import type { Item } from "../types";
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
  rate: number;
  stockValue: number;
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
    rate,
    stockValue: balance * rate,
  };
}

const FILTER_LABEL = "mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600";

export function FGStockReport() {
  const { items, loading, error } = useNpdItemsWithStatus();
  const [searchTerm, setSearchTerm] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [uomFilter, setUomFilter] = useState("");

  const baseRows = useMemo(
    () =>
      items
        .map(toRow)
        .filter((row) => row.balance > 0)
        .sort((a, b) => b.balance - a.balance || a.erp.localeCompare(b.erp, undefined, { numeric: true, sensitivity: "base" })),
    [items],
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
          stockValue: acc.stockValue + row.stockValue,
        }),
        { balance: 0, stockValue: 0 },
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
                {([["ERP", "erp"], ["Item Name", "itemName"], ["Customer / Party", "customer"], ["UOM", "uom"], ["Opening", "opening"], ["Receipt", "receipt"], ["Production", "production"], ["Invoiced", "invoiced"], ["Balance", "balance"], ["Rate", "rate"], ["Stock Value", "stockValue"]] as const).map(([heading, sortKey]) => (
                  <th key={heading} className="whitespace-nowrap border-2 border-black bg-indigo-700 px-3 py-3 text-left text-xs font-black uppercase">
                    <SortHeader label={heading} sortKey={sortKey} sort={sort} onToggle={toggleSort} align="left" />
                  </th>
                ))}
              </tr>
              {rows.length > 0 ? (
                <tr className="bg-slate-100 text-black">
                  <th className="border-2 border-black bg-slate-100 px-3 py-3 text-left text-sm font-black" colSpan={8}>TOTAL</th>
                  <th className="border-2 border-black bg-emerald-100 px-3 py-3 text-left text-sm font-black text-emerald-900">{formatQty(totals.balance)}</th>
                  <th className="border-2 border-black bg-slate-100 px-3 py-3 text-left text-sm font-black">-</th>
                  <th className="border-2 border-black bg-purple-100 px-3 py-3 text-left text-sm font-black text-purple-900">{formatQty(totals.stockValue)}</th>
                </tr>
              ) : null}
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} className="border-2 border-black px-6 py-10 text-center font-medium text-black">Loading FG stock...</td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={11} className="border-2 border-black px-6 py-10 text-center font-medium text-red-700">{error}</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="border-2 border-black px-6 py-10 text-center font-medium text-black">No FG stock found with balance greater than 0.</td>
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
                    <td className="border-2 border-black bg-emerald-50 px-3 py-3 text-right text-sm font-bold text-emerald-900">{formatQty(row.balance)}</td>
                    <td className="border-2 border-black px-3 py-3 text-right text-sm text-black">{formatQty(row.rate)}</td>
                    <td className="border-2 border-black bg-purple-50 px-3 py-3 text-right text-sm font-bold text-purple-900">{formatQty(row.stockValue)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
