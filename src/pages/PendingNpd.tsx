import React, { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useData } from "../hooks/useData";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { normalizeOrderItemSource } from "../lib/orderItems";
import { Company, Firm, Order, OrderSchedule } from "../types";
import { formatDate } from "../lib/serial";
import { DataSummaryTiles } from "../components/DataSummaryTiles";
import { FirmFilterNoLabel as FirmFilter } from "../components/FirmFilterNoLabel";
import { getFirmDisplayNameById } from "../lib/firmDisplay";
import { ClientPagination } from "../components/ClientPagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";

export function PendingNpd() {
  // Load every firm's orders/schedules; the page's own Firm filter narrows them.
  const [orders] = useData<Order>("orders", [], { firmScope: "all" });
  const [schedules] = useData<OrderSchedule>("orders_schedule", [], { firmScope: "all" });
  const [companies] = useData<Company>("companies", []);
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const { fgItems: npdItems } = useOrderItemCatalog({ includeMaterials: false });
  const [searchTerm, setSearchTerm] = useState("");
  const [firmFilter, setFirmFilter] = useState("");

  const pendingRows = useMemo(() => {
    // First match per id, the same record the earlier list searches picked.
    const firstById = <T extends { id: string }>(list: T[]) => {
      const map = new Map<string, T>();
      list.forEach((row) => { if (!map.has(row.id)) map.set(row.id, row); });
      return map;
    };
    const orderById = firstById(orders);
    const itemById = firstById(npdItems as Array<{ id: string }>);
    const companyById = firstById(companies);
    const rows = schedules
      .map((schedule) => {
        const order = orderById.get(schedule.orderId);
        if (!order || order.status === "Cancelled") return null;
        if (normalizeOrderItemSource(order.itemSource) !== "FG") return null;
        const item = itemById.get(String(order.itemId || "").trim()) as (typeof npdItems)[number] | undefined;
        const company = companyById.get(order.companyId);
        const firmId = String(schedule.firmId || order.firmId || "");
        // Catalog items keep the original NPD row in `raw` (RAPC is stored there).
        const boxType = String((item as any)?.boxType || (item as any)?.raw?.boxType || "").trim();
        const rapcValue = String((item as any)?.raw?.rapc ?? (item as any)?.rapc ?? "").trim();
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
      // Show incomplete NPD setup when either required field is missing.
      .filter((row) => row.item && (!row.boxType || !row.rapcValue))
      .filter((row) => !firmFilter || row.firmId === firmFilter);

    const words = searchWords(searchTerm);
    if (!words.length) return rows;

    return rows.filter(({ schedule, order, item, company, firmName, boxType, rapcValue }) => matchesTableSearch([
      order.orderNo,
      formatDate(order.orderDate),
      schedule.scheduleNo,
      formatDate(schedule.scheduledDate),
      firmName,
      company?.name,
      order.erpCode,
      item?.name,
      boxType || "Missing",
      rapcValue || "Missing",
    ], words));
  }, [companies, firmFilter, firms, npdItems, orders, schedules, searchTerm]);
  // The table draws 100 rows per page; the count tile covers every row.
  const { page, setPage, pageSize, setPageSize, totalItems, paginatedItems: pagedRows } = useClientPagination(pendingRows, 100);
  useEffect(() => { setPage(1); }, [firmFilter, searchTerm, setPage]);

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
            placeholder="Search"
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
        showingRecords={pagedRows.length}
        pageLabel={`${page} / ${Math.max(1, Math.ceil(totalItems / pageSize))}`}
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
              pagedRows.map(({ schedule, order, item, company, firmName, boxType, rapcValue }, index) => (
                <tr key={schedule.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 border border-black font-bold whitespace-nowrap">{(page - 1) * pageSize + index + 1}</td>
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
