import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Plus } from "lucide-react";
import { useData } from "../hooks/useData";
import { Select } from "../components/Select";
import { useClientPagination } from "../hooks/useClientPagination";
import { ClientPagination } from "../components/ClientPagination";
import type { QualityComplaint } from "../types";

const text = (value: unknown) => String(value ?? "").trim();

export function QualityPendingCapa() {
  const [complaints, , loading] = useData<QualityComplaint>("quality_complaints", [], { firmScope: "all" });
  const [search, setSearch] = useState("");
  const [firm, setFirm] = useState("");
  const [nature, setNature] = useState("");
  const [area, setArea] = useState("");
  const [date, setDate] = useState("");
  const pending = useMemo(() => {
    const query = search.toLowerCase().trim();
    return complaints.filter((row) => {
      const haystack = [row.erpCode, row.partyName, row.itemName, row.lotNo, row.issueDetails].join(" ").toLowerCase();
      return !row.capaNo && (!firm || row.firmName === firm) && (!nature || row.natureOfComplaint === nature) && (!area || row.areaOfIssue === area) && (!date || row.dateOfComplaint === date) && (!query || haystack.includes(query));
    }).sort((a, b) => text(b.timestamp).localeCompare(text(a.timestamp)));
  }, [area, complaints, date, firm, nature, search]);
  const options = useMemo(() => ({ firms: [...new Set(complaints.filter((row) => !row.capaNo).map((row) => row.firmName).filter(Boolean))].sort(), natures: [...new Set(complaints.filter((row) => !row.capaNo).map((row) => row.natureOfComplaint).filter(Boolean))].sort(), areas: [...new Set(complaints.filter((row) => !row.capaNo).map((row) => row.areaOfIssue).filter(Boolean))].sort() }), [complaints]);
  const clear = () => { setSearch(""); setFirm(""); setNature(""); setArea(""); setDate(""); };
  const { page, setPage, pageSize, setPageSize, totalItems, paginatedItems } = useClientPagination(pending, 25);
  useEffect(() => setPage(1), [area, date, firm, nature, search, setPage]);
  return <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-black pb-3"><h2 className="text-xl font-bold uppercase">Pending CAPA</h2><span className="rounded bg-amber-100 px-3 py-2 font-bold">Pending: {pending.length}</span></div><div className="grid grid-cols-1 gap-2 rounded border-2 border-black bg-white p-3 md:grid-cols-2 xl:grid-cols-6"><div className="relative xl:col-span-2"><Search className="absolute left-2 top-2.5 text-slate-500" size={16} /><input className="w-full rounded border border-black py-2 pl-8 pr-2" placeholder="Search ERP / party / item / lot" value={search} onChange={(event) => setSearch(event.target.value)} /></div><Select compact value={firm} onChange={setFirm} options={options.firms.map((value) => ({ value, label: value }))} placeholder="All Firms" noOptionsMessage="No matching firms"/><Select compact value={nature} onChange={setNature} options={options.natures.map((value) => ({ value, label: value }))} placeholder="All Nature" noOptionsMessage="No matching nature values"/><Select compact value={area} onChange={setArea} options={options.areas.map((value) => ({ value, label: value }))} placeholder="All Areas" noOptionsMessage="No matching areas"/><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded border border-black p-2" /><button type="button" onClick={clear} className="rounded border border-black px-3 py-2 font-bold">Clear Filters</button></div><div className="overflow-auto rounded border-2 border-black bg-white"><table className="min-w-[1700px] border-collapse text-xs"><thead><tr className="bg-indigo-800 text-white">{["Complaint Date", "Firm", "Party Name", "Item Name", "ERP Code", "Nature", "Lot No.", "Area", "Concerned Person", "Issue Details", "Complaint Status", "CAPA Status", "Action"].map((header) => <th key={header} className="border border-black px-2 py-2 text-left">{header}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={13} className="p-6 text-center">Loading...</td></tr> : paginatedItems.length ? paginatedItems.map((row) => <tr key={row.id} className="odd:bg-white even:bg-slate-50"><td className="border border-black p-2">{row.dateOfComplaint}</td><td className="border border-black p-2">{row.firmName}</td><td className="border border-black p-2">{row.partyName}</td><td className="border border-black p-2">{row.itemName}</td><td className="border border-black p-2">{row.erpCode}</td><td className="border border-black p-2">{row.natureOfComplaint}</td><td className="border border-black p-2">{row.lotNo}</td><td className="border border-black p-2">{row.areaOfIssue}</td><td className="border border-black p-2">{row.concernedPersonName}</td><td className="max-w-96 whitespace-normal border border-black p-2">{row.issueDetails}</td><td className="border border-black p-2">Pending</td><td className="border border-black p-2">{row.capaStatus || "Pending"}</td><td className="border border-black p-2"><Link to={`/quality/complaints/${row.id}/capa`} className="inline-flex items-center gap-1 rounded bg-amber-500 px-2 py-1 font-bold"><Plus size={14} />Create CAPA</Link></td></tr>) : <tr><td colSpan={13} className="p-8 text-center">No pending CAPA complaints found.</td></tr>}</tbody></table></div><ClientPagination page={page} pageSize={pageSize} totalItems={totalItems} onPageChange={setPage} onPageSizeChange={setPageSize} /></div>;
}
