import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDate } from "./serial";
import { Firm, Indent, IndentLine, Material, Setting } from "../types";
import { renderOrganizationHeader } from "./pdfOrganizationHeader";

export async function downloadIndentPdf({
  indent,
  lines,
  materials,
  setting,
  firms = [],
}: {
  indent: Indent;
  lines: IndentLine[];
  materials: Material[];
  setting?: Setting | null;
  firms?: Firm[];
}) {
  const doc = new jsPDF("p", "mm", "a4");
  let currentY = (await renderOrganizationHeader(doc, setting)).currentY;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("PURCHASE REQUISITION", 105, currentY, { align: "center" });
  currentY += 10;

  doc.setFontSize(10);
  const drawMeta = (label: string, value: string, x: number, y: number) => {
    const labelText = `${label}:`;
    doc.setFont("helvetica", "bold");
    doc.text(labelText, x, y);
    const labelWidth = doc.getTextWidth(`${labelText} `);
    doc.setFont("helvetica", "normal");
    doc.text(value || "-", x + labelWidth, y);
  };
  const resolvedFirmName = String(indent.firmName || firms.find((firm) => firm.id === indent.firmId)?.firmName || "Firm unavailable").trim();
  const detailRows = [
    ["Indent No", indent.indentNo || "-"],
    ["Requested By", indent.requestedBy],
    ["Requisition Date", formatDate(indent.requisitionDate)],
    ["Indent Type", indent.indentType],
    ["Firm", resolvedFirmName],
    ["Status", indent.status],
    ["Required Date", formatDate(indent.requiredDate)],
  ];

  detailRows.forEach(([label, value], index) => {
    const columnX = index % 2 === 0 ? 14 : 110;
    const rowY = currentY + Math.floor(index / 2) * 8;
    drawMeta(label, String(value || "-"), columnX, rowY);
  });
  const totals = lines.reduce((acc, line) => ({
    totalIndentQty: acc.totalIndentQty + Number(line.qty || 0),
    totalBalanceQty: acc.totalBalanceQty + Number(line.balanceQty ?? Math.max(0, Number(line.qty || 0) - Number(line.orderedQty || 0) - Number(line.cancelledQty || 0))),
  }), { totalIndentQty: 0, totalBalanceQty: 0 });
  currentY += 32;
  drawMeta("Total Indent Qty", totals.totalIndentQty.toLocaleString(), 14, currentY);
  drawMeta("Balance Qty", totals.totalBalanceQty.toLocaleString(), 110, currentY);
  currentY += 8;

  const lineTableRows = lines.map((line, index) => {
    const material = materials.find((row) => row.id === line.materialId);
    return [
      index + 1,
      line.erpCode || "",
      material?.name || "Unknown Material",
      line.uom || material?.uom || "",
      Number(line.qty || 0).toLocaleString(),
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [["SL", "ERP", "Material Name", "Unit", "Quantity"]],
    body: lineTableRows,
    theme: "grid",
    headStyles: { fillColor: [79, 70, 229] },
    styles: { fontSize: 9, cellPadding: 2.5, textColor: 0 },
    columnStyles: {
      0: { halign: "center", cellWidth: 14 },
      1: { cellWidth: 28 },
      2: { cellWidth: 92 },
      3: { halign: "center", cellWidth: 20 },
      4: { halign: "right", cellWidth: 28 },
    },
  });

  let footerY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 10 : currentY + 40;
  if (indent.rejectedRemarks) {
    doc.setFont("helvetica", "bold");
    doc.text("Rejected Remarks:", 14, footerY);
    doc.setFont("helvetica", "normal");
    const remarkLines = doc.splitTextToSize(indent.rejectedRemarks, 175);
    doc.text(remarkLines, 14, footerY + 5);
    footerY += remarkLines.length * 5 + 8;
    drawMeta("Rejected By", indent.rejectedBy || "-", 14, footerY);
    drawMeta("Rejected Date", indent.rejectedTimestamp ? formatDate(indent.rejectedTimestamp) : "-", 110, footerY);
    footerY += 8;
  }

  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text(`Generated on ${formatDate(new Date().toISOString())}`, 14, Math.min(footerY, 285));

  const safeIndentNo = String(indent.indentNo || "").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
  const safeSuffix =
    safeIndentNo ||
    indent.requestedBy.trim().replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") ||
    "Indent";
  doc.save(`Purchase_Requisition_${safeSuffix}_${indent.requisitionDate}.pdf`);
}
