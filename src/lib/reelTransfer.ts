import { MaterialIssueLine, MaterialIssueReelLine, MaterialReturnReelLine, Production, ProductionProcessing } from "../types";
import { round2 } from "./materialMovement";

export const DEFAULT_REEL_TRANSFER_WINDOW_HOURS = 12;

const normalize = (value: unknown) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

export type ReelTransferEligibilityStatus =
  | "eligible"
  | "corrugation_incomplete"
  | "window_expired"
  | "no_reel_balance"
  | "plan_quantity_missing"
  | "job_weight_missing"
  | "no_unused_weight";

function positiveFinite(value: unknown) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0;
}

function getValidTime(primary: unknown, fallback: unknown) {
  const primaryTime = new Date(String(primary || "")).getTime();
  if (Number.isFinite(primaryTime) && primaryTime > 0) return primaryTime;
  const fallbackTime = new Date(String(fallback || "")).getTime();
  return Number.isFinite(fallbackTime) && fallbackTime > 0 ? fallbackTime : 0;
}

export function hasReelIssueHistory(
  production: Pick<Production, "id" | "transactionNo">,
  issueReels: MaterialIssueReelLine[]
) {
  return issueReels.some((row) =>
    row.productionId === production.id || normalize(row.jobNo) === normalize(production.transactionNo)
  );
}

export function getCorrugationFullTime(processing: ProductionProcessing[], productionId: string) {
  const times = processing
    .filter((row) => row.productionId === productionId && normalize(row.machineName) === "corrugation liner" && normalize(row.completionStatus) === "full")
    .map((row) => getValidTime(row.updateTimestamp, row.date))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  return times[0] || 0;
}

export function buildReelTransferContext(
  production: Production,
  processing: ProductionProcessing[],
  issueReels: MaterialIssueReelLine[],
  returnReels: MaterialReturnReelLine[],
  issueLines: MaterialIssueLine[],
  productions: Production[],
  windowHours: number,
  now = Date.now(),
  prebuiltLineById?: Map<string, MaterialIssueLine>
) {
  const fullTime = getCorrugationFullTime(processing, production.id);
  const expiresAt = fullTime + windowHours * 60 * 60 * 1000;
  const belongsToJob = (row: { productionId?: string; jobNo?: string }) =>
    row.productionId === production.id || normalize(row.jobNo) === normalize(production.transactionNo);
  const sourceIssues = issueReels.filter(belongsToJob);
  const sourceReturns = returnReels.filter(belongsToJob);
  const issuedBySlip = new Map<string, number>();
  const latestIssueBySlip = new Map<string, MaterialIssueReelLine>();
  const returnedSlipIds = new Set(
    sourceReturns
      .filter((row) => Number(row.weightKg || 0) > 0.004)
      .map((row) => String(row.packingSlipId || "").trim())
      .filter(Boolean)
  );
  const returnedReelNos = new Set(
    sourceReturns
      .filter((row) => Number(row.weightKg || 0) > 0.004)
      .map((row) => normalize(row.ourReelNo))
      .filter(Boolean)
  );
  sourceIssues.forEach((row) => {
    const slipId = String(row.packingSlipId || "").trim();
    if (!slipId) return;
    issuedBySlip.set(slipId, (issuedBySlip.get(slipId) || 0) + Number(row.weightKg || 0));
    latestIssueBySlip.set(slipId, row);
  });
  const lineById = prebuiltLineById || new Map(issueLines.map((line) => [line.id, line]));
  const reels = Array.from(issuedBySlip.entries()).flatMap(([packingSlipId, issuedWeightKg]) => {
    const issue = latestIssueBySlip.get(packingSlipId);
    if (!issue || issuedWeightKg <= 0) return [];
    if (returnedSlipIds.has(packingSlipId) || returnedReelNos.has(normalize(issue.ourReelNo))) return [];
    const availableWeightKg = round2(issuedWeightKg);
    const line = lineById.get(issue.materialIssueLineId);
    const rate = Number(line?.rate || line?.lastPurchaseRate || line?.openingRate || 0);
    return [{ ...issue, packingSlipId, weightKg: availableWeightKg, originalIssuedWeightKg: round2(issuedWeightKg), rate }];
  });
  const totalIssuedKg = sourceIssues.reduce((sum, row) => sum + Number(row.weightKg || 0), 0);
  const totalReturnedKg = sourceReturns.reduce((sum, row) => sum + Number(row.weightKg || 0), 0);
  const planQty = positiveFinite(production.qty) || positiveFinite(production.plannedQty);
  const requiredKg = positiveFinite(production.totalPaperWeight);
  const corrugationQty = processing
    .filter((row) => row.productionId === production.id && normalize(row.machineName) === "corrugation liner" && getValidTime(row.updateTimestamp, row.date) <= fullTime)
    .reduce((sum, row) => sum + Number(row.qty || 0), 0);
  const consumedKg = planQty > 0 ? corrugationQty * requiredKg / planQty : 0;
  const notionalLeftKg = Math.max(0, totalIssuedKg - totalReturnedKg - consumedKg);
  const outstandingOriginalIssuedKg = reels.reduce((sum, reel) => sum + Number(reel.originalIssuedWeightKg || 0), 0);
  const reelsWithNotionalTransfer = reels.map((reel) => {
    const proportionalNotionalWeight = outstandingOriginalIssuedKg > 0
      ? notionalLeftKg * Number(reel.originalIssuedWeightKg || 0) / outstandingOriginalIssuedKg
      : 0;
    const transferWeightKg = round2(Math.min(reel.weightKg, proportionalNotionalWeight));
    return { ...reel, transferWeightKg, amount: round2(transferWeightKg * reel.rate) };
  });
  let status: ReelTransferEligibilityStatus = "eligible";
  if (!fullTime) status = "corrugation_incomplete";
  else if (now > expiresAt) status = "window_expired";
  else if (!reels.length) status = "no_reel_balance";
  else if (planQty <= 0) status = "plan_quantity_missing";
  else if (requiredKg <= 0) status = "job_weight_missing";
  else if (notionalLeftKg <= 0.004) status = "no_unused_weight";
  const formatKg = (value: number) => `${round2(value).toFixed(2)} KG`;
  const reasonByStatus: Record<ReelTransferEligibilityStatus, string> = {
    eligible: "Eligible",
    corrugation_incomplete: "Transfer unavailable: Corrugation Liner must be completed as Full before reel balance can be transferred.",
    window_expired: `Transfer unavailable: the ${windowHours}-hour transfer window has expired since Corrugation Liner was completed.`,
    no_reel_balance: `Transfer unavailable: no remaining issued reel balance is available after returns (issued ${formatKg(totalIssuedKg)}, returned ${formatKg(totalReturnedKg)}).`,
    plan_quantity_missing: `Transfer unavailable: production/planned quantity is missing or zero (current value ${round2(planQty)}).`,
    job_weight_missing: `Transfer unavailable: required paper weight (totalPaperWeight) is missing or zero (current value ${formatKg(requiredKg)}).`,
    no_unused_weight: `Transfer unavailable: no unused reel weight remains after Corrugation (issued ${formatKg(totalIssuedKg)}, returned ${formatKg(totalReturnedKg)}, Corrugation consumed ${formatKg(consumedKg)}, remaining ${formatKg(notionalLeftKg)}).`,
  };
  return {
    fullTime,
    expiresAt,
    eligible: status === "eligible",
    status,
    reason: reasonByStatus[status],
    totalIssuedKg: round2(totalIssuedKg),
    totalReturnedKg: round2(totalReturnedKg),
    planQty: round2(planQty),
    requiredKg: round2(requiredKg),
    corrugationQty: round2(corrugationQty),
    consumedKg: round2(consumedKg),
    notionalLeftKg: round2(notionalLeftKg),
    outstandingReelCount: reels.length,
    reels: reelsWithNotionalTransfer,
  };
}

/**
 * Same result as calling buildReelTransferContext for every production, but
 * each list is indexed once and each job gets only its own rows (in their
 * original order), instead of scanning every list once per job.
 */
export function buildReelTransferContexts(
  productions: Production[],
  processing: ProductionProcessing[],
  issueReels: MaterialIssueReelLine[],
  returnReels: MaterialReturnReelLine[],
  issueLines: MaterialIssueLine[],
  windowHours: number,
  now = Date.now()
) {
  const processingByProduction = new Map<string, ProductionProcessing[]>();
  processing.forEach((row) => {
    const list = processingByProduction.get(row.productionId);
    if (list) list.push(row);
    else processingByProduction.set(row.productionId, [row]);
  });
  const indexRows = <T extends { productionId?: string; jobNo?: string }>(rows: T[]) => {
    const byProduction = new Map<string, number[]>();
    const byJobNo = new Map<string, number[]>();
    rows.forEach((row, index) => {
      const productionKey = String(row.productionId ?? "");
      const jobKey = normalize(row.jobNo);
      (byProduction.get(productionKey) || byProduction.set(productionKey, []).get(productionKey)!).push(index);
      (byJobNo.get(jobKey) || byJobNo.set(jobKey, []).get(jobKey)!).push(index);
    });
    return (production: Production) => {
      // Rows matching the job id or job number, merged back into list order.
      const byId = byProduction.get(String(production.id ?? "")) || [];
      const byJob = byJobNo.get(normalize(production.transactionNo)) || [];
      const merged: T[] = [];
      let i = 0;
      let j = 0;
      while (i < byId.length || j < byJob.length) {
        const next = j >= byJob.length || (i < byId.length && byId[i] <= byJob[j]) ? byId[i++] : byJob[j++];
        if (merged.length && merged[merged.length - 1] === rows[next]) continue;
        merged.push(rows[next]);
      }
      return merged;
    };
  };
  const issuesFor = indexRows(issueReels);
  const returnsFor = indexRows(returnReels);
  const lineById = new Map(issueLines.map((line) => [line.id, line]));
  return new Map(productions.map((production) => [
    production.id,
    buildReelTransferContext(
      production,
      processingByProduction.get(production.id) || [],
      issuesFor(production),
      returnsFor(production),
      issueLines,
      productions,
      windowHours,
      now,
      lineById,
    ),
  ]));
}
