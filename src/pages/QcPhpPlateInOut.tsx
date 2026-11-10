import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { useData } from "../hooks/useData";
import { Select } from "../components/Select";
import { resolvePhpPlateFirmId } from "../lib/phpPlateFirm";
import type { Firm, Order, OrderSchedule, PhpPlateInOutRecord, Production } from "../types";
import { useTableSearch } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";

const input = "w-full rounded border-2 border-black bg-white px-3 py-2 text-sm";
const clean = (value: unknown) => String(value ?? "").trim();
const normalize = (value: unknown) => clean(value).toLowerCase();
const uniqueValues = (values: string[]) => [...new Set(values.filter(Boolean))].sort().map(value => ({ value, label: value }));
const parseTimestamp = (value: unknown) => {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? undefined : date;
};
const formatDatePart = (value: unknown) => parseTimestamp(value)?.toLocaleDateString() || "-";
const formatTimePart = (value: unknown) => parseTimestamp(value)?.toLocaleTimeString() || "-";
const localDay = (value: unknown) => { const date = parseTimestamp(value); return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : ""; };
const LABEL = "mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600";
const DATE_INPUT = "h-[34px] w-full rounded border-2 border-black bg-white px-2 text-xs font-semibold";

type Source = "PHP" | "PLATE";
type Mapping = { erpCode: string; masterErp: string; source: Source; itemName?: string };

function firstValue(...values: unknown[]) {
  return values.map(clean).find(Boolean) || "";
}

function itemMapping(item: any, source: Source): Mapping | undefined {
  const raw = item?.raw || item;
  const erpCode = firstValue(item?.erp, raw?.erp, raw?.erpCode, raw?.erpItemCode);
  const masterErp = firstValue(item?.masterErp, raw?.masterErp, raw?.masterErpCode, raw?.masterItemNameErpCode);
  const itemName = firstValue(item?.itemName, item?.name, raw?.itemName, raw?.name);
  return erpCode && masterErp ? { erpCode, masterErp, source, itemName: itemName || undefined } : undefined;
}

function jobMapping(job: any, source: Source): Mapping | undefined {
  const raw = job?.raw || job;
  const erpCode = firstValue(job?.erpCode, job?.erp, job?.itemErp, raw?.erpCode, raw?.erp, raw?.erpItemCode);
  const masterErp = firstValue(job?.masterErp, raw?.masterErp, raw?.masterErpCode, raw?.masterItemNameErpCode);
  const itemName = firstValue(job?.itemName, job?.name, raw?.itemName, raw?.name);
  return erpCode && masterErp ? { erpCode, masterErp, source, itemName: itemName || undefined } : undefined;
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
    rows.forEach(row => {
      const key = `${normalize(row.erpCode)}|${normalize(row.masterErp)}|${row.source}`;
      const existing = result.get(key);
      result.set(key, existing ? { ...existing, itemName: existing.itemName || row.itemName } : row);
    });
    return [...result.values()];
  }, [phpItems, plateItems, phpJobs, plateJobs]);
  return { mappings, phpJobs, plateJobs };
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

  return <div className="mx-auto max-w-4xl space-y-5 text-black"><div className="flex items-center justify-between border-b border-black pb-4"><h2 className="text-xl font-bold uppercase">PHP-PLATE IN / OUT Form</h2></div>{message && <div className="rounded border border-black bg-amber-100 p-3 font-bold">{message}</div>}<div className="grid gap-4 rounded border-2 border-black bg-white p-5 md:grid-cols-2"><label className="font-bold">PHP/Plate ERP<Select value={erpCode} onChange={chooseErp} options={erpOptions} placeholder="Search PHP/Plate ERP" /></label><label className="font-bold">Master ERP<Select value={masterErp} onChange={chooseMaster} options={masterOptions} placeholder="Search Master ERP" /></label>{masterErp && matchingMappings.length > 1 && <div className="rounded border border-indigo-300 bg-indigo-50 p-3 text-sm md:col-span-2"><b>PHP/Plate items:</b> {matchingMappings.map(row => `${row.itemName || row.erpCode} (${row.source})`).join(", ")}</div>}<label className="font-bold">Action<div className="flex h-[42px] items-center gap-6 rounded border-2 border-black px-3"><label className="font-normal"><input type="radio" checked={action === "IN"} onChange={() => setAction("IN")} /> IN</label><label className="font-normal"><input type="radio" checked={action === "OUT"} onChange={() => setAction("OUT")} /> OUT</label></div></label><label className="font-bold">Location<input className={input} value={location} onChange={event => setLocation(event.target.value)} /></label><label className="font-bold">Zone<input className={input} value={zone} onChange={event => setZone(event.target.value)} /></label><label className="font-bold">Quantity<input className={input} type="number" min="0.01" step="0.01" value={quantity} onChange={event => setQuantity(event.target.value)} /></label></div><button type="button" onClick={() => void save()} className="rounded bg-indigo-700 px-5 py-2 font-bold text-white">Save</button></div>;
}

type Filters = { search: string; erpCode: string; masterErp: string; location: string; zone: string; updatedBy: string; fromDate: string; toDate: string };
const initialFilters: Filters = { search: "", erpCode: "", masterErp: "", location: "", zone: "", updatedBy: "", fromDate: "", toDate: "" };

export function QcPhpPlateInOutMaster() {
  const [records, , loading] = useData<PhpPlateInOutRecord>("php_plate_in_out_records", [], { firmScope: "all" });
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const sortedRecords = useMemo(() => [...records].sort((a, b) => String(b.updateTimestamp || "").localeCompare(String(a.updateTimestamp || ""))), [records]);
  // Search the table columns: Date, Time, PHP/Plate ERP, Master ERP, Location, Zone, Quantity, Balance, Updated By.
  const searchedRecords = useTableSearch(sortedRecords, filters.search, record => [formatDatePart(record.updateTimestamp), formatTimePart(record.updateTimestamp), record.erpCode, record.masterBoxErp, record.location, record.zone, Number(record.quantity).toLocaleString(), record.quantity, Number(record.balance || 0).toLocaleString(), record.balance || 0, record.updatedBy]);
  const rows = useMemo(() => searchedRecords.filter(record => {
    if (filters.erpCode && record.erpCode !== filters.erpCode) return false;
    if (filters.masterErp && record.masterBoxErp !== filters.masterErp) return false;
    if (filters.location && clean(record.location) !== filters.location) return false;
    if (filters.zone && clean(record.zone) !== filters.zone) return false;
    if (filters.updatedBy && clean(record.updatedBy) !== filters.updatedBy) return false;
    if (filters.fromDate || filters.toDate) { const day = localDay(record.updateTimestamp); if (!day || (filters.fromDate && day < filters.fromDate) || (filters.toDate && day > filters.toDate)) return false; }
    return true;
  }), [filters, searchedRecords]);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const { sorted: sortedRows, sort, toggle: toggleSort } = useTableSort(rows, (record, key) => { const at = parseTimestamp(record.updateTimestamp); if (key === "date") return at ? String(record.updateTimestamp) : ""; if (key === "time") return at ? at.getHours() * 3600 + at.getMinutes() * 60 + at.getSeconds() : ""; if (key === "quantity") return Number(record.quantity); if (key === "balance") return Number(record.balance || 0); return (record as any)[key]; });
  const pagedRows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const setFilter = (key: keyof Filters, value: string) => { setFilters(current => ({ ...current, [key]: value })); setPage(1); };
  const erpFilters = uniqueValues(records.map(record => clean(record.erpCode)));
  const masterFilters = uniqueValues(records.map(record => clean(record.masterBoxErp)));
  const locationFilters = uniqueValues(records.map(record => clean(record.location)));
  const zoneFilters = uniqueValues(records.map(record => clean(record.zone)));
  const updatedByFilters = uniqueValues(records.map(record => clean(record.updatedBy)));
  const hasFilters = Boolean(filters.search.trim()) || Object.entries(filters).some(([key, value]) => key !== "search" && Boolean(value));

  return <div className="space-y-5 text-black"><div className="border-b border-black pb-3"><h2 className="text-xl font-bold uppercase tracking-tight text-black">PHP-PLATE IN / OUT Master</h2></div>
    <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
      <div className="relative w-full"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" placeholder="Search" value={filters.search} onChange={event => setFilter("search", event.target.value)} className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600" /></div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
        <div className="min-w-0"><span className={LABEL}>PHP/Plate ERP</span><Select compact value={filters.erpCode} onChange={value => setFilter("erpCode", value)} options={erpFilters} placeholder="All" /></div>
        <div className="min-w-0"><span className={LABEL}>Master ERP</span><Select compact value={filters.masterErp} onChange={value => setFilter("masterErp", value)} options={masterFilters} placeholder="All" /></div>
        <div className="min-w-0"><span className={LABEL}>Location</span><Select compact value={filters.location} onChange={value => setFilter("location", value)} options={locationFilters} placeholder="All" /></div>
        <div className="min-w-0"><span className={LABEL}>Zone</span><Select compact value={filters.zone} onChange={value => setFilter("zone", value)} options={zoneFilters} placeholder="All" /></div>
        <div className="min-w-0"><span className={LABEL}>Updated By</span><Select compact value={filters.updatedBy} onChange={value => setFilter("updatedBy", value)} options={updatedByFilters} placeholder="All" /></div>
        <div data-date-pair="true" className="col-span-2 grid min-w-0 grid-cols-2 gap-2">
          <label className="min-w-0"><span className={LABEL}>From Date</span><input type="date" value={filters.fromDate} max={filters.toDate || undefined} onChange={event => setFilter("fromDate", event.target.value)} className={DATE_INPUT} /></label>
          <label className="min-w-0"><span className={LABEL}>To Date</span><input type="date" value={filters.toDate} min={filters.fromDate || undefined} onChange={event => setFilter("toDate", event.target.value)} className={DATE_INPUT} /></label>
        </div>
      </div>
      <div data-mf-actions="true" className="flex justify-end gap-2">
        {hasFilters ? <button type="button" onClick={() => { setFilters(initialFilters); setPage(1); }} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button> : null}
        <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
      </div>
    </div>
    <div className="overflow-x-auto rounded border border-black bg-white"><table className="min-w-[1100px] w-full border-collapse text-sm"><thead className="bg-slate-100"><tr>{([["Date", "date"], ["Time", "time"], ["PHP/Plate ERP", "erpCode"], ["Master ERP", "masterBoxErp"], ["Location", "location"], ["Zone", "zone"], ["Quantity", "quantity"], ["Balance", "balance"], ["Updated By", "updatedBy"]] as const).map(([header, key]) => <th key={header} className="border border-black px-3 py-2 text-left font-bold"><SortHeader label={header} sortKey={key} sort={sort} onToggle={toggleSort} /></th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={9} className="p-8 text-center">Loading...</td></tr> : pagedRows.length ? pagedRows.map(record => <tr key={record.id} className="odd:bg-white even:bg-slate-50"><td className="border border-black p-2">{formatDatePart(record.updateTimestamp)}</td><td className="border border-black p-2">{formatTimePart(record.updateTimestamp)}</td><td className="border border-black p-2 font-bold">{record.erpCode}</td><td className="border border-black p-2">{record.masterBoxErp || "-"}</td><td className="border border-black p-2">{record.location || "-"}</td><td className="border border-black p-2">{record.zone || "-"}</td><td className="border border-black p-2 text-right">{Number(record.quantity).toLocaleString()}</td><td className="border border-black p-2 text-right">{Number(record.balance || 0).toLocaleString()}</td><td className="border border-black p-2">{record.updatedBy || "-"}</td></tr>) : <tr><td colSpan={9} className="h-16" aria-label="No records" /></tr>}</tbody></table></div><div className="flex flex-col gap-3 text-sm md:flex-row md:items-center md:justify-between"><span>Showing {rows.length ? (currentPage - 1) * pageSize + 1 : 0}-{Math.min(currentPage * pageSize, rows.length)} of {rows.length}</span><div className="flex items-center gap-2"><select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }} className="rounded border border-black p-1"><option value={10}>10 / page</option><option value={25}>25 / page</option><option value={50}>50 / page</option><option value={100}>100 / page</option></select><button type="button" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={currentPage <= 1} className="rounded border border-black px-3 py-1 font-bold disabled:opacity-50">Previous</button><span>Page {currentPage} / {totalPages}</span><button type="button" onClick={() => setPage(value => Math.min(totalPages, value + 1))} disabled={currentPage >= totalPages} className="rounded border border-black px-3 py-1 font-bold disabled:opacity-50">Next</button></div></div></div>;
}
