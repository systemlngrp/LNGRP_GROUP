import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import Select from "react-select";
import { useData } from "../hooks/useData";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { getFirmDisplayName } from "../lib/firmDisplay";
import { Company, DispatchPlan, Firm, LoadingSlip, Order, OrderSchedule } from "../types";
import { ClientPagination } from "../components/ClientPagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { rowSearchText, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";
import { formatDate } from "../lib/utils";

// Only schedules dated before this day are looked at (same cut-off as the Customer Wise Scheduled Summary).
const CUTOFF_DATE = "2026-11-17";

type SelectOption = { value: string; label: string };
type Action = "Close" | "Partly Close" | "Review";

type ScheduleRow = {
  id: string;
  firmName: string;
  companyName: string;
  itemName: string;
  itemErp: string;
  orderNo: string;
  scheduleNo: string;
  scheduledDate: string;
  scheduledQty: number;
  canceledQty: number;
  invoicedQty: number;
  schedulePending: number;
  // Same firm + customer + item, all schedules before the cut-off: scheduled - cancelled - invoiced (can be negative).
  groupNetPending: number;
  // Part of this schedule's pending already covered by extra invoicing on the group's other schedules.
  suggestedCancel: number;
  action: Action;
};

const num = (value: unknown) => Number(value) || 0;

/**
 * Old open schedules and which of them can be closed: a schedule still pending on its own is
 * covered when the same firm + customer + item was invoiced in full across all its schedules
 * (extra invoicing on one schedule covers pending on another).
 */
export function SchedulesToClose() {
  const [schedules, , , schedulesState] = useData<OrderSchedule>("orders_schedule", [], {
    firmScope: "all",
    storageKey: "orders-schedule-all-firms",
    endpointOverride: "/api/orders-schedule?firmScope=all",
  });
  const [orders] = useData<Order>("orders", [], { firmScope: "all", storageKey: "orders-all-firms" });
  const [companies] = useData<Company>("companies", []);
  const [firms] = useData<Firm>("firms", []);
  const [plans] = useData<DispatchPlan>("dispatch_plans", [], { fields: ["scheduleId"] });
  const [loadingSlips] = useData<LoadingSlip>("loading_slips", [], { fields: ["invoiceId", "status", "lines"] });
  const { resolveOrderItem } = useOrderItemCatalog();

  const [searchTerm, setSearchTerm] = useState("");
  const [firmFilter, setFirmFilter] = useState("");
  const [actionFilter, setActionFilter] = useState<"" | Action>("");

  const firmOptions = useMemo<SelectOption[]>(
    () =>
      firms
        .map((firm) => ({ value: String(firm.id || ""), label: getFirmDisplayName(firm) }))
        .filter((option) => option.value && option.label)
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" })),
    [firms],
  );
  const actionOptions: SelectOption[] = [
    { value: "Close", label: "Close" },
    { value: "Partly Close", label: "Partly Close" },
    { value: "Review", label: "Review" },
  ];

  const rows = useMemo<ScheduleRow[]>(() => {
    const orderById = new Map(orders.map((order) => [order.id, order]));
    const companyById = new Map(companies.map((company) => [company.id, company]));
    const firmById = new Map(firms.map((firm) => [String(firm.id), firm]));
    const scheduleIdByPlanId = new Map<string, string>();
    for (const plan of plans) if (plan.scheduleId) scheduleIdByPlanId.set(plan.id, plan.scheduleId);
    const invoicedBySchedule = new Map<string, number>();
    for (const slip of loadingSlips) {
      if (slip.status === "Cancelled" || !slip.invoiceId) continue;
      for (const line of slip.lines || []) {
        const scheduleId = scheduleIdByPlanId.get(line.dispatchPlanId);
        if (scheduleId) invoicedBySchedule.set(scheduleId, (invoicedBySchedule.get(scheduleId) || 0) + num(line.loadedQty));
      }
    }

    type Base = Omit<ScheduleRow, "groupNetPending" | "suggestedCancel" | "action"> & { groupKey: string };
    const groups = new Map<string, Base[]>();
    for (const schedule of schedules) {
      const scheduledDate = String(schedule.scheduledDate || "").slice(0, 10);
      if (!scheduledDate || scheduledDate >= CUTOFF_DATE) continue;
      const order = orderById.get(schedule.orderId);
      const firmId = String(schedule.firmId || order?.firmId || "");
      if (firmFilter && firmId !== firmFilter) continue;
      const company = order?.companyId ? companyById.get(order.companyId) : undefined;
      const item = resolveOrderItem(order);
      const itemKey = String(item?.id || order?.itemId || order?.erpCode || "");
      const scheduledQty = num(schedule.qty);
      const canceledQty = num(schedule.canceledQty);
      const invoicedQty = invoicedBySchedule.get(schedule.id) || 0;
      const groupKey = `${firmId}|${order?.companyId || ""}|${itemKey}`;
      const firm = firmById.get(firmId);
      const base: Base = {
        id: schedule.id,
        groupKey,
        firmName: firm ? getFirmDisplayName(firm) : String(schedule.firmName || "-"),
        companyName: company?.name || "-",
        itemName: item?.name || "-",
        itemErp: String(item?.erp || order?.erpCode || "-"),
        orderNo: order?.orderNo || "-",
        scheduleNo: schedule.scheduleNo || "-",
        scheduledDate,
        scheduledQty,
        canceledQty,
        invoicedQty,
        schedulePending: Math.max(scheduledQty - canceledQty - invoicedQty, 0),
      };
      const list = groups.get(groupKey) || [];
      list.push(base);
      groups.set(groupKey, list);
    }

    const result: ScheduleRow[] = [];
    for (const list of groups.values()) {
      const groupNetPending = list.reduce((sum, row) => sum + row.scheduledQty - row.canceledQty - row.invoicedQty, 0);
      const groupSchedulePending = list.reduce((sum, row) => sum + row.schedulePending, 0);
      if (groupSchedulePending <= 0) continue;
      // Covered quantity goes to the oldest pending schedules first.
      let covered = Math.max(groupSchedulePending - Math.max(groupNetPending, 0), 0);
      const pending = list.filter((row) => row.schedulePending > 0).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
      for (const row of pending) {
        const suggestedCancel = Math.min(row.schedulePending, covered);
        covered -= suggestedCancel;
        const action: Action = suggestedCancel >= row.schedulePending ? "Close" : suggestedCancel > 0 ? "Partly Close" : "Review";
        const { groupKey: _groupKey, ...rest } = row;
        result.push({ ...rest, groupNetPending, suggestedCancel, action });
      }
    }
    return result.sort((a, b) =>
      a.companyName.localeCompare(b.companyName, undefined, { sensitivity: "base" })
      || a.itemName.localeCompare(b.itemName, undefined, { sensitivity: "base" })
      || a.scheduledDate.localeCompare(b.scheduledDate));
  }, [schedules, orders, companies, firms, plans, loadingSlips, resolveOrderItem, firmFilter]);

  const filteredRows = useMemo(() => {
    const words = searchWords(searchTerm);
    return rows.filter((row) => {
      if (actionFilter && row.action !== actionFilter) return false;
      if (words.length === 0) return true;
      const text = rowSearchText([row.firmName, row.companyName, row.itemName, row.itemErp, row.orderNo, row.scheduleNo, formatDate(row.scheduledDate), row.action]);
      return words.every((word) => text.includes(word));
    });
  }, [rows, searchTerm, actionFilter]);

  const counts = useMemo(() => {
    const out = { Close: { n: 0, qty: 0 }, "Partly Close": { n: 0, qty: 0 }, Review: { n: 0, qty: 0 } } as Record<Action, { n: number; qty: number }>;
    for (const row of rows) {
      out[row.action].n += 1;
      out[row.action].qty += row.action === "Review" ? row.schedulePending : row.suggestedCancel;
    }
    return out;
  }, [rows]);

  const { sorted, sort, toggle } = useTableSort(filteredRows, (row, key) => (row as any)[key] ?? "");
  const { page, setPage, pageSize, setPageSize, totalItems, paginatedItems } = useClientPagination(sorted, 50);
  const toggleSort = (key: string) => {
    toggle(key);
    setPage(1);
  };

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const data = sorted.map((row, index) => ({
      "S.No": index + 1,
      Firm: row.firmName,
      Customer: row.companyName,
      Item: row.itemName,
      ERP: row.itemErp,
      "Order No": row.orderNo,
      "Schedule No": row.scheduleNo,
      "Schedule Date": formatDate(row.scheduledDate),
      Scheduled: row.scheduledQty,
      Cancelled: row.canceledQty,
      Invoiced: row.invoicedQty,
      "Schedule Pending": row.schedulePending,
      "Customer + Item Net Pending": row.groupNetPending,
      "Qty to Cancel": row.suggestedCancel,
      Action: row.action,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Schedules to Close");
    XLSX.writeFile(wb, "schedules-to-close.xlsx");
  };

  const menuPortalTarget = typeof document !== "undefined" ? document.body : null;
  const compactSelectStyles = {
    control: (provided: any) => ({ ...provided, minHeight: 34, height: 34, borderWidth: 2, borderColor: "#000", borderRadius: 4, fontSize: 12, fontWeight: 600 }),
    valueContainer: (provided: any) => ({ ...provided, padding: "0 6px" }),
    indicatorsContainer: (provided: any) => ({ ...provided, height: 30 }),
    menu: (provided: any) => ({ ...provided, zIndex: 9999, fontSize: 12 }),
    menuPortal: (provided: any) => ({ ...provided, zIndex: 9999 }),
  };
  const actionClass = (action: Action) =>
    action === "Close" ? "bg-emerald-100 text-emerald-800" : action === "Partly Close" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">Schedules to Close</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-600">Open schedules dated before 17-11-2026</span>
          <button type="button" onClick={() => void exportExcel()} className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800">Excel</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <div className="rounded border border-black bg-emerald-50 px-3 py-2 text-xs"><span className="font-black text-emerald-800">Close</span> · {counts.Close.n} schedules · {counts.Close.qty.toLocaleString()} qty — fully covered by extra invoicing on the same customer + item.</div>
        <div className="rounded border border-black bg-amber-50 px-3 py-2 text-xs"><span className="font-black text-amber-800">Partly Close</span> · {counts["Partly Close"].n} schedules · {counts["Partly Close"].qty.toLocaleString()} qty — only "Qty to Cancel" is covered; the rest is really pending.</div>
        <div className="rounded border border-black bg-red-50 px-3 py-2 text-xs"><span className="font-black text-red-700">Review</span> · {counts.Review.n} schedules · {counts.Review.qty.toLocaleString()} qty — really pending: dispatch, or cancel after confirming with the customer.</div>
      </div>

      <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search"
            value={searchTerm}
            onChange={(event) => { setSearchTerm(event.target.value); setPage(1); }}
            className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
          <div className="min-w-0">
            <span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Firm</span>
            <Select options={firmOptions} value={firmOptions.find((option) => option.value === firmFilter) || null} onChange={(option) => { setFirmFilter(option ? (option as SelectOption).value : ""); setPage(1); }} isClearable placeholder="All" menuPortalTarget={menuPortalTarget} menuPosition="fixed" styles={compactSelectStyles} />
          </div>
          <div className="min-w-0">
            <span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Action</span>
            <Select options={actionOptions} value={actionOptions.find((option) => option.value === actionFilter) || null} onChange={(option) => { setActionFilter(option ? ((option as SelectOption).value as Action) : ""); setPage(1); }} isClearable placeholder="All" menuPortalTarget={menuPortalTarget} menuPosition="fixed" styles={compactSelectStyles} />
          </div>
        </div>
      </div>

      {schedulesState.error ? (
        <div className="flex items-center justify-between gap-4 rounded border-2 border-red-700 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
          <span>Could not load scheduled orders: {schedulesState.error}</span>
          <button type="button" onClick={() => void schedulesState.refresh({ force: true })} className="rounded bg-red-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-800">Retry</button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded border border-black bg-white">
        <table className="min-w-full border-collapse border border-black text-xs">
          <thead className="bg-slate-100">
            <tr>
              <th className="border border-black px-2 py-2 text-left">S.No</th>
              <th className="border border-black px-2 py-2 text-left"><SortHeader label="Firm" sortKey="firmName" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="border border-black px-2 py-2 text-left"><SortHeader label="Customer" sortKey="companyName" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="border border-black px-2 py-2 text-left"><SortHeader label="Item" sortKey="itemName" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="border border-black px-2 py-2 text-left"><SortHeader label="ERP" sortKey="itemErp" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="border border-black px-2 py-2 text-left"><SortHeader label="Order No" sortKey="orderNo" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="border border-black px-2 py-2 text-left"><SortHeader label="Schedule Date" sortKey="scheduledDate" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="border border-black bg-indigo-50 px-2 py-2 text-right"><SortHeader label="Scheduled" sortKey="scheduledQty" sort={sort} onToggle={toggleSort} align="right" /></th>
              <th className="border border-black bg-red-50 px-2 py-2 text-right"><SortHeader label="Cancelled" sortKey="canceledQty" sort={sort} onToggle={toggleSort} align="right" /></th>
              <th className="border border-black bg-purple-50 px-2 py-2 text-right"><SortHeader label="Invoiced" sortKey="invoicedQty" sort={sort} onToggle={toggleSort} align="right" /></th>
              <th className="border border-black bg-sky-50 px-2 py-2 text-right"><SortHeader label="Schedule Pending" sortKey="schedulePending" sort={sort} onToggle={toggleSort} align="right" /></th>
              <th className="border border-black bg-slate-200 px-2 py-2 text-right"><SortHeader label="Cust + Item Net Pending" sortKey="groupNetPending" sort={sort} onToggle={toggleSort} align="right" /></th>
              <th className="border border-black bg-emerald-50 px-2 py-2 text-right"><SortHeader label="Qty to Cancel" sortKey="suggestedCancel" sort={sort} onToggle={toggleSort} align="right" /></th>
              <th className="border border-black px-2 py-2 text-left"><SortHeader label="Action" sortKey="action" sort={sort} onToggle={toggleSort} align="left" /></th>
            </tr>
          </thead>
          <tbody>
            {paginatedItems.length === 0 ? (
              <tr><td colSpan={14} className="border border-black px-3 py-6 text-center text-slate-500">No open schedules.</td></tr>
            ) : (
              paginatedItems.map((row, index) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="border border-black px-3 py-2">{(page - 1) * pageSize + index + 1}</td>
                  <td className="border border-black px-3 py-2">{row.firmName}</td>
                  <td className="border border-black px-3 py-2 font-medium">{row.companyName}</td>
                  <td className="border border-black px-3 py-2">{row.itemName}</td>
                  <td className="border border-black px-3 py-2">{row.itemErp}</td>
                  <td className="border border-black px-3 py-2">{row.orderNo}</td>
                  <td className="border border-black px-3 py-2">{formatDate(row.scheduledDate)}</td>
                  <td className="border border-black px-3 py-2 text-right">{row.scheduledQty.toLocaleString()}</td>
                  <td className="border border-black px-3 py-2 text-right text-red-600">{row.canceledQty.toLocaleString()}</td>
                  <td className="border border-black px-3 py-2 text-right text-purple-700">{row.invoicedQty.toLocaleString()}</td>
                  <td className="border border-black px-3 py-2 text-right font-bold text-sky-800">{row.schedulePending.toLocaleString()}</td>
                  <td className={`border border-black px-3 py-2 text-right font-bold ${row.groupNetPending <= 0 ? "text-emerald-700" : "text-red-700"}`}>{row.groupNetPending.toLocaleString()}</td>
                  <td className="border border-black px-3 py-2 text-right font-bold text-emerald-800">{row.suggestedCancel.toLocaleString()}</td>
                  <td className="border border-black px-3 py-2"><span className={`rounded px-2 py-0.5 font-bold ${actionClass(row.action)}`}>{row.action}</span></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <ClientPagination page={page} pageSize={pageSize} totalItems={totalItems} onPageChange={setPage} onPageSizeChange={setPageSize} />
    </div>
  );
}
