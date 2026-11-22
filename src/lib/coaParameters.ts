// COA Parameter Master: every parameter used on the company COA templates, with
// where its standard comes from, where its OBSERVATION comes from (a real reading,
// never a generated number), and the rule that marks the observation PASS / FAIL.
//
// Observations are filled only from recorded readings (PDI, Boardline QC, Printing QC)
// or, where the observation is the standard by definition (e.g. ply), copied from it.
// Anything else is left blank for the QC person to type in after checking.

/** How an observation cell is filled. */
export type CoaObservationSource =
  | { readings: string[] }                 // source-map keys, one per observation cell (L / B / H, sample 1 / 2 …)
  | { standard: true }                     // same as the standard (definition, not a test)
  | { check: string; okText?: string }     // PDI check: OK -> standard text (or okText), NOT OK -> "NOT OK"
  | { text: string }                       // fixed wording once the PDI has passed (e.g. odour "NONE")
  | { manual: true };                      // typed by QC

/** How a plain-number standard is judged when the standard text carries no rule of its own. */
export type CoaPlainRule = "min" | "max" | "equal" | { tolerance: number } | { percent: number } | "none";

export interface CoaParameter {
  code: string;
  name: string;
  standard: string;          // what the standard is / where it comes from
  observation: CoaObservationSource;
  observationLabel: string;  // shown in the master
  plain: CoaPlainRule;       // rule for a plain-number standard (text rules like "7-9%" win)
  passRule: string;          // shown in the master
  /** Row labels used on the templates (upper-case, spaces collapsed). */
  labels: string[];
  /** QC target shown as a hint in an empty observation box (never filled in as a reading). */
  target?: string;
  /** Standard per flute (A, B, C, E, B+C, B+A), used when the template gives no standard. */
  byFlute?: Record<string, string>;
  /** QC target per flute (hint only). */
  targetByFlute?: Record<string, string>;
  /** Standard per customer company (company id -> standard text); wins over the template's standard. */
  companyStandards?: Record<string, string>;
}

/** Flute code of a job: "A", "B", "C", "E", "B+C", "B+A" (accepts "BC", "C+B", "AB" …). */
export function normaliseFlute(value: unknown): string {
  const letters = String(value ?? "").toUpperCase().replace(/FLUTE/g, "").replace(/[^ABCEF]/g, "").split("").filter(Boolean);
  const unique = Array.from(new Set(letters));
  if (unique.length === 1) return unique[0];
  if (unique.length === 2 && unique.includes("B") && unique.includes("C")) return "B+C";
  if (unique.length === 2 && unique.includes("B") && unique.includes("A")) return "B+A";
  return unique.join("+");
}

export const COA_PARAMETERS: CoaParameter[] = [
  { code: "COL_CBB", name: "Colour of the CBB", standard: "AS PER STANDARD", observation: { check: "pdi.printingColorCheck" }, observationLabel: "PDI: Printing Colour check", plain: "none", passRule: "PDI check OK", labels: ["COLOUR OF THE CBB"] },
  { code: "COL_PRINT", name: "Colour of Printing", standard: "Item Printing Colour 1 (& 2)", observation: { check: "pdi.printingColorCheck", okText: "AS PER STANDARD" }, observationLabel: "PDI: Printing Colour check", plain: "none", passRule: "PDI check OK", labels: ["COLOUR OF PRINTING"] },
  { code: "QUAL_PRINT", name: "Quality of Printing", standard: "AS PER STANDARD", observation: { check: "pdi.printingArtworkCheck" }, observationLabel: "PDI: Printing Artwork check", plain: "none", passRule: "PDI check OK", labels: ["QUALITY OF PRINTING"] },
  { code: "APPEARANCE", name: "Appearance", standard: "AS PER SAMPLE", observation: { check: "pdi.printingArtworkCheck" }, observationLabel: "PDI: Printing Artwork check", plain: "none", passRule: "PDI check OK", labels: ["APPEARANCE"] },
  { code: "STACK", name: "Stack Norms", standard: "Item Stack Norms", observation: { standard: true }, observationLabel: "Same as standard", plain: "none", passRule: "—", labels: ["STACK NORMS"] },
  { code: "WT_PACK", name: "Weight & Pack Details", standard: "Item Weight & Pack Details", observation: { standard: true }, observationLabel: "Same as standard", plain: "none", passRule: "—", labels: ["WEIGHT & PACK DETAILS"] },
  { code: "ADDRESS", name: "Address of Regd Office & Mfg Location", standard: "AS PER ARTWORK", observation: { check: "pdi.printingArtworkCheck" }, observationLabel: "PDI: Printing Artwork check", plain: "none", passRule: "PDI check OK", labels: ["ADDRESS OF REGD OFFICE & MFG LOCATION"] },
  { code: "TAPPING", name: "Marked Tapping Area", standard: "AS PER STANDARD", observation: { check: "pdi.printingArtworkCheck" }, observationLabel: "PDI: Printing Artwork check", plain: "none", passRule: "PDI check OK", labels: ["MARKED TAPPING AREA"] },
  { code: "DIM_ID", name: "Internal Box Dimension L×B×H (mm)", standard: "Job / Item Length × Breadth × Height", observation: { readings: ["pdi.lengthId", "pdi.widthId", "pdi.heightId"] }, observationLabel: "PDI: Achieved Length / Width / Height", plain: { tolerance: 3 }, passRule: "Each within standard ± 3 mm", labels: ["INTERNAL BOX DIMENSION (LXBXH) (MM) (+-3 MM)", "INTERNAL DIMENSION (L*W*H)"] },
  { code: "DIM_OD", name: "External Dimension L×W×H (mm)", standard: "Item Length × Breadth × Height (OD)", observation: { manual: true }, observationLabel: "Typed by QC (PDI records internal size)", plain: { tolerance: 2 }, passRule: "Each within standard ± 2 mm", labels: ["EXTERNAL DIMENSION (L*W*H)"] },
  { code: "PLY", name: "Ply of CFB", standard: "Job / Item Ply", observation: { standard: true }, observationLabel: "Same as standard (job ply)", plain: "equal", passRule: "Equal to standard", labels: ["PLY OF CFB"] },
  { code: "PHP", name: "PHP", standard: "PHP Item Master (ERP · size · ply)", observation: { standard: true }, observationLabel: "Same as standard", plain: "none", passRule: "—", labels: ["PHP"] },
  { code: "BS_PHP", name: "BS of PHP", standard: "PHP Item Master BS (req)", observation: { manual: true }, observationLabel: "Typed by QC", plain: "min", passRule: "≥ standard", labels: ["BS OF PHP"], target: "Req + 0.5 to 1.0" },
  { code: "CS", name: "Compression Strength (kgf)", standard: "Item CS Std", observation: { readings: ["pdi.csAchieved", "printing.csAchieved"] }, observationLabel: "PDI: CS Achieved · Printing QC: CS Achieved", plain: "min", passRule: "≥ standard (or within ± range)", labels: ["COMPRESSION STRENGTH (KGF)", "COMPRESSION STRENGTH"], target: "Std + 30" },
  { code: "BS_CFB", name: "Bursting Strength of CFB (kg/cm²)", standard: "Item BS Std", observation: { readings: ["printing.bsAchieved"] }, observationLabel: "Printing QC: BS Achieved", plain: "min", passRule: "≥ standard (or within ± range)", labels: ["BS OF CFB (KG/CM2)", "BURSTING STRENGTH"], target: "Std + 0.5" },
  { code: "GLUED", name: "Staple / Glued", standard: "GLUED", observation: { check: "pdi.jointCheck" }, observationLabel: "PDI: Joint Pasting check", plain: "none", passRule: "PDI check OK", labels: ["STAPLE/GLUED"] },
  { code: "FLUTE", name: "Type of Flute", standard: "Job / Item Flute (as per standard)", observation: { readings: ["boardline.typeOfFlute"] }, observationLabel: "Boardline QC: Type of Flute", plain: "equal", passRule: "Equal to standard", labels: ["TYPE OF FLUTE", "FLUTE TYPE"] },
  { code: "FLUTE_COUNT", name: "Number of Flutes / 30 cm (or / ft)", standard: "By flute: A 30-36 · C 35-42", observation: { manual: true }, observationLabel: "Typed by QC", plain: "none", passRule: "Within range", labels: ["NUMBER OF FLUTES / 30CM (BROAD FLUTE/NARRO FLUTE)", "NUMBER OF FLUTES / FT", "NUMBER OF FLUTES"], byFlute: { A: "30-36", C: "35-42" }, targetByFlute: { A: "35", C: "40" } },
  { code: "FLUTE_HT", name: "Flute Height (mm)", standard: "By flute: A Min 4.8 · C Min 4.0 · B Min 2.8 · E Min 1.8 · B+C Min 6.8 · B+A Min 7.6", observation: { manual: true }, observationLabel: "Typed by QC", plain: "min", passRule: "≥ minimum", labels: ["FLUTE HEIGHT (MM)", "FLUTE HEIGHT"], byFlute: { A: "Min 4.8 mm", C: "Min 4.0 mm", B: "Min 2.8 mm", E: "Min 1.8 mm", "B+C": "Min 6.8 mm", "B+A": "Min 7.6 mm" }, targetByFlute: { A: "5.1-5.3", C: "4.2-4.6", B: "2.9-3.1", E: "1.9-2.1", "B+C": "6.8-7.0", "B+A": "7.6-7.8" } },
  { code: "FLUTE_PCT", name: "Flute %", standard: "By flute: A 50 · C 42 · B 35", observation: { manual: true }, observationLabel: "Typed by QC", plain: "min", passRule: "≥ standard", labels: ["FLUTE %"], byFlute: { A: "Min 50%", C: "Min 42%", B: "Min 35%" }, targetByFlute: { A: "52-55%", C: "43-45%", B: "36-38%" } },
  { code: "THICK", name: "Board Thickness (mm)", standard: "As per flute height: A Min 4.8 · C Min 4.0 · B Min 2.8 · E Min 1.8 · B+C Min 6.8 · B+A Min 7.6", observation: { readings: ["boardline.boardThickness"] }, observationLabel: "Boardline QC: Board Thickness", plain: "min", passRule: "≥ minimum (or within ±)", labels: ["BOARD THICKNESS"], byFlute: { A: "Min 4.8 mm", C: "Min 4.0 mm", B: "Min 2.8 mm", E: "Min 1.8 mm", "B+C": "Min 6.8 mm", "B+A": "Min 7.6 mm" } },
  { code: "MOISTURE", name: "Moisture of Composite Board (%)", standard: "7-9% (company option)", observation: { readings: ["boardline.moisture"] }, observationLabel: "Boardline QC: Moisture", plain: "max", passRule: "Within range", labels: ["MOISTURE OF COMPOSITE BOARD (%)", "MOISTURE CONTENT"], target: "7-9" },
  { code: "COMP_GSM", name: "Composite / Board GSM", standard: "Item Composite GSM (±3%)", observation: { readings: ["pdi.gsmAchieved"] }, observationLabel: "PDI: GSM Achieved", plain: { percent: 3 }, passRule: "Within standard ± 3%", labels: ["COMPOSITE GSM (+- 3%) (G)", "BOARD GSM"], target: "Std to Std + 3" },
  { code: "LAYER_GSM", name: "Individual Layer GSM", standard: "Item layer GSM (L1 / F1 / L2 …)", observation: { manual: true }, target: "As item", observationLabel: "Typed by QC", plain: "none", passRule: "Each within tolerance", labels: ["INDIVIDUAL LAYER GSM (GM)", "GSM", "PAPER GSM"] },
  { code: "PAPER_BF", name: "Paper BF", standard: "Item BF", observation: { manual: true }, target: "As item", observationLabel: "Typed by QC", plain: "equal", passRule: "Equal to standard", labels: ["PAPER BF", "BF OF PAPER"] },
  { code: "BOX_WT", name: "Box Weight (g)", standard: "Item Standard Weight", observation: { readings: ["pdi.boxWeightGrams"] }, observationLabel: "PDI: Box Weight (grams)", plain: { percent: 10 }, passRule: "Within standard ± 10%", labels: ["BOX WEIGHT (GRAMS)", "BOX WEIGHT", "WEIGHT OF CB", "WEIGHT OF CFB"], target: "Std to Std + 10%" },
  { code: "JOINT_W", name: "Manufacturing Joint Width (mm)", standard: "Min 35 mm (company option)", observation: { readings: ["pdi.jointWidthMm"] }, observationLabel: "PDI: Joint Width (mm)", plain: "min", passRule: "Within range / ≥ minimum", labels: ["MANUFACTURING JOINT WIDTH", "JOINT FLAP WIDTH", "MANUFACTURING JOINT GLUE"], target: "36-38" },
  { code: "FLAP_GAP", name: "Gap between Closing Flap (mm)", standard: "Maximum 3 mm (company option)", observation: { readings: ["pdi.flapGapMm"] }, observationLabel: "PDI: Flap Gap (mm)", plain: "max", passRule: "≤ maximum", labels: ["GAP BETWEEN CLOSING FLAP", "FLAP GAP"], target: "1-3" },
  { code: "ECT", name: "ECT Value", standard: "Manual", observation: { manual: true }, observationLabel: "Typed by QC (lab)", plain: "none", passRule: "—", labels: ["ECT VALUE"] },
  { code: "RCT", name: "RCT Value", standard: "Manual", observation: { manual: true }, observationLabel: "Typed by QC (lab)", plain: "none", passRule: "—", labels: ["RCT VALUE"] },
  { code: "JOINT_ADH", name: "Joint Adhesion", standard: "Fibre tear test", observation: { check: "pdi.jointCheck", okText: "NO FIBRE TEAR OBSERVED" }, observationLabel: "PDI: Joint Pasting check", plain: "none", passRule: "PDI check OK", labels: ["JOINT ADHESION"] },
  { code: "PLY_BOND", name: "Bond between Paper Layers", standard: "Fibre tear test", observation: { check: "pdi.jointCheck", okText: "NO FIBRE TEAR OBSERVED" }, observationLabel: "PDI: Joint Pasting check", plain: "none", passRule: "PDI check OK", labels: ["BOND BETWEEN PAPER LAYER"] },
  { code: "ODOUR", name: "Odour", standard: "-", observation: { text: "NONE" }, observationLabel: "NONE (after PDI pass)", plain: "none", passRule: "—", labels: ["ODOUR"] },
  { code: "CENTER_PLATE", name: "Center Plate (L × W)", standard: "L × W (±3 mm)", observation: { manual: true }, observationLabel: "Typed by QC", plain: { tolerance: 3 }, passRule: "Within ± 3 mm", labels: ["CENTER PLATE (L X W)"], target: "Within ± 1 mm" },
  { code: "QTY_CFB", name: "Qty / CFB", standard: "As NPD", observation: { standard: true }, observationLabel: "Same as standard", plain: "equal", passRule: "Equal to standard", labels: ["QTY / CFB"] },
  { code: "PROC_CHECKS", name: "Process checks (Corrugation, Pasting, Adhesive, Pre-folding / Creasing, Slotting)", standard: "OK / NOT OK", observation: { text: "OK" }, observationLabel: "OK (after PDI pass)", plain: "none", passRule: "OK", labels: ["CORRUGATION CHECK", "PASTING CHECK", "ADHESIVE CHECK", "PRE-FOLDING / CREASING CHECK", "SLOTTING CHECK"] },
];

const normLabel = (value: unknown) => String(value ?? "").toUpperCase().replace(/\s+/g, " ").trim();
const indexCache = new WeakMap<CoaParameter[], Map<string, CoaParameter>>();
function labelIndex(list: CoaParameter[]) {
  let index = indexCache.get(list);
  if (!index) {
    index = new Map(list.flatMap((parameter) => [parameter.name, ...parameter.labels].map((label) => [normLabel(label), parameter] as const)));
    indexCache.set(list, index);
  }
  return index;
}

/** Master parameter for a template row label (undefined when the row is not a known parameter). */
export function coaParameterForLabel(label: unknown, list: CoaParameter[] = COA_PARAMETERS): CoaParameter | undefined {
  return labelIndex(list).get(normLabel(label));
}

// ---- Saved edits (table coa_parameters, id = code) -------------------------------------

/** Row of the coa_parameters table: an edit over the built-in parameter with the same code. */
export interface CoaParameterRecord {
  id: string;
  code: string;
  name: string;
  standardText?: string | null;
  observationSource?: string | null; // "readings:pdi.csAchieved,printing.csAchieved" | "standard" | "check:pdi.x" | "manual"
  plainRule?: string | null;         // "min" | "max" | "equal" | "none" | "tol:3" | "pct:3"
  passRule?: string | null;
  labels?: string | null;            // template row labels, separated by "|"
  targetText?: string | null;        // QC target hint
  companyStandards?: string | null;  // JSON { companyId: standard text }
  active?: string | null;
  updatedBy?: string;
  updateTimestamp?: string;
}

export function observationSourceToText(source: CoaObservationSource): string {
  if ("readings" in source) return `readings:${source.readings.join(",")}`;
  if ("standard" in source) return "standard";
  if ("check" in source) return `check:${source.check}${source.okText ? `|${source.okText}` : ""}`;
  if ("text" in source) return `text:${source.text}`;
  return "manual";
}
export function observationSourceFromText(value: unknown, fallback: CoaObservationSource): CoaObservationSource {
  const textValue = String(value ?? "").trim();
  if (!textValue) return fallback;
  if (textValue === "standard") return { standard: true };
  if (textValue === "manual") return { manual: true };
  if (textValue.startsWith("check:")) {
    const [check, okText] = textValue.slice(6).split("|").map((part) => part.trim());
    return okText ? { check, okText } : { check };
  }
  if (textValue.startsWith("text:")) return { text: textValue.slice(5).trim() };
  if (textValue.startsWith("readings:")) {
    const readings = textValue.slice(9).split(",").map((key) => key.trim()).filter(Boolean);
    return readings.length ? { readings } : { manual: true };
  }
  return fallback;
}
export function plainRuleToText(rule: CoaPlainRule): string {
  if (typeof rule === "string") return rule;
  return "tolerance" in rule ? `tol:${rule.tolerance}` : `pct:${rule.percent}`;
}
export function plainRuleFromText(value: unknown, fallback: CoaPlainRule): CoaPlainRule {
  const textValue = String(value ?? "").trim().toLowerCase();
  if (["min", "max", "equal", "none"].includes(textValue)) return textValue as CoaPlainRule;
  const match = textValue.match(/^(tol|pct):\s*(\d+(?:\.\d+)?)$/);
  if (match) return match[1] === "tol" ? { tolerance: Number(match[2]) } : { percent: Number(match[2]) };
  return fallback;
}

/** Readings the observation can come from (shown in the master's dropdown). */
export const COA_READING_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "pdi.lengthId,pdi.widthId,pdi.heightId", label: "PDI: Achieved L / W / H" },
  { value: "pdi.csAchieved,printing.csAchieved", label: "PDI CS · Printing QC CS" },
  { value: "pdi.csAchieved", label: "PDI: CS Achieved" },
  { value: "pdi.gsmAchieved", label: "PDI: GSM Achieved" },
  { value: "pdi.boxWeightGrams", label: "PDI: Box Weight (g)" },
  { value: "pdi.jointWidthMm", label: "PDI: Joint Width (mm)" },
  { value: "pdi.flapGapMm", label: "PDI: Flap Gap (mm)" },
  { value: "printing.bsAchieved", label: "Printing QC: BS Achieved" },
  { value: "printing.csAchieved", label: "Printing QC: CS Achieved" },
  { value: "printing.boxWeightGrams", label: "Printing QC: Box Weight (g)" },
  { value: "boardline.moisture", label: "Boardline QC: Moisture" },
  { value: "boardline.boardThickness", label: "Boardline QC: Board Thickness" },
  { value: "boardline.typeOfFlute", label: "Boardline QC: Type of Flute" },
  { value: "boardline.sheetWeightGrams", label: "Boardline QC: Sheet Weight (g)" },
];
export const COA_CHECK_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "pdi.printingColorCheck", label: "PDI: Printing Colour check" },
  { value: "pdi.printingArtworkCheck", label: "PDI: Printing Artwork check" },
  { value: "pdi.jointCheck", label: "PDI: Joint Pasting check" },
  { value: "pdi.flapGapCheck", label: "PDI: Flap Gap check" },
];

export function describeObservationSource(source: CoaObservationSource): string {
  if ("standard" in source) return "Same as standard";
  if ("manual" in source) return "Typed by QC";
  if ("text" in source) return `${source.text} (after PDI pass)`;
  if ("check" in source) return COA_CHECK_OPTIONS.find((option) => option.value === source.check)?.label || source.check;
  const key = source.readings.join(",");
  return COA_READING_OPTIONS.find((option) => option.value === key)?.label || source.readings.join(" · ");
}

/**
 * Built-in parameters with the saved edits applied (matched on code). Saved rows with a new
 * code are added; a saved row with active = "No" switches the parameter off.
 */
export function mergeCoaParameters(records: CoaParameterRecord[] | undefined): CoaParameter[] {
  if (!records?.length) return COA_PARAMETERS;
  const byCode = new Map(records.map((record) => [String(record.code || record.id).trim().toUpperCase(), record]));
  const apply = (base: CoaParameter | undefined, record: CoaParameterRecord): CoaParameter => {
    const observation = observationSourceFromText(record.observationSource, base?.observation || { manual: true });
    const labels = String(record.labels ?? "").split("|").map((label) => label.trim()).filter(Boolean);
    return {
      code: String(record.code || record.id).trim().toUpperCase(),
      name: String(record.name || base?.name || record.code),
      standard: String(record.standardText ?? base?.standard ?? ""),
      observation,
      observationLabel: describeObservationSource(observation),
      plain: plainRuleFromText(record.plainRule, base?.plain || "none"),
      passRule: String(record.passRule ?? base?.passRule ?? ""),
      labels: labels.length ? labels : base?.labels || [],
      target: record.targetText != null && String(record.targetText).trim() !== "" ? String(record.targetText) : base?.target,
      byFlute: base?.byFlute,
      targetByFlute: base?.targetByFlute,
      companyStandards: parseCompanyStandards(record.companyStandards) || base?.companyStandards,
    };
  };
  const merged = COA_PARAMETERS.flatMap((base) => {
    const record = byCode.get(base.code);
    if (!record) return [base];
    if (String(record.active ?? "Yes").toLowerCase() === "no") return [];
    return [apply(base, record)];
  });
  records.forEach((record) => {
    const code = String(record.code || record.id).trim().toUpperCase();
    if (!code || COA_PARAMETERS.some((base) => base.code === code) || String(record.active ?? "Yes").toLowerCase() === "no") return;
    merged.push(apply(undefined, record));
  });
  return merged;
}

export function parseCompanyStandards(value: unknown): Record<string, string> | undefined {
  if (!value) return undefined;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const entries = Object.entries(parsed as Record<string, unknown>).map(([id, std]) => [String(id).trim(), String(std ?? "").trim()] as const).filter(([id, std]) => id && std);
    return entries.length ? Object.fromEntries(entries) : undefined;
  } catch {
    return undefined;
  }
}

/** Standard for a job: company option, else the template's own standard, else the flute standard. */
export function coaStandardFor(parameter: CoaParameter, templateStandard: string, companyId: string, flute: string): { text: string; from: "company" | "template" | "flute" | "" } {
  const company = companyId ? parameter.companyStandards?.[companyId] : undefined;
  if (company) return { text: company, from: "company" };
  if (String(templateStandard ?? "").trim()) return { text: templateStandard, from: "template" };
  const byFlute = parameter.byFlute?.[normaliseFlute(flute)];
  return byFlute ? { text: byFlute, from: "flute" } : { text: "", from: "" };
}

/** QC target hint for a job (flute target, else the parameter target). */
export function coaTargetFor(parameter: CoaParameter, flute: string): string {
  return parameter.targetByFlute?.[normaliseFlute(flute)] || parameter.target || "";
}

/** Record to save for a parameter (id = code). */
export function coaParameterToRecord(parameter: CoaParameter, actor = "System User"): CoaParameterRecord {
  return {
    id: parameter.code, code: parameter.code, name: parameter.name, standardText: parameter.standard,
    observationSource: observationSourceToText(parameter.observation), plainRule: plainRuleToText(parameter.plain),
    passRule: parameter.passRule, labels: parameter.labels.join("|"), active: "Yes",
    targetText: parameter.target || "", companyStandards: parameter.companyStandards ? JSON.stringify(parameter.companyStandards) : "",
    updatedBy: actor, updateTimestamp: new Date().toISOString(),
  };
}

const num = (value: string) => {
  const match = String(value ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : NaN;
};

/** Numbers in an observation cell (e.g. "7.2", "5.10", "235 X 177"). */
const numbersIn = (value: string) => (String(value ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/g) || []).map(Number);

export type CoaCheckResult = "PASS" | "FAIL" | "";

/**
 * PASS / FAIL of one observation against its standard text.
 * Text rules in the standard win ("7-9%", "Maximum 3 mm", "Min. 35 mm", ">=6", "525 +-10%", "35 (+-3)");
 * a plain-number standard uses the parameter's rule (min, max, equal, ± tolerance, ± %).
 * Blank or non-numeric values give "".
 */
export function checkCoaObservation(parameter: CoaParameter | undefined, standard: string, observed: string): CoaCheckResult {
  if (!parameter) return "";
  const obsText = String(observed ?? "").trim();
  if (!obsText) return "";
  if ("check" in parameter.observation || "text" in parameter.observation) return /^NOT\s*OK$/i.test(obsText) ? "FAIL" : "";
  // "6% +-2%" means 6 ± 2 points, not ± 2 % of 6.
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

/** PASS / FAIL for dimensions given three standards and three observations (each ± tolerance). */
export function checkCoaDimensions(standards: string[], observed: string[], tolerance = 3): CoaCheckResult {
  const pairs = standards.map((value, index) => [num(value), num(observed[index] ?? "")] as const).filter(([s, o]) => Number.isFinite(s) && Number.isFinite(o));
  if (!pairs.length) return "";
  return pairs.every(([s, o]) => Math.abs(o - s) <= tolerance + 1e-9) ? "PASS" : "FAIL";
}
