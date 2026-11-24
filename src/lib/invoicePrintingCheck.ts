import type { LoadingSlip, ProductionProcessing } from "../types";
import { normalizeMachineName } from "./productionMachineNames";

// Job numbers on the selected FG loading slips whose job has no Printing entry
// in Production Processing. An invoice is not saved while any remain.
export function jobsMissingPrinting(slips: Array<Pick<LoadingSlip, "lines" | "status">>, printedJobIds: Set<string>) {
  const missing = new Set<string>();
  slips.forEach((slip) => {
    if (["cancelled", "canceled"].includes(String(slip.status || "").trim().toLowerCase())) return;
    (slip.lines || []).forEach((line: any) => {
      const source = String(line?.itemSource || "FG").trim().toUpperCase();
      if (source !== "FG") return;
      (line?.allocations || []).forEach((allocation: any) => {
        if (String(allocation?.sourceType || "").trim().toLowerCase() !== "job") return;
        if (!(Number(allocation?.qty) > 0)) return;
        const jobId = String(allocation?.jobId || "").trim();
        if (!jobId || printedJobIds.has(jobId)) return;
        missing.add(String(allocation?.jobNo || jobId).trim());
      });
    });
  });
  return Array.from(missing).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

const isCancelled = (status: unknown) => ["cancelled", "canceled"].includes(String(status || "").trim().toLowerCase());

/** FG job quantities on loading slips, per job id (job allocations only). */
function fgJobQtyOnSlips(slips: Array<Pick<LoadingSlip, "lines" | "status">>, jobNos?: Map<string, string>) {
  const totals = new Map<string, number>();
  slips.forEach((slip) => {
    if (isCancelled(slip.status)) return;
    (slip.lines || []).forEach((line: any) => {
      if (String(line?.itemSource || "FG").trim().toUpperCase() !== "FG") return;
      (line?.allocations || []).forEach((allocation: any) => {
        if (String(allocation?.sourceType || "").trim().toLowerCase() !== "job") return;
        const qty = Number(allocation?.qty) || 0;
        const jobId = String(allocation?.jobId || "").trim();
        if (!jobId || !(qty > 0)) return;
        totals.set(jobId, (totals.get(jobId) || 0) + qty);
        if (jobNos && !jobNos.has(jobId)) jobNos.set(jobId, String(allocation?.jobNo || jobId).trim());
      });
    });
  });
  return totals;
}

export type InvoiceOverPrintedJob = { jobNo: string; printed: number; alreadyInvoiced: number; thisInvoice: number };

/**
 * FG jobs whose invoiced quantity (already invoiced + this invoice) would be
 * more than the quantity printed on the job. Already invoiced = job quantity on
 * other loading slips that already carry an invoice.
 */
export function jobsInvoicedAbovePrinted(
  invoiceSlips: Array<Pick<LoadingSlip, "lines" | "status"> & { id?: string }>,
  allSlips: Array<Pick<LoadingSlip, "lines" | "status"> & { id?: string; invoiceId?: string | null }>,
  processing: Array<Pick<ProductionProcessing, "productionId" | "machineName" | "qty">>,
): InvoiceOverPrintedJob[] {
  const jobNos = new Map<string, string>();
  const thisInvoice = fgJobQtyOnSlips(invoiceSlips, jobNos);
  if (!thisInvoice.size) return [];
  const currentIds = new Set(invoiceSlips.map((slip) => String(slip.id || "")).filter(Boolean));
  const alreadyInvoiced = fgJobQtyOnSlips(allSlips.filter((slip) => String(slip.invoiceId || "").trim() && !currentIds.has(String(slip.id || ""))));
  const printed = new Map<string, number>();
  processing.forEach((entry) => {
    if (normalizeMachineName(entry.machineName) !== "Printing") return;
    const jobId = String(entry.productionId || "").trim();
    if (jobId) printed.set(jobId, (printed.get(jobId) || 0) + (Number(entry.qty) || 0));
  });
  const over: InvoiceOverPrintedJob[] = [];
  thisInvoice.forEach((qty, jobId) => {
    const printedQty = printed.get(jobId) || 0;
    const before = alreadyInvoiced.get(jobId) || 0;
    if (before + qty > printedQty + 0.0001) over.push({ jobNo: jobNos.get(jobId) || jobId, printed: printedQty, alreadyInvoiced: before, thisInvoice: qty });
  });
  return over.sort((a, b) => a.jobNo.localeCompare(b.jobNo, undefined, { numeric: true }));
}
