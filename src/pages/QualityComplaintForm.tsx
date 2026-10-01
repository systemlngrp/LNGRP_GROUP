import { FormEvent, useMemo, useState } from "react";
import { useData } from "../hooks/useData";
import { useNpdItems } from "../hooks/useNpdItems";
import type { Company, Firm, QualityComplaint } from "../types";

const blank = { firmId: "", partyName: "", itemName: "", erpCode: "", dateOfComplaint: new Date().toISOString().slice(0, 10), natureOfComplaint: "Complaint", lotNo: "", issueDetails: "", photo1: "", photo2: "", areaOfIssue: "", concernedPersonName: "", quantity: "" };
const field = "w-full rounded border border-black bg-white px-3 py-2";
const erpKey = (value: unknown) => String(value ?? "").trim().toLowerCase();

export function QualityComplaintForm() {
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const [companies] = useData<Company>("companies", [], { firmScope: "all" });
  const items = useNpdItems();
  const [, , , api] = useData<QualityComplaint>("quality_complaints", [], { firmScope: "all" });
  const [form, setForm] = useState(blank);
  const [message, setMessage] = useState("");
  const [erpHint, setErpHint] = useState("");
  const selectedFirm = firms.find((f) => f.id === form.firmId);
  const itemOptions = useMemo(() => items.map((i: any) => ({ name: String(i.name || ""), erp: String(i.erp || "") })).filter((i) => i.name).sort((a, b) => a.name.localeCompare(b.name)), [items]);

  const updateErp = (value: string) => {
    const normalized = erpKey(value);
    setForm((current) => ({ ...current, erpCode: value }));
    if (!normalized) { setErpHint(""); return; }
    const match = items.find((item: any) => erpKey(item.erp) === normalized);
    if (match) {
      setForm((current) => ({ ...current, erpCode: value, itemName: String((match as any).name || current.itemName) }));
      setErpHint(`Item found: ${String((match as any).name || "")}`);
    } else if (items.length > 0) {
      setErpHint("ERP item not found. You can enter the Item Name manually.");
    } else {
      setErpHint("Item master is still loading. Item Name can be entered manually.");
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setMessage("");
    const required = [form.firmId, form.dateOfComplaint, form.partyName, form.itemName, form.erpCode, form.natureOfComplaint, form.issueDetails, form.lotNo, form.quantity];
    if (required.some((v) => !String(v).trim())) { setMessage("Please complete all required fields."); return; }
    const now = new Date().toISOString();
    const item: QualityComplaint = { id: `QC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, timestamp: now, dateOfComplaint: form.dateOfComplaint, firmId: form.firmId, firmName: selectedFirm?.firmName || "", partyName: form.partyName.trim(), itemName: form.itemName.trim(), erpCode: form.erpCode.trim(), natureOfComplaint: form.natureOfComplaint, lotNo: form.lotNo.trim(), issueDetails: form.issueDetails.trim(), photo1: form.photo1.trim(), photo2: form.photo2.trim(), areaOfIssue: form.areaOfIssue, concernedPersonName: form.concernedPersonName.trim(), quantity: Number(form.quantity), updatedBy: "System User", updateTimestamp: now };
    try { await api.addItem(item); setForm({ ...blank, dateOfComplaint: new Date().toISOString().slice(0, 10) }); setErpHint(""); setMessage("QC complaint saved successfully."); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save complaint."); }
  };

  return <div className="mx-auto max-w-4xl space-y-5"><h2 className="border-b border-black pb-3 text-xl font-bold uppercase">QC Complaint Form</h2>{firms.length === 0 && <div className="rounded border border-red-700 bg-red-50 p-3 font-bold">No firms found. Please create a Firm in Firm Master before entering a complaint.</div>}{message && <div className="rounded border border-black bg-amber-100 p-3 font-bold">{message}</div>}<form onSubmit={submit} className="grid grid-cols-1 gap-4 rounded border-2 border-black bg-white p-5 md:grid-cols-2"><label className="space-y-1"><span className="font-bold">Firm *</span><select className={field} value={form.firmId} onChange={(e) => setForm({ ...form, firmId: e.target.value })}><option value="">Select Firm</option>{firms.map((f) => <option key={f.id} value={f.id}>{f.firmName}</option>)}</select></label><label className="space-y-1"><span className="font-bold">Date of Complaint *</span><input type="date" className={field} value={form.dateOfComplaint} onChange={(e) => setForm({ ...form, dateOfComplaint: e.target.value })} /></label><label className="space-y-1"><span className="font-bold">Party Name *</span><input list="complaint-parties" className={field} value={form.partyName} onChange={(e) => setForm({ ...form, partyName: e.target.value })} /><datalist id="complaint-parties">{companies.map((c) => <option key={c.id} value={c.name} />)}</datalist></label><label className="space-y-1"><span className="font-bold">Item Name *</span><input list="complaint-items" className={field} value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} /><datalist id="complaint-items">{itemOptions.map((i) => <option key={`${i.name}-${i.erp}`} value={i.name} />)}</datalist></label><label className="space-y-1"><span className="font-bold">ERP Code *</span><input className={field} value={form.erpCode} onChange={(e) => updateErp(e.target.value)} />{erpHint && <span className={`block text-xs font-bold ${erpHint.startsWith("Item found") ? "text-emerald-700" : "text-amber-700"}`}>{erpHint}</span>}</label><label className="space-y-1"><span className="font-bold">Nature of Complaint *</span><select className={field} value={form.natureOfComplaint} onChange={(e) => setForm({ ...form, natureOfComplaint: e.target.value })}><option>Complaint</option><option>Rejection</option></select></label><label className="space-y-1"><span className="font-bold">Job No. *</span><input className={field} value={form.lotNo} onChange={(e) => setForm({ ...form, lotNo: e.target.value })} /></label><label className="space-y-1"><span className="font-bold">Quantity *</span><input type="number" min="0" className={field} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label><label className="space-y-1"><span className="font-bold">Area of Issue</span><select className={field} value={form.areaOfIssue} onChange={(e) => setForm({ ...form, areaOfIssue: e.target.value })}><option value="">Select Area</option><option>Boardline</option><option>Printing</option><option>Dispatch</option></select></label><label className="space-y-1"><span className="font-bold">Concerned Person Name</span><input className={field} value={form.concernedPersonName} onChange={(e) => setForm({ ...form, concernedPersonName: e.target.value })} /></label><label className="space-y-1 md:col-span-2"><span className="font-bold">Issue Details *</span><textarea className={`${field} min-h-28`} value={form.issueDetails} onChange={(e) => setForm({ ...form, issueDetails: e.target.value })} /></label><label className="space-y-1"><span className="font-bold">Photo 1 URL / Upload Reference</span><input className={field} value={form.photo1} onChange={(e) => setForm({ ...form, photo1: e.target.value })} /></label><label className="space-y-1"><span className="font-bold">Photo 2 URL / Upload Reference</span><input className={field} value={form.photo2} onChange={(e) => setForm({ ...form, photo2: e.target.value })} /></label><div className="md:col-span-2"><button className="rounded bg-cyan-700 px-5 py-2 font-bold text-white" type="submit">Save QC Complaint</button></div></form></div>;
}
