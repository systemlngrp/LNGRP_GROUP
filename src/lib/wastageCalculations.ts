import type { Production, ProductionProcessing } from "../types";

const nonNegative = (value: unknown) => {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : 0;
};

const normalizeMachineName = (value?: string | null) =>
  String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export type WastageTotals = {
  corrugationKg: number;
  printingKg: number;
  noHisabKg: number;
  totalWastageKg: number;
};

export function getKgPerBox(production?: Pick<Production, "totalPaperWeight" | "qty" | "plannedQty"> | null) {
  const paperWeight = nonNegative(production?.totalPaperWeight);
  const plannedQty = nonNegative(production?.qty) || nonNegative(production?.plannedQty);
  return paperWeight > 0 && plannedQty > 0 ? paperWeight / plannedQty : 0;
}

export function getProductionWastageTotals(
  production: Production,
  processingRows: ProductionProcessing[] = []
): WastageTotals {
  const kgPerBox = getKgPerBox(production);
  let corrugationKg = 0;
  let printingKg = 0;
  let noHisabKg = 0;

  processingRows
    .filter((row) => row.productionId === production.id && (row.completionStatus || "Full") === "Full")
    .forEach((row) => {
      const machine = normalizeMachineName(row.machineName);
      if (machine === "corrugation liner") {
        const categoryKg =
          nonNegative(row.warpageBoxes) * kgPerBox +
          nonNegative(row.delaminationBoxes) * kgPerBox +
          nonNegative(row.misalignmentBoxes) * kgPerBox +
          nonNegative(row.sheerCutterBoxes) * kgPerBox +
          nonNegative(row.twoPlyPaperKg) +
          nonNegative(row.deckelWastageKg);
        corrugationKg += categoryKg;
        noHisabKg += nonNegative(row.noHisabBoxes) * kgPerBox;
      }
      if (machine === "printing") {
        printingKg +=
          nonNegative(row.slotting) +
          nonNegative(row.delaminationPrinting) +
          nonNegative(row.misalignmentPrinting) +
          nonNegative(row.drySheets) +
          nonNegative(row.warp) +
          nonNegative(row.misprinting) +
          nonNegative(row.jobSetting);
      }
    });

  return {
    corrugationKg,
    printingKg,
    noHisabKg,
    totalWastageKg: corrugationKg + printingKg + noHisabKg,
  };
}

export function getWastagePercent(totalWastageKg: number, actualPaperUsedKg: number) {
  const actual = nonNegative(actualPaperUsedKg);
  return actual > 0 ? (nonNegative(totalWastageKg) / actual) * 100 : 0;
}

export function getTotalWastageTotals(
  productions: Production[],
  processingRows: ProductionProcessing[],
  getActualPaperUsed: (production: Production) => number
) {
  return productions
    .filter((production) => production.status !== "Cancelled" && !production.cancelTimestamp)
    .reduce(
      (totals, production) => {
        const wastage = getProductionWastageTotals(production, processingRows);
        totals.totalWastageKg += wastage.totalWastageKg;
        totals.actualPaperUsedKg += nonNegative(getActualPaperUsed(production));
        return totals;
      },
      { totalWastageKg: 0, actualPaperUsedKg: 0 }
    );
}
