import React, { useEffect, useState, useMemo } from "react";
import { useData, getDataAuthHeaders } from "../hooks/useData";
import { loadCollection } from "../lib/collectionLoader";
import { Production, OrderSchedule, Order, Company, Firm, ProductionProcessing, Setting, LoadingSlip, LoadingSlipLine, Machine, Material, MaterialInPackingSlip, MaterialIssueReelLine, MaterialReturnReelLine } from "../types";
import { formatDate } from "../lib/serial";
import { Select } from "../components/Select";
import { ClientPagination } from "../components/ClientPagination";
import { CheckCircle, FileText, Search } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { canManageMasterRecords } from "../lib/masterPermissions";
import { PROCESSING_MACHINE_COLUMNS } from "../lib/productionProcessingSummary";
import { parseMandatoryMachinesByType } from "../lib/mandatoryMachines";
import { normalizeMachineName } from "../lib/productionMachineNames";
import { getProductionDisplayStatus } from "../lib/productionStageFilters";
import { useConfirm } from "../components/ConfirmDialog";
import { cn } from "../lib/utils";
import { useClientPagination } from "../hooks/useClientPagination";
import { SortHeader, useTableSort } from "../lib/tableSort";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { getProductionEffectiveType, getRequiredMachinesForProduction, resolveProductionProcessingRoute } from "../lib/productionType";
import { buildJobClosureStatusMap, formatJobCloseBlockedMessage } from "../lib/jobClosureValidation";
import { getProductionMatchingFields, hasProductionMatchingFieldChanges } from "../lib/productionMatching";
import { downloadJobCardPdf } from "../lib/jobCardPdf";
import { findLinkedItemByErp } from "../lib/linkedLoading";
import { resolveProductionErp, resolveProductionItem as resolveProductionCatalogItem, resolveProductionSource } from "../lib/productionErp";
import { getFirmDisplayName } from "../lib/firmDisplay";
import { normalizeProductionJobNumber } from "../lib/jobNumber";
import { isScrapLinkedProduction } from "../lib/productionOrigin";
import { useQcColumnLayout } from "../hooks/useQcColumnLayout";
import { QC_REPORT_COLUMN_COUNTS, QC_REPORT_COLUMN_SCHEMA_VERSIONS } from "../lib/qcColumnLayout";
import { matchesTableSearch, rowSearchText, searchWords } from "../lib/tableSearch";

const firstNonBlank = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return "";
};

const formatItemFilterLabel = (name: string, erp: string) => {
  if (!name) return erp;
  if (!erp || name.toLowerCase().includes(erp.toLowerCase())) return name;
  return `${name} - ${erp}`;
};
const formatDecimal = (value: unknown) => {
  if (value === null || value === undefined || String(value).trim() === "") return "-";
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return "-";
  return numberValue.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const PRODUCTION_MASTER_COLUMN_LABELS = [
  "Sr. No.", "Job No.", "Order No.", "ERP Code", "Firm", "Company", "Plan Date", "Item Name", "Sample", "Type", "Mandatory", "Planned Qty", "Remarks", "UPS", "No. of Parts", "Loaded Qty",
  "Paper", "Liner", "Warpage (Boxes)", "Warpage (Kgs)", "Delamination (Boxes)", "Delamination (Kgs)", "Misalignment (Boxes)", "Misalignment (Kgs)", "2PLY & Paper (Kgs)", "Deckel Wastage", "Sheer Cutter (Boxes)", "Sheer Cutter (Kgs)",
  "Print", "Slotting", "Delamination Printing", "Misalignment Printing", "Dry Sheets", "Warp", "Misprinting", "Job Setting", "Paste", "Stitch", "Punch", "Glue",
  "L", "B", "H", "L (OD)", "W (OD)", "H (OD)", "Ply", "Flute", "ID to OD", "ID to OD 2", "Take-up Factor", "L1", "F1", "L2", "F2", "L3", "GSM", "Least GSM",
  "Color 1", "Color 2", "Printing Color", "Total Wt", "Real/KG", "Reel (Calc)", "Cutting UPS (Plates)", "Reel Trim", "Cutting Trim", "Planned Prod (M)", "Sheet Wt", "Plate/PHP Wt", "Total Wt of Set", "Flute Batch", "Rate", "Value",
  "Production Sheet Plant", "Production FFG", "Production (M)", "Actual Paper (KG)", "Job Closer", "Close Date",
] as const;

export function ProductionMaster() {
  const confirm = useConfirm();
  const { user } = useAuth();
  const canManage = canManageMasterRecords(user?.role);
  const [productions, setProductions] = useData<Production>("productions", [], { firmScope: "all" });
  const [phpJobs] = useData<Production>("php_job_master", [], { firmScope: "all", storageKey: "php-job-master-all-firms" });
  const [plateJobs] = useData<Production>("plate_job_master", [], { firmScope: "all", storageKey: "plate-job-master-all-firms" });
  const [schedules, setSchedules] = useData<OrderSchedule>("orders_schedule", [], { firmScope: "all" });
  const [orders] = useData<Order>("orders", [], { firmScope: "all" });
  const [companies] = useData<Company>("companies", [], { firmScope: "all" });
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const [processing] = useData<ProductionProcessing>("production_processing", [], { firmScope: "all" });
  const [settings] = useData<Setting>("settings", []);
  const [loadingSlips] = useData<LoadingSlip>("loading_slips", []);
  const [machines] = useData<Machine>("machines", []);
  const [materials] = useData<Material>("materials", []);
  // Reel data is loaded only when a Job Card PDF is requested.
  const { resolveOrderItem, phpItems, plateItems, itemsBySource } = useOrderItemCatalog();
  const scheduleById = useMemo(() => new Map(schedules.map((row) => [row.id, row])), [schedules]);
  const orderById = useMemo(() => new Map(orders.map((row) => [row.id, row])), [orders]);
  const companyById = useMemo(() => new Map(companies.map((row) => [row.id, row])), [companies]);
  const productionById = useMemo(() => new Map(productions.map((row) => [row.id, row])), [productions]);
  const phpJobById = useMemo(() => new Map(phpJobs.map((row) => [String(row.id), row])), [phpJobs]);
  const plateJobById = useMemo(() => new Map(plateJobs.map((row) => [String(row.id), row])), [plateJobs]);
  const firmMap = useMemo(() => new Map(firms.map((firm) => [String(firm.id), getFirmDisplayName(firm)])), [firms]);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [firmFilter, setFirmFilter] = useState("");
  const [fromDateFilter, setFromDateFilter] = useState("");
  const [toDateFilter, setToDateFilter] = useState("");
  const [closingId, setClosingId] = useState<string | null>(null);
  const [cancelModalJobId, setCancelModalJobId] = useState<string | null>(null);
  const [cancelRemarks, setCancelRemarks] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [cancelSubmittingId, setCancelSubmittingId] = useState<string | null>(null);
  const [showColumnPanel, setShowColumnPanel] = useState(false);
  const [columnSearch, setColumnSearch] = useState("");
  const { visible: visibleColumnIndexes, status: columnSaveState, publish: publishVisibleColumns, reset: resetVisibleColumns } = useQcColumnLayout(
    "production-master",
    QC_REPORT_COLUMN_COUNTS["production-master"],
    settings[0]?.productionMasterVisibleColumns,
    canManage,
    QC_REPORT_COLUMN_SCHEMA_VERSIONS["production-master"],
  );
  const visibleDataColumnSet = useMemo(() => new Set(visibleColumnIndexes), [visibleColumnIndexes]);
  const visibleTableColumnCount = visibleColumnIndexes.length + 1;
  const hiddenTableColumnsCss = useMemo(
    () => visibleColumnIndexes.length === PRODUCTION_MASTER_COLUMN_LABELS.length
      ? ""
      : PRODUCTION_MASTER_COLUMN_LABELS
          .map((_, index) => visibleDataColumnSet.has(index) ? "" : `.production-master-table > thead > tr > th:nth-child(${index + 1}), .production-master-table > tbody > tr:not(.production-master-empty-row) > td:nth-child(${index + 1})`)
          .filter(Boolean)
          .join(",\n"),
    [visibleColumnIndexes.length, visibleDataColumnSet],
  );

  const resolveProductionItem = (production?: Production | null, order?: Order | null) => {
    if (!production) return undefined;
    const source = resolveProductionSource(production, order, itemsBySource);
    return resolveProductionCatalogItem(production, order, itemsBySource, source);
  };

  const getItemValue = (item: any, ...keys: string[]) => {
    const raw = item?.raw || item || {};
    for (const key of keys) {
      const direct = item?.[key];
      if (!(direct === null || direct === undefined || String(direct).trim() === "")) return direct;
      const nested = raw?.[key];
      if (!(nested === null || nested === undefined || String(nested).trim() === "")) return nested;
    }
    return undefined;
  };

  useEffect(() => {
    const normalizedRows = productions.map((production) => {
      const item = resolveProductionItem(production);
      const nextValues = getProductionMatchingFields(production, item);
      if (!hasProductionMatchingFieldChanges(production, nextValues)) {
        return production;
      }
      return {
        ...production,
        ...nextValues,
      };
    });

    const hasChanges = normalizedRows.some((row, index) => row !== productions[index]);
    if (!hasChanges) return;

    void setProductions(() => normalizedRows);
  }, [productions]);

  const visibleProductions = useMemo(
    () => productions.filter((production) => !isScrapLinkedProduction(production, phpJobs, plateJobs)),
    [plateJobs, phpJobs, productions]
  );

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

  const mandatoryMachinesByType = useMemo(() => parseMandatoryMachinesByType(settings[0]), [settings]);

  const processingTotalsMap = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    processing.forEach((entry) => {
      const production = productionById.get(entry.productionId);
      const item = resolveProductionItem(production);
      const machineName = normalizeMachineName(entry.machineName);
      const requiredMachines = production
        ? getRequiredMachinesForProduction(resolveProductionProcessingRoute(production, phpJobs, plateJobs), item, mandatoryMachinesByType, machines).map((name) => normalizeMachineName(name))
        : [];

      if ((machineName === "Rotary" || machineName === "Slotting") && !requiredMachines.includes(machineName)) {
        return;
      }

      const totals = map.get(entry.productionId) || { paper: 0, liner: 0, printing: 0, pasting: 0, stitching: 0, punching: 0, gluing: 0 };
      const machineColumn = PROCESSING_MACHINE_COLUMNS.find(col => (col.machineNames as readonly string[]).map((name) => normalizeMachineName(name)).includes(machineName));
      if (machineColumn) {
        totals[machineColumn.key] += Number(entry.qty || 0);
      }
      map.set(entry.productionId, totals);
    });
    return map;
  }, [processing, productionById, phpJobs, plateJobs, mandatoryMachinesByType, machines]);

  const corrugationWastageTotalsMap = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    processing.forEach((entry) => {
      if (normalizeMachineName(entry.machineName) !== "Corrugation Liner") return;
      if ((entry.completionStatus || "Full") !== "Full") return;
      const totals = map.get(entry.productionId) || {
        warpageBoxes: 0, warpageKg: 0, delaminationBoxes: 0, delaminationKg: 0,
        misalignmentBoxes: 0, misalignmentKg: 0, twoPlyPaperKg: 0, deckelWastageKg: 0,
        sheerCutterBoxes: 0, sheerCutterKg: 0,
      };
      Object.keys(totals).forEach((key) => { totals[key] += Number(entry[key as keyof ProductionProcessing] || 0); });
      map.set(entry.productionId, totals);
    });
    return map;
  }, [processing]);

  const printingWastageTotalsMap = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    processing.forEach((entry) => {
      if (normalizeMachineName(entry.machineName) !== "Printing") return;
      if ((entry.completionStatus || "Full") !== "Full") return;
      const totals = map.get(entry.productionId) || {
        slotting: 0, delaminationPrinting: 0, misalignmentPrinting: 0,
        drySheets: 0, warp: 0, misprinting: 0, jobSetting: 0,
      };
      Object.keys(totals).forEach((key) => { totals[key] += Number(entry[key as keyof ProductionProcessing] || 0); });
      map.set(entry.productionId, totals);
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

  const jobClosureStatusMap = useMemo(() => {
    return buildJobClosureStatusMap({
      productions: visibleProductions.map((production) => resolveProductionProcessingRoute(production, phpJobs, plateJobs)),
      processing,
      mandatoryMachinesByType,
      machines,
      resolveProductionItem,
    });
  }, [visibleProductions, phpJobs, plateJobs, processing, mandatoryMachinesByType, machines, itemsBySource]);
  const erpLeastGsmMap = useMemo(() => {
    const map = new Map<string, number>();
    visibleProductions.forEach(p => {
      // Skip canceled jobs for least cost calculation
      if (p.status === "Cancelled" || p.cancelTimestamp) return;
      
      const erp = String(p.erpCode || "").trim();
      const gsm = Number(p.gsm || 0);
      if (erp && gsm > 0) {
        if (!map.has(erp) || gsm < map.get(erp)!) {
          map.set(erp, gsm);
        }
      }
    });
    Object.values(itemsBySource).flat().forEach((item: any) => {
      const erp = String(item?.erp || "").trim();
      const gsm = Number(item?.gsmLeastCost || 0);
      if (erp && gsm > 0) map.set(erp, gsm);
    });
    return map;
  }, [itemsBySource, visibleProductions]);

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

  const productionFilterRows = useMemo(() => {
    return visibleProductions.map((production) => {
      const schedule = production.scheduleId ? scheduleById.get(production.scheduleId) : undefined;
      const order = (schedule?.orderId ? orderById.get(schedule.orderId) : undefined) || orderById.get(String((production as Production & { orderId?: string }).orderId || ""));
      const item = resolveProductionItem(production, order) || resolveOrderItem(order);
      const company = order?.companyId ? companyById.get(order.companyId) : undefined;
      const itemName = String(item?.name || "").trim();
      const itemErp = resolveProductionErp(production, order, item);
      const fallbackErps = [production.erpCode, production.masterErp, order?.erpCode, item?.erp]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean);
      const companyName = String(company?.name || production.companyName || "").trim();
      const firmId = String(schedule?.firmId || production.firmId || production.orderFirmId || order?.firmId || "").trim();
      const firmName = firmId ? (firmMap.get(firmId) || "Unknown firm") : "Unassigned";
      const itemKey = itemName || itemErp ? `${itemName}::${itemErp}` : "";

      return {
        production,
        itemName,
        itemErp,
        itemKey,
        companyName,
        firmName,
        firmId,
        fallbackErps,
      };
    });
  }, [visibleProductions, scheduleById, orderById, companyById, firmMap, resolveOrderItem]);

  const companyOptions = useMemo(() => {
    const names = Array.from(new Set(productionFilterRows.map((row) => row.companyName).filter(Boolean)));
    return names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })).map((name) => ({ value: name, label: name }));
  }, [productionFilterRows]);

  const firmOptions = useMemo(() => {
    const map = new Map<string, string>();
    productionFilterRows.forEach((row) => { if (row.firmId && !map.has(row.firmId)) map.set(row.firmId, row.firmName); });
    return Array.from(map, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [productionFilterRows]);

  const itemOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; searchText: string }>();
    productionFilterRows.forEach((row) => {
      if (!row.itemKey || map.has(row.itemKey)) return;
      map.set(row.itemKey, {
        value: row.itemKey,
        label: formatItemFilterLabel(row.itemName, row.itemErp),
        searchText: `${row.itemName} ${row.itemErp} ${row.fallbackErps.join(" ")}`,
      });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [productionFilterRows]);

  // Values of the table's columns, in PRODUCTION_MASTER_COLUMN_LABELS order, as
  // the desktop table cells show them. Sr. No., Job Closer and Close Date
  // (row position / editable inputs) are not searched.
  const getTableColumnValues = (p: Production): unknown[] => {
    const schedule = p.scheduleId ? scheduleById.get(p.scheduleId) : undefined;
    const order = (schedule?.orderId ? orderById.get(schedule.orderId) : undefined) || orderById.get(String((p as Production & { orderId?: string }).orderId || ""));
    const company = order?.companyId ? companyById.get(order.companyId) : undefined;
    const item = resolveProductionItem(p, order);
    const normalizedFields = getProductionMatchingFields(p, item);
    const displayRow = { ...p, ...normalizedFields, erpCode: resolveProductionErp(p, order, item) };
    const closureStatus = jobClosureStatusMap.get(p.id);
    const mandatory = { required: closureStatus?.required || [], done: closureStatus?.done || 0, missing: closureStatus?.missing || [] };
    const erp = String(displayRow.erpCode || "").trim();
    const procTotals = processingTotalsMap.get(p.id) || { paper: 0, liner: 0, printing: 0, pasting: 0, stitching: 0, punching: 0, gluing: 0 };
    const wastageTotals = corrugationWastageTotalsMap.get(p.id) || {
      warpageBoxes: 0, warpageKg: 0, delaminationBoxes: 0, delaminationKg: 0,
      misalignmentBoxes: 0, misalignmentKg: 0, twoPlyPaperKg: 0, deckelWastageKg: 0,
      sheerCutterBoxes: 0, sheerCutterKg: 0,
    };
    const printingWastageTotals = printingWastageTotalsMap.get(p.id) || {
      slotting: 0, delaminationPrinting: 0, misalignmentPrinting: 0,
      drySheets: 0, warp: 0, misprinting: 0, jobSetting: 0,
    };
    const firmId = String(schedule?.firmId || p.firmId || p.orderFirmId || order?.firmId || "").trim();
    return [
      "", // Sr. No.
      normalizeProductionJobNumber(p.transactionNo),
      order?.orderNo || (p as Production & { orderNo?: string }).orderNo,
      displayRow.erpCode,
      firmMap.get(firmId) || (schedule?.firmId || p.firmId || p.orderFirmId || order?.firmId ? "Unknown firm" : "Unassigned"),
      company?.name || displayRow.companyName,
      p.date,
      item?.name || "Unknown",
      getItemValue(item, "isSample") ? "Yes" : "",
      getProductionEffectiveType(p, item),
      mandatory.required.length === 0
        ? ""
        : mandatory.missing.length === 0
          ? `Done ${mandatory.done}/${mandatory.required.length}`
          : `Pending ${mandatory.done}/${mandatory.required.length} Missing: ${mandatory.missing.join(", ")}`,
      [formatDecimal(p.qty), `${formatDecimal(p.qty)} ${p.uom || ""}`],
      p.remarks,
      formatDecimal(firstNonBlank(p.ups, getItemValue(item, "ups"))),
      formatDecimal(p.noOfParts),
      formatDecimal(loadedQtyByProductionId.get(p.id) || 0),
      formatDecimal(procTotals.paper),
      formatDecimal(procTotals.liner),
      formatDecimal(wastageTotals.warpageBoxes), formatDecimal(wastageTotals.warpageKg),
      formatDecimal(wastageTotals.delaminationBoxes), formatDecimal(wastageTotals.delaminationKg),
      formatDecimal(wastageTotals.misalignmentBoxes), formatDecimal(wastageTotals.misalignmentKg),
      formatDecimal(wastageTotals.twoPlyPaperKg), formatDecimal(wastageTotals.deckelWastageKg),
      formatDecimal(wastageTotals.sheerCutterBoxes), formatDecimal(wastageTotals.sheerCutterKg),
      formatDecimal(procTotals.printing),
      formatDecimal(printingWastageTotals.slotting), formatDecimal(printingWastageTotals.delaminationPrinting),
      formatDecimal(printingWastageTotals.misalignmentPrinting), formatDecimal(printingWastageTotals.drySheets),
      formatDecimal(printingWastageTotals.warp), formatDecimal(printingWastageTotals.misprinting),
      formatDecimal(printingWastageTotals.jobSetting),
      formatDecimal(procTotals.pasting),
      formatDecimal(procTotals.stitching),
      formatDecimal(procTotals.punching),
      formatDecimal(procTotals.gluing),
      formatDecimal(displayRow.length),
      formatDecimal(displayRow.breadth),
      formatDecimal(displayRow.height),
      formatDecimal(getItemValue(item, "lOd")),
      formatDecimal(getItemValue(item, "wOd")),
      formatDecimal(getItemValue(item, "hOd")),
      formatDecimal(displayRow.ply),
      displayRow.flute || displayRow.fluteType,
      formatDecimal(p.idToOd),
      formatDecimal(p.idToOd2),
      formatDecimal(p.takeUpFactor),
      formatDecimal(firstNonBlank(displayRow.l1, (item as any)?.l1)),
      formatDecimal(firstNonBlank(displayRow.f1, (item as any)?.f1)),
      formatDecimal(firstNonBlank(displayRow.l2, (item as any)?.l2)),
      formatDecimal(firstNonBlank(displayRow.f2, (item as any)?.f2)),
      formatDecimal(firstNonBlank(displayRow.l3, (item as any)?.l3)),
      formatDecimal(firstNonBlank(displayRow.gsm, displayRow.boardGsmReq)),
      formatDecimal(erpLeastGsmMap.get(erp)),
      p.color1,
      p.color2,
      displayRow.printingColor,
      formatDecimal(p.totalPaperWeight),
      formatDecimal(p.realizationPerKg),
      formatDecimal((p as any).reelAsPerCalc),
      formatDecimal(p.noOfUpsInCuttingForPlates),
      formatDecimal((p as any).reelActualWithTrimming),
      formatDecimal(firstNonBlank((p as any).cuttingWithTrimming, getItemValue(item, "cuttingSize"))),
      formatDecimal(p.plannedProductionInMeter),
      formatDecimal(p.sheetWeight),
      formatDecimal(p.plateWeight),
      formatDecimal(p.totalWeightOfSet),
      p.fluteBatches,
      formatDecimal(p.rate),
      formatDecimal(Number(p.qty || 0) * Number(p.rate || 0)),
      formatDecimal(p.prodFromSheetPlant),
      formatDecimal(p.prodFromFFG || 0),
      formatDecimal(p.productionInMeter),
      formatDecimal(p.actualPaperUsed || 0),
      "", // Job Closer (editable)
      "", // Close Date (editable)
    ];
  };

  // Search text of each row from the columns currently shown (Hide Columns).
  const tableSearchTextById = useMemo(() => {
    const map = new Map<string, string>();
    if (!searchWords(searchTerm).length) return map;
    productionFilterRows.forEach(({ production }) => {
      const values = getTableColumnValues(production)
        .filter((_, index) => visibleDataColumnSet.has(index))
        .map((value) => (value === "-" ? "" : value));
      map.set(production.id, rowSearchText(values));
    });
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productionFilterRows, visibleDataColumnSet, Boolean(searchWords(searchTerm).length), scheduleById, orderById, companyById, firmMap, itemsBySource, processingTotalsMap, corrugationWastageTotalsMap, printingWastageTotalsMap, loadedQtyByProductionId, erpLeastGsmMap, jobClosureStatusMap]);

  const filteredList = useMemo(() => {
    const words = searchWords(searchTerm);
    return productionFilterRows
      .filter((row) => {
        if (companyFilter && row.companyName !== companyFilter) return false;
        if (firmFilter && row.firmId !== firmFilter) return false;
        if (itemFilter && row.itemKey !== itemFilter) return false;
        const planDate = String(row.production.date || "").slice(0, 10);
        if (fromDateFilter && (!planDate || planDate < fromDateFilter)) return false;
        if (toDateFilter && (!planDate || planDate > toDateFilter)) return false;
        return matchesTableSearch(tableSearchTextById.get(row.production.id) || "", words);
      })
      .map((row) => row.production)
      .sort((a, b) => b.transactionNo.localeCompare(a.transactionNo, undefined, { numeric: true, sensitivity: 'base' }));
  }, [companyFilter, firmFilter, itemFilter, fromDateFilter, toDateFilter, productionFilterRows, searchTerm, tableSearchTextById]);
  // Sort keys are column positions (same order as PRODUCTION_MASTER_COLUMN_LABELS),
  // so each column sorts by the value it shows.
  const { sorted: sortedList, sort, toggle: toggleSort } = useTableSort(filteredList, (p, key) => {
    const value = getTableColumnValues(p)[Number(key)];
    return Array.isArray(value) ? value[0] : value;
  }, [scheduleById, orderById, companyById, firmMap, itemsBySource, processingTotalsMap, corrugationWastageTotalsMap, printingWastageTotalsMap, loadedQtyByProductionId, erpLeastGsmMap, jobClosureStatusMap]);
  const columnSortKey = (label: string) => String(PRODUCTION_MASTER_COLUMN_LABELS.indexOf(label as typeof PRODUCTION_MASTER_COLUMN_LABELS[number]));
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

  const getProcessingSummary = (pId: string) => {
    const records = processing.filter(p => p.productionId === pId);
    if (records.length === 0) return "Pending";
    const machines = Array.from(new Set(records.map(r => r.machineName))).join(", ");
    const totalQty = records.reduce((sum, r) => sum + r.qty, 0);
    return `${machines} (${totalQty})`;
  };

  const handleDownloadJobCard = async (production: Production) => {
    try {
      const schedule = production.scheduleId ? scheduleById.get(production.scheduleId) || null : null;
      const order = schedule?.orderId ? orderById.get(schedule.orderId) || null : null;
      const company = order?.companyId ? companyById.get(order.companyId) || null : null;
      const item = resolveProductionItem(production, order) || null;
      const itemErp = resolveProductionErp(production, order, item);
      const phpItem = itemErp ? findLinkedItemByErp(phpItems, itemErp) || null : null;
      const plateItem = itemErp ? findLinkedItemByErp(plateItems, itemErp) || null : null;
      const loadAll = <T extends { id: string }>(endpoint: string) =>
        loadCollection<T>(endpoint, getDataAuthHeaders(true), "page", () => {}).promise;
      const [packingSlips, issueReelLines, returnReelLines] = await Promise.all([
        loadAll<MaterialInPackingSlip>("/api/material-in-packing-slips"),
        loadAll<MaterialIssueReelLine>("/api/material-issue-reel-lines"),
        loadAll<MaterialReturnReelLine>("/api/material-return-reel-lines"),
      ]);
      await downloadJobCardPdf({
        production,
        schedule,
        order,
        company,
        item,
        itemErp,
        phpItem,
        plateItem,
        materials,
        packingSlips,
        issueReelLines,
        returnReelLines,
        processingEntries: processing,
        setting: settings[0] || null,
        createdBy: user?.name || user?.email || "System User",
      });
    } catch (error) {
      console.error("Failed to generate Job Card PDF:", error);
      alert("Failed to generate Job Card PDF.");
    }
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
  const cancelTargetSchedule = cancelTarget?.scheduleId ? scheduleById.get(cancelTarget.scheduleId) : null;
  const cancelTargetOrder = cancelTargetSchedule?.orderId ? orderById.get(cancelTargetSchedule.orderId) : null;
  const cancelTargetItem = cancelTarget ? resolveProductionItem(cancelTarget) || null : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">Production Master</h2>
        {canManage ? (
          <button
            type="button"
            onClick={() => setShowColumnPanel((value) => !value)}
            className="hidden rounded border border-black bg-white px-3 py-2 text-sm font-bold text-black hover:bg-slate-50 md:inline-block"
          >
            Hide Columns
          </button>
        ) : null}
      </div>
      {canManage && showColumnPanel ? (
        <div className="rounded border-2 border-black bg-slate-50 p-3">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <label className="min-w-60 flex-1 text-xs font-bold" htmlFor="production-master-column-search">
              Search columns
              <input
                id="production-master-column-search"
                aria-label="Search Production Master columns"
                value={columnSearch}
                onChange={(event) => setColumnSearch(event.target.value)}
                placeholder="Search column names"
                className="mt-1 h-[34px] w-full rounded border-2 border-black bg-white px-2 text-sm font-normal"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => publishVisibleColumns(PRODUCTION_MASTER_COLUMN_LABELS.map((_, index) => index))} className="rounded border border-black bg-white px-2 py-1 text-xs font-bold">Show All</button>
              <button type="button" onClick={resetVisibleColumns} className="rounded border border-black bg-white px-2 py-1 text-xs font-bold">Reset</button>
              {columnSaveState ? <span className="text-xs font-bold">{columnSaveState}</span> : null}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
            {PRODUCTION_MASTER_COLUMN_LABELS
              .map((label, index) => ({ label, index }))
              .filter(({ label }) => label.toLowerCase().includes(columnSearch.trim().toLowerCase()))
              .map(({ label, index }) => (
                <label key={label} className="flex items-center gap-2 rounded border border-slate-300 bg-white px-2 py-1 text-xs">
                  <input
                    type="checkbox"
                    checked={visibleDataColumnSet.has(index)}
                    onChange={() => publishVisibleColumns(visibleDataColumnSet.has(index) ? visibleColumnIndexes.filter((value) => value !== index) : [...visibleColumnIndexes, index].sort((a, b) => a - b))}
                  />
                  {label}
                </label>
              ))}
          </div>
          {columnSearch.trim() && !PRODUCTION_MASTER_COLUMN_LABELS.some((label) => label.toLowerCase().includes(columnSearch.trim().toLowerCase())) ? <p className="mt-2 text-sm font-semibold text-slate-600">No columns match your search.</p> : null}
        </div>
      ) : null}
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
      {hiddenTableColumnsCss ? <style>{hiddenTableColumnsCss + " { display: none; }"}</style> : null}
      <div className="space-y-2">
        {/* Mobile View - Cards */}
        <div className="block md:hidden space-y-4 p-2">
            {paginatedList.map((p) => {
                const schedule = p.scheduleId ? scheduleById.get(p.scheduleId) : undefined;
                const order = schedule?.orderId ? orderById.get(schedule.orderId) : undefined;
                const company = order?.companyId ? companyById.get(order.companyId) : undefined;
                const item = resolveProductionItem(p);
                const normalizedFields = getProductionMatchingFields(p, item);
                const displayRow = { ...p, ...normalizedFields };
                const erp = String(displayRow.erpCode || "").trim();
                const leastGsm = erpLeastGsmMap.get(erp);
                const isHighGsm = displayRow.gsm && leastGsm && Number(displayRow.gsm) > Number(leastGsm);
                const procTotals = processingTotalsMap.get(p.id) || { paper: 0, liner: 0, printing: 0, pasting: 0, stitching: 0, punching: 0, gluing: 0 };
                  const closureStatus = jobClosureStatusMap.get(p.id);
                  const mandatoryCloseDataComplete = closureStatus?.canClose === true;
                const mandatory = getMandatoryStatus(p, item);
                const displayStatus = getProductionDisplayStatus(p);
                
                return (
                  <div key={p.id} className={`${isHighGsm ? "bg-amber-50" : "bg-white"} border-2 border-black p-4 space-y-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rounded relative`}>
                       <div className="flex justify-between items-center">
                          <div className="font-bold text-sm">Job: {normalizeProductionJobNumber(p.transactionNo)}</div>
                      </div>
	                      <div className="text-xs text-slate-500">Prod Date: {formatDate(p.date)}</div>
	                      {displayStatus === "Completed" ? (
	                        <div className="text-xs text-slate-500">
	                          Closed: {formatDate(p.closeDate || p.tallyTimestamp || p.updateTimestamp || "") || "-"}
	                        </div>
	                      ) : null}
	                      {order && (
	                        <>
	                          <div className="text-xs font-bold text-slate-700">Order: {order.orderNo} ({formatDate(order.orderDate)})</div>
                          <div className="text-xs font-bold text-slate-700">ERP Code: {displayRow.erpCode || "-"}</div>
                          <div className="text-xs font-bold text-slate-700">Company: {company?.name || displayRow.companyName || "Unknown"}</div>
                        </>
                      )}
                      <div className="text-sm font-bold">{item?.name || "Unknown"}</div>
                      <div className="text-[10px] text-slate-600 uppercase font-black">
                        Type: {getProductionEffectiveType(p, item) || "-"} | Print: {displayRow.printingColor || "-"}
                      </div>
                      <div className="text-[10px] text-slate-600 uppercase font-bold">
                        OD: {formatDecimal(getItemValue(item, "lOd"))} × {formatDecimal(getItemValue(item, "wOd"))} × {formatDecimal(getItemValue(item, "hOd"))}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded border border-slate-300 bg-slate-50 px-2 py-1.5">
                          <div className="text-[10px] font-black uppercase text-slate-500">Plan Qty</div>
                          <div className="text-sm font-black tabular-nums">{formatDecimal(p.qty)} {p.uom}</div>
                        </div>
                        <div className="rounded border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-indigo-800">
                          <div className="text-[10px] font-black uppercase">Production FFG</div>
                          <div className="text-sm font-black tabular-nums">{formatDecimal(p.prodFromFFG || 0)}</div>
                        </div>
                        <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-800">
                          <div className="text-[10px] font-black uppercase">Loaded</div>
                          <div className="text-sm font-black tabular-nums">{formatDecimal(loadedQtyByProductionId.get(p.id) || 0)}</div>
                        </div>
                        <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-emerald-800">
                          <div className="text-[10px] font-black uppercase">Actual Paper</div>
                          <div className="text-sm font-black tabular-nums">{formatDecimal(p.actualPaperUsed || 0)} KG</div>
                        </div>
                        {p.gsm || leastGsm ? (
                          <div className="col-span-2 flex items-center justify-between rounded border border-slate-300 px-2 py-1.5">
                            <span className="font-black text-indigo-700">GSM: {p.gsm || "-"}</span>
                            {leastGsm ? <span className="font-black text-emerald-700">Least: {leastGsm}</span> : null}
                          </div>
                        ) : null}
                        <div className="col-span-2 rounded border border-slate-300 px-2 py-1.5 text-[11px] font-bold leading-5 text-slate-700">
                          Paper {formatDecimal(procTotals.paper)} · Liner {formatDecimal(procTotals.liner)} · Print {formatDecimal(procTotals.printing)} · Paste {formatDecimal(procTotals.pasting)} · Stitch {formatDecimal(procTotals.stitching)} · Punch {formatDecimal(procTotals.punching)} · Glue {formatDecimal(procTotals.gluing)}
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
                      {p.status === 'Cancelled' && p.cancelRemarks && (
                        <div className="text-xs bg-red-50 text-red-700 p-2 border border-red-200 rounded font-medium mt-1">
                          Cancel Reason: {p.cancelRemarks}
                        </div>
                      )}
                       <div className="flex gap-2 mt-2">
                       <button
                          type="button"
                          onClick={() => void handleDownloadJobCard(p)}
                          className="flex-1 bg-white text-black font-bold inline-flex items-center justify-center p-2 border border-black text-xs hover:bg-slate-50"
                        >
                          <FileText size={14} className="mr-1" /> Job Card
                        </button>
                        {canManage && p.status !== "Completed" && p.status !== "Cancelled" && mandatoryCloseDataComplete ? (
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
                        {canManage && p.status !== "Completed" && p.status !== "Cancelled" && (
                          <button 
                            onClick={() => openCancelModal(p.id)} 
                            title="Cancel job"
                            className="inline-flex items-center justify-center whitespace-nowrap rounded border border-red-700 bg-red-600 px-3 py-1.5 text-xs font-black text-white transition hover:bg-red-700"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                  </div>
                );
            })}
        </div>
        <div className="hidden overflow-x-auto rounded border border-black bg-white md:block">
          <table className="production-master-table min-w-max w-full divide-y divide-black border-collapse border border-black">
            <thead className="bg-slate-100 divide-x divide-black">
              <tr className="divide-x divide-black">
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap">Sr. No.</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Job No." sortKey="1" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Order No." sortKey="2" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="ERP Code" sortKey="3" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Firm" sortKey="4" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Company" sortKey="5" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Plan Date" sortKey="6" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Item Name" sortKey="7" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Sample" sortKey="8" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Type" sortKey="9" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Mandatory" sortKey="10" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Planned Qty" sortKey="11" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Remarks" sortKey="12" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-center text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="UPS" sortKey="13" sort={sort} onToggle={toggleSort} align="center" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="No. of Parts" sortKey="14" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap bg-amber-50"><SortHeader label="Loaded Qty" sortKey="15" sort={sort} onToggle={toggleSort} align="right" /></th>

                <th className="px-4 py-3 text-right text-xs font-bold text-indigo-900 uppercase border border-black whitespace-nowrap bg-indigo-50"><SortHeader label="Paper" sortKey="16" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-indigo-900 uppercase border border-black whitespace-nowrap bg-indigo-50"><SortHeader label="Liner" sortKey="17" sort={sort} onToggle={toggleSort} align="right" /></th>
                {[
                  "Warpage (Boxes)", "Warpage (Kgs)", "Delamination (Boxes)", "Delamination (Kgs)",
                  "Misalignment (Boxes)", "Misalignment (Kgs)", "2PLY & Paper (Kgs)", "Deckel Wastage",
                  "Sheer Cutter (Boxes)", "Sheer Cutter (Kgs)",
                ].map((label) => <th key={label} className="px-4 py-3 text-right text-xs font-bold text-rose-900 uppercase border border-black whitespace-nowrap bg-rose-50"><SortHeader label={label} sortKey={columnSortKey(label)} sort={sort} onToggle={toggleSort} align="right" /></th>)}
                <th className="px-4 py-3 text-right text-xs font-bold text-indigo-900 uppercase border border-black whitespace-nowrap bg-indigo-50"><SortHeader label="Print" sortKey="28" sort={sort} onToggle={toggleSort} align="right" /></th>
                {["Slotting", "Delamination Printing", "Misalignment Printing", "Dry Sheets", "Warp", "Misprinting", "Job Setting"].map((label) => (
                  <th key={label} className="px-4 py-3 text-right text-xs font-bold text-violet-900 uppercase border border-black whitespace-nowrap bg-violet-50"><SortHeader label={label} sortKey={columnSortKey(label)} sort={sort} onToggle={toggleSort} align="right" /></th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-bold text-indigo-900 uppercase border border-black whitespace-nowrap bg-indigo-50"><SortHeader label="Paste" sortKey="36" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-indigo-900 uppercase border border-black whitespace-nowrap bg-indigo-50"><SortHeader label="Stitch" sortKey="37" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-indigo-900 uppercase border border-black whitespace-nowrap bg-indigo-50"><SortHeader label="Punch" sortKey="38" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-indigo-900 uppercase border border-black whitespace-nowrap bg-indigo-50"><SortHeader label="Glue" sortKey="39" sort={sort} onToggle={toggleSort} align="right" /></th>
                
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="L" sortKey="40" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="B" sortKey="41" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="H" sortKey="42" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="L (OD)" sortKey="43" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="W (OD)" sortKey="44" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="H (OD)" sortKey="45" sort={sort} onToggle={toggleSort} align="right" /></th>
                
                <th className="px-4 py-3 text-center text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Ply" sortKey="46" sort={sort} onToggle={toggleSort} align="center" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Flute" sortKey="47" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="ID to OD" sortKey="48" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="ID to OD 2" sortKey="49" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Take-up Factor" sortKey="50" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="L1" sortKey="51" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="F1" sortKey="52" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="L2" sortKey="53" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="F2" sortKey="54" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="L3" sortKey="55" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="GSM" sortKey="56" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Least GSM" sortKey="57" sort={sort} onToggle={toggleSort} align="right" /></th>

                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Color 1" sortKey="58" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Color 2" sortKey="59" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Printing Color" sortKey="60" sort={sort} onToggle={toggleSort} align="left" /></th>
                
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Total Wt" sortKey="61" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Real/KG" sortKey="62" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Reel (Calc)" sortKey="63" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Cutting UPS (Plates)" sortKey="64" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Reel Trim" sortKey="65" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Cutting Trim" sortKey="66" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Planned Prod (M)" sortKey="67" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Sheet Wt" sortKey="68" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Plate/PHP Wt" sortKey="69" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Total Wt of Set" sortKey="70" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Flute Batch" sortKey="71" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Rate" sortKey="72" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Value" sortKey="73" sort={sort} onToggle={toggleSort} align="right" /></th>
                
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap bg-indigo-50/50"><SortHeader label="Production Sheet Plant" sortKey="74" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap bg-indigo-50/50"><SortHeader label="Production FFG" sortKey="75" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-black uppercase border border-black whitespace-nowrap"><SortHeader label="Production (M)" sortKey="76" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold text-emerald-900 uppercase border border-black whitespace-nowrap bg-emerald-50"><SortHeader label="Actual Paper (KG)" sortKey="77" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap">Job Closer</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-black uppercase border border-black whitespace-nowrap">Close Date</th>
                <th className="min-w-[150px] px-4 py-3 text-center text-xs font-bold text-black uppercase border border-black whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black bg-white">
              {filteredList.length === 0 ? (
                <tr className="production-master-empty-row">
                  <td colSpan={visibleTableColumnCount} className="h-16" aria-label="No records" />
                </tr>
              ) : (
                paginatedList.map((p, idx) => {
                  const srNo = (page - 1) * pageSize + idx + 1;
                  const schedule = p.scheduleId ? scheduleById.get(p.scheduleId) : undefined;
                  const order = (schedule?.orderId ? orderById.get(schedule.orderId) : undefined) || orderById.get(String((p as Production & { orderId?: string }).orderId || ""));
                  const company = order?.companyId ? companyById.get(order.companyId) : undefined;
                  const item = resolveProductionItem(p, order);
                  const normalizedFields = getProductionMatchingFields(p, item);
                  const displayRow = { ...p, ...normalizedFields, erpCode: resolveProductionErp(p, order, item) };
                  const mandatory = getMandatoryStatus(p, item);
                  const erp = String(displayRow.erpCode || "").trim();
                  const leastGsm = erpLeastGsmMap.get(erp);
                  const isHighGsm = displayRow.gsm && leastGsm && Number(displayRow.gsm) > Number(leastGsm);
                  const procTotals = processingTotalsMap.get(p.id) || { paper: 0, liner: 0, printing: 0, pasting: 0, stitching: 0, punching: 0, gluing: 0 };
                  const wastageTotals = corrugationWastageTotalsMap.get(p.id) || {
                    warpageBoxes: 0, warpageKg: 0, delaminationBoxes: 0, delaminationKg: 0,
                    misalignmentBoxes: 0, misalignmentKg: 0, twoPlyPaperKg: 0, deckelWastageKg: 0,
                    sheerCutterBoxes: 0, sheerCutterKg: 0,
                  };
                  const printingWastageTotals = printingWastageTotalsMap.get(p.id) || {
                    slotting: 0, delaminationPrinting: 0, misalignmentPrinting: 0,
                    drySheets: 0, warp: 0, misprinting: 0, jobSetting: 0,
                  };
                  const closureStatus = jobClosureStatusMap.get(p.id);
                  const mandatoryCloseDataComplete = closureStatus?.canClose === true;
                  const baseCloseFieldsDisabled = !Number(p.actualPaperUsed || 0) || !Number(p.prodFromFFG || 0);
                  const closeFieldsDisabled = baseCloseFieldsDisabled || !mandatoryCloseDataComplete;
                  const closeFieldsDisabledTitle = !mandatoryCloseDataComplete
                    ? "Complete all mandatory machine processing data to enable job closer"
                    : baseCloseFieldsDisabled
                      ? "Actual Paper and Production FFG are required to enable job closer"
                      : undefined;
                  const isPaperOutOfRange = false;
                  const isLinerOutOfRange = false;
                  
                    return (
                    <tr key={p.id} className={`${isHighGsm ? "bg-amber-50" : "hover:bg-slate-50"} divide-x divide-black transition-colors`}>
                      <td className="px-4 py-4 text-xs font-bold text-black border border-black whitespace-nowrap">{srNo}</td>
                      <td className="px-4 py-4 text-xs font-bold text-black border border-black whitespace-nowrap">{normalizeProductionJobNumber(p.transactionNo)}</td>
                      <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">{order?.orderNo || (p as Production & { orderNo?: string }).orderNo || "-"}</td>
                      <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">{displayRow.erpCode || "-"}</td>
                      <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">{firmMap.get(String(schedule?.firmId || p.firmId || p.orderFirmId || order?.firmId || "").trim()) || (schedule?.firmId || p.firmId || p.orderFirmId || order?.firmId ? "Unknown firm" : "Unassigned")}</td>
                      <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">{company?.name || displayRow.companyName || "-"}</td>
                      <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">{formatDate(p.date)}</td>
                      <td className="px-4 py-4 text-xs text-black border border-black min-w-[150px]">{item?.name || "Unknown"}</td>
                      <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">{getItemValue(item, "isSample") ? "Yes" : "-"}</td>
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
                      <td className="px-4 py-4 text-right text-xs font-medium text-emerald-700 border border-black whitespace-nowrap">{formatDecimal(p.qty)} {p.uom}</td>
                      <td className="px-4 py-4 text-xs text-black border border-black min-w-[180px]">{p.remarks || "-"}</td>
                      <td className="px-4 py-4 text-center text-xs font-medium text-black border border-black whitespace-nowrap">{formatDecimal(firstNonBlank(p.ups, getItemValue(item, "ups")))}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{formatDecimal(p.noOfParts)}</td>
                      <td className="px-4 py-4 text-right text-xs font-bold text-amber-700 border border-black whitespace-nowrap bg-amber-50/40">
                        {formatDecimal(loadedQtyByProductionId.get(p.id) || 0)}
                      </td>

                      <td
                        className={cn(
                          "px-4 py-4 text-right text-xs font-bold border border-black whitespace-nowrap",
                          isPaperOutOfRange ? "bg-red-100 text-red-700" : "bg-indigo-50/30 text-indigo-700"
                        )}
                      >
                        {formatDecimal(procTotals.paper)}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-4 text-right text-xs font-bold border border-black whitespace-nowrap",
                          isLinerOutOfRange ? "bg-red-100 text-red-700" : "bg-indigo-50/30 text-indigo-700"
                        )}
                      >
                        {formatDecimal(procTotals.liner)}
                      </td>
                      {[
                        wastageTotals.warpageBoxes, wastageTotals.warpageKg,
                        wastageTotals.delaminationBoxes, wastageTotals.delaminationKg,
                        wastageTotals.misalignmentBoxes, wastageTotals.misalignmentKg,
                        wastageTotals.twoPlyPaperKg, wastageTotals.deckelWastageKg,
                        wastageTotals.sheerCutterBoxes, wastageTotals.sheerCutterKg,
                      ].map((value, wastageIndex) => (
                        <td key={wastageIndex} className="px-4 py-4 text-right text-xs font-bold text-rose-800 border border-black whitespace-nowrap bg-rose-50/40">{formatDecimal(value)}</td>
                      ))}
                      <td className="px-4 py-4 text-right text-xs font-bold text-indigo-700 border border-black whitespace-nowrap bg-indigo-50/30">{formatDecimal(procTotals.printing)}</td>
                      {[
                        printingWastageTotals.slotting, printingWastageTotals.delaminationPrinting,
                        printingWastageTotals.misalignmentPrinting, printingWastageTotals.drySheets,
                        printingWastageTotals.warp, printingWastageTotals.misprinting,
                        printingWastageTotals.jobSetting,
                      ].map((value, printingWastageIndex) => (
                        <td key={printingWastageIndex} className="px-4 py-4 text-right text-xs font-bold text-violet-800 border border-black whitespace-nowrap bg-violet-50/40">{formatDecimal(value)}</td>
                      ))}
                      <td className="px-4 py-4 text-right text-xs font-bold text-indigo-700 border border-black whitespace-nowrap bg-indigo-50/30">{formatDecimal(procTotals.pasting)}</td>
                      <td className="px-4 py-4 text-right text-xs font-bold text-indigo-700 border border-black whitespace-nowrap bg-indigo-50/30">{formatDecimal(procTotals.stitching)}</td>
                      <td className="px-4 py-4 text-right text-xs font-bold text-indigo-700 border border-black whitespace-nowrap bg-indigo-50/30">{formatDecimal(procTotals.punching)}</td>
                      <td className="px-4 py-4 text-right text-xs font-bold text-indigo-700 border border-black whitespace-nowrap bg-indigo-50/30">{formatDecimal(procTotals.gluing)}</td>
                      
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{formatDecimal(displayRow.length)}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{formatDecimal(displayRow.breadth)}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{formatDecimal(displayRow.height)}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap font-medium text-indigo-600">{formatDecimal(getItemValue(item, "lOd"))}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap font-medium text-indigo-600">{formatDecimal(getItemValue(item, "wOd"))}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap font-medium text-indigo-600">{formatDecimal(getItemValue(item, "hOd"))}</td>

                      <td className="px-4 py-4 text-center text-xs text-black border border-black whitespace-nowrap">{formatDecimal(displayRow.ply)}</td>
                      <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">{displayRow.flute || displayRow.fluteType || "-"}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{formatDecimal(p.idToOd)}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{formatDecimal(p.idToOd2)}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{formatDecimal(p.takeUpFactor)}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{formatDecimal(firstNonBlank(displayRow.l1, (item as any)?.l1))}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{formatDecimal(firstNonBlank(displayRow.f1, (item as any)?.f1))}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{formatDecimal(firstNonBlank(displayRow.l2, (item as any)?.l2))}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{formatDecimal(firstNonBlank(displayRow.f2, (item as any)?.f2))}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{formatDecimal(firstNonBlank(displayRow.l3, (item as any)?.l3))}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap font-medium text-indigo-700">{formatDecimal(firstNonBlank(displayRow.gsm, displayRow.boardGsmReq))}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap font-black text-emerald-700">{formatDecimal(erpLeastGsmMap.get(erp))}</td>

                      <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">{p.color1 || "-"}</td>
                      <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">{p.color2 || "-"}</td>
                      <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">{displayRow.printingColor || "-"}</td>
                      
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{formatDecimal(p.totalPaperWeight)}</td>
                      <td className="px-4 py-4 text-right text-xs font-bold text-indigo-700 border border-black whitespace-nowrap">
                        {formatDecimal(p.realizationPerKg)}
                      </td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{formatDecimal((p as any).reelAsPerCalc)}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{formatDecimal(p.noOfUpsInCuttingForPlates)}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{formatDecimal((p as any).reelActualWithTrimming)}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{formatDecimal(firstNonBlank((p as any).cuttingWithTrimming, getItemValue(item, "cuttingSize")))}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{formatDecimal(p.plannedProductionInMeter)}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{formatDecimal(p.sheetWeight)}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{formatDecimal(p.plateWeight)}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{formatDecimal(p.totalWeightOfSet)}</td>
                      <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">{p.fluteBatches || "-"}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{formatDecimal(p.rate)}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{formatDecimal(Number(p.qty || 0) * Number(p.rate || 0))}</td>

                      <td className="px-4 py-4 text-right text-xs font-bold text-black border border-black whitespace-nowrap bg-indigo-50/20">{formatDecimal(p.prodFromSheetPlant)}</td>
                      <td className="px-4 py-4 text-right text-xs font-bold text-black border border-black whitespace-nowrap bg-indigo-50/20">{formatDecimal(p.prodFromFFG || 0)}</td>
                      <td className="px-4 py-4 text-right text-xs text-black border border-black whitespace-nowrap">{formatDecimal(p.productionInMeter)}</td>
                      <td className="px-4 py-4 text-right text-xs font-bold text-emerald-700 border border-black whitespace-nowrap bg-emerald-50/30">{formatDecimal(p.actualPaperUsed || 0)}</td>
                      <td className="px-4 py-4 text-xs text-black border border-black whitespace-nowrap">
                        <select
                          value={p.closeBy || ""}
                          disabled={closeFieldsDisabled}
                          onChange={async (e) => {
                             const nextValue = e.target.value;
                             if (nextValue === "Yes" && !mandatoryCloseDataComplete) {
                               alert(formatJobCloseBlockedMessage(jobClosureStatusMap.get(p.id)));
                               return;
                             }
                             const today = new Date().toISOString().split("T")[0];
                             if (nextValue === "Yes") {
                               const confirmSave = await confirm("Set close date to today and save?");
                               if (!confirmSave) {
                                 return;
                               }
                               void setProductions((prev) =>
                                 prev.map((row) =>
                                   row.id === p.id
                                     ? {
                                         ...row,
                                         closeBy: "Yes",
                                         closeDate: today,
                                       }
                                     : row
                                 )
                               );
                             } else {
                               void setProductions((prev) =>
                                 prev.map((row) =>
                                   row.id === p.id
                                     ? {
                                         ...row,
                                         closeBy: nextValue,
                                       }
                                     : row
                                 )
                               );
                             }
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
                      <td className="min-w-[150px] px-4 py-4 text-center text-xs font-medium border border-black whitespace-nowrap">
                        <div className="flex items-center justify-center gap-3">
                          <button
                            type="button"
                            onClick={() => void handleDownloadJobCard(p)}
                            title="Download Job Card PDF"
                            className="text-slate-800 hover:text-black transition-all p-1"
                          >
                            <FileText size={16} />
                          </button>
                          {canManage && p.status !== "Completed" && p.status !== "Cancelled" && mandatoryCloseDataComplete ? (
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
                          {canManage && p.status !== "Completed" && p.status !== "Cancelled" && (
                            <button 
                              onClick={() => openCancelModal(p.id)} 
                              title="Cancel job"
                              className="inline-flex items-center justify-center whitespace-nowrap rounded border border-red-700 bg-red-600 px-3 py-1.5 text-xs font-black text-white transition hover:bg-red-700"
                            >
                              Cancel
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
                Job: {normalizeProductionJobNumber(cancelTarget.transactionNo)} | Order: {cancelTargetOrder?.orderNo || "-"} | Item: {cancelTargetItem?.name || "Unknown"}
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
