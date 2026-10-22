import type { CoaRecord, CoaTemplateCell, CoaTemplateRow } from "../types";

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char] || char));
const cellValue = (record: CoaRecord, cell: CoaTemplateCell) => {
  if (cell.kind === "static") return cell.label || "";
  return record.cellValues?.[cell.id]?.value || (cell.defaultValue || "");
};

function renderRows(record: CoaRecord, rows: CoaTemplateRow[]) {
  return rows.map((row) => `<tr>${row.cells.map((cell) => {
    const styles = [
      cell.background ? `background:${cell.background}` : "",
      cell.color ? `color:${cell.color}` : "",
      cell.bold ? "font-weight:700" : "",
      cell.italic ? "font-style:italic" : "",
      cell.align ? `text-align:${cell.align}` : "text-align:center",
    ].filter(Boolean).join(";");
    return `<td colspan="${Math.max(1, cell.colSpan || 1)}" rowspan="${Math.max(1, cell.rowSpan || 1)}" style="${styles}">${escapeHtml(cellValue(record, cell))}${cell.unit ? ` ${escapeHtml(cell.unit)}` : ""}</td>`;
  }).join("")}</tr>`).join("");
}

export function buildCoaPrintHtml(record: CoaRecord, issuer: { name?: string; address?: string; logo?: string } = {}) {
  const layout = record.templateSnapshot;
  const logo = layout.logoEnabled && issuer.logo ? `<img class="logo" src="${escapeHtml(issuer.logo)}" alt="Logo">` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(record.coaNo || "COA")}</title><style>
    @page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#111;background:#fff}.sheet{max-width:190mm;margin:auto}.brand{display:flex;align-items:center;justify-content:center;gap:12px;border:1px solid #111;padding:7px;text-align:center}.brand .logo{max-width:28mm;max-height:18mm;object-fit:contain}.brand-title{flex:1;font-size:18px;font-weight:800}.subtitle{text-align:center;border:1px solid #111;border-top:0;padding:5px;font-weight:800}.issuer{text-align:center;font-size:10px;padding:3px}table{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:6px}td{border:1px solid #111;padding:5px;min-height:20px;vertical-align:middle;white-space:pre-wrap;overflow-wrap:anywhere;font-size:10px}.footer{margin-top:8px}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  </style></head><body><main class="sheet"><div class="brand">${logo}<div class="brand-title">${escapeHtml(issuer.name || record.firmName || "")}</div></div><div class="subtitle">${escapeHtml(layout.title || "CERTIFICATE OF ANALYSIS (COA)")}</div>${layout.subtitle ? `<div class="issuer">${escapeHtml(layout.subtitle)}</div>` : ""}<table>${renderRows(record, layout.metadataRows || [])}</table><table>${renderRows(record, layout.parameterRows || [])}</table><table class="footer">${renderRows(record, layout.footerRows || [])}</table></main></body></html>`;
}

export function printCoaRecord(record: CoaRecord, issuer?: { name?: string; address?: string; logo?: string }) {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(buildCoaPrintHtml(record, issuer));
  win.document.close();
  win.focus();
  window.setTimeout(() => win.print(), 150);
  return true;
}
