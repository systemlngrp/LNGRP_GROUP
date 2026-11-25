import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { FileSpreadsheet, FileText, Search } from "lucide-react";

/**
 * Reel to Order (Store). View only for now: the data source will be connected
 * later. Each row is one RAPC Range + GSM.
 * Net Paper to Order = Total Paper Requirement − Total Closing Stock − Total Pending PO + MIL.
 */
export type ReelToOrderRow = {
  rapcRange: string;
  gsm: string;
  totalPaperRequirement: number;
  totalClosingStock: number;
  totalPendingPo: number;
  mil: number;
};

const COLUMNS = ["RAPC Range", "GSM", "Total Paper Requirement", "Total Closing Stock", "Total Pending PO", "MIL", "Net Paper to Order"];

const netToOrder = (row: ReelToOrderRow) => row.totalPaperRequirement - row.totalClosingStock - row.totalPendingPo + row.mil;
const qty = (value: number) => Math.round(Number(value) || 0).toLocaleString("en-IN");
const netClass = (value: number) => (value > 0 ? "text-red-600" : value < 0 ? "text-green-600" : "text-slate-500");

export function ReelToOrder({ rows = [] }: { rows?: ReelToOrderRow[] }) {
  const [searchTerm, setSearchTerm] = useState("");

  const visibleRows = useMemo(() => {
    const words = searchTerm.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return rows;
    return rows.filter((row) => {
      const text = `${row.rapcRange} ${row.gsm}`.toLowerCase();
      return words.every((word) => text.includes(word));
    });
  }, [rows, searchTerm]);

  const totals = useMemo(
    () =>
      visibleRows.reduce(
        (sum, row) => ({
          totalPaperRequirement: sum.totalPaperRequirement + (Number(row.totalPaperRequirement) || 0),
          totalClosingStock: sum.totalClosingStock + (Number(row.totalClosingStock) || 0),
          totalPendingPo: sum.totalPendingPo + (Number(row.totalPendingPo) || 0),
          mil: sum.mil + (Number(row.mil) || 0),
          net: sum.net + netToOrder(row),
        }),
        { totalPaperRequirement: 0, totalClosingStock: 0, totalPendingPo: 0, mil: 0, net: 0 },
      ),
    [visibleRows],
  );

  const today = new Date().toISOString().slice(0, 10);

  const downloadExcel = () => {
    const body = visibleRows.map((row) => [row.rapcRange, row.gsm, row.totalPaperRequirement, row.totalClosingStock, row.totalPendingPo, row.mil, netToOrder(row)]);
    const sheet = XLSX.utils.aoa_to_sheet([
      COLUMNS,
      ...body,
      ["Total", "", totals.totalPaperRequirement, totals.totalClosingStock, totals.totalPendingPo, totals.mil, totals.net],
    ]);
    sheet["!cols"] = [{ wch: 14 }, { wch: 8 }, { wch: 24 }, { wch: 20 }, { wch: 18 }, { wch: 10 }, { wch: 20 }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Reel to Order");
    XLSX.writeFile(book, `Reel_to_Order_${today}.xlsx`);
  };

  const downloadPdf = () => {
    const doc = new jsPDF("l", "mm", "a4");
    doc.setFontSize(14);
    doc.text("Reel to Order", 14, 14);
    doc.setFontSize(9);
    doc.text(`Date: ${today.split("-").reverse().join("-")}`, 14, 20);
    autoTable(doc, {
      startY: 24,
      head: [COLUMNS],
      body: visibleRows.map((row) => [row.rapcRange, row.gsm, qty(row.totalPaperRequirement), qty(row.totalClosingStock), qty(row.totalPendingPo), qty(row.mil), qty(netToOrder(row))]),
      foot: [["Total", "", qty(totals.totalPaperRequirement), qty(totals.totalClosingStock), qty(totals.totalPendingPo), qty(totals.mil), qty(totals.net)]],
      showFoot: "lastPage",
      theme: "grid",
      styles: { fontSize: 9, halign: "center" },
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [226, 232, 240], textColor: 0, fontStyle: "bold" },
    });
    doc.save(`Reel_to_Order_${today}.pdf`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">Reel to Order</h2>
        <div className="flex gap-2">
          <button type="button" onClick={downloadExcel} className="flex items-center gap-2 rounded border-2 border-black bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">
            <FileSpreadsheet size={14} /> Excel
          </button>
          <button type="button" onClick={downloadPdf} className="flex items-center gap-2 rounded border-2 border-black bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700">
            <FileText size={14} /> PDF
          </button>
        </div>
      </div>

      <div className="relative w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input
          type="text"
          placeholder="Search RAPC Range or GSM"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
        />
      </div>

      <div className="overflow-hidden rounded border-2 border-black bg-white shadow-sm">
        <div className="max-h-[calc(100vh-230px)] w-full overflow-auto">
          <table className="w-full min-w-max border-collapse text-[13px]">
            <thead className="sticky top-0 z-20">
              <tr>
                {COLUMNS.map((heading) => (
                  <th key={heading} className="whitespace-nowrap bg-slate-900 px-4 py-3 text-center text-xs font-black uppercase text-white">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-6 py-10 text-center text-sm font-medium text-slate-600">
                    {rows.length === 0 ? "No data yet. This view will be connected to data later." : "No rows match the search."}
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => {
                  const net = netToOrder(row);
                  return (
                    <tr key={`${row.rapcRange}|${row.gsm}`} className="border-b border-slate-200 text-center text-black hover:bg-slate-50">
                      <td className="px-4 py-2.5">{row.rapcRange}</td>
                      <td className="px-4 py-2.5">{row.gsm}</td>
                      <td className="px-4 py-2.5">{qty(row.totalPaperRequirement)}</td>
                      <td className="px-4 py-2.5">{qty(row.totalClosingStock)}</td>
                      <td className="px-4 py-2.5">{qty(row.totalPendingPo)}</td>
                      <td className="px-4 py-2.5">{qty(row.mil)}</td>
                      <td className={`px-4 py-2.5 font-black ${netClass(net)}`}>{qty(net)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot className="sticky bottom-0 z-10">
              <tr className="bg-slate-200 text-center font-black text-black">
                <td className="border-t-2 border-black px-4 py-3 uppercase">Total</td>
                <td className="border-t-2 border-black px-4 py-3" />
                <td className="border-t-2 border-black px-4 py-3">{qty(totals.totalPaperRequirement)}</td>
                <td className="border-t-2 border-black px-4 py-3">{qty(totals.totalClosingStock)}</td>
                <td className="border-t-2 border-black px-4 py-3">{qty(totals.totalPendingPo)}</td>
                <td className="border-t-2 border-black px-4 py-3">{qty(totals.mil)}</td>
                <td className={`border-t-2 border-black px-4 py-3 ${netClass(totals.net)}`}>{qty(totals.net)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
