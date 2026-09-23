import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useData } from "../hooks/useData";
import { useNpdItems } from "../hooks/useNpdItems";
import { normalizeOrderItemSource } from "../lib/orderItems";
import { Company, Firm, Order, OrderSchedule } from "../types";
import { formatDate } from "../lib/serial";
import { DataSummaryTiles } from "../components/DataSummaryTiles";
import { FirmFilter } from "../components/FirmFilter";
import { getFirmDisplayNameById } from "../lib/firmDisplay";

export function PendingNpd() {
  const [orders] = useData<Order>("orders", []);
  const [schedules] = useData<OrderSchedule>("orders_schedule", []);
  const [companies] = useData<Company>("companies", []);
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const npdItems = useNpdItems();
  const [searchTerm, setSearchTerm] = useState("");
  const [firmFilter, setFirmFilter] = useState("");

  const pendingRows = useMemo(() => {
    const rows = schedules
      .map((schedule) => {
        const order = orders.find((row) => row.id === schedule.orderId);
        if (!order || order.status === "Cancelled") return null;
        if (normalizeOrderItemSource(order.itemSource) !== "FG") return null;
        const item = npdItems.find((row) => row.id === String(order.itemId || "").trim());
        const company = companies.find((row) => row.id === order.companyId);
        const firmId = String(schedule.firmId || order.firmId || "");
        const boxType = String((item as any)?.boxType || "").trim();
        const rapcValue = String((item as any)?.rapc ?? "").trim();
        return {
          schedule,
          order,
          item,
          company,
          firmId,
          firmName: getFirmDisplayNameById(firmId, firms),
          boxType,
          rapcValue,
        };
      })
      .filter(Boolean)
      .filter((row) => row.item && !row.boxType && !row.rapcValue)
      .filter((row) => !firmFilter || row.firmId === firmFilter);

    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter(({ schedule, order, item, company, firmName, boxType, rapcValue }) => {
      const blob = [
        order.orderNo,
        order.orderDate,
        schedule.scheduledDate,
        order.erpCode,
        company?.name,
        firmName,
        item?.name,
        (item as any)?.itemName,
        (item as any)?.customerName,
        (item as any)?.contactPerson,
        boxType,
        rapcValue,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(needle);
    });
  }, [companies, firmFilter, firms, npdItems, orders, schedules, searchTerm]);

  return (
    <div className="w-full rounded border border-black bg-white p-4 shadow-sm sm:p-6">
      <div className="grid items-end gap-4 border-b border-black pb-4 lg:grid-cols-[minmax(0,1fr)_minmax(520px,auto)]">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">Pending NPD</h2>
        <div className="grid w-full gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
        <label className="flex min-w-0 flex-col gap-1 text-xs font-bold uppercase text-slate-700">
          <span>Search</span>
          <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search order, company, item, ERP..."
            className="h-10 w-full rounded border border-black pl-10 pr-3 text-sm font-normal"
          />
          </div>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-bold uppercase text-slate-700">
          <span>Firm</span>
          <FirmFilter value={firmFilter} onChange={setFirmFilter} />
        </label>
        {(searchTerm || firmFilter) ? (
          <button type="button" onClick={() => { setSearchTerm(""); setFirmFilter(""); }} className="h-10 rounded border border-black bg-white px-3 text-sm font-bold text-black hover:bg-slate-50">
            Clear Filters
          </button>
        ) : <div className="hidden sm:block" />}
        </div>
      </div>

      <DataSummaryTiles
        totalRecords={pendingRows.length}
        filteredRecords={pendingRows.length}
        showingRecords={pendingRows.length}
        pageLabel="1 / 1"
        hideTotalRecords
        filteredRecordsLabel="Total Records"
      />

      <div className="table-sticky-scroll w-full border border-black">
        <table className="w-full min-w-[1180px] table-fixed text-sm">
          <thead className="sticky top-0 z-30 bg-slate-100">
            <tr>
              {['SL No', 'Order No', 'Order Date', 'Schedule No', 'Schedule Date', 'Firm', 'Company', 'ERP', 'Item', 'Box Type', 'RAPC'].map((heading) => (
                <th key={heading} className="border border-black px-3 py-2 text-left align-middle whitespace-nowrap">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pendingRows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-6 py-8 text-center text-black font-medium">
                  No scheduled items are pending NPD completion.
                </td>
              </tr>
            ) : (
              pendingRows.map(({ schedule, order, item, company, firmName, boxType, rapcValue }, index) => (
                <tr key={schedule.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 border border-black font-bold whitespace-nowrap">{index + 1}</td>
                  <td className="px-3 py-2 border border-black whitespace-nowrap">{order.orderNo || "-"}</td>
                  <td className="px-3 py-2 border border-black whitespace-nowrap">{formatDate(order.orderDate)}</td>
                  <td className="px-3 py-2 border border-black whitespace-nowrap font-bold text-indigo-700">{schedule.scheduleNo || "-"}</td>
                  <td className="px-3 py-2 border border-black whitespace-nowrap">{formatDate(schedule.scheduledDate)}</td>
                  <td className="px-3 py-2 border border-black font-semibold">{firmName}</td>
                  <td className="px-3 py-2 border border-black">{company?.name || "-"}</td>
                  <td className="px-3 py-2 border border-black whitespace-nowrap">{order.erpCode || "-"}</td>
                  <td className="px-3 py-2 border border-black">{item?.name || "-"}</td>
                  <td className={`px-3 py-2 border border-black font-bold ${boxType ? "" : "bg-red-100 text-red-700"}`}>
                    {boxType || "Missing"}
                  </td>
                  <td className={`px-3 py-2 border border-black font-bold ${rapcValue ? "" : "bg-red-100 text-red-700"}`}>
                    {rapcValue || "Missing"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
