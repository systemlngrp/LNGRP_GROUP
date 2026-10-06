import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useData } from "../hooks/useData";
import { useNpdItems } from "../hooks/useNpdItems";
import { Select } from "../components/Select";
import type { Firm, Item, QcBlockLocationMaster, QcBlockRecord } from "../types";

const input = "w-full rounded border-2 border-black bg-white px-3 py-2";
const clean = (value: unknown) => String(value ?? "").trim();

export function QcBlockRecordForm() {
  const navigate = useNavigate();
  const [, , , api] = useData<QcBlockRecord>("qc_block_records", [], { firmScope: "all" });
  const [locations] = useData<QcBlockLocationMaster>("qc_block_location_masters", [], { firmScope: "all" });
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const items = useNpdItems();
  const [firmId, setFirmId] = useState(""); const [erp, setErp] = useState(""); const [location, setLocation] = useState(""); const [blockNo, setBlockNo] = useState(""); const [party, setParty] = useState(""); const [item, setItem] = useState(""); const [message, setMessage] = useState(""); const [saving, setSaving] = useState(false);
  const erpOptions = useMemo(() => (items as Item[]).filter(value => value.erp !== undefined).map(value => ({ value: String(value.erp), label: `${value.erp} — ${value.name}`, searchText: `${value.erp} ${value.name} ${value.customer || ""}` })), [items]);
  const firmOptions = firms.map(value => ({ value: value.id, label: value.firmName }));
  const locationOptions = locations.filter(value => clean(value.active).toLowerCase() !== "no").map(value => ({ value: value.name, label: value.name }));
  const selectErp = (value: string) => { setErp(value); const found = (items as Item[]).find(itemValue => String(itemValue.erp) === value); setItem(found?.name || ""); setParty(found?.customer || ""); };
  const save = async () => { setMessage(""); const firm = firms.find(value => value.id === firmId); if (!firmId || !erp || !location || !blockNo.trim()) return setMessage("Firm, ERP Code, Block Location, and Block No. are required."); setSaving(true); const row: QcBlockRecord = { id: `BLOCK-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, firmId, firmName: firm?.firmName, erpCode: erp, partyName: party, itemName: item, blockLocation: location, blockNo: blockNo.trim(), updatedBy: "System User", updateTimestamp: new Date().toISOString() }; try { await api.addItem(row); navigate("/quality/block-record", { state: { message: "Block record saved successfully." } }); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save block record."); } finally { setSaving(false); } };
  return <div className="mx-auto max-w-5xl space-y-5 pb-8"><div className="flex items-center justify-between border-b border-black pb-3"><div><h2 className="text-xl font-bold uppercase">Block Record Form</h2></div><button type="button" onClick={() => navigate("/quality/block-record")} className="inline-flex items-center gap-2 rounded border-2 border-black bg-white px-4 py-2 font-bold"><ArrowLeft size={17}/>Back</button></div>{message && <div className="rounded border border-black bg-amber-100 p-3 font-bold">{message}</div>}<section className="rounded border-2 border-black bg-white p-4"><div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"><label><b>Firm</b><Select value={firmId} onChange={setFirmId} options={firmOptions} placeholder="Select Firm"/></label><label><b>ERP Code</b><Select value={erp} onChange={selectErp} options={erpOptions} placeholder="Search ERP Code"/></label><label><b>Block Location</b><Select value={location} onChange={setLocation} options={locationOptions} placeholder="Select Location"/></label><label><b>Block No.</b><input className={input} value={blockNo} onChange={event => setBlockNo(event.target.value)} placeholder="Block No."/></label><label><b>Party Name</b><input className={`${input} bg-slate-100`} value={party} readOnly/></label><label><b>Item Name</b><input className={`${input} bg-slate-100`} value={item} readOnly/></label></div></section><div className="flex justify-end"><button type="button" disabled={saving} onClick={() => void save()} className="inline-flex items-center gap-2 rounded bg-cyan-700 px-5 py-3 font-bold text-white disabled:opacity-60">Save</button></div></div>;
}
