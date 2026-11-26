import React, { useState, useMemo, useEffect } from "react";
import { useData } from "../hooks/useData";
import { useAuth } from "../auth/AuthContext";
import { Firm, Order, OrderSchedule } from "../types";
import { Trash2, Search, Plus, X } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDate } from "../lib/utils";
import { Spinner } from "../components/Spinner";

import { Select } from "../components/Select";
import { ClientPagination } from "../components/ClientPagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { getFirmDisplayName } from "../lib/firmDisplay";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";
import { ORDER_APPROVAL_COLUMN_COUNT, OrderApprovalCells, OrderApprovalHeaders } from "../components/OrderApprovalColumns";

// Order rate with 2 decimals; blank when there is no rate. (Module level: used by the search filter above the exports.)
const formatRate = (value: unknown) => (value === null || value === undefined || value === "" ? "" : Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export function OrdersPendingScheduling() {
  const [searchTerm, setSearchTerm] = useState('');
  const [firmFilter, setFirmFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [scheduledFilter, setScheduledFilter] = useState<"" | "never" | "partly">('');
  const [groupByCompany, setGroupByCompany] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const { user } = useAuth();
  const canCancel = user?.role === "Admin";

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
  const totalCancelled = (orderId: string) => rowsFor(orderId).reduce((sum, r) => sum + (Number((r as any).canceledQty) || 0), 0);

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
        // Order Qty = Scheduled (net of cancels) + Cancelled + Pending Scheduling.
        const grossScheduled = totalScheduled(order.id);
        const cancelledQty = totalCancelled(order.id);
        const scheduledQty = Math.max(0, grossScheduled - cancelledQty);
        const pendingQty = Number(order.qty || 0) - grossScheduled;
        return { order, item, firmName, companyName, scheduledQty, cancelledQty, pendingQty };
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
      .filter(({ scheduledQty }) => !scheduledFilter || (scheduledFilter === "never" ? scheduledQty <= 0 : scheduledQty > 0))
      .filter(({ order, item, firmName, companyName, pendingQty, scheduledQty }) => matchesTableSearch([
        order.orderNo,
        order.poNumber,
        formatRate(order.rate),
        formatDate(order.orderDate),
        firmName,
        companyName,
        item?.name,
        String((item as any)?.erp || order.erpCode || ""),
        formatQty(order.qty),
        formatQty(scheduledQty),
        formatQty(pendingQty),
        item?.uom,
      ], words))
      .sort((a, b) => {
        const aNo = a.order.orderNo || "";
        const bNo = b.order.orderNo || "";
        const cmp = aNo.localeCompare(bNo, undefined, { numeric: true, sensitivity: "base" });
        return -cmp;
      });
  }, [companyFilter, firmFilter, itemFilter, pendingBase, scheduledFilter, searchTerm]);

  const { sorted: sortedPending, sort, toggle: toggleSort } = useTableSort(pending, (row, key) => {
    switch (key) {
      case "orderNo": return row.order.orderNo;
      case "poNumber": return row.order.poNumber;
      case "rate": return Number(row.order.rate || 0);
      case "orderDate": return row.order.orderDate;
      case "firm": return row.firmName;
      case "company": return row.companyName;
      case "item": return row.item?.name;
      case "erp": return String((row.item as any)?.erp || row.order.erpCode || "");
      case "qty": return Number(row.order.qty || 0);
      case "scheduled": return row.scheduledQty;
      case "cancelled": return row.cancelledQty;
      case "pending": return row.pendingQty;
      case "uom": return row.item?.uom;
      default: return "";
    }
  }, [], { key: "orderDate", direction: "desc" });

  // Group by Company: companies A-Z, rows inside each company keep the chosen sort.
  const displayRows = useMemo(() => {
    if (!groupByCompany) return sortedPending;
    return sortedPending
      .map((row, index) => ({ row, index }))
      .sort((a, b) => String(a.row.companyName || "").localeCompare(String(b.row.companyName || "")) || a.index - b.index)
      .map(({ row }) => row);
  }, [groupByCompany, sortedPending]);
  const companyTotals = useMemo(() => {
    const totals = new Map<string, { orders: number; pending: number }>();
    sortedPending.forEach((row) => {
      const key = String(row.companyName || "");
      const current = totals.get(key) || { orders: 0, pending: 0 };
      totals.set(key, { orders: current.orders + 1, pending: current.pending + row.pendingQty });
    });
    return totals;
  }, [sortedPending]);

  const exportHeaders = ["S.No", "Order No", "PO Number", "Order Rate", "Order Date", "Firm", "Company", "Item", "ERP", "Order Qty", "Scheduled Qty", "Cancelled Qty", "Pending Scheduling", "Unit", "Approved By", "Approval Reason"];
  const exportRows = () => sortedPending.map(({ order, item, firmName, companyName, scheduledQty, cancelledQty, pendingQty }, index) => [
    index + 1,
    order.orderNo || "",
    String(order.poNumber || ""),
    order.rate === null || order.rate === undefined || order.rate === "" as any ? "" : Number(order.rate),
    formatDate(order.orderDate),
    firmName,
    companyName,
    item?.name || "",
    String((item as any)?.erp || order.erpCode || ""),
    Number(order.qty || 0),
    scheduledQty,
    cancelledQty,
    pendingQty,
    item?.uom || "",
    String(order.approvedEmail || ""),
    String(order.approvalReason || ""),
  ]);
  const exportTotals = () => sortedPending.reduce(
    (sum, row) => ({ qty: sum.qty + Number(row.order.qty || 0), scheduled: sum.scheduled + row.scheduledQty, cancelled: sum.cancelled + row.cancelledQty, pending: sum.pending + row.pendingQty }),
    { qty: 0, scheduled: 0, cancelled: 0, pending: 0 },
  );
  const exportFileDate = new Date().toISOString().slice(0, 10);

  const handleExportExcel = async () => {
    if (!sortedPending.length) return;
    const XLSX = await import("xlsx-js-style");
    const totals = exportTotals();
    const lastCol = exportHeaders.length - 1;
    const aoa: (string | number)[][] = [
      ["Pending Scheduling"],
      [`Date: ${formatDate(exportFileDate)}`],
      exportHeaders,
      ...exportRows(),
      ["TOTAL", "", "", "", "", "", "", "", "", totals.qty, totals.scheduled, totals.cancelled, totals.pending, "", "", ""],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } }, { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } }];
    ws["!cols"] = exportHeaders.map((h) => ({ wch: h === "Item" ? 40 : h === "Company" ? 30 : h === "Approval Reason" ? 30 : h === "Approved By" ? 24 : Math.max(8, h.length + 2) }));
    const border = { style: "thin", color: { rgb: "000000" } };
    const style = (bold: boolean) => ({ font: { name: "Arial", sz: 9, bold }, border: { top: border, bottom: border, left: border, right: border }, alignment: { vertical: "center", wrapText: true } });
    const setStyle = (r: number, c: number, value: any) => {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) ws[ref] = { t: "s", v: "" };
      ws[ref].s = value;
    };
    setStyle(0, 0, { font: { name: "Arial", sz: 14, bold: true }, alignment: { horizontal: "center" } });
    setStyle(1, 0, { font: { name: "Arial", sz: 10, bold: true }, alignment: { horizontal: "center" } });
    const lastRow = aoa.length - 1;
    for (let r = 2; r <= lastRow; r += 1) {
      for (let c = 0; c <= lastCol; c += 1) setStyle(r, c, style(r === 2 || r === lastRow));
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pending Scheduling");
    XLSX.writeFile(wb, `Pending_Scheduling_${exportFileDate}.xlsx`);
  };

  const handleExportPDF = () => {
    if (!sortedPending.length) return;
    const totals = exportTotals();
    const doc = new jsPDF("landscape", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Pending Scheduling", pageWidth / 2, 12, { align: "center" });
    doc.setFontSize(8);
    doc.text(`Date: ${formatDate(exportFileDate)}   ·   ${sortedPending.length} ${sortedPending.length === 1 ? "order" : "orders"}`, pageWidth / 2, 18, { align: "center" });
    const qty = (value: number) => formatQty(value);
    autoTable(doc, {
      head: [exportHeaders.slice(0, 14)],
      body: exportRows().map((row) => [...row.slice(0, 3), formatRate(row[3]), ...row.slice(4, 9), qty(row[9] as number), qty(row[10] as number), qty(row[11] as number), qty(row[12] as number), row[13]].map(String)),
      foot: [[{ content: "TOTAL", colSpan: 9, styles: { halign: "right" } }, { content: qty(totals.qty), styles: { halign: "right" } }, { content: qty(totals.scheduled), styles: { halign: "right" } }, { content: qty(totals.cancelled), styles: { halign: "right" } }, { content: qty(totals.pending), styles: { halign: "right" } }, ""]],
      startY: 22,
      margin: { left: 8, right: 8 },
      theme: "grid",
      showFoot: "lastPage",
      styles: { font: "helvetica", fontSize: 7, cellPadding: 1, valign: "middle", textColor: 0, lineColor: 0, lineWidth: 0.15, overflow: "linebreak" },
      headStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: "bold", halign: "center" },
      footStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 8, halign: "right" },
        1: { cellWidth: 24 },
        2: { cellWidth: 20 },
        3: { cellWidth: 13, halign: "right" },
        4: { cellWidth: 16 },
        5: { cellWidth: 13 },
        6: { cellWidth: 40 },
        7: { cellWidth: 50 },
        8: { cellWidth: 15 },
        9: { halign: "right" },
        10: { halign: "right" },
        11: { halign: "right" },
        12: { halign: "right", fontStyle: "bold" },
        13: { cellWidth: 10, halign: "center" },
      },
    });
    doc.save(`Pending_Scheduling_${exportFileDate}.pdf`);
  };

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

  const filtersActive = Boolean(searchTerm.trim() || firmFilter || companyFilter || itemFilter || scheduledFilter);
  const clearFilters = () => {
    setSearchTerm(""); setFirmFilter(""); setCompanyFilter(""); setItemFilter(""); setScheduledFilter("");
  };

  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalItems,
    paginatedItems: paginatedPending,
  } = useClientPagination(displayRows, 25);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, firmFilter, companyFilter, itemFilter, scheduledFilter, setPage]);

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

  // Admin: cancel part (or all) of the qty still to be scheduled. Never cancels the order
  // itself: the qty is recorded as a schedule line that is fully cancelled, so Orders Master
  // shows it under Cancelled Qty and the other schedule views count it as zero.
  const [cancelModal, setCancelModal] = useState<null | { orderId: string; qty: string; remarks: string; error?: string }>(null);
  const saveCancelQty = async () => {
    if (!cancelModal) return;
    const order = orders.find((entry) => entry.id === cancelModal.orderId);
    if (!order) return setCancelModal(null);
    const balance = Number(order.qty || 0) - totalScheduled(order.id);
    const qty = Number(cancelModal.qty);
    if (!Number.isFinite(qty) || qty <= 0) return setCancelModal({ ...cancelModal, error: "Enter the quantity to cancel." });
    if (qty > balance + 1e-9) return setCancelModal({ ...cancelModal, error: `Cannot cancel more than the ${formatQty(balance)} still to be scheduled.` });
    if (!cancelModal.remarks.trim()) return setCancelModal({ ...cancelModal, error: "Cancel remarks are required." });
    setCancellingId(order.id);
    try {
      const timestamp = new Date().toISOString();
      const who = String(user?.name || user?.email || "System User");
      await setSchedules((prev) => [...prev, {
        id: crypto.randomUUID(), orderId: order.id, firmId: order.firmId || "", firmName: getFirmName(order), scheduledDate: today,
        qty, producedQty: 0, canceledQty: qty, updatedBy: who, updateTimestamp: timestamp,
      } as any]);
      const fullyCovered = qty >= balance - 1e-9;
      await setOrders((prev) => prev.map((entry) => entry.id === order.id ? {
        ...entry,
        status: fullyCovered ? "Scheduled" : entry.status,
        remarks: [entry.remarks?.trim(), `Cancelled ${formatQty(qty)} (not scheduled) on ${formatDate(today)} by ${who}: ${cancelModal.remarks.trim()}`].filter(Boolean).join(" | "),
        updatedBy: who,
        updateTimestamp: timestamp,
      } : entry));
      setCancelModal(null);
    } catch (error) {
      console.error("Cancel qty error:", error);
      setCancelModal({ ...cancelModal, error: "Could not save. Please try again." });
    } finally {
      setCancellingId(null);
    }
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
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Scheduled</span><Select compact value={scheduledFilter} onChange={(value) => setScheduledFilter((value as "" | "never" | "partly") || "")} options={[{ value: "", label: "All" }, { value: "never", label: "Never Scheduled" }, { value: "partly", label: "Partly Scheduled" }]} placeholder="All" /></div>
          {/* Downloads cover every row that matches the search and filters, in the table's order. */}
          <div className="flex items-end gap-2">
            <label className="flex h-[34px] cursor-pointer items-center gap-2 whitespace-nowrap rounded border-2 border-black bg-white px-3 text-xs font-bold"><input type="checkbox" checked={groupByCompany} onChange={(event) => setGroupByCompany(event.target.checked)} /> Group by Company</label>
            <button type="button" onClick={handleExportExcel} disabled={sortedPending.length === 0} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold disabled:opacity-40">Excel</button>
            <button type="button" onClick={handleExportPDF} disabled={sortedPending.length === 0} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold disabled:opacity-40">PDF</button>
          </div>
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
                <th className="px-2 py-1.5 border border-black"><SortHeader label="Order No" sortKey="orderNo" sort={sort} onToggle={toggleSort} align="center" /></th>
                <th className="px-2 py-1.5 border border-black"><SortHeader label="PO Number" sortKey="poNumber" sort={sort} onToggle={toggleSort} align="center" /></th>
                <th className="px-2 py-1.5 border border-black text-right"><SortHeader label="Order Rate" sortKey="rate" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-2 py-1.5 border border-black"><SortHeader label="Order Date" sortKey="orderDate" sort={sort} onToggle={toggleSort} align="center" /></th>
                <th className="px-2 py-1.5 border border-black"><SortHeader label="Firm" sortKey="firm" sort={sort} onToggle={toggleSort} align="center" /></th>
                <th className="px-2 py-1.5 border border-black"><SortHeader label="Company" sortKey="company" sort={sort} onToggle={toggleSort} align="center" /></th>
                <th className="px-2 py-1.5 border border-black"><SortHeader label="Item" sortKey="item" sort={sort} onToggle={toggleSort} align="center" /></th>
                <th className="px-2 py-1.5 border border-black"><SortHeader label="ERP" sortKey="erp" sort={sort} onToggle={toggleSort} align="center" /></th>
                <th className="px-2 py-1.5 border border-black text-right"><SortHeader label="Order Quantity" sortKey="qty" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-2 py-1.5 border border-black text-right"><SortHeader label="Scheduled Qty" sortKey="scheduled" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-2 py-1.5 border border-black text-right"><SortHeader label="Cancelled Qty" sortKey="cancelled" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-2 py-1.5 border border-black text-right"><SortHeader label="Pending Scheduling" sortKey="pending" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-2 py-1.5 border border-black"><SortHeader label="Unit" sortKey="uom" sort={sort} onToggle={toggleSort} align="center" /></th>
                <th className="px-2 py-1.5 border border-black">Actions</th>
                <OrderApprovalHeaders thClassName="px-2 py-1.5 border border-black text-xs font-bold" />
              </tr>
            </thead>
            <tbody>
              {paginatedPending.length === 0 ? (
                <tr><td colSpan={15 + ORDER_APPROVAL_COLUMN_COUNT} className="h-16" aria-label="No records" /></tr>
              ) : paginatedPending.map(({ order: o, item, firmName, companyName, scheduledQty: sched, cancelledQty: cancelledSched, pendingQty: pendingSched }, idx) => {
                const showGroup = groupByCompany && (idx === 0 || String(paginatedPending[idx - 1].companyName || "") !== String(companyName || ""));
                const group = companyTotals.get(String(companyName || ""));
                return (
                  <React.Fragment key={o.id}>
                  {showGroup ? (
                    <tr className="bg-indigo-50">
                      <td colSpan={15 + ORDER_APPROVAL_COLUMN_COUNT} className="border border-black px-3 py-1.5 text-sm font-black text-indigo-900">
                        {companyName || "No company"} <span className="ml-3 text-xs font-bold text-slate-600">{group?.orders || 0} {group?.orders === 1 ? "order" : "orders"} · Pending Scheduling {formatQty(group?.pending || 0)}</span>
                      </td>
                    </tr>
                  ) : null}
                  <tr className="hover:bg-slate-50">
                    <td className="px-2 py-1.5 border border-black text-right tabular-nums">{(page - 1) * pageSize + idx + 1}</td>
                    <td className="px-2 py-1.5 border border-black">{o.orderNo}</td>
                    <td className="px-2 py-1.5 border border-black">{o.poNumber || "-"}</td>
                    <td className="px-2 py-1.5 border border-black text-right tabular-nums">{formatRate(o.rate) || "-"}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 border border-black">{o.orderDate ? formatDate(o.orderDate) : "-"}</td>
                    <td className="px-2 py-1.5 border border-black font-semibold">{firmName}</td>
                    <td className="px-2 py-1.5 border border-black">{companyName || "-"}</td>
                    <td className="px-2 py-1.5 border border-black">{item?.name || "-"}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 border border-black">{String((item as any)?.erp || o.erpCode || "") || "-"}</td>
                    <td className="px-2 py-1.5 border border-black text-right tabular-nums">{formatQty(o.qty)}</td>
                    <td className="px-2 py-1.5 border border-black text-right tabular-nums">{formatQty(sched)}</td>
                    <td className="px-2 py-1.5 border border-black text-right tabular-nums text-red-700">{cancelledSched ? formatQty(cancelledSched) : "-"}</td>
                    <td className="px-2 py-1.5 border border-black text-right tabular-nums font-bold text-indigo-700">{formatQty(pendingSched)}</td>
                    <td className="px-2 py-1.5 border border-black">{item?.uom || "-"}</td>
                    <td className="px-2 py-1.5 border border-black text-center"><div className="flex items-center justify-center gap-1"><button onClick={() => { setModalOrderId(o.id); setModalOpen(true); }} className="bg-indigo-600 text-white px-3 py-1 rounded">Schedule</button>{canCancel ? <button type="button" disabled={cancellingId === o.id} onClick={() => setCancelModal({ orderId: o.id, qty: "", remarks: "" })} title="Cancel a quantity not yet scheduled" className="whitespace-nowrap rounded border-2 border-red-700 bg-white px-2 py-0.5 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">{cancellingId === o.id ? "…" : "Cancel Qty"}</button> : null}</div></td>
                    <OrderApprovalCells order={o} tdClassName="px-2 py-1.5 border border-black" />
                  </tr>
                  </React.Fragment>
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
        {modalOpen && modalOrderId && (() => {
          const modalOrder = orders.find((o) => o.id === modalOrderId);
          const totalOrderQty = Number(modalOrder?.qty ?? 0);
          const scheduledQty = displayedTotalScheduled(modalOrderId);
          const yetTo = totalOrderQty - scheduledQty;
          const closeModal = () => { setModalOpen(false); setModalOrderId(null); };
          return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
            <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-xl border-2 border-black bg-white shadow-2xl sm:rounded-xl">
              <div className="flex shrink-0 items-center justify-between gap-3 border-b-2 border-black px-4 py-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Schedule Order</div>
                  <div className="truncate text-base font-black text-black">{modalOrder?.orderNo || "-"}</div>
                </div>
                <button type="button" onClick={closeModal} aria-label="Close" title="Close" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border-2 border-black bg-white text-black hover:bg-slate-100">
                  <X size={18} />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border-2 border-black bg-indigo-50 p-2 text-indigo-900">
                    <div className="text-[10px] font-black uppercase leading-tight">Order Qty</div>
                    <div className="text-lg font-black tabular-nums">{formatQty(totalOrderQty)}</div>
                  </div>
                  <div className="rounded-lg border-2 border-black bg-emerald-50 p-2 text-emerald-900">
                    <div className="text-[10px] font-black uppercase leading-tight">Scheduled</div>
                    <div className="text-lg font-black tabular-nums">{formatQty(scheduledQty)}</div>
                  </div>
                  <div className={`rounded-lg border-2 border-black p-2 ${yetTo < 0 ? "bg-red-100 text-red-800" : "bg-amber-50 text-amber-900"}`}>
                    <div className="text-[10px] font-black uppercase leading-tight">Yet To Schedule</div>
                    <div className="text-lg font-black tabular-nums">{formatQty(yetTo)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)_36px] items-center gap-2 border-b border-black pb-1 text-[10px] font-black uppercase text-slate-600">
                  <span>#</span><span>Date</span><span>Quantity</span><span />
                </div>
                <div className="space-y-2">
                  {modalRows.map((r, idx) => (
                    <div key={r.id} className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)_36px] items-center gap-2">
                      <span className="text-sm font-black text-slate-500">{idx + 1}</span>
                      <input type="date" min={today} value={r.scheduledDate} onChange={(e) => handleChangeRow(r.id, 'scheduledDate', e.target.value)} aria-label="Scheduled date" className="h-10 w-full min-w-0 rounded border-2 border-black px-2 text-sm font-semibold" />
                      <input type="number" min={0} step="any" inputMode="decimal" value={(r as any).qty ?? ''} onChange={(e) => handleChangeRow(r.id, 'qty', e.target.value)} aria-label="Scheduled quantity" className="h-10 w-full min-w-0 rounded border-2 border-black px-2 text-right text-sm font-bold tabular-nums" />
                      <button type="button" onClick={() => handleDeleteRow(r.id)} aria-label="Delete schedule" title="Delete" className="inline-flex h-9 w-9 items-center justify-center rounded-md border-2 border-red-600 bg-white text-red-600 hover:bg-red-50">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => modalOrderId && handleAddRow(modalOrderId)}
                    disabled={yetTo <= 0}
                    title="Add schedule row"
                    aria-label="Add schedule row"
                    className="indent-line-action inline-flex h-10 w-10 items-center justify-center rounded-md bg-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Plus size={18} />
                  </button>
                </div>
                {modalError && <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{modalError}</div>}
              </div>

              <div className="shrink-0 border-t-2 border-black bg-white px-4 py-3">
                <button
                  type="button"
                  onClick={async () => { const saved = await handleSave(modalOrderId!); if (saved) closeModal(); }}
                  disabled={saving}
                  className="inline-flex w-full items-center justify-center gap-2 rounded bg-black px-6 py-3 text-sm font-black uppercase tracking-widest text-white hover:bg-slate-800 disabled:opacity-40"
                >
                  {saving ? <Spinner size={16} className="text-white" /> : null}
                  <span>Save</span>
                </button>
              </div>
            </div>
          </div>
          );
        })()}
      </div>
      {cancelModal ? (() => {
        const order = orders.find((entry) => entry.id === cancelModal.orderId);
        const balance = order ? Number(order.qty || 0) - totalScheduled(order.id) : 0;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md space-y-3 rounded border-2 border-black bg-white p-4 shadow-xl">
              <div className="flex items-center justify-between border-b-2 border-black pb-2"><h3 className="font-black uppercase">Cancel Quantity</h3><button type="button" onClick={() => setCancelModal(null)} className="rounded border-2 border-black p-1"><X size={14} /></button></div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold">
                <div className="rounded border border-black p-2">Order Qty<div className="text-base font-black">{formatQty(order?.qty)}</div></div>
                <div className="rounded border border-black p-2">Scheduled<div className="text-base font-black">{formatQty(order ? Math.max(0, totalScheduled(order.id) - totalCancelled(order.id)) : 0)}</div></div>
                <div className="rounded border border-black p-2">Yet to Schedule<div className="text-base font-black text-indigo-700">{formatQty(balance)}</div></div>
              </div>
              <div className="text-sm font-semibold">{order?.orderNo} · {resolveOrderItem(order as Order)?.name || ""}</div>
              <label className="block text-xs font-black uppercase">Cancel Quantity<input type="number" min={0} max={balance} autoFocus className="mt-1 w-full rounded border-2 border-black bg-yellow-50 px-2 py-1.5 text-sm font-bold" value={cancelModal.qty} onChange={(event) => setCancelModal({ ...cancelModal, qty: event.target.value, error: "" })} placeholder={`Up to ${formatQty(balance)}`} /></label>
              <label className="block text-xs font-black uppercase">Cancel Remarks<textarea rows={2} className="mt-1 w-full rounded border-2 border-black bg-yellow-50 px-2 py-1.5 text-sm font-semibold normal-case" value={cancelModal.remarks} onChange={(event) => setCancelModal({ ...cancelModal, remarks: event.target.value, error: "" })} /></label>
              {cancelModal.error ? <div className="rounded border-2 border-red-700 bg-red-50 p-2 text-sm font-bold text-red-800">{cancelModal.error}</div> : null}
              <div className="flex justify-end gap-2 border-t-2 border-black pt-3"><button type="button" onClick={() => setCancelModal(null)} className="rounded border-2 border-black bg-white px-3 py-1.5 text-sm font-bold">Close</button><button type="button" disabled={cancellingId === cancelModal.orderId} onClick={saveCancelQty} className="rounded border-2 border-black bg-red-600 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-60">{cancellingId === cancelModal.orderId ? "Saving…" : "Cancel Quantity"}</button></div>
            </div>
          </div>
        );
      })() : null}
    </div>
  );
}
