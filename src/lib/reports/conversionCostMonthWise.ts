// Conversion cost month-wise: shared by the page (browser fallback) and the
// server report engine. Same calculation the page used before.
import type { FixedMonthlyExpense, Material, MaterialIn, MaterialInPackingSlip, MaterialIssue, MaterialIssueLine, MaterialIssueReelLine, MaterialReturnReelLine, Production } from "../../types";
import { FY_MONTHS, getFinancialYearFromDate, getFinancialYearOptions } from "../financialYear";
import { resolveMaterialIssueRate } from "../materialMovement";
import { getReelRateForSlip } from "./jobwiseReelConsumption";

export type ConversionCostMonthRow = {
  month: string;
  monthValue: number;
  consumables: number;
  fixed: number;
  totalConsumption: number;
  actualPaperUsedCost: number;
  ratio: number;
};

export type ConversionCostMonthWiseLists = {
  materialIssues: MaterialIssue[];
  issueLines: MaterialIssueLine[];
  materials: Material[];
  materialIn: MaterialIn[];
  fixedExpenses: FixedMonthlyExpense[];
  productions: Production[];
  packingSlips: MaterialInPackingSlip[];
  issueReelLines: MaterialIssueReelLine[];
  returnReelLines: MaterialReturnReelLine[];
};

export function normalizeExpenseLines(value: FixedMonthlyExpense["lines"] | string | undefined) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function round2(value: number) {
  return Number(Number(value || 0).toFixed(2));
}

function isConsumableIssue(issue?: MaterialIssue) {
  const type = String(issue?.issueType || "").toLowerCase();
  return type === "without job" || type === "general";
}

function getLineAmount(line: MaterialIssueLine, materials: Material[], materialIn: MaterialIn[]) {
  const savedAmount = Number(line.amount || 0);
  if (savedAmount > 0) return savedAmount;
  const qty = Number(line.qty || 0);
  const savedRate = Number(line.rate || 0);
  if (savedRate > 0) return qty * savedRate;
  return resolveMaterialIssueRate(line.materialId, materials, materialIn, qty).amount;
}

/** FY options and all 12 month rows for one FY; the month filter stays in the page. */
export function computeConversionCostMonthWise(lists: ConversionCostMonthWiseLists, fy: string) {
  const { materialIssues, issueLines, materials, materialIn, fixedExpenses, productions, packingSlips, issueReelLines, returnReelLines } = lists;
  const normalizedFixedExpenses = fixedExpenses.map((record) => ({ ...record, lines: normalizeExpenseLines(record.lines) }));
  const issueYears = materialIssues.map((issue) => getFinancialYearFromDate(issue.date)).filter(Boolean);
  const fixedYears = normalizedFixedExpenses.map((record) => record.fy);
  const fyOptions = getFinancialYearOptions([...issueYears, ...fixedYears]);

  const issueMap = new Map(materialIssues.map((issue) => [issue.id, issue]));
  const materialMap = new Map(materials.map((material) => [material.id, material]));
  const materialInMap = new Map(materialIn.map((entry) => [entry.id, entry]));
  const packingSlipMap = new Map(packingSlips.map((slip) => [slip.id, slip]));
  const productionMap = new Map(productions.map((production) => [production.id, production]));

  // One pass per list, bucketed by month (same filters as the old per-month loops).
  const consumablesByMonth = new Map<number, number>();
  issueLines.forEach((line) => {
    const issue = issueMap.get(line.materialIssueId);
    if (!isConsumableIssue(issue)) return;
    if (getFinancialYearFromDate(issue?.date) !== fy) return;
    const issueMonth = issue?.date ? new Date(issue.date).getMonth() + 1 : 0;
    consumablesByMonth.set(issueMonth, (consumablesByMonth.get(issueMonth) || 0) + getLineAmount(line, materials, materialIn));
  });
  const paperByMonth = (lines: Array<MaterialIssueReelLine | MaterialReturnReelLine>) => {
    const totals = new Map<number, number>();
    lines.forEach((line) => {
      const production = productionMap.get(line.productionId);
      if (!production || production.status === "Cancelled" || production.cancelTimestamp) return;
      if (getFinancialYearFromDate(production.date) !== fy) return;
      const productionMonth = production.date ? new Date(production.date).getMonth() + 1 : 0;
      const slip = packingSlipMap.get(line.packingSlipId);
      const rate = getReelRateForSlip({ slip, materialInMap, materialMap });
      totals.set(productionMonth, (totals.get(productionMonth) || 0) + Number(line.weightKg || 0) * rate);
    });
    return totals;
  };
  const issuedPaperByMonth = paperByMonth(issueReelLines);
  const returnedPaperByMonth = paperByMonth(returnReelLines);

  const rows: ConversionCostMonthRow[] = FY_MONTHS.map((month) => {
    const consumables = consumablesByMonth.get(month.value) || 0;
    const fixed = normalizedFixedExpenses
      .filter((record) => record.fy === fy && Number(record.month) === month.value)
      .reduce((sum, record) => sum + Number(record.totalAmount || 0), 0);
    const actualPaperUsedCost = (issuedPaperByMonth.get(month.value) || 0) - (returnedPaperByMonth.get(month.value) || 0);
    return {
      month: month.label,
      monthValue: month.value,
      consumables: round2(consumables),
      fixed: round2(fixed),
      totalConsumption: round2(consumables),
      actualPaperUsedCost: round2(actualPaperUsedCost),
      ratio: actualPaperUsedCost > 0 ? round2(consumables / actualPaperUsedCost) : 0,
    };
  });
  return { rows, fyOptions };
}
