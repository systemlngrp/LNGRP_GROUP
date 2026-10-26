import fs from "fs/promises";
import path from "path";
import { jsPDF } from "jspdf";
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
async function writePdf(doc, filePath) {
    await fs.writeFile(filePath, Buffer.from(doc.output("arraybuffer")));
}
export async function writeMrrWhatsappPdfs(mrr, packingSlips, uploadsDir) {
    await fs.mkdir(uploadsDir, { recursive: true });
    const base = `mrr-${String(mrr.id).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    const standardFilename = `${base}-mrr-a4.pdf`;
    const standardDoc = new jsPDF("p", "mm", "a4");
    addSummary(standardDoc, "MATERIAL RECEIPT / INVOICE", mrr, parseRows(mrr.lines), "A4");
    await writePdf(standardDoc, path.join(uploadsDir, standardFilename));
    const filenames = [standardFilename];
    if (String(mrr.mrrType || "").trim() === "Reel") {
        for (const paperSize of ["A4", "A3"]) {
            const filename = `${base}-reel-labels-${paperSize.toLowerCase()}.pdf`;
            const doc = new jsPDF("p", "mm", paperSize.toLowerCase());
            addSummary(doc, `REEL LABELS (${paperSize})`, mrr, packingSlips.map((row) => ({ itemName: row.materialName, qty: row.weightKg, uom: "KG", ...row })), paperSize);
            await writePdf(doc, path.join(uploadsDir, filename));
            filenames.push(filename);
        }
    }
    return filenames;
}
