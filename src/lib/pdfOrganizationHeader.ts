import type jsPDF from "jspdf";
import type { Firm, Setting } from "../types";
import { getOrganizationLogoUrl, loadPdfLogo } from "./pdfLogo";

export type OrganizationHeaderOptions = {
  startY?: number;
  requireAnyContent?: boolean;
  drawDivider?: boolean;
  dividerStartX?: number;
  dividerEndX?: number;
  firm?: Firm | null;
  firmId?: string;
  firms?: Firm[];
};

function getActiveFirmId() {
  try { return String(JSON.parse(window.localStorage.getItem("activeFirm") || "{}").id || ""); } catch { return ""; }
}

function getCachedFirms(): Firm[] {
  try {
    const rows = JSON.parse(window.localStorage.getItem("udc_firms") || "[]");
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}

export function resolvePdfFirm(options: Pick<OrganizationHeaderOptions, "firm" | "firmId" | "firms"> = {}) {
  if (options.firm?.id) return options.firm;
  const firms = options.firms?.length ? options.firms : getCachedFirms();
  const id = String(options.firmId || getActiveFirmId() || "");
  const resolvedFirm = firms.find((firm) => firm.id === id) || null;
  if (!resolvedFirm) throw new Error("Select a firm before generating this PDF.");
  return resolvedFirm;
}

export async function renderOrganizationHeader(
  doc: jsPDF,
  setting?: Setting | null,
  {
    startY = 16,
    requireAnyContent = false,
    drawDivider = true,
    dividerStartX = 14,
    dividerEndX = 196,
    firm,
    firmId,
    firms,
  }: OrganizationHeaderOptions = {}
) {
  let currentY = startY;

  const resolvedFirm = resolvePdfFirm({ firm, firmId, firms });
  const organizationName = resolvedFirm.firmName?.trim() || "";
  const organizationAddress = resolvedFirm.address?.trim() || "";
  const organizationGstDetails = resolvedFirm.gstDetails?.trim() || "";
  const organizationLogoUrl = getOrganizationLogoUrl(setting);

  const hasAnyContent = Boolean(organizationLogoUrl || organizationName || organizationAddress || organizationGstDetails);
  if (requireAnyContent && !hasAnyContent) {
    return { currentY: startY, hasAnyContent: false };
  }

  if (organizationLogoUrl) {
    try {
      const imageDataUrl = await loadPdfLogo(setting);
      const props = doc.getImageProperties(imageDataUrl);
      const imageFormat = imageDataUrl.match(/^data:image\/([^;]+)/i)?.[1]?.toUpperCase() || "PNG";
      
      // Target width 32mm (~90px), height auto
      const targetWidth = 32;
      const targetHeight = (props.height * targetWidth) / props.width;
      const x = 105 - (targetWidth / 2);

      // Ensure white background behind the logo
      doc.setFillColor(255, 255, 255);
      doc.rect(x, currentY, targetWidth, targetHeight, "F");
      
      // Add image with transparency support (PNG)
      doc.addImage(imageDataUrl, imageFormat as "PNG" | "JPEG" | "WEBP", x, currentY, targetWidth, targetHeight, undefined, "FAST");
      currentY += targetHeight + 5;
    } catch (error) {
      console.warn("[PDF] Organization logo could not be loaded from the deployed uploads path:", organizationLogoUrl, error);
    }
  }

  if (organizationName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(organizationName, 105, currentY, { align: "center" });
    currentY += 7;
  }

  if (organizationAddress) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(organizationAddress, 160);
    doc.text(lines, 105, currentY, { align: "center" });
    currentY += lines.length * 5;
  }

  if (organizationGstDetails) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(organizationGstDetails, 160);
    doc.text(lines, 105, currentY, { align: "center" });
    currentY += lines.length * 5;
  }

  if (drawDivider) {
    currentY += 4;
    doc.setDrawColor(0);
    doc.line(dividerStartX, currentY, dividerEndX, currentY);
    currentY += 8;
  }

  return { currentY, hasAnyContent };
}
