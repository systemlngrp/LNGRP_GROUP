import { calculateTakeUpFactor } from "./utils";

const numberValue = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundTo = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export function calculateProductionTakeUpFactor(flute: unknown): number {
  const factor = calculateTakeUpFactor(String(flute ?? ""));
  return factor === "" ? 0 : factor;
}

export function calculateProductionGsm(input: {
  flute?: unknown;
  l1?: unknown;
  f1?: unknown;
  l2?: unknown;
  f2?: unknown;
  l3?: unknown;
}): number {
  const factor = calculateProductionTakeUpFactor(input.flute);
  return numberValue(input.l1)
    + numberValue(input.f1) * factor
    + numberValue(input.l2)
    + numberValue(input.f2) * factor
    + numberValue(input.l3);
}

export function calculateProductionReel(input: {
  breadth?: unknown;
  height?: unknown;
  ups?: unknown;
  idToOd?: unknown;
}): number {
  const breadth = numberValue(input.breadth);
  const height = numberValue(input.height);
  const ups = numberValue(input.ups);
  const idToOd = numberValue(input.idToOd);
  return breadth === 0
    ? height * ups
    : (breadth + height) * ups + (idToOd * ups + 16);
}

export function calculateProductionIdToOd(ply: unknown): number {
  const value = numberValue(ply);
  return value === 3 ? 6 : value === 5 ? 10 : 0;
}

export function calculateProductionIdToOd2(ply: unknown): number {
  const value = numberValue(ply);
  return value === 3 ? 40 : value === 5 ? 50 : 0;
}

export function calculateProductionDerivedValues(input: {
  reelActualWithTrimming?: unknown;
  cuttingWithTrimming?: unknown;
  gsm?: unknown;
  ups?: unknown;
  planQty?: unknown;
  plateWeight?: unknown;
  rate?: unknown;
  noOfParts?: unknown;
}) {
  const reel = numberValue(input.reelActualWithTrimming);
  const cutting = numberValue(input.cuttingWithTrimming);
  const gsm = numberValue(input.gsm);
  const ups = numberValue(input.ups);
  const planQty = numberValue(input.planQty);
  const plateWeight = numberValue(input.plateWeight);
  const rate = numberValue(input.rate);
  const noOfParts = numberValue(input.noOfParts);
  const rawSheetWeight = ups > 0 ? (reel * cutting * gsm) / 1_000_000_000 / ups : null;
  // The spreadsheet displays sheet weight to three decimals, but uses a
  // two-decimal staged weight for set weight and realization calculations.
  const sheetWeight = rawSheetWeight === null ? null : roundTo(rawSheetWeight, 3);
  const stagedSheetWeight = rawSheetWeight === null ? null : roundTo(rawSheetWeight, 2);
  const totalPaperWeight = rawSheetWeight === null ? null : Math.floor(rawSheetWeight * planQty);
  const totalWeightOfSet = stagedSheetWeight === null ? null : roundTo(stagedSheetWeight + plateWeight, 3);
  const realizationPerKg = totalWeightOfSet && totalWeightOfSet > 0
    ? (rate / totalWeightOfSet) * noOfParts
    : null;
  return { sheetWeight, totalPaperWeight, totalWeightOfSet, realizationPerKg };
}
