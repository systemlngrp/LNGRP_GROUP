import type { Company, Invoice, InvoiceLineItem, OrderItemSource, Production, ProductionProcessing } from "../types";
import { normalizeOrderItemSource, type OrderCatalogItem } from "./orderItems";

export type ProductionWastageRow = ProductionProcessing & { source: "Corrugation Liner" | "Printing"; itemName: string; erp: string; totalCorrugationKg: number; totalCorrugationBoxes: number; totalPrintingBoxes: number };
export type ProductionWastageFilters = { fromDate?: string; toDate?: string; machine?: string; searchTerm?: string };
const num = (v: unknown) => Number.isFinite(Number(v || 0)) ? Number(v || 0) : 0;
const machineName = (v: unknown) => String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
const dateTime = (v: unknown) => { const s = String(v || "").slice(0, 10); const t = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`).getTime() : new Date(String(v || "")).getTime(); return Number.isFinite(t) ? t : null; };

export function buildProductionWastageRows(processing: ProductionProcessing[], productions: Production[], filters: ProductionWastageFilters = {}): ProductionWastageRow[] {
  const productionMap = new Map(productions.map((p) => [String(p.id), p]));
  const from = filters.fromDate ? dateTime(filters.fromDate) : null; const to = filters.toDate ? dateTime(filters.toDate) : null;
  const sourceFilter = machineName(filters.machine); const needle = String(filters.searchTerm || "").trim().toLowerCase();
  return processing.map((entry) => {
    const normalized = machineName(entry.machineName); const production = productionMap.get(String(entry.productionId));
    if (entry.completionStatus !== "Full" || (normalized !== "corrugation liner" && normalized !== "printing")) return null;
    const source = normalized === "printing" ? "Printing" : "Corrugation Liner";
    const itemName = String(entry.itemName || production?.itemName || "-"); const erp = String(entry.erp ?? production?.erpCode ?? production?.masterErp ?? "");
    const paperKgPerBox = num(production?.totalPaperWeight) / (num(production?.qty) || num(production?.plannedQty) || 1);
    const corrugationKg = source === "Corrugation Liner" ? num(entry.warpageKg) + num(entry.delaminationKg) + num(entry.misalignmentKg) + num(entry.sheerCutterKg) + num(entry.twoPlyPaperKg) + num(entry.deckelWastageKg) + num(entry.noHisabBoxes) * paperKgPerBox : 0;
    const corrugationBoxes = source === "Corrugation Liner" ? num(entry.warpageBoxes) + num(entry.delaminationBoxes) + num(entry.misalignmentBoxes) + num(entry.sheerCutterBoxes) + num(entry.noHisabBoxes) : 0;
    const printingBoxes = source === "Printing" ? num(entry.slotting) + num(entry.delaminationPrinting) + num(entry.misalignmentPrinting) + num(entry.drySheets) + num(entry.warp) + num(entry.misprinting) + num(entry.jobSetting) : 0;
    const row = { ...entry, source, itemName, erp, totalCorrugationKg: corrugationKg, totalCorrugationBoxes: corrugationBoxes, totalPrintingBoxes: printingBoxes } as ProductionWastageRow;
    const time = dateTime(row.date); const haystack = `${row.jobNo} ${itemName} ${erp} ${row.operatorName} ${row.machineName}`.toLowerCase();
    if (from !== null && (time === null || time < from) || to !== null && (time === null || time > to) || sourceFilter && machineName(source) !== sourceFilter || needle && !haystack.includes(needle)) return null;
    return row;
  }).filter((row): row is ProductionWastageRow => Boolean(row)).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(a.jobNo).localeCompare(String(b.jobNo)));
}

export function summarizeProductionWastageRows(rows: ProductionWastageRow[]) { return { corrugationKg: rows.reduce((s, r) => s + r.totalCorrugationKg, 0), corrugationBoxes: rows.reduce((s, r) => s + r.totalCorrugationBoxes, 0), printingBoxes: rows.reduce((s, r) => s + r.totalPrintingBoxes, 0), productionQty: rows.reduce((s, r) => s + num(r.qty), 0), recordCount: rows.length }; }

export type ScrapInvoiceRow = { invoiceId: string; invoiceNo: string; invoiceDate: string; companyId: string; companyName: string; erp: string; itemName: string; qty: number; rate: number; taxableAmount: number; cgst: number; sgst: number; igst: number; totalAmount: number };
export type ScrapInvoiceFilters = { fromDate?: string; toDate?: string; companyId?: string; searchTerm?: string };
export type BuildScrapInvoiceRowsArgs = { invoices: Invoice[]; lineItems: InvoiceLineItem[]; companies: Company[]; filters?: ScrapInvoiceFilters; findItem: (source: OrderItemSource | undefined, itemId: string | undefined) => OrderCatalogItem | undefined; findItemAcrossSources: (itemId: string | undefined, preferredSource?: OrderItemSource, erpCode?: string | number) => OrderCatalogItem | undefined };
export type ScrapInvoiceSummary = { totalQty: number; taxableAmount: number; gstValue: number; totalAmount: number; invoiceCount: number };
export function buildScrapInvoiceRows({ invoices, lineItems, companies, filters, findItem, findItemAcrossSources }: BuildScrapInvoiceRowsArgs): ScrapInvoiceRow[] {
  const invoiceMap = new Map(invoices.map((i) => [i.id, i])); const companyMap = new Map(companies.map((c) => [c.id, c])); const from = filters?.fromDate ? dateTime(filters.fromDate) : null; const to = filters?.toDate ? dateTime(filters.toDate) : null; const companyId = String(filters?.companyId || ""); const needle = String(filters?.searchTerm || "").toLowerCase();
  return lineItems.map((line) => { const invoice = invoiceMap.get(line.invoiceId); if (!invoice) return null; const source = normalizeOrderItemSource(line.itemSource); const item = findItem(source, line.itemId) || (line.npdId ? findItem("FG", line.npdId) : undefined) || findItemAcrossSources(line.itemId, source); const itemName = String(item?.name || "Unknown"); if (!itemName.toLowerCase().includes("scrap")) return null; const row: ScrapInvoiceRow = { invoiceId: invoice.id, invoiceNo: invoice.invoiceNo || "-", invoiceDate: invoice.date, companyId: invoice.companyId, companyName: companyMap.get(invoice.companyId)?.name || "Unknown Company", erp: String(item?.erp || ""), itemName, qty: num(line.qty), rate: num(line.rate), taxableAmount: num(line.amount), cgst: num(line.cgst), sgst: num(line.sgst), igst: num(line.igst), totalAmount: num(line.amount) + num(line.cgst) + num(line.sgst) + num(line.igst) }; const t = dateTime(row.invoiceDate); const textValue = row.invoiceNo + " " + row.companyName + " " + row.erp + " " + row.itemName; if (from !== null && (t === null || t < from) || to !== null && (t === null || t > to) || companyId && row.companyId !== companyId || needle && !textValue.toLowerCase().includes(needle)) return null; return row; }).filter((r): r is ScrapInvoiceRow => Boolean(r));
}
export function summarizeScrapInvoiceRows(rows: ScrapInvoiceRow[]): ScrapInvoiceSummary { const ids = new Set(rows.map((r) => r.invoiceId)); return { totalQty: rows.reduce((s, r) => s + r.qty, 0), taxableAmount: rows.reduce((s, r) => s + r.taxableAmount, 0), gstValue: rows.reduce((s, r) => s + r.cgst + r.sgst + r.igst, 0), totalAmount: rows.reduce((s, r) => s + r.totalAmount, 0), invoiceCount: ids.size }; }
