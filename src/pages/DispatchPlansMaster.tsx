import React, { useMemo, useState } from "react";

import { Select } from "../components/Select";
import { useData } from "../hooks/useData";
import { DispatchPlan, Truck, Order, Company, OrderSchedule, LoadingSlip } from "../types";
import { formatDate } from "../lib/serial";
import { matchesTableSearch, rowSearchText, searchWords } from "../lib/tableSearch";
import { Pencil, Save, Search, Trash2, X } from "lucide-react";
import { useNpdItemsWithoutStock } from "../hooks/useNpdItems";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { ClientPagination } from "../components/ClientPagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { SortHeader, useTableSort } from "../lib/tableSort";
import { getFirmDisplayNameById, getFirmOptions } from "../lib/firmDisplay";
import { useAuth } from "../auth/AuthContext";
import { canManageMasterRecords } from "../lib/masterPermissions";

export function DispatchPlansMaster() {
  const { user, setActiveFirm } = useAuth();
  const canManage = canManageMasterRecords(user?.role);
  const [searchTerm, setSearchTerm] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');


  const [plans, setPlans] = useData<DispatchPlan>("dispatch_plans", [], { firmScope: "all", storageKey: "dispatch-plans-all-firms" });
  const [trucks] = useData<Truck>("trucks", []);
  const [orders] = useData<Order>("orders", [], { firmScope: "all", storageKey: "orders-all-firms" });
  const [companies] = useData<Company>("companies", [], { firmScope: "all", storageKey: "companies-all-firms" });
  const npdItems = useNpdItemsWithoutStock();
  const { resolveOrderItem } = useOrderItemCatalog();
  const [schedules] = useData<OrderSchedule>("orders_schedule", [], { firmScope: "all", storageKey: "orders-schedule-all-firms" });
  const [loadingSlips] = useData<LoadingSlip>("loading_slips", [], { firmScope: "all", storageKey: "loading-slips-all-firms" });
  const [firms] = useData<any>("firms", [], { firmScope: "all", storageKey: "firms-all" });
  const [firmFilter, setFirmFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [balanceFilter, setBalanceFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ date: string; truckId: string; plannedQty: string }>({
    date: "",
    truckId: "",
    plannedQty: "",
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleDelete = (id: string) => {
    if (deletingId !== id) {
      setDeletingId(id);
      setTimeout(() => setDeletingId(null), 3000);
      return;
    }
    setPlans(plans.filter(p => p.id !== id));
    setDeletingId(null);
  };

  const loadingSlipPlanIds = useMemo(() => {
    const ids = new Set<string>();
    loadingSlips.forEach((slip) => {
      if (slip.status === "Cancelled") return;
      slip.lines.forEach((line) => {
        const planId = String(line.dispatchPlanId || "").trim();
        if (planId) ids.add(planId);
      });
    });
    return ids;
  }, [loadingSlips]);

  const openEditModal = (plan: DispatchPlan) => {
    const order = orders.find((row) => row.id === plan.orderId);
    const firmId = String(order?.firmId || plan.orderFirmId || plan.firmId || schedules.find((row) => row.id === plan.scheduleId)?.firmId || "");
    const firm = firms.find((row: any) => row.id === firmId);
    if (!firm) { alert("Original order firm could not be resolved."); return; }
    setActiveFirm(firm);
    setEditingPlanId(plan.id);
    setEditForm({
      date: String(plan.date || "").slice(0, 10),
      truckId: String(plan.truckId || ""),
      plannedQty: String(Number(plan.plannedQty || 0)),
    });
  };

  const closeEditModal = () => {
    if (isSaving) return;
    setEditingPlanId(null);
    setEditForm({ date: "", truckId: "", plannedQty: "" });
  };

  const editingPlan = editingPlanId ? plans.find((plan) => plan.id === editingPlanId) || null : null;
  const editingSchedule = editingPlan ? schedules.find((schedule) => schedule.id === editingPlan.scheduleId) || null : null;
  const editingOrder = editingPlan ? orders.find((order) => order.id === editingPlan.orderId) || null : null;
  const editingCompany = editingOrder ? companies.find((company) => company.id === editingOrder.companyId) || null : null;
  const editingTolerancePercent = Math.max(0, Number(editingCompany?.toleranceAllowed || 0));
  const editingLoaded = Number(editingPlan?.loadedQty || 0);
  const editingCancelled = Number(editingPlan?.canceledQty || 0);
  const otherEffectivePlanned = editingPlan
    ? plans
        .filter((plan) => plan.scheduleId === editingPlan.scheduleId && plan.id !== editingPlan.id)
        .reduce((sum, plan) => sum + Math.max(0, Number(plan.plannedQty || 0) - Number(plan.canceledQty || 0)), 0)
    : 0;
  const baseEditableScheduleQty = editingSchedule
    ? Math.max(0, Number(editingSchedule.qty || 0) - Number(editingSchedule.canceledQty || 0))
    : 0;
  const toleratedEditableScheduleQty = Number((baseEditableScheduleQty * (1 + editingTolerancePercent / 100)).toFixed(2));
  const maxEditablePlannedQty = editingSchedule
    ? Math.max(
        editingLoaded + editingCancelled,
        toleratedEditableScheduleQty - otherEffectivePlanned + editingCancelled
      )
    : Infinity;

  const handleSaveEdit = async () => {
    if (!editingPlan) return;
    if (loadingSlipPlanIds.has(editingPlan.id)) {
      alert("Dispatch plan cannot be edited after loading slip creation.");
      closeEditModal();
      return;
    }

    const plannedQty = Number(editForm.plannedQty || 0);
    if (!editForm.date) {
      alert("Please enter plan date.");
      return;
    }
    if (!Number.isFinite(plannedQty) || plannedQty <= 0) {
      alert("Planned qty must be greater than 0.");
      return;
    }
    if (plannedQty < editingLoaded + editingCancelled) {
      alert("Planned qty cannot be less than loaded qty plus cancelled qty.");
      return;
    }
    if (Number.isFinite(maxEditablePlannedQty) && plannedQty > maxEditablePlannedQty) {
      alert(`Planned qty cannot exceed ${maxEditablePlannedQty.toLocaleString()}.`);
      return;
    }

    const nextPlan: DispatchPlan = {
      ...editingPlan,
      date: editForm.date,
      truckId: editForm.truckId,
      plannedQty,
      updatedBy: window.localStorage.getItem("userName") || editingPlan.updatedBy || "Admin",
      updateTimestamp: new Date().toISOString(),
    };

    try {
      setIsSaving(true);
      await setPlans((prev) => prev.map((plan) => (plan.id === nextPlan.id ? nextPlan : plan)));
      closeEditModal();
    } catch (error) {
      console.error("Failed to update dispatch plan:", error);
      alert("Failed to update dispatch plan.");
    } finally {
      setIsSaving(false);
    }
  };

  const dispatchFilterRows = useMemo(() => {
    const orderById = new Map(orders.map((o) => [o.id, o]));
    const companyById = new Map(companies.map((c) => [c.id, c]));
    const scheduleFirm = new Map(schedules.map((row) => [row.id, row.firmId]));
    return plans.map((plan) => {
      const order = orderById.get(plan.orderId);
      const company = companyById.get(order?.companyId as string);
      const item = resolveOrderItem(order);
      const companyName = String(company?.name || "").trim();
      const itemName = String(item?.name || "").trim();
      const itemErp = String(order?.erpCode || item?.erp || "").trim();
      const itemKey = itemName || itemErp ? `${itemName}::${itemErp}` : "";
      const pending = Number(plan.plannedQty || 0) - Number(plan.loadedQty || 0) - Number(plan.canceledQty || 0);
      const firmId = String(order?.firmId || plan.orderFirmId || plan.firmId || scheduleFirm.get(plan.scheduleId) || "");
      const firmName = getFirmDisplayNameById(firmId, firms);
      const date = new Date(String(plan.date || ""));
      const day = isNaN(date.getTime()) ? "" : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      return {
        plan, companyName, itemName, itemErp, itemKey,
        orderNo: String(order?.orderNo || ""),
        pending, day, firmId, firmName,
        // Visible columns: Plan No, Plan Date, Firm, Company, Order No, Item, Planned, Invoice Qty, Cancl, Pending, Status.
        searchText: rowSearchText([
          plan.planNo, formatDate(plan.date), firmName, company?.name, order?.orderNo, item?.name,
          Number(plan.plannedQty || 0), Number(plan.loadedQty || 0), Number(plan.canceledQty || 0), pending, plan.status,
        ]),
      };
    });
  }, [plans, orders, companies, firms, schedules, resolveOrderItem]);

  const companyOptions = useMemo(() => {
    const names = Array.from(new Set(dispatchFilterRows.map((row) => row.companyName).filter(Boolean)));
    return names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })).map((name) => ({ value: name, label: name }));
  }, [dispatchFilterRows]);

  const itemOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; searchText: string }>();
    dispatchFilterRows.forEach((row) => {
      if (!row.itemKey || map.has(row.itemKey)) return;
      const label = !row.itemName ? row.itemErp : !row.itemErp || row.itemName.toLowerCase().includes(row.itemErp.toLowerCase()) ? row.itemName : `${row.itemName} - ${row.itemErp}`;
      map.set(row.itemKey, { value: row.itemKey, label, searchText: `${row.itemName} ${row.itemErp}` });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [dispatchFilterRows]);

  const filteredPlans = useMemo(() => {
    const words = searchWords(searchTerm);
    return dispatchFilterRows
      .filter((row) => {
        if (companyFilter && row.companyName !== companyFilter) return false;
        if (itemFilter && row.itemKey !== itemFilter) return false;
        if (firmFilter && row.firmId !== firmFilter) return false;
        if (statusFilter && row.plan.status !== statusFilter) return false;
        if (balanceFilter === "pending" && !(row.pending > 0)) return false;
        if (balanceFilter === "done" && row.pending > 0) return false;
        if (fromDate && (!row.day || row.day < fromDate)) return false;
        if (toDate && (!row.day || row.day > toDate)) return false;
        return matchesTableSearch(row.searchText, words);
      })
      .map((row) => row.plan)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [companyFilter, dispatchFilterRows, firmFilter, itemFilter, searchTerm, statusFilter, balanceFilter, fromDate, toDate]);
  const filterOptions = useMemo(() => {
    const firmIds = new Set(dispatchFilterRows.map((row) => row.firmId).filter(Boolean));
    const statuses = Array.from(new Set(dispatchFilterRows.map((row) => String(row.plan.status || "")).filter(Boolean))).sort();
    return {
      firms: getFirmOptions(firms.filter((firm: { id: string }) => firmIds.has(String(firm.id)))),
      statuses: statuses.map((value) => ({ value, label: value })),
      balances: [{ value: "pending", label: "Pending Qty > 0" }, { value: "done", label: "Fully Invoiced / Closed" }],
    };
  }, [dispatchFilterRows, firms]);
  const filterRowByPlanId = useMemo(() => new Map(dispatchFilterRows.map((row) => [row.plan.id, row])), [dispatchFilterRows]);
  const { sorted: sortedPlans, sort, toggle: toggleSort } = useTableSort(filteredPlans, (plan, key) => {
    const row = filterRowByPlanId.get(plan.id);
    switch (key) {
      case "planNo": return plan.planNo || "";
      case "date": return plan.date || "";
      case "firmName": return row?.firmName || "";
      case "companyName": return row?.companyName || "";
      case "orderNo": return row?.orderNo || "";
      case "itemName": return row?.itemName || "";
      case "plannedQty": return Number(plan.plannedQty || 0);
      case "loadedQty": return Number(plan.loadedQty || 0);
      case "canceledQty": return Number(plan.canceledQty || 0);
      case "pending": return Number(plan.plannedQty || 0) - Number(plan.loadedQty || 0) - Number(plan.canceledQty || 0);
      case "status": return plan.status || "";
      default: return "";
    }
  }, [filterRowByPlanId]);
  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalItems,
    paginatedItems: paginatedPlans,
  } = useClientPagination(sortedPlans, 25);

  const LABEL = "mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600";
  const DATE_INPUT = "h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold";
  const hasFilters = Boolean(searchTerm.trim() || companyFilter || itemFilter || firmFilter || statusFilter || balanceFilter || fromDate || toDate);
  const clearFilters = () => { setSearchTerm(""); setCompanyFilter(""); setItemFilter(""); setFirmFilter(""); setStatusFilter(""); setBalanceFilter(""); setFromDate(""); setToDate(""); };
  const statusBadge = (status: string) => (
    <span className={`inline-block whitespace-nowrap rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${status === "Dispatched" ? "border-emerald-900 bg-emerald-100 text-emerald-900" : "border-amber-900 bg-amber-100 text-amber-900"}`}>{status || "-"}</span>
  );
  const qty = (value: unknown) => Number(value || 0).toLocaleString();
  const actionButtons = (p: DispatchPlan, hasLoadingSlip: boolean) => (
    <>
      {canManage ? <button
        type="button"
        onClick={() => openEditModal(p)}
        disabled={hasLoadingSlip}
        title={hasLoadingSlip ? "Loading slip already created. Editing is locked." : "Edit dispatch plan"}
        aria-label="Edit dispatch plan"
        className={`mr-2 p-1 transition ${hasLoadingSlip ? "cursor-not-allowed text-slate-300" : "text-indigo-600 hover:text-indigo-900"}`}
      >
        <Pencil size={16} />
      </button> : null}
      {canManage ? <button
        type="button"
        onClick={() => handleDelete(p.id)}
        title={deletingId === p.id ? "Tap again to delete" : "Delete dispatch plan"}
        aria-label={deletingId === p.id ? "Confirm delete" : "Delete dispatch plan"}
        className={`${deletingId === p.id ? "scale-110 animate-pulse text-amber-600" : "text-red-600"} p-1 transition-all hover:text-red-900`}
      >
        <Trash2 size={16} />
      </button> : null}
    </>
  );

  return (
    <div className="space-y-4">
      <div className="border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">Dispatch Plans Master</h2>
      </div>

      <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
        <div className="relative w-full"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" placeholder="Search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600" /></div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
          <div className="min-w-0"><span className={LABEL}>Firm</span><Select compact value={firmFilter} onChange={setFirmFilter} options={filterOptions.firms} placeholder="All" /></div>
          <div className="min-w-0"><span className={LABEL}>Status</span><Select compact value={statusFilter} onChange={setStatusFilter} options={filterOptions.statuses} placeholder="All" /></div>
          <div className="col-span-2 min-w-0 md:col-span-1"><span className={LABEL}>Company</span><Select compact value={companyFilter} onChange={setCompanyFilter} options={companyOptions} placeholder="All" /></div>
          <div className="col-span-2 min-w-0 md:col-span-1"><span className={LABEL}>Item</span><Select compact value={itemFilter} onChange={setItemFilter} options={itemOptions} placeholder="All" /></div>
          <div className="col-span-2 min-w-0 md:col-span-1"><span className={LABEL}>Pending</span><Select compact value={balanceFilter} onChange={setBalanceFilter} options={filterOptions.balances} placeholder="All" /></div>
          <div data-date-pair="true" className="col-span-2 grid min-w-0 grid-cols-2 gap-2 sm:min-w-[280px]">
            <label className="min-w-0"><span className={LABEL}>Plan From Date</span><input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} className={DATE_INPUT} /></label>
            <label className="min-w-0"><span className={LABEL}>Plan To Date</span><input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} className={DATE_INPUT} /></label>
          </div>
        </div>
        <div data-mf-actions="true" className="flex justify-end gap-2">
          {hasFilters ? <button type="button" onClick={clearFilters} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button> : null}
          <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
        </div>
      </div>

      {/* Phones: one card per plan. */}
      <div className="space-y-2 md:hidden">
        {paginatedPlans.length === 0 ? (
          <div className="rounded border border-black bg-white p-6 text-center text-sm font-medium">No dispatch plans found.</div>
        ) : paginatedPlans.map((p) => {
          const row = filterRowByPlanId.get(p.id);
          const hasLoadingSlip = loadingSlipPlanIds.has(p.id);
          return (
            <div key={p.id} className="rounded-lg border-2 border-black bg-white p-3 text-black">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-black">{p.planNo || "-"}</span>
                {statusBadge(p.status)}
              </div>
              <div className="mt-0.5 text-[11px] font-semibold text-slate-700">{formatDate(p.date)} · {row?.firmName || "-"} · {row?.orderNo || "-"}</div>
              <div className="mt-1 break-words text-xs font-bold">{row?.companyName || "-"}</div>
              <div className="break-words text-xs">{row?.itemName || "-"}</div>
              <div className="mt-2 grid grid-cols-4 gap-1 text-center">
                {([["Planned", p.plannedQty], ["Invoice", p.loadedQty], ["Cancl", p.canceledQty], ["Pending", row?.pending]] as const).map(([label, value]) => (
                  <div key={label} className="rounded border border-slate-300 bg-slate-50 px-1 py-1">
                    <div className="text-[9px] font-black uppercase text-slate-500">{label}</div>
                    <div className="text-xs font-black">{qty(value)}</div>
                  </div>
                ))}
              </div>
              {canManage ? <div className="mt-2 flex justify-end">{actionButtons(p, hasLoadingSlip)}</div> : null}
            </div>
          );
        })}
      </div>

      <div className="hidden overflow-hidden rounded border border-black bg-white shadow-sm md:block">
        <div className="table-frozen-scroll">
          <table className="min-w-full border-collapse border border-black">
            <thead className="sticky top-0 z-30 bg-slate-100">
              <tr>
                <th className="border border-black px-3 py-3 text-xs font-bold uppercase text-black"><SortHeader label={"Plan No"} sortKey="planNo" sort={sort} onToggle={toggleSort} /></th>
                <th className="border border-black px-3 py-3 text-xs font-bold uppercase text-black"><SortHeader label={"Plan Date"} sortKey="date" sort={sort} onToggle={toggleSort} /></th>
                <th className="border border-black px-3 py-3 text-xs font-bold uppercase text-black"><SortHeader label={"Firm"} sortKey="firmName" sort={sort} onToggle={toggleSort} /></th>
                <th className="border border-black px-3 py-3 text-xs font-bold uppercase text-black"><SortHeader label={"Company"} sortKey="companyName" sort={sort} onToggle={toggleSort} /></th>
                <th className="border border-black px-3 py-3 text-xs font-bold uppercase text-black"><SortHeader label={"Order No"} sortKey="orderNo" sort={sort} onToggle={toggleSort} /></th>
                <th className="border border-black px-3 py-3 text-xs font-bold uppercase text-black"><SortHeader label={"Item"} sortKey="itemName" sort={sort} onToggle={toggleSort} /></th>
                <th className="border border-black px-3 py-3 text-xs font-bold uppercase text-black"><SortHeader label={"Planned"} sortKey="plannedQty" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="border border-black px-3 py-3 text-xs font-bold uppercase text-black"><SortHeader label={"Invoice Qty"} sortKey="loadedQty" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="border border-black px-3 py-3 text-xs font-bold uppercase text-black"><SortHeader label={"Cancl"} sortKey="canceledQty" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="border border-black px-3 py-3 text-xs font-bold uppercase text-black"><SortHeader label={"Pending"} sortKey="pending" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="border border-black px-3 py-3 text-xs font-bold uppercase text-black"><SortHeader label={"Status"} sortKey="status" sort={sort} onToggle={toggleSort} align="center" /></th>
                {canManage ? <th className="border border-black px-3 py-3 text-xs font-bold uppercase text-black">Actions</th> : null}
              </tr>
            </thead>
            <tbody className="bg-white text-black">
              {paginatedPlans.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 12 : 11} className="px-6 py-8 text-center font-medium text-black">No dispatch plans found.</td>
                </tr>
              ) : (
                paginatedPlans.map((p) => {
                  const row = filterRowByPlanId.get(p.id);
                  const hasLoadingSlip = loadingSlipPlanIds.has(p.id);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap border border-black px-3 py-2 text-xs font-bold text-black">{p.planNo || "-"}</td>
                      <td className="whitespace-nowrap border border-black px-3 py-2 text-xs text-black">{formatDate(p.date)}</td>
                      <td className="whitespace-nowrap border border-black px-3 py-2 text-xs text-black">{row?.firmName || "-"}</td>
                      <td className="border border-black px-3 py-2 text-xs text-black">{row?.companyName || "-"}</td>
                      <td className="whitespace-nowrap border border-black px-3 py-2 text-xs font-bold text-black">{row?.orderNo || "-"}</td>
                      <td className="border border-black px-3 py-2 text-xs text-black">{row?.itemName || "-"}</td>
                      <td className="whitespace-nowrap border border-black px-3 py-2 text-right text-xs font-bold text-black">{qty(p.plannedQty)}</td>
                      <td className="whitespace-nowrap border border-black px-3 py-2 text-right text-xs font-bold text-black">{qty(p.loadedQty)}</td>
                      <td className="whitespace-nowrap border border-black px-3 py-2 text-right text-xs font-bold text-black">{qty(p.canceledQty)}</td>
                      <td className="whitespace-nowrap border border-black px-3 py-2 text-right text-xs font-black text-black">{qty(row?.pending)}</td>
                      <td className="border border-black px-3 py-2 text-center text-xs">{statusBadge(p.status)}</td>
                      {canManage ? <td className="whitespace-nowrap border border-black px-3 py-2 text-center text-xs">{actionButtons(p, hasLoadingSlip)}</td> : null}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ClientPagination
        page={page}
        pageSize={pageSize}
        totalItems={totalItems}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      {editingPlan ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeEditModal}>
          <div className="w-full max-w-2xl rounded-xl border-2 border-black bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b-2 border-black px-5 py-4">
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight text-black">Edit Dispatch Plan</h3>
                <div className="text-xs font-semibold text-slate-500">{editingPlan.planNo || "-"}</div>
              </div>
              <button type="button" onClick={closeEditModal} className="text-slate-500 hover:text-black transition">
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-black">Plan Date</label>
                <input
                  type="date"
                  value={editForm.date}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, date: e.target.value }))}
                  className="w-full rounded border border-black px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-black">Truck</label>
                <select
                  value={editForm.truckId}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, truckId: e.target.value }))}
                  className="w-full rounded border border-black px-3 py-2 text-sm"
                >
                  <option value="">Select truck</option>
                  {trucks.map((truck) => (
                    <option key={truck.id} value={truck.id}>
                      {truck.truckNo}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-black">Planned Qty</label>
                <input
                  type="number"
                  min={editingLoaded + editingCancelled}
                  step="0.01"
                  value={editForm.plannedQty}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, plannedQty: e.target.value }))}
                  className="w-full rounded border border-black px-3 py-2 text-sm"
                />
                <div className="mt-1 text-[11px] text-slate-500">
                  Max allowed: {Number.isFinite(maxEditablePlannedQty) ? maxEditablePlannedQty.toLocaleString() : "-"}
                  {editingTolerancePercent > 0 ? ` (${editingTolerancePercent}% tolerance)` : ""}
                </div>
              </div>
              <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <div><span className="font-bold text-black">Loaded:</span> {editingLoaded.toLocaleString()}</div>
                <div><span className="font-bold text-black">Cancelled:</span> {editingCancelled.toLocaleString()}</div>
                <div><span className="font-bold text-black">Schedule Qty:</span> {Number(editingSchedule?.qty || 0).toLocaleString()}</div>
                <div><span className="font-bold text-black">Tolerance:</span> {editingTolerancePercent.toLocaleString()}%</div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={closeEditModal}
                className="rounded border border-black px-4 py-2 text-sm font-bold text-black"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded bg-indigo-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                <Save size={16} />
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
