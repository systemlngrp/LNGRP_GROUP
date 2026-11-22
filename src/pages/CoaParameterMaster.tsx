import { useMemo, useState } from "react";
import { Pencil, Plus, RotateCcw, Search } from "lucide-react";
import { useData } from "../hooks/useData";
import { useAuth } from "../auth/AuthContext";
import { canManageMasterRecords } from "../lib/masterPermissions";
import {
  COA_CHECK_OPTIONS, COA_PARAMETERS, COA_READING_OPTIONS, coaParameterForLabel, coaParameterToRecord, describeObservationSource,
  mergeCoaParameters, observationSourceFromText, observationSourceToText, plainRuleFromText, plainRuleToText,
  type CoaParameter, type CoaParameterRecord,
} from "../lib/coaParameters";
import { coaSheetTemplates } from "../lib/coaSheetTemplates";
import { coaParameterRowParts } from "../lib/coa";

// COA Parameter Master: each COA parameter, where its standard and its observation come from,
// and the PASS / FAIL rule. Built-in list + edits saved in coa_parameters (id = code).
// Observations are real readings (PDI / Boardline QC / Printing QC) or typed by QC; nothing is generated.

const FIELD = "w-full rounded border-2 border-black bg-white px-2 py-1.5 text-sm";
const LABEL = "mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600";

type Draft = { code: string; name: string; standard: string; source: string; rule: string; ruleNumber: string; passRule: string; labels: string; isNew: boolean };

const draftOf = (parameter: CoaParameter, isNew = false): Draft => {
  const rule = plainRuleToText(parameter.plain);
  const [kind, number] = rule.includes(":") ? rule.split(":") : [rule, ""];
  return { code: parameter.code, name: parameter.name, standard: parameter.standard, source: observationSourceToText(parameter.observation), rule: kind, ruleNumber: number, passRule: parameter.passRule, labels: parameter.labels.join("\n"), isNew };
};

export function CoaParameterMaster() {
  const { user } = useAuth();
  const canEdit = canManageMasterRecords(user?.role);
  const [records, , loading, api] = useData<CoaParameterRecord>("coa_parameters", [], { firmScope: "all" });
  const parameters = useMemo(() => mergeCoaParameters(records), [records]);
  const savedCodes = useMemo(() => new Set(records.map((record) => String(record.code || record.id).toUpperCase())), [records]);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // Which sheet templates use each parameter.
  const usedBy = useMemo(() => {
    const map = new Map<string, Set<string>>();
    Object.entries(coaSheetTemplates()).forEach(([tab, layout]) => {
      coaParameterRowParts(layout).forEach((parts) => {
        const parameter = coaParameterForLabel(parts.label, parameters);
        if (!parameter) return;
        if (!map.has(parameter.code)) map.set(parameter.code, new Set());
        map.get(parameter.code)!.add(tab);
      });
    });
    return map;
  }, [parameters]);

  const rows = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return parameters.filter((parameter) => {
      const haystack = [parameter.code, parameter.name, parameter.standard, parameter.observationLabel, parameter.passRule, ...parameter.labels, ...(usedBy.get(parameter.code) || [])].join(" ").toLowerCase();
      return words.every((word) => haystack.includes(word));
    });
  }, [parameters, search, usedBy]);

  const sourceOptions = [
    ...COA_READING_OPTIONS.map((option) => ({ value: `readings:${option.value}`, label: `Reading – ${option.label}` })),
    ...COA_CHECK_OPTIONS.map((option) => ({ value: `check:${option.value}`, label: `Check – ${option.label}` })),
    { value: "standard", label: "Same as standard" },
    { value: "manual", label: "Typed by QC" },
  ];

  const save = async () => {
    if (!draft) return;
    const code = draft.code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    if (!code || !draft.name.trim()) return setMessage("Code and Parameter name are required.");
    if (draft.isNew && parameters.some((parameter) => parameter.code === code)) return setMessage("This code already exists.");
    const labels = draft.labels.split("\n").map((label) => label.trim()).filter(Boolean);
    const ruleText = ["tol", "pct"].includes(draft.rule) ? `${draft.rule}:${Number(draft.ruleNumber) || 0}` : draft.rule;
    const observation = observationSourceFromText(draft.source, { manual: true });
    const parameter: CoaParameter = {
      code, name: draft.name.trim(), standard: draft.standard.trim(), observation, observationLabel: describeObservationSource(observation),
      plain: plainRuleFromText(ruleText, "none"), passRule: draft.passRule.trim(), labels: labels.length ? labels : [draft.name.trim()],
    };
    const record = coaParameterToRecord(parameter, String(user?.name || user?.email || "System User"));
    setBusy(true);
    setMessage("");
    try {
      if (savedCodes.has(code)) await api.saveItem(record); else await api.addItem(record);
      setDraft(null);
      setMessage(`${parameter.name} saved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save.");
    } finally { setBusy(false); }
  };

  const reset = async (parameter: CoaParameter) => {
    const record = records.find((value) => String(value.code || value.id).toUpperCase() === parameter.code);
    if (!record) return;
    const builtIn = COA_PARAMETERS.some((value) => value.code === parameter.code);
    if (!window.confirm(builtIn ? `Undo your changes to "${parameter.name}" and use the built-in setting?` : `Delete parameter "${parameter.name}"?`)) return;
    setBusy(true);
    try {
      await api.removeItem(record.id);
      setMessage(builtIn ? `${parameter.name} is back to the built-in setting.` : `${parameter.name} deleted.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to reset.");
    } finally { setBusy(false); }
  };

  const sourceClass = (label: string) => /^Typed/.test(label) ? "bg-amber-50 text-amber-900" : /^Same as/.test(label) ? "bg-slate-50" : "bg-emerald-50 text-emerald-900";

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-black pb-3">
      <div>
        <h2 className="text-xl font-bold uppercase tracking-tight text-black">COA Parameter Master</h2>
        <p className="text-sm font-semibold text-slate-600">Observations come from real readings or are typed by QC, and are checked against the standard (PASS / FAIL) on the COA Form.</p>
      </div>
      {canEdit ? <button type="button" onClick={() => { setMessage(""); setDraft(draftOf({ code: "", name: "", standard: "", observation: { manual: true }, observationLabel: "", plain: "none", passRule: "", labels: [] }, true)); }} className="inline-flex items-center gap-1.5 rounded border-2 border-indigo-700 bg-indigo-700 px-3 py-1.5 text-sm font-bold text-white"><Plus size={15} /> Add parameter</button> : null}
    </div>
    {message ? <div className="rounded border border-black bg-amber-100 p-2 text-sm font-bold">{message}</div> : null}
    {draft ? <div className="space-y-3 rounded border-2 border-indigo-700 bg-indigo-50/40 p-3">
      <div className="text-sm font-black uppercase">{draft.isNew ? "New parameter" : `Edit ${draft.code}`}</div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label><span className={LABEL}>Code *</span><input className={FIELD} value={draft.code} disabled={!draft.isNew} onChange={(event) => setDraft({ ...draft, code: event.target.value })} placeholder="e.g. CARTON_ODOUR" /></label>
        <label><span className={LABEL}>Parameter name *</span><input className={FIELD} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <label><span className={LABEL}>Standard (description)</span><input className={FIELD} value={draft.standard} onChange={(event) => setDraft({ ...draft, standard: event.target.value })} /></label>
        <label><span className={LABEL}>Observation comes from</span><select className={FIELD} value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value })}>
          {!sourceOptions.some((option) => option.value === draft.source) ? <option value={draft.source}>{draft.source}</option> : null}
          {sourceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></label>
        <label><span className={LABEL}>Rule for a plain-number standard</span><div className="flex gap-2">
          <select className={FIELD} value={draft.rule} onChange={(event) => setDraft({ ...draft, rule: event.target.value })}>
            <option value="none">No check</option><option value="min">At least the standard</option><option value="max">At most the standard</option>
            <option value="equal">Equal to the standard</option><option value="tol">Standard ± value</option><option value="pct">Standard ± %</option>
          </select>
          {["tol", "pct"].includes(draft.rule) ? <input className={`${FIELD} w-24`} type="number" min={0} step="any" value={draft.ruleNumber} onChange={(event) => setDraft({ ...draft, ruleNumber: event.target.value })} /> : null}
        </div><span className="text-[10px] text-slate-500">Standards written as a range ("7-9%"), "Min …", "Maximum …" or "x ± y" use their own rule.</span></label>
        <label><span className={LABEL}>PASS rule (shown on this page)</span><input className={FIELD} value={draft.passRule} onChange={(event) => setDraft({ ...draft, passRule: event.target.value })} /></label>
        <label className="md:col-span-2 xl:col-span-3"><span className={LABEL}>Row names on COA templates (one per line)</span><textarea rows={3} className={FIELD} value={draft.labels} onChange={(event) => setDraft({ ...draft, labels: event.target.value })} /></label>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setDraft(null)} className="rounded border-2 border-black bg-white px-3 py-1.5 text-sm font-bold">Cancel</button>
        <button type="button" disabled={busy} onClick={() => void save()} className="rounded border-2 border-indigo-700 bg-indigo-700 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
      </div>
    </div> : null}
    <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" placeholder="Search parameter, source or company" aria-label="Search parameters" value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-600 focus:outline-none" /></div>
    <div className="text-xs font-bold text-slate-600">{loading ? "Loading… " : ""}{rows.length} of {parameters.length} parameters · <span className="text-emerald-800">green = real reading</span> · <span className="text-amber-800">amber = typed by QC</span> · <span className="text-indigo-800">✎ = changed here</span></div>
    {/* Spreadsheet-style grid: every cell bordered, compact, left aligned, header stays on top. */}
    <div className="max-h-[70vh] overflow-auto border border-slate-400 bg-white">
      <table className="w-full min-w-[1100px] border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-cyan-800 text-white"><tr>
          {["Code", "Parameter", "Standard", "Observation comes from", "PASS rule", "Used by templates", ...(canEdit ? ["Actions"] : [])].map((label) =>
            <th key={label} className="whitespace-nowrap border border-slate-400 px-2 py-1.5 font-bold">{label}</th>)}
        </tr></thead>
        <tbody>{rows.map((parameter) => <tr key={parameter.code} className="align-top odd:bg-white even:bg-slate-50 hover:bg-cyan-50">
          <td className="whitespace-nowrap border border-slate-300 px-2 py-1 font-mono font-bold">{parameter.code}{savedCodes.has(parameter.code) ? <span className="ml-1 text-indigo-700" title="Changed here">✎</span> : null}</td>
          <td className="border border-slate-300 px-2 py-1 font-bold">{parameter.name}</td>
          <td className="border border-slate-300 px-2 py-1">{parameter.standard}</td>
          <td className={`border border-slate-300 px-2 py-1 font-semibold ${sourceClass(parameter.observationLabel)}`}>{parameter.observationLabel}</td>
          <td className="border border-slate-300 px-2 py-1">{parameter.passRule}</td>
          <td className="border border-slate-300 px-2 py-1">{[...(usedBy.get(parameter.code) || [])].join(", ") || "-"}</td>
          {canEdit ? <td className="whitespace-nowrap border border-slate-300 px-2 py-1"><div className="flex gap-2">
            <button type="button" onClick={() => { setMessage(""); setDraft(draftOf(parameter)); }} className="inline-flex items-center gap-1 font-bold text-indigo-700 underline"><Pencil size={12} /> Edit</button>
            {savedCodes.has(parameter.code) ? <button type="button" disabled={busy} onClick={() => void reset(parameter)} className="inline-flex items-center gap-1 font-bold text-slate-700 underline"><RotateCcw size={12} /> {COA_PARAMETERS.some((value) => value.code === parameter.code) ? "Reset" : "Delete"}</button> : null}
          </div></td> : null}
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}
