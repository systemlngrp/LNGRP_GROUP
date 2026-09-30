import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useData } from "../hooks/useData";
import { useNpdItems } from "../hooks/useNpdItems";
import { ExcelExport } from "../components/ExcelExport";
import type { BoardLineQcCheck, Company, Order, PrintingQcCheck } from "../types";

const COLUMNS = [
  "ERP", "Party Name", "Item Name", "Artwork", "Spec", "Block No.", "Block Location", "File No.", "Index No", "ZONE NO.", "Sample No.",
  "Printing Colour 1", "Printing colour 2", "Composite GSM (+-3%) g", "Individual Layer GSM", "CS", "BS", "STACK NORMS", "WEIGHT & PACK DETAILS", "BOX WEIGHT", "BF", "PHP", "BS (PHP)", "ITEM STATUS", "Remarks", "sL.nO.", "COLOUR 1", "COLOUR 2", "TOTAL NO. OF COLOURS", "Ply", "Flute", "D1", "110",
] as const;

const text = (value: unknown) => String(value ?? "").trim();
const first = (...values: unknown[]) => values.map(text).find(Boolean) || "";

export function QcMasterData() {
  const items = useNpdItems();
  const [orders] = useData<Order>("orders", [], { firmScope: "all", storageKey: "qc-master-orders" });
  const [companies] = useData<Company>("companies", [], { firmScope: "all" });
  const [boardChecks] = useData<BoardLineQcCheck>("boardline_qc_checks", [], { firmScope: "all", storageKey: "qc-master-board-checks" });
  const [printingChecks] = useData<PrintingQcCheck>("printing_qc_checks", [], { firmScope: "all", storageKey: "qc-master-printing-checks" });
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const companyById = new Map(companies.map((company) => [company.id, company.name]));
    const result = items.map((item: any) => {
      const erp = text(item.erp);
      const relatedOrders = orders.filter((order) => text(order.erpCode) === erp || order.itemId === item.id);
      const order = relatedOrders[0];
      const relatedBoard = boardChecks.filter((check) => text(check.erp) === erp).sort((a, b) => text(b.timestamp).localeCompare(text(a.timestamp)))[0];
      const relatedPrinting = printingChecks.filter((check) => text(check.erp) === erp).sort((a, b) => text(b.timestamp).localeCompare(text(a.timestamp)))[0];
      const color1 = first(item.printingColour1, relatedPrinting?.printingColor1Standard, relatedPrinting?.colour1Actual);
      const color2 = first(item.printingColour2, relatedPrinting?.printingColour2Standard, relatedPrinting?.colour2Actual);
      const row: Record<string, string | number> = {
        "ERP": erp, "Party Name": first(order && companyById.get(order.companyId), item.customer), "Item Name": text(item.name),
        "Artwork": first(item.artwork, relatedPrinting?.standardArtwork, relatedBoard?.printingArtwork), "Spec": first(item.spec, relatedPrinting?.standardBoxSize, relatedBoard?.standard),
        "Block No.": "", "Block Location": "", "File No.": "", "Index No": "", "ZONE NO.": "", "Sample No.": first(relatedPrinting?.samplingCheckNo, relatedBoard?.samplingCheckNo),
        "Printing Colour 1": color1, "Printing colour 2": color2, "Composite GSM (+-3%) g": first(item.gsmLeastCost, item.gsm),
        "Individual Layer GSM": first(item.l1, item.f1, item.l2, item.f2, item.l3, item.f3), "CS": first(relatedPrinting?.qcMasterCsSpec, relatedPrinting?.csStandard, item.cuttingSize),
        "BS": first(relatedPrinting?.qcMasterBsSpec, relatedPrinting?.bsStandard, item.breadth), "STACK NORMS": "", "WEIGHT & PACK DETAILS": "",
        "BOX WEIGHT": first(relatedPrinting?.boxWeightGrams, item.plateWeight), "BF": first(item.bf, item.b3), "PHP": "", "BS (PHP)": "",
        "ITEM STATUS": first(item.active, order?.status), "Remarks": first(order?.remarks, relatedBoard?.boardlineRemarks), "sL.nO.": "",
        "COLOUR 1": first(relatedPrinting?.colour1Actual, color1), "COLOUR 2": first(relatedPrinting?.colour2Actual, color2),
        "TOTAL NO. OF COLOURS": color1 && color2 ? 2 : color1 ? 1 : "", "Ply": text(item.ply), "Flute": text(item.flute), "D1": "", "110": "",
      };
      return row;
    });
    const needle = search.trim().toLowerCase();
    return needle ? result.filter((row) => [row["ERP"], row["Party Name"], row["Item Name"], row["Spec"], row["Remarks"]].join(" ").toLowerCase().includes(needle)) : result;
  }, [items, orders, companies, boardChecks, printingChecks, search]);

  return <div className="space-y-5 text-black">
    <div className="flex flex-col gap-3 border-b border-black pb-4 md:flex-row md:items-center md:justify-between">
      <h2 className="text-xl font-bold uppercase tracking-tight">QC Master Data</h2>
      <div className="flex gap-2"><div className="relative w-full md:w-96"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ERP, party, item..." className="w-full rounded border border-black py-2 pl-10 pr-3 text-sm" /></div><ExcelExport data={rows.map((row) => Object.fromEntries(COLUMNS.map((column) => [column, row[column] ?? ""])))} fileName="QC_Master_Data" /></div>
    </div>
    <div className="overflow-x-auto rounded border border-black bg-white"><table className="min-w-max border-collapse"><thead className="sticky top-0 z-10 bg-indigo-700 text-white"><tr>{COLUMNS.map((column) => <th key={column} className="border border-black px-3 py-2 text-left text-xs font-bold whitespace-nowrap">{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.ERP}-${index}`} className="odd:bg-white even:bg-slate-50">{COLUMNS.map((column) => <td key={column} className="border border-black px-3 py-2 text-sm whitespace-nowrap">{row[column] ?? ""}</td>)}</tr>)}{rows.length === 0 && <tr><td colSpan={COLUMNS.length} className="px-6 py-8 text-center">No QC master records found.</td></tr>}</tbody></table></div>
  </div>;
}
