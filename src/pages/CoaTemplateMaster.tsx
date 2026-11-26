import { ArrowDown, ArrowUp, Archive, CheckCircle2, Copy, Edit, Plus, Save, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Select } from "../components/Select";
import { CoaSheetImport } from "../components/CoaSheetImport";
import { useData } from "../hooks/useData";
import { useAuth } from "../auth/AuthContext";
import { canManageMasterRecords } from "../lib/masterPermissions";
import { COMMON_COA_KEY, COMMON_COA_NAME, coaParameterRowParts, defaultCoaLayout } from "../lib/coa";
import { COA_CHECK_OPTIONS, COA_READING_OPTIONS, coaParameterForLabel, coaParameterToRecord, describeObservationSource, mergeCoaParameters, observationSourceFromText, plainRuleFromText, type CoaParameter, type CoaParameterRecord } from "../lib/coaParameters";
import { buildCoaParameterRow, coaParameterCodeFromName } from "../lib/coaTemplateRows";
import type { Company, CoaTemplate, CoaTemplateCell, CoaTemplateRow, Firm } from "../types";

const input = "w-full rounded border-2 border-black bg-white px-2 py-2 text-sm";
const actor = (user: any) => String(user?.userId || user?.name || "System User");
const cloneLayout = (template: CoaTemplate) => JSON.parse(JSON.stringify(template.layout));

export function CoaTemplateMaster() {
  const { user } = useAuth();
  const canManage = canManageMasterRecords(user?.role);
  const [templates, , loading, api] = useData<CoaTemplate>("coa-templates", []);
  const [companies] = useData<Company>("companies", []);
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const [selectedId, setSelectedId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [selectedCellId, setSelectedCellId] = useState("");
  const [layout, setLayout] = useState(defaultCoaLayout());
  const [message, setMessage] = useState("");
  // COA Parameter Master: pick a parameter to add its row, or "+" to create a new parameter.
  const [parameterRecords, , , parameterApi] = useData<CoaParameterRecord>("coa_parameters", [], { firmScope: "all" });
  const parameters = useMemo(() => mergeCoaParameters(parameterRecords), [parameterRecords]);
  const [pickParameter, setPickParameter] = useState("");
  const [newParameter, setNewParameter] = useState<null | { name: string; standard: string; source: string; rule: string; ruleNumber: string; rowIndex?: number; busy?: boolean; error?: string }>(null);
  const selected = templates.find((template) => template.id === selectedId);
  const activeCompanyTemplates = useMemo(() => templates.filter((template) => template.status === "Active"), [templates]);
  const activeCompanies = companies.filter((company) => company.active !== "No").sort((a, b) => a.name.localeCompare(b.name));
  const companyOptions = [{ value: COMMON_COA_KEY, label: COMMON_COA_NAME }, ...activeCompanies.map((company) => ({ value: company.id, label: company.name }))];
  const [alsoFilter, setAlsoFilter] = useState("");
  const alsoApplyTo = layout.applyToCompanyIds || [];
  const toggleAlsoApply = (id: string) => setLayout((current) => {
    const list = current.applyToCompanyIds || [];
    return { ...current, applyToCompanyIds: list.includes(id) ? list.filter((value) => value !== id) : [...list, id] };
  });
  const allCells = [...layout.metadataRows, ...layout.parameterRows, ...layout.footerRows].flatMap((row) => row.cells);
  const selectedCell = allCells.find((cell) => cell.id === selectedCellId);

  if (!canManage) return <div className="rounded border-2 border-red-700 bg-red-50 p-6 font-bold">Only Admin or QC Manager can manage COA templates.</div>;

  const reset = () => { setSelectedId(""); setCompanyId(""); setTemplateName(""); setEffectiveFrom(""); setSelectedCellId(""); setLayout(defaultCoaLayout()); setMessage(""); };
  const startFrom = (template?: CoaTemplate) => {
    if (!template) return reset();
    setSelectedId(template.status === "Draft" ? template.id : "");
    setCompanyId(template.companyId);
    setTemplateName(template.status === "Draft" ? template.templateName : `${template.templateName} - New Version`);
    setEffectiveFrom(template.status === "Draft" ? template.effectiveFrom || "" : "");
    setSelectedCellId("");
    setLayout(cloneLayout(template));
    setMessage(template.status === "Active" ? "Active template copied into a new draft version." : "Draft loaded.");
  };
  const updateRow = (rowIndex: number, updater: (row: CoaTemplateRow) => CoaTemplateRow) => setLayout((current) => ({ ...current, parameterRows: current.parameterRows.map((row, index) => index === rowIndex ? updater(row) : row) }));
  const updateCell = (rowIndex: number, cellIndex: number, patch: Partial<CoaTemplateCell>) => updateRow(rowIndex, (row) => ({ ...row, cells: row.cells.map((cell, index) => index === cellIndex ? { ...cell, ...patch } : cell) }));
  const updateSelectedCell = (patch: Partial<CoaTemplateCell>) => setLayout((current) => {
    const updateRows = (rows: CoaTemplateRow[]) => rows.map((row) => ({ ...row, cells: row.cells.map((cell) => cell.id === selectedCellId ? { ...cell, ...patch } : cell) }));
    return { ...current, metadataRows: updateRows(current.metadataRows), parameterRows: updateRows(current.parameterRows), footerRows: updateRows(current.footerRows) };
  });
  const moveRow = (index: number, direction: -1 | 1) => setLayout((current) => { const rows = [...current.parameterRows]; const target = index + direction; if (target < 0 || target >= rows.length) return current; [rows[index], rows[target]] = [rows[target], rows[index]]; return { ...current, parameterRows: rows }; });
  const addRow = () => setLayout((current) => { const stamp = Date.now(); return { ...current, parameterRows: [...current.parameterRows, { id: `row-${stamp}`, cells: [{ id: `sl-${stamp}`, label: String(current.parameterRows.length), kind: "static", align: "center", bold: true }, { id: `label-${stamp}`, label: "", kind: "static", colSpan: 2, bold: true }, { id: `standard-${stamp}`, label: "", kind: "input", inputType: "text", colSpan: 2, background: "#f4d7e5" }, { id: `observation-${stamp}`, label: "", kind: "input", inputType: "text", background: "#f4d7e5" }] }] }; });
  const usedParameterCodes = new Set(coaParameterRowParts(layout).map((parts) => coaParameterForLabel(parts.label, parameters)?.code).filter(Boolean) as string[]);
  const parameterOptions = [...parameters]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((parameter) => ({ value: parameter.code, label: `${parameter.name}${usedParameterCodes.has(parameter.code) ? "  (already in template)" : ""}` }));
  // Choosing a parameter in a row's Parameter dropdown rebuilds that row from the master (SL No. kept).
  const setRowParameter = (rowIndex: number, parameter: CoaParameter, standardText?: string, list: CoaParameter[] = parameters) => {
    setLayout((current) => {
      const old = current.parameterRows[rowIndex];
      if (!old) return current;
      const others = { ...current, parameterRows: current.parameterRows.filter((_, index) => index !== rowIndex) };
      const row = buildCoaParameterRow(others, parameter, list, { standardText });
      const oldSl = old.cells.find((cell) => cell.kind === "static")?.label;
      const firstStatic = row.cells.find((cell) => cell.kind === "static");
      if (firstStatic && oldSl && /^\d+$/.test(String(oldSl).trim()) && /^\d+$/.test(String(firstStatic.label).trim())) firstStatic.label = oldSl;
      return { ...current, parameterRows: current.parameterRows.map((value, index) => (index === rowIndex ? row : value)) };
    });
    setMessage(`Row set to ${parameter.name}. Check its Standard / Observation boxes, then save the draft.`);
  };
  const isHeaderRow = (row: CoaTemplateRow) => row.cells.some((cell) => cell.kind === "static" && /OBSERVATION|TEST RESULT/i.test(String(cell.label || "")));
  const rowParameterOptions = (row: CoaTemplateRow) => {
    const label = String(row.cells[1]?.label || "").trim();
    const matched = coaParameterForLabel(label, parameters);
    return matched || !label ? parameterOptions : [{ value: "__custom__", label: `${label} (not in master)` }, ...parameterOptions];
  };
  const rowParameterValue = (row: CoaTemplateRow) => {
    const label = String(row.cells[1]?.label || "").trim();
    return coaParameterForLabel(label, parameters)?.code || (label ? "__custom__" : "");
  };
  const addParameterRow = (parameter: CoaParameter, standardText?: string, list: CoaParameter[] = parameters) => {
    setLayout((current) => ({ ...current, parameterRows: [...current.parameterRows, buildCoaParameterRow(current, parameter, list, { standardText })] }));
    setMessage(`${parameter.name} added. Check its Standard / Observation boxes below, then save the draft.`);
  };
  const sourceOptions = [
    { value: "manual", label: "Typed by QC" },
    ...COA_READING_OPTIONS.map((option) => ({ value: `readings:${option.value}`, label: `Reading – ${option.label}` })),
    ...COA_CHECK_OPTIONS.map((option) => ({ value: `check:${option.value}`, label: `Check – ${option.label}` })),
    { value: "standard", label: "Same as standard" },
  ];
  const ruleOptions = [
    { value: "none", label: "No check" }, { value: "min", label: "At least the standard (min)" }, { value: "max", label: "At most the standard (max)" },
    { value: "equal", label: "Equal to the standard" }, { value: "tol", label: "Within ± value" }, { value: "pct", label: "Within ± %" },
  ];
  const saveNewParameter = async () => {
    if (!newParameter) return;
    const name = newParameter.name.trim();
    if (!name) return setNewParameter({ ...newParameter, error: "Parameter name is required." });
    const label = name.toUpperCase().replace(/\s+/g, " ");
    const existing = coaParameterForLabel(label, parameters) || parameters.find((parameter) => parameter.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) return setNewParameter({ ...newParameter, error: `"${existing.name}" is already in the COA Parameter Master. Pick it from the list instead.` });
    const code = coaParameterCodeFromName(name, new Set(parameters.map((parameter) => parameter.code)));
    const observation = observationSourceFromText(newParameter.source, { manual: true });
    const ruleText = ["tol", "pct"].includes(newParameter.rule) ? `${newParameter.rule}:${Number(newParameter.ruleNumber) || 0}` : newParameter.rule;
    const parameter: CoaParameter = {
      code, name, standard: newParameter.standard.trim(), observation, observationLabel: describeObservationSource(observation),
      plain: plainRuleFromText(ruleText, "none"), passRule: ruleOptions.find((option) => option.value === newParameter.rule)?.label || "", labels: [label],
    };
    setNewParameter({ ...newParameter, busy: true, error: "" });
    try {
      await parameterApi.addItem(coaParameterToRecord(parameter, String(user?.name || user?.email || "System User")));
      if (newParameter.rowIndex !== undefined) setRowParameter(newParameter.rowIndex, parameter, newParameter.standard.trim(), [...parameters, parameter]);
      else addParameterRow(parameter, newParameter.standard.trim(), [...parameters, parameter]);
      setNewParameter(null);
      setMessage(`${name} saved in COA Parameter Master and added to this template. Save the draft to keep the row.`);
    } catch (error) {
      setNewParameter({ ...newParameter, busy: false, error: error instanceof Error ? error.message : "Unable to save the parameter." });
    }
  };
  const removeRow = (index: number) => setLayout((current) => ({ ...current, parameterRows: current.parameterRows.filter((_, rowIndex) => rowIndex !== index) }));
  const save = async () => {
    const company = companyId === COMMON_COA_KEY ? { id: COMMON_COA_KEY, name: COMMON_COA_NAME } : companies.find((value) => value.id === companyId);
    if (!company || !templateName.trim()) return setMessage("Company and template name are required.");
    const now = new Date().toISOString();
    const payload: CoaTemplate = { id: selectedId || crypto.randomUUID(), templateKey: selected?.templateKey || company.id, companyId: company.id, companyName: company.name, templateName: templateName.trim(), version: selected?.version || (templates.filter((value) => value.templateKey === company.id).reduce((max, value) => Math.max(max, value.version), 0) + 1), status: selected?.status || "Draft", effectiveFrom: effectiveFrom || undefined, layout, createdBy: selected?.createdBy || actor(user), createdTimestamp: selected?.createdTimestamp || now, updatedBy: actor(user), updateTimestamp: now };
    try { if (selectedId) await api.saveItem(payload); else await api.addItem(payload); setMessage("COA template draft saved."); setSelectedId(payload.id); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save template."); }
  };
  const action = async (id: string, verb: "activate" | "archive") => { const response = await fetch(`/api/coa-templates/${id}/${verb}`, { method: "POST", headers: { Authorization: `Bearer ${window.localStorage.getItem("authToken") || ""}` } }); const data = await response.json().catch(() => ({})); if (!response.ok) return setMessage(data.error || `Unable to ${verb} template.`); await api.refresh({ force: true }); setMessage(`Template ${verb}d.`); };
  const cellOptions = allCells.map((cell) => ({ value: cell.id, label: `${cell.id}${cell.label ? ` — ${cell.label}` : ""}` }));

  return <div className="space-y-5 text-black">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black pb-3"><div><h2 className="text-xl font-bold uppercase">COA Template Master</h2></div><button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded border-2 border-black bg-white px-3 py-2 font-bold"><Plus size={16} /> New Template</button></div>
    {message && <div className="rounded border-2 border-indigo-700 bg-indigo-50 p-3 font-bold">{message}</div>}
    <CoaSheetImport templates={templates} companies={companies} actor={actor(user)} onDone={async (text) => { await api.refresh({ force: true }); setMessage(text); }} />
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <section className="rounded border-2 border-black bg-white p-3"><h3 className="mb-3 font-black uppercase">Existing Versions</h3>{loading ? <p>Loading...</p> : <div className="space-y-2">{templates.map((template) => <div key={template.id} className={`rounded border-2 p-2 ${template.id === selectedId ? "border-indigo-700 bg-indigo-50" : "border-black"}`}><div className="flex items-start justify-between gap-2"><div><p className="font-black">{template.companyName}</p><p className="text-xs font-bold">{template.templateName} · v{template.version}</p><p className="text-xs font-bold uppercase text-slate-600">{template.status}</p></div><button type="button" onClick={() => startFrom(template)} title="Edit or clone" className="rounded border border-black p-1"><Edit size={14} /></button></div><div className="mt-2 flex flex-wrap gap-1">{template.status === "Active" && <button type="button" onClick={() => startFrom(template)} className="inline-flex items-center gap-1 rounded bg-indigo-700 px-2 py-1 text-xs font-bold text-white"><Copy size={12} /> New version</button>}{template.status === "Draft" && <button type="button" onClick={() => void action(template.id, "activate")} className="inline-flex items-center gap-1 rounded bg-emerald-700 px-2 py-1 text-xs font-bold text-white"><CheckCircle2 size={12} /> Activate</button>}{template.status !== "Archived" && <button type="button" onClick={() => void action(template.id, "archive")} className="inline-flex items-center gap-1 rounded border border-red-700 px-2 py-1 text-xs font-bold text-red-700"><Archive size={12} /> Archive</button>}</div></div>)}</div>}</section>
      <section className="rounded border-2 border-black bg-white p-4">
        <div className="grid gap-3 md:grid-cols-2"><label className="space-y-1"><span className="font-bold">Customer Company *</span><Select value={companyId} onChange={setCompanyId} options={companyOptions} placeholder="Select company" /></label><label className="space-y-1"><span className="font-bold">Template Name *</span><input className={input} value={templateName} onChange={(event) => setTemplateName(event.target.value)} /></label><label className="space-y-1"><span className="font-bold">Firm Name (on COA)</span><Select value={layout.pdfFirmId || ""} onChange={(value) => { const firm = firms.find((row) => row.id === value); setLayout((current) => ({ ...current, pdfFirmId: value || "", pdfFirmName: firm?.firmName || "" })); }} options={[{ value: "", label: "Default (job firm)" }, ...[...firms].sort((a, b) => String(a.firmName).localeCompare(String(b.firmName))).map((firm) => ({ value: firm.id, label: firm.firmName }))]} placeholder="Default (job firm)" /></label><label className="space-y-1"><span className="font-bold">Effective From</span><input type="date" className={input} value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></label><label className="flex items-center gap-2 pt-6 font-bold"><input type="checkbox" checked={layout.logoEnabled !== false} onChange={(event) => setLayout((current) => ({ ...current, logoEnabled: event.target.checked }))} /> Show firm logo</label>{companyId && companyId !== COMMON_COA_KEY ? <div className="space-y-1 md:col-span-2"><span className="font-bold">Also applies to (other units of this customer)</span><input className={input} value={alsoFilter} onChange={(event) => setAlsoFilter(event.target.value)} placeholder="Search companies" /><div className="max-h-40 overflow-auto rounded border-2 border-slate-300 p-2">{activeCompanies.filter((company) => company.id !== companyId && (alsoApplyTo.includes(company.id) || (alsoFilter.trim() && company.name.toLowerCase().includes(alsoFilter.trim().toLowerCase())))).map((company) => <label key={company.id} className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={alsoApplyTo.includes(company.id)} onChange={() => toggleAlsoApply(company.id)} /> {company.name}</label>)}{alsoApplyTo.length === 0 && !alsoFilter.trim() ? <p className="text-xs font-semibold text-slate-500">Search to add other company records that should use this COA.</p> : null}</div></div> : null}<label className="space-y-1 md:col-span-2"><span className="font-bold">Certificate Title</span><input className={input} value={layout.title} onChange={(event) => setLayout((current) => ({ ...current, title: event.target.value }))} /></label><label className="space-y-1 md:col-span-2"><span className="font-bold">Subtitle</span><input className={input} value={layout.subtitle || ""} onChange={(event) => setLayout((current) => ({ ...current, subtitle: event.target.value }))} /></label></div>
        <div className="mt-5 flex items-center justify-between border-b-2 border-black pb-2"><h3 className="font-black uppercase">Parameter Rows</h3><div className="flex flex-wrap items-center gap-2"><div className="w-72"><Select compact value={pickParameter} options={parameterOptions} placeholder="Add parameter from master…" onChange={(code) => { const parameter = parameters.find((value) => value.code === code); if (parameter) addParameterRow(parameter); setPickParameter(""); }} /></div><button type="button" title="New parameter (adds it to COA Parameter Master)" onClick={() => setNewParameter({ name: "", standard: "", source: "manual", rule: "none", ruleNumber: "" })} className="inline-flex h-9 w-9 items-center justify-center rounded border-2 border-emerald-700 bg-emerald-50 font-bold text-emerald-800 hover:bg-emerald-100"><Plus size={16} /></button><button type="button" onClick={addRow} className="inline-flex items-center gap-1 rounded border-2 border-black bg-white px-3 py-2 text-sm font-bold"><Plus size={15} /> Blank Row</button></div></div>
        <div className="mt-3 space-y-3">{layout.parameterRows.map((row, rowIndex) => <div key={row.id} className="rounded border-2 border-slate-300 p-2"><div className="grid gap-2 md:grid-cols-[50px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">{row.cells.slice(0, 4).map((cell, cellIndex) => cellIndex === 1 && !isHeaderRow(row) ? <div key={cell.id} className={selectedCellId === cell.id ? "rounded ring-2 ring-indigo-600" : ""} onClick={() => setSelectedCellId(cell.id)}><Select compact wrapLabels value={rowParameterValue(row)} options={rowParameterOptions(row)} placeholder="Parameter" onChange={(code) => { const parameter = parameters.find((value) => value.code === code); if (parameter) setRowParameter(rowIndex, parameter); }} onAdd={() => setNewParameter({ name: "", standard: "", source: "manual", rule: "none", ruleNumber: "", rowIndex })} /></div> : <input key={cell.id} className={`${input} ${selectedCellId === cell.id ? "ring-2 ring-indigo-600" : ""}`} value={cell.label || ""} onFocus={() => setSelectedCellId(cell.id)} onClick={() => setSelectedCellId(cell.id)} onChange={(event) => updateCell(rowIndex, cellIndex, { label: event.target.value })} placeholder={cellIndex === 0 ? "No." : cellIndex === 1 ? "Parameter" : cellIndex === 2 ? "Standard" : "Observation"} />)}<div className="flex gap-1"><button type="button" onClick={() => moveRow(rowIndex, -1)} className="rounded border border-black p-2" title="Move up"><ArrowUp size={14} /></button><button type="button" onClick={() => moveRow(rowIndex, 1)} className="rounded border border-black p-2" title="Move down"><ArrowDown size={14} /></button><button type="button" onClick={() => removeRow(rowIndex)} className="rounded border border-red-700 p-2 text-red-700" title="Remove row">×</button></div></div></div>)}</div>
        <div className="mt-4 rounded border-2 border-slate-300 bg-slate-50 p-3"><label className="mb-3 block space-y-1"><span className="font-black uppercase">Cell to Configure</span><select className={input} value={selectedCellId} onChange={(event) => setSelectedCellId(event.target.value)}><option value="">Select a cell</option>{cellOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>{selectedCell && <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4"><label className="space-y-1"><span className="text-xs font-bold">Cell Type</span><select className={input} value={selectedCell.kind} onChange={(event) => updateSelectedCell({ kind: event.target.value as CoaTemplateCell["kind"] })}><option value="static">Static label</option><option value="binding">Auto-filled binding</option><option value="input">Manual input</option></select></label><label className="space-y-1"><span className="text-xs font-bold">Input Type</span><select className={input} value={selectedCell.inputType || "text"} onChange={(event) => updateSelectedCell({ inputType: event.target.value as CoaTemplateCell["inputType"] })}><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="textarea">Long text</option><option value="select">Select</option></select></label><label className="space-y-1"><span className="text-xs font-bold">Source Binding</span><input className={input} value={selectedCell.binding || ""} onChange={(event) => updateSelectedCell({ binding: event.target.value || undefined })} /></label><label className="space-y-1"><span className="text-xs font-bold">Default Value</span><input className={input} value={selectedCell.defaultValue || ""} onChange={(event) => updateSelectedCell({ defaultValue: event.target.value || undefined })} /></label><label className="space-y-1"><span className="text-xs font-bold">Unit</span><input className={input} value={selectedCell.unit || ""} onChange={(event) => updateSelectedCell({ unit: event.target.value || undefined })} /></label><label className="space-y-1"><span className="text-xs font-bold">Background</span><input className={input} value={selectedCell.background || ""} onChange={(event) => updateSelectedCell({ background: event.target.value || undefined })} /></label><label className="space-y-1"><span className="text-xs font-bold">Text Color</span><input className={input} value={selectedCell.color || ""} onChange={(event) => updateSelectedCell({ color: event.target.value || undefined })} /></label><label className="space-y-1"><span className="text-xs font-bold">Alignment</span><select className={input} value={selectedCell.align || "center"} onChange={(event) => updateSelectedCell({ align: event.target.value as CoaTemplateCell["align"] })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><label className="space-y-1"><span className="text-xs font-bold">Colspan</span><input type="number" min="1" className={input} value={selectedCell.colSpan || 1} onChange={(event) => updateSelectedCell({ colSpan: Math.max(1, Number(event.target.value) || 1) })} /></label><label className="space-y-1"><span className="text-xs font-bold">Rowspan</span><input type="number" min="1" className={input} value={selectedCell.rowSpan || 1} onChange={(event) => updateSelectedCell({ rowSpan: Math.max(1, Number(event.target.value) || 1) })} /></label><label className="flex items-center gap-2 pt-5 font-bold"><input type="checkbox" checked={Boolean(selectedCell.required)} onChange={(event) => updateSelectedCell({ required: event.target.checked })} /> Required</label><label className="flex items-center gap-2 pt-5 font-bold"><input type="checkbox" checked={Boolean(selectedCell.bold)} onChange={(event) => updateSelectedCell({ bold: event.target.checked })} /> Bold</label><label className="flex items-center gap-2 pt-5 font-bold"><input type="checkbox" checked={Boolean(selectedCell.italic)} onChange={(event) => updateSelectedCell({ italic: event.target.checked })} /> Italic</label></div>}</div>
        <div className="mt-5 flex flex-wrap gap-2 border-t-2 border-black pt-3"><button type="button" onClick={() => void save()} className="inline-flex items-center gap-2 rounded bg-indigo-700 px-4 py-2 font-bold text-white"><Save size={16} /> Save Draft</button>{selected ? <span className="rounded bg-slate-100 px-3 py-2 text-sm font-bold">Version {selected.version} · {selected.status}</span> : <span className="rounded bg-slate-100 px-3 py-2 text-sm font-bold">New version will be created</span>}</div>
      </section>
    </div>
    <div className="rounded border-2 border-black bg-white p-3 text-sm font-semibold">Active templates: {activeCompanyTemplates.length}. Changes are versioned; existing COAs keep their original template snapshot.</div>
    {newParameter ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg space-y-3 rounded border-2 border-black bg-white p-4 shadow-xl">
        <div className="flex items-center justify-between border-b-2 border-black pb-2"><h3 className="font-black uppercase">New COA Parameter</h3><button type="button" onClick={() => setNewParameter(null)} className="rounded border-2 border-black p-1"><X size={14} /></button></div>
        <p className="text-xs font-semibold text-slate-600">Saved in COA Parameter Master (available to every template) and added to this template.</p>
        <label className="block text-xs font-black uppercase">Parameter name<input autoFocus className="mt-1 w-full rounded border-2 border-black bg-yellow-50 px-2 py-1.5 text-sm font-bold normal-case" value={newParameter.name} onChange={(e) => setNewParameter({ ...newParameter, name: e.target.value, error: "" })} placeholder="e.g. Ink Rub Test" /></label>
        <label className="block text-xs font-black uppercase">Standard (shown on the COA)<input className="mt-1 w-full rounded border-2 border-black bg-yellow-50 px-2 py-1.5 text-sm font-bold normal-case" value={newParameter.standard} onChange={(e) => setNewParameter({ ...newParameter, standard: e.target.value })} placeholder="e.g. Min 50 rubs (optional)" /></label>
        <div className="text-xs font-black uppercase">Observation comes from<div className="mt-1 normal-case"><Select compact value={newParameter.source} options={sourceOptions} onChange={(value) => setNewParameter({ ...newParameter, source: value || "manual" })} /></div></div>
        <div className="grid grid-cols-[1fr_7rem] gap-2"><div className="text-xs font-black uppercase">PASS rule<div className="mt-1 normal-case"><Select compact value={newParameter.rule} options={ruleOptions} onChange={(value) => setNewParameter({ ...newParameter, rule: value || "none" })} /></div></div>{["tol", "pct"].includes(newParameter.rule) ? <label className="block text-xs font-black uppercase">{newParameter.rule === "pct" ? "± %" : "± value"}<input type="number" className="mt-1 w-full rounded border-2 border-black bg-yellow-50 px-2 py-1.5 text-sm font-bold" value={newParameter.ruleNumber} onChange={(e) => setNewParameter({ ...newParameter, ruleNumber: e.target.value })} /></label> : null}</div>
        {newParameter.error ? <div className="rounded border-2 border-red-700 bg-red-50 p-2 text-sm font-bold text-red-800">{newParameter.error}</div> : null}
        <div className="flex justify-end gap-2 border-t-2 border-black pt-3"><button type="button" onClick={() => setNewParameter(null)} className="rounded border-2 border-black bg-white px-3 py-1.5 text-sm font-bold">Cancel</button><button type="button" disabled={newParameter.busy} onClick={saveNewParameter} className="inline-flex items-center gap-1 rounded border-2 border-black bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-60"><Save size={14} /> {newParameter.busy ? "Saving…" : "Save & Add"}</button></div>
      </div>
    </div> : null}
  </div>;
}
