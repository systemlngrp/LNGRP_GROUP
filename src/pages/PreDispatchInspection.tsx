import { useMemo, useState } from "react";
import { Edit, ExternalLink, Plus, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useData } from "../hooks/useData";
import { useNpdItems } from "../hooks/useNpdItems";
import { Select } from "../components/Select";
import type { Firm, Item, Order, OrderSchedule, Production, PreDispatchInspection as Inspection, User } from "../types";
import { isActiveQcPerson, qcPersonOptions } from "../utils/qcPeople";
import { inspectionDraftForJob, invalidInspectionNumberField, isPositiveDecimal } from "../lib/inspectionNumbers";
import { normalizeQcResult } from "../lib/jobCellColors";
import { canManageMasterRecords } from "../lib/masterPermissions";
import { derivePdiResult, resolveCsStandard } from "../lib/pdiResult";

const input = "w-full rounded border-2 border-black bg-white px-3 py-2";
const jobInformationInput = "w-full rounded border-2 border-black px-3 py-2 text-gray-900";
const numericJobFields = new Set<keyof Inspection>(["plannedQty"]);
const text = (v: unknown) => String(v ?? "").trim();
const checks = ["printingArtworkCheck", "printingColorCheck", "boxSquaringCheck", "flapGapCheck", "jointPastingDelaminationCheck"] as const;
const checkLabels: Record<typeof checks[number], string> = { printingArtworkCheck: "Printing Artwork", printingColorCheck: "Printing Color", boxSquaringCheck: "Box Squaring", flapGapCheck: "Flap Gap", jointPastingDelaminationCheck: "Joint Pasting / Delamination" };
type Form = Partial<Inspection> & { productionId: string; jobNo: string };
type PdiItem = Item & { csKgStd?: number | string };
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
const formatTimestamp = (value: unknown) => {
  const raw = text(value);
  if (!raw) return "";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleString();
};
const inspectionItem = (record: Inspection, productions: Production[], items: Item[]) => {
  const production = productions.find(value => value.id === record.productionId);
  return (items as PdiItem[]).find(value =>
    String(value.id) === String(production?.itemId || production?.npdId) ||
    String(value.erp) === String(production?.erpCode || production?.masterErp || record.erpCode),
  );
};
const inspectionCsStandard = (record: Inspection, productions: Production[], items: Item[]) => resolveCsStandard(inspectionItem(record, productions, items)?.csKgStd, record.csRequired);
const inspectionResult = (record: Inspection, productions: Production[], items: Item[]) => derivePdiResult(record, inspectionCsStandard(record, productions, items));

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
    const old = records.find(r => r.productionId === form.productionId || r.jobNo === form.jobNo);
    const production = productions.find(value => value.id === form.productionId);
    const selectedItem = (items as PdiItem[]).find(value =>
      String(value.id) === String(production?.itemId || production?.npdId) ||
      String(value.erp) === String(production?.erpCode || production?.masterErp || form.erpCode),
    );
    const csStandard = resolveCsStandard(selectedItem?.csKgStd, form.csRequired);
    const item: Inspection = { ...form, id: old?.id || `PDI-${Date.now()}`, result: derivePdiResult(form, csStandard), inspectionDate: form.inspectionDate || new Date().toISOString(), updatedBy: "System User", updateTimestamp: new Date().toISOString() } as Inspection; setSaving(true); try { if (old) await api.saveItem(item); else await api.addItem(item); navigate("/quality/pre-dispatch-inspection", { state: { message: "Pre-Dispatch Inspection saved successfully." } }); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save inspection."); } finally { setSaving(false); }
  };
  const readOnlyFields = [["Firm *", "firmName"], ["ERP *", "erpCode"], ["Party Name *", "partyName"], ["Item Name *", "itemName"], ["Planned Quantity *", "plannedQty"]] as const;
  const editableFields = [["Length (ID) *", "lengthId"], ["Width (ID) *", "widthId"], ["Height (ID) *", "heightId"], ["CS Achieved *", "csAchieved"], ["GSM Achieved *", "gsmAchieved"], ["Box Weight (Grams) *", "boxWeightGrams"]] as const;
  return <div className="mx-auto max-w-7xl space-y-5 pb-8 text-black"><div className="flex items-center justify-between border-b border-black pb-3"><div><h2 className="text-xl font-bold uppercase">Pre-Dispatch Inspection Form</h2></div></div>{message && <div className="rounded border-2 border-black bg-amber-100 p-3 font-bold">{message}</div>}<section className="rounded border-2 border-black bg-white p-4"><h3 className="mb-4 bg-cyan-800 p-3 font-bold uppercase text-white">Job Information</h3><div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"><label className="flex h-full flex-col gap-1"><b>Job No. *</b><Select value={form.productionId} onChange={selectJob} options={jobOptions} placeholder="Select Job No." compact={false} /></label>{readOnlyFields.map(([label, key]) => <label key={key} className="flex h-full flex-col gap-1"><b>{label}</b><input className={`${jobInformationInput} bg-gray-400`} type="text" inputMode={numericJobFields.has(key) ? "decimal" : undefined} aria-invalid={numericJobFields.has(key) && !isPositiveDecimal(form[key])} readOnly={!unlockedNumericJobFields.has(key)} value={String(form[key] ?? "")} onChange={event => update(key, event.target.value)} /></label>)}</div></section><section className="rounded border-2 border-black bg-white p-4"><h3 className="mb-4 bg-cyan-800 p-3 font-bold uppercase text-white">PDI Form Columns</h3><div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">{editableFields.map(([label, key]) => <label key={key} className="flex h-full flex-col gap-1"><b>{label}</b><input className={input} type="text" inputMode="decimal" aria-invalid={text(form[key]) ? !isPositiveDecimal(form[key]) : undefined} value={String(form[key] ?? "")} onChange={event => update(key, event.target.value)} /></label>)}{checks.map(key => <label key={key} className="flex h-full flex-col gap-1"><b>{checkLabels[key]}</b><Select value={text(form[key])} onChange={value => update(key, value)} options={[{ value: "OK", label: "OK" }, { value: "NOT OK", label: "NOT OK" }]} placeholder="Select result" compact={false} /></label>)}<label className="flex h-full flex-col gap-1"><b>QC Person *</b><Select value={text(form.qcPerson)} onChange={value => update("qcPerson", value)} options={personOptions} placeholder="Select QC Person" compact={false} /></label><label className="flex h-full flex-col gap-1"><b>Box Photo Front</b><input className={input} type="file" accept="image/*" onChange={event => void upload("frontPhoto", event.target.files?.[0])} /></label><label className="flex h-full flex-col gap-1"><b>Box Photo Back</b><input className={input} type="file" accept="image/*" onChange={event => void upload("backPhoto", event.target.files?.[0])} /></label><label className="flex h-full flex-col gap-1"><b>Remarks</b><textarea className={`${input} min-h-16`} value={text(form.remarks)} onChange={event => update("remarks", event.target.value)} /></label></div></section><div className="flex w-full items-center justify-end gap-3 border-t-2 border-black pt-4"><button type="button" onClick={() => navigate("/quality/pre-dispatch-inspection")} className="inline-flex h-12 min-w-32 items-center justify-center gap-2 rounded border-2 border-black bg-white px-5 font-bold"><X size={17} />Cancel</button><button type="button" disabled={saving} onClick={() => void save()} className="inline-flex h-12 min-w-40 items-center justify-center gap-2 rounded bg-cyan-700 px-5 font-bold disabled:opacity-60">Save</button></div></div>;
}

export function PreDispatchInspection() {
  const { user } = useAuth();
  const canManage = canManageMasterRecords(user?.role);
  const navigate = useNavigate();
  const { records, loading, people, firms, api, items, productions } = useInspectionData();
  const [filters, setFilters] = useState({ search: "", firmId: "", jobNo: "", erpCode: "", partyName: "", itemName: "", result: "", qcPerson: "", date: "" });
  const [editingRow, setEditingRow] = useState<Inspection | null>(null);
  const [editForm, setEditForm] = useState<Partial<Inspection>>({});
  const [editMessage, setEditMessage] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const activePeople = people.filter(isActiveQcPerson);
  const filtered = useMemo(() => records.filter(r => { const q = filters.search.toLowerCase().trim(); const hay = String(r.jobNo + " " + r.erpCode + " " + r.partyName + " " + r.itemName + " " + r.qcPerson + " " + r.remarks).toLowerCase(); return (!q || hay.includes(q)) && (!filters.firmId || r.firmId === filters.firmId) && (!filters.jobNo || r.jobNo === filters.jobNo) && (!filters.erpCode || r.erpCode === filters.erpCode) && (!filters.partyName || r.partyName === filters.partyName) && (!filters.itemName || r.itemName === filters.itemName) && (!filters.result || inspectionResult(r, productions, items) === filters.result) && (!filters.qcPerson || r.qcPerson === filters.qcPerson) && (!filters.date || text(r.inspectionDate).slice(0, 10) === filters.date); }), [items, productions, records, filters]);
  const setFilter = (key: string, value: string) => setFilters(current => ({ ...current, [key]: value }));
  const filter = (key: keyof typeof filters, label: string, options: { value: string; label: string }[]) => <Select value={filters[key]} onChange={value => setFilter(key, value)} options={options} placeholder={label} compact />;
  const today = new Date().toISOString().slice(0, 10); const tiles = { total: filtered.length, pending: filtered.filter(r => inspectionResult(r, productions, items) === "Pending").length, pass: filtered.filter(r => inspectionResult(r, productions, items) === "QC PASS").length, fail: filtered.filter(r => inspectionResult(r, productions, items) === "QC FAIL").length, today: filtered.filter(r => text(r.inspectionDate).slice(0, 10) === today).length };
  const headers = ["Job No.", "Date", "Inspection Timestamp", "Firm", "ERP", "Party", "Item", "Planned Quantity", "Lot No.", "CS Required", "CS Standard", "Length (ID)", "Width (ID)", "Height (ID)", "CS Actual", "GSM Achieved", "Box Weight (Grams)", "Printing Artwork Check", "Printing Color Check", "Box Squaring Check", "Flap Gap Check", "Joint Pasting / Delamination Check", "Box Photo Front", "Box Photo Back", "Result", "QC Person", "Remarks", "Updated By", "Updated At", "Actions"];
  const csStandardForRecord = (record: Inspection) => inspectionCsStandard(record, productions, items as Item[]);
  const photoCell = (value: unknown) => {
    const raw = text(value);
    if (!raw) return "-";
    const href = /^https?:\/\//i.test(raw) || raw.startsWith("/uploads/") ? raw : "/uploads/" + raw.replace(/^\/?uploads\//i, "");
    return <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-700 underline">Open <ExternalLink size={12} /></a>;
  };
  const openEdit = (record: Inspection) => { setEditingRow(record); setEditForm({ ...record }); setEditMessage(""); };
  const updateEdit = (key: string, value: unknown) => setEditForm(current => ({ ...current, [key]: value }));
  const closeEdit = () => { setEditingRow(null); setEditForm({}); setEditMessage(""); };
  const uploadEdit = async (key: "frontPhoto" | "backPhoto", file?: File) => { if (!file) return; const reader = new FileReader(); reader.onload = async () => { try { const response = await fetch("/api/upload-artwork", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: file.name, base64: reader.result }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Upload failed"); updateEdit(key, result.filename); } catch (error) { setEditMessage(error instanceof Error ? error.message : "Photo upload failed."); } }; reader.readAsDataURL(file); };
  const saveEdit = async () => { if (!editingRow) return; const jobFields: Array<[string, unknown]> = [["Firm", editForm.firmName], ["ERP", editForm.erpCode], ["Party Name", editForm.partyName], ["Item Name", editForm.itemName]]; const missingJob = jobFields.find(([, value]) => !text(value)); if (missingJob) return setEditMessage(missingJob[0] + " is required."); const invalidNumber = invalidInspectionNumberField(editForm); if (invalidNumber) return setEditMessage(invalidNumber + " must be a number greater than zero (without units)."); const missingCheck = checks.find(check => !text(editForm[check])); if (missingCheck) return setEditMessage(checkLabels[missingCheck] + " is required."); if (!text(editForm.qcPerson)) return setEditMessage("QC Person is required."); if (!text(editForm.frontPhoto)) return setEditMessage("Box Photo Front is required."); if (!text(editForm.backPhoto)) return setEditMessage("Box Photo Back is required."); if (!text(editForm.remarks)) return setEditMessage("Remarks are required."); const updated: Inspection = { ...editingRow, ...editForm, id: editingRow.id, inspectionDate: editingRow.inspectionDate, result: derivePdiResult(editForm, csStandardForRecord(editingRow)), updatedBy: "System User", updateTimestamp: new Date().toISOString() } as Inspection; setEditSaving(true); try { await api.saveItem(updated); closeEdit(); } catch (error) { setEditMessage(error instanceof Error ? error.message : "Unable to save inspection."); } finally { setEditSaving(false); } };
  const readOnlyEditFields = [["Job No.", "jobNo"], ["Firm *", "firmName"], ["ERP *", "erpCode"], ["Party Name *", "partyName"], ["Item Name *", "itemName"], ["Planned Quantity *", "plannedQty"]] as const;
  const editFields = [["Length (ID) *", "lengthId"], ["Width (ID) *", "widthId"], ["Height (ID) *", "heightId"], ["CS Achieved *", "csAchieved"], ["GSM Achieved *", "gsmAchieved"], ["Box Weight (Grams) *", "boxWeightGrams"]] as const;
  const tile = (label: string, value: number, tone: string) => <div className={"rounded border-2 border-black p-3 " + tone}><div className="text-xs font-bold uppercase">{label}</div><div className="text-2xl font-black">{value}</div></div>;
}
