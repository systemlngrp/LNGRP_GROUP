import type { DispatchPlan, Production, ProductionProcessing } from "../types";
import { normalizeMachineName } from "./productionMachineNames";

export const isRejectionComplaint = (nature: unknown) =>
  String(nature ?? "").trim().toLowerCase() === "rejection";

const normalized = (value: unknown) => String(value ?? "").trim().toLowerCase();
const namedUpdater = (value: unknown) => {
  const name = String(value ?? "").trim();
  return name && !["system user", "system"].includes(name.toLowerCase()) ? name : "";
};
const time = (value: unknown) => {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

export function concernedPersonForJob(
  jobNo: string,
  area: string,
  productions: Production[],
  processing: ProductionProcessing[],
  plans: DispatchPlan[],
) {
  if (!normalized(jobNo)) return "";
  const job = productions.find((row) =>
    [row.transactionNo, row.jobCardNo].some((number) => normalized(number) === normalized(jobNo)),
  );
  if (!job) return "";

  if (area === "Boardline" || area === "Printing") {
    const machine = area === "Boardline" ? "Corrugation Liner" : "Printing";
    const latest = processing
      .filter((row) => row.productionId === job.id && normalizeMachineName(row.machineName) === machine)
      .sort((a, b) => time(b.updateTimestamp || b.date) - time(a.updateTimestamp || a.date))[0];
    return namedUpdater(latest?.updatedBy);
  }

  if (area === "Dispatch") {
    const latest = plans
      .filter((row) => row.productionId === job.id || Boolean(job.scheduleId && row.scheduleId === job.scheduleId))
      .sort((a, b) => time(b.updateTimestamp || b.date) - time(a.updateTimestamp || a.date))[0];
    return namedUpdater(latest?.updatedBy);
  }

  return "";
}
