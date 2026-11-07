// Conversion Cost Details: totals for a date range, shared by the page
// (browser fallback) and the server report engine. The manual MIS inputs are
// applied on top in the page (applyConversionCostInputs). Same calculation the
// page used before.
import type {
  FixedDailyExpense,
  FixedMonthlyExpense,
  Invoice,
  InvoiceLineItem,
  Material,
  MaterialIn,
  MaterialInPackingSlip,
  MaterialIssue,
  MaterialIssueLine,
  MaterialIssueReelLine,
  MaterialReturnReelLine,
  Production,
  ProductionProcessing,
} from "../../types";
import { getCurrentFinancialYear } from "../financialYear";
import { resolveMaterialIssueRate } from "../materialMovement";
import { getProductionWastageTotals, getWastagePercent } from "../wastageCalculations";

export type FactoryBucket = {
  key: string;
  label: string;
  keywords: string[];
  source: "material" | "fixed" | "both";
};

export type MisInputs = {
  paperRate: number;
  salesReturnBasic: number;
  fgWipOpening: number;
  fgWipClosing: number;
  lngrpOpening: number;
  lngrpClosing: number;
  hoSalary: number;
  managementSalary: number;
  allEmi: number;
  miscExpense: number;
};

export const factoryBuckets: FactoryBucket[] = [
  { key: "starch", label: "Starch", keywords: ["starch", "corrugation gum", "pasting gum"], source: "material" },
  { key: "borex", label: "Borex", keywords: ["borex", "borax"], source: "material" },
  { key: "caustic", label: "Caustic", keywords: ["caustic"], source: "material" },
  { key: "ink", label: "INK", keywords: ["ink"], source: "material" },
  { key: "strapping", label: "Strapping Roll", keywords: ["strapping", "sutli", "plastic sutli"], source: "material" },
  { key: "fevicol", label: "Fevicol", keywords: ["fevicol"], source: "material" },
  { key: "stitchingWire", label: "Stitching Wire", keywords: ["stitching wire"], source: "material" },
  { key: "diesel", label: "Diesel", keywords: ["diesel"], source: "both" },
  { key: "firewood", label: "Firewood", keywords: ["firewood", "fire wood"], source: "both" },
  { key: "briquettes", label: "Briquettes", keywords: ["briquette"], source: "both" },
  { key: "woodChips", label: "Wood Chips", keywords: ["wood chip"], source: "both" },
  { key: "salary", label: "Total Salary", keywords: ["salary", "wages", "contractual work"], source: "fixed" },
  { key: "dailyCash", label: "Daily Cash Expenses", keywords: ["daily cash", "cash expense", "petty cash"], source: "fixed" },
];

export const defaultInputs: MisInputs = {
  paperRate: 31,
  salesReturnBasic: 0,
  fgWipOpening: 0,
  fgWipClosing: 0,
  lngrpOpening: 0,
  lngrpClosing: 0,
  hoSalary: 0,
  managementSalary: 0,
  allEmi: 0,
  miscExpense: 0,
};

function normalizeExpenseLines(value: FixedMonthlyExpense["lines"] | FixedDailyExpense["lines"] | string | undefined) {
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

export function toDateOnly(value?: string | Date | null) {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const isoDatePrefix = /^(\d{4}-\d{2}-\d{2})[T\s]/.exec(trimmed);
  if (isoDatePrefix) return isoDatePrefix[1];
  const ddmmyyyy = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(trimmed);
  if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(value?: string | null) {
  const dateValue = toDateOnly(value);
  if (!dateValue) return null;
  const [year, month, day] = dateValue.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeDateTime(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function isWithinRange(value: string | undefined, fromDate: string, toDate: string) {
  const parsed = parseDate(value);
  if (!parsed) return false;
  const time = normalizeDateTime(parsed);
  const from = parseDate(fromDate);
  const to = parseDate(toDate);
  if (from && time < normalizeDateTime(from)) return false;
  if (to && time > normalizeDateTime(to)) return false;
  return true;
}

export function getCurrentMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: toDateOnly(from), to: toDateOnly(to) };
}

export function round2(value: number) {
  return Number(Number(value || 0).toFixed(2));
}

export function formatMoney(value: number) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function formatDecimal(value: number) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normalizeText(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function normalizeLoose(value?: string | null) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "");
}

function getBucketForText(text: string, source: "material" | "fixed") {
  const normalized = normalizeText(text);
  return factoryBuckets.find((bucket) => {
    if (bucket.source !== "both" && bucket.source !== source) return false;
    return bucket.keywords.some((keyword) => normalized.includes(keyword));
  });
}

function getLineAmount(line: MaterialIssueLine, materials: Material[], materialIn: MaterialIn[]) {
  const savedAmount = Number(line.amount || 0);
  if (savedAmount > 0) return savedAmount;
  const qty = Number(line.qty || 0);
  const savedRate = Number(line.rate || 0);
  if (savedRate > 0) return qty * savedRate;
  return resolveMaterialIssueRate(line.materialId, materials, materialIn, qty, { useLatestRateAsOpeningRate: true }).amount;
}

function getReelRateForSlip({
  slip,
  materialInMap,
  materialMap,
}: {
  slip?: MaterialInPackingSlip;
  materialInMap: Map<string, MaterialIn>;
  materialMap: Map<string, Material>;
}) {
  if (!slip) return 0;
  const receipt = materialInMap.get(slip.materialInId);
  const line = receipt?.lines.find((entry) => entry.id === slip.materialLineId);
  const material = materialMap.get(slip.materialId);
  return Number(line?.invoiceRate ?? line?.poRate ?? line?.rate ?? material?.openingRate ?? 0);
}

function getProductionFfg(production: Production) {
  return Number(production.prodFromFFG || 0);
}

function getProductionFfgDate(production: Production) {
  return production.ffgTimestamp || production.date;
}

function getProductionUsefulWeight(production: Production) {
  return getProductionFfg(production) * Number(production.sheetWeight || 0);
}

function getExpenseMonthDate(record: FixedMonthlyExpense) {
  const [startYearText] = String(record.fy || getCurrentFinancialYear()).split("-");
  const startYear = 2000 + Number(startYearText || 0);
  const month = Number(record.month || 0);
  const year = month >= 4 ? startYear : startYear + 1;
  return new Date(year, month - 1, 1);
}

function isExpenseInRange(record: FixedMonthlyExpense, fromDate: string, toDate: string) {
  const monthStart = getExpenseMonthDate(record);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const from = parseDate(fromDate);
  const to = parseDate(toDate);
  if (from && normalizeDateTime(monthEnd) < normalizeDateTime(from)) return false;
  if (to && normalizeDateTime(monthStart) > normalizeDateTime(to)) return false;
  return true;
}


export type ConversionCostDetailsLists = {
  materialIssues: MaterialIssue[];
  issueLines: MaterialIssueLine[];
  materials: Material[];
  materialIn: MaterialIn[];
  packingSlips: MaterialInPackingSlip[];
  issueReelLines: MaterialIssueReelLine[];
  returnReelLines: MaterialReturnReelLine[];
  fixedExpenses: FixedMonthlyExpense[];
  fixedDailyExpenses: FixedDailyExpense[];
  productions: Production[];
  processing: ProductionProcessing[];
  invoices: Invoice[];
  invoiceLines: InvoiceLineItem[];
};

export type ConversionCostBase = {
  factoryRows: Array<{ slNo: number; label: string; amount: number }>;
  matchingConsumableIssueLines: number;
  totalPayable: number;
  totalProduction: number;
  totalActualPaperUsed: number;
  totalSold: number;
  totalWastageKg: number;
  totalSaleBasic: number;
  actualPaperUsedCost: number;
};

/** Totals that depend only on the data and the date range. */
export function computeConversionCostBase(lists: ConversionCostDetailsLists, fromDate: string, toDate: string): ConversionCostBase {
  const { materialIssues, issueLines, materials, materialIn, packingSlips, issueReelLines, returnReelLines, fixedExpenses, fixedDailyExpenses, productions, processing, invoices, invoiceLines } = lists;
  const processingByProduction = new Map<string, ProductionProcessing[]>();
  processing.forEach((row) => {
    const list = processingByProduction.get(row.productionId);
    if (list) list.push(row);
    else processingByProduction.set(row.productionId, [row]);
  });
    const issueMap = new Map(materialIssues.map((issue) => [issue.id, issue]));
    const materialMap = new Map(materials.map((material) => [material.id, material]));
    const materialInMap = new Map(materialIn.map((entry) => [entry.id, entry]));
    const packingSlipMap = new Map(packingSlips.map((slip) => [slip.id, slip]));
    const bucketTotals = new Map(factoryBuckets.map((bucket) => [bucket.key, 0]));
    let matchingConsumableIssueLines = 0;

    issueLines.forEach((line) => {
      const issue = issueMap.get(line.materialIssueId);
      const issueType = normalizeLoose(issue?.issueType);
      if (issueType !== "withoutjob" && issueType !== "general") return;
      if (!isWithinRange(issue?.date, fromDate, toDate)) return;
      const material = materialMap.get(line.materialId);
      if (normalizeText(material?.type) !== "other") return;
      matchingConsumableIssueLines += 1;
      const amount = getLineAmount(line, materials, materialIn);
      const bucket = getBucketForText(material?.name, "material");
      if (bucket) bucketTotals.set(bucket.key, (bucketTotals.get(bucket.key) || 0) + amount);
    });

    fixedExpenses.forEach((record) => {
      if (!isExpenseInRange(record, fromDate, toDate)) return;
      normalizeExpenseLines(record.lines).forEach((line) => {
        const amount = Number(line.amount || 0);
        const bucket = getBucketForText(line.expenseName, "fixed");
        if (bucket && bucket.key !== "dailyCash") bucketTotals.set(bucket.key, (bucketTotals.get(bucket.key) || 0) + amount);
      });
    });


    fixedDailyExpenses.forEach((record) => {
      if (!isWithinRange(record.date, fromDate, toDate)) return;
      normalizeExpenseLines(record.lines).forEach((line) => {
        bucketTotals.set("dailyCash", (bucketTotals.get("dailyCash") || 0) + Number(line.amount || 0));
      });
    });
    const factoryRows = factoryBuckets.map((bucket, index) => {
      const amount = round2(bucketTotals.get(bucket.key) || 0);
      return {
        slNo: index + 1,
        label: bucket.label,
        amount,
      };
    });

    const productionRows = productions.filter(
      (production) => production.status !== "Cancelled" && !production.cancelTimestamp && isWithinRange(getProductionFfgDate(production), fromDate, toDate)
    );
    const productionIds = new Set(productionRows.map((production) => production.id));
    const totalProduction = round2(
      productionRows.reduce((sum, production) => sum + getProductionFfg(production), 0)
    );
    const totalActualPaperUsed = round2(productionRows.reduce((sum, production) => sum + Number(production.actualPaperUsed || 0), 0));
    const totalWastageKg = round2(
      productionRows.reduce((sum, production) => sum + getProductionWastageTotals(production, processingByProduction.get(production.id) || []).totalWastageKg, 0)
    );
    const issuedPaperCost = issueReelLines.reduce((sum, line) => {
      if (!productionIds.has(line.productionId)) return sum;
      const slip = packingSlipMap.get(line.packingSlipId);
      const rate = getReelRateForSlip({ slip, materialInMap, materialMap });
      return sum + Number(line.weightKg || 0) * rate;
    }, 0);
    const returnedPaperCost = returnReelLines.reduce((sum, line) => {
      if (!productionIds.has(line.productionId)) return sum;
      const slip = packingSlipMap.get(line.packingSlipId);
      const rate = getReelRateForSlip({ slip, materialInMap, materialMap });
      return sum + Number(line.weightKg || 0) * rate;
    }, 0);
    const actualPaperUsedCost = round2(issuedPaperCost - returnedPaperCost);
    const totalPayable = round2(factoryRows.reduce((sum, row) => sum + row.amount, 0));
    const invoiceMap = new Map(invoices.map((invoice) => [invoice.id, invoice]));
    const totalSold = round2(
      invoiceLines.reduce((sum, line) => {
        const invoice = invoiceMap.get(line.invoiceId);
        if (!isWithinRange(invoice?.date, fromDate, toDate)) return sum;
        return sum + Number(line.qty || 0);
      }, 0)
    );
    const totalSaleBasic = round2(
      invoices.filter((invoice) => isWithinRange(invoice.date, fromDate, toDate)).reduce((sum, invoice) => sum + Number(invoice.totalBeforeGst || 0), 0)
    );
    return { factoryRows, matchingConsumableIssueLines, totalPayable, totalProduction, totalActualPaperUsed, totalSold, totalWastageKg, totalSaleBasic, actualPaperUsedCost };
}

/** Applies the manual MIS inputs (same formulas as before). */
export function applyConversionCostInputs(base: ConversionCostBase, inputs: MisInputs) {
  const { factoryRows, matchingConsumableIssueLines, totalPayable, totalProduction, totalActualPaperUsed, totalSold, totalWastageKg, totalSaleBasic, actualPaperUsedCost } = base;
    const adjustedSales = round2(
      totalSaleBasic -
        inputs.salesReturnBasic -
        inputs.fgWipOpening +
        inputs.fgWipClosing -
        inputs.lngrpOpening +
        inputs.lngrpClosing
    );
    const paperCost = actualPaperUsedCost;
    const paperCostPerKg = totalActualPaperUsed > 0 ? round2(paperCost / totalActualPaperUsed) : 0;
    const expensePerKg = (payableAmount: number) => (totalActualPaperUsed > 0 ? round2(payableAmount / totalActualPaperUsed) : 0);
    const spPerKg = totalProduction > 0 ? round2(adjustedSales / totalProduction) : 0;
    const factoryConversionPerKg = expensePerKg(totalPayable);
    const result = round2(
      spPerKg -
        paperCostPerKg -
        factoryConversionPerKg -
        expensePerKg(inputs.hoSalary) -
        expensePerKg(inputs.managementSalary) -
        expensePerKg(inputs.allEmi) -
        expensePerKg(inputs.miscExpense)
    );

    return {
      factoryRows,
      matchingConsumableIssueLines,
      totalPayable,
      totalProduction,
      totalActualPaperUsed,
      totalSold,
      wastagePercent: round2(getWastagePercent(totalWastageKg, totalActualPaperUsed)),
      totalSaleBasic,
      adjustedSales,
      actualPaperUsedCost,
      paperCost,
      paperCostPerKg,
      paperPercent: adjustedSales > 0 ? round2((paperCost / adjustedSales) * 100) : 0,
      spPerKg,
      factoryConversionPerKg,
      result,
      lossAmount: round2(result * totalProduction),
      expensePerKg,
    };
}
