import type { BoardLineQcCheck, Company, CoaCellValue, CoaTemplate, CoaTemplateLayout, CoaTemplateRow, Firm, Invoice, InvoiceLineItem, Order, OrderSchedule, PreDispatchInspection, PrintingQcCheck, Production } from "../types";

type AnyRecord = Record<string, any>;

const text = (value: unknown) => String(value ?? "").trim();
const id = (value: unknown) => text(value);

export function sourceValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function cell(idValue: string, label: string, kind: "static" | "binding" | "input", binding = "", inputType: "text" | "number" | "date" | "textarea" | "select" = "text", extra: Partial<CoaTemplateRow["cells"][number]> = {}) {
  return { id: idValue, label, kind, binding: binding || undefined, inputType, ...extra };
}

function row(idValue: string, cells: CoaTemplateRow["cells"]) {
  return { id: idValue, cells };
}

export function defaultCoaLayout(): CoaTemplateLayout {
  return {
    title: "CERTIFICATE OF ANALYSIS (COA)",
    subtitle: "",
    logoEnabled: true,
    columns: 6,
    metadataRows: [
      row("meta-item", [cell("meta-item-label", "ITEM NAME:", "static", "", "text", { colSpan: 2, background: "#d9d9d9", bold: true, align: "center" }), cell("meta-item-value", "", "binding", "itemName", "text", { colSpan: 4, background: "#f4d7e5", bold: true, align: "center" })]),
      row("meta-date", [cell("meta-date-label", "DATE", "static", "", "text", { colSpan: 2, background: "#d9d9d9", bold: true, align: "center" }), cell("meta-date-value", "", "binding", "coaDate", "date", { colSpan: 4, bold: true, align: "center" })]),
      row("meta-invoice", [cell("meta-invoice-label", "INVOICE NO.", "static", "", "text", { colSpan: 2, background: "#d9d9d9", bold: true, align: "center" }), cell("meta-invoice-value", "", "binding", "invoiceNo", "text", { colSpan: 4, bold: true, align: "center" })]),
      row("meta-qty", [cell("meta-qty-label", "INVOICE QTY.", "static", "", "text", { colSpan: 2, background: "#d9d9d9", bold: true, align: "center" }), cell("meta-qty-value", "", "binding", "invoiceQty", "number", { colSpan: 4, bold: true, align: "center" })]),
    ],
    parameterRows: [
      row("header", [cell("h-sl", "SL. NO.", "static", "", "text", { background: "#b7b7b7", bold: true, align: "center" }), cell("h-param", "PARAMETERS", "static", "", "text", { colSpan: 2, background: "#b7b7b7", bold: true, align: "center" }), cell("h-standard", "STANDARD", "static", "", "text", { colSpan: 2, background: "#b7b7b7", bold: true, align: "center" }), cell("h-observation", "OBSERVATION", "static", "", "text", { colSpan: 1, background: "#b7b7b7", bold: true, align: "center" })]),
      row("colour", [cell("p1", "1", "static", "", "text", { bold: true, align: "center" }), cell("p1-label", "COLOUR OF THE CBB", "static", "", "text", { colSpan: 2, bold: true, italic: true, align: "center" }), cell("p1-standard", "AS PER STANDARD", "input", "", "text", { colSpan: 2, background: "#f4d7e5", align: "center" }), cell("p1-observation", "AS PER STANDARD", "input", "", "text", { background: "#f4d7e5", align: "center" })]),
      row("printing", [cell("p2", "2", "static", "", "text", { bold: true, align: "center" }), cell("p2-label", "QUALITY OF PRINTING", "static", "", "text", { colSpan: 2, bold: true, italic: true, align: "center" }), cell("p2-standard", "AS PER STANDARD", "input", "", "text", { colSpan: 2, background: "#f4d7e5", align: "center" }), cell("p2-observation", "AS PER STANDARD", "input", "", "text", { background: "#f4d7e5", align: "center" })]),
      row("dimensions", [cell("p3", "3", "static", "", "text", { bold: true, align: "center" }), cell("p3-label", "INTERNAL BOX DIMENSION (LXB XH) (MM) (+3 MM)", "static", "", "text", { colSpan: 2, bold: true, italic: true, align: "center" }), cell("p3-standard-1", "", "input", "production.length", "number", { background: "#f4d7e5", align: "center" }), cell("p3-standard-2", "", "input", "production.breadth", "number", { background: "#f4d7e5", align: "center" }), cell("p3-observation-1", "", "input", "pdi.lengthId", "number", { background: "#f4d7e5", align: "center" }), cell("p3-observation-2", "", "input", "pdi.widthId", "number", { background: "#f4d7e5", align: "center" })]),
      row("ply", [cell("p4", "4", "static", "", "text", { bold: true, align: "center" }), cell("p4-label", "PLY OF CFB", "static", "", "text", { colSpan: 2, bold: true, italic: true, align: "center" }), cell("p4-standard", "", "input", "", "text", { colSpan: 2, background: "#f4d7e5", align: "center" }), cell("p4-observation", "", "input", "", "text", { background: "#f4d7e5", align: "center" })]),
      row("joint", [cell("p5", "5", "static", "", "text", { bold: true, align: "center" }), cell("p5-label", "Manufacturing Joint Width", "static", "", "text", { colSpan: 2, bold: true, italic: true, align: "center" }), cell("p5-standard", "28 - 32 mm", "input", "", "text", { colSpan: 2, background: "#f4d7e5", align: "center" }), cell("p5-observation", "", "input", "", "number", { background: "#f4d7e5", align: "center" })]),
      row("flap-gap", [cell("p6", "6", "static", "", "text", { bold: true, align: "center" }), cell("p6-label", "Gap between closing Flap", "static", "", "text", { colSpan: 2, bold: true, italic: true, align: "center" }), cell("p6-standard", "Maximum 3 mm", "input", "", "text", { colSpan: 2, background: "#f4d7e5", align: "center" }), cell("p6-observation", "", "input", "", "number", { background: "#f4d7e5", align: "center" })]),
      row("flute", [cell("p7", "7", "static", "", "text", { bold: true, align: "center" }), cell("p7-label", "TYPE OF FLUTE", "static", "", "text", { colSpan: 2, bold: true, italic: true, align: "center" }), cell("p7-standard", "", "input", "", "text", { colSpan: 2, background: "#f4d7e5", align: "center" }), cell("p7-observation", "", "input", "boardline.typeOfFlute", "text", { background: "#f4d7e5", align: "center" })]),
      row("thickness", [cell("p8", "8", "static", "", "text", { bold: true, align: "center" }), cell("p8-label", "BOARD THICKNESS", "static", "", "text", { colSpan: 2, bold: true, italic: true, align: "center" }), cell("p8-standard", "", "input", "", "number", { colSpan: 2, background: "#f4d7e5", align: "center" }), cell("p8-observation", "", "input", "boardline.boardThickness", "number", { background: "#f4d7e5", align: "center" })]),
      row("moisture", [cell("p9", "9", "static", "", "text", { bold: true, align: "center" }), cell("p9-label", "MOISTURE OF COMPOSITE BOARD (%)", "static", "", "text", { colSpan: 2, bold: true, italic: true, align: "center" }), cell("p9-standard", "7-10%", "input", "", "text", { colSpan: 2, background: "#f4d7e5", align: "center" }), cell("p9-observation", "", "input", "boardline.moisture", "number", { background: "#f4d7e5", align: "center" })]),
    ],
    footerRows: [
      row("remarks", [cell("remarks-label", "REMARKS:", "static", "", "text", { colSpan: 2, bold: true, align: "center" }), cell("remarks-value", "", "input", "pdi.remarks", "textarea", { colSpan: 2, background: "#f4d7e5" }), cell("acceptance", "ACCEPTED", "input", "", "text", { colSpan: 1, bold: true, align: "center" }), cell("checked-by", "CHECKED BY:", "input", "pdi.qcPerson", "text", { colSpan: 1, bold: true, align: "center" })]),
    ],
  };
}

function latestValue(rows: AnyRecord[], field: string) {
  return rows
    .slice()
    .sort((a, b) => new Date(text(b.updateTimestamp || b.timestamp)).getTime() - new Date(text(a.updateTimestamp || a.timestamp)).getTime())
    .map((record) => sourceValue(record[field]))
    .find((value) => value.trim() !== "") || "";
}

export type CoaSourceContext = {
  production: Production;
  company?: Company;
  firm?: Firm;
  order?: Order;
  invoice?: Invoice;
  invoiceLine?: InvoiceLineItem;
  pdi?: PreDispatchInspection;
  boardline?: BoardLineQcCheck;
  printing?: PrintingQcCheck;
  item?: AnyRecord;
};

// Template used for any customer without its own active template.
export const COMMON_COA_KEY = "COMMON";
export const COMMON_COA_NAME = "COMMON (all other customers)";

function boardThicknessStandard(flute: string) {
  const value = flute.toUpperCase().replace(/\s+/g, "");
  if (value === "A") return "Min 4.8 mm (A-Flute)";
  if (value === "B+C") return "Min 7 mm (B+C-Flute)";
  if (value === "B") return "Min 2.8 mm";
  if (value === "C") return "Min 4.8 mm";
  return "";
}

export function resolveCoaSourceContext(production: Production, companies: Company[], firms: Firm[], orders: Order[], schedules: OrderSchedule[], invoices: Invoice[], invoiceLines: InvoiceLineItem[], pdis: PreDispatchInspection[], boardlineRows: BoardLineQcCheck[], printingRows: PrintingQcCheck[], items: AnyRecord[] = []): CoaSourceContext {
  const schedule = schedules.find((value) => id(value.id) === id(production.scheduleId));
  const order = orders.find((value) => id(value.id) === id(schedule?.orderId) || (id(value.companyId) === id((production as AnyRecord).companyId) && id(value.itemId) === id(production.itemId)));
  const companyId = id((production as AnyRecord).companyId || order?.companyId);
  const company = companies.find((value) => id(value.id) === companyId) || companies.find((value) => text(value.name).toLowerCase() === text((production as AnyRecord).companyName).toLowerCase());
  const firm = firms.find((value) => id(value.id) === id(production.firmId));
  const invoiceLine = invoiceLines
    .filter((value) => id(value.itemId) === id(production.itemId) || id(value.npdId) === id(production.npdId))
    .sort((a, b) => id(b.updateTimestamp).localeCompare(id(a.updateTimestamp)))[0];
  const invoice = invoices
    .filter((value) => id(value.id) === id(production.linkedInvoiceId) || id(value.companyId) === companyId)
    .sort((a, b) => id(b.date || b.updateTimestamp).localeCompare(id(a.date || a.updateTimestamp)))[0];
  const pdi = pdis.filter((value) => id(value.productionId) === id(production.id) || text(value.jobNo) === text(production.transactionNo)).sort((a, b) => id(b.updateTimestamp || b.inspectionDate).localeCompare(id(a.updateTimestamp || a.inspectionDate)))[0];
  const boardline = boardlineRows.filter((value) => text(value.jobNo) === text(production.transactionNo)).sort((a, b) => id(b.updateTimestamp || b.timestamp).localeCompare(id(a.updateTimestamp || a.timestamp)))[0];
  const printing = printingRows.filter((value) => text(value.jobNo) === text(production.transactionNo)).sort((a, b) => id(b.updateTimestamp || b.timestamp).localeCompare(id(a.updateTimestamp || a.timestamp)))[0];
  const itemKeys = [production.itemId, production.npdId].map(id).filter(Boolean);
  const erp = text(production.erpCode || production.masterErp || order?.erpCode);
  const item = items.find((value) => itemKeys.includes(id(value.id)) || itemKeys.includes(id(value.npdId)))
    || (erp ? items.find((value) => text(value.erp) === erp) : undefined);
  return { production, company, firm, order, invoice, invoiceLine, pdi, boardline, printing, item };
}

export function buildCoaSourceMap(context: CoaSourceContext, coaDate = new Date().toISOString().slice(0, 10)): Record<string, string> {
  const { production, company, firm, order, invoice, invoiceLine, pdi, boardline, printing, item } = context;
  const job = production as AnyRecord;
  const flute = text(job.flute || item?.flute);
  const layerGsm = ["l1", "f1", "l2", "f2", "l3"].map((key) => text(job[key] ?? item?.[key])).filter((value) => value && Number(value) !== 0).join(" / ");
  const colours = [text(item?.printingColour1 || job.color1), text(item?.printingColour2 || job.color2)].filter(Boolean).join(" & ");
  return {
    coaDate,
    companyName: text(company?.name || (production as AnyRecord).companyName),
    firmName: text(firm?.firmName || production.firmName),
    firmAddress: text(firm?.address),
    firmLogo: "",
    jobNo: text(production.transactionNo || production.jobCardNo),
    erpCode: text(production.erpCode || production.masterErp || order?.erpCode),
    itemName: text((production as AnyRecord).itemName || order?.itemId),
    "production.length": sourceValue((production as AnyRecord).length),
    "production.breadth": sourceValue((production as AnyRecord).breadth),
    "production.height": sourceValue(job.height),
    "production.boxSize": [job.length, job.breadth, job.height].map(text).filter(Boolean).join(" x "),
    "pdi.boxSize": [pdi?.lengthId, pdi?.widthId, pdi?.heightId].map(text).filter(Boolean).join(" x "),
    "production.ply": sourceValue(job.ply || item?.ply),
    "production.flute": flute,
    "production.gsm": sourceValue(job.gsm),
    "production.layerGsm": layerGsm,
    "production.date": text(job.date).slice(0, 10),
    "item.colours": colours,
    "item.csStandard": sourceValue(item?.csKgStd),
    "item.bsStandard": sourceValue(item?.bsKgCm2Std),
    "item.stackNorms": sourceValue(item?.stackHeight),
    "item.weightPack": text(item?.weightPackDetails || item?.weightAndPackDetails || item?.materialWeightInsideInOneBox),
    "item.compositeGsm": sourceValue(item?.gsmLeastCost || job.gsm),
    "standard.boardThickness": boardThicknessStandard(flute),
    "pdi.flapGapCheck": sourceValue((pdi as AnyRecord)?.flapGapCheck),
    "pdi.jointCheck": sourceValue((pdi as AnyRecord)?.jointPastingDelaminationCheck),
    "pdi.printingColorCheck": sourceValue((pdi as AnyRecord)?.printingColorCheck),
    invoiceNo: text(invoice?.invoiceNo),
    invoiceQty: sourceValue(invoiceLine?.qty || production.plannedQty || production.qty),
    batchNo: text((production as AnyRecord).batchNo || (production as AnyRecord).lotNo),
    "pdi.lengthId": sourceValue(pdi?.lengthId),
    "pdi.widthId": sourceValue(pdi?.widthId),
    "pdi.heightId": sourceValue(pdi?.heightId),
    "pdi.csAchieved": sourceValue(pdi?.csAchieved),
    "pdi.gsmAchieved": sourceValue(pdi?.gsmAchieved),
    "pdi.boxWeightGrams": sourceValue(pdi?.boxWeightGrams),
    "pdi.remarks": sourceValue(pdi?.remarks),
    "pdi.qcPerson": sourceValue((pdi as AnyRecord)?.qcPerson || (pdi as AnyRecord)?.inspectedBy),
    "boardline.boardThickness": sourceValue(boardline?.boardThickness),
    "boardline.moisture": sourceValue(boardline?.moisture),
    "boardline.sheetWeightGrams": sourceValue(boardline?.sheetWeightGrams),
    "boardline.typeOfFlute": sourceValue(boardline?.typeOfFlute),
    "printing.lengthId": sourceValue(printing?.lengthId),
    "printing.widthId": sourceValue(printing?.widthId),
    "printing.heightId": sourceValue(printing?.heightId),
    "printing.csAchieved": sourceValue(printing?.csAchieved),
    "printing.bsAchieved": sourceValue(printing?.bsAchieved),
    "printing.boxWeightGrams": sourceValue(printing?.boxWeightGrams),
    "printing.colour1Actual": sourceValue(printing?.colour1Actual),
    "printing.colour2Actual": sourceValue(printing?.colour2Actual),
  };
}

export function buildInitialCellValues(layout: CoaTemplateLayout, sourceMap: Record<string, string>): Record<string, CoaCellValue> {
  const values: Record<string, CoaCellValue> = {};
  for (const item of [...layout.metadataRows, ...layout.parameterRows, ...layout.footerRows]) {
    for (const cellValue of item.cells) {
      const source = cellValue.binding ? sourceMap[cellValue.binding] || "" : "";
      const value = cellValue.kind === "binding" ? source : cellValue.defaultValue || source;
      if (cellValue.kind !== "static" || value) values[cellValue.id] = { value, sourceValue: source, source: source ? "auto" : "default" };
    }
  }
  return values;
}

export function getCoaCellValue(templateCell: CoaTemplateLayout["parameterRows"][number]["cells"][number], values: Record<string, CoaCellValue>, sourceMap: Record<string, string>, headerData: Record<string, string>) {
  const value = values[templateCell.id]?.value;
  if (value !== undefined) return value;
  if (templateCell.binding && headerData[templateCell.binding] !== undefined) return headerData[templateCell.binding];
  if (templateCell.binding && sourceMap[templateCell.binding] !== undefined) return sourceMap[templateCell.binding];
  return templateCell.defaultValue || "";
}

// A template covers its own company plus any listed in layout.applyToCompanyIds.
// Customers without one fall back to the active COMMON template.
export function templateCoversCompany(template: CoaTemplate, companyId: string) {
  const target = id(companyId);
  if (!target) return false;
  return id(template.companyId) === target || (template.layout?.applyToCompanyIds || []).some((value) => id(value) === target);
}

export function activeTemplateForCompany(templates: CoaTemplate[], companyId: string) {
  const active = templates.filter((template) => template.status === "Active").sort((a, b) => b.version - a.version);
  return active.find((template) => id(template.companyId) === id(companyId))
    || active.find((template) => templateCoversCompany(template, companyId))
    || active.find((template) => id(template.companyId) === COMMON_COA_KEY);
}
