import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRightLeft } from "lucide-react";
import { useData } from "../hooks/useData";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { TableControls } from "../components/TableControls";
import { buildReelTransferContext, DEFAULT_REEL_TRANSFER_WINDOW_HOURS, hasReelIssueHistory } from "../lib/reelTransfer";
import { formatDate } from "../lib/utils";
import type { MaterialIssueLine, MaterialIssueReelLine, MaterialReturnReelLine, Production, ProductionProcessing, Setting } from "../types";

export function PendingJobTransfer() {
  const navigate = useNavigate();
  const [productions] = useData<Production>("productions", []);
  const [processing] = useData<ProductionProcessing>("production_processing", []);
  const [issueReels] = useData<MaterialIssueReelLine>("material_issue_reel_lines", []);
  const [returnReels] = useData<MaterialReturnReelLine>("material_return_reel_lines", []);
  const [issueLines] = useData<MaterialIssueLine>("material_issue_lines", []);
  const [settings] = useData<Setting>("settings", []);
  const [searchTerm, setSearchTerm] = useState("");
  const { findItemAcrossSources } = useOrderItemCatalog();
  const windowHours = Number(settings[0]?.reelTransferWindowHours || DEFAULT_REEL_TRANSFER_WINDOW_HOURS);

  const rows = useMemo(() => {
    return productions
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
        transferableReels: context.reels.filter((reel) => Number(reel.transferWeightKg || 0) > 0),
      };
    })
    .filter((row) => row.context.fullTime > 0 && row.context.status !== "window_expired" && hasReelIssueHistory(row.production, issueReels) && row.transferableReels.length > 0)
      .sort((a, b) => Number(b.context.eligible) - Number(a.context.eligible) || b.context.fullTime - a.context.fullTime);
  }, [findItemAcrossSources, issueLines, issueReels, processing, productions, returnReels, windowHours]);

  const filteredRows = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(({ production, company, item, context }) =>
      [production.transactionNo, production.jobCardNo, production.date, company, item, ...context.reels.map((reel) => reel.ourReelNo)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [rows, searchTerm]);

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
      <div className="flex flex-col gap-3 border-b border-black pb-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold uppercase tracking-tight">Job Transfer</h2>
        <TableControls
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          placeholder="Search job, company, item, reel..."
        />
      </div>

      <div className="overflow-x-auto rounded border border-black bg-white shadow-sm">
        <table className="min-w-full border-collapse">
          <thead className="bg-slate-800 text-white">
            <tr>
              {["Source Job", "Date", "Company", "Item", "Reels", "Transferable KG", "Action"].map((heading) => (
                <th key={heading} className="border border-black px-3 py-3 text-left text-xs font-bold uppercase">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-10 text-center font-medium text-slate-500">{rows.length ? "No jobs match the current search." : "No jobs are currently eligible for reel balance transfer."}</td></tr>
            ) : filteredRows.map(({ production, context, company, item, transferableReels }, index) => (
              <tr key={production.id} className={index % 2 ? "bg-slate-50" : "bg-white"}>
                <td className="border border-black px-3 py-3 text-sm font-bold">{production.transactionNo}</td>
                <td className="border border-black px-3 py-3 text-sm whitespace-nowrap">{formatDate(production.date)}</td>
                <td className="border border-black px-3 py-3 text-sm">{company}</td>
                <td className="border border-black px-3 py-3 text-sm">{item}</td>
                <td className="border border-black px-3 py-3 text-right text-sm font-bold">{transferableReels.length}</td>
                <td className="border border-black px-3 py-3 text-right text-sm font-bold">{transferableReels.reduce((sum, reel) => sum + Number(reel.transferWeightKg || 0), 0).toFixed(2)}</td>
                <td className="border border-black px-3 py-3">
                  <span className="inline-block" title={context.eligible ? "Transfer reel balance" : context.reason}>
                    <button type="button" disabled={!context.eligible} onClick={() => openTransfer(production.id)} className="inline-flex items-center gap-2 whitespace-nowrap rounded border border-black bg-indigo-600 px-3 py-1.5 text-xs font-bold uppercase text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-400">
                      <ArrowRightLeft size={15} /> Transfer
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
