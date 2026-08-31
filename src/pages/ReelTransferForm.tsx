import { useMemo, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { useData } from "../hooks/useData";
import { Material, MaterialIssueLine, MaterialIssueReelLine, MaterialReturnReelLine, Production, ProductionProcessing, Setting } from "../types";
import { buildReelTransferContext, DEFAULT_REEL_TRANSFER_WINDOW_HOURS } from "../lib/reelTransfer";
import { normalizeMachineName } from "../lib/productionMachineNames";
import { Spinner } from "../components/Spinner";
import { Select } from "../components/Select";
import { useNavigate, useSearchParams } from "react-router-dom";

const today = () => new Date().toISOString().slice(0, 10);

export function ReelTransferForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [productions, , productionsLoading] = useData<Production>("productions", []);
  const [processing, , processingLoading] = useData<ProductionProcessing>("production_processing", []);
  const [issueReels, , issuesLoading] = useData<MaterialIssueReelLine>("material_issue_reel_lines", []);
  const [returnReels, , returnsLoading] = useData<MaterialReturnReelLine>("material_return_reel_lines", []);
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
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const windowHours = Number(settings[0]?.reelTransferWindowHours || DEFAULT_REEL_TRANSFER_WINDOW_HOURS);
  const contexts = useMemo(() => new Map(productions.map((production) => [production.id, buildReelTransferContext(production, processing, issueReels, returnReels, issueLines, productions, windowHours)])), [productions, processing, issueReels, returnReels, issueLines, windowHours]);
  const sourceOptions = productions.filter((p) => p.status !== "Cancelled" && !p.cancelTimestamp && contexts.get(p.id)?.eligible).map((p) => ({ value: p.id, label: String(p.transactionNo) }));
  const sourceContext = contexts.get(sourceId);
  const normalizeJobNo = (value: unknown) => String(value || "").trim().toLowerCase();
  const targetOptions = productions.filter((p) =>
    p.id !== sourceId &&
    p.status !== "Cancelled" &&
    p.status !== "Completed" &&
    !p.cancelTimestamp &&
    !p.tallyTimestamp &&
    !issueReels.some((row) => row.productionId === p.id || normalizeJobNo(row.jobNo) === normalizeJobNo(p.transactionNo)) &&
    !processing.some((row) => row.productionId === p.id && normalizeMachineName(row.machineName) === "Corrugation Liner")
  ).map((p) => ({ value: p.id, label: String(p.transactionNo) }));
  const materialMap = new Map(materials.map((row) => [row.id, row]));
  const selectedRows = (sourceContext?.reels || []).filter((row) => selectedSlips.includes(row.packingSlipId));
  const totalWeight = selectedRows.reduce((sum, row) => sum + row.transferWeightKg, 0);
  const totalAmount = selectedRows.reduce((sum, row) => sum + row.amount, 0);

  const handleSource = (value: string) => { setSourceId(value); setTargetId(""); setSelectedSlips([]); };
  const toggleReel = (id: string) => setSelectedSlips((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !sourceId || !targetId || !selectedSlips.length) return;
    setSaving(true);
    try {
      const token = localStorage.getItem("authToken") || "";
      const response = await fetch("/api/reel-transfers/execute", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ date, sourceProductionId: sourceId, targetProductionId: targetId, packingSlipIds: selectedSlips, remarks }) });
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
      setSelectedSlips([]); setTargetId(""); setRemarks("");
      if (returnTo) navigate(returnTo);
    } catch (error) { alert(error instanceof Error ? error.message : "Failed to transfer reels."); }
    finally { setSaving(false); }
  };

  if (productionsLoading || processingLoading || issuesLoading || returnsLoading) return <Spinner />;
  return <div className="rounded border border-black bg-white p-3 text-black shadow-sm md:p-6">
    <div className="mb-5 flex items-center justify-between gap-3 border-b border-black pb-2">
      <h2 className="text-xl font-bold uppercase tracking-tight">Job Transfer - Reel Balance</h2>
      {returnTo ? <button type="button" onClick={() => navigate(returnTo)} className="rounded border border-black bg-white px-3 py-1.5 text-xs font-bold uppercase hover:bg-slate-100">Back to Job Transfer</button> : null}
    </div>
    <form onSubmit={submit} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Transfer Date"><input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded border-2 border-black p-2" /></Field>
        <Field label="Transfer No."><input value="Auto" readOnly className="w-full rounded border-2 border-black bg-slate-100 p-2" /></Field>
        <Field label="Source Job No."><Select disabled={lockSource} options={sourceOptions} value={sourceId} onChange={handleSource} placeholder="Select eligible source job..." /></Field>
        <Field label="Target Job No.">
          <Select disabled={!sourceId} options={targetOptions} value={targetId} onChange={setTargetId} placeholder="Select job with no reel issue..." noOptionsMessage="No target: reel issue must be empty and Corrugation must not be started." />
          {sourceId && targetOptions.length === 0 ? <div className="mt-1 text-[11px] font-bold text-amber-700">No target job is available. The target must have no reel issue and Corrugation Liner must not be started.</div> : null}
        </Field>
        <Field label="Remarks"><input value={remarks} onChange={(e) => setRemarks(e.target.value)} className="w-full rounded border-2 border-black p-2" /></Field>
        <Field label={`Transfer Window (${windowHours} Hours)`}><input readOnly value={sourceContext?.expiresAt ? new Date(sourceContext.expiresAt).toLocaleString() : "Select source job"} className="w-full rounded border-2 border-black bg-slate-100 p-2" /></Field>
      </div>
      {sourceContext ? (
        <section className="space-y-3 border border-black bg-slate-50 p-3">
          <div className="text-xs font-black uppercase tracking-wide text-slate-700">Reel Required Calculation</div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 xl:grid-cols-5">
            <Metric label="Plan Qty" value={sourceContext.planQty} />
            <Metric label="Required Reel KG (Total Paper Wt)" value={sourceContext.requiredKg} />
            <Metric label="Total Issued KG" value={sourceContext.totalIssuedKg} />
            <Metric label="Total Returned KG" value={sourceContext.totalReturnedKg} />
            <Metric label="Corrugation Qty" value={sourceContext.corrugationQty} />
            <Metric label="Consumed KG" value={sourceContext.consumedKg} />
            <Metric label="Outstanding Reel Count" value={sourceContext.outstandingReelCount} decimals={0} />
            <Metric label="Notional Left KG" value={sourceContext.notionalLeftKg} />
            <Metric label="Average / Reel KG" value={sourceContext.averageNotionalKg} />
          </div>
          <div className="grid gap-1 border-t border-slate-300 pt-3 text-[11px] font-bold text-slate-700 lg:grid-cols-2">
            <div>Consumed KG = Corrugation Qty ÷ Plan Qty × Required Reel KG</div>
            <div>Notional Left KG = Max(0, Issued KG − Returned KG − Consumed KG)</div>
            <div>Average / Reel KG = Notional Left KG ÷ Outstanding Reel Count</div>
            <div>Transfer KG per reel = Min(Actual Balance, Average / Reel KG)</div>
          </div>
        </section>
      ) : null}
      <div className="overflow-x-auto rounded border border-black"><table className="w-full border-collapse text-sm"><thead className="bg-slate-100"><tr>{["Select", "Reel No.", "Material / ERP", "Actual Balance", "Transfer KG", "Rate", "Amount"].map((h) => <th key={h} className="border border-black p-2 text-left uppercase">{h}</th>)}</tr></thead><tbody>
        {!sourceContext?.reels.length ? <tr><td colSpan={7} className="p-5 text-center text-slate-500">Select an eligible source job.</td></tr> : sourceContext.reels.map((row) => <tr key={row.packingSlipId}><td className="border border-black p-2"><input type="checkbox" checked={selectedSlips.includes(row.packingSlipId)} onChange={() => toggleReel(row.packingSlipId)} /></td><td className="border border-black p-2 font-bold">{row.ourReelNo}</td><td className="border border-black p-2">{materialMap.get(row.materialId)?.name || row.materialId}<br/><span className="text-xs text-slate-500">{materialMap.get(row.materialId)?.erpCode || ""}</span></td><td className="border border-black p-2 text-right">{row.weightKg.toFixed(2)}</td><td className="border border-black p-2 text-right font-bold">{row.transferWeightKg.toFixed(2)}</td><td className="border border-black p-2 text-right">{row.rate.toFixed(2)}</td><td className="border border-black p-2 text-right">{row.amount.toFixed(2)}</td></tr>)}
      </tbody></table></div>
      <div className="flex flex-col items-end justify-between gap-3 border-2 border-black bg-slate-950 p-4 text-white md:flex-row md:items-center"><div><div className="text-xs font-bold uppercase text-slate-300">Transfer Total</div><div className="text-xl font-black">{totalWeight.toFixed(2)} KG &nbsp; | &nbsp; {totalAmount.toFixed(2)}</div></div><button disabled={saving || !sourceId || !targetId || !selectedSlips.length} className="inline-flex items-center gap-2 rounded bg-indigo-600 px-6 py-3 font-black uppercase hover:bg-indigo-700 disabled:opacity-50"><ArrowRightLeft size={18}/>{saving ? "Saving..." : "Save Reel Transfer"}</button></div>
    </form>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="space-y-1"><span className="block text-xs font-black uppercase">{label}</span>{children}</label>; }
function Metric({ label, value, decimals = 2 }: { label: string; value: number; decimals?: number }) { return <div className="rounded border border-slate-300 bg-white p-2"><div className="font-black uppercase text-slate-500">{label}</div><div className="mt-1 text-base font-bold">{Number(value || 0).toFixed(decimals)}</div></div>; }
