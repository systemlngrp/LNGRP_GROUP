import React, { useEffect, useMemo, useRef, useState } from "react";
import { useData } from "../hooks/useData";
import {
  DispatchPlan,
  Truck,
  Item,
  Order,
  Company,
  LoadingSlip,
  LoadingSlipAllocation,
  LoadingSlipLine,
  Production,
  PackingDetail,
  LinkedLoadingDetail,
  OrderItemSource,
  OrderSchedule,
  Firm,
} from "../types";
import { Select } from "../components/Select";
import { getFirmDisplayNameById } from "../lib/firmDisplay";
import {
  Truck as TruckIcon,
  Package,
  Search,
  X,
  Check,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
} from "lucide-react";
import { Spinner } from "../components/Spinner";
import { formatDate } from "../lib/serial";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { SortHeader, sortRows, useTableSort } from "../lib/tableSort";
import { cn } from "../lib/utils";
import { useNpdItemsWithStatus } from "../hooks/useNpdItems";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { buildLinkedLoadingDetailsFromSlip, findLinkedItemByMasterErp, getLinkedSetsPerBox } from "../lib/linkedLoading";
import { upsertFgLinkedChildSlip } from "../lib/linkedLoadingSlipSync";
import { buildPhpPlateStockAlertMessage, getPhpPlateStockShortages } from "../lib/phpPlateStockValidation";
import { normalizeTruckStatus } from "../lib/truckStatus";
import { useAuth } from "../auth/AuthContext";
import { usePageDataStatus } from "../components/DataLoadingBoundary";
import { getJobLoadingSlipLimitError } from "../lib/loadingValidation";
import {
  EligibleLoadingJob,
  getLoadingJobNumber,
  getPendingLoadingPlanProjections,
  loadedQtyByJobId,
} from "../lib/pendingLoadingEligibility";

interface PendingPlan extends DispatchPlan {
  firmId: string;
  firmName: string;
  companyName: string;
  itemSource: OrderItemSource;
  orderNo: string;
  pendingQty: number;
}

interface GroupedPlan {
  firmId: string;
  firmName: string;
  loadable: boolean;
  unavailableReason?: string;
  companyId: string;
  companyName: string;
  itemSource: OrderItemSource;
  itemId: string;
  itemName: string;
  plans: PendingPlan[];
  eligibleJobs: EligibleLoadingJob[];
}

interface LoadingModalState {
  firmId: string;
  companyId: string;
  itemSource: OrderItemSource;
  itemId: string;
  itemName: string;
  plans: PendingPlan[];
  eligibleJobs: EligibleLoadingJob[];
}

interface JobOption {
  jobId: string;
  jobNo: string;
  ffg: number;
}

type LinkedSide = Extract<OrderItemSource, "PHP" | "PLATE">;

function createEmptyPackingRows(): PackingDetail[] {
  return [{ bundles: 0, packSize: 0, quantity: 0 }];
}

export function PendingLoading() {
  const { setActiveFirm } = useAuth();
  const { loading: pageLoading } = usePageDataStatus();
  const [plans, updatePlans] = useData<DispatchPlan>("dispatch_plans", [], { firmScope: "all", storageKey: "dispatch-plans-all-firms" });
  const [trucks] = useData<Truck>("trucks", []);
  // FG stock is only needed in the loading dialog: it loads in the background
  // and the dialog cannot be saved until it has arrived.
  const { items: npdItems, loading: npdStockLoading } = useNpdItemsWithStatus({ deferred: true });
  const { resolveOrderItem, findItemAcrossSources, itemsBySource } = useOrderItemCatalog({ includeMaterials: false });
  const [orders] = useData<Order>("orders", [], { firmScope: "all", storageKey: "orders-all-firms" });
  const [schedules] = useData<OrderSchedule>("orders_schedule", [], { firmScope: "all", storageKey: "orders-schedule-all-firms" });
  const [firms] = useData<Firm>("firms", [], { firmScope: "all", storageKey: "firms-all" });
  const [companies] = useData<Company>("companies", [], { firmScope: "all", storageKey: "companies-all-firms" });
  const [productions] = useData<Production>("productions", [], { firmScope: "all", storageKey: "productions-all-firms" });
  const [phpJobs] = useData<Production>("php_job_master", [], { firmScope: "all", storageKey: "php-job-master-all-firms" });
  const [plateJobs] = useData<Production>("plate_job_master", [], { firmScope: "all", storageKey: "plate-job-master-all-firms" });
  const [phpItemMaster] = useData<any>("php_item_master", []);
  const [plateItemMaster] = useData<any>("plate_item_master", []);
  const [loadingSlips, updateLoadingSlips] = useData<LoadingSlip>("loading_slips", [], { firmScope: "all", storageKey: "loading-slips-all-firms" });
  const [phpLoadingSlips, updatePhpLoadingSlips] = useData<LoadingSlip>("php_loading_slips", []);
  const [plateLoadingSlips, updatePlateLoadingSlips] = useData<LoadingSlip>("plate_loading_slips", []);

  const [searchTerm, setSearchTerm] = useState("");
  const [firmFilter, setFirmFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const didInitExpand = useRef(false);
  const [loadingModal, setLoadingModal] = useState<LoadingModalState | null>(null);
  const [loadedQuantities, setLoadedQuantities] = useState<Record<string, number>>({});
  const [jobSplitQtys, setJobSplitQtys] = useState<Record<string, Record<string, number | "">>>({});
  const [openingStockQtys, setOpeningStockQtys] = useState<Record<string, number | "">>({});
  const [cancelingPlanId, setCancelingPlanId] = useState<string | null>(null);
  const [cancelQty, setCancelQty] = useState<number | "">("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [modalTruckId, setModalTruckId] = useState<string>("");
  const [modalManualTruckNo, setModalManualTruckNo] = useState("");
  const availableTrucks = useMemo(
    () => trucks
      .filter((truck) => {
        const status = normalizeTruckStatus(truck.liveStatus);
        const isInternal = String(truck.truckType || "").trim().toLowerCase() === "internal";
        return isInternal && (!status || status === "EMPTY");
      })
      .sort((a, b) => a.truckNo.localeCompare(b.truckNo)),
    [trucks]
  );
  const [packingDetails, setPackingDetails] = useState<PackingDetail[]>(createEmptyPackingRows());
  const [extraItemsQty, setExtraItemsQty] = useState<number | "">("");
  const [linkedPackingDetails, setLinkedPackingDetails] = useState<Record<LinkedSide, PackingDetail[]>>({
    PHP: createEmptyPackingRows(),
    PLATE: createEmptyPackingRows(),
  });
  const [linkedExtraItemsQty, setLinkedExtraItemsQty] = useState<Record<LinkedSide, number | "">>({
    PHP: "",
    PLATE: "",
  });

  const allProductionJobs = useMemo(() => [...productions, ...phpJobs, ...plateJobs], [phpJobs, plateJobs, productions]);
  const productionMap = useMemo(() => new Map(allProductionJobs.map((production) => [production.id, production])), [allProductionJobs]);
  const printingAccountedScheduleIds = useMemo(() => {
    const collect = (slips: LoadingSlip[]) => new Set(
      slips
        .filter((slip) => slip.autoGenerated === "Yes" && slip.sourceTransactionType === "Production Processing")
        .flatMap((slip) => slip.lines.map((line) => String((line as LoadingSlipLine & { scheduleId?: string }).scheduleId || "").trim()))
        .filter(Boolean)
    );
    return { PHP: collect(phpLoadingSlips), PLATE: collect(plateLoadingSlips) };
  }, [phpLoadingSlips, plateLoadingSlips]);

  const existingLoadedByJobId = useMemo(() => loadedQtyByJobId(loadingSlips), [loadingSlips]);

  const planProjections = useMemo(
    () => getPendingLoadingPlanProjections({
      plans,
      orders,
      schedules,
      companies,
      firms,
      productions,
      phpJobs,
      plateJobs,
      loadingSlips,
      resolveOrderItem,
      findItemAcrossSources,
    }),
    [companies, findItemAcrossSources, firms, loadingSlips, orders, phpJobs, plateJobs, plans, productions, resolveOrderItem, schedules],
  );

  const groupedData = useMemo(() => {
    const words = searchWords(searchTerm);
    const filtered = planProjections.filter((projection) => {
      if (firmFilter && projection.firmId.toLowerCase() !== firmFilter.trim().toLowerCase()) return false;
      if (sourceFilter && projection.itemSource !== sourceFilter) return false;
      if (companyFilter && (projection.company?.name || "Company unavailable") !== companyFilter) return false;
      if (itemFilter && (projection.item?.name || "Item unavailable") !== itemFilter) return false;
      // Shown for each plan: company / item group headings (company, item, source)
      // and the columns Order No, Firm, Plan No, Planned, Loaded, Pending.
      return matchesTableSearch([
        projection.company?.name || "Company unavailable",
        projection.item?.name || "Item unavailable",
        projection.itemSource,
        projection.order?.orderNo || "N/A",
        getFirmDisplayNameById(projection.firmId, firms),
        projection.plan.planNo,
        Number(projection.plan.plannedQty || 0),
        Number(projection.plan.loadedQty || 0),
        projection.pendingQty,
      ], words);
    });

    const map = new Map<string, GroupedPlan>();

    filtered.forEach((projection) => {
      const { plan, order, item, company, firmId, itemSource, pendingQty, eligibleJobs } = projection;
      const firmName = getFirmDisplayNameById(firmId, firms);
      const loadable = Boolean(order && item && company);
      const unavailableReason = !order ? "Order record unavailable" : !item ? "Item record unavailable" : !company ? "Company record unavailable" : undefined;
      const companyId = company?.id || `missing-company-${plan.id}`;
      const itemId = item?.id || `missing-item-${plan.id}`;
      const key = `${firmId}::${companyId}::${itemSource}::${itemId}`;
      if (!map.has(key)) {
        map.set(key, {
          firmId,
          firmName,
          loadable,
          unavailableReason,
          companyId,
          companyName: company?.name || "Company unavailable",
          itemSource,
          itemId,
          itemName: item?.name || "Item unavailable",
          plans: [],
          eligibleJobs,
        });
      }

      const group = map.get(key)!;
      group.plans.push({
        ...plan,
        firmId,
        firmName,
        companyName: company?.name || "Company unavailable",
        itemSource,
        orderNo: order?.orderNo || "N/A",
        pendingQty,
      });
    });

    const result = Array.from(map.values()).sort((a, b) => a.companyName.localeCompare(b.companyName));
    
    // Group results by company for the UI
    const final: Array<{ groupKey: string; companyId: string; companyName: string; firmName: string; items: GroupedPlan[] }> = [];
    const byGroupKey = new Map<string, (typeof final)[number]>();
    result.forEach(group => {
      const groupKey = `${group.firmId}::${group.companyId}`;
      let companyGroup = byGroupKey.get(groupKey);
      if (!companyGroup) {
        companyGroup = { groupKey, companyId: group.companyId, companyName: group.companyName, firmName: group.firmName, items: [] };
        final.push(companyGroup);
        byGroupKey.set(groupKey, companyGroup);
      }
      companyGroup.items.push(group);
    });

    return final;
  }, [firms, firmFilter, sourceFilter, companyFilter, itemFilter, planProjections, searchTerm]);

  // Filter choices from all pending plans (not narrowed by the other filters).
  const filterOptions = useMemo(() => {
    const firmIds = new Set<string>(); const sources = new Set<string>(); const companyNames = new Set<string>(); const itemNames = new Set<string>();
    planProjections.forEach((projection) => {
      if (projection.firmId) firmIds.add(projection.firmId);
      if (projection.itemSource) sources.add(projection.itemSource);
      companyNames.add(projection.company?.name || "Company unavailable");
      itemNames.add(projection.item?.name || "Item unavailable");
    });
    const toOptions = (values: Set<string>) => Array.from(values).sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value }));
    return {
      firms: Array.from(firmIds).map((id) => ({ value: id, label: getFirmDisplayNameById(id, firms) })).sort((a, b) => a.label.localeCompare(b.label)),
      sources: toOptions(sources),
      companies: toOptions(companyNames),
      items: toOptions(itemNames),
    };
  }, [planProjections, firms]);

  // One sort for every plan table: each item's plans are sorted inside their own table.
  const { sort: planSort, toggle: togglePlanSort } = useTableSort<never>([], () => null);
  const sortedGroupedData = useMemo(() => {
    if (!planSort) return groupedData;
    const getPlanValue = (plan: GroupedPlan["plans"][number]) => {
      switch (planSort.key) {
        case "orderNo": return plan.orderNo;
        case "firmName": return plan.firmName;
        case "planNo": return plan.planNo || "";
        case "plannedQty": return Number(plan.plannedQty || 0);
        case "loadedQty": return Number(plan.loadedQty || 0);
        case "pendingQty": return plan.pendingQty;
        default: return "";
      }
    };
    return groupedData.map((company) => ({
      ...company,
      items: company.items.map((itemGroup) => ({ ...itemGroup, plans: sortRows(itemGroup.plans, getPlanValue, planSort.direction) })),
    }));
  }, [groupedData, planSort]);

  useEffect(() => {
    if (didInitExpand.current) return;
    if (groupedData.length === 0) return;
    didInitExpand.current = true;
    setExpandedCompanies(new Set(groupedData.map((group) => group.groupKey)));
  }, [groupedData]);

  const currentAdjustmentByJobId = useMemo(() => {
    const map = new Map<string, number>();
    Object.values(jobSplitQtys).forEach((byJobId) => {
      Object.entries(byJobId).forEach(([jobId, qty]) => {
        if (!jobId) return;
        map.set(jobId, (map.get(jobId) || 0) + Number(qty || 0));
      });
    });
    return map;
  }, [jobSplitQtys]);

  const getPlanOpeningStockQty = (key: string) => Number(openingStockQtys[key] || 0);
  const getAlreadyLoadedForJob = (jobId: string) => existingLoadedByJobId.get(String(jobId || "").trim().toLowerCase()) || 0;

  const getFirmStockBalance = (itemId: string, firmId: string) => {
    const catalogItem = itemsBySource.FG.find((row) => row.id === itemId);
    const lookupKeys = [
      itemId,
      catalogItem?.raw?.id,
      catalogItem?.raw?.npdId,
      catalogItem?.raw?.itemId,
      catalogItem?.erp,
    ].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
    const item = npdItems.find((row) =>
      [row.id, (row as any).npdId, (row as any).itemId, row.erp]
        .map((value) => String(value || "").trim().toLowerCase())
        .some((key) => key && lookupKeys.includes(key))
    );
    const firmStock = (item as any)?.firmStocks?.[firmId];
    if (firmStock && Number.isFinite(Number(firmStock.balance))) return Math.max(0, Number(firmStock.balance));
    return 0;
  };

  const isTruckAvailableForLoading = (truckId: string) => {
    const truck = trucks.find((row) => row.id === truckId);
    if (!truck) return false;
    const isInternal = String(truck.truckType || "").trim().toLowerCase() === "internal";
    const status = normalizeTruckStatus(truck.liveStatus);
    return isInternal && (!status || status === "EMPTY");
  };

  useEffect(() => {
    if (!modalTruckId) return;
    if (isTruckAvailableForLoading(modalTruckId)) return;
    setModalTruckId("");
  }, [modalTruckId, trucks]);

  const getRemainingCapacityForJob = (jobId: string, currentRowQty = 0, jobSource: OrderItemSource = "FG") => {
    const production = productionMap.get(jobId);
    const ffg = Number(jobSource === "FG" ? production?.prodFromFFG || 0 : production?.productionOutputQty || 0);
    const alreadyLoaded = getAlreadyLoadedForJob(jobId);
    const currentAdjustments = currentAdjustmentByJobId.get(jobId) || 0;
    return Math.max(0, ffg - alreadyLoaded - currentAdjustments + currentRowQty);
  };

  const getModalKey = (companyId: string, itemSource: OrderItemSource, itemId: string) => `${companyId}::${itemSource}::${itemId}`;

  const getModalValidation = (modal: LoadingModalState) => {
    const modalKey = getModalKey(modal.companyId, modal.itemSource, modal.itemId);
    const rowLoadedQty = Number(loadedQuantities[modalKey] || 0);
    const byJobId = jobSplitQtys[modalKey] || {};
    const openingStockQty = getPlanOpeningStockQty(modalKey);
    const jobAllocatedTotal = Object.values(byJobId).reduce<number>((sum, qty) => sum + Number(qty || 0), 0);
    const allocatedTotal = jobAllocatedTotal + openingStockQty;
    const errors: string[] = [];

    const totalPending = modal.plans.reduce((sum, plan) => sum + Number(plan.pendingQty || 0), 0);
    const firmBalance = modal.itemSource === "FG" ? getFirmStockBalance(modal.itemId, modal.firmId) : Number.POSITIVE_INFINITY;

    const truckNoInput = modalManualTruckNo.trim();
    if (!truckNoInput) errors.push("Please enter truck number.");
    if (modalTruckId && !isTruckAvailableForLoading(modalTruckId)) errors.push("Selected truck is not an EMPTY internal truck. Please select another truck.");
    if (rowLoadedQty <= 0) errors.push("Loaded qty must be greater than 0.");
    if (rowLoadedQty > totalPending + 0.0001) errors.push("Loaded qty cannot exceed total pending for loading.");
    if (modal.itemSource === "FG" && rowLoadedQty > firmBalance + 0.0001) errors.push(`Load quantity cannot exceed ${firmBalance.toLocaleString()} available FG stock.`);

    Object.entries(byJobId).forEach(([jobId, qty]) => {
      const value = Number(qty || 0);
      if (value <= 0) return;
      const remainingCapacity = getRemainingCapacityForJob(jobId, value, modal.itemSource);
      if (value > remainingCapacity + 0.0001) {
        errors.push("Adjust Now cannot exceed Yet to Load for a job.");
      }
    });
    if (modal.itemSource === "FG" && jobAllocatedTotal > firmBalance + 0.0001) {
      errors.push(`Job allocations cannot exceed ${firmBalance.toLocaleString()} available FG stock.`);
    }

    if (modal.itemSource === "FG" && npdStockLoading) errors.unshift("FG stock is still loading. Please wait a moment.");
    const stockLabel = modal.itemSource === "FG" ? "FG Stock" : `${modal.itemSource} Stock`;
    if (openingStockQty < 0) errors.push(`${stockLabel} quantity cannot be negative.`);
    if (modal.itemSource === "FG") {
      const firmBalance = getFirmStockBalance(modal.itemId, modal.firmId);
      if (openingStockQty > firmBalance + 0.0001) errors.push(`${stockLabel} cannot exceed ${firmBalance.toLocaleString()} available for ${getFirmDisplayNameById(modal.firmId, firms)}.`);
    }
    if (allocatedTotal <= 0) errors.push("At least one positive adjustment is required.");
    if (Math.abs(allocatedTotal - rowLoadedQty) > 0.0001) errors.push(`Job/${stockLabel} total must exactly match Loaded qty.`);

    const packingTotal = packingDetails.reduce((sum, d) => sum + Number(d.quantity || 0), 0) + Number(extraItemsQty || 0);
    if (Math.abs(packingTotal - rowLoadedQty) > 0.0001) {
      errors.push(`Packing Details total (${packingTotal.toLocaleString()}) must match Loaded qty (${rowLoadedQty.toLocaleString()}).`);
    }

    return { isValid: errors.length === 0, errors, allocatedTotal, openingStockQty, totalPending, packingTotal };
  };

  const modalHasErrors = useMemo(() => {
    if (!loadingModal) return false;
    return !getModalValidation(loadingModal).isValid;
  }, [jobSplitQtys, loadedQuantities, loadingModal, openingStockQtys, currentAdjustmentByJobId, existingLoadedByJobId, productionMap, modalTruckId, modalManualTruckNo, packingDetails, extraItemsQty, npdItems, npdStockLoading, itemsBySource.FG, firms]);

  const handleOpenLoad = (firmId: string, companyId: string, itemSource: OrderItemSource, itemId: string, itemName: string, itemPlans: PendingPlan[]) => {
    const firm = firms.find((row) => row.id === firmId);
    if (!firm) { alert("Original order firm could not be resolved."); return; }
    setActiveFirm(firm);
    const group = groupedData
      .flatMap((companyGroup) => companyGroup.items)
      .find((itemGroup) => itemGroup.companyId === companyId && itemGroup.itemSource === itemSource && itemGroup.itemId === itemId && itemGroup.firmId === firmId);
    const eligibleJobs = group?.eligibleJobs || [];
    setLoadingModal({ firmId, companyId, itemSource, itemId, itemName, plans: itemPlans, eligibleJobs });
    const modalKey = getModalKey(companyId, itemSource, itemId);
    const totalPending = itemPlans.reduce((sum, plan) => sum + Number(plan.pendingQty || 0), 0);

    setLoadedQuantities({ [modalKey]: totalPending });
    setOpeningStockQtys({ [modalKey]: "" });
    setJobSplitQtys({
      [modalKey]: Object.fromEntries(eligibleJobs.map((j) => [j.jobId, ""])),
    });
    setModalTruckId("");
    setModalManualTruckNo("");
    setPackingDetails(createEmptyPackingRows());
    setExtraItemsQty("");
    setLinkedPackingDetails({ PHP: createEmptyPackingRows(), PLATE: createEmptyPackingRows() });
    setLinkedExtraItemsQty({ PHP: "", PLATE: "" });
  };

  const handleCloseLoad = () => {
    setLoadingModal(null);
    setLoadedQuantities({});
    setJobSplitQtys({});
    setOpeningStockQtys({});
    setModalTruckId("");
    setModalManualTruckNo("");
    setPackingDetails(createEmptyPackingRows());
    setExtraItemsQty("");
    setLinkedPackingDetails({ PHP: createEmptyPackingRows(), PLATE: createEmptyPackingRows() });
    setLinkedExtraItemsQty({ PHP: "", PLATE: "" });
  };

  const getPreviewLinkedDetails = (source: LinkedSide, loadedQty: number): LinkedLoadingDetail[] => {
    if (!loadingModal || !(loadedQty > 0)) return [];
    const firstPlan = loadingModal.plans[0];
    if (firstPlan?.scheduleId && printingAccountedScheduleIds[source].has(String(firstPlan.scheduleId))) return [];
    const order = orders.find((row) => row.id === firstPlan?.orderId);
    const fgItem = resolveOrderItem(order);
    const sourceItems = itemsBySource[source] || [];
    const itemErp = String(order?.erpCode || fgItem?.erp || "").trim();
    const linkedItem = findLinkedItemByMasterErp(sourceItems, itemErp);
    const setsPerBox = getLinkedSetsPerBox(linkedItem);
    if (!linkedItem || !setsPerBox) return [];
    const raw = linkedItem.raw || {};
    const sidePackingDetails = linkedPackingDetails[source]
      .filter((row) => Number(row.bundles || 0) > 0 && Number(row.packSize || 0) > 0)
      .map((row) => ({
        bundles: Number(row.bundles || 0),
        packSize: Number(row.packSize || 0),
        quantity: Number(row.quantity || 0),
      }));
    return [{
      source,
      itemId: linkedItem.id,
      itemName: linkedItem.name,
      companyName: linkedItem.companyName,
      erpCode: itemErp || undefined,
      masterErp: String(raw.masterItemNameErpCode || "").trim() || undefined,
      setsPerBox,
      requiredQty: parseFloat((loadedQty * setsPerBox).toFixed(2)),
      packingDetails: sidePackingDetails.length > 0 ? sidePackingDetails : undefined,
      extraItemsQty: Number(linkedExtraItemsQty[source] || 0) || undefined,
    }];
  };

  const handleAddPackingRow = () => {
    setPackingDetails([...packingDetails, { bundles: 0, packSize: 0, quantity: 0 }]);
  };

  const handleRemovePackingRow = (index: number) => {
    const next = [...packingDetails];
    next.splice(index, 1);
    setPackingDetails(next);
  };

  const handleUpdatePackingRow = (index: number, field: keyof PackingDetail, value: number) => {
    const next = [...packingDetails];
    const row = { ...next[index], [field]: value };
    row.quantity = row.bundles * row.packSize;
    next[index] = row;
    setPackingDetails(next);
  };

  const getLinkedPackingTotal = (source: LinkedSide) =>
    linkedPackingDetails[source].reduce((sum, row) => sum + Number(row.quantity || 0), 0) + Number(linkedExtraItemsQty[source] || 0);

  const handleAddLinkedPackingRow = (source: LinkedSide) => {
    setLinkedPackingDetails((prev) => ({
      ...prev,
      [source]: [...prev[source], { bundles: 0, packSize: 0, quantity: 0 }],
    }));
  };

  const handleRemoveLinkedPackingRow = (source: LinkedSide, index: number) => {
    setLinkedPackingDetails((prev) => {
      const nextRows = [...prev[source]];
      nextRows.splice(index, 1);
      return {
        ...prev,
        [source]: nextRows.length > 0 ? nextRows : createEmptyPackingRows(),
      };
    });
  };

  const handleUpdateLinkedPackingRow = (source: LinkedSide, index: number, field: keyof PackingDetail, value: number) => {
    setLinkedPackingDetails((prev) => {
      const nextRows = [...prev[source]];
      const row = { ...nextRows[index], [field]: value };
      row.quantity = row.bundles * row.packSize;
      nextRows[index] = row;
      return {
        ...prev,
        [source]: nextRows,
      };
    });
  };

  const handleSubmitLoading = async () => {
    if (!loadingModal) return;

    const modalKey = getModalKey(loadingModal.companyId, loadingModal.itemSource, loadingModal.itemId);
    const rowLoadedQty = Number(loadedQuantities[modalKey] || 0);
    const validation = getModalValidation(loadingModal);

    if (!validation.isValid) {
      alert(validation.errors[0] || "Loading data is invalid.");
      return;
    }

    if (modalTruckId && !isTruckAvailableForLoading(modalTruckId)) {
      alert("Selected truck is not an EMPTY internal truck. Please select another truck.");
      setModalTruckId("");
      return;
    }

    const byJobId = jobSplitQtys[modalKey] || {};
    const allocationPool: LoadingSlipAllocation[] = [];

    Object.entries(byJobId).forEach(([jobId, qty]) => {
      const value = Number(qty || 0);
      if (!jobId || value <= 0) return;
      const production = productionMap.get(jobId);
      const jobNo = production ? getLoadingJobNumber(production) : "";
      if (!jobNo) return;
      allocationPool.push({ sourceType: "job", jobId, jobNo, qty: value });
    });

    const openingStockQty = getPlanOpeningStockQty(modalKey);
    if (openingStockQty > 0) {
      const sourceFirm = firms.find((firm) => firm.id === loadingModal.firmId);
      allocationPool.push({
        sourceType: "opening_stock",
        sourceRef: loadingModal.itemSource === "FG" ? "FG Stock" : `${loadingModal.itemSource} Stock`,
        qty: openingStockQty,
        sourceFirmId: loadingModal.itemSource === "FG" ? loadingModal.firmId : undefined,
        sourceFirmName: loadingModal.itemSource === "FG" ? sourceFirm?.firmName : undefined,
      });
    }

    const loadingSlipLimitError = getJobLoadingSlipLimitError(allocationPool, loadingSlips);
    if (loadingSlipLimitError) {
      alert(loadingSlipLimitError);
      return;
    }

    const sortedPlans = [...loadingModal.plans].sort((a, b) =>
      (a.planNo || "").localeCompare(b.planNo || "", undefined, { numeric: true, sensitivity: "base" })
    );

    const consumeFromPool = (need: number) => {
      const allocations: LoadingSlipAllocation[] = [];
      let remaining = need;
      while (remaining > 0.0001 && allocationPool.length > 0) {
        const head = allocationPool[0];
        const take = Math.min(remaining, Number(head.qty || 0));
        if (take <= 0) {
          allocationPool.shift();
          continue;
        }
        allocations.push({ ...(head as any), qty: take });
        remaining -= take;
        const left = Number(head.qty || 0) - take;
        if (left <= 0.0001) allocationPool.shift();
        else allocationPool[0] = { ...(head as any), qty: left };
      }
      return { allocations, remaining };
    };

    const lines: LoadingSlipLine[] = [];
    let remainingToDistribute = rowLoadedQty;
    for (const plan of sortedPlans) {
      if (remainingToDistribute <= 0.0001) break;
      const planPending = Math.max(0, Number(plan.pendingQty || 0));
      const planLoad = Math.min(planPending, remainingToDistribute);
      if (planLoad <= 0.0001) continue;

      const consumed = consumeFromPool(planLoad);
      if (consumed.remaining > 0.0001) {
        alert("Job split allocations are insufficient to cover Loaded qty.");
        return;
      }

      const order = orders.find((row) => row.id === plan.orderId);
      const item = resolveOrderItem(order);
      lines.push({
        dispatchPlanId: plan.id,
        loadedQty: planLoad,
        allocations: consumed.allocations,
        companyId: loadingModal.companyId,
        companyName: plan.companyName,
        itemId: loadingModal.itemId,
        itemName: item?.name,
        itemSource: loadingModal.itemSource,
        erpCode: String(order?.erpCode || item?.erp || "").trim() || undefined,
        rate: Number(order?.rate ?? item?.rate ?? 0) || undefined,
        gstRate: Number((item as any)?.gstRate ?? 18),
        uom: item?.uom,
      });
      remainingToDistribute -= planLoad;
    }

    if (remainingToDistribute > 0.0001) {
      alert("Unable to distribute Loaded qty across pending dispatch plans.");
      return;
    }

    setIsSubmitting(true);
    try {
      const baseSlip: LoadingSlip = {
        id: crypto.randomUUID(),
        slipNo: "",
        date: new Date().toISOString().slice(0, 10),
        truckId: modalTruckId,
        truckNo: modalManualTruckNo.trim() || trucks.find((truck) => truck.id === modalTruckId)?.truckNo || undefined,
        lines,
        firmId: loadingModal.firmId,
        orderFirmId: loadingModal.firmId,
        packingDetails: packingDetails.filter(d => d.bundles > 0 && d.packSize > 0),
        extraItemsQty: Number(extraItemsQty || 0) || undefined,
      };
      const phpDetails = buildLinkedLoadingDetailsFromSlip({
        slip: baseSlip,
        source: "PHP",
        plans,
        orders,
        resolveOrderItem,
        sourceItems: itemsBySource.PHP || [],
        excludedScheduleIds: printingAccountedScheduleIds.PHP,
      }).map((detail) => ({
        ...detail,
        packingDetails: linkedPackingDetails.PHP.filter((row) => Number(row.bundles || 0) > 0 && Number(row.packSize || 0) > 0),
        extraItemsQty: Number(linkedExtraItemsQty.PHP || 0) || undefined,
      }));
      const plateDetails = buildLinkedLoadingDetailsFromSlip({
        slip: baseSlip,
        source: "PLATE",
        plans,
        orders,
        resolveOrderItem,
        sourceItems: itemsBySource.PLATE || [],
        excludedScheduleIds: printingAccountedScheduleIds.PLATE,
      }).map((detail) => ({
        ...detail,
        packingDetails: linkedPackingDetails.PLATE.filter((row) => Number(row.bundles || 0) > 0 && Number(row.packSize || 0) > 0),
        extraItemsQty: Number(linkedExtraItemsQty.PLATE || 0) || undefined,
      }));
      const newSlip: LoadingSlip = {
        ...baseSlip,
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
        parentFgLoadingId: newSlip.id,
      });
      if (shortages.length > 0) {
        alert(buildPhpPlateStockAlertMessage(shortages));
        return;
      }

      const loadingSaveResult = await updateLoadingSlips((prev) => [...prev, newSlip]);
      await updatePhpLoadingSlips((prev) => upsertFgLinkedChildSlip({ prevSlips: prev, parentSlip: newSlip, details: phpDetails, source: "PHP" }));
      await updatePlateLoadingSlips((prev) => upsertFgLinkedChildSlip({ prevSlips: prev, parentSlip: newSlip, details: plateDetails, source: "PLATE" }));

      await updatePlans((prev) =>
        prev.map((plan) => {
          const line = lines.find((row) => row.dispatchPlanId === plan.id);
          if (!line) return plan;
          const nextLoaded = Number(plan.loadedQty || 0) + line.loadedQty;
          const remaining = Math.max(0, Number(plan.plannedQty || 0) - nextLoaded - Number(plan.canceledQty || 0));
          return {
            ...plan,
            loadedQty: nextLoaded,
            canceledQty: Number(plan.canceledQty || 0) + remaining,
          };
        })
      );

      const whatsapp = (loadingSaveResult as any)?.whatsapp;
      if (whatsapp?.status === "Sent") alert("Loading Slip saved and WhatsApp message sent.");
      else if (whatsapp?.status === "Not Configured") alert("Loading Slip saved, but no active Loading Slip WhatsApp configuration was found.");
      else if (whatsapp?.status === "Failed") alert("Loading Slip saved, but WhatsApp PDF could not be sent. It will retry automatically.");

      handleCloseLoad();
    } catch (err) {
      console.error("Failed to submit loading:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelClick = (plan: PendingPlan) => {
    setCancelingPlanId(plan.id);
    setCancelQty(plan.pendingQty);
  };

  const handleCancelPlan = async (planId: string) => {
    if (cancelQty === "" || Number(cancelQty) <= 0) return;

    setIsSubmitting(true);
    try {
      await updatePlans((prev) =>
        prev.map((plan) =>
          plan.id === planId
            ? {
                ...plan,
                canceledQty: Number(plan.canceledQty || 0) + Number(cancelQty),
              }
            : plan
        )
      );
      setCancelingPlanId(null);
      setCancelQty("");
    } catch (err) {
      console.error("Failed to cancel plan:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const FILTER_LABEL = "mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600";
  const listFiltered = Boolean(searchTerm.trim() || firmFilter || sourceFilter || companyFilter || itemFilter);
  const clearListFilters = () => { setSearchTerm(""); setFirmFilter(""); setSourceFilter(""); setCompanyFilter(""); setItemFilter(""); };
  const listTotals = useMemo(() => {
    let items = 0; let plans = 0; let pending = 0;
    groupedData.forEach((company) => company.items.forEach((itemGroup) => {
      items += 1;
      itemGroup.plans.forEach((plan) => { plans += 1; pending += plan.pendingQty; });
    }));
    return { companies: groupedData.length, items, plans, pending };
  }, [groupedData]);
  const renderCancelControl = (plan: PendingPlan) => cancelingPlanId === plan.id ? (
    <div className="flex items-center justify-center gap-1">
      <input
        type="number"
        inputMode="numeric"
        aria-label="Quantity to cancel"
        value={cancelQty}
        onChange={(e) => setCancelQty(e.target.value === "" ? "" : parseFloat(e.target.value))}
        className="h-8 w-20 rounded border-2 border-red-500 px-1 text-xs font-bold focus:outline-none"
        autoFocus
      />
      <button
        type="button"
        aria-label="Confirm cancel quantity"
        onClick={() => handleCancelPlan(plan.id)}
        disabled={isSubmitting || cancelQty === "" || Number(cancelQty) <= 0}
        className="rounded bg-red-600 p-1.5 text-white hover:bg-red-700 disabled:opacity-40"
      >
        <Check size={14} />
      </button>
      <button type="button" aria-label="Close" onClick={() => setCancelingPlanId(null)} className="rounded bg-slate-200 p-1.5 text-slate-700 hover:bg-slate-300">
        <X size={14} />
      </button>
    </div>
  ) : (
    <button
      type="button"
      onClick={() => handleCancelClick(plan)}
      className="rounded border border-red-300 bg-red-50 px-3 py-1 text-[10px] font-black uppercase text-red-700 transition-all hover:bg-red-700 hover:text-white active:scale-95"
    >
      Cancel
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">Pending Loading</h2>
      </div>

      <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
        <div className="relative w-full"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" placeholder="Search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600" /></div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
          <div className="min-w-0"><span className={FILTER_LABEL}>Firm</span><Select compact value={firmFilter} onChange={setFirmFilter} options={filterOptions.firms} placeholder="All" /></div>
          <div className="min-w-0"><span className={FILTER_LABEL}>Source</span><Select compact value={sourceFilter} onChange={setSourceFilter} options={filterOptions.sources} placeholder="All" /></div>
          <div className="col-span-2 min-w-0 md:col-span-1"><span className={FILTER_LABEL}>Company</span><Select compact value={companyFilter} onChange={setCompanyFilter} options={filterOptions.companies} placeholder="All" /></div>
          <div className="col-span-2 min-w-0 md:col-span-1"><span className={FILTER_LABEL}>Item</span><Select compact value={itemFilter} onChange={setItemFilter} options={filterOptions.items} placeholder="All" /></div>
        </div>
        <div data-mf-actions="true" className="flex justify-end gap-2">
          {listFiltered ? <button type="button" onClick={clearListFilters} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button> : null}
          <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
        </div>
      </div>

      {groupedData.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-700">
          <span>{listTotals.companies} {listTotals.companies === 1 ? "company" : "companies"} · {listTotals.items} {listTotals.items === 1 ? "item" : "items"} · {listTotals.plans} {listTotals.plans === 1 ? "plan" : "plans"} · Pending <span className="text-indigo-700">{listTotals.pending.toLocaleString()}</span></span>
          <span className="flex gap-2">
            <button type="button" onClick={() => setExpandedCompanies(new Set(groupedData.map((group) => group.groupKey)))} className="rounded border border-black bg-white px-2 py-1 text-[11px] font-bold hover:bg-slate-100">Expand all</button>
            <button type="button" onClick={() => setExpandedCompanies(new Set())} className="rounded border border-black bg-white px-2 py-1 text-[11px] font-bold hover:bg-slate-100">Collapse all</button>
          </span>
        </div>
      ) : null}

      {pageLoading && groupedData.length === 0 ? (
        <div className="flex justify-center p-12">
          <Spinner />
        </div>
      ) : groupedData.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-12 text-center">
          <Package className="mx-auto mb-4 h-12 w-12 text-slate-300" />
          <p className="font-medium text-slate-500">No eligible pending loading plans found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedGroupedData.map((company) => {
            const open = expandedCompanies.has(company.groupKey);
            const companyPending = company.items.reduce((sum, itemGroup) => sum + itemGroup.plans.reduce((total, plan) => total + plan.pendingQty, 0), 0);
            return (
            <div key={company.groupKey} className="overflow-hidden rounded-lg border-2 border-black bg-white">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => {
                  setExpandedCompanies((current) => {
                    const next = new Set(current);
                    if (next.has(company.groupKey)) next.delete(company.groupKey);
                    else next.add(company.groupKey);
                    return next;
                  });
                }}
                className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors sm:px-4", open ? "bg-indigo-700 text-white" : "bg-white text-black hover:bg-indigo-50")}
              >
                <span className={cn("shrink-0 rounded p-1.5", open ? "bg-white/15" : "bg-indigo-100 text-indigo-700")}><TruckIcon size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-black uppercase leading-tight sm:text-base">{company.companyName}</span>
                  <span className={cn("mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-bold", open ? "text-indigo-100" : "text-slate-600")}>
                    <span>{company.firmName}</span>
                    <span>·</span>
                    <span>{company.items.length} {company.items.length === 1 ? "item" : "items"}</span>
                    <span>·</span>
                    <span>Pending {companyPending.toLocaleString()}</span>
                  </span>
                </span>
                <ChevronDown size={20} className={cn("shrink-0 transition-transform duration-200", open ? "rotate-180" : "")} />
              </button>

              {open ? (
                <div className="space-y-3 border-t-2 border-black bg-slate-50 p-2 sm:p-3">
                  {company.items.map((itemGroup) => {
                    const itemPending = itemGroup.plans.reduce((total, plan) => total + plan.pendingQty, 0);
                    return (
                    <div key={`${itemGroup.itemSource}::${itemGroup.itemId}`} className="overflow-hidden rounded border border-slate-400 bg-white">
                      <div className="flex flex-col gap-2 border-l-4 border-indigo-600 bg-indigo-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-start gap-2">
                          <Package size={18} className="mt-0.5 shrink-0 text-indigo-600" />
                          <div className="min-w-0">
                            <div className="break-words text-sm font-black uppercase leading-tight text-black">{itemGroup.itemName}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-600">
                              <span className="rounded border border-indigo-300 bg-white px-1.5 py-0.5 text-[10px] font-black uppercase text-indigo-700">{itemGroup.itemSource}</span>
                              <span>{itemGroup.plans.length} {itemGroup.plans.length === 1 ? "plan" : "plans"}</span>
                              <span>· Pending <span className="text-indigo-700">{itemPending.toLocaleString()}</span></span>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenLoad(itemGroup.firmId, company.companyId, itemGroup.itemSource, itemGroup.itemId, itemGroup.itemName, itemGroup.plans)}
                          disabled={!itemGroup.loadable}
                          title={itemGroup.unavailableReason}
                          className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded border-2 border-black bg-indigo-700 px-5 py-2 text-xs font-black uppercase tracking-widest text-white transition hover:bg-indigo-800 active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                        >
                          <TruckIcon size={16} /> Load Item
                        </button>
                      </div>
                      {itemGroup.unavailableReason ? <p className="mx-3 mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{itemGroup.unavailableReason}. Loading is unavailable until this link is repaired.</p> : null}

                      {/* Phones: one compact card per plan. */}
                      <div className="divide-y divide-slate-300 md:hidden">
                        {itemGroup.plans.map((plan) => (
                          <div key={plan.id} className="space-y-2 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                              <span className="font-black text-black">{plan.planNo || "-"}</span>
                              <span className="font-semibold text-slate-600">{plan.orderNo} · {plan.firmName}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-1 text-center">
                              {([["Planned", Number(plan.plannedQty || 0), "text-black"], ["Loaded", Number(plan.loadedQty || 0), "text-emerald-700"], ["Pending", plan.pendingQty, "text-indigo-700"]] as const).map(([label, value, tone]) => (
                                <div key={label} className="rounded border border-slate-300 bg-slate-50 px-1 py-1">
                                  <div className="text-[9px] font-black uppercase text-slate-500">{label}</div>
                                  <div className={cn("text-sm font-black", tone)}>{value.toLocaleString()}</div>
                                </div>
                              ))}
                            </div>
                            <div className="flex justify-end">{renderCancelControl(plan)}</div>
                          </div>
                        ))}
                      </div>

                      <div className="hidden overflow-x-auto md:block">
                        <table data-disable-table-pagination className="w-full border-collapse">
                          <thead className="bg-slate-100">
                            <tr>
                              <th className="border-y border-r border-slate-300 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-700"><SortHeader label={"Order No"} sortKey="orderNo" sort={planSort} onToggle={togglePlanSort} /></th>
                              <th className="border border-slate-300 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-700"><SortHeader label={"Firm"} sortKey="firmName" sort={planSort} onToggle={togglePlanSort} /></th>
                              <th className="border border-slate-300 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-700"><SortHeader label={"Plan No"} sortKey="planNo" sort={planSort} onToggle={togglePlanSort} /></th>
                              <th className="border border-slate-300 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-700"><SortHeader label={"Planned"} sortKey="plannedQty" sort={planSort} onToggle={togglePlanSort} align="right" /></th>
                              <th className="border border-slate-300 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-700"><SortHeader label={"Loaded"} sortKey="loadedQty" sort={planSort} onToggle={togglePlanSort} align="right" /></th>
                              <th className="border border-slate-300 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-indigo-700"><SortHeader label={"Pending"} sortKey="pendingQty" sort={planSort} onToggle={togglePlanSort} align="right" /></th>
                              <th className="border-y border-l border-slate-300 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-700">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white">
                            {itemGroup.plans.map((plan) => (
                              <tr key={plan.id} className="hover:bg-slate-50">
                                <td className="whitespace-nowrap border-y border-r border-slate-300 px-3 py-2 text-xs font-medium text-black">{plan.orderNo}</td>
                                <td className="whitespace-nowrap border border-slate-300 px-3 py-2 text-xs font-medium text-black">{plan.firmName}</td>
                                <td className="whitespace-nowrap border border-slate-300 px-3 py-2 text-xs font-bold text-black">{plan.planNo || "-"}</td>
                                <td className="whitespace-nowrap border border-slate-300 px-3 py-2 text-right text-xs text-black">{Number(plan.plannedQty || 0).toLocaleString()}</td>
                                <td className="whitespace-nowrap border border-slate-300 px-3 py-2 text-right text-xs font-bold text-emerald-700">{Number(plan.loadedQty || 0).toLocaleString()}</td>
                                <td className="whitespace-nowrap border border-slate-300 bg-indigo-50/40 px-3 py-2 text-right text-xs font-black text-indigo-700">{plan.pendingQty.toLocaleString()}</td>
                                <td className="whitespace-nowrap border-y border-l border-slate-300 px-3 py-2 text-center">{renderCancelControl(plan)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
            );
          })}
        </div>
      )}

      {loadingModal ? (
        <div className="fixed inset-0 z-50 flex h-screen w-screen bg-slate-950/80 backdrop-blur-sm">
          <div className="flex h-screen w-screen flex-col overflow-hidden bg-white">
            <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b-2 border-slate-950 bg-slate-950 px-5 py-4 text-white sm:px-8">
              <div className="flex items-center gap-3">
                <TruckIcon size={20} className="text-indigo-400" />
                <h3 className="font-black uppercase tracking-widest text-sm">Loading Slip - {companies.find(c => c.id === loadingModal.companyId)?.name}</h3>
              </div>
              <button aria-label="Close loading slip" onClick={handleCloseLoad} className="rounded-lg bg-white/10 p-1.5 transition-transform duration-200 hover:rotate-90 hover:bg-white/20">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto bg-slate-50 p-4 sm:p-6 lg:p-8">
              <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-slate-300 bg-slate-50 p-4 shadow-sm">
                  <div className="text-[10px] text-slate-500 uppercase font-black mb-1">Item Being Loaded</div>
                  <div className="font-bold text-black text-sm">{loadingModal.itemName}</div>
                </div>
                
                <div className="rounded-lg border border-slate-300 bg-slate-50 p-4 shadow-sm">
                  <div className="text-[10px] text-slate-500 uppercase font-black mb-1">Loading Date</div>
                  <div className="font-bold text-black text-sm">{formatDate(new Date().toISOString())}</div>
                </div>

                <div className="flex flex-col justify-center rounded-lg border border-slate-300 bg-slate-50 p-4 shadow-sm">
                  <div className="text-[10px] text-slate-500 uppercase font-black mb-1">Truck Number *</div>
                  <input
                    list="pending-loading-truck-options"
                    value={modalManualTruckNo}
                    onChange={(e) => {
                      const value = e.target.value.toUpperCase();
                      const match = availableTrucks.find((truck) => truck.truckNo.trim().toUpperCase() === value.trim().toUpperCase());
                      setModalManualTruckNo(value);
                      setModalTruckId(match?.id || "");
                    }}
                    className="h-10 w-full rounded border-2 border-slate-400 bg-white px-3 text-sm font-bold uppercase focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                  <datalist id="pending-loading-truck-options">
                    {availableTrucks.map((truck) => (
                      <option key={truck.id} value={truck.truckNo} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="space-y-6">
                {(() => {
                  const modalKey = getModalKey(loadingModal.companyId, loadingModal.itemSource, loadingModal.itemId);
                  const totalPlanned = loadingModal.plans.reduce((sum, plan) => sum + Number(plan.plannedQty || 0), 0);
                  const totalLoaded = loadingModal.plans.reduce((sum, plan) => sum + Number(plan.loadedQty || 0), 0);
                  const totalCancelled = loadingModal.plans.reduce((sum, plan) => sum + Number(plan.canceledQty || 0), 0);
                  const totalPending = loadingModal.plans.reduce((sum, plan) => sum + Number(plan.pendingQty || 0), 0);
                  const rowLoadedQty = Number(loadedQuantities[modalKey] || 0);
                  const fgAvailable = loadingModal.itemSource === "FG" ? getFirmStockBalance(loadingModal.itemId, loadingModal.firmId) : Number.POSITIVE_INFINITY;
                  const maxLoadable = Math.min(totalPending, fgAvailable);
                  const validation = getModalValidation(loadingModal);
                  const phpDetailsPreview = getPreviewLinkedDetails("PHP", rowLoadedQty);
                  const plateDetailsPreview = getPreviewLinkedDetails("PLATE", rowLoadedQty);

                  const jobs = loadingModal.eligibleJobs;

                  const noEligibleJobsMessage = jobs.length === 0;

                  return (
                    <div className="w-full space-y-6">
                        {noEligibleJobsMessage && <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">No eligible production jobs found. FG stock may be used when available.</div>}
                      <div className="overflow-hidden rounded-xl border-2 border-slate-950 shadow-sm">
                        <div className="grid grid-cols-2 gap-px bg-slate-950 text-white md:grid-cols-4">
                          <div className="px-4 py-3 border-r border-white/20">
                            <div className="text-[10px] uppercase text-slate-400 font-black">Planned Total</div>
                            <div className="font-black text-lg">{totalPlanned.toLocaleString()}</div>
                          </div>
                          <div className="px-4 py-3 border-r border-white/20">
                            <div className="text-[10px] uppercase text-slate-400 font-black">Yet to Load</div>
                            <div className="font-black text-lg text-indigo-400">{totalPending.toLocaleString()}</div>
                          </div>
                          <div className="border-r border-white/10 bg-indigo-900/70 px-4 py-3">
                            <div className="text-[10px] uppercase text-indigo-200 font-black">Load Quantity</div>
                            <input
                              type="number"
                              value={rowLoadedQty || ""}
                              onChange={(e) => {
                                const nextValue = e.target.value === "" ? 0 : parseFloat(e.target.value);
                                setLoadedQuantities((prev) => ({
                                  ...prev,
                                  [modalKey]: Math.min(Math.max(nextValue, 0), maxLoadable),
                                }));
                              }}
                              max={maxLoadable}
                              min={0}
                              className="mt-1 w-full rounded bg-yellow-100 px-2 py-1 border-2 border-yellow-400 text-xl font-black text-black focus:outline-none"
                            />
                          </div>
                          <div className="px-4 py-3">
                            <div className="text-[10px] uppercase text-slate-400 font-black">Balance</div>
                            <div className={cn("text-xl font-black", Math.abs(validation.allocatedTotal - rowLoadedQty) < 0.0001 ? "text-emerald-400" : "text-rose-400")}>
                              {(rowLoadedQty - validation.allocatedTotal).toLocaleString()}
                            </div>
                          </div>
                        </div>

                        <div className="table-frozen-scroll overflow-x-auto">
                          <table className="w-full min-w-[680px] divide-y divide-slate-300 border-collapse">
                            <thead className="sticky top-0 z-30 bg-slate-50">
                              <tr className="divide-x divide-slate-300 bg-slate-100">
                                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider">Job No</th>
                                <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-wider">Prod (FG)</th>
                                <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-wider">Already Loaded</th>
                                <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-wider text-emerald-700">Available</th>
                                <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-wider bg-indigo-50">Load Now</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 bg-white">
                              {jobs.map((job) => {
                                const currentValue = jobSplitQtys[modalKey]?.[job.jobId] ?? "";
                                const otherJobAllocations = Object.entries(jobSplitQtys[modalKey] || {})
                                  .filter(([jobId]) => jobId !== job.jobId)
                                  .reduce((sum, [, qty]) => sum + Number(qty || 0), 0);
                                const remainingFgCapacity = loadingModal.itemSource === "FG"
                                  ? Math.max(0, fgAvailable - otherJobAllocations)
                                  : Number.POSITIVE_INFINITY;
                                const jobMax = Math.min(job.yetToLoad, remainingFgCapacity);
                                return (
                                  <tr key={job.jobId} className="divide-x divide-slate-200 transition-colors hover:bg-indigo-50/40">
                                    <td className="px-4 py-3 text-xs font-black text-black">{job.jobNo}</td>
                                    <td className="px-4 py-3 text-right text-xs text-slate-600 font-medium">{job.productionQty.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right text-xs text-slate-600 font-medium">{job.alreadyLoaded.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right text-xs font-black text-emerald-700">{job.yetToLoad.toLocaleString()}</td>
                                    <td className="px-4 py-2 text-right bg-indigo-50/30">
                                      <input
                                        type="number"
                                        value={currentValue}
                                        min={0}
                                        max={jobMax}
                                        onChange={(e) => {
                                          const rawValue = e.target.value;
                                          setJobSplitQtys((prev) => {
                                            const currentRows = prev[modalKey] || {};
                                            if (rawValue === "") return { ...prev, [modalKey]: { ...currentRows, [job.jobId]: "" } };
                                            const parsedValue = Number(rawValue);
                                            if (!Number.isFinite(parsedValue)) return prev;
                                            const otherAllocations = Object.entries(currentRows)
                                              .filter(([jobId]) => jobId !== job.jobId)
                                              .reduce((sum, [, qty]) => sum + Number(qty || 0), 0);
                                            const latestFgCapacity = loadingModal.itemSource === "FG"
                                              ? Math.max(0, fgAvailable - otherAllocations)
                                              : Number.POSITIVE_INFINITY;
                                            const latestMax = Math.min(job.yetToLoad, latestFgCapacity);
                                            const next = Math.max(0, Math.min(parsedValue, latestMax));
                                            return { ...prev, [modalKey]: { ...currentRows, [job.jobId]: next } };
                                          });
                                        }}
                                        className="h-9 w-28 rounded border-2 border-amber-400 bg-amber-50 px-2 py-1.5 text-right text-xs font-black text-black focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-100"
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                              <tr className="divide-x divide-black bg-emerald-50/40 border-t-2 border-black">
                                <td className="px-4 py-4 text-xs font-black uppercase text-emerald-800">{loadingModal.itemSource === "FG" ? `FG Stock - ${getFirmDisplayNameById(loadingModal.firmId, firms)}` : `${loadingModal.itemSource} Stock`}</td>
                                <td className="px-4 py-4 text-right text-xs text-slate-500">-</td>
                                <td className="px-4 py-4 text-right text-xs text-slate-500">-</td>
                                <td className="px-4 py-4 text-right text-xs font-black text-emerald-700">{loadingModal.itemSource === "FG" ? getFirmStockBalance(loadingModal.itemId, loadingModal.firmId).toLocaleString() : "-"}</td>
                                <td className="px-4 py-4 text-right text-xs font-black text-slate-400">-</td>
                              </tr>
                            </tbody>
                            <tfoot className="bg-slate-900 text-white font-black border-t-2 border-black">
                                <tr className="divide-x divide-white/20">
                                    <td colSpan={4} className="px-4 py-3 text-right text-xs uppercase tracking-widest">Total Allocated</td>
                                    <td className="px-4 py-3 text-right text-sm">{validation.allocatedTotal.toLocaleString()}</td>
                                </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                        {[
                          { source: "PHP" as const, title: "PHP Details", rows: phpDetailsPreview, emptyLabel: "No matched PHP item" },
                          { source: "PLATE" as const, title: "Plate Details", rows: plateDetailsPreview, emptyLabel: "No matched Plate item" },
                        ].map((section) => (
                          <div key={section.title} className="overflow-hidden rounded-xl border-2 border-slate-300 bg-white shadow-sm">
                            <div className="bg-slate-900 px-4 py-3 text-sm font-black uppercase tracking-wider text-white">{section.title}</div>
                            <table className="w-full min-w-[700px] divide-y divide-slate-300 border-collapse">
                              <thead className="sticky top-0 z-30 bg-slate-100">
                                <tr className="divide-x divide-black">
                                  <th className="px-4 py-2 text-left text-[10px] font-black uppercase">SL</th>
                                  <th className="px-4 py-2 text-left text-[10px] font-black uppercase">Item ERP</th>
                                  <th className="px-4 py-2 text-left text-[10px] font-black uppercase">Master ERP</th>
                                  <th className="px-4 py-2 text-left text-[10px] font-black uppercase">{section.title === "PHP Details" ? "PHP Item Name" : "Plate Item Name"}</th>
                                  <th className="px-4 py-2 text-right text-[10px] font-black uppercase">Sets/Box</th>
                                  <th className="px-4 py-2 text-right text-[10px] font-black uppercase">Required Qty</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-black">
                                {section.rows.length === 0 ? (
                                  <tr>
                                    <td colSpan={6} className="px-4 py-5 text-center text-xs font-semibold text-slate-500">{section.emptyLabel}</td>
                                  </tr>
                                ) : (
                                  section.rows.map((detail, index) => (
                                    <tr key={`${section.title}-${detail.itemId}`} className="divide-x divide-black">
                                      <td className="px-4 py-2 text-xs font-black">{index + 1}</td>
                                      <td className="px-4 py-2 text-xs font-semibold text-slate-700">{detail.erpCode || "-"}</td>
                                      <td className="px-4 py-2 text-xs font-semibold text-slate-700">{detail.masterErp || "-"}</td>
                                      <td className="px-4 py-2 text-xs font-semibold text-black">{detail.itemName}</td>
                                      <td className="px-4 py-2 text-right text-xs font-black text-slate-700">{detail.setsPerBox.toLocaleString()}</td>
                                      <td className="px-4 py-2 text-right text-xs font-black text-indigo-700">{detail.requiredQty.toLocaleString()}</td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>

                            {section.rows.length > 0 ? (
                              <div className="border-t-2 border-black">
                                <div className="flex items-center justify-between px-4 py-3 bg-indigo-50/60 border-b border-black">
                                  <div className="text-xs font-black uppercase tracking-wider text-black">{section.source} Packing Details</div>
                                  <div className="text-[11px] font-bold text-slate-500">
                                    Total: <span className="text-sm font-black text-emerald-700">{getLinkedPackingTotal(section.source).toLocaleString()}</span>
                                  </div>
                                </div>
                                <table className="min-w-full divide-y divide-black border-collapse">
                                  <thead className="sticky top-0 z-30 bg-slate-100">
                                    <tr className="divide-x divide-black">
                                      <th className="px-4 py-2 text-left text-[10px] font-black uppercase">No. of Bundles</th>
                                      <th className="px-4 py-2 text-left text-[10px] font-black uppercase">Pack Size</th>
                                      <th className="px-4 py-2 text-right text-[10px] font-black uppercase">Quantity</th>
                                      <th className="px-4 py-2 text-center text-[10px] font-black uppercase w-16">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody className="bg-white divide-y divide-black">
                                    {linkedPackingDetails[section.source].map((detail, idx) => (
                                      <tr key={`${section.source}-${idx}`} className="divide-x divide-black">
                                        <td className="px-4 py-2">
                                          <input
                                            type="number"
                                            value={detail.bundles || ""}
                                            onChange={(e) => handleUpdateLinkedPackingRow(section.source, idx, "bundles", parseFloat(e.target.value) || 0)}
                                            className="w-full rounded border-2 border-yellow-400 bg-yellow-100 px-2 py-1 text-xs font-bold text-black focus:border-black focus:outline-none"
                                          />
                                        </td>
                                        <td className="px-4 py-2">
                                          <input
                                            type="number"
                                            value={detail.packSize || ""}
                                            onChange={(e) => handleUpdateLinkedPackingRow(section.source, idx, "packSize", parseFloat(e.target.value) || 0)}
                                            className="w-full rounded border-2 border-yellow-400 bg-yellow-100 px-2 py-1 text-xs font-bold text-black focus:border-black focus:outline-none"
                                          />
                                        </td>
                                        <td className="px-4 py-2 text-right text-xs font-black bg-slate-50">
                                          {detail.quantity.toLocaleString()}
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                          <button
                                            onClick={() => handleRemoveLinkedPackingRow(section.source, idx)}
                                            disabled={linkedPackingDetails[section.source].length <= 1}
                                            className="text-rose-600 hover:text-rose-800 disabled:opacity-30"
                                          >
                                            <Trash2 size={16} />
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                    <tr className="bg-emerald-50/30 border-t-2 border-black">
                                      <td colSpan={2} className="px-4 py-3 text-xs font-black uppercase text-emerald-800 italic">Extra ({section.source})</td>
                                      <td className="px-4 py-2">
                                        <input
                                          type="number"
                                          value={linkedExtraItemsQty[section.source] ?? ""}
                                          onChange={(e) =>
                                            setLinkedExtraItemsQty((prev) => ({
                                              ...prev,
                                              [section.source]: e.target.value === "" ? "" : parseFloat(e.target.value),
                                            }))
                                          }
                                          className="w-full rounded border-2 border-yellow-500 bg-yellow-100 px-2 py-1.5 text-right font-black text-xs text-black focus:ring-0"
                                          placeholder={`Enter ${section.source} Extra Qty`}
                                        />
                                      </td>
                                      <td className="px-4 py-2 text-center">
                                        <button
                                          onClick={() => handleAddLinkedPackingRow(section.source)}
                                          className="bg-black text-white p-1.5 rounded-full hover:bg-slate-800 transition shadow-[2px_2px_0px_0px_rgba(79,70,229,1)] active:shadow-none"
                                        >
                                          <Plus size={16} />
                                        </button>
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-black uppercase tracking-wider text-black flex items-center gap-2">
                                <Package size={16} /> Packing Details
                            </h4>
                            <div className="text-[11px] font-bold text-slate-500">
                                Total: <span className={cn("text-sm font-black", Math.abs(validation.packingTotal - rowLoadedQty) < 0.0001 ? "text-emerald-700" : "text-rose-600")}>
                                    {validation.packingTotal.toLocaleString()}
                                </span> / {rowLoadedQty.toLocaleString()}
                            </div>
                        </div>

                        <div className="border-2 border-black rounded overflow-hidden">
                            <table className="min-w-full divide-y divide-black border-collapse">
                                <thead className="sticky top-0 z-30 bg-slate-100">
                                    <tr className="divide-x divide-black">
                                        <th className="px-4 py-2 text-left text-[10px] font-black uppercase">No. of Bundles</th>
                                        <th className="px-4 py-2 text-left text-[10px] font-black uppercase">Pack Size</th>
                                        <th className="px-4 py-2 text-right text-[10px] font-black uppercase">Quantity</th>
                                        <th className="px-4 py-2 text-center text-[10px] font-black uppercase w-16">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-black">
                                    {packingDetails.map((detail, idx) => (
                                        <tr key={idx} className="divide-x divide-black">
                                            <td className="px-4 py-2">
                                                <input
                                                    type="number"
                                                    value={detail.bundles || ""}
                                                    onChange={(e) => handleUpdatePackingRow(idx, "bundles", parseFloat(e.target.value) || 0)}
                                                    className="w-full rounded border-2 border-yellow-400 bg-yellow-100 px-2 py-1 text-xs font-bold text-black focus:border-black focus:outline-none"
                                                />
                                            </td>
                                            <td className="px-4 py-2">
                                                <input
                                                    type="number"
                                                    value={detail.packSize || ""}
                                                    onChange={(e) => handleUpdatePackingRow(idx, "packSize", parseFloat(e.target.value) || 0)}
                                                    className="w-full rounded border-2 border-yellow-400 bg-yellow-100 px-2 py-1 text-xs font-bold text-black focus:border-black focus:outline-none"
                                                />
                                            </td>
                                            <td className="px-4 py-2 text-right text-xs font-black bg-slate-50">
                                                {detail.quantity.toLocaleString()}
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                                <button
                                                    onClick={() => handleRemovePackingRow(idx)}
                                                    disabled={packingDetails.length <= 1}
                                                    className="text-rose-600 hover:text-rose-800 disabled:opacity-30"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    <tr className="bg-emerald-50/30 border-t-2 border-black">
                                        <td colSpan={2} className="px-4 py-3 text-xs font-black uppercase text-emerald-800 italic">Extra Items (Loose)</td>
                                        <td className="px-4 py-2">
                                            <input
                                                type="number"
                                                value={extraItemsQty ?? ""}
                                                onChange={(e) => setExtraItemsQty(e.target.value === "" ? "" : parseFloat(e.target.value))}
                                                className="w-full rounded border-2 border-yellow-500 bg-yellow-100 px-2 py-1.5 text-right font-black text-xs text-black focus:ring-0"
                                            />
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                            <button
                                                onClick={handleAddPackingRow}
                                                className="bg-black text-white p-1.5 rounded-full hover:bg-slate-800 transition shadow-[2px_2px_0px_0px_rgba(79,70,229,1)] active:shadow-none"
                                            >
                                                <Plus size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="sticky bottom-0 z-10 flex flex-col items-start justify-between gap-4 border-t-2 border-slate-950 bg-white/95 p-4 shadow-[0_-6px_16px_rgba(15,23,42,0.12)] backdrop-blur sm:flex-row sm:items-center sm:p-5">
                <div className="flex flex-col">
                    <div className="text-[10px] font-black uppercase text-slate-500">Remaining Balance</div>
                    <div className={cn("text-2xl font-black", Math.abs(getModalValidation(loadingModal).allocatedTotal - Number(loadedQuantities[getModalKey(loadingModal.companyId, loadingModal.itemSource, loadingModal.itemId)] || 0)) < 0.0001 ? "text-emerald-600" : "text-rose-600")}>
                        {(Number(loadedQuantities[getModalKey(loadingModal.companyId, loadingModal.itemSource, loadingModal.itemId)] || 0) - getModalValidation(loadingModal).allocatedTotal).toLocaleString()}
                    </div>
                </div>
                <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:gap-3">
                    <button
                    onClick={handleCloseLoad}
                    className="rounded border-2 border-slate-950 px-6 py-3 text-xs font-black uppercase tracking-widest transition hover:bg-slate-100 active:translate-y-[2px] sm:px-8"
                    >
                    Cancel
                    </button>
                    <button
                    onClick={handleSubmitLoading}
                    disabled={isSubmitting || modalHasErrors}
                    className="rounded bg-indigo-700 px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] transition hover:bg-indigo-800 disabled:opacity-50 disabled:shadow-none active:translate-x-1 active:translate-y-1 sm:px-10"
                    >
                    {isSubmitting ? <Spinner size={16} className="text-white" /> : "Confirm & Save Loading"}
                    </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
