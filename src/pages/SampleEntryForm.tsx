import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Select } from "../components/Select";
import { useData } from "../hooks/useData";
import { useNpdItems } from "../hooks/useNpdItems";
import type { QcBlockLocationMaster } from "../types";

const input = "w-full rounded border-2 border-black bg-white px-3 py-2";
const clean = (value: unknown) => String(value ?? "").trim();

export function SampleEntryForm() {
  const navigate = useNavigate();
  const items = useNpdItems();
  const [locations] = useData<QcBlockLocationMaster>("qc_block_location_masters", [], { firmScope: "all" });
  const [npdId, setNpdId] = useState("");
  const [location, setLocation] = useState("");
  const [sampleNo, setSampleNo] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const requestId = useRef<string | null>(null);
  const npdOptions = useMemo(() => items.filter(item => clean(item.id) && clean(item.erp)).map(item => ({ value: clean(item.id), label: `${clean(item.erp)} - ${clean(item.name)}`, searchText: `${clean(item.erp)} ${clean(item.name)} ${clean(item.customer)}` })), [items]);
  const locationOptions = locations.filter(value => clean(value.active).toLowerCase() === "yes").map(value => ({ value: value.name, label: value.name }));
  const save = async () => {
    setMessage("");
    if (!npdId || !location || !sampleNo.trim()) return setMessage("ERP, Location, and Sample Number are required.");
    if (saving) return;
    setSaving(true);
    try {
      requestId.current ||= `CONTROL-${crypto.randomUUID()}`;
      const token = window.localStorage.getItem("authToken") || "";
      const response = await fetch("/api/control-records/create", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ id: requestId.current, npdId, location, sampleNo: sampleNo.trim() }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Unable to save Control Sample Record.");
      requestId.current = null;
      navigate("/quality/control-record", { state: { message: "Control Sample Record saved successfully." } });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save Control Sample Record."); } finally { setSaving(false); }
  };
  return <div className="mx-auto max-w-3xl space-y-5 pb-8"><div className="border-b border-black pb-3"><h2 className="text-xl font-bold uppercase">Sample Entry Form</h2></div>{message && <div className="rounded border border-black bg-amber-100 p-3 font-bold">{message}</div>}<section className="rounded border-2 border-black bg-white p-5"><div className="grid gap-4"><label><b>ERP *</b><Select value={npdId} onChange={setNpdId} options={npdOptions} placeholder="Search ERP or Item Name"/></label><label><b>Location *</b><Select value={location} onChange={setLocation} options={locationOptions} placeholder="Select Location"/></label><label><b>Sample Number *</b><input className={input} value={sampleNo} onChange={event => setSampleNo(event.target.value)} placeholder="Sample Number"/></label></div></section><div className="flex justify-end"><button type="button" disabled={saving} onClick={() => void save()} className="rounded bg-cyan-700 px-5 py-3 font-bold text-white disabled:opacity-60">{saving ? "Saving..." : "Submit Sample"}</button></div></div>;
}
