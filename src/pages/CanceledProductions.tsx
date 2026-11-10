import React, { useMemo, useState } from "react";
import { useData } from "../hooks/useData";
import { Production, OrderSchedule, Order, Company, Firm } from "../types";
import { formatDate } from "../lib/serial";
import { Select } from "../components/Select";
import { RefreshCw, Search } from "lucide-react";
import { Spinner } from "../components/Spinner";
import { useNpdItemsWithoutStock } from "../hooks/useNpdItems";
import { useConfirm } from "../components/ConfirmDialog";
import { getFirmDisplayNameById } from "../lib/firmDisplay";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";

function toLocalYmd(value?: string | null) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text.slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function CanceledProductions() {
  const confirm = useConfirm();
  const [productions, setProductions] = useData<Production>("productions", []);
  const npdItems = useNpdItemsWithoutStock();
  const [schedules, setSchedules] = useData<OrderSchedule>("orders_schedule", []);
  const [orders] = useData<Order>("orders", []);
  const [companies] = useData<Company>("companies", []);
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  
  const [searchTerm, setSearchTerm] = useState("");
  const [firmFilter, setFirmFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [fromDateFilter, setFromDateFilter] = useState("");
  const [toDateFilter, setToDateFilter] = useState("");
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const handleActivate = async (id: string) => {
    const prod = productions.find(p => p.id === id);
    if (!prod) return;

    if (!await confirm("Are you sure you want to activate this canceled job? It will return to Pending Consumption.")) return;

    setActivatingId(id);
    try {
      const timestamp = new Date().toISOString();
      
      // 1. Re-activate production entry
      await setProductions(prev => prev.map(p => 
        p.id === id ? { 
          ...p, 
          status: "Pending Consumption", 
          cancelTimestamp: null as any, 
          cancelEmailId: null as any, 
          cancelRemarks: null as any,
          updateTimestamp: timestamp 
        } : p
      ));

      // 2. Re-deduct from schedule producedQty (it was subtracted on cancel)
      if (prod.scheduleId) {
        await setSchedules(prev => prev.map(s => 
          s.id === prod.scheduleId ? {
            ...s,
            producedQty: Number(s.producedQty || 0) + Number(prod.qty || 0),
            updateTimestamp: timestamp,
            updatedBy: "System User (Activate)"
          } : s
        ));
      }
    } catch (err) {
      console.error("Failed to activate production:", err);
    } finally {
      setActivatingId(null);
    }
  };

const canceledProductions = useMemo(() => productions.filter((production) => production.status === "Cancelled"), [productions]);

  const filteredList = useMemo(() => {
    const words = searchWords(searchTerm);
    return canceledProductions
      .filter((production) => {
        const item = npdItems.find((row) => row.id === production.itemId);
        const schedule = schedules.find((row) => row.id === production.scheduleId);
        const order = orders.find((row) => row.id === schedule?.orderId);
        const firmId = String(schedule?.firmId || production.firmId || production.orderFirmId || order?.firmId || "");
        if (firmFilter && firmId !== firmFilter) return false;
        if (itemFilter && String(production.itemId || "") !== itemFilter) return false;
        const cancelYmd = toLocalYmd(production.cancelTimestamp);
        if (fromDateFilter && (!cancelYmd || cancelYmd < fromDateFilter)) return false;
        if (toDateFilter && (!cancelYmd || cancelYmd > toDateFilter)) return false;
        if (!words.length) return true;
        return matchesTableSearch([
          production.transactionNo,
          order?.orderNo,
          getFirmDisplayNameById(firmId, firms),
          item?.name || "Unknown",
          [production.qty, `${production.qty} ${production.uom || ""}`],
          production.cancelTimestamp,
          production.cancelRemarks,
        ], words);
      })
      .sort((a, b) => b.transactionNo.localeCompare(a.transactionNo, undefined, { numeric: true, sensitivity: "base" }));
  }, [canceledProductions, companies, firmFilter, firms, fromDateFilter, itemFilter, npdItems, orders, schedules, searchTerm, toDateFilter]);

  const firmOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string }>();
    canceledProductions.forEach((production) => {
      const schedule = schedules.find((row) => row.id === production.scheduleId);
      const order = orders.find((row) => row.id === schedule?.orderId);
      const firmId = String(schedule?.firmId || production.firmId || production.orderFirmId || order?.firmId || "");
      if (firmId && !map.has(firmId)) map.set(firmId, { value: firmId, label: getFirmDisplayNameById(firmId, firms) });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [canceledProductions, firms, orders, schedules]);
  const itemOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string }>();
    canceledProductions.forEach((production) => {
      const itemId = String(production.itemId || "");
      if (!itemId || map.has(itemId)) return;
      const name = npdItems.find((row) => row.id === production.itemId)?.name;
      if (name) map.set(itemId, { value: itemId, label: name });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [canceledProductions, npdItems]);
  const hasActiveFilters = Boolean(searchTerm.trim() || firmFilter || itemFilter || fromDateFilter || toDateFilter);
  const clearFilters = () => { setSearchTerm(""); setFirmFilter(""); setItemFilter(""); setFromDateFilter(""); setToDateFilter(""); };

  const { sorted: sortedList, sort, toggle: toggleSort } = useTableSort(filteredList, (p, key) => {
    const schedule = schedules.find((s) => s.id === p.scheduleId);
    const order = orders.find((o) => o.id === schedule?.orderId);
    if (key === "transactionNo") return p.transactionNo;
    if (key === "orderNo") return order?.orderNo || "";
    if (key === "firm") return getFirmDisplayNameById(String(schedule?.firmId || p.firmId || p.orderFirmId || order?.firmId || ""), firms);
    if (key === "item") return npdItems.find((i) => i.id === p.itemId)?.name || "Unknown";
    if (key === "qty") return Number(p.qty || 0);
    if (key === "cancelDate") return p.cancelTimestamp || "";
    if (key === "cancelRemarks") return p.cancelRemarks || "";
    return "";
  }, [schedules, orders, firms, npdItems]);

  return (
    <div className="space-y-6">
      <div className="border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">Canceled Jobs (Productions)</h2>
      </div>

      <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Firm</span><Select compact value={firmFilter} onChange={setFirmFilter} options={firmOptions} placeholder="All" /></div>
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Item</span><Select compact value={itemFilter} onChange={setItemFilter} options={itemOptions} placeholder="All" /></div>
          <div data-date-pair="true" className="col-span-2 grid min-w-0 grid-cols-2 gap-2 sm:min-w-[260px]">
            <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Cancel From Date</span><input type="date" value={fromDateFilter} max={toDateFilter || undefined} onChange={(e) => setFromDateFilter(e.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
          <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Cancel To Date</span><input type="date" value={toDateFilter} min={fromDateFilter || undefined} onChange={(e) => setToDateFilter(e.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
          </div>
        </div>
        <div data-mf-actions="true" className="flex justify-end gap-2">
          {hasActiveFilters ? (
            <button type="button" onClick={clearFilters} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button>
          ) : null}
          <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
        </div>
      </div>

      {/* Phone cards */}
      {filteredList.length > 0 ? (
        <div className="space-y-3 md:hidden">
          {sortedList.map((p) => {
            const schedule = schedules.find((s) => s.id === p.scheduleId);
            const order = orders.find((o) => o.id === schedule?.orderId);
            const firmId = String(schedule?.firmId || p.firmId || p.orderFirmId || order?.firmId || "");
            return (
              <div key={p.id} className="rounded-md border-2 border-black bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-black">{p.transactionNo}</div>
                    <div className="text-xs font-semibold text-slate-600">{order?.orderNo || "-"} · {getFirmDisplayNameById(firmId, firms)}</div>
                  </div>
                  <span className="shrink-0 text-xs font-bold text-slate-600">{p.cancelTimestamp ? formatDate(p.cancelTimestamp) : "-"}</span>
                </div>
                <div className="mt-1 text-sm font-bold">{npdItems.find((i) => i.id === p.itemId)?.name || "Unknown"}</div>
                <div className="mt-1 text-xs font-bold">Qty: {p.qty} {p.uom}</div>
                {p.cancelRemarks ? <div className="mt-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">{p.cancelRemarks}</div> : null}
                <button type="button" onClick={() => handleActivate(p.id)} disabled={activatingId === p.id} className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded border-2 border-black bg-emerald-600 px-3 py-2 text-xs font-black uppercase text-white disabled:opacity-50">
                  {activatingId === p.id ? <Spinner size={12} /> : <RefreshCw size={12} />}
                  Activate
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className={`${filteredList.length === 0 ? "block" : "hidden md:block"} overflow-x-auto rounded border border-black bg-white`}>
          <table className="min-w-full divide-y divide-black border-collapse border border-black">
            <thead className="bg-slate-100 divide-x divide-black">
              <tr className="divide-x divide-black">
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap">SL No</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Job No." sortKey="transactionNo" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Order No." sortKey="orderNo" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Firm" sortKey="firm" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Item Name" sortKey="item" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Qty" sortKey="qty" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Cancel Date" sortKey="cancelDate" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Cancel Reason" sortKey="cancelRemarks" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-center text-xs font-bold text-black uppercase border border-black whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black bg-white">
              {filteredList.length === 0 ? (
                <tr><td colSpan={9} className="h-16" aria-label="No records" /></tr>
              ) : (
                sortedList.map((p, index) => {
                  const schedule = schedules.find(s => s.id === p.scheduleId);
                  const order = orders.find(o => o.id === schedule?.orderId);
                  const firmId = String(schedule?.firmId || p.firmId || p.orderFirmId || order?.firmId || "");
                  
                  return (
                    <tr key={p.id} className="hover:bg-red-50 divide-x divide-black transition-colors">
                      <td className="px-4 py-4 text-xs font-bold text-black border border-black whitespace-nowrap">{index + 1}</td>
                      <td className="px-4 py-4 text-xs font-bold text-black border border-black whitespace-nowrap">{p.transactionNo}</td>
                      <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">{order?.orderNo || "-"}</td>
                      <td className="px-4 py-4 text-xs font-semibold text-black border border-black whitespace-nowrap">{getFirmDisplayNameById(firmId, firms)}</td>
                      <td className="px-4 py-4 text-xs text-black border border-black min-w-[150px]">{npdItems.find(i => i.id === p.itemId)?.name || "Unknown"}</td>
                      <td className="px-4 py-4 text-right text-xs font-medium text-black border border-black whitespace-nowrap">{p.qty} {p.uom}</td>
                      <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">{p.cancelTimestamp ? formatDate(p.cancelTimestamp) : "-"}</td>
                      <td className="px-4 py-4 text-xs text-red-700 font-medium border border-black">{p.cancelRemarks || "-"}</td>
                      <td className="px-4 py-4 text-center text-xs font-medium border border-black whitespace-nowrap">
                        <button 
                          onClick={() => handleActivate(p.id)} 
                          disabled={activatingId === p.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 text-white font-black uppercase tracking-widest border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all disabled:opacity-50"
                        >
                          {activatingId === p.id ? <Spinner size={12} /> : <RefreshCw size={12} />}
                          Activate
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
      </div>
    </div>
  );
}
