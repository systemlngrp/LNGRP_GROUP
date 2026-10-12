import { useMemo, useState } from "react";
import { ArrowLeft, Edit, ExternalLink, Plus, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useData } from "../hooks/useData";
import { useNpdItems } from "../hooks/useNpdItems";
import { Select } from "../components/Select";
import type { Firm, Item, Order, OrderSchedule, Production, PreDispatchInspection as Inspection, User } from "../types";
import { isActiveQcPerson, qcPersonOptions } from "../utils/qcPeople";
import { inspectionDraftForJob, invalidInspectionNumberField, isPositiveDecimal } from "../lib/inspectionNumbers";
import { normalizeQcResult } from "../lib/jobCellColors";

const input = "w-full rounded border-2 border-black bg-white px-3 py-2";
const jobInformationInput = "w-full rounded border-2 border-black px-3 py-2 text-gray-900";
const numericJobFields = new Set<keyof Inspection>(["plannedQty"]);
const text = (v: unknown) => String(v ?? "").trim();
const checks = ["printingArtworkCheck", "printingColorCheck", "boxSquaringCheck", "flapGapCheck", "jointPastingDelaminationCheck"] as const;
const checkLabels: Record<typeof checks[number], string> = { printingArtworkCheck: "Printing Artwork", printingColorCheck: "Printing Color", boxSquaringCheck: "Box Squaring", flapGapCheck: "Flap Gap", jointPastingDelaminationCheck: "Joint Pasting / Delamination" };
type Form = Partial<Inspection> & { productionId: string; jobNo: string };
const blank: Form = { productionId: "", jobNo: "", issue: "" } as Form;
const opts = (values: string[]) => [...new Set(values.filter(Boolean))].sort().map(value => ({ value, label: value }));
const normalizePrefix = (value: unknown) => text(value).toUpperCase().split(/[\/_-]/)[0].replace(/[^A-Z0-9]/g, "");
const resolveFirmFromJobPrefix = (jobNo: string, firms: Firm[]) => {
  const jobPrefix = normalizePrefix(jobNo);
  if (!jobPrefix) return undefined;
  return firms
    .map(firm => ({ firm, prefix: normalizePrefix(firm.shortName) }))
    .filter(entry => entry.prefix && (jobPrefix === entry.prefix || jobPrefix.startsWith(entry.prefix)))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0]?.firm;
};
const deriveInspectionResult = (value: Partial<Inspection>) => {
  const values = checks.map(key => text(value[key]));
  if (values.some(result => result === "NOT OK")) return "QC FAIL" as const;
  if (values.every(result => result === "OK")) return "QC PASS" as const;
  return "Pending" as const;
};
const formatTimestamp = (value: unknown) => {
  const raw = text(value);
  if (!raw) return "";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleString();
};

function useInspectionData() {
  const [productions] = useData<Production>("productions", [], { firmScope: "all" });
  const [records, , loading, api] = useData<Inspection>("pre_dispatch_inspections", [], { firmScope: "all" });
  const [people] = useData<User>("users", []);
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const [orders] = useData<Order>("orders", [], { firmScope: "all" });
  const [schedules] = useData<OrderSchedule>("orders_schedule", [], { firmScope: "all" });
  const items = useNpdItems();
  const normalizedRecords = records.map(record => ({ ...record, result: normalizeQcResult(record.result) }));
  return { productions, records: normalizedRecords, loading, api, people, firms, orders, schedules, items };
}

export function PreDispatchInspectionForm() {
  const navigate = useNavigate();
  const { productions, records, api, people, firms, orders, schedules, items } = useInspectionData();
  const [form, setForm] = useState<Form>(blank);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [unlockedNumericJobFields, setUnlockedNumericJobFields] = useState<Set<keyof Inspection>>(new Set());
  const jobOptions = productions.filter(p => p.status !== "Cancelled").map(p => ({ value: p.id, label: text(p.transactionNo || p.jobCardNo), searchText: `${text(p.transactionNo || p.jobCardNo)} ${text(p.companyName)} ${text(p.erpCode || p.masterErp)}` }));
  const personOptions = qcPersonOptions(people, [text(form.qcPerson)]);
  const update = (key: string, value: unknown) => setForm(current => ({ ...current, [key]: value }));
  const selectJob = (id: string) => {
    const production = productions.find(p => p.id === id);
    if (!production) { setUnlockedNumericJobFields(new Set()); return setForm(blank); }
    const jobNo = text(production.transactionNo || production.jobCardNo);
    const old = records.find(r => r.productionId === id || r.jobNo === jobNo);
    const item = (items as Item[]).find(i => String(i.id) === String(production.itemId || production.npdId) || String(i.erp) === String(production.erpCode || production.masterErp));
    const schedule = schedules.find(value => String(value.id) === String(production.scheduleId));
    const orderId = schedule?.orderId || (production as any).orderId;
    const order = orders.find(value => String(value.id) === String(orderId));
    const orderFirm = order?.firmId ? firms.find(value => String(value.id) === String(order.firmId)) : undefined;
    const prefixFirm = resolveFirmFromJobPrefix(jobNo, firms);
    const productionFirm = production.firmId ? firms.find(value => String(value.id) === String(production.firmId)) : undefined;
    const resolvedFirm = order?.firmId || order?.firmName ? { id: order.firmId || orderFirm?.id || "", firmName: order.firmName || orderFirm?.firmName || "" } : prefixFirm || productionFirm;
    const jobFields = {
      productionId: id,
      jobNo,
      firmId: order?.firmId || resolvedFirm?.id || production.firmId || "",
      firmName: order?.firmName || resolvedFirm?.firmName || production.firmName || "",
      erpCode: text(production.erpCode || production.masterErp || order?.erpCode || item?.erp),
      partyName: text(production.companyName || item?.customer),
      itemName: text((production as any).itemName || item?.name),
      plannedQty: Number(production.plannedQty || production.qty) || 0,
    };
    const selectedForm: Form = inspectionDraftForJob(jobFields, old);
    setForm(selectedForm);
    setUnlockedNumericJobFields(new Set([...numericJobFields].filter(key => !isPositiveDecimal(selectedForm[key]))));
    setMessage(resolvedFirm ? "" : "Warning: Firm could not be resolved from the Original Order or Job No. prefix. Please verify it before saving.");
  };
  const upload = async (key: "frontPhoto" | "backPhoto", file?: File) => { if (!file) return; const reader = new FileReader(); reader.onload = async () => { try { const response = await fetch("/api/upload-artwork", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: file.name, base64: reader.result }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Upload failed"); update(key, result.filename); } catch (error) { setMessage(error instanceof Error ? error.message : "Photo upload failed."); } }; reader.readAsDataURL(file); };
  const save = async () => {
    if (!form.productionId) return setMessage("Job No. is required.");
    const jobFields: Array<[string, unknown]> = [["Firm", form.firmName], ["ERP", form.erpCode], ["Party Name", form.partyName], ["Item Name", form.itemName]];
    const missingJob = jobFields.find(([, value]) => !text(value));
    if (missingJob) return setMessage(`${missingJob[0]} is required.`);
    const invalidNumber = invalidInspectionNumberField(form);
    if (invalidNumber) return setMessage(invalidNumber + " must be a number greater than zero (without units).");
    const missingCheck = checks.find((check) => !text(form[check]));
    if (missingCheck) return setMessage(`${checkLabels[missingCheck]} is required.`);
    if (!text(form.qcPerson)) return setMessage("QC Person is required.");
    if (!text(form.frontPhoto)) return setMessage("Box Photo Front is required.");
    if (!text(form.backPhoto)) return setMessage("Box Photo Back is required.");
    if (!text(form.remarks)) return setMessage("Remarks are required.");
    const old = records.find(r => r.productionId === form.productionId || r.jobNo === form.jobNo); const item: Inspection = { ...form, id: old?.id || `PDI-${Date.now()}`, result: deriveInspectionResult(form), inspectionDate: form.inspectionDate || new Date().toISOString(), updatedBy: "System User", updateTimestamp: new Date().toISOString() } as Inspection; setSaving(true); try { if (old) await api.saveItem(item); else await api.addItem(item); navigate("/quality/pre-dispatch-inspection", { state: { message: "Pre-Dispatch Inspection saved successfully." } }); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save inspection."); } finally { setSaving(false); }
  };
  const readOnlyFields = [["Firm *", "firmName"], ["ERP *", "erpCode"], ["Party Name *", "partyName"], ["Item Name *", "itemName"], ["Planned Quantity *", "plannedQty"]] as const;
  const editableFields = [["Length (ID) *", "lengthId"], ["Width (ID) *", "widthId"], ["Height (ID) *", "heightId"], ["CS Achieved *", "csAchieved"], ["GSM Achieved *", "gsmAchieved"], ["Box Weight (Grams) *", "boxWeightGrams"]] as const;
  return <div className="mx-auto max-w-7xl space-y-5 pb-8 text-black"><div className="flex items-center justify-between border-b border-black pb-3"><div><h2 className="text-xl font-bold uppercase">Pre-Dispatch Inspection Form</h2></div><button type="button" onClick={() => navigate("/quality/pre-dispatch-inspection")} className="inline-flex items-center gap-2 rounded border-2 border-black bg-white px-4 py-2 font-bold"><ArrowLeft size={17} />Back</button></div>{message && <div className="rounded border-2 border-black bg-amber-100 p-3 font-bold">{message}</div>}<section className="rounded border-2 border-black bg-white p-4"><h3 className="mb-4 bg-cyan-800 p-3 font-bold uppercase text-white">Job Information</h3><div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"><label className="flex h-full flex-col gap-1"><b>Job No. *</b><Select value={form.productionId} onChange={selectJob} options={jobOptions} placeholder="Select Job No." compact={false} /></label>{readOnlyFields.map(([label, key]) => <label key={key} className="flex h-full flex-col gap-1"><b>{label}</b><input className={`${jobInformationInput} bg-gray-400`} type="text" inputMode={numericJobFields.has(key) ? "decimal" : undefined} aria-invalid={numericJobFields.has(key) && !isPositiveDecimal(form[key])} readOnly={!unlockedNumericJobFields.has(key)} value={String(form[key] ?? "")} onChange={event => update(key, event.target.value)} /></label>)}</div></section><section className="rounded border-2 border-black bg-white p-4"><h3 className="mb-4 bg-cyan-800 p-3 font-bold uppercase text-white">PDI Form Columns</h3><div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">{editableFields.map(([label, key]) => <label key={key} className="flex h-full flex-col gap-1"><b>{label}</b><input className={input} type="text" inputMode="decimal" aria-invalid={text(form[key]) ? !isPositiveDecimal(form[key]) : undefined} value={String(form[key] ?? "")} onChange={event => update(key, event.target.value)} /></label>)}{checks.map(key => <label key={key} className="flex h-full flex-col gap-1"><b>{checkLabels[key]}</b><Select value={text(form[key])} onChange={value => update(key, value)} options={[{ value: "OK", label: "OK" }, { value: "NOT OK", label: "NOT OK" }]} placeholder="Select result" compact={false} /></label>)}<label className="flex h-full flex-col gap-1"><b>QC Person *</b><Select value={text(form.qcPerson)} onChange={value => update("qcPerson", value)} options={personOptions} placeholder="Select QC Person" compact={false} /></label><label className="flex h-full flex-col gap-1"><b>Box Photo Front</b><input className={input} type="file" accept="image/*" onChange={event => void upload("frontPhoto", event.target.files?.[0])} /></label><label className="flex h-full flex-col gap-1"><b>Box Photo Back</b><input className={input} type="file" accept="image/*" onChange={event => void upload("backPhoto", event.target.files?.[0])} /></label><label className="flex h-full flex-col gap-1"><b>Remarks</b><textarea className={`${input} min-h-16`} value={text(form.remarks)} onChange={event => update("remarks", event.target.value)} /></label></div></section><div className="flex w-full items-center justify-end gap-3 border-t-2 border-black pt-4"><button type="button" onClick={() => navigate("/quality/pre-dispatch-inspection")} className="inline-flex h-12 min-w-32 items-center justify-center gap-2 rounded border-2 border-black bg-white px-5 font-bold"><X size={17} />Cancel</button><button type="button" disabled={saving} onClick={() => void save()} className="inline-flex h-12 min-w-40 items-center justify-center gap-2 rounded bg-cyan-700 px-5 font-bold disabled:opacity-60">Save</button></div></div>;
}

export function PreDispatchInspection() {
  const navigate = useNavigate();
  const { records, loading, people, firms, api } = useInspectionData();
  const [filters, setFilters] = useState({ search: "", firmId: "", jobNo: "", erpCode: "", partyName: "", itemName: "", result: "", qcPerson: "", date: "" });
  const [editingRow, setEditingRow] = useState<Inspection | null>(null);
  const [editForm, setEditForm] = useState<Partial<Inspection>>({});
  const [editMessage, setEditMessage] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const activePeople = people.filter(isActiveQcPerson);
  const filtered = useMemo(() => records.filter(r => { const q = filters.search.toLowerCase().trim(); const hay = String(r.jobNo + " " + r.erpCode + " " + r.partyName + " " + r.itemName + " " + r.qcPerson + " " + r.remarks).toLowerCase(); return (!q || hay.includes(q)) && (!filters.firmId || r.firmId === filters.firmId) && (!filters.jobNo || r.jobNo === filters.jobNo) && (!filters.erpCode || r.erpCode === filters.erpCode) && (!filters.partyName || r.partyName === filters.partyName) && (!filters.itemName || r.itemName === filters.itemName) && (!filters.result || normalizeQcResult(r.result) === filters.result) && (!filters.qcPerson || r.qcPerson === filters.qcPerson) && (!filters.date || text(r.inspectionDate).slice(0, 10) === filters.date); }), [records, filters]);
  const setFilter = (key: string, value: string) => setFilters(current => ({ ...current, [key]: value }));
  const filter = (key: keyof typeof filters, label: string, options: { value: string; label: string }[]) => <Select value={filters[key]} onChange={value => setFilter(key, value)} options={options} placeholder={label} compact />;
  const today = new Date().toISOString().slice(0, 10); const tiles = { total: filtered.length, pending: filtered.filter(r => normalizeQcResult(r.result) === "Pending").length, pass: filtered.filter(r => normalizeQcResult(r.result) === "QC PASS").length, fail: filtered.filter(r => normalizeQcResult(r.result) === "QC FAIL").length, today: filtered.filter(r => text(r.inspectionDate).slice(0, 10) === today).length };
  const headers = ["Job No.", "Date", "Timestamp", "Firm", "ERP", "Party", "Item", "Dimensions", "Checks", "Photos", "Result", "QC Person", "Remarks", "Actions"];
  const openEdit = (record: Inspection) => { setEditingRow(record); setEditForm({ ...record }); setEditMessage(""); };
  const updateEdit = (key: string, value: unknown) => setEditForm(current => ({ ...current, [key]: value }));
  const closeEdit = () => { setEditingRow(null); setEditForm({}); setEditMessage(""); };
  const uploadEdit = async (key: "frontPhoto" | "backPhoto", file?: File) => { if (!file) return; const reader = new FileReader(); reader.onload = async () => { try { const response = await fetch("/api/upload-artwork", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: file.name, base64: reader.result }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Upload failed"); updateEdit(key, result.filename); } catch (error) { setEditMessage(error instanceof Error ? error.message : "Photo upload failed."); } }; reader.readAsDataURL(file); };
  const saveEdit = async () => { if (!editingRow) return; const jobFields: Array<[string, unknown]> = [["Firm", editForm.firmName], ["ERP", editForm.erpCode], ["Party Name", editForm.partyName], ["Item Name", editForm.itemName]]; const missingJob = jobFields.find(([, value]) => !text(value)); if (missingJob) return setEditMessage(missingJob[0] + " is required."); const invalidNumber = invalidInspectionNumberField(editForm); if (invalidNumber) return setEditMessage(invalidNumber + " must be a number greater than zero (without units)."); const missingCheck = checks.find(check => !text(editForm[check])); if (missingCheck) return setEditMessage(checkLabels[missingCheck] + " is required."); if (!text(editForm.qcPerson)) return setEditMessage("QC Person is required."); if (!text(editForm.frontPhoto)) return setEditMessage("Box Photo Front is required."); if (!text(editForm.backPhoto)) return setEditMessage("Box Photo Back is required."); if (!text(editForm.remarks)) return setEditMessage("Remarks are required."); const updated: Inspection = { ...editingRow, ...editForm, id: editingRow.id, inspectionDate: editingRow.inspectionDate, result: deriveInspectionResult(editForm), updatedBy: "System User", updateTimestamp: new Date().toISOString() } as Inspection; setEditSaving(true); try { await api.saveItem(updated); closeEdit(); } catch (error) { setEditMessage(error instanceof Error ? error.message : "Unable to save inspection."); } finally { setEditSaving(false); } };
  const readOnlyEditFields = [["Job No.", "jobNo"], ["Firm *", "firmName"], ["ERP *", "erpCode"], ["Party Name *", "partyName"], ["Item Name *", "itemName"], ["Planned Quantity *", "plannedQty"]] as const;
  const editFields = [["Length (ID) *", "lengthId"], ["Width (ID) *", "widthId"], ["Height (ID) *", "heightId"], ["CS Achieved *", "csAchieved"], ["GSM Achieved *", "gsmAchieved"], ["Box Weight (Grams) *", "boxWeightGrams"]] as const;
  const tile = (label: string, value: number, tone: string) => <div className={"rounded border-2 border-black p-3 " + tone}><div className="text-xs font-bold uppercase">{label}</div><div className="text-2xl font-black">{value}</div></div>;
  return <div className="space-y-4 pb-8"><div className="flex items-center justify-between border-b border-black pb-3"><h2 className="text-xl font-bold uppercase">Pre-Dispatch Inspection</h2><button type="button" onClick={() => navigate("/quality/pre-dispatch-inspection/form")} className="inline-flex items-center gap-2 rounded border-2 border-black bg-cyan-700 px-4 py-2 font-bold text-white"><Plus size={17} />New Inspection</button></div><div className="grid grid-cols-2 gap-2 md:grid-cols-5">{tile("Total Inspections", tiles.total, "bg-blue-100")}{tile("Pending", tiles.pending, "bg-amber-100")}{tile("QC Pass", tiles.pass, "bg-emerald-100")}{tile("QC Fail", tiles.fail, "bg-emerald-100")}{tile("Today", tiles.today, "bg-purple-100")}</div><div className="grid grid-cols-1 gap-2 rounded border-2 border-black bg-white p-3 md:grid-cols-3 xl:grid-cols-5"><input className={input} value={filters.search} onChange={event => setFilter("search", event.target.value)} placeholder="Search inspection..." />{filter("firmId", "All Firms", firms.map(f => ({ value: f.id, label: f.firmName })))}{filter("jobNo", "All Jobs", opts(records.map(r => r.jobNo)))}{filter("erpCode", "All ERP", opts(records.map(r => text(r.erpCode))))}{filter("partyName", "All Parties", opts(records.map(r => text(r.partyName))))}{filter("itemName", "All Items", opts(records.map(r => text(r.itemName))))}{filter("result", "All Results", opts(records.map(r => normalizeQcResult(r.result))))}{filter("qcPerson", "All QC Persons", opts([...records.map(r => text(r.qcPerson)), ...activePeople.map(p => p.name)]))}<input type="date" className={input} value={filters.date} onChange={event => setFilter("date", event.target.value)} /><button type="button" onClick={() => setFilters({ search: "", firmId: "", jobNo: "", erpCode: "", partyName: "", itemName: "", result: "", qcPerson: "", date: "" })} className="rounded border-2 border-black px-3 py-2 font-bold">Clear Filters</button></div><div className="overflow-auto rounded border-2 border-black bg-white"><table className="min-w-[2100px] w-full text-xs"><thead className="bg-cyan-800 text-white"><tr>{headers.map(header => <th key={header} className="border border-black p-2 text-left">{header}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={headers.length} className="p-6 text-center">Loading...</td></tr> : filtered.length ? filtered.map(record => <tr key={record.id}><td className="border border-black p-2">{record.jobNo}</td><td className="border border-black p-2">{text(record.inspectionDate).slice(0, 10)}</td><td className="border border-black p-2 whitespace-nowrap">{formatTimestamp(record.inspectionDate)}</td><td className="border border-black p-2">{record.firmName}</td><td className="border border-black p-2">{record.erpCode}</td><td className="border border-black p-2">{record.partyName}</td><td className="border border-black p-2">{record.itemName}</td><td className="border border-black p-2">{[record.lengthId, record.widthId, record.heightId].join(" / ")}</td><td className="border border-black p-2">{checks.map(key => checkLabels[key] + ": " + ((record as any)[key] || "-")).join(" | ")}</td><td className="border border-black p-2">{[record.frontPhoto, record.backPhoto].filter(Boolean).map((photo, index) => <a key={photo} href={"/uploads/" + photo} target="_blank" rel="noreferrer" className="mr-2 inline-flex items-center gap-1 text-blue-700 underline">Photo {index + 1}<ExternalLink size={12} /></a>)}</td><td className="border border-black p-2 font-bold">{normalizeQcResult(record.result)}</td><td className="border border-black p-2">{record.qcPerson}</td><td className="border border-black p-2">{record.remarks}</td><td className="border border-black p-2"><button type="button" onClick={() => openEdit(record)} className="inline-flex items-center gap-1 rounded border border-black bg-white px-2 py-1 font-bold"><Edit size={13} />Edit</button></td></tr>) : <tr><td colSpan={headers.length} className="p-6 text-center">No inspections found.</td></tr>}</tbody></table></div>{editingRow && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded border-2 border-black bg-white p-5 text-black"><div className="mb-4 flex items-center justify-between border-b-2 border-black pb-3"><h3 className="text-lg font-bold uppercase">Edit Pre-Dispatch Inspection</h3><button type="button" onClick={closeEdit} className="rounded border-2 border-black bg-white p-2"><X size={17} /></button></div>{editMessage && <div className="mb-4 rounded border-2 border-black bg-amber-100 p-3 font-bold">{editMessage}</div>}<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">{readOnlyEditFields.map(([label, key]) => <label key={key} className="flex flex-col gap-1"><b>{label}</b><input className={jobInformationInput + " bg-gray-400"} readOnly value={String(editForm[key] ?? "")} /></label>)}<label className="flex flex-col gap-1"><b>Timestamp</b><input className={jobInformationInput + " bg-gray-200"} readOnly value={formatTimestamp(editForm.inspectionDate)} /></label>{editFields.map(([label, key]) => <label key={key} className="flex flex-col gap-1"><b>{label}</b><input className={input} type="text" inputMode="decimal" aria-invalid={text(editForm[key]) ? !isPositiveDecimal(editForm[key]) : undefined} value={String(editForm[key] ?? "")} onChange={event => updateEdit(key, event.target.value)} /></label>)}{checks.map(key => <label key={key} className="flex flex-col gap-1"><b>{checkLabels[key]}</b><Select value={text(editForm[key])} onChange={value => updateEdit(key, value)} options={[{ value: "OK", label: "OK" }, { value: "NOT OK", label: "NOT OK" }]} placeholder="Select result" compact={false} /></label>)}<label className="flex flex-col gap-1"><b>QC Person *</b><Select value={text(editForm.qcPerson)} onChange={value => updateEdit("qcPerson", value)} options={qcPersonOptions(people, [text(editForm.qcPerson)])} placeholder="Select QC Person" compact={false} /></label><label className="flex flex-col gap-1"><b>Box Photo Front</b><input className={input} type="file" accept="image/*" onChange={event => void uploadEdit("frontPhoto", event.target.files?.[0])} />{editForm.frontPhoto && <a href={"/uploads/" + editForm.frontPhoto} target="_blank" rel="noreferrer" className="text-blue-700 underline">Current photo</a>}</label><label className="flex flex-col gap-1"><b>Box Photo Back</b><input className={input} type="file" accept="image/*" onChange={event => void uploadEdit("backPhoto", event.target.files?.[0])} />{editForm.backPhoto && <a href={"/uploads/" + editForm.backPhoto} target="_blank" rel="noreferrer" className="text-blue-700 underline">Current photo</a>}</label><label className="flex flex-col gap-1"><b>Remarks</b><textarea className={input + " min-h-16"} value={text(editForm.remarks)} onChange={event => updateEdit("remarks", event.target.value)} /></label></div><div className="mt-5 flex justify-end gap-3 border-t-2 border-black pt-4"><button type="button" onClick={closeEdit} className="inline-flex items-center gap-2 rounded border-2 border-black bg-white px-5 py-2 font-bold"><X size={17} />Cancel</button><button type="button" disabled={editSaving} onClick={() => void saveEdit()} className="rounded bg-cyan-700 px-5 py-2 font-bold text-white disabled:opacity-60">Save</button></div></div></div>}</div>;
}
