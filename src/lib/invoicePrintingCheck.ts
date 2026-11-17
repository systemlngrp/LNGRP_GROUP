import type { LoadingSlip } from "../types";

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
