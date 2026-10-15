import type { Production } from "../types";

export function getProductionOriginSource(
  production: Pick<Production, "itemSource" | "phpScheduledJobId" | "plateScheduledJobId">,
  phpJobIds: ReadonlySet<string>,
  plateJobIds: ReadonlySet<string>
) {
  const phpId = String(production.phpScheduledJobId || "").trim();
  if (phpId) return "PHP" as const;
  const plateId = String(production.plateScheduledJobId || "").trim();
  if (plateId) return "PLATE" as const;
  const source = String(production.itemSource || "FG").trim().toUpperCase();
  return source === "PHP" || source === "PLATE" ? source : "FG";
}

export function isScrapLinkedProduction(
  production: Production,
  phpJobs: readonly Production[],
  plateJobs: readonly Production[]
) {
  const phpId = String(production.phpScheduledJobId || "").trim();
  const plateId = String(production.plateScheduledJobId || "").trim();
  if (!phpId && !plateId) return false;

  const sourceJob = phpId
    ? phpJobs.find((job) => String(job.id) === phpId)
    : plateJobs.find((job) => String(job.id) === plateId);
  const methodology = sourceJob?.methodology || production.methodology;
  return String(methodology || "").trim().toUpperCase() === "SCRAP";
}