import fs from "fs/promises";
import path from "path";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
const text = (value) => String(value ?? "").trim() || "-";
const parseRows = (value) => {
    if (Array.isArray(value))
        return value;
    try {
        const parsed = JSON.parse(String(value || "[]"));
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
};
function safeFilePart(value) {
    return String(value ?? "mrr").replace(/[^a-zA-Z0-9_-]/g, "_");
}
function addSummary(doc, title, mrr, lines, pageSize) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(title, doc.internal.pageSize.getWidth() / 2, 18, { align: "center" });
    doc.setFontSize(9);
    const values = [
        ["MRR No.", text(mrr.transactionNo)], ["Date", text(mrr.date)], ["Invoice No.", text(mrr.invoiceNo)],
        ["Invoice Date", text(mrr.invDate)], ["MRR Type", text(mrr.mrrType)], ["Supplier", text(mrr.supplierName)], ["Page", pageSize],
    ];
    let y = 32;
    for (const [label, value] of values) {
        doc.setFont("helvetica", "bold");
        doc.text(label, 16, y);
        doc.setFont("helvetica", "normal");
        doc.text(value, 58, y);
        y += 6;
    }
    doc.setFont("helvetica", "bold");
    doc.text("Material Lines", 16, y + 4);
    y += 12;
    doc.setFont("helvetica", "normal");
    lines.forEach((line, index) => {
        const name = text(line?.itemName || line?.materialName || line?.itemId);
        const qty = text(line?.qty ?? line?.invoiceQty ?? line?.actualQty);
        doc.text(`${index + 1}. ${name} | Qty: ${qty} | UOM: ${text(line?.uom)}`, 18, y);
        y += 5;
        if (y > doc.internal.pageSize.getHeight() - 18) {
            doc.addPage();
            y = 18;
        }
    });
}
async function drawReelLabel(doc, mrr, row, paperSize) {
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    const margin = paperSize === "A3" ? 12 : 10;
    const cardW = width - margin * 2;
    const cardH = height - margin * 2;
    const centerX = width / 2;
    const value = (v) => text(v);
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.rect(margin, margin, cardW, cardH);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(paperSize === "A3" ? 22 : 18);
    doc.text(value(mrr.firmName || "LAXMI NARAYAN GROUP"), centerX, margin + 16, { align: "center" });
    doc.setFontSize(paperSize === "A3" ? 16 : 13);
    doc.text("QC REEL LABEL", centerX, margin + 27, { align: "center" });
    const detailY = margin + 40;
    const colW = cardW / 3;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(paperSize === "A3" ? 13 : 10);
    doc.text(`Doc: ${value(mrr.transactionNo)}`, margin + 8, detailY);
    doc.text(`Date: ${value(mrr.date)}`, margin + colW + 8, detailY);
    doc.text(`Code: ${value(row.materialCode)}`, margin + colW * 2 + 8, detailY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(paperSize === "A3" ? 20 : 15);
    doc.text(value(mrr.supplierName), centerX, detailY + 16, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(paperSize === "A3" ? 15 : 11);
    doc.text(`Size: ${value(row.sizeCm)} CM  X  GSM: ${value(row.gsm)}  X  BF: ${value(row.bf)}`, centerX, detailY + 27, { align: "center" });
    const gridY = detailY + 42;
    doc.setFontSize(paperSize === "A3" ? 17 : 12);
    doc.text(`GSM: ${value(row.gsm)}`, margin + 12, gridY);
    doc.text(`R/No.: ${value(row.ourReelNo)}`, margin + cardW / 2, gridY);
    doc.text(`Weight: ${Number(row.weightKg || 0).toFixed(2)} KG`, margin + 12, gridY + 12);
    doc.text(`Supp-Reel: ${value(row.supplierReelNo)}`, margin + cardW / 2, gridY + 12);
    const qrTop = gridY + 22;
    const qrSize = Math.min(cardW - 24, cardH - (qrTop - margin) - 22);
    try {
        const payload = JSON.stringify({
            source: "MRR",
            mrrNo: mrr.transactionNo,
            date: mrr.date,
            reelNo: row.ourReelNo,
            supplierReelNo: row.supplierReelNo,
            weightKg: Number(row.weightKg || 0),
            materialCode: row.materialCode,
        });
        const qr = await QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1, width: 1000 });
        doc.addImage(qr, "PNG", centerX - qrSize / 2, qrTop, qrSize, qrSize, undefined, "FAST");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(paperSize === "A3" ? 12 : 9);
        doc.text("Scan for Reel", centerX, Math.min(height - margin - 5, qrTop + qrSize + 8), { align: "center" });
    }
    catch {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("QR Not Available", centerX, qrTop + qrSize / 2, { align: "center" });
    }
}
async function writePdf(doc, filePath) {
    await fs.writeFile(filePath, Buffer.from(doc.output("arraybuffer")));
}
async function writeReelLabelsPdf(mrr, rows, uploadsDir, paperSize) {
    const filename = `mrr-${safeFilePart(mrr.id)}-reel-labels-${paperSize.toLowerCase()}.pdf`;
    const doc = new jsPDF("p", "mm", paperSize.toLowerCase());
    const validRows = rows
        .filter((row) => String(row.ourReelNo || "").trim() && Number(row.weightKg || 0) > 0)
        .sort((a, b) => String(a.ourReelNo).localeCompare(String(b.ourReelNo), undefined, { numeric: true, sensitivity: "base" }));
    if (validRows.length !== rows.length) {
        console.warn(`[WHATSAPP] Skipped ${rows.length - validRows.length} invalid reel label row(s) for ${mrr.transactionNo || mrr.id}.`);
    }
    for (let index = 0; index < validRows.length; index += 1) {
        if (index > 0)
            doc.addPage();
        await drawReelLabel(doc, mrr, validRows[index], paperSize);
    }
    await writePdf(doc, path.join(uploadsDir, filename));
    return filename;
}
export async function writeMrrWhatsappPdfs(mrr, packingSlips, uploadsDir) {
    await fs.mkdir(uploadsDir, { recursive: true });
    const base = `mrr-${safeFilePart(mrr.id)}`;
    const standardFilename = `${base}-mrr-a4.pdf`;
    const standardDoc = new jsPDF("p", "mm", "a4");
    addSummary(standardDoc, "MATERIAL RECEIPT / INVOICE", mrr, parseRows(mrr.lines), "A4");
    await writePdf(standardDoc, path.join(uploadsDir, standardFilename));
    const filenames = [standardFilename];
    if (String(mrr.mrrType || "").trim() === "Reel") {
        const validRows = packingSlips.filter((row) => String(row.ourReelNo || "").trim() && Number(row.weightKg || 0) > 0);
        if (validRows.length > 0) {
            filenames.push(await writeReelLabelsPdf(mrr, validRows, uploadsDir, "A4"));
            filenames.push(await writeReelLabelsPdf(mrr, validRows, uploadsDir, "A3"));
        }
    }
    return filenames;
}
