import React, { useState, useMemo, useEffect } from "react";
import { useData } from "../hooks/useData";
import { Firm, Order, OrderSchedule } from "../types";
import { Trash2, ChevronUp, ChevronDown, Search } from "lucide-react";
import { Spinner } from "../components/Spinner";

import { Select } from "../components/Select";
import { ClientPagination } from "../components/ClientPagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { getFirmDisplayName } from "../lib/firmDisplay";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";

export function OrdersPendingScheduling() {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
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
        return sortOrder === "asc" ? cmp : -cmp;
      });
  }, [companyFilter, firmFilter, itemFilter, pendingBase, searchTerm, sortOrder]);

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
  } = useClientPagination(pending, 25);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, firmFilter, companyFilter, itemFilter, setPage]);

  const toggleSort = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  };

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
                <th
                  className="px-2 py-1.5 border border-black cursor-pointer hover:bg-slate-200 select-none"
                  onClick={toggleSort}
                >
                  <div className="flex items-center justify-center gap-1">
                    Order No
                    {sortOrder === "asc" ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </th>
                <th className="px-2 py-1.5 border border-black">Firm</th>
                <th className="px-2 py-1.5 border border-black">Company</th>
                <th className="px-2 py-1.5 border border-black">Item</th>
                <th className="px-2 py-1.5 border border-black text-right">Order Quantity</th>
                <th className="px-2 py-1.5 border border-black text-right">Scheduled Qty</th>
                <th className="px-2 py-1.5 border border-black text-right">Pending Scheduling</th>
                <th className="px-2 py-1.5 border border-black">Unit</th>
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
        {modalOpen && modalOrderId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded border border-black bg-white shadow-lg">
              <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
                <h3 className="font-bold">Schedule Order {orders.find(o=>o.id===modalOrderId)?.orderNo}</h3>
                <div className="flex gap-2">
                  <button onClick={() => { setModalOpen(false); setModalOrderId(null); }} className="bg-white border border-black px-3 py-1 rounded">Close</button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3">
              <div className="grid grid-cols-3 gap-4 mb-3">
                <div className="bg-slate-50 p-2 border border-black rounded">
                  <div className="text-xs text-slate-600">Total Order Qty</div>
                  <div className="font-bold text-lg">{formatQty(orders.find(o=>o.id===modalOrderId)?.qty ?? 0)}</div>
                </div>
                <div className="bg-slate-50 p-2 border border-black rounded">
                  <div className="text-xs text-slate-600">Total Scheduled Qty</div>
                  <div className="font-bold text-lg">{formatQty(displayedTotalScheduled(modalOrderId))}</div>
                </div>
                <div className="bg-slate-50 p-2 border border-black rounded">
                  <div className="text-xs text-slate-600">Yet To Schedule</div>
                  <div className="font-bold text-lg">{formatQty((orders.find(o=>o.id===modalOrderId)?.qty ?? 0) - displayedTotalScheduled(modalOrderId))}</div>
                </div>
              </div>

              <div className="mb-3 overflow-x-auto">
              <table className="min-w-[520px] w-full divide-y divide-black border-collapse border border-black">
                <thead className="sticky top-0 z-30 bg-slate-100">
                  <tr>
                    <th className="px-3 py-2 border border-black">S.No</th>
                    <th className="px-3 py-2 border border-black">Scheduled Date</th>
                    <th className="px-3 py-2 border border-black">Scheduled Quantity</th>
                    <th className="px-3 py-2 border border-black">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {modalRows.map((r, idx) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 border border-black">{idx + 1}</td>
                      <td className="px-3 py-2 border border-black"><input type="date" min={today} value={r.scheduledDate} onChange={(e)=>handleChangeRow(r.id, 'scheduledDate', e.target.value)} className="border-2 border-black rounded p-1" /></td>
                      <td className="px-3 py-2 border border-black"><input type="number" min={0} step="any" value={(r as any).qty ?? ''} onChange={(e)=>handleChangeRow(r.id, 'qty', e.target.value)} className="border-2 border-black rounded p-1 w-40" /></td>
                      <td className="px-3 py-2 border border-black text-center"><button onClick={()=>handleDeleteRow(r.id)} aria-label="Delete schedule" className="text-red-600"><Trash2 size={18} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              </div>

              <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3">
              <div className="flex gap-2">
                {(() => {
                  const order = orders.find(o => o.id === modalOrderId);
                  const yetTo = (order ? Number(order.qty || 0) - displayedTotalScheduled(modalOrderId) : 0);
                  return (
                    <button onClick={() => modalOrderId && handleAddRow(modalOrderId)} disabled={yetTo <= 0} className={`bg-indigo-600 text-white px-3 py-1 rounded ${yetTo <= 0 ? 'opacity-50 cursor-not-allowed' : ''}`}>Add Row</button>
                  );
                })()}

                <button onClick={async () => { const saved = await handleSave(modalOrderId!); if (saved) { setModalOpen(false); setModalOrderId(null); } }} disabled={saving} className="bg-emerald-600 text-white px-3 py-1 rounded flex items-center gap-2">
                  {saving ? <Spinner size={16} /> : null}
                  <span>Save</span>
                </button>
              </div>

              {modalError && <div className="text-sm text-red-600 mt-2">{modalError}</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
