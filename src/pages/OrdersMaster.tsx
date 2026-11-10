import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import Select from "react-select";
import { useData } from "../hooks/useData";
import { getFirmDisplayName } from "../lib/firmDisplay";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { ClientPagination } from "../components/ClientPagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { formatDate } from "../lib/utils";
import { matchesTableSearch, rowSearchText, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";
import { Company, DispatchPlan, Firm, LoadingSlip, Order, OrderSchedule, User, Supplier } from "../types";

type OrderMasterRow = {
  order: Order;
  firmName: string;
  companyName: string;
  itemName: string;
  itemErp: string;
  itemKey: string;
  orderByName: string;
  canceledQty: number;
  invoicedQty: number;
  pendingQty: number;
  orderAmount: number;
};

const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseOrderSerial = (orderNo?: string) => {
  const value = String(orderNo || "").trim();
  if (!value) return 0;
  const serialPart = value.split("/").pop() || value;
  const parsed = parseInt(serialPart, 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatAmount = (value: number) => toNumber(value).toFixed(2);

const isWithinDateRange = (value: string, fromDate: string, toDate: string) => {
  if (!value) return false;
  if (fromDate && value < fromDate) return false;
  if (toDate && value > toDate) return false;
  return true;
};

export function OrdersMaster() {
  const navigate = useNavigate();
  const [orders] = useData<Order>("orders", [], { firmScope: "all" });
  const [companies] = useData<Company>("companies", []);
  const [firms] = useData<Firm>("firms", []);
  const [suppliers] = useData<Supplier>("suppliers", []);
  const [users] = useData<User>("users", []);
  // Totals only: fetch just the columns used for cancelled / invoiced qty.
  const [schedules] = useData<OrderSchedule>("orders_schedule", [], { firmScope: "all", fields: ["orderId", "canceledQty"] });
  const [dispatchPlans] = useData<DispatchPlan>("dispatch_plans", [], { fields: ["orderId"] });
  const [loadingSlips] = useData<LoadingSlip>("loading_slips", [], { fields: ["invoiceId", "lines"] });
  const { resolveOrderItem } = useOrderItemCatalog();

  const [searchTerm, setSearchTerm] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [firmFilter, setFirmFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [orderByFilter, setOrderByFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const companyMap = useMemo(
    () => {
      const map = new Map<string, string>();
      companies.forEach(c => map.set(c.id, c.name || ""));
      suppliers.forEach(s => {
        if (!map.has(s.id)) map.set(s.id, s.name || "");
      });
      return map;
    },
    [companies, suppliers]
  );
  const itemMap = useMemo(
    () => new Map(orders.map((order) => [order.id, resolveOrderItem(order)])),
    [orders, resolveOrderItem]
  );
  const firmMap = useMemo(
    () => new Map(firms.map((firm) => [firm.id, getFirmDisplayName(firm)])), 
    [firms]
  );
  const userMap = useMemo(
    () => new Map(users.map((user) => [user.id, user.name || ""])),
    [users]
  );

  const canceledQtyByOrderId = useMemo(() => {
    const map = new Map<string, number>();
    schedules.forEach((schedule) => {
      const orderId = String(schedule.orderId || "");
      if (!orderId) return;
      map.set(orderId, toNumber(map.get(orderId)) + toNumber(schedule.canceledQty));
    });
    return map;
  }, [schedules]);

  const dispatchPlanToOrderMap = useMemo(() => {
    const map = new Map<string, string>();
    dispatchPlans.forEach((plan) => {
      if (plan.id) {
        map.set(plan.id, String(plan.orderId || ""));
      }
    });
    return map;
  }, [dispatchPlans]);

  const invoicedQtyByOrderId = useMemo(() => {
    const map = new Map<string, number>();

    loadingSlips.forEach((slip) => {
      if (!slip.invoiceId || !Array.isArray(slip.lines)) return;

      slip.lines.forEach((line) => {
        const orderId = dispatchPlanToOrderMap.get(String(line.dispatchPlanId || ""));
        if (!orderId) return;
        map.set(orderId, toNumber(map.get(orderId)) + toNumber(line.loadedQty));
      });
    });

    return map;
  }, [dispatchPlanToOrderMap, loadingSlips]);

  const rows = useMemo<OrderMasterRow[]>(() => {
    return orders.map((order) => {
      const canceledQty = toNumber(canceledQtyByOrderId.get(order.id));
      const invoicedQty = toNumber(invoicedQtyByOrderId.get(order.id));
      const orderAmount = toNumber(order.orderAmount) || toNumber(order.qty) * toNumber(order.rate);
      const pendingQty = Math.max(0, toNumber(order.qty) - canceledQty - invoicedQty);

      const item = itemMap.get(order.id);
      const itemName = String(item?.name || "").trim();
      const itemErp = String(order.erpCode || item?.erp || "").trim();
      const itemKey = itemName || itemErp ? `${itemName}::${itemErp}` : "";

      return {
        order,
        firmName: String(firmMap.get(order.firmId || "") || order.firmName || "Unassigned"),
        companyName: companyMap.get(order.companyId) || "",
        itemName,
        itemErp,
        itemKey,
        orderByName: userMap.get(order.orderBy || "") || "",
        canceledQty,
        invoicedQty,
        pendingQty,
        orderAmount,
      };
    });
  }, [canceledQtyByOrderId, companyMap, firmMap, invoicedQtyByOrderId, itemMap, orders, userMap]);

  // Search text of each row from the table's visible columns: built only while
  // something is typed, once per row list.
  const isSearching = searchWords(searchTerm).length > 0;
  const searchTextByRow = useMemo(() => (isSearching ? new Map(rows.map((row) => [row, rowSearchText([
    row.order.orderNo,
    formatDate(row.order.orderDate),
    row.firmName,
    row.companyName,
    row.order.erpCode,
    row.itemName,
    row.order.poNumber,
    toNumber(row.order.qty),
    toNumber(row.order.rate),
    row.orderAmount,
    row.invoicedQty,
    row.canceledQty,
    row.pendingQty,
    row.orderByName,
  ])])) : new Map<OrderMasterRow, string>()), [rows, isSearching]);
  const searchWordsList = useMemo(() => searchWords(searchTerm), [searchTerm]);
  const matchesSearch = (row: OrderMasterRow) => matchesTableSearch(searchTextByRow.get(row) || "", searchWordsList);

  const filteredRows = useMemo(() => {
    return rows
      .filter((row) => {
        if (companyFilter && row.companyName !== companyFilter) return false;
        if (firmFilter && String(row.order.firmId || "") !== firmFilter) return false;
        if (itemFilter && row.itemKey !== itemFilter) return false;
        if (orderByFilter && row.orderByName !== orderByFilter) return false;
        if ((dateFrom || dateTo) && !isWithinDateRange(row.order.orderDate, dateFrom, dateTo)) return false;

        return matchesSearch(row);
      })
      .sort((left, right) => {
        const serialDiff = parseOrderSerial(left.order.orderNo) - parseOrderSerial(right.order.orderNo);
        if (serialDiff !== 0) {
          return -serialDiff;
        }

        const orderNoCompare = String(left.order.orderNo || "").localeCompare(String(right.order.orderNo || ""));
        return -orderNoCompare;
      });
  }, [companyFilter, dateFrom, dateTo, firmFilter, itemFilter, orderByFilter, rows, searchTextByRow, searchWordsList]);

  const { sorted: sortedRows, sort, toggle: toggleSort } = useTableSort(filteredRows, (row, key) => {
    switch (key) {
      // Order No keeps its serial-number ordering.
      case "orderNo": return parseOrderSerial(row.order.orderNo);
      case "orderDate": return row.order.orderDate;
      case "firm": return row.firmName;
      case "company": return row.companyName;
      case "erp": return row.order.erpCode;
      case "item": return row.itemName;
      case "poNumber": return row.order.poNumber;
      case "qty": return toNumber(row.order.qty);
      case "rate": return toNumber(row.order.rate);
      case "orderAmount": return row.orderAmount;
      case "invoicedQty": return row.invoicedQty;
      case "canceledQty": return row.canceledQty;
      case "pendingQty": return row.pendingQty;
      case "orderBy": return row.orderByName;
      default: return "";
    }
  });

  const firmOptions = useMemo(() => firms.map((firm) => ({ value: firm.id, label: getFirmDisplayName(firm) })).sort((a, b) => a.label.localeCompare(b.label)), [firms]);

  const availableCompanies = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((row) => {
      if (itemFilter && row.itemKey !== itemFilter) return;
      if (orderByFilter && row.orderByName !== orderByFilter) return;
      if ((dateFrom || dateTo) && !isWithinDateRange(row.order.orderDate, dateFrom, dateTo)) return;
      if (!matchesSearch(row)) return;
      if (row.companyName) set.add(row.companyName);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows, itemFilter, orderByFilter, dateFrom, dateTo, searchTextByRow, searchWordsList]);

  const availableItems = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((row) => {
      if (companyFilter && row.companyName !== companyFilter) return;
      if (orderByFilter && row.orderByName !== orderByFilter) return;
      if ((dateFrom || dateTo) && !isWithinDateRange(row.order.orderDate, dateFrom, dateTo)) return;
      if (!matchesSearch(row)) return;
      if (row.itemKey) set.add(row.itemKey);
    });
    return Array.from(set)
      .map((key) => {
        const [name = "", erp = ""] = key.split("::");
        const label = !name ? erp : !erp || name.toLowerCase().includes(erp.toLowerCase()) ? name : `${name} - ${erp}`;
        return { value: key, label, searchText: `${name} ${erp}` };
      })
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [rows, companyFilter, orderByFilter, dateFrom, dateTo, searchTextByRow, searchWordsList]);

  const availableUsers = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((row) => {
      if (companyFilter && row.companyName !== companyFilter) return;
      if (itemFilter && row.itemKey !== itemFilter) return;
      if ((dateFrom || dateTo) && !isWithinDateRange(row.order.orderDate, dateFrom, dateTo)) return;
      if (!matchesSearch(row)) return;
      if (row.orderByName) set.add(row.orderByName);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows, companyFilter, itemFilter, dateFrom, dateTo, searchTextByRow, searchWordsList]);

  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalItems,
    paginatedItems: paginatedRows,
  } = useClientPagination(sortedRows, 25);

  const summary = useMemo(() => {
    return {
      totalOrders: filteredRows.length,
      orderValue: filteredRows.reduce((sum, row) => sum + toNumber(row.orderAmount), 0),
      pendingQuantity: filteredRows.reduce((sum, row) => sum + toNumber(row.pendingQty), 0),
      pendingValue: filteredRows.reduce((sum, row) => sum + toNumber(row.pendingQty) * toNumber(row.order.rate), 0),
    };
  }, [filteredRows]);

  const hasActiveFilters = Boolean(searchTerm.trim() || firmFilter || companyFilter || itemFilter || orderByFilter || dateFrom || dateTo);
  const clearAllFilters = () => {
    setFirmFilter("");
    setCompanyFilter("");
    setItemFilter("");
    setOrderByFilter("");
    setDateFrom("");
    setDateTo("");
    setSearchTerm("");
  };
  const compactSelectStyles = {
    control: (provided: any) => ({ ...provided, minHeight: 34, height: 34, borderWidth: 2, borderColor: "#000", fontSize: 12, fontWeight: 600 }),
    valueContainer: (provided: any) => ({ ...provided, padding: "0 6px" }),
    indicatorsContainer: (provided: any) => ({ ...provided, height: 30 }),
    dropdownIndicator: (provided: any) => ({ ...provided, padding: 4 }),
    clearIndicator: (provided: any) => ({ ...provided, padding: 4 }),
    menu: (provided: any) => ({ ...provided, zIndex: 9999, fontSize: 12 }),
    menuPortal: (provided: any) => ({ ...provided, zIndex: 9999 }),
  };
  const menuPortalTarget = typeof document !== "undefined" ? document.body : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">Orders Master</h2>
        <button
          onClick={() => navigate("/orders/form")}
          className="flex items-center gap-2 rounded bg-indigo-600 px-3 py-2 text-sm font-bold whitespace-nowrap text-white shadow transition hover:bg-indigo-700"
        >
          <Plus size={18} /> New Order
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border-2 border-black bg-indigo-50 p-3 text-indigo-900">
          <div className="text-[11px] font-black uppercase">Orders</div>
          <div className="text-xl font-black tabular-nums">{summary.totalOrders}</div>
        </div>
        <div className="rounded-lg border-2 border-black bg-emerald-50 p-3 text-emerald-900">
          <div className="text-[11px] font-black uppercase">Order Value</div>
          <div className="text-xl font-black tabular-nums">{formatAmount(summary.orderValue)}</div>
        </div>
        <div className="rounded-lg border-2 border-black bg-rose-50 p-3 text-rose-900">
          <div className="text-[11px] font-black uppercase">Pending Order Quantity</div>
          <div className="text-xl font-black tabular-nums">{formatAmount(summary.pendingQuantity)}</div>
        </div>
        <div className="rounded-lg border-2 border-black bg-purple-50 p-3 text-purple-900">
          <div className="text-[11px] font-black uppercase">Pending Order Value</div>
          <div className="text-xl font-black tabular-nums">{formatAmount(summary.pendingValue)}</div>
        </div>
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
            <Select options={firmOptions} value={firmFilter ? { value: firmFilter, label: firmOptions.find((f) => f.value === firmFilter)?.label || firmFilter } : null} onChange={(option) => setFirmFilter(option?.value || "")} placeholder="All" isClearable
              menuPortalTarget={menuPortalTarget} menuPosition="fixed" styles={compactSelectStyles} />
          </div>
          <div className="min-w-0">
            <span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Company</span>
            <Select
              options={availableCompanies.map((c) => ({ value: c, label: c }))}
              value={companyFilter ? { value: companyFilter, label: companyFilter } : null}
              onChange={(opt) => setCompanyFilter(opt ? (opt as any).value : "")}
              isClearable
              placeholder="All"
              menuPlacement="bottom"
              menuPortalTarget={menuPortalTarget}
              menuPosition="fixed"
              styles={compactSelectStyles}
            />
          </div>
          <div className="col-span-2 min-w-0 md:col-span-1">
            <span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Item</span>
            <Select
              options={availableItems}
              value={availableItems.find((option) => option.value === itemFilter) || null}
              onChange={(opt) => setItemFilter(opt ? (opt as any).value : "")}
              isClearable
              placeholder="All"
              menuPlacement="bottom"
              menuPortalTarget={menuPortalTarget}
              menuPosition="fixed"
              styles={compactSelectStyles}
            />
          </div>
          <div className="min-w-0">
            <span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Order By</span>
            <Select
              options={availableUsers.map((u) => ({ value: u, label: u }))}
              value={orderByFilter ? { value: orderByFilter, label: orderByFilter } : null}
              onChange={(opt) => setOrderByFilter(opt ? (opt as any).value : "")}
              isClearable
              placeholder="All"
              menuPlacement="bottom"
              menuPortalTarget={menuPortalTarget}
              menuPosition="fixed"
              styles={compactSelectStyles}
            />
          </div>
          <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Order From Date</span><input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
          <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Order To Date</span><input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
        </div>
        <div data-mf-actions="true" className="flex justify-end gap-2">
          {hasActiveFilters ? (
            <button type="button" onClick={clearAllFilters} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button>
          ) : null}
          <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-black bg-white">
        <table className="min-w-full border-collapse border border-black text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="border border-black px-3 py-2"><SortHeader label="Order No" sortKey="orderNo" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="border border-black px-3 py-2"><SortHeader label="Order Date" sortKey="orderDate" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="border border-black px-3 py-2"><SortHeader label="Firm Name" sortKey="firm" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="border border-black px-3 py-2"><SortHeader label="Company" sortKey="company" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="border border-black px-3 py-2"><SortHeader label="ERP" sortKey="erp" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="border border-black px-3 py-2"><SortHeader label="Item" sortKey="item" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="border border-black px-3 py-2"><SortHeader label="PO Number" sortKey="poNumber" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="border border-black px-3 py-2"><SortHeader label="Qty" sortKey="qty" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="border border-black px-3 py-2"><SortHeader label="Rate" sortKey="rate" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="border border-black px-3 py-2"><SortHeader label="Order Amount" sortKey="orderAmount" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="border border-black px-3 py-2"><SortHeader label="Invoiced Qty" sortKey="invoicedQty" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="border border-black px-3 py-2"><SortHeader label="Canceled Qty" sortKey="canceledQty" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="border border-black px-3 py-2"><SortHeader label="Pending Order Qty" sortKey="pendingQty" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="border border-black px-3 py-2"><SortHeader label="Order By" sortKey="orderBy" sort={sort} onToggle={toggleSort} align="center" /></th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.length === 0 ? (
              <tr><td colSpan={14} className="h-16" aria-label="No records" /></tr>
            ) : (
              paginatedRows.map((row) => (
                <tr key={row.order.id} className="align-top">
                  <td className="border border-black px-3 py-2 font-semibold">{row.order.orderNo}</td>
                  <td className="border border-black px-3 py-2 whitespace-nowrap">{formatDate(row.order.orderDate)}</td>
                  <td className="border border-black px-3 py-2 whitespace-normal break-words font-semibold">{row.firmName}</td>
                  <td className="border border-black px-3 py-2 whitespace-normal break-words">{row.companyName}</td>
                  <td className="border border-black px-3 py-2">{row.order.erpCode}</td>
                  <td className="border border-black px-3 py-2 whitespace-normal break-words">{row.itemName}</td>
                  <td className="border border-black px-3 py-2">{row.order.poNumber}</td>
                  <td className="border border-black px-3 py-2 text-right">{formatAmount(toNumber(row.order.qty))}</td>
                  <td className="border border-black px-3 py-2 text-right">{formatAmount(toNumber(row.order.rate))}</td>
                  <td className="border border-black px-3 py-2 text-right">{formatAmount(row.orderAmount)}</td>
                  <td className="border border-black px-3 py-2 text-right">{formatAmount(row.invoicedQty)}</td>
                  <td className="border border-black px-3 py-2 text-right">{formatAmount(row.canceledQty)}</td>
                  <td className="border border-black px-3 py-2 text-right">{formatAmount(row.pendingQty)}</td>
                  <td className="border border-black px-3 py-2">{row.orderByName}</td>
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
      />
    </div>
  );
}
