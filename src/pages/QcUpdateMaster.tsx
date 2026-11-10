import { useMemo, useState } from "react";
import { Edit, History, Link2, Plus, Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useData } from "../hooks/useData";
import { useAuth } from "../auth/AuthContext";
import { canManageMasterRecords } from "../lib/masterPermissions";
import { Select } from "../components/Select";
import type { ControlRecord, QcFileNoMaster, QcUpdateAuditLog, QcUpdateRecord } from "../types";
import { fileNoOptions } from "../lib/qcFileNo";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";
import { dateKey } from "../lib/jobCellColors";

const input = "w-full rounded border-2 border-black bg-white px-3 py-2";
const text = (value: unknown) => String(value ?? "").trim();
const LABEL = "mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600";
const DATE_INPUT = "h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold";
const optionList = (values: unknown[]) => [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })).map(value => ({ value, label: value }));
const dayKey = (value: unknown) => { const raw = text(value); if (raw.includes("T")) { const date = new Date(raw); if (!Number.isNaN(date.getTime())) return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; } return dateKey(raw); };
const emptyFilters = { erpNo: "", itemName: "", fileNo: "", zoneNo: "", updatedBy: "", fromDate: "", toDate: "" };
const emptyForm = { fileNo: "", indexNo: "", zoneNo: "", location: "", sampleNo: "", remarks: "" };

export function QcUpdateMaster() {
  const { user } = useAuth();
  const canManage = canManageMasterRecords(user?.role);
  const navigate = useNavigate();
  const [records] = useData<QcUpdateRecord>("qc_update_records", [], { firmScope: "all" });
  const [controls] = useData<ControlRecord>("control_records", [], { firmScope: "all" });
  const [fileNos] = useData<QcFileNoMaster>("qc_file_no_masters", [], { firmScope: "all" });
  const [logs] = useData<QcUpdateAuditLog>("qc_update_audit_logs", [], { firmScope: "all" });
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(emptyFilters);
  const setFilter = (key: keyof typeof emptyFilters, value: string) => setFilters(current => ({ ...current, [key]: value }));
  const hasFilters = Boolean(search.trim()) || Object.values(filters).some(Boolean);
  const [editing, setEditing] = useState<QcUpdateRecord | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [historyRecord, setHistoryRecord] = useState<QcUpdateRecord | null>(null);
  const [linking, setLinking] = useState<QcUpdateRecord | null>(null);
  const [controlRecordId, setControlRecordId] = useState("");
  const [message, setMessage] = useState("");
  const controlById = useMemo(() => new Map(controls.map(control => [control.id, control])), [controls]);
  const filtered = useMemo(() => {
    const words = searchWords(search);
    return records.filter(record => {
      if (filters.erpNo && text(record.erpNo) !== filters.erpNo) return false;
      if (filters.itemName && text(record.itemName) !== filters.itemName) return false;
      if (filters.fileNo && text(record.fileNo) !== filters.fileNo) return false;
      if (filters.zoneNo && text(record.zoneNo) !== filters.zoneNo) return false;
      if (filters.updatedBy && text(record.updatedBy) !== filters.updatedBy) return false;
      if (filters.fromDate || filters.toDate) { const day = dayKey(record.updateTimestamp || record.updateDate); if (!day || (filters.fromDate && day < filters.fromDate) || (filters.toDate && day > filters.toDate)) return false; }
      if (!words.length) return true;
      const control = record.controlRecordId ? controlById.get(record.controlRecordId) : undefined;
      const controlLabel = control ? [control.location, control.sampleNo].map(text).filter(Boolean).join(" - ") : "";
      return matchesTableSearch([record.erpNo, record.itemName, record.fileNo, record.indexNo, record.zoneNo, record.location, record.sampleNo, controlLabel, record.remarks, record.updatedBy, record.updateTimestamp], words);
    }).sort((a, b) => text(b.updateTimestamp).localeCompare(text(a.updateTimestamp)));
  }, [controlById, filters, records, search]);
  const { sorted: sortedRecords, sort, toggle: toggleSort } = useTableSort(filtered, (record, key) => {
    if (key === "control") { const control = record.controlRecordId ? controlById.get(record.controlRecordId) : undefined; return control ? [control.location, control.sampleNo].map(text).filter(Boolean).join(" - ") : ""; }
    return (record as any)[key];
  }, [controlById]);

  const notifySync = () => {
    window.dispatchEvent(new CustomEvent("sync-data-qc_update_records"));
    window.dispatchEvent(new CustomEvent("sync-data-qc_update_audit_logs"));
  };
  const openEdit = (record: QcUpdateRecord) => {
    setEditing(record);
    setEditForm({ fileNo: text(record.fileNo), indexNo: text(record.indexNo), zoneNo: text(record.zoneNo), location: text(record.location), sampleNo: text(record.sampleNo), remarks: text(record.remarks) });
    setMessage("");
  };
  const saveEdit = async () => {
    if (!editing) return;
    setMessage("");
    try {
      const response = await fetch("/api/qc-update-records/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...editing, ...editForm }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Unable to save QC Update.");
      setEditing(null);
      notifySync();
      setMessage("QC Update saved successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save QC Update.");
    }
  };
  const linkControl = async () => {
    if (!linking || !controlRecordId) return setMessage("Select a Control Sample record.");
    setMessage("");
    try {
      const response = await fetch("/api/qc-update-records/link-control-sample", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ qcUpdateId: linking.id, controlRecordId }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Unable to link Control Sample.");
      setLinking(null);
      setControlRecordId("");
      notifySync();
      setMessage("Control Sample linked successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to link Control Sample.");
    }
  };
  const filterOptions = useMemo(() => ({ erps: optionList(records.map(record => record.erpNo)), items: optionList(records.map(record => record.itemName)), fileNos: optionList(records.map(record => record.fileNo)), zones: optionList(records.map(record => record.zoneNo)), users: optionList(records.map(record => record.updatedBy)) }), [records]);
  const controlOptions = controls.map(control => ({ value: control.id, label: [control.erpCode, control.location, control.sampleNo].map(text).filter(Boolean).join(" - ") })).filter(option => option.value);
  const editFileNoOptions = fileNoOptions(fileNos, editing ? text(editing.fileNo) : "");

  return <div className="space-y-4 pb-8 text-black">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black pb-3"><h2 className="text-xl font-bold uppercase tracking-tight text-black">QC Update Master</h2><button type="button" onClick={() => navigate("/quality/qc-update/form")} className="inline-flex items-center gap-2 rounded bg-cyan-700 px-4 py-2 font-bold text-white"><Plus size={17} />New QC Update</button></div>
    {message && <div className="rounded border-2 border-black bg-amber-100 p-3 font-bold">{message}</div>}
    <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
      <div className="relative w-full"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" placeholder="Search" value={search} onChange={event => setSearch(event.target.value)} className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600" /></div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
        <div className="min-w-0"><span className={LABEL}>ERP</span><Select compact value={filters.erpNo} onChange={value => setFilter("erpNo", value)} options={filterOptions.erps} placeholder="All" /></div>
        <div className="min-w-0"><span className={LABEL}>Item</span><Select compact value={filters.itemName} onChange={value => setFilter("itemName", value)} options={filterOptions.items} placeholder="All" /></div>
        <div className="min-w-0"><span className={LABEL}>File No.</span><Select compact value={filters.fileNo} onChange={value => setFilter("fileNo", value)} options={filterOptions.fileNos} placeholder="All" /></div>
        <div className="min-w-0"><span className={LABEL}>Zone No.</span><Select compact value={filters.zoneNo} onChange={value => setFilter("zoneNo", value)} options={filterOptions.zones} placeholder="All" /></div>
        <div className="min-w-0"><span className={LABEL}>Updated By</span><Select compact value={filters.updatedBy} onChange={value => setFilter("updatedBy", value)} options={filterOptions.users} placeholder="All" /></div>
        <div data-date-pair="true" className="col-span-2 grid min-w-0 grid-cols-2 gap-2">
          <label className="min-w-0"><span className={LABEL}>Update From Date</span><input type="date" value={filters.fromDate} max={filters.toDate || undefined} onChange={event => setFilter("fromDate", event.target.value)} className={DATE_INPUT} /></label>
          <label className="min-w-0"><span className={LABEL}>Update To Date</span><input type="date" value={filters.toDate} min={filters.fromDate || undefined} onChange={event => setFilter("toDate", event.target.value)} className={DATE_INPUT} /></label>
        </div>
      </div>
      <div data-mf-actions="true" className="flex justify-end gap-2">
        {hasFilters ? <button type="button" onClick={() => { setSearch(""); setFilters(emptyFilters); }} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button> : null}
        <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
      </div>
    </div>
    <div className="overflow-x-auto rounded border border-black bg-white"><table className="min-w-[1500px] w-full border-collapse text-xs"><thead className="bg-cyan-800 text-white"><tr>{([["ERP", "erpNo"], ["Item", "itemName"], ["File No.", "fileNo"], ["Index No.", "indexNo"], ["Zone No.", "zoneNo"], ["Sample Location", "location"], ["Sample No.", "sampleNo"], ["Control Sample", "control"], ["Remarks", "remarks"], ["Updated By", "updatedBy"], ["Timestamp", "updateTimestamp"], ["Actions", ""]] as const).map(([header, key]) => <th key={header} className="border border-black p-2 text-left">{key ? <SortHeader label={header} sortKey={key} sort={sort} onToggle={toggleSort} /> : header}</th>)}</tr></thead><tbody>{sortedRecords.length ? sortedRecords.map(record => { const control = record.controlRecordId ? controlById.get(record.controlRecordId) : undefined; return <tr key={record.id}><td className="border border-black p-2 font-bold">{record.erpNo || "-"}</td><td className="border border-black p-2">{record.itemName || "-"}</td><td className="border border-black p-2">{record.fileNo || "-"}</td><td className="border border-black p-2">{record.indexNo || "-"}</td><td className="border border-black p-2">{record.zoneNo || "-"}</td><td className="border border-black p-2">{record.location || "-"}</td><td className="border border-black p-2">{record.sampleNo || "-"}</td><td className="border border-black p-2">{control ? [control.location, control.sampleNo].map(text).filter(Boolean).join(" - ") : "-"}</td><td className="border border-black p-2">{record.remarks || "-"}</td><td className="border border-black p-2">{record.updatedBy || "-"}</td><td className="border border-black p-2 whitespace-nowrap">{record.updateTimestamp || "-"}</td><td className="border border-black p-2"><div className="flex gap-1">{canManage ? <button type="button" title="Edit" onClick={() => openEdit(record)} className="rounded border border-black bg-white p-1"><Edit size={14} /></button> : null}{canManage ? <button type="button" title="Link Control Sample" onClick={() => { setLinking(record); setControlRecordId(text(record.controlRecordId)); setMessage(""); }} className="rounded border border-black bg-white p-1"><Link2 size={14} /></button> : null}<button type="button" title="History" onClick={() => setHistoryRecord(record)} className="rounded border border-black bg-white p-1"><History size={14} /></button></div></td></tr>; }) : <tr><td colSpan={12} className="h-16" aria-label="No records" /></tr>}</tbody></table></div>
    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-2xl rounded border-2 border-black bg-white p-5"><div className="mb-4 flex items-center justify-between border-b-2 border-black pb-3"><h3 className="text-lg font-bold uppercase">Edit QC Update</h3><button type="button" onClick={() => setEditing(null)} className="rounded border-2 border-black p-2"><X size={16} /></button></div><div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2"><label><b>NPD ERP / Item</b><input className={input + " bg-gray-300"} readOnly value={text(editing.erpNo) + " - " + text(editing.itemName)} /></label><label><b>File No.</b><Select value={editForm.fileNo} onChange={value => setEditForm({ ...editForm, fileNo: value })} options={editFileNoOptions} placeholder="Search File No." noOptionsMessage="No active File Nos." /></label>{[["Index No.", "indexNo"], ["Zone No.", "zoneNo"], ["Sample Location", "location"], ["Sample No.", "sampleNo"]].map(([label, key]) => <label key={key}><b>{label}</b><input className={input} value={editForm[key as keyof typeof editForm]} onChange={event => setEditForm({ ...editForm, [key]: event.target.value })} /></label>)}<label className="md:col-span-2"><b>Remarks</b><textarea className={input + " min-h-24"} value={editForm.remarks} onChange={event => setEditForm({ ...editForm, remarks: event.target.value })} /></label></div><div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="rounded border-2 border-black px-4 py-2 font-bold">Cancel</button><button type="button" onClick={() => void saveEdit()} className="rounded bg-cyan-700 px-4 py-2 font-bold text-white">Save</button></div></div></div>}
    {linking && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-xl rounded border-2 border-black bg-white p-5"><div className="mb-4 flex items-center justify-between border-b-2 border-black pb-3"><h3 className="text-lg font-bold uppercase">Link Control Sample</h3><button type="button" onClick={() => setLinking(null)} className="rounded border-2 border-black p-2"><X size={16} /></button></div><p className="mb-3 text-sm">This links the existing Control Sample record; it does not move or delete it.</p><Select value={controlRecordId} onChange={setControlRecordId} options={controlOptions} placeholder="Select Control Sample" /><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setLinking(null)} className="rounded border-2 border-black px-4 py-2 font-bold">Cancel</button><button type="button" onClick={() => void linkControl()} className="rounded bg-cyan-700 px-4 py-2 font-bold text-white">Link</button></div></div></div>}
    {historyRecord && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="max-h-[85vh] w-full max-w-4xl overflow-y-auto rounded border-2 border-black bg-white p-5"><div className="mb-4 flex items-center justify-between border-b-2 border-black pb-3"><h3 className="text-lg font-bold uppercase">Update History - {historyRecord.erpNo}</h3><button type="button" onClick={() => setHistoryRecord(null)} className="rounded border-2 border-black p-2"><X size={16} /></button></div>{logs.filter(log => log.qcUpdateId === historyRecord.id).sort((a, b) => text(b.updateTimestamp).localeCompare(text(a.updateTimestamp))).map(log => <div key={log.id} className="mb-3 rounded border border-black p-3"><div className="mb-2 flex flex-wrap justify-between gap-2 font-bold"><span>{log.action}</span><span>{log.updatedBy} · {log.updateTimestamp}</span></div><div className="grid gap-2 md:grid-cols-2"><pre className="overflow-auto rounded bg-red-50 p-2 text-xs">{log.beforeJson || "—"}</pre><pre className="overflow-auto rounded bg-green-50 p-2 text-xs">{log.afterJson || "—"}</pre></div></div>)}{!logs.some(log => log.qcUpdateId === historyRecord.id) && <p>No history found.</p>}</div></div>}
  </div>;
}

