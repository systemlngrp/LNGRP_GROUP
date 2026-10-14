import { useMemo, useRef, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useData } from "../hooks/useData";
import type { PrintingStereoRecord } from "../types";

import { useAuth } from "../auth/AuthContext";
import { canManageMasterRecords } from "../lib/masterPermissions";

const text = (value: unknown) => String(value ?? "").trim();
export function PrintingStereoMaster() {
  const { user, hasAccess } = useAuth();
  const canDelete = canManageMasterRecords(user?.role) && hasAccess("/quality/printing-stereo");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deletingRef = useRef(false);
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const location = useLocation(); const [records, , loading] = useData<PrintingStereoRecord>("printing_stereo_records", [], { firmScope: "all" }); const [search, setSearch] = useState("");
  const message = text((location.state as { message?: string } | null)?.message); const filtered = useMemo(() => { const query = search.toLowerCase().trim(); return records.filter(record => !query || `${record.erpCode} ${record.partyName} ${record.itemName} ${record.location} ${record.blockNo}`.toLowerCase().includes(query)).sort((a, b) => text(b.updateTimestamp).localeCompare(text(a.updateTimestamp))); }, [records, search]);
  const deleteRecord = async (record: PrintingStereoRecord) => {
    if (!canDelete || deletingRef.current) return;
    if (!window.confirm(`Delete Printing Stereo record for ERP ${record.erpCode}, location ${record.location}, block ${record.blockNo}? Its linked Block Record will also be permanently deleted.`)) return;
    deletingRef.current = true;
    setDeletingId(record.id);
    setFeedback(null);
    try {
      const token = window.localStorage.getItem("authToken") || "";
      const response = await fetch(`/api/printing-stereo-records/${encodeURIComponent(record.id)}`, { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Unable to delete Printing Stereo record.");
      window.dispatchEvent(new CustomEvent("sync-data-printing_stereo_records"));
      window.dispatchEvent(new CustomEvent("sync-data-qc_block_records"));
      setFeedback({ message: "Printing Stereo record and any linked Block Record deleted successfully.", error: false });
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : "Unable to delete Printing Stereo record.", error: true });
    } finally {
      deletingRef.current = false;
      setDeletingId(null);
    }
  };
  return <div className="space-y-5 pb-8"><div className="flex items-center justify-between border-b border-black pb-3"><h2 className="text-xl font-bold uppercase">Printing Stereo Records</h2></div>{(feedback || message) && <div role="status" className={`rounded border p-3 font-bold ${feedback?.error ? "border-red-700 bg-red-100" : "border-emerald-700 bg-emerald-100"}`}>{feedback?.message || message}</div>}<div className="rounded border-2 border-black bg-white p-3"><div className="relative max-w-xl"><Search className="absolute left-3 top-2.5 text-slate-500" size={18}/><input className="w-full rounded border-2 border-black py-2 pl-10 pr-3" placeholder="Search ERP, party, item, location, block..." value={search} onChange={event => setSearch(event.target.value)}/></div></div><div className="overflow-auto rounded border-2 border-black bg-white"><table className="min-w-[1000px] w-full border-collapse text-sm"><thead className="bg-cyan-800 text-white"><tr>{["Sl. No.","ERP Code","Party Name","Item Name","Location","Block No.","Updated By","Updated Timestamp", ...(canDelete ? ["Actions"] : [])].map(header => <th key={header} className="border border-black p-2 text-left">{header}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={canDelete ? 9 : 8} className="p-6 text-center">Loading...</td></tr> : filtered.length ? filtered.map((record, index) => <tr key={record.id}><td className="border border-black p-2">{index + 1}</td><td className="border border-black p-2 font-bold">{record.erpCode}</td><td className="border border-black p-2">{record.partyName}</td><td className="border border-black p-2">{record.itemName}</td><td className="border border-black p-2">{record.location}</td><td className="border border-black p-2">{record.blockNo}</td><td className="border border-black p-2">{record.updatedBy}</td><td className="border border-black p-2">{record.updateTimestamp || "-"}</td>{canDelete && <td className="border border-black p-2"><button type="button" disabled={deletingId !== null} onClick={() => void deleteRecord(record)} className="inline-flex items-center gap-1 rounded bg-red-700 px-2 py-1 font-bold text-white disabled:opacity-50"><Trash2 size={14}/>{deletingId === record.id ? "Deleting..." : "Delete"}</button></td>}</tr>) : <tr><td colSpan={canDelete ? 9 : 8} className="p-6 text-center">No Printing Stereo records found.</td></tr>}</tbody></table></div></div>;
}


