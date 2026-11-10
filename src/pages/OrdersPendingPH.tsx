import React, { useState, useMemo, useEffect } from "react";

import { Select } from "../components/Select";
import { ClientPagination } from "../components/ClientPagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { Invoice, InvoiceLineItem, Production, User } from "../types";
import { useData } from "../hooks/useData";
import { Order } from "../types";
import { formatDate } from "../lib/utils";
import { useNavigate } from "react-router-dom";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { CheckCircle, XCircle, Edit, Search } from "lucide-react";
import { Firm } from "../types";
import { getFirmDisplayName, getFirmDisplayNameById } from "../lib/firmDisplay";
import { TableActionCell } from "../components/TableActionCell";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";

export function OrdersPendingPH() {
  const [searchTerm, setSearchTerm] = useState('');
  const [orderByFilter, setOrderByFilter] = useState('');
  const [firmFilter, setFirmFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [orders, setOrders] = useData<Order>("orders", [], { firmScope: "all" });
  const [companies] = useData("companies", []);
  const [users] = useData<User>("users", []);
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const [invoices] = useData<Invoice>("invoices", [], { firmScope: "all" });
  const [invoiceLines] = useData<InvoiceLineItem>("invoice_line_items", [], { firmScope: "all" });
  const [productions] = useData<Production>("productions", [], { firmScope: "all" });
  const { resolveOrderItem } = useOrderItemCatalog();
  const navigate = useNavigate();

  const userMap = useMemo(() => {
    const map = new Map<string, User>();
    users.forEach((u) => {
      if (u.id) map.set(u.id.toLowerCase(), u);
      if (u.userId) map.set(u.userId.toLowerCase(), u);
      if (u.name) map.set(u.name.toLowerCase(), u);
    });
    return map;
  }, [users]);

  const resolveOrderByUser = (raw: string): User | null => {
    const val = String(raw || "").trim().toLowerCase();
    if (!val) return null;
    return userMap.get(val) || null;
  };

  const pending = orders.filter(o => !o.status || o.status === 'Pending PH');

  const orderByOptions = useMemo(() => {
    const presentUserIds = new Set<string>();
    pending.forEach((o) => {
      const u = resolveOrderByUser(String(o.orderBy || ""));
      if (u) presentUserIds.add(u.id);
    });

    return Array.from(presentUserIds)
      .map((id) => {
        const u = users.find((user) => user.id === id);
        return { value: id, label: u?.name || id };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [pending, users, userMap]);

  const getOrderByLabel = (raw: string) => {
    const u = resolveOrderByUser(String(raw || ""));
    if (u) return u.name || "";
    return String(raw || "").trim();
  };

  const commercialHistoryByItem = useMemo(() => {
    const invoiceDateById = new Map(invoices.map((invoice) => [invoice.id, invoice.date || ""]));
    const invoiceRatesByItem = new Map<string, Array<{ value: number; date: string; id: string }>>();
    invoiceLines.forEach((line) => {
      const key = String(line.npdId || line.itemId || "").trim();
      const rate = Number(line.rate);
      if (!key || !Number.isFinite(rate)) return;
      const rows = invoiceRatesByItem.get(key) || [];
      rows.push({ value: rate, date: String(invoiceDateById.get(line.invoiceId) || ""), id: line.invoiceId });
      invoiceRatesByItem.set(key, rows);
    });
    const productionRapcByItem = new Map<string, Array<{ value: number; date: string }>>();
    productions.forEach((production) => {
      const key = String(production.npdId || production.itemId || "").trim();
      const value = Number(production.realizationPerKg);
      if (!key || !Number.isFinite(value)) return;
      const rows = productionRapcByItem.get(key) || [];
      rows.push({ value, date: production.date || "" });
      productionRapcByItem.set(key, rows);
    });
    const result = new Map<string, { billing1?: number; billing2?: number; rapc1?: number; rapc2?: number }>();
    invoiceRatesByItem.forEach((rates, key) => {
      rates.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)));
      result.set(key, { billing1: rates[0]?.value, billing2: rates[1]?.value });
    });
    productionRapcByItem.forEach((rows, key) => {
      rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      const current = result.get(key) || {};
      result.set(key, { ...current, rapc1: rows[0]?.value, rapc2: rows[1]?.value });
    });
    return result;
  }, [invoiceLines, invoices, productions]);

  const filtered = useMemo(() => {
    const words = searchWords(searchTerm);
    return pending
      .map((order) => {
        const item = resolveOrderItem(order);
        const companyName = (companies as any[]).find((c: any) => c.id === order.companyId)?.name || "";
        return {
          order,
          item,
          companyName,
          firmName: getFirmDisplayNameById(order.firmId, firms),
          orderByLabel: getOrderByLabel(order.orderBy),
          commercialHistory: commercialHistoryByItem.get(String(order.npdId || order.itemId || "").trim()) || {},
        };
      })
      .filter(({ order, item, companyName, firmName, orderByLabel, commercialHistory }) => {
        if (firmFilter && String(order.firmId || "") !== firmFilter) return false;
        if (orderByFilter && String(order.orderBy || "") !== orderByFilter) return false;
        if (companyFilter && String(order.companyId || "") !== companyFilter) return false;
        if (itemFilter && String(item?.name || "") !== itemFilter) return false;
        const orderDay = String(order.orderDate || "").slice(0, 10);
        if (dateFrom && orderDay < dateFrom) return false;
        if (dateTo && orderDay > dateTo) return false;
        return matchesTableSearch([
          order.orderNo,
          formatDate(order.orderDate),
          firmName,
          companyName,
          item?.name,
          item?.erp,
          orderByLabel,
          order.qty,
          commercialHistory.billing1,
          commercialHistory.billing2,
          commercialHistory.rapc1,
          commercialHistory.rapc2,
        ], words);
      })
      .sort((a, b) => {
        const aNo = a.order.orderNo || "";
        const bNo = b.order.orderNo || "";
        const cmp = aNo.localeCompare(bNo, undefined, { numeric: true, sensitivity: "base" });
        return -cmp;
      });
  }, [commercialHistoryByItem, companies, companyFilter, dateFrom, dateTo, firmFilter, firms, itemFilter, orderByFilter, pending, resolveOrderItem, searchTerm]);

  const { sorted: sortedRows, sort, toggle: toggleSort } = useTableSort(filtered, (row, key) => {
    switch (key) {
      case "orderNo": return row.order.orderNo;
      case "orderDate": return row.order.orderDate;
      case "firm": return row.firmName;
      case "company": return row.companyName;
      case "item": return row.item?.name;
      case "erp": return row.item?.erp;
      case "orderBy": return row.orderByLabel;
      case "qty": return Number(row.order.qty);
      case "billing1": return row.commercialHistory.billing1;
      case "billing2": return row.commercialHistory.billing2;
      case "rapc1": return row.commercialHistory.rapc1;
      case "rapc2": return row.commercialHistory.rapc2;
      default: return "";
    }
  });

  const firmFilterOptions = useMemo(() => {
    const ids = new Set(pending.map((order) => String(order.firmId || "")).filter(Boolean));
    return firms
      .filter((firm) => ids.has(String(firm.id)))
      .map((firm) => ({ value: String(firm.id), label: getFirmDisplayName(firm) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [firms, pending]);
  const companyFilterOptions = useMemo(() => {
    const ids = new Set(pending.map((order) => String(order.companyId || "")).filter(Boolean));
    return (companies as any[])
      .filter((company: any) => ids.has(String(company.id)))
      .map((company: any) => ({ value: String(company.id), label: String(company.name || company.id) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [companies, pending]);
  const itemFilterOptions = useMemo(() => {
    const names = new Set(pending.map((order) => String(resolveOrderItem(order)?.name || "")).filter(Boolean));
    return Array.from(names).sort((a, b) => a.localeCompare(b)).map((name) => ({ value: name, label: name }));
  }, [pending, resolveOrderItem]);
  const filtersActive = Boolean(searchTerm.trim() || firmFilter || orderByFilter || companyFilter || itemFilter || dateFrom || dateTo);
  const clearFilters = () => {
    setSearchTerm(""); setFirmFilter(""); setOrderByFilter(""); setCompanyFilter(""); setItemFilter(""); setDateFrom(""); setDateTo("");
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
  }, [searchTerm, firmFilter, orderByFilter, companyFilter, itemFilter, dateFrom, dateTo, setPage]);

  const presentOrderByValues = Array.from(new Set(pending.map(o => String(o.orderBy || "").trim()).filter(Boolean)));
  const unmappedOrderBys = presentOrderByValues.filter(v => !resolveOrderByUser(v));
  const params = new URLSearchParams(window.location.search);
  const showDebug = params.get("debug") === "1";

  const handleApprove = (id: string) => {
    const now = new Date().toISOString();
    setOrders(
      orders.map((o) =>
        o.id === id
          ? {
              ...o,
              status: "Pending Scheduling",
              approvedTimestamp: o.approvedTimestamp || now,
              approvedEmail: o.approvedEmail || "System User",
              updatedBy: "System User",
              updateTimestamp: now,
            }
          : o
      )
    );
  };

  const handleCancel = (id: string) => {
    const cancelRemarks = window.prompt("Enter cancel remarks");
    if (cancelRemarks === null) return;
    if (!cancelRemarks.trim()) {
      alert("Cancel remarks are required.");
      return;
    }
    const timestamp = new Date().toISOString();
    setOrders(
      orders.map((o) =>
        o.id === id
          ? {
              ...o,
              status: 'Cancelled',
              remarks: [o.remarks?.trim(), `Cancel Remarks: ${cancelRemarks.trim()}`].filter(Boolean).join(" | "),
              updatedBy: 'System User',
              updateTimestamp: timestamp,
            }
          : o
      )
    );
  };

  return (
    <div className="space-y-4">
      <div className="border-b border-black pb-3">
        <h2 className="text-xl font-bold text-black uppercase tracking-tight">Pending Salesman Approval</h2>
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
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Firm</span><Select compact value={firmFilter} onChange={setFirmFilter} options={firmFilterOptions} placeholder="All" /></div>
          <div className="col-span-2 min-w-0 md:col-span-1"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Company</span><Select compact value={companyFilter} onChange={setCompanyFilter} options={companyFilterOptions} placeholder="All" /></div>
          <div className="col-span-2 min-w-0 md:col-span-1"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Item</span><Select compact value={itemFilter} onChange={setItemFilter} options={itemFilterOptions} placeholder="All" /></div>
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Order By</span><Select compact value={orderByFilter} onChange={setOrderByFilter} options={orderByOptions} placeholder="All" /></div>
          <div data-date-pair="true" className="col-span-2 grid min-w-0 grid-cols-2 gap-2 sm:min-w-[260px]">
            <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Order From Date</span><input type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
          <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Order To Date</span><input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
          </div>
        </div>
        <div data-mf-actions="true" className="flex justify-end gap-2">
          {filtersActive ? (
            <button type="button" onClick={clearFilters} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button>
          ) : null}
          <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-black bg-white">
        {showDebug && (
          <div className="p-3 bg-yellow-50 border-b border-black text-sm">
            <strong>Debug:</strong> Unmapped Order By values: {unmappedOrderBys.length} {unmappedOrderBys.length > 0 && ` â€” ${unmappedOrderBys.slice(0,10).join(", ")}`}
          </div>
        )}
        <table className="min-w-full divide-y divide-black border-collapse border border-black text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-2 border border-black"><SortHeader label="Order No" sortKey="orderNo" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-4 py-2 border border-black"><SortHeader label="Order Date" sortKey="orderDate" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-4 py-2 border border-black"><SortHeader label="Firm" sortKey="firm" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-4 py-2 border border-black"><SortHeader label="Company" sortKey="company" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-4 py-2 border border-black"><SortHeader label="Item" sortKey="item" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-4 py-2 border border-black"><SortHeader label="Item ERP" sortKey="erp" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-4 py-2 border border-black"><SortHeader label="Order By" sortKey="orderBy" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-4 py-2 border border-black"><SortHeader label="Qty" sortKey="qty" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-4 py-2 border border-black whitespace-nowrap"><SortHeader label="Billing 1" sortKey="billing1" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-4 py-2 border border-black whitespace-nowrap"><SortHeader label="Billing 2" sortKey="billing2" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-4 py-2 border border-black whitespace-nowrap"><SortHeader label="Realization 1" sortKey="rapc1" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-4 py-2 border border-black whitespace-nowrap"><SortHeader label="Realization 2" sortKey="rapc2" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-4 py-2 border border-black">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={13} className="h-16" aria-label="No records" /></tr>
            ) : paginatedRows.map(({ order: o, item, companyName, firmName, orderByLabel, commercialHistory }) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <td className="px-4 py-2 border border-black">{o.orderNo}</td>
                <td className="px-4 py-2 border border-black">{formatDate(o.orderDate)}</td>
                <td className="px-4 py-2 border border-black font-semibold">{firmName}</td>
                <td className="px-4 py-2 border border-black">{companyName || "-"}</td>
                <td className="px-4 py-2 border border-black">{item?.name || "-"}</td>
                <td className="px-4 py-2 border border-black">{item?.erp || "-"}</td>
                <td className="px-4 py-2 border border-black whitespace-nowrap">{orderByLabel || '-'}</td>
                <td className="px-4 py-2 border border-black">{o.qty}</td>
                <td className="px-4 py-2 border border-black text-right">{commercialHistory.billing1 === undefined ? "-" : commercialHistory.billing1.toFixed(2)}</td>
                <td className="px-4 py-2 border border-black text-right">{commercialHistory.billing2 === undefined ? "-" : commercialHistory.billing2.toFixed(2)}</td>
                <td className="px-4 py-2 border border-black text-right">{commercialHistory.rapc1 === undefined ? "-" : commercialHistory.rapc1.toFixed(2)}</td>
                <td className="px-4 py-2 border border-black text-right">{commercialHistory.rapc2 === undefined ? "-" : commercialHistory.rapc2.toFixed(2)}</td>
                <td className="px-4 py-2 border border-black">
                  <TableActionCell align="center">
                    <button
                      data-action="approve"
                      onClick={() => handleApprove(o.id)} 
                      title="Approve"
                      aria-label="Approve"
                      className="text-emerald-600 hover:text-emerald-800 transition-colors"
                    >
                      <CheckCircle size={20} />
                    </button>
                    <button 
                      data-action="edit"
                      onClick={() => navigate(`/orders/form?edit=${o.id}`)} 
                      title="Edit"
                      aria-label="Edit"
                      className="text-slate-600 hover:text-slate-900 transition-colors"
                    >
                      <Edit size={20} />
                    </button>
                    <button
                      data-action="reject"
                      onClick={() => handleCancel(o.id)}
                      title="Reject"
                      aria-label="Reject"
                      className="shrink-0 text-red-600 transition-colors hover:text-red-800"
                    >
                      <XCircle size={20} />
                    </button>
                  </TableActionCell>
                </td>
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
