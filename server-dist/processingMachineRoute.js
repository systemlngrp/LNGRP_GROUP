export function getProcessingMachineRoute(production, mandatoryByType, normalizeMachineName) {
    const phpId = String(production.phpScheduledJobId || "").trim();
    const plateId = String(production.plateScheduledJobId || "").trim();
    const source = phpId ? "PHP" : plateId ? "PLATE" : String(production.itemSource || "FG").trim().toUpperCase();
    const methodology = String((phpId ? production.phpMasterMethodology : plateId ? production.plateMasterMethodology : "")
        || production.methodology || "").trim().toUpperCase();
    if (source === "PHP" || source === "PLATE") {
        const names = methodology === "CORRUGATION"
            ? ["Corrugation Liner", "Printing"]
            : ["Corrugation Liner"];
        return { source, methodology, requiredMachines: names.map(normalizeMachineName) };
    }
    const typeName = String(production.boxType || "").trim();
    const mappingKey = Object.keys(mandatoryByType).find((key) => key.toUpperCase() === typeName.toUpperCase());
    const requiredMachines = Array.from(new Set((mappingKey ? mandatoryByType[mappingKey] : []).map(normalizeMachineName).filter(Boolean)));
    return { source, methodology, requiredMachines };
}
export function getCurrentRequiredMachine(requiredMachines, records, normalizeMachineName) {
    const completed = new Set(records
        .filter((row) => {
        const status = String(row.completionStatus || "").trim().toUpperCase();
        return !status || status === "FULL";
    })
        .map((row) => normalizeMachineName(String(row.machineName || ""))));
    return requiredMachines.find((machineName) => !completed.has(machineName)) || "";
}
