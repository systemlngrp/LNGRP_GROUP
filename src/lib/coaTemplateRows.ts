import type { CoaTemplateCell, CoaTemplateLayout, CoaTemplateRow } from "../types";
import { coaParameterForLabel, type CoaParameter } from "./coaParameters";
import { coaParameterRowParts } from "./coa";
import { coaSheetTemplates } from "./coaSheetTemplates";

// Builds a COA template parameter row from a COA Parameter Master entry, so Template Master
// can "Add Parameter" instead of typing each row. The row follows the template's own
// columns (header row: SL / PARAMETERS / STANDARD / OBSERVATION / REMARK). When a sheet
// template with the same columns already has this parameter, that row is copied (keeps its
// standard source, e.g. item.csStandard, and its 1 or 3 observation boxes).

type ColumnKind = "sl" | "label" | "std" | "obs" | "remark" | "other";
type Column = { kind: ColumnKind; span: number };

const text = (value: unknown) => String(value ?? "").trim();

function headerRow(layout: CoaTemplateLayout): CoaTemplateRow | undefined {
  return (layout.parameterRows || []).find((row) => row.cells.some((cell) => cell.kind === "static" && /OBSERVATION|TEST RESULT/i.test(text(cell.label))));
}

/** Columns of a template, read from its header row. Empty when it has no header. */
export function coaTemplateColumns(layout: CoaTemplateLayout): Column[] {
  const header = headerRow(layout);
  if (!header) return [];
  return header.cells.map((cell) => {
    const label = text(cell.label).toUpperCase();
    const kind: ColumnKind = /OBSERVATION|TEST RESULT/.test(label) ? "obs"
      : /STANDARD|SPECIFICATION/.test(label) ? "std"
      : /REMARK/.test(label) ? "remark"
      : /PARAMETER/.test(label) ? "label"
      : /^(SL|S\.?\s*NO|SR|#)/.test(label) ? "sl" : "other";
    return { kind, span: Math.max(1, cell.colSpan || 1) };
  });
}

const signature = (columns: Column[]) => columns.map((column) => `${column.kind}:${column.span}`).join("|");

/** Template label for a parameter: its first row name in the master, else its name in capitals. */
export function coaParameterRowLabel(parameter: CoaParameter) {
  return text(parameter.labels?.[0]) || text(parameter.name).toUpperCase();
}

/** A copy of the row with fresh cell ids (auto rules that point at cells of the same row follow). */
function cloneRow(row: CoaTemplateRow, stamp: string): CoaTemplateRow {
  const idMap = new Map(row.cells.map((cell, index) => [cell.id, `c-${stamp}-${index}`]));
  return {
    id: `row-${stamp}`,
    cells: row.cells.map((cell) => {
      const next: CoaTemplateCell = JSON.parse(JSON.stringify(cell));
      next.id = idMap.get(cell.id) || `c-${stamp}-x`;
      const auto = (next as any).auto;
      if (auto && typeof auto === "object" && auto.from && idMap.has(auto.from)) auto.from = idMap.get(auto.from);
      return next;
    }),
  };
}

/** Sheet-template rows of each parameter, with the columns of the template they come from. */
function sheetRowsFor(parameter: CoaParameter, parameters: CoaParameter[]) {
  const found: Array<{ row: CoaTemplateRow; columns: string; std: CoaTemplateCell[] }> = [];
  Object.values(coaSheetTemplates()).forEach((layout) => {
    const columns = signature(coaTemplateColumns(layout));
    coaParameterRowParts(layout).forEach((parts) => {
      if (coaParameterForLabel(parts.label, parameters)?.code === parameter.code) found.push({ row: parts.row, columns, std: parts.std });
    });
  });
  return found;
}

/**
 * New parameter row for `layout`. `standardText` (from the "+" form) is used as the standard's
 * default value; otherwise the standard source of the same parameter on a sheet template is
 * used, and if there is none the standard stays blank (company / flute standard fills it on
 * the COA Form).
 */
export function buildCoaParameterRow(layout: CoaTemplateLayout, parameter: CoaParameter, parameters: CoaParameter[], options: { standardText?: string; stamp?: string } = {}): CoaTemplateRow {
  const stamp = options.stamp || `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const label = coaParameterRowLabel(parameter);
  const slNo = String(coaParameterRowParts(layout).length + 1);
  const columns = coaTemplateColumns(layout);
  const samples = sheetRowsFor(parameter, parameters);

  // Same columns as a sheet template that has this parameter: copy that row.
  const same = !options.standardText ? samples.find((sample) => sample.columns === signature(columns)) : undefined;
  if (same && columns.length) {
    const row = cloneRow(same.row, stamp);
    const parts = columns;
    let col = 0;
    row.cells.forEach((cell) => {
      const kind = parts.find((_, index) => parts.slice(0, index).reduce((sum, c) => sum + c.span, 0) <= col && col < parts.slice(0, index + 1).reduce((sum, c) => sum + c.span, 0))?.kind;
      if (kind === "sl" && cell.kind === "static") cell.label = slNo;
      if (kind === "label" && cell.kind === "static") cell.label = label;
      col += Math.max(1, cell.colSpan || 1);
    });
    return row;
  }

  // Otherwise build it from the header columns.
  const sampleStd = samples[0]?.std?.[0];
  const cols: Column[] = columns.length ? columns : [{ kind: "sl", span: 1 }, { kind: "label", span: 2 }, { kind: "std", span: 2 }, { kind: "obs", span: 1 }];
  // Box size in one box each: standard "L X B X H" from the job, observation from the PDI.
  const isDims = parameter.code === "DIM_ID" || parameter.code === "DIM_OD";
  const oneStd = cols.filter((column) => column.kind === "std").length === 1;
  const oneObs = cols.filter((column) => column.kind === "obs").length === 1;
  let obsDone = false;
  const cells: CoaTemplateCell[] = cols.map((column, index): CoaTemplateCell => {
    const id = `c-${stamp}-${index}`;
    if (column.kind === "sl") return { id, label: slNo, kind: "static", align: "center", bold: true, colSpan: column.span };
    if (column.kind === "label") return { id, label, kind: "static", bold: true, italic: true, colSpan: column.span };
    if (column.kind === "std") {
      const standard = text(options.standardText);
      if (standard) return { id, label: "", kind: "input", inputType: "text", defaultValue: standard, colSpan: column.span };
      if (isDims && oneStd) return { id, label: "", kind: "input", inputType: "text", binding: parameter.code === "DIM_OD" ? "item.boxSizeOd" : "production.boxSizeX", colSpan: column.span };
      if (sampleStd?.binding) return { id, label: "", kind: "input", inputType: "text", binding: sampleStd.binding, colSpan: column.span };
      return { id, label: "", kind: "input", inputType: "text", defaultValue: text(sampleStd?.defaultValue), colSpan: column.span };
    }
    if (column.kind === "obs" && isDims && oneObs && !obsDone) {
      obsDone = true;
      return { id, label: "", kind: "input", inputType: "text", binding: "pdi.boxSize", colSpan: column.span };
    }
    return { id, label: "", kind: "input", inputType: "text", colSpan: column.span };
  });
  return { id: `row-${stamp}`, cells };
}

/** Code for a new parameter from its name: capitals, digits and _ only (e.g. "Ink Rub Test" -> INK_RUB_TEST). */
export function coaParameterCodeFromName(name: string, taken: Set<string>) {
  const base = text(name).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30) || "PARAM";
  let code = base;
  for (let n = 2; taken.has(code); n += 1) code = `${base}_${n}`;
  return code;
}
