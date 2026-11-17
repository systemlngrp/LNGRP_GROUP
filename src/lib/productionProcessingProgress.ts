import type { ProductionProcessing } from "../types";
import { normalizeMachineName } from "./productionMachineNames";

export function usesPartFullProgress(machineName?: string | null) {
  return Boolean(normalizeMachineName(machineName));
}

export function isProcessingStepFull(entry: ProductionProcessing) {
  // Records created before completionStatus existed followed the old one-report-completes behavior.
  return !entry.completionStatus || entry.completionStatus === "Full";
}

export function isMachineStepFull(
  processing: ProductionProcessing[],
  productionId: string,
  machineName: string
) {
  const normalizedName = normalizeMachineName(machineName);
  return processing.some(
    (entry) =>
      entry.productionId === productionId &&
      normalizeMachineName(entry.machineName) === normalizedName &&
      isProcessingStepFull(entry)
  );
}

export function isCorrugationLinerComplete(
  processing: ProductionProcessing[],
  productionId: string
) {
  return Boolean(productionId) && processing.some(
    (entry) =>
      entry.productionId === productionId &&
      normalizeMachineName(entry.machineName) === "Corrugation Liner" &&
      isProcessingStepFull(entry)
  );
}

export function getCurrentProcessingMachine(
  processing: ProductionProcessing[],
  productionId: string,
  requiredMachines: string[]
) {
  const orderedMachines = Array.from(
    new Set(requiredMachines.map((machineName) => normalizeMachineName(machineName)).filter(Boolean))
  );
  return orderedMachines.find(
    (machineName) => !isMachineStepFull(processing, productionId, machineName)
  ) || "";
}

// Boxes made on Corrugation Liner per job (part + full entries). The loading
// slip loads FG jobs against this qty instead of Prod (FG).
export function corrugationLinerQtyByJobId(processing: ProductionProcessing[]) {
  const totals = new Map<string, number>();
  const target = normalizeMachineName("Corrugation Liner");
  processing.forEach((entry) => {
    if (normalizeMachineName(entry.machineName) !== target) return;
    const jobId = String(entry.productionId || "").trim();
    if (!jobId) return;
    totals.set(jobId, (totals.get(jobId) || 0) + (Number(entry.qty) || 0));
  });
  return totals;
}

// Jobs with at least one Printing entry (part or full). Invoicing is blocked
// for loading slips that load from a job without one.
export function jobIdsWithPrintingEntry(processing: ProductionProcessing[]) {
  const target = normalizeMachineName("Printing");
  return new Set(
    processing
      .filter((entry) => normalizeMachineName(entry.machineName) === target)
      .map((entry) => String(entry.productionId || "").trim())
      .filter(Boolean),
  );
}
