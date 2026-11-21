import { normalizeQcResult } from "./jobCellColors";

/** Latest PDI of a job: COA can be made only when it is PASS. NONE = no PDI recorded. */
export type JobPdiStatus = "PASS" | "FAIL" | "PENDING" | "NONE";

type InspectionLike = { productionId?: unknown; jobNo?: unknown; result?: unknown; updateTimestamp?: unknown; inspectionDate?: unknown };
type ProductionLike = { id?: unknown; transactionNo?: unknown; jobCardNo?: unknown };

const k = (value: unknown) => String(value ?? "").trim().toLowerCase();
const at = (inspection: InspectionLike) => String(inspection.updateTimestamp || inspection.inspectionDate || "");

export const pdiStatusOfResult = (result: unknown): JobPdiStatus => {
  const normalized = normalizeQcResult(result);
  return normalized === "QC PASS" ? "PASS" : normalized === "QC FAIL" ? "FAIL" : "PENDING";
};

/** Latest PDI of each job (PDIs saved on the job first, else by job no.), by production id.
 * The COA status and the COA's PDI values both come from this same PDI. */
export function latestPdiByProduction<T extends InspectionLike>(productions: ProductionLike[], inspections: T[]): Map<string, T | undefined> {
  const latestBy = (keyOf: (inspection: T) => string) => {
    const map = new Map<string, T>();
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
  const result = new Map<string, T | undefined>();
  productions.forEach((production) => {
    const id = String(production.id ?? "");
    result.set(id, byProduction.get(k(id)) || byJob.get(k(production.transactionNo)) || byJob.get(k(production.jobCardNo)));
  });
  return result;
}

/** Job's PDI status by production id. */
export function pdiStatusByProduction(productions: ProductionLike[], inspections: InspectionLike[]): Map<string, JobPdiStatus> {
  const result = new Map<string, JobPdiStatus>();
  latestPdiByProduction(productions, inspections).forEach((latest, id) => result.set(id, latest ? pdiStatusOfResult(latest.result) : "NONE"));
  return result;
}

/** Message for a job whose PDI is not PASS ("" when PASS). */
export function coaPdiBlockMessage(status: JobPdiStatus | undefined, jobNo = ""): string {
  const job = jobNo ? `Job ${jobNo}: ` : "";
  if (status === "PASS") return "";
  if (status === "FAIL") return `${job}PDI FAIL – COA cannot be made for this job.`;
  if (status === "PENDING") return `${job}PDI result is not PASS – COA cannot be made yet.`;
  return `${job}PDI not recorded – complete the PDI first.`;
}

export const COA_PDI_MESSAGE = "COA can be generated only after PDI PASS.";
