import { useEffect, useMemo, useState } from "react";
import { Eye, ExternalLink, Search } from "lucide-react";
import { Select } from "../components/Select";
import { useData } from "../hooks/useData";
import { useNpdItemsWithoutStock } from "../hooks/useNpdItems";
import { useClientPagination } from "../hooks/useClientPagination";
import { ClientPagination } from "../components/ClientPagination";
import { ExcelExport } from "../components/ExcelExport";
import { rowSearchText, matchesTableSearch, searchWords } from "../lib/tableSearch";
import { SortHeader, useTableSort } from "../lib/tableSort";
import type { BoardLineQcCheck, Company, Order, PrintingQcCheck, QcUpdateRecord } from "../types";

const COLUMNS = ["Sl No.", "ERP", "Party Name", "Item Name", "Artwork", "Spec", "Block No.", "Block Location", "File No.", "Index No", "ZONE NO.", "Sample No.", "Printing Colour 1", "Printing colour 2", "Composite GSM (+-3%) g", "Individual Layer GSM", "CS", "BS", "STACK NORMS", "WEIGHT & PACK DETAILS", "BOX WEIGHT", "BF", "PHP", "BS (PHP)", "ITEM STATUS", "Remarks", "sL.nO.", "COLOUR 1", "COLOUR 2", "TOTAL NO. OF COLOURS", "Ply", "Flute", "D1", "110"] as const;
const text = (value: unknown) => String(value ?? "").trim();
const LABEL = "mb-0.5 block text-[10px] font-black uppercase tracking-wide text-slate-600";
const optionList = (values: unknown[]) => [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })).map((value) => ({ value, label: value }));
const UNSORTED_COLUMNS = new Set<string>(["Sl No.", "sL.nO.", "Artwork"]);
const uploadHref = (value: unknown) => { const raw = text(value); if (!raw) return ""; if (/^(https?:)?\/\//i.test(raw) || /^blob:/i.test(raw)) return raw; return `/uploads/${raw.replace(/^\/?uploads\//i, "").split("/").map(encodeURIComponent).join("/")}`; };
type Source = "NPD" | "Orders / Company" | "Boardline QC" | "Printing QC" | "QC Update" | "Derived" | "Empty / Not Available";
type Candidate = [unknown, Source];
type MasterRow = Record<string, string | number> & { __id?: string; __isPreview?: boolean; __source: Partial<Record<string, Source>> };

const sourceValue = (...candidates: Candidate[]) => { const selected = candidates.find(([value]) => text(value)); return selected ? { value: text(selected[0]), source: selected[1] } : { value: "", source: "Empty / Not Available" as Source }; };
const sourceFill = (source: Source) => ({ NPD: "#dbeafe", "Orders / Company": "#fef3c7", "Boardline QC": "#ffedd5", "Printing QC": "#ede9fe", "QC Update": "#dcfce7", Derived: "#e5e7eb", "Empty / Not Available": undefined }[source]);
const sourceText = (source: Source) => source === "Empty / Not Available" ? "Not available" : source;

const columnBand = (column: string, header = false) => {
  if (column === "ITEM STATUS") return header ? "bg-[#24165f] text-white" : "bg-white";
  if (["ERP", "Party Name", "Item Name", "Artwork", "Spec", "Block No.", "Block Location"].includes(column)) return header ? "bg-[#0b4773] text-white" : "bg-white";
  if (["File No.", "Index No", "ZONE NO.", "Sample No."].includes(column)) return header ? "bg-[#0b4773] text-white" : "bg-white";
  if (["Composite GSM (+-3%) g", "Individual Layer GSM"].includes(column)) return header ? "bg-[#7eafd1] text-black" : "bg-white";
  if (["Printing Colour 1", "Printing colour 2", "COLOUR 1", "COLOUR 2", "TOTAL NO. OF COLOURS", "Ply", "Flute", "D1", "110"].includes(column)) return header ? "bg-[#8f82c4] text-black" : "bg-white";
  if (["BS", "STACK NORMS", "WEIGHT & PACK DETAILS", "BOX WEIGHT", "BF", "PHP", "BS (PHP)"].includes(column)) return header ? "bg-[#8f82c4] text-black" : "bg-white";
  if (column === "Remarks") return header ? "bg-[#8f82c4] text-black" : "bg-white";
  return header ? "bg-[#8f82c4] text-black" : "bg-white";
};
const columnSizing = (column: string) => {
  if (column === "Sl No.") return "w-[54px] min-w-[54px]";
  if (["Party Name", "Item Name"].includes(column)) return "w-[145px] min-w-[145px] max-w-[145px]";
  if (["Artwork", "Spec"].includes(column)) return "w-[155px] min-w-[155px] max-w-[155px]";
  if (["STACK NORMS", "WEIGHT & PACK DETAILS", "Remarks", "Individual Layer GSM"].includes(column)) return "w-[180px] min-w-[180px] max-w-[180px]";
  if (["Printing Colour 1", "Printing colour 2"].includes(column)) return "w-[112px] min-w-[112px]";
  return "w-[86px] min-w-[86px]";
};
const printingPill = (value: unknown) => { const label = text(value); if (!label) return null; const normalized = label.toLowerCase(); const styles = normalized.includes("red") ? "bg-[#c00000] text-white" : normalized.includes("blue") ? "bg-[#075aaa] text-white" : normalized.includes("black") ? "bg-[#3f3f3f] text-white" : normalized.includes("green") ? "bg-[#8bc34a] text-black" : normalized.includes("brown") ? "bg-[#8a4b08] text-white" : "bg-[#d9dde2] text-black"; return <span title={label} aria-label={`Printing colour: ${label}`} className={`inline-flex max-w-full items-center justify-center rounded-full px-3 py-0.5 text-[10px] font-extrabold uppercase leading-none shadow-sm ${styles}`}>{label}</span>; };

export function QcMasterData() {
  const items = useNpdItemsWithoutStock();
  const [orders] = useData<Order>("orders", [], { firmScope: "all", storageKey: "qc-master-orders" });
  const [companies] = useData<Company>("companies", [], { firmScope: "all" });
  const [boardChecks] = useData<BoardLineQcCheck>("boardline_qc_checks", [], { firmScope: "all", storageKey: "qc-master-board-checks" });
  const [printingChecks] = useData<PrintingQcCheck>("printing_qc_checks", [], { firmScope: "all", storageKey: "qc-master-printing-checks" });
  const [qcUpdates] = useData<QcUpdateRecord>("qc_update_records", [], { firmScope: "all", storageKey: "qc-master-updates" });
  const [search, setSearch] = useState("");
  const [partyFilter, setPartyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [fluteFilter, setFluteFilter] = useState("");
  const [erpFilter, setErpFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [plyFilter, setPlyFilter] = useState("");

  const allRows = useMemo<MasterRow[]>(() => {
    const companyById = new Map(companies.map((company) => [company.id, company.name]));
    const newest = (a: any, b: any) => text(b.updatedAt || b.updateTimestamp || b.timestamp || b.orderDate).localeCompare(text(a.updatedAt || a.updateTimestamp || a.timestamp || a.orderDate));
    const result = items.map((item: any) => {
      const erp = text(item.erp);
      const matches = (row: any) => ((erp && text(row.erp || row.erpCode) === erp) || text(row.itemId || row.npdId) === text(item.id));
      const order = orders.filter(matches).sort(newest)[0];
      const board = boardChecks.filter(matches).sort(newest)[0];
      const printing = printingChecks.filter(matches).sort(newest)[0];
      const latestUpdate = qcUpdates.filter((update) => text(update.npdId) === text(item.id) || (erp && text(update.erpNo).toLowerCase() === erp.toLowerCase())).sort(newest)[0];
      const cells: Record<string, string | number> = {};
      const sources: Partial<Record<string, Source>> = {};
      const put = (column: string, selected: { value: string; source: Source }) => { cells[column] = selected.value; sources[column] = selected.source; };
      put("ERP", sourceValue([item.erp, "NPD"]));
      put("Party Name", sourceValue([order && companyById.get(order.companyId), "Orders / Company"], [item.customer, "NPD"]));
      put("Item Name", sourceValue([item.name, "NPD"]));
      put("Artwork", sourceValue([item.artwork, "NPD"], [printing?.standardArtwork, "Printing QC"], [board?.printingArtwork, "Boardline QC"]));
      put("Spec", sourceValue([item.url || item.spec, "NPD"], [printing?.standardBoxSize, "Printing QC"], [board?.standard, "Boardline QC"]));
      put("Block No.", sourceValue());
      put("Block Location", sourceValue());
      put("File No.", sourceValue([latestUpdate?.fileNo, "QC Update"]));
      put("Index No", sourceValue([latestUpdate?.indexNo, "QC Update"]));
      put("ZONE NO.", sourceValue([latestUpdate?.zoneNo, "QC Update"]));
      put("Sample No.", sourceValue([latestUpdate?.sampleNo, "QC Update"], [printing?.samplingCheckNo, "Printing QC"], [board?.samplingCheckNo, "Boardline QC"]));
      put("Printing Colour 1", sourceValue([item.printingColour1, "NPD"], [printing?.printingColor1Standard, "Printing QC"], [printing?.colour1Actual, "Printing QC"]));
      put("Printing colour 2", sourceValue([item.printingColour2, "NPD"], [printing?.printingColour2Standard, "Printing QC"], [printing?.colour2Actual, "Printing QC"]));
      put("Composite GSM (+-3%) g", sourceValue([item.gsmLeastCost || item.gsm, "NPD"]));
      put("Individual Layer GSM", sourceValue([[item.l1, item.f1, item.l2, item.f2, item.l3, item.f3].filter((value: unknown) => text(value)).join(" / "), "NPD"]));
      put("CS", sourceValue([printing?.qcMasterCsSpec || printing?.csStandard, "Printing QC"], [item.cuttingSize, "NPD"]));
      put("BS", sourceValue([printing?.qcMasterBsSpec || printing?.bsStandard, "Printing QC"], [item.breadth, "NPD"]));
      put("STACK NORMS", sourceValue([item.stackHeight, "NPD"]));
      put("WEIGHT & PACK DETAILS", sourceValue([item.weightPackDetails, "NPD"], [item.weightAndPackDetails, "NPD"], [item.weightAndPackingDetails, "NPD"], [item.calculatedWeightPerBox, "NPD"], [item.standardWeightGms, "NPD"], [item.materialWeightInsideInOneBox, "NPD"]));
      put("BOX WEIGHT", sourceValue([printing?.boxWeightGrams, "Printing QC"], [item.plateWeight, "NPD"]));
      put("BF", sourceValue([item.bf || item.b3, "NPD"]));
      put("PHP", sourceValue());
      put("BS (PHP)", sourceValue());
      put("ITEM STATUS", sourceValue([item.status || item.active, "NPD"], [order?.status, "Orders / Company"]));
      put("Remarks", sourceValue([item.remarks, "NPD"], [order?.remarks, "Orders / Company"], [board?.boardlineRemarks, "Boardline QC"], [printing?.column40, "Printing QC"]));
      put("sL.nO.", sourceValue());
      put("COLOUR 1", sourceValue([printing?.colour1Actual, "Printing QC"], [item.printingColour1, "NPD"]));
      put("COLOUR 2", sourceValue([printing?.colour2Actual, "Printing QC"], [item.printingColour2, "NPD"]));
      const colourCount = cells["Printing Colour 1"] && cells["Printing colour 2"] ? 2 : cells["Printing Colour 1"] ? 1 : "";
      put("TOTAL NO. OF COLOURS", { value: String(colourCount), source: colourCount ? "Derived" : "Empty / Not Available" });
      put("Ply", sourceValue([item.ply, "NPD"]));
      put("Flute", sourceValue([item.flute, "NPD"]));
      put("D1", sourceValue());
      put("110", sourceValue());
      return { __id: text(item.id), __isPreview: Boolean(order || board || printing || latestUpdate), ...cells, __source: sources };
    });
    return result;
  }, [items, orders, companies, boardChecks, printingChecks, qcUpdates]);
  // Visible table columns as shown: Sl No. and the Artwork view button are skipped, Spec links show as an Open button.
  const searchIndex = useMemo(() => new Map(allRows.map((row) => [row, rowSearchText(COLUMNS.filter((column) => column !== "Sl No." && column !== "Artwork").map((column) => column === "Spec" && /^https?:\/\//i.test(text(row[column])) ? "" : row[column]))])), [allRows]);
  const rows = useMemo<MasterRow[]>(() => {
    const words = searchWords(search);
    return allRows.filter((row) => (!erpFilter || text(row.ERP) === erpFilter) && (!partyFilter || text(row["Party Name"]) === partyFilter) && (!itemFilter || text(row["Item Name"]) === itemFilter) && (!statusFilter || text(row["ITEM STATUS"]) === statusFilter) && (!plyFilter || text(row.Ply) === plyFilter) && (!fluteFilter || text(row.Flute) === fluteFilter) && matchesTableSearch(searchIndex.get(row) || "", words));
  }, [allRows, searchIndex, search, erpFilter, partyFilter, itemFilter, statusFilter, plyFilter, fluteFilter]);
  const { sorted: sortedRows, sort, toggle: toggleSort } = useTableSort(rows, (row, key) => key === "Spec" && /^https?:\/\//i.test(text(row[key])) ? "" : row[key]);
  const options = useMemo(() => ({ erps: optionList(allRows.map((r) => r.ERP)), parties: optionList(allRows.map((r) => r["Party Name"])), items: optionList(allRows.map((r) => r["Item Name"])), statuses: optionList(allRows.map((r) => r["ITEM STATUS"])), plies: optionList(allRows.map((r) => r.Ply)), flutes: optionList(allRows.map((r) => r.Flute)) }), [allRows]);
  const hasFilters = Boolean(search.trim() || erpFilter || partyFilter || itemFilter || statusFilter || plyFilter || fluteFilter);
  const clearFilters = () => { setSearch(""); setErpFilter(""); setPartyFilter(""); setItemFilter(""); setStatusFilter(""); setPlyFilter(""); setFluteFilter(""); };
  const { page, setPage, pageSize, setPageSize, totalItems, paginatedItems } = useClientPagination(sortedRows, 25);
  useEffect(() => setPage(1), [search, erpFilter, partyFilter, itemFilter, statusFilter, plyFilter, fluteFilter, setPage]);
  const exportRows = rows.map((row) => Object.fromEntries(COLUMNS.map((column) => [column, column === "Sl No." ? "" : row[column] ?? ""])));

  return <div className="space-y-4 text-black"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-black pb-3"><h2 className="text-xl font-bold uppercase tracking-tight text-black">QC Master Data</h2><ExcelExport data={exportRows} fileName="QC_Master_Data" /></div>
    <div data-mf-panel="true" className="space-y-3 rounded border border-black bg-white p-3">
      <div className="relative w-full"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded border-2 border-black bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600" /></div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
        <div className="min-w-0"><span className={LABEL}>ERP</span><Select compact value={erpFilter} onChange={setErpFilter} options={options.erps} placeholder="All" /></div>
        <div className="min-w-0"><span className={LABEL}>Party</span><Select compact value={partyFilter} onChange={setPartyFilter} options={options.parties} placeholder="All" /></div>
        <div className="min-w-0"><span className={LABEL}>Item</span><Select compact value={itemFilter} onChange={setItemFilter} options={options.items} placeholder="All" /></div>
        <div className="min-w-0"><span className={LABEL}>Item Status</span><Select compact value={statusFilter} onChange={setStatusFilter} options={options.statuses} placeholder="All" /></div>
        <div className="min-w-0"><span className={LABEL}>Ply</span><Select compact value={plyFilter} onChange={setPlyFilter} options={options.plies} placeholder="All" /></div>
        <div className="min-w-0"><span className={LABEL}>Flute</span><Select compact value={fluteFilter} onChange={setFluteFilter} options={options.flutes} placeholder="All" /></div>
      </div>
      <div data-mf-actions="true" className="flex justify-end gap-2">
        {hasFilters ? <button type="button" onClick={clearFilters} className="h-[34px] rounded border-2 border-black bg-white px-3 text-xs font-bold text-black hover:bg-slate-100">Clear</button> : null}
        <button type="button" data-mf-apply="true" className="h-[34px] rounded border-2 border-indigo-700 bg-indigo-700 px-4 text-xs font-bold text-white md:hidden">Apply</button>
      </div>
    </div>
    <div className="overflow-x-auto rounded border border-black bg-white"><table className="min-w-max border-collapse text-[10px] leading-tight"><thead><tr>{COLUMNS.map((column) => <th key={column} className={columnBand(column, true) + " " + columnSizing(column) + " border border-black px-2 py-2 text-center align-middle text-[10px] font-extrabold uppercase tracking-tight"}>{UNSORTED_COLUMNS.has(column) ? column : <SortHeader label={column} sortKey={column} sort={sort} onToggle={toggleSort} align="center" />}</th>)}</tr></thead><tbody>{paginatedItems.map((row, index) => <tr key={String(row.__id || index)} className={row.__isPreview ? "text-gray-700" : ""}>{COLUMNS.map((column) => { const isPrintingColour = column === "Printing Colour 1" || column === "Printing colour 2"; const value = row[column]; const source: Source = column === "Sl No." ? "Derived" : row.__source[column] || "Empty / Not Available"; const fill = sourceFill(source); const label = column === "Sl No." ? String((page - 1) * pageSize + index + 1) : text(value) || "Not available"; const metadata = `${column}: ${label} | Source: ${sourceText(source)}`; return <td key={column} title={metadata} aria-label={metadata} style={fill ? { backgroundColor: fill } : undefined} className={columnBand(column) + " " + columnSizing(column) + " border border-black px-2 py-2 align-middle text-center font-semibold " + (["Party Name", "Item Name", "Spec", "Remarks", "Individual Layer GSM", "STACK NORMS", "WEIGHT & PACK DETAILS"].includes(column) ? "whitespace-normal break-words" : "whitespace-nowrap")}>{column === "Sl No." ? (page - 1) * pageSize + index + 1 : isPrintingColour ? printingPill(value) : column === "Artwork" && uploadHref(value) ? <button type="button" onClick={() => window.open(uploadHref(value), "_blank", "noopener,noreferrer")} title="View" aria-label="View" className="inline-flex items-center gap-1 rounded bg-[#075aaa] px-2 py-1 text-[10px] font-extrabold text-white"><Eye size={12} /></button> : column === "Spec" && /^https?:\/\//i.test(text(value)) ? <button type="button" onClick={() => window.open(text(value), "_blank", "noopener,noreferrer")} className="inline-flex items-center gap-1 rounded bg-[#075aaa] px-2 py-1 text-[10px] font-extrabold text-white"><ExternalLink size={12} />Open</button> : value ?? ""}</td>; })}</tr>)}{paginatedItems.length === 0 && <tr><td colSpan={COLUMNS.length} className="h-16" aria-label="No records" /></tr>}</tbody></table></div><ClientPagination page={page} pageSize={pageSize} totalItems={totalItems} onPageChange={setPage} onPageSizeChange={setPageSize} /></div>;
}