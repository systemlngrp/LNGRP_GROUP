import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download } from "lucide-react";
import { getDataAuthHeaders } from "../hooks/useData";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";

/** Correction Log: every Admin correction made from the Job Wise Tracker. */

type Correction = {
  id: string;
  jobId: string;
  jobNo: string;
  field: string;
  entryRef: string;
  oldValue: number | string;
  newValue: number | string;
  reason: string;
  correctedBy: string;
  correctedAt: string;
};

const TH = "border border-black px-3 py-2 text-left text-[11px] font-black uppercase";
const TD = "border border-black px-3 py-2 text-xs";

const formatDateTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

export function JobCorrectionLog() {
  const [rows, setRows] = useState<Correction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [fieldFilter, setFieldFilter] = useState("");

  useEffect(() => {
    fetch("/api/job-corrections", { headers: { ...getDataAuthHeaders(false) } })
      .then(async (response) => {
        const body = await response.json().catch(() => []);
        if (!response.ok) throw new Error(String((body as any)?.error || "Failed to load."));
        setRows(Array.isArray(body) ? body : []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load."))
      .finally(() => setLoading(false));
  }, []);

  const visibleRows = useMemo(() => {
    const words = searchWords(searchTerm);
    return rows
      .filter((row) => !fieldFilter || row.field === fieldFilter)
      .filter((row) => matchesTableSearch([row.jobNo, row.field, row.entryRef, row.reason, row.correctedBy], words));
  }, [rows, searchTerm, fieldFilter]);

  const exportExcel = () => {
    const sheet = XLSX.utils.json_to_sheet(visibleRows.map((row) => ({
      "Corrected At": formatDateTime(row.correctedAt),
      "Job No": row.jobNo,
      Field: row.field,
      Entry: row.entryRef,
      "Old Value": Number(row.oldValue) || 0,
      "New Value": Number(row.newValue) || 0,
      Change: (Number(row.newValue) || 0) - (Number(row.oldValue) || 0),
      Reason: row.reason,
      "Corrected By": row.correctedBy,
    })));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Correction Log");
    XLSX.writeFile(book, `Job_Correction_Log_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-black pb-3">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-tight text-black">Job Correction Log</h2>
          <p className="text-xs text-slate-600">Admin corrections of corrugation, printed, loaded and loading wastage made from the Job Wise Tracker.</p>
        </div>
        <button type="button" onClick={exportExcel} className="flex items-center gap-2 rounded border-2 border-black bg-white px-3 py-1.5 text-xs font-bold hover:bg-slate-100">
          <Download size={14} /> Excel
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 rounded border border-black bg-white p-3 md:grid-cols-3">
        <input type="text" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search job, reason, user…" className="h-9 rounded border-2 border-black px-3 text-sm md:col-span-2" />
        <select value={fieldFilter} onChange={(event) => setFieldFilter(event.target.value)} className="h-9 rounded border-2 border-black px-2 text-sm">
          <option value="">All fields</option>
          {["Corrugation", "Printed", "Loaded", "Loading Wastage"].map((field) => <option key={field} value={field}>{field}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto rounded border-2 border-black bg-white">
        <table className="w-full min-w-[1000px] border-collapse">
          <thead className="bg-indigo-700 text-white">
            <tr>
              {["Corrected At", "Job No", "Field", "Entry", "Old", "New", "Change", "Reason", "Corrected By"].map((heading) => <th key={heading} className={TH}>{heading}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="p-6 text-center text-sm text-slate-500">Loading…</td></tr>
            ) : error ? (
              <tr><td colSpan={9} className="p-6 text-center text-sm font-bold text-red-700">{error}</td></tr>
            ) : visibleRows.length === 0 ? (
              <tr><td colSpan={9} className="p-6 text-center text-sm italic text-slate-500">No corrections yet.</td></tr>
            ) : visibleRows.map((row) => {
              const change = (Number(row.newValue) || 0) - (Number(row.oldValue) || 0);
              return (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className={`${TD} whitespace-nowrap`}>{formatDateTime(row.correctedAt)}</td>
                  <td className={`${TD} font-bold`}>{row.jobNo}</td>
                  <td className={TD}>{row.field}</td>
                  <td className={TD}>{row.entryRef}</td>
                  <td className={`${TD} text-right`}>{(Number(row.oldValue) || 0).toLocaleString()}</td>
                  <td className={`${TD} text-right font-bold`}>{(Number(row.newValue) || 0).toLocaleString()}</td>
                  <td className={`${TD} text-right font-bold ${change < 0 ? "text-red-700" : "text-emerald-700"}`}>{change > 0 ? "+" : ""}{change.toLocaleString()}</td>
                  <td className={TD}>{row.reason}</td>
                  <td className={TD}>{row.correctedBy}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
