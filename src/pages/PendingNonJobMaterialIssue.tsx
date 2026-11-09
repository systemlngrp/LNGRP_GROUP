import React, { useMemo, useState } from "react";
import { getFirmDisplayName } from "../lib/firmDisplay";
import { useNavigate } from "react-router-dom";
import { useData } from "../hooks/useData";
import { Firm, MaterialIssue } from "../types";
import { Ban, FilePlus2, Search } from "lucide-react";
import { ClientPagination } from "../components/ClientPagination";
import { formatDate } from "../lib/serial";
import { usePendingDailyConsumables } from "../hooks/usePendingDailyConsumables";

export function PendingNonJobMaterialIssue() {
  const navigate = useNavigate();
  const [firms, , firmsLoading, firmsApi] = useData<Firm>("firms", [], { firmScope: "all" });
  const [, , , materialIssueApi] = useData<MaterialIssue>("material-issues", [], { enabled: false, firmScope: "all" });

  const [searchTerm, setSearchTerm] = useState("");
  const [firmFilter, setFirmFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [markingDate, setMarkingDate] = useState<string | null>(null);
  const [notApplicableDate, setNotApplicableDate] = useState<string | null>(null);
  const [notApplicableRemarks, setNotApplicableRemarks] = useState("");
  const [notApplicableError, setNotApplicableError] = useState("");
  const pending = usePendingDailyConsumables({ page, pageSize, search: searchTerm, firmId: firmFilter });
  const loadError = firmsApi.error || pending.error;
  const filtered = pending.rows;

  const groupedByFirm = useMemo(() => {
    const groups = new Map<string, { firmId: string; firmName: string; rows: typeof filtered }>();
    filtered.forEach((row) => {
      const existing = groups.get(row.firmId);
      if (existing) {
        existing.rows.push(row);
      } else {
        groups.set(row.firmId, { firmId: row.firmId, firmName: row.firmName, rows: [row] });
      }
    });
    return Array.from(groups.values()).sort((a, b) => a.firmName.localeCompare(b.firmName));
  }, [filtered]);

  const openForm = (firmId: string, date: string) => {
    const params = new URLSearchParams({
      date,
      issueType: "Without Job",
      lockDate: "1",
      lockIssueType: "1",
      firmId,
      lockFirm: "1",
    });
    navigate(`/material-movement/daily-consumption?${params.toString()}`);
  };
  const openNotApplicableModal = (firmId: string, date: string) => {
    setNotApplicableDate(`${firmId}:${date}`);
    setNotApplicableRemarks("");
    setNotApplicableError("");
  };

  const closeNotApplicableModal = () => {
    if (markingDate) return;
    setNotApplicableDate(null);
    setNotApplicableRemarks("");
    setNotApplicableError("");
  };

  const markNotApplicable = async () => {
    if (!notApplicableDate) return;
    const [firmId, date] = notApplicableDate.split(":");
    const firm = firms.find((row) => row.id === firmId);
    if (!firm) return;
    const reason = notApplicableRemarks.trim();
    if (!reason) {
      setNotApplicableError("Remarks are mandatory for Not Applicable.");
      return;
    }

    const timestamp = new Date().toISOString();
    const issue: MaterialIssue = {
      id: crypto.randomUUID(),
      issueNo: "",
      firmId,
      firmName: firm.firmName,
      date,
      issueType: "Without Job",
      remarks: reason,
      notApplicable: "Yes",
      tallyPostingStatus: "Not Applicable",
      tallyTimestamp: timestamp,
      tallyLastAttemptAt: timestamp,
      tallyPostedBy: "System User",
      tallyPostingRemark: reason,
      updatedBy: "System User",
      updateTimestamp: timestamp,
    };

    setMarkingDate(notApplicableDate);
    try {
      await materialIssueApi.addItem(issue);
      await pending.refresh();
      setNotApplicableDate(null);
      setNotApplicableRemarks("");
      setNotApplicableError("");
    } catch (error) {
      console.error("Failed to mark Not Applicable:", error);
      setNotApplicableError("Failed to mark date as Not Applicable.");
    } finally {
      setMarkingDate(null);
    }
  };

  const firmById = useMemo(() => new Map(firms.map((firm) => [firm.id, firm])), [firms]);
  const firmCode = (firmId: string, fallback: string) => getFirmDisplayName(firmById.get(firmId) || { firmName: fallback });
  const rows = useMemo(() => groupedByFirm.flatMap((group) => group.rows), [groupedByFirm]);
  const todayKey = new Date().toISOString().slice(0, 10);
  const daysPending = (date: string) => {
    const ms = new Date(`${todayKey}T00:00:00`).getTime() - new Date(`${String(date).slice(0, 10)}T00:00:00`).getTime();
    return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86_400_000)) : 0;
  };
  const weekday = (date: string) => {
    const value = new Date(`${String(date).slice(0, 10)}T00:00:00`);
    return Number.isNaN(value.getTime()) ? "" : value.toLocaleDateString("en-IN", { weekday: "short" });
  };
  const statusMessage = firmsLoading || (pending.loading && filtered.length === 0)
    ? "Loading..."
    : loadError
      ? `Unable to load: ${loadError}`
      : "";

  // Not Applicable / Create Issue, shared by table rows and phone cards.
  const renderActions = (row: { firmId: string; date: string }, wide = false) => {
    const key = `${row.firmId}:${row.date}`;
    return (
      <div className={wide ? "grid grid-cols-2 gap-2" : "flex items-center justify-end gap-2"}>
        <button
          type="button"
          onClick={() => openNotApplicableModal(row.firmId, row.date)}
          disabled={markingDate === key}
          title="Not Applicable"
          className="inline-flex items-center justify-center gap-1.5 rounded-md border-2 border-slate-700 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          <Ban size={14} /> {markingDate === key ? "Saving..." : "NA"}
        </button>
        <button
          type="button"
          onClick={() => openForm(row.firmId, row.date)}
          title="Create Issue"
          className="inline-flex items-center justify-center gap-1.5 rounded-md border-2 border-indigo-800 bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
        >
          <FilePlus2 size={14} /> Issue
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="border-b border-black pb-3">
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">Pending Non-Job Material Issue</h2>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border-2 border-black bg-indigo-50 p-3 text-indigo-900">
          <div className="text-[11px] font-black uppercase tracking-wide">Pending Dates</div>
          <div className="text-xl font-black tabular-nums">{pending.total.toLocaleString()}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded border border-black bg-white p-4 sm:grid-cols-[minmax(0,2fr)_minmax(160px,1fr)]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            placeholder="Search"
            className="w-full rounded border-2 border-black py-2 pl-9 pr-3 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
          />
        </div>
        <select
          value={firmFilter}
          onChange={(e) => { setFirmFilter(e.target.value); setPage(1); }}
          aria-label="Firm"
          className="w-full rounded border-2 border-black bg-white px-3 py-2 text-sm font-semibold"
        >
          <option value="">Firms</option>
          {firms.map((firm) => <option key={firm.id} value={firm.id}>{getFirmDisplayName(firm)}</option>)}
        </select>
      </div>

      {statusMessage ? (
        <div className={`rounded border px-3 py-2 text-sm font-bold ${loadError ? "border-red-300 bg-red-50 text-red-700" : "border-slate-300 bg-slate-50 text-slate-600"}`}>{statusMessage}</div>
      ) : null}

      {/* Desktop table (also shown on phones when empty) */}
      <div className={`${rows.length === 0 ? "block" : "hidden md:block"} overflow-x-auto rounded border border-black bg-white`}>
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-slate-100 text-xs font-bold uppercase text-black">
            <tr>
              <th className="border border-black px-3 py-3 text-left">Firm</th>
              <th className="border border-black px-3 py-3 text-left">Date</th>
              <th className="border border-black px-3 py-3 text-left">Day</th>
              <th className="border border-black px-3 py-3 text-right">Days Pending</th>
              <th className="border border-black px-3 py-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="h-16" aria-label="No records" /></tr>
            ) : rows.map((row) => (
              <tr key={`${row.firmId}:${row.date}`} className="hover:bg-slate-50">
                <td className="border border-black px-3 py-2 font-bold">{firmCode(row.firmId, row.firmName)}</td>
                <td className="border border-black px-3 py-2 font-semibold">{formatDate(row.date) || row.date}</td>
                <td className="border border-black px-3 py-2">{weekday(row.date)}</td>
                <td className="border border-black px-3 py-2 text-right tabular-nums">{daysPending(row.date)}</td>
                <td className="border border-black px-3 py-2">{renderActions(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone cards */}
      {rows.length > 0 ? (
        <div className="space-y-3 md:hidden">
          {rows.map((row) => (
            <div key={`${row.firmId}:${row.date}`} className="rounded-md border-2 border-black bg-white p-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <div className="text-base font-black">{formatDate(row.date) || row.date}</div>
                  <div className="text-xs font-semibold text-slate-600">{weekday(row.date)} · {firmCode(row.firmId, row.firmName)}</div>
                </div>
                <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                  {daysPending(row.date)} day{daysPending(row.date) === 1 ? "" : "s"}
                </span>
              </div>
              {renderActions(row, true)}
            </div>
          ))}
        </div>
      ) : null}

      {pending.total > 0 ? (
        <ClientPagination
          page={page}
          pageSize={pageSize}
          totalItems={pending.total}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          pageSizeOptions={[25, 50, 100, 250]}
        />
      ) : null}

      {notApplicableDate ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-xl border-2 border-black bg-white p-5 shadow-2xl sm:rounded-xl">
            <div className="mb-4 border-b border-black pb-3">
              <h3 className="text-lg font-black uppercase tracking-tight text-black">NA (Not Applicable)</h3>
              <p className="mt-1 text-sm font-bold text-slate-600">{(() => { const [firmId, date] = notApplicableDate.split(":"); return `${firmCode(firmId, firmId)} — ${formatDate(date) || date}`; })()}</p>
            </div>

            <label className="mb-2 block text-xs font-black uppercase text-black">Remarks <span className="text-red-500">*</span></label>
            <textarea
              value={notApplicableRemarks}
              onChange={(e) => {
                setNotApplicableRemarks(e.target.value);
                if (notApplicableError) setNotApplicableError("");
              }}
              rows={4}
              autoFocus
              disabled={!!markingDate}
              className="w-full resize-none rounded border-2 border-black p-3 text-sm font-semibold text-black focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600 disabled:bg-slate-100"
            />
            {notApplicableError ? <div className="mt-2 text-xs font-bold text-red-600">{notApplicableError}</div> : null}

            <div className="mt-5 grid grid-cols-2 gap-3 sm:flex sm:justify-end">
              <button
                type="button"
                onClick={closeNotApplicableModal}
                disabled={!!markingDate}
                className="rounded border border-black bg-white px-4 py-2 text-sm font-bold text-black hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void markNotApplicable()}
                disabled={!!markingDate}
                className="rounded border border-black bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {markingDate ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
