import React, { useEffect, useMemo, useState } from "react";
import { useData } from "../hooks/useData";
import {
  Material,
  MaterialIssue,
  MaterialIssueLine,
  MaterialIssueReelLine,
  MaterialReturn,
  MaterialReturnLine,
  MaterialReturnReelLine,
  Item,
  Production,
} from "../types";
import { Spinner } from "../components/Spinner";
import { formatDate } from "../lib/serial";
import { CheckCircle, Search } from "lucide-react";
import { ClientPagination } from "../components/ClientPagination";
import { Select } from "../components/Select";
import { DataSummaryTiles } from "../components/DataSummaryTiles";
import { useClientPagination } from "../hooks/useClientPagination";
import { cn } from "../lib/utils";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";
import {
  buildProductionCorrugatedSheetUsageMap,
  buildProductionMaterialUsageMap,
  getProductionActualPaperUsed,
  hasProductionCorrugatedSheetUsage,
} from "../lib/productionMaterialUsage";
import { isProductionReadyForTally } from "../lib/productionStageFilters";
import { useNpdItemsWithoutStock } from "../hooks/useNpdItems";
import { useAuth } from "../auth/AuthContext";
function normalizeTallyItemKey(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function resolveProductionTallyItem(production: Production, npdItems: Item[]) {
  const findById = (value: unknown) => {
    const candidate = normalizeTallyItemKey(value);
    if (!candidate) return undefined;

    return npdItems.find((item) => {
      const linkedItem = item as Item & { npdId?: string | number; itemId?: string | number };
      return [linkedItem.id, linkedItem.npdId, linkedItem.itemId].map(normalizeTallyItemKey).includes(candidate);
    });
  };

  const findByErp = (value: unknown) => {
    const candidate = normalizeTallyItemKey(value);
    if (!candidate) return undefined;

    return npdItems.find((item) => normalizeTallyItemKey(item.erp) === candidate);
  };

  return findById(production.npdId) || findById(production.itemId) || findByErp(production.erpCode) || findByErp(production.masterErp);
}
export function ProductionPendingTally() {
  const { user } = useAuth();
  const [productions, setProductions] = useData<Production>("productions", [], { firmScope: "all" });
  const [materials] = useData<Material>("materials", []);
  const npdItems = useNpdItemsWithoutStock();
  const [materialIssues] = useData<MaterialIssue>("material-issues", [], { firmScope: "all" });
  const [materialIssueLines] = useData<MaterialIssueLine>("material-issue-lines", [], { firmScope: "all" });
  const [materialIssueReelLines] = useData<MaterialIssueReelLine>("material-issue-reel-lines", [], { firmScope: "all" });
  const [materialReturns] = useData<MaterialReturn>("material-returns", [], { firmScope: "all" });
  const [materialReturnLines] = useData<MaterialReturnLine>("material-return-lines", [], { firmScope: "all" });
  const [materialReturnReelLines] = useData<MaterialReturnReelLine>("material-return-reel-lines", [], { firmScope: "all" });
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [tallyStatusFilter, setTallyStatusFilter] = useState("");
  const [fromDateFilter, setFromDateFilter] = useState("");
  const [toDateFilter, setToDateFilter] = useState("");
  const currentUserEmail = String(user?.email || "").trim().toLowerCase();
  const canPostTally = currentUserEmail === "pankaj@bizskilledu.com";
  const tableColumnCount = canPostTally ? 10 : 9;
  const usageMap = buildProductionMaterialUsageMap(
    materialIssues,
    materialIssueLines,
    materialReturns,
    materialReturnLines,
    materialIssueReelLines,
    materialReturnReelLines
  );
  const corrugatedSheetUsageMap = buildProductionCorrugatedSheetUsageMap(
    materials,
    materialIssues,
    materialIssueLines,
    materialReturns,
    materialReturnLines
  );

  const handleComplete = (id: string) => {
    if (confirmId !== id) {
      setConfirmId(id);
      setTimeout(() => setConfirmId(null), 3000); // Reset after 3s
      return;
    }

    setSubmittingId(id);
    setTimeout(() => {
      setProductions(productions.map(p => 
        p.id === id ? { 
          ...p, 
          status: "Completed", 
          tallyTimestamp: new Date().toISOString(),
          updatedBy: "Tally Operator",
          updateTimestamp: new Date().toISOString()
        } : p
      ));
      setSubmittingId(null);
      setConfirmId(null);
    }, 500);
  };

  const searchWordList = searchWords(searchTerm);
  const readyList = productions.filter(p =>
    isProductionReadyForTally(p, getProductionActualPaperUsed(p, usageMap), hasProductionCorrugatedSheetUsage(p, corrugatedSheetUsageMap))
  );
  // Tally Status options from the loaded rows; a blank status shows as "-" in the table.
  const tallyStatusOptions = Array.from(new Set(readyList.map((p) => String(p.tallyPostingStatus || "").trim() || "-")))
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, label: value }));
  const pendingList = readyList
    .filter(p => {
      const jobDate = String(p.date || "").slice(0, 10);
      if (tallyStatusFilter && (String(p.tallyPostingStatus || "").trim() || "-") !== tallyStatusFilter) return false;
      if (fromDateFilter && (!jobDate || jobDate < fromDateFilter)) return false;
      if (toDateFilter && (!jobDate || jobDate > toDateFilter)) return false;
      return matchesTableSearch([
        p.transactionNo,
        p.date,
        resolveProductionTallyItem(p, npdItems)?.name || "Unknown",
        Number(p.prodFromFFG || 0),
        p.uom,
        p.tallyPostingStatus,
        p.tallyPostingRemark,
        p.tallyPostingError,
      ], searchWordList);
    })
    .sort((a, b) => new Date(b.updateTimestamp).getTime() - new Date(a.updateTimestamp).getTime());

  const { sorted: sortedPendingList, sort, toggle: toggleSort } = useTableSort(pendingList, (p, key) => {
    if (key === "transactionNo") return p.transactionNo;
    if (key === "date") return p.date;
    if (key === "item") return resolveProductionTallyItem(p, npdItems)?.name || "Unknown";
    if (key === "ffg") return Number(p.prodFromFFG || 0);
    if (key === "uom") return p.uom;
    if (key === "tallyPostingStatus") return p.tallyPostingStatus || "";
    if (key === "tallyPostingRemark") return p.tallyPostingRemark || "";
    if (key === "tallyPostingError") return p.tallyPostingError || "";
    return "";
  }, [npdItems]);

  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalItems,
    paginatedItems: paginatedPendingList,
  } = useClientPagination(sortedPendingList, 25);
  const hasActiveFilters = Boolean(searchTerm.trim() || tallyStatusFilter || fromDateFilter || toDateFilter);
  const clearFilters = () => {
    setSearchTerm("");
    setTallyStatusFilter("");
    setFromDateFilter("");
    setToDateFilter("");
  };

  useEffect(() => {
    setPage(1);
  }, [searchTerm, tallyStatusFilter, fromDateFilter, toDateFilter, setPage]);

  return (
    <div className="space-y-6">
      <div className="border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">Production: Pending Tally Entry</h2>
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
          <div className="col-span-2 min-w-0 md:col-span-1"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Tally Status</span><Select compact value={tallyStatusFilter} onChange={setTallyStatusFilter} options={tallyStatusOptions} placeholder="All" /></div>
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

      <DataSummaryTiles totalRecords={productions.length} filteredRecords={pendingList.length} showingRecords={paginatedPendingList.length} pageLabel={`${page} / ${Math.max(1, Math.ceil(totalItems / pageSize))}`} />

      <div className="overflow-x-auto rounded border border-black bg-white">
        {/* Mobile View - Cards */}
        <div className="block md:hidden space-y-4 p-2">
            {paginatedPendingList.map((p, index) => (
                <div key={p.id} className="bg-white border-2 border-black p-4 space-y-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rounded relative">
                    <div className="flex justify-between items-center">
                        <div className="font-bold text-sm">Job: {p.transactionNo}</div>
                        <div className="text-xs text-slate-500">{formatDate(p.date)}</div>
                    </div>
                    <div className="text-sm font-bold">{resolveProductionTallyItem(p, npdItems)?.name || "Unknown"}</div>
                    <div className="text-sm">{Number(p.prodFromFFG || 0).toLocaleString()} {p.uom}</div>
                     {canPostTally ? (
                       <button
                        onClick={() => handleComplete(p.id)}
                        disabled={submittingId === p.id}
                        className={cn(
                          "w-full flex items-center justify-center py-2 rounded font-bold transition-all border disabled:opacity-50 text-xs uppercase tracking-wider gap-2",
                          confirmId === p.id 
                            ? "bg-amber-600 text-white border-black animate-pulse" 
                            : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-700"
                        )}
                      >
                        {submittingId === p.id ? <Spinner size={12} /> : (confirmId === p.id ? "Confirm?" : "Post")}
                      </button>
                     ) : null}
                </div>
            ))}
        </div>
        <table className="hidden md:table min-w-full divide-y divide-black border-collapse border border-black">
          <thead className="bg-slate-100 divide-x divide-black">
            <tr className="divide-x divide-black">
              <th className="px-6 py-3 text-left text-sm font-bold text-black uppercase border border-black">SL No</th>
              <th className="px-6 py-3 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="Job No." sortKey="transactionNo" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-6 py-3 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="Date" sortKey="date" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-6 py-3 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="Item Name" sortKey="item" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-6 py-3 text-right text-sm font-bold text-black uppercase border border-black"><SortHeader label="FFG Qty" sortKey="ffg" sort={sort} onToggle={toggleSort} align="right" /></th>
              <th className="px-6 py-3 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="UOM" sortKey="uom" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-6 py-3 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="Tally Posting Status" sortKey="tallyPostingStatus" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-6 py-3 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="Tally Posting Remark" sortKey="tallyPostingRemark" sort={sort} onToggle={toggleSort} align="left" /></th>
              <th className="px-6 py-3 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="Tally Posting Error" sortKey="tallyPostingError" sort={sort} onToggle={toggleSort} align="left" /></th>
              {canPostTally ? (
                <th className="px-6 py-3 text-right text-sm font-bold text-black uppercase border border-black">Actions</th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-black bg-white">
            {paginatedPendingList.length === 0 ? (
              <tr><td colSpan={tableColumnCount} className="h-16" aria-label="No records" /></tr>
            ) : (
              paginatedPendingList.map((p, index) => (
                <tr key={p.id} className="hover:bg-slate-50 divide-x divide-black">
                  <td className="px-6 py-4 text-sm font-bold text-black border border-black">{(page - 1) * pageSize + index + 1}</td>
                  <td className="px-6 py-4 text-sm font-medium text-black border border-black">{p.transactionNo}</td>
                  <td className="px-6 py-4 text-sm text-black border border-black whitespace-nowrap">{formatDate(p.date)}</td>
                  <td className="px-6 py-4 text-sm text-black border border-black">{resolveProductionTallyItem(p, npdItems)?.name || "Unknown"}</td>
                  <td className="px-6 py-4 text-right text-sm font-medium text-emerald-700 border border-black">{Number(p.prodFromFFG || 0).toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm text-black border border-black">{p.uom}</td>
                  <td className="px-6 py-4 text-sm text-black border border-black whitespace-nowrap">{p.tallyPostingStatus || "-"}</td>
                  <td className="px-6 py-4 text-sm text-black border border-black whitespace-pre-wrap break-words max-w-[320px] align-top">{p.tallyPostingRemark || "-"}</td>
                  <td className="px-6 py-4 text-sm text-rose-700 border border-black whitespace-pre-wrap break-words max-w-[320px] align-top">{p.tallyPostingError || "-"}</td>
                  {canPostTally ? (
                    <td className="px-6 py-4 text-right text-sm font-medium border border-black">
                      <button
                        onClick={() => handleComplete(p.id)}
                        disabled={submittingId === p.id}
                        className={cn(
                          "px-3 py-1 rounded font-bold text-xs uppercase flex items-center gap-1 ml-auto transition-all border disabled:opacity-50",
                          confirmId === p.id 
                            ? "bg-amber-600 text-white border-black animate-pulse" 
                            : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-700"
                        )}
                      >
                        {submittingId === p.id ? <Spinner size={12} /> : (confirmId === p.id ? <CheckCircle size={14} /> : <CheckCircle size={14} />)}
                        {confirmId === p.id ? "Confirm?" : "Post"}
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ClientPagination
        page={page}
        pageSize={pageSize}
        totalItems={totalItems}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}

