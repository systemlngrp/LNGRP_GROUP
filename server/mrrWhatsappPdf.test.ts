import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { writeMrrWhatsappPdfs } from "./mrrWhatsappPdf.js";

const mrr = {
  id: "mrr-test-1",
  transactionNo: "MI-001",
  date: "2026-10-26",
  invoiceNo: "INV-1",
  mrrType: "Reel",
  supplierName: "Supplier One",
  firmName: "LAXMI NARAYAN GROUP",
  lines: JSON.stringify([{ itemName: "Test Reel", qty: 100, uom: "KG" }]),
};

describe("MRR WhatsApp PDFs", () => {
  it("creates the MRR A4 and QC Reel Labels A4/A3 attachments", async () => {
    const uploadsDir = await mkdtemp(path.join(os.tmpdir(), "mrr-whatsapp-"));
    try {
      const filenames = await writeMrrWhatsappPdfs(mrr, [{
        ourReelNo: "R-2",
        supplierReelNo: "S-2",
        weightKg: 12.5,
        materialName: "Test Reel",
        materialCode: "MAT-1",
        sizeCm: 120,
        gsm: 140,
        bf: 18,
      }, {
        ourReelNo: "R-1",
        supplierReelNo: "S-1",
        weightKg: 10,
        materialName: "Test Reel",
        materialCode: "MAT-1",
        sizeCm: 120,
        gsm: 140,
        bf: 18,
      }], uploadsDir);

      assert.deepEqual(filenames, [
        "mrr-mrr-test-1-mrr-a4.pdf",
        "mrr-mrr-test-1-reel-labels-a4.pdf",
        "mrr-mrr-test-1-reel-labels-a3.pdf",
      ]);
      for (const filename of filenames) {
        const pdf = await readFile(path.join(uploadsDir, filename));
        assert.ok(pdf.length > 1000, `${filename} should contain PDF content`);
        assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
      }
    } finally {
      await rm(uploadsDir, { recursive: true, force: true });
    }
  });

  it("keeps non-Reel MRRs limited to the standard PDF", async () => {
    const uploadsDir = await mkdtemp(path.join(os.tmpdir(), "mrr-whatsapp-"));
    try {
      const filenames = await writeMrrWhatsappPdfs({ ...mrr, mrrType: "Others" }, [], uploadsDir);
      assert.deepEqual(filenames, ["mrr-mrr-test-1-mrr-a4.pdf"]);
    } finally {
      await rm(uploadsDir, { recursive: true, force: true });
    }
  });
});
