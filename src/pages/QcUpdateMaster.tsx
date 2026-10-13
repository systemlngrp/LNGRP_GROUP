import { useMemo, useState } from "react";
import { Edit, History, Link2, Plus, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useData } from "../hooks/useData";
import { Select } from "../components/Select";
import type { ControlRecord, QcFileNoMaster, QcUpdateAuditLog, QcUpdateRecord } from "../types";
import { fileNoOptions } from "../lib/qcFileNo";

const input = "w-full rounded border-2 border-black bg-white px-3 py-2";
const text = (value: unknown) => String(value ?? "").trim();
const emptyForm = { fileNo: "", indexNo: "", zoneNo: "", location: "", sampleNo: "", remarks: "" };

export function QcUpdateMaster() {
  const navigate = useNavigate();
  const [records] = useData<QcUpdateRecord>("qc_update_records", [], { firmScope: "all" });
  const [controls] = useData<ControlRecord>("control_records", [], { firmScope: "all" });
  const [fileNos] = useData<QcFileNoMaster>("qc_file_no_masters", [], { firmScope: "all" });
  const [logs] = useData<QcUpdateAuditLog>("qc_update_audit_logs", [], { firmScope: "all" });
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<QcUpdateRecord | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [historyRecord, setHistoryRecord] = useState<QcUpdateRecord | null>(null);
  const [linking, setLinking] = useState<QcUpdateRecord | null>(null);
  const [controlRecordId, setControlRecordId] = useState("");
  const [message, setMessage] = useState("");
  const controlById = useMemo(() => new Map(controls.map(control => [control.id, control])), [controls]);
  const filtered = useMemo(() => {
    const needle = search.toLowerCase().trim();
    return records.filter(record => {
      const haystack = [record.erpNo, record.itemName, record.fileNo, record.indexNo, record.zoneNo, record.sampleNo, record.remarks].map(text).join(" ").toLowerCase();
      return !needle || haystack.includes(needle);
    }).sort((a, b) => text(b.updateTimestamp).localeCompare(text(a.updateTimestamp)));
  }, [records, search]);

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
  const controlOptions = controls.map(control => ({ value: control.id, label: [control.erpCode, control.location, control.sampleNo].map(text).filter(Boolean).join(" - ") })).filter(option => option.value);
  const editFileNoOptions = fileNoOptions(fileNos, editing ? text(editing.fileNo) : "");

  return <div className="space-y-4 pb-8 text-black">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black pb-3"><h2 className="text-xl font-bold uppercase">QC Update Master</h2><button type="button" onClick={() => navigate("/quality/qc-update/form")} className="inline-flex items-center gap-2 rounded bg-cyan-700 px-4 py-2 font-bold text-white"><Plus size={17} />New QC Update</button></div>
    {message && <div className="rounded border-2 border-black bg-amber-100 p-3 font-bold">{message}</div>}
    <div className="grid grid-cols-1 gap-2 rounded border-2 border-black bg-white p-3 md:grid-cols-2"><input className={input} placeholder="Search ERP, item, file, sample..." value={search} onChange={event => setSearch(event.target.value)} /><button type="button" onClick={() => setSearch("")} className="rounded border-2 border-black px-3 py-2 font-bold">Clear Filters</button></div>
    <div className="overflow-auto rounded border-2 border-black bg-white"><table className="min-w-[1500px] w-full border-collapse text-xs"><thead className="bg-cyan-800 text-white"><tr>{["ERP", "Item", "File No.", "Index No.", "Zone No.", "Sample Location", "Sample No.", "Control Sample", "Remarks", "Updated By", "Timestamp", "Actions"].map(header => <th key={header} className="border border-black p-2 text-left">{header}</th>)}</tr></thead><tbody>{filtered.length ? filtered.map(record => { const control = record.controlRecordId ? controlById.get(record.controlRecordId) : undefined; return <tr key={record.id}><td className="border border-black p-2 font-bold">{record.erpNo || "-"}</td><td className="border border-black p-2">{record.itemName || "-"}</td><td className="border border-black p-2">{record.fileNo || "-"}</td><td className="border border-black p-2">{record.indexNo || "-"}</td><td className="border border-black p-2">{record.zoneNo || "-"}</td><td className="border border-black p-2">{record.location || "-"}</td><td className="border border-black p-2">{record.sampleNo || "-"}</td><td className="border border-black p-2">{control ? [control.location, control.sampleNo].map(text).filter(Boolean).join(" - ") : "-"}</td><td className="border border-black p-2">{record.remarks || "-"}</td><td className="border border-black p-2">{record.updatedBy || "-"}</td><td className="border border-black p-2 whitespace-nowrap">{record.updateTimestamp || "-"}</td><td className="border border-black p-2"><div className="flex gap-1"><button type="button" title="Edit" onClick={() => openEdit(record)} className="rounded border border-black bg-white p-1"><Edit size={14} /></button><button type="button" title="Link Control Sample" onClick={() => { setLinking(record); setControlRecordId(text(record.controlRecordId)); setMessage(""); }} className="rounded border border-black bg-white p-1"><Link2 size={14} /></button><button type="button" title="History" onClick={() => setHistoryRecord(record)} className="rounded border border-black bg-white p-1"><History size={14} /></button></div></td></tr>; }) : <tr><td colSpan={12} className="p-8 text-center">No QC Update records found.</td></tr>}</tbody></table></div>
    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-2xl rounded border-2 border-black bg-white p-5"><div className="mb-4 flex items-center justify-between border-b-2 border-black pb-3"><h3 className="text-lg font-bold uppercase">Edit QC Update</h3><button type="button" onClick={() => setEditing(null)} className="rounded border-2 border-black p-2"><X size={16} /></button></div><div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2"><label><b>NPD ERP / Item</b><input className={input + " bg-gray-300"} readOnly value={text(editing.erpNo) + " - " + text(editing.itemName)} /></label><label><b>File No.</b><Select value={editForm.fileNo} onChange={value => setEditForm({ ...editForm, fileNo: value })} options={editFileNoOptions} placeholder="Search File No." noOptionsMessage="No active File Nos." /></label>{[["Index No.", "indexNo"], ["Zone No.", "zoneNo"], ["Sample Location", "location"], ["Sample No.", "sampleNo"]].map(([label, key]) => <label key={key}><b>{label}</b><input className={input} value={editForm[key as keyof typeof editForm]} onChange={event => setEditForm({ ...editForm, [key]: event.target.value })} /></label>)}<label className="md:col-span-2"><b>Remarks</b><textarea className={input + " min-h-24"} value={editForm.remarks} onChange={event => setEditForm({ ...editForm, remarks: event.target.value })} /></label></div><div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="rounded border-2 border-black px-4 py-2 font-bold">Cancel</button><button type="button" onClick={() => void saveEdit()} className="rounded bg-cyan-700 px-4 py-2 font-bold text-white">Save</button></div></div></div>}
    {linking && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-xl rounded border-2 border-black bg-white p-5"><div className="mb-4 flex items-center justify-between border-b-2 border-black pb-3"><h3 className="text-lg font-bold uppercase">Link Control Sample</h3><button type="button" onClick={() => setLinking(null)} className="rounded border-2 border-black p-2"><X size={16} /></button></div><p className="mb-3 text-sm">This links the existing Control Sample record; it does not move or delete it.</p><Select value={controlRecordId} onChange={setControlRecordId} options={controlOptions} placeholder="Select Control Sample" /><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setLinking(null)} className="rounded border-2 border-black px-4 py-2 font-bold">Cancel</button><button type="button" onClick={() => void linkControl()} className="rounded bg-cyan-700 px-4 py-2 font-bold text-white">Link</button></div></div></div>}
    {historyRecord && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="max-h-[85vh] w-full max-w-4xl overflow-y-auto rounded border-2 border-black bg-white p-5"><div className="mb-4 flex items-center justify-between border-b-2 border-black pb-3"><h3 className="text-lg font-bold uppercase">Update History - {historyRecord.erpNo}</h3><button type="button" onClick={() => setHistoryRecord(null)} className="rounded border-2 border-black p-2"><X size={16} /></button></div>{logs.filter(log => log.qcUpdateId === historyRecord.id).sort((a, b) => text(b.updateTimestamp).localeCompare(text(a.updateTimestamp))).map(log => <div key={log.id} className="mb-3 rounded border border-black p-3"><div className="mb-2 flex flex-wrap justify-between gap-2 font-bold"><span>{log.action}</span><span>{log.updatedBy} · {log.updateTimestamp}</span></div><div className="grid gap-2 md:grid-cols-2"><pre className="overflow-auto rounded bg-red-50 p-2 text-xs">{log.beforeJson || "—"}</pre><pre className="overflow-auto rounded bg-green-50 p-2 text-xs">{log.afterJson || "—"}</pre></div></div>)}{!logs.some(log => log.qcUpdateId === historyRecord.id) && <p>No history found.</p>}</div></div>}
  </div>;
}

