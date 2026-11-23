import type { GstRateMaster } from "../types";

// The "Export" entry of the GST Rate Master: a zero-rated export supply (GST 0).
// It is a sales-invoice option only; purchase / material GST dropdowns leave it out.
export const EXPORT_GST_RATE_NAME = "Export";
export const EXPORT_GST_OPTION_VALUE = "EXPORT";

export function isExportGstRateMaster(entry: Pick<GstRateMaster, "name"> | null | undefined): boolean {
  return String(entry?.name || "").trim().toLowerCase() === EXPORT_GST_RATE_NAME.toLowerCase();
}
