import React, { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useData } from "../hooks/useData";
import { ExcelExport } from "../components/ExcelExport";
import {
  Material,
  MaterialIn,
  MaterialInPackingSlip,
  Production,
  ProductionProcessing,
  MaterialIssueReelLine,
  MaterialReturnReelLine,
} from "../types";
import { computeJobwiseReelConsumptionRows } from "../lib/reports/jobwiseReelConsumption";
import type { JobwiseReelConsumptionRow } from "../lib/reports/jobwiseReelConsumption";
import { useServerReport } from "../hooks/useServerReport";
import { formatDate } from "../lib/serial";
import { ClientPagination } from "../components/ClientPagination";
import { useClientPagination } from "../hooks/useClientPagination";
import { useTableSearch } from "../lib/tableSearch";

const JOBWISE_REEL_TABLES = ["productions", "production_processing", "materials", "material_in", "material_in_packing_slips", "material_issue_reel_lines", "material_return_reel_lines"];

export function JobwiseReelConsumptionReport() {
  // Rows are calculated on the server; if it cannot, the lists are loaded and
  // calculated here as before.
  const serverReport = useServerReport<JobwiseReelConsumptionRow[]>("jobwise-reel-consumption", {}, JOBWISE_REEL_TABLES);
  const browserFallback = serverReport.failed;
  const [productions] = useData<Production>("productions", [], { enabled: browserFallback });
  const [processing] = useData<ProductionProcessing>("production_processing", [], { enabled: browserFallback });
  const [materials] = useData<Material>("materials", [], { enabled: browserFallback });
  const [materialIn] = useData<MaterialIn>("material-in", [], { enabled: browserFallback });
  const [packingSlips] = useData<MaterialInPackingSlip>("material-in-packing-slips", [], { enabled: browserFallback });
  const [issueReelLines] = useData<MaterialIssueReelLine>("material-issue-reel-lines", [], { enabled: browserFallback });
  const [returnReelLines] = useData<MaterialReturnReelLine>("material-return-reel-lines", [], { enabled: browserFallback });

  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minGpPercent, setMinGpPercent] = useState("");

  const clientBaseRows = useMemo<JobwiseReelConsumptionRow[]>(
    () => (browserFallback ? computeJobwiseReelConsumptionRows({ productions, processing, materials, materialIn, packingSlips, issueReelLines, returnReelLines }) : []),
    [browserFallback, issueReelLines, materialIn, materials, packingSlips, processing, productions, returnReelLines]
  );
  const baseRows = browserFallback ? clientBaseRows : (serverReport.result || []);

  // Table search: every typed word must be in the columns the table shows.
  const searchedRows = useTableSearch(baseRows, searchTerm, (row) => [
    row.jobNo,
    formatDate(row.corrugationDate),
    row.jobFfg,
    row.jobRate,
    row.jobValue,
    row.reelIssued,
    row.reelReturned,
    row.reelConsumed,
    row.consumedValue,
    row.gp,
    row.gpPercent,
  ]);

  const rows = useMemo<JobwiseReelConsumptionRow[]>(() => {
    return searchedRows
      .filter((row) => {
        if (dateFrom && (!row.corrugationDate || new Date(row.corrugationDate).getTime() < new Date(dateFrom).getTime())) return false;
        if (dateTo && (!row.corrugationDate || new Date(row.corrugationDate).getTime() > new Date(dateTo).getTime())) return false;
        if (minGpPercent && row.gpPercent < Number(minGpPercent || 0)) return false;
        return true;
      })
      .sort((a, b) => {
        const dateDiff = new Date(b.corrugationDate || 0).getTime() - new Date(a.corrugationDate || 0).getTime();
        if (dateDiff !== 0) return dateDiff;
        return a.jobNo.localeCompare(b.jobNo);
      });
  }, [searchedRows, dateFrom, dateTo, minGpPercent]);

  // Totals and Excel use every matching job; the table draws one page at a
  // time so thousands of rows do not freeze the screen.
  const { page, setPage, pageSize, setPageSize, totalItems, paginatedItems: pagedRows } = useClientPagination(rows, 100);
  useEffect(() => { setPage(1); }, [dateFrom, dateTo, minGpPercent, searchTerm, setPage]);

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row) => ({
        jobValue: acc.jobValue + row.jobValue,
        reelConsumed: acc.reelConsumed + row.reelConsumed,
        consumedValue: acc.consumedValue + row.consumedValue,
        gp: acc.gp + row.gp,
      }),
      { jobValue: 0, reelConsumed: 0, consumedValue: 0, gp: 0 }
    );
  }, [rows]);

  const averageGpPercent =
    summary.jobValue > 0 ? Number(((summary.gp / summary.jobValue) * 100).toFixed(2)) : 0;


  const excelRows = useMemo(
    () => [
      ...(rows.length > 0 ? [{
        "Job No.": "TOTAL",
        "Corrugation Date": "",
        "Job FFG": "",
        "Job Rate": "",
        "Job Value": Number(summary.jobValue.toFixed(2)),
        "Reel Issued": "",
        "Reel Returned": "",
        "Reel Consumed": Number(summary.reelConsumed.toFixed(2)),
        "Actual Consumed Value": Number(summary.consumedValue.toFixed(2)),
        GP: Number(summary.gp.toFixed(2)),
        "GP%": Number(averageGpPercent.toFixed(2)),
      }] : []),
      ...rows.map((row) => ({
        "Job No.": row.jobNo,
        "Corrugation Date": formatDate(row.corrugationDate),
        "Job FFG": Number(row.jobFfg || 0),
        "Job Rate": Number(row.jobRate || 0),
        "Job Value": Number(row.jobValue || 0),
        "Reel Issued": Number(row.reelIssued || 0),
        "Reel Returned": Number(row.reelReturned || 0),
        "Reel Consumed": Number(row.reelConsumed || 0),
        "Actual Consumed Value": Number(row.consumedValue || 0),
        GP: Number(row.gp || 0),
        "GP%": Number(row.gpPercent || 0),
      })),
    ],
    [averageGpPercent, rows, summary]
  );
  const handleClear = () => {
    setSearchTerm("");
    setDateFrom("");
    setDateTo("");
    setMinGpPercent("");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 border-b border-black pb-3">
        <h2 className="text-xl font-bold text-black uppercase tracking-tight">Jobwise Reel Consumption</h2>
        
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded border border-blue-300 bg-blue-50 p-4">
          <div className="text-xs font-black uppercase text-blue-700">Total Job Value</div>
          <div className="mt-1 text-2xl font-black text-blue-900">{summary.jobValue.toFixed(2)}</div>
        </div>
        <div className="rounded border border-amber-300 bg-amber-50 p-4">
          <div className="text-xs font-black uppercase text-amber-700">Reel Consumed</div>
          <div className="mt-1 text-2xl font-black text-amber-900">{summary.reelConsumed.toFixed(2)}</div>
        </div>
        <div className="rounded border border-purple-300 bg-purple-50 p-4">
          <div className="text-xs font-black uppercase text-purple-700">Actual Consumed Value</div>
          <div className="mt-1 text-2xl font-black text-purple-900">{summary.consumedValue.toFixed(2)}</div>
        </div>
        <div className="rounded border border-emerald-300 bg-emerald-50 p-4">
          <div className="text-xs font-black uppercase text-emerald-700">Average GP%</div>
          <div className="mt-1 text-2xl font-black text-emerald-900">{averageGpPercent.toFixed(2)}</div>
        </div>
      </div>

      <div className="rounded border border-black bg-white p-3">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1.4fr)_repeat(3,minmax(130px,0.8fr))_auto] xl:items-center">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search"
              className="w-full rounded border-2 border-black py-2.5 pl-9 pr-3 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
            />
          </div>

          <label className="block min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">From Date</span><input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            title="Date From"
            className="w-full rounded border-2 border-black px-3 py-2.5 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
          /></label>

          <label className="block min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">To Date</span><input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            title="Date To"
            className="w-full rounded border-2 border-black px-3 py-2.5 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
          /></label>

          <input
            type="number"
            value={minGpPercent}
            onChange={(e) => setMinGpPercent(e.target.value)}
            placeholder="Min GP%"
            className="w-full rounded border-2 border-black px-3 py-2.5 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
          />

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleClear}
              className="min-h-[42px] rounded border border-black bg-white px-3 py-2 text-sm font-bold text-black hover:bg-slate-50"
            >
              Clear Filters
            </button>
            <ExcelExport data={excelRows} fileName="Jobwise_Reel_Consumption_Report" sheetName="Jobwise Consumption" />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded border-2 border-black bg-white shadow-sm">
        <div className="max-h-[calc(100vh-250px)] w-full overflow-auto relative">
          <table className="w-full min-w-max border-collapse text-[12px]">
            <thead className="sticky top-0 z-20">
              <tr className="bg-indigo-700 text-white">
                {[
                  "Job No.",
                  "Corrugation Date",
                  "Job FFG",
                  "Job Rate",
                  "Job Value",
                  "Reel Issued",
                  "Reel Returned",
                  "Reel Consumed",
                  "Actual Consumed Value",
                  "GP",
                  "GP%",
                ].map((heading) => (
                  <th
                    key={heading}
                    className="sticky top-0 z-20 whitespace-nowrap border-2 border-black bg-indigo-700 px-3 py-3 text-left text-xs font-black uppercase text-white"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="border-2 border-black px-6 py-10 text-center text-sm font-medium text-black">
                    No jobs match the current filters.
                  </td>
                </tr>
              ) : (
                pagedRows.map((row) => (
                  <tr key={row.productionId} className="text-black hover:bg-slate-50">
                    <td className="border-2 border-black px-3 py-3 font-bold">{row.jobNo}</td>
                    <td className="border-2 border-black px-3 py-3 whitespace-nowrap">{formatDate(row.corrugationDate)}</td>
                    <td className="border-2 border-black px-3 py-3 text-right">{Number(row.jobFfg || 0).toFixed(2)}</td>
                    <td className="border-2 border-black px-3 py-3 text-right">{Number(row.jobRate || 0).toFixed(2)}</td>
                    <td className="border-2 border-black px-3 py-3 text-right font-semibold">{Number(row.jobValue || 0).toFixed(2)}</td>
                    <td className="border-2 border-black px-3 py-3 text-right">{Number(row.reelIssued || 0).toFixed(2)}</td>
                    <td className="border-2 border-black px-3 py-3 text-right">{Number(row.reelReturned || 0).toFixed(2)}</td>
                    <td className="border-2 border-black bg-amber-50 px-3 py-3 text-right font-bold text-amber-800">{Number(row.reelConsumed || 0).toFixed(2)}</td>
                    <td className="border-2 border-black bg-purple-50 px-3 py-3 text-right font-bold text-purple-900">{Number(row.consumedValue || 0).toFixed(2)}</td>
                    <td className="border-2 border-black bg-emerald-50 px-3 py-3 text-right font-bold text-emerald-900">{Number(row.gp || 0).toFixed(2)}</td>
                    <td className="border-2 border-black bg-emerald-50 px-3 py-3 text-right font-black text-emerald-900">{Number(row.gpPercent || 0).toFixed(2)}</td>
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
    </div>
  );

}
