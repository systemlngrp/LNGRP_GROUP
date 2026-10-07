import React, { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useData } from "../hooks/useData";
import { useNpdItems } from "../hooks/useNpdItems";
import { findLinkedItemByErp } from "../lib/linkedLoading";
import { downloadNpdCardPdf } from "../lib/npdCardPdf";
import { normalizeOrderCatalogItem } from "../lib/orderItems";
import type { Setting } from "../types";

export function NewSpec() {
  const npdItems = useNpdItems();
  const [phpRows] = useData<any>("php_item_master", []);
  const [plateRows] = useData<any>("plate_item_master", []);
  const [settings] = useData<Setting>("settings", []);
  const [erp, setErp] = useState("");
  const [status, setStatus] = useState<"idle" | "downloading">("idle");
  const [message, setMessage] = useState("");

  const phpItems = useMemo(
    () => phpRows.map((row: any) => normalizeOrderCatalogItem(row, "PHP")).filter(Boolean),
    [phpRows]
  );
  const plateItems = useMemo(
    () => plateRows.map((row: any) => normalizeOrderCatalogItem(row, "PLATE")).filter(Boolean),
    [plateRows]
  );

  const downloadSpec = async () => {
    const normalizedErp = erp.trim();
    if (!normalizedErp) {
      setMessage("Enter an ERP code to download the specification.");
      return;
    }

    const item = npdItems.find((row) => String(row.erp || "").trim().toLowerCase() === normalizedErp.toLowerCase());
    if (!item) {
      setMessage(`ERP ${normalizedErp} was not found in the item master.`);
      return;
    }

    setMessage("");
    setStatus("downloading");
    try {
      const phpItem = findLinkedItemByErp(phpItems as any, normalizedErp);
      const plateItem = findLinkedItemByErp(plateItems as any, normalizedErp);
      await downloadNpdCardPdf({
        npdRow: item as any,
        phpRow: phpItem?.raw || null,
        plateRow: plateItem?.raw || null,
        setting: settings[0] || null,
      });
    } catch (error) {
      console.error("Failed to download specification PDF:", error);
      setMessage("Unable to download the specification PDF. Please try again.");
    } finally {
      setStatus("idle");
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="border-b-2 border-black pb-4">
        <h2 className="text-xl font-black uppercase tracking-tight text-slate-950">New Spec</h2>
        <p className="mt-1 text-sm font-semibold text-slate-600">Enter an ERP code to download the A4 specification sheet.</p>
      </div>

      <section className="rounded-xl border-2 border-slate-900 bg-white p-5 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
        <label htmlFor="new-spec-erp" className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-700">ERP Code</label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="new-spec-erp"
            value={erp}
            onChange={(event) => { setErp(event.target.value); if (message) setMessage(""); }}
            onKeyDown={(event) => { if (event.key === "Enter") void downloadSpec(); }}
            placeholder="Enter ERP code"
            autoComplete="off"
            className="min-h-11 flex-1 rounded border-2 border-slate-900 px-3 text-sm font-bold uppercase outline-none focus:border-cyan-700 focus:ring-2 focus:ring-cyan-200"
          />
          <button
            type="button"
            onClick={() => void downloadSpec()}
            disabled={status === "downloading"}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded border-2 border-slate-900 bg-cyan-700 px-5 py-2 text-sm font-black uppercase text-white transition hover:bg-cyan-800 disabled:cursor-wait disabled:opacity-60"
          >
            <Download size={17} />
            {status === "downloading" ? "Preparing PDF..." : "Download Spec"}
          </button>
        </div>
        {message ? <p className="mt-3 text-sm font-bold text-red-700" role="alert">{message}</p> : null}
      </section>
    </div>
  );
}
