import React, { useMemo, useState } from "react";
import { useConfirm } from "../components/ConfirmDialog";
import { useData } from "../hooks/useData";
import { 
  LoadingSlip, 
  LoadingSlipAllocation,
  Truck, 
  DispatchPlan,
  Order,
  Company,
  Firm,
  Invoice,
  InvoiceLineItem,
  Setting
} from "../types";
import { 
  Search, 
  FileText, 
  ChevronDown,
  ChevronRight,
  Download
} from "lucide-react";
import { Spinner } from "../components/Spinner";
import { Select } from "../components/Select";
import { formatDate } from "../lib/serial";
import { matchesTableSearch, rowSearchText, searchWords } from "../lib/tableSearch";
import { useNpdItemsWithoutStock } from "../hooks/useNpdItems";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { buildLinkedLoadingDetailsFromSlip } from "../lib/linkedLoading";
import { upsertFgLinkedChildSlip } from "../lib/linkedLoadingSlipSync";
import { downloadLoadingSlipPdf } from "../lib/loadingSlipPdf";
import { buildPhpPlateStockAlertMessage, getPhpPlateStockShortages } from "../lib/phpPlateStockValidation";
import { ClientPagination } from "../components/ClientPagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { SortHeader, useTableSort } from "../lib/tableSort";
import { useAuth } from "../auth/AuthContext";
import { canManageMasterRecords } from "../lib/masterPermissions";
import { isDirectLoadingSlip, resolveLoadingSlipLineContext, summarizeLoadingSlip } from "../lib/loadingSlipContext";
import { getJobLoadingSlipLimitError } from "../lib/loadingValidation";
import { getFirmDisplayNameById } from "../lib/firmDisplay";

function getSlipNoSortValue(slipNo: string) {
  const value = String(slipNo || "").trim();
  const match = value.match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : 0;
}

export function LoadingMaster() {
  const { user } = useAuth();
  const canManage = canManageMasterRecords(user?.role);
  const confirm = useConfirm();
  const [loadingSlips, setLoadingSlips] = useData<LoadingSlip>("loading_slips", [], { firmScope: "all", storageKey: "loading-slips-all-firms" });
  const [trucks] = useData<Truck>("trucks", []);
  const [plans, setPlans] = useData<DispatchPlan>("dispatch_plans", [], { firmScope: "all", storageKey: "dispatch-plans-all-firms" });
  const [orders] = useData<Order>("orders", [], { firmScope: "all", storageKey: "orders-all-firms" });
  const npdItems = useNpdItemsWithoutStock();
  const { resolveOrderItem, itemsBySource, allItems } = useOrderItemCatalog();
  const [companies] = useData<Company>("companies", [], { firmScope: "all", storageKey: "companies-all-firms" });
  const [firms] = useData<Firm>("firms", [], { firmScope: "all", storageKey: "firms-all" });
  const [invoices, setInvoices] = useData<Invoice>("invoices", [], { firmScope: "all", storageKey: "invoices-all-firms" });
  const [invoiceLineItems, setInvoiceLineItems] = useData<InvoiceLineItem>("invoice_line_items", [], { firmScope: "all", storageKey: "invoice-lines-all-firms" });
  const [phpJobs] = useData<any>("php_job_master", []);
  const [plateJobs] = useData<any>("plate_job_master", []);
  const [phpItemMaster] = useData<any>("php_item_master", []);
  const [plateItemMaster] = useData<any>("plate_item_master", []);
  const [phpLoadingSlips, setPhpLoadingSlips] = useData<LoadingSlip>("php_loading_slips", []);
  const [plateLoadingSlips, setPlateLoadingSlips] = useData<LoadingSlip>("plate_loading_slips", []);
  const [settings] = useData<Setting>("settings", []);

  const [searchTerm, setSearchTerm] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [erpFilter, setErpFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [firmFilter, setFirmFilter] = useState("");
  const [expandedSlipIds, setExpandedSlipIds] = useState<Set<string>>(new Set());
  const [editingSlipIds, setEditingSlipIds] = useState<Set<string>>(new Set());
  const [draftBySlipId, setDraftBySlipId] = useState<Record<string, LoadingSlip>>({});
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const getTruckNo = (slip: LoadingSlip) => String(slip.truckNo || trucks.find((truck) => truck.id === slip.truckId)?.truckNo || "-").trim() || "-";

  // Each slip's summary worked out once and shared by the filters and the list.
  const summaryBySlip = useMemo(() => {
    const map = new Map<LoadingSlip, ReturnType<typeof summarizeLoadingSlip>>();
    loadingSlips.forEach((slip) => map.set(slip, summarizeLoadingSlip({ slip, plans, orders, companies, resolveOrderItem })));
    return map;
  }, [loadingSlips, plans, orders, companies, resolveOrderItem]);
  const getSummary = (slip: LoadingSlip) => summaryBySlip.get(slip) || summarizeLoadingSlip({ slip, plans, orders, companies, resolveOrderItem });

  const companyOptions = useMemo(() => {
    const names = new Set<string>();
    loadingSlips.forEach((slip) => {
      getSummary(slip).companyNames.forEach((name) => {
        if (name) names.add(name);
      });
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })).map((name) => ({ value: name, label: name }));
  }, [loadingSlips, summaryBySlip]);

  const erpOptions = useMemo(() => {
    const codes = new Set<string>();
    loadingSlips.forEach((slip) => {
      getSummary(slip).erpCodes.forEach((code) => {
        if (code) codes.add(code);
      });
    });
    return Array.from(codes).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })).map((code) => ({ value: code, label: code }));
  }, [loadingSlips, summaryBySlip]);

  const itemOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; searchText: string }>();
    loadingSlips.forEach((slip) => {
      getSummary(slip).lineContexts.forEach((ctx) => {
        const itemName = String(ctx.itemName || "").trim();
        const erp = String(ctx.erpCode || "").trim();
        const key = itemName || erp ? `${itemName}::${erp}` : "";
        if (!key || map.has(key)) return;
        const label = !itemName ? erp : !erp || itemName.toLowerCase().includes(erp.toLowerCase()) ? itemName : `${itemName} - ${erp}`;
        map.set(key, { value: key, label, searchText: `${itemName} ${erp}` });
      });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [loadingSlips, summaryBySlip]);
  // Slip rows with their search text (visible columns: Slip No, Source, Status,
  // Date, Truck, Firm, Company, Item, ERP, Job No / Load Qty, Total Qty), built
  // once per data change.
  const slipRows = useMemo(() => {
    const orderById = new Map(orders.map((order) => [order.id, order]));
    const planById = new Map(plans.map((plan) => [plan.id, plan]));
    return loadingSlips.map((slip) => {
      const totalQty = slip.lines.reduce((sum, line) => sum + Number(line.loadedQty || 0), 0);
      const summary = getSummary(slip);
      const linkedPlan = slip.lines.map((line) => planById.get(String(line.dispatchPlanId || ""))).find(Boolean);
      const orderFirmId = linkedPlan ? String(orderById.get(linkedPlan.orderId)?.firmId || "").trim() : "";
      return {
        ...slip,
        totalQty,
        itemNames: summary.itemNames.join(", "),
        companyNames: summary.companyNames.join(", "),
        firmId: String(orderFirmId || slip.orderFirmId || slip.firmId || linkedPlan?.orderFirmId || linkedPlan?.firmId || ""),
        erpCodes: summary.erpCodes.join(", "),
        itemKeys: summary.lineContexts.map((ctx) => `${ctx.itemName || ""}::${ctx.erpCode || ""}`),
        loadingSourceLabel: isDirectLoadingSlip(slip) ? "Direct" : "Dispatch Plan",
        truckNo: getTruckNo(slip),
      };
    }).map((slip) => {
      const jobAllocations = slip.lines.flatMap((line) => line.allocations || []).filter((allocation) => allocation.sourceType === "job");
      const searchText = rowSearchText([
        slip.slipNo,
        slip.loadingSourceLabel,
        slip.status === "Cancelled" ? "Cancelled" : slip.invoiceId ? "Invoiced" : "Not Invoiced",
        formatDate(slip.date),
        slip.truckNo || "-",
        getFirmDisplayNameById(slip.firmId, firms),
        slip.companyNames,
        slip.itemNames,
        slip.erpCodes,
        isDirectLoadingSlip(slip) ? "Direct Loading" : jobAllocations.map((allocation) => [`Job No: ${allocation.jobNo || allocation.jobId || "-"}`, allocation.jobNo || allocation.jobId, Number(allocation.qty || 0)]),
        slip.totalQty,
      ]);
      const statusLabel = slip.status === "Cancelled" ? "Cancelled" : slip.invoiceId ? "Invoiced" : "Not Invoiced";
      const when = new Date(String(slip.date || ""));
      const day = isNaN(when.getTime()) ? "" : `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, "0")}-${String(when.getDate()).padStart(2, "0")}`;
      return { ...slip, searchText, statusLabel, day };
    });
  }, [loadingSlips, plans, orders, firms, summaryBySlip, trucks]);

  const processedSlips = useMemo(() => {
    const words = searchWords(searchTerm);
    return slipRows.filter(slip => {
      const matchesSearch = matchesTableSearch(slip.searchText, words);
      const matchesCompany = !companyFilter || slip.companyNames.includes(companyFilter);
      const matchesErp = !erpFilter || slip.erpCodes.includes(erpFilter);
      const matchesItem = !itemFilter || slip.itemKeys.includes(itemFilter);
      const matchesFirm = !firmFilter || slip.firmId === firmFilter;
      const matchesSource = !sourceFilter || slip.loadingSourceLabel === sourceFilter;
      const matchesStatus = !statusFilter || slip.statusLabel === statusFilter;
      const matchesFrom = !fromDate || (Boolean(slip.day) && slip.day >= fromDate);
      const matchesTo = !toDate || (Boolean(slip.day) && slip.day <= toDate);

      return matchesSearch && matchesCompany && matchesErp && matchesItem && matchesFirm && matchesSource && matchesStatus && matchesFrom && matchesTo;
    }).sort((a, b) => {
      const slipNoDiff = getSlipNoSortValue(b.slipNo) - getSlipNoSortValue(a.slipNo);
      if (slipNoDiff !== 0) return slipNoDiff;

      const textDiff = String(b.slipNo || "").localeCompare(String(a.slipNo || ""), undefined, {
        numeric: true,
        sensitivity: "base",
      });
      if (textDiff !== 0) return textDiff;

      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }, [slipRows, searchTerm, companyFilter, erpFilter, itemFilter, firmFilter, sourceFilter, statusFilter, fromDate, toDate]);

  const { sorted: sortedSlips, sort, toggle: toggleSort } = useTableSort(processedSlips, (slip, key) => {
    switch (key) {
      case "slipNo": return slip.slipNo || "";
      case "source": return slip.loadingSourceLabel;
      case "status": return slip.status === "Cancelled" ? "Cancelled" : slip.invoiceId ? "Invoiced" : "Not Invoiced";
      case "date": return slip.date || "";
      case "truckNo": return slip.truckNo || "";
      case "firmName": return getFirmDisplayNameById(slip.firmId, firms) || "";
      case "companyNames": return slip.companyNames;
      case "itemNames": return slip.itemNames;
      case "erpCodes": return slip.erpCodes;
      case "totalQty": return slip.totalQty;
      default: return "";
    }
  }, [firms]);

  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalItems,
    paginatedItems: paginatedSlips,
  } = useClientPagination(sortedSlips, 25);

  const handleDownloadPdf = async (slip: LoadingSlip) => {
    setIsDownloading(slip.id);
    try {
      const orgSetting = settings[0];
      await downloadLoadingSlipPdf({
        slip,
        setting: orgSetting,
        trucks,
        plans,
        orders,
        npdItems,
        companies
      });
    } catch (err) {
      console.error("Failed to download PDF:", err);
      alert("Failed to generate PDF. Please check console for details.");
    } finally {
      setIsDownloading(null);
    }
  };

  const getSlipLines = (slip: LoadingSlip) =>
    slip.lines.map((line) => {
      const context = resolveLoadingSlipLineContext({ slip, line, plans, orders, companies, resolveOrderItem });
      const plannedQty = Number(context.plan?.plannedQty || 0);
      const cancelledQty = Number(context.plan?.canceledQty || 0);
      const maxAllowed = context.isDirect ? Number.MAX_SAFE_INTEGER : Math.max(0, plannedQty - cancelledQty);
      return {
        ...line,
        ...context,
        plannedQty,
        maxAllowed,
      };
    });

  const toggleSlip = (id: string) => {
    setExpandedSlipIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startEdit = (slip: LoadingSlip) => {
    if (slip.status === "Cancelled") {
      alert("Cancelled slip cannot be edited.");
      return;
    }
    if (slip.invoiceId) {
      alert("Invoiced loading slips cannot be edited.");
      return;
    }
    setEditingSlipIds((prev) => new Set(prev).add(slip.id));
    setDraftBySlipId((prev) => ({ ...prev, [slip.id]: JSON.parse(JSON.stringify(slip)) }));
    setExpandedSlipIds((prev) => new Set(prev).add(slip.id));
  };

  const cancelEdit = (slipId: string) => {
    setEditingSlipIds((prev) => {
      const next = new Set(prev);
      next.delete(slipId);
      return next;
    });
    setDraftBySlipId((prev) => {
      const next = { ...prev };
      delete next[slipId];
      return next;
    });
  };

  const getAllocationTotal = (allocations?: LoadingSlipAllocation[]) =>
    (allocations || []).reduce((sum, a) => sum + Number(a.qty || 0), 0);

  const validateSlipDraft = (draft: LoadingSlip) => {
    const errors: string[] = [];
    const lines = getSlipLines(draft);
    const allocationLimitError = getJobLoadingSlipLimitError(lines.flatMap((line) => line.allocations || []), loadingSlips, draft.id);
    if (allocationLimitError) errors.push(allocationLimitError);
    lines.forEach((line, index) => {
      const loadedQty = Number(line.loadedQty || 0);
      if (loadedQty < 0) errors.push(`Line ${index + 1}: Loaded qty cannot be negative.`);
      if (!line.isDirect && loadedQty > line.maxAllowed) errors.push(`Line ${index + 1}: Loaded qty cannot exceed ${line.maxAllowed}.`);
      if (!line.isDirect) {
        const allocTotal = getAllocationTotal(line.allocations);
        if (Math.abs(allocTotal - loadedQty) > 0.0001) errors.push(`Line ${index + 1}: Allocations must equal Loaded qty.`);
        (line.allocations || []).forEach((a) => {
          if (Number(a.qty || 0) < 0) errors.push(`Line ${index + 1}: Allocation qty cannot be negative.`);
        });
      }
    });
    return errors;
  };

  const saveEdit = async (slipId: string) => {
    const original = loadingSlips.find((s) => s.id === slipId);
    const draft = draftBySlipId[slipId];
    if (!original || !draft) return;
    if (original.status === "Cancelled") {
      alert("Cancelled slip cannot be edited.");
      return;
    }

    const errors = validateSlipDraft(draft);
    if (errors.length > 0) {
      alert(errors[0]);
      return;
    }

    const now = new Date().toISOString();
    const direct = isDirectLoadingSlip(original);

    if (original.invoiceId && !direct) {
      const invoice = invoices.find((inv) => inv.id === original.invoiceId);
      if (!invoice) {
        alert("Linked invoice not found. Cannot save changes.");
        return;
      }
    }

    const originalByPlan = new Map(original.lines.map((l) => [l.dispatchPlanId, Number(l.loadedQty || 0)]));
    const draftByPlan = new Map(draft.lines.map((l) => [l.dispatchPlanId, Number(l.loadedQty || 0)]));
    const allPlanIds = new Set<string>([...originalByPlan.keys(), ...draftByPlan.keys()]);
    const phpDetails = buildLinkedLoadingDetailsFromSlip({
      slip: draft,
      source: "PHP",
      plans,
      orders,
      resolveOrderItem,
      sourceItems: itemsBySource.PHP || [],
      existingDetails: draft.phpDetails,
    });
    const plateDetails = buildLinkedLoadingDetailsFromSlip({
      slip: draft,
      source: "PLATE",
      plans,
      orders,
      resolveOrderItem,
      sourceItems: itemsBySource.PLATE || [],
      existingDetails: draft.plateDetails,
    });
    const syncedDraft: LoadingSlip = {
      ...draft,
      phpDetails,
      plateDetails,
    };
    const shortages = getPhpPlateStockShortages({
      phpDetails,
      plateDetails,
      phpMasterRows: phpItemMaster,
      plateMasterRows: plateItemMaster,
      phpJobs,
      plateJobs,
      fgLoadingSlips: loadingSlips,
      phpLoadingSlips,
      plateLoadingSlips,
      parentFgLoadingId: original.id,
    });
    if (shortages.length > 0) {
      alert(buildPhpPlateStockAlertMessage(shortages));
      return;
    }

    if (!direct) {
      await setPlans((prev) =>
        prev.map((plan) => {
          if (!allPlanIds.has(plan.id)) return plan;
          const delta = (draftByPlan.get(plan.id) || 0) - (originalByPlan.get(plan.id) || 0);
          if (Math.abs(delta) < 0.0001) return plan;
          return { ...plan, loadedQty: Math.max(0, Number(plan.loadedQty || 0) + delta), updateTimestamp: now, updatedBy: "System User" };
        })
      );
    }

    await setLoadingSlips((prev) =>
      prev.map((s) =>
        s.id === slipId ? { ...syncedDraft, updatedBy: "System User", updateTimestamp: now } : s
      )
    );
    await setPhpLoadingSlips((prev) => upsertFgLinkedChildSlip({ prevSlips: prev, parentSlip: syncedDraft, details: phpDetails, source: "PHP" }));
    await setPlateLoadingSlips((prev) => upsertFgLinkedChildSlip({ prevSlips: prev, parentSlip: syncedDraft, details: plateDetails, source: "PLATE" }));

    if (original.invoiceId && !direct) {
      const invoiceId = original.invoiceId;
      const invoice = invoices.find((inv) => inv.id === invoiceId);
      if (!invoice) return;

      const isInterState = (companies.find((c) => c.id === invoice.companyId)?.gstSupplyType || "INTRA_STATE") === "INTER_STATE";

      const qtyByItemId = new Map<string, number>();
      draft.lines.forEach((line) => {
        const plan = plans.find((p) => p.id === line.dispatchPlanId);
        const order = orders.find((o) => o.id === plan?.orderId);
        if (!order?.itemId) return;
        qtyByItemId.set(order.itemId, (qtyByItemId.get(order.itemId) || 0) + Number(line.loadedQty || 0));
      });

      const hadSlipLineItems = invoiceLineItems.some((li) => li.invoiceId === invoiceId && li.loadingSlipId === slipId);

      const nextInvoiceLineItems = invoiceLineItems
        .map((li) => {
          if (li.invoiceId !== invoiceId || li.loadingSlipId !== slipId) return li;
          const nextQty = Number(qtyByItemId.get(li.itemId) || 0);
          const nextAmount = nextQty * Number(li.rate || 0);
          const taxAmount = (nextAmount * Number(li.gstRate || 0)) / 100;
          return {
            ...li,
            qty: nextQty,
            amount: nextAmount,
            cgst: isInterState ? 0 : taxAmount / 2,
            sgst: isInterState ? 0 : taxAmount / 2,
            igst: isInterState ? taxAmount : 0,
          };
        })
        .filter((li) => !(li.invoiceId === invoiceId && li.loadingSlipId === slipId && Number(li.qty || 0) <= 0));

      await setInvoiceLineItems(nextInvoiceLineItems);

      const allForInvoice = nextInvoiceLineItems.filter((li) => li.invoiceId === invoiceId);
      const totals = allForInvoice.reduce(
        (acc, li) => {
          acc.totalBeforeGst += Number(li.amount || 0);
          acc.cgst += Number(li.cgst || 0);
          acc.sgst += Number(li.sgst || 0);
          acc.igst += Number(li.igst || 0);
          return acc;
        },
        { totalBeforeGst: 0, cgst: 0, sgst: 0, igst: 0 }
      );

      const roundOff = Number(invoice.roundOff || 0);
      const otherCharges = Number(invoice.otherCharges || 0);
      const nextTotalAfterGst = totals.totalBeforeGst + totals.cgst + totals.sgst + totals.igst;

      await setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId
            ? {
                ...inv,
                totalBeforeGst: totals.totalBeforeGst,
                cgst: totals.cgst,
                sgst: totals.sgst,
                igst: totals.igst,
                totalAfterGst: nextTotalAfterGst,
                otherCharges,
                roundOff,
                updatedBy: "System User",
                updateTimestamp: now,
              }
            : inv
        )
      );

      if (!hadSlipLineItems) {
        alert("Saved. Note: no existing invoice line items were found for this slip; invoice totals were recomputed from remaining items.");
      }
    }

    cancelEdit(slipId);
  };

  const cancelSlip = async (slip: LoadingSlip) => {
    if (slip.invoiceId) {
      alert("Cannot cancel a slip after invoice is created.");
      return;
    }
    if (slip.status === "Cancelled") return;

    const reason = window.prompt("Cancel reason (optional)") || "";
    const confirmed = await confirm(isDirectLoadingSlip(slip) ? "Cancel this direct loading slip? Linked PHP/Plate child slips will also be cancelled." : "Cancel this loading slip? This will reverse loaded qty from dispatch plans.");
    if (!confirmed) return;

    const now = new Date().toISOString();
    if (!isDirectLoadingSlip(slip)) {
      const byPlan = new Map(slip.lines.map((l) => [l.dispatchPlanId, Number(l.loadedQty || 0)]));
      await setPlans((prev) =>
        prev.map((plan) => {
          if (!byPlan.has(plan.id)) return plan;
          const qty = byPlan.get(plan.id) || 0;
          return { ...plan, loadedQty: Math.max(0, Number(plan.loadedQty || 0) - qty), updateTimestamp: now, updatedBy: "System User" };
        })
      );
    }

    await setLoadingSlips((prev) =>
      prev.map((row) =>
        row.id === slip.id
          ? { ...row, status: "Cancelled" as const, cancelReason: reason, cancelledAt: now, cancelledBy: "System User", updatedBy: "System User", updateTimestamp: now }
          : row
      )
    );
    await setPhpLoadingSlips((prev) =>
      prev.map((row) =>
        String(row.fgLoadingId || "").trim() === slip.id
          ? { ...row, status: "Cancelled" as const, cancelReason: reason || "Cancelled from parent FG loading slip", cancelledAt: now, cancelledBy: "System User", updatedBy: "System User", updateTimestamp: now }
          : row
      )
    );
    await setPlateLoadingSlips((prev) =>
      prev.map((row) =>
        String(row.fgLoadingId || "").trim() === slip.id
          ? { ...row, status: "Cancelled" as const, cancelReason: reason || "Cancelled from parent FG loading slip", cancelledAt: now, cancelledBy: "System User", updatedBy: "System User", updateTimestamp: now }
          : row
      )
    );
  };



  const renderSlipDetails = (slip: (typeof paginatedSlips)[number]) => {
    const draft = draftBySlipId[slip.id] || slip;
    const isEditing = editingSlipIds.has(slip.id);
    const lines = getSlipLines(draft);
    return (
    <div className="rounded border border-black overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-4 py-3 border-b border-black">
        <div className="text-sm font-bold text-black">
          Slip {slip.slipNo} - Date {formatDate(slip.date)}
        </div>
        <div className="flex items-center gap-2">
          {canManage && slip.status !== "Cancelled" ? (
            isEditing ? (
              <>
                {canManage ? <button
                  type="button"
                  onClick={() => void saveEdit(slip.id)}
                  className="px-3 py-1.5 text-xs font-bold border border-black rounded bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  Save
                </button> : null}
                <button
                  type="button"
                  onClick={() => cancelEdit(slip.id)}
                  className="px-3 py-1.5 text-xs font-bold border border-black rounded bg-white hover:bg-slate-100"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => startEdit(slip)}
                  className="px-3 py-1.5 text-xs font-bold border border-black rounded bg-white hover:bg-slate-100"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void cancelSlip(slip)}
                  className="px-3 py-1.5 text-xs font-bold border border-red-700 rounded bg-red-100 text-red-800 hover:bg-red-200"
                >
                  Cancel Slip
                </button>
              </>
            )
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-black border-collapse">
          <thead className="sticky top-0 z-30 bg-slate-100 divide-x divide-black">
            <tr className="divide-x divide-black">
              <th className="px-4 py-2 text-left text-xs font-bold uppercase border border-black">Company</th>
              <th className="px-4 py-2 text-left text-xs font-bold uppercase border border-black">Order No</th>
              <th className="px-4 py-2 text-left text-xs font-bold uppercase border border-black">Item</th>
              <th className="px-4 py-2 text-right text-xs font-bold uppercase border border-black">Planned</th>
              <th className="px-4 py-2 text-right text-xs font-bold uppercase border border-black">Loaded</th>
              <th className="px-4 py-2 text-left text-xs font-bold uppercase border border-black">Job No / Load Qty</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black bg-white">
            {lines.map((line, idx) => {
              const loadedValue = Number(line.loadedQty || 0);
              const allocTotal = getAllocationTotal(line.allocations);
              const balanced = line.isDirect || Math.abs(allocTotal - loadedValue) < 0.0001;
              return (
                <tr key={`${slip.id}-${idx}`} className="divide-x divide-black">
                  <td className="px-4 py-3 text-xs border border-black">{line.companyName}</td>
                  <td className="px-4 py-3 text-xs border border-black">{line.orderNo}</td>
                  <td className="px-4 py-3 text-xs border border-black">{line.itemName}</td>
                  <td className="px-4 py-3 text-xs text-right border border-black">{line.isDirect ? "-" : Number(line.plannedQty || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs text-right border border-black">
                    {isEditing ? (
                      <input
                        type="number"
                        min={0}
                        max={line.maxAllowed}
                        value={loadedValue}
                        onChange={(e) => {
                          const next = e.target.value === "" ? 0 : Math.max(0, Math.min(Number(e.target.value), line.maxAllowed));
                          setDraftBySlipId((prev) => {
                            const draftSlip = prev[slip.id];
                            if (!draftSlip) return prev;
                            const nextSlip: LoadingSlip = JSON.parse(JSON.stringify(draftSlip));
                            const lineToUpdate = nextSlip.lines.find((l) => l.dispatchPlanId === line.dispatchPlanId);
                            if (lineToUpdate) lineToUpdate.loadedQty = next;
                            return { ...prev, [slip.id]: nextSlip };
                          });
                        }}
                        className="w-24 rounded border border-black bg-yellow-200 px-2 py-1 text-xs text-right font-bold"
                      />
                    ) : (
                      <span className="font-bold text-indigo-700">{loadedValue.toLocaleString()}</span>
                    )}
                    {!balanced ? <div className="text-[10px] font-bold text-red-600">Alloc != Loaded</div> : null}
                  </td>
                  <td className="px-4 py-3 text-xs border border-black">
                    {line.isDirect ? (
                      <span className="font-bold text-sky-700">Direct Loading</span>
                    ) : Array.isArray(line.allocations) && line.allocations.length > 0 ? (
                      <div className="space-y-1">
                        {line.allocations.map((a, aidx) => (
                          <div key={aidx} className="flex items-center gap-2">
                            <span className="font-bold">{a.sourceType === "job" ? `Job No: ${a.jobNo}` : (a as any).sourceRef}</span>
                            {isEditing ? (
                              <input
                                type="number"
                                min={0}
                                value={Number(a.qty || 0)}
                                onChange={(e) => {
                                  const rawQty = e.target.value === "" ? 0 : Math.max(0, Number(e.target.value));
                                  const nextQty = rawQty;
                                  setDraftBySlipId((prev) => {
                                    const draftSlip = prev[slip.id];
                                    if (!draftSlip) return prev;
                                    const nextSlip: LoadingSlip = JSON.parse(JSON.stringify(draftSlip));
                                    const lineToUpdate = nextSlip.lines.find((l) => l.dispatchPlanId === line.dispatchPlanId);
                                    if (lineToUpdate?.allocations?.[aidx]) lineToUpdate.allocations[aidx].qty = nextQty as any;
                                    return { ...prev, [slip.id]: nextSlip };
                                  });
                                }}
                                className="w-20 rounded border border-black bg-yellow-200 px-2 py-1 text-xs text-right font-bold"
                              />
                            ) : (
                              <span className="text-slate-700">Load Qty: {Number(a.qty || 0).toLocaleString()}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-500">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {slip.status !== "Cancelled" && isEditing ? (
        <div className="flex justify-end gap-3 border-t border-black bg-slate-50 px-4 py-3">
          <button
            type="button"
            onClick={() => cancelEdit(slip.id)}
            className="px-3 py-1.5 text-xs font-bold border border-black rounded bg-white hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void saveEdit(slip.id)}
            className="px-3 py-1.5 text-xs font-bold border border-black rounded bg-emerald-600 text-white hover:bg-emerald-700"
          >
            Save
          </button>
        </div>
      ) : null}
    </div>
    );
  };

  const LABEL = "mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600";
  const DATE_INPUT = "h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold";
  const hasFilters = Boolean(searchTerm.trim() || companyFilter || erpFilter || itemFilter || firmFilter || sourceFilter || statusFilter || fromDate || toDate);
  const clearFilters = () => { setSearchTerm(""); setCompanyFilter(""); setErpFilter(""); setItemFilter(""); setFirmFilter(""); setSourceFilter(""); setStatusFilter(""); setFromDate(""); setToDate(""); };
  const firmOptions = Array.from(new Set(slipRows.map((slip) => slip.firmId).filter(Boolean)))
    .map((id) => ({ value: id, label: getFirmDisplayNameById(id, firms) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const STATUS_OPTIONS = ["Invoiced", "Not Invoiced", "Cancelled"].map((value) => ({ value, label: value }));
  const SOURCE_OPTIONS = ["Dispatch Plan", "Direct"].map((value) => ({ value, label: value }));
  const statusBadge = (slip: (typeof paginatedSlips)[number]) => (
    <span className={`whitespace-nowrap rounded border px-2 py-0.5 text-[10px] font-black uppercase ${slip.statusLabel === "Cancelled" ? "border-red-700 bg-red-100 text-red-800" : slip.statusLabel === "Invoiced" ? "border-emerald-700 bg-emerald-100 text-emerald-800" : "border-slate-300 bg-slate-100 text-slate-700"}`}>{slip.statusLabel}</span>
  );

  return (
    <div className="space-y-4">
      <div className="border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">Loading Master</h2>
      </div>

      <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
        <div className="relative w-full"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" placeholder="Search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600" /></div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
          <div className="min-w-0"><span className={LABEL}>Firm</span><Select compact value={firmFilter} onChange={setFirmFilter} options={firmOptions} placeholder="All" /></div>
          <div className="min-w-0"><span className={LABEL}>Status</span><Select compact value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} placeholder="All" /></div>
          <div className="min-w-0"><span className={LABEL}>Source</span><Select compact value={sourceFilter} onChange={setSourceFilter} options={SOURCE_OPTIONS} placeholder="All" /></div>
          <div className="min-w-0"><span className={LABEL}>ERP</span><Select compact value={erpFilter} onChange={setErpFilter} options={erpOptions} placeholder="All" /></div>
          <div className="col-span-2 min-w-0 md:col-span-1"><span className={LABEL}>Company</span><Select compact value={companyFilter} onChange={setCompanyFilter} options={companyOptions} placeholder="All" /></div>
          <div className="col-span-2 min-w-0 md:col-span-1"><span className={LABEL}>Item</span><Select compact value={itemFilter} onChange={setItemFilter} options={itemOptions} placeholder="All" /></div>
          <div data-date-pair="true" className="col-span-2 grid min-w-0 grid-cols-2 gap-2 sm:min-w-[280px]">
            <label className="min-w-0"><span className={LABEL}>From Date</span><input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} className={DATE_INPUT} /></label>
            <label className="min-w-0"><span className={LABEL}>To Date</span><input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} className={DATE_INPUT} /></label>
          </div>
        </div>
        <div data-mf-actions="true" className="flex justify-end gap-2">
          {hasFilters ? <button type="button" onClick={clearFilters} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button> : null}
          <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
        </div>
      </div>

      {/* Phones: one card per slip; Details opens the lines with Job No / Load Qty. */}
      <div className="space-y-2 md:hidden">
        {paginatedSlips.length === 0 ? (
          <div className="rounded border border-black bg-white p-6 text-center text-sm italic text-slate-500">No loading slips found.</div>
        ) : paginatedSlips.map((slip) => {
          const open = expandedSlipIds.has(slip.id);
          return (
            <div key={slip.id} className="rounded-lg border-2 border-black bg-white p-3 text-black">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-black">{slip.slipNo || "-"}</span>
                {statusBadge(slip)}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold text-slate-700">
                <span>{formatDate(slip.date)}</span><span>·</span><span className="uppercase">{slip.truckNo || "-"}</span><span>·</span><span>{getFirmDisplayNameById(slip.firmId, firms) || "-"}</span>
                <span className={`rounded border px-1.5 py-0.5 text-[10px] font-black uppercase ${isDirectLoadingSlip(slip) ? "border-sky-700 bg-sky-100 text-sky-800" : "border-violet-700 bg-violet-100 text-violet-800"}`}>{slip.loadingSourceLabel}</span>
              </div>
              <div className="mt-1 break-words text-xs font-bold">{slip.companyNames || "-"}</div>
              <div className="break-words text-xs">{slip.itemNames || "-"}{slip.erpCodes ? <span className="text-slate-500"> · {slip.erpCodes}</span> : null}</div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-600">Total <span className="text-sm font-black text-indigo-700">{slip.totalQty.toLocaleString()}</span></span>
                <span className="flex items-center gap-2">
                  <button type="button" onClick={() => handleDownloadPdf(slip)} disabled={isDownloading === slip.id} className="flex items-center gap-1 rounded border border-indigo-600 bg-indigo-50 px-2 py-1 text-[11px] font-bold uppercase text-indigo-700 disabled:opacity-50" title="Download PDF">
                    {isDownloading === slip.id ? <Spinner size={12} /> : <Download size={12} />} PDF
                  </button>
                  <button type="button" onClick={() => toggleSlip(slip.id)} className="flex items-center gap-1 rounded border border-black bg-white px-2 py-1 text-[11px] font-bold uppercase">
                    {open ? "Hide" : "Details"} {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                </span>
              </div>
              {open ? <div className="mt-2">{renderSlipDetails(slip)}</div> : null}
            </div>
          );
        })}
      </div>

      <div className="hidden md:block bg-white border-2 border-black rounded shadow-sm table-frozen-scroll">
        <table className="min-w-full border-collapse">
          <thead className="sticky top-0 z-30 bg-slate-100">
            <tr className="divide-x divide-black">
              <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider border-b border-black"><SortHeader label={"Slip No"} sortKey="slipNo" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider border-b border-black"><SortHeader label={"Source"} sortKey="source" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider border-b border-black"><SortHeader label={"Status"} sortKey="status" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider border-b border-black"><SortHeader label={"Date"} sortKey="date" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider border-b border-black"><SortHeader label={"Truck"} sortKey="truckNo" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider border-b border-black"><SortHeader label={"Firm"} sortKey="firmName" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider border-b border-black"><SortHeader label={"Company"} sortKey="companyNames" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider border-b border-black"><SortHeader label={"Item"} sortKey="itemNames" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider border-b border-black"><SortHeader label={"ERP"} sortKey="erpCodes" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-6 py-3 text-right text-xs font-bold text-black uppercase tracking-wider border-b border-black"><SortHeader label={"Total Qty"} sortKey="totalQty" sort={sort} onToggle={toggleSort} align="right" /></th>
              <th className="px-6 py-3 text-right text-xs font-bold text-black uppercase tracking-wider border-b border-black">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-black">
            {paginatedSlips.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-6 py-12 text-center text-slate-500 italic">No loading slips found.</td>
              </tr>
) : paginatedSlips.map((slip) => (
              <React.Fragment key={slip.id}>
              <tr className="hover:bg-slate-50 transition-colors divide-x divide-black">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <FileText size={16} className="text-indigo-600 mr-2" />
                    <span className="font-bold text-sm">{slip.slipNo}</span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`rounded border px-2 py-0.5 text-[10px] font-black uppercase ${isDirectLoadingSlip(slip) ? "border-sky-700 bg-sky-100 text-sky-800" : "border-violet-700 bg-violet-100 text-violet-800"}`}>
                    {slip.loadingSourceLabel}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {slip.status === "Cancelled" ? (
                    <span className="rounded border border-red-700 bg-red-100 px-2 py-0.5 text-[10px] font-black uppercase text-red-800">
                      Cancelled
                    </span>
                  ) : slip.invoiceId ? (
                    <span className="rounded border border-emerald-700 bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-800">
                      Invoiced
                    </span>
                  ) : (
                    <span className="rounded border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase text-slate-700">
                      Not Invoiced
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {formatDate(slip.date)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold uppercase text-black">
                  {slip.truckNo || "-"}
                </td>
                <td className="px-6 py-4 text-sm text-black align-top">{getFirmDisplayNameById(slip.firmId, firms) || "-"}</td>
                <td className="px-6 py-4 text-sm text-black align-top">
                  <div className="max-w-[240px] whitespace-normal break-words font-medium leading-5" title={slip.companyNames}>
                    {slip.companyNames || "-"}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-slate-600 align-top">
                  <div className="max-w-[280px] whitespace-normal break-words leading-5" title={slip.itemNames}>
                    {slip.itemNames || "-"}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-slate-600">
                  <div className="max-w-[100px] truncate font-bold uppercase tracking-tight" title={slip.erpCodes}>
                    {slip.erpCodes || "-"}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-indigo-600">
                  {slip.totalQty.toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                  <div className="flex justify-end items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleDownloadPdf(slip)}
                      disabled={isDownloading === slip.id}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold border border-indigo-600 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors uppercase disabled:opacity-50"
                      title="Download PDF"
                    >
                      {isDownloading === slip.id ? <Spinner size={14} /> : <Download size={14} />}
                      PDF
                    </button>
                    {canManage && slip.status !== "Cancelled" ? (
                      <button
                        type="button"
                        onClick={() => startEdit(slip)}
                        disabled={!!slip.invoiceId}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold border border-black rounded bg-white hover:bg-slate-50 transition-colors uppercase disabled:opacity-50 disabled:cursor-not-allowed disabled:text-slate-400"
                        title={slip.invoiceId ? "Invoiced slip cannot be edited" : "Edit loading slip"}
                      >
                        Edit
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleSlip(slip.id)}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold border border-black rounded bg-white hover:bg-slate-50 transition-colors uppercase"
                        title="Open slip details"
                      >
                        Open
                      </button>
                    )}
                    <button 
                      type="button"
                      onClick={() => toggleSlip(slip.id)}
                      className="text-indigo-600 hover:text-indigo-900 font-bold uppercase flex items-center justify-end gap-1"
                    >
                      {expandedSlipIds.has(slip.id) ? "Hide" : "Details"}{" "}
                      {expandedSlipIds.has(slip.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                  </div>
                </td>
              </tr>
              {expandedSlipIds.has(slip.id) ? (
                <tr className="bg-white">
                  <td colSpan={11} className="border-t border-black px-3 pb-4 pt-2">{renderSlipDetails(slip)}</td>
                </tr>
              ) : null}
              </React.Fragment>
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
