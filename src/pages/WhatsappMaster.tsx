import { useMemo, useState } from "react";
import { CheckCircle2, Eye, FileText, Filter, LockKeyhole, MessageCircle, Plus, Search, Send, ShieldCheck, X, XCircle, Zap } from "lucide-react";
import { getDataAuthHeaders, useData } from "../hooks/useData";
import { useAuth } from "../auth/AuthContext";
import { canManageMasterRecords } from "../lib/masterPermissions";
import { NAVIGATION, NavEntry, NavGroup } from "../components/Sidebar";
import { Spinner } from "../components/Spinner";
import { WhatsappConfig } from "../types";
import { DEFAULT_QC_SCORE_MESSAGE, QC_SCORE_MENU } from "../lib/qcScore";

type MenuOption = { label: string; value: string };
type SendResult = {
  kind: "sending" | "success" | "failure" | "not-configured" | "no-current-data";
  menuLabel: string;
  message?: string;
};

type StatusFilter = "all" | "active" | "inactive";

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
const BOARDLINE_QC_MENU = "/quality/boardline-qc/form";
const DEFAULT_BOARDLINE_QC_MESSAGE = `📋 *BOARDLINE QC CHECK*

*Job No.:* {{jobNo}}
*Party Name:* {{partyName}}
*Item Name:* {{itemName}}
*ERP Code:* {{erp}}

*Sampling Plan Qty.:* {{samplingPlanQty}}
*Check No.:* {{samplingCheckNo}}

*Size Details*
*Standard (Flap - Height - Flap):* {{standard}}
*Actual - Operator Side:* {{flapHeightFlapOperatorSide}}
*Actual - Drive Side:* {{flapHeightFlapDriveSide}}

*Cutting Size Required:* {{cuttingSizeRequired}}
*Cutting Size Achieved:* {{cuttingSizeMm}}

*Board Details*
*B.GSM:* {{boardGsm}}
*Type of Flute:* {{typeOfFlute}}
*Board Thickness:* {{boardThickness}}
*Moisture:* {{moisture}}
*Sheet Weight:* {{sheetWeightGrams}}

*BOARDLINE REMARKS*
{{boardlineRemarks}}

*QC Person:* {{qcPerson}}

*PRINTING ARTWORK*
{{printingArtwork}}`;
const PRINTING_QC_MENU = "/quality/printing-qc/form";
const PRINTING_SHIFT_MENU = "/reports/printing-shift";
const LOADING_SLIP_MENU = "/loading/master";
const MRR_MENU = "/material-in/master";
const REEL_RETURN_MENU = "/material-movement/reel-return";
const DEFAULT_PRINTING_SHIFT_MESSAGE = `*Printing Report ({{shiftHours}}) {{date}}*

{{jobLines}}

*Total Qty in Shift:* {{totalQty}}
*Boxes Per Hour:* {{boxesPerHour}}`;
const DEFAULT_LOADING_SLIP_MESSAGE = `🚚 *LOADING SLIP*

*Slip No.:* {{slipNo}}
*Date:* {{date}}
*Customer:* {{customer}}
*Item:* {{itemName}}
*ERP Code:* {{erpCode}}
*Truck No.:* {{truckNo}}
*Total Quantity:* {{totalQty}}
*Loading Source:* {{loadingSource}}

📄 Loading Slip PDF attached.`;
const DEFAULT_MRR_MESSAGE = `📦 *MATERIAL RECEIPT REPORT (MRR)*

*MRR No.:* {{transactionNo}}
*MRR Date:* {{date}}
*Supplier:* {{supplier}}
*Invoice No.:* {{invoiceNo}}
*Invoice Date:* {{invDate}}
*MRR Type:* {{mrrType}}
*Total Quantity:* {{totalQty}}
*Total Amount:* {{totalAmount}}
*Reel Count:* {{reelCount}}

📄 MRR PDF attached.
📄 QC Reel Labels A4 and A3 attached for Reel MRR.`;
const DEFAULT_REEL_RETURN_MESSAGE = `🔁 *REEL RETURN*

*Return No.:* {{returnNo}}
*Date:* {{date}}
*Job No.:* {{jobNo}}
*Total Reels:* {{totalReels}}
*Total Weight:* {{totalWeightKg}} KG
*Remarks:* {{remarks}}

📄 Reel Return PDF attached.`;
const DEFAULT_PRINTING_QC_MESSAGE = `🖨️ *PRINTING QC CHECK*

*Job No.:* {{jobNo}}
*Party Name:* {{partyName}}
*Item Name:* {{itemName}}
*ERP:* {{erp}}

*Sampling Plan Qty.:* {{samplingPlanQty}}
*Check No.:* {{samplingCheckNo}}

*Box Size Details*
*Standard Box Size (L x W x H):* {{standardBoxSize}}
*Box Size Achieved (L x W x H):* {{boxSizeAchieved}}

*CS / BS Details*
*CS (Standard):* {{csStandard}}
*BS (Standard):* {{bsStandard}}
*BS Achieved:* {{bsAchieved}}

*Board Details*
*Board Thickness (Before):* {{boardThicknessBefore}}
*Board Thickness:* {{boardThickness}}
*Box Weight (Grams):* {{boxWeightGrams}}

*Printing Colour Details*
*Printing Colour 1 (Standard):* {{printingColor1Standard}}
*Colour 1 (Actual):* {{colour1Actual}}

*STANDARD ARTWORK*
{{standardArtwork}}

*QC Person:* {{qcPerson}}
*Operator Name:* {{operatorName}}`;

function defaultMessageForMenu(menu: string) {
  if (menu === QC_SCORE_MENU) return DEFAULT_QC_SCORE_MESSAGE;
  if (menu === PRINTING_SHIFT_MENU) return DEFAULT_PRINTING_SHIFT_MESSAGE;
  if (menu === LOADING_SLIP_MENU) return DEFAULT_LOADING_SLIP_MESSAGE;
  if (menu === MRR_MENU) return DEFAULT_MRR_MESSAGE;
  if (menu === REEL_RETURN_MENU) return DEFAULT_REEL_RETURN_MESSAGE;
  if (menu === BOARDLINE_QC_MENU) return DEFAULT_BOARDLINE_QC_MESSAGE;
  if (menu === PRINTING_QC_MENU) return DEFAULT_PRINTING_QC_MESSAGE;
  return DEFAULT_QC_COMPLAINT_MESSAGE;
}

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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [menuFilter, setMenuFilter] = useState("all");
  const [previewConfig, setPreviewConfig] = useState<WhatsappConfig | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loginId, setLoginId] = useState("");
  const [pass, setPass] = useState("");
  const [groupId, setGroupId] = useState("");
  const [menu, setMenu] = useState("");
  const [message, setMessage] = useState("");
  const [active, setActive] = useState<"Yes" | "No">("Yes");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sendingConfigId, setSendingConfigId] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const menuOptions = useMemo(() => collectMenuOptions(NAVIGATION), []);

  const filteredConfigs = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return [...configs]
      .filter((config) => statusFilter === "all" || (statusFilter === "active" ? config.active !== "No" : config.active === "No"))
      .filter((config) => menuFilter === "all" || config.menu === menuFilter)
      .filter((config) => !term || [config.loginId, config.groupId, config.menu, config.message].some((value) => String(value || "").toLowerCase().includes(term)))
      .sort((a, b) => String(a.loginId).localeCompare(String(b.loginId)));
  }, [configs, searchTerm, statusFilter, menuFilter]);

  const activeCount = configs.filter((config) => config.active !== "No").length;
  const inactiveCount = configs.length - activeCount;
  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setMenuFilter("all");
  };
  const menuLabel = (value: string) => menuOptions.find((option) => option.value === value)?.label || value;
  const placeholderCount = (value: string) => (value.match(/\{\{[^}]+\}\}/g) || []).length;

  const resetForm = () => {
    setEditingId(null);
    setLoginId("");
    setPass("");
    setGroupId("");
    setMenu(QC_COMPLAINT_MENU);
    setMessage(defaultMessageForMenu(QC_COMPLAINT_MENU));
    setActive("Yes");
    setIsFormOpen(false);
  };

  const openCreate = () => {
    setEditingId(null);
    setLoginId("");
    setPass("");
    setGroupId("");
    setMenu(QC_COMPLAINT_MENU);
    setMessage(defaultMessageForMenu(QC_COMPLAINT_MENU));
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
    if (normalized.pass.trim() === "********") {
      alert("Enter the real Pass; the masked value cannot be saved as a password.");
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
      const nextConfig: WhatsappConfig = {
        id: editingId || crypto.randomUUID(),
        loginId: normalized.loginId,
        groupId: normalized.groupId,
        menu: normalized.menu,
        message: normalized.message,
        active,
        updatedBy: user?.name || user?.email || "System User",
        updateTimestamp: timestamp,
      };
      const payload: WhatsappConfig = normalized.pass ? { ...nextConfig, pass: normalized.pass } : nextConfig;
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
      const message = (error as Error).message;
      const safeValidationMessages = new Set([
        "Pass is required for a new WhatsApp configuration.",
        "Enter the real Pass; the masked value cannot be saved as a password.",
        "The stored Pass must be replaced. Enter the current Message Auto Sender password.",
      ]);
      alert(safeValidationMessages.has(message) ? message : "Failed to save WhatsApp configuration.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const sendCurrent = async (config: WhatsappConfig) => {
    if (config.active === "No" || sendingConfigId) return;
    setSendingConfigId(config.id);
    const menuLabel = menuOptions.find((option) => option.value === config.menu)?.label || config.menu;
    setSendResult({ kind: "sending", menuLabel });
    try {
      const response = await fetch(`/api/whatsapp-configs/${encodeURIComponent(config.id)}/send-current`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getDataAuthHeaders() },
      });
      const result = await response.json().catch(() => ({}));
      const status = String(result.status || "Failed");
      if (status === "Sent" && result.warning) setSendResult({ kind: "success", menuLabel, message: String(result.warning) });
      else if (status === "Sent" && result.templateFallback) setSendResult({ kind: "success", menuLabel, message: "Template sent successfully. No current data was found, so the saved template was sent as-is." });
      else if (status === "Sent" && result.attachmentsSent) setSendResult({ kind: "success", menuLabel, message: "Message sent successfully with photos/PDF." });
      else if (status === "Sent") setSendResult({ kind: "success", menuLabel, message: "Message sent successfully." });
      else if (status === "No Current Data") setSendResult({ kind: "no-current-data", menuLabel, message: "No current data is available for this template." });
      else if (status === "Not Configured") setSendResult({ kind: "not-configured", menuLabel, message: "No active WhatsApp configuration or valid credentials found." });
      else setSendResult({ kind: "failure", menuLabel, message: result.error || "Message sending failed." });
    } catch {
      setSendResult({ kind: "failure", menuLabel, message: "Message sending failed. Please try again." });
    } finally {
      setSendingConfigId(null);
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
            <label className="space-y-2"><span className="text-blue-700 font-bold">Menu <span className="text-red-500">*</span></span><select value={menu} onChange={(e) => { const nextMenu = e.target.value; setMenu(nextMenu); if (!editingId) setMessage(defaultMessageForMenu(nextMenu)); }} required className="w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"><option value="">Select menu</option>{menuOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="space-y-2 md:col-span-2"><span className="text-blue-700 font-bold">Auto-message template <span className="text-red-500">*</span></span><textarea value={message} onChange={(e) => setMessage(e.target.value)} required rows={5} className="w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" /></label>
            <label className="space-y-2"><span className="text-blue-700 font-bold">Status</span><select value={active} onChange={(e) => setActive(e.target.value === "No" ? "No" : "Yes")} className="w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"><option value="Yes">Active</option><option value="No">Inactive</option></select></label>
          </form>
        </div>
      ) : (
        <>
          <div className="rounded-[26px] border border-slate-200 bg-gradient-to-br from-white via-white to-indigo-50/60 p-5 shadow-sm sm:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-indigo-700 p-3 text-white shadow-sm"><MessageCircle size={26} /></div>
                <div>
                  <div className="flex flex-wrap items-center gap-3"><h2 className="text-3xl font-black tracking-tight text-slate-900">WhatsApp Master</h2><span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-black uppercase tracking-wider text-indigo-700">Messaging</span></div>
                  <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">Manage secure sender credentials, message templates, and menu-wise WhatsApp delivery.</p>
                </div>
              </div>
              <button type="button" onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-700 px-5 py-3 font-black text-white shadow-sm transition hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"><Plus size={18} /> Add WhatsApp</button>
            </div>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3"><div className="text-xs font-bold uppercase tracking-wider text-slate-500">Total configurations</div><div className="mt-1 text-2xl font-black text-slate-900">{configs.length}</div></div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3"><div className="text-xs font-bold uppercase tracking-wider text-emerald-700">Active</div><div className="mt-1 text-2xl font-black text-emerald-800">{activeCount}</div></div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="text-xs font-bold uppercase tracking-wider text-slate-500">Inactive</div><div className="mt-1 text-2xl font-black text-slate-700">{inactiveCount}</div></div>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1 lg:max-w-md"><Search className="pointer-events-none absolute left-3 top-3 text-slate-400" size={18} /><input aria-label="Search WhatsApp configurations" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search login, group, menu, or message..." className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-4 text-sm font-medium outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" /></div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="flex items-center gap-2 text-sm font-bold text-slate-600"><Filter size={16} /><span className="sr-only">Status</span><select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-semibold text-slate-700 outline-none focus:border-indigo-500"><option value="all">All statuses</option><option value="active">Active only</option><option value="inactive">Inactive only</option></select></label>
              <select aria-label="Filter by menu" value={menuFilter} onChange={(e) => setMenuFilter(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-500"><option value="all">All menus</option>{menuOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
              {(searchTerm || statusFilter !== "all" || menuFilter !== "all") ? <button type="button" onClick={clearFilters} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"><X size={16} /> Clear</button> : null}
            </div>
          </div>
          {sendResult ? <div role={sendResult.kind === "failure" ? "alert" : "status"} className={`flex items-center justify-between gap-4 rounded-2xl border px-5 py-3 font-semibold ${sendResult.kind === "success" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : sendResult.kind === "failure" ? "border-red-300 bg-red-50 text-red-800" : sendResult.kind === "sending" ? "border-blue-300 bg-blue-50 text-blue-800" : "border-amber-300 bg-amber-50 text-amber-800"}`}>
            <span className="flex items-center gap-2">{sendResult.kind === "success" ? <CheckCircle2 size={18} /> : sendResult.kind === "failure" ? <XCircle size={18} /> : sendResult.kind === "sending" ? <Zap size={18} /> : <ShieldCheck size={18} />}<span>{sendResult.kind === "sending" ? `Sending current ${sendResult.menuLabel} message...` : `${sendResult.menuLabel}: ${sendResult.message}`}</span></span>
            {sendResult.kind !== "sending" ? <button type="button" onClick={() => setSendResult(null)} aria-label="Dismiss send result" className="shrink-0 rounded-lg px-2 text-lg leading-none hover:bg-black/10">×</button> : null}
          </div> : null}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4"><div><h3 className="font-black text-slate-900">Configured senders</h3><p className="text-sm font-medium text-slate-500">Showing {filteredConfigs.length} of {configs.length} configurations</p></div><span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600"><LockKeyhole size={14} /> Credentials protected</span></div>
            <div className="hidden overflow-x-auto md:block"><table className="min-w-[1060px] w-full border-collapse"><thead className="sticky top-0 z-30 bg-slate-900 text-left text-xs uppercase tracking-wider text-white"><tr><th className="px-5 py-4">Configuration</th><th className="px-5 py-4">GroupId</th><th className="px-5 py-4">Menu / Route</th><th className="px-5 py-4">Message template</th><th className="px-5 py-4">Status</th><th className="px-5 py-4 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-200">{filteredConfigs.length === 0 ? <tr><td colSpan={6} className="px-6 py-14 text-center"><FileText className="mx-auto mb-3 text-slate-300" size={34} /><div className="font-black text-slate-700">{configs.length === 0 ? "No WhatsApp configurations yet" : "No configurations match these filters"}</div><p className="mt-1 text-sm text-slate-500">{configs.length === 0 ? "Add a sender configuration to start delivering messages." : "Try clearing one or more filters."}</p></td></tr> : filteredConfigs.map((config, index) => { const isActive = config.active !== "No"; return <tr key={config.id} className={index % 2 ? "bg-slate-50/60" : "bg-white"}><td className="px-5 py-4 align-top"><div className="font-black text-slate-900">{config.loginId}</div><div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500"><LockKeyhole size={12} /> Password configured</div></td><td className="max-w-[210px] px-5 py-4 align-top"><div className="break-all font-mono text-sm font-semibold text-slate-700">{config.groupId}</div></td><td className="max-w-[220px] px-5 py-4 align-top"><div className="font-bold leading-snug text-slate-900">{menuLabel(config.menu)}</div><div className="mt-1 break-all font-mono text-xs text-slate-400">{config.menu}</div></td><td className="max-w-[390px] px-5 py-4 align-top"><div className="line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{config.message}</div><div className="mt-2 flex flex-wrap items-center gap-2"><span className="text-xs font-bold text-slate-400">{placeholderCount(config.message)} placeholders</span><button type="button" onClick={() => setPreviewConfig(config)} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-2 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-50"><Eye size={13} /> View message</button></div></td><td className="px-5 py-4 align-top"><span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black ${isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}><span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-slate-400"}`} />{isActive ? "Active" : "Inactive"}</span></td><td className="px-5 py-4 align-top"><div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => void sendCurrent(config)} disabled={!isActive || Boolean(sendingConfigId)} title={!isActive ? "Activate this configuration to send" : "Send the current message"} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">{sendingConfigId === config.id ? <Spinner size={14} className="text-white" /> : <Send size={14} />}{sendingConfigId === config.id ? "Sending..." : "Send Current"}</button><button type="button" onClick={() => openEdit(config)} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-black text-indigo-700 transition hover:bg-indigo-50"><Eye size={14} /> Open</button></div></td></tr>; })}</tbody></table></div>
            <div className="divide-y divide-slate-200 md:hidden">{filteredConfigs.length === 0 ? <div className="px-6 py-14 text-center"><FileText className="mx-auto mb-3 text-slate-300" size={34} /><div className="font-black text-slate-700">{configs.length === 0 ? "No WhatsApp configurations yet" : "No configurations match these filters"}</div><p className="mt-1 text-sm text-slate-500">Try clearing the filters or add a new configuration.</p></div> : filteredConfigs.map((config) => { const isActive = config.active !== "No"; return <article key={config.id} className="space-y-4 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-black text-slate-900">{menuLabel(config.menu)}</h3><p className="mt-1 text-sm font-semibold text-slate-500">{config.loginId}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-black ${isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{isActive ? "Active" : "Inactive"}</span></div><div className="grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-3 text-sm"><div><div className="text-xs font-bold uppercase tracking-wide text-slate-400">GroupId</div><div className="mt-1 break-all font-mono font-semibold text-slate-700">{config.groupId}</div></div><div><div className="text-xs font-bold uppercase tracking-wide text-slate-400">Password</div><div className="mt-1 inline-flex items-center gap-1 font-bold text-slate-600"><LockKeyhole size={14} /> Configured</div></div></div><div><div className="text-xs font-bold uppercase tracking-wide text-slate-400">Message template</div><div className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{config.message}</div><button type="button" onClick={() => setPreviewConfig(config)} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-2 py-1 text-xs font-bold text-indigo-700"><Eye size={13} /> View message</button></div><div className="flex gap-2"><button type="button" onClick={() => void sendCurrent(config)} disabled={!isActive || Boolean(sendingConfigId)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-black text-white disabled:opacity-40">{sendingConfigId === config.id ? "Sending..." : "Send Current"}</button><button type="button" onClick={() => openEdit(config)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2.5 text-xs font-black text-indigo-700"><Eye size={14} /> Open</button></div></article>; })}</div>
          </div>
          {previewConfig ? <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="whatsapp-message-preview-title"><div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4"><div><h2 id="whatsapp-message-preview-title" className="font-black text-slate-900">Message template preview</h2><p className="mt-1 text-sm font-semibold text-slate-500">{menuLabel(previewConfig.menu)}</p></div><button type="button" onClick={() => setPreviewConfig(null)} aria-label="Close message preview" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button></div><div className="max-h-[65vh] overflow-y-auto whitespace-pre-wrap px-5 py-5 text-sm leading-7 text-slate-700">{previewConfig.message}</div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4"><span className="text-xs font-bold text-slate-500">{placeholderCount(previewConfig.message)} placeholders · Credentials are protected</span><button type="button" onClick={() => setPreviewConfig(null)} className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-black text-white hover:bg-indigo-800">Close</button></div></div></div> : null}
        </>
      )}
    </div>
  );
}
