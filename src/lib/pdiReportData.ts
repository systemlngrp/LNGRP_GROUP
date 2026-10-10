import type { Item, PreDispatchInspection, PrintingQcCheck, Production, QualityComplaint } from "../types";

export type NpdPdiItem = Item & {
  lengthId?: number | string;
  breadthId?: number | string;
  heightId?: number | string;
  csKgStd?: number | string;
};

export type PdiReportRow = Record<string, string | number>;

const text = (value: unknown) => String(value ?? "").trim();
const normalized = (value: unknown) => text(value).toLowerCase();
const displayNumber = (value: unknown): string | number => {
  const raw = text(value);
  if (!raw) return "";
  const number = Number(raw);
  return Number.isFinite(number) ? number : raw;
};

const dateKey = (value: unknown) => text(value).slice(0, 10);

export function findLatestPreviousComplaint(
  complaints: QualityComplaint[],
  erpCode: string,
  productionDate: string,
): QualityComplaint | undefined {
  const currentDate = dateKey(productionDate);
  if (!currentDate || !text(erpCode)) return undefined;
  return complaints
    .filter((complaint) => dateKey(complaint.dateOfComplaint || complaint.timestamp) < currentDate)
    .filter((complaint) => normalized(complaint.erpCode) === normalized(erpCode))
    .sort((left, right) => {
      const dateOrder = dateKey(left.dateOfComplaint || left.timestamp).localeCompare(dateKey(right.dateOfComplaint || right.timestamp));
      return dateOrder || text(left.timestamp).localeCompare(text(right.timestamp));
    })
    .at(-1);
}

export function formatPreviousComplaint(complaint?: QualityComplaint): string {
  if (!complaint) return "";
  const context = [
    text(complaint.dateOfComplaint) ? `Date: ${dateKey(complaint.dateOfComplaint)}` : "",
    text(complaint.lotNo) ? `LOT NO.: ${text(complaint.lotNo)}` : "",
  ].filter(Boolean).join(" | ");
  return [text(complaint.issueDetails), context].filter(Boolean).join(" | ");
}

export function findLatestInspection(
  inspections: PreDispatchInspection[],
  productionId: string,
  jobNo: string,
): PreDispatchInspection | undefined {
  const byProduction = productionId
    ? inspections.filter((inspection) => normalized(inspection.productionId) === normalized(productionId))
    : [];
  const matches = byProduction.length
    ? byProduction
    : jobNo
      ? inspections.filter((inspection) => normalized(inspection.jobNo) === normalized(jobNo))
      : [];
  return [...matches].sort((left, right) =>
    text(left.updateTimestamp || left.inspectionDate).localeCompare(text(right.updateTimestamp || right.inspectionDate))
  ).at(-1);
}

export function dimensionRange(required: unknown, ply: unknown): { min: string | number; max: string | number } {
  if (!text(required) || !text(ply)) return { min: "", max: "" };
  const size = Number(required);
  const tolerance = Number(ply);
  if (!Number.isFinite(size) || !Number.isFinite(tolerance)) return { min: "", max: "" };
  return { min: size - tolerance, max: size + tolerance };
}

export function photoPath(value: unknown): string {
  const raw = text(value);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return "/uploads/" + encodeURIComponent(raw.replace(/^\/?uploads\//i, ""));
}

export function buildPdiReportRow(
  production: Production,
  item?: NpdPdiItem,
  inspection?: PreDispatchInspection,
  printing?: PrintingQcCheck,
  previousCustomerComplaint?: string,
): PdiReportRow {
  const requiredLength = item?.lengthId;
  const requiredWidth = item?.breadthId;
  const requiredHeight = item?.heightId;
  const lengthRange = dimensionRange(requiredLength, item?.ply);
  const widthRange = dimensionRange(requiredWidth, item?.ply);
  const heightRange = dimensionRange(requiredHeight, item?.ply);
  const achievedCs = text(inspection?.csAchieved);
  const standardCs = text(item?.csKgStd);

  return {
    "Job. No.": text(production.transactionNo || production.jobCardNo),
    Date: text(production.date).slice(0, 10),
    "Party Name": text(production.companyName || inspection?.partyName || printing?.partyName),
    "Item Name": text((production as Production & { itemName?: string }).itemName || item?.name || inspection?.itemName || printing?.itemName),
    "ERP Code": text(production.erpCode || inspection?.erpCode || item?.erp || printing?.erp),
    "Previous Customer Complaint": text(previousCustomerComplaint) || text(printing?.previousCustomerComplaintWarning),
    "Required Length": displayNumber(requiredLength),
    "Achieved Length": displayNumber(inspection?.lengthId),
    "Min length": lengthRange.min,
    "Max Length": lengthRange.max,
    "Required Width": displayNumber(requiredWidth),
    "Achieved Width": displayNumber(inspection?.widthId),
    "Width Min": widthRange.min,
    "Width Max": widthRange.max,
    "Required Height": displayNumber(requiredHeight),
    "Achieved Height": displayNumber(inspection?.heightId),
    "Height Min": heightRange.min,
    "Height Max": heightRange.max,
    "CS Act / CS STD": achievedCs ? (standardCs ? achievedCs + " / " + standardCs : achievedCs) : "",
    "B.GSM": displayNumber(inspection?.bGsm),
    "Box Weight (Grams)": displayNumber(inspection?.boxWeightGrams),
    Artwork: text(item?.artwork),
    "Printing Artwork Check": text(inspection?.printingArtworkCheck),
    "Printing Color Check": text(inspection?.printingColorCheck),
    "Box Squaring Check": text(inspection?.boxSquaringCheck),
    "Flap Gap Check": text(inspection?.flapGapCheck),
    "Joint Pasting / Delamination Check": text(inspection?.jointPastingDelaminationCheck),
    "Remarks [IF ANY]": text(inspection?.remarks),
    "Box Photo [FRONT]": photoPath(inspection?.frontPhoto),
    "Box Photo [BACK]": photoPath(inspection?.backPhoto),
    Result: text(inspection?.result),
    "QC Person Name": text(inspection?.qcPerson),
    "PDI TIME": text(inspection?.inspectionDate),
    Ply: displayNumber(item?.ply),
    "Standard CS": displayNumber(item?.csKgStd),
    "STD CS": text(item?.csKgStd) ? displayNumber(item?.csKgStd) : 0,
    "Actual CS": displayNumber(inspection?.csAchieved),
  };
}
