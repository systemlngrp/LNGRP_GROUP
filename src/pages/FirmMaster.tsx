import { useMemo, useRef, useState } from "react";
import { Edit, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { Spinner } from "../components/Spinner";
import { useData } from "../hooks/useData";
import { Firm } from "../types";

const inputClass = "border-2 border-black rounded p-2 text-black focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors";

function readLogoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read logo file."));
    reader.readAsDataURL(file);
  });
}

export function FirmMaster() {
  const [firms, setFirms, isLoading] = useData<Firm>("firms", []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [firmName, setFirmName] = useState("");
  const [logo, setLogo] = useState("");
  const [tallyPortNo, setTallyPortNo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sortedFirms = useMemo(
    () =>
      [...firms]
        .filter((firm) => {
          const q = searchTerm.trim().toLowerCase();
          if (!q) return true;
          return (
            String(firm.firmName || "").toLowerCase().includes(q) ||
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
    setLogo("");
    setTallyPortNo("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openCreate = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEdit = (firm: Firm) => {
    setEditingId(firm.id);
    setFirmName(firm.firmName || "");
    setLogo(firm.logo || "");
    setTallyPortNo(String(firm.tallyPortNo || ""));
    setIsFormOpen(true);
  };

  const closeForm = () => {
    resetForm();
    setIsFormOpen(false);
  };

  const handleLogoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file for the logo.");
      return;
    }
    if (file.size > 750 * 1024) {
      alert("Logo file is too large. Please upload an image under 750 KB.");
      return;
    }
    try {
      setLogo(await readLogoFile(file));
    } catch (error) {
      console.error("Failed to read logo:", error);
      alert("Failed to read logo file.");
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedName = firmName.trim();
    const normalizedPort = tallyPortNo.trim();
    if (!normalizedName) {
      alert("Firm name is required.");
      return;
    }
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

    setIsSubmitting(true);
    try {
      const timestamp = new Date().toISOString();
      const nextFirm: Firm = {
        id: editingId || crypto.randomUUID(),
        firmName: normalizedName,
        logo: logo || undefined,
        tallyPortNo: normalizedPort || undefined,
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
              <label className="font-bold text-black">Tally Port No</label>
              <input value={tallyPortNo} onChange={(event) => setTallyPortNo(event.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" placeholder="9000" className={inputClass} />
            </div>

            <div className="md:col-span-2 flex flex-col space-y-2">
              <label className="font-bold text-black">Logo</label>
              <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
                <div className="flex h-24 w-40 items-center justify-center overflow-hidden rounded border-2 border-black bg-slate-50">
                  {logo ? <img src={logo} alt="Firm logo preview" className="max-h-full max-w-full object-contain" /> : <ImagePlus className="h-8 w-8 text-slate-500" />}
                </div>
                <div className="flex flex-wrap gap-2">
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded border-2 border-black bg-white px-4 py-2 font-bold text-black hover:bg-slate-100">
                    <ImagePlus size={18} /> Upload Logo
                  </button>
                  {logo && (
                    <button type="button" onClick={() => setLogo("")} className="inline-flex items-center gap-2 rounded border-2 border-black bg-white px-4 py-2 font-bold text-black hover:bg-slate-100">
                      <X size={18} /> Remove
                    </button>
                  )}
                </div>
              </div>
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
                <th className="px-4 py-2 text-left text-sm font-bold text-black uppercase border border-black">Logo</th>
                <th className="px-4 py-2 text-left text-sm font-bold text-black uppercase border border-black">Firm Name</th>
                <th className="px-4 py-2 text-right text-sm font-bold text-black uppercase border border-black">Tally Port No</th>
                <th className="px-4 py-2 text-right text-sm font-bold text-black uppercase border border-black">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {sortedFirms.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center font-medium text-black border border-black">
                    {isLoading ? <div className="flex justify-center"><Spinner /></div> : "No firms found."}
                  </td>
                </tr>
              ) : (
                sortedFirms.map((firm, index) => (
                  <tr key={firm.id} onClick={() => openEdit(firm)} className="cursor-pointer hover:bg-slate-50">
                    <td className="px-4 py-3 text-right text-sm font-bold text-black border border-black">{index + 1}</td>
                    <td className="px-4 py-3 border border-black">
                      <div className="flex h-12 w-20 items-center justify-center overflow-hidden rounded border border-black bg-slate-50">
                        {firm.logo ? <img src={firm.logo} alt={`${firm.firmName} logo`} className="max-h-full max-w-full object-contain" /> : <span className="text-xs font-bold text-slate-500">No Logo</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-black border border-black">{firm.firmName}</td>
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