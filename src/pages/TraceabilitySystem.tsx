import { useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, ExternalLink, FileText, Printer, Search } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useData } from "../hooks/useData";
import { useNpdItems } from "../hooks/useNpdItems";
import type {
  BoardLineQcCheck,
  Company,
  DispatchPlan,
  Invoice,
  InvoiceLineItem,
  LoadingSlip,
  Order,
  OrderSchedule,
  PreDispatchInspection,
  PrintingQcCheck,
  Production,
  ProductionProcessing,
  QcUpdateRecord,
  QualityComplaint,
  Truck,
  Item,
} from "../types";
import {
  buildTraceabilityRecords,
  filterTraceabilityRecords,
  type TraceabilityRecord,
  type TraceabilityValue,
} from "../lib/traceabilityData";

const text = (value: unknown) => String(value ?? "").trim();
const display = (value: unknown) => text(value) || "—";
const isLink = (value: unknown) => /^(https?:\/\/|\/uploads\/)/i.test(text(value));

function LinkValue({ value, label = "Open" }: { value: unknown; label?: string }) {
  if (!isLink(value)) return <>{display(value)}</>;
  return <a href={text(value)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded bg-indigo-700 px-2 py-1 text-[11px] font-bold text-white traceability-link"><ExternalLink size={12} />{label}</a>;
}

function Field({ label, value, className = "", link = false, linkLabel = "Open" }: { label: string; value: ReactNode; className?: string; link?: boolean; linkLabel?: string }) {
  const plainValue = typeof value === "string" || typeof value === "number" ? display(value) : value;
  return <div className={`traceability-field ${className}`}><div className="traceability-label">{label}</div><div className="traceability-value">{link ? <LinkValue value={value} label={linkLabel} /> : plainValue}</div></div>;
}

function SectionTitle({ children }: { children: string }) {
  return <div className="traceability-section-title col-span-full">{children}</div>;
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="traceability-section"><SectionTitle>{title}</SectionTitle><div className="traceability-grid">{children}</div></section>;
}

function StatusBadge({ status }: { status: TraceabilityRecord["status"] }) {
  const color = status === "JOB OPEN" ? "bg-lime-400 text-black" : status === "JOB CLOSED" ? "bg-emerald-500 text-white" : "bg-red-600 text-white";
  return <span className={`inline-flex items-center justify-center rounded px-3 py-1 text-xs font-black ${color}`}>{status}</span>;
}

function PdiResultBadge({ result }: { result: string }) {
  const normalized = text(result).toUpperCase();
  const color = normalized === "QC PASS" ? "bg-lime-400 text-black" : normalized === "QC FAIL" ? "bg-red-600 text-white" : "bg-yellow-300 text-black";
  return <span className={`inline-flex items-center justify-center rounded px-3 py-1 text-xs font-black ${color}`}>{display(result)}</span>;
}

function traceabilityInputs(
  productions: Production[],
  items: Item[],
  companies: Company[],
  orders: Order[],
  schedules: OrderSchedule[],
  processing: ProductionProcessing[],
  boardline: BoardLineQcCheck[],
  printing: PrintingQcCheck[],
  inspections: PreDispatchInspection[],
  dispatchPlans: DispatchPlan[],
  loadingSlips: LoadingSlip[],
  invoices: Invoice[],
  invoiceLineItems: InvoiceLineItem[],
  trucks: Truck[],
  qcUpdates: QcUpdateRecord[],
  complaints: QualityComplaint[],
) {
  return { productions, items, companies, orders, schedules, processing, boardline, printing, inspections, dispatchPlans, loadingSlips, invoices, invoiceLineItems, trucks, qcUpdates, complaints };
}

function DetailView({ record, onBack }: { record: TraceabilityRecord; onBack: () => void }) {
  const field = (label: string, value: TraceabilityValue, className?: string) => <Field label={label} value={value} className={className} />;
  return <div className="traceability-detail space-y-3">
    <div className="traceability-detail-actions flex flex-wrap items-center justify-between gap-2 border-b-2 border-black pb-2">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded border-2 border-black bg-white px-3 py-2 text-sm font-bold"><ArrowLeft size={16} />Back to Traceability List</button>
      <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded bg-indigo-700 px-3 py-2 text-sm font-bold text-white"><Printer size={16} />Print Traceability</button>
    </div>

    <div className="traceability-sheet">
      <div className="traceability-company-header">{display(record.firmName || "LAXMI NARAYAN CORRUGATED BOARDS LLP.")}</div>
      <div className="traceability-document-title">TRACEABILITY SYSTEM</div>

      <section className="traceability-section">
        <div className="traceability-grid traceability-identity-grid">
          <Field label="LOT NO." value={record.lotNo} className="traceability-lot" />
          <Field label="JOB NO." value={record.jobNo} />
          <Field label="JOB STATUS" value={<StatusBadge status={record.status} />} className="traceability-status" />
          <Field label="ITEM NAME" value={record.itemName} className="col-span-full" />
          <Field label="PARTY NAME" value={record.partyName} className="col-span-full" />
          <Field label="ERP CODE" value={record.erpCode} className="col-span-full" />
        </div>
      </section>

      <DetailSection title="PLANNING INFORMATION">
        {field("PLAN QUANTITY (PCS)", record.planning.planQuantity)}
        {field("PLANNED DATE OF PRODUCTION", record.planning.plannedDate)}
        {field("JOB WEIGHT (KG)", record.planning.jobWeightKg)}
        {field("CALCULATED REALIZATION / KG", record.planning.realizationPerKg)}
        <Field label="CUSTOMER SPECIFICATION" value={record.planning.customerSpecification} link />
        <Field label="CUSTOMER ARTWORK" value={record.planning.customerArtwork} link />
      </DetailSection>

      <DetailSection title="BOARDLINE INFORMATION">
        {field("QUANTITY PRODUCED (PCS)", record.boardline.quantityProducedPcs)}
        {field("PAPER REQUIRED (KG)", record.boardline.paperRequiredKg)}
        {field("PAPER USED (KG)", record.boardline.paperUsedKg)}
        {field("PAPER WASTAGE (%)", record.boardline.paperWastagePercent)}
        {field("BOARD WASTAGE (PCS)", record.boardline.boardWastagePcs)}
        {field("BOARD WASTAGE (%)", record.boardline.boardWastagePercent)}
        {field("QC EXECUTIVE", record.boardline.qcExecutive)}
        {field("RAPC", record.boardline.rapc)}
        {field("CUTTING SIZE (MM)", record.boardline.cuttingSizeMm)}
        {field("UPS", record.boardline.ups)}
        {field("PLY", record.boardline.ply)}
        {field("FLUTE", record.boardline.flute)}
        {field("PAPER SPEC", record.boardline.paperSpec, "col-span-2")}
        {field("SIZE (L X W X H) MM", record.boardline.sizeLxWxHmm)}
        {field("PLANNED PAPER", record.boardline.plannedPaper)}
        {field("SHEET PLANT REQUIRED SIZE", record.boardline.sheetPlantRequiredSize)}
        {field("SHEET PLANT PRODUCED SIZE - OP", record.boardline.sheetPlantProducedSize)}
        {field("SHEET PLANT PRODUCED SIZE - DR", record.boardline.sheetPlantProducedSizeDr)}
        {field("CUTTING SIZE PRODUCED (MM)", record.boardline.cuttingSizeProduced)}
        {field("TYPE OF FLUTE PRODUCED", record.boardline.typeOfFluteProduced)}
        {field("B.GSM ACHIEVED", record.boardline.bgsmAchieved)}
        {field("BOARD THICKNESS ACHIEVED", record.boardline.boardThicknessAchieved)}
        {field("SHEET WEIGHT (GRAMS) ACHIEVED", record.boardline.sheetWeightGramsAchieved)}
        {field("MOISTURE ACHIEVED", record.boardline.moistureAchieved)}
      </DetailSection>

      <DetailSection title="CONVERTING INFORMATION">
        {field("QUANTITY PRODUCED", record.converting.quantityProduced)}
        {field("SIZE (L X W X H) ACHIEVED", record.converting.sizeAchieved, "col-span-2")}
        {field("BOARD THICKNESS ACHIEVED", record.converting.boardThicknessAchieved)}
        {field("PRINTING COLOUR REQUIRED", record.converting.printingColourRequired)}
        {field("PRINTING COLOUR IDENTIFIED", record.converting.printingColourIdentified)}
        {field("BOX WEIGHT ACHIEVED (GRAMS)", record.converting.boxWeightGrams)}
        {field("STANDARD CS (KG)", record.converting.standardCsKg)}
        {field("ACHIEVED CS (KG)", record.converting.achievedCsKg)}
        {field("STANDARD BS (KG/CM2)", record.converting.standardBsKg)}
        {field("ACHIEVED BS (KG/CM2)", record.converting.achievedBsKg)}
        {field("OPERATOR-INCHARGE", record.converting.operatorIncharge)}
        {field("QC INSPECTOR", record.converting.qcInspector)}
      </DetailSection>

      <DetailSection title="PRE-DISPATCH INSPECTION REPORT">
        {field("BOX SIZE REQUIRED (MM)", record.pdi.boxSizeRequired)}
        {field("BOX SIZE ACHIEVED (MM)", record.pdi.boxSizeAchieved)}
        {field("CS ACHIEVED / CS REQUIRED (KG)", record.pdi.csAchievedRequired)}
        {field("B.GSM ACHIEVED", record.pdi.bgsmAchieved)}
        {field("BOX WEIGHT ACHIEVED (GRAMS)", record.pdi.boxWeightAchievedGrams)}
        {field("ARTWORK CHECK (APPROVED ARTWORK)", record.pdi.artworkCheck)}
        {field("PRINTING COLOR CHECK (VISUAL)", record.pdi.printingColorCheck)}
        {field("BOX SQUARING CHECK (VISUAL)", record.pdi.boxSquaringCheck)}
        {field("FLAP GAP CHECK (VISUAL)", record.pdi.flapGapCheck)}
        {field("JOINT PASTING / DELAMINATION CHECK", record.pdi.jointPastingDelaminationCheck)}
        {field("REMARKS (IF ANY)", record.pdi.remarks, "col-span-2")}
        <Field label="BOX PHOTO (FRONT)" value={record.pdi.frontPhoto} link linkLabel="Open Photo" />
        <Field label="BOX PHOTO (BACK)" value={record.pdi.backPhoto} link linkLabel="Open Photo" />
        {field("QC INSPECTOR", record.pdi.qcInspector)}
        <Field label="PDI RESULT" value={<PdiResultBadge result={record.pdi.result} />} className="traceability-pdi-result" />
      </DetailSection>

      <DetailSection title="DISPATCH DETAILS">
        {field("PLANNED QUANTITY (PCS)", record.dispatch.plannedQuantity)}
        {field("DISPATCH QUANTITY (PCS)", record.dispatch.dispatchQuantity)}
        {field("DISPATCH DATE", record.dispatch.dispatchDate)}
        {field("INVOICE NO.", record.dispatch.invoiceNo)}
        {field("RATE", record.dispatch.rate)}
        {field("SALE VALUE (RS)", record.dispatch.saleValue)}
        {field("VEHICLE NO.", record.dispatch.vehicleNo)}
        {field("DRIVER NAME", record.dispatch.driverName, "col-span-2")}
        {field("DRIVER NO.", record.dispatch.driverNo)}
      </DetailSection>

      <DetailSection title="TIME CHART">
        {field("DATE PLANNED FOR PRODUCTION", record.timeChart.plannedForProduction)}
        {field("DATE OF PRODUCTION FROM BOARDLINE", record.timeChart.productionFromBoardline)}
        {field("DATE OF PRODUCTION FROM PRINTING", record.timeChart.productionFromPrinting)}
        {field("DATE OF PRE-DISPATCH INSPECTION", record.timeChart.preDispatchInspection)}
        {field("DATE OF DISPATCH", record.timeChart.dispatch, "col-span-2")}
      </DetailSection>
    </div>
  </div>;
}

export function TraceabilitySystem() {
  const navigate = useNavigate();
  const { productionId } = useParams<{ productionId?: string }>();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [partyFilter, setPartyFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");

  const [productions, , productionsLoading] = useData<Production>("productions", [], { firmScope: "all", storageKey: "traceability-productions" });
  const [items] = useNpdItems();
  const [companies, , companiesLoading] = useData<Company>("companies", [], { firmScope: "all", storageKey: "traceability-companies" });
  const [orders, , ordersLoading] = useData<Order>("orders", [], { firmScope: "all", storageKey: "traceability-orders" });
  const [schedules, , schedulesLoading] = useData<OrderSchedule>("orders_schedule", [], { firmScope: "all", storageKey: "traceability-schedules" });
  const [processing, , processingLoading] = useData<ProductionProcessing>("production_processing", [], { firmScope: "all", storageKey: "traceability-processing" });
  const [boardline, , boardlineLoading] = useData<BoardLineQcCheck>("boardline_qc_checks", [], { firmScope: "all", storageKey: "traceability-boardline" });
  const [printing, , printingLoading] = useData<PrintingQcCheck>("printing_qc_checks", [], { firmScope: "all", storageKey: "traceability-printing" });
  const [inspections, , inspectionsLoading] = useData<PreDispatchInspection>("pre_dispatch_inspections", [], { firmScope: "all", storageKey: "traceability-pdi" });
  const [dispatchPlans, , dispatchPlansLoading] = useData<DispatchPlan>("dispatch_plans", [], { firmScope: "all", storageKey: "traceability-dispatch-plans" });
  const [loadingSlips, , loadingSlipsLoading] = useData<LoadingSlip>("loading_slips", [], { firmScope: "all", storageKey: "traceability-loading-slips" });
  const [invoices, , invoicesLoading] = useData<Invoice>("invoices", [], { firmScope: "all", storageKey: "traceability-invoices" });
  const [invoiceLineItems, , invoiceLineItemsLoading] = useData<InvoiceLineItem>("invoice_line_items", [], { firmScope: "all", storageKey: "traceability-invoice-lines" });
  const [trucks, , trucksLoading] = useData<Truck>("trucks", [], { firmScope: "all", storageKey: "traceability-trucks" });
  const [qcUpdates, , qcUpdatesLoading] = useData<QcUpdateRecord>("qc_update_records", [], { firmScope: "all", storageKey: "traceability-updates" });
  const [complaints, , complaintsLoading] = useData<QualityComplaint>("quality_complaints", [], { firmScope: "all", storageKey: "traceability-complaints" });

  const records = useMemo(() => buildTraceabilityRecords(traceabilityInputs(
    productions,
    items,
    companies,
    orders,
    schedules,
    processing,
    boardline,
    printing,
    inspections,
    dispatchPlans,
    loadingSlips,
    invoices,
    invoiceLineItems,
    trucks,
    qcUpdates,
    complaints,
  )), [boardline, complaints, companies, dispatchPlans, inspections, invoiceLineItems, invoices, items, loadingSlips, orders, printing, processing, productions, qcUpdates, schedules, trucks]);
  const filteredRecords = useMemo(() => filterTraceabilityRecords(records, search).filter((record) => (!statusFilter || record.status === statusFilter) && (!partyFilter || record.partyName === partyFilter) && (!itemFilter || record.itemName === itemFilter)), [itemFilter, partyFilter, records, search, statusFilter]);
  const selected = productionId ? records.find((record) => record.id === productionId) : undefined;
  const loading = [productionsLoading, companiesLoading, ordersLoading, schedulesLoading, processingLoading, boardlineLoading, printingLoading, inspectionsLoading, dispatchPlansLoading, loadingSlipsLoading, invoicesLoading, invoiceLineItemsLoading, trucksLoading, qcUpdatesLoading, complaintsLoading].some(Boolean);
  const parties = [...new Set(records.map((record) => record.partyName).filter(Boolean))].sort();
  const itemNames = [...new Set(records.map((record) => record.itemName).filter(Boolean))].sort();
  const statuses = [...new Set(records.map((record) => record.status))].sort();

  if (selected) return <div className="traceability-print-root"><DetailView record={selected} onBack={() => navigate("/quality/traceability")} /></div>;

  return <div className="traceability-print-root space-y-4">
    <div className="traceability-toolbar flex flex-wrap items-center justify-between gap-3 border-b-2 border-black pb-3">
      <div><h2 className="text-xl font-black uppercase tracking-tight">Traceability System</h2><p className="text-xs font-semibold text-slate-600">Search complete production and QC history by job, lot, ERP, party, or item.</p></div>
      <div className="flex items-center gap-2 rounded bg-slate-900 px-3 py-2 text-xs font-bold text-white"><FileText size={15} />{filteredRecords.length} records</div>
    </div>
    <div className="traceability-toolbar grid grid-cols-1 gap-2 rounded border-2 border-black bg-white p-3 md:grid-cols-5">
      <div className="relative md:col-span-2"><Search className="absolute left-3 top-2.5 text-slate-500" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 w-full rounded border-2 border-black pl-9 pr-3 text-sm" placeholder="Search job / lot / ERP / party / item" /></div>
      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 rounded border-2 border-black px-2 text-sm"><option value="">All Statuses</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select>
      <select value={partyFilter} onChange={(event) => setPartyFilter(event.target.value)} className="h-9 rounded border-2 border-black px-2 text-sm"><option value="">All Parties</option>{parties.map((party) => <option key={party}>{party}</option>)}</select>
      <select value={itemFilter} onChange={(event) => setItemFilter(event.target.value)} className="h-9 rounded border-2 border-black px-2 text-sm"><option value="">All Items</option>{itemNames.map((itemName) => <option key={itemName}>{itemName}</option>)}</select>
    </div>
    {loading && <div className="rounded border-2 border-blue-700 bg-blue-50 p-3 text-sm font-bold text-blue-900">Loading traceability data…</div>}
    <div className="overflow-auto rounded border-2 border-black bg-white">
      <table className="min-w-[1100px] w-full border-collapse text-xs">
        <thead><tr className="bg-[#1f4e78] text-white">{["JOB NO.", "LOT NO.", "DATE", "PARTY NAME", "ITEM NAME", "ERP CODE", "JOB STATUS", "PDI RESULT", "ACTION"].map((header) => <th key={header} className="border border-black px-2 py-2 text-center font-black">{header}</th>)}</tr></thead>
        <tbody>{filteredRecords.map((record) => <tr key={record.id} className="odd:bg-white even:bg-slate-50"><td className="border border-black p-2 font-bold">{display(record.jobNo)}</td><td className="border border-black p-2">{display(record.lotNo)}</td><td className="border border-black p-2">{display(record.planning.plannedDate)}</td><td className="border border-black p-2">{display(record.partyName)}</td><td className="border border-black p-2">{display(record.itemName)}</td><td className="border border-black p-2">{display(record.erpCode)}</td><td className="border border-black p-2 text-center"><StatusBadge status={record.status} /></td><td className="border border-black p-2 text-center">{display(record.pdi.result)}</td><td className="border border-black p-2 text-center"><button type="button" onClick={() => navigate(`/quality/traceability/${encodeURIComponent(record.id)}`)} className="inline-flex items-center gap-1 rounded bg-indigo-700 px-3 py-1.5 font-bold text-white"><FileText size={13} />View</button></td></tr>)}{!filteredRecords.length && <tr><td colSpan={9} className="p-8 text-center font-semibold">{loading ? "Loading records…" : "No traceability records match the selected filters."}</td></tr>}</tbody>
      </table>
    </div>
  </div>;
}
