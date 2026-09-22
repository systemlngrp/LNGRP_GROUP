import { useMemo, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { useData } from "../hooks/useData";
import { Material, MaterialIssueLine, MaterialIssueReelLine, MaterialReturnReelLine, Production, ProductionProcessing, Setting } from "../types";
import { buildReelTransferContext, DEFAULT_REEL_TRANSFER_WINDOW_HOURS, distributeProportionalTransferWeight } from "../lib/reelTransfer";
import { normalizeMachineName } from "../lib/productionMachineNames";
import { Spinner } from "../components/Spinner";
import { Select } from "../components/Select";
import { useNavigate, useSearchParams } from "react-router-dom";

const today = () => new Date().toISOString().slice(0, 10);
const OPEN_TARGET_STATUSES = new Set(["Pending PH", "Pending Consumption", "Pending FFG", "Pending Tally"]);

export function ReelTransferForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [productions, , productionsLoading] = useData<Production>("productions", [], { firmScope: "all" });
  const [processing, , processingLoading] = useData<ProductionProcessing>("production_processing", [], { firmScope: "all" });
  const [issueReels, , issuesLoading] = useData<MaterialIssueReelLine>("material_issue_reel_lines", [], { firmScope: "all" });
  const [returnReels, , returnsLoading] = useData<MaterialReturnReelLine>("material_return_reel_lines", [], { firmScope: "all" });
  const [issueLines] = useData<MaterialIssueLine>("material_issue_lines", []);
  const [materials] = useData<Material>("materials", []);
  const [settings] = useData<Setting>("settings", []);
  const requestedSourceId = String(searchParams.get("sourceProductionId") || "").trim();
  const lockSource = searchParams.get("lockSource") === "1";
  const returnTo = String(searchParams.get("returnTo") || "").trim();
  const [date, setDate] = useState(today());
  const [sourceId, setSourceId] = useState(requestedSourceId);
  const [targetId, setTargetId] = useState("");
  const [selectedSlips, setSelectedSlips] = useState<string[]>([]);
  const [totalTransferWeight, setTotalTransferWeight] = useState<number | "">("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const windowHours = Number(settings[0]?.reelTransferWindowHours || DEFAULT_REEL_TRANSFER_WINDOW_HOURS);
  const contexts = useMemo(() => new Map(productions.map((production) => [production.id, buildReelTransferContext(production, processing, issueReels, returnReels, issueLines, productions, windowHours)])), [productions, processing, issueReels, returnReels, issueLines, windowHours]);
  const sourceOptions = productions.filter((p) => p.status !== "Cancelled" && !p.cancelTimestamp && contexts.get(p.id)?.eligible).map((p) => ({ value: p.id, label: String(p.transactionNo) }));
  const sourceContext = contexts.get(sourceId);
  const normalizeJobNo = (value: unknown) => String(value || "").trim().toLowerCase();
  const targetOptions = productions.filter((p) =>
    p.id !== sourceId &&
    OPEN_TARGET_STATUSES.has(p.status) &&
    !p.cancelTimestamp &&
    !issueReels.some((row) => row.productionId === p.id || normalizeJobNo(row.jobNo) === normalizeJobNo(p.transactionNo)) &&
    !processing.some((row) => row.productionId === p.id && normalizeMachineName(row.machineName) === "Corrugation Liner")
  ).map((p) => ({ value: p.id, label: String(p.transactionNo) }));
  const materialMap = new Map(materials.map((row) => [row.id, row]));
  const selectedRows = (sourceContext?.reels || []).filter((row) => selectedSlips.includes(row.packingSlipId));
  const allocations = useMemo(() => distributeProportionalTransferWeight(selectedRows.map((row) => ({ id: row.packingSlipId, issuedWeightKg: row.originalIssuedWeightKg, availableWeightKg: row.weightKg })), Number(totalTransferWeight || 0)), [selectedRows, totalTransferWeight]);
  const allocationBySlip = useMemo(() => new Map(allocations.map((row) => [row.id, row.weightKg])), [allocations]);
  const totalWeight = allocations.reduce((sum, row) => sum + row.weightKg, 0);
  const totalAmount = selectedRows.reduce((sum, row) => sum + (allocationBySlip.get(row.packingSlipId) || 0) * row.rate, 0);
  const allocationsFitBalances = allocations.length === selectedRows.length && allocations.every((row) => row.weightKg > 0 && row.weightKg <= row.availableWeightKg);

  const handleSource = (value: string) => { setSourceId(value); setTargetId(""); setSelectedSlips([]); setTotalTransferWeight(""); };
  const toggleReel = (id: string) => setSelectedSlips((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !sourceId || !targetId || !selectedSlips.length || !Number.isInteger(Number(totalTransferWeight)) || Number(totalTransferWeight) <= 0 || !allocationsFitBalances || totalWeight !== Number(totalTransferWeight)) return;
    setSaving(true);
    try {
      const token = localStorage.getItem("authToken") || "";
      const response = await fetch("/api/reel-transfers/execute", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ date, sourceProductionId: sourceId, targetProductionId: targetId, packingSlipIds: selectedSlips, totalTransferWeight, remarks }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Failed to transfer reels.");
      [
        "material_issues", "material-issues",
        "material_issue_lines", "material-issue-lines",
        "material_issue_reel_lines", "material-issue-reel-lines",
        "material_returns", "material-returns",
        "material_return_lines", "material-return-lines",
        "material_return_reel_lines", "material-return-reel-lines",
        "reel_transfers", "reel-transfers",
        "reel_transfer_lines", "reel-transfer-lines",
        "productions",
      ].forEach((key) => window.dispatchEvent(new CustomEvent(`sync-data-${key}`)));
      alert(`Reel transfer ${result.transferNo} saved successfully.`);
      setSelectedSlips([]); setTargetId(""); setTotalTransferWeight(""); setRemarks("");
      if (returnTo) navigate(returnTo);
    } catch (error) { alert(error instanceof Error ? error.message : "Failed to transfer reels."); }
    finally { setSaving(false); }
  };

  if (productionsLoading || processingLoading || issuesLoading || returnsLoading) return <Spinner />;
  return <div className="rounded border border-black bg-white p-3 text-black shadow-sm md:p-6">
    <div className="mb-5 flex items-center justify-between gap-3 border-b border-black pb-2">
      <div><h2 className="text-xl font-bold uppercase tracking-tight">Job Transfer - Reel Balance</h2><p className="mt-1 text-xs font-bold text-indigo-700">Unit-I Reel Inventory · jobs from any firm</p></div>
      {returnTo ? <button type="button" onClick={() => navigate(returnTo)} className="rounded border border-black bg-white px-3 py-1.5 text-xs font-bold uppercase hover:bg-slate-100">Back to Job Transfer</button> : null}
    </div>
    <form onSubmit={submit} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Transfer Date"><input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded border-2 border-black p-2" /></Field>
        <Field label="Transfer No."><input value="Auto" readOnly className="w-full rounded border-2 border-black bg-slate-100 p-2" /></Field>
        <Field label="Source Job No."><Select disabled={lockSource} options={sourceOptions} value={sourceId} onChange={handleSource} placeholder="Select eligible source job..." /></Field>
        <Field label="Target Job No.">
          <Select disabled={!sourceId} options={targetOptions} value={targetId} onChange={setTargetId} placeholder="Select active job with no reel issue..." noOptionsMessage="No active target: reel issue must be empty and Corrugation must not be started." />
          {sourceId && targetOptions.length === 0 ? <div className="mt-1 text-[11px] font-bold text-amber-700">No active target job is available. The target must have no reel issue and Corrugation Liner must not be started.</div> : null}
        </Field>
        <Field label="Total Transfer Weight (KG)"><input type="number" min="1" step="1" required value={totalTransferWeight} onChange={(e) => setTotalTransferWeight(e.target.value === "" ? "" : Number(e.target.value))} className="w-full rounded border-2 border-black p-2" /><span className="block text-[11px] font-medium text-slate-500">Whole KG only</span></Field>
        <Field label="Remarks"><input value={remarks} onChange={(e) => setRemarks(e.target.value)} className="w-full rounded border-2 border-black p-2" /></Field>
        <Field label={`Transfer Window (${windowHours} Hours)`}><input readOnly value={sourceContext?.expiresAt ? new Date(sourceContext.expiresAt).toLocaleString() : "Select source job"} className="w-full rounded border-2 border-black bg-slate-100 p-2" /></Field>
      </div>
      {sourceContext ? (
        <section className="space-y-3 border border-black bg-slate-50 p-3">
          <div className="text-xs font-black uppercase tracking-wide text-slate-700">Source Reel Balance</div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            <Metric label="Total Issued KG" value={sourceContext.totalIssuedKg} />
            <Metric label="Total Returned KG" value={sourceContext.totalReturnedKg} />
            <Metric label="Outstanding Reel Count" value={sourceContext.outstandingReelCount} decimals={0} />
          </div>
        </section>
      ) : null}
      <div className="overflow-x-auto rounded border border-black"><table className="w-full border-collapse text-sm"><thead className="bg-slate-100"><tr>{["Select", "Reel No. / QR", "Material / ERP", "Original Issued KG", "Available Balance", "Transfer KG", "Rate", "Amount"].map((h) => <th key={h} className="border border-black p-2 text-left uppercase">{h}</th>)}</tr></thead><tbody>
        {!sourceContext?.reels.length ? <tr><td colSpan={8} className="p-5 text-center text-slate-500">Select an eligible source job.</td></tr> : sourceContext.reels.map((row) => <tr key={row.packingSlipId}><td className="border border-black p-2"><input type="checkbox" checked={selectedSlips.includes(row.packingSlipId)} onChange={() => toggleReel(row.packingSlipId)} /></td><td className="border border-black p-2 font-bold">{row.ourReelNo}<br/><span className="text-xs font-medium text-slate-500">{row.packingSlipId}</span></td><td className="border border-black p-2">{materialMap.get(row.materialId)?.name || row.materialId}<br/><span className="text-xs text-slate-500">{materialMap.get(row.materialId)?.erpCode || ""}</span></td><td className="border border-black p-2 text-right">{row.originalIssuedWeightKg.toFixed(2)}</td><td className="border border-black p-2 text-right">{row.weightKg.toFixed(2)}</td><td className="border border-black p-2 text-right font-bold">{(allocationBySlip.get(row.packingSlipId) || 0).toFixed(0)}</td><td className="border border-black p-2 text-right">{row.rate.toFixed(2)}</td><td className="border border-black p-2 text-right">{((allocationBySlip.get(row.packingSlipId) || 0) * row.rate).toFixed(2)}</td></tr>)}
      </tbody></table></div>
      <div className="flex flex-col items-end justify-between gap-3 border-2 border-black bg-slate-950 p-4 text-white md:flex-row md:items-center"><div><div className="text-xs font-bold uppercase text-slate-300">Transfer Total</div><div className="text-xl font-black">{totalWeight.toFixed(0)} KG &nbsp; | &nbsp; {totalAmount.toFixed(2)}</div>{selectedSlips.length > 0 && !allocationsFitBalances ? <div className="mt-1 text-xs font-bold text-amber-300">The proportional allocation exceeds a selected reel’s available balance.</div> : null}</div><button disabled={saving || !sourceId || !targetId || !selectedSlips.length || !Number.isInteger(Number(totalTransferWeight)) || Number(totalTransferWeight) <= 0 || totalWeight !== Number(totalTransferWeight) || !allocationsFitBalances} className="inline-flex items-center gap-2 rounded bg-indigo-600 px-6 py-3 font-black uppercase hover:bg-indigo-700 disabled:opacity-50"><ArrowRightLeft size={18}/>{saving ? "Saving..." : "Save Reel Transfer"}</button></div>
    </form>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="space-y-1"><span className="block text-xs font-black uppercase">{label}</span>{children}</label>; }
function Metric({ label, value, decimals = 2 }: { label: string; value: number; decimals?: number }) { return <div className="rounded border border-slate-300 bg-white p-2"><div className="font-black uppercase text-slate-500">{label}</div><div className="mt-1 text-base font-bold">{Number(value || 0).toFixed(decimals)}</div></div>; }
