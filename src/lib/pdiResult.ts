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

export function derivePdiResult(
  value: Pick<Partial<PreDispatchInspection>, PdiCheckKey | "csAchieved">,
  csStandard: unknown,
): "Pending" | "QC PASS" | "QC FAIL" {
  const checks = PDI_CHECK_KEYS.map((key) => text(value[key]).toUpperCase());
  if (checks.some((result) => result === "NOT OK")) return "QC FAIL";

  const actual = positiveNumber(value.csAchieved);
  const standard = positiveNumber(csStandard);
  const csPasses = actual !== undefined && standard !== undefined && actual + Math.abs(standard) * 1e-9 >= standard * 1.1;
  if (actual !== undefined && standard !== undefined && !csPasses) return "QC FAIL";

  if (checks.every((result) => result === "OK") && actual !== undefined && standard !== undefined) {
    return csPasses ? "QC PASS" : "QC FAIL";
  }

  return "Pending";
}
