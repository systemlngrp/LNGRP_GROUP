import { useMemo, useState } from "react";
import { ArrowDownToLine, PackageCheck, Scale } from "lucide-react";
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
    () => getAllReturnableReelLines(issueReelLines, returnReelLines),
    [issueReelLines, returnReelLines]
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

    const latestReel = getAllReturnableReelLines(issueReelLines, returnReelLines).find(
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
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_60px_-28px_rgba(15,23,42,0.28)]">
        <div className="bg-[linear-gradient(135deg,#0f172a,#047857)] px-6 py-6 text-white">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/20"><ArrowDownToLine size={22} /></div>
            <div>
              <h2 className="text-xl font-black tracking-tight">Reel Return Form</h2>
              <p className="text-sm font-medium text-white/75">Return one previously issued reel against its job.</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 p-5 md:p-6">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="reel-return-date" className="mb-2 block text-sm font-black uppercase tracking-wide text-slate-700">Return Date</label>
              <input id="reel-return-date" type="date" required value={date} onChange={(event) => setDate(event.target.value)} className="h-[46px] w-full rounded border-2 border-black px-3 font-semibold" />
            </div>
            <div>
              <label htmlFor="reel-return-job" className="mb-2 block text-sm font-black uppercase tracking-wide text-slate-700">Job</label>
              <Select id="reel-return-job" required options={jobOptions} value={productionId} onChange={handleJobChange} placeholder="Select a job with issued reels..." />
            </div>
          </div>

          <div>
            <label htmlFor="reel-return-reel" className="mb-2 block text-sm font-black uppercase tracking-wide text-slate-700">Issued Reel</label>
            <Select id="reel-return-reel" required disabled={!productionId} options={reelOptions} value={reelKey} onChange={handleReelChange} placeholder={productionId ? "Select an issued reel..." : "Select job first"} wrapLabels />
            {productionId && reelOptions.length === 0 ? <p className="mt-2 text-sm font-semibold text-amber-700">No issued reels remain available for this job.</p> : null}
          </div>

          {selectedReel ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div><div className="text-xs font-black uppercase text-slate-500">Our Reel No.</div><div className="mt-1 font-black text-slate-900">{selectedReel.ourReelNo}</div></div>
                <div><div className="text-xs font-black uppercase text-slate-500">Material / ERP</div><div className="mt-1 font-bold text-slate-900">{selectedMaterial?.name || "-"}<div className="text-xs text-slate-500">{selectedMaterial?.erpCode || "No ERP"}</div></div></div>
                <div><div className="text-xs font-black uppercase text-slate-500">Returnable Balance</div><div className="mt-1 font-black text-amber-700">{selectedReel.weightKg.toFixed(2)} KG</div></div>
                <div><div className="text-xs font-black uppercase text-slate-500">Invoice Rate</div><div className="mt-1 font-black text-indigo-700">{invoiceRate.toFixed(2)}</div></div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="reel-return-weight" className="mb-2 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-700"><Scale size={17} /> Return Weight KG</label>
              <input id="reel-return-weight" type="number" required min="0.01" max={selectedReel?.weightKg} step="0.01" disabled={!selectedReel} value={returnWeight} onChange={(event) => setReturnWeight(event.target.value)} placeholder="Enter actual returned weight" className="h-[46px] w-full rounded border-2 border-black px-3 text-right font-bold disabled:bg-slate-100" />
              {selectedReel ? <p className="mt-1 text-xs font-semibold text-slate-500">Maximum {selectedReel.weightKg.toFixed(2)} KG</p> : null}
            </div>
            <div>
              <label htmlFor="reel-return-remarks" className="mb-2 block text-sm font-black uppercase tracking-wide text-slate-700">Remarks</label>
              <input id="reel-return-remarks" value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Optional remarks" className="h-[46px] w-full rounded border-2 border-black px-3 font-semibold" />
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-2xl bg-slate-900 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
            <div><div className="text-xs font-black uppercase tracking-widest text-slate-400">Return Value</div><div className="text-2xl font-black">{amount.toFixed(2)}</div></div>
            <button type="submit" disabled={isSubmitting || !productionId || !selectedReel || !validWeight} className="inline-flex min-w-[220px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-black uppercase tracking-wider text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50">
              <PackageCheck size={19} /> {isSubmitting ? "Saving..." : "Save Reel Return"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
