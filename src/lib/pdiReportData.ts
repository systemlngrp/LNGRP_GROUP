import type { Item, PreDispatchInspection, PrintingQcCheck, Production, QualityComplaint } from "../types";
import { normalizeQcResult } from "./jobCellColors";
import { derivePdiResult, resolveCsStandard } from "./pdiResult";

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
): QualityComplaint | undefined {
  if (!text(erpCode)) return undefined;
  return complaints
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
  // Latest = the most recent inspection date (then last saved), so editing an older PDI does not make it the latest.
  const when = (inspection: PreDispatchInspection) => `${text(inspection.inspectionDate || inspection.updateTimestamp)}|${text(inspection.updateTimestamp)}`;
  const latest = [...matches].sort((left, right) => when(left).localeCompare(when(right))).at(-1);
  return latest ? { ...latest, result: normalizeQcResult(latest.result) } : undefined;
}

/** PDI dimension tolerance (mm) per ply, from Settings (default: 3 ply = 3, 5 ply = 5). */
export type PlyTolerances = Map<number, number>;
export const DEFAULT_PLY_TOLERANCES: Record<string, number> = { "3": 3, "5": 5 };
export function parsePdiPlyTolerances(setting?: { pdiPlyTolerance?: unknown } | null): PlyTolerances {
  let raw: unknown = DEFAULT_PLY_TOLERANCES;
  try {
    const saved = text(setting?.pdiPlyTolerance);
    if (saved) raw = JSON.parse(saved);
  } catch { /* keep the default */ }
  const map: PlyTolerances = new Map();
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    Object.entries(raw as Record<string, unknown>).forEach(([ply, tolerance]) => {
      const p = Number(ply); const t = Number(tolerance);
      if (Number.isFinite(p) && p > 0 && Number.isFinite(t) && t >= 0) map.set(p, t);
    });
  }
  return map;
}

/** Required ± tolerance for the ply (a ply not set in Settings uses its ply number, as before). */
export function dimensionRange(required: unknown, ply: unknown, tolerances?: PlyTolerances): { min: string | number; max: string | number } {
  if (!text(required) || !text(ply)) return { min: "", max: "" };
  const size = Number(required);
  const plyNumber = Number(ply);
  const tolerance = tolerances?.get(plyNumber) ?? plyNumber;
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
  csMarginPercent?: number,
  plyTolerances?: PlyTolerances,
): PdiReportRow {
  const requiredLength = item?.lengthId;
  const requiredWidth = item?.breadthId;
  const requiredHeight = item?.heightId;
  const lengthRange = dimensionRange(requiredLength, item?.ply, plyTolerances);
  const widthRange = dimensionRange(requiredWidth, item?.ply, plyTolerances);
  const heightRange = dimensionRange(requiredHeight, item?.ply, plyTolerances);
  const achievedCs = text(inspection?.csAchieved);
  const standardCs = resolveCsStandard(item?.csKgStd, inspection?.csRequired);

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
    "CS Actual": displayNumber(achievedCs),
    "CS Standard": standardCs ?? "",
    "Box Weight (Grams)": displayNumber(inspection?.boxWeightGrams),
    "Joint Width (mm)": displayNumber((inspection as any)?.jointWidthMm),
    "Flap Gap (mm)": displayNumber((inspection as any)?.flapGapMm),
    Artwork: text(item?.artwork),
    "Printing Artwork Check": text(inspection?.printingArtworkCheck),
    "Printing Color Check": text(inspection?.printingColorCheck),
    "Box Squaring Check": text(inspection?.boxSquaringCheck),
    "Flap Gap Check": text(inspection?.flapGapCheck),
    "Joint Pasting / Delamination Check": text(inspection?.jointPastingDelaminationCheck),
    "Remarks [IF ANY]": text(inspection?.remarks),
    "Box Photo [FRONT]": photoPath(inspection?.frontPhoto),
    "Box Photo [BACK]": photoPath(inspection?.backPhoto),
    Result: inspection ? derivePdiResult(inspection, standardCs, csMarginPercent) : normalizeQcResult(inspection?.result),
    "QC Person Name": text(inspection?.qcPerson),
    "PDI TIME": text(inspection?.inspectionDate),
    Ply: displayNumber(item?.ply),
  };
}
