import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Firm, GatePass, Setting } from "../types";
import { formatDate } from "./serial";
import { getGatePassLineLabel, getGatePassPrimaryPartyName, isReturnableGatePass } from "./gatePassState";
import { renderOrganizationHeader } from "./pdfOrganizationHeader";

export async function downloadGatePassPdf({
  gatePass,
  setting,
  invoiceDisplayNo,
  destination,
  transporter,
  firms,
  recipient,
}: {
  gatePass: GatePass;
  setting?: Setting | null;
  invoiceDisplayNo?: string;
  destination?: string;
  transporter?: string;
  firms?: Firm[];
  /** Returnable passes: the receiver's details for the delivery challan. */
  recipient?: { name?: string; address?: string; gstNo?: string } | null;
}) {
  if (isReturnableGatePass(gatePass)) {
    await downloadReturnableChallanPdf({ gatePass, setting, firms, recipient });
    return;
  }
  const doc = new jsPDF("p", "mm", "a4");
  let currentY = (await renderOrganizationHeader(doc, setting, { firmId: gatePass.firmId, firms })).currentY;
  const isReturnable = isReturnableGatePass(gatePass);
  const heading = isReturnable ? "RETURNABLE GATE PASS" : "NON RETURNABLE GATE PASS";
  const resolvedInvoiceNo = isReturnable ? getGatePassPrimaryPartyName(gatePass) : invoiceDisplayNo || gatePass.invoiceNo || "-";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(heading, 105, currentY, { align: "center" });
  currentY += 9;

  const details: Array<[string, string]> = [
    ["Gate Pass No", gatePass.gatePassNo || "-"],
    ["Date", formatDate(gatePass.date)],
    [isReturnable ? "Recipient" : "Invoice No", resolvedInvoiceNo],
    [isReturnable ? "Sent By" : "Company", isReturnable ? gatePass.sentByUserName || "-" : getGatePassPrimaryPartyName(gatePass)],
    ["Truck", gatePass.truckNo || "-"],
    ["Destination", isReturnable ? "-" : destination || "-"],
    ["Total Qty", Number(gatePass.totalQty || 0).toLocaleString()],
    [
      "Total Invoice Amount",
      Number(gatePass.totalAmount || 0).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    ],
    ["Transporter", isReturnable ? "-" : transporter || "-"],
  ];

  autoTable(doc, {
    startY: currentY,
    body: [
      [details[0][0], details[0][1], details[1][0], details[1][1]],
      [details[2][0], details[2][1], details[3][0], details[3][1]],
      [details[4][0], details[4][1], details[5][0], details[5][1]],
      [details[8][0], details[8][1], details[6][0], details[6][1]],
      ["", "", details[7][0], details[7][1]],
    ],
    theme: "plain",
    styles: {
      fontSize: 8.6,
      cellPadding: { top: 1.4, right: 1.5, bottom: 1.4, left: 1.5 },
      textColor: 0,
      lineColor: 255,
      lineWidth: 0,
      overflow: "linebreak",
      valign: "middle",
    },
    columnStyles: {
      0: { cellWidth: 28, fontStyle: "bold" },
      1: { cellWidth: 54 },
      2: { cellWidth: 28, fontStyle: "bold" },
      3: { cellWidth: 58 },
    },
    didParseCell: (hookData) => {
      if ((hookData.column.index === 0 || hookData.column.index === 2) && String(hookData.cell.raw || "").trim()) {
        hookData.cell.text = [`${hookData.cell.raw || ""}:`];
      }
    },
    margin: { left: 14, right: 14 },
  });

  currentY = (doc as any).lastAutoTable.finalY + 4;

  autoTable(doc, {
    startY: currentY,
    head: [["SL", "Item Name", "Qty", "Rate", "Amount", "Loading Slip Nos"]],
    body: gatePass.lines.map((line, index) => [
      index + 1,
      getGatePassLineLabel(line),
      Number(line.qty || 0).toLocaleString(),
      Number(line.rate || 0).toFixed(2),
      Number(line.amount || 0).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      isReturnable ? "-" : (Array.isArray(line.loadingSlipNos) ? line.loadingSlipNos.join(", ") : "-"),
    ]),
    theme: "grid",
    styles: { fontSize: 8.2, cellPadding: 2.2, textColor: 0, overflow: "linebreak" },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { halign: "center", cellWidth: 12 },
      1: { cellWidth: 68 },
      2: { halign: "right", cellWidth: 20 },
      3: { halign: "right", cellWidth: 22 },
      4: { halign: "right", cellWidth: 28, fontStyle: "bold" },
      5: { cellWidth: 40 },
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Remarks:", 14, currentY);
  doc.setFont("helvetica", "normal");
  const remarks = String(gatePass.remarks || "-");
  const wrappedRemarks = doc.splitTextToSize(remarks, 168);
  doc.text(wrappedRemarks, 30, currentY);

  const safeGatePassNo = String(gatePass.gatePassNo || "GatePass").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
  doc.save(`GatePass_${safeGatePassNo}_${String(gatePass.date || "").slice(0, 10)}.pdf`);
}

const money = (value: unknown) => Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Returnable Gate Pass printed as a delivery challan (no invoice): firm and
 * receiver details with GSTIN, HSN, value, tax Nil and the purpose, in three
 * copies (Original for Consignee, Duplicate for Transporter, Triplicate for Consignor).
 */
async function downloadReturnableChallanPdf({
  gatePass,
  setting,
  firms,
  recipient,
}: {
  gatePass: GatePass;
  setting?: Setting | null;
  firms?: Firm[];
  recipient?: { name?: string; address?: string; gstNo?: string } | null;
}) {
  const doc = new jsPDF("p", "mm", "a4");
  const purpose = gatePass.purpose || "Other";
  const isJobWork = purpose === "Job Work";
  const copies = ["ORIGINAL FOR CONSIGNEE", "DUPLICATE FOR TRANSPORTER", "TRIPLICATE FOR CONSIGNOR"];
  const receiverName = recipient?.name || gatePass.recipientName || "-";
  const receiverGstin = String(recipient?.gstNo || "").trim() || "Unregistered";
  const statement = isJobWork
    ? "Goods sent for Job Work under Section 143 of the CGST Act, 2017. Not a supply - no GST charged."
    : `Goods sent on returnable basis (${purpose}). Not a supply - no GST charged.`;

  for (let copyIndex = 0; copyIndex < copies.length; copyIndex += 1) {
    if (copyIndex > 0) doc.addPage();
    let currentY = (await renderOrganizationHeader(doc, setting, { firmId: gatePass.firmId, firms })).currentY;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(copies[copyIndex], 196, 10, { align: "right" });
    doc.setFontSize(14);
    doc.text("RETURNABLE GATE PASS / DELIVERY CHALLAN", 105, currentY, { align: "center" });
    currentY += 6;
    doc.setFontSize(10);
    doc.text(`Purpose: ${isJobWork ? `Job Work${gatePass.process ? ` - ${gatePass.process}` : ""}` : purpose}`, 105, currentY, { align: "center" });
    currentY += 5;

    const rows: string[][] = [
      ["Challan / Gate Pass No", gatePass.gatePassNo || "-", "Date", formatDate(gatePass.date)],
      [isJobWork ? "Job Worker" : "Consignee", receiverName, "GSTIN", receiverGstin],
      ["Address", String(recipient?.address || "-"), "Truck", gatePass.truckNo || "-"],
      ["Sent By", gatePass.sentByUserName || "-", "Expected Return", gatePass.expectedReturnDate ? formatDate(gatePass.expectedReturnDate) : "-"],
    ];
    if (isJobWork) rows.push(["Job No", String(gatePass.jobNo || gatePass.lines?.[0]?.jobNo || "-"), "Value %", gatePass.valuePercent ? `${gatePass.valuePercent}% of order rate` : "-"]);
    autoTable(doc, {
      startY: currentY,
      body: rows,
      theme: "grid",
      styles: { fontSize: 8.4, cellPadding: 1.6, textColor: 0, overflow: "linebreak", valign: "middle" },
      columnStyles: { 0: { cellWidth: 34, fontStyle: "bold" }, 1: { cellWidth: 60 }, 2: { cellWidth: 28, fontStyle: "bold" }, 3: { cellWidth: 60 } },
      margin: { left: 14, right: 14 },
    });
    currentY = (doc as any).lastAutoTable.finalY + 4;

    const lines = gatePass.lines || [];
    autoTable(doc, {
      startY: currentY,
      head: [["SL", "Description of Goods", "HSN", "Qty", "UOM", "Value (Rs)", "GST"]],
      body: lines.map((line, index) => [
        index + 1,
        `${getGatePassLineLabel(line)}${line.erpCode ? ` (${line.erpCode})` : ""}`,
        line.hsnCode || "-",
        Number(line.qty || 0).toLocaleString("en-IN"),
        line.uom || "PCS",
        money(line.amount),
        "Nil",
      ]),
      foot: [["", "Total", "", Number(gatePass.totalQty || 0).toLocaleString("en-IN"), "", money(gatePass.totalAmount), "Nil"]],
      showFoot: "lastPage",
      theme: "grid",
      styles: { fontSize: 8.4, cellPadding: 2, textColor: 0, overflow: "linebreak" },
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [226, 232, 240], textColor: 0, fontStyle: "bold" },
      columnStyles: {
        0: { halign: "center", cellWidth: 10 },
        1: { cellWidth: 74 },
        2: { cellWidth: 20 },
        3: { halign: "right", cellWidth: 22 },
        4: { cellWidth: 14 },
        5: { halign: "right", cellWidth: 28 },
        6: { halign: "center", cellWidth: 14 },
      },
      margin: { left: 14, right: 14 },
    });
    currentY = (doc as any).lastAutoTable.finalY + 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.6);
    doc.text(doc.splitTextToSize(statement, 182), 14, currentY);
    currentY += 8;
    doc.setFont("helvetica", "normal");
    doc.text("Remarks:", 14, currentY);
    doc.text(doc.splitTextToSize(String(gatePass.remarks || "-"), 160), 30, currentY);
    currentY += 24;
    doc.text("Received by (Job Worker / Consignee)", 14, currentY);
    doc.text("For the Firm - Authorised Signatory", 196, currentY, { align: "right" });
  }

  const safeGatePassNo = String(gatePass.gatePassNo || "GatePass").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
  doc.save(`Challan_${safeGatePassNo}_${String(gatePass.date || "").slice(0, 10)}.pdf`);
}
