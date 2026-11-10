import React, { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Select } from "../components/Select";
import { ClientPagination } from "../components/ClientPagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { useData } from "../hooks/useData";
import { Order } from "../types";
import { formatDate } from "../lib/utils";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { Firm } from "../types";
import { getFirmDisplayName, getFirmDisplayNameById } from "../lib/firmDisplay";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";

export function CanceledOrders() {
  const [searchTerm, setSearchTerm] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [firmFilter, setFirmFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [orders] = useData<Order>("orders", []);
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const [companies] = useData("companies", []);
  const { resolveOrderItem } = useOrderItemCatalog();

  const baseRows = useMemo(() => {
    return orders
      .filter((order) => order.status === 'Cancelled')
      .map((order) => {
        const company = (companies as any[]).find((row) => row.id === order.companyId);
        const item = resolveOrderItem(order);
        const itemKey = item?.id || `${item?.name || ""}::${item?.erp || ""}`;
        return { order, company, item, companyName: company?.name || "", itemKey };
      });
  }, [companies, orders, resolveOrderItem]);

  const canceledRows = useMemo(() => {
    const words = searchWords(searchTerm);
    return baseRows.filter(({ order, companyName, item, itemKey }) => {
      if (firmFilter && String(order.firmId || "") !== firmFilter) return false;
      if (companyFilter && order.companyId !== companyFilter) return false;
      if (itemFilter && itemKey !== itemFilter) return false;
      const orderDay = String(order.orderDate || "").slice(0, 10);
      if (dateFrom && orderDay < dateFrom) return false;
      if (dateTo && orderDay > dateTo) return false;
      return matchesTableSearch([
        order.orderNo,
        formatDate(order.orderDate),
        getFirmDisplayNameById(order.firmId, firms, order.firmName),
        companyName,
        item?.name,
        item?.erp,
        order.qty,
        order.remarks,
      ], words);
    });
  }, [baseRows, companyFilter, dateFrom, dateTo, firmFilter, firms, itemFilter, searchTerm]);

  const { sorted: sortedRows, sort, toggle: toggleSort } = useTableSort(canceledRows, ({ order, company, item }, key) => {
    switch (key) {
      case "orderNo": return order.orderNo;
      case "orderDate": return order.orderDate;
      case "firm": return getFirmDisplayNameById(order.firmId, firms, order.firmName);
      case "company": return company?.name;
      case "item": return item?.name;
      case "erp": return item?.erp;
      case "qty": return Number(order.qty);
      case "remarks": return order.remarks;
      default: return "";
    }
  }, [firms]);

  const firmOptions = useMemo(() => {
    const ids = new Set(baseRows.map(({ order }) => String(order.firmId || "")).filter(Boolean));
    return firms
      .filter((firm) => ids.has(String(firm.id)))
      .map((firm) => ({ value: String(firm.id), label: getFirmDisplayName(firm) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [baseRows, firms]);

  const companyOptions = useMemo(
    () =>
      Array.from(
        new Map(baseRows.map((row) => [row.order.companyId, { value: row.order.companyId, label: row.companyName }])).values()
      )
        .filter((option) => option.value && option.label)
        .sort((a, b) => a.label.localeCompare(b.label)),
    [baseRows]
  );

  const itemOptions = useMemo(
    () =>
      Array.from(
        new Map(
          baseRows.map((row) => [
            row.itemKey,
            {
              value: row.itemKey,
              label:
                row.item?.erp && row.item?.name && !row.item.name.toLowerCase().includes(String(row.item.erp).toLowerCase())
                  ? `${row.item.name} - ${row.item.erp}`
                  : row.item?.name || row.item?.erp || "",
              searchText: `${row.item?.name || ""} ${row.item?.erp || ""}`,
            },
          ])
        ).values()
      )
        .filter((option) => option.value && option.label)
        .sort((a, b) => a.label.localeCompare(b.label)),
    [baseRows]
  );

  const filtersActive = Boolean(searchTerm.trim() || companyFilter || firmFilter || itemFilter || dateFrom || dateTo);
  const clearFilters = () => {
    setSearchTerm(""); setCompanyFilter(""); setFirmFilter(""); setItemFilter(""); setDateFrom(""); setDateTo("");
  };

  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalItems,
    paginatedItems: paginatedRows,
  } = useClientPagination(sortedRows, 25);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, companyFilter, firmFilter, itemFilter, dateFrom, dateTo, setPage]);

  return (
    <div className="space-y-4">
      <div className="border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">Canceled Orders</h2>
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
          <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Order From Date</span><input type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
          <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Order To Date</span><input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
        </div>
        <div data-mf-actions="true" className="flex justify-end gap-2">
          {filtersActive ? (
            <button type="button" onClick={clearFilters} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button>
          ) : null}
          <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-black bg-white">
        <table className="min-w-full border-collapse border border-black text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-2 py-1.5 border border-black"><SortHeader label="Order No" sortKey="orderNo" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-2 py-1.5 border border-black"><SortHeader label="Order Date" sortKey="orderDate" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-2 py-1.5 border border-black"><SortHeader label="Firm" sortKey="firm" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-2 py-1.5 border border-black"><SortHeader label="Company" sortKey="company" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-2 py-1.5 border border-black"><SortHeader label="Item" sortKey="item" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-2 py-1.5 border border-black"><SortHeader label="Item ERP" sortKey="erp" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-2 py-1.5 border border-black text-right"><SortHeader label="Qty" sortKey="qty" sort={sort} onToggle={toggleSort} align="right" /></th>
              <th className="px-2 py-1.5 border border-black"><SortHeader label="Remarks" sortKey="remarks" sort={sort} onToggle={toggleSort} align="center" /></th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.length === 0 ? (
              <tr><td colSpan={8} className="h-16" aria-label="No records" /></tr>
            ) : paginatedRows.map(({ order: o, company, item }) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <td className="px-2 py-1.5 border border-black">{o.orderNo}</td>
                <td className="px-2 py-1.5 border border-black whitespace-nowrap">{formatDate(o.orderDate)}</td>
                <td className="px-2 py-1.5 border border-black font-semibold">{getFirmDisplayNameById(o.firmId, firms, o.firmName)}</td>
                <td className="px-2 py-1.5 border border-black">{company?.name}</td>
                <td className="px-2 py-1.5 border border-black">{item?.name || "-"}</td>
                <td className="px-2 py-1.5 border border-black">{item?.erp || "-"}</td>
                <td className="px-2 py-1.5 border border-black text-right tabular-nums">{o.qty}</td>
                <td className="px-2 py-1.5 border border-black">{o.remarks}</td>
              </tr>
            ))}
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
