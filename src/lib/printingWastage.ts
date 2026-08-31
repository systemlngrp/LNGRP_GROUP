import type { ProductionProcessing } from "../types";

export const PRINTING_WASTAGE_FIELDS = [
  "slotting",
  "delaminationPrinting",
  "misalignmentPrinting",
  "drySheets",
  "warp",
  "misprinting",
  "jobSetting",
] as const;

export type PrintingWastageKey = (typeof PRINTING_WASTAGE_FIELDS)[number];
export type PrintingWastageDraft = Record<PrintingWastageKey, string>;

export const EMPTY_PRINTING_WASTAGE_DRAFT: PrintingWastageDraft = {
  slotting: "",
  delaminationPrinting: "",
  misalignmentPrinting: "",
  drySheets: "",
  warp: "",
  misprinting: "",
  jobSetting: "",
};

export function buildPrintingWastageValues(draft: PrintingWastageDraft): Record<PrintingWastageKey, number> {
  return Object.fromEntries(PRINTING_WASTAGE_FIELDS.map((key) => {
    const numberValue = Number(draft[key] || 0);
    return [key, Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : 0];
  })) as Record<PrintingWastageKey, number>;
}

export function printingWastageDraftFromEntry(entry: ProductionProcessing): PrintingWastageDraft {
  return Object.fromEntries(PRINTING_WASTAGE_FIELDS.map((key) => [key, String(entry[key] || "")])) as PrintingWastageDraft;
}
