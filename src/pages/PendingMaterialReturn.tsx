import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, RotateCcw, Search } from "lucide-react";
import { useData } from "../hooks/useData";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { getPendingReturnJobReelLines } from "../lib/materialMovement";
import { isCorrugationLinerComplete } from "../lib/productionProcessingProgress";
import { ClientPagination } from "../components/ClientPagination";
import { Select } from "../components/Select";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { useClientPagination } from "../hooks/useClientPagination";
import { SortHeader, useTableSort } from "../lib/tableSort";
import type { MaterialIssueReelLine, MaterialReturnReelLine, Production, ProductionProcessing } from "../types";

export function PendingMaterialReturn() {
  const navigate = useNavigate();
  const [productions] = useData<Production>("productions", [], { firmScope: "all" });
  const [issueReels] = useData<MaterialIssueReelLine>("material-issue-reel-lines", [], { firmScope: "all" });
  const [returnReels] = useData<MaterialReturnReelLine>("material-return-reel-lines", [], { firmScope: "all" });
  const [processing] = useData<ProductionProcessing>("production_processing", [], { firmScope: "all" });
  const { findItemAcrossSources } = useOrderItemCatalog();
  const [searchTerm, setSearchTerm] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [fromDateFilter, setFromDateFilter] = useState("");
  const [toDateFilter, setToDateFilter] = useState("");

  const rows = useMemo(() => {
    // Same check as before, done once per job instead of once per reel line.
    const linerCompleteByJob = new Map<string, boolean>();
    const isLinerComplete = (productionId: string) => {
      let value = linerCompleteByJob.get(productionId);
      if (value === undefined) {
        value = isCorrugationLinerComplete(processing, productionId);
        linerCompleteByJob.set(productionId, value);
      }
      return value;
    };
    // Job level: a job with any return entered is not pending (AppSheet logic).
    const returnable = getPendingReturnJobReelLines(issueReels, returnReels, productions)
      .filter((line) => isLinerComplete(line.productionId));
    const byProduction = new Map<string, { reelIds: Set<string>; weight: number }>();
    returnable.forEach((line) => {
      const current = byProduction.get(line.productionId) || { reelIds: new Set<string>(), weight: 0 };
      current.reelIds.add(line.packingSlipId);
      current.weight += Number(line.weightKg || 0);
      byProduction.set(line.productionId, current);
    });

    return productions
      .filter((production) => production.status !== "Cancelled" && !production.cancelTimestamp && byProduction.has(production.id))
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

  // Search (visible columns) and filters run before the sort and the pager.
  const filteredRows = useMemo(() => {
    const words = searchWords(searchTerm);
    return rows.filter((row) => {
      const jobDate = String(row.production.date || "").slice(0, 10);
      if (companyFilter && row.company !== companyFilter) return false;
      if (itemFilter && row.item !== itemFilter) return false;
      if (fromDateFilter && (!jobDate || jobDate < fromDateFilter)) return false;
      if (toDateFilter && (!jobDate || jobDate > toDateFilter)) return false;
      return matchesTableSearch([
        row.production.transactionNo,
        jobDate,
        row.company,
        row.item,
        row.reelCount,
        row.weight.toFixed(2),
      ], words);
    });
  }, [companyFilter, fromDateFilter, itemFilter, rows, searchTerm, toDateFilter]);

  // The table draws 100 rows per page.
  const { sorted: sortedRows, sort, toggle: toggleSort } = useTableSort(filteredRows, (row, key) => {
    if (key === "jobNo") return row.production.transactionNo;
    if (key === "date") return String(row.production.date || "").slice(0, 10);
    if (key === "company") return row.company;
    if (key === "item") return row.item;
    if (key === "reelCount") return row.reelCount;
    if (key === "weight") return row.weight;
    return "";
  });
  const { page, setPage, pageSize, setPageSize, totalItems, paginatedItems: pagedRows } = useClientPagination(sortedRows, 100);
  const hasActiveFilters = Boolean(searchTerm.trim() || companyFilter || itemFilter || fromDateFilter || toDateFilter);
  const clearFilters = () => {
    setSearchTerm("");
    setCompanyFilter("");
    setItemFilter("");
    setFromDateFilter("");
    setToDateFilter("");
  };

  useEffect(() => {
    setPage(1);
  }, [searchTerm, companyFilter, itemFilter, fromDateFilter, toDateFilter, setPage]);

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
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">Pending Material Return</h2>
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
          <div data-date-pair="true" className="col-span-2 grid min-w-0 grid-cols-2 gap-2 sm:min-w-[260px]">
            <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Job From Date</span><input type="date" value={fromDateFilter} max={toDateFilter || undefined} onChange={(e) => setFromDateFilter(e.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
          <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Job To Date</span><input type="date" value={toDateFilter} min={fromDateFilter || undefined} onChange={(e) => setToDateFilter(e.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
          </div>
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
              {[["Job No.", "jobNo"], ["Date", "date"], ["Company", "company"], ["Item", "item"], ["Reels", "reelCount"], ["Returnable KG", "weight"], ["Actions", ""]].map(([heading, key]) => (
                <th key={heading} className="border border-black px-3 py-3 text-left text-xs font-bold uppercase">{key ? <SortHeader label={heading} sortKey={key} sort={sort} onToggle={toggleSort} align="left" /> : heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedRows.length === 0 ? (
              <tr><td colSpan={7} className="h-16" aria-label="No records" /></tr>
            ) : pagedRows.map(({ production, company, item, reelCount, weight }, index) => (
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
      <ClientPagination
        page={page}
        pageSize={pageSize}
        totalItems={totalItems}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        pageSizeOptions={[100, 250, 500]}
      />
    </div>
  );
}
