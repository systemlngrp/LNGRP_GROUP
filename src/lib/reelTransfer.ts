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

const STATUS_REASONS: Record<ReelTransferEligibilityStatus, string> = {
  eligible: "Eligible",
  corrugation_incomplete: "Corrugation Liner is not Full",
  window_expired: "Transfer window expired",
  no_reel_balance: "No remaining issued reel balance",
  plan_quantity_missing: "Plan quantity missing",
  job_weight_missing: "Weight calculation unavailable",
  no_unused_weight: "No unused reel weight remains after Corrugation",
};

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
  now = Date.now()
) {
  const fullTime = getCorrugationFullTime(processing, production.id);
  const expiresAt = fullTime + windowHours * 60 * 60 * 1000;
  const belongsToJob = (row: { productionId?: string; jobNo?: string }) =>
    row.productionId === production.id || normalize(row.jobNo) === normalize(production.transactionNo);
  const sourceIssues = issueReels.filter(belongsToJob);
  const sourceReturns = returnReels.filter(belongsToJob);
  const issuedBySlip = new Map<string, number>();
  const returnedBySlip = new Map<string, number>();
  const latestIssueBySlip = new Map<string, MaterialIssueReelLine>();
  sourceIssues.forEach((row) => {
    const slipId = String(row.packingSlipId || "").trim();
    if (!slipId) return;
    issuedBySlip.set(slipId, (issuedBySlip.get(slipId) || 0) + Number(row.weightKg || 0));
    latestIssueBySlip.set(slipId, row);
  });
  sourceReturns.forEach((row) => {
    const slipId = String(row.packingSlipId || "").trim();
    if (slipId) returnedBySlip.set(slipId, (returnedBySlip.get(slipId) || 0) + Number(row.weightKg || 0));
  });
  const lineById = new Map(issueLines.map((line) => [line.id, line]));
  const reels = Array.from(issuedBySlip.entries()).flatMap(([packingSlipId, issuedWeightKg]) => {
    const issue = latestIssueBySlip.get(packingSlipId);
    const availableWeightKg = round2(issuedWeightKg - (returnedBySlip.get(packingSlipId) || 0));
    if (!issue || issuedWeightKg <= 0 || availableWeightKg <= 0.004) return [];
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
  return {
    fullTime,
    expiresAt,
    eligible: status === "eligible",
    status,
    reason: STATUS_REASONS[status],
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
