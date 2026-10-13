import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useData } from "../hooks/useData";
import type { QcFileNoMaster } from "../types";

const text = (value: unknown) => String(value ?? "").trim();

export function QcFileNoMaster() {
  const { user } = useAuth();
  const [rows, , loading, api] = useData<QcFileNoMaster>("qc_file_no_masters", [], { firmScope: "all" });
  const [fileNo, setFileNo] = useState("");
  const [editing, setEditing] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const displayName = text(user?.name || user?.userId || user?.email || "System User");

  const filtered = useMemo(() => rows.filter(row => {
    const active = text(row.active).toLowerCase() === "yes";
    return text(row.fileNo).toLowerCase().includes(search.trim().toLowerCase()) &&
      (status === "all" || (status === "active" ? active : !active));
  }).sort((a, b) => text(a.fileNo).localeCompare(text(b.fileNo), undefined, { numeric: true, sensitivity: "base" })), [rows, search, status]);

  const save = async () => {
    const value = fileNo.trim();
    if (!value) { setMessage("File No. is required."); return; }
    const duplicate = rows.find(row => row.id !== editing && text(row.fileNo).toLowerCase() === value.toLowerCase());
    if (duplicate) { setMessage("This File No. already exists."); return; }
    const old = rows.find(row => row.id === editing);
    const item: QcFileNoMaster = {
      id: old?.id || `QCFILE-${crypto.randomUUID()}`,
      fileNo: value,
      active: old?.active || "Yes",
      updatedBy: displayName,
      updateTimestamp: new Date().toISOString(),
    };
    setBusyId(item.id);
    setMessage("");
    try {
      if (old) await api.saveItem(item); else await api.addItem(item);
      setFileNo("");
      setEditing("");
      setMessage("File No. saved successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save File No.");
    } finally {
      setBusyId("");
    }
  };

  const toggle = async (row: QcFileNoMaster) => {
    setBusyId(row.id);
    setMessage("");
    try {
      await api.saveItem({
        ...row,
        active: text(row.active).toLowerCase() === "yes" ? "No" : "Yes",
        updatedBy: displayName,
        updateTimestamp: new Date().toISOString(),
      });
      setMessage("File No. status updated successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update File No. status.");
    } finally {
      setBusyId("");
    }
  };

  return <div className="space-y-4 pb-8">
    <h2 className="border-b border-black pb-3 text-xl font-bold uppercase">File No. Master</h2>
    {message && <div className="rounded border border-black bg-amber-100 p-3 font-bold">{message}</div>}
    <div className="flex flex-wrap gap-2 rounded border-2 border-black bg-white p-3">
      <input className="min-w-64 flex-1 rounded border-2 border-black px-3 py-2" value={fileNo} onChange={event => setFileNo(event.target.value)} placeholder="File No." disabled={Boolean(busyId)} />
      <button type="button" disabled={Boolean(busyId)} onClick={() => void save()} className="rounded bg-cyan-700 px-4 py-2 font-bold text-white disabled:opacity-50">{editing ? "Update" : "Add"}</button>
      {editing && <button type="button" disabled={Boolean(busyId)} onClick={() => { setEditing(""); setFileNo(""); setMessage(""); }} className="rounded border-2 border-black px-4 py-2 font-bold disabled:opacity-50">Cancel</button>}
    </div>
    <div className="flex flex-wrap gap-2 rounded border-2 border-black bg-white p-3">
      <input className="min-w-64 flex-1 rounded border border-black px-3 py-2" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search File Nos." aria-label="Search File Nos." />
      <select className="rounded border border-black px-3 py-2" value={status} onChange={event => setStatus(event.target.value)} aria-label="Filter by status">
        <option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
      </select>
      <button type="button" onClick={() => { setSearch(""); setStatus("all"); }} className="rounded border-2 border-black px-3 py-2 font-bold">Clear Filters</button>
    </div>
    <div className="overflow-auto rounded border-2 border-black bg-white">
      <table className="min-w-[650px] w-full text-sm">
        <thead className="bg-cyan-800 text-white"><tr><th className="p-2 text-left">File No.</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Updated By</th><th className="p-2 text-left">Actions</th></tr></thead>
        <tbody>{loading ? <tr><td colSpan={4} className="p-5 text-center">Loading...</td></tr> : filtered.length ? filtered.map(row => {
          const active = text(row.active).toLowerCase() === "yes";
          return <tr key={row.id} className="border-t border-black">
            <td className="p-2 font-bold">{row.fileNo}</td><td className="p-2">{active ? "Active" : "Inactive"}</td><td className="p-2">{row.updatedBy || "-"}</td>
            <td className="flex flex-wrap gap-3 p-2"><button type="button" disabled={Boolean(busyId)} onClick={() => { setEditing(row.id); setFileNo(row.fileNo); setMessage(""); }} className="font-bold underline disabled:opacity-50">Edit</button><button type="button" disabled={Boolean(busyId)} onClick={() => void toggle(row)} className="font-bold underline disabled:opacity-50">{active ? "Deactivate" : "Activate"}</button></td>
          </tr>;
        }) : <tr><td colSpan={4} className="p-5 text-center">No File Nos. found.</td></tr>}</tbody>
      </table>
    </div>
  </div>;
}
