import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useData } from "../hooks/useData";
import { getFirmDisplayName } from "../lib/firmDisplay";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { Company, DispatchPlan, Firm, Order, OrderSchedule, LoadingSlip, Production } from "../types";
import { Spinner } from "../components/Spinner";
import { Select } from "../components/Select";

import { ClientPagination } from "../components/ClientPagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { formatDate } from "../lib/serial";
import { normalizeOrderItemSource } from "../lib/orderItems";
import { buildScheduleConsumptionByScheduleId } from "../lib/productionScheduleQty";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";

function getPendingProductionQty(schedule: OrderSchedule, consumedQty: number) {
  return Math.max(
    Number(schedule.qty || 0) - Number(consumedQty || 0) - Number(schedule.canceledQty || 0),
    0
  );
}


function getPendingProductionErp(item: unknown, order?: Order) {
  const itemErp = String((item as { erp?: string | number } | null | undefined)?.erp || "").trim();
  if (itemErp) return itemErp;
  const orderErp = String((order as Order & { erpCode?: string | number })?.erpCode || "").trim();
  return orderErp || "-";
}
function parseLocalYmd(dateStr?: string) {
  if (!dateStr) return null;
  const match = String(dateStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, monthIndex, day);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

export function PendingProduction() {
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [firmFilter, setFirmFilter] = useState('');
  const [boxTypeFilter, setBoxTypeFilter] = useState('');
  const [fromDateFilter, setFromDateFilter] = useState('');
  const [toDateFilter, setToDateFilter] = useState('');

  const navigate = useNavigate();
  const [successMessage, setSuccessMessage] = useState(() => String((location.state as { successMessage?: string } | null)?.successMessage || ""));
  const [schedules, setSchedules] = useData<OrderSchedule>("orders_schedule", [], { firmScope: "all" });
  const [productions] = useData<Production>("productions", [], { firmScope: "all" });
  const [phpJobs] = useData<Production>("php_job_master", []);
  const [plateJobs] = useData<Production>("plate_job_master", []);
  const [dispatchPlans] = useData<DispatchPlan>("dispatch_plans", [], { firmScope: "all", storageKey: "dispatch-plans-all-firms" });
  const [loadingSlips] = useData<LoadingSlip>("loading_slips", [], { firmScope: "all" });
  const [orders] = useData<Order>("orders", [], { firmScope: "all" });
  const { resolveOrderItem } = useOrderItemCatalog();
  const [companies] = useData<Company>("companies", [], { firmScope: "all" });
  const [firms] = useData<Firm>("firms", []);

  const [cancelValues, setCancelValues] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [makeConfirmId, setMakeConfirmId] = useState<string | null>(null);

  React.useEffect(() => {
    const message = String((location.state as { successMessage?: string } | null)?.successMessage || "");
    if (!message) return;
    setSuccessMessage(message);
    const timer = window.setTimeout(() => {
      setSuccessMessage("");
      navigate(location.pathname, { replace: true, state: null });
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [location.pathname, location.state, navigate]);

  const cutoffDate = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + 2);
    cutoff.setHours(23, 59, 59, 999);
    return cutoff;
  }, []);

  const consumptionByScheduleId = useMemo(
    () => buildScheduleConsumptionByScheduleId(productions, phpJobs, plateJobs, { dispatchPlans, loadingSlips }),
    [dispatchPlans, loadingSlips, plateJobs, phpJobs, productions]
  );

  const firmNameById = useMemo(
    () => new Map(firms.map((firm) => [String(firm.id), getFirmDisplayName(firm)])),
    [firms]
  );

  const baseRows = useMemo(() => {
    return schedules
      .filter((schedule) => {
        const consumedQty = Number(consumptionByScheduleId.get(schedule.id)?.effectiveConsumedQty || 0);
        if (getPendingProductionQty(schedule, consumedQty) <= 0) return false;
        const order = orders.find((row) => row.id === schedule.orderId);
        if (normalizeOrderItemSource(order?.itemSource) !== "FG") return false;
        const scheduledDate = parseLocalYmd(schedule.scheduledDate);
        if (!scheduledDate) return false;
        return scheduledDate.getTime() <= cutoffDate.getTime();
      })
      .map((schedule) => {
        const order = orders.find((row) => row.id === schedule.orderId);
        const item = resolveOrderItem(order);
        const company = companies.find((row) => row.id === order?.companyId);
        const linkedProduction = productions.find((row) => {
          if (row.scheduleId !== schedule.id) return false;
          const productionWithFirm = row as Production & { firmId?: string };
          return Boolean(String(productionWithFirm.firmId || row.orderFirmId || "").trim());
        });
        const productionWithFirm = linkedProduction as (Production & { firmId?: string }) | undefined;
        const firmIds = [
          schedule.firmId,
          productionWithFirm?.firmId,
          linkedProduction?.orderFirmId,
          order?.firmId,
        ]
          .map((value) => String(value || "").trim())
          .filter(Boolean);
        const firmId = firmIds[0] || "";
        const firm = firmId ? (firmNameById.get(firmId) || "Unknown firm") : "Unassigned";
        const summary = consumptionByScheduleId.get(schedule.id);
        const plannedQty = Number(summary?.plannedQty || 0);
        const actualProducedQty = Number(summary?.actualProducedQty || 0);
        const plannedWithoutFfgQty = Number(summary?.plannedWithoutFfgQty || 0);
        const consumedQty = Number(summary?.effectiveConsumedQty || 0);
        const loadedFromOtherQty = Number(summary?.loadedFromOtherSourcesQty || 0);
        return {
          schedule,
          order,
          item,
          company,
          firm,
          firmId,
          plannedQty,
          actualProducedQty,
          plannedWithoutFfgQty,
          loadedFromOtherQty,
          consumedQty,
          pendingQty: getPendingProductionQty(schedule, consumedQty),
        };
      });
  }, [companies, consumptionByScheduleId, cutoffDate, firmNameById, orders, productions, resolveOrderItem, schedules]);

  const pendingRows = useMemo(() => {
    const words = searchWords(searchTerm);
    return baseRows
      .filter(({ schedule, order, item, company, firm, firmId, pendingQty, plannedQty, actualProducedQty, loadedFromOtherQty }) => {
        if (firmFilter && firmId !== firmFilter) return false;
        if (companyFilter && order?.companyId !== companyFilter) return false;
        const itemKey = item?.id || `${item?.name || ""}::${getPendingProductionErp(item, order)}`;
        if (itemFilter && itemKey !== itemFilter) return false;
        const canPlanFgJob = normalizeOrderItemSource(order?.itemSource) === "FG";
        const boxType = canPlanFgJob ? String((item as any)?.boxType || "").trim() : "";
        if (boxTypeFilter && (boxType || "Missing") !== boxTypeFilter) return false;
        const scheduledYmd = String(schedule.scheduledDate || "").slice(0, 10);
        if (fromDateFilter && scheduledYmd < fromDateFilter) return false;
        if (toDateFilter && scheduledYmd > toDateFilter) return false;
        if (!words.length) return true;
        return matchesTableSearch([
          order?.orderNo,
          schedule.scheduleNo,
          formatDate(schedule.scheduledDate),
          company?.name,
          firm,
          getPendingProductionErp(item, order),
          item?.name,
          boxType || "Missing",
          schedule.qty || 0,
          plannedQty,
          actualProducedQty,
          loadedFromOtherQty,
          schedule.canceledQty || 0,
          pendingQty,
        ], words);
      })
      .sort((a, b) => {
        const timeA = new Date(a.schedule.updateTimestamp || a.schedule.scheduledDate || 0).getTime();
        const timeB = new Date(b.schedule.updateTimestamp || b.schedule.scheduledDate || 0).getTime();
        return timeB - timeA;
      });
  }, [baseRows, boxTypeFilter, companyFilter, firmFilter, fromDateFilter, itemFilter, searchTerm, toDateFilter]);

  const firmOptions = useMemo(() => Array.from(new Map(baseRows.filter((row) => row.firmId).map((row) => [row.firmId, { value: row.firmId, label: row.firm }])).values()).sort((a, b) => a.label.localeCompare(b.label)), [baseRows]);
  const boxTypeOptions = useMemo(() => Array.from(new Set(baseRows.map((row) => { const canPlanFgJob = normalizeOrderItemSource(row.order?.itemSource) === "FG"; const boxType = canPlanFgJob ? String((row.item as any)?.boxType || "").trim() : ""; return boxType || "Missing"; }))).sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value })), [baseRows]);
  const companyOptions = useMemo(() => Array.from(new Map(baseRows.map((row) => [row.order?.companyId || "", { value: row.order?.companyId || "", label: row.company?.name || "" }])).values()).filter((option) => option.value && option.label).sort((a, b) => a.label.localeCompare(b.label)), [baseRows]);
  const itemOptions = useMemo(() => Array.from(new Map(baseRows.map((row) => { const erp = getPendingProductionErp(row.item, row.order); const key = row.item?.id || `${row.item?.name || ""}::${erp}`; const name = row.item?.name || ""; return [key, { value: key, label: erp && name && !name.toLowerCase().includes(erp.toLowerCase()) ? `${name} - ${erp}` : name || erp, searchText: `${name} ${erp}` }]; })).values()).filter((option) => option.value && option.label).sort((a, b) => a.label.localeCompare(b.label)), [baseRows]);
  const hasActiveFilters = Boolean(searchTerm.trim() || firmFilter || companyFilter || itemFilter || boxTypeFilter || fromDateFilter || toDateFilter);
  const clearFilters = () => { setSearchTerm(""); setFirmFilter(""); setCompanyFilter(""); setItemFilter(""); setBoxTypeFilter(""); setFromDateFilter(""); setToDateFilter(""); };
  const { sorted: sortedRows, sort, toggle: toggleSort } = useTableSort(pendingRows, (row, key) => {
    switch (key) {
      case "orderNo": return row.order?.orderNo;
      case "scheduleNo": return row.schedule.scheduleNo;
      case "scheduledDate": return row.schedule.scheduledDate;
      case "company": return row.company?.name;
      case "firm": return row.firm;
      case "erp": return getPendingProductionErp(row.item, row.order);
      case "item": return row.item?.name;
      case "boxType": {
        const canPlanFgJob = normalizeOrderItemSource(row.order?.itemSource) === "FG";
        const boxType = canPlanFgJob ? String((row.item as any)?.boxType || "").trim() : "";
        return boxType || "Missing";
      }
      case "qty": return Number(row.schedule.qty || 0);
      case "plannedQty": return row.plannedQty;
      case "actualProducedQty": return row.actualProducedQty;
      case "loadedFromOtherQty": return row.loadedFromOtherQty;
      case "canceledQty": return Number(row.schedule.canceledQty || 0);
      case "pendingQty": return row.pendingQty;
      default: return "";
    }
  });
  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalItems,
    paginatedItems: paginatedRows,
  } = useClientPagination(sortedRows, 25);
  React.useEffect(() => { setPage(1); }, [searchTerm, firmFilter, companyFilter, itemFilter, boxTypeFilter, fromDateFilter, toDateFilter, setPage]);

  const handleCancelQty = async (schedule: OrderSchedule) => {
    const rawValue = cancelValues[schedule.id];
    const qtyToCancel = Number(rawValue || 0);
    const consumedQty = Number(consumptionByScheduleId.get(schedule.id)?.effectiveConsumedQty || 0);
    const pendingQty = getPendingProductionQty(schedule, consumedQty);

    if (!qtyToCancel || qtyToCancel <= 0 || qtyToCancel > pendingQty) return;

    setSavingId(schedule.id);
    try {
      const timestamp = new Date().toISOString();
      await setSchedules((prev) =>
        prev.map((row) =>
          row.id === schedule.id
            ? {
                ...row,
                canceledQty: Number(row.canceledQty || 0) + qtyToCancel,
                updateTimestamp: timestamp,
                updatedBy: "System User",
              }
            : row
        )
      );
      setCancelValues((prev) => ({ ...prev, [schedule.id]: "" }));
    } catch (err) {
      console.error("Failed to cancel scheduled quantity:", err);
    } finally {
      setSavingId(null);
    }
  };

  const handleMakeJob = async (schedule: OrderSchedule) => {
    const consumedQty = Number(consumptionByScheduleId.get(schedule.id)?.effectiveConsumedQty || 0);
    const pendingQty = getPendingProductionQty(schedule, consumedQty);
    if (pendingQty <= 0) return;
    const order = orders.find((row) => row.id === schedule.orderId);
    const item = resolveOrderItem(order);
    const canPlanFgJob = normalizeOrderItemSource(order?.itemSource) === "FG";
    const boxType = canPlanFgJob ? String((item as any)?.boxType || "").trim() : "";
    if (!boxType) return;

    if (makeConfirmId !== schedule.id) {
      setMakeConfirmId(schedule.id);
      setTimeout(() => setMakeConfirmId(null), 3000);
      return;
    }

    // Open Production Form to create the job (scheduleId is pre-selected via query param)
    navigate(`/production/form?scheduleId=${schedule.id}`);
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">Pending Production Plan</h2>
      </div>
      {successMessage && <div role="status" className="rounded border-2 border-emerald-700 bg-emerald-100 px-4 py-3 text-sm font-bold text-emerald-900">{successMessage}</div>}

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
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Company</span><Select compact value={companyFilter} onChange={setCompanyFilter} options={companyOptions} placeholder="All" /></div>
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Item</span><Select compact value={itemFilter} onChange={setItemFilter} options={itemOptions} placeholder="All" /></div>
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Box Type</span><Select compact value={boxTypeFilter} onChange={setBoxTypeFilter} options={boxTypeOptions} placeholder="All" /></div>
          <div data-date-pair="true" className="col-span-2 grid min-w-0 grid-cols-2 gap-2 sm:min-w-[260px]">
            <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Schedule From Date</span><input type="date" value={fromDateFilter} max={toDateFilter || undefined} onChange={(e) => setFromDateFilter(e.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
          <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Schedule To Date</span><input type="date" value={toDateFilter} min={fromDateFilter || undefined} onChange={(e) => setToDateFilter(e.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
          </div>
        </div>
        <div data-mf-actions="true" className="flex justify-end gap-2">
          {hasActiveFilters ? (
            <button type="button" onClick={clearFilters} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button>
          ) : null}
          <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-black bg-white">
        <table className="min-w-full divide-y divide-black border-collapse border border-black text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-3 py-2 border border-black">SL No</th>
              <th className="px-3 py-2 border border-black"><SortHeader label="Order No" sortKey="orderNo" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-3 py-2 border border-black"><SortHeader label="Schedule No" sortKey="scheduleNo" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-3 py-2 border border-black"><SortHeader label="Schedule Date" sortKey="scheduledDate" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-3 py-2 border border-black"><SortHeader label="Company" sortKey="company" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-3 py-2 border border-black"><SortHeader label="Firm" sortKey="firm" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-3 py-2 border border-black"><SortHeader label="ERP" sortKey="erp" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-3 py-2 border border-black"><SortHeader label="Item" sortKey="item" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-3 py-2 border border-black"><SortHeader label="Box Type" sortKey="boxType" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-3 py-2 border border-black"><SortHeader label="Scheduled Qty" sortKey="qty" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-3 py-2 border border-black"><SortHeader label="Planned Qty" sortKey="plannedQty" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-3 py-2 border border-black"><SortHeader label="Actual FFG" sortKey="actualProducedQty" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-3 py-2 border border-black" title="Qty already loaded for this schedule from FG stock or from other orders' jobs"><SortHeader label="Loaded from Stock" sortKey="loadedFromOtherQty" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-3 py-2 border border-black"><SortHeader label="Canceled Qty" sortKey="canceledQty" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-3 py-2 border border-black"><SortHeader label="Pending Qty" sortKey="pendingQty" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-3 py-2 border border-black">Cancel Qty</th>
              <th className="px-3 py-2 border border-black">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pendingRows.length === 0 ? (
              <tr><td colSpan={17} className="h-16" aria-label="No records" /></tr>
            ) : (
              paginatedRows.map(({ schedule, order, item, company, firm, pendingQty, plannedQty, actualProducedQty, loadedFromOtherQty }, index) => {
                const canPlanFgJob = normalizeOrderItemSource(order?.itemSource) === "FG";
    const boxType = canPlanFgJob ? String((item as any)?.boxType || "").trim() : "";
                const hasBoxType = Boolean(boxType);
                const erpCode = getPendingProductionErp(item, order);
                return (
                <tr key={schedule.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 border border-black font-bold">{(page - 1) * pageSize + index + 1}</td>
                  <td className="px-3 py-2 border border-black">{order?.orderNo || "-"}</td>
                  <td className="px-3 py-2 border border-black font-bold text-indigo-700 whitespace-nowrap">{schedule.scheduleNo || "-"}</td>
                  <td className="px-3 py-2 border border-black whitespace-nowrap">{formatDate(schedule.scheduledDate)}</td>
                  <td className="w-[220px] max-w-[220px] px-3 py-2 align-top border border-black" title={company?.name || "-"}><div className="line-clamp-2 break-words leading-5">{company?.name || "-"}</div></td>
                  <td className="px-3 py-2 border border-black">{firm}</td>
                  <td className="px-3 py-2 border border-black whitespace-nowrap">{erpCode}</td>
                  <td className="w-[240px] max-w-[240px] px-3 py-2 align-top border border-black" title={item?.name || "-"}><div className="line-clamp-2 break-words leading-5">{item?.name || "-"}</div></td>
                  <td className={`px-3 py-2 border border-black font-bold ${hasBoxType ? "text-black" : "bg-red-100 text-red-700"}`}>{boxType || "Missing"}</td>
                  <td className="px-3 py-2 border border-black">{schedule.qty || 0}</td>
                  <td className="px-3 py-2 border border-black">{plannedQty}</td>
                  <td className="px-3 py-2 border border-black">{actualProducedQty}</td>
                  <td className="px-3 py-2 border border-black">{loadedFromOtherQty}</td>
                  <td className="px-3 py-2 border border-black">{schedule.canceledQty || 0}</td>
                  <td className="px-3 py-2 border border-black font-bold">{pendingQty}</td>
                  <td className="px-3 py-2 border border-black">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      max={pendingQty}
                      value={cancelValues[schedule.id] || ""}
                      onChange={(e) => setCancelValues((prev) => ({ ...prev, [schedule.id]: e.target.value }))}
                      className="border-2 border-black rounded p-1 w-28"
                    />
                  </td>
                  <td className="px-3 py-2 border border-black">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCancelQty(schedule)}
                        disabled={savingId === schedule.id || !cancelValues[schedule.id] || Number(cancelValues[schedule.id]) <= 0}
                        className="bg-rose-600 text-white px-3 py-1 rounded font-bold disabled:opacity-50"
                      >
                        {savingId === schedule.id ? <Spinner size={14} className="text-white" /> : "Cancel Qty"}
                      </button>
                      <button
                        onClick={() => void handleMakeJob(schedule)}
                        disabled={pendingQty <= 0 || !hasBoxType}
                        className={`px-3 py-1 rounded font-bold disabled:opacity-50 ${
                          makeConfirmId === schedule.id ? "bg-amber-500 text-black" : "bg-yellow-400 text-black"
                        }`}
                        title={canPlanFgJob ? (hasBoxType ? "Plan job" : "Box Type is missing in NPD. Planning is disabled.") : "Only FG orders can create production jobs."}
                      >
                        {makeConfirmId === schedule.id ? "Confirm?" : "Plan Job"}
                      </button>
                    </div>
                  </td>
                </tr>
              )})
            )}
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
    </div>
  );
}
