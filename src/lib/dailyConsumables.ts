import type { Firm, MaterialIssue, Production } from "../types";
import { isAutoProductionInterFirmIssue } from "./materialIssueClassification";

export type DailyConsumablePending = { firmId: string; firmName: string; date: string };

const dateOnly = (value?: string | null) => String(value || "").slice(0, 10);

export function isDailyConsumableIssue(issueType?: string) {
  const type = String(issueType || "").trim().toLowerCase();
  return type === "general" || type === "without job" || type === "withoutjob" || type === "without_job";
}

function addDay(date: string) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

/** Builds mandatory firm/date obligations. Legacy issues without firmId never satisfy an obligation. */
export function getPendingDailyConsumables(firms: Firm[], productions: Production[], issues: MaterialIssue[], today = new Date().toISOString().slice(0, 10)): DailyConsumablePending[] {
  const firstJobByFirm = new Map<string, string>();
  for (const production of productions) {
    const firmId = String(production.firmId || production.orderFirmId || "").trim();
    const date = dateOnly(production.date);
    if (!firmId || !date) continue;
    const existing = firstJobByFirm.get(firmId);
    if (!existing || date < existing) firstJobByFirm.set(firmId, date);
  }

  const completed = new Set(
    issues
      .filter((issue) => isDailyConsumableIssue(issue.issueType) && !isAutoProductionInterFirmIssue(issue))
      .map((issue) => {
        const firmId = String(issue.firmId || "").trim();
        const date = dateOnly(issue.date);
        return firmId && date ? `${firmId}:${date}` : "";
      })
      .filter(Boolean)
  );

  const pending: DailyConsumablePending[] = [];
  for (const firm of firms) {
    const firmId = String(firm.id || "").trim();
    const firstJobDate = firstJobByFirm.get(firmId);
    if (!firmId || !firstJobDate) continue;
    for (let date = firstJobDate; date <= today; date = addDay(date)) {
      if (!completed.has(`${firmId}:${date}`)) pending.push({ firmId, firmName: firm.firmName || firmId, date });
    }
  }
  return pending.sort((a, b) => b.date.localeCompare(a.date) || a.firmName.localeCompare(b.firmName));
}
