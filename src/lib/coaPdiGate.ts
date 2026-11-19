import { normalizeQcResult } from "./jobCellColors";

/** Latest PDI of a job: COA can be made only when it is PASS. */
export type JobPdiStatus = "PASS" | "FAIL" | "PENDING";

type InspectionLike = { productionId?: unknown; jobNo?: unknown; result?: unknown; updateTimestamp?: unknown; inspectionDate?: unknown };
type ProductionLike = { id?: unknown; transactionNo?: unknown; jobCardNo?: unknown };

const k = (value: unknown) => String(value ?? "").trim().toLowerCase();
const at = (inspection: InspectionLike) => String(inspection.updateTimestamp || inspection.inspectionDate || "");

export const pdiStatusOfResult = (result: unknown): JobPdiStatus => {
  const normalized = normalizeQcResult(result);
  return normalized === "QC PASS" ? "PASS" : normalized === "QC FAIL" ? "FAIL" : "PENDING";
};

/** Job's PDI status by production id (PDIs saved on the job first, else by job no.). */
export function pdiStatusByProduction(productions: ProductionLike[], inspections: InspectionLike[]): Map<string, JobPdiStatus> {
  const latestBy = (keyOf: (inspection: InspectionLike) => string) => {
    const map = new Map<string, InspectionLike>();
    inspections.forEach((inspection) => {
      const key = keyOf(inspection);
      if (!key) return;
      const current = map.get(key);
      if (!current || at(inspection) >= at(current)) map.set(key, inspection);
    });
    return map;
  };
  const byProduction = latestBy((inspection) => k(inspection.productionId));
  const byJob = latestBy((inspection) => k(inspection.jobNo));
  const result = new Map<string, JobPdiStatus>();
  productions.forEach((production) => {
    const id = String(production.id ?? "");
    const latest = byProduction.get(k(id)) || byJob.get(k(production.transactionNo || production.jobCardNo));
    result.set(id, pdiStatusOfResult(latest?.result));
  });
  return result;
}

export const COA_PDI_MESSAGE = "COA can be generated only after PDI PASS.";
