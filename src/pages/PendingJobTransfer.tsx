import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRightLeft } from "lucide-react";
import { useData } from "../hooks/useData";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { buildReelTransferContext, DEFAULT_REEL_TRANSFER_WINDOW_HOURS } from "../lib/reelTransfer";
import type { MaterialIssueLine, MaterialIssueReelLine, MaterialReturnReelLine, Production, ProductionProcessing, Setting } from "../types";

export function PendingJobTransfer() {
  const navigate = useNavigate();
  const [productions] = useData<Production>("productions", []);
  const [processing] = useData<ProductionProcessing>("production_processing", []);
  const [issueReels] = useData<MaterialIssueReelLine>("material_issue_reel_lines", []);
  const [returnReels] = useData<MaterialReturnReelLine>("material_return_reel_lines", []);
  const [issueLines] = useData<MaterialIssueLine>("material_issue_lines", []);
  const [settings] = useData<Setting>("settings", []);
  const { findItemAcrossSources } = useOrderItemCatalog();
  const windowHours = Number(settings[0]?.reelTransferWindowHours || DEFAULT_REEL_TRANSFER_WINDOW_HOURS);

  const rows = useMemo(() => productions
    .filter((production) => production.status !== "Cancelled" && !production.cancelTimestamp)
    .map((production) => {
      const context = buildReelTransferContext(production, processing, issueReels, returnReels, issueLines, productions, windowHours);
      const item = findItemAcrossSources(
        String(production.itemId || "").trim(),
        production.itemSource,
        production.erpCode || production.masterErp
      );
      return {
        production,
        context,
        company: String(production.companyName || "-").trim() || "-",
        item: String(item?.name || production.erpCode || production.masterErp || "-").trim() || "-",
        transferableWeight: context.reels.reduce((sum, reel) => sum + Number(reel.transferWeightKg || 0), 0),
      };
    })
    .filter((row) => row.context.eligible)
    .sort((a, b) => a.context.expiresAt - b.context.expiresAt),
  [findItemAcrossSources, issueLines, issueReels, processing, productions, returnReels, windowHours]);

  const openTransfer = (productionId: string) => {
    const params = new URLSearchParams({
      sourceProductionId: productionId,
      lockSource: "1",
      returnTo: "/production/pending-job-transfer",
    });
    navigate(`/material-movement/reel-transfer?${params.toString()}`);
  };

  return (
    <div className="space-y-5 text-black">
      <div className="border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight">Job Transfer</h2>
        <p className="mt-1 text-sm font-medium text-slate-600">Eligible FG jobs with reel balance available to transfer to another job.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric label="Eligible Source Jobs" value={String(rows.length)} />
        <Metric label="Eligible Reels" value={String(rows.reduce((sum, row) => sum + row.context.reels.length, 0))} />
        <Metric label="Transferable Weight" value={`${rows.reduce((sum, row) => sum + row.transferableWeight, 0).toFixed(2)} KG`} />
      </div>

      <div className="overflow-x-auto rounded border border-black bg-white shadow-sm">
        <table className="min-w-full border-collapse">
          <thead className="bg-slate-800 text-white">
            <tr>
              {["Source Job", "Date", "Company", "Item", "Reels", "Transferable KG", "Window Expires", "Status", "Action"].map((heading) => (
                <th key={heading} className="border border-black px-3 py-3 text-left text-xs font-bold uppercase">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="px-6 py-10 text-center font-medium text-slate-500">No jobs are currently eligible for reel balance transfer.</td></tr>
            ) : rows.map(({ production, context, company, item, transferableWeight }, index) => (
              <tr key={production.id} className={index % 2 ? "bg-slate-50" : "bg-white"}>
                <td className="border border-black px-3 py-3 text-sm font-bold">{production.transactionNo}</td>
                <td className="border border-black px-3 py-3 text-sm">{String(production.date || "").slice(0, 10) || "-"}</td>
                <td className="border border-black px-3 py-3 text-sm">{company}</td>
                <td className="border border-black px-3 py-3 text-sm">{item}</td>
                <td className="border border-black px-3 py-3 text-right text-sm font-bold">{context.reels.length}</td>
                <td className="border border-black px-3 py-3 text-right text-sm font-bold">{transferableWeight.toFixed(2)}</td>
                <td className="border border-black px-3 py-3 text-sm">{new Date(context.expiresAt).toLocaleString()}</td>
                <td className="border border-black px-3 py-3"><span className="rounded border border-emerald-700 bg-emerald-50 px-2 py-1 text-xs font-bold uppercase text-emerald-800">Eligible</span></td>
                <td className="border border-black px-3 py-3">
                  <button type="button" onClick={() => openTransfer(production.id)} className="inline-flex items-center gap-2 whitespace-nowrap rounded border border-black bg-indigo-600 px-3 py-1.5 text-xs font-bold uppercase text-white hover:bg-indigo-700">
                    <ArrowRightLeft size={15} /> Transfer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded border border-black bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase text-slate-500">{label}</div><div className="mt-1 text-2xl font-black">{value}</div></div>;
}
