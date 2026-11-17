import { useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Select } from "./Select";
import { COMMON_COA_KEY, COMMON_COA_NAME } from "../lib/coa";
import { coaSheetTemplates } from "../lib/coaSheetTemplates";
import type { Company, CoaTemplate } from "../types";

// Which customer each COA sheet tab belongs to (matched on company name).
const TAB_COMPANY: Record<string, RegExp> = {
  "Pragati Liquor": /pragati/i,
  "Britannia / ITC": /britannia/i,
  Godrej: /godrej/i,
  PEPSICO: /pepsi/i,
  EMAMI: /emami/i,
  Hector: /hector/i,
  NRL: /numaligarh|numligarh|\bnrl\b/i,
  Freshy: /fresh/i,
  Hetero: /hetero/i,
  "TATA WATER": /tata/i,
  Marico: /marico/i,
  Anmol: /anmol/i,
  Carlsberg: /carlsberg/i,
};

export const COA_SHEET_TEMPLATE_SUFFIX = "COA (sheet 17 Nov)";

/** Creates (or refreshes) one Draft template per COA sheet tab. Admin picks the company for each tab. */
export function CoaSheetImport({ templates, companies, actor, onDone }: { templates: CoaTemplate[]; companies: Company[]; actor: string; onDone: (message: string) => Promise<void> | void }) {
  const layouts = useMemo(() => coaSheetTemplates(), []);
  const tabs = Object.keys(layouts);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const companyOptions = useMemo(() => [{ value: COMMON_COA_KEY, label: COMMON_COA_NAME }, ...companies.filter((company) => company.active !== "No").sort((a, b) => a.name.localeCompare(b.name)).map((company) => ({ value: company.id, label: company.name }))], [companies]);
  const defaults = useMemo(() => {
    const result: Record<string, string> = {};
    for (const tab of tabs) {
      if (tab === "COMMON COA") { result[tab] = COMMON_COA_KEY; continue; }
      const pattern = TAB_COMPANY[tab];
      const existing = templates.find((template) => template.status !== "Archived" && pattern?.test(template.companyName || ""));
      const company = existing ? undefined : companies.find((value) => pattern?.test(value.name || ""));
      result[tab] = existing?.companyId || company?.id || "";
    }
    return result;
  }, [companies, tabs, templates]);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const companyFor = (tab: string) => choice[tab] ?? defaults[tab] ?? "";

  const createDrafts = async () => {
    setBusy(true);
    const done: string[] = [];
    const failed: string[] = [];
    try {
      for (const tab of tabs) {
        const companyId = companyFor(tab);
        if (!companyId) continue;
        const companyName = companyId === COMMON_COA_KEY ? COMMON_COA_NAME : companies.find((value) => value.id === companyId)?.name || "";
        const versions = templates.filter((template) => template.templateKey === companyId || template.companyId === companyId);
        const latest = [...versions].sort((a, b) => b.version - a.version)[0];
        const templateName = `${tab} ${COA_SHEET_TEMPLATE_SUFFIX}`;
        const existingDraft = versions.find((template) => template.status === "Draft" && template.templateName === templateName);
        const now = new Date().toISOString();
        const layout = { ...JSON.parse(JSON.stringify(layouts[tab])), applyToCompanyIds: latest?.layout?.applyToCompanyIds || [] };
        const body = {
          ...(existingDraft ? { id: existingDraft.id, version: existingDraft.version, createdBy: existingDraft.createdBy, createdTimestamp: existingDraft.createdTimestamp } : { version: (latest?.version || 0) + 1, createdBy: actor, createdTimestamp: now }),
          templateKey: latest?.templateKey || companyId, companyId, companyName, templateName,
          status: "Draft", effectiveFrom: now.slice(0, 10), layout, updatedBy: actor, updateTimestamp: now,
        };
        const response = await fetch("/api/coa-templates", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${window.localStorage.getItem("authToken") || ""}` },
          body: JSON.stringify(body),
        });
        if (response.ok) done.push(tab); else failed.push(`${tab} (${(await response.json().catch(() => ({}))).error || response.status})`);
      }
    } finally {
      setBusy(false);
    }
    await onDone(`Drafts created from the COA sheet: ${done.length}${done.length ? ` (${done.join(", ")})` : ""}.${failed.length ? ` Failed: ${failed.join(", ")}.` : ""} Check each draft, then Activate.`);
  };

  return (
    <section className="rounded border-2 border-black bg-white p-3">
      <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-2 font-black uppercase">
        <FileSpreadsheet size={16} /> Create drafts from COA sheet (17 Nov) {open ? "▲" : "▼"}
      </button>
      {open ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm font-semibold text-slate-600">One draft per sheet tab, with the sheet's standards and observation formulas. Pick the customer for each tab (leave blank to skip). Existing active templates are not changed until you activate the draft.</p>
          <div className="grid gap-2 md:grid-cols-2">
            {tabs.map((tab) => (
              <label key={tab} className="grid grid-cols-[130px_minmax(0,1fr)] items-center gap-2 text-sm">
                <span className="font-bold">{tab}</span>
                {tab === "COMMON COA"
                  ? <span className="rounded border-2 border-slate-300 bg-slate-100 px-2 py-2 text-xs font-bold">{COMMON_COA_NAME}</span>
                  : <Select value={companyFor(tab)} onChange={(value) => setChoice((current) => ({ ...current, [tab]: value }))} options={companyOptions} placeholder="Skip" />}
              </label>
            ))}
          </div>
          <button type="button" disabled={busy} onClick={() => void createDrafts()} className="rounded bg-indigo-700 px-4 py-2 font-bold text-white disabled:opacity-50">
            {busy ? "Creating..." : "Create drafts"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
