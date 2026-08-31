import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Camera, PackageCheck, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
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

function normalizeText(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function parseQrReelNo(rawValue: string) {
  const text = String(rawValue || "").trim();
  if (!text) return "";
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const keys = ["reelNo", "reel", "ourReelNo", "reel_no", "reelno"];
      const value = keys.map((key) => parsed?.[key]).find((entry) => typeof entry === "string" && String(entry).trim());
      if (value) return String(value).trim();
    } catch {
      // Fall through to loose QR text parsing.
    }
  }
  const labeled = text.match(/(?:reel\s*no|our\s*reel\s*no|reel_no|reelno)\s*[:=]\s*([^|,;\n]+)/i);
  if (labeled?.[1]) return labeled[1].trim();
  const delimited = text.match(/^\s*([^|,;\n]+)\s*[|,;]/);
  return (delimited?.[1] || text).trim();
}

export function ReelReturnForm({ mode = "manual" }: { mode?: "manual" | "qr" }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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

  const requestedProductionId = String(searchParams.get("productionId") || "").trim();
  const lockJob = searchParams.get("lockJob") === "1";
  const returnTo = String(searchParams.get("returnTo") || "").trim();
  const [date, setDate] = useState(today());
  const [productionId, setProductionId] = useState(requestedProductionId);
  const [reelKey, setReelKey] = useState("");
  const [returnWeight, setReturnWeight] = useState("");
  const [remarks, setRemarks] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const [isProcessingScan, setIsProcessingScan] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const lastScannedCodeRef = useRef("");
  const lastScannedAtRef = useRef(0);

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

  const stopScanner = () => {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const closeScanner = () => {
    stopScanner();
    setIsScannerOpen(false);
    lastScannedCodeRef.current = "";
    lastScannedAtRef.current = 0;
  };

  useEffect(() => stopScanner, []);

  const selectScannedReel = (rawValue: string) => {
    if (!productionId) throw new Error("Select a job before scanning.");
    const reelNo = parseQrReelNo(rawValue);
    if (!reelNo) throw new Error("Reel number is required in QR.");
    const matchingForJob = reelsForJob.find((row) => normalizeText(row.ourReelNo) === normalizeText(reelNo));
    if (!matchingForJob) {
      const matchingElsewhere = returnableReels.find((row) => normalizeText(row.ourReelNo) === normalizeText(reelNo));
      if (matchingElsewhere) throw new Error(`Reel ${reelNo} is not issued against the selected job.`);
      throw new Error(`Reel ${reelNo} has no issued balance available for return.`);
    }
    setReelKey(`${matchingForJob.productionId}::${matchingForJob.packingSlipId}`);
    setReturnWeight("");
    setScannerError("");
  };

  const openScanner = async () => {
    if (!productionId) {
      setScannerError("Select a job before scanning.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerError("Camera access is not supported on this browser/device.");
      return;
    }
    const BarcodeDetectorCtor = (window as Window & {
      BarcodeDetector?: new (options?: { formats?: string[] }) => {
        detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
      };
    }).BarcodeDetector;
    if (!BarcodeDetectorCtor) {
      setScannerError("QR scanner is not supported on this browser.");
      return;
    }

    stopScanner();
    setScannerError("");
    setIsScannerOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const detector = new BarcodeDetectorCtor({ formats: ["qr_code"] });
      scanTimerRef.current = window.setInterval(async () => {
        if (!videoRef.current || isProcessingScan) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const scanned = codes?.[0]?.rawValue;
          if (!scanned) return;
          const now = Date.now();
          if (scanned === lastScannedCodeRef.current && now - lastScannedAtRef.current < 1500) return;
          lastScannedCodeRef.current = scanned;
          lastScannedAtRef.current = now;
          setIsProcessingScan(true);
          try {
            selectScannedReel(scanned);
            closeScanner();
          } catch (error) {
            closeScanner();
            setScannerError(error instanceof Error ? error.message : "Unable to process scanned reel.");
          } finally {
            setIsProcessingScan(false);
          }
        } catch {
          // Ignore individual frame decode failures and continue scanning.
        }
      }, 350);
    } catch (error) {
      console.error(error);
      closeScanner();
      setScannerError("Unable to open camera. Please allow camera permission and try again.");
    }
  };

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
      if (returnTo) navigate(returnTo);
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
      <div className="mb-4 flex items-center gap-3 border-b border-black pb-2 md:mb-6">
        {returnTo ? (
          <button type="button" onClick={() => navigate(returnTo)} className="inline-flex items-center gap-1 rounded border border-black bg-white px-3 py-1.5 text-xs font-bold uppercase hover:bg-slate-100">
            <ArrowLeft size={15} /> Pending Returns
          </button>
        ) : null}
        <h2 className="text-lg font-bold uppercase tracking-tight text-black md:text-xl">{mode === "qr" ? "QR Reel Return" : "Manual Reel Return"}</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Date" required>
            <input id="reel-return-date" type="date" required value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded border-2 border-black p-2" />
          </Field>
          <Field label="Return No (Auto)">
            <input type="text" value="Generated on Submit" disabled className="w-full rounded border-2 border-black bg-slate-50 p-2 opacity-70" />
          </Field>
          <Field label="Job No." required>
            <Select id="reel-return-job" required disabled={lockJob} options={jobOptions} value={productionId} onChange={handleJobChange} placeholder="Select Job..." />
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
                {mode === "qr" ? (
                  <div className="flex gap-2">
                    <input value={selectedReel?.ourReelNo || ""} readOnly placeholder="Scan reel QR..." className="min-w-0 flex-1 rounded border-2 border-black bg-slate-50 p-2 font-bold" />
                    <button type="button" onClick={() => void openScanner()} disabled={!productionId || isProcessingScan || isSubmitting} className="inline-flex items-center gap-2 rounded border-2 border-black bg-emerald-600 px-4 py-2 font-bold text-white disabled:opacity-50">
                      <Camera size={17} /> Scan QR
                    </button>
                  </div>
                ) : (
                  <Select id="reel-return-reel" required disabled={!productionId} options={reelOptions} value={reelKey} onChange={handleReelChange} placeholder={productionId ? "Select Issued Reel..." : "Select Job First..."} wrapLabels />
                )}
                {scannerError ? <p className="mt-2 text-sm font-bold text-red-700">{scannerError}</p> : null}
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

      {isScannerOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded border-2 border-black bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-black uppercase">Scan Return Reel QR</div>
              <button type="button" onClick={closeScanner} className="rounded border border-black p-1.5" aria-label="Close scanner"><X size={18} /></button>
            </div>
            <video ref={videoRef} playsInline muted className="aspect-video w-full rounded bg-black object-cover" />
            <p className="mt-3 text-center text-xs font-bold text-slate-600">Point the camera at the issued reel QR label.</p>
          </div>
        </div>
      ) : null}
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
