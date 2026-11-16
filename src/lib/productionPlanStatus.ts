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

// Job number as a number: "11036" or the trailing digits of "JOB/26-27/11036".
function numericJobNumber(value: unknown) {
  const normalized = normalizeProductionPlanJobNumber(value);
  const match = normalized.match(/(\d+)$/);
  return match ? Number(match[1]) : null;
}

export function buildSampleJobNumbers(requests: SampleRequest[]) {
  const set = new Set<string>();
  requests.forEach((row) => {
    const job = normalizeProductionPlanJobNumber(row.jobCardNo);
    if (!job) return;
    set.add(job);
    const number = numericJobNumber(job);
    if (number !== null) set.add(String(number));
  });
  return set;
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
    const currentNumber = numericJobNumber(currentJob);
    const inSampleList = sampleJobNumbers.has(currentJob) || (currentNumber !== null && sampleJobNumbers.has(String(currentNumber)));
    const isSample = inSampleList || consecutiveSameItem;
    const realization = Number(row.realizationPerKg);
    const shouldHighlight = !isSample && minimumRealization !== null && Number.isFinite(realization) && realization < minimumRealization;
    return { ...row, isSample, shouldHighlight };
  });
}
