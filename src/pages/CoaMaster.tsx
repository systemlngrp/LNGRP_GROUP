import { Eye, FileText, LockKeyhole, Pencil, RotateCcw, CheckCircle2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { getFirmDisplayNameById } from "../lib/firmDisplay";
import { useNavigate } from "react-router-dom";
import { Select } from "../components/Select";
import { useData } from "../hooks/useData";
import { useAuth } from "../auth/AuthContext";
import { canManageMasterRecords } from "../lib/masterPermissions";
import { printCoaRecord } from "../lib/coaPrint";
import type { CoaRecord, Firm } from "../types";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";

const text = (value: unknown) => String(value ?? "").trim();

function displayDate(value: string) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

export function CoaMaster() {
  const navigate = useNavigate();
  const { user, activeFirm } = useAuth();
  const canManage = canManageMasterRecords(user?.role);
  const [records, , loading, api] = useData<CoaRecord>("coa-records", []);
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState("");
  const [templateVersion, setTemplateVersion] = useState("");
  const [firmFilter, setFirmFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [message, setMessage] = useState("");

  const companies = useMemo(() => Array.from(new Set(records.map((record) => text(record.companyName)).filter(Boolean))).sort(), [records]);
  const versions = useMemo(() => Array.from(new Set(records.map((record) => String(record.templateVersion || "")).filter(Boolean))).sort((a, b) => Number(b) - Number(a)), [records]);
  const firmOptions = useMemo(() => Array.from(new Set(records.map((record) => text(record.firmId)).filter(Boolean))).map((id) => ({ value: id, label: getFirmDisplayNameById(id, firms), searchText: `${getFirmDisplayNameById(id, firms)} ${firms.find((firm) => firm.id === id)?.firmName || ""}` })).sort((a, b) => a.label.localeCompare(b.label)), [firms, records]);
  const itemOptions = useMemo(() => Array.from(new Set(records.map((record) => text(record.itemName)).filter(Boolean))).sort().map((value) => ({ value, label: value })), [records]);
  const visibleRecords = useMemo(() => {
    const words = searchWords(search);
    return records.filter((record) => {
      if (company && record.companyName !== company) return false;
      if (status && record.status !== status) return false;
      if (templateVersion && String(record.templateVersion) !== templateVersion) return false;
      if (firmFilter && text(record.firmId) !== firmFilter) return false;
      if (itemFilter && text(record.itemName) !== itemFilter) return false;
      if (fromDate && text(record.coaDate).slice(0, 10) < fromDate) return false;
      if (toDate && text(record.coaDate).slice(0, 10) > toDate) return false;
      return matchesTableSearch([record.coaNo, record.companyName, record.jobNo, record.erpCode, record.itemName, displayDate(record.coaDate), record.coaDate, `v${record.templateVersion}`, record.status, record.updatedBy || record.createdBy], words);
    });
  }, [company, firmFilter, fromDate, itemFilter, records, search, status, templateVersion, toDate]);
  const { sorted: sortedRecords, sort, toggle: toggleSort } = useTableSort(visibleRecords, (record: CoaRecord, key) => {
    if (key === "companyName") return record.companyName || "-";
    if (key === "jobNo") return record.jobNo || "-";
    if (key === "erpCode") return record.erpCode || "-";
    if (key === "itemName") return record.itemName || "-";
    if (key === "coaDate") return record.coaDate;
    if (key === "templateVersion") return Number(record.templateVersion);
    if (key === "updatedBy") return record.updatedBy || record.createdBy || "-";
    return (record as any)[key];
  });

  const issuer = (record: CoaRecord) => {
    const firm = firms.find((value) => value.id === record.firmId);
    return { name: record.firmName || firm?.firmName || activeFirm?.firmName || "", logo: firm?.logo || activeFirm?.logo || "" };
  };

  const changeStatus = async (record: CoaRecord, action: "finalize" | "reopen") => {
    setMessage("");
    const token = window.localStorage.getItem("authToken") || "";
    const response = await fetch(`/api/coa-records/${record.id}/${action}`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setMessage(data.error || `Unable to ${action} COA.`);
    await api.refresh({ force: true });
    setMessage(`COA ${action === "finalize" ? "finalized" : "reopened"}.`);
  };

  return <div className="space-y-4 text-black">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black pb-3"><h2 className="text-xl font-bold uppercase tracking-tight text-black">COA Master</h2><button type="button" onClick={() => navigate("/quality/coa/form")} className="inline-flex items-center gap-2 rounded bg-indigo-700 px-4 py-2 font-bold text-white"><FileText size={16} /> Create COA</button></div>
    {message && <div className="rounded border-2 border-amber-700 bg-amber-50 p-3 font-bold">{message}</div>}
    <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3"><div className="relative w-full"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600" /></div><div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6"><div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Firm</span><Select compact value={firmFilter} onChange={setFirmFilter} options={firmOptions} placeholder="All" /></div><div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Company</span><Select compact value={company} onChange={setCompany} options={companies.map((value) => ({ value, label: value }))} placeholder="All" /></div><div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Item</span><Select compact value={itemFilter} onChange={setItemFilter} options={itemOptions} placeholder="All" /></div><div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Status</span><Select compact value={status} onChange={setStatus} options={[{ value: "Draft", label: "Draft" }, { value: "Final", label: "Final" }]} placeholder="All" /></div><div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Template</span><Select compact value={templateVersion} onChange={setTemplateVersion} options={versions.map((value) => ({ value, label: `Template v${value}` }))} placeholder="All" /></div><div data-date-pair="true" className="col-span-2 grid min-w-0 grid-cols-2 gap-2"><label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">COA From Date</span><input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label><label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">COA To Date</span><input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label></div></div><div data-mf-actions="true" className="flex justify-end gap-2">{(search.trim() || company || status || templateVersion || firmFilter || itemFilter || fromDate || toDate) ? <button type="button" onClick={() => { setSearch(""); setCompany(""); setStatus(""); setTemplateVersion(""); setFirmFilter(""); setItemFilter(""); setFromDate(""); setToDate(""); }} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button> : null}<button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button></div></div>
    <div className="overflow-x-auto rounded border border-black bg-white">
      <table className="min-w-[1250px] w-full border-collapse text-sm">
        <thead><tr className="bg-slate-800 text-white"><th className="border border-black p-2"><SortHeader label="COA No." sortKey="coaNo" sort={sort} onToggle={toggleSort} align="center" /></th><th className="border border-black p-2"><SortHeader label="Company" sortKey="companyName" sort={sort} onToggle={toggleSort} align="center" /></th><th className="border border-black p-2"><SortHeader label="Job No." sortKey="jobNo" sort={sort} onToggle={toggleSort} align="center" /></th><th className="border border-black p-2"><SortHeader label="ERP" sortKey="erpCode" sort={sort} onToggle={toggleSort} align="center" /></th><th className="border border-black p-2"><SortHeader label="Item" sortKey="itemName" sort={sort} onToggle={toggleSort} align="center" /></th><th className="border border-black p-2"><SortHeader label="COA Date" sortKey="coaDate" sort={sort} onToggle={toggleSort} align="center" /></th><th className="border border-black p-2"><SortHeader label="Template" sortKey="templateVersion" sort={sort} onToggle={toggleSort} align="center" /></th><th className="border border-black p-2"><SortHeader label="Status" sortKey="status" sort={sort} onToggle={toggleSort} align="center" /></th><th className="border border-black p-2"><SortHeader label="Updated By" sortKey="updatedBy" sort={sort} onToggle={toggleSort} align="center" /></th><th className="border border-black p-2">Actions</th></tr></thead>
        <tbody>
          {loading && <tr><td colSpan={10} className="p-6 text-center font-bold">Loading COAs...</td></tr>}
          {!loading && visibleRecords.length === 0 && <tr><td colSpan={10} className="h-16" aria-label="No records" /></tr>}
          {sortedRecords.map((record) => {
            const editable = record.status === "Draft" || canManage;
            return <tr key={record.id} className="align-middle">
              <td className="border border-black p-2 font-bold">{record.coaNo}</td>
              <td className="border border-black p-2">{record.companyName || "-"}</td>
              <td className="border border-black p-2">{record.jobNo || "-"}</td>
              <td className="border border-black p-2">{record.erpCode || "-"}</td>
              <td className="border border-black p-2">{record.itemName || "-"}</td>
              <td className="border border-black p-2">{displayDate(record.coaDate)}</td>
              <td className="border border-black p-2">v{record.templateVersion}</td>
              <td className="border border-black p-2"><span className={`rounded px-2 py-1 font-bold ${record.status === "Final" ? "bg-green-200 text-green-900" : "bg-amber-200 text-amber-900"}`}>{record.status}</span></td>
              <td className="border border-black p-2">{record.updatedBy || record.createdBy || "-"}</td>
              <td className="border border-black p-2"><div className="flex flex-wrap justify-center gap-2">
                <button type="button" title="Preview / print" onClick={() => printCoaRecord(record, issuer(record))} className="inline-flex items-center gap-1 rounded bg-slate-700 px-2 py-1 font-bold text-white"><Eye size={14} /> Print</button>
                {editable ? <button type="button" title="Edit COA" onClick={() => navigate(`/quality/coa/form/${record.id}`)} className="inline-flex items-center gap-1 rounded bg-indigo-700 px-2 py-1 font-bold text-white"><Pencil size={14} /> Edit</button> : <span className="inline-flex items-center gap-1 rounded bg-slate-200 px-2 py-1 font-bold text-slate-700"><LockKeyhole size={14} /> Read only</span>}
                {canManage && record.status === "Draft" && <button type="button" onClick={() => void changeStatus(record, "finalize")} className="inline-flex items-center gap-1 rounded bg-green-700 px-2 py-1 font-bold text-white"><CheckCircle2 size={14} /> Finalize</button>}
                {canManage && record.status === "Final" && <button type="button" onClick={() => void changeStatus(record, "reopen")} className="inline-flex items-center gap-1 rounded bg-orange-700 px-2 py-1 font-bold text-white"><RotateCcw size={14} /> Reopen</button>}
              </div></td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  </div>;
}
