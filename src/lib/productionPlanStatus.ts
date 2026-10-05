import { Production, SampleRequest } from "../types";

export type ProductionPlanStatusRow = Production & {
  itemName?: string;
  isSample?: boolean;
  shouldHighlight?: boolean;
};

function normalizedText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function normalizeProductionPlanJobNumber(value: unknown) {
  return String(value ?? "").replace(/,/g, "").replace(/\s+/g, "").trim();
}

function numericJobNumber(value: unknown) {
  const normalized = normalizeProductionPlanJobNumber(value);
  if (!normalized || !/^\d+$/.test(normalized)) return null;
  return Number(normalized);
}

export function buildSampleJobNumbers(requests: SampleRequest[]) {
  return new Set(requests.map((row) => normalizeProductionPlanJobNumber(row.jobCardNo)).filter(Boolean));
}

export function deriveProductionPlanStatuses<T extends ProductionPlanStatusRow>(
  rows: T[],
  sampleJobNumbers: Set<string>,
  minimumRealization: number | null,
) {
  return rows.map((row, index) => {
    const previous = rows[index - 1];
    const currentJob = normalizeProductionPlanJobNumber(row.transactionNo || row.jobCardNo);
    const previousJob = numericJobNumber(previous?.transactionNo || previous?.jobCardNo);
    const consecutiveSameItem = Boolean(
      previous &&
      numericJobNumber(currentJob) !== null &&
      previousJob !== null &&
      numericJobNumber(currentJob) === previousJob + 1 &&
      normalizedText(row.itemName) === normalizedText(previous.itemName)
    );
    const isSample = sampleJobNumbers.has(currentJob) || consecutiveSameItem;
    const realization = Number(row.realizationPerKg);
    const shouldHighlight = !isSample && minimumRealization !== null && Number.isFinite(realization) && realization < minimumRealization;
    return { ...row, isSample, shouldHighlight };
  });
}
