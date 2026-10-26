import fs from "fs/promises";
import path from "path";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
const text = (value) => String(value ?? "").trim() || "-";
const safe = (value) => String(value ?? "").replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "") || "return";
export async function writeReelReturnWhatsappPdf(returnRecord, rows, uploadsDir) {
    await fs.mkdir(uploadsDir, { recursive: true });
    const filename = `reel-return-${safe(returnRecord.id)}.pdf`;
    const doc = new jsPDF("p", "mm", "a4");
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        if (index > 0)
            doc.addPage();
        doc.setFont("helvetica", "bold");
        doc.setFontSize(18);
        doc.text("REEL RETURN", width / 2, 18, { align: "center" });
        doc.setFontSize(10);
        doc.text(`Return No.: ${text(returnRecord.returnNo)}`, 15, 32);
        doc.text(`Date: ${text(returnRecord.date)}`, 15, 39);
        doc.text(`Job No.: ${text(returnRecord.jobNo || row.jobNo)}`, 15, 46);
        doc.text(`Reel No.: ${text(row.ourReelNo)}`, 15, 53);
        doc.text(`Weight: ${text(row.weightKg)} KG`, 15, 60);
        doc.text(`Material: ${text(row.materialName)}`, 15, 67);
        doc.text(`Material Code: ${text(row.materialCode)}`, 15, 74);
        doc.text(`Specs: ${text(row.specs)}`, 15, 81);
        doc.setFont("helvetica", "normal");
        doc.text(`Remarks: ${text(returnRecord.remarks)}`, 15, 92);
        try {
            const payload = JSON.stringify({ source: "RETURN", returnNo: returnRecord.returnNo, date: returnRecord.date, jobNo: returnRecord.jobNo || row.jobNo, reelNo: row.ourReelNo, weight: Number(row.weightKg || 0) });
            const qr = await QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1, width: 900 });
            const qrSize = Math.min(width - 30, height - 115);
            doc.addImage(qr, "PNG", (width - qrSize) / 2, 105, qrSize, qrSize, undefined, "FAST");
            doc.setFontSize(10);
            doc.text("Scan for Return Reel", width / 2, Math.min(height - 10, 105 + qrSize + 8), { align: "center" });
        }
        catch {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text("QR Not Available", width / 2, height / 2, { align: "center" });
        }
    }
    await fs.writeFile(path.join(uploadsDir, filename), Buffer.from(doc.output("arraybuffer")));
    return filename;
}
