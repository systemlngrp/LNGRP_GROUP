import { Production } from "../types";
import { hasPaperNotRequiredBypass, hasWorkflowValue } from "./productionMaterialUsage";

export function isProductionPendingPH(production: Production) {
  return false;
}

export function getProductionDisplayStatus(production: Production) {
  if (production.status === "Pending PH") {
    return "Pending Consumption";
  }
  return production.status;
}

function isFgUnlocked(production: Production, actualPaperUsed: unknown, hasCorrugatedSheetUsage = false) {
  return hasWorkflowValue(actualPaperUsed) || hasCorrugatedSheetUsage || hasPaperNotRequiredBypass(production);
}

export function isProductionPendingConsumption(
  production: Production,
  actualPaperUsed = production.actualPaperUsed,
  hasCorrugatedSheetUsage = false
) {
  // Old jobs migrated from the Summary Sheet / Loading PDF have no order or
  // schedule and are already Completed: nothing is left to issue for them.
  if (isMigratedCompletedJobWithoutOrder(production)) return false;
  // Closed jobs (Completed, or Close = Yes) need no more material.
  if (isProductionClosed(production)) return false;
  return !production.cancelTimestamp && !production.tallyTimestamp && !isFgUnlocked(production, actualPaperUsed, hasCorrugatedSheetUsage);
}

export function isProductionClosed(production: Pick<Production, "status" | "closeBy">) {
  return production.status === "Completed" || String(production.closeBy || "").trim().toLowerCase() === "yes";
}

export function isMigratedCompletedJobWithoutOrder(production: Production) {
  return !String(production.scheduleId || "").trim() && production.status === "Completed";
}

const FFG_CLOSED_JOB_CUTOFF = "2026-11-17";

// Owner's rule (21-Nov-2026): Pending Material Return shows only jobs dated
// 17-Nov-2026 or later (older jobs were bulk-closed). Undated jobs still show.
export const PENDING_RETURN_FIRST_JOB_DATE = "2026-11-17";
export function isJobOnOrAfterPendingReturnStart(production: { date?: unknown }) {
  const jobDate = getJobDateKey(production.date);
  return !jobDate || jobDate >= PENDING_RETURN_FIRST_JOB_DATE;
}

export function isProductionPendingFFG(
  production: Production,
  actualPaperUsed = production.actualPaperUsed,
  hasCorrugatedSheetUsage = false
) {
  // Old closed jobs (dated before 17-Nov-2026, the bulk close) need no FFG entry.
  if (isProductionClosed(production) && getJobDateKey(production.date) < FFG_CLOSED_JOB_CUTOFF) return false;
  return !production.cancelTimestamp && !production.tallyTimestamp && isFgUnlocked(production, actualPaperUsed, hasCorrugatedSheetUsage) && !hasWorkflowValue(production.prodFromFFG);
}

export function isProductionReadyForTally(
  production: Production,
  actualPaperUsed = production.actualPaperUsed,
  hasCorrugatedSheetUsage = false
) {
  return !production.cancelTimestamp && !production.tallyTimestamp && isFgUnlocked(production, actualPaperUsed, hasCorrugatedSheetUsage) && hasWorkflowValue(production.prodFromFFG);
}


function localDateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

// Job date as YYYY-MM-DD (plain dates kept as-is; timestamps read in local time).
export function getJobDateKey(date: unknown) {
  const raw = String(date ?? "").trim();
  if (!raw) return "";
  const plain = raw.match(/^(\d{4}-\d{2}-\d{2})(?:$|[ T]00:00(?::00(?:\.0+)?)?$)/);
  if (plain) return plain[1];
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw.slice(0, 10) : localDateKey(parsed);
}

// Pending Material Issue / Return list only jobs dated today or earlier;
// future-dated jobs appear from their job date. Jobs without a date still show.
export function isJobDueByToday(production: { date?: unknown }, today = localDateKey(new Date())) {
  const jobDate = getJobDateKey(production.date);
  return !jobDate || jobDate <= today;
}

export function isProductionPendingMaterialIssue(
  production: Production,
  actualPaperUsed = production.actualPaperUsed,
  hasCorrugatedSheetUsage = false
) {
  return isJobDueByToday(production) && isProductionPendingConsumption(production, actualPaperUsed, hasCorrugatedSheetUsage);
}
