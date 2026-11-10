import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRightLeft, Search } from "lucide-react";
import { useData } from "../hooks/useData";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { Select } from "../components/Select";
import { buildReelIssueHistoryChecker, buildReelTransferContexts, DEFAULT_REEL_TRANSFER_WINDOW_HOURS } from "../lib/reelTransfer";
import { formatDate } from "../lib/utils";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";
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
  const [companyFilter, setCompanyFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [fromDateFilter, setFromDateFilter] = useState("");
  const [toDateFilter, setToDateFilter] = useState("");
  const { findItemAcrossSources } = useOrderItemCatalog();
  const windowHours = Number(settings[0]?.reelTransferWindowHours || DEFAULT_REEL_TRANSFER_WINDOW_HOURS);

  const rows = useMemo(() => {
    // Indexed once per data change (same results as checking every reel and
    // processing list once per job, which froze this screen).
    const activeProductions = productions.filter((production) => production.status !== "Cancelled" && !production.cancelTimestamp);
    const contexts = buildReelTransferContexts(productions, processing, issueReels, returnReels, issueLines, windowHours);
    const hasIssueHistory = buildReelIssueHistoryChecker(issueReels);
    return activeProductions
    .map((production) => {
      const context = contexts.get(production.id)!;
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
    .filter((row) => row.context.fullTime > 0 && row.context.status !== "window_expired" && hasIssueHistory(row.production) && row.transferableReels.length > 0)
      .sort((a, b) => Number(b.context.eligible) - Number(a.context.eligible) || b.context.fullTime - a.context.fullTime);
  }, [findItemAcrossSources, issueLines, issueReels, processing, productions, returnReels, windowHours]);

  const companyOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.company).filter((value) => value && value !== "-")))
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({ value, label: value })),
    [rows]
  );
  const itemOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.item).filter((value) => value && value !== "-")))
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({ value, label: value })),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const words = searchWords(searchTerm);
    return rows.filter(({ production, company, item, transferableReels }) => {
      const jobDate = String(production.date || "").slice(0, 10);
      if (companyFilter && company !== companyFilter) return false;
      if (itemFilter && item !== itemFilter) return false;
      if (fromDateFilter && (!jobDate || jobDate < fromDateFilter)) return false;
      if (toDateFilter && (!jobDate || jobDate > toDateFilter)) return false;
      return matchesTableSearch([
        production.transactionNo,
        production.date,
        company,
        item,
        transferableReels.length,
        transferableReels.reduce((sum, reel) => sum + Number(reel.transferWeightKg || 0), 0).toFixed(2),
      ], words);
    });
  }, [companyFilter, fromDateFilter, itemFilter, rows, searchTerm, toDateFilter]);
  const hasActiveFilters = Boolean(searchTerm.trim() || companyFilter || itemFilter || fromDateFilter || toDateFilter);
  const clearFilters = () => {
    setSearchTerm("");
    setCompanyFilter("");
    setItemFilter("");
    setFromDateFilter("");
    setToDateFilter("");
  };

  const { sorted: sortedRows, sort, toggle: toggleSort } = useTableSort(filteredRows, (row, key) => {
    if (key === "jobNo") return row.production.transactionNo;
    if (key === "date") return row.production.date;
    if (key === "company") return row.company;
    if (key === "item") return row.item;
    if (key === "reels") return row.transferableReels.length;
    if (key === "weight") return Number(row.transferableReels.reduce((sum, reel) => sum + Number(reel.transferWeightKg || 0), 0).toFixed(2));
    return "";
  });

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
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">Job Transfer</h2>
      </div>

      <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Company</span><Select compact value={companyFilter} onChange={setCompanyFilter} options={companyOptions} placeholder="All" /></div>
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Item</span><Select compact value={itemFilter} onChange={setItemFilter} options={itemOptions} placeholder="All" /></div>
          <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Job From Date</span><input type="date" value={fromDateFilter} max={toDateFilter || undefined} onChange={(e) => setFromDateFilter(e.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
          <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Job To Date</span><input type="date" value={toDateFilter} min={fromDateFilter || undefined} onChange={(e) => setToDateFilter(e.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
        </div>
        <div data-mf-actions="true" className="flex justify-end gap-2">
          {hasActiveFilters ? (
            <button type="button" onClick={clearFilters} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button>
          ) : null}
          <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-black bg-white">
        <table className="min-w-full border-collapse">
          <thead className="bg-slate-800 text-white">
            <tr>
              {[["Source Job", "jobNo"], ["Date", "date"], ["Company", "company"], ["Item", "item"], ["Reels", "reels"], ["Transferable KG", "weight"], ["Action", ""]].map(([heading, key]) => (
                <th key={heading} className="border border-black px-3 py-3 text-left text-xs font-bold uppercase">{key ? <SortHeader label={heading} sortKey={key} sort={sort} onToggle={toggleSort} align="left" /> : heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr><td colSpan={7} className="h-16" aria-label="No records" /></tr>
            ) : sortedRows.map(({ production, context, company, item, transferableReels }, index) => (
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
