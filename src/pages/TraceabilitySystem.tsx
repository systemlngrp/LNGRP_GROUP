import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ExternalLink, FileText, Search, X } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useData } from "../hooks/useData";
import { useNpdItems } from "../hooks/useNpdItems";
import type {
  BoardLineQcCheck,
  Company,
  DispatchPlan,
  Invoice,
  InvoiceLineItem,
  Item,
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

const EMPTY_TRACEABILITY_RECORD: TraceabilityRecord = {
  id: "",
  productionId: "",
  firmName: "",
  jobNo: "",
  lotNo: "",
  lotNumbers: [],
  itemName: "",
  partyName: "",
  erpCode: "",
  status: "JOB OPEN",
  planning: {
    planQuantity: "",
    plannedDate: "",
    jobWeightKg: "",
    realizationPerKg: "",
    customerSpecification: "",
    customerArtwork: "",
  },
  boardline: {
    quantityProducedPcs: "",
    paperRequiredKg: "",
    paperUsedKg: "",
    paperWastagePercent: "",
    boardWastagePcs: "",
    boardWastagePercent: "",
    qcExecutive: "",
    rapc: "",
    cuttingSizeMm: "",
    ups: "",
    ply: "",
    flute: "",
    paperSpec: "",
    sizeLxWxHmm: "",
    plannedPaper: "",
    lineIncharge: "",
    sheetPlantRequiredSize: "",
    sheetPlantProducedSize: "",
    sheetPlantProducedSizeDr: "",
    cuttingSizeProduced: "",
    typeOfFluteProduced: "",
    bgsmAchieved: "",
    boardThicknessAchieved: "",
    sheetWeightGramsAchieved: "",
    moistureAchieved: "",
  },
  converting: {
    quantityProduced: "",
    sizeAchieved: "",
    boardThicknessAchieved: "",
    printingColourRequired: "",
    printingColourIdentified: "",
    boxWeightGrams: "",
    standardCsKg: "",
    achievedCsKg: "",
    standardBsKg: "",
    achievedBsKg: "",
    operatorIncharge: "",
    qcInspector: "",
  },
  pdi: {
    boxSizeRequired: "",
    boxSizeAchieved: "",
    csAchievedRequired: "",
    bgsmAchieved: "",
    boxWeightAchievedGrams: "",
    artworkCheck: "",
    printingColorCheck: "",
    boxSquaringCheck: "",
    flapGapCheck: "",
    jointPastingDelaminationCheck: "",
    remarks: "",
    frontPhoto: "",
    backPhoto: "",
    qcInspector: "",
    result: "",
  },
  dispatch: {
    plannedQuantity: "",
    dispatchQuantity: "",
    dispatchDate: "",
    invoiceNo: "",
    rate: "",
    saleValue: "",
    vehicleNo: "",
    driverName: "",
    driverNo: "",
  },
  timeChart: {
    plannedForProduction: "",
    productionFromBoardline: "",
    productionFromPrinting: "",
    preDispatchInspection: "",
    dispatch: "",
  },
  searchText: "",
};

type SheetField = {
  label: string;
  value: ReactNode;
  span?: number;
  link?: boolean;
  className?: string;
  valueClassName?: string;
};

function spanStyle(span = 1): CSSProperties {
  const safeSpan = Math.max(1, Math.min(6, span));
  return { gridColumn: `span ${safeSpan} / span ${safeSpan}` };
}

function LinkValue({ value, label = "Open" }: { value: unknown; label?: string }) {
  if (!isLink(value)) return <>{display(value)}</>;
  return <a href={text(value)} target="_blank" rel="noopener noreferrer" className="traceability-link"><ExternalLink size={12} />{label}</a>;
}

function SheetRow({ fields }: { fields: SheetField[] }) {
  return <>
    <div className="traceability-sheet-row traceability-label-row">
      {fields.map((field) => <div key={field.label} style={spanStyle(field.span)} className={`traceability-sheet-cell traceability-label-cell ${field.className || ""}`}>{field.label}</div>)}
    </div>
    <div className="traceability-sheet-row traceability-value-row">
      {fields.map((field) => {
        const plainValue = typeof field.value === "string" || typeof field.value === "number" ? display(field.value) : field.value;
        return <div key={field.label} style={spanStyle(field.span)} className={`traceability-sheet-cell traceability-value-cell ${field.valueClassName || ""}`}>{field.link ? <LinkValue value={field.value} /> : plainValue}</div>;
      })}
    </div>
  </>;
}

function SheetSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="traceability-section"><div className="traceability-section-title">{title}</div>{children}</section>;
}

function StatusBadge({ status }: { status: TraceabilityRecord["status"] }) {
  const color = status === "JOB OPEN" ? "traceability-status-open" : status === "JOB CLOSED" ? "traceability-status-closed" : "traceability-status-cancelled";
  return <span className={`traceability-status-badge ${color}`}>{status}</span>;
}

function PdiResultBadge({ result }: { result: string }) {
  const normalized = text(result).toUpperCase();
  const color = normalized === "QC PASS" ? "traceability-status-open" : normalized === "QC FAIL" ? "traceability-status-cancelled" : "traceability-status-pending";
  return <span className={`traceability-status-badge ${color}`}>{display(result)}</span>;
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

function LotSearchInput({
  query,
  onQueryChange,
  suggestions,
  loading,
  onSelect,
  onClear,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  suggestions: TraceabilityRecord[];
  loading: boolean;
  onSelect: (record: TraceabilityRecord) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const visible = focused;
  const hasNoMatches = visible && !loading && Boolean(query.trim()) && suggestions.length === 0;

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [query]);

  const choose = (record: TraceabilityRecord) => {
    onSelect(record);
    setFocused(false);
    setHighlightedIndex(-1);
  };

  return <div className="traceability-lot-search">
    <Search className="traceability-lot-search-icon" size={18} aria-hidden="true" />
    <input
      ref={inputRef}
      value={query}
      onChange={(event) => { onQueryChange(event.target.value); setFocused(true); }}
      onFocus={() => setFocused(true)}
      onBlur={() => window.setTimeout(() => setFocused(false), 120)}
      onKeyDown={(event) => {
        if (event.key === "Escape") { setFocused(false); return; }
        if (event.key === "ArrowDown" && suggestions.length) { event.preventDefault(); setHighlightedIndex((index) => (index + 1) % suggestions.length); return; }
        if (event.key === "ArrowUp" && suggestions.length) { event.preventDefault(); setHighlightedIndex((index) => (index - 1 + suggestions.length) % suggestions.length); return; }
        if (event.key === "Enter" && highlightedIndex >= 0 && suggestions[highlightedIndex]) { event.preventDefault(); choose(suggestions[highlightedIndex]); }
      }}
      role="combobox"
      aria-label="Search traceability by lot number, job number, ERP code, party, or item"
      aria-autocomplete="list"
      aria-expanded={visible}
      aria-controls="traceability-lot-results"
      placeholder="Search lot no."
      className="traceability-lot-input"
    />
    {query && <button type="button" aria-label="Clear traceability lot search" onMouseDown={(event) => event.preventDefault()} onClick={onClear} className="traceability-lot-clear"><X size={17} /></button>}
    {visible && <div id="traceability-lot-results" role="listbox" className="traceability-lot-results">
      {suggestions.map((record, index) => <button key={record.id} type="button" role="option" aria-selected={index === highlightedIndex} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(record)} className={`traceability-search-result ${index === highlightedIndex ? "is-highlighted" : ""}`}>
        <div className="traceability-search-result-top"><strong>{display(record.lotNo || record.jobNo)}</strong><StatusBadge status={record.status} /></div>
        <div className="traceability-search-result-meta"><span>Job: {display(record.jobNo)}</span><span>{display(record.partyName)}</span><span>{display(record.itemName)}</span></div>
      </button>)}
      {hasNoMatches && <div className="traceability-search-empty">No matching records.</div>}
      {!query.trim() && !loading && suggestions.length === 0 && <div className="traceability-search-empty">No non-cancelled jobs available.</div>}
      {loading && <div className="traceability-search-empty">Loading traceability records…</div>}
    </div>}
  </div>;
}

function DetailView({
  record,
  onClear,
  notFound,
  query,
  onQueryChange,
  suggestions,
  loading,
  onSelect,
}: {
  record?: TraceabilityRecord;
  onClear: () => void;
  notFound: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  suggestions: TraceabilityRecord[];
  loading: boolean;
  onSelect: (record: TraceabilityRecord) => void;
}) {
  const data = record || EMPTY_TRACEABILITY_RECORD;
  const [showPlannedPaper, setShowPlannedPaper] = useState(true);
  const field = (label: string, value: TraceabilityValue | ReactNode, span?: number, options: Omit<SheetField, "label" | "value" | "span"> = {}) => ({ label, value, span, ...options });

  useEffect(() => {
    setShowPlannedPaper(true);
  }, [record?.id]);

  const paperModeLabel = showPlannedPaper ? "PLANNED PAPER" : "LINE - INCHARGE";
  const paperModeValue = showPlannedPaper ? data.boardline.plannedPaper : data.boardline.lineIncharge;

  return <div className="traceability-detail">
    {notFound && <div className="traceability-not-found">Traceability record not found. Search by job number, lot number, ERP code, party, or item.</div>}
    <div className="traceability-sheet-scroll">
      <div className="traceability-sheet">
        <div className={`traceability-company-header ${showPlannedPaper ? "is-planned-paper" : "is-line-incharge"}`}>
          <span>{display(data.firmName || "LAXMI NARAYAN CORRUGATED BOARDS LLP.")}</span>
          <button
            type="button"
            className="traceability-mode-toggle"
            aria-label={showPlannedPaper ? "Showing planned paper. Click to show line in charge." : "Showing line in charge. Click to show planned paper."}
            aria-pressed={showPlannedPaper}
            onClick={() => setShowPlannedPaper((current) => !current)}
          >
            <span aria-hidden="true" className="traceability-mode-checkbox">{showPlannedPaper ? "✓" : ""}</span>
          </button>
        </div>
        <div className="traceability-document-title">TRACEABILITY SYSTEM</div>

        <section className="traceability-identity">
          <div className="traceability-identity-top">
            <div className="traceability-identity-cell traceability-identity-label">LOT NO.</div>
            <div className="traceability-identity-cell traceability-identity-lot">
              <LotSearchInput query={query} onQueryChange={onQueryChange} suggestions={suggestions} loading={loading} onSelect={onSelect} onClear={onClear} />
            </div>
            <div className="traceability-identity-spacer" />
            <div className="traceability-identity-cell traceability-identity-status-label">JOB STATUS</div>
            <div className="traceability-identity-cell traceability-identity-status-value">{record ? <StatusBadge status={data.status} /> : "—"}</div>
          </div>
          <div className="traceability-identity-row"><div className="traceability-identity-row-label">ITEM NAME</div><div className="traceability-identity-row-value">{display(data.itemName)}</div></div>
          <div className="traceability-identity-row"><div className="traceability-identity-row-label">PARTY NAME</div><div className="traceability-identity-row-value">{display(data.partyName)}</div></div>
          <div className="traceability-identity-row"><div className="traceability-identity-row-label">ERP CODE</div><div className="traceability-identity-row-value">{display(data.erpCode)}</div></div>
        </section>

        <SheetSection title="PLANNING INFORMATION">
          <SheetRow fields={[
            field("PLAN QUANTITY (PCS)", data.planning.planQuantity),
            field("PLANNED DATE OF PRODUCTION", data.planning.plannedDate),
            field("JOB WEIGHT (KG)", data.planning.jobWeightKg),
            field("CALCULATED REALIZATION / KG", data.planning.realizationPerKg),
            field("CUSTOMER SPECIFICATION", data.planning.customerSpecification, 1, { link: true }),
            field("CUSTOMER ARTWORK", data.planning.customerArtwork, 1, { link: true }),
          ]} />
        </SheetSection>

        <SheetSection title="BOARDLINE INFORMATION">
          <SheetRow fields={[
            field("QUANTITY PRODUCED (PCS)", data.boardline.quantityProducedPcs),
            field("PAPER REQUIRED (KG)", data.boardline.paperRequiredKg),
            field("PAPER USED (KG)", data.boardline.paperUsedKg),
            field("PAPER WASTAGE (%)", data.boardline.paperWastagePercent),
            field("BOARD WASTAGE (PCS)", data.boardline.boardWastagePcs),
            field("BOARD WASTAGE (%)", data.boardline.boardWastagePercent),
          ]} />
          <SheetRow fields={[
            field("QC EXECUTIVE", data.boardline.qcExecutive),
            field("RAPC", data.boardline.rapc),
            field("CUTTING SIZE (MM)", data.boardline.cuttingSizeMm),
            field("UPS", data.boardline.ups),
            field("PLY", data.boardline.ply),
            field("FLUTE", data.boardline.flute),
          ]} />
          <SheetRow fields={[
            field("PAPER SPEC", data.boardline.paperSpec),
            field("SIZE (L X W X H) MM", data.boardline.sizeLxWxHmm),
            field(paperModeLabel, paperModeValue),
            field("SHEET PLANT REQUIRED SIZE (FLAP - HEIGHT - FLAP) MM", data.boardline.sheetPlantRequiredSize),
            field("SHEET PLANT PRODUCED SIZE - OP (FLAP - HEIGHT - FLAP) MM", data.boardline.sheetPlantProducedSize),
            field("SHEET PLANT PRODUCED SIZE - DR (FLAP - HEIGHT - FLAP) MM", data.boardline.sheetPlantProducedSizeDr),
          ]} />
          <SheetRow fields={[
            field("CUTTING SIZE PRODUCED (MM)", data.boardline.cuttingSizeProduced),
            field("TYPE OF FLUTE PRODUCED", data.boardline.typeOfFluteProduced),
            field("B.GSM ACHIEVED", data.boardline.bgsmAchieved),
            field("BOARD THICKNESS ACHIEVED", data.boardline.boardThicknessAchieved),
            field("SHEET WEIGHT (GRAMS) ACHIEVED", data.boardline.sheetWeightGramsAchieved),
            field("MOISTURE ACHIEVED", data.boardline.moistureAchieved),
          ]} />
        </SheetSection>

        <SheetSection title="CONVERTING INFORMATION">
          <SheetRow fields={[
            field("QUANTITY PRODUCED", data.converting.quantityProduced),
            field("SIZE (L X W X H) ACHIEVED", data.converting.sizeAchieved),
            field("BOARD THICKNESS ACHIEVED", data.converting.boardThicknessAchieved),
            field("PRINTING COLOUR REQUIRED", data.converting.printingColourRequired),
            field("PRINTING COLOUR IDENTIFIED", data.converting.printingColourIdentified),
            field("BOX WEIGHT ACHIEVED (GRAMS)", data.converting.boxWeightGrams),
          ]} />
          <SheetRow fields={[
            field("STANDARD CS (KG)", data.converting.standardCsKg),
            field("ACHIEVED CS (KG)", data.converting.achievedCsKg),
            field("STANDARD BS (KG/CM2)", data.converting.standardBsKg),
            field("ACHIEVED BS (KG/CM2)", data.converting.achievedBsKg),
            field("OPERATOR-INCHARGE", data.converting.operatorIncharge, 1, { valueClassName: "traceability-operator-value" }),
            field("QC INSPECTOR", data.converting.qcInspector, 1, { valueClassName: "traceability-inspector-value" }),
          ]} />
        </SheetSection>

        <SheetSection title="PRE-DISPATCH INSPECTION REPORT">
          <SheetRow fields={[
            field("BOX SIZE REQUIRED (MM)", data.pdi.boxSizeRequired),
            field("BOX SIZE ACHIEVED (MM)", data.pdi.boxSizeAchieved),
            field("CS ACHIEVED / CS REQUIRED (KG)", data.pdi.csAchievedRequired),
            field("B.GSM ACHIEVED", data.pdi.bgsmAchieved),
            field("BOX WEIGHT ACHIEVED (GRAMS)", data.pdi.boxWeightAchievedGrams, 2),
          ]} />
          <SheetRow fields={[
            field("ARTWORK CHECK (APPROVED ARTWORK)", data.pdi.artworkCheck),
            field("PRINTING COLOR CHECK (VISUAL)", data.pdi.printingColorCheck),
            field("BOX SQUARING CHECK (VISUAL)", data.pdi.boxSquaringCheck),
            field("FLAP GAP CHECK (VISUAL)", data.pdi.flapGapCheck),
            field("JOINT PASTING / DELAMINATION CHECK", data.pdi.jointPastingDelaminationCheck),
            field("REMARKS (IF ANY)", data.pdi.remarks),
          ]} />
          <SheetRow fields={[
            field("BOX PHOTO [FRONT]", data.pdi.frontPhoto, 1, { link: true }),
            field("BOX PHOTO [BACK]", data.pdi.backPhoto, 1, { link: true }),
            field("QC INSPECTOR", data.pdi.qcInspector, 2),
            field("PDI RESULT", record ? <PdiResultBadge result={data.pdi.result} /> : "—", 2, { valueClassName: "traceability-pdi-value" }),
          ]} />
        </SheetSection>

        <SheetSection title="DISPATCH DETAILS">
          <SheetRow fields={[
            field("PLANNED QUANTITY (PCS)", data.dispatch.plannedQuantity),
            field("DISPATCH QUANTITY (PCS)", data.dispatch.dispatchQuantity),
            field("DISPATCH DATE", data.dispatch.dispatchDate),
            field("INVOICE NO.", data.dispatch.invoiceNo),
            field("RATE", data.dispatch.rate),
            field("SALE VALUE (RS)", data.dispatch.saleValue),
          ]} />
          <SheetRow fields={[
            field("VEHICLE NO.", data.dispatch.vehicleNo),
            field("DRIVER NAME", data.dispatch.driverName, 3),
            field("DRIVER NO.", data.dispatch.driverNo, 2),
          ]} />
        </SheetSection>

        <SheetSection title="TIME CHART">
          <SheetRow fields={[
            field("DATE PLANNED FOR PRODUCTION", data.timeChart.plannedForProduction),
            field("DATE OF PRODUCTION FROM BOARDLINE", data.timeChart.productionFromBoardline),
            field("DATE OF PRODUCTION FROM PRINTING", data.timeChart.productionFromPrinting),
            field("DATE OF PRE-DISPATCH INSPECTION", data.timeChart.preDispatchInspection),
            field("DATE OF DISPATCH", data.timeChart.dispatch, 2),
          ]} />
        </SheetSection>
      </div>
    </div>
  </div>;
}

function SearchToolbar({
  query,
  onQueryChange,
  suggestions,
  loading,
  selected,
  onSelect,
  onClear,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  suggestions: TraceabilityRecord[];
  loading: boolean;
  selected?: TraceabilityRecord;
  onSelect: (record: TraceabilityRecord) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const visible = focused && Boolean(query.trim());
  const hasNoMatches = visible && !loading && suggestions.length === 0;

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [query]);

  const choose = (record: TraceabilityRecord) => {
    onSelect(record);
    setFocused(false);
    setHighlightedIndex(-1);
  };

  return <div className="traceability-search-toolbar">
    <div className="traceability-search-heading"><div><div className="traceability-search-title">Traceability System</div><div className="traceability-search-subtitle">Search by job number, lot number, ERP code, party, or item.</div></div>{selected && <div className="traceability-selected-job"><FileText size={15} />{display(selected.jobNo)}</div>}</div>
    <div className="traceability-search-combobox">
      <Search className="traceability-search-icon" size={18} />
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => { onQueryChange(event.target.value); setFocused(true); }}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        onKeyDown={(event) => {
          if (event.key === "Escape") { setFocused(false); return; }
          if (event.key === "ArrowDown" && suggestions.length) { event.preventDefault(); setHighlightedIndex((index) => (index + 1) % suggestions.length); return; }
          if (event.key === "ArrowUp" && suggestions.length) { event.preventDefault(); setHighlightedIndex((index) => (index - 1 + suggestions.length) % suggestions.length); return; }
          if (event.key === "Enter" && highlightedIndex >= 0 && suggestions[highlightedIndex]) { event.preventDefault(); choose(suggestions[highlightedIndex]); }
        }}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls="traceability-search-results"
        placeholder="Search job / lot / ERP / party / item"
        className="traceability-search-input"
      />
      {query && <button type="button" aria-label="Clear traceability search" onMouseDown={(event) => event.preventDefault()} onClick={onClear} className="traceability-search-clear"><X size={17} /></button>}
      {visible && <div id="traceability-search-results" role="listbox" className="traceability-search-results">
        {suggestions.map((record, index) => <button key={record.id} type="button" role="option" aria-selected={index === highlightedIndex} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(record)} className={`traceability-search-result ${index === highlightedIndex ? "is-highlighted" : ""}`}>
          <div className="traceability-search-result-top"><strong>{display(record.jobNo)}</strong><StatusBadge status={record.status} /></div>
          <div className="traceability-search-result-meta"><span>Lot: {display(record.lotNo)}</span><span>{display(record.partyName)}</span><span>{display(record.itemName)}</span></div>
        </button>)}
        {hasNoMatches && <div className="traceability-search-empty">No matching records.</div>}
        {loading && <div className="traceability-search-empty">Loading traceability records…</div>}
      </div>}
    </div>
    <div className="traceability-search-hint">{loading ? "Loading data…" : query ? `${suggestions.length} matching record${suggestions.length === 1 ? "" : "s"}` : "Start typing to search traceability records"}</div>
  </div>;
}

export function TraceabilitySystem() {
  const navigate = useNavigate();
  const { productionId } = useParams<{ productionId?: string }>();
  const [search, setSearch] = useState("");

  const [productions, , productionsLoading] = useData<Production>("productions", [], { firmScope: "all", storageKey: "traceability-productions" });
  const items = useNpdItems();
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
  const selected = productionId ? records.find((record) => record.id === productionId) : undefined;
  const suggestions = useMemo(() => filterTraceabilityRecords(records, search), [records, search]);
  const loading = [productionsLoading, companiesLoading, ordersLoading, schedulesLoading, processingLoading, boardlineLoading, printingLoading, inspectionsLoading, dispatchPlansLoading, loadingSlipsLoading, invoicesLoading, invoiceLineItemsLoading, trucksLoading, qcUpdatesLoading, complaintsLoading].some(Boolean);
  const notFound = Boolean(productionId && !selected && !loading);

  useEffect(() => {
    if (selected) setSearch(selected.lotNo || selected.jobNo);
    else if (!productionId) setSearch("");
  }, [productionId, selected?.id, selected?.jobNo]);

  const selectRecord = (record: TraceabilityRecord) => {
    setSearch(record.lotNo || record.jobNo);
    navigate(`/quality/traceability/${encodeURIComponent(record.id)}`);
  };
  const clearSelection = () => {
    setSearch("");
    navigate("/quality/traceability");
  };

  return <div className="traceability-print-root traceability-page">
    <DetailView record={selected} onClear={clearSelection} notFound={notFound} query={search} onQueryChange={setSearch} suggestions={suggestions} loading={loading} onSelect={selectRecord} />
  </div>;
}
