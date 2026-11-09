import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "../hooks/useData";
import { useAuth } from "../auth/AuthContext";
import { canManageMasterRecords } from "../lib/masterPermissions";
import { Firm, Order, OrderItemSource, OrderSchedule, Production } from "../types";
import { ClientPagination } from "../components/ClientPagination";
import { TableControls } from "../components/TableControls";
import { Select } from "../components/Select";
import { useClientPagination } from "../hooks/useClientPagination";
import { useOrderItemCatalog } from "../hooks/useOrderItemCatalog";
import { getOrderItemSourceLabel } from "../lib/orderItems";
import { resolvePhpPlateFgLink } from "../lib/phpPlateFgLink";
import { getFirmDisplayNameById, getFirmOptions } from "../lib/firmDisplay";
import { resolvePhpPlateFirmId } from "../lib/phpPlateFirm";
import { rowSearchText, searchWords } from "../lib/tableSearch";

const getJobMasterEntityName = (source: Extract<OrderItemSource, "PHP" | "PLATE">) =>
  source === "PHP" ? "php_job_master" : "plate_job_master";

type StandaloneProductionMasterProps = {
  source: Extract<OrderItemSource, "PHP" | "PLATE">;
};

const formatItemFilterLabel = (name: string, erp: string) => {
  if (!name) return erp;
  if (!erp || name.toLowerCase().includes(erp.toLowerCase())) return name;
  return `${name} - ${erp}`;
};

function formatCell(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return "-";
  return String(value);
}

function formatNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString() : "-";
}

function formatFgNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString() : "0";
}

function getFgCellClasses(isBlocked: boolean, requiresFgGate: boolean) {
  if (requiresFgGate && isBlocked) return "bg-red-100 text-red-700 font-bold";
  if (requiresFgGate) return "bg-emerald-50 text-emerald-700 font-bold";
  return "bg-slate-50 text-black font-semibold";
}

const MASTER_COLUMNS = ["Job No", "Date", "Firm", "Shift", "Category", "Master ERP", "ERP", "Item", "Sets/Pcs per Box", "Length", "Breadth", "Height", "Ply", "No of Holes in PHP", "Flute Type", "L1", "F1", "L2", "F2", "L3", "Board GSM (Req)", "Brusting Strength (Req)", "Weight/Pc Set (Req)", "Printing Colour", "Required Qnt", "Planning ID", "Scheduled Date", "Planned Qnt", "Methodology", "FG Value", "Job Type", "Sequence", "Job Completion Time", "Output", "Qty", "UOM", "Status", "Remarks", "Action"];

export function StandaloneProductionMaster({ source }: StandaloneProductionMasterProps) {
  const { user } = useAuth();
  const canManage = canManageMasterRecords(user?.role);
  const [productions, setProductions] = useData<Production>(getJobMasterEntityName(source), []);
  const [fgProductions] = useData<Production>("productions", []);
  const [schedules] = useData<OrderSchedule>("orders_schedule", [], { firmScope: "all" });
  const [orders] = useData<Order>("orders", [], { firmScope: "all" });
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const { itemsBySource } = useOrderItemCatalog();
  const items = itemsBySource[source] || [];
  const hiddenColumnsKey = `pp-master-hidden-columns:${source}`;
  const [hiddenColumns, setHiddenColumns] = useState<number[]>(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(hiddenColumnsKey) || "[]");
      return Array.isArray(saved) ? saved.filter((value) => Number.isInteger(value) && value >= 0 && value < MASTER_COLUMNS.length) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try { window.localStorage.setItem(hiddenColumnsKey, JSON.stringify(hiddenColumns)); } catch { /* storage unavailable */ }
  }, [hiddenColumns, hiddenColumnsKey]);
  const toggleColumn = (index: number) => setHiddenColumns((current) => current.includes(index) ? current.filter((value) => value !== index) : [...current, index].sort((a, b) => a - b));
  const hiddenColumnsCss = hiddenColumns.map((index) => `.pp-master-table tr > :nth-child(${index + 1}) { display: none; }`).join("\n");
  const [searchTerm, setSearchTerm] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [firmFilter, setFirmFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const productionFilterRows = useMemo(() => {
    return productions.map((production) => {
      const item = items.find((entry) => entry.id === String(production.itemId || "").trim());
      const itemName = String(item?.name || "").trim();
      const itemErp = String(production.erpCode || item?.erp || "").trim();
      const companyName = String(production.companyName || "").trim();
      const itemKey = itemName || itemErp ? `${itemName}::${itemErp}` : "";
      const firmId = resolvePhpPlateFirmId(production, schedules, orders);

      return {
        production,
        itemName,
        itemErp,
        itemKey,
        companyName,
        firmId,
        // Values of the table columns, in MASTER_COLUMNS order (Action excluded).
        cells: [
          production.transactionNo,
          production.date,
          getFirmDisplayNameById(firmId, firms),
          production.shift,
          production.category,
          production.masterErp,
          production.erpCode || item?.erp,
          item?.name || production.itemId,
          production.setsPerBox,
          production.length,
          production.breadth,
          production.height,
          production.ply,
          production.noOfHolesInPhp,
          production.fluteType || production.flute,
          production.l1,
          production.f1,
          production.l2,
          production.f2,
          production.l3,
          production.boardGsmReq || production.gsm,
          production.brustingStrengthReq,
          production.weightPerPcSetReq || production.plateWeight,
          production.printingColor,
          production.requiredQty || production.qty,
          schedules.find((schedule) => String(schedule.id) === String(production.scheduleId || ""))?.scheduleNo || production.planningId || production.scheduleId,
          production.scheduledDate,
          production.plannedQty || production.qty,
          production.methodology,
          Number(resolvePhpPlateFgLink(production, fgProductions, source).fgValue) || 0,
          production.jobType,
          production.scheduledDate && production.shift && production.methodology && !String(production.sequence || "").trim() && production.status !== "Cancelled" && production.status !== "Completed" && !String(production.jobCompletionTimeOutput || "").trim() ? "Needs sequencing" : production.sequence,
          production.jobCompletionTimeOutput,
          production.productionOutputQty,
          production.qty,
          production.uom || item?.uom,
          production.status,
          production.cancelRemarks || production.remarks,
        ] as unknown[],
      };
    });
  }, [fgProductions, firms, items, orders, productions, schedules, source]);

  // Search text of each row from the columns currently shown (hidden columns
  // are not searched), built once per row list / column choice.
  const searchTextByRow = useMemo(() => {
    const hidden = new Set(hiddenColumns);
    return new Map(productionFilterRows.map((row) => [row, rowSearchText(row.cells.filter((_, index) => !hidden.has(index)))] as const));
  }, [hiddenColumns, productionFilterRows]);

  const companyOptions = useMemo(() => {
    const names = Array.from(new Set(productionFilterRows.map((row) => row.companyName).filter(Boolean)));
    return names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })).map((name) => ({ value: name, label: name }));
  }, [productionFilterRows]);

  const itemOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; searchText: string }>();
    productionFilterRows.forEach((row) => {
      if (!row.itemKey || map.has(row.itemKey)) return;
      map.set(row.itemKey, { value: row.itemKey, label: formatItemFilterLabel(row.itemName, row.itemErp), searchText: `${row.itemName} ${row.itemErp}` });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [productionFilterRows]);
  const firmOptions = useMemo(() => getFirmOptions(firms), [firms]);

  const filteredList = useMemo(() => {
    const words = searchWords(searchTerm);
    return productionFilterRows
      .filter((row) => {
        if (companyFilter && row.companyName !== companyFilter) return false;
        if (itemFilter && row.itemKey !== itemFilter) return false;
        if (firmFilter && row.firmId !== firmFilter) return false;
        const date = String(row.production.date || "").slice(0, 10);
        if (fromDate && date < fromDate) return false;
        if (toDate && date > toDate) return false;
        if (!words.length) return true;
        const text = searchTextByRow.get(row) || "";
        return words.every((word) => text.includes(word));
      })
      .map((row) => row.production)
      .sort((a, b) => new Date(b.updateTimestamp || b.date || 0).getTime() - new Date(a.updateTimestamp || a.date || 0).getTime());
  }, [companyFilter, firmFilter, fromDate, itemFilter, productionFilterRows, searchTerm, searchTextByRow, toDate]);
  const { page, setPage, pageSize, setPageSize, totalItems, paginatedItems } = useClientPagination(filteredList, 25);

  const handleCancel = async (id: string) => {
    const remarks = window.prompt("Enter cancel reason");
    if (!remarks?.trim()) return;
    const timestamp = new Date().toISOString();
    await setProductions((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              status: "Cancelled",
              cancelRemarks: remarks.trim(),
              cancelTimestamp: timestamp,
              cancelEmailId: "System User",
              updatedBy: "System User",
              updateTimestamp: timestamp,
            }
          : row
      )
    );
  };

  const sourceLabel = getOrderItemSourceLabel(source);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-black pb-4">
        <h2 className="text-xl font-bold text-black uppercase tracking-tight">{sourceLabel} Production Master</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(260px,1.4fr)_minmax(180px,1fr)_minmax(220px,1fr)_minmax(260px,1.1fr)_150px_150px_auto_auto] md:items-center">
        <TableControls searchTerm={searchTerm} onSearchChange={setSearchTerm} placeholder="Search" />
        <Select value={firmFilter} onChange={setFirmFilter} options={firmOptions} placeholder="Firms" />
        <Select value={companyFilter} onChange={setCompanyFilter} options={companyOptions} placeholder="Companies" />
        <Select value={itemFilter} onChange={setItemFilter} options={itemOptions} placeholder="Items" />
        <label className="text-xs font-bold uppercase">From Date<input type="date" aria-label="From Date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="mt-1 block rounded border border-black px-3 py-2 text-sm" /></label>
        <label className="text-xs font-bold uppercase">To Date<input type="date" aria-label="To Date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="mt-1 block rounded border border-black px-3 py-2 text-sm" /></label>
        {(searchTerm || companyFilter || itemFilter || firmFilter || fromDate || toDate) ? (
          <button type="button" onClick={() => { setSearchTerm(""); setCompanyFilter(""); setItemFilter(""); setFirmFilter(""); setFromDate(""); setToDate(""); }} className="rounded border border-black bg-white px-3 py-2 text-sm font-bold text-black hover:bg-slate-50">Clear Filters</button>
        ) : null}
        <details className="relative">
          <summary className="cursor-pointer select-none rounded border border-black bg-white px-3 py-2 text-sm font-bold text-black">Columns ({MASTER_COLUMNS.length - hiddenColumns.length}/{MASTER_COLUMNS.length})</summary>
          <div className="absolute right-0 z-40 mt-1 max-h-96 w-72 overflow-auto rounded border-2 border-black bg-white p-3 shadow-lg">
            <div className="mb-2 flex gap-2">
              <button type="button" onClick={() => setHiddenColumns([])} className="rounded border border-black px-2 py-1 text-xs font-bold">Show all</button>
              <button type="button" onClick={() => setHiddenColumns(MASTER_COLUMNS.map((_, index) => index).filter((index) => index !== 0))} className="rounded border border-black px-2 py-1 text-xs font-bold">Hide all</button>
            </div>
            {MASTER_COLUMNS.map((label, index) => (
              <label key={label} className="flex items-center gap-2 py-1 text-xs">
                <input type="checkbox" checked={!hiddenColumns.includes(index)} disabled={index === 0} onChange={() => toggleColumn(index)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </details>
      </div>
      {hiddenColumnsCss ? <style>{hiddenColumnsCss}</style> : null}
      <div className="bg-white border border-black rounded shadow-sm overflow-auto">
        <table className="pp-master-table w-full border-collapse [&_th]:border [&_th]:border-black [&_td]:border [&_td]:border-slate-400 [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap [&_td]:align-middle">
          <thead className="sticky top-0 z-30 bg-slate-100">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-black uppercase">Job No</th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase">Date</th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase">Firm</th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase">Shift</th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase">Category</th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase">Master ERP</th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase">ERP</th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase">Item</th>
              <th className="px-3 py-2 text-right text-xs font-black uppercase">Sets/Pcs per Box</th>
              <th className="px-3 py-2 text-right text-xs font-black uppercase">Length</th>
              <th className="px-3 py-2 text-right text-xs font-black uppercase">Breadth</th>
              <th className="px-3 py-2 text-right text-xs font-black uppercase">Height</th>
              <th className="px-3 py-2 text-right text-xs font-black uppercase">Ply</th>
              <th className="px-3 py-2 text-right text-xs font-black uppercase">No of Holes in PHP</th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase">Flute Type</th>
              <th className="px-3 py-2 text-right text-xs font-black uppercase">L1</th>
              <th className="px-3 py-2 text-right text-xs font-black uppercase">F1</th>
              <th className="px-3 py-2 text-right text-xs font-black uppercase">L2</th>
              <th className="px-3 py-2 text-right text-xs font-black uppercase">F2</th>
              <th className="px-3 py-2 text-right text-xs font-black uppercase">L3</th>
              <th className="px-3 py-2 text-right text-xs font-black uppercase">Board GSM (Req)</th>
              <th className="px-3 py-2 text-right text-xs font-black uppercase">Brusting Strength (Req)</th>
              <th className="px-3 py-2 text-right text-xs font-black uppercase">Weight/Pc Set (Req)</th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase">Printing Colour</th>
              <th className="px-3 py-2 text-right text-xs font-black uppercase">Required Qnt</th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase">Planning ID</th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase">Scheduled Date</th>
              <th className="px-3 py-2 text-right text-xs font-black uppercase">Planned Qnt</th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase">Methodology</th>
              <th className="px-3 py-2 text-right text-xs font-black uppercase">FG Value</th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase">Job Type</th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase">Sequence</th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase">Job Completion Time</th>
              <th className="px-3 py-2 text-right text-xs font-black uppercase">Output</th>
              <th className="px-3 py-2 text-right text-xs font-black uppercase">Qty</th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase">UOM</th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase">Status</th>
              <th className="px-3 py-2 text-left text-xs font-black uppercase">Remarks</th>
              <th className="px-3 py-2 text-center text-xs font-black uppercase">Action</th>
            </tr>
          </thead>
          <tbody>
            {paginatedItems.length === 0 ? (
              <tr>
                <td colSpan={39} className="px-6 py-8 text-center text-black font-medium">No productions found.</td>
              </tr>
            ) : (
              paginatedItems.map((row) => {
                const item = items.find((entry) => entry.id === String(row.itemId || "").trim());
                const fgState = resolvePhpPlateFgLink(row, fgProductions, source);
                return (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-sm font-semibold">{formatCell(row.transactionNo)}</td>
                    <td className="px-3 py-2 text-sm">{formatCell(row.date)}</td>
                    <td className="px-3 py-2 text-sm">{getFirmDisplayNameById(resolvePhpPlateFirmId(row, schedules, orders), firms)}</td>
                    <td className="px-3 py-2 text-sm">{formatCell(row.shift)}</td>
                    <td className="px-3 py-2 text-sm">{formatCell(row.category)}</td>
                    <td className="px-3 py-2 text-sm">{formatCell(row.masterErp)}</td>
                    <td className="px-3 py-2 text-sm">{formatCell(row.erpCode || item?.erp)}</td>
                    <td className="px-3 py-2 text-sm">{formatCell(item?.name || row.itemId)}</td>
                    <td className="px-3 py-2 text-sm text-right">{formatNumber(row.setsPerBox)}</td>
                    <td className="px-3 py-2 text-sm text-right">{formatNumber(row.length)}</td>
                    <td className="px-3 py-2 text-sm text-right">{formatNumber(row.breadth)}</td>
                    <td className="px-3 py-2 text-sm text-right">{formatNumber(row.height)}</td>
                    <td className="px-3 py-2 text-sm text-right">{formatNumber(row.ply)}</td>
                    <td className="px-3 py-2 text-sm text-right">{formatNumber(row.noOfHolesInPhp)}</td>
                    <td className="px-3 py-2 text-sm">{formatCell(row.fluteType || row.flute)}</td>
                    <td className="px-3 py-2 text-sm text-right">{formatNumber(row.l1)}</td>
                    <td className="px-3 py-2 text-sm text-right">{formatNumber(row.f1)}</td>
                    <td className="px-3 py-2 text-sm text-right">{formatNumber(row.l2)}</td>
                    <td className="px-3 py-2 text-sm text-right">{formatNumber(row.f2)}</td>
                    <td className="px-3 py-2 text-sm text-right">{formatNumber(row.l3)}</td>
                    <td className="px-3 py-2 text-sm text-right">{formatNumber(row.boardGsmReq || row.gsm)}</td>
                    <td className="px-3 py-2 text-sm text-right">{formatNumber(row.brustingStrengthReq)}</td>
                    <td className="px-3 py-2 text-sm text-right">{formatNumber(row.weightPerPcSetReq || row.plateWeight)}</td>
                    <td className="px-3 py-2 text-sm">{formatCell(row.printingColor)}</td>
                    <td className="px-3 py-2 text-sm text-right">{formatNumber(row.requiredQty || row.qty)}</td>
                    <td className="px-3 py-2 text-sm">{formatCell(
                      schedules.find((schedule) => String(schedule.id) === String(row.scheduleId || ""))?.scheduleNo
                      || row.planningId
                      || row.scheduleId
                    )}</td>
                    <td className="px-3 py-2 text-sm">{formatCell(row.scheduledDate)}</td>
                    <td className="px-3 py-2 text-sm text-right">{formatNumber(row.plannedQty || row.qty)}</td>
                    <td className="px-3 py-2 text-sm">{formatCell(row.methodology)}</td>
                    <td className={`px-3 py-2 text-sm text-right ${getFgCellClasses(fgState.isBlocked, fgState.requiresFgGate)}`}>{formatFgNumber(fgState.fgValue)}</td>
                    <td className="px-3 py-2 text-sm">{formatCell(row.jobType)}</td>
                    <td className="px-3 py-2 text-sm">{row.scheduledDate && row.shift && row.methodology && !String(row.sequence || "").trim() && row.status !== "Cancelled" && row.status !== "Completed" && !String(row.jobCompletionTimeOutput || "").trim() ? <Link to="/production/php-plate/sequencing" className="font-bold text-amber-700 underline">Needs sequencing</Link> : formatCell(row.sequence)}</td>
                    <td className="px-3 py-2 text-sm">{formatCell(row.jobCompletionTimeOutput)}</td>
                    <td className="px-3 py-2 text-sm text-right">{formatNumber(row.productionOutputQty)}</td>
                    <td className="px-3 py-2 text-sm text-right">{formatNumber(row.qty)}</td>
                    <td className="px-3 py-2 text-sm">{formatCell(row.uom || item?.uom)}</td>
                    <td className="px-3 py-2 text-sm">{formatCell(row.status)}</td>
                    <td className="px-3 py-2 text-sm max-w-[420px] truncate" title={String(row.cancelRemarks || row.remarks || "")}>{formatCell(row.cancelRemarks || row.remarks)}</td>
                    <td className="px-3 py-2 text-center text-sm">
                      {canManage ? <button
                        type="button"
                        disabled={row.status === "Cancelled"}
                        onClick={() => void handleCancel(row.id)}
                        className="rounded border border-black px-2 py-1 font-bold uppercase disabled:opacity-40"
                      >
                        Cancel
                      </button> : null}
                    </td>
                  </tr>
                );
              })
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
