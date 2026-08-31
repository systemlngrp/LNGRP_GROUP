import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, RotateCcw } from "lucide-react";
import { useData } from "../hooks/useData";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { getAllReturnableReelLines } from "../lib/materialMovement";
import { isCorrugationLinerComplete } from "../lib/productionProcessingProgress";
import type { MaterialIssueReelLine, MaterialReturnReelLine, Production, ProductionProcessing } from "../types";

export function PendingMaterialReturn() {
  const navigate = useNavigate();
  const [productions] = useData<Production>("productions", []);
  const [issueReels] = useData<MaterialIssueReelLine>("material-issue-reel-lines", []);
  const [returnReels] = useData<MaterialReturnReelLine>("material-return-reel-lines", []);
  const [processing] = useData<ProductionProcessing>("production_processing", []);
  const { findItemAcrossSources } = useOrderItemCatalog();

  const rows = useMemo(() => {
    const returnable = getAllReturnableReelLines(issueReels, returnReels, productions);
    const byProduction = new Map<string, { reelIds: Set<string>; weight: number }>();
    returnable.forEach((line) => {
      const current = byProduction.get(line.productionId) || { reelIds: new Set<string>(), weight: 0 };
      current.reelIds.add(line.packingSlipId);
      current.weight += Number(line.weightKg || 0);
      byProduction.set(line.productionId, current);
    });

    return productions
      .filter((production) => production.status !== "Cancelled" && byProduction.has(production.id) && isCorrugationLinerComplete(processing, production.id))
      .map((production) => {
        const totals = byProduction.get(production.id)!;
        const item = findItemAcrossSources(
          String(production.itemId || "").trim(),
          production.itemSource,
          production.erpCode || production.masterErp
        );
        return {
          production,
          company: String(production.companyName || "-").trim() || "-",
          item: String(item?.name || production.erpCode || production.masterErp || "-").trim() || "-",
          reelCount: totals.reelIds.size,
          weight: Number(totals.weight.toFixed(2)),
        };
      })
      .sort((a, b) => String(b.production.date || "").localeCompare(String(a.production.date || "")));
  }, [findItemAcrossSources, issueReels, processing, productions, returnReels]);

  const openReturn = (production: Production, mode: "manual" | "qr") => {
    const params = new URLSearchParams({
      productionId: production.id,
      lockJob: "1",
      returnTo: "/production/pending-material-return",
    });
    const path = mode === "qr" ? "/material-movement/reel-return/qr" : "/material-movement/reel-return";
    navigate(`${path}?${params.toString()}`);
  };

  return (
    <div className="space-y-5 text-black">
      <div className="border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight">Pending Material Return</h2>
        <p className="mt-1 text-sm font-medium text-slate-600">FG jobs with issued reel weight available for return.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded border border-black bg-white p-4 shadow-sm">
          <div className="text-xs font-bold uppercase text-slate-500">Pending Jobs</div>
          <div className="mt-1 text-2xl font-black">{rows.length}</div>
        </div>
        <div className="rounded border border-black bg-white p-4 shadow-sm">
          <div className="text-xs font-bold uppercase text-slate-500">Returnable Reels</div>
          <div className="mt-1 text-2xl font-black">{rows.reduce((sum, row) => sum + row.reelCount, 0)}</div>
        </div>
        <div className="rounded border border-black bg-white p-4 shadow-sm">
          <div className="text-xs font-bold uppercase text-slate-500">Returnable Weight</div>
          <div className="mt-1 text-2xl font-black">{rows.reduce((sum, row) => sum + row.weight, 0).toFixed(2)} KG</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-black bg-white shadow-sm">
        <table className="min-w-full border-collapse">
          <thead className="bg-slate-800 text-white">
            <tr>
              {["Job No.", "Date", "Company", "Item", "Reels", "Returnable KG", "Actions"].map((heading) => (
                <th key={heading} className="border border-black px-3 py-3 text-left text-xs font-bold uppercase">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-10 text-center font-medium text-slate-500">No reel returns are pending.</td></tr>
            ) : rows.map(({ production, company, item, reelCount, weight }, index) => (
              <tr key={production.id} className={index % 2 ? "bg-slate-50" : "bg-white"}>
                <td className="border border-black px-3 py-3 text-sm font-bold">{production.transactionNo}</td>
                <td className="border border-black px-3 py-3 text-sm">{String(production.date || "").slice(0, 10) || "-"}</td>
                <td className="border border-black px-3 py-3 text-sm">{company}</td>
                <td className="border border-black px-3 py-3 text-sm">{item}</td>
                <td className="border border-black px-3 py-3 text-right text-sm font-bold">{reelCount}</td>
                <td className="border border-black px-3 py-3 text-right text-sm font-bold">{weight.toFixed(2)}</td>
                <td className="border border-black px-3 py-3">
                  <div className="flex gap-2 whitespace-nowrap">
                    <button type="button" onClick={() => openReturn(production, "manual")} className="inline-flex items-center gap-1 rounded border border-black bg-indigo-600 px-3 py-1.5 text-xs font-bold uppercase text-white">
                      <RotateCcw size={14} /> Manual Return
                    </button>
                    <button type="button" onClick={() => openReturn(production, "qr")} className="inline-flex items-center gap-1 rounded border border-black bg-emerald-600 px-3 py-1.5 text-xs font-bold uppercase text-white">
                      <Camera size={14} /> QR Return
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
