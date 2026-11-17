import type { PreDispatchInspection } from "../types";

export const INSPECTION_NUMBER_FIELDS = [
  ["plannedQty", "Planned Quantity"],
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

// CS Achieved may be 0 (CS not tested for the box); other measurements must be > 0.
export const ZERO_ALLOWED_INSPECTION_FIELDS = new Set<string>(["csAchieved"]);

export function isZeroOrPositiveDecimal(value: unknown): boolean {
  const raw = String(value ?? "").trim();
  return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw) && Number.isFinite(Number(raw)) && Number(raw) >= 0;
}

export function invalidInspectionNumberField(form: Partial<PreDispatchInspection>): string | undefined {
  return INSPECTION_NUMBER_FIELDS.find(([field]) =>
    ZERO_ALLOWED_INSPECTION_FIELDS.has(field) ? !isZeroOrPositiveDecimal(form[field]) : !isPositiveDecimal(form[field])
  )?.[1];
}

export function inspectionNumberMessage(label: string) {
  return label === "CS Achieved"
    ? "CS Achieved must be a number, 0 or more (without units)."
    : `${label} must be a number greater than zero (without units).`;
}
type InspectionDraft = Partial<PreDispatchInspection> & { productionId: string; jobNo: string };
export function inspectionDraftForJob(jobFields: InspectionDraft, existing?: PreDispatchInspection): InspectionDraft {
  return existing ? { ...existing, ...jobFields, plannedQty: existing.plannedQty ?? jobFields.plannedQty } : { ...jobFields };
}
