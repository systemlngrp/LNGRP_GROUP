import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { useData } from "../hooks/useData";
import { Select } from "../components/Select";
import { resolvePhpPlateFirmId } from "../lib/phpPlateFirm";
import type { Firm, Order, OrderSchedule, PhpPlateInOutRecord, Production } from "../types";

const input = "w-full rounded border-2 border-black bg-white px-3 py-2 text-sm";
const clean = (value: unknown) => String(value ?? "").trim();
const normalize = (value: unknown) => clean(value).toLowerCase();
const uniqueValues = (values: string[]) => [...new Set(values.filter(Boolean))].sort().map(value => ({ value, label: value }));

type Source = "PHP" | "PLATE";
type Mapping = { erpCode: string; masterErp: string; source: Source };

function firstValue(...values: unknown[]) {
  return values.map(clean).find(Boolean) || "";
}

function itemMapping(item: any, source: Source): Mapping | undefined {
  const raw = item?.raw || item;
  const erpCode = firstValue(item?.erp, raw?.erp, raw?.erpCode, raw?.erpItemCode);
  const masterErp = firstValue(item?.masterErp, raw?.masterErp, raw?.masterErpCode, raw?.masterItemNameErpCode);
  return erpCode && masterErp ? { erpCode, masterErp, source } : undefined;
}

function jobMapping(job: any, source: Source): Mapping | undefined {
  const raw = job?.raw || job;
  const erpCode = firstValue(job?.erpCode, job?.erp, job?.itemErp, raw?.erpCode, raw?.erp, raw?.erpItemCode);
  const masterErp = firstValue(job?.masterErp, raw?.masterErp, raw?.masterErpCode, raw?.masterItemNameErpCode);
  return erpCode && masterErp ? { erpCode, masterErp, source } : undefined;
}

function usePhpPlateData() {
  const [phpItems] = useData<any>("php_item_master", [], { firmScope: "all" });
  const [plateItems] = useData<any>("plate_item_master", [], { firmScope: "all" });
  const [phpJobs] = useData<Production>("php_job_master", [], { firmScope: "all" });
  const [plateJobs] = useData<Production>("plate_job_master", [], { firmScope: "all" });
  const mappings = useMemo(() => {
    const rows = [
      ...phpItems.map((item: any) => itemMapping(item, "PHP")),
      ...plateItems.map((item: any) => itemMapping(item, "PLATE")),
      ...phpJobs.map((job: any) => jobMapping(job, "PHP")),
      ...plateJobs.map((job: any) => jobMapping(job, "PLATE")),
    ].filter((row): row is Mapping => Boolean(row));
    const result = new Map<string, Mapping>();
    rows.forEach(row => result.set(`${normalize(row.erpCode)}|${normalize(row.masterErp)}|${row.source}`, row));
    return [...result.values()];
  }, [phpItems, plateItems, phpJobs, plateJobs]);
  return { mappings, phpJobs, plateJobs };
}

function rebalance(records: PhpPlateInOutRecord[]) {
  const groups = new Map<string, PhpPlateInOutRecord[]>();
  records.forEach(record => {
    const key = `${normalize(record.erpCode)}|${normalize(record.masterBoxErp)}|${record.firmId || ""}|${normalize(record.location)}|${normalize(record.zone)}`;
    const group = groups.get(key) || [];
    group.push(record);
    groups.set(key, group);
  });
  const result: PhpPlateInOutRecord[] = [];
  groups.forEach(group => {
    group.sort((a, b) => `${a.updateTimestamp || ""}|${a.id}`.localeCompare(`${b.updateTimestamp || ""}|${b.id}`));
    let balance = 0;
    group.forEach(record => {
      balance += record.action === "IN" ? Number(record.quantity) : -Number(record.quantity);
      result.push({ ...record, balance });
    });
  });
  return result;
}

export function QcPhpPlateInOutForm() {
  const navigate = useNavigate();
  const [records, , , api] = useData<PhpPlateInOutRecord>("php_plate_in_out_records", [], { firmScope: "all" });
  const { mappings, phpJobs, plateJobs } = usePhpPlateData();
  const [schedules] = useData<OrderSchedule>("orders_schedule", [], { firmScope: "all" });
  const [orders] = useData<Order>("orders", [], { firmScope: "all" });
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const [erpCode, setErpCode] = useState("");
  const [masterErp, setMasterErp] = useState("");
  const [action, setAction] = useState<"IN" | "OUT">("IN");
  const [location, setLocation] = useState("");
  const [zone, setZone] = useState("");
  const [quantity, setQuantity] = useState("");
  const [message, setMessage] = useState("");

  const masterOptions = useMemo(() => uniqueValues(mappings.map(row => row.masterErp)), [mappings]);
  const erpOptions = useMemo(() => {
    const result = new Map<string, { value: string; label: string; searchText: string }>();
    mappings.forEach(row => result.set(normalize(row.erpCode), { value: row.erpCode, label: `${row.erpCode} (${row.source})`, searchText: `${row.erpCode} ${row.masterErp} ${row.source}` }));
    return [...result.values()].sort((a, b) => a.value.localeCompare(b.value));
  }, [mappings]);
  const matchingMappings = useMemo(() => mappings.filter(row => normalize(row.masterErp) === normalize(masterErp)), [mappings, masterErp]);
  const selectedMappings = useMemo(() => mappings.filter(row => normalize(row.erpCode) === normalize(erpCode)), [mappings, erpCode]);
  const firm = useMemo(() => {
    const job = [...phpJobs, ...plateJobs].find(row => normalize((row as any).erpCode || (row as any).erp || (row as any).itemErp) === normalize(erpCode));
    const firmId = job ? resolvePhpPlateFirmId(job, schedules, orders) : "";
    return firms.find(row => row.id === firmId);
  }, [erpCode, firms, orders, phpJobs, plateJobs, schedules]);

  const chooseErp = (value: string) => {
    setMessage("");
    setErpCode(value);
    const masters = [...new Set(mappings.filter(row => normalize(row.erpCode) === normalize(value)).map(row => row.masterErp))];
    setMasterErp(masters.length === 1 ? masters[0] : "");
    if (masters.length > 1) setMessage("This ERP has multiple Master ERP values. Select the correct Master ERP.");
  };
  const chooseMaster = (value: string) => {
    setMessage("");
    setMasterErp(value);
    const erps = [...new Set(mappings.filter(row => normalize(row.masterErp) === normalize(value)).map(row => row.erpCode))];
    setErpCode(erps.length === 1 ? erps[0] : "");
    if (erps.length > 1) setMessage(`Master ERP ${value} has multiple PHP/Plate ERP codes. Select one ERP.`);
  };
  const save = async () => {
    const numericQuantity = Number(quantity);
    setMessage("");
    if (!erpCode || !masterErp || !Number.isFinite(numericQuantity) || numericQuantity <= 0) return setMessage("Select linked ERP values and enter a quantity greater than zero.");
    if (!selectedMappings.some(row => normalize(row.masterErp) === normalize(masterErp))) return setMessage("The selected ERP and Master ERP are not linked.");
    const groupKey = (record: PhpPlateInOutRecord) => `${normalize(record.erpCode)}|${normalize(record.masterBoxErp)}|${record.firmId || ""}|${normalize(record.location)}|${normalize(record.zone)}`;
    const current = records.filter(record => groupKey(record) === `${normalize(erpCode)}|${normalize(masterErp)}|${firm?.id || ""}|${normalize(location)}|${normalize(zone)}`).reduce((sum, record) => sum + (record.action === "IN" ? Number(record.quantity) : -Number(record.quantity)), 0);
    if (action === "OUT" && numericQuantity > current) return setMessage(`OUT quantity cannot exceed available balance (${current}).`);
    const row: PhpPlateInOutRecord = { id: `PHP-PLATE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, firmId: firm?.id, firmName: firm?.firmName, erpCode, masterBoxErp: masterErp, action, location: location.trim(), zone: zone.trim(), quantity: numericQuantity, balance: current + (action === "IN" ? numericQuantity : -numericQuantity), updatedBy: "System User", updateTimestamp: new Date().toISOString() };
    try {
      await api.addItem(row);
      navigate("/quality/php-plate/in-out/master");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save transaction.");
    }
  };

  return <div className="mx-auto max-w-4xl space-y-5 text-black"><div className="flex items-center justify-between border-b border-black pb-4"><h2 className="text-xl font-bold uppercase">PHP-PLATE IN / OUT Form</h2></div>{message && <div className="rounded border border-black bg-amber-100 p-3 font-bold">{message}</div>}<div className="grid gap-4 rounded border-2 border-black bg-white p-5 md:grid-cols-2"><label className="font-bold">PHP/Plate ERP<Select value={erpCode} onChange={chooseErp} options={erpOptions} placeholder="Search PHP/Plate ERP" /></label><label className="font-bold">Master ERP<Select value={masterErp} onChange={chooseMaster} options={masterOptions} placeholder="Search Master ERP" /></label>{masterErp && matchingMappings.length > 1 && <div className="rounded border border-indigo-300 bg-indigo-50 p-3 text-sm md:col-span-2"><b>PHP/Plate ERP codes:</b> {matchingMappings.map(row => `${row.erpCode} (${row.source})`).join(", ")}</div>}<label className="font-bold">Action<div className="flex h-[42px] items-center gap-6 rounded border-2 border-black px-3"><label className="font-normal"><input type="radio" checked={action === "IN"} onChange={() => setAction("IN")} /> IN</label><label className="font-normal"><input type="radio" checked={action === "OUT"} onChange={() => setAction("OUT")} /> OUT</label></div></label><label className="font-bold">Location<input className={input} value={location} onChange={event => setLocation(event.target.value)} /></label><label className="font-bold">Zone<input className={input} value={zone} onChange={event => setZone(event.target.value)} /></label><label className="font-bold">Quantity<input className={input} type="number" min="0.01" step="0.01" value={quantity} onChange={event => setQuantity(event.target.value)} /></label></div><button type="button" onClick={() => void save()} className="rounded bg-indigo-700 px-5 py-2 font-bold text-white"><Plus size={17} className="mr-2 inline" />Save PHP/Plate Transaction</button></div>;
}

type Filters = { search: string; erpCode: string; masterErp: string; action: string };
const initialFilters: Filters = { search: "", erpCode: "", masterErp: "", action: "" };

export function QcPhpPlateInOutMaster() {
  const navigate = useNavigate();
  const [records, setRecords, loading] = useData<PhpPlateInOutRecord>("php_plate_in_out_records", [], { firmScope: "all" });
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const rows = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return [...records].sort((a, b) => String(b.updateTimestamp || "").localeCompare(String(a.updateTimestamp || ""))).filter(record => {
      const text = `${record.erpCode} ${record.masterBoxErp || ""} ${record.firmName || ""} ${record.action} ${record.location || ""} ${record.zone || ""}`.toLowerCase();
      return (!query || text.includes(query)) && (!filters.erpCode || record.erpCode === filters.erpCode) && (!filters.masterErp || record.masterBoxErp === filters.masterErp) && (!filters.action || record.action === filters.action);
    });
  }, [filters, records]);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const setFilter = (key: keyof Filters, value: string) => { setFilters(current => ({ ...current, [key]: value })); setPage(1); };
  const saveQuantity = (record: PhpPlateInOutRecord) => {
    const quantity = Number(editQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return setMessage("Quantity must be greater than zero.");
    setRecords(current => rebalance(current.map(item => item.id === record.id ? { ...item, quantity, updateTimestamp: new Date().toISOString(), updatedBy: "System User" } : item)));
    setEditingId(null);
    setMessage("PHP/Plate transaction updated.");
  };
  const deleteRecord = (id: string) => {
    if (deletingId !== id) return setDeletingId(id);
    setRecords(current => rebalance(current.filter(record => record.id !== id)));
    setDeletingId(null);
    setMessage("PHP/Plate transaction deleted.");
  };
  const erpFilters = uniqueValues(records.map(record => clean(record.erpCode)));
  const masterFilters = uniqueValues(records.map(record => clean(record.masterBoxErp)));

  return <div className="space-y-5 text-black"><div className="flex flex-col gap-3 border-b border-black pb-4 md:flex-row md:items-center md:justify-between"><h2 className="text-xl font-bold uppercase">PHP-PLATE IN / OUT Master</h2><button type="button" onClick={() => navigate("/quality/php-plate/in-out/form")} className="rounded bg-indigo-600 px-4 py-2 font-bold text-white">New Entry</button></div>{message && <div className="rounded border border-black bg-emerald-100 p-3 font-bold">{message}</div>}<div className="grid grid-cols-1 gap-3 rounded border-2 border-black bg-white p-3 md:grid-cols-5"><label className="relative md:col-span-2"><Search className="absolute left-3 top-3 text-slate-500" size={17} /><input className="w-full rounded border-2 border-black py-2 pl-9 pr-3" placeholder="Search ERP, Master ERP, firm..." value={filters.search} onChange={event => setFilter("search", event.target.value)} /></label><Select compact value={filters.erpCode} onChange={value => setFilter("erpCode", value)} options={erpFilters} placeholder="All PHP/Plate ERP" /><Select compact value={filters.masterErp} onChange={value => setFilter("masterErp", value)} options={masterFilters} placeholder="All Master ERP" /><select value={filters.action} onChange={event => setFilter("action", event.target.value)} className="rounded border-2 border-black p-2"><option value="">All Actions</option><option value="IN">IN</option><option value="OUT">OUT</option></select></div><div className="overflow-x-auto rounded border-2 border-black bg-white"><table className="min-w-[1250px] w-full border-collapse text-sm"><thead className="bg-slate-100"><tr>{["Date / Time", "PHP/Plate ERP", "Master ERP", "Firm", "Action", "Location", "Zone", "Quantity", "Balance", "Updated By", "Actions"].map(header => <th key={header} className="border border-black px-3 py-2 text-left font-bold">{header}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={11} className="p-8 text-center">Loading...</td></tr> : pagedRows.length ? pagedRows.map(record => <tr key={record.id} className="odd:bg-white even:bg-slate-50"><td className="border border-black p-2">{clean(record.updateTimestamp).replace("T", " ").slice(0, 19)}</td><td className="border border-black p-2 font-bold">{record.erpCode}</td><td className="border border-black p-2">{record.masterBoxErp || "-"}</td><td className="border border-black p-2">{record.firmName || "-"}</td><td className="border border-black p-2 font-bold">{record.action}</td><td className="border border-black p-2">{record.location || "-"}</td><td className="border border-black p-2">{record.zone || "-"}</td><td className="border border-black p-2 text-right">{editingId === record.id ? <input type="number" min="0.01" step="0.01" value={editQuantity} onChange={event => setEditQuantity(event.target.value)} className="w-24 rounded border border-black px-2 py-1 text-right" /> : Number(record.quantity).toLocaleString()}</td><td className="border border-black p-2 text-right">{Number(record.balance || 0).toLocaleString()}</td><td className="border border-black p-2">{record.updatedBy || "-"}</td><td className="border border-black p-2"><div className="flex gap-3">{editingId === record.id ? <><button type="button" onClick={() => saveQuantity(record)} className="font-bold text-emerald-700">Save</button><button type="button" onClick={() => setEditingId(null)} className="font-bold text-slate-600">Cancel</button></> : <><button type="button" onClick={() => { setEditingId(record.id); setEditQuantity(String(record.quantity)); setDeletingId(null); }} className="font-bold text-indigo-700">Edit</button><button type="button" onClick={() => deleteRecord(record.id)} className={`font-bold ${deletingId === record.id ? "text-amber-700" : "text-red-700"}`}>{deletingId === record.id ? "Confirm?" : "Delete"}</button></>}</div></td></tr>) : <tr><td colSpan={11} className="p-8 text-center font-semibold">No PHP/Plate transactions found.</td></tr>}</tbody></table></div><div className="flex flex-col gap-3 text-sm md:flex-row md:items-center md:justify-between"><span>Showing {rows.length ? (currentPage - 1) * pageSize + 1 : 0}-{Math.min(currentPage * pageSize, rows.length)} of {rows.length}</span><div className="flex items-center gap-2"><select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }} className="rounded border border-black p-1"><option value={10}>10 / page</option><option value={25}>25 / page</option><option value={50}>50 / page</option><option value={100}>100 / page</option></select><button type="button" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={currentPage <= 1} className="rounded border border-black px-3 py-1 font-bold disabled:opacity-50">Previous</button><span>Page {currentPage} / {totalPages}</span><button type="button" onClick={() => setPage(value => Math.min(totalPages, value + 1))} disabled={currentPage >= totalPages} className="rounded border border-black px-3 py-1 font-bold disabled:opacity-50">Next</button></div></div></div>;
}
