import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, Eye } from "lucide-react";
import { useData } from "../hooks/useData";
import { useNpdItems } from "../hooks/useNpdItems";
import { findLinkedItemByErp } from "../lib/linkedLoading";
import { buildNpdCardPdf, getNpdCardPdfFileName } from "../lib/npdCardPdf";
import { normalizeOrderCatalogItem } from "../lib/orderItems";
import { resolveNpdFileNo } from "../lib/npdFileNo";
import type { QcUpdateRecord, Setting } from "../types";

type Row = Record<string, any>;
const text = (value: unknown) => String(value ?? "").trim();
const display = (row: Row | null | undefined, ...keys: string[]) => {
  for (const key of keys) if (row?.[key] !== null && row?.[key] !== undefined && row?.[key] !== "") return text(row[key]);
  return "-";
};
const dimensions = (row: Row, ...keys: string[]) => keys.map((key) => display(row, key)).join(" × ");

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded border border-slate-300 bg-slate-50 p-3"><div className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 break-words text-sm font-bold text-slate-950">{value}</div></div>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="overflow-hidden rounded-lg border-2 border-slate-900 bg-white"><h3 className="bg-cyan-800 px-4 py-3 text-sm font-black uppercase tracking-wide text-white">{title}</h3><div className="p-3">{children}</div></section>;
}
function Grid({ children }: { children: React.ReactNode }) { return <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">{children}</div>; }

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

  useEffect(() => () => { if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current); }, []);
  const phpItems = useMemo(() => phpRows.map((row: any) => normalizeOrderCatalogItem(row, "PHP")).filter(Boolean), [phpRows]);
  const plateItems = useMemo(() => plateRows.map((row: any) => normalizeOrderCatalogItem(row, "PLATE")).filter(Boolean), [plateRows]);

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
      downloadUrlRef.current = nextUrl; setDownloadUrl(nextUrl); setDownloadName(getNpdCardPdfFileName(npdRow));
      setSelected(npdRow); setPhpRow(nextPhp); setPlateRow(nextPlate); setFileNo(nextFileNo);
    } catch (error) {
      console.error("Failed to generate specification PDF:", error);
      setMessage("Unable to generate the specification PDF. Please try again.");
    } finally { setStatus("idle"); }
  };

  const downloadSpec = () => { if (!downloadUrl) return; const link = document.createElement("a"); link.href = downloadUrl; link.download = downloadName; link.click(); };
  const colours = selected ? [display(selected, "printingColour1"), display(selected, "printingColour2")].filter((item) => item !== "-").join(" / ") || "-" : "-";

  return <div className="mx-auto max-w-6xl space-y-5 pb-8">
    <div className="border-b-2 border-black pb-4"><h2 className="text-xl font-black uppercase tracking-tight text-slate-950">New Spec</h2><p className="mt-1 text-sm font-semibold text-slate-600">Enter an ERP code to view the specification and download its A4 PDF.</p></div>
    <section className="rounded-xl border-2 border-slate-900 bg-white p-5 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]"><label htmlFor="new-spec-erp" className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-700">ERP Code</label><div className="flex flex-col gap-3 sm:flex-row"><input id="new-spec-erp" value={erp} onChange={(event) => { setErp(event.target.value); if (message) setMessage(""); }} onKeyDown={(event) => { if (event.key === "Enter") void showSpec(); }} placeholder="Enter ERP code" autoComplete="off" className="min-h-11 flex-1 rounded border-2 border-slate-900 px-3 text-sm font-bold uppercase outline-none focus:border-cyan-700 focus:ring-2 focus:ring-cyan-200" /><button type="button" onClick={() => void showSpec()} disabled={status === "generating"} className="inline-flex min-h-11 items-center justify-center gap-2 rounded border-2 border-slate-900 bg-cyan-700 px-5 py-2 text-sm font-black uppercase text-white transition hover:bg-cyan-800 disabled:cursor-wait disabled:opacity-60"><Eye size={17} />{status === "generating" ? "Preparing..." : "Show Spec"}</button></div>{message ? <p className="mt-3 text-sm font-bold text-red-700" role="alert">{message}</p> : null}</section>
    {selected ? <div className="space-y-4 rounded-xl border-2 border-slate-900 bg-slate-100 p-3 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
      <div className="flex flex-col gap-3 rounded-lg border-2 border-slate-900 bg-white p-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-black uppercase tracking-wide text-slate-500">Specification Sheet - CFB</p><h3 className="mt-1 text-xl font-black text-slate-950">{display(selected, "itemName", "name")}</h3></div><button type="button" onClick={downloadSpec} disabled={!downloadUrl} className="inline-flex min-h-11 items-center justify-center gap-2 rounded border-2 border-slate-900 bg-slate-950 px-5 py-2 text-sm font-black uppercase text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"><Download size={17} />Download PDF</button></div>
      <Section title="Document Details"><Grid><Detail label="File No." value={fileNo || "-"} /><Detail label="ERP" value={display(selected, "erp")} /><Detail label="Sample No." value={`ERP - ${display(selected, "erp")}`} /><Detail label="Issue Date" value={new Date().toLocaleDateString("en-GB")} /><Detail label="Firm" value={display(selected, "firmName")} /><Detail label="Special Remarks" value={display(selected, "specialRemarks", "remarks")} /></Grid></Section>
      <Section title="Item and Board Specification"><Grid><Detail label="Item Name" value={display(selected, "itemName", "name")} /><Detail label="Customer / Party" value={display(selected, "customerName", "customer")} /><Detail label="Box Dimension (ID)" value={dimensions(selected, "lengthId", "breadthId", "heightId")} /><Detail label="Rotary Dimension (OD)" value={dimensions(selected, "lengthOd", "breadthOd", "heightOd")} /><Detail label="Cutting Size" value={display(selected, "cuttingSize", "cuttingWithTrimming")} /><Detail label="No. of Ply" value={display(selected, "ply")} /><Detail label="Flute" value={display(selected, "fluteType", "flute")} /><Detail label="Box Type" value={display(selected, "boxType")} /><Detail label="Flap" value={display(selected, "flapSize", "flap")} /><Detail label="Required CS" value={display(selected, "csKgTarget", "csKgStd")} /><Detail label="Required BS" value={display(selected, "bsKgCm2Calculated", "bsKgCm2Std")} /><Detail label="Required Board GSM" value={display(selected, "standardBGsm", "calculatedBGsm", "gsmLeastCost")} /><Detail label="Top Shade" value={display(selected, "topPaperShade")} /><Detail label="Backing Shade" value={display(selected, "backingPaperShade")} /><Detail label="Printing Colours" value={colours} /></Grid></Section>
      <Section title="Paper Layers and UPS"><Grid><Detail label="Top Layer" value={`${display(selected, "psL1", "l1")} / BF ${display(selected, "psL1Bf", "b3")}`} /><Detail label="Fluting 1" value={`${display(selected, "psF1", "f1")} / BF ${display(selected, "psF1Bf")}`} /><Detail label="Backing 1" value={`${display(selected, "psL2", "l2")} / BF ${display(selected, "psL2Bf")}`} /><Detail label="Fluting 2" value={`${display(selected, "psF2", "f2")} / BF ${display(selected, "psF2Bf")}`} /><Detail label="UPS" value={display(selected, "ups", "noOfUps")} /><Detail label="Qty. per Bundle" value={display(selected, "qtyPerBundle")} /></Grid></Section>
      <Section title="PHP and Plate"><div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><div><h4 className="mb-2 text-xs font-black uppercase text-cyan-800">PHP</h4><Grid><Detail label="Length" value={display(phpRow, "length")} /><Detail label="Width" value={display(phpRow, "breadth", "width")} /><Detail label="Height" value={display(phpRow, "height")} /><Detail label="Ply" value={display(phpRow, "noOfPly")} /><Detail label="Flute" value={display(phpRow, "fluteType")} /><Detail label="Qty / Box" value={display(phpRow, "numberOfSetsPerBox")} /></Grid></div><div><h4 className="mb-2 text-xs font-black uppercase text-amber-700">Plate</h4><Grid><Detail label="Plate Type" value={display(plateRow, "typeOfPlate")} /><Detail label="ERP" value={display(plateRow, "erpItemCode", "erp")} /><Detail label="Length" value={display(plateRow, "length")} /><Detail label="Width" value={display(plateRow, "breadth", "width")} /><Detail label="Ply" value={display(plateRow, "noOfPly")} /><Detail label="Flute" value={display(plateRow, "fluteType")} /><Detail label="BS" value={display(plateRow, "brustingStrengthReq")} /><Detail label="Qty / Box" value={display(plateRow, "numberOfSetsPerBox")} /></Grid></div></div></Section>
    </div> : null}
  </div>;
}
