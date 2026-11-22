// COA templates as laid out in the "COA 17 NOV MIG" sheet, one per company tab.
// Standards come from the job / NPD item. OBSERVATIONS are not generated: when a COA is
// filled, rows known to the COA Parameter Master (coaParameters.ts) take the real reading
// (PDI / Boardline QC / Printing QC) or are left blank for QC to type. The sheet's
// RAND ranges kept below in `auto` rules are ignored by evaluateCoaAutoRule.
import type { CoaAutoRule, CoaTemplateCell, CoaTemplateLayout, CoaTemplateRow } from "../types";

const PINK = "#f4d7e5";
const GREY = "#d9d9d9";
const HEAD = "#b7b7b7";

type Std = string | { bind: string } | { dims: [string, string, string] };
type Obs =
  | "copy"
  | string
  | { bind: string }
  | { rule: CoaAutoRule }
  | { triple: CoaAutoRule }
  | { dims: number };

export type CbbParam = [label: string, standard: Std, observation: Obs];

const staticCell = (id: string, label: string, extra: Partial<CoaTemplateCell> = {}): CoaTemplateCell =>
  ({ id, label, kind: "static", inputType: "text", bold: true, align: "center", ...extra });
const inputCell = (id: string, extra: Partial<CoaTemplateCell> = {}): CoaTemplateCell =>
  ({ id, label: "", kind: "input", inputType: "text", background: PINK, align: "center", ...extra });
const bindingCell = (id: string, binding: string, extra: Partial<CoaTemplateCell> = {}): CoaTemplateCell =>
  ({ id, label: "", kind: "binding", binding, inputType: "text", bold: true, align: "center", ...extra });

const stdCell = (id: string, std: Std, colSpan: number): CoaTemplateCell =>
  typeof std === "string"
    ? inputCell(id, { colSpan, defaultValue: std })
    : inputCell(id, { colSpan, binding: (std as { bind: string }).bind });

/** Standard / Observation table: SL | PARAMETERS (2) | STANDARD (3) | OBSERVATION (3). */
export function cbbParameterRows(params: CbbParam[]): CoaTemplateRow[] {
  const header: CoaTemplateRow = {
    id: "h",
    cells: [
      staticCell("h-sl", "SL. NO.", { background: HEAD }),
      staticCell("h-param", "PARAMETERS", { background: HEAD, colSpan: 2 }),
      staticCell("h-std", "STANDARD", { background: HEAD, colSpan: 3 }),
      staticCell("h-obs", "OBSERVATION", { background: HEAD, colSpan: 3 }),
    ],
  };
  const rows = params.map(([label, std, obs], index): CoaTemplateRow => {
    const n = index + 1;
    const id = `p${n}`;
    const cells: CoaTemplateCell[] = [
      staticCell(`${id}-sl`, String(n)),
      staticCell(`${id}-label`, label, { colSpan: 2, italic: true }),
    ];
    if (typeof std === "object" && "dims" in std) {
      std.dims.forEach((binding, i) => cells.push(inputCell(`${id}-s${i + 1}`, { binding })));
    } else {
      cells.push(stdCell(`${id}-s`, std, 3));
    }
    if (typeof obs === "object" && "dims" in obs) {
      [1, 2, 3].forEach((i) => cells.push(inputCell(`${id}-o${i}`, { auto: { from: `${id}-s${i}`, min: -obs.dims, max: obs.dims } })));
    } else if (typeof obs === "object" && "triple" in obs) {
      [1, 2, 3].forEach((i) => cells.push(inputCell(`${id}-o${i}`, { auto: obs.triple })));
    } else if (obs === "copy") {
      cells.push(inputCell(`${id}-o`, { colSpan: 3, auto: { copy: `${id}-s` } }));
    } else if (typeof obs === "string") {
      cells.push(inputCell(`${id}-o`, { colSpan: 3, defaultValue: obs }));
    } else if ("bind" in obs) {
      cells.push(inputCell(`${id}-o`, { colSpan: 3, binding: obs.bind }));
    } else {
      cells.push(inputCell(`${id}-o`, { colSpan: 3, auto: obs.rule }));
    }
    return { id: `r-${id}`, cells };
  });
  return [header, ...rows];
}

function metaRows(rows: Array<[label: string, binding?: string]>): CoaTemplateRow[] {
  return rows.map(([label, binding], index) => ({
    id: `m${index + 1}`,
    cells: [
      staticCell(`m${index + 1}-label`, label, { colSpan: 3, background: GREY }),
      binding
        ? bindingCell(`m${index + 1}-value`, binding, { colSpan: 6, ...(binding === "itemName" ? { background: PINK } : {}) })
        : inputCell(`m${index + 1}-value`, { colSpan: 6, background: undefined }),
    ],
  }));
}

const CBB_FOOTER: CoaTemplateRow[] = [{
  id: "f1",
  cells: [
    staticCell("f-remarks-label", "REMARKS:", { colSpan: 2 }),
    inputCell("f-remarks", { colSpan: 3, inputType: "textarea", defaultValue: "OK" }),
    staticCell("f-accepted", "ACCEPTED", { colSpan: 2 }),
    staticCell("f-checked-label", "CHECKED BY:"),
    inputCell("f-checked", { binding: "pdi.qcPerson" }),
  ],
}];

const BASIC_META: Array<[string, string?]> = [["ITEM NAME:", "itemName"], ["DATE", "coaDate"], ["INVOICE NO.", "invoiceNo"], ["INVOICE QTY.", "invoiceQty"]];

function cbbLayout(params: CbbParam[], meta: Array<[string, string?]> = BASIC_META): CoaTemplateLayout {
  return {
    title: "CERTIFICATE OF ANALYSIS (COA)",
    subtitle: "",
    logoEnabled: true,
    columns: 9,
    metadataRows: metaRows(meta),
    parameterRows: cbbParameterRows(params),
    footerRows: CBB_FOOTER,
  } as CoaTemplateLayout;
}

// Shared rows (sheet formulas in comments).
const DIMS = { dims: ["production.length", "production.breadth", "production.height"] as [string, string, string] };
const DIMS_OBS = { dims: 2 }; // RANDBETWEEN(std-2, std+2)
const COLOUR_CBB: CbbParam = ["COLOUR OF THE CBB", "AS PER STANDARD", "copy"];
const COLOUR_PRINTING: CbbParam = ["COLOUR OF PRINTING", { bind: "item.colours" }, "copy"];
const QUALITY_PRINTING: CbbParam = ["QUALITY OF PRINTING", "AS PER STANDARD", "copy"];
const DIMENSION: CbbParam = ["INTERNAL BOX DIMENSION (LXBXH) (MM) (+-3 MM)", DIMS, DIMS_OBS];
const PLY: CbbParam = ["PLY OF CFB", { bind: "production.ply" }, "copy"];
const GLUED: CbbParam = ["STAPLE/GLUED", "GLUED", "copy"];
// The sheet fixes "A" in several tabs; the standard is the job / item flute everywhere.
const FLUTE_A: CbbParam = ["TYPE OF FLUTE", { bind: "production.flute" }, "copy"];
const FLUTE_JOB: CbbParam = ["TYPE OF FLUTE", { bind: "production.flute" }, "copy"];
const FLUTES_30CM: CbbParam = ["NUMBER OF FLUTES / 30CM (BROAD FLUTE/NARRO FLUTE)", "35 (+-3)", "37"];
const FLUTE_HEIGHT: CbbParam = ["FLUTE HEIGHT (MM)", "4.6(+-0.1)", "4.7"];
const JOINT_28_32: CbbParam = ["Manufacturing Joint Width", "28 - 32 mm", { rule: { min: 28, max: 32 } }];
const FLAP_GAP: CbbParam = ["Gap between closing Flap", "Maximum 3 mm", { rule: { min: 1, max: 3 } }];
// CS: RANDBETWEEN(std+20, std+40) / (std+22, std+42) / (std+20, std+42) for the three samples.
const csRow = (label = "COMPRESSION STRENGTH (kgf)"): CbbParam => [label, { bind: "item.csStandard" }, { triple: { from: "", min: 20, max: 40 } }];
// BS: std+0.5 .. std+0.9 (2 decimals).
const BS_CFB: CbbParam = ["BS OF CFB (KG/CM2)", { bind: "item.bsStandard" }, { triple: { from: "", min: 0.5, max: 0.9, decimals: 2 } }];
const moisture = (standard: string, min: number, max: number): CbbParam =>
  ["MOISTURE OF COMPOSITE BOARD (%)", standard, { triple: { min, max } }];
// Board thickness: flute minimum to minimum + 0.3 (A 5.2, C 4.8, B 3.2, B+C 7, E 1.8).
const THICKNESS_BY_FLUTE: CoaAutoRule = {
  byValueOf: "", decimals: 2,
  ranges: { A: [5.2, 5.5], C: [4.8, 5.1], B: [3.2, 3.5], "B+C": [7, 7.3], E: [1.8, 2.1] },
};

/** Fills the `from` / `byValueOf` cell ids that depend on the row number. */
function wire(layout: CoaTemplateLayout): CoaTemplateLayout {
  const rows = layout.parameterRows;
  const stdOf = (row: CoaTemplateRow) => row.cells.find((cell) => cell.id.endsWith("-s"))?.id || "";
  const fluteStd = rows.find((row) => /TYPE OF FLUTE/i.test(row.cells[1]?.label || ""));
  for (const row of rows) {
    const label = row.cells[1]?.label || "";
    row.cells.forEach((cell, index) => {
      if (!cell.auto) return;
      const auto = { ...cell.auto };
      if (auto.from === "") auto.from = stdOf(row);
      if (auto.byValueOf === "") auto.byValueOf = fluteStd ? stdOf(fluteStd) : "";
      // Compression strength: second and third samples use +22..+42 and +20..+42.
      if (/COMPRESSION STRENGTH/i.test(label) && auto.from && auto.min === 20 && auto.max === 40) {
        const position = row.cells.filter((c) => c.auto).indexOf(cell);
        if (position === 1) { auto.min = 22; auto.max = 42; }
        if (position === 2) { auto.min = 20; auto.max = 42; }
      }
      row.cells[index] = { ...cell, auto };
    });
  }
  return layout;
}

const cbb = (params: CbbParam[], meta?: Array<[string, string?]>) => wire(cbbLayout(params, meta));

// Test-result format (Anmol, Carlsberg): Parameters | Units | Standard | Tolerance | Test Result | Remark.
type TrParam = [label: string, unit: string, standard: Std, tolerance: string, result: Obs, remark: string];

function testResultLayout(title: string, params: TrParam[]): CoaTemplateLayout {
  const meta: Array<[string, string?, string?, string?]> = [
    ["Supplier Name & Address", "firmName", "Batch No.", "batchNo"],
    ["Customer Name & Address", "companyName", "ERP Code", "erpCode"],
    ["Job Name", "itemName", "Invoice no", "invoiceNo"],
    ["Paper structure & No.of Ply", "production.layerGsm", "Invoice Date", "coaDate"],
    ["P.O. NO.", undefined, "Vehicle No.", undefined],
    ["P.O. Date", undefined, "Quantity", "invoiceQty"],
    ["MFG Date", "production.date", "EXP Date", undefined],
  ];
  const metadataRows: CoaTemplateRow[] = meta.map(([l1, b1, l2, b2], i) => ({
    id: `m${i + 1}`,
    cells: [
      staticCell(`m${i + 1}-l1`, l1, { colSpan: 2, background: GREY }),
      b1 ? bindingCell(`m${i + 1}-v1`, b1, { colSpan: 3 }) : inputCell(`m${i + 1}-v1`, { colSpan: 3, background: undefined }),
      staticCell(`m${i + 1}-l2`, l2 || "", { colSpan: 2, background: GREY }),
      b2 ? bindingCell(`m${i + 1}-v2`, b2, { colSpan: 2 }) : inputCell(`m${i + 1}-v2`, { colSpan: 2, background: undefined }),
    ],
  }));
  const header: CoaTemplateRow = {
    id: "h",
    cells: ["Parameters", "Units", "Standard", "Tolerance", "Test Result", "Remark"].map((label, i) =>
      staticCell(`h${i}`, label, { background: GREY, colSpan: [2, 1, 2, 1, 2, 1][i] })),
  };
  const rows = params.map(([label, unit, std, tolerance, result, remark], index): CoaTemplateRow => {
    const id = `p${index + 1}`;
    const resultCell = result === "copy"
      ? inputCell(`${id}-o`, { colSpan: 2, auto: { copy: `${id}-s` } })
      : typeof result === "string"
        ? inputCell(`${id}-o`, { colSpan: 2, defaultValue: result })
        : "bind" in (result as object)
          ? inputCell(`${id}-o`, { colSpan: 2, binding: (result as { bind: string }).bind })
          : inputCell(`${id}-o`, { colSpan: 2, auto: { ...(result as { rule: CoaAutoRule }).rule, ...((result as { rule: CoaAutoRule }).rule.from === "" ? { from: `${id}-s` } : {}) } });
    return {
      id: `r-${id}`,
      cells: [
        staticCell(`${id}-label`, label, { colSpan: 2, align: "left" }),
        staticCell(`${id}-unit`, unit, { bold: false }),
        stdCell(`${id}-s`, std, 2),
        inputCell(`${id}-t`, { defaultValue: tolerance }),
        resultCell,
        inputCell(`${id}-r`, { defaultValue: remark }),
      ],
    };
  });
  return {
    title, subtitle: "", logoEnabled: true, columns: 9,
    metadataRows,
    parameterRows: [header, ...rows],
    footerRows: [
      { id: "f1", cells: [staticCell("f-a", "Analyzed by", { colSpan: 3 }), staticCell("f-c", "Checked by", { colSpan: 3 }), staticCell("f-s", "Authorized by (Signature with Seal)", { colSpan: 3 })] },
      { id: "f2", cells: [inputCell("f-a-v", { colSpan: 3, binding: "pdi.qcPerson" }), inputCell("f-c-v", { colSpan: 3 }), inputCell("f-s-v", { colSpan: 3 })] },
    ],
  } as CoaTemplateLayout;
}

const TR_COMMON_TAIL: TrParam[] = [
  ["Bursting strength", "(kg/cm2)", "-", "-", { rule: { min: 6.6, max: 7.3, decimals: 2 } }, "OK"],
  ["Compression strength", "kg", { bind: "item.csStandard" }, "-", { bind: "pdi.csAchieved" }, "OK"],
  ["ECT Value", "KN/m", "-", "-", "-", "-"],
  ["RCT Value", "KN/m", "-", "-", "-", "-"],
  ["Joint Adhesion", "-", "Fibre tear", "-", "NO FIBRE TEAR OBSERVED", "-"],
  ["Bond between paper layer", "-", "Fibre tear", "-", "NO FIBRE TEAR OBSERVED", "-"],
  ["Odour", "-", "-", "-", "NONE", "-"],
];

/** Sheet tab -> template layout. Keys are the sheet tab names. */
export function coaSheetTemplates(): Record<string, CoaTemplateLayout> {
  return {
    "COMMON COA": cbb([
      COLOUR_CBB, QUALITY_PRINTING, DIMENSION, PLY, JOINT_28_32, FLAP_GAP, FLUTE_JOB,
      ["BOARD THICKNESS", { bind: "standard.boardThickness" }, { rule: THICKNESS_BY_FLUTE }],
      moisture("7-10%", 8, 9),
    ]),
    // Same rows as COMMON COA (sheet tab "Emergency COA").
    "Emergency COA": cbb([
      COLOUR_CBB, QUALITY_PRINTING, DIMENSION, PLY, JOINT_28_32, FLAP_GAP, FLUTE_JOB,
      ["BOARD THICKNESS", { bind: "standard.boardThickness" }, { rule: THICKNESS_BY_FLUTE }],
      moisture("7-10%", 8, 9),
    ]),
    // Sheet tab "New Sample COA": COMMON rows plus CS, BS and paper BF.
    "New Sample COA": cbb([
      COLOUR_CBB, QUALITY_PRINTING, DIMENSION, PLY, JOINT_28_32, FLAP_GAP, FLUTE_JOB,
      ["BOARD THICKNESS", { bind: "standard.boardThickness" }, { rule: THICKNESS_BY_FLUTE }],
      moisture("7-10%", 8, 9),
      csRow(),
      ["BS OF CFB (KG/CM2)", { bind: "item.bsStandard" }, "copy"],
      ["BF OF PAPER", "AS REQUIRED", "copy"],
    ]),
    "Pragati Liquor": cbb([
      COLOUR_CBB, QUALITY_PRINTING, DIMENSION, PLY, JOINT_28_32, FLAP_GAP, FLUTE_JOB,
      ["BOARD THICKNESS", { bind: "standard.boardThickness" }, { rule: THICKNESS_BY_FLUTE }],
      moisture("7-10%", 8, 9),
      // CS: std+10 .. std+25; BS: std+0.2 .. std+0.5.
      ["COMPRESSION STRENGTH (kgf)", { bind: "item.csStandard" }, { triple: { from: "", min: 10, max: 25 } }],
      ["BS OF CFB (KG/CM2)", { bind: "item.bsStandard" }, { triple: { from: "", min: 0.2, max: 0.5, decimals: 2 } }],
    ]),
    "Britannia / ITC": cbb([
      COLOUR_CBB, COLOUR_PRINTING, QUALITY_PRINTING,
      ["STACK NORMS", { bind: "item.stackNorms" }, "copy"],
      ["WEIGHT & PACK DETAILS", { bind: "item.weightPack" }, "copy"],
      ["ADDRESS OF REGD OFFICE & MFG LOCATION", "AS PER ARTWORK", "copy"],
      ["MARKED TAPPING AREA", "AS PER STANDARD", "copy"],
      DIMENSION, PLY,
      // Composite GSM: RANDBETWEEN(std - 3%, std + 3%).
      ["COMPOSITE GSM (+- 3%) (g)", { bind: "item.compositeGsm" }, { rule: { from: "", min: -0.03, max: 0.03, percent: true } }],
      ["INDIVIDUAL LAYER GSM (Gm)", { bind: "production.layerGsm" }, "copy"],
      csRow(), GLUED, FLUTE_A, FLUTES_30CM, FLUTE_HEIGHT,
      moisture("7-9%", 7, 8), BS_CFB,
    ]),
    Godrej: cbb([
      COLOUR_CBB, COLOUR_PRINTING, QUALITY_PRINTING,
      ["STACK NORMS", { bind: "item.stackNorms" }, "copy"],
      DIMENSION, PLY,
      ["PHP", "", "copy"],
      // BS of PHP: std+0.2 .. std+0.4.
      ["BS OF PHP", "", { rule: { from: "", min: 0.2, max: 0.4, decimals: 2 } }],
      csRow(), GLUED, FLUTE_A, FLUTES_30CM, FLUTE_HEIGHT,
      moisture("7-9%", 7, 8), BS_CFB,
    ]),
    PEPSICO: cbb([
      COLOUR_CBB, COLOUR_PRINTING, QUALITY_PRINTING, DIMENSION, PLY,
      ["Manufacturing Joint Width", "Min. 35 mm", { rule: { min: 38, max: 43 } }],
      FLAP_GAP,
      ["COMPRESSION STRENGTH (kgf)", { bind: "item.csStandard" }, { triple: { from: "", min: 35, max: 60 } }],
      GLUED, FLUTE_A,
      ["NUMBER OF FLUTES / FT", "30-36", "33"],
      ["BOARD THICKNESS", "Min 4.8 mm (A-Flute)", { rule: { min: 5.1, max: 5.4, decimals: 2 } }],
      moisture("4-11%", 5, 8),
    ]),
    EMAMI: cbb([
      COLOUR_CBB, COLOUR_PRINTING, QUALITY_PRINTING, DIMENSION, PLY, JOINT_28_32, FLAP_GAP,
      csRow(), GLUED, FLUTE_JOB,
      ["BOARD THICKNESS", { bind: "standard.boardThickness" }, { rule: { min: 5.1, max: 5.4, decimals: 2 } }],
      moisture("7-10%", 8, 9),
    ]),
    Hector: cbb([
      COLOUR_CBB, COLOUR_PRINTING, QUALITY_PRINTING, DIMENSION, PLY, JOINT_28_32, FLAP_GAP,
      csRow(), GLUED, FLUTE_JOB,
      ["BOARD THICKNESS", { bind: "standard.boardThickness" }, { rule: THICKNESS_BY_FLUTE }],
      moisture("6-8%", 6, 8),
    ], [["ERP CODE", "erpCode"], ["ITEM NAME:", "itemName"], ["BATCH NO.", "batchNo"], ["DATE OF MANUFACTURING", "production.date"], ["COA DATE", "coaDate"], ["INVOICE NO.", "invoiceNo"], ["INVOICE QTY.", "invoiceQty"]]),
    NRL: cbb([
      COLOUR_PRINTING, QUALITY_PRINTING, DIMENSION, PLY,
      ["BURSTING STRENGTH", { bind: "item.bsStandard" }, { rule: { min: 16, max: 19 } }],
      ["BOARD GSM", { bind: "item.compositeGsm" }, "150/150/150/150/150"],
      csRow(), GLUED,
      ["BOX WEIGHT", { bind: "item.boxWeight" }, { rule: { min: 710, max: 720, suffix: " grams" } }],
      ["PAPER BF", { bind: "item.bf" }, "ALL 22 Bf"],
      moisture("7-10%", 8, 9),
    ]),
    Freshy: cbb([
      COLOUR_CBB, COLOUR_PRINTING, QUALITY_PRINTING,
      ["ADDRESS OF REGD OFFICE & MFG LOCATION", "AS PER ARTWORK", "copy"],
      ["MARKED TAPPING AREA", "AS PER STANDARD", "copy"],
      DIMENSION, PLY, csRow(), GLUED, FLUTE_A, FLUTES_30CM, FLUTE_HEIGHT,
      moisture("7-9%", 7, 8),
    ]),
    Hetero: cbb([
      DIMENSION, PLY,
      ["COMPOSITE GSM (+- 3%) (g)", { bind: "item.compositeGsm" }, "copy"],
      ["INDIVIDUAL LAYER GSM (Gm)", { bind: "production.layerGsm" }, "copy"],
      ["STAPLE/GLUED", "GLUING / STITCHING", "STITCHING"],
      FLUTE_A, FLUTES_30CM,
      ["PAPER BF", "18 - 20", "copy"],
      moisture("6% +-2%", 7, 8),
      ["CORRUGATION CHECK", "OK / NOT OK", "OK"],
      ["PASTING CHECK", "OK / NOT OK", "OK"],
      ["ADHESIVE CHECK", "OK / NOT OK", "OK"],
      ["PRE-FOLDING / CREASING CHECK", "OK / NOT OK", "OK"],
      ["SLOTTING CHECK", "OK / NOT OK", "OK"],
    ], [["ITEM NAME:", "itemName"], ["BATCH NO.", "batchNo"], ["MFG. DATE", "production.date"], ["COA DATE", "coaDate"], ["INVOICE NO.", "invoiceNo"], ["INVOICE QTY.", "invoiceQty"]]),
    "TATA WATER": cbb([
      DIMENSION, PLY,
      ["Flap Gap", "-", "Not Found"],
      ["INDIVIDUAL LAYER GSM (Gm)", "ALL 150", { triple: { min: 151, max: 152 } }],
      ["BOARD GSM", "525 +-10%", { triple: { min: 526, max: 535 } }],
      ["WEIGHT OF CFB", "0.175 +-10%", { triple: { min: 0.17, max: 0.18, decimals: 3 } }],
      FLUTE_A,
      ["FLUTE %", "50 %", { rule: { min: 51, max: 53 } }],
      ["PAPER BF", "ALL 18", "copy"],
      moisture("6% - 8%", 7, 8),
      ["BOARD THICKNESS", "5 mm +-0.5 mm", { triple: { min: 5.2, max: 5.4, decimals: 2 } }],
      ["Bursting Strength", "7 +-0.5", { triple: { min: 7.1, max: 7.4, decimals: 2 } }],
      ["Compression Strength", "170 +-8%", { triple: { min: 175, max: 180 } }],
      ["CENTER PLATE (L X W)", "235 X 177 (+-3 MM)", "235 X 177"],
      ["QTY / CFB", "1", "1"],
      ["JOINT ADHESION", "FIBER TEAR TEST", "No Fiber tear observed"],
      ["BOND BETWEEN PAPER LAYER", "FIBER TEAR TEST", "No Fiber tear observed"],
      ["ODOUR", "-", "None"],
    ], [["ITEM NAME:", "itemName"], ["BATCH NO.", "batchNo"], ["MFG. DATE", "production.date"], ["EXP DATE"], ["INVOICE NO.", "invoiceNo"], ["INVOICE QTY.", "invoiceQty"]]),
    Marico: cbb([
      COLOUR_CBB, COLOUR_PRINTING, QUALITY_PRINTING,
      // Box weight: std+10 .. std+15.
      ["BOX WEIGHT (GRAMS)", { bind: "item.boxWeight" }, { rule: { from: "", min: 10, max: 15 } }],
      DIMENSION, PLY,
      ["COMPOSITE GSM (+- 3%) (g)", { bind: "item.compositeGsm" }, "copy"],
      ["INDIVIDUAL LAYER GSM (Gm)", { bind: "production.layerGsm" }, "copy"],
      csRow(), GLUED, FLUTE_A, FLUTES_30CM,
      ["PAPER BF", "ALL 20 BF", "OK"],
      moisture("7-9%", 7, 8),
      ["JOINT FLAP WIDTH", "30-35", { rule: { min: 30, max: 35 } }],
    ]),
    Anmol: testResultLayout("COA OF CORRUGATED BOX", [
      ["Appearance", "-", "AS PER SAMPLE", "-", "copy", "OK"],
      ["Internal Dimension (L*W*H)", "mm", { bind: "production.boxSizeX" }, "±3", "copy", "OK"],
      ["Flap gap", "mm", "-", "-", "NOT FOUND", "-"],
      ["Flute %", "%", "50", "-", { rule: { min: 50, max: 52 } }, "OK"],
      ["Flute type", "A/B/C", "-", "-", "A", "OK"],
      ["Moisture content", "%", "6-10", "-", { rule: { min: 7, max: 9, suffix: "%" } }, "OK"],
      ["Weight of CB", "kg", "-", "-", { bind: "pdi.boxWeightGrams" }, "-"],
      ["Paper BF", "-", "ALL 20 BF", "-", "copy", "OK"],
      ["GSM", "-", { bind: "production.layerGsm" }, "-", "copy", "OK"],
      ["Board Thickness", "micron", "-", "-", { rule: { min: 5, max: 5.4, decimals: 2 } }, "OK"],
      ...TR_COMMON_TAIL,
    ]),
    Carlsberg: testResultLayout("COA OF CORRUGATED BOX", [
      ["Appearance", "-", "AS PER SAMPLE", "-", "copy", "OK"],
      ["External Dimension (L*W*H)", "mm", { bind: "item.boxSizeOd" }, "±2", "copy", "OK"],
      ["Flap gap", "mm", "±2.0", "±1", "2", "-"],
      ["Flute %", "%", "50", "-", { rule: { min: 50, max: 52 } }, "OK"],
      ["Flute type", "A/B/C", "-", "-", "A", "OK"],
      ["Moisture content", "%", "9", "-", { rule: { min: 7, max: 9, suffix: "%" } }, "OK"],
      ["Weight of CB", "kg", { bind: "item.boxWeight" }, "-", { bind: "pdi.boxWeightGrams" }, "-"],
      ["Paper BF", "-", "ALL 20 BF", "-", "copy", "OK"],
      ["GSM", "g/m²", { bind: "production.layerGsm" }, "- 5%", "copy", "OK"],
      ["Board Thickness", "mm", "3", "±0.25", { rule: { from: "", min: 0, max: 0.25, decimals: 2 } }, "OK"],
      ["Bursting strength", "(kg/cm2)", ">=6", "-", { rule: { min: 6.6, max: 7.3, decimals: 2 } }, "OK"],
      ...TR_COMMON_TAIL.slice(1),
    ]),
  };
}
