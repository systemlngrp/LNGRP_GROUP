import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { jobsMissingPrinting } from "./invoicePrintingCheck";
import { corrugationLinerQtyByJobId, jobIdsWithPrintingEntry } from "./productionProcessingProgress";

const processing: any[] = [
  { productionId: "j1", machineName: "Corrugation Liner", qty: 3000, completionStatus: "Part" },
  { productionId: "j1", machineName: "Corrugation Liner", qty: 2000, completionStatus: "Full" },
  { productionId: "j1", machineName: "Printing", qty: 1000, completionStatus: "Part" },
  { productionId: "j2", machineName: "Corrugation Liner", qty: 800 },
];

describe("loading / invoicing processing rules", () => {
  it("sums Corrugation Liner qty per job, part and full", () => {
    const totals = corrugationLinerQtyByJobId(processing);
    assert.equal(totals.get("j1"), 5000);
    assert.equal(totals.get("j2"), 800);
    assert.equal(totals.has("j3"), false);
  });

  it("lists FG jobs on the slips that have no Printing entry", () => {
    const printed = jobIdsWithPrintingEntry(processing);
    const slips: any[] = [
      { status: "Loaded", lines: [{ itemSource: "FG", allocations: [
        { sourceType: "job", jobId: "j1", jobNo: "JOB/1", qty: 100 },
        { sourceType: "job", jobId: "j2", jobNo: "JOB/2", qty: 50 },
        { sourceType: "opening_stock", sourceRef: "FG Stock", qty: 10 },
      ] }] },
      { status: "Loaded", lines: [{ itemSource: "PHP", allocations: [{ sourceType: "job", jobId: "p1", jobNo: "PHP/1", qty: 5 }] }] },
    ];
    assert.deepEqual(jobsMissingPrinting(slips, printed), ["JOB/2"]);
  });
});

import { jobsInvoicedAbovePrinted } from "./invoicePrintingCheck";
describe("invoiced vs printed quantity", () => {
  const proc: any[] = [{ productionId: "j1", machineName: "Printing", qty: 1000 }, { productionId: "j2", machineName: "Printing", qty: 500 }];
  const slip = (id: string, jobId: string, qty: number, invoiceId?: string): any => ({ id, invoiceId, status: "Loaded", lines: [{ itemSource: "FG", allocations: [{ sourceType: "job", jobId, jobNo: jobId.toUpperCase(), qty }] }] });
  it("flags a job whose already invoiced + this invoice exceeds printed", () => {
    const all = [slip("s1", "j1", 700, "inv1"), slip("s2", "j1", 400), slip("s3", "j2", 500)];
    const over = jobsInvoicedAbovePrinted([all[1], all[2]], all, proc);
    assert.deepEqual(over, [{ jobNo: "J1", printed: 1000, alreadyInvoiced: 700, thisInvoice: 400 }]);
  });
});
