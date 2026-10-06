import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { useData } from "../hooks/useData";
import { useNpdItems } from "../hooks/useNpdItems";
import { useClientPagination } from "../hooks/useClientPagination";
import { ClientPagination } from "../components/ClientPagination";
import { ExcelExport } from "../components/ExcelExport";
import type { BoardLineQcCheck, Company, Order, PrintingQcCheck } from "../types";

const COLUMNS = ["Sl No.", "ERP", "Party Name", "Item Name", "Artwork", "Spec", "Block No.", "Block Location", "File No.", "Index No", "ZONE NO.", "Sample No.", "Printing Colour 1", "Printing colour 2", "Composite GSM (+-3%) g", "Individual Layer GSM", "CS", "BS", "STACK NORMS", "WEIGHT & PACK DETAILS", "BOX WEIGHT", "BF", "PHP", "BS (PHP)", "ITEM STATUS", "Remarks", "sL.nO.", "COLOUR 1", "COLOUR 2", "TOTAL NO. OF COLOURS", "Ply", "Flute", "D1", "110"] as const;
const text = (value: unknown) => String(value ?? "").trim();
const first = (...values: unknown[]) => values.map(text).find(Boolean) || "";
const uploadHref = (value: unknown) => { const raw = text(value); if (!raw) return ""; if (/^(https?:)?\/\//i.test(raw) || /^blob:/i.test(raw)) return raw; return `/uploads/${raw.replace(/^\/?uploads\//i, "").split("/").map(encodeURIComponent).join("/")}`; };

export function QcMasterData() {
  const items = useNpdItems();
  const [orders] = useData<Order>("orders", [], { firmScope: "all", storageKey: "qc-master-orders" });
  const [companies] = useData<Company>("companies", [], { firmScope: "all" });
  const [boardChecks] = useData<BoardLineQcCheck>("boardline_qc_checks", [], { firmScope: "all", storageKey: "qc-master-board-checks" });
  const [printingChecks] = useData<PrintingQcCheck>("printing_qc_checks", [], { firmScope: "all", storageKey: "qc-master-printing-checks" });
  const [search, setSearch] = useState("");
  const [partyFilter, setPartyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [fluteFilter, setFluteFilter] = useState("");

  const rows = useMemo(() => {
    const companyById = new Map(companies.map((company) => [company.id, company.name]));
    const newest = (a: any, b: any) => text(b.updatedAt || b.updateTimestamp || b.timestamp || b.orderDate).localeCompare(text(a.updatedAt || a.updateTimestamp || a.timestamp || a.orderDate));
    const result = items.map((item: any) => {
      const erp = text(item.erp);
      const matches = (row: any) => ((erp && text(row.erp || row.erpCode) === erp) || text(row.itemId || row.npdId) === text(item.id));
      const order = orders.filter(matches).sort(newest)[0];
      const board = boardChecks.filter(matches).sort(newest)[0];
      const printing = printingChecks.filter(matches).sort(newest)[0];
      const colour1 = first(item.printingColour1, printing?.printingColor1Standard, printing?.colour1Actual);
      const colour2 = first(item.printingColour2, printing?.printingColour2Standard, printing?.colour2Actual);
      return { __id: text(item.id), "ERP": erp, "Party Name": first(order && companyById.get(order.companyId), item.customer), "Item Name": text(item.name), "Artwork": first(item.artwork, printing?.standardArtwork, board?.printingArtwork), "Spec": first(item.url, item.spec, printing?.standardBoxSize, board?.standard), "Block No.": "", "Block Location": "", "File No.": "", "Index No": "", "ZONE NO.": "", "Sample No.": first(printing?.samplingCheckNo, board?.samplingCheckNo), "Printing Colour 1": colour1, "Printing colour 2": colour2, "Composite GSM (+-3%) g": first(item.gsmLeastCost, item.gsm), "Individual Layer GSM": first(item.l1, item.f1, item.l2, item.f2, item.l3, item.f3), "CS": first(printing?.qcMasterCsSpec, printing?.csStandard, item.cuttingSize), "BS": first(printing?.qcMasterBsSpec, printing?.bsStandard, item.breadth), "STACK NORMS": "", "WEIGHT & PACK DETAILS": "", "BOX WEIGHT": first(printing?.boxWeightGrams, item.plateWeight), "BF": first(item.bf, item.b3), "PHP": "", "BS (PHP)": "", "ITEM STATUS": first(item.status, item.active, order?.status), "Remarks": first(item.remarks, order?.remarks, board?.boardlineRemarks, printing?.column40), "sL.nO.": "", "COLOUR 1": first(printing?.colour1Actual, colour1), "COLOUR 2": first(printing?.colour2Actual, colour2), "TOTAL NO. OF COLOURS": colour1 && colour2 ? 2 : colour1 ? 1 : "", "Ply": text(item.ply), "Flute": text(item.flute), "D1": "", "110": "" } as Record<string, string | number>;
    });
    const needle = search.trim().toLowerCase();
    return result.filter((row) => (!partyFilter || row["Party Name"] === partyFilter) && (!statusFilter || row["ITEM STATUS"] === statusFilter) && (!fluteFilter || row.Flute === fluteFilter) && (!needle || [row.ERP, row["Party Name"], row["Item Name"], row.Spec, row.Remarks].join(" ").toLowerCase().includes(needle)));
  }, [items, orders, companies, boardChecks, printingChecks, search, partyFilter, statusFilter, fluteFilter]);
  const options = useMemo(() => ({ parties: [...new Set(rows.map((r) => text(r["Party Name"])).filter(Boolean))].sort(), statuses: [...new Set(rows.map((r) => text(r["ITEM STATUS"])).filter(Boolean))].sort(), flutes: [...new Set(rows.map((r) => text(r.Flute)).filter(Boolean))].sort() }), [rows]);
  const { page, setPage, pageSize, setPageSize, totalItems, paginatedItems } = useClientPagination(rows, 25);
  useEffect(() => setPage(1), [search, partyFilter, statusFilter, fluteFilter, setPage]);
  const exportRows = rows.map((row) => Object.fromEntries(COLUMNS.map((column) => [column, column === "Sl No." ? "" : row[column] ?? ""])));

  return <div className="space-y-5 text-black"><div className="space-y-3 border-b border-black pb-4"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><h2 className="text-xl font-bold uppercase tracking-tight">QC Master Data</h2><div className="flex gap-2"><div className="relative w-full md:w-96"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ERP, party, item..." className="w-full rounded border border-black py-2 pl-10 pr-3 text-sm" /></div><ExcelExport data={exportRows} fileName="QC_Master_Data" /></div></div><div className="grid grid-cols-1 gap-3 md:grid-cols-4"><select value={partyFilter} onChange={(e) => setPartyFilter(e.target.value)} className="rounded border border-black p-2 text-sm"><option value="">All Parties</option>{options.parties.map((v) => <option key={v}>{v}</option>)}</select><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded border border-black p-2 text-sm"><option value="">All Statuses</option>{options.statuses.map((v) => <option key={v}>{v}</option>)}</select><select value={fluteFilter} onChange={(e) => setFluteFilter(e.target.value)} className="rounded border border-black p-2 text-sm"><option value="">All Flutes</option>{options.flutes.map((v) => <option key={v}>{v}</option>)}</select><button type="button" onClick={() => { setSearch(""); setPartyFilter(""); setStatusFilter(""); setFluteFilter(""); }} className="rounded border border-black bg-white px-3 py-2 text-sm font-bold">Clear Filters</button></div></div><div className="overflow-x-auto rounded border border-black bg-white"><table className="min-w-max border-collapse"><thead className="sticky top-0 z-10 bg-indigo-700 text-white"><tr>{COLUMNS.map((column) => <th key={column} className="border border-black px-3 py-2 text-left text-xs font-bold uppercase">{column}</th>)}</tr></thead><tbody>{paginatedItems.map((row, index) => <tr key={String(row.__id || index)} className="odd:bg-white even:bg-slate-50">{COLUMNS.map((column) => <td key={column} className={`border border-black px-3 py-2 text-sm align-top ${["Party Name", "Item Name", "Spec", "Remarks"].includes(column) ? "max-w-[320px] whitespace-normal break-words" : "whitespace-nowrap"}`}>{column === "Sl No." ? (page - 1) * pageSize + index + 1 : column === "Artwork" && uploadHref(row[column]) ? <button type="button" onClick={() => window.open(uploadHref(row[column]), "_blank", "noopener,noreferrer")} className="inline-flex items-center gap-1 rounded bg-indigo-600 px-3 py-1 font-bold text-white"><ExternalLink size={14} />View</button> : column === "Spec" && /^https?:\/\//i.test(text(row[column])) ? <button type="button" onClick={() => window.open(text(row[column]), "_blank", "noopener,noreferrer")} className="inline-flex items-center gap-1 rounded bg-indigo-600 px-3 py-1 font-bold text-white"><ExternalLink size={14} />Open</button> : row[column] ?? ""}</td>)}</tr>)}{paginatedItems.length === 0 && <tr><td colSpan={COLUMNS.length} className="px-6 py-8 text-center">No QC master records found.</td></tr>}</tbody></table></div><ClientPagination page={page} pageSize={pageSize} totalItems={totalItems} onPageChange={setPage} onPageSizeChange={setPageSize} /></div>;
}
