import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useData } from "../hooks/useData";
import type { ControlRecord } from "../types";

const text = (value: unknown) => String(value ?? "").trim();

export function ControlRecordMaster() {
  const [records, , loading] = useData<ControlRecord>("control_records", [], { firmScope: "all" });
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim();
    return records.filter(record => !query || `${record.erpCode} ${record.location} ${record.sampleNo}`.toLowerCase().includes(query)).sort((a, b) => text(b.updateTimestamp).localeCompare(text(a.updateTimestamp)));
  }, [records, search]);
  return <div className="space-y-5 pb-8"><div className="flex items-center justify-between border-b border-black pb-3"><h2 className="text-xl font-bold uppercase">Control Records</h2></div><div className="rounded border-2 border-black bg-white p-3"><div className="relative max-w-xl"><Search className="absolute left-3 top-2.5 text-slate-500" size={18}/><input className="w-full rounded border-2 border-black py-2 pl-10 pr-3" placeholder="Search ERP, location, sample..." value={search} onChange={event => setSearch(event.target.value)}/></div></div><div className="overflow-auto rounded border-2 border-black bg-white"><table className="min-w-[800px] w-full border-collapse text-sm"><thead className="bg-cyan-800 text-white"><tr>{["Sl. No.", "ERP Code", "Location", "Sample No.", "Updated By", "Updated Timestamp"].map(header => <th key={header} className="border border-black p-2 text-left">{header}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={6} className="p-6 text-center">Loading...</td></tr> : filtered.length ? filtered.map((record, index) => <tr key={record.id}><td className="border border-black p-2">{index + 1}</td><td className="border border-black p-2 font-bold">{record.erpCode}</td><td className="border border-black p-2">{record.location}</td><td className="border border-black p-2">{record.sampleNo}</td><td className="border border-black p-2">{record.updatedBy}</td><td className="border border-black p-2">{record.updateTimestamp || "-"}</td></tr>) : <tr><td colSpan={6} className="p-6 text-center">No Control Records found.</td></tr>}</tbody></table></div></div>;
}
