import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useData } from "../hooks/useData";
import { getFirmDisplayName } from "../lib/firmDisplay";
import { 
  OrderSchedule, 
  Order, 
  Production, 
  DispatchPlan, 
  LoadingSlip, 
  Company,
  Firm,
} from "../types";
import { formatDate } from "../lib/serial";
import { Search, Calendar, Building2, Package, X, ArrowUpDown } from "lucide-react";
import Select from "react-select";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { ClientPagination } from "../components/ClientPagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { rowSearchText, searchWords } from "../lib/tableSearch";

type SelectOption = {
  value: string;
  label: string;
  searchText?: string;
};

type SortDirection = "asc" | "desc";

const formatItemOptionLabel = (item: { name?: string; erp?: string | number }) => {
  const name = String(item.name || "").trim();
  const erp = String(item.erp || "").trim();
  if (!name) return erp;
  if (!erp || name.toLowerCase().includes(erp.toLowerCase())) return name;
  return `${name} - ${erp}`;
};

type ScheduledOrdersMasterProps = {
  pendingOnly?: boolean;
};

export function ScheduledOrdersMaster({ pendingOnly = false }: ScheduledOrdersMasterProps = {}) {
  // The master must show schedules created for every firm.  In particular,
  // BK migration schedules belong to Firm-II and should not disappear when
  // the active-firm selector is set to Firm-I (or another firm).
  const [schedules, setSchedules, schedulesLoading, schedulesState] = useData<OrderSchedule>("orders_schedule", [], {
    firmScope: "all",
    storageKey: "orders-schedule-all-firms",
    endpointOverride: "/api/orders-schedule?firmScope=all",
  });
  const [orders] = useData<Order>("orders", [], {
    firmScope: "all",
    storageKey: "orders-all-firms",
  });
  const [companies] = useData<Company>("companies", []);
  const [firms] = useData<Firm>("firms", []);
  const { resolveOrderItem, itemsBySource } = useOrderItemCatalog();
  // Only the columns the totals below read (same rows, much smaller download).
  const [productions] = useData<Production>("productions", [], { fields: ["scheduleId", "status", "plannedQty", "qty", "prodFromFFG"] });
  const [plans, , plansLoading] = useData<DispatchPlan>("dispatch_plans", [], { fields: ["scheduleId"] });
  const [loadingSlips, , loadingSlipsLoading] = useData<LoadingSlip>("loading_slips", [], { fields: ["invoiceId", "lines"] });

  // Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [firmFilter, setFirmFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [scheduleNoSortDirection, setScheduleNoSortDirection] = useState<SortDirection>("desc");
  const autoCancelTriedRef = useRef<Set<string>>(new Set());
  const autoCancelStoppedRef = useRef(false);
  const [cancelInputs, setCancelInputs] = useState<Record<string, string>>({});
  const [cancelErrors, setCancelErrors] = useState<Record<string, string>>({});
  const [savingCancelId, setSavingCancelId] = useState<string | null>(null);

  const firmMap = useMemo(
    () => new Map(firms.map((firm) => [firm.id, getFirmDisplayName(firm)])), 
    [firms]
  );

  const getFirmName = useCallback((schedule: OrderSchedule, order?: Order) => {
    const directFirmId = String(schedule.firmId || order?.firmId || "").trim();
    return firmMap.get(directFirmId) || (directFirmId ? "Unknown firm" : "Unassigned");
  }, [firmMap]);

  const companyOptions = useMemo<SelectOption[]>(
    () =>
      companies
        .map((company) => ({ value: company.id, label: company.name || "" }))
        .filter((option) => option.value && option.label)
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" })),
    [companies]
  );

  const firmOptions = useMemo<SelectOption[]>(
    () =>
      firms
        .map((firm) => ({
          value: String(firm.id || ""),
          label: getFirmDisplayName(firm),
          searchText: `${getFirmDisplayName(firm)} ${String(firm.firmName || "")}`.trim(),
        }))
        .filter((option) => option.value && option.label)
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" })),
    [firms]
  );

  const itemOptions = useMemo<SelectOption[]>(
    () =>
      Object.values(itemsBySource)
        .flat()
        .map((item) => ({
          value: item.id,
          label: formatItemOptionLabel(item),
        }))
        .filter((option) => option.value && option.label)
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" })),
    [itemsBySource]
  );

  const scheduleDispatchDetails = useMemo(() => {
    // Index the related tables once instead of scanning every production,
    // plan and loading slip for each schedule (that made this screen freeze
    // and run out of memory as data grew). The totals are the same.
    const orderById = new Map(orders.map((o) => [o.id, o]));
    const companyById = new Map(companies.map((c) => [c.id, c]));
    const productionTotals = new Map<string, { plannedQty: number; producedFgQty: number; effectiveProduced: number }>();
    for (const p of productions) {
      if (!p.scheduleId || p.status === "Cancelled") continue;
      const totals = productionTotals.get(p.scheduleId) || { plannedQty: 0, producedFgQty: 0, effectiveProduced: 0 };
      totals.plannedQty += Number(p.plannedQty ?? p.qty) || 0;
      totals.producedFgQty += Number(p.prodFromFFG || 0) || 0;
      totals.effectiveProduced += Math.min(Number((p.plannedQty ?? p.qty) || 0), Number(p.prodFromFFG || 0));
      productionTotals.set(p.scheduleId, totals);
    }
    const scheduleIdByPlanId = new Map<string, string>();
    for (const plan of plans) {
      if (plan.scheduleId) scheduleIdByPlanId.set(plan.id, plan.scheduleId);
    }
    const loadTotals = new Map<string, { loaded: number; invoiced: number }>();
    for (const ls of loadingSlips) {
      for (const line of ls.lines || []) {
        const scheduleId = scheduleIdByPlanId.get(line.dispatchPlanId);
        if (!scheduleId) continue;
        const qty = Number(line.loadedQty) || 0;
        const totals = loadTotals.get(scheduleId) || { loaded: 0, invoiced: 0 };
        totals.loaded += qty;
        // Invoiced: If the loading slip has an invoiceId, it counts as invoiced
        if (ls.invoiceId) totals.invoiced += qty;
        loadTotals.set(scheduleId, totals);
      }
    }

    return schedules.map(s => {
      const order = orderById.get(s.orderId);
      const company = order?.companyId ? companyById.get(order.companyId) : undefined;
      const item = resolveOrderItem(order);

      // 1. Planned Qty / Production FFG Qty (from production jobs linked to this schedule)
      const productionTotal = productionTotals.get(s.id);
      const plannedQty = productionTotal?.plannedQty || 0;
      const producedFgQty = productionTotal?.producedFgQty || 0;
      const effectiveProducedForPlanning = productionTotal?.effectiveProduced || 0;

      // 2. Loaded / Invoiced (from loading slips via dispatch plans)
      const loadTotal = loadTotals.get(s.id);
      const loaded = loadTotal?.loaded || 0;
      const invoiced = loadTotal?.invoiced || 0;

      return {
        ...s,
        scheduleNo: s.scheduleNo || "-",
        orderNo: order?.orderNo || "-",
        firmName: getFirmName(s, order),
        firmId: String(s.firmId || order?.firmId || ""),
        companyId: company?.id || "",
        companyName: company?.name || "-",
        itemId: item?.id || "",
        itemName: item?.name || "-",
        itemErp: item?.erp || "-",
        orderErp: order?.erpCode || "",
        plannedQty,
        producedFgQty,
        pendingPlanning: Math.max((Number(s.qty) || 0) - (Number(s.canceledQty) || 0) - effectiveProducedForPlanning, 0),
        loaded,
        invoiced,
        pendingInvoice: Math.max(loaded - invoiced, 0),
        pendingOrderQty: Math.max((Number(s.qty) || 0) - (Number(s.canceledQty) || 0) - invoiced, 0)
      };
    });
  }, [schedules, orders, companies, getFirmName, resolveOrderItem, productions, plans, loadingSlips]);

  useEffect(() => {
    if (!pendingOnly || schedulesLoading || plansLoading || loadingSlipsLoading) return;

    if (autoCancelStoppedRef.current) return;
    const candidates = scheduleDispatchDetails.filter((schedule) => {
      const scheduleQty = Number(schedule.qty || 0);
      const pendingDispatch = Number(schedule.pendingOrderQty || 0);
      return scheduleQty > 0 && pendingDispatch > 0 && pendingDispatch <= scheduleQty * 0.1
        && !autoCancelTriedRef.current.has(schedule.id);
    });

    if (candidates.length === 0) return;
    // Try each schedule once per visit: a failed save (for example 403) must not retry in a loop.
    candidates.forEach((schedule) => autoCancelTriedRef.current.add(schedule.id));

    const cancelQtyByScheduleId = new Map(candidates.map((schedule) => [schedule.id, Number(schedule.pendingOrderQty || 0)]));
    const timestamp = new Date().toISOString();

    void setSchedules((prev) =>
      prev.map((schedule) => {
        const autoCancelQty = cancelQtyByScheduleId.get(schedule.id);
        if (!autoCancelQty) return schedule;
        return {
          ...schedule,
          canceledQty: Number(schedule.canceledQty || 0) + autoCancelQty,
          updatedBy: "System User",
          updateTimestamp: timestamp,
        };
      }),
    ).catch((error) => {
      autoCancelStoppedRef.current = true;
      console.error("Failed to auto-cancel small pending dispatch quantities:", error);
    });
  }, [pendingOnly, scheduleDispatchDetails, schedulesLoading, plansLoading, loadingSlipsLoading, setSchedules]);

  // Search text of each schedule from the table's visible columns, built once per list.
  const searchTextById = useMemo(() => new Map(scheduleDispatchDetails.map((s) => [s.id, rowSearchText([
    formatDate(s.scheduledDate),
    s.scheduleNo,
    s.orderNo,
    s.firmName,
    s.companyName,
    s.itemName,
    s.itemErp,
    (Number(s.qty) || 0).toLocaleString(),
    (Number(s.canceledQty) || 0).toLocaleString(),
    s.plannedQty.toLocaleString(),
    s.producedFgQty.toLocaleString(),
    s.pendingPlanning.toLocaleString(),
    s.loaded.toLocaleString(),
    s.invoiced.toLocaleString(),
    s.pendingInvoice.toLocaleString(),
    s.pendingOrderQty.toLocaleString(),
  ])])), [scheduleDispatchDetails]);

  const detailedSchedules = useMemo(() => {
    const words = searchWords(searchTerm);
    return scheduleDispatchDetails
      .filter((s) => !pendingOnly || s.pendingOrderQty > 0)
      .filter(s => {
        const text = searchTextById.get(s.id) || "";
        const matchSearch = words.every((word) => text.includes(word));
        const matchCompany = !companyFilter || s.companyId === companyFilter;
        const matchFirm = !firmFilter || s.firmId === firmFilter;
        const matchItem = !itemFilter || s.itemId === itemFilter;
        const matchFromDate = !fromDate || s.scheduledDate >= fromDate;
        const matchToDate = !toDate || s.scheduledDate <= toDate;

        return matchSearch && matchFirm && matchCompany && matchItem && matchFromDate && matchToDate;
      })
      .sort((a, b) => {
        const aScheduleNo = a.scheduleNo === "-" ? "" : a.scheduleNo;
        const bScheduleNo = b.scheduleNo === "-" ? "" : b.scheduleNo;
        const comparison = aScheduleNo.localeCompare(bScheduleNo, undefined, { numeric: true, sensitivity: "base" });
        if (comparison !== 0) return scheduleNoSortDirection === "asc" ? comparison : -comparison;
        return b.scheduledDate.localeCompare(a.scheduledDate);
      });
  }, [scheduleDispatchDetails, searchTextById, pendingOnly, searchTerm, firmFilter, companyFilter, itemFilter, fromDate, toDate, scheduleNoSortDirection]);
  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalItems,
    paginatedItems: paginatedSchedules,
  } = useClientPagination(detailedSchedules, 25);

  const clearFilters = () => {
    setSearchTerm("");
    setCompanyFilter("");
    setItemFilter("");
    setFirmFilter("");
    setFromDate("");
    setToDate("");
  };

  const toggleScheduleNoSort = () => {
    setScheduleNoSortDirection((current) => current === "asc" ? "desc" : "asc");
    setPage(1);
  };

  const handleCancelInputChange = (scheduleId: string, value: string) => {
    setCancelInputs((prev) => ({ ...prev, [scheduleId]: value }));
    setCancelErrors((prev) => ({ ...prev, [scheduleId]: "" }));
  };

  const handleSaveCancelQty = async (scheduleId: string, pendingDispatchPlan: number) => {
    const rawValue = (cancelInputs[scheduleId] || "").trim();
    const cancelQty = Number(rawValue);

    if (!rawValue || !Number.isFinite(cancelQty) || cancelQty <= 0) {
      setCancelErrors((prev) => ({ ...prev, [scheduleId]: "Enter Cancel Qty greater than 0." }));
      return;
    }

    if (cancelQty > pendingDispatchPlan) {
      setCancelErrors((prev) => ({ ...prev, [scheduleId]: "Cancel Qty cannot be greater than Pend Dispatch." }));
      return;
    }

    setSavingCancelId(scheduleId);
    try {
      const timestamp = new Date().toISOString();
      await setSchedules((prev) =>
        prev.map((schedule) =>
          schedule.id === scheduleId
            ? {
                ...schedule,
                canceledQty: Number(schedule.canceledQty || 0) + cancelQty,
                updatedBy: "System User",
                updateTimestamp: timestamp,
              }
            : schedule,
        ),
      );
      setCancelInputs((prev) => ({ ...prev, [scheduleId]: "" }));
      setCancelErrors((prev) => ({ ...prev, [scheduleId]: "" }));
    } catch (error) {
      console.error("Failed to save cancel quantity:", error);
      setCancelErrors((prev) => ({ ...prev, [scheduleId]: "Failed to save Cancel Qty." }));
    } finally {
      setSavingCancelId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)_max-content] items-start gap-3 border-b border-black pb-4">
        <h2 className="min-w-0 text-xl font-bold uppercase tracking-tight text-black">{pendingOnly ? "Scheduled But Not Dispatched" : "Scheduled Orders Master"}</h2>
        <button 
          type="button"
          onClick={clearFilters}
          className="inline-flex w-auto max-w-max items-center justify-self-end gap-2 whitespace-nowrap rounded border border-black px-3 py-1.5 text-xs font-bold uppercase transition-colors hover:bg-slate-50"
          style={{ width: "max-content" }}
        >
          <X size={14} /> Clear Filters
        </button>
      </div>

      {/* Filter Bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 bg-white p-4 border border-black rounded shadow-sm">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            type="text"
            placeholder="Search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-black rounded text-sm focus:ring-1 focus:ring-black outline-none"
          />
        </div>

        {/* Firm Filter */}
        <div className="relative">
          <Building2 className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400" size={16} />
          <Select
            options={firmOptions}
            value={firmOptions.find((option) => option.value === firmFilter) || null}
            onChange={(option) => setFirmFilter(option ? (option as SelectOption).value : "")}
            filterOption={(candidate, inputValue) => {
              const query = inputValue.trim().toLowerCase();
              if (!query) return true;
              const option = candidate.data as SelectOption;
              return String(option.searchText || option.label).toLowerCase().includes(query);
            }}
            isClearable
            placeholder="Firms"
            menuPlacement="bottom"
            menuPortalTarget={typeof document !== "undefined" ? document.body : null}
            menuPosition="fixed"
            styles={{
              control: (provided) => ({ ...provided, minHeight: 40, borderColor: "black", borderRadius: 4, paddingLeft: 28 }),
              menu: (provided) => ({ ...provided, zIndex: 9999 }),
              menuPortal: (provided) => ({ ...provided, zIndex: 9999 }),
            }}
          />
        </div>

        {/* Company Filter */}
        <div className="relative">
          <Building2 className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400" size={16} />
          <Select
            options={companyOptions}
            value={companyOptions.find((option) => option.value === companyFilter) || null}
            onChange={(option) => setCompanyFilter(option ? (option as SelectOption).value : "")}
            isClearable
            placeholder="Companies"
            menuPlacement="bottom"
            menuPortalTarget={typeof document !== "undefined" ? document.body : null}
            menuPosition="fixed"
            styles={{
              control: (provided) => ({ ...provided, minHeight: 40, borderColor: "black", borderRadius: 4, paddingLeft: 28 }),
              menu: (provided) => ({ ...provided, zIndex: 9999 }),
              menuPortal: (provided) => ({ ...provided, zIndex: 9999 }),
            }}
          />
        </div>

        {/* Item Filter */}
        <div className="relative">
          <Package className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400" size={16} />
          <Select
            options={itemOptions}
            value={itemOptions.find((option) => option.value === itemFilter) || null}
            onChange={(option) => setItemFilter(option ? (option as SelectOption).value : "")}
            isClearable
            placeholder="Items"
            menuPlacement="bottom"
            menuPortalTarget={typeof document !== "undefined" ? document.body : null}
            menuPosition="fixed"
            styles={{
              control: (provided) => ({ ...provided, minHeight: 40, borderColor: "black", borderRadius: 4, paddingLeft: 28 }),
              menu: (provided) => ({ ...provided, zIndex: 9999 }),
              menuPortal: (provided) => ({ ...provided, zIndex: 9999 }),
            }}
          />
        </div>

        {/* From Date */}
        <label className="block min-w-0">
        <span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">From Date</span>
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-black rounded text-sm focus:ring-1 focus:ring-black outline-none"
          />
        </div>
        </label>

        {/* To Date */}
        <label className="block min-w-0">
        <span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">To Date</span>
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-black rounded text-sm focus:ring-1 focus:ring-black outline-none"
          />
        </div>
        </label>
      </div>

      {schedulesState.error ? (
        <div className="flex items-center justify-between gap-4 rounded border-2 border-red-700 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
          <span>Could not load scheduled orders: {schedulesState.error}</span>
          <button
            type="button"
            onClick={() => void schedulesState.refresh({ force: true })}
            className="rounded bg-red-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-800"
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="bg-white rounded shadow-sm overflow-hidden border border-black">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-black border-collapse border border-black text-xs">
            <thead className="sticky top-0 z-30 bg-slate-100">
              <tr className="divide-x divide-black">
                <th className="px-2 py-2 border border-black text-left leading-tight">S.No</th>
                <th className="px-2 py-2 border border-black text-left leading-tight">
                  <span className="block">Sch.</span>
                  <span className="block">Date</span>
                </th>
                <th className="px-2 py-2 border border-black text-left leading-tight">
                  <button
                    type="button"
                    onClick={toggleScheduleNoSort}
                    className="flex items-center gap-1 text-left font-bold hover:text-indigo-700"
                    title={`Sort Schedule No ${scheduleNoSortDirection === "asc" ? "descending" : "ascending"}`}
                  >
                    <span>
                      <span className="block">Schedule</span>
                      <span className="block">No</span>
                    </span>
                    <ArrowUpDown size={13} className={scheduleNoSortDirection === "desc" ? "rotate-180" : ""} />
                  </button>
                </th>
                <th className="px-2 py-2 border border-black text-left leading-tight">
                  <span className="block">Order</span>
                  <span className="block">No</span>
                </th>
                <th className="px-2 py-2 border border-black text-left leading-tight">Firm</th>
                <th className="px-2 py-2 border border-black text-left leading-tight">Company</th>
                <th className="px-2 py-2 border border-black text-left leading-tight">
                  <span className="block">Item</span>
                  <span className="block">Name</span>
                </th>
                <th className="px-2 py-2 border border-black text-left leading-tight">ERP</th>
                <th className="px-2 py-2 border border-black text-right bg-indigo-50 leading-tight">
                  <span className="block">Sch.</span>
                  <span className="block">Qty</span>
                </th>
                <th className="px-2 py-2 border border-black text-right bg-red-50 text-red-700 leading-tight">
                  <span className="block">Canceled</span>
                </th>
                <th className="px-2 py-2 border border-black text-right bg-emerald-50 leading-tight">
                  <span className="block">Planned</span>
                  <span className="block">Qty</span>
                </th>
                <th className="px-2 py-2 border border-black text-right bg-lime-50 text-lime-800 leading-tight">
                  <span className="block">Production</span>
                  <span className="block">FFG Qty</span>
                </th>
                <th className="px-2 py-2 border border-black text-right bg-cyan-50 text-cyan-800 leading-tight">
                  <span className="block">Pending</span>
                  <span className="block">FFG</span>
                </th>
                <th className="px-2 py-2 border border-black text-right bg-amber-50 leading-tight">
                  <span className="block">Loaded</span>
                </th>
                <th className="px-2 py-2 border border-black text-right bg-purple-50 leading-tight">
                  <span className="block">Invoiced</span>
                </th>
                <th className="px-2 py-2 border border-black text-right font-bold text-orange-700 leading-tight">
                  <span className="block">Pend.</span>
                  <span className="block">Inv</span>
                </th>
                <th className="px-2 py-2 border border-black text-right bg-sky-50 text-sky-800 leading-tight">
                  <span className="block">Pend</span>
                  <span className="block">Dispatch</span>
                </th>
                {pendingOnly ? (
                  <th className="px-2 py-2 border border-black text-left bg-red-50 text-red-800 leading-tight">
                    <span className="block">Cancel</span>
                    <span className="block">Qty</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-black bg-white">
              {paginatedSchedules.map((s, idx) => (
                <tr key={s.id} className="hover:bg-slate-50 divide-x divide-black transition-colors">
                  <td className="px-3 py-2 border border-black text-slate-500">{(page - 1) * pageSize + idx + 1}</td>
                  <td className="px-3 py-2 border border-black whitespace-nowrap font-medium">{formatDate(s.scheduledDate)}</td>
                  <td className="px-3 py-2 border border-black whitespace-nowrap font-bold text-indigo-700">{s.scheduleNo}</td>
                  <td className="px-3 py-2 border border-black font-bold text-black">{s.orderNo}</td>
                  <td className="px-3 py-2 border border-black min-w-[130px] max-w-[200px] whitespace-normal break-words leading-snug font-semibold" title={s.firmName}>{s.firmName}</td>
                  <td className="px-3 py-2 border border-black min-w-[170px] max-w-[240px] whitespace-normal break-words leading-snug" title={s.companyName}>{s.companyName}</td>
                  <td className="px-3 py-2 border border-black min-w-[150px]">{s.itemName}</td>
                  <td className="px-3 py-2 border border-black">{s.itemErp}</td>
                  <td className="px-3 py-2 border border-black text-right font-medium bg-indigo-50/30">{(Number(s.qty) || 0).toLocaleString()}</td>
                  <td className="px-3 py-2 border border-black text-right font-medium text-red-600 bg-red-50/30">{(Number(s.canceledQty) || 0).toLocaleString()}</td>
                  <td className="px-3 py-2 border border-black text-right font-medium text-emerald-700 bg-emerald-50/30">{s.plannedQty.toLocaleString()}</td>
                  <td className="px-3 py-2 border border-black text-right font-medium text-lime-700 bg-lime-50/30">{s.producedFgQty.toLocaleString()}</td>
                  <td className={`px-3 py-2 border border-black text-right font-medium ${s.pendingPlanning > 0 ? 'text-cyan-800 bg-cyan-50/40' : 'text-slate-400 bg-cyan-50/20'}`}>
                    {s.pendingPlanning.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 border border-black text-right font-medium text-amber-700 bg-amber-50/30">{s.loaded.toLocaleString()}</td>
                  <td className="px-3 py-2 border border-black text-right font-medium text-purple-700 bg-purple-50/30">{s.invoiced.toLocaleString()}</td>
                  <td className={`px-3 py-2 border border-black text-right font-black ${s.pendingInvoice > 0 ? 'text-orange-600 bg-orange-50/50' : 'text-slate-400'}`}>
                    {s.pendingInvoice.toLocaleString()}
                  </td>
                  <td className={`px-3 py-2 border border-black text-right font-medium ${s.pendingOrderQty > 0 ? 'text-sky-800 bg-sky-50/40' : 'text-slate-400 bg-sky-50/20'}`}>
                    {s.pendingOrderQty.toLocaleString()}
                  </td>
                  {pendingOnly ? (
                    <td className="px-3 py-2 border border-black bg-red-50/20 min-w-[180px]">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={cancelInputs[s.id] || ""}
                          onChange={(event) => handleCancelInputChange(s.id, event.target.value)}
                          className="w-24 rounded border border-black px-2 py-1 text-right text-xs font-bold focus:outline-none focus:ring-1 focus:ring-black"
                          aria-label={`Cancel Qty for ${s.scheduleNo}`}
                        />
                        <button
                          type="button"
                          onClick={() => void handleSaveCancelQty(s.id, s.pendingOrderQty)}
                          disabled={savingCancelId === s.id}
                          className="rounded bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {savingCancelId === s.id ? "Saving" : "Save"}
                        </button>
                      </div>
                      {cancelErrors[s.id] ? <div className="mt-1 text-[10px] font-bold text-red-700">{cancelErrors[s.id]}</div> : null}
                    </td>
                  ) : null}
                </tr>
              ))}
              {detailedSchedules.length === 0 && (
                <tr>
                  <td colSpan={pendingOnly ? 18 : 17} className="px-6 py-12 text-center text-slate-500 font-bold italic uppercase tracking-widest bg-slate-50/50">
                    No schedules found matching your criteria
                  </td>
                </tr>
              )}
            </tbody>
            {detailedSchedules.length > 0 && (
              <tfoot className="bg-slate-100 font-bold border-t border-black">
                <tr className="divide-x divide-black">
                  <td colSpan={8} className="px-3 py-2 text-right uppercase">Filtered Totals</td>
                  <td className="px-3 py-2 text-right bg-indigo-50">
                    {detailedSchedules.reduce((sum, s) => sum + (Number(s.qty) || 0), 0).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right bg-red-50 text-red-700">
                    {detailedSchedules.reduce((sum, s) => sum + (Number(s.canceledQty) || 0), 0).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right bg-emerald-50 text-emerald-700">
                    {detailedSchedules.reduce((sum, s) => sum + s.plannedQty, 0).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right bg-lime-50 text-lime-800">
                    {detailedSchedules.reduce((sum, s) => sum + s.producedFgQty, 0).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right bg-cyan-50 text-cyan-800">
                    {detailedSchedules.reduce((sum, s) => sum + s.pendingPlanning, 0).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right bg-amber-50 text-amber-700">
                    {detailedSchedules.reduce((sum, s) => sum + s.loaded, 0).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right bg-purple-50 text-purple-700">
                    {detailedSchedules.reduce((sum, s) => sum + s.invoiced, 0).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right bg-orange-50 text-orange-700">
                    {detailedSchedules.reduce((sum, s) => sum + s.pendingInvoice, 0).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right bg-sky-50 text-sky-800">
                    {detailedSchedules.reduce((sum, s) => sum + s.pendingOrderQty, 0).toLocaleString()}
                  </td>
                  {pendingOnly ? <td className="px-3 py-2 bg-red-50" /> : null}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <ClientPagination
          page={page}
          pageSize={pageSize}
          totalItems={totalItems}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </div>
  );
}

export function PendingScheduledOrders() {
  return <ScheduledOrdersMaster pendingOnly />;
}
