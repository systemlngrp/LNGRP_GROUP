import React, { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useData } from "../hooks/useData";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { normalizeOrderItemSource } from "../lib/orderItems";
import { Company, Firm, Order, OrderSchedule } from "../types";
import { formatDate } from "../lib/serial";
import { Select } from "../components/Select";
import { getFirmDisplayNameById } from "../lib/firmDisplay";
import { ClientPagination } from "../components/ClientPagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";

export function PendingNpd() {
  // Load every firm's orders/schedules; the page's own Firm filter narrows them.
  const [orders] = useData<Order>("orders", [], { firmScope: "all" });
  const [schedules] = useData<OrderSchedule>("orders_schedule", [], { firmScope: "all" });
  const [companies] = useData<Company>("companies", []);
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const { fgItems: npdItems } = useOrderItemCatalog({ includeMaterials: false });
  const [searchTerm, setSearchTerm] = useState("");
  const [firmFilter, setFirmFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [boxTypeFilter, setBoxTypeFilter] = useState("");
  const [fromDateFilter, setFromDateFilter] = useState("");
  const [toDateFilter, setToDateFilter] = useState("");

  const baseRows = useMemo(() => {
    // First match per id, the same record the earlier list searches picked.
    const firstById = <T extends { id: string }>(list: T[]) => {
      const map = new Map<string, T>();
      list.forEach((row) => { if (!map.has(row.id)) map.set(row.id, row); });
      return map;
    };
    const orderById = firstById(orders);
    const itemById = firstById(npdItems as Array<{ id: string }>);
    const companyById = firstById(companies);
    return schedules
      .map((schedule) => {
        const order = orderById.get(schedule.orderId);
        if (!order || order.status === "Cancelled") return null;
        if (normalizeOrderItemSource(order.itemSource) !== "FG") return null;
        const item = itemById.get(String(order.itemId || "").trim()) as (typeof npdItems)[number] | undefined;
        const company = companyById.get(order.companyId);
        const firmId = String(schedule.firmId || order.firmId || "");
        // Catalog items keep the original NPD row in `raw` (RAPC is stored there).
        const boxType = String((item as any)?.boxType || (item as any)?.raw?.boxType || "").trim();
        const rapcValue = String((item as any)?.raw?.rapc ?? (item as any)?.rapc ?? "").trim();
        return {
          schedule,
          order,
          item,
          company,
          firmId,
          firmName: getFirmDisplayNameById(firmId, firms),
          boxType,
          rapcValue,
        };
      })
      .filter(Boolean)
      // Show incomplete NPD setup when either required field is missing.
      .filter((row) => row.item && (!row.boxType || !row.rapcValue));
  }, [companies, firms, npdItems, orders, schedules]);

  const pendingRows = useMemo(() => {
    const rows = baseRows.filter((row) => {
      if (firmFilter && row.firmId !== firmFilter) return false;
      if (companyFilter && String(row.order.companyId || "") !== companyFilter) return false;
      if (itemFilter && String(row.item?.id || "") !== itemFilter) return false;
      if (boxTypeFilter && (row.boxType || "Missing") !== boxTypeFilter) return false;
      const orderYmd = String(row.order.orderDate || "").slice(0, 10);
      if (fromDateFilter && orderYmd < fromDateFilter) return false;
      if (toDateFilter && orderYmd > toDateFilter) return false;
      return true;
    });

    const words = searchWords(searchTerm);
    if (!words.length) return rows;

    return rows.filter(({ schedule, order, item, company, firmName, boxType, rapcValue }) => matchesTableSearch([
      order.orderNo,
      formatDate(order.orderDate),
      schedule.scheduleNo,
      formatDate(schedule.scheduledDate),
      firmName,
      company?.name,
      order.erpCode,
      item?.name,
      boxType || "Missing",
      rapcValue || "Missing",
    ], words));
  }, [baseRows, boxTypeFilter, companyFilter, firmFilter, fromDateFilter, itemFilter, searchTerm, toDateFilter]);

  const firmOptions = useMemo(() => Array.from(new Map(baseRows.filter((row) => row.firmId).map((row) => [row.firmId, { value: row.firmId, label: row.firmName }])).values()).sort((a, b) => a.label.localeCompare(b.label)), [baseRows]);
  const companyOptions = useMemo(() => Array.from(new Map(baseRows.filter((row) => row.order.companyId && row.company?.name).map((row) => [String(row.order.companyId), { value: String(row.order.companyId), label: String(row.company?.name || "") }])).values()).sort((a, b) => a.label.localeCompare(b.label)), [baseRows]);
  const itemOptions = useMemo(() => Array.from(new Map(baseRows.filter((row) => row.item?.id && row.item?.name).map((row) => [String(row.item?.id), { value: String(row.item?.id), label: String(row.item?.name || "") }])).values()).sort((a, b) => a.label.localeCompare(b.label)), [baseRows]);
  const boxTypeOptions = useMemo(() => Array.from(new Set(baseRows.map((row) => row.boxType || "Missing"))).sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value })), [baseRows]);
  const hasActiveFilters = Boolean(searchTerm.trim() || firmFilter || companyFilter || itemFilter || boxTypeFilter || fromDateFilter || toDateFilter);
  const clearFilters = () => { setSearchTerm(""); setFirmFilter(""); setCompanyFilter(""); setItemFilter(""); setBoxTypeFilter(""); setFromDateFilter(""); setToDateFilter(""); };
  // The table draws 100 rows per page.
  const { sorted: sortedRows, sort, toggle: toggleSort } = useTableSort(pendingRows, (row, key) => {
    switch (key) {
      case "orderNo": return row.order.orderNo;
      case "orderDate": return row.order.orderDate;
      case "scheduleNo": return row.schedule.scheduleNo;
      case "scheduledDate": return row.schedule.scheduledDate;
      case "firm": return row.firmName;
      case "company": return row.company?.name;
      case "erp": return row.order.erpCode;
      case "item": return row.item?.name;
      case "boxType": return row.boxType || "Missing";
      case "rapc": return row.rapcValue || "Missing";
      default: return "";
    }
  });
  const { page, setPage, pageSize, setPageSize, totalItems, paginatedItems: pagedRows } = useClientPagination(sortedRows, 100);
  useEffect(() => { setPage(1); }, [firmFilter, companyFilter, itemFilter, boxTypeFilter, fromDateFilter, toDateFilter, searchTerm, setPage]);

  return (
    <div className="space-y-6">
      <div className="border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">Pending NPD</h2>
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
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Company</span><Select compact value={companyFilter} onChange={setCompanyFilter} options={companyOptions} placeholder="All" /></div>
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Item</span><Select compact value={itemFilter} onChange={setItemFilter} options={itemOptions} placeholder="All" /></div>
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Box Type</span><Select compact value={boxTypeFilter} onChange={setBoxTypeFilter} options={boxTypeOptions} placeholder="All" /></div>
          <div data-date-pair="true" className="col-span-2 grid min-w-0 grid-cols-2 gap-2 sm:min-w-[260px]">
            <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Order From Date</span><input type="date" value={fromDateFilter} max={toDateFilter || undefined} onChange={(e) => setFromDateFilter(e.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
          <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Order To Date</span><input type="date" value={toDateFilter} min={fromDateFilter || undefined} onChange={(e) => setToDateFilter(e.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
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
        <table className="w-full min-w-[1180px] table-fixed text-sm">
          <thead className="bg-slate-100">
            <tr>
              {([['SL No', ''], ['Order No', 'orderNo'], ['Order Date', 'orderDate'], ['Schedule No', 'scheduleNo'], ['Schedule Date', 'scheduledDate'], ['Firm', 'firm'], ['Company', 'company'], ['ERP', 'erp'], ['Item', 'item'], ['Box Type', 'boxType'], ['RAPC', 'rapc']] as const).map(([heading, key]) => (
                <th key={heading} className="border border-black px-3 py-2 text-left align-middle whitespace-nowrap">{key ? <SortHeader label={heading} sortKey={key} sort={sort} onToggle={toggleSort} align="left" /> : heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pendingRows.length === 0 ? (
              <tr><td colSpan={11} className="h-16" aria-label="No records" /></tr>
            ) : (
              pagedRows.map(({ schedule, order, item, company, firmName, boxType, rapcValue }, index) => (
                <tr key={schedule.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 border border-black font-bold whitespace-nowrap">{(page - 1) * pageSize + index + 1}</td>
                  <td className="px-3 py-2 border border-black whitespace-nowrap">{order.orderNo || "-"}</td>
                  <td className="px-3 py-2 border border-black whitespace-nowrap">{formatDate(order.orderDate)}</td>
                  <td className="px-3 py-2 border border-black whitespace-nowrap font-bold text-indigo-700">{schedule.scheduleNo || "-"}</td>
                  <td className="px-3 py-2 border border-black whitespace-nowrap">{formatDate(schedule.scheduledDate)}</td>
                  <td className="px-3 py-2 border border-black font-semibold">{firmName}</td>
                  <td className="px-3 py-2 border border-black">{company?.name || "-"}</td>
                  <td className="px-3 py-2 border border-black whitespace-nowrap">{order.erpCode || "-"}</td>
                  <td className="px-3 py-2 border border-black">{item?.name || "-"}</td>
                  <td className={`px-3 py-2 border border-black font-bold ${boxType ? "" : "bg-red-100 text-red-700"}`}>
                    {boxType || "Missing"}
                  </td>
                  <td className={`px-3 py-2 border border-black font-bold ${rapcValue ? "" : "bg-red-100 text-red-700"}`}>
                    {rapcValue || "Missing"}
                  </td>
                </tr>
              ))
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
        pageSizeOptions={[100, 250, 500]}
      />
    </div>
  );
}
