import fs from "fs/promises";
import { jsPDF } from "jspdf";
const text = (value) => String(value ?? "").trim() || "-";
const rows = (value) => {
    if (Array.isArray(value))
        return value;
    if (typeof value !== "string")
        return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
};
function drawRows(doc, startY, values) {
    let y = startY;
    doc.setFontSize(9);
    values.forEach(([label, value]) => {
        doc.setFont("helvetica", "bold");
        doc.text(label, 16, y);
        doc.setFont("helvetica", "normal");
        const wrapped = doc.splitTextToSize(value, 145);
        doc.text(wrapped, 58, y);
        y += Math.max(6, wrapped.length * 4.5);
    });
    return y;
}
export async function writeLoadingSlipPdf(record, filePath) {
    const doc = new jsPDF("p", "mm", "a4");
    const lines = rows(record.lines);
    const packing = rows(record.packingDetails);
    const totalQty = lines.reduce((sum, line) => sum + Number(line?.loadedQty || 0), 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("LOADING SLIP", 105, 18, { align: "center" });
    doc.setFontSize(9);
    doc.text(`Slip No: ${text(record.slipNo)}`, 14, 28);
    doc.text(`Date: ${text(record.date)}`, 14, 34);
    let currentY = drawRows(doc, 44, [
        ["Customer", text(record.companyName)],
        ["Item", text(record.itemName)],
        ["ERP Code", text(record.erpCode)],
        ["Truck No", text(record.truckNo)],
        ["Loading Source", text(record.loadingSource)],
        ["Total Quantity", totalQty.toLocaleString()],
    ]) + 6;
    doc.setFont("helvetica", "bold");
    doc.text("Loading Details", 16, currentY);
    currentY += 7;
    doc.setFont("helvetica", "normal");
    lines.forEach((line, index) => {
        const jobs = rows(line?.allocations).map((allocation) => allocation?.jobNo).filter(Boolean).join(", ") || "-";
        doc.text(`${index + 1}. Plan ${text(line?.dispatchPlanId)} | Job ${jobs} | Qty ${Number(line?.loadedQty || 0).toLocaleString()}`, 18, currentY);
        currentY += 5;
    });
    if (!lines.length) {
        doc.text("No loading lines", 18, currentY);
        currentY += 5;
    }
    currentY += 5;
    doc.setFont("helvetica", "bold");
    doc.text("Packing Details", 16, currentY);
    currentY += 7;
    doc.setFont("helvetica", "normal");
    packing.forEach((row) => {
        doc.text(`${text(row?.description || "Box")} | Bundles ${text(row?.bundles)} | Pack Size ${text(row?.packSize)} | Qty ${text(row?.quantity)}`, 18, currentY);
        currentY += 5;
    });
    if (!packing.length)
        doc.text("No packing details", 18, currentY);
    await fs.writeFile(filePath, Buffer.from(doc.output("arraybuffer")));
}
