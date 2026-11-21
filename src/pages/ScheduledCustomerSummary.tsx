import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import Select from "react-select";
import { useData } from "../hooks/useData";
import { getFirmDisplayName } from "../lib/firmDisplay";
import { Company, DispatchPlan, Firm, LoadingSlip, Order, OrderSchedule, Production } from "../types";
import { ClientPagination } from "../components/ClientPagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { rowSearchText, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";

// Only schedules dated before this day are counted (order entry moved into the app around it).
const CUTOFF_DATE = "2026-11-17";

type SelectOption = { value: string; label: string };

type CustomerRow = {
  id: string;
  companyName: string;
  schedules: number;
  scheduledQty: number;
  canceledQty: number;
  ffgQty: number;
  loadedQty: number;
  invoicedQty: number;
  pendingQty: number;
  // Total FFG minus Total Invoiced; negative when more was invoiced than produced.
  ffgLessInvoiced: number;
};

const num = (value: unknown) => Number(value) || 0;

export function ScheduledCustomerSummary() {
  const [schedules, , schedulesLoading, schedulesState] = useData<OrderSchedule>("orders_schedule", [], {
    firmScope: "all",
    storageKey: "orders-schedule-all-firms",
    endpointOverride: "/api/orders-schedule?firmScope=all",
  });
  const [orders] = useData<Order>("orders", [], { firmScope: "all", storageKey: "orders-all-firms" });
  const [companies] = useData<Company>("companies", []);
  const [firms] = useData<Firm>("firms", []);
  const [productions] = useData<Production>("productions", [], { fields: ["scheduleId", "status", "plannedQty", "qty", "prodFromFFG"] });
  const [plans] = useData<DispatchPlan>("dispatch_plans", [], { fields: ["scheduleId"] });
  const [loadingSlips] = useData<LoadingSlip>("loading_slips", [], { fields: ["invoiceId", "status", "lines"] });

  const [searchTerm, setSearchTerm] = useState("");
  const [firmFilter, setFirmFilter] = useState("");
  // Pending = scheduled - cancelled - invoiced still above zero (same rule as Scheduled But Not Dispatched).
  const [pendingOnly, setPendingOnly] = useState(false);

  const firmOptions = useMemo<SelectOption[]>(
    () =>
      firms
        .map((firm) => ({ value: String(firm.id || ""), label: getFirmDisplayName(firm) }))
        .filter((option) => option.value && option.label)
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" })),
    [firms],
  );

  const customerRows = useMemo<CustomerRow[]>(() => {
    const orderById = new Map(orders.map((order) => [order.id, order]));
    const companyById = new Map(companies.map((company) => [company.id, company]));
    const ffgBySchedule = new Map<string, number>();
    for (const production of productions) {
      if (!production.scheduleId || production.status === "Cancelled") continue;
      ffgBySchedule.set(production.scheduleId, (ffgBySchedule.get(production.scheduleId) || 0) + num(production.prodFromFFG));
    }
    const scheduleIdByPlanId = new Map<string, string>();
    for (const plan of plans) {
      if (plan.scheduleId) scheduleIdByPlanId.set(plan.id, plan.scheduleId);
    }
    const loadBySchedule = new Map<string, { loaded: number; invoiced: number }>();
    for (const slip of loadingSlips) {
      if (slip.status === "Cancelled") continue;
      for (const line of slip.lines || []) {
        const scheduleId = scheduleIdByPlanId.get(line.dispatchPlanId);
        if (!scheduleId) continue;
        const totals = loadBySchedule.get(scheduleId) || { loaded: 0, invoiced: 0 };
        totals.loaded += num(line.loadedQty);
        if (slip.invoiceId) totals.invoiced += num(line.loadedQty);
        loadBySchedule.set(scheduleId, totals);
      }
    }

    const byCustomer = new Map<string, CustomerRow>();
    for (const schedule of schedules) {
      const scheduledDate = String(schedule.scheduledDate || "").slice(0, 10);
      if (!scheduledDate || scheduledDate >= CUTOFF_DATE) continue;
      const order = orderById.get(schedule.orderId);
      if (firmFilter && String(schedule.firmId || order?.firmId || "") !== firmFilter) continue;
      const company = order?.companyId ? companyById.get(order.companyId) : undefined;
      const id = company?.id || "__none__";
      const row = byCustomer.get(id) || { id, companyName: company?.name || "-", schedules: 0, scheduledQty: 0, canceledQty: 0, ffgQty: 0, loadedQty: 0, invoicedQty: 0, pendingQty: 0, ffgLessInvoiced: 0 };
      const load = loadBySchedule.get(schedule.id);
      if (pendingOnly && num(schedule.qty) - num(schedule.canceledQty) - (load?.invoiced || 0) <= 0) continue;
      row.schedules += 1;
      row.scheduledQty += num(schedule.qty);
      row.canceledQty += num(schedule.canceledQty);
      row.ffgQty += ffgBySchedule.get(schedule.id) || 0;
      row.loadedQty += load?.loaded || 0;
      row.invoicedQty += load?.invoiced || 0;
      row.pendingQty += Math.max(num(schedule.qty) - num(schedule.canceledQty) - (load?.invoiced || 0), 0);
      row.ffgLessInvoiced = row.ffgQty - row.invoicedQty;
      byCustomer.set(id, row);
    }
    return Array.from(byCustomer.values()).sort((a, b) => a.companyName.localeCompare(b.companyName, undefined, { sensitivity: "base" }));
  }, [schedules, orders, companies, productions, plans, loadingSlips, firmFilter, pendingOnly]);

  const filteredRows = useMemo(() => {
    const words = searchWords(searchTerm);
    if (words.length === 0) return customerRows;
    return customerRows.filter((row) => {
      const text = rowSearchText([row.companyName, row.schedules, row.scheduledQty, row.canceledQty, row.ffgQty, row.loadedQty, row.invoicedQty, row.pendingQty, row.ffgLessInvoiced]);
      return words.every((word) => text.includes(word));
    });
  }, [customerRows, searchTerm]);

  const { sorted, sort, toggle } = useTableSort(filteredRows, (row, key) => (row as any)[key] ?? "");
  const { page, setPage, pageSize, setPageSize, totalItems, paginatedItems } = useClientPagination(sorted, 25);
  const toggleSort = (key: string) => {
    toggle(key);
    setPage(1);
  };

  const totals = useMemo(
    () =>
      filteredRows.reduce(
        (sum, row) => ({
          schedules: sum.schedules + row.schedules,
          scheduledQty: sum.scheduledQty + row.scheduledQty,
          canceledQty: sum.canceledQty + row.canceledQty,
          ffgQty: sum.ffgQty + row.ffgQty,
          loadedQty: sum.loadedQty + row.loadedQty,
          invoicedQty: sum.invoicedQty + row.invoicedQty,
          pendingQty: sum.pendingQty + row.pendingQty,
          ffgLessInvoiced: sum.ffgLessInvoiced + row.ffgLessInvoiced,
        }),
        { schedules: 0, scheduledQty: 0, canceledQty: 0, ffgQty: 0, loadedQty: 0, invoicedQty: 0, pendingQty: 0, ffgLessInvoiced: 0 },
      ),
    [filteredRows],
  );

  const menuPortalTarget = typeof document !== "undefined" ? document.body : null;
  const compactSelectStyles = {
    control: (provided: any) => ({ ...provided, minHeight: 34, height: 34, borderWidth: 2, borderColor: "#000", borderRadius: 4, fontSize: 12, fontWeight: 600 }),
    valueContainer: (provided: any) => ({ ...provided, padding: "0 6px" }),
    indicatorsContainer: (provided: any) => ({ ...provided, height: 30 }),
    menu: (provided: any) => ({ ...provided, zIndex: 9999, fontSize: 12 }),
    menuPortal: (provided: any) => ({ ...provided, zIndex: 9999 }),
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">Customer Wise Scheduled Summary</h2>
        <span className="text-xs font-bold text-slate-600">Schedules dated before 17-11-2026</span>
      </div>

      <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
          <div className="min-w-0">
            <span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Firm</span>
            <Select
              options={firmOptions}
              value={firmOptions.find((option) => option.value === firmFilter) || null}
              onChange={(option) => setFirmFilter(option ? (option as SelectOption).value : "")}
              isClearable
              placeholder="All"
              menuPortalTarget={menuPortalTarget}
              menuPosition="fixed"
              styles={compactSelectStyles}
            />
          </div>
          <label className="flex min-w-0 items-end gap-2 pb-2 text-xs font-bold text-black">
            <input type="checkbox" checked={pendingOnly} onChange={(event) => setPendingOnly(event.target.checked)} className="h-4 w-4 accent-indigo-700" />
            Pending schedules only
          </label>
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
              <th className="border border-black px-2 py-2 text-left"><SortHeader label="Customer" sortKey="companyName" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="border border-black px-2 py-2 text-right"><SortHeader label="Schedules" sortKey="schedules" sort={sort} onToggle={toggleSort} align="right" /></th>
              <th className="border border-black bg-indigo-50 px-2 py-2 text-right"><SortHeader label="Total Scheduled" sortKey="scheduledQty" sort={sort} onToggle={toggleSort} align="right" /></th>
              <th className="border border-black bg-red-50 px-2 py-2 text-right text-red-700"><SortHeader label="Total Cancelled" sortKey="canceledQty" sort={sort} onToggle={toggleSort} align="right" /></th>
              <th className="border border-black bg-lime-50 px-2 py-2 text-right text-lime-800"><SortHeader label="Total FFG" sortKey="ffgQty" sort={sort} onToggle={toggleSort} align="right" /></th>
              <th className="border border-black bg-amber-50 px-2 py-2 text-right"><SortHeader label="Total Loaded" sortKey="loadedQty" sort={sort} onToggle={toggleSort} align="right" /></th>
              <th className="border border-black bg-purple-50 px-2 py-2 text-right"><SortHeader label="Total Invoiced" sortKey="invoicedQty" sort={sort} onToggle={toggleSort} align="right" /></th>
              <th className="border border-black bg-sky-50 px-2 py-2 text-right text-sky-800"><SortHeader label="Total Pending" sortKey="pendingQty" sort={sort} onToggle={toggleSort} align="right" /></th>
              <th className="border border-black bg-orange-50 px-2 py-2 text-right text-orange-800"><SortHeader label="FFG - Invoiced" sortKey="ffgLessInvoiced" sort={sort} onToggle={toggleSort} align="right" /></th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {paginatedItems.length === 0 ? (
              <tr><td colSpan={10} className="border border-black px-3 py-8 text-center font-bold text-slate-500">{schedulesLoading ? "Loading…" : "No schedules found."}</td></tr>
            ) : (
              paginatedItems.map((row, index) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="border border-black px-3 py-2 text-slate-500">{(page - 1) * pageSize + index + 1}</td>
                  <td className="border border-black px-3 py-2 font-semibold">{row.companyName}</td>
                  <td className="border border-black px-3 py-2 text-right">{row.schedules.toLocaleString()}</td>
                  <td className="border border-black bg-indigo-50/30 px-3 py-2 text-right font-medium">{row.scheduledQty.toLocaleString()}</td>
                  <td className="border border-black bg-red-50/30 px-3 py-2 text-right font-medium text-red-600">{row.canceledQty.toLocaleString()}</td>
                  <td className="border border-black bg-lime-50/30 px-3 py-2 text-right font-medium text-lime-700">{row.ffgQty.toLocaleString()}</td>
                  <td className="border border-black bg-amber-50/30 px-3 py-2 text-right font-medium text-amber-700">{row.loadedQty.toLocaleString()}</td>
                  <td className="border border-black bg-purple-50/30 px-3 py-2 text-right font-medium text-purple-700">{row.invoicedQty.toLocaleString()}</td>
                  <td className="border border-black bg-sky-50/40 px-3 py-2 text-right font-bold text-sky-800">{row.pendingQty.toLocaleString()}</td>
                  <td className={`border border-black bg-orange-50/40 px-3 py-2 text-right font-bold ${row.ffgLessInvoiced < 0 ? "text-red-600" : "text-orange-800"}`}>{row.ffgLessInvoiced.toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
          {filteredRows.length > 0 ? (
            <tfoot className="bg-slate-100 font-bold">
              <tr>
                <td colSpan={2} className="border border-black px-3 py-2 text-right uppercase">Total · {filteredRows.length} customers</td>
                <td className="border border-black px-3 py-2 text-right">{totals.schedules.toLocaleString()}</td>
                <td className="border border-black bg-indigo-50 px-3 py-2 text-right">{totals.scheduledQty.toLocaleString()}</td>
                <td className="border border-black bg-red-50 px-3 py-2 text-right text-red-700">{totals.canceledQty.toLocaleString()}</td>
                <td className="border border-black bg-lime-50 px-3 py-2 text-right text-lime-800">{totals.ffgQty.toLocaleString()}</td>
                <td className="border border-black bg-amber-50 px-3 py-2 text-right text-amber-700">{totals.loadedQty.toLocaleString()}</td>
                <td className="border border-black bg-purple-50 px-3 py-2 text-right text-purple-700">{totals.invoicedQty.toLocaleString()}</td>
                <td className="border border-black bg-sky-50 px-3 py-2 text-right text-sky-800">{totals.pendingQty.toLocaleString()}</td>
                <td className="border border-black bg-orange-50 px-3 py-2 text-right text-orange-800">{totals.ffgLessInvoiced.toLocaleString()}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      <ClientPagination page={page} pageSize={pageSize} totalItems={totalItems} onPageChange={setPage} onPageSizeChange={setPageSize} />
    </div>
  );
}
