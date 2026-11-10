import React, { useEffect, useMemo, useState } from "react";
import { Copy, Search } from "lucide-react";
import { useData } from "../hooks/useData";
import type { Company, DispatchPlan, LoadingSlip, Order, Truck, TruckStatusLog } from "../types";
import { formatTruckDateTime, formatTruckDuration, normalizeTruckStatus, TRUCK_LIVE_STATUSES, TRUCK_STATUS_STYLES } from "../lib/truckStatus";
import { Select } from "../components/Select";
import { useTableSearch } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";

function isInternalTruck(truck: Truck) {
  return String(truck.truckType || "").trim().toLowerCase() === "internal";
}

function getSortTime(value?: string) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}


export function TruckStatusReport() {
  const [trucks] = useData<Truck>("trucks", []);
  const [loadingSlips] = useData<LoadingSlip>("loading_slips", []);
  const [dispatchPlans] = useData<DispatchPlan>("dispatch_plans", []);
  const [orders] = useData<Order>("orders", []);
  const [companies] = useData<Company>("companies", []);
  const [searchTerm, setSearchTerm] = useState("");
  const [vehicleNoFilter, setVehicleNoFilter] = useState("");
  const [partyFilter, setPartyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [statusLogs] = useData<TruckStatusLog>("truck-status-logs", [], { cacheToLocalStorage: false });
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);


  
  const activeSlipsByTruck = useMemo(() => {
    const map = new Map<string, LoadingSlip>();
    [...loadingSlips]
      .filter((slip) => slip.status !== "Cancelled" && String(slip.truckId || "").trim())
      .sort((a, b) => getSortTime(b.updateTimestamp || b.date) - getSortTime(a.updateTimestamp || a.date))
      .forEach((slip) => {
        if (!map.has(slip.truckId)) map.set(slip.truckId, slip);
      });
    return map;
  }, [loadingSlips]);

  const latestPartyByTruckId = useMemo(() => {
    const map = new Map<string, string>();
    statusLogs.forEach((log) => {
      const truckId = String(log.truckId || "").trim();
      const partyName = String(log.partyName || "").trim();
      if (truckId && partyName && !map.has(truckId)) map.set(truckId, partyName);
    });
    return map;
  }, [statusLogs]);

  const baseRows = useMemo(() => {
    const planById = new Map(dispatchPlans.map((plan) => [plan.id, plan]));
    const orderById = new Map(orders.map((order) => [order.id, order]));
    const companyById = new Map(companies.map((company) => [company.id, company]));

    return trucks.filter(isInternalTruck).map((truck) => {
      const slip = activeSlipsByTruck.get(truck.id);
      const partyNames = new Set<string>();

      if (slip?.companyName) partyNames.add(slip.companyName);
      if (slip?.companyId) {
        const company = companyById.get(slip.companyId);
        if (company?.name) partyNames.add(company.name);
      }

      (slip?.lines || []).forEach((line) => {
        if (line.companyName) partyNames.add(line.companyName);
        if (line.companyId) {
          const company = companyById.get(line.companyId);
          if (company?.name) partyNames.add(company.name);
        }
        const plan = planById.get(line.dispatchPlanId);
        const order = plan ? orderById.get(plan.orderId) : undefined;
        const company = order ? companyById.get(order.companyId) : undefined;
        if (company?.name) partyNames.add(company.name);
      });

      const liveStatus = normalizeTruckStatus(truck.liveStatus) || "EMPTY";
      const latestLogParty = latestPartyByTruckId.get(truck.id) || "";
      return {
        truck,
        liveStatus,
        party: latestLogParty || Array.from(partyNames).filter(Boolean).join(", ") || "-",
      };
    }).sort((a, b) => {
      const statusA = a.liveStatus.localeCompare(b.liveStatus);
      return statusA || a.truck.truckNo.localeCompare(b.truck.truckNo, undefined, { numeric: true, sensitivity: "base" });
    });
  }, [activeSlipsByTruck, companies, dispatchPlans, latestPartyByTruckId, loadingSlips, orders, trucks]);


  const vehicleNoOptions = useMemo(
    () => [
      ...Array.from(new Set(baseRows.map((row) => String(row.truck.truckNo || "").trim()).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
        .map((truckNo) => ({ value: truckNo, label: truckNo, searchText: truckNo })),
    ],
    [baseRows]
  );

  const partyOptions = useMemo(
    () => [
      ...Array.from(new Set(baseRows.map((row) => String(row.party || "").trim()).filter((party) => party && party !== "-")))
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
        .map((party) => ({ value: party, label: party, searchText: party })),
    ],
    [baseRows]
  );

  const filteredRows = useMemo(() => {
    return baseRows.filter((row) => {
      if (vehicleNoFilter && row.truck.truckNo !== vehicleNoFilter) return false;
      if (partyFilter && row.party !== partyFilter) return false;
      if (statusFilter && row.liveStatus !== statusFilter) return false;
      return true;
    });
  }, [baseRows, partyFilter, statusFilter, vehicleNoFilter]);

  // Table search: only the columns the table shows (Duration ticks with `now`).
  const rows = useTableSearch(filteredRows, searchTerm, (row) => [
    row.truck.truckNo,
    row.liveStatus,
    formatTruckDateTime(row.truck.statusUpdatedAt),
    row.party,
    formatTruckDuration(row.truck.statusUpdatedAt, now),
    row.truck.driverName,
    row.truck.mobileNo,
  ], [now]);

  const { sorted: sortedRows, sort, toggle: toggleSort } = useTableSort(rows, (row, key) => {
    switch (key) {
      case "truckNo": return row.truck.truckNo;
      case "liveStatus": return row.liveStatus;
      case "statusUpdatedAt": return row.truck.statusUpdatedAt || "";
      case "party": return row.party;
      case "duration": {
        const time = row.truck.statusUpdatedAt ? new Date(row.truck.statusUpdatedAt).getTime() : NaN;
        return Number.isFinite(time) ? now - time : null;
      }
      case "driverName": return row.truck.driverName || "";
      case "mobileNo": return row.truck.mobileNo || "";
      default: return "";
    }
  }, [now]);

  const handleCopyDriverFormLink = async () => {
    const url = new URL("/driver-status", window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      setCopyFeedback(true);
      window.setTimeout(() => setCopyFeedback(false), 2000);
    } catch (error) {
      console.error("Failed to copy driver form link:", error);
    }
  };

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    TRUCK_LIVE_STATUSES.forEach((status) => map.set(status, 0));
    trucks.filter(isInternalTruck).forEach((truck) => {
      const status = normalizeTruckStatus(truck.liveStatus) || "EMPTY";
      map.set(status, (map.get(status) || 0) + 1);
    });
    return map;
  }, [trucks]);

  const LABEL = "mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600";
  const TH = "border border-black px-2 py-2 text-[11px] font-black uppercase";
  const TD = "border border-black px-2 py-2 text-xs text-black";
  const statusOptions = TRUCK_LIVE_STATUSES.map((value) => ({ value, label: value }));
  const hasFilters = Boolean(searchTerm.trim() || vehicleNoFilter || partyFilter || statusFilter);
  const clearFilters = () => { setSearchTerm(""); setVehicleNoFilter(""); setPartyFilter(""); setStatusFilter(""); };
  const badge = (status: string) => (
    <span className={`${TRUCK_STATUS_STYLES[status as keyof typeof TRUCK_STATUS_STYLES]?.badge || ""} inline-flex justify-center whitespace-nowrap border px-2 py-0.5 text-[10px] font-black uppercase`}>{status}</span>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">Truck Status</h2>
        <button
          type="button"
          data-header-action="true"
          title="Copy Driver Form Link"
          onClick={() => void handleCopyDriverFormLink()}
          className="inline-flex items-center justify-center gap-2 rounded border-2 border-black bg-white px-3 py-1.5 text-xs font-black uppercase text-black hover:bg-slate-50"
        >
          <Copy size={14} />
          {copyFeedback ? "Link Copied" : "Copy Driver Form Link"}
        </button>
      </div>

      <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
        <div className="relative w-full"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" placeholder="Search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600" /></div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
          <div className="min-w-0"><span className={LABEL}>Vehicle No.</span><Select id="truck-status-vehicle-filter" compact options={vehicleNoOptions} value={vehicleNoFilter} onChange={setVehicleNoFilter} placeholder="All" /></div>
          <div className="min-w-0"><span className={LABEL}>Status</span><Select compact options={statusOptions} value={statusFilter} onChange={setStatusFilter} placeholder="All" /></div>
          <div className="col-span-2 min-w-0 md:col-span-1"><span className={LABEL}>Party</span><Select id="truck-status-party-filter" compact options={partyOptions} value={partyFilter} onChange={setPartyFilter} placeholder="All" /></div>
        </div>
        <div data-mf-actions="true" className="flex justify-end gap-2">
          {hasFilters ? <button type="button" onClick={clearFilters} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button> : null}
          <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
        </div>
      </div>

      {/* Status counts: tap one to show only those trucks. */}
      <div className="grid grid-cols-3 gap-2 md:grid-cols-5 xl:grid-cols-9">
        {TRUCK_LIVE_STATUSES.map((status) => {
          const style = TRUCK_STATUS_STYLES[status];
          const active = statusFilter === status;
          return (
            <button
              type="button"
              key={status}
              onClick={() => setStatusFilter(active ? "" : status)}
              aria-pressed={active}
              className={`${style.tile} min-h-[52px] border-2 px-2 py-1.5 text-center ${active ? "border-indigo-700 ring-2 ring-indigo-600" : "border-black"}`}
            >
              <div className="text-[10px] font-black uppercase leading-tight">{style.label}</div>
              <div className="text-lg font-black">{counts.get(status) || 0}</div>
            </button>
          );
        })}
      </div>

      {/* Phones: one card per truck. */}
      <div className="space-y-2 md:hidden">
        {sortedRows.length === 0 ? (
          <div className="rounded border border-black bg-white p-6 text-center text-sm font-bold text-slate-500">No trucks found.</div>
        ) : sortedRows.map(({ truck, liveStatus, party }) => {
          const duration = formatTruckDuration(truck.statusUpdatedAt, now);
          const longDuration = duration !== "-" && Number(duration.split(":")[0]) >= 24;
          return (
            <div key={truck.id} className="rounded-lg border-2 border-black bg-white p-3 text-black">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-black uppercase text-blue-800">{truck.truckNo}</span>
                {badge(liveStatus)}
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-slate-700">
                <span>{formatTruckDateTime(truck.statusUpdatedAt)}</span>
                <span className={`rounded px-1.5 py-0.5 font-black ${longDuration ? "bg-red-600 text-white" : "bg-slate-100 text-black"}`}>{duration}</span>
              </div>
              {party && party !== "-" ? <div className="mt-1 break-words text-xs font-bold uppercase">{party}</div> : null}
              {truck.driverName || truck.mobileNo ? (
                <div className="mt-1 text-[11px] font-semibold text-slate-700">
                  Driver <span className="font-bold uppercase text-black">{truck.driverName || "-"}</span>
                  {truck.mobileNo ? <> · <a href={`tel:${truck.mobileNo}`} className="font-bold text-indigo-700 underline">{truck.mobileNo}</a></> : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="hidden overflow-hidden rounded border border-black bg-white md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead className="sticky top-0 z-30 bg-slate-100">
              <tr>
                <th className={TH}><SortHeader label={"Vehicle No."} sortKey="truckNo" sort={sort} onToggle={toggleSort} /></th>
                <th className={TH}><SortHeader label={"Live Status"} sortKey="liveStatus" sort={sort} onToggle={toggleSort} align="center" /></th>
                <th className={TH}><SortHeader label={"Date & Time"} sortKey="statusUpdatedAt" sort={sort} onToggle={toggleSort} /></th>
                <th className={TH}><SortHeader label={"Party"} sortKey="party" sort={sort} onToggle={toggleSort} /></th>
                <th className={TH}><SortHeader label={"Duration"} sortKey="duration" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className={TH}><SortHeader label={"Driver Name"} sortKey="driverName" sort={sort} onToggle={toggleSort} /></th>
                <th className={TH}><SortHeader label={"Driver Number"} sortKey="mobileNo" sort={sort} onToggle={toggleSort} /></th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-sm font-bold text-slate-500">No trucks found.</td>
                </tr>
              ) : sortedRows.map(({ truck, liveStatus, party }) => {
                const duration = formatTruckDuration(truck.statusUpdatedAt, now);
                const longDuration = duration !== "-" && Number(duration.split(":")[0]) >= 24;
                return (
                  <tr key={truck.id} className="hover:bg-slate-50">
                    <td className={`${TD} whitespace-nowrap font-black uppercase text-blue-800`}>{truck.truckNo}</td>
                    <td className={`${TD} text-center`}>{badge(liveStatus)}</td>
                    <td className={`${TD} whitespace-nowrap font-semibold`}>{formatTruckDateTime(truck.statusUpdatedAt)}</td>
                    <td className={`${TD} uppercase`}>{party}</td>
                    <td className={`${TD} whitespace-nowrap text-right font-black ${longDuration ? "bg-red-600 text-white" : ""}`}>{duration}</td>
                    <td className={`${TD} uppercase`}>{truck.driverName || "-"}</td>
                    <td className={`${TD} whitespace-nowrap`}>{truck.mobileNo || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
