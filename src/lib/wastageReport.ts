import type { Company, Invoice, InvoiceLineItem, OrderItemSource, Production, ProductionProcessing } from "../types";
import { normalizeOrderItemSource, type OrderCatalogItem } from "./orderItems";
import { getAutomaticNoHisabKg } from "./corrugationWastage";

export type ProductionWastageRow = ProductionProcessing & { source: "Corrugation Liner" | "Printing" | "Combined"; itemName: string; erp: string; actualPaperUsedKg: number; fullCorrugationQty: number; corrugationQty: number; printingQty: number; requiredReelKg: number; planQuantity: number; paperKgPerBox: number; noHisabKg: number; sheetPlantWastageKg: number; cWastageKg: number; pWastageBoxes: number; pWastageKg: number; totalCWastageKg: number; totalWastagePercent: number; printingWastagePercent: number; combinedTotalWastagePercent: number; totalCorrugationKg: number; totalCorrugationBoxes: number; totalPrintingBoxes: number };
export type ProductionWastageFilters = { fromDate?: string; toDate?: string; machine?: string; searchTerm?: string };
const num = (v: unknown) => Number.isFinite(Number(v || 0)) ? Number(v || 0) : 0;
const machineName = (v: unknown) => String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
const dateTime = (v: unknown) => { const s = String(v || "").slice(0, 10); const t = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`).getTime() : new Date(String(v || "")).getTime(); return Number.isFinite(t) ? t : null; };

export function buildProductionWastageRows(processing: ProductionProcessing[], productions: Production[], filters: ProductionWastageFilters = {}): ProductionWastageRow[] {
  const productionMap = new Map(productions.map((p) => [String(p.id), p]));
  const from = filters.fromDate ? dateTime(filters.fromDate) : null; const to = filters.toDate ? dateTime(filters.toDate) : null;
  const sourceFilter = machineName(filters.machine); const needle = String(filters.searchTerm || "").trim().toLowerCase();
  const fullRows = processing.filter((entry) => entry.completionStatus === "Full" && ["corrugation liner", "printing"].includes(machineName(entry.machineName)));
  const grouped = new Map<string, ProductionProcessing[]>();
  fullRows.forEach((entry) => grouped.set(String(entry.productionId), [...(grouped.get(String(entry.productionId)) || []), entry]));
  return processing.map((entry) => {
    const normalized = machineName(entry.machineName); const production = productionMap.get(String(entry.productionId));
    if (entry.completionStatus !== "Full" || (normalized !== "corrugation liner" && normalized !== "printing")) return null;
    const source = normalized === "printing" ? "Printing" : "Corrugation Liner";
    const group = grouped.get(String(entry.productionId)) || [];
    const corrRows = group.filter((row) => machineName(row.machineName) === "corrugation liner");
    const printRows = group.filter((row) => machineName(row.machineName) === "printing");
    const fullCorrugationQty = corrRows.reduce((sum, row) => sum + num(row.qty), 0);
    const actualPaperUsedKg = num(production?.actualPaperUsed);
    const paperKgPerBox = num(production?.totalPaperWeight) / (num(production?.qty) || num(production?.plannedQty) || 1);
    const sheetPlantWastageKg = corrRows.reduce((sum, row) => sum + num(row.warpageKg) + num(row.delaminationKg) + num(row.misalignmentKg) + num(row.twoPlyPaperKg) + num(row.sheerCutterKg), 0);
    const pWastageBoxes = printRows.reduce((sum, row) => sum + num(row.slotting) + num(row.misprinting) + num(row.jobSetting), 0);
    const pWastageKg = pWastageBoxes * paperKgPerBox;
    const noHisabKg = getAutomaticNoHisabKg({ actualPaperUsedKg, requiredReelKg: production?.totalPaperWeight, planQuantity: production?.qty || production?.plannedQty, fullCorrugationQty, warpageKg: sheetPlantWastageKg, twoPlyPaperKg: 0, sheerCutterKg: 0 }).noHisabKg;
    const totalCWastageKg = sheetPlantWastageKg + noHisabKg + pWastageKg;
    const itemName = String(entry.itemName || production?.itemName || "-"); const erp = String(entry.erp ?? production?.erpCode ?? production?.masterErp ?? "");
    const corrugationKg = source === "Corrugation Liner" ? num(entry.warpageKg) + num(entry.delaminationKg) + num(entry.misalignmentKg) + num(entry.sheerCutterKg) + num(entry.twoPlyPaperKg) + num(entry.deckelWastageKg) + num(entry.noHisabBoxes) * paperKgPerBox : 0;
    const corrugationBoxes = source === "Corrugation Liner" ? num(entry.warpageBoxes) + num(entry.delaminationBoxes) + num(entry.misalignmentBoxes) + num(entry.sheerCutterBoxes) + num(entry.noHisabBoxes) : 0;
    const printingBoxes = source === "Printing" ? num(entry.slotting) + num(entry.delaminationPrinting) + num(entry.misalignmentPrinting) + num(entry.drySheets) + num(entry.warp) + num(entry.misprinting) + num(entry.jobSetting) : 0;
    const cWastageKg = sheetPlantWastageKg + noHisabKg;
    const printingWastagePercent = fullCorrugationQty > 0 ? pWastageBoxes / fullCorrugationQty * 100 : 0;
    const row = { ...entry, source, itemName, erp, actualPaperUsedKg, fullCorrugationQty, corrugationQty: source === "Corrugation Liner" ? num(entry.qty) : 0, printingQty: source === "Printing" ? num(entry.qty) : 0, requiredReelKg: num(production?.totalPaperWeight), planQuantity: num(production?.qty || production?.plannedQty), paperKgPerBox, noHisabKg, sheetPlantWastageKg, cWastageKg, pWastageBoxes, pWastageKg, totalCWastageKg, totalWastagePercent: actualPaperUsedKg > 0 ? totalCWastageKg / actualPaperUsedKg * 100 : 0, printingWastagePercent, combinedTotalWastagePercent: (actualPaperUsedKg > 0 ? totalCWastageKg / actualPaperUsedKg * 100 : 0) + printingWastagePercent, totalCorrugationKg: corrugationKg, totalCorrugationBoxes: corrugationBoxes, totalPrintingBoxes: printingBoxes } as ProductionWastageRow;
    const time = dateTime(row.date); const haystack = `${row.jobNo} ${itemName} ${erp} ${row.operatorName} ${row.machineName}`.toLowerCase();
    if (from !== null && (time === null || time < from) || to !== null && (time === null || time > to) || sourceFilter && machineName(source) !== sourceFilter || needle && !haystack.includes(needle)) return null;
    return row;
  }).filter((row): row is ProductionWastageRow => Boolean(row)).reduce((map, row) => {
    const existing = map.get(String(row.productionId));
    if (!existing) { map.set(String(row.productionId), { ...row }); return map; }
    const sumKeys: Array<keyof ProductionWastageRow> = ["qty", "corrugationQty", "printingQty", "warpageBoxes", "warpageKg", "delaminationBoxes", "delaminationKg", "misalignmentBoxes", "misalignmentKg", "sheerCutterBoxes", "sheerCutterKg", "twoPlyPaperKg", "deckelWastageKg", "noHisabBoxes", "slotting", "delaminationPrinting", "misalignmentPrinting", "drySheets", "warp", "misprinting", "jobSetting"];
    sumKeys.forEach((key) => { (existing as any)[key] = num((existing as any)[key]) + num((row as any)[key]); });
    existing.source = "Combined"; existing.date = String(row.date || existing.date) > String(existing.date || "") ? row.date : existing.date;
    existing.noHisabKg = row.noHisabKg; existing.sheetPlantWastageKg = row.sheetPlantWastageKg; existing.cWastageKg = row.cWastageKg; existing.pWastageBoxes = row.pWastageBoxes; existing.pWastageKg = row.pWastageKg; existing.totalCWastageKg = row.totalCWastageKg; existing.totalWastagePercent = row.totalWastagePercent; existing.printingWastagePercent = row.printingWastagePercent; existing.combinedTotalWastagePercent = row.combinedTotalWastagePercent;
    return map;
  }, new Map<string, ProductionWastageRow>()).values().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(a.jobNo).localeCompare(String(b.jobNo)));
}

export function summarizeProductionWastageRows(rows: ProductionWastageRow[]) { const actual = rows.reduce((s, r) => s + r.actualPaperUsedKg, 0); const total = rows.reduce((s, r) => s + r.totalCWastageKg, 0); return { corrugationKg: rows.reduce((s, r) => s + r.totalCorrugationKg, 0), corrugationBoxes: rows.reduce((s, r) => s + r.totalCorrugationBoxes, 0), printingBoxes: rows.reduce((s, r) => s + r.totalPrintingBoxes, 0), productionQty: rows.reduce((s, r) => s + num(r.qty), 0), recordCount: rows.length, actualPaperUsedKg: actual, sheetPlantWastageKg: rows.reduce((s, r) => s + r.sheetPlantWastageKg, 0), totalCWastageKg: total, pWastageBoxes: rows.reduce((s, r) => s + r.pWastageBoxes, 0), pWastageKg: rows.reduce((s, r) => s + r.pWastageKg, 0), totalWastagePercent: actual > 0 ? total / actual * 100 : 0 }; }

export type ScrapInvoiceRow = { invoiceId: string; invoiceNo: string; invoiceDate: string; companyId: string; companyName: string; erp: string; itemName: string; qty: number; rate: number; taxableAmount: number; cgst: number; sgst: number; igst: number; totalAmount: number };
export type ScrapInvoiceFilters = { fromDate?: string; toDate?: string; companyId?: string; searchTerm?: string };
export type BuildScrapInvoiceRowsArgs = { invoices: Invoice[]; lineItems: InvoiceLineItem[]; companies: Company[]; filters?: ScrapInvoiceFilters; findItem: (source: OrderItemSource | undefined, itemId: string | undefined) => OrderCatalogItem | undefined; findItemAcrossSources: (itemId: string | undefined, preferredSource?: OrderItemSource, erpCode?: string | number) => OrderCatalogItem | undefined };
export type ScrapInvoiceSummary = { totalQty: number; taxableAmount: number; gstValue: number; totalAmount: number; invoiceCount: number };
export function buildScrapInvoiceRows({ invoices, lineItems, companies, filters, findItem, findItemAcrossSources }: BuildScrapInvoiceRowsArgs): ScrapInvoiceRow[] {
  const invoiceMap = new Map(invoices.map((i) => [i.id, i])); const companyMap = new Map(companies.map((c) => [c.id, c])); const from = filters?.fromDate ? dateTime(filters.fromDate) : null; const to = filters?.toDate ? dateTime(filters.toDate) : null; const companyId = String(filters?.companyId || ""); const needle = String(filters?.searchTerm || "").toLowerCase();
  return lineItems.map((line) => { const invoice = invoiceMap.get(line.invoiceId); if (!invoice) return null; const source = normalizeOrderItemSource(line.itemSource); const item = findItem(source, line.itemId) || (line.npdId ? findItem("FG", line.npdId) : undefined) || findItemAcrossSources(line.itemId, source); const itemName = String(item?.name || "Unknown"); if (!itemName.toLowerCase().includes("scrap")) return null; const row: ScrapInvoiceRow = { invoiceId: invoice.id, invoiceNo: invoice.invoiceNo || "-", invoiceDate: invoice.date, companyId: invoice.companyId, companyName: companyMap.get(invoice.companyId)?.name || "Unknown Company", erp: String(item?.erp || ""), itemName, qty: num(line.qty), rate: num(line.rate), taxableAmount: num(line.amount), cgst: num(line.cgst), sgst: num(line.sgst), igst: num(line.igst), totalAmount: num(line.amount) + num(line.cgst) + num(line.sgst) + num(line.igst) }; const t = dateTime(row.invoiceDate); const textValue = row.invoiceNo + " " + row.companyName + " " + row.erp + " " + row.itemName; if (from !== null && (t === null || t < from) || to !== null && (t === null || t > to) || companyId && row.companyId !== companyId || needle && !textValue.toLowerCase().includes(needle)) return null; return row; }).filter((r): r is ScrapInvoiceRow => Boolean(r));
}
export function summarizeScrapInvoiceRows(rows: ScrapInvoiceRow[]): ScrapInvoiceSummary { const ids = new Set(rows.map((r) => r.invoiceId)); return { totalQty: rows.reduce((s, r) => s + r.qty, 0), taxableAmount: rows.reduce((s, r) => s + r.taxableAmount, 0), gstValue: rows.reduce((s, r) => s + r.cgst + r.sgst + r.igst, 0), totalAmount: rows.reduce((s, r) => s + r.totalAmount, 0), invoiceCount: ids.size }; }
