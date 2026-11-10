import React, { useState, useMemo, useEffect } from "react";
import { useData } from "../hooks/useData";
import { Firm, Order, OrderSchedule } from "../types";
import { Trash2, Search, Plus, X } from "lucide-react";
import { Spinner } from "../components/Spinner";

import { Select } from "../components/Select";
import { ClientPagination } from "../components/ClientPagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { getFirmDisplayName } from "../lib/firmDisplay";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";

export function OrdersPendingScheduling() {
  const [searchTerm, setSearchTerm] = useState('');
  const [firmFilter, setFirmFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');

  const [orders, setOrders] = useData<Order>("orders", [], { firmScope: "all" });
  const [schedules, setSchedules] = useData<OrderSchedule>("orders_schedule", [], { firmScope: "all" });
  const [companies] = useData("companies", []);
  const [firms] = useData<Firm>("firms", []);
  const { resolveOrderItem } = useOrderItemCatalog();

  const getFirmName = (order?: Order | null, schedule?: OrderSchedule | null) => {
    const directFirmId = String(schedule?.firmId || order?.firmId || "").trim();
    const firm = firms.find((entry) => entry.id === directFirmId);
    if (firm) return getFirmDisplayName(firm);
    const directName = String(schedule?.firmName || order?.firmName || "").trim();
    return directName ? getFirmDisplayName({ firmName: directName }) : "Unassigned";
  };

  const rowsFor = (orderId: string) => schedules.filter(s => s.orderId === orderId);

  const totalScheduled = (orderId: string) => rowsFor(orderId).reduce((sum, r) => sum + (Number((r as any).qty) || 0), 0);

  const formatQty = (value: unknown) => {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n)) return String(value ?? "");
    const rounded = Math.round(n);
    return Math.abs(n - rounded) < 1e-9 ? String(rounded) : String(n);
  };

  const today = new Date().toISOString().slice(0, 10);
  
  const pendingBase = useMemo(() => {
    return orders
      .filter((order) => order.status === "Pending Scheduling")
      .map((order) => {
        const item = resolveOrderItem(order);
        const firmName = getFirmName(order);
        const companyName = (companies as any[]).find((company) => company.id === order.companyId)?.name || "";
        const scheduledQty = totalScheduled(order.id);
        const pendingQty = Number(order.qty || 0) - scheduledQty;
        return { order, item, firmName, companyName, scheduledQty, pendingQty };
      })
      .filter(({ pendingQty }) => pendingQty > 0);
  }, [companies, firms, orders, resolveOrderItem, schedules]);

  const getItemKey = (item: ReturnType<typeof resolveOrderItem>) => String(item?.id || item?.name || "").trim();

  const pending = useMemo(() => {
    const words = searchWords(searchTerm);
    return pendingBase
      .filter(({ order }) => !firmFilter || String(order.firmId || "") === firmFilter)
      .filter(({ order }) => !companyFilter || String(order.companyId || "") === companyFilter)
      .filter(({ item }) => !itemFilter || getItemKey(item) === itemFilter)
      .filter(({ order, item, firmName, companyName, pendingQty, scheduledQty }) => matchesTableSearch([
        order.orderNo,
        firmName,
        companyName,
        item?.name,
        formatQty(order.qty),
        formatQty(scheduledQty),
        formatQty(pendingQty),
        item?.uom,
      ], words))
      .sort((a, b) => {
        const aNo = a.order.orderNo || "";
        const bNo = b.order.orderNo || "";
        const cmp = aNo.localeCompare(bNo, undefined, { numeric: true, sensitivity: "base" });
        return -cmp;
      });
  }, [companyFilter, firmFilter, itemFilter, pendingBase, searchTerm]);

  const { sorted: sortedPending, sort, toggle: toggleSort } = useTableSort(pending, (row, key) => {
    switch (key) {
      case "orderNo": return row.order.orderNo;
      case "firm": return row.firmName;
      case "company": return row.companyName;
      case "item": return row.item?.name;
      case "qty": return Number(row.order.qty || 0);
      case "scheduled": return row.scheduledQty;
      case "pending": return row.pendingQty;
      case "uom": return row.item?.uom;
      default: return "";
    }
  });

  const firmOptions = useMemo(() => {
    const map = new Map<string, string>();
    pendingBase.forEach(({ order, firmName }) => {
      const id = String(order.firmId || "").trim();
      if (id && !map.has(id)) map.set(id, firmName);
    });
    return Array.from(map, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [pendingBase]);
  const companyOptions = useMemo(() => {
    const map = new Map<string, string>();
    pendingBase.forEach(({ order, companyName }) => {
      const id = String(order.companyId || "").trim();
      if (id && companyName && !map.has(id)) map.set(id, companyName);
    });
    return Array.from(map, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [pendingBase]);
  const itemOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; searchText: string }>();
    pendingBase.forEach(({ item }) => {
      const key = getItemKey(item);
      if (!key || map.has(key) || !item?.name) return;
      map.set(key, { value: key, label: item.name, searchText: `${item.name} ${item.erp || ""}` });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [pendingBase]);

  const filtersActive = Boolean(searchTerm.trim() || firmFilter || companyFilter || itemFilter);
  const clearFilters = () => {
    setSearchTerm(""); setFirmFilter(""); setCompanyFilter(""); setItemFilter("");
  };

  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalItems,
    paginatedItems: paginatedPending,
  } = useClientPagination(sortedPending, 25);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, firmFilter, companyFilter, itemFilter, setPage]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalOrderId, setModalOrderId] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalRows, setModalRows] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  // Initialize modalRows when opening modal for an order
  React.useEffect(() => {
    if (modalOpen && modalOrderId) {
      const existing = rowsFor(modalOrderId).map(r => ({ ...r, qty: (r as any).qty != null ? String((r as any).qty) : '' }));
      setModalRows(existing);
      setModalError(null);
    }
  }, [modalOpen, modalOrderId]);

  const displayedTotalScheduled = (orderId: string | null) => {
    if (!orderId) return 0;
    if (modalOpen && modalOrderId === orderId) return modalRows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
    return totalScheduled(orderId);
  };

  

  const handleAddRow = (orderId: string) => {
    const order = orders.find((entry) => entry.id === orderId);
    const newRow: any = {
      id: crypto.randomUUID(),
      orderId,
      firmId: order?.firmId || "",
      firmName: getFirmName(order),
      scheduledDate: today,
      _isNew: true,
      qty: '',
      producedQty: 0,
      canceledQty: 0
    };
    setModalRows(prev => [...prev, newRow]);
  };

  const handleChangeRow = (id: string, field: keyof OrderSchedule, value: any) => {
    if (!modalOrderId) return;
    const order = orders.find(o => o.id === modalOrderId);
    if (!order) return;

    if (field === 'qty') {
      // compute prospective total from modalRows
      const rows = modalRows.map(r => r.id === id ? { ...r, qty: value } : r);
      const prospectiveTotal = rows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0);
      if (value !== '' && (isNaN(Number(value)) || Number(value) < 0)) return;
      if (prospectiveTotal > Number(order.qty || 0)) {
        setModalError('Total scheduled would exceed order quantity. Reduce the value.');
        return;
      }
      setModalError(null);
      setModalRows(rows);
      return;
    }

    if (field === "scheduledDate") {
      if (value < today) {
        setModalError("Previous date scheduling is not allowed.");
        return;
      }
      setModalError(null);
    }

    setModalRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleDeleteRow = (id: string) => {
    // delete from modalRows when modal open
    if (modalOpen) {
      setModalRows(prev => prev.filter(r => r.id !== id));
      setModalError(null);
      return;
    }
    setSchedules(prev => prev.filter(r => r.id !== id));
  };

  const handleSave = (orderId: string) => {
    return (async () => {
      const order = orders.find(o => o.id === orderId);
      if (!order) return false;
      const rows = modalRows;
      if (rows.some(r => (r as any).qty === '' || (r as any).qty === undefined)) {
        setModalError('Please fill or delete any empty scheduled quantities before saving');
        return false;
      }

      const total = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
      if (total > Number(order.qty || 0)) {
        setModalError('Total scheduled quantity exceeds order quantity');
        return false;
      }
      if (rows.some((r) => (r.scheduledDate || "") < today)) {
        setModalError("Previous date scheduling is not allowed.");
        return false;
      }

      setSaving(true);
      try {
        // Prepare rows to persist (convert qty to number and remove internal fields)
        const rowsToSave = rows.map(r => {
          const { _isNew, ...rest } = r as any;
          return {
            ...rest,
            firmId: order.firmId || rest.firmId || "",
            firmName: getFirmName(order, rest),
            qty: Number(rest.qty),
            producedQty: Number(rest.producedQty || 0),
            canceledQty: Number(rest.canceledQty || 0),
          };
        });

        // Persist: Replace existing rows for this order with rowsToSave
        await setSchedules(prev => {
          const others = prev.filter(p => p.orderId !== orderId);
          return [...others, ...rowsToSave];
        });

        const nextStatus = total === Number(order.qty || 0) ? "Scheduled" : "Pending Scheduling";
        await setOrders(prev =>
          prev.map(o =>
            o.id === orderId
              ? { ...o, status: nextStatus, updatedBy: 'System User', updateTimestamp: new Date().toISOString() }
              : o
          )
        );

        setModalError(null);
        setModalRows([]);
        return true;
      } catch (err) {
        console.error('Error saving schedule:', err);
        setModalError('Failed to save schedule. Try again.');
        return false;
      } finally {
        setSaving(false);
      }
    })();
  };

  return (
    <div className="space-y-4">
      <div className="border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">Pending Scheduling</h2>
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
          <div className="col-span-2 min-w-0 md:col-span-1"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Company</span><Select compact value={companyFilter} onChange={setCompanyFilter} options={companyOptions} placeholder="All" /></div>
          <div className="col-span-2 min-w-0 md:col-span-1"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Item</span><Select compact value={itemFilter} onChange={setItemFilter} options={itemOptions} placeholder="All" /></div>
        </div>
        <div data-mf-actions="true" className="flex justify-end gap-2">
          {filtersActive ? (
            <button type="button" onClick={clearFilters} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button>
          ) : null}
          <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="overflow-x-auto rounded border border-black bg-white">
          <table className="min-w-full border-collapse border border-black text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-2 py-1.5 border border-black text-right">S.No</th>
                <th className="px-2 py-1.5 border border-black"><SortHeader label="Order No" sortKey="orderNo" sort={sort} onToggle={toggleSort} align="center" /></th>
                <th className="px-2 py-1.5 border border-black"><SortHeader label="Firm" sortKey="firm" sort={sort} onToggle={toggleSort} align="center" /></th>
                <th className="px-2 py-1.5 border border-black"><SortHeader label="Company" sortKey="company" sort={sort} onToggle={toggleSort} align="center" /></th>
                <th className="px-2 py-1.5 border border-black"><SortHeader label="Item" sortKey="item" sort={sort} onToggle={toggleSort} align="center" /></th>
                <th className="px-2 py-1.5 border border-black text-right"><SortHeader label="Order Quantity" sortKey="qty" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-2 py-1.5 border border-black text-right"><SortHeader label="Scheduled Qty" sortKey="scheduled" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-2 py-1.5 border border-black text-right"><SortHeader label="Pending Scheduling" sortKey="pending" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-2 py-1.5 border border-black"><SortHeader label="Unit" sortKey="uom" sort={sort} onToggle={toggleSort} align="center" /></th>
                <th className="px-2 py-1.5 border border-black">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedPending.length === 0 ? (
                <tr><td colSpan={10} className="h-16" aria-label="No records" /></tr>
              ) : paginatedPending.map(({ order: o, item, firmName, companyName, scheduledQty: sched, pendingQty: pendingSched }, idx) => {
                return (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="px-2 py-1.5 border border-black text-right tabular-nums">{(page - 1) * pageSize + idx + 1}</td>
                    <td className="px-2 py-1.5 border border-black">{o.orderNo}</td>
                    <td className="px-2 py-1.5 border border-black font-semibold">{firmName}</td>
                    <td className="px-2 py-1.5 border border-black">{companyName || "-"}</td>
                    <td className="px-2 py-1.5 border border-black">{item?.name || "-"}</td>
                    <td className="px-2 py-1.5 border border-black text-right tabular-nums">{formatQty(o.qty)}</td>
                    <td className="px-2 py-1.5 border border-black text-right tabular-nums">{formatQty(sched)}</td>
                    <td className="px-2 py-1.5 border border-black text-right tabular-nums font-bold text-indigo-700">{formatQty(pendingSched)}</td>
                    <td className="px-2 py-1.5 border border-black">{item?.uom || "-"}</td>
                    <td className="px-2 py-1.5 border border-black text-center"><button onClick={() => { setModalOrderId(o.id); setModalOpen(true); }} className="bg-indigo-600 text-white px-3 py-1 rounded">Schedule</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ClientPagination
          page={page}
          pageSize={pageSize}
          totalItems={totalItems}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
        {/* Modal scheduler */}
        {modalOpen && modalOrderId && (() => {
          const modalOrder = orders.find((o) => o.id === modalOrderId);
          const totalOrderQty = Number(modalOrder?.qty ?? 0);
          const scheduledQty = displayedTotalScheduled(modalOrderId);
          const yetTo = totalOrderQty - scheduledQty;
          const closeModal = () => { setModalOpen(false); setModalOrderId(null); };
          return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
            <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-xl border-2 border-black bg-white shadow-2xl sm:rounded-xl">
              <div className="flex shrink-0 items-center justify-between gap-3 border-b-2 border-black px-4 py-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Schedule Order</div>
                  <div className="truncate text-base font-black text-black">{modalOrder?.orderNo || "-"}</div>
                </div>
                <button type="button" onClick={closeModal} aria-label="Close" title="Close" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border-2 border-black bg-white text-black hover:bg-slate-100">
                  <X size={18} />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border-2 border-black bg-indigo-50 p-2 text-indigo-900">
                    <div className="text-[10px] font-black uppercase leading-tight">Order Qty</div>
                    <div className="text-lg font-black tabular-nums">{formatQty(totalOrderQty)}</div>
                  </div>
                  <div className="rounded-lg border-2 border-black bg-emerald-50 p-2 text-emerald-900">
                    <div className="text-[10px] font-black uppercase leading-tight">Scheduled</div>
                    <div className="text-lg font-black tabular-nums">{formatQty(scheduledQty)}</div>
                  </div>
                  <div className={`rounded-lg border-2 border-black p-2 ${yetTo < 0 ? "bg-red-100 text-red-800" : "bg-amber-50 text-amber-900"}`}>
                    <div className="text-[10px] font-black uppercase leading-tight">Yet To Schedule</div>
                    <div className="text-lg font-black tabular-nums">{formatQty(yetTo)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)_36px] items-center gap-2 border-b border-black pb-1 text-[10px] font-black uppercase text-slate-600">
                  <span>#</span><span>Date</span><span>Quantity</span><span />
                </div>
                <div className="space-y-2">
                  {modalRows.map((r, idx) => (
                    <div key={r.id} className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)_36px] items-center gap-2">
                      <span className="text-sm font-black text-slate-500">{idx + 1}</span>
                      <input type="date" min={today} value={r.scheduledDate} onChange={(e) => handleChangeRow(r.id, 'scheduledDate', e.target.value)} aria-label="Scheduled date" className="h-10 w-full min-w-0 rounded border-2 border-black px-2 text-sm font-semibold" />
                      <input type="number" min={0} step="any" inputMode="decimal" value={(r as any).qty ?? ''} onChange={(e) => handleChangeRow(r.id, 'qty', e.target.value)} aria-label="Scheduled quantity" className="h-10 w-full min-w-0 rounded border-2 border-black px-2 text-right text-sm font-bold tabular-nums" />
                      <button type="button" onClick={() => handleDeleteRow(r.id)} aria-label="Delete schedule" title="Delete" className="inline-flex h-9 w-9 items-center justify-center rounded-md border-2 border-red-600 bg-white text-red-600 hover:bg-red-50">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => modalOrderId && handleAddRow(modalOrderId)}
                    disabled={yetTo <= 0}
                    title="Add schedule row"
                    aria-label="Add schedule row"
                    className="indent-line-action inline-flex h-10 w-10 items-center justify-center rounded-md bg-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Plus size={18} />
                  </button>
                </div>
                {modalError && <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{modalError}</div>}
              </div>

              <div className="shrink-0 border-t-2 border-black bg-white px-4 py-3">
                <button
                  type="button"
                  onClick={async () => { const saved = await handleSave(modalOrderId!); if (saved) closeModal(); }}
                  disabled={saving}
                  className="inline-flex w-full items-center justify-center gap-2 rounded bg-black px-6 py-3 text-sm font-black uppercase tracking-widest text-white hover:bg-slate-800 disabled:opacity-40"
                >
                  {saving ? <Spinner size={16} className="text-white" /> : null}
                  <span>Save</span>
                </button>
              </div>
            </div>
          </div>
          );
        })()}
      </div>
    </div>
  );
}
