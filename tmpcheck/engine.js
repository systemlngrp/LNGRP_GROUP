window.__eng=(function(){// COA Parameter Master: every parameter used on the company COA templates, with
const COA_PARAMETERS = [
{ code: "COL_CBB", name: "Colour of the CBB", standard: "AS PER STANDARD", observation: { check: "pdi.printingColorCheck" }, observationLabel: "PDI: Printing Colour check", plain: "none", passRule: "PDI check OK", labels: ["COLOUR OF THE CBB"] },
{ code: "COL_PRINT", name: "Colour of Printing", standard: "Item Printing Colour 1 (& 2)", observation: { check: "pdi.printingColorCheck" }, observationLabel: "PDI: Printing Colour check", plain: "none", passRule: "PDI check OK", labels: ["COLOUR OF PRINTING"] },
{ code: "QUAL_PRINT", name: "Quality of Printing", standard: "AS PER STANDARD", observation: { check: "pdi.printingArtworkCheck" }, observationLabel: "PDI: Printing Artwork check", plain: "none", passRule: "PDI check OK", labels: ["QUALITY OF PRINTING"] },
{ code: "APPEARANCE", name: "Appearance", standard: "AS PER SAMPLE", observation: { check: "pdi.printingArtworkCheck" }, observationLabel: "PDI: Printing Artwork check", plain: "none", passRule: "PDI check OK", labels: ["APPEARANCE"] },
{ code: "STACK", name: "Stack Norms", standard: "Item Stack Norms", observation: { standard: true }, observationLabel: "Same as standard", plain: "none", passRule: "—", labels: ["STACK NORMS"] },
{ code: "WT_PACK", name: "Weight & Pack Details", standard: "Item Weight & Pack Details", observation: { standard: true }, observationLabel: "Same as standard", plain: "none", passRule: "—", labels: ["WEIGHT & PACK DETAILS"] },
{ code: "ADDRESS", name: "Address of Regd Office & Mfg Location", standard: "AS PER ARTWORK", observation: { check: "pdi.printingArtworkCheck" }, observationLabel: "PDI: Printing Artwork check", plain: "none", passRule: "PDI check OK", labels: ["ADDRESS OF REGD OFFICE & MFG LOCATION"] },
{ code: "TAPPING", name: "Marked Tapping Area", standard: "AS PER STANDARD", observation: { manual: true }, observationLabel: "Typed by QC", plain: "none", passRule: "—", labels: ["MARKED TAPPING AREA"] },
{ code: "DIM_ID", name: "Internal Box Dimension L×B×H (mm)", standard: "Job / Item Length × Breadth × Height", observation: { readings: ["pdi.lengthId", "pdi.widthId", "pdi.heightId"] }, observationLabel: "PDI: Achieved Length / Width / Height", plain: { tolerance: 3 }, passRule: "Each within standard ± 3 mm", labels: ["INTERNAL BOX DIMENSION (LXBXH) (MM) (+-3 MM)", "INTERNAL DIMENSION (L*W*H)"] },
{ code: "DIM_OD", name: "External Dimension L×W×H (mm)", standard: "Item Length × Breadth × Height (OD)", observation: { manual: true }, observationLabel: "Typed by QC (PDI records internal size)", plain: { tolerance: 2 }, passRule: "Each within standard ± 2 mm", labels: ["EXTERNAL DIMENSION (L*W*H)"] },
{ code: "PLY", name: "Ply of CFB", standard: "Job / Item Ply", observation: { standard: true }, observationLabel: "Same as standard (job ply)", plain: "equal", passRule: "Equal to standard", labels: ["PLY OF CFB"] },
{ code: "PHP", name: "PHP", standard: "Item PHP", observation: { standard: true }, observationLabel: "Same as standard", plain: "none", passRule: "—", labels: ["PHP"] },
{ code: "BS_PHP", name: "BS of PHP", standard: "Item BS (PHP)", observation: { manual: true }, observationLabel: "Typed by QC", plain: "min", passRule: "≥ standard", labels: ["BS OF PHP"] },
{ code: "CS", name: "Compression Strength (kgf)", standard: "Item CS Std", observation: { readings: ["pdi.csAchieved", "printing.csAchieved"] }, observationLabel: "PDI: CS Achieved · Printing QC: CS Achieved", plain: "min", passRule: "≥ standard (or within ± range)", labels: ["COMPRESSION STRENGTH (KGF)", "COMPRESSION STRENGTH"] },
{ code: "BS_CFB", name: "Bursting Strength of CFB (kg/cm²)", standard: "Item BS Std", observation: { readings: ["printing.bsAchieved"] }, observationLabel: "Printing QC: BS Achieved", plain: "min", passRule: "≥ standard (or within ± range)", labels: ["BS OF CFB (KG/CM2)", "BURSTING STRENGTH"] },
{ code: "GLUED", name: "Staple / Glued", standard: "GLUED", observation: { check: "pdi.jointCheck" }, observationLabel: "PDI: Joint Pasting check", plain: "none", passRule: "PDI check OK", labels: ["STAPLE/GLUED"] },
{ code: "FLUTE", name: "Type of Flute", standard: "Job / Item Flute", observation: { readings: ["boardline.typeOfFlute"] }, observationLabel: "Boardline QC: Type of Flute", plain: "equal", passRule: "Equal to standard", labels: ["TYPE OF FLUTE", "FLUTE TYPE"] },
{ code: "FLUTE_COUNT", name: "Number of Flutes / 30 cm (or / ft)", standard: "e.g. 35 (±3), 30-36", observation: { manual: true }, observationLabel: "Typed by QC", plain: "none", passRule: "Within range", labels: ["NUMBER OF FLUTES / 30CM (BROAD FLUTE/NARRO FLUTE)", "NUMBER OF FLUTES / FT"] },
{ code: "FLUTE_HT", name: "Flute Height (mm)", standard: "e.g. 4.6 (±0.1)", observation: { manual: true }, observationLabel: "Typed by QC", plain: "none", passRule: "Within range", labels: ["FLUTE HEIGHT (MM)"] },
{ code: "FLUTE_PCT", name: "Flute %", standard: "50", observation: { manual: true }, observationLabel: "Typed by QC", plain: "min", passRule: "≥ standard", labels: ["FLUTE %"] },
{ code: "THICK", name: "Board Thickness (mm)", standard: "By flute: A/C Min 4.8 · B Min 2.8 · B+C Min 7 · E Min 1.5", observation: { readings: ["boardline.boardThickness"] }, observationLabel: "Boardline QC: Board Thickness", plain: "min", passRule: "≥ minimum (or within ±)", labels: ["BOARD THICKNESS"] },
{ code: "MOISTURE", name: "Moisture of Composite Board (%)", standard: "Range per company, e.g. 7-9%", observation: { readings: ["boardline.moisture"] }, observationLabel: "Boardline QC: Moisture", plain: "max", passRule: "Within range", labels: ["MOISTURE OF COMPOSITE BOARD (%)", "MOISTURE CONTENT"] },
{ code: "COMP_GSM", name: "Composite / Board GSM", standard: "Item Composite GSM (±3%)", observation: { readings: ["pdi.gsmAchieved"] }, observationLabel: "PDI: GSM Achieved", plain: { percent: 3 }, passRule: "Within standard ± 3%", labels: ["COMPOSITE GSM (+- 3%) (G)", "BOARD GSM"] },
{ code: "LAYER_GSM", name: "Individual Layer GSM", standard: "Item layer GSM (L1 / F1 / L2 …)", observation: { manual: true }, observationLabel: "Typed by QC", plain: "none", passRule: "Each within tolerance", labels: ["INDIVIDUAL LAYER GSM (GM)", "GSM", "PAPER GSM"] },
{ code: "PAPER_BF", name: "Paper BF", standard: "Item BF", observation: { manual: true }, observationLabel: "Typed by QC", plain: "equal", passRule: "Equal to standard", labels: ["PAPER BF", "BF OF PAPER"] },
{ code: "BOX_WT", name: "Box Weight (g)", standard: "Item Standard Weight", observation: { readings: ["pdi.boxWeightGrams"] }, observationLabel: "PDI: Box Weight (grams)", plain: { percent: 10 }, passRule: "Within standard ± 10%", labels: ["BOX WEIGHT (GRAMS)", "BOX WEIGHT", "WEIGHT OF CB", "WEIGHT OF CFB"] },
{ code: "JOINT_W", name: "Manufacturing Joint Width (mm)", standard: "e.g. 28 - 32 mm, Min. 35 mm", observation: { manual: true }, observationLabel: "Typed by QC", plain: "min", passRule: "Within range / ≥ minimum", labels: ["MANUFACTURING JOINT WIDTH", "JOINT FLAP WIDTH"] },
{ code: "FLAP_GAP", name: "Gap between Closing Flap (mm)", standard: "Maximum 3 mm", observation: { manual: true }, observationLabel: "Typed by QC", plain: "max", passRule: "≤ maximum", labels: ["GAP BETWEEN CLOSING FLAP", "FLAP GAP"] },
{ code: "ECT", name: "ECT Value", standard: "-", observation: { manual: true }, observationLabel: "Typed by QC (lab)", plain: "none", passRule: "—", labels: ["ECT VALUE"] },
{ code: "RCT", name: "RCT Value", standard: "-", observation: { manual: true }, observationLabel: "Typed by QC (lab)", plain: "none", passRule: "—", labels: ["RCT VALUE"] },
{ code: "JOINT_ADH", name: "Joint Adhesion", standard: "Fibre tear", observation: { manual: true }, observationLabel: "Typed by QC", plain: "none", passRule: "—", labels: ["JOINT ADHESION"] },
{ code: "PLY_BOND", name: "Bond between Paper Layers", standard: "Fibre tear", observation: { manual: true }, observationLabel: "Typed by QC", plain: "none", passRule: "—", labels: ["BOND BETWEEN PAPER LAYER"] },
{ code: "ODOUR", name: "Odour", standard: "-", observation: { manual: true }, observationLabel: "Typed by QC", plain: "none", passRule: "—", labels: ["ODOUR"] },
{ code: "CENTER_PLATE", name: "Center Plate (L × W)", standard: "e.g. 235 X 177 (±3 mm)", observation: { manual: true }, observationLabel: "Typed by QC", plain: "none", passRule: "Within ± 3 mm", labels: ["CENTER PLATE (L X W)"] },
{ code: "QTY_CFB", name: "Qty / CFB", standard: "1", observation: { standard: true }, observationLabel: "Same as standard", plain: "equal", passRule: "Equal to standard", labels: ["QTY / CFB"] },
{ code: "PROC_CHECKS", name: "Process checks (Corrugation, Pasting, Adhesive, Pre-folding / Creasing, Slotting)", standard: "OK / NOT OK", observation: { manual: true }, observationLabel: "Typed by QC", plain: "none", passRule: "OK", labels: ["CORRUGATION CHECK", "PASTING CHECK", "ADHESIVE CHECK", "PRE-FOLDING / CREASING CHECK", "SLOTTING CHECK"] },
];
const normLabel = (value ) => String(value ?? "").toUpperCase().replace(/\s+/g, " ").trim();
const indexCache = new WeakMap ();
function labelIndex(list ) {
let index = indexCache.get(list);
if (!index) {
index = new Map(list.flatMap((parameter) => [parameter.name, ...parameter.labels].map((label) => [normLabel(label), parameter] )));
indexCache.set(list, index);
}
return index;
}
function coaParameterForLabel(label , list = COA_PARAMETERS) {
return labelIndex(list).get(normLabel(label));
}
const num = (value ) => {
const match = String(value ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
return match ? Number(match[0]) : NaN;
};
const numbersIn = (value ) => (String(value ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
function checkCoaObservation(parameter , standard , observed ) {
if (!parameter) return "";
const obsText = String(observed ?? "").trim();
if (!obsText) return "";
if ("check" in parameter.observation) return /^NOT\s*OK$/i.test(obsText) ? "FAIL" : "";
const std = String(standard ?? "").replace(/,/g, "").trim().replace(/(\d)\s*%(\s*(?:\+-|±|\+\/-)\s*\d+(?:\.\d+)?)\s*%/, "$1$2");
const values = numbersIn(obsText);
if (!std || !values.length) {
if (parameter.plain === "equal" && std && obsText) return std.toUpperCase().replace(/\s+/g, "") === obsText.toUpperCase().replace(/\s+/g, "") ? "PASS" : "FAIL";
return "";
}
let low = -Infinity;
let high = Infinity;
const pct = std.match(/(-?\d+(?:\.\d+)?)\s*\(?\s*(?:\+-|±|\+\/-)\s*(\d+(?:\.\d+)?)\s*%/);
const tol = std.match(/(-?\d+(?:\.\d+)?)\s*(?:mm)?\s*\(?\s*(?:\+-|±|\+\/-)\s*(\d+(?:\.\d+)?)/);
const range = std.match(/(-?\d+(?:\.\d+)?)\s*%?\s*(?:-|–|to)\s*(-?\d+(?:\.\d+)?)/i);
if (/max/i.test(std) || /<=/.test(std)) high = num(std);
else if (/min/i.test(std) || />=/.test(std)) low = num(std);
else if (pct) { const base = Number(pct[1]); const p = Number(pct[2]) / 100; low = base * (1 - p); high = base * (1 + p); }
else if (tol) { const base = Number(tol[1]); low = base - Number(tol[2]); high = base + Number(tol[2]); }
else if (range && Number(range[2]) > Number(range[1])) { low = Number(range[1]); high = Number(range[2]); }
else {
const base = num(std);
if (!Number.isFinite(base)) return "";
const rule = parameter.plain;
if (rule === "none") return "";
if (rule === "min") low = base;
else if (rule === "max") high = base;
else if (rule === "equal") { low = base; high = base; }
else if ("tolerance" in rule) { low = base - rule.tolerance; high = base + rule.tolerance; }
else { low = base * (1 - rule.percent / 100); high = base * (1 + rule.percent / 100); }
}
if (!Number.isFinite(low) && !Number.isFinite(high)) return "";
const eps = 1e-9;
return values.every((value) => value >= low - eps && value <= high + eps) ? "PASS" : "FAIL";
}
function checkCoaDimensions(standards , observed , tolerance = 3) {
const pairs = standards.map((value, index) => [num(value), num(observed[index] ?? "")] ).filter(([s, o]) => Number.isFinite(s) && Number.isFinite(o));
if (!pairs.length) return "";
return pairs.every(([s, o]) => Math.abs(o - s) <= tolerance + 1e-9) ? "PASS" : "FAIL";
}
const text = (value ) => String(value ?? "").trim();
const id = (value ) => text(value);
function sourceValue(value ) {
if (value === null || value === undefined) return "";
return String(value);
}
const COMMON_COA_KEY = "COMMON";
const COMMON_COA_NAME = "COMMON (all other customers)";
function boardThicknessStandard(flute ) {
const value = flute.toUpperCase().replace(/\s+/g, "");
if (value === "A") return "Min 4.8 mm (A-Flute)";
if (value === "B+C") return "Min 7 mm (B+C-Flute)";
if (value === "B") return "Min 2.8 mm";
if (value === "C") return "Min 4.8 mm";
return "";
}
function checkText(value , okText ) {
const v = text(value).toUpperCase();
return v === "OK" ? okText : v === "NOT OK" ? "NOT OK" : "";
}
function buildCoaObservations(readings 
) {
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
function resolveCoaSourceContext(production , companies , firms , orders , schedules , invoices , invoiceLines , pdis , boardlineRows , printingRows , items = [], loadingRecords , latestPdi ) {
const schedule = schedules.find((value) => id(value.id) === id(production.scheduleId));
const order = orders.find((value) => id(value.id) === id(schedule?.orderId) || (id(value.companyId) === id((production ).companyId) && id(value.itemId) === id(production.itemId)));
const companyId = id((production ).companyId || order?.companyId);
const company = companies.find((value) => id(value.id) === companyId) || companies.find((value) => text(value.name).toLowerCase() === text((production ).companyName).toLowerCase());
const firm = firms.find((value) => id(value.id) === id(production.firmId));
const slipItems = new Map((loadingRecords || []).map((record) => [id(record.slip.id), record.itemIds.map((value) => id(value).toLowerCase())]));
const jobLines = invoiceLines.filter((line) => {
const itemIds = slipItems.get(id(line.loadingSlipId));
if (!itemIds || !line.invoiceId) return false;
return !itemIds.length || !id(line.itemId) || itemIds.includes(id(line.itemId).toLowerCase());
});
const invoiceById = new Map(invoices.map((value) => [id(value.id), value]));
const jobInvoices = [...new Set(jobLines.map((line) => id(line.invoiceId)))]
.map((invoiceId) => invoiceById.get(invoiceId))
.filter((value) => Boolean(value) && text((value ).status).toLowerCase() !== "cancelled")
.sort((a, b) => id(a.date || a.updateTimestamp).localeCompare(id(b.date || b.updateTimestamp)));
const liveInvoiceIds = new Set(jobInvoices.map((value) => id(value.id)));
const liveLines = jobLines.filter((line) => liveInvoiceIds.has(id(line.invoiceId)));
const jobInvoiceQty = liveLines.reduce((sum, line) => sum + (Number(line.qty) || 0), 0);
const invoice = jobInvoices[jobInvoices.length - 1];
const invoiceLine = liveLines.filter((line) => id(line.invoiceId) === id(invoice?.id))[0];
const pdi = latestPdi !== undefined ? latestPdi || undefined : pdis.filter((value) => id(value.productionId) === id(production.id) || text(value.jobNo) === text(production.transactionNo)).sort((a, b) => id(b.updateTimestamp || b.inspectionDate).localeCompare(id(a.updateTimestamp || a.inspectionDate)))[0];
const jobKey = (value ) => text(value).toUpperCase().replace(/\s+/g, "");
const jobKeys = new Set([production.transactionNo, production.jobCardNo].map(jobKey).filter(Boolean));
const latestQc = (rows ) => rows.filter((value) => jobKeys.has(jobKey(value.jobNo))).sort((a, b) => id(b.updateTimestamp || b.timestamp).localeCompare(id(a.updateTimestamp || a.timestamp)))[0];
const boardline = latestQc(boardlineRows ) ;
const printing = latestQc(printingRows ) ;
const itemKeys = [production.itemId, production.npdId].map(id).filter(Boolean);
const erp = text(production.erpCode || production.masterErp || order?.erpCode);
const item = items.find((value) => itemKeys.includes(id(value.id)) || itemKeys.includes(id(value.npdId)))
|| (erp ? items.find((value) => text(value.erp) === erp) : undefined);
return { production, company, firm, order, invoice, invoiceLine, jobInvoices, jobInvoiceQty, pdi, boardline, printing, item };
}
function buildCoaSourceMap(context , coaDate = new Date().toISOString().slice(0, 10)) {
const { production, company, firm, order, invoice, jobInvoices, jobInvoiceQty, pdi, boardline, printing, item } = context;
const job = production ;
const flute = text(job.flute || item?.flute);
const layerGsm = ["l1", "f1", "l2", "f2", "l3"].map((key) => text(job[key] ?? item?.[key])).filter((value) => value && Number(value) !== 0).join(" / ");
const colours = [text(item?.printingColour1 || job.color1), text(item?.printingColour2 || job.color2)].filter(Boolean).join(" & ");
return {
coaDate,
companyName: text(company?.name || (production ).companyName),
firmName: text(firm?.firmName || production.firmName),
firmAddress: text(firm?.address),
firmLogo: "",
jobNo: text(production.transactionNo || production.jobCardNo),
erpCode: text(production.erpCode || production.masterErp || order?.erpCode),
itemName: text(job.itemName || item?.itemName || item?.name || (order )?.itemName),
"production.length": sourceValue((production ).length),
"production.breadth": sourceValue((production ).breadth),
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
"pdi.flapGapCheck": sourceValue((pdi )?.flapGapCheck),
"pdi.jointCheck": sourceValue((pdi )?.jointPastingDelaminationCheck),
"pdi.printingColorCheck": sourceValue((pdi )?.printingColorCheck),
invoiceNo: (jobInvoices?.length ? jobInvoices : invoice ? [invoice] : []).map((value) => text(value.invoiceNo || (value ).tallyInvNo)).filter(Boolean).join(", "),
invoiceQty: jobInvoiceQty ? String(Number(jobInvoiceQty.toFixed(2))) : "",
batchNo: text((production ).batchNo || (production ).lotNo),
"pdi.lengthId": sourceValue(pdi?.lengthId),
"pdi.widthId": sourceValue(pdi?.widthId),
"pdi.heightId": sourceValue(pdi?.heightId),
"pdi.csAchieved": sourceValue(pdi?.csAchieved),
"pdi.gsmAchieved": sourceValue(pdi?.gsmAchieved),
"pdi.boxWeightGrams": sourceValue(pdi?.boxWeightGrams),
"pdi.remarks": sourceValue(pdi?.remarks),
"pdi.qcPerson": sourceValue((pdi )?.qcPerson || (pdi )?.inspectedBy),
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
"pdi.printingArtworkCheck": sourceValue((pdi )?.printingArtworkCheck),
...buildCoaObservations({
ply: job.ply || item?.ply,
printingColorCheck: (pdi )?.printingColorCheck,
printingArtworkCheck: (pdi )?.printingArtworkCheck,
lengthId: pdi?.lengthId, widthId: pdi?.widthId, heightId: pdi?.heightId,
boardFlute: boardline?.typeOfFlute, boardThickness: boardline?.boardThickness, moisture: boardline?.moisture,
}),
};
}
function evaluateCoaAutoRule(rule , valueOf , _seed ) {
if (rule.copy) return valueOf(rule.copy);
return "";
}
function buildInitialCellValues(layout , sourceMap , parameters = COA_PARAMETERS) {
const values = {};
const cells = [...layout.metadataRows, ...layout.parameterRows, ...layout.footerRows].flatMap((row) => row.cells);
for (const cellValue of cells) {
if (cellValue.auto) continue;
const source = cellValue.binding ? sourceMap[cellValue.binding] || "" : "";
const value = cellValue.kind === "binding" ? source : cellValue.defaultValue || source;
if (cellValue.kind !== "static" || value) values[cellValue.id] = { value, sourceValue: source, source: source ? "auto" : "default" };
}
const seedBase = text(sourceMap.jobNo) || "coa";
for (let pass = 0; pass < 2; pass++) {
for (const cellValue of cells) {
if (!cellValue.auto || (pass === 1 && values[cellValue.id]?.value)) continue;
const value = evaluateCoaAutoRule(cellValue.auto, (cellId) => values[cellId]?.value || "", `${seedBase}|${cellValue.id}`);
values[cellValue.id] = { value, sourceValue: value, source: value ? "auto" : "default" };
}
}
fillObservationsFromMaster(layout, values, sourceMap, parameters);
return values;
}
function coaRowLabel(row ) {
const labelled = row.cells.find((cell) => cell.kind === "static" && /-label$/.test(cell.id));
if (labelled) return text(labelled.label);
return text(row.cells.find((cell) => cell.kind === "static" && text(cell.label) && !/^[\d.-]+$/.test(text(cell.label)))?.label);
}
function coaParameterRowParts(layout ) {
const rows = layout.parameterRows || [];
const header = rows.find((row) => row.cells.some((cell) => cell.kind === "static" && /OBSERVATION|TEST RESULT/i.test(text(cell.label))));
const ranges = [];
if (header) {
let col = 0;
header.cells.forEach((cell) => {
const span = cell.colSpan || 1;
const label = text(cell.label).toUpperCase();
const kind = /OBSERVATION|TEST RESULT/.test(label) ? "obs" : /STANDARD|SPECIFICATION/.test(label) ? "std" : /REMARK/.test(label) ? "remark" : /PARAMETER/.test(label) ? "label" : "other";
ranges.push([kind, col, col + span]);
col += span;
});
}
return rows.filter((row) => row !== header).map((row) => {
const parts = { row, label: "", std: [], obs: [], remark: [] };
if (header) {
let col = 0;
const labelCells = [];
row.cells.forEach((cell) => {
const kind = ranges.find(([, from, to]) => col >= from && col < to)?.[0] || "other";
if (kind === "std") parts.std.push(cell);
else if (kind === "obs") parts.obs.push(cell);
else if (kind === "remark") parts.remark.push(cell);
else if (kind === "label") labelCells.push(cell);
col += cell.colSpan || 1;
});
parts.label = text(labelCells.find((cell) => cell.kind === "static" && text(cell.label))?.label) || coaRowLabel(row);
} else {
parts.label = coaRowLabel(row);
parts.std = row.cells.filter((cell) => /-s\d?$/.test(cell.id));
parts.obs = row.cells.filter((cell) => /-o\d?$/.test(cell.id));
parts.remark = row.cells.filter((cell) => /-r$/.test(cell.id));
}
return parts;
});
}
function coaRowCheck(code , parameter , std , obs ) {
if (code === "DIM_ID" || code === "DIM_OD") {
const split = (values ) => values.filter(Boolean).join(" X ").split(/\s*[xX×*]\s*/);
return checkCoaDimensions(split(std), split(obs), code === "DIM_OD" ? 2 : 3);
}
return checkCoaObservation(parameter, std.filter(Boolean).join(" "), obs.filter(Boolean).join(" "));
}
function fillObservationsFromMaster(layout , values , sourceMap , parameters ) {
for (const parts of coaParameterRowParts(layout)) {
const parameter = coaParameterForLabel(parts.label, parameters);
if (!parameter) continue;
const valueOf = (cell ) => values[cell.id]?.value ?? (cell.binding ? sourceMap[cell.binding] || "" : cell.defaultValue || "");
const stdValues = parts.std.map(valueOf);
const stdText = stdValues.filter(Boolean).join(" X ");
const spec = parameter.observation;
const next = parts.obs.map((cell, index) => {
if (cell.binding) return sourceMap[cell.binding] || "";
if ("readings" in spec) {
if (parts.obs.length === 1) return spec.readings.map((key) => sourceMap[key] || "").find(Boolean) || "";
return sourceMap[spec.readings[index] || ""] || "";
}
if ("standard" in spec) return index === 0 ? stdText : "";
if ("check" in spec) return index === 0 ? checkText(sourceMap[spec.check], spec.okText || stdText || "OK") : "";
return "";
});
parts.obs.forEach((cell, index) => {
values[cell.id] = { value: next[index], sourceValue: next[index], source: next[index] ? "auto" : "default" };
});
if (parts.remark.length) {
const result = coaRowCheck(parameter.code, parameter, stdValues, next);
const value = result === "PASS" ? "OK" : result === "FAIL" ? "NOT OK" : "";
parts.remark.forEach((cell) => { values[cell.id] = { value, sourceValue: value, source: value ? "auto" : "default" }; });
}
}
}
function getCoaCellValue(templateCell , values , sourceMap , headerData ) {
const value = values[templateCell.id]?.value;
if (value !== undefined) return value;
if (templateCell.binding && headerData[templateCell.binding] !== undefined) return headerData[templateCell.binding];
if (templateCell.binding && sourceMap[templateCell.binding] !== undefined) return sourceMap[templateCell.binding];
return templateCell.defaultValue || "";
}
function templateCoversCompany(template , companyId ) {
const target = id(companyId);
if (!target) return false;
return id(template.companyId) === target || (template.layout?.applyToCompanyIds || []).some((value) => id(value) === target);
}
function activeTemplateForCompany(templates , companyId ) {
const active = templates.filter((template) => template.status === "Active").sort((a, b) => b.version - a.version);
return active.find((template) => id(template.companyId) === id(companyId))
|| active.find((template) => templateCoversCompany(template, companyId))
|| active.find((template) => id(template.companyId) === COMMON_COA_KEY);
}
return { buildInitialCellValues, coaParameterRowParts, coaRowCheck, coaParameterForLabel, buildCoaSourceMap, resolveCoaSourceContext, activeTemplateForCompany, getCoaCellValue, COA_PARAMETERS };})();"engine loaded"