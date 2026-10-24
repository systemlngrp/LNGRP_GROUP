import { useMemo, useState } from "react";
import { getDataAuthHeaders, useData } from "../hooks/useData";
import { useAuth } from "../auth/AuthContext";
import { canManageMasterRecords } from "../lib/masterPermissions";
import { NAVIGATION, NavEntry, NavGroup } from "../components/Sidebar";
import { Spinner } from "../components/Spinner";
import { WhatsappConfig } from "../types";

type MenuOption = { label: string; value: string };

const QC_COMPLAINT_MENU = "/quality/complaints/form";
const DEFAULT_QC_COMPLAINT_MESSAGE = `🚨 *QC Complaint Alert*

*Complaint No.:* {{complaintNo}}
*Complaint Date:* {{dateOfComplaint}}
*Job / Lot No.:* {{lotNo}}
*Party:* {{partyName}}
*Item:* {{itemName}}
*ERP Code:* {{erpCode}}
*Nature:* {{natureOfComplaint}}
*Quantity:* {{quantity}}
*Area:* {{areaOfIssue}}
*Issue Details:* {{issueDetails}}
*Photos:* Attached separately.

Please review this complaint and take the necessary action.`;

function collectMenuOptions(groups: NavGroup[]): MenuOption[] {
  const options: MenuOption[] = [];
  const seen = new Set<string>();
  const visit = (entry: NavEntry, section: string) => {
    if ("items" in entry) {
      entry.items.forEach((child) => visit(child, entry.section));
      return;
    }
    if (!entry.href || seen.has(entry.href)) return;
    seen.add(entry.href);
    options.push({ label: `${section} / ${entry.name}`, value: entry.href });
  };
  groups.forEach((group) => group.items.forEach((entry) => visit(entry, group.section)));
  return options.sort((a, b) => a.label.localeCompare(b.label));
}

export function WhatsappMaster() {
  const { user } = useAuth();
  const canManage = canManageMasterRecords(user?.role);
  const [configs, , , configsApi] = useData<WhatsappConfig>("whatsapp_configs", []);
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loginId, setLoginId] = useState("");
  const [pass, setPass] = useState("");
  const [groupId, setGroupId] = useState("");
  const [menu, setMenu] = useState("");
  const [message, setMessage] = useState("");
  const [active, setActive] = useState<"Yes" | "No">("Yes");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const menuOptions = useMemo(() => collectMenuOptions(NAVIGATION), []);

  const filteredConfigs = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return [...configs]
      .filter((config) => !term || [config.loginId, config.groupId, config.menu, config.message].some((value) => String(value || "").toLowerCase().includes(term)))
      .sort((a, b) => String(a.loginId).localeCompare(String(b.loginId)));
  }, [configs, searchTerm]);

  const resetForm = () => {
    setEditingId(null);
    setLoginId("");
    setPass("");
    setGroupId("");
    setMenu(QC_COMPLAINT_MENU);
    setMessage(DEFAULT_QC_COMPLAINT_MESSAGE);
    setActive("Yes");
    setIsFormOpen(false);
  };

  const openCreate = () => {
    setEditingId(null);
    setLoginId("");
    setPass("");
    setGroupId("");
    setMenu(QC_COMPLAINT_MENU);
    setMessage(DEFAULT_QC_COMPLAINT_MESSAGE);
    setActive("Yes");
    setIsFormOpen(true);
  };

  const openEdit = (config: WhatsappConfig) => {
    setEditingId(config.id);
    setLoginId(config.loginId);
    setPass("");
    setGroupId(config.groupId);
    setMenu(config.menu);
    setMessage(config.message);
    setActive(config.active === "No" ? "No" : "Yes");
    setIsFormOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = {
      loginId: loginId.trim(),
      pass,
      groupId: groupId.trim(),
      menu: menu.trim(),
      message: message.trim(),
    };
    if (!normalized.loginId || !normalized.groupId || !normalized.menu || !normalized.message || (!editingId && !normalized.pass)) {
      alert("LoginID, Pass, GroupId, Menu, and Message are required.");
      return;
    }
    const duplicate = configs.some((config) =>
      config.id !== editingId &&
      config.loginId.trim().toLowerCase() === normalized.loginId.toLowerCase() &&
      config.groupId.trim().toLowerCase() === normalized.groupId.toLowerCase() &&
      config.menu === normalized.menu
    );
    if (duplicate) {
      alert("A WhatsApp configuration already exists for this LoginID, GroupId, and Menu.");
      return;
    }
    setIsSubmitting(true);
    try {
      const timestamp = new Date().toISOString();
      const existing = editingId ? configs.find((config) => config.id === editingId) : undefined;
      const nextConfig: WhatsappConfig = {
        id: editingId || crypto.randomUUID(),
        loginId: normalized.loginId,
        pass: "********",
        groupId: normalized.groupId,
        menu: normalized.menu,
        message: normalized.message,
        active,
        updatedBy: user?.name || user?.email || "System User",
        updateTimestamp: timestamp,
      };
      const payload: WhatsappConfig = { ...nextConfig, ...(normalized.pass ? { pass: normalized.pass } : {}) };
      const response = await fetch("/api/whatsapp-configs", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getDataAuthHeaders() },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to save WhatsApp configuration.");
      }
      await configsApi.refresh({ force: true });
      resetForm();
    } catch (error) {
      console.error("Failed to save WhatsApp configuration:", error);
      alert("Failed to save WhatsApp configuration.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canManage) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 font-bold text-red-700">You do not have permission to manage WhatsApp configurations.</div>;
  }

  return (
    <div className="space-y-6">
      {isFormOpen ? (
        <div className="bg-white p-6 rounded-[24px] shadow-sm border border-slate-200">
          <div className="flex flex-wrap justify-between items-start gap-4 mb-8">
            <div>
              <h2 className="text-3xl font-black text-blue-700">{editingId ? "Edit WhatsApp Configuration" : "New WhatsApp Configuration"}</h2>
              <p className="text-slate-500 mt-1">Save a message template for one application menu.</p>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={resetForm} className="px-8 py-3 rounded-2xl border border-slate-300 text-indigo-700 font-bold hover:bg-slate-50">Cancel</button>
              <button type="submit" form="whatsapp-form" disabled={isSubmitting} className="px-8 py-3 rounded-2xl bg-indigo-700 text-white font-bold hover:bg-indigo-800 disabled:opacity-50">
                {isSubmitting ? <Spinner size={18} className="text-white" /> : "Save"}
              </button>
            </div>
          </div>
          <form id="whatsapp-form" onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-5xl">
            <label className="space-y-2"><span className="text-blue-700 font-bold">LoginID <span className="text-red-500">*</span></span><input value={loginId} onChange={(e) => setLoginId(e.target.value)} required className="w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" /></label>
            <label className="space-y-2"><span className="text-blue-700 font-bold">Pass <span className="text-red-500">{editingId ? "" : "*"}</span></span><input type="password" value={pass} onChange={(e) => setPass(e.target.value)} required={!editingId} placeholder={editingId ? "Leave blank to keep current password" : "Enter password"} className="w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" /></label>
            <label className="space-y-2"><span className="text-blue-700 font-bold">GroupId <span className="text-red-500">*</span></span><input value={groupId} onChange={(e) => setGroupId(e.target.value)} required className="w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" /></label>
            <label className="space-y-2"><span className="text-blue-700 font-bold">Menu <span className="text-red-500">*</span></span><select value={menu} onChange={(e) => setMenu(e.target.value)} required className="w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"><option value="">Select menu</option>{menuOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="space-y-2 md:col-span-2"><span className="text-blue-700 font-bold">Auto-message template <span className="text-red-500">*</span></span><textarea value={message} onChange={(e) => setMessage(e.target.value)} required rows={5} className="w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" /></label>
            <label className="space-y-2"><span className="text-blue-700 font-bold">Status</span><select value={active} onChange={(e) => setActive(e.target.value === "No" ? "No" : "Yes")} className="w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"><option value="Yes">Active</option><option value="No">Inactive</option></select></label>
          </form>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap justify-between items-center gap-4"><h2 className="text-3xl font-black text-blue-700">WhatsApp Master</h2><div className="flex flex-wrap items-center gap-3"><input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search WhatsApp configuration" className="w-[360px] max-w-full rounded-full border border-slate-300 px-6 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" /><button type="button" onClick={openCreate} className="px-7 py-3 rounded-2xl bg-indigo-700 text-white font-bold hover:bg-indigo-800">+ WhatsApp</button></div></div>
          <div className="bg-white rounded-[22px] border border-slate-300 overflow-hidden"><div className="px-4 py-3 text-slate-600">Showing {filteredConfigs.length} entries</div><div className="table-sticky-scroll"><table className="min-w-full border-collapse"><thead className="sticky top-0 z-30"><tr className="bg-indigo-700 text-white"><th className="px-4 py-4 text-left text-sm font-bold border-2 border-black">LoginID</th><th className="px-4 py-4 text-left text-sm font-bold border-2 border-black">Pass</th><th className="px-4 py-4 text-left text-sm font-bold border-2 border-black">GroupId</th><th className="px-4 py-4 text-left text-sm font-bold border-2 border-black">Menu</th><th className="px-4 py-4 text-left text-sm font-bold border-2 border-black">Message</th><th className="px-4 py-4 text-left text-sm font-bold border-2 border-black">Status</th><th className="px-4 py-4 text-right text-sm font-bold border-2 border-black">Action</th></tr></thead><tbody>{filteredConfigs.length === 0 ? <tr><td colSpan={7} className="px-6 py-10 text-center border-2 border-black">No WhatsApp configurations found.</td></tr> : filteredConfigs.map((config) => <tr key={config.id}><td className="px-4 py-4 font-bold border-2 border-black">{config.loginId}</td><td className="px-4 py-4 border-2 border-black tracking-widest">********</td><td className="px-4 py-4 border-2 border-black">{config.groupId}</td><td className="px-4 py-4 border-2 border-black">{menuOptions.find((option) => option.value === config.menu)?.label || config.menu}</td><td className="px-4 py-4 border-2 border-black whitespace-pre-wrap max-w-[360px]">{config.message}</td><td className="px-4 py-4 border-2 border-black">{config.active === "No" ? "Inactive" : "Active"}</td><td className="px-4 py-3 text-right border-2 border-black"><button type="button" onClick={() => openEdit(config)} className="px-6 py-2 rounded-xl border border-slate-300 text-indigo-700 font-bold hover:bg-slate-50">Open</button></td></tr>)}</tbody></table></div></div>
        </>
      )}
    </div>
  );
}
