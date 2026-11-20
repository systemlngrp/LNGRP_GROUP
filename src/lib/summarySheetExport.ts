// Summary Sheet / Dashboard downloads (Excel and PDF) of the rows and columns on
// screen: filters, search and sort applied, every row (not only the ones drawn).

export type ExportSection = { label: string; columns: string[] };

export type SummaryExportInput = {
  /** "Summary Sheet" (Admin) or "Dashboard" (users). */
  title: string;
  /** File name part, e.g. "01-11-2026_to_30-11-2026". */
  fileLabel: string;
  /** Lines under the title (date range, filters used). */
  subtitle: string[];
  /** Shown columns in order (without "Sl No"; a serial is added). */
  columns: string[];
  sections: ExportSection[];
  rowCount: number;
  /** Text as shown on screen for row index / column. */
  displayValue: (rowIndex: number, column: string) => string;
  /** Number value for Excel and totals (null = not a number). */
  numericValue: (rowIndex: number, column: string) => number | null;
  /** Tailwind classes of the cell on screen (its colours are copied). */
  cellClass: (rowIndex: number, column: string) => string;
  /** Columns that get a TOTAL. */
  totalColumns: Set<string>;
  /** Number columns (right aligned). */
  numericColumns: Set<string>;
};

// Columns never repeated when the PDF is split into section pages.
const KEY_COLUMNS = ["Job No.", "Date", "Party Name"];

/** "bg-[#00ffff] text-white font-bold" -> colours as hex (no "#"). */
export function cellColours(className: string) {
  const fill = className.match(/bg-\[#([0-9a-fA-F]{6})\]/)?.[1];
  const textHex = className.match(/text-\[#([0-9a-fA-F]{6})\]/)?.[1];
  const text = textHex || (/\btext-white\b/.test(className) ? "FFFFFF" : undefined);
  return { fill: fill?.toUpperCase(), text: text?.toUpperCase(), bold: /\bfont-(bold|black)\b/.test(className) };
}

const hexToRgb = (hex: string): [number, number, number] => [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
const totalText = (value: number) => (Number.isInteger(Math.round(value * 100) / 100) ? String(Math.round(value)) : (Math.round(value * 100) / 100).toFixed(2));
const totalsOf = (input: SummaryExportInput) => {
  const totals = new Map<string, number>();
  input.columns.forEach((column) => {
    if (!input.totalColumns.has(column)) return;
    let sum = 0;
    for (let index = 0; index < input.rowCount; index += 1) sum += input.numericValue(index, column) || 0;
    totals.set(column, sum);
  });
  return totals;
};

export async function downloadSummaryExcel(input: SummaryExportInput) {
  const xlsxModule: any = await import("xlsx-js-style");
  const XLSX = xlsxModule.utils ? xlsxModule : xlsxModule.default;
  const headers = ["Sl No", ...input.columns];
  const lastCol = headers.length - 1;
  const totals = totalsOf(input);
  // Row 1: title, row 2: filters, row 3: section names, row 4: column names.
  const sectionRow: string[] = ["", ...input.columns.map(() => "")];
  const merges: any[] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } }, { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } }];
  let col = 1;
  input.sections.forEach((section) => {
    if (!section.columns.length) return;
    sectionRow[col] = section.label;
    if (section.columns.length > 1) merges.push({ s: { r: 2, c: col }, e: { r: 2, c: col + section.columns.length - 1 } });
    col += section.columns.length;
  });
  const body: (string | number)[][] = [];
  for (let index = 0; index < input.rowCount; index += 1) {
    body.push([index + 1, ...input.columns.map((column) => {
      const number = input.numericColumns.has(column) ? input.numericValue(index, column) : null;
      return number !== null && Number.isFinite(number) && input.displayValue(index, column) !== "" ? number : input.displayValue(index, column);
    })]);
  }
  const totalRow: (string | number)[] = ["TOTAL", ...input.columns.map((column) => (totals.has(column) ? Math.round((totals.get(column) || 0) * 100) / 100 : ""))];
  const aoa = [[input.title], [input.subtitle.join("   |   ")], sectionRow, headers, ...body, totalRow];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = merges;
  ws["!freeze"] = { xSplit: 0, ySplit: 4 };
  ws["!cols"] = headers.map((header) => ({ wch: /Name|Remarks|Complaint/.test(header) ? 32 : header === "Sl No" ? 6 : Math.max(9, Math.min(16, header.length + 2)) }));
  const thin = { style: "thin", color: { rgb: "000000" } };
  const border = { top: thin, bottom: thin, left: thin, right: thin };
  const style = (opts: { bold?: boolean; fill?: string; color?: string; align?: string; size?: number; wrap?: boolean }) => ({
    font: { name: "Arial", sz: opts.size || 9, bold: Boolean(opts.bold), color: { rgb: opts.color || "000000" } },
    alignment: { horizontal: opts.align || "left", vertical: "center", wrapText: opts.wrap !== false },
    border,
    ...(opts.fill ? { fill: { patternType: "solid", fgColor: { rgb: opts.fill } } } : {}),
  });
  const set = (r: number, c: number, s: any) => {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (!ws[ref]) ws[ref] = { t: "s", v: "" };
    ws[ref].s = s;
  };
  set(0, 0, { font: { name: "Arial", sz: 14, bold: true }, alignment: { horizontal: "center" } });
  set(1, 0, { font: { name: "Arial", sz: 9, bold: true }, alignment: { horizontal: "center" } });
  for (let c = 0; c <= lastCol; c += 1) {
    set(2, c, style({ bold: true, fill: "24165F", color: "FFFFFF", align: "center" }));
    set(3, c, style({ bold: true, fill: "0B4773", color: "FFFFFF", align: "center" }));
  }
  for (let index = 0; index < input.rowCount; index += 1) {
    set(4 + index, 0, style({ align: "center" }));
    input.columns.forEach((column, c) => {
      const colours = cellColours(input.cellClass(index, column));
      set(4 + index, c + 1, style({ bold: colours.bold, fill: colours.fill, color: colours.text, align: input.numericColumns.has(column) ? "right" : "left" }));
    });
  }
  for (let c = 0; c <= lastCol; c += 1) set(4 + input.rowCount, c, style({ bold: true, fill: "EAF2F8", align: c === 0 ? "left" : "right" }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, input.title.slice(0, 31));
  XLSX.writeFile(wb, `${input.title.replace(/\s+/g, "_")}_${input.fileLabel}.xlsx`);
}

/** Up to this many columns the PDF is one table; more are split into section pages. */
const SINGLE_TABLE_MAX_COLUMNS = 15;

export async function downloadSummaryPdf(input: SummaryExportInput) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const totals = totalsOf(input);
  // One table, or one per section with Job No. / Date / Party Name repeated.
  const keyColumns = KEY_COLUMNS.filter((column) => input.columns.includes(column));
  const parts: ExportSection[] = input.columns.length <= SINGLE_TABLE_MAX_COLUMNS
    ? [{ label: "", columns: input.columns }]
    : input.sections
      .map((section) => ({ label: section.label, columns: [...keyColumns.filter((column) => !section.columns.includes(column)), ...section.columns] }))
      .filter((section) => section.columns.some((column) => !keyColumns.includes(column)));

  parts.forEach((part, partIndex) => {
    if (partIndex > 0) doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(input.title + (part.label ? ` – ${part.label}` : ""), pageWidth / 2, 12, { align: "center" });
    doc.setFontSize(8);
    doc.text(input.subtitle.join("   |   "), pageWidth / 2, 17, { align: "center", maxWidth: pageWidth - 20 });
    const body: string[][] = [];
    for (let index = 0; index < input.rowCount; index += 1) body.push([String(index + 1), ...part.columns.map((column) => input.displayValue(index, column))]);
    const foot = [["TOTAL", ...part.columns.map((column) => (totals.has(column) ? totalText(totals.get(column) || 0) : ""))]];
    autoTable(doc, {
      head: [["Sl No", ...part.columns]],
      body,
      foot: totals.size && part.columns.some((column) => totals.has(column)) ? foot : undefined,
      startY: 21,
      margin: { left: 6, right: 6 },
      theme: "grid",
      showFoot: "lastPage",
      styles: { font: "helvetica", fontSize: part.columns.length > 25 ? 5 : 6.5, cellPadding: 0.8, valign: "middle", textColor: 0, lineColor: 0, lineWidth: 0.1, overflow: "linebreak" },
      headStyles: { fillColor: [11, 71, 115], textColor: 255, fontStyle: "bold", halign: "center" },
      footStyles: { fillColor: [234, 242, 248], textColor: 0, fontStyle: "bold", halign: "right" },
      columnStyles: { 0: { cellWidth: 9, halign: "center" } },
      didParseCell: (data) => {
        const column = part.columns[data.column.index - 1];
        if (!column) return;
        if (input.numericColumns.has(column)) data.cell.styles.halign = "right";
        if (data.section !== "body") return;
        const colours = cellColours(input.cellClass(data.row.index, column));
        if (colours.fill) data.cell.styles.fillColor = hexToRgb(colours.fill);
        if (colours.text) data.cell.styles.textColor = hexToRgb(colours.text);
        if (colours.bold) data.cell.styles.fontStyle = "bold";
      },
      didDrawPage: () => {
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - 8, doc.internal.pageSize.getHeight() - 4, { align: "right" });
      },
    });
  });
  doc.save(`${input.title.replace(/\s+/g, "_")}_${input.fileLabel}.pdf`);
}
