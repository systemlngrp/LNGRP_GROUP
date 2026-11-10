import { useMemo, useState } from "react";
import { getFirmDisplayName } from "../lib/firmDisplay";
import { Plus, Search, X } from "lucide-react";
import { useData } from "../hooks/useData";
import { Select } from "../components/Select";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { resolvePhpPlateFirmId } from "../lib/phpPlateFirm";
import { SortHeader, useTableSort } from "../lib/tableSort";
import type { Firm, Order, OrderSchedule, PhpPlateInOutRecord, Production } from "../types";

const input = "w-full rounded border-2 border-black bg-white px-3 py-2 text-sm";
const clean = (v: unknown) => String(v ?? "").trim();
const values = (items: string[]) => [...new Set(items.filter(Boolean))].sort().map(value => ({ value, label: value }));
const normalizeErp = (value: unknown) => clean(value).toLowerCase();

type ErpMapping = { erpCode: string; masterErp: string; source: "PHP" | "PLATE" };

function firstValue(...valuesToCheck: unknown[]) {
  return valuesToCheck.map(clean).find(Boolean) || "";
}

function getItemMapping(item: any, source: "PHP" | "PLATE"): ErpMapping | undefined {
  const raw = item?.raw || item;
  const erpCode = firstValue(item?.erp, raw?.erp, raw?.erpCode, raw?.erpItemCode);
  const masterErp = firstValue(item?.masterErp, raw?.masterErp, raw?.masterErpCode, raw?.masterItemNameErpCode);
  return erpCode && masterErp ? { erpCode, masterErp, source } : undefined;
}

function getJobMapping(job: any, source: "PHP" | "PLATE"): ErpMapping | undefined {
  const raw = job?.raw || job;
  const erpCode = firstValue(job?.erpCode, job?.erp, job?.itemErp, raw?.erpCode, raw?.erp, raw?.erpItemCode);
  const masterErp = firstValue(job?.masterErp, raw?.masterErp, raw?.masterErpCode, raw?.masterItemNameErpCode);
  return erpCode && masterErp ? { erpCode, masterErp, source } : undefined;
}

type Filters = { search: string; erpCode: string; masterBoxErp: string; firmId: string; source: string; action: string; location: string; zone: string; fromDate: string; toDate: string };
const emptyFilters: Filters = { search: "", erpCode: "", masterBoxErp: "", firmId: "", source: "", action: "", location: "", zone: "", fromDate: "", toDate: "" };

export function PhpPlateInOut() {
  const [records, , loading, api] = useData<PhpPlateInOutRecord>("php_plate_in_out_records", [], { firmScope: "all" });
  const [phpItems] = useData<any>("php_item_master", [], { firmScope: "all" });
  const [plateItems] = useData<any>("plate_item_master", [], { firmScope: "all" });
  const [phpJobs] = useData<Production>("php_job_master", [], { firmScope: "all" });
  const [plateJobs] = useData<Production>("plate_job_master", [], { firmScope: "all" });
  const [schedules] = useData<OrderSchedule>("orders_schedule", [], { firmScope: "all" });
  const [orders] = useData<Order>("orders", [], { firmScope: "all" });
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const [showForm, setShowForm] = useState(false);
  const [erpCode, setErpCode] = useState(""); const [masterBoxErp, setMasterBoxErp] = useState("");
  const [action, setAction] = useState<"IN" | "OUT">("IN"); const [location, setLocation] = useState(""); const [zone, setZone] = useState(""); const [quantity, setQuantity] = useState(""); const [message, setMessage] = useState("");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const mappings = useMemo(() => {
    const rows = [
      ...phpItems.map((item: any) => getItemMapping(item, "PHP")),
      ...plateItems.map((item: any) => getItemMapping(item, "PLATE")),
      ...phpJobs.map((job: any) => getJobMapping(job, "PHP")),
      ...plateJobs.map((job: any) => getJobMapping(job, "PLATE")),
    ].filter((row): row is ErpMapping => Boolean(row));
    const unique = new Map<string, ErpMapping>();
    rows.forEach(row => unique.set(`${normalizeErp(row.erpCode)}|${normalizeErp(row.masterErp)}|${row.source}`, row));
    return [...unique.values()];
  }, [phpItems, plateItems, phpJobs, plateJobs]);
  const masterOptions = useMemo(() => values(mappings.map(row => row.masterErp)), [mappings]);
  const matchingMasterMappings = useMemo(() => mappings.filter(row => normalizeErp(row.masterErp) === normalizeErp(masterBoxErp)), [mappings, masterBoxErp]);
  const selectedErpMappings = useMemo(() => mappings.filter(row => normalizeErp(row.erpCode) === normalizeErp(erpCode)), [mappings, erpCode]);
  const erpOptions = useMemo(() => {
    const options = new Map<string, { value: string; label: string; searchText: string }>();
    mappings.forEach(row => options.set(`erp:${normalizeErp(row.erpCode)}`, { value: row.erpCode, label: `${row.erpCode} (${row.source})`, searchText: `${row.erpCode} ${row.masterErp} ${row.source}` }));
    return [...options.values()].sort((a, b) => a.value.localeCompare(b.value));
  }, [mappings]);
  const firmForErp = useMemo(() => { const jobs = [...phpJobs, ...plateJobs]; const job = jobs.find(j => normalizeErp((j as any).erpCode || (j as any).erp || (j as any).itemErp) === normalizeErp(erpCode)); const id = job ? resolvePhpPlateFirmId(job, schedules, orders) : ""; return firms.find(f => f.id === id); }, [erpCode, phpJobs, plateJobs, schedules, orders, firms]);
  const handleErpChange = (value: string) => {
    setMessage("");
    setErpCode(value);
    const relatedMasters = [...new Set(mappings.filter(row => normalizeErp(row.erpCode) === normalizeErp(value)).map(row => row.masterErp))];
    setMasterBoxErp(relatedMasters.length === 1 ? relatedMasters[0] : "");
    if (value && relatedMasters.length > 1) setMessage("This ERP is linked to multiple Master ERP values. Select the correct Master ERP.");
  };
  const handleMasterChange = (value: string) => {
    setMessage("");
    setMasterBoxErp(value);
    const relatedErps = [...new Set(mappings.filter(row => normalizeErp(row.masterErp) === normalizeErp(value)).map(row => row.erpCode))];
    setErpCode(relatedErps.length === 1 ? relatedErps[0] : "");
    if (value && relatedErps.length > 1) setMessage(`Master ERP ${value} is linked to multiple PHP/Plate ERP codes. Select one concrete ERP.`);
  };
  const resetForm = () => { setErpCode(""); setMasterBoxErp(""); setAction("IN"); setLocation(""); setZone(""); setQuantity(""); setMessage(""); };
  const openForm = () => { resetForm(); setShowForm(true); };
  const save = async () => {
    setMessage(""); const qty = Number(quantity); if (!erpCode || !quantity || !Number.isFinite(qty) || qty <= 0) return setMessage("Select a PHP/Plate ERP and enter a quantity greater than zero.");
    if (!masterBoxErp) return setMessage("Select a Master ERP linked to the PHP/Plate ERP.");
    if (!selectedErpMappings.some(row => normalizeErp(row.masterErp) === normalizeErp(masterBoxErp))) return setMessage("The selected ERP and Master ERP are not linked.");
    const key = (r: PhpPlateInOutRecord) => `${r.erpCode}|${r.masterBoxErp || ""}|${r.firmId || ""}|${r.location || ""}|${r.zone || ""}`;
    const current = records.filter(r => key(r) === `${erpCode}|${masterBoxErp}|${firmForErp?.id || ""}|${location}|${zone}`).reduce((sum, r) => sum + (r.action === "IN" ? Number(r.quantity) : -Number(r.quantity)), 0);
    if (action === "OUT" && qty > current) return setMessage(`OUT quantity cannot exceed the available balance (${current}).`);
    const row: PhpPlateInOutRecord = { id: `PHP-PLATE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, firmId: firmForErp?.id, firmName: firmForErp?.firmName, erpCode, masterBoxErp: masterBoxErp.trim(), action, location: location.trim(), zone: zone.trim(), quantity: qty, balance: current + (action === "IN" ? qty : -qty), updatedBy: "System User", updateTimestamp: new Date().toISOString() };
    try { await api.addItem(row); setShowForm(false); resetForm(); } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to save transaction."); }
  };
  const setFilter = (key: keyof Filters, value: string) => setFilters(current => ({ ...current, [key]: value }));
  const sourcesByErp = useMemo(() => { const map = new Map<string, Set<string>>(); mappings.forEach(row => { const key = normalizeErp(row.erpCode); const set = map.get(key) || new Set<string>(); set.add(row.source); map.set(key, set); }); return map; }, [mappings]);
  const firmFilterOptions = useMemo(() => { const ids = new Set(records.map(r => clean(r.firmId)).filter(Boolean)); return firms.filter(f => ids.has(String(f.id))).map(f => ({ value: String(f.id), label: getFirmDisplayName(f), searchText: `${getFirmDisplayName(f)} ${clean(f.firmName)}`.trim() })).sort((a, b) => a.label.localeCompare(b.label)); }, [records, firms]);
  const filtered = useMemo(() => { const words = searchWords(filters.search); return records.filter(r => { const day = clean(r.updateTimestamp).slice(0, 10); return (!filters.erpCode || r.erpCode === filters.erpCode) && (!filters.masterBoxErp || r.masterBoxErp === filters.masterBoxErp) && (!filters.firmId || r.firmId === filters.firmId) && (!filters.source || Boolean(sourcesByErp.get(normalizeErp(r.erpCode))?.has(filters.source))) && (!filters.action || r.action === filters.action) && (!filters.location || r.location === filters.location) && (!filters.zone || r.zone === filters.zone) && (!filters.fromDate || day >= filters.fromDate) && (!filters.toDate || day <= filters.toDate) && matchesTableSearch([r.erpCode, r.masterBoxErp, r.firmName, r.action, r.location, r.zone, r.quantity, r.balance, day, r.updatedBy], words); }); }, [records, filters, sourcesByErp]);
  const filtersActive = Object.values(filters).some(value => clean(value));
  const { sorted: sortedRows, sort, toggle: toggleSort } = useTableSort(filtered, (r: PhpPlateInOutRecord, key) => key === "date" ? clean(r.updateTimestamp).slice(0, 10) : key === "quantity" || key === "balance" ? Number((r as any)[key]) : (r as any)[key]);
  const filterSelect = (key: keyof Filters, label: string, options: { value: string; label: string; searchText?: string }[]) => <div className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">{label}</span><Select value={filters[key]} onChange={value => setFilter(key, value)} options={options} placeholder="All" compact /></div>;
  const totalIn = filtered.filter(r => r.action === "IN").reduce((n, r) => n + Number(r.quantity), 0); const totalOut = filtered.filter(r => r.action === "OUT").reduce((n, r) => n + Number(r.quantity), 0);
  return <div className="space-y-4 pb-8"><div className="flex items-center justify-between"><h2 className="text-xl font-bold uppercase">PHP-PLATE IN / OUT</h2><button type="button" aria-label="Add PHP-Plate IN / OUT" title="Add PHP-Plate IN / OUT" onClick={openForm} className="flex h-9 w-9 items-center justify-center rounded bg-indigo-600 text-white shadow hover:bg-indigo-700"><Plus size={20} strokeWidth={3}/></button></div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><div className="rounded border-2 border-black bg-blue-100 p-3"><b>Total Transactions</b><div className="text-2xl font-bold">{filtered.length}</div></div><div className="rounded border-2 border-black bg-green-100 p-3"><b>Total IN</b><div className="text-2xl font-bold">{totalIn}</div></div><div className="rounded border-2 border-black bg-red-100 p-3"><b>Total OUT</b><div className="text-2xl font-bold">{totalOut}</div></div><div className="rounded border-2 border-black bg-yellow-100 p-3"><b>Current Balance</b><div className="text-2xl font-bold">{totalIn - totalOut}</div></div></div>
    {message && !showForm && <div className="rounded border border-black bg-amber-100 p-3 font-bold">{message}</div>}
    <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
      <div className="relative w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input type="text" placeholder="Search" value={filters.search} onChange={e => setFilter("search", e.target.value)} className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600" />
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
        {filterSelect("firmId", "Firm", firmFilterOptions)}
        {filterSelect("source", "Source", [{ value: "PHP", label: "PHP" }, { value: "PLATE", label: "Plate" }])}
        {filterSelect("erpCode", "Item ERP", values(records.map(r => r.erpCode)))}
        {filterSelect("masterBoxErp", "Master Box ERP", values(records.map(r => clean(r.masterBoxErp))))}
        {filterSelect("action", "Action", [{ value: "IN", label: "IN" }, { value: "OUT", label: "OUT" }])}
        {filterSelect("location", "Location", values(records.map(r => clean(r.location))))}
        {filterSelect("zone", "Zone", values(records.map(r => clean(r.zone))))}
        <div data-date-pair="true" className="col-span-2 grid min-w-0 grid-cols-2 gap-2">
          <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">From Date</span><input type="date" value={filters.fromDate} max={filters.toDate || undefined} onChange={e => setFilter("fromDate", e.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
          <label className="min-w-0"><span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600">To Date</span><input type="date" value={filters.toDate} min={filters.fromDate || undefined} onChange={e => setFilter("toDate", e.target.value)} className="h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold" /></label>
        </div>
      </div>
      <div data-mf-actions="true" className="flex justify-end gap-2">
        {filtersActive ? <button type="button" onClick={() => setFilters(emptyFilters)} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button> : null}
        <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
      </div>
    </div>
    <div className="overflow-x-auto rounded border border-black bg-white"><table className="min-w-[1000px] w-full text-sm"><thead className="bg-indigo-700 text-white"><tr>{([["ERP","erpCode"],["Master Box ERP","masterBoxErp"],["Firm","firmName"],["Action","action"],["Location","location"],["Zone","zone"],["Quantity","quantity"],["Balance","balance"],["Date","date"],["Updated By","updatedBy"]] as const).map(([h, k]) => <th key={h} className="border border-black p-2 text-left"><SortHeader label={h} sortKey={k} sort={sort} onToggle={toggleSort} align="left" /></th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={10} className="p-5 text-center">Loading...</td></tr> : sortedRows.length ? sortedRows.map(r => <tr key={r.id} className="border-t border-black"><td className="p-2">{r.erpCode}</td><td className="p-2">{r.masterBoxErp}</td><td className="p-2">{r.firmName}</td><td className="p-2 font-bold">{r.action}</td><td className="p-2">{r.location}</td><td className="p-2">{r.zone}</td><td className="p-2">{r.quantity}</td><td className="p-2">{r.balance}</td><td className="p-2">{clean(r.updateTimestamp).slice(0, 10)}</td><td className="p-2">{r.updatedBy}</td></tr>) : <tr><td colSpan={10} className="h-16" aria-label="No records" /></tr>}</tbody></table></div>
    {showForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded border-2 border-black bg-white p-5 shadow-xl"><div className="mb-4 flex items-center justify-between border-b border-black pb-3"><h3 className="text-lg font-bold">PHP-Plate IN / OUT</h3><button type="button" aria-label="Close form" title="Close" onClick={() => setShowForm(false)}><X size={22}/></button></div>{message && <div className="mb-3 rounded border border-black bg-amber-100 p-3 font-bold">{message}</div>}<div className="grid grid-cols-1 gap-4 md:grid-cols-2"><label className="font-bold">PHP/Plate ERP<Select value={erpCode} onChange={handleErpChange} options={erpOptions} placeholder="Search PHP/Plate ERP"/></label><label className="font-bold">Master ERP<Select value={masterBoxErp} onChange={handleMasterChange} options={masterOptions} placeholder="Search Master ERP"/></label>{masterBoxErp && matchingMasterMappings.length > 1 && <div className="rounded border border-indigo-300 bg-indigo-50 p-3 text-sm md:col-span-2"><b>PHP/Plate ERP codes for {masterBoxErp}:</b> {matchingMasterMappings.map(row => `${row.erpCode} (${row.source})`).join(", ")}</div>}<label className="font-bold">Firm<input className={`${input} bg-slate-100`} value={firmForErp?.firmName || ""} readOnly/></label><label className="font-bold">Action<div className="flex h-[42px] items-center gap-6 rounded border-2 border-black px-3"><label className="font-normal"><input type="radio" checked={action === "IN"} onChange={() => setAction("IN")}/> IN</label><label className="font-normal"><input type="radio" checked={action === "OUT"} onChange={() => setAction("OUT")}/> OUT</label></div></label><label className="font-bold">Location<input className={input} value={location} onChange={e => setLocation(e.target.value)}/></label><label className="font-bold">Zone<input className={input} value={zone} onChange={e => setZone(e.target.value)}/></label><label className="font-bold">Quantity<input className={input} type="number" min="0.01" step="0.01" value={quantity} onChange={e => setQuantity(e.target.value)}/></label></div><div className="mt-5 flex gap-2"><button type="button" onClick={() => void save()} className="rounded bg-indigo-700 px-5 py-2 font-bold text-white">Save</button><button type="button" onClick={() => setShowForm(false)} className="rounded border-2 border-black px-5 py-2 font-bold">Cancel</button></div></div></div>}</div>;
}
