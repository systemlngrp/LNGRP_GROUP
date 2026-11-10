import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useData } from "../hooks/useData";
import { useTrackPageLoading } from "../components/DataLoadingBoundary";
import { Select } from "../components/Select";
import { ClientPagination } from "../components/ClientPagination";
import { useClientPagination } from "../hooks/useClientPagination";
import type { Truck, TruckStatusLog } from "../types";
import { SortHeader, useTableSort } from "../lib/tableSort";
import { matchesTableSearch, rowSearchText, searchWords } from "../lib/tableSearch";
import { normalizeTruckStatus, TRUCK_LIVE_STATUSES, TRUCK_STATUS_STYLES } from "../lib/truckStatus";

const SOURCE_OPTIONS = [
  { value: "TruckDriver", label: "Truck Login" },
  { value: "PublicDriver", label: "Driver Link" },
  { value: "AppVehicleUpdate", label: "App Form" },
  { value: "System", label: "System" },
];

function sourceLabel(value?: string) {
  return SOURCE_OPTIONS.find((option) => option.value === value)?.label || value || "-";
}

// dd-mm-yyyy hh:mm (local time) and yyyy-mm-dd for the date filters.
function logDateParts(value?: string) {
  const date = new Date(String(value || ""));
  if (isNaN(date.getTime())) return { text: "-", day: "" };
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    text: `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`,
    day: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
  };
}

const LABEL = "mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600";
const DATE_INPUT = "h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold";
const TH = "border border-black px-2 py-2 text-[11px] font-black uppercase";
const TD = "border border-black px-2 py-2 text-xs text-black";

export function TruckLogs() {
  const [trucks] = useData<Truck>("trucks", []);
  const [truckFilter, setTruckFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [logs, setLogs] = useState<TruckStatusLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const authHeaders = useMemo(() => {
    const token = window.localStorage.getItem("authToken") || "";
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  // The latest logs (server returns up to 1000) are loaded once and filtered here.
  const fetchLogs = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/truck-status-logs", { headers: authHeaders });
      const data = await response.json().catch(() => []);
      if (!response.ok) throw new Error(data.error || "Unable to load truck logs.");
      setLogs(Array.isArray(data) ? data as TruckStatusLog[] : []);
    } catch (err) {
      setLogs([]);
      setError((err as Error).message || "Unable to load truck logs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLogs();
  }, []);

  const rows = useMemo(() => logs.map((log) => {
    const status = normalizeTruckStatus(log.liveStatus) || "EMPTY";
    const when = logDateParts(log.statusUpdatedAt);
    const source = sourceLabel(log.updateSource);
    return {
      log,
      status,
      when,
      source,
      searchText: rowSearchText([log.truckNo, status, when.text, source, log.statusUpdatedBy, log.invoiceNo, log.partyName, log.driverName]),
    };
  }), [logs]);

  const truckOptions = useMemo(() => {
    const names = new Set<string>();
    trucks.forEach((truck) => { if (truck.truckNo) names.add(String(truck.truckNo).trim()); });
    logs.forEach((log) => { if (log.truckNo) names.add(String(log.truckNo).trim()); });
    return Array.from(names).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((value) => ({ value, label: value }));
  }, [logs, trucks]);
  const statusOptions = useMemo(() => TRUCK_LIVE_STATUSES.map((value) => ({ value, label: value })), []);

  const filtered = useMemo(() => {
    const words = searchWords(searchTerm);
    return rows.filter((row) =>
      (!truckFilter || String(row.log.truckNo || "").trim().toUpperCase() === truckFilter.toUpperCase()) &&
      (!sourceFilter || row.log.updateSource === sourceFilter) &&
      (!statusFilter || row.status === statusFilter) &&
      (!fromDate || (Boolean(row.when.day) && row.when.day >= fromDate)) &&
      (!toDate || (Boolean(row.when.day) && row.when.day <= toDate)) &&
      matchesTableSearch(row.searchText, words)
    );
  }, [rows, searchTerm, truckFilter, sourceFilter, statusFilter, fromDate, toDate]);

  const { sorted, sort, toggle: toggleSort } = useTableSort(filtered, (row, key) => {
    switch (key) {
      case "truckNo": return row.log.truckNo;
      case "status": return row.status;
      case "statusUpdatedAt": return row.log.statusUpdatedAt || "";
      case "source": return row.source;
      case "updatedBy": return row.log.statusUpdatedBy || "";
      case "invoiceNo": return row.log.invoiceNo || "";
      case "partyName": return row.log.partyName || "";
      case "driverName": return row.log.driverName || "";
      default: return "";
    }
  });
  const { page, setPage, pageSize, setPageSize, totalItems, paginatedItems } = useClientPagination(sorted, 25);

  useTrackPageLoading(loading && logs.length === 0, logs.length === 0 ? error || null : null, () => void fetchLogs(), logs.length);

  const hasFilters = Boolean(searchTerm.trim() || truckFilter || sourceFilter || statusFilter || fromDate || toDate);
  const clearFilters = () => { setSearchTerm(""); setTruckFilter(""); setSourceFilter(""); setStatusFilter(""); setFromDate(""); setToDate(""); };
  const badge = (status: string) => (
    <span className={`${TRUCK_STATUS_STYLES[status as keyof typeof TRUCK_STATUS_STYLES]?.badge || ""} inline-flex justify-center whitespace-nowrap border px-2 py-0.5 text-[10px] font-black uppercase`}>{status}</span>
  );

  return (
    <div className="space-y-4">
      <div className="border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">Truck Logs</h2>
      </div>

      <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
        <div className="relative w-full"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" placeholder="Search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600" /></div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
          <div className="min-w-0"><span className={LABEL}>Vehicle No.</span><Select compact value={truckFilter} onChange={setTruckFilter} options={truckOptions} placeholder="All" /></div>
          <div className="min-w-0"><span className={LABEL}>Status</span><Select compact value={statusFilter} onChange={setStatusFilter} options={statusOptions} placeholder="All" /></div>
          <div className="min-w-0"><span className={LABEL}>Source</span><Select compact value={sourceFilter} onChange={setSourceFilter} options={SOURCE_OPTIONS} placeholder="All" /></div>
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

      {error ? <div className="rounded border border-red-700 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</div> : null}
      <div className="text-xs font-bold text-slate-700">{totalItems.toLocaleString()} {totalItems === 1 ? "log" : "logs"}</div>

      {/* Phones: one card per log. */}
      <div className="space-y-2 md:hidden">
        {paginatedItems.length === 0 ? (
          <div className="rounded border border-black bg-white p-6 text-center text-sm font-bold text-slate-500">{loading ? "Loading..." : "No status logs found."}</div>
        ) : paginatedItems.map(({ log, status, when, source }) => (
          <div key={log.id} className="rounded-lg border-2 border-black bg-white p-3 text-black">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-black uppercase text-blue-800">{log.truckNo || "-"}</span>
              {badge(status)}
            </div>
            <div className="mt-1 text-[11px] font-semibold text-slate-700">{when.text} · {source} · {log.statusUpdatedBy || "-"}</div>
            {log.partyName ? <div className="mt-1 break-words text-xs font-bold uppercase">{log.partyName}</div> : null}
            <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] font-semibold text-slate-700">
              {log.invoiceNo ? <span>Invoice <span className="font-bold text-black">{log.invoiceNo}</span></span> : null}
              {log.driverName ? <span>Driver <span className="font-bold uppercase text-black">{log.driverName}</span></span> : null}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded border border-black bg-white md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead className="sticky top-0 z-30 bg-slate-100">
              <tr>
                <th className={TH}><SortHeader label={"Vehicle No."} sortKey="truckNo" sort={sort} onToggle={toggleSort} /></th>
                <th className={TH}><SortHeader label={"Status"} sortKey="status" sort={sort} onToggle={toggleSort} align="center" /></th>
                <th className={TH}><SortHeader label={"Date & Time"} sortKey="statusUpdatedAt" sort={sort} onToggle={toggleSort} /></th>
                <th className={TH}><SortHeader label={"Source"} sortKey="source" sort={sort} onToggle={toggleSort} /></th>
                <th className={TH}><SortHeader label={"Updated By"} sortKey="updatedBy" sort={sort} onToggle={toggleSort} /></th>
                <th className={TH}><SortHeader label={"Invoice No."} sortKey="invoiceNo" sort={sort} onToggle={toggleSort} /></th>
                <th className={TH}><SortHeader label={"Party"} sortKey="partyName" sort={sort} onToggle={toggleSort} /></th>
                <th className={TH}><SortHeader label={"Driver Name"} sortKey="driverName" sort={sort} onToggle={toggleSort} /></th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-sm font-bold text-slate-500">{loading ? "Loading..." : "No status logs found."}</td>
                </tr>
              ) : paginatedItems.map(({ log, status, when, source }) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className={`${TD} whitespace-nowrap font-black uppercase text-blue-800`}>{log.truckNo}</td>
                  <td className={`${TD} text-center`}>{badge(status)}</td>
                  <td className={`${TD} whitespace-nowrap font-semibold`}>{when.text}</td>
                  <td className={`${TD} whitespace-nowrap font-bold uppercase`}>{source}</td>
                  <td className={`${TD} font-bold uppercase`}>{log.statusUpdatedBy || "-"}</td>
                  <td className={`${TD} whitespace-nowrap uppercase`}>{log.invoiceNo || "-"}</td>
                  <td className={`${TD} uppercase`}>{log.partyName || "-"}</td>
                  <td className={`${TD} uppercase`}>{log.driverName || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ClientPagination page={page} pageSize={pageSize} totalItems={totalItems} onPageChange={setPage} onPageSizeChange={setPageSize} />
    </div>
  );
}
