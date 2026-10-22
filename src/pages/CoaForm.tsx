import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Eye, Save } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Select } from "../components/Select";
import { useData } from "../hooks/useData";
import { useAuth } from "../auth/AuthContext";
import { canManageMasterRecords } from "../lib/masterPermissions";
import { activeTemplateForCompany, buildCoaSourceMap, buildInitialCellValues, getCoaCellValue, resolveCoaSourceContext, type CoaSourceContext, defaultCoaLayout } from "../lib/coa";
import { printCoaRecord } from "../lib/coaPrint";
import type { BoardLineQcCheck, Company, CoaCellValue, CoaRecord, CoaTemplate, Firm, Invoice, InvoiceLineItem, Order, OrderSchedule, PreDispatchInspection, PrintingQcCheck, Production } from "../types";

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
  const [boardlineRows] = useData<BoardLineQcCheck>("boardline_qc_checks", [], { firmScope: "all" });
  const [printingRows] = useData<PrintingQcCheck>("printing_qc_checks", [], { firmScope: "all" });
  const [templates] = useData<CoaTemplate>("coa-templates", []);
  const [records, , , api] = useData<CoaRecord>("coa-records", []);
  const [productionId, setProductionId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [layout, setLayout] = useState(defaultCoaLayout());
  const [headerData, setHeaderData] = useState<Record<string, string>>({ coaDate: new Date().toISOString().slice(0, 10) });
  const [cellValues, setCellValues] = useState<Record<string, CoaCellValue>>({});
  const [editingRecord, setEditingRecord] = useState<CoaRecord | null>(null);
  const [loadedId, setLoadedId] = useState("");
  const [message, setMessage] = useState("");
  const production = productions.find((value) => value.id === productionId);
  const context = useMemo<CoaSourceContext | undefined>(() => production ? resolveCoaSourceContext(production, companies, firms, orders, schedules, invoices, invoiceLines, pdis, boardlineRows, printingRows) : undefined, [boardlineRows, companies, firms, invoiceLines, invoices, orders, pdis, printingRows, production, schedules]);
  const sourceMap = useMemo(() => context ? buildCoaSourceMap(context, headerData.coaDate || new Date().toISOString().slice(0, 10)) : {}, [context, headerData.coaDate]);
  const activeTemplate = context?.company ? activeTemplateForCompany(templates, context.company.id) : undefined;
  const jobOptions = productions.filter((value) => value.status !== "Cancelled").map((value) => ({ value: value.id, label: text(value.transactionNo || value.jobCardNo), searchText: `${value.transactionNo || value.jobCardNo} ${value.companyName || ""} ${value.erpCode || value.masterErp || ""}` }));
  const isReadOnly = editingRecord?.status === "Final" && !canManage;

  useEffect(() => {
    if (!id || loadedId === id || !records.length) return;
    const record = records.find((value) => value.id === id);
    if (!record) return setMessage("COA record not found.");
    setLoadedId(id); setEditingRecord(record); setProductionId(record.productionId); setTemplateId(record.templateId); setLayout(record.templateSnapshot || defaultCoaLayout()); setHeaderData(record.headerData || {}); setCellValues(record.cellValues || {});
  }, [id, loadedId, records]);

  const selectJob = (nextProductionId: string) => {
    const nextProduction = productions.find((value) => value.id === nextProductionId);
    if (!nextProduction) return;
    const nextContext = resolveCoaSourceContext(nextProduction, companies, firms, orders, schedules, invoices, invoiceLines, pdis, boardlineRows, printingRows);
    const nextTemplate = nextContext.company ? activeTemplateForCompany(templates, nextContext.company.id) : undefined;
    setEditingRecord(null); setProductionId(nextProductionId); setTemplateId(nextTemplate?.id || ""); setLayout(nextTemplate?.layout || defaultCoaLayout()); setHeaderData(buildCoaSourceMap(nextContext)); setCellValues(nextTemplate ? buildInitialCellValues(nextTemplate.layout, buildCoaSourceMap(nextContext)) : {}); setMessage(nextTemplate ? "" : "No active COA template is configured for this customer company.");
  };
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
    printCoaRecord(record, { name: record.firmName || activeFirm?.firmName || "", logo: activeFirm?.logo || "" });
  };
  const save = async () => {
    if (!production || !context?.company || !templateId) return setMessage("Select a Job No. with a customer that has an active COA template.");
    if (isReadOnly) return setMessage("Final COAs cannot be edited by this user.");
    const record = buildRecord();
    if (!record) return setMessage("Unable to build COA record.");
    try { if (editingRecord) await api.saveItem(record); else await api.addItem(record); navigate("/quality/coa/master", { replace: true }); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save COA."); }
  };
  const renderCell = (cell: any) => {
    const value = cell.kind === "static" ? cell.label || "" : getCoaCellValue(cell, cellValues, sourceMap, headerData);
    const styles = { backgroundColor: cell.background || "transparent", color: cell.color || "#111", fontWeight: cell.bold ? 700 : 400, fontStyle: cell.italic ? "italic" : "normal", textAlign: cell.align || "center" } as const;
    return <td key={cell.id} colSpan={Math.max(1, cell.colSpan || 1)} rowSpan={Math.max(1, cell.rowSpan || 1)} style={styles} className="border border-black p-1 align-middle">{cell.kind === "static" ? <span className="whitespace-pre-wrap">{value}</span> : cell.inputType === "textarea" ? <textarea className={`${field} min-h-16 border-black bg-white`} value={value} disabled={isReadOnly} onChange={(event) => updateCell(cell.id, event.target.value)} /> : <input className={`${field} border-black bg-white`} type={cell.inputType === "number" || cell.inputType === "date" ? cell.inputType : "text"} value={value} disabled={isReadOnly} required={cell.required} onChange={(event) => updateCell(cell.id, event.target.value)} />}</td>;
  };

  return <div className="space-y-5 text-black"><div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black pb-3"><div><h2 className="text-xl font-bold uppercase">Certificate of Analysis</h2><p className="text-sm font-semibold text-slate-600">Company-wise COA generation</p></div><button type="button" onClick={() => navigate("/quality/coa/master")} className="inline-flex items-center gap-2 rounded border-2 border-black bg-white px-3 py-2 font-bold"><ArrowLeft size={16} /> Back</button></div>{message && <div className="rounded border-2 border-amber-700 bg-amber-50 p-3 font-bold">{message}</div>}<section className="rounded border-2 border-black bg-white p-4"><h3 className="mb-4 bg-cyan-800 p-3 font-bold uppercase text-white">Job Details</h3><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><label className="space-y-1 xl:col-span-2"><span className="font-bold">Job No. *</span><Select value={productionId} onChange={selectJob} options={jobOptions} placeholder="Select Job No." disabled={Boolean(editingRecord)} /></label><label className="space-y-1"><span className="font-bold">Customer Company</span><input className={`${field} bg-slate-200`} readOnly value={context?.company?.name || headerData.companyName || ""} /></label><label className="space-y-1"><span className="font-bold">Internal Firm</span><input className={`${field} bg-slate-200`} readOnly value={activeFirm?.firmName || context?.firm?.firmName || headerData.firmName || ""} /></label><label className="space-y-1"><span className="font-bold">ERP</span><input className={`${field} bg-slate-200`} readOnly value={headerData.erpCode || sourceMap.erpCode || ""} /></label><label className="space-y-1"><span className="font-bold">Item</span><input className={`${field} bg-slate-200`} readOnly value={headerData.itemName || sourceMap.itemName || ""} /></label><label className="space-y-1"><span className="font-bold">COA Date *</span><input type="date" className={field} value={headerData.coaDate || ""} disabled={isReadOnly} onChange={(event) => updateHeader("coaDate", event.target.value)} /></label><label className="space-y-1"><span className="font-bold">Invoice No.</span><input className={field} value={headerData.invoiceNo || ""} disabled={isReadOnly} onChange={(event) => updateHeader("invoiceNo", event.target.value)} /></label><label className="space-y-1"><span className="font-bold">Invoice Qty.</span><input className={field} value={headerData.invoiceQty || ""} disabled={isReadOnly} onChange={(event) => updateHeader("invoiceQty", event.target.value)} /></label><label className="space-y-1"><span className="font-bold">Batch No.</span><input className={field} value={headerData.batchNo || ""} disabled={isReadOnly} onChange={(event) => updateHeader("batchNo", event.target.value)} /></label></div></section>{templateId ? <section className="rounded border-2 border-black bg-white p-4"><div className="mb-4 border-b-2 border-black pb-2"><h3 className="text-lg font-black uppercase">{layout.title}</h3><p className="text-sm font-semibold text-slate-600">Template version {templates.find((value) => value.id === templateId)?.version || editingRecord?.templateVersion || "historical"}</p></div><div className="overflow-auto"><table className="min-w-[900px] border-collapse text-xs"><tbody>{cellRows(layout).map((row) => <tr key={row.id}>{row.cells.map(renderCell)}</tr>)}</tbody></table></div><div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t-2 border-black pt-3"><button type="button" onClick={preview} className="inline-flex items-center gap-2 rounded border-2 border-black bg-white px-4 py-2 font-bold"><Eye size={16} /> Preview / Print</button><button type="button" onClick={() => void save()} disabled={isReadOnly} className="inline-flex items-center gap-2 rounded bg-indigo-700 px-4 py-2 font-bold text-white disabled:opacity-50"><Save size={16} /> Save Draft</button></div></section> : <div className="rounded border-2 border-black bg-white p-8 text-center font-bold">Select a Job No. to load its active company template.</div>}</div>;
}
