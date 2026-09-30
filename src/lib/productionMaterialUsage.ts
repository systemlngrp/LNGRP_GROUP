import {
  Material,
  MaterialIssue,
  MaterialIssueLine,
  MaterialIssueReelLine,
  MaterialReturn,
  MaterialReturnLine,
  MaterialReturnReelLine,
  Production,
} from "../types";

export function hasWorkflowValue(value: unknown) {
  if (value === null || value === undefined) return false;
  const asString = String(value).trim();
  if (!asString) return false;
  const asNumber = Number(asString);
  return Number.isFinite(asNumber) ? asNumber > 0 : true;
}

export function hasPaperNotRequiredBypass(
  production: Pick<Production, "paperNotRequired" | "paperNotRequiredReason">
) {
  return Boolean(production.paperNotRequired) && String(production.paperNotRequiredReason || "").trim().length > 0;
}

function normalizeMaterialText(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function isCorrugatedSheetMaterial(material?: Pick<Material, "name"> | null) {
  const normalizedName = normalizeMaterialText(material?.name);
  return normalizedName.includes("corrugated sheet");
}

export function buildProductionMaterialUsageMap(
  materialIssues: MaterialIssue[],
  materialIssueLines: MaterialIssueLine[],
  materialReturns: MaterialReturn[],
  materialReturnLines: MaterialReturnLine[],
  materialIssueReelLines: MaterialIssueReelLine[] = [],
  materialReturnReelLines: MaterialReturnReelLine[] = [],
  productions: Pick<Production, "id" | "transactionNo" | "jobCardNo">[] = []
) {
  const productionIds = new Set(productions.map((production) => production.id));
  const productionIdByJobNo = new Map<string, string>();
  productions.forEach((production) => {
    for (const value of [production.transactionNo, production.jobCardNo]) {
      const jobNo = String(value || "").trim().toLowerCase();
      if (jobNo && !productionIdByJobNo.has(jobNo)) productionIdByJobNo.set(jobNo, production.id);
    }
  });
  const resolveProductionId = (productionId?: string, jobNo?: string) => {
    const id = String(productionId || "").trim();
    if (id && (productions.length === 0 || productionIds.has(id))) return id;
    return productionIdByJobNo.get(String(jobNo || "").trim().toLowerCase());
  };
  const issueProductionMap = new Map(
    materialIssues
      .filter((issue) => issue.issueType === "Job")
      .map((issue) => [issue.id, resolveProductionId(issue.productionId, issue.jobNo)])
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
  );
  const returnProductionMap = new Map(
    materialReturns
      .filter((entry) => entry.returnType === "Job")
      .map((entry) => [entry.id, resolveProductionId(entry.productionId, entry.jobNo)])
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
  );

  const totals = new Map<string, number>();
  const existingIssueLineIds = new Set(materialIssueLines.map((line) => line.id));
  const existingReturnLineIds = new Set(materialReturnLines.map((line) => line.id));

  materialIssueLines.forEach((line) => {
    const productionId = issueProductionMap.get(line.materialIssueId);
    if (!productionId) return;
    totals.set(productionId, (totals.get(productionId) || 0) + Number(line.qty || 0));
  });

  materialReturnLines.forEach((line) => {
    const productionId = returnProductionMap.get(line.materialReturnId);
    if (!productionId) return;
    totals.set(productionId, (totals.get(productionId) || 0) - Number(line.qty || 0));
  });

  materialIssueReelLines.forEach((line) => {
    if (existingIssueLineIds.has(line.materialIssueLineId)) return;
    const productionId = resolveProductionId(line.productionId, line.jobNo) || issueProductionMap.get(line.materialIssueId);
    if (!productionId) return;
    totals.set(productionId, (totals.get(productionId) || 0) + Number(line.weightKg || 0));
  });

  materialReturnReelLines.forEach((line) => {
    if (existingReturnLineIds.has(line.materialReturnLineId)) return;
    const productionId = resolveProductionId(line.productionId, line.jobNo) || returnProductionMap.get(line.materialReturnId);
    if (!productionId) return;
    totals.set(productionId, (totals.get(productionId) || 0) - Number(line.weightKg || 0));
  });

  totals.forEach((value, key) => {
    totals.set(key, Math.max(0, Number(value.toFixed(5))));
  });

  return totals;
}

export function buildProductionCorrugatedSheetUsageMap(
  materials: Pick<Material, "id" | "name">[],
  materialIssues: MaterialIssue[],
  materialIssueLines: MaterialIssueLine[],
  materialReturns: MaterialReturn[],
  materialReturnLines: MaterialReturnLine[]
) {
  const materialMap = new Map(materials.map((material) => [material.id, material]));
  const issueProductionMap = new Map(
    materialIssues
      .filter((issue) => issue.issueType === "Job" && issue.productionId)
      .map((issue) => [issue.id, issue.productionId as string])
  );
  const returnProductionMap = new Map(
    materialReturns
      .filter((entry) => entry.returnType === "Job" && entry.productionId)
      .map((entry) => [entry.id, entry.productionId as string])
  );

  const totals = new Map<string, number>();

  materialIssueLines.forEach((line) => {
    const material = materialMap.get(line.materialId);
    if (!isCorrugatedSheetMaterial(material)) return;
    const productionId = issueProductionMap.get(line.materialIssueId);
    if (!productionId) return;
    totals.set(productionId, (totals.get(productionId) || 0) + Number(line.qty || 0));
  });

  materialReturnLines.forEach((line) => {
    const material = materialMap.get(line.materialId);
    if (!isCorrugatedSheetMaterial(material)) return;
    const productionId = returnProductionMap.get(line.materialReturnId);
    if (!productionId) return;
    totals.set(productionId, (totals.get(productionId) || 0) - Number(line.qty || 0));
  });

  totals.forEach((value, key) => {
    totals.set(key, Math.max(0, Number(value.toFixed(5))));
  });

  return totals;
}

export function hasProductionCorrugatedSheetUsage(
  production: Pick<Production, "id">,
  usageMap?: Map<string, number>
) {
  return Number(usageMap?.get(production.id) || 0) > 0;
}

export function hasProductionMaterialUsage(
  production: Pick<Production, "id"> | string,
  usageMap?: Map<string, number>
) {
  const productionId = typeof production === "string" ? production : production.id;
  return Number(usageMap?.get(productionId) || 0) > 0;
}

export function getProductionActualPaperUsed(
  production: Production,
  usageMap?: Map<string, number>
) {
  if (usageMap?.has(production.id)) {
    return usageMap.get(production.id) || 0;
  }
  return Number(production.actualPaperUsed || 0);
}

export function syncProductionWorkflowFromUsage(
  production: Production,
  actualPaperUsed: number,
  timestamp: string,
  hasCorrugatedSheetUsage = false
) {
  if (production.cancelTimestamp || production.status === "Cancelled") {
    return { ...production, actualPaperUsed };
  }
  if (production.tallyTimestamp || production.status === "Completed") {
    return { ...production, actualPaperUsed };
  }

  const normalizedUsage = Math.max(0, Number(actualPaperUsed || 0));
  const bypassedPaperIssue = hasPaperNotRequiredBypass(production);
  const hasEligibleMaterialIssue = normalizedUsage > 0 || hasCorrugatedSheetUsage || bypassedPaperIssue;
  let status: Production["status"] = "Pending Consumption";

  if (hasEligibleMaterialIssue) status = "Pending Tally";

  return {
    ...production,
    actualPaperUsed: normalizedUsage,
    status,
    updatedBy: "System User",
    updateTimestamp: timestamp,
  };
}

