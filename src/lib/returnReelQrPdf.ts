import jsPDF from "jspdf";
import QRCode from "qrcode";
import type { Firm, Setting } from "../types";
import { resolvePdfFirm } from "./pdfOrganizationHeader";
import { loadPdfLogo } from "./pdfLogo";
import { formatDate as formatDisplayDate } from "./utils";

type ReturnReelQrPdfArgs = {
  returnNo: string;
  date: string;
  jobNo?: string;
  materialName?: string;
  materialCode?: string | number;
  specs?: string;
  reelNo: string;
  weight: number;
  setting?: Setting | null;
  firmId?: string;
  firms?: Firm[];
};

function safeFileName(value: string) {
  return String(value || "Return_Reel_QR")
    .replace(/[^a-z0-9_-]+/gi, "_")
    .replace(/^_+|_+$/g, "") || "Return_Reel_QR";
}

function firstNonEmpty(...values: Array<string | number | undefined | null>) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "-";
}

function toUpper(value: string | number | undefined | null) {
  return firstNonEmpty(value).toUpperCase();
}

const formatDate = formatDisplayDate;

function formatWeight(value: number) {
  return Number(value || 0).toFixed(2);
}

function clipSingleLine(doc: jsPDF, value: string | number | undefined | null, maxWidth: number) {
  const text = firstNonEmpty(value);
  if (doc.getTextWidth(text) <= maxWidth) return text;
  const ellipsis = "...";
  let out = text;
  while (out.length > 1 && doc.getTextWidth(`${out}${ellipsis}`) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}${ellipsis}`;
}

export async function downloadReturnReelQrPdf({
  returnNo,
  date,
  jobNo,
  materialName,
  materialCode,
  specs,
  reelNo,
  weight,
  setting = null,
  firmId,
  firms = [],
}: ReturnReelQrPdfArgs) {
  // 250 x 300 px label page (about 66 x 79 mm), same size and style as the MRR reel label.
  const PX = 25.4 / 96;
  const LABEL_SCALE = 1;
  const U = PX * LABEL_SCALE; // one design px of the 250 px layout, in mm
  const LABEL_PAGE: [number, number] = [250 * PX, 300 * PX];
  const doc = new jsPDF({ orientation: "p", unit: "mm", format: LABEL_PAGE });

  let logoDataUrl = "";
  if (setting?.organizationLogo) {
    try {
      logoDataUrl = await loadPdfLogo(setting);
    } catch (error) {
      console.warn("Unable to load logo for return reel QR PDF", error);
    }
  }

  const organizationName = firstNonEmpty(resolvePdfFirm({ firmId, firms })?.firmName, "LAXMI NARAYAN GROUP");
  const qrPayload = JSON.stringify({
    source: "RETURN",
    returnNo,
    date,
    jobNo: jobNo || "",
    reelNo,
    weight: Number(weight || 0),
    materialName: materialName || "",
    materialCode: materialCode || "",
    specs: specs || "",
  });

  const [pageW, pageH] = LABEL_PAGE;
  const margin = 11 * U;
  const pad = 8 * U;
  const cardX = margin;
  const cardY = margin;
  const cardW = pageW - margin * 2;
  const cardH = pageH - margin * 2;
  const x0 = cardX + pad;
  const innerW = cardW - pad * 2;
  const pt = (px: number) => px * 0.75 * LABEL_SCALE; // design px -> font points
  const lineMm = (fontPx: number, ratio = 1.2) => fontPx * U * ratio;

  doc.setDrawColor(0);
  doc.setTextColor(0);
  doc.setLineWidth(0.2);
  doc.rect(cardX, cardY, cardW, cardH);

  // Header: logo + organisation name, with a RETURN badge on the right.
  let y = cardY + pad;
  const logoW = 50 * U;
  const logoH = logoW * 0.53;
  if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", x0, y, logoW, logoH, undefined, "FAST");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(pt(8));
  const badgeText = "RETURN";
  const badgeW = doc.getTextWidth(badgeText) + 8 * U;
  const badgeH = 12 * U;
  const headH = Math.max(logoDataUrl ? logoH : 0, lineMm(12));
  const badgeX = x0 + innerW - badgeW;
  const badgeY = y + (headH - badgeH) / 2;
  doc.setLineWidth(0.3);
  doc.rect(badgeX, badgeY, badgeW, badgeH);
  doc.text(badgeText, badgeX + badgeW / 2, badgeY + badgeH / 2 + pt(8) * 0.3528 * 0.35, { align: "center" });
  doc.setLineWidth(0.2);
  const nameX = x0 + (logoDataUrl ? logoW + 8 * U : 0);
  const nameW = badgeX - 4 * U - nameX;
  const groupName = toUpper(organizationName);
  let nameSize = pt(12);
  doc.setFontSize(nameSize);
  while (nameSize > 5 && doc.getTextWidth(groupName) > nameW) { nameSize -= 0.25; doc.setFontSize(nameSize); }
  doc.text(groupName, nameX, y + headH / 2 + nameSize * 0.3528 * 0.35);
  y += headH + 6 * U;

  // Return no. on its own line, then Date (left) and Code (right), 8 px.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(pt(8));
  y += lineMm(8, 0.9);
  doc.text(clipSingleLine(doc, `Return: ${firstNonEmpty(returnNo)}`, innerW), x0, y);
  y += lineMm(8, 1.25);
  doc.text(`Date: ${formatDate(date)}`, x0, y);
  doc.text(clipSingleLine(doc, `Code: ${firstNonEmpty(materialCode)}`, innerW / 2), x0 + innerW, y, { align: "right" });
  y += 2 * U;

  // Material (9 px bold) and specs (9 px).
  doc.setFont("helvetica", "bold");
  doc.setFontSize(pt(9));
  const materialLines = doc.splitTextToSize(toUpper(materialName), innerW).slice(0, 2);
  y += 4 * U + lineMm(9, 0.8);
  doc.text(materialLines, x0, y);
  y += (materialLines.length - 1) * lineMm(9, 1.15) + lineMm(9, 1.15);
  doc.setFont("helvetica", "normal");
  doc.text(clipSingleLine(doc, specs, innerW), x0, y);
  y += 8 * U;

  // Job across the full width, then R/NO. and Weight (10 px) left with the QR box on the right.
  doc.setFontSize(pt(10));
  y += lineMm(10, 0.85);
  doc.text(clipSingleLine(doc, `Job: ${firstNonEmpty(jobNo)}`, innerW), x0, y);
  y += 6 * U;
  const detailTop = y;
  const qrBox = Math.max(90 * U, Math.min(innerW * 0.55, cardY + cardH - pad - detailTop));
  const qrBoxX = x0 + innerW - qrBox;
  const detailW = qrBoxX - x0 - 2 * U;
  [
    `R/NO.: ${firstNonEmpty(reelNo)}`,
    `Weight.: ${formatWeight(Number(weight || 0))}`,
  ].forEach((text, i) => {
    doc.text(clipSingleLine(doc, text, detailW), x0, detailTop + lineMm(10, 0.85) + i * lineMm(10, 1.25));
  });

  doc.rect(qrBoxX, detailTop, qrBox, qrBox);
  try {
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { errorCorrectionLevel: "M", margin: 1, width: 600, color: { dark: "#000000", light: "#ffffff" } });
    const qrSize = qrBox - 4 * U;
    doc.addImage(qrDataUrl, "PNG", qrBoxX + (qrBox - qrSize) / 2, detailTop + (qrBox - qrSize) / 2, qrSize, qrSize, undefined, "FAST");
  } catch (error) {
    console.warn("Return reel QR generation failed", error);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(pt(8));
    doc.setTextColor(176, 0, 32);
    doc.text("QR Not Available", qrBoxX + qrBox / 2, detailTop + qrBox / 2, { align: "center" });
    doc.setTextColor(0);
  }

  doc.save(`${safeFileName(`${reelNo}_return`)}.pdf`);
}
