import { useMemo, useState } from "react";
import { Edit, Plus, Trash2 } from "lucide-react";
import { Spinner } from "../components/Spinner";
import { useData } from "../hooks/useData";
import { Firm } from "../types";
import { generateFirmShortName } from "../lib/firmDisplay";

const inputClass = "border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors";

export function FirmMaster() {
  const [firms, setFirms, isLoading] = useData<Firm>("firms", []);
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [firmName, setFirmName] = useState("");
  const [shortName, setShortName] = useState("");
  const [address, setAddress] = useState("");
  const [gstDetails, setGstDetails] = useState("");
  const [tallyPortNo, setTallyPortNo] = useState("");
  const [routeSourceFirmId, setRouteSourceFirmId] = useState("");
  const [routeDestinationFirmId, setRouteDestinationFirmId] = useState("");
  const [routeSequence, setRouteSequence] = useState("1");
  const [routeActive, setRouteActive] = useState<"Yes" | "No">("No");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sortedFirms = useMemo(
    () =>
      [...firms]
        .filter((firm) => {
          const q = searchTerm.trim().toLowerCase();
          if (!q) return true;
          return (
            String(firm.firmName || "").toLowerCase().includes(q) || String(firm.shortName || generateFirmShortName(firm.firmName)).toLowerCase().includes(q) ||
            String(firm.tallyPortNo || "").toLowerCase().includes(q)
          );
        })
        .sort((a, b) => {
          const timeA = a.updateTimestamp ? new Date(a.updateTimestamp).getTime() : 0;
          const timeB = b.updateTimestamp ? new Date(b.updateTimestamp).getTime() : 0;
          return timeB - timeA || String(a.firmName || "").localeCompare(String(b.firmName || ""));
        }),
    [firms, searchTerm]
  );

  const resetForm = () => {
    setEditingId(null);
    setFirmName("");
    setShortName("");
    setAddress("");
    setGstDetails("");
    setTallyPortNo("");
    setRouteSourceFirmId("");
    setRouteDestinationFirmId("");
    setRouteSequence("1");
    setRouteActive("No");
  };

  const openCreate = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEdit = (firm: Firm) => {
    setEditingId(firm.id);
    setFirmName(firm.firmName || "");
    setShortName(firm.shortName || generateFirmShortName(firm.firmName));
    setAddress(firm.address || "");
    setGstDetails(firm.gstDetails || "");
    setTallyPortNo(String(firm.tallyPortNo || ""));
    setRouteSourceFirmId(String(firm.routeSourceFirmId || ""));
    setRouteDestinationFirmId(String(firm.routeDestinationFirmId || ""));
    setRouteSequence(String(firm.routeSequence || 1));
    setRouteActive(firm.routeActive === "Yes" ? "Yes" : "No");
    setIsFormOpen(true);
  };

  const closeForm = () => {
    resetForm();
    setIsFormOpen(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedName = firmName.trim();
    const normalizedShortName = shortName.trim().toUpperCase();
    const normalizedPort = tallyPortNo.trim();
    if (!normalizedName) {
      alert("Firm name is required.");
      return;
    }
    if (!normalizedShortName) { alert("Short name is required."); return; }
    if (normalizedPort && !/^\d{1,5}$/.test(normalizedPort)) {
      alert("Tally port no must be a valid port number.");
      return;
    }

    const duplicate = firms.some(
      (firm) => firm.id !== editingId && String(firm.firmName || "").trim().toLowerCase() === normalizedName.toLowerCase()
    );
    if (duplicate) {
      alert("A firm with this name already exists.");
      return;
    }
    if (firms.some((firm) => firm.id !== editingId && String(firm.shortName || generateFirmShortName(firm.firmName)).trim().toLowerCase() === normalizedShortName.toLowerCase())) {
      alert("A firm with this short name already exists.");
      return;
    }

    setIsSubmitting(true);
    try {
      const timestamp = new Date().toISOString();
      const nextFirm: Firm = {
        id: editingId || crypto.randomUUID(),
        firmName: normalizedName,
        shortName: normalizedShortName,
        address: address.trim() || undefined,
        gstDetails: gstDetails.trim() || undefined,
        tallyPortNo: normalizedPort || undefined,
        routeSourceFirmId: routeSourceFirmId || undefined,
        routeDestinationFirmId: routeDestinationFirmId || undefined,
        routeSequence: Math.max(1, Number(routeSequence) || 1),
        routeActive,
        updatedBy: "System User",
        updateTimestamp: timestamp,
      };
      await setFirms(editingId ? firms.map((firm) => (firm.id === editingId ? nextFirm : firm)) : [nextFirm, ...firms]);
      closeForm();
    } catch (error) {
      console.error("Failed to save firm:", error);
      alert("Failed to save firm.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (deletingId !== id) {
      setDeletingId(id);
      setTimeout(() => setDeletingId(null), 3000);
      return;
    }
    try {
      await setFirms(firms.filter((firm) => firm.id !== id));
    } catch (error) {
      console.error("Failed to delete firm:", error);
      alert("Failed to delete firm.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-black pb-4 gap-4">
        <h2 className="text-xl font-bold text-black uppercase tracking-tight">Firm Master</h2>
        <button type="button" onClick={openCreate} className="flex items-center gap-2 bg-indigo-700 text-white px-4 py-2 rounded font-bold hover:bg-indigo-800 transition">
          <Plus size={18} /> Firm
        </button>
      </div>

      {isFormOpen && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-sm border border-black space-y-4 max-w-3xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col space-y-1">
              <label className="font-bold text-black">Firm Name <span className="text-red-600">*</span></label>
              <input value={firmName} onChange={(event) => setFirmName(event.target.value)} required autoFocus className={inputClass} />
            </div>
            <div className="flex flex-col space-y-1">
              <label className="font-bold text-black">Short Name <span className="text-red-600">*</span></label>
              <input value={shortName} onChange={(event) => setShortName(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20))} required className={inputClass} placeholder="e.g. LNCB" />
            </div>
            <div className="md:col-span-2 flex flex-col space-y-1">
              <label className="font-bold text-black">Address</label>
              <textarea value={address} onChange={(event) => setAddress(event.target.value)} rows={3} className={inputClass} />
            </div>
            <div className="md:col-span-2 flex flex-col space-y-1">
              <label className="font-bold text-black">GST Details</label>
              <textarea value={gstDetails} onChange={(event) => setGstDetails(event.target.value)} rows={2} className={inputClass} />
            </div>
            <div className="md:col-span-2 border-t-2 border-black pt-4">
              <h3 className="font-bold text-black">Inter-Firm Route</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-2">
                <select value={routeSourceFirmId} onChange={(e) => setRouteSourceFirmId(e.target.value)} className={inputClass}>
                  <option value="">Source firm</option>
                  {firms.map((firm) => <option key={firm.id} value={firm.id}>{firm.shortName || generateFirmShortName(firm.firmName)}</option>)}
                </select>
                <select value={routeDestinationFirmId} onChange={(e) => setRouteDestinationFirmId(e.target.value)} className={inputClass}>
                  <option value="">Destination firm</option>
                {firms.filter((firm) => firm.id !== routeSourceFirmId).map((firm) => <option key={firm.id} value={firm.id}>{firm.shortName || generateFirmShortName(firm.firmName)}</option>)}
                </select>
                <input type="number" min="1" value={routeSequence} onChange={(e) => setRouteSequence(e.target.value)} className={inputClass} placeholder="Sequence" />
                <select value={routeActive} onChange={(e) => setRouteActive(e.target.value as "Yes" | "No")} className={inputClass}>
                  <option value="No">Route inactive</option>
                  <option value="Yes">Route active</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col space-y-1">
              <label className="font-bold text-black">Tally Port No</label>
              <input value={tallyPortNo} onChange={(event) => setTallyPortNo(event.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" placeholder="9000" className={inputClass} />
            </div>

          </div>

          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={isSubmitting} className="flex min-w-[100px] items-center justify-center rounded bg-emerald-600 px-6 py-2 font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">
              {isSubmitting ? <Spinner size={20} className="text-white" /> : "Submit"}
            </button>
            <button type="button" onClick={closeForm} disabled={isSubmitting} className="rounded border-2 border-black bg-white px-6 py-2 font-bold text-black transition hover:bg-slate-100 disabled:opacity-50">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search firms..." className="w-[320px] max-w-full rounded border-2 border-black px-4 py-2 text-black focus:outline-none focus:border-indigo-600" />
        <div className="text-sm font-bold text-slate-700">Showing {sortedFirms.length} / {firms.length}</div>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-black">
        <div className="table-sticky-scroll">
          <table className="min-w-full border-collapse border border-black">
            <thead className="sticky top-0 z-10 bg-slate-100">
              <tr>
                <th className="px-4 py-2 text-right text-sm font-bold text-black uppercase border border-black">SL No</th>
                <th className="px-4 py-2 text-left text-sm font-bold text-black uppercase border border-black">Firm Name</th>
                <th className="px-4 py-2 text-left text-sm font-bold text-black uppercase border border-black">Short Name</th>
                <th className="px-4 py-2 text-left text-sm font-bold text-black uppercase border border-black">Address</th>
                <th className="px-4 py-2 text-left text-sm font-bold text-black uppercase border border-black">GST</th>
                <th className="px-4 py-2 text-right text-sm font-bold text-black uppercase border border-black">Tally Port No</th>
                <th className="px-4 py-2 text-right text-sm font-bold text-black uppercase border border-black">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {sortedFirms.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center font-medium text-black border border-black">
                    {isLoading ? <div className="flex justify-center"><Spinner /></div> : "No firms found."}
                  </td>
                </tr>
              ) : (
                sortedFirms.map((firm, index) => (
                  <tr key={firm.id} onClick={() => openEdit(firm)} className="cursor-pointer hover:bg-slate-50">
                    <td className="px-4 py-3 text-right text-sm font-bold text-black border border-black">{index + 1}</td>
                    <td className="px-4 py-3 text-sm text-black border border-black">{firm.firmName}</td>
                    <td className="px-4 py-3 text-sm font-bold text-black border border-black">{firm.shortName || generateFirmShortName(firm.firmName)}</td>
                    <td className="px-4 py-3 text-sm text-black border border-black">{firm.address || "-"}</td>
                    <td className="px-4 py-3 text-sm text-black border border-black">{firm.gstDetails || "-"}</td>
                    <td className="px-4 py-3 text-right text-sm text-black border border-black">{firm.tallyPortNo || "-"}</td>
                    <td className="px-4 py-3 text-right text-sm border border-black">
                      <button type="button" title="Edit" aria-label="Edit" onClick={(event) => { event.stopPropagation(); openEdit(firm); }} className="mr-4 text-indigo-600 hover:text-indigo-900">
                        <Edit size={16} />
                      </button>
                      <button type="button" title={deletingId === firm.id ? "Confirm delete" : "Delete"} aria-label={deletingId === firm.id ? "Confirm delete" : "Delete"} onClick={(event) => { event.stopPropagation(); handleDelete(firm.id); }} className={deletingId === firm.id ? "text-amber-600" : "text-red-600 hover:text-red-900"}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
