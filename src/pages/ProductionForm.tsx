import React, { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { useSearchParams } from "react-router-dom";
import { useData } from "../hooks/useData";
import {
  Company,
  DispatchPlan,
  Item,
  LoadingSlip,
  Order,
  OrderSchedule,
  Production,
  Setting,
  SampleRequest,
  Firm,
} from "../types";
import { Spinner } from "../components/Spinner";

import { generateTransactionNo, getProductionJobPrefix } from "../lib/serial";
import { CheckCircle2, CircleHelp, X } from "lucide-react";
import { parseProductionFormVisibleColumns } from "../lib/productionFormColumns";
import { fetchNpdItems } from "../lib/npdItems";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { getProductionMatchingFields } from "../lib/productionMatching";
import { buildScheduleConsumptionByScheduleId } from "../lib/productionScheduleQty";
import { findRealizationTargetForDate, parseRealizationTargets } from "../lib/realizationTargets";
import { calculateInternalUps } from "../lib/internalUps";
import {
  calculateProductionGsm,
  calculateProductionReel,
  calculateProductionTakeUpFactor,
  calculateProductionDerivedValues,
  calculateProductionIdToOd,
  calculateProductionIdToOd2,
} from "../lib/productionCalculations";

const getJobMasterEntityName = (source: "PHP" | "PLATE") =>
  source === "PHP" ? "php_job_master" : "plate_job_master";

function getReelAsPerCalculationHelpText() {
  return "Fixed formula: if Breadth is blank/0, use Height x UPS; otherwise use ((Breadth + Height) x UPS) + ((ID to OD x UPS) + 16).";
}

function getCuttingSizeHelpText() {
  return "Fixed formula: if Breadth is blank/0, use Length; otherwise use ((Length + Breadth) x 2) + (ID to OD 2 x Number of Parts) for one-part jobs, or Length + Breadth + ID to OD 2 for two-part jobs.";
}

function getGsmHelpText() {
  return "Fixed formula: L1 + (F1 x Take up Factor) + L2 + (F2 x Take up Factor) + L3.";
}

function joinPrintingColors(color1?: string, color2?: string) {
  return [color1?.trim(), color2?.trim()].filter(Boolean).join(" / ");
}

function normalizeNumericPart(value?: string | number | null): 1 | 2 | null {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "1" || normalized === "SINGLE") return 1;
  if (normalized === "2" || normalized === "2 PART BOX") return 2;
  return null;
}

function round2(value: number) {
  return parseFloat(value.toFixed(2));
}

function roundUpWhole(value: number) {
  return Math.ceil(value);
}

function getMandatoryLayerFields(ply: number) {
  const fieldsByPly: Record<number, Array<"L1" | "F1" | "L2" | "F2" | "L3">> = {
    1: ["L1"],
    2: ["L1", "F1"],
    3: ["L1", "F1", "L2"],
    4: ["L1", "F1", "L2", "F2"],
    5: ["L1", "F1", "L2", "F2", "L3"],
  };
  return fieldsByPly[ply] || [];
}

function isBlankRequiredValue(value: string | number) {
  return value === "" || value === null || value === undefined;
}

function normalizeItemLookupKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function getNpdLookupKeys(value: any) {
  return [...new Set([
    value?.id,
    value?.npdId,
    value?.itemId,
    value?.erp,
    value?.erpCode,
    value?.raw?.id,
    value?.raw?.npdId,
    value?.raw?.itemId,
    value?.raw?.erp,
    value?.raw?.erpCode,
  ].map(normalizeItemLookupKey).filter(Boolean))];
}

function findNpdItemForOrder(order: Order | undefined, catalogItem: any, npdItems: Item[]) {
  const linkedKeys = [
    order?.itemId,
    order?.npdId,
    catalogItem?.id,
    catalogItem?.raw?.id,
    catalogItem?.raw?.npdId,
    catalogItem?.raw?.itemId,
  ].map(normalizeItemLookupKey).filter(Boolean);

  const byLinkedId = npdItems.find((item) => {
    const itemKeys = getNpdLookupKeys(item);
    return linkedKeys.some((key) => itemKeys.includes(key));
  });
  if (byLinkedId) return byLinkedId;

  const erpKeys = [order?.erpCode, catalogItem?.erp, catalogItem?.raw?.erp, catalogItem?.raw?.erpCode]
    .map(normalizeItemLookupKey)
    .filter(Boolean);
  return npdItems.find((item) => erpKeys.some((key) => getNpdLookupKeys(item).includes(key)));
}

function isSameNpdItem(item: Item | undefined, value: any) {
  if (!item) return false;
  const itemKeys = getNpdLookupKeys(item);
  return getNpdLookupKeys(value).some((key) => itemKeys.includes(key));
}

function isPlateItemForProductionForm(order?: Order, item?: Item) {
  const source = String(order?.itemSource || "").trim().toUpperCase();
  const itemLabel = String((item as any)?.boxType || item?.typeName || item?.name || "").trim().toUpperCase();
  return source === "PLATE" || itemLabel.includes("PLATE");
}
function getPendingProductionQty(schedule: OrderSchedule, consumedQty: number) {
  return Math.max(
    Number(schedule.qty || 0) - Number(consumedQty || 0) - Number(schedule.canceledQty || 0),
    0
  );
}

function getScheduleInvoicedQty(scheduleId: string, plans: DispatchPlan[], loadingSlips: LoadingSlip[]) {
  const schedulePlans = plans.filter((plan) => plan.scheduleId === scheduleId);
  const planIds = new Set(schedulePlans.map((plan) => plan.id));

  let invoiced = 0;
  loadingSlips.forEach((slip) => {
    slip.lines.forEach((line) => {
      if (planIds.has(line.dispatchPlanId) && slip.invoiceId) {
        invoiced += Number(line.loadedQty) || 0;
      }
    });
  });

  return invoiced;
}

function createInitialFormData(initialDate: string) {
  return {
    date: initialDate,
    qty: "" as number | "",
    remarks: "",
    noOfParts: "" as number | "",
    ups: "" as number | "",
    length: "" as number | "",
    breadth: "" as number | "",
    height: "" as number | "",
    reelAsPerCalc: "" as number | "",
    noOfUpsInCuttingForPlates: "" as number | "",
    reelActualWithTrimming: "" as number | "",
    cuttingWithTrimming: "" as number | "",
    ply: "" as number | "",
    idToOd: "" as number | "",
    idToOd2: "" as number | "",
    flute: "",
    takeUpFactor: "" as number | "",
    l1: "" as number | "",
    f1: "" as number | "",
    l2: "" as number | "",
    f2: "" as number | "",
    l3: "" as number | "",
    gsm: "" as number | "",
    color1: "",
    color2: "",
    printingColor: "",
    sheetWeight: "" as number | "",
    plateWeight: "" as number | "",
    totalPaperWeight: "" as number | "",
    rate: "" as number | "",
    totalWeightOfSet: "" as number | "",
    realizationPerKg: "" as number | "",
    companyName: "",
    actualPaperUsed: "" as number | "",
    prodFromSheetPlant: "" as number | "",
    prodFromFFG: "" as number | "",
    productionInMeter: "" as number | "",
    plannedProductionInMeter: "" as number | "",
    leastGsm: "" as number | "",
    fluteBatches: "",
    erpCodeReel: "",
    erpCode: "",
  };
}

export function ProductionForm() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [productions, setProductions] = useData<Production>("productions", [], { firmScope: "all" });
  const [phpJobMaster] = useData<Production>(getJobMasterEntityName("PHP"), [], { firmScope: "all" });
  const [plateJobMaster] = useData<Production>(getJobMasterEntityName("PLATE"), [], { firmScope: "all" });
  const [schedules, setSchedules] = useData<OrderSchedule>("orders_schedule", [], { firmScope: "all" });
  const [orders] = useData<Order>("orders", [], { firmScope: "all" });
  const [companies] = useData<Company>("companies", [], { firmScope: "all" });
  const [plans] = useData<DispatchPlan>("dispatch_plans", []);
  const [loadingSlips] = useData<LoadingSlip>("loading_slips", []);
  const [sampleRequests, setSampleRequests] = useData<SampleRequest>("sample_requests", []);
  const [settings] = useData<Setting>("settings", []);
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const [npdItems, setNpdItems] = useState<Item[]>([]);
  const { resolveOrderItem } = useOrderItemCatalog();
  const lastPrefilledSelectionKey = useRef("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveNotice, setSaveNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const urlScheduleId = searchParams.get("scheduleId") || searchParams.get("scheduledId") || "";
  const [selectedScheduleId, setSelectedScheduleId] = useState(urlScheduleId);
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const [formData, setFormData] = useState(() => createInitialFormData(todayStr));

  useEffect(() => {
    if (!saveNotice) return;
    const timeoutId = window.setTimeout(() => setSaveNotice(null), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [saveNotice]);

  useEffect(() => {
    fetchNpdItems()
      .then(setNpdItems)
      .catch((error) => {
        console.error("Failed to fetch NPD items for Production Form:", error);
        setNpdItems([]);
      });
  }, []);

  const consumptionByScheduleId = useMemo(
    () => buildScheduleConsumptionByScheduleId(productions, phpJobMaster, plateJobMaster),
    [phpJobMaster, plateJobMaster, productions]
  );

  const pendingSchedules = useMemo(
    () =>
      schedules
        .filter((schedule) => getPendingProductionQty(schedule, Number(consumptionByScheduleId.get(schedule.id)?.effectiveConsumedQty || 0)) > 0)
        .sort((a, b) => {
          const timeA = new Date(a.updateTimestamp || a.scheduledDate || 0).getTime();
          const timeB = new Date(b.updateTimestamp || b.scheduledDate || 0).getTime();
          return timeB - timeA;
        }),
    [consumptionByScheduleId, schedules]
  );

  const erpLeastGsmMap = useMemo(() => {
    const map = new Map<string, number>();
    productions.forEach((production) => {
      if ((production.itemSource || "FG") !== "FG" || production.status === "Cancelled" || production.cancelTimestamp) return;

      const erp = String(production.erpCode || "").trim();
      const gsm = Number(production.gsm || 0);
      if (erp && gsm > 0) {
        if (!map.has(erp) || gsm < map.get(erp)!) {
          map.set(erp, gsm);
        }
      }
    });
    return map;
  }, [productions]);

  const selectedSchedule = pendingSchedules.find((schedule) => schedule.id === selectedScheduleId);
  const selectedOrder = orders.find((order) => order.id === selectedSchedule?.orderId);
  const selectedCatalogItem = resolveOrderItem(selectedOrder);
  const selectedItem = findNpdItemForOrder(selectedOrder, selectedCatalogItem, npdItems);
  const selectedInternalUps = calculateInternalUps((selectedItem as any)?.rapcForSingleBox);
  const selectedCompany = companies.find((company) => company.id === selectedOrder?.companyId);
  const selectedErp = String(selectedItem?.erp ?? selectedCatalogItem?.erp ?? selectedOrder?.erpCode ?? "").trim();
  const selectedScheduleConsumedQty = selectedSchedule
    ? Number(consumptionByScheduleId.get(selectedSchedule.id)?.effectiveConsumedQty || 0)
    : 0;
  const pendingQty = selectedSchedule ? getPendingProductionQty(selectedSchedule, selectedScheduleConsumedQty) : 0;
  const realizationTargets = useMemo(
    () => parseRealizationTargets(settings[0]?.realizationPerKgTargets),
    [settings]
  );
  const selectedRealizationTarget = useMemo(
    () => findRealizationTargetForDate(realizationTargets, formData.date),
    [formData.date, realizationTargets]
  );
  const visibleColumns = useMemo(
    () => new Set(parseProductionFormVisibleColumns(settings[0]?.productionFormVisibleColumns)),
    [settings]
  );
  const showField = (label: string) => visibleColumns.has(label);

  const latestRelevantProduction = useMemo(
    () =>
      [...productions]
        .filter((production) => (production.itemSource || "FG") === "FG" && production.status !== "Cancelled" && !production.cancelTimestamp)
        .sort((a, b) => {
          const timeA = new Date(a.updateTimestamp || a.date || 0).getTime();
          const timeB = new Date(b.updateTimestamp || b.date || 0).getTime();
          return timeB - timeA;
        })[0],
    [productions]
  );

  const lastItem = npdItems.find((item) => isSameNpdItem(item, latestRelevantProduction));
  const lastPlanQty = Number(latestRelevantProduction?.qty || 0);
  const isSameAsLastItem = Boolean(selectedItem?.id && lastItem?.id && selectedItem.id === lastItem.id);

  const pendingSampleRows = useMemo(() => {
    if (!selectedItem?.id) return [];

    return [...sampleRequests]
      .filter(
        (row) =>
          isSameNpdItem(selectedItem, row) &&
          !row.cancelTimestamp &&
          (row.jobCardNo === "" || row.jobCardNo === null || row.jobCardNo === undefined)
      )
      .sort((a, b) => {
        const timeA = new Date(a.updateTimestamp || a.timestamp || a.date || 0).getTime();
        const timeB = new Date(b.updateTimestamp || b.timestamp || b.date || 0).getTime();
        return timeB - timeA;
      });
  }, [sampleRequests, selectedItem?.id]);

  const sampleItemQty = pendingSampleRows.length > 0 ? Number(pendingSampleRows[0].plannedQuantity || 0) : 0;
  const isSampleItem = pendingSampleRows.length > 0;
  const sampleItemLabel = isSampleItem ? "YES" : "NO";
  const matchedSampleRequest = pendingSampleRows[0];
  const deviationAllowed = Number(selectedCompany?.deviationAllowed ?? 25);

  const pendingOrderQtyForItem = useMemo(() => {
    if (!selectedItem?.id) return 0;

    return schedules.reduce((sum, schedule) => {
      const order = orders.find((row) => row.id === schedule.orderId);
      if (!order || !isSameNpdItem(selectedItem, order)) return sum;

      const invoiced = getScheduleInvoicedQty(schedule.id, plans, loadingSlips);
      const pendingOrderQty = Math.max(
        (Number(schedule.qty) || 0) - (Number(schedule.canceledQty) || 0) - invoiced,
        0
      );

      return pendingOrderQty > 0 ? sum + pendingOrderQty : sum;
    }, 0);
  }, [selectedItem?.id, schedules, orders, plans, loadingSlips]);

  const productionInProgress = useMemo(() => {
    if (!selectedItem?.id) return 0;

    return productions
      .filter((production) => {
        const prodFromFFGValue = production.prodFromFFG;
        const hasFFGValue = !(prodFromFFGValue === null || prodFromFFGValue === undefined || String(prodFromFFGValue) === "");

        return isSameNpdItem(selectedItem, production) && !production.cancelTimestamp && !hasFFGValue;
      })
      .reduce((sum, production) => sum + (Number(production.qty) || 0), 0);
  }, [productions, selectedItem?.id]);

  const maximumAllowedProduction = Math.max(
    pendingOrderQtyForItem - Number(selectedItem?.balance || 0) - productionInProgress,
    0
  );

  const currentQty = Number(formData.qty || 0);
  const isSelectedPlateItem = isPlateItemForProductionForm(selectedOrder, selectedItem);
  const mandatoryLayerFields = getMandatoryLayerFields(Number(formData.ply)).filter((label) => showField(label));
  const missingMandatoryLayerFields = mandatoryLayerFields.filter((label) => {
    const fieldName = label.toLowerCase() as "l1" | "f1" | "l2" | "f2" | "l3";
    return isBlankRequiredValue(formData[fieldName]);
  });
  const hasMissingMandatoryLayerFields = missingMandatoryLayerFields.length > 0;
  const isLayerRequired = (label: "L1" | "F1" | "L2" | "F2" | "L3") => mandatoryLayerFields.includes(label);
  const reelActualTrimMissing = showField("Reel Actual Trim") && Number(formData.reelActualWithTrimming || 0) <= 0;
  const allJobRows = useMemo(() => [...productions, ...phpJobMaster, ...plateJobMaster], [productions, phpJobMaster, plateJobMaster]);
  const currentGsm = Number(formData.gsm || 0);
  const leastGsm = Number(formData.leastGsm || 0);
  const deviationLimit = isSameAsLastItem ? Number((lastPlanQty * (deviationAllowed / 100)).toFixed(2)) : 0;
  const maximumDeviationQty =
    isSameAsLastItem && lastPlanQty > 0
      ? Number((lastPlanQty + deviationLimit).toFixed(2))
      : 0;

  const quantityDeviationError =
    !isSampleItem &&
    isSameAsLastItem &&
    currentQty > 0 &&
    maximumDeviationQty > 0 &&
    currentQty > maximumDeviationQty;

  const maximumAllowedProductionError =
    currentQty > 0 &&
    maximumAllowedProduction > 0 &&
    currentQty > maximumAllowedProduction;

  const gsmValidationError =
    !isSampleItem &&
    !isSameAsLastItem &&
    currentGsm > 0 &&
    leastGsm > 0 &&
    currentGsm > leastGsm;

  const realizationValue = Number(formData.realizationPerKg || 0);
  const realizationTargetValue = Number(selectedRealizationTarget?.value || 0);
  const realizationBelowTarget =
    Boolean(selectedRealizationTarget) &&
    realizationValue > 0 &&
    realizationTargetValue > 0 &&
    realizationValue < realizationTargetValue;

  useEffect(() => {
    if (!selectedItem || !selectedSchedule) return;

    // A selection gets one NPD prefill. This keeps NPD authoritative when the
    // schedule changes without replacing an operator's subsequent edits.
    const selectionKey = `${selectedSchedule.id}:${selectedItem.id}`;
    if (lastPrefilledSelectionKey.current === selectionKey) return;
    lastPrefilledSelectionKey.current = selectionKey;

    setFormData((prev) => ({
      ...prev,
      companyName: selectedCompany?.name || "",
      rate: selectedOrder?.rate ?? "",
      erpCode: String(selectedItem.erp ?? selectedOrder?.erpCode ?? ""),
      noOfParts: selectedItem.noOfParts ?? "",
      ups: selectedInternalUps ?? selectedItem.ups ?? "",
      length: selectedItem.length ?? "",
      breadth: selectedItem.breadth ?? "",
      height: selectedItem.height ?? "",
      ply: selectedItem.ply ?? "",
      flute: selectedItem.flute || "",
      plateWeight: selectedItem.plateWeight ?? "",
      takeUpFactor: calculateProductionTakeUpFactor(selectedItem.flute),
      l1: selectedItem.l1 ?? "",
      f1: selectedItem.f1 ?? "",
      l2: selectedItem.l2 ?? "",
      f2: selectedItem.f2 ?? "",
      l3: selectedItem.l3 ?? "",
      color1: selectedItem.printingColour1 || "",
      color2: selectedItem.printingColour2 || "",
      printingColor: joinPrintingColors(selectedItem.printingColour1, selectedItem.printingColour2),
    }));
  }, [selectedItem, selectedSchedule, selectedCompany, selectedOrder, selectedInternalUps]);

  useEffect(() => {
    if (!selectedScheduleId) {
      setFormData((prev) => ({ ...prev, date: todayStr }));
      return;
    }
    if (!selectedSchedule) return;
    setFormData((prev) => ({ ...prev, date: todayStr }));
  }, [selectedScheduleId, selectedSchedule?.id, todayStr]);

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      qty: isSampleItem ? sampleItemQty : "",
    }));
  }, [selectedScheduleId, selectedItem?.id, isSampleItem, sampleItemQty]);

  useEffect(() => {
    const ply = Number(formData.ply);
    const length = Number(formData.length);
    const breadth = Number(formData.breadth);
    const height = Number(formData.height);
    const ups = Number(formData.ups);
    const noOfParts = Number(formData.noOfParts);
    const qty = Number(formData.qty);
    const rate = Number(formData.rate);
    const plateWeight = Number(formData.plateWeight);
    const idToOd = calculateProductionIdToOd(ply);
    const idToOd2 = calculateProductionIdToOd2(ply);

    const takeUpFactor = calculateProductionTakeUpFactor(formData.flute);
    const l1 = Number(formData.l1 || 0);
    const f1 = Number(formData.f1 || 0);
    const l2 = Number(formData.l2 || 0);
    const f2 = Number(formData.f2 || 0);
    const l3 = Number(formData.l3 || 0);

    const gsm = calculateProductionGsm({ flute: formData.flute, l1, f1, l2, f2, l3 });
    const reelAsPerCalc = calculateProductionReel({ breadth, height, ups, idToOd });

    let cutting = 0;
    if (!breadth) {
      cutting = length;
    } else if (noOfParts === 1) {
      cutting = (length + breadth) * 2 + idToOd2 * noOfParts;
    } else if (noOfParts === 2) {
      cutting = length + breadth + idToOd2;
    }

    const productionInMeter = ups > 0 ? ((cutting * qty) / 1000) / ups : 0;
    const plannedProductionInMeter =
      cutting > 0 && qty > 0 && ups > 0 ? parseFloat((((cutting * qty) / 1000) / ups).toFixed(2)) : "";
    const normalizedFlute = formData.flute.toUpperCase().trim().replace(/\s+/g, "");
    const fluteBatchMap: Record<string, string> = {
      A: "1",
      B: "2",
      "B+C": "3",
      C: "4",
      E: "5",
    };
    const fluteBatches = fluteBatchMap[normalizedFlute] || "";
    const leastGsmValue = erpLeastGsmMap.get(selectedErp) ?? "";
    const printingColor = joinPrintingColors(formData.color1, formData.color2);

    const plannedQty = qty;
    const reelActualWithTrimming = Number(formData.reelActualWithTrimming || 0);
    const derived = calculateProductionDerivedValues({
      reelActualWithTrimming,
      cuttingWithTrimming: cutting,
      gsm,
      ups,
      planQty: plannedQty,
      plateWeight,
      rate,
      noOfParts,
    });
    const sheetWeight = derived.sheetWeight;
    const sheetWeightValue = sheetWeight ?? 0;
    const totalPaperWeight = derived.totalPaperWeight;
    const totalWeightOfSet = derived.totalWeightOfSet;
    const realizationPerKg = derived.realizationPerKg;


    setFormData((prev) => ({
      ...prev,
      idToOd,
      idToOd2,
      takeUpFactor,
      gsm: round2(gsm),
      reelAsPerCalc: round2(reelAsPerCalc),
      cuttingWithTrimming: round2(cutting),
      sheetWeight: sheetWeight === null ? "" : round2(sheetWeight),
      totalPaperWeight: totalPaperWeight === null ? "" : round2(totalPaperWeight),
      totalWeightOfSet: totalWeightOfSet === null ? "" : round2(totalWeightOfSet),
      realizationPerKg: realizationPerKg === null ? "" : round2(realizationPerKg),
      productionInMeter: round2(productionInMeter),
      plannedProductionInMeter: plannedProductionInMeter === "" ? "" : round2(Number(plannedProductionInMeter)),
      fluteBatches,
      leastGsm: leastGsmValue,
      printingColor,
    }));
  }, [
    formData.color1,
    formData.color2,
    formData.erpCode,
    formData.ply,
    formData.flute,
    formData.length,
    formData.breadth,
    formData.height,
    formData.ups,
    formData.noOfParts,
    formData.l1,
    formData.f1,
    formData.l2,
    formData.f2,
    formData.l3,
    formData.qty,
    formData.rate,
    formData.plateWeight,
    formData.reelActualWithTrimming,
    erpLeastGsmMap,
    selectedErp,
  ]);

  useEffect(() => {
    if (urlScheduleId && urlScheduleId !== selectedScheduleId) {
      setSelectedScheduleId(urlScheduleId);
    }
  }, [selectedScheduleId, urlScheduleId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedSchedule || !selectedOrder || !selectedItem || !formData.date) return;
    if (formData.date < todayStr) {
      alert("Production Date cannot be earlier than today.");
      return;
    }
    const selectedOrderFirmId = String((selectedOrder as any).firmId || (selectedOrder as any).orderFirmId || selectedSchedule.firmId || "").trim();
    if (hasMissingMandatoryLayerFields) {
      alert(`Please fill mandatory layer fields: ${missingMandatoryLayerFields.join(", ")}.`);
      return;
    }
    if (reelActualTrimMissing) {
      alert("Reel Actual Width Trimming (RAWT) is mandatory and must be greater than 0.");
      return;
    }

    const qty = Number(formData.qty);
    if (qty <= 0 || quantityDeviationError || maximumAllowedProductionError || gsmValidationError) return;

    const firmByName = (name: string) => firms.find((firm) => String(firm.firmName || "").trim().toLowerCase().includes(name.toLowerCase()));
    const productionLabel = `${String((selectedItem as any).category || "")} ${String((selectedItem as any).boxType || "")} ${String((selectedItem as any).typeName || "")} ${String((selectedOrder as any).jobType || "")}`.toLowerCase();
    const isCorrugation = productionLabel.includes("corrug");
    const isPrinting = productionLabel.includes("printing") || productionLabel.includes("print");
    const forcedFirm = isCorrugation ? firmByName("unit 1") : isPrinting ? firmByName("unit 2") : undefined;
    const productionFirmId = String(forcedFirm?.id || selectedOrderFirmId).trim();
    if (!productionFirmId) {
      setSaveNotice({ type: "error", message: "Firm ownership is missing. Select an order or configure the firm in Firm Master before planning this job." });
      return;
    }

    setIsSubmitting(true);
    try {
      const timestamp = new Date().toISOString();
      const nextPendingQty = pendingQty - qty;
      const txnNo = generateTransactionNo(getProductionJobPrefix("FG"), allJobRows, formData.date);

      const newEntry: Production = {
        id: crypto.randomUUID(),
        transactionNo: txnNo,
        date: formData.date,
        scheduleId: selectedSchedule.id,
        itemId: selectedItem.id,
        itemSource: "FG",
        npdId: selectedItem.id,
        qty,
        uom: selectedItem.uom || "",
        remarks: formData.remarks,
        status: "Pending Consumption",
        updatedBy: "System User",
        updateTimestamp: timestamp,
        orderFirmId: selectedOrderFirmId || undefined,
        sourceFirmId: productionFirmId || undefined,
        firmId: productionFirmId || undefined,
        interFirmFlow: productionFirmId && selectedOrderFirmId && productionFirmId !== selectedOrderFirmId ? "Yes" : "No",
        ...Object.fromEntries(
          Object.entries(formData).filter(([key]) => !["date", "qty", "remarks"].includes(key))
        ),
      } as Production;

      const normalizedEntry: Production = {
        ...newEntry,
        ...getProductionMatchingFields(newEntry, selectedItem),
      };

      await setProductions((prev) => [normalizedEntry, ...prev]);

      if (isSampleItem && matchedSampleRequest?.id) {
        await setSampleRequests((prev) =>
          prev.map((row) =>
            row.id === matchedSampleRequest.id
              ? {
                  ...row,
                  jobCardNo: txnNo,
                  updatedBy: "System User",
                  updateTimestamp: timestamp,
                }
              : row
          )
        );
      }

      await setSchedules((prev) =>
        prev.map((schedule) =>
          schedule.id === selectedSchedule.id
            ? {
                ...schedule,
                producedQty: Number(schedule.producedQty || 0) + qty,
                updateTimestamp: timestamp,
                updatedBy: "System User",
              }
            : schedule
        )
      );

      setFormData(createInitialFormData(todayStr));

      if (nextPendingQty <= 0) {
        setSelectedScheduleId("");
        setSearchParams({});
      }
      setSaveNotice({ type: "success", message: `Plan Job saved successfully. Job No: ${txnNo}` });
    } catch (err) {
      console.error("Failed to save production:", err);
      setSaveNotice({ type: "error", message: err instanceof Error ? err.message : "Failed to save Plan Job." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {saveNotice && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none px-4">
          <div
            role="alert"
            className={cn(
              "pointer-events-auto flex w-full max-w-lg items-center gap-3 rounded-lg border-2 border-black px-5 py-4 text-center shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]",
              saveNotice.type === "success" ? "bg-emerald-100 text-emerald-900" : "bg-rose-100 text-rose-900"
            )}
          >
            {saveNotice.type === "success" ? <CheckCircle2 className="shrink-0" size={28} /> : <X className="shrink-0" size={28} />}
            <span className="flex-1 text-center text-base font-black">{saveNotice.message}</span>
            <button
              type="button"
              onClick={() => setSaveNotice(null)}
              className="shrink-0 rounded border border-black bg-white p-1 text-black hover:bg-slate-100"
              aria-label="Close notification"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}
      <div className="flex justify-between items-center pb-4 border-b border-black">
        <h2 className="text-xl font-bold text-black uppercase tracking-tight">Production Form</h2>
      </div>

      <div className="bg-white p-4 rounded shadow-sm border border-black w-full">
        <form onSubmit={handleSubmit} className="space-y-5">
          {selectedSchedule && selectedOrder && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 border border-black p-4 rounded">
              <InfoTile label="Schedule No" value={selectedSchedule.scheduleNo || "-"} />
              <InfoTile label="Order No" value={selectedOrder.orderNo || "-"} />
              <InfoTile label="Company" value={selectedCompany?.name || "-"} />
              <InfoTile label="Item" value={selectedItem?.name || "-"} />
              <InfoTile label="Type" value={String((selectedItem as any)?.boxType || "-")} />
              <InfoTile label="ERP Code" value={selectedOrder.erpCode || "-"} />
              <InfoTile label="Schedule Qty" value={`${selectedSchedule.qty || 0}${selectedItem?.uom ? ` ${selectedItem.uom}` : ""}`} />
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {showField("Production Date") && <div className="flex flex-col space-y-1">
              <LabelWithHelp
                label="Production Date"
                required
                helpText="Production date defaults to today. Only today or a future date is allowed; earlier dates are not permitted."
              />
              <input
                type="date"
                value={formData.date}
                min={todayStr}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
                className="border-2 border-black rounded p-2 text-black bg-yellow-100 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 shadow-sm"
              />
            </div>}

            {showField("Pending Order Quantity") && <ReadOnlyNumberField
              label="Pending Order Quantity"
              value={pendingOrderQtyForItem}
              suffix={selectedItem?.uom || ""}
              helpText="For the selected item, this is the total of all positive pending schedule quantities. Formula per schedule: Scheduled Qty - Cancelled Qty - Invoiced Qty."
            />}

            {showField("Current Balance") && <ReadOnlyNumberField
              label="Current Balance"
              value={Number(selectedItem?.balance || 0)}
              suffix={selectedItem?.uom || ""}
              helpText="This comes from the item balance logic used in Item Master. Formula: Opening + Receipt + Production - Invoiced."
            />}

            {showField("Production In Progress") && <ReadOnlyNumberField
              label="Production In Progress"
              value={productionInProgress}
              suffix={selectedItem?.uom || ""}
              helpText="For the selected item, this sums production rows where Production from FFG is blank and Cancel Timestamp is blank."
            />}

            {showField("Maximum Allowed Production") && <ReadOnlyNumberField
              label="Maximum Allowed Production"
              value={maximumAllowedProduction}
              suffix={selectedItem?.uom || ""}
              helpText={`Maximum allowed production is calculated as Pending Order Quantity (${pendingOrderQtyForItem.toLocaleString()} ${selectedItem?.uom || "units"}) - Current Balance (${Number(selectedItem?.balance || 0).toLocaleString()} ${selectedItem?.uom || "units"}) - Production In Progress (${productionInProgress.toLocaleString()} ${selectedItem?.uom || "units"}) = ${maximumAllowedProduction.toLocaleString()} ${selectedItem?.uom || "units"}. The result is never shown below zero.`}
            />}

            {showField("Sample Item") && <ReadOnlyTextField
              label="Sample Item"
              value={sampleItemLabel}
              helpText="YES means there is at least one pending sample request for this item with no cancel and no job card."
            />}

            {showField("Sample Item Qty") && <ReadOnlyNumberField
              label="Sample Item Qty"
              value={sampleItemQty || 0}
              suffix={selectedItem?.uom || ""}
              helpText="One pending sample request quantity for this item. This is used to auto-fill planned quantity when the item is a sample item."
            />}

            {showField("Last Item") && <ReadOnlyTextField
              label="Last Item"
              value={lastItem?.name || "-"}
              helpText="Latest relevant non-cancelled production item from Production Master history."
            />}

            {showField("Last Plan Qty") && <ReadOnlyNumberField
              label="Last Plan Qty"
              value={lastPlanQty}
              suffix={lastItem?.uom || ""}
              helpText="Latest relevant non-cancelled production quantity from Production Master history."
            />}

            {showField("Deviation Allowed") && <ReadOnlyNumberField
              label="Deviation Allowed"
              value={deviationAllowed}
              suffix="%"
              helpText="Company-wise deviation percentage from Companies Master. If company value is blank, fallback 25 is used."
            />}

            {showField("Planned Quantity") && <div className="flex flex-col space-y-1">
              <LabelWithHelp
                label="Planned Quantity"
                required
                helpText="If this item has a pending sample request, quantity is auto-filled from sample quantity and becomes read-only. Otherwise it stays manual. If the current item is same as the last produced item, deviation validation is applied."
              />
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min={0}
                  value={formData.qty}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      qty: e.target.value === "" ? "" : parseFloat(e.target.value),
                    })
                  }
                  readOnly={isSampleItem}
                  required
                  placeholder={isSampleItem ? "Auto-filled from sample request" : "Enter planned quantity"}
                  className={cn(
                    "w-full border-2 border-black rounded p-2 text-black shadow-sm",
                    isSampleItem
                      ? "bg-slate-100 cursor-not-allowed focus:outline-none"
                      : quantityDeviationError || maximumAllowedProductionError
                        ? "border-red-600 bg-red-50 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
                        : "bg-yellow-100 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                  )}
                />
                {selectedItem && <span className="absolute right-3 top-2.5 text-black font-bold opacity-60">{selectedItem.uom}</span>}
              </div>
              {maximumAllowedProductionError && (
                <span className="text-red-600 text-xs font-bold">
                  Planned Quantity cannot be greater than Maximum Allowed Production.
                </span>
              )}
              {quantityDeviationError && (
                <span className="text-red-600 text-xs font-bold">
                  Planned Quantity cannot exceed {maximumDeviationQty.toLocaleString()} based on Last Plan Qty and Deviation Allowed.
                </span>
              )}
            </div>}
          </div>

          {showField("Remarks") && <div className="flex flex-col space-y-1">
            <LabelWithHelp label="Remarks" helpText="Optional notes for this production entry." />
            <input
              type="text"
              value={formData.remarks}
              onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
              className="border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 shadow-sm"
            />
          </div>}

          <div className="border-t border-black pt-4 mt-6">
            <h3 className="font-black uppercase text-xs text-slate-500 mb-4">Detailed Specifications</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {showField("No. of Parts") ? <FormInput label="No. of Parts" value={formData.noOfParts} readOnly type="number" helpText="Auto-fetched from Item Master for the selected item." /> : null}
              {showField("UPS") ? <FormInput label="UPS" value={formData.ups} onChange={(v) => setFormData({ ...formData, ups: v })} type="number" helpText="Default value comes from Item Master for the selected item. You can adjust it here if needed." /> : null}

              {showField("Length") ? <FormInput label="Length" value={formData.length} readOnly type="number" helpText="Auto-fetched from Item Master for the selected item." /> : null}
              {showField("Breadth") ? <FormInput label="Breadth" value={formData.breadth} readOnly type="number" helpText="Auto-fetched from Item Master for the selected item." /> : null}
              {showField("Height") ? <FormInput label="Height" value={formData.height} readOnly type="number" helpText="Auto-fetched from Item Master for the selected item." /> : null}

              {showField("PLY") ? <FormInput label="PLY" value={formData.ply} readOnly helpText="Auto-fetched from Item Master; it drives ID to OD and ID to OD 2." /> : null}
              {showField("Flute") ? <FormInput label="Flute" value={formData.flute} readOnly helpText="Auto-fetched from Item Master for the selected item. It also determines the Take up Factor used in GSM calculation." /> : null}
              {showField("ID to OD") ? <FormInput label="ID to OD" value={formData.idToOd} readOnly helpText="Auto-calculated from PLY. Current logic: 3 PLY = 6, 5 PLY = 10." /> : null}

              {showField("Take up Factor") ? <FormInput label="Take up Factor" value={formData.takeUpFactor} readOnly helpText="Derived only from Flute using the fixed production mapping." /> : null}
              {showField("GSM") ? <FormInput
                label="GSM"
                value={formData.gsm}
                readOnly
                helpText={`${getGsmHelpText()} When this item is different from the last produced item, GSM must not exceed Least GSM.`}
              /> : null}
              {showField("Color 1") ? <FormInput label="Color 1" value={formData.color1} readOnly helpText="Auto-filled from Item Master for the selected item." /> : null}
              {showField("Color 2") ? <FormInput label="Color 2" value={formData.color2} readOnly helpText="Auto-filled from Item Master for the selected item." /> : null}
              {showField("Printing Color") ? <FormInput label="Printing Color" value={formData.printingColor} readOnly helpText="Auto-calculated by combining Color 1 and Color 2 for the selected item." /> : null}
              {showField("ERP Code Reel") ? <FormInput label="ERP Code Reel" value={formData.erpCodeReel} readOnly helpText="Read-only reference field. It is shown from the production record/defaults when available." /> : null}
            </div>
            {gsmValidationError && (
              <div className="mt-2 text-red-600 text-xs font-bold">
                GSM cannot exceed Least GSM when the current item is different from the last produced item.
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mt-4">
              {showField("L1") ? <FormInput label="L1" value={formData.l1} onChange={(v) => setFormData({ ...formData, l1: v })} type="number" required={isLayerRequired("L1")} helpText="Default value comes from Item Master for the selected item. It is used in the GSM calculation." /> : null}
              {showField("F1") ? <FormInput label="F1" value={formData.f1} onChange={(v) => setFormData({ ...formData, f1: v })} type="number" required={isLayerRequired("F1")} helpText="Default value comes from Item Master for the selected item. It is used in the GSM calculation." /> : null}
              {showField("L2") ? <FormInput label="L2" value={formData.l2} onChange={(v) => setFormData({ ...formData, l2: v })} type="number" required={isLayerRequired("L2")} helpText="Default value comes from Item Master for the selected item. It is used in the GSM calculation." /> : null}
              {showField("F2") ? <FormInput label="F2" value={formData.f2} onChange={(v) => setFormData({ ...formData, f2: v })} type="number" required={isLayerRequired("F2")} helpText="Default value comes from Item Master for the selected item. It is used in the GSM calculation." /> : null}
              {showField("L3") ? <FormInput label="L3" value={formData.l3} onChange={(v) => setFormData({ ...formData, l3: v })} type="number" required={isLayerRequired("L3")} helpText="Default value comes from Item Master for the selected item. It is used in the GSM calculation." /> : null}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mt-4">
              {showField("Reel Per Calc") ? <FormInput label="Reel as per the calculation (RAPC)" value={formData.reelAsPerCalc} readOnly helpText={getReelAsPerCalculationHelpText()} /> : null}
              {showField("No. of ups in Cutting (For Plates)") && !isSelectedPlateItem ? <FormInput
                label="No. of ups in Cutting (For Plates)"
                value={formData.noOfUpsInCuttingForPlates}
                onChange={(v) => setFormData({ ...formData, noOfUpsInCuttingForPlates: v })}
                type="number"
                helpText="Editable field for plate-related cutting ups. It is saved with the production entry."
              /> : null}
              {showField("Reel Actual Trim") ? <FormInput label="Reel Actual Width Trimming (RAWT)" value={formData.reelActualWithTrimming} onChange={(v) => setFormData({ ...formData, reelActualWithTrimming: v })} type="number" required helpText="Mandatory. Enter the actual reel width trimming." /> : null}
              {showField("Cutting Trim") ? <FormInput label="Cutting with Trimming" value={formData.cuttingWithTrimming} readOnly helpText={getCuttingSizeHelpText()} /> : null}
              {showField("Sheet Weight") ? <FormInput label="Sheet Weight" value={formData.sheetWeight} readOnly helpText="Formula: ((Reel Actual with Trimming x Cutting with Trimming x GSM) / 1,000,000,000) / UPS. If UPS is 0 or blank, this stays blank." /> : null}
              {showField("Plate/PHP Weight") ? <FormInput label="Plate/PHP Weight" value={formData.plateWeight} readOnly type="number" step="0.00001" helpText="Auto-fetched from NPD Master for the selected item and divided by 1000." /> : null}
              {showField("Total Paper Wt") ? <FormInput label="Total Paper Wt" value={formData.totalPaperWeight} readOnly helpText="Formula: Sheet Weight x Planned Qty." /> : null}

              {showField("Total Wt of Set") ? <FormInput label="Total Wt of Set" value={formData.totalWeightOfSet} readOnly helpText="Formula: Sheet Weight + Plate/PHP Weight." /> : null}
              {showField("Actual Paper Used") ? <FormInput label="Actual Paper Used" value={formData.actualPaperUsed} readOnly type="number" step="0.00001" helpText="Workflow-managed field derived from Material Issue minus Material Return against the job." /> : null}

              {showField("Rate") ? <FormInput label="Rate" value={formData.rate} readOnly type="number" helpText="Auto-fetched from the selected order." /> : null}
              {showField("Realization/KG") ? <FormInput
                label="Realization/KG"
                value={formData.realizationPerKg}
                readOnly
                inputClassName={realizationBelowTarget ? "border-red-600 bg-red-50 text-red-800 font-bold" : undefined}
                helpText="Formula: Rate / Total Wt of Set. Turns red when below the configured realization target for this production date."
              /> : null}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mt-4">
              {showField("Prod (Sheet Plant)") ? <FormInput label="Prod (Sheet Plant)" value={formData.prodFromSheetPlant} onChange={(v) => setFormData({ ...formData, prodFromSheetPlant: v })} type="number" helpText="Temporarily editable for formula testing." /> : null}
              {showField("Prod (FFG)") ? <FormInput label="Prod (FFG)" value={formData.prodFromFFG} readOnly type="number" helpText="Workflow-managed field updated from the Pending FFG view." /> : null}

              {showField("Prod (Meter)") ? <FormInput label="Prod (Meter)" value={formData.productionInMeter} readOnly helpText="Formula: ((Cutting Trim x Quantity) / 1000) / UPS." /> : null}
              {showField("Planned Prod (Mtr)") ? <FormInput label="Planned Prod (Mtr)" value={formData.plannedProductionInMeter} readOnly type="number" helpText="Formula: ((Cutting Trim x Plan Qty) / 1000) / UPS. If Cutting Trim or Plan Qty is blank, this stays blank." /> : null}

              {showField("Least GSM") ? <FormInput label="Least GSM" value={formData.leastGsm} readOnly type="number" step="0.00001" helpText="Read-only least GSM reference from production history for the current ERP code." /> : null}
              {showField("Flute Batches") ? <FormInput label="Flute Batches" value={formData.fluteBatches} readOnly helpText="Derived from Flute using this mapping: A=1, B=2, B+C=3, C=4, E=5. Any other value stays blank." /> : null}
            </div>
          </div>
          <div className="pt-2">
            <button
              type="submit"
              disabled={
                isSubmitting ||
                !selectedSchedule ||
                !formData.date ||
                currentQty <= 0 ||
                reelActualTrimMissing ||
                hasMissingMandatoryLayerFields ||
                quantityDeviationError ||
                maximumAllowedProductionError ||
                gsmValidationError
              }
              className="flex items-center justify-center min-w-[120px] bg-emerald-600 text-white px-6 py-2 rounded font-bold hover:bg-emerald-700 transition disabled:opacity-50 border border-black shadow"
            >
              {isSubmitting ? <Spinner size={20} className="text-white" /> : "Submit Entry"}
            </button>
          </div>
        </form>
      </div>

      {pendingSchedules.length === 0 && (
        <div className="bg-amber-50 border border-black p-4 font-bold text-amber-900">
          No scheduled orders are pending production right now.
        </div>
      )}
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xs font-black text-slate-500 uppercase">{label}</div>
      <div className="text-sm font-bold text-black">{value}</div>
    </div>
  );
}

function LabelWithHelp({ label, helpText, required = false }: { label: string; helpText: string; required?: boolean }) {
  return (
    <div className="inline-flex items-center gap-1">
      <span>
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <TooltipIcon helpText={helpText} />
    </div>
  );
}

function FormInput({
  label,
  value,
  onChange,
  type = "text",
  step = "any",
  readOnly = false,
  required = false,
  inputClassName,
  helpText,
}: {
  label: string;
  value: string | number;
  onChange?: (v: any) => void;
  type?: string;
  step?: string;
  readOnly?: boolean;
  required?: boolean;
  inputClassName?: string;
  helpText?: string;
}) {
  return (
    <div className="flex flex-col space-y-1">
      <div className="text-[10px] font-black text-slate-500 uppercase inline-flex items-center gap-1">
        <span>{label} {required ? <span className="text-red-500">*</span> : null}</span>
        {helpText ? <TooltipIcon helpText={helpText} size={12} /> : null}
      </div>
      <input
        readOnly={readOnly}
        required={required}
        type={type}
        step={type === "number" ? step : undefined}
        value={value}
        onChange={(e) => onChange?.(type === "number" ? (e.target.value === "" ? "" : parseFloat(e.target.value)) : e.target.value)}
        className={cn(
          "border border-black rounded px-2 py-1 text-sm text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600",
          readOnly ? "bg-slate-100 cursor-not-allowed" : "bg-yellow-100",
          inputClassName
        )}
      />
    </div>
  );
}

function ReadOnlyNumberField({
  label,
  value,
  suffix,
  helpText,
}: {
  label: string;
  value: number;
  suffix?: string;
  helpText: string;
}) {
  return (
    <div className="flex flex-col space-y-1">
      <LabelWithHelp label={label} helpText={helpText} />
      <div className="relative">
        <input
          type="number"
          value={value}
          readOnly
          className="w-full border-2 border-black rounded p-2 text-black bg-slate-100 focus:outline-none shadow-sm"
        />
        {suffix ? <span className="absolute right-3 top-2.5 text-black font-bold opacity-60">{suffix}</span> : null}
      </div>
    </div>
  );
}

function ReadOnlyTextField({
  label,
  value,
  helpText,
}: {
  label: string;
  value: string;
  helpText: string;
}) {
  return (
    <div className="flex flex-col space-y-1">
      <LabelWithHelp label={label} helpText={helpText} />
      <input
        type="text"
        value={value}
        readOnly
        className="w-full border-2 border-black rounded p-2 text-black bg-slate-100 focus:outline-none shadow-sm"
      />
    </div>
  );
}

function TooltipIcon({ helpText, size = 14 }: { helpText: string; size?: number }) {
  return (
    <span className="relative inline-flex items-center group">
      <span className="inline-flex items-center text-slate-500 cursor-help">
        <CircleHelp size={size} />
      </span>
      <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-64 -translate-x-1/2 rounded border border-black bg-white px-3 py-2 text-[11px] normal-case font-medium text-slate-700 shadow-lg group-hover:block">
        {helpText}
      </span>
    </span>
  );
}
