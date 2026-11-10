import { useMemo, useState } from "react";
import { Edit, ExternalLink, Plus, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useData } from "../hooks/useData";
import { useNpdItemsWithoutStock } from "../hooks/useNpdItems";
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
  const items = useNpdItemsWithoutStock();
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
  return <div className="mx-auto max-w-7xl space-y-5 pb-8 text-black"><div className="flex items-center justify-between border-b border-black pb-3"><div><h2 className="text-xl font-bold uppercase">PDI Form</h2></div></div>{message && <div className="rounded border-2 border-black bg-amber-100 p-3 font-bold">{message}</div>}<section className="rounded border-2 border-black bg-white p-4"><h3 className="mb-4 bg-cyan-800 p-3 font-bold uppercase text-white">Job Information</h3><div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"><label className="flex h-full flex-col gap-1"><b>Job No. *</b><Select value={form.productionId} onChange={selectJob} options={jobOptions} placeholder="Select Job No." compact={false} /></label>{readOnlyFields.map(([label, key]) => <label key={key} className="flex h-full flex-col gap-1"><b>{label}</b><input className={`${jobInformationInput} bg-gray-400`} type="text" inputMode={numericJobFields.has(key) ? "decimal" : undefined} aria-invalid={numericJobFields.has(key) && !isPositiveDecimal(form[key])} readOnly={!unlockedNumericJobFields.has(key)} value={String(form[key] ?? "")} onChange={event => update(key, event.target.value)} /></label>)}</div></section><section className="rounded border-2 border-black bg-white p-4"><h3 className="mb-4 bg-cyan-800 p-3 font-bold uppercase text-white">PDI Form Columns</h3><div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">{editableFields.map(([label, key]) => <label key={key} className="flex h-full flex-col gap-1"><b>{label}</b><input className={input} type="text" inputMode="decimal" aria-invalid={text(form[key]) ? !isPositiveDecimal(form[key]) : undefined} value={String(form[key] ?? "")} onChange={event => update(key, event.target.value)} /></label>)}{checks.map(key => <label key={key} className="flex h-full flex-col gap-1"><b>{checkLabels[key]}</b><Select value={text(form[key])} onChange={value => update(key, value)} options={[{ value: "OK", label: "OK" }, { value: "NOT OK", label: "NOT OK" }]} placeholder="Select result" compact={false} /></label>)}<label className="flex h-full flex-col gap-1"><b>QC Person *</b><Select value={text(form.qcPerson)} onChange={value => update("qcPerson", value)} options={personOptions} placeholder="Select QC Person" compact={false} /></label><label className="flex h-full flex-col gap-1"><b>Box Photo Front</b><input className={input} type="file" accept="image/*" onChange={event => void upload("frontPhoto", event.target.files?.[0])} /></label><label className="flex h-full flex-col gap-1"><b>Box Photo Back</b><input className={input} type="file" accept="image/*" onChange={event => void upload("backPhoto", event.target.files?.[0])} /></label><label className="flex h-full flex-col gap-1"><b>Remarks</b><textarea className={`${input} min-h-16`} value={text(form.remarks)} onChange={event => update("remarks", event.target.value)} /></label></div></section><div className="flex w-full items-center justify-end gap-3 border-t-2 border-black pt-4"><button type="button" onClick={() => navigate("/quality/pre-dispatch-inspection")} className="inline-flex h-12 min-w-32 items-center justify-center gap-2 rounded border-2 border-black bg-white px-5 font-bold"><X size={17} />Cancel</button><button type="button" disabled={saving} onClick={() => void save()} className="inline-flex h-12 min-w-40 items-center justify-center gap-2 rounded bg-cyan-700 px-5 font-bold disabled:opacity-60">Save</button></div></div>;
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
  const tile = (label: string, value: number, tone: string) => <div className={"rounded-lg border-2 border-black p-3 " + tone}><div className="text-[11px] font-black uppercase">{label}</div><div className="text-xl font-black tabular-nums">{value}</div></div>;
  // The list itself (this part was missing, so PDI Master showed a blank page).
  const optionsFor = (values: unknown[]) => opts(values.map(text));
  const firmOptions = firms.filter(f => records.some(r => r.firmId === f.id)).map(f => ({ value: f.id, label: text(f.shortName) || text(f.firmName) }));
  const anyFilter = Object.values(filters).some(value => text(value));
  const sorted = [...filtered].sort((a, b) => text(b.updateTimestamp || b.inspectionDate).localeCompare(text(a.updateTimestamp || a.inspectionDate)));
  const firmLabel = (r: Inspection) => { const firm = firms.find(f => f.id === r.firmId); return firm ? (text(firm.shortName) || text(firm.firmName)) : (text(r.firmName) || "-"); };
  const cell = "border border-black px-2 py-1.5 text-sm";
  const resultTone = (value: string) => value === "QC PASS" ? "bg-emerald-100 text-emerald-800 border-emerald-300" : value === "QC FAIL" ? "bg-red-100 text-red-700 border-red-300" : "bg-amber-50 text-amber-900 border-amber-300";
  return (
    <div className="space-y-4 text-black">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold uppercase tracking-tight">PDI Master</h2>
        <button type="button" onClick={() => navigate("/quality/pre-dispatch-inspection/form")} title="New PDI" aria-label="New PDI" className="inline-flex items-center gap-1 rounded bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700"><Plus size={15} /> New PDI</button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {tile("Total", tiles.total, "bg-indigo-50 text-indigo-900")}
        {tile("Pending", tiles.pending, "bg-amber-50 text-amber-900")}
        {tile("QC Pass", tiles.pass, "bg-emerald-50 text-emerald-900")}
        {tile("QC Fail", tiles.fail, "bg-rose-50 text-rose-900")}
        {tile("Today", tiles.today, "bg-sky-50 text-sky-900")}
      </div>

      <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
        <div className="relative w-full">
          <input type="text" placeholder="Search" value={filters.search} onChange={e => setFilter("search", e.target.value)} className="w-full rounded border-2 border-black bg-white px-3 py-2 text-sm focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600" />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Firm</span><Select value={filters.firmId} onChange={value => setFilter("firmId", value)} options={firmOptions} placeholder="All" compact /></div>
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Job No.</span>{filter("jobNo", "All", optionsFor(records.map(r => r.jobNo)))}</div>
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">ERP</span>{filter("erpCode", "All", optionsFor(records.map(r => r.erpCode)))}</div>
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Party</span>{filter("partyName", "All", optionsFor(records.map(r => r.partyName)))}</div>
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Item</span>{filter("itemName", "All", optionsFor(records.map(r => r.itemName)))}</div>
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Result</span>{filter("result", "All", [{ value: "Pending", label: "Pending" }, { value: "QC PASS", label: "QC PASS" }, { value: "QC FAIL", label: "QC FAIL" }])}</div>
          <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">QC Person</span>{filter("qcPerson", "All", optionsFor(records.map(r => r.qcPerson)))}</div>
          <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">Date</span><input type="date" value={filters.date} onChange={e => setFilter("date", e.target.value)} className="h-[34px] w-full rounded border-2 border-black px-2 text-xs font-semibold" /></label>
        </div>
        <div data-mf-actions="true" className="flex justify-end gap-2">
          {anyFilter ? <button type="button" onClick={() => setFilters({ search: "", firmId: "", jobNo: "", erpCode: "", partyName: "", itemName: "", result: "", qcPerson: "", date: "" })} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold hover:bg-slate-100">Clear</button> : null}
          <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
        </div>
      </div>

      {loading && records.length === 0 ? <div className="rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-600">Loading...</div> : null}

      <div className="overflow-x-auto rounded border border-black bg-white">
        <table className="min-w-full border-collapse">
          <thead className="bg-slate-100 text-xs font-bold uppercase">
            <tr>{headers.filter(h => h !== "Actions" || canManage).map(h => <th key={h} className="border border-black px-2 py-2">{h}</th>)}</tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan={canManage ? headers.length : headers.length - 1} className="h-16" aria-label="No records" /></tr>
            ) : sorted.map(r => {
              const result = inspectionResult(r, productions, items);
              return (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className={cell + " font-bold"}>{r.jobNo || "-"}</td>
                  <td className={cell}>{text(r.inspectionDate).slice(0, 10) ? text(r.inspectionDate).slice(0, 10).split("-").reverse().join("-") : "-"}</td>
                  <td className={cell}>{formatTimestamp(r.inspectionDate) || "-"}</td>
                  <td className={cell}>{firmLabel(r)}</td>
                  <td className={cell}>{r.erpCode || "-"}</td>
                  <td className={cell}>{r.partyName || "-"}</td>
                  <td className={cell + " min-w-[200px] max-w-[300px] whitespace-normal break-words"}>{r.itemName || "-"}</td>
                  <td className={cell}>{r.plannedQty ?? "-"}</td>
                  <td className={cell}>{r.lotNo || "-"}</td>
                  <td className={cell}>{text(r.csRequired) || "-"}</td>
                  <td className={cell}>{text(csStandardForRecord(r)) || "-"}</td>
                  <td className={cell}>{text(r.lengthId) || "-"}</td>
                  <td className={cell}>{text(r.widthId) || "-"}</td>
                  <td className={cell}>{text(r.heightId) || "-"}</td>
                  <td className={cell}>{text(r.csAchieved) || "-"}</td>
                  <td className={cell}>{text(r.gsmAchieved) || "-"}</td>
                  <td className={cell}>{text(r.boxWeightGrams) || "-"}</td>
                  {checks.map(check => <td key={check} className={cell}>{text(r[check]) || "-"}</td>)}
                  <td className={cell}>{photoCell(r.frontPhoto)}</td>
                  <td className={cell}>{photoCell(r.backPhoto)}</td>
                  <td className={cell}><span className={"inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold " + resultTone(result)}>{result}</span></td>
                  <td className={cell}>{r.qcPerson || "-"}</td>
                  <td className={cell + " min-w-[160px] whitespace-normal break-words"}>{r.remarks || "-"}</td>
                  <td className={cell}>{r.updatedBy || "-"}</td>
                  <td className={cell}>{formatTimestamp(r.updateTimestamp) || "-"}</td>
                  {canManage ? <td className={cell + " text-center"}><button type="button" onClick={() => openEdit(r)} title="Edit" aria-label="Edit" className="inline-flex h-8 w-8 items-center justify-center rounded-md border-2 border-blue-600 bg-white text-blue-600 hover:bg-blue-50"><Edit size={14} /></button></td> : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editingRow ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-xl border-2 border-black bg-white shadow-2xl sm:rounded-xl">
            <div className="flex items-center justify-between border-b-2 border-black px-4 py-3">
              <div className="text-base font-black">Edit PDI — {editingRow.jobNo}</div>
              <button type="button" onClick={closeEdit} aria-label="Close" className="inline-flex h-9 w-9 items-center justify-center rounded-md border-2 border-black bg-white"><X size={18} /></button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {readOnlyEditFields.map(([label, key]) => <label key={key} className="space-y-1"><span className="text-xs font-bold">{label}</span><input value={text((editForm as any)[key])} readOnly className={jobInformationInput + " bg-slate-50"} /></label>)}
                {editFields.map(([label, key]) => <label key={key} className="space-y-1"><span className="text-xs font-bold">{label}</span><input value={text((editForm as any)[key])} onChange={e => updateEdit(key, e.target.value)} inputMode="decimal" className={input} /></label>)}
                {checks.map(check => <label key={check} className="space-y-1"><span className="text-xs font-bold">{checkLabels[check]} *</span><Select value={text(editForm[check])} onChange={value => updateEdit(check, value)} options={[{ value: "OK", label: "OK" }, { value: "NOT OK", label: "NOT OK" }]} placeholder="Select" /></label>)}
                <label className="space-y-1"><span className="text-xs font-bold">QC Person *</span><Select value={text(editForm.qcPerson)} onChange={value => updateEdit("qcPerson", value)} options={qcPersonOptions(activePeople)} placeholder="Select" /></label>
                <label className="space-y-1"><span className="text-xs font-bold">Box Photo Front *</span><input type="file" accept="image/*" onChange={e => void uploadEdit("frontPhoto", e.target.files?.[0])} className={input} />{text(editForm.frontPhoto) ? <span className="text-xs">{photoCell(editForm.frontPhoto)}</span> : null}</label>
                <label className="space-y-1"><span className="text-xs font-bold">Box Photo Back *</span><input type="file" accept="image/*" onChange={e => void uploadEdit("backPhoto", e.target.files?.[0])} className={input} />{text(editForm.backPhoto) ? <span className="text-xs">{photoCell(editForm.backPhoto)}</span> : null}</label>
                <label className="col-span-2 space-y-1 md:col-span-3"><span className="text-xs font-bold">Remarks *</span><textarea value={text(editForm.remarks)} onChange={e => updateEdit("remarks", e.target.value)} className={input} rows={2} /></label>
              </div>
              {editMessage ? <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{editMessage}</div> : null}
            </div>
            <div className="border-t-2 border-black px-4 py-3">
              <button type="button" onClick={() => void saveEdit()} disabled={editSaving} className="w-full rounded bg-black px-6 py-3 text-sm font-black uppercase tracking-widest text-white disabled:opacity-40">{editSaving ? "Saving..." : "Update"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
