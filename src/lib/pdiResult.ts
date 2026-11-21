import type { PreDispatchInspection } from "../types";

export const PDI_CHECK_KEYS = [
  "printingArtworkCheck",
  "printingColorCheck",
  "boxSquaringCheck",
  "flapGapCheck",
  "jointPastingDelaminationCheck",
] as const;

export type PdiCheckKey = typeof PDI_CHECK_KEYS[number];

const text = (value: unknown) => String(value ?? "").trim();

export function positiveNumber(value: unknown): number | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  const number = Number(raw);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

export function resolveCsStandard(itemValue: unknown, legacyValue?: unknown): number | undefined {
  return positiveNumber(itemValue) ?? positiveNumber(legacyValue);
}

/** Default margin over CS Std that CS Achieved must reach (Settings → PDI CS Margin). */
export const DEFAULT_PDI_CS_MARGIN_PERCENT = 10;

/** Margin % from Settings; blank or invalid → 10. */
export function parsePdiCsMarginPercent(setting?: { pdiCsMarginPercent?: unknown } | null): number {
  const raw = text(setting?.pdiCsMarginPercent);
  if (!raw) return DEFAULT_PDI_CS_MARGIN_PERCENT;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_PDI_CS_MARGIN_PERCENT;
}

/** CS a box must reach to pass: CS Std + margin %. */
export function requiredPdiCs(csStandard: unknown, marginPercent: number = DEFAULT_PDI_CS_MARGIN_PERCENT): number | undefined {
  const standard = positiveNumber(csStandard);
  if (standard === undefined) return undefined;
  return Math.round(standard * (1 + marginPercent / 100) * 100) / 100;
}

export function derivePdiResult(
  value: Pick<Partial<PreDispatchInspection>, PdiCheckKey | "csAchieved">,
  csStandard: unknown,
  marginPercent: number = DEFAULT_PDI_CS_MARGIN_PERCENT,
): "Pending" | "QC PASS" | "QC FAIL" {
  const checks = PDI_CHECK_KEYS.map((key) => text(value[key]).toUpperCase());
  if (checks.some((result) => result === "NOT OK")) return "QC FAIL";

  // CS Achieved = 0 means CS was not tested: the result follows the checks alone.
  const csNotTested = String(value.csAchieved ?? "").trim() !== "" && Number(value.csAchieved) === 0;
  if (csNotTested) return checks.every((result) => result === "OK") ? "QC PASS" : "Pending";
  const actual = positiveNumber(value.csAchieved);
  const standard = positiveNumber(csStandard);
  const csPasses = actual !== undefined && standard !== undefined && actual + Math.abs(standard) * 1e-9 >= standard * (1 + marginPercent / 100);
  if (actual !== undefined && standard !== undefined && !csPasses) return "QC FAIL";

  if (checks.every((result) => result === "OK") && actual !== undefined && standard !== undefined) {
    return csPasses ? "QC PASS" : "QC FAIL";
  }

  // No CS Std (item CS Std and PDI CS Required both empty): nothing to judge CS against,
  // so the result follows the 5 checks alone.
  if (standard === undefined && checks.every((result) => result === "OK")) return "QC PASS";

  return "Pending";
}
