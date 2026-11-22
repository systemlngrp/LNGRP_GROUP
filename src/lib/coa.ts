import type { BoardLineQcCheck, Company, CoaAutoRule, CoaCellValue, CoaTemplate, CoaTemplateLayout, CoaTemplateRow, Firm, Invoice, InvoiceLineItem, Order, OrderSchedule, PreDispatchInspection, PrintingQcCheck, Production } from "../types";
import { checkCoaDimensions, checkCoaObservation, coaParameterForLabel } from "./coaParameters";
import type { JobLoadingRecord } from "./jobLoadingRecords";

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
      row("dimensions", [cell("p3", "3", "static", "", "text", { bold: true, align: "center" }), cell("p3-label", "INTERNAL BOX DIMENSION (LXB XH) (MM) (+3 MM)", "static", "", "text", { colSpan: 2, bold: true, italic: true, align: "center" }), cell("p3-standard-1", "", "input", "production.length", "number", { background: "#f4d7e5", align: "center" }), cell("p3-standard-2", "", "input", "production.breadth", "number", { background: "#f4d7e5", align: "center" }), cell("p3-observation-1", "", "input", "obs.length", "number", { background: "#f4d7e5", align: "center" }), cell("p3-observation-2", "", "input", "obs.breadth", "number", { background: "#f4d7e5", align: "center" })]),
      row("ply", [cell("p4", "4", "static", "", "text", { bold: true, align: "center" }), cell("p4-label", "PLY OF CFB", "static", "", "text", { colSpan: 2, bold: true, italic: true, align: "center" }), cell("p4-standard", "", "input", "", "text", { colSpan: 2, background: "#f4d7e5", align: "center" }), cell("p4-observation", "", "input", "obs.ply", "text", { background: "#f4d7e5", align: "center" })]),
      row("joint", [cell("p5", "5", "static", "", "text", { bold: true, align: "center" }), cell("p5-label", "Manufacturing Joint Width", "static", "", "text", { colSpan: 2, bold: true, italic: true, align: "center" }), cell("p5-standard", "28 - 32 mm", "input", "", "text", { colSpan: 2, background: "#f4d7e5", align: "center" }), cell("p5-observation", "", "input", "obs.jointWidth", "number", { background: "#f4d7e5", align: "center" })]),
      row("flap-gap", [cell("p6", "6", "static", "", "text", { bold: true, align: "center" }), cell("p6-label", "Gap between closing Flap", "static", "", "text", { colSpan: 2, bold: true, italic: true, align: "center" }), cell("p6-standard", "Maximum 3 mm", "input", "", "text", { colSpan: 2, background: "#f4d7e5", align: "center" }), cell("p6-observation", "", "input", "obs.flapGap", "number", { background: "#f4d7e5", align: "center" })]),
      row("flute", [cell("p7", "7", "static", "", "text", { bold: true, align: "center" }), cell("p7-label", "TYPE OF FLUTE", "static", "", "text", { colSpan: 2, bold: true, italic: true, align: "center" }), cell("p7-standard", "", "input", "", "text", { colSpan: 2, background: "#f4d7e5", align: "center" }), cell("p7-observation", "", "input", "obs.flute", "text", { background: "#f4d7e5", align: "center" })]),
      row("thickness", [cell("p8", "8", "static", "", "text", { bold: true, align: "center" }), cell("p8-label", "BOARD THICKNESS", "static", "", "text", { colSpan: 2, bold: true, italic: true, align: "center" }), cell("p8-standard", "", "input", "", "number", { colSpan: 2, background: "#f4d7e5", align: "center" }), cell("p8-observation", "", "input", "obs.boardThickness", "number", { background: "#f4d7e5", align: "center" })]),
      row("moisture", [cell("p9", "9", "static", "", "text", { bold: true, align: "center" }), cell("p9-label", "MOISTURE OF COMPOSITE BOARD (%)", "static", "", "text", { colSpan: 2, bold: true, italic: true, align: "center" }), cell("p9-standard", "7-10%", "input", "", "text", { colSpan: 2, background: "#f4d7e5", align: "center" }), cell("p9-observation", "", "input", "obs.moisture", "number", { background: "#f4d7e5", align: "center" })]),
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
  /** All invoices raised against this job's loading slips, oldest first, and their total qty for the job. */
  jobInvoices?: Invoice[];
  jobInvoiceQty?: number;
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

/** Text for a PDI visual check: OK -> the standard wording, NOT OK -> "NOT OK", not checked -> "". */
function checkText(value: unknown, okText: string) {
  const v = text(value).toUpperCase();
  return v === "OK" ? okText : v === "NOT OK" ? "NOT OK" : "";
}

/**
 * Observation values from real readings only (never generated):
 * colour / printing from the PDI checks; L, B, H from the PDI; ply = job ply;
 * flute, board thickness and moisture from Boardline QC; joint width and flap gap
 * are typed by QC (the PDI records them only as OK / NOT OK).
 */
export function buildCoaObservations(readings: {
  ply?: unknown; printingColorCheck?: unknown; printingArtworkCheck?: unknown;
  lengthId?: unknown; widthId?: unknown; heightId?: unknown;
  boardFlute?: unknown; boardThickness?: unknown; moisture?: unknown;
}) {
  return {
    "obs.colour": checkText(readings.printingColorCheck, "AS PER STANDARD"),
    "obs.printing": checkText(readings.printingArtworkCheck, "AS PER STANDARD"),
    "obs.length": sourceValue(readings.lengthId),
    "obs.breadth": sourceValue(readings.widthId),
    "obs.height": sourceValue(readings.heightId),
    "obs.ply": sourceValue(readings.ply),
    "obs.jointWidth": "",
    "obs.flapGap": "",
    "obs.flute": text(readings.boardFlute),
    "obs.boardThickness": sourceValue(readings.boardThickness),
    "obs.moisture": sourceValue(readings.moisture),
  };
}

export function resolveCoaSourceContext(production: Production, companies: Company[], firms: Firm[], orders: Order[], schedules: OrderSchedule[], invoices: Invoice[], invoiceLines: InvoiceLineItem[], pdis: PreDispatchInspection[], boardlineRows: BoardLineQcCheck[], printingRows: PrintingQcCheck[], items: AnyRecord[] = [], loadingRecords?: JobLoadingRecord[], latestPdi?: PreDispatchInspection | null): CoaSourceContext {
  const schedule = schedules.find((value) => id(value.id) === id(production.scheduleId));
  const order = orders.find((value) => id(value.id) === id(schedule?.orderId) || (id(value.companyId) === id((production as AnyRecord).companyId) && id(value.itemId) === id(production.itemId)));
  const companyId = id((production as AnyRecord).companyId || order?.companyId);
  const company = companies.find((value) => id(value.id) === companyId) || companies.find((value) => text(value.name).toLowerCase() === text((production as AnyRecord).companyName).toLowerCase());
  const firm = firms.find((value) => id(value.id) === id(production.firmId));
  // Invoices of this job only: the invoice lines raised against this job's loading slips
  // (same rule as the Summary Sheet). No invoice yet -> Invoice No. / Qty stay blank.
  const slipItems = new Map((loadingRecords || []).map((record) => [id(record.slip.id), record.itemIds.map((value) => id(value).toLowerCase())]));
  const jobLines = invoiceLines.filter((line) => {
    const itemIds = slipItems.get(id(line.loadingSlipId));
    if (!itemIds || !line.invoiceId) return false;
    return !itemIds.length || !id(line.itemId) || itemIds.includes(id(line.itemId).toLowerCase());
  });
  const invoiceById = new Map(invoices.map((value) => [id(value.id), value]));
  const jobInvoices = [...new Set(jobLines.map((line) => id(line.invoiceId)))]
    .map((invoiceId) => invoiceById.get(invoiceId))
    .filter((value): value is Invoice => Boolean(value) && text((value as AnyRecord).status).toLowerCase() !== "cancelled")
    .sort((a, b) => id(a.date || a.updateTimestamp).localeCompare(id(b.date || b.updateTimestamp)));
  const liveInvoiceIds = new Set(jobInvoices.map((value) => id(value.id)));
  const liveLines = jobLines.filter((line) => liveInvoiceIds.has(id(line.invoiceId)));
  const jobInvoiceQty = liveLines.reduce((sum, line) => sum + (Number(line.qty) || 0), 0);
  const invoice = jobInvoices[jobInvoices.length - 1];
  const invoiceLine = liveLines.filter((line) => id(line.invoiceId) === id(invoice?.id))[0];
  // The PDI that decided PASS (passed in by the form); else the job's latest PDI.
  const pdi = latestPdi !== undefined ? latestPdi || undefined : pdis.filter((value) => id(value.productionId) === id(production.id) || text(value.jobNo) === text(production.transactionNo)).sort((a, b) => id(b.updateTimestamp || b.inspectionDate).localeCompare(id(a.updateTimestamp || a.inspectionDate)))[0];
  // QC checks by Transaction No. or Job Card No., ignoring spaces and capitals.
  const jobKey = (value: unknown) => text(value).toUpperCase().replace(/\s+/g, "");
  const jobKeys = new Set([production.transactionNo, production.jobCardNo].map(jobKey).filter(Boolean));
  const latestQc = <T extends AnyRecord>(rows: T[]) => rows.filter((value) => jobKeys.has(jobKey(value.jobNo))).sort((a, b) => id(b.updateTimestamp || b.timestamp).localeCompare(id(a.updateTimestamp || a.timestamp)))[0];
  const boardline = latestQc(boardlineRows as unknown as AnyRecord[]) as unknown as BoardLineQcCheck | undefined;
  const printing = latestQc(printingRows as unknown as AnyRecord[]) as unknown as PrintingQcCheck | undefined;
  const itemKeys = [production.itemId, production.npdId].map(id).filter(Boolean);
  const erp = text(production.erpCode || production.masterErp || order?.erpCode);
  const item = items.find((value) => itemKeys.includes(id(value.id)) || itemKeys.includes(id(value.npdId)))
    || (erp ? items.find((value) => text(value.erp) === erp) : undefined);
  return { production, company, firm, order, invoice, invoiceLine, jobInvoices, jobInvoiceQty, pdi, boardline, printing, item };
}

export function buildCoaSourceMap(context: CoaSourceContext, coaDate = new Date().toISOString().slice(0, 10)): Record<string, string> {
  const { production, company, firm, order, invoice, jobInvoices, jobInvoiceQty, pdi, boardline, printing, item } = context;
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
    itemName: text(job.itemName || item?.itemName || item?.name || (order as AnyRecord)?.itemName),
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
    "item.boxWeight": (() => {
      const standard = Number(item?.standardWeightGms);
      if (Number.isFinite(standard) && standard > 0) return String(standard);
      const calculated = Number(item?.calculatedWeightPerBox);
      return Number.isFinite(calculated) && calculated > 0 ? String(Math.round(calculated)) : "";
    })(),
    "item.bf": (() => {
      const values = [...new Set(Object.entries(item || {})
        .filter(([key, value]) => /Bf$/.test(key) && Number(value) > 0)
        .map(([, value]) => String(Number(value))))];
      return values.length === 1 ? `ALL ${values[0]} BF` : values.join(" / ");
    })(),
    "item.boxSizeOd": [item?.lengthOd || item?.lOd, item?.breadthOd || item?.wOd, item?.heightOd || item?.hOd].map(text).filter(Boolean).join(" X "),
    "production.boxSizeX": [job.length, job.breadth, job.height].map((value) => text(value).replace(/\.0+$/, "")).filter(Boolean).join(" X "),
    "pdi.flapGapCheck": sourceValue((pdi as AnyRecord)?.flapGapCheck),
    "pdi.jointCheck": sourceValue((pdi as AnyRecord)?.jointPastingDelaminationCheck),
    "pdi.printingColorCheck": sourceValue((pdi as AnyRecord)?.printingColorCheck),
    // All invoices of this job; qty = total invoiced for this job. Blank when not invoiced yet.
    invoiceNo: (jobInvoices?.length ? jobInvoices : invoice ? [invoice] : []).map((value) => text(value.invoiceNo || (value as AnyRecord).tallyInvNo)).filter(Boolean).join(", "),
    invoiceQty: jobInvoiceQty ? String(Number(jobInvoiceQty.toFixed(2))) : "",
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
    "pdi.printingArtworkCheck": sourceValue((pdi as AnyRecord)?.printingArtworkCheck),
    ...buildCoaObservations({
      ply: job.ply || item?.ply,
      printingColorCheck: (pdi as AnyRecord)?.printingColorCheck,
      printingArtworkCheck: (pdi as AnyRecord)?.printingArtworkCheck,
      lengthId: pdi?.lengthId, widthId: pdi?.widthId, heightId: pdi?.heightId,
      boardFlute: boardline?.typeOfFlute, boardThickness: boardline?.boardThickness, moisture: boardline?.moisture,
    }),
  };
}

/**
 * Value of one auto rule. Only `copy` fills a value; rules that would make up a number
 * (min / max / ranges, from the old sheet's RAND formulas) give "" so the observation
 * comes from a real reading or is typed by QC.
 */
export function evaluateCoaAutoRule(rule: CoaAutoRule, valueOf: (cellId: string) => string, _seed?: string): string {
  if (rule.copy) return valueOf(rule.copy);
  return "";
}

export function buildInitialCellValues(layout: CoaTemplateLayout, sourceMap: Record<string, string>): Record<string, CoaCellValue> {
  const values: Record<string, CoaCellValue> = {};
  const cells = [...layout.metadataRows, ...layout.parameterRows, ...layout.footerRows].flatMap((row) => row.cells);
  for (const cellValue of cells) {
    if (cellValue.auto) continue;
    const source = cellValue.binding ? sourceMap[cellValue.binding] || "" : "";
    const value = cellValue.kind === "binding" ? source : cellValue.defaultValue || source;
    if (cellValue.kind !== "static" || value) values[cellValue.id] = { value, sourceValue: source, source: source ? "auto" : "default" };
  }
  // Auto cells may depend on each other (e.g. a copy of a random value): fill in order, twice.
  const seedBase = text(sourceMap.jobNo) || "coa";
  for (let pass = 0; pass < 2; pass++) {
    for (const cellValue of cells) {
      if (!cellValue.auto || (pass === 1 && values[cellValue.id]?.value)) continue;
      const value = evaluateCoaAutoRule(cellValue.auto, (cellId) => values[cellId]?.value || "", `${seedBase}|${cellValue.id}`);
      values[cellValue.id] = { value, sourceValue: value, source: value ? "auto" : "default" };
    }
  }
  fillObservationsFromMaster(layout, values, sourceMap);
  return values;
}

/** Row label of a parameter row (the static label cell, not the Sl. No.). */
export function coaRowLabel(row: CoaTemplateLayout["parameterRows"][number]) {
  const labelled = row.cells.find((cell) => cell.kind === "static" && /-label$/.test(cell.id));
  if (labelled) return text(labelled.label);
  return text(row.cells.find((cell) => cell.kind === "static" && text(cell.label) && !/^\d+$/.test(text(cell.label)))?.label);
}
const isObsCell = (cellId: string) => /-o\d?$/.test(cellId);
const isStdCell = (cellId: string) => /-s\d?$/.test(cellId);

/**
 * Observation cells of rows that match the COA Parameter Master are filled from the
 * parameter's real reading (or left blank for QC to type); a Remark cell gets OK / NOT OK
 * from the PASS / FAIL check. Rows the master does not know keep their template values.
 */
function fillObservationsFromMaster(layout: CoaTemplateLayout, values: Record<string, CoaCellValue>, sourceMap: Record<string, string>) {
  for (const row of layout.parameterRows) {
    const parameter = coaParameterForLabel(coaRowLabel(row));
    if (!parameter) continue;
    const obsCells = row.cells.filter((cell) => isObsCell(cell.id));
    const stdCells = row.cells.filter((cell) => isStdCell(cell.id));
    const stdValues = stdCells.map((cell) => values[cell.id]?.value ?? (cell.binding ? sourceMap[cell.binding] || "" : cell.defaultValue || ""));
    const stdText = stdValues.filter(Boolean).join(" X ");
    const spec = parameter.observation;
    const next: string[] = obsCells.map((_, index) => {
      if ("readings" in spec) {
        if (obsCells.length === 1) return spec.readings.map((key) => sourceMap[key] || "").find(Boolean) || "";
        return sourceMap[spec.readings[index] || ""] || "";
      }
      if ("standard" in spec) return index === 0 ? stdText : "";
      if ("check" in spec) return index === 0 ? checkText(sourceMap[spec.check], spec.okText || stdText || "OK") : "";
      return "";
    });
    obsCells.forEach((cell, index) => {
      values[cell.id] = { value: next[index], sourceValue: next[index], source: next[index] ? "auto" : "default" };
    });
    const remark = row.cells.find((cell) => /-r$/.test(cell.id));
    if (remark) {
      const result = parameter.code === "DIM_ID" || parameter.code === "DIM_OD"
        ? checkCoaDimensions(stdText.split(/\s*[xX×]\s*/), next.join(" X ").split(/\s*[xX×]\s*/), parameter.code === "DIM_OD" ? 2 : 3)
        : checkCoaObservation(parameter, stdText, next.filter(Boolean).join(" "));
      const value = result === "PASS" ? "OK" : result === "FAIL" ? "NOT OK" : "";
      values[remark.id] = { value, sourceValue: value, source: value ? "auto" : "default" };
    }
  }
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
