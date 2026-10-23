import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const PDF_MARGIN_MM = 6;
const PDF_RENDER_WIDTH_PX = 1120;

export type TraceabilityPdfSlice = {
  sourceY: number;
  sourceHeight: number;
};

export function traceabilityPdfFileName(jobNo: string) {
  const safeJobNo = String(jobNo || "traceability")
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "_")
    .replace(/^_+|_+$/g, "") || "traceability";
  return `Traceability_${safeJobNo}.pdf`;
}

export function calculateTraceabilityPdfSlices(
  canvasWidth: number,
  canvasHeight: number,
  pageWidthMm: number,
  pageHeightMm: number,
): TraceabilityPdfSlice[] {
  if (!Number.isFinite(canvasWidth) || !Number.isFinite(canvasHeight) || canvasWidth <= 0 || canvasHeight <= 0) return [];
  if (!Number.isFinite(pageWidthMm) || !Number.isFinite(pageHeightMm) || pageWidthMm <= 0 || pageHeightMm <= 0) return [];

  const sourcePageHeight = Math.max(1, Math.floor((canvasWidth * pageHeightMm) / pageWidthMm));
  const slices: TraceabilityPdfSlice[] = [];
  for (let sourceY = 0; sourceY < canvasHeight;) {
    const sourceHeight = Math.min(sourcePageHeight, canvasHeight - sourceY);
    if (sourceHeight <= 0) break;
    slices.push({ sourceY, sourceHeight });
    sourceY += sourceHeight;
  }
  return slices;
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
  clone.style.height = "auto";
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

async function waitForCloneResources(clone: HTMLElement) {
  if (typeof document.fonts?.ready?.then === "function") await document.fonts.ready;
  const images = Array.from(clone.querySelectorAll<HTMLImageElement>("img"));
  await Promise.all(images.map((image) => {
    if (image.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    });
  }));
}

function createCanvasSlice(source: HTMLCanvasElement, slice: TraceabilityPdfSlice) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = slice.sourceHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create a PDF canvas slice.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, slice.sourceY, source.width, slice.sourceHeight, 0, 0, source.width, slice.sourceHeight);
  return canvas;
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
    await waitForCloneResources(clone);
    const renderWidth = Math.max(PDF_RENDER_WIDTH_PX, clone.scrollWidth);
    const renderHeight = Math.max(1, clone.scrollHeight);
    const canvas = await html2canvas(clone, {
      backgroundColor: "#ffffff",
      height: renderHeight,
      logging: false,
      scale: 2,
      useCORS: true,
      width: renderWidth,
      windowHeight: renderHeight,
      windowWidth: renderWidth,
      scrollX: 0,
      scrollY: 0,
    });

    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth() - (PDF_MARGIN_MM * 2);
    const pageHeight = pdf.internal.pageSize.getHeight() - (PDF_MARGIN_MM * 2);
    const slices = calculateTraceabilityPdfSlices(canvas.width, canvas.height, pageWidth, pageHeight);
    if (!slices.length) throw new Error("The traceability sheet produced no printable content.");

    slices.forEach((slice, index) => {
      if (index > 0) pdf.addPage();
      const sliceCanvas = createCanvasSlice(canvas, slice);
      const imageHeight = (slice.sourceHeight * pageWidth) / canvas.width;
      pdf.addImage(sliceCanvas.toDataURL("image/png"), "PNG", PDF_MARGIN_MM, PDF_MARGIN_MM, pageWidth, imageHeight, undefined, "FAST");
    });
    pdf.save(traceabilityPdfFileName(jobNo));
  } finally {
    host.remove();
  }
}
