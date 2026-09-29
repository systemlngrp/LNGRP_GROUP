import type { Machine, Production, Setting } from "../types";
import type { MandatoryMachinesByType } from "./mandatoryMachines";
import { getRequiredMachinesForType } from "./mandatoryMachines";
import { normalizeMachineName } from "./productionMachineNames";

type ProductionLikeItem = {
  boxType?: string;
  raw?: any;
};

export function resolveProductionProcessingRoute(
  production: Production,
  phpJobs: Production[],
  plateJobs: Production[]
): Production {
  const phpId = String(production.phpScheduledJobId || "").trim();
  const plateId = String(production.plateScheduledJobId || "").trim();
  const sourceJob = phpId
    ? phpJobs.find((job) => String(job.id) === phpId)
    : plateId ? plateJobs.find((job) => String(job.id) === plateId) : undefined;
  if (!sourceJob) return production;
  return {
    ...production,
    itemSource: phpId ? "PHP" : "PLATE",
    methodology: sourceJob.methodology || production.methodology,
  };
}

export function getProductionEffectiveType(
  production?: Pick<Production, "itemSource" | "phpScheduledJobId" | "plateScheduledJobId"> | null,
  item?: ProductionLikeItem | null
) {
  if (String(production?.phpScheduledJobId || "").trim()) return "PHP";
  if (String(production?.plateScheduledJobId || "").trim()) return "PLATE";
  const source = String(production?.itemSource || "FG").trim().toUpperCase();
  if (source === "PHP") return "PHP";
  if (source === "PLATE") return "PLATE";
  return String(item?.boxType || item?.raw?.boxType || item?.raw?.typeName || "").trim();
}

export function getAllMachineNames(machines: Machine[]) {
  return Array.from(
    new Set(
      machines
        .map((machine) => normalizeMachineName(machine.name))
        .filter(Boolean)
    )
  );
}

export function getRequiredMachinesForProduction(
  production: Pick<Production, "itemSource" | "methodology" | "phpScheduledJobId" | "plateScheduledJobId">,
  item: ProductionLikeItem | null | undefined,
  mapping: MandatoryMachinesByType,
  machines: Machine[]
) {
  const source = getProductionEffectiveType(production, item);
  if (source === "PHP" || source === "PLATE") {
    const methodology = String(production.methodology || "").trim().toUpperCase();
    if (methodology === "CORRUGATION") {
      return [
        normalizeMachineName("Corrugation Liner"),
        normalizeMachineName("Printing"),
      ];
    }
    return [normalizeMachineName("Corrugation Liner")];
  }
  return getRequiredMachinesForType(mapping, getProductionEffectiveType(production, item));
}
