import { useMemo, useState } from "react";
import { useData } from "../hooks/useData";
import { useNpdItems } from "../hooks/useNpdItems";
import type { Production, QcPersonMaster, QcSpecCardMovement } from "../types";

const inputClass = "w-full rounded border border-black bg-white px-3 py-2";
const text = (value: unknown) => String(value ?? "").trim();
const number = (value: unknown) => Number(value) || 0;
const emptyDraft = { productionId: "", jobNo: "", erpCode: "", date: "", partyName: "", itemName: "", planQuantity: 0, artwork: "", spec: "", issue: false, issuedTo: "", returned: false, returnedBy: "", qcPerson: "" };
type Draft = typeof emptyDraft;

export function QcSpecCardIssueReturn() {
  const [productions] = useData<Production>("productions", [], { firmScope: "all" });
  const [records, , loading, api] = useData<QcSpecCardMovement>("qc_spec_card_movements", [], { firmScope: "all" });
  const [people] = useData<QcPersonMaster>("qc_person_masters", [], { firmScope: "all" });
  const items = useNpdItems();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");
  const activePeople = useMemo(() => people.filter((person) => text(person.name) && text(person.active).toLowerCase() !== "no").sort((a, b) => a.name.localeCompare(b.name)), [people]);
  const jobOptions = useMemo(() => productions.filter((production) => production.status !== "Cancelled").sort((a, b) => text(a.transactionNo || a.jobCardNo).localeCompare(text(b.transactionNo || b.jobCardNo))), [productions]);

  const selectJob = (productionId: string) => {
    const production = productions.find((item) => item.id === productionId);
    if (!production) { setDraft(emptyDraft); setSelectedId(""); return; }
    const jobNo = text(production.transactionNo || production.jobCardNo);
    const existing = records.find((record) => record.productionId === production.id || record.jobNo === jobNo);
    const item = items.find((entry: any) => text(entry.id) === text(production.npdId || production.itemId) || text(entry.erp) === text(production.erpCode || production.masterErp));
    setSelectedId(existing?.id || "");
    setDraft(existing ? { ...emptyDraft, productionId: existing.productionId, jobNo: existing.jobNo, erpCode: existing.erpCode, date: existing.date, partyName: existing.partyName, itemName: existing.itemName, planQuantity: existing.planQuantity, artwork: existing.artwork || "", spec: existing.spec || "", issue: Boolean(existing.issue), issuedTo: existing.issuedTo || "", returned: Boolean(existing.returned), returnedBy: existing.returnedBy || "", qcPerson: existing.printingQcPerson || "" } : { ...emptyDraft, productionId: production.id, jobNo, erpCode: text(production.erpCode || production.masterErp || (production as any).erp || item?.erp), date: text(production.date).slice(0, 10), partyName: text(production.companyName), itemName: text((production as any).itemName || item?.name), planQuantity: number(production.plannedQty || production.qty), artwork: text((item as any)?.artwork || (production as any).artwork), spec: text((item as any)?.spec || (production as any).spec) });
    setMessage("");
  };

  const save = async () => {
    setMessage("");
    if (!draft.productionId) return setMessage("Select a Job No. first.");
    if (draft.issue && !draft.issuedTo) return setMessage("Issued To is required when Issue is selected.");
    if (draft.returned && !draft.issue) return setMessage("A card cannot be returned before it is issued.");
    if (draft.returned && !draft.returnedBy) return setMessage("Returned By is required when Returned is selected.");
    const existing = records.find((record) => record.id === selectedId || record.productionId === draft.productionId);
    const now = new Date().toISOString();
    const item: QcSpecCardMovement = { ...draft, id: existing?.id || selectedId || `SPECCARD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, status: draft.returned ? "Returned" : draft.issue ? "Issued" : "Pending Issue", printingQcPerson: draft.qcPerson, updatedBy: "System User", updateTimestamp: now };
    try { if (existing) await api.saveItem(item); else await api.addItem(item); setSelectedId(item.id); setDraft({ ...draft, issue: Boolean(item.issue), returned: Boolean(item.returned) }); setMessage("Spec Card record saved successfully."); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save Spec Card record."); }
  };
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const selectClass = inputClass;
  return <div className="space-y-4 pb-8"><div className="border-b border-black pb-3"><h2 className="text-xl font-bold uppercase">QC Spec Card Issue / Return</h2></div>{message && <div className="rounded border border-black bg-amber-100 p-3 font-bold">{message}</div>}<div className="space-y-4 rounded border-2 border-black bg-white p-4"><label className="block max-w-xl space-y-1"><span className="font-bold">Job No. *</span><select className={selectClass} value={draft.productionId} onChange={(event) => selectJob(event.target.value)}><option value="">Select Job No.</option>{jobOptions.map((job) => <option key={job.id} value={job.id}>{text(job.transactionNo || job.jobCardNo)}</option>)}</select></label><div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">{([["erpCode", "ERP Code"], ["date", "Date"], ["partyName", "Party Name"], ["itemName", "Item Name"], ["planQuantity", "Plan Quantity"], ["artwork", "Artwork"], ["spec", "Spec"]] as const).map(([key, label]) => <label key={key} className="space-y-1"><span className="font-bold">{label}</span><input className={`${inputClass} bg-slate-100`} readOnly value={String(draft[key] ?? "")} /></label>)}<label className="flex items-center gap-2 rounded border border-black p-2 font-bold"><input type="checkbox" checked={draft.issue} onChange={(event) => update("issue", event.target.checked)} /> Issue</label><label className="space-y-1"><span className="font-bold">Issued To</span><select className={selectClass} value={draft.issuedTo} onChange={(event) => update("issuedTo", event.target.value)}><option value="">Select Person</option>{activePeople.map((person) => <option key={person.id} value={person.name}>{person.name}</option>)}</select></label><label className="flex items-center gap-2 rounded border border-black p-2 font-bold"><input type="checkbox" checked={draft.returned} onChange={(event) => update("returned", event.target.checked)} /> Returned</label><label className="space-y-1"><span className="font-bold">Returned By</span><select className={selectClass} value={draft.returnedBy} onChange={(event) => update("returnedBy", event.target.value)}><option value="">Select Person</option>{activePeople.map((person) => <option key={person.id} value={person.name}>{person.name}</option>)}</select></label><label className="space-y-1"><span className="font-bold">QC Person</span><select className={selectClass} value={draft.qcPerson} onChange={(event) => update("qcPerson", event.target.value)}><option value="">Select QC Person</option>{activePeople.map((person) => <option key={person.id} value={person.name}>{person.name}</option>)}</select></label><div className="rounded border border-black bg-slate-100 p-2 font-bold">Status: {draft.returned ? "Returned" : draft.issue ? "Issued" : "Pending Issue"}</div><div className="md:col-span-2 xl:col-span-4"><button type="button" onClick={() => void save()} className="rounded bg-cyan-700 px-5 py-2 font-bold text-white">Save Spec Card</button></div></div></div><div className="overflow-auto rounded border-2 border-black bg-white"><table className="min-w-[1200px] border-collapse text-xs"><thead><tr className="bg-cyan-800 text-white">{["Job No.", "ERP Code", "Date", "Party Name", "Item Name", "Plan Quantity", "Issue", "Issued To", "Returned", "Returned By", "QC Person", "Status"].map((heading) => <th key={heading} className="border border-black px-2 py-2 text-left">{heading}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={12} className="p-6 text-center">Loading...</td></tr> : records.length ? records.map((record) => <tr key={record.id} className="odd:bg-white even:bg-slate-50"><td className="border border-black p-2">{record.jobNo}</td><td className="border border-black p-2">{record.erpCode}</td><td className="border border-black p-2">{record.date}</td><td className="border border-black p-2">{record.partyName}</td><td className="border border-black p-2">{record.itemName}</td><td className="border border-black p-2">{record.planQuantity}</td><td className="border border-black p-2">{record.issue ? "Yes" : "No"}</td><td className="border border-black p-2">{record.issuedTo}</td><td className="border border-black p-2">{record.returned ? "Yes" : "No"}</td><td className="border border-black p-2">{record.returnedBy}</td><td className="border border-black p-2">{record.printingQcPerson}</td><td className="border border-black p-2 font-bold">{record.status}</td></tr>) : <tr><td colSpan={12} className="p-6 text-center">No Spec Card records found.</td></tr>}</tbody></table></div></div>;
}
