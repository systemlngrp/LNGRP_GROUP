import React, { useEffect, useState, useMemo } from "react";
import { useData } from "../hooks/useData";
import { Production, OrderSchedule, Order, Company, Firm, ProductionProcessing, Setting, LoadingSlip, LoadingSlipLine, MaterialIssue, Machine } from "../types";
import { formatDate } from "../lib/serial";
import { Select } from "../components/Select";
import { ClientPagination } from "../components/ClientPagination";
import { ClipboardList, CheckCircle, XCircle, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { PROCESSING_MACHINE_COLUMNS } from "../lib/productionProcessingSummary";
import { parseMandatoryMachinesByType } from "../lib/mandatoryMachines";
import { normalizeMachineName } from "../lib/productionMachineNames";
import { getProductionDisplayStatus } from "../lib/productionStageFilters";
import { useClientPagination } from "../hooks/useClientPagination";
import { SortHeader, useTableSort } from "../lib/tableSort";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { getProductionEffectiveType, getRequiredMachinesForProduction, resolveProductionProcessingRoute } from "../lib/productionType";
import { buildJobClosureStatusMap, formatJobCloseBlockedMessage } from "../lib/jobClosureValidation";
import { getFirmDisplayNameById } from "../lib/firmDisplay";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";

function firstById<T extends { id: string }>(rows: T[]) {
  const map = new Map<string, T>();
  rows.forEach((row) => { if (!map.has(row.id)) map.set(row.id, row); });
  return map;
}

function fmtCard(value: unknown) {
  return (Math.round((Number(value) || 0) * 100) / 100).toLocaleString();
}

export function PendingJobClosure() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [productions, setProductions] = useData<Production>("productions", [], { firmScope: "all" });
  const [phpJobs] = useData<Production>("php_job_master", [], { firmScope: "all" });
  const [plateJobs] = useData<Production>("plate_job_master", [], { firmScope: "all" });
  const [schedules, setSchedules] = useData<OrderSchedule>("orders_schedule", [], { firmScope: "all" });
  const [orders] = useData<Order>("orders", [], { firmScope: "all" });
  const [companies] = useData<Company>("companies", [], { firmScope: "all" });
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const [processing] = useData<ProductionProcessing>("production_processing", [], { firmScope: "all" });
  const [settings] = useData<Setting>("settings", []);
  const [loadingSlips] = useData<LoadingSlip>("loading_slips", []);
  const [materialIssues] = useData<MaterialIssue>("material-issues", []);
  const [machines] = useData<Machine>("machines", []);
  const { findItemAcrossSources } = useOrderItemCatalog();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [firmFilter, setFirmFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [fromDateFilter, setFromDateFilter] = useState("");
  const [toDateFilter, setToDateFilter] = useState("");
  const [closingId, setClosingId] = useState<string | null>(null);
  const [cancelModalJobId, setCancelModalJobId] = useState<string | null>(null);
  const [cancelRemarks, setCancelRemarks] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [cancelSubmittingId, setCancelSubmittingId] = useState<string | null>(null);
  const [editingProductionDateId, setEditingProductionDateId] = useState<string | null>(null);
  const [productionDateDraft, setProductionDateDraft] = useState("");

  const resolveProductionItem = (production?: Production | null) => {
    if (!production) return undefined;
    return findItemAcrossSources(
      String(production.itemId || ""),
      production.itemSource,
      production.erpCode
    );
  };

  const updateCloseMeta = async (id: string, patch: Partial<Pick<Production, "closeBy" | "closeDate">>) => {
    const target = productions.find((p) => p.id === id);
    if (!target || target.status === "Completed" || target.status === "Cancelled") return;

    const resolvedPatch = { ...patch };
    const nextCloseBy = String(resolvedPatch.closeBy ?? target.closeBy ?? "").trim();
    const nextCloseDate = String(resolvedPatch.closeDate ?? target.closeDate ?? "").trim();

    if (nextCloseBy === "Yes") {
      if (!nextCloseDate) {
        alert("Close Date is mandatory when Closer is Yes.");
        return;
      }

      const closureStatus = jobClosureStatusMap.get(id);
      if (!closureStatus?.canClose) {
        alert(formatJobCloseBlockedMessage(closureStatus));
        return;
      }
    }

    const timestamp = new Date().toISOString();
    await setProductions((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              ...resolvedPatch,
              updateTimestamp: timestamp,
              updatedBy: "System User",
            }
          : p
      )
    );
  };

  const issuedProductionIds = useMemo(() => {
    const ids = new Set<string>();
    materialIssues.forEach((issue) => {
      const productionId = String(issue.productionId || "").trim();
      if (productionId) ids.add(productionId);
    });
    return ids;
  }, [materialIssues]);

  const hasMaterialIssue = (productionId: string) => issuedProductionIds.has(String(productionId || "").trim());

  const startEditingProductionDate = (production: Production) => {
    if (hasMaterialIssue(production.id)) {
      alert("Production Date cannot be changed after Material Issue is created for this job.");
      return;
    }
    setEditingProductionDateId(production.id);
    setProductionDateDraft((production.date || "").split("T")[0]);
  };

  const cancelEditingProductionDate = () => {
    setEditingProductionDateId(null);
    setProductionDateDraft("");
  };

  const saveProductionDate = async (id: string) => {
    if (hasMaterialIssue(id)) {
      alert("Production Date cannot be changed after Material Issue is created for this job.");
      cancelEditingProductionDate();
      return;
    }
    const nextDate = productionDateDraft.trim();
    if (!nextDate) {
      alert("Production Date is mandatory.");
      return;
    }
    const timestamp = new Date().toISOString();
    await setProductions((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              date: nextDate,
              updateTimestamp: timestamp,
              updatedBy: user?.name || "System User",
            }
          : row
      )
    );
    cancelEditingProductionDate();
  };

  const processingTotalsMap = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    processing.forEach((p) => {
      const totals = map.get(p.productionId) || { paper: 0, liner: 0, printing: 0, pasting: 0, stitching: 0, punching: 0, gluing: 0 };
      const machineColumn = PROCESSING_MACHINE_COLUMNS.find(col => (col.machineNames as readonly string[]).includes(p.machineName));
      if (machineColumn) {
        totals[machineColumn.key] += Number(p.qty || 0);
      }
      map.set(p.productionId, totals);
    });
    return map;
  }, [processing]);

  const processingMachinesMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    processing.forEach((row) => {
      const set = map.get(row.productionId) || new Set<string>();
      set.add(normalizeMachineName(row.machineName));
      map.set(row.productionId, set);
    });
    return map;
  }, [processing]);

  const mandatoryMachinesByType = useMemo(() => parseMandatoryMachinesByType(settings[0]), [settings]);

  const jobClosureStatusMap = useMemo(() => {
    return buildJobClosureStatusMap({
      productions: productions.map((production) => resolveProductionProcessingRoute(production, phpJobs, plateJobs)),
      processing,
      mandatoryMachinesByType,
      machines,
      resolveProductionItem,
    });
  }, [productions, phpJobs, plateJobs, processing, mandatoryMachinesByType, machines, findItemAcrossSources]);
  const erpLeastGsmMap = useMemo(() => {
    const map = new Map<string, number>();
    productions.forEach(p => {
      if (p.status === "Cancelled" || p.cancelTimestamp) return;
      
      const erp = String(p.erpCode || "").trim();
      const gsm = Number(p.gsm || 0);
      if (erp && gsm > 0) {
        if (!map.has(erp) || gsm < map.get(erp)!) {
          map.set(erp, gsm);
        }
      }
    });
    return map;
  }, [productions]);

  const loadedQtyByProductionId = useMemo(() => {
    const map = new Map<string, number>();
    const getJobAllocations = (line: LoadingSlipLine) =>
      Array.isArray(line.allocations)
        ? line.allocations.filter((allocation) => allocation.sourceType === "job")
        : [];

    loadingSlips.forEach((slip) => {
      slip.lines.forEach((line) => {
        getJobAllocations(line).forEach((allocation) => {
          map.set(allocation.jobId, (map.get(allocation.jobId) || 0) + Number(allocation.qty || 0));
        });
      });
    });

    return map;
  }, [loadingSlips]);

  const openCancelModal = (id: string) => {
    const target = productions.find((p) => p.id === id);
    if (!target || target.status === "Cancelled") return;
    setCancelModalJobId(id);
    setCancelRemarks("");
    setCancelError("");
  };

  const closeCancelModal = () => {
    if (cancelSubmittingId) return;
    setCancelModalJobId(null);
    setCancelRemarks("");
    setCancelError("");
  };

  const handleCancelJob = async () => {
    const id = cancelModalJobId;
    if (!id) return;

    const target = productions.find((p) => p.id === id);
    if (!target || target.status === "Cancelled") return;

    const reason = cancelRemarks.trim();
    if (!reason) {
      setCancelError("Cancel reason is mandatory.");
      return;
    }

    const timestamp = new Date().toISOString();
    setCancelSubmittingId(id);

    try {
      await setProductions((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                status: "Cancelled",
                cancelTimestamp: timestamp,
                cancelEmailId: user?.email || "System User",
                cancelRemarks: reason,
                updateTimestamp: timestamp,
                updatedBy: user?.name || "System User",
              }
            : p
        )
      );

      if (target.scheduleId) {
        await setSchedules((prev) =>
          prev.map((schedule) =>
            schedule.id === target.scheduleId
              ? {
                  ...schedule,
                  producedQty: Math.max(0, Number(schedule.producedQty || 0) - Number(target.qty || 0)),
                  updateTimestamp: timestamp,
                  updatedBy: user?.name || "System User",
                }
              : schedule
          )
        );
      }

      alert("Job cancelled successfully.");
      setCancelModalJobId(null);
      setCancelRemarks("");
      setCancelError("");
    } catch (err) {
      console.error("Failed to cancel job:", err);
      alert("Failed to cancel job. Please try again.");
    } finally {
      setCancelSubmittingId(null);
    }
  };

  const handleCloseJob = async (id: string) => {
    const target = productions.find((p) => p.id === id);
    if (!target || target.status === "Completed" || target.status === "Cancelled") return;

    const closureStatus = jobClosureStatusMap.get(id);
    if (!closureStatus?.canClose) {
      const reasons = closureStatus?.reasons?.length ? closureStatus.reasons : ["Processing data is incomplete."];
      alert(formatJobCloseBlockedMessage(closureStatus));
      return;
    }

    if (closingId !== id) {
      setClosingId(id);
      setTimeout(() => setClosingId(null), 3000);
      return;
    }

    const timestamp = new Date().toISOString();
    const closeDate = new Date().toISOString().split("T")[0];
    try {
      await setProductions((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                status: "Completed",
                tallyTimestamp: p.tallyTimestamp || timestamp,
                closeBy: p.closeBy || "Yes",
                closeDate: p.closeDate || closeDate,
                updateTimestamp: timestamp,
                updatedBy: "System User",
              }
            : p
        )
      );
    } catch (err) {
      console.error("Failed to close job:", err);
    } finally {
      setClosingId(null);
    }
  };

  // Filter for ONLY jobs where closeBy and closeDate are NOT filled
  // First record per id: the same one the earlier list searches picked.
  const scheduleById = useMemo(() => firstById(schedules), [schedules]);
  const orderById = useMemo(() => firstById(orders), [orders]);
  const companyById = useMemo(() => firstById(companies), [companies]);

  // Rule: Only show jobs where closeBy and closeDate are empty/not filled
  const pendingClosureRows = useMemo(
    () => productions.filter((p) => !p.closeBy && !p.closeDate && p.status !== "Cancelled"),
    [productions]
  );

  // Worked out once per data or filter change instead of on every render.
  const filteredList = useMemo(() => {
    const words = searchWords(searchTerm);
    return pendingClosureRows
    .filter(p => {
      const item = resolveProductionItem(p);
      const schedule = scheduleById.get(p.scheduleId);
      const order = orderById.get(schedule?.orderId as string);
      const company = companyById.get(order?.companyId as string);
      const firmId = String(schedule?.firmId || p.firmId || p.orderFirmId || order?.firmId || "");
      
      if (companyFilter && order?.companyId !== companyFilter) return false;
      if (firmFilter && firmId !== firmFilter) return false;
      const itemKey = item?.id || `${item?.name || ""}::${p.erpCode || ""}`;
      if (itemFilter && itemKey !== itemFilter) return false;
      const planDate = String(p.date || "").slice(0, 10);
      if (fromDateFilter && (!planDate || planDate < fromDateFilter)) return false;
      if (toDateFilter && (!planDate || planDate > toDateFilter)) return false;
      if (!words.length) return true;
      // Visible table columns only (as the cells show them).
      const anyItem = item as any;
      const erp = String(p.erpCode || "").trim();
      const status = jobClosureStatusMap.get(p.id);
      const required = status?.required || [];
      const missing = status?.missing || [];
      const done = status?.done || 0;
      const procTotals = processingTotalsMap.get(p.id) || { paper: 0, liner: 0, printing: 0, pasting: 0, stitching: 0, punching: 0, gluing: 0 };
      return matchesTableSearch([
        p.transactionNo,
        getFirmDisplayNameById(firmId, firms),
        order?.orderNo,
        p.erpCode,
        company?.name,
        p.date,
        item?.name || "Unknown",
        anyItem?.isSample ? "Yes" : "",
        getProductionEffectiveType(p, item),
        required.length === 0 ? "" : missing.length === 0 ? `Done ${done}/${required.length}` : `Pending ${done}/${required.length} Missing: ${missing.join(", ")}`,
        `${p.qty} ${p.uom}`,
        p.qty,
        p.ups || anyItem?.ups,
        Number(loadedQtyByProductionId.get(p.id) || 0),
        procTotals.paper,
        procTotals.liner,
        procTotals.printing,
        procTotals.pasting,
        procTotals.stitching,
        procTotals.punching,
        procTotals.gluing,
        p.length || "",
        p.breadth || "",
        p.height || "",
        anyItem?.lOd || item?.raw?.lOd,
        anyItem?.wOd || item?.raw?.wOd,
        anyItem?.hOd || item?.raw?.hOd,
        p.ply || "",
        p.flute,
        p.l1 || anyItem?.l1,
        p.f1 || anyItem?.f1,
        p.l2 || anyItem?.l2,
        p.f2 || anyItem?.f2,
        p.l3 || anyItem?.l3,
        p.gsm || "",
        erpLeastGsmMap.get(erp) || "",
        p.color1,
        p.color2,
        p.printingColor,
        p.totalPaperWeight || "",
        Number(p.realizationPerKg || 0) ? Number(p.realizationPerKg || 0).toFixed(2) : "",
        (p as any).reelAsPerCalc || "",
        (p as any).reelActualWithTrimming || "",
        (p as any).cuttingWithTrimming || anyItem?.cuttingSize || item?.raw?.cuttingSize,
        p.plannedProductionInMeter,
        p.sheetWeight || "",
        p.fluteBatches,
        Number(p.rate) ? Number(p.rate).toFixed(2) : p.rate,
        Number(p.qty || 0) && Number(p.rate || 0) ? Number(p.qty || 0) * Number(p.rate || 0) : "",
        Number(p.prodFromFFG || 0),
        Number(p.actualPaperUsed || 0).toFixed(2),
      ], words);
    })
    .sort((a, b) => b.transactionNo.localeCompare(a.transactionNo, undefined, { numeric: true, sensitivity: 'base' }));
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [companyById, companyFilter, erpLeastGsmMap, firmFilter, firms, findItemAcrossSources, itemFilter, fromDateFilter, toDateFilter, jobClosureStatusMap, loadedQtyByProductionId, orderById, processingTotalsMap, pendingClosureRows, scheduleById, searchTerm]);

  const firmOptions = useMemo(() => Array.from(new Map(pendingClosureRows.map((row) => { const schedule = scheduleById.get(row.scheduleId); const order = orderById.get(schedule?.orderId as string); const firmId = String(schedule?.firmId || row.firmId || row.orderFirmId || order?.firmId || ""); return [firmId, { value: firmId, label: firmId ? getFirmDisplayNameById(firmId, firms) : "" }]; })).values()).filter((option) => option.value && option.label).sort((a, b) => a.label.localeCompare(b.label)), [firms, orderById, pendingClosureRows, scheduleById]);
  const companyOptions = useMemo(() => Array.from(new Map(pendingClosureRows.map((row) => { const schedule = scheduleById.get(row.scheduleId); const order = orderById.get(schedule?.orderId as string); const company = companyById.get(order?.companyId as string); return [order?.companyId || "", { value: order?.companyId || "", label: company?.name || "" }]; })).values()).filter((option) => option.value && option.label).sort((a, b) => a.label.localeCompare(b.label)), [companyById, pendingClosureRows, orderById, scheduleById]);
  const itemOptions = useMemo(() => Array.from(new Map(pendingClosureRows.map((row) => { const item = resolveProductionItem(row); const erp = String(row.erpCode || ""); const name = item?.name || ""; const key = item?.id || `${name}::${erp}`; return [key, { value: key, label: erp && name && !name.toLowerCase().includes(erp.toLowerCase()) ? `${name} - ${erp}` : name || erp, searchText: `${name} ${erp}` }]; })).values()).filter((option) => option.value && option.label).sort((a, b) => a.label.localeCompare(b.label)), [pendingClosureRows, findItemAcrossSources]);

  const { sorted: sortedList, sort, toggle: toggleSort } = useTableSort(filteredList, (p, key) => {
    const schedule = scheduleById.get(p.scheduleId);
    const order = orderById.get(schedule?.orderId as string);
    const item = resolveProductionItem(p);
    const anyItem = item as any;
    const erp = String(p.erpCode || "").trim();
    const procTotals = processingTotalsMap.get(p.id) || { paper: 0, liner: 0, printing: 0, pasting: 0, stitching: 0, punching: 0, gluing: 0 };
    switch (key) {
      case "jobNo": return p.transactionNo;
      case "firm": return getFirmDisplayNameById(String(schedule?.firmId || p.firmId || p.orderFirmId || order?.firmId || ""), firms);
      case "orderNo": return order?.orderNo || "";
      case "erp": return p.erpCode || "";
      case "company": return companyById.get(order?.companyId as string)?.name || "";
      case "date": return p.date;
      case "item": return item?.name || "Unknown";
      case "sample": return anyItem?.isSample ? "Yes" : "";
      case "type": return getProductionEffectiveType(p, item) || "";
      case "mandatory": {
        const status = jobClosureStatusMap.get(p.id);
        const required = status?.required || [];
        const missing = status?.missing || [];
        if (!required.length) return "";
        return `${missing.length === 0 ? "Done" : "Pending"} ${status?.done || 0}/${required.length}`;
      }
      case "qty": return Number(p.qty || 0);
      case "ups": return p.ups || anyItem?.ups || "";
      case "loaded": return Number(loadedQtyByProductionId.get(p.id) || 0);
      case "paper": return procTotals.paper;
      case "liner": return procTotals.liner;
      case "printing": return procTotals.printing;
      case "pasting": return procTotals.pasting;
      case "stitching": return procTotals.stitching;
      case "punching": return procTotals.punching;
      case "gluing": return procTotals.gluing;
      case "length": return p.length || "";
      case "breadth": return p.breadth || "";
      case "height": return p.height || "";
      case "lOd": return anyItem?.lOd || item?.raw?.lOd || "";
      case "wOd": return anyItem?.wOd || item?.raw?.wOd || "";
      case "hOd": return anyItem?.hOd || item?.raw?.hOd || "";
      case "ply": return p.ply || "";
      case "flute": return p.flute || "";
      case "l1": return p.l1 || anyItem?.l1 || "";
      case "f1": return p.f1 || anyItem?.f1 || "";
      case "l2": return p.l2 || anyItem?.l2 || "";
      case "f2": return p.f2 || anyItem?.f2 || "";
      case "l3": return p.l3 || anyItem?.l3 || "";
      case "gsm": return p.gsm || "";
      case "leastGsm": return erpLeastGsmMap.get(erp) || "";
      case "color1": return p.color1 || "";
      case "color2": return p.color2 || "";
      case "printingColor": return p.printingColor || "";
      case "totalWt": return p.totalPaperWeight || "";
      case "realKg": return Number(p.realizationPerKg || 0) || "";
      case "reelCalc": return (p as any).reelAsPerCalc || "";
      case "reelTrim": return (p as any).reelActualWithTrimming || "";
      case "cuttingTrim": return (p as any).cuttingWithTrimming || anyItem?.cuttingSize || item?.raw?.cuttingSize || "";
      case "plannedProd": return p.plannedProductionInMeter ?? "";
      case "sheetWt": return p.sheetWeight || "";
      case "fluteBatch": return p.fluteBatches || "";
      case "rate": return Number(p.rate) || p.rate || "";
      case "value": return Number(p.qty || 0) && Number(p.rate || 0) ? Number(p.qty || 0) * Number(p.rate || 0) : "";
      case "ffg": return Number(p.prodFromFFG || 0);
      case "actualPaper": return Number(p.actualPaperUsed || 0);
      default: return "";
    }
  }, [scheduleById, orderById, companyById, firms, jobClosureStatusMap, loadedQtyByProductionId, processingTotalsMap, erpLeastGsmMap, findItemAcrossSources]);

  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalItems,
    paginatedItems: paginatedList,
  } = useClientPagination(sortedList, 25);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, firmFilter, companyFilter, itemFilter, fromDateFilter, toDateFilter, setPage]);

  const hasActiveFilters = Boolean(searchTerm.trim() || firmFilter || companyFilter || itemFilter || fromDateFilter || toDateFilter);
  const clearFilters = () => {
    setSearchTerm("");
    setFirmFilter("");
    setCompanyFilter("");
    setItemFilter("");
    setFromDateFilter("");
    setToDateFilter("");
  };

  const getMandatoryStatus = (production: Production, item?: any) => {
    const status = jobClosureStatusMap.get(production.id);
    return {
      required: status?.required || [],
      done: status?.done || 0,
      missing: status?.missing || [],
    };
  };

  const cancelTarget = cancelModalJobId ? productions.find((p) => p.id === cancelModalJobId) : null;
  const cancelTargetSchedule = cancelTarget?.scheduleId ? schedules.find((schedule) => schedule.id === cancelTarget.scheduleId) : null;
  const cancelTargetOrder = cancelTargetSchedule ? orders.find((order) => order.id === cancelTargetSchedule.orderId) : null;
  const cancelTargetItem = cancelTarget ? resolveProductionItem(cancelTarget) : null;

  return (
    <div className="space-y-6">
      <div className="border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">Pending Job Closure</h2>
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
          <div data-date-pair="true" className="col-span-2 grid min-w-0 grid-cols-2 gap-2 sm:min-w-[260px]">
            <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Plan From Date</span><input type="date" value={fromDateFilter} max={toDateFilter || undefined} onChange={(e) => setFromDateFilter(e.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
          <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Plan To Date</span><input type="date" value={toDateFilter} min={fromDateFilter || undefined} onChange={(e) => setToDateFilter(e.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
          </div>
        </div>
        <div data-mf-actions="true" className="flex justify-end gap-2">
          {hasActiveFilters ? (
            <button type="button" onClick={clearFilters} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button>
          ) : null}
          <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
        </div>
      </div>

      <div className="space-y-2">
        {/* Mobile View - Cards */}
        <div className="block md:hidden space-y-4 p-2">
            {paginatedList.map((p) => {
                const schedule = scheduleById.get(p.scheduleId);
                const order = orderById.get(schedule?.orderId as string);
                const company = companyById.get(order?.companyId as string);
                const item = resolveProductionItem(p);
                const erp = String(p.erpCode || "").trim();
                const leastGsm = erpLeastGsmMap.get(erp);
                const isHighGsm = p.gsm && leastGsm && Number(p.gsm) > Number(leastGsm);
                const procTotals = processingTotalsMap.get(p.id) || { paper: 0, liner: 0, printing: 0, pasting: 0, stitching: 0, punching: 0, gluing: 0 };
                  const closureStatus = jobClosureStatusMap.get(p.id);
                  const mandatoryCloseDataComplete = closureStatus?.canClose === true;
                const mandatory = getMandatoryStatus(p, item);
                
                return (
                  <div key={p.id} className={`${isHighGsm ? "bg-amber-50" : "bg-white"} border-2 border-black p-4 space-y-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rounded relative`}>
                       <div className="flex justify-between items-center">
                          <div className="font-bold text-sm">Job: {p.transactionNo}</div>
                      </div>
	                      <div className="text-xs text-slate-500">Prod Date: {formatDate(p.date)}</div>
	                      {order && (
	                        <>
	                          <div className="text-xs font-bold text-slate-700">Order: {order.orderNo} ({formatDate(order.orderDate)})</div>
                          <div className="text-xs font-bold text-slate-700">ERP Code: {p.erpCode || "-"}</div>
                          <div className="text-xs font-bold text-slate-700">Company: {company?.name || "Unknown"}</div>
                        </>
                      )}
                      <div className="text-sm font-bold">{item?.name || "Unknown"}</div>
                      <div className="text-[10px] text-slate-600 uppercase font-black">
                        Type: {getProductionEffectiveType(p, item) || "-"} | Print: {p.printingColor || "-"}
                      </div>
                      <div className="text-[10px] text-slate-600 uppercase font-bold">
                        OD: {(item as any)?.lOd || item?.raw?.lOd || "-"}{" x "}{(item as any)?.wOd || item?.raw?.wOd || "-"}{" x "}{(item as any)?.hOd || item?.raw?.hOd || "-"}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded border border-slate-300 bg-slate-50 px-2 py-1.5">
                          <div className="text-[10px] font-black uppercase text-slate-500">Plan Qty</div>
                          <div className="text-sm font-black tabular-nums">{fmtCard(p.qty)} {p.uom}</div>
                        </div>
                        <div className="rounded border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-indigo-800">
                          <div className="text-[10px] font-black uppercase">Production FFG</div>
                          <div className="text-sm font-black tabular-nums">{fmtCard(p.prodFromFFG || 0)}</div>
                        </div>
                        <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-800">
                          <div className="text-[10px] font-black uppercase">Loaded</div>
                          <div className="text-sm font-black tabular-nums">{fmtCard(loadedQtyByProductionId.get(p.id) || 0)}</div>
                        </div>
                        <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-emerald-800">
                          <div className="text-[10px] font-black uppercase">Actual Paper</div>
                          <div className="text-sm font-black tabular-nums">{fmtCard(p.actualPaperUsed || 0)} KG</div>
                        </div>
                        {p.gsm || leastGsm ? (
                          <div className="col-span-2 flex items-center justify-between rounded border border-slate-300 px-2 py-1.5">
                            <span className="font-black text-indigo-700">GSM: {p.gsm || "-"}</span>
                            {leastGsm ? <span className="font-black text-emerald-700">Least: {leastGsm}</span> : null}
                          </div>
                        ) : null}
                        <div className="col-span-2 rounded border border-slate-300 px-2 py-1.5 text-[11px] font-bold leading-5 text-slate-700">
                          Paper {fmtCard(procTotals.paper)} · Liner {fmtCard(procTotals.liner)} · Print {fmtCard(procTotals.printing)} · Paste {fmtCard(procTotals.pasting)} · Stitch {fmtCard(procTotals.stitching)} · Punch {fmtCard(procTotals.punching)} · Glue {fmtCard(procTotals.gluing)}
                        </div>
                      </div>
                      {mandatory.required.length > 0 ? (
                        <div
                          className={
                            mandatory.missing.length === 0
                              ? "text-[10px] font-black text-emerald-700 bg-emerald-50 p-1.5 rounded border border-emerald-200"
                              : "text-[10px] font-black text-amber-700 bg-amber-50 p-1.5 rounded border border-amber-200"
                          }
                        >
                          Mandatory: {mandatory.done}/{mandatory.required.length}
                          {mandatory.missing.length ? ` | Missing: ${mandatory.missing.join(", ")}` : ""}
                        </div>
                      ) : null}
                       <div className="flex gap-2 mt-2">
                       <button 
                          onClick={() => navigate(`/production-processing/form?productionId=${p.id}`)}
                          className="flex-1 bg-indigo-600 text-white font-bold inline-flex items-center justify-center p-2 border border-black text-xs hover:bg-indigo-700"
                        >
                          <ClipboardList size={14} className="mr-1" /> Report Proc.
                        </button>
                        {editingProductionDateId === p.id ? (
                          <>
                            <input
                              type="date"
                              value={productionDateDraft}
                              onChange={(e) => setProductionDateDraft(e.target.value)}
                              className="min-w-[140px] border border-black rounded px-2 py-1 text-xs bg-white"
                            />
                            <button
                              onClick={() => void saveProductionDate(p.id)}
                              className="font-bold inline-flex items-center justify-center p-2 border border-black text-xs bg-white hover:bg-slate-100"
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelEditingProductionDate}
                              className="font-bold inline-flex items-center justify-center p-2 border border-black text-xs bg-white hover:bg-slate-100"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => startEditingProductionDate(p)}
                            disabled={hasMaterialIssue(p.id)}
                            title={hasMaterialIssue(p.id) ? "Date change is blocked after Material Issue" : "Change production date"}
                            className="font-bold inline-flex items-center justify-center p-2 border border-black text-xs bg-white hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                          >
                            Change Date
                          </button>
                        )}
                        {mandatoryCloseDataComplete ? (
                          <button
                            onClick={() => handleCloseJob(p.id)}
                            className={`flex-1 font-bold inline-flex items-center justify-center p-2 border border-black text-xs ${
                              closingId === p.id
                                ? "bg-amber-500 text-black animate-pulse"
                                : "bg-emerald-600 text-white hover:bg-emerald-700"
                            }`}
                          >
                            <CheckCircle size={14} className="mr-1" /> {closingId === p.id ? "Confirm?" : "Close Job"}
                          </button>
                        ) : null}
                        <button 
                          onClick={() => openCancelModal(p.id)} 
                          className="text-red-600 hover:text-red-900 font-bold inline-flex items-center justify-center p-2 border border-black text-xs min-w-[80px]"
                        >
                          <XCircle size={14} className="mr-1" /> Cancel Job
                        </button>
                      </div>
                  </div>
                );
            })}
        </div>
        <div className="hidden overflow-x-auto rounded border border-black bg-white md:block">
          <table className="min-w-max w-full divide-y divide-black border-collapse border border-black">
            <thead className="bg-slate-100 divide-x divide-black">
              <tr className="divide-x divide-black">
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap">Sr. No.</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Job No." sortKey="jobNo" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Firm" sortKey="firm" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Order No." sortKey="orderNo" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="ERP Code" sortKey="erp" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Company" sortKey="company" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Plan Date" sortKey="date" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Item Name" sortKey="item" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Sample" sortKey="sample" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Type" sortKey="type" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Mandatory" sortKey="mandatory" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Planned Qty" sortKey="qty" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-center text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="UPS" sortKey="ups" sort={sort} onToggle={toggleSort} align="center" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap bg-amber-50"><SortHeader label="Loaded Qty" sortKey="loaded" sort={sort} onToggle={toggleSort} align="right" /></th>

                <th className="px-4 py-3 text-right text-xs font-bold text-indigo-900 uppercase border border-black whitespace-nowrap bg-indigo-50"><SortHeader label="Paper" sortKey="paper" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-indigo-900 uppercase border border-black whitespace-nowrap bg-indigo-50"><SortHeader label="Liner" sortKey="liner" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-indigo-900 uppercase border border-black whitespace-nowrap bg-indigo-50"><SortHeader label="Print" sortKey="printing" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-indigo-900 uppercase border border-black whitespace-nowrap bg-indigo-50"><SortHeader label="Paste" sortKey="pasting" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-indigo-900 uppercase border border-black whitespace-nowrap bg-indigo-50"><SortHeader label="Stitch" sortKey="stitching" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-indigo-900 uppercase border border-black whitespace-nowrap bg-indigo-50"><SortHeader label="Punch" sortKey="punching" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-indigo-900 uppercase border border-black whitespace-nowrap bg-indigo-50"><SortHeader label="Glue" sortKey="gluing" sort={sort} onToggle={toggleSort} align="right" /></th>
                
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="L" sortKey="length" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="B" sortKey="breadth" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="H" sortKey="height" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="L (OD)" sortKey="lOd" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="W (OD)" sortKey="wOd" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="H (OD)" sortKey="hOd" sort={sort} onToggle={toggleSort} align="right" /></th>
                
                <th className="px-4 py-3 text-center text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Ply" sortKey="ply" sort={sort} onToggle={toggleSort} align="center" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Flute" sortKey="flute" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="L1" sortKey="l1" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="F1" sortKey="f1" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="L2" sortKey="l2" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="F2" sortKey="f2" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="L3" sortKey="l3" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="GSM" sortKey="gsm" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Least GSM" sortKey="leastGsm" sort={sort} onToggle={toggleSort} align="right" /></th>

                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Color 1" sortKey="color1" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Color 2" sortKey="color2" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Printing Color" sortKey="printingColor" sort={sort} onToggle={toggleSort} align="left" /></th>
                
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Total Wt" sortKey="totalWt" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Real/KG" sortKey="realKg" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Reel (Calc)" sortKey="reelCalc" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Reel Trim" sortKey="reelTrim" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Cutting Trim" sortKey="cuttingTrim" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Planned Prod (M)" sortKey="plannedProd" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Sheet Wt" sortKey="sheetWt" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Flute Batch" sortKey="fluteBatch" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Rate" sortKey="rate" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Value" sortKey="value" sort={sort} onToggle={toggleSort} align="right" /></th>
                
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap bg-indigo-50/50"><SortHeader label="Production FFG" sortKey="ffg" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-emerald-900 uppercase border border-black whitespace-nowrap bg-emerald-50"><SortHeader label="Actual Paper (KG)" sortKey="actualPaper" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap">Job Closer</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap">Close Date</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-black uppercase border border-black whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black bg-white">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={55} className="h-16" aria-label="No records" />
                </tr>
              ) : (
                paginatedList.map((p, idx) => {
                  const srNo = (page - 1) * pageSize + idx + 1;
                  const schedule = scheduleById.get(p.scheduleId);
                  const order = orderById.get(schedule?.orderId as string);
                  const company = companyById.get(order?.companyId as string);
                  const item = resolveProductionItem(p);
                  const mandatory = getMandatoryStatus(p, item);
                  const erp = String(p.erpCode || "").trim();
                  const leastGsm = erpLeastGsmMap.get(erp);
                  const isHighGsm = p.gsm && leastGsm && Number(p.gsm) > Number(leastGsm);
                  const procTotals = processingTotalsMap.get(p.id) || { paper: 0, liner: 0, printing: 0, pasting: 0, stitching: 0, punching: 0, gluing: 0 };
                  const closureStatus = jobClosureStatusMap.get(p.id);
                  const mandatoryCloseDataComplete = closureStatus?.canClose === true;
                  const baseCloseFieldsDisabled = !Number(p.actualPaperUsed || 0);
                  const closeFieldsDisabled = baseCloseFieldsDisabled || !mandatoryCloseDataComplete;
                  const closeFieldsDisabledTitle = !mandatoryCloseDataComplete
                    ? "Complete all mandatory machine processing data to enable job closer"
                    : baseCloseFieldsDisabled
                      ? "Actual Paper Used is required to enable job closer"
                      : undefined;                  
                    return (
                    <tr key={p.id} className={`${isHighGsm ? "bg-amber-50" : "hover:bg-slate-50"} divide-x divide-black transition-colors`}>
                      <td className="px-4 py-4 text-xs font-bold text-black border border-black whitespace-nowrap">{srNo}</td>
                      <td className="px-4 py-4 text-xs font-bold text-black border border-black whitespace-nowrap">{p.transactionNo}</td>
                      <td className="px-4 py-4 text-xs font-semibold text-black border border-black whitespace-nowrap">{getFirmDisplayNameById(String(schedule?.firmId || p.firmId || p.orderFirmId || order?.firmId || ""), firms)}</td>
                      <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">{order?.orderNo || "-"}</td>
                      <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">{p.erpCode || "-"}</td>
                      <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">{company?.name || "-"}</td>
                      <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">{formatDate(p.date)}</td>
                      <td className="px-4 py-4 text-xs text-black border border-black min-w-[150px]">{item?.name || "Unknown"}</td>
                      <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">{(item as any)?.isSample ? "Yes" : "-"}</td>
                      <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">{getProductionEffectiveType(p, item) || "-"}</td>
                      <td className="px-4 py-4 text-[11px] text-black border border-black whitespace-nowrap">
                        {mandatory.required.length === 0 ? (
                          "-"
                        ) : mandatory.missing.length === 0 ? (
                          <span className="font-black text-emerald-700">Done {mandatory.done}/{mandatory.required.length}</span>
                        ) : (
                          <div className="space-y-1">
                            <div className="font-black text-amber-700">Pending {mandatory.done}/{mandatory.required.length}</div>
                            <div className="text-[10px] font-semibold text-slate-600 whitespace-normal max-w-[240px]">
                              Missing: {mandatory.missing.join(", ")}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right text-xs font-medium text-emerald-700 border border-black whitespace-nowrap">{p.qty} {p.uom}</td>
                      <td className="px-4 py-4 text-center text-xs font-medium text-black border border-black whitespace-nowrap">{p.ups || (item as any)?.ups || "-"}</td>
                      <td className="px-4 py-4 text-right text-xs font-bold text-amber-700 border border-black whitespace-nowrap bg-amber-50/40">
                        {Number(loadedQtyByProductionId.get(p.id) || 0).toLocaleString()}
                      </td>

                      <td className="px-4 py-4 text-right text-xs font-bold text-indigo-700 border border-black whitespace-nowrap bg-indigo-50/30">{procTotals.paper.toLocaleString()}</td>
                      <td className="px-4 py-4 text-right text-xs font-bold text-indigo-700 border border-black whitespace-nowrap bg-indigo-50/30">{procTotals.liner.toLocaleString()}</td>
                      <td className="px-4 py-4 text-right text-xs font-bold text-indigo-700 border border-black whitespace-nowrap bg-indigo-50/30">{procTotals.printing.toLocaleString()}</td>
                      <td className="px-4 py-4 text-right text-xs font-bold text-indigo-700 border border-black whitespace-nowrap bg-indigo-50/30">{procTotals.pasting.toLocaleString()}</td>
                      <td className="px-4 py-4 text-right text-xs font-bold text-indigo-700 border border-black whitespace-nowrap bg-indigo-50/30">{procTotals.stitching.toLocaleString()}</td>
                      <td className="px-4 py-4 text-right text-xs font-bold text-indigo-700 border border-black whitespace-nowrap bg-indigo-50/30">{procTotals.punching.toLocaleString()}</td>
                      <td className="px-4 py-4 text-right text-xs font-bold text-indigo-700 border border-black whitespace-nowrap bg-indigo-50/30">{procTotals.gluing.toLocaleString()}</td>
                      
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{p.length || "-"}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{p.breadth || "-"}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{p.height || "-"}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap font-medium text-indigo-600">{(item as any)?.lOd || item?.raw?.lOd || "-"}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap font-medium text-indigo-600">{(item as any)?.wOd || item?.raw?.wOd || "-"}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap font-medium text-indigo-600">{(item as any)?.hOd || item?.raw?.hOd || "-"}</td>

                      <td className="px-4 py-4 text-center text-xs text-black border border-black whitespace-nowrap">{p.ply || "-"}</td>
                      <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">{p.flute || "-"}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{p.l1 || (item as any)?.l1 || "-"}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{p.f1 || (item as any)?.f1 || "-"}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{p.l2 || (item as any)?.l2 || "-"}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{p.f2 || (item as any)?.f2 || "-"}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{p.l3 || (item as any)?.l3 || "-"}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap font-medium text-indigo-700">{p.gsm || "-"}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap font-black text-emerald-700">{erpLeastGsmMap.get(erp) || "-"}</td>

                      <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">{p.color1 || "-"}</td>
                      <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">{p.color2 || "-"}</td>
                      <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">{p.printingColor || "-"}</td>
                      
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{p.totalPaperWeight || "-"}</td>
                      <td className="px-4 py-4 text-right text-xs font-bold text-indigo-700 border border-black whitespace-nowrap">
                        {Number(p.realizationPerKg || 0) ? Number(p.realizationPerKg || 0).toFixed(2) : "-"}
                      </td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{(p as any).reelAsPerCalc || "-"}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{(p as any).reelActualWithTrimming || "-"}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{(p as any).cuttingWithTrimming || (item as any)?.cuttingSize || item?.raw?.cuttingSize || "-"}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{p.plannedProductionInMeter ?? "-"}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{p.sheetWeight || "-"}</td>
                      <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">{p.fluteBatches || "-"}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{Number(p.rate) ? Number(p.rate).toFixed(2) : (p.rate || "-")}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{Number(p.qty || 0) && Number(p.rate || 0) ? (Number(p.qty || 0) * Number(p.rate || 0)).toLocaleString() : "-"}</td>

                      <td className="px-4 py-4 text-right text-xs font-bold text-black border border-black whitespace-nowrap bg-indigo-50/20">{Number(p.prodFromFFG || 0).toLocaleString()}</td>
                      <td className="px-4 py-4 text-right text-xs font-bold text-emerald-700 border border-black whitespace-nowrap bg-emerald-50/30">{Number(p.actualPaperUsed || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">
                        <select
                          value={p.closeBy || ""}
                          disabled={closeFieldsDisabled}
                          onChange={(e) => {
                            const nextValue = e.target.value;
                            if (nextValue === "Yes" && !mandatoryCloseDataComplete) {
                              alert(formatJobCloseBlockedMessage(jobClosureStatusMap.get(p.id)));
                              return;
                            }
                            const today = new Date().toISOString().split("T")[0];
                            void setProductions((prev) =>
                              prev.map((row) =>
                                row.id === p.id
                                  ? {
                                      ...row,
                                      closeBy: nextValue,
                                      closeDate: nextValue === "Yes" ? row.closeDate || today : row.closeDate,
                                    }
                                  : row
                              )
                            );
                          }}
                          onBlur={(e) => void updateCloseMeta(p.id, { closeBy: e.target.value, closeDate: p.closeDate })}
                          title={closeFieldsDisabledTitle}
                          className="w-24 border border-black rounded px-2 py-1 text-xs bg-white disabled:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
                        >
                          <option value=""></option>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </select>
                      </td>
                      <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">
                        <input
                          type="date"
                          value={(p.closeDate || "").split("T")[0]}
                          disabled={closeFieldsDisabled}
                          onChange={(e) => {
                            if (p.closeBy === "Yes" && !mandatoryCloseDataComplete) {
                              alert(formatJobCloseBlockedMessage(jobClosureStatusMap.get(p.id)));
                              return;
                            }
                            void setProductions((prev) => prev.map((row) => (row.id === p.id ? { ...row, closeDate: e.target.value } : row)));
                          }}
                          onBlur={(e) => void updateCloseMeta(p.id, { closeDate: e.target.value, closeBy: p.closeBy })}
                          title={closeFieldsDisabledTitle}
                          className={`w-36 border rounded px-2 py-1 text-xs disabled:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400 ${p.closeBy === "Yes" && !p.closeDate ? "border-red-600" : "border-black"}`}
                          required={p.closeBy === "Yes"}
                        />
                      </td>
                      <td className="px-4 py-4 text-center text-xs font-medium border border-black whitespace-nowrap">
                        <div className="flex items-center justify-center gap-3">
                          <button 
                            onClick={() => navigate(`/production-processing/form?productionId=${p.id}`)}
                            title="Report Processing"
                            className="text-indigo-600 hover:text-indigo-900 transition-all p-1"
                          >
                            <ClipboardList size={16} />
                          </button>
                          {editingProductionDateId === p.id ? (
                            <>
                              <input
                                type="date"
                                value={productionDateDraft}
                                onChange={(e) => setProductionDateDraft(e.target.value)}
                                className="w-36 border border-black rounded px-2 py-1 text-xs bg-white"
                              />
                              <button
                                onClick={() => void saveProductionDate(p.id)}
                                title="Save production date"
                                className="text-slate-700 hover:text-slate-900 transition-all px-2 py-1 border border-black rounded text-[11px] font-bold bg-white"
                              >
                                Save
                              </button>
                              <button
                                onClick={cancelEditingProductionDate}
                                title="Cancel date edit"
                                className="text-slate-700 hover:text-slate-900 transition-all px-2 py-1 border border-black rounded text-[11px] font-bold bg-white"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => startEditingProductionDate(p)}
                              disabled={hasMaterialIssue(p.id)}
                              title={hasMaterialIssue(p.id) ? "Date change is blocked after Material Issue" : "Change production date"}
                              className="text-slate-700 hover:text-slate-900 transition-all px-2 py-1 border border-black rounded text-[11px] font-bold bg-white disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                            >
                              Date
                            </button>
                          )}
                          {p.status !== "Completed" && p.status !== "Cancelled" && mandatoryCloseDataComplete ? (
                            <button
                              onClick={() => handleCloseJob(p.id)}
                              title={closingId === p.id ? "Click to confirm close" : "Close job"}
                              className={`transition-all p-1 ${
                                closingId === p.id
                                  ? "text-amber-600 animate-pulse scale-110"
                                  : "text-emerald-700 hover:text-emerald-900"
                              }`}
                            >
                              <CheckCircle size={16} />
                            </button>
                          ) : null}
                          {p.status !== "Completed" && p.status !== "Cancelled" && (
                            <button 
                              onClick={() => openCancelModal(p.id)} 
                              title="Cancel job"
                              className="text-red-600 hover:text-red-900 transition-all p-1"
                            >
                              <XCircle size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
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

      {cancelTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeCancelModal}>
          <div className="w-full max-w-lg rounded border-2 border-black bg-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-black px-5 py-4">
              <h3 className="text-lg font-black uppercase tracking-tight text-black">Cancel Job</h3>
              <div className="mt-2 text-xs font-bold text-slate-600">
                Job: {cancelTarget.transactionNo} | Order: {cancelTargetOrder?.orderNo || "-"} | Item: {cancelTargetItem?.name || "Unknown"}
              </div>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div className="text-sm font-medium text-slate-700">
                This will return{" "}
                <span className="font-black text-red-700">
                  {Number(cancelTarget.qty || 0).toLocaleString()} {cancelTarget.uom || ""}
                </span>{" "}
                to Pending Production Plan.
              </div>
              <div className="space-y-1">
                <label className="text-xs font-black uppercase tracking-wider text-black">
                  Cancel Reason <span className="text-red-600">*</span>
                </label>
                <textarea
                  autoFocus
                  rows={4}
                  value={cancelRemarks}
                  onChange={(e) => {
                    setCancelRemarks(e.target.value);
                    if (cancelError) setCancelError("");
                  }}
                  className={`w-full rounded border-2 px-3 py-2 text-sm text-black outline-none ${cancelError ? "border-red-600" : "border-black"}`}
                />
                {cancelError ? <div className="text-xs font-bold text-red-600">{cancelError}</div> : null}
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-black px-5 py-4">
              <button
                onClick={closeCancelModal}
                disabled={Boolean(cancelSubmittingId)}
                className="rounded border border-black px-4 py-2 text-sm font-bold text-black hover:bg-slate-50 disabled:opacity-50"
              >
                Close
              </button>
              <button
                onClick={() => void handleCancelJob()}
                disabled={Boolean(cancelSubmittingId)}
                className="rounded border border-black bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {cancelSubmittingId === cancelTarget.id ? "Cancelling..." : "Confirm Cancel"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
