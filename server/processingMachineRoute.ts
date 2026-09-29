export type ProcessingRouteInput = {
  itemSource?: string | null;
  methodology?: string | null;
  phpScheduledJobId?: string | null;
  plateScheduledJobId?: string | null;
  phpMasterMethodology?: string | null;
  plateMasterMethodology?: string | null;
  boxType?: string | null;
};

export function getProcessingMachineRoute(
  production: ProcessingRouteInput,
  mandatoryByType: Record<string, string[]>,
  normalizeMachineName: (name: string) => string
) {
  const phpId = String(production.phpScheduledJobId || "").trim();
  const plateId = String(production.plateScheduledJobId || "").trim();
  const source = phpId ? "PHP" : plateId ? "PLATE" : String(production.itemSource || "FG").trim().toUpperCase();
  const methodology = String(
    (phpId ? production.phpMasterMethodology : plateId ? production.plateMasterMethodology : "")
      || production.methodology || ""
  ).trim().toUpperCase();

  if (source === "PHP" || source === "PLATE") {
    const names = methodology === "CORRUGATION"
      ? ["Corrugation Liner", "Printing"]
      : ["Corrugation Liner"];
    return { source, methodology, requiredMachines: names.map(normalizeMachineName) };
  }

  const typeName = String(production.boxType || "").trim();
  const mappingKey = Object.keys(mandatoryByType).find((key) => key.toUpperCase() === typeName.toUpperCase());
  const requiredMachines = Array.from(new Set(
    (mappingKey ? mandatoryByType[mappingKey] : []).map(normalizeMachineName).filter(Boolean)
  ));
  return { source, methodology, requiredMachines };
}

export function getCurrentRequiredMachine(
  requiredMachines: string[],
  records: Array<{ machineName?: string | null; completionStatus?: string | null }>,
  normalizeMachineName: (name: string) => string
) {
  const completed = new Set(records
    .filter((row) => {
      const status = String(row.completionStatus || "").trim().toUpperCase();
      return !status || status === "FULL";
    })
    .map((row) => normalizeMachineName(String(row.machineName || ""))));
  return requiredMachines.find((machineName) => !completed.has(machineName)) || "";
}
