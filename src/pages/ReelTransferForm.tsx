import { useMemo, useState } from "react";
import { ArrowRightLeft, CheckCircle2, CircleAlert, PackageCheck, Scale } from "lucide-react";
import { useData } from "../hooks/useData";
import { Material, MaterialIssueLine, MaterialIssueReelLine, MaterialReturnReelLine, Production, ProductionProcessing, Setting } from "../types";
import { buildReelTransferContext, DEFAULT_REEL_TRANSFER_WINDOW_HOURS } from "../lib/reelTransfer";
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
  const allocationBySlip = useMemo(() => new Map(selectedRows.map((row) => [row.packingSlipId, row.transferWeightKg])), [selectedRows]);
  const totalWeight = selectedRows.reduce((sum, row) => sum + row.transferWeightKg, 0);
  const totalAmount = selectedRows.reduce((sum, row) => sum + row.transferWeightKg * row.rate, 0);
  const sourceAvailableWeight = (sourceContext?.reels || []).reduce((sum, row) => sum + row.weightKg, 0);
  const isReadyToSave = Boolean(sourceId && targetId && selectedSlips.length && totalWeight > 0);

  const handleSource = (value: string) => { setSourceId(value); setTargetId(""); setSelectedSlips([]); };
  const toggleReel = (id: string) => setSelectedSlips((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const selectAllReels = () => setSelectedSlips((sourceContext?.reels || []).map((row) => row.packingSlipId));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !isReadyToSave) return;
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
  return <div className="mx-auto max-w-7xl space-y-4 text-slate-950">
    <div className="rounded-xl border border-slate-900 bg-slate-950 px-4 py-4 text-white shadow-sm md:px-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center"><div><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-indigo-300"><ArrowRightLeft size={15} /> Production / Job Transfer</div><h2 className="mt-1 text-2xl font-black tracking-tight">Transfer Reel Balance</h2><p className="mt-1 text-sm text-slate-300">Move available Unit-I reels from a completed source job to an active target job.</p></div>{returnTo ? <button type="button" onClick={() => navigate(returnTo)} className="rounded-lg border border-slate-500 bg-white px-4 py-2 text-xs font-black uppercase text-slate-900 hover:bg-slate-100">Back to Job Transfer</button> : null}</div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><Step number="1" label="Source job" active={Boolean(sourceId)} /><Step number="2" label="Target job" active={Boolean(targetId)} /><Step number="3" label="Select reels" active={Boolean(selectedSlips.length)} /><Step number="4" label="Save transfer" active={isReadyToSave} /></div>
    </div>
    <form onSubmit={submit} className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-5"><div className="mb-4 flex items-center gap-2"><PackageCheck className="text-indigo-600" size={20} /><div><h3 className="font-black">1. Choose the jobs</h3><p className="text-xs text-slate-500">Source Corrugation Liner must be Full and within its transfer window. Target must be active with no reel issue or Corrugation Liner entry.</p></div></div><div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Transfer Date"><input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100" /></Field>
        <Field label="Transfer No."><input value="Auto-generated" readOnly className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2.5 text-sm font-semibold text-slate-500" /></Field>
        <Field label="Original / Eligible Job"><Select disabled={lockSource} options={sourceOptions} value={sourceId} onChange={handleSource} placeholder="Select eligible source job..." /></Field>
        <Field label="Transfer Job">
          <Select disabled={!sourceId} options={targetOptions} value={targetId} onChange={setTargetId} placeholder="Select active job with no reel issue..." noOptionsMessage="No active target: reel issue must be empty and Corrugation must not be started." />
          {sourceId && targetOptions.length === 0 ? <div className="mt-1 text-[11px] font-bold text-amber-700">No active target job is available. The target must have no reel issue and Corrugation Liner must not be started.</div> : null}
        </Field>
        <Field label="Transfer Window"><input readOnly value={sourceContext?.expiresAt ? new Date(sourceContext.expiresAt).toLocaleString() : "Select source job"} className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2.5 text-sm font-semibold text-slate-600" /></Field>
      </div></section>
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-5"><div className="grid gap-4 lg:grid-cols-[1fr_360px]"><div><div className="flex items-center gap-2"><Scale className="text-indigo-600" size={20} /><div><h3 className="font-black">2. Select notional reel balances</h3><p className="text-xs text-slate-500">Each selected reel transfers its proportional Notional Left KG after Corrugation consumption. No weight entry is required.</p></div></div><Field label="Remarks" className="mt-4 max-w-2xl"><input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional transfer note" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100" /></Field></div><div className="rounded-xl border-2 border-indigo-600 bg-indigo-50 p-4"><div className="text-xs font-black uppercase tracking-wide text-indigo-950">Automatic transfer total</div><div className="mt-2 text-3xl font-black tabular-nums text-indigo-950">{totalWeight.toFixed(2)} <span className="text-base">KG</span></div><div className="mt-2 text-xs font-semibold text-indigo-900">Proportional Notional Left KG for {selectedSlips.length} selected reel{selectedSlips.length === 1 ? "" : "s"}</div></div></div></section>
      {sourceContext ? (
        <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Original issued" value={`${sourceContext.totalIssuedKg.toFixed(2)} KG`} />
          <StatCard label="Already returned" value={`${sourceContext.totalReturnedKg.toFixed(2)} KG`} />
          <StatCard label="Consumed" value={`${sourceContext.consumedKg.toFixed(2)} KG`} />
          <StatCard label="Notional left" value={`${sourceContext.notionalLeftKg.toFixed(2)} KG`} accent />
          <StatCard label="Available balance" value={`${sourceAvailableWeight.toFixed(2)} KG`} accent />
          <StatCard label="Available reels" value={String(sourceContext.outstandingReelCount)} />
        </section>
      ) : null}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col justify-between gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center"><div><h3 className="font-black">3. Select reels to transfer</h3><p className="text-xs text-slate-500">Transfer KG is each reel’s proportional Notional Left share, capped by actual available balance.</p></div><div className="flex items-center gap-2"><button type="button" disabled={!sourceContext?.reels.length} onClick={selectAllReels} className="rounded border border-slate-300 px-3 py-1.5 text-xs font-bold hover:bg-slate-50 disabled:opacity-40">Select all</button><button type="button" disabled={!selectedSlips.length} onClick={() => setSelectedSlips([])} className="rounded border border-slate-300 px-3 py-1.5 text-xs font-bold hover:bg-slate-50 disabled:opacity-40">Clear</button><span className="rounded-full bg-indigo-100 px-3 py-1.5 text-xs font-black text-indigo-800">{selectedSlips.length} selected</span></div></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-600"><tr>{["Select", "Reel / QR", "Material", "Original issued", "Available balance", "Notional transfer KG", "Rate", "Amount"].map((h) => <th key={h} className="whitespace-nowrap px-4 py-3 text-left font-black">{h}</th>)}</tr></thead><tbody>
        {!sourceContext?.reels.length ? <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-500">Select an eligible source job to see its available reels.</td></tr> : sourceContext.reels.map((row) => {
          const selected = selectedSlips.includes(row.packingSlipId);
          const allocatedKg = allocationBySlip.get(row.packingSlipId) || 0;
          return <tr key={row.packingSlipId} className={`border-t border-slate-100 transition-colors ${selected ? "bg-indigo-50/80" : "hover:bg-slate-50"}`}>
            <td className="px-4 py-3"><input aria-label={`Select reel ${row.ourReelNo}`} type="checkbox" checked={selected} onChange={() => toggleReel(row.packingSlipId)} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" /></td>
            <td className="px-4 py-3 font-black text-slate-900"><div>{row.ourReelNo}</div><div className="mt-0.5 max-w-40 truncate font-mono text-[10px] font-medium text-slate-500" title={row.packingSlipId}>{row.packingSlipId}</div></td>
            <td className="px-4 py-3"><div className="max-w-72 truncate font-semibold text-slate-800" title={materialMap.get(row.materialId)?.name || row.materialId}>{materialMap.get(row.materialId)?.name || row.materialId}</div><div className="mt-0.5 text-xs text-slate-500">{materialMap.get(row.materialId)?.erpCode || "—"}</div></td>
            <td className="px-4 py-3 text-right font-semibold tabular-nums">{row.originalIssuedWeightKg.toFixed(2)}</td>
            <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-800">{row.weightKg.toFixed(2)}</td>
            <td className="px-4 py-3 text-right"><span className={`inline-flex min-w-16 justify-end rounded-md px-2 py-1 font-black tabular-nums ${selected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400"}`}>{allocatedKg.toFixed(2)}</span></td>
            <td className="px-4 py-3 text-right tabular-nums text-slate-600">{row.rate.toFixed(2)}</td>
            <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-800">{(allocatedKg * row.rate).toFixed(2)}</td>
          </tr>;
        })}
      </tbody></table></div></section>
      <div className="sticky bottom-3 z-10 flex flex-col justify-between gap-4 rounded-xl border border-slate-900 bg-slate-950 p-4 text-white shadow-xl md:flex-row md:items-center"><div className="flex items-start gap-3"><div className={`mt-0.5 rounded-full p-1 ${isReadyToSave ? "bg-emerald-400 text-emerald-950" : "bg-amber-300 text-amber-950"}`}>{isReadyToSave ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}</div><div><div className="text-xs font-bold uppercase tracking-wide text-slate-300">Transfer summary</div><div className="mt-1 text-2xl font-black tabular-nums">{totalWeight.toFixed(2)} KG <span className="text-sm font-semibold text-slate-400">/ {selectedSlips.length} reel{selectedSlips.length === 1 ? "" : "s"}</span></div><div className={`mt-1 text-xs font-semibold ${isReadyToSave ? "text-emerald-300" : "text-amber-300"}`}>{isReadyToSave ? "Notional transfer balances are ready to transfer." : "Choose a source job, target job, and at least one reel."}</div></div></div><button disabled={saving || !isReadyToSave} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-500 px-6 py-3 text-sm font-black uppercase tracking-wide text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-600"><ArrowRightLeft size={18}/>{saving ? "Saving transfer..." : "Save Reel Transfer"}</button></div>
    </form>
  </div>;
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) { return <label className={`block space-y-1.5 ${className}`}><span className="block text-xs font-black uppercase tracking-wide text-slate-700">{label}</span>{children}</label>; }
function Step({ number, label, active }: { number: string; label: string; active: boolean }) { return <div className={`flex items-center gap-2 rounded-lg px-2 py-2 ${active ? "bg-indigo-500 text-white" : "bg-white/10 text-slate-300"}`}><span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ${active ? "bg-white text-indigo-700" : "bg-white/20"}`}>{number}</span><span className="truncate font-bold">{label}</span></div>; }
function StatCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <div className={`rounded-xl border bg-white p-4 shadow-sm ${accent ? "border-indigo-300" : "border-slate-200"}`}><div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</div><div className={`mt-1 text-xl font-black tabular-nums ${accent ? "text-indigo-700" : "text-slate-950"}`}>{value}</div></div>; }
