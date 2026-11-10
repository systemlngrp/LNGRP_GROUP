import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Select } from "../components/Select";
import { ClientPagination } from "../components/ClientPagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { loadingBadge, slipDay } from "./StandaloneLoadingMaster";
import { useData } from "../hooks/useData";
import { LoadingSlip } from "../types";
import { formatDate } from "../lib/serial";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";

function PendingLinkedLoadingTallyPage({ source }: { source: "PHP" | "PLATE" }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [tallyFilter, setTallyFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loadingSlips] = useData<LoadingSlip>(source === "PHP" ? "php_loading_slips" : "plate_loading_slips", []);
  const [fgLoadingSlips] = useData<LoadingSlip>("loading_slips", []);

  const fgSlipMap = useMemo(
    () => new Map(fgLoadingSlips.map((slip) => [String(slip.id || "").trim(), slip])),
    [fgLoadingSlips]
  );

  const allPendingRows = useMemo(() => {
    return loadingSlips
      .filter((row) => String(source === "PHP" ? row.phpConsumptionTransactionNo || "" : row.plateConsumptionTransactionNo || "").trim() !== "")
      .filter((row) => String(row.tallyTimestamp || "").trim() === "")
      .filter((row) => String(row.status || "Active").trim().toLowerCase() !== "cancelled")
      .map((row) => {
        const fgSlip = fgSlipMap.get(String(row.fgLoadingId || "").trim());
        const relevantLines = Array.isArray(row.lines) ? row.lines.filter((line) => Number(line.loadedQty || 0) > 0) : [];
        const firstLine = relevantLines[0];
        return {
          row,
          fgSlipNo: fgSlip?.slipNo || "-",
          itemName: String(firstLine?.itemName || "-"),
          companyName: String(firstLine?.companyName || row.companyName || "-"),
          consumptionNo: String(source === "PHP" ? row.phpConsumptionTransactionNo || "" : row.plateConsumptionTransactionNo || "").trim(),
          totalQty: relevantLines.reduce((sum, line) => sum + Number(line.loadedQty || 0), 0),
          tallyLabel: String(row.tallyPostingStatus || "").trim() || "Pending",
          day: slipDay(row.date),
        };
      });
  }, [fgSlipMap, loadingSlips, source]);

  const filterOptions = useMemo(() => {
    const toOptions = (values: string[]) => Array.from(new Set(values.filter((value) => value && value !== "-"))).sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value }));
    return {
      tallies: toOptions(allPendingRows.map((entry) => entry.tallyLabel)),
      companies: toOptions(allPendingRows.map((entry) => entry.companyName)),
      items: toOptions(allPendingRows.map((entry) => entry.itemName)),
    };
  }, [allPendingRows]);

  const pendingRows = useMemo(() => {
    const words = searchWords(searchTerm);
    return allPendingRows
      .filter((entry) =>
        (!tallyFilter || entry.tallyLabel === tallyFilter) &&
        (!companyFilter || entry.companyName === companyFilter) &&
        (!itemFilter || entry.itemName === itemFilter) &&
        (!fromDate || (Boolean(entry.day) && entry.day >= fromDate)) &&
        (!toDate || (Boolean(entry.day) && entry.day <= toDate))
      )
      .filter((entry) =>
        // Visible columns: Slip No, FG Slip, Cons. No, Date, Item, Company, Qty, Status, Remark, Error.
        matchesTableSearch([
          entry.row.slipNo || "-",
          entry.fgSlipNo,
          entry.consumptionNo || "-",
          formatDate(entry.row.date),
          entry.itemName,
          entry.companyName,
          entry.totalQty,
          entry.tallyLabel,
          entry.row.tallyPostingRemark || "-",
          entry.row.tallyPostingError || "-",
        ], words)
      )
      .sort(
        (a, b) =>
          String(a.row.date || "").localeCompare(String(b.row.date || "")) ||
          String(a.consumptionNo || "").localeCompare(String(b.consumptionNo || ""), undefined, { numeric: true, sensitivity: "base" }) ||
          String(a.row.slipNo || "").localeCompare(String(b.row.slipNo || ""), undefined, { numeric: true, sensitivity: "base" })
      );
  }, [allPendingRows, searchTerm, tallyFilter, companyFilter, itemFilter, fromDate, toDate]);

  const { sorted: sortedRows, sort, toggle: toggleSort } = useTableSort(pendingRows, (entry, key) => {
    switch (key) {
      case "slipNo": return entry.row.slipNo || "";
      case "fgSlipNo": return entry.fgSlipNo;
      case "consumptionNo": return entry.consumptionNo;
      case "date": return entry.row.date || "";
      case "itemName": return entry.itemName;
      case "companyName": return entry.companyName;
      case "totalQty": return entry.totalQty;
      case "status": return entry.tallyLabel;
      case "remark": return entry.row.tallyPostingRemark || "";
      case "error": return entry.row.tallyPostingError || "";
      default: return "";
    }
  });

  const heading = source === "PHP" ? "Pending PHP Tally" : "Pending Plate Tally";
  const consumptionLabel = source === "PHP" ? "PHP Cons. No" : "Plate Cons. No";

  const { page, setPage, pageSize, setPageSize, totalItems, paginatedItems } = useClientPagination(sortedRows, 25);
  const LABEL = "mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600";
  const DATE_INPUT = "h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold";
  const hasFilters = Boolean(searchTerm.trim() || tallyFilter || companyFilter || itemFilter || fromDate || toDate);
  const clearFilters = () => { setSearchTerm(""); setTallyFilter(""); setCompanyFilter(""); setItemFilter(""); setFromDate(""); setToDate(""); };
  const TH = "border border-black px-2 py-2 text-[11px] font-black uppercase";
  const TD = "border border-black px-2 py-2 text-xs text-black";
  const tallyNote = (row: LoadingSlip) => (
    <>
      {row.tallyPostingRemark ? <div className="mt-1 text-[10px] font-semibold text-slate-600">{row.tallyPostingRemark}</div> : null}
      {row.tallyPostingError ? <div className="mt-1 text-[10px] font-semibold text-red-700">{row.tallyPostingError}</div> : null}
    </>
  );

  return (
    <div className="space-y-4">
      <div className="border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">{heading}</h2>
      </div>

      <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
        <div className="relative w-full"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" placeholder="Search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600" /></div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
          <div className="min-w-0"><span className={LABEL}>Tally Status</span><Select compact value={tallyFilter} onChange={setTallyFilter} options={filterOptions.tallies} placeholder="All" /></div>
          <div className="min-w-0 md:col-span-1"><span className={LABEL}>Company</span><Select compact value={companyFilter} onChange={setCompanyFilter} options={filterOptions.companies} placeholder="All" /></div>
          <div className="col-span-2 min-w-0 md:col-span-1"><span className={LABEL}>Item</span><Select compact value={itemFilter} onChange={setItemFilter} options={filterOptions.items} placeholder="All" /></div>
          <div data-date-pair="true" className="col-span-2 grid min-w-0 grid-cols-2 gap-2 sm:min-w-[280px]">
            <label className="min-w-0"><span className={LABEL}>From Date</span><input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} className={DATE_INPUT} /></label>
            <label className="min-w-0"><span className={LABEL}>To Date</span><input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} className={DATE_INPUT} /></label>
          </div>
        </div>
        <div data-mf-actions="true" className="flex justify-end gap-2">
          {hasFilters ? <button type="button" onClick={clearFilters} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button> : null}
          <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
        </div>
      </div>

      <div className="text-xs font-bold text-slate-700">Pending: <span className="text-indigo-700">{totalItems.toLocaleString()}</span>{hasFilters ? <span className="font-semibold text-slate-500"> of {allPendingRows.length.toLocaleString()}</span> : null}</div>

      {/* Phones: one card per slip. */}
      <div className="space-y-2 md:hidden">
        {paginatedItems.length === 0 ? (
          <div className="rounded border border-black bg-white p-6 text-center text-sm font-medium text-slate-600">No pending {source} Tally posting rows found.</div>
        ) : paginatedItems.map(({ row, fgSlipNo, consumptionNo, itemName, companyName, totalQty, tallyLabel }) => (
          <div key={row.id} className="rounded-lg border-2 border-black bg-white p-3 text-black">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-black">{row.slipNo || "-"}</span>
              {loadingBadge(tallyLabel)}
            </div>
            <div className="mt-1 text-[11px] font-semibold text-slate-700">{formatDate(row.date) || "-"} · <span className="text-indigo-700">{consumptionNo || "-"}</span> · FG {fgSlipNo}</div>
            <div className="mt-1 break-words text-xs font-bold">{itemName}</div>
            <div className="break-words text-xs">{companyName}</div>
            <div className="mt-1 text-right text-xs font-bold text-slate-600">Qty <span className="text-sm font-black text-indigo-700">{totalQty.toLocaleString()}</span></div>
            {tallyNote(row)}
          </div>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded border border-black bg-white md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead className="sticky top-0 z-30 bg-slate-100">
              <tr>
                <th className={TH}><SortHeader label={"Slip No"} sortKey="slipNo" sort={sort} onToggle={toggleSort} /></th>
                <th className={TH}><SortHeader label={"FG Slip"} sortKey="fgSlipNo" sort={sort} onToggle={toggleSort} /></th>
                <th className={TH}><SortHeader label={consumptionLabel} sortKey="consumptionNo" sort={sort} onToggle={toggleSort} /></th>
                <th className={TH}><SortHeader label={"Date"} sortKey="date" sort={sort} onToggle={toggleSort} /></th>
                <th className={TH}><SortHeader label={"Item"} sortKey="itemName" sort={sort} onToggle={toggleSort} /></th>
                <th className={TH}><SortHeader label={"Company"} sortKey="companyName" sort={sort} onToggle={toggleSort} /></th>
                <th className={TH}><SortHeader label={"Qty"} sortKey="totalQty" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className={TH}><SortHeader label={"Tally Status"} sortKey="status" sort={sort} onToggle={toggleSort} align="center" /></th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center font-medium text-slate-600">No pending {source} Tally posting rows found.</td>
                </tr>
              ) : (
                paginatedItems.map(({ row, fgSlipNo, consumptionNo, itemName, companyName, totalQty, tallyLabel }) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className={`${TD} whitespace-nowrap font-bold`}>{row.slipNo || "-"}</td>
                    <td className={`${TD} whitespace-nowrap`}>{fgSlipNo}</td>
                    <td className={`${TD} whitespace-nowrap font-semibold text-indigo-700`}>{consumptionNo || "-"}</td>
                    <td className={`${TD} whitespace-nowrap`}>{formatDate(row.date) || "-"}</td>
                    <td className={TD}>{itemName}</td>
                    <td className={TD}>{companyName}</td>
                    <td className={`${TD} whitespace-nowrap text-right font-bold`}>{totalQty.toLocaleString()}</td>
                    <td className={`${TD} text-center`}>{loadingBadge(tallyLabel)}{tallyNote(row)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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

export function PendingPhpLoadingTallyPosting() {
  return <PendingLinkedLoadingTallyPage source="PHP" />;
}

export function PendingPlateLoadingTallyPosting() {
  return <PendingLinkedLoadingTallyPage source="PLATE" />;
}
