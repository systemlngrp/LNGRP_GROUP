import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Camera, PackageCheck, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Spinner } from "../components/Spinner";
import { Select } from "../components/Select";
import { useData } from "../hooks/useData";
import { getAllReturnableReelLines } from "../lib/materialMovement";
import { buildProductionCorrugatedSheetUsageMap, buildProductionMaterialUsageMap, syncProductionWorkflowFromUsage } from "../lib/productionMaterialUsage";
import { generateTransactionNo } from "../lib/serial";
import type { Material, MaterialIn, MaterialInPackingSlip, MaterialIssue, MaterialIssueLine, MaterialIssueReelLine, MaterialReturn, MaterialReturnLine, MaterialReturnReelLine, Production } from "../types";

type ReturnableReel = ReturnType<typeof getAllReturnableReelLines>[number];
type ReturnDraft = Record<string, string>;
const today = () => new Date().toISOString().slice(0, 10);
const round2 = (value: number) => Number(Number(value || 0).toFixed(2));
const normalizeText = (value?: string | null) => String(value || "").trim().toLowerCase();
const reelKey = (row: Pick<ReturnableReel, "productionId" | "packingSlipId">) => `${row.productionId}::${row.packingSlipId}`;

function parseQrReelNo(rawValue: string) {
  const text = String(rawValue || "").trim();
  if (!text) return "";
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const keys = ["reelNo", "reel", "ourReelNo", "reel_no", "reelno"];
      const value = keys.map((key) => parsed?.[key]).find((entry) => typeof entry === "string" && String(entry).trim());
      if (value) return String(value).trim();
    } catch { /* Fall through to loose QR text parsing. */ }
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
  const [draft, setDraft] = useState<ReturnDraft>({});
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

  const returnableReels = useMemo(() => getAllReturnableReelLines(issueReelLines, returnReelLines, productions), [issueReelLines, productions, returnReelLines]);
  const materialMap = useMemo(() => new Map(materials.map((row) => [row.id, row])), [materials]);
  const slipMap = useMemo(() => new Map(packingSlips.map((row) => [row.id, row])), [packingSlips]);
  const jobOptions = useMemo(() => {
    const eligibleIds = new Set(returnableReels.map((row) => row.productionId));
    return productions.filter((row) => eligibleIds.has(row.id) && row.status !== "Cancelled").sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).map((row) => ({ value: row.id, label: `${row.transactionNo}${row.date ? ` | ${row.date.slice(0, 10)}` : ""}` }));
  }, [productions, returnableReels]);
  const reelsForJob = useMemo(() => returnableReels.filter((row) => row.productionId === productionId).sort((a, b) => String(a.ourReelNo).localeCompare(String(b.ourReelNo), undefined, { numeric: true })), [productionId, returnableReels]);

  const getInvoiceRate = (packingSlipId: string) => {
    const slip = slipMap.get(packingSlipId);
    const receipt = slip ? materialIn.find((row) => row.id === slip.materialInId) : undefined;
    const receiptLine = receipt?.lines.find((row) => row.id === slip?.materialLineId);
    return round2(Number(receiptLine?.invoiceRate || receiptLine?.poRate || receiptLine?.rate || materialMap.get(slip?.materialId || "")?.openingRate || 0));
  };
  const selectedRows = reelsForJob.filter((row) => draft[reelKey(row)] !== undefined);
  const draftStatus = selectedRows.map((row) => {
    const value = draft[reelKey(row)] || "";
    const qty = Number(value);
    const valid = value.trim() !== "" && Number.isFinite(qty) && qty > 0 && qty <= row.weightKg;
    const rate = getInvoiceRate(row.packingSlipId);
    return { row, value, qty, valid, rate, amount: valid ? round2(qty * rate) : 0 };
  });
  const allDraftsValid = draftStatus.length > 0 && draftStatus.every((entry) => entry.valid);
  const totalWeight = round2(draftStatus.reduce((sum, entry) => sum + (entry.valid ? entry.qty : 0), 0));
  const totalAmount = round2(draftStatus.reduce((sum, entry) => sum + entry.amount, 0));

  const handleJobChange = (value: string) => { setProductionId(value); setDraft({}); setScannerError(""); };
  const toggleReel = (row: ReturnableReel, checked: boolean) => setDraft((current) => { const next = { ...current }; const key = reelKey(row); if (checked) next[key] = ""; else delete next[key]; return next; });
  const updateWeight = (row: ReturnableReel, value: string) => setDraft((current) => ({ ...current, [reelKey(row)]: String(value || "").replace(/[^0-9.]/g, "") }));
  const stopScanner = () => { if (scanTimerRef.current !== null) window.clearInterval(scanTimerRef.current); scanTimerRef.current = null; streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; };
  const closeScanner = () => { stopScanner(); setIsScannerOpen(false); lastScannedCodeRef.current = ""; lastScannedAtRef.current = 0; };
  useEffect(() => stopScanner, []);

  const addScannedReel = (rawValue: string) => {
    if (!productionId) throw new Error("Select a job before scanning.");
    const reelNo = parseQrReelNo(rawValue);
    if (!reelNo) throw new Error("Reel number is required in QR.");
    const matching = reelsForJob.find((row) => normalizeText(row.ourReelNo) === normalizeText(reelNo));
    if (!matching) {
      const elsewhere = returnableReels.find((row) => normalizeText(row.ourReelNo) === normalizeText(reelNo));
      if (elsewhere) throw new Error(`Reel ${reelNo} is not issued against the selected job.`);
      throw new Error(`Reel ${reelNo} has no issued balance available for return.`);
    }
    const key = reelKey(matching);
    if (draft[key] !== undefined) throw new Error(`Reel ${reelNo} is already selected.`);
    setDraft((current) => ({ ...current, [key]: "" }));
    setScannerError("");
  };
  const openScanner = async () => {
    if (!productionId) return setScannerError("Select a job before scanning.");
    if (!navigator.mediaDevices?.getUserMedia) return setScannerError("Camera access is not supported on this browser/device.");
    const BarcodeDetectorCtor = (window as Window & { BarcodeDetector?: new (options?: { formats?: string[] }) => { detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector;
    if (!BarcodeDetectorCtor) return setScannerError("QR scanner is not supported on this browser.");
    stopScanner(); setScannerError(""); setIsScannerOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      const detector = new BarcodeDetectorCtor({ formats: ["qr_code"] });
      scanTimerRef.current = window.setInterval(async () => {
        if (!videoRef.current || isProcessingScan) return;
        try {
          const scanned = (await detector.detect(videoRef.current))?.[0]?.rawValue;
          if (!scanned) return;
          const now = Date.now();
          if (scanned === lastScannedCodeRef.current && now - lastScannedAtRef.current < 1500) return;
          lastScannedCodeRef.current = scanned; lastScannedAtRef.current = now; setIsProcessingScan(true);
          try { addScannedReel(scanned); closeScanner(); } catch (error) { closeScanner(); setScannerError(error instanceof Error ? error.message : "Unable to process scanned reel."); } finally { setIsProcessingScan(false); }
        } catch { /* Continue after frame decode failures. */ }
      }, 350);
    } catch (error) { console.error(error); closeScanner(); setScannerError("Unable to open camera. Please allow camera permission and try again."); }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting || !date || !productionId || !allDraftsValid) return;
    setIsSubmitting(true);
    try {
      const latest = getAllReturnableReelLines(issueReelLines, returnReelLines, productions);
      const validated = draftStatus.map((entry) => {
        const current = latest.find((row) => row.productionId === productionId && row.packingSlipId === entry.row.packingSlipId);
        if (!current) throw new Error(`Reel ${entry.row.ourReelNo} no longer has an issued balance available.`);
        const qty = round2(entry.qty);
        if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Enter a return weight for reel ${entry.row.ourReelNo}.`);
        if (qty > current.weightKg) throw new Error(`Return weight for reel ${entry.row.ourReelNo} cannot exceed ${current.weightKg.toFixed(2)} KG.`);
        const rate = getInvoiceRate(current.packingSlipId);
        return { row: current, qty, rate, amount: round2(qty * rate) };
      });
      const timestamp = new Date().toISOString();
      const production = productions.find((row) => row.id === productionId);
      if (!production) throw new Error("Selected job was not found.");
      const returnId = crypto.randomUUID();
      const returnEntry: MaterialReturn = { id: returnId, returnNo: generateTransactionNo("MR", materialReturns.map((row) => ({ transactionNo: row.returnNo, date: row.date })), date), date, returnType: "Job", productionId, jobNo: production.transactionNo, remarks: remarks.trim() || undefined, updatedBy: "System User", updateTimestamp: timestamp };
      const byMaterial = new Map<string, typeof validated>();
      validated.forEach((entry) => byMaterial.set(entry.row.materialId, [...(byMaterial.get(entry.row.materialId) || []), entry]));
      const createdLines: MaterialReturnLine[] = [];
      const createdReelLines: MaterialReturnReelLine[] = [];
      byMaterial.forEach((entries, materialId) => {
        const returnLineId = crypto.randomUUID();
        const qty = round2(entries.reduce((sum, entry) => sum + entry.qty, 0));
        const amount = round2(entries.reduce((sum, entry) => sum + entry.amount, 0));
        const rate = qty > 0 ? round2(amount / qty) : 0;
        createdLines.push({ id: returnLineId, materialReturnId: returnId, materialId, qty, uom: "KG", lastPurchaseRate: rate, openingRate: round2(Number(materialMap.get(materialId)?.openingRate || 0)), rate, amount, updatedBy: "System User", updateTimestamp: timestamp });
        entries.forEach((entry) => createdReelLines.push({ id: crypto.randomUUID(), materialReturnId: returnId, materialReturnLineId: returnLineId, materialId, packingSlipId: entry.row.packingSlipId, ourReelNo: entry.row.ourReelNo, weightKg: entry.qty, productionId, jobNo: production.transactionNo, updatedBy: "System User", updateTimestamp: timestamp }));
      });
      const nextReturns = [returnEntry, ...materialReturns];
      const nextReturnLines = [...materialReturnLines, ...createdLines];
      const nextReturnReelLines = [...returnReelLines, ...createdReelLines];
      await setMaterialReturns(nextReturns); await setMaterialReturnLines(nextReturnLines); await setReturnReelLines(nextReturnReelLines);
      const usageMap = buildProductionMaterialUsageMap(materialIssues, materialIssueLines, nextReturns, nextReturnLines, issueReelLines, nextReturnReelLines);
      const corrugatedUsageMap = buildProductionCorrugatedSheetUsageMap(materials, materialIssues, materialIssueLines, nextReturns, nextReturnLines);
      await setProductions((current) => current.map((row) => row.id === productionId ? syncProductionWorkflowFromUsage(row, usageMap.get(productionId) || 0, timestamp, Number(corrugatedUsageMap.get(productionId) || 0) > 0) : row));
      setDraft({}); setRemarks("");
      alert(`${validated.length} reel return${validated.length === 1 ? "" : "s"} saved successfully.`);
      if (returnTo) navigate(returnTo);
    } catch (error) { console.error("Failed to save reel returns:", error); alert(error instanceof Error ? error.message : "Failed to save reel returns."); }
    finally { setIsSubmitting(false); }
  };

  if (materialsLoading || productionsLoading || issueReelsLoading || returnReelsLoading) return <Spinner />;
  const displayedRows = mode === "manual" ? reelsForJob : selectedRows;
  return <div className="rounded border border-black bg-white p-3 text-black shadow-sm md:p-6">
    <div className="mb-4 flex items-center gap-3 border-b border-black pb-2 md:mb-6">{returnTo ? <button type="button" onClick={() => navigate(returnTo)} className="inline-flex items-center gap-1 rounded border border-black bg-white px-3 py-1.5 text-xs font-bold uppercase hover:bg-slate-100"><ArrowLeft size={15} /> Pending Returns</button> : null}<h2 className="text-lg font-bold uppercase tracking-tight md:text-xl">{mode === "qr" ? "QR Reel Return" : "Manual Reel Return"}</h2></div>
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2"><Field label="Date" required><input type="date" required value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded border-2 border-black p-2" /></Field><Field label="Return No (Auto)"><input value="Generated on Submit" disabled className="w-full rounded border-2 border-black bg-slate-50 p-2 opacity-70" /></Field><Field label="Job No." required><Select required disabled={lockJob} options={jobOptions} value={productionId} onChange={handleJobChange} placeholder="Select Job..." /></Field><Field label="Remarks"><input value={remarks} onChange={(event) => setRemarks(event.target.value)} className="w-full rounded border-2 border-black p-2" /></Field></div>
      {mode === "qr" ? <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black pt-4"><div><h3 className="font-bold uppercase">Scan Issued Reels</h3><p className="text-sm text-slate-600">Scan each reel once, then enter its actual return weight below.</p></div><button type="button" onClick={() => void openScanner()} disabled={!productionId || isProcessingScan || isSubmitting} className="inline-flex items-center gap-2 rounded border-2 border-black bg-emerald-600 px-4 py-2 font-bold text-white disabled:opacity-50"><Camera size={17} /> Scan QR</button>{scannerError ? <p className="w-full text-sm font-bold text-red-700">{scannerError}</p> : null}</div> : <div className="border-t border-black pt-4"><h3 className="font-bold uppercase">Select Issued Reels</h3></div>}
      <div className="overflow-x-auto rounded border border-black"><table className="min-w-full border-collapse text-sm"><thead className="bg-slate-100"><tr>{[mode === "manual" ? "Select" : "Remove", "Our Reel No.", "Material / ERP", "Remaining Issued Weight", "Return Weight KG", "Rate", "Amount"].map((heading) => <th key={heading} className="border border-black px-3 py-2 text-left text-xs font-bold uppercase">{heading}</th>)}</tr></thead><tbody>
        {displayedRows.length === 0 ? <tr><td colSpan={7} className="p-6 text-center font-medium text-slate-500">{productionId ? (mode === "qr" ? "Scan a reel QR to add it." : "No issued reels remain available for this job.") : "Select a job first."}</td></tr> : displayedRows.map((row) => { const key = reelKey(row); const selected = draft[key] !== undefined; const value = draft[key] || ""; const qty = Number(value); const valid = value.trim() !== "" && Number.isFinite(qty) && qty > 0 && qty <= row.weightKg; const rate = getInvoiceRate(row.packingSlipId); const material = materialMap.get(row.materialId); return <tr key={key}><td className="border border-black px-3 py-2 text-center">{mode === "manual" ? <input type="checkbox" checked={selected} onChange={(event) => toggleReel(row, event.target.checked)} /> : <button type="button" onClick={() => toggleReel(row, false)} className="rounded border border-red-700 px-2 py-1 text-xs font-bold text-red-700">Remove</button>}</td><td className="border border-black px-3 py-2 font-black">{row.ourReelNo}</td><td className="border border-black px-3 py-2 font-bold">{material?.name || "-"}<div className="text-xs font-medium text-slate-500">ERP: {material?.erpCode || "-"}</div></td><td className="border border-black px-3 py-2 text-right font-black text-amber-700">{row.weightKg.toFixed(2)} KG</td><td className="border border-black px-3 py-2"><input type="number" min="0.01" max={row.weightKg} step="0.01" disabled={!selected} value={value} onChange={(event) => updateWeight(row, event.target.value)} placeholder="0.00" className="w-32 rounded border-2 border-black p-2 text-right font-bold disabled:bg-slate-100" /></td><td className="border border-black px-3 py-2 text-right font-bold">{rate.toFixed(2)}</td><td className="border border-black px-3 py-2 text-right font-black text-indigo-700">{valid ? round2(qty * rate).toFixed(2) : "0.00"}</td></tr>; })}
      </tbody></table></div>
      <div className="flex flex-col items-end justify-between gap-3 border-2 border-black bg-slate-950 p-4 text-white md:flex-row md:items-center"><div className="grid grid-cols-3 gap-6"><Total label="Selected Reels" value={String(selectedRows.length)} /><Total label="Return Weight" value={`${totalWeight.toFixed(2)} KG`} /><Total label="Return Value" value={totalAmount.toFixed(2)} /></div><button type="submit" disabled={isSubmitting || !productionId || !allDraftsValid} className="inline-flex min-w-[180px] items-center justify-center gap-2 rounded bg-indigo-600 px-6 py-3 font-bold text-white hover:bg-indigo-700 disabled:opacity-50"><PackageCheck size={18} /> {isSubmitting ? "Saving..." : "Save Returns"}</button></div>
    </form>
    {isScannerOpen ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"><div className="w-full max-w-lg rounded border-2 border-black bg-white p-4 shadow-2xl"><div className="mb-3 flex items-center justify-between"><div className="text-sm font-black uppercase">Scan Return Reel QR</div><button type="button" onClick={closeScanner} className="rounded border border-black p-1.5"><X size={18} /></button></div><video ref={videoRef} playsInline muted className="aspect-video w-full rounded bg-black object-cover" /><p className="mt-3 text-center text-xs font-bold text-slate-600">Point the camera at an issued reel QR label.</p></div></div> : null}
  </div>;
}

function Field({ label, children, required = false }: { label: string; children: React.ReactNode; required?: boolean }) { return <div className="space-y-1"><label className="font-bold text-black">{label} {required ? <span className="text-red-500">*</span> : null}</label>{children}</div>; }
function Total({ label, value }: { label: string; value: string }) { return <div><div className="text-xs font-bold uppercase text-slate-400">{label}</div><div className="text-lg font-black">{value}</div></div>; }
