import React, { useMemo, useState } from "react";
import { useData } from "../hooks/useData";
import { Company, Firm, Order, OrderSchedule, Production } from "../types";
import { Spinner } from "../components/Spinner";

import { TableControls } from "../components/TableControls";
import { DataSummaryTiles } from "../components/DataSummaryTiles";
import { formatDate } from "../lib/serial";
import { useNavigate } from "react-router-dom";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { buildScheduleConsumptionByScheduleId } from "../lib/productionScheduleQty";
import { FirmFilterNoLabel as FirmFilter } from "../components/FirmFilterNoLabel";
import { getFirmDisplayNameById } from "../lib/firmDisplay";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";

function getPendingProductionQty(schedule: OrderSchedule, consumedQty: number) {
  return Math.max(
    Number(schedule.qty || 0) - Number(consumedQty || 0) - Number(schedule.canceledQty || 0),
    0
  );
}

function parseLocalYmd(dateStr?: string) {
  if (!dateStr) return null;
  const match = String(dateStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, monthIndex, day);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

export function UpcomingScheduledOrders() {
  const [searchTerm, setSearchTerm] = useState('');
  const [firmFilter, setFirmFilter] = useState('');

  const navigate = useNavigate();
  const [schedules, setSchedules] = useData<OrderSchedule>("orders_schedule", []);
  const [productions] = useData<Production>("productions", []);
  const [phpJobs] = useData<Production>("php_job_master", []);
  const [plateJobs] = useData<Production>("plate_job_master", []);
  const [orders] = useData<Order>("orders", []);
  const { resolveOrderItem } = useOrderItemCatalog();
  const [companies] = useData<Company>("companies", []);
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });

  const [cancelValues, setCancelValues] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [makeConfirmId, setMakeConfirmId] = useState<string | null>(null);

  const cutoffDate = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + 2);
    cutoff.setHours(23, 59, 59, 999);
    return cutoff;
  }, []);

  const consumptionByScheduleId = useMemo(
    () => buildScheduleConsumptionByScheduleId(productions, phpJobs, plateJobs),
    [phpJobs, plateJobs, productions]
  );

  const upcomingRows = useMemo(() => {
    const words = searchWords(searchTerm);
    return schedules
        .filter((schedule) => {
          const consumedQty = Number(consumptionByScheduleId.get(schedule.id)?.effectiveConsumedQty || 0);
          if (getPendingProductionQty(schedule, consumedQty) <= 0) return false;
          const scheduledDate = parseLocalYmd(schedule.scheduledDate);
          if (!scheduledDate) return false;
          return scheduledDate.getTime() > cutoffDate.getTime();
        })
        .map((schedule) => {
          const order = orders.find((row) => row.id === schedule.orderId);
          const item = resolveOrderItem(order);
          const company = companies.find((row) => row.id === order?.companyId);
          const firmId = String(schedule.firmId || order?.firmId || "");
          const plannedQty = Number(consumptionByScheduleId.get(schedule.id)?.plannedQty || 0);
          const actualProducedQty = Number(consumptionByScheduleId.get(schedule.id)?.actualProducedQty || 0);
          const consumedQty = Number(consumptionByScheduleId.get(schedule.id)?.effectiveConsumedQty || 0);
          return {
            schedule,
            order,
            item,
            company,
            firmId,
            firmName: getFirmDisplayNameById(firmId, firms),
            plannedQty,
            actualProducedQty,
            pendingQty: getPendingProductionQty(schedule, consumedQty),
          };
        })
        .filter(({ schedule, order, item, company, firmId, firmName, pendingQty, plannedQty, actualProducedQty }) => {
          if (firmFilter && firmId !== firmFilter) return false;
          return matchesTableSearch([
            order?.orderNo,
            schedule.scheduleNo,
            formatDate(schedule.scheduledDate),
            firmName,
            company?.name,
            item?.name,
            schedule.qty || 0,
            plannedQty,
            actualProducedQty,
            schedule.canceledQty || 0,
            pendingQty,
          ], words);
        })
        .sort((a, b) => {
          const timeA = new Date(a.schedule.scheduledDate || 0).getTime();
          const timeB = new Date(b.schedule.scheduledDate || 0).getTime();
          return timeA - timeB; // Ascending by date
        });
  }, [companies, consumptionByScheduleId, cutoffDate, firmFilter, firms, orders, resolveOrderItem, schedules, searchTerm]);

  const { sorted: sortedRows, sort, toggle: toggleSort } = useTableSort(upcomingRows, (row, key) => {
    switch (key) {
      case "orderNo": return row.order?.orderNo;
      case "scheduleNo": return row.schedule.scheduleNo;
      case "scheduledDate": return row.schedule.scheduledDate;
      case "firm": return row.firmName;
      case "company": return row.company?.name;
      case "item": return row.item?.name;
      case "qty": return Number(row.schedule.qty || 0);
      case "plannedQty": return row.plannedQty;
      case "actualProducedQty": return row.actualProducedQty;
      case "canceledQty": return Number(row.schedule.canceledQty || 0);
      case "pendingQty": return row.pendingQty;
      default: return "";
    }
  });

  const handleCancelQty = async (schedule: OrderSchedule) => {
    const rawValue = cancelValues[schedule.id];
    const qtyToCancel = Number(rawValue || 0);
    const pendingQty = getPendingProductionQty(
      schedule,
      Number(consumptionByScheduleId.get(schedule.id)?.effectiveConsumedQty || 0),
    );

    if (!qtyToCancel || qtyToCancel <= 0 || qtyToCancel > pendingQty) return;

    setSavingId(schedule.id);
    try {
      const timestamp = new Date().toISOString();
      await setSchedules((prev) =>
        prev.map((row) =>
          row.id === schedule.id
            ? {
                ...row,
                canceledQty: Number(row.canceledQty || 0) + qtyToCancel,
                updateTimestamp: timestamp,
                updatedBy: "System User",
              }
            : row
        )
      );
      setCancelValues((prev) => ({ ...prev, [schedule.id]: "" }));
    } catch (err) {
      console.error("Failed to cancel scheduled quantity:", err);
    } finally {
      setSavingId(null);
    }
  };

  const handleMakeJob = async (schedule: OrderSchedule) => {
    const pendingQty = getPendingProductionQty(
      schedule,
      Number(consumptionByScheduleId.get(schedule.id)?.effectiveConsumedQty || 0),
    );
    if (pendingQty <= 0) return;

    if (makeConfirmId !== schedule.id) {
      setMakeConfirmId(schedule.id);
      setTimeout(() => setMakeConfirmId(null), 3000);
      return;
    }

    navigate(`/production/form?scheduleId=${schedule.id}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b border-black pb-4">
        <h2 className="text-xl font-bold text-black uppercase tracking-tight">Upcoming Scheduled Orders</h2>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[280px] flex-1"><TableControls searchTerm={searchTerm} onSearchChange={setSearchTerm} /></div>
        <FirmFilter value={firmFilter} onChange={setFirmFilter} />
      </div>

      <DataSummaryTiles totalRecords={schedules.length} filteredRecords={upcomingRows.length} showingRecords={upcomingRows.length} pageLabel="1 / 1" />

      <div className="bg-white rounded shadow-sm border border-black table-sticky-scroll">
        <table className="min-w-full divide-y divide-black border-collapse border border-black text-sm">
          <thead className="sticky top-0 z-30 bg-slate-100">
            <tr>
              <th className="px-3 py-2 border border-black">SL No</th>
              <th className="px-3 py-2 border border-black"><SortHeader label="Order No" sortKey="orderNo" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-3 py-2 border border-black"><SortHeader label="Schedule No" sortKey="scheduleNo" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-3 py-2 border border-black"><SortHeader label="Schedule Date" sortKey="scheduledDate" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-3 py-2 border border-black"><SortHeader label="Firm" sortKey="firm" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-3 py-2 border border-black"><SortHeader label="Company" sortKey="company" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-3 py-2 border border-black"><SortHeader label="Item" sortKey="item" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-3 py-2 border border-black"><SortHeader label="Scheduled Qty" sortKey="qty" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-3 py-2 border border-black"><SortHeader label="Planned Qty" sortKey="plannedQty" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-3 py-2 border border-black"><SortHeader label="Actual FFG" sortKey="actualProducedQty" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-3 py-2 border border-black"><SortHeader label="Canceled Qty" sortKey="canceledQty" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-3 py-2 border border-black text-indigo-700"><SortHeader label="Pending Qty" sortKey="pendingQty" sort={sort} onToggle={toggleSort} align="center" /></th>
              <th className="px-3 py-2 border border-black w-40">Cancel Qty</th>
              <th className="px-3 py-2 border border-black">Actions</th>
            </tr>
          </thead>
          <tbody>
            {upcomingRows.length === 0 ? (
              <tr>
                <td colSpan={14} className="px-6 py-8 text-center text-black font-medium italic">
                  No upcoming production schedules (beyond today + 2 days).
                </td>
              </tr>
            ) : (
              sortedRows.map(({ schedule, order, item, company, firmName, pendingQty, plannedQty, actualProducedQty }, index) => (
                <tr key={schedule.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 border border-black font-bold">{index + 1}</td>
                  <td className="px-3 py-2 border border-black font-medium">{order?.orderNo || "-"}</td>
                  <td className="px-3 py-2 border border-black font-bold text-indigo-700 whitespace-nowrap">{schedule.scheduleNo || "-"}</td>
                  <td className="px-3 py-2 border border-black whitespace-nowrap font-bold text-indigo-700">{formatDate(schedule.scheduledDate)}</td>
                  <td className="px-3 py-2 border border-black font-semibold">{firmName}</td>
                  <td className="px-3 py-2 border border-black">{company?.name || "-"}</td>
                  <td className="px-3 py-2 border border-black">{item?.name || "-"}</td>
                  <td className="px-3 py-2 border border-black text-right">{schedule.qty || 0}</td>
                  <td className="px-3 py-2 border border-black text-right">{plannedQty}</td>
                  <td className="px-3 py-2 border border-black text-right">{actualProducedQty}</td>
                  <td className="px-3 py-2 border border-black text-right">{schedule.canceledQty || 0}</td>
                  <td className="px-3 py-2 border border-black text-right font-bold bg-indigo-50/30">{pendingQty}</td>
                  <td className="px-3 py-2 border border-black">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      max={pendingQty}
                      value={cancelValues[schedule.id] || ""}
                      onChange={(e) => setCancelValues((prev) => ({ ...prev, [schedule.id]: e.target.value }))}
                      className="w-full border-2 border-black rounded px-2 py-1 text-right font-bold"
                    />
                  </td>
                  <td className="px-3 py-2 border border-black text-center">
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => handleCancelQty(schedule)}
                        disabled={savingId === schedule.id || !cancelValues[schedule.id] || Number(cancelValues[schedule.id]) <= 0}
                        className="bg-rose-600 text-white px-3 py-1 rounded font-bold uppercase text-[10px] disabled:opacity-50 tracking-tighter"
                      >
                        {savingId === schedule.id ? <Spinner size={12} className="text-white" /> : "Cancel Qty"}
                      </button>
                      <button
                        onClick={() => void handleMakeJob(schedule)}
                        disabled={pendingQty <= 0}
                        className={`px-3 py-1 rounded font-bold uppercase text-[10px] tracking-tighter disabled:opacity-50 ${
                          makeConfirmId === schedule.id ? "bg-amber-500 text-black border-2 border-black animate-pulse" : "bg-yellow-400 text-black border border-black hover:bg-yellow-500 transition-colors"
                        }`}
                      >
                        {makeConfirmId === schedule.id ? "Confirm?" : "Plan Job"}
                      </button>
                    </div>
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
