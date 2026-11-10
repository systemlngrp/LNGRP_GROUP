import React, { useMemo, useState } from "react";
import { useData } from "../hooks/useData";
import { LoadingSlip, OrderItemSource, Production, Truck } from "../types";
import { Select } from "../components/Select";
import { Search } from "lucide-react";
import { formatDate } from "../lib/serial";
import { ClientPagination } from "../components/ClientPagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { getOrderItemSourceLabel } from "../lib/orderItems";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";

const getJobMasterEntityName = (source: Extract<OrderItemSource, "PHP" | "PLATE">) =>
  source === "PHP" ? "php_job_master" : "plate_job_master";
const getLoadingEntityName = (source: Extract<OrderItemSource, "PHP" | "PLATE">) =>
  source === "PHP" ? "php_loading_slips" : "plate_loading_slips";

// yyyy-mm-dd of a slip date (stored either as a date or a timestamp).
export function slipDay(value: unknown) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(text);
  if (isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const LOADING_BADGE: Record<string, string> = {
  Active: "border-emerald-700 bg-emerald-50 text-emerald-800",
  Cancelled: "border-red-700 bg-red-50 text-red-700",
  Posted: "border-emerald-700 bg-emerald-50 text-emerald-800",
  Pending: "border-amber-700 bg-amber-50 text-amber-800",
  Linked: "border-indigo-300 bg-indigo-50 text-indigo-700",
  Historical: "border-slate-300 bg-slate-100 text-slate-700",
};
export function loadingBadge(label: string) {
  return <span className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-black uppercase ${LOADING_BADGE[label] || "border-red-700 bg-red-50 text-red-700"}`}>{label || "-"}</span>;
}

type StandaloneLoadingMasterProps = {
  source: Extract<OrderItemSource, "PHP" | "PLATE">;
};

export function StandaloneLoadingMaster({ source }: StandaloneLoadingMasterProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tallyFilter, setTallyFilter] = useState("");
  const [linkFilter, setLinkFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loadingSlips] = useData<LoadingSlip>(getLoadingEntityName(source), []);
  const [productions] = useData<Production>(getJobMasterEntityName(source), []);
  const [trucks] = useData<Truck>("trucks", []);
  const [fgLoadingSlips] = useData<LoadingSlip>("loading_slips", []);
  const { itemsBySource } = useOrderItemCatalog();
  const items = itemsBySource[source] || [];

  const productionMap = useMemo(() => new Map(productions.map((production) => [production.id, production])), [productions]);
  const fgSlipMap = useMemo(() => new Map(fgLoadingSlips.map((slip) => [slip.id, slip])), [fgLoadingSlips]);
  const consumptionTxnLabel = source === "PHP" ? "PHP Cons. No" : "Plate Cons. No";

  const allRows = useMemo(() => {
    return loadingSlips
      .map((slip) => {
        const relevantLines = slip.lines.filter((line) => Number(line.loadedQty || 0) > 0);
        if (relevantLines.length === 0) return null;

        const firstLine = relevantLines[0];
        const firstAllocation = Array.isArray(firstLine.allocations)
          ? firstLine.allocations.find((allocation) => allocation.sourceType === "job")
          : undefined;
        const firstProduction = firstAllocation?.sourceType === "job"
          ? productionMap.get(String(firstAllocation.jobId || "").trim())
          : undefined;
        const item = firstLine.itemId
          ? items.find((entry) => entry.id === String(firstLine.itemId || "").trim())
          : firstProduction
            ? items.find((entry) => entry.id === String(firstProduction.itemId || "").trim())
            : undefined;
        const fgSlip = fgSlipMap.get(String(slip.fgLoadingId || "").trim());
        const isFgLinked = Boolean(String(slip.fgLoadingId || "").trim());

        return {
          slip,
          itemName: firstLine.itemName || item?.name || String(firstProduction?.itemId || "-"),
          companyName: firstLine.companyName || firstProduction?.companyName || item?.companyName || "-",
          jobNo: firstAllocation?.sourceType === "job" ? firstAllocation.jobNo || firstProduction?.transactionNo || "-" : "-",
          fgSlipNo: fgSlip?.slipNo || "-",
          truckNo: slip.truckNo || trucks.find((truck) => truck.id === slip.truckId)?.truckNo || "-",
          totalQty: relevantLines.reduce((sum, line) => sum + Number(line.loadedQty || 0), 0),
          isFgLinked,
          consumptionTxnNo:
            source === "PHP"
              ? String(slip.phpConsumptionTransactionNo || "").trim()
              : String(slip.plateConsumptionTransactionNo || "").trim(),
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .map((row) => ({
        ...row,
        day: slipDay(row.slip.date),
        statusLabel: String(row.slip.status || "Active").trim().toLowerCase() === "cancelled" ? "Cancelled" : "Active",
        tallyLabel: row.slip.tallyPostingStatus || (row.slip.tallyTimestamp ? "Posted" : "Pending"),
        linkLabel: row.isFgLinked ? "Linked" : "Historical",
      }));
  }, [fgSlipMap, items, loadingSlips, productionMap, trucks]);

  const filterOptions = useMemo(() => {
    const toOptions = (values: string[]) => Array.from(new Set(values.filter((value) => value && value !== "-"))).sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value }));
    return {
      statuses: toOptions(allRows.map((row) => row.statusLabel)),
      tallies: toOptions(allRows.map((row) => row.tallyLabel)),
      links: toOptions(allRows.map((row) => row.linkLabel)),
      companies: toOptions(allRows.map((row) => row.companyName)),
      items: toOptions(allRows.map((row) => row.itemName)),
    };
  }, [allRows]);

  const processedSlips = useMemo(() => {
    const words = searchWords(searchTerm);
    return allRows
      .filter((row) =>
        (!statusFilter || row.statusLabel === statusFilter) &&
        (!tallyFilter || row.tallyLabel === tallyFilter) &&
        (!linkFilter || row.linkLabel === linkFilter) &&
        (!companyFilter || row.companyName === companyFilter) &&
        (!itemFilter || row.itemName === itemFilter) &&
        (!fromDate || (Boolean(row.day) && row.day >= fromDate)) &&
        (!toDate || (Boolean(row.day) && row.day <= toDate))
      )
      .filter((row) =>
        // Visible columns: Slip No, FG Slip, Cons. No, Date, Job No, Item, Company, Truck, Qty, Status, Tally Status, Source.
        matchesTableSearch([
          row.slip.slipNo || "-",
          row.isFgLinked ? row.fgSlipNo : "-",
          row.consumptionTxnNo || "-",
          formatDate(row.slip.date),
          row.jobNo,
          row.itemName,
          row.companyName,
          row.truckNo,
          row.totalQty,
          row.statusLabel,
          row.tallyLabel,
          row.linkLabel,
        ], words)
      )
      .sort((a, b) =>
        String(b.slip.slipNo || "").localeCompare(String(a.slip.slipNo || ""), undefined, {
          numeric: true,
          sensitivity: "base",
        })
      );
  }, [allRows, searchTerm, statusFilter, tallyFilter, linkFilter, companyFilter, itemFilter, fromDate, toDate]);

  const { sorted: sortedSlips, sort, toggle: toggleSort } = useTableSort(processedSlips, (row, key) => {
    switch (key) {
      case "slipNo": return row.slip.slipNo || "";
      case "fgSlipNo": return row.isFgLinked ? row.fgSlipNo : "";
      case "consumptionTxnNo": return row.consumptionTxnNo;
      case "date": return row.slip.date || "";
      case "jobNo": return row.jobNo;
      case "itemName": return row.itemName;
      case "companyName": return row.companyName;
      case "truckNo": return row.truckNo;
      case "totalQty": return row.totalQty;
      case "status": return row.statusLabel;
      case "tallyStatus": return row.tallyLabel;
      case "source": return row.linkLabel;
      default: return "";
    }
  });
  const { page, setPage, pageSize, setPageSize, totalItems, paginatedItems } = useClientPagination(sortedSlips, 25);
  const sourceLabel = getOrderItemSourceLabel(source);

  const LABEL = "mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600";
  const DATE_INPUT = "h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold";
  const hasFilters = Boolean(searchTerm.trim() || statusFilter || tallyFilter || linkFilter || companyFilter || itemFilter || fromDate || toDate);
  const clearFilters = () => { setSearchTerm(""); setStatusFilter(""); setTallyFilter(""); setLinkFilter(""); setCompanyFilter(""); setItemFilter(""); setFromDate(""); setToDate(""); };
  const TH = "border border-black px-2 py-2 text-[11px] font-black uppercase";
  const TD = "border border-black px-2 py-2 text-xs text-black";

  return (
    <div className="space-y-4">
      <div className="border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">{sourceLabel} Loading Slip Master</h2>
      </div>

      <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
        <div className="relative w-full"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" placeholder="Search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600" /></div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
          <div className="min-w-0"><span className={LABEL}>Status</span><Select compact value={statusFilter} onChange={setStatusFilter} options={filterOptions.statuses} placeholder="All" /></div>
          <div className="min-w-0"><span className={LABEL}>Tally</span><Select compact value={tallyFilter} onChange={setTallyFilter} options={filterOptions.tallies} placeholder="All" /></div>
          <div className="min-w-0"><span className={LABEL}>Source</span><Select compact value={linkFilter} onChange={setLinkFilter} options={filterOptions.links} placeholder="All" /></div>
          <div className="col-span-2 min-w-0 md:col-span-1"><span className={LABEL}>Company</span><Select compact value={companyFilter} onChange={setCompanyFilter} options={filterOptions.companies} placeholder="All" /></div>
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

      <div className="text-xs font-bold text-slate-700">{totalItems.toLocaleString()} {totalItems === 1 ? "slip" : "slips"}</div>

      {/* Phones: one card per slip. */}
      <div className="space-y-2 md:hidden">
        {paginatedItems.length === 0 ? (
          <div className="rounded border border-black bg-white p-6 text-center text-sm font-medium">No loading slips found.</div>
        ) : paginatedItems.map((row) => (
          <div key={row.slip.id} className="rounded-lg border-2 border-black bg-white p-3 text-black">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-black">{row.slip.slipNo || "-"}</span>
              <span className="flex flex-wrap gap-1">{loadingBadge(row.statusLabel)}{loadingBadge(row.tallyLabel)}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold text-slate-700">
              <span>{formatDate(row.slip.date) || "-"}</span><span>·</span><span>{row.consumptionTxnNo || "-"}</span>
              {row.isFgLinked ? <><span>·</span><span>FG {row.fgSlipNo}</span></> : null}
              {loadingBadge(row.linkLabel)}
            </div>
            <div className="mt-1 break-words text-xs font-bold">{row.itemName}</div>
            <div className="break-words text-xs">{row.companyName}</div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-600">Truck <span className="font-bold uppercase text-black">{row.truckNo}</span>{row.jobNo !== "-" ? <> · Job <span className="font-bold text-black">{row.jobNo}</span></> : null}</span>
              <span className="font-bold text-slate-600">Qty <span className="text-sm font-black text-indigo-700">{row.totalQty.toLocaleString()}</span></span>
            </div>
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
                <th className={TH}><SortHeader label={consumptionTxnLabel} sortKey="consumptionTxnNo" sort={sort} onToggle={toggleSort} /></th>
                <th className={TH}><SortHeader label={"Date"} sortKey="date" sort={sort} onToggle={toggleSort} /></th>
                <th className={TH}><SortHeader label={"Job No"} sortKey="jobNo" sort={sort} onToggle={toggleSort} /></th>
                <th className={TH}><SortHeader label={"Item"} sortKey="itemName" sort={sort} onToggle={toggleSort} /></th>
                <th className={TH}><SortHeader label={"Company"} sortKey="companyName" sort={sort} onToggle={toggleSort} /></th>
                <th className={TH}><SortHeader label={"Truck"} sortKey="truckNo" sort={sort} onToggle={toggleSort} /></th>
                <th className={TH}><SortHeader label={"Qty"} sortKey="totalQty" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className={TH}><SortHeader label={"Status"} sortKey="status" sort={sort} onToggle={toggleSort} align="center" /></th>
                <th className={TH}><SortHeader label={"Tally"} sortKey="tallyStatus" sort={sort} onToggle={toggleSort} align="center" /></th>
                <th className={TH}><SortHeader label={"Source"} sortKey="source" sort={sort} onToggle={toggleSort} align="center" /></th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-6 py-8 text-center font-medium text-black">No loading slips found.</td>
                </tr>
              ) : (
                paginatedItems.map((row) => (
                  <tr key={row.slip.id} className="hover:bg-slate-50">
                    <td className={`${TD} whitespace-nowrap font-bold`}>{row.slip.slipNo || "-"}</td>
                    <td className={`${TD} whitespace-nowrap`}>{row.isFgLinked ? row.fgSlipNo : "-"}</td>
                    <td className={`${TD} whitespace-nowrap font-semibold text-indigo-700`}>{row.consumptionTxnNo || "-"}</td>
                    <td className={`${TD} whitespace-nowrap`}>{formatDate(row.slip.date) || "-"}</td>
                    <td className={`${TD} whitespace-nowrap`}>{row.jobNo}</td>
                    <td className={TD}>{row.itemName}</td>
                    <td className={TD}>{row.companyName}</td>
                    <td className={`${TD} whitespace-nowrap uppercase`}>{row.truckNo}</td>
                    <td className={`${TD} whitespace-nowrap text-right font-bold`}>{row.totalQty.toLocaleString()}</td>
                    <td className={`${TD} text-center`}>{loadingBadge(row.statusLabel)}</td>
                    <td className={`${TD} text-center`}>{loadingBadge(row.tallyLabel)}</td>
                    <td className={`${TD} text-center`}>{loadingBadge(row.linkLabel)}</td>
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
