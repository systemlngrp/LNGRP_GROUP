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
  const targetOptions = productions.filter((p) => p.id !== sourceId && OPEN_TARGET_STATUSES.has(p.status) && !p.cancelTimestamp && !issueReels.some((row) => row.productionId === p.id || normalizeJobNo(row.jobNo) === normalizeJobNo(p.transactionNo)) && !processing.some((row) => row.productionId === p.id && normalizeMachineName(row.machineName) === "Corrugation Liner")).map((p) => ({ value: p.id, label: String(p.transactionNo) }));
  const materialMap = new Map(materials.map((row) => [row.id, row]));
  const selectedRows = (sourceContext?.reels || []).filter((row) => selectedSlips.includes(row.packingSlipId));
  const allocationBySlip = useMemo(() => new Map(selectedRows.map((row) => [row.packingSlipId, row.transferWeightKg])), [selectedRows]);
  const totalWeight = selectedRows.reduce((sum, row) => sum + row.transferWeightKg, 0);
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
      ["material_issues", "material-issues", "material_issue_lines", "material-issue-lines", "material_issue_reel_lines", "material-issue-reel-lines", "material_returns", "material-returns", "material_return_lines", "material-return-lines", "material_return_reel_lines", "material-return-reel-lines", "reel_transfers", "reel-transfers", "reel_transfer_lines", "reel-transfer-lines", "productions"].forEach((key) => window.dispatchEvent(new CustomEvent(`sync-data-${key}`)));
      alert(`Reel transfer ${result.transferNo} saved successfully.`);
      setSelectedSlips([]); setTargetId(""); setRemarks("");
      if (returnTo) navigate(returnTo);
    } catch (error) { alert(error instanceof Error ? error.message : "Failed to transfer reels."); }
    finally { setSaving(false); }
  };

  if (productionsLoading || processingLoading || issuesLoading || returnsLoading) return <Spinner />;
  return <div className="mx-auto max-w-7xl text-black">
    <form onSubmit={submit} className="space-y-4 rounded border border-black bg-white p-4 shadow-sm md:p-6">
      <div className="flex flex-col justify-between gap-3 border-b border-black pb-3 md:flex-row md:items-center">
        <h2 className="text-xl font-bold uppercase tracking-tight">Job Transfer</h2>
        {returnTo ? <button type="button" onClick={() => navigate(returnTo)} className="rounded border border-black bg-white px-3 py-2 text-xs font-bold uppercase hover:bg-slate-100">Back to Job Transfer</button> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Transfer Date"><input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded border-2 border-black p-2 text-sm" /></Field>
        <Field label="Original / Eligible Job"><Select disabled={lockSource} options={sourceOptions} value={sourceId} onChange={handleSource} placeholder="Select source job" /></Field>
        <Field label="Transfer Job"><Select disabled={!sourceId} options={targetOptions} value={targetId} onChange={setTargetId} placeholder="Select transfer job" noOptionsMessage="No eligible transfer job available." /></Field>
        <Field label="Remarks" className="md:col-span-2 xl:col-span-3"><input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Remarks" className="w-full rounded border-2 border-black p-2 text-sm" /></Field>
      </div>

      {sourceContext ? <section className="grid gap-3 border-y border-black py-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total Issued" value={`${sourceContext.totalIssuedKg.toFixed(2)} KG`} />
        <StatCard label="Returned" value={`${sourceContext.totalReturnedKg.toFixed(2)} KG`} />
        <StatCard label="Consumed" value={`${sourceContext.consumedKg.toFixed(2)} KG`} />
        <StatCard label="Notional Balance" value={`${sourceContext.notionalLeftKg.toFixed(2)} KG`} />
        <StatCard label="Actual Available" value={`${sourceAvailableWeight.toFixed(2)} KG`} />
      </section> : null}

      <section className="overflow-hidden rounded border border-black">
        <div className="flex flex-col justify-between gap-3 border-b border-black bg-slate-50 p-3 md:flex-row md:items-center"><h3 className="text-sm font-bold uppercase">Select Reels</h3><div className="flex items-center gap-2"><button type="button" disabled={!sourceContext?.reels.length} onClick={selectAllReels} className="rounded border border-black bg-white px-3 py-1.5 text-xs font-bold hover:bg-slate-100 disabled:opacity-40">Select All</button><button type="button" disabled={!selectedSlips.length} onClick={() => setSelectedSlips([])} className="rounded border border-black bg-white px-3 py-1.5 text-xs font-bold hover:bg-slate-100 disabled:opacity-40">Clear</button><span className="text-xs font-bold">{selectedSlips.length} Selected</span></div></div>
        <div className="overflow-x-auto"><table className="min-w-full border-collapse text-sm"><thead className="bg-slate-100 text-xs uppercase"><tr>{["Select", "Reel No. / QR", "Material / ERP", "Original Issued KG", "Available Balance KG", "Transfer KG"].map((heading) => <th key={heading} className="whitespace-nowrap border border-black px-3 py-2 text-left font-bold">{heading}</th>)}</tr></thead><tbody>
          {!sourceContext?.reels.length ? <tr><td colSpan={6} className="border border-black px-5 py-10 text-center text-sm text-slate-500">Select an eligible source job to view reels.</td></tr> : sourceContext.reels.map((row) => {
            const selected = selectedSlips.includes(row.packingSlipId);
            const allocatedKg = allocationBySlip.get(row.packingSlipId) || 0;
            const material = materialMap.get(row.materialId);
            return <tr key={row.packingSlipId} className={selected ? "bg-indigo-50" : "hover:bg-slate-50"}>
              <td className="border border-black px-3 py-2"><input aria-label={`Select reel ${row.ourReelNo}`} type="checkbox" checked={selected} onChange={() => toggleReel(row.packingSlipId)} className="h-4 w-4" /></td>
              <td className="border border-black px-3 py-2 font-bold"><div>{row.ourReelNo}</div><div className="mt-0.5 max-w-40 truncate font-mono text-[10px] font-normal text-slate-500" title={row.packingSlipId}>{row.packingSlipId}</div></td>
              <td className="border border-black px-3 py-2"><div className="max-w-72 truncate font-medium" title={material?.name || row.materialId}>{material?.name || row.materialId}</div><div className="mt-0.5 text-xs text-slate-500">{material?.erpCode || "-"}</div></td>
              <td className="border border-black px-3 py-2 text-right font-medium tabular-nums">{row.originalIssuedWeightKg.toFixed(2)}</td>
              <td className="border border-black px-3 py-2 text-right font-medium tabular-nums">{row.weightKg.toFixed(2)}</td>
              <td className="border border-black px-3 py-2 text-right font-bold tabular-nums">{allocatedKg.toFixed(2)}</td>
            </tr>;
          })}
        </tbody></table></div>
      </section>

      <div className="flex flex-col justify-between gap-3 border-t border-black pt-4 md:flex-row md:items-center"><div className="text-sm"><span className="font-bold">Transfer Total:</span> <span className="font-bold tabular-nums">{totalWeight.toFixed(2)} KG</span><span className="ml-3 text-slate-600">{selectedSlips.length} Reel{selectedSlips.length === 1 ? "" : "s"} Selected</span></div><button disabled={saving || !isReadyToSave} className="inline-flex items-center justify-center gap-2 rounded bg-indigo-600 px-5 py-2.5 text-sm font-bold uppercase text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-400"><ArrowRightLeft size={17} />{saving ? "Saving Transfer..." : "Save Reel Transfer"}</button></div>
    </form>
  </div>;
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) { return <label className={`block space-y-1 ${className}`}><span className="block text-xs font-bold uppercase text-slate-700">{label}</span>{children}</label>; }
function StatCard({ label, value }: { label: string; value: string }) { return <div className="rounded border border-black bg-white p-3"><div className="text-[10px] font-bold uppercase text-slate-600">{label}</div><div className="mt-1 text-lg font-bold tabular-nums">{value}</div></div>; }
