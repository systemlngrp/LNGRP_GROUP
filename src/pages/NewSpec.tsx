import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, Search } from "lucide-react";
import { useData } from "../hooks/useData";
import { useNpdItems } from "../hooks/useNpdItems";
import { Select } from "../components/Select";
import { findLinkedItemByErp } from "../lib/linkedLoading";
import { buildNpdCardPdf, getNpdCardPdfFileName } from "../lib/npdCardPdf";
import { normalizeOrderCatalogItem } from "../lib/orderItems";
import { resolveNpdFileNo } from "../lib/npdFileNo";
import type { QcUpdateRecord, Setting } from "../types";

type Row = Record<string, any>;
const text = (value: unknown) => String(value ?? "").trim();
const value = (row: Row | null | undefined, ...keys: string[]) => {
  for (const key of keys) if (row?.[key] !== null && row?.[key] !== undefined && row?.[key] !== "") return text(row[key]);
  return "-";
};
const dim = (row: Row, ...keys: string[]) => keys.map((key) => value(row, key)).join(" x ");

function Cell({ label, children, className = "" }: { label?: string; children: React.ReactNode; className?: string }) {
  return <div className={`min-h-14 border border-black px-2 py-2 ${className}`}><div className="text-[10px] font-black uppercase leading-tight text-slate-600">{label}</div><div className="mt-1 break-words text-sm font-bold leading-tight text-black">{children}</div></div>;
}
function Bar({ children, className = "bg-yellow-300 text-black" }: { children: React.ReactNode; className?: string }) {
  return <div className={`border border-black px-3 py-2 text-center text-sm font-black uppercase ${className}`}>{children}</div>;
}
function Table({ headers, rows, headerClass = "bg-slate-200" }: { headers: string[]; rows: string[][]; headerClass?: string }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[700px] border-collapse text-xs"><thead className={headerClass}><tr>{headers.map((header) => <th key={header} className="border border-black px-2 py-2 text-center font-black uppercase">{header}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((item, cellIndex) => <td key={cellIndex} className="border border-black px-2 py-2 text-center font-bold">{item || "-"}</td>)}</tr>)}</tbody></table></div>;
}

export function NewSpec() {
  const npdItems = useNpdItems();
  const [phpRows] = useData<any>("php_item_master", []);
  const [plateRows] = useData<any>("plate_item_master", []);
  const [qcUpdates] = useData<QcUpdateRecord>("qc_update_records", [], { firmScope: "all" });
  const [settings] = useData<Setting>("settings", []);
  const [erp, setErp] = useState("");
  const [status, setStatus] = useState<"idle" | "generating">("idle");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [phpRow, setPhpRow] = useState<Row | null>(null);
  const [plateRow, setPlateRow] = useState<Row | null>(null);
  const [fileNo, setFileNo] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("NPD_Card.pdf");
  const downloadUrlRef = useRef<string | null>(null);
  const phpItems = useMemo(() => phpRows.map((row: any) => normalizeOrderCatalogItem(row, "PHP")).filter(Boolean), [phpRows]);
  const plateItems = useMemo(() => plateRows.map((row: any) => normalizeOrderCatalogItem(row, "PLATE")).filter(Boolean), [plateRows]);
  const erpOptions = useMemo(() => npdItems
    .map((item) => {
      const erpCode = text(item.erp);
      const itemName = text(item.name);
      const customer = text(item.customer);
      return {
        value: erpCode,
        label: `${erpCode} - ${itemName || "Unnamed item"}`,
        searchText: `${erpCode} ${itemName} ${customer}`,
      };
    })
    .filter((option) => option.value)
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })), [npdItems]);

  useEffect(() => () => { if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current); }, []);

  const showSpec = async () => {
    const normalizedErp = erp.trim();
    if (!normalizedErp) return setMessage("Enter an ERP code to show the specification.");
    const item = npdItems.find((row) => text(row.erp).toLowerCase() === normalizedErp.toLowerCase());
    if (!item) return setMessage(`ERP ${normalizedErp} was not found in the item master.`);
    setMessage(""); setStatus("generating");
    try {
      const npdRow = item as unknown as Row;
      const nextPhp = (findLinkedItemByErp(phpItems as any, normalizedErp)?.raw || null) as Row | null;
      const nextPlate = (findLinkedItemByErp(plateItems as any, normalizedErp)?.raw || null) as Row | null;
      const nextFileNo = resolveNpdFileNo(npdRow, qcUpdates);
      const doc = await buildNpdCardPdf({ npdRow, phpRow: nextPhp, plateRow: nextPlate, qcFileNo: nextFileNo, setting: settings[0] || null });
      const nextUrl = URL.createObjectURL(doc.output("blob"));
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
      downloadUrlRef.current = nextUrl;
      setDownloadUrl(nextUrl); setDownloadName(getNpdCardPdfFileName(npdRow));
      setSelected(npdRow); setPhpRow(nextPhp); setPlateRow(nextPlate); setFileNo(nextFileNo);
    } catch (error) {
      console.error("Failed to generate specification PDF:", error);
      setMessage("Unable to generate the specification PDF. Please try again.");
    } finally { setStatus("idle"); }
  };

  const downloadSpec = () => { if (!downloadUrl) return; const link = document.createElement("a"); link.href = downloadUrl; link.download = downloadName; link.click(); };
  const issueDate = new Date().toLocaleDateString("en-GB");
  const colours = selected ? [value(selected, "printingColour1"), value(selected, "printingColour2")].filter((item) => item !== "-").join(" / ") || "-" : "-";
  const layerRows = selected ? [
    ["Top Layer", value(selected, "psL1", "l1"), value(selected, "psL1Bf", "b3")],
    ["Fluting 1 A FLUTING", value(selected, "psF1", "f1"), value(selected, "psF1Bf")],
    ["Backing 1 A BACKING", value(selected, "psL2", "l2"), value(selected, "psL2Bf")],
    ["Fluting 2 B FLUTING", value(selected, "psF2", "f2"), value(selected, "psF2Bf")],
    ["Backing 2 B BACKING", "-", "-"],
  ] : [];

  return <div className="mx-auto max-w-6xl space-y-5 pb-8 text-black">
    <div className="border-b-2 border-black pb-4"><h2 className="text-xl font-black uppercase tracking-tight">New Spec</h2></div>
    <section className="space-y-2"><div className="grid grid-cols-1 items-end gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]"><label htmlFor="new-spec-erp" className="min-w-0 text-xs font-black uppercase tracking-wide text-slate-700">ERP<Select id="new-spec-erp" value={erp} onChange={(value) => { setErp(value); if (message) setMessage(""); }} options={erpOptions} placeholder="Search ERP, item name, or customer" compact wrapLabels noOptionsMessage="No matching ERP items" /></label><button type="button" onClick={() => void showSpec()} disabled={status === "generating"} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded border-2 border-slate-900 bg-cyan-700 px-5 py-2 text-sm font-black uppercase text-white transition hover:bg-cyan-800 disabled:cursor-wait disabled:opacity-60 lg:w-auto"><Search size={17} />{status === "generating" ? "Preparing..." : "Search"}</button><button type="button" onClick={downloadSpec} disabled={!downloadUrl || status === "generating"} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded border-2 border-slate-900 bg-slate-950 px-5 py-2 text-sm font-black uppercase text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 lg:w-auto"><Download size={17} />Download</button></div>{message ? <p className="text-sm font-bold text-red-700" role="alert">{message}</p> : null}</section>
    {selected ? <section className="overflow-hidden rounded-xl border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
      <div className="flex flex-col border-b-2 border-black sm:flex-row"><div className="w-full border-b-2 border-black bg-yellow-50 p-3 text-xl font-black sm:w-[20%] sm:border-b-0 sm:border-r-2">FILE NO.-<div className="mt-3 text-2xl">{fileNo || "-"}</div></div><div className="flex min-h-32 flex-1 flex-col items-center justify-center border-b-2 border-black p-3 text-center sm:border-b-0 sm:border-r-2"><div className="text-2xl font-black text-slate-700">LAXMI NARAYAN</div><div className="mt-2 text-sm font-black uppercase">Laxmi Narayan Corrugated Boards LLP</div></div><div className="w-full bg-amber-50 p-3 text-center font-black sm:w-[34%]">Special Remarks<div className="mt-5 min-h-12 font-bold">{value(selected, "specialRemarks", "remarks")}</div></div></div>
      <div className="grid grid-cols-1 border-b-2 border-black sm:grid-cols-[20%_1fr_20%_1fr]"><Cell label="Sample No." className="bg-amber-50">ERP - {value(selected, "erp")}</Cell><Cell label="ERP" className="text-center text-xl">{value(selected, "erp")}</Cell><Cell label="Issue Date" className="bg-amber-50">{issueDate}</Cell><Cell label="Document / Revision">{value(selected, "url", "URL", "link", "driveLink")}<span className="ml-2 text-[10px]">Rev.No./Date - 01/25.02.26</span></Cell></div>
      <div className="p-3"><Bar>Specification Sheet - CFB</Bar>
        <div className="grid grid-cols-1 border-x border-black md:grid-cols-[1.5fr_1fr]"><Cell label="Item Name" className="min-h-20">{value(selected, "itemName", "name")}</Cell><Cell label="Party Name" className="min-h-20">{value(selected, "customerName", "customer")}</Cell></div>
        <div className="grid grid-cols-1 border-x border-black md:grid-cols-2"><Cell label="Box Dimension (ID)">{dim(selected, "lengthId", "breadthId", "heightId")}</Cell><Cell label="Reel Deckle / Size">{value(selected, "deckleSize", "reelSize")} / {value(selected, "reelSize")}</Cell><Cell label="Rotary Dimension (OD)">{dim(selected, "lengthOd", "breadthOd", "heightOd")}</Cell><Cell label="Cutting Length">{value(selected, "cuttingSize", "cuttingWithTrimming")}</Cell></div>
        <Table headers={["Specification", "Value", "Specification", "Value", "Specification", "Value"]} rows={[
          ["NO. OF PLY", value(selected, "ply"), "FLUTING %", "B-37% / A-45%", "CAL. BOX WEIGHT", value(selected, "calculatedWeightPerBox", "standardWeightGms")],
          ["FLAP", value(selected, "flapSize", "flap"), "CREASING TYPE", "M/F", "QTY. PER BUNDLE", value(selected, "qtyPerBundle")],
          ["TRIMMING", "16", "PRINTING COLOUR", colours, "NO. OF COLOUR", colours === "-" ? "-" : colours.split("/").length.toString()],
          ["REQUIRED BS", value(selected, "bsKgCm2Calculated", "bsKgCm2Std"), "FLUTE", value(selected, "fluteType", "flute"), "BOX TYPE", value(selected, "boxType")],
          ["REQUIRED BOARD GSM", value(selected, "standardBGsm", "calculatedBGsm", "gsmLeastCost"), "CAL. BGSM", value(selected, "calculatedBGsm", "standardBGsm"), "TOP", value(selected, "topPaperShade")],
          ["REQUIRED CS", value(selected, "csKgTarget", "csKgStd"), "TARGET CS", value(selected, "rapc"), "BOTTOM", value(selected, "backingPaperShade")],
        ]} />
        <div className="mt-3"><Bar className="bg-slate-700 text-white">Layers / GSM / BF / UPS</Bar><Table headers={["Layers", "GSM", "BF", "1 UPS", "2 UPS", "3 UPS", "4 UPS", "5 UPS"]} rows={layerRows.map((row) => [...row, ...[1, 2, 3, 4, 5].map((ups) => ups === Number(value(selected, "ups", "noOfUps")) && row[0].startsWith("Backing 1") ? "X" : "-")])} /></div>
        <div className="mt-3"><div className="grid grid-cols-2"><Bar>PHP</Bar><Bar className="bg-amber-600 text-white">Plate</Bar></div><div className="grid grid-cols-1 border-x border-black lg:grid-cols-2"><div><Table headers={["Length", "Width", "Height"]} rows={[[value(phpRow, "length"), value(phpRow, "breadth", "width"), value(phpRow, "height")]]} /><Table headers={["Ply", "BS", "Holes L", "Holes W", "Qty/Box", "Flute"]} rows={[[value(phpRow, "noOfPly"), value(phpRow, "brustingStrengthReq"), value(phpRow, "holesOrientationL", "numberOfHolesInPhp"), value(phpRow, "holesOrientationW"), value(phpRow, "numberOfSetsPerBox"), value(phpRow, "fluteType")]]} /></div><Table headers={["Type", "ERP", "Length", "Width", "Ply", "Flute", "BS", "Qty/Box"]} headerClass="bg-amber-300" rows={[[value(plateRow, "typeOfPlate"), value(plateRow, "erpItemCode", "erp"), value(plateRow, "length"), value(plateRow, "breadth", "width"), value(plateRow, "noOfPly"), value(plateRow, "fluteType"), value(plateRow, "brustingStrengthReq"), value(plateRow, "numberOfSetsPerBox")]]} /></div></div>
        <div className="mt-3 grid grid-cols-1 border border-black md:grid-cols-3"><Cell label="Remarks" className="min-h-20 md:col-span-2">{value(selected, "specialRemarks", "remarks")}</Cell><Cell label="Creaser / Plate Notes" className="min-h-20">CREASER<br />Z PLATE / U PLATE / O PLATE</Cell></div>
        <div className="mt-3"><Table headers={["Revision", "Description of revision", "Reason for Revision"]} rows={[["4 / 2/25/2026", "Auto calculated sheet weight / B.S. GSM added.", "For better accuracy."]]} /><div className="grid grid-cols-1 border-x border-b border-black sm:grid-cols-3"><Cell>PREPARED BY</Cell><Cell className="text-blue-700">MASTER COPY</Cell><Cell className="text-red-700">APPROVED BY</Cell></div></div>
        <div className="mt-4 border-t-2 border-black pt-3"><span className="text-xs font-bold text-slate-500">Generated from NPD Master</span></div>
      </div>
    </section> : null}
  </div>;
}
