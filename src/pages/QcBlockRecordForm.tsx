import { useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useData } from "../hooks/useData";
import { useNpdItems } from "../hooks/useNpdItems";
import { Select } from "../components/Select";
import type { Firm, QcBlockLocationMaster } from "../types";

const input = "w-full rounded border-2 border-black bg-white px-3 py-2";
const readOnlyStyle = { backgroundColor: "#9ca3af", color: "#111827" };
const clean = (value: unknown) => String(value ?? "").trim();

export function QcBlockRecordForm() {
  const navigate = useNavigate();
  const [locations] = useData<QcBlockLocationMaster>("qc_block_location_masters", [], { firmScope: "all" });
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const items = useNpdItems();
  const [firmId, setFirmId] = useState("");
  const [npdId, setNpdId] = useState("");
  const [location, setLocation] = useState("");
  const [blockNo, setBlockNo] = useState("");
  const [sampleNo, setSampleNo] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const pendingId = useRef<string | null>(null);

  const selectedItem = items.find(value => clean(value.id) === npdId);
  const npdOptions = useMemo(() => items.filter(value => clean(value.id) && clean(value.erp)).map(value => ({
    value: clean(value.id),
    label: `${clean(value.erp)} - ${clean(value.name)}`,
    searchText: `${clean(value.erp)} ${clean(value.name)} ${clean(value.customer)}`,
  })), [items]);
  const firmOptions = firms.map(value => ({ value: value.id, label: value.firmName }));
  const locationOptions = locations.filter(value => clean(value.active).toLowerCase() === "yes").map(value => ({ value: value.name, label: value.name }));
  const changeFirm = (value: string) => { pendingId.current = null; setFirmId(value); };
  const changeNpd = (value: string) => { pendingId.current = null; setNpdId(value); };
  const changeLocation = (value: string) => { pendingId.current = null; setLocation(value); };
  const changeBlockNo = (value: string) => { pendingId.current = null; setBlockNo(value); };
  const changeSampleNo = (value: string) => { pendingId.current = null; setSampleNo(value); };

  const save = async () => {
    setMessage("");
    if (!firmId || !npdId || !location || !blockNo.trim() || !sampleNo.trim()) {
      setMessage("Firm, NPD item, Block Location, Block No., and Sample No. are required.");
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      pendingId.current ||= `BLOCK-${crypto.randomUUID()}`;
      const token = window.localStorage.getItem("authToken") || "";
      const response = await fetch("/api/block-records/create-with-stereo", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ id: pendingId.current, firmId, npdId, blockLocation: location, blockNo: blockNo.trim(), sampleNo: sampleNo.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Unable to save block record.");
      pendingId.current = null;
      navigate("/quality/printing-stereo", { state: { message: "Block record and Printing Stereo record saved successfully." } });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save block record.");
    } finally {
      setSaving(false);
    }
  };

  return <div className="mx-auto max-w-5xl space-y-5 pb-8">
    <div className="flex items-center justify-between border-b border-black pb-3">
      <h2 className="text-xl font-bold uppercase">Block Record Form</h2>
      <button type="button" onClick={() => navigate("/quality/printing-stereo")} className="inline-flex items-center gap-2 rounded border-2 border-black bg-white px-4 py-2 font-bold"><ArrowLeft size={17}/>Back</button>
    </div>
    {message && <div className="rounded border border-black bg-amber-100 p-3 font-bold">{message}</div>}
    <section className="rounded border-2 border-black bg-white p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label><b>Firm *</b><Select value={firmId} onChange={changeFirm} options={firmOptions} placeholder="Select Firm"/></label>
        <label><b>NPD Item *</b><Select value={npdId} onChange={changeNpd} options={npdOptions} placeholder="Search ERP or Item Name"/></label>
        <label><b>ERP Code</b><input className={input} style={readOnlyStyle} value={clean(selectedItem?.erp)} readOnly/></label>
        <label><b>Party Name</b><input className={input} style={readOnlyStyle} value={clean(selectedItem?.customer)} readOnly/></label>
        <label><b>Item Name</b><input className={input} style={readOnlyStyle} value={clean(selectedItem?.name)} readOnly/></label>
        <label><b>Block Location *</b><Select value={location} onChange={changeLocation} options={locationOptions} placeholder="Select Location"/></label>
        <label><b>Block No. *</b><input className={input} value={blockNo} onChange={event => changeBlockNo(event.target.value)} placeholder="Block No."/></label>
        <label><b>Sample No. *</b><input className={input} value={sampleNo} onChange={event => changeSampleNo(event.target.value)} placeholder="Sample No."/></label>
      </div>
    </section>
    <div className="flex justify-end"><button type="button" disabled={saving} onClick={() => void save()} className="rounded bg-cyan-700 px-5 py-3 font-bold text-white disabled:opacity-60">{saving ? "Saving..." : "Save Block Record"}</button></div>
  </div>;
}
