import type { Production, ProductionProcessing } from "../types";

export const CORRUGATION_WASTAGE_BOX_FIELDS = [
  "warpageBoxes",
  "delaminationBoxes",
  "misalignmentBoxes",
  "sheerCutterBoxes",
  "noHisabBoxes",
] as const;

export const CORRUGATION_WASTAGE_MANUAL_KG_FIELDS = ["twoPlyPaperKg", "deckelWastageKg"] as const;

export const CORRUGATION_WASTAGE_DERIVED_KG_FIELDS = [
  "warpageKg",
  "delaminationKg",
  "misalignmentKg",
  "sheerCutterKg",
] as const;

export type CorrugationWastageInputKey =
  | (typeof CORRUGATION_WASTAGE_BOX_FIELDS)[number]
  | (typeof CORRUGATION_WASTAGE_MANUAL_KG_FIELDS)[number];

export type CorrugationWastageDraft = Record<CorrugationWastageInputKey, string>;

export const EMPTY_CORRUGATION_WASTAGE_DRAFT: CorrugationWastageDraft = {
  warpageBoxes: "",
  delaminationBoxes: "",
  misalignmentBoxes: "",
  sheerCutterBoxes: "",
  noHisabBoxes: "",
  twoPlyPaperKg: "",
  deckelWastageKg: "",
};

const nonNegative = (value: unknown) => {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : 0;
};

export function getPaperKgPerBox(production?: Pick<Production, "totalPaperWeight" | "qty" | "plannedQty"> | null) {
  const totalPaperWeight = nonNegative(production?.totalPaperWeight);
  const plannedQty = nonNegative(production?.qty) || nonNegative(production?.plannedQty);
  return totalPaperWeight > 0 && plannedQty > 0 ? totalPaperWeight / plannedQty : 0;
}

export function buildCorrugationWastageValues(draft: CorrugationWastageDraft, production?: Production | null) {
  const kgPerBox = getPaperKgPerBox(production);
  const warpageBoxes = nonNegative(draft.warpageBoxes);
  const delaminationBoxes = nonNegative(draft.delaminationBoxes);
  const misalignmentBoxes = nonNegative(draft.misalignmentBoxes);
  const sheerCutterBoxes = nonNegative(draft.sheerCutterBoxes);
  return {
    warpageBoxes,
    warpageKg: warpageBoxes * kgPerBox,
    delaminationBoxes,
    delaminationKg: delaminationBoxes * kgPerBox,
    misalignmentBoxes,
    misalignmentKg: misalignmentBoxes * kgPerBox,
    twoPlyPaperKg: nonNegative(draft.twoPlyPaperKg),
    deckelWastageKg: nonNegative(draft.deckelWastageKg),
    sheerCutterBoxes,
    sheerCutterKg: sheerCutterBoxes * kgPerBox,
    noHisabBoxes: nonNegative(draft.noHisabBoxes),
  };
}

export function wastageDraftFromEntry(entry: ProductionProcessing): CorrugationWastageDraft {
  return {
    warpageBoxes: String(entry.warpageBoxes || ""),
    delaminationBoxes: String(entry.delaminationBoxes || ""),
    misalignmentBoxes: String(entry.misalignmentBoxes || ""),
    sheerCutterBoxes: String(entry.sheerCutterBoxes || ""),
    noHisabBoxes: String(entry.noHisabBoxes || ""),
    twoPlyPaperKg: String(entry.twoPlyPaperKg || ""),
    deckelWastageKg: String(entry.deckelWastageKg || ""),
  };
}
