import React, { Suspense, useMemo, useState } from "react";
import { useData } from "../hooks/useData";
import type { LoadingSlip, ProductionProcessing } from "../types";
import { normalizeMachineName } from "../lib/productionMachineNames";
import type { CorrectionField, Row } from "../pages/JobWiseTracker";

// The same Admin correction as Job-wise Tracker (reason + Job Correction Log), opened from the Summary Sheet.
const JobCorrectionModal = React.lazy(() => import("../pages/JobWiseTracker").then((module) => ({ default: module.JobCorrectionModal })));

const FIELDS: Array<{ field: CorrectionField; label: string; tone: string }> = [
  { field: "Corrugation", label: "Corrugation", tone: "bg-sky-600 hover:bg-sky-700" },
  { field: "Printed", label: "Printing", tone: "bg-violet-600 hover:bg-violet-700" },
  { field: "Loaded", label: "Loading", tone: "bg-amber-600 hover:bg-amber-700" },
  { field: "Loading Wastage", label: "Loading Wastage", tone: "bg-rose-600 hover:bg-rose-700" },
];
const isCancelledSlip = (slip: LoadingSlip) => ["cancelled", "canceled"].includes(String(slip.status || "").trim().toLowerCase());

export function SummaryJobCorrection({ job, userName, onClose }: {
  job: { jobId: string; jobNo: string; date: string; companyName: string; itemName: string; erp: string; plannedQty: number };
  userName: string;
  onClose: () => void;
}) {
  const [processing, , processingLoading] = useData<ProductionProcessing>("production_processing", [], {
    firmScope: "all",
    storageKey: "production-processing-all-firms",
    fields: ["id", "productionId", "machineName", "qty", "completionStatus"],
  });
  const [loadingSlips, , slipsLoading] = useData<LoadingSlip>("loading_slips", [], { firmScope: "all", storageKey: "loading-slips-all-firms" });
  const [field, setField] = useState<CorrectionField | null>(null);

  // The job's figures, worked out the same way as Job-wise Tracker.
  const row = useMemo<Row>(() => {
    let corrugation = 0, printed = 0, printingComplete = false, loaded = 0, invoiced = 0, loadingWastage = 0;
    processing.forEach((entry) => {
      if (String(entry.productionId || "").trim() !== job.jobId) return;
      const machine = normalizeMachineName(entry.machineName);
      const qty = Number(entry.qty) || 0;
      if (machine === "Corrugation Liner") corrugation += qty;
      if (machine === "Printing") {
        printed += qty;
        const status = String(entry.completionStatus || "").trim().toLowerCase();
        if (!status || status === "full") printingComplete = true;
      }
    });
    loadingSlips.forEach((slip) => {
      if (isCancelledSlip(slip)) return;
      const isInvoiced = Boolean(String(slip.invoiceId || "").trim());
      (slip.lines || []).forEach((line) => (line.allocations || []).forEach((allocation: any) => {
        if (String(allocation?.sourceType || "").trim().toLowerCase() !== "job" || String(allocation?.jobId || "").trim() !== job.jobId) return;
        const qty = Number(allocation?.qty) || 0;
        loaded += qty;
        if (isInvoiced) invoiced += qty;
      }));
      (slip.jobWastage || []).forEach((entry) => { if (String(entry?.jobId || "").trim() === job.jobId) loadingWastage += Number(entry?.qty) || 0; });
    });
    return {
      jobId: job.jobId, jobNo: job.jobNo, date: job.date, status: "", firmId: "", firmName: "",
      companyName: job.companyName, itemName: job.itemName, erp: job.erp, plannedQty: job.plannedQty,
      corrugation, printed, printingComplete, loaded, invoiced, loadingWastage, balance: printed - loaded - loadingWastage,
    };
  }, [job, loadingSlips, processing]);

  const loading = (processingLoading && !processing.length) || (slipsLoading && !loadingSlips.length);
  if (field) {
    return (
      <Suspense fallback={<div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 text-sm font-bold text-white">Opening…</div>}>
        <JobCorrectionModal row={row} field={field} loadingSlips={loadingSlips} userName={userName} onClose={() => setField(null)} />
      </Suspense>
    );
  }
  const figure = (label: string, value: number, red = false) => (
    <div className={`rounded border border-black px-2 py-1 ${red ? "bg-red-50 text-red-800" : "bg-slate-50"}`}>
      <div className="text-[10px] font-black uppercase text-slate-600">{label}</div>
      <div className="text-sm font-black">{value.toLocaleString("en-IN")}</div>
    </div>
  );
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-xl rounded border-2 border-black bg-white p-4 text-black" role="dialog" aria-modal="true" aria-label="Correct Job" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-black uppercase">Correct Job {job.jobNo}</h3>
            <div className="text-xs font-semibold text-slate-600">{job.companyName} · {job.itemName}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded border-2 border-black px-3 py-1 text-xs font-bold">Close</button>
        </div>
        {loading ? <div className="mt-4 text-sm font-bold text-slate-600">Loading the job's entries…</div> : (
          <>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {figure("Planned", row.plannedQty)}
              {figure("Corrugated", row.corrugation)}
              {figure("Printed", row.printed)}
              {figure("Loaded", row.loaded)}
              {figure("Load. Wastage", row.loadingWastage)}
              {figure("Balance", row.balance, row.balance < 0)}
            </div>
            <div className="mt-2 text-[11px] font-semibold text-slate-600">Printing {row.printingComplete ? "Complete" : "in progress"} · Invoiced {row.invoiced.toLocaleString("en-IN")}. Each correction needs a reason and is saved in the Job Correction Log.</div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {FIELDS.map((entry) => (
                <button key={entry.field} type="button" onClick={() => setField(entry.field)} className={`rounded px-3 py-3 text-sm font-black uppercase text-white ${entry.tone}`}>
                  {entry.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
