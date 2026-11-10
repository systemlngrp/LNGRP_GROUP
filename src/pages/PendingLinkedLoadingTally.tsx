import { useMemo, useState } from "react";
import { TableControls } from "../components/TableControls";
import { useData } from "../hooks/useData";
import { LoadingSlip } from "../types";
import { formatDate } from "../lib/serial";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";

function PendingLinkedLoadingTallyPage({ source }: { source: "PHP" | "PLATE" }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [loadingSlips] = useData<LoadingSlip>(source === "PHP" ? "php_loading_slips" : "plate_loading_slips", []);
  const [fgLoadingSlips] = useData<LoadingSlip>("loading_slips", []);

  const fgSlipMap = useMemo(
    () => new Map(fgLoadingSlips.map((slip) => [String(slip.id || "").trim(), slip])),
    [fgLoadingSlips]
  );

  const pendingRows = useMemo(() => {
    const words = searchWords(searchTerm);
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
        };
      })
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
          entry.row.tallyPostingStatus || "-",
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
  }, [fgSlipMap, loadingSlips, searchTerm, source]);

  const { sorted: sortedRows, sort, toggle: toggleSort } = useTableSort(pendingRows, (entry, key) => {
    switch (key) {
      case "slipNo": return entry.row.slipNo || "";
      case "fgSlipNo": return entry.fgSlipNo;
      case "consumptionNo": return entry.consumptionNo;
      case "date": return entry.row.date || "";
      case "itemName": return entry.itemName;
      case "companyName": return entry.companyName;
      case "totalQty": return entry.totalQty;
      case "status": return entry.row.tallyPostingStatus || "";
      case "remark": return entry.row.tallyPostingRemark || "";
      case "error": return entry.row.tallyPostingError || "";
      default: return "";
    }
  });

  const heading = source === "PHP" ? "Pending PHP Tally" : "Pending Plate Tally";
  const consumptionLabel = source === "PHP" ? "PHP Cons. No" : "Plate Cons. No";

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center pb-4 border-b border-black">
        <div>
          <h2 className="text-xl font-bold text-black uppercase tracking-tight">{heading}</h2>
          <p className="text-sm font-medium text-slate-600 mt-1">
            Shows linked {source.toLowerCase()} loading slips where <span className="font-bold">tallyTimestamp</span> is blank.
          </p>
        </div>
        <div className="text-sm font-bold text-slate-700">Pending: {pendingRows.length}</div>
      </div>

      <TableControls
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        placeholder="Search"
      />

      <div className="bg-white rounded shadow-sm overflow-hidden border border-black">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-black border-collapse">
            <thead className="sticky top-0 z-30 bg-slate-100">
              <tr className="divide-x divide-black">
                <th className="px-4 py-3 text-left text-xs font-bold uppercase"><SortHeader label={"Slip No"} sortKey="slipNo" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase"><SortHeader label={"FG Slip"} sortKey="fgSlipNo" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase"><SortHeader label={consumptionLabel} sortKey="consumptionNo" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase"><SortHeader label={"Date"} sortKey="date" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase"><SortHeader label={"Item"} sortKey="itemName" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase"><SortHeader label={"Company"} sortKey="companyName" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-right text-xs font-bold uppercase"><SortHeader label={"Qty"} sortKey="totalQty" sort={sort} onToggle={toggleSort} align="right" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase"><SortHeader label={"Status"} sortKey="status" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase"><SortHeader label={"Remark"} sortKey="remark" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase"><SortHeader label={"Error"} sortKey="error" sort={sort} onToggle={toggleSort} align="left" /></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black">
              {pendingRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-8 text-center text-slate-600 font-medium">
                    No pending {source} Tally posting rows found.
                  </td>
                </tr>
              ) : (
                sortedRows.map(({ row, fgSlipNo, consumptionNo, itemName, companyName, totalQty }) => (
                  <tr key={row.id} className="divide-x divide-black hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-bold">{row.slipNo || "-"}</td>
                    <td className="px-4 py-3 text-sm">{fgSlipNo}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-indigo-700">{consumptionNo || "-"}</td>
                    <td className="px-4 py-3 text-sm">{formatDate(row.date) || "-"}</td>
                    <td className="px-4 py-3 text-sm">{itemName}</td>
                    <td className="px-4 py-3 text-sm">{companyName}</td>
                    <td className="px-4 py-3 text-sm text-right">{totalQty.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm">{row.tallyPostingStatus || "-"}</td>
                    <td className="px-4 py-3 text-sm">{row.tallyPostingRemark || "-"}</td>
                    <td className="px-4 py-3 text-sm text-red-700">{row.tallyPostingError || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function PendingPhpLoadingTallyPosting() {
  return <PendingLinkedLoadingTallyPage source="PHP" />;
}

export function PendingPlateLoadingTallyPosting() {
  return <PendingLinkedLoadingTallyPage source="PLATE" />;
}
