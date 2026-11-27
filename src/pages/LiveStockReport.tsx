import { Fragment, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { getDataAuthHeaders } from "../hooks/useData";

type Movement = { entity: string; id: string; date: string; kind: string; qty: number; ref?: string };
type LiveRow = {
  itemType: "FG" | "PHP" | "PLATE";
  erp: string;
  itemName: string;
  opening: number;
  production: number;
  receiptPurchase: number;
  receiptRejection: number;
  dispatched: number;
  loadingWastage: number;
  live: number;
  movements: Movement[];
};
type LiveResponse = { cutoff: { asOn: string; cutoffDate: string } | null; rows: LiveRow[] };

const TABS: Array<{ key: LiveRow["itemType"]; label: string }> = [
  { key: "FG", label: "FG (Unit-II)" },
  { key: "PHP", label: "PHP" },
  { key: "PLATE", label: "Plate" },
];
const KIND_LABEL: Record<string, string> = {
  production: "Printed / produced",
  receiptPurchase: "FG Purchase MRR",
  receiptRejection: "Rejection In MRR",
  dispatched: "Loaded",
  loadingWastage: "Loading wastage",
};
const fmt = (value: number) => (value ? value.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "-");

export function LiveStockReport() {
  const [data, setData] = useState<LiveResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<LiveRow["itemType"]>("FG");
  const [query, setQuery] = useState("");
  const [onlyMoved, setOnlyMoved] = useState(false);
  const [open, setOpen] = useState<string>("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/live-stock", { headers: getDataAuthHeaders(false) as HeadersInit });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "Could not load live stock");
      setData(body);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.rows || [])
      .filter((row) => row.itemType === tab)
      .filter((row) => !onlyMoved || row.movements.length > 0)
      .filter((row) => !q || row.erp.toLowerCase().includes(q) || row.itemName.toLowerCase().includes(q))
      .sort((a, b) => (a.live < 0 ? -1 : 0) - (b.live < 0 ? -1 : 0) || a.itemName.localeCompare(b.itemName));
  }, [data, tab, query, onlyMoved]);
  const totals = useMemo(
    () =>
      rows.reduce(
        (sum, row) => ({
          opening: sum.opening + row.opening,
          production: sum.production + row.production,
          receipt: sum.receipt + row.receiptPurchase + row.receiptRejection,
          dispatched: sum.dispatched + row.dispatched,
          wastage: sum.wastage + row.loadingWastage,
          live: sum.live + row.live,
          negative: sum.negative + (row.live < 0 ? 1 : 0),
        }),
        { opening: 0, production: 0, receipt: 0, dispatched: 0, wastage: 0, live: 0, negative: 0 },
      ),
    [rows],
  );

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Live FG / PHP / Plate Stock</h1>
          <p className="text-sm text-slate-500">
            {data?.cutoff ? `FG: jobs from 17-Nov = printed − loaded − loading wastage; Opening = older stock from the physical count as on ${data.cutoff.asOn}, less what is loaded from it since.` : "No physical count cutoff has been set yet."}
          </p>
        </div>
        <a href="#/reports/live-stock/job-wise" className="ml-auto mr-2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-emerald-700">Job-wise FG Stock →</a>
        <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50" disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((item) => (
          <button key={item.key} onClick={() => setTab(item.key)} className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === item.key ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
            {item.label}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="absolute left-2 top-2 h-4 w-4 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ERP or item" className="rounded-md border border-slate-300 py-1.5 pl-8 pr-3 text-sm" />
        </div>
        <label className="flex items-center gap-1 text-sm text-slate-600">
          <input type="checkbox" checked={onlyMoved} onChange={(event) => setOnlyMoved(event.target.checked)} /> Only items with movement
        </label>
      </div>

      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {totals.negative > 0 && <div className="rounded-md bg-red-50 p-2 text-sm text-red-700">{totals.negative} item(s) below zero — needs reconciliation (add an adjustment row in the physical count).</div>}

      <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">ERP</th>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2 text-right">Opening</th>
              <th className="px-3 py-2 text-right">Production</th>
              <th className="px-3 py-2 text-right">Receipts</th>
              <th className="px-3 py-2 text-right">Loaded</th>
              <th className="px-3 py-2 text-right">Loading Wastage</th>
              <th className="px-3 py-2 text-right">Live Stock</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b bg-indigo-50 font-semibold">
              <td className="px-3 py-2" colSpan={2}>Total ({rows.length} items)</td>
              <td className="px-3 py-2 text-right">{fmt(totals.opening)}</td>
              <td className="px-3 py-2 text-right">{fmt(totals.production)}</td>
              <td className="px-3 py-2 text-right">{fmt(totals.receipt)}</td>
              <td className="px-3 py-2 text-right">{fmt(totals.dispatched)}</td>
              <td className="px-3 py-2 text-right">{fmt(totals.wastage)}</td>
              <td className="px-3 py-2 text-right">{fmt(totals.live)}</td>
            </tr>
            {rows.map((row) => {
              const key = `${row.itemType}|${row.erp}`;
              const negative = row.live < 0;
              return (
                <Fragment key={key}>
                  <tr className={`cursor-pointer border-b hover:bg-slate-50 ${negative ? "bg-red-50" : ""}`} onClick={() => setOpen(open === key ? "" : key)}>
                    <td className="px-3 py-1.5 font-mono">{row.erp || "(no ERP)"}</td>
                    <td className="px-3 py-1.5">{row.itemName}</td>
                    <td className="px-3 py-1.5 text-right">{fmt(row.opening)}</td>
                    <td className="px-3 py-1.5 text-right">{fmt(row.production)}</td>
                    <td className="px-3 py-1.5 text-right">{fmt(row.receiptPurchase + row.receiptRejection)}</td>
                    <td className="px-3 py-1.5 text-right">{fmt(row.dispatched)}</td>
                    <td className="px-3 py-1.5 text-right">{fmt(row.loadingWastage)}</td>
                    <td className={`px-3 py-1.5 text-right font-semibold ${negative ? "text-red-700" : "text-slate-800"}`}>
                      {row.live.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      {negative && <span className="ml-1 text-xs font-normal">needs reconciliation</span>}
                    </td>
                  </tr>
                  {open === key && (
                    <tr className="border-b bg-slate-50">
                      <td colSpan={8} className="px-6 py-2">
                        {row.movements.length === 0 ? (
                          <span className="text-xs text-slate-500">No movement since the count.</span>
                        ) : (
                          <table className="text-xs">
                            <tbody>
                              {row.movements.map((movement, index) => (
                                <tr key={`${movement.id}-${index}`}>
                                  <td className="pr-4">{movement.date}</td>
                                  <td className="pr-4">{KIND_LABEL[movement.kind] || movement.kind}</td>
                                  <td className="pr-4">{movement.ref}</td>
                                  <td className="text-right">{movement.kind === "dispatched" || movement.kind === "loadingWastage" ? "−" : "+"}{fmt(movement.qty)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
