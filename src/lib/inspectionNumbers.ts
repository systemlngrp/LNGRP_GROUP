import type { PreDispatchInspection } from "../types";

export const INSPECTION_NUMBER_FIELDS = [
  ["plannedQty", "Planned Quantity"],
  ["bGsm", "B.GSM"],
  ["lengthId", "Length (ID)"],
  ["widthId", "Width (ID)"],
  ["heightId", "Height (ID)"],
  ["csAchieved", "CS Achieved"],
  ["gsmAchieved", "GSM Achieved"],
  ["boxWeightGrams", "Box Weight (Grams)"],
] as const;

export function isPositiveDecimal(value: unknown): boolean {
  const raw = String(value ?? "").trim();
  return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw) && Number.isFinite(Number(raw)) && Number(raw) > 0;
}

export function invalidInspectionNumberField(form: Partial<PreDispatchInspection>): string | undefined {
  return INSPECTION_NUMBER_FIELDS.find(([field]) => !isPositiveDecimal(form[field]))?.[1];
}
type InspectionDraft = Partial<PreDispatchInspection> & { productionId: string; jobNo: string };
export function inspectionDraftForJob(jobFields: InspectionDraft, existing?: PreDispatchInspection): InspectionDraft {
  return existing ? { ...existing, ...jobFields, plannedQty: existing.plannedQty ?? jobFields.plannedQty } : { ...jobFields };
}
