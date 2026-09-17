import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDate } from "./serial";
import { MaterialIn, Material, Item, Service, Supplier, Setting, Company, Firm, MaterialInPackingSlip } from "../types";
import { renderOrganizationHeader } from "./pdfOrganizationHeader";

function formatMoney(value: number) {
  return `Rs ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatQty(value: number) {
  return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatRate(value: number) {
  return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDisplayDate(value?: string) {
  return value ? formatDate(value) : "-";
}

function getPageSize(doc: jsPDF) {
  return {
    width: doc.internal.pageSize.getWidth(),
    height: doc.internal.pageSize.getHeight(),
  };
}

export async function downloadMaterialInPdf({
  mrr,
  materials,
  npdItems,
  services,
  suppliers,
  companies,
  setting,
  firms,
  packingSlips = [],
}: {
  mrr: MaterialIn;
  materials: Material[];
  npdItems: Item[];
  services?: Service[];
  suppliers: Supplier[];
  companies?: Company[];
  setting?: Setting | null;
  firms?: Firm[];
  packingSlips?: MaterialInPackingSlip[];
}) {
  const doc = new jsPDF("p", "mm", "a4");
  const pageSize = getPageSize(doc);
  const margin = { left: 10, right: 10, top: 10, bottom: 14 };
  const printableWidth = pageSize.width - margin.left - margin.right;
  let currentY = (await renderOrganizationHeader(doc, setting, { firmId: mrr.firmId, firms })).currentY;

  doc.setFillColor(43, 63, 100);
  doc.roundedRect(margin.left, currentY, printableWidth, 9, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(255);
  doc.text("MATERIAL RECEIPT / INVOICE", pageSize.width / 2, currentY + 6.1, { align: "center" });
  doc.setTextColor(0);
  currentY += 13;

  const supplier = suppliers.find((s) => s.id === mrr.supplierId);
  const company = companies?.find((entry) => entry.id === mrr.supplierId);
  const supplierLabel = supplier?.name || company?.name || mrr.supplierId;
  const hasIgst = Number(mrr.totalIgst || 0) > 0;
  const hasCgstOrSgst = Number(mrr.totalCgst || 0) > 0 || Number(mrr.totalSgst || 0) > 0;

  const metadataRows: Array<[string, string, string, string]> = [
    ["Supplier / Customer", supplierLabel, "Invoice No.", mrr.invoiceNo || "-"],
    ["Invoice Date", formatDisplayDate(mrr.invDate), "MRR No.", mrr.transactionNo],
    ["MRR Date", formatDisplayDate(mrr.date), "Gate Entry No.", mrr.gateEntryNo || "-"],
    ["Currency", mrr.invoiceCurrency || "INR", "Status", mrr.status || "-"],
  ];
  if (mrr.invoiceCurrency === "USD") {
    metadataRows.push(["Exchange Rate", Number(mrr.exchangeRate || 0).toFixed(4), "MRR Type", mrr.mrrType || "Others"]);
  } else {
    metadataRows.push(["MRR Type", mrr.mrrType || "Others", "", ""]);
  }

  autoTable(doc, {
    startY: currentY,
    body: metadataRows,
    theme: "grid",
    styles: {
      fontSize: 7.7,
      cellPadding: { top: 1.8, right: 2, bottom: 1.8, left: 2 },
      textColor: [25, 35, 55],
      lineColor: [190, 198, 210],
      lineWidth: 0.15,
      valign: "middle",
      overflow: "linebreak",
    },
    margin,
    columnStyles: {
      0: { cellWidth: 28, fontStyle: "bold", fillColor: [234, 239, 247], textColor: [43, 63, 100] },
      1: { cellWidth: 67 },
      2: { cellWidth: 28, fontStyle: "bold", fillColor: [234, 239, 247], textColor: [43, 63, 100] },
      3: { cellWidth: printableWidth - 123 },
    },
  });

  currentY = ((doc as any).lastAutoTable?.finalY || currentY) + 8;

  const lineTableHead = ["SL", "Item Description", "UOM", "Invoice Qty", "Rate", "GST %", "Line Amount"];

  const lineTableRows = mrr.lines.map((line, index) => {
    const itemName =
      line.itemName ||
      line.serviceName ||
      services?.find((service) => service.id === line.itemId)?.name ||
      materials.find((material) => material.id === line.itemId)?.name ||
      npdItems.find((item) => item.id === line.itemId)?.name ||
      "Unknown";

    const material = materials.find((entry) => entry.id === line.itemId);
    const erpCode = material?.erpCode ? `ERP: ${material.erpCode}` : "";
    const poReference = line.poNo ? `PO: ${line.poNo}` : "";
    const supportingDetails = [erpCode, poReference].filter(Boolean).join("  |  ");
    const description = [
      line.sourceGatePassItemDescription ? `${itemName} (${line.sourceGatePassItemDescription})` : itemName,
      supportingDetails,
    ].filter(Boolean).join("\n");
    const lineAmount = Number(line.totalAmount || (Number(line.invoiceValue || 0) + Number(line.cgst || 0) + Number(line.sgst || 0) + Number(line.igst || 0)));

    return [
      index + 1,
      description,
      line.uom || "-",
      formatQty(Number(line.invoiceQty || 0)),
      formatRate(Number(line.invoiceRate || line.rate || 0)),
      formatRate(Number(line.gstRate || 0)),
      formatMoney(lineAmount),
    ];
  });

  const columnStyles: Record<number, any> = {
    0: { halign: "center", cellWidth: 8 },
    1: { cellWidth: printableWidth - 8 - 14 - 21 - 24 - 14 - 31 },
    2: { halign: "center", cellWidth: 14 },
    3: { halign: "right", cellWidth: 21 },
    4: { halign: "right", cellWidth: 24 },
    5: { halign: "right", cellWidth: 14 },
    6: { halign: "right", cellWidth: 31 },
  };

  autoTable(doc, {
    startY: currentY,
    head: [lineTableHead],
    body: lineTableRows,
    theme: "grid",
    headStyles: { fillColor: [43, 63, 100], textColor: 255, fontStyle: "bold", fontSize: 7.2, cellPadding: 1.8 },
    bodyStyles: { lineColor: [170, 170, 170], lineWidth: 0.15 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    styles: { fontSize: 7.6, cellPadding: 1.8, textColor: [25, 35, 55], valign: "middle", overflow: "linebreak" },
    columnStyles,
    margin,
  });

  let footerY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : currentY + 40;

  const reconciliationRows = mrr.lines.flatMap((line) => {
    const invoiceQty = Number(line.invoiceQty || 0);
    const actualQty = Number(line.actualQty || line.qty || 0);
    const invoiceValue = Number(line.invoiceValue || 0);
    const actualValue = Number(line.actualValue || line.value || 0);
    if (Math.abs(invoiceQty - actualQty) < 0.005 && Math.abs(invoiceValue - actualValue) < 0.005) return [];

    const material = materials.find((entry) => entry.id === line.itemId);
    const itemName = line.itemName || line.serviceName || material?.name || npdItems.find((item) => item.id === line.itemId)?.name || "Unknown";
    return [[itemName, formatQty(invoiceQty), formatQty(actualQty), formatMoney(invoiceValue), formatMoney(actualValue)]];
  });

  if (reconciliationRows.length > 0) {
    if (footerY + 18 > pageSize.height - margin.bottom) {
      doc.addPage();
      footerY = margin.top;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(43, 63, 100);
    doc.text("RECEIPT RECONCILIATION", margin.left, footerY);
    doc.setTextColor(0);
    footerY += 3;
    autoTable(doc, {
      startY: footerY,
      head: [["Item", "Invoice Qty", "Actual Qty", "Invoice Value", "Actual Value"]],
      body: reconciliationRows,
      theme: "grid",
      headStyles: { fillColor: [234, 239, 247], textColor: [43, 63, 100], fontStyle: "bold", fontSize: 7.2, cellPadding: 1.5 },
      bodyStyles: { lineColor: [180, 188, 200], lineWidth: 0.15 },
      styles: { fontSize: 7.2, cellPadding: 1.5, textColor: [25, 35, 55], overflow: "linebreak" },
      columnStyles: {
        0: { cellWidth: printableWidth - 20 - 20 - 30 - 30 },
        1: { halign: "right", cellWidth: 20 },
        2: { halign: "right", cellWidth: 20 },
        3: { halign: "right", cellWidth: 30 },
        4: { halign: "right", cellWidth: 30 },
      },
      margin,
    });
    footerY = ((doc as any).lastAutoTable?.finalY || footerY) + 8;
  }

  const materialById = new Map(materials.map((material) => [material.id, material]));
  const lineById = new Map(mrr.lines.map((line) => [line.id, line]));
  const reelRows = packingSlips
    .filter((slip) => slip.materialInId === mrr.id && slip.ourReelNo)
    .sort((left, right) => left.ourReelNo.localeCompare(right.ourReelNo, undefined, { numeric: true, sensitivity: "base" }))
    .map((slip, index) => {
      const line = lineById.get(slip.materialLineId);
      const material = materialById.get(slip.materialId);
      const itemName = line?.itemName || material?.name || npdItems.find((item) => item.id === slip.materialId)?.name || "Unknown";
      const erpCode = material?.erpCode || "-";
      return [index + 1, slip.ourReelNo, `${itemName}\nERP: ${erpCode}`, formatQty(Number(slip.weightKg || 0))];
    });

  if (reelRows.length > 0) {
    if (footerY + 18 > pageSize.height - margin.bottom) {
      doc.addPage();
      footerY = margin.top;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(43, 63, 100);
    doc.text("OUR REEL NUMBER DETAILS", margin.left, footerY);
    doc.setTextColor(0);
    footerY += 4;

    autoTable(doc, {
      startY: footerY,
      head: [["SL", "Our Reel Number", "Material / ERP Code", "Weight (KG)"]],
      body: reelRows,
      theme: "grid",
      headStyles: { fillColor: [43, 63, 100], textColor: 255, fontStyle: "bold", fontSize: 8, cellPadding: 2 },
      bodyStyles: { lineColor: [180, 188, 200], lineWidth: 0.15 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { fontSize: 8.5, cellPadding: 2, textColor: [25, 35, 55], valign: "middle", overflow: "linebreak" },
      columnStyles: {
        0: { halign: "center", cellWidth: 12 },
        1: { halign: "center", cellWidth: 44, fontStyle: "bold" },
        2: { cellWidth: printableWidth - 12 - 44 - 32 },
        3: { halign: "right", cellWidth: 32 },
      },
      margin,
    });
    footerY = ((doc as any).lastAutoTable?.finalY || footerY) + 10;
  }

  const summaryRows: Array<[string, string]> = [
    ["Invoice Subtotal", formatMoney(Number(mrr.totalInvoiceValue || 0))],
  ];
  if (hasCgstOrSgst) {
    if (Number(mrr.totalCgst || 0) !== 0) summaryRows.push(["CGST", formatMoney(Number(mrr.totalCgst || 0))]);
    if (Number(mrr.totalSgst || 0) !== 0) summaryRows.push(["SGST", formatMoney(Number(mrr.totalSgst || 0))]);
  }
  if (hasIgst) {
    summaryRows.push(["IGST", formatMoney(Number(mrr.totalIgst || 0))]);
  }
  if (Number(mrr.insurance || 0) !== 0) summaryRows.push(["Insurance", formatMoney(Number(mrr.insurance || 0))]);
  if (Number(mrr.otherCharges || 0) !== 0) summaryRows.push(["Other Charges", formatMoney(Number(mrr.otherCharges || 0))]);
  if (Number(mrr.expenseCGST || 0) !== 0) summaryRows.push(["Expense CGST", formatMoney(Number(mrr.expenseCGST || 0))]);
  if (Number(mrr.expenseSGST || 0) !== 0) summaryRows.push(["Expense SGST", formatMoney(Number(mrr.expenseSGST || 0))]);
  if (Number(mrr.expenseIGST || 0) !== 0) summaryRows.push(["Expense IGST", formatMoney(Number(mrr.expenseIGST || 0))]);
  if (Number(mrr.roundOff || 0) !== 0) summaryRows.push(["Round Off", formatMoney(Number(mrr.roundOff || 0))]);

  const summaryBoxWidth = 84;
  const summaryBoxHeight = 14 + summaryRows.length * 5.5 + 10;
  if (footerY + summaryBoxHeight + 18 > pageSize.height - margin.bottom) {
    doc.addPage();
    footerY = margin.top;
  }
  const summaryBoxX = pageSize.width - margin.right - summaryBoxWidth;
  const summaryBoxY = footerY;

  doc.setDrawColor(43, 63, 100);
  doc.setLineWidth(0.25);
  doc.roundedRect(summaryBoxX, summaryBoxY, summaryBoxWidth, summaryBoxHeight, 2, 2);
  doc.setFillColor(234, 239, 247);
  doc.roundedRect(summaryBoxX, summaryBoxY, summaryBoxWidth, 10, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(43, 63, 100);
  doc.text("INVOICE SUMMARY", summaryBoxX + 4, summaryBoxY + 6.5);
  doc.setTextColor(0);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.3);
  summaryRows.forEach(([label, value], index) => {
    const y = summaryBoxY + 14 + index * 5.5;
    doc.text(`${label}:`, summaryBoxX + 4, y);
    doc.text(value, summaryBoxX + summaryBoxWidth - 4, y, { align: "right" });
  });

  const totalY = summaryBoxY + 14 + summaryRows.length * 5.5 + 2;
  doc.line(summaryBoxX + 4, totalY - 2, summaryBoxX + summaryBoxWidth - 4, totalY - 2);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text("GRAND TOTAL:", summaryBoxX + 4, totalY + 4);
  doc.text(formatMoney(Number(mrr.totalAmount || 0)), summaryBoxX + summaryBoxWidth - 4, totalY + 4, { align: "right" });
  footerY = summaryBoxY + summaryBoxHeight + 8;

  if (mrr.plant_head_remark || mrr.accounts_remark || mrr.md_approval_remark) {
    const remarks: Array<[string, string]> = [];
    if (mrr.plant_head_remark) remarks.push(["PH", mrr.plant_head_remark]);
    if (mrr.accounts_remark) remarks.push(["Accounts", mrr.accounts_remark]);
    if (mrr.md_approval_remark) remarks.push(["MD", mrr.md_approval_remark]);

    doc.setFontSize(9);
    const remarkLines = remarks.flatMap(([label, value]) => doc.splitTextToSize(`${label}: ${value}`, printableWidth));
    const remarkBlockHeight = 6 + remarkLines.length * 5;
    if (footerY + remarkBlockHeight > pageSize.height - margin.bottom) {
      doc.addPage();
      footerY = margin.top;
    }

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Approval Remarks:", margin.left, footerY);
    footerY += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    remarks.forEach(([label, value]) => {
      const lines = doc.splitTextToSize(`${label}: ${value}`, printableWidth);
      lines.forEach((line: string) => {
        if (footerY + 5 > pageSize.height - margin.bottom) {
          doc.addPage();
          footerY = margin.top;
        }
        doc.text(line, margin.left, footerY);
        footerY += 5;
      });
    });
  }

  if (footerY + 8 > pageSize.height - margin.bottom) {
    doc.addPage();
    footerY = margin.top;
  }

  const generatedText = `Generated on ${formatDisplayDate(new Date().toISOString())}`;
  const pageCount = doc.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber);
    doc.setFontSize(8);
    doc.setTextColor(80);
    doc.text(`Page ${pageNumber} of ${pageCount}`, pageSize.width - margin.right, pageSize.height - 7, { align: "right" });
    if (pageNumber === pageCount) doc.text(generatedText, margin.left, pageSize.height - 7);
  }

  doc.save(`MRR_${mrr.transactionNo}.pdf`);
}
