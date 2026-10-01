import { useMemo, useState } from "react";
import { useData } from "../hooks/useData";
import { useNpdItems } from "../hooks/useNpdItems";
import type { Production, QcSpecCardMovement } from "../types";

const inputClass = "w-full rounded border border-black bg-white px-3 py-2";
const text = (value: unknown) => String(value ?? "").trim();
const number = (value: unknown) => Number(value) || 0;

type Draft = Omit<QcSpecCardMovement, "id" | "status" | "updatedBy" | "updateTimestamp">;

const emptyDraft: Draft = {
  productionId: "", jobNo: "", erpCode: "", date: "", partyName: "", itemName: "", planQuantity: 0,
  artwork: "", spec: "", fileNo: "", indexNo: "", sampleNo: "", blockLocation: "", blockNo: "",
  issue: false, issuedTo: "", returned: false, returnedBy: "", boardline: "", printing: "", printingQcPerson: "",
};

export function QcSpecCardIssueReturn() {
  const [productions] = useData<Production>("productions", [], { firmScope: "all" });
  const [records, , loading, api] = useData<QcSpecCardMovement>("qc_spec_card_movements", [], { firmScope: "all" });
  const items = useNpdItems();
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  const productionOptions = useMemo(() => productions
    .filter((production) => production.status !== "Cancelled")
    .map((production) => ({ production, jobNo: text(production.transactionNo || production.jobCardNo) }))
    .filter(({ jobNo }) => !search || jobNo.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.jobNo.localeCompare(b.jobNo)), [productions, search]);

  const selectProduction = (production: Production) => {
    const jobNo = text(production.transactionNo || production.jobCardNo);
    const existing = records.find((record) => record.productionId === production.id || record.jobNo === jobNo);
    const item = items.find((entry: any) => text(entry.id) === text(production.npdId || production.itemId) || text(entry.erp) === text(production.erpCode || production.masterErp));
    setSelectedId(existing?.id || "");
    setDraft(existing ? { ...emptyDraft, ...existing } : {
      ...emptyDraft,
      productionId: production.id,
      jobNo,
      erpCode: text(production.erpCode || production.masterErp || (production as any).erp || item?.erp),
      date: text(production.date).slice(0, 10),
      partyName: text(production.companyName),
      itemName: text((production as any).itemName || item?.name),
      planQuantity: number(production.plannedQty || production.qty),
      artwork: text((item as any)?.artwork || (production as any).artwork),
      spec: text((item as any)?.spec || (production as any).spec),
    });
    setMessage("");
  };

  const save = async () => {
    setMessage("");
    if (!draft.productionId) return setMessage("Select a job first.");
    if (draft.issue && !text(draft.issuedTo)) return setMessage("Issued To is required when Issue is selected.");
    if (draft.returned && !draft.issue) return setMessage("A card cannot be returned before it is issued.");
    if (draft.returned && !text(draft.returnedBy)) return setMessage("Returned By is required when Returned is selected.");
    const now = new Date().toISOString();
    const status = draft.returned ? "Returned" : draft.issue ? "Issued" : "Pending Issue";
    const item: QcSpecCardMovement = { ...draft, id: selectedId || `SPECCARD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, status, updatedBy: "System User", updateTimestamp: now };
    try {
      if (selectedId) await api.saveItem(item);
      else await api.addItem(item);
      setSelectedId(item.id);
      setDraft(item);
      setMessage("Spec Card record saved successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save Spec Card record.");
    }
  };

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  return <div className="space-y-4 pb-8">
    <div className="border-b border-black pb-3"><h2 className="text-xl font-bold uppercase">QC Spec Card Issue / Return</h2></div>
    {message && <div className="rounded border border-black bg-amber-100 p-3 font-bold">{message}</div>}
    <div className="grid gap-4 rounded border-2 border-black bg-white p-4 lg:grid-cols-[280px_1fr]">
      <div className="space-y-2"><label className="font-bold">Search Job</label><input className={inputClass} placeholder="Job No." value={search} onChange={(event) => setSearch(event.target.value)} /><div className="max-h-96 overflow-auto rounded border border-black">{productionOptions.map(({ production, jobNo }) => <button type="button" key={production.id} onClick={() => selectProduction(production)} className={`block w-full border-b border-black p-2 text-left text-sm hover:bg-cyan-100 ${draft.productionId === production.id ? "bg-cyan-100 font-bold" : ""}`}>{jobNo} — {text(production.companyName)}</button>)}{!productionOptions.length && <div className="p-3 text-sm">No jobs found.</div>}</div></div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {([["jobNo", "Job No."], ["erpCode", "ERP Code"], ["date", "Date"], ["partyName", "Party Name"], ["itemName", "Item Name"], ["planQuantity", "Plan Quantity"], ["artwork", "Artwork"], ["spec", "Spec"], ["fileNo", "File No."], ["indexNo", "Index No."], ["sampleNo", "Sample No."], ["blockLocation", "Block Location"], ["blockNo", "Block No."], ["issuedTo", "Issued To"], ["returnedBy", "Returned By"], ["boardline", "Boardline"], ["printing", "Printing"], ["printingQcPerson", "Printing QC Person"]] as const).map(([key, label]) => <label key={key} className="space-y-1"><span className="font-bold">{label}</span><input className={inputClass} value={String(draft[key] ?? "")} disabled={["jobNo", "erpCode", "date", "partyName", "itemName", "planQuantity", "artwork", "spec"].includes(key)} onChange={(event) => update(key, (key === "planQuantity" ? number(event.target.value) : event.target.value) as Draft[typeof key])} /></label>)}
        <label className="flex items-center gap-2 rounded border border-black p-2 font-bold"><input type="checkbox" checked={draft.issue} onChange={(event) => update("issue", event.target.checked)} /> Issue</label>
        <label className="flex items-center gap-2 rounded border border-black p-2 font-bold"><input type="checkbox" checked={draft.returned} onChange={(event) => update("returned", event.target.checked)} /> Returned</label>
        <div className="rounded border border-black bg-slate-100 p-2 font-bold">Status: {draft.returned ? "Returned" : draft.issue ? "Issued" : "Pending Issue"}</div>
        <div className="md:col-span-2 xl:col-span-4"><button type="button" onClick={() => void save()} className="rounded bg-cyan-700 px-5 py-2 font-bold text-white">Save Spec Card</button></div>
      </div>
    </div>
    <div className="overflow-auto rounded border-2 border-black bg-white"><table className="min-w-[1800px] border-collapse text-xs"><thead><tr className="bg-cyan-800 text-white">{["Job No.", "ERP Code", "Date", "Party Name", "Item Name", "Plan Quantity", "File No.", "Index No.", "Sample No.", "Block Location", "Block No.", "Issue", "Issued To", "Returned", "Returned By", "Boardline", "Printing", "Printing QC Person", "Status"].map((heading) => <th key={heading} className="border border-black px-2 py-2 text-left">{heading}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={19} className="p-6 text-center">Loading...</td></tr> : records.length ? records.map((record) => <tr key={record.id} className="odd:bg-white even:bg-slate-50"><td className="border border-black p-2">{record.jobNo}</td><td className="border border-black p-2">{record.erpCode}</td><td className="border border-black p-2">{record.date}</td><td className="border border-black p-2">{record.partyName}</td><td className="border border-black p-2">{record.itemName}</td><td className="border border-black p-2">{record.planQuantity}</td><td className="border border-black p-2">{record.fileNo}</td><td className="border border-black p-2">{record.indexNo}</td><td className="border border-black p-2">{record.sampleNo}</td><td className="border border-black p-2">{record.blockLocation}</td><td className="border border-black p-2">{record.blockNo}</td><td className="border border-black p-2">{record.issue ? "Yes" : "No"}</td><td className="border border-black p-2">{record.issuedTo}</td><td className="border border-black p-2">{record.returned ? "Yes" : "No"}</td><td className="border border-black p-2">{record.returnedBy}</td><td className="border border-black p-2">{record.boardline}</td><td className="border border-black p-2">{record.printing}</td><td className="border border-black p-2">{record.printingQcPerson}</td><td className="border border-black p-2 font-bold">{record.status}</td></tr>) : <tr><td colSpan={19} className="p-6 text-center">No Spec Card records found.</td></tr>}</tbody></table></div>
  </div>;
}
