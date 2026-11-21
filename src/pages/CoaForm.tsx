import { displayJobNo } from "../lib/jobNumber";
import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, Save } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Select } from "../components/Select";
import { useData } from "../hooks/useData";
import { useAuth } from "../auth/AuthContext";
import { canManageMasterRecords } from "../lib/masterPermissions";
import { activeTemplateForCompany, buildCoaSourceMap, buildInitialCellValues, getCoaCellValue, resolveCoaSourceContext, type CoaSourceContext, defaultCoaLayout } from "../lib/coa";
import { printCoaRecord } from "../lib/coaPrint";
import { getOrganizationLogoUrl } from "../lib/pdfLogo";
import { useNpdItemsWithoutStock } from "../hooks/useNpdItems";
import { resolveCsStandard } from "../lib/pdiResult";
import { COA_PDI_MESSAGE, coaPdiBlockMessage, latestPdiByProduction, pdiStatusByProduction, type JobPdiStatus } from "../lib/coaPdiGate";
import { buildJobLoadingRecords } from "../lib/jobLoadingRecords";
import type { BoardLineQcCheck, Company, CoaCellValue, CoaRecord, CoaTemplate, DispatchPlan, Firm, Invoice, InvoiceLineItem, LoadingSlip, Order, OrderSchedule, PreDispatchInspection, PrintingQcCheck, Production, Setting } from "../types";

const field = "w-full rounded border-2 border-black bg-white px-3 py-2 text-sm";
const text = (value: unknown) => String(value ?? "").trim();

function cellRows(layout: ReturnType<typeof defaultCoaLayout>) {
  return [...layout.metadataRows, ...layout.parameterRows, ...layout.footerRows];
}

export function CoaForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, activeFirm } = useAuth();
  const canManage = canManageMasterRecords(user?.role);
  const [productions] = useData<Production>("productions", [], { firmScope: "all" });
  const [companies] = useData<Company>("companies", [], { firmScope: "all" });
  const [firms] = useData<Firm>("firms", [], { firmScope: "all" });
  const [orders] = useData<Order>("orders", [], { firmScope: "all" });
  const [schedules] = useData<OrderSchedule>("orders_schedule", [], { firmScope: "all" });
  const [invoices] = useData<Invoice>("invoices", [], { firmScope: "all" });
  const [invoiceLines] = useData<InvoiceLineItem>("invoice_line_items", [], { firmScope: "all" });
  const [pdis] = useData<PreDispatchInspection>("pre_dispatch_inspections", [], { firmScope: "all" });
  // Loading slips and plans: which invoices belong to the job.
  const [loadingSlips] = useData<LoadingSlip>("loading_slips", [], { firmScope: "all" });
  const [dispatchPlans] = useData<DispatchPlan>("dispatch_plans", [], { firmScope: "all" });
  const [boardlineRows] = useData<BoardLineQcCheck>("boardline_qc_checks", [], { firmScope: "all" });
  const [printingRows] = useData<PrintingQcCheck>("printing_qc_checks", [], { firmScope: "all" });
  const [templates] = useData<CoaTemplate>("coa-templates", []);
  const [settings] = useData<Setting>("settings", []);
  const npdItems = useNpdItemsWithoutStock();
  const [records, , , api] = useData<CoaRecord>("coa-records", []);
  const [productionId, setProductionId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [layout, setLayout] = useState(defaultCoaLayout());
  const [headerData, setHeaderData] = useState<Record<string, string>>({ coaDate: new Date().toISOString().slice(0, 10) });
  const [cellValues, setCellValues] = useState<Record<string, CoaCellValue>>({});
  const [editingRecord, setEditingRecord] = useState<CoaRecord | null>(null);
  const [loadedId, setLoadedId] = useState("");
  const [message, setMessage] = useState("");
  // A job picked whose PDI is FAIL / not recorded: only its message is shown, no data.
  const [blocked, setBlocked] = useState<{ jobId: string; status: JobPdiStatus; text: string } | null>(null);
  const production = productions.find((value) => value.id === productionId);
  // COA only for jobs whose latest PDI is PASS; the COA's PDI values come from that same PDI.
  const latestPdi = useMemo(() => latestPdiByProduction(productions, pdis), [pdis, productions]);
  // No CS Std on the item (and no CS Required on the PDI) + all checks OK also allows COA.
  const pdiStatus = useMemo(() => {
    const productionById = new Map(productions.map((job) => [job.id, job]));
    return pdiStatusByProduction(productions, pdis, (jobId, inspection) => {
      const job = productionById.get(jobId) as any;
      const item = (npdItems as any[]).find((value) => String(value.id) === String(job?.itemId || job?.npdId) || (text(value.erp) && text(value.erp) === text(job?.erpCode || job?.masterErp || inspection.erpCode)));
      return resolveCsStandard(item?.csKgStd, inspection.csRequired);
    });
  }, [npdItems, pdis, productions]);
  const pdiPassed = (jobId: string) => pdiStatus.get(jobId) === "PASS";
  const jobLoading = useMemo(() => buildJobLoadingRecords(productions, loadingSlips, dispatchPlans), [productions, loadingSlips, dispatchPlans]);
  const contextFor = (job: Production) => resolveCoaSourceContext(job, companies, firms, orders, schedules, invoices, invoiceLines, pdis, boardlineRows, printingRows, npdItems as any[], jobLoading.get(job.id) || [], latestPdi.get(job.id) || null);
  const context = useMemo<CoaSourceContext | undefined>(() => production ? contextFor(production) : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boardlineRows, companies, firms, invoiceLines, invoices, npdItems, orders, pdis, printingRows, production, schedules, jobLoading, latestPdi]);
  const sourceMap = useMemo(() => context ? buildCoaSourceMap(context, headerData.coaDate || new Date().toISOString().slice(0, 10)) : {}, [context, headerData.coaDate]);
  const activeTemplate = context?.company ? activeTemplateForCompany(templates, context.company.id) : undefined;
  const pdiTag = (status?: JobPdiStatus) => status === "PASS" ? "✅ PDI PASS" : status === "FAIL" ? "❌ PDI FAIL" : status === "PENDING" ? "⚠️ PDI not PASS" : "⚠️ PDI not recorded";
  const jobOptions = productions.filter((value) => value.status !== "Cancelled").map((value) => ({ value: value.id, label: `${displayJobNo(text(value.transactionNo || value.jobCardNo))} – ${pdiTag(pdiStatus.get(value.id))}`, searchText: `${value.transactionNo || value.jobCardNo} ${displayJobNo(value.transactionNo || value.jobCardNo)} ${value.companyName || ""} ${value.erpCode || value.masterErp || ""}` }));
  const isReadOnly = editingRecord?.status === "Final" && !canManage;

  useEffect(() => {
    if (!id || loadedId === id || !records.length) return;
    const record = records.find((value) => value.id === id);
    if (!record) return setMessage("COA record not found.");
    if (!pdis.length || !productions.length) return; // wait for the PDIs before checking
    if (!pdiPassed(record.productionId)) { setLoadedId(id); const status = pdiStatus.get(record.productionId) || "NONE"; setBlocked({ jobId: record.productionId, status, text: coaPdiBlockMessage(status, record.jobNo || "") }); setMessage(""); return; }
    setLoadedId(id); setEditingRecord(record); setProductionId(record.productionId); setTemplateId(record.templateId); setLayout(record.templateSnapshot || defaultCoaLayout()); setHeaderData(record.headerData || {}); setCellValues(record.cellValues || {});
  }, [id, loadedId, records, pdis, productions, pdiStatus]);

  const selectJob = (nextProductionId: string) => {
    const nextProduction = productions.find((value) => value.id === nextProductionId);
    if (!nextProduction) return;
    if (!pdiPassed(nextProductionId)) {
      // FAIL / not recorded: show only the message; clear everything else.
      const status = pdiStatus.get(nextProductionId) || "NONE";
      setBlocked({ jobId: nextProductionId, status, text: coaPdiBlockMessage(status, displayJobNo(text(nextProduction.transactionNo || nextProduction.jobCardNo))) });
      setEditingRecord(null); setProductionId(""); setTemplateId(""); setLayout(defaultCoaLayout()); setHeaderData({ coaDate: new Date().toISOString().slice(0, 10) }); setCellValues({}); setMessage("");
      return;
    }
    setBlocked(null);
    const nextContext = contextFor(nextProduction);
    const nextTemplate = nextContext.company ? activeTemplateForCompany(templates, nextContext.company.id) : undefined;
    setEditingRecord(null); setProductionId(nextProductionId); setTemplateId(nextTemplate?.id || ""); setLayout(nextTemplate?.layout || defaultCoaLayout()); setHeaderData(buildCoaSourceMap(nextContext)); setCellValues(nextTemplate ? buildInitialCellValues(nextTemplate.layout, buildCoaSourceMap(nextContext)) : {}); setMessage(nextTemplate ? "" : "No active COA template is configured for this customer company.");
  };
  // ?productionId= (PDI Report → Generate COA) opens the form with that job selected.
  const [searchParams] = useSearchParams();
  const presetDone = useRef(false);
  useEffect(() => {
    const preset = searchParams.get("productionId");
    if (id || presetDone.current || !preset || productionId) return;
    if (!productions.some((value) => value.id === preset) || !companies.length || !templates.length || !pdis.length || !loadingSlips.length) return;
    presetDone.current = true;
    selectJob(preset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, searchParams, productions, companies, templates, productionId, pdis, loadingSlips]);
  // Template fields still blank (to fill by hand or fix the source entry). Saving is still allowed.
  const missingFields = useMemo(() => {
    if (!templateId || !production) return [] as string[];
    const missing: string[] = [];
    if (!text(headerData.invoiceNo)) missing.push("Invoice No.");
    if (!text(headerData.invoiceQty)) missing.push("Invoice Qty.");
    cellRows(layout).forEach((row) => {
      const name = text(row.cells.find((cell: any) => cell.kind === "static" && text(cell.label))?.label);
      row.cells.forEach((cell: any) => {
        if (cell.kind !== "binding") return;
        if (!text(getCoaCellValue(cell, cellValues, sourceMap, headerData))) missing.push(name || text(cell.label) || text(cell.binding));
      });
    });
    return [...new Set(missing)];
  }, [cellValues, headerData, layout, production, sourceMap, templateId]);
  const updateHeader = (key: string, value: string) => setHeaderData((current) => ({ ...current, [key]: value }));
  const updateCell = (cellId: string, value: string) => setCellValues((current) => ({ ...current, [cellId]: { ...(current[cellId] || {}), value, source: "manual" } }));
  const buildRecord = (): CoaRecord | null => {
    if (!production || !context?.company || !templateId) return null;
    const template = templates.find((value) => value.id === templateId);
    const now = new Date().toISOString();
    return { id: editingRecord?.id || crypto.randomUUID(), coaNo: editingRecord?.coaNo || `COA-${new Date().getFullYear()}-${Date.now()}`, templateId, templateVersion: editingRecord?.templateVersion || template?.version || 1, templateSnapshot: editingRecord?.templateSnapshot || layout, companyId: context.company.id, companyName: context.company.name, firmId: activeFirm?.id || context.firm?.id, firmName: activeFirm?.firmName || context.firm?.firmName || production.firmName, productionId: production.id, jobNo: text(production.transactionNo || production.jobCardNo), erpCode: headerData.erpCode || sourceMap.erpCode, itemName: headerData.itemName || sourceMap.itemName, invoiceNo: headerData.invoiceNo || "", invoiceQty: headerData.invoiceQty || "", batchNo: headerData.batchNo || "", coaDate: headerData.coaDate || now.slice(0, 10), headerData, cellValues, status: editingRecord?.status === "Final" ? "Final" : "Draft", createdBy: editingRecord?.createdBy || text(user?.userId || user?.name), createdTimestamp: editingRecord?.createdTimestamp || now, updatedBy: text(user?.userId || user?.name) || "System User", updateTimestamp: now };
  };
  const preview = () => {
    const record = buildRecord();
    if (!record) return setMessage("Select a Job No. with a customer that has an active COA template.");
    printCoaRecord(record, { name: record.firmName || activeFirm?.firmName || "", logo: getOrganizationLogoUrl(settings[0]) });
  };
  const save = async () => {
    if (!production || !context?.company || !templateId) return setMessage("Select a Job No. with a customer that has an active COA template.");
    if (isReadOnly) return setMessage("Final COAs cannot be edited by this user.");
    if (!pdiPassed(production.id)) return setMessage(COA_PDI_MESSAGE);
    const record = buildRecord();
    if (!record) return setMessage("Unable to build COA record.");
    try { if (editingRecord) await api.saveItem(record); else await api.addItem(record); navigate("/quality/coa/master", { replace: true }); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save COA."); }
  };
  const renderCell = (cell: any) => {
    const value = cell.kind === "static" ? cell.label || "" : getCoaCellValue(cell, cellValues, sourceMap, headerData);
    const styles = { backgroundColor: cell.background || "transparent", color: cell.color || "#111", fontWeight: cell.bold ? 700 : 400, fontStyle: cell.italic ? "italic" : "normal", textAlign: cell.align || "center" } as const;
    return <td key={cell.id} colSpan={Math.max(1, cell.colSpan || 1)} rowSpan={Math.max(1, cell.rowSpan || 1)} style={styles} className="border border-black p-1 align-middle">{cell.kind === "static" ? <span className="whitespace-pre-wrap">{value}</span> : cell.inputType === "textarea" ? <textarea className={`${field} min-h-16 border-black bg-white`} value={value} disabled={isReadOnly} onChange={(event) => updateCell(cell.id, event.target.value)} /> : <input className={`${field} border-black bg-white`} type={cell.inputType === "number" || cell.inputType === "date" ? cell.inputType : "text"} value={value} disabled={isReadOnly} required={cell.required} onChange={(event) => updateCell(cell.id, event.target.value)} />}</td>;
  };

  return <div className="space-y-5 text-black"><div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black pb-3"><div><h2 className="text-xl font-bold uppercase">COA Form</h2><p className="text-sm font-semibold text-slate-600">Company-wise COA generation</p></div></div>{message && <div className="rounded border-2 border-amber-700 bg-amber-50 p-3 font-bold">{message}</div>}{blocked ? <div role="alert" className={`rounded border-2 p-4 text-lg font-black ${blocked.status === "FAIL" ? "border-red-700 bg-red-50 text-red-800" : "border-amber-700 bg-amber-50 text-amber-900"}`}>{blocked.text}</div> : null}{!blocked && missingFields.length ? <div className="rounded border-2 border-yellow-600 bg-yellow-50 p-3 text-sm font-bold text-yellow-900">Not found (fill by hand or fix the source entry): {missingFields.join(", ")}</div> : null}<section className="rounded border-2 border-black bg-white p-4"><h3 className="mb-4 bg-cyan-800 p-3 font-bold uppercase text-white">Job Details</h3><div className={`grid gap-3 md:grid-cols-2 xl:grid-cols-4 ${blocked ? "[&>label:not(:first-child)]:hidden" : ""}`}><label className="space-y-1 xl:col-span-2"><span className="font-bold">Job No. *</span><Select value={productionId || blocked?.jobId || ""} onChange={selectJob} options={jobOptions} placeholder="Select Job No." disabled={Boolean(editingRecord)} /></label><label className="space-y-1"><span className="font-bold">Customer Company</span><input className={`${field} bg-slate-200`} readOnly value={context?.company?.name || headerData.companyName || ""} /></label><label className="space-y-1"><span className="font-bold">Internal Firm</span><input className={`${field} bg-slate-200`} readOnly value={activeFirm?.firmName || context?.firm?.firmName || headerData.firmName || ""} /></label><label className="space-y-1"><span className="font-bold">ERP</span><input className={`${field} bg-slate-200`} readOnly value={headerData.erpCode || sourceMap.erpCode || ""} /></label><label className="space-y-1"><span className="font-bold">Item</span><input className={`${field} bg-slate-200`} readOnly value={headerData.itemName || sourceMap.itemName || ""} /></label><label className="space-y-1"><span className="font-bold">COA Date *</span><input type="date" className={field} value={headerData.coaDate || ""} disabled={isReadOnly} onChange={(event) => updateHeader("coaDate", event.target.value)} /></label><label className="space-y-1"><span className="font-bold">Invoice No.</span><input className={field} value={headerData.invoiceNo || ""} disabled={isReadOnly} onChange={(event) => updateHeader("invoiceNo", event.target.value)} /></label><label className="space-y-1"><span className="font-bold">Invoice Qty.</span><input className={field} value={headerData.invoiceQty || ""} disabled={isReadOnly} onChange={(event) => updateHeader("invoiceQty", event.target.value)} /></label><label className="space-y-1"><span className="font-bold">Batch No.</span><input className={field} value={headerData.batchNo || ""} disabled={isReadOnly} onChange={(event) => updateHeader("batchNo", event.target.value)} /></label></div></section>{blocked ? null : templateId ? <section className="rounded border-2 border-black bg-white p-4"><div className="mb-4 border-b-2 border-black pb-2"><h3 className="text-lg font-black uppercase">{layout.title}</h3><p className="text-sm font-semibold text-slate-600">Template version {templates.find((value) => value.id === templateId)?.version || editingRecord?.templateVersion || "historical"}</p></div><div className="overflow-auto"><table className="min-w-[900px] border-collapse text-xs"><tbody>{cellRows(layout).map((row) => <tr key={row.id}>{row.cells.map(renderCell)}</tr>)}</tbody></table></div><div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t-2 border-black pt-3"><button type="button" onClick={preview} className="inline-flex items-center gap-2 rounded border-2 border-black bg-white px-4 py-2 font-bold"><Eye size={16} /> Preview / Print</button><button type="button" onClick={() => void save()} disabled={isReadOnly} className="inline-flex items-center gap-2 rounded bg-indigo-700 px-4 py-2 font-bold text-white disabled:opacity-50"><Save size={16} /> Save Draft</button></div></section> : <div className="rounded border-2 border-black bg-white p-8 text-center font-bold">Select a Job No. to load its active company template.</div>}</div>;
}
