import { useMemo, useState } from "react";
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

📄 MRR PDF and applicable Reel Label PDFs are attached.`;
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
      .filter((config) => !term || [config.loginId, config.groupId, config.menu, config.message].some((value) => String(value || "").toLowerCase().includes(term)))
      .sort((a, b) => String(a.loginId).localeCompare(String(b.loginId)));
  }, [configs, searchTerm]);

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
          <div className="flex flex-wrap justify-between items-center gap-4"><h2 className="text-3xl font-black text-blue-700">WhatsApp Master</h2><div className="flex flex-wrap items-center gap-3"><input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search WhatsApp configuration" className="w-[360px] max-w-full rounded-full border border-slate-300 px-6 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" /><button type="button" onClick={openCreate} className="px-7 py-3 rounded-2xl bg-indigo-700 text-white font-bold hover:bg-indigo-800">+ WhatsApp</button></div></div>
          {sendResult ? <div role={sendResult.kind === "failure" ? "alert" : "status"} className={`flex items-center justify-between gap-4 rounded-2xl border px-5 py-3 font-semibold ${sendResult.kind === "success" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : sendResult.kind === "failure" ? "border-red-300 bg-red-50 text-red-800" : sendResult.kind === "sending" ? "border-blue-300 bg-blue-50 text-blue-800" : "border-amber-300 bg-amber-50 text-amber-800"}`}>
            <span>{sendResult.kind === "sending" ? `Sending current ${sendResult.menuLabel} message...` : `${sendResult.menuLabel}: ${sendResult.message}`}</span>
            {sendResult.kind !== "sending" ? <button type="button" onClick={() => setSendResult(null)} aria-label="Dismiss send result" className="shrink-0 rounded-lg px-2 text-lg leading-none hover:bg-black/10">×</button> : null}
          </div> : null}
          <div className="bg-white rounded-[22px] border border-slate-300 overflow-hidden"><div className="px-4 py-3 text-slate-600">Showing {filteredConfigs.length} entries</div><div className="table-sticky-scroll"><table className="min-w-full border-collapse"><thead className="sticky top-0 z-30"><tr className="bg-indigo-700 text-white"><th className="px-4 py-4 text-left text-sm font-bold border-2 border-black">LoginID</th><th className="px-4 py-4 text-left text-sm font-bold border-2 border-black">Pass</th><th className="px-4 py-4 text-left text-sm font-bold border-2 border-black">GroupId</th><th className="px-4 py-4 text-left text-sm font-bold border-2 border-black">Menu</th><th className="px-4 py-4 text-left text-sm font-bold border-2 border-black">Message</th><th className="px-4 py-4 text-left text-sm font-bold border-2 border-black">Status</th><th className="px-4 py-4 text-right text-sm font-bold border-2 border-black">Action</th></tr></thead><tbody>{filteredConfigs.length === 0 ? <tr><td colSpan={7} className="px-6 py-10 text-center border-2 border-black">No WhatsApp configurations found.</td></tr> : filteredConfigs.map((config) => <tr key={config.id}><td className="px-4 py-4 font-bold border-2 border-black">{config.loginId}</td><td className="px-4 py-4 border-2 border-black tracking-widest">********</td><td className="px-4 py-4 border-2 border-black">{config.groupId}</td><td className="px-4 py-4 border-2 border-black">{menuOptions.find((option) => option.value === config.menu)?.label || config.menu}</td><td className="px-4 py-4 border-2 border-black whitespace-pre-wrap max-w-[360px]">{config.message}</td><td className="px-4 py-4 border-2 border-black">{config.active === "No" ? "Inactive" : "Active"}</td><td className="px-4 py-3 text-right border-2 border-black"><div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => void sendCurrent(config)} disabled={config.active === "No" || Boolean(sendingConfigId)} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">{sendingConfigId === config.id ? "Sending..." : "Send Current"}</button><button type="button" onClick={() => openEdit(config)} className="px-6 py-2 rounded-xl border border-slate-300 text-indigo-700 font-bold hover:bg-slate-50">Open</button></div></td></tr>)}</tbody></table></div></div>
        </>
      )}
    </div>
  );
}
