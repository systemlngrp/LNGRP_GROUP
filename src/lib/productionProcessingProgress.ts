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
      entry.completionStatus === "Full"
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
