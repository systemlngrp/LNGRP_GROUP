import jsPDF from "jspdf";

const PDF_WIDTH_MM = 285;
const PDF_MARGIN_MM = 6;
const PDF_RENDER_WIDTH_PX = 1120;

export function traceabilityPdfFileName(jobNo: string) {
  const safeJobNo = String(jobNo || "traceability")
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "_")
    .replace(/^_+|_+$/g, "") || "traceability";
  return `Traceability_${safeJobNo}.pdf`;
}

function replaceWithText(element: Element, value: string) {
  const replacement = document.createElement("span");
  replacement.className = "traceability-pdf-static-value";
  replacement.textContent = value;
  element.replaceWith(replacement);
}

function prepareTraceabilityClone(source: HTMLElement) {
  const clone = source.cloneNode(true) as HTMLElement;
  clone.style.width = `${PDF_RENDER_WIDTH_PX}px`;
  clone.style.minWidth = `${PDF_RENDER_WIDTH_PX}px`;
  clone.style.maxWidth = "none";
  clone.style.overflow = "visible";

  clone.querySelectorAll<HTMLElement>(
    ".traceability-header-toggles, .traceability-print-controls, .traceability-lot-results, .traceability-lot-search-icon, .traceability-lot-clear",
  ).forEach((element) => element.remove());

  clone.querySelectorAll<HTMLElement>(".traceability-lot-search").forEach((element) => {
    const input = element.querySelector<HTMLInputElement>("input");
    replaceWithText(element, input?.value || "—");
  });

  clone.querySelectorAll<HTMLAnchorElement>("a").forEach((element) => {
    replaceWithText(element, element.textContent?.trim() || "—");
  });
  clone.querySelectorAll<HTMLElement>("button, input, select, textarea").forEach((element) => element.remove());
  return clone;
}

export async function downloadTraceabilityPdf(element: HTMLElement, jobNo: string): Promise<void> {
  const host = document.createElement("div");
  host.className = "traceability-pdf-render-root";
  host.style.cssText = [
    "position: fixed",
    "left: -100000px",
    "top: 0",
    `width: ${PDF_RENDER_WIDTH_PX}px`,
    "background: #fff",
    "z-index: -1",
    "pointer-events: none",
  ].join(";");
  const clone = prepareTraceabilityClone(element);
  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    await new Promise<void>((resolve, reject) => {
      try {
        pdf.html(clone, {
          x: PDF_MARGIN_MM,
          y: PDF_MARGIN_MM,
          width: PDF_WIDTH_MM,
          windowWidth: PDF_RENDER_WIDTH_PX,
          autoPaging: "slice",
          margin: PDF_MARGIN_MM,
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: "#ffffff",
            scrollX: 0,
            scrollY: 0,
          },
          callback: (completedPdf) => {
            completedPdf.save(traceabilityPdfFileName(jobNo));
            resolve();
          },
        });
      } catch (error) {
        reject(error);
      }
    });
  } finally {
    host.remove();
  }
}
