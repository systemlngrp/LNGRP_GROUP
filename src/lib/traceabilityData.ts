import type {
  BoardLineQcCheck,
  Company,
  DispatchPlan,
  Invoice,
  InvoiceLineItem,
  Item,
  LoadingSlip,
  Order,
  OrderSchedule,
  PreDispatchInspection,
  PrintingQcCheck,
  Production,
  ProductionProcessing,
  QcUpdateRecord,
  QualityComplaint,
  Truck,
} from "../types";
import { findLatestInspection, photoPath } from "./pdiReportData";
import { getProductionActualPaperUsed } from "./productionMaterialUsage";
import { resolvePlanQuantity } from "./samplingPlanQty";

export type TraceabilityStatus = "JOB OPEN" | "JOB CLOSED" | "JOB CANCELLED";
export type TraceabilityValue = string | number | "";

export type TraceabilityRecord = {
  id: string;
  productionId: string;
  firmName: string;
  jobNo: string;
  lotNo: string;
  lotNumbers: string[];
  itemName: string;
  partyName: string;
  erpCode: string;
  status: TraceabilityStatus;
  planning: {
    planQuantity: TraceabilityValue;
    plannedDate: string;
    jobWeightKg: TraceabilityValue;
    realizationPerKg: TraceabilityValue;
    customerSpecification: string;
    customerArtwork: string;
  };
  boardline: {
    quantityProducedPcs: TraceabilityValue;
    paperRequiredKg: TraceabilityValue;
    paperUsedKg: TraceabilityValue;
    paperWastagePercent: TraceabilityValue;
    boardWastagePcs: TraceabilityValue;
    boardWastagePercent: TraceabilityValue;
    qcExecutive: string;
    rapc: TraceabilityValue;
    cuttingSizeMm: TraceabilityValue;
    ups: TraceabilityValue;
    ply: TraceabilityValue;
    flute: string;
    paperSpec: string;
    sizeLxWxHmm: string;
    plannedPaper: TraceabilityValue;
    lineIncharge: string;
    sheetPlantRequiredSize: string;
    sheetPlantProducedSize: string;
    sheetPlantProducedSizeDr: string;
    cuttingSizeProduced: TraceabilityValue;
    typeOfFluteProduced: string;
    bgsmAchieved: TraceabilityValue;
    boardThicknessAchieved: TraceabilityValue;
    sheetWeightGramsAchieved: TraceabilityValue;
    moistureAchieved: TraceabilityValue;
  };
  converting: {
    quantityProduced: TraceabilityValue;
    sizeAchieved: string;
    boardThicknessAchieved: TraceabilityValue;
    printingColourRequired: string;
    printingColourIdentified: string;
    boxWeightGrams: TraceabilityValue;
    standardCsKg: TraceabilityValue;
    achievedCsKg: TraceabilityValue;
    standardBsKg: TraceabilityValue;
    achievedBsKg: TraceabilityValue;
    operatorIncharge: string;
    qcInspector: string;
  };
  pdi: {
    boxSizeRequired: string;
    boxSizeAchieved: string;
    csAchievedRequired: string;
    bgsmAchieved: TraceabilityValue;
    boxWeightAchievedGrams: TraceabilityValue;
    artworkCheck: string;
    printingColorCheck: string;
    boxSquaringCheck: string;
    flapGapCheck: string;
    jointPastingDelaminationCheck: string;
    remarks: string;
    frontPhoto: string;
    backPhoto: string;
    qcInspector: string;
    result: string;
  };
  dispatch: {
    plannedQuantity: TraceabilityValue;
    dispatchQuantity: TraceabilityValue;
    dispatchDate: string;
    invoiceNo: string;
    rate: TraceabilityValue;
    saleValue: TraceabilityValue;
    vehicleNo: string;
    driverName: string;
    driverNo: string;
  };
  timeChart: {
    plannedForProduction: string;
    productionFromBoardline: string;
    productionFromPrinting: string;
    preDispatchInspection: string;
    dispatch: string;
  };
  searchText: string;
};

export type TraceabilityInputs = {
  productions: Production[];
  items: Item[];
  companies?: Company[];
  orders?: Order[];
  schedules?: OrderSchedule[];
  processing?: ProductionProcessing[];
  boardline?: BoardLineQcCheck[];
  printing?: PrintingQcCheck[];
  inspections?: PreDispatchInspection[];
  dispatchPlans?: DispatchPlan[];
  loadingSlips?: LoadingSlip[];
  invoices?: Invoice[];
  invoiceLineItems?: InvoiceLineItem[];
  trucks?: Truck[];
  qcUpdates?: QcUpdateRecord[];
  complaints?: QualityComplaint[];
};

const text = (value: unknown) => String(value ?? "").trim();
const key = (value: unknown) => text(value).toLowerCase().replace(/\s+/g, " ");
const rows = <T>(value: T[] | null | undefined): T[] => Array.isArray(value) ? value : [];
const numberValue = (value: unknown): TraceabilityValue => {
  if (value === "" || value === null || value === undefined) return "";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : text(value);
};
const firstText = (...values: unknown[]) => values.map(text).find(Boolean) || "";
const firstValue = (...values: unknown[]): TraceabilityValue => {
  for (const value of values) {
    if (value !== null && value !== undefined && text(value)) return numberValue(value);
  }
  return "";
};
const latest = <T>(rows: T[], timestamp: (row: T) => unknown) => [...rows].sort((left, right) => text(timestamp(left)).localeCompare(text(timestamp(right)))).at(-1);
const dateText = (value: unknown) => text(value).slice(0, 19);
const formatDate = (value: unknown) => text(value).slice(0, 10);
const normalizedJob = (value: unknown) => key(value).replace(/^0+(?=\d)/, "");
const sameJob = (left: unknown, right: unknown) => normalizedJob(left) === normalizedJob(right);
const joinSize = (...values: unknown[]) => {
  const parts = values.map(text);
  return parts.some(Boolean) ? parts.join(" x ") : "";
};
const joinNonEmpty = (separator: string, ...values: unknown[]) => values.map(text).filter(Boolean).join(separator);

function latestByJob<T extends { jobNo?: string | number }>(rows: T[], jobNo: string) {
  return latest(rows.filter((row) => sameJob(row.jobNo, jobNo)), (row) => (row as T & { updateTimestamp?: string; timestamp?: string }).updateTimestamp || (row as T & { timestamp?: string }).timestamp);
}

function processingFor(rows: ProductionProcessing[], production: Production, jobNo: string) {
  return rows.filter((row) => key(row.productionId) === key(production.id) || sameJob(row.jobNo, jobNo));
}

function processingQuantity(rows: ProductionProcessing[], machineName: string) {
  return rows
    .filter((row) => key(row.machineName) === key(machineName))
    .reduce((total, row) => total + Math.max(0, Number(row.qty || 0)), 0);
}

function processingDate(rows: ProductionProcessing[], machineName: string) {
  return latest(rows.filter((row) => key(row.machineName) === key(machineName)), (row) => row.updateTimestamp || row.date)?.date || "";
}

function productionLoadingSlips(production: Production, jobNo: string, plans: DispatchPlan[], slips: LoadingSlip[]) {
  const planIds = new Set(plans.filter((plan) => key(plan.productionId) === key(production.id)).map((plan) => key(plan.id)));
  return slips.filter((slip) => key(slip.status) !== "cancelled" && (slip.lines || []).some((line) => {
    if (planIds.has(key(line.dispatchPlanId))) return true;
    if ((line.jobNos || []).some((value) => sameJob(value, jobNo))) return true;
    return (line.allocations || []).some((allocation) => allocation.sourceType === "job" && (key(allocation.jobId) === key(production.id) || sameJob(allocation.jobNo, jobNo)));
  }));
}

function statusOf(production: Production): TraceabilityStatus {
  if (production.status === "Cancelled" || text(production.cancelTimestamp)) return "JOB CANCELLED";
  if (production.status === "Completed" || text(production.closeDate) || key(production.closeBy) === "yes") return "JOB CLOSED";
  return "JOB OPEN";
}

function layerValue(value: unknown) {
  const normalized = text(value);
  if (!normalized) return "";
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return normalized;
  if (numeric === 0) return "";
  return String(numeric);
}

function paperSpec(item?: Item) {
  if (!item) return "";
  return [
    item.l1,
    item.f1,
    item.l2,
    item.f2,
    item.l3,
    item.f3,
  ].map(layerValue).filter(Boolean).join(" - ");
}

function plannedPaper(production: Production): TraceabilityValue {
  return [production.l1, production.f1, production.l2, production.f2, production.l3]
    .map(layerValue)
    .filter(Boolean)
    .join(" - ");
}

function explicitLineIncharge(board?: BoardLineQcCheck) {
  if (!board) return "";
  const lineInchargeKeys = new Set(["lineincharge", "lineinchargename", "lineinchargeperson"]);
  const rawBoard = board as unknown as Record<string, unknown>;
  return Object.entries(rawBoard)
    .filter(([field]) => lineInchargeKeys.has(field.toLowerCase().replace(/[^a-z0-9]/g, "")))
    .map(([, value]) => text(value))
    .find(Boolean) || "";
}

function processingLineIncharge(rows: ProductionProcessing[]) {
  return firstText(latest(
    rows.filter((row) => key(row.machineName) === "corrugation liner" && text(row.operatorName)),
    (row) => row.updateTimestamp || row.date,
  )?.operatorName);
}

export function buildTraceabilityRecord(production: Production, input: TraceabilityInputs): TraceabilityRecord {
  const jobNo = firstText(production.transactionNo, production.jobCardNo);
  const board = latestByJob(rows(input.boardline), jobNo);
  const printing = latestByJob(rows(input.printing), jobNo);
  const inspection = findLatestInspection(rows(input.inspections), production.id, jobNo);
  const productionProcessing = processingFor(rows(input.processing), production, jobNo);
  const item = rows(input.items).find((candidate) =>
    [candidate.id, candidate.erp].some((value) => key(value) && (key(value) === key(production.itemId) || key(value) === key(production.npdId) || key(value) === key(production.erpCode) || key(value) === key(board?.erp) || key(value) === key(printing?.erp)))
  );
  const schedule = rows(input.schedules).find((candidate) => key(candidate.id) === key(production.scheduleId));
  const order = rows(input.orders).find((candidate) => key(candidate.id) === key(schedule?.orderId));
  const company = rows(input.companies).find((candidate) => key(candidate.id) === key(order?.companyId));
  const erpCode = firstText(production.erpCode, inspection?.erpCode, board?.erp, printing?.erp, item?.erp);
  const partyName = firstText(production.companyName, inspection?.partyName, board?.partyName, printing?.partyName, company?.name);
  const itemName = firstText((production as Production & { itemName?: string }).itemName, item?.name, inspection?.itemName, board?.itemName, printing?.itemName);
  const plans = rows(input.dispatchPlans).filter((plan) => key(plan.productionId) === key(production.id));
  const slips = productionLoadingSlips(production, jobNo, rows(input.dispatchPlans), rows(input.loadingSlips));
  const latestSlip = latest(slips, (slip) => slip.updateTimestamp || slip.date);
  const invoice = rows(input.invoices).find((candidate) => key(candidate.id) === key(latestSlip?.invoiceId));
  const invoiceLine = rows(input.invoiceLineItems).find((line) => key(line.invoiceId) === key(invoice?.id) && (key(line.npdId) === key(production.npdId) || key(line.itemId) === key(production.itemId)));
  const truck = rows(input.trucks).find((candidate) => key(candidate.id) === key(latestSlip?.truckId));
  const complaintLots = rows(input.complaints).filter((complaint) => key(complaint.erpCode) === key(erpCode)).map((complaint) => text(complaint.lotNo));
  const lotNumbers = [...new Set([text(inspection?.lotNo), text(printing?.lotNoPrinted), ...complaintLots].filter(Boolean))];
  const planQuantity = resolvePlanQuantity(production.plannedQty, production.qty, board?.planQty, printing?.planQty, inspection?.plannedQty, plans.reduce((sum, plan) => sum + Number(plan.plannedQty || 0), 0));
  const plannedPaperValue = plannedPaper(production);
  const lineIncharge = firstText(explicitLineIncharge(board), processingLineIncharge(productionProcessing));
  const paperRequired = firstValue(production.totalPaperWeight);
  const paperUsed = numberValue(getProductionActualPaperUsed(production));
  const requiredNumber = Number(paperRequired || 0);
  const usedNumber = Number(paperUsed || 0);
  const paperWastagePercent = requiredNumber > 0 && usedNumber > 0 ? Number(Math.max(0, ((usedNumber - requiredNumber) / requiredNumber) * 100).toFixed(2)) : "";
  const customerArtwork = firstText(item?.artwork);
  const customerSpecification = firstText((item as Item & { url?: string } | undefined)?.url, item?.spec);
  const boardWastagePcs = firstValue((production as Production & { boardWastagePcs?: number }).boardWastagePcs);
  const boardWastagePercent = firstValue((production as Production & { boardWastagePercent?: number }).boardWastagePercent);
  const boardlineQuantity = processingQuantity(productionProcessing, "Corrugation Liner");
  const printingQuantity = processingQuantity(productionProcessing, "Printing");
  const dispatchQuantity = slips.reduce((total, slip) => total + (slip.lines || []).reduce((lineTotal, line) => {
    const allocationQuantity = (line.allocations || []).filter((allocation) => allocation.sourceType === "job" && (key(allocation.jobId) === key(production.id) || sameJob(allocation.jobNo, jobNo))).reduce((sum, allocation) => sum + Number(allocation.qty || 0), 0);
    if (allocationQuantity > 0) return lineTotal + allocationQuantity;
    const belongsToJob = (line.jobNos || []).some((value) => sameJob(value, jobNo));
    return lineTotal + (belongsToJob || plans.some((plan) => key(plan.id) === key(line.dispatchPlanId)) ? Number(line.loadedQty || 0) : 0);
  }, 0), 0);
  const latestQcUpdate = latest(rows(input.qcUpdates).filter((record) => key(record.erpNo) === key(erpCode)), (record) => record.updateTimestamp || record.updateDate);
  const latestComplaint = latest(rows(input.complaints).filter((record) => key(record.erpCode) === key(erpCode)), (record) => record.timestamp || record.dateOfComplaint);
  const latestPlan = latest(plans, (plan) => plan.updateTimestamp || plan.date);
  const plannedDate = firstText(production.scheduledDate, schedule?.scheduledDate, production.date);
  const actualPdiDate = inspection?.inspectionDate || inspection?.updateTimestamp || "";
  const normalizedPrintingColors = joinNonEmpty(" / ", printing?.printingColor1Standard, printing?.printingColour2Standard);
  const actualPrintingColors = joinNonEmpty(" / ", printing?.colour1Actual, printing?.colour2Actual);

  return {
    id: production.id,
    productionId: production.id,
    firmName: firstText(production.firmName),
    jobNo,
    lotNo: firstText(...lotNumbers),
    lotNumbers,
    itemName,
    partyName,
    erpCode,
    status: statusOf(production),
    planning: {
      planQuantity,
      plannedDate: formatDate(plannedDate),
      jobWeightKg: firstValue(production.totalWeightOfSet, production.totalPaperWeight),
      realizationPerKg: firstValue(production.realizationPerKg),
      customerSpecification,
      customerArtwork,
    },
    boardline: {
      quantityProducedPcs: numberValue(boardlineQuantity || production.prodFromSheetPlant),
      paperRequiredKg: paperRequired,
      paperUsedKg: paperUsed,
      paperWastagePercent,
      boardWastagePcs,
      boardWastagePercent,
      qcExecutive: firstText(board?.qcPerson),
      rapc: firstValue((item as Item & { internalRapc?: number } | undefined)?.internalRapc, item?.rapc),
      cuttingSizeMm: firstValue(board?.cuttingSizeMm, item?.cuttingSize),
      ups: firstValue(production.ups, item?.ups),
      ply: firstValue(production.ply, item?.ply, board?.ply),
      flute: firstText(production.flute, item?.flute, board?.typeOfFlute),
      paperSpec: paperSpec(item),
      sizeLxWxHmm: joinSize(production.length || item?.length, production.breadth || item?.breadth, production.height || item?.height),
      plannedPaper: plannedPaperValue,
      lineIncharge,
      sheetPlantRequiredSize: firstText((production as Production & { sheetPlantRequiredSize?: string }).sheetPlantRequiredSize, board?.standard),
      sheetPlantProducedSize: firstText((production as Production & { sheetPlantProducedSize?: string }).sheetPlantProducedSize),
      sheetPlantProducedSizeDr: firstText((production as Production & { sheetPlantProducedSizeDr?: string }).sheetPlantProducedSizeDr),
      cuttingSizeProduced: firstValue((production as Production & { cuttingSizeProduced?: number }).cuttingSizeProduced, board?.cuttingSizeMm),
      typeOfFluteProduced: firstText(board?.typeOfFlute),
      bgsmAchieved: firstValue(board?.boardGsm, printing?.csAchieved, printing?.bsAchieved),
      boardThicknessAchieved: firstValue(board?.boardThickness, printing?.boardThickness),
      sheetWeightGramsAchieved: firstValue(board?.sheetWeightGrams, printing?.boxWeightGrams),
      moistureAchieved: firstValue(board?.moisture),
    },
    converting: {
      quantityProduced: numberValue(printingQuantity || production.prodFromFFG),
      sizeAchieved: firstText(printing?.boxSizeAchieved, joinSize(printing?.lengthId, printing?.widthId, printing?.heightId)),
      boardThicknessAchieved: firstValue(printing?.boardThickness, board?.boardThickness),
      printingColourRequired: normalizedPrintingColors,
      printingColourIdentified: actualPrintingColors,
      boxWeightGrams: firstValue(printing?.boxWeightGrams, inspection?.boxWeightGrams),
      standardCsKg: firstValue(printing?.csStandard),
      achievedCsKg: firstValue(printing?.csAchieved),
      standardBsKg: firstValue(printing?.bsStandard),
      achievedBsKg: firstValue(printing?.bsAchieved),
      operatorIncharge: firstText(printing?.operatorName),
      qcInspector: firstText(printing?.qcPerson),
    },
    pdi: {
      boxSizeRequired: firstText(printing?.standardBoxSize, board?.standard),
      boxSizeAchieved: firstText(inspection?.lengthId && inspection?.widthId && inspection?.heightId ? joinSize(inspection.lengthId, inspection.widthId, inspection.heightId) : ""),
      csAchievedRequired: joinNonEmpty(" / ", inspection?.csAchieved, printing?.csStandard),
      bgsmAchieved: firstValue(inspection?.bGsm, board?.boardGsm),
      boxWeightAchievedGrams: firstValue(inspection?.boxWeightGrams, printing?.boxWeightGrams),
      artworkCheck: firstText(inspection?.printingArtworkCheck),
      printingColorCheck: firstText(inspection?.printingColorCheck),
      boxSquaringCheck: firstText(inspection?.boxSquaringCheck),
      flapGapCheck: firstText(inspection?.flapGapCheck),
      jointPastingDelaminationCheck: firstText(inspection?.jointPastingDelaminationCheck),
      remarks: firstText(inspection?.remarks, board?.boardlineRemarks, printing?.column40, latestQcUpdate?.remarks, latestComplaint?.issueDetails),
      frontPhoto: photoPath(inspection?.frontPhoto),
      backPhoto: photoPath(inspection?.backPhoto),
      qcInspector: firstText(inspection?.qcPerson),
      result: firstText(inspection?.result),
    },
    dispatch: {
      plannedQuantity: firstValue(latestPlan?.plannedQty, planQuantity),
      dispatchQuantity: dispatchQuantity || firstValue(latestPlan?.loadedQty),
      dispatchDate: formatDate(firstText(latestSlip?.date, invoice?.date)),
      invoiceNo: firstText(invoice?.invoiceNo, latestSlip?.invoiceNo),
      rate: firstValue(invoiceLine?.rate, production.rate, order?.rate),
      saleValue: firstValue(invoiceLine?.amount, order?.orderAmount),
      vehicleNo: firstText(latestSlip?.truckNo, truck?.truckNo),
      driverName: firstText(truck?.driverName),
      driverNo: firstText(truck?.mobileNo),
    },
    timeChart: {
      plannedForProduction: dateText(plannedDate),
      productionFromBoardline: dateText(processingDate(productionProcessing, "Corrugation Liner")),
      productionFromPrinting: dateText(processingDate(productionProcessing, "Printing")),
      preDispatchInspection: dateText(actualPdiDate),
      dispatch: dateText(firstText(latestSlip?.date, invoice?.date)),
    },
    searchText: [jobNo, ...lotNumbers, erpCode, partyName, itemName, firstText(production.firmName)].map(key).join(" "),
  };
}

export function buildTraceabilityRecords(input: TraceabilityInputs) {
  return rows(input.productions)
    .filter((production): production is Production => Boolean(production && text(production.id)))
    .map((production) => buildTraceabilityRecord(production, input));
}

export function filterTraceabilityRecords(records: TraceabilityRecord[], search: string) {
  const query = key(search);
  const searchableRecords = records.filter((record) => record.status !== "JOB CANCELLED");
  if (!query) return searchableRecords;
  return searchableRecords.filter((record) => record.searchText.includes(query));
}
