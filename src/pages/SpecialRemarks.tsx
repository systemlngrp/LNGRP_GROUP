import { FormEvent, useMemo, useState } from "react";
import { CheckCircle2, RotateCcw, Save, Search, Trash2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Select } from "../components/Select";
import { useAuth } from "../auth/AuthContext";
import { useData } from "../hooks/useData";
import { useNpdItemsWithoutStock } from "../hooks/useNpdItems";
import type { SpecialRemarkRecord } from "../types";
import { groupSpecialRemarks } from "../lib/specialRemarks";
import { canManageMasterRecords } from "../lib/masterPermissions";
import { useTableSearch } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";
import { dateKey } from "../lib/jobCellColors";

const input = "w-full rounded border-2 border-black bg-white px-3 py-2";
const today = () => new Date().toISOString().slice(0, 10);
const text = (value: unknown) => String(value ?? "").trim();
const LABEL = "mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600";
const DATE_INPUT = "h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold";
const toOptions = (values: string[]) => values.map(value => ({ value, label: value }));

export function SpecialRemarkForm() {
  const { user } = useAuth(); const navigate = useNavigate(); const items = useNpdItemsWithoutStock(); const [, , , api] = useData<SpecialRemarkRecord>("special_remark_records", [], { firmScope: "all" });
  const displayName = text(user?.name || user?.userId || user?.email);
  const [form, setForm] = useState({ npdId: "", erpCode: "", itemName: "", specialRemarks: "", updatedBy: displayName, updateDate: today() });
  const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const options = useMemo(() => items.map((item: any) => ({ value: text(item.id), label: `${text(item.erp)} - ${text(item.name)}`, searchText: `${text(item.erp)} ${text(item.name)} ${text(item.customer)}` })).filter(option => option.value), [items]);
  const selectNpd = (npdId: string) => { const item = items.find((value: any) => text(value.id) === npdId) as any; setForm(current => ({ ...current, npdId, erpCode: text(item?.erp), itemName: text(item?.name) })); setError(""); };
  const reset = () => { setForm({ npdId: "", erpCode: "", itemName: "", specialRemarks: "", updatedBy: displayName, updateDate: today() }); setMessage(""); setError(""); };
  const save = async (event: FormEvent) => { event.preventDefault(); setError(""); setMessage(""); if (!form.npdId || !form.erpCode || !form.itemName || !form.specialRemarks.trim()) return setError("ERP/NPD and Special Remarks are required."); setSaving(true); try { await api.addItem({ ...form, id: crypto.randomUUID(), emailAddress: "", specialRemarks: form.specialRemarks.trim(), updateTimestamp: new Date().toISOString() }); navigate("/quality/special-remarks", { state: { message: "Special Remark saved successfully." } }); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Unable to save Special Remark."); } finally { setSaving(false); } };
  return <div className="mx-auto max-w-4xl space-y-5 pb-8"><div className="pb-2"><h2 className="text-xl font-bold uppercase">Special Remark Form</h2></div>{message && <div className="flex items-center gap-2 rounded border border-emerald-700 bg-emerald-100 p-3 font-bold text-emerald-900"><CheckCircle2 size={18}/>{message}</div>}{error && <div className="rounded border border-red-700 bg-red-100 p-3 font-bold text-red-900">{error}</div>}<form onSubmit={save} className="space-y-5"><section className="rounded border-2 border-black bg-white p-4"><div className="grid grid-cols-1 gap-4"><label className="space-y-1"><b>ERP Code / NPD *</b><Select value={form.npdId} onChange={selectNpd} options={options} placeholder="Search ERP or Item Name"/></label><label className="space-y-1"><b>Special Remarks *</b><textarea className={`${input} min-h-40`} value={form.specialRemarks} onChange={event => setForm(current => ({ ...current, specialRemarks: event.target.value }))}/></label></div></section><div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-end"><button type="submit" disabled={saving} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded bg-cyan-700 px-6 py-3 font-bold text-white disabled:cursor-wait disabled:opacity-60 sm:w-auto"><Save size={17}/>{saving ? "Saving..." : "Save"}</button><button type="button" onClick={reset} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded border-2 border-black bg-white px-6 py-3 font-bold sm:w-auto"><RotateCcw size={17}/>Clear</button></div></form></div>;
}

export function SpecialRemarkMaster() {
  const location = useLocation();
  const { user, hasAccess } = useAuth();
  const canManage = canManageMasterRecords(user?.role);
  const [records, setRecords, loading] = useData<SpecialRemarkRecord>("special_remark_records", [], { firmScope: "all" });
  const [search, setSearch] = useState("");
  const [erpFilter, setErpFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [updatedByFilter, setUpdatedByFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const navigationMessage = text((location.state as { message?: string } | null)?.message);
  const canDelete = canManage && (user?.role?.trim().toLowerCase() === "admin" || hasAccess("/quality/special-remarks"));

  const grouped = useMemo(() => groupSpecialRemarks(records), [records]);
  // Search the table columns: ERP Code, Item Name, Special Remarks, Updated By, Update Date.
  const searchedGroups = useTableSearch(grouped, search, group => [group.erpCode, group.itemName, group.specialRemarks, group.updatedBy, group.updateDate]);
  const visibleGroups = useMemo(() => {
    return searchedGroups
      .filter(group => (
        (!erpFilter || text(group.erpCode).toLowerCase() === erpFilter.toLowerCase()) &&
        (!itemFilter || group.records.some(record => text(record.itemName) === itemFilter)) &&
        (!updatedByFilter || group.records.some(record => text(record.updatedBy) === updatedByFilter)) &&
        (!(fromDate || toDate) || ((day: string) => Boolean(day) && (!fromDate || day >= fromDate) && (!toDate || day <= toDate))(dateKey(group.updateDate)))
      ))
      .sort((a, b) => text(a.erpCode).localeCompare(text(b.erpCode), undefined, { numeric: true }));
  }, [searchedGroups, erpFilter, itemFilter, updatedByFilter, fromDate, toDate]);

  const { sorted: sortedGroups, sort, toggle: toggleSort } = useTableSort(visibleGroups, (group, key) => (group as any)[key]);

  const options = useMemo(() => ({
    erps: [...new Set(records.map(record => text(record.erpCode)).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    items: [...new Set(records.map(record => text(record.itemName)).filter(Boolean))].sort(),
    users: [...new Set(records.map(record => text(record.updatedBy)).filter(Boolean))].sort(),
  }), [records]);

  const clearFilters = () => { setSearch(""); setErpFilter(""); setItemFilter(""); setUpdatedByFilter(""); setFromDate(""); setToDate(""); };
  const hasFilters = Boolean(search.trim() || erpFilter || itemFilter || updatedByFilter || fromDate || toDate);

  const handleDelete = async (group: ReturnType<typeof groupSpecialRemarks>[number]) => {
    if (!canDelete) return;
    setError("");
    setFeedback("");
    if (deletingKey !== group.key) {
      setDeletingKey(group.key);
      window.setTimeout(() => setDeletingKey(current => current === group.key ? null : current), 3000);
      return;
    }

    setDeletingKey(null);
    try {
      await setRecords(current => current.filter(record => !group.recordIds.includes(record.id)));
      setFeedback("Special Remark records deleted successfully.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete Special Remark records.");
    }
  };

  const message = feedback || navigationMessage;
  return <div className="space-y-5 pb-8"><div className="border-b border-black pb-3"><h2 className="text-xl font-bold uppercase tracking-tight text-black">Special Remark Master</h2></div>{message && <div className="rounded border border-emerald-700 bg-emerald-100 p-3 font-bold text-emerald-900">{message}</div>}{error && <div className="rounded border border-red-700 bg-red-100 p-3 font-bold text-red-900">{error}</div>}<div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3"><div className="relative w-full"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" placeholder="Search" value={search} onChange={event => setSearch(event.target.value)} className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600" /></div><div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6"><div className="min-w-0"><span className={LABEL}>ERP</span><Select compact value={erpFilter} onChange={setErpFilter} options={toOptions(options.erps)} placeholder="All" /></div><div className="min-w-0"><span className={LABEL}>Item</span><Select compact value={itemFilter} onChange={setItemFilter} options={toOptions(options.items)} placeholder="All" /></div><div className="min-w-0"><span className={LABEL}>Updated By</span><Select compact value={updatedByFilter} onChange={setUpdatedByFilter} options={toOptions(options.users)} placeholder="All" /></div><div data-date-pair="true" className="col-span-2 grid min-w-0 grid-cols-2 gap-2"><label className="min-w-0"><span className={LABEL}>Update From Date</span><input type="date" value={fromDate} max={toDate || undefined} onChange={event => setFromDate(event.target.value)} className={DATE_INPUT} /></label><label className="min-w-0"><span className={LABEL}>Update To Date</span><input type="date" value={toDate} min={fromDate || undefined} onChange={event => setToDate(event.target.value)} className={DATE_INPUT} /></label></div></div><div data-mf-actions="true" className="flex justify-end gap-2">{hasFilters ? <button type="button" onClick={clearFilters} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button> : null}<button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button></div></div><div className="overflow-x-auto rounded border border-black bg-white"><table className="min-w-[1050px] w-full border-collapse text-sm"><thead className="bg-cyan-800 text-white"><tr>{([["ERP Code", "erpCode"], ["Item Name", "itemName"], ["Special Remarks", "specialRemarks"], ["Updated By", "updatedBy"], ["Update Date", "updateDate"], ["Actions", ""]] as const).map(([header, key]) => <th key={header} className="border border-black p-2 text-left">{key ? <SortHeader label={header} sortKey={key} sort={sort} onToggle={toggleSort} /> : header}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={6} className="p-6 text-center">Loading...</td></tr> : sortedGroups.length ? sortedGroups.map(group => <tr key={group.key}><td className="border border-black p-2 font-bold">{group.erpCode}</td><td className="border border-black p-2">{group.itemName}</td><td className="whitespace-pre-wrap border border-black p-2">{group.specialRemarks}</td><td className="border border-black p-2">{group.updatedBy || "-"}</td><td className="border border-black p-2">{group.updateDate || "-"}</td><td className="whitespace-nowrap border border-black p-2 text-center">{canDelete ? <button type="button" onClick={() => void handleDelete(group)} className={`${deletingKey === group.key ? "animate-pulse text-amber-600" : "text-red-600"} inline-flex items-center gap-1 font-bold hover:text-red-900`} title={deletingKey === group.key ? "Confirm delete" : "Delete"} aria-label={deletingKey === group.key ? "Confirm delete" : "Delete"}><Trash2 size={16}/>{deletingKey === group.key ? "Confirm?" : "Delete"}</button> : "-"}</td></tr>) : <tr><td colSpan={6} className="h-16" aria-label="No records" /></tr>}</tbody></table></div></div>;
}
