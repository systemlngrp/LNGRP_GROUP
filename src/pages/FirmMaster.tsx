import { useMemo, useState } from "react";
import { MasterHeader } from "../components/MasterHeader";
import { ReportFilterBox } from "../components/ReportFilterBox";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { Plus } from "lucide-react";
import { Spinner } from "../components/Spinner";
import { useData } from "../hooks/useData";
import { Firm } from "../types";
import { generateFirmShortName } from "../lib/firmDisplay";
import { useAuth } from "../auth/AuthContext";
import { canManageMasterRecords } from "../lib/masterPermissions";
import { SortHeader, useTableSort } from "../lib/tableSort";

const inputClass = "border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors";

export function FirmMaster() {
  const { user } = useAuth();
  const canManage = canManageMasterRecords(user?.role);
  const [firms, setFirms, isLoading] = useData<Firm>("firms", []);
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

  const sortedFirms = useMemo(
    () =>
      [...firms]
        .sort((a, b) => {
          const timeA = a.updateTimestamp ? new Date(a.updateTimestamp).getTime() : 0;
          const timeB = b.updateTimestamp ? new Date(b.updateTimestamp).getTime() : 0;
          return timeB - timeA || String(a.firmName || "").localeCompare(String(b.firmName || ""));
        }),
    [firms]
  );
  const [searchTerm, setSearchTerm] = useState("");
  const searchedFirms = useMemo(() => {
    const words = searchWords(searchTerm);
    return sortedFirms.filter((firm) => matchesTableSearch([firm.firmName, firm.shortName || generateFirmShortName(firm.firmName), firm.address, firm.gstDetails, firm.tallyPortNo], words));
  }, [sortedFirms, searchTerm]);
  const { sorted: sortedFirmRows, sort, toggle: toggleSort } = useTableSort(searchedFirms, (firm, key) => {
    if (key === "shortName") return firm.shortName || generateFirmShortName(firm.firmName);
    return (firm as any)[key];
  });

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

  return (
    <div className="space-y-4">
      {isFormOpen ? (
        <h2 className="text-center text-xl font-bold uppercase tracking-tight text-black">{editingId ? "Edit Firm" : "New Firm"}</h2>
      ) : (
        <MasterHeader title="Firm Master" addLabel="Add Firm" onAdd={openCreate} />
      )}

      {isFormOpen && (
        <form onSubmit={handleSubmit} className="mx-auto w-full max-w-3xl space-y-4 rounded-lg border-2 border-black bg-white p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col space-y-1">
              <label className="font-bold text-black">Firm Name <span className="text-red-600">*</span></label>
              <input value={firmName} onChange={(event) => setFirmName(event.target.value)} required autoFocus className={inputClass} />
            </div>
            <div className="flex flex-col space-y-1">
              <label className="font-bold text-black">Short Name <span className="text-red-600">*</span></label>
              <input value={shortName} onChange={(event) => setShortName(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20))} required className={inputClass} />
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
                <input type="number" min="1" value={routeSequence} onChange={(e) => setRouteSequence(e.target.value)} className={inputClass} />
                <select value={routeActive} onChange={(e) => setRouteActive(e.target.value as "Yes" | "No")} className={inputClass}>
                  <option value="No">Route inactive</option>
                  <option value="Yes">Route active</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col space-y-1">
              <label className="font-bold text-black">Tally Port No</label>
              <input value={tallyPortNo} onChange={(event) => setTallyPortNo(event.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" className={inputClass} />
            </div>

          </div>

          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={isSubmitting} className="flex min-w-[100px] items-center justify-center rounded bg-emerald-600 px-6 py-2 font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">
              {isSubmitting ? <Spinner size={20} className="text-white" /> : "Save"}
            </button>
            <button type="button" onClick={closeForm} disabled={isSubmitting} className="rounded border-2 border-black bg-white px-6 py-2 font-bold text-black transition hover:bg-slate-100 disabled:opacity-50">
              Cancel
            </button>
          </div>
        </form>
      )}

      {!isFormOpen ? (<>
      <ReportFilterBox search={searchTerm} onSearch={setSearchTerm} hasFilters={Boolean(searchTerm.trim())} onClear={() => setSearchTerm("")} />
      <div className="text-xs font-bold text-slate-700">{searchedFirms.length} {searchedFirms.length === 1 ? "firm" : "firms"}</div>

      {/* Phones: one card per firm; tap to edit. */}
      <div className="space-y-2 md:hidden">
        {searchedFirms.length === 0 ? (
          <div className="rounded border border-black bg-white p-6 text-center text-sm font-medium">{isLoading ? "Loading…" : "No firms found."}</div>
        ) : sortedFirmRows.map((firm) => (
          <button key={firm.id} type="button" disabled={!canManage} onClick={() => openEdit(firm)} className="block w-full rounded-lg border-2 border-black bg-white p-3 text-left text-black disabled:cursor-default">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 break-words text-sm font-black">{firm.firmName}</span>
              <span className="shrink-0 rounded border border-indigo-300 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-black text-indigo-700">{firm.shortName || generateFirmShortName(firm.firmName)}</span>
            </div>
            {firm.address ? <div className="mt-1 break-words text-xs text-slate-700">{firm.address}</div> : null}
            <div className="mt-1 text-[11px] font-semibold text-slate-700">GST {firm.gstDetails || "-"} · Tally port {firm.tallyPortNo || "-"}</div>
          </button>
        ))}
      </div>

      <div className="hidden bg-white rounded-lg shadow-sm overflow-hidden border border-black md:block">
        <div className="table-sticky-scroll">
          <table className="min-w-full border-collapse border border-black">
            <thead className="sticky top-0 z-10 bg-slate-100">
              <tr>
                <th className="px-4 py-2 text-right text-sm font-bold text-black uppercase border border-black">SL No</th>
                <th className="px-4 py-2 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="Firm Name" sortKey="firmName" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-2 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="Short Name" sortKey="shortName" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-2 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="Address" sortKey="address" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-2 text-left text-sm font-bold text-black uppercase border border-black"><SortHeader label="GST" sortKey="gstDetails" sort={sort} onToggle={toggleSort} align="left" /></th>
                <th className="px-4 py-2 text-right text-sm font-bold text-black uppercase border border-black"><SortHeader label="Tally Port No" sortKey="tallyPortNo" sort={sort} onToggle={toggleSort} align="right" /></th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {searchedFirms.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center font-medium text-black border border-black">
                    {isLoading ? "Loading…" : "No firms found."}
                  </td>
                </tr>
              ) : (
                sortedFirmRows.map((firm, index) => (
                  <tr key={firm.id} onClick={canManage ? () => openEdit(firm) : undefined} className={canManage ? "cursor-pointer hover:bg-slate-50" : undefined}>
                    <td className="px-4 py-3 text-right text-sm font-bold text-black border border-black">{index + 1}</td>
                    <td className="px-4 py-3 text-sm text-black border border-black">{firm.firmName}</td>
                    <td className="px-4 py-3 text-sm font-bold text-black border border-black">{firm.shortName || generateFirmShortName(firm.firmName)}</td>
                    <td className="px-4 py-3 text-sm text-black border border-black">{firm.address || "-"}</td>
                    <td className="px-4 py-3 text-sm text-black border border-black">{firm.gstDetails || "-"}</td>
                    <td className="px-4 py-3 text-right text-sm text-black border border-black">{firm.tallyPortNo || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>) : null}
    </div>
  );
}
