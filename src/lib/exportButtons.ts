// Export buttons (PDF / Excel) across the app are shown as one download icon:
// red for PDF, green for Excel. The page's own button keeps working; only its
// look changes (index.css, [data-export]). On phones the page-level ones are
// also shown in the top bar after the page name (see MobileTopBar.tsx).

export type ExportKind = "pdf" | "excel";

const PDF_TEXT = /^(export\s+|download\s+)?pdf(\s+export|\s+download)?$/i;
const EXCEL_TEXT = /^(export\s+|download\s+)?(excel|xlsx|xls)(\s+export|\s+download)?$/i;

function buttonText(button: HTMLElement) {
  return (button.textContent || "").replace(/\s+/g, " ").trim();
}

export function exportKindOf(button: HTMLElement): ExportKind | null {
  const text = buttonText(button);
  if (PDF_TEXT.test(text)) return "pdf";
  if (EXCEL_TEXT.test(text)) return "excel";
  return null;
}

// Marks every export button inside the page with data-export="pdf|excel".
export function markExportButtons(content: HTMLElement) {
  content.querySelectorAll<HTMLElement>("button, a").forEach((button) => {
    const kind = button.dataset.export as ExportKind | undefined;
    const next = exportKindOf(button) || (kind && !buttonText(button) ? kind : null);
    if (next) {
      if (kind !== next) button.dataset.export = next;
      const label = next === "pdf" ? "Download PDF" : "Download Excel";
      if (!button.getAttribute("title")) button.setAttribute("title", label);
      if (!button.getAttribute("aria-label")) button.setAttribute("aria-label", label);
    } else if (kind) {
      delete button.dataset.export;
    }
  });
}

// Page-level export buttons: not inside a table row or a pop-up.
export function pageExportButtons(content: HTMLElement) {
  return Array.from(content.querySelectorAll<HTMLElement>("[data-export]")).filter(
    (button) => !button.closest('table, [role="dialog"], .fixed') && !(button as HTMLButtonElement).disabled,
  );
}
