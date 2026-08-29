import { useMemo, useState } from "react";
import { PackageCheck } from "lucide-react";
import { Select } from "../components/Select";
import { Spinner } from "../components/Spinner";
import { useData } from "../hooks/useData";
import { getAllReturnableReelLines } from "../lib/materialMovement";
import {
  buildProductionCorrugatedSheetUsageMap,
  buildProductionMaterialUsageMap,
  syncProductionWorkflowFromUsage,
} from "../lib/productionMaterialUsage";
import { generateTransactionNo } from "../lib/serial";
import type {
  Material,
  MaterialIn,
  MaterialInPackingSlip,
  MaterialIssue,
  MaterialIssueLine,
  MaterialIssueReelLine,
  MaterialReturn,
  MaterialReturnLine,
  MaterialReturnReelLine,
  Production,
} from "../types";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function round2(value: number) {
  return Number(Number(value || 0).toFixed(2));
}

export function ReelReturnForm() {
  const [materials, , materialsLoading] = useData<Material>("materials", []);
  const [materialIn] = useData<MaterialIn>("material-in", []);
  const [packingSlips] = useData<MaterialInPackingSlip>("material-in-packing-slips", []);
  const [productions, setProductions, productionsLoading] = useData<Production>("productions", []);
  const [materialIssues] = useData<MaterialIssue>("material-issues", []);
  const [materialIssueLines] = useData<MaterialIssueLine>("material-issue-lines", []);
  const [issueReelLines, , issueReelsLoading] = useData<MaterialIssueReelLine>("material-issue-reel-lines", []);
  const [materialReturns, setMaterialReturns] = useData<MaterialReturn>("material-returns", []);
  const [materialReturnLines, setMaterialReturnLines] = useData<MaterialReturnLine>("material-return-lines", []);
  const [returnReelLines, setReturnReelLines, returnReelsLoading] = useData<MaterialReturnReelLine>("material-return-reel-lines", []);

  const [date, setDate] = useState(today());
  const [productionId, setProductionId] = useState("");
  const [reelKey, setReelKey] = useState("");
  const [returnWeight, setReturnWeight] = useState("");
  const [remarks, setRemarks] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const returnableReels = useMemo(
    () => getAllReturnableReelLines(issueReelLines, returnReelLines, productions),
    [issueReelLines, productions, returnReelLines]
  );
  const materialMap = useMemo(() => new Map(materials.map((row) => [row.id, row])), [materials]);
  const slipMap = useMemo(() => new Map(packingSlips.map((row) => [row.id, row])), [packingSlips]);

  const jobOptions = useMemo(() => {
    const eligibleIds = new Set(returnableReels.map((row) => row.productionId));
    return productions
      .filter((row) => eligibleIds.has(row.id) && row.status !== "Cancelled")
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
      .map((row) => ({
        value: row.id,
        label: `${row.transactionNo}${row.date ? ` | ${row.date.slice(0, 10)}` : ""}`,
        searchText: `${row.transactionNo} ${row.date || ""}`,
      }));
  }, [productions, returnableReels]);

  const reelsForJob = useMemo(
    () => returnableReels
      .filter((row) => row.productionId === productionId)
      .sort((a, b) => String(a.ourReelNo).localeCompare(String(b.ourReelNo), undefined, { numeric: true })),
    [productionId, returnableReels]
  );

  const reelOptions = useMemo(() => reelsForJob.map((row) => {
    const material = materialMap.get(row.materialId);
    return {
      value: `${row.productionId}::${row.packingSlipId}`,
      label: `${row.ourReelNo} | ${material?.name || "Unknown material"} | ${row.weightKg.toFixed(2)} KG`,
      searchText: `${row.ourReelNo} ${material?.name || ""} ${material?.erpCode || ""}`,
    };
  }), [reelsForJob, materialMap]);

  const selectedReel = reelsForJob.find(
    (row) => `${row.productionId}::${row.packingSlipId}` === reelKey
  ) || null;
  const selectedMaterial = selectedReel ? materialMap.get(selectedReel.materialId) : undefined;
  const enteredWeight = Number(returnWeight);
  const validWeight = Boolean(
    returnWeight.trim() && Number.isFinite(enteredWeight) && enteredWeight > 0 &&
    selectedReel && enteredWeight <= selectedReel.weightKg
  );

  const getInvoiceRate = (packingSlipId: string) => {
    const slip = slipMap.get(packingSlipId);
    const receipt = slip ? materialIn.find((row) => row.id === slip.materialInId) : undefined;
    const receiptLine = receipt?.lines.find((row) => row.id === slip?.materialLineId);
    return round2(Number(
      receiptLine?.invoiceRate || receiptLine?.poRate || receiptLine?.rate ||
      materialMap.get(slip?.materialId || "")?.openingRate || 0
    ));
  };

  const invoiceRate = selectedReel ? getInvoiceRate(selectedReel.packingSlipId) : 0;
  const amount = validWeight ? round2(enteredWeight * invoiceRate) : 0;

  const handleJobChange = (value: string) => {
    setProductionId(value);
    setReelKey("");
    setReturnWeight("");
  };

  const handleReelChange = (value: string) => {
    setReelKey(value);
    setReturnWeight("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting || !date || !productionId || !selectedReel) return;

    const latestReel = getAllReturnableReelLines(issueReelLines, returnReelLines, productions).find(
      (row) => row.productionId === productionId && row.packingSlipId === selectedReel.packingSlipId
    );
    const qty = round2(Number(returnWeight));
    if (!latestReel) {
      alert("This reel no longer has an issued balance available for return.");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      alert("Enter a return weight greater than zero.");
      return;
    }
    if (qty > latestReel.weightKg) {
      alert(`Return weight cannot exceed ${latestReel.weightKg.toFixed(2)} KG.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const timestamp = new Date().toISOString();
      const production = productions.find((row) => row.id === productionId);
      if (!production) throw new Error("Selected job was not found.");

      const returnId = crypto.randomUUID();
      const returnLineId = crypto.randomUUID();
      const savedRate = getInvoiceRate(latestReel.packingSlipId);
      const savedAmount = round2(qty * savedRate);
      const returnEntry: MaterialReturn = {
        id: returnId,
        returnNo: generateTransactionNo(
          "MR",
          materialReturns.map((row) => ({ transactionNo: row.returnNo, date: row.date })),
          date
        ),
        date,
        returnType: "Job",
        productionId,
        jobNo: production.transactionNo,
        remarks: remarks.trim() || undefined,
        updatedBy: "System User",
        updateTimestamp: timestamp,
      };
      const returnLine: MaterialReturnLine = {
        id: returnLineId,
        materialReturnId: returnId,
        materialId: latestReel.materialId,
        qty,
        uom: "KG",
        lastPurchaseRate: savedRate,
        openingRate: round2(Number(materialMap.get(latestReel.materialId)?.openingRate || 0)),
        rate: savedRate,
        amount: savedAmount,
        updatedBy: "System User",
        updateTimestamp: timestamp,
      };
      const returnReelLine: MaterialReturnReelLine = {
        id: crypto.randomUUID(),
        materialReturnId: returnId,
        materialReturnLineId: returnLineId,
        materialId: latestReel.materialId,
        packingSlipId: latestReel.packingSlipId,
        ourReelNo: latestReel.ourReelNo,
        weightKg: qty,
        productionId,
        jobNo: production.transactionNo,
        updatedBy: "System User",
        updateTimestamp: timestamp,
      };

      const nextReturns = [returnEntry, ...materialReturns];
      const nextReturnLines = [...materialReturnLines, returnLine];
      const nextReturnReelLines = [...returnReelLines, returnReelLine];
      await setMaterialReturns(nextReturns);
      await setMaterialReturnLines(nextReturnLines);
      await setReturnReelLines(nextReturnReelLines);

      const usageMap = buildProductionMaterialUsageMap(
        materialIssues,
        materialIssueLines,
        nextReturns,
        nextReturnLines,
        issueReelLines,
        nextReturnReelLines
      );
      const corrugatedUsageMap = buildProductionCorrugatedSheetUsageMap(
        materials,
        materialIssues,
        materialIssueLines,
        nextReturns,
        nextReturnLines
      );
      await setProductions((current) => current.map((row) => row.id === productionId
        ? syncProductionWorkflowFromUsage(
            row,
            usageMap.get(productionId) || 0,
            timestamp,
            Number(corrugatedUsageMap.get(productionId) || 0) > 0
          )
        : row));

      setReelKey("");
      setReturnWeight("");
      setRemarks("");
      alert(`Reel ${latestReel.ourReelNo} return saved successfully.`);
    } catch (error) {
      console.error("Failed to save reel return:", error);
      alert(error instanceof Error ? error.message : "Failed to save reel return.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (materialsLoading || productionsLoading || issueReelsLoading || returnReelsLoading) return <Spinner />;

  return (
    <div className="rounded border border-black bg-white p-3 text-black shadow-sm md:p-6">
      <h2 className="mb-4 border-b border-black pb-2 text-lg font-bold uppercase tracking-tight text-black md:mb-6 md:text-xl">Reel Return Form</h2>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Date" required>
            <input id="reel-return-date" type="date" required value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded border-2 border-black p-2" />
          </Field>
          <Field label="Return No (Auto)">
            <input type="text" value="Generated on Submit" disabled className="w-full rounded border-2 border-black bg-slate-50 p-2 opacity-70" />
          </Field>
          <Field label="Job No." required>
            <Select id="reel-return-job" required options={jobOptions} value={productionId} onChange={handleJobChange} placeholder="Select Job..." />
            {jobOptions.length === 0 ? <p className="mt-1 text-xs font-bold text-slate-500">No jobs have an issued reel pending return.</p> : null}
          </Field>
          <Field label="Remarks">
            <input id="reel-return-remarks" value={remarks} onChange={(event) => setRemarks(event.target.value)} className="w-full rounded border-2 border-black p-2" />
          </Field>
        </div>

        <div className="space-y-4 border-t border-black pt-4">
          <h3 className="text-lg font-bold uppercase">Issued Reel</h3>
          <div className="rounded border border-black bg-slate-50 p-4">
            <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
              <Field label="Reel No." required>
                <Select id="reel-return-reel" required disabled={!productionId} options={reelOptions} value={reelKey} onChange={handleReelChange} placeholder={productionId ? "Select Issued Reel..." : "Select Job First..."} wrapLabels />
              </Field>
              <Field label="Return Weight KG" required>
                <input id="reel-return-weight" type="number" required min="0.01" max={selectedReel?.weightKg} step="0.01" disabled={!selectedReel} value={returnWeight} onChange={(event) => setReturnWeight(event.target.value)} placeholder="0.00" className="w-full rounded border-2 border-black p-2 text-right font-bold disabled:bg-slate-100" />
              </Field>
            </div>
            {productionId && reelOptions.length === 0 ? <p className="mt-3 text-sm font-bold text-amber-700">No issued reels remain available for this job.</p> : null}
          </div>

          {selectedReel ? (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse border border-black">
                <thead className="bg-slate-100">
                  <tr className="divide-x divide-black border-b border-black">
                    {["Our Reel No.", "Material / ERP", "Remaining Issued Weight", "Return Weight", "Rate", "Amount"].map((heading) => (
                      <th key={heading} className="px-3 py-2 text-left text-xs font-bold uppercase">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="divide-x divide-black">
                    <td className="px-3 py-3 text-sm font-black">{selectedReel.ourReelNo}</td>
                    <td className="px-3 py-3 text-sm font-bold">
                      {selectedMaterial?.name || "-"}
                      <div className="text-xs font-medium text-slate-500">ERP: {selectedMaterial?.erpCode || "-"}</div>
                    </td>
                    <td className="px-3 py-3 text-right text-sm font-black text-amber-700">{selectedReel.weightKg.toFixed(2)} KG</td>
                    <td className="px-3 py-3 text-right text-sm font-black">{validWeight ? `${enteredWeight.toFixed(2)} KG` : "-"}</td>
                    <td className="px-3 py-3 text-right text-sm font-bold">{invoiceRate.toFixed(2)}</td>
                    <td className="px-3 py-3 text-right text-sm font-black text-indigo-700">{amount.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border border-dashed border-black bg-slate-50 p-4 text-center text-sm font-bold text-slate-600">Select a job and its issued reel to enter the return.</div>
          )}
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={isSubmitting || !productionId || !selectedReel || !validWeight} className="inline-flex min-w-[180px] items-center justify-center gap-2 rounded bg-indigo-600 px-6 py-3 font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
            <PackageCheck size={18} /> {isSubmitting ? "Saving..." : "Save Return"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children, required = false }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="space-y-1">
      <label className="font-bold text-black">{label} {required ? <span className="text-red-500">*</span> : null}</label>
      {children}
    </div>
  );
}
