import { normalizeQcResult } from "./jobCellColors";
import { PDI_CHECK_KEYS } from "./pdiResult";

/** Latest PDI of a job: COA can be made only when it is PASS. NONE = no PDI recorded. */
export type JobPdiStatus = "PASS" | "FAIL" | "PENDING" | "NONE";

type InspectionLike = { productionId?: unknown; jobNo?: unknown; result?: unknown; updateTimestamp?: unknown; inspectionDate?: unknown };
type ProductionLike = { id?: unknown; transactionNo?: unknown; jobCardNo?: unknown };

const k = (value: unknown) => String(value ?? "").trim().toLowerCase();
// When the PDI was done (inspection date), then when it was last saved: a later edit of an
// older PDI does not make it the latest.
const at = (inspection: InspectionLike) => `${String(inspection.inspectionDate || inspection.updateTimestamp || "")}|${String(inspection.updateTimestamp || "")}`;

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

/** All 5 PDI checks are OK. */
export const pdiChecksAllOk = (inspection: Record<string, unknown>) =>
  PDI_CHECK_KEYS.every((key) => String(inspection[key] ?? "").trim().toUpperCase() === "OK");

/**
 * Job's PDI status by production id.
 * Pass csStandardFor to allow COA when the item has no CS Std: a PDI that is not PASS / FAIL,
 * with all 5 checks OK and no CS Std (item CS Std and PDI CS Required both empty), counts as PASS.
 */
export function pdiStatusByProduction<T extends InspectionLike>(
  productions: ProductionLike[],
  inspections: T[],
  csStandardFor?: (productionId: string, inspection: T) => number | undefined,
): Map<string, JobPdiStatus> {
  const result = new Map<string, JobPdiStatus>();
  latestPdiByProduction(productions, inspections).forEach((latest, id) => {
    if (!latest) return result.set(id, "NONE");
    const status = pdiStatusOfResult(latest.result);
    const noCsStd = status === "PENDING" && csStandardFor && csStandardFor(id, latest) === undefined && pdiChecksAllOk(latest as Record<string, unknown>);
    result.set(id, noCsStd ? "PASS" : status);
  });
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
