// Audit Dashboard app-side figures: shared by the page (browser fallback) and
// the server report engine. Same calculation the page used before.
import type {
  Invoice,
  Item,
  Material,
  MaterialIn,
  MaterialInPackingSlip,
  MaterialIssue,
  MaterialIssueLine,
  MaterialIssueReelLine,
  MaterialReturn,
  MaterialReturnLine,
  MaterialReturnReelLine,
  Production,
  Supplier,
} from "../../types";
import { getInvoiceGrandTotal } from "../gatePasses";

export function roundMoney(value: number) {
  return Number(Number(value || 0).toFixed(2));
}

export function getMaterialInPurchaseAuditValue(entry: MaterialIn) {
  const lineGst = roundMoney(
    (entry.lines || []).reduce(
      (sum, line) => sum + Number(line.cgst || 0) + Number(line.sgst || 0) + Number(line.igst || 0),
      0
    )
  );
  const expenseGst = roundMoney(Number(entry.expenseCGST || 0) + Number(entry.expenseSGST || 0) + Number(entry.expenseIGST || 0));
  const totalGst = roundMoney(Number(entry.totalCgst || 0) + Number(entry.totalSgst || 0) + Number(entry.totalIgst || 0));
  const hasExpenseOnlyGst = expenseGst !== 0 && lineGst === 0 && expenseGst === totalGst;

  if (hasExpenseOnlyGst) {
    return roundMoney(
      Number(entry.totalInvoiceValueAfterGst || 0) +
        Number(entry.insurance || 0) +
        Number(entry.otherCharges || 0) -
        Number(entry.roundOff || 0)
    );
  }

  return roundMoney(Number(entry.totalAmount || 0));
}

export function hasJobNo(issue: MaterialIssue) {
  return String(issue.jobNo || "").trim() !== "";
}

export function isCancelledIssue(issue: MaterialIssue) {
  return String(issue.tallyPostingStatus || "").trim().toLowerCase() === "cancelled";
}

export function isNotApplicableIssue(issue: MaterialIssue) {
  const normalized = String(issue.notApplicable || "").trim().toLowerCase();
  return normalized === "yes" || normalized === "true" || normalized === "1";
}

export function isDebitNotePostedToTally(entry: MaterialIn) {
  return String(entry.debitTallySync || "").trim() !== "";
}

export function isMaterialInPostedToTally(entry: MaterialIn) {
  return String(entry.tallyTimestamp || "").trim() !== "" || String(entry.status || "").trim().toLowerCase() === "completed";
}

export function isInvoicePostedToTally(invoice: Invoice) {
  return String(invoice.tallyTimestamp || "").trim() !== "";
}

export function isProductionPostedToTally(production: Production) {
  return String(production.tallyTimestamp || "").trim() !== "";
}


export type AuditDashboardLists = {
  materialIn: MaterialIn[];
  materialIssues: MaterialIssue[];
  materialIssueLines: MaterialIssueLine[];
  materialReturns: MaterialReturn[];
  materialReturnLines: MaterialReturnLine[];
  invoices: Invoice[];
  productions: Production[];
};

export function computeAuditAppValues(lists: AuditDashboardLists, npdItems: Item[]) {
  const { materialIn, materialIssues, materialIssueLines, materialReturns, materialReturnLines, invoices, productions } = lists;
    const consumptionIssueIdSet = new Set(
      materialIssues
        .filter((entry) => !hasJobNo(entry) && !isCancelledIssue(entry) && !isNotApplicableIssue(entry))
        .map((entry) => entry.id)
    );
    const manufacturingProductions = productions.filter(
      (production) =>
        !production.cancelTimestamp &&
        production.status !== "Cancelled" &&
        isProductionPostedToTally(production) &&
        Number(production.prodFromFFG || 0) > 0
    );
    const manufacturingProductionIdSet = new Set(manufacturingProductions.map((production) => production.id));
    const manufacturingProductionJobNoSet = new Set(
      manufacturingProductions
        .map((production) => String(production.transactionNo || "").trim())
        .filter(Boolean)
    );
    const isManufacturingProductionEntry = (entry: { productionId?: string; jobNo?: string }) => {
      const productionId = String(entry.productionId || "").trim();
      if (productionId) return manufacturingProductionIdSet.has(productionId);
      const jobNo = String(entry.jobNo || "").trim();
      return jobNo ? manufacturingProductionJobNoSet.has(jobNo) : false;
    };
    const manufacturingIssueIdSet = new Set(materialIssues.filter(isManufacturingProductionEntry).map((entry) => entry.id));
    const manufacturingReturnIdSet = new Set(materialReturns.filter(isManufacturingProductionEntry).map((entry) => entry.id));
    const tallyPostedMaterialIn = materialIn.filter(
      (entry) => isMaterialInPostedToTally(entry) && String(entry.transactionNo || "").trim() !== "1"
    );
    const tallyPostedDebitNotes = materialIn.filter(isDebitNotePostedToTally);
    const tallyPostedInvoices = invoices.filter(isInvoicePostedToTally);

    const getIssueLineValue = (issueIds: Set<string>) => materialIssueLines
      .filter((line) => issueIds.has(line.materialIssueId))
      .reduce((sum, line) => {
        const savedAmount = Number(line.amount || 0);
        if (savedAmount > 0) return sum + savedAmount;
        const savedRate = Number(line.rate || 0);
        return sum + Number(line.qty || 0) * savedRate;
      }, 0);

    const getReturnLineValue = (returnIds: Set<string>) => materialReturnLines
      .filter((line) => returnIds.has(line.materialReturnId))
      .reduce((sum, line) => {
        const savedAmount = Number(line.amount || 0);
        if (savedAmount > 0) return sum + savedAmount;
        const savedRate = Number(line.rate || 0);
        return sum + Number(line.qty || 0) * savedRate;
      }, 0);

    const consumptionValue = getIssueLineValue(consumptionIssueIdSet);
    const manufacturingIssueValue = getIssueLineValue(manufacturingIssueIdSet);
    const manufacturingReturnValue = getReturnLineValue(manufacturingReturnIdSet);
    const manufacturingValue = manufacturingIssueValue - manufacturingReturnValue;

    const activeNpdItems = npdItems.filter((item) => Number(item.balance || 0) > 0);
    const npdStockValue = roundMoney(
      activeNpdItems.reduce((sum, item) => sum + Number(item.balance || 0) * Number(item.rate || 0), 0)
    );
    const npdStockCount = activeNpdItems.length;

    // NPD Stock Qty: compare Tally stock qty vs App balance qty per item
    const npdItemsWithTallyStock = npdItems.filter((item) => item.tallyStock != null);
    const npdStockQtyTally = roundMoney(
      npdItemsWithTallyStock.reduce((sum, item) => sum + Number(item.tallyStock || 0), 0)
    );
    const npdStockQtyCountTally = npdItemsWithTallyStock.length;
    const npdStockQtyApp = roundMoney(
      npdItems.reduce((sum, item) => sum + Number(item.balance || 0), 0)
    );
    const npdStockQtyCountApp = npdItems.filter((item) => Number(item.balance || 0) > 0).length;

    return {
      invoiceValue: roundMoney(
        tallyPostedMaterialIn.reduce((sum, entry) => {
          return sum + getMaterialInPurchaseAuditValue(entry);
        }, 0)
      ),
      invoiceCount: tallyPostedMaterialIn.length,
      consumptionValue: roundMoney(consumptionValue),
      consumptionCount: consumptionIssueIdSet.size,
      manufacturingValue: roundMoney(manufacturingValue),
      manufacturingCount: manufacturingProductionIdSet.size,
      saleValue: roundMoney(
        tallyPostedInvoices.reduce((sum, invoice) => sum + getInvoiceGrandTotal(invoice), 0)
      ),
      saleCount: tallyPostedInvoices.length,
      debitNote: roundMoney(tallyPostedDebitNotes.reduce((sum, entry) => sum + Number(entry.debitNoteAmount || 0), 0)),
      debitNoteCount: tallyPostedDebitNotes.filter((entry) => roundMoney(Number(entry.debitNoteAmount || 0)) !== 0).length,
      npdStockValue,
      npdStockCount,
      npdStockQtyTally,
      npdStockQtyCountTally,
      npdStockQtyApp,
      npdStockQtyCountApp,
    };
}

export function computeNegativeOpeningNpdRows(npdItems: Item[]) {
    return npdItems
      .filter((item) => roundMoney(Number(item.opening || 0)) < 0)
      .map((item) => ({
        id: String(item.id || item.erp || item.name || ""),
        itemName: String(item.name || ""),
        erp: String(item.erp || ""),
        opening: roundMoney(Number(item.opening || 0)),
        balance: roundMoney(Number(item.balance || 0)),
        tallyStock: item.tallyStock == null ? null : roundMoney(Number(item.tallyStock || 0)),
      }))
      .sort((a, b) => a.itemName.localeCompare(b.itemName) || a.erp.localeCompare(b.erp));
}

export function computeAuditDashboard(lists: AuditDashboardLists, npdItems: Item[]) {
  return { appValues: computeAuditAppValues(lists, npdItems), negativeOpeningNpdRows: computeNegativeOpeningNpdRows(npdItems) };
}

export type AuditDashboardResult = ReturnType<typeof computeAuditDashboard>;
