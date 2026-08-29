import { MaterialIssueLine, MaterialIssueReelLine, MaterialReturnReelLine, Production, ProductionProcessing } from "../types";
import { getAllReturnableReelLines, round2 } from "./materialMovement";

export const DEFAULT_REEL_TRANSFER_WINDOW_HOURS = 12;

const normalize = (value: unknown) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

export function getCorrugationFullTime(processing: ProductionProcessing[], productionId: string) {
  const times = processing
    .filter((row) => row.productionId === productionId && normalize(row.machineName) === "corrugation liner" && row.completionStatus === "Full")
    .map((row) => new Date(row.updateTimestamp || row.date || 0).getTime())
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
  const reels = getAllReturnableReelLines(issueReels, returnReels, productions).filter((row) => row.productionId === production.id);
  const totalIssuedKg = issueReels
    .filter((row) => row.productionId === production.id || normalize(row.jobNo) === normalize(production.transactionNo))
    .reduce((sum, row) => sum + Number(row.weightKg || 0), 0);
  const totalReturnedKg = returnReels
    .filter((row) => row.productionId === production.id || normalize(row.jobNo) === normalize(production.transactionNo))
    .reduce((sum, row) => sum + Number(row.weightKg || 0), 0);
  const corrugationQty = processing
    .filter((row) => row.productionId === production.id && normalize(row.machineName) === "corrugation liner" && new Date(row.updateTimestamp || row.date || 0).getTime() <= fullTime)
    .reduce((sum, row) => sum + Number(row.qty || 0), 0);
  const planQty = Number(production.qty || production.plannedQty || 0);
  const requiredKg = Number(production.totalJobWeight || 0);
  const consumedKg = planQty > 0 ? corrugationQty * requiredKg / planQty : 0;
  const notionalLeftKg = Math.max(0, totalIssuedKg - totalReturnedKg - consumedKg);
  const averageNotionalKg = reels.length ? notionalLeftKg / reels.length : 0;
  const lineById = new Map(issueLines.map((line) => [line.id, line]));
  return {
    fullTime,
    expiresAt,
    eligible: Boolean(fullTime && now <= expiresAt && reels.length && planQty > 0 && requiredKg > 0 && notionalLeftKg > 0),
    corrugationQty: round2(corrugationQty),
    consumedKg: round2(consumedKg),
    notionalLeftKg: round2(notionalLeftKg),
    averageNotionalKg: round2(averageNotionalKg),
    reels: reels.map((reel) => {
      const line = lineById.get(reel.materialIssueLineId);
      const rate = Number(line?.rate || line?.lastPurchaseRate || line?.openingRate || 0);
      const transferWeightKg = round2(Math.min(reel.weightKg, averageNotionalKg));
      return { ...reel, rate, transferWeightKg, amount: round2(transferWeightKg * rate) };
    }).filter((reel) => reel.transferWeightKg > 0),
  };
}
