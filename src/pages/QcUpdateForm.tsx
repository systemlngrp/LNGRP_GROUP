import { FormEvent, useMemo, useState } from "react";
import { CheckCircle2, RotateCcw, Save } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useData } from "../hooks/useData";
import { Select } from "../components/Select";
import { useNpdItems } from "../hooks/useNpdItems";
import { QcUpdateRecord } from "../types";

const today = () => new Date().toISOString().slice(0, 10);
const initialForm = { npdId: "", erpNo: "", itemName: "", fileNo: "", indexNo: "", zoneNo: "", sampleNo: "", remarks: "", updatedBy: "", updateDate: today() };
const inputClass = "w-full rounded border border-black bg-white p-2 text-sm";

export function QcUpdateForm() {
  const { user } = useAuth();
  const [, , , api] = useData<QcUpdateRecord>("qc_update_records", [], { firmScope: "all" });
  const items = useNpdItems();
  const displayName = useMemo(() => String(user?.name || user?.userId || user?.email || "").trim(), [user]);
  const [form, setForm] = useState(() => ({ ...initialForm, updatedBy: displayName }));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const setField = (key: keyof typeof initialForm, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const reset = () => { setForm({ ...initialForm, updatedBy: displayName }); setError(""); setMessage(""); };
  const save = async (event: FormEvent) => {
    event.preventDefault(); setMessage("");
    const required = ["npdId", "erpNo", "itemName", "fileNo", "indexNo", "zoneNo", "sampleNo", "updatedBy", "updateDate"] as const;
    if (required.some((key) => !form[key].trim())) { setError("Please fill all required fields."); return; }
    setSaving(true);
    try {
      await api.addItem({ ...form, id: crypto.randomUUID(), updateTimestamp: new Date().toISOString() });
      setForm({ ...initialForm, updatedBy: displayName }); setError(""); setMessage("QC update saved successfully.");
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Unable to save QC update."); }
    finally { setSaving(false); }
  };
  const npdOptions = useMemo(() => items.map((item: any) => ({ value: String(item.id || ""), label: `${item.erp || ""} - ${item.name || ""}`, searchText: `${item.erp || ""} ${item.name || ""} ${item.customer || ""}` })).filter((option) => option.value), [items]);
  const selectNpd = (npdId: string) => { const item = items.find((value: any) => String(value.id) === npdId) as any; setForm((current) => ({ ...current, npdId, erpNo: String(item?.erp || ""), itemName: String(item?.name || "") })); };
  const fields = [["File No.", "fileNo"], ["Index No.", "indexNo"], ["Zone No.", "zoneNo"], ["Sample No.", "sampleNo"]] as const;
  return <div className="mx-auto max-w-5xl space-y-5 text-black">
    <div className="border-b border-black pb-3"><h2 className="text-xl font-bold uppercase">QC Update Form</h2><p className="text-sm text-slate-600">Record QC details for each ERP and Item Name.</p></div>
    {message && <div className="flex items-center gap-2 rounded border border-emerald-700 bg-emerald-100 p-3 font-bold text-emerald-900"><CheckCircle2 size={18} />{message}</div>}
    {error && <div className="rounded border border-red-700 bg-red-100 p-3 font-bold text-red-900">{error}</div>}
    <form onSubmit={save} className="space-y-5">
      <section className="rounded border-2 border-black bg-white p-4"><h3 className="mb-4 bg-indigo-800 p-3 font-bold uppercase text-white">QC Information</h3><div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="space-y-1 md:col-span-2"><span className="font-bold">NPD ERP / Item <span className="text-red-700">*</span></span><Select value={form.npdId} onChange={selectNpd} options={npdOptions} placeholder="Search ERP or Item" /></label>
        <label className="space-y-1"><span className="font-bold">ERP No.</span><input className={`${inputClass} bg-slate-100`} readOnly value={form.erpNo} /></label><label className="space-y-1"><span className="font-bold">Item Name</span><input className={`${inputClass} bg-slate-100`} readOnly value={form.itemName} /></label>
        {fields.map(([label, key]) => <label key={key} className="space-y-1"><span className="font-bold">{label} <span className="text-red-700">*</span></span><input className={inputClass} value={form[key]} onChange={(e) => setField(key, e.target.value)} /></label>)}
        <label className="space-y-1 md:col-span-2"><span className="font-bold">Remarks</span><textarea className={`${inputClass} min-h-24`} value={form.remarks} onChange={(e) => setField("remarks", e.target.value)} /></label>
      </div></section>
      <section className="rounded border-2 border-black bg-white p-4"><h3 className="mb-4 bg-indigo-800 p-3 font-bold uppercase text-white">Update Details</h3><div className="grid grid-cols-1 gap-4 md:grid-cols-2"><label className="space-y-1"><span className="font-bold">Updated By *</span><input className={inputClass} value={form.updatedBy} onChange={(e) => setField("updatedBy", e.target.value)} /></label><label className="space-y-1"><span className="font-bold">Update Date *</span><input type="date" className={inputClass} value={form.updateDate} onChange={(e) => setField("updateDate", e.target.value)} /></label></div></section>
      <div className="flex flex-wrap gap-3"><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded bg-emerald-700 px-5 py-3 font-bold text-white disabled:opacity-60"><Save size={17} />{saving ? "Saving..." : "Save / Submit"}</button><button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded border-2 border-black bg-white px-5 py-3 font-bold"><RotateCcw size={17} />Clear / Reset</button></div>
    </form>
  </div>;
}
