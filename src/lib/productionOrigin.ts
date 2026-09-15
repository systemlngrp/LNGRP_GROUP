import type { Production } from "../types";

export function getProductionOriginSource(
  production: Pick<Production, "itemSource" | "phpScheduledJobId" | "plateScheduledJobId">,
  phpJobIds: ReadonlySet<string>,
  plateJobIds: ReadonlySet<string>
) {
  const phpId = String(production.phpScheduledJobId || "").trim();
  if (phpId && phpJobIds.has(phpId)) return "PHP" as const;
  const plateId = String(production.plateScheduledJobId || "").trim();
  if (plateId && plateJobIds.has(plateId)) return "PLATE" as const;
  const source = String(production.itemSource || "FG").trim().toUpperCase();
  return source === "PHP" || source === "PLATE" ? source : "FG";
}
