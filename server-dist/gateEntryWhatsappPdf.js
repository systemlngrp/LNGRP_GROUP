import fs from "fs/promises";
import { jsPDF } from "jspdf";
const text = (value) => String(value ?? "").trim() || "-";
/** JPEG / PNG only (jsPDF in Node cannot read other image types). */
export function gateEntryPhotoFormat(data) {
    if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff)
        return "JPEG";
    if (data.length > 8 && data.subarray(1, 4).toString() === "PNG")
        return "PNG";
    return null;
}
/** Image size from the JPEG / PNG header (to keep the photo's shape in the PDF). */
function imageSize(data, format) {
    if (format === "PNG")
        return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
    let offset = 2;
    while (offset + 9 < data.length) {
        if (data[offset] !== 0xff) {
            offset += 1;
            continue;
        }
        const marker = data[offset + 1];
        const length = data.readUInt16BE(offset + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
            return { height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) };
        }
        offset += 2 + length;
    }
    return { width: 4, height: 3 };
}
/** One page of details, then the photos two per page. Returns how many photos were placed. */
export async function writeGateEntryPdf(record, photos, filePath) {
    const doc = new jsPDF("p", "mm", "a4");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("GATE ENTRY", 105, 18, { align: "center" });
    doc.setFontSize(10);
    doc.text(`Gate Entry No: ${text(record.gateEntryNo)}`, 14, 30);
    doc.text(`Date: ${text(record.date)}`, 196, 30, { align: "right" });
    const rows = [
        ["Firm", text(record.firmName)],
        ["Purpose", text(record.purpose)],
        ["Supplier", text(record.supplier)],
        ["Invoice No", text(record.invoiceNo)],
        ["Invoice Value", `Rs. ${Number(record.invoiceValue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
        ["Truck No", text(record.truckNo)],
        ["Gate Pass No", text(record.sourceGatePassNo)],
    ];
    let y = 40;
    doc.setFontSize(10);
    for (const [label, value] of rows) {
        doc.setDrawColor(0);
        doc.setLineWidth(0.2);
        const wrapped = doc.splitTextToSize(value, 120);
        const height = Math.max(8, wrapped.length * 5 + 3);
        doc.rect(14, y, 50, height);
        doc.rect(64, y, 132, height);
        doc.setFont("helvetica", "bold");
        doc.text(label, 17, y + 5.5);
        doc.setFont("helvetica", "normal");
        doc.text(wrapped, 67, y + 5.5);
        y += height;
    }
    let placed = 0;
    const usable = photos
        .map((photo) => ({ ...photo, format: gateEntryPhotoFormat(photo.data) }))
        .filter((photo) => Boolean(photo.format));
    doc.setFont("helvetica", "bold");
    doc.text(`Photos (${usable.length})`, 14, y + 10);
    // Photos: two per page, each in a 182 x 120 mm box.
    usable.forEach((photo, index) => {
        if (index % 2 === 0)
            doc.addPage();
        const boxTop = index % 2 === 0 ? 14 : 150;
        try {
            const size = imageSize(photo.data, photo.format);
            const scale = Math.min(182 / Math.max(size.width, 1), 120 / Math.max(size.height, 1));
            const width = size.width * scale;
            const height = size.height * scale;
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.text(`Photo ${photo.slotNo}`, 14, boxTop);
            doc.addImage(photo.data.toString("base64"), photo.format, 14 + (182 - width) / 2, boxTop + 3, width, height, undefined, "FAST");
            placed += 1;
        }
        catch {
            doc.text(`Photo ${photo.slotNo} could not be added.`, 14, boxTop + 10);
        }
    });
    await fs.writeFile(filePath, Buffer.from(doc.output("arraybuffer")));
    return placed;
}
