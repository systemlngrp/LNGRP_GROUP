import { useState } from "react";
import { useData } from "../hooks/useData";
import type { QcPersonMaster } from "../types";

const inputClass = "w-full rounded border border-black bg-white px-3 py-2";

export function QcPersonMaster() {
  const [people, , loading, api] = useData<QcPersonMaster>("qc_person_masters", [], { firmScope: "all" });
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState("");
  const [message, setMessage] = useState("");

  const save = async () => {
    const cleanName = name.trim();
    if (!cleanName) { setMessage("Enter a QC Person name."); return; }
    if (people.some((person) => person.name.trim().toLowerCase() === cleanName.toLowerCase() && person.id !== editingId)) { setMessage("This QC Person already exists."); return; }
    const current = people.find((person) => person.id === editingId);
    const item: QcPersonMaster = { id: editingId || `QC-PERSON-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: cleanName, active: current?.active || "Yes", updatedBy: "System User", updateTimestamp: new Date().toISOString() };
    try { if (editingId) await api.saveItem(item); else await api.addItem(item); setName(""); setEditingId(""); setMessage("QC Person saved successfully."); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save QC Person."); }
  };
  const edit = (person: QcPersonMaster) => { setEditingId(person.id); setName(person.name); setMessage(""); };
  const toggle = async (person: QcPersonMaster) => { try { await api.saveItem({ ...person, active: person.active === "Yes" ? "No" : "Yes", updatedBy: "System User", updateTimestamp: new Date().toISOString() }); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update QC Person."); } };
  const resetForm = () => { setEditingId(""); setName(""); };
  return (
    <div className="space-y-4 pb-8">
      <div className="border-b border-black pb-3"><h2 className="text-xl font-bold uppercase">QC Person Master</h2></div>
      {message && <div className="rounded border border-black bg-amber-100 p-3 font-bold">{message}</div>}
      <section className="w-full max-w-2xl rounded border-2 border-black bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 space-y-1"><span className="font-bold">QC Person Name</span><input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter name" /></label>
          <div className="flex shrink-0 gap-2"><button type="button" onClick={() => void save()} className="rounded bg-cyan-700 px-4 py-2 font-bold text-white">{editingId ? "Update" : "Add"}</button>{editingId && <button type="button" onClick={resetForm} className="rounded border border-black px-4 py-2 font-bold">Cancel</button>}</div>
        </div>
      </section>
      <section className="overflow-auto rounded border-2 border-black bg-white">
        <table className="min-w-[600px] w-full border-collapse text-sm"><thead><tr className="bg-cyan-800 text-white"><th className="border border-black p-2 text-left">QC Person</th><th className="border border-black p-2 text-left">Status</th><th className="border border-black p-2 text-left">Actions</th></tr></thead><tbody>{loading ? <tr><td colSpan={3} className="p-6 text-center">Loading...</td></tr> : people.length ? people.slice().sort((a, b) => a.name.localeCompare(b.name)).map((person) => <tr key={person.id}><td className="border border-black p-2">{person.name}</td><td className="border border-black p-2">{person.active === "Yes" ? "Active" : "Inactive"}</td><td className="border border-black p-2"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => edit(person)} className="rounded bg-indigo-600 px-3 py-1 font-bold text-white">Edit</button><button type="button" onClick={() => void toggle(person)} className="rounded bg-slate-700 px-3 py-1 font-bold text-white">{person.active === "Yes" ? "Deactivate" : "Activate"}</button></div></td></tr>) : <tr><td colSpan={3} className="p-6 text-center">No QC Persons found.</td></tr>}</tbody></table>
      </section>
    </div>
  );
}
