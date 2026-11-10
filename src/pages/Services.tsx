import { useMemo, useState } from "react";
import { Spinner } from "../components/Spinner";
import { MasterHeader } from "../components/MasterHeader";
import { ReportFilterBox, SelectFilter } from "../components/ReportFilterBox";
import { useData } from "../hooks/useData";
import { useAuth } from "../auth/AuthContext";
import { canManageMasterRecords } from "../lib/masterPermissions";
import { Service } from "../types";
import { matchesTableSearch, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";

export function Services() {
  const { user } = useAuth();
  const canManage = canManageMasterRecords(user?.role);
  const [services, setServices] = useData<Service>("services", []);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [active, setActive] = useState<"Yes" | "No">("Yes");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredServices = useMemo(
    () =>
      [...services]
        .filter((service) => (!activeFilter || (service.active || "Yes") === activeFilter) && matchesTableSearch([service.name, service.active || "Yes"], searchWords(searchTerm)))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [searchTerm, services, activeFilter]
  );
  const { sorted: sortedServices, sort, toggle: toggleSort } = useTableSort(filteredServices, (row, key) => (key === "active" ? row.active || "Yes" : row.name));

  const openCreate = () => {
    setEditingId(null);
    setName("");
    setActive("Yes");
    setIsFormOpen(true);
  };

  const openEdit = (service: Service) => {
    setEditingId(service.id);
    setName(service.name);
    setActive(service.active === "No" ? "No" : "Yes");
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setEditingId(null);
    setName("");
    setActive("Yes");
    setIsFormOpen(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;

    const normalizedName = name.trim();
    const duplicate = services.some(
      (service) => service.id !== editingId && service.name.toLowerCase() === normalizedName.toLowerCase()
    );
    if (duplicate) {
      alert("A service with this name already exists.");
      return;
    }

    setIsSubmitting(true);
    try {
      const timestamp = new Date().toISOString();
      const nextService: Service = {
        id: editingId || crypto.randomUUID(),
        name: normalizedName,
        active,
        updatedBy: "System User",
        updateTimestamp: timestamp,
      };
      await setServices(editingId ? services.map((service) => (service.id === editingId ? nextService : service)) : [nextService, ...services]);
      closeForm();
    } catch (error) {
      console.error("Failed to save service:", error);
      alert("Failed to save service.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeBadge = (value?: string) => (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-black uppercase ${(value || "Yes") === "Yes" ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-slate-400 bg-slate-100 text-slate-600"}`}>{(value || "Yes") === "Yes" ? "Active" : "Inactive"}</span>
  );

  return (
    <div className="space-y-4">
      {isFormOpen ? (
        <div className="mx-auto w-full max-w-xl space-y-4">
          <h2 className="text-center text-xl font-bold uppercase tracking-tight text-black">{editingId ? "Edit Service" : "New Service"}</h2>
          <form id="service-form" onSubmit={handleSubmit} className="space-y-4 rounded-lg border-2 border-black bg-white p-4">
            <label className="block">
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-600">Service Name *</span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoFocus required className="h-10 w-full rounded border-2 border-black bg-white px-3 text-sm font-bold text-black focus:border-indigo-600 focus:outline-none" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-600">Active</span>
              <select value={active} onChange={(e) => setActive(e.target.value === "No" ? "No" : "Yes")} className="h-10 w-full rounded border-2 border-black bg-white px-3 text-sm font-bold text-black focus:border-indigo-600 focus:outline-none">
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </label>
          </form>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="submit" form="service-form" disabled={isSubmitting} className="inline-flex items-center justify-center gap-2 rounded border-2 border-black bg-emerald-600 px-8 py-2.5 text-sm font-black uppercase text-white hover:bg-emerald-700 disabled:opacity-50">
              {isSubmitting ? <Spinner size={18} className="text-white" /> : "Save"}
            </button>
            <button type="button" onClick={closeForm} className="rounded border-2 border-black bg-white px-8 py-2.5 text-sm font-black uppercase text-black hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <MasterHeader title="Services Master" addLabel="Add Service" onAdd={openCreate} />

          <ReportFilterBox search={searchTerm} onSearch={setSearchTerm} hasFilters={Boolean(searchTerm.trim() || activeFilter)} onClear={() => { setSearchTerm(""); setActiveFilter(""); }}>
            <SelectFilter label="Active" value={activeFilter} onChange={setActiveFilter} options={[{ value: "Yes", label: "Yes" }, { value: "No", label: "No" }]} />
          </ReportFilterBox>

          <div className="text-xs font-bold text-slate-700">{filteredServices.length.toLocaleString()} {filteredServices.length === 1 ? "service" : "services"}</div>

          <div className="overflow-x-auto rounded border border-black bg-white">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-30 bg-slate-100">
                <tr>
                  <th className="border border-black px-3 py-2 text-[11px] font-black uppercase"><SortHeader label="Service" sortKey="name" sort={sort} onToggle={toggleSort} /></th>
                  <th className="w-28 border border-black px-3 py-2 text-[11px] font-black uppercase"><SortHeader label="Active" sortKey="active" sort={sort} onToggle={toggleSort} align="center" /></th>
                  {canManage ? <th className="w-24 border border-black px-3 py-2 text-[11px] font-black uppercase">Action</th> : null}
                </tr>
              </thead>
              <tbody>
                {filteredServices.length === 0 ? (
                  <tr><td colSpan={canManage ? 3 : 2} className="px-6 py-10 text-center font-medium">No services found.</td></tr>
                ) : (
                  sortedServices.map((service) => (
                    <tr key={service.id} className="hover:bg-slate-50">
                      <td className="border border-black px-3 py-2 text-sm font-bold text-black">{service.name}</td>
                      <td className="border border-black px-3 py-2 text-center">{activeBadge(service.active)}</td>
                      {canManage ? (
                        <td className="border border-black px-3 py-2 text-center">
                          <button type="button" onClick={() => openEdit(service)} className="rounded border border-indigo-600 bg-indigo-50 px-3 py-1 text-xs font-bold uppercase text-indigo-700 hover:bg-indigo-100">Edit</button>
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
